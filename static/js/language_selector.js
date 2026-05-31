// Режимы:
// native-selector - только селектор родного языка
// learning-selector - селектор языка изучения
// learning-selector-compact - селектор языка изучения (только флаг в выбранном, флаг+название в списке)
// learning-list - список изучаемых языков с чекбоксами
// learning-flags - список всех языков с чекбоксами (для users.tr_*)
// flag-combo - комбинация флагов (изучаемый → родной)
// header-selector - выпадающий селектор для шапки
// report-selector - текстовый селектор для отчетов (без флагов, включает "Все языки")
// profile-panels - ДВЕ ПАНЕЛИ для профиля (родной + изучаемые)
// registration - для регистрации (родной + изучаемый)
class LanguageSelector {
    static FLAG_SIZE_SMALL = { width: 20, height: 15 };
    static FLAG_SIZE_LARGE = { width: 30, height: 20 };

    constructor(options = {}) {
        this.options = {
            container: null,
            mode: 'native-selector', // 'native-selector', 'learning-selector', 'learning-list', 'flag-combo', 'header-selector', 'profile-panels'
            selectorType: 'native',
            nativeLanguage: 'en',
            nativeLanguages: [],
            learningLanguages: ['en'],
            currentLearning: 'en',
            languageData: null,
            onLanguageChange: null,
            ...options
        };

        if (!this.options.languageData) {
            throw new Error('languageData is required parameter');
        }

        this.languageData = this.options.languageData;
        this.flagPath = '/static/flags/';
        this.isInitialized = false;

        this._t = (key, params, fallback) => {
            try {
                if (window.I18n && typeof window.I18n.t === 'function') {
                    const v = window.I18n.t(key, params);
                    if (v && v !== key) return v;
                }
            } catch (e) {
            }
            if (typeof fallback === 'string') return fallback;
            return String(key || '');
        };

        this._modelsCentricBound = false;
        this._modelsCentricDownloadsInFlight = new Map();
        this._modelsCentricModalEl = null;
        this._modelsCentricModalTextEl = null;
        this._modelsCentricModalBarEl = null;

        this._learningFlagsClickBound = false;

        this.init();
    }

    _renderLucideCheckboxButton(btn, checked, disabled) {
        try {
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
        } catch (e) {
        }
    }

    async init() {
        try {
            if (this.options.mode === 'models-centric') {
                try {
                    window.addEventListener('models-data-updated', () => {
                        if (this.isInitialized) {
                            this.render();
                        }
                    });
                    window.addEventListener('language-data-updated', () => {
                        if (this.isInitialized) {
                            this.languageData = window.LanguageManager ? window.LanguageManager.getLanguageData() : this.languageData;
                            this.render();
                        }
                    });
                } catch (e) {
                }
            }
            this.render();
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing LanguageSelector:', error);
        }
    }

