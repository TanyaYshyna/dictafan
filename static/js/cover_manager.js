(function () {
  if (window.CoverManager) {
    return;
  }

  let cropper = null;
  let croppedImageBlob = null;
  let activeConfig = null;

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

  function handleCoverSelect(event) {
    const file = getCoverFileFromEvent(event);
    if (!file) return;

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
      const maxSize = activeConfig && activeConfig.maxFileSizeBytes ? Number(activeConfig.maxFileSizeBytes) : null;
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
        openCropModal(dataUrl);
      } catch (e) {
      }
    })();
  }

  function openCropModal(imageSrc) {
    const els = getModalEls(activeConfig);
    const modal = els.modal;
    const image = els.image;

    if (!modal || !image) return;

    image.src = imageSrc;

    modal.style.display = 'flex';
    modal.classList.add('show');

    if (cropper) {
      try {
        cropper.destroy();
      } catch (e) {
      }
    }

    const aspectRatio = (() => {
      try {
        const v = activeConfig && activeConfig.aspectRatio != null ? activeConfig.aspectRatio : null;
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
          const mode = activeConfig && activeConfig.fillMode ? String(activeConfig.fillMode) : '';
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
      if (activeConfig && activeConfig.focusConfirm) {
        const btn = els.confirmBtn;
        if (btn) {
          setTimeout(() => btn.focus(), 0);
        }
      }
    } catch (e) {
    }
  }

  function closeCropModal(clearBlob = true) {
    const els = getModalEls(activeConfig);
    const modal = els.modal;
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }

    if (cropper) {
      try {
        cropper.destroy();
      } catch (e) {
      }
      cropper = null;
    }

    if (clearBlob) {
      croppedImageBlob = null;
      try {
        const inputId = activeConfig && activeConfig.fileInputId ? String(activeConfig.fileInputId) : null;
        clearInputValue(getElById(inputId));
      } catch (e) {
      }
    }
  }

  function handleCropConfirm() {
    if (!cropper) return;

    const outW = (() => {
      try {
        const v = activeConfig && activeConfig.outputWidth != null ? Number(activeConfig.outputWidth) : null;
        return v && isFinite(v) && v > 0 ? v : 200;
      } catch (e) {
        return 200;
      }
    })();
    const outH = (() => {
      try {
        const v = activeConfig && activeConfig.outputHeight != null ? Number(activeConfig.outputHeight) : null;
        return v && isFinite(v) && v > 0 ? v : 200;
      } catch (e) {
        return 200;
      }
    })();
    const outType = (() => {
      try {
        return (activeConfig && activeConfig.outputType) ? String(activeConfig.outputType) : 'image/webp';
      } catch (e) {
        return 'image/webp';
      }
    })();
    const outQuality = (() => {
      try {
        const v = activeConfig && activeConfig.outputQuality != null ? Number(activeConfig.outputQuality) : null;
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
        applyPreview(activeConfig, blob);
      } catch (e) {
      }

      closeCropModal(false);

      try {
        if (activeConfig && typeof activeConfig.onConfirm === 'function') {
          activeConfig.onConfirm(blob);
        }
      } catch (e) {
      }

      try {
        if (activeConfig && activeConfig.successToast && typeof window.showToast === 'function') {
          window.showToast(String(activeConfig.successToast));
        }
      } catch (e) {
      }

      try {
        if (typeof window.showToast === 'function' && (!activeConfig || !activeConfig.onConfirm) && !activeConfig?.successToast) {
          window.showToast('Обложка готова к сохранению');
        }
      } catch (e) {
      }

      try {
        if (activeConfig && typeof activeConfig.onDirty === 'function') {
          activeConfig.onDirty();
        }
      } catch (e) {
      }

    }, outType, outQuality);
  }

  function getCroppedBlob() {
    return croppedImageBlob;
  }

  function clearCroppedBlob() {
    croppedImageBlob = null;
  }

  function bind(config) {
    activeConfig = config || {};

    const fileInput = getElById(activeConfig.fileInputId);
    const uploadBtn = getElById(activeConfig.uploadBtnId);
    const clickable = getElById(activeConfig.clickableId);

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
    }
    if (clickable && fileInput) {
      clickable.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
      fileInput.addEventListener('change', handleCoverSelect);
    }

    const els = getModalEls(activeConfig);
    if (els.closeBtn) {
      els.closeBtn.addEventListener('click', () => closeCropModal(true));
    }
    if (els.cancelBtn) {
      els.cancelBtn.addEventListener('click', () => closeCropModal(true));
    }
    if (els.confirmBtn) {
      els.confirmBtn.addEventListener('click', handleCropConfirm);
    }
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
