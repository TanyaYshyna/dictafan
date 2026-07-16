(function () {
  if (typeof window === 'undefined') return;

  /**
   * Единый класс для работы с микрофоном.
   *
   * Два режима работы:
   * - `recognition` (по умолчанию) — запись + распознавание речи (WebSpeech / Whisper / сервер)
   * - `record` — только запись аудио, без распознавания (для редактора диктанта)
   *
   * В режиме `record` класс также управляет UI-панелью:
   *   - визуализатор (canvas)
   *   - массив записанных файлов с dropdown
   *   - кнопки: запись/стоп, play, apply
   *   - очистка временных blob URL
   *
   * Options для record-режима:
   *   onApply(filename, blob) — колбек при нажатии "Застосувати"
   *   getRowKey() — функция, возвращающая ключ текущей строки
   *   recordBtn, recordIcon, indicator, visualizer — DOM-элементы или ID
   *   playNewBtn, applyNewBtn, filenameLabel, dropdown, dropdownBtn — DOM-элементы или ID
   */
  class UnifiedSpeechRecognition {
    constructor(options) {
      this.options = options || {};
      this.callbacks = {
        onTranscript: null,
        onFinalTranscript: null,
        onError: null,
        onRecordingStart: null,
        onRecordingStop: null,
        onProcessingStart: null,
        onProcessingEnd: null,
        onPercentUpdate: null,
      };

      this.state = {
        isRecording: false,
        mode: this.options.mode || 'online',
        language: this.options.language || 'en-US',
      };

      /** Режим работы: 'recognition' | 'record' */
      this._mode = options.mode === 'record' ? 'record' : 'recognition';

      this._mediaStream = null;
      this._mediaRecorder = null;
      this._audioChunks = [];
      this._audioBlob = null;
      this._recognition = null;
      this._finalText = '';
      this._lastText = '';
      this._sessionId = 0;
      this._ignoreResults = false;

      this._isFinalizing = false;
      this._finalizePromise = null;
      this._finalizeResolve = null;
      this._finalizeReject = null;

      // Максимальная длительность записи аудио — 30 секунд
      this._maxRecordingDurationMs = 30000;
      this._recordingTimer = null;

      // ---- Поля для record-режима (UI панель) ----
      this._bound = false;

      /** Масив записаних файлів: [{ blob, url, filename, rowKey }] */
      this._files = [];
      /** Індекс вибраного файлу */
      this._selectedIndex = -1;
      /** ID сесії (для імен файлів) */
      this._micSessionId = null;

      // Візуалізатор
      this._viz = {
        ac: null,
        analyser: null,
        source: null,
        raf: null,
        active: false,
        stream: null,
      };

      // DOM-елементи для record-режиму
      this._els = {
        recordBtn: null,
        recordIcon: null,
        indicator: null,
        visualizer: null,
        playNewBtn: null,
        applyNewBtn: null,
        filenameLabel: null,
        dropdown: null,
        dropdownBtn: null,
      };

      if (this._mode === 'record') {
        this._initRecordEls(options);
      }
    }

    /* ========== Ініціалізація DOM-елементів для record-режиму ========== */

    /**
     * Ініціалізує посилання на DOM-елементи для record-режиму.
     * Можна передати в options або будуть знайдені по ID.
     */
    _initRecordEls(options) {
      var byId = function (id) {
        try { return document.getElementById(id); } catch (e) { return null; }
      };

      this._els.recordBtn = options.recordBtn || byId('editorModalSelfRecordBtn');
      this._els.recordIcon = options.recordIcon || byId('editorModalSelfRecordIcon');
      this._els.indicator = options.indicator || byId('editorModalSelfRecordingIndicator');
      this._els.visualizer = options.visualizer || byId('editorModalSelfAudioVisualizer');
      this._els.playNewBtn = options.playNewBtn || byId('editorModalSelfPlayNewBtn');
      this._els.applyNewBtn = options.applyNewBtn || byId('editorModalSelfApplyNewBtn');
      this._els.filenameLabel = options.filenameLabel || byId('editorModalSelfMicFilename');
      this._els.dropdown = options.dropdown || byId('editorModalSelfMicDropdown');
      this._els.dropdownBtn = options.dropdownBtn || byId('editorModalSelfMicDropdownBtn');
    }

    /* ========== Прив'язка обробників подій (record-режим) ========== */

    /**
     * Навішує обробники подій на кнопки (з guard, щоб не дублювати).
     * Викликається зовні після створення екземпляра.
     */
    bindRecordUI() {
      if (this._mode !== 'record') return;
      if (this._bound) return;
      this._bound = true;

      var self = this;

      // Кнопка Record/Stop
      var rb = this._els.recordBtn;
      if (rb && !rb.getAttribute('data-usr-handler')) {
        rb.setAttribute('data-usr-handler', '1');
        rb.addEventListener('click', function () {
          if (self.state.isRecording) {
            self.stopRecording('manual');
          } else {
            self.startRecording();
          }
        });
      }

      // Кнопка Play (прослухати записане)
      var pb = this._els.playNewBtn;
      if (pb && !pb.getAttribute('data-usr-handler')) {
        pb.setAttribute('data-usr-handler', '1');
        pb.addEventListener('click', function () {
          self._playSelected();
        });
      }

      // Кнопка Apply (застосувати записане)
      var ab = this._els.applyNewBtn;
      if (ab && !ab.getAttribute('data-usr-handler')) {
        ab.setAttribute('data-usr-handler', '1');
        ab.addEventListener('click', function () {
          self._applySelected();
        });
      }

      // Кнопка відкриття/закриття dropdown
      var db = this._els.dropdownBtn;
      if (db && !db.getAttribute('data-usr-handler')) {
        db.setAttribute('data-usr-handler', '1');
        db.addEventListener('click', function (e) {
          e.stopPropagation();
          var dd = self._els.dropdown;
          if (!dd) return;
          if (dd.style.display === 'block') {
            dd.style.display = 'none';
          } else {
            self._updateDropdown();
            dd.style.display = 'block';
          }
        });
      }

      // Закриття dropdown при кліку поза ним
      document.addEventListener('click', function (e) {
        var dd = self._els.dropdown;
        var btn = self._els.dropdownBtn;
        if (!dd || !btn) return;
        if (!dd.contains(e.target) && !btn.contains(e.target)) {
          dd.style.display = 'none';
        }
      });
    }

    /* ========== Основний API ========== */

    async startRecording() {
      try {
        // Режим "record" — только запись, без распознавания
        if (this._mode === 'record') {
          return this._startRecordingOnly();
        }

        try { console.log('[UnifiedSpeechRecognition] startRecording ВЫЗВАН, mode=' + this.state.mode + ', language=' + this.state.language); } catch (e) {}
        this._audioChunks = [];
        this._audioBlob = null;
        this._finalText = '';
        this._lastText = '';
        this._ignoreResults = false;
        this._sessionId = (this._sessionId || 0) + 1;

        var am = window.AudioManager;
        if (!am || typeof am.startUserRecording !== 'function') {
          try { console.log('[UnifiedSpeechRecognition] AudioManager not loaded'); } catch (e) {}
          throw new Error('AudioManager_not_loaded');
        }
        var mimeType = this._getSupportedMimeType();
        try { console.log('[UnifiedSpeechRecognition] AudioManager.startUserRecording...'); } catch (e) {}
        var started = await am.startUserRecording({ mimeType: mimeType });
        try { console.log('[UnifiedSpeechRecognition] AudioManager вернул:', started ? 'ok' : 'null'); } catch (e) {}
        this._mediaStream = started && started.stream ? started.stream : null;
        this._mediaRecorder = started && started.recorder ? started.recorder : null;

        this.state.isRecording = true;
        if (typeof this.callbacks.onRecordingStart === 'function') {
          this.callbacks.onRecordingStart();
        }

        // Автоматическая остановка записи через 30 секунд
        this._clearRecordingTimer();
        var mySessionId = this._sessionId;
        var self = this;
        this._recordingTimer = setTimeout(function () {
          try {
            if (self.state.isRecording && mySessionId === self._sessionId) {
              try { console.log('[UnifiedSpeechRecognition] Автостоп: запись длилась более 30с'); } catch (e) {}
              self.stopRecording('max_duration');
            }
          } catch (e) {
            try { console.error('[UnifiedSpeechRecognition] Ошибка в таймере автостопа:', e); } catch (e2) {}
          }
        }, this._maxRecordingDurationMs);

        // WebSpeech on Android Chrome is sensitive to the start timing.
        if (this.state.mode === 'online' || this.state.mode === 'route') {
          try {
            var delayMs = this._isAndroidChrome() ? 180 : 0;
            setTimeout(function () {
              try {
                if ((self.state.mode === 'online' || self.state.mode === 'route') && self.state.isRecording) {
                  try { console.log('[UnifiedSpeechRecognition] startRecording: вызываем _initWebSpeech, язык =', self.state.language); } catch (e) {}
                  self._initWebSpeech();
                }
              } catch (e) {
              }
            }, delayMs);
          } catch (e) {
          }
        }

        // Offline Whisper mode: ensure model is loaded before recording ends.
        if (this.state.mode && this.state.mode.startsWith('route-off|') && window.WhisperModelManager) {
          try {
            var parts = this.state.mode.split('|');
            var modelSize = parts.length > 1 ? parts[1] : 'base';
            var mm = new window.WhisperModelManager();
            var modelKey = mm._getModelKey('en', modelSize);
            var storedModel = window.WhisperModels && window.WhisperModels.get ? window.WhisperModels.get(modelKey) : null;
            if (!storedModel || !storedModel.recognizer) {
              try { console.log('[UnifiedSpeechRecognition] Whisper model not in memory, loading ' + modelSize + '...'); } catch (e) {}
              // Don't await — load in background, stopRecording() will await if needed.
              this._whisperLoadPromise = mm.loadLanguageModel('en', modelSize);
              this._whisperLoadPromise.then(function () {
                try { console.log('[UnifiedSpeechRecognition] Whisper model loaded'); } catch (e) {}
              }).catch(function (err) {
                try { console.error('[UnifiedSpeechRecognition] Whisper load error:', err); } catch (e) {}
              });
            }
          } catch (e) {
            try { console.error('[UnifiedSpeechRecognition] Whisper preload error:', e); } catch (e2) {}
          }
        }
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    async stopRecording(cause) {
      try {
        // Режим "record" — только запись, без распознавания
        if (this._mode === 'record') {
          return this._stopRecordingOnly(cause);
        }

        // Очищаем таймер автоматической остановки записи
        this._clearRecordingTimer();

        var isOnline = this.state.mode === 'online' || this.state.mode === 'route';
        var isServer = this.state.mode === 'server';
        var isOffline = this.state.mode && this.state.mode.startsWith('route-off|');
        var rec = this._recognition;
        var mySessionId = this._sessionId;

        // In online mode we MUST finalize on Stop (not cancel), otherwise short utterances
        // never produce a final transcript.
        if (isOnline && rec) {
          this._isFinalizing = true;
          this._finalizePromise = new Promise(function (resolve, reject) {
            this._finalizeResolve = resolve;
            this._finalizeReject = reject;
          }.bind(this));

          try {
            rec.stop();
          } catch (e) {
            // If stop fails, we still proceed to stop recorder and return what we have.
          }
        } else {
          // Offline/server mode does not use WebSpeech results; ignore any stale events.
          this._ignoreResults = true;
          if (rec) {
            try {
              if (typeof rec.abort === 'function') {
                rec.abort();
              } else {
                rec.stop();
              }
            } catch (e) {
            }
          }
        }

        try {
          var am = window.AudioManager;
          if (am && typeof am.stopUserRecording === 'function') {
            var stopped = await am.stopUserRecording({ timeoutMs: 4000 });
            this._audioBlob = stopped ? stopped.audioBlob : null;
          }
        } catch (e) {
        }

        this.state.isRecording = false;
        if (typeof this.callbacks.onRecordingStop === 'function') {
          this.callbacks.onRecordingStop();
        }

        if (isOnline && rec) {
          // Wait briefly for final results / onend.
          var FINALIZE_TIMEOUT_MS = 2500;
          try {
            await Promise.race([
              this._finalizePromise,
              new Promise(function (resolve) { setTimeout(resolve, FINALIZE_TIMEOUT_MS); }),
            ]);
          } catch (e) {
          }
          // If a new session started while we were finalizing, do not leak results.
          if (mySessionId !== this._sessionId) {
            this._finalText = '';
            this._lastText = '';
          }
        }

        // Server mode: send audio to server-side Whisper endpoint.
        if (isServer && this._audioBlob) {
          try {
            var langCode = this.state.language ? this.state.language.split('-')[0].toLowerCase() : 'en';

            if (typeof this.callbacks.onProcessingStart === 'function') {
              this.callbacks.onProcessingStart();
            }

            var formData = new FormData();
            formData.append('audio', this._audioBlob, 'recording.webm');
            formData.append('lang', langCode);

            var resp = await fetch('/api/speech-recognition/transcribe', {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              throw new Error('Server transcribe failed: ' + resp.status);
            }

            var data = await resp.json();
            var transcribed = data && data.text ? String(data.text).trim() : '';
            this._finalText = transcribed;
            this._lastText = transcribed;

            if (transcribed && typeof this.callbacks.onFinalTranscript === 'function') {
              this.callbacks.onFinalTranscript(transcribed);
            }
            if (transcribed && typeof this.callbacks.onTranscript === 'function') {
              this.callbacks.onTranscript(transcribed, true);
            }

            if (typeof this.callbacks.onProcessingEnd === 'function') {
              this.callbacks.onProcessingEnd();
            }
          } catch (e) {
            try { console.error('[UnifiedSpeechRecognition] Server transcribe error:', e); } catch (e2) {}
            if (typeof this.callbacks.onError === 'function') {
              this.callbacks.onError(e);
            }
          }
        }

        // Offline Whisper mode: transcribe the recorded audio blob locally.
        if (isOffline && this._audioBlob) {
          try {
            var parts = this.state.mode.split('|');
            var modelSize = parts.length > 1 ? parts[1] : 'base';
            var langCode = this.state.language ? this.state.language.split('-')[0].toLowerCase() : 'en';

            if (typeof this.callbacks.onProcessingStart === 'function') {
              this.callbacks.onProcessingStart();
            }

            if (window.WhisperModelManager) {
              var mm = new window.WhisperModelManager();
              var modelKey = mm._getModelKey('en', modelSize);
              var storedModel = window.WhisperModels && window.WhisperModels.get ? window.WhisperModels.get(modelKey) : null;
              if (!storedModel || !storedModel.recognizer) {
                try { console.log('[UnifiedSpeechRecognition] Whisper model not in memory, loading ' + modelSize + '...'); } catch (e) {}
                await mm.loadLanguageModel('en', modelSize);
                try { console.log('[UnifiedSpeechRecognition] Whisper model loaded'); } catch (e) {}
              }
              var result = await mm.transcribe(this._audioBlob, langCode, modelSize);
              var transcribed = result && result.text ? String(result.text).trim() : '';
              this._finalText = transcribed;
              this._lastText = transcribed;

              if (transcribed && typeof this.callbacks.onFinalTranscript === 'function') {
                this.callbacks.onFinalTranscript(transcribed);
              }
              if (transcribed && typeof this.callbacks.onTranscript === 'function') {
                this.callbacks.onTranscript(transcribed, true);
              }
            } else {
              try { console.warn('[UnifiedSpeechRecognition] WhisperModelManager not available for offline mode'); } catch (e) {}
            }

            if (typeof this.callbacks.onProcessingEnd === 'function') {
              this.callbacks.onProcessingEnd();
            }
          } catch (e) {
            try { console.error('[UnifiedSpeechRecognition] Whisper transcribe error:', e); } catch (e2) {}
            if (typeof this.callbacks.onError === 'function') {
              this.callbacks.onError(e);
            }
          }
        }

        var text = (this._finalText || this._lastText || '').trim();
        var result = {
          text: text,
          audioBlob: this._audioBlob,
          mode: this.state.mode,
          cause: cause,
        };

        // Cleanup to avoid stale events in the next session.
        try {
          if (this._recognition) {
            this._recognition.onresult = null;
            this._recognition.onerror = null;
          }
        } catch (e) {
        }

        // Mark finalization complete.
        this._isFinalizing = false;
        this._finalizePromise = null;
        this._finalizeResolve = null;
        this._finalizeReject = null;

        this._recognition = null;
        this._finalText = '';
        this._lastText = '';

        return result;
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    getAudioBlob() {
      return this._audioBlob;
    }

    /* ========== WebSpeech (режим recognition) ========== */

    _initWebSpeech() {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this._emitError(new Error('SpeechRecognition API not supported'));
        return;
      }

      // Do not start multiple recognition instances for the same session.
      if (this._recognition) return;

      var isAndroidChrome = this._isAndroidChrome();

      var rec = new SpeechRecognition();
      this._recognition = rec;
      var mySessionId = this._sessionId;
      try { console.log('WWWWWWWWW[UnifiedSpeechRecognition] _initWebSpeech: язык перед rec.start() =', this.state.language); } catch (e) {}
      rec.lang = this.state.language;
      // Android Chrome often returns empty transcripts in continuous+interim mode.
      // Prefer single-utterance recognition with final results.
      rec.interimResults = !isAndroidChrome;
      rec.continuous = !isAndroidChrome;

      var self = this;

      rec.onresult = function (event) {
        if (self._ignoreResults) return;
        if (mySessionId !== self._sessionId) return;

        var mrState = (self._mediaRecorder && self._mediaRecorder.state) ? String(self._mediaRecorder.state) : '';
        if (!self.state.isRecording && !self._isFinalizing && mrState !== 'recording') return;
        var interim = '';
        var finalText = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var transcript = event.results[i][0] && event.results[i][0].transcript || '';
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interim += transcript;
          }
        }
        var full = (finalText + interim).trim();
        self._lastText = full;
        if (finalText.trim()) {
          self._finalText = (self._finalText + ' ' + finalText).trim();
          if (typeof self.callbacks.onFinalTranscript === 'function') {
            self.callbacks.onFinalTranscript(self._finalText);
          }
        }
        if (typeof self.callbacks.onTranscript === 'function') {
          self.callbacks.onTranscript(full, false);
        }

        var el = self.options.transcriptContainer;
        if (el && typeof el === 'object' && 'innerText' in el) {
          try {
            el.innerText = full;
          } catch (e) {
          }
        }
      };

      rec.onerror = function (event) {
        self._emitError(event);
      };

      rec.onend = function () {
        try {
          if (self._isFinalizing && typeof self._finalizeResolve === 'function') {
            self._finalizeResolve();
          }
        } catch (e) {
        }

        try {
          if (mySessionId !== self._sessionId) return;
          if (self._ignoreResults) return;
          if (self._isFinalizing) return;
          if (!self.state.isRecording) return;
          rec.start();
        } catch (e) {
        }
      };

      try {
        try { console.log('[UnifiedSpeechRecognition] _initWebSpeech: rec.start() с языком', rec.lang); } catch (e) {}
        rec.start();
      } catch (e) {
        try { console.log('[UnifiedSpeechRecognition] _initWebSpeech: rec.start() ошибка:', e); } catch (e2) {}
        this._emitError(e);
      }
    }

    _emitError(err) {
      if (typeof this.callbacks.onError === 'function') {
        try {
          this.callbacks.onError(err);
          return;
        } catch (e) {
        }
      }
      try {
        console.error('UnifiedSpeechRecognition error:', err);
      } catch (e) {
      }
    }

    _clearRecordingTimer() {
      try {
        if (this._recordingTimer) {
          clearTimeout(this._recordingTimer);
          this._recordingTimer = null;
        }
      } catch (e) {
      }
    }

    _getSupportedMimeType() {
      var types = [
        'audio/mp4; codecs="mp4a.40.2"',
        'audio/webm; codecs=opus',
        'audio/webm',
      ];
      try {
        return types.find(function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); }) || '';
      } catch (e) {
        return '';
      }
    }

    /* ========== Режим "record": только запись ========== */

    /**
     * Режим "record": только запись аудио, без распознавания.
     * Используется в редакторе диктанта.
     */
    async _startRecordingOnly() {
      try {
        console.log('[UnifiedSpeechRecognition] _startRecordingOnly');
        this._audioChunks = [];
        this._audioBlob = null;
        this._sessionId = (this._sessionId || 0) + 1;

        if (!this._micSessionId) {
          this._micSessionId = Date.now();
        }

        var mimeType = this._getSupportedMimeType();
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._mediaStream = stream;

        var recorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : undefined);
        this._mediaRecorder = recorder;

        var self = this;
        recorder.ondataavailable = function (e) {
          if (e.data.size > 0) {
            self._audioChunks.push(e.data);
          }
        };

        recorder.onstop = function () {
          self._audioBlob = new Blob(self._audioChunks, { type: 'audio/webm' });
        };

        recorder.start();
        this.state.isRecording = true;

        // Запускаємо візуалізатор
        this._startVisualizer(stream);

        // Оновлюємо UI
        this._updateUiForRecording(true);

        // Автостоп через 30 секунд
        this._clearRecordingTimer();
        var mySessionId = this._sessionId;
        this._recordingTimer = setTimeout(function () {
          try {
            if (self.state.isRecording && mySessionId === self._sessionId) {
              console.log('[UnifiedSpeechRecognition] record: автостоп 30с');
              self.stopRecording('max_duration');
            }
          } catch (e) {
            console.error('[UnifiedSpeechRecognition] record: ошибка таймера', e);
          }
        }, this._maxRecordingDurationMs);
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    /**
     * Режим "record": остановка записи.
     * Возвращает Promise, который резолвится после onstop.
     */
    async _stopRecordingOnly(cause) {
      try {
        console.log('[UnifiedSpeechRecognition] _stopRecordingOnly, cause=' + cause);
        this._clearRecordingTimer();

        if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
          var self = this;
          var stopPromise = new Promise(function (resolve) {
            var originalOnstop = self._mediaRecorder.onstop;
            self._mediaRecorder.onstop = function (e) {
              if (typeof originalOnstop === 'function') {
                originalOnstop.call(self._mediaRecorder, e);
              }
              resolve();
            };
          });

          this._mediaRecorder.stop();
          await stopPromise;
        }

        // Останавливаем треки
        if (this._mediaStream) {
          this._mediaStream.getTracks().forEach(function (t) { t.stop(); });
          this._mediaStream = null;
        }

        this.state.isRecording = false;

        // Зупиняємо візуалізатор
        this._stopVisualizer();

        // Оновлюємо UI
        this._updateUiForRecording(false);

        // Обробляємо завершення запису
        this._onRecordingComplete();

        return {
          audioBlob: this._audioBlob,
          chunks: this._audioChunks,
          mode: 'record',
          cause: cause || 'manual',
        };
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    /**
     * Возвращает записанные chunks (для record-режима).
     */
    getRecordedChunks() {
      return this._audioChunks;
    }

    /* ========== UI-методи для record-режиму ========== */

    /**
     * Колбек після завершення запису.
     * Створює blob, додає в масив, оновлює UI.
     */
    _onRecordingComplete() {
      var blob = this._audioBlob;
      if (!blob) return;

      // Генеруємо ім'я файлу
      var rowKey = typeof this.options.getRowKey === 'function' ? this.options.getRowKey() : 'unknown';
      var n = this._files.length + 1;
      var filename = rowKey + '_mic_' + n + '_' + this._micSessionId + '.webm';
      var url = URL.createObjectURL(blob);

      // Додаємо в масив
      this._files.push({ blob: blob, url: url, filename: filename, rowKey: rowKey });

      // Вибираємо новий файл
      this._selectedIndex = this._files.length - 1;

      // Оновлюємо UI
      this._updateDropdown();
      this._enablePlayApply(true);
      this._updateFilenameLabel();
    }

    /**
     * Відтворює вибраний записаний файл.
     */
    _playSelected() {
      var idx = this._selectedIndex;
      if (idx < 0 || idx >= this._files.length) {
        if (this._files.length > 0) {
          this._selectedIndex = this._files.length - 1;
        } else {
          return;
        }
      }
      var entry = this._files[this._selectedIndex];
      if (!entry || !entry.url) return;

      var audio = new Audio(entry.url);
      audio.play().catch(function (e) {
        console.warn('[UnifiedSpeechRecognition] Помилка відтворення:', e);
      });
    }

    /**
     * Застосовує вибраний файл до поточної строки.
     */
    _applySelected() {
      if (this._files.length === 0) return;

      var idx = this._selectedIndex;
      if (idx < 0 || idx >= this._files.length) {
        this._selectedIndex = this._files.length - 1;
      }

      var entry = this._files[this._selectedIndex];
      if (!entry || !entry.blob || !entry.filename) return;

      // Викликаємо колбек onApply
      if (typeof this.options.onApply === 'function') {
        this.options.onApply(entry.filename, entry.blob);
      }

      // Деактивуємо кнопки
      this._enablePlayApply(false);
    }

    /**
     * Оновлює випадаючий список файлів.
     * Фільтрує файли тільки для поточного рядка.
     */
    _updateDropdown() {
      var dd = this._els.dropdown;
      if (!dd) return;

      var currentRowKey = typeof this.options.getRowKey === 'function' ? this.options.getRowKey() : null;

      // Фільтруємо файли для поточного рядка
      var filesForRow = currentRowKey
        ? this._files.filter(function (f) { return f.rowKey === currentRowKey; })
        : this._files;

      if (filesForRow.length === 0) {
        dd.style.display = 'none';
        return;
      }

      dd.innerHTML = '';
      var self = this;
      filesForRow.forEach(function (entry, idx) {
        var globalIdx = self._files.indexOf(entry);
        var item = document.createElement('div');
        item.className = 'dictation-editor-modal__self-mic-dropdown-item';
        if (globalIdx === self._selectedIndex) {
          item.classList.add('selected');
        }
        item.textContent = entry.filename;
        item.addEventListener('click', function () {
          self._selectFile(globalIdx);
        });
        dd.appendChild(item);
      });
    }

    /**
     * Вибирає файл за індексом.
     */
    _selectFile(index) {
      if (index < 0 || index >= this._files.length) return;
      this._selectedIndex = index;
      this._updateFilenameLabel();
      this._enablePlayApply(true);

      // Закриваємо dropdown
      var dd = this._els.dropdown;
      if (dd) dd.style.display = 'none';
    }

    /**
     * Оновлює лейбу з іменем файлу.
     */
    _updateFilenameLabel() {
      var label = this._els.filenameLabel;
      if (!label) return;
      if (this._selectedIndex >= 0 && this._selectedIndex < this._files.length) {
        label.textContent = this._files[this._selectedIndex].filename;
      } else {
        label.textContent = '\u2014';
      }
    }

    /**
     * Вмикає/вимикає кнопки Play та Apply.
     */
    _enablePlayApply(enabled) {
      var pb = this._els.playNewBtn;
      var ab = this._els.applyNewBtn;
      if (pb) pb.disabled = !enabled;
      if (ab) ab.disabled = !enabled;
    }

    /**
     * Оновлює UI під час/після запису.
     */
    _updateUiForRecording(isRecording) {
      var rb = this._els.recordBtn;
      var ri = this._els.recordIcon;
      var ind = this._els.indicator;

      if (rb) rb.classList.toggle('recording', isRecording);
      if (ri) {
        ri.innerHTML = isRecording
          ? '<i data-lucide="square"></i>'
          : '<i data-lucide="mic"></i>';
      }
      if (ind) ind.classList.toggle('active', isRecording);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Скидає UI до початкового стану.
     */
    resetRecordUI() {
      if (this._mode !== 'record') return;
      this._updateUiForRecording(false);
      this._enablePlayApply(false);
      var label = this._els.filenameLabel;
      if (label) label.textContent = '\u2014';
      var dd = this._els.dropdown;
      if (dd) dd.style.display = 'none';
      var db = this._els.dropdownBtn;
      if (db) db.disabled = true;
    }

    /* ========== Візуалізатор ========== */

    /**
     * Запускає візуалізатор (AudioContext + AnalyserNode + RAF).
     */
    _startVisualizer(stream) {
      try {
        var canvas = this._els.visualizer;
        if (!canvas) return;

        var ac = new (window.AudioContext || window.webkitAudioContext)();
        this._viz.ac = ac;
        this._viz.stream = stream;

        var source = ac.createMediaStreamSource(stream);
        this._viz.source = source;

        var analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        this._viz.analyser = analyser;

        source.connect(analyser);
        this._viz.active = true;

        this._drawVisualizer();
      } catch (e) {
        console.warn('[UnifiedSpeechRecognition] Visualizer init error', e);
      }
    }

    /**
     * Малює стовпчики візуалізатора на canvas.
     */
    _drawVisualizer() {
      var canvas = this._els.visualizer;
      if (!canvas) return;
      var ac = this._viz.ac;
      var analyser = this._viz.analyser;
      if (!ac || !analyser) return;

      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      var bufferLength = analyser.frequencyBinCount;
      var dataArray = new Uint8Array(bufferLength);

      var self = this;
      var draw = function () {
        if (!self._viz.active) return;
        self._viz.raf = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, w, h);

        var barCount = Math.min(bufferLength, 64);
        var barWidth = (w / barCount) * 0.8;
        var gap = (w / barCount) * 0.2;

        for (var i = 0; i < barCount; i++) {
          var value = dataArray[i] / 255;
          var barHeight = value * h;
          var x = i * (barWidth + gap);
          ctx.fillStyle = '#7c5cbf';
          ctx.fillRect(x, h - barHeight, barWidth, barHeight);
        }
      };
      draw();
    }

    /**
     * Зупиняє візуалізатор.
     */
    _stopVisualizer() {
      this._viz.active = false;
      if (this._viz.raf) {
        cancelAnimationFrame(this._viz.raf);
        this._viz.raf = null;
      }
      if (this._viz.source) {
        try { this._viz.source.disconnect(); } catch (e) {}
        this._viz.source = null;
      }
      if (this._viz.analyser) {
        try { this._viz.analyser.disconnect(); } catch (e) {}
        this._viz.analyser = null;
      }
      if (this._viz.ac && this._viz.ac.state !== 'closed') {
        try { this._viz.ac.close(); } catch (e) {}
      }
      this._viz.ac = null;
      this._viz.stream = null;
    }

    /**
     * Повний cleanup record-режиму: зупиняє запис, візуалізатор, звільняє ресурси.
     * Викликається зовні при закритті редактора.
     */
    destroyRecordUI() {
      if (this._mode !== 'record') return;

      // Зупиняємо запис якщо він ще йде
      if (this.state.isRecording) {
        try { this.stopRecording('close'); } catch (e) {}
      }

      // Зупиняємо візуалізатор
      this._stopVisualizer();

      // Звільняємо всі blob URL
      for (var i = 0; i < this._files.length; i++) {
        var entry = this._files[i];
        if (entry.url) {
          URL.revokeObjectURL(entry.url);
        }
      }
      this._files = [];
      this._selectedIndex = -1;
      this._micSessionId = null;

      // Скидаємо UI
      this.resetRecordUI();
    }
  }

  window.UnifiedSpeechRecognition = UnifiedSpeechRecognition;
})();
