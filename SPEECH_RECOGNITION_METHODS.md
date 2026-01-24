# Два метода распознавания речи

## 1. Метод через интернет (Web Speech API)

### Инициализация при старте записи
```javascript
// script_dictation.js, строки 3220-3237
if (speechRecognitionMode === 'route') {
    // Только через интернет (Web Speech API - требует интернет)
    console.log('✅ [startRecording] Режим: только через интернет (Web Speech API)');
    initWebSpeechRecognition();
    userAudioAnswer.innerHTML = 'Говорите...';
    if (recognition) {
        try {
            recognition.start(); // Запускаем распознавание параллельно с записью
            console.log('✅ SpeechRecognition started successfully');
        } catch (e) {
            console.error('❌ Ошибка запуска распознавания:', e);
        }
    }
}
```

### Инициализация Web Speech API
```javascript
// script_dictation.js, строки 3676-3750
function initWebSpeechRecognition() {
    // Инициализация Web Speech API
    // ВАЖНО: Web Speech API в Chrome требует интернет - отправляет аудио на серверы Google
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.error('Браузер не поддерживает SpeechRecognition');
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.lang = langCodeUrl; // Например, 'en-US'
    recognition.interimResults = true; // Промежуточные результаты
    recognition.continuous = true; // Непрерывное распознавание
    
    // Обработчик результатов распознавания (работает в реальном времени)
    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Обновляем текст в реальном времени
        srLiveText = finalTranscript + interimTranscript;
        // ... обработка результатов
    };
    
    recognition.onerror = (event) => {
        console.error('Ошибка распознавания:', event.error);
    };
}
```

### Получение результата после остановки записи
```javascript
// script_dictation.js, строки 3513-3518
} else {
    // Используем результаты Web Speech API
    spokenText =
        (srLiveText && srLiveText.trim()) ? srLiveText.trim()
            : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
}
```

---

## 2. Метод локально (Whisper через Transformers.js)

### Инициализация при старте записи
```javascript
// script_dictation.js, строки 3238-3243
} else if (speechRecognitionMode === 'route-off') {
    // Только локально (Whisper) - не запускаем Web Speech API
    // Whisper будет использован в saveRecording при сохранении записи
    console.log('✅ [startRecording] Режим route-off: используем только Whisper, Web Speech API не запускаем');
    userAudioAnswer.innerHTML = 'Говорите... (локально)';
    // НЕ запускаем recognition.start() - используем только Whisper
}
```

### Распознавание после остановки записи
```javascript
// script_dictation.js, строки 3406-3512
if (speechRecognitionMode === 'route-off') {
    // Проверяем наличие модели (в памяти или в localStorage)
    const hasModel = hasWhisperModel(currentLang);
    
    if (!hasModel) {
        // Fallback на Web Speech API результаты (если модель не загружена)
        spokenText = (srLiveText && srLiveText.trim()) ? srLiveText.trim()
            : (recognition && recognition.finalTranscript ? recognition.finalTranscript : '');
    } else {
        // Модель есть - используем Whisper для распознавания
        try {
            // Убеждаемся, что модель загружена в память
            let whisperModel = getWhisperModel(currentLang);
            if (!whisperModel && hasModel) {
                // Модель есть в localStorage, но не в памяти - загружаем её
                const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;
                if (whisperManager) {
                    await whisperManager.loadLanguageModel(currentLang, 'base');
                }
            }
            
            // Генерируем промпт из подсказки (explanation) для улучшения распознавания имен
            const explanation = currentSentence.explanation || '';
            const originalLang = langCodeUrl?.split('-')[0] || 'en';
            const prompt = generateWhisperPrompt(explanation, originalLang);
            // Формат промпта: "имена: имя1, имя2, имя3"
            
            // Используем WhisperModelManager для распознавания с промптом
            const whisperManager = window.WhisperModelManager ? new window.WhisperModelManager() : null;
            const result = await whisperManager.transcribe(
                audioBlob,      // Blob с аудио данными
                currentLang,    // Код языка (например, 'en')
                'base',         // Размер модели
                prompt          // Промпт с именами (опционально)
            );
            
            // Извлекаем текст из результата
            if (result && typeof result === 'object') {
                if (result.text) {
                    spokenText = String(result.text).trim();
                }
                // ... обработка других форматов результата
            }
            
        } catch (error) {
            console.error('❌ Ошибка распознавания через Whisper:', error);
            // Fallback на Web Speech API результаты
        }
    }
}
```

