/**
 * Класс для управления панелью прогресса (статистикой)
 * Отслеживает изменения и обновляет UI, а также сохраняет в историю
 */
class ProgressPanel {
    constructor(activityHistory, options = {}) {
        this.history = activityHistory;
        this.saveInterval = options.saveInterval || 5; // Сохранять каждые N заданий
        this.taskCount = 0;
        this._dirty = false; // есть несохраненный прогресс
        this._lastSaveOk = true; // последний save прошел успешно
        
        // Элементы DOM для статистики
        this.elements = {
            timer: document.getElementById('timer'),
            timerSettings: document.getElementById('btn-timer-settings'),
            perfect: document.getElementById('count-perfect'),
            corrected: document.getElementById('count-corrected'),
            audio: document.getElementById('count-audio'),
            total: document.getElementById('count-total'),
            // Модальные элементы
            modalTimer: document.getElementById('modal_timer'),
            modalTimerSettings: document.getElementById('btn-modal-timer-settings'),
            modalPerfect: document.getElementById('modal-count-perfect'),
            modalCorrected: document.getElementById('modal-count-corrected'),
            modalAudio: document.getElementById('modal-count-audio'),
            modalTotal: document.getElementById('modal-count-total')
        };

        // Текущие значения статистики
        this.stats = {
            timer: 0, // секунды
            circleNumber: 0,
            perfect: 0,
            corrected: 0,
            audio: 0,
            total: 0
        };

        // Таймер для отслеживания времени
        this.timerInterval = null;
        this.timerState = {
            sessionActive: false,
            dictationAccumulatedMs: 0,
            dictationPeriodStart: null,
            dictationPeriodEnd: null,
            countdownDefaultSeconds: 0,
            countdownRemainingMs: 0,
            lastTickTs: null
        };

        // Настройки режима времени
        this.timerMode = 'clock'; // clock | countdown
        this.countdownEnabled = false;
        this.countdownDuration = 0; // seconds (значение по умолчанию)
        this.countdownRemaining = 0; // seconds (отображение оставшегося времени)
        this.countdownExpired = false;
        this.timerDialog = null;
        this.timerDialogElements = null;
        this._beepCtx = null;
        this.timerSounds = [];
        this.timerSoundsLoaded = false;
        this.victorySounds = [];
        this.victorySoundsLoaded = false;
        this.timerPreferenceKey = 'progressPanelTimerPreference';
        this._lucideRetryScheduled = false;
        this._suppressDirty = false;
    }

    /**
     * Генерирует HTML для панели прогресса
     * @param {('inline'|'modal')} variant - вариант отображения (определяет префикс ID)
     * @returns {string} HTML строка
     */
    _generateHTML(variant = 'inline') {
        const prefix = variant === 'modal' ? 'modal-' : '';
        const timerId = variant === 'modal' ? 'modal_timer' : 'timer';
        const timerBtnId = variant === 'modal' ? 'btn-modal-timer' : 'btn-timer';
        const timerSettingsId = variant === 'modal' ? 'btn-modal-timer-settings' : 'btn-timer-settings';
        
        return `
            <table class="table-progress">
                <colgroup>
                    <col class="progress-col">
                    <col class="progress-col">
                    <col class="progress-col">
                    <col class="progress-col">
                </colgroup>
                <tr>
                    <td colspan="2">
                        <button id="${timerSettingsId}" class="pp-timer-settings" title="Время работы над диктантом">
                            <i data-lucide="clock"></i>
                            <span id="${timerId}" class="timer-value">00:00:00</span>
                        </button>
                    </td>
                    <td colspan="2">
                        <button id="${timerBtnId}" class="pp-timer" disabled title="Таймер">
                            <span class="timer-label">Таймер</span>
                            <span class="timer-value" hidden>00:00:00</span>
                            <i data-lucide="timer"></i>
                        </button>
                    </td>
                </tr>
                <tr>
                    <td>
                        <button id="btn-${prefix}count-perfect" class="pp-perfect" disabled title="Количество предложений набранных без ошибок с 1-й попытки">
                            <i data-lucide="star"></i>
                            <span id="${prefix}count-perfect">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-corrected" class="pp-corrected" disabled title="Количество набранных предложений">
                            <i data-lucide="star-half"></i>
                            <span id="${prefix}count-corrected">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-audio" class="pp-audio" disabled title="Сколько предложений прошло аудио контроль">
                            <i data-lucide="mic-off"></i>
                            <span id="${prefix}count-audio">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-total" class="pp-total" disabled title="Общее количество предложений">
                            <i data-lucide="layers"></i>
                            <span id="${prefix}count-total">0</span>
                        </button>
                    </td>
                </tr>
            </table>
        `;
    }

