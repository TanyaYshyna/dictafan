/**
 * Примеры получения выбранной модели для языка на другой странице
 */

// ============================================
// СПОСОБ 1: Через localStorage (рекомендуемый)
// ============================================

/**
 * Получить выбранную модель для языка
 * @param {string} langCode - код языка (например, 'en', 'ru')
 * @param {string} modelType - тип модели ('whisper' или 'tts')
 * @returns {string|null} - ID выбранной модели или null если не выбрана
 */
function getSelectedModel(langCode, modelType = 'whisper') {
    const key = `selected_model_${langCode}_${modelType}`;
    const value = localStorage.getItem(key);
    
    // Возвращаем null если значение пустое, 'none' или null
    if (!value || value === 'null' || value === 'none') {
        return null;
    }
    
    return value;
}

// Пример использования:
const selectedWhisper = getSelectedModel('en', 'whisper');
const selectedTTS = getSelectedModel('en', 'tts');

console.log('Выбранная Whisper модель для английского:', selectedWhisper);
console.log('Выбранная TTS модель для английского:', selectedTTS);


// ============================================
// СПОСОБ 2: Через ModelManager (если доступен)
// ============================================

/**
 * Получить выбранную модель через ModelManager с fallback на localStorage
 * @param {string} langCode - код языка
 * @param {string} modelType - тип модели ('whisper' или 'tts')
 * @returns {string|null} - ID выбранной модели или null
 */
function getSelectedModelWithFallback(langCode, modelType = 'whisper') {
    // Сначала пробуем через ModelManager
    if (window.ModelManager && typeof window.ModelManager.getSelectedModel === 'function') {
        const modelId = window.ModelManager.getSelectedModel(langCode, modelType);
        if (modelId) {
            return modelId;
        }
    }
    
    // Fallback на localStorage
    const key = `selected_model_${langCode}_${modelType}`;
    const value = localStorage.getItem(key);
    
    if (!value || value === 'null' || value === 'none') {
        return null;
    }
    
    return value;
}

// Пример использования:
const whisperModel = getSelectedModelWithFallback('ru', 'whisper');
const ttsModel = getSelectedModelWithFallback('ru', 'tts');


// ============================================
// СПОСОБ 3: Получить все выбранные модели для языка
// ============================================

/**
 * Получить все выбранные модели для языка (whisper и tts)
 * @param {string} langCode - код языка
 * @returns {Object} - объект с полями whisper и tts
 */
function getAllSelectedModelsForLanguage(langCode) {
    return {
        whisper: getSelectedModel(langCode, 'whisper'),
        tts: getSelectedModel(langCode, 'tts')
    };
}

// Пример использования:
const models = getAllSelectedModelsForLanguage('en');
console.log('Whisper:', models.whisper); // например, 'tiny'
console.log('TTS:', models.tts); // например, 'base' или null


// ============================================
// СПОСОБ 4: Проверка, выбрана ли модель
// ============================================

/**
 * Проверить, выбрана ли модель для языка
 * @param {string} langCode - код языка
 * @param {string} modelType - тип модели ('whisper' или 'tts')
 * @returns {boolean} - true если модель выбрана
 */
function isModelSelected(langCode, modelType = 'whisper') {
    const modelId = getSelectedModel(langCode, modelType);
    return modelId !== null && modelId !== 'none';
}

// Пример использования:
if (isModelSelected('en', 'whisper')) {
    const modelId = getSelectedModel('en', 'whisper');
    console.log('Используем модель:', modelId);
} else {
    console.log('Модель не выбрана, используем по умолчанию');
}


// ============================================
// СПОСОБ 5: Получить полный путь к модели
// ============================================

/**
 * Получить полный путь к модели в формате langCode/modelType/modelId
 * @param {string} langCode - код языка
 * @param {string} modelType - тип модели ('whisper' или 'tts')
 * @returns {string|null} - путь к модели или null
 */
function getModelPath(langCode, modelType = 'whisper') {
    const modelId = getSelectedModel(langCode, modelType);
    if (!modelId) {
        return null;
    }
    return `${langCode}/${modelType}/${modelId}`;
}

// Пример использования:
const whisperPath = getModelPath('en', 'whisper');
// Результат: 'en/whisper/tiny' или null

const ttsPath = getModelPath('en', 'tts');
// Результат: 'en/tts/base' или null


// ============================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ В КОДЕ
// ============================================

// Пример: загрузка модели для диктанта
async function loadModelForDictation(langCode) {
    // Получаем выбранную Whisper модель
    const whisperModelId = getSelectedModel(langCode, 'whisper');
    
    if (!whisperModelId) {
        console.warn(`Модель Whisper не выбрана для языка ${langCode}, используем по умолчанию`);
        // Используем модель по умолчанию
        return null;
    }
    
    // Проверяем, загружена ли модель
    if (window.ModelManager && window.ModelManager.isModelDownloaded) {
        const isDownloaded = window.ModelManager.isModelDownloaded(
            langCode, 
            whisperModelId, 
            'whisper'
        );
        
        if (!isDownloaded) {
            console.warn(`Модель ${langCode}/whisper/${whisperModelId} не загружена`);
            return null;
        }
    }
    
    // Загружаем модель через ModelManager
    if (window.ModelManager && window.ModelManager.getModelBlob) {
        try {
            const blob = await window.ModelManager.getModelBlob(
                langCode, 
                whisperModelId, 
                'whisper'
            );
            return blob;
        } catch (error) {
            console.error('Ошибка загрузки модели:', error);
            return null;
        }
    }
    
    return null;
}

// Использование:
// const modelBlob = await loadModelForDictation('en');

