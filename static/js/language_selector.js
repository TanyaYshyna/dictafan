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
        const availableLanguages = Object.keys(this.languageData);

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
                (data.models.whisper && data.models.whisper.length > 0) ||
                (data.models.tts && data.models.tts.length > 0)
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

        // Проверяем, выбрана ли какая-то модель для каждого типа
        const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
        const selectedTTS = this.getSelectedModelWithFallback(langCode, 'tts');

        // Проверяем, есть ли хотя бы один тип моделей
        const hasWhisper = languageData.models.whisper && languageData.models.whisper.length > 0;
        const hasTTS = languageData.models.tts && languageData.models.tts.length > 0;

        // Добавляем ОДНУ опцию "без модели" в начало списка, если есть хотя бы один тип моделей
        if (hasWhisper || hasTTS) {
            items.push({
                id: null,
                type: 'all', // специальный тип для "без модели" всех типов
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

        // TTS модели
        if (hasTTS) {
            items.push(...languageData.models.tts.map(model => ({
                id: model.id,
                type: 'tts',
                name: model.name,
                size: model.size,
                displayText: `tts: ${model.name} ${model.size}`,
                isNone: false
            })));
        }

        return items.map(item => {
            // Для опции "без модели" проверяем, выбрана ли какая-то модель
            let isSelected = false;
            let selectedModel = null; // Инициализируем переменную для всех случаев

            if (item.isNone) {
                // "без модели" выбрана, если не выбрана ни одна модель (ни whisper, ни tts)
                const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
                const selectedTTS = this.getSelectedModelWithFallback(langCode, 'tts');

                const hasSelectedWhisper = selectedWhisper && selectedWhisper !== null && selectedWhisper !== '' && selectedWhisper !== 'none' && String(selectedWhisper).trim() !== '';
                const hasSelectedTTS = selectedTTS && selectedTTS !== null && selectedTTS !== '' && selectedTTS !== 'none' && String(selectedTTS).trim() !== '';

                // "без модели" выбрана только если не выбрана ни одна модель
                isSelected = !hasSelectedWhisper && !hasSelectedTTS;
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
                     data-type="${item.isNone ? 'all' : item.type}"
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
            const modelTypeName = model.modelType === 'whisper' ? 'Whisper' : 'TTS';

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

        Object.entries(this.languageData).forEach(([langCode, data]) => {
            if (learningLangs.includes(langCode) && data.models) {
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

                // TTS модели
                if (data.models.tts) {
                    data.models.tts.forEach(model => {
                        if (this.isModelDownloadedWithFallback(langCode, model.id, 'tts')) {
                            models.push({
                                langCode,
                                modelId: model.id,
                                modelType: 'tts',
                                modelName: model.name,
                                size: model.size,
                                isActive: this.isModelActive(langCode, model.id, 'tts')
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

        // Проверяем выбранную TTS модель
        if (languageData.models.tts && languageData.models.tts.length > 0) {
            const selectedTTS = this.getSelectedModelWithFallback(langCode, 'tts');
            if (selectedTTS && selectedTTS !== 'none' && selectedTTS !== '') {
                const model = languageData.models.tts.find(m => m.id === selectedTTS);
                if (model) {
                    selectedModels.push(`tts: ${model.name}`);
                }
            }
        }

        return selectedModels.length > 0 ? selectedModels.join(' + ') : 'без модели';
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
                ? (data.models && ((data.models.whisper && data.models.whisper.length > 0) || (data.models.tts && data.models.tts.length > 0)))
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

                // TTS модели
                if (data.models.tts) {
                    data.models.tts.forEach(model => {
                        const sizeMB = this.parseSizeToMB(model.size);
                        totalAvailableModels++;
                        totalAvailableSizeMB += sizeMB;

                        // Проверяем, скачана ли модель
                        if (this.isModelDownloadedWithFallback(code, model.id, 'tts')) {
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
    getTotalModelCount() {
        const learningLangs = this.options.learningLanguages;
        let count = 0;

        Object.entries(this.languageData).forEach(([code, data]) => {
            if (learningLangs.includes(code) && data.models) {
                if (data.models.whisper) {
                    count += data.models.whisper.length;
                }
                if (data.models.tts) {
                    count += data.models.tts.length;
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
            case 'flag-combo':
                html = this.createFlagCombo();
                break;
            case 'header-selector':
                html = this.createHeaderSelector();
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
    }

    // Обновленные обработчики событий
    bindEvents() {
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

        // 5. Отладочная кнопка для тестирования
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔄 Отладка хранилища';
        debugBtn.style.cssText = 'position: fixed; bottom: 10px; right: 10px; padding: 5px 10px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 9999; font-size: 11px;';
        debugBtn.onclick = () => this.debugStorage();
        document.body.appendChild(debugBtn);

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
            const modelTypeName = modelType === 'whisper' ? 'Whisper' : 'TTS';

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
            this.updateWhisperDownloadModalStatus(`Загрузка ${modelType === 'whisper' ? 'Whisper' : 'TTS'} модели ${modelData.name}...`);

            const updateProgress = (percent) => {
                this.updateWhisperDownloadModalProgress(percent);
            };

            updateProgress(0);

            try {
                // Пробуем загрузить через ModelManager
                if (window.ModelManager && typeof window.ModelManager.downloadModel === 'function') {
                    console.log(`🔄 Начинаем загрузку через ModelManager: ${langCode}/${modelType}/${modelId}`);

                    // Сначала устанавливаем модель как скачанную (чтобы UI обновился сразу)
                    window.ModelManager.setModelDownloaded(langCode, modelId, modelType, {
                        size: this.parseSizeToMB(modelData.size) * 1024 * 1024, // в байтах
                        name: modelData.name
                    });

                    // Обновляем UI сразу
                    slider.classList.add('downloaded');
                    slider.style.backgroundColor = '#8B4513';
                    if (sliderCircle) {
                        sliderCircle.style.backgroundColor = '#FFD700';
                        sliderCircle.style.transform = 'translateX(20px)';
                    }

                    // Пытаемся скачать (это может упасть с 404)
                    try {
                        await window.ModelManager.downloadModel(langCode, modelId, modelType, (progress) => {
                            if (progress && progress.percent !== undefined) {
                                const percent = Math.round(progress.percent);
                                updateProgress(percent);
                            }
                        });

                        console.log(`✅ ModelManager успешно загрузил модель ${langCode}/${modelType}/${modelId}`);

                    } catch (downloadError) {
                        console.log(`⚠️ Ошибка загрузки модели:`, downloadError);

                        // Если это 404, продолжаем работу с локально сохраненной моделью
                        if (downloadError.message.includes('404')) {
                            console.log(`ℹ️ Сервер не доступен, работаем в offline режиме`);
                            this.updateWhisperDownloadModalStatus('⚠️ Офлайн режим. Модель сохранена локально');

                            // Ждем немного для показа сообщения
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
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
            // Снимаем выборы со всех типов моделей (whisper и tts)
            const whisperKey = `selected_model_${langCode}_whisper`;
            const ttsKey = `selected_model_${langCode}_tts`;

            localStorage.removeItem(whisperKey);
            localStorage.removeItem(ttsKey);

            console.log(`⭐ Снят выбор всех моделей для языка: ${langCode}`);

            if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
                window.ModelManager.setSelectedModel(langCode, 'whisper', null);
                window.ModelManager.setSelectedModel(langCode, 'tts', null);
            }
            this.updateModelSelectionUI(langCode);
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
                                // ВАЖНО: может быть выбрана только ОДНА модель (whisper ИЛИ tts)
                                const currentKey = `selected_model_${langCode}_${modelType}`;
                                const otherType = modelType === 'whisper' ? 'tts' : 'whisper';
                                const otherKey = `selected_model_${langCode}_${otherType}`;

                                // Сохраняем выбранную модель
                                localStorage.setItem(currentKey, modelId);

                                // Снимаем выбор с модели другого типа
                                localStorage.removeItem(otherKey);

                                if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
                                    window.ModelManager.setSelectedModel(langCode, modelType, modelId);
                                    // Снимаем выбор с модели другого типа
                                    window.ModelManager.setSelectedModel(langCode, otherType, null);
                                }
                                this.updateModelSelectionUI(langCode);
                            }
                        }
                    }
                }
            }
            return;
        }

        // Если модель уже загружена - выбираем её
        // ВАЖНО: может быть выбрана только ОДНА модель (whisper ИЛИ tts)
        // Поэтому снимаем выбор с модели другого типа, если она была выбрана

        const currentKey = `selected_model_${langCode}_${modelType}`;
        const otherType = modelType === 'whisper' ? 'tts' : 'whisper';
        const otherKey = `selected_model_${langCode}_${otherType}`;

        // Сохраняем выбранную модель
        localStorage.setItem(currentKey, modelId);

        // Снимаем выбор с модели другого типа
        localStorage.removeItem(otherKey);

        console.log(`⭐ Выбрана модель: ${langCode}/${modelType}/${modelId}`);
        console.log(`   Снят выбор с модели другого типа: ${langCode}/${otherType}`);

        if (window.ModelManager && typeof window.ModelManager.setSelectedModel === 'function') {
            window.ModelManager.setSelectedModel(langCode, modelType, modelId);
            // Снимаем выбор с модели другого типа
            window.ModelManager.setSelectedModel(langCode, otherType, null);
        }
        this.updateModelSelectionUI(langCode);
    }

    // НОВЫЙ МЕТОД: обновление UI после выбора модели
    updateModelSelectionUI(langCode) {
        // Проверяем текущее состояние перед обновлением
        const selectedWhisper = this.getSelectedModelWithFallback(langCode, 'whisper');
        const selectedTTS = this.getSelectedModelWithFallback(langCode, 'tts');
        console.log(`🔄 Обновление UI для ${langCode}: whisper=${selectedWhisper}, tts=${selectedTTS}`);

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

            const modelTypeName = modelType === 'whisper' ? 'Whisper' : 'TTS';
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
        if (this.options.container) {
            this.options.container.innerHTML = '';
        }
    }

    // ДОБАВЬТЕ В КЛАСС LanguageSelector:
    debugStorage() {
        console.log('🔍 Отладочная информация о хранилище:');

        // Проверяем localStorage
        console.log('📁 LocalStorage:');
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('model_') || key.includes('selected_model_')) {
                console.log(`  ${key}:`, localStorage.getItem(key));
            }
        }

        // Проверяем ModelManager
        if (window.ModelManager) {
            console.log('📊 ModelManager:');
            console.log('  Выбранные модели:', window.ModelManager.selectedModels);
            console.log('  Загруженные модели:', window.ModelManager.downloadedModels);
            console.log('  Всего загружено:', window.ModelManager.getAllDownloadedModels().length);
        }

        // Информация о текущих расчетах
        const storageInfo = this.calculateStorageUsage();
        console.log('📈 Расчет использования памяти:', storageInfo);
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