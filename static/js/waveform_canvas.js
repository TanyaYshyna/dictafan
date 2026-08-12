/**
 * WaveformCanvas - Пользовательский визуализатор аудио-волн на основе canvas
 * Заменяет Peaks.js с полной интерактивной функциональностью
 */
class WaveformCanvas {
    constructor(containerElement, options = {}) {
        // Настройка контейнера и canvas
        this.container = containerElement;
        this.canvas = null;
        this.ctx = null;

        // Свойства аудио
        this.audioContext = null;
        this.audioBuffer = null;
        this.audioElement = null;
        this.duration = 0;
        this.currentTime = 0;
        this.isPlaying = false;

        // Визуальные свойства
        this.width = 0;
        this.height = 0;
        this.pixelRatio = window.devicePixelRatio || 1;

        // Свойства региона
        this.region = {
            start: 0,
            end: 0
        };

        // Позиция указателя воспроизведения
        this.playheadPosition = 0;

        // Состояние перетаскивания
        this.dragState = {
            isDragging: false,
            dragType: null, // 'playhead', 'start', 'end', null
            startX: 0,
            startTime: 0
        };

        // Конфигурация
        this.config = {
            // Цвета из CSS переменных (палитра --color-waveform-*)
            waveColor: this.getCSSVariable('--color-waveform-wave-inside'),
            // regionColor: this.getCSSVariable('--color-waveform-region-overlay'),
            startMarkerColor: this.getCSSVariable('--color-waveform-marker'),
            endMarkerColor: this.getCSSVariable('--color-panel-text-purple') || this.getCSSVariable('--color-waveform-marker'),
            playheadColor: this.getCSSVariable('--color-waveform-playhead'),
            backgroundColor: this.getCSSVariable('--color-waveform-bg-inside'),
            panelBgColor: this.getCSSVariable('--color-waveform-bg-outside'),

            // Размеры маркеров
            markerWidth: 14,
            playheadWidth: 1,

            // Интерактивные зоны
            hitZoneSize: 16
        };

        // Обработчики событий
        this.callbacks = {
            onRegionUpdate: null,
            onSeek: null,
            onReady: null,
            onPlaybackEnd: null
        };

        // Управление аудио
        this.currentAudio = null;
        this.playheadInterval = null;
        this.timeUpdateHandler = null;
        this.pauseHandler = null;
        this.endedHandler = null;

        // Объединяем пользовательские опции
        Object.assign(this.config, options);

        this.init();
    }

