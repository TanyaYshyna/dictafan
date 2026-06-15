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
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    async stopRecording(cause) {
      try {
        const isOnline = this.state.mode === 'online' || this.state.mode === 'route';
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
          // Offline mode does not use WebSpeech results; ignore any stale events.
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
