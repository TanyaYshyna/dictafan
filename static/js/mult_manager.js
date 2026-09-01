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
 * Конфигурация и ассеты (PNG/аудио) отдаются через API /api/mult/*,
 * который работает по принципу B2-first с локальным кешем/fallback
 * (см. routes/mult.py). В sw.js для этих URL прописаны network-first (конфиг)
 * и cache-first (ассеты) обработчики, чтобы всё работало офлайн.
 */
(function () {
  'use strict';

  const CONFIG_URL = '/api/mult/config';
  const MULT_ASSET_URL = '/api/mult/asset/';
  const FRAME_SIZE = 200;
  const DEFAULT_COLS = 4;
  const DEFAULT_ROWS = 2;
  const DEFAULT_SPEED = 12; // кадров в секунду
  const MIN_INDEX = 1;
  const MAX_INDEX = 100;
  const LS_CONFIG_KEY = 'dictafan_mult_config_v1';
  // Максимальное время ожидания сетевого ответа конфига. Дальше отдаём
  // кеш/localStorage, чтобы загрузка мультика никогда не блокировалась сетью.
  const CONFIG_FETCH_TIMEOUT_MS = 4000;
  // Временные замеры (console.time) для диагностики медленной загрузки.
  const DEBUG_TIMING = true;

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

  function timeStart(label) {
    if (!DEBUG_TIMING) return;
    try {
      console.time('[mult] ' + label);
    } catch (e) {
    }
  }

  function timeEnd(label) {
    if (!DEBUG_TIMING) return;
    try {
      console.timeEnd('[mult] ' + label);
    } catch (e) {
    }
  }

  // Общий кеш загруженных изображений (ключ — путь к файлу).
  // Значение — Promise<Image>, чтобы параллельные запросы одного и того же
  // файла не создавали дублирующихся загрузок, а предзагруженное в начале
  // диктанта изображение мгновенно переиспользовалось в момент победы.
  const imageCache = new Map();

  function loadImageCached(path) {
    if (imageCache.has(path)) return imageCache.get(path);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        // При ошибке убираем из кеша, чтобы следующий play() мог попробовать снова.
        imageCache.delete(path);
        reject(new Error('Не удалось загрузить: ' + path));
      };
      img.src = path;
    });
    imageCache.set(path, promise);
    return promise;
  }

  // Кеш декодированных кадров: ключ — путь к файлу + сетка.
  // Каждый кадр заранее вырезается из спрайт-листа в offscreen-канвас 200×200,
  // чтобы анимация в момент победы не делала дорогой drawImage из большого
  // исходного изображения на каждом тике.
  const frameCache = new Map();

  function decodeFramesCached(path, cols, rows) {
    const c = toInt(cols, DEFAULT_COLS);
    const r = toInt(rows, DEFAULT_ROWS);
    const key = path + '|' + c + 'x' + r;
    if (frameCache.has(key)) return frameCache.get(key);

    const promise = (async () => {
      const image = await loadImageCached(path);
      const frameW = image.naturalWidth / c;
      const frameH = image.naturalHeight / r;
      const total = c * r;
      const frames = [];
      for (let i = 0; i < total; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = FRAME_SIZE;
        canvas.height = FRAME_SIZE;
        const cx = canvas.getContext('2d');
        const col = i % c;
        const row = Math.floor(i / c);
        cx.drawImage(image, col * frameW, row * frameH, frameW, frameH, 0, 0, FRAME_SIZE, FRAME_SIZE);
        frames.push(canvas);
      }
      return frames;
    })();

    promise.catch(() => frameCache.delete(key));
    frameCache.set(key, promise);
    return promise;
  }

  // Кеш прогретых аудио-элементов (ключ — URL).
  const audioCache = new Map();

  // Прогрев аудио-файла мультика: создаём Audio-элемент с preload="auto",
  // чтобы файл был скачан и декодирован заранее (а не в момент победы),
  // и дополнительно греем файл в кеш Service Worker.
  function preloadAudio(name) {
    try {
      const url = MULT_ASSET_URL + encodeURIComponent(name);
      if (!url || audioCache.has(url)) return;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio.load();
      audioCache.set(url, audio);
      fetch(url, { method: 'GET' }).catch(() => {});
    } catch (e) {
    }
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
      this._raf = 0;
      this._nextTick = 0;
      this._image = null;
      this._frames = null;
      this._audio = null;
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
      return MULT_ASSET_URL + encodeURIComponent(name);
    }

    loadImage(path) {
      return loadImageCached(path);
    }

    getAudioPath(name) {
      return MULT_ASSET_URL + encodeURIComponent(name);
    }

    // Воспроизвести аудио по готовому URL (останавливает предыдущее).
    playAudioUrl(url) {
      this.stopAudio();
      if (!url) return;
      try {
        let audio = audioCache.get(url);
        if (!audio) {
          audio = new Audio(url);
          audioCache.set(url, audio);
        } else {
          try {
            audio.currentTime = 0;
          } catch (e) {
          }
        }
        audio.play().catch(() => {});
        this._audio = audio;
      } catch (e) {
      }
    }

    // Воспроизвести аудио мультика по имени файла из конфига.
    playAudio(name) {
      if (!name) return;
      this.playAudioUrl(this.getAudioPath(name));
    }

    stopAudio() {
      if (this._audio) {
        try {
          this._audio.pause();
          this._audio.currentTime = 0;
        } catch (e) {
        }
        this._audio = null;
      }
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
      const frames = this._frames;
      if (frames && frames.length) {
        const idx = ((frameIndex % frames.length) + frames.length) % frames.length;
        const f = frames[idx];
        if (f) this.ctx.drawImage(f, 0, 0, this.frameSize, this.frameSize);
        return;
      }
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
      if (this.isPlaying) return;
      this.isPlaying = true;
      this._nextTick = performance.now();
      const step = (now) => {
        if (!this.isPlaying) return;
        if (now >= this._nextTick) {
          this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
          this.drawFrame(this.currentFrame);
          this._nextTick = now + this.tickMs;
        }
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    stopLoop() {
      this.isPlaying = false;
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
    }

    // Перезапустить цикл с актуальной скоростью (не сбрасывая кадр).
    restartLoop() {
      this.stopLoop();
      this.startLoop();
    }

    async play(wins, cfg) {
      this.stop(true);
      this.currentFrame = 0;

      const multIndex = this.getMultIndex(wins);
      const conf = cfg || {};
      this.setGrid(conf.frames_w, conf.frames_h);
      this.setSpeed(conf.speed);
      const png = conf.png || null;

      let image = null;
      let resolvedPath = null;
      timeStart('play:image');
      try {
        resolvedPath = this.getImagePath(multIndex, png);
        image = await this.loadImage(resolvedPath);
      } catch (e) {
        // Если по конфигу не загрузилось — пробуем числовое имя.
        if (png) {
          try {
            resolvedPath = this.getImagePath(multIndex, null);
            image = await this.loadImage(resolvedPath);
          } catch (e2) {
            image = null;
            resolvedPath = null;
          }
        }
      }

      if (!image) {
        // Файла нет — показываем первый мультфильм.
        try {
          resolvedPath = this.getImagePath(MIN_INDEX, null);
          image = await this.loadImage(resolvedPath);
        } catch (e3) {
          console.error('Ошибка загрузки мультфильма:', e3);
          this.drawPlaceholder();
          this.isPlaying = false;
          timeEnd('play:image');
          return;
        }
      }
      timeEnd('play:image');

      this._image = image;
      // Декодируем кадры спрайта в offscreen-канвасы, чтобы цикл анимации
      // только переносил готовый кадр на основной canvas (быстрее и плавнее).
      timeStart('play:decode');
      if (resolvedPath) {
        this._frames = await decodeFramesCached(resolvedPath, this.cols, this.rows).catch(() => null);
      }
      timeEnd('play:decode');
      this.drawFrame(0);
      this.startLoop();

      // Запускаем аудио мультика (если задано в конфиге).
      if (conf.audio) {
        this.playAudio(conf.audio);
      }
    }

    stop(clearCanvas = true) {
      this.stopLoop();
      this.stopAudio();
      if (clearCanvas) {
        this._image = null;
        this._frames = null;
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
        timeStart('loadConfig:fetch');
        try {
          // Без уникального ?v=: Service Worker network-first запоминает конфиг
          // под стабильным ключом, и повторные запросы мгновенно отдают кеш.
          // Таймаут страхует от зависшего запроса (например, медленный B2).
          const controller = new AbortController();
          const timer = setTimeout(() => {
            try {
              controller.abort();
            } catch (e) {
            }
          }, CONFIG_FETCH_TIMEOUT_MS);
          let res = null;
          try {
            res = await fetch(CONFIG_URL, { signal: controller.signal });
          } finally {
            clearTimeout(timer);
          }
          if (res && res.ok) {
            const data = await res.json();
            const body = data && data.config ? data.config : data;
            if (body && Array.isArray(body.mults)) {
              cfg = { version: body.version || 1, mults: body.mults };
            } else if (Array.isArray(body)) {
              cfg = { version: 1, mults: body };
            }
          }
        } catch (e) {
          console.warn('[mult] loadConfig: сеть/таймаут, берём localStorage:', (e && e.message) ? e.message : e);
        }
        timeEnd('loadConfig:fetch');

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

    // Первый настроенный мультфильм из конфига (fallback, когда для текущего
    // номера победы нет собственной записи). Возвращает null, если мультфильмов нет.
    async _getFirstConfiguredMult() {
      const all = await this.loadConfig();
      const mults = (all && Array.isArray(all.mults)) ? all.mults : [];
      return mults.length > 0 ? mults[0] : null;
    },

    // --- Воспроизведение в модальном окне победы ---
    async play(canvasId, wins) {
      const player = getPlayer(canvasId);
      const idx = player.getMultIndex(wins);
      timeStart('play:config');
      let cfg = await this.getMultConfig(idx);
      if (!cfg) cfg = await this._getFirstConfiguredMult();
      timeEnd('play:config');
      return player.play(wins, cfg);
    },

    stop(canvasId) {
      const p = players[canvasId];
      if (p) p.stop(true);
    },

    // Предзагрузка мультфильма для будущей победы (номер = wins).
    // Вызывается заранее (в начале диктанта), чтобы изображение попало в
    // imageCache/frameCache и в момент победы показывалось мгновенно.
    async preload(wins) {
      timeStart('preload(' + wins + ')');
      try {
        const player = getPlayer('multCanvas');

        // ВАЖНО: запасной мультфильм 001.png греем ПЕРВЫМ и синхронно,
        // БЕЗ ожидания конфига/сети. Именно на него play() падает, если
        // файла текущего номера нет (например, 2-я победа при настроенном
        // только 001). Это гарантирует, что кеш заполнится в начале диктанта
        // независимо от того, что вернёт /api/mult/config.
        const fallbackPath = player.getImagePath(MIN_INDEX, null);
        loadImageCached(fallbackPath).catch(() => {});
        decodeFramesCached(fallbackPath, DEFAULT_COLS, DEFAULT_ROWS).catch(() => {});

        // Дальше по конфигу греем конкретный мультик будущей победы + аудио.
        const multIndex = player.getMultIndex(wins);
        let cfg = await this.getMultConfig(multIndex);
        if (!cfg) cfg = await this._getFirstConfiguredMult();
        const png = cfg && cfg.png ? cfg.png : null;
        const cols = cfg && cfg.frames_w ? cfg.frames_w : player.cols;
        const rows = cfg && cfg.frames_h ? cfg.frames_h : player.rows;

        // Прогреваем основной файл и сразу декодируем кадры в offscreen-канвасы.
        const mainPath = player.getImagePath(multIndex, png);
        loadImageCached(mainPath).catch(() => {});
        decodeFramesCached(mainPath, cols, rows).catch(() => {});

        // Если конфиг указывает отдельный png, прогреваем и запасной числовой
        // вариант, чтобы fallback в play() тоже был мгновенным.
        if (png) {
          loadImageCached(player.getImagePath(multIndex, null)).catch(() => {});
        }

        // Прогреваем аудио-файл (декодируем Audio-элемент + греем кеш SW).
        if (cfg && cfg.audio) {
          preloadAudio(cfg.audio);
        }
      } catch (e) {
        // Не критично: в момент победы play() повторит попытку загрузки.
      }
      timeEnd('preload(' + wins + ')');
    },

    // --- Модальное окно предпросмотра ---
    _previewPlaying: false,
    _previewPlayer: null,
    _previewPngFile: null,
    _previewAudioFile: null,

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

      const pngChoose = document.getElementById('multPreviewPngChooseBtn');
      const pngFile = document.getElementById('multPreviewPngFile');
      if (pngChoose && pngFile) {
        pngChoose.addEventListener('click', () => pngFile.click());
        pngFile.addEventListener('change', () => {
          if (pngFile.files && pngFile.files[0]) {
            this._previewPngFile = pngFile.files[0];
            if (pngInput) pngInput.textContent = pngFile.files[0].name;
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
          if (audioFile.files && audioFile.files[0]) {
            this._previewAudioFile = audioFile.files[0];
            if (audioInput) audioInput.textContent = audioFile.files[0].name;
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
      return input ? String(input.textContent || '').trim() : '';
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
      const raw = input ? String(input.textContent || '').trim() : '';
      return raw === 'не выбран' ? '' : raw;
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
      if (png) png.textContent = (conf && conf.png) ? conf.png : '';

      const framesW = document.getElementById('multPreviewFramesW');
      if (framesW) framesW.value = conf ? toInt(conf.frames_w, DEFAULT_COLS) : DEFAULT_COLS;
      const framesH = document.getElementById('multPreviewFramesH');
      if (framesH) framesH.value = conf ? toInt(conf.frames_h, DEFAULT_ROWS) : DEFAULT_ROWS;

      const speed = document.getElementById('multPreviewSpeed');
      if (speed) speed.value = conf ? toFloat(conf.speed, DEFAULT_SPEED) : DEFAULT_SPEED;

      const audio = document.getElementById('multPreviewAudio');
      if (audio) audio.textContent = (conf && conf.audio) ? conf.audio : 'не выбран';

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

      // Если выбран локальный файл, которого ещё нет на сервере — превьюим его
      // напрямую через object URL (без предварительной загрузки в B2).
      let path = null;
      if (this._previewPngFile) {
        try {
          path = URL.createObjectURL(this._previewPngFile);
        } catch (e) {
          path = null;
        }
      } else {
        const pngName = this._readPreviewPng();
        path = pngName ? player.getImagePath(idx, pngName) : null;
      }

      if (!path) {
        player._image = null;
        player._frames = null;
        player.drawPlaceholder();
        return;
      }

      let image = null;
      try {
        image = await player.loadImage(path);
      } catch (e) {
        console.error('Ошибка загрузки мультфильма:', e);
        player._image = null;
        player._frames = null;
        player.drawPlaceholder();
        return;
      }
      player._image = image;
      player._frames = await decodeFramesCached(path, player.cols, player.rows).catch(() => null);
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
      const idx = this._readPreviewIndex();

      // Локально выбранный PNG/аудио (ещё не загружены на сервер) —
      // проигрываем напрямую через object URL.
      if (this._previewPngFile || this._previewAudioFile) {
        if (!player._image) await this._renderPreview();
        if (!player._image) return;
        this._setPreviewPlaying(true);
        player.currentFrame = 0;
        player.drawFrame(0);
        player.startLoop();
        player.stopAudio();
        if (this._previewAudioFile) {
          try {
            player.playAudioUrl(URL.createObjectURL(this._previewAudioFile));
          } catch (e) {
          }
        }
        return;
      }

      // Единая процедура воспроизведения через MultPlayer.play() —
      // та же, что используется в модальном окне завершения диктанта.
      const conf = await this.getMultConfig(idx);
      const pngName = this._readPreviewPng();
      if (!conf && !pngName) {
        player.stop(true);
        this._setPreviewPlaying(false);
        return;
      }
      const cfg = {
        png: pngName || null,
        frames_w: this._readPreviewCols(),
        frames_h: this._readPreviewRows(),
        speed: this._readPreviewSpeed(),
        audio: this._readPreviewAudio() || null,
      };
      this._setPreviewPlaying(true);
      await player.play(idx, cfg);
    },

    _stopPreview() {
      const player = this._getPreviewPlayer();
      player.stopLoop();
      player.stopAudio();
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

    // Токен получаем через UserManager.getToken() — единую точку работы с
    // токеном во всём приложении. Раньше здесь читался только localStorage,
    // из-за чего после авторизации сохранение всё равно сообщало «Нет токена».
    _getToken() {
      try {
        if (window.UM && typeof window.UM.getToken === 'function') {
          return window.UM.getToken();
        }
      } catch (e) {
      }
      try {
        return localStorage.getItem('jwt_token');
      } catch (e) {
        return null;
      }
    },

    // Ждём, пока пользователь войдёт через существующий API модалки логина
    // (LoginModal.showAndWaitForLogin()), и возвращаем true после успешного входа.
    // Если API недоступен — показываем окно авторизации через window.UM.requireAuth().
    async _waitForLogin() {
      try {
        if (window.loginModal && typeof window.loginModal.showAndWaitForLogin === 'function') {
          await window.loginModal.showAndWaitForLogin();
          return true;
        }
      } catch (e) {
      }
      try {
        if (typeof LoginModal !== 'undefined' && typeof LoginModal.showAndWaitForLogin === 'function') {
          await LoginModal.showAndWaitForLogin();
          return true;
        }
      } catch (e) {
      }
      try {
        if (window.UM && typeof window.UM.requireAuth === 'function') {
          window.UM.requireAuth();
        }
      } catch (e) {
      }
      return false;
    },

    async _uploadAsset(file) {
      if (!file) return null;
      const token = this._getToken();
      if (!token) {
        this._toast('Нет токена авторизации для загрузки файла', { durationMs: 3500 });
        return null;
      }
      const fd = new FormData();
      fd.append('file', file, file.name);
      try {
        const res = await fetch('/api/mult/asset/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: fd,
        });
        const data = res.ok ? await res.json() : null;
        if (data && data.success && data.name) return data.name;
        this._toast((data && data.error) ? String(data.error) : 'Ошибка загрузки файла', { durationMs: 3500 });
        return null;
      } catch (e) {
        this._toast('Ошибка соединения при загрузке файла', { durationMs: 3500 });
        return null;
      }
    },

    async _savePreviewConfig() {
      // Сначала загружаем выбранные PNG/аудио файлы в B2 (если они были выбраны).
      if (this._previewPngFile) {
        const uploaded = await this._uploadAsset(this._previewPngFile);
        if (uploaded) {
          const pngInput = document.getElementById('multPreviewPng');
          if (pngInput) pngInput.textContent = uploaded;
          this._previewPngFile = null;
        }
      }
      if (this._previewAudioFile) {
        const uploaded = await this._uploadAsset(this._previewAudioFile);
        if (uploaded) {
          const audioInput = document.getElementById('multPreviewAudio');
          if (audioInput) audioInput.textContent = uploaded;
          this._previewAudioFile = null;
        }
      }

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

      let token = this._getToken();
      if (!token) {
        // Показываем существующее окно авторизации и ждём успешного входа,
        // затем автоматически повторяем сохранение на сервер.
        this._toast('Нет токена авторизации, параметры сохранены локально', { durationMs: 3500 });
        const loggedIn = await this._waitForLogin();
        token = loggedIn ? this._getToken() : null;
        if (!token) {
          return;
        }
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
