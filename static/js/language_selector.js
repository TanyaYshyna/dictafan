// Режимы:
// native-selector - только селектор родного языка
// learning-selector - селектор языка изучения
// learning-selector-compact - селектор языка изучения (только флаг в выбранном, флаг+название в списке)
// learning-list - список изучаемых языков с чекбоксами
// flag-combo - комбинация флагов (изучаемый → родной)
// header-selector - выпадающий селектор для шапки
// profile-panels - ДВЕ ПАНЕЛИ для профиля (родной + изучаемые)
// registration - для регистрации (родной + изучаемый)
class LanguageSelector {
    constructor(options = {}) {
        this.options = {
            container: null,
            mode: 'native-selector', // 'native-selector', 'learning-selector', 'learning-list', 'flag-combo', 'header-selector', 'profile-panels'
            selectorType: 'native',
            nativeLanguage: 'en',
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

        this.init();
    }

    async init() {
        try {
            this.render();
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing LanguageSelector:', error);
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

    getFlagFilename(langCode) {
        const countryCode = this.getCountryCode(langCode);
        return countryCode ? `${countryCode}.svg` : '';
    }

    createFlagElement(langCode) {
        const flagFile = this.getFlagFilename(langCode);
        if (!flagFile) return '';

        return `
            <img src="${this.flagPath}${flagFile}" 
                 alt="${this.getLanguageName(langCode)}" 
                 class="language-flag"
                 onerror="this.style.display='none'">
        `;
    }

    createNativeSelector() {
        const currentValue = this.options.nativeLanguage;
        const availableLanguages = Object.keys(this.languageData);
        // <label class="language-label">Родной язык</label>
        // <span class="arrow">▼</span>

        return `
            <div class="language-selector-group" data-selector-type="native">

                <div class="custom-select-wrapper">
                    <div class="custom-select-trigger">
                        ${this.createFlagElement(currentValue)} 
                        ${this.getLanguageName(currentValue)}
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
        const availableLanguages = this.options.mode === 'profile-panels'
            ? this.options.learningLanguages
            : Object.keys(this.languageData);

        // Убедимся, что текущий язык есть в доступных
        if (!availableLanguages.includes(currentValue) && availableLanguages.length > 0) {
            this.options.currentLearning = availableLanguages[0];
        }
        
        // Проверяем, нужен ли компактный режим (только флаг в trigger)
        const isCompact = this.options.mode === 'learning-selector-compact';
        const triggerContent = isCompact
            ? `${this.createFlagElement(currentValue)}<i data-lucide="chevron-down"></i>`
            : `${this.createFlagElement(currentValue)} ${this.getLanguageName(currentValue)}<i data-lucide="chevron-down"></i>`;
        
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

createLearningList() {
    const currentLearning = this.options.currentLearning;
    const learningLangs = this.options.learningLanguages;
    const userSettings = (typeof window.UM !== 'undefined' && window.UM.getUserSettings) ? window.UM.getUserSettings() : {};

    return `
    <div class="language-selector-group">
        <label class="language-label">Изучаемые языки</label>
        <div class="learning-languages-list">
            ${Object.entries(this.languageData).map(([code, data]) => {
        const isSelected = learningLangs.includes(code);
        const isCurrent = code === currentLearning;
        const languageName = this.getLanguageName(code);
        const useLocalWhisperModel = userSettings.audio?.use_local_whisper_model?.[code] || false;

        // Определяем иконку для чекбокса
        let checkboxIcon = 'circle'; // ⭕ по умолчанию для невыбранных
        let iconStyle = 'opacity: 0.3;'; // Стиль для невыбранных
        if (isSelected) {
            checkboxIcon = isCurrent ? 'circle-check-big' : 'circle-chevron-down'; // ✅ для текущего, 🔽 для выбранных но не текущих
            iconStyle = ''; // Убираем прозрачность для выбранных
        }

        // Определяем иконку для Whisper переключателя
        const whisperIcon = useLocalWhisperModel ? 'circle-check-big' : 'circle';
        const whisperOpacity = useLocalWhisperModel ? '' : 'opacity: 0.5;';
        
        return `
                <div class="language-item ${isSelected ? 'selected' : ''}" data-lang="${code}">
                    <label class="language-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} style="display: none;">
                        <i data-lucide="${checkboxIcon}" class="checkbox-icon ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}" style="${iconStyle}" data-action="${isSelected ? (isCurrent ? 'current' : 'set-current') : 'toggle'}"></i>
                        ${this.createFlagElement(code)} 
                        <span class="language-name">${languageName}</span>
                    </label>
                    ${isSelected ? `
                        <div class="whisper-model-toggle-container" data-lang="${code}">
                            <label class="whisper-toggle-label">
                                <i data-lucide="${whisperIcon}" 
                                   class="whisper-toggle-icon" 
                                   data-lang="${code}"
                                   id="whisper-toggle-${code}"
                                   style="cursor: pointer; ${whisperOpacity}"></i>
                                <span class="whisper-toggle-text">локальная модель</span>
                            </label>
                        </div>
                    ` : ''}
                </div>
            `;
    }).join('')}
        </div>
    </div>
    `;
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

        // console.log('🎨 Рендер LanguageSelector в режиме:', this.options.mode);
        // console.log('📦 Данные:', {
        //     native: this.options.nativeLanguage,
        //     learning: this.options.currentLearning,
        //     learningList: this.options.learningLanguages
        // });

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
            case 'flag-combo':
                html = this.createFlagCombo();
                break;
            case 'header-selector':
                html = this.createHeaderSelector();
                break;
            case 'profile-panels': // НОВЫЙ РЕЖИМ
                html = this.createProfilePanels();
                break;
            case 'profile': // старый режим для обратной совместимости
                html = this.createNativeSelector() + this.createLearningList() + this.createLearningSelector();
                break;
            case 'registration':
                html = this.createNativeSelector() + this.createLearningSelector();
                break;
            default:
                html = this.createNativeSelector();
        }

        // console.log('📝', html.length);
        this.options.container.innerHTML = html;

        this.bindEvents();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    bindEvents() {
        // Обработчики для кастомных селекторов
        const customSelects = this.options.container.querySelectorAll('.custom-select-wrapper');
        customSelects.forEach(select => {
            const trigger = select.querySelector('.custom-select-trigger');
            const options = select.querySelector('.custom-select-options');
            const parentGroup = select.closest('.language-selector-group');
            const hiddenSelect = parentGroup ? parentGroup.querySelector('.language-select-hidden') : null;
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
                    console.log('🎯 Выбран язык:', value);

                    // Обновляем данные в зависимости от типа селектора
                    if (selectorType === 'native') {
                        this.options.nativeLanguage = value;
                    } else if (selectorType === 'learning') {
                        this.options.currentLearning = value;
                    }

                    // В режиме profile-panels перерисовываем только нужные части
                    if (this.options.mode === 'profile-panels') {
                        this.render();
                    } else {
                        this.render();
                    }

                    this.triggerChange();
                });
            });
        });

        // Закрытие селекторов при клике вне
        document.addEventListener('click', (e) => {
            this.options.container.querySelectorAll('.custom-select-options').forEach(options => {
                options.style.display = 'none';
            });
        });

        // Обработчики для чекбоксов изучаемых языков
        const checkboxes = this.options.container.querySelectorAll('.language-checkbox input');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const lang = e.target.closest('.language-item').dataset.lang;

                if (e.target.checked) {
                    if (!this.options.learningLanguages.includes(lang)) {
                        this.options.learningLanguages.push(lang);
                    }
                } else {
                    this.options.learningLanguages = this.options.learningLanguages.filter(l => l !== lang);
                    // Если убрали текущий изучаемый язык, выбираем первый из оставшихся
                    if (this.options.currentLearning === lang) {
                        this.options.currentLearning = this.options.learningLanguages[0] || '';
                    }
                }

                // В режиме profile-panels перерисовываем полностью для синхронизации
                this.render();
                this.triggerChange();
            });
        });

        // Обработчики для иконок чекбоксов - клик по иконке делает язык текущим (если язык уже выбран)
        const checkboxIcons = this.options.container.querySelectorAll('.checkbox-icon');
        checkboxIcons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем всплытие события
                const action = icon.dataset.action;
                const lang = icon.closest('.language-item').dataset.lang;
                
                if (action === 'set-current') {
                    // Язык выбран, но не текущий - делаем его текущим
                    if (this.options.learningLanguages.includes(lang)) {
                        this.options.currentLearning = lang;
                        this.render();
                        this.triggerChange();
                    }
                } else if (action === 'toggle') {
                    // Язык не выбран - переключаем чекбокс
                    const checkbox = icon.closest('.language-checkbox').querySelector('input');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                }
                // Если action === 'current', ничего не делаем (язык уже текущий)
            });
        });

        // Обработчик клика по всей строке языка - переключает чекбокс
        const languageItems = this.options.container.querySelectorAll('.language-item');
        languageItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Пропускаем клики по иконке чекбокса (она обрабатывается отдельно)
                if (e.target.closest('.checkbox-icon')) {
                    return;
                }
                // Пропускаем клики по переключателю Whisper
                if (e.target.closest('.whisper-model-toggle-container')) {
                    return;
                }
                
                const checkbox = item.querySelector('.language-checkbox input');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        // Обработчики для переключателей локальной модели Whisper (иконки Lucide)
        // Используем делегирование событий для динамически созданных элементов
        this.options.container.addEventListener('click', async (e) => {
            const icon = e.target.closest('.whisper-toggle-icon');
            if (!icon) return;
            
            e.stopPropagation(); // Предотвращаем всплытие события на language-item
            const lang = icon.dataset.lang;
            if (!lang) return;
            
            const isChecked = icon.getAttribute('data-lucide') === 'circle-check-big';
            
            console.log(`🔄 Переключатель Whisper для языка ${lang}: ${isChecked ? 'выключен' : 'включен'}`);
            
            if (!isChecked) {
                // Включаем переключатель - начинаем загрузку модели
                try {
                    await this.downloadWhisperModelIcon(lang, icon);
                } catch (error) {
                    console.error(`Ошибка загрузки модели для ${lang}:`, error);
                    // В случае ошибки оставляем иконку в выключенном состоянии
                    icon.setAttribute('data-lucide', 'circle');
                    icon.style.opacity = '0.5';
                    if (window.lucide) {
                        window.lucide.createIcons();
                    }
                }
            } else {
                // Выключаем переключатель - модель остается в браузере, но не используется
                icon.setAttribute('data-lucide', 'circle');
                icon.style.opacity = '0.5';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                this.updateWhisperModelStatus(lang, false);
            }
        });
        
        // Инициализация состояния иконок после рендеринга
        const whisperToggleIcons = this.options.container.querySelectorAll('.whisper-toggle-icon');
        console.log(`🔍 Найдено переключателей Whisper: ${whisperToggleIcons.length}`);
        
        whisperToggleIcons.forEach((icon, index) => {
            const lang = icon.dataset.lang;
            if (!lang) return;
            
            console.log(`🔧 Настройка переключателя ${index + 1} для языка: ${lang}`);
            
            // Проверяем состояние модели при загрузке
            this.checkWhisperModelStatusIcon(lang, icon).catch(err => {
                console.error(`Ошибка проверки статуса модели для ${lang}:`, err);
            });
        });
        
        // Обновляем иконки Lucide после рендеринга
        if (window.lucide && window.lucide.createIcons) {
            setTimeout(() => {
                window.lucide.createIcons();
            }, 100);
        }

        // Обработчик ТОЛЬКО для header-selector режима
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
                        console.log('🎯 Выбран язык:', value);

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
    }

    // Проверка статуса модели Whisper для языка (для иконки)
    async checkWhisperModelStatusIcon(langCode, iconElement) {
        try {
            // Проверяем, есть ли модель в глобальном хранилище
            const modelKey = `whisper_model_${langCode}_base`;
            const storedModel = window.WhisperModels?.get?.(modelKey);
            
            if (storedModel && storedModel.isReady) {
                iconElement.setAttribute('data-lucide', 'circle-check-big');
                iconElement.style.opacity = '1';
                this.updateWhisperModelStatus(langCode, true);
            } else {
                // Проверяем в localStorage как fallback
                const modelStatus = localStorage.getItem(modelKey);
                if (modelStatus === 'downloaded' || modelStatus === 'ready') {
                    iconElement.setAttribute('data-lucide', 'circle-check-big');
                    iconElement.style.opacity = '1';
                    this.updateWhisperModelStatus(langCode, true);
                } else {
                    iconElement.setAttribute('data-lucide', 'circle');
                    iconElement.style.opacity = '0.5';
                    this.updateWhisperModelStatus(langCode, false);
                }
            }
            
            // Обновляем иконки Lucide
            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (error) {
            console.error('Ошибка проверки статуса модели Whisper:', error);
            iconElement.setAttribute('data-lucide', 'circle');
            iconElement.style.opacity = '0.5';
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    // Проверка статуса модели Whisper для языка (старый метод для совместимости)
    async checkWhisperModelStatus(langCode, toggleElement) {
        try {
            // Проверяем, есть ли модель в глобальном хранилище
            const modelKey = `whisper_model_${langCode}_base`;
            const storedModel = window.WhisperModels?.get?.(modelKey);
            
            if (storedModel && storedModel.isReady) {
                toggleElement.checked = true;
                this.updateWhisperModelStatus(langCode, true);
            } else {
                // Проверяем в localStorage как fallback
                const modelStatus = localStorage.getItem(modelKey);
                if (modelStatus === 'downloaded' || modelStatus === 'ready') {
                    toggleElement.checked = true;
                    this.updateWhisperModelStatus(langCode, true);
                } else {
                    toggleElement.checked = false;
                    this.updateWhisperModelStatus(langCode, false);
                }
            }
        } catch (error) {
            console.error('Ошибка проверки статуса модели Whisper:', error);
            toggleElement.checked = false;
        }
    }

    // Обновление визуального статуса модели
    updateWhisperModelStatus(langCode, isEnabled) {
        // Обновляем иконку переключателя Whisper
        const iconElement = this.options.container.querySelector(`.whisper-toggle-icon[data-lang="${langCode}"]`);
        if (iconElement) {
            if (isEnabled) {
                iconElement.setAttribute('data-lucide', 'circle-check-big');
                iconElement.style.opacity = '1';
            } else {
                iconElement.setAttribute('data-lucide', 'circle');
                iconElement.style.opacity = '0.5';
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    // Создание модального окна для загрузки модели
    createWhisperDownloadModal(langCode) {
        // Проверяем, существует ли уже модальное окно
        let modal = document.getElementById('whisper-download-modal');
        if (modal) {
            return modal;
        }

        // Создаем модальное окно
        modal = document.createElement('div');
        modal.id = 'whisper-download-modal';
        modal.className = 'modal whisper-download-modal';
        modal.style.display = 'none';

        const languageName = this.getLanguageName(langCode);
        
        modal.innerHTML = `
            <div class="modal-content whisper-download-modal-content">
                <div class="whisper-download-header">
                    <h3>Загрузка модели Whisper</h3>
                </div>
                <div class="whisper-download-body">
                    <p class="whisper-download-text">Загрузка модели для языка: <strong>${languageName}</strong></p>
                    <div class="whisper-download-progress-container">
                        <div class="whisper-download-progress-bar">
                            <div class="whisper-download-progress-fill" id="whisper-progress-fill"></div>
                        </div>
                        <div class="whisper-download-percent" id="whisper-progress-percent">0%</div>
                    </div>
                    <p class="whisper-download-status" id="whisper-download-status">Подготовка к загрузке...</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Показать модальное окно загрузки
    showWhisperDownloadModal(langCode) {
        const modal = this.createWhisperDownloadModal(langCode);
        const progressFill = document.getElementById('whisper-progress-fill');
        const progressPercent = document.getElementById('whisper-progress-percent');
        const statusText = document.getElementById('whisper-download-status');
        
        // Обновляем название языка
        const languageName = this.getLanguageName(langCode);
        const textElement = modal.querySelector('.whisper-download-text');
        if (textElement) {
            textElement.innerHTML = `Загрузка модели для языка: <strong>${languageName}</strong>`;
        }
        
        // Сбрасываем прогресс
        if (progressFill) progressFill.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (statusText) statusText.textContent = 'Начало загрузки...';
        
        modal.style.display = 'flex';
    }

    // Обновить прогресс в модальном окне
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

    // Обновить статус в модальном окне
    updateWhisperDownloadModalStatus(text) {
        const statusText = document.getElementById('whisper-download-status');
        if (statusText) {
            statusText.textContent = text;
        }
    }

    // Скрыть модальное окно загрузки
    hideWhisperDownloadModal() {
        const modal = document.getElementById('whisper-download-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Загрузка модели Whisper Base для языка (для иконки)
    async downloadWhisperModelIcon(langCode, iconElement) {
        console.log(`🔄 downloadWhisperModelIcon вызвана для языка: ${langCode}`);

        try {
            // Проверяем, есть ли уже модель
            const modelKey = `whisper_model_${langCode}_base`;
            const storedModel = window.WhisperModels?.get?.(modelKey);
            
            if (storedModel && storedModel.isReady) {
                // Модель уже загружена
                console.log(`✅ Модель для языка ${langCode} уже загружена`);
                iconElement.setAttribute('data-lucide', 'circle-check-big');
                iconElement.style.opacity = '1';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                this.updateWhisperModelStatus(langCode, true);
                return;
            }

            // Используем WhisperModelManager для загрузки модели
            if (!window.WhisperModelManager) {
                console.error('❌ WhisperModelManager не загружен. Проверьте подключение скрипта whisper-model-manager.js');
                iconElement.setAttribute('data-lucide', 'circle');
                iconElement.style.opacity = '0.5';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                alert('Менеджер моделей Whisper не загружен. Пожалуйста, обновите страницу.');
                return;
            }

            const modelManager = new window.WhisperModelManager();
            console.log(`🚀 Начинаем загрузку модели Whisper Base для языка: ${langCode}`);

            // Показываем модальное окно загрузки
            this.showWhisperDownloadModal(langCode);
            this.updateWhisperDownloadModalStatus('Подготовка к загрузке...');

            // Обновляем прогресс загрузки
            const updateProgress = (progressInfo) => {
                let percent = 0;
                
                // Transformers.js передает объект с полями: status, file, progress, loaded, total
                if (typeof progressInfo === 'object' && progressInfo !== null) {
                    if (progressInfo.progress !== undefined) {
                        // progress может быть в диапазоне 0-1 или 0-100
                        const progressValue = progressInfo.progress;
                        if (progressValue <= 1) {
                            // Диапазон 0-1
                            percent = Math.min(100, Math.max(0, Math.round(progressValue * 100)));
                        } else {
                            // Диапазон 0-100, уже в процентах
                            percent = Math.min(100, Math.max(0, Math.round(progressValue)));
                        }
                    } else if (progressInfo.loaded !== undefined && progressInfo.total !== undefined && progressInfo.total > 0) {
                        // Рассчитываем из loaded/total
                        percent = Math.min(100, Math.max(0, Math.round((progressInfo.loaded / progressInfo.total) * 100)));
                    }
                    
                    // Обновляем статус, если есть информация о файле
                    if (progressInfo.file) {
                        this.updateWhisperDownloadModalStatus(`Загрузка: ${progressInfo.file}`);
                    } else if (progressInfo.status) {
                        this.updateWhisperDownloadModalStatus(progressInfo.status);
                    }
                } else if (typeof progressInfo === 'number') {
                    // Если передано число напрямую
                    if (progressInfo <= 1) {
                        // Диапазон 0-1
                        percent = Math.min(100, Math.max(0, Math.round(progressInfo * 100)));
                    } else {
                        // Диапазон 0-100
                        percent = Math.min(100, Math.max(0, Math.round(progressInfo)));
                    }
                }
                
                // Обновляем прогресс в модальном окне
                this.updateWhisperDownloadModalProgress(percent);
                
                // Логируем только если процент изменился значительно
                if (percent > 0 && percent <= 100) {
                    console.log(`📈 Прогресс загрузки: ${percent}%`);
                }
            };

            // Загружаем модель через менеджер
            updateProgress(0.1);
            this.updateWhisperDownloadModalStatus('Загрузка модели Whisper Base...');
            console.log('⏳ Загружаем модель через WhisperModelManager...');
            
            try {
                const model = await modelManager.loadLanguageModel(
                    langCode,
                    'base',
                    updateProgress
                );

                console.log('✅ Модель загружена:', model);
                updateProgress(100);
                this.updateWhisperDownloadModalStatus('✅ Модель успешно загружена!');
                
                // Обновляем иконку
                iconElement.setAttribute('data-lucide', 'circle-check-big');
                iconElement.style.opacity = '1';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                
                // Проверяем, что модель (recognizer) загружена и готова
                if (model && typeof model === 'function') {
                    // Это recognizer от Transformers.js - готов к использованию
                    this.updateWhisperModelStatus(langCode, true);
                    console.log('✅ Recognizer готов к использованию');
                } else if (model && model.isReady) {
                    // Старый формат с флагом isReady
                    this.updateWhisperModelStatus(langCode, true);
                } else {
                    // Модель загружена, но не готова
                    this.updateWhisperModelStatus(langCode, true);
                    console.warn('⚠️ Модель загружена, но может быть не готова к использованию.');
                }
                
                // Закрываем модальное окно через 2 секунды
                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 2000);
                
            } catch (error) {
                console.error('❌ Ошибка загрузки модели:', error);
                iconElement.setAttribute('data-lucide', 'circle');
                iconElement.style.opacity = '0.5';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                this.updateWhisperDownloadModalStatus(`❌ Ошибка: ${error.message}`);
                
                // Закрываем модальное окно через 2 секунды даже при ошибке
                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 2000);
                
                alert(`Ошибка загрузки модели: ${error.message}`);
                return;
            }

            // Обновляем UI
            this.updateWhisperModelStatus(langCode, true);
            console.log(`Модель Whisper Base для языка ${langCode} успешно загружена`);
        } catch (error) {
            console.error('Ошибка загрузки модели Whisper:', error);
            iconElement.setAttribute('data-lucide', 'circle');
            iconElement.style.opacity = '0.5';
            if (window.lucide) {
                window.lucide.createIcons();
            }
            this.hideWhisperDownloadModal();
        }
    }

    // Загрузка модели Whisper Base для языка (старый метод для совместимости)
    async downloadWhisperModel(langCode, toggleElement) {
        console.log(`🔄 downloadWhisperModel вызвана для языка: ${langCode}`);

        try {
            // Проверяем, есть ли уже модель
            const modelKey = `whisper_model_${langCode}_base`;
            const storedModel = window.WhisperModels?.get?.(modelKey);
            
            if (storedModel && storedModel.isReady) {
                // Модель уже загружена
                console.log(`✅ Модель для языка ${langCode} уже загружена`);
                this.updateWhisperModelStatus(langCode, true);
                return;
            }

            // Используем WhisperModelManager для загрузки модели
            if (!window.WhisperModelManager) {
                console.error('❌ WhisperModelManager не загружен. Проверьте подключение скрипта whisper-model-manager.js');
                toggleElement.checked = false;
                alert('Менеджер моделей Whisper не загружен. Пожалуйста, обновите страницу.');
                return;
            }

            const modelManager = new window.WhisperModelManager();
            console.log(`🚀 Начинаем загрузку модели Whisper Base для языка: ${langCode}`);

            // Показываем модальное окно загрузки
            this.showWhisperDownloadModal(langCode);
            this.updateWhisperDownloadModalStatus('Подготовка к загрузке...');

            // Обновляем прогресс загрузки
            const updateProgress = (progressInfo) => {
                let percent = 0;
                
                // Transformers.js передает объект с полями: status, file, progress, loaded, total
                if (typeof progressInfo === 'object' && progressInfo !== null) {
                    if (progressInfo.progress !== undefined) {
                        // progress может быть в диапазоне 0-1 или 0-100
                        const progressValue = progressInfo.progress;
                        if (progressValue <= 1) {
                            // Диапазон 0-1
                            percent = Math.min(100, Math.max(0, Math.round(progressValue * 100)));
                        } else {
                            // Диапазон 0-100, уже в процентах
                            percent = Math.min(100, Math.max(0, Math.round(progressValue)));
                        }
                    } else if (progressInfo.loaded !== undefined && progressInfo.total !== undefined && progressInfo.total > 0) {
                        // Рассчитываем из loaded/total
                        percent = Math.min(100, Math.max(0, Math.round((progressInfo.loaded / progressInfo.total) * 100)));
                    }
                    
                    // Обновляем статус, если есть информация о файле
                    if (progressInfo.file) {
                        this.updateWhisperDownloadModalStatus(`Загрузка: ${progressInfo.file}`);
                    } else if (progressInfo.status) {
                        this.updateWhisperDownloadModalStatus(progressInfo.status);
                    }
                } else if (typeof progressInfo === 'number') {
                    // Если передано число напрямую
                    if (progressInfo <= 1) {
                        // Диапазон 0-1
                        percent = Math.min(100, Math.max(0, Math.round(progressInfo * 100)));
                    } else {
                        // Диапазон 0-100
                        percent = Math.min(100, Math.max(0, Math.round(progressInfo)));
                    }
                }
                
                // Обновляем прогресс в модальном окне
                this.updateWhisperDownloadModalProgress(percent);
                
                // Логируем только если процент изменился значительно
                if (percent > 0 && percent <= 100) {
                    console.log(`📈 Прогресс загрузки: ${percent}%`);
                }
            };

            // Загружаем модель через менеджер
            updateProgress(0.1);
            this.updateWhisperDownloadModalStatus('Загрузка модели Whisper Base...');
            console.log('⏳ Загружаем модель через WhisperModelManager...');
            
            try {
                const model = await modelManager.loadLanguageModel(
                    langCode,
                    'base',
                    updateProgress
                );

                console.log('✅ Модель загружена:', model);
                updateProgress(100);
                this.updateWhisperDownloadModalStatus('✅ Модель успешно загружена!');
                
                // Проверяем, что модель (recognizer) загружена и готова
                if (model && typeof model === 'function') {
                    // Это recognizer от Transformers.js - готов к использованию
                    this.updateWhisperModelStatus(langCode, true);
                    console.log('✅ Recognizer готов к использованию');
                } else if (model && model.isReady) {
                    // Старый формат с флагом isReady
                    this.updateWhisperModelStatus(langCode, true);
                } else {
                    // Модель загружена, но не готова
                    this.updateWhisperModelStatus(langCode, true);
                    console.warn('⚠️ Модель загружена, но может быть не готова к использованию.');
                }
                
                // Закрываем модальное окно через 2 секунды
                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 2000);
                
            } catch (error) {
                console.error('❌ Ошибка загрузки модели:', error);
                toggleElement.checked = false;
                this.updateWhisperDownloadModalStatus(`❌ Ошибка: ${error.message}`);
                
                // Закрываем модальное окно через 2 секунды даже при ошибке
                setTimeout(() => {
                    this.hideWhisperDownloadModal();
                }, 2000);
                
                alert(`Ошибка загрузки модели: ${error.message}`);
                return;
            }

            // Обновляем UI
            this.updateWhisperModelStatus(langCode, true);
            console.log(`Модель Whisper Base для языка ${langCode} успешно загружена`);
            
            // Обновляем иконку режима распознавания на странице диктанта (если она есть)
            if (typeof updateRecognitionModeIcon === 'function') {
                updateRecognitionModeIcon();
            }
            
            // Обновляем панель настроек аудио (если она есть), чтобы разблокировать кнопку переключения режима
            if (typeof audioSettingsModalPanel !== 'undefined' && audioSettingsModalPanel && typeof audioSettingsModalPanel.render === 'function') {
                // Перерисовываем панель, чтобы обновить состояние кнопки
                audioSettingsModalPanel.render();
                audioSettingsModalPanel.bindEvents();
            }
        } catch (error) {
            console.error('Ошибка загрузки модели Whisper:', error);
            toggleElement.checked = false;
            this.hideWhisperDownloadModal();
        }
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
        if (this.options.container) {
            this.options.container.innerHTML = '';
        }
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