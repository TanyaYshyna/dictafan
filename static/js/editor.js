/**
 * editor.js — Новая версия редактора диктантов (V2)
 * 
 * Параллельная структура. Постепенно сюда переносятся модули
 * из script_dictation_editor.js
 */

(function () {
    'use strict';

    const editorV2 = {
        config: {},
        headerLangPairSelector: null,

        init: function (config) {
            this.config = config || {};
            console.log('[editorV2] init', this.config);

            this._setupTopbar();
            this._setupUserSection();
            this._setupLogoHandler();
            this._initLanguageFlags();
            this._setupTabs();
            this._initFormFields();
            this._initLevelSelector();
            this._initVoiceModeRadios();
            this._initCoverUpload();
        },

        _setupTopbar: function () {
            const saveBtn = document.getElementById('saveBtn');
            const exitBtn = document.getElementById('exitToIndexBtn');

            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    console.log('[editorV2] save clicked');
                });
            }

            if (exitBtn) {
                exitBtn.addEventListener('click', function () {
                    window.location.href = '/';
                });
            }
        },

        _setupUserSection: function () {
            const userSection = document.getElementById('user-section');
            if (!userSection) return;

            // Используем существующие глобальные менеджеры
            try {
                if (window.UM && typeof window.UM.renderUserSection === 'function') {
                    window.UM.renderUserSection(userSection);
                }
            } catch (e) {
                console.warn('[editorV2] userManager not available', e);
            }

            try {
                if (window.SupportModal && typeof window.SupportModal.init === 'function') {
                    const supportBtn = document.getElementById('supportTopbarBtn');
                    if (supportBtn) {
                        supportBtn.addEventListener('click', function () {
                            window.SupportModal.open();
                        });
                    }
                }
            } catch (e) {
                console.warn('[editorV2] SupportModal not available', e);
            }
        },

        _setupLogoHandler: function () {
            const logo = document.querySelector('.editor-v2-topbar .logo');
            if (logo) {
                logo.addEventListener('click', function () {
                    window.location.href = '/';
                });
            }
        },

        /**
         * Инициализация флагов языка через LanguageManager / LanguageSelector
         * Аналог renderHeaderLangPairWithManager из script_dictation_editor.js
         */
        _initLanguageFlags: function () {
            try {
                const container = document.getElementById('langPair');
                if (!container) return;
                if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') return;

                const languageData = window.LanguageManager.getLanguageData();
                if (!languageData) return;

                // Нормализуем коды языков
                const orig = this._normalizeLangCode(this.config.originalLanguage);
                const tr = this._normalizeLangCode(this.config.translationLanguage);

                // Проверяем, что коды есть в languageData
                const validOrig = languageData[orig] ? orig : '';
                const validTr = languageData[tr] ? tr : '';

                container.innerHTML = '';

                if (!validOrig && !validTr) {
                    console.warn('[editorV2] No valid language codes found for flags', { orig, tr });
                    return;
                }

                // Если есть и оригинал и перевод — показываем пару
                if (validOrig && validTr) {
                    this.headerLangPairSelector = window.initLanguageSelector('langPair', {
                        mode: 'flag-pair-fixed',
                        currentLearning: validOrig,
                        nativeLanguage: validTr,
                        languageData: languageData
                    });
                } else if (validOrig) {
                    // Только оригинал
                    this.headerLangPairSelector = window.initLanguageSelector('langPair', {
                        mode: 'flag-single',
                        currentLearning: validOrig,
                        nativeLanguage: validOrig,
                        languageData: languageData
                    });
                }
            } catch (e) {
                console.warn('[editorV2] _initLanguageFlags error', e);
            }
        },

        /**
         * Инициализация полей формы из конфига
         */
        _initFormFields: function () {
            // Заголовок
            const titleInput = document.getElementById('title');
            if (titleInput && this.config.title) {
                titleInput.value = this.config.title;
            }

            // Ссылка на материалы автора
            const authorUrlInput = document.getElementById('dictation-author-materials-url-input');
            if (authorUrlInput && this.config.authorMaterialsUrl) {
                authorUrlInput.value = this.config.authorMaterialsUrl;
            }
        },

        /**
         * Инициализация селектора уровня (кастомный dropdown)
         * Аналог initLevelSelector из script_dictation_editor.js
         */
        _initLevelSelector: function () {
            const control = document.getElementById('levelSelectControl');
            if (!control) return;

            const button = control.querySelector('.speed-select-button');
            const valueSpan = control.querySelector('.level-select-value');
            const options = control.querySelectorAll('.speed-options li');

            if (!button || !valueSpan) return;

            // Устанавливаем значение из конфига
            const savedLevel = this.config.level || 'A1';
            valueSpan.textContent = savedLevel;

            // Отмечаем выбранный option
            options.forEach(function (opt) {
                if (opt.getAttribute('data-value') === savedLevel) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });

            // Открытие/закрытие dropdown
            button.addEventListener('click', function (e) {
                e.stopPropagation();
                control.classList.toggle('open');
            });

            // Выбор опции
            options.forEach(function (opt) {
                opt.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const value = opt.getAttribute('data-value');
                    valueSpan.textContent = value;

                    options.forEach(function (o) { o.classList.remove('selected'); });
                    opt.classList.add('selected');

                    control.classList.remove('open');
                });
            });

            // Закрытие по клику вне
            document.addEventListener('click', function () {
                control.classList.remove('open');
            });
        },

        /**
         * Инициализация радио-кнопок выбора режима озвучки
         * и управление видимостью закладок 2-4
         */
        _initVoiceModeRadios: function () {
            const radios = document.querySelectorAll('input[name="voiceMode"]');
            if (!radios.length) return;

            const updateTabVisibility = function (selectedValue) {
                // Все табы с data-voice-mode
                document.querySelectorAll('.tab-btn[data-voice-mode]').forEach(function (btn) {
                    const mode = btn.getAttribute('data-voice-mode');
                    if (mode === selectedValue) {
                        btn.style.display = '';
                    } else {
                        btn.style.display = 'none';
                    }
                });

                // Если активный таб сейчас скрыт — переключаемся на "Общие данные"
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.style.display === 'none') {
                    const generalTab = document.querySelector('.tab-btn[data-tab="general"]');
                    if (generalTab) {
                        generalTab.click();
                    }
                }
            };

            radios.forEach(function (radio) {
                radio.addEventListener('change', function () {
                    if (this.checked) {
                        updateTabVisibility(this.value);
                    }
                });
            });

            // Инициализация при загрузке
            var checkedRadio = document.querySelector('input[name="voiceMode"]:checked');
            if (checkedRadio) {
                updateTabVisibility(checkedRadio.value);
            }
        },

        /**
         * Инициализация загрузки обложки
         */
        _initCoverUpload: function () {
            const uploadBtn = document.getElementById('coverUploadBtn');
            const fileInput = document.getElementById('coverFile');
            const coverImage = document.getElementById('coverImage');

            if (!uploadBtn || !fileInput) return;

            uploadBtn.addEventListener('click', function () {
                fileInput.click();
            });

            fileInput.addEventListener('change', function (e) {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = function (ev) {
                    if (coverImage) {
                        coverImage.src = ev.target.result;
                    }
                };
                reader.readAsDataURL(file);
            });
        },

        /**
         * Переключение закладок
         */
        _setupTabs: function () {
            const panel = document.querySelector('.editor-v2-panel');
            if (!panel) return;

            panel.querySelectorAll('.tab-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const tabName = btn.getAttribute('data-tab');

                    // Деактивируем все кнопки и контенты
                    panel.querySelectorAll('.tab-btn').forEach(function (b) {
                        b.classList.remove('active');
                    });
                    panel.querySelectorAll('.tab-content').forEach(function (c) {
                        c.classList.remove('active');
                    });

                    // Активируем выбранную
                    btn.classList.add('active');
                    var tabContent = document.getElementById('tab-' + tabName);
                    if (tabContent) {
                        tabContent.classList.add('active');
                    }

                    // Обновляем иконки Lucide
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                });
            });
        },

        _normalizeLangCode: function (code) {
            if (!code) return '';
            return String(code).toLowerCase().trim();
        },

        getConfig: function (key) {
            return key ? this.config[key] : this.config;
        }
    };

    // Экспортируем в глобальную область
    window.editorV2 = editorV2;

    // Авто-инициализация если data-атрибуты есть на body
    document.addEventListener('DOMContentLoaded', function () {
        // Если init не был вызван через inline script, пробуем из data-атрибутов
        if (!window.editorV2.getConfig('dictationId')) {
            const body = document.body;
            const dictationId = body.getAttribute('data-dictation-id');
            if (dictationId) {
                window.editorV2.init({
                    dictationId: dictationId,
                    originalLanguage: body.getAttribute('data-original-language'),
                    translationLanguage: body.getAttribute('data-translation-language'),
                    level: body.getAttribute('data-level'),
                    title: body.getAttribute('data-title'),
                });
            }
        }
    });

})();
