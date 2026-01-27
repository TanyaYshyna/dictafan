class ModelManager {
    constructor() {
        this.selectedModels = this._loadSelectedModels();
        this.downloadedModels = this._loadDownloadedModels();
        this.downloadListeners = new Map();
    }

    // Загружаем сохраненные выбранные модели
    _loadSelectedModels() {
        try {
            const saved = localStorage.getItem('selected_models');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Error loading selected models:', e);
            return {};
        }
    }

    // Загружаем информацию о скачанных моделях
    _loadDownloadedModels() {
        try {
            const saved = localStorage.getItem('downloaded_models');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Error loading downloaded models:', e);
            return {};
        }
    }

    // Сохраняем выбранные модели
    _saveSelectedModels() {
        try {
            localStorage.setItem('selected_models', JSON.stringify(this.selectedModels));
        } catch (e) {
            console.error('Error saving selected models:', e);
        }
    }

    // Сохраняем информацию о скачанных моделях
    _saveDownloadedModels() {
        try {
            localStorage.setItem('downloaded_models', JSON.stringify(this.downloadedModels));
        } catch (e) {
            console.error('Error saving downloaded models:', e);
        }
    }

    // Получаем модели для языка
    getModels(langCode, modelType = 'whisper') {
        const language = window.LanguageManager._getLanguage(langCode);
        if (!language || !language.models) {
            return [];
        }
        return language.models[modelType] || [];
    }

    // Получаем выбранную модель для языка
    getSelectedModel(langCode, modelType = 'whisper') {
        const key = `${langCode}_${modelType}`;
        return this.selectedModels[key] || null;
    }

    // Устанавливаем выбранную модель
    setSelectedModel(langCode, modelId, modelType = 'whisper') {
        const key = `${langCode}_${modelType}`;
        this.selectedModels[key] = modelId;
        this._saveSelectedModels();
        this._notifyListeners(langCode, modelType);
    }

    // Проверяем, скачана ли модель
    isModelDownloaded(langCode, modelId, modelType = 'whisper') {
        const key = this._getModelKey(langCode, modelId, modelType);
        return !!this.downloadedModels[key];
    }

    // Отмечаем модель как скачанную
    setModelDownloaded(langCode, modelId, modelType = 'whisper', data = {}) {
        const key = this._getModelKey(langCode, modelId, modelType);
        this.downloadedModels[key] = {
            ...data,
            downloadedAt: new Date().toISOString()
        };
        this._saveDownloadedModels();
    }

    // Получаем информацию о скачанной модели
    getDownloadedModelInfo(langCode, modelId, modelType = 'whisper') {
        const key = this._getModelKey(langCode, modelId, modelType);
        return this.downloadedModels[key] || null;
    }

    // Удаляем модель
    removeModel(langCode, modelId, modelType = 'whisper') {
        const key = this._getModelKey(langCode, modelId, modelType);
        delete this.downloadedModels[key];
        this._saveDownloadedModels();
    }

    // Получаем все скачанные модели
    getAllDownloadedModels() {
        return Object.entries(this.downloadedModels).map(([key, data]) => {
            const [langCode, modelId, modelType] = key.split('|');
            return {
                langCode,
                modelId,
                modelType,
                ...data
            };
        });
    }

    // Добавляем слушатель изменений моделей
    addListener(langCode, modelType, callback) {
        const key = `${langCode}_${modelType}`;
        if (!this.downloadListeners.has(key)) {
            this.downloadListeners.set(key, new Set());
        }
        this.downloadListeners.get(key).add(callback);
    }

    // Удаляем слушатель
    removeListener(langCode, modelType, callback) {
        const key = `${langCode}_${modelType}`;
        const listeners = this.downloadListeners.get(key);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                this.downloadListeners.delete(key);
            }
        }
    }

    // Уведомляем слушателей
    _notifyListeners(langCode, modelType) {
        const key = `${langCode}_${modelType}`;
        const listeners = this.downloadListeners.get(key);
        if (listeners) {
            const selectedModel = this.getSelectedModel(langCode, modelType);
            listeners.forEach(callback => {
                try {
                    callback({ langCode, modelType, selectedModel });
                } catch (e) {
                    console.error('Error in model listener:', e);
                }
            });
        }
    }

    // Вспомогательный метод для создания ключа
    _getModelKey(langCode, modelId, modelType) {
        return `${langCode}|${modelId}|${modelType}`;
    }

    // Скачивание модели с прогрессом
    async downloadModel(langCode, modelId, modelType = 'whisper', onProgress = null) {
        const modelKey = this._getModelKey(langCode, modelId, modelType);
        
        try {
            // Получаем информацию о модели
            const models = this.getModels(langCode, modelType);
            const modelInfo = models.find(m => m.id === modelId);
            
            if (!modelInfo) {
                throw new Error(`Model ${modelId} not found for language ${langCode}`);
            }

            // Начинаем загрузку
            if (onProgress) onProgress({ status: 'starting', percent: 0 });

            // Здесь будет логика загрузки модели
            // В зависимости от modelType используем разные эндпоинты
            const endpoint = this._getDownloadEndpoint(langCode, modelId, modelType);
            
            const response = await fetch(endpoint);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            const total = parseInt(contentLength, 10);
            let loaded = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loaded += value.length;

                if (onProgress && total) {
                    const percent = Math.round((loaded / total) * 100);
                    onProgress({ status: 'downloading', loaded, total, percent });
                }
            }

            // Собираем данные
            const blob = new Blob(chunks);
            
            // Сохраняем в IndexedDB
            await this._saveModelToStorage(modelKey, blob);
            
            // Сохраняем метаданные
            this.setModelDownloaded(langCode, modelId, modelType, {
                size: blob.size,
                lastUsed: new Date().toISOString()
            });

            if (onProgress) onProgress({ status: 'complete', percent: 100 });

            return {
                success: true,
                modelKey,
                size: blob.size,
                blob
            };

        } catch (error) {
            console.error('Error downloading model:', error);
            if (onProgress) onProgress({ status: 'error', error: error.message });
            throw error;
        }
    }

    // Получение модели из хранилища
    async getModelBlob(langCode, modelId, modelType = 'whisper') {
        const modelKey = this._getModelKey(langCode, modelId, modelType);
        return await this._getModelFromStorage(modelKey);
    }

    // Вспомогательные методы для работы с хранилищем
    async _saveModelToStorage(key, blob) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ModelStorage', 1);
            
            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('models')) {
                    db.createObjectStore('models');
                }
            };
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['models'], 'readwrite');
                const store = transaction.objectStore('models');
                const putRequest = store.put(blob, key);
                
                putRequest.onsuccess = function() {
                    resolve();
                };
                
                putRequest.onerror = function(event) {
                    reject(event.target.error);
                };
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }

    async _getModelFromStorage(key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ModelStorage', 1);
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['models'], 'readonly');
                const store = transaction.objectStore('models');
                const getRequest = store.get(key);
                
                getRequest.onsuccess = function() {
                    resolve(getRequest.result);
                };
                
                getRequest.onerror = function(event) {
                    reject(event.target.error);
                };
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }

    // Получение URL для загрузки
    _getDownloadEndpoint(langCode, modelId, modelType) {
        if (modelType === 'whisper') {
            return `/api/models/whisper/${langCode}/${modelId}`;
        } else if (modelType === 'tts') {
            return `/api/models/tts/${langCode}/${modelId}`;
        }
        throw new Error(`Unknown model type: ${modelType}`);
    }

    // Получение рекомендуемой модели для языка
    getRecommendedModel(langCode, modelType = 'whisper') {
        const models = this.getModels(langCode, modelType);
        const recommended = models.find(m => m.recommended);
        return recommended || (models.length > 0 ? models[0] : null);
    }

    // Получение размера всех скачанных моделей
    getTotalDownloadedSize() {
        let total = 0;
        Object.values(this.downloadedModels).forEach(model => {
            total += model.size || 0;
        });
        return total;
    }

    // Очистка всех моделей
    clearAllModels() {
        this.downloadedModels = {};
        this._saveDownloadedModels();
        
        // Очищаем IndexedDB
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase('ModelStorage');
            request.onsuccess = resolve;
            request.onerror = reject;
        });
    }
}

// Создаем глобальный экземпляр
window.ModelManager = new ModelManager();