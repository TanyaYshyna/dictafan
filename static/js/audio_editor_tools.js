/**
 * audio_editor_tools.js
 * 
 * Модуль для работы с аудио в редакторе диктантов.
 * Содержит функции обрезки (trim) и нарезки (split) аудиофайлов,
 * а также "Умную нарезку" с использованием Whisper word timestamps.
 * 
 * Зависимости:
 *   - script_dictation_editor.js (глобальные переменные: currentDictation, workingData,
 *     currentAudioFileName, startInput, endInput, waveformCanvas)
 *   - whisper-model-manager.js (window.WhisperModelManager)
 *   - audio_manager.js (window.audioManager)
 */

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получить blob URL аудио из draft cache для указанного языка и имени файла.
 * Если файл не найден в draft cache, возвращает null.
 */
function _getAudioUrl(filename, language) {
    if (typeof getDraftAudioUrl === 'function') {
        const url = getDraftAudioUrl(language, filename);
        if (url) return url;
    }
    return null;
}

/**
 * Получить путь к аудио (для обратной совместимости — теперь возвращает blob URL или null)
 */
function _getAudioPath(language) {
    // В новой схеме нет "пути" на сервере — аудио живёт только в blob.
    // Возвращаем пустую строку, чтобы сломать старый код, который пытается использовать temp-путь.
    console.warn('⚠️ _getAudioPath устарел — используйте _getAudioUrl или getDraftAudioUrl');
    return '';
}

/**
 * Показать индикатор загрузки
 */
function _showLoading(message) {
    if (typeof showLoadingIndicator === 'function') {
        showLoadingIndicator(message);
    }
}

/**
 * Скрыть индикатор загрузки
 */
function _hideLoading() {
    if (typeof hideLoadingIndicator === 'function') {
        hideLoadingIndicator();
    }
}

/**
 * Обновить иконки lucide после изменения DOM
 */
function _refreshLucideIcons() {
    try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (e) {
        // игнорируем
    }
}

// ============================================================================
// ФУНКЦИИ ОБРЕЗКИ АУДИО (TRIM)
// ============================================================================

/**
 * Получить информацию о текущем аудиофайле для обрезки
 * @returns {{filename: string, blobUrl: string|null, file: File|null}|null}
 */
function getCurrentAudioFileForScissors() {
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    if (!audioMode || audioMode.value !== 'full') {
        console.log('❌ Режим "отображать весь файл" не активен');
        return null;
    }

    const filename = currentAudioFileName;
    if (!filename) {
        console.error('❌ Имя файла не найдено');
        return null;
    }

    // Получаем blob URL из draft cache
    const blobUrl = _getAudioUrl(filename, currentDictation.language_original);

    return {
        filename: filename,
        blobUrl: blobUrl,
        file: null
    };
}

/**
 * Обрезать аудиофайл ножницами (вызов серверного /cut-audio)
 * Использует draft-mode: отправляет blob как base64, получает результат как base64.
 * @param {string} audioFileName - имя файла
 * @param {number} startTime - время начала в секундах
 * @param {number} endTime - время окончания в секундах
 */
