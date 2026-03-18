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
        this._lastPlayRequest = null;
        this._mediaCacheName = 'dictafan-media';
        this._objectUrlByCanonicalUrl = {};
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

    async play(button, audioUrl, onEndedCallback = null) {
        const __dbgEnabled = !!window.__DICTATION_EDITOR_AUDIO_DEBUG;
        const __dbg = (...args) => {
            try {
                if (__dbgEnabled) console.log('[AUDIO_MGR_DBG]', ...args);
            } catch (e) {
            }
        };

        const __seqMode = !!onEndedCallback;
        const __seqLog = () => { };

        let _finishCallbackCalled = false;
        const finishCallbackOnce = () => {
            try {
                if (_finishCallbackCalled) return;
                _finishCallbackCalled = true;
                if (onEndedCallback) onEndedCallback();
            } catch (e) {
            }
        };
        
        // Debounce: avoid accidental double-clicks on the same button.
        // IMPORTANT: do not debounce when a completion callback is provided.
        // Audio sequences legitimately call play() repeatedly (e.g., 'oto' can repeat 'o').
        if (!onEndedCallback) {
            try {
                const now = Date.now();
                const last = this._lastPlayRequest;
                const urlKey = typeof audioUrl === 'string' ? audioUrl : String(audioUrl);
                if (last && last.urlKey === urlKey && (now - last.ts) < 250) {
                    return;
                }
                this._lastPlayRequest = { urlKey, ts: now };
            } catch (e) {
            }
        }

        let __inputUrl = audioUrl;
        try {
            __inputUrl = this.normalizeMediaUrl(__inputUrl);
        } catch (e) {
        }

        const isBlobUrl = typeof __inputUrl === 'string' && __inputUrl.startsWith('blob:');
        const isDraftAudioUrl = false;
        __dbg('play()', {
            audioUrl: __inputUrl,
            buttonId: button && button.id,
            isBlobUrl,
            isDraftAudioUrl,
        });

        this._autoPlayEnabled = true;
        const playToken = ++this._playToken;

        try {
            if (!isBlobUrl && typeof __inputUrl === 'string' && __inputUrl.startsWith('/api/dictations/')) {
                const resolved = await this.resolvePlayableUrl(__inputUrl, playToken);
                if (!resolved) {
                    return;
                }
                if (this._playToken !== playToken) {
                    return;
                }
                audioUrl = resolved;
            } else {
                audioUrl = __inputUrl;
            }
        } catch (e) {
            audioUrl = __inputUrl;
        }

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
                let p;
                try {
                    p = currentAudio.play();
                } catch (e) {
                    throw e;
                }
                try {
                    if (p && typeof p.then === 'function') {
                        p.then(() => {
                        }).catch((error) => {
                        });
                    }
                } catch (e) {
                }
                (p && typeof p.catch === 'function' ? p : Promise.resolve()).catch((error) => {
                    try {
                        if (isBlobUrl) {
                            console.error('[AUDIO_MGR] blob play rejected', error);
                        }
                    } catch (e) {
                    }
                    console.error('❌ Ошибка при запуске воспроизведения:', error, audioUrl);

                    // Revert button state back to original when resume fails.
                    if (currentButton) {
                        const originalState = currentButton.dataset.originalState || 'ready';
                        currentButton.dataset.state = originalState;
                        if (typeof setButtonState === 'function') {
                            setButtonState(currentButton, originalState);
                        } else {
                            this.updateButtonIcon(currentButton, "play");
                        }
                    }
                    try {
                        finishCallbackOnce();
                    } catch (e) {
                    }
                });
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
            // IMPORTANT: stop() disables autoplay; when switching tracks programmatically
            // (e.g., dictation sequence 'oto'), we must keep autoplay enabled for the next track.
            this.stop();
            this._autoPlayEnabled = true;
        }

        // Создаем новый аудио элемент
        const previousAudio = this.audio;
        const prewarmed = (isDraftAudioUrl && window.__DICTATION_EDITOR_PREWARM_AUDIOS)
            ? window.__DICTATION_EDITOR_PREWARM_AUDIOS[String(audioUrl)]
            : null;
        this.audio = prewarmed || new Audio(audioUrl);
        this.currentButton = button || null;

        if (isDraftAudioUrl && this.audio) {
            try {
                this.audio.preload = 'auto';
            } catch (e) {
            }
        }
        
        // Сохраняем ссылки в локальные переменные для использования в замыканиях
        const currentAudio = this.audio;
        const currentButton = this.currentButton;

        try {
            if (__seqMode && currentAudio && !currentAudio.__audioMgrSeqListenersInstalled) {
                currentAudio.__audioMgrSeqListenersInstalled = true;
            }
        } catch (e) {
        }

        const setButtonPlayingState = () => {
            try {
                if (!currentButton) return;
                // Определяем правильное состояние для кнопки
                const originalState = currentButton.dataset.state || currentButton.dataset.originalState || 'ready';
                const newState = (originalState === 'ready-shared' || originalState === 'playing-shared') ? 'playing-shared' : 'playing';
                currentButton.dataset.state = newState;
                if (typeof setButtonState === 'function') {
                    setButtonState(currentButton, newState);
                } else {
                    this.updateButtonIcon(currentButton, 'pause');
                }
            } catch (e) {
            }
        };

        const revertButtonReadyState = () => {
            try {
                if (!currentButton) return;
                const originalState = currentButton.dataset.originalState || 'ready';
                currentButton.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(currentButton, originalState);
                } else {
                    this.updateButtonIcon(currentButton, 'play');
                }
            } catch (e) {
            }
        };
        // Update UI when playback actually starts.
        try {
            if (currentAudio && !currentAudio.__audioMgrUiListenersInstalled) {
                currentAudio.addEventListener('playing', setButtonPlayingState);
                currentAudio.addEventListener('pause', () => {
                    try {
                        const t = Number(currentAudio && currentAudio.currentTime);
                        if (!isFinite(t) || t <= 0) {
                            revertButtonReadyState();
                        }
                    } catch (e) {
                    }
                });
                currentAudio.__audioMgrUiListenersInstalled = true;
            }
        } catch (e) {
        }
        
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

        // IMPORTANT: do not switch UI to "playing" until we actually receive playback events.

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

            // IMPORTANT: allow callers (e.g., dictation play sequence) to continue
            // even if a particular audio file is missing/unplayable.
            try {
                finishCallbackOnce();
            } catch (e) {
            }
        };

        try {
            const events = ['loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'ended', 'error', 'stalled', 'waiting', 'timeupdate'];
            events.forEach((ev) => {
                currentAudio.addEventListener(ev, () => {
                    __dbg(`event:${ev}`, {
                        playToken,
                        current: this.audio === currentAudio,
                        readyState: currentAudio.readyState,
                        networkState: currentAudio.networkState,
                        paused: currentAudio.paused,
                        ended: currentAudio.ended,
                        currentTime: currentAudio.currentTime,
                        duration: currentAudio.duration,
                        src: currentAudio.src
                    });
                });
            });
        } catch (e) {
        }

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

        // Функция для запуска воспроизведения
        let _didCallPlay = false;
        const startPlayback = () => {
            // Проверяем, что currentAudio существует
            if (!currentAudio) {
                return;
            }

            // If user has paused/stopped while the audio was still loading, do not auto-start.
            if (!this._autoPlayEnabled || this._playToken !== playToken) {
                return;
            }
            
            // Avoid overlapping play () calls (Safari can abort/pause if play () is called repeatedly
            // while the first request is still pending).
            if (_didCallPlay) {
                return;
            }
            _didCallPlay = true;
            
            let p;
            try {
                p = currentAudio.play();
            } catch (e) {
                throw e;
            }
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    __dbg('play() resolved', { playToken, current: this.audio === currentAudio });
                    // Some browsers resolve play() before firing 'playing'. If we are actually
                    // not paused anymore, update the UI.
                    try {
                        if (currentAudio && currentAudio.paused === false) {
                            setButtonPlayingState();
                        }
                    } catch (e) {
                    }
                }).catch((error) => {
                });
            }
            (p && typeof p.catch === 'function' ? p : Promise.resolve()).catch((error) => {
                
                __dbg('play() rejected', {
                    name: error && error.name,
                    message: error && error.message,
                    code: error && error.code,
                    playToken,
                    current: this.audio === currentAudio
                });
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

                // IMPORTANT: allow callers (e.g., dictation play sequence) to continue
                // even if a particular play() attempt is blocked/rejected.
                try {
                    finishCallbackOnce();
                } catch (e) {
                }
            });
        };
        
        // Запускаем воспроизведение, когда аудио готово
        if (this.audio.readyState >= 2) {
            startPlayback();
        } else {
            currentAudio.addEventListener('canplay', startPlayback, { once: true });
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
            finishCallbackOnce();
            
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

    normalizeMediaUrl(rawUrl) {
        try {
            let v = String(rawUrl || '').trim();
            if (!v) return '';
            if (v.startsWith('blob:')) return v;

            try {
                if (v.startsWith('http://') || v.startsWith('https://')) {
                    const u = new URL(v);
                    const desiredProtocol = (typeof location !== 'undefined' && location && location.protocol) ? location.protocol : u.protocol;
                    if (desiredProtocol === 'https:' && u.protocol === 'http:') {
                        u.protocol = 'https:';
                    }

                    try {
                        if (typeof location !== 'undefined' && location && u.origin === location.origin) {
                            v = `${u.pathname}${u.search || ''}`;
                        } else {
                            v = u.toString();
                        }
                    } catch (e) {
                        v = `${u.pathname}${u.search || ''}`;
                    }
                }
            } catch (e) {
            }

            try {
                if (v.startsWith('http://') && typeof location !== 'undefined' && location && location.protocol === 'https:') {
                    v = `https://${v.slice('http://'.length)}`;
                }
            } catch (e) {
            }

            const markers = ['/api/dictations/'];
            for (const m of markers) {
                const first = v.indexOf(m);
                if (first >= 0) {
                    return v.slice(first);
                }
            }

            if (!v.startsWith('/') && (v.startsWith('api/') || v.startsWith('api\\'))) {
                v = `/${v}`;
            }

            return v;
        } catch (e) {
            return String(rawUrl || '').trim();
        }
    }

    getBasename(filenameOrUrl) {
        try {
            const raw = String(filenameOrUrl || '').trim();
            if (!raw) return '';
            if (raw.startsWith('blob:')) return raw;
            const name = raw.split('?', 1)[0].split('/').pop();
            return String(name || '').trim();
        } catch (e) {
            return '';
        }
    }

    buildDictationAudioUrl(dictationId, language, filename) {
        try {
            const id = String(dictationId || '').trim();
            const lang = String(language || '').trim();
            const raw = String(filename || '').trim();
            if (!id || !lang || !raw) return '';
            if (raw.startsWith('blob:') || raw.startsWith('/api/') || raw.startsWith('http://') || raw.startsWith('https://')) {
                return this.normalizeMediaUrl(raw);
            }
            const name = this.getBasename(raw);
            if (!name) return '';
            return this.normalizeMediaUrl(`/api/dictations/${encodeURIComponent(id)}/${encodeURIComponent(lang)}/${encodeURIComponent(name)}`);
        } catch (e) {
            return '';
        }
    }

    async openMediaCache() {
        try {
            if (!('caches' in window)) return null;
            return await caches.open(this._mediaCacheName);
        } catch (e) {
            return null;
        }
    }

    _toCacheKey(url) {
        try {
            const u = this.normalizeMediaUrl(url);
            if (!u) return '';
            if (u.startsWith('blob:')) return '';
            // CacheStorage keys are absolute URLs in practice; keep one canonical form.
            return new URL(u, window.location.origin).toString();
        } catch (e) {
            return '';
        }
    }

    async getCachedResponse(url) {
        try {
            const key = this._toCacheKey(url);
            if (!key) return null;
            const cache = await this.openMediaCache();
            if (!cache) return null;
            return await cache.match(key);
        } catch (e) {
            return null;
        }
    }

    async putResponseToCache(url, response) {
        try {
            const key = this._toCacheKey(url);
            if (!key) return false;
            const cache = await this.openMediaCache();
            if (!cache) return false;
            await cache.put(key, response);
            return true;
        } catch (e) {
            return false;
        }
    }

    async deleteFromCache(url) {
        try {
            const key = this._toCacheKey(url);
            if (!key) return false;
            const cache = await this.openMediaCache();
            if (!cache) return false;
            return await cache.delete(key);
        } catch (e) {
            return false;
        }
    }

    _setObjectUrlForCanonical(canonicalUrl, nextObjectUrl) {
        try {
            const key = String(canonicalUrl || '').trim();
            if (!key) return;
            const next = String(nextObjectUrl || '').trim();
            if (!next || !next.startsWith('blob:')) return;
            const prev = this._objectUrlByCanonicalUrl[key];
            if (prev && typeof prev === 'string' && prev.startsWith('blob:') && prev !== next) {
                try { URL.revokeObjectURL(prev); } catch (e) {}
            }
            this._objectUrlByCanonicalUrl[key] = next;
        } catch (e) {
        }
    }

    _getObjectUrlForCanonical(canonicalUrl) {
        try {
            const key = String(canonicalUrl || '').trim();
            if (!key) return '';
            const v = this._objectUrlByCanonicalUrl[key];
            return (v && typeof v === 'string') ? v : '';
        } catch (e) {
            return '';
        }
    }

    async resolvePlayableUrl(canonicalUrl, playToken) {
        try {
            const u = this.normalizeMediaUrl(canonicalUrl);
            if (!u) return '';
            if (u.startsWith('blob:')) return u;

            const cacheKey = this._toCacheKey(u);
            if (!cacheKey) {
                return u;
            }

            const existing = this._getObjectUrlForCanonical(cacheKey);
            if (existing && existing.startsWith('blob:')) {
                return existing;
            }

            const cache = await this.openMediaCache();
            if (!cache) {
                return u;
            }

            let res = null;
            try {
                res = await cache.match(cacheKey);
            } catch (e) {
                res = null;
            }

            if (!res) {
                try {
                    const fetchRes = await fetch(u, { cache: 'no-store' });
                    if (fetchRes && fetchRes.ok) {
                        try {
                            await cache.put(cacheKey, fetchRes.clone());
                        } catch (e) {
                        }
                        res = fetchRes;
                    }
                } catch (e) {
                }
            }

            if (this._playToken !== playToken) {
                return '';
            }

            if (!res) {
                return u;
            }

            let blob = null;
            try {
                blob = await res.blob();
            } catch (e) {
                blob = null;
            }
            if (!blob || !blob.size) {
                return u;
            }

            const objUrl = URL.createObjectURL(blob);
            this._setObjectUrlForCanonical(cacheKey, objUrl);
            return objUrl;
        } catch (e) {
            return '';
        }
    }

    async saveDictationAudioBlob(dictationId, language, filename, blob, mime) {
        try {
            const url = this.buildDictationAudioUrl(dictationId, language, filename);
            const key = this._toCacheKey(url);
            if (!key) return '';
            if (!blob || !blob.size) return '';

            const headers = new Headers();
            headers.set('Content-Type', (mime || blob.type || 'audio/mpeg'));
            headers.set('Cache-Control', 'no-store');

            const cache = await this.openMediaCache();
            if (!cache) return '';
            await cache.put(key, new Response(blob, { status: 200, headers }));

            // Invalidate any previously-created objectURL for this key so the next play() gets fresh bytes.
            try {
                const prev = this._getObjectUrlForCanonical(key);
                if (prev && prev.startsWith('blob:')) {
                    try { URL.revokeObjectURL(prev); } catch (e) {}
                    delete this._objectUrlByCanonicalUrl[key];
                }
            } catch (e) {
            }

            return key;
        } catch (e) {
            return '';
        }
    }

    async deleteByUrl(url) {
        try {
            const key = this._toCacheKey(url);
            if (!key) return false;

            // Revoke any object URL for this cached entry.
            try {
                const prev = this._getObjectUrlForCanonical(key);
                if (prev && prev.startsWith('blob:')) {
                    try { URL.revokeObjectURL(prev); } catch (e) {}
                }
                delete this._objectUrlByCanonicalUrl[key];
            } catch (e) {
            }

            const cache = await this.openMediaCache();
            if (!cache) return false;
            return await cache.delete(key);
        } catch (e) {
            return false;
        }
    }

    async deleteDictationAudioBlob(dictationId, language, filename) {
        try {
            const url = this.buildDictationAudioUrl(dictationId, language, filename);
            if (!url) return false;
            return await this.deleteByUrl(url);
        } catch (e) {
            return false;
        }
    }
}

const audioManager = new AudioManagerClass();
window.AudioManager = window.AudioManager || audioManager;
