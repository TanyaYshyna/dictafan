/**
 * Класс для управления настройками аудио (последовательности воспроизведения)
 * Отслеживает изменения и обновляет UI
 */
class AudioSettingsPanel {
    constructor(options = {}) {
        this.options = {
            container: null,
            mode: 'inline', // 'inline', 'modal', 'user-settings'
            showExplanations: true, // показывать ли описание значений букв
            onSettingsChange: null, // callback при изменении настроек
            ...options
        };

        // Значения по умолчанию для новых пользователей
        this.defaults = {
            start: 'oto',
            typo: 'o',
            success: 'ot',
            repeats: 3,
            required_passed_star_half: 3,
            speech_recognition_mode: 'route' // 'route' (интернет), 'route-off' (локально, только если модель загружена)
        };

        // Текущие значения
        this.settings = {
            start: this.defaults.start,
            typo: this.defaults.typo,
            success: this.defaults.success,
            repeats: this.defaults.repeats,
            required_passed_star_half: this.defaults.required_passed_star_half,
            without_entering_text: false,
            show_text: false,
            speech_recognition_mode: this.defaults.speech_recognition_mode
        };

        // Описание значений букв (только для пользователя, без p и p_a)
        this.explanations = {
            'o': 'аудио оригинала',
            't': 'аудио перевода'
        };

        this.isInitialized = false;
        this._noLocalModelNotified = false;
    }

    _getSelectedModelKeyV2(langCode) {
        const normalizedLang = (langCode || '').toString().trim().toLowerCase().split('-')[0] || 'en';
        try {
            const mk = localStorage.getItem(`selected_asr_model_v2_${normalizedLang}`);
            return mk && mk !== 'null' && mk !== 'none' && String(mk).trim() !== '' ? String(mk) : null;
        } catch (e) {
            return null;
        }
    }

    _getSelectedModelDisplayName(langCode) {
        const mk = this._getSelectedModelKeyV2(langCode);
        if (!mk) return '';

        try {
            if (window.LanguageManager && typeof window.LanguageManager.getModelByKey === 'function') {
                const m = window.LanguageManager.getModelByKey(mk);
                if (m && m.name) return String(m.name);
            }
        } catch (e) {
        }

        try {
            if (mk.startsWith('whisper:')) {
                const size = this._parseWhisperSizeFromModelKey(mk);
                const repo = mk.slice('whisper:'.length);
                if (size) return `Whisper ${size} (${repo})`;
                if (repo) return `Whisper (${repo})`;
                return 'Whisper';
            }
            const parts = mk.split(':');
            return parts.length >= 2 ? parts.slice(1).join(':') : mk;
        } catch (e) {
            return '';
        }
    }