async function trimAudioFile(audioFileName, startTime, endTime) {
    _showLoading('Обрезание аудиофайла...');

    try {
        // Получаем blob из draft cache
        const blobUrl = _getAudioUrl(audioFileName, currentDictation.language_original);
        if (!blobUrl) {
            throw new Error(`Аудиофайл "${audioFileName}" не найден в draft cache`);
        }

        // Конвертируем blob в base64
        const resp = await fetch(blobUrl);
        const blob = await resp.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const audioB64 = btoa(binary);

        const response = await fetch('/cut-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: audioFileName,
                audio_b64: audioB64,
                mime: blob.type || 'audio/mpeg',
                start_time: startTime,
                end_time: endTime,
                language: currentDictation.language_original,
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            // Сервер вернул обрезанный файл как audio_b64 — сохраняем в draft cache
            if (data.audio_b64) {
                const binaryOut = atob(data.audio_b64);
                const outBytes = new Uint8Array(binaryOut.length);
                for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                const outBlob = new Blob([outBytes], { type: data.mime || blob.type || 'audio/mpeg' });

                if (typeof putDraftAudioToCache === 'function') {
                    await putDraftAudioToCache(
                        currentDictation.id,
                        currentDictation.language_original,
                        audioFileName,
                        outBlob,
                        data.mime || blob.type || 'audio/mpeg'
                    );
                }

                // Обновляем waveform из blob URL
                const newBlobUrl = _getAudioUrl(audioFileName, currentDictation.language_original);
                if (newBlobUrl && typeof loadWaveformForFile === 'function') {
                    loadWaveformForFile(newBlobUrl);
                }
            }

            // Приводим все кнопки воспроизведения к состоянию ready (play)
            try {
                document.querySelectorAll('.audio-btn.audio-btn-table').forEach(btn => {
                    btn.dataset.state = 'ready';
                    btn.innerHTML = '<i data-lucide="play"></i>';
                });
                _refreshLucideIcons();
            } catch (e) {
                console.warn('⚠️ Не удалось обновить состояние кнопок после обрезки:', e);
            }
        } else {
            console.error('❌ Ошибка обрезания аудио:', data.error);
            alert('Ошибка обрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка обрезания аудио:', error);
        alert('Ошибка обрезания аудио: ' + error.message);
    } finally {
        _hideLoading();
    }
}

/**
 * Обработчик кнопки ножниц в режиме "Отображать весь файл"
 */
function handleScissorsFullMode() {
    const start = parseFloat(startInput.value) || 0;
    const end = parseFloat(endInput.value) || 0;

    if (start >= end) {
        alert('Время начала должно быть меньше времени окончания');
        return;
    }

    if (!currentAudioFileName) {
        alert('Не выбран аудиофайл для обрезки');
        return;
    }

    trimAudioFile(currentAudioFileName, start, end);
}

/**
 * Обрезать аудиофайл для конкретной строки таблицы
 * Использует draft-mode: отправляет blob как base64, получает результат как base64.
 * @param {HTMLElement} row - строка таблицы
 */
function cutAudioFile(row) {
    const filename = row.dataset.filename;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    _showLoading('Обрезание аудиофайла...');

    (async () => {
        try {
            // Получаем blob из draft cache
            const lang = row.dataset.language || currentDictation.language_original;
            const blobUrl = _getAudioUrl(filename, lang);
            if (!blobUrl) {
                throw new Error(`Аудиофайл "${filename}" не найден в draft cache`);
            }

            // Конвертируем blob в base64
            const resp = await fetch(blobUrl);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const audioB64 = btoa(binary);

            const payload = {
                filename: filename,
                audio_b64: audioB64,
                mime: blob.type || 'audio/mpeg',
                start_time: startTime,
                end_time: endTime,
                language: lang,
                dictation_id: currentDictation.id
            };

            const response = await fetch('/cut-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            _hideLoading();

            if (!data.success) {
                console.error('❌ Ошибка обрезания аудио:', data.error);
                alert('Ошибка обрезания аудио: ' + (data.error || 'Неизвестная ошибка'));
                return;
            }

            // Сервер вернул обрезанный файл как audio_b64 — сохраняем в draft cache
            if (data.audio_b64) {
                const binaryOut = atob(data.audio_b64);
                const outBytes = new Uint8Array(binaryOut.length);
                for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                const outBlob = new Blob([outBytes], { type: data.mime || blob.type || 'audio/mpeg' });

                if (typeof putDraftAudioToCache === 'function') {
                    await putDraftAudioToCache(
                        currentDictation.id,
                        lang,
                        filename,
                        outBlob,
                        data.mime || blob.type || 'audio/mpeg'
                    );
                }
            }

            // Обновляем данные в строке
            const audioField = row.querySelector('.audio-field');
            if (audioField) {
                audioField.value = data.filename || filename;
            }

            if (typeof rebuildSentencesTable === 'function') {
                rebuildSentencesTable();
            } else if (typeof updateTableWithNewAudio === 'function') {
                updateTableWithNewAudio();
            }

            if (typeof setDirtyFlags === 'function') {
                setDirtyFlags({ audio: true });
            }
            if (typeof markAsUnsaved === 'function') {
                markAsUnsaved();
            }
        } catch (error) {
            _hideLoading();
            console.error('❌ Ошибка обрезания аудио:', error);
            alert('Ошибка обрезания аудио');
        }
    })();
}

/**
 * Обработчик кнопки Start — установить время начала из playhead
 */
function handleAudioStart() {
    const wf = window.waveformCanvas;
    if (!wf) {
        console.log('❌ Волна не загружена');
        return;
    }

    const currentTime = wf.getCurrentTime();
    if (startInput) {
        startInput.value = currentTime.toFixed(2);
    }

    const currentRegion = wf.getRegion();
    if (typeof setupWaveformRegionCallback === 'function') {
        setupWaveformRegionCallback();
    }
    wf.setRegion(currentTime, currentRegion.end);
}

/**
 * Обработчик кнопки End — установить время окончания из playhead
 */
function handleAudioEnd() {
    const wf = window.waveformCanvas;
    if (!wf) {
        console.log('❌ Волна не загружена');
        return;
    }

    const currentTime = wf.getCurrentTime();
    const endTimeInput = document.getElementById('audioEndTime');
    if (endTimeInput) {
        endTimeInput.value = currentTime.toFixed(2);
    }

    const currentRegion = wf.getRegion();
    if (typeof setupWaveformRegionCallback === 'function') {
        setupWaveformRegionCallback();
    }
    wf.setRegion(currentRegion.start, currentTime);
}

// ============================================================================
// ФУНКЦИИ НАРЕЗКИ АУДИО (SPLIT)
// ============================================================================

/**
 * Разрезать аудио на предложения (равными частями) — "на 1000 кусков"
 * Вызывает серверный /split-audio в draft-mode (audio_b64)
 */
async function splitAudioIntoSentences() {
    console.log('✂️✂️✂️✂️✂️3✂️ Текущий аудиофайл:', currentAudioFileName);

    if (!workingData || !workingData.original || !workingData.original.sentences) {
        alert('Нет предложений для разрезания');
        return;
    }

    const sentences = workingData.original.sentences.filter(s => s.key !== 'metadata');
    if (sentences.length === 0) {
        alert('Нет предложений для разрезания');
        return;
    }

    const wf = window.waveformCanvas;
    if (!wf) {
        alert('Волна не загружена');
        return;
    }

    const totalDuration = wf.getDuration();
    const segmentDuration = totalDuration / sentences.length;

    console.log(`📊 Разрезаем ${totalDuration.toFixed(2)}с на ${sentences.length} частей по ${segmentDuration.toFixed(2)}с`);

    _showLoading('Разрезание аудио на предложения...');

    try {
        // Рассчитываем все концы интервалов
        const endTimes = [];
        let currentEndTime = 0;
        for (let i = 0; i < sentences.length; i++) {
            const rawEndTime = currentEndTime + segmentDuration;
            const endTime = Math.floor(rawEndTime * 100) / 100;
            endTimes.push(endTime);
            currentEndTime = endTime;
        }

        console.log(`📊 Рассчитанные концы интервалов:`, endTimes.map(t => t.toFixed(2)).join(', '));

        // Обновляем данные предложений
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const startTime = i === 0 ? 0 : endTimes[i - 1];
            const endTime = endTimes[i];

            const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === sentence.key);
            if (sentenceIndex !== -1) {
                workingData.original.sentences[sentenceIndex].start = startTime;
                workingData.original.sentences[sentenceIndex].end = endTime;
                workingData.original.sentences[sentenceIndex].chain = true;
                workingData.original.sentences[sentenceIndex].audio_user = `${sentence.key}_${currentDictation.language_original}_user.mp3`;
            }

            // Обновляем данные во всех переводах
            try {
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const bucket = workingData.translations[k];
                        if (!bucket || !Array.isArray(bucket.sentences)) continue;
                        const idx = bucket.sentences.findIndex(s => s && s.key === sentence.key);
                        if (idx === -1) continue;
                        bucket.sentences[idx].start = startTime;
                        bucket.sentences[idx].end = endTime;
                        bucket.sentences[idx].chain = true;
                        bucket.sentences[idx].audio_user = `${sentence.key}_${normalizeLangCode(bucket.language)}_user.mp3`;
                    }
                }
            } catch (e) {
                // игнорируем
            }
        }

        // Получаем blob из draft cache и конвертируем в base64
        const blobUrl = _getAudioUrl(currentAudioFileName, currentDictation.language_original);
        if (!blobUrl) {
            throw new Error(`Аудиофайл "${currentAudioFileName}" не найден в draft cache`);
        }
        const resp = await fetch(blobUrl);
        const blob = await resp.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const audioB64 = btoa(binary);

        // Отправляем запрос на сервер для разрезания аудио (draft-mode)
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: currentAudioFileName,
                audio_b64: audioB64,
                mime: blob.type || 'audio/mpeg',
                sentences: sentences.map(s => ({
                    key: s.key,
                    start_time: workingData.original.sentences.find(ws => ws.key === s.key)?.start || 0,
                    end_time: workingData.original.sentences.find(ws => ws.key === s.key)?.end || 0,
                    language: currentDictation.language_original
                })),
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            // Сохраняем полученные сегменты в draft cache
            if (Array.isArray(data.files)) {
                for (const f of data.files) {
                    if (!f || !f.filename || !f.audio_b64) continue;
                    try {
                        const binaryOut = atob(f.audio_b64);
                        const outBytes = new Uint8Array(binaryOut.length);
                        for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                        const outBlob = new Blob([outBytes], { type: f.mime || 'audio/mpeg' });
                        if (typeof putDraftAudioToCache === 'function') {
                            await putDraftAudioToCache(
                                currentDictation.id,
                                currentDictation.language_original,
                                f.filename,
                                outBlob,
                                f.mime || 'audio/mpeg'
                            );
                        }
                    } catch (e) {
                        console.warn('⚠️ не удалось сохранить segment blob:', e);
                    }
                }
            }

            if (typeof updateTableWithNewAudio === 'function') {
                updateTableWithNewAudio();
            }
            if (typeof switchToSentenceMode === 'function') {
                switchToSentenceMode();
            }
        } else {
            console.error('❌ Ошибка разрезания аудио:', data.error);
            alert('Ошибка разрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка разрезания аудио:', error);
        alert('Ошибка разрезания аудио: ' + error.message);
    } finally {
        _hideLoading();
    }
}

