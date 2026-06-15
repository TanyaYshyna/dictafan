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
        console.warn(TAG, 'enqueueActivity: пропущено (нет dictationId или type)', { dictationId, type });
        return false;
      }

      console.log(TAG, `enqueueActivity: type=${type} count=${count} dictationId=${dictationId} lang=${dictationLanguageCode}`);

      const userId = _getUserId();
      if (!userId) return false;

      const dateId = date || _getLocalDateId();
      const selPosStr = _serializeSelectedPositions(selectedSentencePositions);
      const key = `${userId}:${dateId}:${dictationId}:${selPosStr}`;

      // Читаем существующую запись или создаём новую
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

      await window.IdbManager.idbPut('activity_outbox', existing);

      state.pendingActivityCount += 1;
      console.log(TAG, `enqueueActivity: сохранено в IndexedDB (key=${key}), pending=${state.pendingActivityCount}`);
      _scheduleActivityFlush();

      return true;
    } catch (e) {
      console.warn(TAG, 'enqueueActivity: ошибка', e);
      return false;
    }
  }

  /**
   * Добавить активность как urgent — отправляется немедленно.
   * Если отправка не удалась, падает в deferred outbox.
   */
  async function enqueueActivityUrgent(params) {
    try {
      const sent = await _sendActivityBatch([params]);
      if (sent) return true;

      // Если не удалось отправить сразу — кладём в outbox
      return await enqueueActivity(params);
    } catch (e) {
      return await enqueueActivity(params);
    }
  }

  /** Запланировать отправку activity outbox */
  function _scheduleActivityFlush() {
    if (state.activityTimerId) return;
    if (state.pendingActivityCount >= MAX_BATCH_SIZE) {
      _flushActivityOutbox();
      return;
    }
    state.activityTimerId = setTimeout(() => {
      state.activityTimerId = null;
      _flushActivityOutbox();
    }, BATCH_INTERVAL_MS);
  }

  /** Отправить все накопленные activity записи */
  async function _flushActivityOutbox() {
    if (state.flushing) return;
    state.flushing = true;
    console.log(TAG, '_flushActivityOutbox: начало');
    try {
      if (!_hasToken()) {
        console.warn(TAG, '_flushActivityOutbox: нет токена');
        state.pendingActivityCount = 0;
        return;
      }

      const rows = await window.IdbManager.idbGetAll('activity_outbox');
      if (!rows.length) {
        console.log(TAG, '_flushActivityOutbox: нет записей');
        state.pendingActivityCount = 0;
        return;
      }

      console.log(TAG, `_flushActivityOutbox: найдено ${rows.length} записей`);

      const token = _getToken();
      let successCount = 0;

      for (const row of rows) {
        try {
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
            console.log(TAG, `_flushActivityOutbox: отправлено успешно key=${row.key}`);
            await window.IdbManager.idbDelete('activity_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            console.warn(TAG, '_flushActivityOutbox: 401 Unauthorized');
            // Токен протух — не удаляем, ждём
            break;
          } else {
            console.warn(TAG, `_flushActivityOutbox: ошибка ${response.status}`, row);
            // Временная ошибка — пробуем позже
            break;
          }
        } catch (e) {
          console.warn(TAG, '_flushActivityOutbox: ошибка сети', e);
          // Ошибка сети — выходим, остальное отправится в следующий раз
          break;
        }
      }

      console.log(TAG, `_flushActivityOutbox: отправлено ${successCount} из ${rows.length}`);
      state.pendingActivityCount = Math.max(0, state.pendingActivityCount - successCount);
    } catch (e) {
      console.warn(TAG, '_flushActivityOutbox: общая ошибка', e);
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
    try {
      if (!payload || !payload.dictation_id) {
        console.warn(TAG, 'enqueueSuccess: пропущено (нет dictation_id)', payload);
        return false;
      }

      const userId = _getUserId();
      if (!userId) {
        console.warn(TAG, 'enqueueSuccess: пропущено (нет userId)');
        return false;
      }

      const rawId = String(payload.dictation_id).trim();
      const dateId = payload.date || _getLocalDateId();
      const key = `${userId}:${rawId}:${dateId}`;

      const existing = await window.IdbManager.idbGet('success_outbox', key);

      const mergedPayload = existing?.payload ? _mergeSuccessPayloads(existing.payload, payload) : payload;

      await window.IdbManager.idbPut('success_outbox', {
        key,
        userId,
        createdAt: existing?.createdAt || Date.now(),
        payload: mergedPayload,
      });

      state.pendingSuccessCount += 1;
      console.log(TAG, `enqueueSuccess: сохранено (key=${key}) perfect=${payload.perfect_count} corrected=${payload.corrected_count} audio=${payload.audio_count}`);
      _scheduleSuccessFlush();

      return true;
    } catch (e) {
      console.warn(TAG, 'enqueueSuccess: ошибка', e);
      return false;
    }
  }

  /**
   * Добавить success как urgent — отправляется немедленно.
   */
  async function enqueueSuccessUrgent(payload) {
    console.log(TAG, 'enqueueSuccessUrgent: отправка', { dictation_id: payload?.dictation_id, perfect: payload?.perfect_count, corrected: payload?.corrected_count, audio: payload?.audio_count });
    try {
      const sent = await _sendSuccessBatch([payload]);
      if (sent) {
        console.log(TAG, 'enqueueSuccessUrgent: отправлено успешно');
        return true;
      }
      console.warn(TAG, 'enqueueSuccessUrgent: не удалось, падаем в deferred outbox');
      return await enqueueSuccess(payload);
    } catch (e) {
      console.warn(TAG, 'enqueueSuccessUrgent: ошибка, падаем в deferred outbox', e);
      return await enqueueSuccess(payload);
    }
  }

  /** Запланировать отправку success outbox */
  function _scheduleSuccessFlush() {
    if (state.successTimerId) return;
    if (state.pendingSuccessCount >= MAX_BATCH_SIZE) {
      _flushSuccessOutbox();
      return;
    }
    state.successTimerId = setTimeout(() => {
      state.successTimerId = null;
      _flushSuccessOutbox();
    }, BATCH_INTERVAL_MS);
  }

  /** Отправить все накопленные success записи */
  async function _flushSuccessOutbox() {
    if (state.flushing) return;
    state.flushing = true;
    console.log(TAG, '_flushSuccessOutbox: начало');
    try {
      if (!_hasToken()) {
        console.warn(TAG, '_flushSuccessOutbox: нет токена');
        state.pendingSuccessCount = 0;
        return;
      }

      const rows = await window.IdbManager.idbGetAll('success_outbox');
      if (!rows.length) {
        console.log(TAG, '_flushSuccessOutbox: нет записей');
        state.pendingSuccessCount = 0;
        return;
      }

      console.log(TAG, `_flushSuccessOutbox: найдено ${rows.length} записей`);

      const token = _getToken();
      let successCount = 0;

      for (const row of rows) {
        try {
          console.log(TAG, `_flushSuccessOutbox: отправка key=${row.key}`, { dictation_id: row.payload?.dictation_id });
          const response = await fetch('/api/statistics/success', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(row.payload),
          });

          if (response.ok) {
            console.log(TAG, `_flushSuccessOutbox: отправлено успешно key=${row.key}`);
            await window.IdbManager.idbDelete('success_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            console.warn(TAG, '_flushSuccessOutbox: 401 Unauthorized');
            break;
          } else {
            console.warn(TAG, `_flushSuccessOutbox: ошибка ${response.status}`, row);
            break;
          }
        } catch (e) {
          console.warn(TAG, '_flushSuccessOutbox: ошибка сети', e);
          break;
        }
      }

      console.log(TAG, `_flushSuccessOutbox: отправлено ${successCount} из ${rows.length}`);
      state.pendingSuccessCount = Math.max(0, state.pendingSuccessCount - successCount);
    } catch (e) {
      console.warn(TAG, '_flushSuccessOutbox: общая ошибка', e);
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
      time_ms: (Number(prev.time_ms) || 0) + (Number(next.time_ms) || 0),
      source_group_id: (prev.source_group_id != null) ? prev.source_group_id : next.source_group_id,
      selected_sentence_positions: (prev.selected_sentence_positions != null)
        ? prev.selected_sentence_positions
        : next.selected_sentence_positions,
      sentences_data: mergeSentencesData(prev.sentences_data, next.sentences_data),
      settings_json: next.settings_json || prev.settings_json,
      error_words: mergeErrorWords(prev.error_words, next.error_words),
      completed_at_ms: prev.completed_at_ms || next.completed_at_ms,
      completed_at_tz_offset_min: prev.completed_at_tz_offset_min || next.completed_at_tz_offset_min,
    };
  }

  /** Отправить один activity-запрос немедленно (для urgent) */
  async function _sendActivityBatch(items) {
    try {
      const token = _getToken();
      if (!token) {
        console.warn(TAG, '_sendActivityBatch: нет токена');
        return false;
      }

      console.log(TAG, `_sendActivityBatch: отправка ${items.length} item(s)`, items.map(i => ({ type: i.type, count: i.count, dictationId: i.dictationId })));

      for (const item of items) {
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
          console.log(TAG, `_sendActivityBatch: успешно type=${item.type} dictationId=${item.dictationId}`);
        } else {
          console.warn(TAG, `_sendActivityBatch: ошибка ${response.status} type=${item.type} dictationId=${item.dictationId}`);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn(TAG, '_sendActivityBatch: ошибка сети', e);
      return false;
    }
  }

  /** Отправить один success-запрос немедленно (для urgent) */
  async function _sendSuccessBatch(items) {
    try {
      const token = _getToken();
      if (!token) {
        console.warn(TAG, '_sendSuccessBatch: нет токена');
        return false;
      }

      console.log(TAG, `_sendSuccessBatch: отправка ${items.length} item(s)`, items.map(i => ({ dictation_id: i.dictation_id, perfect: i.perfect_count, corrected: i.corrected_count, audio: i.audio_count })));

      for (const item of items) {
        const response = await fetch('/api/statistics/success', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        });

        if (response.ok) {
          console.log(TAG, `_sendSuccessBatch: успешно dictation_id=${item.dictation_id}`);
        } else {
          console.warn(TAG, `_sendSuccessBatch: ошибка ${response.status} dictation_id=${item.dictation_id}`);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn(TAG, '_sendSuccessBatch: ошибка сети', e);
      return false;
    }
  }

  // ======================== ПУБЛИЧНЫЙ API ========================

  /**
   * Принудительно отправить все накопленные данные.
   * Вызывается при закрытии модалки, переходе на другую страницу и т.д.
   */
  async function flushAll() {
    if (state.activityTimerId) {
      clearTimeout(state.activityTimerId);
      state.activityTimerId = null;
    }
    if (state.successTimerId) {
      clearTimeout(state.successTimerId);
      state.successTimerId = null;
    }

    await Promise.all([
      _flushActivityOutbox(),
      _flushSuccessOutbox(),
    ]);
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
  };

})();
