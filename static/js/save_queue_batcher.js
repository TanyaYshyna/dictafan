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

      // Генерируем уникальный ключ
      var key = 'save:' + dictId + ':' + Date.now();

      // Очищаем saveData от функций и циклических ссылок
      var cleanPayload = JSON.parse(JSON.stringify(saveData || {}));

      var item = {
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

      if (!window.IdbManager || typeof window.IdbManager.idbPut !== 'function') {
        console.warn(TAG, '[enqueueSave] IdbManager не доступен');
        return null;
      }

      await window.IdbManager.idbPut('draft_save_queue', item);
      console.log(TAG, '[enqueueSave] сохранено в очередь:', key, 'dictationId:', dictId);

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
      return;
    }
    state.flushing = true;

    try {
      if (!_hasToken()) {
        console.log(TAG, '[flushQueue] нет токена — пропускаем');
        return;
      }

      if (!window.IdbManager || typeof window.IdbManager.idbGetAll !== 'function') {
        return;
      }

      var rows = await window.IdbManager.idbGetAll('draft_save_queue');
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return;
      }

      var pendingRows = rows.filter(function (r) {
        return r.type === 'draft_save' && r.status === 'pending';
      });

      if (pendingRows.length === 0) {
        return;
      }

      console.log(TAG, '[flushQueue] отправляю ' + pendingRows.length + ' записей');

      var token = _getToken();
      if (!token) return;

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

          // Успех — удаляем из очереди
          success = true;
        } catch (e) {
          console.warn(TAG, '[flushQueue] ошибка для', item.key, String(e));
        }

        try {
          if (success) {
            await window.IdbManager.idbDelete('draft_save_queue', item.key);
            console.log(TAG, '[flushQueue] запись удалена из очереди:', item.key);
          } else {
            // Возвращаем в pending
            var current = await window.IdbManager.idbGet('draft_save_queue', item.key);
            if (current) {
              current.status = 'pending';
              current.retryCount = (current.retryCount || 0) + 1;
              current.lastError = String(e || 'unknown');
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
        _flushQueue();
      }
    }
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
          if (r.status === 'pending') pending++;
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
    await _flushQueue();
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
