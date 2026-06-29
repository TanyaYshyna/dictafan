/**
 * Панель статистики «Время / Деньги» на рабочем столе.
 *
 * Минимальный режим (по умолчанию, ширина 100px):
 *   — Две кольцевые SVG-диаграммы: внутренняя (жёлтая) — время, внешняя (розовая) — деньги
 *   — В центре: огонь + число несгораемых дней в ряд, под ним время чч:мм
 *   — Под диаграммой: строка с деньгами за сегодня
 *   — Внизу pull-tab (язычок) для открытия расширенной панели
 *
 * Расширенная панель (открывается по клику на pull-tab):
 *   — Все строки статистики (план/факт времени, денег, итого)
 *   — Стрик-календарь
 *   — Кнопка обновить (lucide refresh-ccw)
 *
 * Панель можно перетаскивать мышью или touch-ом.
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

    /** Таймер для long-press */
    _longPressTimer: null,

    /** Флаг перетаскивания */
    _dragging: false,
    _dragOffsetX: 0,
    _dragOffsetY: 0,

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
        panel.innerHTML =
            // --- Кольцевые диаграммы + центр ---
            '<div class="desktop-stats-rings" id="desktopStatsRings">' +
                '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
                    // Внешнее кольцо (деньги)
                    '<circle cx="50" cy="50" r="44" fill="none" class="stats-ring-money-bg" stroke-width="6" />' +
                    '<circle id="statsRingMoney" cx="50" cy="50" r="44" fill="none" class="stats-ring-money" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 276.46" transform="rotate(-90 50 50)" />' +
                    // Внутреннее кольцо (время)
                    '<circle cx="50" cy="50" r="35" fill="none" class="stats-ring-time-bg" stroke-width="6" />' +
                    '<circle id="statsRingTime" cx="50" cy="50" r="35" fill="none" class="stats-ring-time" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 219.91" transform="rotate(-90 50 50)" />' +
                '</svg>' +
                '<div class="desktop-stats-rings-center">' +
                    '<div class="desktop-stats-fire-row">' +
                        '<span class="stats-fire-icon"><i data-lucide="flame" width="16" height="16"></i></span>' +
                        '<span class="stats-streak-number" id="statsStreakNumber">—</span>' +
                    '</div>' +
                    '<div class="desktop-stats-time-row" id="statsTodayTimeCompact">—</div>' +
                '</div>' +
            '</div>' +
            // --- Деньги под диаграммой ---
            '<div class="desktop-stats-money-row">' +
                '<span class="stats-money-icon"><i data-lucide="dollar-sign" width="16" height="16"></i></span>' +
                '<span id="statsTodayMoneyCompact">—</span>' +
            '</div>' +
            // --- Pull-tab ---
            '<button class="desktop-stats-pull-tab" id="desktopStatsPullTab" title="Подробнее">' +
                '<i data-lucide="chevron-down" width="14" height="14"></i>' +
            '</button>' +
            // --- Расширенная панель ---
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

        // Долгое нажатие (touch) — обновить статистику на мобильных
        panel.addEventListener('touchstart', (e) => {
            // Если это drag (одним пальцем), не запускаем long-press
            if (e.touches.length !== 1) return;
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

        // --- Drag-and-drop ---
        this._initDrag(panel);

        // Загружаем данные
        this.load();

        // Слушаем событие завершения диктанта
        document.addEventListener('dictation-completed', () => {
            this.load();
        });
    },

    /**
     * Инициализировать drag-and-drop для панели.
     * @param {HTMLElement} panel
     */
    _initDrag(panel) {
        const onPointerDown = (e) => {
            // Не перетаскивать, если клик по pull-tab, кнопке или внутри expanded
            if (e.target.closest('button, .desktop-stats-expanded, .desktop-stats-pull-tab')) return;
            // Только левая кнопка мыши
            if (e.type === 'mousedown' && e.button !== 0) return;

            this._dragging = true;
            const rect = panel.getBoundingClientRect();
            this._dragOffsetX = e.clientX - rect.left;
            this._dragOffsetY = e.clientY - rect.top;
            panel.style.cursor = 'grabbing';
            panel.style.transition = 'none';
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (!this._dragging) return;
            const container = panel.parentElement;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();

            let x = e.clientX - containerRect.left - this._dragOffsetX;
            let y = e.clientY - containerRect.top - this._dragOffsetY;

            // Ограничиваем в пределах контейнера
            x = Math.max(0, Math.min(x, containerRect.width - panel.offsetWidth));
            y = Math.max(0, Math.min(y, containerRect.height - panel.offsetHeight));

            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            e.preventDefault();
        };

        const onPointerUp = () => {
            if (!this._dragging) return;
            this._dragging = false;
            panel.style.cursor = '';
            panel.style.transition = '';
        };

        // Mouse
        panel.addEventListener('mousedown', onPointerDown);
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);

        // Touch
        panel.addEventListener('touchstart', (e) => {
            if (e.target.closest('button, .desktop-stats-expanded, .desktop-stats-pull-tab')) return;
            if (e.touches.length !== 1) return;
            this._dragging = true;
            const touch = e.touches[0];
            const rect = panel.getBoundingClientRect();
            this._dragOffsetX = touch.clientX - rect.left;
            this._dragOffsetY = touch.clientY - rect.top;
            panel.style.cursor = 'grabbing';
            panel.style.transition = 'none';
        }, { passive: false });

        panel.addEventListener('touchmove', (e) => {
            if (!this._dragging) return;
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const container = panel.parentElement;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();

            let x = touch.clientX - containerRect.left - this._dragOffsetX;
            let y = touch.clientY - containerRect.top - this._dragOffsetY;

            x = Math.max(0, Math.min(x, containerRect.width - panel.offsetWidth));
            y = Math.max(0, Math.min(y, containerRect.height - panel.offsetHeight));

            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            e.preventDefault();
        }, { passive: false });

        panel.addEventListener('touchend', () => {
            if (!this._dragging) return;
            this._dragging = false;
            panel.style.cursor = '';
            panel.style.transition = '';
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
        const timePlan = (d.daily_time_plan ?? 10) * 60 * 1000; // план в ms
        const moneyFact = d.today_money ?? 0;
        const moneyPlan = d.daily_money_plan ?? 100;

        // --- Центр: огонь + число несгораемых дней ---
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

        // Внутреннее кольцо — время (жёлтое)
        const timeRatio = timePlan > 0 ? Math.min(timeFact / timePlan, 1) : 0;
        this._updateRing('statsRingTime', timeRatio, 219.91); // 2*PI*35 ≈ 219.91

        // Внешнее кольцо — деньги (розовое)
        const moneyRatio = moneyPlan > 0 ? Math.min(moneyFact / moneyPlan, 1) : 0;
        this._updateRing('statsRingMoney', moneyRatio, 276.46); // 2*PI*44 ≈ 276.46

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