    _getDownloadedModelsV2() {
        try {
            const raw = localStorage.getItem('downloaded_models_v2');
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    _saveDownloadedModelsV2(obj) {
        try {
            localStorage.setItem('downloaded_models_v2', JSON.stringify(obj || {}));
        } catch (e) {
        }
    }

    _isDownloadedV2(modelKey) {
        const all = this._getDownloadedModelsV2();
        return !!(all && all[modelKey]);
    }

    _setDownloadedV2(modelKey, data) {
        const all = this._getDownloadedModelsV2();
        all[modelKey] = {
            ...(all[modelKey] || {}),
            ...(data || {}),
            downloadedAt: new Date().toISOString()
        };
        this._saveDownloadedModelsV2(all);
    }

    _removeDownloadedV2(modelKey) {
        const all = this._getDownloadedModelsV2();
        if (all && all[modelKey]) {
            delete all[modelKey];
            this._saveDownloadedModelsV2(all);
        }
    }

    _getSelectedModelKeyV2(langCode) {
        const lc = (langCode || '').toString().trim().toLowerCase().split('-')[0] || '';
        if (!lc) return null;
        try {
            const v = localStorage.getItem(`selected_asr_model_v2_${lc}`);
            return v && v !== 'null' && v !== 'none' && String(v).trim() !== '' ? String(v) : null;
        } catch (e) {
            return null;
        }
    }

    _setSelectedModelKeyV2(langCode, modelKey) {
        const lc = (langCode || '').toString().trim().toLowerCase().split('-')[0] || '';
        if (!lc) return;
        try {
            if (!modelKey || modelKey === 'none') {
                localStorage.removeItem(`selected_asr_model_v2_${lc}`);
            } else {
                localStorage.setItem(`selected_asr_model_v2_${lc}`, String(modelKey));
            }
        } catch (e) {
        }
    }

    _collectGlobalModels() {
        const lm = window.LanguageManager;
        const raw = lm && typeof lm.getModelsData === 'function' ? lm.getModelsData() : [];
        const models = Array.isArray(raw)
            ? raw
                .filter(Boolean)
                .filter(m => !(m && Object.prototype.hasOwnProperty.call(m, 'visible') && m.visible === false))
                .map(m => ({ ...m }))
            : [];

        models.sort((a, b) => {
            const tA = a.modelType === 'whisper' ? 0 : 1;
            const tB = b.modelType === 'whisper' ? 0 : 1;
            if (tA !== tB) return tA - tB;
            const rA = a.recommended ? 0 : 1;
            const rB = b.recommended ? 0 : 1;
            if (rA !== rB) return rA - rB;
            return String(a.name).localeCompare(String(b.name));
        });

        return models;
    }

    createModelsCentricUI() {
        const models = this._collectGlobalModels();
        const languages = Object.keys(this.languageData || {});
        const downloaded = this._getDownloadedModelsV2();
        const downloadedKeys = new Set(Object.keys(downloaded || {}));

        const getApplicableDownloaded = (langCode) => {
            const lc = (langCode || '').toString().trim().toLowerCase().split('-')[0];
            const langEntry = (this.languageData && this.languageData[lc]) ? this.languageData[lc] : (this.languageData ? this.languageData[langCode] : null);
            const applicableKeys = langEntry && Array.isArray(langEntry.applicable_model_keys) ? langEntry.applicable_model_keys : [];
            const applicableKeySet = new Set(applicableKeys.map(String));
            return models.filter(m => {
                if (!downloadedKeys.has(m.modelKey)) return false;
                // Whisper multilingual: if the language references it, it's applicable.
                return applicableKeySet.has(String(m.modelKey));
            });
        };

        const left = `
            <div class="downloaded-models-panel" style="margin:0;">
                <label class="language-label">${this._t('profile.models.all_models', null, 'Все модели')}</label>
                <div class="models-list-container" style="max-height: 340px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; padding: 8px;">
                    ${models.map(m => {
                        const isDownloaded = downloadedKeys.has(m.modelKey);
                        const typeName = m.modelType === 'whisper' ? 'Whisper' : 'ASR';
                        const langs = (m.supportedLanguages || []).includes('all') ? 'all' : (m.supportedLanguages || []).slice(0, 6).join(' ');
                        const toggleEnabled = m.modelType === 'whisper';
                        return `
                            <div class="model-list-item" data-model-key="${m.modelKey}" data-model-type="${m.modelType}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid #f0f0f0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; min-width: 70px; color:#666; font-size:12px;">${typeName}</div>
                                <div style="flex-grow:1; min-width:0;">
                                    <div style="font-size:13px; font-weight:500; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.name}</div>
                                    <div style="font-size:12px; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${langs}</div>
                                </div>
                                <div style="flex-shrink:0; color:#666; font-size:12px; min-width:80px; text-align:right;">${m.size || ''}</div>
                                <div style="display:flex; align-items:center; flex-shrink:0;">
                                    <label class="model-switch" style="position: relative; display: inline-block; width: 40px; height: 20px; opacity:${toggleEnabled ? '1' : '0.35'};">
                                        <input type="checkbox"
                                               class="model-download-toggle-v2"
                                               ${isDownloaded ? 'checked' : ''}
                                               ${toggleEnabled ? '' : 'disabled'}
                                               data-model-key="${m.modelKey}"
                                               data-model-type="${m.modelType}"
                                               style="opacity: 0; width: 0; height: 0;">
                                        <span class="model-slider ${isDownloaded ? 'downloaded' : ''}"
                                              style="position: absolute; cursor: ${toggleEnabled ? 'pointer' : 'not-allowed'}; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isDownloaded ? '#8B4513' : '#ccc'}; transition: .4s; border-radius: 20px;">
                                            <span class="model-slider-circle"
                                                  style="position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: ${isDownloaded ? '#FFD700' : 'white'}; transition: .4s; border-radius: 50%; ${isDownloaded ? 'transform: translateX(20px);' : ''}"></span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 8px; padding: 0 4px;">${this._t('profile.models.downloaded_prefix', null, 'Загружено:')} ${downloadedKeys.size}</div>
            </div>
        `;

        const right = `
            <div class="downloaded-models-panel" style="margin:0;">
                <label class="language-label">${this._t('profile.models.languages', null, 'Языки')}</label>
                <div class="models-list-container" style="max-height: 340px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; padding: 8px;">
                    ${languages.map(code => {
                        const applicable = getApplicableDownloaded(code);
                        const selected = this._getSelectedModelKeyV2(code);
                        const effectiveSelected = selected && applicable.some(m => m.modelKey === selected) ? selected : (applicable[0]?.modelKey || '');

                        if (!selected && effectiveSelected) {
                            try { this._setSelectedModelKeyV2(code, effectiveSelected); } catch (e) {}
                        }

                        return `
                            <div class="language-item" data-lang="${code}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid #f0f0f0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                    ${this.createFlagElement(code)}
                                    <span style="font-weight:500;">${this.getDisplayLanguageName(code)}</span>
                                </div>
                                <div style="flex-grow:1; min-width:0;"></div>
                                <div style="flex-shrink:0; min-width: 260px;">
                                    ${applicable.length ? `
                                        <select class="language-model-select-v2" data-lang="${code}" style="width:100%; padding:6px 10px; border:1px solid #ddd; border-radius:6px; font-size:13px;">
                                            ${applicable.map(m => {
                                                const label = m.modelType === 'whisper' ? `whisper: ${m.name}` : `asr: ${m.name}`;
                                                return `<option value="${m.modelKey}" ${String(effectiveSelected) === String(m.modelKey) ? 'selected' : ''}>${label}</option>`;
                                            }).join('')}
                                        </select>
                                    ` : `
                                        <div style="font-size:12px; color:#999;">${this._t('profile.models.no_downloaded_models', null, 'нет загруженных моделей')}</div>
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        return `
            <div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items:start;">
                    ${left}
                    ${right}
                </div>
                <div class="storage-info-full" style="margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #555;">
                        <span style="font-weight: bold;">${this._t('profile.models.browser_storage', null, 'Хранилище браузера:')}</span>
                        <span style="color: #333;" id="storage-stats-text">${this._t('profile.models.loading_info', null, 'Загрузка информации...')}</span>
                    </div>
                    <div class="storage-progress-full" style="height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                        <div class="storage-progress-fill-full" id="storage-progress-fill" style="height: 100%; background: #4CAF50; width: 0%; transition: width 0.3s;"></div>
                        <div class="storage-progress-text-full" id="storage-progress-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: white; text-shadow: 1px 1px 1px rgba(0,0,0,0.3);">0%</div>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 4px; text-align: center;" id="storage-details">${this._t('profile.models.calculating_storage', null, 'Рассчитываем использование памяти...')}</div>
                </div>
            </div>
        `;
    }

    createLearningFlags() {
        const selected = new Set(Array.isArray(this.options.learningLanguages) ? this.options.learningLanguages : []);
        const current = String(this.options.currentLearning || '').trim().toLowerCase();
        const languages = Object.keys(this.languageData || {});

        return `
        <div class="learning-flags-list" style="border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; background: var(--color-panel-bg, #fff); padding: 8px; max-height: 240px; overflow: auto;">
            ${languages.map(code => {
                const c = String(code || '').trim().toLowerCase();
                if (!c) return '';
                const isChecked = selected.has(c);
                const isCurrent = current && c === current;
                return `
                    <div class="learning-flag-row" data-lang="${c}" style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius: 10px; ${isCurrent ? 'background: var(--color-hover, #f8f9fa);' : ''}">
                        <button type="button" class="topbar-icon-btn checkbox-btn learning-flag-checkbox" data-lang="${c}" aria-label="${this.getLanguageName(c)}" style="width:32px; height:32px; padding:0; display:inline-flex; align-items:center; justify-content:center;"></button>
                        ${this.createFlagElement(c, 'small')}
                        <button type="button" class="learning-flag-toggle" data-lang="${c}" style="all: unset; cursor: pointer; flex: 1; min-width: 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.getLanguageName(c)}</button>
                    </div>
                `;
            }).join('')}
        </div>
        `;
    }

    createReportSelector() {
        const current = this.options.currentLearning;
        const availableLanguages = Array.isArray(this.options.learningLanguages) ? this.options.learningLanguages : [];
        const getLabel = (code) => {
            const c = String(code || '').trim().toLowerCase();
            if (!c || c === 'all') return this._t('profile.report.all_languages', null, 'Все языки');
            return this.getDisplayLanguageName(c);
        };

        const currentCode = String(current || '').trim().toLowerCase();
        const currentFlag = currentCode && currentCode !== 'all' ? this.createFlagElement(currentCode, 'small') : '';

        return `
            <div class="report-language-combo" style="display:flex; align-items:center; justify-content: space-between; gap: 10px; cursor:pointer; padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.12); background: #fff; min-height: 36px;">
                <div style="display:flex; align-items:center; gap: 8px; min-width: 0;">
                    ${currentFlag ? currentFlag : ''}
                    <span class="report-language-label" style="overflow:hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 500;">${getLabel(current)}</span>
                </div>
                <i data-lucide="chevron-down" style="width: 18px; height: 18px; flex: 0 0 auto;"></i>
            </div>
            <div class="report-language-dropdown" style="display:none; position:absolute; left:0; top: calc(100% + 6px); width: 100%; max-height: 300px; overflow:auto; background: #fff; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); z-index: 6; padding: 6px;">
                ${availableLanguages.map(code => {
                    const c = String(code || '').trim().toLowerCase();
                    const selected = c === String(current || '').trim().toLowerCase();
                    const flagHtml = (c && c !== 'all') ? this.createFlagElement(c, 'small') : '';
                    return `
                        <div class="report-language-option ${selected ? 'selected' : ''}" data-value="${c}" style="display:flex; align-items:center; gap: 10px; padding: 8px 10px; border-radius: 10px; cursor: pointer; ${selected ? 'background: rgba(0,0,0,0.06);' : ''}">
                            ${flagHtml ? `<div style="display:flex; align-items:center; flex: 0 0 auto;">${flagHtml}</div>` : ''}
                            <span style="overflow:hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px;">${getLabel(c)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    _ensureModelsCentricModal() {
        if (this._modelsCentricModalEl) return;

        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.inset = '0';
        el.style.background = 'rgba(0,0,0,0.45)';
        el.style.zIndex = '99999';
        el.style.display = 'none';
        el.innerHTML = `
            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:min(520px, calc(100vw - 40px)); background:#fff; border-radius:10px; padding:18px 18px 14px 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.25);">
                <div style="font-size:14px; font-weight:600; color:#333; margin-bottom:10px;">${this._t('profile.models.download_modal.title', null, 'Загрузка модели')}</div>
                <div data-role="models-centric-modal-text" style="font-size:13px; color:#555; margin-bottom:10px;">...</div>
                <div style="height:10px; background:#eee; border-radius:999px; overflow:hidden;">
                    <div data-role="models-centric-modal-bar" style="height:100%; width:0%; background:#8B4513; transition: width 0.15s;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(el);

        this._modelsCentricModalEl = el;
        this._modelsCentricModalTextEl = el.querySelector('[data-role="models-centric-modal-text"]');
        this._modelsCentricModalBarEl = el.querySelector('[data-role="models-centric-modal-bar"]');
    }

    _openModelsCentricModal(text, progress01) {
        this._ensureModelsCentricModal();
        if (this._modelsCentricModalTextEl) {
            this._modelsCentricModalTextEl.textContent = text || '';
        }
        if (this._modelsCentricModalBarEl) {
            const p = Math.max(0, Math.min(1, Number(progress01 || 0)));
            this._modelsCentricModalBarEl.style.width = `${Math.round(p * 100)}%`;
        }
        if (this._modelsCentricModalEl) {
            this._modelsCentricModalEl.style.display = 'block';
        }
    }

    _closeModelsCentricModal() {
        if (this._modelsCentricModalEl) {
            this._modelsCentricModalEl.style.display = 'none';
        }
    }

    bindModelsCentricEvents() {
        if (this._modelsCentricBound) {
            return;
        }
        this._modelsCentricBound = true;

        this.options.container.addEventListener('change', async (e) => {
            const toggle = e.target && e.target.classList && e.target.classList.contains('model-download-toggle-v2') ? e.target : null;
            if (toggle) {
                const modelKey = toggle.dataset.modelKey;
                const modelType = toggle.dataset.modelType;
                const isChecked = !!toggle.checked;
                if (!modelKey || !modelType) return;

                if (!isChecked) {
                    if (this._modelsCentricDownloadsInFlight.has(modelKey)) {
                        toggle.checked = true;
                        return;
                    }
                    this._removeDownloadedV2(modelKey);
                    this.render();
                    return;
                }

                if (modelType !== 'whisper') {
                    toggle.checked = false;
                    return;
                }

                if (this._modelsCentricDownloadsInFlight.has(modelKey)) {
                    return;
                }

                const parts = String(modelKey).split(':');
                const hf = parts.length >= 2 ? parts.slice(1).join(':') : '';
                const size = hf.includes('whisper-tiny') ? 'tiny' : (hf.includes('whisper-small') ? 'small' : 'base');

                try {
                    toggle.disabled = true;
                } catch (e) {
                }

                this._openModelsCentricModal(this._t('profile.models.download_modal.preparing', null, 'Подготовка загрузки…'), 0);

                const p = (async () => {
                    try {
                        if (!window.WhisperModelManager) {
                            throw new Error('WhisperModelManager not available');
                        }
                        const mm = new window.WhisperModelManager();
                        await mm.loadLanguageModel('en', size, (info) => {
                            try {
                                const prog = info && typeof info.progress === 'number' ? info.progress : 0;
                                const file = info && info.file ? String(info.file) : '';
                                const status = info && info.status ? String(info.status) : '';
                                const text = file
                                    ? `${status} ${file}`.trim()
                                    : (status || this._t('profile.models.download_modal.downloading', null, 'Загрузка…'));
                                this._openModelsCentricModal(text, prog);
                            } catch (e) {
                            }
                        });
                        this._setDownloadedV2(modelKey, { modelType, hf_repo: hf, size });
                    } catch (err) {
                        try { console.warn('❌ Whisper download failed:', err); } catch (e2) {}
                        try { toggle.checked = false; } catch (e3) {}
                        this._removeDownloadedV2(modelKey);
                        throw err;
                    } finally {
                        this._closeModelsCentricModal();
                        try { toggle.disabled = false; } catch (e4) {}
                    }
                })();

                this._modelsCentricDownloadsInFlight.set(modelKey, p);
                try {
                    await p;
                } catch (e) {
                } finally {
                    this._modelsCentricDownloadsInFlight.delete(modelKey);
                }

                this.render();
                return;
            }

            const sel = e.target && e.target.classList && e.target.classList.contains('language-model-select-v2') ? e.target : null;
            if (sel) {
                const lang = sel.dataset.lang;
                const val = sel.value;
                this._setSelectedModelKeyV2(lang, val);
                return;
            }
        });

    }

    calculateStorageUsageV2() {
        const models = this._collectGlobalModels();
        const byKey = new Map(models.map(m => [String(m.modelKey), m]));

        const downloaded = this._getDownloadedModelsV2();
        const downloadedKeys = Object.keys(downloaded || {});

        let downloadedCount = 0;
        let totalDownloadedSizeMB = 0;

        for (const k of downloadedKeys) {
            const mk = String(k);
            const m = byKey.get(mk);
            if (!m) continue;
            downloadedCount += 1;
            totalDownloadedSizeMB += this.parseSizeToMB(m.size);
        }

        return {
            downloadedCount,
            downloadedSizeMB: totalDownloadedSizeMB,
        };
    }

    async updateStorageInfoV2() {
        const storageInfo = this.calculateStorageUsageV2();

        let browserQuota = null;
        let browserUsage = null;
        let browserAvailable = null;

        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                browserQuota = estimate.quota;
                browserUsage = estimate.usage;
                browserAvailable = (browserQuota != null && browserUsage != null) ? (browserQuota - browserUsage) : null;
            } catch (e) {
            }
        }

        const modelsSizeBytes = storageInfo.downloadedSizeMB * 1024 * 1024;
        const displayUsage = (browserUsage != null && browserUsage > 0) ? browserUsage : modelsSizeBytes;

        const storageFill = document.getElementById('storage-progress-fill');
        const storageText = document.getElementById('storage-progress-text');

        let percentage = 0;
        if (browserQuota && displayUsage != null) {
            percentage = Math.round((displayUsage / browserQuota) * 100);
        }

        if (storageFill) {
            storageFill.style.width = `${percentage}%`;
        }
        if (storageText) {
            storageText.textContent = `${percentage}%`;
        }

        const statsText = document.getElementById('storage-stats-text');
        const detailsText = document.getElementById('storage-details');

        if (statsText) {
            if (browserQuota && displayUsage != null) {
                statsText.textContent = this._t(
                    'profile.models.storage.stats',
                    {
                        used: this.formatSize(displayUsage / (1024 * 1024)),
                        total: this.formatSize(browserQuota / (1024 * 1024))
                    },
                    `${this.formatSize(displayUsage / (1024 * 1024))} из ${this.formatSize(browserQuota / (1024 * 1024))}`
                );
            } else {
                statsText.textContent = this._t(
                    'profile.models.storage.models_short',
                    {
                        count: storageInfo.downloadedCount,
                        size: this.formatSize(storageInfo.downloadedSizeMB)
                    },
                    `${storageInfo.downloadedCount} моделей (${this.formatSize(storageInfo.downloadedSizeMB)})`
                );
            }
        }

        if (detailsText) {
            if (browserQuota && displayUsage != null && browserAvailable != null) {
                const displayUsageMB = displayUsage / (1024 * 1024);
                const displayAvailableMB = browserAvailable / (1024 * 1024);
                const modelsInfo = storageInfo.downloadedCount > 0
                    ? ` | <strong>${this._t('profile.models.storage.models', null, 'Модели:')}</strong> ${this._t(
                        'profile.models.storage.models_count',
                        { count: storageInfo.downloadedCount, size: this.formatSize(storageInfo.downloadedSizeMB) },
                        `${storageInfo.downloadedCount} шт. (${this.formatSize(storageInfo.downloadedSizeMB)})`
                    )}`
                    : '';
                detailsText.innerHTML = `
                    <strong>${this._t('profile.models.storage.used', null, 'Использовано:')}</strong> ${this.formatSize(displayUsageMB)} |
                    <strong>${this._t('profile.models.storage.available', null, 'Доступно:')}</strong> ${this.formatSize(displayAvailableMB)} |
                    <strong>${this._t('profile.models.storage.total', null, 'Всего:')}</strong> ${this.formatSize(browserQuota / (1024 * 1024))}${modelsInfo}
                `;
            } else {
                detailsText.innerHTML = `
                    <strong>${this._t('profile.models.storage.downloaded_models', null, 'Загружено моделей:')}</strong> ${storageInfo.downloadedCount} |
                    <strong>${this._t('profile.models.storage.models_size', null, 'Размер моделей:')}</strong> ${this.formatSize(storageInfo.downloadedSizeMB)}
                `;
            }
        }
    }

    getCountryCode(langCode) {
        return window.LanguageManager.getCountryCode(langCode);
    }

    getLanguageName(langCode) {
        return window.LanguageManager.getLanguageName(langCode);
    }

    getNativeLanguageName(langCode) {
        return window.LanguageManager.getNativeLanguageName(langCode);
    }

    getDisplayLanguageName(langCode) {
        try {
            const native = this.getNativeLanguageName(langCode);
            if (native && native !== langCode) return native;
        } catch (e) {
        }
        try {
            return this.getLanguageName(langCode);
        } catch (e2) {
            return langCode;
        }
    }

    getFlagFilename(langCode) {
        const countryCode = this.getCountryCode(langCode);
        return countryCode ? `${countryCode}.svg` : '';
    }

    _getFlagSize(size) {
        if (size === 'small') return LanguageSelector.FLAG_SIZE_SMALL;
        if (size === 'large') return LanguageSelector.FLAG_SIZE_LARGE;
        return null;
    }

    _getDefaultFlagSize() {
        const mode = String(this.options.mode || '').trim();
        if (mode === 'header-selector') return 'small';
        if (mode === 'flag-combo') return 'small';
        if (mode === 'learning-selector-compact') return 'small';
        if (mode === 'profile-panels') return 'small';
        if (mode === 'learning-list') return 'small';
        if (mode === 'registration') return 'small';
        if (mode === 'models-centric') return 'small';
        if (mode === 'report-selector') return 'small';
        return 'large';
    }

    createFlagElement(langCode, size) {
        const flagFile = this.getFlagFilename(langCode);
        if (!flagFile) return '';

        const resolvedSize = this._getFlagSize(size) || this._getFlagSize(this._getDefaultFlagSize()) || LanguageSelector.FLAG_SIZE_LARGE;
        const w = resolvedSize && resolvedSize.width ? Number(resolvedSize.width) : 30;
        const h = resolvedSize && resolvedSize.height ? Number(resolvedSize.height) : 20;

        return `
            <img src="${this.flagPath}${flagFile}" 
                 alt="${this.getLanguageName(langCode)}" 
                 class="language-flag"
                 style="width:${w}px; height:${h}px; box-sizing:border-box;"
                 onerror="this.style.display='none'">
        `;
    }

    createNativeSelector() {
        const currentValue = this.options.nativeLanguage;
        const availableLanguages = (Array.isArray(this.options.nativeLanguages) && this.options.nativeLanguages.length > 0)
            ? this.options.nativeLanguages
            : Object.keys(this.languageData);

        return `
            <div class="language-selector-group" data-selector-type="native">

                <div class="custom-select-wrapper">
                    <div class="custom-select-trigger">
                        ${this.createFlagElement(currentValue)} 
                        <span class="custom-select-text">${this.getLanguageName(currentValue)}</span>
                        <i data-lucide="chevron-down"></i>
                        
                    </div>
                    <div class="custom-select-options">
                        ${availableLanguages.map(code => `
                            <div class="custom-option ${code === currentValue ? 'selected' : ''}" 
                                 data-value="${code}">
                                ${this.createFlagElement(code)}
                                <span class="option-text">
                                    <span class="language-name">${this.getLanguageName(code)}</span>
                                    <span class="native-name">(${this.getNativeLanguageName(code)})</span>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <select class="language-select-hidden" name="native_language" style="display: none;">
                    ${availableLanguages.map(code => `
                        <option value="${code}" ${code === currentValue ? 'selected' : ''}>
                            ${this.getLanguageName(code)}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    createLearningSelector() {
        const currentValue = this.options.currentLearning;
        // В режиме profile-panels используем только изучаемые языки, в registration - все языки
        const availableLanguages = (Array.isArray(this.options.learningAvailableLanguages) && this.options.learningAvailableLanguages.length > 0)
            ? this.options.learningAvailableLanguages
            : Object.keys(this.languageData);

        // Проверяем, нужен ли компактный режим (только флаг в trigger)
        const isCompact = this.options.mode === 'learning-selector-compact';
        const triggerContent = isCompact
            ? `${this.createFlagElement(currentValue, 'small')}<i data-lucide="chevron-down"></i>`
            : `${this.createFlagElement(currentValue)}<span class="custom-select-text">${this.getLanguageName(currentValue)}</span><i data-lucide="chevron-down"></i>`;

        // <label class="language-label">Текущий изучаемый язык</label>
        return `
        <div class="language-selector-group" data-selector-type="learning">
            
            <div class="custom-select-wrapper">
                <div class="custom-select-trigger">
                    ${triggerContent}
                </div>
                <div class="custom-select-options">
                    ${availableLanguages.map(code => `
                        <div class="custom-option ${code === currentValue ? 'selected' : ''}" 
                             data-value="${code}">
                            ${this.createFlagElement(code)}
                            <span class="option-text">
                                <span class="language-name">${this.getLanguageName(code)}</span>
                                <span class="native-name">(${this.getNativeLanguageName(code)})</span>
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <select class="language-select-hidden" name="learning_language" style="display: none;">
                ${availableLanguages.map(code => `
                    <option value="${code}" ${code === currentValue ? 'selected' : ''}>
                        ${this.getLanguageName(code)}
                    </option>
                `).join('')}
            </select>
        </div>
        `;
    }



    // ОБНОВЛЕННЫЙ МЕТОД: создание списка языков С ТАБЛИЦЕЙ МОДЕЛЕЙ
    createLearningList() {
        return `
        <div class="two-panel-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <!-- ПАНЕЛЬ 1: Выбор языков и моделей -->
            <div class="panel-left">
                ${this.createLanguageSelectionPanel()}
            </div>
            
            <!-- ПАНЕЛЬ 2: Таблица загруженных моделей -->
            <div class="panel-right">
                ${this.createDownloadedModelsTable()}
            </div>
        </div>
        
        <!-- ПАНЕЛЬ С БЕГУНКОМ (под двумя панелями) -->
        <div class="storage-info-full" style="margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #555;">
                <span style="font-weight: bold;">Хранилище браузера:</span>
                <span style="color: #333;" id="storage-stats-text">
                    Загрузка информации...
                </span>
            </div>
            <div class="storage-progress-full" style="height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                <div class="storage-progress-fill-full" id="storage-progress-fill"
                     style="height: 100%; background: #4CAF50; width: 0%; transition: width 0.3s;">
                </div>
                <div class="storage-progress-text-full" id="storage-progress-text" 
                     style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: white; text-shadow: 1px 1px 1px rgba(0,0,0,0.3);">
                    0%
                </div>
            </div>
            <div style="font-size: 11px; color: #888; margin-top: 4px; text-align: center;" id="storage-details">
                Рассчитываем использование памяти...
            </div>
        </div>
    `;
    }

    // НОВЫЙ МЕТОД: создание панели выбора языков
    createLanguageSelectionPanel() {
        const currentLearning = this.options.currentLearning;
        const learningLangs = this.options.learningLanguages;

        return `
        <div class="language-selector-group">
            <label class="language-label">Язык - модель</label>
            <div class="learning-languages-list">
                ${Object.entries(this.languageData).map(([code, data]) => {
            // Показываем ВСЕ языки, но dropdown только если есть модели
            const hasModels = data.models && (
                (data.models.whisper && data.models.whisper.length > 0)
            );

            const isSelected = learningLangs.includes(code);
            const isCurrent = code === currentLearning;
            const languageName = this.getLanguageName(code);
            const selectedModels = this.getSelectedModelsForLanguage(code);

            return `
                        <div class="language-item" data-lang="${code}">
                            <div class="language-display" style="display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer;">
                                ${this.createFlagElement(code)} 
                                <span class="language-name" style="font-weight: ${isCurrent ? 'bold' : 'normal'};">
                                    ${languageName}${isCurrent ? ' (текущий)' : ''}
                                </span>
                                
                                ${hasModels ? `
                                    <div class="model-select-wrapper" style="margin-left: auto; position: relative;">
                                        <div class="model-select-trigger" data-lang="${code}" 
                                             style="display: flex; align-items: center; gap: 6px; padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; min-width: 200px; max-width: 250px;">
                                            <span class="model-select-text" style="flex-grow: 1; font-size: 13px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                ${selectedModels ? selectedModels : 'Выберите модель'}
                                            </span>
                                            <i data-lucide="chevron-down" style="width: 16px; height: 16px; flex-shrink: 0;"></i>
                                        </div>
                                        <div class="model-select-dropdown" id="model-dropdown-${code}" 
                                             style="display: none; position: fixed; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10000; max-height: 400px; overflow-y: auto; width: 350px;">
                                            ${this.createModelDropdownItems(code)}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
        }).filter(Boolean).join('')}
            </div>
        </div>
    `;
    }



    // НОВЫЙ МЕТОД: создание элементов выпадающего списка моделей
    createModelDropdownItems(langCode) {
        const languageData = this.languageData[langCode];
        if (!languageData || !languageData.models) {
            return '<div style="padding: 12px; color: #999; font-size: 12px; text-align: center;">Нет доступных моделей</div>';
        }

        let items = [];

        // Проверяем, есть ли хотя бы один тип моделей
        const hasWhisper = languageData.models.whisper && languageData.models.whisper.length > 0;
        const hasTransformerAsr = languageData.models.transformer_asr && languageData.models.transformer_asr.length > 0;

        // Добавляем опцию "без модели" в начало списка, если есть модели
        if (hasWhisper) {
            items.push({
                id: null,
                type: 'whisper',
                name: 'без модели',
                displayText: 'без модели',
                isNone: true
            });
        }

        // Whisper модели
        if (hasWhisper) {
            items.push(...languageData.models.whisper.map(model => ({
                id: model.id,
                type: 'whisper',
                name: model.name,
                quality: model.quality,
                size: model.size,
                recommended: model.recommended,
                displayText: `whisper: ${model.name} ${model.quality ? model.quality + ' ' : ''}${model.size}`,
                isNone: false
            })));
        }

        // Transformer ASR модели
        if (hasTransformerAsr) {
            items.push(...languageData.models.transformer_asr.map(model => ({
                id: model.id,
                type: 'transformer_asr',
                name: model.name,
                quality: model.quality,
                size: model.size,
                recommended: model.recommended,
                displayText: `asr: ${model.name} ${model.quality ? model.quality + ' ' : ''}${model.size}`,
                isNone: false
            })));
        }

        return items.map(item => {
            // Для опции "без модели" проверяем, выбрана ли какая-то модель
            let isSelected = false;
            let selectedModel = null; // Инициализируем переменную для всех случаев

            if (item.isNone) {
                // "без модели" выбрана, если не выбрана whisper модель
                const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
                const hasSelectedWhisper = selectedWhisper && selectedWhisper !== null && selectedWhisper !== '' && selectedWhisper !== 'none' && String(selectedWhisper).trim() !== '';
                isSelected = !hasSelectedWhisper;
                selectedModel = 'none'; // Для опции "без модели"
            } else {
                // Для обычных моделей проверяем стандартным способом
                selectedModel = this.getSelectedModelWithFallback(langCode, item.type);
                // selectedModel должен точно совпадать с item.id (сравниваем как строки)
                isSelected = String(selectedModel) === String(item.id);
            }

            // Отладочный вывод для выбранных элементов
            if (isSelected) {
                console.log(`✓ Модель выбрана: ${langCode}/${item.type}/${item.isNone ? 'none' : item.id}, selectedModel="${selectedModel}" (тип: ${typeof selectedModel})`);
            }

            // Проверяем, загружена ли модель (для опции "без модели" всегда true)
            const isDownloaded = item.isNone ? true : this.isModelDownloadedWithFallback(langCode, item.id, item.type);

            return `
                <div class="model-dropdown-item ${isSelected ? 'selected' : ''}" 
                     data-lang="${langCode}" 
                     data-model="${item.isNone ? 'none' : item.id}" 
                     data-type="${item.type}"
                     data-is-none="${item.isNone}"
                     data-is-downloaded="${isDownloaded}"
                     style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                    <!-- ГАЛОЧКА ВЫБРАННОЙ МОДЕЛИ (или заглушка для выравнивания) -->
                    <div style="width: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        ${isSelected ? '<span style="color: var(--color-button-text-yellow); font-size: 16px; font-weight: bold;">✓</span>' : '<span style="width: 16px;"></span>'}
                    </div>
                    
                    <!-- НАЗВАНИЕ МОДЕЛИ -->
                    <span style="font-size: 13px; color: #333; ${item.isNone ? 'font-style: italic;' : ''}; flex-grow: 1;">${item.displayText}</span>
                    
                    <!-- СЛАЙДЕР ЗАГРУЗКИ (только для обычных моделей) -->
                    ${!item.isNone ? `
                    <div style="display: flex; align-items: center; flex-shrink: 0;">
                        <label class="model-switch" style="position: relative; display: inline-block; width: 40px; height: 20px;">
                            <input type="checkbox" 
                                   class="model-download-toggle"
                                   ${isDownloaded ? 'checked' : ''}
                                   data-lang="${langCode}"
                                   data-model="${item.id}"
                                   data-type="${item.type}"
                                   style="opacity: 0; width: 0; height: 0;">
                            <span class="model-slider ${isDownloaded ? 'downloaded' : ''}" 
                                  style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isDownloaded ? '#8B4513' : '#ccc'}; transition: .4s; border-radius: 20px;">
                                <span class="model-slider-circle" 
                                      style="position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: ${isDownloaded ? '#FFD700' : 'white'}; transition: .4s; border-radius: 50%; ${isDownloaded ? 'transform: translateX(20px);' : ''}"></span>
                            </span>
                        </label>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // НОВЫЙ МЕТОД: создание таблицы загруженных моделей
    createDownloadedModelsTable() {
        const models = this.getDownloadedModelsList();

        if (models.length === 0) {
            return `
            <div class="downloaded-models-panel">
                <label class="language-label">Язык - модель</label>
                <div class="empty-models-message" style="padding: 20px; text-align: center; color: #888; font-style: italic;">
                    Нет загруженных моделей
                </div>
            </div>
        `;
        }

        return `
        <div class="downloaded-models-panel">
            <label class="language-label">Все языковые модели в памяти</label>
            <div class="models-list-container" style="max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; padding: 8px;">
                ${models.map(model => {
            const isActive = this.isModelActive(model.langCode, model.modelId, model.modelType);
            const languageName = this.getLanguageName(model.langCode);
            const modelTypeName = model.modelType === 'whisper' ? 'Whisper' : (model.modelType === 'transformer_asr' ? 'ASR' : model.modelType);

            return `
                    <div class="model-list-item ${isActive ? 'active-model' : ''}" 
                         data-lang="${model.langCode}"
                         data-model="${model.modelId}"
                         data-type="${model.modelType}"
                         style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; ${isActive ? 'background-color: #f0f9ff;' : ''}">
                        <div style="width: 20px; text-align: center; flex-shrink: 0;">
                            ${isActive ? '<span style="color: #4CAF50; font-weight: bold;">✓</span>' : ''}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                            ${this.createFlagElement(model.langCode)}
                            <span style="font-weight: 500;">${languageName}</span>
                        </div>
                        <div style="flex-shrink: 0; color: #666; font-size: 12px; min-width: 70px;">
                            ${modelTypeName}
                        </div>
                        <div style="flex-grow: 1; min-width: 0;">
                            <span style="font-size: 13px;">${model.modelName}</span>
                            ${model.quality ? `<span style="color: #666; font-size: 12px;"> (${model.quality})</span>` : ''}
                        </div>
                        <div style="flex-shrink: 0; color: #666; font-size: 12px; min-width: 80px; text-align: right;">
                            ${model.size}
                        </div>
                        <button class="remove-model-btn" 
                                data-lang="${model.langCode}"
                                data-model="${model.modelId}"
                                data-type="${model.modelType}"
                                style="padding: 6px; background: transparent; color: #dc3545; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: background-color 0.2s; flex-shrink: 0;"
                                onmouseover="this.style.backgroundColor='#fee'"
                                onmouseout="this.style.backgroundColor='transparent'"
                                title="Удалить модель">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                `;
        }).join('')}
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 8px; padding: 0 4px;">
                Всего загружено: ${models.length} моделей | Двойной щелчок по строке - выбор модели
            </div>
        </div>
    `;
    }

    // НОВЫЙ МЕТОД: получение списка загруженных моделей
    getDownloadedModelsList() {
        const models = [];
        const learningLangs = this.options.learningLanguages;
        const showAllLanguages = this.options.mode === 'models-only';

        Object.entries(this.languageData).forEach(([langCode, data]) => {
            const shouldInclude = showAllLanguages ? true : learningLangs.includes(langCode);
            if (shouldInclude && data.models) {
                // Whisper модели
                if (data.models.whisper) {
                    data.models.whisper.forEach(model => {
                        if (this.isModelDownloadedWithFallback(langCode, model.id, 'whisper')) {
                            models.push({
                                langCode,
                                modelId: model.id,
                                modelType: 'whisper',
                                modelName: model.name,
                                quality: model.quality,
                                size: model.size,
                                isActive: this.isModelActive(langCode, model.id, 'whisper')
                            });
                        }
                    });
                }

                // Transformer ASR модели
                if (data.models.transformer_asr) {
                    data.models.transformer_asr.forEach(model => {
                        if (this.isModelDownloadedWithFallback(langCode, model.id, 'transformer_asr')) {
                            models.push({
                                langCode,
                                modelId: model.id,
                                modelType: 'transformer_asr',
                                modelName: model.name,
                                quality: model.quality,
                                size: model.size,
                                isActive: this.isModelActive(langCode, model.id, 'transformer_asr')
                            });
                        }
                    });
                }
            }
        });

        return models;
    }

    // НОВЫЙ МЕТОД: проверка активности модели
    isModelActive(langCode, modelId, modelType) {
        const selectedModel = this.getSelectedModelWithFallback(langCode, modelType);
        return String(selectedModel) === String(modelId);
    }







    // НОВЫЙ МЕТОД: получаем строку выбранных моделей для языка
    getSelectedModelsForLanguage(langCode) {
        const languageData = this.languageData[langCode];
        if (!languageData || !languageData.models) return null;

        let selectedModels = [];

        // Проверяем выбранную Whisper модель
        if (languageData.models.whisper && languageData.models.whisper.length > 0) {
            const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
            if (selectedWhisper && selectedWhisper !== 'none' && selectedWhisper !== '') {
                const model = languageData.models.whisper.find(m => m.id === selectedWhisper);
                if (model) {
                    selectedModels.push(`whisper: ${model.name}`);
                }
            }
        }

        // Проверяем выбранную Transformer ASR модель
        if (languageData.models.transformer_asr && languageData.models.transformer_asr.length > 0) {
            const selectedAsr = this.getSelectedModelWithFallback(langCode, 'transformer_asr');
            if (selectedAsr && selectedAsr !== 'none' && selectedAsr !== '') {
                const model = languageData.models.transformer_asr.find(m => m.id === selectedAsr);
                if (model) {
                    selectedModels.push(`asr: ${model.name}`);
                }
            }
        }

        return selectedModels.length > 0 ? selectedModels.join(' + ') : 'без модели';
    }

    setSelectedModelGeneric(langCode, modelId, modelType) {
        // Only one ASR model should be active per language.
        // If user selects a transformer_asr model, clear whisper selection for this language.
        if (modelType === 'transformer_asr') {
            try {
                localStorage.removeItem(`selected_model_${langCode}_whisper`);
            } catch (e) {
            }
            if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
                window.ModelManager.setSelectedModel(langCode, null, 'whisper');
            }
        }

        const currentKey = `selected_model_${langCode}_${modelType}`;
        if (!modelId || modelId === 'none') {
            localStorage.removeItem(currentKey);
        } else {
            localStorage.setItem(currentKey, modelId);
        }

        if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
            window.ModelManager.setSelectedModel(langCode, modelId || null, modelType);
        }

        console.log(`⭐ Выбрана модель: ${langCode}/${modelType}/${modelId || 'none'}`);
        this.updateModelSelectionUI(langCode);

        // Обновляем таблицу моделей (правая панель) сразу
        this.updateModelsTable();
        this.updateStorageInfo();

        this.syncOtherPanel(langCode);
    }

    // ОБНОВЛЕННЫЙ МЕТОД: расчет использования памяти (правильный)
    calculateStorageUsage() {
        let downloadedCount = 0;
        let totalDownloadedSizeMB = 0;

        // Сначала собираем все доступные модели
        let totalAvailableModels = 0;
        let totalAvailableSizeMB = 0;

        // В режиме models-only показываем все языки с моделями, в остальных - только изучаемые
        const learningLangs = this.options.learningLanguages;
        const showAllLanguages = this.options.mode === 'models-only';

        Object.entries(this.languageData).forEach(([code, data]) => {
            // Проверяем, нужно ли учитывать этот язык
            const shouldInclude = showAllLanguages 
                ? (data.models && ((data.models.whisper && data.models.whisper.length > 0)))
                : learningLangs.includes(code);

            if (shouldInclude && data.models) {
                // Whisper модели
                if (data.models.whisper) {
                    data.models.whisper.forEach(model => {
                        const sizeMB = this.parseSizeToMB(model.size);
                        totalAvailableModels++;
                        totalAvailableSizeMB += sizeMB;

                        // Проверяем, скачана ли модель
                        if (this.isModelDownloadedWithFallback(code, model.id, 'whisper')) {
                            downloadedCount++;
                            totalDownloadedSizeMB += sizeMB;
                        }
                    });
                }

                // Transformer ASR модели
                if (data.models.transformer_asr) {
                    data.models.transformer_asr.forEach(model => {
                        const sizeMB = this.parseSizeToMB(model.size);
                        totalAvailableModels++;
                        totalAvailableSizeMB += sizeMB;

                        if (this.isModelDownloadedWithFallback(code, model.id, 'transformer_asr')) {
                            downloadedCount++;
                            totalDownloadedSizeMB += sizeMB;
                        }
                    });
                }
            }
        });

        const percentage = totalAvailableSizeMB > 0 ?
            Math.round((totalDownloadedSizeMB / totalAvailableSizeMB) * 100) : 0;

        console.log(`📊 Хранилище моделей: ${downloadedCount}/${totalAvailableModels} моделей, ${this.formatSize(totalDownloadedSizeMB)} из ${this.formatSize(totalAvailableSizeMB)} (${percentage}%)`);

        return {
            downloadedCount,
            totalModels: totalAvailableModels,
            downloadedSize: totalDownloadedSizeMB,
            totalSize: totalAvailableSizeMB,
            percentage
        };
    }


    // НОВЫЙ МЕТОД: проверка загрузки модели с fallback
    isModelDownloadedWithFallback(langCode, modelId, modelType) {
        // 1. Проверяем ModelManager
        if (window.ModelManager && typeof window.ModelManager.isModelDownloaded === 'function') {
            const result = window.ModelManager.isModelDownloaded(langCode, modelId, modelType);
            if (result) {
                return true;
            }
        }

        // 2. Проверяем localStorage как fallback
        const key = `model_${langCode}_${modelType}_${modelId}`;
        const stateStr = localStorage.getItem(key);
        if (stateStr) {
            try {
                const state = JSON.parse(stateStr);
                return state.isDownloaded === true;
            } catch (e) {
                return false;
            }
        }

        return false;
    }

    // НОВЫЙ МЕТОД: получение выбранной модели с fallback
    getSelectedModelWithFallback(langCode, modelType) {
        // Сначала проверяем localStorage (как основной источник истины)
        const key = `selected_model_${langCode}_${modelType}`;
        const localStorageValue = localStorage.getItem(key);

        // Если есть ModelManager, проверяем его тоже
        if (window.ModelManager && typeof window.ModelManager.getSelectedModel === 'function') {
            const modelManagerValue = window.ModelManager.getSelectedModel(langCode, modelType);
            // Если значения различаются, приоритет у localStorage
            if (localStorageValue !== modelManagerValue && localStorageValue !== null) {
                console.log(`⚠️ Расхождение: localStorage=${localStorageValue}, ModelManager=${modelManagerValue}, используем localStorage`);
            }
        }

        // Возвращаем значение из localStorage (или null если его нет)
        return localStorageValue;
    }

    // НОВЫЙ МЕТОД: сохраняем состояние модели в localStorage
    saveModelState(langCode, modelId, modelType, isDownloaded = true) {
        const key = `model_${langCode}_${modelType}_${modelId}`;
        const state = {
            langCode,
            modelId,
            modelType,
            isDownloaded,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(state));
        console.log(`💾 Сохранено состояние модели: ${langCode}/${modelType}/${modelId} = ${isDownloaded}`);
    }

    // НОВЫЙ МЕТОД: удаляем состояние модели из localStorage
    removeModelState(langCode, modelId, modelType) {
        const key = `model_${langCode}_${modelType}_${modelId}`;
        localStorage.removeItem(key);
        console.log(`🗑️ Удалено состояние модели: ${langCode}/${modelType}/${modelId}`);
    }

    // ДОБАВЬТЕ НОВЫЙ МЕТОД:
    countAvailableModels() {
        let count = 0;
        const learningLangs = this.options.learningLanguages;

        Object.entries(this.languageData).forEach(([code, data]) => {
            if (learningLangs.includes(code) && data.models) {
                if (data.models.whisper) {
                    count += data.models.whisper.length;
                }

                if (data.models.transformer_asr) {
                    count += data.models.transformer_asr.length;
                }
            }
        });

        return count;
    }

    // ОБНОВЛЕННЫЙ МЕТОД: обновление информации о хранилище
    async updateStorageInfo() {
        const storageInfo = this.calculateStorageUsage();

        // Получаем информацию о реальном хранилище браузера
        let browserQuota = null;
        let browserUsage = null;
        let browserAvailable = null;
        let indexedDBUsage = null;

        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                browserQuota = estimate.quota; // Максимальный объем хранилища (в байтах)
                browserUsage = estimate.usage; // Текущее использование (в байтах)
                browserAvailable = browserQuota - browserUsage; // Свободное место (в байтах)
                
                // Пытаемся получить детали использования IndexedDB
                if (estimate.usageDetails && estimate.usageDetails.indexedDB !== undefined) {
                    indexedDBUsage = estimate.usageDetails.indexedDB;
                }
            } catch (error) {
                console.warn('Не удалось получить информацию о хранилище браузера:', error);
            }
        }

        // Используем размер загруженных моделей для более точного отображения
        // Если IndexedDB usage доступен, используем его, иначе используем расчетный размер моделей
        const modelsSizeBytes = storageInfo.downloadedSize * 1024 * 1024; // Размер моделей в байтах
        
        // Определяем какое значение использовать для отображения
        let displayUsage = null;
        if (indexedDBUsage !== null && indexedDBUsage > 0) {
            displayUsage = indexedDBUsage;
        } else if (browserUsage !== null && browserUsage > modelsSizeBytes * 0.5) {
            // Используем browserUsage только если он больше половины размера моделей
            // (чтобы избежать показа 0 когда модели загружены)
            displayUsage = browserUsage;
        } else if (modelsSizeBytes > 0) {
            // Если есть загруженные модели, используем их размер
            displayUsage = modelsSizeBytes;
        } else if (browserUsage !== null) {
            // Fallback на browserUsage
            displayUsage = browserUsage;
        }

        // Обновляем прогресс-бар
        const storageFill = document.getElementById('storage-progress-fill');
        const storageText = document.getElementById('storage-progress-text');

        let percentage = 0;
        if (browserQuota && displayUsage !== null) {
            percentage = Math.round((displayUsage / browserQuota) * 100);
        } else if (storageInfo.totalSize > 0) {
            // Fallback: используем процент от общего размера моделей
            percentage = storageInfo.percentage;
        }

        if (storageFill) {
            storageFill.style.width = `${percentage}%`;
        }
        if (storageText) {
            storageText.textContent = `${percentage}%`;
        }

        // Обновляем статистику
        const statsText = document.getElementById('storage-stats-text');
        const detailsText = document.getElementById('storage-details');

        if (statsText) {
            if (browserQuota && displayUsage !== null) {
                // Показываем реальное использование хранилища браузера
                statsText.textContent = `${this.formatSize(displayUsage / (1024 * 1024))} из ${this.formatSize(browserQuota / (1024 * 1024))}`;
            } else {
                // Fallback: показываем информацию о моделях
                statsText.textContent = `${storageInfo.downloadedCount} из ${storageInfo.totalModels} моделей (${this.formatSize(storageInfo.downloadedSize)})`;
            }
        }

        if (detailsText) {
            if (browserQuota && browserUsage !== null && browserAvailable !== null) {
                // Определяем какое значение использовать для "Использовано"
                // Если browserUsage очень мал, но есть загруженные модели, используем размер моделей
                const modelsSizeMB = storageInfo.downloadedSize;
                const browserUsageMB = browserUsage / (1024 * 1024);
                const displayUsageMB = (browserUsageMB < modelsSizeMB * 0.5 && modelsSizeMB > 0) 
                    ? modelsSizeMB 
                    : browserUsageMB;
                
                // Пересчитываем доступное место с учетом реального использования
                const displayAvailableMB = (browserQuota / (1024 * 1024)) - displayUsageMB;
                
                const modelsInfo = storageInfo.downloadedCount > 0 
                    ? ` | <strong>Модели:</strong> ${storageInfo.downloadedCount} шт. (${this.formatSize(storageInfo.downloadedSize)})`
                    : '';
                detailsText.innerHTML = `
                    <strong>Использовано:</strong> ${this.formatSize(displayUsageMB)} | 
                    <strong>Доступно:</strong> ${this.formatSize(displayAvailableMB)} | 
                    <strong>Всего:</strong> ${this.formatSize(browserQuota / (1024 * 1024))}${modelsInfo}
                `;
            } else {
                // Fallback: показываем информацию о моделях
                detailsText.innerHTML = `
                    <strong>Загружено моделей:</strong> ${storageInfo.downloadedCount} из ${storageInfo.totalModels} | 
                    <strong>Размер моделей:</strong> ${this.formatSize(storageInfo.downloadedSize)}
                `;
            }
        }
    }

    // Вспомогательные методы для работы с размерами
    parseSizeToMB(sizeString) {
        if (!sizeString) return 0;

        const size = parseFloat(sizeString);
        if (sizeString.toLowerCase().includes('gb')) {
            return size * 1024;
        } else if (sizeString.toLowerCase().includes('mb')) {
            return size;
        } else if (sizeString.toLowerCase().includes('kb')) {
            return size / 1024;
        }
        return size;
    }

    formatSize(mbSize) {
        if (mbSize >= 1024) {
            return (mbSize / 1024).toFixed(1) + ' GB';
        } else {
            return mbSize.toFixed(1) + ' MB';
        }
    }

    // НОВЫЙ МЕТОД: компактная структура для профиля пользователя
    createProfilePanels() {
        return `
            <div class="profile-language-section">
                <div class="profile-language-inline">
                    <div class="profile-language-item profile-language-item--native">
                        <span class="profile-language-label">Родной</span>
                        ${this.createNativeSelector()}
                    </div>
                    <div class="profile-language-item profile-language-item--learning">
                        <span class="profile-language-label">Учу</span>
                        ${this.createLearningSelector()}
                    </div>
                </div>
                <div class="profile-language-list">
                    ${this.createLearningList()}
                </div>
            </div>
        `;
    }

    createFlagCombo() {
        const nativeLang = this.options.nativeLanguage;
        const learningLang = this.options.currentLearning;

        return `
            <div class="flag-combo">
                ${this.createFlagElement(learningLang)}
                <span class="flag-separator">→</span>
                ${this.createFlagElement(nativeLang)}
            </div>
        `;
    }

    createFlagSingle() {
        const lang = this.options.currentLearning || this.options.nativeLanguage;
        return `
            <div class="flag-single">
                ${this.createFlagElement(lang)}
            </div>
        `;
    }

    createFlagPairFixed() {
        const leftLang = this.options.currentLearning;
        const rightLang = this.options.nativeLanguage;
        return `
            <div class="flag-pair-combo" data-mode="flag-pair-fixed">
                <div class="flag-pair-side flag-pair-side--left">${this.createFlagElement(leftLang)}</div>
                <i data-lucide="arrow-big-right"></i>
                <div class="flag-pair-side flag-pair-side--right">${this.createFlagElement(rightLang)}</div>
            </div>
        `;
    }

    createFlagPairDropdown({ leftDropdown = false, rightDropdown = false } = {}) {
        const leftLang = this.options.currentLearning;
        const rightLang = this.options.nativeLanguage;
        const leftList = Array.isArray(this.options.learningLanguages) ? this.options.learningLanguages : [];
        const rightList = Array.isArray(this.options.nativeLanguages) ? this.options.nativeLanguages : [];

        const leftHtml = `
            <div class="flag-pair-side flag-pair-side--left" ${leftDropdown ? 'data-side="left"' : ''}>
                ${this.createFlagElement(leftLang)}
            </div>
        `;

        const rightHtml = `
            <div class="flag-pair-side flag-pair-side--right" ${rightDropdown ? 'data-side="right"' : ''}>
                ${this.createFlagElement(rightLang)}
            </div>
        `;

        const leftDropdownHtml = leftDropdown
            ? `
                <div class="header-selector-dropdown flag-pair-dropdown" data-side="left" style="display: none;">
                    <div class="header-dropdown-options">
                        ${leftList.map(code => `
                            <div class="header-dropdown-option ${code === leftLang ? 'selected' : ''}" data-side="left" data-value="${code}">
                                ${this.createFlagElement(code)}
                                <span class="header-option-text">${this.getLanguageName(code)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
            : '';

        const rightDropdownHtml = rightDropdown
            ? `
                <div class="header-selector-dropdown flag-pair-dropdown" data-side="right" style="display: none;">
                    <div class="header-dropdown-options">
                        ${rightList.map(code => `
                            <div class="header-dropdown-option ${code === rightLang ? 'selected' : ''}" data-side="right" data-value="${code}">
                                ${this.createFlagElement(code)}
                                <span class="header-option-text">${this.getLanguageName(code)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
            : '';

        return `
            <div class="flag-pair-combo" data-mode="flag-pair-dropdown">
                ${leftHtml}
                <i data-lucide="arrow-big-right"></i>
                ${rightHtml}
            </div>
            ${leftDropdownHtml}
            ${rightDropdownHtml}
        `;
    }

    createHeaderSelector() {
        const nativeLang = this.options.nativeLanguage;
        const learningLang = this.options.currentLearning;
        const availableLanguages = this.options.learningLanguages;

        return `
            <div class="header-flag-combo">
                ${this.createFlagElement(learningLang)}
                <i data-lucide="arrow-big-right"></i>
                ${this.createFlagElement(nativeLang)}
            </div>
            <div class="header-selector-dropdown" style="display: none;">
                <div class="header-dropdown-options">
                    ${availableLanguages.map(code => `
                        <div class="header-dropdown-option ${code === learningLang ? 'selected' : ''}" 
                             data-value="${code}">
                            ${this.createFlagElement(code)}
                            <span class="header-option-text">${this.getLanguageName(code)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    updateHeaderButton() {
        if (this.options.mode !== 'header-selector') return;

        const headerCombo = this.options.container.querySelector('.header-flag-combo');
        if (!headerCombo) return;

        const learningLang = this.options.currentLearning;
        const nativeLang = this.options.nativeLanguage;

        headerCombo.innerHTML = `
        ${this.createFlagElement(learningLang)}
        <i data-lucide="arrow-big-right"></i>
        ${this.createFlagElement(nativeLang)}
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    render() {
        if (!this.options.container || !this.languageData) {
            console.warn('Cannot render: container or language data missing');
            return;
        }

        let html = '';
        switch (this.options.mode) {
            case 'native-selector':
                html = this.createNativeSelector();
                break;
            case 'learning-selector':
            case 'learning-selector-compact':
                html = this.createLearningSelector();
                break;
            case 'learning-list':
                html = this.createLearningList();
                break;
            case 'learning-flags':
                html = this.createLearningFlags();
                break;
            case 'flag-combo':
                html = this.createFlagCombo();
                break;
            case 'flag-single':
                html = this.createFlagSingle();
                break;
            case 'flag-pair-fixed':
                html = this.createFlagPairFixed();
                break;
            case 'flag-pair-dropdown-both':
                html = this.createFlagPairDropdown({ leftDropdown: true, rightDropdown: true });
                break;
            case 'flag-pair-dropdown-right':
                html = this.createFlagPairDropdown({ leftDropdown: false, rightDropdown: true });
                break;
            case 'flag-pair-dropdown-left':
                html = this.createFlagPairDropdown({ leftDropdown: true, rightDropdown: false });
                break;
            case 'header-selector':
                html = this.createHeaderSelector();
                break;
            case 'report-selector':
                html = this.createReportSelector();
                break;
            case 'profile-panels':
                html = this.createProfilePanels();
                break;
            case 'profile':
                html = this.createNativeSelector() + this.createLearningList() + this.createLearningSelector();
                break;
            case 'registration':
                html = this.createNativeSelector() + this.createLearningSelector();
                break;
            case 'models-only':
                html = this.createLearningList();
                break;
            case 'models-centric':
                html = this.createModelsCentricUI();
                break;
            default:
                html = this.createNativeSelector();
        }

        this.options.container.innerHTML = html;
        this.bindEvents();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Обновляем информацию о хранилище после рендеринга (для режима models-only)
        if (this.options.mode === 'models-only' || this.options.mode === 'learning-list') {
            setTimeout(() => {
                this.updateStorageInfo();
            }, 100);
        }

        if (this.options.mode === 'models-centric') {
            setTimeout(() => {
                this.updateStorageInfoV2();
            }, 100);
        }
    }

    // Обновленные обработчики событий
    bindEvents() {
        if (this.options.mode === 'models-centric') {
            this.bindModelsCentricEvents();
            return;
        }

        // learning-flags (users.tr_*): локальные клики без полной перерисовки
        try {
            if (this.options.mode === 'learning-flags') {
                const btns = this.options.container.querySelectorAll('.learning-flag-checkbox');
                btns.forEach((btn) => {
                    const lang = String(btn.dataset.lang || '').trim().toLowerCase();
                    const isChecked = Array.isArray(this.options.learningLanguages)
                        ? this.options.learningLanguages.map(x => String(x || '').trim().toLowerCase()).includes(lang)
                        : false;
                    this._renderLucideCheckboxButton(btn, isChecked, false);
                });
            }
        } catch (e) {
        }

        try {
            if (this.options.mode === 'learning-flags' && this._learningFlagsClickBound) {
                return;
            }

            this.options.container.addEventListener('click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.learning-flag-checkbox') : null;
                const toggle = e.target && e.target.closest ? e.target.closest('.learning-flag-toggle') : null;
                const target = btn || toggle;
                if (!target) return;

                if (this.options.mode !== 'learning-flags') return;

                e.preventDefault();
                e.stopPropagation();

                const lang = String(target.dataset.lang || '').trim().toLowerCase();
                if (!lang) return;

                const list = Array.isArray(this.options.learningLanguages) ? [...this.options.learningLanguages] : [];
                const set = new Set(list.map(x => String(x || '').trim().toLowerCase()).filter(Boolean));

                const hasLang = set.has(lang);
                if (hasLang && set.size <= 1) {
                    try {
                        const msg = this._t('profile.learning_languages.at_least_one', null, 'Нужно выбрать хотя бы один язык');
                        if (window.showInfo) window.showInfo(msg);
                        else alert(msg);
                    } catch (e2) {
                    }
                    return;
                }

                if (hasLang) set.delete(lang);
                else set.add(lang);

                const next = [...set];
                next.sort();
                this.options.learningLanguages = next;

                const cur = String(this.options.currentLearning || '').trim().toLowerCase();
                if (cur && !set.has(cur)) {
                    this.options.currentLearning = next[0] || '';
                } else if (!cur && next.length) {
                    this.options.currentLearning = next[0];
                }

                // обновляем только иконку кликаемой строки
                try {
                    const row = target.closest('.learning-flag-row');
                    const rowBtn = row ? row.querySelector('.learning-flag-checkbox') : null;
                    if (rowBtn) {
                        const nowChecked = set.has(lang);
                        this._renderLucideCheckboxButton(rowBtn, nowChecked, false);
                    }
                } catch (e3) {
                }

                this.triggerChange();
            });

            if (this.options.mode === 'learning-flags') {
                this._learningFlagsClickBound = true;
            }
        } catch (e) {
        }

        if (this.options.mode === 'report-selector') {
            try {
                const cur = String(this.options.currentLearning || '');
                console.debug('[LanguageSelector][report-selector] bindEvents', {
                    containerId: this.options.container && this.options.container.id,
                    currentLearning: cur,
                });
            } catch (e) {
            }

            const combo = this.options.container.querySelector('.report-language-combo');
            const dropdown = this.options.container.querySelector('.report-language-dropdown');

            if (!combo || !dropdown) {
                try {
                    console.debug('[LanguageSelector][report-selector] missing combo/dropdown', {
                        hasCombo: !!combo,
                        hasDropdown: !!dropdown,
                        containerId: this.options.container && this.options.container.id,
                    });
                } catch (e) {
                }
                return;
            }

            if (this._onReportSelectorDocumentClick) {
                document.removeEventListener('click', this._onReportSelectorDocumentClick);
                this._onReportSelectorDocumentClick = null;
            }

            combo.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = dropdown.style.display === 'block';
                dropdown.style.display = isVisible ? 'none' : 'block';
                try {
                    console.debug('[LanguageSelector][report-selector] combo click', {
                        containerId: this.options.container && this.options.container.id,
                        wasVisible: isVisible,
                        nowDisplay: dropdown.style.display,
                    });
                } catch (e) {
                }
            });

            dropdown.querySelectorAll('.report-language-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;
                    try {
                        console.debug('[LanguageSelector][report-selector] option click', {
                            containerId: this.options.container && this.options.container.id,
                            value,
                        });
                    } catch (e) {
                    }
                    this.options.currentLearning = value;
                    this.render();
                    dropdown.style.display = 'none';
                    this.triggerChange({
                        currentLearning: value
                    });
                });
            });

            this._onReportSelectorDocumentClick = (e) => {
                if (!combo.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.style.display = 'none';
                    try {
                        console.debug('[LanguageSelector][report-selector] outside click -> close', {
                            containerId: this.options.container && this.options.container.id,
                        });
                    } catch (e) {
                    }
                }
            };
            document.addEventListener('click', this._onReportSelectorDocumentClick);
            return;
        }

        // 1. Обработчики для кастомных селекторов
        const customSelects = this.options.container.querySelectorAll('.custom-select-wrapper');
        customSelects.forEach(select => {
            const trigger = select.querySelector('.custom-select-trigger');
            const options = select.querySelector('.custom-select-options');
            const parentGroup = select.closest('.language-selector-group');
            const selectorType = parentGroup ? parentGroup.dataset.selectorType : null;

            if (!trigger || !options) {
                console.warn('Missing elements in custom select');
                return;
            }

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                options.style.display = options.style.display === 'block' ? 'none' : 'block';
            });

            select.querySelectorAll('.custom-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;

                    if (selectorType === 'native') {
                        this.options.nativeLanguage = value;
                    } else if (selectorType === 'learning') {
                        this.options.currentLearning = value;
                    }

                    this.render();
                    this.triggerChange();
                });
            });
        });

        // Закрытие селекторов при клике вне
        document.addEventListener('click', (e) => {
            this.options.container.querySelectorAll('.custom-select-options').forEach(options => {
                options.style.display = 'none';
            });

            // Закрываем все выпадающие списки моделей
            this.options.container.querySelectorAll('.model-select-dropdown').forEach(dropdown => {
                dropdown.style.display = 'none';
            });
        });

        // 2. Обработчики для выпадающих списков моделей
        this.options.container.addEventListener('click', (e) => {
            // Клик по строке языка (делаем текущим изучаемым)
            const languageItem = e.target.closest('.language-item');
            if (languageItem && !e.target.closest('.model-select-wrapper')) {
                const lang = languageItem.dataset.lang;

                if (this.options.learningLanguages.includes(lang)) {
                    this.options.currentLearning = lang;
                    this.render();
                    this.triggerChange();
                }
                return;
            }

            // Открытие/закрытие выпадающего списка моделей
            if (e.target.closest('.model-select-trigger')) {
                const trigger = e.target.closest('.model-select-trigger');
                const langCode = trigger.dataset.lang;
                const dropdown = this.options.container.querySelector(`#model-dropdown-${langCode}`);

                if (dropdown) {
                    // Закрываем все другие выпадающие списки
                    this.options.container.querySelectorAll('.model-select-dropdown').forEach(d => {
                        if (d !== dropdown) {
                            d.style.display = 'none';
                        }
                    });

                    // Открываем/закрываем текущий
                    const isVisible = dropdown.style.display === 'block';
                    if (!isVisible) {
                        // Вычисляем позицию для fixed позиционирования
                        const triggerRect = trigger.getBoundingClientRect();
                        dropdown.style.position = 'fixed';
                        dropdown.style.top = `${triggerRect.bottom + window.scrollY + 2}px`;
                        dropdown.style.right = `${window.innerWidth - triggerRect.right + window.scrollX}px`;
                        dropdown.style.left = 'auto';
                        dropdown.style.width = '350px';
                        dropdown.style.zIndex = '10000';
                        dropdown.style.display = 'block';
                    } else {
                        dropdown.style.display = 'none';
                    }
                }
                e.stopPropagation();
                return;
            }

            // Выбор модели из списка (кроме переключателя загрузки)
            const modelItem = e.target.closest('.model-dropdown-item');
            if (modelItem && !e.target.closest('.model-switch')) {
                const langCode = modelItem.dataset.lang;
                const modelId = modelItem.dataset.model;
                const modelType = modelItem.dataset.type;
                const isNone = modelItem.dataset.isNone === 'true';
                const isDownloaded = modelItem.dataset.isDownloaded === 'true';

                // Двойной клик - выбор модели
                if (e.detail === 2) {
                    // Очищаем таймер одинарного клика, если он был установлен
                    if (this._clickTimeout) {
                        clearTimeout(this._clickTimeout);
                        this._clickTimeout = null;
                    }
                    this.selectModel(langCode, modelId, modelType, isNone, isDownloaded);
                    e.stopPropagation();
                    return;
                }

                // Одинарный клик - выбор модели (для удобства)
                // Используем setTimeout чтобы не конфликтовать с двойным кликом
                if (!this._clickTimeout) {
                    this._clickTimeout = setTimeout(() => {
                        this.selectModel(langCode, modelId, modelType, isNone, isDownloaded);
                        this._clickTimeout = null;
                    }, 300); // Задержка для двойного клика
                }

                e.stopPropagation();
                return;
            }
        });

        // 3. Обработчик переключателей загрузки моделей
        this.options.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('model-download-toggle')) {
                const langCode = e.target.dataset.lang;
                const modelId = e.target.dataset.model;
                const modelType = e.target.dataset.type;
                const isChecked = e.target.checked;

                const slider = e.target.nextElementSibling;
                const sliderCircle = slider.querySelector('.model-slider-circle');

                if (isChecked) {
                    // Загрузка модели
                    this.downloadModel(langCode, modelId, modelType, slider, sliderCircle);
                } else {
                    // Удаление модели
                    this.removeModel(langCode, modelId, modelType, slider, sliderCircle);
                }

                // Сразу синхронизируем вторую панель (пока идет загрузка/удаление и после)
                if (typeof this.syncOtherPanel === 'function') {
                    this.syncOtherPanel(langCode);
                }

                e.stopPropagation();
            }
        });

        // 4. Обработчик для header-selector режима
        if (this.options.mode === 'header-selector') {
            const headerCombo = this.options.container.querySelector('.header-flag-combo');
            const headerDropdown = this.options.container.querySelector('.header-selector-dropdown');

            if (headerCombo && headerDropdown) {
                headerCombo.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isVisible = headerDropdown.style.display === 'block';
                    headerDropdown.style.display = isVisible ? 'none' : 'block';
                });

                const dropdownOptions = headerDropdown.querySelectorAll('.header-dropdown-option');
                dropdownOptions.forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const value = option.dataset.value;

                        this.options.currentLearning = value;
                        this.updateHeaderButton();
                        headerDropdown.style.display = 'none';

                        this.triggerChange({
                            nativeLanguage: this.options.nativeLanguage,
                            learningLanguages: this.options.learningLanguages,
                            currentLearning: value
                        });
                    });
                });

