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

        init: function (config) {
            this.config = config || {};
            console.log('[editorV2] init', this.config);

            this._setupTopbar();
            this._setupUserSection();
            this._setupLogoHandler();
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
