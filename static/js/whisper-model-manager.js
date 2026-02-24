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

    _getModelKey(languageCode, modelSize) {
        return `whisper_model_${languageCode}_${modelSize}`;
    }

    _getAssetsKey(languageCode, modelSize) {
        return `whisper_model_assets_${languageCode}_${modelSize}`;
    }

    _normalizeExternalAssetUrl(rawUrl) {
        try {
            if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
            const u = new URL(rawUrl, window.location.origin);
            // For HF/CDN assets ignore query params, same logic as SW.
            if (u.hostname === 'huggingface.co' || u.hostname === 'cdn.jsdelivr.net') {
                return `${u.origin}${u.pathname}`;
            }
            return u.toString();
        } catch (e) {
            return rawUrl;
        }
    }

    async _isUrlInAnyCache(url) {
        try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
                try {
                    const cache = await caches.open(name);
                    // Try exact, then ignoreSearch fallback.
                    const exact = await cache.match(url);
                    if (exact) return true;
                    const ignoreSearch = await cache.match(url, { ignoreSearch: true });
                    if (ignoreSearch) return true;
                } catch (e) {
                }
            }
        } catch (e) {
        }
        return false;
    }

    async _areModelAssetsCached(languageCode, modelSize) {
        try {
            const assetsKey = this._getAssetsKey(languageCode, modelSize);
            const raw = localStorage.getItem(assetsKey);
            const list = raw ? JSON.parse(raw) : null;
            const urls = Array.isArray(list) ? list.filter(Boolean) : [];
            if (!urls.length) return false;

            for (const u of urls) {
                const normalized = this._normalizeExternalAssetUrl(u);
                const ok = await this._isUrlInAnyCache(normalized);
                if (!ok) return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async _blobToAudioBuffer(blob) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            throw new Error('AudioContext не поддерживается в этом браузере');
        }
        const ac = new AC();
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await ac.decodeAudioData(arrayBuffer);
            try {
                await ac.close();
            } catch (e) {
            }
            return audioBuffer;
        } catch (e) {
            try {
                await ac.close();
            } catch (err) {
            }
            throw e;
        }
    }

    _audioBufferToMonoFloat32(audioBuffer) {
        if (!audioBuffer) return new Float32Array(0);
        const channels = audioBuffer.numberOfChannels || 1;
        const length = audioBuffer.length || 0;
        if (!length) return new Float32Array(0);
        if (channels === 1) {
            return audioBuffer.getChannelData(0);
        }

        const out = new Float32Array(length);
        for (let ch = 0; ch < channels; ch++) {
            const data = audioBuffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                out[i] += data[i];
            }
        }
        for (let i = 0; i < length; i++) {
            out[i] /= channels;
        }
        return out;
    }

    _resampleLinear(input, inputSampleRate, targetSampleRate) {
        const inArr = input instanceof Float32Array ? input : new Float32Array(input || []);
        if (!inArr.length) return new Float32Array(0);
        if (!inputSampleRate || inputSampleRate === targetSampleRate) return inArr;

        const ratio = targetSampleRate / inputSampleRate;
        const outLength = Math.max(1, Math.round(inArr.length * ratio));
        const out = new Float32Array(outLength);
        for (let i = 0; i < outLength; i++) {
            const srcIndex = i / ratio;
            const i0 = Math.floor(srcIndex);
            const i1 = Math.min(i0 + 1, inArr.length - 1);
            const t = srcIndex - i0;
            out[i] = (1 - t) * inArr[i0] + t * inArr[i1];
        }
        return out;
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
        const modelKey = this._getModelKey(languageCode, modelSize);
        
        // Проверяем в памяти
        const storedModel = window.WhisperModels?.get?.(modelKey);
        if (storedModel && storedModel.isReady) {
            return true;
        }
        
        // Проверяем в localStorage
        const modelStatus = localStorage.getItem(modelKey);
        const markedDownloaded = modelStatus === 'downloaded' || modelStatus === 'ready';
        if (!markedDownloaded) return false;

        // Если мы оффлайн — модель считается доступной только если ассеты реально лежат в Cache Storage.
        const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
        if (isOffline) {
            const assetsOk = await this._areModelAssetsCached(languageCode, modelSize);
            if (!assetsOk) {
                // Сбрасываем устаревший флаг, чтобы UI не думал что модель доступна.
                try {
                    localStorage.removeItem(modelKey);
                } catch (e) {
                }
                return false;
            }
        }

        return true;
    }
    
    /**
     * Загружает модель для языка через Transformers.js
     */
    async loadLanguageModel(languageCode, modelSize = 'base', onProgress = null) {
        const modelKey = this._getModelKey(languageCode, modelSize);
        
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
        
        const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
        if (isOffline) {
            const assetsOk = await this._areModelAssetsCached(languageCode, modelSize);
            if (!assetsOk) {
                throw new Error('Оффлайн режим: локальная Whisper модель не найдена в кеше. Загрузите модель онлайн в профиле.');
            }
        }

        console.log(`🚀 Начинаем загрузку модели ${languageCode} (${modelSize}) через Transformers.js...`);
        
        try {
            const pipeline = this.getPipeline();
            const modelName = this.modelNames[modelSize] || this.modelNames.base;
            
            console.log(`📦 Загружаем модель: ${modelName}`);
            
            const seenAssetUrls = new Set();

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

                // Сохраняем URL/пути запрошенных файлов модели, чтобы потом детерминированно
                // проверять наличие ассетов в Cache Storage для оффлайн режима.
                try {
                    const f = progress && progress.file ? String(progress.file) : '';
                    if (f) {
                        // Transformers.js иногда отдает относительные пути; иногда полные URL.
                        // Нам важен финальный URL запроса (для SW cache).
                        const resolved = this._normalizeExternalAssetUrl(f);
                        if (resolved && (resolved.includes('huggingface.co') || resolved.includes('cdn.jsdelivr.net'))) {
                            seenAssetUrls.add(resolved);
                        }
                    }
                } catch (e) {
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

            // Persist asset list for offline verification.
            try {
                const assetsKey = this._getAssetsKey(languageCode, modelSize);
                const arr = Array.from(seenAssetUrls);
                if (arr.length) {
                    localStorage.setItem(assetsKey, JSON.stringify(arr));
                }
            } catch (e) {
            }
            
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
            let audioInput = audioData;
            if (audioData instanceof Blob) {
                const audioBuffer = await this._blobToAudioBuffer(audioData);
                const mono = this._audioBufferToMonoFloat32(audioBuffer);
                const targetSr = 16000;
                audioInput = this._resampleLinear(mono, audioBuffer.sampleRate || targetSr, targetSr);
            }

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
            const result = await recognizer(audioInput, options);
            
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
