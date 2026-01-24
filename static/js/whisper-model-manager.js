/**
 * WhisperModelManager - Менеджер для загрузки моделей Whisper через Transformers.js
 * Использует официальную библиотеку от Hugging Face
 */
class WhisperModelManager {
    constructor() {
        // Модели Whisper от Hugging Face через Transformers.js
        this.modelNames = {
            'tiny': 'Xenova/whisper-tiny',      // ~75 МБ
            'base': 'Xenova/whisper-base',      // ~140 МБ
            'small': 'Xenova/whisper-small'     // ~460 МБ
        };
        
        // Размеры моделей для информации
        this.modelSizes = {
            'tiny': '75 МБ',
            'base': '140 МБ',
            'small': '460 МБ'
        };
        
        // Инициализируем хранилище моделей
        if (!window.WhisperModels) {
            window.WhisperModels = new Map();
        }
        
        // Проверяем доступность Transformers.js
        this.checkTransformersJS();
    }
    
    /**
     * Проверяет доступность библиотеки Transformers.js
     */
    checkTransformersJS() {
        // Transformers.js может экспортироваться по-разному
        if (typeof window.pipeline !== 'undefined') {
            console.log('✅ Transformers.js найден через window.pipeline');
            return true;
        }
        
        // Проверяем другие возможные варианты
        if (typeof window.transformers !== 'undefined') {
            console.log('✅ Transformers.js найден через window.transformers');
            return true;
        }
        
        console.warn('⚠️ Transformers.js не найден. Убедитесь, что скрипт загружен.');
        return false;
    }
    
    /**
     * Получает функцию pipeline из Transformers.js
     */
    getPipeline() {
        // Пробуем разные варианты доступа к pipeline
        if (typeof window.pipeline !== 'undefined') {
            return window.pipeline;
        }
        
        if (typeof window.transformers !== 'undefined' && window.transformers.pipeline) {
            return window.transformers.pipeline;
        }
        
        // Если используется ES modules
        if (typeof pipeline !== 'undefined') {
            return pipeline;
        }
        
        throw new Error('Transformers.js pipeline не найден. Проверьте подключение библиотеки.');
    }
    
    /**
     * Проверяет, загружена ли модель для языка
     */
    async isModelCached(languageCode, modelSize = 'base') {
        const modelKey = `whisper_model_${languageCode}_${modelSize}`;
        
        // Проверяем в памяти
        const storedModel = window.WhisperModels?.get?.(modelKey);
        if (storedModel && storedModel.isReady) {
            return true;
        }
        
        // Проверяем в localStorage
        const modelStatus = localStorage.getItem(modelKey);
        return modelStatus === 'downloaded' || modelStatus === 'ready';
    }
    
    /**
     * Загружает модель для языка через Transformers.js
     */
    async loadLanguageModel(languageCode, modelSize = 'base', onProgress = null) {
        const modelKey = `whisper_model_${languageCode}_${modelSize}`;
        
        // Проверяем, есть ли уже модель
        if (await this.isModelCached(languageCode, modelSize)) {
            console.log(`✅ Модель ${languageCode} (${modelSize}) уже загружена`);
            const storedModel = window.WhisperModels?.get?.(modelKey);
            if (storedModel && storedModel.recognizer) {
                return storedModel.recognizer;
            }
        }
        
        // Проверяем доступность Transformers.js
        if (!this.checkTransformersJS()) {
            throw new Error('Библиотека Transformers.js не загружена. Проверьте подключение скрипта.');
        }
        
        console.log(`🚀 Начинаем загрузку модели ${languageCode} (${modelSize}) через Transformers.js...`);
        
        try {
            const pipeline = this.getPipeline();
            const modelName = this.modelNames[modelSize] || this.modelNames.base;
            
            console.log(`📦 Загружаем модель: ${modelName}`);
            
            // Функция для обновления прогресса
            const progressCallback = (progress) => {
                if (onProgress) {
                    // Transformers.js передает объект с полями: status, file, progress, loaded, total
                    // progress может быть уже в диапазоне 0-1 или как процент
                    let normalizedProgress = 0;
                    
                    if (progress.progress !== undefined) {
                        // Если progress уже в диапазоне 0-1
                        normalizedProgress = progress.progress;
                    } else if (progress.loaded !== undefined && progress.total !== undefined && progress.total > 0) {
                        // Рассчитываем из loaded/total
                        normalizedProgress = progress.loaded / progress.total;
                    }
                    
                    // Передаем нормализованный прогресс (0-1)
                    onProgress({ 
                        progress: normalizedProgress, 
                        loaded: progress.loaded,
                        total: progress.total,
                        status: progress.status,
                        file: progress.file
                    });
                }
            };
            
            // Загружаем модель через pipeline
            const recognizer = await pipeline(
                'automatic-speech-recognition',
                modelName,
                {
                    progress_callback: progressCallback
                }
            );
            
            console.log(`✅ Модель ${modelName} успешно загружена`);
            
            // Сохраняем модель
            const modelInfo = {
                recognizer: recognizer,
                langCode: languageCode,
                modelSize: modelSize,
                modelName: modelName,
                isReady: true
            };
            
            window.WhisperModels.set(modelKey, modelInfo);
            localStorage.setItem(modelKey, 'downloaded');
            
            console.log(`✅ Модель ${languageCode} (${modelSize}) готова к использованию`);
            return recognizer;
            
        } catch (error) {
            console.error(`❌ Ошибка загрузки модели ${languageCode}:`, error);
            throw error;
        }
    }
    
    /**
     * Распознает речь из аудио данных
     * @param {AudioBuffer|ArrayBuffer|Blob|string} audioData - Аудио данные для распознавания
     * @param {string} languageCode - Код языка (например, 'ru', 'en', 'sv')
     * @param {string} modelSize - Размер модели ('tiny', 'base', 'small')
     * @param {string} prompt - Опциональный промпт для улучшения распознавания (например, имена из подсказки)
     * @returns {Promise<Object>} Результат распознавания
     */
    async transcribe(audioData, languageCode, modelSize = 'base', prompt = null) {
        const modelKey = `whisper_model_${languageCode}_${modelSize}`;
        const storedModel = window.WhisperModels?.get?.(modelKey);
        
        if (!storedModel || !storedModel.recognizer) {
            throw new Error(`Модель для языка ${languageCode} не загружена. Сначала загрузите модель.`);
        }
        
        const recognizer = storedModel.recognizer;
        
        try {
            // Подготавливаем параметры для распознавания
            const options = {
                language: languageCode.toLowerCase(),
                task: 'transcribe',
                temperature: 0.0  // Для более точного распознавания
            };
            
            // Добавляем промпт, если он передан
            // Transformers.js поддерживает параметр 'prompt' для Whisper моделей
            if (prompt && prompt.trim().length > 0) {
                options.prompt = prompt.trim();
                console.log(`📝 Используем промпт для распознавания: "${options.prompt}"`);
            }
            
            // Преобразуем audioData в формат, который понимает Transformers.js
            // Может быть AudioBuffer, ArrayBuffer, Blob или URL
            const result = await recognizer(audioData, options);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Ошибка распознавания для языка ${languageCode}:`, error);
            throw error;
        }
    }
    
    /**
     * Получает размер модели для отображения
     */
    getModelSizeInfo(modelSize = 'base') {
        return this.modelSizes[modelSize] || 'Неизвестно';
    }
    
    /**
     * Получает имя модели для отображения
     */
    getModelName(modelSize = 'base') {
        return this.modelNames[modelSize] || this.modelNames.base;
    }
}

// Экспортируем глобально
window.WhisperModelManager = WhisperModelManager;
