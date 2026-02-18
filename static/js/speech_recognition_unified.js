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
    }

    async startRecording() {
      try {
        this._audioChunks = [];
        this._audioBlob = null;
        this._finalText = '';
        this._lastText = '';

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
        if (this._recognition) {
          try {
            this._recognition.stop();
          } catch (e) {
          }
        }

        if (this._mediaRecorder && this.state.isRecording) {
          await new Promise((resolve) => {
            const done = () => resolve();
            this._mediaRecorder.addEventListener('stop', done, { once: true });
            try {
              this._mediaRecorder.stop();
            } catch (e) {
              resolve();
            }
          });
        }

        if (this._mediaStream) {
          for (const t of this._mediaStream.getTracks()) {
            try {
              t.stop();
            } catch (e) {
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
      rec.lang = this.state.language;
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (event) => {
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
