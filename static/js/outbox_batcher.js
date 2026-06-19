/**
 * OutboxBatcher — модуль для батчинга отправки данных на сервер.
 *
 * Заменяет немедленные fetch-вызовы в saveActivityToDB и enqueueOfflineSuccess
 * на накопление данных в activity_outbox / success_outbox с последующей
 * периодической отправкой батчей.
 *
 * Два типа заданий:
 *   urgent — отправляется немедленно (минуя таймер)
 *   deferred — отправляется по таймеру (каждые BATCH_INTERVAL_MS) или при достижении лимита
 *
 * Использование:
 *   OutboxBatcher.enqueueActivity({ type, count, leadTimeMs, ... })
 *   OutboxBatcher.enqueueSuccess(payload)
 *   OutboxBatcher.flushAll()  // принудительная отправка всего outbox
 */
(function () {
  if (window.OutboxBatcher) return;

  const BATCH_INTERVAL_MS = 300000; // 300 секунд (5 минут) между батчами
  const MAX_BATCH_SIZE = 20; // макс. количество записей в одном батче

  const TAG = '[OutboxBatcher]';

  const state = {
    activityTimerId: null,
    successTimerId: null,
    pendingActivityCount: 0,
    pendingSuccessCount: 0,
    flushing: false,
  };

  /** Проверить, авторизован ли пользователь */
  function _hasToken() {
    return !!(window.UM?.token || localStorage.getItem('jwt_token'));
  }

  /** Получить токен */
  function _getToken() {
    return window.UM?.token || localStorage.getItem('jwt_token');
  }

  // ======================== ACTIVITY OUTBOX ========================

  /**
   * Добавить активность в outbox (deferred — по таймеру).
   * @param {Object} params
   * @param {string} params.type - 'perfect' | 'corrected' | 'audio'
   * @param {number} params.count - количество (обычно 1)
   * @param {number} params.leadTimeMs - время работы над предложением
   * @param {number} params.dictationId - ID диктанта
   * @param {string} params.date - дата YYYYMMDD
   * @param {string} [params.dictationLanguageCode] - код языка
   * @param {any} [params.selectedSentencePositions] - выбранные позиции предложений
   */
  async function enqueueActivity(params) {
    console.log(TAG, '[1] enqueueActivity: вход', { type: params?.type, dictationId: params?.dictationId });
    try {
      const {
        type,
        count = 1,
        leadTimeMs = 0,
        dictationId,
        date,
        dictationLanguageCode,
        selectedSentencePositions,
      } = params || {};

      if (!dictationId || !type) {
        console.warn(TAG, '[1a] enqueueActivity: пропущено (нет dictationId или type)', { dictationId, type });
        return false;
      }

      console.log(TAG, `[1b] enqueueActivity: type=${type} count=${count} dictationId=${dictationId} lang=${dictationLanguageCode}`);

      const userId = _getUserId();
      if (!userId) {
        console.warn(TAG, '[1c] enqueueActivity: пропущено (нет userId)');
        return false;
      }

      const dateId = date || _getLocalDateId();
      const selPosStr = _serializeSelectedPositions(selectedSentencePositions);
      const key = `${userId}:${dateId}:${dictationId}:${selPosStr}`;

      console.log(TAG, `[1d] enqueueActivity: userId=${userId} dateId=${dateId} key=${key}`);

      // Увеличиваем pending-счётчик ДО записи в IndexedDB, чтобы даже при ошибке
      // записи счётчик был учтён в getQueueInfo(). Если запись не удалась,
      // счётчик будет скорректирован при следующем flush.
      state.pendingActivityCount += 1;
      console.log(TAG, `[1e] enqueueActivity: pendingActivityCount увеличен => ${state.pendingActivityCount}`);

      // Читаем существующую запись или создаём новую
      console.log(TAG, `[1f] enqueueActivity: idbGet activity_outbox key=${key}`);
      const existing = (await window.IdbManager.idbGet('activity_outbox', key)) || {
        key,
        userId,
        date: dateId,
        dictation_id: dictationId,
        selected_sentence_positions: selectedSentencePositions || null,
        perfect_count: 0,
        corrected_count: 0,
        audio_count: 0,
        lead_time_ms_total: 0,
        dictation_language_code: dictationLanguageCode || null,
        updatedAt: 0,
      };

      const n = Number(count) || 0;
      if (type === 'perfect') existing.perfect_count += n;
      if (type === 'corrected') existing.corrected_count += n;
      if (type === 'audio') existing.audio_count += n;

      existing.lead_time_ms_total = (Number(existing.lead_time_ms_total) || 0) + (Number(leadTimeMs) || 0);
      existing.dictation_language_code = dictationLanguageCode || existing.dictation_language_code;
      existing.updatedAt = Date.now();

      console.log(TAG, `[1g] enqueueActivity: idbPut activity_outbox key=${key} perfect=${existing.perfect_count} corrected=${existing.corrected_count} audio=${existing.audio_count}`);
      await window.IdbManager.idbPut('activity_outbox', existing);

      console.log(TAG, `[1h] enqueueActivity: сохранено в IndexedDB (key=${key}), pending=${state.pendingActivityCount}`);
      _scheduleActivityFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[1err] enqueueActivity: ошибка', e);
      return false;
    }
  }

  /**
   * Добавить активность как urgent — отправляется немедленно.
   * Если отправка не удалась, падает в deferred outbox.
   */
  async function enqueueActivityUrgent(params) {
    console.log(TAG, '[2] enqueueActivityUrgent: вход', { type: params?.type, dictationId: params?.dictationId });
    try {
      const sent = await _sendActivityBatch([params]);
      if (sent) {
        console.log(TAG, '[2a] enqueueActivityUrgent: отправлено сразу');
        return true;
      }

      console.log(TAG, '[2b] enqueueActivityUrgent: не удалось, падаем в deferred');
      return await enqueueActivity(params);
    } catch (e) {
      console.warn(TAG, '[2err] enqueueActivityUrgent: ошибка, падаем в deferred', e);
      return await enqueueActivity(params);
    }
  }

  /** Запланировать отправку activity outbox */
  function _scheduleActivityFlush() {
    console.log(TAG, `[3] _scheduleActivityFlush: pending=${state.pendingActivityCount} timerId=${state.activityTimerId}`);
    if (state.activityTimerId) {
      console.log(TAG, '[3a] _scheduleActivityFlush: таймер уже запущен');
      return;
    }
    if (state.pendingActivityCount >= MAX_BATCH_SIZE) {
      console.log(TAG, `[3b] _scheduleActivityFlush: превышен лимит (${state.pendingActivityCount} >= ${MAX_BATCH_SIZE}), шлём сразу`);
      _flushActivityOutbox();
      return;
    }
    state._activityTimerStartedAt = Date.now();
    state.activityTimerId = setTimeout(() => {
      console.log(TAG, '[3c] _scheduleActivityFlush: таймер сработал');
      state.activityTimerId = null;
      state._activityTimerStartedAt = null;
      _flushActivityOutbox();
    }, BATCH_INTERVAL_MS);
    console.log(TAG, `[3d] _scheduleActivityFlush: таймер установлен на ${BATCH_INTERVAL_MS}ms`);
  }

  /** Отправить все накопленные activity записи */
  async function _flushActivityOutbox() {
    console.log(TAG, `[4] _flushActivityOutbox: вход flushing=${state.flushing} pending=${state.pendingActivityCount}`);
    if (state.flushing) {
      console.log(TAG, '[4a] _flushActivityOutbox: уже идёт flush');
      return;
    }
    state.flushing = true;
    try {
      if (!_hasToken()) {
        console.warn(TAG, '[4b] _flushActivityOutbox: нет токена — выходим');
        return;
      }

      console.log(TAG, '[4c] _flushActivityOutbox: idbGetAll activity_outbox');
      const rows = await window.IdbManager.idbGetAll('activity_outbox');
      console.log(TAG, `[4d] _flushActivityOutbox: получено ${rows.length} записей из IndexedDB`);

      if (!rows.length) {
        console.log(TAG, `[4e] _flushActivityOutbox: нет записей в IndexedDB, pending=${state.pendingActivityCount}`);
        return;
      }

      const token = _getToken();
      let successCount = 0;

      for (const row of rows) {
        try {
          console.log(TAG, `[4f] _flushActivityOutbox: отправка key=${row.key} perfect=${row.perfect_count} corrected=${row.corrected_count} audio=${row.audio_count}`);
          const response = await fetch('/api/statistics/activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              dictation_id: row.dictation_id,
              date: row.date,
              perfect_count: Number(row.perfect_count) || 0,
              corrected_count: Number(row.corrected_count) || 0,
              audio_count: Number(row.audio_count) || 0,
              lead_time_ms: Number(row.lead_time_ms_total) || 0,
              dictation_language_code: row.dictation_language_code || undefined,
              selected_sentence_positions: row.selected_sentence_positions || undefined,
            }),
          });

          if (response.ok) {
            console.log(TAG, `[4g] _flushActivityOutbox: успешно key=${row.key}`);
            await window.IdbManager.idbDelete('activity_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            console.warn(TAG, '[4h] _flushActivityOutbox: 401 Unauthorized — прерываем');
            break;
          } else {
            console.warn(TAG, `[4i] _flushActivityOutbox: ошибка ${response.status} — прерываем`);
            break;
          }
        } catch (e) {
          console.warn(TAG, '[4j] _flushActivityOutbox: ошибка сети', e);
          break;
        }
      }

      console.log(TAG, `[4k] _flushActivityOutbox: итог: отправлено ${successCount} из ${rows.length}, pending было ${state.pendingActivityCount}, стало ${Math.max(0, state.pendingActivityCount - successCount)}`);
      state.pendingActivityCount = Math.max(0, state.pendingActivityCount - successCount);
    } catch (e) {
      console.warn(TAG, '[4err] _flushActivityOutbox: общая ошибка', e);
    } finally {
      state.flushing = false;
    }
  }

  // ======================== SUCCESS OUTBOX ========================

  /**
   * Добавить success-данные в outbox (deferred — по таймеру).
   * Автоматически мержит с существующей записью (суммирует счётчики).
   */
  async function enqueueSuccess(payload) {
    console.log(TAG, '[5] enqueueSuccess: вход', { dictation_id: payload?.dictation_id });
    try {
      if (!payload || !payload.dictation_id) {
        console.warn(TAG, '[5a] enqueueSuccess: пропущено (нет dictation_id)', payload);
        return false;
      }

      const userId = _getUserId();
      if (!userId) {
        console.warn(TAG, '[5b] enqueueSuccess: пропущено (нет userId)');
        return false;
      }

      const rawId = String(payload.dictation_id).trim();
      const dateId = payload.date || _getLocalDateId();
      const key = `${userId}:${rawId}:${dateId}`;

      console.log(TAG, `[5c] enqueueSuccess: userId=${userId} dateId=${dateId} key=${key}`);

      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingSuccessCount += 1;
      console.log(TAG, `[5d] enqueueSuccess: pendingSuccessCount увеличен => ${state.pendingSuccessCount}`);

      console.log(TAG, `[5e] enqueueSuccess: idbGet success_outbox key=${key}`);
      const existing = await window.IdbManager.idbGet('success_outbox', key);

      const mergedPayload = existing?.payload ? _mergeSuccessPayloads(existing.payload, payload) : payload;

      console.log(TAG, `[5f] enqueueSuccess: idbPut success_outbox key=${key}`);
      await window.IdbManager.idbPut('success_outbox', {
        key,
        userId,
        createdAt: existing?.createdAt || Date.now(),
        payload: mergedPayload,
      });

      console.log(TAG, `[5g] enqueueSuccess: сохранено (key=${key}) perfect=${payload.perfect_count} corrected=${payload.corrected_count} audio=${payload.audio_count}`);
      _scheduleSuccessFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[5err] enqueueSuccess: ошибка', e);
      return false;
    }
  }

  /**
   * Добавить success как urgent — отправляется немедленно.
   */
  async function enqueueSuccessUrgent(payload) {
    console.log(TAG, '[6] enqueueSuccessUrgent: вход', { dictation_id: payload?.dictation_id, perfect: payload?.perfect_count, corrected: payload?.corrected_count, audio: payload?.audio_count });
    try {
      const sent = await _sendSuccessBatch([payload]);
      if (sent) {
        console.log(TAG, '[6a] enqueueSuccessUrgent: отправлено успешно');
        return true;
      }
      console.warn(TAG, '[6b] enqueueSuccessUrgent: не удалось, падаем в deferred outbox');
      return await enqueueSuccess(payload);
    } catch (e) {
      console.warn(TAG, '[6err] enqueueSuccessUrgent: ошибка, падаем в deferred outbox', e);
      return await enqueueSuccess(payload);
    }
  }

  /** Запланировать отправку success outbox */
  function _scheduleSuccessFlush() {
    console.log(TAG, `[7] _scheduleSuccessFlush: pending=${state.pendingSuccessCount} timerId=${state.successTimerId}`);
    if (state.successTimerId) {
      console.log(TAG, '[7a] _scheduleSuccessFlush: таймер уже запущен');
      return;
    }
    if (state.pendingSuccessCount >= MAX_BATCH_SIZE) {
      console.log(TAG, `[7b] _scheduleSuccessFlush: превышен лимит (${state.pendingSuccessCount} >= ${MAX_BATCH_SIZE}), шлём сразу`);
      _flushSuccessOutbox();
      return;
    }
    state._successTimerStartedAt = Date.now();
    state.successTimerId = setTimeout(() => {
      console.log(TAG, '[7c] _scheduleSuccessFlush: таймер сработал');
      state.successTimerId = null;
      state._successTimerStartedAt = null;
      _flushSuccessOutbox();
    }, BATCH_INTERVAL_MS);
    console.log(TAG, `[7d] _scheduleSuccessFlush: таймер установлен на ${BATCH_INTERVAL_MS}ms`);
  }

  /** Отправить все накопленные success записи */
  async function _flushSuccessOutbox() {
    console.log(TAG, `[8] _flushSuccessOutbox: вход flushing=${state.flushing} pending=${state.pendingSuccessCount}`);
    if (state.flushing) {
      console.log(TAG, '[8a] _flushSuccessOutbox: уже идёт flush');
      return;
    }
    state.flushing = true;
    try {
      if (!_hasToken()) {
        console.warn(TAG, '[8b] _flushSuccessOutbox: нет токена — выходим');
        return;
      }

      console.log(TAG, '[8c] _flushSuccessOutbox: idbGetAll success_outbox');
      const rows = await window.IdbManager.idbGetAll('success_outbox');
      console.log(TAG, `[8d] _flushSuccessOutbox: получено ${rows.length} записей из IndexedDB`);

      if (!rows.length) {
        console.log(TAG, `[8e] _flushSuccessOutbox: нет записей в IndexedDB, pending=${state.pendingSuccessCount}`);
        return;
      }

      const token = _getToken();
      let successCount = 0;

      for (const row of rows) {
        try {
          console.log(TAG, `[8f] _flushSuccessOutbox: отправка key=${row.key}`, { dictation_id: row.payload?.dictation_id });
          const response = await fetch('/api/statistics/success', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(row.payload),
          });

          if (response.ok) {
            console.log(TAG, `[8g] _flushSuccessOutbox: успешно key=${row.key}`);
            await window.IdbManager.idbDelete('success_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            console.warn(TAG, '[8h] _flushSuccessOutbox: 401 Unauthorized — прерываем');
            break;
          } else {
            console.warn(TAG, `[8i] _flushSuccessOutbox: ошибка ${response.status} — прерываем`);
            break;
          }
        } catch (e) {
          console.warn(TAG, '[8j] _flushSuccessOutbox: ошибка сети', e);
          break;
        }
      }

      console.log(TAG, `[8k] _flushSuccessOutbox: итог: отправлено ${successCount} из ${rows.length}, pending было ${state.pendingSuccessCount}, стало ${Math.max(0, state.pendingSuccessCount - successCount)}`);
      state.pendingSuccessCount = Math.max(0, state.pendingSuccessCount - successCount);
    } catch (e) {
      console.warn(TAG, '[8err] _flushSuccessOutbox: общая ошибка', e);
    } finally {
      state.flushing = false;
    }
  }

  // ======================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========================

  function _getUserId() {
    try {
      return String(window.UM?.userId || window.UM?.user?.id || '').trim();
    } catch (e) {
      return '';
    }
  }

  function _getLocalDateId() {
    try {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    } catch (e) {
      return '';
    }
  }

  function _serializeSelectedPositions(pos) {
    try {
      if (pos == null) return '';
      if (typeof pos === 'string') return pos;
      return JSON.stringify(pos);
    } catch (e) {
      return '';
    }
  }

  function _mergeSuccessPayloads(prev, next) {
    function mergeSentencesData(a, b) {
      const map = new Map();
      for (const row of Array.isArray(a) ? a : []) {
        if (!row || !row.sentence_key) continue;
        map.set(row.sentence_key, { ...row });
      }
      for (const row of Array.isArray(b) ? b : []) {
        if (!row || !row.sentence_key) continue;
        const p = map.get(row.sentence_key);
        if (!p) {
          map.set(row.sentence_key, { ...row });
        } else {
          p.perfect_count = (Number(p.perfect_count) || 0) + (Number(row.perfect_count) || 0);
          p.corrected_count = (Number(p.corrected_count) || 0) + (Number(row.corrected_count) || 0);
          p.audio_count = (Number(p.audio_count) || 0) + (Number(row.audio_count) || 0);
          p.attempts_total = (Number(p.attempts_total) || 0) + (Number(row.attempts_total) || 0);
          p.mistake_count = (Number(p.mistake_count) || 0) + (Number(row.mistake_count) || 0);
          map.set(row.sentence_key, p);
        }
      }
      return Array.from(map.values());
    }

    function mergeErrorWords(a, b) {
      try {
        const aa = (a && typeof a === 'object') ? a : {};
        const bb = (b && typeof b === 'object') ? b : {};
        const out = { ...aa };
        Object.keys(bb).forEach((k) => {
          const prev = Number(out[k] || 0) || 0;
          const next = Number(bb[k] || 0) || 0;
          if (next > 0) out[k] = prev + next;
        });
        return out;
      } catch (e) {
        return (a && typeof a === 'object') ? a : ((b && typeof b === 'object') ? b : {});
      }
    }

    return {
      ...prev,
      dictation_id: next.dictation_id,
      perfect_count: (Number(prev.perfect_count) || 0) + (Number(next.perfect_count) || 0),
      corrected_count: (Number(prev.corrected_count) || 0) + (Number(next.corrected_count) || 0),
      audio_count: (Number(prev.audio_count) || 0) + (Number(next.audio_count) || 0),
      attempts_total: (Number(prev.attempts_total) || 0) + (Number(next.attempts_total) || 0),
      mistake_count: (Number(prev.mistake_count) || 0) + (Number(next.mistake_count) || 0),
      monenumber_of_characters: (Number(prev.monenumber_of_characters) || 0) + (Number(next.monenumber_of_characters) || 0),
      money_earned: (Number(prev.money_earned) || 0) + (Number(next.money_earned) || 0),
      time_ms: (Number(prev.time_ms) || 0) + (Number(next.time_ms) || 0),
      source_group_id: (prev.source_group_id != null) ? prev.source_group_id : next.source_group_id,
      selected_sentence_positions: (prev.selected_sentence_positions != null)
        ? prev.selected_sentence_positions
        : next.selected_sentence_positions,
      date_start: prev.date_start || next.date_start,
      sentences_data: mergeSentencesData(prev.sentences_data, next.sentences_data),
      settings_json: next.settings_json || prev.settings_json,
      error_words: mergeErrorWords(prev.error_words, next.error_words),
      completed_at_ms: prev.completed_at_ms || next.completed_at_ms,
      completed_at_tz_offset_min: prev.completed_at_tz_offset_min || next.completed_at_tz_offset_min,
    };
  }

  /** Отправить один activity-запрос немедленно (для urgent) */
  async function _sendActivityBatch(items) {
    console.log(TAG, `[9] _sendActivityBatch: вход ${items.length} item(s)`);
    try {
      const token = _getToken();
      if (!token) {
        console.warn(TAG, '[9a] _sendActivityBatch: нет токена');
        return false;
      }

      console.log(TAG, `[9b] _sendActivityBatch: отправка`, items.map(i => ({ type: i.type, count: i.count, dictationId: i.dictationId })));

      for (const item of items) {
        console.log(TAG, `[9c] _sendActivityBatch: fetch POST /api/statistics/activity type=${item.type} dictationId=${item.dictationId}`);
        const response = await fetch('/api/statistics/activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            dictation_id: item.dictationId,
            date: item.date || _getLocalDateId(),
            perfect_count: item.type === 'perfect' ? (Number(item.count) || 0) : 0,
            corrected_count: item.type === 'corrected' ? (Number(item.count) || 0) : 0,
            audio_count: item.type === 'audio' ? (Number(item.count) || 0) : 0,
            lead_time_ms: Number(item.leadTimeMs) || 0,
            dictation_language_code: item.dictationLanguageCode || undefined,
            selected_sentence_positions: item.selectedSentencePositions || undefined,
          }),
        });

        if (response.ok) {
          console.log(TAG, `[9d] _sendActivityBatch: успешно type=${item.type} dictationId=${item.dictationId}`);
        } else {
          console.warn(TAG, `[9e] _sendActivityBatch: ошибка ${response.status} type=${item.type} dictationId=${item.dictationId}`);
          return false;
        }
      }
      console.log(TAG, '[9f] _sendActivityBatch: все успешно');
      return true;
    } catch (e) {
      console.warn(TAG, '[9err] _sendActivityBatch: ошибка сети', e);
      return false;
    }
  }

  /** Отправить один success-запрос немедленно (для urgent) */
  async function _sendSuccessBatch(items) {
    console.log(TAG, `[10] _sendSuccessBatch: вход ${items.length} item(s)`);
    try {
      const token = _getToken();
      if (!token) {
        console.warn(TAG, '[10a] _sendSuccessBatch: нет токена');
        return false;
      }

      console.log(TAG, `[10b] _sendSuccessBatch: отправка`, items.map(i => ({ dictation_id: i.dictation_id, perfect: i.perfect_count, corrected: i.corrected_count, audio: i.audio_count })));

      for (const item of items) {
        console.log(TAG, `[10c] _sendSuccessBatch: fetch POST /api/statistics/success dictation_id=${item.dictation_id}`);
        const response = await fetch('/api/statistics/success', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        });

        if (response.ok) {
          console.log(TAG, `[10d] _sendSuccessBatch: успешно dictation_id=${item.dictation_id}`);
        } else {
          console.warn(TAG, `[10e] _sendSuccessBatch: ошибка ${response.status} dictation_id=${item.dictation_id}`);
          return false;
        }
      }
      console.log(TAG, '[10f] _sendSuccessBatch: все успешно');
      return true;
    } catch (e) {
      console.warn(TAG, '[10err] _sendSuccessBatch: ошибка сети', e);
      return false;
    }
  }

  // ======================== ПУБЛИЧНЫЙ API ========================

  /**
   * Принудительно отправить все накопленные данные.
   * Вызывается при закрытии модалки, переходе на другую страницу и т.д.
   */
  async function flushAll() {
    console.log(TAG, `[11] flushAll: вход pendingAct=${state.pendingActivityCount} pendingSuc=${state.pendingSuccessCount}`);
    if (state.activityTimerId) {
      clearTimeout(state.activityTimerId);
      state.activityTimerId = null;
      console.log(TAG, '[11a] flushAll: activityTimer сброшен');
    }
    if (state.successTimerId) {
      clearTimeout(state.successTimerId);
      state.successTimerId = null;
      console.log(TAG, '[11b] flushAll: successTimer сброшен');
    }

    await Promise.all([
      _flushActivityOutbox(),
      _flushSuccessOutbox(),
    ]);
    console.log(TAG, '[11c] flushAll: завершён');
  }

  /**
   * Отправить сообщение в Service Worker для синхронизации outbox.
   * Используется, когда SW получает сигнал о появлении сети.
   */
  async function notifySwToSync() {
    try {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
      navigator.serviceWorker.controller.postMessage({
        action: 'syncOutbox',
        type: 'deferred',
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Вернуть информацию об очередях для отображения в статус-баре.
   * @returns {Promise<{activityCount: number, successCount: number, activityTimerRemainingMs: number|null, successTimerRemainingMs: number|null}>}
   */
  async function getQueueInfo() {
    console.log(TAG, `[12] getQueueInfo: вход pendingAct=${state.pendingActivityCount} pendingSuc=${state.pendingSuccessCount} timerAct=${state.activityTimerId} timerSuc=${state.successTimerId}`);
    try {
      var activityRows = await window.IdbManager.idbGetAll('activity_outbox');
      var successRows = await window.IdbManager.idbGetAll('success_outbox');
      var activityCount = Array.isArray(activityRows) ? activityRows.length : 0;
      var successCount = Array.isArray(successRows) ? successRows.length : 0;

      console.log(TAG, `[12a] getQueueInfo: из IndexedDB act=${activityCount} suc=${successCount}`);

      // Учитываем также pending-счётчики (in-memory), которые ещё не попали в IndexedDB
      // или уже отправлены, но счётчик ещё не сброшен
      activityCount += state.pendingActivityCount;
      successCount += state.pendingSuccessCount;

      var now = Date.now();
      var activityTimerRemainingMs = null;
      var successTimerRemainingMs = null;

      if (state.activityTimerId) {
        activityTimerRemainingMs = Math.max(0, BATCH_INTERVAL_MS - (now - (state._activityTimerStartedAt || now)));
      }
      if (state.successTimerId) {
        successTimerRemainingMs = Math.max(0, BATCH_INTERVAL_MS - (now - (state._successTimerStartedAt || now)));
      }

      console.log(TAG, `[12b] getQueueInfo: результат act=${activityCount} suc=${successCount} actTimer=${activityTimerRemainingMs} sucTimer=${successTimerRemainingMs}`);
      return {
        activityCount: activityCount,
        successCount: successCount,
        activityTimerRemainingMs: activityTimerRemainingMs,
        successTimerRemainingMs: successTimerRemainingMs,
      };
    } catch (e) {
      console.warn(TAG, '[12err] getQueueInfo: ошибка', e);
      return { activityCount: 0, successCount: 0, activityTimerRemainingMs: null, successTimerRemainingMs: null };
    }
  }

  // Слушаем online-событие для автоматической синхронизации
  window.addEventListener('online', () => {
    flushAll().catch(() => {});
  });

  // Экспортируем в глобальную область
  window.OutboxBatcher = {
    enqueueActivity,
    enqueueActivityUrgent,
    enqueueSuccess,
    enqueueSuccessUrgent,
    flushAll,
    notifySwToSync,
    getQueueInfo,
  };

})();
