/**
 * Класс для отображения статистики пользователя с графиком занятий
 * Показывает модальное окно с вертикальными столбиками
 */
class StatisticsReport {
    constructor(activityHistory, options = {}) {
        this.history = activityHistory;
        this.modal = null;
        this.container = null;
        this.groupBy = options.groupBy || 'days'; // days, weeks, months
        this.selectedUserId = options.userId || null;
        this._activityUsers = [];
        this._userDropdownOpen = false;
    }

    formatDateForInput(dt) {
        try {
            const d = (dt instanceof Date) ? dt : new Date(dt);
            if (Number.isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        } catch (e) {
            return '';
        }
    }

    async ensureHistoryLoaded() {
        try {
            if (!this.history) return;
            if (this.history._allHistoryCache && typeof this.history._allHistoryCache === 'object') return;
            if (typeof this.history.loadAllHistory === 'function') {
                const all = await this.history.loadAllHistory();
                if (all && typeof all === 'object') {
                    this.history._allHistoryCache = all;
                }
            }
        } catch (e) {
        }
    }

    /**
     * Создать модальное окно для статистики
     */
    createModal() {
        // Проверяем, существует ли уже модальное окно
        let modal = document.getElementById('statistics-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        // Создаем модальное окно
        modal = document.createElement('div');
        modal.id = 'statistics-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.backdropFilter = 'blur(4px)';
        // Скролл должен быть внутри модалки, а не у страницы.
        modal.style.overflow = 'hidden';
        // На странице приватной библиотеки много элементов с высоким z-index
        // (карточки, дропдауны, оверлеи). Ставим выше, чтобы модалка была видна.
        modal.style.zIndex = '10150';

        modal.innerHTML = `
            <div class="modal-content statistics-modal-content">
                <div class="statistics-header">
                    <div style="display:flex; align-items:center; gap: 14px; min-width: 0;">
                        <h2 style="margin: 0; white-space: nowrap;">Отчет об активности</h2>
                        <div id="statisticsHeaderLegend" style="display:flex; align-items:center; gap: 8px; flex-wrap: wrap; min-width: 0;">
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span style="display:inline-block; width: 38px; height: 10px; border-radius: 6px; background: var(--color-button-mint, #6ee7b7);"></span>
                                <i data-lucide="star" style="width: 18px; height: 18px;"></i>
                                <span style="white-space: nowrap;">Perfect (без ошибок с 1-й попытки)</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span style="display:inline-block; width: 38px; height: 10px; border-radius: 6px; background: var(--color-button-lightgreen, #86efac);"></span>
                                <i data-lucide="star-half" style="width: 18px; height: 18px;"></i>
                                <span style="white-space: nowrap;">Corrected (исправленные)</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span style="display:inline-block; width: 38px; height: 10px; border-radius: 6px; background: var(--color-button-purple, #a78bfa);"></span>
                                <i data-lucide="mic" style="width: 18px; height: 18px;"></i>
                                <span style="white-space: nowrap;">Audio (аудио контроль)</span>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap: 10px; flex-shrink: 0;">
                        <button id="updateStatisticsBtn" class="button-color-yellow">Сформировать</button>
                        <button class="close-statistics-btn" id="closeStatisticsBtn">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>
                
                <div class="statistics-controls">
                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap: wrap;">
                        <div style="display:flex; align-items:center; gap: 10px;">
                            <div id="activityUserPicker" style="position: relative; min-width: 220px;">
                                <button id="activityUserPickerBtn" type="button" class="group-select" style="width: 100%; display:flex; align-items:center; gap: 10px; justify-content: space-between; font-size: 16px; font-weight: 500;">
                                    <span style="display:flex; align-items:center; gap: 10px; min-width: 0;">
                                        <img id="activityUserPickerAvatar" src="" alt="" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #e9eef5; flex: 0 0 auto;">
                                        <span id="activityUserPickerLabel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                                    </span>
                                    <i data-lucide="chevron-down" style="width: 18px; height: 18px; flex: 0 0 auto;"></i>
                                </button>
                                <div id="activityUserPickerMenu" style="display:none; position:absolute; left:0; top: calc(100% + 6px); width: 100%; max-height: 300px; overflow:auto; background: #fff; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); z-index: 5; padding: 6px;"></div>
                            </div>
                            <select id="activityUserSelect" class="group-select" style="display:none;"></select>
                            <select id="groupBySelect" class="group-select">
                                <option value="days">По дням</option>
                                <option value="weeks">По неделям</option>
                                <option value="months">По месяцам</option>
                            </select>
                        </div>

                        <div class="date-range-controls" style="margin-left: auto;">
                            <input type="date" id="startDate" class="date-input" style="width: 150px; padding-right: 34px;">
                            <span>—</span>
                            <input type="date" id="endDate" class="date-input" style="width: 150px; padding-right: 34px;">
                        </div>
                    </div>
                </div>

                <div class="statistics-chart" id="statisticsChart">
                    <!-- Здесь будет график -->
                </div>
            </div>
        `;

        try {
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.style.zIndex = '10151';
                content.style.maxHeight = '90vh';
                content.style.height = '90vh';
                content.style.display = 'flex';
                content.style.flexDirection = 'column';
                content.style.overflow = 'hidden';
                content.style.boxSizing = 'border-box';
            }

            const header = modal.querySelector('.statistics-header');
            if (header) {
                header.style.flexShrink = '0';
            }

            const controls = modal.querySelector('.statistics-controls');
            if (controls) {
                controls.style.flexShrink = '0';
            }

            const chart = modal.querySelector('#statisticsChart');
            if (chart) {
                chart.style.flex = '1 1 auto';
                chart.style.overflowY = 'auto';
                chart.style.minHeight = '0';
            }
        } catch (e) {
        }

        document.body.appendChild(modal);
        this.modal = modal;

        // Инициализируем иконки
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Обработчики событий
        document.getElementById('closeStatisticsBtn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('updateStatisticsBtn').addEventListener('click', () => {
            this.updateStatistics();
        });

        // Закрытие по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hide();
            }
        });

        // Устанавливаем даты по умолчанию (последние 30 дней)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        document.getElementById('startDate').value = this.formatDateForInput(startDate);
        document.getElementById('endDate').value = this.formatDateForInput(endDate);

        try {
            const userSelect = document.getElementById('activityUserSelect');
            if (userSelect) {
                userSelect.addEventListener('change', () => {
                    const raw = userSelect.value;
                    const parsed = parseInt(String(raw || ''), 10);
                    this.selectedUserId = Number.isFinite(parsed) ? parsed : null;
                    try {
                        this.updateUserPickerUI();
                    } catch (e) {
                    }
                    this.updateStatistics();
                });
            }
        } catch (e) {
        }

        try {
            const btn = document.getElementById('activityUserPickerBtn');
            const menu = document.getElementById('activityUserPickerMenu');
            if (btn && menu) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleUserDropdown();
                });

                document.addEventListener('click', (e) => {
                    if (!this._userDropdownOpen) return;
                    const root = document.getElementById('activityUserPicker');
                    if (root && !root.contains(e.target)) {
                        this.closeUserDropdown();
                    }
                });
            }
        } catch (e) {
        }
    }

    avatarUrlForUser(userId) {
        try {
            const id = encodeURIComponent(String(userId));
            return `/user/api/avatar?user_id=${id}&size=small`;
        } catch (e) {
            return '/static/icons/default-avatar-small.svg';
        }
    }

    toggleUserDropdown() {
        if (this._userDropdownOpen) {
            this.closeUserDropdown();
        } else {
            this.openUserDropdown();
        }
    }

    openUserDropdown() {
        try {
            const menu = document.getElementById('activityUserPickerMenu');
            if (!menu) return;
            menu.style.display = 'block';
            this._userDropdownOpen = true;
        } catch (e) {
        }
    }

    closeUserDropdown() {
        try {
            const menu = document.getElementById('activityUserPickerMenu');
            if (!menu) return;
            menu.style.display = 'none';
            this._userDropdownOpen = false;
        } catch (e) {
        }
    }

    updateUserPickerUI() {
        try {
            const labelEl = document.getElementById('activityUserPickerLabel');
            const avatarEl = document.getElementById('activityUserPickerAvatar');
            if (!labelEl || !avatarEl) return;

            const u = (this._activityUsers || []).find(x => Number(x && x.id) === Number(this.selectedUserId));
            const label = String(u && u.label ? u.label : '');
            labelEl.textContent = label;
            const uid = Number(u && u.id);
            avatarEl.src = Number.isFinite(uid) ? this.avatarUrlForUser(uid) : '/static/icons/default-avatar-small.svg';
            avatarEl.onerror = function () {
                try { this.onerror = null; this.src = '/static/icons/default-avatar-small.svg'; } catch (e) {}
            };
        } catch (e) {
        }
    }

    dateToId(dateObj) {
        const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
    }

    fillMissingDays(stats, startDate, endDate) {
        try {
            const map = new Map();
            for (const s of stats || []) {
                if (!s || !s.date) continue;
                map.set(String(s.date), {
                    date: String(s.date),
                    perfect: Number(s.perfect) || 0,
                    corrected: Number(s.corrected) || 0,
                    audio: Number(s.audio) || 0,
                });
            }

            const out = [];
            const cur = new Date(startDate);
            const last = new Date(endDate);
            cur.setHours(0, 0, 0, 0);
            last.setHours(0, 0, 0, 0);
            while (cur.getTime() <= last.getTime()) {
                const id = this.dateToId(cur);
                out.push(map.get(id) || { date: id, perfect: 0, corrected: 0, audio: 0 });
                cur.setDate(cur.getDate() + 1);
            }
            return out;
        } catch (e) {
            return stats || [];
        }
    }

    async ensureUsersLoaded() {
        try {
            if (!this.history || typeof this.history.listActivityReportUsers !== 'function') return;
            const userSelect = document.getElementById('activityUserSelect');
            if (!userSelect) return;
            if (userSelect.options && userSelect.options.length > 0) return;

            const users = await this.history.listActivityReportUsers();
            if (!Array.isArray(users) || users.length === 0) return;

            this._activityUsers = users;

            const opts = [];
            for (const u of users) {
                const id = Number(u && u.id);
                if (!Number.isFinite(id)) continue;
                const label = String(u && u.label ? u.label : (u && u.username ? u.username : `User #${id}`));
                opts.push({ id, label });
            }
            if (!opts.length) return;

            userSelect.innerHTML = opts
                .map(o => `<option value="${o.id}">${this.escapeHtml(o.label)}</option>`)
                .join('');

            if (this.selectedUserId == null) {
                this.selectedUserId = opts[0].id;
            }
            userSelect.value = String(this.selectedUserId);

            try {
                const menu = document.getElementById('activityUserPickerMenu');
                if (menu) {
                    menu.innerHTML = opts.map(o => {
                        const url = this.avatarUrlForUser(o.id);
                        const active = Number(o.id) === Number(this.selectedUserId);
                        return `
                            <button type="button" data-user-id="${o.id}" style="width:100%; display:flex; align-items:center; gap: 10px; padding: 8px 10px; border: 0; background: ${active ? 'rgba(35, 99, 235, 0.08)' : 'transparent'}; border-radius: 10px; cursor: pointer; text-align:left; font-size: 14px; font-weight: 400;">
                                <img src="${url}" alt="" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/icons/default-avatar-small.svg';">
                                <span style="overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(o.label)}</span>
                            </button>
                        `;
                    }).join('');

                    menu.querySelectorAll('button[data-user-id]').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const uid = parseInt(String(btn.getAttribute('data-user-id') || ''), 10);
                            if (!Number.isFinite(uid)) return;
                            this.selectedUserId = uid;
                            try { userSelect.value = String(uid); } catch (e2) {}
                            this.updateUserPickerUI();
                            this.closeUserDropdown();
                            this.updateStatistics();
                        });
                    });
                }
            } catch (e) {
            }

            try {
                this.updateUserPickerUI();
            } catch (e) {
            }
        } catch (e) {
        }
    }

    escapeHtml(v) {
        const s = String(v || '');
        return s
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    /**
     * Форматировать дату для input[type="date"]
     */
    formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Форматировать дату для отображения
     */
    formatDate(dateString) {
        if (this.groupBy === 'days') {
            // YYYYMMDD -> DD.MM.YYYY
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            return `${day}.${month}.${year}`;
        } else if (this.groupBy === 'weeks') {
            return dateString;
        } else if (this.groupBy === 'months') {
            // YYYYMM -> MM.YYYY
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            return `${month}.${year}`;
        }
        return dateString;
    }

    /**
     * Показать модальное окно
     */
    async show() {
        if (!this.modal) {
            this.createModal();
        }

        this.modal.style.display = 'flex';
        try {
            await this.ensureHistoryLoaded();
        } catch (e) {
        }
        try {
            await this.ensureUsersLoaded();
        } catch (e) {
        }
        await this.updateStatistics();
    }

    /**
     * Скрыть модальное окно
     */
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    /**
     * Обновить статистику
     */
    async updateStatistics() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const groupBySelect = document.getElementById('groupBySelect');

        if (!startDateInput || !endDateInput || !groupBySelect) return;

        const chartContainer = document.getElementById('statisticsChart');
        if (chartContainer) {
            chartContainer.innerHTML = '<p class="no-data">Формируем отчет…</p>';
        }

        const startDate = new Date(startDateInput.value);
        const endDate = new Date(endDateInput.value);
        this.groupBy = groupBySelect.value;

        // Получаем статистику за период
        let stats = [];
        try {
            await this.ensureHistoryLoaded();
        } catch (e) {
        }

        try {
            if (this.history && typeof this.history.getStatisticsByPeriod === 'function') {
                stats = await this.history.getStatisticsByPeriod(startDate, endDate, this.groupBy, this.selectedUserId);
            }
        } catch (e) {
            stats = [];
        }

        if (this.groupBy === 'days') {
            stats = this.fillMissingDays(stats, startDate, endDate);
        }

        // Рисуем график
        this.renderChart(stats);
    }

    /**
     * Нарисовать график
     */
    renderChart(stats) {
        const chartContainer = document.getElementById('statisticsChart');
        if (!chartContainer) return;

        if (stats.length === 0) {
            chartContainer.innerHTML = '<p class="no-data">Нет данных за выбранный период</p>';
            return;
        }

        const orderedStats = Array.isArray(stats) ? [...stats].reverse() : [];

        // Находим максимальное значение для масштабирования
        const maxValue = Math.max(...orderedStats.map(s => s.perfect + s.corrected + s.audio));

        const dayMs = 24 * 60 * 60 * 1000;

        let html = '<div class="chart-container">';

        orderedStats.forEach(stat => {
            const total = stat.perfect + stat.corrected + stat.audio;
            const perfectPercent = maxValue > 0 ? (stat.perfect / maxValue) * 100 : 0;
            const correctedPercent = maxValue > 0 ? (stat.corrected / maxValue) * 100 : 0;
            const audioPercent = maxValue > 0 ? (stat.audio / maxValue) * 100 : 0;

            const timeMs = Number(stat.time_ms) || 0;
            const timeLabel = timeMs > 0 ? this.formatDurationHhMmSs(timeMs) : '';

            const dow = (this.groupBy === 'days') ? this.getWeekdayShort(stat.date) : '';
            const dowStyle = (this.groupBy === 'days') ? this.getWeekdayBadgeStyle(stat.date) : '';

            html += `
                <div class="chart-row">
                    ${this.groupBy === 'days' ? `<div style="flex: 0 0 auto; width: 34px; border-radius: 10px; display:flex; align-items:center; justify-content:center; ${dowStyle}">${dow}</div>` : ''}
                    <div class="chart-date" style="text-align:left; min-width: 120px; padding-top: 0;">
                        <div style="font-size: 14px; font-weight: 500; line-height: 1.2;">${this.formatDate(stat.date)}</div>
                        ${this.groupBy === 'days' && timeMs > 0 ? `<div style="margin-top: 4px; font-size: 13px; font-weight: 500; color: rgba(31,41,51,0.75); line-height: 1.1;">${timeLabel}</div>` : ''}
                    </div>
                    <div class="chart-bars">
                        <div class="bar-container">
                            ${stat.perfect > 0 ? `
                                <div class="bar perfect-bar" style="width: ${perfectPercent}%" 
                                     title="Perfect: ${stat.perfect}">
                                </div>
                            ` : ''}
                            <span class="bar-label">${stat.perfect}</span>
                        </div>
                        <div class="bar-container">
                            ${stat.corrected > 0 ? `
                                <div class="bar corrected-bar" style="width: ${correctedPercent}%" 
                                     title="Corrected: ${stat.corrected}">
                                </div>
                            ` : ''}
                            <span class="bar-label">${stat.corrected}</span>
                        </div>
                        <div class="bar-container">
                            ${stat.audio > 0 ? `
                                <div class="bar audio-bar" style="width: ${audioPercent}%" 
                                     title="Audio: ${stat.audio}">
                                </div>
                            ` : ''}
                            <span class="bar-label">${stat.audio}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        chartContainer.innerHTML = html;
    }

    formatDurationHhMmSs(ms) {
        try {
            const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } catch (e) {
            return '00:00:00';
        }
    }

    getWeekdayShort(dateId) {
        try {
            const s = String(dateId || '');
            if (!/^[0-9]{8}$/.test(s)) return '';
            const y = parseInt(s.substring(0, 4), 10);
            const m = parseInt(s.substring(4, 6), 10) - 1;
            const d = parseInt(s.substring(6, 8), 10);
            const dt = new Date(y, m, d);
            const jsDay = dt.getDay();
            const map = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 0: 'вс' };
            return map[jsDay] || '';
        } catch (e) {
            return '';
        }
    }

    getWeekdayBadgeStyle(dateId) {
        try {
            const s = String(dateId || '');
            if (!/^[0-9]{8}$/.test(s)) return 'background: rgba(31,41,51,0.08); color: rgba(31,41,51,0.75); font-weight: 400; font-size: 13px; line-height: 1; padding-top: 1px;';
            const y = parseInt(s.substring(0, 4), 10);
            const m = parseInt(s.substring(4, 6), 10) - 1;
            const d = parseInt(s.substring(6, 8), 10);
            const dt = new Date(y, m, d);
            const jsDay = dt.getDay();
            const isWeekend = (jsDay === 0 || jsDay === 6);
            if (isWeekend) {
                return 'background: rgba(255, 143, 171, 0.28); color: rgba(127, 29, 29, 0.85); font-weight: 400; font-size: 13px; line-height: 1; padding-top: 1px;';
            }
            const tone = (jsDay % 2 === 0)
                ? 'background: rgba(31,41,51,0.16); color: rgba(31,41,51,0.85);'
                : 'background: rgba(31,41,51,0.10); color: rgba(31,41,51,0.80);';
            return `${tone} font-weight: 400; font-size: 13px; line-height: 1; padding-top: 1px;`;
        } catch (e) {
            return 'background: rgba(31,41,51,0.08); color: rgba(31,41,51,0.75); font-weight: 400; font-size: 13px; line-height: 1; padding-top: 1px;';
        }
    }

    /**
     * Открыть статистику для текущего пользователя
     */
    static async open(activityHistory) {
        const report = new StatisticsReport(activityHistory);
        await report.show();
    }
}

class RatingReport {
    constructor(options = {}) {
        this.modal = null;
        this.selectedPeriod = options.period || 'today';
        this.customStartDate = null;
        this.customEndDate = null;
    }

    getToken() {
        try {
            if (typeof window !== 'undefined' && window && window.UM && window.UM.token) {
                return window.UM.token;
            }
        } catch (e) {
        }
        try {
            const t = localStorage.getItem('token');
            if (t) return t;
        } catch (e) {
        }
        return null;
    }

    avatarUrlForUser(userId) {
        try {
            const id = encodeURIComponent(String(userId));
            return `/user/api/avatar?user_id=${id}&size=small`;
        } catch (e) {
            return '/static/icons/default-avatar-small.svg';
        }
    }

    formatDateForInput(dt) {
        try {
            const d = (dt instanceof Date) ? dt : new Date(dt);
            if (Number.isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        } catch (e) {
            return '';
        }
    }

    getPeriodRange(periodKey) {
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        const start = new Date(end);
        const key = String(periodKey || 'today');

        if (key === '3') {
            start.setDate(start.getDate() - 2);
        } else if (key === '7') {
            start.setDate(start.getDate() - 6);
        } else if (key === '30') {
            start.setDate(start.getDate() - 29);
        } else {
            // today
        }
        return { start, end };
    }

    applyPeriodToDateInputs() {
        const startInput = document.getElementById('ratingStartDate');
        const endInput = document.getElementById('ratingEndDate');
        if (!startInput || !endInput) return;

        const isCustom = String(this.selectedPeriod) === 'custom';
        startInput.disabled = !isCustom;
        endInput.disabled = !isCustom;

        if (!isCustom) {
            const { start, end } = this.getPeriodRange(this.selectedPeriod);
            startInput.value = this.formatDateForInput(start);
            endInput.value = this.formatDateForInput(end);
            return;
        }

        // custom
        if (!this.customStartDate || !this.customEndDate) {
            const { start, end } = this.getPeriodRange('30');
            this.customStartDate = this.formatDateForInput(start);
            this.customEndDate = this.formatDateForInput(end);
        }
        startInput.value = String(this.customStartDate || '');
        endInput.value = String(this.customEndDate || '');
        this.validateAndNormalizeCustomRange();
    }

    validateAndNormalizeCustomRange() {
        const startInput = document.getElementById('ratingStartDate');
        const endInput = document.getElementById('ratingEndDate');
        if (!startInput || !endInput) return;

        const s = String(startInput.value || '');
        const e = String(endInput.value || '');
        if (!s || !e) return;

        const sd = new Date(s);
        const ed = new Date(e);
        if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return;

        // Если пользователь перепутал даты, подтягиваем вторую к первой.
        if (sd.getTime() > ed.getTime()) {
            endInput.value = s;
        } else if (ed.getTime() < sd.getTime()) {
            startInput.value = e;
        }

        this.customStartDate = String(startInput.value || '');
        this.customEndDate = String(endInput.value || '');
    }

    createModal() {
        let modal = document.getElementById('rating-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        modal = document.createElement('div');
        modal.id = 'rating-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.backdropFilter = 'blur(4px)';
        modal.style.overflow = 'hidden';
        modal.style.zIndex = '10150';

        modal.innerHTML = `
            <div class="modal-content statistics-modal-content">
                <div class="statistics-header">
                    <div style="display:flex; align-items:center; gap: 12px; min-width: 0;">
                        <h2 style="margin: 0; white-space: nowrap;">Рейтинг</h2>
                        <select id="ratingPeriodSelect" class="group-select" style="min-width: 200px;">
                            <option value="today">За сегодня</option>
                            <option value="3">За 3 дня</option>
                            <option value="7">За 7 дней</option>
                            <option value="30">За 30 дней</option>
                            <option value="custom">За период</option>
                        </select>
                    </div>

                    <div class="date-range-controls" style="margin-left: auto; display:flex; align-items:center; gap: 10px;">
                        <input type="date" id="ratingStartDate" class="date-input" style="width: 150px; padding-right: 34px;">
                        <span>—</span>
                        <input type="date" id="ratingEndDate" class="date-input" style="width: 150px; padding-right: 34px;">
                    </div>

                    <div style="display:flex; align-items:center; gap: 10px; flex-shrink: 0;">
                        <button class="action-btn" id="refreshRatingBtn" style="display:flex; align-items:center; gap: 8px;">
                            <i data-lucide="rotate-cw"></i>
                            <span>Обновить</span>
                        </button>
                        <button class="close-statistics-btn" id="closeRatingBtn">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>

                <div class="statistics-chart" id="ratingList" style="overflow-y:auto;">
                </div>
            </div>
        `;

        try {
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.style.zIndex = '10151';
                content.style.maxHeight = '90vh';
                content.style.height = '90vh';
                content.style.display = 'flex';
                content.style.flexDirection = 'column';
                content.style.overflow = 'hidden';
                content.style.boxSizing = 'border-box';
            }

            const list = modal.querySelector('#ratingList');
            if (list) {
                list.style.flex = '1 1 auto';
                list.style.minHeight = '0';
            }
        } catch (e) {
        }

        document.body.appendChild(modal);
        this.modal = modal;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        const closeBtn = document.getElementById('closeRatingBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        const refreshBtn = document.getElementById('refreshRatingBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.updateRating());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hide();
            }
        });

        try {
            const sel = document.getElementById('ratingPeriodSelect');
            if (sel) {
                sel.value = String(this.selectedPeriod);
                sel.addEventListener('change', () => {
                    this.selectedPeriod = String(sel.value || 'today');
                    this.applyPeriodToDateInputs();
                    this.updateRating();
                });
            }
        } catch (e) {
        }

        try {
            const startInput = document.getElementById('ratingStartDate');
            const endInput = document.getElementById('ratingEndDate');
            const onDateChange = () => {
                this.validateAndNormalizeCustomRange();
                this.updateRating();
            };
            if (startInput) startInput.addEventListener('change', onDateChange);
            if (endInput) endInput.addEventListener('change', onDateChange);
        } catch (e) {
        }

        this.applyPeriodToDateInputs();
    }

    async show() {
        if (!this.modal) {
            this.createModal();
        }
        this.modal.style.display = 'flex';
        await this.updateRating();
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    formatDurationHhMmSs(ms) {
        try {
            const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } catch (e) {
            return '00:00:00';
        }
    }

    async updateRating() {
        const root = document.getElementById('ratingList');
        if (root) {
            root.innerHTML = '<p class="no-data">Формируем рейтинг…</p>';
        }

        const token = this.getToken();
        if (!token) {
            if (root) root.innerHTML = '<p class="no-data">Не найден токен</p>';
            return;
        }

        let rating = [];
        try {
            const isCustom = String(this.selectedPeriod) === 'custom';
            const startInput = document.getElementById('ratingStartDate');
            const endInput = document.getElementById('ratingEndDate');
            let startDate = null;
            let endDate = null;

            if (isCustom && startInput && endInput) {
                this.validateAndNormalizeCustomRange();
                startDate = String(startInput.value || '');
                endDate = String(endInput.value || '');
            }

            const res = await fetch('/api/statistics/rating', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    period: this.selectedPeriod,
                    ...(isCustom && startDate && endDate ? { start_date: startDate, end_date: endDate } : {}),
                })
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success && Array.isArray(js.rating))) {
                rating = [];
            } else {
                rating = js.rating;
            }
        } catch (e) {
            rating = [];
        }

        if (!root) return;
        if (!rating.length) {
            root.innerHTML = '<p class="no-data">Нет данных</p>';
            return;
        }

        const rows = rating.map((r, idx) => {
            const uid = Number(r && r.user_id);
            const name = String(r && r.username ? r.username : '');
            const perfect = Number(r && r.perfect) || 0;
            const corrected = Number(r && r.corrected) || 0;
            const audio = Number(r && r.audio) || 0;
            const avatar = this.avatarUrlForUser(uid);

            return `
                <div class="chart-row" style="align-items:center; gap: 12px;">
                    <div style="min-width: 30px; text-align:right; font-weight: 600; color: rgba(31,41,51,0.75);">${idx + 1}</div>
                    <img src="${avatar}" alt="" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/icons/default-avatar-small.svg';">
                    <div style="flex: 1 1 auto; min-width: 0;">
                        <div style="font-size: 15px; font-weight: 600; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(name)}</div>
                        <div style="margin-top: 6px; display:flex; align-items:center; gap: 14px; flex-wrap: wrap;">
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-text-mint, #059669);">
                                <i data-lucide="star" style="width: 18px; height: 18px;"></i>
                                <span style="font-size: 16px; font-weight: 700;">${perfect}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-text-lightgreen, #16a34a);">
                                <i data-lucide="star-half" style="width: 18px; height: 18px;"></i>
                                <span style="font-size: 16px; font-weight: 700;">${corrected}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-text-purple, #7c3aed);">
                                <i data-lucide="mic" style="width: 18px; height: 18px;"></i>
                                <span style="font-size: 16px; font-weight: 700;">${audio}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        root.innerHTML = `<div class="chart-container">${rows}</div>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    escapeHtml(v) {
        const s = String(v || '');
        return s
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    static async open() {
        const rep = new RatingReport();
        await rep.show();
    }
}
