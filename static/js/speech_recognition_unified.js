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

    async startRecording() {
      try {
        this._audioChunks = [];
        this._audioBlob = null;
        this._finalText = '';
        this._lastText = '';
        this._ignoreResults = false;
        this._sessionId = (this._sessionId || 0) + 1;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._mediaStream = stream;

        const mimeType = this._getSupportedMimeType();
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this._mediaRecorder = mr;

        mr.ondataavailable = (e) => {
          if (e.data && e.data.size) this._audioChunks.push(e.data);
        };

        mr.onerror = (e) => {
          this._emitError(e?.error || e);
        };

        mr.onstart = () => {
          this.state.isRecording = true;
          if (typeof this.callbacks.onRecordingStart === 'function') {
            this.callbacks.onRecordingStart();
          }
        };

        mr.onstop = () => {
          this.state.isRecording = false;
          const blobType = (mr.mimeType && mr.mimeType.includes('mp4')) ? 'audio/mp4' : (mr.mimeType || 'audio/webm');
          this._audioBlob = new Blob(this._audioChunks, { type: blobType });
          if (typeof this.callbacks.onRecordingStop === 'function') {
            this.callbacks.onRecordingStop();
          }
        };

        if (this.state.mode === 'online') {
          this._initWebSpeech();
        }

        mr.start();
      } catch (e) {
        this._emitError(e);
        throw e;
      }
    }

    async stopRecording(cause) {
      try {
        const isOnline = this.state.mode === 'online';
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

        // MediaRecorder 'stop' event may occasionally never fire in some browsers / edge cases.
        // We must never hang here, otherwise the UI stays on "Распознаю..." forever.
        if (this._mediaRecorder) {
          const mr = this._mediaRecorder;
          const mrState = (mr && mr.state) ? String(mr.state) : '';
          if (mrState === 'recording') {
            const STOP_TIMEOUT_MS = 4000;
            await Promise.race([
              new Promise((resolve) => {
                const done = () => resolve();
                try {
                  mr.addEventListener('stop', done, { once: true });
                } catch (e) {
                  resolve();
                  return;
                }
                try {
                  mr.stop();
                } catch (e) {
                  resolve();
                }
              }),
              new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
            ]);
          }
        }

        if (this._mediaStream) {
          for (const t of this._mediaStream.getTracks()) {
            try {
              t.stop();
            } catch (e) {
            }
          }
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

      const rec = new SpeechRecognition();
      this._recognition = rec;
      const mySessionId = this._sessionId;
      rec.lang = this.state.language;
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (event) => {
        if (this._ignoreResults) return;
        if (mySessionId !== this._sessionId) return;

        // Accept results both while recording and while finalizing after manual Stop.
        if (!this.state.isRecording && !this._isFinalizing) return;
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
      };

      try {
        rec.start();
      } catch (e) {
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
