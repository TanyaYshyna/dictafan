(function () {
  if (window.CoverManager) {
    return;
  }

  let cropper = null;
  let croppedImageBlob = null;
  let activeConfig = null;
  // Конфигурация компонента, который сейчас открыл модалку обрезки.
  // activeConfig перезаписывается при каждом bind(), поэтому для модалки
  // храним отдельную ссылку на конфигурацию, открывшую модалку.
  let currentCropConfig = null;
  let fileDialogActive = false;
  // Реестр конфигураций по уникальному ключу (kind или fileInputId).
  // Раньше activeConfig был единственным и перезаписывался при каждом bind(),
  // из-за чего модалка обрезки открывалась с параметрами последнего
  // привязанного компонента (например, обложка книги открывалась с
  // широким прямоугольником редактора диктанта 200/120 вместо квадрата).
  const configsById = {};
  // Обрезанные обложки по ключу конфигурации, чтобы обложка книги не
  // «протекала» в редактор диктанта и наоборот. croppedImageBlob остаётся
  // как fallback для компонентов, которые не передают ключ (редактор диктанта).
  const croppedBlobsById = {};

  function getAppBuildValue() {
    try {
      const v = (window && (window.__APP_BUILD || window.__APP_CACHE_REVISION))
        ? String(window.__APP_BUILD || window.__APP_CACHE_REVISION)
        : '';
      return v || '1';
    } catch (e) {
      return '1';
    }
  }

  function getAvatarUploadedVersion() {
    try {
      const um = window && window.UM ? window.UM : null;
      const ud = um && um.userData ? um.userData : null;
      const av = ud && ud.avatar ? ud.avatar : null;
      const v = av && av.uploaded ? String(av.uploaded).trim() : '';
      return v || '';
    } catch (e) {
      return '';
    }
  }

  function withCacheBust(url) {
    try {
      const u = String(url || '');
      if (!u) return u;

      if (u.startsWith('/user/api/avatar')) {
        const uploadedV = getAvatarUploadedVersion();
        if (uploadedV) return withCacheBustVersion(u, uploadedV);
      }

      if (window && window.BuildHelpers && typeof window.BuildHelpers.withCacheBust === 'function') {
        return window.BuildHelpers.withCacheBust(u, getAppBuildValue());
      }

      const sep = u.includes('?') ? '&' : '?';
      return `${u}${sep}v=${encodeURIComponent(getAppBuildValue())}`;
    } catch (e) {
      return url;
    }
  }

  function withCacheBustVersion(url, version) {
    try {
      if (window && window.BuildHelpers && typeof window.BuildHelpers.withCacheBustVersion === 'function') {
        return window.BuildHelpers.withCacheBustVersion(url, version, getAppBuildValue());
      }
      const u = String(url || '');
      if (!u) return u;
      const v = (version !== undefined && version !== null && String(version).trim())
        ? String(version).trim()
        : getAppBuildValue();
      const sep = u.includes('?') ? '&' : '?';
      return `${u}${sep}v=${encodeURIComponent(v)}`;
    } catch (e) {
      return url;
    }
  }

  function maybeCacheBustDictationCover(url) {
    try {
      const u = String(url || '');
      if (!u) return u;
      if (u.startsWith('/api/dictations_covers/')) {
        return withCacheBust(u);
      }
      return u;
    } catch (e) {
      return url;
    }
  }

  function getCoverUrl(dictationId, languageCode) {
    try {
      const raw = (dictationId !== undefined && dictationId !== null) ? String(dictationId).trim() : '';
      const cleaned = raw.replace(/^dict_/, '').trim();
      if (cleaned && /^\d+$/.test(cleaned)) {
        return maybeCacheBustDictationCover(`/api/dictations_covers/${encodeURIComponent(cleaned)}.webp`);
      }

      const langRaw = (languageCode !== undefined && languageCode !== null) ? String(languageCode).trim().toLowerCase() : '';
      const lang = langRaw === 'ua' ? 'uk' : langRaw;
      if (lang) {
        return `/static/data/covers/cover_${encodeURIComponent(lang)}.webp`;
      }
      return '/static/data/covers/cover_en.webp';
    } catch (e) {
      return '/static/data/covers/cover_en.webp';
    }
  }

  function avatarUrlForUser(userId, size = 'small') {
    try {
      if (!userId) return '';
      const id = encodeURIComponent(String(userId));
      const s = encodeURIComponent(String(size || 'small'));
      return `/user/api/avatar?user_id=${id}&size=${s}`;
    } catch (e) {
      return '';
    }
  }

  async function prefetchUrls(urls) {
    try {
      if (!('serviceWorker' in navigator)) return { ok: false, error: 'no_sw' };
      if (!navigator.serviceWorker.controller) return { ok: false, error: 'no_controller' };
      const list = Array.isArray(urls) ? urls : [];
      const ch = new MessageChannel();
      const res = await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          resolve({ ok: false, error: 'timeout' });
        }, 15000);
        ch.port1.onmessage = (ev) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          const data = ev && ev.data ? ev.data : {};
          if (data && data.success) {
            resolve({ ok: true, result: data.result });
          } else {
            resolve({ ok: false, error: data.error || 'sw_error', result: data.result });
          }
        };
        try {
          navigator.serviceWorker.controller.postMessage({ action: 'prefetch', urls: list }, [ch.port2]);
        } catch (e) {
          clearTimeout(t);
          resolve({ ok: false, error: 'postMessage_failed' });
        }
      });
      return res;
    } catch (e) {
      return { ok: false, error: 'exception' };
    }
  }

  function normIdList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    return [String(v)];
  }

  function getElById(id) {
    if (!id) return null;
    return document.getElementById(String(id));
  }

  function getToken() {
    try {
      if (window.UM && window.UM.token) return window.UM.token;
    } catch (e) {
    }
    try {
      if (window.UM && typeof window.UM.getToken === 'function') return window.UM.getToken();
    } catch (e) {
    }
    try {
      return localStorage.getItem('jwt_token');
    } catch (e) {
      return null;
    }
  }

  function getConfigKey(config) {
    try {
      const k = config && (config.kind || config.fileInputId)
        ? String(config.kind || config.fileInputId)
        : '';
      return k || 'default';
    } catch (e) {
      return 'default';
    }
  }

  function findConfigByFileInputId(inputId) {
    if (!inputId) return null;
    const keys = Object.keys(configsById);
    for (let i = 0; i < keys.length; i++) {
      const c = configsById[keys[i]];
      if (c && String(c.fileInputId || '') === String(inputId)) return c;
    }
    return null;
  }

  function getModalEls(cfg) {
    const modalId = (cfg && cfg.modalId) || 'crop-modal';
    const imageId = (cfg && cfg.cropImageId) || 'crop-image';
    const closeId = (cfg && cfg.closeBtnId) || 'crop-close';
    const cancelId = (cfg && cfg.cancelBtnId) || 'crop-cancel';
    const confirmId = (cfg && cfg.confirmBtnId) || 'crop-confirm';
    return {
      modal: getElById(modalId),
      image: getElById(imageId),
      closeBtn: getElById(closeId),
      cancelBtn: getElById(cancelId),
      confirmBtn: getElById(confirmId),
    };
  }

  function getCurrentPreviewSrc(cfg) {
    const ids = normIdList(cfg && cfg.previewImgId);
    for (const id of ids) {
      const el = getElById(id);
      if (!el) continue;
      let raw = null;
      try { raw = el.getAttribute('src'); } catch (e) { raw = null; }
      if (!raw || String(raw).trim() === '') continue;
      let src = null;
      try { src = el.currentSrc || el.src; } catch (e) { src = null; }
      if (!src || String(src).trim() === '') src = String(raw).trim();
      return String(src).trim();
    }
    return '';
  }

  function getSourceEls() {
    return {
      wrapper: getElById('crop-source-wrapper'),
      btn: getElById('crop-source-btn'),
      label: getElById('crop-source-label'),
      menu: getElById('crop-source-menu'),
      urlModal: getElById('crop-url-modal'),
      urlInput: getElById('crop-url-input'),
      urlConfirm: getElById('crop-url-confirm'),
      urlClose: getElById('crop-url-close'),
      title: getElById('crop-modal-title'),
    };
  }

  function setSourceLabel(text) {
    try {
      const lbl = getElById('crop-source-label');
      if (lbl) lbl.textContent = String(text || '');
    } catch (e) {
    }
  }

  function destroyCropper() {
    if (cropper) {
      try {
        cropper.destroy();
      } catch (e) {
      }
      cropper = null;
    }
  }

  function toggleSourceMenu(force) {
    const menu = getElById('crop-source-menu');
    const btn = getElById('crop-source-btn');
    if (!menu) return;
    const willOpen = force !== undefined ? !!force : menu.hasAttribute('hidden');
    if (willOpen) {
      menu.removeAttribute('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      menu.setAttribute('hidden', '');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }

  function openUrlModal() {
    const s = getSourceEls();
    if (!s.urlModal) return;
    s.urlModal.style.display = 'flex';
    s.urlModal.classList.add('show');
    try {
      if (s.urlInput) s.urlInput.value = '';
    } catch (e) {
    }
    try {
      if (s.urlInput) s.urlInput.focus();
    } catch (e) {
    }
  }

  function closeUrlModal() {
    const s = getSourceEls();
    if (!s.urlModal) return;
    s.urlModal.style.display = 'none';
    s.urlModal.classList.remove('show');
    try {
      if (s.urlInput) s.urlInput.value = '';
    } catch (e) {
    }
  }

  async function loadImageFromUrl(url, cfg) {
    const conf = cfg || currentCropConfig || activeConfig;
    const rawUrl = String(url || '').trim();
    if (!rawUrl) return;

    try {
      if (typeof window.showToast === 'function') window.showToast('Загружаем изображение...');
    } catch (e) {
    }

    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // 1) Серверный прокси (обходит CORS).
    try {
      const resp = await fetch('/api/proxy_image?url=' + encodeURIComponent(rawUrl), { headers });
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob && (blob.type || '').startsWith('image/')) {
          processFile(blob, conf);
          return;
        }
      }
    } catch (e) {
    }

    // 2) Fallback: прямая загрузка (если источник разрешает CORS).
    try {
      const direct = await fetch(rawUrl, { mode: 'cors' });
      if (direct.ok) {
        const blob = await direct.blob();
        if (blob && (blob.type || '').startsWith('image/')) {
          processFile(blob, conf);
          return;
        }
      }
    } catch (e) {
    }

    try {
      if (typeof window.showToast === 'function') window.showToast('Не удалось загрузить изображение по адресу');
    } catch (e) {
    }
    try {
      console.warn('[CoverManager] Не удалось загрузить изображение по URL:', rawUrl);
    } catch (e) {
    }
    // При неудаче оставляем текущее изображение как есть (не сбрасываем на пустое).
  }

  async function handleClipboardPaste(cfg) {
    const conf = cfg || currentCropConfig || activeConfig;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        if (typeof window.showToast === 'function') window.showToast('Буфер обмена недоступен — разрешите доступ');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const types = item && item.types ? item.types : [];
        const imgType = types.find((t) => t && t.startsWith('image/'));
        if (imgType && typeof item.getType === 'function') {
          const blob = await item.getType(imgType);
          if (blob) {
            processFile(blob, conf);
            return;
          }
        }
      }
      try {
        if (typeof window.showToast === 'function') window.showToast('В буфере обмена нет изображения');
      } catch (e) {
      }
    } catch (e) {
      try {
        if (typeof window.showToast === 'function') window.showToast('Не удалось вставить из буфера обмена');
      } catch (e2) {
      }
    }
  }

  function handleSourceAction(source) {
    const conf = currentCropConfig || activeConfig;
    toggleSourceMenu(false);
    if (source === 'file') {
      const input = getElById(conf && conf.fileInputId);
      if (input) {
        triggerFilePicker(input);
      } else {
        triggerFilePicker(getElById((activeConfig && activeConfig.fileInputId) || null));
      }
    } else if (source === 'url') {
      openUrlModal();
    } else if (source === 'clipboard') {
      handleClipboardPaste(conf);
    }
  }

  function bindSourceControls() {
    if (window.__coverManagerSourceBound) return;
    window.__coverManagerSourceBound = true;

    const s = getSourceEls();

    if (s.btn) {
      s.btn.addEventListener('click', (e) => {
        try { e.stopPropagation(); } catch (e2) {}
        toggleSourceMenu();
      });
    }

    if (s.menu) {
      const items = s.menu.querySelectorAll('.crop-source-item');
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        item.addEventListener('click', (e) => {
          try { e.stopPropagation(); } catch (e2) {}
          handleSourceAction(item.getAttribute('data-source'));
        });
      }
    }

    document.addEventListener('click', (e) => {
      const menu = getElById('crop-source-menu');
      const btn = getElById('crop-source-btn');
      if (!menu || menu.hasAttribute('hidden')) return;
      if (btn && btn.contains(e.target)) return;
      if (menu.contains(e.target)) return;
      toggleSourceMenu(false);
    });

    if (s.urlConfirm) {
      s.urlConfirm.addEventListener('click', () => {
        const val = s.urlInput && s.urlInput.value ? String(s.urlInput.value).trim() : '';
        if (!val) return;
        closeUrlModal();
        loadImageFromUrl(val, currentCropConfig || activeConfig);
      });
    }
    if (s.urlClose) s.urlClose.addEventListener('click', closeUrlModal);
    if (s.urlInput) {
      s.urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          try { e.preventDefault(); } catch (e2) {}
          const val = s.urlInput && s.urlInput.value ? String(s.urlInput.value).trim() : '';
          if (!val) return;
          closeUrlModal();
          loadImageFromUrl(val, currentCropConfig || activeConfig);
        }
      });
    }

    // Клик по фону маленькой модалки URL закрывает её.
    if (s.urlModal) {
      s.urlModal.addEventListener('click', (e) => {
        if (e.target === s.urlModal) closeUrlModal();
      });
    }

    // Cmd/Ctrl+V — вставить картинку из буфера, пока открыта модалка обрезки.
    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== 'v' && e.key !== 'V')) return;
      const modal = getElById('crop-modal');
      if (!modal || (modal.style.display !== 'flex' && !modal.classList.contains('show'))) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      try { e.preventDefault(); } catch (e2) {}
      handleClipboardPaste(currentCropConfig || activeConfig);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e && e.target ? e.target.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function getCoverFileFromEvent(event) {
    return event && event.target && event.target.files ? event.target.files[0] : null;
  }

  function clearInputValue(inputEl) {
    try {
      if (inputEl) inputEl.value = '';
    } catch (e) {
    }
  }

  function filesFromDataTransfer(dt) {
    try {
      if (!dt || !dt.files || !dt.files.length) return [];
      return Array.prototype.slice.call(dt.files);
    } catch (e) {
      return [];
    }
  }

  function extractUrlsFromText(text) {
    const out = [];
    if (!text) return out;
    const re = /https?:\/\/[^\s"'<>]+/gi;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      try {
        // Отрезаем хвост из спецсимволов (запятые, скобки и т.п.).
        const u = m[0].replace(/[),;!]+$/g, '');
        if (u) out.push(u);
      } catch (e) {
      }
    }
    return out;
  }

  function extractImageUrlFromHtml(html) {
    try {
      const div = document.createElement('div');
      div.innerHTML = String(html || '');
      const img = div.querySelector('img[src]');
      if (img) {
        // img.src уже декодирован браузером и приведён к абсолютному адресу.
        const src = img.getAttribute('src') || img.src || '';
        if (src) return src;
      }
      const a = div.querySelector('a[href]');
      if (a) {
        const href = a.getAttribute('href') || a.href || '';
        if (href) return href;
      }
    } catch (e) {
    }
    return '';
  }

  function normalizeExtractedUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) {
      // Пытаемся раскодировать URL, закодированный целиком.
      try {
        const dec = decodeURIComponent(u);
        if (/^https?:\/\//i.test(dec)) u = dec;
      } catch (e) {
      }
    }

    // Google Images при перетаскивании отдаёт ссылку вида
    // https://www.google.com/imgres?imgurl=<настоящая картинка>&...
    // Сервер-прокси умеет только http/https image, поэтому достаём imgurl.
    const lm = u.toLowerCase();
    if (lm.indexOf('imgres') !== -1 || (lm.indexOf('google.') !== -1 && lm.indexOf('?') !== -1)) {
      try {
        const q = u.indexOf('?');
        if (q !== -1) {
          const params = new URLSearchParams(u.slice(q + 1));
          const img = params.get('imgurl') || params.get('img') || params.get('media') || params.get('u');
          if (img && /^https?:\/\//i.test(img)) return img;
        }
      } catch (e) {
      }
    }

    return u;
  }

  function urlFromDataTransfer(dt) {
    if (!dt) return '';

    // 1) HTML-сниппет: достаём <img src> или <a href> — самый надёжный
    //    источник, когда картинку перетащили из другого браузера.
    let html = '';
    try { html = dt.getData('text/html'); } catch (e) { }
    if (html) {
      const fromHtml = extractImageUrlFromHtml(html);
      const normalized = normalizeExtractedUrl(fromHtml);
      if (/^https?:\/\//i.test(normalized)) return normalized;
    }

    // 2) URI-списки и plain text.
    const candidates = [];
    try {
      const uri = dt.getData('text/uri-list') || dt.getData('text/x-moz-url');
      if (uri) candidates.push(uri);
    } catch (e) {
    }
    try {
      const plain = dt.getData('text/plain');
      if (plain) candidates.push(plain);
    } catch (e) {
    }

    for (const raw of candidates) {
      const urls = extractUrlsFromText(raw);
      for (const url of urls) {
        const normalized = normalizeExtractedUrl(url);
        if (/^https?:\/\//i.test(normalized)) return normalized;
      }
    }

    return '';
  }

  function bindDropZone(el, cfg, preferCurrent) {
    if (!el) return;
    if (el.getAttribute && el.getAttribute('data-cover-drop-bound') === '1') return;
    if (el.setAttribute) el.setAttribute('data-cover-drop-bound', '1');

    el.addEventListener('dragover', (e) => {
      try { e.preventDefault(); } catch (e2) {}
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } catch (e2) {}
      try { el.classList.add('drag-over'); } catch (e2) {}
    });

    el.addEventListener('dragleave', (e) => {
      try { e.preventDefault(); } catch (e2) {}
      try { el.classList.remove('drag-over'); } catch (e2) {}
    });

    el.addEventListener('drop', (e) => {
      try { e.preventDefault(); } catch (e2) {}
      try { e.stopPropagation(); } catch (e2) {}
      try { el.classList.remove('drag-over'); } catch (e2) {}
      // Для общей зоны обрезки (#crop-dropzone внутри #crop-modal) отдаём
      // приоритет текущей открытой модалке (currentCropConfig), а не первому
      // забиндившему её компоненту. Для зон конкретного компонента (превью,
      // кликабельная область) используем переданную конфигурацию cfg.
      const dropConf = preferCurrent
        ? (currentCropConfig || cfg)
        : (cfg || currentCropConfig || activeConfig);
      const files = filesFromDataTransfer(e.dataTransfer);
      const file = files[0];
      if (file) {
        processFile(file, dropConf);
        return;
      }
      // Если файла нет, но в dataTransfer есть URL (картинку перетащили
      // из другого браузера) — загружаем изображение по этому адресу.
      // Модалку заранее не трогаем: loadImageFromUrl откроет её только при
      // успешной загрузке, а при неудаче текущее изображение останется как есть.
      const url = urlFromDataTransfer(e.dataTransfer);
      if (url) {
        loadImageFromUrl(url, dropConf);
      }
    });
  }

  function preventWindowDrop() {
    if (window.__coverManagerGlobalDropPrevented) return;
    window.__coverManagerGlobalDropPrevented = true;
    const skip = (target) => {
      try {
        if (!target) return false;
        if (target.isContentEditable) return true;
        const tag = String(target.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA';
      } catch (e) {
        return false;
      }
    };
    ['dragover', 'drop'].forEach((type) => {
      document.addEventListener(type, (e) => {
        if (skip(e.target)) return;
        try { e.preventDefault(); } catch (e2) {}
      });
    });
  }

  function initFileDialogLock() {
    if (window.__coverManagerFileDialogLockInit) return;
    window.__coverManagerFileDialogLockInit = true;
    window.addEventListener('focus', () => {
      // Диалог выбора файла закрылся — снимаем блокировку повторного открытия
      setTimeout(() => { fileDialogActive = false; }, 50);
    });
  }

  function applyPreview(cfg, blob) {
    const previewIds = normIdList(cfg && cfg.previewImgId);
    const placeholderIds = normIdList(cfg && cfg.placeholderId);

    if (!previewIds.length && !placeholderIds.length) return;

    const url = URL.createObjectURL(blob);

    for (const id of previewIds) {
      const el = getElById(id);
      if (!el) continue;
      try {
        el.src = url;
      } catch (e) {
      }
      try {
        el.style.display = 'block';
      } catch (e) {
      }
    }

    for (const id of placeholderIds) {
      const el = getElById(id);
      if (!el) continue;
      try {
        el.style.display = 'none';
      } catch (e) {
      }
    }
  }

  function processFile(file, cfg) {
    if (!file) return;
    const conf = cfg || activeConfig;

    if (!file.type || !file.type.startsWith('image/')) {
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('Пожалуйста, выберите изображение');
        }
      } catch (e) {
      }
      return;
    }

    try {
      const maxSize = conf && conf.maxFileSizeBytes ? Number(conf.maxFileSizeBytes) : null;
      if (maxSize && isFinite(maxSize) && maxSize > 0 && Number(file.size || 0) > maxSize) {
        try {
          if (typeof window.showToast === 'function') {
            window.showToast('Размер файла слишком большой');
          }
        } catch (e) {
        }
        return;
      }
    } catch (e) {
    }

    (async () => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        openCropModal(dataUrl, conf);
      } catch (e) {
      }
    })();
  }

  function handleCoverSelect(event) {
    const file = getCoverFileFromEvent(event);
    if (!file) return;

    // Определяем, к какому компоненту относится выбранный файл,
    // чтобы модалка обрезки использовала правильные параметры
    // (квадрат для обложки книги, широкий прямоугольник для диктанта и т.д.).
    try {
      const inputEl = event && event.target ? event.target : null;
      const inputId = inputEl ? (inputEl.id || inputEl.getAttribute('id')) : null;
      const found = findConfigByFileInputId(inputId);
      if (found) activeConfig = found;
    } catch (e) {
    }

    // Сбрасываем value, чтобы повторный выбор того же файла срабатывал
    try {
      if (event && event.target) event.target.value = '';
    } catch (e) {
    }

    processFile(file, activeConfig);
  }

  function openCropModal(imageSrc, cfg) {
    const conf = cfg || activeConfig;
    currentCropConfig = conf || null;
    const els = getModalEls(conf);
    const modal = els.modal;
    const image = els.image;

    if (!modal || !image) return;

    destroyCropper();

    let src = imageSrc && String(imageSrc).length > 0 ? String(imageSrc) : '';

    // Если файл ещё не выбран, показываем актуальное изображение (то, что
    // сейчас отображается у кавера/аватара), а не пустое состояние.
    if (!src) {
      src = getCurrentPreviewSrc(conf);
    }

    const hasImage = src.length > 0;

    if (hasImage) {
      image.src = src;
      try {
        const cropContainer = modal.querySelector('.crop-container');
        if (cropContainer) cropContainer.classList.add('crop-has-image');
      } catch (e) {
      }
    } else {
      // Пустое состояние: открываем модалку, а файл ещё не выбран.
      try { image.removeAttribute('src'); } catch (e) {}
      try {
        const cropContainer = modal.querySelector('.crop-container');
        if (cropContainer) cropContainer.classList.remove('crop-has-image');
      } catch (e) {
      }
    }

    modal.style.display = 'flex';
    modal.classList.add('show');

    // Заголовок модалки
    try {
      const title = getElById('crop-modal-title');
      if (title) title.textContent = (conf && conf.modalTitle) ? String(conf.modalTitle) : 'Обрезка обложки';
    } catch (e) {
    }

    if (!hasImage) {
      // Фокус на кнопке-источнике, чтобы подсказать следующий шаг.
      try {
        const srcBtn = getElById('crop-source-btn');
        if (srcBtn) setTimeout(() => srcBtn.focus(), 0);
      } catch (e) {
      }
      return;
    }

    const aspectRatio = (() => {
      try {
        const v = conf && conf.aspectRatio != null ? conf.aspectRatio : null;
        const n = v == null ? null : Number(v);
        if (n && isFinite(n) && n > 0) return n;
      } catch (e) {
      }
      return 1;
    })();

    cropper = new Cropper(image, {
      aspectRatio,
      viewMode: 2,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      minCropBoxWidth: 100,
      minCropBoxHeight: 100,
      ready: function () {
        try {
          const mode = conf && conf.fillMode ? String(conf.fillMode) : '';
          if (mode !== 'cover') return;
          const c = this.cropper;
          if (!c) return;
          const container = c.getContainerData ? c.getContainerData() : null;
          const img = c.getImageData ? c.getImageData() : null;
          if (!container || !img) return;
          const cw = Number(container.width) || 0;
          const ch = Number(container.height) || 0;
          const nw = Number(img.naturalWidth) || 0;
          const nh = Number(img.naturalHeight) || 0;
          if (cw <= 0 || ch <= 0 || nw <= 0 || nh <= 0) return;
          const scale = Math.max(cw / nw, ch / nh);
          if (!Number.isFinite(scale) || scale <= 0) return;
          c.zoomTo(scale);
        } catch (e) {
        }
      },
    });

    try {
      if (conf && conf.focusConfirm) {
        const btn = els.confirmBtn;
        if (btn) {
          setTimeout(() => btn.focus(), 0);
        }
      }
    } catch (e) {
    }
  }

  function closeCropModal(clearBlob = true) {
    const conf = currentCropConfig || activeConfig;
    const els = getModalEls(conf);
    const modal = els.modal;
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }

    destroyCropper();

    try { toggleSourceMenu(false); } catch (e) {}
    try { closeUrlModal(); } catch (e) {}

    if (clearBlob) {
      croppedImageBlob = null;
      try {
        const key = getConfigKey(conf);
        delete croppedBlobsById[key];
      } catch (e) {
      }
      try {
        const inputId = conf && conf.fileInputId ? String(conf.fileInputId) : null;
        clearInputValue(getElById(inputId));
      } catch (e) {
      }
    }

    currentCropConfig = null;
  }

  function handleCropConfirm() {
    if (!cropper) return;

    const conf = currentCropConfig || activeConfig;

    const outW = (() => {
      try {
        const v = conf && conf.outputWidth != null ? Number(conf.outputWidth) : null;
        return v && isFinite(v) && v > 0 ? v : 200;
      } catch (e) {
        return 200;
      }
    })();
    const outH = (() => {
      try {
        const v = conf && conf.outputHeight != null ? Number(conf.outputHeight) : null;
        return v && isFinite(v) && v > 0 ? v : 200;
      } catch (e) {
        return 200;
      }
    })();
    const outType = (() => {
      try {
        return (conf && conf.outputType) ? String(conf.outputType) : 'image/webp';
      } catch (e) {
        return 'image/webp';
      }
    })();
    const outQuality = (() => {
      try {
        const v = conf && conf.outputQuality != null ? Number(conf.outputQuality) : null;
        if (v != null && isFinite(v) && v > 0 && v <= 1) return v;
      } catch (e) {
      }
      return 0.95;
    })();

    const canvas = cropper.getCroppedCanvas({
      width: outW,
      height: outH,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!canvas) {
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('Ошибка обрезки изображения');
        }
      } catch (e) {
      }
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        try {
          if (typeof window.showToast === 'function') {
            window.showToast('Ошибка создания изображения');
          }
        } catch (e) {
        }
        return;
      }

      croppedImageBlob = blob;
      try {
        const key = getConfigKey(conf);
        croppedBlobsById[key] = blob;
      } catch (e) {
      }

      try {
        applyPreview(conf, blob);
      } catch (e) {
      }

      closeCropModal(false);

      try {
        if (conf && typeof conf.onConfirm === 'function') {
          conf.onConfirm(blob);
        }
      } catch (e) {
      }

      try {
        if (conf && conf.successToast && typeof window.showToast === 'function') {
          window.showToast(String(conf.successToast));
        }
      } catch (e) {
      }

      try {
        if (typeof window.showToast === 'function' && (!conf || !conf.onConfirm) && !conf?.successToast) {
          window.showToast('Обложка готова к сохранению');
        }
      } catch (e) {
      }

      try {
        if (conf && typeof conf.onDirty === 'function') {
          conf.onDirty();
        }
      } catch (e) {
      }

    }, outType, outQuality);
  }

  function getCroppedBlob(key) {
    if (key) {
      return croppedBlobsById[key] || null;
    }
    return croppedImageBlob;
  }

  function clearCroppedBlob(key) {
    if (key) {
      try {
        delete croppedBlobsById[key];
      } catch (e) {
      }
      return;
    }
    croppedImageBlob = null;
    try {
      const k = getConfigKey(activeConfig);
      if (k && k !== 'default') {
        delete croppedBlobsById[k];
      }
    } catch (e) {
    }
  }

  function triggerFilePicker(fileInput) {
    if (fileDialogActive) return;
    fileDialogActive = true;
    try {
      fileInput.click();
    } catch (e) {
      fileDialogActive = false;
      return;
    }
    // Страховка на случай, если событие focus не придёт (нативный диалог закрыт)
    setTimeout(() => {
      if (fileDialogActive) fileDialogActive = false;
    }, 4000);
  }

  function bind(config) {
    activeConfig = config || {};
    // Захватываем конфигурацию в локальную переменную: activeConfig — общий и
    // перезаписывается каждым вызовом bind(), поэтому в замыканиях он мог бы
    // «утекать» на конфиг другого компонента (книга/диктант/аватар).
    const conf = activeConfig;

    // Регистрируем конфигурацию по уникальному ключу, чтобы при выборе файла
    // в конкретном input восстанавливать правильные параметры обрезки.
    try {
      const key = getConfigKey(conf);
      configsById[key] = conf;
    } catch (e) {
    }

    const fileInput = getElById(conf.fileInputId);
    const uploadBtn = getElById(conf.uploadBtnId);
    const clickable = getElById(conf.clickableId);
    const dropZone = getElById(conf.dropZoneId || null);

    // Новый порядок: сначала открываем модалку обрезки, а файл выбираем уже в ней.
    if (uploadBtn) {
      if (!uploadBtn.getAttribute('data-cover-click-bound')) {
        uploadBtn.setAttribute('data-cover-click-bound', '1');
        uploadBtn.addEventListener('click', () => openCropModal('', conf));
      }
    }
    if (clickable) {
      if (!clickable.getAttribute('data-cover-click-bound')) {
        clickable.setAttribute('data-cover-click-bound', '1');
        clickable.addEventListener('click', () => openCropModal('', conf));
      }
    }
    if (fileInput) {
      if (!fileInput.getAttribute('data-cover-change-bound')) {
        fileInput.setAttribute('data-cover-change-bound', '1');
        fileInput.addEventListener('change', handleCoverSelect);
      }
    }

    // Drag & drop: кликабельная область, превью, явная drop-зона и сам кроп-модал
    try { bindDropZone(clickable, conf); } catch (e) {}
    try { bindDropZone(dropZone, conf); } catch (e) {}
    const previewIds = normIdList(conf && conf.previewImgId);
    for (const id of previewIds) {
      try { bindDropZone(getElById(id), conf); } catch (e) {}
    }

    const els = getModalEls(conf);
    if (els.closeBtn && !els.closeBtn.getAttribute('data-crop-btn-bound')) {
      els.closeBtn.setAttribute('data-crop-btn-bound', '1');
      els.closeBtn.addEventListener('click', () => closeCropModal(true));
    }
    if (els.cancelBtn && !els.cancelBtn.getAttribute('data-crop-btn-bound')) {
      els.cancelBtn.setAttribute('data-crop-btn-bound', '1');
      els.cancelBtn.addEventListener('click', () => closeCropModal(true));
    }
    if (els.confirmBtn && !els.confirmBtn.getAttribute('data-crop-btn-bound')) {
      els.confirmBtn.setAttribute('data-crop-btn-bound', '1');
      els.confirmBtn.addEventListener('click', handleCropConfirm);
    }

    try {
      const cropContainer = els.modal ? els.modal.querySelector('.crop-container') : null;
      // preferCurrent=true: при дропе в общую зону обрезки используем конфигурацию
      // текущей открытой модалки (currentCropConfig), а не первого забиндившего.
      bindDropZone(cropContainer, conf, true);
    } catch (e) {}

    try { bindSourceControls(); } catch (e) {}
    try { preventWindowDrop(); } catch (e) {}
    try { initFileDialogLock(); } catch (e) {}
  }

  window.CoverManager = {
    bind,
    handleCoverSelect,
    openCropModal,
    closeCropModal,
    handleCropConfirm,
    getCroppedBlob,
    clearCroppedBlob,
    withCacheBust,
    withCacheBustVersion,
    maybeCacheBustDictationCover,
    getCoverUrl,
    avatarUrlForUser,
    prefetchUrls,
  };

  try {
    if (!window.ImageManager) {
      window.ImageManager = {};
    }
    if (typeof window.ImageManager.getCoverUrl !== 'function') {
      window.ImageManager.getCoverUrl = getCoverUrl;
    }
  } catch (e) {
  }
})();
