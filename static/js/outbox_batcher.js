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

  const BATCH_INTERVAL_MS = 1800000; // 30 минут
  const MAX_BATCH_SIZE = 20; // макс. количество записей в одном батче

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
      completion_count: (Number(prev.completion_count) || 0) + (Number(next.completion_count) || 0),
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
        dateStart,
      } = params || {};

      console.log(TAG, '[enqueueActivity] params:', { type, dictationId, mistakeCount, numberOfCharacters, moneyCount });

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

      const dateId = date || _getLocalDateId();
      const selPosStr = _serializeSelectedPositions(selectedSentencePositions);
      const dateStartStr = dateStart ? dateStart.replace(/[^0-9\-: ]/g, '') : '';
      const key = `act:${userId}:${dateId}:${dictationId}:${selPosStr}:${dateStartStr}`;
      console.log(TAG, '[enqueueActivity] key=' + key + ' dateId=' + dateId + ' dateStart=' + dateStart);

      // Увеличиваем pending-счётчик ДО записи в IndexedDB
      state.pendingCount += 1;
      console.log(TAG, '[enqueueActivity] pendingCount теперь = ' + state.pendingCount);

      // Читаем существующую запись или создаём новую
      const existing = (await window.IdbManager.idbGet('outbox', key)) || {
        key,
        type: 'activity',
        userId,
        date: dateId,
        dictation_id: dictationId,
        selected_sentence_positions: selectedSentencePositions || null,
        date_start: dateStart || null,
        perfect_count: 0,
        corrected_count: 0,
        audio_count: 0,
        activity_count: 0,
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

      // Собираем все success-записи из outbox для этого пользователя и диктанта
      const allRows = await window.IdbManager.idbGetAll('outbox');
      const successRows = allRows.filter(r =>
        r.type === 'success' &&
        r.userId === userId &&
        String(r.payload?.dictation_id).trim() === dictationId &&
        _positionsMatch(r.payload?.selected_sentence_positions, currentPositions) &&
        // Исключаем текущую запись (которая только что была добавлена)
        r.key !== excludeKey
      );

      if (successRows.length === 0) {
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

      // Ищем лучший результат среди всех success (исключая текущий)
      let bestMistakes = currentMistakes;
      let bestTime = currentTime;

      for (const row of successRows) {
        const p = row.payload;
        const m = Number(p.mistake_count) || 0;
        const t = Number(p.time_ms) || 0;

        const isBetter = (m < bestMistakes) || (m === bestMistakes && t < bestTime);
        if (isBetter) {
          bestMistakes = m;
          bestTime = t;
        }
      }

      const isRecord = (bestMistakes === currentMistakes && bestTime === currentTime);

      return {
        is_record: isRecord,
        is_first: false, // если successRows.length > 0, значит это не первый
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
   * Автоматически мержит с существующей записью (суммирует счётчики).
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

      // Проверяем рекорд локально и сохраняем
      // Передаём ключ текущей записи, чтобы исключить её из поиска (иначе is_first никогда не сработает)
      try {
        const recordResult = await _checkRecordLocally(mergedPayload, key);
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

  /**
   * Склеить activity и success в один пакет для отправки одним запросом.
   *
   * ВАЖНО: success payload уже содержит ИТОГОВЫЕ totals, рассчитанные из
   * состояния сессии в showCompletionModal() (totalPerfect, totalCorrected,
   * totalAudio, totalErrors, totalChars, totalMoneyEarned).
   * Activity row содержит те же данные, накопленные по одному за предложение.
   * Суммировать их НЕЛЬЗЯ — это приведёт к удвоению (баг 40/20).
   *
   * Поэтому возвращаем successPayload как есть. Activity row нужна только
   * для того, чтобы знать, что её нужно удалить из outbox после отправки.
   */
  function _mergeActivityIntoSuccess(activityRow, successPayload) {
    // successPayload уже содержит правильные totals из сессии;
    // activity данные не суммируем, чтобы избежать удвоения.
    return {
      ...successPayload,
      selected_sentence_positions: successPayload.selected_sentence_positions || activityRow.selected_sentence_positions || undefined,
      date_start: successPayload.date_start || activityRow.date_start || undefined,
    };
  }

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

      // Группируем строки: для каждого диктанта может быть activity + success.
      // Если есть и activity, и success — склеиваем их в один запрос (success).
      // Если есть только activity — отправляем activity отдельно.
      // dictation_record отправляется отдельно.
      //
      // ВАЖНО: _mergeActivityIntoSuccess НЕ суммирует activity поля в success,
      // потому что success payload уже содержит итоговые totals из сессии.
      // Суммирование привело бы к удвоению (баг 40/20).
      const activityRows = [];    // activity без пары success
      const successRows = [];     // success без пары activity
      const recordRows = [];      // dictation_record

      // Для поиска пары activity+success группируем по ключу диктанта
      const activityByDict = {};  // dictation_id -> activity row
      const successByDict = {};   // dictation_id -> success row

      for (const row of rows) {
        if (row.synced) continue;

        if (row.type === 'activity') {
          const dictKey = String(row.dictation_id);
          activityByDict[dictKey] = row;
        } else if (row.type === 'success') {
          const dictKey = String(row.payload?.dictation_id);
          if (dictKey && dictKey !== 'undefined') {
            successByDict[dictKey] = row;
          } else {
            successRows.push(row);
          }
        } else if (row.type === 'dictation_record') {
          recordRows.push(row);
        }
      }

      // Формируем пары: если для одного диктанта есть и activity, и success —
      // мержим activity в success
      const mergedPairs = []; // { successRow, activityRow }
      const processedDicts = new Set();

      for (const dictKey of Object.keys(activityByDict)) {
        const actRow = activityByDict[dictKey];
        const sucRow = successByDict[dictKey];

        if (sucRow) {
          // Есть и activity, и success — мержим
          mergedPairs.push({ successRow: sucRow, activityRow: actRow });
          processedDicts.add(dictKey);
        } else {
          // Только activity
          activityRows.push(actRow);
        }
      }

      // Success без пары activity
      for (const dictKey of Object.keys(successByDict)) {
        if (!processedDicts.has(dictKey)) {
          successRows.push(successByDict[dictKey]);
        }
      }

      const token = _getToken();
      let allOk = true;

      // 1. Отправляем success с вмерженными activity (один запрос вместо двух)
      for (const { successRow, activityRow } of mergedPairs) {
        try {
          // Перечитываем activity из IDB — если была обновлена, пропускаем
          const currentAct = await window.IdbManager.idbGet('outbox', activityRow.key);
          if (!currentAct) continue;
          if (currentAct.updatedAt !== activityRow.updatedAt) continue;

          // Перечитываем success из IDB
          const currentSuc = await window.IdbManager.idbGet('outbox', successRow.key);
          if (!currentSuc) continue;

          // Склеиваем activity + success в один payload
          const mergedPayload = _mergeActivityIntoSuccess(currentAct, currentSuc.payload);

          console.log('[OB:flushOutbox] mergedPayload:', JSON.stringify({
            dictation_id: mergedPayload.dictation_id,
            perfect_count: mergedPayload.perfect_count,
            corrected_count: mergedPayload.corrected_count,
            audio_count: mergedPayload.audio_count,
            mistake_count: mergedPayload.mistake_count,
            monenumber_of_characters: mergedPayload.monenumber_of_characters,
            money_earned: mergedPayload.money_earned,
            time_ms: mergedPayload.time_ms,
          }));

          const response = await fetch('/api/statistics/success', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mergedPayload),
          });

          if (response.ok) {
            // Удаляем и activity, и success
            await window.IdbManager.idbDelete('outbox', activityRow.key);
            await window.IdbManager.idbDelete('outbox', successRow.key);
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

      // 2. Отправляем оставшиеся activity (без пары success)
      for (const row of activityRows) {
        try {
          const currentRow = await window.IdbManager.idbGet('outbox', row.key);
          if (!currentRow) continue;
          if (currentRow.updatedAt !== row.updatedAt) continue;

          const response = await fetch('/api/statistics/activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              dictation_id: currentRow.dictation_id,
              date: currentRow.date,
              perfect_count: Number(currentRow.perfect_count) || 0,
              corrected_count: Number(currentRow.corrected_count) || 0,
              audio_count: Number(currentRow.audio_count) || 0,
              activity_count: Number(currentRow.activity_count) || 0,
              money_count: Number(currentRow.money_count) || 0,
              mistake_count: Number(currentRow.mistake_count) || 0,
              monenumber_of_characters: Number(currentRow.monenumber_of_characters) || 0,
              lead_time_ms: Number(currentRow.lead_time_ms_total) || 0,
              dictation_language_code: currentRow.dictation_language_code || undefined,
              selected_sentence_positions: currentRow.selected_sentence_positions || undefined,
              date_start: currentRow.date_start || undefined,
            }),
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

      // 3. Отправляем success без пары activity
      for (const row of successRows) {
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
            await window.IdbManager.idbDelete('outbox', row.key);
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

      // 4. Отправляем dictation_record
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