    /**
     * Получить значение CSS переменной
     */
    /**
     * Загружает ArrayBuffer из URL, используя XMLHttpRequest для blob: URL
     * (чтобы гарантированно обойти перехватчик fetch в auth_interceptor.js)
     * и fetch для обычных URL.
     */
    async _fetchArrayBuffer(url) {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.responseType = 'arraybuffer';
                xhr.onload = () => {
                    if (xhr.status === 0 || xhr.status === 200) {
                        resolve(xhr.response);
                    } else {
                        reject(new Error(`XHR failed with status ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('XHR error'));
                xhr.open('GET', url);
                xhr.send();
            });
        }
        const response = await fetch(url);
        return response.arrayBuffer();
    }

    getCSSVariable(variable) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(variable)
            .trim();
    }

    /**
     * Инициализация canvas и настройка
     */
    init() {
        if (!this.container) {
            throw new Error('Container element is required');
        }

        // Создаем canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Очищаем контейнер и добавляем canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');

        // Настраиваем наблюдатель изменения размера
        this.setupResizeObserver();

        // Настраиваем обработчики событий
        this.setupEventListeners();

        // Первоначальная отрисовка
        this.render();
    }

    /**
     * Настройка наблюдателя изменения размера для адаптивного canvas
     */
    setupResizeObserver() {
        const resizeObserver = new ResizeObserver(() => {
            this.resize();
        });
        resizeObserver.observe(this.container);
    }

    /**
     * Изменение размера canvas под контейнер
     */
    resize() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        // Если размеры контейнера равны 0, устанавливаем минимальные размеры
        if (this.width === 0 || this.height === 0) {
            // console.warn('WaveformCanvas: Контейнер имеет нулевые размеры, устанавливаем минимальные');
            this.width = Math.max(this.width, 800);
            this.height = Math.max(this.height, 90);
        }

        // Устанавливаем размер canvas с учетом пиксельного соотношения
        this.canvas.width = this.width * this.pixelRatio;
        this.canvas.height = this.height * this.pixelRatio;

        // Масштабируем контекст для четкой отрисовки
        this.ctx.scale(this.pixelRatio, this.pixelRatio);

        // Обновляем размер стиля canvas
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.render();
    }

    /**
     * Настройка обработчиков событий мыши
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('click', this.onClick.bind(this));

        // События касания для мобильных устройств
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    }

    /**
     * Загрузить аудио из уже существующего Audio элемента
     */
    async loadAudioFromElement(audioElement) {
        try {
            // Создаем аудио контекст если не существует
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Получаем URL аудио элемента
            const audioUrl = audioElement.src;

            // Получаем и декодируем аудио
            const arrayBuffer = await this._fetchArrayBuffer(audioUrl);
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const rawDurationEl = this.audioBuffer.duration || 0;
            this.duration = Math.floor(rawDurationEl * 100) / 100; // отсечение до сотых

            // Инициализируем регион на всю длительность
            this.region.end = this.duration;

            // Сбрасываем playhead в начало региона при загрузке нового источника
            if (typeof this.setCurrentTime === 'function') {
                this.setCurrentTime(this.region.start || 0);
            }

            // Отрисовываем волну
            this.render();

            // Вызываем callback готовности
            if (this.callbacks.onReady) {
                this.callbacks.onReady();
            }

        } catch (error) {
            console.error('❌ WaveformCanvas: Ошибка загрузки аудио из элемента:', error);
            throw error;
        }
    }
    async loadAudio(audioUrl) {
        try {
            // Создаем аудио контекст если не существует
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Получаем и декодируем аудио
            const arrayBuffer = await this._fetchArrayBuffer(audioUrl);
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const rawDuration = this.audioBuffer.duration || 0;
            this.duration = Math.floor(rawDuration * 100) / 100; // отсечение до сотых

            // Инициализируем регион на всю длительность
            this.region.end = this.duration;

            // Сбрасываем playhead в начало региона при загрузке нового источника
            if (typeof this.setCurrentTime === 'function') {
                this.setCurrentTime(this.region.start || 0);
            }

            // Отрисовываем волну
            this.render();

            // Вызываем callback готовности
            if (this.callbacks.onReady) {
                this.callbacks.onReady();
            }

        } catch (error) {
            console.error('❌ WaveformCanvas: Error loading audio:', error);
            throw error;
        }
    }

    /**
     * Получить длительность аудио
     */
    getDuration() {
        return this.duration;
    }

    /**
     * Установить время начала и конца региона
     */
    setRegion(start, end) {

        this.region.start = Math.max(0, Math.min(start, this.duration));
        this.region.end = Math.max(this.region.start, Math.min(end, this.duration));
        this.render();

        if (this.callbacks.onRegionUpdate) {
            this.callbacks.onRegionUpdate(this.region);
        }
    }

    /**
     * Получить текущий регион
     */
    getRegion() {
        return { ...this.region };
    }

    /**
     * Обновить регион
     */
    updateRegion({ start, end }) {
        if (start !== undefined) this.region.start = Math.max(0, Math.min(start, this.duration));
        if (end !== undefined) this.region.end = Math.max(this.region.start, Math.min(end, this.duration));
        console.log('🔧 WaveformCanvas: updateRegion вызван, новый регион:', this.region.start.toFixed(2), '-', this.region.end.toFixed(2));
        this.render();

        if (this.callbacks.onRegionUpdate) {
            console.log('🔧 WaveformCanvas: Вызываем callback onRegionUpdate');
            this.callbacks.onRegionUpdate(this.region);
        } else {
            console.warn('⚠️ WaveformCanvas: Callback onRegionUpdate не установлен!');
        }
    }

    /**
     * Установить текущее время (позиция указателя воспроизведения)
     */
    setCurrentTime(time) {
        this.currentTime = Math.max(0, Math.min(time, this.duration));
        this.playheadPosition = this.currentTime;

        // Синхронизируем позицию аудио с красной полоской только если аудио НЕ играет
        if (this.currentAudio && this.currentAudio.paused) {
            this.currentAudio.currentTime = this.currentTime;
        }

        this.render();
    }

    /**
     * Обновить позицию указателя воспроизведения из внешнего аудио элемента
     */
    updatePlayheadFromAudio(audioElement) {
        if (audioElement && this.duration > 0) {
            const currentTime = audioElement.currentTime || 0;
            this.playheadPosition = currentTime;
            this.currentTime = currentTime; // Синхронизируем currentTime тоже!
            this.render();
        }
    }

    /**
     * Получить текущее время
     */
    getCurrentTime() {
        return this.currentTime;
    }

    /**
     * Установить callback для обновлений региона
     */
    onRegionUpdate(callback) {
        this.callbacks.onRegionUpdate = callback;
    }

    /**
     * Установить callback для событий поиска
     */
    onSeek(callback) {
        this.callbacks.onSeek = callback;
    }

    /**
     * Установить callback для события готовности
     */
    onReady(callback) {
        this.callbacks.onReady = callback;
    }

    /**
     * Установить callback для события окончания воспроизведения
     */
    onPlaybackEnd(callback) {
        this.callbacks.onPlaybackEnd = callback;
    }

    /**
     * Запустить воспроизведение аудио с учетом региона
     */
    async startPlayback(audioElement) {
        if (!audioElement) {
            console.warn('WaveformCanvas: audioElement is null in startPlayback');
            return;
        }

        // Проверяем, что аудио загружено
        if (!audioElement.src) {
            console.warn('WaveformCanvas: audioElement.src is empty');
            return;
        }

        // Ждем загрузки аудио если нужно
        if (audioElement.readyState < 2) { // HAVE_CURRENT_DATA
            await new Promise((resolve, reject) => {
                audioElement.onloadeddata = resolve;
                audioElement.onerror = reject;
                // Таймаут на случай если загрузка зависнет
                setTimeout(() => reject(new Error('Timeout loading audio')), 5000);
            });
        }

        // Если регион невалидный / не установлен – растягиваем до всей длительности
        if (!this.region || this.region.end <= this.region.start) {
            if (this.region.end < this.region.start) {
                const st = this.region.start;
                this.region.start = this.region.end;
                this.region.end = st;
            } else if (this.region.end === this.region.start) {
                this.region.start = 0;
                this.region.end = this.duration || audioElement.duration || 0;
            }
        }

        // Определяем время начала воспроизведения
        let startTime = this.currentTime;

        // Если playhead за границами региона - перепрыгиваем на начало региона
        if (this.currentTime < this.region.start || this.currentTime > this.region.end) {
            startTime = this.region.start;
            this.setCurrentTime(startTime);
        }

        // Устанавливаем время начала для аудио
        audioElement.currentTime = Math.max(0, startTime || 0);

        // Начинаем контроль воспроизведения
        this.startAudioControl(audioElement);

        // Запускаем воспроизведение
        try {
            await audioElement.play();
        } catch (error) {
            console.error('❌ WaveformCanvas: Ошибка запуска воспроизведения:', error);
            throw error;
        }
    }

    /**
     * Очистить только интервал обновления (без остановки аудио)
     */
    clearPlayheadInterval() {
        if (this.playheadInterval) {
            clearInterval(this.playheadInterval);
            this.playheadInterval = null;
        }
    }


    startAudioControl(audioElement) {
        this.currentAudio = audioElement;
        this.isPlaying = true;

        // Уведомляем глобальный аудио менеджер о текущем плеере
        if (window.AudioManager) {
            window.AudioManager.setCurrent(audioElement);
        }

        // Очищаем предыдущие обработчики
        // this.stopAudioControl();

        // Обновление playhead через rAF для более плавной анимации
        const tick = () => {
            if (!this.isPlaying || !this.currentAudio) return;
            this.updatePlayheadFromAudio(audioElement);
            this.playheadInterval = requestAnimationFrame(tick);
        };
        this.playheadInterval = requestAnimationFrame(tick);

        // Добавляем обработчик timeupdate для более точного контроля
        const EPS = 0.0005; // небольшой допуск на сравнение времени
        this.timeUpdateHandler = () => {
            if (audioElement.currentTime + EPS >= this.region.end) {
                audioElement.pause();
                audioElement.currentTime = this.region.start; // Аудио прыгает в начало региона
                this.setCurrentTime(this.region.start); // Возвращаем playhead в начало региона
                this.isPlaying = false;

                // Вызываем callback окончания воспроизведения
                if (this.callbacks.onPlaybackEnd) {
                    this.callbacks.onPlaybackEnd();
                }

                // // Удаляем обработчик
                // audioElement.removeEventListener('timeupdate', this.timeUpdateHandler);
            }
        };
        audioElement.addEventListener('timeupdate', this.timeUpdateHandler);

        // Добавляем обработчик для события pause (когда аудио останавливается извне)
        this.pauseHandler = () => {
            this.isPlaying = false;
            this.stopAudioControl();
        };
        audioElement.addEventListener('pause', this.pauseHandler);

        // Добавляем обработчик для события ended (когда аудио заканчивается естественным образом)
        this.endedHandler = () => {
            this.isPlaying = false;
            this.stopAudioControl();

            // НЕ вызываем callback onPlaybackEnd - это делает плеер в playAudioFile
            // Плеер сам управляет состоянием кнопки через свой onended
        };
        audioElement.addEventListener('ended', this.endedHandler);
    }

    /**
     * Остановить управление воспроизведением аудио
     */
    stopAudioControl() {
        // Сохраняем текущую позицию аудио перед остановкой
        let currentAudioTime = 0;
        if (this.currentAudio) {
            currentAudioTime = this.currentAudio.currentTime;
            this.currentAudio.pause();
        }

        // Обновляем позицию playhead на текущую позицию аудио
        this.playheadPosition = currentAudioTime;
        this.currentTime = currentAudioTime;

        // Перерисовываем для отображения актуальной позиции
        this.render();

        // Очищаем обновление playhead
        if (this.playheadInterval) {
            if (typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(this.playheadInterval);
            } else {
                clearInterval(this.playheadInterval);
            }
            this.playheadInterval = null;
        }

        // Удаляем обработчики событий
        if (this.currentAudio) {
            if (this.timeUpdateHandler) {
                this.currentAudio.removeEventListener('timeupdate', this.timeUpdateHandler);
                this.timeUpdateHandler = null;
            }
            if (this.pauseHandler) {
                this.currentAudio.removeEventListener('pause', this.pauseHandler);
                this.pauseHandler = null;
            }
            if (this.endedHandler) {
                this.currentAudio.removeEventListener('ended', this.endedHandler);
                this.endedHandler = null;
            }
        }

        this.currentAudio = null;
        this.isPlaying = false;
    }

    /**
     * Обновить позицию аудио при клике по волне
     */
    updateAudioPosition(time) {
        if (this.currentAudio) {
            // Проверяем, не выходим ли мы за границы региона
            if (time < this.region.start) {
                time = this.region.start;
            } else if (time > this.region.end) {
                time = this.region.end;
            }
            this.currentAudio.currentTime = time;
        }
    }

    /**
     * Основной метод отрисовки - рисует все
     */
    render() {
        if (!this.ctx || !this.width || !this.height) return;

        // Очищаем canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Рисуем фон
        this.drawBackground();

        // Рисуем волну если аудио загружено
        if (this.audioBuffer) {
            // Волна снаружи региона затемнённая, внутри яркая
            this.drawWaveform();

            // Жёлтый полупрозрачный прямоугольник региона поверх волны
            this.drawRegion();

            // Маркеры
            this.drawMarkers();

            // Playhead
            this.drawPlayhead();
        }
    }

    /**
     * Рисование фона
     * Внутри региона — фиолетовый фон (цвет волны).
     * Снаружи региона — чуть темнее фона (затемнённый фиолетовый).
     */
    drawBackground() {
        if (this.duration === 0) {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.width, this.height);
            return;
        }

        const startX = (this.region.start / this.duration) * this.width;
        const endX = (this.region.end / this.duration) * this.width;

        // Снаружи региона — цвет панели (бежевый), чуть темнее
        const darkPanelBg = this._darkenColor(this.config.panelBgColor, 0.15);
        this.ctx.fillStyle = darkPanelBg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Внутри региона — фиолетовый фон (цвет волны)
        this.ctx.fillStyle = this.config.backgroundColor;
        this.ctx.fillRect(startX, 0, endX - startX, this.height);
    }

    /**
     * Затемнить цвет на заданную величину (0 = без изменений, 1 = чёрный)
     * Поддерживает форматы: rgb/rgba(...), #rgb, #rrggbb, #rrggbbaa
     */
    _darkenColor(color, amount) {
        let r, g, b;

        // Парсим rgb/rgba строку
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1]);
            g = parseInt(rgbMatch[2]);
            b = parseInt(rgbMatch[3]);
        } else {
            // Парсим hex (#rgb, #rrggbb, #rrggbbaa)
            const hex = color.replace('#', '');
            if (hex.length >= 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                return color;
            }
        }

        if (r !== undefined && g !== undefined && b !== undefined) {
            r = Math.max(0, Math.round(r * (1 - amount)));
            g = Math.max(0, Math.round(g * (1 - amount)));
            b = Math.max(0, Math.round(b * (1 - amount)));
            return `rgb(${r}, ${g}, ${b})`;
        }

        return color;
    }

    /**
     * Рисование аудио волны
     * Снаружи региона — цвет панели (бежевый), чуть темнее.
     * Внутри региона — яркий фиолетовый (цвет волны).
     */
    drawWaveform() {
        if (!this.audioBuffer) return;

        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / this.width);
        const amp = this.height / 2;

        const startX = (this.region.start / this.duration) * this.width;
        const endX = (this.region.end / this.duration) * this.width;

        // Затемнённый цвет панели для внешней части
        const dimColor = this._darkenColor(this.config.panelBgColor, 0.3);

        for (let i = 0; i < this.width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            const x = i;
            const y = (1 + min) * amp;
            const barHeight = Math.max(1, (max - min) * amp);

            // Внутри региона — яркий цвет, снаружи — затемнённый цвет панели
            if (x >= startX && x <= endX) {
                this.ctx.fillStyle = this.config.waveColor;
            } else {
                this.ctx.fillStyle = dimColor;
            }
            this.ctx.fillRect(x, y, 1, barHeight);
        }
    }

    /**
     * Рисование наложения региона — жёлтый прямоугольник на всю высоту
     */
    drawRegion() {
        if (this.duration === 0) return;

        const startX = (this.region.start / this.duration) * this.width;
        const endX = (this.region.end / this.duration) * this.width;
        const regionWidth = endX - startX;

        // Жёлтый прямоугольник на всю высоту (цвет --color-waveform-region-overlay, 15% opacity)
        this.ctx.fillStyle = 'rgba(248, 205, 70, 0.15)';
        this.ctx.fillRect(startX, 0, regionWidth, this.height);
    }


    /**
     * Рисование маркеров начала и конца
     */
    drawMarkers() {
        if (this.duration === 0) return;

        const startX = (this.region.start / this.duration) * this.width;
        const endX = (this.region.end / this.duration) * this.width;

        // Маркер начала
        this.drawMarker(startX, this.config.startMarkerColor, 'start');

        // Маркер конца
        this.drawMarker(endX, this.config.endMarkerColor, 'end');
    }

    /**
     * Рисование отдельного маркера (на всю высоту канваса)
     */
    drawMarker(x, color, type) {
        const handleWidth = this.config.markerWidth;
        const handleY = 0;
        const handleHeight = this.height;
        const radius = 6;

        // Позиция ручки
        const rectX = x - handleWidth / 2;
        const rectY = handleY;
        const rectW = handleWidth;
        const rectH = handleHeight;

        // Рисуем ручку маркера со скруглёнными углами
        this.ctx.fillStyle = color;
        this.ctx.beginPath();

        if (type === 'start') {
            // Левый маркер: левые углы скруглённые, правые — прямые
            this.ctx.moveTo(rectX + radius, rectY);
            this.ctx.lineTo(rectX + rectW, rectY);
            this.ctx.lineTo(rectX + rectW, rectY + rectH);
            this.ctx.lineTo(rectX + radius, rectY + rectH);
            this.ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
            this.ctx.lineTo(rectX, rectY + radius);
            this.ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
        } else {
            // Правый маркер: правые углы скруглённые, левые — прямые
            this.ctx.moveTo(rectX, rectY);
            this.ctx.lineTo(rectX + rectW - radius, rectY);
            this.ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
            this.ctx.lineTo(rectX + rectW, rectY + rectH - radius);
            this.ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
            this.ctx.lineTo(rectX, rectY + rectH);
        }

        this.ctx.closePath();
        this.ctx.fill();

        // Три вертикальные точки внутри ручки (по центру высоты канваса)
        this.ctx.fillStyle = this.getCSSVariable('--color-waveform-marker-dots');
        const dotSize = 2.5;
        const dotSpacing = 6;
        const centerY = rectY + rectH / 2;
        for (let i = -1; i <= 1; i++) {
            const dotY = centerY + i * dotSpacing;
            this.ctx.beginPath();
            this.ctx.arc(x, dotY, dotSize, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Символ < или > в нижней части маркера (тем же цветом, что и три точки)
        this.ctx.fillStyle = this.getCSSVariable('--color-waveform-marker-dots');
        this.ctx.font = 'bold 11px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        var symbol = (type === 'start') ? '<' : '>';
        // Рисуем символ в нижней части ручки (на 6px выше нижнего края)
        this.ctx.fillText(symbol, x, rectY + rectH - 10);
    }

    /**
     * Рисование указателя воспроизведения
     */
    drawPlayhead() {
        if (this.duration === 0) return;

        const x = (this.playheadPosition / this.duration) * this.width;

        // Тонкая линия указателя воспроизведения
        this.ctx.strokeStyle = this.config.playheadColor;
        this.ctx.lineWidth = this.config.playheadWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.height);
        this.ctx.stroke();

        // Floating label со временем (как на mp3cut.net)
        const timeText = this._formatTime(this.playheadPosition);
        const labelPadding = 6;
        const labelHeight = 22;
        const labelY = 4;

        this.ctx.font = 'bold 12px Arial, sans-serif';
        const textWidth = this.ctx.measureText(timeText).width;
        const labelWidth = textWidth + labelPadding * 2;

        // Скруглённый прямоугольник для label
        const labelX = x - labelWidth / 2;
        const labelRadius = 6;

        this.ctx.fillStyle = this.config.playheadColor;
        this.ctx.beginPath();
        this.ctx.moveTo(labelX + labelRadius, labelY);
        this.ctx.lineTo(labelX + labelWidth - labelRadius, labelY);
        this.ctx.quadraticCurveTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + labelRadius);
        this.ctx.lineTo(labelX + labelWidth, labelY + labelHeight - labelRadius);
        this.ctx.quadraticCurveTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - labelRadius, labelY + labelHeight);
        this.ctx.lineTo(labelX + labelRadius, labelY + labelHeight);
        this.ctx.quadraticCurveTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - labelRadius);
        this.ctx.lineTo(labelX, labelY + labelRadius);
        this.ctx.quadraticCurveTo(labelX, labelY, labelX + labelRadius, labelY);
        this.ctx.closePath();
        this.ctx.fill();

        // Текст времени
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(timeText, x, labelY + labelHeight / 2);
    }

    /**
     * Форматирование времени в мм:сс.сс
     */
    _formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const wholeSecs = Math.floor(secs);
        const centiseconds = Math.floor((secs - wholeSecs) * 100);
        return `${String(mins).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
    }

    /**
    * Обновление позиции курсора на основе текущего времени аудио
    */
    updatePlayheadFromAudio(audioElement) {
        if (!audioElement || !this.audioBuffer) return;

        // Обновляем логическое время и позицию (в секундах), а не пиксели
        const currentTime = audioElement.currentTime || 0;
        this.currentTime = currentTime;
        this.playheadPosition = currentTime;

        // Перерисовываем волну с новым положением курсора
        this.render();
    }


    /**
     * Обработчики событий мыши
     */
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Проверяем что было кликнуто
        const hitTarget = this.getHitTarget(x, y);

        if (hitTarget) {
            e.preventDefault();
            this.dragState.isDragging = true;
            this.dragState.dragType = hitTarget.type;
            this.dragState.startX = x;
            this.dragState.startTime = this.timeFromX(x);

            this.canvas.style.cursor = 'grabbing';
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!this.dragState.isDragging) {
            // Обновляем курсор в зависимости от того что под мышью
            const hitTarget = this.getHitTarget(x, y);
            if (hitTarget) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.canvas.style.cursor = 'default';
            }
            return;
        }

        e.preventDefault();

        const newTime = this.timeFromX(x);

        switch (this.dragState.dragType) {
            case 'playhead':
                this.setCurrentTime(newTime);
                if (this.callbacks.onSeek) {
                    this.callbacks.onSeek(newTime);
                }
                break;

            case 'start':
                this.updateRegion({ start: newTime });
                break;

            case 'end':
                this.updateRegion({ end: newTime });
                break;
        }
    }

    onMouseUp(e) {
        if (this.dragState.isDragging) {
            this.dragState.isDragging = false;
            this.dragState.dragType = null;
            this.canvas.style.cursor = 'default';
        }
    }

    onClick(e) {
        // Only handle clicks if not dragging
        if (this.dragState.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Передаем только координаты клика, WaveformCanvas сам разберется
        this.handleClick(x);
    }

    /**
     * Обработать клик по координатам X
     */
    handleClick(x) {
        const time = this.timeFromX(x);

        // Определяем куда должна перепрыгнуть красная полоска
        let targetTime = time;

        // Если клик в пределах региона - перепрыгиваем туда
        if (time >= this.region.start && time <= this.region.end) {
            targetTime = time;
        } else {
            // Если клик за пределами региона - перепрыгиваем на начало региона
            targetTime = this.region.start;
        }

        // Устанавливаем позицию playhead
        this.setCurrentTime(targetTime);

        // Обновляем позицию аудио если оно играет
        this.updateAudioPosition(targetTime);

        if (this.callbacks.onSeek) {
            this.callbacks.onSeek(targetTime);
        }
    }

    /**
     * Обработчики событий касания
     */
    onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.onMouseDown(mouseEvent);
    }

    onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.onMouseMove(mouseEvent);
    }

    onTouchEnd(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        this.onMouseUp(mouseEvent);
    }

    /**
     * Получить цель попадания по координатам
     */
    getHitTarget(x, y) {
        if (this.duration === 0) return null;

        const halfHitZone = this.config.hitZoneSize / 2;

        // Проверяем маркер начала (по всей высоте, т.к. маркеры теперь толще)
        const startX = (this.region.start / this.duration) * this.width;
        if (Math.abs(x - startX) <= halfHitZone) {
            return { type: 'start', x: startX };
        }

        // Проверяем маркер конца
        const endX = (this.region.end / this.duration) * this.width;
        if (Math.abs(x - endX) <= halfHitZone) {
            return { type: 'end', x: endX };
        }

        // Проверяем указатель воспроизведения (только в верхней части, где label)
        const playheadX = (this.playheadPosition / this.duration) * this.width;
        if (Math.abs(x - playheadX) <= halfHitZone && y <= 40) {
            return { type: 'playhead', x: playheadX };
        }

        return null;
    }

    /**
     * Преобразовать X координату во время
     */
    timeFromX(x) {
        if (this.duration === 0) return 0;
        return Math.max(0, Math.min((x / this.width) * this.duration, this.duration));
    }

    /**
     * Преобразовать время в X координату
     */
    xFromTime(time) {
        if (this.duration === 0) return 0;
        return (time / this.duration) * this.width;
    }

    /**
     * Показать волну (включить видимость всех элементов)
     */
    show() {
        if (this.container) {
            this.container.style.visibility = 'visible';
        }
        if (this.canvas) {
            this.canvas.style.visibility = 'visible';
        }
    }

    /**
     * Скрыть волну (выключить видимость всех элементов)
     */
    hide() {
        if (this.container) {
            this.container.style.visibility = 'hidden';
        }
        if (this.canvas) {
            this.canvas.style.visibility = 'hidden';
        }
    }

    /**
     * Проверить видима ли волна
     */
    isVisible() {
        return this.container && this.container.style.visibility !== 'hidden';
    }

    /**
     * Уничтожить волну и очистить ресурсы
     */
    destroy() {
        // Очищаем обработчики аудио
        this.stopAudioControl();

        if (this.audioContext) {
            this.audioContext.close();
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
