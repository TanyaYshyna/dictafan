/**
 * OutboxBatcher — модуль для накопления и отправки данных на сервер.
 *
 * Единая очередь (outbox) с единым ключом для activity и success.
 * Ключ: hbd:{userId}:{dictationId}:{positions}:{datePlan}:{dateFact}:{dateStart}
 * — совпадает с уникальным ключом строки в history_by_day.
 *
 * Activity и success — это ОДНО и то же движение. Каждое действие
 * (звезда, полузвезда, аудио) отправляется через enqueueActivity().
 * Если действие является последним (завершает диктант), в него
 * добавляются параметры completionCount=1 и successNumber=N.
 *
 * Принцип работы:
 *   - enqueueActivity() увеличивает счётчики (perfect_count, audio_count и т.д.)
 *     и, если передан completionCount, увеличивает successes
 *   - _flushOutbox() отправляет ДЕЛЬТУ: (текущее_значение - synced_значение)
 *   - После отправки запись НЕ удаляется, а synced_* поля обновляются
 *     до текущих значений
 *
 * Это гарантирует, что даже если activity отправлялась частями,
 * финальный completionCount отправит только то, что ещё не было отправлено.
 *
 * Отправка происходит:
 *   1) По таймеру (BATCH_INTERVAL_MS) — все накопленные данные
 *   2) При завершении диктанта — принудительный flushAll()
 *   3) При появлении интернета (online-событие)
 *
 * Если нет интернета — данные хранятся в IndexedDB до следующей попытки.
 *
 * Использование:
 *   OutboxBatcher.enqueueActivity({ type, count, leadTimeMs, ..., completionCount, successNumber })
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
      success_number: 0,
      money_earned: 0,
      attempts_total: 0,
      // synced_* — значения, которые уже отправлены на сервер
      synced_perfect_count: 0,
      synced_corrected_count: 0,
      synced_audio_count: 0,
      synced_activity_count: 0,
      synced_money_count: 0,
      synced_mistake_count: 0,
      synced_monenumber_of_characters: 0,
      synced_lead_time_ms_total: 0,
      synced_successes: 0,
      synced_money_earned: 0,
      synced_attempts_total: 0,
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
        completionCount = 0,    // 1 если это последнее действие, завершающее диктант
        successNumber = 0,      // номер успеха (например, 12)
      } = params || {};

      console.log(TAG, '[enqueueActivity] params:', { type, dictationId, mistakeCount, numberOfCharacters, moneyCount, sourceGroupId, planDate, completionCount, successNumber });

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

      // Деньги пишем в money_earned — именно это поле _flushOutbox() отправляет на сервер
      // как money_earned (delta), и сервер сохраняет его в money_dt_delta.
      // Поле money_count не используется для отправки на сервер.
      existing.money_earned = (Number(existing.money_earned) || 0) + (Number(moneyCount) || 0);
      existing.mistake_count = (Number(existing.mistake_count) || 0) + (Number(mistakeCount) || 0);
      existing.monenumber_of_characters = (Number(existing.monenumber_of_characters) || 0) + (Number(numberOfCharacters) || 0);
      existing.lead_time_ms_total = (Number(existing.lead_time_ms_total) || 0) + (Number(leadTimeMs) || 0);
      existing.dictation_language_code = dictationLanguageCode || existing.dictation_language_code;

      // Если это последнее действие, завершающее диктант — добавляем completionCount и successNumber
      const compCount = Number(completionCount) || 0;
      const succNumber = Number(successNumber) || 0;
      if (compCount > 0) {
        existing.successes = (Number(existing.successes) || 0) + compCount;
        existing.success_number = succNumber;
      }

      existing.updatedAt = Date.now();

      console.log(TAG, '[enqueueActivity] запись в IDB:', { key, audio_count: existing.audio_count, money_count: existing.money_count, successes: existing.successes, success_number: existing.success_number });
      await window.IdbManager.idbPut('outbox', existing);

      // Если это завершение диктанта — проверяем рекорд.
      // Отправка на сервер (flushAll) будет вызвана ПОСЛЕ того, как
      // showCompletionModal увеличит session.completionCount,
      // чтобы флаг (Number(session.completionCount) || 0) === 0 сработал корректно.
      if (compCount > 0) {
        try {
          await _checkAndSaveRecord({
            dictation_id: dictationId,
            selected_sentence_positions: selectedSentencePositions,
            mistake_count: existing.mistake_count,
            time_ms: existing.lead_time_ms_total,
          }, key);
        } catch (eRec) {
          console.warn(TAG, '[enqueueActivity] ошибка проверки рекорда:', eRec);
        }
      }
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
   * Проверить рекорд локально и, если это рекорд, сохранить его.
   * Вызывается из enqueueActivity() когда передан completionCount.
   */
  async function _checkAndSaveRecord(payload, key) {
    try {
      const recordResult = await _checkRecordLocally(payload, key);
      if (recordResult.is_record && recordResult.record) {
        await _enqueueRecord(recordResult.record);
        console.log(TAG, '[checkAndSaveRecord] новый рекорд!', recordResult.record);
        try {
          document.dispatchEvent(new CustomEvent('dictation-record', {
            detail: {
              is_record: true,
              is_first: recordResult.is_first,
              record: recordResult.record,
            },
          }));
        } catch (eDisp) {
          console.warn(TAG, '[checkAndSaveRecord] ошибка диспатча события:', eDisp);
        }
      }
    } catch (eRec) {
      console.warn(TAG, '[checkAndSaveRecord] ошибка проверки рекорда:', eRec);
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

      // Все activity и success хранятся в единых hbd-записях.
      // Отправляем ДЕЛЬТУ: (текущее_значение - synced_значение).
      // После отправки обновляем synced_* поля (запись НЕ удаляется).
      // dictation_record отправляется отдельно.
      const hbdRows = [];
      const recordRows = [];

      for (const row of rows) {
        if (row.type === 'hbd') {
          hbdRows.push(row);
        } else if (row.type === 'dictation_record') {
          recordRows.push(row);
        }
      }

      const token = _getToken();
      let allOk = true;

      // 1. Отправляем все hbd-записи как success (только дельту)
      for (const row of hbdRows) {
        try {
          const currentRow = await window.IdbManager.idbGet('outbox', row.key);
          if (!currentRow) continue;
          if (currentRow.updatedAt !== row.updatedAt) continue;

          // Вычисляем дельту: что ещё не отправлено
          const perfectDelta = Math.max(0, (Number(currentRow.perfect_count) || 0) - (Number(currentRow.synced_perfect_count) || 0));
          const correctedDelta = Math.max(0, (Number(currentRow.corrected_count) || 0) - (Number(currentRow.synced_corrected_count) || 0));
          const audioDelta = Math.max(0, (Number(currentRow.audio_count) || 0) - (Number(currentRow.synced_audio_count) || 0));
          const mistakeDelta = Math.max(0, (Number(currentRow.mistake_count) || 0) - (Number(currentRow.synced_mistake_count) || 0));
          const monenumberDelta = Math.max(0, (Number(currentRow.monenumber_of_characters) || 0) - (Number(currentRow.synced_monenumber_of_characters) || 0));
          const moneyEarnedDelta = Math.max(0, (Number(currentRow.money_earned) || 0) - (Number(currentRow.synced_money_earned) || 0));
          const leadTimeDelta = Math.max(0, (Number(currentRow.lead_time_ms_total) || 0) - (Number(currentRow.synced_lead_time_ms_total) || 0));
          const attemptsDelta = Math.max(0, (Number(currentRow.attempts_total) || 0) - (Number(currentRow.synced_attempts_total) || 0));
          const successesDelta = Math.max(0, (Number(currentRow.successes) || 0) - (Number(currentRow.synced_successes) || 0));
          const activityCountDelta = Math.max(0, (Number(currentRow.activity_count) || 0) - (Number(currentRow.synced_activity_count) || 0));
          const moneyCountDelta = Math.max(0, (Number(currentRow.money_count) || 0) - (Number(currentRow.synced_money_count) || 0));

          // Если дельта нулевая — пропускаем (нечего отправлять)
          if (perfectDelta === 0 && correctedDelta === 0 && audioDelta === 0 &&
              mistakeDelta === 0 && monenumberDelta === 0 && moneyEarnedDelta === 0 &&
              leadTimeDelta === 0 && attemptsDelta === 0 && successesDelta === 0 &&
              activityCountDelta === 0 && moneyCountDelta === 0) {
            continue;
          }

          const payload = {
            dictation_id: currentRow.dictation_id,
            perfect_count: perfectDelta,
            corrected_count: correctedDelta,
            audio_count: audioDelta,
            mistake_count: mistakeDelta,
            monenumber_of_characters: monenumberDelta,
            money_earned: moneyEarnedDelta,
            time_ms: leadTimeDelta,
            attempts_total: attemptsDelta,
            completion_count: successesDelta,
            activity_count: activityCountDelta,
            money_count: moneyCountDelta,
            lead_time_ms: leadTimeDelta,
            selected_sentence_positions: currentRow.selected_sentence_positions || undefined,
            date_start: currentRow.date_start || undefined,
            plan_date: currentRow.date_plan || undefined,
            source_group_id: currentRow.source_group_id || undefined,
            dictation_language_code: currentRow.dictation_language_code || undefined,
            success_number: currentRow.success_number || undefined,
          };

          console.log('[OB:flushOutbox] hbd->success (delta):', JSON.stringify({
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
            // Обновляем synced_* поля (запись НЕ удаляем)
            const finalRow = await window.IdbManager.idbGet('outbox', row.key);
            if (finalRow && finalRow.updatedAt === currentRow.updatedAt) {
              finalRow.synced_perfect_count = Number(finalRow.perfect_count) || 0;
              finalRow.synced_corrected_count = Number(finalRow.corrected_count) || 0;
              finalRow.synced_audio_count = Number(finalRow.audio_count) || 0;
              finalRow.synced_mistake_count = Number(finalRow.mistake_count) || 0;
              finalRow.synced_monenumber_of_characters = Number(finalRow.monenumber_of_characters) || 0;
              finalRow.synced_money_earned = Number(finalRow.money_earned) || 0;
              finalRow.synced_lead_time_ms_total = Number(finalRow.lead_time_ms_total) || 0;
              finalRow.synced_attempts_total = Number(finalRow.attempts_total) || 0;
              finalRow.synced_successes = Number(finalRow.successes) || 0;
              finalRow.synced_activity_count = Number(finalRow.activity_count) || 0;
              finalRow.synced_money_count = Number(finalRow.money_count) || 0;
              await window.IdbManager.idbPut('outbox', finalRow);
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
      var pending = 0;
      if (Array.isArray(rows)) {
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (r.type === 'hbd') {
            // Считаем сумму дельт как pendingCount
            var delta = 0;
            delta += Math.max(0, (Number(r.perfect_count) || 0) - (Number(r.synced_perfect_count) || 0));
            delta += Math.max(0, (Number(r.corrected_count) || 0) - (Number(r.synced_corrected_count) || 0));
            delta += Math.max(0, (Number(r.audio_count) || 0) - (Number(r.synced_audio_count) || 0));
            delta += Math.max(0, (Number(r.mistake_count) || 0) - (Number(r.synced_mistake_count) || 0));
            delta += Math.max(0, (Number(r.successes) || 0) - (Number(r.synced_successes) || 0));
            if (delta > 0) pending += 1;
          } else if (r.type === 'dictation_record' && !r.synced) {
            pending += 1;
          }
        }
      }
      if (pending > 0) {
        state.pendingCount = pending;
        _scheduleFlush();
      }
    }).catch(function (e) {
      console.warn(TAG, '[init] ошибка чтения outbox', e);
    });
  })();

})();
