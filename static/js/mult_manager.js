/**
 * mult_manager.js
 *
 * Менеджер мультфильмов победы.
 *
 * - MultPlayer: вырезает из спрайт-листа 800×400 (сетка 4×2 = 8 кадров по 200×200)
 *   последовательные кадры и отображает их в canvas 200×200.
 * - MultManager: API для воспроизведения в модальном окне победы
 *   (play/stop по id canvas) и модальное окно предпросмотра мультфильмов
 *   (выбор PNG + кнопка «Проиграть»).
 */
(function () {
  'use strict';

  const MULT_DIR = 'static/data/mult/';
  const FRAME_SIZE = 200;
  const COLS = 4;
  const ROWS = 2;
  const TOTAL_FRAMES = 8;
  const FPS = 12;
  const CYCLE_MS = 5000;
  const MIN_INDEX = 1;
  const MAX_INDEX = 100;

  class MultPlayer {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.frameSize = FRAME_SIZE;
      this.cols = COLS;
      this.rows = ROWS;
      this.totalFrames = TOTAL_FRAMES;
      this.fps = FPS;
      this.cycleMs = CYCLE_MS;
      this.tickMs = 1000 / this.fps;
      this.frameHoldMs = this.cycleMs / this.totalFrames;
      this.isPlaying = false;
      this.currentFrame = 0;
      this._interval = null;
      this._image = null;
    }

    // Номер мультфильма от количества побед.
    // 1-я победа -> 001.png, 2-я -> 002.png, 101-я -> снова 001.png.
    getMultIndex(wins) {
      const n = Math.floor(Number(wins) || 0);
      if (n <= 0) return MIN_INDEX;
      return ((n - 1) % MAX_INDEX) + 1;
    }

    getImagePath(multIndex) {
      return MULT_DIR + String(multIndex).padStart(3, '0') + '.png';
    }

    loadImage(path) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось загрузить: ' + path));
        img.src = path;
      });
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
      const col = frameIndex % this.cols;
      const row = Math.floor(frameIndex / this.cols);
      const sx = col * this.frameSize;
      const sy = row * this.frameSize;
      this.clear();
      if (!this._image) return;
      this.ctx.drawImage(
        this._image,
        sx, sy, this.frameSize, this.frameSize,
        0, 0, this.frameSize, this.frameSize,
      );
    }

    // Один цикл из 8 кадров занимает ~cycleMs (5 секунд),
    // при этом перерисовка идёт с частотой fps (12 кадров/с).
    // После окончания цикл повторяется до вызова stop().
    _startLoop() {
      this.isPlaying = true;
      let accumulated = 0;
      this._interval = setInterval(() => {
        if (!this.isPlaying) return;
        accumulated += this.tickMs;
        if (accumulated >= this.frameHoldMs) {
          accumulated = 0;
          this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
        }
        this.drawFrame(this.currentFrame);
      }, this.tickMs);
    }

    async play(wins) {
      this.stop(true);
      this.isPlaying = true;
      this.currentFrame = 0;

      const multIndex = this.getMultIndex(wins);
      let image = null;
      try {
        image = await this.loadImage(this.getImagePath(multIndex));
      } catch (e) {
        // Если файла нет — показываем первый мультфильм.
        try {
          image = await this.loadImage(this.getImagePath(MIN_INDEX));
        } catch (e2) {
          console.error('Ошибка загрузки мультфильма:', e2);
          this.drawPlaceholder();
          this.isPlaying = false;
          return;
        }
      }

      this._image = image;
      this.drawFrame(0);
      this._startLoop();
    }

    stop(clearCanvas = true) {
      this.isPlaying = false;
      if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
      }
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
    // --- Воспроизведение в модальном окне победы ---
    play(canvasId, wins) {
      return getPlayer(canvasId).play(wins);
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
      this._loadPreviewFile();
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

      modal.addEventListener('click', (e) => {
        if (e && e.target === modal) this.closePreview();
      });

      document.addEventListener('keydown', (e) => {
        if (e && e.key === 'Escape') {
          const m = document.getElementById('multPreviewModal');
          if (m && m.style.display !== 'none') this.closePreview();
        }
      });

      const fileInput = document.getElementById('multPreviewFile');
      if (fileInput) fileInput.addEventListener('change', () => this._loadPreviewFile());

      const playBtn = document.getElementById('multPreviewPlayBtn');
      if (playBtn) playBtn.addEventListener('click', () => this._togglePreviewPlay());
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

    _updatePreviewFilename() {
      const idx = this._readPreviewIndex();
      const filename = document.getElementById('multPreviewFilename');
      if (filename) filename.textContent = String(idx).padStart(3, '0') + '.png';
    },

    async _loadPreviewFile() {
      this._stopPreview();
      const idx = this._readPreviewIndex();
      this._updatePreviewFilename();

      const player = this._getPreviewPlayer();
      player.stop(false);

      let image = null;
      try {
        image = await player.loadImage(player.getImagePath(idx));
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
        await this._loadPreviewFile();
      }
      this._setPreviewPlaying(true);
      player.currentFrame = 0;
      player.drawFrame(0);
      player._startLoop();
    },

    _stopPreview() {
      const player = this._getPreviewPlayer();
      player.stop(false);
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
  };

  window.MultPlayer = MultPlayer;
  window.MultManager = MultManager;
})();
