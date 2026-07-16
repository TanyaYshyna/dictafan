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
     * Инициализировать панель. Вставляет HTML в шапку и начинает загрузку.
     * @param {HTMLElement} container — элемент шапки (.topbar), куда вставить панель
     */
    init(container) {
        if (this.panelEl) return; // уже инициализирована

        const panel = document.createElement('div');
        panel.className = 'desktop-stats-panel';
        panel.id = 'desktopStatsPanel';
        panel.innerHTML =
            // --- Кольцевые диаграммы + центр (огонь+число) ---
            '<div class="desktop-stats-rings" id="desktopStatsRings">' +
                '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
                    // Внешнее кольцо (деньги) — r=34
                    '<circle cx="50" cy="50" r="34" fill="none" class="stats-ring-money-bg" stroke-width="5" />' +
                    '<circle id="statsRingMoney" cx="50" cy="50" r="34" fill="none" class="stats-ring-money" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 213.63" transform="rotate(-90 50 50)" />' +
                    // Внутреннее кольцо (время) — r=26
                    '<circle cx="50" cy="50" r="26" fill="none" class="stats-ring-time-bg" stroke-width="5" />' +
                    '<circle id="statsRingTime" cx="50" cy="50" r="26" fill="none" class="stats-ring-time" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 163.36" transform="rotate(-90 50 50)" />' +
                '</svg>' +
                '<div class="desktop-stats-rings-center">' +
                    '<div class="desktop-stats-fire-row">' +
                        '<span class="stats-fire-icon"><i data-lucide="flame" width="12" height="12"></i></span>' +
                        '<span class="stats-streak-number" id="statsStreakNumber">—</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // --- Инфо справа от колец: время сверху, деньги снизу ---
            '<div class="desktop-stats-info">' +
                '<div class="desktop-stats-time-row">' +
                    '<span class="stats-label-icon"><i data-lucide="clock" width="12" height="12"></i></span>' +
                    '<span id="statsTodayTimeCompact">—</span>' +
                '</div>' +
                '<div class="desktop-stats-money-row">' +
                    '<span class="stats-money-icon"><i data-lucide="dollar-sign" width="12" height="12"></i></span>' +
                    '<span id="statsTodayMoneyCompact">—</span>' +
                '</div>' +
            '</div>' +
            // --- Pull-tab (правый нижний угол) ---
            '<button class="desktop-stats-pull-tab" id="desktopStatsPullTab" title="Подробнее">' +
                '<i data-lucide="chevron-down" width="12" height="12"></i>' +
            '</button>' +
            // --- Расширенная панель (скрыта, пока не нажать pull-tab) ---
            '<div class="desktop-stats-expanded" id="desktopStatsExpanded">' +
                '<div class="desktop-stats-row">' +
                    '<span class="stats-icon stats-icon-fire"><i data-lucide="flame" width="14" height="14"></i></span>' +
                    '<span class="stats-value" id="statsStreakDays">—</span>' +
                    '<span class="stats-label" id="statsStreakLabel">дней</span>' +
                '</div>' +
                '<div class="desktop-stats-separator"></div>' +
                '<div class="desktop-stats-row">' +
                    '<span class="stats-icon"><i data-lucide="clock" width="14" height="14"></i></span>' +
                    '<span class="stats-value" id="statsTodayTime">—</span>' +
                    '<span class="stats-label">/</span>' +
                    '<span class="stats-value stats-value-plan" id="statsTodayTimePlan">—</span>' +
                '</div>' +
                '<div class="desktop-stats-row">' +
                    '<span class="stats-icon"><i data-lucide="coins" width="14" height="14"></i></span>' +
                    '<span class="stats-value" id="statsTodayMoney">—</span>' +
                    '<span class="stats-label">/</span>' +
                    '<span class="stats-value stats-value-plan" id="statsTodayMoneyPlan">—</span>' +
                '</div>' +
                '<div class="desktop-stats-separator"></div>' +
                '<div class="desktop-stats-row">' +
                    '<span class="stats-icon"><i data-lucide="hourglass" width="14" height="14"></i></span>' +
                    '<span class="stats-value" id="statsTotalTime">—</span>' +
                    '<span class="stats-label">всего</span>' +
                '</div>' +
                '<div class="desktop-stats-row">' +
                    '<span class="stats-icon"><i data-lucide="banknote" width="14" height="14"></i></span>' +
                    '<span class="stats-value" id="statsTotalMoney">—</span>' +
                    '<span class="stats-label">всего</span>' +
                '</div>' +
                '<div class="desktop-stats-separator"></div>' +
                '<div class="desktop-stats-view-streak" id="desktopStatsViewStreak">' +
                    '<div class="desktop-stats-streak-header">' +
                        '<span class="stats-icon stats-icon-fire"><i data-lucide="flame" width="14" height="14"></i></span>' +
                        '<span>Несгораемые дни</span>' +
                    '</div>' +
                    '<div class="desktop-stats-streak-days" id="statsStreakDaysGrid"></div>' +
                    '<div class="desktop-stats-streak-info" id="statsStreakInfo"></div>' +
                '</div>' +
                '<div class="desktop-stats-separator"></div>' +
                '<div style="display:flex; align-items:center; justify-content:flex-end; padding-top:1px;">' +
                    '<button class="desktop-stats-refresh-btn" id="desktopStatsRefreshBtn" title="Обновить">' +
                        '<i data-lucide="refresh-ccw" width="14" height="14"></i>' +
                    '</button>' +
                '</div>' +
            '</div>';

        // Вставляем панель в шапку после логотипа
        const logoLink = container.querySelector('.logo-link');
        if (logoLink && logoLink.nextSibling) {
            container.insertBefore(panel, logoLink.nextSibling);
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

        // Внутреннее кольцо — время (жёлтое), 2*PI*26 ≈ 163.36
        const timeRatio = timePlan > 0 ? Math.min(timeFact / timePlan, 1) : 0;
        this._updateRing('statsRingTime', timeRatio, 163.36);

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
     * Отформатировать время в компактный вид чч:мм.
     * @param {number} ms
     * @returns {string}
     */
    _formatTimeCompact(ms) {
        if (!ms || ms <= 0) return '0:00';
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours + ':' + String(minutes).padStart(2, '0');
    },

    /**
     * Отформатировать время из ms в человекочитаемый вид (чч:мм).
     * @param {number} ms
     * @returns {string}
     */
    _formatTime(ms) {
        if (!ms || ms <= 0) return '0:00';
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours + ':' + String(minutes).padStart(2, '0');
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