### Метод transcribe в WhisperModelManager
```javascript
// whisper-model-manager.js, строки 182-216
async transcribe(audioData, languageCode, modelSize = 'base', prompt = null) {
    const modelKey = `whisper_model_${languageCode}_${modelSize}`;
    const storedModel = window.WhisperModels?.get?.(modelKey);
    
    if (!storedModel || !storedModel.recognizer) {
        throw new Error(`Модель для языка ${languageCode} не загружена.`);
    }
    
    const recognizer = storedModel.recognizer;
    
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
    
    // Вызываем recognizer с аудио и параметрами
    const result = await recognizer(audioData, options);
    
    return result; // Формат: { text: "распознанный текст", chunks: [...] }
}
```

---

## Ключевые различия

| Характеристика | Web Speech API (интернет) | Whisper (локально) |
|----------------|---------------------------|-------------------|
| **Когда запускается** | Параллельно с записью (`recognition.start()`) | После остановки записи (`saveRecording`) |
| **Результаты** | В реальном времени (`onresult` событие) | После обработки всего аудио |
| **Требует интернет** | Да (в Chrome) | Нет |
| **Промпт для имен** | Не поддерживается | Поддерживается через параметр `prompt` |
| **Библиотека** | Встроенная в браузер | Transformers.js (Xenova/whisper-base) |
| **Формат аудио** | Потоковое (stream) | Blob (готовый файл) |

---

## Генерация промпта для Whisper

```javascript
// script_dictation.js, функции extractNamesFromHint и generateWhisperPrompt

// Извлекает все слова из explanation (независимо от регистра)
function extractNamesFromHint(explanation, langCode = 'en') {
    const trimmed = explanation.trim();
    const words = trimmed.split(/[\s,\-:;()]+/)
        .map(word => word.trim())
        .filter(word => word.length >= 2 && word.length <= 30);
    return words;
}

// Генерирует промпт в формате "имена: слово1, слово2, слово3"
function generateWhisperPrompt(explanation, langCode = 'en') {
    const names = extractNamesFromHint(explanation, langCode);
    if (names.length === 0) {
        return null;
    }
    return `имена: ${names.join(', ')}`;
}
```

---

# Проблемы и решения (от дипсика)

## 🎯 Проблема 1: Задержка в Web Speech API (интернет-режим)

**Наблюдения:**
- 2-3 секунды задержки в начале
- Переписывает текст несколько раз
- Проценты скачут (80% → падает → не принимается)

**Причины:**
- Web Speech API отправляет аудио на серверы Google
- Сеть добавляет задержку
- Модель Google пересматривает гипотезы по мере получения большего контекста

**Решение: "Гибридный" интернет-режим**
```javascript
// Улучшенный обработчик результатов Web Speech API
let lastUpdateTime = 0;
let lastStableResult = '';
let stabilityTimer = null;

recognition.onresult = (event) => {
    const now = Date.now();
    
    // Ограничиваем частоту обновлений (не чаще 300ms)
    if (now - lastUpdateTime < 300) return;
    lastUpdateTime = now;
    
    // Берем только самый уверенный результат
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
        } else {
            interimTranscript += transcript;
        }
    }
    
    const currentResult = finalTranscript + interimTranscript;
    
    // Проверяем стабильность (результат не менялся 500ms)
    if (stabilityTimer) {
        clearTimeout(stabilityTimer);
    }
    
    stabilityTimer = setTimeout(() => {
        // Результат стабилен - обновляем только если существенно изменился
        if (this.isSignificantChange(currentResult, lastStableResult)) {
            lastStableResult = currentResult;
            srLiveText = currentResult;
            updateDisplay();
        }
    }, 500); // Минимальное время стабильности
};

function isSignificantChange(newText, oldText) {
    // Изменение считается значимым если:
    // 1. Добавлено/удалено более 2 слов
    // 2. Изменено более 30% текста
    const newWords = newText.trim().split(/\s+/);
    const oldWords = oldText.trim().split(/\s+/);
    
    if (Math.abs(newWords.length - oldWords.length) > 2) {
        return true;
    }
    
    // Простое сравнение по словам
    const commonWords = newWords.filter(w => oldWords.includes(w)).length;
    const similarity = commonWords / Math.max(newWords.length, oldWords.length);
    
    return similarity < 0.7; // Менее 70% совпадения = значимое изменение
}
```

