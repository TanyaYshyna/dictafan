/**
 * Lightweight layout manager to serve finger-coloured virtual keyboards.
 * Attaches itself to the global window object (no modules used elsewhere yet).
 */
(function () {
    const DEFAULT_LAYOUT_URL = '/static/data/keyboard_layouts.json';

    class KeyboardLayoutManager {
        constructor(options = {}) {
            this.layoutUrl = options.layoutUrl || DEFAULT_LAYOUT_URL;
            this.layouts = null;
            this._loadPromise = null;
        }

        async ensureLoaded() {
            if (this.layouts) {
                return this.layouts;
            }

            if (this._loadPromise) {
                return this._loadPromise;
            }

            if (typeof fetch !== 'function') {
                console.error('❌ KeyboardLayoutManager: fetch не поддерживается в этом окружении');
                this.layouts = {};
                return this.layouts;
            }

            this._loadPromise = fetch(this.layoutUrl, { cache: 'no-cache' })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data || typeof data !== 'object') {
                        throw new Error('Получены некорректные данные раскладок');
                    }
                    this.layouts = Object.keys(data).reduce((acc, lang) => {
                        if (lang && typeof lang === 'string') {
                            acc[lang.toLowerCase()] = data[lang];
                        }
                        return acc;
                    }, {});
                    return this.layouts;
                })
                .catch(error => {
                    console.error('❌ KeyboardLayoutManager: ошибка загрузки раскладок', error);
                    this.layouts = {};
                    return this.layouts;
                });

            return this._loadPromise;
        }

        async getLayout(langCode) {
            await this.ensureLoaded();
            if (!langCode) {
                return null;
            }
            const normalized = String(langCode).toLowerCase();
            return this.layouts?.[normalized] || null;
        }

        async hasLayout(langCode) {
            const layout = await this.getLayout(langCode);
            return !!layout;
        }

        async getAvailableLanguageCodes() {
            await this.ensureLoaded();
            return Object.keys(this.layouts || {});
        }
    }

    class VirtualKeyboard {
        constructor(container, options = {}) {
            this.container = container;
            this.layoutManager = options.layoutManager || window.KeyboardLayoutManager;
            this.languageManager = options.languageManager || window.LanguageManager;
            this.langCode = options.langCode ? String(options.langCode).toLowerCase() : '';
            this.isVisible = false;
            this._currentLayout = null;
            this._pendingRender = null;

            if (!this.container) {
                console.warn('⚠️ VirtualKeyboard: контейнер не найден');
            } else {
                this.container.classList.add('virtual-keyboard');
                this.hide(); // по умолчанию скрыта
            }
        }

        async setLanguage(langCode) {
            this.langCode = langCode ? String(langCode).toLowerCase() : '';
            if (this.isVisible) {
                await this.render();
            }
        }

        async show() {
            this.isVisible = true;
            if (this.container) {
                this.container.removeAttribute('hidden');
                this.container.style.display = '';
            }
            await this.render();
        }

        hide() {
            this.isVisible = false;
            if (this.container) {
                this.container.setAttribute('hidden', 'true');
                this.container.style.display = 'none';
            }
        }

        async render() {
            if (!this.container) {
                return;
            }
            if (!this.layoutManager || typeof this.layoutManager.getLayout !== 'function') {
                this.container.innerHTML = '<div class="vk-empty">Раскладки недоступны</div>';
                return;
            }

            // предотвращаем параллельные рендеры
            if (this._pendingRender) {
                return this._pendingRender;
            }

            this._pendingRender = (async () => {
                const layout = await this.layoutManager.getLayout(this.langCode);
                this._currentLayout = layout;
                this.container.innerHTML = '';

                if (!layout) {
                    const languageLabel = this._getLanguageName(this.langCode);
                    const message = languageLabel
                        ? `Для языка «${languageLabel}» нет сохранённой раскладки`
                        : 'Раскладка для текущего языка отсутствует';
                    this.container.innerHTML = `<div class="vk-empty">${message}</div>`;
                    return;
                }

                const header = document.createElement('div');
                header.className = 'vk-header';

                const langNameSpan = document.createElement('span');
                langNameSpan.className = 'vk-language-name';
                langNameSpan.textContent = this._getLanguageName(this.langCode) || layout.name || this.langCode;

                const variantSpan = document.createElement('span');
                variantSpan.className = 'vk-variant';
                variantSpan.textContent = layout.variant || '';

                header.appendChild(langNameSpan);
                if (variantSpan.textContent) {
                    header.appendChild(variantSpan);
                }

                const body = document.createElement('div');
                body.className = 'vk-body';

                (layout.rows || []).forEach((row, rowIndex) => {
                    const rowEl = document.createElement('div');
                    rowEl.className = 'vk-row';
                    rowEl.dataset.rowIndex = String(rowIndex);

                    (row || []).forEach((keyDef, keyIndex) => {
                        const keyEl = this._createKeyElement(keyDef, keyIndex);
                        rowEl.appendChild(keyEl);
                    });

                    body.appendChild(rowEl);
                });

                this.container.appendChild(header);
                this.container.appendChild(body);
            })()
                .catch(error => {
                    console.error('❌ VirtualKeyboard: ошибка рендера', error);
                    this.container.innerHTML = '<div class="vk-empty">Не удалось отрисовать клавиатуру</div>';
                })
                .finally(() => {
                    this._pendingRender = null;
                });

            return this._pendingRender;
        }

        _createKeyElement(keyDef = {}, keyIndex = 0) {
            const keyEl = document.createElement('div');
            keyEl.className = 'vk-key';
            keyEl.dataset.keyIndex = String(keyIndex);

            const fingerClass = keyDef.finger ? `finger-${keyDef.finger}` : 'finger-unknown';
            keyEl.classList.add(fingerClass);

            const unitSize = Number.isFinite(keyDef.size) ? keyDef.size : 1;
            keyEl.style.setProperty('--vk-key-unit', unitSize);

            if (keyDef.code) {
                keyEl.dataset.code = keyDef.code;
            }

            const shiftLabel = keyDef.shiftLabel ? String(keyDef.shiftLabel) : '';
            const label = keyDef.label ? String(keyDef.label) : '';
            const altLabel = keyDef.altLabel ? String(keyDef.altLabel) : '';

            const shiftSpan = document.createElement('span');
            shiftSpan.className = 'vk-key-shift';
            shiftSpan.textContent = shiftLabel;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'vk-key-label';
            labelSpan.textContent = label;

            // Показываем shiftLabel только если есть содержимое и оно отличается от основного
            if (shiftLabel && shiftLabel !== label) {
                keyEl.appendChild(shiftSpan);
            }

            keyEl.appendChild(labelSpan);

            if (altLabel) {
                const altSpan = document.createElement('span');
                altSpan.className = 'vk-key-alt';
                altSpan.textContent = altLabel;
                keyEl.appendChild(altSpan);
                keyEl.classList.add('vk-key-has-alt');
            }

            return keyEl;
        }

        _getLanguageName(langCode) {
            if (!langCode || !this.languageManager) {
                return '';
            }
            try {
                if (typeof this.languageManager.getLanguageName === 'function') {
                    return this.languageManager.getLanguageName(langCode);
                }
            } catch (_) {
                // игнорируем — вернём пустую строку
            }
            return '';
        }
    }

    // Экспортируем глобально, но не переопределяем если уже есть
    if (!window.KeyboardLayoutManager) {
        window.KeyboardLayoutManager = new KeyboardLayoutManager();
    }
    if (!window.VirtualKeyboard) {
        window.VirtualKeyboard = VirtualKeyboard;
    }
})();