    /**
     * Рендер панели в указанный контейнер
     * @param {HTMLElement} container
     * @param {('inline'|'modal')} variant
     */
    render(container, variant = 'inline') {
        if (!container) return;

        // Используем общий метод генерации HTML
        container.innerHTML = this._generateHTML(variant);

        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }

        // перенастроим элементы после рендера
        this.elements = {
            timer: document.getElementById('timer'),
            timerSettings: document.getElementById('btn-timer-settings'),
            perfect: document.getElementById('count-perfect'),
            corrected: document.getElementById('count-corrected'),
            audio: document.getElementById('count-audio'),
            total: document.getElementById('count-total'),
            modalTimer: document.getElementById('modal_timer'),
            modalTimerSettings: document.getElementById('btn-modal-timer-settings'),
            modalPerfect: document.getElementById('modal-count-perfect'),
            modalCorrected: document.getElementById('modal-count-corrected'),
            modalAudio: document.getElementById('modal-count-audio'),
            modalTotal: document.getElementById('modal-count-total')
        };

        // Обновим UI сразу
        this.updateUI();
        
        // Убеждаемся, что таймер показывает 00:00:00 при первом рендере
        this.stats.timer = 0;
        this.updateTimer();
        this._loadTimerPreference();
        this._initTimerControls();
        // Загружаем список звуков таймера
        this._loadTimerSounds();
        // Загружаем список звуков победы
        this._loadVictorySounds();
        
        // Обновим глобальные переменные для совместимости со старым кодом
        if (typeof window !== 'undefined') {
            // Обновляем ссылки на элементы таймера для старой системы
            const timerEl = document.getElementById('timer');
            const modalTimerEl = document.getElementById('modal_timer');
            if (timerEl) {
                window.dictationTimerElement = timerEl;
            }
            if (modalTimerEl) {
                window.modalTimerElement = modalTimerEl;
            }
        }

