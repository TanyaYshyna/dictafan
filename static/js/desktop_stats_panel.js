/**
 * Панель статистики «Время / Деньги» на рабочем столе.
 *
 * Встраивается в шапку (topbar), рядом с логотипом.
 *
 * Минимальный режим (по умолчанию):
 *   — Две кольцевые SVG-диаграммы (уменьшенные): внутренняя (жёлтая) — время, внешняя (розовая) — деньги
 *   — В центре колец: огонь + число несгораемых дней
 *   — Справа от колец: сверху время, снизу деньги
 *   — Pull-tab (язычок) в правом нижнем углу для открытия расширенной панели
 *
 * Расширенная панель (открывается по клику на pull-tab):
 *   — Все строки статистики (план/факт времени, денег, итого)
 *   — Стрик-календарь
 *   — Кнопка обновить (lucide refresh-ccw)
 */

window.DesktopStatsPanel = {
    /** @type {HTMLElement|null} */
    panelEl: null,

    /** Флаг: открыта ли расширенная панель */
    expanded: false,

    /** Кэшированные данные с сервера */
    _data: null,

    /** Флаг загрузки */
    _loading: false,

    // ==================== ПУБЛИЧНЫЙ API ====================

    /**
     * Инициализировать панель. Разметка уже отрендерена сервером в шапке
     * (partials/desktop_stats_panel.html); здесь навешиваем логику и начинаем загрузку.
     * @param {HTMLElement} container — элемент шапки (.topbar), не используется для вставки
     */
    init(container) {
        if (this.panelEl) return; // уже инициализирована

        // HTML панели находится в шаблоне templates/partials/desktop_stats_panel.html,
        // включённом в topbar страницы (templates/desktop.html). JS не создаёт разметку —
        // он только находит готовый элемент и навешивает логику.
        const panel = document.getElementById('desktopStatsPanel');
        if (!panel) return;
        this.panelEl = panel;

        // Рендерим иконки Lucide внутри панели
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ root: panel });
            }
        } catch (e) { /* ignore */ }

        // --- Обработчики ---

        // Pull-tab: открыть/закрыть расширенную панель
        const pullTab = document.getElementById('desktopStatsPullTab');
        if (pullTab) {
            pullTab.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleExpanded();
            });
        }

        // Кнопка обновить
        const refreshBtn = document.getElementById('desktopStatsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.load();
            });
        }

        // Двойной клик по всей панели — обновить статистику
        panel.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.load();
        });

        // Закрывать выпадающее меню по клику вне панели
        document.addEventListener('click', (e) => {
            if (this.expanded && this.panelEl && !this.panelEl.contains(e.target)) {
                this.toggleExpanded();
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

        const streakDays = d.streak_days ?? 0;
        const timeFact = d.today_lead_time ?? 0;
        // Багфикс: daily_time_plan приходит в минутах с сервера,
        // умножаем на 60000 для перевода в ms
        const timePlan = (d.daily_time_plan ?? 10) * 60 * 1000;
        const moneyFact = d.today_money ?? 0;
        const moneyPlan = d.daily_money_plan ?? 100;

        // --- Центр колец: огонь + число несгораемых дней ---
        const streakNum = document.getElementById('statsStreakNumber');
        if (streakNum) streakNum.textContent = String(streakDays);

        // --- Время компактно (чч:мм) ---
        const timeCompact = document.getElementById('statsTodayTimeCompact');
        if (timeCompact) {
            timeCompact.textContent = this._formatTimeCompact(timeFact);
        }

        // --- Деньги компактно ---
        const moneyCompact = document.getElementById('statsTodayMoneyCompact');
        if (moneyCompact) {
            moneyCompact.textContent = this._formatMoney(moneyFact);
        }

        // --- Кольцевые диаграммы ---

        // Внутренний сектор — время (жёлтое), 2*PI*14.5 ≈ 91.11
        const timeRatio = timePlan > 0 ? Math.min(timeFact / timePlan, 1) : 0;
        this._updateRing('statsRingTime', timeRatio, 91.11);

        // Внешнее кольцо — деньги (розовое), 2*PI*34 ≈ 213.63
        const moneyRatio = moneyPlan > 0 ? Math.min(moneyFact / moneyPlan, 1) : 0;
        this._updateRing('statsRingMoney', moneyRatio, 213.63);

        // --- Расширенная панель ---

        // Стрик
        const streakEl = document.getElementById('statsStreakDays');
        const streakLabel = document.getElementById('statsStreakLabel');
        if (streakEl) streakEl.textContent = String(streakDays);
        if (streakLabel) {
            const lastDigit = streakDays % 10;
            const lastTwo = streakDays % 100;
            let label = 'дней';
            if (lastTwo < 10 || lastTwo > 20) {
                if (lastDigit === 1) label = 'день';
                else if (lastDigit >= 2 && lastDigit <= 4) label = 'дня';
            }
            streakLabel.textContent = label;
        }

        // Время сегодня
        this._renderTime('statsTodayTime', timeFact);
        this._renderTimePlan('statsTodayTimePlan', timeFact, timePlan);

        // Деньги сегодня
        this._renderMoney('statsTodayMoney', moneyFact);
        this._renderMoneyPlan('statsTodayMoneyPlan', moneyFact, moneyPlan);

        // Время всего
        this._renderTime('statsTotalTime', d.total_lead_time ?? 0);

        // Деньги всего
        this._renderMoney('statsTotalMoney', d.total_money ?? 0);

        // Стрик-календарь
        this._renderStreakCalendar(streakDays);
    },

    /**
     * Переключить расширенную панель.
     */
    toggleExpanded() {
        this.expanded = !this.expanded;
        const expandedEl = document.getElementById('desktopStatsExpanded');
        const pullTab = document.getElementById('desktopStatsPullTab');
        if (expandedEl) {
            expandedEl.classList.toggle('open', this.expanded);
        }
        if (pullTab) {
            pullTab.classList.toggle('open', this.expanded);
        }
    },

    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

    /**
     * Обновить кольцевую диаграмму.
     * @param {string} elId — id элемента circle
     * @param {number} ratio — 0..1
     * @param {number} circumference — длина окружности
     */
    _updateRing(elId, ratio, circumference) {
        const el = document.getElementById(elId);
        if (!el) return;
        const offset = circumference * (1 - ratio);
        el.setAttribute('stroke-dasharray', circumference + ' ' + circumference);
        el.setAttribute('stroke-dashoffset', String(offset));
    },

    /**
     * Отформатировать время в компактный вид «дд:чч:мм» (цифровой, без привязки к языку):
     * дни показываются только если их больше нуля.
     * @param {number} ms
     * @returns {string}
     */
    _formatTimeCompact(ms) {
        return this._formatTime(ms);
    },

    /**
     * Отформатировать время из ms в цифровой вид «дд:чч:мм»:
     * 2 ч 03 мин → «02:03», 4 д 05 ч 59 мин → «04:05:59».
     * Если дней нет — нули дней не показываются, остаётся «чч:мм».
     * Все компоненты выводятся двумя цифрами.
     * @param {number} ms
     * @returns {string}
     */
    _formatTime(ms) {
        if (!ms || ms <= 0) return '00:00';
        const totalMinutes = Math.floor(ms / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        if (days > 0) {
            return String(days).padStart(2, '0') + ':' + hh + ':' + mm;
        }
        return hh + ':' + mm;
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