    _parseWhisperSizeFromModelKey(modelKey) {
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

    _getCurrentLangCode() {
        let currentLang = 'en';
        try {
            if (typeof langCodeUrl !== 'undefined' && langCodeUrl) {
                currentLang = langCodeUrl.split('-')[0] || 'en';
            } else if (typeof currentDictation !== 'undefined' && currentDictation && currentDictation.language_original) {
                currentLang = currentDictation.language_original.split('-')[0] || 'en';
            }
        } catch (e) {
        }
        return (currentLang || '').toString().trim().toLowerCase().split('-')[0] || 'en';
    }

    _getSelectedWhisperSize(langCode) {
        const normalizedLang = (langCode || '').toString().trim().toLowerCase().split('-')[0] || 'en';

        // v2 model-centric selection: selected_asr_model_v2_<lang> stores modelKey like "whisper:Xenova/whisper-small".
        try {
            const mk = localStorage.getItem(`selected_asr_model_v2_${normalizedLang}`);
            const size = this._parseWhisperSizeFromModelKey(mk);
            if (size) return size;
        } catch (e) {
        }

        try {
            const key = `selected_model_${normalizedLang}_whisper`;
            const v = localStorage.getItem(key);
            if (v && v !== 'null' && v !== 'none' && String(v).trim() !== '') return String(v);
        } catch (e) {
        }
        try {
            const raw = localStorage.getItem('selected_models');
            if (raw) {
                const obj = JSON.parse(raw);
                const k = `${normalizedLang}_whisper`;
                const v2 = obj && obj[k];
                if (v2 && v2 !== 'null' && v2 !== 'none' && String(v2).trim() !== '') return String(v2);
            }
        } catch (e) {
        }
        return null;
    }

    _showAutoCloseModal(message, delayMs = 3000) {
        try {
            let el = document.getElementById('dictafan-auto-modal');
            if (!el) {
                el = document.createElement('div');
                el.id = 'dictafan-auto-modal';
                el.style.position = 'fixed';
                el.style.top = '0';
                el.style.left = '0';
                el.style.right = '0';
                el.style.bottom = '0';
                el.style.display = 'none';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                el.style.background = 'rgba(0,0,0,0.35)';
                el.style.zIndex = '100001';
                el.innerHTML = '<div id="dictafan-auto-modal-box" style="max-width: min(92vw, 520px); background: #fff; padding: 14px 16px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); font-size: 14px; line-height: 1.35;"></div>';
                document.body.appendChild(el);
            }
            const box = document.getElementById('dictafan-auto-modal-box');
            if (box) box.textContent = message || '';
            el.style.display = 'flex';
            if (el._hideTimer) window.clearTimeout(el._hideTimer);
            el._hideTimer = window.setTimeout(() => {
                try {
                    const node = document.getElementById('dictafan-auto-modal');
                    if (node) node.style.display = 'none';
                } catch (e) {
                }
            }, Math.max(0, Number(delayMs) || 0));
        } catch (e) {
        }
    }

    /**
     * Инициализация панели
     */
    async init(userSettings = null) {
        try {
            // Загружаем настройки пользователя, если они есть
            if (userSettings) {
                this.loadFromUserSettings(userSettings);
            }
            
            this.render();
            this.bindEvents();
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing AudioSettingsPanel:', error);
        }
    }

    /**
     * Загрузить настройки из данных пользователя
     * Для старых пользователей - если поля пустые, оставляем пустыми (не заполняем по умолчанию)
     * Для новых пользователей - используем значения по умолчанию
     */
    loadFromUserSettings(userSettings) {
        if (!userSettings) {
            // Если нет настроек и это режим user-settings, используем значения по умолчанию
            if (this.options.mode === 'user-settings') {
                this.settings.start = this.defaults.start;
                this.settings.typo = this.defaults.typo;
                this.settings.success = this.defaults.success;
                this.settings.repeats = this.defaults.repeats;
                this.settings.required_passed_star_half = this.defaults.required_passed_star_half;
            }
            return;
        }

        // Сначала пытаемся загрузить из settings_json (новый формат)
        if (userSettings.settings_json) {
            try {
                const settings = JSON.parse(userSettings.settings_json);
                const audioSettings = settings.audio || {};

                // В режиме профиля (user-settings) пустая строка тоже является валидным значением:
                // пользователь мог намеренно очистить поле. Поэтому отличаем "нет поля" от "поле есть, но пустое".
                const hasStart = Object.prototype.hasOwnProperty.call(audioSettings, 'start');
                const hasTypo = Object.prototype.hasOwnProperty.call(audioSettings, 'typo');
                const hasSuccess = Object.prototype.hasOwnProperty.call(audioSettings, 'success');

                if (hasStart && audioSettings.start !== undefined && audioSettings.start !== null) {
                    this.settings.start = audioSettings.start;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.start = this.defaults.start;
                }
                if (hasTypo && audioSettings.typo !== undefined && audioSettings.typo !== null) {
                    this.settings.typo = audioSettings.typo;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.typo = this.defaults.typo;
                }
                if (hasSuccess && audioSettings.success !== undefined && audioSettings.success !== null) {
                    this.settings.success = audioSettings.success;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.success = this.defaults.success;
                }

                if (audioSettings.repeats !== undefined && audioSettings.repeats !== null) {
                    this.settings.repeats = parseInt(audioSettings.repeats, 10) || this.defaults.repeats;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.repeats = this.defaults.repeats;
                }

                if (audioSettings.required_passed_star_half !== undefined && audioSettings.required_passed_star_half !== null) {
                    const parsed = parseInt(audioSettings.required_passed_star_half, 10);
                    this.settings.required_passed_star_half = (!isNaN(parsed) && parsed >= 1) ? Math.min(10, parsed) : this.defaults.required_passed_star_half;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.required_passed_star_half = this.defaults.required_passed_star_half;
                }
                if (audioSettings.without_entering_text !== undefined && audioSettings.without_entering_text !== null) {
                    this.settings.without_entering_text = Boolean(audioSettings.without_entering_text);
                }
                if (audioSettings.show_text !== undefined && audioSettings.show_text !== null) {
                    this.settings.show_text = Boolean(audioSettings.show_text);
                }
                if (audioSettings.speech_recognition_mode !== undefined && audioSettings.speech_recognition_mode !== null) {
                    this.settings.speech_recognition_mode = audioSettings.speech_recognition_mode;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.speech_recognition_mode = this.defaults.speech_recognition_mode;
                }
                return; // Используем настройки из JSON, не проверяем старые поля
            } catch (e) {
                console.warn('Ошибка парсинга settings_json:', e);
            }
        }
        
        // Обратная совместимость: пытаемся загрузить из audio_settings_json
        if (userSettings.audio_settings_json) {
            try {
                const audioSettings = JSON.parse(userSettings.audio_settings_json);
                const hasStart = Object.prototype.hasOwnProperty.call(audioSettings, 'start');
                const hasTypo = Object.prototype.hasOwnProperty.call(audioSettings, 'typo');
                const hasSuccess = Object.prototype.hasOwnProperty.call(audioSettings, 'success');

                if (hasStart && audioSettings.start !== undefined && audioSettings.start !== null) {
                    this.settings.start = audioSettings.start;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.start = this.defaults.start;
                }
                if (hasTypo && audioSettings.typo !== undefined && audioSettings.typo !== null) {
                    this.settings.typo = audioSettings.typo;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.typo = this.defaults.typo;
                }
                if (hasSuccess && audioSettings.success !== undefined && audioSettings.success !== null) {
                    this.settings.success = audioSettings.success;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.success = this.defaults.success;
                }

                if (audioSettings.repeats !== undefined && audioSettings.repeats !== null) {
                    this.settings.repeats = parseInt(audioSettings.repeats, 10) || this.defaults.repeats;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.repeats = this.defaults.repeats;
                }
                if (audioSettings.without_entering_text !== undefined && audioSettings.without_entering_text !== null) {
                    this.settings.without_entering_text = Boolean(audioSettings.without_entering_text);
                }
                if (audioSettings.show_text !== undefined && audioSettings.show_text !== null) {
                    this.settings.show_text = Boolean(audioSettings.show_text);
                }
                if (audioSettings.speech_recognition_mode !== undefined && audioSettings.speech_recognition_mode !== null) {
                    this.settings.speech_recognition_mode = audioSettings.speech_recognition_mode;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.speech_recognition_mode = this.defaults.speech_recognition_mode;
                }
                return; // Используем настройки из JSON, не проверяем старые поля
            } catch (e) {
                console.warn('Ошибка парсинга audio_settings_json:', e);
            }
        }

        // Если у пользователя есть настройки - используем их
        // Если пустые - оставляем пустыми (для старых пользователей в режиме inline/modal)
        // Для новых пользователей в режиме user-settings используем значения по умолчанию
        if (userSettings.audio_start !== undefined && userSettings.audio_start !== null && userSettings.audio_start !== '') {
            this.settings.start = userSettings.audio_start;
        } else if (this.options.mode === 'user-settings') {
            // Для новых пользователей в режиме user-settings используем значения по умолчанию
            this.settings.start = this.defaults.start;
        }
        // Для inline/modal режимов - оставляем текущее значение (не перезаписываем)

        if (userSettings.audio_typo !== undefined && userSettings.audio_typo !== null && userSettings.audio_typo !== '') {
            this.settings.typo = userSettings.audio_typo;
        } else if (this.options.mode === 'user-settings') {
            this.settings.typo = this.defaults.typo;
        }

        if (userSettings.audio_success !== undefined && userSettings.audio_success !== null && userSettings.audio_success !== '') {
            this.settings.success = userSettings.audio_success;
        } else if (this.options.mode === 'user-settings') {
            this.settings.success = this.defaults.success;
        }

        if (userSettings.audio_repeats !== undefined && userSettings.audio_repeats !== null && userSettings.audio_repeats !== '') {
            this.settings.repeats = parseInt(userSettings.audio_repeats, 10) || this.defaults.repeats;
        } else if (this.options.mode === 'user-settings') {
            this.settings.repeats = this.defaults.repeats;
        }

        if (userSettings.audio_required_passed_star_half !== undefined && userSettings.audio_required_passed_star_half !== null && userSettings.audio_required_passed_star_half !== '') {
            const parsed = parseInt(userSettings.audio_required_passed_star_half, 10);
            this.settings.required_passed_star_half = (!isNaN(parsed) && parsed >= 1) ? Math.min(10, parsed) : this.defaults.required_passed_star_half;
        } else if (this.options.mode === 'user-settings') {
            this.settings.required_passed_star_half = this.defaults.required_passed_star_half;
        }

        if (userSettings.without_entering_text !== undefined && userSettings.without_entering_text !== null) {
            this.settings.without_entering_text = Boolean(userSettings.without_entering_text);
        }

        if (userSettings.show_text !== undefined && userSettings.show_text !== null) {
            this.settings.show_text = Boolean(userSettings.show_text);
        }

        if (userSettings.speech_recognition_mode !== undefined && userSettings.speech_recognition_mode !== null) {
            this.settings.speech_recognition_mode = userSettings.speech_recognition_mode;
        } else if (this.options.mode === 'user-settings') {
            this.settings.speech_recognition_mode = this.defaults.speech_recognition_mode;
        }
        
        // Проверяем наличие модели Whisper и принудительно устанавливаем route, если модель не загружена
        if (this.settings.speech_recognition_mode === 'route-off') {
            const hasModel = this.checkWhisperModelAvailable();
            if (!hasModel) {
                // Модель не загружена - принудительно ставим route
                this.settings.speech_recognition_mode = 'route';
            }
        }
    }

    /**
     * Генерирует HTML для панели настроек аудио
     * @param {('inline'|'modal'|'user-settings')} mode - режим отображения
     * @returns {string} HTML строка
     */
    _generateHTML(mode = 'inline') {
        const prefix = mode === 'modal' ? 'modal-' : '';
        const showExplanations = this.options.showExplanations && mode !== 'inline';
        
        // Для режима user-settings - две панели (слева настройки, справа обозначения)
        if (mode === 'user-settings') {
            // Генерируем список объяснений
            const explanationsHTML = `
                <div class="audio-explanations">
                    <label>Обозначения:</label>
                    <ul class="explanations-list">
                        ${Object.entries(this.explanations).map(([key, value]) => `
                            <li><strong>${key}</strong> - ${value}</li>
                        `).join('')}
                    </ul>
                </div>
            `;

            return `
                <table class="audio-settings-main-table">
                    <tr>
                        <td class="audio-settings-column">
                            <div class="audio-settings-frame">
                                <label class="audio-settings-title">Проигрываем аудио:</label>
                                <table class="audio-settings-table">
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>при старте:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <input type="text" 
                                                   id="${prefix}playSequenceStart" 
                                                   class="play-sequence-input" 
                                                   maxlength="5"
                                                   placeholder="oto" 
                                                   pattern="[to]*"
                                                   autocomplete="off"
                                                   autocapitalize="off"
                                                   autocorrect="off"
                                                   spellcheck="false"
                                                   value="${this.settings.start}"
                                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>при ошибке:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <input type="text" 
                                                   id="${prefix}playSequenceTypo" 
                                                   class="play-sequence-input" 
                                                   maxlength="5"
                                                   placeholder="o" 
                                                   pattern="[to]*"
                                                   autocomplete="off"
                                                   autocapitalize="off"
                                                   autocorrect="off"
                                                   spellcheck="false"
                                                   value="${this.settings.typo}"
                                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>при успехе:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <input type="text" 
                                                   id="${prefix}playSequenceSuccess" 
                                                   class="play-sequence-input"
                                                   maxlength="5" 
                                                   placeholder="ot" 
                                                   pattern="[to]*"
                                                   autocomplete="off"
                                                   autocapitalize="off"
                                                   autocorrect="off"
                                                   spellcheck="false"
                                                   value="${this.settings.success}"
                                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>
                                                <i data-lucide="mic"></i>
                                                Повторы аудио:
                                            </label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <input type="number" 
                                                   id="${prefix}audioRepeatsInput" 
                                                   class="play-sequence-input" 
                                                   min="0" 
                                                   max="5" 
                                                   value="${this.settings.repeats}"
                                                   title="Всего повторов аудио (от 0 до 5)">
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>
                                                <i data-lucide="star"></i>
                                                <span style="display:inline-flex; align-items:center; font-size: 18px; line-height: 1;">=</span>
                                            </label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <div style="display:inline-flex; align-items:center; gap:8px;">
                                                <input type="number"
                                                       id="${prefix}requiredPassedStarHalfInput"
                                                       class="play-sequence-input"
                                                       min="3"
                                                       max="9"
                                                       style="width: 56px;"
                                                       value="${this.settings.required_passed_star_half}"
                                                       title="Сколько полузвёзд нужно, чтобы засчитать 1 звезду (от 3 до 9)">
                                                <i data-lucide="star-half"></i>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>Только аудио (без ввода текста):</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <button type="button" 
                                                    id="${prefix}withoutEnteringTextButton" 
                                                    class="audio-setting-checkbox-btn" 
                                                    data-checked="${this.settings.without_entering_text}"
                                                    title="Если включено, поле ввода текста будет недоступно">
                                                <i data-lucide="${this.settings.without_entering_text ? 'circle-check-big' : 'circle'}"></i>
                                            </button>
                                        </td>
                                    </tr>
                                    <tr id="${prefix}showTextRow" style="${this.settings.without_entering_text ? '' : 'display: none;'}">
                                        <td class="audio-settings-label">
                                            <label>Показывать подсказку:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <button type="button" 
                                                    id="${prefix}showTextButton" 
                                                    class="audio-setting-checkbox-btn" 
                                                    data-checked="${this.settings.show_text}"
                                                    title="Если включено, будет показываться правильный текст предложения">
                                                <i data-lucide="${this.settings.show_text ? 'circle-check-big' : 'circle'}"></i>
                                            </button>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>Распознавание речи:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <div class="speech-recognition-toggle-button" 
                                                 data-prefix="${prefix}"
                                                 data-mode="${this.settings.speech_recognition_mode}">
                                                <i data-lucide="${this.getSpeechRecognitionIcon(this.settings.speech_recognition_mode)}" class="speech-recognition-icon"></i>
                                                <span class="speech-recognition-label">${this.getSpeechRecognitionLabel(this.settings.speech_recognition_mode)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="audio-settings-label">
                                            <label>Тест записи:</label>
                                        </td>
                                        <td class="audio-settings-input">
                                            <div style="display:flex; flex-direction:column; gap:8px;">
                                                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                                    <button type="button" id="profileTestRecordingBtn" class="button-color-yellow" style="height: 34px; padding: 0 12px;">Записать</button>
                                                    <span id="profileTestRecordingStatus" style="font-size: 12px; color: #666;"></span>
                                                </div>
                                                <textarea id="profileTestRecordingResult" rows="2" style="width: min(520px, 100%); resize: vertical;" placeholder="Распознанный текст появится тут" readonly></textarea>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                        <td class="audio-explanations-column">
                            ${explanationsHTML}
                        </td>
                    </tr>
                </table>
            `;
        }
        
        const hasModel = this.checkWhisperModelAvailable();
        const currentLang = this._getCurrentLangCode();
        const selectedSize = this._getSelectedWhisperSize(currentLang);
        const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);

        // В диктанте оффлайн -> только локальный режим (без выбора "интернет")
        if (isOffline && (this.options.mode === 'inline' || this.options.mode === 'modal')) {
            this.settings.speech_recognition_mode = 'route-off';
        }
        const isLocalMode = this.settings.speech_recognition_mode === 'route-off';
        let modelInfoText = '';
        let modelInfoColor = '#666';
        if (isLocalMode) {
            if (!hasModel) {
                modelInfoText = 'Локальная модель не загружена';
                modelInfoColor = '#b00020';
            } else if (!selectedSize) {
                modelInfoText = 'Локальная модель не выбрана';
                modelInfoColor = '#b00020';
            } else {
                modelInfoText = `Whisper ${selectedSize}`;
                modelInfoColor = '#666';
            }
        }

        // Для inline и modal режимов - обычная структура
        const explanationsHTML = showExplanations ? `
            <div class="audio-explanations">
                <label>Обозначения:</label>
                <ul class="explanations-list">
                    ${Object.entries(this.explanations).map(([key, value]) => `
                        <li><strong>${key}</strong> - ${value}</li>
                    `).join('')}
                </ul>
            </div>
        ` : '';

        return `
            <div class="audio-settings-top-panel">
                <div class="play-sequence-item" id="${prefix}requiredPassedStarHalfRow" style="${this.settings.without_entering_text ? 'display: none;' : ''}">
                    <div class="required-passed-count-control">
                        <i data-lucide="star" class="required-passed-star"></i>
                         = 
                        <input type="number"
                               id="${prefix}requiredPassedStarHalfInput"
                               class="play-sequence-input required-passed-count-input"
                               min="3"
                               max="9"
                               value="${this.settings.required_passed_star_half}"
                               title="Сколько полузвёзд нужно, чтобы засчитать 1 звезду (от 3 до 9)">
                        <i data-lucide="star-half" class="required-passed-star-half"></i>
                    </div>
                </div>
                <div class="play-sequence-item">
                    <div class="required-passed-count-control">
                        <i data-lucide="mic" class="required-passed-mic"></i>
                        =
                        <input type="number"
                               id="${prefix}audioRepeatsInput"
                               class="play-sequence-input required-passed-count-input"
                               min="0"
                               max="5"
                               value="${this.settings.repeats}"
                               title="Всего повторов аудио (от 0 до 5)">
                        <i data-lucide="mic-off" class="required-passed-mic"></i>
                    </div>
                </div>
                <div class="play-sequence-item">
                    <label>Только аудио (без ввода текста):</label>
                    <button type="button" 
                            id="${prefix}withoutEnteringTextButton" 
                            class="audio-setting-checkbox-btn" 
                            data-checked="${this.settings.without_entering_text}"
                            title="Если включено, поле ввода текста будет недоступно">
                        <i data-lucide="${this.settings.without_entering_text ? 'circle-check-big' : 'circle'}"></i>
                    </button>
                </div>
                <div class="play-sequence-item" id="${prefix}showTextRow" style="${this.settings.without_entering_text ? '' : 'display: none;'}">
                    <label>Показывать подсказку:</label>
                    <button type="button" 
                            id="${prefix}showTextButton" 
                            class="audio-setting-checkbox-btn" 
                            data-checked="${this.settings.show_text}"
                            title="Если включено, будет показываться правильный текст предложения">
                        <i data-lucide="${this.settings.show_text ? 'circle-check-big' : 'circle'}"></i>
                    </button>
                </div>
                <div class="play-sequence-item">
                    <label>Распознавание речи:</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="speech-recognition-toggle-button" 
                             data-prefix="${prefix}"
                             data-mode="${this.settings.speech_recognition_mode}">
                            <i data-lucide="${this.getSpeechRecognitionIcon(this.settings.speech_recognition_mode)}" class="speech-recognition-icon"></i>
                            <span class="speech-recognition-label">${this.getSpeechRecognitionLabel(this.settings.speech_recognition_mode)}</span>
                        </div>
                        ${isLocalMode ? `<div class="speech-recognition-model-inline" style="font-size: 12px; color: ${modelInfoColor}; white-space: nowrap;">${this._getSelectedModelDisplayName(currentLang) || modelInfoText}</div>` : ''}
                    </div>
                    ${isLocalMode && (!this._getSelectedModelDisplayName(currentLang)) ? `<div class="speech-recognition-model-info" style="margin-top: 6px; font-size: 12px; color: ${modelInfoColor};">${modelInfoText}</div>` : ''}
                </div>
            </div>
            <div class="audio-settings-bottom-panel">
                <div class="audio-settings-play-and-explanations">
                    <div class="play-sequence-container">
                        <label>Проигрываем аудио:</label>
                        <div class="play-sequence-item">
                            <label>при старте:</label>
                            <input type="text" 
                                   id="${prefix}playSequenceStart" 
                                   class="play-sequence-input" 
                                   maxlength="5"
                                   placeholder="oto" 
                                   pattern="[to]*"
                                   autocomplete="off"
                                   autocapitalize="off"
                                   autocorrect="off"
                                   spellcheck="false"
                                   value="${this.settings.start}"
                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                        </div>
                        <div class="play-sequence-item">
                            <label>при ошибке:</label>
                            <input type="text" 
                                   id="${prefix}playSequenceTypo" 
                                   class="play-sequence-input" 
                                   maxlength="5"
                                   placeholder="o" 
                                   pattern="[to]*"
                                   autocomplete="off"
                                   autocapitalize="off"
                                   autocorrect="off"
                                   spellcheck="false"
                                   value="${this.settings.typo}"
                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                        </div>
                        <div class="play-sequence-item">
                            <label>при успехе:</label>
                            <input type="text" 
                                   id="${prefix}playSequenceSuccess" 
                                   class="play-sequence-input"
                                   maxlength="5" 
                                   placeholder="ot" 
                                   pattern="[to]*"
                                   autocomplete="off"
                                   autocapitalize="off"
                                   autocorrect="off"
                                   spellcheck="false"
                                   value="${this.settings.success}"
                                   title="Используйте только буквы 't' (translation) и 'o' (original)">
                        </div>
                    </div>
                    ${explanationsHTML}
                </div>
            </div>
        `;
    }

