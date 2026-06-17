/**
 * Панель статистики «Время / Деньги» на рабочем столе.
 *
 * Показывает два вида, переключаемых по клику:
 *   1) День + всё время (огонь + стрик, план/факт времени, план/факт денег, итого)
 *   2) Несгораемые дни (стрик-календарь)
 */

window.DesktopStatsPanel = {
    /** @type {HTMLElement|null} */
    panelEl: null,

    /** Текущий вид: 'default' | 'streak' */
    currentView: 'default',

    /** Кэшированные данные с сервера */
    _data: null,

    /** Флаг загрузки */
    _loading: false,

    /** Таймер для long-press */
    _longPressTimer: null,

    // ==================== ПУБЛИЧНЫЙ API ====================

    /**
     * Инициализировать панель. Вставляет HTML в DOM и начинает загрузку.
     * @param {HTMLElement} container — элемент, куда вставить панель
     */
    init(container) {
        if (this.panelEl) return; // уже инициализирована

        const panel = document.createElement('div');
        panel.className = 'desktop-stats-panel';
        panel.id = 'desktopStatsPanel';
        panel.setAttribute('title', 'Нажмите для переключения вида');
        panel.innerHTML = '<div class="desktop-stats-view-default" id="desktopStatsViewDefault">' +
            '<div class="desktop-stats-row">' +
                '<span class="stats-icon stats-icon-fire"><i data-lucide="flame" width="16" height="16"></i></span>' +
                '<span class="stats-value" id="statsStreakDays">—</span>' +
                '<span class="stats-label" id="statsStreakLabel">дней</span>' +
            '</div>' +
            '<div class="desktop-stats-separator"></div>' +
            '<div class="desktop-stats-row">' +
                '<span class="stats-icon"><i data-lucide="clock" width="16" height="16"></i></span>' +
                '<span class="stats-value" id="statsTodayTime">—</span>' +
                '<span class="stats-label">/</span>' +
                '<span class="stats-value stats-value-plan" id="statsTodayTimePlan">—</span>' +
            '</div>' +
            '<div class="desktop-stats-row">' +
                '<span class="stats-icon"><i data-lucide="coins" width="16" height="16"></i></span>' +
                '<span class="stats-value" id="statsTodayMoney">—</span>' +
                '<span class="stats-label">/</span>' +
                '<span class="stats-value stats-value-plan" id="statsTodayMoneyPlan">—</span>' +
            '</div>' +
            '<div class="desktop-stats-separator"></div>' +
            '<div class="desktop-stats-row">' +
                '<span class="stats-icon"><i data-lucide="hourglass" width="16" height="16"></i></span>' +
                '<span class="stats-value" id="statsTotalTime">—</span>' +
                '<span class="stats-label">всего</span>' +
            '</div>' +
            '<div class="desktop-stats-row">' +
                '<span class="stats-icon"><i data-lucide="banknote" width="16" height="16"></i></span>' +
                '<span class="stats-value" id="statsTotalMoney">—</span>' +
                '<span class="stats-label">всего</span>' +
            '</div>' +
        '</div>' +
        '<div class="desktop-stats-view-streak" id="desktopStatsViewStreak" style="display:none;">' +
            '<div class="desktop-stats-streak-header">' +
                '<span class="stats-icon stats-icon-fire"><i data-lucide="flame" width="16" height="16"></i></span>' +
                '<span>Несгораемые дни</span>' +
            '</div>' +
            '<div class="desktop-stats-streak-days" id="statsStreakDaysGrid"></div>' +
            '<div class="desktop-stats-streak-info" id="statsStreakInfo"></div>' +
        '</div>';

        // Вставляем панель первой, чтобы она была над тул-палеткой
        const firstChild = container.firstChild;
        if (firstChild) {
            container.insertBefore(panel, firstChild);
        } else {
            container.appendChild(panel);
        }
        this.panelEl = panel;

        // Рендерим иконки Lucide внутри панели
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ root: panel });
            }
        } catch (e) { /* ignore */ }

        // Клик для переключения вида
        panel.addEventListener('click', (e) => {
            // Не переключать, если клик по ссылке/кнопке внутри
            if (e.target.closest('a, button')) return;
            this.toggleView();
        });

        // Двойной клик — обновить статистику
        panel.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.load();
        });

        // Долгое нажатие (touch) — обновить статистику на мобильных
        panel.addEventListener('touchstart', (e) => {
            this._longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                e.preventDefault();
                this.load();
            }, 500);
        }, { passive: false });

        panel.addEventListener('touchend', () => {
            if (this._longPressTimer) {
                clearTimeout(this._longPressTimer);
                this._longPressTimer = null;
            }
        });

        panel.addEventListener('touchmove', () => {
            if (this._longPressTimer) {
                clearTimeout(this._longPressTimer);
                this._longPressTimer = null;
            }
        });

        // Загружаем данные
        this.load();

        // Слушаем событие завершения диктанта
        document.addEventListener('dictation-completed', () => {
            this.load();
        });
    },

    /**
     * Загрузить данные с сервера и обновить UI.
     */
    async load() {
        if (this._loading) return;
        this._loading = true;

        try {
            const res = await fetch('/user/api/stats/dashboard', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin',
            });
            if (!res.ok) {
                console.warn('[DesktopStatsPanel] Ошибка загрузки:', res.status);
                return;
            }
            const data = await res.json();
            this._data = data;
            this.render();
        } catch (e) {
            console.warn('[DesktopStatsPanel] Ошибка загрузки:', e);
        } finally {
            this._loading = false;
        }
    },

    /**
     * Обновить UI на основе текущих данных.
     */
    render() {
        const d = this._data;
        if (!d) return;

        // --- Вид 1: день + всё время ---

        // Стрик
        const streakEl = document.getElementById('statsStreakDays');
        const streakLabel = document.getElementById('statsStreakLabel');
        if (streakEl) streakEl.textContent = String(d.streak_days ?? 0);
        if (streakLabel) {
            const days = d.streak_days ?? 0;
            const lastDigit = days % 10;
            const lastTwo = days % 100;
            let label = 'дней';
            if (lastTwo < 10 || lastTwo > 20) {
                if (lastDigit === 1) label = 'день';
                else if (lastDigit >= 2 && lastDigit <= 4) label = 'дня';
            }
            streakLabel.textContent = label;
        }

        // Время сегодня
        this._renderTime('statsTodayTime', d.today_lead_time ?? 0);
        this._renderTimePlan('statsTodayTimePlan', d.today_lead_time ?? 0, (d.daily_time_plan ?? 10) * 60 * 1000);

        // Деньги сегодня
        this._renderMoney('statsTodayMoney', d.today_money ?? 0);
        this._renderMoneyPlan('statsTodayMoneyPlan', d.today_money ?? 0, d.daily_money_plan ?? 100);

        // Время всего
        this._renderTime('statsTotalTime', d.total_lead_time ?? 0);

        // Деньги всего
        this._renderMoney('statsTotalMoney', d.total_money ?? 0);

        // --- Вид 2: стрик-календарь ---
        this._renderStreakCalendar(d.streak_days ?? 0);
    },

    /**
     * Переключить вид панели.
     */
    toggleView() {
        const defaultView = document.getElementById('desktopStatsViewDefault');
        const streakView = document.getElementById('desktopStatsViewStreak');

        if (this.currentView === 'default') {
            this.currentView = 'streak';
            if (defaultView) defaultView.style.display = 'none';
            if (streakView) streakView.style.display = 'flex';
        } else {
            this.currentView = 'default';
            if (defaultView) defaultView.style.display = 'flex';
            if (streakView) streakView.style.display = 'none';
        }
    },

    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

    /**
     * Отформатировать время из ms в человекочитаемый вид.
     * @param {number} ms
     * @returns {string}
     */
    _formatTime(ms) {
        if (!ms || ms <= 0) return '0 мин';
        const totalMinutes = Math.floor(ms / 60000);
        if (totalMinutes < 60) {
            return totalMinutes + ' мин';
        }
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (minutes === 0) {
            return hours + ' ч';
        }
        return hours + ' ч ' + minutes + ' мин';
    },

    /**
     * Отформатировать число монет.
     * @param {number} val
     * @returns {string}
     */
    _formatMoney(val) {
        if (!val || val <= 0) return '0';
        return Number(val).toLocaleString('ru-RU');
    },

    /**
     * Обновить элемент с временем.
     */
    _renderTime(elId, ms) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = this._formatTime(ms);
    },

    /**
     * Обновить элемент с планом времени, подсветить пере-/недовыполнение.
     */
    _renderTimePlan(elId, factMs, planMs) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = this._formatTime(planMs);
        el.className = 'stats-value stats-value-plan';
        if (factMs >= planMs && planMs > 0) {
            el.classList.add('stats-value-overplan');
        }
    },

    /**
     * Обновить элемент с монетами.
     */
    _renderMoney(elId, val) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = this._formatMoney(val);
    },

    /**
     * Обновить элемент с планом монет, подсветить пере-/недовыполнение.
     */
    _renderMoneyPlan(elId, factVal, planVal) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = this._formatMoney(planVal);
        el.className = 'stats-value stats-value-plan';
        if (factVal >= planVal && planVal > 0) {
            el.classList.add('stats-value-overplan');
        }
    },

    /**
     * Отрендерить календарь стрика (последние N дней).
     */
    _renderStreakCalendar(streakDays) {
        const grid = document.getElementById('statsStreakDaysGrid');
        const info = document.getElementById('statsStreakInfo');
        if (!grid) return;

        // Показываем последние 30 дней
        const totalDays = 30;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let html = '';
        let activeCount = 0;

        for (let i = totalDays - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const isToday = i === 0;
            const isActive = i < streakDays;

            let cls = 'desktop-stats-streak-day';
            if (isActive) cls += ' active';
            if (isToday) cls += ' today';
            if (!isActive && !isToday) cls += ' empty';

            html += '<div class="' + cls + '" title="' + dateStr + '"></div>';
            if (isActive) activeCount++;
        }

        grid.innerHTML = html;

        if (info) {
            info.textContent = streakDays > 0
                ? streakDays + ' ' + this._pluralize(streakDays, 'день', 'дня', 'дней') + ' подряд'
                : 'Нет активности сегодня';
        }
    },

    /**
     * Простое склонение числительных.
     */
    _pluralize(n, one, few, many) {
        const lastTwo = n % 100;
        if (lastTwo >= 11 && lastTwo <= 19) return many;
        const lastDigit = n % 10;
        if (lastDigit === 1) return one;
        if (lastDigit >= 2 && lastDigit <= 4) return few;
        return many;
    },

    /**
     * Принудительно обновить статистику (вызывается извне).
     */
    refresh() {
        this.load();
    },
};
