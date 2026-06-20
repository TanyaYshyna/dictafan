/**
 * OutboxBatcher — модуль для накопления и отправки данных на сервер.
 *
 * Единая очередь (outbox), куда попадают все действия пользователя:
 *   - activity (perfect/corrected/audio) — каждое законченное предложение
 *   - success (завершение диктанта) — когда юзер закончил все предложения
 *
 * Отправка происходит:
 *   1) По таймеру (BATCH_INTERVAL_MS) — все накопленные данные
 *   2) При завершении диктанта — принудительный flushAll()
 *   3) При появлении интернета (online-событие)
 *
 * Если нет интернета — данные хранятся в IndexedDB до следующей попытки.
 *
 * Использование:
 *   OutboxBatcher.enqueueActivity({ type, count, leadTimeMs, ... })
 *   OutboxBatcher.enqueueSuccess(payload)
 *   OutboxBatcher.flushAll()  // принудительная отправка всего outbox
 */
(function () {
  if (window.OutboxBatcher) return;

  const BATCH_INTERVAL_MS = 10000; // 10 секунд (для теста)
  const MAX_BATCH_SIZE = 20; // макс. количество записей в одном батче

  const TAG = '[OutboxBatcher]';

  const state = {
    timerId: null,
    timerStartedAt: null,
    pendingCount: 0,
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

  function _getUserId() {
    try {
      // UserManager хранит данные в this.userData, полученные из /user/api/me (поле id)
      var uid = String(window.UM?.userData?.id || window.UM?.userId || window.UM?.user?.id || '').trim();
      if (!uid) {
        console.log(TAG, '[0] _getUserId: UM=', typeof window.UM, window.UM ? 'exists' : 'null',
          'userData=', window.UM?.userData,
          'userId=', window.UM?.userId,
          'user=', window.UM?.user);
      }
      return uid;
    } catch (e) {
      console.warn(TAG, '[0err] _getUserId: исключение', e);
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

  // ======================== ЕДИНАЯ ОЧЕРЕДЬ ========================

  /**
   * Добавить активность в очередь (activity — каждое действие).
   * Данные мержатся по ключу: userId:dateId:dictationId:selPosStr
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
        mistakeCount = 0,
        numberOfCharacters = 0,
        moneyCount = 0,
      } = params || {};

      if (!dictationId || !type) {
        console.warn(TAG, '[1a] enqueueActivity: пропущено (нет dictationId или type)', { dictationId, type });
        return false;
      }


      const userId = _getUserId();
      if (!userId) {
        console.warn(TAG, '[1c] enqueueActivity: пропущено (нет userId)');
        return false;
      }

      const dateId = date || _getLocalDateId();
      const selPosStr = _serializeSelectedPositions(selectedSentencePositions);
      const key = `act:${userId}:${dateId}:${dictationId}:${selPosStr}`;


      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingCount += 1;

      // Читаем существующую запись или создаём новую
      const existing = (await window.IdbManager.idbGet('outbox', key)) || {
        key,
        type: 'activity',
        userId,
        date: dateId,
        dictation_id: dictationId,
        selected_sentence_positions: selectedSentencePositions || null,
        perfect_count: 0,
        corrected_count: 0,
        audio_count: 0,
        money_count: 0,
        mistake_count: 0,
        monenumber_of_characters: 0,
        lead_time_ms_total: 0,
        dictation_language_code: dictationLanguageCode || null,
        updatedAt: 0,
      };

      const n = Number(count) || 0;
      if (type === 'perfect') existing.perfect_count += n;
      if (type === 'corrected') existing.corrected_count += n;
      if (type === 'audio') existing.audio_count += n;

      existing.money_count = (Number(existing.money_count) || 0) + (Number(moneyCount) || 0);
      existing.mistake_count = (Number(existing.mistake_count) || 0) + (Number(mistakeCount) || 0);
      existing.monenumber_of_characters = (Number(existing.monenumber_of_characters) || 0) + (Number(numberOfCharacters) || 0);
      existing.lead_time_ms_total = (Number(existing.lead_time_ms_total) || 0) + (Number(leadTimeMs) || 0);
      existing.dictation_language_code = dictationLanguageCode || existing.dictation_language_code;
      existing.updatedAt = Date.now();

      await window.IdbManager.idbPut('outbox', existing);

      _scheduleFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[1err] enqueueActivity: ошибка', e);
      return false;
    }
  }

  /**
   * Добавить success-данные в очередь (завершение диктанта).
   * Автоматически мержит с существующей записью (суммирует счётчики).
   */
  async function enqueueSuccess(payload) {
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
      const key = `suc:${userId}:${rawId}:${dateId}`;

      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingCount += 1;
      const existing = await window.IdbManager.idbGet('outbox', key);

      const mergedPayload = existing?.payload ? _mergeSuccessPayloads(existing.payload, payload) : payload;

      await window.IdbManager.idbPut('outbox', {
        key,
        type: 'success',
        userId,
        createdAt: existing?.createdAt || Date.now(),
        payload: mergedPayload,
      });

      _scheduleFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[5err] enqueueSuccess: ошибка', e);
      return false;
    }
  }

  // ======================== ТАЙМЕР ========================

  /** Запланировать отправку outbox */
  function _scheduleFlush() {
    if (state.timerId) {
      return;
    }
    if (state.pendingCount >= MAX_BATCH_SIZE) {
      _flushOutbox();
      return;
    }
    state.timerStartedAt = Date.now();
    state.timerId = setTimeout(() => {
      state.timerId = null;
      state.timerStartedAt = null;
      _flushOutbox();
    }, BATCH_INTERVAL_MS);
  }

  // ======================== ОТПРАВКА ========================

  /** Отправить все накопленные записи из outbox */
  async function _flushOutbox() {
    if (state.flushing) {
      return;
    }
    state.flushing = true;
    try {
      if (!_hasToken()) {
        return;
      }

      const rows = await window.IdbManager.idbGetAll('outbox');

      if (!rows.length) {
        state.pendingCount = 0;
        return;
      }

      const token = _getToken();
      let allOk = true;

      for (const row of rows) {
        try {
          if (row.type === 'activity') {
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
                money_count: Number(row.money_count) || 0,
                mistake_count: Number(row.mistake_count) || 0,
                monenumber_of_characters: Number(row.monenumber_of_characters) || 0,
                lead_time_ms: Number(row.lead_time_ms_total) || 0,
                dictation_language_code: row.dictation_language_code || undefined,
                selected_sentence_positions: row.selected_sentence_positions || undefined,
              }),
            });

            if (response.ok) {
              await window.IdbManager.idbDelete('outbox', row.key);
            } else if (response.status === 401) {
              allOk = false;
              break;
            } else {
              allOk = false;
              break;
            }
          } else if (row.type === 'success') {
            const response = await fetch('/api/statistics/success', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(row.payload),
            });

            if (response.ok) {
              await window.IdbManager.idbDelete('outbox', row.key);
            } else if (response.status === 401) {
              allOk = false;
              break;
            } else {
              allOk = false;
              break;
            }
          }
        } catch (e) {
          allOk = false;
          break;
        }
      }

      if (allOk) {
        state.pendingCount = 0;
      }
    } catch (e) {
      // ignore
    } finally {
      state.flushing = false;
    }
  }

  // ======================== ПУБЛИЧНЫЙ API ========================

  /**
   * Принудительно отправить все накопленные данные.
   * Вызывается при завершении диктанта, при появлении сети и т.д.
   */
  async function flushAll() {
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
      state.timerStartedAt = null;
    }

    await _flushOutbox();
  }

  /**
   * Отправить сообщение в Service Worker для синхронизации outbox.
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
   * Вернуть информацию об очереди для отображения в статус-баре.
   * @returns {Promise<{count: number, timerRemainingMs: number|null}>}
   */
  async function getQueueInfo() {
    try {
      // Используем pendingCount вместо количества записей в IndexedDB,
      // потому что activity-записи мержатся по ключу (act:userId:date:dictationId:positions)
      // и в IDB всегда может быть 1 запись, хотя enqueueActivity вызывался много раз.
      var count = state.pendingCount;

      var now = Date.now();
      var timerRemainingMs = null;

      if (state.timerId) {
        timerRemainingMs = Math.max(0, BATCH_INTERVAL_MS - (now - (state.timerStartedAt || now)));
      }

      return {
        count: count,
        timerRemainingMs: timerRemainingMs,
      };
    } catch (e) {
      console.warn(TAG, '[12err] getQueueInfo: ошибка', e);
      return { count: 0, timerRemainingMs: null };
    }
  }

  // Слушаем online-событие для автоматической отправки
  window.addEventListener('online', () => {
    flushAll().catch(() => {});
  });

  // Экспортируем в глобальную область
  window.OutboxBatcher = {
    enqueueActivity,
    enqueueSuccess,
    flushAll,
    notifySwToSync,
    getQueueInfo,
  };

  // Инициализация: если в IndexedDB есть неотправленные записи — запускаем таймер
  // (например, после перезагрузки страницы, когда pendingCount сброшен)
  (function init() {
    window.IdbManager.idbGetAll('outbox').then(function (rows) {
      var count = Array.isArray(rows) ? rows.length : 0;
      if (count > 0) {
        state.pendingCount = count;
        _scheduleFlush();
      }
    }).catch(function (e) {
      console.warn(TAG, '[init] ошибка чтения outbox', e);
    });
  })();

})();
