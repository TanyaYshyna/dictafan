// console.log("👀 renderSentenceCounter вызвана");

// Global audio UI/controls (ensure defined before any usage)
// Use window-scoped references to avoid ReferenceError on early calls
window.originalAudioVisual = window.originalAudioVisual || null;
window.translationPlayButton = window.translationPlayButton || null;

window.__DICTATION_BUILD = '2026-02-26_0159';
console.warn('[DICTATION BUILD]', window.__DICTATION_BUILD);

function ensureSwStatusBar() {
    try {
        const id = 'swStatusBar';
        let el = document.getElementById(id);
        if (el) return el;
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.right = '0';
        el.style.bottom = '0';
        el.style.zIndex = '2147483647';
        el.style.padding = '6px 10px';
        el.style.fontSize = '12px';
        el.style.lineHeight = '1.2';
        el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        el.style.color = 'rgba(255,255,255,0.85)';
        el.style.background = 'rgba(0,0,0,0.55)';
        el.style.backdropFilter = 'blur(6px)';
        el.style.webkitBackdropFilter = 'blur(6px)';
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.textContent = '';
        document.body.appendChild(el);
        return el;
    } catch (e) {
        return null;
    }
}

function normalizeDictationMediaUrl(rawUrl) {
    try {
        let v = String(rawUrl || '').trim();
        if (!v) return '';
        if (v.startsWith('blob:')) return v;

        try {
            if (v.startsWith('http://') || v.startsWith('https://')) {
                const u = new URL(v);
                // If page is https, never keep an http absolute URL.
                const desiredProtocol = (typeof location !== 'undefined' && location && location.protocol) ? location.protocol : u.protocol;
                if (desiredProtocol === 'https:' && u.protocol === 'http:') {
                    u.protocol = 'https:';
                }

                // Prefer returning a relative URL for same-origin requests.
                try {
                    if (typeof location !== 'undefined' && location && u.origin === location.origin) {
                        v = `${u.pathname}${u.search || ''}`;
                    } else {
                        v = u.toString();
                    }
                } catch (e) {
                    v = `${u.pathname}${u.search || ''}`;
                }
            }
        } catch (e) {
        }

        try {
            if (v.startsWith('http://') && typeof location !== 'undefined' && location && location.protocol === 'https:') {
                v = `https://${v.slice('http://'.length)}`;
            }
        } catch (e) {
        }

        const markers = ['/api/dictations/', '/api/temp/dictations/'];
        for (const m of markers) {
            const first = v.indexOf(m);
            if (first >= 0) {
                const second = v.indexOf(m, first + m.length);
                if (second >= 0) {
                    v = v.slice(second);
                }
            }
        }

        if (!v.startsWith('/') && (v.startsWith('api/') || v.startsWith('api\\'))) {
            v = `/${v}`;
        }

        return v;
    } catch (e) {
        return String(rawUrl || '').trim();
    }
}

function resolveSentenceAudioUrl(sentence, fieldName) {
    try {
        if (!sentence || typeof sentence !== 'object') return '';
        let raw = String(sentence[fieldName] || '').trim();
        if (!raw && fieldName === 'audio_tr') {
            raw = String(
                sentence.audio_translation ||
                sentence.audio_translation_url ||
                sentence.audio_translation_path ||
                sentence.audio_tr_url ||
                sentence.audio_tr_path ||
                ''
            ).trim();
        }
        if (!raw) return '';
        if (raw.startsWith('blob:')) return raw;
        if (raw.startsWith('/api/')) return normalizeDictationMediaUrl(raw);
        if (raw.startsWith('http://') || raw.startsWith('https://')) return normalizeDictationMediaUrl(raw);

        const dictId = String(currentDictation && currentDictation.id ? currentDictation.id : '').trim();
        if (!dictId) return '';

        const basePath = dictId.startsWith('dict_temp_') ? '/api/temp/dictations' : '/api/dictations';

        const lang = (fieldName === 'audio_tr')
            ? String(currentDictation && currentDictation.language_translation ? currentDictation.language_translation : '')
            : String(currentDictation && currentDictation.language_original ? currentDictation.language_original : '');
        if (!lang) return '';

        const name = raw.split('?', 1)[0].split('/').pop();
        if (!name) return '';
        return normalizeDictationMediaUrl(`${basePath}/${encodeURIComponent(dictId)}/${encodeURIComponent(lang)}/${encodeURIComponent(name)}`);
    } catch (e) {
        return '';
    }
}

function maybeCacheBustDictationCover(url) {
    try {
        const u = String(url || '');
        if (!u) return u;
        if (u.startsWith('/api/dictations_covers/') || u.startsWith('/api/temp/dictations_covers/')) {
            const sep = u.includes('?') ? '&' : '?';
            return `${u}${sep}v=${Date.now()}`;
        }
        return u;
    } catch (e) {
        return url;
    }
}

function setSwStatus(message, opts = {}) {
    try {
        const el = ensureSwStatusBar();
        if (!el) return;
        el.textContent = String(message || '');
        el.style.display = message ? 'block' : 'none';
        if (el._hideTimer) {
            clearTimeout(el._hideTimer);
            el._hideTimer = null;
        }
        const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 1500;
        if (message && durationMs > 0) {
            el._hideTimer = setTimeout(() => {
                try {
                    el.style.display = 'none';
                } catch (e) {
                }
            }, durationMs);
        }
    } catch (e) {
    }
}

function installBuildAutoReloader(buildValue, storageKey) {
    try {
        const v = String(buildValue || '');
        if (!v) return;
        const k = String(storageKey || 'dictafan:build');
        const prev = String(localStorage.getItem(k) || '');
        const onceKey = `${k}:reloaded:${v}`;
        const alreadyReloaded = String(sessionStorage.getItem(onceKey) || '') === 'true';
        if (prev && prev !== v && !alreadyReloaded) {
            try {
                sessionStorage.setItem(onceKey, 'true');
            } catch (e) {
            }
            try {
                localStorage.setItem(k, v);
            } catch (e) {
            }
            location.reload();
            return;
        }
        if (!prev) {
            try {
                localStorage.setItem(k, v);
            } catch (e) {
            }
        }
    } catch (e) {
    }
}

function showDictationCacheFetchOverlay(text) {
    try {
        const id = 'dictation-cache-fetch-overlay';
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.position = 'fixed';
            el.style.inset = '0';
            el.style.background = 'rgba(0,0,0,0.45)';
            el.style.zIndex = '2147483646';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.padding = '24px';

            const card = document.createElement('div');
            card.style.background = 'rgba(255,255,255,0.92)';
            card.style.borderRadius = '16px';
            card.style.padding = '18px 20px';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.gap = '12px';
            card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.35)';

            const spinner = document.createElement('div');
            spinner.style.width = '18px';
            spinner.style.height = '18px';
            spinner.style.borderRadius = '999px';
            spinner.style.border = '3px solid rgba(0,0,0,0.2)';
            spinner.style.borderTopColor = 'rgba(0,0,0,0.65)';
            spinner.style.animation = 'dictationSpin 0.9s linear infinite';

            const label = document.createElement('div');
            label.id = `${id}-label`;
            label.style.fontSize = '14px';
            label.style.fontWeight = '700';
            label.style.color = '#111827';
            label.textContent = text || 'Загрузка в кеш…';

            card.appendChild(spinner);
            card.appendChild(label);
            el.appendChild(card);
            document.body.appendChild(el);

            const styleId = 'dictation-cache-fetch-overlay-style';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = '@keyframes dictationSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
                document.head.appendChild(style);
            }
        } else {
            const label = document.getElementById(`${id}-label`);
            if (label) label.textContent = text || 'Загрузка в кеш…';
            el.style.display = 'flex';
        }
    } catch (e) {
    }
}

function hideDictationCacheFetchOverlay() {
    try {
        const el = document.getElementById('dictation-cache-fetch-overlay');
        if (el) el.style.display = 'none';
    } catch (e) {
    }
}

async function fetchSentencesFromServerAndCache() {
    const dictId = String(currentDictation.id || '').trim();
    const langOrig = String(currentDictation.language_original || '').trim();
    const langTr = String(currentDictation.language_translation || '').trim();
    if (!dictId || !langOrig || !langTr) {
        throw new Error('missing_dictation_params');
    }

    const url = `/api/dictation/${encodeURIComponent(dictId)}/${encodeURIComponent(langOrig)}/${encodeURIComponent(langTr)}/sentences`;
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

    const userId = String(getDraftUserIdForKey());
    const key = `${userId}:${dictId}:${langOrig}:${langTr}`;
    await idbPut('dictations', {
        key,
        dictationId: dictId,
        langOrig,
        langTr,
        sentences,
        updatedAt: Date.now()
    });

    // Prefetch audio to Cache Storage via Service Worker in background.
    // Do NOT block UI: sentences are already saved to IndexedDB and can be used immediately.
    // Ignore cache limit (user requested to not account for 300MB limit).
    try {
        setTimeout(() => {
            try {
                const audioUrls = [];
                const audioFields = ['audio', 'audio_a', 'audio_f', 'audio_m', 'audio_tr'];
                const resolveAudioToUrl = (rawValue, lang) => {
                    try {
                        const v = String(rawValue || '').trim();
                        if (!v) return null;
                        if (v.startsWith('blob:')) return v;
                        if (v.startsWith('/api/')) return normalizeDictationMediaUrl(v);
                        if (v.startsWith('http://') || v.startsWith('https://')) return normalizeDictationMediaUrl(v);
                        const dictId = String(currentDictation && currentDictation.id ? currentDictation.id : '').trim();
                        if (!dictId || !lang) return null;
                        const name = v.split('?', 1)[0].split('/').pop();
                        if (!name) return null;
                        return normalizeDictationMediaUrl(`/api/dictations/${encodeURIComponent(dictId)}/${encodeURIComponent(String(lang))}/${encodeURIComponent(name)}`);
                    } catch (e) {
                        return null;
                    }
                };
                for (const s of sentences) {
                    if (!s || typeof s !== 'object') continue;
                    for (const f of audioFields) {
                        const u = s[f];
                        const lang = (f === 'audio_tr') ? (currentDictation && currentDictation.language_translation) : (currentDictation && currentDictation.language_original);
                        const fullUrl = resolveAudioToUrl(u, lang);
                        if (fullUrl) audioUrls.push(fullUrl);
                    }
                }
                const unique = Array.from(new Set(audioUrls.filter(Boolean)));
                if (unique.length) {
                    swDictationRequest('prefetchStrict', {
                        urls: unique,
                        ignoreLimit: true,
                        timeoutMs: 180000
                    }).catch(() => {});
                }
            } catch (e) {
            }
        }, 0);
    } catch (e) {
    }

    return true;
}

installBuildAutoReloader(window.__DICTATION_BUILD, 'dictafan:build:dictation');

function installDictationBuildBadge() {
    try {
        if (window.__dictationBuildBadgeInstalled) return;
        window.__dictationBuildBadgeInstalled = true;

        const mount = () => {
            try {
                const id = 'dictation-build-badge';
                let el = document.getElementById(id);
                if (!el) {
                    el = document.createElement('div');
                    el.id = id;
                    el.setAttribute('aria-hidden', 'true');
                    el.style.position = 'fixed';
                    el.style.left = '6px';
                    el.style.bottom = '6px';
                    el.style.zIndex = '2147483647';
                    el.style.fontSize = '10px';
                    el.style.lineHeight = '1.2';
                    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
                    el.style.color = 'rgba(255,255,255,0.75)';
                    el.style.background = 'rgba(0,0,0,0.35)';
                    el.style.padding = '2px 6px';
                    el.style.borderRadius = '6px';
                    el.style.pointerEvents = 'none';
                    el.style.userSelect = 'none';
                    document.body.appendChild(el);
                }
                const v = String(window.__DICTATION_BUILD || 'unknown');
                el.textContent = `build: ${v}`;
            } catch (e) {
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mount, { once: true });
        } else {
            mount();
        }
    } catch (e) {
    }
}

installDictationBuildBadge();

const userManager = window.UM;
let thisNewGame = true;
let dictationStatistics = null; // Глобальный объект статистики
let activityHistory = null; // История активности пользователя
let progressPanel = null; // Панель прогресса
let hasDraftLoaded = false; // Флаг загрузки черновика (для определения isResume в startGame)
let dictationCompletionSaved = false; // Флаг: успех записан, черновик нужно не пересоздавать
// let userManager = null;
// circleBtn будет переопределен после рендера панели прогресса
let circleBtn = document.getElementById('btn-circle-number');
const btnCurrent = document.getElementById("sentenceCurrentNumber");
const btnPrev = document.getElementById("checkPrevios");
const btnNext = document.getElementById("checkNext");


const inputField = document.getElementById('userInput');
const RTL_LANGUAGE_PREFIXES = ['ar'];

function isDictationModalOpen() {
    try {
        const ids = [
            'start-modal',
            'pauseModal',
            'audioSettingsModal',
            'completionModal',
            'exitModal',
            'noSelectionModal'
        ];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            const display = (el.style && typeof el.style.display === 'string') ? el.style.display : '';
            if (display && display !== 'none') return true;
            const computed = window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (computed && computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0') {
                return true;
            }
        }
    } catch (e) {
    }
    return false;
}

function getDictationFocusCycleElements() {
    const ids = ['userInput', 'checkBtn', 'recordButton', 'checkNext', 'btn-new-circle'];
    const elements = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .filter((el) => {
            try {
                const disabled = !!el.disabled;
                const hidden = el.hidden === true;
                const notDisplayed = el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed';
                return !disabled && !hidden && !notDisplayed;
            } catch (e) {
                return false;
            }
        });
    return elements;
}

function installDictationTabCycle() {
    if (window.__dictationTabCycleInstalled) return;
    window.__dictationTabCycleInstalled = true;

    document.addEventListener('keydown', (event) => {
        try {
            if (event.key !== 'Tab') return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isDictationModalOpen()) return;

            const cycle = getDictationFocusCycleElements();
            if (!cycle.length) return;

            const active = document.activeElement;
            const currentIndex = cycle.indexOf(active);
            const step = event.shiftKey ? -1 : 1;
            const nextIndex = (currentIndex === -1)
                ? 0
                : (currentIndex + step + cycle.length) % cycle.length;

            event.preventDefault();
            cycle[nextIndex].focus();
        } catch (e) {
        }
    }, true);
}

installDictationTabCycle();

function installDictationFailedAudioFocusGuard() {
    if (window.__dictationFailedAudioFocusGuardInstalled) return;
    window.__dictationFailedAudioFocusGuardInstalled = true;

    const isOriginalAudioControl = (el) => {
        try {
            if (!el) return false;
            if (el.id === 'originalAudioPlayer') return true;
            if (el.closest && el.closest('#originalAudioPlayer')) return true;
            if (window.originalAudioVisual && window.originalAudioVisual.playButton) {
                if (el === window.originalAudioVisual.playButton) return true;
            }
        } catch (e) {
        }
        return false;
    };

    document.addEventListener('focusin', (event) => {
        try {
            const until = Number(window.__lockFocusOnRecordUntil || 0);
            if (!until) return;
            if (Date.now() > until) return;

            const target = event && event.target;
            if (!isOriginalAudioControl(target)) return;

            const rb = document.getElementById('recordButton');
            if (!rb || rb.disabled) return;

            // Перехватываем попытки увести фокус на оригинальный плеер после незачтённой записи.
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try { rb.focus(); } catch (e) {}
                });
            });
        } catch (e) {
        }
    }, true);
}

installDictationFailedAudioFocusGuard();

function applyInputDirection(languageCode) {
    if (!inputField) return;
    const normalized = (languageCode || '').toLowerCase();
    const isRtl = RTL_LANGUAGE_PREFIXES.some(prefix => normalized.startsWith(prefix));
    inputField.classList.remove('text-input-rtl', 'text-input-ltr');
    if (isRtl) {
        inputField.classList.add('text-input-rtl');
    } else {
        inputField.classList.add('text-input-ltr');
    }
}

function playRecordingStartBeep() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;

        const ac = new AC();
        const o = ac.createOscillator();
        const g = ac.createGain();

        o.type = 'sine';
        o.frequency.value = 880;

        const now = ac.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        o.connect(g);
        g.connect(ac.destination);

        o.start(now);
        o.stop(now + 0.12);
        o.onended = () => {
            try { ac.close(); } catch (e) {}
        };
    } catch (e) {
    }
}
const checkNextDiv = document.getElementById('checkNext');
const checkPreviosDiv = document.getElementById('checkPrevios');
const correctAnswerDiv = document.getElementById('correctAnswer'); id = "btn-new-circle"
// const translationDiv = document.getElementById('translation');
const btnNewCircle = document.getElementById('btn-new-circle');
window.pendingExitAction = null;

if (inputField) {
    inputField.addEventListener('paste', (event) => {
        event.preventDefault();
        showSaveToast('Вставка текста отключена для этого поля', 'error', 2000);
    });
}

function showSaveToast(message, type = 'info', duration = 2500) {
    const toast = document.createElement('div');
    toast.className = `toast-notice ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });
    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
    setTimeout(() => {
        toast.remove();
    }, duration + 250);
}


// Эти элементы будут переопределены после рендера панели прогресса
let btnModalTimer = document.getElementById('btn-modal-timer');
let btnModalCountPerfect = document.getElementById('btn-modal-count-perfect');
let btnModalCountCorrected = document.getElementById('btn-modal-count-corrected');
let btnModalCountAudio = document.getElementById('btn-modal-count-audio');
let btnModalCountTotal = document.getElementById('btn-modal-count-total');
let circleBtnModal = document.getElementById('btn-modal-circle-number');

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 1200;
const DRAFT_AUTOSAVE_INTERVAL_MS = 30000;

let draftAutosaveTimer = null;
let draftPeriodicAutosaveTimer = null;
let draftSyncInFlight = null;

function getDraftUserIdForKey() {
    try {
        const um = window.UM || userManager;
        const id = um?.userData?.id;
        return id ? String(id) : 'anon';
    } catch {
        return 'anon';
    }
}

function getDraftKey() {
    const dictationId = currentDictation?.id;
    if (!dictationId) return null;
    return `${getDraftUserIdForKey()}:${dictationId}`;
}

function setSaveButtonStatus(status) {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn) return;
    saveBtn.classList.remove('save-status-clean', 'save-status-pending', 'save-status-syncing', 'save-status-error');
    if (status === 'clean') saveBtn.classList.add('save-status-clean');
    else if (status === 'pending') saveBtn.classList.add('save-status-pending');
    else if (status === 'syncing') saveBtn.classList.add('save-status-syncing');
    else if (status === 'error') saveBtn.classList.add('save-status-error');

    updateUnsavedIndicators();
}

function setUnsavedStarVisible(isVisible) {
    const el = document.getElementById('unsavedStar');
    if (!el) return;
    el.style.display = isVisible ? 'inline-flex' : 'none';
}

async function hasLocalPendingDraft() {
    return false;
}

function updateUnsavedIndicators() {
    const panel = getProgressPanelInstance();
    const hasPanelPending = panel && typeof panel.hasPending === 'function' ? panel.hasPending() : false;

    // local pending is async; we update star when the promise resolves
    if (hasPanelPending) {
        setUnsavedStarVisible(true);
        return;
    }

    hasLocalPendingDraft().then((hasPending) => {
        setUnsavedStarVisible(!!hasPending);
    }).catch(() => {
        setUnsavedStarVisible(false);
    });
}

const PAGE_NAME = 'dictation';
(async () => {
    try {
        const res = await fetch('/api/app-cache-revision', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rev = data && (data.revision || data.app_cache_revision || data.value);
        console.log('[Version]', `${PAGE_NAME}__${rev || 'unknown'}`);
    } catch (e) {
        console.log('[Version]', `${PAGE_NAME}__unknown`);
    }
})();

function scheduleDraftAutosave(reason = 'unknown') {
    if (!currentDictation?.id) return;
    if (dictationCompletionSaved) return;
    setSaveButtonStatus('pending');
    if (draftAutosaveTimer) clearTimeout(draftAutosaveTimer);
    draftAutosaveTimer = setTimeout(() => {
        draftAutosaveTimer = null;
        saveDraftToIndexedDbAndQueueSync(reason).catch(err => {
            console.warn('[Draft][IDB] autosave failed', err);
            setSaveButtonStatus('error');
        });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);
}

async function saveDictationDraft(reason = 'manual') {
    try {
        return await saveDraftToIndexedDbAndQueueSync(reason);
    } catch (e) {
        console.warn('[Draft][IDB] saveDictationDraft failed', e);
        return false;
    }
}

function startDraftPeriodicAutosave() {
    if (draftPeriodicAutosaveTimer) return;
    if (dictationCompletionSaved) return;
    draftPeriodicAutosaveTimer = setInterval(() => {
        saveDraftToIndexedDbAndQueueSync('periodic').catch(() => {});
    }, DRAFT_AUTOSAVE_INTERVAL_MS);
}

function stopDraftAutosaveTimers() {
    if (draftAutosaveTimer) {
        clearTimeout(draftAutosaveTimer);
        draftAutosaveTimer = null;
    }
    if (draftPeriodicAutosaveTimer) {
        clearInterval(draftPeriodicAutosaveTimer);
        draftPeriodicAutosaveTimer = null;
    }
}

async function openDraftDb() {
    const openWith = (mode) => new Promise((resolve, reject) => {
        const req = indexedDB.open('dictafan_drafts');
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('drafts')) {
                db.createObjectStore('drafts', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('outbox')) {
                db.createObjectStore('outbox', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('activity_outbox')) {
                db.createObjectStore('activity_outbox', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('success_outbox')) {
                db.createObjectStore('success_outbox', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('dictations')) {
                db.createObjectStore('dictations', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('desk_items')) {
                db.createObjectStore('desk_items', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('media_manifest')) {
                db.createObjectStore('media_manifest', { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    try {
        return await openWith();
    } catch (e) {
        if (e && e.name === 'VersionError') {
            return await openWith();
        }
        throw e;
    }
}

async function clearDraftFromIndexedDb() {
    const baseKey = getDraftKey();
    if (!baseKey) return false;

    const keysToDelete = new Set([baseKey]);
    try {
        const rawId = String(currentDictation?.id ?? '').trim();
        const numericId = parseInt(rawId.replace(/^dict_/, ''), 10);
        if (Number.isFinite(numericId)) {
            keysToDelete.add(`${getDraftUserIdForKey()}:${numericId}`);
            keysToDelete.add(`${getDraftUserIdForKey()}:dict_${numericId}`);
        }
    } catch (e) {
    }

    try {
        for (const key of keysToDelete) {
            await idbDelete('drafts', key);
        }
    } catch (e) {
    }
    try {
        for (const key of keysToDelete) {
            await idbDelete('outbox', key);
        }
    } catch (e) {
    }
    return true;
}

async function idbGet(storeName, key) {
    const db = await openDraftDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function idbPut(storeName, value) {
    const db = await openDraftDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(value);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function idbDelete(storeName, key) {
    const db = await openDraftDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function idbGetAll(storeName) {
    const db = await openDraftDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

function getLocalDateId() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function enqueueOfflineActivity(type_activity, number = 1) {
    try {
        const userId = getDraftUserIdForKey();
        if (!userId) return false;
        const dateId = getLocalDateId();
        const key = `${userId}:${dateId}`;
        const existing = (await idbGet('activity_outbox', key)) || {
            key,
            userId,
            date: dateId,
            perfect_count: 0,
            corrected_count: 0,
            audio_count: 0,
            updatedAt: 0
        };

        const n = Number(number) || 0;
        if (type_activity === 'perfect') existing.perfect_count += n;
        if (type_activity === 'corrected') existing.corrected_count += n;
        if (type_activity === 'audio') existing.audio_count += n;
        existing.updatedAt = Date.now();

        await idbPut('activity_outbox', existing);
        return true;
    } catch (e) {
        return false;
    }
}

async function syncOfflineActivityOutbox() {
    try {
        const token = window.UM?.token || localStorage.getItem('jwt_token');
        if (!token) return false;

        const rows = await idbGetAll('activity_outbox');
        if (!rows.length) return true;

        for (const row of rows) {
            const toSend = [];
            if (row.perfect_count) toSend.push({ type_activity: 'perfect', number: row.perfect_count });
            if (row.corrected_count) toSend.push({ type_activity: 'corrected', number: row.corrected_count });
            if (row.audio_count) toSend.push({ type_activity: 'audio', number: row.audio_count });

            let sentAll = true;
            for (const item of toSend) {
                const response = await fetch('/api/statistics/activity', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        dictation_id: currentDictation?.id || 'offline',
                        date: row.date,
                        type_activity: item.type_activity,
                        number: item.number
                    })
                });
                if (!response.ok) {
                    sentAll = false;
                    break;
                }
            }

            if (sentAll) {
                await idbDelete('activity_outbox', row.key);
            } else {
                return false;
            }
        }

        return true;
    } catch (e) {
        return false;
    }
}

async function enqueueOfflineSuccess(payload) {
    try {
        const userId = getDraftUserIdForKey();
        if (!userId) return false;
        const rawId = String(payload?.dictation_id ?? '').trim();
        const dateId = getLocalDateId();
        const key = `${userId}:${rawId}:${dateId}`;

        const existing = await idbGet('success_outbox', key);

        function mergeSentencesData(prev = [], next = []) {
            const map = new Map();
            for (const row of Array.isArray(prev) ? prev : []) {
                if (!row || !row.sentence_key) continue;
                map.set(row.sentence_key, { ...row });
            }
            for (const row of Array.isArray(next) ? next : []) {
                if (!row || !row.sentence_key) continue;
                const p = map.get(row.sentence_key);
                if (!p) {
                    map.set(row.sentence_key, { ...row });
                } else {
                    p.perfect_count = (Number(p.perfect_count) || 0) + (Number(row.perfect_count) || 0);
                    p.corrected_count = (Number(p.corrected_count) || 0) + (Number(row.corrected_count) || 0);
                    p.audio_count = (Number(p.audio_count) || 0) + (Number(row.audio_count) || 0);
                    map.set(row.sentence_key, p);
                }
            }
            return Array.from(map.values());
        }

        const mergedPayload = existing && existing.payload ? {
            ...existing.payload,
            perfect_count: (Number(existing.payload.perfect_count) || 0) + (Number(payload.perfect_count) || 0),
            corrected_count: (Number(existing.payload.corrected_count) || 0) + (Number(payload.corrected_count) || 0),
            audio_count: (Number(existing.payload.audio_count) || 0) + (Number(payload.audio_count) || 0),
            attempts_total: (Number(existing.payload.attempts_total) || 0) + (Number(payload.attempts_total) || 0),
            error_count: (Number(existing.payload.error_count) || 0) + (Number(payload.error_count) || 0),
            time_ms: (Number(existing.payload.time_ms) || 0) + (Number(payload.time_ms) || 0),
            sentences_data: mergeSentencesData(existing.payload.sentences_data, payload.sentences_data),
            settings_json: payload.settings_json || existing.payload.settings_json
        } : payload;

        await idbPut('success_outbox', {
            key,
            userId,
            createdAt: existing?.createdAt || Date.now(),
            payload: mergedPayload
        });
        return true;
    } catch (e) {
        return false;
    }
}

async function syncOfflineSuccessOutbox() {
    try {
        const token = window.UM?.token || localStorage.getItem('jwt_token');
        if (!token) return false;

        const rows = await idbGetAll('success_outbox');
        if (!rows.length) return true;

        for (const row of rows) {
            const response = await fetch('/api/statistics/success', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(row.payload)
            });
            if (!response.ok) {
                return false;
            }

            await idbDelete('success_outbox', row.key);
        }

        return true;
    } catch (e) {
        return false;
    }
}

function buildDictationDraftState() {
    if (!dictationStatistics || !currentDictation?.id) return null;

    const perSentence = {};
    allSentences.forEach(s => {
        const originalSelectionState = s.selection_state;
        const hasProgress = s.number_of_perfect > 0 ||
            s.number_of_corrected > 0 ||
            (Number(s.number_of_audio) || 0) > 0;

        let finalSelectionState;
        const totalPerfect = Number(s.number_of_perfect) || 0;
        const totalAudio = Number(s.number_of_audio) || 0;
        const isCompleted = totalPerfect > 0 && totalAudio >= REQUIRED_PASSED_COUNT;

        if (isCompleted) {
            finalSelectionState = 'completed';
        } else if (originalSelectionState === 'unchecked') {
            finalSelectionState = 'unchecked';
        } else if (hasProgress) {
            finalSelectionState = 'checked';
        } else if (originalSelectionState === 'checked' || originalSelectionState === 'completed') {
            finalSelectionState = 'checked';
        } else {
            finalSelectionState = 'unchecked';
        }

        const hasExplicitSelection = originalSelectionState === 'checked' ||
            originalSelectionState === 'unchecked' ||
            originalSelectionState === 'completed';

        if (hasProgress || hasExplicitSelection) {
            perSentence[s.key] = {
                number_of_perfect: s.number_of_perfect || 0,
                number_of_corrected: s.number_of_corrected || 0,
                number_of_audio: s.number_of_audio || 0,
                attempts_total: Number(s.attempts_total) || 0,
                error_count: Number(s.error_count) || 0,
                selection_state: finalSelectionState
            };
        }
    });

    const sequences = getPlaySequenceValues();
    const isMixed = mixControl && mixControl.dataset.checked === 'true';

    let audioRepeats = REQUIRED_PASSED_COUNT;
    let audioSettings = {};
    if (audioSettingsPanel && audioSettingsPanel.isInitialized) {
        const settings = audioSettingsPanel.getSettings();
        audioRepeats = (settings.repeats !== undefined && settings.repeats !== null) ? settings.repeats : 3;
        audioSettings = {
            start: (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto',
            typo: (settings.typo !== undefined && settings.typo !== null) ? settings.typo : 'o',
            success: (settings.success !== undefined && settings.success !== null) ? settings.success : 'ot',
            repeats: audioRepeats,
            required_passed_star_half: settings.required_passed_star_half !== undefined ? settings.required_passed_star_half : REQUIRED_PASSED_STAR_HALF,
            without_entering_text: Boolean(settings.without_entering_text),
            show_text: Boolean(settings.show_text),
            speech_recognition_mode: settings.speech_recognition_mode || speechRecognitionMode || 'route'
        };
    } else {
        audioSettings = {
            start: (sequences.start !== undefined && sequences.start !== null) ? sequences.start : ((playSequenceStart !== undefined && playSequenceStart !== null) ? playSequenceStart : 'oto'),
            typo: (sequences.typo !== undefined && sequences.typo !== null) ? sequences.typo : ((playSequenceTypo !== undefined && playSequenceTypo !== null) ? playSequenceTypo : 'o'),
            success: (sequences.success !== undefined && sequences.success !== null) ? sequences.success : ((playSequenceSuccess !== undefined && playSequenceSuccess !== null) ? playSequenceSuccess : 'ot'),
            repeats: audioRepeats,
            required_passed_star_half: REQUIRED_PASSED_STAR_HALF,
            without_entering_text: Boolean(window.audioSettingsWithoutEnteringText || false),
            show_text: Boolean(window.audioSettingsShowText || false),
            speech_recognition_mode: speechRecognitionMode || 'route'
        };
    }

    const timerSnapshot = getProgressTimerSnapshot();
    const accumulatedMs = timerSnapshot.accumulatedMs || 0;

    const settings_json = JSON.stringify({
        audio: audioSettings,
        sentence_order: isMixed ? 'mixed' : 'direct'
    });

    return {
        dictation_id: currentDictation.id,
        circle_number: circle_number,
        current_index: currentSentenceIndex || 0,
        playSequenceStart: (sequences.start !== undefined && sequences.start !== null) ? sequences.start : playSequenceStart,
        playSequenceTypo: (sequences.typo !== undefined && sequences.typo !== null) ? sequences.typo : playSequenceTypo,
        playSequenceSuccess: (sequences.success !== undefined && sequences.success !== null) ? sequences.success : playSequenceSuccess,
        audio_repeats: audioRepeats,
        is_mixed: isMixed,
        per_sentence: perSentence,
        number_of_perfect: number_of_perfect,
        number_of_corrected: number_of_corrected,
        number_of_audio: number_of_audio,
        dictation_accumulated_ms: accumulatedMs,
        settings_json: settings_json
    };
}

async function saveDraftToIndexedDbAndQueueSync(reason = 'unknown') {
    if (dictationCompletionSaved) return false;
    const key = getDraftKey();
    if (!key) return false;

    const state = buildDictationDraftState();
    if (!state) return false;

    const now = Date.now();
    await idbPut('drafts', {
        key,
        dictationId: currentDictation.id,
        userId: getDraftUserIdForKey(),
        updatedAt: now,
        state
    });

    return true;
}

async function syncDraftIfOnline(force = false) {
    if (!force && !navigator.onLine) return false;
    const [aOk, sOk] = await Promise.all([
        syncOfflineActivityOutbox(),
        syncOfflineSuccessOutbox()
    ]);
    return !!aOk && !!sOk;
}

window.addEventListener('online', () => {
    syncDraftIfOnline(false).catch(() => {});
    try {
        updateRecognitionModeIcon();
    } catch (e) {
    }
});

// Legacy DOM <audio> elements were removed from HTML; keep placeholders null to avoid accidental use
const audio = null;
const audio_tr = null;

// Настройки аудио - загружаются из данных пользователя или значения по умолчанию
let playSequenceStart = "oto";  // Для старта предложения (o=оригинал, t=перевод)
let playSequenceTypo = "o";  // Для старта предложения (o=оригинал, t=перевод)
let playSequenceSuccess = "ot"; // Для правильного ответа (можно изменить на "o" или "to")

// Функция для загрузки настроек аудио из данных пользователя
/**
 * Сохраняет настройки аудио в базу данных
 */
async function saveAudioSettingsToUser(settings) {
    try {
        const um = window.UM || userManager;
        if (!um || !um.isAuthenticated()) {
            return;
        }

        // Формируем JSON с настройками в новом формате settings_json
        const settingsJson = JSON.stringify({
            audio: {
                start: (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto',
                typo: (settings.typo !== undefined && settings.typo !== null) ? settings.typo : 'o',
                success: (settings.success !== undefined && settings.success !== null) ? settings.success : 'ot',
                repeats: settings.repeats !== undefined ? settings.repeats : 3,
                without_entering_text: Boolean(settings.without_entering_text),
                show_text: Boolean(settings.show_text),
                speech_recognition_mode: settings.speech_recognition_mode || 'route'
            }
        });

        // Сохраняем через API
        const token = localStorage.getItem('jwt_token');
        if (!token) {
            return;
        }

        const response = await fetch('/user/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                settings_json: settingsJson
            })
        });

        if (response.ok) {
            const result = await response.json();
            // Обновляем userData
            if (um.userData && result.user) {
                // ИСПРАВЛЕНО: Используем settings_json из результата, так как данные уже в БД
                if (result.user.settings_json) {
                    um.userData.settings_json = result.user.settings_json;
                }
            }
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек аудио:', error);
    }
}

async function loadAudioSettingsFromUser() {
    // Пробуем получить UM из разных источников
    let um = window.UM || userManager;

    // Если UM не инициализирован, ждем его инициализации
    if (!um || !um.isInitialized) {
        // Ждем до 5 секунд, пока UM инициализируется
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            um = window.UM || userManager;
            if (um && um.isInitialized && um.userData) {
                break;
            }
        }
    }

    if (um && um.userData) {
        const userData = um.userData;

        // Сначала пытаемся загрузить из settings_json (новый формат)
        if (userData.settings_json) {
            try {
                const settings = JSON.parse(userData.settings_json);
                const audioSettings = settings.audio || {};

                if (audioSettings.start !== undefined && audioSettings.start !== null) {
                    playSequenceStart = audioSettings.start;
                }
                if (audioSettings.typo !== undefined && audioSettings.typo !== null) {
                    playSequenceTypo = audioSettings.typo;
                }
                if (audioSettings.success !== undefined && audioSettings.success !== null) {
                    playSequenceSuccess = audioSettings.success;
                }
                if (audioSettings.repeats !== undefined && audioSettings.repeats !== null) {
                    const parsedValue = parseInt(audioSettings.repeats, 10);
                    REQUIRED_PASSED_COUNT = (!isNaN(parsedValue) && parsedValue >= 0) ? parsedValue : 3;
                }

                if (audioSettings.required_passed_star_half !== undefined && audioSettings.required_passed_star_half !== null) {
                    const parsedStarHalf = parseInt(audioSettings.required_passed_star_half, 10);
                    REQUIRED_PASSED_STAR_HALF = (!isNaN(parsedStarHalf) && parsedStarHalf >= 1) ? Math.min(10, parsedStarHalf) : 3;
                }

                // Загружаем новые настройки
                if (audioSettings.without_entering_text !== undefined) {
                    window.audioSettingsWithoutEnteringText = Boolean(audioSettings.without_entering_text);
                }
                if (audioSettings.show_text !== undefined) {
                    window.audioSettingsShowText = Boolean(audioSettings.show_text);
                }

                // Загружаем режим распознавания речи (конвертируем старый 'avto' в 'route')
                if (audioSettings.speech_recognition_mode !== undefined && audioSettings.speech_recognition_mode !== null) {
                    if (audioSettings.speech_recognition_mode === 'avto') {
                        console.log(`🔄 [loadAudioSettingsFromUser] Конвертируем старый режим 'avto' в 'route'`);
                        speechRecognitionMode = 'route';
                    } else {
                        console.log(`🔄 [loadAudioSettingsFromUser] Загружаем режим распознавания: ${audioSettings.speech_recognition_mode}`);
                        speechRecognitionMode = audioSettings.speech_recognition_mode;
                    }
                } else {
                    console.log(`🔄 [loadAudioSettingsFromUser] Режим распознавания не найден в настройках, используем значение по умолчанию: ${speechRecognitionMode}`);
                }

                return; // Используем настройки из JSON
            } catch (error) {
                console.warn('Ошибка парсинга settings_json:', error);
            }
        }

        // Затем проверяем audio_settings_json (старый формат)
        if (userData.audio_settings_json) {
            try {
                const audioSettings = JSON.parse(userData.audio_settings_json);

                if (audioSettings.start !== undefined && audioSettings.start !== null) {
                    playSequenceStart = audioSettings.start;
                }
                if (audioSettings.typo !== undefined && audioSettings.typo !== null) {
                    playSequenceTypo = audioSettings.typo;
                }
                if (audioSettings.success !== undefined && audioSettings.success !== null) {
                    playSequenceSuccess = audioSettings.success;
                }
                if (audioSettings.repeats !== undefined && audioSettings.repeats !== null) {
                    const parsedValue = parseInt(audioSettings.repeats, 10);
                    REQUIRED_PASSED_COUNT = (!isNaN(parsedValue) && parsedValue >= 0) ? parsedValue : 3;
                }

                if (audioSettings.required_passed_star_half !== undefined && audioSettings.required_passed_star_half !== null) {
                    const parsedStarHalf = parseInt(audioSettings.required_passed_star_half, 10);
                    REQUIRED_PASSED_STAR_HALF = (!isNaN(parsedStarHalf) && parsedStarHalf >= 1) ? Math.min(10, parsedStarHalf) : 3;
                }

                if (audioSettings.without_entering_text !== undefined) {
                    window.audioSettingsWithoutEnteringText = Boolean(audioSettings.without_entering_text);
                }
                if (audioSettings.show_text !== undefined) {
                    window.audioSettingsShowText = Boolean(audioSettings.show_text);
                }

                if (audioSettings.speech_recognition_mode !== undefined && audioSettings.speech_recognition_mode !== null) {
                    if (audioSettings.speech_recognition_mode === 'avto') {
                        speechRecognitionMode = 'route';
                    } else {
                        speechRecognitionMode = audioSettings.speech_recognition_mode;
                    }
                }
            } catch (error) {
                console.warn('Ошибка парсинга audio_settings_json:', error);
            }
        }

        // Fallback на старые отдельные поля (для обратной совместимости)
        if (userData.audio_start !== undefined && userData.audio_start !== null) {
            playSequenceStart = userData.audio_start;
        }
        if (userData.audio_typo !== undefined && userData.audio_typo !== null) {
            playSequenceTypo = userData.audio_typo;
        }
        if (userData.audio_success !== undefined && userData.audio_success !== null) {
            playSequenceSuccess = userData.audio_success;
        }
        if (userData.audio_repeats !== undefined && userData.audio_repeats !== null) {
            const parsedValue = parseInt(userData.audio_repeats, 10);
            REQUIRED_PASSED_COUNT = (!isNaN(parsedValue) && parsedValue >= 0) ? parsedValue : 3;
        }
    }

}

/**
 * @typedef {Object} Sentence
 * @property {number} serial_number // очень важгый - это номер в табло 
 * (в кнопке на табло есть номер в сприске предложений - а в списке есть key)
 * @property {string} key
 * @property {string} text_original
 * @property {string} text_translation
 * @property {string} audio_original
 * @property {string} audio_translation
 * 
 * @property {0|1}    number_of_perfect           // 1 — с первого раза (сумарно по всем кругам)
 * @property {number} number_of_corrected         // 1 — со 2-й и далее (сумарно по всем кругам)
 * @property {number} number_of_audio             // Количество записей аудио для этого предложения (накопленное за весь диктант)
 * 
 * ИСПРАВЛЕНО: Поля circle_number_of_* удалены, так как логика "circle" больше не используется
 * Теперь используются только прямые поля number_of_perfect, number_of_corrected, number_of_audio
 * 
 * @property {'unchecked'|'checked'|'completed'} selection_state  // Состояние выбора в таблице:
 *   - 'unchecked' - не выбрано для работы (пустой кружочек)
 *   - 'checked' - выбрано для работы (кружок с галочкой)
 *   - 'completed' - все выполнено (кружок со звездой, не изменяется кнопкой "отметить все")
 * 
 * @property {boolean} all_audio_completed  // Все аудио для этого предложения выполнены (>= REQUIRED_PASSED_COUNT)
 * 
 */
/** @type {Sentence[]} */

// const rawJson = document.getElementById("sentences-data").textContent;
// let allSentences = JSON.parse(rawJson); // все предложения всего диктанта (самый широкий)
let allSentences = [];

// суммы по итогам предыдущих кругов
let number_of_perfect = 0;          // 1 — с первого раза (сумарно по всем кругам)
let number_of_corrected = 0;       // 1 — со 2-й и далее (сумарно по всем кругам)
let number_of_audio = 0;           // 1 — со 2-й и далее (сумарно по всем кругам)
let number_of_total = 0;           // 1 — со 2-й и далее (сумарно по всем кругам)

// список ключей из диктанта выбраний по чекауту 
// (уже или равен allSentences по размеру)
let selectedSentences = [];
let currentSentenceIndex = 0;// индекс списка выбранных по чакауту предложений
let currentSentence = 0;   // текущее предложение из allSentences с kay = selectedSentencesх[currentSentenceIndex]
// Делаем currentSentence доступной глобально для UnifiedSpeechRecognition
window.currentSentence = null;

// Метрики по предложению (анти-обход): сколько раз стартовали предложение + сколько ошибок в последней проверке
// Храним на объекте предложения (allSentences) как s.attempts_total и s.error_count

// Диалоговые метаданные (из info.json)
let dictationIsDialog = false;
let dictationSpeakers = {};

// индексы 9ти кнопок  (
// уже или равен selectedSentences по размеру, 
// индекс массива id="sentenceCounter">)
// const maxVisible = 9;
const MAXVISIBLE = 9;
let maxIndTablo = MAXVISIBLE; // когда пользователь выбирает предложения для работы это чило может уменьшится
let counterTabloBtn; // кнопка на которой текущая позиция курсора
let counterTabloIndex = 0; // текущая позиция курсора
let counterTabloIndex_old = 0; // предыдущая позиция курсора
let buttonsTablo = [];
let totalSelectedSentences = 0; // Общее количество выбранных предложений при старте (не изменяется)

// номер текущего круга
let circle_number = 0;

let allCheckbox = document.getElementById('allCheckbox');
let mixControl = document.getElementById('mixControl');
let tableCheckboxes = [];
let resetProgressBtn = document.getElementById('resetProgressBtn');


let currentDictation = {
    id: '', // ID поточного диктанту
    language_original: '',
    language_translation: '',
    title_orig: ''
}

// Глобальные переменные модального окна начала диктанта
let isAudioLoaded = false;
const startModal = document.getElementById('start-modal');
const confirmStartBtn = document.getElementById('confirmStartBtn');

// ===== Элементы DOM =====
const count_perfect = document.getElementById('count_perfect');
const count_corrected = document.getElementById('count_corrected');
const count_audio = document.getElementById('count_audio');
const count_total = document.getElementById('count_total');

const openUserAudioModalBtn = document.getElementById('openUserAudioModalBtn');
const userAudioModal = document.getElementById('userAudioModal');
const closeUserAudioBtn = document.querySelector('.close-user-audio');
const userCancelBtn = document.getElementById('userCancelButton');
const userConfirmBtn = document.getElementById('userConfirmButton');
const userRecordBtn = document.getElementById('userRecordButton');
const userAudioStatusText = document.getElementById('userAudioStatusText');
// const userAudioTranscript = document.getElementById('userAudioTranscript');
const userAudioVisualizer = document.getElementById('userAudioVisualizer');

// ===== Виртуальная клавиатура =====
const virtualKeyboardToggle = document.getElementById('virtualKeyboardToggle');
const virtualKeyboardContainer = document.getElementById('virtualKeyboard');
let keyboardLayoutsCache = null;
let keyboardLayoutsLoadPromise = null;
let virtualKeyboardShiftPressed = false;
let lastKeyboardHintLayout = null;
let keyboardHintRenderScheduled = false;

function doesVirtualKeyboardFitViewport() {
    try {
        if (!virtualKeyboardContainer) return true;
        if (virtualKeyboardContainer.hasAttribute('hidden') || virtualKeyboardContainer.style.display === 'none') return true;
        const viewportWidth = Math.ceil(window.innerWidth || document.documentElement.clientWidth || 0);
        if (!viewportWidth) return true;

        // If the viewport is narrow, the keyboard starts wrapping (see CSS @media max-width: 900px).
        // In that state it becomes hard to use; auto-hide it.
        const MIN_VK_VIEWPORT_WIDTH = 900;
        if (viewportWidth < MIN_VK_VIEWPORT_WIDTH) return false;

        // Additionally detect any wrapping in rows (keys moved to multiple lines).
        const rows = virtualKeyboardContainer.querySelectorAll('.vk-row');
        for (const row of rows) {
            const keys = row.querySelectorAll('.vk-key');
            if (!keys.length) continue;
            const firstTop = keys[0].offsetTop;
            for (let i = 1; i < keys.length; i++) {
                if (keys[i].offsetTop !== firstTop) {
                    return false;
                }
            }
        }

        // Fallback: if keyboard content is wider than the viewport (with a small safety margin), it doesn't fit.
        const safetyMargin = 24;
        const keyboardWidth = Math.ceil(virtualKeyboardContainer.scrollWidth || virtualKeyboardContainer.getBoundingClientRect().width || 0);
        if (!keyboardWidth) return true;
        return keyboardWidth + safetyMargin <= viewportWidth;
    } catch (e) {
        return true;
    }
}

function enforceVirtualKeyboardFitsViewport() {
    try {
        if (!virtualKeyboardToggle || !virtualKeyboardContainer) return;
        if (!virtualKeyboardToggle.checked) return;
        if (doesVirtualKeyboardFitViewport()) return;
        hideVirtualKeyboardIfActive();
    } catch (e) {
    }
}

if (!window.__dictafanVirtualKeyboardResizeHandlerAttached) {
    window.__dictafanVirtualKeyboardResizeHandlerAttached = true;
    window.addEventListener('resize', () => {
        enforceVirtualKeyboardFitsViewport();
    });
}

function scheduleKeyboardHintRender() {
    if (keyboardHintRenderScheduled) return;
    keyboardHintRenderScheduled = true;
    requestAnimationFrame(() => {
        keyboardHintRenderScheduled = false;
        if (!virtualKeyboardContainer) return;
        if (!virtualKeyboardToggle || !virtualKeyboardToggle.checked) return;
        if (!lastKeyboardHintLayout) return;
        renderKeyboardHint(virtualKeyboardContainer, lastKeyboardHintLayout, virtualKeyboardShiftPressed);
        enforceVirtualKeyboardFitsViewport();
    });
}

if (!window.__dictafanKeyboardHintShiftHotkeyAttached) {
    window.__dictafanKeyboardHintShiftHotkeyAttached = true;
    document.addEventListener('keydown', (e) => {
        try {
            if (e.key !== 'Shift') return;
            if (virtualKeyboardShiftPressed) return;
            virtualKeyboardShiftPressed = true;
            scheduleKeyboardHintRender();
        } catch (err) {
        }
    }, true);

    document.addEventListener('keyup', (e) => {
        try {
            if (e.key !== 'Shift') return;
            if (!virtualKeyboardShiftPressed) return;
            virtualKeyboardShiftPressed = false;
            scheduleKeyboardHintRender();
        } catch (err) {
        }
    }, true);
}

// ===== Переменные для аудио =====
// ===== Элементы DOM =====
// Живой буфер распознанного текста (final + interim)
const count_percent = document.getElementById('count_percent');
const recordButton = document.getElementById('recordButton');
// Инициализация кнопки
recordButton.addEventListener('click', toggleRecording);

function getCountPercentEl() {
    return document.getElementById('count_percent');
}

const recordStateIcon = document.getElementById('recordStateIcon'); // запись/пауза
const AUTO_STOP_ENABLED = true;
const AUTO_STOP_THRESHOLD = 80;     // 95%
const AUTO_STOP_STABLE_MS = 400;      // держим порог ≥95% хотя бы 0.4s
let srLiveText = '';
let isRecording = false;     // идёт ли запись (для onresult)
let autoStopTimer = null;
let isStopping = false;        // защитимся от двойного стопа (авто + клик)
let lastStopCause = 'manual';  // 'manual' | 'auto'
let isProcessingRecognition = false; // ручная остановка -> идёт распознавание/обработка результата
const VIS_BAR_COLOR =
    getComputedStyle(document.documentElement)
        .getPropertyValue('--color-button-text-purple')
        .trim() || '#8BBFFF';

const audioVisualizer = document.getElementById('audioVisualizer');
// === Визуализатор (общие ссылки) ===
let vizAC = null;        // AudioContext
let vizAnalyser = null;  // AnalyserNode
let vizSource = null;    // MediaStreamAudioSourceNode
let vizRAF = null;       // requestAnimationFrame id
let vizActive = false;   // флаг "рисуем сейчас"

let mediaRecorder, audioChunks = [];
// let languageCodes = {};
let langCodeUrl = 'en-US';
let recognition = null;
let textAttemptCount = 0;
let lastRecognitionTime = 0;  // Время последнего результата распознавания для умного автостопа

let inputScriptNoticeShown = false;

let LATIN_TEST_REGEX = /[A-Za-z]/;
let LATIN_REPLACE_REGEX = /[A-Za-z]/g;
let CYRILLIC_TEST_REGEX = /[\u0400-\u04FF]/;
let CYRILLIC_REPLACE_REGEX = /[\u0400-\u04FF]/g;
let ARABIC_TEST_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
let ARABIC_REPLACE_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

// Prefer Unicode script property escapes when supported by the runtime.
try {
    LATIN_TEST_REGEX = new RegExp('\\p{Script=Latin}', 'u');
    LATIN_REPLACE_REGEX = new RegExp('\\p{Script=Latin}', 'gu');
    CYRILLIC_TEST_REGEX = new RegExp('\\p{Script=Cyrillic}', 'u');
    CYRILLIC_REPLACE_REGEX = new RegExp('\\p{Script=Cyrillic}', 'gu');
    ARABIC_TEST_REGEX = new RegExp('\\p{Script=Arabic}', 'u');
    ARABIC_REPLACE_REGEX = new RegExp('\\p{Script=Arabic}', 'gu');
} catch {
}

function getDictationScript() {
    const raw = (langCodeUrl || currentDictation?.language_original || '').toString().trim().toLowerCase();
    if (raw.startsWith('ru') || raw.startsWith('uk')) return 'cyrillic';
    if (raw.startsWith('ar')) return 'arabic';
    // en, tr, sv, etc.
    return 'latin';
}

function getDisallowedScriptRegexes() {
    const script = getDictationScript();
    if (script === 'latin') {
        return [CYRILLIC_REPLACE_REGEX, ARABIC_REPLACE_REGEX];
    }
    if (script === 'cyrillic') {
        return [LATIN_REPLACE_REGEX, ARABIC_REPLACE_REGEX];
    }
    if (script === 'arabic') {
        return [LATIN_REPLACE_REGEX, CYRILLIC_REPLACE_REGEX];
    }
    return [];
}

function hasDisallowedChars(text) {
    if (!text) return false;
    const script = getDictationScript();
    if (script === 'latin') return CYRILLIC_TEST_REGEX.test(text) || ARABIC_TEST_REGEX.test(text);
    if (script === 'cyrillic') return LATIN_TEST_REGEX.test(text) || ARABIC_TEST_REGEX.test(text);
    if (script === 'arabic') return LATIN_TEST_REGEX.test(text) || CYRILLIC_TEST_REGEX.test(text);
    return false;
}

function stripDisallowedChars(text) {
    let result = text || '';
    for (const rx of getDisallowedScriptRegexes()) {
        result = result.replace(rx, '');
    }
    return result;
}
let recognitionActivityTimer = null;  // Таймер для отслеживания активности распознавания
let speechRecognitionMode = 'route';  // Метод распознавания речи: 'route' (только интернет), 'route-off' (только локально, только если модель загружена)

let whisperPreloadInFlight = null;
let whisperPreloadAfterTableDone = false;
let whisperWasLocalOnBoot = false;

function getWhisperManagerSingleton() {
    if (!window.WhisperModelManager) return null;
    if (!window.__dictafanWhisperModelManager) {
        window.__dictafanWhisperModelManager = new window.WhisperModelManager();
    }
    return window.__dictafanWhisperModelManager;
}

function updateWhisperModelReadyBadge(state, details) {
    const el = document.getElementById('whisperModelReadyBadge');
    if (!el) return;

    const effectiveMode = getEffectiveSpeechRecognitionMode();
    if (effectiveMode !== 'route-off') {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }

    el.style.display = 'inline';
    const text = (details || '').toString();
    if (state === 'loading') {
        el.textContent = text ? `${text} — идет загрузка модели…` : 'Идет загрузка модели…';
        return;
    }
    if (state === 'ready') {
        el.textContent = text ? `${text} — готова` : 'Модель готова';
        return;
    }
    if (state === 'missing') {
        el.textContent = text ? `${text} — нет модели` : 'Модель не загружена';
        return;
    }
    el.textContent = text;
}

async function preloadWhisperModelIfNeeded(triggerLabel = 'unknown', force = false) {
    try {
        if (!force && getEffectiveSpeechRecognitionMode() !== 'route-off') {
            updateWhisperModelReadyBadge(null, '');
            return;
        }

        const currentLang = langCodeUrl?.split('-')[0]
            || (typeof currentDictation !== 'undefined' && currentDictation?.language_original
                ? currentDictation.language_original.split('-')[0]
                : 'en');
        const selectedSize = getSelectedWhisperModelSize(currentLang) || 'base';
        const badgeLabel = `Whisper ${selectedSize}`;

        if (!hasWhisperModel(currentLang, selectedSize)) {
            updateWhisperModelReadyBadge('missing', badgeLabel);
            return;
        }

        const modelKey = `whisper_model_${selectedSize}`;
        const inMemory = window.WhisperModels && typeof window.WhisperModels.get === 'function'
            ? window.WhisperModels.get(modelKey)
            : null;
        if (inMemory && inMemory.recognizer) {
            updateWhisperModelReadyBadge('ready', badgeLabel);
            return;
        }

        if (whisperPreloadInFlight) {
            updateWhisperModelReadyBadge('loading', badgeLabel);
            await whisperPreloadInFlight;
            return;
        }

        const wm = getWhisperManagerSingleton();
        if (!wm) {
            updateWhisperModelReadyBadge('missing', badgeLabel);
            return;
        }

        updateWhisperModelReadyBadge('loading', badgeLabel);
        whisperPreloadInFlight = (async () => {
            await wm.loadLanguageModel(currentLang, selectedSize, (p) => {
                try {
                    if (!p) return;
                    const percent = Math.round((Number(p.progress) || 0) * 100);
                    if (isFinite(percent) && percent > 0 && percent < 100) {
                        updateWhisperModelReadyBadge('loading', `${badgeLabel} ${percent}%`);
                    }
                } catch (e) {
                }
            });
        })();

        await whisperPreloadInFlight;
        updateWhisperModelReadyBadge('ready', badgeLabel);
    } catch (e) {
        try {
            updateWhisperModelReadyBadge('missing', 'Whisper');
        } catch (err) {
        }
    } finally {
        whisperPreloadInFlight = null;
    }
}

function getEffectiveSpeechRecognitionMode() {
    try {
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
            return 'route-off';
        }
    } catch (e) {
    }
    try {
        // If user selected local-only but there is no local model, and we are online,
        // fall back to internet recognition.
        if (speechRecognitionMode === 'route-off') {
            const currentLang = langCodeUrl?.split('-')[0]
                || (typeof currentDictation !== 'undefined' && currentDictation?.language_original
                    ? currentDictation.language_original.split('-')[0]
                    : 'en');
            const selectedSize = getSelectedWhisperModelSize(currentLang);
            const hasModel = hasWhisperModel(currentLang, selectedSize);
            if (!hasModel) {
                return 'route';
            }
        }
    } catch (e) {
    }
    return speechRecognitionMode;
}
let audioSettingsPanel = null;
let audioSettingsModalPanel = null;  // Панель настроек в модальном окне

// Инициализация глобального хранилища моделей Whisper
if (typeof window !== 'undefined' && !window.WhisperModels) {
    window.WhisperModels = new Map();
}

// Глобальный экземпляр UnifiedSpeechRecognition
let unifiedSpeechRecognizer = null;

/**
 * Инициализация UnifiedSpeechRecognition
 */
function initUnifiedSpeechRecognition() {
    if (typeof UnifiedSpeechRecognition === 'undefined') {
        console.warn('⚠️ UnifiedSpeechRecognition не загружен');
        return null;
    }
    
    const userAudioAnswer = document.getElementById('userAudioAnswer');
    const audioVisualizer = document.getElementById('audioVisualizer');
    
    // Определяем режим распознавания (только 'online' или 'offline')
    const effectiveMode = getEffectiveSpeechRecognitionMode();
    let mode = 'online'; // по умолчанию онлайн
    if (effectiveMode === 'route-off') {
        mode = 'offline';
    } else if (effectiveMode === 'route') {
        mode = 'online';
    }
    
    // Определяем язык
    const language = langCodeUrl || 'en-US';
    
    unifiedSpeechRecognizer = new UnifiedSpeechRecognition({
        language: language,
        mode: mode,
        autoStopThreshold: AUTO_STOP_THRESHOLD,
        autoStopStableMs: AUTO_STOP_STABLE_MS,
        visualizerCanvas: audioVisualizer,
        transcriptContainer: userAudioAnswer
    });
    
    // Настраиваем колбэки
    unifiedSpeechRecognizer.callbacks.onTranscript = (fullText, isFinal) => {
        // Обновление уже происходит внутри UnifiedSpeechRecognition
        // Но можем добавить дополнительную логику здесь
    };
    
    unifiedSpeechRecognizer.callbacks.onFinalTranscript = (transcript) => {
        // Финальный текст получен
    };
    
    unifiedSpeechRecognizer.callbacks.onError = (error) => {
        // Web Speech API иногда сообщает уведомления вроде 'aborted' при штатной остановке.
        // Не показываем их как фатальные ошибки пользователю.
        const code = (error && typeof error === 'object')
            ? (error.error || error.message)
            : error;
        const codeStr = (code || '').toString().toLowerCase();
        if (codeStr === 'aborted' || codeStr === 'no-speech' || codeStr === 'audio-capture') {
            console.debug('UnifiedSpeechRecognition notice:', codeStr);
            return;
        }

        console.error('Ошибка UnifiedSpeechRecognition:', error);
        if (userAudioAnswer) {
            userAudioAnswer.innerHTML = `<span class="error">Ошибка распознавания: ${error}</span>`;
        }

        // Если кнопка была заблокирована на время распознавания — обязаны вернуть её в рабочее состояние.
        try {
            if (isProcessingRecognition) {
                isProcessingRecognition = false;
                restoreRecordButtonAvailability('unifiedSpeechRecognizer.callbacks.onError');
            }
        } catch (e) {
        }
    };
    
    unifiedSpeechRecognizer.callbacks.onRecordingStart = () => {
        isRecording = true;
        isStopping = false;
        lastStopCause = 'manual';
        srLiveText = '';
        setRecordStateIcon('pause');
        updateRecordingIndicator(true);
        try {
            playRecordingStartBeep();
        } catch (e) {
        }
        try {
            if (typeof setupVisualizer === 'function' && unifiedSpeechRecognizer && unifiedSpeechRecognizer._mediaStream) {
                setupVisualizer(unifiedSpeechRecognizer._mediaStream);
            }
        } catch (e) {
        }
        currentInactivityTimeout = INACTIVITY_TIMEOUT_RECORDING;
        resetInactivityTimer();
        
        const rb = document.getElementById('recordButton');
        if (rb) rb.classList.add('recording');
    };
    
    unifiedSpeechRecognizer.callbacks.onRecordingStop = () => {
        isRecording = false;
        isStopping = false;
        const rb = document.getElementById('recordButton');
        if (rb) rb.classList.remove('recording');
        setRecordStateIcon('square');
        updateRecordingIndicator(false);
        try {
            if (typeof stopVisualization === 'function') {
                stopVisualization();
            }
        } catch (e) {
        }
        currentInactivityTimeout = INACTIVITY_TIMEOUT_DEFAULT;
        resetInactivityTimer();
    };
    
    unifiedSpeechRecognizer.callbacks.onProcessingStart = () => {
        // Показываем анимацию обработки для офлайн-режима
        if (getEffectiveSpeechRecognitionMode() === 'route-off' && userAudioAnswer) {
            showWhisperProcessingAnimation();
        }
    };
    
    unifiedSpeechRecognizer.callbacks.onProcessingEnd = () => {
        // Обработка завершена
    };
    
    unifiedSpeechRecognizer.callbacks.onPercentUpdate = (percent) => {
        const el = getCountPercentEl();
        if (el) {
            el.textContent = percent;
        } else {
            console.error(`[onPercentUpdate] count_percent элемент не найден!`);
        }
    };
    
    return unifiedSpeechRecognizer;
}

// Функции для работы с моделями Whisper
function normalizeWhisperLangCode(langCode) {
    const raw = (langCode || '').toString().trim().toLowerCase();
    if (!raw) return '';
    return raw.split('-')[0] || raw;
}

function parseWhisperSizeFromModelKey(modelKey) {
    try {
        const mk = (modelKey || '').toString();
        if (!mk) return null;
        if (!mk.startsWith('whisper:')) return null;
        const repo = mk.slice('whisper:'.length);
        if (repo.includes('whisper-tiny')) return 'tiny';
        if (repo.includes('whisper-small')) return 'small';
        if (repo.includes('whisper-base')) return 'base';
        return null;
    } catch (e) {
        return null;
    }
}

function getSelectedWhisperModelSize(langCode) {
    const normalizedLang = normalizeWhisperLangCode(langCode);
    if (!normalizedLang) return null;

    // v2 model-centric selection: selected_asr_model_v2_<lang> stores modelKey like "whisper:Xenova/whisper-small".
    try {
        const mk = localStorage.getItem(`selected_asr_model_v2_${normalizedLang}`);
        const size = parseWhisperSizeFromModelKey(mk);
        if (size) return size;
    } catch (e) {
    }

    const key = `selected_model_${normalizedLang}_whisper`;
    const value = localStorage.getItem(key);
    if (!value || value === 'null' || value === 'none') return null;
    return String(value);
}

function getWhisperSizeCandidates(langCode, modelSize = null) {
    const raw = (langCode || '').toString().trim().toLowerCase();
    const normalized = normalizeWhisperLangCode(raw);
    const selected = modelSize || getSelectedWhisperModelSize(normalized) || getSelectedWhisperModelSize(raw);

    if (selected) {
        const sizes = [selected];
        if (!sizes.includes('base')) sizes.push('base');
        return sizes;
    }

    return ['base', 'tiny', 'small'];
}

function getWhisperModelKeyCandidates(langCode, modelSize = null) {
    const raw = (langCode || '').toString().trim().toLowerCase();
    const normalized = normalizeWhisperLangCode(raw);
    const sizes = getWhisperSizeCandidates(langCode, modelSize);
    const keys = [];
    for (const size of sizes) {
        // Model-centric: global key per size.
        keys.push(`whisper_model_${size}`);
        if (raw) keys.push(`whisper_model_${raw}_${size}`);
        if (normalized && normalized !== raw) keys.push(`whisper_model_${normalized}_${size}`);
    }
    return keys;
}

function getWhisperModel(langCode, modelSize = null) {
    if (!window.WhisperModels) return null;
    const candidates = getWhisperModelKeyCandidates(langCode, modelSize);
    for (const modelKey of candidates) {
        const storedModel = window.WhisperModels.get(modelKey);
        if (storedModel && storedModel.isReady && storedModel.recognizer) {
            return storedModel.recognizer;
        }
    }
    return null;
}

function hasWhisperModel(langCode, modelSize = null) {
    const candidates = getWhisperModelKeyCandidates(langCode, modelSize);
    for (const modelKey of candidates) {
        // Сначала проверяем в памяти (быстрая проверка)
        if (window.WhisperModels) {
            const storedModel = window.WhisperModels.get(modelKey);
            if (storedModel && storedModel.isReady && storedModel.recognizer) {
                return true;
            }
        }

        // Если в памяти нет, проверяем localStorage (как в профиле)
        // Это важно, так как модель может быть загружена, но еще не инициализирована в памяти
        const modelStatus = localStorage.getItem(modelKey);
        const isInStorage = modelStatus === 'downloaded' || modelStatus === 'ready';
        if (isInStorage) return true;
    }

    // Fallback #2: models-centric downloaded state (downloaded_models_v2 + selected_asr_model_v2_<lang>)
    try {
        const normalizedLang = normalizeWhisperLangCode(langCode);
        const raw = localStorage.getItem('downloaded_models_v2');
        const obj = raw ? JSON.parse(raw) : null;
        const mk = localStorage.getItem(`selected_asr_model_v2_${normalizedLang}`);
        if (obj && typeof obj === 'object' && mk && obj[mk]) return true;
    } catch (e) {
    }

    // Fallback #3: модель могла быть скачана через ModelManager/language_selector,
    // где используется другая схема ключей (downloaded_models / model_<lang>_<type>_<id>)
    const normalizedLang = normalizeWhisperLangCode(langCode);
    const sizes = getWhisperSizeCandidates(langCode, modelSize);
    for (const size of sizes) {
        // language_selector.js сохраняет состояние так
        const stateKey = `model_${normalizedLang}_whisper_${size}`;
        const stateStr = localStorage.getItem(stateKey);
        if (stateStr) {
            try {
                const parsed = JSON.parse(stateStr);
                if (parsed && parsed.isDownloaded) return true;
            } catch {
                return true;
            }
        }

        // ModelManager хранит downloaded_models в JSON
        if (window.ModelManager && typeof window.ModelManager.isModelDownloaded === 'function') {
            try {
                if (window.ModelManager.isModelDownloaded(normalizedLang, size, 'whisper')) return true;
            } catch {}
        }
    }

    return false;
}

// === Настройки для аудио-урока ===
const MIN_MATCH_PERCENT = 80;      // минимальный % совпадения, чтобы засчитать попытку
let REQUIRED_PASSED_COUNT = 3;   // сколько засчитанных аудио нужно для сдачи урока (можно изменить через поле ввода)
let REQUIRED_PASSED_STAR_HALF = 3;   // сколько засчитанных полузвезд меняем на одну звезду

// Служебный счётчик пройденных попыток в текущем уроке
let passedAudioCount = 0;

let userAudioElement = null;        // один общий Audio()
let userAudioObjectUrl = null;      // текущий объектный URL для прослушки
let userPlayInited = false;         // чтобы не вешать обработчик многократно

// --- обработка таблицы с диктантом в модальгом окне -----------------------------------------------
// ====== Простые хелперы ======
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// --- обработка паузы -----------------------------------------------
// ===== Переменные для паузы =====
const pauseModal = document.getElementById('pauseModal');
const pauseTimerElement = document.getElementById('pauseTimer');
const resumeBtn = document.getElementById('resumeBtn');

// Эти элементы будут обновлены после рендера панели прогресса
let dictationTimerElement = document.getElementById('timer');
let modalTimerElement = document.getElementById('modal_timer');

// Экспортируем в window для обновления после рендера
window.dictationTimerElement = dictationTimerElement;
window.modalTimerElement = modalTimerElement;

function getProgressPanelInstance() {
    if (progressPanel) return progressPanel;
    if (window.progressPanel) {
        progressPanel = window.progressPanel;
        return progressPanel;
    }
    return null;
}

function getProgressTimerSnapshot() {
    const panel = getProgressPanelInstance();
    if (panel && typeof panel.getTimerSnapshot === 'function') {
        return panel.getTimerSnapshot();
    }
    return {
        mode: 'clock',
        isRunning: false,
        elapsedMs: 0,
        countdownRemainingMs: 0,
        displaySeconds: 0,
        accumulatedMs: 0,
        periodStart: null,
        periodEnd: null,
        defaultCountdownSeconds: 0
    };
}

function getTimerDisplayMs(snapshot = getProgressTimerSnapshot()) {
    if (snapshot.mode === 'countdown') {
        return snapshot.countdownRemainingMs;
    }
    return snapshot.elapsedMs;
}

let pauseStartTime = null;
let pauseTimerInterval = null;
let pauseTime = 0;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_DEFAULT = 60000;  // 1 минута
const INACTIVITY_TIMEOUT_RECORDING = 10 * 60 * 1000;  // 10 минут
const SAVE_KEY_VALUES = ['s', 'ы', 'і', 'س'];
let currentInactivityTimeout = INACTIVITY_TIMEOUT_DEFAULT;
let gameHasAlreadyBegun = false;

let pauseModalClickHandler = null;
let pauseModalEscHandler = null;

function logout() {
    localStorage.removeItem('jwt_token');
    // Показываем модальное окно авторизации - гостевого режима нет!
    if (window.UM) {
        window.UM.requireAuth();
    }
    window.location.href = '/';
}

function setupAuthHandlers() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            // Показываем модальное окно логина
            if (window.loginModal) {
                window.loginModal.show('login');
            } else if (typeof LoginModal !== 'undefined') {
                LoginModal.show('login');
            }
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            // Показываем модальное окно регистрации
            if (window.loginModal) {
                window.loginModal.show('register');
            } else if (typeof LoginModal !== 'undefined') {
                LoginModal.show('register');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}


// Функции для сохранения/загрузки данных генератора
async function saveGeneratorData(generatorData) {
    try {
        const token = localStorage.getItem('jwt_token');
        if (!token) {
            return;
        }

        const response = await fetch('/api/generator/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(generatorData)
        });

        if (response.ok) {
        }
    } catch (error) {
        console.error('Ошибка при сохранении данных генератора:', error);
    }
}

async function loadGeneratorData() {
    try {
        const token = localStorage.getItem('jwt_token');
        if (!token) return null;

        const response = await fetch('/api/generator/load', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Ошибка при загрузке данных генератора:', error);
        return null;
    }
}





// ===== Управление выходом =====
function setupExitHandlers() {
    const exitModal = document.getElementById('exitModal');
    const stayExitBtn = document.getElementById('exitStayBtn');
    const exitWithoutSavingBtn = document.getElementById('exitWithoutSavingBtn');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');
    window.pendingExitAction = null;

    // Обработчик для кнопки "На главную" (только для #btnBackToMain, #btnBackToList имеет свою функцию clickBtnBackToList)
    const btnBackToMain = document.getElementById('btnBackToMain');
    if (btnBackToMain) {
        btnBackToMain.addEventListener('click', () => showExitModal(() => window.location.href = "/"));
    }

    // Обработчик кнопки "Сохранить"
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await handleSave();
        });
    }

    // Обработчик кнопки "Вернуться к списку диктантов"
    const exitToIndexBtn = document.getElementById('exitToIndexBtn');
    if (exitToIndexBtn) {
        exitToIndexBtn.addEventListener('click', async () => {
            const panel = getProgressPanelInstance();
            const hasPanelPending = panel && typeof panel.hasPending === 'function' ? panel.hasPending() : false;
            const hasLocalPending = await hasLocalPendingDraft();

            // Если все сохранено - тихо выходим без модального окна
            if (!hasPanelPending && !hasLocalPending) {
                window.location.href = "/";
                return;
            }

            // Если есть несохраненные изменения - показываем модальное окно
            await showExitModal(() => window.location.href = "/");
        });
    }

    // Обработчики для модального окна выхода
    if (stayExitBtn) {
        stayExitBtn.addEventListener('click', hideExitModal);
    }

    if (exitWithoutSavingBtn) {
        exitWithoutSavingBtn.addEventListener('click', () => {
            hideExitModal();
            if (typeof window.pendingExitAction === 'function') {
                window.pendingExitAction();
            } else {
                window.location.href = "/";
            }
            window.pendingExitAction = null;
        });
    }

    if (exitWithSavingBtn) {
        exitWithSavingBtn.addEventListener('click', async () => {
            await handleSaveAndExit();
        });
    }

    // Закрытие модального окна по клику вне его
    if (exitModal) {
        exitModal.addEventListener('click', (e) => {
            if (e.target === exitModal) {
                hideExitModal();
            }
        });
    }

    // Обработка клавиши Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && exitModal && exitModal.style.display === 'flex') {
            hideExitModal();
        }
    });
}

async function showExitModal(action) {
    const exitModal = document.getElementById('exitModal');
    if (!exitModal) return;

    const panel = getProgressPanelInstance();
    const hasPanelPending = panel && typeof panel.hasPending === 'function' ? panel.hasPending() : false;
    const hasLocalPending = await hasLocalPendingDraft();
    const hasPending = hasPanelPending || hasLocalPending;

    window.pendingExitAction = typeof action === 'function' ? action : () => window.location.href = "/";

    const messageEl = document.getElementById('exitModalMessage');
    if (messageEl) {
        messageEl.textContent = hasPending
            ? 'Есть несохранённый прогресс. Сохранить перед выходом?'
            : 'Все изменения уже сохранены. Что сделать дальше?';
    }

    const exitWithoutBtn = document.getElementById('exitWithoutSavingBtn');
    if (exitWithoutBtn) {
        exitWithoutBtn.textContent = hasPending ? 'Выйти' : 'Выйти';
    }

    const exitWithBtn = document.getElementById('exitWithSavingBtn');
    if (exitWithBtn) {
        if (hasPending) {
            exitWithBtn.style.display = '';
            exitWithBtn.disabled = false;
            exitWithBtn.classList.remove('disabled');
        } else {
            exitWithBtn.style.display = 'none';
        }
    }

    exitModal.style.display = 'flex';
    const stayBtn = document.getElementById('exitStayBtn');
    if (stayBtn) stayBtn.focus();
}

function hideExitModal() {
    const exitModal = document.getElementById('exitModal');
    if (exitModal) {
        exitModal.style.display = 'none';
    }
    window.pendingExitAction = null;
}

/**
 * Показывает модальное окно завершения диктанта
 */
function showCompletionModal() {
    const completionModal = document.getElementById('completionModal');
    if (!completionModal) {
        console.warn('Модальное окно завершения не найдено');
        return;
    }

    // Останавливаем таймер
    stopTimer();

    // Останавливаем таймер бездействия
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Останавливаем все аудио
    stopAllAudios();

    // Показываем модальное окно
    completionModal.style.display = 'flex';

    // Инициализируем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    // Устанавливаем фокус на кнопку "Пройти еще раз"
    const exitBtn = document.getElementById('completionExitBtn');
    if (exitBtn) {
        exitBtn.focus();
    }
}

/**
 * Скрывает модальное окно завершения диктанта
 */
function hideCompletionModal() {
    const completionModal = document.getElementById('completionModal');
    if (completionModal) {
        completionModal.style.display = 'none';
    }
}

/**
 * Инициализация обработчиков модального окна завершения
 */
function setupCompletionModalHandlers() {
    const completionModal = document.getElementById('completionModal');
    const exitBtn = document.getElementById('completionExitBtn');
 
    if (!completionModal || !exitBtn ) {
        console.warn('Элементы модального окна завершения не найдены');
        return;
    }

    // Обработчик кнопки "Выйти"
    // Если диктант полностью завершен, история уже сохранена и черновик удален
    // Не нужно показывать модальное окно сохранения прогресса - сразу выходим
    exitBtn.addEventListener('click', () => {
        hideCompletionModal();
        // При полном завершении сразу перенаправляем на главную
        // История уже сохранена через registerCompletedDictation()
        // Черновик уже удален, временный прогресс не нужен
        window.location.href = "/";
    });



    // Закрытие по клику вне контента
    // При полном завершении сразу выходим, без модального окна сохранения прогресса
    completionModal.addEventListener('click', (e) => {
        if (e.target === completionModal) {
            hideCompletionModal();
            // При полном завершении сразу перенаправляем на главную
            window.location.href = "/";
        }
    });

    // Закрытие по клавише Escape
    // При полном завершении сразу выходим, без модального окна сохранения прогресса
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && completionModal.style.display === 'flex') {
            hideCompletionModal();
            // При полном завершении сразу перенаправляем на главную
            window.location.href = "/";
        }
    });
}

/**
 * Показывает модальное окно предупреждения о невыбранных предложениях
 */
function showNoSelectionModal(customMessage = null) {
    const noSelectionModal = document.getElementById('noSelectionModal');
    if (!noSelectionModal) {
        console.warn('Модальное окно предупреждения не найдено');
        return;
    }

    const messageNode = noSelectionModal.querySelector('.warning-message');
    if (messageNode) {
        messageNode.textContent = customMessage || 'Пожалуйста, отметьте предложения для работы в таблице выше.';
    }

    // Показываем модальное окно
    noSelectionModal.style.display = 'flex';

    // Инициализируем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    // Устанавливаем фокус на кнопку "Понятно"
    const okBtn = document.getElementById('noSelectionOkBtn');
    if (okBtn) {
        okBtn.focus();
    }
}

/**
 * Скрывает модальное окно предупреждения о невыбранных предложениях
 */
function hideNoSelectionModal() {
    const noSelectionModal = document.getElementById('noSelectionModal');
    if (noSelectionModal) {
        noSelectionModal.style.display = 'none';
    }
}

/**
 * Инициализация обработчиков модального окна предупреждения
 */
function setupNoSelectionModalHandlers() {
    const noSelectionModal = document.getElementById('noSelectionModal');
    const okBtn = document.getElementById('noSelectionOkBtn');

    if (!noSelectionModal || !okBtn) {
        console.warn('Элементы модального окна предупреждения не найдены');
        return;
    }

    // Обработчик кнопки "Понятно"
    okBtn.addEventListener('click', () => {
        hideNoSelectionModal();
    });

    // Закрытие по клику вне контента
    noSelectionModal.addEventListener('click', (e) => {
        if (e.target === noSelectionModal) {
            hideNoSelectionModal();
        }
    });

    // Закрытие по клавише Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && noSelectionModal.style.display === 'flex') {
            hideNoSelectionModal();
        }
    });
}

// ===== Обработчики аутентификации =====
function setupAuthHandlers() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = '/auth/login';
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            window.location.href = '/auth/register';
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

// ===== Сохранение прогресса (с JWT) =====
async function saveProgress(progressData) {
    try {
        const token = localStorage.getItem('jwt_token');
        if (!token) {
            return;
        }

        const response = await fetch('/api/progress/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(progressData)
        });

        if (response.ok) {
        } else {
            console.error('Ошибка сохранения прогресса');
        }
    } catch (error) {
        console.error('Ошибка при сохранении прогресса:', error);
    }
}

// ===== Загрузка прогресса (с JWT) =====
async function loadProgress() {
    try {
        const token = localStorage.getItem('jwt_token');
        if (!token) {
            return null;
        }

        const response = await fetch('/api/progress/load', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Ошибка при загрузке прогресса:', error);
        return null;
    }
}












// Функция паузы игры
function pauseGame(isInactivityPause = false) {
    // Если уже на паузе - ничего не делаем
    if (pauseModal.style.display === 'flex') return;

    // Если пауза из-за бездействия, вычитаем время бездействия из накопленного времени
    if (isInactivityPause) {
        const panel = getProgressPanelInstance();
        if (panel && panel.timerState) {
            // Вычитаем время бездействия из накопленного времени
            const inactivityTime = currentInactivityTimeout || INACTIVITY_TIMEOUT_DEFAULT;
            panel.timerState.dictationAccumulatedMs = Math.max(0, panel.timerState.dictationAccumulatedMs - inactivityTime);
            console.log('[pauseGame] Вычтено время бездействия:', inactivityTime, 'мс');
        }
    }

    // Устанавливаем обработчики для кнопок
    try {
        if (typeof setupEventListeners === 'function') {
            setupEventListeners();
        }
    } catch (e) {
    }

    try {
        const coverImg = document.querySelector('img.dictation-cover, #dictation-cover, #coverImage, .dictation-cover-img');
        if (coverImg && coverImg.getAttribute) {
            const src = coverImg.getAttribute('src') || '';
            const next = maybeCacheBustDictationCover(src);
            if (next && next !== src) coverImg.setAttribute('src', next);
        }
    } catch (e) {
    }

    const timerSnapshot = getProgressTimerSnapshot();
    const displayMs = getTimerDisplayMs(timerSnapshot);

    // Останавливаем таймер бездействия
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Останавливаем запись если активна
    if (mediaRecorder?.state === 'recording') {
        stopRecording('pause');
    }

    // Останавливаем все аудио
    stopAllAudios();

    // Показываем время диктанта в модальном окне
    if (pauseTimerElement) {
        updateDictationTimerDisplay(displayMs, pauseTimerElement);
    }

    // Запоминаем время начала паузы
    pauseStartTime = Date.now();

    // Запускаем таймер паузы (время простоя)
    pauseTimerInterval = setInterval(() => {
        pauseTime = Date.now() - pauseStartTime;
        // Обновляем время паузы (можно добавить отдельный элемент для этого, если нужно)
        // updateDictationTimerDisplay(pauseTime, pauseTimerElement);
    }, 1000);

    // Показываем модальное окно паузы
    pauseModal.style.display = 'flex';
    resumeBtn.focus();

    // Закрытие по клику вне контента
    if (!pauseModalClickHandler) {
        pauseModalClickHandler = (event) => {
            if (event.target === pauseModal) {
                resumeGame();
            }
        };
    }
    pauseModal.addEventListener('click', pauseModalClickHandler);

    // Закрытие по клавише Escape
    if (!pauseModalEscHandler) {
        pauseModalEscHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                resumeGame();
            }
        };
    }
    document.addEventListener('keydown', pauseModalEscHandler, true);
}

// Экспортируем функцию в window для доступа из других модулей
window.pauseGame = pauseGame;

// Функция продолжения игры
function resumeGame() {
    // Останавливаем таймер паузы
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;

    // Скрываем модальное окно
    pauseModal.style.display = 'none';

    // Перезапускаем основной таймер
    startTimer();

    // Перезапускаем таймер бездействия
    resetInactivityTimer();

    // Возвращаем фокус в поле ввода
    inputField.focus();

    // Снимаем обработчики
    if (pauseModalClickHandler) {
        pauseModal.removeEventListener('click', pauseModalClickHandler);
    }
    if (pauseModalEscHandler) {
        document.removeEventListener('keydown', pauseModalEscHandler, true);
    }
}

// Экспортируем функцию в window для доступа из других модулей
window.resumeGame = resumeGame;

// Таймер бездействия
function resetInactivityTimer() {
    // ЕСЛИ ИГРА ЕЩЕ НЕ НАЧАЛАСЬ - НИЧЕГО НЕ ДЕЛАЕМ
    if (!gameHasAlreadyBegun) {
        return;
    }

    // Очищаем предыдущий таймер
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Запускаем новый таймер только если игра активна и не на паузе
    if (pauseModal.style.display !== 'flex' && startModal.style.display !== 'flex') {
        inactivityTimer = setTimeout(() => {
            try {
                const isPlaying = (window.AudioManager && typeof window.AudioManager.isPlaying === 'function')
                    ? window.AudioManager.isPlaying()
                    : !!(window.AudioManager && window.AudioManager.audio && !window.AudioManager.audio.paused && !window.AudioManager.audio.ended);
                if (isPlaying) {
                    resetInactivityTimer();
                    return;
                }
            } catch (e) {
            }
            console.log('⏱️ Таймер бездействия: открываем модальное окно паузы');
            pauseGame(true); // Передаем true, чтобы указать, что пауза из-за бездействия
        }, currentInactivityTimeout);
    }
}


// Обновленная функция отображения времени
function updateDictationTimerDisplay(elapsed, element = dictationTimerElement) {
    const time_text = window.TimeUtils.formatDuration(elapsed);
    if (element) {
        element.textContent = time_text;
    }
    return time_text;
}




// Безопасное получение/установка доп. полей
function ensureField(obj, field, fallback) {
    if (obj[field] === undefined) obj[field] = fallback;
    return obj[field];
}

// Быстрый индекс по ключу:
function makeByKeyMap(arr) {
    const m = new Map();
    arr.forEach(s => m.set(s.key, s));
    return m;
}

// ====== 2.1 Рендер универсальной таблицы ======

/**
 * Вычисляет состояние выбора предложения на основе прогресса
 * @param {Sentence} s - Предложение
 * @returns {'unchecked'|'checked'|'completed'} Состояние выбора
 */
function calculateSentenceSelectionState(s) {
    if (!s) return 'unchecked';

    const totalPerfect = Number(s.number_of_perfect) || 0;
    const totalAudio = Number(s.number_of_audio) || 0;
    const unavailable = getUnavailable(s);

    // Проверяем, полностью ли выполнено предложение
    // completed: текст набран с первого раза (perfect) И все аудио выполнены
    const isCompleted = unavailable || (totalPerfect > 0 && totalAudio >= REQUIRED_PASSED_COUNT);

    if (isCompleted) {
        return 'completed';
    }

    // Если не completed, проверяем выбрано ли оно
    return selectedSentences.includes(s.key) ? 'checked' : 'unchecked';
}

/**
 * Обновляет состояние выбора предложения в объекте и синхронизирует с selectedSentences
 * @param {Sentence} s - Предложение
 * @param {boolean} forceUpdate - Принудительно обновить состояние (по умолчанию вычисляется автоматически)
 */
function updateSentenceSelectionState(s, forceUpdate = false) {
    if (!s) return;

    if (forceUpdate || s.selection_state === undefined) {
        s.selection_state = calculateSentenceSelectionState(s);
    }

    // Синхронизируем selectedSentences с состоянием
    // НЕ удаляем предложения из selectedSentences - они должны оставаться в списке для навигации
    // Только добавляем новые checked предложения, если их еще нет
    if ((s.selection_state === 'checked' || s.selection_state === 'completed') && !selectedSentences.includes(s.key)) {
        selectedSentences.push(s.key);
    }
    // Предложения НЕ удаляются из selectedSentences - они остаются в списке с разными состояниями
}

/**
 * Рендерит кнопку состояния для строки таблицы
 * @param {HTMLElement} statusBtn - Элемент кнопки
 * @param {Sentence} s - Предложение
 * @param {HTMLElement} row - Строка таблицы (опционально, для добавления классов)
 */
function renderSelectionStateButton(statusBtn, s, row = null) {
    if (!statusBtn || !s) return;

    // Обновляем состояние в объекте предложения
    updateSentenceSelectionState(s);

    const state = s.selection_state || calculateSentenceSelectionState(s);

    // Очищаем предыдущие классы и атрибуты
    statusBtn.className = 'sentence-check';
    statusBtn.dataset.key = s.key;

    if (state === 'completed') {
        statusBtn.dataset.checked = 'star';
        statusBtn.innerHTML = '<i data-lucide="circle-star"></i>';
        statusBtn.style.cursor = 'not-allowed';
        if (row) {
            row.classList.add('sentence-row-completed');
        }
    } else if (state === 'checked') {
        statusBtn.dataset.checked = 'true';
        statusBtn.innerHTML = '<i data-lucide="circle-check-big"></i>';
        statusBtn.style.cursor = 'pointer';
        if (row) {
            row.classList.remove('sentence-row-completed');
        }
    } else { // 'unchecked'
        statusBtn.dataset.checked = 'false';
        statusBtn.innerHTML = '<i data-lucide="circle"></i>';
        statusBtn.style.cursor = 'pointer';
        if (row) {
            row.classList.remove('sentence-row-completed');
        }
    }

    // Обновляем иконки Lucide
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

function updateErrorCountLabel(count) {
    const el = document.getElementById('errorCountLabel');
    if (!el) return;
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) {
        el.textContent = '';
        return;
    }
    el.textContent = String(n);
}

const tableSentences = document.querySelector(`#sentences-table tbody`);
function renderSelectionTable() {
    if (!tableSentences) return;

    const hasPreselection = Array.isArray(selectedSentences) && selectedSentences.length > 0;
    const updatedSelection = [];

    tableSentences.innerHTML = '';

    allSentences.forEach((s, rowIndex) => {
        const row = document.createElement('tr');

        // Инициализируем состояние выбора если его нет
        if (s.selection_state === undefined) {
            // При первой загрузке: если есть предвыбор, используем его, иначе все выбрано
            if (hasPreselection) {
                s.selection_state = selectedSentences.includes(s.key) ? 'checked' : 'unchecked';
            } else {
                // Если нет предвыбора - по умолчанию выбираем только первое предложение (кроме completed)
                const isCompleted = calculateSentenceSelectionState(s) === 'completed';
                if (isCompleted) {
                    s.selection_state = 'completed';
                } else {
                    // Первое предложение (index 0) выбираем, остальные - нет
                    const index = allSentences.indexOf(s);
                    s.selection_state = (index === 0) ? 'checked' : 'unchecked';
                }
            }
        }

        // Обновляем состояние на основе текущего прогресса (но не перезаписываем явно установленное checked)
        const calculatedState = calculateSentenceSelectionState(s);
        if (calculatedState === 'completed') {
            s.selection_state = 'completed';
        } else if (s.selection_state !== 'checked' && s.selection_state !== 'unchecked') {
            // Если состояние не было явно установлено, используем вычисленное
            s.selection_state = calculatedState;
        }

        // Синхронизируем с selectedSentences
        updateSentenceSelectionState(s);

        // Добавляем в обновленный список все предложения (checked и completed)
        // unchecked тоже остаются в списке для навигации
        if (s.selection_state === 'checked' || s.selection_state === 'completed' || s.selection_state === 'unchecked') {
            updatedSelection.push(s.key);
        }

        // ИСПРАВЛЕНО: Убрано суммирование с circle_number_of_* - эти поля больше не используются
        const totalPerfect = Number(s.number_of_perfect) || 0;
        const totalCorrected = Number(s.number_of_corrected) || 0;
        const totalAudio = Number(s.number_of_audio) || 0;

        // Пустая ячейка для выравнивания с заголовком настроек
        const settingsCell = document.createElement('td');
        settingsCell.className = 'audio-settings-header-cell';
        settingsCell.style.width = '40px';

        // Колонка номера строки (позиция из БД) - ПЕРВАЯ
        const rowNumberCell = document.createElement('td');
        let rowNumber = NaN;
        const posRaw = (s && s.position !== undefined && s.position !== null) ? Number(s.position) : NaN;
        if (Number.isFinite(posRaw) && posRaw > 0) {
            rowNumber = posRaw;
        } else {
            rowNumber = Number(rowIndex) + 1;
        }
        rowNumberCell.textContent = isFinite(rowNumber) ? rowNumber : '';
        rowNumberCell.className = 'sentence-number-cell';

        // Колонка выбора
        const selectCell = document.createElement('td');
        const statusBtn = document.createElement('button');
        renderSelectionStateButton(statusBtn, s, row);
        selectCell.appendChild(statusBtn);

        // Колонка кода (скрытая)
        const codeCell = document.createElement('td');
        codeCell.className = 'hidden-column';
        codeCell.textContent = s.key;
        codeCell.style.fontFamily = 'monospace';
        codeCell.style.fontSize = '12px';

        const perfectCell = document.createElement('td');
        perfectCell.className = 'sentence-progress-cell sentence-star-perfect';
        const perfectColor = totalPerfect > 0 ? 'var(--color-button-mint)' : 'var(--color-button-gray)';
        perfectCell.innerHTML = `<i data-lucide="star" style="color:${perfectColor};"></i>`;

        const correctedCell = document.createElement('td');
        correctedCell.className = 'sentence-progress-cell sentence-star-corrected';
        const correctedColor = totalCorrected > 0 ? 'var(--color-button-lightgreen)' : 'var(--color-button-gray)';
        const correctedText = totalCorrected > 0 ? `<span>${totalCorrected}</span>` : '';
        correctedCell.innerHTML = `<i data-lucide="star-half" style="color:${correctedColor};"></i>${correctedText}`;

        const audioCell = document.createElement('td');
        audioCell.className = 'sentence-progress-cell sentence-microphone';
        // Ячейка будет обновлена через updateTableRowStatus, здесь только создаем
        audioCell.innerHTML = '';

        const attemptsCell = document.createElement('td');
        attemptsCell.className = 'sentence-progress-cell sentence-attempts';
        const attemptsTotal = Number(s.attempts_total) || 0;
        const failedChecks = Number(s.error_count) || 0;
        attemptsCell.textContent = (attemptsTotal > 0 || failedChecks > 0) ? `${attemptsTotal}/${failedChecks}` : '';

        // Предложение (оригинал/перевод)
        const tdText = document.createElement('td');
        tdText.textContent = s.text;

        row.appendChild(settingsCell);
        row.appendChild(rowNumberCell);  // Номер строки ПЕРВЫМ
        row.appendChild(selectCell);
        row.appendChild(codeCell);
        row.appendChild(perfectCell);
        row.appendChild(correctedCell);
        row.appendChild(audioCell);
        row.appendChild(attemptsCell);
        row.appendChild(tdText);

        tableSentences.appendChild(row);

        // КРИТИЧНО: Инициализируем иконки Lucide сразу после добавления строки
        // Это гарантирует, что иконка звезды будет видна
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            // Инициализируем иконки только для этой строки
            const perfectIcon = perfectCell.querySelector('i[data-lucide="star"]');
            if (perfectIcon) {
                window.lucide.createIcons();
            }
        }

        // Обновляем статус строки сразу после создания (чтобы правильно отобразить прогресс)
        updateTableRowStatus(s);
    });

    // Обновляем selectedSentences - все предложения остаются в списке
    // Просто синхронизируем порядок и добавляем новые, если есть
    selectedSentences = Array.from(new Set(updatedSelection));

    // Убеждаемся, что все предложения из allSentences есть в selectedSentences
    allSentences.forEach(s => {
        if (!selectedSentences.includes(s.key)) {
            selectedSentences.push(s.key);
        }
    });

    // Если после рендеринга selectedSentences пустой, но есть checked предложения - исправляем
    if (selectedSentences.length === 0) {
        allSentences.forEach(s => {
            if (s.selection_state === 'checked') {
                selectedSentences.push(s.key);
            }
        });
    }

    // Убеждаемся что selectedSentences не пустой после рендеринга
    if (selectedSentences.length === 0 && allSentences.length > 0) {
        // Если ничего не выбрано, но есть предложения - выбираем все не-completed
        allSentences.forEach(s => {
            if (s.selection_state !== 'completed') {
                s.selection_state = 'checked';
                selectedSentences.push(s.key);
            }
        });
    }

    console.log('[renderSelectionTable] selectedSentences после рендеринга:', selectedSentences.length, selectedSentences);

    if (!tableSentences.dataset.listenerAttached) {
        tableSentences.addEventListener('click', handleSentenceTableClick);
        tableSentences.dataset.listenerAttached = 'true';
    }

    // Рендер таблицы часто означает, что изменился выбор/прогресс.
    // Сохраняем черновик локально (debounce).
    scheduleDraftAutosave('renderSelectionTable');

    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }

    initializeAllCheckbox();
    updateAllCheckboxState();
    initializeMixControl();
    initializeResetProgressButton();

    // Start local Whisper preload only after the selection table is rendered (modal content visible).
    // This avoids slowing down initial table load/render.
    try {
        if (!whisperPreloadAfterTableDone) {
            whisperPreloadAfterTableDone = true;
            window.setTimeout(() => {
                try {
                    preloadWhisperModelIfNeeded('after_selection_table', whisperWasLocalOnBoot).catch(() => { });
                } catch (e) {
                }
            }, 0);
        }
    } catch (e) {
    }
}

function handleSentenceTableClick(e) {
    const statusBtn = e.target.closest('.sentence-check');
    if (!statusBtn) return;

    const key = statusBtn.dataset.key;
    const s = makeByKeyMap(allSentences).get(key);
    if (!s) return;

    // Нельзя изменить состояние completed
    if (s.selection_state === 'completed' || statusBtn.dataset.checked === 'star') {
        return;
    }

    // Переключаем состояние между checked и unchecked
    const isCurrentlyChecked = s.selection_state === 'checked';
    s.selection_state = isCurrentlyChecked ? 'unchecked' : 'checked';

    // Обновляем selectedSentences
    updateSentenceSelectionState(s);

    // Перерисовываем кнопку
    const row = statusBtn.closest('tr');
    renderSelectionStateButton(statusBtn, s, row);

    updateAllCheckboxState();
    confirmStartBtn.focus();

    // После изменений выбора предложений — сохраняем черновик локально.
    scheduleDraftAutosave('sentenceSelection');
}

function updateAllCheckboxState() {
    if (!allCheckbox) return;

    const checkboxes = document.querySelectorAll('#sentences-table .sentence-check');
    if (checkboxes.length === 0) return;

    const checkedCount = Array.from(checkboxes).filter(checkbox =>
        checkbox.dataset.checked === 'true'
    ).length;

    const totalCount = checkboxes.length;
    let newState;

    if (checkedCount === 0) {
        newState = 'false'; // все не выбраны
    } else if (checkedCount === totalCount) {
        newState = 'true'; // все выбраны
    } else {
        newState = 'indeterminate'; // разнобой
    }

    // Обновляем состояние и иконку
    allCheckbox.dataset.checked = newState;

    let iconName;
    if (newState === 'true') {
        iconName = 'circle-check-big';
    } else if (newState === 'false') {
        iconName = 'circle';
    } else {
        iconName = 'circle-alert'; // иконка с восклицательным знаком для неопределенного состояния
    }

    allCheckbox.innerHTML = `<i data-lucide="${iconName}"></i>Отметить все`;

    // Обновляем иконки Lucide
    lucide.createIcons();
}

function initializeAllCheckbox() {
    if (!allCheckbox) return;

    if (!allCheckbox.dataset.listenerAttached) {
        allCheckbox.addEventListener('click', function () {
            const currentState = this.dataset.checked;
            const newState = currentState === 'true' ? 'false' : 'true';

            this.dataset.checked = newState;

            document.querySelectorAll('#sentences-table .sentence-check').forEach(checkbox => {
                const key = checkbox.dataset.key;
                const s = makeByKeyMap(allSentences).get(key);
                if (!s) return;

                // НЕ изменяем состояние completed предложений
                if (s.selection_state === 'completed') {
                    return;
                }

                const row = checkbox.closest('tr');

                if (newState === 'true') {
                    s.selection_state = 'checked';
                    updateSentenceSelectionState(s);
                    renderSelectionStateButton(checkbox, s, row);
                } else if (newState === 'false') {
                    s.selection_state = 'unchecked';
                    updateSentenceSelectionState(s);
                    renderSelectionStateButton(checkbox, s, row);
                }
            });

            updateAllCheckboxState();
            confirmStartBtn.focus();
        });
        allCheckbox.dataset.listenerAttached = 'true';
    }

    updateAllCheckboxState();

    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

function initializeMixControl() {
    if (!mixControl) return;

    if (!mixControl.dataset.checked) {
        mixControl.dataset.checked = 'false';
    }

    if (!mixControl.dataset.listenerAttached) {
        mixControl.addEventListener('click', function () {
            const currentState = this.dataset.checked;
            const newState = currentState === 'true' ? 'false' : 'true';

            this.dataset.checked = newState;

            const iconName = newState === 'true' ? 'shuffle' : 'move-right';
            const textName = newState === 'true' ? 'Перемешать предложения' : 'Прямой порядок предложений';
            this.innerHTML = `<i data-lucide="${iconName}"></i>${textName}`;

            if (window.lucide?.createIcons) {
                lucide.createIcons();
            }
        });
        mixControl.dataset.listenerAttached = 'true';
    }

    const iconName = mixControl.dataset.checked === 'true' ? 'shuffle' : 'move-right';
    const textName = mixControl.dataset.checked === 'true' ? 'Перемешать предложения' : 'Прямой порядок предложений';
    mixControl.innerHTML = `<i data-lucide="${iconName}"></i>${textName}`;

    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

function initializeResetProgressButton() {
    resetProgressBtn = document.getElementById('resetProgressBtn');
    if (!resetProgressBtn) return;
    if (resetProgressBtn.dataset.listenerAttached) return;

    resetProgressBtn.addEventListener('click', () => {
        resetDictationProgress();
    });
    resetProgressBtn.dataset.listenerAttached = 'true';
}

/**
 * Очищает черновик (теперь только на сервере, localStorage больше не используется)
 */
function clearLocalStorageDraft() {
    // Функция оставлена для совместимости, но localStorage больше не используется
    // Черновики хранятся только на сервере
    if (!currentDictation.id) return;
    // Можно удалить черновик на сервере, если нужно
    // Но обычно это делается через deleteResumeState в других местах
}

function resetDictationProgress() {
    allSentences.forEach(s => {
        s.number_of_perfect = 0;
        s.number_of_corrected = 0;
        s.number_of_audio = 0;
        s.attempts_total = 0;
        s.error_count = 0;
        // ИСПРАВЛЕНО: Убраны поля circle_number_of_* - они больше не используются
        // Сбрасываем состояние выбора - все становятся checked (кроме completed, но их не будет после сброса)
        s.selection_state = 'checked';
    });

    number_of_perfect = 0;
    number_of_corrected = 0;
    number_of_audio = 0;
    circle_number = 0;

    // Очищаем localStorage черновика
    clearLocalStorageDraft();

    // Все предложения выбраны после сброса
    selectedSentences = allSentences.map(s => s.key);

    const panel = getProgressPanelInstance();
    if (panel) {
        panel.setStat('perfect', 0);
        panel.setStat('corrected', 0);
        panel.setStat('audio', 0);
    }

    if (dictationStatistics && dictationStatistics.currentSession) {
        dictationStatistics.currentSession.perfect = 0;
        dictationStatistics.currentSession.corrected = 0;
        dictationStatistics.currentSession.audio = 0;
    }

    renderSelectionTable();
    updateStats();
    updateErrorCountLabel(0);
    showSaveToast('Прогресс по предложениям очищен.');
}

/**
 * Обновляет статус конкретной строки в таблице предложений по ключу
 * @param {string} containerId - ID контейнера таблицы
 * @param {string} key - Ключ предложения для обновления
 */
function getUnavailable(s = currentSentence) {
    // закончена ли работа над текущим предложением
    // Должны набрать REQUIRED_PASSED_COUNT + 1
    if (!s) return false;
    // ИСПРАВЛЕНО: Убрано использование circle_number_of_perfect
    const number_of_perfect = Number(s.number_of_perfect) || 0;
    const number_of_audio = Number(s.number_of_audio) || 0;
    // Предложение выполнено, если есть perfect И все аудио выполнены
    const sum = number_of_perfect - 1 + number_of_audio;
    return sum === REQUIRED_PASSED_COUNT;
}

function getRemainingAudio(s) {
    const remaining = (REQUIRED_PASSED_COUNT - (Number(s.number_of_audio) || 0));
    return remaining > 0 ? remaining : 0;
}

function getRemainingAllResult(s) {
    const totalPerfect = Number(s.number_of_perfect) || 0;
    const totalCorrected = Number(s.number_of_corrected) || 0;
    const totalAudio = Number(s.number_of_audio) || 0;
    return {
        totalPerfect,
        totalCorrected,
        totalAudio
    };
}

function updateTableRowStatus(s) {
    // Находим строку с нужным ключом
    const row = tableSentences.querySelector(`tr button[data-key="${s.key}"]`)?.closest('tr');
    if (!row) return;

    // Обновляем состояние предложения на основе прогресса
    updateSentenceSelectionState(s, true);

    // Перерисовываем кнопку состояния
    const statusIcon = row.querySelector('.sentence-check');
    if (statusIcon) {
        renderSelectionStateButton(statusIcon, s, row);
    }

    // Порядок колонок в таблице (ОБНОВЛЕНО):
    // 1. settingsCell (audio-settings-header-cell)
    // 2. Номер строки (sentence-number-cell)
    // 3. Выбор/чекбокс
    // 4. Код (hidden-column)
    // 5. Звезда (perfect)
    // 6. Полузвезда (corrected)
    // 7. Микрофон (audio)
    // 8. Попытки (attempts)
    // 9. Предложение
    // Используем классы для надежного поиска колонок
    const starCell = row.querySelector('td.sentence-star-perfect');
    const halfStarCell = row.querySelector('td.sentence-star-corrected');
    const micCell = row.querySelector('td.sentence-microphone');
    const attemptsCell = row.querySelector('td.sentence-attempts');

    const totalPerfect = Number(s.number_of_perfect) || 0;
    const totalCorrected = Number(s.number_of_corrected) || 0;
    const totalAudio = Number(s.number_of_audio) || 0;
    const remainingAudio = getRemainingAudio(s);
    const unavailable = getUnavailable(s);

    if (starCell) {
        const perfectColor = totalPerfect > 0 ? 'var(--color-button-mint)' : 'var(--color-button-gray)';
        starCell.innerHTML = `<i data-lucide="star" style="color:${perfectColor};"></i>`;
    }
    if (halfStarCell) {
        const correctedColor = totalCorrected > 0 ? 'var(--color-button-lightgreen)' : 'var(--color-button-gray)';
        const correctedText = totalCorrected > 0 ? `<span>${totalCorrected}</span>` : '';
        halfStarCell.innerHTML = `<i data-lucide="star-half" style="color:${correctedColor};"></i>${correctedText}`;
    }
    if (micCell) {
        const iconColor = totalAudio > 0 ? 'var(--color-button-purple)' : 'var(--color-button-gray)';
        const micIcon = totalAudio > 0 ? 'mic-off' : 'mic';
        const micCount = totalAudio > 0 ? `<span>${totalAudio}</span>` : '';
        micCell.innerHTML = `<i data-lucide="${micIcon}" style="color:${iconColor};"></i>${micCount}`;
    }

    if (attemptsCell) {
        const attemptsTotal = Number(s.attempts_total) || 0;
        const failedChecks = Number(s.error_count) || 0;
        attemptsCell.textContent = (attemptsTotal > 0 || failedChecks > 0) ? `${attemptsTotal}/${failedChecks}` : '';
    }

    // Обновляем состояние строки в зависимости от выполненности предложения
    const completedSentence = unavailable || (totalPerfect > 0 && totalAudio >= REQUIRED_PASSED_COUNT);
    if (completedSentence) {
        row.classList.add('sentence-row-completed');
    } else {
        row.classList.remove('sentence-row-completed');
    }

    // // Обновляем счетчик выбранных
    // updateSelectedCount();

    // Обновляем иконки Lucide
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

// Функция для получения выбранных ID предложений
function getSelectedKeys() {
    const selectedCheckboxes = document.querySelectorAll('#sentences-table input[type="checkbox"]:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(checkbox => {
        const row = checkbox.closest('tr');
        return row ? parseInt(row.dataset.id) : null;
    }).filter(id => id !== null);

    return selectedIds;
}

// ====== 2.3 Подготовка перед нажатием "Начать диктант" ======


// Функция для перемешивания массива (алгоритм Фишера-Йетса)
function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function prepareGameFromTable() {
    // const mix = !!qs("#mixCheckbox")?.checked;
    const mix = mixControl.dataset.checked;

    if (mix === 'true') {
        shuffleInPlace(selectedSentences);
    }

    return selectedSentences;
}


function getSelectedSentences() {
    selectedSentences = [];

    // Собираем выбранные предложения из таблицы (проверяем DOM)
    const checkboxes = document.querySelectorAll('#sentences-table .sentence-check');
    checkboxes.forEach(checkbox => {
        const key = checkbox.dataset.key;
        const state = checkbox.dataset.checked;

        // Добавляем если checked (но не star/completed)
        if (state === 'true' && key) {
            const s = makeByKeyMap(allSentences).get(key);
            if (s && calculateSentenceSelectionState(s) !== 'completed') {
                // Обновляем состояние в объекте предложения
                s.selection_state = 'checked';
                if (!selectedSentences.includes(key)) {
                    selectedSentences.push(key);
                }
            }
        }
    });

    // Если ничего не выбрано в таблице, но есть предложения с checked состоянием - используем их
    if (selectedSentences.length === 0) {
        allSentences.forEach(s => {
            updateSentenceSelectionState(s, true);
            if (s.selection_state === 'checked') {
                selectedSentences.push(s.key);
            }
        });
    }

    // На всякий случай отфильтруем completed, чтобы не стартовать с ними по умолчанию
    const byKeyMap = makeByKeyMap(allSentences);
    selectedSentences = selectedSentences.filter(key => {
        const sentence = byKeyMap.get(key);
        return sentence && calculateSentenceSelectionState(sentence) === 'checked';
    });

    console.log('[getSelectedSentences] Выбрано предложений:', selectedSentences.length, selectedSentences);
}

// 
async function swDictationRequest(action, payload = {}) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        throw new Error('Service Worker не активен');
    }

    try {
        setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
    } catch (e) {
    }

    const requestId = `dictation_${action}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Number(payload.timeoutMs) || 15000;

    return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            const data = event.data || {};
            if (data.requestId && data.requestId !== requestId) {
                reject(new Error('bad_request_id'));
                return;
            }
            if (data.success) {
                try {
                    setSwStatus(`SW: ${String(action)} ok`);
                } catch (e) {
                }
                resolve(data.result);
            } else {
                try {
                    setSwStatus(`SW: ${String(action)} error`);
                } catch (e) {
                }
                reject(new Error(data.error || 'sw_request_failed'));
            }
        };

        try {
            navigator.serviceWorker.controller.postMessage({ action, requestId, ...payload }, [channel.port2]);
        } catch (e) {
            clearTimeout(timer);
            try {
                setSwStatus(`SW: ${String(action)} error`);
            } catch (e2) {
            }
            reject(e);
        }
    });
}

async function checkDictationAudioCachedOrThrow(sentenceKeys) {
    // все аудио должны быть из кеша
    const keys = Array.isArray(sentenceKeys) ? sentenceKeys : [];
    const byKey = makeByKeyMap(allSentences);
    const urls = [];
    const resolveAudioToUrl = (rawValue, lang) => {
        try {
            const v = String(rawValue || '').trim();
            if (!v) return null;
            if (v.startsWith('blob:')) return v;
            if (v.startsWith('/api/')) return normalizeDictationMediaUrl(v);
            if (v.startsWith('http://') || v.startsWith('https://')) return normalizeDictationMediaUrl(v);
            const dictId = String(currentDictation && currentDictation.id ? currentDictation.id : '').trim();
            if (!dictId || !lang) return null;
            const name = v.split('?', 1)[0].split('/').pop();
            if (!name) return null;
            return normalizeDictationMediaUrl(`/api/dictations/${encodeURIComponent(dictId)}/${encodeURIComponent(String(lang))}/${encodeURIComponent(name)}`);
        } catch (e) {
            return null;
        }
    };
    const audioFields = ['audio', 'audio_a', 'audio_f', 'audio_m', 'audio_tr'];
    for (const key of keys) {
        const s = byKey.get(key);
        if (!s) continue;
        for (const f of audioFields) {
            const u = s[f];
            const lang = (f === 'audio_tr') ? (currentDictation && currentDictation.language_translation) : (currentDictation && currentDictation.language_original);
            const fullUrl = resolveAudioToUrl(u, lang);
            if (fullUrl) urls.push(fullUrl);
        }
    }
    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
    if (!uniqueUrls.length) return;

    const res = await swDictationRequest('checkCached', { urls: uniqueUrls, timeoutMs: 20000 });
    if (res && res.ok === true) return;

    const missing = (res && Array.isArray(res.missing)) ? res.missing : [];
    if (missing.length > 0) {
        try {
            await swDictationRequest('prefetchStrict', { urls: missing, timeoutMs: 180000 });
        } catch (e) {
        }

        const res2 = await swDictationRequest('checkCached', { urls: uniqueUrls, timeoutMs: 20000 });
        if (res2 && res2.ok === true) return;

        const missingCount2 = res2 && Array.isArray(res2.missing) ? res2.missing.length : null;
        const suffix2 = (missingCount2 !== null) ? ` (не найдено: ${missingCount2})` : '';
        throw new Error(`audio_not_cached${suffix2}`);
    }

    const missingCount = res && Array.isArray(res.missing) ? res.missing.length : null;
    const suffix = (missingCount !== null) ? ` (не найдено: ${missingCount})` : '';
    throw new Error(`audio_not_cached${suffix}`);
}

function startGame(isResume = false) {
    // ИСПРАВЛЕНО: Если isResume не передан явно, проверяем глобальный флаг hasDraftLoaded
    // Это позволяет правильно определить, является ли это продолжением черновика
    if (isResume === false && hasDraftLoaded) {
        isResume = true;
        console.log('[startGame] Определено продолжение черновика по флагу hasDraftLoaded');
    }

    // наступне коло (якщо початок тут буде 0+1)
    // Если это продолжение черновика, не увеличиваем круг
    if (!isResume) {
        circle_number++;

        // При новом круге создаем файл черновика заново (если он был удален при завершении)
        // Это происходит автоматически при первом сохранении черновика
    }

    // ИСПРАВЛЕНО: Убрана логика обнуления прогресса - прогресс уже загружен из черновика или инициализирован
    // Не нужно обнулять прогресс при старте игры

    // Обновляем номер сессии в статистике
    const panel = getProgressPanelInstance();
    if (panel) {
        panel.setStat('circleNumber', circle_number);
    }

    // Убрано поле number из статистики - оно больше не используется

    maxIndTablo = (selectedSentences.length < MAXVISIBLE) ? (selectedSentences.length - 1) : (MAXVISIBLE - 1);

    const sequences = getPlaySequenceValues();
    playSequenceStart = sequences.start;
    playSequenceTypo = sequences.typo;
    playSequenceSuccess = sequences.success;

    // Обновляем REQUIRED_PASSED_COUNT из панели настроек или поля ввода
    if (audioSettingsPanel && audioSettingsPanel.isInitialized) {
        const settings = audioSettingsPanel.getSettings();
        REQUIRED_PASSED_COUNT = (settings.repeats !== undefined && settings.repeats !== null) ? settings.repeats : 3;
        if (settings.required_passed_star_half !== undefined && settings.required_passed_star_half !== null) {
            REQUIRED_PASSED_STAR_HALF = settings.required_passed_star_half;
        }
    } else {
        const audioRepeatsInput = document.getElementById('audioRepeatsInput');
        if (audioRepeatsInput) {
            const value = parseInt(audioRepeatsInput.value, 10);
            if (!isNaN(value) && value >= 0 && value <= 9) {
                REQUIRED_PASSED_COUNT = value;
            }
        }
    }

    // Валидируем настройки нагрузки: нельзя выключить и текст, и аудио одновременно
    // (если repeats=0 и without_entering_text=true, пользователь вообще ничего не сможет делать)
    try {
        const hasAudio = Number(REQUIRED_PASSED_COUNT) > 0;
        const withoutEnteringText = audioSettingsPanel && audioSettingsPanel.isInitialized
            ? Boolean(audioSettingsPanel.getSettings().without_entering_text)
            : Boolean(window.audioSettingsWithoutEnteringText || false);
        const hasText = !withoutEnteringText;
        if (!hasText && !hasAudio) {
            showNoSelectionModal('В настройках выключены и текст, и аудио. Включите хотя бы одно упражнение.');
            return;
        }
    } catch (e) {
        console.warn('[startGame] settings validation failed', e);
    }

    // выбрать из таблицы ключи отмеченных предложений по порядку
    getSelectedSentences();

    // Если ничего не выбрано, проверяем еще раз и показываем более информативное сообщение
    if (!selectedSentences.length) {
        // Попробуем собрать из DOM еще раз
        const checkboxes = document.querySelectorAll('#sentences-table .sentence-check[data-checked="true"]');
        if (checkboxes.length > 0) {
            selectedSentences = Array.from(checkboxes).map(cb => cb.dataset.key).filter(Boolean);
            console.log('[startGame] Найдено выбранных предложений в DOM:', selectedSentences.length);
        }

        if (!selectedSentences.length) {
            // Проверяем DOM напрямую для более надежной проверки
            const completedCheckboxes = document.querySelectorAll('#sentences-table .sentence-check[data-checked="star"]');
            const checkedCheckboxes = document.querySelectorAll('#sentences-table .sentence-check[data-checked="true"]');

            const hasAnyCompleted = completedCheckboxes.length > 0;
            const hasAnyChecked = checkedCheckboxes.length > 0;

            // Если есть completed предложения (звезды), но нет checked (галочек) - показываем сообщение
            const noSelectionMessage = (hasAnyCompleted && !hasAnyChecked)
                ? 'Ни одно предложение не выбрано для диктанта'
                : null;
            showNoSelectionModal(noSelectionMessage);
            return;
        }
    }

    // все аудио должны быть из кеша
    // Проверяем, что все аудио для выбранных предложений уже в кеше.
    // Если чего-то нет, игру не начинаем (и не пытаемся ничего качать).
    let isOffline = false;
    try {
        isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
    } catch (e) {
    }

    if (isOffline) {
        (async () => {
            try {
                await checkDictationAudioCachedOrThrow(selectedSentences);
            } catch (e) {
                console.warn('[startGame] audio cache check failed (offline)', e);
                showNoSelectionModal('Аудио не загружено в кеш. Перезагрузите диктант и дождитесь загрузки.');
                return;
            }

            // continue original startGame flow
            try {
                startGameAfterCacheCheck(isResume);
            } catch (e2) {
                console.error('[startGame] startGameAfterCacheCheck failed', e2);
            }
        })();
        return;
    }

    // Online: start immediately; cache check/prefetch is best-effort and should not block the flow.
    try {
        startGameAfterCacheCheck(isResume);
    } catch (e2) {
        console.error('[startGame] startGameAfterCacheCheck failed', e2);
    }

    (async () => {
        try {
            await checkDictationAudioCachedOrThrow(selectedSentences);
        } catch (e) {
            console.warn('[startGame] audio cache check failed (online, ignored)', e);
        }
    })();
}

function startGameAfterCacheCheck(isResume = false) {

    // ИСПРАВЛЕНО: Убрана логика обнуления прогресса при circle_number === 1
    // Прогресс уже загружен из черновика (если он есть) или инициализирован при загрузке предложений
    // Не нужно обнулять прогресс - он должен сохраняться
    // якщо треба перемішати речення
    prepareGameFromTable();

    // Проставим служебные поля в allSentences
    const byKey = makeByKeyMap(allSentences);
    selectedSentences.forEach((key, idx) => {
        const s = byKey.get(key);
        if (!s) return;
        s.serial_number = idx + 1;  // позиция в текущем списке (рисуем это число на кнопке)
    });

    initTabloSentenceCounter();
    showCurrentSentence(0, 0);//функция загрузки предложения
    updateStats();            // показываем полные итоги

    // ВАЖНО: Обновляем видимость аудио-полей после установки currentSentence
    // Это гарантирует, что поля скрываются, если аудио уже выполнено
    refreshAudioUIForCurrentSentence();

    applyStatusNewCircle(); // кнопка новий цикл знов прозора 

    // закриваэмо модалку
    startModal.style.display = 'none';

    // запускаємо годинник в останню чергу
    gameHasAlreadyBegun = true;

    // Запускаем таймер бездействия после начала игры
    resetInactivityTimer();

    if (thisNewGame) {
        document.querySelectorAll('#sentences-table td').forEach(td => {
            if (td.style.display === 'none') {
                td.style.display = 'table-cell';
            }
        });
        thisNewGame = false;
    }


    startTimer();

    // // таймер бездействия активируем
    // resetInactivityTimer();

}


// 1) Считать JSON из <script id="sentences-data">
function loadSentencesFromJSON() {
    const el = document.getElementById('sentences-data');
    if (!el) return [];
    try {
        const raw = (el.textContent || '').trim();
        const data = JSON.parse(raw || '[]');
        // поддержим оба варианта: массив или объект с полем sentences
        return Array.isArray(data) ? data : (Array.isArray(data.sentences) ? data.sentences : []);
    } catch (e) {
        console.error('Не удалось распарсить sentences-data:', e);
        return [];
    }
}





// --- Один пользовательский плеер для кнопки #userPlay -----------------------------------------------
function ensureUserPlayButton() {
    const btn = document.getElementById('userPlay');
    if (!btn || userPlayInited) return;

    // изначально заблокирована — пока нет записи
    btn.disabled = true;

    btn.addEventListener('click', () => {
        if (!userAudioElement) return;
        if (userAudioElement.paused) {
            userAudioElement.play().catch(console.error);
        } else {
            userAudioElement.pause();
        }
    });

    userPlayInited = true;
}

function setUserAudioBlob(blob) {
    const btn = document.getElementById('userPlay');
    if (!blob || !btn) return;

    // 1. Сначала очищаем старый аудиоэлемент
    if (userAudioElement) {
        try {
            userAudioElement.pause();
            userAudioElement.src = ''; // очищаем источник
        } catch { }
    }

    // 2. Отзываем старый URL (если он есть)
    if (userAudioObjectUrl) {
        URL.revokeObjectURL(userAudioObjectUrl);
        userAudioObjectUrl = null;
    }

    // 3. Создаем новый URL из Blob
    userAudioObjectUrl = URL.createObjectURL(blob);

    // 4. Создаем новый аудиоэлемент если нужно
    if (!userAudioElement) {
        userAudioElement = new Audio();
        userAudioElement.preload = 'metadata';
    }

    // 5. Устанавливаем новый источник
    if (userAudioObjectUrl) {
        userAudioElement.src = userAudioObjectUrl;
    } else {
        console.log("Blob URL не доступен");
        userAudioElement.src = '';
    }

    btn.disabled = false;
}

function clearUserAudio() {
    const btn = document.getElementById('userPlay');
    if (userAudioElement) {
        try {
            userAudioElement.pause();
            userAudioElement.src = '';
        } catch { }
    }

    if (userAudioObjectUrl) {
        URL.revokeObjectURL(userAudioObjectUrl);
        userAudioObjectUrl = null;
    }
    if (btn) btn.disabled = true;
}

// Показ/скрытие UI по remainingAudio текущего предложения
function refreshAudioUIForCurrentSentence() {
    const R = Number(REQUIRED_PASSED_COUNT ?? 0);

    const recordBtn = document.getElementById('recordButton');
    const percentWrap = document.getElementById('count_percent')?.parentElement; // stat-btn c процентом
    const visual = document.getElementById('audioVisualizer');
    const playBtn = document.getElementById('userPlay');

    // Если аудиоконтроль вообще не нужен
    if (R === 0) {
        if (recordBtn) { recordBtn.disabled = true; recordBtn.classList.add('disabled'); }
        if (percentWrap) percentWrap.style.display = 'none';
        if (playBtn) playBtn.style.display = 'none';

        if (visual) {
            try { if (typeof stopVisualization === 'function') stopVisualization(); } catch { }
            const ctx = visual.getContext && visual.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, visual.width, visual.height);
            visual.hidden = true; // ← прячем жёстко
        }
        return;
    } else {
        // Остаток попыток
        const remainingAudio = getRemainingAudio(currentSentence);
        const hasAttempts = remainingAudio > 0;

        // ИСПРАВЛЕНО: Скрываем все элементы аудио, если аудио уже выполнено
        const recordingIndicator = document.getElementById('recordingIndicator');
        const countPercent = document.getElementById('count_percent');

        // Кнопка записи: скрываем полностью, если нет попыток
        if (recordBtn) {
            if (hasAttempts) {
                recordBtn.style.display = '';
                recordBtn.disabled = false;
                recordBtn.classList.remove('disabled');
            } else {
                recordBtn.style.display = 'none';
                recordBtn.disabled = true;
                recordBtn.classList.add('disabled');
            }
        }

        // Проценты: скрываем полностью
        if (percentWrap) percentWrap.style.display = hasAttempts ? '' : 'none';
        if (countPercent) countPercent.style.display = hasAttempts ? 'block' : 'none';

        // Индикатор записи (кружок):
        // - если попыток нет: полностью скрываем
        // - если попытки есть: место резервируем, но сам кружок скрываем (visibility)
        if (recordingIndicator) {
            if (!hasAttempts) {
                recordingIndicator.style.display = '';
                recordingIndicator.style.visibility = 'hidden';
                recordingIndicator.style.opacity = '0';
            } else {
                recordingIndicator.style.display = '';
                recordingIndicator.style.visibility = isRecording ? 'visible' : 'hidden';
                recordingIndicator.style.opacity = isRecording ? '1' : '0';
            }
        }

        // Кнопка воспроизведения: скрываем
        if (playBtn) playBtn.style.display = hasAttempts ? '' : 'none';

        // Эквалайзер: скрываем
        if (visual) {
            if (remainingAudio > 0) {
                visual.hidden = false;
                visual.style.display = '';
            } else {
                try { if (typeof stopVisualization === 'function') stopVisualization(); } catch { }
                const ctx = visual.getContext && visual.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, visual.width, visual.height);
                visual.hidden = true;
                visual.style.display = 'none';
            }
        }

        // Обновить «микрофоны/галочки»
        renderUserAudioTablo();

    }

}

/**
 * Пересчитывает доступность кнопок записи для всех предложений при изменении REQUIRED_PASSED_COUNT
 * Обновляет статусы completed и перерисовывает таблицу предложений
 */
function recalculateAudioAvailabilityForAllSentences() {
    if (!allSentences || allSentences.length === 0) return;

    // Пересчитываем статусы для всех предложений
    allSentences.forEach(s => {
        const totalAudio = Number(s.number_of_audio) || 0;
        const totalPerfect = Number(s.number_of_perfect) || 0;
        const totalCorrected = Number(s.number_of_corrected) || 0;
        const unavailable = getUnavailable(s);

        // Обновляем флаг all_audio_completed
        s.all_audio_completed = totalAudio >= REQUIRED_PASSED_COUNT;

        // Обновляем состояние выбора (может стать completed или вернуться к checked)
        const wasCompleted = s.selection_state === 'completed';
        const isNowCompleted = unavailable || (totalPerfect > 0 && totalAudio >= REQUIRED_PASSED_COUNT);

        if (isNowCompleted && !wasCompleted) {
            // Предложение стало completed
            s.selection_state = 'completed';
        } else if (!isNowCompleted && wasCompleted) {
            // Предложение больше не completed (например, уменьшили REQUIRED_PASSED_COUNT)
            // Но если есть прогресс, оставляем checked
            if (totalPerfect > 0 || totalAudio > 0 || totalCorrected > 0) {
                s.selection_state = 'checked';
            } else {
                s.selection_state = 'unchecked';
            }
        }

        // Обновляем ТОЛЬКО кнопку состояния (чекбокс), не трогая звезды, полузвезды и микрофон
        // НЕ меняем состояние выбора, если оно было явно установлено пользователем
        const row = tableSentences.querySelector(`tr button[data-key="${s.key}"]`)?.closest('tr');
        if (row) {
            // Сохраняем текущее состояние перед пересчетом
            const previousState = s.selection_state;

            // Обновляем состояние только если:
            // 1. Предложение стало completed (нужно показать звезду)
            // 2. Предложение перестало быть completed (нужно убрать звезду)
            // НЕ меняем состояние, если оно было unchecked или checked (явно установлено пользователем)
            // и не произошло перехода в/из completed
            if (isNowCompleted && !wasCompleted) {
                // Предложение стало completed - обновляем состояние
                s.selection_state = 'completed';
                updateSentenceSelectionState(s, false); // false - не пересчитывать, использовать установленное
            } else if (!isNowCompleted && wasCompleted) {
                // Предложение перестало быть completed - обновляем состояние
                if (totalPerfect > 0 || totalAudio > 0 || totalCorrected > 0) {
                    s.selection_state = 'checked';
                } else {
                    s.selection_state = 'unchecked';
                }
                updateSentenceSelectionState(s, false); // false - не пересчитывать, использовать установленное
            }
            // Если состояние не менялось (не было перехода в/из completed), НЕ трогаем его

            // Обновляем отображение кнопки состояния
            const statusIcon = row.querySelector('.sentence-check');
            if (statusIcon) {
                renderSelectionStateButton(statusIcon, s, row);
            }

            // Обновляем класс completed строки, но НЕ трогаем ячейки со звездами и микрофоном
            const completedSentence = unavailable || (totalPerfect > 0 && totalAudio >= REQUIRED_PASSED_COUNT);
            if (completedSentence) {
                row.classList.add('sentence-row-completed');
            } else {
                row.classList.remove('sentence-row-completed');
            }
        }
    });

    // Если текущее предложение активно, обновляем его UI
    if (currentSentence) {
        refreshAudioUIForCurrentSentence();
    }

    // Обновляем иконки Lucide
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

// --- helpers: «Звезда / Полузвезда / Микрофоны» -----------------------------------------------
function renderResultTablo() {
    const tablo_result = document.getElementById('tablo_result');
    const tablo_result_star = document.getElementById('tablo_result_star');
    const tablo_result_star_half = document.getElementById('tablo_result_star_half');
    const tablo_result_mic = document.getElementById('tablo_result_mic');



    const { totalPerfect, totalCorrected, totalAudio } = getRemainingAllResult(currentSentence);
    // Проверяем, есть ли хотя бы одна иконка
    const hasAnyIcon = totalPerfect > 0 || totalCorrected > 0 || totalAudio > 0;
    
    // Показываем/скрываем весь блок в зависимости от наличия иконок
    if (hasAnyIcon) {
        tablo_result.classList.add('visible');
    } else {
        tablo_result.classList.remove('visible');
    }

    // Если R==0 — сам блок скроется в updateAudioPanelVisibility()   
    if (totalPerfect === 0) {
        tablo_result_star.innerHTML = '';
    } else if (totalPerfect === 1) {
        tablo_result_star.innerHTML = '<i data-lucide="star"></i>';
    }

    const parts_star_half = [];
    for (let i = 0; i < totalCorrected; i++) parts_star_half.push('<i data-lucide="star-half"></i>');
    tablo_result_star_half.innerHTML = parts_star_half.join('');

    const parts_mic = [];
    for (let i = 0; i < totalAudio; i++) parts_mic.push('<i data-lucide="mic-off"></i>');
    tablo_result_mic.innerHTML = parts_mic.join('');

    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

// --- helpers: «Микрофоны/галочки» в #userAudioTablo по RemainingAudio -----------------------------------------------
function renderUserAudioTablo() {
    const tablo = document.getElementById('userAudioTablo');
    if (!tablo) return;

    const R = Math.max(0, Math.min(9, REQUIRED_PASSED_COUNT));
    const c = getRemainingAudio(currentSentence);

    // Если R==0 — сам блок скроется в updateAudioPanelVisibility()   
    if (R === 0) {
        tablo.innerHTML = '';
        return;
    }

    const parts = [];
    for (let i = 0; i < c; i++) parts.push('<i data-lucide="mic"></i>');
    for (let i = 0; i < (R - c); i++) parts.push('<i data-lucide="mic-off"></i>');

    tablo.innerHTML = parts.join('');

    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
    renderResultTablo();
}

function updateAudioPanelVisibility() {
    const panel = document.querySelector('.audio-user-panel'); // внешний контейнер
    const group = document.querySelector('.grupp-audio');      // кнопка записи
    const visual = document.getElementById('audioVisualizer');
    const percent = document.getElementById('count_percent');
    const answer = document.getElementById('userAudioAnswer');

    const R = Number(REQUIRED_PASSED_COUNT ?? 0);

    // Проверяем, все ли аудио выполнены для текущего предложения
    const allAudioCompleted = currentSentence && currentSentence.all_audio_completed;

    const hide = (el) => { if (el) el.style.display = 'none'; };
    const show = (el) => { if (el) el.style.display = ''; };

    // Если все аудио выполнены, скрываем панель аудио
    if (allAudioCompleted && R > 0) {
        hide(panel);
        hide(group);
        hide(visual);
        hide(percent?.parentElement || percent);
        hide(answer);
        return;
    }

    const percentEl = getCountPercentEl();
    if (percentEl && (percentEl.textContent == null || String(percentEl.textContent).trim() === '')) {
        percentEl.textContent = 0;
    }

    if (R === 0) {
        // Полное скрытие всего аудио-функционала
        hide(panel);
        hide(group);
        hide(visual);
        hide(percent?.parentElement || percent);
        hide(answer);
    } else {
        show(panel);
        show(group);
        show(visual);
        show(percent?.parentElement || percent);
        show(answer);
    }
}


// --- helpers: лямбда-версии -----------------------------------------------

const setText = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    let output;
    if (typeof val === 'number') {
        output = Number.isFinite(val) ? val : 0;
    } else {
        const parsed = Number(val);
        output = Number.isFinite(parsed) ? parsed : val;
        if (typeof output === 'string' && output.trim().toLowerCase() === 'nan') {
            output = 0;
        }
    }
    el.textContent = output;
};

// ИСПРАВЛЕНО: Функция sumRez больше не нужна, так как логика "circle" удалена
// Оставлена для обратной совместимости, но всегда возвращает 0
function sumRez() {
    // Логика "circle" удалена - эти поля больше не используются
    return {
        circle_number_of_perfect: 0,
        circle_number_of_corrected: 0
    };
}

function updateStats(circle = null) {
    console.log('[updateStats] updateStats', circle);
    const panel = getProgressPanelInstance();

    // Прогресс/счетчики могли измениться — сохраняем локально (debounce).
    scheduleDraftAutosave('updateStats');

    // Вычисляем итоги напрямую из allSentences (как источник истины)
    let totalPerfect = 0;
    let totalCorrected = 0;
    let totalAudio = 0;

    allSentences.forEach(s => {
        const perfect = Number(s.number_of_perfect) || 0;
        const corrected = Number(s.number_of_corrected) || 0;
        const audio = Number(s.number_of_audio) || 0;

        // Учитываем предложение как perfect, если есть хотя бы один perfect (1 предложение = 1 звезда)
        if (perfect > 0) {
            totalPerfect++;
        }
        // Для полузвёзд (corrected) считаем СУММУ всех попыток с ошибкой по всем предложениям,
        // чтобы итог в шапке был точной суммой колонки внизу.
        if (corrected > 0) {
            totalCorrected += corrected;
            console.log('[updateStats] Предложение', s.key, 'учтено как corrected, perfect=', perfect, 'corrected=', corrected);
        }
        // Аудио уже хранится как счётчик и суммируется по всем предложениям
        totalAudio += audio;
    });

    console.log('[updateStats] Итого: perfect=', totalPerfect, 'corrected=', totalCorrected, 'audio=', totalAudio);

    // Синхронизируем глобальные переменные с вычисленными значениями
    number_of_perfect = totalPerfect;
    number_of_corrected = totalCorrected;
    number_of_audio = totalAudio;

    const totalTotal = allSentences.length;

    // в диктанте
    setText('count-perfect', totalPerfect);
    setText('count-corrected', totalCorrected);
    setText('count-audio', totalAudio);
    setText('count-total', totalTotal);

    // в модалке
    setText('modal-count-perfect', totalPerfect);
    setText('modal-count-corrected', totalCorrected);
    setText('modal-count-audio', totalAudio);
    setText('modal-count-total', totalTotal);

    // Обновляем статистику в новой системе (ProgressPanel)
    if (panel) {
        panel.setStat('perfect', totalPerfect);
        panel.setStat('corrected', totalCorrected);
        panel.setStat('audio', totalAudio);
        panel.setStat('total', totalTotal);
        panel.setStat('circleNumber', circle_number);
    }

    // Обновляем статистику в старой системе (для совместимости)
    if (dictationStatistics) {
        dictationStatistics.updateStats(totalPerfect, totalCorrected, totalAudio, totalTotal);
    }
};

// Убрали переключение между кругами - всегда показываем полные итоги
// Кнопка переключения кругов больше не используется


// --------------- timer ---------------------------------

function startTimer() {
    const panel = getProgressPanelInstance();
    if (panel) {
        panel.startSession();
    }

    if (dictationStatistics && typeof dictationStatistics.startSession === 'function') {
        dictationStatistics.startSession();
    }

    const snapshot = getProgressTimerSnapshot();
    const ms = getTimerDisplayMs(snapshot);

    dictationTimerElement = document.getElementById('timer') || window.dictationTimerElement;
    modalTimerElement = document.getElementById('modal_timer') || window.modalTimerElement;

    if (dictationTimerElement) {
        updateDictationTimerDisplay(ms, dictationTimerElement);
    }

    if (modalTimerElement && startModal.style.display === 'flex') {
        updateDictationTimerDisplay(ms, modalTimerElement);
    }
}

function stopTimer(options) {
    const panel = getProgressPanelInstance();
    if (panel) {
        panel.pauseSession();
    }

    currentInactivityTimeout = INACTIVITY_TIMEOUT_DEFAULT;
    resetInactivityTimer();

    if (dictationStatistics && typeof dictationStatistics.pauseSession === 'function') {
        dictationStatistics.pauseSession();
    }
}


function timeDisplay(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// -------------------------------------------------------LANGUAGE_CODES_URL  getCountryCodeUrl(langCode)
async function loadLanguageCodes() {
    try {
        // Используем LanguageManager для получения country_cod_url
        if (window.LanguageManager && typeof window.LanguageManager.getCountryCodeUrl === 'function' && currentDictation && currentDictation.language_original) {
            langCodeUrl = window.LanguageManager.getCountryCodeUrl(currentDictation.language_original);
        } else {
            // Fallback если LanguageManager не доступен или currentDictation не загружен
            if (currentDictation && currentDictation.language_original) {
                // Пытаемся определить язык по коду языка
                const langCode = currentDictation.language_original.toLowerCase();
                if (langCode.startsWith('en')) {
                    langCodeUrl = 'en-US';
                } else if (langCode.startsWith('ru')) {
                    langCodeUrl = 'ru-RU';
                } else {
                    langCodeUrl = 'en-US'; // По умолчанию английский
                }
            } else {
                langCodeUrl = 'en-US'; // По умолчанию английский
            }
        }

        // Убеждаемся, что langCodeUrl не пустой
        if (!langCodeUrl || langCodeUrl === '') {
            langCodeUrl = 'en-US';
        }

        if (inputField) {
            inputField.setAttribute('lang', langCodeUrl);
            inputField.setAttribute('spellcheck', 'false');
            inputField.setAttribute('autocapitalize', 'off');
            inputField.setAttribute('autocorrect', 'off');
            inputField.setAttribute('inputmode', 'text');
        }

        // const response = await fetch(`/path/to/language/codes/${langCodeUrl}.json`);
        // languageCodes = await response.json();

        // // Используем language_original из загруженных данных
        // const langCode = currentDictation.language_original || 'en-US';
        initSpeechRecognition();
    } catch (error) {
        console.error('Ошибка загрузки языковых кодов:', error);
        // В случае ошибки устанавливаем язык по умолчанию
        langCodeUrl = 'en-US';

        if (inputField) {
            inputField.setAttribute('lang', langCodeUrl);
            inputField.setAttribute('spellcheck', 'false');
            inputField.setAttribute('autocapitalize', 'off');
            inputField.setAttribute('autocorrect', 'off');
            inputField.setAttribute('inputmode', 'text');
        }

        initSpeechRecognition();
    }
}


// ===== Табло кнопок навігації по реченнях ========
function initTabloSentenceCounter() {
    // Блок теперь создан в HTML, только обновляем значения
    // Инициализируем иконки Lucide
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }

    // Сохраняем общее количество выбранных предложений при старте
    totalSelectedSentences = selectedSentences.length;

    // Устанавливаем общее количество предложений один раз при старте
    const btnTotal = document.getElementById("sentenceTotalNumber");
    if (btnTotal && totalSelectedSentences > 0) {
        btnTotal.textContent = `/ ${totalSelectedSentences}`;
    }

    // Обновляем отображение
    updateSimpleSentenceCounter();
}


function applyStatusClass(btn, s, isCurrent = false, preserveNumber = false) {
    btn.className = '';
    btn.classList.value = '';

    // Если нужно сохранить номер (для табло), используем его, иначе serial_number
    const displayNumber = preserveNumber && btn.textContent && !isNaN(parseInt(btn.textContent))
        ? btn.textContent
        : s.serial_number;

    // Устанавливаем только текст (номер), иконки добавим позже
    btn.textContent = displayNumber;

    // Базовый класс
    btn.classList.add("button-32-32");

    // Удаляем старые иконки
    btn.querySelectorAll('.status-icon-corner').forEach(icon => icon.remove());

    // Иконка статуса текста (левый верхний угол)
    // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
    const perfect = Number(s.number_of_perfect) || 0;
    const corrected = Number(s.number_of_corrected) || 0;


    // Иконка статуса аудио (правый нижний угол)
    if (perfect === 1 || corrected === 1) {
        const textIcon = document.createElement('div');
        textIcon.classList.add('status-icon-corner');
        if (perfect === 1) {
            textIcon.classList.add('text-status-perfect');
            textIcon.innerHTML = '<i data-lucide="star" style="width: 12px; height: 12px;"></i>';
        } else {
            textIcon.classList.add('text-status-corrected');
            textIcon.innerHTML = '<i data-lucide="star-half" style="width: 12px; height: 12px;"></i>';
        }
        btn.appendChild(textIcon);
    }

    if (getRemainingAudio(s) === 0) {
        const audioIcon = document.createElement('div');
        audioIcon.classList.add('status-icon-corner');
        audioIcon.classList.add('audio-status-done');
        if (perfect === 1) {
            audioIcon.classList.add('audio-status-perfect');
        } else if (corrected === 1) {
            audioIcon.classList.add('audio-status-corrected');
        }
        audioIcon.innerHTML = '<i data-lucide="mic-off" style="width: 12px; height: 12px;"></i>';
        btn.appendChild(audioIcon);
    }

    if (isCurrent) {
        btn.classList.add("button-active");
    }

    if (perfect === 1) {
        btn.classList.add("button-color-mint");
    } else if (corrected === 1) {
        btn.classList.add("button-color-lightgreen");
    } else {
        btn.classList.add("button-color-transparent");
    }

    // Центрируем текст
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.position = 'relative';

    // Обновляем иконки Lucide
    setTimeout(() => {
        if (window.lucide?.createIcons) {
            lucide.createIcons();
        }
    }, 0);
}

function applyStatusPreviosNext() {
    // Кнопки теперь всегда прозрачные (класс задан в HTML), 
    // видимость управляется через updateSimpleSentenceCounter() с помощью класса .hidden
    // Не меняем классы кнопок, чтобы сохранить button-color-transparent из HTML

    // Обновляем иконки Lucide
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }

    // setTimeout(() => {
    //     if (window.lucide?.createIcons) {
    //         lucide.createIcons();
    //     }
    // }, 0);
}

function applyStatusNewCircle() {
    let sum = sumRez(circle_number);

    btnNewCircle.classList.value = '';

    // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
    // Проверяем количество perfect и corrected предложений в выбранных
    let perfectCount = 0;
    let correctedCount = 0;
    selectedSentences.forEach(key => {
        const s = allSentences.find(s => s.key === key);
        if (s) {
            if (s.number_of_perfect > 0) perfectCount++;
            if (s.number_of_corrected > 0) correctedCount++;
        }
    });

    if (perfectCount === totalSelectedSentences) {
        // все правильные с первого раза
        btnNewCircle.classList.add('button-color-mint');
    } else if ((correctedCount + perfectCount) === totalSelectedSentences) {
        btnNewCircle.classList.add('button-color-lightgreen');
    } else {
        btnNewCircle.classList.add('button-color-transparent');
    }

    // Обновляем иконки Lucide
    lucide.createIcons();
}


// Функция обновления простого счетчика предложений (заменяет updateTabloSentenceCounter)
function updateSimpleSentenceCounter() {

    if (btnCurrent) {
        btnCurrent.textContent = (currentSentenceIndex + 1).toString();
    }

    // Скрываем стрелку влево, если на первом предложении
    if (btnPrev) {
        if (currentSentenceIndex === 0) {
            btnPrev.classList.add('hidden');
        } else {
            btnPrev.classList.remove('hidden');
        }
    }

    // Скрываем стрелку вправо, если на последнем предложении
    // Используем сохраненное общее количество, а не текущее selectedSentences.length
    if (btnNext) {
        if (currentSentenceIndex >= totalSelectedSentences - 1) {
            btnNext.classList.add('hidden');
        } else {
            btnNext.classList.remove('hidden');
        }
    }
}



// ===== пройшли коло =========
function checkIfAllCompleted() {
    // const s = statsLite(circle_number);

    selectedSentences = [];// ?
    const timerSnapshot = getProgressTimerSnapshot();
    const completedMs = getTimerDisplayMs(timerSnapshot);
    currentDictation.dictationTimerInterval = completedMs;

    const modalTimerNode = document.getElementById('modal_timer');
    if (modalTimerNode) {
        updateDictationTimerDisplay(completedMs, modalTimerNode);
    }
    stopTimer();

    // Проверяем завершение диктанта:
    // 1. Все предложения должны быть perfect (набраны с полной звездой)
    // 2. Все аудио должны быть произнесены (для каждого предложения >= REQUIRED_PASSED_COUNT)
    const sum = sumRez();

    // Проверяем perfect: считаем все предложения, которые имеют perfect (number_of_perfect = 1)
    // ИСПРАВЛЕНО: Убрано использование circle_number_of_perfect
    let perfectCount = 0;
    allSentences.forEach(s => {
        const totalPerfect = Number(s.number_of_perfect) || 0;
        if (totalPerfect > 0) {
            perfectCount++;
        }
    });
    const allPerfect = perfectCount === allSentences.length;

    // Проверяем аудио для каждого предложения
    let allAudioCompleted = true;
    for (const s of allSentences) {
        const totalAudio = Number(s.number_of_audio) || 0;
        if (totalAudio < REQUIRED_PASSED_COUNT) {
            allAudioCompleted = false;
            break;
        }
    }

    const allCompleted = allPerfect && allAudioCompleted;

    // Если диктант полностью завершен, показываем модальное окно завершения
    if (allCompleted) {
        // Регистрируем завершенный диктант и удаляем черновик
        registerCompletedDictation();

        // Сохраняем завершение сессии
        const panel = getProgressPanelInstance();
        if (panel) {
            panel.finish().then(() => {
                console.log('✅ Сессия завершена и сохранена');
            });
        }

        // Сохраняем завершение сессии (старая система)
        if (dictationStatistics) {
            dictationStatistics.endSession(allCompleted);
        }

        // Воспроизводим звук победы
        if (panel) {
            panel._playVictorySound();
        }

        // Показываем модальное окно завершения
        showCompletionModal();
        return;
    }

    // Если не полностью завершен, показываем обычное модальное окно списка предложений
    // Сохраняем завершение сессии
    const panel = getProgressPanelInstance();
    if (panel) {
        panel.finish().then(() => {
            console.log('✅ Сессия завершена и сохранена');
        }).catch((error) => {
            console.warn('⚠️ Не удалось сохранить сессию при завершении (не критично):', error);
            // Продолжаем работу, ошибка не блокирует завершение диктанта
        });
    }

    // Сохраняем завершение сессии (старая система)
    if (dictationStatistics) {
        dictationStatistics.endSession(allCompleted);
    }

    // Получаем элементы динамически
    const btnTimer = document.getElementById('btn-modal-timer');
    const btnPerfect = document.getElementById('btn-modal-count-perfect');
    const btnCorrected = document.getElementById('btn-modal-count-corrected');
    const btnAudio = document.getElementById('btn-modal-count-audio');
    const btnTotal = document.getElementById('btn-modal-count-total');
    const btnCircle = document.getElementById('btn-modal-circle-number');

    if (btnTimer) btnTimer.style.display = 'flex';
    if (btnPerfect) btnPerfect.style.display = 'flex';
    if (btnCorrected) btnCorrected.style.display = 'flex';
    if (btnAudio) btnAudio.style.display = 'flex';
    if (btnTotal) btnTotal.style.display = 'flex';
    if (btnCircle) btnCircle.style.display = 'flex';

    // Останавливаем таймер при открытии модального окна списка предложений
    stopTimer();
    // Останавливаем таймер бездействия
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Обновляем время в модальном окне перед показом
    const modalTimerEl = document.getElementById('modal_timer') || window.modalTimerElement;
    if (modalTimerEl) {
        const snapshot = getProgressTimerSnapshot();
        updateDictationTimerDisplay(getTimerDisplayMs(snapshot), modalTimerEl);
    }

    // Также обновляем через progressPanel для синхронизации
    if (panel) {
        panel.updateTimer();
    }

    // Записываем историю при открытии модального окна
    if (activityHistory && currentDictation.id) {
        activityHistory.startSession(currentDictation.id);
        activityHistory.saveSession().catch(err => {
            console.warn('Не удалось сохранить историю при открытии модального окна:', err);
        });
    }

    // Автоматически выбираем следующее предложение, если текущее стало completed
    // Это позволяет пользователю сразу нажать "Старт" без использования мышки
    if (currentSentence) {
        // currentSentence может быть объектом или ключом, получаем объект предложения
        const currentKey = typeof currentSentence === 'object' ? currentSentence.key : currentSentence;
        const currentSentenceObj = allSentences.find(s => s.key === currentKey || s.key === String(currentKey));

        // Проверяем, стало ли текущее предложение completed
        if (currentSentenceObj && currentSentenceObj.selection_state === 'completed') {
            // Находим следующее не-completed предложение
            const currentIndex = allSentences.findIndex(s => s.key === currentKey || s.key === String(currentKey));
            let nextSentence = null;

            // Ищем следующее предложение, которое не completed
            for (let i = currentIndex + 1; i < allSentences.length; i++) {
                const s = allSentences[i];
                if (s.selection_state !== 'completed') {
                    nextSentence = s;
                    break;
                }
            }

            // Если не нашли после текущего, ищем с начала
            if (!nextSentence) {
                for (let i = 0; i < currentIndex; i++) {
                    const s = allSentences[i];
                    if (s.selection_state !== 'completed') {
                        nextSentence = s;
                        break;
                    }
                }
            }

            // Если нашли следующее предложение, ставим на нем галочку
            if (nextSentence && nextSentence.selection_state !== 'checked') {
                nextSentence.selection_state = 'checked';
                updateSentenceSelectionState(nextSentence);

                // Обновляем отображение в таблице
                const nextRow = tableSentences.querySelector(`tr button[data-key="${nextSentence.key}"]`)?.closest('tr');
                if (nextRow) {
                    const statusBtn = nextRow.querySelector('.sentence-check');
                    if (statusBtn) {
                        renderSelectionStateButton(statusBtn, nextSentence, nextRow);
                    }
                }

                // Обновляем состояние чекбокса "Выбрать все"
                updateAllCheckboxState();

                console.log('✅ Автоматически выбрано следующее предложение:', nextSentence.key);
            }
        }
    }

    startModal.style.display = 'flex';
    // Инициализируем иконки Lucide после открытия модального окна
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
    confirmStartBtn.focus();
}



// ===== Аудио-функционал =====
// ====== Запись ==============
document.getElementById('recordButton').addEventListener('click', () => {
    const box = document.querySelector('.custom-audio-player[data-audio-id="audio_user"]');
    if (box) box.style.display = 'flex';
}, { once: true });

// Универсальная подмена иконки: 'square' ↔ 'pause'   setRecordStateIcon('square');
function setRecordStateIcon(name) {
    const btn = document.getElementById('recordButton');
    if (!btn) return;

    // какая иконка состояния на кнопке записи
    const stateIcon = (name === 'pause') ? 'pause' : 'square';

    // считаем, сколько попыток осталось для текущего предложения
    // (если нет данных — подставим REQUIRED_PASSED_COUNT в разумных пределах)
    let remainingAudio = getRemainingAudio(currentSentence);

    // рисуем разметку КАЖДЫЙ раз целиком: mic + (pause|square) + число
    if (remainingAudio === 0) {
        btn.innerHTML = `
    <i data-lucide="mic-off"></i>
    <span id="recordStateIcon" class="state-icon">
      <i data-lucide="check"></i>
    </span>
  `;

    } else {
        btn.innerHTML = `
    <i data-lucide="mic"></i>
    <span id="recordStateIcon" class="state-icon">
      <i data-lucide="${stateIcon}"></i>
    </span>
    <span class="audio-counter">${remainingAudio}</span>
  `;

    }

    // обновляем lucide-иконки
    if (window.lucide?.createIcons) {
        lucide.createIcons();
    }
}

// Функция для уменьшения счетчика записей
function decreaseAudioCounter() {
    currentSentence.number_of_audio = (Number(currentSentence.number_of_audio) || 0) + 1;

    // Сохраняем активность в БД
    saveActivityToDB('audio');

    // Обновляем флаг all_audio_completed
    const totalAudio = Number(currentSentence.number_of_audio) || 0;
    currentSentence.all_audio_completed = totalAudio >= REQUIRED_PASSED_COUNT;

    // Обновляем состояние выбора предложения (может стать completed)
    updateSentenceSelectionState(currentSentence, true);

    // Обновляем отображение счетчика
    setRecordStateIcon('square'); // или текущее состояние
    renderUserAudioTablo();

    updateStats();

    // в итоговой таблице надо проставить количество оствашихся еще не записаных аудио
    updateTableRowStatus(currentSentence);

    // Если счетчик достиг нуля, отключаем кнопку
    let remainingAudio = getRemainingAudio(currentSentence);

    if (remainingAudio === 0) {
        // currentSentence.audio_status = 1;
        const recordButton = document.getElementById('recordButton');
        if (recordButton) {
            recordButton.disabled = true;
            recordButton.classList.add('disabled');
        }

        // Обновляем простой счетчик предложений
        updateSimpleSentenceCounter();

        // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
        // Проверяем, все ли предложения выполнены (perfect или corrected)
        let completedCount = 0;
        selectedSentences.forEach(key => {
            const s = allSentences.find(s => s.key === key);
            if (s && (s.number_of_perfect > 0 || s.number_of_corrected > 0)) {
                completedCount++;
            }
        });

        const isLastSentenceInRun = Number(currentSentenceIndex) >= (Number(totalSelectedSentences) - 1);
        if (isLastSentenceInRun) {
            btnNewCircle.focus();
        } else {
            checkNextDiv.focus();
        }
    } else {

        // нуля не достигли но фокус надо оставить на этй кнопке
        recordButton.focus();
    }
    return true;
    // }
}

// Сначала объявляем stopRecording
async function stopRecording(cause = 'manual') {
    console.log(`🔄 [stopRecording] Вызвана функция stopRecording, cause: ${cause}`);
    console.log(`[SR#3] stopRecording enter cause=${cause} unifiedActive=${!!(unifiedSpeechRecognizer && unifiedSpeechRecognizer.state && unifiedSpeechRecognizer.state.isRecording)}`);
    
    // Делаем функцию доступной глобально для UnifiedSpeechRecognition
    if (!window.stopRecording) {
        window.stopRecording = stopRecording;
    }

    if (isStopping) {
        console.log(`⚠️ [stopRecording] Уже останавливается, пропускаем`);
        return;
    }
    isStopping = true;
    lastStopCause = cause;

    // UX: при ручной остановке сразу возвращаем "квадрат" и блокируем кнопку до конца распознавания.
    // Дальше (в конце saveRecording) разблокируем ТОЛЬКО если кнопка остается квадратом.
    if (cause === 'manual') {
        try {
            setRecordStateIcon('square');
        } catch (e) {
        }
        try {
            disableRecordButton(false);
        } catch (e) {
        }

        // Даем браузеру шанс отрисовать квадрат ДО тяжелых async-операций.
        try {
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        } catch (e) {
        }

        isProcessingRecognition = true;
    }

    // Используем UnifiedSpeechRecognition если доступен
    if (unifiedSpeechRecognizer && unifiedSpeechRecognizer.state.isRecording) {
        try {
            console.log(`🔄 [stopRecording] Вызываем unifiedSpeechRecognizer.stopRecording()`);
            console.log(`[SR#4] calling UnifiedSpeechRecognition.stopRecording()`);
            const result = await unifiedSpeechRecognizer.stopRecording();
            console.log(`✅ [stopRecording] unifiedSpeechRecognizer.stopRecording() вернул результат:`, result);
            try {
                const t = (result && typeof result.text === 'string') ? result.text : '';
                const mode = result?.mode;
                const hasBlob = !!result?.audioBlob;
                console.log(`[SR#5] stopRecording result mode=${mode} textLen=${t.length} hasBlob=${hasBlob}`);
            } catch (e) {}
            
            // Сохраняем результат для использования в saveRecording
            window.lastRecognitionResult = result;
            
            // Вызываем saveRecording с результатом
            setTimeout(() => {
                try {
                    console.log(`🔄 [stopRecording] Вызываем saveRecording с результатом, cause: ${cause}`);
                    console.log(`[SR#6] invoking saveRecording(cause, result)`);
                    saveRecording(cause, result);
                } catch (error) {
                    console.error('❌ Ошибка при сохранении записи:', error);
                } finally {
                    isStopping = false;
                }
            }, 0);
        } catch (error) {
            console.error('❌ Ошибка остановки UnifiedSpeechRecognition:', error);
            try {
                if (cause === 'manual') {
                    isProcessingRecognition = false;
                    restoreRecordButtonAvailability('stopRecording unified catch');
                }
            } catch (e) {
            }
            isStopping = false;
        }
    } else {
        // Fallback на старую логику если UnifiedSpeechRecognition не используется
        console.warn('⚠️ UnifiedSpeechRecognition не активен, используем старую логику');
        isRecording = false;
        
        // Сброс авто-стопа, если висит
        if (autoStopTimer) {
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }

        // Сброс таймера активности распознавания
        if (recognitionActivityTimer) {
            clearTimeout(recognitionActivityTimer);
            recognitionActivityTimer = null;
        }

        // Мягко гасим распознавание (без "aborted")
        if (typeof recognition !== 'undefined' && recognition) {
            try {
                recognition.stop();
            } catch (e) {
                console.log('Ошибка остановки распознавания:', e);
            }
        }

        // Останавливаем запись — onstop сам вызовет saveRecording()
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log(`🔄 [stopRecording] Останавливаем mediaRecorder, audioChunks.length: ${audioChunks.length}`);
            try {
                mediaRecorder.stop();
                console.log(`✅ [stopRecording] mediaRecorder.stop() вызван`);
            } catch (error) {
                console.error('❌ Ошибка остановки записи:', error);
                isStopping = false;
            }
        } else {
            console.log(`⚠️ [stopRecording] mediaRecorder не записывает (state: ${mediaRecorder?.state}), но audioChunks.length: ${audioChunks.length}`);
            // Если есть аудиоданные, но запись не была запущена, все равно вызываем saveRecording
            if (audioChunks.length > 0) {
                console.log(`🔄 [stopRecording] Вызываем saveRecording напрямую, так как есть аудиоданные`);
                setTimeout(() => {
                    try {
                        saveRecording(cause);
                    } catch (error) {
                        console.error('❌ Ошибка при сохранении записи:', error);
                    }
                }, 0);
            }
            isStopping = false;
        }

        // Погасим визуализатор и вернём квадрат
        stopVisualization();
        setRecordStateIcon('square');

        const rb = document.getElementById('recordButton');
        if (rb) rb.classList.remove('recording'); // на всякий случай сняли класс

        currentInactivityTimeout = INACTIVITY_TIMEOUT_DEFAULT;
        resetInactivityTimer();
    }
}

function stopAllAudios() {
    // Останавливаем все аудио через AudioManager
    if (window.AudioManager) {
        window.AudioManager.stop();
    }
}


const successSound = document.getElementById('successSound');
function playSuccessSound() {
    if (successSound) {
        // Создаем клон чтобы избежать конфликтов
        const clone = successSound.cloneNode(true);
        clone.volume = 0.3; // Тише, чтобы не мешать

        clone.play().then(() => {
            clone.onended = () => clone.remove(); // Автоочистка
        }).catch(e => {
            console.log('Не удалось воспроизвести звук успеха:', e);
            clone.remove();
        });
    }
}

async function startRecording() {
    try {
        stopAllAudios();

        console.log(`[SR#1] startRecording enter mode=${speechRecognitionMode} lang=${langCodeUrl}`);

        setRecordStateIcon('pause');
        updateRecordingIndicator('preparing');

        // стартовый процент 0% (чтобы не показывало процетны из предыдущих записей)
        const percentEl = getCountPercentEl();
        if (percentEl) {
            percentEl.textContent = 0;
        }

        // Инициализируем UnifiedSpeechRecognition если еще не инициализирован
        // При изменении режима unifiedSpeechRecognizer сбрасывается в null, 
        // поэтому он пересоздается с правильным режимом
        if (!unifiedSpeechRecognizer) {
            unifiedSpeechRecognizer = initUnifiedSpeechRecognition();
            if (!unifiedSpeechRecognizer) {
                throw new Error('Не удалось инициализировать UnifiedSpeechRecognition');
            }
        }
        
        // Определяем режим для отображения сообщения пользователю
        const effectiveMode = getEffectiveSpeechRecognitionMode();
        let mode = 'online'; // по умолчанию онлайн
        if (effectiveMode === 'route-off') {
            mode = 'offline';
        } else if (effectiveMode === 'route') {
            mode = 'online';
        }

        // Начинаем запись через UnifiedSpeechRecognition
        await unifiedSpeechRecognizer.startRecording();

        console.log(`[SR#2] UnifiedSpeechRecognition.startRecording resolved mode=${mode}`);
        
        // Устанавливаем начальное сообщение
        const userAudioAnswer = document.getElementById('userAudioAnswer');
        if (userAudioAnswer) {
            if (mode === 'offline') {
                userAudioAnswer.innerHTML = 'Говорите... (локально)';
            } else {
                userAudioAnswer.innerHTML = 'Говорите...';
            }
        }

    } catch (error) {
        console.error('Ошибка записи:', error);
        const userAudioAnswer = document.getElementById('userAudioAnswer');
        if (userAudioAnswer) {
            userAudioAnswer.innerHTML = `<span class="error">Ошибка: ${error.message}</span>`;
        }
        updateRecordingIndicator(false);
        
        // Сбрасываем флаги при ошибке
        isRecording = false;
        isStopping = false;
        const rb = document.getElementById('recordButton');
        if (rb) rb.classList.remove('recording');
        setRecordStateIcon('square');
        
        currentInactivityTimeout = INACTIVITY_TIMEOUT_DEFAULT;
        resetInactivityTimer();
    }
}

async function toggleRecording() {
    // Используем UnifiedSpeechRecognition если доступен
    if (unifiedSpeechRecognizer && unifiedSpeechRecognizer.state.isRecording) {
        await stopRecording('manual');
    } else {
        await startRecording();
    }
}

function getSupportedMimeType() {
    const types = [
        'audio/mp4; codecs="mp4a.40.2"', // AAC (лучший для Safari)
        'audio/webm; codecs=opus',        // Opus (для Chrome/Firefox)
        'audio/webm'                      // Fallback
    ];

    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

/**
 * Извлекает имена из подсказки (explanation) для использования в промпте
 * Просто берет все слова из explanation (независимо от регистра)
 * @param {string} explanation - Текст подсказки
 * @param {string} langCode - Код языка оригинала (не используется, оставлен для совместимости)
 * @returns {string[]} Массив имен
 */
function extractNamesFromHint(explanation, langCode = 'en') {
    console.log(`🔍 [extractNamesFromHint] Входной explanation: "${explanation}"`);

    if (!explanation || typeof explanation !== 'string') {
        console.log(`⚠️ [extractNamesFromHint] explanation пустой или не строка`);
        return [];
    }

    const trimmed = explanation.trim();
    if (!trimmed) {
        console.log(`⚠️ [extractNamesFromHint] explanation пустой после trim`);
        return [];
    }

    // Просто берем все слова из explanation (независимо от регистра)
    // Разделяем по пробелам, запятым, дефисам и другим разделителям
    const words = trimmed.split(/[\s,\-:;()]+/).map(word => word.trim()).filter(word => word.length > 0);

    // Фильтруем слишком короткие (меньше 2 символов) и слишком длинные (больше 30 символов)
    const filtered = words.filter(word => word.length >= 2 && word.length <= 30);

    if (filtered.length > 0) {
        console.log(`✅ [extractNamesFromHint] Найдено слов:`, filtered);
        return filtered;
    }

    console.log(`⚠️ [extractNamesFromHint] Слова не найдены`);
    return [];
}

/**
 * Генерирует промпт для Whisper на основе подсказки
 * @param {string} explanation - Текст подсказки (explanation)
 * @param {string} langCode - Код языка оригинала (не используется, оставлен для совместимости)
 * @returns {string|null} Промпт для Whisper или null, если нечего добавить
 */
function generateWhisperPrompt(explanation, langCode = 'en') {
    if (!explanation || typeof explanation !== 'string') {
        return null;
    }

    const names = extractNamesFromHint(explanation, langCode);

    if (names.length === 0) {
        return null;
    }

    // Простой формат: "имена: имя1, имя2, имя3"
    return `имена: ${names.join(', ')}`;
}

// Экспортируем функции глобально для использования в UnifiedSpeechRecognition
if (typeof window !== 'undefined') {
    window.generateWhisperPrompt = generateWhisperPrompt;
    window.extractNamesFromHint = extractNamesFromHint;
}

async function saveRecording(cause = undefined, recognitionResult = null) {
    console.log(`🔍 [saveRecording] Вызвана функция saveRecording, cause: ${cause}`);
    console.log(`[SR#7] saveRecording enter cause=${cause} hasArgResult=${!!recognitionResult} hasWindowResult=${!!window.lastRecognitionResult}`);
    
    // Делаем функцию доступной глобально для UnifiedSpeechRecognition
    if (!window.saveRecording) {
        window.saveRecording = saveRecording;
    }

    // Используем результат из UnifiedSpeechRecognition если доступен
    if (recognitionResult || window.lastRecognitionResult) {
        const result = recognitionResult || window.lastRecognitionResult;
        window.lastRecognitionResult = null; // очищаем

        console.log(`🔍 [saveRecording] Обрабатываем результат UnifiedSpeechRecognition:`, result);

        try {
            const t = (result && typeof result.text === 'string') ? result.text : '';
            console.log(`[SR#8] using recognition result mode=${result?.mode} textLen=${t.length} textPreview="${t.slice(0, 80)}"`);
        } catch (e) {}
        
            const audioBlob = result.audioBlob || unifiedSpeechRecognizer?.getAudioBlob();
            if (!audioBlob) {
                console.warn("⚠️ [saveRecording] Нет аудиоданных для сохранения, но продолжаем обработку текста");
                // Не возвращаемся - продолжаем обработку текста даже без blob
            } else {
                // Сделать последнюю запись доступной на кнопке #userPlay
                setUserAudioBlob(audioBlob);
            }
        
            // Получаем распознанный текст
            let spokenText = result.text || '';

        // Если офлайн-режим (Whisper) — UnifiedSpeechRecognition не заполняет text.
        // Тогда распознаем здесь по audioBlob.
            if (result.mode === 'offline' && (!spokenText || !String(spokenText).trim())) {
                try {
                const audioBlobForWhisper = audioBlob;
                if (audioBlobForWhisper) {
                    const currentLang = langCodeUrl?.split('-')[0] || 'en';
                    const selectedSize = getSelectedWhisperModelSize(currentLang);
                    const hasModel = hasWhisperModel(currentLang, selectedSize);
                    console.log(`🔍 [saveRecording] (unified) offline: модель для ${currentLang}${selectedSize ? ' (' + selectedSize + ')' : ''} доступна: ${hasModel}`);

                    if (hasModel) {
                        let whisperModel = getWhisperModel(currentLang, selectedSize);
                        if (!whisperModel) {
                            console.log(`🔄 [saveRecording] (unified) Модель есть в localStorage, но не в памяти. Загружаем...`);
                            const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;
                            if (whisperManager) {
                                await whisperManager.loadLanguageModel(currentLang, selectedSize || 'base');
                                console.log(`✅ [saveRecording] (unified) Модель загружена в память`);
                            } else {
                                throw new Error('WhisperModelManager не доступен');
                            }
                        }

                        const explanation = currentSentence?.explanation || '';
                        const originalLang = langCodeUrl?.split('-')[0] || (typeof currentDictation !== 'undefined' && currentDictation?.language_original ? currentDictation.language_original.split('-')[0] : 'en');
                        const prompt = generateWhisperPrompt(explanation, originalLang);

                        const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;
                        if (!whisperManager) {
                            throw new Error('WhisperModelManager не доступен');
                        }

                        showWhisperProcessingAnimation();
                        const progressBarId = 'whisper-progress';
                        const progressDuration = 2000;
                        animateProgressBar(progressBarId, progressDuration);

                        console.log(`🔄 [saveRecording] (unified) Вызываем whisperManager.transcribe для языка ${currentLang}`);
                        const whisperResult = await whisperManager.transcribe(
                            audioBlobForWhisper,
                            currentLang,
                            selectedSize || 'base',
                            prompt
                        );

                        console.log('Результат Whisper (unified, полный):', whisperResult);

                        let recognizedText = '';
                        if (whisperResult && typeof whisperResult === 'object') {
                            if (whisperResult.text) {
                                recognizedText = String(whisperResult.text).trim();
                            } else if (Array.isArray(whisperResult) && whisperResult.length > 0) {
                                const firstItem = whisperResult[0];
                                if (firstItem && firstItem.text) {
                                    recognizedText = String(firstItem.text).trim();
                                } else if (typeof firstItem === 'string') {
                                    recognizedText = firstItem.trim();
                                }
                            } else if (whisperResult.chunks && Array.isArray(whisperResult.chunks) && whisperResult.chunks.length > 0) {
                                const firstChunk = whisperResult.chunks[0];
                                if (firstChunk && firstChunk.text) {
                                    recognizedText = String(firstChunk.text).trim();
                                }
                            }
                        } else if (typeof whisperResult === 'string') {
                            recognizedText = whisperResult.trim();
                        }

                        console.log('Whisper распознал (unified, извлеченный текст):', recognizedText);
                        if (recognizedText) {
                            spokenText = recognizedText;
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Ошибка распознавания через Whisper (unified):', error);
            }
        }
        console.log(`🔍 [saveRecording] Распознанный текст: "${spokenText}"`);
        
        // Для офлайн-режима показываем анимацию печати если нужно
        if (result.mode === 'offline' && spokenText) {
            await typeTextAnimated(spokenText, {
                container: userAudioAnswer,
                speed: 50,
                onComplete: () => {}
            });
        }
        
        // Получаем оригинальный текст
        const originalText = currentSentence?.text ?? '';
        console.log(`🔍 [saveRecording] Оригинальный текст: "${originalText}"`);
        
        if (!originalText) {
            console.error(`❌ [saveRecording] currentSentence.text пустой! currentSentence:`, currentSentence);
        }
        
        // Считаем процент совпадения
        const percent = computeMatchPercentASR(originalText, spokenText);
        console.log(`🔍 [saveRecording] Процент совпадения: ${percent}% (минимум: ${MIN_MATCH_PERCENT}%)`);

        console.log(`[SR#9] computed percent=${percent} spokenLen=${(spokenText || '').length} originalLen=${(originalText || '').length}`);
        
        // Обновляем отображение процента
        const percentEl = getCountPercentEl();
        if (percentEl) {
            percentEl.textContent = percent;
            console.log(`[SR#10] UI count_percent.textContent now=${percentEl.textContent}`);
        } else {
            console.log(`[SR#10] UI count_percent element not found`);
        }

        // После распознавания обычно меняется прогресс/статистика — сохраняем локально.
        scheduleDraftAutosave('saveRecording');
        
        // Проверяем «зачтено»
        const isPassed = percent >= MIN_MATCH_PERCENT;
        console.log(`🔍 [saveRecording] Запись ${isPassed ? 'засчитана' : 'не засчитана'}: ${percent}% >= ${MIN_MATCH_PERCENT}%`);
        
        if (isPassed) {
            console.log('✅ [saveRecording] Запись засчитана, уменьшаем счетчик');
            playSuccessSound();
            decreaseAudioCounter();
        } else {
            console.log('❌ [saveRecording] Запись не засчитана, счетчик не уменьшается');
            // Если не засчитано — фиксируем, что фокус должен остаться на записи
            // (после того как кнопка снова станет enabled)
            window.__forceFocusRecordAfterRecognition = true;
            window.__lockFocusOnRecordUntil = Date.now() + 1500;
        }
        
        renderUserAudioTablo();
        srLiveText = '';

        // UX: если мы блокировали кнопку на время распознавания — обязаны вернуть её из disabled.
        try {
            if (isProcessingRecognition) {
                isProcessingRecognition = false;
                restoreRecordButtonAvailability('saveRecording unified done');
            } else if (window.__forceFocusRecordAfterRecognition) {
                // На некоторых ветках isProcessingRecognition может уже быть сброшен,
                // но кнопка записи могла стать disabled и браузер уводит фокус на другой контрол (часто play оригинала).
                // Здесь принудительно восстанавливаем доступность и фокус.
                restoreRecordButtonAvailability('saveRecording unified post-fail focus');
                // Дважды откладываем восстановление фокуса через анимационные кадры,
                // чтобы избежать его перезаписи другими обновлениями UI (например, плеером аудио).
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        restoreRecordButtonAvailability('saveRecording unified post-fail focus');
                    });
                });
            }
        } catch (e) {
        }

        return;
    }
    
    // Fallback на старую логику
    console.log(`🔍 [saveRecording] Fallback на старую логику, audioChunks.length: ${audioChunks.length}`);

    if (!audioChunks.length) {
        console.warn("Нет аудиоданных для сохранения");
        return;
    }

    const blobType = mediaRecorder.mimeType?.includes('mp4')
        ? 'audio/mp4'
        : 'audio/webm';

    // Сформировать Blob из накопленных чанков и очистить буфер
    const audioBlob = new Blob(audioChunks, { type: blobType });
    audioChunks = [];

    // Сделать последнюю запись доступной на кнопке #userPlay
    setUserAudioBlob(audioBlob);

    // Привяжем «официальный» плеер, как и раньше (если он тебе нужен)
    const audioUrl = URL.createObjectURL(audioBlob);

    // ⬇️ добавлено: получаем оригинал и распознанный текст
    const originalText = currentSentence.text ?? '';
    let spokenText = '';

    // Проверяем, нужно ли использовать Whisper для локального распознавания
    const currentLang = langCodeUrl?.split('-')[0] || 'en';
    const selectedSize = getSelectedWhisperModelSize(currentLang);

    if (getEffectiveSpeechRecognitionMode() === 'route-off') {
        // Проверяем наличие модели (в памяти или в localStorage)
        const hasModel = hasWhisperModel(currentLang, selectedSize);
        console.log(`🔍 [saveRecording] Режим route-off, модель для ${currentLang}${selectedSize ? ' (' + selectedSize + ')' : ''} доступна: ${hasModel}`);

        if (!hasModel) {
            console.log(`⚠️ [saveRecording] Модель Whisper не найдена, используем Web Speech API результаты`);
            // Fallback на Web Speech API результаты
            spokenText = (srLiveText && srLiveText.trim()) ? srLiveText.trim()
                : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
        } else {
            // Модель есть - используем Whisper для распознавания
            try {
                console.log(`🔄 [saveRecording] Используем Whisper${selectedSize ? ' ' + selectedSize : ''} для распознавания языка ${currentLang}`);

                // Убеждаемся, что модель загружена в память
                let whisperModel = getWhisperModel(currentLang, selectedSize);
                if (!whisperModel && hasModel) {
                    console.log(`🔄 [saveRecording] Модель есть в localStorage, но не в памяти. Загружаем...`);
                    const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;
                    if (whisperManager) {
                        await whisperManager.loadLanguageModel(currentLang, selectedSize || 'base');
                        console.log(`✅ [saveRecording] Модель загружена в память`);
                    } else {
                        throw new Error('WhisperModelManager не доступен');
                    }
                }

                // Генерируем промпт из подсказки (explanation)
                const explanation = currentSentence.explanation || '';
                console.log(`🔍 [saveRecording] explanation: "${explanation}"`);

                // Определяем язык оригинала для правильного извлечения имен
                const originalLang = langCodeUrl?.split('-')[0] || (typeof currentDictation !== 'undefined' && currentDictation?.language_original ? currentDictation.language_original.split('-')[0] : 'en');
                console.log(`🔍 [saveRecording] Язык оригинала диктанта: ${originalLang}`);

                const names = extractNamesFromHint(explanation, originalLang);
                console.log(`🔍 [saveRecording] Извлеченные имена:`, names);

                const prompt = generateWhisperPrompt(explanation, originalLang);
                console.log(`🔍 [saveRecording] Сгенерированный промпт:`, prompt);

                if (prompt) {
                    console.log(`📝 Используем промпт для улучшения распознавания: "${prompt}"`);
                } else {
                    console.log(`⚠️ [saveRecording] Промпт не сгенерирован (имена не найдены или explanation пустой)`);
                }

                // Используем WhisperModelManager для распознавания с промптом
                const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;

                if (!whisperManager) {
                    throw new Error('WhisperModelManager не доступен');
                }

                // Показываем интерактивный процесс обработки вместо молчаливого ожидания
                showWhisperProcessingAnimation();

                // Запускаем анимацию прогресс-бара
                const progressBarId = 'whisper-progress';
                const progressDuration = 2000; // 2 секунды анимации
                animateProgressBar(progressBarId, progressDuration);

                // Используем метод transcribe с поддержкой промпта
                console.log(`🔄 [saveRecording] Вызываем whisperManager.transcribe для языка ${currentLang}`);
                const result = await whisperManager.transcribe(
                    audioBlob,
                    currentLang,
                    selectedSize || 'base', // modelSize
                    prompt // prompt
                );

                // Transformers.js возвращает объект с полем text
                // Формат: { text: "распознанный текст", chunks: [...] }
                console.log('Результат Whisper (полный):', result);

                let recognizedText = '';
                if (result && typeof result === 'object') {
                    if (result.text) {
                        recognizedText = String(result.text).trim();
                    } else if (Array.isArray(result) && result.length > 0) {
                        // Если результат - массив, берем первый элемент
                        const firstItem = result[0];
                        if (firstItem && firstItem.text) {
                            recognizedText = String(firstItem.text).trim();
                        } else if (typeof firstItem === 'string') {
                            recognizedText = firstItem.trim();
                        }
                    } else if (result.chunks && Array.isArray(result.chunks) && result.chunks.length > 0) {
                        // Пробуем извлечь текст из chunks
                        const firstChunk = result.chunks[0];
                        if (firstChunk && firstChunk.text) {
                            recognizedText = String(firstChunk.text).trim();
                        }
                    }
                } else if (typeof result === 'string') {
                    recognizedText = result.trim();
                }

                console.log('Whisper распознал (извлеченный текст):', recognizedText);

                // Если распознавание не дало результата, используем fallback
                if (!recognizedText || recognizedText.length === 0) {
                    console.warn('Whisper вернул пустой результат, используем fallback');
                    recognizedText =
                        (srLiveText && srLiveText.trim()) ? srLiveText.trim()
                            : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
                }

                // Постепенно показываем результат (анимация печати)
                await typeTextAnimated(recognizedText, {
                    container: userAudioAnswer,
                    speed: 50, // мс на символ
                    onComplete: () => {
                        // ничего не показываем: окончание распознавания видно по тексту
                    }
                });

                spokenText = recognizedText;
            } catch (error) {
                console.error('❌ Ошибка распознавания через Whisper:', error);
                // Fallback на Web Speech API результаты
                spokenText =
                    (srLiveText && srLiveText.trim()) ? srLiveText.trim()
                        : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
            } finally {
                if (isProcessingRecognition) {
                    isProcessingRecognition = false;
                    restoreRecordButtonAvailability('saveRecording fallback done');
                }
            }
        }
    } else {
        // Используем результаты Web Speech API
        spokenText =
            (srLiveText && srLiveText.trim()) ? srLiveText.trim()
                : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
    }

    // Логируем для отладки
    console.log('Распознанный текст:', spokenText);
    console.log('Оригинальный текст:', originalText);

    // ⬇️ добавлено: считаем % совпадения
    const percent = computeMatchPercentASR(originalText, spokenText);
    console.log(`Процент совпадения: ${percent}% (минимум: ${MIN_MATCH_PERCENT}%)`);

    // ⬇️ добавлено: проверяем «зачтено»
    const isPassed = percent >= MIN_MATCH_PERCENT;
    console.log(`Запись ${isPassed ? 'засчитана' : 'не засчитана'}: ${percent}% >= ${MIN_MATCH_PERCENT}%`);

    if (isPassed) {
        // Уменьшаем счетчик только если запись зачтена
        console.log('✅ Запись засчитана, уменьшаем счетчик');
        playSuccessSound();
        decreaseAudioCounter();
    } else {
        console.log('❌ Запись не засчитана, счетчик не уменьшается');
        // Фокус должен остаться на записи (после восстановления доступности кнопки)
        window.__forceFocusRecordAfterRecognition = true;
        window.__lockFocusOnRecordUntil = Date.now() + 1500;
    }

    renderUserAudioTablo();

    // сбрасываем буфер
    srLiveText = '';

    try {
        if (isProcessingRecognition) {
            isProcessingRecognition = false;
            restoreRecordButtonAvailability('saveRecording fallback done');
        } else if (window.__forceFocusRecordAfterRecognition) {
            // В некоторых ветках флаг isProcessingRecognition может уже быть сброшен,
            // но нужно вернуть фокус на кнопку записи.
            restoreRecordButtonAvailability('saveRecording fallback post-fail focus');
        }
    } catch (e) {
    }
}

/**
 * Показывает анимацию обработки для Whisper (локальный режим)
 */
function showWhisperProcessingAnimation() {
    const processingHTML = `
        <div class="whisper-processing-animation">
            <div class="dots-animation">
                <span style="--i: 0">.</span>
                <span style="--i: 1">.</span>
                <span style="--i: 2">.</span>
            </div>
            <div class="processing-text">Обработка аудио</div>
            <div class="progress-container">
                <div class="progress-bar" id="whisper-progress"></div>
            </div>
        </div>
    `;
    if (userAudioAnswer) {
        userAudioAnswer.innerHTML = processingHTML;
    }
}

/**
 * Анимирует прогресс-бар для Whisper обработки
 * @param {string} elementId - ID элемента прогресс-бара
 * @param {number} duration - Длительность анимации в миллисекундах
 */
function animateProgressBar(elementId, duration) {
    const progressBar = document.getElementById(elementId);
    if (!progressBar) {
        console.warn(`Элемент прогресс-бара ${elementId} не найден`);
        return;
    }

    let start = 0;
    const end = 100;
    const increment = 100 / (duration / 50); // Обновляем каждые 50ms

    const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
            start = end;
            clearInterval(timer);
        }
        progressBar.style.width = start + '%';
    }, 50);
}

/**
 * Анимирует печать текста (эффект печатающей машинки)
 * @param {string} text - Текст для анимации
 * @param {Object} options - Опции анимации
 * @param {HTMLElement} options.container - Контейнер для вывода текста
 * @param {number} options.speed - Скорость печати (мс на символ)
 * @param {Function} options.onComplete - Callback при завершении
 */
async function typeTextAnimated(text, options = {}) {
    const container = options.container || userAudioAnswer;
    const speed = options.speed || 50;
    const onComplete = options.onComplete || (() => { });

    if (!container) {
        console.warn('Контейнер для результата не найден');
        return;
    }

    // Очищаем контейнер от анимации прогресса
    container.innerHTML = '<div class="whisper-result-text"></div>';
    const resultDiv = container.querySelector('.whisper-result-text');

    if (!resultDiv) {
        console.warn('Элемент для результата не найден');
        return;
    }

    // Печатаем текст посимвольно
    for (let i = 0; i < text.length; i++) {
        resultDiv.textContent = text.substring(0, i + 1);
        await new Promise(resolve => setTimeout(resolve, speed));
    }

    // Вызываем callback при завершении
    onComplete();
}

function fallbackComputeMatchPercent(a, b) {
    const norm = s => s
        ?.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean) || [];
    const A = norm(a);
    const B = norm(b);
    if (!A.length) return 0;
    const setB = new Set(B);
    const hits = A.filter(w => setB.has(w)).length;
    return hits / A.length; // доля «правильных» слов
}

// Проверка доступности интернета
async function checkInternetConnection() {
    try {
        // Пробуем сделать запрос к серверу
        const response = await fetch('/health', {
            method: 'GET',
            cache: 'no-cache',
            signal: AbortSignal.timeout(3000) // Таймаут 3 секунды
        });
        return response.ok;
    } catch (error) {
        console.log('Интернет недоступен, используем локальное распознавание');
        return false;
    }
}

// Проверка доступности Web Speech API
function checkWebSpeechAPI() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// Инициализация "локального" распознавания через Web Speech API
// ВАЖНО: Web Speech API в Chrome на самом деле требует интернет
// Аудио отправляется на серверы Google для распознавания
function initOfflineRecognition() {
    console.log('Режим "локального" распознавания через Web Speech API (требует интернет)');
    initWebSpeechRecognition();
}

/**
 * Обновляет иконку режима распознавания речи рядом с кнопкой записи
 */
function updateRecognitionModeIcon() {
    const iconElement = document.getElementById('recognitionModeIcon');
    if (!iconElement) return;

    let iconName = 'route';
    let title = 'Распознавание через интернет';

    const effectiveMode = getEffectiveSpeechRecognitionMode();

    if (effectiveMode === 'route') {
        iconName = 'route';
        title = 'Распознавание через интернет';
    } else if (effectiveMode === 'route-off') {
        const currentLang = langCodeUrl?.split('-')[0] || (typeof currentDictation !== 'undefined' && currentDictation?.language_original ? currentDictation.language_original.split('-')[0] : 'en');
        const selectedSize = getSelectedWhisperModelSize(currentLang);
        iconName = 'route-off';
        title = hasWhisperModel(currentLang, selectedSize)
            ? (selectedSize ? `Локальное распознавание (Whisper ${selectedSize})` : 'Локальное распознавание (Whisper)')
            : 'Локальное распознавание (модель Whisper не загружена)';
    }

    iconElement.innerHTML = `<i data-lucide="${iconName}"></i>`;
    iconElement.setAttribute('title', title);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function initSpeechRecognition() {
    // Определяем метод распознавания на основе настроек пользователя
    // ВАЖНО: Режим определяется ТОЛЬКО из настроек пользователя (speechRecognitionMode),
    // НЕ автоматически на основе наличия интернета
    // ВАЖНО: Web Speech API в Chrome требует интернет - отправляет аудио на серверы Google
    const hasWebSpeech = checkWebSpeechAPI();

    if (!hasWebSpeech) {
        console.warn('Web Speech API недоступен в этом браузере');
        if (userAudioAnswer) {
            userAudioAnswer.innerHTML = '<span class="error">Распознавание речи недоступно. Используйте Chrome, Edge или Safari.</span>';
        }
        return;
    }

    const effectiveMode = getEffectiveSpeechRecognitionMode();
    console.log(`🔍 [initSpeechRecognition] Инициализация с режимом: ${effectiveMode}`);

    if (effectiveMode === 'route') {
        // Только через интернет (Web Speech API - требует интернет)
        console.log('✅ [initSpeechRecognition] Режим: только через интернет (Web Speech API)');
        initWebSpeechRecognition();
        updateRecognitionModeIcon(); // Обновляем иконку
        return;
    } else if (effectiveMode === 'route-off') {
        // "Только локально" - используем Whisper если модель загружена, иначе Web Speech API
        // ВАЖНО: Режим НЕ меняется автоматически - пользователь выбрал "локально"
        const currentLang = langCodeUrl?.split('-')[0] || (typeof currentDictation !== 'undefined' && currentDictation?.language_original ? currentDictation.language_original.split('-')[0] : 'en');
        const selectedSize = getSelectedWhisperModelSize(currentLang);
        console.log(`🔍 [initSpeechRecognition] Режим route-off, проверяем модель для языка: ${currentLang}`);

        if (hasWhisperModel(currentLang, selectedSize)) {
            console.log(`✅ [initSpeechRecognition] Режим: только локально (Whisper${selectedSize ? ' ' + selectedSize : ''} для языка ${currentLang})`);
            // Whisper будет использован в saveRecording при сохранении записи
            // Не запускаем Web Speech API, так как используем Whisper
            updateRecognitionModeIcon(); // Обновляем иконку
            return;
        } else {
            console.log(`⚠️ [initSpeechRecognition] Режим: только локально, но модель Whisper не загружена в память для языка ${currentLang}`);
            console.log(`⚠️ [initSpeechRecognition] Модель есть в localStorage, но не загружена в память. Whisper будет использован при первой записи.`);
            // ВАЖНО: Режим НЕ меняем на 'route' - пользователь выбрал "локально"
            // НЕ запускаем Web Speech API - используем только Whisper
            // Модель загрузится автоматически при первой записи через WhisperModelManager
            updateRecognitionModeIcon(); // Обновляем иконку (должна показать route-off)
            return;
        }
    } else {
        // Fallback: если режим не распознан (например, старый 'avto'), конвертируем в route (интернет)
        console.log(`⚠️ [initSpeechRecognition] Неизвестный режим: ${speechRecognitionMode}, конвертируем в route (интернет)`);
        if (speechRecognitionMode === 'avto') {
            console.log(`🔄 [initSpeechRecognition] Конвертируем старый режим 'avto' в 'route'`);
        }
        speechRecognitionMode = 'route'; // Принудительно устанавливаем route только если режим неизвестен
        initWebSpeechRecognition();
        updateRecognitionModeIcon(); // Обновляем иконку
        return;
    }
}

window.addEventListener('offline', () => {
    try {
        updateRecognitionModeIcon();
    } catch (e) {
    }
});

function initWebSpeechRecognition() {
    // Инициализация Web Speech API
    // ВАЖНО: Web Speech API в Chrome требует интернет - отправляет аудио на серверы Google
    // Получаем SpeechRecognition с учетом префиксов для разных браузеров
    // Chrome/Edge: window.SpeechRecognition
    // Safari: window.webkitSpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error('Браузер не поддерживает SpeechRecognition. Используйте Chrome, Edge или Safari.');
        if (userAudioAnswer) {
            userAudioAnswer.innerHTML = '<span class="error">Распознавание речи недоступно. Используйте Chrome, Edge или Safari.</span>';
        }
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = langCodeUrl; // Используем переданный язык
    console.log('Recognition language set to:', recognition.lang, '(Web Speech API - требует интернет)');

    recognition.interimResults = true;
    recognition.continuous = true; // Добавляем непрерывное распознавание
    recognition.maxAlternatives = 1; // Уменьшает нагрузку - берем только самый уверенный результат

    // Переменные для улучшения стабильности (фильтрация обновлений)
    let lastUpdateTime = 0;
    let lastStableResult = '';
    let stabilityTimer = null;
    const UPDATE_FREQUENCY_MS = 300; // Обновляем не чаще 300ms
    const STABILITY_THRESHOLD_MS = 500; // Минимальное время стабильности 500ms

    // Web Speech: результаты распознавания приходят пачками (final + interim)
    recognition.onresult = (event) => {
        // 1) Если запись уже остановлена — ничего не делаем (важно!)
        if (!isRecording) return;

        // 2) Ограничиваем частоту обновлений (не чаще UPDATE_FREQUENCY_MS)
        const now = Date.now();
        if (now - lastUpdateTime < UPDATE_FREQUENCY_MS) {
            return; // Пропускаем слишком частые обновления
        }
        lastUpdateTime = now;

        // 3) Собираем тексты
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const t = res[0].transcript;
            if (res.isFinal) finalTranscript += t + ' ';
            else interimTranscript += t + ' ';
        }

        // 4) Обновляем «живой» буфер и last-final
        recognition.finalTranscript = finalTranscript.trim();
        const currentResult = (finalTranscript + ' ' + interimTranscript).trim();
        srLiveText = currentResult;

        // 5) Проверка стабильности перед обновлением дисплея
        // Сбрасываем предыдущий таймер стабильности
        if (stabilityTimer) {
            clearTimeout(stabilityTimer);
        }

        // Запускаем новый таймер стабильности
        stabilityTimer = setTimeout(() => {
            // Проверяем, изменился ли результат существенно
            if (isSignificantChange(currentResult, lastStableResult)) {
                lastStableResult = currentResult;
                // Обновляем дисплей только если изменение значимое
                if (userAudioAnswer) {
                    userAudioAnswer.innerHTML =
                        `<span class="final">${finalTranscript}</span><span class="interim">${interimTranscript}</span>`;
                }
            }
        }, STABILITY_THRESHOLD_MS);

        // Показываем промежуточные результаты сразу (для обратной связи)
        // Но финальные результаты обновляем только после проверки стабильности
        if (finalTranscript) {
            // Есть финальные результаты - обновляем сразу (они стабильны)
            if (userAudioAnswer) {
                userAudioAnswer.innerHTML =
                    `<span class="final">${finalTranscript}</span><span class="interim">${interimTranscript}</span>`;
            }
            lastStableResult = currentResult;
        } else {
            // Только промежуточные - показываем, но не обновляем стабильный результат
            if (userAudioAnswer) {
                userAudioAnswer.innerHTML =
                    `<span class="final">${lastStableResult}</span><span class="interim">${interimTranscript}</span>`;
            }
        }

        // 5) Авто-стоп при хорошем совпадении (УЛУЧШЕНО: учитываем активность распознавания)
        const expectedText = currentSentence.text ?? '';

        // ИСПРАВЛЕНО: Используем только финальные результаты для стабильного процента
        // Промежуточные результаты (interim) постоянно меняются и создают иллюзию высокого процента,
        // который потом падает когда результаты становятся финальными
        const finalTextForPercent = recognition.finalTranscript || '';

        // Для отображения процента используем только финальные результаты (стабильные)
        // Промежуточные результаты игнорируем для процента, но показываем пользователю в тексте
        let currentPercent = 0;
        if (finalTextForPercent) {
            // Есть финальные результаты - используем их
            currentPercent = computeMatchPercentASR(expectedText, finalTextForPercent);
        } else if (interimTranscript && interimTranscript.split(/\s+/).length >= 3) {
            // Нет финальных, но есть промежуточные - показываем только если достаточно длинный (>=3 слова)
            // Это предотвращает скачки процента от первых букв
            currentPercent = computeMatchPercentASR(expectedText, interimTranscript);
        }

        count_percent.textContent = currentPercent;

        // Обновляем время последней активности распознавания
        lastRecognitionTime = Date.now();

        // Сбрасываем таймер неактивности (если был)
        if (recognitionActivityTimer) {
            clearTimeout(recognitionActivityTimer);
            recognitionActivityTimer = null;
        }

        // УЛУЧШЕНО: Автостоп только если:
        // 1. Процент >= порога
        // 2. Нет активности распознавания в течение 1.5 секунд (пользователь закончил говорить)
        // 3. ИЛИ процент >= 95% (почти идеальное совпадение - останавливаем быстрее)
        if (AUTO_STOP_ENABLED && currentPercent >= AUTO_STOP_THRESHOLD) {
            // Если процент очень высокий (>=95%), останавливаем быстрее (без ожидания неактивности)
            if (currentPercent >= 95) {
                if (!autoStopTimer) {
                    autoStopTimer = setTimeout(() => {
                        autoStopTimer = null;
                        stopRecording('auto');
                    }, AUTO_STOP_STABLE_MS);
                }
            } else {
                // Для 80-94%: ждем отсутствия активности распознавания 1.5 секунды
                // Это предотвращает преждевременную остановку, если пользователь еще говорит
                if (!autoStopTimer) {
                    // Сбрасываем таймер активности (если был)
                    if (recognitionActivityTimer) {
                        clearTimeout(recognitionActivityTimer);
                    }

                    // Запускаем таймер: через 1.5 секунды проверяем, была ли активность
                    recognitionActivityTimer = setTimeout(() => {
                        const timeSinceLastActivity = Date.now() - lastRecognitionTime;

                        // Если прошло 1.5 секунды без новых результатов - запускаем финальный таймер
                        if (timeSinceLastActivity >= 1500) {
                            autoStopTimer = setTimeout(() => {
                                autoStopTimer = null;
                                stopRecording('auto');
                            }, AUTO_STOP_STABLE_MS);
                        }
                        recognitionActivityTimer = null;
                    }, 1500);
                }
            }
        } else if (autoStopTimer) {
            // Если процент упал ниже порога - отменяем автостоп
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }
    };

    // Функция проверки значимости изменения результата
    function isSignificantChange(newText, oldText) {
        if (!oldText) return true; // Первый результат всегда значим

        const newWords = newText.trim().split(/\s+/).filter(w => w.length > 0);
        const oldWords = oldText.trim().split(/\s+/).filter(w => w.length > 0);

        // Изменение считается значимым если:
        // 1. Добавлено/удалено более 2 слов
        if (Math.abs(newWords.length - oldWords.length) > 2) {
            return true;
        }

        // 2. Изменено более 30% текста (по словам)
        const commonWords = newWords.filter(w => oldWords.includes(w)).length;
        const totalWords = Math.max(newWords.length, oldWords.length);
        if (totalWords === 0) return false;

        const similarity = commonWords / totalWords;
        return similarity < 0.7; // Менее 70% совпадения = значимое изменение
    }

    recognition.onerror = (event) => {
        const code = event?.error;
        if (code === 'aborted' || code === 'no-speech' || code === 'audio-capture') {
            console.debug('SpeechRecognition notice:', code);
            return; // не считаем это ошибками
        }
        console.error('SpeechRecognition error:', code);

        // Специальная обработка ошибки сети (нет интернета)
        if (code === 'network') {
            if (userAudioAnswer) {
                userAudioAnswer.innerHTML = '<span class="error">Нет подключения к интернету. Web Speech API требует интернет для работы.</span>';
            }
            console.error('Web Speech API требует интернет для работы. Ошибка сети.');
            return;
        }

        // Остальные ошибки
        if (userAudioAnswer) {
            userAudioAnswer.innerHTML = `<span class="error">Ошибка распознавания: ${code}</span>`;
        }
    };

    recognition.onend = () => {
        // Проверяем, что запись все еще активна
        if (mediaRecorder?.state !== 'recording') {
            return;
        }

        const original = currentSentence.text.toLowerCase().trim();
        const spoken = (recognition.finalTranscript || '').toLowerCase().trim();

        const origASR = simplifyText(prepareTextForASR(original)).join(" ");
        const spokASR = simplifyText(prepareTextForASR(spoken)).join(" ");
        if (origASR === spokASR) {
            // может в этом месте надо ставить отметку о вполненном аудио
            disableRecordButton(false);

            const nextBtn = document.getElementById('checkNext');
            if (nextBtn) nextBtn.focus();
        } else {
            console.log("Голос не совпал с текстом.");
            // Пробуем продолжить распознавание, если запись еще идет
            if (mediaRecorder?.state === 'recording' && recognition) {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Не удалось продолжить распознавание:', e);
                }
            }
        }
    };
}

// Обновление индикатора записи (серая/красная кнопка)
function updateRecordingIndicator(state) {
    const indicator = document.getElementById('recordingIndicator');
    if (!indicator) return;

    const normalized = (state === true) ? 'recording'
        : (state === false) ? 'hidden'
        : String(state || 'hidden');

    if (normalized === 'hidden') {
        indicator.style.display = '';
        indicator.style.visibility = 'hidden';
        indicator.style.opacity = '0';
        indicator.classList.remove('recording');
        return;
    }

    indicator.style.display = '';
    indicator.style.visibility = 'visible';
    indicator.style.opacity = '1';

    if (normalized === 'recording') {
        indicator.classList.add('recording');
        indicator.title = 'Идет запись';
        // Обновляем иконку на "circle" (красную при записи)
        const icon = indicator.querySelector('i[data-lucide]');
        if (icon) {
            icon.setAttribute('data-lucide', 'circle');
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    } else {
        indicator.classList.remove('recording');
        indicator.title = 'Подготовка записи';
        // Иконка уже должна быть "circle" (серая когда не записываем)
        const icon = indicator.querySelector('i[data-lucide]');
        if (icon && icon.getAttribute('data-lucide') !== 'circle') {
            icon.setAttribute('data-lucide', 'circle');
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    }
}

function disableRecordButton(active) {
    const recordBtn = document.getElementById('recordButton');
    if (!recordBtn) return;

    // включить/выключить
    recordBtn.disabled = !active;
    recordBtn.classList.toggle('disabled', !active);

    // если кто-то успел затереть разметку, восстановим её один раз
    if (!recordBtn.querySelector('#recordStateIcon')) {
        recordBtn.innerHTML = '<i data-lucide="mic"></i><span id="recordStateIcon" class="state-icon"></span>';
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // В «не записывает» показываем квадрат
    setRecordStateIcon('square');

}

function restoreRecordButtonAvailability(reason = '') {
    try {
        const remaining = getRemainingAudio(currentSentence);
        // Визуально всегда показываем "квадрат" (а setRecordStateIcon сам покажет чек если remaining=0)
        setRecordStateIcon('square');
        if (remaining > 0) {
            disableRecordButton(true);
        } else {
            disableRecordButton(false);
        }

        // Если последняя попытка распознавания была не засчитана — оставляем фокус на записи
        if (window.__forceFocusRecordAfterRecognition) {
            window.__forceFocusRecordAfterRecognition = false;
            const rb = document.getElementById('recordButton');
            if (rb && !rb.disabled) {
                // Два кадра: переживаем перерисовки/инициализации иконок/плееров, которые могут украсть фокус.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        try { rb.focus(); } catch (e) {}
                    });
                });
            }
        }
    } catch (e) {
        console.warn('[restoreRecordButtonAvailability] failed', reason, e);
    }
}

function setupVisualizer(stream) {
    // Проверяем, что поток все еще активен
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some(track => track.readyState === 'live')) {
        console.warn('⚠️ Поток не активен, визуализация не может быть инициализирована');
        return;
    }

    // 1. СНАЧАЛА ОЧИСТИМ СТАРЫЙ AudioContext
    if (vizAC && vizAC.state !== 'closed') {
        try {
            vizAC.close(); // Закрываем старый контекст
        } catch (e) {
            console.warn('Ошибка закрытия старого AudioContext:', e);
        }
        vizAC = null;  // Обнуляем переменную
    }

    const canvas = audioVisualizer;               // у тебя уже есть ссылка по id
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Масштаб под плотность пикселей, чтобы не было мыла
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Переиспользуем контекст, если уже создавали
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!vizAC) vizAC = new AC();
    if (vizAC.state === 'suspended') {
        vizAC.resume().catch(() => { });
    }

    // Узлы для анализа
    vizAnalyser = vizAC.createAnalyser();
    vizAnalyser.fftSize = 256;

    // Проверяем, что поток все еще активен перед созданием источника
    const tracksStillLive = audioTracks.every(track => track.readyState === 'live');
    if (!tracksStillLive) {
        console.warn('⚠️ Треки стали неактивными перед созданием источника визуализации');
        return;
    }

    vizSource = vizAC.createMediaStreamSource(stream);
    vizSource.connect(vizAnalyser);

    const bufferLength = vizAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    vizActive = true;

    const draw = () => {
        if (!vizActive) return;
        vizRAF = requestAnimationFrame(draw);

        vizAnalyser.getByteFrequencyData(dataArray);

        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.clearRect(0, 0, w, h);

        // ширина и зазор столбиков
        const barWidth = Math.max((w / bufferLength) * 1.6, 2);

        // ЦВЕТ СТОЛБИКОВ — меняй здесь (раньше у тебя было rgb(100, 150, 255))
        ctx.fillStyle = VIS_BAR_COLOR;

        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 255;
            const barHeight = v * (h - 4);
            ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    };

    draw();
}

function stopVisualization() {
    vizActive = false;

    if (vizRAF) {
        cancelAnimationFrame(vizRAF);
        vizRAF = null;
    }

    // Разрываем цепочку
    try { vizSource && vizSource.disconnect(); } catch (_) { }
    try { vizAnalyser && vizAnalyser.disconnect(); } catch (_) { }
    vizSource = null;
    vizAnalyser = null;

    // Усыпим контекст (быстрый последующий старт, без «тишины» на секунду)
    if (vizAC && vizAC.state === 'running') {
        vizAC.suspend().catch(() => { });
    }

    // Почистим канву визуально
    if (audioVisualizer) {
        const ctx = audioVisualizer.getContext('2d');
        ctx.clearRect(0, 0, audioVisualizer.width, audioVisualizer.height);
    }
}


// ===== Аудио-функционал КОНЕЦ =====

async function ensureKeyboardLayoutsLoaded() {
    if (keyboardLayoutsCache) return keyboardLayoutsCache;
    if (keyboardLayoutsLoadPromise) return keyboardLayoutsLoadPromise;

    if (typeof fetch !== 'function') {
        keyboardLayoutsCache = {};
        return keyboardLayoutsCache;
    }

    keyboardLayoutsLoadPromise = fetch('/static/data/keyboard_layouts.json', { cache: 'no-cache' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            if (!data || typeof data !== 'object') {
                keyboardLayoutsCache = {};
                return keyboardLayoutsCache;
            }
            keyboardLayoutsCache = Object.keys(data).reduce((acc, lang) => {
                if (lang && typeof lang === 'string') {
                    acc[lang.toLowerCase()] = data[lang];
                }
                return acc;
            }, {});
            return keyboardLayoutsCache;
        })
        .catch((error) => {
            console.error('❌ Ошибка загрузки раскладок клавиатуры:', error);
            keyboardLayoutsCache = {};
            return keyboardLayoutsCache;
        })
        .finally(() => {
            keyboardLayoutsLoadPromise = null;
        });

    return keyboardLayoutsLoadPromise;
}

function getKeyColorVarsByCode(code) {
    const c = String(code || '');

    const grayCodes = new Set([
        'Escape',
        'Tab',
        'CapsLock',
        'ShiftLeft',
        'ShiftRight',
        'Backspace',
        'Backslash'
    ]);

    const purpleCodes = new Set(['Digit1', 'Digit2', 'KeyQ', 'KeyA', 'KeyZ']);
    const lightgreenCodes = new Set([
        'Digit3',
        'KeyW',
        'KeyS',
        'KeyX',
        'Digit0',
        'Minus',
        'Equal',
        'KeyP',
        'BracketLeft',
        'BracketRight',
        'Semicolon',
        'Quote',
        'Enter',
        'Slash'
    ]);
    const pinkCodes = new Set(['Digit4', 'KeyE', 'KeyD', 'KeyC', 'Digit8', 'KeyI', 'KeyK', 'Comma']);
    const mintCodes = new Set(['Digit5', 'Digit6', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyV', 'KeyB']);
    const yellowCodes = new Set(['Digit7', 'KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM']);
    const orangeCodes = new Set(['Digit9', 'KeyO', 'KeyL', 'Period']);

    if (grayCodes.has(c)) {
        return {
            bg: 'var(--color-button-gray, #eeede8ff)',
            fg: 'var(--color-button-text-gray, rgb(168, 167, 155))'
        };
    }
    if (purpleCodes.has(c)) {
        return {
            bg: 'var(--color-button-purple, #c8c9fbff)',
            fg: 'var(--color-button-text-purple, rgb(63, 66, 147))'
        };
    }
    if (lightgreenCodes.has(c)) {
        return {
            bg: 'var(--color-button-lightgreen, #bbf1caff)',
            fg: 'var(--color-button-text-lightgreen, #366f40ff)'
        };
    }
    if (pinkCodes.has(c)) {
        return {
            bg: 'var(--color-button-pink, #f5c0caff)',
            fg: 'var(--color-button-text-pink, #802c35ff)'
        };
    }
    if (mintCodes.has(c)) {
        return {
            bg: 'var(--color-button-mint, #aae7e4ff)',
            fg: 'var(--color-button-text-mint, #28615fff)'
        };
    }
    if (yellowCodes.has(c)) {
        return {
            bg: 'var(--color-button-yellow, rgb(252, 235, 163))',
            fg: 'var(--color-button-text-yellow, rgb(255, 198, 9))'
        };
    }
    if (orangeCodes.has(c)) {
        return {
            bg: 'var(--color-button-orange, #f9d6a1ff)',
            fg: 'var(--color-button-text-orange, rgb(250, 147, 21))'
        };
    }

    return {
        bg: 'var(--color-button-gray, #eeede8ff)',
        fg: 'var(--color-text, #224156)'
    };
}

function renderKeyboardHint(container, layout, shiftMode = false) {
    if (!container) return;

    container.classList.add('virtual-keyboard');
    container.innerHTML = '';

    if (!layout || !layout.rows) {
        container.innerHTML = '<div class="vk-empty">Раскладка для текущего языка отсутствует</div>';
        return;
    }

    const body = document.createElement('div');
    body.className = 'vk-body';

    const rawRows = Array.isArray(layout.rows) ? layout.rows : [];
    const rows = rawRows.map(row => Array.isArray(row) ? row : []);
    const filteredRows = rows.map((row, idx) => {
        if (idx !== rows.length - 1) return row;
        const spaceKey = row.find(k => (k && (k.code === 'Space' || k.label === 'Space')));
        return spaceKey ? [spaceKey] : [];
    }).filter(r => Array.isArray(r) && r.length > 0);

    const modifierCodes = new Set(['Tab', 'CapsLock', 'Enter', 'Backspace', 'ShiftLeft', 'ShiftRight']);
    const modLabelMap = {
        Tab: 'TAB',
        CapsLock: 'CAPS',
        Enter: '',
        Backspace: '',
        ShiftLeft: 'SHIFT',
        ShiftRight: 'SHIFT'
    };

    const fixedUnitsByCode = {
        Tab: 1.6,
        CapsLock: 1.9,
        ShiftLeft: 2.35,
        ShiftRight: 2.35,
        Backspace: 2.1,
        Enter: 2.25,
        Backslash: 1
    };

    const homeCodes = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']);
    const tactileFCodes = new Set(['KeyF']);
    const tactileJCodes = new Set(['KeyJ']);

    const getKeyUnit = (def) => {
        const code = String(def?.code || '');
        if (fixedUnitsByCode[code] != null) return Number(fixedUnitsByCode[code]);
        if (Number.isFinite(def?.size)) return Number(def.size);
        return 1;
    };

    const sumRowUnits = (row) => {
        return (Array.isArray(row) ? row : []).reduce((sum, k) => {
            const def = k && typeof k === 'object' ? k : {};
            return sum + getKeyUnit(def);
        }, 0);
    };

    const findRowByCodes = (codes) => {
        return filteredRows.find(r => Array.isArray(r) && r.some(k => codes.has(String(k?.code || '')))) || null;
    };

    const secondRow = findRowByCodes(new Set(['Tab', 'Backslash']));
    const secondRowUnits = secondRow ? sumRowUnits(secondRow) : null;

    if (secondRowUnits != null && Number.isFinite(secondRowUnits) && secondRowUnits > 0) {
        const backspaceRow = findRowByCodes(new Set(['Backspace']));
        if (backspaceRow) {
            const otherUnits = backspaceRow.reduce((sum, k) => {
                const def = k && typeof k === 'object' ? k : {};
                if (String(def.code || '') === 'Backspace') return sum;
                return sum + getKeyUnit(def);
            }, 0);
            const needed = Math.max(1, secondRowUnits - otherUnits);
            fixedUnitsByCode.Backspace = Number(needed.toFixed(2));
        }

        const enterRow = findRowByCodes(new Set(['Enter']));
        if (enterRow) {
            const otherUnits = enterRow.reduce((sum, k) => {
                const def = k && typeof k === 'object' ? k : {};
                if (String(def.code || '') === 'Enter') return sum;
                return sum + getKeyUnit(def);
            }, 0);
            const needed = Math.max(1, secondRowUnits - otherUnits);
            fixedUnitsByCode.Enter = Number(needed.toFixed(2));
        }

        const shiftRow = findRowByCodes(new Set(['ShiftRight']));
        if (shiftRow) {
            const otherUnits = shiftRow.reduce((sum, k) => {
                const def = k && typeof k === 'object' ? k : {};
                if (String(def.code || '') === 'ShiftRight') return sum;
                return sum + getKeyUnit(def);
            }, 0);
            const needed = Math.max(1, secondRowUnits - otherUnits);
            fixedUnitsByCode.ShiftRight = Number(needed.toFixed(2));
        }
    }

    filteredRows.forEach((row, rowIndex) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'vk-row';
        rowEl.dataset.rowIndex = String(rowIndex);

        if (Array.isArray(row) && row.length === 1) {
            const only = row[0] && typeof row[0] === 'object' ? row[0] : null;
            if (only && (only.code === 'Space' || only.label === 'Space')) {
                rowEl.classList.add('vk-row-space');
            }
        }

        (row || []).forEach((keyDef, keyIndex) => {
            const def = keyDef && typeof keyDef === 'object' ? keyDef : {};

            const code = String(def.code || '');

            const keyEl = document.createElement('div');
            keyEl.className = 'vk-key';
            keyEl.dataset.keyIndex = String(keyIndex);

            const fingerClass = def.finger ? `finger-${def.finger}` : 'finger-unknown';
            keyEl.classList.add(fingerClass);

            const unitSize = Number.isFinite(def.size) ? def.size : 1;
            keyEl.style.setProperty('--vk-key-unit', unitSize);

            if (fixedUnitsByCode[code] != null) {
                keyEl.style.setProperty('--vk-key-unit', String(fixedUnitsByCode[code]));
            }

            if (def.code) {
                keyEl.dataset.code = def.code;
            }

            if (code === 'Enter') {
                keyEl.classList.add('vk-key-enter');
            }

            if (code === 'ShiftLeft' || code === 'ShiftRight') {
                keyEl.classList.add('vk-key-shift');
                if (shiftMode) {
                    keyEl.classList.add('vk-key-shift-pressed');
                }
            }

            const colorVars = getKeyColorVarsByCode(def.code);
            keyEl.style.background = colorVars.bg;
            keyEl.style.color = colorVars.fg;

            const shiftLabel = def.shiftLabel ? String(def.shiftLabel) : '';
            const label = def.label ? String(def.label) : '';
            const altLabel = def.altLabel ? String(def.altLabel) : '';

            const isSpace = def.code === 'Space' || label === 'Space';
            const isModifier = modifierCodes.has(String(def.code || ''));

            const labelSpan = document.createElement('span');
            labelSpan.className = 'vk-key-label';

            if (isSpace) {
                labelSpan.textContent = '';
                keyEl.classList.add('vk-key-space');
            } else if (isModifier) {
                const code = String(def.code || '');
                if (Object.prototype.hasOwnProperty.call(modLabelMap, code)) {
                    labelSpan.textContent = String(modLabelMap[code]);
                } else {
                    labelSpan.textContent = label.toUpperCase();
                }
                keyEl.classList.add('vk-key-mod');
            } else {
                labelSpan.textContent = (shiftMode && shiftLabel) ? shiftLabel : label;
            }

            keyEl.appendChild(labelSpan);

            if (code === 'Enter') {
                const icon = document.createElement('i');
                icon.setAttribute('data-lucide', 'corner-down-left');
                icon.className = 'vk-key-icon';
                keyEl.appendChild(icon);
            }

            if (code === 'Backspace') {
                const icon = document.createElement('i');
                icon.setAttribute('data-lucide', 'move-left');
                icon.className = 'vk-key-icon';
                keyEl.appendChild(icon);
            }

            if (homeCodes.has(code)) {
                keyEl.classList.add('vk-key-home');
            }

            if (tactileFCodes.has(code)) {
                keyEl.classList.add('vk-key-tactile', 'vk-key-tactile-f');
            }

            if (tactileJCodes.has(code)) {
                keyEl.classList.add('vk-key-tactile', 'vk-key-tactile-j');
            }

            if (altLabel) {
                const altSpan = document.createElement('span');
                altSpan.className = 'vk-key-alt';
                altSpan.textContent = altLabel;
                keyEl.appendChild(altSpan);
                keyEl.classList.add('vk-key-has-alt');
            }

            rowEl.appendChild(keyEl);
        });

        body.appendChild(rowEl);
    });

    container.appendChild(body);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try {
            window.lucide.createIcons();
        } catch (e) {
        }
    }
}

if (!window.__dictafanLucideIconsRefreshedOnce) {
    window.__dictafanLucideIconsRefreshedOnce = true;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try {
            window.lucide.createIcons();
        } catch (e) {
        }
    }
}

async function setupVirtualKeyboard(langCode) {
    try {
        if (!virtualKeyboardContainer) {
            return;
        }

        const normalizedLang = (langCode || currentDictation.language_original || 'en').toLowerCase();

        const layouts = await ensureKeyboardLayoutsLoaded();
        const layout = layouts?.[normalizedLang] || null;
        lastKeyboardHintLayout = layout;
        renderKeyboardHint(virtualKeyboardContainer, layout, virtualKeyboardShiftPressed);
        enforceVirtualKeyboardFitsViewport();

        if (virtualKeyboardToggle && !virtualKeyboardToggle.dataset.listenerAttached) {
            virtualKeyboardToggle.addEventListener('change', async (event) => {
                try {
                    const isChecked = Boolean(event.target.checked);
                    if (isChecked) {
                        virtualKeyboardContainer.removeAttribute('hidden');
                        virtualKeyboardContainer.style.display = '';
                        const langForRender = (currentDictation.language_original || normalizedLang).toLowerCase();
                        const layoutsInner = await ensureKeyboardLayoutsLoaded();
                        const layoutInner = layoutsInner?.[langForRender] || null;
                        lastKeyboardHintLayout = layoutInner;
                        renderKeyboardHint(virtualKeyboardContainer, layoutInner, virtualKeyboardShiftPressed);
                        enforceVirtualKeyboardFitsViewport();
                    } else {
                        virtualKeyboardContainer.setAttribute('hidden', 'true');
                        virtualKeyboardContainer.style.display = 'none';
                    }
                } catch (error) {
                    console.error('❌ Ошибка при переключении виртуальной клавиатуры:', error);
                    // Скрываем клавиатуру при ошибке
                    if (virtualKeyboardToggle) {
                        virtualKeyboardToggle.checked = false;
                    }
                    if (virtualKeyboardContainer) {
                        virtualKeyboardContainer.setAttribute('hidden', 'true');
                        virtualKeyboardContainer.style.display = 'none';
                    }
                }
            });
            virtualKeyboardToggle.dataset.listenerAttached = 'true';
        }

        if (virtualKeyboardToggle && virtualKeyboardToggle.checked) {
            virtualKeyboardContainer.removeAttribute('hidden');
            virtualKeyboardContainer.style.display = '';
            enforceVirtualKeyboardFitsViewport();
        } else if (virtualKeyboardContainer) {
            virtualKeyboardContainer.setAttribute('hidden', 'true');
            virtualKeyboardContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ Ошибка инициализации виртуальной клавиатуры:', error);
        // Скрываем чекбокс клавиатуры при ошибке, чтобы пользователь не пытался её использовать
        if (virtualKeyboardToggle) {
            virtualKeyboardToggle.checked = false;
            virtualKeyboardToggle.disabled = true;
            virtualKeyboardToggle.title = 'Виртуальная клавиатура недоступна';
        }
        // Скрываем контейнер клавиатуры
        if (virtualKeyboardContainer) {
            virtualKeyboardContainer.style.display = 'none';
            virtualKeyboardContainer.setAttribute('hidden', 'true');
        }
    }
}


function hideVirtualKeyboardIfActive() {
    try {
        if (virtualKeyboardToggle) {
            virtualKeyboardToggle.checked = false;
        }

        if (virtualKeyboardContainer) {
            virtualKeyboardContainer.setAttribute('hidden', 'true');
            virtualKeyboardContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ Ошибка при скрытии виртуальной клавиатуры:', error);
        // Принудительно скрываем контейнер при ошибке
        if (virtualKeyboardContainer) {
            virtualKeyboardContainer.setAttribute('hidden', 'true');
            virtualKeyboardContainer.style.display = 'none';
        }
    }
}


function isRecordingActive() {
    return Boolean(
        (typeof mediaRecorder !== 'undefined' && mediaRecorder && mediaRecorder.state === 'recording') ||
        isRecording
    );
}

function showRecordingPlaybackWarning() {
    const warningText = 'Сначала остановите запись, чтобы прослушать аудио';
    const answer = document.getElementById('userAudioAnswer');
    if (answer) {
        if (!answer.dataset.originalContent) {
            answer.dataset.originalContent = answer.innerHTML || '';
        }
        answer.dataset.showingRecordingWarning = 'true';
        answer.textContent = warningText;

        if (answer._recordingHintTimer) {
            clearTimeout(answer._recordingHintTimer);
        }
        answer._recordingHintTimer = window.setTimeout(() => {
            if (answer.dataset.showingRecordingWarning === 'true' && answer.textContent === warningText) {
                answer.innerHTML = answer.dataset.originalContent || '';
            }
            delete answer.dataset.originalContent;
            delete answer.dataset.showingRecordingWarning;
            delete answer._recordingHintTimer;
        }, 2000);
    }

    const rb = document.getElementById('recordButton');
    if (rb) {
        rb.classList.add('recording-warning');
        window.setTimeout(() => rb.classList.remove('recording-warning'), 500);
    }
}

function blockAudioPlaybackIfRecording() {
    if (!isRecordingActive()) {
        return false;
    }
    showRecordingPlaybackWarning();
    return true;
}


// ===== Сохранение активности в БД ================================================================
/**
 * Сохраняет активность пользователя (perfect/corrected/audio) в БД
 * Активность агрегируется по дням автоматически на сервере
 * @param {string} type_activity - 'perfect', 'corrected' или 'audio'
 */
async function saveActivityToDB(type_activity) {
    try {
        // Временные логи для отладки
        console.log('📤 [CLIENT] Отправка активности на сервер:');
        console.log(`   type_activity: ${type_activity}`);
        console.log(`   dictation_id: ${currentDictation.id}`);

        if (!currentDictation.id || !window.UM) {
            console.warn('⚠️ [CLIENT] Не могу сохранить активность: нет dictation_id или UserManager');
            return;
        }

        // Получаем токен из UserManager (это свойство, а не метод)
        const token = window.UM?.token || localStorage.getItem('jwt_token');
        if (!token) {
            console.warn('⚠️ [CLIENT] Не могу сохранить активность: нет токена');
            return;
        }

        const requestData = {
            dictation_id: currentDictation.id,
            type_activity: type_activity,
            number: 1
        };

        console.log('📤 [CLIENT] Данные для отправки:', requestData);

        const response = await fetch('/api/statistics/activity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            console.warn(`⚠️ [CLIENT] Ошибка сохранения активности ${type_activity}:`, response.status, response.statusText);
            const errorText = await response.text();
            console.warn(`⚠️ [CLIENT] Текст ошибки:`, errorText);
            await enqueueOfflineActivity(type_activity, 1);
            return;
        }

        const result = await response.json();
        console.log(`✅ [CLIENT] Активность ${type_activity} успешно сохранена в БД:`, result);
    } catch (error) {
        console.error(`❌ [CLIENT] Ошибка при сохранении активности ${type_activity}:`, error);
        await enqueueOfflineActivity(type_activity, 1);
        // Не прерываем выполнение, ошибка не критична
    }
}

// ===== Инициализация диктанта =================================================================== 
// ===== Инициализация диктанта =================================================================== 
// ===== Инициализация диктанта =================================================================== 
function loadDictationData() {
    console.log('=======================loadDictationData:');
    const dictationDataElement = document.getElementById('dictation-data');
    if (!dictationDataElement) {
        console.error('Элемент dictation-data не найден');
        return false;
    }

    // Инициализируем новую систему статистики
    const dictationId = dictationDataElement.getAttribute('data-dictation-id');
    if (dictationId && typeof UserActivityHistory !== 'undefined' && typeof ProgressPanel !== 'undefined') {
        // Создаем историю активности
        activityHistory = new UserActivityHistory('/user/api');
        // Сохраняем в глобальную переменную для доступа из других скриптов
        window.activityHistory = activityHistory;
    }

    // Старая система статистики (для совместимости, если нужна)
    if (dictationId && userManager && typeof DictationStatistics !== 'undefined') {
        dictationStatistics = new DictationStatistics(userManager, dictationId);
        window.dictationStatistics = dictationStatistics;
        // Рендерим универсальный виджет прогресса
        const inlineContainer = document.getElementById('progressPanelContainer');
        const modalContainer = document.getElementById('progressPanelModalContainer');
        // Создаем и рендерим универсальную панель прогресса
        window.progressPanel = new ProgressPanel(activityHistory, { saveInterval: 5 });
        progressPanel = window.progressPanel;
        if (inlineContainer) progressPanel.render(inlineContainer, 'inline');
        if (modalContainer) progressPanel.render(modalContainer, 'modal');

        // Инициализация старой статистики
        dictationStatistics.init().then(() => {
            console.log('✅ Старая статистика инициализирована');
            // После инициализации синхронизируем UI
            if (progressPanel) progressPanel.updateUI();
        });
    }

    try {
        // Метаданные диктанта загружены, предложения будут загружены через API

        // Загружаем метаданные диктанта
        currentDictation.id = dictationDataElement.dataset.dictationId || '';
        currentDictation.language_original = dictationDataElement.dataset.languageOriginal || '';
        currentDictation.language_translation = dictationDataElement.dataset.languageTranslation || '';
        currentDictation.title_orig = dictationDataElement.dataset.titleOrig || '';

        // Логируем для отладки
        console.log('📝 Загружен язык из data-атрибутов:', {
            language_original: currentDictation.language_original,
            language_translation: currentDictation.language_translation,
            dictationId: currentDictation.id
        });

        if (!currentDictation.language_original) {
            console.warn('⚠️ language_original пустой! Проверьте data-language-original в HTML');
        }

        // Обновляем язык перевода в интерфейсе
        const translationLanguageElement = document.querySelector('.translation-audio-button-wrapper .language');
        if (translationLanguageElement && currentDictation.language_translation) {
            translationLanguageElement.textContent = currentDictation.language_translation;
            console.log('✅ Обновлен язык перевода в интерфейсе:', currentDictation.language_translation);
        } else if (!translationLanguageElement) {
            console.warn('⚠️ Элемент .translation-audio-button-wrapper .language не найден');
        } else if (!currentDictation.language_translation) {
            console.warn('⚠️ language_translation пустой! Проверьте data-language-translation в HTML');
        }

        applyInputDirection(currentDictation.language_original);
        // Используем LanguageManager для получения country_cod_url
        if (window.LanguageManager && typeof window.LanguageManager.getCountryCodeUrl === 'function') {
            currentDictation.language_cod_url = window.LanguageManager.getCountryCodeUrl(currentDictation.language_original);
        } else {
            console.warn('LanguageManager не доступен, используем fallback');
            currentDictation.language_cod_url = `${currentDictation.language_original}-${currentDictation.language_original.toUpperCase()}`;
        }

        // Предложения будут загружены через API, здесь только метаданные
        console.log('Данные диктанта:', currentDictation);

        return true;
    } catch (error) {
        console.error('Ошибка загрузки данных диктанта:', error);
        return false;
    }
}


/**
 * Загружает предложения диктанта ТОЛЬКО из IndexedDB (offline-first)
 */
async function loadSentencesFromIndexedDb() {
    if (!currentDictation.id || !currentDictation.language_original || !currentDictation.language_translation) {
        console.error('❌ Недостаточно данных для загрузки предложений:', currentDictation);
        return false;
    }

    const dictId = String(currentDictation.id);
    const langOrig = String(currentDictation.language_original);
    const langTr = String(currentDictation.language_translation);

    const rawUserId = String(getDraftUserIdForKey());

    const candidateKeys = [];
    candidateKeys.push(`${rawUserId}:${dictId}:${langOrig}:${langTr}`);
    if (rawUserId !== 'anon') {
        candidateKeys.push(`anon:${dictId}:${langOrig}:${langTr}`);
    }

    // Also try numeric id variants for safety.
    try {
        const numericId = parseInt(dictId.replace(/^dict_/, ''), 10);
        if (Number.isFinite(numericId)) {
            candidateKeys.push(`${rawUserId}:${numericId}:${langOrig}:${langTr}`);
            candidateKeys.push(`${rawUserId}:dict_${numericId}:${langOrig}:${langTr}`);
            candidateKeys.push(`anon:dict_${numericId}:${langOrig}:${langTr}`);
        }
    } catch (e) {
    }

    async function findAnyMatchingDictationEntry() {
        try {
            const db = await openDraftDb();
            return await new Promise((resolve) => {
                const tx = db.transaction('dictations', 'readonly');
                const store = tx.objectStore('dictations');
                const req = store.openCursor();
                req.onsuccess = () => {
                    const cursor = req.result;
                    if (!cursor) return resolve(null);
                    const v = cursor.value;
                    if (v && v.dictationId === dictId && v.langOrig === langOrig && v.langTr === langTr) {
                        return resolve(v);
                    }
                    cursor.continue();
                };
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    try {
        let cached = null;
        for (const key of candidateKeys) {
            cached = await idbGet('dictations', key);
            const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
            if (sentences.length) {
                break;
            }
            cached = null;
        }

        if (!cached) {
            cached = await findAnyMatchingDictationEntry();
        }

        const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
        if (!sentences.length) {
            console.warn('❌ Диктант не найден в IndexedDB (dictations):', candidateKeys[0]);
            return false;
        }

        allSentences = sentences;
        try {
            allSentences.sort((a, b) => {
                const ap = (a && a.position !== undefined && a.position !== null && isFinite(Number(a.position))) ? Number(a.position) : null;
                const bp = (b && b.position !== undefined && b.position !== null && isFinite(Number(b.position))) ? Number(b.position) : null;
                if (ap !== null && bp !== null) return ap - bp;
                if (ap !== null) return -1;
                if (bp !== null) return 1;
                const ak = a && a.key ? String(a.key) : '';
                const bk = b && b.key ? String(b.key) : '';
                return ak.localeCompare(bk);
            });
        } catch (e) {
        }
        allSentences.forEach(s => {
            if (s.number_of_perfect === undefined) s.number_of_perfect = 0;
            if (s.number_of_corrected === undefined) s.number_of_corrected = 0;
            if (s.number_of_audio === undefined) s.number_of_audio = 0;
        });

        console.log('✅ Загружено предложений из IndexedDB:', allSentences.length);
        return true;
    } catch (error) {
        console.error('❌ Ошибка загрузки предложений из IndexedDB:', error);
        return false;
    }
}

async function initializeDictation() {
    // Сначала загружаем данные
    console.log('=======================initializeDictation:');

    // Загружаем настройки аудио из данных пользователя (до загрузки черновика)
    await loadAudioSettingsFromUser();

    // Загружаем метаданные диктанта (ID, языки)
    if (!loadDictationData()) {
        alert('Ошибка загрузки данных диктанта');
        return;
    }

    // Загружаем предложения ТОЛЬКО из IndexedDB
    const sentencesLoaded = await loadSentencesFromIndexedDb();
    if (!sentencesLoaded) {
        console.warn('⚠️ Диктант не найден в IndexedDB. Загружаю из интернета и сохраняю в кеш.');
        try {
            showSaveToast('Данных нет в кеше. Загружаю из интернета…', 'info', 2500);
        } catch (e) {
        }

        showDictationCacheFetchOverlay('Загрузка диктанта в кеш…');
        try {
            await fetchSentencesFromServerAndCache();
        } catch (e) {
            console.error('❌ Не удалось загрузить диктант из интернета:', e);
            hideDictationCacheFetchOverlay();
            showNoSelectionModal('Не удалось загрузить диктант. Проверь интернет и обнови страницу.');
            return;
        }

        const loadedAgain = await loadSentencesFromIndexedDb();
        hideDictationCacheFetchOverlay();
        if (!loadedAgain) {
            showNoSelectionModal('Не удалось сохранить диктант в кеш. Обнови страницу.');
            return;
        }
    }

    // Инициализируем виртуальную клавиатуру с обработкой ошибок
    // Если клавиатура не загрузится, это не должно блокировать работу диктанта
    try {
        await setupVirtualKeyboard(currentDictation.language_original);
    } catch (error) {
        console.error('❌ Критическая ошибка при инициализации виртуальной клавиатуры:', error);
        // Продолжаем работу без клавиатуры
    }

    // Проверяем наличие черновика (черновик может перезаписать настройки пользователя)
    const hasDraft = await loadAndApplyDraft();
    hasDraftLoaded = hasDraft; // Сохраняем флаг в глобальной переменной для использования в startGame()

    // После загрузки профиля + возможного черновика синхронизируем модалку настроек,
    // чтобы она не показывала дефолты, если реальные настройки пришли позже.
    try {
        if (audioSettingsModalPanel) {
            audioSettingsModalPanel.setSettings({
                start: playSequenceStart,
                typo: playSequenceTypo,
                success: playSequenceSuccess,
                repeats: REQUIRED_PASSED_COUNT,
                required_passed_star_half: REQUIRED_PASSED_STAR_HALF,
                without_entering_text: window.audioSettingsWithoutEnteringText || false,
                show_text: window.audioSettingsShowText || false,
                speech_recognition_mode: speechRecognitionMode
            });
        }
    } catch (e) {
    }

    // Всегда включаем периодическое автосохранение: даже если черновика не было,
    // прогресс должен сохраняться локально без Ctrl+S.
    setSaveButtonStatus('clean');
    startDraftPeriodicAutosave();

    // Если черновика нет, инициализируем только первое предложение как checked
    if (!hasDraft) {
        let firstSentenceSelected = false;
        allSentences.forEach((s, index) => {
            if (s.selection_state === undefined) {
                const calculatedState = calculateSentenceSelectionState(s);
                if (calculatedState === 'completed') {
                    s.selection_state = 'completed';
                } else {
                    // Выбираем только первое предложение (которое не completed)
                    if (!firstSentenceSelected && calculatedState !== 'completed') {
                        s.selection_state = 'checked';
                        firstSentenceSelected = true;
                    } else {
                        s.selection_state = 'unchecked';
                    }
                }
            }
        });
        // Обновляем selectedSentences - только первое предложение
        selectedSentences = allSentences
            .filter(s => s.selection_state === 'checked')
            .map(s => s.key);
    }

    renderSelectionTable();
    if (hasDraft) {
        updateStats();
    }

    // Если есть интернет и есть pending в outbox — синхронизируем в фоне.
    syncDraftIfOnline(false).catch(() => {});

    // Останавливаем таймер при открытии модального окна списка предложений
    stopTimer();
    // Останавливаем таймер бездействия
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Обновляем время в модальном окне перед показом
    const modalTimerEl = document.getElementById('modal_timer') || window.modalTimerElement;
    if (modalTimerEl) {
        const snapshot = getProgressTimerSnapshot();
        updateDictationTimerDisplay(getTimerDisplayMs(snapshot), modalTimerEl);
    }

    // Также обновляем через progressPanel для синхронизации
    const panel = getProgressPanelInstance();
    if (panel) {
        panel.updateTimer();
    }

    // Записываем историю при открытии модального окна
    if (activityHistory && currentDictation.id) {
        activityHistory.startSession(currentDictation.id);
        activityHistory.saveSession().catch(err => {
            console.warn('Не удалось сохранить историю при открытии модального окна:', err);
        });
    }

    // Показываем модальное окно сразу
    startModal.style.display = 'flex';
    // Инициализируем иконки Lucide после открытия модального окна
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
    confirmStartBtn.focus();
}


function showCurrentSentence(showTabloIndex, showSentenceIndex) {
    // Очищаем предыдущую запись
    if ((mediaRecorder && mediaRecorder.state === 'recording') || (unifiedSpeechRecognizer && unifiedSpeechRecognizer.state && unifiedSpeechRecognizer.state.isRecording)) {
        stopRecording('change_sentence');
    }

    // расставляем цвета и иконки в крайни
    applyStatusPreviosNext();

    currentSentenceIndex = showSentenceIndex;
    currentSentence = makeByKeyMap(allSentences).get(selectedSentences[currentSentenceIndex]);
    // Обновляем глобальную переменную для UnifiedSpeechRecognition
    window.currentSentence = currentSentence;

    // Анти-обход: считаем старты предложения
    if (currentSentence) {
        const old = Number(currentSentence.attempts_total) || 0;
        currentSentence.attempts_total = old + 1;
        updateTableRowStatus(currentSentence);
        scheduleDraftAutosave('sentenceStart');
    }

    // Показываем число неуспешных нажатий "Проверить" по этому предложению
    updateErrorCountLabel(Number(currentSentence?.error_count) || 0);

    // Обновляем простой счетчик предложений
    updateSimpleSentenceCounter();

    // Сброс предыдущей записи пользователя (чтоб плеер не тащил старый blob) // NEW
    clearUserAudio();                                                                 // NEW
    // Актуализируем видимость панели аудио (на случай R=0)
    updateAudioPanelVisibility();
    refreshAudioUIForCurrentSentence();

    try {
        const percentEl = getCountPercentEl();
        if (percentEl) {
            percentEl.textContent = 0;
        }
    } catch (e) {
    }

    // Сбрасываем состояние аудио-ответа
    userAudioAnswer.innerHTML = '';

    // Останавливаем все аудио
    if (window.AudioManager) {
        window.AudioManager.stop();
    }

    // Обновляем AudioPlayerVisual с путями к аудио текущего предложения
    if (window.originalAudioVisual) {
        window.originalAudioVisual.setAudioPaths({
            audio: resolveSentenceAudioUrl(currentSentence, 'audio'),
            audio_a: '',
            audio_f: '',
            audio_m: ''
        });
        window.originalAudioVisual.reset();
    }

    // Обновляем отображение счетчика записей
    setRecordStateIcon('square');

    // Включаем/отключаем кнопку записи в зависимости от счетчика
    const recordButton = document.getElementById('recordButton');
    if (recordButton) {
        setRecordStateIcon('square');
        if (getRemainingAudio(currentSentence) === 0) {
            recordButton.disabled = true;
            recordButton.classList.add('disabled');
        } else {
            recordButton.disabled = false;
            recordButton.classList.remove('disabled');
        }
    }

    // Нарисовать «микрофоны/галочки» для текущего предложения
    renderUserAudioTablo();

    audioVisualizer.style.display = 'block';
    count_percent.style.display = 'block';
    userAudioAnswer.style.display = 'block';

    // Установка подсказок ===== 
    // Если есть explanation, показываем его, иначе показываем text
    const explanationHint = currentSentence.explanation && currentSentence.explanation.trim()
        ? currentSentence.explanation.trim()
        : '';
    const initialHint = explanationHint || currentSentence.text;
    const correctAnswerEl = document.getElementById("correctAnswer");
    if (correctAnswerEl) {
        correctAnswerEl.innerHTML = initialHint;
        // Не скрываем подсказку сразу - applyAudioSettingsToUI() решит, показывать ли её
        // Если режим "Только аудио" + "Показывать подсказку", то она будет показана
        const withoutEnteringText = window.audioSettingsWithoutEnteringText || false;
        const showText = window.audioSettingsShowText || false;
        if (!(withoutEnteringText && showText)) {
            correctAnswerEl.style.display = "none";
        }
    }

    // Обновляем поле подсказки для аудио (если оно существует)
    const audioHint = document.getElementById('audioHint');
    if (audioHint && currentSentence && currentSentence.text) {
        audioHint.textContent = currentSentence.text;
    }

    // Применяем настройки аудио к UI
    applyAudioSettingsToUI();

    // Обновить отображение спикера / подсказки в поле #speaker
    // ИСПРАВЛЕНО: 
    //  - если диктант НЕ диалог, показываем только подсказку (explanationHint или пусто)
    //  - если диктант диалог, показываем "ИмяСпикера: подсказка" или просто "ИмяСпикера:"
    const speakerDiv = document.getElementById('speaker');
    if (speakerDiv) {
        if (!dictationIsDialog) {
            // Обычный (не диалоговый) диктант — показываем только пояснение, без спикера
            if (explanationHint) {
                speakerDiv.textContent = `${explanationHint}`;
            } else {
                speakerDiv.textContent = '';
            }
        } else {
            // Диктант является диалогом - показываем спикера
            const speakerId = currentSentence && currentSentence.speaker ? String(currentSentence.speaker) : '';
            const speakerName = speakerId ? (dictationSpeakers[speakerId] || '') : '';

            if (explanationHint) {
                if (speakerName) {
                    speakerDiv.textContent = `${speakerName}: ${explanationHint}`;
                } else {
                    speakerDiv.textContent = `${explanationHint}`;
                }
            } else if (speakerName) {
                speakerDiv.textContent = `${speakerName}:`;
            } else {
                speakerDiv.textContent = '';
            }
        }
    }


    // включаем кнопку проверки и поле ввода текста
    // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
    const perfect = Number(currentSentence.number_of_perfect) || 0;
    const corrected = Number(currentSentence.number_of_corrected) || 0;
    if (perfect > 0) {
        // ИСПРАВЛЕНО: Текст заполняется ТОЛЬКО если задание выполнено на звезду (perfect)
        inputField.innerHTML = currentSentence.text;
        correctAnswerDiv.style.display = "block";
        correctAnswerDiv.textContent = currentSentence.text_translation;
        correctAnswerDiv.style.color = 'var(--color-button-gray)';
        disableCheckButton(0);
    } else if (corrected > 0) {
        // ИСПРАВЛЕНО: Если только corrected (полузвезда), текст НЕ заполняется,
        // чтобы пользователь мог попробовать снова на звезду
        // Кнопка проверки должна быть активной (желтая книга), а не в состоянии полузвезды
        inputField.innerHTML = "";
        correctAnswerDiv.style.display = "none";
        correctAnswerDiv.textContent = "";
        disableCheckButton(2); // Активная кнопка (желтая книга), чтобы можно было повторить
    } else {
        inputField.innerHTML = "";
        correctAnswerDiv.textContent = "";
        disableCheckButton(2);
    }

    // Очистка пользовательского ввода
    inputField.contentEditable = "true"; // на всякий случай
    setTimeout(() => {
        inputField.focus();
    }, 0);
    inputField.focus();
    textAttemptCount = 0;

    disableRecordButton(true);

    // Воспроизводим последовательность аудио по схеме
    try {
        console.log('[DICTATION_AUDIO_SCHEME]', {
            kind: 'start',
            sequence: playSequenceStart,
            sentenceKey: currentSentence && currentSentence.key,
            currentSentenceIndex,
            totalSelectedSentences
        });
    } catch (e) {
    }
    setTimeout(() => playAudioSequence(playSequenceStart), 300);
}


// Функция переходу до наступного речення
function nextSentence() {
    console.log('nextSentence (before)', currentSentenceIndex, totalSelectedSentences);
    // Используем сохраненное общее количество, а не текущее selectedSentences.length
    let newSentenceIndex = currentSentenceIndex + 1; // по списку выбранных чеком ключей к предложениям

    if (newSentenceIndex < totalSelectedSentences) {
        if (mediaRecorder?.state === 'recording' || (unifiedSpeechRecognizer && unifiedSpeechRecognizer.state && unifiedSpeechRecognizer.state.isRecording)) {stopRecording('manual');}
        currentSentenceIndex = newSentenceIndex;
        console.log('nextSentence (after)', currentSentenceIndex, totalSelectedSentences);
        updateSimpleSentenceCounter();
        showCurrentSentence(0, newSentenceIndex); // функция загрузки предложения
    } else {
        // открыть модалку
    }
}

// Функция переходу до поперднього речення
function previousSentence() {
    let newSentenceIndex = currentSentenceIndex - 1; // по списку выбранных чеком ключей к предложениям

    if (newSentenceIndex >= 0) {
        if (mediaRecorder?.state === 'recording' || (unifiedSpeechRecognizer && unifiedSpeechRecognizer.state && unifiedSpeechRecognizer.state.isRecording)) {stopRecording('manual');}
        currentSentenceIndex = newSentenceIndex;
        updateSimpleSentenceCounter();
        showCurrentSentence(0, newSentenceIndex);
    }
}

// Функция очистки текста
function clearText() {
    inputField.innerHTML = '';
}

// Функция записи аудио
function recordAudio() {

}

// Основная функция загрузки аудио (устарела - используется AudioManager)
// async function loadAudio() {
//     try {
//         audio.src = currentSentence.audio;
//         audio.onerror = function () {
//             console.error('Ошибка загрузки аудио');
//         };
//     } catch (error) {
//         console.error('Ошибка:', error);
//     }
//     try {
//         audio_tr.src = currentSentence.audio_tr;
//         audio_tr.onerror = function () {
//             console.error('Ошибка загрузки аудио перевода');
//         };
//     } catch (error) {
//         console.error('Ошибка:', error);
//     }
// }



// Инициализация при загрузке -------------------------------------------------------
// startNewGame
// document.addEventListener("DOMContentLoaded", function () {
async function onloadInitializeDictation() {
    console.log('=======================document.addEventListener("DOMContentLoaded", function () {:');
    // Инициализируем диалоговые метаданные из data-атрибутов
    const dataNode = document.getElementById('dictation-data');
    if (dataNode) {
        const isDialogAttr = dataNode.getAttribute('data-is-dialog');
        dictationIsDialog = String(isDialogAttr) === 'true';
        console.log('[onloadInitializeDictation] data-is-dialog атрибут:', isDialogAttr, '-> dictationIsDialog:', dictationIsDialog);
        try {
            dictationSpeakers = JSON.parse(dataNode.getAttribute('data-speakers') || '{}') || {};
            console.log('[onloadInitializeDictation] dictationSpeakers:', dictationSpeakers);
        } catch (e) {
            console.error('[onloadInitializeDictation] Ошибка парсинга data-speakers:', e);
            dictationSpeakers = {};
        }
    } else {
        console.warn('[onloadInitializeDictation] Элемент dictation-data не найден!');
    }
    // Ждем завершения initializeDictation, чтобы currentDictation.language_original был установлен
    await initializeDictation();
    // Теперь вызываем loadLanguageCodes после того, как данные диктанта загружены
    loadLanguageCodes();
    
    // Инициализируем UnifiedSpeechRecognition после загрузки языка
    initUnifiedSpeechRecognition();
    
    // userManager.init(); 
    // initializeUser(); // Инициализируем пользователя
    // setupAuthHandlers(); // ДОБАВИТЬ ЭТУ СТРОЧКУ
    setupExitHandlers(); // Настраиваем обработчики выхода
    setupCompletionModalHandlers(); // Настраиваем обработчики модального окна завершения
    setupNoSelectionModalHandlers(); // Настраиваем обработчики модального окна предупреждения


    // Проверка поддерживаемых аудиоформатов
    //console.group("Поддержка аудиоформатов:");
    const formatsToCheck = [
        'audio/mp4; codecs="mp4a.40.2"', // AAC
        'audio/webm; codecs=opus',       // Opus
        'audio/webm',                    // Fallback WebM
        'audio/wav'                      // WAV (для тестирования)
    ];

    // --- Переключатель круга: ALL ↔ номер ---
    (function initCircleToggle() {
        const circleBtn = document.querySelector('.stat-btn.circle');
        if (!circleBtn) return;

        // если кнопка в HTML вдруг с disabled — аккуратно снимаем
        if (circleBtn.hasAttribute('disabled')) circleBtn.removeAttribute('disabled');

        circleBtn.addEventListener('click', () => {
            showAllStats = !showAllStats;   // переключаем режим
            updateStats();             // обновляем подпись и пересчитываем цифры
        });

        updateStats();               // первичная синхронизация
    })();

    ensureUserPlayButton();
    updateAudioPanelVisibility();
    renderUserAudioTablo();
    setRecordStateIcon('square');  // ← инициализируем "квадрат" по умолчанию
    updateRecordingIndicator(false);  // ← инициализируем индикатор записи (серый)
    refreshAudioUIForCurrentSentence();

    // Инициализация AudioPlayerVisual для оригинала
    const originalAudioContainer = document.getElementById('originalAudioPlayer');
    if (originalAudioContainer && typeof AudioPlayerVisual !== 'undefined') {
        // Create and store both locally and globally for early/late access
        originalAudioVisual = new AudioPlayerVisual(originalAudioContainer);
        window.originalAudioVisual = originalAudioVisual;
        originalAudioVisual.setLanguage(currentDictation.language_original);

        try {
            // Dictation uses a single canonical audio track; hide the audio-type selector.
            const typeWrapper = originalAudioContainer.querySelector('.audio-type-select-wrapper');
            if (typeWrapper) typeWrapper.style.display = 'none';
        } catch (e) {
        }

        // Настройка callbacks для AudioPlayerVisual
        originalAudioVisual.setOnPlayClick(() => {
            const audioPath = originalAudioVisual.getCurrentAudioPath();
            if (!audioPath) return;

            const isPlaying = (window.AudioManager && typeof window.AudioManager.isPlaying === 'function')
                ? window.AudioManager.isPlaying()
                : !!(window.AudioManager && window.AudioManager.audio && !window.AudioManager.audio.paused && !window.AudioManager.audio.ended);

            if (blockAudioPlaybackIfRecording()) {
                if (isPlaying && window.AudioManager) {
                    window.AudioManager.pause();
                }
                return;
            }

            if (isPlaying && window.AudioManager) {
                window.AudioManager.pause();
            } else if (window.AudioManager) {
                window.AudioManager.play(originalAudioVisual.playButton, audioPath);
            }
        });

        originalAudioVisual.setOnAudioTypeChange((type, path) => {
            if (window.AudioManager && window.AudioManager.isPlaying()) {
                window.AudioManager.stop();
                if (blockAudioPlaybackIfRecording()) {
                    return;
                }
                window.AudioManager.play(originalAudioVisual.playButton, path);
            }
        });

        originalAudioVisual.setOnSpeedChange((rate) => {
            if (window.AudioManager) {
                window.AudioManager.setPlaybackRate(rate);
            }
        });

        originalAudioVisual.setOnProgressSeek((time) => {
            if (window.AudioManager) {
                window.AudioManager.setCurrentTime(time);
            }
        });

        // Регистрируем AudioPlayerVisual в AudioManager (как волну)
        if (window.AudioManager) {
            window.AudioManager.setAudioPlayerVisual(originalAudioVisual);
        }
    }

    // Инициализация кнопки перевода
    translationPlayButton = document.getElementById('translationPlayButton');
    window.translationPlayButton = translationPlayButton;
    if (translationPlayButton) {
        translationPlayButton.addEventListener('click', () => {
            if (!currentSentence) return;

            const translationPath = resolveSentenceAudioUrl(currentSentence, 'audio_tr');
            if (!translationPath) return;

            const isPlaying = (window.AudioManager && typeof window.AudioManager.isPlaying === 'function')
                ? window.AudioManager.isPlaying()
                : !!(window.AudioManager && window.AudioManager.audio && !window.AudioManager.audio.paused && !window.AudioManager.audio.ended);

            if (blockAudioPlaybackIfRecording()) {
                if (isPlaying && window.AudioManager) {
                    window.AudioManager.pause();
                }
                return;
            }

            if (isPlaying && window.AudioManager) {
                window.AudioManager.pause();
                const icon = translationPlayButton.querySelector('[data-lucide]');
                if (icon) {
                    icon.setAttribute('data-lucide', 'play');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            } else if (window.AudioManager) {
                window.AudioManager.play(translationPlayButton, translationPath);
                const icon = translationPlayButton.querySelector('[data-lucide]');
                if (icon) {
                    icon.setAttribute('data-lucide', 'pause');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });

        // Настройка callback для обновления иконки кнопки перевода
        if (window.AudioManager && typeof window.AudioManager.onPlayStateChange === 'function') {
            window.AudioManager.onPlayStateChange((isPlaying) => {
                if (translationPlayButton && window.AudioManager.currentButton === translationPlayButton) {
                    const icon = translationPlayButton.querySelector('[data-lucide]');
                    if (icon) {
                        icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }
                } else if (!isPlaying && translationPlayButton) {
                    const icon = translationPlayButton.querySelector('[data-lucide]');
                    if (icon) {
                        icon.setAttribute('data-lucide', 'play');
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }
                }
            });
        }
    }

    // НОВЫЙ КОД ДЛЯ ИНИЦИАЛИЗАЦИИ ДИКТАНТА
    // ===== Инициализация диктанта =====
    // function initializeDictation() {
    //     // Рисуем таблицу так, чтобы ВСЁ было отмечено
    //     renderSelectionTable();

    //     // Показываем модальное окно сразу
    //     startModal.style.display = 'flex';
    //     confirmStartBtn.focus();
    // }

    // Инициализация полей ввода последовательности воспроизведения
    function initPlaySequenceInputs() {
        const inputs = document.querySelectorAll('.play-sequence-input');

        inputs.forEach(input => {
            const id = input.id || '';
            const isNumberInput = input.type === 'number' || input.getAttribute('type') === 'number';
            const isStarHalfInput = id === 'requiredPassedStarHalfInput' || id.endsWith('requiredPassedStarHalfInput');
            const isAudioRepeatsInput = id === 'audioRepeatsInput' || id.endsWith('audioRepeatsInput');

            if (isStarHalfInput) {
                const clampStarHalf = (raw) => {
                    const value = parseInt(raw, 10);
                    if (isNaN(value)) return REQUIRED_PASSED_STAR_HALF;
                    return Math.min(10, Math.max(1, value));
                };

                const applyStarHalfValue = (raw) => {
                    const v = clampStarHalf(raw);
                    input.value = String(v);
                    REQUIRED_PASSED_STAR_HALF = v;
                };

                input.addEventListener('input', (e) => {
                    const v = clampStarHalf(e.target.value);
                    REQUIRED_PASSED_STAR_HALF = v;
                });

                input.addEventListener('change', (e) => {
                    applyStarHalfValue(e.target.value);
                });

                input.addEventListener('blur', (e) => {
                    applyStarHalfValue(e.target.value);
                });

                applyStarHalfValue(input.value);
                return;
            }

            // Пропускаем поле числа (Повторы аудио) - для него отдельная обработка
            if (isAudioRepeatsInput) {
                // Обработка для поля числа
                input.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value, 10);
                    // Если значение выходит за пределы, ограничиваем его
                    if (!isNaN(value)) {
                        if (value < 0) e.target.value = 0;
                        if (value > 9) e.target.value = 9;
                    } else if (e.target.value === '' || e.target.value === '-') {
                        // Разрешаем пустое значение или минус (будет исправлено при blur)
                        return;
                    } else {
                        // Если введено не число, восстанавливаем предыдущее значение
                        const prevValue = e.target.dataset.prevValue || '3';
                        e.target.value = prevValue;
                    }
                });

                input.addEventListener('focus', (e) => {
                    // Сохраняем текущее значение перед изменением
                    e.target.dataset.prevValue = e.target.value;
                });

                input.addEventListener('blur', (e) => {
                    // Восстанавливаем значение, если оно пустое или невалидное
                    const value = parseInt(e.target.value, 10);
                    if (isNaN(value) || value < 0) {
                        e.target.value = e.target.dataset.prevValue || '3';
                    } else if (value > 9) {
                        e.target.value = '9';
                    }
                    // Обновляем REQUIRED_PASSED_COUNT
                    const finalValue = parseInt(e.target.value, 10);
                    if (!isNaN(finalValue) && finalValue >= 0 && finalValue <= 9) {
                        const oldValue = REQUIRED_PASSED_COUNT;
                        REQUIRED_PASSED_COUNT = finalValue;
                        // Пересчитываем доступность кнопок записи для всех предложений
                        if (oldValue !== finalValue) {
                            recalculateAudioAvailabilityForAllSentences();
                        }
                    }
                });

                input.addEventListener('change', (e) => {
                    // При изменении через стрелки также обновляем REQUIRED_PASSED_COUNT
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value >= 0 && value <= 9) {
                        const oldValue = REQUIRED_PASSED_COUNT;
                        REQUIRED_PASSED_COUNT = value;
                        // Пересчитываем доступность кнопок записи для всех предложений
                        if (oldValue !== value) {
                            recalculateAudioAvailabilityForAllSentences();
                        }
                    }
                });

                return; // Пропускаем остальную обработку для этого поля
            }

            // Для любых number-input (включая модальные) не применяем буквенную валидацию.
            // Числовые поля обрабатываются отдельно (AudioSettingsPanel в модалке).
            if (isNumberInput) {
                return;
            }

            // Валидация при вводе (только для текстовых полей)
            input.addEventListener('input', (e) => {
                validatePlaySequenceInput(e.target);
            });

            // Валидация при вставке
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text').toLowerCase();
                const filteredText = pastedText.replace(/[^omfta]/g, '').slice(0, 10);
                input.value = filteredText;
            });

            // Валидация при потере фокуса
            input.addEventListener('blur', (e) => {
                validatePlaySequenceInput(e.target);
            });
        });
    }

    // Функция для валидации ввода последовательности воспроизведения
    function validatePlaySequenceInput(input) {
        const value = input.value.toLowerCase();
        const validChars = /^[omfta]*$/;

        if (value && !validChars.test(value)) {
            // Удаляем недопустимые символы
            input.value = value.replace(/[^omfta]/g, '');
        }

        // Ограничиваем длину
        if (input.value.length > 10) {
            input.value = input.value.slice(0, 10);
        }
    }

    // Установка значений по умолчанию для последовательностей воспроизведения
    // Проверяем существование элементов перед установкой значений
    const playSequenceStartEl = document.getElementById('playSequenceStart');
    const playSequenceTypoEl = document.getElementById('playSequenceTypo');
    const playSequenceSuccessEl = document.getElementById('playSequenceSuccess');

    if (playSequenceStartEl) {
        playSequenceStartEl.value = playSequenceStart;
    }
    if (playSequenceTypoEl) {
        playSequenceTypoEl.value = playSequenceTypo;
    }
    if (playSequenceSuccessEl) {
        playSequenceSuccessEl.value = playSequenceSuccess;
    }

    initPlaySequenceInputs();

    // Обработчик клика на часы для паузы
    const timerButton = document.querySelector('.stat-btn.timer');
    if (timerButton) {
        timerButton.addEventListener('click', function () {
            if (pauseModal.style.display === 'flex') {
                resumeGame();
            } else {
                pauseGame();
            }
        });

        // Убираем disabled атрибут чтобы кнопка была кликабельной
        timerButton.removeAttribute('disabled');
    }

    // Обработчики для отслеживания активности пользователя
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'keydown', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(eventName => {
        document.addEventListener(eventName, function () {
            resetInactivityTimer();
        }, true);
    });

    // Клавиша Escape для паузы
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && pauseModal.style.display === 'flex') {
            event.preventDefault();
            resumeGame();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.repeat) return;
        if (!(event.ctrlKey || event.metaKey)) return;
        if (event.altKey) return;

        const key = (event.key || '').toLowerCase();
        if (event.code === 'KeyS' || SAVE_KEY_VALUES.includes(key)) {
            event.preventDefault();
            console.log('[Draft] hotkey save triggered', { key: event.key, code: event.code });

            const panel = getProgressPanelInstance();
            const historySavePromise = panel
                ? panel.save().then(() => true).catch(error => {
                    console.error('[Draft] history save error', error);
                    return false;
                })
                : Promise.resolve(true);

            saveDictationDraft()
                .then(saved => {
                    return Promise.all([Promise.resolve(saved), historySavePromise]);
                })
                .then(([draftSaved, historySaved]) => {
                    const success = !!draftSaved && historySaved !== false;
                    if (panel && success) {
                        panel.markClean();
                    }
                    console.log('[Draft] hotkey save completed', { success });
                })
                .catch(error => {
                    console.error('[Draft] hotkey save error', error);
                });
        }
    }, true);

    // startTimer();

}

function showInputScriptNoticeOnce() {
    if (inputScriptNoticeShown) return;
    inputScriptNoticeShown = true;
    try {
        if (typeof showSaveToast === 'function') {
            const script = getDictationScript();
            const hint = script === 'cyrillic' ? 'RU/UK' : (script === 'arabic' ? 'AR' : 'EN');
            showSaveToast(`Для этого диктанта включи раскладку ${hint}`, 'error', 2000);
        }
    } catch {
    }
}

inputField.addEventListener('input', function () {
    const html = inputField.innerHTML;
    // Don't rewrite DOM on every keystroke. Only normalize when HTML tags appear.
    // (e.g. browser injected <div>, <br>, etc). This keeps typing responsive.
    if (typeof html === 'string' && html.indexOf('<') !== -1) {
        const plainText = inputField.textContent || '';
        const cursorPos = saveCursorPosition(inputField);
        inputField.textContent = plainText;
        restoreCursorPosition(inputField, cursorPos);
    }

    const currentText = inputField.textContent || '';
    if (hasDisallowedChars(currentText)) {
        const sanitized = stripDisallowedChars(currentText);
        const cursorPos = saveCursorPosition(inputField);
        inputField.textContent = sanitized;
        restoreCursorPosition(inputField, cursorPos);
        showInputScriptNoticeOnce();
    }
    // Сбрасываем таймер бездействия при вводе текста
    resetInactivityTimer();
});

// Block Cyrillic before it is inserted (best UX). This cannot change OS keyboard,
// but prevents "wrong" characters from appearing in the field.
inputField.addEventListener('beforeinput', function (event) {
    const t = event && typeof event.data === 'string' ? event.data : '';
    if (t && hasDisallowedChars(t)) {
        event.preventDefault();
        showInputScriptNoticeOnce();
    }
});


// -----------Функции для работы с текстом -----------------------------------------


// Требовать набор КАЖДОГО слова (без «сквозного» совпадения через одно)
const REQUIRE_EVERY_WORD = true;
// все варианты дефисов/тире/минуса (-, ‒, – , — , ―, −, а также обычный '-')
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212-]/g;
// «умные» апострофы → для унификации
const CURLY_APOS = /[\u2019\u2018\u02BC]/g;
// Расширенный regex для удаления всех знаков препинания, включая все варианты кавычек
const PUNCTUATION_REGEX = /[.,!?:;"«»„"'"'"'"'"'"'()\[\]{}،؛؟\u201C\u201D\u201E\u201F\u2033\u2036]/g;
const ARABIC_DIACRITICS_REGEX = /[\u064B-\u0655\u0670\u0671]/g;

// === ЧИСЛА ДЛЯ ASR: маскируем и цифры, и словесные числа в <num> ===
// === ЧИСЛА И НОРМАЛИЗАЦИЯ ДЛЯ ASR ===
// База слов-числительных (минимальный набор: EN + RU/UK базовые формы).
// Этого достаточно, чтобы "числа словами" превратить в <num> для авто-стопа и процента.
const NUM_WORDS_SET = new Set([
    // EN
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
    // RU
    "ноль", "один", "одна", "одно", "два", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
    "семнадцать", "восемнадцать", "девятнадцать", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят",
    "семьдесят", "восемьдесят", "девяносто", "сто", "тысяча",
    // UA (база)
    "нуль", "одна", "одне", "два", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять",
    "десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять",
    "сімнадцять", "вісімнадцять", "дев'ятнадцять", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят",
    "сімдесят", "вісімдесят", "дев'яносто", "сто", "тисяча"
]);

// === СЛОВАРЬ ЭКВИВАЛЕНТНОСТЕЙ: СОКРАЩЕНИЯ ↔ ПОЛНЫЕ ФОРМЫ ===
// Ключ: сокращение (без апострофа, так как simplifyText их убирает)
// Значение: массив полных слов
// ПРИМЕЧАНИЕ: Словарь можно расширять по мере необходимости
const CONTRACTIONS_DICT = {
    // I am / I'm
    "im": ["i", "am"],
    // You are / You're
    "youre": ["you", "are"],
    // He is / He's
    "hes": ["he", "is"],
    // She is / She's
    "shes": ["she", "is"],
    // It is / It's
    "its": ["it", "is"],
    // We are / We're
    "were": ["we", "are"],
    // They are / They're
    "theyre": ["they", "are"],
    // I have / I've
    "ive": ["i", "have"],
    // You have / You've
    "youve": ["you", "have"],
    // We have / We've
    "weve": ["we", "have"],
    // They have / They've
    "theyve": ["they", "have"],
    // I had / I'd
    "id": ["i", "had"],
    // You had / You'd
    "youd": ["you", "had"],
    // He had / He'd
    "hed": ["he", "had"],
    // She had / She'd
    "shed": ["she", "had"],
    // We had / We'd
    "wed": ["we", "had"],
    // They had / They'd
    "theyd": ["they", "had"],
    // I will / I'll
    "ill": ["i", "will"],
    // You will / You'll
    "youll": ["you", "will"],
    // He will / He'll
    "hell": ["he", "will"],
    // She will / She'll
    "shell": ["she", "will"],
    // We will / We'll
    "well": ["we", "will"],
    // They will / They'll
    "theyll": ["they", "will"],
    // I would / I'd (может быть и had, но чаще would)
    // уже есть "id": ["i", "had"], но добавим альтернативу
    // Do not / Don't
    "dont": ["do", "not"],
    // Does not / Doesn't
    "doesnt": ["does", "not"],
    // Did not / Didn't
    "didnt": ["did", "not"],
    // Will not / Won't
    "wont": ["will", "not"],
    // Would not / Wouldn't
    "wouldnt": ["would", "not"],
    // Should not / Shouldn't
    "shouldnt": ["should", "not"],
    // Could not / Couldn't
    "couldnt": ["could", "not"],
    // Cannot / Can't
    "cant": ["can", "not"],
    // Is not / Isn't
    "isnt": ["is", "not"],
    // Are not / Aren't
    "arent": ["are", "not"],
    // Was not / Wasn't
    "wasnt": ["was", "not"],
    // Were not / Weren't
    "werent": ["were", "not"],
    // Has not / Hasn't
    "hasnt": ["has", "not"],
    // Have not / Haven't
    "havent": ["have", "not"],
    // Had not / Hadn't
    "hadnt": ["had", "not"],
    // That is / That's
    "thats": ["that", "is"],
    // There is / There's
    "theres": ["there", "is"],
    // Here is / Here's
    "heres": ["here", "is"],
    // Where is / Where's
    "wheres": ["where", "is"],
    // What is / What's
    "whats": ["what", "is"],
    // Who is / Who's
    "whos": ["who", "is"],
    // How is / How's
    "hows": ["how", "is"],
    // When is / When's
    "whens": ["when", "is"],
    // Why is / Why's
    "whys": ["why", "is"],
    // Let us / Let's
    "lets": ["let", "us"],
    // You are / You're (уже есть выше, но для полноты)
    // I am / I'm (уже есть выше)
};

/**
 * Проверяет, эквивалентны ли два слова с учетом сокращений
 * @param {string} word1 - первое слово (уже нормализованное, без апострофов)
 * @param {string} word2 - второе слово (уже нормализованное, без апострофов)
 * @returns {boolean} - true если слова эквивалентны
 */
function areWordsEquivalent(word1, word2) {
    if (!word1 || !word2) return false;
    if (word1 === word2) return true;

    // Проверяем, является ли word1 сокращением word2
    const expansion1 = CONTRACTIONS_DICT[word1];
    if (expansion1 && expansion1.length === 1 && expansion1[0] === word2) {
        return true;
    }

    // Проверяем, является ли word2 сокращением word1
    const expansion2 = CONTRACTIONS_DICT[word2];
    if (expansion2 && expansion2.length === 1 && expansion2[0] === word1) {
        return true;
    }

    return false;
}

/**
 * Проверяет, эквивалентна ли последовательность слов сокращению или наоборот
 * @param {string} word - одно слово (сокращение или полная форма)
 * @param {string[]} words - массив слов (полная форма или сокращение)
 * @returns {boolean} - true если эквивалентны
 */
function areWordSequencesEquivalent(word, words) {
    if (!word || !words || words.length === 0) return false;

    // Если одно слово и один элемент массива - простая проверка
    if (words.length === 1) {
        return areWordsEquivalent(word, words[0]);
    }

    // Проверяем, является ли word сокращением для массива words
    const expansion = CONTRACTIONS_DICT[word];
    if (expansion && expansion.length === words.length) {
        // Проверяем поэлементно
        for (let i = 0; i < expansion.length; i++) {
            if (expansion[i] !== words[i]) {
                return false;
            }
        }
        return true;
    }

    // Проверяем обратное: может быть words[0] + words[1] = сокращение для word
    // Но это сложнее, так как нужно проверить все возможные комбинации
    // Для простоты пока не реализуем этот случай

    return false;
}

function simplifyText(text) {
    const originalText = text || "";
    let result = originalText
        .normalize('NFKC')          // унификация Юникода
        .replace(/\u00A0/g, ' ')    // NBSP → пробел
        .toLowerCase();

    // Явно удаляем все варианты кавычек перед применением PUNCTUATION_REGEX
    // Это гарантирует, что все кавычки будут удалены
    // Включаем все возможные варианты кавычек: обычные ", ", умные ", ", угловые «», немецкие „", и другие
    const allQuotesRegex = /[""'""""«»„"\u201C\u201D\u201E\u201F\u2033\u2036]/g;

    result = result
        .replace(CURLY_APOS, "'")   // «умные» апострофы → обычный
        .replace(/['`´]/g, "")      // убираем апострофы
        .replace(allQuotesRegex, "") // ЯВНО удаляем все кавычки
        .replace(DASHES, ' ')       // КЛЮЧ: любое тире/дефис → ПРОБЕЛ
        .replace(PUNCTUATION_REGEX, "") // остальная пунктуация в мусор
        .replace(ARABIC_DIACRITICS_REGEX, "") // снимаем огласовки
        .replace(/\s+/g, " ")
        .trim();

    const words = result.split(" ");

    return words;
}

function splitWordsForDisplay(text) {
    return (text || "")
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .replace(DASHES, ' ')   // режем по тире
        .trim()
        .split(/\s+/);
}

// Функция для разбиения пользовательского ввода на слова с удалением пунктуации
// Используется для правильного сравнения с оригиналом (пунктуация игнорируется)
function splitUserWords(text) {
    return (text || "")
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .replace(DASHES, ' ')   // режем по тире
        .replace(PUNCTUATION_REGEX, '') // удаляем пунктуацию из слов
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0); // убираем пустые строки
}

function isNumberTokenLike(word) {
    if (!word) return false;
    const w = word.toLowerCase();

    // числа: 12, 12.5, 1,500, 1 500, 1.500,75
    if (/^\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?$/.test(w)) return true;

    // унифицируем тире и апострофы внутри токена
    const wNorm = w.replace(DASHES, '-').replace(CURLY_APOS, "'");

    // составные числительные через дефис: twenty-five / двадцать-п'ять
    if (wNorm.includes('-')) {
        const parts = wNorm.split(/-+/).filter(Boolean);
        if (parts.length >= 2 && parts.every(p => NUM_WORDS_SET.has(p))) {
            return true;
        }
    }

    // одиночное слово-числительное
    return NUM_WORDS_SET.has(wNorm);
}

// "more—that's"     -> normalizeForASR => "morethats"  ✅
//* "twenty–five"     -> maskNumbersToNumToken => "<num>" ✅
//* "1 500,75"        -> maskNumbersToNumToken => "<num>" ✅  (NBSP поддержан)
//* "дев'ять"         -> остаётся словом (не <num>)        ✅
//* "двадцать-п'ять"  -> "<num>"                           ✅
function maskNumbersToNumToken(text) {
    if (!text) return "";
    let t = text
        .normalize('NFKC')          // унификация Юникода
        .replace(/\u00A0/g, ' ')    // NBSP → пробел
        .replace(DASHES, ' - ')     // КЛЮЧ: любой «тире» делаем разделителем
        .replace(CURLY_APOS, "'");  // «умные» апострофы → обычный

    // числа (с тысячами и дробями)
    t = t.replace(/\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?\b/g, " <num> ");

    // слова: буквы + апостроф + дефис (уже унифицирован)
    t = t.replace(/[\p{L}'-]+/gu, m => isNumberTokenLike(m) ? " <num> " : m);

    t = t.replace(/\s+/g, " ").trim();
    return t;
}


// Схлопываем серии <num> <num> ... -> один <num>
function compressNumRuns(t) {
    return t.replace(/(?:<num>\s*){2,}/g, "<num> ");
}

// Нормализация ТОЛЬКО для ASR-процентов/авто-стопа
function normalizeForASR(text) {
    let s = (text || "")
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .replace(DASHES, ' ')   // КЛЮЧ: «more—that's» → "more that's"
        .toLowerCase();

    s = maskNumbersToNumToken(s);
    s = compressNumRuns(s);

    // убрать апострофы/кавычки
    s = s.replace(/[\u0027\u2018\u2019\u0060\u00B4'‘'`´]/g, "");

    // пунктуацию → убрать (тире уже превратили в пробел выше)
    s = s.replace(/[.,!?:;"«»()]/g, "");

    // ASR-метрика — игнор пробелов
    s = s.replace(/\s+/g, "");
    return s;
}


// Символьный LCS по нормализованным строкам — только для ASR
// УЛУЧШЕНО: Ищет максимальное совпадение с конца текста (чтобы игнорировать ошибки в начале)
function computeMatchPercentASR(originalText, spokenText) {
    const a = normalizeForASR(originalText);
    const b = normalizeForASR(spokenText);
    if (!a && !b) return 100;
    if (!a || !b) return 0;

    // Стандартный LCS для общего случая
    const la = a.length, lb = b.length;
    const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            dp[i][j] = (a[i - 1] === b[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const lcs = dp[la][lb];

    // НОВОЕ: Ищем максимальное совпадение с конца (suffix matching)
    // Это помогает, когда пользователь правильно сказал конец фразы, но ошибся в начале
    let maxSuffixMatch = 0;
    for (let i = Math.min(la, lb); i >= 1; i--) {
        const aSuffix = a.slice(-i);
        const bSuffix = b.slice(-i);
        if (aSuffix === bSuffix) {
            maxSuffixMatch = i;
            break;
        }
    }

    // Если суффиксное совпадение значительное (>50% от оригинала), используем его
    // Иначе используем стандартный LCS
    if (maxSuffixMatch > la * 0.5) {
        // Вычисляем процент на основе суффиксного совпадения и длины
        const suffixPercent = Math.round((2 * maxSuffixMatch) / (la + maxSuffixMatch) * 100);
        const lcsPercent = Math.round((2 * lcs) / (la + lb) * 100);
        // Берем максимальный из двух
        return Math.max(suffixPercent, lcsPercent);
    }

    return Math.round((2 * lcs) / (la + lb) * 100);
}




function findFirstErrorIndex(word1, word2) {
    const len = Math.min(word1.length, word2.length);
    for (let k = 0; k < len; k++) {
        if (word1[k] !== word2[k]) return k;
    }
    return len;
}

function renderResult(original, userVerified) {

    const correctLine = [];
    let foundError = false;
    let errorCount = 0;
    let originalIndex = 0;

    userVerified.forEach(word => {
        if (word.type === "correct") {
            correctLine.push(`<span class="word-correct">${word.text}</span> `);
            originalIndex++;
        } else if (word.type === "missing") {
            if (REQUIRE_EVERY_WORD) {
                // Строгий режим: не подсказываем «лишние» слова в верхней строке.
                // Только двигаем индекс оригинала.
                originalIndex++;
            } else {
                // Старое поведение: подсказываем пропущенное слово зелёным.
                // Используем оригинальный текст с пунктуацией
                correctLine.push(`<span class="word-missing">${word.text}</span> `);
                originalIndex++;
            }
            // correctLine.push(`<span class="word-missing">${word.text}</span> `);
            // originalIndex++;
        } else if (word.type === "error") {
            // correctText содержит оригинальный текст с пунктуацией и регистром
            // errorIndex вычислен для упрощенных версий (без пунктуации) в функции check
            // Для отображения используем оригинальный текст, но вычисляем позицию ошибки в упрощенной версии
            // Удаляем пунктуацию из оригинального текста для вычисления позиции ошибки
            const correctTextNoPunct = word.correctText.replace(PUNCTUATION_REGEX, '').toLowerCase();
            // Используем errorIndex из word (вычислен в check для упрощенных версий)
            const errorIndexInSimplified = word.errorIndex || 0;
            const errorIndexInOriginal = Math.min(errorIndexInSimplified, correctTextNoPunct.length - 1);

            // Отображаем оригинальный текст с пунктуацией, но выделяем ошибку в упрощенной версии
            const before = correctTextNoPunct.slice(0, errorIndexInOriginal);
            const errorLetter = correctTextNoPunct[errorIndexInOriginal] || "";
            const after = correctTextNoPunct.slice(errorIndexInOriginal + 1);

            const correctHTML =
                `<span class="correct-line-word">` +
                `${before}<span class="correct-line-letter">${errorLetter}</span>${after}` +
                `</span> `;

            correctLine.push(correctHTML);
            originalIndex++;
            foundError = true;
        } else if (word.type === "raw_user") {
            // ничего не добавляем — они игнорируются в подсказке
        }
    });

    if (foundError) {
        const remainingWords = splitWordsForDisplay(original).slice(originalIndex);
        remainingWords.forEach(word => {
            correctLine.push(`<span>${word}</span> `);
        });
    } else {
        playSuccessSound();
        const totalAudio = Number(currentSentence.number_of_audio) || 0;
        if (totalAudio >= REQUIRED_PASSED_COUNT) {
            const sum = sumRez();
            console.log("👀 [10] decreaseAudioCounter() maxIndTablo", maxIndTablo);
            console.log("👀 [10] decreaseAudioCounter() sum", sum);
            const isLastSentenceInRun = Number(currentSentenceIndex) >= (Number(totalSelectedSentences) - 1);
            if (isLastSentenceInRun) {
                console.log("👀 [11] decreaseAudioCounter()");
                btnNewCircle.focus();
            } else {
                console.log("👀 [12] decreaseAudioCounter()");
                checkNextDiv.focus();
            }

        } else {
            recordButton.focus();
        }
    }

    correctAnswerDiv.innerHTML = correctLine.join("");
}

function renderToEditable(userVerified) {
    let html = "";
    let errorFound = false;
    let totalOffset = 0;
    let errorOffset = 0;

    userVerified.forEach(word => {
        if (word.type === "correct") {
            html += `<span class="word-correct">${word.text} </span>`;
            totalOffset += word.text.length + 1;
        } else if (word.type === "missing") {
            if (REQUIRE_EVERY_WORD) {
                // Строгий режим: ничего не рисуем в поле ввода.
                // Пользователь должен сам допечатать слово.
                // totalOffset не изменяем.
            } else {
                // Старое поведение: показываем «пропущенное» слово зелёным.
                html += `<span class="word-missing">${word.text} </span>`;
                totalOffset += word.text.length + 1;
            }
            // html += `<span class="word-missing">${word.text} </span>`;
            // totalOffset += word.text.length + 1;
        } else if (word.type === "error") {
            const before = word.userText.slice(0, word.errorIndex);
            const wrongLetter = word.userText[word.errorIndex] || "";
            const after = word.userText.slice(word.errorIndex + 1);

            html += `<span class="word-error">${before}<span class="letter-error">${wrongLetter}</span>${after} </span>`;

            if (!errorFound) {
                errorOffset = totalOffset + before.length + 1;
                errorFound = true;
            }
            totalOffset += word.userText.length + 1;
        } else if (word.type === "raw_user") {
            html += `<span class="word-correct">${word.text} </span>`;
            totalOffset += word.text.length + 1;
        }
    });

    inputField.innerHTML = html.trim();
    setCursorAtOffset(inputField, errorFound ? errorOffset : totalOffset);
}

function setCursorAtOffset(root, offset) {
    const range = document.createRange();
    const sel = window.getSelection();
    let currentOffset = 0;

    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (currentOffset + node.length >= offset) {
                range.setStart(node, offset - currentOffset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
            } else {
                currentOffset += node.length;
            }
        } else {
            for (let i = 0; i < node.childNodes.length; i++) {
                if (walk(node.childNodes[i])) return true;
            }
        }
        return false;
    }

    walk(root);
}

function saveCursorPosition(containerEl) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(containerEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
}

function restoreCursorPosition(containerEl, offset) {
    const range = document.createRange();
    const sel = window.getSelection();
    let currentOffset = 0;

    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const nextOffset = currentOffset + node.length;
            if (offset <= nextOffset) {
                range.setStart(node, offset - currentOffset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
            }
            currentOffset = nextOffset;
        } else {
            for (let i = 0; i < node.childNodes.length; i++) {
                if (walk(node.childNodes[i])) return true;
            }
        }
        return false;
    }

    walk(containerEl);
}

/**
 * Воспроизведение последовательности аудио по схеме
 * @param {string} sequence - Строка последовательности, например "omftaa"
 *   o - оригинал (audio)
 *   a - автоозвучка (audio_a) 
 *   f - порезанный файл (audio_f)
 *   m - микрофон (audio_m)
 *   t - перевод (audio_tr)
 */
function playAudioSequence(sequence) {
    if (!sequence || !sequence.length) return;
    if (!currentSentence) return;
    if (!window.AudioManager) {
        console.error('AudioManager не найден');
        return;
    }

    const seqSentence = currentSentence;
    const seqSentenceKey = seqSentence && seqSentence.key;

    const __seqLog = (...args) => {
        try {
            console.log('[DICTATION_AUDIO_SEQ]', ...args);
        } catch (e) {
        }
    };

    const steps = sequence.toLowerCase().split(''); // Разбиваем строку на массив
    let index = 0;

    function playNext() {
        if (index >= steps.length) {
            // Последовательность завершена
            return;
        }

        const step = steps[index];
        let audioPath = null;
        let button = null;

        __seqLog('step', {
            sequence,
            index,
            step,
            currentSentenceIndex,
            totalSelectedSentences,
            seqSentenceKey,
            currentSentenceKey: currentSentence && currentSentence.key
        });

        if ((currentSentence && currentSentence.key) !== seqSentenceKey) {
            __seqLog('warn:sentence_changed', {
                seqSentenceKey,
                currentSentenceKey: currentSentence && currentSentence.key
            });
        }

        // Определяем путь к аудио и кнопку в зависимости от типа
        switch (step) {
            case 'o': // оригинал
                audioPath = resolveSentenceAudioUrl(seqSentence, 'audio');
                if (window.originalAudioVisual) {
                    button = window.originalAudioVisual.playButton;
                    window.originalAudioVisual.setAudioType('o');
                }
                break;
            case 'a': // автоозвучка (устарело в диктанте)
            case 'f': // порезанный файл (устарело в диктанте)
            case 'm': // микрофон (устарело в диктанте)
                audioPath = resolveSentenceAudioUrl(seqSentence, 'audio');
                if (window.originalAudioVisual) {
                    button = window.originalAudioVisual.playButton;
                    window.originalAudioVisual.setAudioType('o');
                }
                break;
            case 't': // перевод
                audioPath = resolveSentenceAudioUrl(seqSentence, 'audio_tr');
                button = window.translationPlayButton || null;
                break;
            default:
                console.warn('Неизвестный тип аудио в последовательности:', step);
                index++;
                setTimeout(playNext, 0);
                return;
        }

        // Если путь к аудио не найден, пропускаем этот шаг
        if (!audioPath) {
            __seqLog('skip:no_audio', { index, step, audioPath });
            index++;
            setTimeout(playNext, 0);
            return;
        }
        if (!button && step !== 't') {
            __seqLog('skip:no_button', { index, step, audioPath });
            index++;
            setTimeout(playNext, 0);
            return;
        }

        // Воспроизводим через AudioManager с callback для следующего шага
        if (blockAudioPlaybackIfRecording()) {
            return;
        }

        // Для перевода, если кнопка не найдена, используем null
        const playButton = button || null;
        __seqLog('play', { index, step, audioPath, hasButton: !!playButton });
        window.AudioManager.play(playButton, audioPath, () => {
            __seqLog('ended', { index, step, audioPath });
            index++;
            playNext();
        });
    }

    playNext(); // Запускаем процесс
}


function applyAudioSettingsToUI() {
    // Обновляем иконку режима распознавания
    updateRecognitionModeIcon();

    const checkBtn = document.getElementById('checkBtn');
    const userInput = document.getElementById('userInput');
    const correctAnswer = document.getElementById('correctAnswer');
    const audioHint = document.getElementById('audioHint');
    const virtualKeyboardToggle = document.getElementById('virtualKeyboardToggle');
    const virtualKeyboardContainer = document.querySelector('.virtual-keyboard-container');

    // Проверяем, включен ли режим "без ввода текста"
    const withoutEnteringText = window.audioSettingsWithoutEnteringText || false;
    const showText = window.audioSettingsShowText || false;

    if (withoutEnteringText) {
        // Полностью скрываем поле ввода
        if (userInput) {
            userInput.style.display = "none";
            userInput.contentEditable = "false";
            userInput.style.pointerEvents = "none";
        }

        // Полностью скрываем и отключаем кнопку проверки
        if (checkBtn) {
            checkBtn.style.display = "none";
            checkBtn.disabled = true;
        }

        // Скрываем обычную подсказку вместе с полем ввода
        if (correctAnswer) {
            correctAnswer.style.display = "none";
        }

        // Скрываем чекбокс "Показать клавиатуру"
        if (virtualKeyboardContainer) {
            virtualKeyboardContainer.style.display = "none";
        }
        if (virtualKeyboardToggle) {
            virtualKeyboardToggle.checked = false;
            virtualKeyboardToggle.disabled = true;
        }
        // Скрываем саму клавиатуру, если она была показана
        if (virtualKeyboardInstance && typeof virtualKeyboardInstance.hide === 'function') {
            virtualKeyboardInstance.hide();
        }

        // Показываем отдельное поле подсказки для аудио, если включен флаг показа текста
        if (showText && audioHint) {
            // Используем currentSentence.text, если доступен
            if (currentSentence && currentSentence.text) {
                audioHint.textContent = currentSentence.text;
                audioHint.style.display = "block";
                audioHint.style.color = 'var(--color-button-text-gray)';
            } else {
                // Если currentSentence еще не доступен, скрываем (будет показано при следующем вызове)
                audioHint.style.display = "none";
            }
        } else if (audioHint) {
            audioHint.style.display = "none";
        }
    } else {
        // Показываем и включаем поле ввода
        if (userInput) {
            userInput.style.display = "";
            userInput.contentEditable = "true";
            userInput.style.pointerEvents = "auto";
            userInput.style.opacity = "1";
        }

        // Показываем кнопку проверки (состояние будет установлено через disableCheckButton)
        if (checkBtn) {
            checkBtn.style.display = "";
        }

        // Показываем чекбокс "Показать клавиатуру"
        if (virtualKeyboardContainer) {
            virtualKeyboardContainer.style.display = "";
        }
        if (virtualKeyboardToggle) {
            virtualKeyboardToggle.disabled = false;
        }

        // Скрываем поле подсказки для аудио (оно только для режима "Только аудио")
        if (audioHint) {
            audioHint.style.display = "none";
        }

        // Обычная подсказка работает как обычно (существующая логика не меняется)
        // Если флаг показа текста включен, показываем текст в обычной подсказке серым цветом
        if (showText && correctAnswer && currentSentence) {
            // Проверяем, не установлена ли подсказка существующей логикой (например, после правильного ответа)
            const existingDisplay = correctAnswer.style.display;
            const existingText = correctAnswer.textContent;

            // Если подсказка уже показана и содержит перевод (из существующей логики), не перезаписываем
            if (existingDisplay === 'block' && existingText && existingText !== currentSentence.text) {
                // Подсказка уже установлена существующей логикой - не трогаем
                correctAnswer.dataset.showTextHint = 'false';
            } else {
                // Показываем правильный текст как подсказку
                correctAnswer.textContent = currentSentence.text || '';
                correctAnswer.style.display = "block";
                correctAnswer.style.color = 'var(--color-button-text-gray)';
                correctAnswer.dataset.showTextHint = 'true';
            }
        } else {
            correctAnswer.dataset.showTextHint = 'false';
        }
    }
}

function disableCheckButton(active) {
    const checkBtn = document.getElementById('checkBtn');
    const userInput = document.getElementById('userInput');

    // Если включен режим "без ввода текста", не меняем состояние
    const withoutEnteringText = window.audioSettingsWithoutEnteringText || false;
    if (withoutEnteringText) {
        return;
    }

    // Сначала удаляем все возможные цветные классы
    checkBtn.classList.value = '';
    switch (active) {
        case 2:
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i data-lucide="corner-down-left"></i><span class="check-btn-label">Проверка</span>';
            checkBtn.title = 'Нажмите Enter/Return когда закончили ввод текста';
            if (userInput) userInput.contentEditable = "true";
            checkBtn.classList.add('button-color-yellow');
            break;

        case 0:
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i data-lucide="star" class="check-btn-icon"></i><span class="check-btn-label">Прекрасно</span>';
            checkBtn.title = '';
            if (userInput) userInput.contentEditable = "true";
            checkBtn.classList.add('button-color-mint');
            hideVirtualKeyboardIfActive();
            break;

        case 1:
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i data-lucide="star-half" class="check-btn-icon"></i><span class="check-btn-label">Хорошо</span>';
            checkBtn.title = '';
            if (userInput) userInput.contentEditable = "true";
            checkBtn.classList.add('button-color-lightgreen');
            hideVirtualKeyboardIfActive();
            break;
    }

    renderResultTablo();
    lucide.createIcons();
}

function check(original, userInput, currentKey) {
    const simplOriginal = simplifyText(original);
    const simplUser = simplifyText(userInput);

    const originalWords = splitWordsForDisplay(original);
    // Удаляем пунктуацию из пользовательского ввода перед разбиением на слова
    // Это нужно, чтобы знаки препинания не мешали сравнению
    // Используем splitUserWords, которая удаляет пунктуацию из каждого слова
    const userWords = splitUserWords(userInput);

    const userVerified = [];
    let i = 0, j = 0;
    let foundError = false;
    let errorCount = 0;

    while (i < simplOriginal.length || j < simplUser.length) {
        const wordOrig = simplOriginal[i];
        const wordUser = simplUser[j];
        // Используем оригинальное слово с пунктуацией и регистром для отображения
        const fullWordOrig = originalWords[i] || "";
        // Используем слово пользователя без пунктуации (для сравнения)
        const fullWordUser = userWords[j] || "";

        if (foundError) {
            if (j < userWords.length) {
                userVerified.push({ type: "raw_user", text: userWords[j] });
                j++;
            } else {
                break;
            }
        } else if (wordOrig === wordUser) {
            // Используем оригинальное слово с пунктуацией и регистром для отображения
            userVerified.push({ type: "correct", text: fullWordOrig });
            i++; j++;
        } else if (!REQUIRE_EVERY_WORD && simplOriginal[i + 1] === wordUser) {
            // Режим «разрешить пропуск слова» — ВЫКЛ по умолчанию
            userVerified.push({ type: "missing", text: fullWordOrig });
            errorCount++;
            foundError = true;
            i++;
        } else {
            // Проверяем эквивалентности сокращений перед тем, как считать ошибкой
            let isEquivalent = false;

            // Случай 1: Оригинал - сокращение (одно слово), пользователь - полная форма (два слова)
            // Например: оригинал "I'm" (im), пользователь "I am" (i, am)
            const expansionOrig = CONTRACTIONS_DICT[wordOrig];
            if (expansionOrig && j + expansionOrig.length <= simplUser.length) {
                // Проверяем, совпадает ли расширение сокращения со следующими словами пользователя
                let matches = true;
                for (let k = 0; k < expansionOrig.length; k++) {
                    if (simplUser[j + k] !== expansionOrig[k]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    // Эквивалентны! Обрабатываем как правильный ответ
                    // Используем оригинальное слово с пунктуацией и регистром
                    userVerified.push({ type: "correct", text: fullWordOrig });
                    i++; // переходим к следующему слову в оригинале
                    // Переходим на количество слов в расширении
                    for (let k = 0; k < expansionOrig.length; k++) {
                        j++;
                    }
                    isEquivalent = true;
                }
            }

            // Случай 2: Пользователь - сокращение (одно слово), оригинал - полная форма (два слова)
            // Например: пользователь "I'm" (im), оригинал "I am" (i, am)
            if (!isEquivalent) {
                const expansionUser = CONTRACTIONS_DICT[wordUser];
                if (expansionUser && i + expansionUser.length <= simplOriginal.length) {
                    // Проверяем, совпадает ли расширение сокращения со следующими словами оригинала
                    let matches = true;
                    for (let k = 0; k < expansionUser.length; k++) {
                        if (simplOriginal[i + k] !== expansionUser[k]) {
                            matches = false;
                            break;
                        }
                    }
                    if (matches) {
                        // Эквивалентны! Обрабатываем как правильный ответ
                        // Показываем полную форму из оригинала с пунктуацией и регистром
                        let fullText = "";
                        for (let k = 0; k < expansionUser.length; k++) {
                            if (k > 0) fullText += " ";
                            fullText += originalWords[i + k] || "";
                        }
                        userVerified.push({ type: "correct", text: fullText });
                        // Переходим на количество слов в расширении в оригинале
                        for (let k = 0; k < expansionUser.length; k++) {
                            i++;
                        }
                        j++; // переходим к следующему слову у пользователя
                        isEquivalent = true;
                    }
                }
            }

            // Случай 3: Оба - одно слово, но одно может быть сокращением другого (редкий случай)
            // Например: "its" vs "it is" уже обработано выше, но на всякий случай
            if (!isEquivalent && areWordsEquivalent(wordOrig, wordUser)) {
                // Используем оригинальное слово с пунктуацией и регистром
                userVerified.push({ type: "correct", text: fullWordOrig });
                i++; j++;
                isEquivalent = true;
            }

            // Если не эквивалентны - это ошибка
            if (!isEquivalent) {
                const errorIndex = findFirstErrorIndex(wordOrig || "", wordUser || "");
                // Для отображения ошибки используем оригинальное слово с пунктуацией и регистром
                // Но при вычислении errorIndex сравниваем упрощенные версии (без пунктуации)
                userVerified.push({
                    type: "error",
                    userText: fullWordUser,
                    correctText: fullWordOrig,
                    errorIndex: errorIndex
                });
                errorCount++;
                i++; j++;
                foundError = true; // ← ключ: пропуск/несовпадение — это ошибка, а не «мягкий» missing
            }
        }

    }

    if (!foundError) {

        const s = currentSentence;

        // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
        // Если уже был perfect (number_of_perfect = 1), увеличиваем corrected
        if (s.number_of_perfect === 1) {
            // Уже был perfect - увеличиваем corrected
            s.number_of_corrected = (s.number_of_corrected || 0) + 1;
            disableCheckButton(1);
            // Сохраняем активность в БД
            saveActivityToDB('corrected');
        } else if (textAttemptCount === 0) {
            // все виконано ідеально з першої спроби
            s.number_of_perfect = 1;
            // НЕ сбрасываем number_of_corrected - это история работы пользователя
            disableCheckButton(0);         // отключить кнопку и нарисовать на ней звезду
            // Сохраняем активность в БД
            saveActivityToDB('perfect');
        } else {
            // все виконано але за декілька спроб
            // Увеличиваем счетчик попыток с ошибкой - пользователь может сколько угодно раз
            // выполнять задание с ошибкой, пока не сделает правильно (perfect)
            const oldCorrected = Number(s.number_of_corrected) || 0;
            s.number_of_corrected = oldCorrected + 1;
            if (s.number_of_corrected >= REQUIRED_PASSED_STAR_HALF) {
                s.number_of_perfect = 1;
                disableCheckButton(0);         // отключить кнопку и нарисовать на ней звезду                
                saveActivityToDB('perfect');// Сохраняем активность в БД
            }
            else {
                disableCheckButton(1);         // отключить кнопку и нарисовать пол звезды на ней
            }
            saveActivityToDB('corrected'); // Сохраняем активность в БД
        }

        // Обновляем состояние выбора предложения (может стать completed)
        updateSentenceSelectionState(currentSentence, true);

        // Обновить табло предложений и шапку:
        // Обновляем простой счетчик предложений
        updateSimpleSentenceCounter();
        applyStatusNewCircle();

        // Обновить табло итогов:
        updateStats();

        // Обновляем строку в таблице модального окна (если оно открыто)
        updateTableRowStatus(currentSentence);

        // перевести фокус на кнопку микрофона после завершения всех обновлений DOM
        // Используем setTimeout чтобы дать время браузеру обновить DOM
        setTimeout(() => {
            if (recordButton) {
                recordButton.focus();
            }
        }, 0);
    } else {
        // Ошибка — увеличиваем счётчик попыток
        textAttemptCount++;
    }

    return userVerified;
}

function checkText() {
    const userInput = inputField.innerText;
    const original = currentSentence.text;
    if (userInput.length === 0) {
        console.log('хоть какой-то текст введи!!!');
        return;
    }    
    if (userInput.length <= Math.floor(original.length / 2)) {
        console.log('Хоть половину текста введи!!!');
        return;
    }
    const translation = currentSentence.translation;
    const currentKey = currentSentence.key;
    const result = check(original, userInput, currentKey);

    renderToEditable(result);
    renderResult(original, result);

    const allCorrect = result.every(word => word.type === "correct");

    // error_count: число неуспешных нажатий "Проверить" по предложению
    // Инкрементируем ТОЛЬКО когда проверка не прошла (нужно исправляться)
    if (currentSentence && !allCorrect) {
        currentSentence.error_count = (Number(currentSentence.error_count) || 0) + 1;
    }
    const failedChecks = Number(currentSentence?.error_count) || 0;
    updateErrorCountLabel(failedChecks);
    scheduleDraftAutosave('checkErrorCount');

    // Debug: логируем распределение типов и число неуспешных проверок
    try {
        const typeCounts = result.reduce((acc, w) => {
            const t = w?.type || 'unknown';
            acc[t] = (acc[t] || 0) + 1;
            return acc;
        }, {});
        console.log('[Dictation][Check] sentence_key=', currentSentence?.key,
            'failedChecks=', failedChecks,
            'allCorrect=', allCorrect,
            'typeCounts=', typeCounts);
    } catch (e) {
        console.log('[Dictation][Check] failedChecks=', failedChecks, '(failed to build typeCounts)', e);
    }

    correctAnswerDiv.style.display = "block";
    if (allCorrect) {
        correctAnswerDiv.style.display = "block";
        correctAnswerDiv.textContent = translation;
        correctAnswerDiv.style.color = 'var(--color-button-gray)';
        // Сбрасываем флаг "показывать текст", так как теперь показывается результат проверки
        correctAnswerDiv.dataset.showTextHint = 'false';
        try {
            console.log('[DICTATION_AUDIO_SCHEME]', {
                kind: 'success',
                sequence: playSequenceSuccess,
                sentenceKey: currentSentence && currentSentence.key,
                currentSentenceIndex,
                totalSelectedSentences
            });
        } catch (e) {
        }
        setTimeout(() => playAudioSequence(playSequenceSuccess), 500); // "ot" с задержкой
        updateTableRowStatus(currentSentence);
    } else {
        // translationDiv.style.display = "none";
        // Сбрасываем флаг "показывать текст" при неправильном ответе
        correctAnswerDiv.dataset.showTextHint = 'false';
    }


}

// Обработчики событий для inputField
inputField.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        checkText();
        return;
    }
});

// const audio = document.getElementById('audio');
// const audio_tr = document.getElementById('audio_tr');
// Горячие клавиши — глобально
document.addEventListener('keydown', function (event) {
    if (event.ctrlKey) {
        // Проверяем, что Ctrl нажат
        switch (event.key) {
            case '1':
                // Проигрываем оригинал - просто вызываем клик на кнопке
                if (window.originalAudioVisual && window.originalAudioVisual.playButton) {
                    window.originalAudioVisual.playButton.click();
                }
                event.preventDefault();
                break;

            case '2':
                // Проигрываем перевод - просто вызываем клик на кнопке
                if (window.translationPlayButton) {
                    window.translationPlayButton.click();
                }
                event.preventDefault();
                break;

            case '4':
                // Следующее предложение
                nextSentence();
                event.preventDefault();
                break;

            case '3':
                // Предыдущее предложение
                previousSentence();
                event.preventDefault();
                break;

            case '0':
                // Закончить круг раньше времени
                checkIfAllCompleted();
                event.preventDefault();
                break;
        }
    }
});


document.getElementById("userInput").addEventListener("input", function () {
    const correctAnswer = document.getElementById("correctAnswer");
    if (correctAnswer && correctAnswer.style.display != "none") {
        // Проверяем, является ли это подсказкой "показывать текст" (не скрываем её при вводе)
        const isShowTextHint = correctAnswer.dataset.showTextHint === 'true';

        if (!isShowTextHint) {
            // Воспроизводим последовательность O, тут может в дальнейшем быть условие от пользователя воспроизводить или нет
            try {
                console.log('[DICTATION_AUDIO_SCHEME]', {
                    kind: 'typo',
                    sequence: playSequenceTypo,
                    sentenceKey: currentSentence && currentSentence.key,
                    currentSentenceIndex,
                    totalSelectedSentences
                });
            } catch (e) {
            }
            playAudioSequence(playSequenceTypo); // "t"
            correctAnswer.style.display = "none";
            //document.getElementById("translation").style.display = "none";
        }
    }
});

// Сравниваем массивы слов через LCS (Longest Common Subsequence) для сравнения произнесенного аудио
// Возвращаем процент совпадения (0..100)
function computeMatchPercent(originalText, spokenText) {
    // стало (числа → <num>):
    const a = simplifyText(prepareTextForASR(originalText));
    const b = simplifyText(prepareTextForASR(spokenText));

    if (a.length === 0 && b.length === 0) return 100;
    if (a.length === 0 || b.length === 0) return 0;

    // ДП-таблица LCS: (a.length+1) x (b.length+1)
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    const lcs = dp[a.length][b.length];
    const percent = (2 * lcs) / (a.length + b.length) * 100;
    return Math.round(percent);
}

// Кнопки модального вікна вкінці диктанту -----------------------------------
// (3) Повернення на головну сторінку
// ===== Функции для работы с черновиком диктанта =====

/**
 * Проверка, все ли предложения завершены на звезды
 */
function isAllCompleted() {
    const sum = sumRez();
    // Все предложения должны быть perfect (с первого раза)
    // ИСПРАВЛЕНО: Убрано использование circle_number_of_perfect
    return number_of_perfect === allSentences.length;
}

/**
 * Регистрирует завершенный диктант в истории и удаляет файл черновика
 */
async function registerCompletedDictation() {
    if (!currentDictation.id) {
        console.warn('[Register] Нельзя зарегистрировать: нет ID диктанта');
        return;
    }

    const um = window.UM || userManager;
    if (!um || typeof um.isAuthenticated !== 'function' || !um.isAuthenticated()) {
        console.warn('[Register] Пользователь не авторизован, пропускаем сохранение успеха');
        return;
    }

    try {
        // Получаем токен для API запросов
        const token = um?.token || localStorage.getItem('jwt_token');
        if (!token) {
            console.warn('[Register] Нет токена, пропускаем сохранение успеха');
            return;
        }

        // Получаем статистику и время выполнения
        const sum = sumRez();
        // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
        const totalPerfect = number_of_perfect;
        const totalCorrected = number_of_corrected;
        const totalAudio = number_of_audio; // number_of_audio уже накопленное значение

        // Получаем общее время выполнения диктанта (накопленное время работы)
        const timerSnapshot = getProgressTimerSnapshot();
        const totalTimeMs = timerSnapshot.accumulatedMs || 0;

        console.log('[Register] Регистрируем завершенный диктант:', {
            dictation_id: currentDictation.id,
            perfect_count: totalPerfect,
            corrected_count: totalCorrected,
            audio_count: totalAudio,
            time_ms: totalTimeMs
        });

        // Собираем данные по предложениям для сохранения в незавершенные диктанты
        const sentences_data = [];
        allSentences.forEach(s => {
            // ИСПРАВЛЕНО: Убрано использование circle_number_of_* полей
            const totalPerfect = s.number_of_perfect || 0;
            const totalCorrected = s.number_of_corrected || 0;
            const totalAudio = Number(s.number_of_audio) || 0;

            if (totalPerfect > 0 || totalCorrected > 0 || totalAudio > 0) {
                sentences_data.push({
                    sentence_key: s.key,
                    perfect_count: totalPerfect,
                    corrected_count: totalCorrected,
                    audio_count: totalAudio,
                    selection_state: s.selection_state || 'unchecked'
                });
            }
        });

        // Получаем настройки для сохранения
        const sequences = getPlaySequenceValues();
        const isMixed = mixControl && mixControl.dataset.checked === 'true';
        let audioRepeats = REQUIRED_PASSED_COUNT;
        if (audioSettingsPanel && audioSettingsPanel.isInitialized) {
            const settings = audioSettingsPanel.getSettings();
            audioRepeats = (settings.repeats !== undefined && settings.repeats !== null) ? settings.repeats : 3;
        }

        const settings_json = JSON.stringify({
            audio: {
                start: (sequences.start !== undefined && sequences.start !== null) ? sequences.start : playSequenceStart,
                typo: (sequences.typo !== undefined && sequences.typo !== null) ? sequences.typo : playSequenceTypo,
                success: (sequences.success !== undefined && sequences.success !== null) ? sequences.success : playSequenceSuccess,
                repeats: audioRepeats,
                required_passed_star_half: REQUIRED_PASSED_STAR_HALF
            },
            sentence_order: isMixed ? 'mixed' : 'direct'
        });

        // Сохраняем успех в новую таблицу history_successes
        try {
            const dictationIdForDb = (() => {
                const raw = String(currentDictation.id ?? '').trim();
                const parsed = parseInt(raw.replace(/^dict_/, ''), 10);
                return Number.isFinite(parsed) ? parsed : null;
            })();

            if (!dictationIdForDb) {
                console.error('[Register] ❌ Невозможно сохранить успех: некорректный dictation_id', currentDictation.id);
                return;
            }

            const totalAttempts = allSentences.reduce((sum, s) => sum + (Number(s.attempts_total) || 0), 0);
            const totalErrors = allSentences.reduce((sum, s) => sum + (Number(s.error_count) || 0), 0);
            const successResponse = await fetch('/api/statistics/success', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dictation_id: dictationIdForDb,
                    perfect_count: totalPerfect,
                    corrected_count: totalCorrected,
                    audio_count: totalAudio,
                    attempts_total: totalAttempts,
                    error_count: totalErrors,
                    time_ms: totalTimeMs,
                    sentences_data: sentences_data,
                    settings_json: settings_json
                })
            });

            if (successResponse.ok) {
                const result = await successResponse.json();
                console.log('[Register] ✅ Успех сохранен в history_successes:', result.success_data);
                dictationCompletionSaved = true;
                stopDraftAutosaveTimers();
                await clearDraftFromIndexedDb();
            } else {
                const errorText = await successResponse.text();
                console.error('[Register] ❌ Ошибка сохранения успеха в БД:', {
                    status: successResponse.status,
                    statusText: successResponse.statusText,
                    body: errorText
                });
                await enqueueOfflineSuccess({
                    dictation_id: dictationIdForDb,
                    perfect_count: totalPerfect,
                    corrected_count: totalCorrected,
                    audio_count: totalAudio,
                    attempts_total: totalAttempts,
                    error_count: totalErrors,
                    time_ms: totalTimeMs,
                    sentences_data: sentences_data,
                    settings_json: settings_json
                });

                // Оффлайн/ошибка сети: успех поставлен в очередь, локально завершаем диктант
                dictationCompletionSaved = true;
                stopDraftAutosaveTimers();
                await clearDraftFromIndexedDb();
            }
        } catch (error) {
            console.error('[Register] ❌ Ошибка при сохранении успеха в БД:', error);
            await enqueueOfflineSuccess({
                dictation_id: dictationIdForDb,
                perfect_count: totalPerfect,
                corrected_count: totalCorrected,
                audio_count: totalAudio,
                attempts_total: totalAttempts,
                error_count: totalErrors,
                time_ms: totalTimeMs,
                sentences_data: sentences_data,
                settings_json: settings_json
            });

            // Оффлайн/ошибка сети: успех поставлен в очередь, локально завершаем диктант
            dictationCompletionSaved = true;
            stopDraftAutosaveTimers();
            await clearDraftFromIndexedDb();
        }

        // Черновик удален с сервера, localStorage больше не используется

    } catch (error) {
        console.error('[Register] ❌ Ошибка регистрации завершенного диктанта:', error);
    }

    if (!dictationStatistics || !currentDictation.id) {
        console.warn('Нельзя сохранить черновик: нет статистики или ID диктанта');
        return false;
    }

    const state = buildDictationDraftState();
    if (!state) {
        return false;
    }

    const changedCount = Object.keys(state.per_sentence || {}).length;

    console.log('[Draft] saveDictationDraft: prepared payload', {
        dictationId: currentDictation.id,
        changedSentences: changedCount,
        isMixed: !!state.is_mixed,
        currentIndex: currentSentenceIndex || 0
    });

    await saveDraftToIndexedDbAndQueueSync('manual');

    console.log('[Draft] saveDictationDraft: completed', { success: true });
    return true;
}

/**
 * Загрузка и применение черновика
 * @param {boolean} forceClear - Принудительно очистить черновик перед загрузкой
 */
async function loadAndApplyDraft(forceClear = false) {
    if (!dictationStatistics || !currentDictation.id) {
        return false;
    }

    // Если нужно принудительно очистить черновик
    if (forceClear) {
        clearLocalStorageDraft();
        await clearDraftFromIndexedDb();
        return false;
    }

    const panel = getProgressPanelInstance();
    if (panel) panel._suppressDirty = true;

    try {
        let draft = null;

        const key = getDraftKey();
        if (key) {
            try {
                const local = await idbGet('drafts', key);
                if (local && local.state) {
                    draft = local.state;
                    console.log('[Draft][IDB] local draft loaded', { updatedAt: local.updatedAt || null });
                }
            } catch (e) {
                console.warn('[Draft][IDB] failed to load local draft', e);
            }
        }

        if (!draft) {
            if (panel) {
                panel.markClean();
            }
            setSaveButtonStatus('clean');
            return false;
        }

        if (!draft) {
            if (panel) {
                panel.markClean();
            }
            setSaveButtonStatus('clean');
            return false;
        }

        setSaveButtonStatus('pending');

        // Восстанавливаем настройки из settings_json (приоритет) или из отдельных полей
        let audioSettingsFromDraft = null;
        if (draft.settings_json) {
            try {
                const settings = JSON.parse(draft.settings_json);
                audioSettingsFromDraft = settings.audio || null;
            } catch (e) {
                console.warn('Ошибка парсинга settings_json из черновика:', e);
            }
        }

        if (audioSettingsFromDraft || draft.playSequenceStart !== undefined || draft.playSequenceTypo !== undefined || draft.playSequenceSuccess !== undefined || draft.audio_repeats !== undefined) {
            if (audioSettingsPanel && audioSettingsPanel.isInitialized) {
                const settingsToApply = audioSettingsFromDraft ? {
                    start: (audioSettingsFromDraft.start !== undefined && audioSettingsFromDraft.start !== null) ? audioSettingsFromDraft.start : ((draft.playSequenceStart !== undefined && draft.playSequenceStart !== null) ? draft.playSequenceStart : ((playSequenceStart !== undefined && playSequenceStart !== null) ? playSequenceStart : 'oto')),
                    typo: (audioSettingsFromDraft.typo !== undefined && audioSettingsFromDraft.typo !== null) ? audioSettingsFromDraft.typo : ((draft.playSequenceTypo !== undefined && draft.playSequenceTypo !== null) ? draft.playSequenceTypo : ((playSequenceTypo !== undefined && playSequenceTypo !== null) ? playSequenceTypo : 'o')),
                    success: (audioSettingsFromDraft.success !== undefined && audioSettingsFromDraft.success !== null) ? audioSettingsFromDraft.success : ((draft.playSequenceSuccess !== undefined && draft.playSequenceSuccess !== null) ? draft.playSequenceSuccess : ((playSequenceSuccess !== undefined && playSequenceSuccess !== null) ? playSequenceSuccess : 'ot')),
                    repeats: audioSettingsFromDraft.repeats !== undefined ? audioSettingsFromDraft.repeats : (draft.audio_repeats !== undefined ? draft.audio_repeats : (REQUIRED_PASSED_COUNT !== undefined ? REQUIRED_PASSED_COUNT : 3)),
                    required_passed_star_half: audioSettingsFromDraft.required_passed_star_half !== undefined ? audioSettingsFromDraft.required_passed_star_half : REQUIRED_PASSED_STAR_HALF,
                    without_entering_text: audioSettingsFromDraft.without_entering_text !== undefined ? Boolean(audioSettingsFromDraft.without_entering_text) : false,
                    show_text: audioSettingsFromDraft.show_text !== undefined ? Boolean(audioSettingsFromDraft.show_text) : false,
                    speech_recognition_mode: audioSettingsFromDraft.speech_recognition_mode || speechRecognitionMode || 'route'
                } : {
                    start: (draft.playSequenceStart !== undefined && draft.playSequenceStart !== null) ? draft.playSequenceStart : ((playSequenceStart !== undefined && playSequenceStart !== null) ? playSequenceStart : 'oto'),
                    typo: (draft.playSequenceTypo !== undefined && draft.playSequenceTypo !== null) ? draft.playSequenceTypo : ((playSequenceTypo !== undefined && playSequenceTypo !== null) ? playSequenceTypo : 'o'),
                    success: (draft.playSequenceSuccess !== undefined && draft.playSequenceSuccess !== null) ? draft.playSequenceSuccess : ((playSequenceSuccess !== undefined && playSequenceSuccess !== null) ? playSequenceSuccess : 'ot'),
                    repeats: draft.audio_repeats !== undefined ? draft.audio_repeats : (REQUIRED_PASSED_COUNT !== undefined ? REQUIRED_PASSED_COUNT : 3)
                };

                audioSettingsPanel.setSettings(settingsToApply);
                // Обновляем глобальные переменные
                const settings = audioSettingsPanel.getSettings();
                playSequenceStart = settings.start;
                playSequenceTypo = settings.typo;
                playSequenceSuccess = settings.success;
                const oldValue = REQUIRED_PASSED_COUNT;
                REQUIRED_PASSED_COUNT = settings.repeats;
                if (settings.required_passed_star_half !== undefined && settings.required_passed_star_half !== null) {
                    REQUIRED_PASSED_STAR_HALF = settings.required_passed_star_half;
                }
                // Обновляем новые настройки
                if (settings.without_entering_text !== undefined) {
                    window.audioSettingsWithoutEnteringText = Boolean(settings.without_entering_text);
                }
                if (settings.show_text !== undefined) {
                    window.audioSettingsShowText = Boolean(settings.show_text);
                }
                if (settings.speech_recognition_mode !== undefined) {
                    speechRecognitionMode = settings.speech_recognition_mode;
                }
                // Применяем настройки к UI
                applyAudioSettingsToUI();
                // Пересчитываем доступность кнопок записи при загрузке черновика
                if (oldValue !== REQUIRED_PASSED_COUNT) {
                    recalculateAudioAvailabilityForAllSentences();
                }
            } else {
                // Fallback на старый способ
                if (draft.playSequenceStart) {
                    playSequenceStart = draft.playSequenceStart;
                    const el = document.getElementById('playSequenceStart');
                    if (el) el.value = draft.playSequenceStart;
                }
                if (draft.playSequenceTypo) {
                    playSequenceTypo = draft.playSequenceTypo;
                    const el = document.getElementById('playSequenceTypo');
                    if (el) el.value = draft.playSequenceTypo;
                }
                if (draft.playSequenceSuccess) {
                    playSequenceSuccess = draft.playSequenceSuccess;
                    const el = document.getElementById('playSequenceSuccess');
                    if (el) el.value = draft.playSequenceSuccess;
                }
                if (draft.audio_repeats !== undefined) {
                    const oldValue = REQUIRED_PASSED_COUNT;
                    REQUIRED_PASSED_COUNT = draft.audio_repeats;
                    const el = document.getElementById('audioRepeatsInput');
                    if (el) el.value = draft.audio_repeats;
                    // Пересчитываем доступность кнопок записи при загрузке черновика
                    if (oldValue !== REQUIRED_PASSED_COUNT) {
                        recalculateAudioAvailabilityForAllSentences();
                    }
                }
            }
        }
        if (draft.is_mixed !== undefined && mixControl) {
            mixControl.dataset.checked = draft.is_mixed ? 'true' : 'false';
            // Обновляем текст кнопки
            const mixControlText = mixControl.querySelector('span');
            if (mixControlText) {
                mixControlText.textContent = draft.is_mixed ? 'случайный порядок' : 'прямой порядок';
            }
        }

        // Восстанавливаем круг и счетчики
        if (draft.circle_number) {
            circle_number = draft.circle_number;
        }
        if (draft.number_of_perfect !== undefined) {
            number_of_perfect = draft.number_of_perfect;
        }
        if (draft.number_of_corrected !== undefined) {
            number_of_corrected = draft.number_of_corrected;
        }
        if (draft.number_of_audio !== undefined) {
            number_of_audio = draft.number_of_audio;
        }

        // Восстанавливаем прогресс по предложениям
        if (draft.per_sentence) {
            const byKey = makeByKeyMap(allSentences);
            Object.keys(draft.per_sentence).forEach(key => {
                const s = byKey.get(key);
                if (s && draft.per_sentence[key]) {
                    const progress = draft.per_sentence[key];
                    // ИСПРАВЛЕНО: Правильное преобразование всех числовых полей в числа
                    // number_of_perfect: преобразуем в число
                    if (progress.hasOwnProperty('number_of_perfect')) {
                        const perfectValue = progress.number_of_perfect;
                        if (perfectValue !== null && perfectValue !== undefined) {
                            const numValue = Number(perfectValue);
                            s.number_of_perfect = isNaN(numValue) ? 0 : numValue;
                        } else {
                            s.number_of_perfect = 0;
                        }
                    }
                    // number_of_corrected: преобразуем в число (важно для правильного подсчета)
                    if (progress.hasOwnProperty('number_of_corrected')) {
                        const correctedValue = progress.number_of_corrected;
                        if (correctedValue !== null && correctedValue !== undefined) {
                            const numValue = Number(correctedValue);
                            s.number_of_corrected = isNaN(numValue) ? 0 : numValue;
                            console.log('[loadAndApplyDraft] Загружено number_of_corrected для', key, '=', s.number_of_corrected, '(было:', correctedValue, ')');
                        } else {
                            s.number_of_corrected = 0;
                        }
                    }
                    // number_of_audio: если значение есть в progress, устанавливаем (даже если 0)
                    // Если undefined, оставляем текущее значение
                    if (progress.hasOwnProperty('number_of_audio')) {
                        // Преобразуем в число, чтобы корректно обработать строки и null
                        const audioValue = progress.number_of_audio;
                        if (audioValue !== null && audioValue !== undefined) {
                            const numValue = Number(audioValue);
                            s.number_of_audio = isNaN(numValue) ? 0 : numValue;
                        } else {
                            s.number_of_audio = 0;
                        }
                    }

                    // attempts_total: анти-обход, считаем старты предложения
                    if (progress.hasOwnProperty('attempts_total')) {
                        const attemptsValue = progress.attempts_total;
                        const numValue = Number(attemptsValue);
                        s.attempts_total = (!isNaN(numValue) && numValue >= 0) ? numValue : 0;
                    }

                    // error_count: ошибки в последней проверке
                    if (progress.hasOwnProperty('error_count')) {
                        const errorValue = progress.error_count;
                        const numValue = Number(errorValue);
                        s.error_count = (!isNaN(numValue) && numValue >= 0) ? numValue : 0;
                    }
                    // ИСПРАВЛЕНО: Убрана загрузка circle_number_of_* полей, так как логика "circle" удалена
                    // Эти поля больше не сохраняются и не должны использоваться
                    // Игнорируем их, если они есть в старых черновиках, чтобы избежать проблем
                    // circle_number_of_audio больше не используется - убрана логика кругов для аудио
                    // НЕ восстанавливаем selection_state из черновика - он будет пересчитан ниже
                    // Это позволяет избежать проблем с unchecked состояниями
                }
            });
        }

        // Обновляем состояния всех предложений на основе текущего прогресса
        allSentences.forEach(s => {
            // Сначала вычисляем состояние на основе прогресса
            const calculatedState = calculateSentenceSelectionState(s);

            // Если предложение completed - устанавливаем completed
            if (calculatedState === 'completed') {
                s.selection_state = 'completed';
            } else {
                // Если предложение не completed, проверяем что было в черновике
                const draftSentence = draft.per_sentence && draft.per_sentence[s.key];
                const draftState = draftSentence ? draftSentence.selection_state : undefined;

                // Если в черновике есть явно сохраненное состояние - ВОССТАНАВЛИВАЕМ его
                // Это важно для сохранения выбора пользователя (checked/unchecked)
                if (draftSentence && draftState !== undefined && draftState !== null) {
                    // Восстанавливаем явно сохраненное состояние (checked или unchecked)
                    // Это может быть даже для предложений без прогресса, которые пользователь выбрал
                    s.selection_state = draftState;
                } else if (draftSentence) {
                    // Предложение есть в черновике (есть прогресс), но selection_state не указан
                    // Значит было checked по умолчанию (пользователь работал с этим предложением)
                    s.selection_state = 'checked';
                } else {
                    // Предложения НЕТ в черновике - значит пользователь его НЕ выбирал
                    // Устанавливаем unchecked (не selected)
                    s.selection_state = 'unchecked';
                }
            }

            // Обновляем состояние, но НЕ перезаписываем явно восстановленное из черновика
            // Это важно - если мы восстановили unchecked, не нужно его менять на checked
            updateSentenceSelectionState(s, false);
        });

        // Восстанавливаем selectedSentences на основе selection_state
        selectedSentences = [];
        allSentences.forEach(s => {
            // Включаем в selectedSentences:
            // 1. checked - явно выбранные пользователем
            // 2. completed - полностью завершенные (должны оставаться в списке)
            // 3. Предложения с прогрессом (perfect, corrected, audio)
            if (s.selection_state === 'checked' || s.selection_state === 'completed') {
                if (!selectedSentences.includes(s.key)) {
                    selectedSentences.push(s.key);
                }
            }
        });

        console.log('[loadAndApplyDraft] Восстановлено selectedSentences:', selectedSentences.length, selectedSentences);

        // Восстанавливаем current_index
        if (draft.current_index !== undefined && draft.current_index < selectedSentences.length) {
            currentSentenceIndex = draft.current_index;
        } else {
            currentSentenceIndex = 0;
        }

        // После загрузки черновика обновляем selectedSentences еще раз
        // чтобы убедиться что все checked и completed предложения включены
        // НО не перезаписываем явно восстановленное состояние
        allSentences.forEach(s => {
            // Обновляем состояние только если оно не было явно восстановлено из черновика
            // Для этого проверяем, было ли предложение в черновике
            const draftSentence = draft.per_sentence && draft.per_sentence[s.key];
            if (!draftSentence || draftSentence.selection_state === undefined) {
                // Предложения не было в черновике или состояние не было сохранено - пересчитываем
                updateSentenceSelectionState(s, true);
            } else {
                // Состояние было восстановлено из черновика - только синхронизируем selectedSentences
                updateSentenceSelectionState(s, false);
            }

            // Добавляем в selectedSentences если checked или completed
            if ((s.selection_state === 'checked' || s.selection_state === 'completed') &&
                !selectedSentences.includes(s.key)) {
                selectedSentences.push(s.key);
            }
        });

        console.log('[loadAndApplyDraft] Финальный selectedSentences:', selectedSentences.length, selectedSentences);

        // Обновляем отображение всех строк таблицы после загрузки черновика
        // Это важно для правильного отображения прогресса (звезды, полузвезды, микрофоны)
        allSentences.forEach(s => {
            updateTableRowStatus(s);
        });

        // ВАЖНО: Обновляем статистику ПОСЛЕ загрузки всех данных
        // Это гарантирует, что глобальные переменные и UI синхронизированы с загруженным прогрессом
        updateStats();

        // ВАЖНО: Обновляем видимость аудио-полей для текущего предложения
        // Это гарантирует, что поля скрываются, если аудио уже выполнено
        if (currentSentence) {
            refreshAudioUIForCurrentSentence();
        }

        // Восстанавливаем накопленное время работы над диктантом
        if (draft.dictation_accumulated_ms !== undefined && panel) {
            const accumulatedMs = parseInt(draft.dictation_accumulated_ms) || 0;
            if (panel.timerState) {
                panel.timerState.dictationAccumulatedMs = accumulatedMs;
                console.log('[loadAndApplyDraft] Восстановлено накопленное время:', accumulatedMs, 'мс');
            }
        }

        if (panel) {
            panel.markClean();
        }

        startDraftPeriodicAutosave();

        return true;
    } finally {
        if (panel) panel._suppressDirty = false;
    }
}

function clickBtnBackToList() {
    // Просто закрываем модальное окно
    if (startModal) {
        startModal.style.display = 'none';
    }
}

async function handleSave() {
    const saveBtn = document.getElementById('saveBtn');
    const exitToIndexBtn = document.getElementById('exitToIndexBtn');

    if (saveBtn) {
        saveBtn.disabled = true;
        // Не блокируем кнопку выхода, чтобы пользователь мог выйти даже во время сохранения
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i data-lucide="loader-2"></i>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        try {
            const panel = getProgressPanelInstance();
            const historySavePromise = panel
                ? panel.save().then(() => true).catch(error => {
                    console.error('[Draft] history save error', error);
                    return false;
                })
                : Promise.resolve(true);

            await saveDraftToIndexedDbAndQueueSync('explicit-save');
            const draftSaved = true;
            const historySaved = await historySavePromise;
            const success = !!draftSaved && historySaved !== false;

            if (panel && success) {
                panel.markClean();
            }

            if (success) {
                showSaveToast('Прогресс сохранён', 'success');
            } else {
                showSaveToast('Не удалось сохранить прогресс', 'error');
            }
        } catch (error) {
            console.error('[Save] error', error);
            showSaveToast('Ошибка при сохранении', 'error');
            setSaveButtonStatus('error');
        } finally {
            saveBtn.innerHTML = originalHTML;
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            saveBtn.disabled = false;
            // Убеждаемся, что кнопка выхода доступна
            if (exitToIndexBtn) {
                exitToIndexBtn.disabled = false;
                exitToIndexBtn.style.pointerEvents = 'auto';
            }
        }
    }
}

async function handleSaveAndExit() {
    const panel = getProgressPanelInstance();
    const historySavePromise = panel
        ? panel.save().then(() => true).catch(error => {
            console.error('[Draft] history save error', error);
            return false;
        })
        : Promise.resolve(true);

    await saveDraftToIndexedDbAndQueueSync('save-and-exit');
    const draftSaved = true;
    const historySaved = await historySavePromise;
    const success = !!draftSaved && historySaved !== false;
    if (panel && success) {
        panel.markClean();
    }
    if (!success) {
        showSaveToast('Не удалось сохранить прогресс.', 'error');
        return;
    }
    hideExitModal();
    showSaveToast('Прогресс сохранён. Можно продолжить позже.');
    if (typeof window.pendingExitAction === 'function') {
        window.pendingExitAction();
    } else {
        window.location.href = "/";
    }
    window.pendingExitAction = null;
}


//  =============== обертка для аудито ===============================================
document.querySelectorAll(".custom-audio-player").forEach(player => {
    const audio = player.querySelector("audio.audio-element");
    // Если в плеере нет тега <audio> (наш новый визуальный плеер), пропускаем legacy-инициализацию
    if (!audio) return;
    const playBtn = player.querySelector(".play-btn");
    const progressBar = player.querySelector(".progress-bar");
    const currentTimeElem = player.querySelector(".current-time");
    const totalTimeElem = player.querySelector(".total-time");
    // const volumeWrapper = player.querySelector(".volume-wrapperﬁ");
    const volumeSlider = player.querySelector('.volume-slider');
    const muteBtn = player.querySelector('.mute-btn');
    // const speedSelect = player.querySelector(".speed-select");


    // Элементы кастомного селектора скорости
    const speedSelectWrapper = player.querySelector('.custom-speed-select');
    const speedSelectBtn = speedSelectWrapper?.querySelector('.speed-select-button');
    const speedSelected = speedSelectWrapper?.querySelector('.speed-selected');
    const speedOptions = speedSelectWrapper?.querySelector('.speed-options');
    const nativeSpeedSelect = player.querySelector(".speed-select");

    // Инициализация скорости ------------------------------------------------------
    // Функция для обновления скорости воспроизведения
    const updatePlaybackSpeed = (speed) => {
        audio.playbackRate = parseFloat(speed);
        if (speedSelected) speedSelected.textContent = `${speed}x`;
        if (nativeSpeedSelect) nativeSpeedSelect.value = speed;
    };

    // Инициализация скорости
    if (speedSelectWrapper) {
        // Обработчик клика по кнопке селектора
        speedSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speedSelectWrapper.classList.toggle('active');
        });

        // Обработчик выбора скорости
        speedOptions.querySelectorAll('li').forEach(option => {
            option.addEventListener('click', () => {
                const speed = option.dataset.value;
                updatePlaybackSpeed(speed);
                speedSelectWrapper.classList.remove('active');
            });
        });

        // Инициализация начального значения
        const initialSpeed = nativeSpeedSelect?.value || '1.0';
        updatePlaybackSpeed(initialSpeed);
    }

    // Обработчик изменения скорости в нативном select
    if (nativeSpeedSelect) {
        nativeSpeedSelect.addEventListener('change', () => {
            updatePlaybackSpeed(nativeSpeedSelect.value);
        });
    }

    // Инициализация громкости ------------------------------------------------------
    audio.volume = 0.7; // Установите начальную громкость
    volumeSlider.value = audio.volume;

    // Обработчик воспроизведения/паузы
    playBtn.addEventListener("click", () => {
        if (audio.paused) {
            audio.play();
            //playBtn.textContent = "⏸";
            playBtn.innerHTML = '<i data-lucide="pause"></i>';
        } else {
            audio.pause();
            playBtn.innerHTML = '<i data-lucide="play"></i>';
            // playBtn.textContent = "▶";
        }
        lucide.createIcons();
    });

    // Обработчик громкости
    volumeSlider.addEventListener('input', () => {
        audio.volume = volumeSlider.value;
        updateVolumeIcon(audio.volume, muteBtn);
    });


    // Обработчик кнопки mute
    muteBtn.addEventListener('click', () => {
        if (audio.volume > 0) {
            audio.volume = 0;
            volumeSlider.value = 0;
        } else {
            audio.volume = volumeSlider.dataset.lastVolume || 0.7;
            volumeSlider.value = audio.volume;
        }
        updateVolumeIcon(audio.volume, muteBtn);
    });

    // Сохраняем последнее значение громкости перед mute
    volumeSlider.addEventListener('mousedown', () => {
        if (audio.volume > 0) {
            volumeSlider.dataset.lastVolume = audio.volume;
        }
    });

    // Обновление прогресса
    audio.addEventListener("timeupdate", () => {
        const current = audio.currentTime;
        const duration = audio.duration;
        progressBar.value = (current / duration) * 100 || 0;
        currentTimeElem.textContent = formatTime(current);
        totalTimeElem.textContent = formatTime(duration || 0);
    });

    // Перемотка по клику на прогресс-бар
    progressBar.addEventListener("input", () => {
        audio.currentTime = (progressBar.value / 100) * audio.duration;
    });

    // Обновление иконки громкости при загрузке
    updateVolumeIcon(audio.volume, muteBtn);


});

// Закрытие всех селекторов скорости при клике вне их
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-speed-select')) {
        document.querySelectorAll('.custom-speed-select').forEach(select => {
            select.classList.remove('active');
        });
    }
});

// Функция для обновления иконки громкости
function updateVolumeIcon(volume, muteBtn) {
    let icon;
    if (volume === 0) {
        icon = 'volume-x';
    } else if (volume < 0.3) {
        icon = 'volume';
    } else if (volume < 0.6) {
        icon = 'volume-1';
    } else {
        icon = 'volume-2';
    }
    muteBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
    lucide.createIcons();
}


// Форматирование времени для аудиоплеера
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

// --------------------------------------------------------------------------------
// Функция для валидации ввода
function validatePlaySequenceInput(input) {
    const value = input.value.toLowerCase();
    const validChars = /^[omfta]*$/;

    if (value && !validChars.test(value)) {
        // Удаляем недопустимые символы
        input.value = value.replace(/[^omfta]/g, '');
    }

    // Ограничиваем длину
    if (input.value.length > 10) {
        input.value = input.value.slice(0, 10);
    }
}

// Инициализация полей ввода
function initPlaySequenceInputs() {
    const inputs = document.querySelectorAll('.play-sequence-input');

    inputs.forEach(input => {
        // Пропускаем поле числа (Повторы аудио) - для него отдельная обработка
        if (input.type === 'number' || input.id === 'audioRepeatsInput') {
            // Обработка для поля числа
            input.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                // Если значение выходит за пределы, ограничиваем его
                if (!isNaN(value)) {
                    if (value < 0) e.target.value = 0;
                    if (value > 9) e.target.value = 9;
                } else if (e.target.value === '' || e.target.value === '-') {
                    // Разрешаем пустое значение или минус (будет исправлено при blur)
                    return;
                } else {
                    // Если введено не число, восстанавливаем предыдущее значение
                    const prevValue = e.target.dataset.prevValue || '3';
                    e.target.value = prevValue;
                }
            });

            input.addEventListener('focus', (e) => {
                // Сохраняем текущее значение перед изменением
                e.target.dataset.prevValue = e.target.value;
            });

            input.addEventListener('blur', (e) => {
                // Восстанавливаем значение, если оно пустое или невалидное
                const value = parseInt(e.target.value, 10);
                if (isNaN(value) || value < 0) {
                    e.target.value = e.target.dataset.prevValue || '3';
                } else if (value > 9) {
                    e.target.value = '9';
                }
                // Обновляем REQUIRED_PASSED_COUNT напрямую
                // Пересчет произойдет через AudioSettingsPanel.onSettingsChange
                const finalValue = parseInt(e.target.value, 10);
                if (!isNaN(finalValue) && finalValue >= 0 && finalValue <= 9) {
                    REQUIRED_PASSED_COUNT = finalValue;
                }
            });

            input.addEventListener('change', (e) => {
                // При изменении через стрелки обновляем REQUIRED_PASSED_COUNT
                // Пересчет произойдет через AudioSettingsPanel.onSettingsChange
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 0 && value <= 9) {
                    REQUIRED_PASSED_COUNT = value;
                }
            });

            return; // Пропускаем остальную обработку для этого поля
        }

        // Валидация при вводе (только для текстовых полей)
        input.addEventListener('input', (e) => {
            validatePlaySequenceInput(e.target);
        });

        // Валидация при вставке
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text').toLowerCase();
            const filteredText = pastedText.replace(/[^omfta]/g, '').slice(0, 10);
            input.value = filteredText;
        });

        // Валидация при потере фокуса
        input.addEventListener('blur', (e) => {
            validatePlaySequenceInput(e.target);
        });
    });
}

// Функция для получения значений
function getPlaySequenceValues() {
    return {
        start: (playSequenceStart !== undefined && playSequenceStart !== null) ? playSequenceStart : 'oto',
        typo: (playSequenceTypo !== undefined && playSequenceTypo !== null) ? playSequenceTypo : 'o',
        success: (playSequenceSuccess !== undefined && playSequenceSuccess !== null) ? playSequenceSuccess : 'ot'
    };
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function () {
    // Загружаем настройки аудио из данных пользователя (асинхронно)
    await loadAudioSettingsFromUser();

    // Remember the initial preference: if the user starts in local mode,
    // we will preload once the sentence selection table is visible, even
    // if they temporarily switch to internet while the table is loading.
    try {
        whisperWasLocalOnBoot = getEffectiveSpeechRecognitionMode() === 'route-off';
    } catch (e) {
        whisperWasLocalOnBoot = false;
    }

    // Инициализируем модальное окно настроек аудио
    initAudioSettingsModal();
});

// обработчики событий для отслеживания активности:-----------------------------------------------
document.addEventListener('DOMContentLoaded', function () {

    // Обработчик клика на часы для паузы
    const timerButton = document.querySelector('.stat-btn.timer');
    if (timerButton) {
        timerButton.addEventListener('click', function () {
            if (pauseModal.style.display === 'flex') {
                resumeGame();
            } else {
                pauseGame();
            }
        });

        // Убираем disabled атрибут чтобы кнопка была кликабельной
        timerButton.removeAttribute('disabled');
    }

    // Обработчики для отслеживания активности пользователя
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    activityEvents.forEach(eventName => {
        document.addEventListener(eventName, function () {
            // так как таймер запутился сам то время простоя можно вычесть из времени игры
            // dictationAllTime = dictationAllTime - INACTIVITY_TIMEOUT;
            // останавливаем таймер игры и запускаем таймер паузы
            resetInactivityTimer();
        }, true);
    });

    // Клавиша Escape для паузы
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && pauseModal.style.display === 'flex') {
            event.preventDefault();
            resumeGame();
        }
    });
});

function disableProfileNavigation() {
    const profileLink = document.querySelector('.user-section .username');
    if (!profileLink) return;
    profileLink.addEventListener('click', (event) => {
        event.preventDefault();
    });
    profileLink.classList.add('profile-link-disabled');
    profileLink.removeAttribute('href');
    if (!profileLink.getAttribute('title')) {
        profileLink.setAttribute('title', 'Профиль открывается из каталога диктантов');
    }
}

document.addEventListener('DOMContentLoaded', disableProfileNavigation);

// Инициализация модального окна настроек аудио
function initAudioSettingsModal() {
    const audioSettingsModal = document.getElementById('audioSettingsModal');
    const audioSettingsButton = document.getElementById('audioSettingsButton');
    const topbarSettingsButton = document.getElementById('openDictationSettingsBtn');
    const startModalSettingsButton = document.getElementById('startModalOpenSettingsBtn');
    const closeAudioSettingsModal = document.getElementById('closeAudioSettingsModal');
    const modalContainer = document.getElementById('audioSettingsModalContainer');

    const setAudioSettingsBusy = (isBusy) => {
        if (!audioSettingsModal) return;
        const header = audioSettingsModal.querySelector('.modal-header');
        if (!header) return;

        // Никогда не блокируем крестик закрытия: иначе модалка может выглядеть как «залипшая».
        if (closeAudioSettingsModal) {
            closeAudioSettingsModal.disabled = false;
            closeAudioSettingsModal.style.pointerEvents = 'auto';
        }

        let indicator = header.querySelector('#audioSettingsBusyIndicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.id = 'audioSettingsBusyIndicator';
            indicator.setAttribute('aria-hidden', 'true');
            indicator.style.display = 'inline-block';
            indicator.style.width = '12px';
            indicator.style.height = '12px';
            indicator.style.borderRadius = '50%';
            indicator.style.border = '2px solid #f59e0b';
            indicator.style.borderTopColor = 'transparent';
            indicator.style.boxSizing = 'border-box';
            indicator.style.animation = 'dictafanAudioSettingsSpin 0.8s linear infinite';
            indicator.style.marginLeft = '10px';
            indicator.style.opacity = '0';
            indicator.style.transition = 'opacity 120ms ease';
            indicator.style.flex = '0 0 auto';

            if (!document.getElementById('dictafan-audio-settings-spin-style')) {
                const style = document.createElement('style');
                style.id = 'dictafan-audio-settings-spin-style';
                style.textContent = `@keyframes dictafanAudioSettingsSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
                document.head.appendChild(style);
            }

            const title = header.querySelector('h2');
            if (title) {
                // Keep indicator visually bound to the title; otherwise with justify-content: space-between
                // it can end up in the middle of the header and look like it disappeared.
                title.appendChild(indicator);
            } else {
                header.appendChild(indicator);
            }
        }

        indicator.style.opacity = isBusy ? '1' : '0';
    };

    if (!audioSettingsModal || !modalContainer) {
        console.warn('Элементы модального окна настроек аудио не найдены');
        return;
    }

    if (audioSettingsModal.dataset.initialized === 'true') {
        return;
    }
    audioSettingsModal.dataset.initialized = 'true';

    // Инициализируем панель настроек в модальном окне
    audioSettingsModalPanel = new AudioSettingsPanel({
        container: modalContainer,
        mode: 'modal',
        showExplanations: true,
        onSettingsChange: async (settings) => {
            // Обновляем глобальные переменные
            playSequenceStart = (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto';
            playSequenceTypo = (settings.typo !== undefined && settings.typo !== null) ? settings.typo : 'o';
            playSequenceSuccess = (settings.success !== undefined && settings.success !== null) ? settings.success : 'ot';
            const oldValue = REQUIRED_PASSED_COUNT;
            REQUIRED_PASSED_COUNT = (settings.repeats !== undefined && settings.repeats !== null) ? settings.repeats : 3;
            if (settings.required_passed_star_half !== undefined && settings.required_passed_star_half !== null) {
                REQUIRED_PASSED_STAR_HALF = settings.required_passed_star_half;
            }

            window.audioSettingsWithoutEnteringText = Boolean(settings.without_entering_text);
            window.audioSettingsShowText = Boolean(settings.show_text);

            // Обновляем метод распознавания речи
            if (settings.speech_recognition_mode) {
                console.log(`🔄 [onSettingsChange] Изменяем режим распознавания: ${speechRecognitionMode} -> ${settings.speech_recognition_mode}`);
                const oldMode = speechRecognitionMode;
                speechRecognitionMode = settings.speech_recognition_mode;
                
                // Если режим изменился, останавливаем старый движок и сбрасываем unifiedSpeechRecognizer,
                // чтобы он пересоздался с новым режимом.
                if (oldMode !== speechRecognitionMode && unifiedSpeechRecognizer) {
                    console.log(`🔄 [onSettingsChange] Режим изменился, останавливаем и сбрасываем unifiedSpeechRecognizer для пересоздания с новым режимом`);
                    try {
                        if (typeof unifiedSpeechRecognizer.cleanup === 'function') {
                            unifiedSpeechRecognizer.cleanup();
                        }
                    } catch (e) {
                        console.warn('⚠️ Ошибка cleanup UnifiedSpeechRecognition при смене режима:', e);
                    }

                    unifiedSpeechRecognizer = null;
                }
                
                // Обновляем иконку режима распознавания сразу после изменения режима
                console.log(`🔄 [onSettingsChange] Вызываем updateRecognitionModeIcon() с режимом: ${speechRecognitionMode}`);
                updateRecognitionModeIcon();

                try {
                    preloadWhisperModelIfNeeded('mode_switch').catch(() => { });
                } catch (e) {
                }
            }

            // Сохраняем настройки в БД
            setAudioSettingsBusy(true);
            try {
                await saveAudioSettingsToUser(settings);
            } finally {
                setAudioSettingsBusy(false);
            }

            // Пересчитываем доступность кнопок записи
            if (oldValue !== REQUIRED_PASSED_COUNT) {
                recalculateAudioAvailabilityForAllSentences();
            }

            // Применяем настройки к текущему предложению
            // ВАЖНО: applyAudioSettingsToUI() также вызывает updateRecognitionModeIcon(),
            // но это нормально - это гарантирует, что иконка будет обновлена
            console.log(`🔄 [onSettingsChange] Вызываем applyAudioSettingsToUI() после изменения настроек`);
            applyAudioSettingsToUI();
        }
    });
    audioSettingsPanel = audioSettingsModalPanel;

    // Инициализируем панель сразу текущими значениями.
    // Актуализация делается каждый раз при открытии модалки (openModal),
    // чтобы учесть настройки из черновика/профиля, которые могли прийти позже.
    try {
        audioSettingsModalPanel.setSettings({
            start: playSequenceStart,
            typo: playSequenceTypo,
            success: playSequenceSuccess,
            repeats: REQUIRED_PASSED_COUNT,
            required_passed_star_half: REQUIRED_PASSED_STAR_HALF,
            without_entering_text: window.audioSettingsWithoutEnteringText || false,
            show_text: window.audioSettingsShowText || false,
            speech_recognition_mode: speechRecognitionMode
        });
        audioSettingsModalPanel.init();
    } catch (e) {
    }

    const openModal = (sourceLabel = 'unknown', event = null) => {
        try {
            const target = event && event.target ? event.target : null;
            const currentDisplay = audioSettingsModal ? audioSettingsModal.style.display : '(no modal)';
            const computed = audioSettingsModal ? window.getComputedStyle(audioSettingsModal) : null;
            const zIndex = computed ? computed.zIndex : '(no computed)';
            const pointerEvents = computed ? computed.pointerEvents : '(no computed)';
            console.log(`⚙️ [AudioSettingsModal] openModal() source=${sourceLabel}`, {
                hasModal: !!audioSettingsModal,
                hasContainer: !!modalContainer,
                currentDisplay,
                computedDisplay: computed ? computed.display : null,
                zIndex,
                pointerEvents,
                targetTag: target ? target.tagName : null,
                targetId: target ? target.id : null,
                targetClass: target ? target.className : null
            });
        } catch (e) {
        }

        if (!audioSettingsModal) {
            console.warn('⚠️ [AudioSettingsModal] openModal called but audioSettingsModal is missing');
            return;
        }

        // Перед показом модалки всегда синхронизируем UI с текущими глобальными настройками
        // (они могли быть обновлены из профиля или из черновика после первой инициализации).
        try {
            if (audioSettingsModalPanel) {
                audioSettingsModalPanel.setSettings({
                    start: playSequenceStart,
                    typo: playSequenceTypo,
                    success: playSequenceSuccess,
                    repeats: REQUIRED_PASSED_COUNT,
                    required_passed_star_half: REQUIRED_PASSED_STAR_HALF,
                    without_entering_text: window.audioSettingsWithoutEnteringText || false,
                    show_text: window.audioSettingsShowText || false,
                    speech_recognition_mode: speechRecognitionMode
                });
            }
        } catch (e) {
        }

        audioSettingsModal.style.display = 'flex';
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }

        try {
            const computedAfter = window.getComputedStyle(audioSettingsModal);
            console.log(`✅ [AudioSettingsModal] opened source=${sourceLabel}`, {
                styleDisplay: audioSettingsModal.style.display,
                computedDisplay: computedAfter ? computedAfter.display : null,
                zIndex: computedAfter ? computedAfter.zIndex : null
            });
        } catch (e) {
        }
    };

    const bindOpenHandler = (btn, label) => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            try {
                console.log(`🖱️ [AudioSettingsModal] click ${label}`, {
                    targetTag: e && e.target ? e.target.tagName : null,
                    targetId: e && e.target ? e.target.id : null,
                    targetClass: e && e.target ? e.target.className : null,
                    currentTargetId: e && e.currentTarget ? e.currentTarget.id : null
                });
            } catch (err) {
            }
            try {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            } catch (err) {
            }
            openModal(label, e);
        });
    };

    // Обработчик открытия модального окна (кнопка в таблице)
    bindOpenHandler(audioSettingsButton, 'table-gear');

    // Обработчик открытия модального окна (кнопка в topbar)
    bindOpenHandler(topbarSettingsButton, 'topbar-gear');

    // Обработчик открытия модального окна (кнопка в шапке модального окна выбора предложений)
    bindOpenHandler(startModalSettingsButton, 'start-modal-gear');

    // Обработчик закрытия модального окна
    if (closeAudioSettingsModal) {
        closeAudioSettingsModal.addEventListener('click', () => {
            audioSettingsModal.style.display = 'none';
            updateRecognitionModeIcon();
        });
    }

    // Закрытие по клику вне модального окна
    audioSettingsModal.addEventListener('click', (e) => {
        if (e.target === audioSettingsModal) {
            audioSettingsModal.style.display = 'none';
            updateRecognitionModeIcon();
        }
    });
}