/**
 * SaveQueueBatcher — очередь сохранения черновиков диктантов.
 *
 * Задача: при нестабильном интернете данные не теряются, а сохраняются
 * в IndexedDB (store `draft_save_queue`) и отправляются на сервер
 * при первой возможности.
 *
 * Принцип работы:
 *   1. enqueueSave() — пишет данные в IndexedDB
 *   2. _flushQueue() — читает все pending-записи и отправляет на сервер
 *   3. При успехе — запись удаляется из очереди
 *   4. При ошибке — запись остаётся, retryCount++ (макс MAX_RETRY_COUNT)
 *   5. Автоматический повтор по таймеру и при online-событии
 *
 * Использование:
 *   SaveQueueBatcher.enqueueSave(dictationId, saveData)
 *   SaveQueueBatcher.flushAll()
 *   SaveQueueBatcher.getQueueInfo()
 */
(function () {
  if (window.SaveQueueBatcher) return;

  const TAG = '[SaveQueueBatcher]';
  const RETRY_BASE_MS = 10000;        // 10 секунд до первого повтора
  const MAX_RETRY_COUNT = 20;          // максимум 20 попыток
  const FLUSH_INTERVAL_MS = 15000;     // проверять очередь раз в 15 секунд
  const MAX_FLUSH_AGE_MS = 180000;     // запись живёт в очереди макс 3 минуты после отправки

  const state = {
    timerId: null,
    flushing: false,
    _retryFlush: false,
  };

  /** Получить токен */
  function _getToken() {
    return (window.UM && window.UM.token) || localStorage.getItem('jwt_token');
  }

  /** Проверить, авторизован ли пользователь */
  function _hasToken() {
    return !!_getToken();
  }

  /**
   * Поставить задачу на сохранение в очередь IndexedDB.
   * @param {string} dictationId — ID диктанта (например 'dict_123')
   * @param {object} saveData — данные для сохранения (как в _handleSave)
   * @returns {Promise<string>} — ключ записи в очереди
   */
  async function enqueueSave(dictationId, saveData) {
    try {
      var dictId = String(dictationId || '').trim();
      if (!dictId) {
        console.warn(TAG, '[enqueueSave] нет dictationId');
        return null;
      }

      if (!window.IdbManager || typeof window.IdbManager.idbPut !== 'function') {
        console.warn(TAG, '[enqueueSave] IdbManager не доступен');
        return null;
      }

      // Очищаем saveData от функций и циклических ссылок
      var cleanPayload = JSON.parse(JSON.stringify(saveData || {}));

      // Не плодим дубликаты: если для этого dictationId уже есть pending/sending запись
      // (например, пользователь сохранил офлайн несколько раз подряд), обновляем её,
      // а не создаём новую. Иначе при восстановлении сети сервер создаст два диктанта
      // из одного dict_<id>.
      var existing = null;
      if (typeof window.IdbManager.idbGetAll === 'function') {
        var rows = await window.IdbManager.idbGetAll('draft_save_queue') || [];
        for (var ri = 0; ri < rows.length; ri++) {
          var r = rows[ri];
          if (r && r.type === 'draft_save' && r.dictationId === dictId &&
              (r.status === 'pending' || r.status === 'sending')) {
            existing = r;
            break;
          }
        }
      }

      var key;
      var item;
      if (existing) {
        key = existing.key;
        item = {
          key: existing.key,
          type: 'draft_save',
          dictationId: dictId,
          payload: cleanPayload,
          status: 'pending',
          createdAt: existing.createdAt || Date.now(),
          updatedAt: Date.now(),
          retryCount: existing.retryCount || 0,
          lastError: existing.lastError || null,
        };
      } else {
        key = 'save:' + dictId + ':' + Date.now();
        item = {
          key: key,
          type: 'draft_save',
          dictationId: dictId,
          payload: cleanPayload,
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          lastError: null,
        };
      }

      await window.IdbManager.idbPut('draft_save_queue', item);
      console.log(TAG, '[enqueueSave] сохранено в очередь:', key, 'dictationId:', dictId, existing ? '(обновлена существующая запись)' : '(новая запись)');

      // Запускаем отправку
      _scheduleFlush();

      return key;
    } catch (e) {
      console.warn(TAG, '[enqueueSave] ошибка:', e);
      return null;
    }
  }

  /**
   * Отправить все pending-записи из очереди на сервер.
   */
  async function _flushQueue() {
    if (state.flushing) {
      state._retryFlush = true;
      return [];
    }
    state.flushing = true;

    // Метданные успешно сохранённых записей (key → { dictation_id, db_id }).
    // Возвращаются наружу, чтобы _handleSave() мог обновить реальный ID нового диктанта.
    var results = [];

    try {
      if (!_hasToken()) {
        console.log(TAG, '[flushQueue] нет токена — пропускаем');
        return results;
      }

      if (!window.IdbManager || typeof window.IdbManager.idbGetAll !== 'function') {
        return results;
      }

      var rows = await window.IdbManager.idbGetAll('draft_save_queue');
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return results;
      }

      // Повторно отправляем и 'pending', и застрявшие 'sending'.
      // Запись может остаться в статусе 'sending', если предыдущий flush
      // упал в момент обновления записи (например, из-за ReferenceError) —
      // такие записи нельзя терять, иначе диктант никогда не попадёт на сервер.
      var pendingRows = rows.filter(function (r) {
        return r.type === 'draft_save' && (r.status === 'pending' || r.status === 'sending');
      });

      if (pendingRows.length === 0) {
        return results;
      }

      console.log(TAG, '[flushQueue] отправляю ' + pendingRows.length + ' записей');

      var token = _getToken();
      if (!token) return results;

      for (var i = 0; i < pendingRows.length; i++) {
        var item = pendingRows[i];

        // Пропускаем если превышен лимит попыток
        if ((item.retryCount || 0) >= MAX_RETRY_COUNT) {
          console.warn(TAG, '[flushQueue] превышен лимит попыток для:', item.key);
          // Помечаем как failed, чтобы не пытаться снова
          try {
            item.status = 'failed';
            item.updatedAt = Date.now();
            await window.IdbManager.idbPut('draft_save_queue', item);
          } catch (e) {}
          continue;
        }

        // Помечаем как sending
        try {
          item.status = 'sending';
          item.updatedAt = Date.now();
          await window.IdbManager.idbPut('draft_save_queue', item);
        } catch (e) {
          continue;
        }

        var success = false;
        var errorMessage = 'unknown';
        var savedMeta = null;

        try {
          // Этап 1: отправляем текст/БД
          console.log(TAG, '[flushQueue] отправляю БД:', item.key);

          var dbResponse = await fetch('/save_dictation_final', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(item.payload),
          });

          if (!dbResponse.ok) {
            throw new Error('HTTP ' + dbResponse.status);
          }

          var dbResult = await dbResponse.json();
          if (!dbResult.success) {
            throw new Error('Server error: ' + (dbResult.error || 'unknown'));
          }

          console.log(TAG, '[flushQueue] БД сохранена:', item.key);

          // Если есть dirty audio — аудио уже должно быть в кеше.
          // Оно будет отправлено при следующей ручной синхронизации.
          // Аудио не шлём из очереди — оно уже обрабатывается через _uploadDraftAudioToB2
          // когда пользователь онлайн.

          // Запоминаем реальные ID (для новых диктантов сервер вернул dict_<id>).
          savedMeta = {
            key: item.key,
            dictation_id: dbResult.dictation_id || null,
            db_id: dbResult.db_id != null ? dbResult.db_id : (dbResult.id != null ? dbResult.id : null),
          };

          // Успех — удаляем из очереди
          success = true;
        } catch (e) {
          errorMessage = String(e && e.message ? e.message : e);
          console.warn(TAG, '[flushQueue] ошибка для', item.key, errorMessage);
        }

        try {
          if (success) {
            await window.IdbManager.idbDelete('draft_save_queue', item.key);
            if (savedMeta) results.push(savedMeta);
            console.log(TAG, '[flushQueue] запись удалена из очереди:', item.key);
          } else {
            // Возвращаем в pending
            var current = await window.IdbManager.idbGet('draft_save_queue', item.key);
            if (current) {
              current.status = 'pending';
              current.retryCount = (current.retryCount || 0) + 1;
              current.lastError = errorMessage;
              current.updatedAt = Date.now();
              await window.IdbManager.idbPut('draft_save_queue', current);
            }
          }
        } catch (e2) {
          console.warn(TAG, '[flushQueue] ошибка обновления записи:', String(e2));
        }
      }
    } catch (e) {
      console.warn(TAG, '[flushQueue] ошибка:', e);
    } finally {
      state.flushing = false;
      if (state._retryFlush) {
        state._retryFlush = false;
        // Повторный flush (если он был запрошен во время текущего) — результаты склеиваем.
        var nested = await _flushQueue();
        if (Array.isArray(nested)) results = results.concat(nested);
      }
    }

    return results;
  }

  /** Запланировать периодическую проверку очереди */
  function _scheduleFlush() {
    if (state.timerId) return;
    state.timerId = setTimeout(function () {
      state.timerId = null;
      _flushQueue();
    }, FLUSH_INTERVAL_MS);
  }

  /** Получить информацию об очереди */
  async function getQueueInfo() {
    try {
      if (!window.IdbManager || typeof window.IdbManager.idbGetAll !== 'function') {
        return { total: 0, pending: 0, failed: 0 };
      }
      var rows = await window.IdbManager.idbGetAll('draft_save_queue') || [];
      var total = 0;
      var pending = 0;
      var failed = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.type === 'draft_save') {
          total++;
          // 'sending' считаем как pending: запись ещё не подтверждена сервером.
          // Иначе _handleSave() увидит pending===0 и ошибочно решит, что всё сохранено.
          if (r.status === 'pending' || r.status === 'sending') pending++;
          if (r.status === 'failed') failed++;
        }
      }
      return { total: total, pending: pending, failed: failed };
    } catch (e) {
      return { total: 0, pending: 0, failed: 0 };
    }
  }

  /** Принудительно запустить отправку */
  async function flushAll() {
    return await _flushQueue();
  }

  // Экспортируем
  window.SaveQueueBatcher = {
    enqueueSave: enqueueSave,
    flushAll: flushAll,
    getQueueInfo: getQueueInfo,
  };

  // Инициализация
  (function init() {
    // Если после перезагрузки в очереди есть записи — пытаемся отправить
    if (navigator.onLine) {
      setTimeout(_flushQueue, 1000);
    }

    // Слушаем online-событие
    window.addEventListener('online', function () {
      console.log(TAG, '[online] появился интернет — пробуем отправить');
      _flushQueue();
    });
  })();

  console.log(TAG, 'инициализирован');
})();