/**
 * Разрезать аудио на предложения (построчная версия, из таблицы)
 * Использует draft-mode: отправляет blob как base64, получает результат как base64.
 * @param {HTMLElement} row - строка таблицы
 */
function splitAudioIntoSeentences(row) {
    const filename = row.dataset.filename;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    _showLoading('Разрезание аудио на предложения...');

    (async () => {
        try {
            const sentences = (workingData?.original?.sentences || []).map(s => ({
                key: s.key,
                start_time: Number(s.start) || 0,
                end_time: Number(s.end) || 0,
                language: currentDictation.language_original
            })).filter(s => s.key && s.end_time > s.start_time);

            // Получаем blob из draft cache
            const lang = row.dataset.language || currentDictation.language_original;
            const blobUrl = _getAudioUrl(filename, lang);
            if (!blobUrl) {
                throw new Error(`Аудиофайл "${filename}" не найден в draft cache`);
            }
            const resp = await fetch(blobUrl);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const audioB64 = btoa(binary);

            const payload = {
                filename: filename,
                audio_b64: audioB64,
                mime: blob.type || 'audio/mpeg',
                dictation_id: currentDictation.id,
                sentences: sentences
            };

            const response = await fetch('/split-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            _hideLoading();

            if (!data.success) {
                console.error('❌ Ошибка разрезания аудио:', data.error);
                alert('Ошибка разрезания аудио: ' + (data.error || 'Неизвестная ошибка'));
                return;
            }

            // Receive base64 segments and keep them in memory (blob URLs) until Save.
            if (Array.isArray(data.files)) {
                for (const f of data.files) {
                    if (!f || !f.filename || !f.audio_b64) continue;
                    try {
                        const binaryOut = atob(f.audio_b64);
                        const outBytes = new Uint8Array(binaryOut.length);
                        for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                        const outBlob = new Blob([outBytes], { type: f.mime || 'audio/mpeg' });
                        if (typeof putDraftAudioToCache === 'function') {
                            await putDraftAudioToCache(currentDictation.id, currentDictation.language_original, f.filename, outBlob, f.mime || 'audio/mpeg');
                        }

                        const sentence = workingData.original.sentences.find(s => s.key === f.key);
                        if (sentence) {
                            sentence.audio_user = f.filename;
                        }
                    } catch (e) {
                        console.warn('⚠️ не удалось сохранить segment blob:', e);
                    }
                }

                if (typeof rebuildSentencesTable === 'function') {
                    rebuildSentencesTable();
                }
                if (typeof setDirtyFlags === 'function') {
                    setDirtyFlags({ audio: true });
                }
                if (typeof markAsUnsaved === 'function') {
                    markAsUnsaved();
                }
            }
        } catch (error) {
            _hideLoading();
            console.error('❌ Ошибка разрезания аудио:', error);
            alert('Ошибка разрезания аудио');
        }
    })();
}

// ============================================================================
// УМНАЯ НАРЕЗКА (SMART SPLIT) — с использованием Whisper word timestamps
// ============================================================================

/**
 * "Умная нарезка" аудио на предложения.
 * 
 * Алгоритм:
 * 1. Загружаем аудиофайл
 * 2. Прогоняем через Whisper с опцией return_timestamps: true
 * 3. Получаем массив слов с временными метками (word_timestamps)
 * 4. Группируем слова в предложения на основе текста existing sentences
 * 5. Устанавливаем start/end для каждого предложения на основе word timestamps
 * 6. Вызываем серверный /split-audio с новыми временными метками
 */
async function smartSplitAudio() {
    if (!currentAudioFileName) {
        alert('Не выбран аудиофайл для нарезки');
        return;
    }

    if (!workingData || !workingData.original || !workingData.original.sentences) {
        alert('Нет предложений для разрезания');
        return;
    }

    const sentences = workingData.original.sentences.filter(s => s.key !== 'metadata');
    if (sentences.length === 0) {
        alert('Нет предложений для разрезания');
        return;
    }

    // Проверяем, загружена ли Whisper модель
    if (!window.WhisperModelManager) {
        alert('Модуль Whisper не загружен. Пожалуйста, обновите страницу.');
        return;
    }

    const whisperManager = window.WhisperModelManager;
    const langCode = currentDictation.language_original;

    // Проверяем, загружена ли модель для этого языка
    const modelKey = whisperManager._getModelKey(langCode, 'base');
    const storedModel = window.WhisperModels?.get?.(modelKey);

    if (!storedModel || !storedModel.recognizer) {
        alert(`Модель Whisper для языка "${langCode}" не загружена. Пожалуйста, загрузите модель на вкладке аудио.`);
        return;
    }

    _showLoading('🎤 Умная нарезка: распознавание аудио через Whisper...');

    try {
        // 1. Получаем аудиофайл как Blob из draft cache
        const draftUrl = typeof getDraftAudioUrl === 'function'
            ? getDraftAudioUrl(currentDictation.language_original, currentAudioFileName)
            : null;
        if (!draftUrl) {
            throw new Error(`Аудиофайл "${currentAudioFileName}" не найден в draft cache`);
        }
        const resp = await fetch(draftUrl);
        if (!resp.ok) {
            throw new Error(`Не удалось загрузить аудиофайл из draft cache: ${currentAudioFileName}`);
        }
        const audioBlob = await resp.blob();

        console.log(`🎤 Загружен аудиофайл: ${audioBlob.size} байт`);

        // 2. Прогоняем через Whisper с return_timestamps: true
        const recognizer = storedModel.recognizer;
        
        // Подготавливаем аудио в нужном формате
        let audioInput = audioBlob;
        if (audioBlob instanceof Blob) {
            const audioBuffer = await whisperManager._blobToAudioBuffer(audioBlob);
            const mono = whisperManager._audioBufferToMonoFloat32(audioBuffer);
            const targetSr = 16000;
            audioInput = whisperManager._resampleLinear(mono, audioBuffer.sampleRate || targetSr, targetSr);
        }

        // Запускаем распознавание с return_timestamps: true для получения word-level timestamps
        const result = await recognizer(audioInput, {
            language: langCode.toLowerCase(),
            task: 'transcribe',
            temperature: 0.0,
            return_timestamps: true  // Ключевой параметр — включает word timestamps
        });

        console.log('🎤 Результат Whisper:', result);

        // 3. Извлекаем chunks с временными метками
        // Transformers.js возвращает result.chunks — массив {text, timestamp: [start, end]}
        let wordTimestamps = [];
        
        if (result && Array.isArray(result.chunks)) {
            // Transformers.js формат: chunks = [{text: "Hello", timestamps: [0.0, 0.5]}, ...]
            wordTimestamps = result.chunks.map(chunk => ({
                text: chunk.text?.trim() || '',
                start: Array.isArray(chunk.timestamps) ? chunk.timestamps[0] : 0,
                end: Array.isArray(chunk.timestamps) ? chunk.timestamps[1] : 0
            })).filter(w => w.text.length > 0);
        } else if (result && typeof result === 'object' && result.text) {
            // Fallback: если chunks нет, но есть текст — пытаемся извлечь из других полей
            console.warn('⚠️ Whisper не вернул chunks с таймстемпами, ищем альтернативные поля');
            
            // Некоторые модели возвращают segments вместо chunks
            if (Array.isArray(result.segments)) {
                wordTimestamps = result.segments.flatMap(seg => {
                    if (Array.isArray(seg.words)) {
                        return seg.words.map(w => ({
                            text: (w.text || w.word || '').trim(),
                            start: w.start || w.start_time || 0,
                            end: w.end || w.end_time || 0
                        }));
                    }
                    return [];
                }).filter(w => w.text.length > 0);
            }
        }

        console.log(`🎤 Получено ${wordTimestamps.length} слов с таймстемпами:`, wordTimestamps.slice(0, 10));

        if (wordTimestamps.length === 0) {
            // Если не удалось получить word timestamps, используем равномерное разбиение как fallback
            console.warn('⚠️ Word timestamps не получены, используем равномерное разбиение');
            _hideLoading();
            await splitAudioIntoSentences();
            return;
        }

        // 4. Группируем слова в предложения
        // Для каждого предложения из workingData ищем его текст в word timestamps
        const sentenceTimestamps = [];
        let currentWordIndex = 0;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const sentenceText = (sentence.text || '').toLowerCase().trim();
            
            if (!sentenceText) {
                sentenceTimestamps.push({ key: sentence.key, start: 0, end: 0 });
                continue;
            }

            // Разбиваем предложение на слова для более точного поиска
            const sentenceWords = sentenceText.split(/\s+/).filter(w => w.length > 0);
            
            if (sentenceWords.length === 0) {
                sentenceTimestamps.push({ key: sentence.key, start: 0, end: 0 });
                continue;
            }

            // Ищем последовательность слов из предложения в wordTimestamps
            let matchStartIdx = -1;
            let matchEndIdx = -1;
            
            for (let j = currentWordIndex; j < wordTimestamps.length; j++) {
                const wordText = wordTimestamps[j].text.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
                const searchWord = sentenceWords[0].toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
                
                if (wordText === searchWord || wordText.includes(searchWord) || searchWord.includes(wordText)) {
                    // Нашли первое слово — проверяем остальные
                    let matchLen = 1;
                    for (let k = 1; k < sentenceWords.length && j + k < wordTimestamps.length; k++) {
                        const nextWordText = wordTimestamps[j + k].text.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
                        const nextSearchWord = sentenceWords[k].toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
                        if (nextWordText === nextSearchWord || nextWordText.includes(nextSearchWord) || nextSearchWord.includes(nextWordText)) {
                            matchLen++;
                        } else {
                            break;
                        }
                    }

                    // Если совпало хотя бы 2 слова или предложение из 1 слова — считаем найденным
                    if (matchLen >= Math.min(2, sentenceWords.length)) {
                        matchStartIdx = j;
                        matchEndIdx = j + matchLen - 1;
                        currentWordIndex = j + matchLen;
                        break;
                    }
                }
            }

            if (matchStartIdx !== -1) {
                const startTime = wordTimestamps[matchStartIdx].start;
                const endTime = wordTimestamps[matchEndIdx].end;
                sentenceTimestamps.push({
                    key: sentence.key,
                    start: Math.floor(startTime * 100) / 100,
                    end: Math.ceil(endTime * 100) / 100
                });
                console.log(`📊 Предложение "${sentenceText.substring(0, 30)}..." → ${startTime.toFixed(2)}с - ${endTime.toFixed(2)}с`);
            } else {
                // Если не нашли — используем равномерное распределение для этого предложения
                console.warn(`⚠️ Не найдены таймстемпы для предложения: "${sentenceText.substring(0, 30)}..."`);
                sentenceTimestamps.push({ key: sentence.key, start: 0, end: 0 });
            }
        }

        // 5. Заполняем пропуски (предложения с start=0,end=0) равномерно
        const wf = window.waveformCanvas;
        const totalDuration = wf ? wf.getDuration() : 0;
        
        if (totalDuration > 0) {
            // Находим все предложения без таймстемпов
            const missingIndices = [];
            for (let i = 0; i < sentenceTimestamps.length; i++) {
                if (sentenceTimestamps[i].start === 0 && sentenceTimestamps[i].end === 0) {
                    missingIndices.push(i);
                }
            }

            if (missingIndices.length > 0 && missingIndices.length < sentenceTimestamps.length) {
                // Распределяем пропущенные между найденными
                for (let mi = 0; mi < missingIndices.length; mi++) {
                    const idx = missingIndices[mi];
                    let prevEnd = 0;
                    let nextStart = totalDuration;
                    
                    for (let j = idx - 1; j >= 0; j--) {
                        if (sentenceTimestamps[j].end > 0) {
                            prevEnd = sentenceTimestamps[j].end;
                            break;
                        }
                    }
                    for (let j = idx + 1; j < sentenceTimestamps.length; j++) {
                        if (sentenceTimestamps[j].start > 0) {
                            nextStart = sentenceTimestamps[j].start;
                            break;
                        }
                    }

                    const gapDuration = nextStart - prevEnd;
                    const gapCount = 1; // упрощённо
                    const fillDuration = gapDuration / (gapCount + 1);
                    sentenceTimestamps[idx].start = Math.floor((prevEnd + fillDuration * (mi + 1)) * 100) / 100;
                    sentenceTimestamps[idx].end = Math.floor((prevEnd + fillDuration * (mi + 2)) * 100) / 100;
                }
            } else if (missingIndices.length === sentenceTimestamps.length) {
                // Все пропущены — равномерно
                const segmentDuration = totalDuration / sentences.length;
                let currentEndTime = 0;
                for (let i = 0; i < sentenceTimestamps.length; i++) {
                    const rawEndTime = currentEndTime + segmentDuration;
                    const endTime = Math.floor(rawEndTime * 100) / 100;
                    sentenceTimestamps[i].start = i === 0 ? 0 : sentenceTimestamps[i - 1].end;
                    sentenceTimestamps[i].end = endTime;
                    currentEndTime = endTime;
                }
            }
        }

        // 6. Обновляем workingData с новыми временными метками
        _showLoading('✂️ Умная нарезка: разрезание аудио на сервере...');

        for (let i = 0; i < sentenceTimestamps.length; i++) {
            const st = sentenceTimestamps[i];
            const sentence = sentences[i];
            
            const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === sentence.key);
            if (sentenceIndex !== -1) {
                workingData.original.sentences[sentenceIndex].start = st.start;
                workingData.original.sentences[sentenceIndex].end = st.end;
                workingData.original.sentences[sentenceIndex].chain = true;
                workingData.original.sentences[sentenceIndex].audio_user = `${sentence.key}_${currentDictation.language_original}_user.mp3`;
            }

            // Обновляем переводы
            try {
                if (workingData && workingData.translations && typeof workingData.translations === 'object') {
                    for (const k of Object.keys(workingData.translations)) {
                        const bucket = workingData.translations[k];
                        if (!bucket || !Array.isArray(bucket.sentences)) continue;
                        const idx = bucket.sentences.findIndex(s => s && s.key === sentence.key);
                        if (idx === -1) continue;
                        bucket.sentences[idx].start = st.start;
                        bucket.sentences[idx].end = st.end;
                        bucket.sentences[idx].chain = true;
                        bucket.sentences[idx].audio_user = `${sentence.key}_${normalizeLangCode(bucket.language)}_user.mp3`;
                    }
                }
            } catch (e) {
                // игнорируем
            }
        }

        // 7. Конвертируем blob в base64 для отправки на сервер
        const arrayBuffer = await audioBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const audioB64 = btoa(binary);

        // 8. Отправляем запрос на сервер для разрезания аудио (draft-mode: audio_b64)
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: currentAudioFileName,
                audio_b64: audioB64,
                mime: audioBlob.type || 'audio/mpeg',
                sentences: sentenceTimestamps.map(st => ({
                    key: st.key,
                    start_time: st.start,
                    end_time: st.end,
                    language: currentDictation.language_original
                })),
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            console.log('✅ Умная нарезка выполнена успешно');

            // Сохраняем полученные audio_b64 сегменты в draft cache
            if (Array.isArray(data.files)) {
                for (const f of data.files) {
                    if (!f || !f.filename || !f.audio_b64) continue;
                    try {
                        const binaryOut = atob(f.audio_b64);
                        const outBytes = new Uint8Array(binaryOut.length);
                        for (let i = 0; i < binaryOut.length; i++) outBytes[i] = binaryOut.charCodeAt(i);
                        const outBlob = new Blob([outBytes], { type: f.mime || 'audio/mpeg' });
                        if (typeof putDraftAudioToCache === 'function') {
                            await putDraftAudioToCache(currentDictation.id, currentDictation.language_original, f.filename, outBlob, f.mime || 'audio/mpeg');
                        }
                    } catch (e) {
                        console.warn('⚠️ не удалось сохранить segment blob:', e);
                    }
                }
            }

            if (typeof updateTableWithNewAudio === 'function') {
                updateTableWithNewAudio();
            }
            if (typeof switchToSentenceMode === 'function') {
                switchToSentenceMode();
            }
            if (typeof setDirtyFlags === 'function') {
                setDirtyFlags({ audio: true });
            }
            if (typeof markAsUnsaved === 'function') {
                markAsUnsaved();
            }
        } else {
            console.error('❌ Ошибка умной нарезки:', data.error);
            alert('Ошибка умной нарезки: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка умной нарезки:', error);
        alert('Ошибка умной нарезки: ' + error.message);
    } finally {
        _hideLoading();
    }
}

// ============================================================================
// ЭКСПОРТ
// ============================================================================

// Регистрируем функции в глобальной области видимости для обратной совместимости
window.AudioEditorTools = {
    // Обрезка
    getCurrentAudioFileForScissors,
    trimAudioFile,
    handleScissorsFullMode,
    cutAudioFile,
    handleAudioStart,
    handleAudioEnd,
    
    // Нарезка
    splitAudioIntoSentences,
    splitAudioIntoSeentences,
    
    // Умная нарезка
    smartSplitAudio
};

// Для обратной совместимости — оставляем глобальные функции
// (script_dictation_editor.js будет ссылаться на них)
window.getCurrentAudioFileForScissors = getCurrentAudioFileForScissors;
window.trimAudioFile = trimAudioFile;
window.handleScissorsFullMode = handleScissorsFullMode;
window.cutAudioFile = cutAudioFile;
window.handleAudioStart = handleAudioStart;
window.handleAudioEnd = handleAudioEnd;
window.splitAudioIntoSentences = splitAudioIntoSentences;
window.splitAudioIntoSeentences = splitAudioIntoSeentences;
window.smartSplitAudio = smartSplitAudio;

console.log('🎵 audio_editor_tools.js загружен');
