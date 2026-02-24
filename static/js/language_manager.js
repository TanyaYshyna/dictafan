class LanguageManager {
    constructor() {
        this.languageData = this._initializeLanguageData();
        this.modelsData = this._initializeModelsData();
        this.isInitialized = Object.keys(this.languageData).length > 0;

        this._hydrateLanguageModels();

        try {
            if (this.modelsData && Array.isArray(this.modelsData) && this.modelsData.length > 0) {
                window.dispatchEvent(new CustomEvent('models-data-updated'));
            }
            if (this.languageData && Object.keys(this.languageData).length > 0) {
                window.dispatchEvent(new CustomEvent('language-data-updated'));
            }
        } catch (e) {
        }

        if (!this.isInitialized) {
            this._fetchLanguageData();
        }

        if (!this.modelsData || (Array.isArray(this.modelsData) && this.modelsData.length === 0)) {
            this._fetchModelsData();
        }
    }

    _hydrateLanguageModels() {
        try {
            const models = this.getModelsData();
            if (!models || !models.length) return;
            if (!this.languageData || typeof this.languageData !== 'object') return;

            const byKey = new Map();
            models.forEach(m => {
                if (m && m.modelKey) {
                    byKey.set(String(m.modelKey), m);
                }
            });

            Object.entries(this.languageData).forEach(([lang, entry]) => {
                if (!entry || typeof entry !== 'object') return;
                const keys = Array.isArray(entry.applicable_model_keys) ? entry.applicable_model_keys : [];

                const nextModels = {
                    whisper: [],
                    transformer_asr: []
                };

                keys.forEach(k => {
                    const mk = String(k);
                    const model = byKey.get(mk);
                    if (!model) return;
                    const type = model.modelType;
                    if (type === 'whisper' || type === 'transformer_asr') {
                        nextModels[type].push({
                            id: model.id,
                            hf_repo: model.hf_repo,
                            name: model.name,
                            size: model.size,
                            quality: model.quality,
                            recommended: !!model.recommended
                        });
                    }
                });

                // Preserve old shape for code paths that still expect entry.models
                entry.models = nextModels;
            });

            window.LANGUAGE_DATA = this.languageData;
        } catch (e) {
        }
    }

    _initializeLanguageData() {
        const fromWindow = this._getFromWindow();
        if (fromWindow) {
            return fromWindow;
        }

        const fromScriptTag = this._getFromScriptTag();
        if (fromScriptTag) {
            window.LANGUAGE_DATA = fromScriptTag;
            return fromScriptTag;
        }

        return {};
    }

    _initializeModelsData() {
        const fromWindow = this._getModelsFromWindow();
        if (fromWindow) {
            return fromWindow;
        }
        const fromScriptTag = this._getModelsFromScriptTag();
        if (fromScriptTag) {
            window.MODELS_DATA = fromScriptTag;
            return fromScriptTag;
        }
        return [];
    }

    _getModelsFromWindow() {
        if (window.MODELS_DATA && typeof window.MODELS_DATA === 'object') {
            return this._normalizeModels(window.MODELS_DATA);
        }
        return null;
    }

    _getModelsFromScriptTag() {
        const scriptEl = document.getElementById('models-data');
        if (!scriptEl) {
            return null;
        }
        try {
            const parsed = JSON.parse(scriptEl.textContent);
            return this._normalizeModels(parsed);
        } catch (error) {
            console.error('❌ Ошибка парсинга models-data:', error);
        }
        return null;
    }

    _getFromWindow() {
        if (window.LANGUAGE_DATA && typeof window.LANGUAGE_DATA === 'object') {
            return this._normalize(window.LANGUAGE_DATA);
        }
        return null;
    }

    _getFromScriptTag() {
        const scriptEl = document.getElementById('language-data');
        if (!scriptEl) {
            return null;
        }

        try {
            const parsed = JSON.parse(scriptEl.textContent);
            return this._normalize(parsed);
        } catch (error) {
            console.error('❌ Ошибка парсинга language-data:', error);
        }
        return null;
    }

    _normalize(rawData) {
        const normalized = {};

        if (!rawData || typeof rawData !== 'object') {
            return normalized;
        }

        Object.entries(rawData).forEach(([key, value]) => {
            if (typeof key === 'string' && value && typeof value === 'object') {
                normalized[key.toLowerCase()] = { ...value };
            }
        });

        return normalized;
    }

    _normalizeModels(rawData) {
        if (Array.isArray(rawData)) {
            return rawData.filter(Boolean);
        }
        if (rawData && typeof rawData === 'object') {
            // Allow object map shape as well.
            return Object.values(rawData).filter(Boolean);
        }
        return [];
    }

    async _fetchLanguageData() {
        if (!('fetch' in window)) {
            return;
        }

        if (this._languageDataPromise) {
            return this._languageDataPromise;
        }

        this._languageDataPromise = fetch('/static/data/languages.json', { cache: 'no-cache' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.languageData = this._normalize(data);
                this.isInitialized = Object.keys(this.languageData).length > 0;
                if (this.isInitialized) {
                    window.LANGUAGE_DATA = this.languageData;
                }

                this._hydrateLanguageModels();

                try {
                    window.dispatchEvent(new CustomEvent('language-data-updated'));
                } catch (e) {
                }
            })
            .catch(error => {
                console.error('❌ Ошибка загрузки languages.json:', error);
            });

        return this._languageDataPromise;
    }

    async _fetchModelsData() {
        if (!('fetch' in window)) {
            return;
        }

        if (this._modelsDataPromise) {
            return this._modelsDataPromise;
        }

        this._modelsDataPromise = fetch('/static/data/models.json', { cache: 'no-cache' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.modelsData = this._normalizeModels(data);
                if (this.modelsData) {
                    window.MODELS_DATA = this.modelsData;
                }

                this._hydrateLanguageModels();

                try {
                    window.dispatchEvent(new CustomEvent('models-data-updated'));
                } catch (e) {
                }
            })
            .catch(error => {
                console.error('❌ Ошибка загрузки models.json:', error);
            });

        return this._modelsDataPromise;
    }

    getLanguageData() {
        return this.languageData;
    }

    getModelsData() {
        return this.modelsData || [];
    }

    getModelByKey(modelKey) {
        const key = modelKey ? String(modelKey) : '';
        if (!key) return null;
        const list = this.getModelsData();
        return list.find(m => m && String(m.modelKey) === key) || null;
    }

    getLanguageName(langCode, interfaceLang = 'ru') {
        const language = this._getLanguage(langCode);
        if (!language) {
            return langCode;
        }

        const key = `language_${interfaceLang}`;
        return language[key] || language.language_en || langCode;
    }

    getNativeLanguageName(langCode) {
        const language = this._getLanguage(langCode);
        if (!language) {
            return langCode;
        }

        const nativeKey = `language_${langCode}`;
        return language[nativeKey] || language.language_en || langCode;
    }

    getCountryCode(langCode) {
        const language = this._getLanguage(langCode);
        return language && language.country_cod ? language.country_cod.toLowerCase() : '';
    }

    getCountryCodeUrl(langCode) {
        const language = this._getLanguage(langCode);
        return language ? language.country_cod_url : '';
    }

    getAvailableLanguages() {
        return Object.keys(this.languageData);
    }

    isLanguageSupported(langCode) {
        return !!this._getLanguage(langCode);
    }

    _getLanguage(langCode) {
        if (!langCode) {
            return null;
        }
        return this.languageData[langCode.toLowerCase()] || null;
    }
}

// Создаем глобальный экземпляр
window.LanguageManager = new LanguageManager();
