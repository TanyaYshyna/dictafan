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
            speech_recognition_mode: 'route' // 'route' (интернет), 'route-off' (локально, только если модель загружена)
        };

        // Текущие значения
        this.settings = {
            start: this.defaults.start,
            typo: this.defaults.typo,
            success: this.defaults.success,
            repeats: this.defaults.repeats,
            without_entering_text: false,
            show_text: false,
            speech_recognition_mode: this.defaults.speech_recognition_mode
        };

        // Описание значений букв (только для пользователя, без p и p_a)
        this.explanations = {
            'o': 'аудио оригинала',
            't': 'аудио перевода',
            'a': 'аудио созданное автоматически',
            'f': 'аудио вырезанное из файла',
            'm': 'аудио с микрофона'
        };

        this.isInitialized = false;
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
            }
            return;
        }

        // Сначала пытаемся загрузить из settings_json (новый формат)
        if (userSettings.settings_json) {
            try {
                const settings = JSON.parse(userSettings.settings_json);
                const audioSettings = settings.audio || {};
                if (audioSettings.start !== undefined && audioSettings.start !== null && audioSettings.start !== '') {
                    this.settings.start = audioSettings.start;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.start = this.defaults.start;
                }
                if (audioSettings.typo !== undefined && audioSettings.typo !== null && audioSettings.typo !== '') {
                    this.settings.typo = audioSettings.typo;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.typo = this.defaults.typo;
                }
                if (audioSettings.success !== undefined && audioSettings.success !== null && audioSettings.success !== '') {
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
                console.warn('Ошибка парсинга settings_json:', e);
            }
        }
        
        // Обратная совместимость: пытаемся загрузить из audio_settings_json
        if (userSettings.audio_settings_json) {
            try {
                const audioSettings = JSON.parse(userSettings.audio_settings_json);
                if (audioSettings.start !== undefined && audioSettings.start !== null && audioSettings.start !== '') {
                    this.settings.start = audioSettings.start;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.start = this.defaults.start;
                }
                if (audioSettings.typo !== undefined && audioSettings.typo !== null && audioSettings.typo !== '') {
                    this.settings.typo = audioSettings.typo;
                } else if (this.options.mode === 'user-settings') {
                    this.settings.typo = this.defaults.typo;
                }
                if (audioSettings.success !== undefined && audioSettings.success !== null && audioSettings.success !== '') {
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
                                                   min="${this.settings.without_entering_text ? 1 : 0}" 
                                                   max="${this.settings.without_entering_text ? 5 : 9}" 
                                                   value="${this.settings.repeats}"
                                                   title="Количество повторов аудио (по умолчанию 3)">
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
                           value="${this.settings.success}"
                           title="Используйте только буквы 't' (translation) и 'o' (original)">
                </div>
                <div class="play-sequence-item">
                    <label>
                        <i data-lucide="mic"></i>
                        Повторы аудио:
                    </label>
                    <input type="number" 
                           id="${prefix}audioRepeatsInput" 
                           class="play-sequence-input" 
                           min="${this.settings.without_entering_text ? 1 : 0}" 
                           max="${this.settings.without_entering_text ? 5 : 9}" 
                           value="${this.settings.repeats}"
                           title="Количество повторов аудио (по умолчанию 3)">
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
                    <div class="speech-recognition-toggle-button" 
                         data-prefix="${prefix}"
                         data-mode="${this.settings.speech_recognition_mode}">
                        <i data-lucide="${this.getSpeechRecognitionIcon(this.settings.speech_recognition_mode)}" class="speech-recognition-icon"></i>
                        <span class="speech-recognition-label">${this.getSpeechRecognitionLabel(this.settings.speech_recognition_mode)}</span>
                    </div>
                </div>
                ${explanationsHTML}
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

        // Проверяем наличие модели Whisper и принудительно устанавливаем route, если модель не загружена
        if (this.settings.speech_recognition_mode === 'route-off') {
            const hasModel = this.checkWhisperModelAvailable();
            if (!hasModel) {
                // Модель не загружена - принудительно ставим route
                this.settings.speech_recognition_mode = 'route';
            }
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

        // Обработка для поля числа (повторы аудио)
        if (repeatsInput) {
            const updateRepeatsValidation = () => {
                const withoutEntering = this.settings.without_entering_text;
                const min = withoutEntering ? 1 : 0;
                const max = withoutEntering ? 5 : 9;
                repeatsInput.min = min;
                repeatsInput.max = max;
                
                // Корректируем значение, если оно не соответствует новым ограничениям
                const currentValue = parseInt(repeatsInput.value, 10);
                if (!isNaN(currentValue)) {
                    if (currentValue < min) {
                        repeatsInput.value = min;
                        this._updateSetting('repeats', min);
                    } else if (currentValue > max) {
                        repeatsInput.value = max;
                        this._updateSetting('repeats', max);
                    }
                }
            };

            repeatsInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                const withoutEntering = this.settings.without_entering_text;
                const min = withoutEntering ? 1 : 0;
                const max = withoutEntering ? 5 : 9;
                
                if (!isNaN(value) && value >= min && value <= max) {
                    this._updateSetting('repeats', value);
                    this.triggerChange();
                }
            });

            repeatsInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                const withoutEntering = this.settings.without_entering_text;
                const min = withoutEntering ? 1 : 0;
                const max = withoutEntering ? 5 : 9;
                
                if (isNaN(value) || value < min) {
                    e.target.value = min;
                    this._updateSetting('repeats', min);
                } else if (value > max) {
                    e.target.value = max;
                    this._updateSetting('repeats', max);
                } else {
                    this._updateSetting('repeats', value);
                }
                this.triggerChange();
            });

            // Обновляем валидацию при изменении without_entering_text
            updateRepeatsValidation();
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
                
                // Обновляем валидацию повторов
                if (repeatsInput) {
                    const min = checked ? 1 : 0;
                    const max = checked ? 5 : 9;
                    repeatsInput.min = min;
                    repeatsInput.max = max;
                    
                    const currentValue = parseInt(repeatsInput.value, 10);
                    if (!isNaN(currentValue)) {
                        if (currentValue < min) {
                            repeatsInput.value = min;
                            this._updateSetting('repeats', min);
                        } else if (currentValue > max) {
                            repeatsInput.value = max;
                            this._updateSetting('repeats', max);
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
                
                // Получаем текущий режим из data-mode или из настроек (для первого клика)
                let currentMode = speechRecognitionButton.dataset.mode || this.settings.speech_recognition_mode || 'route';
                
                // Если модель не загружена, не позволяем переключаться на route-off
                if (!hasModel) {
                    // Если текущий режим route-off, принудительно ставим route
                    if (currentMode === 'route-off') {
                        currentMode = 'route';
                        speechRecognitionButton.dataset.mode = 'route';
                        const icon = speechRecognitionButton.querySelector('.speech-recognition-icon');
                        const label = speechRecognitionButton.querySelector('.speech-recognition-label');
                        if (icon) icon.setAttribute('data-lucide', 'route');
                        if (label) label.textContent = 'интернет';
                        this._updateSetting('speech_recognition_mode', 'route');
                        if (window.lucide && window.lucide.createIcons) {
                            window.lucide.createIcons();
                        }
                        this.triggerChange();
                    }
                    return; // Блокируем переключение
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
        
        // Используем ту же логику проверки, что и в script_dictation.js (унифицированная проверка)
        // Проверяем через глобальную функцию hasWhisperModel (если доступна)
        if (typeof hasWhisperModel === 'function') {
            return hasWhisperModel(currentLang);
        }
        
        // Fallback: проверяем так же, как в hasWhisperModel (память + localStorage)
        const modelKey = `whisper_model_${currentLang}_base`;
        
        // Сначала проверяем в памяти
        if (window.WhisperModels) {
            const storedModel = window.WhisperModels.get(modelKey);
            if (storedModel && storedModel.isReady && storedModel.recognizer) {
                return true;
            }
        }
        
        // Если в памяти нет, проверяем localStorage (как в профиле)
        const modelStatus = localStorage.getItem(modelKey);
        return modelStatus === 'downloaded' || modelStatus === 'ready';
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
        if (settings.start !== undefined) this.settings.start = settings.start;
        if (settings.typo !== undefined) this.settings.typo = settings.typo;
        if (settings.success !== undefined) this.settings.success = settings.success;
        if (settings.repeats !== undefined) this.settings.repeats = parseInt(settings.repeats, 10) || this.defaults.repeats;
        if (settings.without_entering_text !== undefined) this.settings.without_entering_text = Boolean(settings.without_entering_text);
        if (settings.show_text !== undefined) this.settings.show_text = Boolean(settings.show_text);
        if (settings.speech_recognition_mode !== undefined) this.settings.speech_recognition_mode = settings.speech_recognition_mode;

        if (this.isInitialized) {
            this.render();
            this.bindEvents();
        }
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
     * Вызвать callback при изменении настроек
     */
    triggerChange() {
        if (typeof this.options.onSettingsChange === 'function') {
            this.options.onSettingsChange(this.getSettings());
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

