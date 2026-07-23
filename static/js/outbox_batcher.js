/**
 * OutboxBatcher — модуль для накопления и отправки данных на сервер.
 *
 * Единая очередь (outbox) с единым ключом для activity и success.
 * Ключ: hbd:{userId}:{dictationId}:{positions}:{datePlan}:{dateFact}:{dateStart}
 * — совпадает с уникальным ключом строки в history_by_day.
 *
 * Activity и success суммируются в одну и ту же запись в IDB.
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

  const BATCH_INTERVAL_MS = 300000; // 5 минут — для тестирования (потом вернуть 1800000)

  const TAG = '[OutboxBatcher]';

  const state = {
    timerId: null,
    timerStartedAt: null,
    pendingCount: 0,
    flushing: false,
    /** Если true — после завершения текущего flush запустить ещё один */
    _retryFlush: false,
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


  // ======================== ЕДИНАЯ ОЧЕРЕДЬ ========================

  /**
   * Построить единый ключ для history_by_day.
   * Формат: hbd:{userId}:{dictationId}:{positions}:{datePlan}:{dateFact}:{dateStart}
   * Совпадает с уникальным ключом строки в history_by_day (без teacher_id — он резолвится на сервере).
   */
  function _buildHbdKey({ userId, dictationId, positions, datePlan, dateFact, dateStart }) {
    const selPosStr = _serializeSelectedPositions(positions);
    const dp = datePlan ? String(datePlan).replace(/[^0-9\-]/g, '') : '';
    const df = dateFact ? String(dateFact).replace(/[^0-9\-]/g, '') : '';
    const ds = dateStart ? String(dateStart).replace(/[^0-9\-: ]/g, '') : '';
    return `hbd:${userId}:${dictationId}:${selPosStr}:${dp}:${df}:${ds}`;
  }

  /**
   * Создать базовый объект записи hbd для IDB.
   */
  function _createHbdRecord(key, params) {
    return {
      key,
      type: 'hbd',
      userId: params.userId,
      dictation_id: params.dictationId,
      selected_sentence_positions: params.selectedSentencePositions || null,
      date_start: params.dateStart || null,
      date_plan: params.datePlan || null,
      date_fact: params.dateFact || null,
      source_group_id: params.sourceGroupId || null,
      dictation_language_code: params.dictationLanguageCode || null,
      perfect_count: 0,
      corrected_count: 0,
      audio_count: 0,
      activity_count: 0,
      money_count: 0,
      mistake_count: 0,
      monenumber_of_characters: 0,
      lead_time_ms_total: 0,
      successes: 0,
      money_earned: 0,
      attempts_total: 0,
      updatedAt: 0,
    };
  }

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
        dateStart,
        sourceGroupId,
        planDate,
      } = params || {};

      console.log(TAG, '[enqueueActivity] params:', { type, dictationId, mistakeCount, numberOfCharacters, moneyCount, sourceGroupId, planDate });

      if (!dictationId || !type) {
        console.warn(TAG, '[1a] enqueueActivity: пропущено (нет dictationId или type)', { dictationId, type });
        return false;
      }

      const userId = _getUserId();
      console.log(TAG, '[enqueueActivity] userId=' + userId);
      if (!userId) {
        console.warn(TAG, '[1c] enqueueActivity: пропущено (нет userId)');
        return false;
      }

      const dateFact = date || _getLocalDateId();
      const datePlanVal = planDate || dateFact; // если planDate нет, datePlan = dateFact
      const dateStartStr = dateStart ? dateStart.replace(/[^0-9\-: ]/g, '') : '';
      const key = _buildHbdKey({
        userId,
        dictationId,
        positions: selectedSentencePositions,
        datePlan: datePlanVal,
        dateFact,
        dateStart: dateStartStr,
      });
      console.log(TAG, '[enqueueActivity] key=' + key + ' dateFact=' + dateFact + ' datePlan=' + datePlanVal + ' dateStart=' + dateStartStr);

      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingCount += 1;
      console.log(TAG, '[enqueueActivity] pendingCount теперь = ' + state.pendingCount);

      // Читаем существующую запись или создаём новую
      const existing = (await window.IdbManager.idbGet('outbox', key)) || _createHbdRecord(key, {
        userId,
        dictationId,
        selectedSentencePositions,
        dateStart: dateStartStr,
        datePlan: datePlanVal,
        dateFact,
        sourceGroupId,
        dictationLanguageCode,
      });

      // Обновляем source_group_id если передан (может быть только при первом создании)
      if (sourceGroupId && !existing.source_group_id) {
        existing.source_group_id = sourceGroupId;
      }

      const n = Number(count) || 0;
      if (type === 'perfect') existing.perfect_count += n;
      if (type === 'corrected') existing.corrected_count += n;
      if (type === 'audio') existing.audio_count += n;
      if (type === 'activity') existing.activity_count += n;

      existing.money_count = (Number(existing.money_count) || 0) + (Number(moneyCount) || 0);
      existing.mistake_count = (Number(existing.mistake_count) || 0) + (Number(mistakeCount) || 0);
      existing.monenumber_of_characters = (Number(existing.monenumber_of_characters) || 0) + (Number(numberOfCharacters) || 0);
      existing.lead_time_ms_total = (Number(existing.lead_time_ms_total) || 0) + (Number(leadTimeMs) || 0);
      existing.dictation_language_code = dictationLanguageCode || existing.dictation_language_code;
      existing.updatedAt = Date.now();

      console.log(TAG, '[enqueueActivity] запись в IDB:', { key, audio_count: existing.audio_count, money_count: existing.money_count });
      await window.IdbManager.idbPut('outbox', existing);

      _scheduleFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[1err] enqueueActivity: ошибка', e);
      return false;
    }
  }

  /**
   * Нормализовать позиции для сравнения: отсортированный массив чисел.
   */
  function _normalizePositions(pos) {
    try {
      if (pos == null) return [];
      if (Array.isArray(pos)) {
        return [...new Set(pos.map(Number).filter(v => !isNaN(v) && v > 0))].sort((a, b) => a - b);
      }
      if (typeof pos === 'string') {
        try {
          const parsed = JSON.parse(pos);
          if (Array.isArray(parsed)) return _normalizePositions(parsed);
        } catch (e) {}
        return [];
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Проверить, являются ли два набора позиций одинаковыми (для сравнения рекордов).
   */
  function _positionsMatch(a, b) {
    const na = _normalizePositions(a);
    const nb = _normalizePositions(b);
    if (na.length !== nb.length) return false;
    return na.every((v, i) => v === nb[i]);
  }

  /**
   * Локально проверить, является ли текущий результат рекордом,
   * анализируя все success-записи в IndexedDB для данного пользователя/диктанта/позиций.
   *
   * @param {Object} currentPayload - текущий success payload
   * @returns {Promise<{is_record: boolean, record: Object|null, is_first: boolean}>}
   */
  async function _checkRecordLocally(currentPayload, excludeKey) {
    try {
      const userId = _getUserId();
      if (!userId) return { is_record: false, record: null, is_first: false };

      const dictationId = String(currentPayload.dictation_id).trim();
      const currentPositions = _normalizePositions(currentPayload.selected_sentence_positions);
      const currentMistakes = Number(currentPayload.mistake_count) || 0;
      const currentTime = Number(currentPayload.time_ms) || 0;

      // Собираем все hbd-записи из outbox для этого пользователя и диктанта
      const allRows = await window.IdbManager.idbGetAll('outbox');
      const hbdRows = allRows.filter(r =>
        r.type === 'hbd' &&
        r.userId === userId &&
        String(r.dictation_id).trim() === dictationId &&
        _positionsMatch(r.selected_sentence_positions, currentPositions) &&
        // Исключаем текущую запись (которая только что была добавлена)
        r.key !== excludeKey
      );

      if (hbdRows.length === 0) {
        // Нет других завершений — это первый рекорд
        return {
          is_record: true,
          is_first: true,
          record: {
            dictation_id: dictationId,
            positions: currentPositions,
            lead_time: currentTime,
            mistake_count: currentMistakes,
          },
        };
      }

      // Ищем лучший результат среди всех hbd (исключая текущий)
      let bestMistakes = currentMistakes;
      let bestTime = currentTime;

      for (const row of hbdRows) {
        const m = Number(row.mistake_count) || 0;
        const t = Number(row.lead_time_ms_total) || 0;

        const isBetter = (m < bestMistakes) || (m === bestMistakes && t < bestTime);
        if (isBetter) {
          bestMistakes = m;
          bestTime = t;
        }
      }

      const isRecord = (bestMistakes === currentMistakes && bestTime === currentTime);

      return {
        is_record: isRecord,
        is_first: false, // если hbdRows.length > 0, значит это не первый
        record: isRecord ? {
          dictation_id: dictationId,
          positions: currentPositions,
          lead_time: bestTime,
          mistake_count: bestMistakes,
        } : null,
      };
    } catch (e) {
      console.warn(TAG, '[checkRecordLocally] ошибка:', e);
      return { is_record: false, record: null, is_first: false };
    }
  }

  /**
   * Сохранить запись о рекорде в outbox.
   */
  async function _enqueueRecord(recordData) {
    try {
      const userId = _getUserId();
      if (!userId) return false;

      const dictationId = String(recordData.dictation_id).trim();
      const positions = _normalizePositions(recordData.positions);
      const posKey = positions.length > 0 ? positions.join(',') : 'all';
      const key = `rec:${userId}:${dictationId}:${posKey}`;

      await window.IdbManager.idbPut('outbox', {
        key,
        type: 'dictation_record',
        userId,
        createdAt: Date.now(),
        payload: recordData,
      });

      return true;
    } catch (e) {
      console.warn(TAG, '[enqueueRecord] ошибка:', e);
      return false;
    }
  }

  /**
   * Добавить success-данные в очередь (завершение диктанта).
   * Использует единый ключ hbd:{userId}:{dictationId}:{positions}:{datePlan}:{dateFact}:{dateStart},
   * совпадающий с уникальным ключом строки в history_by_day.
   * Данные суммируются с уже существующей hbd-записью (activity + success в одной строке).
   * После сохранения success — проверяет рекорд локально и сохраняет record.
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

      const dictationId = String(payload.dictation_id).trim();
      const dateFact = payload.date || _getLocalDateId();
      const datePlanVal = payload.plan_date || dateFact;
      const dateStartStr = payload.date_start ? String(payload.date_start).replace(/[^0-9\-: ]/g, '') : '';
      const key = _buildHbdKey({
        userId,
        dictationId,
        positions: payload.selected_sentence_positions,
        datePlan: datePlanVal,
        dateFact,
        dateStart: dateStartStr,
      });

      console.log(TAG, '[enqueueSuccess] key=' + key);

      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingCount += 1;

      // Читаем существующую hbd-запись или создаём новую
      const existing = (await window.IdbManager.idbGet('outbox', key)) || _createHbdRecord(key, {
        userId,
        dictationId,
        selectedSentencePositions: payload.selected_sentence_positions,
        dateStart: dateStartStr,
        datePlan: datePlanVal,
        dateFact,
        sourceGroupId: payload.source_group_id || null,
        dictationLanguageCode: payload.dictation_language_code || null,
      });

      // Суммируем success-поля в hbd-запись
      existing.perfect_count = (Number(existing.perfect_count) || 0) + (Number(payload.perfect_count) || 0);
      existing.corrected_count = (Number(existing.corrected_count) || 0) + (Number(payload.corrected_count) || 0);
      existing.audio_count = (Number(existing.audio_count) || 0) + (Number(payload.audio_count) || 0);
      existing.mistake_count = (Number(existing.mistake_count) || 0) + (Number(payload.mistake_count) || 0);
      existing.monenumber_of_characters = (Number(existing.monenumber_of_characters) || 0) + (Number(payload.monenumber_of_characters) || 0);
      existing.money_earned = (Number(existing.money_earned) || 0) + (Number(payload.money_earned) || 0);
      existing.lead_time_ms_total = (Number(existing.lead_time_ms_total) || 0) + (Number(payload.time_ms) || 0);
      existing.attempts_total = (Number(existing.attempts_total) || 0) + (Number(payload.attempts_total) || 0);
      existing.successes = (Number(existing.successes) || 0) + (Number(payload.completion_count) || 1);

      // source_group_id — если был передан и ещё не установлен
      if (payload.source_group_id && !existing.source_group_id) {
        existing.source_group_id = payload.source_group_id;
      }
      // dictation_language_code
      if (payload.dictation_language_code) {
        existing.dictation_language_code = payload.dictation_language_code;
      }

      existing.updatedAt = Date.now();

      console.log(TAG, '[enqueueSuccess] запись в IDB:', {
        key,
        perfect_count: existing.perfect_count,
        corrected_count: existing.corrected_count,
        audio_count: existing.audio_count,
        mistake_count: existing.mistake_count,
        successes: existing.successes,
      });

      await window.IdbManager.idbPut('outbox', existing);

      // Проверяем рекорд локально и сохраняем
      try {
        const recordResult = await _checkRecordLocally(payload, key);
        if (recordResult.is_record && recordResult.record) {
          await _enqueueRecord(recordResult.record);
          console.log(TAG, '[enqueueSuccess] новый рекорд!', recordResult.record);
          // Диспатчим событие для dictation_modal.js
          try {
            document.dispatchEvent(new CustomEvent('dictation-record', {
              detail: {
                is_record: true,
                is_first: recordResult.is_first,
                record: recordResult.record,
              },
            }));
          } catch (eDisp) {
            console.warn(TAG, '[enqueueSuccess] ошибка диспатча события:', eDisp);
          }
        }
      } catch (eRec) {
        console.warn(TAG, '[enqueueSuccess] ошибка проверки рекорда:', eRec);
      }

      _scheduleFlush();

      return true;
    } catch (e) {
      console.warn(TAG, '[5err] enqueueSuccess: ошибка', e);
      return false;
    }
  }

  // ======================== ТАЙМЕР ========================

  /** Запланировать отправку outbox — только по таймеру (раз в 30 минут) */
  function _scheduleFlush() {
    if (state.timerId) {
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
      state._retryFlush = true;
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

      // В новой архитектуре все activity и success хранятся в единых hbd-записях.
      // Отправляем все hbd-записи как POST /api/statistics/success.
      // dictation_record отправляется отдельно.
      const hbdRows = [];
      const recordRows = [];

      for (const row of rows) {
        if (row.synced) continue;
        if (row.type === 'hbd') {
          hbdRows.push(row);
        } else if (row.type === 'dictation_record') {
          recordRows.push(row);
        }
      }

      const token = _getToken();
      let allOk = true;

      // 1. Отправляем все hbd-записи как success
      for (const row of hbdRows) {
        try {
          const currentRow = await window.IdbManager.idbGet('outbox', row.key);
          if (!currentRow) continue;
          if (currentRow.updatedAt !== row.updatedAt) continue;

          const payload = {
            dictation_id: currentRow.dictation_id,
            perfect_count: Number(currentRow.perfect_count) || 0,
            corrected_count: Number(currentRow.corrected_count) || 0,
            audio_count: Number(currentRow.audio_count) || 0,
            mistake_count: Number(currentRow.mistake_count) || 0,
            monenumber_of_characters: Number(currentRow.monenumber_of_characters) || 0,
            money_earned: Number(currentRow.money_earned) || 0,
            time_ms: Number(currentRow.lead_time_ms_total) || 0,
            attempts_total: Number(currentRow.attempts_total) || 0,
            completion_count: Number(currentRow.successes) || 0,
            activity_count: Number(currentRow.activity_count) || 0,
            money_count: Number(currentRow.money_count) || 0,
            lead_time_ms: Number(currentRow.lead_time_ms_total) || 0,
            selected_sentence_positions: currentRow.selected_sentence_positions || undefined,
            date_start: currentRow.date_start || undefined,
            plan_date: currentRow.date_plan || undefined,
            source_group_id: currentRow.source_group_id || undefined,
            dictation_language_code: currentRow.dictation_language_code || undefined,
          };

          console.log('[OB:flushOutbox] hbd->success:', JSON.stringify({
            dictation_id: payload.dictation_id,
            perfect_count: payload.perfect_count,
            corrected_count: payload.corrected_count,
            audio_count: payload.audio_count,
            mistake_count: payload.mistake_count,
            completion_count: payload.completion_count,
            source_group_id: payload.source_group_id,
            plan_date: payload.plan_date,
          }));

          const response = await fetch('/api/statistics/success', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const finalRow = await window.IdbManager.idbGet('outbox', row.key);
            if (finalRow && finalRow.updatedAt === currentRow.updatedAt) {
              await window.IdbManager.idbDelete('outbox', row.key);
            }
          } else if (response.status === 401) {
            allOk = false;
            break;
          } else {
            allOk = false;
            break;
          }
        } catch (e) {
          allOk = false;
          break;
        }
      }

      if (!allOk) {
        state.flushing = false;
        return;
      }

      // 2. Отправляем dictation_record
      for (const row of recordRows) {
        try {
          const response = await fetch('/api/statistics/dictation-record/save', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(row.payload),
          });

          if (response.ok) {
            const respData = await response.json();
            if (respData && respData.record) {
              const serverRecord = respData.record;
              const updatedPayload = {
                dictation_id: serverRecord.dictation_id || row.payload.dictation_id,
                positions: serverRecord.positions || row.payload.positions,
                lead_time: serverRecord.lead_time || 0,
                mistake_count: serverRecord.mistake_count || 0,
              };
              await window.IdbManager.idbPut('outbox', {
                key: row.key,
                type: 'dictation_record',
                userId: row.userId,
                createdAt: row.createdAt,
                payload: updatedPayload,
                synced: true,
              });
            } else {
              await window.IdbManager.idbPut('outbox', {
                key: row.key,
                type: 'dictation_record',
                userId: row.userId,
                createdAt: row.createdAt,
                payload: row.payload,
                synced: true,
              });
            }
          } else if (response.status === 401) {
            allOk = false;
            break;
          } else {
            allOk = false;
            break;
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
      if (state._retryFlush) {
        state._retryFlush = false;
        setTimeout(() => _flushOutbox(), 0);
      }
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

    // Если flush уже выполняется, _flushOutbox установит _retryFlush=true
    // и после завершения текущего flush запустит повторный
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
      // потому что activity и success мержатся в единую hbd-запись по ключу
      // и в IDB всегда может быть 1 запись, хотя enqueueActivity/enqueueSuccess вызывались много раз.
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

  /**
   * Получить текущий рекорд для диктанта из IndexedDB (локально).
   * @param {string|number} dictationId
   * @param {number[]} [positions]
   * @returns {Promise<Object|null>}
   */
  async function getRecord(dictationId, positions) {
    try {
      const userId = _getUserId();
      if (!userId || !dictationId) return null;

      const dictId = String(dictationId).trim();
      const pos = _normalizePositions(positions);
      const posKey = pos.length > 0 ? pos.join(',') : 'all';
      const key = `rec:${userId}:${dictId}:${posKey}`;

      const row = await window.IdbManager.idbGet('outbox', key);
      return row ? (row.payload || null) : null;
    } catch (e) {
      console.warn(TAG, '[getRecord] ошибка:', e);
      return null;
    }
  }

  /**
   * Синхронизировать рекорд с сервера и обновить в IndexedDB.
   * Вызывается при открытии диктанта, если есть интернет.
   * @param {string|number} dictationId
   * @param {number[]} [positions]
   * @returns {Promise<Object|null>} актуальный record с сервера или null
   */
  async function syncRecordFromServer(dictationId, positions) {
    try {
      const userId = _getUserId();
      if (!userId || !dictationId) return null;

      const token = window.UM?.token || localStorage.getItem('jwt_token');
      if (!token) return null;

      const resp = await fetch('/api/statistics/dictation-record', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dictation_id: dictationId,
          selected_sentence_positions: positions,
        }),
      });
      if (!resp.ok) return null;

      const data = await resp.json();
      if (!data || !data.record) return null;

      const serverRecord = data.record;

      // Сохраняем актуальный record в IndexedDB
      const dictId = String(dictationId).trim();
      const pos = _normalizePositions(positions);
      const posKey = pos.length > 0 ? pos.join(',') : 'all';
      const key = `rec:${userId}:${dictId}:${posKey}`;

      await window.IdbManager.idbPut('outbox', {
        key,
        type: 'dictation_record',
        userId,
        createdAt: Date.now(),
        payload: {
          dictation_id: serverRecord.dictation_id || dictationId,
          positions: serverRecord.positions || pos,
          lead_time: serverRecord.lead_time || 0,
          mistake_count: serverRecord.mistake_count || 0,
        },
      });

      return serverRecord;
    } catch (e) {
      console.warn(TAG, '[syncRecordFromServer] ошибка:', e);
      return null;
    }
  }

  /**
   * Синхронизировать все рекорды пользователя с сервера.
   * Вызывается при загрузке страницы, если есть интернет.
   * Сохраняет полученные рекорды в IndexedDB как synced: true (кеш для офлайн-доступа).
   * @returns {Promise<boolean>}
   */
  async function syncAllRecordsFromServer() {
    try {
      const userId = _getUserId();
      if (!userId) return false;

      const token = _getToken();
      if (!token) return false;

      if (!navigator.onLine) return false;

      const resp = await fetch('/api/statistics/dictation-records/all', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) return false;

      const data = await resp.json();
      if (!data || !data.records || !Array.isArray(data.records)) return false;

      // Сохраняем все рекорды в IndexedDB
      for (const serverRecord of data.records) {
        const dictId = String(serverRecord.dictation_id).trim();
        const pos = _normalizePositions(serverRecord.positions);
        const posKey = pos.length > 0 ? pos.join(',') : 'all';
        const key = 'rec:' + userId + ':' + dictId + ':' + posKey;

        await window.IdbManager.idbPut('outbox', {
          key: key,
          type: 'dictation_record',
          userId: userId,
          createdAt: Date.now(),
          payload: {
            dictation_id: serverRecord.dictation_id,
            positions: serverRecord.positions || pos,
            lead_time: serverRecord.lead_time || 0,
            mistake_count: serverRecord.mistake_count || 0,
          },
          synced: true,
        });
      }

      console.log(TAG, '[syncAllRecordsFromServer] синхронизировано ' + data.records.length + ' рекордов');
      return true;
    } catch (e) {
      console.warn(TAG, '[syncAllRecordsFromServer] ошибка:', e);
      return false;
    }
  }

  // Экспортируем в глобальную область
  window.OutboxBatcher = {
    enqueueActivity,
    enqueueSuccess,
    flushAll,
    notifySwToSync,
    getQueueInfo,
    getRecord,
    syncRecordFromServer,
    syncAllRecordsFromServer,
  };

  // Инициализация: если в IndexedDB есть неотправленные записи — запускаем таймер
  // (например, после перезагрузки страницы, когда pendingCount сброшен)
  // Также синхронизируем рекорды с сервера при загрузке страницы (если есть интернет)
  (function init() {
    // Синхронизируем рекорды с сервера при загрузке страницы (если есть интернет)
    if (navigator.onLine) {
      syncAllRecordsFromServer().catch(function (e) {
        console.warn(TAG, '[init] ошибка синхронизации рекордов:', e);
      });
    }

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
