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

  const BATCH_INTERVAL_MS = 5000; // 5 секунд между батчами
  const MAX_BATCH_SIZE = 20; // макс. количество записей в одном батче

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

      if (!dictationId || !type) return false;

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
      _scheduleActivityFlush();

      return true;
    } catch (e) {
      console.error('[OutboxBatcher] enqueueActivity error:', e);
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
      console.error('[OutboxBatcher] enqueueActivityUrgent error:', e);
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
    try {
      if (!_hasToken()) {
        state.pendingActivityCount = 0;
        return;
      }

      const rows = await window.IdbManager.idbGetAll('activity_outbox');
      if (!rows.length) {
        state.pendingActivityCount = 0;
        return;
      }

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
            await window.IdbManager.idbDelete('activity_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            // Токен протух — не удаляем, ждём
            break;
          } else {
            // Временная ошибка — пробуем позже
            break;
          }
        } catch (e) {
          // Ошибка сети — выходим, остальное отправится в следующий раз
          break;
        }
      }

      state.pendingActivityCount = Math.max(0, state.pendingActivityCount - successCount);
    } catch (e) {
      console.error('[OutboxBatcher] _flushActivityOutbox error:', e);
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
      if (!payload || !payload.dictation_id) return false;

      const userId = _getUserId();
      if (!userId) return false;

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
      _scheduleSuccessFlush();

      return true;
    } catch (e) {
      console.error('[OutboxBatcher] enqueueSuccess error:', e);
      return false;
    }
  }

  /**
   * Добавить success как urgent — отправляется немедленно.
   */
  async function enqueueSuccessUrgent(payload) {
    try {
      const sent = await _sendSuccessBatch([payload]);
      if (sent) return true;
      return await enqueueSuccess(payload);
    } catch (e) {
      console.error('[OutboxBatcher] enqueueSuccessUrgent error:', e);
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
    try {
      if (!_hasToken()) {
        state.pendingSuccessCount = 0;
        return;
      }

      const rows = await window.IdbManager.idbGetAll('success_outbox');
      if (!rows.length) {
        state.pendingSuccessCount = 0;
        return;
      }

      const token = _getToken();
      let successCount = 0;

      for (const row of rows) {
        try {
          const response = await fetch('/api/statistics/success', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(row.payload),
          });

          if (response.ok) {
            await window.IdbManager.idbDelete('success_outbox', row.key);
            successCount += 1;
          } else if (response.status === 401) {
            break;
          } else {
            break;
          }
        } catch (e) {
          break;
        }
      }

      state.pendingSuccessCount = Math.max(0, state.pendingSuccessCount - successCount);
    } catch (e) {
      console.error('[OutboxBatcher] _flushSuccessOutbox error:', e);
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
      if (!token) return false;

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

        if (!response.ok) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Отправить один success-запрос немедленно (для urgent) */
  async function _sendSuccessBatch(items) {
    try {
      const token = _getToken();
      if (!token) return false;

      for (const item of items) {
        const response = await fetch('/api/statistics/success', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        });

        if (!response.ok) return false;
      }
      return true;
    } catch (e) {
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

  console.log('[OutboxBatcher] Инициализирован. BATCH_INTERVAL_MS=' + BATCH_INTERVAL_MS + ', MAX_BATCH_SIZE=' + MAX_BATCH_SIZE);
})();
