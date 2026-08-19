/**
 * mult_manager.js
 *
 * Менеджер мультфильмов победы.
 *
 * - MultPlayer: вырезает из спрайт-листа (сетка frames_w × frames_h)
 *   последовательные кадры и отображает их в canvas 200×200.
 * - MultManager: API для воспроизведения в модальном окне победы
 *   (play/stop по id canvas) и модальное окно предпросмотра мультфильмов
 *   (выбор PNG, настройка сетки/скорости/аудио + сохранение в JSON на сервер).
 *
 * Конфигурация читается из static/data/mult/mults.json (см. также sw.js:
 * для этого файла используется network-first, чтобы свежие параметры
 * сразу попадали в кеш; при офлайне берётся кеш или localStorage).
 */
(function () {
  'use strict';

  const MULT_DIR = 'static/data/mult/';
  const CONFIG_URL = MULT_DIR + 'mults.json';
  const FRAME_SIZE = 200;
  const DEFAULT_COLS = 4;
  const DEFAULT_ROWS = 2;
  const DEFAULT_SPEED = 12; // кадров в секунду
  const MIN_INDEX = 1;
  const MAX_INDEX = 100;
  const LS_CONFIG_KEY = 'dictafan_mult_config_v1';

  const DEFAULT_CONFIG = {
    version: 1,
    mults: [],
  };

  function toInt(v, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : fallback;
  }

  function toFloat(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function padIndex(idx) {
    return String(idx).padStart(3, '0');
  }

  class MultPlayer {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.frameSize = FRAME_SIZE;
      this.cols = DEFAULT_COLS;
      this.rows = DEFAULT_ROWS;
      this.totalFrames = this.cols * this.rows;
      this.fps = DEFAULT_SPEED;
      this.tickMs = 1000 / this.fps;
      this.isPlaying = false;
      this.currentFrame = 0;
      this._timer = null;
      this._image = null;
    }

    // Номер мультфильма от количества побед.
    // 1-я победа -> 001, 2-я -> 002, 101-я -> снова 001.
    getMultIndex(wins) {
      const n = Math.floor(Number(wins) || 0);
      if (n <= 0) return MIN_INDEX;
      return ((n - 1) % MAX_INDEX) + 1;
    }

    getImagePath(multIndex, png) {
      const name = png || (padIndex(multIndex) + '.png');
      return MULT_DIR + name;
    }

    loadImage(path) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось загрузить: ' + path));
        img.src = path;
      });
    }

    // Задать сетку кадров: cols × rows. Размер одного кадра вычисляется
    // как naturalWidth/cols × naturalHeight/rows, а отображается всегда 200×200.
    setGrid(cols, rows) {
      let c = toInt(cols, DEFAULT_COLS);
      let r = toInt(rows, DEFAULT_ROWS);
      if (!(c > 0)) c = DEFAULT_COLS;
      if (!(r > 0)) r = DEFAULT_ROWS;
      this.cols = c;
      this.rows = r;
      this.totalFrames = this.cols * this.rows;
    }

    // Скорость анимации — количество кадров в секунду.
    setSpeed(fps) {
      const f = toFloat(fps, DEFAULT_SPEED);
      this.fps = f > 0 ? f : DEFAULT_SPEED;
      this.tickMs = 1000 / this.fps;
    }

    clear() {
      if (this.ctx) this.ctx.clearRect(0, 0, this.frameSize, this.frameSize);
    }

    drawPlaceholder() {
      if (!this.ctx) return;
      this.clear();
      this.ctx.fillStyle = '#f0f0f0';
      this.ctx.fillRect(0, 0, this.frameSize, this.frameSize);
    }

    drawFrame(frameIndex) {
      if (!this.ctx) return;
      this.clear();
      if (!this._image) return;
      const frameW = this._image.naturalWidth / this.cols;
      const frameH = this._image.naturalHeight / this.rows;
      const col = frameIndex % this.cols;
      const row = Math.floor(frameIndex / this.cols);
      const sx = col * frameW;
      const sy = row * frameH;
      this.ctx.drawImage(
        this._image,
        sx, sy, frameW, frameH,
        0, 0, this.frameSize, this.frameSize,
      );
    }

    startLoop() {
      this.isPlaying = true;
      const step = () => {
        if (!this.isPlaying) return;
        this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
        this.drawFrame(this.currentFrame);
        this._timer = setTimeout(step, this.tickMs);
      };
      this._timer = setTimeout(step, this.tickMs);
    }

    stopLoop() {
      this.isPlaying = false;
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    }

    // Перезапустить цикл с актуальной скоростью (не сбрасывая кадр).
    restartLoop() {
      this.stopLoop();
      this.startLoop();
    }

    async play(wins, cfg) {
      this.stop(true);
      this.isPlaying = true;
      this.currentFrame = 0;

      const multIndex = this.getMultIndex(wins);
      const conf = cfg || {};
      this.setGrid(conf.frames_w, conf.frames_h);
      this.setSpeed(conf.speed);
      const png = conf.png || null;

      let image = null;
      try {
        image = await this.loadImage(this.getImagePath(multIndex, png));
      } catch (e) {
        // Если по конфигу не загрузилось — пробуем числовое имя.
        if (png) {
          try {
            image = await this.loadImage(this.getImagePath(multIndex, null));
          } catch (e2) {
            image = null;
          }
        }
      }

      if (!image) {
        // Файла нет — показываем первый мультфильм.
        try {
          image = await this.loadImage(this.getImagePath(MIN_INDEX, null));
        } catch (e3) {
          console.error('Ошибка загрузки мультфильма:', e3);
          this.drawPlaceholder();
          this.isPlaying = false;
          return;
        }
      }

      this._image = image;
      this.drawFrame(0);
      this.startLoop();
    }

    stop(clearCanvas = true) {
      this.stopLoop();
      if (clearCanvas) {
        this._image = null;
        this.clear();
      }
    }
  }

  const players = {};
  function getPlayer(canvasId) {
    if (!players[canvasId]) players[canvasId] = new MultPlayer(canvasId);
    return players[canvasId];
  }

  const MultManager = {
    // --- Конфигурация из mults.json ---
    _config: null,
    _configPromise: null,

    loadConfig(force) {
      if (this._config && !force) return Promise.resolve(this._config);
      if (this._configPromise && !force) return this._configPromise;

      this._configPromise = (async () => {
        let cfg = null;
        try {
          const res = await fetch(CONFIG_URL + '?v=' + Date.now(), { cache: 'no-store' });
          if (res && res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.mults)) {
              cfg = { version: data.version || 1, mults: data.mults };
            } else if (Array.isArray(data)) {
              cfg = { version: 1, mults: data };
            }
          }
        } catch (e) {
        }

        if (cfg) {
          try {
            localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));
          } catch (e) {
          }
        } else {
          try {
            const raw = localStorage.getItem(LS_CONFIG_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.mults)) cfg = parsed;
            }
          } catch (e) {
          }
        }

        if (!cfg) cfg = DEFAULT_CONFIG;
        this._config = cfg;
        this._configPromise = null;
        return cfg;
      })();

      return this._configPromise;
    },

    async getMultConfig(number) {
      const cfg = await this.loadConfig();
      const n = toInt(number, MIN_INDEX);
      const found = (cfg.mults || []).find((m) => Number(m && m.number) === n);
      return found || null;
    },

    // --- Воспроизведение в модальном окне победы ---
    async play(canvasId, wins) {
      const player = getPlayer(canvasId);
      const cfg = await this.getMultConfig(player.getMultIndex(wins));
      return player.play(wins, cfg);
    },

    stop(canvasId) {
      const p = players[canvasId];
      if (p) p.stop(true);
    },

    // --- Модальное окно предпросмотра ---
    _previewPlaying: false,
    _previewPlayer: null,

    openPreview() {
      const modal = document.getElementById('multPreviewModal');
      if (!modal) return;
      this._initPreviewBindings();
      modal.style.display = 'flex';
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }
      this._syncPreviewFieldsFromConfig();
    },

    closePreview() {
      const modal = document.getElementById('multPreviewModal');
      if (modal) modal.style.display = 'none';
      this._stopPreview();
    },

    _initPreviewBindings() {
      const modal = document.getElementById('multPreviewModal');
      if (!modal || modal.dataset.boundMultPreview === '1') return;
      modal.dataset.boundMultPreview = '1';

      const closeBtn = document.getElementById('multPreviewModalClose');
      if (closeBtn) closeBtn.addEventListener('click', () => this.closePreview());

      // Закрытие ТОЛЬКО по крестику: клик по подложке и Escape не закрывают окно.

      const fileInput = document.getElementById('multPreviewFile');
      if (fileInput) fileInput.addEventListener('change', () => this._syncPreviewFieldsFromConfig());

      const pngInput = document.getElementById('multPreviewPng');
      if (pngInput) pngInput.addEventListener('change', () => this._renderPreview());

      const framesW = document.getElementById('multPreviewFramesW');
      if (framesW) framesW.addEventListener('change', () => this._renderPreview());
      const framesH = document.getElementById('multPreviewFramesH');
      if (framesH) framesH.addEventListener('change', () => this._renderPreview());

      const speedInput = document.getElementById('multPreviewSpeed');
      if (speedInput) {
        speedInput.addEventListener('input', () => this._updatePreviewSpeedLabel());
        speedInput.addEventListener('change', () => {
          const player = this._getPreviewPlayer();
          player.setSpeed(this._readPreviewSpeed());
          if (this._previewPlaying) {
            player.restartLoop();
          } else {
            this._renderPreview();
          }
        });
      }

      const audioChoose = document.getElementById('multPreviewAudioChooseBtn');
      const audioFile = document.getElementById('multPreviewAudioFile');
      const audioInput = document.getElementById('multPreviewAudio');
      if (audioChoose && audioFile) {
        audioChoose.addEventListener('click', () => audioFile.click());
        audioFile.addEventListener('change', () => {
          if (audioFile.files && audioFile.files[0] && audioInput) {
            audioInput.value = audioFile.files[0].name;
          }
        });
      }

      const playBtn = document.getElementById('multPreviewPlayBtn');
      if (playBtn) playBtn.addEventListener('click', () => this._togglePreviewPlay());

      const saveBtn = document.getElementById('multPreviewSaveBtn');
      if (saveBtn) saveBtn.addEventListener('click', () => this._savePreviewConfig());
    },

    _getPreviewPlayer() {
      if (!this._previewPlayer) this._previewPlayer = new MultPlayer('multPreviewCanvas');
      return this._previewPlayer;
    },

    _readPreviewIndex() {
      const fileInput = document.getElementById('multPreviewFile');
      const raw = fileInput ? Number(fileInput.value) : NaN;
      let idx = Number.isFinite(raw) ? Math.floor(raw) : 0;
      if (idx < MIN_INDEX) idx = MIN_INDEX;
      if (idx > MAX_INDEX) idx = MAX_INDEX;
      return idx;
    },

    _readPreviewPng() {
      const input = document.getElementById('multPreviewPng');
      const idx = this._readPreviewIndex();
      const raw = input ? String(input.value || '').trim() : '';
      return raw || (padIndex(idx) + '.png');
    },

    _readPreviewCols() {
      const input = document.getElementById('multPreviewFramesW');
      const val = toInt(input ? input.value : NaN, DEFAULT_COLS);
      return val > 0 ? val : DEFAULT_COLS;
    },

    _readPreviewRows() {
      const input = document.getElementById('multPreviewFramesH');
      const val = toInt(input ? input.value : NaN, DEFAULT_ROWS);
      return val > 0 ? val : DEFAULT_ROWS;
    },

    _readPreviewSpeed() {
      const input = document.getElementById('multPreviewSpeed');
      const val = toFloat(input ? input.value : NaN, DEFAULT_SPEED);
      return val > 0 ? val : DEFAULT_SPEED;
    },

    _readPreviewAudio() {
      const input = document.getElementById('multPreviewAudio');
      return input ? String(input.value || '').trim() : '';
    },

    _updatePreviewSpeedLabel() {
      const label = document.getElementById('multPreviewSpeedValue');
      if (label) label.textContent = Math.round(this._readPreviewSpeed()) + ' кадр/с';
    },

    // Подтянуть параметры из JSON для выбранного номера и отрисовать.
    async _syncPreviewFieldsFromConfig() {
      const idx = this._readPreviewIndex();
      const conf = await this.getMultConfig(idx);

      const png = document.getElementById('multPreviewPng');
      if (png) png.value = (conf && conf.png) ? conf.png : (padIndex(idx) + '.png');

      const framesW = document.getElementById('multPreviewFramesW');
      if (framesW && conf) framesW.value = toInt(conf.frames_w, DEFAULT_COLS);
      const framesH = document.getElementById('multPreviewFramesH');
      if (framesH && conf) framesH.value = toInt(conf.frames_h, DEFAULT_ROWS);

      const speed = document.getElementById('multPreviewSpeed');
      if (speed && conf) speed.value = toFloat(conf.speed, DEFAULT_SPEED);

      const audio = document.getElementById('multPreviewAudio');
      if (audio && conf) audio.value = conf.audio || '';

      this._updatePreviewSpeedLabel();
      await this._renderPreview();
    },

    async _renderPreview() {
      this._stopPreview();
      const idx = this._readPreviewIndex();

      const player = this._getPreviewPlayer();
      player.stop(false);
      player.setGrid(this._readPreviewCols(), this._readPreviewRows());
      player.setSpeed(this._readPreviewSpeed());

      let image = null;
      try {
        image = await player.loadImage(player.getImagePath(idx, this._readPreviewPng()));
      } catch (e) {
        console.error('Ошибка загрузки мультфильма:', e);
        player.drawPlaceholder();
        return;
      }
      player._image = image;
      player.drawFrame(0);
    },

    _togglePreviewPlay() {
      if (this._previewPlaying) {
        this._stopPreview();
      } else {
        this._playPreview();
      }
    },

    async _playPreview() {
      const player = this._getPreviewPlayer();
      if (!player._image) {
        await this._renderPreview();
      }
      if (!player._image) return;
      this._setPreviewPlaying(true);
      player.currentFrame = 0;
      player.drawFrame(0);
      player.startLoop();
    },

    _stopPreview() {
      const player = this._getPreviewPlayer();
      player.stopLoop();
      this._setPreviewPlaying(false);
    },

    _setPreviewPlaying(playing) {
      this._previewPlaying = playing;
      const label = document.getElementById('multPreviewPlayLabel');
      const icon = document.getElementById('multPreviewPlayIcon');
      if (label) label.textContent = playing ? 'Стоп' : 'Проиграть';
      if (icon) icon.setAttribute('data-lucide', playing ? 'square' : 'play');
      try {
        const btn = document.getElementById('multPreviewPlayBtn');
        if (btn && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: btn });
        }
      } catch (e) {
      }
    },

    _toast(message, opts) {
      try {
        if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
          window.DictationKart._showToast(message, opts);
          return;
        }
      } catch (e) {
      }
      try {
        if (typeof window.showToast === 'function') {
          window.showToast(message);
          return;
        }
      } catch (e) {
      }
      try {
        console.log(message);
      } catch (e) {
      }
    },

    async _savePreviewConfig() {
      const idx = this._readPreviewIndex();
      const entry = {
        number: idx,
        png: this._readPreviewPng(),
        frames_w: this._readPreviewCols(),
        frames_h: this._readPreviewRows(),
        speed: this._readPreviewSpeed(),
        audio: this._readPreviewAudio() || null,
      };

      await this.loadConfig();
      const mults = (this._config && Array.isArray(this._config.mults)) ? this._config.mults.slice() : [];
      const i = mults.findIndex((m) => Number(m && m.number) === idx);
      if (i >= 0) {
        mults[i] = entry;
      } else {
        mults.push(entry);
      }
      mults.sort((a, b) => Number(a.number) - Number(b.number));
      this._config = { version: 1, mults: mults };

      // Сохраняем локально сразу (офлайн-устойчивость).
      try {
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(this._config));
      } catch (e) {
      }

      const token = (() => {
        try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
      })();
      if (!token) {
        this._toast('Нет токена авторизации, параметры сохранены локально', { durationMs: 3500 });
        return;
      }

      try {
        const res = await fetch('/api/mult/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({ mults: this._config.mults }),
        });
        const data = res.ok ? await res.json() : null;
        if (data && data.success) {
          if (data.config && Array.isArray(data.config.mults)) {
            this._config = data.config;
            try {
              localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(this._config));
            } catch (e) {
            }
          }
          this._toast('Параметры мультфильма сохранены', { durationMs: 2200 });
        } else {
          this._toast((data && data.error) ? String(data.error) : 'Ошибка сохранения на сервере', { durationMs: 3500 });
        }
      } catch (e) {
        this._toast('Ошибка соединения, параметры сохранены локально', { durationMs: 3500 });
      }
    },
  };

  window.MultPlayer = MultPlayer;
  window.MultManager = MultManager;

  // Читаем JSON при открытии страницы (прогрев кеша и localStorage).
  // Ошибки не критичны — параметры подтянутся лениво при play()/openPreview().
  MultManager.loadConfig().catch(() => {});
})();