---

## 🎯 Проблема 2: Неудобство локального режима (запись→ожидание→результат)

**Проблема:** Пользователь привык к immediate feedback, а локальный режим требует остановки записи перед распознаванием.

**Решение: Симуляция real-time в локальном режиме**

```javascript
// Улучшенный saveRecording для локального режима
async function saveRecording(cause = undefined) {
    // ... существующий код ...
    
    if (speechRecognitionMode === 'route-off') {
        // Показываем интерактивный процесс вместо молчаливого ожидания
        const processingHTML = `
            <div class="processing-animation">
                <div class="dots-animation">
                    <span>.</span><span>.</span><span>.</span>
                </div>
                <div class="processing-text">Обработка аудио</div>
                <div class="progress-container">
                    <div class="progress-bar" id="whisper-progress"></div>
                </div>
            </div>
        `;
        userAudioAnswer.innerHTML = processingHTML;
        
        // Запускаем анимацию прогресса
        animateProgressBar('whisper-progress', 2000); // 2 секунды анимации
        
        try {
            // Распознаем в фоне
            const result = await recognizeWithWhisper(audioBlob, prompt);
            
            // Постепенно показываем результат (анимация печати)
            await typeTextAnimated(result.text, {
                container: userAudioAnswer,
                speed: 50, // мс на символ
                onComplete: () => {
                    userAudioAnswer.innerHTML += '<div class="success-indicator">✅ Готово!</div>';
                }
            });
            
            spokenText = result.text;
        } catch (error) {
            userAudioAnswer.innerHTML = `<div class="error">Ошибка распознавания: ${error.message}</div>`;
        }
    }
}

// Анимация прогресс-бара
function animateProgressBar(elementId, duration) {
    const progressBar = document.getElementById(elementId);
    if (!progressBar) return;
    
    let start = 0;
    const end = 100;
    const increment = 100 / (duration / 50); // Обновляем каждые 50ms
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
            start = end;
            clearInterval(timer);
        }
        progressBar.style.width = start + '%';
    }, 50);
}

// Анимация печати текста
async function typeTextAnimated(text, options = {}) {
    const container = options.container || userAudioAnswer;
    const speed = options.speed || 50;
    const onComplete = options.onComplete || (() => {});
    
    // Очищаем контейнер от анимации прогресса
    container.innerHTML = '<div class="result-text"></div>';
    const resultDiv = container.querySelector('.result-text');
    
    for (let i = 0; i < text.length; i++) {
        resultDiv.textContent = text.substring(0, i + 1);
        await new Promise(resolve => setTimeout(resolve, speed));
    }
    
    onComplete();
}
```

---

## 💡 Единый интерфейс для обоих режимов

```javascript
// Общий класс для унификации поведения
class UnifiedSpeechRecognition {
    constructor(mode) {
        this.mode = mode; // 'route' (интернет) или 'route-off' (локально)
        this.isRecording = false;
        this.displayText = '';
    }
    
    async start() {
        this.isRecording = true;
        this.displayText = '';
        
        // Общий UI для обоих режимов
        this.showUI("Говорите...");
        this.showVisualFeedback(true);
        
        if (this.mode === 'route') {
            this.startWebSpeech();
        } else {
            this.startLocalWithFeedback();
        }
    }
    
    async stop() {
        this.isRecording = false;
        
        if (this.mode === 'route') {
            return this.getWebSpeechResult();
        } else {
            return await this.processLocalWithAnimation();
        }
    }
    
    showUI(message) {
        // Единый интерфейс для обоих режимов
        userAudioAnswer.innerHTML = `
            <div class="recording-feedback ${this.mode}">
                <div class="sound-waves"></div>
                <div class="status-text">${message}</div>
                ${this.mode === 'route' 
                    ? '<div class="live-text" id="live-text"></div>' 
                    : '<div class="hint">Результат появится после остановки</div>'}
            </div>
        `;
    }
    
    async processLocalWithAnimation() {
        // Показываем прогресс обработки
        this.showUI("Обработка...");
        this.showProgress(0);
        
        // Загружаем модель если нужно
        if (!this.modelInMemory) {
            this.showMessage("Загрузка модели...");
            await this.loadModel();
        }
        
        // Распознаем
        this.showProgress(50);
        const result = await this.recognizeLocally();
        
        // Постепенно показываем результат
        this.showProgress(100);
        await this.typeResultAnimated(result);
        
        return result;
    }
}
```

