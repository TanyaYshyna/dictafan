(function () {
  if (typeof window === 'undefined') return;

  class DictationSpeechRecognitionPanel {
    constructor(options = {}) {
      this.options = options || {};
      this._rec = null;
      this._bound = false;
      this._expectedText = '';
      this._isProcessing = false;
      this._isAudioComplete = false;

      this.MIN_MATCH_PERCENT = Number.isFinite(Number(options.minMatchPercent))
        ? Number(options.minMatchPercent)
        : 80;

      this._viz = {
        ac: null,
        analyser: null,
        source: null,
        raf: null,
        active: false,
        stream: null,
      };

      this.els = {
        recordButton: options.recordButton || null,
        recordingIndicator: options.recordingIndicator || null,
        countPercent: options.countPercent || null,
        audioVisualizer: options.audioVisualizer || null,
        userAudioAnswer: options.userAudioAnswer || null,
        recognitionModeIcon: options.recognitionModeIcon || null,
        whisperModelReadyBadge: options.whisperModelReadyBadge || null,
      };

      this._refreshElsFromDom();
      this.bind();
    }

    _refreshElsFromDom() {
      const byId = (id) => {
        try {
          return document.getElementById(id);
        } catch (e) {
          return null;
        }
      };

      this.els.recordButton = this.els.recordButton || byId('recordButton');
      this.els.recordingIndicator = this.els.recordingIndicator || byId('recordingIndicator');
      this.els.countPercent = this.els.countPercent || byId('count_percent');
      this.els.audioVisualizer = this.els.audioVisualizer || byId('audioVisualizer');
      this.els.userAudioAnswer = this.els.userAudioAnswer || byId('userAudioAnswer');
      this.els.recognitionModeIcon = this.els.recognitionModeIcon || byId('recognitionModeIcon');
      this.els.whisperModelReadyBadge = this.els.whisperModelReadyBadge || byId('whisperModelReadyBadge');
    }

    setExpectedText(text) {
      this._expectedText = String(text || '');
      this._isAudioComplete = false;
      try {
        this._setRecordButtonCompleted(false);
      } catch (e0) {
      }
      try {
        if (this.els.countPercent) this.els.countPercent.textContent = '0';
      } catch (e) {
      }
      try {
        if (this.els.userAudioAnswer) this.els.userAudioAnswer.textContent = '';
      } catch (e) {
      }
    }

    setLanguage(langCode) {
      const lc = String(langCode || '').trim() || 'en-US';
      if (this._rec && this._rec.state) {
        this._rec.state.language = lc;
      }
    }

    setMode(mode) {
      const m = String(mode || '').trim() || 'online';
      if (this._rec && this._rec.state) {
        this._rec.state.mode = m;
      }
      this._updateRecognitionModeIcon(m);
    }

    setEnabled(enabled) {
      try {
        const rb = this.els.recordButton;
        if (!rb) return;
        const dis = !enabled || !!this._isAudioComplete;
        rb.disabled = dis;
        rb.classList.toggle('disabled', dis);
        if (!dis && !this._isAudioComplete) {
          this._setRecordButtonIcon('mic');
        }
      } catch (e) {
      }
    }

    bind() {
      if (this._bound) return;
      this._bound = true;

      const rb = this.els.recordButton;
      if (rb && rb.dataset.boundDictationSpeechPanel !== '1') {
        rb.dataset.boundDictationSpeechPanel = '1';
        rb.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            if (rb.disabled) return;
          } catch (e1) {
          }
          try {
            console.debug('[DictationSpeechRecognitionPanel] record click');
          } catch (e2) {
          }
          this.toggleRecording().catch(() => { });
        });
      }

      this._updateRecordingIndicator(false);
    }

    _ensureRecognizer() {
      if (this._rec) return this._rec;
      if (!window.UnifiedSpeechRecognition) {
        throw new Error('UnifiedSpeechRecognition_not_loaded');
      }

      this._rec = new window.UnifiedSpeechRecognition({
        language: 'en-US',
        mode: 'online',
        transcriptContainer: this.els.userAudioAnswer,
      });

      this._rec.callbacks.onRecordingStart = () => {
        this._updateRecordingIndicator(true);
        this._setRecordButtonRecording(true);
        this._setRecordButtonIcon('pause');
        this._setPercent(0);
        try {
          if (this.els.userAudioAnswer) this.els.userAudioAnswer.textContent = '';
        } catch (e) {
        }

        try {
          if (this._rec && this._rec._mediaStream) {
            this._startVisualizer(this._rec._mediaStream);
          }
        } catch (e) {
        }
      };

      this._rec.callbacks.onRecordingStop = () => {
        this._updateRecordingIndicator(false);
        this._setRecordButtonRecording(false);
        if (!this._isAudioComplete) {
          this._setRecordButtonIcon('mic');
        }
        this._stopVisualizer();
      };

      this._rec.callbacks.onTranscript = (text) => {
        try {
          const pct = this._computeMatchPercentASR(this._expectedText, text);
          this._setPercent(pct);
        } catch (e) {
        }
      };

      this._rec.callbacks.onPercentUpdate = (percent) => {
        this._setPercent(percent);
      };

      this._rec.callbacks.onError = (error) => {
        try {
          if (this.els.userAudioAnswer) this.els.userAudioAnswer.textContent = String(error && error.message ? error.message : error);
        } catch (e) {
        }
        this._updateRecordingIndicator(false);
        this._setRecordButtonRecording(false);
        this._stopVisualizer();
      };

      return this._rec;
    }

    async toggleRecording() {
      if (this._isProcessing) return;

      const rec = this._ensureRecognizer();
      if (rec && rec.state && rec.state.isRecording) {
        await this.stopRecording('manual');
      } else {
        await this.startRecording();
      }
    }

    async startRecording() {
      if (this._isProcessing) return;
      const rec = this._ensureRecognizer();
      if (!rec) return;
      try {
        console.debug('[DictationSpeechRecognitionPanel] startRecording');
      } catch (e0) {
      }
      await rec.startRecording();
    }

    async stopRecording(cause = 'manual') {
      if (this._isProcessing) return;
      const rec = this._ensureRecognizer();
      if (!rec) return;

      this._isProcessing = true;
      try {
        try {
          console.debug('[DictationSpeechRecognitionPanel] stopRecording', cause);
        } catch (e0) {
        }
        const result = await rec.stopRecording(cause);
        const text = String(result && result.text ? result.text : '').trim();
        const percent = this._computeMatchPercentASR(this._expectedText, text);
        this._setPercent(percent);

        const ok = percent >= this.MIN_MATCH_PERCENT;
        try {
          if (typeof this.options.onRecognitionComplete === 'function') {
            await this.options.onRecognitionComplete({
              ok,
              percent,
              transcript: text,
              audioBlob: result ? result.audioBlob : null,
              mode: result ? result.mode : null,
              cause: result ? result.cause : cause,
            });
          }
        } catch (e) {
        }

        try {
          this._setRecordButtonCompleted(!!ok);
        } catch (e2) {
        }
      } finally {
        this._isProcessing = false;
      }
    }

    _setRecordButtonIcon(name) {
      try {
        const rb = this.els.recordButton;
        if (!rb) return;
        const iconName = String(name || '').trim();
        if (!iconName) return;
        rb.dataset.icon = iconName;
        const iconEl = rb.querySelector('i[data-lucide]');
        if (iconEl) {
          iconEl.setAttribute('data-lucide', iconName);
        } else {
          rb.insertAdjacentHTML('afterbegin', `<i data-lucide="${iconName}"></i>`);
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: rb });
        }
      } catch (e) {
      }
    }

    _setRecordButtonCompleted(isCompleted) {
      try {
        this._isAudioComplete = !!isCompleted;
      } catch (e0) {
      }
      try {
        const rb = this.els.recordButton;
        if (!rb) return;
        if (isCompleted) {
          rb.disabled = true;
          rb.classList.add('disabled');
          this._setRecordButtonIcon('mic-off');
        } else {
          rb.disabled = false;
          rb.classList.remove('disabled');
          this._setRecordButtonIcon('mic');
        }
      } catch (e) {
      }
    }

    _setPercent(percent) {
      try {
        const el = this.els.countPercent;
        if (!el) return;
        const n = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        el.textContent = String(n);
      } catch (e) {
      }
    }

    _updateRecordingIndicator(state) {
      const indicator = this.els.recordingIndicator;
      if (!indicator) return;

      try {
        indicator.style.display = '';
        indicator.style.visibility = state ? 'visible' : 'hidden';
        indicator.style.opacity = state ? '1' : '0';
        indicator.classList.toggle('recording', !!state);
      } catch (e) {
      }
    }

    _setRecordButtonRecording(isRecording) {
      try {
        const rb = this.els.recordButton;
        if (!rb) return;
        rb.classList.toggle('recording', !!isRecording);
      } catch (e) {
      }
    }

    _updateRecognitionModeIcon(mode) {
      try {
        const wrap = this.els.recognitionModeIcon;
        if (!wrap) return;
        const m = String(mode || 'online');
        const iconName = (m === 'offline') ? 'route-off' : (m === 'server') ? 'server' : 'route';
        wrap.innerHTML = `<i data-lucide="${iconName}"></i>`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (e) {
      }
    }

    _startVisualizer(stream) {
      try {
        const canvas = this.els.audioVisualizer;
        if (!canvas || !stream) return;

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;

        if (this._viz.ac && this._viz.ac.state !== 'closed') {
          try {
            this._viz.ac.close();
          } catch (e) {
          }
        }

        this._viz.ac = new AC();
        this._viz.analyser = this._viz.ac.createAnalyser();
        this._viz.analyser.fftSize = 256;
        this._viz.source = this._viz.ac.createMediaStreamSource(stream);
        this._viz.source.connect(this._viz.analyser);
        this._viz.active = true;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const bufferLength = this._viz.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let barColor = '#8BBFFF';
        try {
          const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--color-button-text-purple');
          const v = String(cssVar || '').trim();
          if (v) barColor = v;
        } catch (e0) {
        }

        const draw = () => {
          if (!this._viz.active) return;
          this._viz.raf = requestAnimationFrame(draw);

          this._viz.analyser.getByteFrequencyData(dataArray);

          const w = canvas.width / dpr;
          const h = canvas.height / dpr;
          ctx.clearRect(0, 0, w, h);

          const barWidth = Math.max((w / bufferLength) * 1.6, 2);
          ctx.fillStyle = barColor;

          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 255;
            const barHeight = v * (h - 4);
            ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth + 1;
          }
        };

        draw();
      } catch (e) {
      }
    }

    _stopVisualizer() {
      try {
        this._viz.active = false;
        if (this._viz.raf) cancelAnimationFrame(this._viz.raf);
        this._viz.raf = null;
      } catch (e) {
      }
      try {
        if (this._viz.source) this._viz.source.disconnect();
      } catch (e) {
      }
      try {
        if (this._viz.ac && this._viz.ac.state !== 'closed') {
          this._viz.ac.close().catch(() => { });
        }
      } catch (e) {
      }
      this._viz.ac = null;
      this._viz.analyser = null;
      this._viz.source = null;
    }

    _normalizeForASR(text) {
      let s = String(text || '').toLowerCase();
      s = s.replace(/\d+/g, '<num>');
      s = s.replace(/[\u2013\u2014\u2212\-]/g, ' ');
      s = s.replace(/[.,!?:;\"«»()]/g, '');
      s = s.replace(/\s+/g, '');
      return s;
    }

    _computeMatchPercentASR(originalText, spokenText) {
      const a = this._normalizeForASR(originalText);
      const b = this._normalizeForASR(spokenText);
      if (!a && !b) return 100;
      if (!a || !b) return 0;

      const la = a.length;
      const lb = b.length;
      const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
      for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
          dp[i][j] = (a[i - 1] === b[j - 1])
            ? dp[i - 1][j - 1] + 1
            : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
      const lcs = dp[la][lb];

      let maxSuffixMatch = 0;
      for (let i = Math.min(la, lb); i >= 1; i--) {
        const aSuffix = a.slice(-i);
        const bSuffix = b.slice(-i);
        if (aSuffix === bSuffix) {
          maxSuffixMatch = i;
          break;
        }
      }

      if (maxSuffixMatch > la * 0.5) {
        const suffixPercent = Math.round((2 * maxSuffixMatch) / (la + maxSuffixMatch) * 100);
        const lcsPercent = Math.round((2 * lcs) / (la + lb) * 100);
        return Math.max(suffixPercent, lcsPercent);
      }

      return Math.round((2 * lcs) / (la + lb) * 100);
    }
  }

  window.DictationSpeechRecognitionPanel = DictationSpeechRecognitionPanel;
})();
