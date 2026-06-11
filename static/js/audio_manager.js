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
        this._b2LedgerDbName = 'dictafan_drafts';
        this._b2LedgerStoreName = 'b2_upload_ledger';

        this._micRecording = {
            stream: null,
            recorder: null,
            chunks: [],
            blob: null,
            startedAt: 0,
        };

        this._storageOutageLastShownAt = 0;
    }

    getUserRecordingStream() {
        try {
            return this._micRecording && this._micRecording.stream ? this._micRecording.stream : null;
        } catch (e) {
            return null;
        }
    }

    _getSupportedMicMimeType() {
        try {
            const candidates = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
            ];
            for (const t of candidates) {
                try {
                    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
                        return t;
                    }
                } catch (e) {
                }
            }
        } catch (e) {
        }
        return '';
    }

    async startUserRecording({ mimeType } = {}) {
        // Single entry-point for all microphone recordings on the page.
        try {
            if (this._micRecording && this._micRecording.recorder && this._micRecording.recorder.state === 'recording') {
                return { ok: true, alreadyRecording: true, stream: this._micRecording.stream };
            }
        } catch (e) {
        }

        // Ensure no audio is playing while recording.
        try {
            this.stop();
        } catch (e) {
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mt = String(mimeType || '').trim() || this._getSupportedMicMimeType();
        const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);

        this._micRecording.stream = stream;
        this._micRecording.recorder = mr;
        this._micRecording.chunks = [];
        this._micRecording.blob = null;
        this._micRecording.startedAt = Date.now();

        mr.ondataavailable = (e) => {
            try {
                if (e && e.data && e.data.size) this._micRecording.chunks.push(e.data);
            } catch (e2) {
            }
        };

        mr.start();
        return { ok: true, stream, recorder: mr };
    }

    async stopUserRecording({ timeoutMs } = {}) {
        const STOP_TIMEOUT_MS = Number(timeoutMs) > 0 ? Number(timeoutMs) : 4000;
        const rec = this._micRecording || null;
        const mr = rec ? rec.recorder : null;
        const stream = rec ? rec.stream : null;

        try {
            if (mr && mr.state === 'recording') {
                await Promise.race([
                    new Promise((resolve) => {
                        const done = () => resolve();
                        try {
                            mr.addEventListener('stop', done, { once: true });
                        } catch (e) {
                            resolve();
                            return;
                        }
                        try {
                            mr.stop();
                        } catch (e) {
                            resolve();
                        }
                    }),
                    new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
                ]);
            }
        } catch (e) {
        }

        let blob = null;
        try {
            const chunks = rec && Array.isArray(rec.chunks) ? rec.chunks : [];
            const mt = (mr && mr.mimeType) ? String(mr.mimeType) : '';
            const blobType = (mt && mt.includes('mp4')) ? 'audio/mp4' : (mt || 'audio/webm');
            blob = chunks.length ? new Blob(chunks, { type: blobType }) : null;
            if (rec) rec.blob = blob;
        } catch (e) {
            blob = null;
        }

        try {
            if (stream && stream.getTracks) {
                for (const t of stream.getTracks()) {
                    try { t.stop(); } catch (e) {}
                }
            }
        } catch (e) {
        }

        try {
            if (rec) {
                rec.stream = null;
                rec.recorder = null;
                rec.chunks = [];
                rec.startedAt = 0;
            }
        } catch (e) {
        }

        return { ok: true, audioBlob: blob };
    }

    _notifyStorageOutageOnce(details = {}) {
        try {
            const now = Date.now();
            const last = Number(this._storageOutageLastShownAt || 0);
            if (last && (now - last) < 15000) {
                return;
            }
            this._storageOutageLastShownAt = now;

            const msg = 'Сейчас проблемы с получением данных с хранилища. Повторите попытку позже!';
            try {
                if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(msg, { durationMs: 7000 });
                    return;
                }
            } catch (e) {
            }
            try {
                if (typeof window !== 'undefined' && typeof window.showSaveToast === 'function') {
                    window.showSaveToast(msg, 'error', 7000);
                    return;
                }
            } catch (e) {
            }
            try {
                if (typeof alert === 'function') {
                    alert(msg);
                }
            } catch (e) {
            }
        } catch (e) {
        }
    }

    _maybeNotifyStorageOutageFromResponse(url, response) {
        try {
            const u = String(url || '');
            const status = response && typeof response.status === 'number' ? response.status : 0;
            if (!u) return;
            // Most common symptoms: 503 when B2 is unavailable.
            if (status === 503 || status === 502) {
                if (u.includes('/api/dictations/') || u.includes('/api/dictations_covers/') || u.includes('/api/b2/')) {
                    this._notifyStorageOutageOnce({ url: u, status });
                }
            }
        } catch (e) {
        }
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

    async deleteDictationAudioFromCache(dictationId) {
        try {
            const id = String(dictationId || '').trim();
            if (!id) return { success: false, deleted: 0 };
            const cache = await this.openMediaCache();
            if (!cache) return { success: false, deleted: 0 };
            const requests = await cache.keys();
            let deleted = 0;
            for (const request of requests) {
                try {
                    const url = request.url;
                    // Ищем URL вида /api/dictations/{dictationId}/
                    if (url.includes(`/api/dictations/${encodeURIComponent(id)}/`)) {
                        await cache.delete(request);
                        deleted += 1;
                    }
                } catch (e) {
                    // ignore individual errors
                }
            }
            return { success: true, deleted };
        } catch (e) {
            return { success: false, deleted: 0 };
        }
    }

    /** Отозвать blob URL'ы для всех аудио конкретного диктанта */
    revokeDictationBlobUrls(dictationId) {
        try {
            const id = String(dictationId || '').trim();
            if (!id) return;
            const pattern = `/api/dictations/${encodeURIComponent(id)}/`;
            const keysToDelete = [];
            for (const [key, value] of Object.entries(this._objectUrlByCanonicalUrl || {})) {
                if (key.includes(pattern)) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                try {
                    const url = this._objectUrlByCanonicalUrl[key];
                    if (url && typeof url === 'string' && url.startsWith('blob:')) {
                        URL.revokeObjectURL(url);
                    }
                } catch (e) {
                }
                delete this._objectUrlByCanonicalUrl[key];
            }
        } catch (e) {
        }
    }

    /** Получить список всех blob URL'ов из AudioManager */
    getBlobEntries() {
        try {
            const entries = [];
            const map = this._objectUrlByCanonicalUrl || {};
            for (const [key, value] of Object.entries(map)) {
                if (value && typeof value === 'string' && value.startsWith('blob:')) {
                    // Парсим ключ для получения информации
                    let dictationId = '';
                    let lang = '';
                    let filename = '';
                    try {
                        const urlObj = new URL(key);
                        const pathParts = urlObj.pathname.split('/').filter(Boolean);
                        if (pathParts.length >= 4 && pathParts[0] === 'api' && pathParts[1] === 'dictations') {
                            dictationId = pathParts[2];
                            lang = pathParts[3];
                            filename = pathParts.slice(4).join('/');
                        }
                    } catch (e) {
                        filename = key;
                    }
                    entries.push({
                        cacheKey: key,
                        blobUrl: value,
                        dictationId: dictationId,
                        lang: lang,
                        filename: filename,
                    });
                }
            }
            // Сортируем по dictationId + filename
            entries.sort((a, b) => {
                const aKey = `${a.dictationId}/${a.filename}`;
                const bKey = `${b.dictationId}/${b.filename}`;
                return aKey.localeCompare(bKey);
            });
            return entries;
        } catch (e) {
            return [];
        }
    }

    async ensureCachedResponse(url) {
        try {
            const u = this.normalizeMediaUrl(url);
            if (!u || u.startsWith('blob:')) return false;

            const cacheKey = this._toCacheKey(u);
            if (!cacheKey) return false;

            const cache = await this.openMediaCache();
            if (!cache) return false;

            const existing = await cache.match(cacheKey);
            if (existing) return true;

            const fetchRes = await fetch(u, { cache: 'no-store' });
            if (!fetchRes || !fetchRes.ok) {
                try {
                    this._maybeNotifyStorageOutageFromResponse(u, fetchRes);
                } catch (e) {
                }
                return false;
            }
            await cache.put(cacheKey, fetchRes.clone());
            return true;
        } catch (e) {
            return false;
        }
    }

    async prefetchMediaUrls(urls, opts = {}) {
        try {
            const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
            if (!list.length) return { success: true, total: 0, cached: 0, failed: 0 };

            const concurrency = Math.max(1, Number(opts.concurrency) || 4);
            let idx = 0;
            let cached = 0;
            let failed = 0;

            const worker = async () => {
                while (true) {
                    const i = idx;
                    idx += 1;
                    if (i >= list.length) return;
                    const u = list[i];
                    const ok = await this.ensureCachedResponse(u);
                    if (ok) cached += 1;
                    else failed += 1;
                }
            };

            const workers = [];
            for (let i = 0; i < concurrency; i += 1) {
                workers.push(worker());
            }
            await Promise.all(workers);
            return { success: true, total: list.length, cached, failed };
        } catch (e) {
            return { success: false, total: 0, cached: 0, failed: 0 };
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
                    } else {
                        try {
                            this._maybeNotifyStorageOutageFromResponse(u, fetchRes);
                        } catch (e) {
                        }
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

    async _openB2LedgerDb() {
        return await new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(this._b2LedgerDbName);
                req.onupgradeneeded = () => {
                    try {
                        const db = req.result;
                        if (!db.objectStoreNames.contains(this._b2LedgerStoreName)) {
                            db.createObjectStore(this._b2LedgerStoreName, { keyPath: 'key' });
                        }
                    } catch (e) {
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async _idbGet(storeName, key) {
        const db = await this._openB2LedgerDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } finally {
            try { db.close(); } catch (e) {}
        }
    }

    async _idbPut(storeName, value) {
        const db = await this._openB2LedgerDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(value);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            });
        } finally {
            try { db.close(); } catch (e) {}
        }
    }

    async _sha256HexFromBlob(blob) {
        try {
            if (!blob || typeof blob.arrayBuffer !== 'function') return null;
            const buf = await blob.arrayBuffer();
            if (!buf) return null;
            const c = (typeof window !== 'undefined' && window.crypto) ? window.crypto : (typeof crypto !== 'undefined' ? crypto : null);
            if (!(c && c.subtle && typeof c.subtle.digest === 'function')) return null;
            const hashBuf = await c.subtle.digest('SHA-256', buf);
            const bytes = new Uint8Array(hashBuf);
            let out = '';
            for (let i = 0; i < bytes.length; i++) {
                out += bytes[i].toString(16).padStart(2, '0');
            }
            return out;
        } catch (e) {
            return null;
        }
    }

    _getB2LedgerKey(remotePath) {
        return `b2_ledger:${String(remotePath || '').trim()}`;
    }

    async _getB2Ledger(remotePath) {
        try {
            const k = this._getB2LedgerKey(remotePath);
            const row = await this._idbGet(this._b2LedgerStoreName, k);
            return row && row.value ? row.value : null;
        } catch (e) {
            return null;
        }
    }

    async _setB2Ledger(remotePath, value) {
        try {
            const k = this._getB2LedgerKey(remotePath);
            await this._idbPut(this._b2LedgerStoreName, { key: k, value, updated_at: Date.now() });
            return true;
        } catch (e) {
            return false;
        }
    }

    async getB2UploadUrl(token) {
        const t = String(token || '').trim();
        if (!t) return { ok: false, reason: 'missing_token' };
        const resp = await fetch('/api/b2/get_upload_url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${t}`
            },
            body: JSON.stringify({})
        });
        if (!resp.ok) {
            let text = '';
            try { text = await resp.text(); } catch (e) {}
            return { ok: false, reason: 'get_upload_url_failed', status: resp.status, text };
        }
        const json = await resp.json();
        if (!json || !json.success || !json.uploadUrl || !json.uploadAuthToken) {
            return { ok: false, reason: 'get_upload_url_bad_payload' };
        }
        return { ok: true, uploadUrl: json.uploadUrl, uploadAuthToken: json.uploadAuthToken };
    }

    async uploadDictationAudioFromCacheToB2({ dictationId, token, urls, shouldUpload = null, onUploaded = null, onProgress = null }) {
        try {
            if (!dictationId || !String(dictationId).startsWith('dict_')) {
                return { ok: false, reason: 'bad_dictation_id' };
            }
            const t = String(token || '').trim();
            if (!t) return { ok: false, reason: 'missing_token' };

            const list = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(Boolean)));
            if (list.length === 0) {
                return { ok: true, dictationId, urls: 0, cacheHit: 0, uploaded: 0, skipped: 0, failed: 0, cacheMiss: 0, hashed: 0 };
            }

            // Guard against multiple concurrent uploads for the same dictation.
            try {
                window.__B2_AUDIO_UPLOAD_INFLIGHT = window.__B2_AUDIO_UPLOAD_INFLIGHT || {};
                const k = String(dictationId);
                if (window.__B2_AUDIO_UPLOAD_INFLIGHT[k]) {
                    return { ok: false, reason: 'inflight' };
                }
                window.__B2_AUDIO_UPLOAD_INFLIGHT[k] = true;
            } catch (e) {
            }

            const up = await this.getB2UploadUrl(t);
            if (!up.ok) return { ok: false, reason: up.reason, status: up.status, text: up.text };

            let cacheHit = 0;
            let uploaded = 0;
            let skipped = 0;
            let failed = 0;
            let cacheMiss = 0;
            let hashed = 0;

            let processed = 0;
            for (const url of list) {
                processed += 1;
                try {
                    if (typeof onProgress === 'function') {
                        const pct = list.length ? Math.round((processed / list.length) * 100) : null;
                        onProgress({ processed, total: list.length, pct, url });
                    }
                } catch (e) {
                }

                try {
                    const u = new URL(this.normalizeMediaUrl(url), location.origin);
                    const m = u.pathname.match(/^\/api\/dictations\/(dict_[^/]+)\/([^/]+)\/(.+)$/);
                    if (!m) {
                        continue;
                    }
                    const urlDictId = m[1];
                    const lang = m[2];
                    const filename = m[3];
                    if (urlDictId !== dictationId) continue;

                    const remotePath = `dictations/${dictationId}/${lang}/${filename}`;

                    let cached = null;
                    try {
                        cached = await this.getCachedResponse(u.toString());
                    } catch (e) {
                        cached = null;
                    }
                    if (!cached) {
                        cacheMiss += 1;
                        continue;
                    }
                    cacheHit += 1;
                    const blob = await cached.blob();
                    if (!blob || !blob.size) continue;

                    let allow = true;
                    try {
                        if (typeof shouldUpload === 'function') {
                            allow = shouldUpload({ dictationId, lang, filename, remotePath, url: u.toString(), blob });
                        }
                    } catch (e) {
                        allow = false;
                    }
                    if (!allow) {
                        skipped += 1;
                        continue;
                    }

                    let sha256 = null;
                    try {
                        sha256 = await this._sha256HexFromBlob(blob);
                        if (sha256) hashed += 1;
                    } catch (e) {
                        sha256 = null;
                    }

                    if (sha256) {
                        try {
                            const prev = await this._getB2Ledger(remotePath);
                            if (prev && prev.sha256 && String(prev.sha256) === String(sha256) && Number(prev.size || 0) === Number(blob.size || 0)) {
                                try {
                                    if (typeof onUploaded === 'function') {
                                        onUploaded({ dictationId, lang, filename, remotePath, url: u.toString(), uploaded: false, skipped: true, deduped: true });
                                    }
                                } catch (e) {
                                }
                                skipped += 1;
                                continue;
                            }
                        } catch (e) {
                        }
                    }

                    const b2Resp = await fetch(up.uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': up.uploadAuthToken,
                            'X-Bz-File-Name': encodeURIComponent(remotePath),
                            'Content-Type': blob.type || 'b2/x-auto',
                            'X-Bz-Content-Sha1': 'do_not_verify'
                        },
                        body: blob
                    });
                    if (!b2Resp.ok) {
                        failed += 1;
                        continue;
                    }

                    uploaded += 1;
                    try {
                        await this._setB2Ledger(remotePath, { sha256: sha256 || null, size: Number(blob.size || 0), uploadedAt: Date.now() });
                    } catch (e) {
                    }
                    try {
                        if (typeof onUploaded === 'function') {
                            onUploaded({ dictationId, lang, filename, remotePath, url: u.toString(), uploaded: true, skipped: false, deduped: false });
                        }
                    } catch (e) {
                    }
                } catch (e) {
                    failed += 1;
                }
            }

            return {
                ok: failed === 0 && cacheMiss === 0,
                dictationId,
                urls: list.length,
                cacheHit,
                uploaded,
                skipped,
                failed,
                cacheMiss,
                hashed
            };
        } catch (e) {
            return { ok: false, reason: 'fatal', error: String(e && e.message ? e.message : e) };
        } finally {
            try {
                const k = String(dictationId || '');
                if (k && window.__B2_AUDIO_UPLOAD_INFLIGHT) {
                    window.__B2_AUDIO_UPLOAD_INFLIGHT[k] = false;
                }
            } catch (e) {
            }
        }
    }

    async cleanupStaleB2DictationAudio({ dictationId, token, keepRemotePaths }) {
        try {
            const id = String(dictationId || '').trim();
            if (!id || !id.startsWith('dict_')) return { ok: false, reason: 'bad_dictation_id' };
            const t = String(token || '').trim();
            if (!t) return { ok: false, reason: 'missing_token' };
            const keep_remote_paths = Array.isArray(keepRemotePaths) ? keepRemotePaths.filter(Boolean) : [];
            if (!keep_remote_paths.length) return { ok: true, skipped: true, reason: 'empty_keep_list' };

            const resp = await fetch('/api/b2/cleanup_dictation_audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${t}`
                },
                body: JSON.stringify({ dictation_id: id, keep_remote_paths })
            });
            return { ok: resp.ok, status: resp.status };
        } catch (e) {
            return { ok: false, reason: 'fatal', error: String(e && e.message ? e.message : e) };
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

let audioManager = null;
try {
    audioManager = window.AudioManager || null;
} catch (e) {
    audioManager = null;
}
if (!audioManager) {
    audioManager = new AudioManagerClass();
}
try {
    window.AudioManager = audioManager;
} catch (e) {
}
