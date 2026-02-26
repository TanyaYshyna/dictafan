class AudioManagerClass {
    constructor() {
        this.audio = null;
        this.currentButton = null;
        this.waveformCanvas = null;
        this.audioPlayerVisual = null;
        this.playheadAnimation = null;
        this._autoPlayEnabled = true;
        this._playToken = 0;
        this._desiredStartTime = null;
    }

    setWaveformCanvas(waveformCanvas) {
        this.waveformCanvas = waveformCanvas || null;
    }

    setAudioPlayerVisual(audioPlayerVisual) {
        this.audioPlayerVisual = audioPlayerVisual || null;
    }

    setCurrent(audioElement, button = null) {
        this.audio = audioElement || null;
        this.currentButton = button;
    }

    play(button, audioUrl, onEndedCallback = null) {
        this._autoPlayEnabled = true;
        const playToken = ++this._playToken;
        const isSameAudio = this.audio && this.audio.src && this.audio.src.includes(audioUrl);

        // If we're resuming the exact same audio element (paused), do NOT recreate it.
        // Otherwise we lose currentTime and seeking becomes impossible.
        if (isSameAudio && this.audio && this.audio.paused && !this.audio.ended) {
            this.currentButton = button || null;
            const currentAudio = this.audio;
            const currentButton = this.currentButton;

            if (this.currentButton) {
                const originalState = this.currentButton.dataset.state || this.currentButton.dataset.originalState || 'ready';
                const newState = (originalState === 'ready-shared' || originalState === 'playing-shared') ? 'playing-shared' : 'playing';
                this.currentButton.dataset.state = newState;
                if (typeof setButtonState === 'function') {
                    setButtonState(this.currentButton, newState);
                } else {
                    this.updateButtonIcon(this.currentButton, "pause");
                }
            }

            if (this.audioPlayerVisual && button === this.audioPlayerVisual.playButton) {
                try {
                    this.audioPlayerVisual.setAudioElement(currentAudio);
                    this.audioPlayerVisual.setPlaying(true);
                } catch (e) {
                }
            }

            // Apply any deferred seek before resuming.
            const desired = this._desiredStartTime;
            if (desired !== null && desired !== undefined && isFinite(Number(desired)) && Number(desired) >= 0) {
                try {
                    currentAudio.currentTime = Number(desired);
                } catch (e) {
                }
                this._desiredStartTime = null;
            }

            const startPlayback = () => {
                if (!currentAudio) return;
                if (!this._autoPlayEnabled || this._playToken !== playToken) return;
                currentAudio.play().catch(() => { });
            };

            if (currentAudio.readyState >= 2) {
                startPlayback();
            } else {
                currentAudio.addEventListener('canplay', startPlayback, { once: true });
                startPlayback();
            }
            return;
        }

        if (isSameAudio && this.audio && !this.audio.paused) {
            this.stop();
            return;
        }

        if (this.audio && this.audio.src && !this.audio.src.includes(audioUrl)) {
            this.stop();
        }

        // Создаем новый аудио элемент
        const previousAudio = this.audio;
        this.audio = new Audio(audioUrl);
        this.currentButton = button || null;
        
        // Сохраняем ссылки в локальные переменные для использования в замыканиях
        const currentAudio = this.audio;
        const currentButton = this.currentButton;
        
        // Применяем скорость воспроизведения из AudioPlayerVisual если она установлена
        const applyPlaybackRate = () => {
            if (this.audioPlayerVisual && currentAudio) {
                const playbackRate = this.audioPlayerVisual.getPlaybackRate();
                if (playbackRate !== undefined && playbackRate !== null) {
                    try {
                        currentAudio.playbackRate = parseFloat(playbackRate);
                    } catch (e) {
                        console.warn('Не удалось установить playbackRate:', e);
                    }
                }
            }
        };
        
        // Пытаемся установить скорость сразу, если метаданные уже загружены
        if (currentAudio.readyState >= 1) {
            applyPlaybackRate();
        } else {
            // Устанавливаем после загрузки метаданных
            currentAudio.addEventListener('loadedmetadata', () => {
                if (this.audio === currentAudio) {
                    applyPlaybackRate();
                }
            }, { once: true });
        }
        
        // Если был предыдущий аудио элемент, убеждаемся что он остановлен
        if (previousAudio && previousAudio !== this.audio) {
            try {
                previousAudio.pause();
                previousAudio.src = '';
                previousAudio.load();
            } catch (e) {
                // Игнорируем ошибки при очистке предыдущего элемента
            }
        }

        // Apply deferred seek time for visual-player use-case (e.g., user moved the slider before first play)
        // or when we had to recreate audio for a new URL.
        const desiredStartTime = this._desiredStartTime;
        if (desiredStartTime !== null && desiredStartTime !== undefined && isFinite(Number(desiredStartTime)) && Number(desiredStartTime) >= 0) {
            const t = Number(desiredStartTime);
            const applyStartTime = () => {
                if (this.audio === currentAudio) {
                    try {
                        const duration = Number(currentAudio.duration);
                        const next = isFinite(duration) && duration > 0 ? Math.min(t, duration) : t;
                        currentAudio.currentTime = next;
                    } catch (e) {
                    }
                }
            };
            if (currentAudio.readyState >= 1) {
                applyStartTime();
            } else {
                currentAudio.addEventListener('loadedmetadata', applyStartTime, { once: true });
            }
            this._desiredStartTime = null;
        }

        if (this.currentButton) {
            // Определяем правильное состояние для кнопки
            // Если кнопка была в состоянии 'ready-shared', то устанавливаем 'playing-shared'
            const originalState = this.currentButton.dataset.state || this.currentButton.dataset.originalState || 'ready';
            const newState = (originalState === 'ready-shared' || originalState === 'playing-shared') ? 'playing-shared' : 'playing';
            
            // Обновляем состояние кнопки
            this.currentButton.dataset.state = newState;
            // Обновляем иконку через setButtonState если функция доступна
            if (typeof setButtonState === 'function') {
                setButtonState(this.currentButton, newState);
            } else {
                // Fallback: просто обновляем иконку
                this.updateButtonIcon(this.currentButton, "pause");
            }
        }

        // Обработка ошибок загрузки/воспроизведения
        currentAudio.onerror = (error) => {
            // Добавляем детальное логирование для диагностики
            const errorDetails = {
                url: audioUrl,
                readyState: currentAudio.readyState,
                networkState: currentAudio.networkState,
                error: currentAudio.error ? {
                    code: currentAudio.error.code,
                    message: currentAudio.error.message
                } : 'unknown'
            };
            
            // Не выводим критическую ошибку в консоль для файлов _avto
            // (это может быть нормальной ситуацией, если файлы не были созданы или имеют проблемы с форматом)
            if (audioUrl && audioUrl.includes('_avto')) {
                console.warn('⚠️ Аудио файл недоступен или имеет проблемы с форматом:', audioUrl, errorDetails);
            } else {
                console.error('❌ Ошибка загрузки/воспроизведения аудио:', audioUrl, errorDetails);
            }
            
            // Проверяем, что это действительно текущий аудио элемент
            if (this.audio === currentAudio && currentButton) {
                // При ошибке возвращаем состояние на 'ready' (не на 'creating'!)
                const originalState = currentButton.dataset.originalState || 'ready';
                currentButton.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(currentButton, originalState);
                } else {
                    this.updateButtonIcon(currentButton, "play");
                }
            }
            // Очищаем только если это текущий аудио элемент
            if (this.audio === currentAudio) {
                this.currentButton = null;
                this.audio = null;
            }
        };

        // Определяем, управление идёт из кнопки под волной/общего файла
        const isUnderWave = !!(button && (button.id === 'audioPlayBtn' || (button.dataset && (button.dataset.state === 'ready-shared' || button.dataset.state === 'playing-shared'))));

        // Если управляет волна – стартуем с её текущей позиции (в пределах региона)
        // Устанавливаем currentTime после загрузки аудио
        if (isUnderWave) {
            const wf = this.waveformCanvas;
            if (wf) {
                const region = wf.region || { start: 0, end: wf.duration || 0 };
                const wfCurrentTime = wf.currentTime || 0;
                // Вычисляем стартовое время: с позиции курсора, если он внутри региона, иначе с начала региона
                const startTime = Math.max(region.start || 0, Math.min(wfCurrentTime, region.end || wf.duration || 0));
                
                const setStartTime = () => {
                    if (this.audio === currentAudio && currentAudio && isFinite(startTime) && startTime >= 0) {
                        currentAudio.currentTime = startTime;
                    }
                };
                
                // Устанавливаем время после загрузки метаданных
                if (currentAudio.readyState >= 1) { // HAVE_METADATA
                    setStartTime();
                } else {
                    currentAudio.addEventListener('loadedmetadata', setStartTime, { once: true });
                }
            }
        }

        // Функция для нормализации URL (убирает протокол и домен, оставляет только путь)
        const normalizeUrl = (url) => {
            if (!url) return '';
            try {
                const urlObj = new URL(url, window.location.origin);
                return urlObj.pathname + urlObj.search;
            } catch (e) {
                // Если не удалось распарсить как URL, возвращаем как есть
                return url.replace(/^https?:\/\/[^\/]+/, '');
            }
        };
        
        // Функция для запуска воспроизведения
        const startPlayback = () => {
            // Проверяем, что currentAudio существует
            if (!currentAudio) {
                return;
            }

            // If user has paused/stopped while the audio was still loading, do not auto-start.
            if (!this._autoPlayEnabled || this._playToken !== playToken) {
                return;
            }
            
            // Проверяем, что URL совпадает
            const currentAudioSrc = normalizeUrl(currentAudio.src);
            const expectedAudioUrl = normalizeUrl(audioUrl);
            
            if (currentAudioSrc !== expectedAudioUrl) {
                return;
            }
            
            currentAudio.play().catch((error) => {
                // AbortError - нормальная ошибка, обычно означает что загрузка еще не завершена
                // Браузер сам запустит воспроизведение когда будет готов
                if (error.name === 'AbortError' || error.message === 'The operation was aborted.') {
                    return;
                }
                
                console.error('❌ Ошибка при запуске воспроизведения:', error, audioUrl);
                if (currentButton) {
                    // При ошибке возвращаем состояние на 'ready' (не на 'creating'!)
                    const originalState = currentButton.dataset.originalState || 'ready';
                    currentButton.dataset.state = originalState;
                    if (typeof setButtonState === 'function') {
                        setButtonState(currentButton, originalState);
                    } else {
                        this.updateButtonIcon(currentButton, "play");
                    }
                }
            });
        };
        
        // Запускаем воспроизведение, когда аудио готово
        if (this.audio.readyState >= 2) {
            // HAVE_CURRENT_DATA или выше - можем начинать воспроизведение
            startPlayback();
        } else if (this.audio.readyState >= 1) {
            // HAVE_METADATA - ждем загрузки данных
            this.audio.addEventListener('canplay', startPlayback, { once: true });
            // Также запускаем сразу на всякий случай
            startPlayback();
        } else {
            // Аудио еще не загружено - ждем метаданных, а потом данных
            currentAudio.addEventListener('canplay', startPlayback, { once: true });
            // Fallback: если canplay не сработает, попробуем при loadeddata
            currentAudio.addEventListener('loadeddata', () => {
                if (currentAudio.readyState >= 2) {
                    startPlayback();
                }
            }, { once: true });
            // Запускаем сразу на всякий случай, браузер может начать воспроизведение асинхронно
            startPlayback();
        }

        if (isUnderWave) {
           const wf = this.waveformCanvas;
            if (wf) {
            const startSync = () => {
                // Проверяем, что это все еще текущий аудио элемент
                if (this.audio === currentAudio && currentAudio) {
                    // Сообщаем волне актуальный audio-элемент и запускаем её собственный контроль
                    if (typeof wf.startAudioControl === "function") {
                        wf.startAudioControl(currentAudio);
                    }
                    // Дополнительно запускаем наш rAF-синк (не мешает внутреннему)
                    if (typeof wf.updatePlayheadFromAudio === "function") {
                        this.startPlayheadSync();
                    }
                }
            };
            if (currentAudio && isFinite(currentAudio.duration) && currentAudio.duration > 0) {
                startSync();
            } else if (currentAudio) {
                currentAudio.addEventListener('loadedmetadata', startSync, { once: true });
            }
            }
        } else {
            // Если воспроизведение не из-под волны — убедимся, что волна не слушает этот плеер
            if (this.waveformCanvas && typeof this.waveformCanvas.stopAudioControl === "function") {
                this.waveformCanvas.stopAudioControl();
            }
            this.stopPlayheadSync();
        }

        // Синхронизация для AudioPlayerVisual (если кнопка принадлежит ему)
        if (this.audioPlayerVisual && button === this.audioPlayerVisual.playButton) {
            const startVisualSync = () => {
                if (this.audioPlayerVisual && this.audio) {
                    this.audioPlayerVisual.setAudioElement(this.audio);
                    this.audioPlayerVisual.setPlaying(true);
                }
            };
            if (isFinite(this.audio.duration) && this.audio.duration > 0) {
                startVisualSync();
            } else {
                this.audio.addEventListener('loadedmetadata', startVisualSync, { once: true });
            }
        }

        this.audio.onended = () => {
            // Вызываем пользовательский callback если есть
            if (onEndedCallback) {
                onEndedCallback();
            }
            
            // По окончании возвращаем playhead в начало региона
            if (this.waveformCanvas) {
                const wf = this.waveformCanvas;
                const region = wf.region || { start: 0 };
                if (typeof wf.setCurrentTime === "function") {
                    wf.setCurrentTime(region.start || 0);
                }
            }

            // Обновляем состояние кнопки на 'ready' после окончания воспроизведения
            if (button) {
                // Сохраняем originalState если он был установлен
                const originalState = button.dataset.originalState || 'ready';
                button.dataset.state = originalState;
                
                // Обновляем иконку через setButtonState если функция доступна
                if (typeof setButtonState === 'function') {
                    setButtonState(button, originalState);
                } else {
                    // Fallback: просто обновляем иконку
                    this.updateButtonIcon(button, "play");
                }
            }
            
            if (this.onPlayStateChangeCallback) {
                this.onPlayStateChangeCallback(false); // isPlaying = false
            }
            // Останавливаем синхронизацию AudioPlayerVisual
            if (this.audioPlayerVisual && button === this.audioPlayerVisual.playButton) {
                this.audioPlayerVisual.setPlaying(false);
            }
            this.currentButton = null;
            this.audio = null;
            this.stopPlayheadSync();
        };
    }

    setPlaybackRate(rate) {
        if (this.audio) {
            this.audio.playbackRate = parseFloat(rate);
            // Синхронизируем с AudioPlayerVisual если он есть
            if (this.audioPlayerVisual) {
                this.audioPlayerVisual.setPlaybackRate(rate);
            }
        }
    }

    pause() {
        this._autoPlayEnabled = false;
        if (this.audio && !this.audio.paused) {
            this.audio.pause();
        }
        if (this.currentButton) {
            // Определяем правильное состояние для возврата кнопки
            // Если кнопка была в состоянии 'playing-shared', возвращаем 'ready-shared'
            const currentState = this.currentButton.dataset.state || 'playing';
            const originalState = this.currentButton.dataset.originalState || 
                                (currentState === 'playing-shared' ? 'ready-shared' : 'ready');
            this.currentButton.dataset.state = originalState;
            
            // Обновляем иконку через setButtonState если функция доступна
            if (typeof setButtonState === 'function') {
                setButtonState(this.currentButton, originalState);
            } else {
                // Fallback: просто обновляем иконку
                this.updateButtonIcon(this.currentButton, "play");
            }
        }
        if (this.waveformCanvas && typeof this.waveformCanvas.stopAudioControl === "function") {
            this.waveformCanvas.stopAudioControl();
        }
        // Останавливаем синхронизацию AudioPlayerVisual
        if (this.audioPlayerVisual && this.currentButton === this.audioPlayerVisual.playButton) {
            this.audioPlayerVisual.setPlaying(false);
        }
        this.stopPlayheadSync();
    }

    stop() {
        this._autoPlayEnabled = false;
        this.stopPlayheadSync();
        if (this.audio) {
            this.audio.pause();
            // Если управляем через волну, оставляем позицию как есть
            const controlledByWave = this.waveformCanvas && this.waveformCanvas.currentAudio === this.audio;
            if (!controlledByWave) {
                this.audio.currentTime = 0;
            }
        }
        if (this.currentButton) {
            this.updateButtonIcon(this.currentButton, "play");
            // Останавливаем синхронизацию AudioPlayerVisual
            if (this.audioPlayerVisual && this.currentButton === this.audioPlayerVisual.playButton) {
                this.audioPlayerVisual.setPlaying(false);
            }
            this.currentButton = null;
        }
        // Дополнительно сбрасываем кнопку под волной
        const wavePlayBtn = document.getElementById('audioPlayBtn');
        if (wavePlayBtn) this.updateButtonIcon(wavePlayBtn, "play");
        this.audio = null;
        if (this.waveformCanvas && typeof this.waveformCanvas.stopAudioControl === "function") {
            this.waveformCanvas.stopAudioControl();
        }
        this.stopPlayheadSync();
    }

    updateButtonIcon(button, iconName) {
        if (!button) return;
        const icon = button.querySelector("[data-lucide]");
        if (icon) {
            icon.setAttribute("data-lucide", iconName);
            if (typeof lucide !== "undefined" && lucide && typeof lucide.createIcons === "function") {
                lucide.createIcons();
            }
        }
    }

    setCurrentTime(timeSeconds) {
        const t = Number(timeSeconds);
        if (!isFinite(t) || t < 0) return;

        // Remember desired time so that seeking works even before the first play.
        this._desiredStartTime = t;

        if (!this.audio) return;
        try {
            const duration = Number(this.audio.duration);
            const next = isFinite(duration) && duration > 0 ? Math.min(t, duration) : t;
            this.audio.currentTime = next;
        } catch (e) {
        }
    }

    startPlayheadSync() {
        if (!this.audio || !this.waveformCanvas) return;
        const update = () => {
            if (!this.audio.paused && !this.audio.ended) {
                this.waveformCanvas.updatePlayheadFromAudio(this.audio);
                this.playheadAnimation = requestAnimationFrame(update);
            }
        };
        this.playheadAnimation = requestAnimationFrame(update);
    }

    stopPlayheadSync() {
        if (this.playheadAnimation) {
            cancelAnimationFrame(this.playheadAnimation);
            this.playheadAnimation = null;
        }
    }
}

const audioManager = new AudioManagerClass();
window.AudioManager = window.AudioManager || audioManager;