                document.addEventListener('click', (e) => {
                    if (!headerCombo.contains(e.target) && !headerDropdown.contains(e.target)) {
                        headerDropdown.style.display = 'none';
                    }
                });
            }
        }

        // 5. Обработчики для режимов flag-pair-dropdown-*
        if (this.options.mode === 'flag-pair-dropdown-both'
            || this.options.mode === 'flag-pair-dropdown-right'
            || this.options.mode === 'flag-pair-dropdown-left') {

            const combo = this.options.container.querySelector('.flag-pair-combo');
            const dropdowns = this.options.container.querySelectorAll('.flag-pair-dropdown');

            const closeAll = () => {
                dropdowns.forEach(d => {
                    try { d.style.display = 'none'; } catch (e) {}
                });
            };

            const openSide = (side) => {
                if (!side) return;
                dropdowns.forEach(d => {
                    if (d && d.dataset && d.dataset.side === side) {
                        const isVisible = d.style.display === 'block';
                        d.style.display = isVisible ? 'none' : 'block';
                    } else {
                        try { if (d) d.style.display = 'none'; } catch (e) {}
                    }
                });
            };

            if (combo) {
                combo.addEventListener('click', (e) => {
                    const sideEl = e.target.closest('[data-side]');
                    const side = sideEl ? sideEl.dataset.side : '';
                    if (!side) {
                        // UX: clicking on the arrow / empty area should still open the dropdown.
                        // For single-side dropdowns, open that side by default.
                        if (this.options.mode === 'flag-pair-dropdown-right') {
                            e.stopPropagation();
                            openSide('right');
                            return;
                        }
                        if (this.options.mode === 'flag-pair-dropdown-left') {
                            e.stopPropagation();
                            openSide('left');
                            return;
                        }
                        closeAll();
                        return;
                    }
                    e.stopPropagation();
                    openSide(side);
                });
            }

            dropdowns.forEach(d => {
                if (!d) return;
                d.querySelectorAll('.header-dropdown-option').forEach(opt => {
                    opt.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const side = opt.dataset.side;
                        const value = opt.dataset.value;
                        if (side === 'left') {
                            this.options.currentLearning = value;
                        } else if (side === 'right') {
                            this.options.nativeLanguage = value;
                        }
                        this.render();
                        this.triggerChange();
                    });
                });
            });

            if (!this._flagPairDropdownBound) {
                this._flagPairDropdownBound = true;
                document.addEventListener('click', (e) => {
                    try {
                        if (this.options.container && !this.options.container.contains(e.target)) {
                            closeAll();
                        }
                    } catch (e2) {
                    }
                });
            }
        }

        // Обновляем иконки Lucide
        if (window.lucide && window.lucide.createIcons) {
            setTimeout(() => {
                window.lucide.createIcons();
            }, 100);
        }

        // 6. Обработчики для списка загруженных моделей
        this.options.container.addEventListener('click', (e) => {
            // Клик по кнопке удаления в списке
            const removeBtn = e.target.closest('.remove-model-btn');
            if (removeBtn) {
                e.stopPropagation();
                const langCode = removeBtn.dataset.lang;
                const modelId = removeBtn.dataset.model;
                const modelType = removeBtn.dataset.type;

                this.confirmAndRemoveModel(langCode, modelId, modelType, removeBtn);
                return;
            }

            // Двойной клик по строке в списке для выбора модели
            const modelRow = e.target.closest('.model-list-item');
            if (modelRow && e.detail === 2) {
                e.stopPropagation();
                const langCode = modelRow.dataset.lang;
                const modelId = modelRow.dataset.model;
                const modelType = modelRow.dataset.type;

                // Проверяем, активна ли уже эта модель
                if (this.isModelActive(langCode, modelId, modelType)) {
                    console.log(`Модель ${langCode}/${modelType}/${modelId} уже активна`);
                    return;
                }

                // Выбираем модель
                this.selectModel(langCode, modelId, modelType, false, true);
                return;
            }
        });
    }

    // НОВЫЙ МЕТОД: подтверждение и удаление модели
    async confirmAndRemoveModel(langCode, modelId, modelType, buttonElement) {
            const modelData = this.languageData[langCode]?.models?.[modelType]?.find(m => m.id === modelId);
            if (!modelData) return;

            const languageName = this.getLanguageName(langCode);
            const modelName = modelData.name;
            const modelTypeName = 'Whisper';

            // Проверяем, активна ли эта модель
            const isActive = this.isModelActive(langCode, modelId, modelType);

            // Показываем модальное окно подтверждения
            const confirmed = await this.showModelRemoveConfirmModal(
                languageName,
                modelTypeName,
                modelName,
                isActive
            );

            if (!confirmed) {
                return;
            }

            try {
                buttonElement.disabled = true;

                // Показываем индикатор загрузки
                this.showRemoveModelLoading();

                // Если модель активна, снимаем выбор
                if (isActive) {
                    const key = `selected_model_${langCode}_${modelType}`;
                    localStorage.removeItem(key);

                    if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
                        window.ModelManager.setSelectedModel(langCode, modelType, null);
                    }
                }

                // Удаляем модель
                await this.removeModel(langCode, modelId, modelType);

                // Скрываем индикатор загрузки
                this.hideRemoveModelLoading();

                // Обновляем интерфейс (таблица обновится и строка исчезнет)
                this.updateModelSelectionUI(langCode);
                this.updateModelsTable();
                this.updateStorageInfo();
                
                // Если это правая панель, обновляем также левую панель (если она существует)
                if (window.languageSelector && this.options.mode === 'models-only') {
                    window.languageSelector.updateModelSelectionUI(langCode);
                }

            } catch (error) {
                console.error('Ошибка при удалении модели:', error);
                this.hideRemoveModelLoading();
                alert('Ошибка при удалении модели: ' + error.message);
                buttonElement.disabled = false;
            }
    }

    // Модальное окно подтверждения удаления модели
    showModelRemoveConfirmModal(languageName, modelTypeName, modelName, isActive) {
        return new Promise((resolve) => {
            // Удаляем старое модальное окно, если есть
            const oldModal = document.getElementById('model-remove-confirm-modal');
            if (oldModal) {
                oldModal.remove();
            }

            const modal = document.createElement('div');
            modal.id = 'model-remove-confirm-modal';
            modal.style.cssText = `
                display: flex;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 10001;
                justify-content: center;
                align-items: center;
            `;

            modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 24px;
                    border-radius: 8px;
                    max-width: 450px;
                    width: 90%;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                ">
                    <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">
                        Удаление модели
                    </h3>
                    <div style="margin: 0 0 20px 0; color: #666; font-size: 14px; line-height: 1.6;">
                        <p style="margin: 0 0 12px 0;">
                            Вы уверены, что хотите удалить модель
                        </p>
                        <p style="margin: 0 0 12px 0;">
                            <strong>"${modelTypeName}: ${modelName}"</strong>
                        </p>
                        <p style="margin: 0;">
                            для языка <strong>"${languageName}"</strong>?
                        </p>
                        ${isActive ? `
                            <p style="margin: 12px 0 0 0; color: #d32f2f; font-weight: 500;">
                                ⚠️ Эта модель активна! После удаления будет выбрана опция "без модели".
                            </p>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button id="remove-cancel-btn" style="
                            padding: 10px 20px;
                            border: 1px solid #ddd;
                            border-radius: 6px;
                            background: white;
                            color: #333;
                            cursor: pointer;
                            font-size: 14px;
                            transition: background-color 0.2s;
                        " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='white'">
                            Не удалять
                        </button>
                        <button id="remove-confirm-btn" style="
                            padding: 10px 20px;
                            border: none;
                            border-radius: 6px;
                            background: #dc3545;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 600;
                            transition: background-color 0.2s;
                        " onmouseover="this.style.backgroundColor='#c82333'" onmouseout="this.style.backgroundColor='#dc3545'">
                            Удалить
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Обработчики кнопок
            const cancelBtn = modal.querySelector('#remove-cancel-btn');
            const confirmBtn = modal.querySelector('#remove-confirm-btn');

            const cleanup = () => {
                modal.remove();
            };

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            // Закрытие по клику вне модального окна
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    // Показать индикатор загрузки при удалении
    showRemoveModelLoading() {
        let loadingModal = document.getElementById('model-remove-loading-modal');
        if (loadingModal) {
            loadingModal.style.display = 'flex';
            return;
        }

        loadingModal = document.createElement('div');
        loadingModal.id = 'model-remove-loading-modal';
        loadingModal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10002;
            justify-content: center;
            align-items: center;
        `;

        loadingModal.innerHTML = `
            <div style="
                background: white;
                padding: 30px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                min-width: 200px;
            ">
                <div class="loading-spinner" style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid #e0e0e0;
                    border-top: 4px solid #dc3545;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px;
                "></div>
                <p style="
                    margin: 0;
                    color: #666;
                    font-size: 14px;
                ">Удаление модели...</p>
            </div>
        `;

        // Добавляем анимацию spin если её нет
        if (!document.getElementById('remove-loading-spin-style')) {
            const style = document.createElement('style');
            style.id = 'remove-loading-spin-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(loadingModal);
    }

    // Скрыть индикатор загрузки при удалении
    hideRemoveModelLoading() {
        const loadingModal = document.getElementById('model-remove-loading-modal');
        if (loadingModal) {
            loadingModal.style.display = 'none';
        }
    }

    // НОВЫЙ МЕТОД: обновление списка моделей
    updateModelsTable() {
        const modelsPanel = this.options.container.querySelector('.downloaded-models-panel');
        if (modelsPanel) {
            modelsPanel.outerHTML = this.createDownloadedModelsTable();
            // Инициализируем иконки Lucide после обновления списка
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                setTimeout(() => {
                    lucide.createIcons();
                }, 0);
            }
            // Обновляем информацию о хранилище после обновления списка
            setTimeout(() => {
                this.updateStorageInfo();
            }, 50);
        }
    }

    // НОВЫЙ МЕТОД: загрузка модели
    async downloadModel(langCode, modelId, modelType, slider, sliderCircle) {
        try {
            const languageName = this.getLanguageName(langCode);
            const modelData = this.languageData[langCode]?.models?.[modelType]?.find(m => m.id === modelId);

            if (!modelData) {
                console.error(`Модель ${modelId} не найдена для языка ${langCode}`);
                return;
            }

            // Показываем модальное окно загрузки
            this.showWhisperDownloadModal(langCode);
            this.updateWhisperDownloadModalStatus(`Загрузка Whisper модели ${modelData.name}...`);

            const updateProgress = (percent) => {
                this.updateWhisperDownloadModalProgress(percent);
            };

            updateProgress(0);

            try {
                // Обеспечиваем, что модель реально скачана (Transformers.js + WhisperModelManager)
                // Это нужно для оффлайн-распознавания в диктанте.
                const ensureTransformersReady = async () => {
                    if (typeof window.pipeline !== 'undefined') return true;
                    await new Promise((resolve) => {
                        let done = false;
                        const finish = () => {
                            if (done) return;
                            done = true;
                            resolve();
                        };
                        try {
                            window.addEventListener('transformers-ready', finish, { once: true });
                        } catch (e) {
                        }
                        setTimeout(finish, 6000);
                    });
                    return typeof window.pipeline !== 'undefined';
                };

                if (modelType === 'whisper') {
                    await ensureTransformersReady();
                    if (window.WhisperModelManager) {
                        const mm = new window.WhisperModelManager();
                        await mm.loadLanguageModel(langCode, modelId, (p) => {
                            const percent = p && p.progress !== undefined ? Math.round(p.progress * 100) : null;
                            if (percent !== null && isFinite(percent)) {
                                updateProgress(Math.max(0, Math.min(100, percent)));
                            }
                        });
                    }
                }

                // Пробуем загрузить через ModelManager
                if (window.ModelManager && typeof window.ModelManager.downloadModel === 'function') {
                    console.log(`🔄 Начинаем загрузку через ModelManager: ${langCode}/${modelType}/${modelId}`);

                    // Пытаемся скачать (это может упасть с 404)
                    try {
                        await window.ModelManager.downloadModel(langCode, modelId, modelType, (progress) => {
                            if (progress && progress.percent !== undefined) {
                                const percent = Math.round(progress.percent);
                                updateProgress(percent);
                            }
                        });

                        console.log(`✅ ModelManager успешно загрузил модель ${langCode}/${modelType}/${modelId}`);

                        // Отмечаем как скачанную только после успешной загрузки
                        window.ModelManager.setModelDownloaded(langCode, modelId, modelType, {
                            size: this.parseSizeToMB(modelData.size) * 1024 * 1024, // в байтах
                            name: modelData.name
                        });

                        // Обновляем UI
                        slider.classList.add('downloaded');
                        slider.style.backgroundColor = '#8B4513';
                        if (sliderCircle) {
                            sliderCircle.style.backgroundColor = '#FFD700';
                            sliderCircle.style.transform = 'translateX(20px)';
                        }

                    } catch (downloadError) {
                        console.log(`⚠️ Ошибка загрузки модели:`, downloadError);

                        // Если это 404, продолжаем работу с локально сохраненной моделью
                        if (downloadError.message.includes('404')) {
                            console.log(`ℹ️ Сервер не доступен, работаем в offline режиме`);
                            this.updateWhisperDownloadModalStatus('⚠️ Офлайн режим. Модель сохранена локально');

                            // Для 404 считаем, что локальная модель уже есть (fallback-поведение как раньше)
                            window.ModelManager.setModelDownloaded(langCode, modelId, modelType, {
                                size: this.parseSizeToMB(modelData.size) * 1024 * 1024,
                                name: modelData.name
                            });

                            slider.classList.add('downloaded');
                            slider.style.backgroundColor = '#8B4513';
                            if (sliderCircle) {
                                sliderCircle.style.backgroundColor = '#FFD700';
                                sliderCircle.style.transform = 'translateX(20px)';
                            }

                            // Ждем немного для показа сообщения
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
                            // Любая другая ошибка: откатываем UI/состояние, чтобы не было "желтого бегунка" без реальной загрузки
                            try {
                                if (window.ModelManager && typeof window.ModelManager.removeModel === 'function') {
                                    window.ModelManager.removeModel(langCode, modelId, modelType);
                                }
                            } catch (e) {
                            }
                            try {
                                this.removeModelState(langCode, modelId, modelType);
                            } catch (e) {
                            }
                            if (slider) {
                                slider.classList.remove('downloaded');
                                slider.style.backgroundColor = '#ccc';
                            }
                            if (sliderCircle) {
                                sliderCircle.style.backgroundColor = 'white';
                                sliderCircle.style.transform = 'translateX(0)';
                            }
                            throw downloadError;
                        }
                    }

                } else {
                    // ModelManager не найден, работаем локально
                    console.log(`🔄 ModelManager не найден, работаем локально`);

                    // Сохраняем в localStorage напрямую
                    this.saveModelState(langCode, modelId, modelType, true);

                    // Обновляем UI
                    slider.classList.add('downloaded');
                    slider.style.backgroundColor = '#8B4513';
                    if (sliderCircle) {
                        sliderCircle.style.backgroundColor = '#FFD700';
                        sliderCircle.style.transform = 'translateX(20px)';
                    }

                    // Имитация загрузки
                    await new Promise(resolve => {
                        let percent = 0;
                        const interval = setInterval(() => {
                            percent += 10;
                            updateProgress(percent);

                            if (percent >= 100) {
                                clearInterval(interval);
                                resolve();
                            }
                        }, 100);
                    });
                }

                updateProgress(100);
                this.updateWhisperDownloadModalStatus('✅ Модель готова к использованию!');

                // Закрываем модальное окно через 1 секунду
                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 1000);

                // Обновляем информацию о хранилище и список моделей
                this.updateStorageInfo();
                this.updateModelsTable();

                // После загрузки сразу выбираем модель
                if (modelType === 'whisper') {
                    this.setSelectedWhisperModel(langCode, modelId);
                } else {
                    this.setSelectedModelGeneric(langCode, modelId, modelType);
                }
                
                // Если это левая панель, обновляем также правую панель (если она существует)
                if (window.languageModelsSelector && this.options.mode !== 'models-only') {
                    window.languageModelsSelector.updateModelsTable();
                    window.languageModelsSelector.updateStorageInfo();
                }

            } catch (error) {
                console.error('Неожиданная ошибка:', error);
                this.updateWhisperDownloadModalStatus(`❌ Ошибка: ${error.message}`);

                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 2000);
            }

        } catch (error) {
            console.error('Ошибка в downloadModel:', error);
            this.hideWhisperDownloadModal();
        }
    }

    // ОБНОВЛЕННЫЙ МЕТОД: удаление модели
    async removeModel(langCode, modelId, modelType, slider = null, sliderCircle = null) {
        // Если нет slider и sliderCircle (вызов из таблицы), все равно удаляем
        try {
            // Удаляем из ModelManager
            if (window.ModelManager && typeof window.ModelManager.removeModel === 'function') {
                window.ModelManager.removeModel(langCode, modelId, modelType);
            }

            // Удаляем из localStorage
            this.removeModelState(langCode, modelId, modelType);

            // Если удалили активную модель — снимаем выбор (иначе галочка/селект останутся)
            const selectedValue = this.getSelectedModelWithFallback(langCode, modelType);
            if (String(selectedValue) === String(modelId)) {
                if (modelType === 'whisper') {
                    this.setSelectedWhisperModel(langCode, null);
                } else {
                    this.setSelectedModelGeneric(langCode, null, modelType);
                }
            }

            // Обновляем UI если переданы элементы
            if (slider) {
                slider.classList.remove('downloaded');
                slider.style.backgroundColor = '#ccc';
                if (sliderCircle) {
                    sliderCircle.style.backgroundColor = 'white';
                    sliderCircle.style.transform = 'translateX(0)';
                }
            }

            // Обновляем таблицу и информацию о хранилище
            this.updateModelsTable();
            this.updateStorageInfo();
            
            // Синхронизация между панелями
            if (this.options.mode === 'models-only') {
                // Если это правая панель, обновляем левую панель
                if (window.languageSelector) {
                    window.languageSelector.updateModelSelectionUI(langCode);
                }
            } else {
                // Если это левая панель, обновляем правую панель
                if (window.languageModelsSelector) {
                    window.languageModelsSelector.updateModelsTable();
                    window.languageModelsSelector.updateStorageInfo();
                }
            }

        } catch (error) {
            console.error('Ошибка удаления модели:', error);
            throw error; // Пробрасываем ошибку дальше
        }
    }

    // Методы для модального окна загрузки
    createWhisperDownloadModal(langCode) {
        let modal = document.getElementById('whisper-download-modal');
        if (modal) {
            return modal;
        }

        modal = document.createElement('div');
        modal.id = 'whisper-download-modal';
        modal.className = 'modal whisper-download-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        `;

        const languageName = this.getLanguageName(langCode);

        modal.innerHTML = `
            <div class="modal-content whisper-download-modal-content" style="
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            ">
                <div class="whisper-download-header">
                    <h3 style="margin: 0 0 15px 0; color: #333;">Загрузка модели</h3>
                </div>
                <div class="whisper-download-body">
                    <p class="whisper-download-text" style="margin: 0 0 15px 0; color: #666;">
                        Загрузка модели для языка: <strong>${languageName}</strong>
                    </p>
                    <div class="whisper-download-progress-container" style="margin-bottom: 15px;">
                        <div class="whisper-download-progress-bar" style="
                            height: 8px;
                            background: #e0e0e0;
                            border-radius: 4px;
                            overflow: hidden;
                        ">
                            <div class="whisper-download-progress-fill" id="whisper-progress-fill" style="
                                height: 100%;
                                background: #2196F3;
                                width: 0%;
                                transition: width 0.3s;
                            "></div>
                        </div>
                        <div class="whisper-download-percent" id="whisper-progress-percent" style="
                            text-align: right;
                            font-size: 12px;
                            color: #666;
                            margin-top: 5px;
                        ">0%</div>
                    </div>
                    <p class="whisper-download-status" id="whisper-download-status" style="
                        margin: 0;
                        font-size: 14px;
                        color: #666;
                    ">Подготовка к загрузке...</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    showWhisperDownloadModal(langCode) {
        const modal = this.createWhisperDownloadModal(langCode);
        const progressFill = document.getElementById('whisper-progress-fill');
        const progressPercent = document.getElementById('whisper-progress-percent');
        const statusText = document.getElementById('whisper-download-status');

        const languageName = this.getLanguageName(langCode);
        const textElement = modal.querySelector('.whisper-download-text');
        if (textElement) {
            textElement.innerHTML = `Загрузка модели для языка: <strong>${languageName}</strong>`;
        }

        if (progressFill) progressFill.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (statusText) statusText.textContent = 'Начало загрузки...';

        modal.style.display = 'flex';
    }

    updateWhisperDownloadModalProgress(percent) {
        const progressFill = document.getElementById('whisper-progress-fill');
        const progressPercent = document.getElementById('whisper-progress-percent');

        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }
        if (progressPercent) {
            progressPercent.textContent = `${percent}%`;
        }
    }

    updateWhisperDownloadModalStatus(text) {
        const statusText = document.getElementById('whisper-download-status');
        if (statusText) {
            statusText.textContent = text;
        }
    }

    hideWhisperDownloadModal() {
        const modal = document.getElementById('whisper-download-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // НОВЫЙ МЕТОД: выбор модели с проверкой загрузки
    async selectModel(langCode, modelId, modelType, isNone, isDownloaded) {
        // Если выбрана опция "без модели"
        if (isNone) {
            const whisperKey = `selected_model_${langCode}_whisper`;
            const transformerAsrKey = `selected_model_${langCode}_transformer_asr`;

            localStorage.removeItem(whisperKey);
            localStorage.removeItem(transformerAsrKey);

            console.log(`⭐ Снят выбор всех моделей для языка: ${langCode}`);

            if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
                window.ModelManager.setSelectedModel(langCode, null, 'whisper');
                window.ModelManager.setSelectedModel(langCode, null, 'transformer_asr');
            }
            this.updateModelSelectionUI(langCode);
            this.updateModelsTable();
            this.updateStorageInfo();
            return;
        }

        // Проверяем загрузку модели заново (на случай, если данные устарели)
        const actuallyDownloaded = this.isModelDownloadedWithFallback(langCode, modelId, modelType);

        // Если модель не загружена - показываем модальное окно подтверждения
        if (!actuallyDownloaded) {
            const languageData = this.languageData[langCode];
            if (!languageData || !languageData.models) return;

            const modelData = languageData.models[modelType]?.find(m => m.id === modelId);
            if (!modelData) return;

            const languageName = this.getLanguageName(langCode);
            const modelName = modelData.name;
            const modelSize = modelData.size;
            const modelQuality = modelData.quality || '';

            // Показываем модальное окно подтверждения
            const confirmed = await this.showModelDownloadConfirmModal(
                languageName,
                modelType,
                modelName,
                modelSize,
                modelQuality
            );

            if (confirmed) {
                // Пользователь подтвердил - начинаем загрузку
                // Находим элемент модели для загрузки
                const dropdown = this.options.container.querySelector(`#model-dropdown-${langCode}`);
                if (dropdown) {
                    const modelItem = dropdown.querySelector(`[data-model="${modelId}"][data-type="${modelType}"]`);
                    if (modelItem) {
                        const slider = modelItem.querySelector('.model-slider');
                        const sliderCircle = slider?.querySelector('.model-slider-circle');
                        const checkbox = modelItem.querySelector('.model-download-toggle');

                        if (checkbox) {
                            checkbox.checked = true;
                            await this.downloadModel(langCode, modelId, modelType, slider, sliderCircle);

                            // После загрузки проверяем еще раз и выбираем модель
                            const stillDownloaded = this.isModelDownloadedWithFallback(langCode, modelId, modelType);
                            if (stillDownloaded) {
                                this.setSelectedWhisperModel(langCode, modelId);
                            }
                        }
                    }
                }
            }
            return;
        }

        // Если модель уже загружена - выбираем её
        if (modelType === 'whisper') {
            this.setSelectedWhisperModel(langCode, modelId);
        } else {
            this.setSelectedModelGeneric(langCode, modelId, modelType);
        }
    }

    setSelectedWhisperModel(langCode, modelId) {
        // Only one ASR model should be active per language.
        // If user selects a whisper model, clear transformer_asr selection for this language.
        try {
            localStorage.removeItem(`selected_model_${langCode}_transformer_asr`);
        } catch (e) {
        }
        if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
            window.ModelManager.setSelectedModel(langCode, null, 'transformer_asr');
        }

        const currentKey = `selected_model_${langCode}_whisper`;

        if (!modelId || modelId === 'none') {
            localStorage.removeItem(currentKey);
        } else {
            localStorage.setItem(currentKey, modelId);
        }

        if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
            window.ModelManager.setSelectedModel(langCode, modelId || null, 'whisper');
        }

        console.log(`⭐ Выбрана whisper модель: ${langCode}/whisper/${modelId || 'none'}`);

        this.updateModelSelectionUI(langCode);

        // Обновляем таблицу моделей (правая панель) сразу, чтобы галочка активной модели появилась без перезагрузки
        this.updateModelsTable();
        this.updateStorageInfo();

        this.syncOtherPanel(langCode);
    }

    syncOtherPanel(langCode) {
        // Главное правило: любое изменение слева/справа должно перерисовывать вторую панель
        if (this.options.mode === 'models-only') {
            // Это правая панель (модели)
            if (window.languageSelector) {
                window.languageSelector.updateModelSelectionUI(langCode);
            }
        } else {
            // Это левая панель (выбор языка)
            if (window.languageModelsSelector) {
                window.languageModelsSelector.updateModelsTable();
                window.languageModelsSelector.updateStorageInfo();
            }
        }
    }

    // НОВЫЙ МЕТОД: обновление UI после выбора модели
    updateModelSelectionUI(langCode) {
        // Проверяем текущее состояние перед обновлением
        const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
        console.log(`🔄 Обновление UI для ${langCode}: whisper=${selectedWhisper}`);

        // Обновляем выпадающий список
        const dropdown = this.options.container.querySelector(`#model-dropdown-${langCode}`);
        if (dropdown) {
            dropdown.innerHTML = this.createModelDropdownItems(langCode);
            // Принудительно применяем стили после обновления
            setTimeout(() => {
                const selectedItems = dropdown.querySelectorAll('.model-dropdown-item.selected');
                console.log(`🎨 Найдено выбранных элементов: ${selectedItems.length}`);
                selectedItems.forEach(item => {
                    item.style.backgroundColor = 'var(--color-hover)';
                    console.log(`  - Элемент: ${item.dataset.type}/${item.dataset.model}`);
                });
            }, 0);
        }

        // Обновляем текст на триггере
        const trigger = this.options.container.querySelector(`.model-select-trigger[data-lang="${langCode}"]`);
        if (trigger) {
            const selectedModels = this.getSelectedModelsForLanguage(langCode);
            const textElement = trigger.querySelector('.model-select-text');
            if (textElement) {
                textElement.textContent = selectedModels || 'Выберите модель';
            }
        }
    }

    // НОВЫЙ МЕТОД: модальное окно подтверждения загрузки модели
    showModelDownloadConfirmModal(languageName, modelType, modelName, modelSize, modelQuality) {
        return new Promise((resolve) => {
            // Удаляем старое модальное окно, если есть
            const oldModal = document.getElementById('model-download-confirm-modal');
            if (oldModal) {
                oldModal.remove();
            }

            const modal = document.createElement('div');
            modal.id = 'model-download-confirm-modal';
            modal.style.cssText = `
                display: flex;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 10001;
                justify-content: center;
                align-items: center;
            `;

            const modelTypeName = 'Whisper';
            const qualityText = modelQuality ? ` (качество: ${modelQuality})` : '';

            modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 24px;
                    border-radius: 8px;
                    max-width: 450px;
                    width: 90%;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                ">
                    <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">
                        Загрузка модели
                    </h3>
                    <p style="margin: 0 0 20px 0; color: #666; font-size: 14px; line-height: 1.5;">
                        Вы хотите загрузить модель: <strong>${modelTypeName} ${modelName}${qualityText}</strong><br>
                        Размер: <strong>${modelSize}</strong><br>
                        Язык: <strong>${languageName}</strong>
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button id="confirm-cancel-btn" style="
                            padding: 10px 20px;
                            border: 1px solid #ddd;
                            border-radius: 6px;
                            background: white;
                            color: #333;
                            cursor: pointer;
                            font-size: 14px;
                            transition: background-color 0.2s;
                        " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='white'">
                            Отмена
                        </button>
                        <button id="confirm-ok-btn" style="
                            padding: 10px 20px;
                            border: none;
                            border-radius: 6px;
                            background: #4CAF50;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 600;
                            transition: background-color 0.2s;
                        " onmouseover="this.style.backgroundColor='#45a049'" onmouseout="this.style.backgroundColor='#4CAF50'">
                            Загрузить
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Обработчики кнопок
            const cancelBtn = modal.querySelector('#confirm-cancel-btn');
            const okBtn = modal.querySelector('#confirm-ok-btn');

            const cleanup = () => {
                modal.remove();
            };

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            okBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            // Закрытие по клику вне модального окна
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    triggerChange(additionalData = null) {
        const changeData = additionalData || {
            nativeLanguage: this.options.nativeLanguage,
            learningLanguages: [...this.options.learningLanguages],
            currentLearning: this.options.currentLearning
        };

        if (typeof this.options.onLanguageChange === 'function') {
            this.options.onLanguageChange(changeData);
        }
    }

    getValues() {
        return {
            nativeLanguage: this.options.nativeLanguage,
            learningLanguages: [...this.options.learningLanguages],
            currentLearning: this.options.currentLearning
        };
    }

    setValues(values) {
        if (values.nativeLanguage) this.options.nativeLanguage = values.nativeLanguage;
        if (values.learningLanguages) this.options.learningLanguages = [...values.learningLanguages];
        if (values.currentLearning) this.options.currentLearning = values.currentLearning;

        if (this.isInitialized) {
            this.render();
        }
    }

    destroy() {
    }
}

window.initLanguageSelector = function (containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id "${containerId}" not found`);
        return null;
    }

    return new LanguageSelector({
        container: container,
        ...options
    });
};

// Добавляем CSS для переключателей и выпадающих списков
// const style = document.createElement('style');
// style.textContent = `
//     .model-switch .model-slider.downloaded {
//         background-color: #8B4513 !important;
//     }
//     .model-switch .model-slider.downloaded .model-slider-circle {
//         transform: translateX(20px) !important;
//         background-color: #FFD700 !important;
//     }
//     .model-dropdown-item.selected {
//         background-color: #f0f9ff !important;
//     }
// `;
// document.head.appendChild(style);

console.log('✅ LanguageSelector загружен успешно');