    /**
     * Рендер панели в указанный контейнер
     */
    render() {
        if (!this.options.container) {
            console.warn('Cannot render: container missing');
            return;
        }

        const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);

        // В диктанте оффлайн -> только локально (даже если модели нет, показываем красный лейбл)
        if (isOffline && (this.options.mode === 'inline' || this.options.mode === 'modal')) {
            this.settings.speech_recognition_mode = 'route-off';
        }

        const hasModel = this.checkWhisperModelAvailable();

        if (this.settings.speech_recognition_mode === 'route-off' && !hasModel) {
            this.settings.repeats = 0;
        }

        // Используем общий метод генерации HTML
        this.options.container.innerHTML = this._generateHTML(this.options.mode);

        // После рендера, обновляем состояние кнопки распознавания
        const prefix = this.options.mode === 'modal' ? 'modal-' : '';
        const speechRecognitionButton = this.options.container.querySelector(`.speech-recognition-toggle-button[data-prefix="${prefix}"]`);
        if (speechRecognitionButton) {
            // Убеждаемся, что data-mode установлен правильно из настроек
            const currentMode = this.settings.speech_recognition_mode || 'route';
            speechRecognitionButton.dataset.mode = currentMode;
            // Обновляем иконку и лейбл в соответствии с текущим режимом
            const icon = speechRecognitionButton.querySelector('.speech-recognition-icon');
            const label = speechRecognitionButton.querySelector('.speech-recognition-label');
            if (icon) icon.setAttribute('data-lucide', this.getSpeechRecognitionIcon(currentMode));
            if (label) label.textContent = this.getSpeechRecognitionLabel(currentMode);
        }

