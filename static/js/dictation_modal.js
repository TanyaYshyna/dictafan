(function () {
  const MODAL_ID = 'dictationModal';
  const BODY_ID = 'dictationModalBody';

  const DICTATION_SCRIPT_DEPS = [
    '/static/js/audio_player_visual.js',
    '/static/js/user_activity_history.js',
    '/static/js/dictation_statistics.js',
    '/static/js/progress_panel.js',
    '/static/js/speech_recognition_unified.js',
    '/static/js/script_dictation.js',
  ];

  const state = {
    isOpen: false,
    currentUrl: null,
    depsLoaded: false,
    opening: false,
  };

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getBody() {
    return document.getElementById(BODY_ID);
  }

  function setUsername() {
    try {
      const target = document.getElementById('dictationModalUsername');
      if (!target) return;
      const source = document.querySelector('.username-text');
      target.textContent = source ? (source.textContent || '').trim() : '';
    } catch (e) {
    }
  }

  function setAvatar() {
    try {
      const target = document.getElementById('dictationModalAvatar');
      if (!target) return;

      const source = document.querySelector('.user-avatar-small');
      if (!source) return;

      // Copy inline styles (background-image is usually there)
      target.style.cssText = source.style.cssText || '';

      // Copy classes that may affect avatar rendering
      target.className = source.className;
      target.id = 'dictationModalAvatar';
    } catch (e) {
    }
  }

  function renderLucide(root) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: root || document });
      }
    } catch (e) {
    }
  }

  function parseDictationHref(href) {
    // expected: /dictation/dict_123/en/uk
    try {
      const s = String(href || '').trim();
      const u = new URL(s, window.location.origin);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length < 4) return null;
      if (parts[0] !== 'dictation') return null;
      return {
        dictationIdFormatted: parts[1],
        langOriginal: parts[2],
        langTranslation: parts[3],
      };
    } catch (e) {
      return null;
    }
  }

  function applyDictationMetaFromCard({ href, cardEl }) {
    const parsed = parseDictationHref(href);
    if (!parsed) return;

    const dictationData = document.getElementById('dictation-data');
    if (dictationData) {
      dictationData.setAttribute('data-language-original', parsed.langOriginal);
      dictationData.setAttribute('data-language-translation', parsed.langTranslation);
      dictationData.setAttribute('data-dictation-id', parsed.dictationIdFormatted);
      dictationData.setAttribute('data-lang-notice', '');
      dictationData.setAttribute('data-is-dialog', 'false');
      dictationData.setAttribute('data-speakers', '[]');

      try {
        let title = '';
        if (cardEl) {
          const t = cardEl.querySelector('[data-slot="title"], .short-title');
          if (t) title = String(t.textContent || '').trim();
        }
        dictationData.setAttribute('data-title-orig', title);
      } catch (e) {
      }
    }

    try {
      const title = dictationData ? String(dictationData.getAttribute('data-title-orig') || '') : '';
      const titleEl = document.getElementById('dictationTitle');
      if (titleEl) titleEl.textContent = title;
      const titleModalEl = document.getElementById('title-diktation');
      if (titleModalEl) titleModalEl.textContent = title;
    } catch (e) {
    }

    try {
      const langPair = document.getElementById('dictationLangPair');
      if (langPair) langPair.textContent = parsed.langOriginal;
      const tr = document.getElementById('dictationTranslationLanguage');
      if (tr) tr.textContent = parsed.langTranslation;
    } catch (e) {
    }

    try {
      const idDisplay = document.getElementById('dictationIdDisplay');
      if (idDisplay) idDisplay.textContent = parsed.dictationIdFormatted;
    } catch (e) {
    }

    try {
      const badge = document.getElementById('startModalDiktNumber');
      if (badge) {
        const num = String(parsed.dictationIdFormatted || '').replace(/^dict_/, '');
        badge.textContent = num;
      }
    } catch (e) {
    }
  }

  function ensureScript(src) {
    return new Promise((resolve, reject) => {
      try {
        if (document.querySelector('script[data-dictation-dep="' + src + '"]')) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src + (window.__APP_CACHE_REVISION ? ('?v=' + window.__APP_CACHE_REVISION) : '');
        s.async = false;
        s.defer = true;
        s.dataset.dictationDep = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed loading ' + src));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function showStartModal() {
    try {
      const startModal = document.getElementById('start-modal');
      if (!startModal) return;
      startModal.style.display = 'block';
      renderLucide(startModal);
    } catch (e) {
    }
  }

  async function ensureDictationDepsLoaded() {
    if (state.depsLoaded) return;
    for (const src of DICTATION_SCRIPT_DEPS) {
      await ensureScript(src);
    }
    state.depsLoaded = true;
  }

  function cleanupPreviousDictationState() {
    // Keep DOM static; just drop runtime state markers.
    try {
      const dictationData = document.getElementById('dictation-data');
      if (dictationData) {
        dictationData.setAttribute('data-language-original', '');
        dictationData.setAttribute('data-language-translation', '');
        dictationData.setAttribute('data-dictation-id', '');
        dictationData.setAttribute('data-title-orig', '');
      }
    } catch (e) {
    }
  }

  function bindHeaderButtons() {
    const closeBtn = document.getElementById('dictationModalCloseBtn');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      });
    }
  }

  function bindOverlayClose() {
    const modal = getModal();
    if (!modal || modal.dataset.boundOverlay === '1') return;
    modal.dataset.boundOverlay = '1';

    modal.addEventListener('click', (e) => {
      try {
        if (e && e.target === modal) {
          close();
        }
      } catch (e2) {
      }
    });

    document.addEventListener('keydown', (e) => {
      try {
        if (!state.isOpen) return;
        if (e && e.key === 'Escape') close();
      } catch (e2) {
      }
    });
  }

  async function open(dictationUrl, opts = {}) {
    if (state.opening) return;
    state.opening = true;

    try {
      const modal = getModal();
      if (!modal) return;

      setUsername();
      setAvatar();
      bindHeaderButtons();
      bindOverlayClose();

      modal.style.display = 'flex';
      modal.classList.add('show');
      state.isOpen = true;

      cleanupPreviousDictationState();
      state.currentUrl = dictationUrl;

      try {
        applyDictationMetaFromCard({ href: dictationUrl, cardEl: opts.cardEl || null });
      } catch (e) {
      }

      await ensureDictationDepsLoaded();

      // Dictation page normally initializes on DOMContentLoaded.
      // Here we call the exported init function after content is mounted.
      try {
        if (typeof window.onloadInitializeDictation === 'function') {
          window.onloadInitializeDictation();
        }
      } catch (e) {
      }

      // First user step is the sentence selection modal.
      // Open it explicitly after initialization to make the flow predictable.
      try {
        setTimeout(() => {
          try {
            showStartModal();
          } catch (e) {
          }
        }, 50);
      } catch (e) {
      }

      // Some dictation UI bits are usually set in inline script in dictation.html.
      // We replicate the minimal critical part: create ProgressPanel if needed.
      try {
        if (!window.UM) {
          window.UM = new UserManager({ apiBase: '/user/api' });
        }
      } catch (e) {
      }

      try {
        if (window.ProgressPanel && window.UM) {
          window.progressPanel = new ProgressPanel(window.UM, { apiBase: '/user/api', saveInterval: 5 });
          const inlineContainer = document.getElementById('progressPanelContainer');
          const modalContainer = document.getElementById('progressPanelModalContainer');
          if (inlineContainer) {
            window.progressPanel.render(inlineContainer, 'inline');
          }
          if (modalContainer) {
            window.progressPanel.render(modalContainer, 'modal');
          }
        }
      } catch (e) {
      }

      renderLucide(modal);
    } finally {
      state.opening = false;
    }
  }

  function close() {
    const modal = getModal();
    if (!modal) return;

    try {
      modal.style.display = 'none';
    } catch (e) {
    }
    try {
      modal.classList.remove('show');
    } catch (e) {
    }

    state.isOpen = false;
  }

  function patchDictationCardOpenHandler() {
    if (document.body.dataset.dictationModalCardPatch === '1') return;
    document.body.dataset.dictationModalCardPatch = '1';

    document.addEventListener('click', (e) => {
      try {
        const thumb = e.target && e.target.closest ? e.target.closest('.short-thumb[data-href]') : null;
        if (!thumb) return;

        // Only for desk cards for now
        const card = thumb.closest('.desk-card');
        if (!card) return;

        const href = thumb.getAttribute('data-href');
        if (!href) return;

        e.preventDefault();
        e.stopPropagation();
        open(href, { cardEl: card });
      } catch (e2) {
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      try {
        const el = document.activeElement;
        if (!el) return;
        if (e && (e.key === 'Enter' || e.key === ' ')) {
          const thumb = el.closest ? el.closest('.short-thumb[data-href]') : null;
          if (!thumb) return;
          const card = thumb.closest('.desk-card');
          if (!card) return;
          const href = thumb.getAttribute('data-href');
          if (!href) return;
          e.preventDefault();
          e.stopPropagation();
          open(href, { cardEl: card });
        }
      } catch (e2) {
      }
    }, true);
  }

  function init() {
    patchDictationCardOpenHandler();
    bindHeaderButtons();
    bindOverlayClose();
  }

  window.DictationModal = { open, close, init };

  try {
    document.addEventListener('DOMContentLoaded', () => init());
  } catch (e) {
  }
})();
