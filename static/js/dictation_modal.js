  const MODAL_ID = 'dictationModal';
  const BODY_ID = 'dictationModalBody';

  const DICTATION_SCRIPT_DEPS = [
    '/static/js/idb_manager.js',
    '/static/js/desktop_confirm_modal.js',
    '/static/js/language_manager.js',
    '/static/js/language_selector.js',
    '/static/js/cover_manager.js',
    '/static/js/audio_manager.js',
    '/static/js/audio_player_visual.js',
    '/static/js/user_activity_history.js',
    '/static/js/dictation_statistics.js',
    '/static/js/progress_panel.js',
    '/static/js/speech_recognition_unified.js',
    '/static/js/dictation_runtime/dictation_store.js',
  ];

  const state = {
    isOpen: false,
    currentUrl: null,
    depsLoaded: false,
    opening: false,
  };

  try {
    if (typeof window.startGame !== 'function') {
      window.startGame = () => {
        try {
          const session = window.__dictationModalActiveSession;
          if (session) {
            session.ensureDefaultSelection();
            session.currentSelectedIndex = 0;
            updateNavigatorFromSession(session);
          }
        } catch (e0) {
        }
        try {
          const m = document.getElementById('start-modal');
          if (m) m.style.display = 'none';
        } catch (e) {
        }
      };
    }
    if (typeof window.nextSentence !== 'function') {
      window.nextSentence = () => {
        try {
          const session = window.__dictationModalActiveSession;
          if (!session) return;
          session.goNext();
          updateNavigatorFromSession(session);
        } catch (e) {
        }
      };
    }
    if (typeof window.previousSentence !== 'function') {
      window.previousSentence = () => {
        try {
          const session = window.__dictationModalActiveSession;
          if (!session) return;
          session.goPrev();
          updateNavigatorFromSession(session);
        } catch (e) {
        }
      };
    }
    if (typeof window.checkText !== 'function') window.checkText = () => {};
    if (typeof window.resumeGame !== 'function') window.resumeGame = () => {};
  } catch (e) {
  }

  function bindDictationModalHotkeys() {
    try {
      if (document.body.dataset.boundDictationModalHotkeys === '1') return;
      document.body.dataset.boundDictationModalHotkeys = '1';
    } catch (e0) {
    }

    document.addEventListener('keydown', (event) => {
      try {
        if (!state.isOpen) return;
        if (!event || !event.ctrlKey) return;

        switch (event.code) {
          case 'Digit1': {
            const visual = window.__dictationModalOriginalAudioVisual;
            if (visual && visual.playButton) visual.playButton.click();
            event.preventDefault();
            break;
          }
          case 'Digit2': {
            const btn = document.getElementById('translationPlayButton');
            if (btn) btn.click();
            event.preventDefault();
            break;
          }
          case 'Digit3': {
            if (typeof window.previousSentence === 'function') window.previousSentence();
            event.preventDefault();
            break;
          }
          case 'Digit4': {
            if (typeof window.nextSentence === 'function') window.nextSentence();
            event.preventDefault();
            break;
          }
          default:
            break;
        }
      } catch (e) {
      }
    });
  }

  function getCurrentSentenceViewFromSession(session) {
    try {
      if (!session || !Array.isArray(session.selectedKeys) || session.selectedKeys.length === 0) return null;
      const idx = Number(session.currentSelectedIndex) || 0;
      const key = session.selectedKeys[Math.max(0, Math.min(session.selectedKeys.length - 1, idx))];
      return session.getSentenceView ? session.getSentenceView(key) : null;
    } catch (e) {
      return null;
    }
  }

  function resolveAudioToUrl(rawValue, dictId, lang) {
    try {
      const am = window.AudioManager;
      const v = String(rawValue || '').trim();
      if (!v) return '';
      if (v.startsWith('blob:')) return v;
      if (v.startsWith('/api/') || v.startsWith('http://') || v.startsWith('https://')) {
        if (am && typeof am.normalizeMediaUrl === 'function') return am.normalizeMediaUrl(v);
        return v;
      }
      const name = v.split('?', 1)[0].split('/').pop();
      if (!name) return '';
      if (am && typeof am.buildDictationAudioUrl === 'function') {
        return am.buildDictationAudioUrl(dictId, String(lang), name);
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function getPlaySequenceStartValue() {
    try {
      const el = document.getElementById('playSequenceStart');
      const v = el && el.value != null ? String(el.value) : '';
      if (v.trim()) return v.trim();
    } catch (e) {
    }
    try {
      const v = window.playSequenceStart != null ? String(window.playSequenceStart) : '';
      if (v.trim()) return v.trim();
    } catch (e) {
    }
    return 'oto';
  }

  function playAudioSequence(sequence, { originalUrl, translationUrl }) {
    try {
      const am = window.AudioManager;
      if (!am || typeof am.play !== 'function') return;
      const seq = String(sequence || '').trim().toLowerCase();
      if (!seq) return;

      const steps = [];
      for (const ch of seq) {
        if (ch === 'o' && originalUrl) steps.push({ url: originalUrl, button: null });
        if (ch === 't' && translationUrl) steps.push({ url: translationUrl, button: document.getElementById('translationPlayButton') });
      }
      if (!steps.length) return;

      let i = 0;
      const runNext = () => {
        try {
          const step = steps[i++];
          if (!step) return;
          am.play(step.button || null, step.url, () => {
            runNext();
          });
        } catch (e) {
        }
      };
      runNext();
    } catch (e) {
    }
  }

  function updateAudioPlayersFromSession(session) {
    try {
      const startModal = document.getElementById('start-modal');
      if (startModal && (startModal.style.display === 'flex' || startModal.style.display === 'block')) {
        return;
      }
    } catch (e0) {
    }

    const view = getCurrentSentenceViewFromSession(session);
    if (!view) return;

    let dictId = '';
    let langOrig = '';
    let langTr = '';
    try {
      const dictationData = document.getElementById('dictation-data');
      dictId = dictationData ? String(dictationData.getAttribute('data-dictation-id') || '').trim() : '';
      langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '').trim() : '';
      langTr = dictationData ? String(dictationData.getAttribute('data-language-translation') || '').trim() : '';
    } catch (e1) {
    }

    const originalUrl = resolveAudioToUrl((view.audio_original != null ? view.audio_original : view.audio), dictId, langOrig);
    const translationUrl = resolveAudioToUrl((view.audio_translation != null ? view.audio_translation : view.audio_tr), dictId, langTr);

    try {
      const visual = window.__dictationModalOriginalAudioVisual;
      if (visual && typeof visual.setAudioPaths === 'function') {
        visual.setAudioPaths({ audio: originalUrl || null, audio_a: null, audio_f: null, audio_m: null });
      }
    } catch (e2) {
    }

    try {
      const btn = document.getElementById('translationPlayButton');
      if (btn) {
        btn.dataset.audioUrl = translationUrl || '';
        if (btn.dataset.boundDictationModal !== '1') {
          btn.dataset.boundDictationModal = '1';
          btn.addEventListener('click', (e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch (e0) {
            }
            try {
              const u = String(btn.dataset.audioUrl || '').trim();
              if (!u) return;
              if (window.AudioManager && typeof window.AudioManager.play === 'function') {
                window.AudioManager.play(btn, u);
              }
            } catch (e1) {
            }
          });
        }
      }
    } catch (e3) {
    }

    try {
      clearTimeout(state._startSequenceTimer);
    } catch (e4) {
    }
    try {
      state._startSequenceTimer = setTimeout(() => {
        try {
          const seq = getPlaySequenceStartValue();
          playAudioSequence(seq, { originalUrl, translationUrl });
        } catch (e0) {
        }
      }, 300);
    } catch (e5) {
    }
  }

  function initModalOriginalAudioPlayer(parsed) {
    try {
      const container = document.getElementById('originalAudioPlayer');
      if (!container) return;
      if (typeof AudioPlayerVisual === 'undefined') return;
      if (container.dataset.boundAudioVisual === '1') return;

      const visual = new AudioPlayerVisual(container);
      try {
        visual.setLanguage(String(parsed && parsed.langOriginal ? parsed.langOriginal : '').trim().toLowerCase());
      } catch (e0) {
      }

      visual.setOnPlayClick(() => {
        try {
          const audioPath = visual.getCurrentAudioPath();
          if (!audioPath) return;
          if (window.AudioManager && typeof window.AudioManager.play === 'function') {
            window.AudioManager.play(visual.playButton || null, audioPath);
          }
        } catch (e) {
        }
      });

      visual.setOnSpeedChange((rate) => {
        try {
          if (window.AudioManager && typeof window.AudioManager.setPlaybackRate === 'function') {
            window.AudioManager.setPlaybackRate(rate);
          }
        } catch (e) {
        }
      });

      visual.setOnProgressSeek((progressPercent) => {
        try {
          if (!window.AudioManager || typeof window.AudioManager.seekToPercent !== 'function') return;
          window.AudioManager.seekToPercent(progressPercent);
        } catch (e) {
        }
      });

      try {
        if (window.AudioManager && typeof window.AudioManager.setAudioPlayerVisual === 'function') {
          window.AudioManager.setAudioPlayerVisual(visual);
        }
      } catch (e1) {
      }

      try {
        window.__dictationModalOriginalAudioVisual = visual;
      } catch (e2) {
      }

      container.dataset.boundAudioVisual = '1';
    } catch (e) {
    }
  }

  function renderLucideCheckboxButton(btn, checked, disabled) {
    if (!btn) return;
    btn.dataset.checked = checked ? '1' : '0';
    btn.dataset.disabled = disabled ? '1' : '0';
    btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    btn.disabled = Boolean(disabled);
    btn.innerHTML = `<i data-lucide="${checked ? 'circle-check-big' : 'circle'}"></i>`;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: btn });
      }
    } catch (e) {
    }
  }

  function renderModalLangPair(parsed) {
    try {
      const pairContainer = document.getElementById('dictationLangPair');
      if (!pairContainer) return;
      if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') {
        pairContainer.textContent = String(parsed && parsed.langOriginal ? parsed.langOriginal : '');
        return;
      }
      const languageData = window.LanguageManager.getLanguageData && window.LanguageManager.getLanguageData();
      if (!languageData) {
        pairContainer.textContent = String(parsed && parsed.langOriginal ? parsed.langOriginal : '');
        return;
      }
      pairContainer.innerHTML = '';
      window.initLanguageSelector('dictationLangPair', {
        mode: 'flag-pair-fixed',
        currentLearning: String(parsed && parsed.langOriginal ? parsed.langOriginal : '').trim().toLowerCase(),
        nativeLanguage: String(parsed && parsed.langTranslation ? parsed.langTranslation : '').trim().toLowerCase(),
        languageData,
      });
    } catch (e) {
    }
  }

  function renderModalCover(parsed) {
    try {
      const img = document.getElementById('dictationModalCover');
      if (!img) return;
      const dictId = parsed && parsed.dictationIdFormatted ? String(parsed.dictationIdFormatted) : '';
      const lang = parsed && parsed.langOriginal ? String(parsed.langOriginal) : '';
      let src = '';
      try {
        if (window.CoverManager && typeof window.CoverManager.getCoverUrl === 'function') {
          src = window.CoverManager.getCoverUrl(dictId, lang);
        } else if (window.ImageManager && typeof window.ImageManager.getCoverUrl === 'function') {
          src = window.ImageManager.getCoverUrl(dictId, lang);
        }
      } catch (e0) {
        src = '';
      }

      try {
        if (src && window.maybeCacheBustDictationCover) {
          src = window.maybeCacheBustDictationCover(src);
        }
      } catch (e1) {
      }
      img.src = src || '/static/data/covers/cover_en.webp';
      img.onerror = () => {
        try { img.onerror = null; } catch (e1) {}
        img.src = '/static/data/covers/cover_en.webp';
      };
    } catch (e) {
    }
  }

  function setColumnsVisibilityByClass({ className, visible }) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const cls = String(className || '').trim();
      if (!cls) return;
      const map = {
        'col-progress': 'hide-progress',
        'col-text-original': 'hide-original',
        'col-text-translation': 'hide-translation',
      };
      const hideClass = map[cls];
      if (!hideClass) return;
      table.classList.toggle(hideClass, !visible);
    } catch (e) {
    }
  }

  function updateColumnToggleButtonIcon(buttonId, checked) {
    try {
      const btn = document.getElementById(buttonId);
      if (!btn) return;
      const icon = btn.querySelector('.sentence-col-flag-icon');
      if (!icon) return;
      icon.setAttribute('data-lucide', checked ? 'circle-check-big' : 'circle');
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: btn });
        }
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  function applyStartModalColumnsPreset(preset) {
    const p = preset && typeof preset === 'object' ? preset : {};
    const showProgress = Boolean(p.progress);
    const showOrig = Boolean(p.original);
    const showTr = Boolean(p.translation);

    setColumnsVisibilityByClass({ className: 'col-progress', visible: showProgress });
    setColumnsVisibilityByClass({ className: 'col-text-original', visible: showOrig });
    setColumnsVisibilityByClass({ className: 'col-text-translation', visible: showTr });

    updateColumnToggleButtonIcon('toggleProgressColumnsBtn', showProgress);
    updateColumnToggleButtonIcon('toggleOriginalColumnBtn', showOrig);
    updateColumnToggleButtonIcon('toggleTranslationColumnBtn', showTr);

    try {
      window.__dictationStartModalColumnPrefs = { progress: showProgress, original: showOrig, translation: showTr };
    } catch (e) {
    }
  }

  function renderLucideTriStateCheckboxButton(btn, state, disabled) {
    if (!btn) return;
    const s = String(state || 'unchecked');
    const isChecked = s === 'checked';
    const isMixed = s === 'mixed';
    btn.dataset.checked = isChecked ? '1' : '0';
    btn.dataset.mixed = isMixed ? '1' : '0';
    btn.dataset.disabled = disabled ? '1' : '0';
    btn.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
    btn.disabled = Boolean(disabled);
    const icon = isMixed ? 'circle-alert' : (isChecked ? 'circle-check-big' : 'circle');
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: btn });
      }
    } catch (e) {
    }
  }

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

  function bindAudioSettingsModalControls() {
    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return;

      const closeBtn = document.getElementById('closeAudioSettingsModal');
      if (closeBtn && closeBtn.dataset.boundDictationModal !== '1') {
        closeBtn.dataset.boundDictationModal = '1';
        closeBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            m.style.display = 'none';
          } catch (e1) {
          }
          try {
            if (typeof window.updateRecognitionModeIcon === 'function') {
              window.updateRecognitionModeIcon();
            }
          } catch (e2) {
          }
        });
      }

      if (m.dataset.boundDictationModalBackdrop !== '1') {
        m.dataset.boundDictationModalBackdrop = '1';
        m.addEventListener('click', (e) => {
          try {
            if (e && e.target === m) {
              m.style.display = 'none';
              try {
                if (typeof window.updateRecognitionModeIcon === 'function') {
                  window.updateRecognitionModeIcon();
                }
              } catch (e3) {
              }
            }
          } catch (e2) {
          }
        });
      }
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

  function getDraftUserIdForKey() {
    try {
      const um = window.UM;
      const id = um?.userData?.id;
      if (id != null && String(id).trim()) return String(id).trim();
    } catch (e) {
    }
    return 'anon';
  }

  function getRuntimeStore() {
    try {
      if (window.__dictationRuntimeStore) return window.__dictationRuntimeStore;
      if (!window.DictationRuntime || !window.DictationRuntime.DictationSessionsStore) return null;
      window.__dictationRuntimeStore = new window.DictationRuntime.DictationSessionsStore({
        maxSessions: window.DictationRuntime.MAX_OPEN_SESSIONS || 5,
      });
      return window.__dictationRuntimeStore;
    } catch (e) {
      return null;
    }
  }

  async function loadSentencesFromIndexedDb({ dictationId, langOrig, langTr }) {
    try {
      const idb = window.IdbManager;
      if (!idb || typeof idb.idbGet !== 'function' || typeof idb.openDraftDb !== 'function') return null;

      const dictId = String(dictationId || '').trim();
      const lo = String(langOrig || '').trim();
      const lt = String(langTr || '').trim();
      if (!dictId || !lo || !lt) return null;

      const rawUserId = String(getDraftUserIdForKey());
      const candidateKeys = [];
      candidateKeys.push(`${rawUserId}:${dictId}:${lo}:${lt}`);
      try {
        const numericId = parseInt(dictId.replace(/^dict_/, ''), 10);
        if (Number.isFinite(numericId)) {
          candidateKeys.push(`${rawUserId}:${numericId}:${lo}:${lt}`);
          candidateKeys.push(`${rawUserId}:dict_${numericId}:${lo}:${lt}`);
          candidateKeys.push(`anon:dict_${numericId}:${lo}:${lt}`);
        }
      } catch (e) {
      }

      let cached = null;
      for (const key of candidateKeys) {
        cached = await idb.idbGet('dictations', key);
        const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
        if (sentences.length) break;
        cached = null;
      }

      if (!cached) {
        const db = await idb.openDraftDb();
        try {
          cached = await new Promise((resolve) => {
            const tx = db.transaction('dictations', 'readonly');
            const store = tx.objectStore('dictations');
            const req = store.openCursor();
            req.onsuccess = () => {
              const cursor = req.result;
              if (!cursor) return resolve(null);
              const v = cursor.value;
              if (v && v.dictationId === dictId && v.langOrig === lo && v.langTr === lt) {
                return resolve(v);
              }
              cursor.continue();
            };
            req.onerror = () => resolve(null);
          });
        } finally {
          try {
            db.close();
          } catch (e) {
          }
        }
      }

      const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
      if (!sentences.length) return null;
      return sentences;
    } catch (e) {
      return null;
    }
  }

  async function fetchSentencesFromServerAndCache({ dictationId, langOrig, langTr }) {
    const dictId = String(dictationId || '').trim();
    const lo = String(langOrig || '').trim();
    const lt = String(langTr || '').trim();
    if (!dictId || !lo || !lt) {
      throw new Error('missing_dictation_params');
    }

    const url = `/api/dictation/${encodeURIComponent(dictId)}/${encodeURIComponent(lo)}/${encodeURIComponent(lt)}/sentences`;
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`fetch_sentences_failed_${response.status}_${text}`);
    }
    const data = await response.json();
    const sentences = (data && Array.isArray(data.sentences)) ? data.sentences : [];
    if (!sentences.length) {
      throw new Error('empty_sentences');
    }

    sentences.sort((a, b) => {
      const ap = (a && a.position !== undefined && a.position !== null && isFinite(Number(a.position))) ? Number(a.position) : null;
      const bp = (b && b.position !== undefined && b.position !== null && isFinite(Number(b.position))) ? Number(b.position) : null;
      if (ap !== null && bp !== null) return ap - bp;
      if (ap !== null) return -1;
      if (bp !== null) return 1;
      const ak = a && a.key ? String(a.key) : '';
      const bk = b && b.key ? String(b.key) : '';
      return ak.localeCompare(bk);
    });

    const idb = window.IdbManager;
    if (idb && typeof idb.idbPut === 'function') {
      const userId = String(getDraftUserIdForKey());
      const key = `${userId}:${dictId}:${lo}:${lt}`;
      await idb.idbPut('dictations', {
        key,
        dictationId: dictId,
        langOrig: lo,
        langTr: lt,
        sentences,
        updatedAt: Date.now(),
      });
    }

    try {
      setTimeout(() => {
        try {
          const am = window.AudioManager;
          if (!am || typeof am.normalizeMediaUrl !== 'function' || typeof am.buildDictationAudioUrl !== 'function' || typeof am.prefetchMediaUrls !== 'function') return;
          const audioUrls = [];
          const resolveAudioToUrl = (rawValue, lang) => {
            const v = String(rawValue || '').trim();
            if (!v) return null;
            if (v.startsWith('blob:')) return v;
            if (v.startsWith('/api/')) return am.normalizeMediaUrl(v);
            if (v.startsWith('http://') || v.startsWith('https://')) return am.normalizeMediaUrl(v);
            const name = v.split('?', 1)[0].split('/').pop();
            if (!name) return null;
            return am.buildDictationAudioUrl(dictId, String(lang), name);
          };
          for (const s of sentences) {
            if (!s || typeof s !== 'object') continue;
            const u1 = resolveAudioToUrl(s.audio, lo);
            const u2 = resolveAudioToUrl(s.audio_tr, lt);
            if (u1) audioUrls.push(u1);
            if (u2) audioUrls.push(u2);
          }
          const unique = Array.from(new Set(audioUrls.filter(Boolean)));
          if (unique.length) {
            am.prefetchMediaUrls(unique, { concurrency: 4 }).catch(() => {});
          }
        } catch (e) {
        }
      }, 0);
    } catch (e) {
    }

    return sentences;
  }

  async function ensureDictationContentLoadedToRuntime({ dictationIdFormatted, langOriginal, langTranslation }) {
    const store = getRuntimeStore();
    if (!store) throw new Error('DictationRuntime_not_loaded');

    const dictationId = String(dictationIdFormatted || '').trim();
    const langOrig = String(langOriginal || '').trim();
    const langTr = String(langTranslation || '').trim();
    if (!dictationId || !langOrig || !langTr) throw new Error('missing_dictation_params');

    let sentences = await loadSentencesFromIndexedDb({ dictationId, langOrig, langTr });
    if (!Array.isArray(sentences) || sentences.length === 0) {
      try {
        if (window.DesktopToast && typeof window.DesktopToast.show === 'function') {
          window.DesktopToast.show('Данных нет в кеше. Загружаю из интернета…', 'info', 2500);
        } else if (typeof window.showSaveToast === 'function') {
          window.showSaveToast('Данных нет в кеше. Загружаю из интернета…', 'info', 2500);
        }
      } catch (e) {
      }

      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
          window.DesktopLoadingModal.show('Загрузка диктанта в кеш…');
        } else if (typeof window.showDictationCacheFetchOverlay === 'function') {
          window.showDictationCacheFetchOverlay('Загрузка диктанта в кеш…');
        }
      } catch (e) {
      }

      try {
        await fetchSentencesFromServerAndCache({ dictationId, langOrig, langTr });
      } catch (e) {
        try {
          if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
            window.DesktopLoadingModal.hide();
          } else if (typeof window.hideDictationCacheFetchOverlay === 'function') {
            window.hideDictationCacheFetchOverlay();
          }
        } catch (e0) {
        }

        try {
          const raw = e && e.message ? String(e.message) : String(e);
          const isStorage = raw.includes('fetch_sentences_failed_503')
            || raw.includes('fetch_sentences_failed_502')
            || raw.includes('_503_')
            || raw.includes('_502_');
          if (typeof window.showNoSelectionModal === 'function') {
            if (isStorage) {
              window.showNoSelectionModal('Хранилище временно недоступно. Попробуй ещё раз позже.');
            } else {
              window.showNoSelectionModal('Не удалось загрузить диктант. Проверь интернет и обнови страницу.');
            }
          }
        } catch (e1) {
        }

        throw e;
      }

      sentences = await loadSentencesFromIndexedDb({ dictationId, langOrig, langTr });
      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
          window.DesktopLoadingModal.hide();
        } else if (typeof window.hideDictationCacheFetchOverlay === 'function') {
          window.hideDictationCacheFetchOverlay();
        }
      } catch (e) {
      }
    }
    if (!Array.isArray(sentences) || sentences.length === 0) {
      try {
        if (typeof window.showNoSelectionModal === 'function') {
          window.showNoSelectionModal('Не удалось сохранить диктант в кеш. Обнови страницу.');
        }
      } catch (e) {
      }
      throw new Error('empty_sentences');
    }

    store.setContentSentences({ dictationId, langTr, sentences });
    return true;
  }

  function getOrCreateDefaultSessionFromParsed(parsed) {
    const store = getRuntimeStore();
    if (!store) return null;

    const dictationId = String(parsed?.dictationIdFormatted || '').trim();
    const langTr = String(parsed?.langTranslation || '').trim();
    if (!dictationId || !langTr) return null;

    const session = store.getOrCreateSession({
      dictationId,
      langTr,
      exerciseId: null,
      subsetPositions: null,
      subsetSignature: null,
    });

    try {
      const content = store.getContent({ dictationId, langTr });
      const keys = content ? content.getAllKeys() : [];
      session.setActiveSubsetByKeys(keys);
      session.ensureDefaultSelection();
    } catch (e) {
    }

    return session;
  }

  function renderStartModalSentencesTable(session) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const keys = session && session.activeKeys ? session.activeKeys : (session && session.content ? session.content.getAllKeys() : []);
      const list = Array.isArray(keys) ? keys : [];

      list.forEach((key, idx) => {
        const view = session.getSentenceView(key);
        if (!view) return;

        const tr = document.createElement('tr');
        tr.dataset.sentenceKey = String(view.key);

        const tdNum = document.createElement('td');
        tdNum.textContent = String(idx + 1);

        const tdChoice = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'all-checkbox-btn';
        btn.setAttribute('aria-label', 'Выбрать предложение');

        renderLucideCheckboxButton(btn, view.selection_state === 'checked', false);

        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          try {
            const st = session.getState(view.key);
            const cur = st && st.selection_state ? String(st.selection_state) : 'unchecked';
            const next = (cur === 'checked') ? 'unchecked' : 'checked';
            session.setSelectionState(view.key, next);
            session.ensureDefaultSelection();
            const updated = session.getSentenceView(view.key);
            renderLucideCheckboxButton(btn, updated && updated.selection_state === 'checked', false);
            try {
              updateAllCheckboxButtonFromSession(session);
            } catch (e2) {
            }
            updateNavigatorFromSession(session);
          } catch (e1) {
          }
        });

        tdChoice.appendChild(btn);

        const emptyProgress = () => {
          const td = document.createElement('td');
          td.className = 'col-progress';
          td.textContent = '';
          return td;
        };

        const tdOrig = document.createElement('td');
        tdOrig.className = 'col-text-original';
        tdOrig.textContent = String(view.text_original || '');

        const tdTr = document.createElement('td');
        tdTr.className = 'col-text-translation';
        tdTr.textContent = String(view.text_translation || '');

        tr.appendChild(tdNum);
        tr.appendChild(tdChoice);
        tr.appendChild(emptyProgress());
        tr.appendChild(emptyProgress());
        tr.appendChild(emptyProgress());
        tr.appendChild(emptyProgress());
        tr.appendChild(tdOrig);
        tr.appendChild(tdTr);

        tbody.appendChild(tr);
      });

      renderLucide(table);

      try {
        updateAllCheckboxButtonFromSession(session);
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  function isHeaderToggleProtectedState(state) {
    try {
      const s = state && state.selection_state ? String(state.selection_state) : '';
      return s === 'completed';
    } catch (e) {
      return false;
    }
  }

  function computeAllCheckboxCheckedState(session) {
    try {
      const keys = session && session.activeKeys ? session.activeKeys : [];
      const list = Array.isArray(keys) ? keys : [];
      let eligible = 0;
      let checked = 0;
      for (const k of list) {
        const st = session.getState(k);
        if (isHeaderToggleProtectedState(st)) continue;
        eligible += 1;
        if (st && String(st.selection_state) === 'checked') checked += 1;
      }
      if (!eligible) return false;
      return checked === eligible;
    } catch (e) {
      return false;
    }
  }

  function computeAllCheckboxTriState(session) {
    try {
      const keys = session && session.activeKeys ? session.activeKeys : [];
      const list = Array.isArray(keys) ? keys : [];
      let eligible = 0;
      let checked = 0;
      let unchecked = 0;
      for (const k of list) {
        const st = session.getState(k);
        if (isHeaderToggleProtectedState(st)) continue;
        eligible += 1;
        const cur = st && st.selection_state ? String(st.selection_state) : 'unchecked';
        if (cur === 'checked') checked += 1;
        else unchecked += 1;
      }
      if (!eligible) return 'unchecked';
      if (checked === eligible) return 'checked';
      if (unchecked === eligible) return 'unchecked';
      return 'mixed';
    } catch (e) {
      return 'unchecked';
    }
  }

  function updateAllCheckboxButtonFromSession(session) {
    try {
      const btn = document.getElementById('allCheckbox');
      if (!btn) return;
      const state = computeAllCheckboxTriState(session);
      renderLucideTriStateCheckboxButton(btn, state, false);
    } catch (e) {
    }
  }

  function applyHeaderToggleToRows(session, targetState) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));

      for (const tr of rows) {
        const key = tr && tr.dataset ? String(tr.dataset.sentenceKey || '') : '';
        if (!key) continue;
        const st = session.getState(key);
        if (isHeaderToggleProtectedState(st)) continue;
        session.setSelectionState(key, targetState);
      }

      for (const tr of rows) {
        const key = tr && tr.dataset ? String(tr.dataset.sentenceKey || '') : '';
        if (!key) continue;
        const btn = tr.querySelector('button.all-checkbox-btn');
        if (!btn) continue;
        const st = session.getState(key);
        const isCompleted = isHeaderToggleProtectedState(st);
        const isChecked = st && String(st.selection_state) === 'checked';
        renderLucideCheckboxButton(btn, isChecked, false);
        try {
          if (isCompleted) {
            btn.title = 'Выполнено';
          } else {
            btn.title = 'Выбрать предложение';
          }
        } catch (e0) {
        }
      }

      updateAllCheckboxButtonFromSession(session);
      updateNavigatorFromSession(session);
    } catch (e) {
    }
  }

  function refreshSelectedCounters(session) {
    try {
      const totalEl = document.getElementById('sentenceTotalNumber');
      if (totalEl) totalEl.textContent = `/ ${session && Array.isArray(session.selectedKeys) ? session.selectedKeys.length : 0}`;
    } catch (e) {
    }
    try {
      const curEl = document.getElementById('sentenceCurrentNumber');
      if (curEl) curEl.textContent = '1';
    } catch (e) {
    }
  }

  function updateNavigatorFromSession(session) {
    try {
      const totalEl = document.getElementById('sentenceTotalNumber');
      if (totalEl) totalEl.textContent = `/ ${session && Array.isArray(session.selectedKeys) ? session.selectedKeys.length : 0}`;
    } catch (e) {
    }
    try {
      const curEl = document.getElementById('sentenceCurrentNumber');
      const cur = session && session.selectedKeys && session.selectedKeys.length ? (session.currentSelectedIndex + 1) : 0;
      if (curEl) curEl.textContent = String(cur || 0);
    } catch (e) {
    }

    try {
      updateAudioPlayersFromSession(session);
    } catch (e) {
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
      if (langPair) langPair.textContent = '';
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

        try {
          const scripts = Array.from(document.scripts || []);
          for (const s of scripts) {
            const raw = s && s.src ? String(s.src) : '';
            if (!raw) continue;
            try {
              const u = new URL(raw, window.location.origin);
              if (u && u.pathname === src) {
                resolve();
                return;
              }
            } catch (e0) {
              // ignore
            }
          }
        } catch (e1) {
          // ignore
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
      startModal.style.display = 'flex';
      renderLucide(startModal);

      try {
        const prefs = window.__dictationStartModalColumnPrefs;
        if (prefs && typeof prefs === 'object') {
          applyStartModalColumnsPreset(prefs);
        } else {
          applyStartModalColumnsPreset({ progress: true, original: false, translation: false });
        }
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  function hideStartModal() {
    try {
      const startModal = document.getElementById('start-modal');
      if (!startModal) return;
      startModal.style.display = 'none';
    } catch (e) {
    }
  }

  async function hasUnsavedProgress() {
    try {
      const panel = window.progressPanel;
      const hasPanelPending = panel && typeof panel.hasPending === 'function' ? !!panel.hasPending() : false;
      if (hasPanelPending) return true;
    } catch (e) {
    }

    try {
      if (typeof window.hasLocalPendingDraft === 'function') {
        return !!(await window.hasLocalPendingDraft());
      }
    } catch (e) {
    }

    return false;
  }

  async function exitDictationFromStartModal() {
    const doClose = () => {
      try { hideStartModal(); } catch (e0) {}
      try { close(); } catch (e1) {}
    };

    try {
      const pending = await hasUnsavedProgress();
      if (!pending) {
        doClose();
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof window.showExitModal === 'function') {
        await window.showExitModal(() => doClose());
        return;
      }
    } catch (e) {
    }

    // Fallback: close without confirmation
    doClose();
  }

  function openAudioSettingsModal(sourceLabel = 'unknown') {
    try {
      bindAudioSettingsModalControls();
    } catch (e) {
    }

    try {
      if (typeof window.initAudioSettingsModal === 'function') {
        window.initAudioSettingsModal();
      }
    } catch (e) {
    }

    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return;
      m.style.display = 'flex';
      renderLucide(m);
    } catch (e) {
    }
  }

  function bindStartModalControls() {
    try {
      const closeBtn = document.getElementById('btnBackToList');
      if (closeBtn && closeBtn.dataset.boundDictationModal !== '1') {
        closeBtn.dataset.boundDictationModal = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideStartModal();
        });
      }
    } catch (e) {
    }

    try {
      const allBtn = document.getElementById('allCheckbox');
      if (allBtn && allBtn.dataset.boundDictationModal !== '1') {
        allBtn.dataset.boundDictationModal = '1';
        allBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          try {
            const session = window.__dictationModalActiveSession;
            if (!session) return;
            const curState = computeAllCheckboxTriState(session);
            const next = (curState === 'checked') ? 'unchecked' : 'checked';
            applyHeaderToggleToRows(session, next);
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleProgressColumnsBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, progress: !prefs.progress });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleOriginalColumnBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, original: !prefs.original });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleTranslationColumnBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, translation: !prefs.translation });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const doorBtn = document.getElementById('startModalExitToIndexBtn');
      if (doorBtn && doorBtn.dataset.boundDictationModal !== '1') {
        doorBtn.dataset.boundDictationModal = '1';
        doorBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await exitDictationFromStartModal();
        });
      }
    } catch (e) {
    }

    try {
      const settingsBtn = document.getElementById('startModalOpenSettingsBtn');
      if (settingsBtn && settingsBtn.dataset.boundDictationModal !== '1') {
        settingsBtn.dataset.boundDictationModal = '1';
        settingsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAudioSettingsModal('start-modal-gear');
        });
      }
    } catch (e) {
    }

    try {
      const startModal = document.getElementById('start-modal');
      if (startModal && startModal.dataset.boundDictationModalBackdrop !== '1') {
        startModal.dataset.boundDictationModalBackdrop = '1';
        startModal.addEventListener('click', (e) => {
          try {
            if (e && e.target === startModal) {
              return;
            }
          } catch (e2) {
          }
        });
      }
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

      const parsed = parseDictationHref(dictationUrl);

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

      try {
        if (parsed) {
          renderModalLangPair(parsed);
          renderModalCover(parsed);
          initModalOriginalAudioPlayer(parsed);
        }
      } catch (e) {
      }

      try {
        if (parsed) {
          await ensureDictationContentLoadedToRuntime(parsed);
        }
      } catch (e) {
      }

      try {
        const session = parsed ? getOrCreateDefaultSessionFromParsed(parsed) : null;
        if (session) {
          try {
            window.__dictationModalActiveSession = session;
          } catch (e0) {
          }
          renderStartModalSentencesTable(session);
          updateNavigatorFromSession(session);
          showStartModal();

          const startBtn = document.getElementById('confirmStartBtn');
          if (startBtn && startBtn.dataset.boundDictationRuntime !== '1') {
            startBtn.dataset.boundDictationRuntime = '1';
            startBtn.addEventListener('click', (e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch (e0) {
              }
              try {
                hideStartModal();
              } catch (e1) {
              }
            });
          }
        }
      } catch (e) {
      }

      try {
        bindStartModalControls();
      } catch (e) {
      }

      // Legacy dictation runtime (script_dictation.js) intentionally not used here.

      try {
        const topSettings = document.getElementById('openDictationSettingsBtn');
        if (topSettings && topSettings.dataset.boundDictationModal !== '1') {
          topSettings.dataset.boundDictationModal = '1';
          topSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openAudioSettingsModal('topbar-gear');
          });
        }
      } catch (e) {
      }

      // Some dictation UI bits are usually set in inline script in dictation.html.
      // We replicate the minimal critical part: create ProgressPanel if needed.
      try {
        if (typeof ProgressPanel !== 'undefined' && typeof UserActivityHistory !== 'undefined') {
          try {
            if (!window.activityHistory) {
              window.activityHistory = new UserActivityHistory('/user/api');
            }
          } catch (e0) {
          }

          const history = window.activityHistory;
          window.progressPanel = new ProgressPanel(history, { saveInterval: 5 });
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
    bindAudioSettingsModalControls();
    bindDictationModalHotkeys();
  }

  window.DictationModal = { open, close, init };

  try {
    document.addEventListener('DOMContentLoaded', () => init());
  } catch (e) {
  }