        const repeatsInput = document.getElementById(`${prefix}audioRepeatsInput`);
        if (repeatsInput) {
            const forceNoAudio = this.settings.speech_recognition_mode === 'route-off' && !hasModel;
            if (forceNoAudio) {
                repeatsInput.value = 0;
                repeatsInput.disabled = true;
                repeatsInput.max = '0';
            } else {
                repeatsInput.disabled = false;
                repeatsInput.max = '5';
            }
        }

        // Инициализируем иконки Lucide
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    }

    /**
     * Привязка обработчиков событий
     */
    bindEvents() {
        const prefix = this.options.mode === 'modal' ? 'modal-' : '';
        
        // Находим все поля ввода
        const startInput = document.getElementById(`${prefix}playSequenceStart`);
        const typoInput = document.getElementById(`${prefix}playSequenceTypo`);
        const successInput = document.getElementById(`${prefix}playSequenceSuccess`);
        const repeatsInput = document.getElementById(`${prefix}audioRepeatsInput`);
        const requiredPassedStarHalfInput = document.getElementById(`${prefix}requiredPassedStarHalfInput`);

        // Валидация для текстовых полей (только 't' и 'o')
        [startInput, typoInput, successInput].forEach(input => {
            if (!input) return;

            input.addEventListener('input', (e) => {
                const value = e.target.value.toLowerCase();
                // Оставляем только 't' и 'o'
                const filtered = value.split('').filter(char => char === 't' || char === 'o').join('');
                if (filtered !== value) {
                    e.target.value = filtered;
                }
                this._updateSetting('start', startInput?.value || '');
                this._updateSetting('typo', typoInput?.value || '');
                this._updateSetting('success', successInput?.value || '');
                this.triggerChange();
            });

            input.addEventListener('blur', (e) => {
                const value = e.target.value.toLowerCase();
                const filtered = value.split('').filter(char => char === 't' || char === 'o').join('');
                if (filtered !== value) {
                    e.target.value = filtered;
                }
            });
        });

        // Обработка для required_passed_star_half (1..10)
        if (requiredPassedStarHalfInput) {
            const clampStarHalf = (raw) => {
                const value = parseInt(raw, 10);
                if (isNaN(value)) return this.defaults.required_passed_star_half;
                return Math.min(9, Math.max(3, value));
            };

            const applyStarHalfValue = (raw) => {
                const v = clampStarHalf(raw);
                requiredPassedStarHalfInput.value = v;
                this._updateSetting('required_passed_star_half', v);
            };

            requiredPassedStarHalfInput.addEventListener('input', (e) => {
                const v = clampStarHalf(e.target.value);
                this._updateSetting('required_passed_star_half', v);
            });

            requiredPassedStarHalfInput.addEventListener('change', (e) => {
                applyStarHalfValue(e.target.value);
                this.triggerChange();
            });

            applyStarHalfValue(requiredPassedStarHalfInput.value);
        }

        // Обработка для repeats (0..5)
        if (repeatsInput) {
            const clampRepeats = (raw) => {
                const value = parseInt(raw, 10);
                if (isNaN(value)) return this.defaults.repeats;
                return Math.min(5, Math.max(0, value));
            };

            const applyRepeatsValue = (raw) => {
                const v = clampRepeats(raw);
                repeatsInput.value = v;
                this._updateSetting('repeats', v);
            };

            repeatsInput.addEventListener('input', (e) => {
                const v = clampRepeats(e.target.value);
                this._updateSetting('repeats', v);
            });

            repeatsInput.addEventListener('change', (e) => {
                applyRepeatsValue(e.target.value);
                this.triggerChange();
            });

            applyRepeatsValue(repeatsInput.value);
        }

        // Обработка для кнопки "Только аудио (без ввода текста)"
        const withoutEnteringTextButton = document.getElementById(`${prefix}withoutEnteringTextButton`);
        if (withoutEnteringTextButton) {
            // Убираем outline сразу при загрузке
            withoutEnteringTextButton.style.outline = 'none';
            withoutEnteringTextButton.style.border = 'none';
            
            withoutEnteringTextButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Убираем outline при клике
                withoutEnteringTextButton.style.outline = 'none';
                withoutEnteringTextButton.style.border = 'none';
                
                const currentChecked = withoutEnteringTextButton.dataset.checked === 'true';
                const checked = !currentChecked;
                withoutEnteringTextButton.dataset.checked = String(checked);
                
                // Обновляем иконку (просто, как в allCheckbox)
                const newIconName = checked ? 'circle-check-big' : 'circle';
                withoutEnteringTextButton.innerHTML = `<i data-lucide="${newIconName}"></i>`;
                
                // Обновляем иконки Lucide
                if (window.lucide && window.lucide.createIcons) {
                    window.lucide.createIcons();
                }
                this._updateSetting('without_entering_text', checked);
                if (repeatsInput) {
                    const currentValue = parseInt(repeatsInput.value, 10);
                    if (!isNaN(currentValue)) {
                        const clamped = Math.min(5, Math.max(0, currentValue));
                        if (clamped !== currentValue) {
                            repeatsInput.value = clamped;
                            this._updateSetting('repeats', clamped);
                        }
                    }
                }
                
                // Показываем/скрываем строку с флагом показа текста
                const showTextRow = document.getElementById(`${prefix}showTextRow`);
                if (showTextRow) {
                    showTextRow.style.display = checked ? '' : 'none';
                    if (!checked) {
                        // Сбрасываем флаг показа текста, если выключили без ввода текста
                        this._updateSetting('show_text', false);
                        const showTextButton = document.getElementById(`${prefix}showTextButton`);
                        if (showTextButton) {
                            showTextButton.dataset.checked = 'false';
                            // Обновляем иконку (просто, как в allCheckbox)
                            showTextButton.innerHTML = `<i data-lucide="circle"></i>`;
                            if (window.lucide && window.lucide.createIcons) {
                                window.lucide.createIcons();
                            }
                        }
                    }
                }

                // Скрываем/показываем звёздный контроль (required_passed_star_half)
                const starHalfRow = document.getElementById(`${prefix}requiredPassedStarHalfRow`);
                if (starHalfRow) {
                    starHalfRow.style.display = checked ? 'none' : '';
                }
                
                this.triggerChange();
            });
        }

        // Обработка для кнопки "Показывать подсказку"
        const showTextButton = document.getElementById(`${prefix}showTextButton`);
        if (showTextButton) {
            // Убираем outline сразу при загрузке
            showTextButton.style.outline = 'none';
            showTextButton.style.border = 'none';
            
            showTextButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Убираем outline при клике
                showTextButton.style.outline = 'none';
                showTextButton.style.border = 'none';
                const currentChecked = showTextButton.dataset.checked === 'true';
                const checked = !currentChecked;
                showTextButton.dataset.checked = String(checked);
                
                // Обновляем иконку (просто, как в allCheckbox)
                const newIconName = checked ? 'circle-check-big' : 'circle';
                showTextButton.innerHTML = `<i data-lucide="${newIconName}"></i>`;
                
                // Обновляем иконки Lucide
                if (window.lucide && window.lucide.createIcons) {
                    window.lucide.createIcons();
                }
                
                this._updateSetting('show_text', checked);
                this.triggerChange();
            });
        }

        // Обработчик для кнопки переключения режима распознавания речи (циклическое переключение)
        const speechRecognitionButton = this.options.container.querySelector(`.speech-recognition-toggle-button[data-prefix="${prefix}"]`);
        if (speechRecognitionButton) {
            // Проверяем наличие модели Whisper для текущего языка
            const checkWhisperModel = () => {
                return this.checkWhisperModelAvailable();
            };
            
            // Обновляем состояние кнопки в зависимости от наличия модели
            const updateButtonState = () => {
                const hasModel = checkWhisperModel();
                const currentMode = speechRecognitionButton.dataset.mode || 'route';

                const isDictationPanel = this.options.mode === 'inline' || this.options.mode === 'modal';
                const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);

                if (isDictationPanel && isOffline) {
                    // Оффлайн в диктанте -> только локально
                    if (currentMode !== 'route-off') {
                        speechRecognitionButton.dataset.mode = 'route-off';
                        const icon = speechRecognitionButton.querySelector('.speech-recognition-icon');
                        const label = speechRecognitionButton.querySelector('.speech-recognition-label');
                        if (icon) icon.setAttribute('data-lucide', 'route-off');
                        if (label) label.textContent = 'локально';
                        this._updateSetting('speech_recognition_mode', 'route-off');
                        if (window.lucide && window.lucide.createIcons) {
                            window.lucide.createIcons();
                        }
                    }
                    speechRecognitionButton.style.opacity = '0.9';
                    speechRecognitionButton.style.cursor = 'not-allowed';
                    speechRecognitionButton.title = 'Оффлайн: распознавание работает только локально';
                    return;
                }
                
                // Если модель не загружена, блокируем переключение на route-off
                if (!hasModel) {
                    // Если текущий режим route-off, но модели нет - принудительно ставим route
                    if (currentMode === 'route-off') {
                        speechRecognitionButton.dataset.mode = 'route';
                        const icon = speechRecognitionButton.querySelector('.speech-recognition-icon');
                        const label = speechRecognitionButton.querySelector('.speech-recognition-label');
                        if (icon) icon.setAttribute('data-lucide', 'route');
                        if (label) label.textContent = 'интернет';
                        this._updateSetting('speech_recognition_mode', 'route');
                        if (window.lucide && window.lucide.createIcons) {
                            window.lucide.createIcons();
                        }
                    }
                    // Делаем кнопку неактивной (визуально, но клик все равно обрабатываем)
                    speechRecognitionButton.style.opacity = '0.6';
                    speechRecognitionButton.style.cursor = 'not-allowed';
                    speechRecognitionButton.title = 'Модель Whisper не загружена. Загрузите модель в профиле пользователя для локального распознавания.';
                } else {
                    // Модель загружена - кнопка активна
                    speechRecognitionButton.style.opacity = '1';
                    speechRecognitionButton.style.cursor = 'pointer';
                    speechRecognitionButton.title = '';
                }
            };
            
            // Обновляем состояние при инициализации
            updateButtonState();
            
            speechRecognitionButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const hasModel = checkWhisperModel();

                const isDictationPanel = this.options.mode === 'inline' || this.options.mode === 'modal';
                const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
                
                // Получаем текущий режим из data-mode или из настроек (для первого клика)
                let currentMode = speechRecognitionButton.dataset.mode || this.settings.speech_recognition_mode || 'route';

                // В диктанте оффлайн: режим фиксированный (локально)
                if (isDictationPanel && isOffline) {
                    return;
                }
                
                // Если модель не загружена, не позволяем переключаться на route-off
                if (!hasModel) {
                    const repeatsInput = document.getElementById(`${prefix}audioRepeatsInput`);
                    if (repeatsInput) {
                        repeatsInput.value = 0;
                        repeatsInput.disabled = true;
                        repeatsInput.max = '0';
                    }
                    this._updateSetting('repeats', 0);
                    this.triggerChange();
                    return;
                }
                
                // Переключаем только между route и route-off (убрали avto)
                const nextMode = currentMode === 'route' ? 'route-off' : 'route';
                
                // Обновляем data-mode
                speechRecognitionButton.dataset.mode = nextMode;
                
                // Обновляем иконку и лейбл
                const icon = speechRecognitionButton.querySelector('.speech-recognition-icon');
                const label = speechRecognitionButton.querySelector('.speech-recognition-label');
                
                if (icon) {
                    icon.setAttribute('data-lucide', this.getSpeechRecognitionIcon(nextMode));
                }
                if (label) {
                    label.textContent = this.getSpeechRecognitionLabel(nextMode);
                }
                
                // Обновляем иконки Lucide
                if (window.lucide && window.lucide.createIcons) {
                    window.lucide.createIcons();
                }
                
                // Обновляем настройку
                this._updateSetting('speech_recognition_mode', nextMode);
                this.triggerChange();
            });
        }
        
        // Обновляем иконки Lucide после рендеринга
        if (window.lucide && window.lucide.createIcons) {
            setTimeout(() => {
                window.lucide.createIcons();
            }, 100);
        }

    }

    /**
     * Обновление настройки
     */
    _updateSetting(key, value) {
        if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = value;
        }
    }

    /**
     * Уведомить о смене настроек
     */
    triggerChange() {
        if (typeof this.options.onSettingsChange === 'function') {
            this.options.onSettingsChange(this.getSettings());
        }
    }

    /**
     * Проверяет наличие модели Whisper для текущего языка
     * @returns {boolean} true если модель загружена, false если нет
     */
    checkWhisperModelAvailable() {
        // Получаем язык из глобальной переменной или из URL
        let currentLang = 'en';
        if (typeof langCodeUrl !== 'undefined' && langCodeUrl) {
            currentLang = langCodeUrl.split('-')[0] || 'en';
        } else if (typeof currentDictation !== 'undefined' && currentDictation && currentDictation.language_original) {
            currentLang = currentDictation.language_original.split('-')[0] || 'en';
        }

        // Model-centric: whisper weights are global per size.
        const normalizedLang = (currentLang || '').toString().trim().toLowerCase().split('-')[0] || 'en';
        const selectedSize = this._getSelectedWhisperSize(normalizedLang);
        const modelSize = selectedSize || 'base';

        // 1) In-memory
        try {
            if (window.WhisperModels && window.WhisperModels.get) {
                const inMem = window.WhisperModels.get(`whisper_model_${modelSize}`);
                if (inMem && inMem.isReady && inMem.recognizer) {
                    return true;
                }
            }
        } catch (e) {
        }

        // 2) localStorage status marker
        try {
            const status = localStorage.getItem(`whisper_model_${modelSize}`);
            if (status === 'downloaded' || status === 'ready') return true;
        } catch (e) {
        }

        // 3) models-centric downloaded state
        try {
            const raw = localStorage.getItem('downloaded_models_v2');
            const obj = raw ? JSON.parse(raw) : null;
            const mk = localStorage.getItem(`selected_asr_model_v2_${normalizedLang}`);
            if (obj && typeof obj === 'object' && mk && obj[mk]) return true;
        } catch (e) {
        }

        return false;
    }

    /**
     * Получить иконку для режима распознавания речи
     */
    getSpeechRecognitionIcon(mode) {
        const icons = {
            'route': 'route',
            'route-off': 'route-off'
        };
        return icons[mode] || 'route';
    }

    /**
     * Получить лейбл для режима распознавания речи
     */
    getSpeechRecognitionLabel(mode) {
        const labels = {
            'route': 'интернет',
            'route-off': 'локально'
        };
        return labels[mode] || 'интернет';
    }

    /**
     * Получить текущие настройки
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Установить настройки
     */
    setSettings(settings) {
        if (settings.start !== undefined && settings.start !== null) this.settings.start = settings.start;
        if (settings.typo !== undefined && settings.typo !== null) this.settings.typo = settings.typo;
        if (settings.success !== undefined && settings.success !== null) this.settings.success = settings.success;

        if (settings.repeats !== undefined) {
            const parsedRepeats = parseInt(settings.repeats, 10);
            this.settings.repeats = !isNaN(parsedRepeats) ? parsedRepeats : this.defaults.repeats;
        }

        if (settings.required_passed_star_half !== undefined) {
            const parsed = parseInt(settings.required_passed_star_half, 10);
            this.settings.required_passed_star_half = (!isNaN(parsed) && parsed >= 1)
                ? Math.min(10, parsed)
                : this.defaults.required_passed_star_half;
        }

        if (settings.without_entering_text !== undefined) this.settings.without_entering_text = Boolean(settings.without_entering_text);
        if (settings.show_text !== undefined) this.settings.show_text = Boolean(settings.show_text);
        if (settings.speech_recognition_mode !== undefined) this.settings.speech_recognition_mode = settings.speech_recognition_mode;

        if (this.isInitialized) {
            this.render();
            this.bindEvents();
        }
    }

    /**
     * Уничтожить панель
     */
    destroy() {
        if (this.options.container) {
            this.options.container.innerHTML = '';
        }
        this.isInitialized = false;
    }
}

// Глобальная функция для инициализации
window.initAudioSettingsPanel = function (containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id "${containerId}" not found`);
        return null;
    }

    return new AudioSettingsPanel({
        container: container,
        ...options
    });
};