---

## 🔧 Конкретные улучшения для текущего кода

### Для интернет-режима (уменьшить задержку):

```javascript
// В initWebSpeechRecognition():
recognition.continuous = true;
recognition.interimResults = true;
recognition.maxAlternatives = 1; // Уменьшает нагрузку

// Добавить фильтрацию обновлений
let lastUpdateTime = 0;
let lastStableResult = '';
let stabilityTimer = null;

recognition.onresult = (event) => {
    const now = Date.now();
    
    // Ограничиваем частоту обновлений (не чаще 300ms)
    if (now - lastUpdateTime < 300) return;
    lastUpdateTime = now;
    
    // ... обработка результатов ...
    
    // Проверка стабильности перед обновлением
    if (stabilityTimer) clearTimeout(stabilityTimer);
    
    stabilityTimer = setTimeout(() => {
        if (isSignificantChange(currentResult, lastStableResult)) {
            lastStableResult = currentResult;
            updateDisplay();
        }
    }, 500); // 500ms минимальная стабильность
};
```

### Для локального режима (имитация real-time):

```javascript
// В saveRecording() для route-off:
if (speechRecognitionMode === 'route-off') {
    // Показываем интерактивный процесс
    showProcessingAnimation();
    
    // Запускаем анимацию прогресса
    animateProgressBar('whisper-progress', 2000);
    
    // Распознаем в фоне
    const result = await recognizeWithWhisper(audioBlob, prompt);
    
    // Постепенно показываем результат
    await typeTextAnimated(result.text);
}
```

---

## 🎮 Визуальные улучшения

### CSS для анимаций:

```css
/* Анимация точек загрузки */
.dots-animation {
    display: inline-flex;
    gap: 4px;
}

.dots-animation span {
    animation: dot-bounce 1.4s infinite;
    animation-delay: calc(var(--i) * 0.2s);
}

@keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
    40% { transform: translateY(-10px); opacity: 1; }
}

/* Прогресс-бар */
.progress-container {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 10px;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #8b5cf6, #a78bfa);
    width: 0%;
    transition: width 0.1s ease;
    border-radius: 2px;
}

/* Анимация звуковых волн */
.sound-waves {
    display: flex;
    gap: 3px;
    align-items: center;
    height: 20px;
}

.sound-waves::before,
.sound-waves::after {
    content: '';
    width: 3px;
    background: #8b5cf6;
    border-radius: 2px;
    animation: wave 1s ease-in-out infinite;
}

.sound-waves::before {
    animation-delay: 0s;
    height: 10px;
}

.sound-waves::after {
    animation-delay: 0.3s;
    height: 15px;
}

@keyframes wave {
    0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
    50% { transform: scaleY(1); opacity: 1; }
}
```

---

## 💭 Рекомендации дипсика

1. **Сохрани текущий интернет-режим**, но улучши стабильность:
   - Добавь минимальное время стабильности (500ms)
   - Ограничь частоту обновлений (300ms)
   - Фильтруй мелкие изменения

2. **Для локального режима сделай "иллюзию" real-time**:
   - Показывай прогресс-бар при обработке
   - Выводи результат постепенно (анимация печати)
   - Используй те же визуальные элементы что в интернет-режиме

3. **Единый интерфейс** для обоих режимов - пользователь не должен чувствовать разницу в UX

