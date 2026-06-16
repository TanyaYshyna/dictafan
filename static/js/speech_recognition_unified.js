(function () {
  if (typeof window === 'undefined') return;

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
    }

    _isAndroidChrome() {
      try {
        const ua = (navigator && navigator.userAgent) ? String(navigator.userAgent) : '';
        return /Android/i.test(ua) && /Chrome\//i.test(ua);
      } catch (e) {
        return false;
      }
    }

    async startRecording() {
      try {
        try { console.log('[UnifiedSpeechRecognition] startRecording ВЫЗВАН, mode=' + this.state.mode + ', language=' + this.state.language); } catch (e) {}
        this._audioChunks = [];
        this._audioBlob = null;
        this._finalText = '';
        this._lastText = '';
        this._ignoreResults = false;
        this._sessionId = (this._sessionId || 0) + 1;

        const am = window.AudioManager;
        if (!am || typeof am.startUserRecording !== 'function') {
          try { console.log('[UnifiedSpeechRecognition] AudioManager not loaded'); } catch (e) {}
          throw new Error('AudioManager_not_loaded');
        }
        const mimeType = this._getSupportedMimeType();
        try { console.log('[UnifiedSpeechRecognition] AudioManager.startUserRecording...'); } catch (e) {}
        const started = await am.startUserRecording({ mimeType });
        try { console.log('[UnifiedSpeechRecognition] AudioManager вернул:', started ? 'ok' : 'null'); } catch (e) {}
        this._mediaStream = started && started.stream ? started.stream : null;
        this._mediaRecorder = started && started.recorder ? started.recorder : null;

        this.state.isRecording = true;
        if (typeof this.callbacks.onRecordingStart === 'function') {
          this.callbacks.onRecordingStart();
        }

        // WebSpeech on Android Chrome is sensitive to the start timing.
        if (this.state.mode === 'online' || this.state.mode === 'route') {
          try {
            const delayMs = this._isAndroidChrome() ? 180 : 0;
            setTimeout(() => {
              try {
                if ((this.state.mode === 'online' || this.state.mode === 'route') && this.state.isRecording) {
                  try { console.log('[UnifiedSpeechRecognition] startRecording: вызываем _initWebSpeech, язык =', this.state.language); } catch (e) {}
                  this._initWebSpeech();
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
            const parts = this.state.mode.split('|');
            const modelSize = parts.length > 1 ? parts[1] : 'base';
            const mm = new window.WhisperModelManager();
            const modelKey = mm._getModelKey('en', modelSize);
            const storedModel = window.WhisperModels && window.WhisperModels.get ? window.WhisperModels.get(modelKey) : null;
            if (!storedModel || !storedModel.recognizer) {
              try { console.log('[UnifiedSpeechRecognition] Whisper model not in memory, loading ' + modelSize + '...'); } catch (e) {}
              // Don't await — load in background, stopRecording() will await if needed.
              this._whisperLoadPromise = mm.loadLanguageModel('en', modelSize);
              this._whisperLoadPromise.then(function() {
                try { console.log('[UnifiedSpeechRecognition] Whisper model loaded'); } catch (e) {}
              }).catch(function(err) {
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
        const isOnline = this.state.mode === 'online' || this.state.mode === 'route';
        const isServer = this.state.mode === 'server';
        const isOffline = this.state.mode && this.state.mode.startsWith('route-off|');
        const rec = this._recognition;
        const mySessionId = this._sessionId;

        // In online mode we MUST finalize on Stop (not cancel), otherwise short utterances
        // never produce a final transcript.
        if (isOnline && rec) {
          this._isFinalizing = true;
          this._finalizePromise = new Promise((resolve, reject) => {
            this._finalizeResolve = resolve;
            this._finalizeReject = reject;
          });

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
          const am = window.AudioManager;
          if (am && typeof am.stopUserRecording === 'function') {
            const stopped = await am.stopUserRecording({ timeoutMs: 4000 });
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
          const FINALIZE_TIMEOUT_MS = 2500;
          try {
            await Promise.race([
              this._finalizePromise,
              new Promise((resolve) => setTimeout(resolve, FINALIZE_TIMEOUT_MS)),
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
            const langCode = this.state.language ? this.state.language.split('-')[0].toLowerCase() : 'en';

            if (typeof this.callbacks.onProcessingStart === 'function') {
              this.callbacks.onProcessingStart();
            }

            const formData = new FormData();
            formData.append('audio', this._audioBlob, 'recording.webm');
            formData.append('lang', langCode);

            const resp = await fetch('/api/speech-recognition/transcribe', {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              throw new Error('Server transcribe failed: ' + resp.status);
            }

            const data = await resp.json();
            const transcribed = data && data.text ? String(data.text).trim() : '';
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
            const parts = this.state.mode.split('|');
            const modelSize = parts.length > 1 ? parts[1] : 'base';
            const langCode = this.state.language ? this.state.language.split('-')[0].toLowerCase() : 'en';

            if (typeof this.callbacks.onProcessingStart === 'function') {
              this.callbacks.onProcessingStart();
            }

            if (window.WhisperModelManager) {
              const mm = new window.WhisperModelManager();
              // Whisper is multilingual — loadLanguageModel uses 'en' as placeholder,
              // the actual language is passed to transcribe().
              const modelKey = mm._getModelKey('en', modelSize);
              const storedModel = window.WhisperModels && window.WhisperModels.get ? window.WhisperModels.get(modelKey) : null;
              if (!storedModel || !storedModel.recognizer) {
                // Model not loaded in memory yet — load it first.
                try { console.log('[UnifiedSpeechRecognition] Whisper model not in memory, loading ' + modelSize + '...'); } catch (e) {}
                await mm.loadLanguageModel('en', modelSize);
                try { console.log('[UnifiedSpeechRecognition] Whisper model loaded'); } catch (e) {}
              }
              const result = await mm.transcribe(this._audioBlob, langCode, modelSize);
              const transcribed = result && result.text ? String(result.text).trim() : '';
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

        const text = (this._finalText || this._lastText || '').trim();
        const result = {
          text,
          audioBlob: this._audioBlob,
          mode: this.state.mode,
          cause,
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

    _initWebSpeech() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this._emitError(new Error('SpeechRecognition API not supported'));
        return;
      }

      // Do not start multiple recognition instances for the same session.
      if (this._recognition) return;

      const isAndroidChrome = this._isAndroidChrome();

      const rec = new SpeechRecognition();
      this._recognition = rec;
      const mySessionId = this._sessionId;
      try { console.log('WWWWWWWWW[UnifiedSpeechRecognition] _initWebSpeech: язык перед rec.start() =', this.state.language); } catch (e) {}
      rec.lang = this.state.language;
      // Android Chrome often returns empty transcripts in continuous+interim mode.
      // Prefer single-utterance recognition with final results.
      rec.interimResults = !isAndroidChrome;
      rec.continuous = !isAndroidChrome;

      rec.onresult = (event) => {
        if (this._ignoreResults) return;
        if (mySessionId !== this._sessionId) return;

        // Accept results both while recording and while finalizing after manual Stop.
        // On some devices SpeechRecognition may emit results before MediaRecorder.onstart
        // flips state.isRecording=true. In that case, still accept results if the
        // underlying MediaRecorder is already in 'recording' state.
        const mrState = (this._mediaRecorder && this._mediaRecorder.state) ? String(this._mediaRecorder.state) : '';
        if (!this.state.isRecording && !this._isFinalizing && mrState !== 'recording') return;
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interim += transcript;
          }
        }
        const full = (finalText + interim).trim();
        this._lastText = full;
        if (finalText.trim()) {
          this._finalText = (this._finalText + ' ' + finalText).trim();
          if (typeof this.callbacks.onFinalTranscript === 'function') {
            this.callbacks.onFinalTranscript(this._finalText);
          }
        }
        if (typeof this.callbacks.onTranscript === 'function') {
          this.callbacks.onTranscript(full, false);
        }

        const el = this.options.transcriptContainer;
        if (el && typeof el === 'object' && 'innerText' in el) {
          try {
            el.innerText = full;
          } catch (e) {
          }
        }
      };

      rec.onerror = (event) => {
        this._emitError(event);
      };

      rec.onend = () => {
        try {
          // Resolve finalization if we were waiting for it.
          if (this._isFinalizing && typeof this._finalizeResolve === 'function') {
            this._finalizeResolve();
          }
        } catch (e) {
        }

        // While recording, WebSpeech on mobile may end unexpectedly.
        // Restart recognition to keep getting results.
        try {
          if (mySessionId !== this._sessionId) return;
          if (this._ignoreResults) return;
          if (this._isFinalizing) return;
          if (!this.state.isRecording) return;
          // rec may throw if started too fast; ignore.
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

    _getSupportedMimeType() {
      const types = [
        'audio/mp4; codecs="mp4a.40.2"',
        'audio/webm; codecs=opus',
        'audio/webm',
      ];
      try {
        return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      } catch (e) {
        return '';
      }
    }
  }

  window.UnifiedSpeechRecognition = UnifiedSpeechRecognition;
})();
