// Offline-first схема сохранения аудио:
// 1) до Save: несохранённое аудио хранится только в памяти вкладки (Blob/objectURL)
// 2) после Save: аудио читается из /api/dictations/... (cache/B2)

const userManager = window.UM;
const waveformContainer = document.getElementById('audioWaveform');
const currentAudioInfo = document.getElementById('currentAudioInfo');
const currentSentenceInfo = document.getElementById('currentSentenceInfo');
const startInput = document.getElementById('audioStartTime');
const endInput = document.getElementById('audioEndTime');

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

function initTranslationsTabV2() {
    try {
        const container = document.getElementById('translationLanguagesList');
        if (!container) return;
        // Render list UI (checkbox + flag + language name)
        renderTranslationsTabV2();
        bindTranslationsTabV2Handlers();
    } catch (e) {
    }

    try {
        syncTranslationsFromDictationMeta();
    } catch (e) {
    }

    try {
        renderHeaderLangPairWithManager();
    } catch (e) {
    }
}

async function renderTableFromWorkingData() {
    try {
        await createTable();
    } catch (e) {
    }
}

function getAvailableTranslationLanguages() {
    try {
        const orig = normalizeLangCode(currentDictation && currentDictation.language_original);
        const list = window.LanguageManager ? window.LanguageManager.getAvailableLanguages() : [];
        return (Array.isArray(list) ? list : [])
            .map(normalizeLangCode)
            .filter(Boolean)
            .filter(l => !orig || l !== orig);
    } catch (e) {
        return [];
    }
}

function getLanguageNameSafe(langCode) {
    try {
        const code = normalizeLangCode(langCode);
        if (!code) return '';
        if (window.LanguageManager && typeof window.LanguageManager.getLanguageName === 'function') {
            return window.LanguageManager.getLanguageName(code);
        }
        return code;
    } catch (e) {
        return String(langCode || '');
    }
}

function getFlagHtml(langCode) {
    try {
        const code = normalizeLangCode(langCode);
        if (!code || !window.LanguageManager) return '';
        const cc = String(window.LanguageManager.getCountryCode(code) || '').trim().toLowerCase();
        if (!cc) return '';
        return `<img src="/static/flags/${cc}.svg" alt="${code}" class="language-flag" onerror="this.style.display='none'">`;
    } catch (e) {
        return '';
    }
}

function syncTranslationsFromDictationMeta() {
    try {
        const orig = normalizeLangCode(currentDictation && currentDictation.language_original);
        const tf = (currentDictation && currentDictation.translation_flags) ? currentDictation.translation_flags : {};
        if (tf && typeof tf === 'object') {
            for (const k of Object.keys(tf)) {
                const lang = normalizeLangCode(k);
                if (!lang || (orig && lang === orig)) continue;
                if (tf[k] === true) {
                    ensureTranslation(lang);
                }
            }
        }
    } catch (e) {
    }
}

let headerLangPairSelector = null;

function updateHeaderNativeMismatchLabel({ preferred, selected, hasTranslations }) {
    try {
        const container = document.getElementById('langPair');
        if (!container) return;

        const prev = container.querySelector('.header-native-mismatch');
        if (prev) prev.remove();

        const p = normalizeLangCode(preferred);
        const s = normalizeLangCode(selected);

        if (!hasTranslations) return;
        if (!p || !s) return;
        if (p === s) return;

        const label = document.createElement('div');
        label.className = 'header-native-mismatch';
        label.textContent = 'это не твой родной язык';
        container.appendChild(label);
    } catch (e) {
    }
}

function renderHeaderLangPairWithManager() {
    try {
        const container = document.getElementById('langPair');
        if (!container) return;
        if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') return;

        const languageData = window.LanguageManager.getLanguageData();
        if (!languageData) return;

        const orig = normalizeLangCode(currentDictation && currentDictation.language_original);
        try { syncTranslationsFromDictationMeta(); } catch (e) {}
        const activeTranslations = listExistingTranslationLangs()
            .filter(l => !orig || l !== orig);

        const preferred = normalizeLangCode(currentDictation && currentDictation.preferred_translation_language);
        const currentTr = normalizeLangCode(currentDictation && currentDictation.language_translation);
        let userNative = '';
        try {
            userNative = normalizeLangCode(window.USER_LANGUAGE_DATA && (window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang));
        } catch (e) {
            userNative = '';
        }
        const tr = (currentTr && activeTranslations.includes(currentTr))
            ? currentTr
            : ((userNative && activeTranslations.includes(userNative))
                ? userNative
                : ((preferred && activeTranslations.includes(preferred))
                    ? preferred
                    : (activeTranslations[0] || '')));

        // Keep currentDictation in sync.
        try { currentDictation.language_translation = tr; } catch (e) {}

        container.innerHTML = '';

        if (activeTranslations.length === 0) {
            headerLangPairSelector = window.initLanguageSelector('langPair', {
                mode: 'flag-single',
                currentLearning: orig,
                nativeLanguage: orig,
                languageData
            });
            // Add label "без перевода"
            try {
                const label = document.createElement('span');
                label.className = 'flag-separator';
                label.style.marginLeft = '8px';
                label.textContent = 'без перевода';
                container.appendChild(label);
            } catch (e) {}
            try {
                const tl = document.getElementById('translationLanguageLabel');
                if (tl) tl.textContent = 'без перевода:';
                const inp = document.getElementById('title_translation');
                if (inp) inp.style.display = 'none';
            } catch (e) {
            }
            try {
                updateHeaderNativeMismatchLabel({ preferred, selected: tr, hasTranslations: false });
            } catch (e) {
            }
            return;
        }

        try {
            const tl = document.getElementById('translationLanguageLabel');
            if (tl) tl.textContent = `${tr}:`;
            const inp = document.getElementById('title_translation');
            if (inp) inp.style.display = '';
        } catch (e) {
        }

        if (activeTranslations.length === 1) {
            headerLangPairSelector = window.initLanguageSelector('langPair', {
                mode: 'flag-pair-fixed',
                currentLearning: orig,
                nativeLanguage: tr,
                languageData
            });
            try {
                updateHeaderNativeMismatchLabel({ preferred, selected: tr, hasTranslations: true });
            } catch (e) {
            }
            return;
        }

        headerLangPairSelector = window.initLanguageSelector('langPair', {
            mode: 'flag-pair-dropdown-right',
            currentLearning: orig,
            nativeLanguage: tr,
            nativeLanguages: activeTranslations,
            learningLanguages: [orig],
            languageData,
            onLanguageChange: function (values) {
                try {
                    const next = values && values.nativeLanguage ? String(values.nativeLanguage).toLowerCase() : '';
                    if (!next) return;
                    setHeaderTranslationLanguage(next, { preserveDirty: true });
                    renderTranslationsTabV2();
                } catch (e) {
                }
            }
        });

        try {
            updateHeaderNativeMismatchLabel({ preferred, selected: tr, hasTranslations: true });
        } catch (e) {
        }
    } catch (e) {
    }
}

function renderTranslationsTabV2() {
    try {
        const container = document.getElementById('translationLanguagesList');
        if (!container) return;
        syncTranslationsFromDictationMeta();

        const prevScrollTop = container.scrollTop;

        const activeLang = normalizeLangCode(currentDictation && currentDictation.language_translation);
        const available = getAvailableTranslationLanguages();

        let html = '<div class="translations-v2-list">';
        for (const lang of available) {
            const code = normalizeLangCode(lang);
            const entry = (workingData && workingData.translations && code) ? workingData.translations[code] : null;
            const isChecked = !!entry;
            const isCurrent = !!(activeLang && activeLang === normalizeLangCode(lang));
            const iconName = isChecked ? 'circle-check-big' : 'circle';
            html += `
                <div class="translations-v2-item${isCurrent ? ' translations-v2-item--current' : ''}" data-lang="${lang}">
                    <label class="checkbox-label translations-v2-checkbox" style="cursor: pointer;">
                        <input type="checkbox" class="translations-v2-input" ${isChecked ? 'checked' : ''} style="display: none;">
                        <i data-lucide="${iconName}" class="checkbox-icon"></i>
                    </label>
                    <div class="translations-v2-flag">${getFlagHtml(lang)}</div>
                    <div class="translations-v2-name">${getLanguageNameSafe(lang)}</div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;

        try {
            container.scrollTop = prevScrollTop;
        } catch (e) {
        }

        try {
            if (window.lucide && window.lucide.createIcons) {
                window.lucide.createIcons();
            }
        } catch (e) {
        }
    } catch (e) {
    }
}

function closeCreateTranslationLangModal() {
    try {
        const m = document.getElementById('createTranslationLangModal');
        if (m) m.style.display = 'none';
    } catch (e) {
    }
}

function closeRemoveTranslationLangModal() {
    try {
        const m = document.getElementById('removeTranslationLangModal');
        if (m) m.style.display = 'none';
    } catch (e) {
    }
}

function openCreateTranslationLangModal(lang) {
    try {
        const m = document.getElementById('createTranslationLangModal');
        if (!m) return;
        const t = document.getElementById('createTranslationLangModalText');
        if (t) t.textContent = `Создать массив переводов по языку ${getLanguageNameSafe(lang)}?`;
        m.style.display = 'flex';
        m.dataset.lang = normalizeLangCode(lang);
    } catch (e) {
    }
}

function openRemoveTranslationLangModal(lang) {
    try {
        const code = normalizeLangCode(lang);
        const m = document.getElementById('removeTranslationLangModal');
        if (!m) return;
        const t = document.getElementById('removeTranslationLangModalText');
        if (t) t.textContent = `Переводы на ${getLanguageNameSafe(code)} будут очищены при сохранении!`;
        m.style.display = 'flex';
        m.dataset.lang = code;
    } catch (e) {
    }
}

async function createTranslationLanguage(lang) {
    showLoadingIndicator('Создание перевода...');
    try {
        const code = normalizeLangCode(lang);
        if (!code) return;

        try {
            showLoadingIndicator(`Создание переводов (${code})...`);
        } catch (e) {
        }

        try {
            const entry = ensureTranslation(code);
            if (entry) {
                entry.language = code;
                entry.speakers = (workingData && workingData.original) ? (workingData.original.speakers || {}) : {};
            }

            const origSent = (workingData && workingData.original && Array.isArray(workingData.original.sentences)) ? workingData.original.sentences : [];
            const out = [];
            for (let i = 0; i < origSent.length; i++) {
                const s = origSent[i];
                if (!s) continue;
                const key = String(s.key || s.sentence_key || '').trim();
                if (!key) continue;

                let trText = '';
                try {
                    trText = normalizeDictationInvisibleChars(await autoTranslate(String(s.text || ''), currentDictation.language_original, code));
                } catch (e) {
                    trText = '';
                }

                const audioFile = generateAudioFileName(key, code);
                const trSentence = {
                    key,
                    speaker: s.speaker || '1',
                    text: trText,
                    audio: audioFile,
                    audio_avto: audioFile,
                    audio_user: '',
                    audio_mic: '',
                    start: 0,
                    end: 0,
                    chain: false,
                    explanation: ''
                };

                try {
                    showLoadingIndicator(`Создание перевода ${i + 1} из ${origSent.length}...`);
                } catch (e) {
                }

                await generateAudioForSentence(trSentence, code);
                out.push(trSentence);
            }
            if (entry) {
                entry.sentences = out;
            }

            setHeaderTranslationLanguage(code);

            try {
                renderTableFromWorkingData();
                applyTableViewForTab(currentTabName);
            } catch (e) {
            }

            renderTranslationsTabV2();

            try {
                // Creating/removing translation language is a DB/meta change; audio becomes dirty
                // only when actual audio is generated/recorded.
                setDirtyFlags({ db: true, audio: true });
                updateUnsavedStar();
            } catch (e) {
            }
        } finally {
            hideLoadingIndicator();
        }
    } catch (e) {
    }
}

function markTranslationInactive(lang, nextActiveLang) {
    const code = normalizeLangCode(lang);
    try {
        if (workingData && workingData.translations && code && workingData.translations[code]) {
            delete workingData.translations[code];
        }
        try {
            if (currentDictation && currentDictation.translation_flags) {
                currentDictation.translation_flags[code] = false;
            }
        } catch (e) {
        }

        const next = (() => {
            try {
                const remaining = listExistingTranslationLangs().filter(l => l && l !== code);
                const preferred = (() => {
                    try {
                        return normalizeLangCode(window.USER_LANGUAGE_DATA && (window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang));
                    } catch (e) {
                        return '';
                    }
                })();
                const requested = normalizeLangCode(nextActiveLang);

                if (requested && remaining.includes(requested)) return requested;
                if (preferred && remaining.includes(preferred)) return preferred;
                return remaining[0] || '';
            } catch (e) {
                return '';
            }
        })();

        if (next && workingData && workingData.translations && workingData.translations[next]) {
            setHeaderTranslationLanguage(next);
        } else {
            setHeaderNoTranslationMode();
        }

        try {
            renderTableFromWorkingData();
            applyTableViewForTab(currentTabName);
        } catch (e) {
        }

        renderTranslationsTabV2();
        try {
            setDirtyFlags({ db: true, audio: true });
            updateUnsavedStar();
        } catch (e) {
        }
    } catch (e) {
    }
}

function selectTranslationLanguageAsCurrent(lang) {
    const code = normalizeLangCode(lang);
    if (!code) return;

    try {
        if (!workingData || !workingData.translations || !workingData.translations[code]) {
            return;
        }
        setHeaderTranslationLanguage(code, { preserveDirty: true });

        try {
            renderTableFromWorkingData();
            applyTableViewForTab(currentTabName);
        } catch (e) {
        }

        renderTranslationsTabV2();
    } catch (e) {
    }
}

function bindTranslationsTabV2Handlers() {
    try {
        if (window.__DICTATION_TRANSLATIONS_V2_BOUND) return;
        window.__DICTATION_TRANSLATIONS_V2_BOUND = true;
    } catch (e) {
    }

    const container = document.getElementById('translationLanguagesList');
    if (!container) return;

    // Single click vs double click
    let clickTimer = null;
    let lastClickLang = '';
    let lastClickAt = 0;

    container.addEventListener('click', (e) => {
        const row = e.target.closest('.translations-v2-item');
        if (!row) return;
        const lang = row.dataset.lang;
        if (!lang) return;

        // If user clicked on the checkbox/icon area, treat it as an explicit
        // toggle action (create/remove) and show the modal immediately.
        const clickedCheckbox = !!e.target.closest('.translations-v2-checkbox');
        if (clickedCheckbox) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const code = normalizeLangCode(lang);
            const isActive = !!(workingData && workingData.translations && code && workingData.translations[code]);
            if (!isActive) {
                openCreateTranslationLangModal(lang);
            } else {
                openRemoveTranslationLangModal(lang);
            }
            return;
        }

        // Fallback for environments where dblclick is unreliable: treat 2 fast clicks
        // on the same language as a "2 cycles" action.
        const now = Date.now();
        const sameAsPrev = lastClickLang && normalizeLangCode(lastClickLang) === normalizeLangCode(lang);
        const isSecondFastClick = sameAsPrev && lastClickAt && (now - lastClickAt) <= 700;
        lastClickLang = lang;
        lastClickAt = now;

        if (isSecondFastClick) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const code = normalizeLangCode(lang);
            const isActive = !!(workingData && workingData.translations && code && workingData.translations[code]);
            if (!isActive) {
                openCreateTranslationLangModal(lang);
            } else {
                openRemoveTranslationLangModal(lang);
            }
            return;
        }

        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            clickTimer = null;
            selectTranslationLanguageAsCurrent(lang);
        }, 250);
    });

    container.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.translations-v2-item');
        if (!row) return;
        const lang = row.dataset.lang;
        if (!lang) return;

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }

        const code = normalizeLangCode(lang);
        const isActive = !!(workingData && workingData.translations && code && workingData.translations[code]);
        if (!isActive) {
            openCreateTranslationLangModal(lang);
        } else {
            openRemoveTranslationLangModal(lang);
        }
    });

    // Modals
    try {
        const closeBtn = document.getElementById('createTranslationLangModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeCreateTranslationLangModal);
        const createBtn = document.getElementById('createTranslationLangModalCreateBtn');
        if (createBtn) {
            createBtn.addEventListener('click', async () => {
                const m = document.getElementById('createTranslationLangModal');
                const lang = m ? normalizeLangCode(m.dataset.lang) : '';
                closeCreateTranslationLangModal();
                if (!lang) return;
                await createTranslationLanguage(lang);
            });
        }
    } catch (e) {
    }

    try {
        const closeBtn = document.getElementById('removeTranslationLangModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeRemoveTranslationLangModal);
        const clearBtn = document.getElementById('removeTranslationLangModalClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const m = document.getElementById('removeTranslationLangModal');
                const lang = m ? normalizeLangCode(m.dataset.lang) : '';
                closeRemoveTranslationLangModal();
                if (!lang) return;
                markTranslationInactive(lang, '');
            });
        }
    } catch (e) {
    }

    // Close translation modals by clicking on overlay
    try {
        const cm = document.getElementById('createTranslationLangModal');
        if (cm) {
            cm.addEventListener('click', (e) => {
                if (e.target === cm) closeCreateTranslationLangModal();
            });
        }
        const rm = document.getElementById('removeTranslationLangModal');
        if (rm) {
            rm.addEventListener('click', (e) => {
                if (e.target === rm) closeRemoveTranslationLangModal();
            });
        }
    } catch (e) {
    }
}

async function cleanupStaleB2DictationAudio({ dictationId, token }) {
    try {
        const id = String(dictationId || '').trim();
        if (!id || !id.startsWith('dict_')) return;
        if (!token) return;

        const am = window.AudioManager;
        if (!am || typeof am.cleanupStaleB2DictationAudio !== 'function') {
            throw new Error('AudioManager_not_loaded');
        }

        const keep = new Set();
        const push = (lang, rawFilename) => {
            try {
                const l = String(lang || '').trim();
                const v = String(rawFilename || '').trim();
                if (!l || !v) return;
                if (v.startsWith('blob:')) return;
                if (v.startsWith('/api/')) {
                    const name = v.split('?', 1)[0].split('/').pop();
                    if (!name) return;
                    keep.add(`dictations/${id}/${l}/${name}`);
                    return;
                }
                if (v.startsWith('http://') || v.startsWith('https://')) {
                    const name = v.split('?', 1)[0].split('/').pop();
                    if (!name) return;
                    keep.add(`dictations/${id}/${l}/${name}`);
                    return;
                }
                const name = v.split('?', 1)[0].split('/').pop();
                if (!name) return;
                keep.add(`dictations/${id}/${l}/${name}`);
            } catch (e) {
            }
        };

        const pushExpectedAutoAudio = (lang) => {
            try {
                const l = normalizeLangCode(lang);
                if (!l) return;
                const origSent = (workingData && workingData.original && Array.isArray(workingData.original.sentences))
                    ? workingData.original.sentences
                    : [];
                for (const s of origSent) {
                    if (!s) continue;
                    const key = String(s.key || s.sentence_key || '').trim();
                    if (!key) continue;
                    const fname = generateAudioFileName(key, l);
                    if (fname) {
                        keep.add(`dictations/${id}/${l}/${fname}`);
                    }
                }
            } catch (e) {
            }
        };

        const origLang = normalizeLangCode(currentDictation && currentDictation.language_original);
        const langs = (() => {
            try {
                const out = [];
                if (origLang) out.push(origLang);
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const l = normalizeLangCode(k);
                        if (l && l !== origLang) out.push(l);
                    }
                }
                try {
                    const flags = (currentDictation && currentDictation.translation_flags && typeof currentDictation.translation_flags === 'object')
                        ? currentDictation.translation_flags
                        : {};
                    for (const k of Object.keys(flags)) {
                        if (flags[k] !== true) continue;
                        const l = normalizeLangCode(k);
                        if (l && l !== origLang) out.push(l);
                    }
                } catch (e) {
                }
                return Array.from(new Set(out)).filter(Boolean);
            } catch (e) {
                return [origLang].filter(Boolean);
            }
        })();

        for (const l of langs) {
            const wd = (l && origLang && l === origLang)
                ? (workingData && workingData.original ? workingData.original : null)
                : getTranslationData(l);
            const sentences = wd && Array.isArray(wd.sentences) ? wd.sentences : [];

            if (!sentences.length) {
                // Translation bucket may not be loaded into workingData; still keep expected filenames
                // to avoid deleting already-uploaded translations.
                pushExpectedAutoAudio(l);
            } else {
                for (const s of sentences) {
                    if (!s) continue;
                    push(l, s.audio);
                    push(l, s.audio_avto);
                    push(l, s.audio_mic);
                    push(l, s.audio_user);
                }
                push(l, wd && wd.audio_user_shared);
            }
        }

        const keep_remote_paths = Array.from(keep);

        if (!keep_remote_paths.length) {
            return;
        }

        await am.cleanupStaleB2DictationAudio({
            dictationId: id,
            token,
            keepRemotePaths: keep_remote_paths
        });
    } catch (e) {
    }
}

async function uploadAudioThenCleanupB2({ dictationId, token }) {
    const waitInflightDone = async ({ id, timeoutMs = 30000 } = {}) => {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            try {
                const k = String(id || '');
                if (!k) return;
                const m = window.__B2_AUDIO_UPLOAD_INFLIGHT;
                if (!m || m[k] !== true) return;
            } catch (e) {
                return;
            }
            await new Promise(r => setTimeout(r, 200));
        }
    };

    let res = null;
    try {
        res = await uploadDictationAudioFromCacheToB2({ dictationId, token });
    } catch (e) {
        res = null;
    }

    if (res && res.ok === false && res.reason === 'inflight') {
        try {
            await waitInflightDone({ id: dictationId, timeoutMs: 30000 });
        } catch (e) {
        }
        try {
            res = await uploadDictationAudioFromCacheToB2({ dictationId, token });
        } catch (e) {
        }

        try {
            if (res && res.ok === false && res.reason === 'inflight') {
                if (hasAnyDraftAudioBlob() === false) {
                    res = { ok: true, reason: 'inflight_already_done' };
                }
            }
        } catch (e) {
        }
    }

    try {
        console.warn('[B2 UPLOAD] done', res);
    } catch (e) {
    }
    try {
        await cleanupStaleB2DictationAudio({ dictationId, token });
    } catch (e) {
    }

    return res;
}


async function waitCoverPendingBeforeSave(timeoutMs = 2500) {
    try {
        const startedAt = Date.now();
        while (true) {
            let pending = false;
            try { pending = window.__DICTATION_EDITOR_COVER_PENDING === true; } catch (e) { pending = false; }
            if (!pending) return;
            if (Date.now() - startedAt > (Number(timeoutMs) || 0)) return;
            await new Promise((r) => setTimeout(r, 30));
        }
    } catch (e) {
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

window.__DICTATION_EDITOR_PREWARM_AUDIOS = window.__DICTATION_EDITOR_PREWARM_AUDIOS || Object.create(null);
window.__DICTATION_EDITOR_IS_EXITING = window.__DICTATION_EDITOR_IS_EXITING || false;

window.__DICTATION_EDITOR_DIRTY = window.__DICTATION_EDITOR_DIRTY || {
    db: false,
    audio: false,
    cover: false
};

function setDirtyFlags(next = {}) {
    try {
        const s = window.__DICTATION_EDITOR_DIRTY || (window.__DICTATION_EDITOR_DIRTY = { db: false, audio: false, cover: false });
        if (typeof next.db === 'boolean') s.db = next.db;
        if (typeof next.audio === 'boolean') s.audio = next.audio;
        if (typeof next.cover === 'boolean') s.cover = next.cover;
    } catch (e) {
    }

    try { updateUnsavedStar(); } catch (e) {}
    try { scheduleSaveStatusRefresh(); } catch (e) {}
}

async function openDraftDb() {
    return await new Promise((resolve, reject) => {
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
}

function getDraftUserIdForKey() {
    try {
        const um = window.UM;
        const id = um && um.userData ? um.userData.id : null;
        return id ? String(id) : 'anon';
    } catch (e) {
        return 'anon';
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

async function idbDelete(storeName, key) {
    const db = await openDraftDb();
    try {
        return await new Promise((resolve, reject) => {
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

function getMediaManifestKey(dictationId) {
    const uid = getDraftUserIdForKey();
    const did = String(dictationId || '').trim() || 'unknown';
    return `media_manifest:${uid}:${did}`;
}

async function getMediaManifest(dictationId) {
    try {
        const key = getMediaManifestKey(dictationId);
        const row = await idbGet('media_manifest', key);
        return row && row.value ? row.value : { cover: null, audio: null };
    } catch (e) {
        return { cover: null, audio: null };
    }
}

async function setMediaManifest(dictationId, nextValue) {
    try {
        const key = getMediaManifestKey(dictationId);
        await idbPut('media_manifest', { key, value: nextValue, updated_at: Date.now() });
    } catch (e) {
    }
}

async function clearMediaManifest(dictationId) {
    try {
        const key = getMediaManifestKey(dictationId);
        await idbDelete('media_manifest', key);
    } catch (e) {
    }
}

function mergeWorkingDataToDictationSentences(dictationId, langOrig, langTr) {
    const orig = workingData && workingData.original ? workingData.original : null;
    const tr = getTranslationData(langTr);

    const origSent = orig && Array.isArray(orig.sentences) ? orig.sentences : [];
    const trSent = tr && Array.isArray(tr.sentences) ? tr.sentences : [];

    const trByKey = new Map();
    for (const s of trSent) {
        if (!s) continue;
        const k = String(s.key || s.sentence_key || '').trim();
        if (!k) continue;
        trByKey.set(k, s);
    }

    const safeDictationId = dictationId ? String(dictationId) : '';
    const safeOrig = langOrig ? String(langOrig) : '';
    const safeTr = langTr ? String(langTr) : '';

    const extractAudioFilename = (anyUrlOrFilename) => {
        try {
            const raw = String(anyUrlOrFilename || '').trim();
            if (!raw) return null;
            if (raw.startsWith('blob:')) return null;
            if (raw.startsWith('http://') || raw.startsWith('https://')) {
                try {
                    const u = new URL(raw);
                    const name = String(u.pathname || '').split('/').pop();
                    return name || null;
                } catch (e) {
                }
            }
            const name = raw.split('?', 1)[0].split('/').pop();
            return name || null;
        } catch (e) {
            return null;
        }
    };

    const out = [];
    for (const s of origSent) {
        if (!s) continue;
        const key = String(s.key || s.sentence_key || '').trim();
        if (!key) continue;
        const t = trByKey.get(key) || null;

        const positionRaw = (s.position !== undefined && s.position !== null) ? Number(s.position) : null;
        const position = Number.isFinite(positionRaw) ? positionRaw : null;

        out.push({
            key,
            position,
            text: String(s.text || ''),
            translation: String((t && t.text) ? t.text : ''),
            audio: extractAudioFilename(s.audio),
            audio_a: extractAudioFilename(s.audio_avto),
            audio_f: extractAudioFilename(s.audio_user),
            audio_m: extractAudioFilename(s.audio_mic),
            audio_tr: extractAudioFilename((t && t.audio) ? t.audio : null),
            completed_correctly: false,
            speaker: s.speaker,
            explanation: (t && t.explanation) ? t.explanation : ''
        });
    }

    out.sort((a, b) => {
        const ap = Number.isFinite(a.position) ? a.position : null;
        const bp = Number.isFinite(b.position) ? b.position : null;
        if (ap !== null && bp !== null) return ap - bp;
        if (ap !== null) return -1;
        if (bp !== null) return 1;
        return String(a.key).localeCompare(String(b.key));
    });

    return out;
}

async function updateDictationSentencesIndexedDbCache(dictationId) {
    try {
        const dictId = String(dictationId || '').trim();
        const langOrig = String(currentDictation && currentDictation.language_original ? currentDictation.language_original : '').trim();
        const langTr = String(currentDictation && currentDictation.language_translation ? currentDictation.language_translation : '').trim();
        if (!dictId || !langOrig || !langTr) return false;
        if (!dictId.startsWith('dict_')) return false;

        const sentences = mergeWorkingDataToDictationSentences(dictId, langOrig, langTr);
        if (!sentences.length) return false;

        const userId = String(getDraftUserIdForKey());
        const updatedAt = Date.now();

        const keysToWrite = new Set();
        keysToWrite.add(`${userId}:${dictId}:${langOrig}:${langTr}`);
        keysToWrite.add(`anon:${dictId}:${langOrig}:${langTr}`);

        try {
            const numericId = parseInt(dictId.replace(/^dict_/, ''), 10);
            if (Number.isFinite(numericId)) {
                keysToWrite.add(`${userId}:${numericId}:${langOrig}:${langTr}`);
                keysToWrite.add(`${userId}:dict_${numericId}:${langOrig}:${langTr}`);
                keysToWrite.add(`anon:dict_${numericId}:${langOrig}:${langTr}`);
            }
        } catch (e) {
        }

        for (const key of keysToWrite) {
            await idbPut('dictations', {
                key,
                dictationId: dictId,
                langOrig,
                langTr,
                sentences,
                updatedAt
            });
        }

        return true;
    } catch (e) {
        return false;
    }
}

function getDirtyFlags() {
    try {
        return window.__DICTATION_EDITOR_DIRTY || { db: false, audio: false, cover: false };
    } catch (e) {
        return { db: false, audio: false, cover: false };
    }
}

function getSentenceByKeySafe(list, key) {
    try {
        return (Array.isArray(list) ? list : []).find(s => s && s.key === key) || null;
    } catch (e) {
        return null;
    }
}

function recomputeSentencePositionsFromDom() {
    try {
        const rows = document.querySelectorAll('#sentences-table tbody tr');
        rows.forEach((row, idx) => {
            const key = row?.dataset?.key;
            const pos = idx + 1;

            const numberCell = row.querySelector('.col-number');
            if (numberCell) numberCell.textContent = String(pos).padStart(2, '0');

            if (key && workingData && workingData.original && Array.isArray(workingData.original.sentences)) {
                const s = getSentenceByKeySafe(workingData.original.sentences, key);
                if (s) s.position = pos;
            }
            const tr = getCurrentTranslationData({ createIfMissing: false });
            if (key && tr && Array.isArray(tr.sentences)) {
                const s = getSentenceByKeySafe(tr.sentences, key);
                if (s) s.position = pos;
            }
        });
        updateCurrentRowNumber();
    } catch (e) {
    }
}

function prewarmDraftAudioUrl(url) {
    try {
        if (!url || typeof url !== 'string') return;
        // Unsaved audio now uses in-memory object URLs, which do not benefit from SW prewarm.
        if (url.startsWith('blob:')) return;
        const key = String(url);
        if (window.__DICTATION_EDITOR_PREWARM_AUDIOS[key]) return;

        const a = new Audio(key);
        try { a.preload = 'auto'; } catch (e) {}
        try { a.load(); } catch (e) {}
        window.__DICTATION_EDITOR_PREWARM_AUDIOS[key] = a;
    } catch (e) {
    }
}

function prewarmAllDraftAudioUrls() {
    try {
        const map = window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS;
        if (!map) return;
        const values = Object.values(map);
        for (const u of values) {
            prewarmDraftAudioUrl(u);
        }
    } catch (e) {
    }
}

async function uploadDictationAudioFromCacheToB2({ dictationId, token }) {
    try {
        if (!dictationId || !String(dictationId).startsWith('dict_')) {
            return { ok: false, reason: 'bad_dictation_id' };
        }
        if (!token) {
            return { ok: false, reason: 'missing_token' };
        }

        const am = window.AudioManager;
        if (!am || typeof am.uploadDictationAudioFromCacheToB2 !== 'function') {
            throw new Error('AudioManager_not_loaded');
        }

        const urls = collectFinalAudioUrlsForPrefetch(dictationId);
        const uniqueUrls = Array.from(new Set((urls || []).filter(Boolean))).filter((url) => {
            try {
                const u = new URL(String(url), location.origin);
                const m = u.pathname.match(/^\/api\/dictations\/(dict_[^/]+)\/([^/]+)\/(.+)$/);
                if (!m) return false;
                const lang = normalizeLangCode(m[2]);
                const filename = String(m[3] || '').trim();
                if (!lang || !filename) return false;
                // Only upload draft-marked media. This prevents AudioManager from counting
                // cache misses for non-draft URLs and leaving the audio dirty flag stuck.
                return hasDraftAudioUrl(lang, filename) === true;
            } catch (e) {
                return false;
            }
        });
        if (uniqueUrls.length === 0) {
            return { ok: true, dictationId, urls: 0, cacheHit: 0, uploaded: 0, skipped: 0, failed: 0, cacheMiss: 0 };
        }

        console.warn('[B2 UPLOAD] start', { dictationId, urls: uniqueUrls.length });

        try {
            if (typeof window.setSwBarProgress === 'function') {
                window.setSwBarProgress(`B2 audio: 0 из ${uniqueUrls.length}`, 0, 'audio');
            }
        } catch (e) {
        }


        const res = await am.uploadDictationAudioFromCacheToB2({
            dictationId,
            token,
            urls: uniqueUrls,
            shouldUpload: ({ lang, filename }) => {
                try {
                    return hasDraftAudioUrl(lang, filename) === true;
                } catch (e) {
                    return false;
                }
            },
            onUploaded: ({ lang, filename, uploaded, skipped, deduped }) => {
                try {
                    if (uploaded || (skipped && deduped)) {
                        try { clearDraftAudioUrl(lang, filename); } catch (e0) {}
                    }
                } catch (e) {
                }
            },
            onProgress: ({ processed, total, pct }) => {
                try {
                    if (typeof window.setSwBarProgress === 'function') {
                        window.setSwBarProgress(`B2 audio: ${processed} из ${total}`, pct, 'audio');
                    }
                } catch (e) {
                }
            }
        });

        try {
            if (typeof window.setSwBarProgress === 'function') {
                window.setSwBarProgress('', null, '');
            }
        } catch (e) {
        }

        return res;
    } catch (e) {
        console.warn('[B2 UPLOAD] fatal', e);
        return { ok: false, reason: 'fatal', error: String(e && e.message ? e.message : e) };
    } finally {
        try {
            if (typeof window.setSwBarProgress === 'function') {
                window.setSwBarProgress('', null, '');
            }
        } catch (e) {
        }
        try {
            if (typeof window.setSwBarProgress === 'function') {
                window.setSwBarProgress('', null, '');
            }
        } catch (e) {
        }
    }
}

async function uploadDictationCoverFromCacheToB2({ dictationId, token }) {
    try {
        if (!dictationId || !String(dictationId).startsWith('dict_')) {
            return { ok: false, reason: 'bad_dictation_id' };
        }
        const numericId = parseInt(String(dictationId).replace(/^dict_/, ''), 10);
        if (!numericId) return { ok: false, reason: 'bad_numeric_id' };
        if (!token) return { ok: false, reason: 'missing_token' };

        let cache = null;
        try {
            if (window.AudioManager && typeof window.AudioManager.openMediaCache === 'function') {
                cache = await window.AudioManager.openMediaCache();
            }
        } catch (e) {
            cache = null;
        }
        if (!cache) {
            return { ok: false, reason: 'no_media_cache' };
        }
        const coverUrl = new URL(`/api/dictations_covers/${numericId}.webp`, location.origin).toString();
        let cached = null;
        try {
            if (window.AudioManager && typeof window.AudioManager.getCachedResponse === 'function') {
                cached = await window.AudioManager.getCachedResponse(coverUrl);
            }
        } catch (e) {
            cached = null;
        }
        let blob = null;
        if (cached) {
            blob = await cached.blob();
        }
        if (!blob) {
            try {
                const inMem = currentDictation && currentDictation.coverFile ? currentDictation.coverFile : null;
                if (inMem && typeof inMem === 'object' && typeof inMem.arrayBuffer === 'function') {
                    blob = inMem;
                }
            } catch (e) {
            }
        }
        if (!blob) {
            return { ok: false, reason: 'missing_blob' };
        }

        // Ensure cache has final entry + alias for offline.
        try {
            if (!cached) {
                const headers = new Headers();
                headers.set('Content-Type', blob.type || 'image/webp');
                headers.set('Cache-Control', 'no-store');
                const response = new Response(blob, { status: 200, headers });
                try {
                    if (window.AudioManager && typeof window.AudioManager.putResponseToCache === 'function') {
                        await window.AudioManager.putResponseToCache(coverUrl, response.clone());
                    }
                } catch (e) {
                }
                try {
                    if (window.AudioManager && typeof window.AudioManager.getCachedResponse === 'function') {
                        cached = await window.AudioManager.getCachedResponse(coverUrl);
                    }
                } catch (e) {
                    cached = null;
                }
            }
        } catch (e) {
        }

        // Offline should rely on canonical /api/dictations_covers/<id>.webp.

        const uploadUrlResp = await fetch('/api/b2/get_upload_url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });

        if (!uploadUrlResp.ok) {
            let t = '';
            try { t = await uploadUrlResp.text(); } catch (e) {}
            console.warn('[B2 UPLOAD] cover get_upload_url failed', { status: uploadUrlResp.status, text: t });
            return { ok: false, reason: 'get_upload_url_failed', status: uploadUrlResp.status };
        }

        const contentType = String(uploadUrlResp.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
            let t = '';
            try { t = await uploadUrlResp.text(); } catch (e) {}
            console.warn('[B2 UPLOAD] cover get_upload_url not json', { status: uploadUrlResp.status, contentType, text: t });
            return { ok: false, reason: 'get_upload_url_not_json', status: uploadUrlResp.status };
        }

        const uploadUrlJson = await uploadUrlResp.json();
        if (!uploadUrlJson || !uploadUrlJson.success || !uploadUrlJson.uploadUrl || !uploadUrlJson.uploadAuthToken) {
            console.warn('[B2 UPLOAD] cover get_upload_url bad payload', uploadUrlJson);
            return { ok: false, reason: 'get_upload_url_bad_payload' };
        }

        const remotePath = `dictations_covers/${numericId}.webp`;
        const uploadRes = await fetch(uploadUrlJson.uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': uploadUrlJson.uploadAuthToken,
                'X-Bz-File-Name': encodeURIComponent(remotePath),
                'Content-Type': blob.type || 'b2/x-auto',
                'X-Bz-Content-Sha1': 'do_not_verify', // B2 will calculate it
            },
            body: blob
        });
        if (!uploadRes || !uploadRes.ok) {
            let txt = '';
            try { txt = await uploadRes.text(); } catch (e) {}
            console.warn('[B2 UPLOAD] cover upload failed', { status: uploadRes ? uploadRes.status : 0, remotePath, text: txt });
            try {
                window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT = window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT || {};
                window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT.cover = {
                    ok: false,
                    updatedAt: Date.now(),
                    stage: 'b2_upload',
                    remotePath
                };
                persistLastMediaCommit();
            } catch (e) {
            }
            try { scheduleSaveStatusRefresh(); } catch (e) {}
            return { ok: false, reason: 'cover_upload_failed', status: uploadRes ? uploadRes.status : 0, remotePath };
        }

        if (uploadRes && uploadRes.ok) {
            setDirtyFlags({ cover: false });
            try {
                window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT = window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT || {};
                window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT.cover = {
                    ok: true,
                    updatedAt: Date.now(),
                    stage: 'b2_upload'
                };
                persistLastMediaCommit();
            } catch (e) {
            }
            try { scheduleSaveStatusRefresh(); } catch (e) {}
            return { ok: true, remotePath };
        }
    } catch (e) {
        console.warn('[B2 UPLOAD] cover fatal', e);
        try {
            window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT = window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT || {};
            window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT.cover = {
                ok: false,
                updatedAt: Date.now(),
                stage: 'b2_upload_exception'
            };
            persistLastMediaCommit();
        } catch (e2) {
        }
        try { scheduleSaveStatusRefresh(); } catch (e2) {}
        return { ok: false, reason: 'cover_upload_exception' };
    }

    return { ok: false, reason: 'cover_upload_unknown' };
}

function loadLastMediaCommit() {
    try {
        const stored = localStorage.getItem('dictafan:lastMediaCommit');
        if (stored) {
            window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT = JSON.parse(stored);
        }
    } catch (e) {
    }
}

function persistLastMediaCommit() {
    try {
        const json = JSON.stringify(window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT);
        localStorage.setItem('dictafan:lastMediaCommit', json);
    } catch (e) {
    }
}

loadLastMediaCommit();

try {
    const modalTr = getStartModalTranslationLanguage();
    if (modalTr) {
        currentDictation.language_translation = modalTr;
    }
} catch (e) {
}

function installDictationEditorSaveStatusBadge() {
    try {
        if (window.__dictationEditorSaveStatusBadgeInstalled) return;
        window.__dictationEditorSaveStatusBadgeInstalled = true;

        const mount = () => {
            try {
                const id = 'dictation-editor-save-status-badge';
                let el = document.getElementById(id);
                if (!el) {
                    el = document.createElement('div');
                    el.id = id;
                    el.setAttribute('aria-hidden', 'true');
                    el.style.position = 'fixed';
                    el.style.left = '6px';
                    el.style.bottom = '22px';
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

try {
    const old = document.getElementById('dictation-editor-save-status-badge');
    if (old && old.parentNode) {
        old.parentNode.removeChild(old);
    }
} catch (e) {
}

function setSaveStatusBadgeText(text) {
    try {
        const el = document.getElementById('dictation-editor-save-status-badge');
        if (!el) return;
        el.textContent = String(text || '').trim();
    } catch (e) {
    }
}

async function refreshSaveStatusBadge() {
    try {
        const dictationId = currentDictation && currentDictation.id ? String(currentDictation.id).trim() : '';
        if (!dictationId) {
            setSaveStatusBadgeText('');
            return;
        }
        const m = await getMediaManifest(dictationId);
        const pendingCover = !!(m && m.cover && m.cover.changed);
        const pendingCoverSize = pendingCover ? Number(m.cover.size || 0) : 0;
        const last = window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT || null;
        const lastCover = last && last.cover ? last.cover : null;

        const parts = [];
        if (pendingCover) parts.push(`cover: pending(${pendingCoverSize || 0})`);
        if (lastCover && typeof lastCover.ok === 'boolean') {
            parts.push(`cover_commit: ${lastCover.ok ? 'ok' : 'fail'}`);
        }
        setSaveStatusBadgeText(parts.join(' | '));
    } catch (e) {
        try { setSaveStatusBadgeText(''); } catch (e2) {}
    }
}

function scheduleSaveStatusRefresh() {
    try {
        if (window.__DICTATION_EDITOR_SAVE_STATUS_TMR) return;
        window.__DICTATION_EDITOR_SAVE_STATUS_TMR = setTimeout(() => {
            window.__DICTATION_EDITOR_SAVE_STATUS_TMR = null;
            refreshSaveStatusBadge();
        }, 50);
    } catch (e) {
    }
}

function setDictationNameTitle(title) {
    try {
        const h2 = document.getElementById('dictation-name');
        if (!h2) return;

        const nextTitle = String(title || '').trim();

        // Preserve nested star spans (#unsavedStar*, etc). Do NOT overwrite innerHTML/textContent.
        // Update only the first text node before the spans.
        const first = h2.firstChild;
        if (first && first.nodeType === Node.TEXT_NODE) {
            first.nodeValue = nextTitle ? `${nextTitle} ` : '';
            return;
        }

        // If there is no text node, insert one at the beginning.
        h2.insertBefore(document.createTextNode(nextTitle ? `${nextTitle} ` : ''), h2.firstChild);
    } catch (e) {
    }
}


let currentAudioFile = null; // текущий файл в настройках аудио

// Кнопки для работы с аудио
const selectFileBtn = document.getElementById('selectFileBtn');
const scissorsBtn = document.getElementById('scissorsBtn');
const audioTableActionBtn = document.getElementById('audioTableActionBtn');


// Модальные окна для новой архитектуры
let startModal = null; // стартовое модальное окно
let audioSettingsModal = null; // модальное окно настроек аудио

let startModalLanguageSelector = null;
let startModalTranslationLanguageSelector = null;


let data = [];
let currentDictation = {
    id: '', // ID текущего диктанта
    isNew: true, // Флаг - новый это диктант или существующий
    safe_email: '',  // имя папки пользователся в виде test_at_example_dot_com
    language_original: '',
    language_translation: '',
    level: 'A1',
    category_key: '', // ключ категории в дереве
    category_title: '', // название категории
    category_path: '', // путь к категории в дереве
    coverFile: null, // загруженный файл cover в памяти
    dictationStartTime: 0, // начало диктанта
    dictationEndTime: 0, // конец диктанта
    tableFilled: false, // флаг заполнения таблицы
    is_dialog: false, // флаг диалога
    speakers: {}, // словарь спикеров {"1": "Таня", "2": "Ваня"}
    title_translations: {}, // переводы заголовка {"en": "Title", "ru": "Заголовок"}
    current_edit_mode: null, // 'original' | 'translation' | null
    current_row_key: null, // текущая строка для настроек аудио
    isSaved: false // флаг - сохранен ли диктант
};

let currentRowIndex = 0;
let sentenceRows = [];
let waveformCanvas = null;
let lastAudioUrl = null;
let currentRegion = null;
let wordPointer = 0; // для алгоритма сравнения текущая позиция
// Цвета теперь определяются в WaveformCanvas классе

// Неиспользуемые переменные удалены - данные хранятся в workingData

let workingData = {
    original: {
        language: '',
        title: '',
        speakers: {}, // словарь спикеров {"1": "Таня", "2": "Ваня"}
        sentences: [], // {key, speaker, text, audio, audio_users_shared, start, end, chain}
        audio_user_shared: '',
        audio_user_shared_start: 0,
        audio_user_shared_end: 0
    },
    // Single source of truth for translations.
    // Each key is a language code: workingData.translations['ru'], workingData.translations['uk'], ...
    translations: {}
};

function normalizeLangCode(code) {
    return String(code || '').trim().toLowerCase();
}

function createEmptyTranslationObject(lang) {
    const code = normalizeLangCode(lang);
    return {
        language: code,
        title: '',
        speakers: (workingData && workingData.original) ? (workingData.original.speakers || {}) : {},
        sentences: [],
        audio_user_shared: '',
        audio_user_shared_start: 0,
        audio_user_shared_end: 0
    };
}

function getTranslationData(lang, { createIfMissing = false } = {}) {
    try {
        const code = normalizeLangCode(lang);
        if (!code) return null;
        if (!workingData) return null;
        workingData.translations = (workingData.translations && typeof workingData.translations === 'object') ? workingData.translations : {};
        if (!workingData.translations[code] && createIfMissing) {
            workingData.translations[code] = createEmptyTranslationObject(code);
        }
        return workingData.translations[code] || null;
    } catch (e) {
        return null;
    }
}

function getCurrentTranslationLang() {
    try {
        return normalizeLangCode(currentDictation && currentDictation.language_translation);
    } catch (e) {
        return '';
    }
}

function getCurrentTranslationData({ createIfMissing = false } = {}) {
    const code = getCurrentTranslationLang();
    if (!code) return null;
    return getTranslationData(code, { createIfMissing });
}

function ensureTranslation(lang) {
    const code = normalizeLangCode(lang);
    if (!code) return null;
    if (!workingData) return null;
    workingData.translations = (workingData.translations && typeof workingData.translations === 'object') ? workingData.translations : {};
    if (!workingData.translations[code]) {
        workingData.translations[code] = createEmptyTranslationObject(code);
    }
    return workingData.translations[code];
}

function listExistingTranslationLangs() {
    try {
        if (!workingData || !workingData.translations || typeof workingData.translations !== 'object') return [];
        return Object.keys(workingData.translations)
            .map(normalizeLangCode)
            .filter(Boolean);
    } catch (e) {
        return [];
    }
}

function getActiveTranslationLanguagesList() {
    try {
        const orig = normalizeLangCode(currentDictation && currentDictation.language_original);
        return listExistingTranslationLangs().filter(l => !orig || l !== orig);
    } catch (e) {
        return [];
    }
}

function setHeaderNoTranslationMode({ preserveDirty = false } = {}) {
    try {
        currentDictation.language_translation = '';
    } catch (e) {
    }

    // Persisted translation language is part of dictation metadata.
    // When we intentionally switch into "no translation" mode (e.g. removing the last language),
    // we want it to be saved. UI-only switching must not touch it.
    if (!preserveDirty) {
        try {
            currentDictation._persisted_language_translation = '';
        } catch (e) {
        }
    }
    try {
        const label = document.getElementById('translationLanguageLabel');
        if (label) label.textContent = 'без перевода:';
        const inp = document.getElementById('title_translation');
        if (inp) inp.style.display = 'none';
    } catch (e) {
    }

    try {
        renderHeaderLangPairWithManager();
    } catch (e) {
    }
}

function setHeaderTranslationLanguage(lang, { preserveDirty = false } = {}) {
    const code = normalizeLangCode(lang);
    if (!code) {
        setHeaderNoTranslationMode({ preserveDirty });
        return;
    }

    const prevDirty = preserveDirty ? (() => {
        try { return { ...getDirtyFlags() }; } catch (e) { return null; }
    })() : null;

    try {
        currentDictation.language_translation = code;
    } catch (e) {
    }

    // Persisted translation language is part of dictation metadata; UI-only switching must not touch it.
    if (!preserveDirty) {
        try {
            currentDictation._persisted_language_translation = code;
        } catch (e) {
        }
    }

    try {
        ensureTranslation(code);
    } catch (e) {
    }

    try {
        // Keep translation flags in sync with selected language.
        currentDictation.translation_flags = currentDictation.translation_flags || {};
        currentDictation.translation_flags[code] = true;
    } catch (e) {
    }
    try {
        const label = document.getElementById('translationLanguageLabel');
        if (label) label.textContent = `${code}:`;
        const inp = document.getElementById('title_translation');
        if (inp) inp.style.display = '';
    } catch (e) {
    }

    try {
        renderTableFromWorkingData();
        applyTableViewForTab(currentTabName);
    } catch (e) {
    }

    try {
        renderHeaderLangPairWithManager();
    } catch (e) {
    }
}

const LEVEL_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
let levelSelectWrapper = null;
let levelSelectOutsideHandler = null;

let currentTabName = 'general';
let explanationVisible = false;













// Глобальные переменные для воспроизведения
let isPlaying = false;
let playheadAnimationId = null;


function normalizeNewlines(text) {
    if (text == null) return '';
    return String(text)
        .replace(/\u2028/g, '\n')
        .replace(/\u2029/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

function normalizeDictationInvisibleChars(text) {
    return (text || '')
        .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
        .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00AD/g, '');
}



// ==================== сover обложка ========================================
// Реализация crop/preview вынесена в CoverManager
function setupCoverHandlers() {
    try {
        if (!window.CoverManager || typeof window.CoverManager.bind !== 'function') {
            return;
        }

        window.CoverManager.bind({
            fileInputId: 'coverFile',
            uploadBtnId: 'coverUploadBtn',
            previewImgId: 'coverImage',
            aspectRatio: 200 / 120,
            outputWidth: 200,
            outputHeight: 120,
            outputType: 'image/webp',
            outputQuality: 0.9,
            maxFileSizeBytes: 5 * 1024 * 1024,
            focusConfirm: true,
            onDirty: () => {
                try { setDirtyFlags({ cover: true }); } catch (e) {}
            },
            onConfirm: async (blob) => {
                try {
                    window.__DICTATION_EDITOR_COVER_PENDING = true;
                } catch (e) {
                }

                try {
                    currentDictation.coverFile = blob;
                } catch (e) {
                }
                try {
                    window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT = window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT || {};
                    window.__DICTATION_EDITOR_LAST_MEDIA_COMMIT.cover = null;
                } catch (e) {
                }
                try {
                    setDirtyFlags({ cover: true });
                } catch (e) {
                }

                // Offline-first: сохраняем cover.webp в Cache Storage (dictafan-media).
                try {
                    const dictationId = String(currentDictation.id || '').trim();
                    if (dictationId) {
                        let cache = null;
                        try {
                            if (window.AudioManager && typeof window.AudioManager.openMediaCache === 'function') {
                                cache = await window.AudioManager.openMediaCache();
                            }
                        } catch (e) {
                            cache = null;
                        }
                        if (!cache) {
                            throw new Error('Media cache is not available');
                        }
                        const numericId = dictationId.startsWith('dict_') ? parseInt(dictationId.replace(/^dict_/, ''), 10) : null;
                        const coverKey = (numericId && isFinite(numericId) && numericId > 0) ? String(numericId) : null;
                        if (!coverKey) {
                            throw new Error('Invalid dictation numeric id for cover');
                        }

                        const basePath = `/api/dictations_covers/${coverKey}.webp`;
                        const baseUrl = new URL(basePath, window.location.origin).toString();
                        try {
                            console.log('[COVER][CACHE PUT] crop-confirm', {
                                dictationId,
                                numericId: (numericId && isFinite(numericId) && numericId > 0) ? numericId : null,
                                coverKey,
                                basePath,
                                baseUrl,
                                blobType: blob.type || null,
                                blobSize: blob.size || 0
                            });
                        } catch (e) {
                        }
                        const headers = new Headers();
                        headers.set('Content-Type', blob.type || 'image/webp');
                        headers.set('Cache-Control', 'no-store');
                        const res = new Response(blob, { status: 200, headers });
                        try {
                            if (window.AudioManager && typeof window.AudioManager.putResponseToCache === 'function') {
                                await window.AudioManager.putResponseToCache(baseUrl, res.clone());
                            }
                        } catch (e) {
                        }

                        try {
                            const currentManifest = await getMediaManifest(dictationId);
                            currentManifest.cover = {
                                changed: true,
                                coverKey,
                                size: Number(blob.size || 0),
                                updatedAt: Date.now()
                            };
                            await setMediaManifest(dictationId, currentManifest);
                        } catch (e) {
                        }

                        try { scheduleSaveStatusRefresh(); } catch (e) {}
                    }
                } catch (error) {
                    console.error('Ошибка при сохранении cover в cache:', error);
                } finally {
                    try {
                        window.__DICTATION_EDITOR_COVER_PENDING = false;
                    } catch (e) {
                    }
                }
            }
        });
    } catch (e) {
    }
}

function openCropModal(imageSrc) {
    if (window.CoverManager && typeof window.CoverManager.openCropModal === 'function') {
        const res = window.CoverManager.openCropModal(imageSrc);
        try {
            const modal = document.getElementById('crop-modal');
            if (modal && window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ elements: [modal] });
            }
        } catch (e) {
        }
        return res;
    }
}

function closeCropModal(clearBlob = true) {
    if (window.CoverManager && typeof window.CoverManager.closeCropModal === 'function') {
        return window.CoverManager.closeCropModal(clearBlob);
    }
}

async function handleCropConfirm() {
    if (window.CoverManager && typeof window.CoverManager.handleCropConfirm === 'function') {
        return window.CoverManager.handleCropConfirm();
    }
}

// Функция для загрузки cover существующего диктанта
async function loadCoverForExistingDictation(dictationId, originalLanguage) {
    const coverImage = document.getElementById('coverImage');
    if (!coverImage) return;

    try {
        const did = String(dictationId || '').trim();
        if (did.startsWith('dict_')) {
            const numericId = parseInt(did.replace(/^dict_/, ''), 10);
            if (numericId && isFinite(numericId) && numericId > 0) {
                const url = `/api/dictations_covers/${numericId}.webp`;
                try {
                    const resp = await fetch(url, { method: 'HEAD' });
                    if (resp && resp.ok) {
                        coverImage.src = url;
                        return;
                    }
                } catch (e) {
                }
            }
        }
    } catch (e) {
    }

    // Если cover диктанта нет, используем cover по умолчанию
    const defaultCoverUrl = coverImage.dataset.defaultCover || `/static/data/covers/cover_${originalLanguage}.webp`;
    coverImage.src = defaultCoverUrl;
}




// Функция loadCategoryInfoForDictation удалена - данные категории теперь передаются через POST запрос

// Функция для получения пути к категории из узла дерева
function getCategoryPathFromNode(node) {
    const path = [];
    let currentNode = node;

    while (currentNode && currentNode.title !== 'root') {
        path.unshift(currentNode.title);
        currentNode = currentNode.parent;
    }

    return path.join(' > ');
}

// Функция для обновления отображения пути к категории
function updateCategoryPathDisplay(categoryPath) {
    const categoryPathElement = document.getElementById('category-path');
    if (categoryPathElement && categoryPath) {
        categoryPathElement.innerHTML = `<i data-lucide="folder"></i> ${categoryPath}`;
        // Обновляем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    // Также обновляем путь во вкладке
    updateDictationPathDisplay();
}

function newSentances(key, text, key_audio, start = '', end = '') {
    return {
        key: key,
        text: text,
        audio: key_audio,
        start: start,
        end: end
    };

}

// ============================================================
// Инициализация нового диктанта
async function initNewDictation(safe_email, initData) {
    // Получаем информацию о категории и языках из sessionStorage
    const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
    const categoryInfo = categoryDataStr ? JSON.parse(categoryDataStr) : {};
    const init_original = (initData && initData.original_language) ? String(initData.original_language).toLowerCase() : '';
    const init_translation = (initData && initData.translation_language) ? String(initData.translation_language).toLowerCase() : '';
    const stored_original = categoryInfo.language_original ? String(categoryInfo.language_original).toLowerCase() : '';
    const stored_translation = categoryInfo.language_translation ? String(categoryInfo.language_translation).toLowerCase() : '';

    // Важно: selectedCategoryForDictation может быть «устаревшим» (например, остался en от прошлого диктанта).
    // Поэтому дефолт берем из initData (профиль пользователя), а sessionStorage используем только если он
    // не противоречит initData или initData отсутствует.
    const language_original = (stored_original && (!init_original || stored_original === init_original))
        ? stored_original
        : (init_original || 'en');
    const language_translation = (stored_translation && (!init_translation || stored_translation === init_translation))
        ? stored_translation
        : (init_translation || 'ru');

    const initialLevel = (initData && initData.level) ? initData.level : 'A1';

    // New model: create a DB dictation immediately and use final dict_<n> id.
    // Requires online to obtain an ID.
    try {
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
            alert('Сейчас нет интернета — новый диктант создать нельзя. Подключись к интернету и попробуй ещё раз.');
            return;
        }
    } catch (e) {
    }

    let createToken = null;
    try {
        if (window.UM && window.UM.token) {
            createToken = window.UM.token;
        } else {
            createToken = localStorage.getItem('jwt_token');
        }
    } catch (e) {
    }

    let createdDbId = null;
    try {
        const resp = await fetch('/api/dictation/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(createToken ? { 'Authorization': `Bearer ${createToken}` } : {})
            },
            body: JSON.stringify({
                title: (initData && initData.title) ? initData.title : 'Новый диктант',
                language_code: language_original,
                level: initialLevel,
                is_public: true,
                speakers: {}
            })
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.error('❌ /api/dictation/create failed', resp.status, t);
            alert('Ошибка: не удалось создать диктант. Попробуй ещё раз.');
            return;
        }
        const j = await resp.json();
        createdDbId = j && j.dictation && j.dictation.id ? Number(j.dictation.id) : null;
    } catch (e) {
        console.error('❌ /api/dictation/create exception', e);
        alert('Ошибка: не удалось создать диктант. Попробуй ещё раз.');
        return;
    }

    if (!createdDbId || !isFinite(createdDbId) || createdDbId <= 0) {
        alert('Ошибка: сервер вернул некорректный ID диктанта.');
        return;
    }

    // Получаем user_id из UserManager (если доступен)
    // Пробуем несколько раз, так как UserManager может еще не быть полностью инициализирован
    let user_id = null;
    if (window.UM && window.UM.getCurrentUser) {
        const user = window.UM.getCurrentUser();
        if (user && user.id) {
            user_id = user.id;
        } else {
            // Пробуем еще раз через небольшую задержку
            setTimeout(() => {
                if (window.UM && window.UM.getCurrentUser) {
                    const userRetry = window.UM.getCurrentUser();
                    if (userRetry && userRetry.id) {
                        currentDictation.user_id = userRetry.id;
                    }
                }
            }, 500);
            console.warn('⚠️ UserManager.getCurrentUser() не вернул user.id, попробуем позже');
        }
    } else {
        // Пробуем еще раз через небольшую задержку
        setTimeout(() => {
            if (window.UM && window.UM.getCurrentUser) {
                const userRetry = window.UM.getCurrentUser();
                if (userRetry && userRetry.id) {
                    currentDictation.user_id = userRetry.id;
                }
            }
        }, 500);
        console.warn('⚠️ UserManager не доступен при инициализации нового диктанта, попробуем позже');
    }
    
    // Пытаемся получить целевую книгу/раздел для привязки диктанта (из приватной библиотеки)
    let targetBookId = null;
    try {
        const targetRaw = sessionStorage.getItem('dictationTargetBook');
        if (targetRaw) {
            const target = JSON.parse(targetRaw);
            if (target && target.book_id) {
                targetBookId = Number(target.book_id) || null;
            }
        }
    } catch (e) {
        console.warn('⚠️ Не удалось прочитать dictationTargetBook из sessionStorage:', e);
    }
    
    // Используем финальный ID для работы
    currentDictation = {
        id: `dict_${createdDbId}`,
        temp_id: `dict_${createdDbId}`,
        db_id: createdDbId,
        user_id: user_id,  // ID пользователя для пути temp/<user_id>/
        isNew: true,
        safe_email: safe_email,
        language_original: language_original,
        language_translation: language_translation,
        level: initialLevel,
        category_key: categoryInfo.key || '',
        category_title: categoryInfo.title || '',
        category_path: categoryInfo.path || '',
        coverFile: null, // загруженный файл cover в памяти
        is_dialog: false,
        speakers: {},
        // Целевая книга (книга или раздел из приватной библиотеки), может быть null
        book_id: targetBookId,
        current_edit_mode: null, // 'original' | 'translation' | null - группа активных секций в таблице
        current_row_key: null, // текущая строка в таблице
        isSaved: false // новый диктант - не сохранен
    };

    // ID показываем сразу: мы уже создали диктант в БД
    const dictationIdElement = document.getElementById('dictation-id');
    if (dictationIdElement) {
        dictationIdElement.style.display = '';
        dictationIdElement.textContent = `id: dict_${createdDbId}`;
    }

    // Очищаем поля формы
    document.getElementById('title').value = '';
    document.getElementById('title_translation').value = '';
    // document.getElementById('text').value = ''; // TODO: Добавить элемент text в шаблон
    // document.querySelector('#sentences-table tbody').innerHTML = ''; // TODO: Добавить таблицу sentences в шаблон
    
    setDictationNameTitle('');
    
    // ==================== Открываем стартовое модальное окно для нового диктанта ========================================

    // Проверяем существование элементов
    const startModal = document.getElementById('startModal');
 
    // Открыть стартовое модальное окно для нового диктанта
    setTimeout(() => {
        openStartModal();
    }, 100);

    // Показываем путь к категории если есть
    if (currentDictation.category_path) {
        updateCategoryPathDisplay(currentDictation.category_path);
    }
    
    // Обновляем отображение пути к диктанту
    updateDictationPathDisplay();
    
    // Загружаем обложку книги, если диктант принадлежит книге
    if (currentDictation.book_id) {
        await loadBookCoverForDictation(null, currentDictation.book_id);
    }

    initLevelSelector(initialLevel);


    // TODO: зачем это?
    // Сброс значения input (без добавления нового обработчика)
    // const input = document.getElementById('audioFile');
    // if (input) {
    //     input.value = '';
    // }

}

function initLevelSelector(initialLevel = 'A1') {
    const wrapper = document.getElementById('levelSelectControl');
    if (!wrapper) {
        return;
    }

    levelSelectWrapper = wrapper;

    const button = wrapper.querySelector('.speed-select-button');
    const valueEl = wrapper.querySelector('.level-select-value');
    const list = wrapper.querySelector('.speed-options');

    if (!button || !valueEl || !list) {
        return;
    }

    let optionElements = Array.from(list.querySelectorAll('li'));
    if (optionElements.length === 0) {
        LEVEL_OPTIONS.forEach(levelOption => {
            const li = document.createElement('li');
            li.dataset.value = levelOption;
            li.textContent = levelOption;
            list.appendChild(li);
        });
        optionElements = Array.from(list.querySelectorAll('li'));
    }

    const setLevelValue = (value) => {
        const normalized = LEVEL_OPTIONS.includes(value) ? value : 'A1';
        currentDictation.level = normalized;
        valueEl.textContent = normalized;
        optionElements.forEach(li => {
            li.classList.toggle('selected', li.dataset.value === normalized);
        });
    };

    if (!wrapper.dataset.initialized) {
        optionElements.forEach(li => {
            li.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setLevelValue(li.dataset.value);
                wrapper.classList.remove('open');
            });
        });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            wrapper.classList.toggle('open');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });

        if (!levelSelectOutsideHandler) {
            levelSelectOutsideHandler = (event) => {
                if (levelSelectWrapper && !levelSelectWrapper.contains(event.target)) {
                    levelSelectWrapper.classList.remove('open');
                }
            };
            document.addEventListener('click', levelSelectOutsideHandler);
        }

        wrapper.dataset.initialized = 'true';
    }

    setLevelValue(initialLevel);
}


// ==================== Загрузка существующего диктанта ========================================
async function loadExistingDictation(initData) {

    const {
        dictation_id,
        original_language,
        translation_language,
        title,
        title_translations,
        level,
        original_data,
        translation_data,
        translations_data,
        translation_flags,
        audio_file,
        audio_words,
        safe_email,
        is_dialog,
        speakers,
        cover_url,
        author_materials_url
    } = initData;

    // Для редактирования диктанта категория берется из sessionStorage (текущее местоположение в дереве)
    const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
    const categoryInfo = categoryDataStr ? JSON.parse(categoryDataStr) : {};

    const resolvedLevel = level || 'A1';
    
    // Извлекаем db_id из dictation_id (формат dict_<id>)
    let db_id = null;
    if (dictation_id && dictation_id.startsWith('dict_')) {
        const idMatch = dictation_id.match(/^dict_(\d+)$/);
        if (idMatch) {
            db_id = parseInt(idMatch[1], 10);
        }
    }

    currentDictation = {
        id: dictation_id,
        db_id: db_id,  // ID из БД для существующих диктантов
        isNew: false,
        safe_email: safe_email,
        language_original: original_language,
        language_translation: translation_language,
        translation_flags: translation_flags || initData.translation_flags || {},
        level: resolvedLevel,
        audio_words: audio_words,
        category_key: categoryInfo.key || '',
        category_title: categoryInfo.title || '',
        category_path: categoryInfo.path || '',
        coverFile: null, // загруженный файл cover в памяти
        is_dialog: is_dialog || false,
        speakers: speakers || {}, // Спикеры теперь только в info.json
        title_translations: title_translations || {}, // Переводы заголовка из БД
        author_materials_url: author_materials_url || null, // Ссылка на материалы автора
        isSaved: true // существующий диктант - уже сохранен
    };

    // Обновляем заголовки
    setDictationNameTitle(title);
    // Показываем ID только если он есть
    const dictationIdElement = document.getElementById('dictation-id');
    if (dictationIdElement && dictation_id) {
        dictationIdElement.textContent = `id: ${dictation_id}`;
     } else if (dictationIdElement) {
        dictationIdElement.textContent = '';
    }
    document.getElementById('title').value = title;
    document.getElementById('title_translation').value = translation_data?.title || "";
    
    // Загружаем author_materials_url если есть
    const authorMaterialsUrlInput = document.getElementById('dictation-author-materials-url-input');
    if (authorMaterialsUrlInput && initData.author_materials_url) {
        authorMaterialsUrlInput.value = initData.author_materials_url || "";
    }

    // Синхронизируем с вкладками
    const tabTitle = document.getElementById('tabTitle');
    const tabTitleTranslation = document.getElementById('tabTitleTranslation');
    if (tabTitle) tabTitle.value = title;
    if (tabTitleTranslation) tabTitleTranslation.value = translation_data?.title || "";

    // Загружаем cover если есть
    const coverImage = document.getElementById('coverImage');
    if (coverImage) {
        if (cover_url) {
            coverImage.src = cover_url;
        } else {
            await loadCoverForExistingDictation(dictation_id, original_language);
        }
        
        // Устанавливаем обработчик двойного щелчка для открытия ссылки на материалы автора
        if (currentDictation?.author_materials_url) {
            coverImage.addEventListener('dblclick', () => {
                window.open(currentDictation.author_materials_url, '_blank');
            });
            coverImage.style.cursor = 'pointer';
            coverImage.title = 'Двойной щелчок для открытия ссылки на материалы автора';
        }
    } else {
        await loadCoverForExistingDictation(dictation_id, original_language);
    }
    
    // Загружаем обложку книги, если диктант принадлежит книге
    // И устанавливаем book_id в currentDictation для последующего сохранения
    if (db_id) {
        const bookInfo = await loadBookCoverForDictation(db_id);
        if (bookInfo && bookInfo.book_id) {
            currentDictation.book_id = bookInfo.book_id;
        }
    }

    initLevelSelector(resolvedLevel);

    // Показываем путь к категории если есть (данные уже загружены из info.json)
    if (currentDictation.category_path) {
        updateCategoryPathDisplay(currentDictation.category_path);
    }

    // Обновляем данные диалога во вкладке (вызывается после setupTabsPanel)
    setTimeout(() => {
        updateDialogTab();
    }, 100);

    // Создаём таблицу с предложениями из загруженных данных
    try {
        workingData = (workingData && typeof workingData === 'object') ? workingData : {};

        // Preserve SSOT container
        workingData.translations = (workingData.translations && typeof workingData.translations === 'object') ? workingData.translations : {};

        // Original
        workingData.original = original_data || workingData.original || {};
        try {
            if (workingData.original) {
                workingData.original.language = normalizeLangCode(original_language);
            }
        } catch (e) {
        }

        // Main translation (selected in header)
        const tl = normalizeLangCode(translation_language);
        if (tl) {
            // Use server-provided translation_data as is (it already contains sentences/audio/etc.)
            workingData.translations[tl] = translation_data || workingData.translations[tl] || createEmptyTranslationObject(tl);
            try {
                workingData.translations[tl].language = tl;
            } catch (e) {
            }
        } else {
        }

        // Load all translations provided by server (not only the URL-selected one)
        try {
            if (translations_data && typeof translations_data === 'object') {
                Object.keys(translations_data).forEach((lang) => {
                    const norm = normalizeLangCode(lang);
                    if (!norm) return;
                    const bucket = translations_data[lang];
                    if (bucket && typeof bucket === 'object') {
                        workingData.translations[norm] = bucket;
                        try {
                            workingData.translations[norm].language = norm;
                        } catch (e) {
                        }
                    }
                });
            }
        } catch (e) {
        }

        // Ensure all translations declared by DB flags exist in SSOT.
        try {
            syncTranslationsFromDictationMeta();
        } catch (e) {
        }
    } catch (e) {
        // Fallback: at least keep old fields to avoid runtime crash
        try {
            workingData.original = original_data;
        } catch (e2) {
        }
        try {
            const tl = normalizeLangCode(translation_language);
            if (tl) {
                workingData.translations = workingData.translations || {};
                workingData.translations[tl] = translation_data;
            }
        } catch (e3) {
        }
    }

    // Инициализируем поле checked для всех предложений, если его нет
    if (workingData.original && workingData.original.sentences) {
        workingData.original.sentences.forEach(s => {
            if (s.checked === undefined) {
                s.checked = false;
            }
        });
    }

    // console.log('📊 Загруженные данные original_data:', original_data);
    // console.log('📊 Загруженные данные translation_data:', translation_data);

    // Создаем таблицу
    try {
        showLoadingIndicator('Загрузка таблицы...');
    } catch (e) {
    }
    await createTable();
    try {
        hideLoadingIndicator();
    } catch (e) {
    }

    prewarmAllDraftAudioUrls();

    // TODO: инициализировать колонки таблицы 

    // Инициализируем волну и информацию о файле, если есть аудио
    // initializeAudioForExistingDictation();

    // Инициализируем Lucide иконки
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}


// Инициализация при загрузке страницы
async function initDictationGenerator() {
    // const path = window.location.pathname;


    // 1. Получаем JSON как строку
    const initRaw = document.getElementById("init-data")?.textContent;

    // 2. Превращаем в объект
    const initData = JSON.parse(initRaw);

    try {
        const notice = initData && initData.lang_notice ? String(initData.lang_notice).trim() : '';
        if (notice && typeof window.showToast === 'function') {
            window.showToast(notice, 'info');
        }
    } catch (e) {
    }

    // Получаем safe_email из UserManager
    let safe_email = window.UM.getSafeEmail();
    if (safe_email === 'anonymous') {
        safe_email = initData.safe_email || 'anonymous';
    }


    // 4. Анализируем dictation_id для определения режима
    if (initData.dictation_id !== 'new') {
        await loadExistingDictation(initData);
    } else {
        initNewDictation(safe_email, initData);
    }

    // Инициализируем language_selector для отображения флагов
    initLanguageFlags(initData);

    // Настраиваем обработчики для ковера
    setupCoverHandlers();

    try { updateUnsavedStar(); } catch (e) {}

    setupStartModalHandlers(); // Настраиваем обработчики стартового модального окна
    setupTitleTranslationHandler(); // Настраиваем автоматический перевод названия

    // Инициализируем панель вкладок
    setupTabsPanel();
    try {
        initTranslationsTabV2();
    } catch (e) {
    }
    // Обработчики навигации по строкам таблицы
    setupTableControlsHandlers();

    // Обновляем отображение пути к диктанту
    updateDictationPathDisplay();

    // Инициализируем иконки радио-кнопок
    updateRadioButtonIcons('full');

}



// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ФЛАГОВ ЯЗЫКОВ
function initLanguageFlags(initData) {
    try {
        // Получаем контейнер для флагов
        const langPairContainer = document.getElementById('langPair');
        if (!langPairContainer) {
            console.warn('Контейнер langPair не найден');
            return;
        }

        // Получаем данные языков из initData или sessionStorage
        let language_original = initData.original_language;
        let language_translation = initData.translation_language;

        // Если это новый диктант, берем языки из sessionStorage
        if (initData.dictation_id === 'new') {
            const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
            if (categoryDataStr) {
                const categoryData = JSON.parse(categoryDataStr);
                const initOriginal = language_original ? String(language_original).toLowerCase() : '';
                const initTranslation = language_translation ? String(language_translation).toLowerCase() : '';
                const storedOriginal = categoryData.language_original ? String(categoryData.language_original).toLowerCase() : '';
                const storedTranslation = categoryData.language_translation ? String(categoryData.language_translation).toLowerCase() : '';

                if (storedOriginal && (!initOriginal || storedOriginal === initOriginal)) {
                    language_original = storedOriginal;
                }
                if (storedTranslation && (!initTranslation || storedTranslation === initTranslation)) {
                    language_translation = storedTranslation;
                }
            }
        }

        // Проверяем, что LanguageManager и LanguageSelector доступны
        if (typeof window.LanguageManager === 'undefined') {
            console.warn('LanguageManager не найден');
            return;
        }

        if (typeof LanguageSelector === 'undefined') {
            console.warn('LanguageSelector не найден');
            return;
        }

        // Получаем данные языков
        const languageData = window.LanguageManager.getLanguageData();
        if (!languageData) {
            console.warn('Данные языков не найдены');
            return;
        }

        try {
            currentDictation.language_original = normalizeLangCode(language_original);
            currentDictation.language_translation = normalizeLangCode(language_translation);
            currentDictation.preferred_translation_language = normalizeLangCode(language_translation);
            currentDictation._persisted_language_translation = normalizeLangCode(language_translation);
            currentDictation.translation_flags = (initData && initData.translation_flags) ? initData.translation_flags : (currentDictation.translation_flags || {});
        } catch (e) {
        }

        try { syncTranslationsFromDictationMeta(); } catch (e) {}
        renderHeaderLangPairWithManager();

    } catch (error) {
        console.error('Ошибка при инициализации флагов языков:', error);
    }
}

// ============================================================================
// УНИВЕРСАЛЬНАЯ СИСТЕМА ПРОИГРЫВАНИЯ АУДИО
// ============================================================================

let currentPlayingButton = null;

async function swEditorRequest(action, payload = {}) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        throw new Error('Service Worker не активен');
    }

    try {
        setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
    } catch (e) {
    }

    const requestId = `dictation_editor_${action}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Number(payload.timeoutMs) || 15000;

    return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.requestId && data.requestId !== requestId) return;
            clearTimeout(timer);
            if (data.success) {
                try {
                    setSwStatus(`SW: ${String(action)} ok`);
                } catch (e) {
                }
                resolve(data.result);
            } else {
                const err = new Error(data.error || 'sw_request_failed');
                err.swAction = action;
                err.swError = data.error || 'sw_request_failed';
                err.swResult = data.result || null;
                try {
                    setSwStatus(`SW: ${String(action)} error`);
                } catch (e) {
                }
                reject(err);
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

function collectFinalAudioUrlsForPrefetch(dictationId) {
    const urls = [];
    try {
        const origLang = normalizeLangCode(currentDictation && currentDictation.language_original);
        const langs = (() => {
            try {
                const out = [];
                if (origLang) out.push(origLang);
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const l = normalizeLangCode(k);
                        if (l && l !== origLang) out.push(l);
                    }
                }
                return Array.from(new Set(out)).filter(Boolean);
            } catch (e) {
                return [origLang].filter(Boolean);
            }
        })();

        for (const lang of langs) {
            const l = normalizeLangCode(lang);
            const wd = (l && origLang && l === origLang)
                ? (workingData && workingData.original ? workingData.original : null)
                : getTranslationData(l);

            const sentences = wd && Array.isArray(wd.sentences) ? wd.sentences : [];
            for (const s of sentences) {
                if (!s) continue;
                const candidates = [s.audio, s.audio_avto, s.audio_mic, s.audio_user];
                for (const c of candidates) {
                    const u = buildDictationAudioUrl(dictationId, lang, c);
                    if (u) urls.push(u);
                }
            }

            const shared = wd && wd.audio_user_shared ? buildDictationAudioUrl(dictationId, lang, wd.audio_user_shared) : null;
            if (shared) urls.push(shared);
        }
    } catch (e) {
    }
    return Array.from(new Set(urls)).filter(Boolean);
}

async function putDraftAudioToCache(dictationId, language, filename, blob, mime) {
    try {
        if (!dictationId || !language || !filename || !blob) return null;
        // Clean model: unsaved audio must live only in memory (tab lifetime).
        // We keep the function name for now, but it no longer writes to Cache Storage.
        const url = URL.createObjectURL(blob);
        setDraftAudioUrl(language, filename, url);
        return url;
    } catch (e) {
        console.error('❌ putDraftAudioToCache failed', e);
        return null;
    }
}

function getDraftAudioUrl(language, filename) {
    try {
        if (!language || !filename) return null;
        const map = window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS;
        if (!map) return null;
        const lang = String(language || '').trim();
        const name = String(filename || '').trim();
        if (!lang || !name) return null;
        const url = (map[lang] && map[lang][name]) ? map[lang][name] : null;
        try {
            console.log('WWW DRAFT_AUDIO get', {
                filename,
                found: !!url,
                url: url || null
            });
        } catch (e) {
        }
        return url;
    } catch (e) {
        return null;
    }
}

function setDraftAudioUrl(language, filename, url) {
    try {
        if (!language || !filename || !url) return;
        if (!window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS) {
            window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS = {};
        }
        const lang = String(language || '').trim();
        const name = String(filename || '').trim();
        if (!lang || !name) return;
        if (!window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS[lang]) {
            window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS[lang] = {};
        }

        // Revoke previous object URL to avoid leaking memory.
        try {
            const prev = window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS[lang][name];
            if (prev && typeof prev === 'string' && prev.startsWith('blob:') && prev !== url) {
                URL.revokeObjectURL(prev);
            }
        } catch (e) {
        }

        window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS[lang][name] = String(url);
    } catch (e) {
        // noop
    }
}

function clearDraftAudioUrl(language, filename) {
    try {
        const lang = String(language || '').trim();
        const name = String(filename || '').trim();
        if (!lang || !name) return;
        const map = window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS;
        if (!map || !map[lang] || !map[lang][name]) return;
        const prev = map[lang][name];
        try {
            if (typeof prev === 'string' && prev.startsWith('blob:')) {
                URL.revokeObjectURL(prev);
            }
        } catch (e2) {
        }
        try {
            delete map[lang][name];
        } catch (e3) {
            map[lang][name] = '';
        }
    } catch (e) {
    }
}

function hasDraftAudioUrl(language, filename) {
    try {
        const u = getDraftAudioUrl(language, filename);
        return !!(u && typeof u === 'string' && u.startsWith('blob:'));
    } catch (e) {
        return false;
    }
}

function hasAnyDraftAudioBlob() {
    try {
        const origLang = normalizeLangCode(currentDictation && currentDictation.language_original);
        const langs = (() => {
            try {
                const out = [];
                if (origLang) out.push(origLang);
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const l = normalizeLangCode(k);
                        if (l && l !== origLang) out.push(l);
                    }
                }
                return Array.from(new Set(out)).filter(Boolean);
            } catch (e) {
                return [origLang].filter(Boolean);
            }
        })();

        for (const l of langs) {
            const wd = (l && origLang && l === origLang)
                ? (workingData && workingData.original ? workingData.original : null)
                : getTranslationData(l);
            const sentences = wd && Array.isArray(wd.sentences) ? wd.sentences : [];
            for (const s of sentences) {
                if (!s) continue;
                if (hasDraftAudioUrl(l, s.audio)) return true;
                if (hasDraftAudioUrl(l, s.audio_avto)) return true;
                if (hasDraftAudioUrl(l, s.audio_mic)) return true;
                if (hasDraftAudioUrl(l, s.audio_user)) return true;
            }
            if (hasDraftAudioUrl(l, wd && wd.audio_user_shared)) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function commitDraftAudioBlobsToFinalCache(dictationId) {
    try {
        const id = String(dictationId || '').trim();
        if (!id || !id.startsWith('dict_')) return;
        const toCommit = [];

        const pushCandidate = (lang, rawFilename) => {
            try {
                const l = String(lang || '').trim();
                const name = String(rawFilename || '').trim();
                if (!l || !name) return;
                const draftUrl = getDraftAudioUrl(l, name);
                if (!draftUrl || typeof draftUrl !== 'string' || !draftUrl.startsWith('blob:')) return;

                const rel = buildDictationAudioUrl(id, l, name);
                if (!rel) return;
                const abs = new URL(rel, window.location.origin).toString();
                toCommit.push({ lang: l, filename: name, draftUrl, finalUrl: abs });
            } catch (e) {
            }
        };

        try {
            const origLang = normalizeLangCode(currentDictation && currentDictation.language_original);
            const langs = (() => {
                try {
                    const out = [];
                    if (origLang) out.push(origLang);
                    if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                        for (const k of Object.keys(workingData.translations)) {
                            const l = normalizeLangCode(k);
                            if (l && l !== origLang) out.push(l);
                        }
                    }
                    return Array.from(new Set(out)).filter(Boolean);
                } catch (e) {
                    return [origLang].filter(Boolean);
                }
            })();

            for (const l of langs) {
                const wd = (l && origLang && l === origLang)
                    ? (workingData && workingData.original ? workingData.original : null)
                    : getTranslationData(l);
                const sentences = wd && Array.isArray(wd.sentences) ? wd.sentences : [];
                for (const s of sentences) {
                    if (!s) continue;
                    pushCandidate(l, s.audio);
                    pushCandidate(l, s.audio_avto);
                    pushCandidate(l, s.audio_mic);
                    pushCandidate(l, s.audio_user);
                }
                pushCandidate(l, wd && wd.audio_user_shared);
            }
        } catch (e) {
        }

        if (!toCommit.length) return;

        for (const item of toCommit) {
            try {
                const res = await fetch(item.draftUrl);
                const blob = await res.blob();
                if (!blob || !blob.size) continue;
                try {
                    if (window.AudioManager && typeof window.AudioManager.saveDictationAudioBlob === 'function') {
                        await window.AudioManager.saveDictationAudioBlob(id, item.lang, item.filename, blob, blob.type || 'audio/mpeg');
                        continue;
                    }
                } catch (e) {
                }

                // Fallback (legacy behavior)
                let cache = null;
                try {
                    if (window.AudioManager && typeof window.AudioManager.openMediaCache === 'function') {
                        cache = await window.AudioManager.openMediaCache();
                    }
                } catch (e) {
                    cache = null;
                }
                if (!cache) {
                    continue;
                }
                const headers = new Headers();
                headers.set('Content-Type', blob.type || 'audio/mpeg');
                headers.set('Cache-Control', 'no-store');
                try {
                    if (window.AudioManager && typeof window.AudioManager.putResponseToCache === 'function') {
                        await window.AudioManager.putResponseToCache(item.finalUrl, new Response(blob, { status: 200, headers }));
                    }
                } catch (e) {
                }
            } catch (e) {
            }
        }
    } catch (e) {
    }
}

/**
 * Гарантированно устанавливает регион волны в соответствие текущему режиму
 * - full: берёт workingData.original.audio_user_shared_start/end или весь файл
 * - sentence: регион выбранного предложения
 * - mic: регион выбранного предложения
 */
function ensureWaveformRegionMatchesMode(currentMode) {
    const wf = window.waveformCanvas;
    if (!wf) return;

    if (currentMode === 'full' || currentMode === 'sentence' || currentMode === 'mic') {
        // В режимах по предложениям/микрофон берём границы из полей под волной
        const start = Number(startInput && startInput.value) || 0;
        const end = Number(endInput && endInput.value) || 0;
        if (end > start) {
            wf.setRegion(start, end);
            wf.setCurrentTime(start);
        }
    }
}

/**
 * Универсальная функция проигрывания аудио
 * @param {Event} event - событие клика
 */
async function handleAudioPlayback(event) {

    const button = event.target.closest('button.audio-btn');

    if (!button) {
        console.error('❌ Кнопка не найдена!');
        return;
    }
    // 1️⃣ Определяем URL    
    const initialState = button.dataset.state;
    const language = button.dataset.language; // 'en' или 'ru'
    const languageUrl = getAudioPath(language);
     
    let fieldName = 'audio'; // 'audio', 'audio_avto', 'audio_user', 'audio_mic', 'audio_user_shared'
    let nameAudioFile = 'audio.mp3';
    let sentence = {};
    let audioUrl = null;
    
    // Определяем, является ли это кнопкой под волной (объявляем в начале, чтобы была доступна везде)
    const isUnderWave = button && button.id === 'audioPlayBtn';

    // Кнопка воспроизведения созданного файла
     if (button.id === 'playCreatedAudioBtn') {
        audioUrl = button.dataset.audioUrl;
        if (!audioUrl) {
            console.warn('⚠️ Нет URL для воспроизведения созданного файла');
            return;
        }
    } else {
        sentence = getSentenceForButton(button);

        // Кнопка под волной: играем строго currentAudioFile (волна уже подготовлена внешними процедурами)
        if (isUnderWave) {
            const file = typeof currentAudioFileName !== 'undefined' ? currentAudioFileName : '';
            if (!file) {
                console.warn('⚠️ Нет текущего файла под волной — воспроизведение отменено');
                return;
            }
            audioUrl = await resolveEditorPlaybackAudioUrl(currentDictation.id, language, file);

            // Не трогаем регион/волну из Play
        } else {
            fieldName = button.dataset.fieldName; // 'audio', 'audio_avto', 'audio_user', 'audio_mic', 'audio_user_shared'
            nameAudioFile = sentence && sentence[fieldName];

            const needsRegenEarly = String(button.dataset.create || '') === 'true';
            // If user requested regeneration, do not resolve/play existing audio for this row.
            if (!needsRegenEarly) {
                audioUrl = await resolveEditorPlaybackAudioUrl(currentDictation.id, language, nameAudioFile);
            } else {
                audioUrl = null;
            }
        }
    }

    // If we have an in-memory (unsaved) audio blob for this file, prefer it.
    try {
        const needsRegen = String(button.dataset.create || '') === 'true';
        if (!needsRegen && !isUnderWave && nameAudioFile) {
            const draftUrl = getDraftAudioUrl(language, nameAudioFile);
            if (draftUrl && typeof draftUrl === 'string' && draftUrl.startsWith('blob:')) {
                audioUrl = draftUrl;
                if (button.dataset.state !== 'ready' && button.dataset.state !== 'playing') {
                    button.dataset.state = 'ready';
                    button.dataset.originalState = 'ready';
                    setButtonState(button);
                }
            }
        }
    } catch (e) {
        console.error('Ошибка в handleAudioPlayback:', e);
    }

    // 2️⃣ Если что-то уже играет — остановим
    if (audioManager.currentButton && audioManager.currentButton !== button) {
        console.log("STOP STOP STOP STOP STOP")
        audioManager.stop();
    }

    // Проверяем наличие файла для состояния 'ready' (не для кнопки под волной)
    if (initialState === 'ready' && button.id !== 'audioPlayBtn' && button.id !== 'playCreatedAudioBtn') {
        const hasFile = nameAudioFile && typeof nameAudioFile === 'string' && nameAudioFile.trim() !== '';
        if (!hasFile) {
            console.warn('⚠️ Файл не найден для воспроизведения, переключаем на создание', {
                button,
                fieldName,
                nameAudioFile,
                sentence,
                state
            });
            button.dataset.state = 'creating';
            setButtonState(button);
        }
    }

    const state = button.dataset.state;
    switch (state) {
        case 'ready':
        case 'ready_user':
        case 'ready_mic':
        case 'ready-shared':
             // Воспроизводим аудио
            if (button.id === 'audioPlayBtn' && window.waveformCanvas) {
                // Если это кнопка под волной, передаём waveformCanvas
                audioManager.setWaveformCanvas(window.waveformCanvas);
            }
            audioManager.play(button, audioUrl);
             break;
        

        case 'playing':
        case 'playing-shared':
            audioManager.pause();
            break;

        case 'creating':
            // Если blob уже есть — играем, не генерим
            if (String(button.dataset.create || '') !== 'true' && !isUnderWave && nameAudioFile) {
                const draftUrl = getDraftAudioUrl(language, nameAudioFile);
                if (draftUrl && typeof draftUrl === 'string' && draftUrl.startsWith('blob:')) {
                    audioManager.play(button, draftUrl);
                    break;
                }
            }
            // в состоянии "создание"
            try {
                await createAndPlayAudio(button, language, fieldName, languageUrl);
            } catch (e) {
                try { audioManager.stop(); } catch (e2) {}
                try {
                    button.dataset.state = 'creating';
                    setButtonState(button);
                } catch (e3) {}
                return;
            }
            break;
        case 'creating_user':
            // Если blob уже есть — играем, не генерим
            if (String(button.dataset.create || '') !== 'true' && !isUnderWave && nameAudioFile) {
                const draftUrl = getDraftAudioUrl(language, nameAudioFile);
                if (draftUrl && typeof draftUrl === 'string' && draftUrl.startsWith('blob:')) {
                    audioManager.play(button, draftUrl);
                    break;
                }
            }
            // в состоянии "создание"
            try {
                await createAndPlayAudio(button, language, fieldName, languageUrl);
            } catch (e) {
                try { audioManager.stop(); } catch (e2) {}
                try {
                    button.dataset.state = 'creating_user';
                    setButtonState(button);
                } catch (e3) {}
                return;
            }
            break;

        case 'creating_mic':
            // в состоянии "создание микрофона" показываем иконку микрофона
            // TODO: реализовать создание аудио с микрофона
            break;

        case 'creating_shared':
            // в состоянии "создание микрофона" показываем иконку микрофона
            // TODO: реализовать создание аудио с микрофона
            break;
    }
}


/**
 * Создать и проиграть аудио
 */
async function createAndPlayAudio(button, language, fieldName, languageUrl) {
    setButtonState(button, 'creating');

    try {
        // Ensure no other audio continues playing while we generate/attach a new one.
        try {
            if (window.audioManager && typeof window.audioManager.stop === 'function') {
                window.audioManager.stop();
            }
        } catch (e) {
        }

        // Получаем данные предложения
        const sentence = getSentenceForButton(button);
        if (!sentence) {
            throw new Error('Не найдено предложение для кнопки');
        }

        // If user explicitly forced regeneration, drop any existing in-memory draft blob URL
        // for this file to avoid playing stale audio.
        try {
            const forced = String(button && button.dataset ? (button.dataset.create || '') : '') === 'true';
            if (forced) {
                const existingName = sentence && sentence[fieldName] ? String(sentence[fieldName] || '').trim() : '';
                if (existingName) {
                    clearDraftAudioUrl(language, existingName);
                }
            }
        } catch (e) {
        }

        // Проверяем режим и наличие start/end для вырезания из общего файла
        const audioMode = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioMode ? audioMode.value : 'full';
        let nameAudioFile = null;

        // В режиме "sentence" для поля "audio_user" проверяем, можно ли вырезать из общего файла
        if (currentMode === 'sentence' && fieldName === 'audio_user' && 
            sentence.start !== undefined && sentence.end !== undefined &&
            sentence.start >= 0 && sentence.end > sentence.start &&
            currentAudioFileName) { // есть общий файл
            
            // Вырезаем кусочек из общего файла
            nameAudioFile = await trimAudioForSentence(sentence, language, currentAudioFileName);
            
            if (!nameAudioFile) {
                throw new Error('Не удалось вырезать аудио из общего файла');
            }
        } else {
            // Для других режимов или если не удалось вырезать - генерируем TTS
            nameAudioFile = await generateAudioForSentence(sentence, language);
            
            if (!nameAudioFile) {
                throw new Error('Не удалось создать аудио файл');
            }
        }

        // Обновляем данные предложения
        sentence[fieldName] = nameAudioFile;
        console.log('✅ Файл создан и сохранен в предложение:', {
            key: sentence.key,
            fieldName: fieldName,
            filename: nameAudioFile,
            sentence: sentence
        });

        try {
            currentDictation.isSaved = false;
        } catch (e) {
        }
        try {
            setDirtyFlags({ audio: true });
        } catch (e) {
        }

        // Меняем кнопку в режим готовности к воспроизведению (файл теперь существует)
        button.dataset.state = 'playing';
        button.dataset.originalState = 'ready';
        button.title = 'Воспроизвести аудио';
        setButtonState(button);
        
        // Обновляем видимость кнопки редактирования всех
        updateEditAllCreatingButtonVisibility();

        // Устанавливаем текущую кнопку и проигрываем созданный файл
        currentPlayingButton = button;
        audioUrl = await resolveEditorPlaybackAudioUrl(currentDictation.id, language, nameAudioFile);
        audioManager.play(button, audioUrl);

    } catch (error) {
        console.error('❌ Ошибка при создании аудио:', error);
        setButtonState(button, 'creating');
        updateEditAllCreatingButtonVisibility();
        throw error;
    }
}

/**
 * Обработать редактирование всех строк с состоянием 'creating'
 */
async function handleEditAllCreating() {
    const editAllBtn = document.getElementById('editAllCreatingBtn');
    if (!editAllBtn) return;
    
    // Находим все кнопки с состоянием 'creating' и fieldName = 'audio_user'
    const creatingButtons = document.querySelectorAll('button.audio-btn[data-field-name="audio_user"][data-state="creating"]');
    
    if (creatingButtons.length === 0) {
        console.log('Нет строк с состоянием "creating" для редактирования');
        return;
    }
    
    showLoadingIndicator(`Создание аудио для ${creatingButtons.length} строк...`);
    
    try {
        const language = currentDictation.language_original;
        const languageUrl = getAudioPath(language);
        
        // Создаем аудио для каждой кнопки последовательно
        for (let i = 0; i < creatingButtons.length; i++) {
            const button = creatingButtons[i];
            
            // Обновляем индикатор загрузки
            showLoadingIndicator(`Создание аудио ${i + 1} из ${creatingButtons.length}...`);
            
            try {
                await createAndPlayAudio(button, language, 'audio_user', languageUrl);
                // Небольшая задержка между запросами, чтобы не перегружать сервер
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Ошибка при создании аудио для строки ${i + 1}:`, error);
                // Продолжаем обработку остальных строк
            }
        }
        
        console.log(`✅ Обработано ${creatingButtons.length} строк`);
    } catch (error) {
        console.error('❌ Ошибка при обработке всех строк:', error);
        alert('Произошла ошибка при создании аудио. Проверьте консоль для деталей.');
    } finally {
        hideLoadingIndicator();
        updateEditAllCreatingButtonVisibility();
    }
}

/**
 * Обновить видимость кнопки "Отредактировать все отмеченные"
 */
function updateEditAllCreatingButtonVisibility() {
    const editAllBtn = document.getElementById('editAllCreatingBtn');
    if (!editAllBtn) return;
    
    // Находим все кнопки с состоянием 'creating' и fieldName = 'audio_user'
    const creatingButtons = document.querySelectorAll('button.audio-btn[data-field-name="audio_user"][data-state="creating"]');
    
    // Показываем кнопку только если есть строки с состоянием 'creating'
    // и если мы находимся в режиме, где видна колонка с кнопками
    const table = document.getElementById('sentences-table');
    const isUserColumnVisible = table && table.querySelector('.col-play-audio.panel-editing-user')?.style.display !== 'none';
    
    if (creatingButtons.length > 0 && isUserColumnVisible) {
        editAllBtn.style.display = 'inline-block';
    } else {
        editAllBtn.style.display = 'none';
    }
}


/**
 * Проиграть аудио файл через AudioManager
 */
async function playAudioFile(nameAudioFile, language, updatePlayhead = false) {

    if (!nameAudioFile) {
        console.warn("playAudioFile: no nameAudioFile");
        return;
    }

    const audioUrl = await resolveEditorPlaybackAudioUrl(currentDictation && currentDictation.id, language, nameAudioFile);

    // Если сейчас играет другая кнопка — остановим и восстановим её состояние
    if (currentPlayingButton && currentPlayingButton !== button) {
        // восстановление состояния предыдущей кнопки
        const originalStatePrev = currentPlayingButton.dataset.originalState || 'ready';
        setButtonState(currentPlayingButton, originalStatePrev);
        currentPlayingButton = null;
        // остановим аудиоManager
        audioManager.stop();
        // и остановим контроль волны, если нужен
        if (window.waveformCanvas) {
            window.waveformCanvas.stopAudioControl();
        }
    }

    // Передаем контроль воспроизведения в WaveformCanvas (только если нужно)
    if (updatePlayhead && window.waveformCanvas) {
        window.waveformCanvas.startAudioControl(player);
    }

    return new Promise((resolve, reject) => {
        // Очищаем старые обработчики (если они есть)
        player.onloadeddata = null;
        player.onended = null;
        player.onpause = null;
        player.onerror = null;

        player.onloadeddata = () => {
            player.play().catch(error => {
                console.error('❌ Ошибка воспроизведения:', error);
                console.error('❌ URL файла:', audioUrl);
                console.error('❌ Имя файла:', audioFile);
                reject(error);
            });
        };

        // Функция для восстановления состояния кнопки
        const restoreButtonState = () => {
            if (currentPlayingButton) {
                const originalState = currentPlayingButton.dataset.originalState || 'ready';
                setButtonState(currentPlayingButton, originalState);
                currentPlayingButton = null;
            }
        };

        player.onended = () => {
            // Останавливаем контроль WaveformCanvas
            if (updatePlayhead && window.waveformCanvas) {
                window.waveformCanvas.stopAudioControl();
            }
            restoreButtonState();
            resolve();
        };

        // Добавляем слушатель на pause (когда WaveformCanvas останавливает аудио в конце региона)
        player.onpause = () => {
            // Проверяем, что это остановка WaveformCanvas в конце региона, а не ручная остановка
            if (currentPlayingButton && updatePlayhead) {
                restoreButtonState();
                resolve();
            }
        };

        player.onerror = (error) => {
            console.error('❌ Ошибка воспроизведения:', error);
            restoreButtonState();
            reject(error);
        };
    });
}


/**
 * Получить предложение для кнопки
 */
function getSentenceForButton(button) {

    // Определяем язык из данных кнопки
    const language = button.dataset.language;

    if (language === currentDictation.language_original) {
        if (button.dataset.state === 'ready-shared') {
            return workingData.original;
        } else {
            const row = button.closest('tr');
            const key = row.dataset.key;
            return workingData.original.sentences.find(s => s.key === key);
        }
    } else {
        const trBucket = getTranslationData(language);
        if (button.dataset.state === 'ready-shared') {
            return trBucket;
        } else {
            const row = button.closest('tr');
            const key = row.dataset.key;
            return trBucket && Array.isArray(trBucket.sentences) ? trBucket.sentences.find(s => s.key === key) : null;
        }
    }
}

/**
 * Получить имя аудио файла
 */
function getAudioFileName(button, language, fieldName) {
    const sentence = getSentenceForButton(button);
    const fileName = sentence ? sentence[fieldName] : null;
    return fileName;
}

/**
 * Установить состояние кнопки
 * показываем то стостояние, которое передали в функцию или из dataset.state
 */
function setButtonState(button, state = '') {
    // Убираем все состояния
    // button.classList.remove('state-ready', 'state-playing', 'state-creating');

    // // Добавляем новое состояние
    // button.classList.add(`state-${state}`);
    if (state === '') {
        state = button.dataset.state;
    }

    let newIcon = '';
    switch (state) {
        case 'ready':
            // в состоянии "готов" показываем иконку воспроизведения
            newIcon = 'play';
            break;
        case 'ready-shared':
            // в состоянии "готов-shared" показываем иконку воспроизведения
            // это состояние для кнопки, которая воспроизводит аудио общего пользователя
            newIcon = 'play';
            break;
        case 'playing':
            // в состоянии "воспроизведение" показываем иконку паузы
            newIcon = 'pause';
            break;
        case 'playing-shared':
            // в состоянии "воспроизведение-shared" показываем иконку паузы
            // это состояние для кнопки под волной во время воспроизведения
            newIcon = 'pause';
            break;
        case 'creating':
            // в состоянии "создание" показываем иконку молотка
            newIcon = 'hammer';
            break;
        case 'creating_mic':
            // в состоянии "создание микрофона" показываем иконку микрофона
            newIcon = 'mic';
            break;
    }
    button.innerHTML = `<i data-lucide="${newIcon}"></i>`;

    // Обновляем состояние кнопки в DOM
    button.dataset.state = state;

    // Перерисовываем иконку Lucide
    lucide.createIcons();
}

// ============================================================================
// ФУНКЦИИ ДЛЯ ИНДИКАТОРА ЗАГРУЗКИ
// ============================================================================

function showLoadingIndicator(message = 'Загрузка...') {
    try {
        if (typeof window.setSwBarProgress === 'function') {
            const msg = String(message || '').trim();
            let pct = null;
            let kind = '';
            try {
                const m = msg.match(/(\d+)\s*(?:из|of)\s*(\d+)/i);
                if (m) {
                    const cur = Number(m[1]);
                    const total = Number(m[2]);
                    if (isFinite(cur) && isFinite(total) && total > 0) {
                        pct = Math.round((cur / total) * 100);
                    }
                }
            } catch (e2) {
                pct = null;
            }
            try {
                const lower = msg.toLowerCase();
                if (lower.includes('аудио') || lower.includes('audio') || lower.includes('b2')) {
                    kind = 'audio';
                } else {
                    kind = 'db';
                }
            } catch (e3) {
                kind = '';
            }
            window.setSwBarProgress(msg, pct, kind);
        }
    } catch (e) {
    }

    // Создаем overlay
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('.loading-text').textContent = message;
    }
    overlay.style.display = 'flex';
}

function hideLoadingIndicator() {
    try {
        if (typeof window.setSwBarProgress === 'function') {
            window.setSwBarProgress('', null, '');
        }
    } catch (e) {
    }

    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// ============================================================================
// ФУНКЦИИ ДЛЯ ПОДСВЕТКИ СИНТАКСИСА В TEXTAREA
// ============================================================================

/**
 * Настройка подсветки синтаксиса для contenteditable div
 * @param {HTMLElement} editor - элемент contenteditable
 */
function setupTextareaHighlighting(editor) {
    let isUpdating = false;

    // Функция обновления подсветки
    function updateHighlight() {
        if (isUpdating) return;

        const text = editor.innerText || editor.textContent;
        const lines = text.split('\n');
        // Старое значение по умолчанию: '/*'
        const delimiter = document.getElementById('translationDelimiter')?.value || '//';

        const highlightedText = lines.map(line => {
            if (line.trim().startsWith(delimiter)) {
                return `<span class="line-translation">${escapeHtml(line)}</span>`;
            }
            return escapeHtml(line);
        }).join('\n');

        // Сохраняем позицию курсора
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const cursorOffset = range ? getCursorOffset(editor, range) : 0;

        isUpdating = true;
        editor.innerHTML = highlightedText;

        // Восстанавливаем позицию курсора
        if (cursorOffset !== null) {
            setCursorAtOffset(editor, cursorOffset);
        }
        isUpdating = false;
    }

    // Обработчики событий
    editor.addEventListener('input', () => {
        if (!isUpdating) {
            setTimeout(updateHighlight, 10);
        }
    });

    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const normalized = normalizeNewlines(text);
        document.execCommand('insertText', false, normalized);
        setTimeout(updateHighlight, 10);
    });

    // Обработчик изменения разделителя
    const delimiterInput = document.getElementById('translationDelimiter');
    if (delimiterInput) {
        delimiterInput.addEventListener('input', updateHighlight);
    }

    // Первоначальная подсветка
    updateHighlight();
}

/**
 * Получить позицию курсора относительно начала элемента
 * @param {HTMLElement} element - элемент
 * @param {Range} range - диапазон выделения
 * @returns {number} - позиция курсора
 */
function getCursorOffset(element, range) {
    let offset = 0;
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        if (node === range.startContainer) {
            offset += range.startOffset;
            break;
        }
        offset += node.textContent.length;
    }

    return offset;
}

/**
 * Установить курсор в указанную позицию
 * @param {HTMLElement} element - элемент
 * @param {number} offset - позиция курсора
 */
function setCursorAtOffset(element, offset) {
    const range = document.createRange();
    const selection = window.getSelection();

    let currentOffset = 0;
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= offset) {
            range.setStart(node, offset - currentOffset);
            range.setEnd(node, offset - currentOffset);
            break;
        }
        currentOffset += nodeLength;
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Экранирование HTML символов
 * @param {string} text - текст для экранирования
 * @returns {string} - экранированный текст
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С БОКОВОЙ ПАНЕЛЬЮ НАСТРОЕК АУДИО
// ============================================================================

/**
 * Открыть боковую панель настроек аудио
 * @param {string} language - 'original' или 'translation'
 * @param {string} rowKey - ключ строки
 */
function openAudioSettingsPanel(language, rowKey) {
    // Сохраняем текущий режим редактирования
    currentDictation.current_edit_mode = language;
    currentDictation.current_row_key = rowKey;

    // Переключаемся на вкладку "Настройка аудио"
    switchTab('audio');

    // Инициализируем режим "отображать весь файл" при открытии
    const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
    if (fullRadio) {
        fullRadio.checked = true;
        // Инициируем обработчик изменения режима
        handleAudioModeChange({ target: fullRadio });
    }

    // Обновляем иконки радио-кнопок при открытии
    updateRadioButtonIcons('full');
}

/**
 * Закрыть боковую панель настроек аудио
 */
function closeAudioSettingsPanel() {
    // Очищаем текущий режим редактирования
    currentDictation.current_edit_mode = null;
    currentDictation.current_row_key = null;

}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ПАНЕЛЬЮ ВКЛАДОК
// ============================================================================

/**
 * Переключение вкладок
 * @param {string} tabName - имя вкладки ('general', 'audio', 'dialog')
 */
function switchTab(tabName) {
    // Убираем активный класс у всех кнопок и контента
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Активируем выбранную вкладку
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`tab-${tabName}`);

    if (tabBtn && tabContent) {
        tabBtn.classList.add('active');
        tabContent.classList.add('active');

        // Обновляем иконки Lucide при переключении
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/**
 * Инициализация панели вкладок
 */
function setupTabsPanel() {
    // Обработчики для кнопок вкладок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
            applyTableViewForTab(tabName);
        });
    });

    // Синхронизация полей названий между основной формой и вкладкой
    const titleInput = document.getElementById('title');
    const tabTitleInput = document.getElementById('tabTitle');
    const titleTranslationInput = document.getElementById('title_translation');
    const tabTitleTranslationInput = document.getElementById('tabTitleTranslation');

    if (titleInput && tabTitleInput) {
        // Синхронизация из основной формы во вкладку
        titleInput.addEventListener('input', () => {
            tabTitleInput.value = titleInput.value;
            try {
                if (workingData && workingData.original) {
                    workingData.original.title = titleInput.value;
                }
            } catch (e) {
            }
            try { setDictationNameTitle(titleInput.value); } catch (e) {}
            setDirtyFlags({ db: true });
            try { updateUnsavedStar(); } catch (e) {}
        });

        // Синхронизация из вкладки в основную форму
        tabTitleInput.addEventListener('input', () => {
            titleInput.value = tabTitleInput.value;
            try {
                if (workingData && workingData.original) {
                    workingData.original.title = tabTitleInput.value;
                }
            } catch (e) {
            }
            try { setDictationNameTitle(tabTitleInput.value); } catch (e) {}
            setDirtyFlags({ db: true });
            try { updateUnsavedStar(); } catch (e) {}
        });
    }

    if (titleTranslationInput && tabTitleTranslationInput) {
        // Синхронизация из основной формы во вкладку
        titleTranslationInput.addEventListener('input', () => {
            tabTitleTranslationInput.value = titleTranslationInput.value;
            try {
                const tr = getCurrentTranslationData({ createIfMissing: false });
                if (tr) tr.title = titleTranslationInput.value;
            } catch (e) {
            }
            setDirtyFlags({ db: true });
        });

        // Синхронизация из вкладки в основную форму
        tabTitleTranslationInput.addEventListener('input', () => {
            titleTranslationInput.value = tabTitleTranslationInput.value;
            try {
                const tr = getCurrentTranslationData({ createIfMissing: false });
                if (tr) tr.title = tabTitleTranslationInput.value;
            } catch (e) {
            }
            setDirtyFlags({ db: true });
        });
    }

    // Синхронизация обложки
    const coverImage = document.getElementById('coverImage');
    const tabCoverImage = document.getElementById('tabCoverImage');
    const coverFile = document.getElementById('coverFile');
    const tabCoverFile = document.getElementById('tabCoverFile');

    if (coverImage && tabCoverImage) {
        // Синхронизация обложки через MutationObserver
        const observer = new MutationObserver(() => {
            if (coverImage.src !== tabCoverImage.src) {
                tabCoverImage.src = coverImage.src;
            }
        });
        observer.observe(coverImage, { attributes: true, attributeFilter: ['src'] });

        const tabObserver = new MutationObserver(() => {
            if (tabCoverImage.src !== coverImage.src) {
                coverImage.src = tabCoverImage.src;
            }
        });
        tabObserver.observe(tabCoverImage, { attributes: true, attributeFilter: ['src'] });
    }

    // Обработчик загрузки обложки во вкладке
    const tabCoverUploadBtn = document.getElementById('tabCoverUploadBtn');
    if (tabCoverUploadBtn && tabCoverFile) {
        tabCoverUploadBtn.addEventListener('click', () => {
            tabCoverFile.click();
        });

        tabCoverFile.addEventListener('change', (e) => {
            const file = e.target && e.target.files ? e.target.files[0] : null;
            if (!file) return;

            if (!file.type || !String(file.type).startsWith('image/')) {
                alert('Пожалуйста, выберите файл изображения.');
                try { tabCoverFile.value = ''; } catch (e) {}
                return;
            }

            // Используем тот же flow что и основная кнопка: crop modal -> blob -> dirty flag.
            const reader = new FileReader();
            reader.onload = (event) => {
                const imgUrl = event && event.target ? event.target.result : null;
                if (!imgUrl) return;
                try { openCropModal(imgUrl); } catch (e) {}
            };
            reader.readAsDataURL(file);
        });
    }

    // Обработчик чекбокса диалога во вкладке
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    const isDialogCheckbox = document.getElementById('isDialogCheckbox');
    const tabSpeakersTable = document.getElementById('tabSpeakersTable');

    if (tabIsDialogCheckbox) {
        tabIsDialogCheckbox.addEventListener('change', () => {
            const isDialog = tabIsDialogCheckbox.checked;
            currentDictation.is_dialog = isDialog;
            setDirtyFlags({ db: true });

            // Синхронизируем с основным чекбоксом
            if (isDialogCheckbox) {
                isDialogCheckbox.checked = isDialog;
                updateCheckboxIcon(isDialogCheckbox);
            }

            // Показываем/скрываем таблицу спикеров
            if (tabSpeakersTable) {
                tabSpeakersTable.style.display = isDialog ? 'block' : 'none';
            }

            // Обновляем иконку чекбокса
            const checkboxIcon = document.querySelector('#tabDialogCheckboxLabel .checkbox-icon');
            if (checkboxIcon) {
                if (isDialog) {
                    checkboxIcon.setAttribute('data-lucide', 'circle-check');
                } else {
                    checkboxIcon.setAttribute('data-lucide', 'circle');
                }
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }

            // Только показать/скрыть колонку без пересборки таблицы
            const show = !!isDialog;
            const speakerHeader = document.querySelector('th.col-speaker');
            if (speakerHeader) speakerHeader.style.display = show ? 'table-cell' : 'none';
            document.querySelectorAll('td.col-speaker').forEach(td => {
                td.style.display = show ? 'table-cell' : 'none';
            });
        });

        // Обработчики для таблицы спикеров во вкладке
        setupTabSpeakersHandlers();
    }
    
    // Обработчики для вкладки "Создание аудио"
    setupCreateAudioHandlers();
}

/**
 * Обработчик переключения чекбокса (общий для всех строк, как handleAudioPlayback)
 */
function handleCheckboxToggle(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Находим кнопку через closest (как в handleAudioPlayback)
    const btn = e.target.closest('button.checkbox-btn');
    
    if (!btn) {
        return;
    }
    
    const key = btn.dataset.key;
    
    if (!key) return;
    
    // Находим предложение по ключу
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) return;
    
    // Переключаем состояние checked
    sentence.checked = !sentence.checked;
    
    // Находим иконку в этой кнопке и обновляем её
    const icon = btn.querySelector('.checkbox-icon');
    if (icon) {
        const iconName = sentence.checked ? 'circle-check' : 'circle';
        
        // Очищаем старую иконку (удаляем SVG, если есть)
        const oldSvg = icon.querySelector('svg');
        if (oldSvg) {
            oldSvg.remove();
        }
        
        // Устанавливаем новый атрибут data-lucide
        icon.setAttribute('data-lucide', iconName);
        
        // Перерисовываем иконку Lucide
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }
    
    // Обновляем состояние общего чекбокса
    updateSelectAllCheckboxState();
}

/**
 * Настройка обработчиков для вкладки "Создание аудио"
 */
// Глобальный список созданных файлов в этой сессии
let createdAudioFiles = [];

function setupCreateAudioHandlers() {
    // Обработчик для общего чекбокса "Выбрать все"
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectAllCheckboxLabel = document.getElementById('selectAllCheckboxLabel');
    
    if (selectAllCheckbox && selectAllCheckboxLabel) {
        // Обработчик клика на label
        selectAllCheckboxLabel.addEventListener('click', function(e) {
            e.preventDefault();
            selectAllCheckbox.checked = !selectAllCheckbox.checked;
            selectAllCheckbox.dispatchEvent(new Event('change'));
        });
        
        // Обработчик изменения чекбокса
        selectAllCheckbox.addEventListener('change', function() {
            const isChecked = selectAllCheckbox.checked;
            const checkboxIcon = selectAllCheckboxLabel.querySelector('.checkbox-icon');
            
            if (checkboxIcon) {
                checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
            
            // Устанавливаем состояние checked для всех предложений в данных
            if (workingData && workingData.original && workingData.original.sentences) {
                workingData.original.sentences.forEach(sentence => {
                    sentence.checked = isChecked;
                });
            }
            
            // Обновляем иконки во всех строках таблицы
            const allCheckboxBtns = document.querySelectorAll('td.col-checkbox-create-audio .checkbox-btn');
            allCheckboxBtns.forEach(btn => {
                const icon = btn.querySelector('.checkbox-icon');
                if (icon) {
                    icon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                }
            });
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
    
    // Обработчик кнопки "Создать файл"
    const createAudioFileBtn = document.getElementById('createAudioFileBtn');
    if (createAudioFileBtn) {
        createAudioFileBtn.addEventListener('click', async function() {
            await showCreateAudioFileModal();
        });
    }
    
    // Обработчик кнопки "Сохранить файл на диск"
    const saveAudioFileBtn = document.getElementById('saveAudioFileBtn');
    if (saveAudioFileBtn) {
        saveAudioFileBtn.addEventListener('click', async function() {
            await saveAudioFileToDisk();
        });
    }
    
    // Обработчик dropdown списка файлов
    const dropdownBtn = document.getElementById('audioFileDropdownBtn');
    const dropdown = document.getElementById('audioFileDropdown');
    
    if (dropdownBtn && dropdown) {
        dropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
        
        // Закрываем dropdown при клике вне его
        document.addEventListener('click', function(e) {
            if (!dropdownBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
    
    // Обработчик кнопки воспроизведения созданного аудио
    const playCreatedAudioBtn = document.getElementById('playCreatedAudioBtn');
    if (playCreatedAudioBtn) {
        if (!playCreatedAudioBtn.dataset.audioPlaybackHandlerInstalled) {
            playCreatedAudioBtn.addEventListener('click', handleAudioPlayback);
            playCreatedAudioBtn.dataset.audioPlaybackHandlerInstalled = 'true';
        }
    }
    
    // Обработчик кнопки "Отредактировать все отмеченные"
    const editAllCreatingBtn = document.getElementById('editAllCreatingBtn');
    if (editAllCreatingBtn) {
        editAllCreatingBtn.addEventListener('click', handleEditAllCreating);
    }
    
    // Обработчик выпадающего списка обозначений
    const audioNotationsSelect = document.getElementById('audioNotationsSelect');
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (audioNotationsSelect && audioTypeInput) {
        const button = audioNotationsSelect.querySelector('.speed-select-button');
        const list = audioNotationsSelect.querySelector('.speed-options');
        const optionElements = Array.from(list.querySelectorAll('li'));
        
        if (button && list && optionElements.length > 0) {
            // Обработчик открытия/закрытия списка
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                audioNotationsSelect.classList.toggle('open');
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
            
            // Обработчик выбора элемента из списка
            optionElements.forEach(li => {
                li.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const textToAdd = li.dataset.text || '';
                    if (textToAdd) {
                        // Добавляем текст в поле ввода (в конец)
                        const currentValue = audioTypeInput.value || '';
                        audioTypeInput.value = currentValue + textToAdd;
                    }
                    
                    // Закрываем список
                    audioNotationsSelect.classList.remove('open');
                });
            });
            
            // Закрываем список при клике вне его
            if (!audioNotationsSelect.dataset.initialized) {
                document.addEventListener('click', function(e) {
                    if (audioNotationsSelect && !audioNotationsSelect.contains(e.target)) {
                        audioNotationsSelect.classList.remove('open');
                    }
                });
                audioNotationsSelect.dataset.initialized = 'true';
            }
        }
    }
}
/**
 * Создать комбинированный аудио файл из выбранных предложений
 * @param {string} customFileName - кастомное имя файла (если не указано, используется паттерн)
 */
async function createCombinedAudioFile(customFileName = null) {
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (!audioTypeInput) {
        console.error('Поле ввода типа аудио не найдено');
        return;
    }
    
    const pattern = audioTypeInput.value.trim().toLowerCase();
    if (!pattern) {
        alert('Введите паттерн аудио (например: op, op_o, tp_mm)');
        return;
    }
    
    // Определяем имя файла
    const fileName = customFileName || `audio_${pattern}.mp3`;
    
    // Получаем все выбранные предложения
    const selectedSentences = workingData.original.sentences.filter(s => s.checked === true);
    
    if (selectedSentences.length === 0) {
        alert('Выберите хотя бы одно предложение');
        return;
    }
    
    // Парсим паттерн на элементы (o, p, p_o, t, m, и т.д.)
    const patternElements = parseAudioPattern(pattern);
    
    if (patternElements.length === 0) {
        alert('Неверный паттерн аудио');
        return;
    }
    
    // Собираем список файлов для каждого предложения
    const fileSequence = [];
    
    for (const sentence of selectedSentences) {
        // Находим соответствующее предложение перевода
        const trBucket = getCurrentTranslationData({ createIfMissing: false });
        const translationSentence = (trBucket && Array.isArray(trBucket.sentences))
            ? trBucket.sentences.find(s => s.key === sentence.key)
            : null;
        
        // Для каждого элемента паттерна получаем файл или паузу
        for (const element of patternElements) {
            const audioInfo = getAudioFileForPattern(element, sentence, translationSentence);
            if (audioInfo) {
                fileSequence.push(audioInfo);
            }
        }
    }
    
    if (fileSequence.length === 0) {
        alert('Не удалось найти аудио файлы для создания комбинации');
        return;
    }
    
    // Показываем индикатор загрузки
    showLoadingIndicator('Создание комбинированного аудио файла...');
    
    try {
        // Отправляем запрос на сервер для склейки
        const response = await fetch('/create-combined-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dictation_id: currentDictation.id,
                safe_email: currentDictation.safe_email,
                file_sequence: fileSequence,
                pattern: pattern,
                filename: fileName
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Добавляем файл в список созданных
            const fileInfo = {
                filename: result.filename,
                filepath: result.filepath,
                pattern: pattern,
                createdAt: new Date().toISOString()
            };
            createdAudioFiles.push(fileInfo);
            
            // Обновляем интерфейс
            updateAudioFileList();
            selectAudioFileFromList(fileInfo);

            try {
                const fileResponse = await fetch(result.filepath);
                if (!fileResponse.ok) {
                    throw new Error(`Не удалось скачать файл: HTTP ${fileResponse.status}`);
                }
                const blob = await fileResponse.blob();

                if (window.showSaveFilePicker) {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: result.filename,
                        types: [
                            {
                                description: 'Audio',
                                accept: {
                                    'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac', '.mp4']
                                }
                            }
                        ]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = result.filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                }
            } catch (e) {
                console.error('❌ Ошибка сохранения комбинированного файла на диск:', e);
                alert('Файл создан, но не удалось сохранить на диск: ' + (e && e.message ? e.message : e));
            }
         } else {
            alert('Ошибка создания файла: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('❌ Ошибка при создании комбинированного аудио:', error);
        alert('Ошибка при создании файла: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Показать модальное окно для создания аудио файла
 */
async function showCreateAudioFileModal() {
    const modal = document.getElementById('createAudioFileModal');
    const fileNameInput = document.getElementById('newAudioFileName');
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (!modal || !fileNameInput || !audioTypeInput) {
        console.error('Элементы модального окна не найдены');
        return;
    }
    
    // Получаем паттерн из поля ввода
    const pattern = audioTypeInput.value.trim().toLowerCase();
    
    // Предзаполняем имя файла
    const defaultName = pattern ? `audio_${pattern}.mp3` : 'audio.mp3';
    fileNameInput.value = defaultName;
    
    // Показываем модальное окно
    modal.style.display = 'flex';
    
    // Фокусируемся на поле ввода
    fileNameInput.focus();
    fileNameInput.select();
    
    // Обработчики кнопок модального окна
    const confirmBtn = document.getElementById('createAudioFileModalConfirm');
    const cancelBtn = document.getElementById('createAudioFileModalCancel');
    
    const handleConfirm = async () => {
        const fileName = fileNameInput.value.trim();
        if (!fileName) {
            alert('Введите имя файла');
            return;
        }
        
        // Закрываем модальное окно
        modal.style.display = 'none';
        
        // Создаем файл с указанным именем
        await createCombinedAudioFile(fileName);
    };
    
    const handleCancel = () => {
        modal.style.display = 'none';
    };
    
    // Удаляем старые обработчики, если есть
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleConfirm);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', handleCancel);
    
    // Закрытие по Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Обновляем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Обновить список созданных файлов в dropdown
 */
function updateAudioFileList() {
    const dropdown = document.getElementById('audioFileDropdown');
    const dropdownWrapper = document.querySelector('.audio-file-dropdown-wrapper');
    
    if (!dropdown || !dropdownWrapper) return;
    
    if (createdAudioFiles.length === 0) {
        dropdownWrapper.style.display = 'none';
        return;
    }
    
    // Показываем dropdown если есть файлы
    dropdownWrapper.style.display = 'inline-block';
    
    // Очищаем список
    dropdown.innerHTML = '';
    
    // Добавляем файлы в обратном порядке (новые сверху)
    createdAudioFiles.slice().reverse().forEach((fileInfo, index) => {
        const item = document.createElement('div');
        item.className = 'audio-file-dropdown-item';
        item.textContent = fileInfo.filename;
        item.dataset.index = createdAudioFiles.length - 1 - index;
        
        item.addEventListener('click', () => {
            selectAudioFileFromList(fileInfo);
            dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(item);
    });
    
    // Обновляем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Выбрать файл из списка
 */
function selectAudioFileFromList(fileInfo) {
    const audioFileNameLabel = document.getElementById('audioFileNameLabel');
    const playBtn = document.getElementById('playCreatedAudioBtn');
    const saveBtn = document.getElementById('saveAudioFileBtn');
    
    if (!audioFileNameLabel || !fileInfo) return;
    
    // Обновляем лейбл
    audioFileNameLabel.textContent = `Имя файла: ${fileInfo.filename}`;
    
    // Сохраняем выбранный файл
    window.createdAudioFileName = fileInfo.filename;
    window.createdAudioFilePath = fileInfo.filepath;
    
    // Показываем и обновляем кнопку воспроизведения, когда файл создан/выбран
    if (playBtn) {
        playBtn.style.display = 'inline-flex';
        playBtn.dataset.state = 'ready';
        playBtn.dataset.audioUrl = fileInfo.filepath;
        setButtonState(playBtn, 'ready');
    }
    
    // Показываем кнопку сохранения, когда файл создан/выбран
    if (saveBtn) {
        saveBtn.style.display = 'inline-flex';
    }
}

/**
 * Сохранить аудио файл на диск
 */
async function saveAudioFileToDisk() {
    const currentFile = window.createdAudioFileName;
    const currentFilePath = window.createdAudioFilePath;
    
    if (!currentFile || !currentFilePath) {
        alert('Выберите файл для сохранения');
        return;
    }
    
    try {
        // Скачиваем файл
        const response = await fetch(currentFilePath);
        if (!response.ok) {
            throw new Error('Не удалось загрузить файл');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error('❌ Ошибка при сохранении файла:', error);
        alert('Ошибка при сохранении файла: ' + error.message);
    }
}

/**
 * Парсить паттерн аудио на элементы
 * Например: "op" -> ["o", "p"], "op_o" -> ["o", "p_o"], "tp_mm" -> ["t", "p", "m", "m"]
 */
function parseAudioPattern(pattern) {
    const elements = [];
    let i = 0;
    
    while (i < pattern.length) {
        // Проверяем паузу с длиной файла (p_o, p_t, p_a, p_f, p_m)
        if (pattern[i] === 'p' && i + 2 < pattern.length && pattern[i + 1] === '_') {
            const pauseType = pattern[i + 2];
            if (['o', 't', 'a', 'f', 'm'].includes(pauseType)) {
                elements.push(`p_${pauseType}`);
                i += 3;
                continue;
            }
        }
        
        // Обычный символ (o, t, a, f, m, p)
        if (['o', 't', 'a', 'f', 'm', 'p'].includes(pattern[i])) {
            elements.push(pattern[i]);
            i++;
        } else {
            // Пропускаем неизвестные символы
            i++;
        }
    }
    
    return elements;
}

/**
 * Получить информацию об аудио файле для элемента паттерна
 * @param {string} element - элемент паттерна (o, t, a, f, m, p, p_o, p_t, и т.д.)
 * @param {Object} originalSentence - предложение оригинала
 * @param {Object|null} translationSentence - предложение перевода
 * @returns {Object|null} - информация об аудио файле или паузе
 */
function getAudioFileForPattern(element, originalSentence, translationSentence) {
    const language_original = currentDictation.language_original;
    const language_translation = currentDictation.language_translation;
    
    // Пауза 1 секунда
    if (element === 'p') {
        return {
            type: 'pause',
            duration: 1.0
        };
    }
    
    // Пауза длиной в файл
    if (element.startsWith('p_')) {
        const pauseType = element.substring(2); // o, t, a, f, m
        const referenceFile = getReferenceAudioFile(pauseType, originalSentence, translationSentence);
        
        return {
            type: 'pause_file',
            duration_file: referenceFile ? referenceFile.filename : null,
            language: referenceFile ? referenceFile.language : language_original,
            fallback_duration: 1.0 // Если файл не найден, используем 1 секунду
        };
    }
    
    // Аудио файлы
    let filename = null;
    let language = language_original;
    let fieldName = null;
    
    switch (element) {
        case 'o': // оригинал
            filename = originalSentence?.audio;
            language = language_original;
            fieldName = 'audio';
            break;
        case 't': // перевод
            filename = translationSentence?.audio || originalSentence?.audio; // fallback на оригинал
            language = translationSentence ? language_translation : language_original;
            fieldName = 'audio';
            break;
        case 'a': // автоматическое
            filename = originalSentence?.audio_avto;
            language = language_original;
            fieldName = 'audio_avto';
            break;
        case 'f': // вырезанное из файла
            filename = originalSentence?.audio_user;
            language = language_original;
            fieldName = 'audio_user';
            break;
        case 'm': // микрофон
            filename = originalSentence?.audio_mic;
            language = language_original;
            fieldName = 'audio_mic';
            break;
    }
    
    // Если файл не найден, используем fallback на оригинал
    if (!filename && element !== 'o') {
        filename = originalSentence?.audio;
        language = language_original;
        fieldName = 'audio';
    }
    
    if (!filename) {
        return null;
    }
    
    return {
        type: 'file',
        filename: filename,
        language: language,
        sentence_key: originalSentence.key
    };
}

/**
 * Получить файл для определения длины паузы
 */
function getReferenceAudioFile(pauseType, originalSentence, translationSentence) {
    switch (pauseType) {
        case 'o': // оригинал
            return originalSentence?.audio ? {
                filename: originalSentence.audio,
                language: currentDictation.language_original
            } : null;
        case 't': // перевод
            return translationSentence?.audio ? {
                filename: translationSentence.audio,
                language: currentDictation.language_translation
            } : (originalSentence?.audio ? {
                filename: originalSentence.audio,
                language: currentDictation.language_original
            } : null);
        case 'a': // автоматическое
            return originalSentence?.audio_avto ? {
                filename: originalSentence.audio_avto,
                language: currentDictation.language_original
            } : null;
        case 'f': // вырезанное из файла
            return originalSentence?.audio_user ? {
                filename: originalSentence.audio_user,
                language: currentDictation.language_original
            } : null;
        case 'm': // микрофон
            return originalSentence?.audio_mic ? {
                filename: originalSentence.audio_mic,
                language: currentDictation.language_original
            } : null;
        default:
            return null;
    }
}

/**
 * Обновить состояние чекбокса "Выбрать все" на основе состояния всех чекбоксов строк
 */
function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectAllCheckboxLabel = document.getElementById('selectAllCheckboxLabel');
    
    if (!selectAllCheckbox || !selectAllCheckboxLabel) return;
    
    // Получаем все предложения и проверяем их checked
    const allSentences = workingData.original.sentences || [];
    const checkedCount = allSentences.filter(s => s.checked === true).length;
    
    if (allSentences.length === 0) {
        selectAllCheckbox.checked = false;
    } else {
        selectAllCheckbox.checked = (checkedCount === allSentences.length);
    }
    
    const checkboxIcon = selectAllCheckboxLabel.querySelector('.checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', selectAllCheckbox.checked ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/**
 * Применяет вид таблицы в зависимости от выбранной вкладки
 * general: оригинал + перевод
 * audio: оригинал + панель редактирования (по текущему радио)
 * dialog: как general (таблица без панели редактирования)
 */
function applyTableViewForTab(tabName) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    currentTabName = tabName;

    if (tabName === 'audio') {
        // Открываем режим редактирования
        toggleColumnGroup('original');
        // Учитываем текущее радио для показа правых колонок
        let checked = document.querySelector('input[name="audioMode"]:checked');
        if (!checked) {
            // Если ни одно радио не выбрано (первый заход), выбираем "full" и запускаем обработчик
            const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
            if (fullRadio) {
                fullRadio.checked = true;
                if (typeof handleAudioModeChange === 'function') {
                    handleAudioModeChange({ target: fullRadio });
                }
                checked = fullRadio;
            }
        }

        if (checked) {
            updateTableColumnsVisibility(checked.value);
        }

        // Обновляем текущее аудио и волну (важно при первом входе)
        if (typeof updateCurrentAudioWave === 'function') {
            updateCurrentAudioWave();
        }

        // Устанавливаем регион в зависимости от режима
        const mode = checked ? checked.value : 'full';
        if (mode === 'full') {
            if (typeof setRegionToFullShared === 'function') setRegionToFullShared();
        } else if (mode === 'sentence') {
            if (typeof setRegionToSelectedSentence === 'function') setRegionToSelectedSentence();
        }
        
        // Скрываем колонку чекбоксов на вкладке "Настройка аудио"
        toggleCheckboxColumn(false);
        
    } else if (tabName === 'create-audio') {
        // На вкладке "Создание аудио" показываем оригинал + перевод + специальные колонки
        // Не используем toggleColumnGroup, так как он скрывает перевод
        // Вручную показываем нужные колонки
        const table = document.getElementById('sentences-table');
        if (table) {
            table.classList.remove('state-original-translation', 'state-original-editing');
            // Показываем оригинал
            const originalHeaders = document.querySelectorAll('th.panel-original');
            const originalCells = document.querySelectorAll('td.panel-original');
            originalHeaders.forEach(th => th.style.display = 'table-cell');
            originalCells.forEach(td => td.style.display = 'table-cell');
            
            // Показываем перевод (текст)
            const translationTextHeaders = document.querySelectorAll('th.col-translation');
            const translationTextCells = document.querySelectorAll('td.col-translation');
            translationTextHeaders.forEach(th => th.style.display = 'table-cell');
            translationTextCells.forEach(td => td.style.display = 'table-cell');
        }
        
        // Показываем колонку чекбоксов
        toggleCheckboxColumn(true);
        // Показываем колонки аудио для вкладки "Создание аудио"
        toggleCreateAudioColumns(true);
    } else {
        // Общие данные и Диалог — показываем оригинал + перевод
        toggleColumnGroup('translation');
        // Скрываем колонку чекбоксов
        toggleCheckboxColumn(false);
        // Скрываем колонки для вкладки "Создание аудио"
        toggleCreateAudioColumns(false);
    }

    // Показываем колонку спикера во всех вкладках, если это диалог
    const showSpeaker = (currentDictation.is_dialog || false);
    const speakerHeader = document.querySelector('th.col-speaker');
    if (speakerHeader) {
        speakerHeader.style.display = showSpeaker ? 'table-cell' : 'none';
    }
    const speakerCells = document.querySelectorAll('td.col-speaker');
    speakerCells.forEach(td => { td.style.display = showSpeaker ? 'table-cell' : 'none'; });

    updateExplanationColumnVisibility();
}

/**
 * Переключить видимость колонки с чекбоксами
 */
function toggleCheckboxColumn(show) {
    const header = document.querySelector('th.col-checkbox-create-audio');
    const cells = document.querySelectorAll('td.col-checkbox-create-audio');
    
    if (header) {
        header.style.display = show ? 'table-cell' : 'none';
    }
    
    cells.forEach(cell => {
        cell.style.display = show ? 'table-cell' : 'none';
        
        // При показе колонки обновляем иконку чекбокса на основе данных
        if (show) {
            const btn = cell.querySelector('.checkbox-btn');
            if (btn) {
                const key = btn.dataset.key;
                if (key) {
                    const sentence = workingData.original.sentences.find(s => s.key === key);
                    if (sentence) {
                        const isChecked = sentence.checked === true;
                        const icon = btn.querySelector('.checkbox-icon');
                        if (icon) {
                            icon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                        }
                    }
                }
            }
        }
    });
    
    // Перерисовываем иконки Lucide для чекбоксов
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Переключить видимость колонок для вкладки "Создание аудио"
 */
function toggleCreateAudioColumns(show) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    const setDisplay = (el, value) => {
        if (value === null) {
            el.style.display = '';
        } else {
            el.style.display = value;
        }
    };

    // Находим все заголовки и ячейки с классом panel-create-audio
    const headers = table.querySelectorAll('th.panel-create-audio');
    const cells = table.querySelectorAll('td.panel-create-audio');

    headers.forEach(th => {
        if (show) {
            setDisplay(th, 'table-cell');
        } else {
            setDisplay(th, null);
        }
    });

    cells.forEach(td => {
        if (show) {
            setDisplay(td, 'table-cell');
        } else {
            setDisplay(td, null);
        }
    });

    // Управляем колонками перевода (текст)
    const translationHeaders = table.querySelectorAll('th.panel-translation');
    const translationCells = table.querySelectorAll('td.panel-translation');

    translationHeaders.forEach(th => {
        const isCreateAudioColumn = th.classList.contains('panel-create-audio') || th.classList.contains('col-translation');
        if (show && isCreateAudioColumn) {
            setDisplay(th, 'table-cell');
        } else if (!show) {
            setDisplay(th, null);
        }
    });

    translationCells.forEach(td => {
        const isCreateAudioColumn = td.classList.contains('panel-create-audio') || td.classList.contains('col-translation');
        if (show && isCreateAudioColumn) {
            setDisplay(td, 'table-cell');
        } else if (!show) {
            setDisplay(td, null);
        }
    });

    // Прячем прочие колонки редактирования, если они не относятся к "Создание аудио"
    const editingColumns = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');
    editingColumns.forEach(col => {
        if (show) {
            if (!col.classList.contains('panel-create-audio')) {
                col.dataset.prevDisplay = col.style.display || '';
                setDisplay(col, 'none');
            } else {
                setDisplay(col, 'table-cell');
            }
        } else {
            if (col.classList.contains('panel-create-audio')) {
                setDisplay(col, null);
            } else if ('prevDisplay' in col.dataset) {
                setDisplay(col, col.dataset.prevDisplay || null);
                delete col.dataset.prevDisplay;
            } else {
                setDisplay(col, null);
            }
        }
    });
}

/**
 * Настройка обработчиков для таблицы спикеров во вкладке
 */
function setupTabSpeakersHandlers() {
    const tabAddSpeakerBtn = document.getElementById('tabAddSpeakerBtn');
    const tabSpeakersTableContent = document.getElementById('tabSpeakersTableContent');

    if (tabAddSpeakerBtn && tabSpeakersTableContent) {
        tabAddSpeakerBtn.addEventListener('click', () => {
            addSpeakerToTabTable();
            syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
            setDirtyFlags({ db: true });
        });

        // Обработчики для кнопок удаления спикеров
        tabSpeakersTableContent.addEventListener('click', (e) => {
            if (e.target.closest('.remove-speaker')) {
                const btn = e.target.closest('.remove-speaker');
                removeSpeakerFromTabTable(btn);
                syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
                setDirtyFlags({ db: true });
            }
        });

        // Обработчики для изменения имен спикеров
        tabSpeakersTableContent.addEventListener('input', (e) => {
            if (e.target.classList.contains('speaker-name')) {
                syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
                setDirtyFlags({ db: true });
            }
        });
    }
}

/**
 * Добавить спикера в таблицу во вкладке
 */
function addSpeakerToTabTable() {
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (!tbody) return;

    const speakerCount = tbody.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${speakerCount}:</td>
        <td><input type="text" class="speaker-name" value="Спикер ${speakerCount}" placeholder="Имя спикера"></td>
        <td>
            <button type="button" class="remove-speaker" title="Удалить спикера">
                <i data-lucide="trash-2"></i>
            </button>
        </td>
    `;
    tbody.appendChild(row);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Удалить спикера из таблицы во вкладке
 */
function removeSpeakerFromTabTable(button) {
    const row = button.closest('tr');
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    
    if (row && tbody && tbody.children.length > 1) {
        row.remove();
        // Перенумеровываем спикеров
        Array.from(tbody.children).forEach((tr, index) => {
            tr.querySelector('td:first-child').textContent = `${index + 1}:`;
        });
    }
}

/**
 * Обновить путь к диктанту во вкладке (путь в дереве категорий)
 */
function updateDictationPathDisplay() {
    const pathText = document.getElementById('dictationPathText');
    if (!pathText) return;

    // Показываем путь в дереве категорий
    const path = currentDictation.category_path || 'Не выбран';
    pathText.textContent = path;
}

/**
 * Синхронизировать данные спикеров из вкладки в currentDictation
 */
function syncSpeakersFromTab() {
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (!tbody) return;

    const speakers = {};
    tbody.querySelectorAll('tr').forEach((row, index) => {
        const speakerNameInput = row.querySelector('.speaker-name');
        if (speakerNameInput && speakerNameInput.value.trim()) {
            speakers[String(index + 1)] = speakerNameInput.value.trim();
        }
    });

    currentDictation.speakers = speakers;
    return speakers;
}

/**
 * Обновить вкладку диалога данными из currentDictation
 */
function updateDialogTab() {
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    const tabSpeakersTable = document.getElementById('tabSpeakersTable');
    const tabSpeakersTableContent = document.getElementById('tabSpeakersTableContent');

    if (!tabIsDialogCheckbox) return;

    // Устанавливаем чекбокс
    tabIsDialogCheckbox.checked = currentDictation.is_dialog || false;

    // Обновляем иконку чекбокса
    const checkboxIcon = document.querySelector('#tabDialogCheckboxLabel .checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', tabIsDialogCheckbox.checked ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Показываем/скрываем таблицу спикеров
    if (tabSpeakersTable) {
        tabSpeakersTable.style.display = tabIsDialogCheckbox.checked ? 'block' : 'none';
    }

    // Заполняем таблицу спикеров
    if (tabSpeakersTableContent && currentDictation.speakers) {
        const tbody = tabSpeakersTableContent.querySelector('tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const speakerEntries = Object.entries(currentDictation.speakers);

            // Больше НЕ добавляем дефолтные имена «Спикер 1/2» — пользователь сам вводит имена спикеров
            speakerEntries.forEach(([id, name]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${id}:</td>
                    <td><input type="text" class="speaker-name" value="${name}" placeholder="Имя спикера"></td>
                    <td>
                        <button type="button" class="remove-speaker" title="Удалить спикера">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }
}
// ============================================================================
// ФУНКЦИИ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ВИДИМОСТИ КОЛОНОК
// ============================================================================

/**
 * Настройка обработчиков для переключения видимости колонок
 */
function setupColumnToggleHandlers() {
    // Кнопка и колонка переключения удалены — переключение делаем через вкладки
}

/**
 * Переключить состояние редактора между original-translation и original-editing
 * @param {string} group - 'original' или 'translation'
 */
function toggleColumnGroup(group) {
    const table = document.getElementById('sentences-table');
    if (!table) {
        console.warn('❌ Таблица sentences-table не найдена');
        return;
    }
    // Удаляем все классы состояний
    table.classList.remove('state-original-translation', 'state-original-editing');

    if (group === 'original') {
        // Переключаем в состояние original-editing (оригинал + правая панель редактирования аудио)
        table.classList.add('state-original-editing');
        // Обновляем иконку кнопки
        // updateToggleButtonIcon('open_left_panel_original', 'original');

        // Устанавливаем режим "отображать весь файл" при первом открытии
        const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
        if (fullRadio && !fullRadio.checked) {
            fullRadio.checked = true;
            // Инициируем обработчик изменения режима
            handleAudioModeChange({ target: fullRadio });
        }
    } else if (group === 'translation') {
        // Переключаем в состояние original-translation (оригинал + перевод)
        table.classList.add('state-original-translation');
        // Обновляем иконку кнопки
        // updateToggleButtonIcon('open_left_panel_original', 'translation');
    }

}

/**
 * Обновить иконку кнопки переключения на основе текущего состояния таблицы
 * @param {string} buttonId - ID кнопки
 * @param {string} state - текущее состояние ('original' или 'translation')
 */
function updateToggleButtonIcon(buttonId, state) {
    const button = document.getElementById(buttonId);

    if (button) {
        if (state === 'original') {
            // В состоянии original-editing показываем иконку "закрыть панель"
            button.innerHTML = `<i data-lucide="panel-left-close"></i>`;
        } else if (state === 'translation') {
            // В состоянии original-translation показываем иконку "открыть панель"
            button.innerHTML = `<i data-lucide="panel-left-open"></i>`;
        }

        // Перерисовываем иконку Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            console.warn('⚠️ Lucide не найден');
        }
    } else {
        console.error('❌ Кнопка не найдена:', buttonId);
    }
}

// ============================================================================
// ОБРАБОТЧИКИ БОКОВОЙ ПАНЕЛИ НАСТРОЕК АУДИО
// ============================================================================

/**
 * Настройка обработчиков для боковой панели настроек аудио
 */
function setupAudioSettingsModalHandlers() {
    // Обработчики радио кнопок для режима аудио
    const radioButtons = document.querySelectorAll('input[name="audioMode"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', handleAudioModeChange);
    });

    // Инициализация обработчика выбора файлов
    setupFileInputHandler();

    // Инициализация кнопки выбора файла
    initSelectFileBtn();

    // Инициализация обработчиков полей под волной
    setupWaveformFieldsHandlers();

    const audioPlayBtn = document.getElementById('audioPlayBtn');
    if (audioPlayBtn) {
        if (!audioPlayBtn.dataset.audioPlaybackHandlerInstalled) {
            audioPlayBtn.addEventListener('click', handleAudioPlayback);
            audioPlayBtn.dataset.audioPlaybackHandlerInstalled = 'true';
        }
    }

    const audioStartBtn = document.getElementById('audioStartBtn');
    if (audioStartBtn) {
        audioStartBtn.addEventListener('click', handleAudioStart);
    }
    const audioEndBtn = document.getElementById('audioEndBtn');
    if (audioEndBtn) {
        audioEndBtn.addEventListener('click', handleAudioEnd);
    }

    // Кнопка с ножницами
    const scissorsBtn = document.getElementById('scissorsBtn');
    if (scissorsBtn) {
        scissorsBtn.addEventListener('click', () => {
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            switch (currentMode) {
                case 'full':
                    handleScissorsFullMode();
                    break;
                case 'sentence':
                    break;
                case 'mic':
                    handleScissorsFullMode();
                    break;
                case 'auto':
                    break;
            }
        });
    }

    // Кнопка "Разрезать аудио на 1000 кусков"
    const audioTableActionBtn = document.getElementById('audioTableActionBtn');
    if (audioTableActionBtn) {
        audioTableActionBtn.addEventListener('click', () => {
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';
            switch (currentMode) {
                case 'full':
                    splitAudioIntoSentences();
                    break;
                case 'sentence':
                    break;
                case 'mic':
                    handleMicRecordMode();
                    break;
                case 'auto':
                    break;
            }
        });
    }
}

/**
 * Настройка обработчиков для кнопок управления таблицей
 */
function setupTableControlsHandlers() {
    // Кнопка предыдущей строки
    const prevRowBtn = document.getElementById('prevRowBtn');
    if (prevRowBtn) {
        prevRowBtn.addEventListener('click', () => {
            navigateToPreviousRow();
        });
    }

    // Кнопка следующей строки
    const nextRowBtn = document.getElementById('nextRowBtn');
    if (nextRowBtn) {
        nextRowBtn.addEventListener('click', () => {
            navigateToNextRow();
        });
    }

    // Кнопка добавления строки
    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            showAddRowDialog();
        });
    }

    // Кнопка удаления строки
    const deleteRowBtn = document.getElementById('deleteRowBtn');
    if (deleteRowBtn) {
        deleteRowBtn.addEventListener('click', () => {
            showDeleteRowDialog();
        });
    }

    const rowNumberSpan = document.getElementById('currentRowNumber');
    if (rowNumberSpan) {
        rowNumberSpan.contentEditable = true;
        rowNumberSpan.setAttribute('inputmode', 'numeric');
        rowNumberSpan.setAttribute('title', 'Введите номер строки и нажмите Enter');
        rowNumberSpan.setAttribute('aria-label', 'Номер текущей строки');

        const applyRowNumberInput = () => {
            const rows = Array.from(document.querySelectorAll('#sentences-table tbody tr'));
            if (!rows.length) {
                rowNumberSpan.textContent = '1';
                return;
            }

            const rawValue = rowNumberSpan.textContent.replace(/[^\d]/g, '');
            let targetNumber = parseInt(rawValue, 10);

            if (isNaN(targetNumber)) {
                updateCurrentRowNumber();
                return;
            }

            if (targetNumber < 1) targetNumber = 1;
            if (targetNumber > rows.length) targetNumber = rows.length;

            const targetRow = rows[targetNumber - 1];
            if (targetRow) {
                selectSentenceRow(targetRow);
            } else {
                updateCurrentRowNumber();
            }
        };

        rowNumberSpan.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                rowNumberSpan.blur();
                return;
            }

            const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
            if (!/^\d$/.test(event.key) && !allowedKeys.includes(event.key)) {
                event.preventDefault();
            }
        });

        rowNumberSpan.addEventListener('blur', applyRowNumberInput);
    }

    // Инициализация номера текущей строки
    updateCurrentRowNumber();
}

/**
 * Навигация к предыдущей строке
 */
function navigateToPreviousRow() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const prevRow = currentRow.previousElementSibling;
    if (prevRow) {
        selectSentenceRow(prevRow);
    } else {
    }
}

/**
 * Навигация к следующей строке
 */
function navigateToNextRow() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const nextRow = currentRow.nextElementSibling;
    if (nextRow) {
        selectSentenceRow(nextRow);
    } else {
    }
}

/**
 * Обновление номера текущей строки в лейбле
 */
function updateCurrentRowNumber() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    const rowNumberSpan = document.getElementById('currentRowNumber');

    if (currentRow && rowNumberSpan) {
        const rowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
        rowNumberSpan.textContent = rowNumber;
    }
}

/**
 * Показать модальное окно добавления строки
 */
function showAddRowDialog() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для добавления новой строки');
        return;
    }

    const currentRowNumber = currentRow.querySelector('.col-number')?.textContent || '1';

    // Обновляем номера в модальном окне
    document.getElementById('addRowCurrentNumber').textContent = currentRowNumber;
    document.getElementById('addRowAboveNumber').textContent = currentRowNumber;
    document.getElementById('addRowBelowNumber').textContent = currentRowNumber;

    // Сохраняем ссылку на текущую строку для использования в модальном окне
    window.currentRowForAdd = currentRow;

    // Показываем модальное окно
    document.getElementById('addRowModal').style.display = 'flex';
}

/**
 * Закрыть модальное окно добавления строки
 */
function closeAddRowModal() {
    document.getElementById('addRowModal').style.display = 'none';
    window.currentRowForAdd = null;
}

/**
 * Подтвердить добавление строки
 */
function confirmAddRow(position) {
    if (window.currentRowForAdd) {
        addNewRow(window.currentRowForAdd, position);
        closeAddRowModal();
    } else {
        console.error('❌ window.currentRowForAdd не установлена!');
        alert('Ошибка: не выбрана строка для добавления');
    }
}

/**
 * Показать модальное окно удаления строки
 */
function showDeleteRowDialog() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для удаления');
        return;
    }

    const currentRowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
    const currentKey = currentRow.dataset.key;

    // Обновляем данные в модальном окне
    document.getElementById('deleteRowNumber').textContent = currentRowNumber;
    document.getElementById('deleteRowKey').textContent = currentKey;

    // Сохраняем ссылку на текущую строку для использования в модальном окне
    window.currentRowForDelete = currentRow;

    // Показываем модальное окно
    document.getElementById('deleteRowModal').style.display = 'flex';
}

/**
 * Закрыть модальное окно удаления строки
 */
function closeDeleteRowModal() {
    document.getElementById('deleteRowModal').style.display = 'none';
    window.currentRowForDelete = null;
}

/**
 * Подтвердить удаление строки
 */
function confirmDeleteRow() {
    if (window.currentRowForDelete) {
        deleteRow(window.currentRowForDelete);
        closeDeleteRowModal();
    }
}

/**
 * Добавить новую строку
 */
function addNewRow(referenceRow, position) {
    // Генерируем новый ключ с префиксом 't_'
    const newKey = generateNewTableKey();

    // Сначала создаем данные в workingData
    let originalSentence = null;
    let translationSentence = null;

    if (workingData && workingData.original) {
        originalSentence = {
            key: newKey,
            speaker: '1',
            text: '',
            audio: '',
            audio_avto: '',
            audio_user: '',
            audio_mic: '',
            start: 0,
            end: 0,
            chain: false,
            checked: false
        };
        workingData.original.sentences.push(originalSentence);
    }

    const trBucket = getCurrentTranslationData({ createIfMissing: false });
    if (trBucket) {
        translationSentence = {
            key: newKey,
            text: '',
            audio: '',
            audio_avto: '',
            audio_user: '',
            audio_mic: '',
            start: 0,
            end: 0,
            chain: false
        };
        trBucket.sentences.push(translationSentence);
    }

    // Теперь создаем DOM-элемент с данными
    const newRow = createTableRow(newKey, originalSentence, translationSentence);

    // Вставляем в нужное место
    const tbody = document.querySelector('#sentences-table tbody');
    if (tbody) {
        if (position === 'above') {
            tbody.insertBefore(newRow, referenceRow);
        } else {
            tbody.insertBefore(newRow, referenceRow.nextSibling);
        }

        // Обновляем нумерацию строк и позиции в workingData
        recomputeSentencePositionsFromDom();

        // Пересоздаем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Выделяем новую строку
    selectSentenceRow(newRow);

    try {
        setDirtyFlags({ db: true });
    } catch (e) {
    }
}

/**
 * Удалить строку
 */
function deleteRow(rowToDelete) {
    const deletedKey = rowToDelete && rowToDelete.dataset ? rowToDelete.dataset.key : null;

    // Удаляем строку из workingData, иначе при сохранении она вернётся обратно
    // (saveDictationOnly отправляет workingData на сервер; сервер удаляет только те ключи,
    // которых нет в payload).
    if (deletedKey) {
        try {
            if (workingData && workingData.original && Array.isArray(workingData.original.sentences)) {
                workingData.original.sentences = workingData.original.sentences.filter(s => s && s.key !== deletedKey);
            }
            const trBucket = getCurrentTranslationData({ createIfMissing: false });
            if (trBucket && Array.isArray(trBucket.sentences)) {
                trBucket.sentences = trBucket.sentences.filter(s => s && s.key !== deletedKey);
            }
        } catch (e) {
        }
    }

    // Удаляем строку из DOM
    rowToDelete.remove();

    // Обновляем нумерацию и позиции
    recomputeSentencePositionsFromDom();

    // Выделяем следующую строку или предыдущую
    const nextRow = rowToDelete.nextElementSibling;
    const prevRow = rowToDelete.previousElementSibling;

    if (nextRow) {
        selectSentenceRow(nextRow);
    } else if (prevRow) {
        selectSentenceRow(prevRow);
    }

    try {
        setDirtyFlags({ db: true });
    } catch (e) {
    }
}

/**
 * Генерировать новый ключ для табличной строки
 */
function generateNewTableKey() {
    // Находим максимальный номер среди табличных ключей
    const tableRows = document.querySelectorAll('#sentences-table tbody tr[data-key^="t_"]');
    let maxNumber = 0;

    tableRows.forEach(row => {
        const key = row.dataset.key;
        const match = key.match(/^t_(\d+)$/);
        if (match) {
            const number = parseInt(match[1]);
            if (number > maxNumber) {
                maxNumber = number;
            }
        }
    });

    return `t_${String(maxNumber + 1).padStart(3, '0')}`;
}

/**
 * Обновить нумерацию строк в таблице
 */
function updateTableRowNumbers() {
    recomputeSentencePositionsFromDom();
}

/**
 * Управление видимостью и функциональностью кнопок ножниц в зависимости от режима аудио
 */
function initSelectFileBtn() {

    // Кнопка выбора файла
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', (event) => {
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            handleSelectFile(currentMode);
        });
    } else {
        console.error('❌ Кнопка selectFileBtn НЕ НАЙДЕНА!');
    }

}

/**
 * Управление видимостью волны в режиме микрофона
 */
function updateWaveformVisibilityForMicMode() {
    const waveformContainer = document.getElementById('audioWaveform');
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');

    if (!waveformContainer || !currentRow) return;

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (sentence && sentence.audio_mic) {
        // Есть записанное аудио - загружаем и показываем волну
        // Загружаем из текущего источника (B2 proxy для сохранённых диктантов)
        let audioPath = buildDictationAudioUrl(currentDictation && currentDictation.id, currentDictation.language_original, sentence.audio_mic);

        // Загружаем аудио в волну
        loadAudioIntoWaveform(audioPath).then(() => {
            if (window.waveformCanvas) {
                window.waveformCanvas.show();
            }
        }).catch(error => {
            console.error('❌ Ошибка загрузки аудио в волну:', error);
            throw error;
        }).catch(error => {
            console.error('❌ Ошибка загрузки аудио в волну:', error);
            if (window.waveformCanvas) {
                window.waveformCanvas.hide();
            }
        });
    } else {
        // Нет записанного аудио - скрываем волну
        if (window.waveformCanvas) {
            window.waveformCanvas.hide();
        }
    }
}

/**
 * Обновить информацию о текущем аудио для режима микрофона
 */
function updateCurrentAudioInfoForMicMode() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) return;

    // Обновляем информацию о текущем аудио
    const currentAudioInfoElement = document.getElementById('currentAudioInfo');
    if (currentAudioInfoElement) {
        if (sentence.audio_mic) {
            currentAudioInfoElement.textContent = `Аудио для волны: ${sentence.audio_mic}`;
        } else {
            currentAudioInfoElement.textContent = 'Аудио для волны: не выбрано';
        }
    }

    // Обновляем отображение волны для режима микрофона
    updateWaveformVisibilityForMicMode();
}

/**
 * Обновить состояние кнопки микрофона в таблице
 */
function updateMicButtonState(sentenceKey) {
    // Находим строку таблицы по ключу
    const row = document.querySelector(`tr[data-key="${sentenceKey}"]`);
    if (!row) {
        console.error('❌ Строка таблицы не найдена для ключа:', sentenceKey);
        return;
    }

    // Находим ячейку с кнопкой микрофона
    const micCell = row.querySelector('td[data-col_id="col-or-mic-play"]');
    if (!micCell) {
        console.error('❌ Ячейка микрофона не найдена для строки:', sentenceKey);
        return;
    }

    // Находим кнопку в ячейке
    const micButton = micCell.querySelector('.audio-btn');
    if (!micButton) {
        console.error('❌ Кнопка микрофона не найдена в ячейке:', sentenceKey);
        return;
    }

    // Обновляем состояние кнопки на 'ready' (показываем треугольник)
    setButtonState(micButton, 'ready');
}

/**
 * Загрузить аудио в волну
 */
async function loadAudioIntoWaveform(audioPath) {
    if (!window.waveformCanvas) {
        throw new Error('WaveformCanvas не инициализирован');
    }

    try {
        // Добавляем cache-busting, чтобы перерисовывать даже при том же имени файла
        const cacheBusted = `${audioPath}${audioPath.includes('?') ? '&' : '?'}ts=${Date.now()}`;
        await window.waveformCanvas.loadAudio(cacheBusted);

        // Устанавливаем регион на всю длительность
        const duration = window.waveformCanvas.getDuration();
        window.waveformCanvas.setRegion(0, duration);

    } catch (error) {
        console.error('❌ Ошибка загрузки аудио в волну:', error);
        throw error;
    }
}

/**
 * Управление видимостью элементов интерфейса в режиме микрофона
 */
function updateInterfaceForMicMode() {
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    // Показываем информацию о текущем предложении
    updateCurrentSentenceInfoForMicMode();

    // Управляем видимостью волны
    updateWaveformVisibilityForMicMode();
}

/**
 * Обработчик кнопки ножниц в режиме "Отображать весь файл"
 */
function handleScissorsFullMode() {
    const start = parseFloat(startInput.value) || 0;
    const end = parseFloat(endInput.value) || 0;

    if (start >= end) {
        alert('Время начала должно быть меньше времени окончания');
        return;
    }

    // Получаем текущий аудиофайл из режима "отображать весь файл"
    //const currentAudioFile = getCurrentAudioFileForScissors();
    if (!currentAudioFileName) {
        alert('Не выбран аудиофайл для обрезки');
        return;
    }

    // Вызываем функцию обрезки аудио
    trimAudioFile(currentAudioFileName, start, end);
}

/**
 * Обработчик кнопки ножниц в режиме "Микрофон"
 */
function handleScissorsMicMode() {
    console.log('✂️ Режим "Микрофон" - обрезание записанного аудио');

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для обрезания аудио');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    const currentAudioFile = sentence?.audio_mic;
    if (!currentAudioFile) {
        alert('Не выбран аудиофайл для обрезки');
        return;
    }


    // Вызываем функцию обрезки аудио
    trimAudioFile(currentAudioFile, start, end);

}

/**
 * Запись с микрофона для текущего предложения
 */
function handleMicRecordMode() {

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для записи');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) {
        alert('Предложение не найдено');
        return;
    }

    // Открываем модальное окно записи
    openMicRecordModal(sentence);
}

// Глобальные переменные для записи
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let currentRecordingSentence = null;

/**
 * Получить поддерживаемый mimeType для записи (копия с script_dictation.js)
 */
function getSupportedMimeType() {
    const types = [
        'audio/mp4; codecs="mp4a.40.2"', // AAC (лучший для Safari)
        'audio/webm; codecs=opus',        // Opus (для Chrome/Firefox)
        'audio/webm'                      // Fallback
    ];

    for (const type of types) {
        const supported = MediaRecorder.isTypeSupported(type);
    }

    const result = types.find(type => MediaRecorder.isTypeSupported(type)) || '';
    return result;
}

/**
 * Открыть модальное окно записи с микрофона
 */
function openMicRecordModal(sentence) {
    currentRecordingSentence = sentence;

    // Заполняем текст предложения
    const sentenceTextElement = document.getElementById('micRecordSentenceText');
    if (sentenceTextElement) {
        sentenceTextElement.textContent = sentence.text || 'Текст не найден';
    }

    // Сбрасываем состояние
    resetRecordingState();

    // Показываем модальное окно
    const modal = document.getElementById('micRecordModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.error('❌ Модальное окно micRecordModal не найдено!');
    }

    // Инициализируем обработчики событий
    setupMicRecordEventHandlers();
}

/**
 * Закрыть модальное окно записи с микрофона
 */
function closeMicRecordModal() {
    // Останавливаем запись если она идет
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }

    // Очищаем таймер
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }

    // Скрываем модальное окно
    const modal = document.getElementById('micRecordModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Сбрасываем состояние
    resetRecordingState();
    currentRecordingSentence = null;
}
/**
 * Сбросить состояние записи
 */
function resetRecordingState() {
    // Сбрасываем элементы интерфейса
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const playbackSection = document.getElementById('playbackSection');
    const saveBtn = document.getElementById('saveRecordBtn');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const recordingStatusText = document.getElementById('recordingStatusText');
    const recordingTimer = document.getElementById('recordingTimer');

    console.log('🔄 Сбрасываем состояние записи');

    if (startBtn) {
        startBtn.style.display = 'block';
    }
    if (stopBtn) {
        stopBtn.style.display = 'none';
        console.log('❌ Кнопка "Остановить" скрыта');
    }
    if (playbackSection) {
        playbackSection.style.display = 'none';
        console.log('❌ Секция воспроизведения скрыта');
    }
    if (saveBtn) {
        saveBtn.style.display = 'none';
        console.log('❌ Кнопка "Сохранить" скрыта');
    }
    if (recordingIndicator) recordingIndicator.classList.remove('recording');
    if (recordingStatusText) recordingStatusText.textContent = 'Готов к записи';
    if (recordingTimer) recordingTimer.textContent = '00:00';

    // Очищаем данные записи
    recordedChunks = [];
    recordingStartTime = null;
}

/**
 * Настроить обработчики событий для модального окна записи
 */
function setupMicRecordEventHandlers() {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const playBtn = document.getElementById('playRecordBtn');
    const rerecordBtn = document.getElementById('rerecordBtn');
    const saveBtn = document.getElementById('saveRecordBtn');

    if (startBtn) {
        startBtn.onclick = startRecording;
    }

    if (stopBtn) {
        stopBtn.onclick = stopRecording;
    }

    if (playBtn) {
        playBtn.onclick = playRecording;
    }

    if (rerecordBtn) {
        rerecordBtn.onclick = () => {
            resetRecordingState();
            startRecording();
        };
    }

    if (saveBtn) {
        saveBtn.onclick = saveRecording;
    }
}

/**
 * Начать запись с микрофона
 */
async function startRecording() {
    try {
        // Запрашиваем доступ к микрофону с настройками для качественной записи
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,    // Убираем эхо
                noiseSuppression: true,    // Подавляем шум
                autoGainControl: true,     // Автоматическая регулировка громкости
                sampleRate: 44100,        // Высокое качество записи
                channelCount: 1,           // Моно для экономии места
                latency: 0.01              // Минимальная задержка
            }
        });

        // Определяем поддерживаемый mimeType с отладкой
        const mimeType = getSupportedMimeType();

        // Создаем MediaRecorder точно как на рабочей странице диктанта
        const options = {
            mimeType: mimeType
        };

        mediaRecorder = new MediaRecorder(stream, options);

        recordedChunks = [];

        // Обработчик данных записи
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        // Обработчик завершения записи
        mediaRecorder.onstop = () => {
            // Останавливаем все треки потока
            stream.getTracks().forEach(track => track.stop());
            showPlaybackSection();
        };

        // Начинаем запись (без параметров для стабильности)
        mediaRecorder.start();
        recordingStartTime = Date.now();

        // Обновляем интерфейс
        updateRecordingUI(true);

        // Запускаем таймер
        startRecordingTimer();

    } catch (error) {
        console.error('❌ Ошибка при начале записи:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
}

/**
 * Остановить запись
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        updateRecordingUI(false);
        stopRecordingTimer();
    }
}

/**
 * Обновить интерфейс записи
 */
function updateRecordingUI(isRecording) {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const recordingStatusText = document.getElementById('recordingStatusText');

    if (isRecording) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (recordingIndicator) recordingIndicator.classList.add('recording');
        if (recordingStatusText) recordingStatusText.textContent = 'Запись...';
    } else {
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (recordingIndicator) recordingIndicator.classList.remove('recording');
        if (recordingStatusText) recordingStatusText.textContent = 'Запись завершена';
    }
}

/**
 * Запустить таймер записи
 */
function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        if (recordingStartTime) {
            const elapsed = Date.now() - recordingStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timerElement = document.getElementById('recordingTimer');
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }, 1000);
}

/**
 * Остановить таймер записи
 */
function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

/**
 * Показать секцию воспроизведения
 */
function showPlaybackSection() {
    const playbackSection = document.getElementById('playbackSection');
    const saveBtn = document.getElementById('saveRecordBtn');

    if (playbackSection) playbackSection.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'block';

    // Обновляем информацию о длительности
    updatePlaybackDuration();
}

/**
 * Обновить информацию о длительности записи
 */
function updatePlaybackDuration() {
    const durationElement = document.getElementById('playbackDuration');
    if (durationElement && recordingStartTime) {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        durationElement.textContent = `Длительность: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

/**
 * Воспроизвести записанное аудио
 */
function playRecording() {
    if (recordedChunks.length === 0) {
        alert('Нет записанного аудио для воспроизведения');
        return;
    }

    // Определяем тип файла на основе используемого mimeType (упрощенная логика как на странице диктанта)
    const blobType = mediaRecorder.mimeType?.includes('mp4')
        ? 'audio/mp4'
        : 'audio/webm';

    // Создаем blob из записанных данных
    const blob = new Blob(recordedChunks, { type: blobType });
    const audioUrl = URL.createObjectURL(blob);

    // Создаем и воспроизводим аудио элемент
    const audio = new Audio(audioUrl);
    audio.play();

    // Очищаем URL после воспроизведения
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
    };
}

/**
 * Сохранить запись
 */
async function saveRecording() {
    if (recordedChunks.length === 0) {
        alert('Нет записанного аудио для сохранения');
        return;
    }

    if (!currentRecordingSentence) {
        alert('Ошибка: не найдено предложение для сохранения');
        return;
    }

    try {
        // Определяем тип файла и расширение (используем оригинальный формат браузера)
        const blobType = mediaRecorder.mimeType?.includes('mp4')
            ? 'audio/mp4'
            : 'audio/webm';

        const fileExtension = mediaRecorder.mimeType?.includes('mp4') ? 'mp4' : 'webm';

        // Создаем blob из записанных данных
        const blob = new Blob(recordedChunks, { type: blobType });

        // Создаем FormData для отправки на сервер
        const formData = new FormData();
        formData.append('audio', blob, `${currentRecordingSentence.key}_en_mic.${fileExtension}`);
        formData.append('dictation_id', currentDictation.id);
        formData.append('language', currentDictation.language_original);

        // Показываем индикатор загрузки
        showLoadingIndicator();

        // Отправляем на сервер
        const response = await fetch('/upload_mic_audio', {
            method: 'POST',
            body: formData
        });

        console.log('📤 Ответ сервера:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        hideLoadingIndicator();

        if (data.success) {
            // Обновляем данные предложения
            currentRecordingSentence.audio_mic = data.filename;

            // Обновляем состояние кнопки микрофона в таблице
            updateMicButtonState(currentRecordingSentence.key);

            // Обновляем отображение
            updateCurrentAudioInfoForMicMode();

            // Отмечаем что диктант изменен
            currentDictation.isSaved = false;
            setDirtyFlags({ audio: true });

            // Закрываем модальное окно
            closeMicRecordModal();

            alert('Запись успешно сохранена!');

        } else {
            console.error('❌ Ошибка при сохранении записи:', data.error);
            alert('Ошибка при сохранении записи: ' + data.error);
        }

    } catch (error) {
        hideLoadingIndicator();
        console.error('❌ Ошибка при сохранении записи:', error);
        alert('Ошибка при сохранении записи: ' + error.message);
    }
}

/**
 * Выбор файла для текущего предложения (режим микрофона)
 */
function handleSelectFileForSentence() {
    console.log('📁 Выбор файла для текущего предложения');

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для загрузки файла');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) {
        alert('Предложение не найдено');
        return;
    }

    // Создаем input для выбора файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Загружаем файл для текущего предложения
            await uploadFileForSentence(file, sentence, key);
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            alert('Ошибка загрузки файла');
        }

        // Удаляем input после использования
        document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

/**
 * Выбор общего файла (другие режимы)
 */
function handleSelectFile(currentMode) {
    console.log('📁 handleSelectFile вызвана, режим:', currentMode);

    // Создаем input для выбора файла
    console.log('📁 Создаем input элемент...');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';
    console.log('📁 Input элемент создан:', fileInput);

    fileInput.addEventListener('change', (event) => {
        console.log('📁 Событие change сработало!');
        console.log('📁 Файл выбран:', event.target.files[0]?.name);
        const file = event.target.files[0];
        if (!file) {
            console.log('❌ Файл не выбран');
            return;
        }

        console.log('📁 Начинаем загрузку файла:', file.name);
        // Используем существующую функцию загрузки
        uploadAudioFile(file, currentMode);

        // Удаляем input после использования
        console.log('📁 Удаляем input элемент');
        document.body.removeChild(fileInput);
    });

    console.log('📁 Добавляем input в DOM...');
    document.body.appendChild(fileInput);
    console.log('📁 Input добавлен в DOM, запускаем click()...');

    try {
        fileInput.click();
    } catch (error) {
        console.error('❌ Ошибка при fileInput.click():', error);
    }
}


/**
 * Обработчик изменения режима аудио (радио кнопки)
 *  'block'- нав всю ширину
 * 'none'- скрыть
 * 'inline'- в строку
 * 'flex'- в строку
 * 'grid'- в сетку
 * 'table'- в таблицу
 * 'list'- в список
 * 'inline-block'- в строку
 * 'inline-flex'- в строку
 * 'inline-grid'- в сетку
 * 'inline-table'- в таблицу
 * 'inline-block-flex'- в строку
 * 'inline-block-grid'- в сетку
 * 'inline-block-table'- в таблицу
 * 'inline-block-inline-flex'- в строку
 * 'inline-block-inline-grid'- в сетку
 */
function handleAudioModeChange(event) {
    const selectedMode = event.target.value;
    // Меняем режим во время проигрывания: останавливаем текущее аудио и сбрасываем кнопку
     if (typeof audioManager !== 'undefined' && audioManager) {
        audioManager.stop();
    }
    const audioTableActionBtn = document.getElementById('audioTableActionBtn');

    let modeConfig = {};
    switch (selectedMode) {
        case 'full':
            // Режим "Отображать весь файл"
            console.log('Режим "Отображать весь файл":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'visible',
                currentSentenceInfo: 'hidden',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'visible', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };

            // Обновляем кнопку "1000 кусков"
            audioTableActionBtn.innerHTML = '<i data-lucide="scissors"></i><span>на 1000 кусков</span>';
            audioTableActionBtn.title = 'Разрезать на 1000 частей';

            break;
        case 'sentence':
            // Режим "Текущее предложение" - скрыта
            console.log('Режим "Текущее предложение":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'hidden',
                currentSentenceInfo: 'visible',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'hidden', // кнопка ножниц
                audioTableActionBtn: 'hidden' // дополнительные процедуры над аудио
            };

            break;
        case 'mic':
            // Режим "Микрофон"
            console.log('Режим "Микрофон":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'visible',
                currentSentenceInfo: 'visible',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'visible', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };

            // Обновляем кнопку "микрофон"
            audioTableActionBtn.innerHTML = '<i data-lucide="mic"></i>';
            audioTableActionBtn.title = 'Записать с микрофона';

            break;
        case 'auto':
            // Режим "Автозаполнение" - иконка молоточка
            console.log('Режим "Автозаполнение":');
            modeConfig = {
                fileSelectionPanel: 'hidden',
                currentAudioInfo: 'hidden',
                selectFileBtn: 'hidden',
                currentSentenceInfo: 'hidden',

                // waveformContainer: 'hidden', // волна
                // waveformAndControls: 'none',

                audioPlayBtn: 'hidden', // кнопка воспроизведения
                audioStartTime: 'hidden', // время начала
                audioEndTime: 'hidden', // время окончания
                scissorsBtn: 'hidden', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };
            audioTableActionBtn.innerHTML = '<i data-lucide="hammer"></i>';
            audioTableActionBtn.title = 'Пересоздать все откорректированные аудио';

            break;

    }

    // Применяем конфигурацию
    // Простой цикл по всем элементам
    for (const [elementId, visible] of Object.entries(modeConfig)) {
        const element = document.getElementById(elementId);
        if (!element) continue;
        element.style.visibility = visible;
    }

    // Дополнительно управляем элементами без ID
    // 1) Контейнер волны скрываем в режиме автозаполнения
    const waveContainer = document.getElementById('waveformContainer');
    if (waveContainer) {
        waveContainer.style.display = (selectedMode === 'auto') ? 'none' : '';
    }
    // 2) Блок Start/End скрываем в режиме автозаполнения
    const timeControls = document.getElementById('timeControls');
    if (timeControls) {
        timeControls.style.display = (selectedMode === 'auto') ? 'none' : '';
    }

    // Обновляем файл для волны и волну если есть аудио (и другие условия)
    updateCurrentAudioWave();

    // Обновляем видимость колонок в таблице
    updateTableColumnsVisibility(selectedMode);

    // Обновляем само радио
    updateRadioButtonIcons(selectedMode);

    // Обновляем информационные блоки и регион в зависимости от режима
    if (selectedMode === 'sentence') {
        updateCurrentSentenceInfoForMicMode();
        setRegionToSelectedSentence();
    } else if (selectedMode === 'mic') {
        updateCurrentAudioInfoForMicMode();
        updateCurrentSentenceInfoForMicMode();
    } else if (selectedMode === 'full') {
        setRegionToFullShared();
    }

    // Обновляем иконку Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Установить регион и поля start/end по текущей выбранной строке
 */
function setRegionToSelectedSentence() {
    try {
        const selectedRow = document.querySelector('#sentences-table tbody tr.selected');
        if (!selectedRow) return;
        const key = selectedRow.dataset.key;
        const sentence = workingData?.original?.sentences?.find(s => s.key === key);
        if (!sentence) return;

        const start = Number(sentence.start) || 0;
        const end = Number(sentence.end) || 0;

        if (startInput && endInput) {
            startInput.value = start.toFixed(2);
            endInput.value = end.toFixed(2);
        }

        if (window.waveformCanvas && end > 0) {
            if (typeof setupWaveformRegionCallback === 'function') {
                setupWaveformRegionCallback();
            }
            // Устанавливаем флаг для программного обновления
            isProgrammaticRegionUpdate = true;
            window.waveformCanvas.setRegion(start, end);
            window.waveformCanvas.setCurrentTime(start);
            // Сбрасываем флаг после небольшой задержки
            setTimeout(() => {
                isProgrammaticRegionUpdate = false;
            }, 100);
        }
    } catch (e) {
        console.warn('setRegionToSelectedSentence error', e);
    }
}

/**
 * Установить регион на общий файл по сохраненным границам audio_user_shared_start/end
 */
function setRegionToFullShared() {
    try {
        const start = Number(workingData?.original?.audio_user_shared_start) || 0;
        const end = Number(workingData?.original?.audio_user_shared_end) || 0;

        if (startInput && endInput) {
            startInput.value = start.toFixed(2);
            endInput.value = end.toFixed(2);
        }

        if (window.waveformCanvas) {
            if (end > 0) {
                if (typeof setupWaveformRegionCallback === 'function') {
                    setupWaveformRegionCallback();
                }
                // Устанавливаем флаг для программного обновления
                isProgrammaticRegionUpdate = true;
                window.waveformCanvas.setRegion(start, end);
                window.waveformCanvas.setCurrentTime(start);
                // Сбрасываем флаг после небольшой задержки
                setTimeout(() => {
                    isProgrammaticRegionUpdate = false;
                }, 100);
            } else if (typeof window.waveformCanvas.getDuration === 'function') {
                const duration = window.waveformCanvas.getDuration();
                if (duration > 0) {
                    // Устанавливаем флаг для программного обновления
                    isProgrammaticRegionUpdate = true;
                    window.waveformCanvas.setRegion(0, duration);
                    window.waveformCanvas.setCurrentTime(0);
                    // Сбрасываем флаг после небольшой задержки
                    setTimeout(() => {
                        isProgrammaticRegionUpdate = false;
                    }, 100);
                }
            }
        }
    } catch (e) {
        console.warn('setRegionToFullShared error', e);
    }
}


/**
 * Обновление иконок радио-кнопок в зависимости от выбранного режима
 */
function updateRadioButtonIcons(selectedMode) {
    const radioButtons = document.querySelectorAll('input[name="audioMode"]');

    radioButtons.forEach(radio => {
        const label = radio.closest('.radio-label');
        if (!label) return;

        const selectedIcon = label.querySelector('.radio-icon-selected');
        const unselectedIcon = label.querySelector('.radio-icon-unselected');

        if (selectedIcon && unselectedIcon) {
            if (radio.checked) {
                // Показываем aperture иконку для выбранного
                selectedIcon.style.display = 'inline';
                unselectedIcon.style.display = 'none';
            } else {
                // Показываем circle иконку для невыбранного
                selectedIcon.style.display = 'none';
                unselectedIcon.style.display = 'inline';
            }
        }
    });
}




/**
 * Обновление видимости колонок в таблице в зависимости от режима аудио
 */
function updateTableColumnsVisibility(audioMode) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    // Определяем, открыта ли боковая панель редактирования
    const isEditingPanelOpen = table.classList.contains('state-original-editing');

    if (!isEditingPanelOpen) {
        return;
    }

    // Скрываем все колонки редактирования по умолчанию
    const allEditingColumns = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');
    allEditingColumns.forEach(col => {
        col.style.display = 'none';
    });

    // Показываем колонки в зависимости от режима
    switch (audioMode) {
        case 'auto':
            // Показываем только колонки автозаполнения
            const avtoColumns = table.querySelectorAll('.panel-editing-avto');
            avtoColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;

        case 'full':
        case 'sentence':
            // Показываем колонки пользовательского редактирования
            const userColumns = table.querySelectorAll('.panel-editing-user');
            userColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;

        case 'mic':
            // Показываем колонки микрофона
            const micColumns = table.querySelectorAll('.panel-editing-mic');
            micColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;
    }
    
    // Обновляем видимость кнопки редактирования всех
    updateEditAllCreatingButtonVisibility();
}


/**
 * Обработчик перезаписи с микрофона
 */
function handleReRecord() {
    // TODO: Реализовать запись с микрофона
    alert('Функция записи с микрофона будет реализована позже');
}


/**
 * Инициализация обработчика выбора файла
 */
function setupFileInputHandler() {
    const fileInput = document.getElementById('audioFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            // Используем общую функцию загрузки
            uploadAudioFile(file, currentMode);
        });
    }
}
/**
 * Инициализация обработчиков полей под волной
 */
function setupWaveformFieldsHandlers() {
    if (startInput) {
        startInput.addEventListener('input', () => {
            handleFieldChange('waveform', 'start', startInput.value);
        });
    }

    if (endInput) {
        endInput.addEventListener('input', () => {
            handleFieldChange('waveform', 'end', endInput.value);
        });
    }
}

/**
 * Загрузить аудиофайл
 */
function uploadAudioFile(file, audioMode) {

    // Показываем индикатор загрузки
    showLoadingIndicator('Загрузка аудиофайла...');

    // Получаем длительность аудио файла
    const audio = new Audio();
    const audioUrl = URL.createObjectURL(file);

    audio.addEventListener('loadedmetadata', () => {
        // Получаем длительность в секундах
        const durationSeconds = audio.duration;

        // Округляем до сотых, отбрасывая тысячные
        const durationFormatted = Math.floor(durationSeconds * 100) / 100;

        // Освобождаем память
        URL.revokeObjectURL(audioUrl);

        // Продолжаем загрузку файла
        continueUpload(file, audioMode, durationFormatted, durationSeconds);
    });

    audio.addEventListener('error', () => {
        console.error('❌ Ошибка загрузки метаданных аудио');
        URL.revokeObjectURL(audioUrl);
        // Продолжаем без длительности
        continueUpload(file, audioMode, null, null);
    });

    audio.src = audioUrl;
}

function continueUpload(file, audioMode, durationFormatted, duration) {
    // Проверяем JWT токен
    // Используем jwt_token (как в user_manager.js) или токен из UserManager
    let token = null;
    if (window.UM && window.UM.token) {
        token = window.UM.token;
    } else {
        token = localStorage.getItem('jwt_token');
    }
    // console.log('🔑 JWT токен:', token ? 'есть' : 'отсутствует');
    if (token) {
        // Проверяем структуру JWT токена (должен содержать 3 части, разделенные точками)
        const parts = token.split('.');
        // console.log('🔑 JWT токен части:', parts.length, 'частей');
        if (parts.length !== 3) {
            console.error('❌ JWT токен неправильной структуры! Ожидается 3 части, получено:', parts.length);
        } else {
        }
    } else {
        console.warn('⚠️ JWT токен отсутствует в localStorage! Продолжаем без авторизации...');
    }

    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('audioFile', file);
    formData.append('language', currentDictation.language_original);
    formData.append('dictation_id', currentDictation.id);
    formData.append('audioMode', audioMode);

    if (audioMode === 'mic') {
        const currentRow = document.querySelector('#sentences-table tbody tr.selected');
        if (currentRow && currentRow.dataset && currentRow.dataset.key) {
            formData.append('sentenceKey', currentRow.dataset.key);
        }
    }

    for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value);
    }

    // Отправляем файл на сервер
    fetch('/upload-audio', {
        method: 'POST',
        // Временно убираем JWT токен для тестирования
        // headers: {
        //     'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        // },
        body: formData
    })
        .then(response => {

            // Получаем текст ответа независимо от статуса
            return response.text().then(text => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}\nОтвет: ${text}`);
                }
                return text;
            });
        })
        .then(text => {
            try {
                return JSON.parse(text); // Пытаемся распарсить как JSON
            } catch (e) {
                console.error('❌ Ошибка парсинга JSON:', e);
                console.error('❌ Текст ответа:', text);
                throw new Error('Сервер вернул не JSON ответ');
            }
        })
        .then(data => {
            hideLoadingIndicator();
            if (data.success) {
                // Файл уже отображается в панели выбора
                // Обновляем workingData.original
                switch (audioMode) {
                    case 'full':
                        workingData.original.audio_user_shared = data.filename;
                        workingData.original.audio_user_shared_start = 0;
                        workingData.original.audio_user_shared_end = duration;

                        // Обновляем отображение с длительностью
                        const currentAudioInfo = document.getElementById('currentAudioInfo');
                        if (currentAudioInfo) {
                            const durationText = durationFormatted ? ` (${durationFormatted}с)` : '';
                            currentAudioInfo.textContent = `Аудио для волны: ${data.filename}(${durationText}с)`;
                        }

                        // Обновляем текущее аудио

                        updateCurrentAudioWave();
                        break;
                    case 'mic':
                        const currentRow = document.querySelector('#sentences-table tbody tr.selected');
                        if (currentRow) {
                            const key = currentRow.dataset.key;
                            const sentence = workingData.original.sentences.find(s => s.key === key);
                            sentence.audio_mic = data.filename;

                            // Обновляем отображение с длительностью
                            const currentAudioInfo = document.getElementById('currentAudioInfo');
                            if (currentAudioInfo) {
                                const durationText = durationFormatted ? ` (${durationFormatted}с)` : '';
                                currentAudioInfo.textContent = `Аудио для волны: ${data.filename}${durationText}с)`;
                            }
                        }
                        break;
                }

                // Отмечаем что диктант изменен
                currentDictation.isSaved = false;
                setDirtyFlags({ audio: true });

                // Автосохранение JSON удалено - данные только в workingData


                // Инициализируем волну с загруженным файлом
                if (data.filepath) {
                    // Используем правильный путь из ответа сервера
                    const audioUrl = data.filepath;
                    initWaveform(audioUrl);
                }
            } else {
                console.error('❌ Ошибка загрузки файла:', data.error);
                alert('Ошибка загрузки файла: ' + data.error);
            }
        })
        .catch(error => {
            hideLoadingIndicator();
            console.error('❌ Ошибка загрузки файла:', error);
            alert('Ошибка загрузки файла');
        });
}




/**
 * Настройка обработчиков для полей ввода в строке
 */
function setupInputHandlers(row) {
    // Поле Start
    const startInput = row.querySelector('.start-input');
    if (startInput) {
        startInput.addEventListener('change', () => {
            onStartTimeChanged(row);
        });

        startInput.addEventListener('input', () => {
            onStartTimeInput(row);
            // Обновляем цепочку
            const key = row.dataset.key;
            if (key) {
                updateChain(key, 'start', startInput.value);
            }
            // Синхронизируем с полями под волной, если это текущая строка
            handleFieldChange('table', 'start', startInput.value, row);
        });

        startInput.addEventListener('blur', () => {
            onStartTimeBlur(row);
        });
    }

    // Поле End
    const endInput = row.querySelector('.end-input');
    if (endInput) {
        endInput.addEventListener('change', () => {
            onEndTimeChanged(row);
        });

        endInput.addEventListener('input', () => {
            onEndTimeInput(row);
            // Обновляем цепочку
            const key = row.dataset.key;
            if (key) {
                updateChain(key, 'end', endInput.value);
            }
            // Синхронизируем с полями под волной, если это текущая строка
            handleFieldChange('table', 'end', endInput.value, row);
        });

        endInput.addEventListener('blur', () => {
            onEndTimeBlur(row);
        });
    }

    // Обработчик для кнопки цепочки
    const chainCell = row.querySelector('.col-chain');
    if (chainCell) {
        chainCell.addEventListener('click', () => {
            toggleChain(row);
        });
        chainCell.style.cursor = 'pointer';
    }
}

/**
 * Универсальная обработка изменения полей start/end
 */
function handleFieldChange(source, field, value, row = null) {
    // Проверяем, находимся ли мы в режиме "sentence"
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    if (currentMode !== 'sentence') {
        console.log('❌ Синхронизация только в режиме "sentence"');
        return;
    }

    let targetRow = row;
    let key = null;

    // Определяем целевую строку в зависимости от источника
    if (source === 'table' && row) {
        // Изменение в таблице - используем переданную строку
        targetRow = row;
        key = row.dataset.key;
    } else if (source === 'waveform') {
        // Изменение под волной - находим текущую выбранную строку
        targetRow = document.querySelector('#sentences-table tbody tr.selected');
        if (targetRow) {
            key = targetRow.dataset.key;
        }
    }

    if (!targetRow || !key) {
        console.log('❌ Нет целевой строки для синхронизации');
        return;
    }

    // Обновляем поле в таблице (если источник - волна)
    if (source === 'waveform') {
        if (field === 'start') {
            const startInput = targetRow.querySelector('.start-input');
            if (startInput) {
                startInput.value = value;
            }
        } else if (field === 'end') {
            const endInput = targetRow.querySelector('.end-input');
            if (endInput) {
                endInput.value = value;
            }
        }
    }

    // Обновляем поле под волной (если источник - таблица)
    if (source === 'table') {
        if (field === 'start' && startInput) {
            startInput.value = value;
        } else if (field === 'end' && endInput) {
            endInput.value = value;
        }
    }

    // Обновляем данные в workingData
    const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
    if (sentenceIndex !== -1) {
        workingData.original.sentences[sentenceIndex][field] = parseFloat(value) || 0;
    }

    // Запускаем логику цепочки (chain) для обновления соседних строк
    updateChain(key, field, value);

    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в целевой строке
    if (targetRow) {
        const audioBtnOriginalUser = targetRow.querySelector('button[data-field-name="audio_user"]');
        if (audioBtnOriginalUser) {
            audioBtnOriginalUser.dataset.state = 'creating';
            setButtonState(audioBtnOriginalUser);
            updateEditAllCreatingButtonVisibility();
        }
    }

    // Обновляем регион в волне
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        if (startInput && endInput) {
            const start = parseFloat(startInput.value) || 0;
            const end = parseFloat(endInput.value) || 0;
            setupWaveformRegionCallback();
            waveformCanvas.setRegion(start, end);
        }
    }
}

/**
 * Синхронизация полей под волной с полями в таблице (обратная синхронизация)
 * @deprecated Используйте handleFieldChange('waveform', field, value)
 */
function syncWaveformFieldsToTable(field, value) {
    handleFieldChange('waveform', field, value);
}

/**
 * Синхронизировать поля в таблице с полями под волной
 * @deprecated Используйте handleFieldChange('table', field, value, row)
 */
function syncWithWaveformFields(row, field, value) {
    // Проверяем, является ли эта строка текущей выбранной
    if (!row.classList.contains('selected')) {
        return;
    }

    handleFieldChange('table', field, value, row);
}

/**
 * Переключить состояние цепочки для строки
 */
function toggleChain(row) {
    const key = row.dataset.key;
    if (!key) return;

    // Находим предложение в workingData
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) return;

    // Переключаем состояние цепочки
    sentence.chain = !sentence.chain;

    // Обновляем иконку в ячейке
    const chainCell = row.querySelector('.col-chain');
    if (chainCell) {
        const icon = sentence.chain ? 'link' : 'unlink';
        chainCell.innerHTML = `<i data-lucide="${icon}"></i>`;

        // Обновляем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    console.log(`🔗 Цепочка для ${key}: ${sentence.chain ? 'включена' : 'выключена'}`);
}

/**
 * Настройка обработчиков для самой строки
 */
function setupRowHandlers(row) {
    // Клик по строке для выбора
    row.addEventListener('click', (e) => {
        // Пропускаем клики по чекбоксам и их элементам
        if (e.target.closest('.col-checkbox-create-audio') || e.target.closest('.checkbox-btn')) {
            return;
        }
        selectSentenceRow(row);
    });

    // Двойной клик для дополнительных действий
    row.addEventListener('dblclick', () => {
        onRowDoubleClick(row);
    });
}

/**
 * Обработчик изменения времени начала
 */
function onStartTimeChanged(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // Валидация: start не должен быть больше end
    if (startTime >= endTime && endTime > 0) {
        row.querySelector('.end-input').value = (startTime + 1).toFixed(2);
        // console.log('⚠️ Автоматически скорректировано время окончания');
    }

    updateAudioFileTimes(row);
    validateTimeInputs(row);
}

/**
 * Обработчик изменения времени окончания
 */
function onEndTimeChanged(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    console.log('⏰ Изменено время окончания:', endTime);

    // Валидация: end не должен быть меньше start
    if (endTime <= startTime) {
        row.querySelector('.end-input').value = (startTime + 1).toFixed(2);
        // console.log('⚠️ Автоматически скорректировано время окончания');
    }

    updateAudioFileTimes(row);
    validateTimeInputs(row);
}

/**
 * Обработчик ввода времени начала (в реальном времени)
 */
function onStartTimeInput(row) {
    // Здесь можно добавить валидацию в реальном времени
    // Например, подсветка невалидных значений
}

/**
 * Обработчик ввода времени окончания (в реальном времени)
 */
function onEndTimeInput(row) {
    // Здесь можно добавить валидацию в реальном времени
}

/**
 * Обработчик потери фокуса времени начала
 */
function onStartTimeBlur(row) {
    const input = row.querySelector('.start-input');
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2); // Форматируем до 2 знаков
}

/**
 * Обработчик потери фокуса времени окончания
 */
function onEndTimeBlur(row) {
    const input = row.querySelector('.end-input');
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2); // Форматируем до 2 знаков
}


/**
 * Обработчик двойного клика по строке
 */
function onRowDoubleClick(row) {
    // console.log('🖱️ Двойной клик по строке:', row.dataset.filename);

    // Можно добавить дополнительные действия, например:
    // - Открыть диалог редактирования
    // - Воспроизвести аудио
    // - Показать детали файла
}

/**
 * Валидация полей времени
 */
function validateTimeInputs(row) {
    const startInput = row.querySelector('.start-input');
    const endInput = row.querySelector('.end-input');
    const startTime = parseFloat(startInput.value) || 0;
    const endTime = parseFloat(endInput.value) || 0;

    // Сбрасываем предыдущие стили валидации
    startInput.classList.remove('invalid');
    endInput.classList.remove('invalid');

    // Проверяем валидность
    if (startTime < 0) {
        startInput.classList.add('invalid');
    }

    if (endTime <= startTime) {
        endInput.classList.add('invalid');
    }
}

/**
 * Выбрать аудиофайл для работы
 */
function selectAudioFile(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;

    // Выделяем строку
    document.querySelectorAll('#audioFilesTable tbody tr').forEach(r => {
        r.classList.remove('selected');
    });
    row.classList.add('selected');

    // Загружаем волну для этого файла
    loadWaveformForFile(filepath);
}

/**
 * Разрезать аудио на предложения
 */
function splitAudioIntoSeentences(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('✂️ Разрезаем аудио на предложения:', filename, startTime, '-', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Разрезание аудио на предложения...');

    (async () => {
        try {
            // Берём предложения (для split-аудио по строкам)
            const sentences = (workingData?.original?.sentences || []).map(s => ({
                key: s.key,
                start_time: Number(s.start) || 0,
                end_time: Number(s.end) || 0,
                language: currentDictation.language_original
            })).filter(s => s.key && s.end_time > s.start_time);

            const payload = {
                filename: filename,
                filepath: filepath,
                dictation_id: currentDictation.id,
                sentences: sentences
            };

            const response = await fetch('/split-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            hideLoadingIndicator();
            if (!data.success) {
                console.error('❌ Ошибка разрезания аудио:', data.error);
                alert('Ошибка разрезания аудио: ' + (data.error || 'Неизвестная ошибка'));
                return;
            }

            // Receive base64 segments and keep them in memory (blob URLs) until Save.
            if (Array.isArray(data.files)) {
                for (const f of data.files) {
                    if (!f || !f.filename || !f.audio_b64) continue;
                    try {
                        const binaryOut = atob(f.audio_b64);
                        const outBytes = new Uint8Array(binaryOut.length);
                        for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                        const outBlob = new Blob([outBytes], { type: f.mime || 'audio/mpeg' });
                        await putDraftAudioToCache(currentDictation.id, currentDictation.language_original, f.filename, outBlob, f.mime || 'audio/mpeg');

                        const sentence = workingData.original.sentences.find(s => s.key === f.key);
                        if (sentence) {
                            sentence.audio_user = f.filename;
                        }
                    } catch (e) {
                        console.warn('⚠️ не удалось сохранить segment blob:', e);
                    }
                }

                rebuildSentencesTable();
                setDirtyFlags({ audio: true });
                markAsUnsaved();
            }
        } catch (error) {
            hideLoadingIndicator();
            console.error('❌ Ошибка разрезания аудио:', error);
            alert('Ошибка разрезания аудио');
        }
    })();
}

/**
 * Обрезать аудиофайл
 */
function cutAudioFile(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('✂️ Обрезаем аудиофайл:', filename, startTime, '-', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Обрезание аудиофайла...');

    (async () => {
        try {
            const payload = {
                filename: filename,
                filepath: filepath,
                startTime: startTime,
                endTime: endTime,
                language: currentDictation.language_original,
                dictation_id: currentDictation.id
            };

            const response = await fetch('/cut-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            hideLoadingIndicator();

            if (!data.success) {
                console.error('❌ Ошибка обрезания аудио:', data.error);
                alert('Ошибка обрезания аудио: ' + (data.error || 'Неизвестная ошибка'));
                return;
            }

            if (data.audio_b64) {
                const binaryOut = atob(data.audio_b64);
                const outBytes = new Uint8Array(binaryOut.length);
                for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                const outBlob = new Blob([outBytes], { type: data.mime || 'audio/mpeg' });
                const outUrl = await putDraftAudioToCache(currentDictation.id, currentDictation.language_original, data.filename, outBlob, data.mime || 'audio/mpeg');
                if (outUrl) {
                    setDraftAudioUrl(currentDictation.language_original, data.filename, outUrl);
                }

                row.dataset.filename = data.filename || filename;
                const el = row.querySelector('.filename-text');
                if (el) el.textContent = row.dataset.filename;
            } else {
                // Старый режим: backend перезаписал файл, но структура ответа тут не согласована.
                // Просто перезагрузим волну по текущему filepath.
                row.dataset.filename = filename;
                row.dataset.filepath = filepath;
            }
        } catch (error) {
            hideLoadingIndicator();
            console.error('❌ Ошибка обрезания аудио:', error);
            alert('Ошибка обрезания аудио');
        }
    })();
}

/**
 * Обновить цепочку при изменении start/end
 */
function updateChain(rowKey, field, value) {
    const row = document.querySelector(`tr[data-key="${rowKey}"]`);
    if (!row) return;

    // Проверяем состояние цепочки через workingData
    const sentence = workingData.original.sentences.find(s => s.key === rowKey);
    if (!sentence || !sentence.chain) return;

    // Найти соседние строки с включенными цепочками
    const allRows = Array.from(document.querySelectorAll('#sentences-table tbody tr'));
    const currentIndex = allRows.indexOf(row);

    if (field === 'end' && currentIndex < allRows.length - 1) {
        // Изменяем end текущей строки, обновляем start следующей
        const nextRow = allRows[currentIndex + 1];
        const nextRowKey = nextRow.dataset.key;
        const nextSentence = workingData.original.sentences.find(s => s.key === nextRowKey);

        if (nextSentence && nextSentence.chain) {
            const nextStartInput = nextRow.querySelector('.start-input');
            if (nextStartInput) {
                const oldValue = parseFloat(nextStartInput.value) || 0;
                const newValue = parseFloat(value) || 0;
                
                // Обновляем только если значение действительно изменилось
                if (Math.abs(oldValue - newValue) > 0.01) { // небольшой порог для сравнения float
                    nextStartInput.value = value;

                    // Обновить данные в workingData
                    const nextRowKey = nextRow.dataset.key;
                    updateSentenceData(nextRowKey, 'original', 'start', newValue);
                    
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в следующей строке
                    const nextAudioBtnOriginalUser = nextRow.querySelector('button[data-field-name="audio_user"]');
                    if (nextAudioBtnOriginalUser) {
                        nextAudioBtnOriginalUser.dataset.state = 'creating';
                        setButtonState(nextAudioBtnOriginalUser);
                        updateEditAllCreatingButtonVisibility();
                    }
                }
            }
        }
    } else if (field === 'start' && currentIndex > 0) {
        // Изменяем start текущей строки, обновляем end предыдущей
        const prevRow = allRows[currentIndex - 1];
        const prevRowKey = prevRow.dataset.key;
        const prevSentence = workingData.original.sentences.find(s => s.key === prevRowKey);

        if (prevSentence && prevSentence.chain) {
            const prevEndInput = prevRow.querySelector('.end-input');
            if (prevEndInput) {
                const oldValue = parseFloat(prevEndInput.value) || 0;
                const newValue = parseFloat(value) || 0;
                
                // Обновляем только если значение действительно изменилось
                if (Math.abs(oldValue - newValue) > 0.01) { // небольшой порог для сравнения float
                    prevEndInput.value = value;

                    // Обновить данные в workingData
                    const prevRowKey = prevRow.dataset.key;
                    updateSentenceData(prevRowKey, 'original', 'end', newValue);
                    
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в предыдущей строке
                    const prevAudioBtnOriginalUser = prevRow.querySelector('button[data-field-name="audio_user"]');
                    if (prevAudioBtnOriginalUser) {
                        prevAudioBtnOriginalUser.dataset.state = 'creating';
                        setButtonState(prevAudioBtnOriginalUser);
                        updateEditAllCreatingButtonVisibility();
                    }
                }
            }
        }
    }
}

/**
 * Обновить данные предложения в workingData
 */
function updateSentenceData(rowKey, language, field, value) {
    let v = value;
    try {
        if (field === 'text' || field === 'title' || field === 'explanation') {
            v = normalizeDictationInvisibleChars(String(value || ''));
            v = v.replace(/\s+/g, ' ').trim();
        }
    } catch (e) {
        v = value;
    }
    if (language === 'original') {
        const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === rowKey);
        if (sentenceIndex !== -1) {
            workingData.original.sentences[sentenceIndex][field] = v;
        }
    } else if (language === 'translation') {
        const trBucket = getCurrentTranslationData({ createIfMissing: false });
        if (trBucket && Array.isArray(trBucket.sentences)) {
            const sentenceIndex = trBucket.sentences.findIndex(s => s.key === rowKey);
            if (sentenceIndex !== -1) {
                trBucket.sentences[sentenceIndex][field] = v;
            }
        }
    }

    try {
        setDirtyFlags({ db: true });
    } catch (e) {
    }
}

/**
 * Обновить времена аудиофайла
 */
function updateAudioFileTimes(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('⏰ Обновлены времена файла:', startTime, '-', endTime);

    // Здесь можно добавить логику для обновления волны или других элементов
}

/**
 * Загрузить волну для файла
 */
async function loadWaveformForFile(filepath) {

    try {

        // Получаем существующий WaveformCanvas или создаем новый
        let waveformCanvas = window.waveformCanvas;
        if (!waveformCanvas) {
            waveformCanvas = new WaveformCanvas(waveformContainer);
            window.waveformCanvas = waveformCanvas;
        }

        // Загружаем аудио с cache-busting, чтобы видеть новое содержимое при том же имени
        const url = `${filepath}${filepath.includes('?') ? '&' : '?'}ts=${Date.now()}`;
        await waveformCanvas.loadAudio(url);

        // Настраиваем callback для обновления региона
        setupWaveformRegionCallback();
        
        // Устанавливаем callback для окончания воспроизведения (когда волна останавливает воспроизведение при достижении конца региона)
        waveformCanvas.onPlaybackEnd(() => {
            const audioPlayBtn = document.getElementById('audioPlayBtn');
            if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
                const originalState = audioPlayBtn.dataset.originalState || 'ready-shared';
                audioPlayBtn.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(audioPlayBtn, originalState);
                }
                console.log('✅ Состояние кнопки под волной обновлено в:', originalState);
            }
        });

        // Восстанавливаем регион в зависимости от текущего режима
        // Устанавливаем флаг, чтобы не устанавливать 'creating' при программном обновлении
        isProgrammaticRegionUpdate = true;
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        const duration = waveformCanvas.getDuration();
        
        if (currentMode === 'sentence') {
            // В режиме "sentence" устанавливаем регион по текущей выбранной строке
            setRegionToSelectedSentence();
        } else if (currentMode === 'full') {
            // В режиме "full" устанавливаем регион по сохраненным границам
            setRegionToFullShared();
        } else {
            // Для других режимов устанавливаем регион на всю длительность
            waveformCanvas.setRegion(0, duration);
            
            // Обновляем поля ввода
            if (startInput) startInput.value = '0.00';
            if (endInput) endInput.value = duration.toFixed(2);
        }
        // Сбрасываем флаг после небольшой задержки, чтобы callback успел сработать
        setTimeout(() => {
            isProgrammaticRegionUpdate = false;
        }, 100);

    } catch (error) {
        console.error('❌ Ошибка загрузки волны:', error);
    }
}



/**
 * Получить текущий аудиофайл для обрезки ножницами
 */
function getCurrentAudioFileForScissors() {
    // Проверяем режим "отображать весь файл"
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    console.log('✂️✂️✂️✂️✂️4✂️ Режим "отображать весь файл":', audioMode, audioMode.value);
    if (!audioMode || audioMode.value !== 'full') {
        console.log('❌ Режим "отображать весь файл" не активен');
        return null;
    }

    // Получаем имя файла из currentAudioFileName (уже содержит только имя файла)
    const filename = currentAudioFileName;
    console.log('✂️✂️✂️✂️✂️ 1 ✂️ Имя файла:', filename);

    if (!filename) {
        console.error('❌ Имя файла не найдено');
        return null;
    }


    // Создаем правильный путь к файлу на сервере
    const serverFilePath = `${getAudioPath(currentDictation.language_original)}/${filename}`;
    console.log('✂️✂️✂️✂️✂️ 2 ✂️ Путь к файлу на сервере:', serverFilePath);

    // Проверяем, есть ли файл в input элементе (для новых загрузок)
    const fileInput = document.getElementById('audioFileInput');
    let file = null;

    if (fileInput && fileInput.files && fileInput.files[0]) {
        file = fileInput.files[0];
    } else {
        // Файл не в input, но он может быть на сервере (для существующих диктантов)
    }
    console.log('✂️✂️✂️✂️✂️ 2 ✂️ return:', {
        filename: filename,
        filepath: serverFilePath,
        file: file // может быть null для существующих файлов
    });

    return {
        filename: filename,
        filepath: serverFilePath,
        file: file // может быть null для существующих файлов
    };
}
/**
 * Разрезать аудио на предложения
 */
async function splitAudioIntoSentences() {
    // Получаем текущий аудиофайл
    //const currentAudioFile = getCurrentAudioFileForScissors();
    const filePath = `${getAudioPath(currentDictation.language_original)}/${currentAudioFileName}`;
    console.log('✂️✂️✂️✂️✂️3✂️ Текущий аудиофайл:', currentAudioFileName);

    // Получаем все предложения
    if (!workingData || !workingData.original || !workingData.original.sentences) {
        alert('Нет предложений для разрезания');
        return;
    }

    const sentences = workingData.original.sentences.filter(s => s.key !== 'metadata');
    if (sentences.length === 0) {
        alert('Нет предложений для разрезания');
        return;
    }

    // Получаем длительность аудио
    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        alert('Волна не загружена');
        return;
    }

    const totalDuration = waveformCanvas.getDuration();
    const segmentDuration = totalDuration / sentences.length;

    console.log(`📊 Разрезаем ${totalDuration.toFixed(2)}с на ${sentences.length} частей по ${segmentDuration.toFixed(2)}с`);

    // Показываем индикатор загрузки
    showLoadingIndicator('Разрезание аудио на предложения...');

    try {
        // Сначала рассчитываем все концы интервалов
        const endTimes = [];
        let currentEndTime = 0;

        for (let i = 0; i < sentences.length; i++) {
            // Конец интервала = предыдущий конец + длительность сегмента, округленная по старому правилу
            const rawEndTime = currentEndTime + segmentDuration;
            const endTime = Math.floor(rawEndTime * 100) / 100; // Отбрасываем тысячные
            endTimes.push(endTime);
            currentEndTime = endTime;
        }

        console.log(`📊 Рассчитанные концы интервалов:`, endTimes.map(t => t.toFixed(2)).join(', '));

        // Теперь обновляем данные предложений
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];

            // Начало интервала = конец предыдущего (или 0 для первого)
            const startTime = i === 0 ? 0 : endTimes[i - 1];

            // Конец интервала = уже рассчитанный
            const endTime = endTimes[i];

            console.log(`📊 Предложение ${i + 1}: ${startTime.toFixed(2)}с - ${endTime.toFixed(2)}с`);

            // Обновляем данные в workingData
            const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === sentence.key);
            if (sentenceIndex !== -1) {
                workingData.original.sentences[sentenceIndex].start = startTime;
                workingData.original.sentences[sentenceIndex].end = endTime;
                workingData.original.sentences[sentenceIndex].chain = true; // Включаем цепочку по умолчанию
                workingData.original.sentences[sentenceIndex].audio_user = `${sentence.key}_${currentDictation.language_original}_user.mp3`;
            }

            // Обновляем данные во всех переводах (ключи одинаковые)
            try {
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const bucket = workingData.translations[k];
                        if (!bucket || !Array.isArray(bucket.sentences)) continue;
                        const idx = bucket.sentences.findIndex(s => s && s.key === sentence.key);
                        if (idx === -1) continue;
                        bucket.sentences[idx].start = startTime;
                        bucket.sentences[idx].end = endTime;
                        bucket.sentences[idx].chain = true;
                        bucket.sentences[idx].audio_user = `${sentence.key}_${normalizeLangCode(bucket.language)}_user.mp3`;
                    }
                }
            } catch (e) {
            }
        }

        // Отправляем запрос на сервер для разрезания аудио
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: currentAudioFileName,
                filepath: filePath,
                sentences: sentences.map(s => ({
                    key: s.key,
                    start_time: workingData.original.sentences.find(ws => ws.key === s.key)?.start || 0,
                    end_time: workingData.original.sentences.find(ws => ws.key === s.key)?.end || 0,
                    language: currentDictation.language_original
                })),
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            // Обновляем таблицу
            updateTableWithNewAudio();

            // Переключаем режим на "Текущее предложение"
            switchToSentenceMode();

        } else {
            console.error('❌ Ошибка разрезания аудио:', data.error);
            alert('Ошибка разрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка разрезания аудио:', error);
        alert('Ошибка разрезания аудио: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Переключить режим на "Текущее предложение" и обновить правую панель
 */
function switchToSentenceMode() {

    // Переключаем радио кнопку
    const sentenceRadio = document.querySelector('input[name="audioMode"][value="sentence"]');
    if (sentenceRadio) {
        sentenceRadio.checked = true;
        sentenceRadio.dispatchEvent(new Event('change'));
    }

    updateCurrentAudioWave();
}

/**
 * Загрузить аудио для текущего предложения
 */
function loadAudioForCurrentSentence() {
    // Находим первую строку таблицы
    const firstRow = document.querySelector('#sentences-table tbody tr');
    if (!firstRow) {
        console.log('❌ Нет строк в таблице');
        return;
    }

    const key = firstRow.dataset.key;
    if (!key) {
        console.log('❌ Нет ключа в строке');
        return;
    }

    // Получаем данные предложения
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) {
        console.log('❌ Предложение не найдено:', key);
        return;
    }

    // В режиме "Текущее предложение" файл уже загружен в волну
    // нужно только установить регион для текущего предложения

    // Устанавливаем регион для текущего предложения
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        waveformCanvas.setRegion(sentence.start, sentence.end);
    } else {
        console.log('❌ Волна не загружена');
    }

    // Обновляем поля start/end из данных предложения
    if (startInput && endInput) {
        startInput.value = sentence.start.toFixed(2);
        endInput.value = sentence.end.toFixed(2);
    }

    // Выбираем первую строку как текущую
    selectSentenceRow(firstRow);
}

/**
 * Обновить таблицу с новыми аудиофайлами
 */
function updateTableWithNewAudio() {
    // console.log('🔄 updateTableWithNewAudio вызвана');
    // console.log('📊 workingData.original.sentences:', workingData.original.sentences);

    // Находим все строки таблицы
    const rows = document.querySelectorAll('#sentences-table tbody tr');
    console.log(`📋 Найдено строк в таблице: ${rows.length}`);

    rows.forEach(row => {
        const key = row.dataset.key;
        if (!key) return;

        // Обновляем поля start и end
        const startInput = row.querySelector('.start-input');
        const endInput = row.querySelector('.end-input');
        const chainCell = row.querySelector('.col-chain');

        if (startInput && endInput && chainCell) {
            const sentence = workingData.original.sentences.find(s => s.key === key);
            if (sentence) {
                console.log(`📝 Устанавливаем значения: start=${sentence.start}, end=${sentence.end}, chain=${sentence.chain}`);
                startInput.value = sentence.start.toFixed(2);
                endInput.value = sentence.end.toFixed(2);

                // Обновляем иконку цепочки
                if (sentence.chain) {
                    chainCell.innerHTML = '<i data-lucide="link"></i>';
                } else {
                    chainCell.innerHTML = '<i data-lucide="unlink"></i>';
                }

                // Обновляем иконки Lucide
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } else {
                console.log(`❌ Предложение не найдено для ключа: ${key}`);
            }
        } else {
            console.log(`❌ Не найдены элементы ввода для строки ${key}:`, { startInput, endInput, chainCell });
        }

        // Обновляем плеер для аудио
        const audioFileName = `${key}_${currentDictation.language_original}_user.mp3`;
        const audioPath = buildDictationAudioUrl(
            currentDictation && currentDictation.id,
            currentDictation.language_original,
            audioFileName
        );

        try {
            const audio = new Audio(audioPath);
            audioPlayers[audioFileName] = audio;
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить плеер для:', audioFileName, error);
        }

        // Добавляем обработчик клика для выбора предложения
        row.addEventListener('click', () => {
            selectSentenceRow(row);
        });
    });
}

/**
 * Выбрать строку в таблице (универсальная функция для всех режимов)
 */
function selectSentenceRow(row) {
    const key = row.dataset.key;
    if (!key) return;


    // ОСТАНАВЛИВАЕМ текущее воспроизведение при смене предложения
    if (window.waveformCanvas && window.waveformCanvas.isPlaying) {
        console.log('🎯 Останавливаем воспроизведение при смене предложения');
        window.waveformCanvas.stopAudioControl();
    }

    // Также останавливаем через AudioManager
    // if (audioManager && audioManager.currentButton) {
    //     audioManager.stop();
    // }
    
    // Сбрасываем состояние кнопки под волной в ready-shared при выборе новой строки
    const audioPlayBtn = document.getElementById('audioPlayBtn');
    if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
        audioPlayBtn.dataset.state = 'ready-shared';
        if (typeof setButtonState === 'function') {
            setButtonState(audioPlayBtn, 'ready-shared');
        }
    }

    // Убираем выделение с других строк
    document.querySelectorAll('#sentences-table tbody tr').forEach(r => {
        r.classList.remove('selected');
    });

    // Выделяем текущую строку
    row.classList.add('selected');

    // Получаем данные предложения
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) {
        console.log('❌ Предложение не найдено:', key);
        return;
    }

    // Получаем текущий режим аудио
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    // В зависимости от режима выполняем разные действия
    switch (currentMode) {
        case 'sentence':
            // В режиме "Текущее предложение" обновляем регион и поля
            updateWaveformForSentence(sentence);
            updateCurrentSentenceInfo(sentence);
            break;
        case 'full':
            // В режиме "Отображать весь файл" только обновляем информацию
            updateCurrentSentenceInfo(sentence);
            break;
        case 'mic':
            // В режиме "Микрофон" управляем видимостью волны
            updateWaveformVisibilityForMicMode();
            updateCurrentSentenceInfoForMicMode();
            updateCurrentAudioWave(); // Обновляем текущее аудио и волну для mic
            break;
        case 'auto':
            // В режиме "Автозаполнение" только обновляем информацию
            updateCurrentSentenceInfo(sentence);
            break;
    }

    // Обновляем номер текущей строки в лейбле
    updateCurrentRowNumber();
}

/**
 * Загрузить обложку книги для диктанта
 */
async function loadBookCoverForDictation(dictationDbId, bookId = null) {
    try {
        console.log('🔍 loadBookCoverForDictation вызвана:', { dictationDbId, bookId });
        
        // Если book_id не передан, пытаемся получить его из БД по dictation_id
        if (!bookId && dictationDbId) {
            const token = window.UM?.token || localStorage.getItem('jwt_token');
            if (!token) {
                console.warn('⚠️ Нет токена для загрузки обложки книги');
                return { book_id: null };
            }
            
            console.log('📡 Запрашиваю book_id для dictation_id:', dictationDbId);
            // Получаем информацию о диктанте, включая book_id
            const response = await fetch(`/library/api/dictation/${dictationDbId}/book`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('📦 Ответ API /dictation/book:', data);
                if (data.success && data.book_id) {
                    bookId = data.book_id;
                    console.log('✅ Получен book_id:', bookId);
                } else {
                    console.log('ℹ️ Диктант не принадлежит книге');
                    return { book_id: null }; // Диктант не принадлежит книге
                }
            } else {
                const errorText = await response.text();
                console.warn('⚠️ Ошибка при получении book_id:', response.status, errorText);
                return { book_id: null }; // Ошибка или диктант не принадлежит книге
            }
        }
        
        if (!bookId) {
            console.log('ℹ️ book_id не указан, пропускаем загрузку обложки');
            return { book_id: null };
        }
        
        // Загружаем информацию о книге
        const token = window.UM?.token || localStorage.getItem('jwt_token');
        if (!token) {
            console.warn('⚠️ Нет токена для загрузки информации о книге');
            return { book_id: bookId };
        }
        
        console.log('📡 Запрашиваю информацию о книге:', bookId);
        const bookResponse = await fetch(`/library/api/book/${bookId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (bookResponse.ok) {
            const bookData = await bookResponse.json();
            console.log('📦 Ответ API /book:', bookData);
            if (bookData.success && bookData.book) {
                const book = bookData.book;
                const bookCoverWrapper = document.getElementById('bookCoverWrapper');
                const bookCoverImage = document.getElementById('bookCoverImage');
                
                console.log('🖼️ Элементы обложки:', { bookCoverWrapper: !!bookCoverWrapper, bookCoverImage: !!bookCoverImage, cover_url: book.cover_url });
                
                if (bookCoverWrapper && bookCoverImage) {
                    if (book.cover_url) {
                        bookCoverImage.src = book.cover_url;
                        bookCoverImage.alt = book.title || 'Обложка книги';
                        bookCoverWrapper.style.display = 'flex';
                        // Добавляем tooltip с названием книги
                        bookCoverWrapper.title = book.title || '';
                        console.log('✅ Обложка книги отображена:', book.title);
                    } else {
                        console.log('ℹ️ У книги нет обложки');
                        bookCoverWrapper.style.display = 'none';
                    }
                } else {
                    console.warn('⚠️ Элементы обложки не найдены в DOM');
                }
                // Возвращаем book_id для установки в currentDictation
                return { book_id: bookId };
            }
        } else {
            const errorText = await bookResponse.text();
            console.warn('⚠️ Ошибка при получении информации о книге:', bookResponse.status, errorText);
            return { book_id: bookId }; // Все равно возвращаем book_id, даже если не удалось загрузить обложку
        }
    } catch (error) {
        console.error('❌ Ошибка при загрузке обложки книги:', error);
        return { book_id: null };
    }
    
    return { book_id: bookId };
}

/**
 * Обновить волну и поля для предложения (только в режиме sentence)
 */
function updateWaveformForSentence(sentence) {
    // Обновляем регион в волне для этого предложения
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        // СНАЧАЛА останавливаем текущее воспроизведение
        if (waveformCanvas.isPlaying) {
            waveformCanvas.stopAudioControl();
        }

        // Устанавливаем callback (на случай если он потерялся)
        setupWaveformRegionCallback();
        
        // Устанавливаем новый регион
        waveformCanvas.setRegion(sentence.start, sentence.end);

        // Сбрасываем playhead в начало нового региона
        waveformCanvas.setCurrentTime(sentence.start);
    }

    // Обновляем поля start/end
    if (startInput && endInput) {
        startInput.value = sentence.start.toFixed(2);
        endInput.value = sentence.end.toFixed(2);
    }
}

/**
 * Обновить информацию о текущем предложении
 */
function updateCurrentSentenceInfo(sentence) {
    const currentSentenceInfo = document.getElementById('currentSentenceInfo');
    if (currentSentenceInfo) {
        currentSentenceInfo.textContent = sentence.text || 'Текст не найден';
    }
}


/**
 * Вырезать кусочек аудио из общего файла для конкретного предложения
 * @param {Object} sentence - объект предложения с полями start, end, key
 * @param {string} language - язык аудио
 * @param {string} sourceAudioFileName - имя исходного общего аудио файла
 * @returns {Promise<string|null>} - имя созданного файла или null при ошибке
 */
async function trimAudioForSentence(sentence, language, sourceAudioFileName) {
    if (sentence.start === undefined || sentence.end === undefined || 
        sentence.start < 0 || sentence.end <= sentence.start) {
        console.warn('⚠️ Неверные значения start/end для предложения:', sentence.key);
        return null;
    }

    if (!sourceAudioFileName) {
        console.warn('⚠️ Не указан исходный аудио файл');
        return null;
    }

    try {
        const filePath = `${getAudioPath(language)}/${sourceAudioFileName}`;
        const outputFileName = `${sentence.key}_${language}_user.mp3`;
        
        // Используем эндпоинт /split-audio с одним предложением для создания отдельного файла
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: sourceAudioFileName,
                filepath: filePath,
                sentences: [{
                    key: sentence.key,
                    start_time: sentence.start,
                    end_time: sentence.end,
                    language: language
                }],
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Ошибка вырезания аудио: HTTP ${response.status}: ${errorText}`);
            return null;
        }

        const data = await response.json();

        if (data.success) {

            // Проверяем разные возможные форматы ответа
            let filename = null;
            
            // Вариант 1: файлы в массиве files
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                const createdFile = data.files.find(f => f.key === sentence.key);
                if (createdFile && createdFile.filename) {
                    filename = createdFile.filename;
                }
            }
            
            // Вариант 2: имя файла прямо в ответе
            if (!filename && data.filename) {
                filename = data.filename;
            }
            
            // Вариант 3: имя файла в поле с ключом предложения
            if (!filename && data[sentence.key]) {
                filename = data[sentence.key];
            }
            
            if (filename) {
                console.log(`✅ Вырезан кусочек для предложения ${sentence.key}: ${filename}`);
                return filename;
            } else {
                // Сервер вернул success: true, но не вернул имя файла - это ошибка на сервере
                console.error('❌ ОШИБКА СЕРВЕРА: success=true, но имя файла отсутствует в ответе');
                console.error('Ожидаемый ключ предложения:', sentence.key);
                console.error('Полный ответ сервера:', JSON.stringify(data, null, 2));
                return null;
            }
        } else {
            // Сервер вернул success: false
            console.error('❌ Сервер вернул ошибку при вырезании аудио:', data.error || 'Неизвестная ошибка');
            return null;
        }
    } catch (error) {
        console.error('❌ Ошибка при вырезании аудио для предложения:', error);
        return null;
    }
}

/**
 * Обрезать аудиофайл ножницами
 */
async function trimAudioFile(audioFileName, startTime, endTime) {
    // console.log('✂️ Обрезаем аудиофайл:', audioFile.filename, 'с', startTime, 'по', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Обрезание аудиофайла...');

    try {
        // Используем правильный путь к файлу на сервере
        // console.log('📤 Обрезаем файл на сервере:', audioFile.filepath);
        filePath = `${getAudioPath(currentDictation.language_original)}/${audioFileName}`;
        // Обрезаем файл на сервере
        const response = await fetch('/cut-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // ,
                // 'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({
                filename: audioFileName,
                filepath: filePath,
                start_time: startTime,
                end_time: endTime,
                language: currentDictation.language_original,
                dictation_id: currentDictation.id  // добавляем ID диктанта
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            loadWaveformForFile(data.filepath);

            // Автосохранение JSON удалено - данные только в workingData

            // Приводим все кнопки воспроизведения к состоянию ready (play)
            try {
                document.querySelectorAll('.audio-btn.audio-btn-table').forEach(btn => {
                    btn.dataset.state = 'ready';
                    btn.innerHTML = '<i data-lucide="play"></i>';
                });
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } catch (e) {
                console.warn('⚠️ Не удалось обновить состояние кнопок после обрезки:', e);
            }
        } else {
            console.error('❌ Ошибка обрезания аудио:', data.error);
            alert('Ошибка обрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка обрезания аудио:', error);
        alert('Ошибка обрезания аудио: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Обработчик воспроизведения аудио
 */
function handleAudioPlay() {
    // console.log('▶️ Воспроизводим аудио');
    // Здесь будет логика воспроизведения
}

/**
 * Обработчик кнопки Start
 */
function handleAudioStart() {
    // console.log('⏰ Устанавливаем время начала');

    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        console.log('❌ Волна не загружена');
        return;
    }

    // Получаем текущую позицию playhead
    const currentTime = waveformCanvas.getCurrentTime();

    // Обновляем поле Start
    if (startInput) {
        startInput.value = currentTime.toFixed(2);
    }

    // Обновляем регион волны
    const currentRegion = waveformCanvas.getRegion();
    setupWaveformRegionCallback();
    waveformCanvas.setRegion(currentTime, currentRegion.end);
}

/**
 * Обработчик кнопки End
 */
function handleAudioEnd() {
    // console.log('⏰ Устанавливаем время окончания');

    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        console.log('❌ Волна не загружена');
        return;
    }

    // Получаем текущую позицию playhead
    const currentTime = waveformCanvas.getCurrentTime();

    // Обновляем поле End
    const endTimeInput = document.getElementById('audioEndTime');
    if (endTimeInput) {
        endTimeInput.value = currentTime.toFixed(2);
    }

    // Обновляем регион волны
    const currentRegion = waveformCanvas.getRegion();
    setupWaveformRegionCallback();
    waveformCanvas.setRegion(currentRegion.start, currentTime);
}

// ============================================================================
// ОБРАБОТЧИКИ СТАРТОВОГО МОДАЛЬНОГО ОКНА
// ============================================================================

function setupStartModalHandlers() {
    // Чекбокс диалога
    const isDialogCheckbox = document.getElementById('isDialogCheckbox');
    if (isDialogCheckbox) {
        isDialogCheckbox.addEventListener('change', (e) => {
            toggleSpeakersTable(e.target.checked);
            updateCheckboxIcon(e.target.checked);
        });
    }

    // Обработчик для раскрашивания строк в textarea
    const startTextInput = document.getElementById('startTextInput');
    if (startTextInput) {
        setupTextareaHighlighting(startTextInput);
    }

    // Обработчики для переключения видимости колонок
    // console.log('🔧 Настраиваем обработчики переключения колонок...');
    setupColumnToggleHandlers();

    // Инициализируем начальное состояние - показываем оригинал и перевод
    const table = document.getElementById('sentences-table');
    if (table) {
        // Проверяем наличие элементов с групповыми классами
        const originalElements = table.querySelectorAll('.panel-original');
        const translationElements = table.querySelectorAll('.panel-translation');
        const editingElements = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');

        table.classList.add('state-original-translation');
        // Обновляем иконку кнопки для начального состояния
        // updateToggleButtonIcon('open_left_panel_original', 'translation');
    } else {
        console.error('❌ Таблица sentences-table не найдена при инициализации!');
    }

    // Обработчики для боковой панели настроек аудио
    setupAudioSettingsModalHandlers();

    // Кнопка добавления спикера
    const addSpeakerBtn = document.getElementById('addSpeakerBtn');
    if (addSpeakerBtn) {
        addSpeakerBtn.addEventListener('click', addSpeaker);
    }

    // Обработчики удаления спикеров
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-speaker')) {
            removeSpeaker(e.target);
        }
    });

    // Кнопки модального окна
    const cancelStartBtn = document.getElementById('cancelStartBtn');
    if (cancelStartBtn) {
        cancelStartBtn.addEventListener('click', () => {
            try {
                const mode = window.__DICTATION_EDITOR_START_MODAL_MODE;
                if (mode === 'refill') {
                    closeStartModal();
                    return;
                }
            } catch (e) {
            }
            cancelDictationCreation();
        });
    }

    const createDictationBtn = document.getElementById('createDictationBtn');
    if (createDictationBtn) {
        createDictationBtn.addEventListener('click', createDictationFromStart);
    }

    // Title field inside start modal: mirror to main title and auto-translate.
    const startTitleInput = document.getElementById('startTitleInput');
    if (startTitleInput) {
        startTitleInput.addEventListener('input', () => {
            try {
                const titleInput = document.getElementById('title');
                if (titleInput) {
                    titleInput.value = startTitleInput.value;
                }
                const tabTitleInput = document.getElementById('tabTitle');
                if (tabTitleInput) {
                    tabTitleInput.value = startTitleInput.value;
                }
                try { setDictationNameTitle(startTitleInput.value); } catch (e) {}
                try {
                    if (workingData && workingData.original) {
                        workingData.original.title = startTitleInput.value;
                    }
                } catch (e) {
                }
                setDirtyFlags({ db: true });
                updateUnsavedStar();
            } catch (e) {
            }
        });

        startTitleInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await autoTranslateTitleIntoMainFields(startTitleInput.value);
            }
        });

        startTitleInput.addEventListener('blur', async () => {
            await autoTranslateTitleIntoMainFields(startTitleInput.value);
        });
    }

    // Кнопка "Внести текст заново"
    const refillTableBtn = document.getElementById('refillTableBtn');
    if (refillTableBtn) {
        refillTableBtn.addEventListener('click', () => {
            if (confirm('Это удалит все существующие предложения и аудио. Продолжить?')) {
                try {
                    window.__DICTATION_EDITOR_START_MODAL_MODE = 'refill';
                } catch (e) {
                }

                // Открыть стартовое модальное окно (реальная очистка будет только после "Сформировать")
                openStartModal();
            }
        });
    }

    // Кнопка переключения видимости колонки explanation
    const toggleExplanationBtn = document.getElementById('toggleExplanationBtn');
    if (toggleExplanationBtn) {
        toggleExplanationBtn.addEventListener('click', toggleExplanationColumn);
    }

    // Кнопка "Сохранить диктант"
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await handleSave();
        });
    }

    // Кнопка "Вернуться к списку диктантов"
    const exitToIndexBtn = document.getElementById('exitToIndexBtn');
    if (exitToIndexBtn) {
        exitToIndexBtn.addEventListener('click', () => {
            showExitModal();
        });
    }

    // Обработчики модального окна выхода
    const exitModal = document.getElementById('exitModal');
    const exitStayBtn = document.getElementById('exitStayBtn');
    const exitWithoutSavingBtn = document.getElementById('exitWithoutSavingBtn');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');

    if (exitStayBtn) {
        exitStayBtn.addEventListener('click', () => {
            if (exitModal) exitModal.style.display = 'none';
        });
    }

    if (exitWithoutSavingBtn) {
        exitWithoutSavingBtn.addEventListener('click', () => {
            if (exitModal) exitModal.style.display = 'none';
            cleanupTempAndExit();
        });
    }

    if (exitWithSavingBtn) {
        exitWithSavingBtn.addEventListener('click', async () => {
            if (exitModal) exitModal.style.display = 'none';
            await handleSaveAndExit();
        });
    }

    // Закрытие модального окна по клику вне его
    if (exitModal) {
        exitModal.addEventListener('click', (e) => {
            if (e.target === exitModal) {
                exitModal.style.display = 'none';
            }
        });
    }

    // Обработка клавиши Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && exitModal && exitModal.style.display === 'flex') {
            exitModal.style.display = 'none';
        }
    });

    // Закрытие модального окна по клику вне его
    const startModal = document.getElementById('startModal');
    if (startModal) {
        startModal.addEventListener('click', (e) => {
            if (e.target === startModal) {
                closeStartModal();
            }
        });
    }
}

function openStartModal() {
    const modal = document.getElementById('startModal');

    if (modal) {
        try {
            if (!window.__DICTATION_EDITOR_START_MODAL_MODE) {
                window.__DICTATION_EDITOR_START_MODAL_MODE = 'create';
            }
        } catch (e) {
        }
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        try {
            initStartModalLanguageSelector();
        } catch (e) {
        }

    } else {
        console.error('❌ Элемент startModal не найден!');
    }
}

function initStartModalLanguageSelector() {
    try {
        const container = document.getElementById('startModalLangPair');
        if (!container) return;

        const initSelector = () => {
            try {
                if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
                    setTimeout(initSelector, 100);
                    return;
                }

                const languageData = window.LanguageManager.getLanguageData();
                if (!languageData) {
                    setTimeout(initSelector, 100);
                    return;
                }

                // Default original language: from current dictation/category or user profile.
                let defaultLearning = '';
                try {
                    defaultLearning = (currentDictation && currentDictation.language_original) ? String(currentDictation.language_original) : '';
                } catch (e0) {
                    defaultLearning = '';
                }
                if (!defaultLearning) {
                    try {
                        defaultLearning = (window.USER_LANGUAGE_DATA && (window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage))
                            ? String(window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage)
                            : '';
                    } catch (e1) {
                        defaultLearning = '';
                    }
                }
                if (!defaultLearning) {
                    defaultLearning = 'en';
                }

                // Translation language stays fixed from the dictation/category.
                let nativeLang = '';
                try {
                    nativeLang = (currentDictation && currentDictation.language_translation) ? String(currentDictation.language_translation) : '';
                } catch (e2) {
                    nativeLang = '';
                }
                if (!nativeLang) nativeLang = 'ru';

                // New UI: use manager mode (2) flag dropdown - arrow - flag dropdown.
                const rightDefault = nativeLang;
                const leftDefault = defaultLearning;
                const baseData = window.LanguageManager ? window.LanguageManager.getLanguageData() : null;
                if (!baseData) return;

                const allLangs = Object.keys(baseData)
                    .map(x => String(x || '').toLowerCase())
                    .filter(Boolean);

                // UX requirement:
                // - clicking the LEFT flag allows choosing any language (no exclusions)
                // - clicking the RIGHT flag allows choosing any language except the current original
                const leftList = allLangs;
                const rightList = allLangs.filter(x => x !== leftDefault);

                container.innerHTML = '';

                const buildSelector = ({ left, right }) => {
                    const leftCode = left ? String(left).toLowerCase() : '';
                    const rightCode = right ? String(right).toLowerCase() : '';

                    const nextLeft = leftCode || leftDefault;
                    let nextRight = rightCode || rightDefault;
                    if (nextRight === nextLeft) {
                        nextRight = (allLangs.find(x => x !== nextLeft) || rightDefault || 'ru');
                    }

                    container.innerHTML = '';
                    startModalLanguageSelector = window.initLanguageSelector('startModalLangPair', {
                        mode: 'flag-pair-dropdown-both',
                        currentLearning: nextLeft,
                        nativeLanguage: nextRight,
                        learningLanguages: allLangs,
                        nativeLanguages: allLangs.filter(x => x !== nextLeft),
                        languageData: baseData,
                        onLanguageChange: function (values) {
                            try {
                                const leftV = values && values.currentLearning ? String(values.currentLearning).toLowerCase() : '';
                                const rightV = values && values.nativeLanguage ? String(values.nativeLanguage).toLowerCase() : '';
                                if (leftV) currentDictation.language_original = leftV;
                                if (rightV) currentDictation.language_translation = rightV;
                            } catch (e) {
                            }
                            try {
                                buildSelector({
                                    left: values && values.currentLearning ? values.currentLearning : nextLeft,
                                    right: values && values.nativeLanguage ? values.nativeLanguage : nextRight,
                                });
                            } catch (e2) {
                            }
                        }
                    });
                };

                buildSelector({ left: leftDefault, right: rightDefault });
            } catch (e) {
            }
        };

        initSelector();
    } catch (e) {
    }
}

function initStartModalTranslationLanguageSelector() {
    try {
        // Now handled by initStartModalLanguageSelector via flag-pair-dropdown-both
        return;

        const initSelector = () => {
            try {
                if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
                    setTimeout(initSelector, 100);
                    return;
                }

                const languageData = window.LanguageManager.getLanguageData();
                if (!languageData) {
                    setTimeout(initSelector, 100);
                    return;
                }

                // Default translation language: user's native language.
                let defaultTranslation = '';
                try {
                    defaultTranslation = (currentDictation && currentDictation.language_translation)
                        ? String(currentDictation.language_translation).toLowerCase()
                        : '';
                } catch (e0) {
                    defaultTranslation = '';
                }
                if (!defaultTranslation) {
                    try {
                        defaultTranslation = (window.USER_LANGUAGE_DATA && (window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang))
                            ? String(window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang).toLowerCase()
                            : '';
                    } catch (e1) {
                        defaultTranslation = '';
                    }
                }
                if (!defaultTranslation) defaultTranslation = 'ru';

                // Exclude original language from translation options.
                let originalLang = '';
                try {
                    originalLang = String(getStartModalOriginalLanguage() || '').toLowerCase();
                } catch (e2) {
                    originalLang = '';
                }

                const filtered = { ...(languageData || {}) };
                try {
                    if (originalLang && Object.prototype.hasOwnProperty.call(filtered, originalLang)) {
                        delete filtered[originalLang];
                    }
                } catch (e3) {
                }

                // Reset container to avoid duplicated DOM.
                container.innerHTML = '';

                if (typeof window.initLanguageSelector === 'function') {
                    startModalTranslationLanguageSelector = window.initLanguageSelector('startModalTranslationLanguage', {
                        mode: 'native-selector',
                        nativeLanguage: (filtered && filtered[defaultTranslation]) ? defaultTranslation : (Object.keys(filtered)[0] || defaultTranslation),
                        languageData: filtered,
                        onLanguageChange: function (values) {
                            try {
                                const next = values && values.nativeLanguage ? String(values.nativeLanguage).toLowerCase() : '';
                                if (!next) return;
                                currentDictation.language_translation = next;
                            } catch (e) {
                            }
                        }
                    });
                }
            } catch (e) {
            }
        };

        initSelector();
    } catch (e) {
    }
}

function getStartModalOriginalLanguage() {
    try {
        if (startModalLanguageSelector && typeof startModalLanguageSelector.getValues === 'function') {
            const v = startModalLanguageSelector.getValues();
            const lang = v && v.currentLearning ? String(v.currentLearning).trim() : '';
            if (lang) return lang;
        }
    } catch (e) {
    }
    try {
        return currentDictation && currentDictation.language_original ? String(currentDictation.language_original).trim() : '';
    } catch (e) {
        return '';
    }
}

function getStartModalTranslationLanguage() {
    try {
        if (startModalLanguageSelector && typeof startModalLanguageSelector.getValues === 'function') {
            const v = startModalLanguageSelector.getValues();
            const lang = v && v.nativeLanguage ? String(v.nativeLanguage).trim().toLowerCase() : '';
            if (lang) return lang;
        }
    } catch (e) {
    }
    try {
        const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
            ? String(window.USER_LANGUAGE_DATA.nativeLanguage).trim().toLowerCase()
            : '';
        if (nativeLang) return nativeLang;
    } catch (e) {
    }
    try {
        const fallback = currentDictation && currentDictation.language_translation ? String(currentDictation.language_translation).trim().toLowerCase() : '';
        if (fallback) return fallback;
    } catch (e) {
    }
    return 'ru';
}

async function autoTranslateTitleIntoMainFields(originalTitle) {
    try {
        const titleInput = document.getElementById('title');
        const translationTitleInput = document.getElementById('title_translation');
        if (!titleInput || !translationTitleInput) return;

        const t = String(originalTitle || '').trim();
        if (!t) return;

        const translatedTitle = await translateTextForEditing(
            t,
            currentDictation.language_original,
            currentDictation.language_translation
        );
        translationTitleInput.value = translatedTitle;
        try {
            updateTitlesInWorkingData();
        } catch (e) {
        }
        try {
            setDirtyFlags({ db: true });
            updateUnsavedStar();
        } catch (e) {
        }
    } catch (e) {
    }
}

function closeStartModal() {
    const modal = document.getElementById('startModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    try {
        window.__DICTATION_EDITOR_START_MODAL_MODE = 'create';
    } catch (e) {
    }
}

let translationsTabLanguageSelector = null;

function getTranslationLanguagesSelected() {
    try {
        if (translationsTabLanguageSelector && typeof translationsTabLanguageSelector.getValues === 'function') {
            const v = translationsTabLanguageSelector.getValues();
            const langs = v && Array.isArray(v.learningLanguages) ? v.learningLanguages : [];
            return langs
                .map(x => String(x || '').trim().toLowerCase())
                .filter(Boolean);
        }
    } catch (e) {
    }
    return [];
}

function isReservedWorkingDataKey(k) {
    return k === 'original' || k === 'translations';
}

function isLanguageCodeLike(k) {
    try {
        const s = String(k || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'original' || s === 'translations') return false;
        // allow 'en', 'ru', 'pt-br' etc.
        return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(s);
    } catch (e) {
        return false;
    }
}

function initTranslationsTab() {
    try {
        initTranslationsTabV2();
    } catch (e) {
    }
}

async function cancelDictationCreation() {
    try {
        // console.log('🚫 Отмена создания диктанта...');

        // Очищаем temp папку если есть диктант в работе
        if (currentDictation && currentDictation.id && currentDictation.isNew) {
            // console.log('🧹 Очищаем temp папку для диктанта:', currentDictation.id);

            const response = await fetch('/cleanup_temp_dictation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dictation_id: tempDictationId,
                    safe_email: currentDictation.safe_email
                })
            });
        }

        // Возвращаемся на главную страницу
        // Позиция в дереве сохранится автоматически, так как мы используем sessionStorage
        goToMainPage();

    } catch (error) {
        console.error('❌ Ошибка при отмене создания диктанта:', error);
        // В случае ошибки все равно возвращаемся на главную
        goToMainPage();
    }
}

function toggleSpeakersTable(show) {
    const speakersTable = document.getElementById('speakersTable');
    if (speakersTable) {
        speakersTable.style.display = show ? 'table' : 'none';
    }
}

function updateCheckboxIcon(isChecked) {
    const checkboxIcon = document.querySelector('#isDialogCheckbox + .checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check-big' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function updateExplanationColumnVisibility() {
    const table = document.getElementById('sentences-table');
    if (!table) return;
    const isGeneralTab = currentTabName === 'general';
    const displayValue = (isGeneralTab && explanationVisible) ? 'table-cell' : 'none';
    
    // Находим все колонки explanation
    const headerCells = table.querySelectorAll('th.col-explanation');
    const dataCells = table.querySelectorAll('td.col-explanation');

    headerCells.forEach(cell => cell.style.display = displayValue);
    dataCells.forEach(cell => cell.style.display = displayValue);

    // Управляем кнопкой
    const toggleBtn = document.getElementById('toggleExplanationBtn');
    if (toggleBtn) {
        toggleBtn.style.display = isGeneralTab ? '' : 'none';
    }

    const toggleIcon = document.querySelector('.toggle-explanation-icon');
    if (toggleIcon) {
        toggleIcon.setAttribute('data-lucide', explanationVisible ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function toggleExplanationColumn() {
    explanationVisible = !explanationVisible;
    updateExplanationColumnVisibility();
}

function addSpeaker() {
    const tbody_speakers = document.querySelector('#speakersTableContent tbody');
    if (!tbody_speakers) return;

    const speakerCount = tbody_speakers.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${speakerCount}:</td>
        <td><input type="text" value="Спикер ${speakerCount}" class="speaker-name" placeholder="Имя спикера"></td>
        <td><button type="button" class="remove-speaker" title="Удалить спикера">
        <i data-lucide="trash-2"></i>
        </button></td>
    `;
    tbody_speakers.appendChild(row);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function removeSpeaker(button) {
    const row = button.closest('tr');
    const tbody = document.querySelector('#speakersTableContent tbody');
    if (row && tbody && tbody.children.length > 1) {
        row.remove();
        // Перенумеровать оставшихся спикеров
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.cells[0].textContent = `${index + 1}:`;
        });
    }
}
async function createDictationFromStart() {
    const startEl = document.getElementById('startTextInput');
    const rawText = (startEl && (startEl.innerText || startEl.textContent)) ? (startEl.innerText || startEl.textContent) : '';
    const text = normalizeDictationInvisibleChars(normalizeNewlines(rawText)).trim();
    const delimiter = document.getElementById('translationDelimiter').value.trim();
    const isDialog = document.getElementById('isDialogCheckbox').checked;

    let isRefill = false;
    try {
        isRefill = window.__DICTATION_EDITOR_START_MODAL_MODE === 'refill';
    } catch (e) {
        isRefill = false;
    }

    // Apply selected languages from modal.
    let modalLang = '';
    let modalTr = '';
    try {
        modalLang = normalizeLangCode(getStartModalOriginalLanguage());
    } catch (e) {
        modalLang = '';
    }
    try {
        modalTr = normalizeLangCode(getStartModalTranslationLanguage());
    } catch (e) {
        modalTr = '';
    }
    try {
        if (modalLang) currentDictation.language_original = modalLang;
        if (modalTr) currentDictation.language_translation = modalTr;
    } catch (e) {
    }

    // IMPORTANT: ensure translation bucket exists BEFORE rendering header flags.
    // Otherwise header render may wipe currentDictation.language_translation when activeTranslations is empty.
    try {
        if (modalTr) {
            ensureTranslation(modalTr);
            currentDictation.translation_flags = currentDictation.translation_flags || {};
            currentDictation.translation_flags[modalTr] = true;
        }
    } catch (e) {
    }

    try {
        initLanguageFlags({
            original_language: currentDictation.language_original,
            translation_language: currentDictation.language_translation,
            dictation_id: 'new'
        });
    } catch (e) {
    }

    // If refill: clear existing data only now (user confirmed by clicking "Сформировать").
    if (isRefill) {
        try {
            const tbody = document.querySelector('#sentences-table tbody');
            if (tbody) {
                tbody.innerHTML = '';
            }
        } catch (e) {
        }

        try {
            const reenterTextSection = document.getElementById('reenterTextSection');
            if (reenterTextSection) {
                reenterTextSection.style.display = 'none';
            }
        } catch (e) {
        }

        try {
            if (workingData && workingData.original) {
                workingData.original.sentences = [];
            }
        } catch (e) {
        }

        // Always clear ALL translations (including passive buckets).
        try {
            if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                Object.keys(workingData.translations).forEach((k) => {
                    const bucket = workingData.translations[k];
                    if (bucket && typeof bucket === 'object' && Array.isArray(bucket.sentences)) {
                        bucket.sentences = [];
                    }
                });
            }
        } catch (e) {
        }
    }

    try {
        const startTitleInput = document.getElementById('startTitleInput');
        const titleVal = startTitleInput ? String(startTitleInput.value || '') : '';
        const titleInput = document.getElementById('title');
        if (titleInput) {
            titleInput.value = titleVal;
        }
        const tabTitleInput = document.getElementById('tabTitle');
        if (tabTitleInput) {
            tabTitleInput.value = titleVal;
        }
        try { setDictationNameTitle(titleVal); } catch (e2) {}
        try {
            if (workingData && workingData.original) {
                workingData.original.title = titleVal;
            }
        } catch (e3) {
        }
        // Ensure translation title exists by auto translating on create.
        await autoTranslateTitleIntoMainFields(titleVal);
    } catch (e) {
    }

    if (!text) {
        alert('Введите текст диктанта');
        return;
    }

    // Показываем индикатор загрузки
    showLoadingIndicator('Формирование диктанта...');

    try {
        const speakers = isDialog ? getSpeakersFromTable() : { '1': 'Спикер 1' };

        // Парсинг текста
        const parsedData = await parseInputText(text, delimiter, isDialog, speakers);

        try {
            if (parsedData && Array.isArray(parsedData.original)) {
                parsedData.original.forEach((s, idx) => {
                    if (s && typeof s === 'object') s.position = idx + 1;
                });
            }
            if (parsedData && Array.isArray(parsedData.translation)) {
                parsedData.translation.forEach((s, idx) => {
                    if (s && typeof s === 'object') s.position = idx + 1;
                });
            }
        } catch (e) {
        }

        // Обновить глобальные данные
        currentDictation.is_dialog = isDialog;
        currentDictation.speakers = speakers;

        workingData.original = {
            language: currentDictation.language_original,
            title: document.getElementById('title').value || 'Диктант',
            speakers: speakers,
            sentences: parsedData.original
        };

        try {
            const activeTr = normalizeLangCode(currentDictation && currentDictation.language_translation);
            if (activeTr) {
                const trObj = ensureTranslation(activeTr);
                if (trObj) {
                    trObj.language = activeTr;
                    trObj.title = document.getElementById('title_translation').value || 'Перевод';
                    trObj.speakers = speakers;
                    trObj.sentences = parsedData.translation;
                }
            }
        } catch (e) {
        }

        // For all selected translation languages, create corresponding empty buckets
        // with the same keys/positions. UI shows only the active translation language,
        // but data must exist for all translations to keep +/delete/save consistent.
        try {
            const origLang = String(currentDictation.language_original || '').trim().toLowerCase();
            const activeTr = String(currentDictation.language_translation || '').trim().toLowerCase();
            const selected = new Set(getTranslationLanguagesSelected());
            if (origLang) selected.delete(origLang);

            const origSent = (workingData && workingData.original && Array.isArray(workingData.original.sentences))
                ? workingData.original.sentences
                : [];
            for (const lang of selected) {
                const code = String(lang || '').trim().toLowerCase();
                if (!code) continue;
                if (code === activeTr) continue; // active translation already has data
                const bucket = ensureTranslation(code);
                if (!bucket) continue;
                bucket.language = code;
                bucket.speakers = speakers;
                bucket.sentences = origSent.map((s) => ({
                    key: s && (s.key || s.sentence_key) ? String(s.key || s.sentence_key) : '',
                    position: (s && s.position !== undefined && s.position !== null) ? s.position : null,
                    text: '',
                    audio: '',
                    audio_avto: '',
                    audio_user: '',
                    audio_mic: '',
                    start: 0,
                    end: 0,
                    chain: false,
                    explanation: ''
                })).filter(x => x && x.key);
            }
        } catch (e) {
        }

        // Mark as changed: both text/structure and generated media are new.
        try {
            setDirtyFlags({ db: true, audio: true });
            markAsUnsaved();
            updateUnsavedStar();
        } catch (e) {
        }

        // Immediately reflect title in the header near stars.
        try {
            const t = document.getElementById('title') ? document.getElementById('title').value : '';
            setDictationNameTitle(t);
        } catch (e) {
        }

        // Показать кнопку "Внести заново"
        const reenterTextSection = document.getElementById('reenterTextSection');
        if (reenterTextSection) {
            reenterTextSection.style.display = 'block';
        }

        // Обновляем данные диалога во вкладке
        updateDialogTab();

        // Создать таблицу
        await createTable();
        
        // Обновить выпадающие списки спикеров после создания таблицы
        refreshAllSpeakerSelectOptions();

        // Очистить поле ввода текста в модальном окне
        const startTextInput = document.getElementById('startTextInput');
        if (startTextInput) {
            startTextInput.innerHTML = '';
        }

        // Закрыть модальное окно
        closeStartModal();

        try {
            window.__DICTATION_EDITOR_START_MODAL_MODE = 'create';
        } catch (e) {
        }

    } catch (error) {
        console.error('Ошибка при создании диктанта:', error);
        alert('Ошибка при создании диктанта: ' + error.message);
    } finally {
        // Скрываем индикатор загрузки
        hideLoadingIndicator();
    }
}

// Добавляем обработчик для предотвращения случайного закрытия страницы
window.addEventListener('beforeunload', function (event) {
    try {
        if (window.__DICTATION_EDITOR_IS_EXITING) return;
    } catch (e) {
    }

    try {
        if (window.__DICTATION_EDITOR_IS_SAVING) {
            event.preventDefault();
            event.returnValue = 'Идёт сохранение. Пожалуйста, дождитесь окончания.';
            return event.returnValue;
        }
    } catch (e) {
    }
    if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = 'У вас есть несохраненные изменения! Вы действительно хотите покинуть страницу?';
        return event.returnValue;
    }
});

/**
 * Обработчик клика по логотипу - проверяет несохраненные изменения
 */
function handleLogoClick() {
    showExitModal();
}

/**
 * Показывает модальное окно выхода
 */
function showExitModal() {
    const exitModal = document.getElementById('exitModal');
    if (!exitModal) return;

    try {
        if (window.__DICTATION_EDITOR_IS_SAVING) {
            return;
        }
    } catch (e) {
    }

    try {
        if (window.__DICTATION_EDITOR_IS_EXITING) {
            cleanupTempAndExit();
            return;
        }
    } catch (e) {
    }

    // Проверяем: новый диктант и не создан в БД = нет сохранённых данных
    const isNewNotSaved = currentDictation.isNew && !currentDictation.db_id;
    const hasUnsaved = isNewNotSaved || hasUnsavedChanges();
    
    // Если всё сохранено - просто выходим без вопросов
    if (!hasUnsaved) {
        cleanupTempAndExit();
        return;
    }
    
    // Если есть несохранённые изменения - показываем модальное окно
    const exitModalMessage = document.getElementById('exitModalMessage');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');

    if (exitModalMessage) {
        exitModalMessage.textContent = 'Сохранить изменения?';
    }

    if (exitWithSavingBtn) {
        exitWithSavingBtn.style.display = '';
    }

    exitModal.style.display = 'flex';
    const stayBtn = document.getElementById('exitStayBtn');
    if (stayBtn) stayBtn.focus();
}

/**
 * Обработчик кнопки "Сохранить" с индикацией процесса
 */
async function handleSave() {
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i data-lucide="loader-2"></i>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
        
        try {
            try { window.__DICTATION_EDITOR_IS_SAVING = true; } catch (e) {}
            await saveDictationOnly();
            updateUnsavedStar();
        } catch (error) {
            console.error('[Save] error', error);
        } finally {
            try { window.__DICTATION_EDITOR_IS_SAVING = false; } catch (e) {}
            saveBtn.innerHTML = originalHTML;
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            saveBtn.disabled = false;
        }
    }
}

/**
 * Обновляет отображение звездочки несохраненных изменений
 */
function updateUnsavedStar() {
    const flags = getDirtyFlags();
    const hasUnsaved = hasUnsavedChanges();
    const isNewNotSaved = currentDictation && currentDictation.isNew && !currentDictation.db_id;

    const unsavedStar = document.getElementById('unsavedStar');
    if (unsavedStar) {
        unsavedStar.style.display = 'none';
    }

    const dbStar = document.getElementById('unsavedStarDb');
    if (dbStar) {
        dbStar.style.display = (flags.db || isNewNotSaved) ? 'inline-flex' : 'none';
        dbStar.style.color = 'var(--color-button-text-lightgreen)';
        dbStar.title = 'Изменения в тексте/БД';
    }

    const audioStar = document.getElementById('unsavedStarAudio');
    if (audioStar) {
        audioStar.style.display = flags.audio ? 'inline-flex' : 'none';
        audioStar.style.color = 'var(--color-button-purple)';
        audioStar.title = 'Изменения в аудио';
    }

    const coverStar = document.getElementById('unsavedStarCover');
    if (coverStar) {
        coverStar.style.display = flags.cover ? 'inline-flex' : 'none';
        coverStar.style.color = 'var(--color-button-text-yellow)';
        coverStar.title = 'Изменения в обложке';
    }
}

/**
 * Обработчик сохранения и выхода
 */
async function handleSaveAndExit() {
    await saveDictationOnly();
    cleanupTempAndExit();
}

/**
 * Проверяет есть ли несохраненные изменения
 */
function hasUnsavedChanges() {
    const flags = getDirtyFlags();
    const isNewNotSaved = currentDictation.isNew && !currentDictation.db_id;
    return !!(isNewNotSaved || flags.db || flags.audio || flags.cover);
}

/**
 * Вызывается при изменении данных - обновляет звездочку и флаг сохраненности
 */
function markAsUnsaved() {
    if (currentDictation.isSaved) {
        currentDictation.isSaved = false;
    }
    setDirtyFlags({ db: true });
}

/**
 * Сохраняет диктант без выхода со страницы
 */
async function saveDictationOnly() {
    try {
        await waitCoverPendingBeforeSave(2500);
    } catch (e) {
    }
    // Синхронизируем данные из вкладок перед сохранением
    syncSpeakersFromTab();
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    if (tabIsDialogCheckbox) {
        currentDictation.is_dialog = tabIsDialogCheckbox.checked;
    }
    
    // Если это НЕ диалог, очищаем всех спикеров перед сохранением,
    // чтобы в БД не оставались старые «Спикер 1», «Спикер 2» и т.п.
    if (!currentDictation.is_dialog) {
        currentDictation.speakers = {};
    }
    
    try {
        const flagsBefore = { ...getDirtyFlags() };
        const isNewNotSaved = currentDictation.isNew && !currentDictation.db_id;
        const shouldSaveDb = !!(isNewNotSaved || flagsBefore.db);
        // For brand-new dictations, media may already exist in cache but dirty flags may still be false
        // (e.g. generated as part of creation flow). We still want to attempt upload to B2 after the
        // first successful Save; upload helpers will no-op if no cached files are found.
        const shouldUploadAudio = !!(flagsBefore.audio || isNewNotSaved);
        const shouldUploadCover = !!(flagsBefore.cover || isNewNotSaved);

        // Online-first invariant:
        // if dictation is new and has no DB id yet, we must be online to obtain the final dict_... id.
        if (isNewNotSaved) {
            try {
                if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                    alert('Сейчас нет интернета — новый диктант сохранить нельзя. Подключись к интернету и попробуй ещё раз.');
                    return;
                }
            } catch (e) {
            }
        }

        if (!shouldSaveDb && !shouldUploadAudio && !shouldUploadCover) {
            return;
        }

        // Показываем индикатор загрузки
        showLoadingIndicator('Сохранение диктанта...');

        // Для новых диктантов создание в БД происходит в save_dictation_final()
        // Здесь просто проверяем, что у нас есть временный ID
        if (!currentDictation.id || currentDictation.id === 'new') {
            throw new Error('Отсутствует ID диктанта');
        }

        // Получаем user_id из UserManager или из API
        let user_id = currentDictation.user_id;
        if (!user_id && window.UM && window.UM.getCurrentUser) {
            const user = window.UM.getCurrentUser();
            if (user && user.id) {
                user_id = user.id;
            }
        }
        
        // Собираем переводы заголовка
        const titleTranslationValue = document.getElementById('title_translation')?.value || '';
        const titleTranslations = currentDictation.title_translations || {};
        // Обновляем перевод для текущего языка перевода
        try {
            const tl = normalizeLangCode(currentDictation.language_translation);
            if (tl && titleTranslationValue) {
                titleTranslations[tl] = titleTranslationValue;
            }
        } catch (e) {
        }
        
        // Собираем author_materials_url
        const authorMaterialsUrlInput = document.getElementById('dictation-author-materials-url-input');
        const authorMaterialsUrl = authorMaterialsUrlInput ? authorMaterialsUrlInput.value.trim() || null : null;
        
        // Build sentences payload using the translations SSOT model (workingData.translations).
        const sentencesPayload = (() => {
            try {
                const out = {};
                const origLang = normalizeLangCode(currentDictation.language_original);
                if (origLang && workingData && workingData.original) {
                    out[origLang] = workingData.original;
                }

                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const lang = normalizeLangCode(k);
                        if (!lang || lang === origLang) continue;
                        const obj = workingData.translations[k];
                        if (obj) out[lang] = obj;
                    }
                }

                return out;
            } catch (e) {
                return {
                    [currentDictation.language_original]: workingData.original,
                    [currentDictation.language_translation]: getCurrentTranslationData({ createIfMissing: true })
                };
            }
        })();

        // Подготавливаем данные для сохранения
        const saveData = {
            id: currentDictation.id,
            temp_id: currentDictation.id,
            db_id: currentDictation.db_id,
            user_id: user_id,  // ID пользователя для пути temp/<user_id>/
            language_original: currentDictation.language_original,
            language_translation: currentDictation._persisted_language_translation || currentDictation.language_translation,
            title: workingData.original.title || 'Без названия',
            title_translations: titleTranslations,  // Переводы заголовка
            level: currentDictation.level || 'A1',
            is_dialog: currentDictation.is_dialog || false,
            speakers: currentDictation.speakers || {},
            author_materials_url: authorMaterialsUrl,  // Ссылка на материалы автора
            sentences: sentencesPayload,
            category_key: currentDictation.category_key,
            // Если диктант создан из приватной библиотеки, сюда попадёт ID книги/раздела
            book_id: currentDictation.book_id || null
        };

        // Проверяем наличие токена
        // Используем jwt_token (как в user_manager.js) или токен из UserManager
        let token = null;
        if (window.UM && window.UM.token) {
            token = window.UM.token;
        } else {
            token = localStorage.getItem('jwt_token');
        }
        
        if (!token) {
            alert('Ошибка: отсутствует токен авторизации. Пожалуйста, войдите в систему заново.');
            hideLoadingIndicator();
            return;
        }
        
        // Получаем user_id из API, если он не установлен
        if (!saveData.user_id) {
            try {
                const userResponse = await fetch('/user/api/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData && userData.id) {
                        saveData.user_id = userData.id;
                        currentDictation.user_id = userData.id;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Не удалось получить user_id из API:', e);
            }
        }
        
        // category_key больше не обязателен на клиенте: сервер сам проставит дефолт,
        // либо диктант будет привязан к книге/разделу через book_id
        
        // Если изменилось только медиа — не трогаем БД/текст.
        if (!shouldSaveDb) {
            try {
                const toId = currentDictation.id;
                if (shouldUploadAudio && toId && String(toId).startsWith('dict_')) {
                    try {
                        await commitDraftAudioBlobsToFinalCache(toId);
                    } catch (e) {
                    }
                    try {
                        const resAudio = await uploadAudioThenCleanupB2({ dictationId: toId, token });
                        if (resAudio && resAudio.ok === true) {
                            setDirtyFlags({ audio: false });
                        }
                    } catch (e) {
                    }
                }
                if (shouldUploadCover && toId && String(toId).startsWith('dict_')) {
                    try {
                        const resCover = await uploadDictationCoverFromCacheToB2({ dictationId: toId, token });
                        if (resCover && resCover.ok === true) {
                            setDirtyFlags({ cover: false });
                        }
                    } catch (e) {
                    }
                }
            } catch (e) {
            }

            // DB не трогали, медиа попытались отправить синхронно (блокирующий UX).
            // Чистим только то, что реально успешно ушло.
            try {
                const f = getDirtyFlags();
                if (!f.db && !f.audio && !f.cover) {
                    currentDictation.isSaved = true;
                }
            } catch (e) {
            }
            updateUnsavedStar();
            hideLoadingIndicator();
            return;
        }

        // Отправляем данные на сервер для сохранения предложений и обновления диктанта
        const response = await fetch('/save_dictation_final', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(saveData)
        });

        // Проверяем статус ответа перед парсингом JSON
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Ошибка HTTP:', {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText
            });
            
            let errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.msg || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            
            alert('Ошибка сохранения диктанта: ' + errorMessage);
            hideLoadingIndicator();
            return;
        }
        
        const result = await response.json();

        if (result.success) {
            // Если диктант был создан в БД - обновляем ID
            if (result.dictation_id && result.db_id) {
                currentDictation.id = result.dictation_id;
                currentDictation.db_id = result.db_id;
                currentDictation.isNew = false;
                
                // Показываем ID
                const dictationIdElement = document.getElementById('dictation-id');
                if (dictationIdElement) {
                    dictationIdElement.textContent = `id: ${result.dictation_id}`;
                    dictationIdElement.style.display = '';
                }
            }

            try {
                const deskDbId = (result && result.db_id) ? Number(result.db_id) : null;
                if (deskDbId && isFinite(deskDbId) && deskDbId > 0) {
                    await fetch(`/library/api/dictation/${deskDbId}/add-to-desk`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({})
                    });
                }
            } catch (e) {
            }
            
            // Обновляем title_translations в currentDictation
            currentDictation.title_translations = titleTranslations;
            
            // DB сохранено
            setDirtyFlags({ db: false });

            // Commit any in-memory (unsaved) audio blobs into final cache before B2 upload.
            try {
                await commitDraftAudioBlobsToFinalCache(currentDictation.id);
            } catch (e) {
            }

            // Upload cached media to B2 via server-provided uploadUrl/token.
            // This is intentionally BLOCKING now: prevents leaving editor before media is actually uploaded.
            const toId = (result && result.dictation_id) ? result.dictation_id : currentDictation.id;
            let audioUploadOk = false;
            if (toId && String(toId).startsWith('dict_')) {
                if (shouldUploadAudio) {
                    try {
                        const resAudio = await uploadAudioThenCleanupB2({ dictationId: toId, token });
                        if (resAudio && resAudio.ok === true) {
                            audioUploadOk = true;
                            setDirtyFlags({ audio: false });
                        }
                    } catch (e) {
                    }
                }
                if (shouldUploadCover) {
                    try {
                        const resCover = await uploadDictationCoverFromCacheToB2({ dictationId: toId, token });
                        if (resCover && resCover.ok === true) {
                            setDirtyFlags({ cover: false });
                        }
                    } catch (e) {
                    }
                }

                // Important: deleting a sentence row may make some audio files stale in B2,
                // even when no new audio was generated/uploaded. Run cleanup after a successful DB save.
                // Safety rules:
                // - if we attempted audio upload, cleanup only when it succeeded
                try {
                    const canCleanup = (() => {
                        try {
                            if (!token) return false;
                            if (!toId) return false;
                            if (shouldUploadAudio === true && audioUploadOk !== true) return false;
                            return true;
                        } catch (e) {
                            return false;
                        }
                    })();
                    if (canCleanup) {
                        await cleanupStaleB2DictationAudio({ dictationId: toId, token });
                    }
                } catch (e) {
                }
            }

            // Сохранение завершено: считаем сохранённым только если все dirty-флаги сняты.
            try {
                const f = getDirtyFlags();
                if (!f.db && !f.audio && !f.cover) {
                    currentDictation.isSaved = true;
                } else {
                    currentDictation.isSaved = false;
                }
            } catch (e) {
                currentDictation.isSaved = true;
            }

            try {
                if (currentDictation.id && String(currentDictation.id).startsWith('dict_')) {
                    currentDictation.temp_id = currentDictation.id;
                }
            } catch (e) {
            }

            // Обновляем звездочку
            updateUnsavedStar();

            try {
                await updateDictationSentencesIndexedDbCache(currentDictation.id);
            } catch (e) {
            }

            // Скрываем индикатор загрузки
            hideLoadingIndicator();
        } else {
            console.error('❌ Ошибка сохранения диктанта:', result);
            alert('Ошибка сохранения диктанта: ' + (result.error || 'Неизвестная ошибка'));
            hideLoadingIndicator();
        }

    } catch (error) {
        console.error('❌ Ошибка при сохранении диктанта:', error);
        alert('Ошибка при сохранении диктанта: ' + error.message);
        hideLoadingIndicator();
    }
}

/**
 * Показывает модальное окно подтверждения выхода
 */
function showExitConfirmation() {
    const exitWithoutSave = confirm(
        'Выйти без сохранения?\n\n' +
        '• ОК — выйти без сохранения\n' +
        '• Отмена — остаться на странице'
    );
    if (exitWithoutSave) {
        cleanupTempAndExit();
    }
}

/**
 * Очищает temp папку и переходит на главную страницу
 */
async function cleanupTempAndExit() {
    try {
        try { window.__DICTATION_EDITOR_IS_EXITING = true; } catch (e) {}

        // Показываем индикатор загрузки
        showLoadingIndicator('Очистка временных файлов...');

        // Unsaved audio is in-memory only; nothing to purge from Cache Storage.

        // Переходим на главную страницу
        try { hideLoadingIndicator(); } catch (e) {}
        goToMainPage();

    } catch (error) {
        console.error('❌ Ошибка при очистке temp папки:', error);
        // В случае ошибки все равно переходим на главную
        try { hideLoadingIndicator(); } catch (e) {}
        goToMainPage();
    }
}

/**
 * Переходит на главную страницу
 */
function goToMainPage() {
    // console.log('🏠 Переходим на главную страницу...');
    window.location.href = '/';
}

// Функция saveSentencesJsonToServer() удалена - нет автосохранения JSON

async function saveDictationAndExit() {
    try {
        await waitCoverPendingBeforeSave(2500);
    } catch (e) {
    }
    // Синхронизируем данные из вкладок перед сохранением
    syncSpeakersFromTab();
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    if (tabIsDialogCheckbox) {
        currentDictation.is_dialog = tabIsDialogCheckbox.checked;
    }
    
    // Если это НЕ диалог, очищаем всех спикеров перед сохранением
    if (!currentDictation.is_dialog) {
        currentDictation.speakers = {};
    }
    
    try {
        // Показываем индикатор загрузки
        showLoadingIndicator('Сохранение диктанта...');

        // Подготовить данные для сохранения
        const saveData = {
            id: currentDictation.id,
            language_original: currentDictation.language_original,
            language_translation: currentDictation._persisted_language_translation || currentDictation.language_translation,
            title: document.getElementById('title') ? document.getElementById('title').value : 'Диктант',
            level: currentDictation.level || 'A1',
            is_dialog: currentDictation.is_dialog,
            speakers: currentDictation.speakers,
            sentences: {
                [currentDictation.language_original]: workingData.original,
                [currentDictation.language_translation]: getCurrentTranslationData({ createIfMissing: true })
            }
        };

        // Проверяем обязательные поля
        if (!saveData.id) {
            alert('Ошибка: отсутствует ID диктанта');
            hideLoadingIndicator();
            return;
        }

        // category_key больше не обязателен на клиенте: сервер сам проставит дефолт,
        // либо диктант будет привязан к книге/разделу через book_id


        // Сохраняем диктант сразу в финальную папку и добавляем в категорию
        const requestData = {
            ...saveData,
            category_key: currentDictation.category_key
        };


        const response = await fetch('/save_dictation_final', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();


        if (result.success) {
            // console.log('Диктант сохранен в финальную папку и добавлен в категорию');

            // Отмечаем диктант как сохраненный
            currentDictation.isSaved = true;

            // Сохраняем текущую категорию в sessionStorage перед переходом
            const currentCategoryData = {
                key: currentDictation.category_key,
                title: currentDictation.category_title,
                path: currentDictation.category_path,
                language_original: currentDictation.language_original,
                language_translation: currentDictation._persisted_language_translation || currentDictation.language_translation
            };
            sessionStorage.setItem('selectedCategoryForDictation', JSON.stringify(currentCategoryData));

            // Перенаправить на главную страницу (позиция в дереве восстановится автоматически)
            goToMainPage();
        } else {
            console.error('❌ Ошибка сохранения диктанта:', result);
            alert('Ошибка сохранения диктанта: ' + (result.error || 'Неизвестная ошибка'));
            hideLoadingIndicator();
        }

    } catch (error) {
        console.error('Ошибка при сохранении диктанта:', error);
        alert('Ошибка при сохранении диктанта: ' + error.message);
        hideLoadingIndicator();
    }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ СОЗДАНИЯ ДИКТАНТА
// ============================================================================

/**
 * Получить спикеров из таблицы
 */
function getSpeakersFromTable() {
    const speakers = {};
    // Сначала проверяем модальное окно (стартовое окно создания диктанта)
        const mainTbody = document.querySelector('#speakersTableContent tbody');
        if (mainTbody) {
        mainTbody.querySelectorAll('.speaker-name').forEach((input, index) => {
                const speakerId = (index + 1).toString();
                const speakerName = input.value.trim() || `Спикер ${speakerId}`;
            if (speakerName) {
                speakers[speakerId] = speakerName;
        }
        });
        // Если нашли спикеров в модальном окне, возвращаем их
        if (Object.keys(speakers).length > 0) {
        return speakers;
        }
    }
    
    // Если в модальном окне нет спикеров, берем из таблицы во вкладке
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (tbody) {
    tbody.querySelectorAll('.speaker-name').forEach((input, index) => {
        const speakerId = (index + 1).toString();
        const speakerName = input.value.trim() || `Спикер ${speakerId}`;
            if (speakerName) {
        speakers[speakerId] = speakerName;
            }
    });
    }
    
    return speakers;
}

/**
 * Генерация имени аудиофайла
 */
function generateAudioFileName(key, language, tipe_audio = 'avto') {
    return `${key}_${language}_${tipe_audio}.mp3`;
}

/**
 * Перевод текста для редактирования (шапка и редактирование таблицы)
 * @param {string} text - текст для перевода
 * @param {string} fromLanguage - исходный язык
 * @param {string} toLanguage - целевой язык
 * @returns {Promise<string>} - переведенный текст
 */
async function translateTextForEditing(text, fromLanguage, toLanguage) {
    return await autoTranslate(text, fromLanguage, toLanguage);
}

/**
 * Автоматический перевод текста (для обратной совместимости)
 */
async function autoTranslate(text, fromLanguage, toLanguage) {
    try {
        const response = await fetch('/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                language_original: fromLanguage,
                language_translation: toLanguage
            })
        });

        if (response.ok) {
            const result = await response.json();
            const translatedText = result.translation || text;
            return translatedText;
        } else {
            console.warn('❌ Ошибка перевода (статус:', response.status, '), используем оригинальный текст');
            return text;
        }
    } catch (error) {
        console.error('Ошибка при переводе:', error);
        return text;
    }
}

/**
 * Генерировать аудио для одного предложения
 */
/**
 * Формирует путь к папке с аудио файлами для диктанта
 * @param {string} language - код языка ('en', 'ru', и т.д.)
 * @returns {string} - путь к папке с аудио
 */
function getAudioPath(language) {
    if (currentDictation.id && currentDictation.id.startsWith('dict_')) {
        try {
            if (window.AudioManager && typeof window.AudioManager.normalizeMediaUrl === 'function') {
                return window.AudioManager.normalizeMediaUrl(`/api/dictations/${currentDictation.id}/${language}`);
            }
        } catch (e) {
        }
        return `/api/dictations/${currentDictation.id}/${language}`;
    }

    return '';
}

function buildDictationAudioUrl(dictationId, language, filename, opts = {}) {
    try {
        try {
            if (window.AudioManager && typeof window.AudioManager.buildDictationAudioUrl === 'function') {
                return window.AudioManager.buildDictationAudioUrl(dictationId, language, filename);
            }
        } catch (e) {
        }

        const id = String(dictationId || '').trim();
        const lang = String(language || '').trim();
        const raw = String(filename || '').trim();
        if (!id || !lang || !raw) return '';
        if (raw.startsWith('blob:')) return raw;
        if (raw.startsWith('/api/')) return raw;
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

        const name = raw.split('?', 1)[0].split('/').pop();
        if (!name) return '';
        const base = '/api/dictations';
        return `${base}/${encodeURIComponent(id)}/${encodeURIComponent(lang)}/${encodeURIComponent(name)}`;
    } catch (e) {
        return '';
    }
}

async function resolveEditorPlaybackAudioUrl(dictationId, language, filename) {
    try {
        const id = String(dictationId || '').trim();
        const lang = String(language || '').trim();
        const raw = String(filename || '').trim();
        if (!id || !lang || !raw) return '';
        if (raw.startsWith('blob:') || raw.startsWith('/api/') || raw.startsWith('http://') || raw.startsWith('https://')) {
            try {
                if (window.AudioManager && typeof window.AudioManager.normalizeMediaUrl === 'function') {
                    return window.AudioManager.normalizeMediaUrl(raw);
                }
            } catch (e) {
            }
            return raw;
        }

        const name = raw.split('?', 1)[0].split('/').pop();
        if (!name) return '';

        const draftUrl = getDraftAudioUrl(lang, name);
        if (draftUrl && typeof draftUrl === 'string' && draftUrl.startsWith('blob:')) {
            return draftUrl;
        }

        const baseUrl = buildDictationAudioUrl(id, lang, name);
        return baseUrl;
    } catch (e) {
        return '';
    }
}

async function generateAudioForSentence(sentence, language) {
    if (!sentence.text.trim()) return null;

    // Очищаем текст от меток спикеров (1:, 2:) и комментариев (/* ... */)
    let cleanText = sentence.text;
    
    // Удаляем метки спикеров (например, "1: ", "2: ") - могут быть в начале строки или после пробела
    // Используем негативный просмотр назад для удаления пробела перед меткой, если он есть
    cleanText = cleanText.replace(/\s*\d+:\s*/g, ' ');
    // Убираем лишние пробелы, оставшиеся после удаления меток
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    // Удаляем комментарии вида /* ... */
    cleanText = cleanText.replace(/\/\*.*?\*\//g, '');
    
    // Очищаем от лишних пробелов
    cleanText = cleanText.trim();
    
    if (!cleanText) {
        console.warn('⚠️ Текст пустой после очистки для предложения:', sentence.key);
        return null;
    }

    // Генерируем имя файла, если его нет
    let filename = sentence.audio;
    if (!filename) {
        // Создаем имя файла на основе ключа и языка
        const key = sentence.key || '000';
        filename = `${key}_${language}_avto.mp3`;
    }

    try {
        // Получаем user_id - сначала из currentDictation, потом из UserManager
        let user_id = currentDictation.user_id;
        if (!user_id && window.UM && window.UM.getCurrentUser) {
            const user = window.UM.getCurrentUser();
            if (user && user.id) {
                user_id = user.id;
                // Сохраняем user_id в currentDictation для последующих вызовов
                currentDictation.user_id = user_id;
            }
        }
        
        // Получаем safe_email
        let safe_email = currentDictation.safe_email;
        if (!safe_email && window.UM && window.UM.getSafeEmail) {
            safe_email = window.UM.getSafeEmail();
            if (safe_email) {
                currentDictation.safe_email = safe_email;
            }
        }
        
        console.log('🎵 Генерирую аудио:', {
            text: cleanText.substring(0, 50) + '...',
            language,
            filename,
            dictation_id: currentDictation.id,
            user_id,
            safe_email
        });
        
        const response = await fetch('/generate_audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: cleanText,
                language: language,
                filename: filename,
                filename_audio: filename,
                tipe_audio: 'avto',
                dictation_id: currentDictation.id,
                user_id: user_id,  // Для пути temp/<user_id>/
                safe_email: safe_email
            })
        });

        if (response.ok) {
            const result = await response.json();
            const generatedFilename = result.filename || filename;

            // We no longer publish generated audio to B2 here.
            // Always require audio bytes and store them as *unsaved* temp cache entry so the editor can play immediately.
            if (!(result && result.audio_b64)) {
                console.warn('⚠️ generate_audio не вернул audio_b64');
                return null;
            }

            try {
                const binary = atob(result.audio_b64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const mime = result.mime || 'audio/mpeg';
                const blob = new Blob([bytes], { type: mime });

                // Store unsaved audio in memory (blob URL) until Save.
                const cacheUrl = await putDraftAudioToCache(currentDictation.id, language, generatedFilename, blob, mime);

                if (!sentence.__draftAudioUrls) sentence.__draftAudioUrls = {};
                sentence.__draftAudioUrls[language] = cacheUrl;
                sentence.__draftAudioMime = mime;
                sentence.__draftAudioFilename = generatedFilename;

                if (cacheUrl) {
                    setDraftAudioUrl(language, generatedFilename, cacheUrl);
                }

                // Mark as unsaved audio change.
                try { setDirtyFlags({ audio: true }); } catch (e) {}
            } catch (e) {
                console.error('❌ Не удалось создать draft audio blob url:', e);
                return null;
            }

            if (!hasDraftAudioUrl(language, generatedFilename)) {
                return null;
            }

            return generatedFilename; // Возвращаем имя файла
        } else {
            const errorText = await response.text();
            console.error(`❌ Ошибка генерации аудио для ${filename}: ${response.status} ${errorText}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Ошибка при генерации аудио:`, error);
        return null;
    }
}

/**
 * Парсинг текста диктанта
 */
async function parseInputText(text, delimiter, isDialog, speakers) {
    // Удалить пустые строки
    const lines = normalizeDictationInvisibleChars(text)
        .split('\n')
        .map(line => normalizeDictationInvisibleChars(line).trim())
        .filter(line => line.length > 0);

    if (lines.length === 0) {
        return { original: [], translation: [] };
    }

    const language_original = currentDictation.language_original;
    const language_translation = currentDictation.language_translation;
    const original = [];
    const translation = [];
    let key_i = 0; // индекс для генерации ключа
    let i_next = 0; // индекс наступного рядка в тексті, якщо в наступному рядку э /* то перекладати не тереба 
    let original_line = "";
    let translation_line = "";
    let translation_mistake = [];
    for (let i = 0; i < lines.length; i++) {
        // !!! дивимось одночасно поточний рядок і наступний рядок

        // поточний рядок - оригінальний текст
        original_line = normalizeDictationInvisibleChars(lines[i]);
        if (original_line.startsWith(delimiter)) {
            // пропущено оригінальний текст, пропускаємо цей рядок 
            // але зберемо помилки перекладу без оригіналу
            translation_mistake.push({
                id: i,
                text: original_line,
            });
            continue;
        }

        const key = key_i.toString().padStart(3, '0'); // ключ поточного речення);
        key_i++; // наступне речення
        const audio_originalFileName = generateAudioFileName(key, language_original);
        const audio_translationFileName = generateAudioFileName(key, language_translation);

        const s_original = {
            key: key,
            speaker: '1',
            text: original_line,
            audio: audio_originalFileName, //аудио которое будет в диктанте! Итоговое
            audio_avto: audio_originalFileName, // автоперевод
            audio_user: '', // отрезанный кусок
            audio_mic: '', // запись с микрофона
            // audio_user_shared: '', // источник для отрезанного куска
            start: 0,
            end: 0,
            chain: false,
            checked: false
        };
        // Генерировать аудио для оригинала
        await generateAudioForSentence(s_original, language_original);
        original.push(s_original);

        // наступний рядок - переклад
        i_next = i + 1; // індекс наступного рядка в тексті, якщо в наступному рядку э /* то перекладати не тереба 
        translation_line = "";
        let hasTranslationLine = false;
        if (i_next < lines.length) {
            if (lines[i_next].startsWith(delimiter)) {
                // есть перевод, берем его и переводить не надо
                translation_line = normalizeDictationInvisibleChars(lines[i_next].substring(2)).trim(); // удалить /*;
                i++;
                hasTranslationLine = true;
            }
            else {
                // перекладу немає, робимо автопереклад
                translation_line = normalizeDictationInvisibleChars(await autoTranslate(original_line, language_original, language_translation));
            }
        } else {
            // останній рядок і перекладу немає, робимо автопереклад
            translation_line = normalizeDictationInvisibleChars(await autoTranslate(original_line, language_original, language_translation));
        }

        const s_translation = {
            key: key,
            speaker: '1',
            text: translation_line,
            audio: audio_translationFileName,
            audio_avto: audio_translationFileName, // автоперевод
            audio_user: '', // отрезанный кусок
            audio_mic: '', // запись с микрофона
            // audio_user_shared: '', // источник для отрезанного куска
            start: 0,
            end: 0,
            chain: false,
            explanation: '' // поле для комментариев
        };
        // генеруємо аудио перекладу
        await generateAudioForSentence(s_translation, language_translation);
        translation.push(s_translation);
        
        // Проверяем, есть ли строки // для explanation после текущего предложения
        // Смотрим на следующую строку после перевода
        let explanation_i = i + 1;
        let explanation_text = '';
        while (explanation_i < lines.length && lines[explanation_i].startsWith('//')) {
            // Собираем все строки начинающиеся с //
            const comment_line = lines[explanation_i].substring(2).trim(); // удалить //
            if (explanation_text) {
                explanation_text += '\n' + comment_line;
            } else {
                explanation_text = comment_line;
            }
            explanation_i++;
        }
        
        // Если нашли строки объяснения, присваиваем их к текущему предложению
        if (explanation_text && translation.length > 0) {
            translation[translation.length - 1].explanation = explanation_text;
        }
        
        // Пропускаем обработанные строки explanation (учитываем, что i уже инкрементирован если был delimiter)
        if (explanation_i > i + 1) {
            i = explanation_i - 1; // -1 потому что в конце цикла for будет i++
        }

    }

    // Обработка ошибок перевода
    if (translation_mistake.length > 0) {
        let message = `Обнаружены ошибки в структуре текста:\n`;
        translation_mistake.forEach(item => {
            message += `Строка ${item.id + 1}: ${item.text}\n`;
        });
        message += `\nЭти строки пропущены, так как начинаются с символа перевода без оригинального текста.`;
        alert(message);
    }

    if (isDialog) {
        // Обработка спикеров для диалогов
        const speakerIds = Object.keys(speakers);
        const speakerNumbers = speakerIds.map(id => id + ':');
        const linesWithoutSpeakers = [];
        let currentSpeakerIndex = 0;

        // Проходим по массиву original и обрабатываем спикеров
        for (let i = 0; i < original.length; i++) {
            const sentence = original[i];
            const text = sentence.text;
            let speakerId = null;
            let cleanText = text;

            // Проверяем, начинается ли строка с номера спикера (1:, 2:, и т.д.)
            const speakerMatch = text.match(/^(\d+):\s*(.+)$/);
            if (speakerMatch) {
                const foundSpeakerId = speakerMatch[1];
                cleanText = speakerMatch[2].trim();

                // Проверяем, есть ли такой спикер в таблице
                if (speakers[foundSpeakerId]) {
                    speakerId = foundSpeakerId;
                    sentence.text = cleanText; // Удаляем номер спикера из текста
                }
            }

            // Если спикер не найден, добавляем в список строк без спикеров
            if (!speakerId) {
                linesWithoutSpeakers.push({
                    index: i + 1,
                    text: text
                });
            }

            // Обновляем speaker в предложении
            sentence.speaker = speakerId;
        }

        // Если есть строки без спикеров
        if (linesWithoutSpeakers.length > 0) {
            let message = `В следующих строках не указан спикер:\n`;
            linesWithoutSpeakers.forEach(item => {
                message += `${item.index}. ${item.text}\n`;
            });

            if (linesWithoutSpeakers.length === original.length) {
                // Если во всех строках нет спикеров, расставляем по кругу
                message += `\nСпикеры будут расставлены автоматически по порядку. Проверьте реплики!`;

                for (let i = 0; i < original.length; i++) {
                    const speakerId = speakerIds[currentSpeakerIndex % speakerIds.length];
                    original[i].speaker = speakerId;
                    currentSpeakerIndex++;
                }
            } else {
                // Если только в некоторых строках нет спикеров, проставляем первого спикера
                message += `\nВ этих строках будет проставлен спикер "1".`;

                linesWithoutSpeakers.forEach(item => {
                    const index = item.index - 1; // индекс в массиве
                    if (original[index]) {
                        original[index].speaker = '1';
                    }
                });
            }

            alert(message);
        }
    }


    return { original, translation };
}


/**
 * Предварительная загрузка аудио файлов в плееры
 */
async function preloadAudioFiles() {

    const originalSentences = workingData.original.sentences || [];
    const trBucket = getCurrentTranslationData({ createIfMissing: false });
    const translationSentences = (trBucket && Array.isArray(trBucket.sentences)) ? trBucket.sentences : [];

    // Загружаем аудио для оригинального языка
    for (const sentence of originalSentences) {
        if (sentence.audio && !audioPlayers[sentence.audio]) {
            try {
                const audioUrl = buildDictationAudioUrl(currentDictation && currentDictation.id, currentDictation.language_original, sentence.audio);
                const audio = new Audio(audioUrl);
                audioPlayers[sentence.audio] = audio;
            } catch (error) {
                console.warn(`⚠️ Не удалось загрузить аудио оригинала: ${sentence.audio}`, error);
            }
        }
    }

    // Загружаем аудио для языка перевода
    for (const sentence of translationSentences) {
        if (sentence.audio && !audioPlayers[sentence.audio]) {
            try {
                const audioUrl = buildDictationAudioUrl(currentDictation && currentDictation.id, currentDictation.language_translation, sentence.audio);
                const audio = new Audio(audioUrl);
                audioPlayers[sentence.audio] = audio;
            } catch (error) {
                console.warn(`⚠️ Не удалось загрузить аудио перевода: ${sentence.audio}`, error);
            }
        }
    }
}

/**
 * Создать таблицу предложений
 */
async function createTable() {
    const tbody = document.querySelector('#sentences-table tbody');
    if (!tbody) return;

    // Очистить таблицу
    tbody.innerHTML = '';

    // Показать/скрыть колонку спикера в зависимости от типа диктанта
    const speakerCol = document.querySelector('.col-speaker');
    if (speakerCol) {
        speakerCol.style.display = currentDictation.is_dialog ? 'table-cell' : 'none';
    }

    // Создать строки для оригинального языка
    const originalSentences = workingData.original.sentences || [];
    const trBucket = getCurrentTranslationData({ createIfMissing: false });
    const translationSentences = (trBucket && Array.isArray(trBucket.sentences)) ? trBucket.sentences : [];

    // Объединить оригинал и перевод по ключам
    const allKeys = new Set();
    originalSentences.forEach(s => allKeys.add(s.key));
    translationSentences.forEach(s => allKeys.add(s.key));

    const items = Array.from(allKeys).map((key) => {
        const originalSentence = originalSentences.find(s => s.key === key);
        const translationSentence = translationSentences.find(s => s.key === key);
        const pos = (originalSentence && Number.isFinite(Number(originalSentence.position))) ? Number(originalSentence.position)
            : ((translationSentence && Number.isFinite(Number(translationSentence.position))) ? Number(translationSentence.position) : null);
        return { key, originalSentence, translationSentence, pos };
    });

    items.sort((a, b) => {
        const ap = (a.pos !== null && a.pos !== undefined) ? Number(a.pos) : Number.POSITIVE_INFINITY;
        const bp = (b.pos !== null && b.pos !== undefined) ? Number(b.pos) : Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return String(a.key).localeCompare(String(b.key));
    });

    items.forEach(({ key, originalSentence, translationSentence }) => {
        const row = createTableRow(key, originalSentence, translationSentence);
        tbody.appendChild(row);
    });

    // Предварительно загружаем аудио файлы в плееры
    // будем подгружать аудио при первом вызвове
    // await preloadAudioFiles();

    // Пересоздать иконки Lucide после создания таблицы
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Проверяем, есть ли explanation в предложениях
    const hasExplanation = translationSentences.some(s => s.explanation && s.explanation.trim());
    if (hasExplanation) {
        explanationVisible = true;
    }
    
    // Обновляем видимость кнопки редактирования всех
    updateEditAllCreatingButtonVisibility();
    updateExplanationColumnVisibility();

    // Автоматически выбираем первую строку при создании таблицы
    setTimeout(() => {
        const firstRow = document.querySelector('#sentences-table tbody tr:first-child');
        if (firstRow) {
            selectSentenceRow(firstRow);
        }
    }, 100); // Небольшая задержка для завершения всех операций

    // Ensure positions are consistent with DOM order.
    recomputeSentencePositionsFromDom();
}
/**
 * Создать строку таблицы
 * @param {string} key - ключ строки
 * @param {Object|null} originalSentence - данные оригинального предложения
 * @param {Object|null} translationSentence - данные перевода
 */
function createTableRow(key, originalSentence, translationSentence) {
    const row = document.createElement('tr');
    row.dataset.key = key;
    row.className = 'sentence-row';

    // Колонка 0: №
    const numberCell = document.createElement('td');
    numberCell.className = 'col-number';
    numberCell.dataset.col_id = 'col-number';

    const pos = (originalSentence && Number.isFinite(Number(originalSentence.position))) ? Number(originalSentence.position)
        : ((translationSentence && Number.isFinite(Number(translationSentence.position))) ? Number(translationSentence.position) : null);
    numberCell.textContent = (pos !== null && pos !== undefined) ? String(pos).padStart(2, '0') : '00';

    row.appendChild(numberCell);

    // Колонка 1: Чекбокс (видимость только на вкладке "Создание аудио")
    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'col-checkbox-create-audio panel-create-audio';
    checkboxCell.dataset.col_id = 'col-checkbox-create-audio';
    checkboxCell.style.display = 'none'; // По умолчанию скрыта
    
    // Создаем кнопку на всю ширину ячейки (как у кнопки play)
    const checkboxBtn = document.createElement('button');
    checkboxBtn.className = 'checkbox-btn checkbox-btn-table';
    checkboxBtn.dataset.key = key;
    checkboxBtn.style.width = '100%';
    checkboxBtn.style.height = '100%';
    checkboxBtn.style.padding = '0';
    checkboxBtn.style.border = 'none';
    checkboxBtn.style.background = 'transparent';
    checkboxBtn.style.cursor = 'pointer';
    checkboxBtn.style.display = 'flex';
    checkboxBtn.style.alignItems = 'center';
    checkboxBtn.style.justifyContent = 'center';
    
    const checkboxIcon = document.createElement('i');
    checkboxIcon.className = 'checkbox-icon';
    checkboxIcon.setAttribute('data-lucide', 'circle');
    
    // Инициализируем поле checked в данных предложения, если его нет
    if (originalSentence && originalSentence.checked === undefined) {
        originalSentence.checked = false;
    }
    
    // Устанавливаем начальную иконку на основе данных
    const isChecked = originalSentence ? (originalSentence.checked === true) : false;
    checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
    
    checkboxBtn.appendChild(checkboxIcon);
    checkboxCell.appendChild(checkboxBtn);
    
    // Вешаем общий обработчик (как у кнопки play)
    checkboxBtn.addEventListener('click', handleCheckboxToggle);
    
    row.appendChild(checkboxCell);

    // Колонка 2: Спикер (всегда присутствует; видимость управляется чекбоксом)
    const speakerCell = document.createElement('td');
    speakerCell.className = 'col-speaker';
    speakerCell.dataset.col_id = 'col-speaker';
    const selectedSpeakerId = originalSentence && originalSentence.speaker ? String(originalSentence.speaker) : '';
    buildSpeakerDropdown(speakerCell, selectedSpeakerId, (newIdWithColon) => {
        // коллбек выбора: записываем только код (например, "1:") в строку
        if (originalSentence) {
            const cleanId = newIdWithColon ? String(newIdWithColon).replace(':', '') : '';
            originalSentence.speaker = cleanId || undefined;
        }
        // Changing speaker affects DB payload -> mark as unsaved
        try {
            markAsUnsaved();
        } catch (e) {
        }
    });
    // Первоначальная видимость берётся из текущего состояния чекбокса
    speakerCell.style.display = (currentDictation.is_dialog ? 'table-cell' : 'none');
    row.appendChild(speakerCell);

    // Колонка 2: Оригинальный текст
    const originalCell = document.createElement('td');
    originalCell.className = 'col-original panel-original';
    originalCell.dataset.col_id = 'col-or-text';

    // Создаем поле ввода для оригинала всегда
    const textareaOriginal = document.createElement('textarea');
    textareaOriginal.value = (originalSentence && originalSentence.text) ? originalSentence.text : '';
    textareaOriginal.className = 'sentence-text';
    textareaOriginal.dataset.key = key;
    textareaOriginal.dataset.type = 'original';

    // Слушатель изменения текста оригинала
    textareaOriginal.addEventListener('input', function () {
        // Обновляем текст в данных
        if (originalSentence) {
            let v = textareaOriginal.value;
            try {
                v = normalizeDictationInvisibleChars(String(v || '')).replace(/\s+/g, ' ').trim();
            } catch (e) {
            }
            originalSentence.text = v;
        }

        // Text edit affects DB payload -> mark as unsaved
        try {
            markAsUnsaved();
        } catch (e) {
        }

        // Меняем кнопку воспроизведения в режим создания
        // const audioBtn = row.querySelector(`.col-audio .audio-btn[data-language=${currentDictation.language_original}]`);
        const audioBtn = row.querySelector(`.btn-col-or-audio`);
        if (audioBtn) {
            audioBtn.dataset.create = 'true';
            audioBtn.title = 'Создать аудио оригинала';
            audioBtn.dataset.state = 'creating';
            setButtonState(audioBtn);
        }
    });

    // Слушатель нажатия Enter для автоперевода
    textareaOriginal.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // Находим поле перевода в той же строке
            const translationTextarea = row.querySelector('.col-translation textarea[data-type="translation"]');

            // Если поле перевода пустое, создаем автоперевод
            if (translationTextarea && !translationTextarea.value.trim()) {
                event.preventDefault(); // Предотвращаем добавление новой строки в textarea

                const originalText = textareaOriginal.value.trim();
                if (originalText) {
                    console.log('🔄 Создание автоперевода для:', originalText);
                    createAutoTranslation(originalText, translationTextarea, key);
                }
            }
        }
    });

    originalCell.appendChild(textareaOriginal);
    row.appendChild(originalCell);

    // Колонка 3: Аудио Оригінал
    const audioCellOriginal = document.createElement('td');
    audioCellOriginal.className = 'col-play-original panel-original panel-create-audio';
    audioCellOriginal.dataset.col_id = 'col-or-audio';

    // Единая кнопка для оригинала
    const audioBtnOriginal = document.createElement('button');
    audioBtnOriginal.className = 'audio-btn btn-col-or-audio audio-btn-table state-ready';
    audioBtnOriginal.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginal.dataset.language = currentDictation.language_original;
    audioBtnOriginal.dataset.fieldName = 'audio';
    // audioBtnOriginal.dataset.create = 'folse';
    const originalAudioFilename = originalSentence ? originalSentence.audio : '';
    state = (!originalSentence || !originalSentence.audio) ? 'creating' : 'ready';
    audioBtnOriginal.dataset.state = state;
    audioBtnOriginal.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginal);
    audioBtnOriginal.title = (!originalSentence || !originalSentence.audio) ? 'Создать аудио оригинала' : 'Воспроизвести аудио оригинала';
    audioBtnOriginal.addEventListener('click', handleAudioPlayback);
    audioCellOriginal.appendChild(audioBtnOriginal);
    row.appendChild(audioCellOriginal);

    // Колонка 4: Развернуть настройку аудио
    const audioSettingsCell = document.createElement('td');
    audioSettingsCell.className = 'col-audio-settings panel-original';
    audioSettingsCell.dataset.col_id = 'col-or-open-settings';
    audioSettingsCell.style.backgroundColor = 'var(--color-hover)';
    audioSettingsCell.style.padding = '0';
    // Всегда создаем кнопку, даже если аудио нет
    const audioSettingsBtn = document.createElement('button');
    audioSettingsBtn.className = 'audio-settings-btn';
    // Удалено создание колонки разворота настроек аудио

    // Колонка 5: Перевод
    const translationCell = document.createElement('td');
    translationCell.className = 'col-translation panel-translation';
    translationCell.dataset.col_id = 'col-tr-text';

    // Создаем поле ввода для перевода всегда
    const textareaTranslation = document.createElement('textarea');
    textareaTranslation.value = (translationSentence && translationSentence.text) ? translationSentence.text : '';
    textareaTranslation.className = 'sentence-text';
    textareaTranslation.dataset.key = key;
    textareaTranslation.dataset.type = 'translation';

    // Слушатель изменения текста перевода
    textareaTranslation.addEventListener('input', function () {
        // Обновляем текст в данных
        console.log('🔄1🔄🔄🔄🔄🔄🔄 textareaTranslation.value',textareaTranslation.value);
        if (translationSentence) {
            let v = textareaTranslation.value;
            try {
                v = normalizeDictationInvisibleChars(String(v || '')).replace(/\s+/g, ' ').trim();
            } catch (e) {
            }
            translationSentence.text = v;
        }

        // Translation edit affects DB payload -> mark as unsaved
        try {
            markAsUnsaved();
        } catch (e) {
        }
        // Меняем кнопку воспроизведения в режим создания (кнопка перевода создается позже)
        const audioBtn = row.querySelector(`.btn-col-tr-audio`);
        if (audioBtn) {
            audioBtn.dataset.create = 'true';
            audioBtn.title = 'Создать аудио перевода';
            audioBtn.dataset.state = 'creating';
            setButtonState(audioBtn);
        }
    });

    translationCell.appendChild(textareaTranslation);
    row.appendChild(translationCell);

    // Колонка 6: Аудио перекладу
    const audioCell = document.createElement('td');
    audioCell.className = 'col-play-translation panel-translation panel-create-audio';
    audioCell.dataset.col_id = 'col-tr-audio';
    // Единая кнопка для перевода
    const audioBtnTranslation = document.createElement('button');
    audioBtnTranslation.className = 'audio-btn btn-col-tr-audio audio-btn-table state-ready';
    audioBtnTranslation.innerHTML = '<i data-lucide="play"></i>';
    audioBtnTranslation.dataset.language = currentDictation.language_translation;
    audioBtnTranslation.dataset.fieldName = 'audio';
    // audioBtnTranslation.dataset.create = 'folse';
    const translationAudioFilename = translationSentence ? translationSentence.audio : '';
    state = (!translationSentence || !translationSentence.audio) ? 'creating' : 'ready';
    audioBtnTranslation.dataset.state = state;
    audioBtnTranslation.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnTranslation);
    audioBtnTranslation.title = (!translationSentence || !translationSentence.audio) ? 'Создать аудио перевода' : 'Воспроизвести аудио перевода';
    audioBtnTranslation.addEventListener('click', handleAudioPlayback);
    audioCell.appendChild(audioBtnTranslation);
    row.appendChild(audioCell);

    // Колонка 7: Explanation
    const explanationCell = document.createElement('td');
    explanationCell.className = 'col-explanation';
    explanationCell.dataset.col_id = 'col-explanation';
    explanationCell.style.display = 'none'; // По умолчанию скрыта
    
    const explanationInput = document.createElement('textarea');
    explanationInput.className = 'sentence-text';
    explanationInput.value = (translationSentence && translationSentence.explanation) ? translationSentence.explanation : '';
    explanationInput.dataset.key = key;
    explanationInput.dataset.type = 'explanation';
    explanationInput.placeholder = 'Пояснение';
    
    // Слушатель изменения explanation
    explanationInput.addEventListener('input', function () {
        if (translationSentence) {
            let v = explanationInput.value;
            try {
                v = normalizeDictationInvisibleChars(String(v || '')).replace(/\s+/g, ' ').trim();
            } catch (e) {
            }
            translationSentence.explanation = v;
        }

        // Explanation edit affects DB payload -> mark as unsaved
        try {
            markAsUnsaved();
        } catch (e) {
        }
    });
    
    explanationCell.appendChild(explanationInput);
    row.appendChild(explanationCell);

    // Боковые колонки (правая панель)
    // Колонка AVTO1: Аудио автоперевода (генерировать TTS)
    const generateTtsCell = document.createElement('td');
    generateTtsCell.className = 'col-generate-tts panel-editing-avto panel-create-audio';
    generateTtsCell.dataset.col_id = 'col-or-avto-play';
    // generateTtsCell.style.display = 'none'; // По умолчанию скрыта
    // кнпка генерации/проигрывания аудио автоперевода
    const audioBtnOriginalAvto = document.createElement('button');
    audioBtnOriginalAvto.className = 'audio-btn audio-btn-table state-ready';
    audioBtnOriginalAvto.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginalAvto.dataset.language = currentDictation.language_original;
    audioBtnOriginalAvto.dataset.fieldName = 'audio_avto';
    // audioBtnOriginalAvto.dataset.create === 'folse';
    const originalAvtoFilename = originalSentence ? originalSentence.audio_avto : '';
    state = (!originalSentence || !originalSentence.audio_avto) ? 'creating' : 'ready';
    audioBtnOriginalAvto.dataset.state = state;
    audioBtnOriginalAvto.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginalAvto);
    audioBtnOriginalAvto.title = 'Воспроизвести аудио оригинала';
    audioBtnOriginalAvto.addEventListener('click', handleAudioPlayback);
    generateTtsCell.appendChild(audioBtnOriginalAvto);
    row.appendChild(generateTtsCell);

    // Колонка  AVTO2: Применить audio_avto
    const applyCellAvto = document.createElement('td');
    applyCellAvto.className = 'col-apply-avto panel-editing-avto';
    applyCellAvto.dataset.col_id = 'col-or-avto-apply';
    applyCellAvto.dataset.fieldName = 'audio_avto';
    // applyCellAvto.style.display = 'none'; // По умолчанию скрыта
    applyCellAvto.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellAvto.title = 'Применить автоперевод';
    applyCellAvto.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellAvto);

    // Колонка USER1: Start
    const startCell = document.createElement('td');
    startCell.className = 'col-start panel-editing-user';
    startCell.dataset.col_id = 'col-or-user-start';
    // startCell.style.display = 'none'; // По умолчанию скрыта

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.className = 'start-input';
    startInput.step = '0.01';
    startInput.min = '0';
    startInput.value = (originalSentence && originalSentence.start) ? originalSentence.start.toFixed(2) : '0.00';
    startCell.appendChild(startInput);
    row.appendChild(startCell);

    // Колонка USER2: End
    const endCell = document.createElement('td');
    endCell.className = 'col-end panel-editing-user';
    endCell.dataset.col_id = 'col-or-user-end';
    // endCell.style.display = 'none'; // По умолчанию скрыта

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.className = 'end-input';
    endInput.step = '0.01';
    endInput.min = '0';
    endInput.value = (originalSentence && originalSentence.end) ? originalSentence.end.toFixed(2) : '0.00';
    endCell.appendChild(endInput);
    row.appendChild(endCell);

    // Колонка USER3: 🔗 (цепочка)
    const chainCell = document.createElement('td');
    chainCell.className = 'col-chain panel-editing-user';
    chainCell.dataset.col_id = 'col-or-user-chain';
    // chainCell.style.display = 'none'; // По умолчанию скрыта
    chainCell.innerHTML = (originalSentence && originalSentence.chain) ? '<i data-lucide="link"></i>' : '<i data-lucide="unlink"></i>';
    row.appendChild(chainCell);

    // // Колонка Б8: С-ть (создать аудио)
    // const createAudioCell = document.createElement('td');
    // createAudioCell.className = 'col-create-audio';
    // // createAudioCell.style.display = 'none'; // По умолчанию скрыта
    // createAudioCell.textContent = 'С-ть';
    // row.appendChild(createAudioCell);

    // Колонка USER4: Воспроизвести аудио
    const playAudioUserCell = document.createElement('td');
    playAudioUserCell.className = 'col-play-audio panel-editing-user panel-create-audio';
    playAudioUserCell.dataset.col_id = 'col-or-user-play';
    // playAudioCell.style.display = 'none'; // По умолчанию скрыта
    // кнопка генерации/проигрывания аудио автоперевода
    const audioBtnOriginalUser = document.createElement('button');
    audioBtnOriginalUser.className = 'audio-btn audio-btn-table state-ready';
    audioBtnOriginalUser.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginalUser.dataset.language = currentDictation.language_original;
    audioBtnOriginalUser.dataset.fieldName = 'audio_user';
    // audioBtnOriginalUser.dataset.create = 'folse';
    state = (!originalSentence || !originalSentence.audio_user) ? 'creating' : 'ready';
    audioBtnOriginalUser.dataset.state = state;
    audioBtnOriginalUser.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginalUser);
    audioBtnOriginalUser.title = 'Воспроизвести аудио оригинала';
    audioBtnOriginalUser.addEventListener('click', handleAudioPlayback);
    playAudioUserCell.appendChild(audioBtnOriginalUser);
    row.appendChild(playAudioUserCell);

    // Колонка  USER5: Применить audio_user
    const applyCellUser = document.createElement('td');
    applyCellUser.className = 'col-apply-user panel-editing-user';
    applyCellUser.dataset.col_id = 'col-or-user-apply';
    applyCellUser.dataset.fieldName = 'audio_user';
    // applyCellUser.style.display = 'none'; // По умолчанию скрыта
    applyCellUser.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellUser.title = 'Применить запись пользователя';
    applyCellUser.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellUser);


    // панель микрофона ------------------------------------------------------------

    // Колонка MIC1: Аудио автоперевода (генерировать TTS)
    const generateAudioMicCell = document.createElement('td');
    generateAudioMicCell.className = 'col-play-audio panel-editing-mic panel-create-audio';
    generateAudioMicCell.dataset.col_id = 'col-or-mic-play';
    // generateTtsCell.style.display = 'none'; // По умолчанию скрыта
    // кнпка генерации/проигрывания аудио записи с микрофона
    const audioBtnAudioMic = document.createElement('button');
    audioBtnAudioMic.className = 'audio-btn audio-btn-table state-ready';
    audioBtnAudioMic.innerHTML = '<i data-lucide="play"></i>';
    audioBtnAudioMic.dataset.language = currentDictation.language_original;
    audioBtnAudioMic.dataset.fieldName = 'audio_mic';
    // audioBtnAudioMic.dataset.create = 'folse';
    state = (!originalSentence || !originalSentence.audio_mic) ? 'creating_mic' : 'ready';
    audioBtnAudioMic.dataset.state = state;
    audioBtnAudioMic.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnAudioMic);
    audioBtnAudioMic.title = 'Воспроизвести аудио записи с микрофона';
    audioBtnAudioMic.addEventListener('click', handleAudioPlayback);
    generateAudioMicCell.appendChild(audioBtnAudioMic);
    row.appendChild(generateAudioMicCell);

    // Колонка  MIC2: Применить audio_avto
    const applyCellMic = document.createElement('td');
    applyCellMic.className = 'col-apply-avto panel-editing-mic';
    applyCellMic.dataset.col_id = 'col-or-mic-apply';
    applyCellMic.dataset.fieldName = 'audio_mic';
    // applyCellMic.style.display = 'none'; // По умолчанию скрыта
    applyCellMic.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellMic.title = 'Применить запись с микрофона';
    applyCellMic.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellMic);

    // // Колонка для компенсации ширины скроллбара
    // const scrollingCell = document.createElement('td');
    // scrollingCell.className = 'col-scrolling';
    // row.appendChild(scrollingCell);

    // Настраиваем обработчики для полей ввода
    setupInputHandlers(row);

    // Настраиваем обработчики для строки
    setupRowHandlers(row);

    return row;
}

/**
 * Заполнить select опциями спикеров (текст — номер с двоеточием)
 */
function buildSpeakerOptionsForSelect(selectEl, selectedId) { /* deprecated for custom dropdown */ }

/**
 * Построить выпадающий список спикеров в ячейке
 * label: "{id:}" и chevron; при выборе сохраняется только код (с двоеточием) через коллбек
 */
function buildSpeakerDropdown(cellEl, selectedId, onSelect) {
    cellEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'speaker-dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speaker-dropdown-btn';
    const currentLabel = selectedId ? `${selectedId}:` : '';
    button.innerHTML = `<span class="speaker-code">${currentLabel}</span><i data-lucide="chevron-down"></i>`;

    const menu = document.createElement('div');
    menu.className = 'speaker-dropdown-menu';

    const entries = Object.entries(currentDictation.speakers || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    // Пустой вариант
    const emptyItem = document.createElement('div');
    emptyItem.className = 'speaker-option';
    emptyItem.textContent = '';
    emptyItem.addEventListener('click', () => {
        button.querySelector('.speaker-code').textContent = '';
        menu.classList.remove('open');
        if (typeof onSelect === 'function') onSelect('');
    });
    menu.appendChild(emptyItem);

    entries.forEach(([id, name]) => {
        const item = document.createElement('div');
        item.className = 'speaker-option';
        item.textContent = `${id}: ${name}`;
        item.title = name;
        item.dataset.id = id;
        item.addEventListener('click', () => {
            button.querySelector('.speaker-code').textContent = `${id}:`;
            menu.classList.remove('open');
            if (typeof onSelect === 'function') onSelect(`${id}:`);
        });
        menu.appendChild(item);
    });

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });

    // Закрытие при клике вне
    document.addEventListener('click', () => {
        menu.classList.remove('open');
    });

    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    cellEl.appendChild(wrapper);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Обновить опции спикеров во всех строках таблицы (после изменения списка спикеров)
 */
function refreshAllSpeakerSelectOptions() {
    // Обновляем пункты в кастомных выпадающих списках
    document.querySelectorAll('td.col-speaker').forEach(td => {
        const currentCode = td.querySelector('.speaker-code')?.textContent || '';
        const selectedId = currentCode ? currentCode.replace(':', '') : '';
        buildSpeakerDropdown(td, selectedId, (newIdWithColon) => {
            const row = td.closest('tr');
            const key = row?.dataset.key;
            if (!key) return;
            const sentence = (workingData.original.sentences || []).find(s => s.key === key);
            if (sentence) {
                const cleanId = newIdWithColon ? String(newIdWithColon).replace(':', '') : '';
                sentence.speaker = cleanId || undefined;
            }
        });
    });
}

/**
 * Создать автоперевод для поля перевода
 */
async function createAutoTranslation(originalText, translationTextarea, key) {
    try {
        console.log('🔄 Создание автоперевода для ключа:', key);

        // Используем функцию перевода для редактирования
        const translatedText = await translateTextForEditing(
            originalText,
            currentDictation.language_original,
            currentDictation.language_translation
        );

        // Заполняем поле перевода
        translationTextarea.value = translatedText;

        // Обновляем данные в workingData
        try {
            const trBucket = getCurrentTranslationData({ createIfMissing: true });
            if (trBucket) {
                trBucket.sentences = Array.isArray(trBucket.sentences) ? trBucket.sentences : [];
                let translationSentence = trBucket.sentences.find(s => s && s.key === key);
                if (!translationSentence) {
                    translationSentence = {
                        key: key,
                        text: translatedText,
                        audio: '',
                        audio_avto: '',
                        audio_user: '',
                        audio_mic: '',
                        start: 0,
                        end: 0,
                        chain: false
                    };
                    trBucket.sentences.push(translationSentence);
                } else {
                    translationSentence.text = translatedText;
                }
            }
        } catch (e) {
        }

        // Обновляем текст оригинала в workingData (если есть)
        if (workingData && workingData.original) {
            let originalSentence = workingData.original.sentences.find(s => s.key === key);
            if (originalSentence) {
                originalSentence.text = originalText;
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при переводе предложения:', error);
    }
}

// ==================== Автоматический перевод названия =====================

function setupTitleTranslationHandler() {
    const titleInput = document.getElementById('title');
    const translationTitleInput = document.getElementById('title_translation');


    // Обработчик для автоматического перевода по Enter
    titleInput.addEventListener('keydown', async function (event) {
        // Переводим только при нажатии Enter
        if (event.key === 'Enter') {
            event.preventDefault();

            const originalTitle = titleInput.value.trim();
            if (!originalTitle || !translationTitleInput) {
                console.log('❌ Нет текста или поля перевода');
                return;
            }

            try {
                // Используем функцию перевода для редактирования
                const translatedTitle = await translateTextForEditing(
                    originalTitle,
                    currentDictation.language_original,
                    currentDictation.language_translation
                );

                translationTitleInput.value = translatedTitle;
                // Обновляем title в workingData после перевода
                updateTitlesInWorkingData();
            } catch (error) {
                console.error('❌ Ошибка при переводе названия:', error);
            }
        }
    });

    // Обработчики для обновления workingData при изменении полей
    titleInput.addEventListener('input', updateTitlesInWorkingData);
    if (translationTitleInput) {
        translationTitleInput.addEventListener('input', updateTitlesInWorkingData);
    }
}

function updateTitlesInWorkingData() {
    const titleInput = document.getElementById('title');
    const translationTitleInput = document.getElementById('title_translation');

    if (!titleInput || !workingData) return;

    // Обновляем title для оригинального языка
    if (workingData.original) {
        workingData.original.title = titleInput.value || 'Диктант';
    }

    // Обновляем title для текущего языка перевода
    try {
        const tr = getCurrentTranslationData({ createIfMissing: false });
        if (tr && translationTitleInput) {
            tr.title = translationTitleInput.value || 'Перевод';
        }
    } catch (e) {
    }
}

// ============================================================================
// НОВАЯ АРХИТЕКТУРА - СТАРТОВОЕ МОДАЛЬНОЕ ОКНО
// ===========================================================================

/**
 * Инициализация волны аудио
 */
async function initWaveform(audioUrl) {
    if (audioUrl) lastAudioUrl = audioUrl;

    // Проверяем, что контейнер видим
    const waveformContainer = document.getElementById('audioWaveform');
    if (!waveformContainer) {
        console.warn('Контейнер audioWaveform не найден');
        return;
    }

    // Проверяем, что контейнер имеет размеры
    if (waveformContainer.offsetWidth === 0 || waveformContainer.offsetHeight === 0) {
        console.warn('Контейнер audioWaveform не видим, принудительно устанавливаем размеры');
        // Принудительно устанавливаем размеры
        waveformContainer.style.width = '100%';
        waveformContainer.style.height = '100px';
        waveformContainer.style.minHeight = '100px';

        // Если размеры все еще 0, откладываем инициализацию
        if (waveformContainer.offsetWidth === 0 || waveformContainer.offsetHeight === 0) {
            console.warn('Не удалось установить размеры, откладываем инициализацию');
            return;
        }
    }

    // Проверяем, что WaveformCanvas загружен
    if (typeof WaveformCanvas === 'undefined') {
        console.error('❌ WaveformCanvas не загружен!');
        return;
    }

    if (waveformCanvas) {
        waveformCanvas.destroy();
    }

    try {
        // Создаем новый экземпляр WaveformCanvas
        // Класс сам определяет цвета из CSS переменных
        waveformCanvas = new WaveformCanvas(waveformContainer);
        window.waveformCanvas = waveformCanvas; // Сохраняем в window для глобального доступа
        // Подключаем волну к аудио-менеджеру для синхронизации плейхеда
        if (window.AudioManager && typeof window.AudioManager.setWaveformCanvas === 'function') {
            window.AudioManager.setWaveformCanvas(waveformCanvas);
        } else if (typeof audioManager !== 'undefined' && audioManager && typeof audioManager.setWaveformCanvas === 'function') {
            audioManager.setWaveformCanvas(waveformCanvas);
        }

        // WaveformCanvas НЕ управляет состоянием кнопки - это делает плеер
        // waveformCanvas.onPlaybackEnd(() => { ... }); // Убрано - плеер сам управляет кнопкой

        // Проверяем, есть ли уже загруженное аудио для этого файла
        const audioFileName = audioUrl.split('/').pop();
        const language = currentDictation.language_original;
        let audioElement = null;

        try {
            if (window.AudioManager && AudioManager.players) {
                const playerKey = `${audioFileName}_${language}`;
                if (AudioManager.players[playerKey] && AudioManager.players[playerKey].src) {
                    audioElement = AudioManager.players[playerKey];
                }
            }
        } catch (e) {
            // безопасно игнорируем отсутствие AudioManager.players
        }

        // Если нашли загруженное аудио, используем его, иначе загружаем по URL с cache-busting
        if (audioElement) {
            await waveformCanvas.loadAudioFromElement(audioElement);
        } else {
            const cacheBusted = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
            await waveformCanvas.loadAudio(cacheBusted);
        }


        // Получаем длительность аудио
        const duration = waveformCanvas.getDuration();
        const roundedDuration = Math.floor(duration * 100) / 100;

        // Настраиваем callback для обновления региона
        setupWaveformRegionCallback();
        
        // Устанавливаем callback для окончания воспроизведения (когда волна останавливает воспроизведение при достижении конца региона)
        waveformCanvas.onPlaybackEnd(() => {
            const audioPlayBtn = document.getElementById('audioPlayBtn');
            if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
                const originalState = audioPlayBtn.dataset.originalState || 'ready-shared';
                audioPlayBtn.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(audioPlayBtn, originalState);
                }
                console.log('✅ Состояние кнопки под волной обновлено в:', originalState);
            }
        });

        // Восстанавливаем регион в зависимости от текущего режима
        // Устанавливаем флаг, чтобы не устанавливать 'creating' при программном обновлении
        isProgrammaticRegionUpdate = true;
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        
        if (currentMode === 'sentence') {
            // В режиме "sentence" устанавливаем регион по текущей выбранной строке
            setRegionToSelectedSentence();
        } else if (currentMode === 'full') {
            // В режиме "full" устанавливаем регион по сохраненным границам
            setRegionToFullShared();
        } else {
            // Для других режимов (mic, auto) устанавливаем регион по умолчанию на всю длительность
            waveformCanvas.setRegion(0, roundedDuration);
            if (startInput) startInput.value = '0.00';
            if (endInput) endInput.value = roundedDuration.toFixed(2);
        }
        // Сбрасываем флаг после небольшой задержки, чтобы callback успел сработать
        setTimeout(() => {
            isProgrammaticRegionUpdate = false;
        }, 100);

    } catch (error) {
        console.error('❌ Ошибка инициализации WaveformCanvas:', error);
    }
}

/**
 * Установить callback для обновления региона волны
 */
// Флаг для предотвращения установки 'creating' при программном обновлении региона
let isProgrammaticRegionUpdate = false;

function setupWaveformRegionCallback() {
    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) return;

    waveformCanvas.onRegionUpdate((region) => {
        if (startInput) startInput.value = region.start.toFixed(2);
        if (endInput) endInput.value = region.end.toFixed(2);

        // Обновляем значения в workingData
        // Обновляем границы ТОЛЬКО для режима "общий файл"
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        if (currentMode === 'full') {
            if (workingData && workingData.original) {
                workingData.original.audio_user_shared_start = region.start;
                workingData.original.audio_user_shared_end = region.end;
            }
            try {
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const bucket = workingData.translations[k];
                        if (!bucket) continue;
                        bucket.audio_user_shared_start = region.start;
                        bucket.audio_user_shared_end = region.end;
                    }
                }
            } catch (e) {
            }
        } else if (currentMode === 'sentence') {
            // В режиме "sentence" обновляем поля в таблице и устанавливаем состояние 'creating'
            // НО только если это НЕ программное обновление (например, при инициализации или загрузке)
            const selectedRow = document.querySelector('#sentences-table tbody tr.selected');
            if (selectedRow && !isProgrammaticRegionUpdate) {
                const key = selectedRow.dataset.key;
                
                // Получаем текущие значения для сравнения
                const rowStartInput = selectedRow.querySelector('.start-input');
                const rowEndInput = selectedRow.querySelector('.end-input');
                const oldStart = rowStartInput ? parseFloat(rowStartInput.value) : 0;
                const oldEnd = rowEndInput ? parseFloat(rowEndInput.value) : 0;
                
                // Обновляем поля start/end в таблице
                if (rowStartInput) rowStartInput.value = region.start.toFixed(2);
                if (rowEndInput) rowEndInput.value = region.end.toFixed(2);
                
                // Обновляем данные в workingData
                const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
                if (sentenceIndex !== -1) {
                    workingData.original.sentences[sentenceIndex].start = region.start;
                    workingData.original.sentences[sentenceIndex].end = region.end;
                }
                
                // Устанавливаем состояние 'creating' ТОЛЬКО если значения реально изменились
                const startChanged = Math.abs(oldStart - region.start) > 0.01;
                const endChanged = Math.abs(oldEnd - region.end) > 0.01;
                
                if (startChanged || endChanged) {
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser
                    const audioBtnOriginalUser = selectedRow.querySelector('button[data-field-name="audio_user"]');
                    if (audioBtnOriginalUser) {
                        // НЕ устанавливаем 'creating' если кнопка уже играет
                        const currentState = audioBtnOriginalUser.dataset.state;
                        // Также проверяем, не играет ли сейчас какой-то другой аудио (через audioManager)
                        const audioManagerButton = window.audioManager?.currentButton;
                        const isThisButtonPlaying = audioManagerButton === audioBtnOriginalUser;
                        
                        if (currentState === 'playing' || isThisButtonPlaying) {
                            // Не меняем состояние во время воспроизведения, но продолжаем обновление цепочки
                        } else {
                            audioBtnOriginalUser.dataset.state = 'creating';
                            setButtonState(audioBtnOriginalUser);
                            updateEditAllCreatingButtonVisibility();
                        }
                    }
                    
                    // Запускаем логику цепочки для обновления соседних строк
                    // НО только если кнопка не играет сейчас
                    if (key) {
                        const shouldUpdateChain = !audioBtnOriginalUser || 
                                                 (audioBtnOriginalUser.dataset.state !== 'playing' && 
                                                  window.audioManager?.currentButton !== audioBtnOriginalUser);
                        
                        if (shouldUpdateChain) {
                            // Обновляем цепочку для start и end, но только если они изменились
                            if (endChanged) {
                                updateChain(key, 'end', region.end.toFixed(2));
                            }
                            if (startChanged) {
                                updateChain(key, 'start', region.start.toFixed(2));
                            }
                        }
                    }
                }
            } else if (selectedRow) {
                // Программное обновление - просто синхронизируем значения без установки 'creating'
                const key = selectedRow.dataset.key;
                const rowStartInput = selectedRow.querySelector('.start-input');
                const rowEndInput = selectedRow.querySelector('.end-input');
                if (rowStartInput) rowStartInput.value = region.start.toFixed(2);
                if (rowEndInput) rowEndInput.value = region.end.toFixed(2);
                
                // Обновляем данные в workingData
                const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
                if (sentenceIndex !== -1) {
                    workingData.original.sentences[sentenceIndex].start = region.start;
                    workingData.original.sentences[sentenceIndex].end = region.end;
                }
            }
        }

        // Отмечаем что диктант изменен
        currentDictation.isSaved = false;
        setDirtyFlags({ db: true });
    });
}

// Заглушки удалены - используются реальные функции showLoadingIndicator() и hideLoadingIndicator()

/**
 * Управление текущим аудио в зависимости от режима
 * волна и информация об аудио
 */
let currentAudioFileName = "";
function updateCurrentAudioWave() {
    // читаем режим радио из DOM
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';


    let shouldRedrawWaveform = false; // флаг для перерисовки волны
    let audioFileName = "";

    switch (currentMode) {
        case 'full':
            // Режим "Отображать весь файл"
            audioFileName = workingData?.original?.audio_user_shared;
            // Режим "Общий файл" - используем audio_user_shared
            if (audioFileName) {
                //currentAudioFile = workingData.original.audio_user_shared;
                shouldRedrawWaveform = true;
            }

            break;
        case 'sentence':
            // Режим "Текущее предложение" - скрыта
            audioFileName = workingData?.original?.audio_user_shared;
            // Режим "Общий файл" - используем audio_user_shared
            if (audioFileName) {
                //currentAudioFile = workingData.original.audio_user_shared;
                shouldRedrawWaveform = true;
            }

            break;
        case 'mic':
            // Режим "Микрофон"
            const currentRow = document.querySelector('#sentences-table tbody tr.selected');
            if (currentRow) {
                const key = currentRow.dataset.key;
                const sentence = workingData.original.sentences.find(s => s.key === key);
                audioFileName = sentence?.audio_mic;
                if (audioFileName) {
                    // currentAudioFile = sentence.audio_mic;
                    shouldRedrawWaveform = true;
                }
            }

            break;
        case 'auto':
            // Режим "Автозаполнение" - иконка молоточка
            shouldRedrawWaveform = false;

            break;
    }

    // Обновляем информацию о текущем аудио
    // Перерисовываем волну только если изменилось текущее аудио
    if (audioFileName !== "") {
        if (shouldRedrawWaveform) {
            if (currentAudioFileName !== audioFileName) {
                currentAudioFileName = audioFileName;
                currentAudioInfo.textContent = `Текущее аудио: ${audioFileName}`;
                if (window.waveformCanvas) {
                    window.waveformCanvas.show();
                }
                waveformContainer.classList.remove('mode-auto', 'mode-full', 'mode-sentence', 'mode-mic');
                // Добавляем соответствующий класс для цвета волны
                switch (currentMode) {
                    case 'full':
                        waveformContainer.classList.add('mode-full');
                        break;
                    case 'sentence':
                        waveformContainer.classList.add('mode-sentence');
                        break;
                    case 'mic':
                        waveformContainer.classList.add('mode-mic');
                        break;
                    case 'auto':
                        waveformContainer.classList.add('mode-auto');
                        break;
                }
                loadWaveformForCurrentAudio(currentAudioFileName);
            }
        } else {
            // Скрываем волну если нет аудио
            if (window.waveformCanvas) {
                window.waveformCanvas.hide();
            }
        }
    } else {
        // Скрываем волну если нет аудио
        if (window.waveformCanvas) {
            window.waveformCanvas.hide();
        }
    }
}



/**
 * Загрузка волны для текущего аудио
 */
function loadWaveformForCurrentAudio(audioFile) {

    if (!audioFile) return;

    const audioUrl = buildDictationAudioUrl(currentDictation && currentDictation.id, currentDictation.language_original, audioFile);

    loadWaveformForFile(audioUrl);
}

/**
 * Универсальный обработчик для кнопок "Применить" (авто/пользователь/мик)
 * Копирует значение из поля-источника в главное поле "audio"
 */
function handleApplyAudioSource(event) {
    // Получаем кнопку, на которую кликнули
    const button = event.target.closest('td[data-field-name]');
    if (!button) return;

    // Извлекаем данные из атрибутов
    const sentenceKey = button.closest('tr').dataset.key;
    const sourceField = button.dataset.fieldName;

    console.log(`🔄 Применяем аудио: ${sentenceKey} -> ${sourceField}`);

    // Находим предложение в workingData
    const sentence = workingData.original.sentences.find(s => s.key === sentenceKey);
    if (!sentence) {
        console.error(`❌ Предложение с ключом ${sentenceKey} не найдено`);
        return;
    }

    // Получаем значение из поля-источника
    const sourceValue = sentence[sourceField];
    if (!sourceValue || sourceValue.trim() === '') {
        console.log(`⚠️ Поле ${sourceField} пустое, ничего не копируем`);
        return;
    }

    // Копируем в главное поле "audio"
    sentence.audio = sourceValue;

    // Обновляем визуальные индикаторы (галочки) для всех кнопок "Применить" в этой строке
    updateApplyButtonsIndicators(sentenceKey, sourceField);
}

/**
 * Обновляет визуальные индикаторы (галочки) для кнопок "Применить"
 * Показывает галочку только на активной кнопке
 */
function updateApplyButtonsIndicators(sentenceKey, activeSourceField) {
    // Находим строку таблицы
    const row = document.querySelector(`tr[data-key="${sentenceKey}"]`);
    if (!row) return;

    // Находим все кнопки "Применить" в этой строке по col_id
    const applyButtons = row.querySelectorAll('td[data-col-id*="-apply"]');

    applyButtons.forEach(button => {
        const fieldName = button.dataset.fieldName;

        if (fieldName === activeSourceField) {
            // Активная кнопка - показываем галочку
            button.innerHTML = '<i data-lucide="check"></i>';
            button.style.color = '#28a745'; // Зеленый цвет
            button.title = `Активно: ${getFieldDisplayName(fieldName)}`;
        } else {
            // Неактивные кнопки - показываем стрелку
            button.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
            button.style.color = ''; // Сброс цвета
            button.title = `Применить ${getFieldDisplayName(fieldName)}`;
        }
    });

    // Пересоздаем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Возвращает отображаемое имя поля
 */
function getFieldDisplayName(fieldName) {
    const names = {
        'audio_avto': 'автоперевод',
        'audio_user': 'запись пользователя',
        'audio_mic': 'запись с микрофона'
    };
    return names[fieldName] || fieldName;
}