        this.markClean({ lastSaveOk: true });
    }

    /**
     * Инициализация - загрузка истории
     */
    async init(dictationId) {
        // Загружаем историю текущего месяца
        await this.history.loadCurrentMonth();

        // Ищем существующую сессию за сегодня
        const todaySession = this.history.findTodaySession(dictationId);
        
        if (todaySession) {
            // Восстанавливаем статистику из истории
            // В "statistics" теперь нет полей "number" и "end", только date, perfect, corrected, audio, total
            this.stats.perfect = todaySession.perfect || 0;
            this.stats.corrected = todaySession.corrected || 0;
            this.stats.audio = todaySession.audio || 0;
            this.stats.circleNumber = 0; // "number" больше не сохраняется в "statistics"
            
            // Продолжаем сессию (в "statistics" нет поля "end" для проверки завершения)
            this.history.startSession(dictationId);
            this.history.currentSession = { ...todaySession };
        } else {
            // Начинаем новую сессию
            this.history.startSession(dictationId);
        }

        // Обновляем UI
        this.updateUI();
        
        // Обновляем streak при инициализации
        await this.updateStreak();
        this.markClean();
    }

    /**
     * Запускает (или возобновляет) учет времени диктанта.
     * @param {{ resetCountdown?: boolean, resetAccumulated?: boolean }} [options]
     */
    startSession(options = {}) {
        const now = Date.now();
        if (options.resetAccumulated) {
            this.timerState.dictationAccumulatedMs = 0;
        }

        if (this.countdownEnabled) {
            if (options.resetCountdown || this.timerState.countdownRemainingMs <= 0) {
                const baseSeconds = this.countdownDuration > 0
                    ? this.countdownDuration
                    : (this.timerState.countdownDefaultSeconds > 0 ? this.timerState.countdownDefaultSeconds : 0);
                this._setCountdownSeconds(baseSeconds);
            }
        }

        if (!this.timerState.sessionActive) {
            this.countdownExpired = false;
            this.timerState.sessionActive = true;
            this.timerState.dictationPeriodStart = now;
            this.timerState.dictationPeriodEnd = null;
            this.timerState.lastTickTs = now;
            this._ensureTicking();
        }

        this.updateTimer();
    }

    /**
     * Приостанавливает учет времени (используется для паузы/модалок).
     */
    pauseSession() {
        if (!this.timerState.sessionActive) {
            return;
        }

        const now = Date.now();
        this._captureElapsed(now);

        this.timerState.sessionActive = false;
        this.timerState.dictationPeriodStart = null;
        this.timerState.dictationPeriodEnd = now;
        this.timerState.lastTickTs = null;

        this._stopTickingIfIdle();
        this.updateTimer();
    }

    /**
     * Возобновляет учет времени после паузы.
     */
    resumeSession() {
        if (this.timerState.sessionActive) {
            return;
        }

        this.startSession();
    }

    /**
     * Полностью останавливает учет времени.
     * Можно опционально сбросить накопленные значения.
     */
    stopSession({ resetAccumulated = false, resetCountdown = false } = {}) {
        this.pauseSession();

        if (resetAccumulated) {
            this.timerState.dictationAccumulatedMs = 0;
        }

        if (resetCountdown) {
            this._resetCountdownToDefault();
        }

        this.updateTimer();
    }

    /**
     * Совместимость со старым API таймера
     */
    startTimer(options) {
        this.startSession(options);
    }

    pauseTimer() {
        this.pauseSession();
    }

    resumeTimer() {
        this.resumeSession();
    }

    stopTimer(options) {
        this.stopSession(options);
    }

    /**
     * Обновляет отображение таймера на основе текущего состояния.
     */
    updateTimer() {
        const now = Date.now();

        const elapsedSeconds = Math.floor(this._computeClockMs(now) / 1000);
        const timerValue = elapsedSeconds;
        const elapsedHours = Math.floor(elapsedSeconds / 3600);
        const elapsedMinutes = Math.floor((elapsedSeconds % 3600) / 60);
        const elapsedSecs = elapsedSeconds % 60;
        const formattedElapsed = `${String(elapsedHours).padStart(2, '0')}:${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`;

        let formattedCountdown = formattedElapsed;
        if (this.countdownEnabled) {
            const remainingSeconds = Math.floor(this._computeCountdownMs(now) / 1000);
            this.countdownRemaining = remainingSeconds;
            const remHours = Math.floor(remainingSeconds / 3600);
            const remMinutes = Math.floor((remainingSeconds % 3600) / 60);
            const remSecs = remainingSeconds % 60;
            formattedCountdown = `${String(remHours).padStart(2, '0')}:${String(remMinutes).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
        }

        // timer stat keeps elapsed seconds (for history/compat)
        this.stats.timer = elapsedSeconds;

        // Обновляем элементы, если они есть в this.elements
        if (this.elements.timer) {
            this.elements.timer.textContent = formattedElapsed;
        }
        if (this.elements.modalTimer) {
            this.elements.modalTimer.textContent = formattedElapsed;
        }
        
        // Также обновляем элементы напрямую из DOM (на случай, если они не были найдены при рендере)
        const timerEl = document.getElementById('timer');
        const modalTimerEl = document.getElementById('modal_timer');
        if (timerEl) {
            timerEl.textContent = formattedElapsed;
            if (!this.elements.timer) {
                this.elements.timer = timerEl;
            }
        }
        if (modalTimerEl) {
            modalTimerEl.textContent = formattedElapsed;
            if (!this.elements.modalTimer) {
                this.elements.modalTimer = modalTimerEl;
            }
        }

        if (this.history.currentSession) {
            this.history.currentSession.timer_seconds = timerValue;
        }

        if (window.dictationStatistics && typeof window.dictationStatistics.updateTimer === 'function') {
            try {
                window.dictationStatistics.updateTimer(timerValue);
            } catch (error) {
                console.warn('dictationStatistics.updateTimer error:', error);
            }
        }

        // Обновляем широкую кнопку таймера: либо слово "Таймер", либо оставшееся время
        try {
            const applyBtnValue = (btnId) => {
                const btn = document.getElementById(btnId);
                if (!btn) return;
                const valueNode = btn.querySelector('.timer-value');
                if (valueNode) valueNode.textContent = formattedCountdown;
            };
            applyBtnValue('btn-timer');
            applyBtnValue('btn-modal-timer');
        } catch (e) {
        }
        this.updateTimerButtons();
    }

    updateTimerButtons() {
        const shouldShowValue = !!(this.countdownEnabled && this.timerState && this.timerState.countdownRemainingMs > 0);
        const apply = (btnId) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const label = btn.querySelector('.timer-label');
            const value = btn.querySelector('.timer-value');
            if (label) label.hidden = shouldShowValue;
            if (value) value.hidden = !shouldShowValue;
        };
        apply('btn-timer');
        apply('btn-modal-timer');
    }

    updateTimerIcon() {
        // Backward-compat: icon switching was removed from UI, but some older code still calls this.
        this.updateTimerButtons();
    }

    /**
     * Возвращает снимок состояния таймера для внешнего кода.
     */
    getTimerSnapshot() {
        const now = Date.now();
        const elapsedMs = this._computeClockMs(now);
        const countdownMs = this._computeCountdownMs(now);

        return {
            mode: this.timerMode,
            isRunning: this.timerState.sessionActive,
            elapsedMs,
            countdownRemainingMs: countdownMs,
            displaySeconds: this._computeTimerSeconds(now),
            accumulatedMs: this.timerState.dictationAccumulatedMs,
            periodStart: this.timerState.dictationPeriodStart,
            periodEnd: this.timerState.dictationPeriodEnd,
            defaultCountdownSeconds: this.timerState.countdownDefaultSeconds
        };
    }

    _ensureTicking() {
        if (this.timerInterval) {
            return;
        }

        this.timerInterval = setInterval(() => this._onTick(), 250);
    }

    _onTick() {
        if (!this.timerState.sessionActive) {
            this._stopTickingIfIdle();
            return;
        }

        const now = Date.now();
        this._captureElapsed(now);

        if (this.countdownEnabled && this.timerState.countdownRemainingMs <= 0) {
            if (!this.countdownExpired) {
                this.countdownExpired = true;
                this.timerState.countdownRemainingMs = 0;
                this.countdownRemaining = 0;
                this.timerState.sessionActive = false;
                this.timerState.dictationPeriodStart = null;
                this.timerState.dictationPeriodEnd = now;
                this.timerState.lastTickTs = null;
                this._stopTickingIfIdle();
                this.updateTimer();
                this._handleCountdownFinished();
                return;
            }
        } else {
            this.countdownExpired = false;
        }

        this.updateTimer();
    }

    _stopTickingIfIdle() {
        if (this.timerInterval && !this.timerState.sessionActive) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    _captureElapsed(now = Date.now()) {
        if (!this.timerState.sessionActive) {
            this.timerState.lastTickTs = now;
            return;
        }

        const lastTick = this.timerState.lastTickTs
            ?? this.timerState.dictationPeriodStart
            ?? now;
        const delta = Math.max(0, now - lastTick);

        this.timerState.dictationAccumulatedMs += delta;

        if (this.countdownEnabled) {
            this.timerState.countdownRemainingMs = Math.max(0, this.timerState.countdownRemainingMs - delta);
        }

        this.timerState.lastTickTs = now;
    }

    _computeTimerSeconds(now = Date.now()) {
        if (this.countdownEnabled) {
            return Math.floor(this._computeCountdownMs(now) / 1000);
        }
        return Math.floor(this._computeClockMs(now) / 1000);
    }

    _computeClockMs(now = Date.now()) {
        let base = this.timerState.dictationAccumulatedMs;
        if (this.timerState.sessionActive) {
            const lastTick = this.timerState.lastTickTs
                ?? this.timerState.dictationPeriodStart
                ?? now;
            base += Math.max(0, now - lastTick);
        }
        return Math.max(0, base);
    }

    _computeCountdownMs(now = Date.now()) {
        let remaining = this.timerState.countdownRemainingMs;
        if (this.timerState.sessionActive) {
            const lastTick = this.timerState.lastTickTs
                ?? this.timerState.dictationPeriodStart
                ?? now;
            remaining = Math.max(0, remaining - Math.max(0, now - lastTick));
        }
        return Math.max(0, remaining);
    }

    _setCountdownSeconds(totalSeconds) {
        const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
        this.countdownDuration = safeSeconds;
        this.countdownRemaining = safeSeconds;
        this.timerState.countdownDefaultSeconds = safeSeconds;
        this.timerState.countdownRemainingMs = safeSeconds * 1000;
        this.timerState.lastTickTs = null;
        this.countdownExpired = false;
    }

    _resetCountdownToDefault() {
        const base = this.timerState.countdownDefaultSeconds || this.countdownDuration || 0;
        this._setCountdownSeconds(base);
    }

    /**
     * Установить значение статистики
     */
    setStat(key, value) {
        if (!this.stats.hasOwnProperty(key)) return;
        if (this.stats[key] === value) return;
        this.stats[key] = value;
        this.updateUI();
        if (!this._suppressDirty) {
            this.checkAndSave();
            this._dirty = true;
            this.updateUnsavedIndicators();
        }
    }

    /**
     * Увеличить значение статистики
     */
    incrementStat(key, amount = 1) {
        if (!this.stats.hasOwnProperty(key)) return;
        if (!amount) return;
        this.stats[key] += amount;
        this.updateUI();
        if (!this._suppressDirty) {
            this.checkAndSave();
            this._dirty = true;
            this.updateUnsavedIndicators();
        }
    }

    /**
     * Обновить UI со всеми значениями статистики
     */
    updateUI() {
        const safe = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        };
        console.log('[Timer] updateUI -> mode=%s perfect=%s corrected=%s audio=%s total=%s circleNumber=%s timer=%s', this.timerMode, this.stats.perfect, this.stats.corrected, this.stats.audio, this.stats.total, this.stats.circleNumber, this.stats.timer);

        // Обновляем основной UI
        if (this.elements.perfect) {
            this.elements.perfect.textContent = safe(this.stats.perfect);
        }
        if (this.elements.corrected) {
            this.elements.corrected.textContent = safe(this.stats.corrected);
        }
        if (this.elements.audio) {
            this.elements.audio.textContent = safe(this.stats.audio);
        }
        if (this.elements.total) {
            this.elements.total.textContent = safe(this.stats.total);
        }

        // Обновляем модальный UI
        if (this.elements.modalPerfect) {
            this.elements.modalPerfect.textContent = safe(this.stats.perfect);
        }
        if (this.elements.modalCorrected) {
            this.elements.modalCorrected.textContent = safe(this.stats.corrected);
        }
        if (this.elements.modalAudio) {
            this.elements.modalAudio.textContent = safe(this.stats.audio);
        }
        if (this.elements.modalTotal) {
            this.elements.modalTotal.textContent = safe(this.stats.total);
        }

        // Обновляем таймер
        this.updateTimer();
        // обновляем индикаторы несохраненного прогресса
        this.updateUnsavedIndicators();
    }

    /**
     * Проверить и сохранить статистику
     */
    checkAndSave() {
        this.taskCount++;
        
        // Обновляем сессию в истории
        if (this.history.currentSession) {
            this.history.updateSession({
                perfect: this.stats.perfect,
                corrected: this.stats.corrected,
                audio: this.stats.audio,
                number: this.stats.circleNumber
            });
        }

        // Сохраняем каждые N заданий
        if (this.taskCount >= this.saveInterval) {
            this.save();
            this.taskCount = 0;
        }
    }

    /**
     * Сохранить статистику в историю
     */
    async save() {
        if (!this.history.currentSession) return false;

        const ok = await this.history.saveSession();
        this._lastSaveOk = !!ok;
        if (ok) {
            this._dirty = false;
        }
        this.updateUnsavedIndicators();
        
        // Обновляем streak после сохранения
        this.updateStreak();
        return !!ok;
    }

    /**
     * Обновить отображение streak дней
     */
    async updateStreak() {
        try {
            const streak = await this.history.calculateStreakDays();
            const streakElement = document.querySelector('.streak-days');
            if (streakElement) {
                streakElement.textContent = streak;
            }
        } catch (error) {
            console.error('Error updating streak:', error);
        }
    }

    /**
     * Завершить сессию и сохранить
     */
    async finish() {
        try {
            this.stopTimer();
            
            if (this.history.currentSession) {
                this.history.updateSession({
                    end: true
                });
                const ok = await this.history.finishSession();
                this._lastSaveOk = !!ok;
                if (ok) this._dirty = false;
                this.updateUnsavedIndicators();
                return !!ok;
            }
            return false;
        } catch (error) {
            console.error('❌ Ошибка при завершении сессии (не критично, работа продолжается):', error);
            // Возвращаем false, но не прерываем выполнение
            this._lastSaveOk = false;
            this.updateUnsavedIndicators();
            return false;
        }
    }

    /**
     * Получить текущую статистику
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Массовое обновление данных статистики
     */
    update(data = {}) {
        let changed = false;
        Object.keys(data).forEach(k => {
            if (this.stats.hasOwnProperty(k) && this.stats[k] !== data[k]) {
                this.stats[k] = data[k];
                changed = true;
            }
        });
        if (changed) {
            this.updateUI();
            if (!this._suppressDirty) {
                this.checkAndSave();
                this._dirty = true;
                this.updateUnsavedIndicators();
            }
        }
    }

    /**
     * Есть ли несохраненный прогресс
     */
    hasPending() {
        return this._dirty || !this._lastSaveOk || this.taskCount > 0;
    }

    /**
     * Обновить индикаторы звездочки в панели/модале
     */
    updateUnsavedIndicators() {
        const show = this.hasPending();
        const inline = document.getElementById('panelUnsavedStar');
        const modal = document.getElementById('modalUnsavedStar');
        if (inline) inline.style.display = show ? 'inline-flex' : 'none';
        if (modal) modal.style.display = show ? 'inline-flex' : 'none';
        const header = document.getElementById('unsavedStar');
        if (header) header.style.display = show ? 'inline-flex' : 'none';
    }

    markClean(options = {}) {
        if (options.lastSaveOk !== undefined) {
            this._lastSaveOk = !!options.lastSaveOk;
        }
        this._dirty = false;
        this.taskCount = 0;
        this.updateUnsavedIndicators();
    }

    /**
     * Инициализирует обработчики событий для кнопок таймера
     */
    _initTimerControls() {
        this._ensureTimerButtonsEnabled();
        this._setupTimerSettingsButton(this.elements.timerSettings);
        this._setupTimerSettingsButton(this.elements.modalTimerSettings);
        this._setupTimerButton(document.getElementById('btn-timer'));
        this._setupTimerButton(document.getElementById('btn-modal-timer'));
        this.updateTimerButtons();
        this._updateTimerButtonColor();
    }

    _setupTimerButton(button) {
        if (!button || button.dataset.timerSetup === '1') return;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            this.openTimerDialog();
        });
        button.dataset.timerSetup = '1';
    }

    _setupTimerSettingsButton(button) {
        if (!button || button.dataset.timerSetup === '1') return;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            // Prevent double-click from instantly toggling pause/resume.
            if (event && typeof event.detail === 'number' && event.detail > 1) {
                return;
            }
            // Кнопка "время" (маленькая) переключает паузу (как раньше),
            // а широкая кнопка "таймер" открывает настройки таймера.
            const pauseModal = document.getElementById('pauseModal');
            if (pauseModal && pauseModal.style.display === 'flex') {
                if (typeof window.resumeGame === 'function') window.resumeGame();
            } else {
                if (typeof window.pauseGame === 'function') window.pauseGame();
            }
        });
        button.dataset.timerSetup = '1';
    }

    _ensureTimerButtonsEnabled() {
        const inline = document.getElementById('btn-timer');
        const modal = document.getElementById('btn-modal-timer');
        if (inline) inline.removeAttribute('disabled');
        if (modal) modal.removeAttribute('disabled');

        const inlineClock = document.getElementById('btn-timer-settings');
        const modalClock = document.getElementById('btn-modal-timer-settings');
        if (inlineClock) inlineClock.removeAttribute('disabled');
        if (modalClock) modalClock.removeAttribute('disabled');
    }

    openTimerDialog() {
        this._ensureTimerDialog();
        if (!this.timerDialogElements) return;

        const updateVariant = (btnId) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const label = btn.querySelector('.timer-label');
            const value = btn.querySelector('.timer-value');
            const shouldShowValue = !!(this.countdownEnabled && this.timerState.countdownRemainingMs > 0);
            if (label) label.hidden = shouldShowValue;
            if (value) value.hidden = !shouldShowValue;
        };

        updateVariant('btn-timer');
        updateVariant('btn-modal-timer');

        const { overlay, minutesInput, secondsInput, closeBtn } = this.timerDialogElements;
        if (!overlay || !minutesInput || !secondsInput) return;

        const baseSeconds = (this.timerState.countdownDefaultSeconds || this.countdownDuration || 300);
        console.log('[Timer] openTimerDialog() baseSeconds=%s countdownRemaining=%s countdownDuration=%s', baseSeconds, this.countdownRemaining, this.countdownDuration);
        minutesInput.value = Math.floor(baseSeconds / 60);
        secondsInput.value = baseSeconds % 60;

        if (this.timerDialogElements.escHandler) {
            document.removeEventListener('keydown', this.timerDialogElements.escHandler);
        }
        const escHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeTimerDialog();
            }
        };
        this.timerDialogElements.escHandler = escHandler;
        document.addEventListener('keydown', escHandler);

        overlay.hidden = false;
        overlay.classList.add('visible');
        setTimeout(() => {
            minutesInput.focus();
        }, 0);

        try {
            if (closeBtn) closeBtn.focus();
        } catch (e) {
        }
    }

    closeTimerDialog() {
        if (!this.timerDialogElements) return;
        const { overlay, escHandler } = this.timerDialogElements;
        if (!overlay) return;
        if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            this.timerDialogElements.escHandler = null;
        }
        overlay.classList.remove('visible');
        overlay.hidden = true;
    }

    _ensureTimerDialog() {
        if (this.timerDialogElements) return;

        const overlay = document.createElement('div');
        overlay.className = 'timer-dialog-overlay';
        overlay.hidden = true;

        overlay.innerHTML = `
            <div class="timer-dialog" role="dialog" aria-modal="true">
                <button type="button" class="timer-dialog-close" data-action="close" aria-label="Закрыть">
                    <i data-lucide="x"></i>
                </button>
                <div class="timer-dialog-header">
                    <div class="timer-dialog-title">Таймер:</div>
                </div>
                <div class="timer-dialog-timer-fields">
                    <div class="timer-field-group">
                        <label class="timer-field-label">
                            Минуты
                            <input type="number" min="0" max="720" step="1" name="timerMinutes" value="5">
                        </label>
                        <div class="timer-field-sep" aria-hidden="true">:</div>
                        <label class="timer-field-label">
                            Секунды
                            <input type="number" min="0" max="59" step="1" name="timerSeconds" value="0">
                        </label>
                    </div>
                </div>
                <div class="timer-dialog-actions">
                    <button type="button" class="button-primary" data-action="start">Старт</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.timer-dialog');
        const minutesInput = overlay.querySelector('input[name="timerMinutes"]');
        const secondsInput = overlay.querySelector('input[name="timerSeconds"]');
        const closeBtn = overlay.querySelector('[data-action="close"]');
        const startBtn = overlay.querySelector('[data-action="start"]');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeTimerDialog());
        }
        startBtn.addEventListener('click', () => {
            const minutes = parseInt(minutesInput.value, 10) || 0;
            const seconds = parseInt(secondsInput.value, 10) || 0;
            if (this._applyTimerSettings('countdown', minutes, seconds)) {
                this.closeTimerDialog();
            }
        });

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.closeTimerDialog();
            }
        });

        this.timerDialogElements = {
            overlay,
            dialog,
            minutesInput,
            secondsInput,
            closeBtn,
            escHandler: null
        };

        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ elements: [dialog] });
            }
        } catch (e) {
        }
    }

    _applyTimerSettings(mode, minutes, seconds) {
        const safeMinutes = Math.max(0, minutes);
        let safeSeconds = Math.max(0, seconds);
        if (safeSeconds > 59) {
            safeSeconds = 59;
        }
        if (this.timerDialogElements) {
            this.timerDialogElements.minutesInput.value = safeMinutes;
            this.timerDialogElements.secondsInput.value = safeSeconds;
        }
        const totalSeconds = safeMinutes * 60 + safeSeconds;
        console.log('[Timer] _applyTimerSettings -> режим таймер: minutes=%s seconds=%s totalSeconds=%s', safeMinutes, safeSeconds, totalSeconds);
        if (totalSeconds <= 0) {
            alert('Укажите время таймера больше нуля.');
            return false;
        }

        this.countdownEnabled = true;
        this.pauseSession();
        this._setCountdownSeconds(totalSeconds);
        // Сразу обновляем отображение установленного времени
        this.stats.timer = totalSeconds;
        console.log('[Timer] _applyTimerSettings -> сохранено totalSeconds=%s', totalSeconds);
        this.updateTimer();
        this.updateTimerButtons();
        this._updateTimerButtonColor();
        this.startSession({ resetCountdown: true });
        try {
            this._saveTimerPreference();
        } catch (e) {
        }
        return true;
    }

    _handleCountdownFinished() {
        this._playCountdownSound();
        this.stopTimer({ resetCountdown: true });
        if (typeof window.pauseGame === 'function') {
            window.pauseGame();
        }
    }

    async _loadTimerSounds() {
        if (this.timerSoundsLoaded) return;
        try {
            const response = await fetch('/static/sounds/timer/timer_sounds.json');
            if (!response.ok) {
                console.warn('Не удалось загрузить список звуков таймера');
                return;
            }
            const data = await response.json();
            if (Array.isArray(data.sounds) && data.sounds.length > 0) {
                // Формируем полные пути к файлам
                this.timerSounds = data.sounds.map(filename => 
                    `/static/sounds/timer/${filename}`
                );
                this.timerSoundsLoaded = true;
                console.log('Звуки таймера загружены:', this.timerSounds.length);
            }
        } catch (error) {
            console.warn('Ошибка загрузки звуков таймера:', error);
        }
    }

    _loadTimerPreference() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const raw = localStorage.getItem(this.timerPreferenceKey);
            if (raw) {
                const pref = JSON.parse(raw);
                if (pref && Number(pref.duration) > 0) {
                    const duration = Number(pref.duration);
                    this._setCountdownSeconds(duration);
                    console.log('[Timer] _loadTimerPreference -> duration=%s', duration);
                }
            }
        } catch (error) {
            console.warn('Ошибка чтения настроек таймера:', error);
        }
        // Всегда стартуем в режиме часов
        this.timerMode = 'clock';
        this.countdownExpired = false;
        this.stats.timer = 0;
        this.updateTimer();
        this.updateTimerIcon();
    }

    _saveTimerPreference() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const duration = Number(this.countdownDuration || 0);
            if (!(duration > 0)) return;
            localStorage.setItem(this.timerPreferenceKey, JSON.stringify({ duration }));
            console.log('[Timer] _saveTimerPreference -> duration=%s', duration);
        } catch (error) {
            console.warn('Ошибка сохранения настроек таймера:', error);
        }
    }

    _playCountdownSoundFallback() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!this._beepCtx) {
                this._beepCtx = new AudioCtx();
            }
            const ctx = this._beepCtx;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            const duration = 1.0;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + duration);
        } catch (error) {
            console.warn('Timer sound fallback error:', error);
        }
    }

    async _loadVictorySounds() {
        if (this.victorySoundsLoaded) return;
        try {
            const response = await fetch('/static/sounds/victory/victory_sounds.json');
            if (!response.ok) {
                console.warn('Не удалось загрузить список звуков победы');
                return;
            }
            const data = await response.json();
            if (Array.isArray(data.sounds) && data.sounds.length > 0) {
                // Формируем полные пути к файлам
                this.victorySounds = data.sounds.map(filename => 
                    `/static/sounds/victory/${filename}`
                );
                this.victorySoundsLoaded = true;
                console.log('Звуки победы загружены:', this.victorySounds.length);
            }
        } catch (error) {
            console.warn('Ошибка загрузки звуков победы:', error);
        }
    }

    _playVictorySound() {
        // Пробуем проиграть случайный звук из списка
        if (this.victorySounds && this.victorySounds.length > 0) {
            const randomSound = this.victorySounds[Math.floor(Math.random() * this.victorySounds.length)];
            const audio = new Audio(randomSound);
            audio.volume = 0.7; // Умеренная громкость
            audio.play().catch((error) => {
                console.warn('Не удалось проиграть звук победы, используем fallback:', error);
                this._playVictorySoundFallback();
            });
            return;
        }
        
        // Fallback на Web Audio бип, если звуки не загружены
        this._playVictorySoundFallback();
    }

    _playVictorySoundFallback() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!this._beepCtx) {
                this._beepCtx = new AudioCtx();
            }
            const ctx = this._beepCtx;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            // Звук победы - более радостная последовательность тонов
            const duration = 0.5;
            const now = ctx.currentTime;
            
            // Играем несколько тонов для более праздничного звука
            const frequencies = [523.25, 659.25, 783.99]; // До, Ми, Соль (мажорное трезвучие)
            frequencies.forEach((freq, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.15, now + 0.05 + index * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + index * 0.1);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + index * 0.1);
                osc.stop(now + duration + index * 0.1);
            });
        } catch (error) {
            console.warn('Victory sound fallback error:', error);
        }
    }
}

