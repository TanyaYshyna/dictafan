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
            timerModeIcon: document.getElementById('timer-mode-icon'),
            perfect: document.getElementById('count-perfect'),
            corrected: document.getElementById('count-corrected'),
            audio: document.getElementById('count-audio'),
            total: document.getElementById('count-total'),
            // Модальные элементы
            modalTimer: document.getElementById('modal_timer'),
            modalTimerSettings: document.getElementById('btn-modal-timer-settings'),
            modalTimerModeIcon: document.getElementById('modal-timer-mode-icon'),
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
        const timerModeIconId = variant === 'modal' ? 'modal-timer-mode-icon' : 'timer-mode-icon';
        
        return `
            <table class="table-progress">
                <tr>
                    <td colspan="4">
                        <div class="timer-control">
                            <button id="${timerSettingsId}" class="stat-btn timer-settings" title="Режим времени">
                                <span id="${timerModeIconId}" class="timer-mode-icon" aria-hidden="true"></span>
                            </button>
                            <button id="${timerBtnId}" class="stat-btn row-timer timer" disabled title="Время работы над диктантом">
                                <span id="${timerId}">00:00:00</span>
                            </button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <button id="btn-${prefix}count-perfect" class="stat-btn perfect" disabled title="Количество предложений набранных без ошибок с 1-й попытки">
                            <i data-lucide="star"></i>
                            <span id="${prefix}count-perfect">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-corrected" class="stat-btn corrected" disabled title="Количество набранных предложений">
                            <i data-lucide="star-half"></i>
                            <span id="${prefix}count-corrected">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-audio" class="stat-btn corrected-audio" disabled title="Сколько предложений прошло аудио контроль">
                            <i data-lucide="mic-off"></i>
                            <span id="${prefix}count-audio">0</span>
                        </button>
                    </td>
                    <td>
                        <button id="btn-${prefix}count-total" class="stat-btn total" disabled title="Общее количество предложений">
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
            timerModeIcon: document.getElementById('timer-mode-icon'),
            perfect: document.getElementById('count-perfect'),
            corrected: document.getElementById('count-corrected'),
            audio: document.getElementById('count-audio'),
            total: document.getElementById('count-total'),
            modalTimer: document.getElementById('modal_timer'),
            modalTimerSettings: document.getElementById('btn-modal-timer-settings'),
            modalTimerModeIcon: document.getElementById('modal-timer-mode-icon'),
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
        this._initTimerControls();
        this._loadTimerPreference();
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
            
            // Добавляем обработчики клика на кнопки таймера для остановки времени
            const btnTimer = document.getElementById('btn-timer');
            const btnModalTimer = document.getElementById('btn-modal-timer');
            
            if (btnTimer) {
                // Убираем disabled чтобы кнопка была кликабельной
                btnTimer.removeAttribute('disabled');
                // Удаляем старый обработчик если есть
                btnTimer.replaceWith(btnTimer.cloneNode(true));
                const newBtnTimer = document.getElementById('btn-timer');
                newBtnTimer.addEventListener('click', function() {
                    // Проверяем, открыто ли модальное окно паузы
                    const pauseModal = document.getElementById('pauseModal');
                    if (pauseModal && pauseModal.style.display === 'flex') {
                        // Если на паузе - возобновляем
                        if (typeof window.resumeGame === 'function') {
                            window.resumeGame();
                        }
                    } else {
                        // Если не на паузе - ставим на паузу
                        if (typeof window.pauseGame === 'function') {
                            window.pauseGame();
                        }
                    }
                });
            }
            
            if (btnModalTimer) {
                // Убираем disabled чтобы кнопка была кликабельной
                btnModalTimer.removeAttribute('disabled');
                // Удаляем старый обработчик если есть
                btnModalTimer.replaceWith(btnModalTimer.cloneNode(true));
                const newBtnModalTimer = document.getElementById('btn-modal-timer');
                newBtnModalTimer.addEventListener('click', function() {
                    // Проверяем, открыто ли модальное окно паузы
                    const pauseModal = document.getElementById('pauseModal');
                    if (pauseModal && pauseModal.style.display === 'flex') {
                        // Если на паузе - возобновляем
                        if (typeof window.resumeGame === 'function') {
                            window.resumeGame();
                        }
                    } else {
                        // Если не на паузе - ставим на паузу
                        if (typeof window.pauseGame === 'function') {
                            window.pauseGame();
                        }
                    }
                });
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

        if (this.timerMode === 'countdown') {
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
        const timerValue = this._computeTimerSeconds();
        this.stats.timer = timerValue;

        const hours = Math.floor(timerValue / 3600);
        const minutes = Math.floor((timerValue % 3600) / 60);
        const seconds = timerValue % 60;

        const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (this.timerMode === 'countdown') {
            this.countdownRemaining = timerValue;
        }

        // Обновляем элементы, если они есть в this.elements
        if (this.elements.timer) {
            this.elements.timer.textContent = formatted;
        }
        if (this.elements.modalTimer) {
            this.elements.modalTimer.textContent = formatted;
        }
        
        // Также обновляем элементы напрямую из DOM (на случай, если они не были найдены при рендере)
        const timerEl = document.getElementById('timer');
        const modalTimerEl = document.getElementById('modal_timer');
        if (timerEl) {
            timerEl.textContent = formatted;
            if (!this.elements.timer) {
                this.elements.timer = timerEl;
            }
        }
        if (modalTimerEl) {
            modalTimerEl.textContent = formatted;
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

        this.updateTimerIcon();
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

        if (this.timerMode === 'countdown' && this.timerState.countdownRemainingMs <= 0) {
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

        if (this.timerMode === 'countdown') {
            this.timerState.countdownRemainingMs = Math.max(0, this.timerState.countdownRemainingMs - delta);
        }

        this.timerState.lastTickTs = now;
    }

    _computeTimerSeconds(now = Date.now()) {
        if (this.timerMode === 'countdown') {
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
        this.updateTimerIcon();
        this._updateTimerButtonColor();
    }

    _setupTimerSettingsButton(button) {
        if (!button || button.dataset.timerSetup === '1') return;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            this.openTimerDialog();
        });
        button.dataset.timerSetup = '1';
    }

    _ensureTimerButtonsEnabled() {
        const inline = document.getElementById('btn-timer');
        const modal = document.getElementById('btn-modal-timer');
        if (inline) inline.removeAttribute('disabled');
        if (modal) modal.removeAttribute('disabled');
    }

    updateTimerIcon() {
        const iconName = this.timerMode === 'countdown' ? 'timer' : 'alarm-clock';
        this._setLucideIcon(this.elements.timerModeIcon, iconName);
        this._setLucideIcon(this.elements.modalTimerModeIcon, iconName);
        this._updateTimerButtonColor();
    }

    _updateTimerButtonColor() {
        const isCountdown = this.timerMode === 'countdown';
        const btnTimer = document.getElementById('btn-timer');
        const btnModalTimer = document.getElementById('btn-modal-timer');
        const btnSettings = document.getElementById('btn-timer-settings');
        const btnModalSettings = document.getElementById('btn-modal-timer-settings');
        
        const applyClasses = (el) => {
            if (!el) return;
            if (isCountdown) {
                el.classList.add('timer-countdown');
                el.classList.remove('timer-clock');
            } else {
                el.classList.add('timer-clock');
                el.classList.remove('timer-countdown');
            }
        };

        applyClasses(btnTimer);
        applyClasses(btnModalTimer);
        applyClasses(btnSettings);
        applyClasses(btnModalSettings);
    }

    _setLucideIcon(element, iconName) {
        if (!element) return;
        element.setAttribute('data-lucide', iconName);
        element.innerHTML = '';
        const lucideLib = window.lucide;
        if (lucideLib && typeof lucideLib.createIcons === 'function') {
            try {
                lucideLib.createIcons({ elements: [element] });
                return;
            } catch (error) {
                console.warn('Lucide createIcons error:', error);
            }
        }

        // Lucide ещё не готов — повторим попытку чуть позже
        if (!this._lucideRetryScheduled) {
            this._lucideRetryScheduled = true;
            setTimeout(() => {
                this._lucideRetryScheduled = false;
                this.updateTimerIcon();
            }, 200);
        }
    }

    openTimerDialog() {
        this._ensureTimerDialog();
        const {
            overlay,
            clockRadio,
            timerRadio,
            minutesInput,
            secondsInput,
            timerFields,
            updateFields
        } = this.timerDialogElements;

        clockRadio.checked = this.timerMode !== 'countdown';
        timerRadio.checked = this.timerMode === 'countdown';

        const baseSeconds = this.timerMode === 'countdown'
            ? (this.countdownRemaining || this.countdownDuration || 300)
            : (this.countdownDuration || 300);
        console.log('[Timer] openTimerDialog() mode=%s baseSeconds=%s countdownRemaining=%s countdownDuration=%s', this.timerMode, baseSeconds, this.countdownRemaining, this.countdownDuration);
        minutesInput.value = Math.floor(baseSeconds / 60);
        secondsInput.value = baseSeconds % 60;

        updateFields();

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
            if (timerRadio.checked) {
                minutesInput.focus();
            } else {
                clockRadio.focus();
            }
        }, 0);
    }

    closeTimerDialog() {
        if (!this.timerDialogElements) return;
        const { overlay, escHandler } = this.timerDialogElements;
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
                <h3 class="timer-dialog-title">Режим времени</h3>
                <div class="timer-dialog-options">
                    <label class="timer-option">
                        <input type="radio" name="timerMode" value="clock" checked>
                        <span>Часы (считаем время работы)</span>
                    </label>
                    <label class="timer-option">
                        <input type="radio" name="timerMode" value="countdown">
                        <span>Таймер (ограничение по времени)</span>
                    </label>
                </div>
                <div class="timer-dialog-timer-fields collapsed">
                    <div class="timer-field-group">
                        <label>
                            Минуты
                            <input type="number" min="0" max="720" step="1" name="timerMinutes" value="5">
                        </label>
                        <label>
                            Секунды
                            <input type="number" min="0" max="59" step="1" name="timerSeconds" value="0">
                        </label>
                    </div>
                    <p class="timer-hint">Таймер включится при старте диктанта и поставит занятие на паузу, когда время закончится.</p>
                </div>
                <div class="timer-dialog-actions">
                    <button type="button" class="button-secondary" data-action="cancel">Отмена</button>
                    <button type="button" class="button-primary" data-action="start">Старт</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.timer-dialog');
        const clockRadio = overlay.querySelector('input[value="clock"]');
        const timerRadio = overlay.querySelector('input[value="countdown"]');
        const minutesInput = overlay.querySelector('input[name="timerMinutes"]');
        const secondsInput = overlay.querySelector('input[name="timerSeconds"]');
        const timerFields = overlay.querySelector('.timer-dialog-timer-fields');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');
        const startBtn = overlay.querySelector('[data-action="start"]');

        const updateFields = () => {
            const showTimer = timerRadio.checked;
            if (showTimer) {
                timerFields.classList.remove('collapsed');
            } else {
                timerFields.classList.add('collapsed');
            }
        };

        clockRadio.addEventListener('change', updateFields);
        timerRadio.addEventListener('change', updateFields);

        cancelBtn.addEventListener('click', () => this.closeTimerDialog());
        startBtn.addEventListener('click', () => {
            const mode = timerRadio.checked ? 'countdown' : 'clock';
            const minutes = parseInt(minutesInput.value, 10) || 0;
            const seconds = parseInt(secondsInput.value, 10) || 0;
            if (this._applyTimerSettings(mode, minutes, seconds)) {
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
            clockRadio,
            timerRadio,
            minutesInput,
            secondsInput,
            timerFields,
            updateFields,
            escHandler: null
        };
    }

    _applyTimerSettings(mode, minutes, seconds) {
        if (mode === 'clock') {
            console.log('[Timer] _applyTimerSettings -> режим часы');
            if (this.timerMode !== 'clock') {
                this.pauseSession();
                this.timerMode = 'clock';
                this.countdownExpired = false;
                this.updateTimer();
                this.updateTimerIcon();
                this._updateTimerButtonColor();
            } else {
                this.updateTimer();
            }
            this.startSession();
            this._saveTimerPreference();
            return true;
        }

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

        this.timerMode = 'countdown';
        this.pauseSession();
        this._setCountdownSeconds(totalSeconds);
        // Сразу обновляем отображение установленного времени
        this.stats.timer = totalSeconds;
        console.log('[Timer] _applyTimerSettings -> сохранено totalSeconds=%s', totalSeconds);
        this.updateTimer();
        this.updateTimerIcon();
        this._updateTimerButtonColor();
        this.startSession({ resetCountdown: true });
        this._saveTimerPreference();
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
            const data = {
                mode: this.timerMode,
                duration: (this.timerMode === 'countdown' || this.timerState.countdownDefaultSeconds > 0)
                    ? (this.timerState.countdownDefaultSeconds || this.countdownDuration || 0)
                    : null
            };
            localStorage.setItem(this.timerPreferenceKey, JSON.stringify(data));
            console.log('[Timer] _saveTimerPreference ->', data);
        } catch (error) {
            console.warn('Ошибка сохранения настроек таймера:', error);
        }
    }

    _playCountdownSound() {
        // Пробуем проиграть случайный звук из списка
        if (this.timerSounds && this.timerSounds.length > 0) {
            const randomSound = this.timerSounds[Math.floor(Math.random() * this.timerSounds.length)];
            const audio = new Audio(randomSound);
            audio.volume = 0.7; // Умеренная громкость
            audio.play().catch((error) => {
                console.warn('Не удалось проиграть звук таймера, используем fallback:', error);
                this._playCountdownSoundFallback();
            });
            return;
        }
        
        // Fallback на Web Audio бип, если звуки не загружены
        this._playCountdownSoundFallback();
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

