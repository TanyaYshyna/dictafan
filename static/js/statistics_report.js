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
        this.selectedLanguage = 'all';
    }

    getLanguageData() {
        try {
            if (window.LanguageManager && typeof window.LanguageManager.getLanguageData === 'function') {
                return window.LanguageManager.getLanguageData() || {};
            }
        } catch (e) {
        }
        try {
            return (window.LANGUAGE_DATA && typeof window.LANGUAGE_DATA === 'object') ? window.LANGUAGE_DATA : {};
        } catch (e) {
        }
        return {};
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
                    <div style="display:flex; align-items:flex-start; gap: 14px; min-width: 0; flex: 1 1 auto;">
                        <div style="display:flex; align-items:stretch; gap: 12px; min-width: 0;">
                            <div style="display:flex; flex-direction: column; align-items:flex-start; gap: 8px; min-width: 240px;">
                                <div style="font-size: 22px; font-weight: 700; line-height: 1.1;">Отчет об активности</div>
                                <div id="activityLanguagePicker" style="position: relative; min-width: 210px; width: 100%;"></div>
                            </div>

                            <div style="display:flex; flex-direction: column; align-items:flex-start; gap: 8px; padding-top: 2px;">
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
                    </div>

                    <div style="display:flex; align-items:center; gap: 10px; flex-shrink: 0; padding-top: 2px;">
                        <button id="updateStatisticsBtn" class="action-btn" title="Обновить" style="display:flex; align-items:center; justify-content:center; padding-left: 10px; padding-right: 10px;">
                            <i data-lucide="rotate-cw" style="width: 18px; height: 18px;"></i>
                        </button>
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
                            <input type="date" id="startDate" class="date-input" style="width: 128px; padding-right: 20px;">
                            <span>—</span>
                            <input type="date" id="endDate" class="date-input" style="width: 128px; padding-right: 20px;">
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

        try {
            const wrap = document.getElementById('planfactLanguagePicker');
            if (wrap && typeof LanguageSelector !== 'undefined') {
                const raw = this.getLanguageData() || {};
                const dataWithAll = { all: { language_ru: 'Все языки', language_en: 'All languages' }, ...raw };
                const codes = ['all', ...Object.keys(raw || {}).map(k => String(k).toLowerCase()).filter(Boolean).sort()];
                new LanguageSelector({
                    container: wrap,
                    mode: 'report-selector',
                    languageData: dataWithAll,
                    nativeLanguage: 'all',
                    learningLanguages: codes,
                    currentLearning: String(this.selectedLanguage || 'all').trim().toLowerCase() || 'all',
                    onLanguageChange: ({ currentLearning }) => {
                        this.selectedLanguage = String(currentLearning || 'all').trim().toLowerCase() || 'all';
                        this.updateReport();
                    }
                });
            }
        } catch (e) {
        }

        // Обработчики событий
        document.getElementById('closeStatisticsBtn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('updateStatisticsBtn').addEventListener('click', () => {
            this.updateStatistics();
        });

        try {
            const wrap = document.getElementById('activityLanguagePicker');
            if (wrap && typeof LanguageSelector !== 'undefined') {
                const raw = this.getLanguageData() || {};
                const dataWithAll = { all: { language_ru: 'Все языки', language_en: 'All languages' }, ...raw };
                const codes = ['all', ...Object.keys(raw || {}).map(k => String(k).toLowerCase()).filter(Boolean).sort()];
                new LanguageSelector({
                    container: wrap,
                    mode: 'report-selector',
                    languageData: dataWithAll,
                    nativeLanguage: 'all',
                    learningLanguages: codes,
                    currentLearning: String(this.selectedLanguage || 'all').trim().toLowerCase() || 'all',
                    onLanguageChange: ({ currentLearning }) => {
                        this.selectedLanguage = String(currentLearning || 'all').trim().toLowerCase() || 'all';
                        this.updateStatistics();
                    }
                });
            }
        } catch (e) {
        }

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

        try {
            const groupBy = document.getElementById('groupBySelect');
            if (groupBy) {
                groupBy.addEventListener('change', () => this.updateStatistics());
            }
        } catch (e) {
        }
        try {
            if (document.getElementById('startDate')) document.getElementById('startDate').addEventListener('change', () => this.updateStatistics());
            if (document.getElementById('endDate')) document.getElementById('endDate').addEventListener('change', () => this.updateStatistics());
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
                stats = await this.history.getStatisticsByPeriod(startDate, endDate, this.groupBy, this.selectedUserId, this.selectedLanguage);
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
        this.selectedLanguage = 'all';
    }

    getLanguageData() {
        try {
            if (window.LanguageManager && typeof window.LanguageManager.getLanguageData === 'function') {
                return window.LanguageManager.getLanguageData() || {};
            }
        } catch (e) {
        }
        try {
            return (window.LANGUAGE_DATA && typeof window.LANGUAGE_DATA === 'object') ? window.LANGUAGE_DATA : {};
        } catch (e) {
        }
        return {};
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
                <div class="statistics-header" style="flex-direction: column; align-items: stretch;">
                    <div style="display:flex; align-items:center; gap: 10px; min-width: 0;">
                        <div style="display:flex; align-items:center; gap: 10px; min-width: 0; flex: 1 1 auto;">
                            <h2 style="margin: 0; white-space: nowrap;">Рейтинг</h2>
                            <div id="ratingLanguagePicker" style="position: relative; min-width: 210px;"></div>
                        </div>

                        <div style="display:flex; align-items:center; gap: 10px; flex-shrink: 0;">
                            <button class="action-btn" id="refreshRatingBtn" title="Обновить" style="display:flex; align-items:center; justify-content:center; padding-left: 10px; padding-right: 10px;">
                                <i data-lucide="rotate-cw"></i>
                            </button>
                            <button class="close-statistics-btn" id="closeRatingBtn">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content:flex-start;">
                        <select id="ratingPeriodSelect" class="group-select" style="min-width: 160px;">
                            <option value="today">За сегодня</option>
                            <option value="3">За 3 дня</option>
                            <option value="7">За 7 дней</option>
                            <option value="30">За 30 дней</option>
                            <option value="custom">За период</option>
                        </select>

                        <div class="date-range-controls" style="display:flex; align-items:center; gap: 8px; flex-wrap: nowrap;">
                            <input type="date" id="ratingStartDate" class="date-input" style="width: 112px; padding-right: 18px;">
                            <span>—</span>
                            <input type="date" id="ratingEndDate" class="date-input" style="width: 112px; padding-right: 18px;">
                        </div>
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
            const wrap = document.getElementById('ratingLanguagePicker');
            if (wrap && typeof LanguageSelector !== 'undefined') {
                const raw = this.getLanguageData() || {};
                const dataWithAll = { all: { language_ru: 'Все языки', language_en: 'All languages' }, ...raw };
                const codes = ['all', ...Object.keys(raw || {}).map(k => String(k).toLowerCase()).filter(Boolean).sort()];
                new LanguageSelector({
                    container: wrap,
                    mode: 'report-selector',
                    languageData: dataWithAll,
                    nativeLanguage: 'all',
                    learningLanguages: codes,
                    currentLearning: String(this.selectedLanguage || 'all').trim().toLowerCase() || 'all',
                    onLanguageChange: ({ currentLearning }) => {
                        this.selectedLanguage = String(currentLearning || 'all').trim().toLowerCase() || 'all';
                        this.updateRating();
                    }
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
            let languageCode = null;

            languageCode = String(this.selectedLanguage || 'all');

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
                    ...(languageCode && String(languageCode).trim().toLowerCase() !== 'all' ? { language_code: String(languageCode).trim().toLowerCase() } : {}),
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

        try {
            rating = (Array.isArray(rating) ? rating : []).filter(r => {
                const p = Number(r?.perfect || 0);
                const a = Number(r?.audio || 0);
                const c = Number(r?.corrected || 0);
                return (p + a + c) > 0;
            });
        } catch (e) {
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

            let currentUserId = null;
            try {
                if (window.UM && typeof window.UM.getCurrentUser === 'function') {
                    currentUserId = Number(window.UM.getCurrentUser()?.id);
                } else if (window.UM && window.UM.userData && window.UM.userData.id != null) {
                    currentUserId = Number(window.UM.userData.id);
                }
            } catch (e) {
                currentUserId = null;
            }
            const isSelf = (currentUserId != null && !Number.isNaN(currentUserId) && uid === currentUserId);
            const rowStyle = isSelf
                ? 'border: 2px solid var(--color-button-text-yellow, rgb(255, 198, 9)); border-radius: 12px; padding: 10px 12px;'
                : 'padding: 10px 12px;';

            return `
                <div class="chart-row" style="align-items:center; gap: 12px; ${rowStyle}">
                    <div style="min-width: 30px; text-align:right; font-weight: 600; color: rgba(31,41,51,0.75);">${idx + 1}</div>
                    <img src="${avatar}" alt="" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/icons/default-avatar-small.svg';">
                    <div style="flex: 1 1 auto; min-width: 0; display:flex; align-items:center; gap: 12px;">
                        <div style="font-size: 15px; font-weight: 600; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(name)}</div>
                        <div style="margin-left: auto; display:flex; align-items:center; gap: 12px; flex: 0 0 auto;">
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-mint, #aae7e4);">
                                <i data-lucide="star" style="width: 18px; height: 18px;"></i>
                                <span style="font-size: 16px; font-weight: 700;">${perfect}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-lightgreen, #bbf1ca);">
                                <i data-lucide="star-half" style="width: 18px; height: 18px;"></i>
                                <span style="font-size: 16px; font-weight: 700;">${corrected}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-panel-text-purple, rgb(152, 154, 224));">
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

class PlanFactReport {
    constructor(activityHistory, options = {}) {
        this.history = activityHistory;
        this.modal = null;
        this.selectedUserId = options.userId || null;
        this._activityUsers = [];
        this._userDropdownOpen = false;
        this.selectedLanguage = 'all';
        this._languageSelectorInited = false;
        this._updateTimer = null;
        this._updateSeq = 0;
    }

    getCurrentUserId() {
        try {
            if (window.UM && typeof window.UM.getCurrentUser === 'function') {
                const id = Number(window.UM.getCurrentUser()?.id);
                return Number.isFinite(id) ? id : null;
            }
        } catch (e) {
        }
        try {
            if (window.UM && window.UM.userData && window.UM.userData.id != null) {
                const id = Number(window.UM.userData.id);
                return Number.isFinite(id) ? id : null;
            }
        } catch (e) {
        }
        return null;
    }

    getSelectedUserIdFromUI() {
        let userId = this.selectedUserId;
        try {
            const userSelect = document.getElementById('planfactUserSelect');
            if (userSelect && String(userSelect.value || '').trim() !== '') {
                const parsed = parseInt(String(userSelect.value || ''), 10);
                if (Number.isFinite(parsed)) {
                    userId = parsed;
                }
            }
        } catch (e) {
        }
        return userId;
    }

    scheduleUpdate(delayMs = 150) {
        try {
            if (this._updateTimer) {
                clearTimeout(this._updateTimer);
                this._updateTimer = null;
            }
            this._updateTimer = setTimeout(() => {
                this._updateTimer = null;
                this.updateReport();
            }, Math.max(0, Number(delayMs) || 0));
        } catch (e) {
            this.updateReport();
        }
    }

    initLanguageSelector() {
        try {
            const wrap = document.getElementById('planfactLanguagePicker');
            if (!wrap) return;
            if (this._languageSelectorInited) return;
            if (typeof LanguageSelector === 'undefined') return;

            const raw = this.getLanguageData() || {};
            const dataWithAll = { all: { language_ru: 'Все языки', language_en: 'All languages' }, ...raw };
            const codes = ['all', ...Object.keys(raw || {}).map(k => String(k).toLowerCase()).filter(Boolean).sort()];

            new LanguageSelector({
                container: wrap,
                mode: 'report-selector',
                languageData: dataWithAll,
                nativeLanguage: 'all',
                learningLanguages: codes,
                currentLearning: String(this.selectedLanguage || 'all').trim().toLowerCase() || 'all',
                onLanguageChange: ({ currentLearning }) => {
                    this.selectedLanguage = String(currentLearning || 'all').trim().toLowerCase() || 'all';
                    this.scheduleUpdate(0);
                }
            });
            this._languageSelectorInited = true;
        } catch (e) {
        }
    }

    formatIsoDate(d) {
        try {
            const dt = (d instanceof Date) ? d : new Date(d);
            if (Number.isNaN(dt.getTime())) return '';
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const day = String(dt.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        } catch (e) {
            return '';
        }
    }

    getWeekdayShort(dateIso) {
        try {
            const s = String(dateIso || '');
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return '';
            const dt = new Date(s);
            const jsDay = dt.getDay();
            const map = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 0: 'вс' };
            return map[jsDay] || '';
        } catch (e) {
            return '';
        }
    }

    getWeekdayBadgeStyle(dateIso) {
        try {
            const s = String(dateIso || '');
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return 'background: rgba(31,41,51,0.08); color: rgba(31,41,51,0.75); font-weight: 400; font-size: 13px; line-height: 1; padding-top: 1px;';
            const dt = new Date(s);
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

    getLanguageData() {
        try {
            if (window.LanguageManager && typeof window.LanguageManager.getLanguageData === 'function') {
                return window.LanguageManager.getLanguageData() || {};
            }
        } catch (e) {
        }
        try {
            return (window.LANGUAGE_DATA && typeof window.LANGUAGE_DATA === 'object') ? window.LANGUAGE_DATA : {};
        } catch (e) {
        }
        return {};
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

    escapeHtml(v) {
        const s = String(v || '');
        return s
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
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
            const menu = document.getElementById('planfactUserPickerMenu');
            if (!menu) return;
            menu.style.display = 'block';
            this._userDropdownOpen = true;
        } catch (e) {
        }
    }

    closeUserDropdown() {
        try {
            const menu = document.getElementById('planfactUserPickerMenu');
            if (!menu) return;
            menu.style.display = 'none';
            this._userDropdownOpen = false;
        } catch (e) {
        }
    }

    updateUserPickerUI() {
        try {
            const labelEl = document.getElementById('planfactUserPickerLabel');
            const avatarEl = document.getElementById('planfactUserPickerAvatar');
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

    async ensureUsersLoaded() {
        try {
            if (!this.history || typeof this.history.listActivityReportUsers !== 'function') return;
            const userSelect = document.getElementById('planfactUserSelect');
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
                const menu = document.getElementById('planfactUserPickerMenu');
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
                            this.scheduleUpdate(0);
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

    validateAndNormalizeCustomRange() {
        const startInput = document.getElementById('planfactStartDate');
        const endInput = document.getElementById('planfactEndDate');
        if (!startInput || !endInput) return;

        const s = String(startInput.value || '');
        const e = String(endInput.value || '');
        if (!s || !e) return;

        const sd = new Date(s);
        const ed = new Date(e);
        if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return;

        if (sd.getTime() > ed.getTime()) {
            endInput.value = s;
        } else if (ed.getTime() < sd.getTime()) {
            startInput.value = e;
        }
    }

    createModal() {
        let modal = document.getElementById('planfact-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        modal = document.createElement('div');
        modal.id = 'planfact-modal';
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
                <div class="statistics-header" style="display:flex; align-items:center; gap: 10px;">
                    <div style="display:flex; align-items:center; gap: 10px; min-width: 0; flex: 1 1 auto;">
                        <h2 style="margin: 0; white-space: nowrap;">План‑Факт</h2>
                    </div>

                    <div style="display:flex; align-items:center; gap: 10px; flex-shrink: 0;">
                        <button class="action-btn" id="refreshPlanFactBtn" title="Обновить" style="display:flex; align-items:center; justify-content:center; padding-left: 10px; padding-right: 10px;">
                            <i data-lucide="rotate-cw"></i>
                        </button>
                        <button class="close-statistics-btn" id="closePlanFactBtn">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>

                <div class="statistics-controls">
                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap: wrap;">
                        <div style="display:flex; align-items:center; gap: 10px;">
                            <div id="planfactUserPicker" style="position: relative; min-width: 220px;">
                                <button id="planfactUserPickerBtn" type="button" class="group-select" style="width: 100%; display:flex; align-items:center; gap: 10px; justify-content: space-between; font-size: 16px; font-weight: 500;">
                                    <span style="display:flex; align-items:center; gap: 10px; min-width: 0;">
                                        <img id="planfactUserPickerAvatar" src="" alt="" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #e9eef5; flex: 0 0 auto;">
                                        <span id="planfactUserPickerLabel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                                    </span>
                                    <i data-lucide="chevron-down" style="width: 18px; height: 18px; flex: 0 0 auto;"></i>
                                </button>
                                <div id="planfactUserPickerMenu" style="display:none; position:absolute; left:0; top: calc(100% + 6px); width: 100%; max-height: 300px; overflow:auto; background: #fff; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); z-index: 5; padding: 6px;"></div>
                            </div>
                            <select id="planfactUserSelect" class="group-select" style="display:none;"></select>
                        </div>

                        <div id="planfactLanguagePicker" style="position: relative; min-width: 210px;"></div>

                        <div class="date-range-controls" style="margin-left: auto;">
                            <input type="date" id="planfactStartDate" class="date-input" style="width: 128px; padding-right: 20px;">
                            <span>—</span>
                            <input type="date" id="planfactEndDate" class="date-input" style="width: 128px; padding-right: 20px;">
                        </div>
                    </div>
                </div>

                <div class="statistics-chart" id="planfactRoot" style="overflow-y:auto;"></div>
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

            const root = modal.querySelector('#planfactRoot');
            if (root) {
                root.style.flex = '1 1 auto';
                root.style.minHeight = '0';
            }
        } catch (e) {
        }

        document.body.appendChild(modal);
        this.modal = modal;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        const closeBtn = document.getElementById('closePlanFactBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        const refreshBtn = document.getElementById('refreshPlanFactBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.updateReport());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hide();
            }
        });

        const endDate = new Date();
        const startDate = new Date();
        startDate.setTime(endDate.getTime());
        try {
            const startInput = document.getElementById('planfactStartDate');
            const endInput = document.getElementById('planfactEndDate');
            if (startInput) startInput.value = this.formatDateForInput(startDate);
            if (endInput) endInput.value = this.formatDateForInput(endDate);
        } catch (e) {
        }

        try {
            const userSelect = document.getElementById('planfactUserSelect');
            if (userSelect) {
                userSelect.addEventListener('change', () => {
                    const raw = userSelect.value;
                    const parsed = parseInt(String(raw || ''), 10);
                    this.selectedUserId = Number.isFinite(parsed) ? parsed : null;
                    try {
                        this.updateUserPickerUI();
                    } catch (e) {
                    }
                    this.scheduleUpdate(0);
                });
            }
        } catch (e) {
        }

        try {
            const btn = document.getElementById('planfactUserPickerBtn');
            const menu = document.getElementById('planfactUserPickerMenu');
            if (btn && menu) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleUserDropdown();
                });

                document.addEventListener('click', (e) => {
                    if (!this._userDropdownOpen) return;
                    const root = document.getElementById('planfactUserPicker');
                    if (root && !root.contains(e.target)) {
                        this.closeUserDropdown();
                    }
                });
            }
        } catch (e) {
        }

        try {
            const startInput = document.getElementById('planfactStartDate');
            const endInput = document.getElementById('planfactEndDate');
            const onDateChange = () => {
                this.validateAndNormalizeCustomRange();
                this.scheduleUpdate(150);
            };
            if (startInput) startInput.addEventListener('change', onDateChange);
            if (endInput) endInput.addEventListener('change', onDateChange);
        } catch (e) {
        }
    }

    async show() {
        if (!this.modal) {
            this.createModal();
        }
        this.modal.style.display = 'flex';
        try {
            this.initLanguageSelector();
        } catch (e) {
        }
        try {
            await this.ensureUsersLoaded();
        } catch (e) {
        }
        await this.updateReport();
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    getPositionsLabel(positions) {
        try {
            if (positions == null) return 'все предложения';
            const arr = Array.isArray(positions) ? positions : [];
            if (!arr.length) return 'все предложения';
            const uniq = [...new Set(arr.map(x => Number(x)).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
            if (!uniq.length) return 'все предложения';
            const ranges = [];
            let start = null;
            let prev = null;
            for (const n of uniq) {
                if (start == null) {
                    start = n;
                    prev = n;
                    continue;
                }
                if (n === prev + 1) {
                    prev = n;
                    continue;
                }
                ranges.push(start === prev ? String(start) : `${start}-${prev}`);
                start = n;
                prev = n;
            }
            if (start != null && prev != null) {
                ranges.push(start === prev ? String(start) : `${start}-${prev}`);
            }
            const compact = ranges.join(',');
            return compact ? `(${compact})` : 'все предложения';
        } catch (e) {
            return '';
        }
    }

    renderReport(days) {
        const root = document.getElementById('planfactRoot');
        if (!root) return;

        let list = Array.isArray(days) ? days : [];
        try {
            // if backend returns ASC for some reason, keep newest on top
            if (list.length >= 2) {
                const a = String(list[0]?.date || '');
                const b = String(list[list.length - 1]?.date || '');
                if (a && b && a < b) list = [...list].reverse();
            }
        } catch (e) {
        }

        try {
            const startInput = document.getElementById('planfactStartDate');
            const endInput = document.getElementById('planfactEndDate');
            const startIso = String(startInput && startInput.value ? startInput.value : '').trim();
            const endIso = String(endInput && endInput.value ? endInput.value : '').trim();
            if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(startIso) && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endIso)) {
                const sd = new Date(startIso);
                const ed = new Date(endIso);
                if (!Number.isNaN(sd.getTime()) && !Number.isNaN(ed.getTime())) {
                    const start = sd.getTime() <= ed.getTime() ? sd : ed;
                    const end = sd.getTime() <= ed.getTime() ? ed : sd;

                    const map = new Map();
                    for (const d of list) {
                        const k = String(d && d.date ? d.date : '').trim();
                        if (k) map.set(k, d);
                    }

                    const out = [];
                    const cur = new Date(end);
                    cur.setHours(0, 0, 0, 0);
                    const startDay = new Date(start);
                    startDay.setHours(0, 0, 0, 0);
                    while (cur.getTime() >= startDay.getTime()) {
                        const k = this.formatIsoDate(cur);
                        out.push(map.get(k) || { date: k, items: [], extra_activity: [] });
                        cur.setDate(cur.getDate() - 1);
                    }
                    list = out;
                }
            }
        } catch (e) {
        }

        if (!list.length) {
            root.innerHTML = '<p class="no-data">Нет данных</p>';
            return;
        }

        const htmlDays = list.map(d => {
            const dateLabel = String(d && d.date ? d.date : '');
            const items = Array.isArray(d && d.items) ? d.items : [];
            const extra = Array.isArray(d && d.extra_activity) ? d.extra_activity : [];

            const rows = items.map(it => {
                const dictTitleRaw = String(it && it.dictation_title ? it.dictation_title : '');
                const titleFallback = it?.dictation_id ? `Диктант ${it.dictation_id}` : 'Диктант';
                const title = this.escapeHtml(dictTitleRaw || titleFallback);
                const did = Number(it && it.dictation_id) || 0;
                const coverUrl = String(it && it.dictation_cover_url ? it.dictation_cover_url : '');
                const level = this.escapeHtml(String(it && it.dictation_level ? it.dictation_level : ''));
                const req = Number(
                    (it && (it.required_completions ?? it.plan_required_completions ?? it.plan_count ?? it.required ?? it.plan))
                ) || 0;
                const done = Number(
                    (it && (it.successes_done ?? it.done ?? it.successes_count ?? it.completions_done ?? it.completions ?? it.fact))
                ) || 0;
                const completed = (req > 0) ? (done >= req) : (done > 0);
                const hasProgress = (done > 0 && !completed);
                const group = this.escapeHtml(String(it && it.group_title ? it.group_title : ''));
                const positionsLabel = this.escapeHtml(this.getPositionsLabel(it && it.selected_sentence_positions));
                const langCode = String(it && (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) ? (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) : '');
                const posArr = Array.isArray(it && it.selected_sentence_positions) ? it.selected_sentence_positions : null;
                const posCsv = Array.isArray(posArr) ? posArr.map(x => Number(x)).filter(n => Number.isFinite(n)).join(',') : '';

                const activity = it && it.activity ? it.activity : null;
                const perfect = Number(activity && activity.perfect != null ? activity.perfect : (it && it.perfect)) || 0;
                const corrected = Number(activity && activity.corrected != null ? activity.corrected : (it && it.corrected)) || 0;
                const audio = Number(activity && activity.audio != null ? activity.audio : (it && it.audio)) || 0;
                const badgeText = completed ? 'выполнено' : (hasProgress ? 'частично' : 'не выполнено');
                const badgeBg = completed
                    ? 'var(--color-button-lightgreen, #bbf1ca)'
                    : (hasProgress ? 'var(--color-button-yellow, rgb(252, 235, 163))' : 'var(--color-button-pink, #f5c0ca)');
                const badgeColor = completed
                    ? 'var(--color-button-text-lightgreen, #366f40)'
                    : (hasProgress ? 'var(--color-button-text-yellow, rgb(255, 198, 9))' : 'var(--color-button-text-pink, #802c35)');

                return `
                    <div data-action="planfact-launch" data-date="${this.escapeHtml(dateLabel)}" data-dictation-id="${this.escapeHtml(String(did || ''))}" data-dictation-lang="${this.escapeHtml(String(langCode || ''))}" data-dictation-title="${this.escapeHtml(String(dictTitleRaw || titleFallback))}" data-dictation-cover-url="${this.escapeHtml(String(coverUrl || ''))}" data-selected-positions="${this.escapeHtml(String(posCsv || ''))}" data-required-completions="${this.escapeHtml(String(req || 0))}" style="display:flex; align-items:flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(31,41,51,0.04); cursor: default;">
                        <img src="${this.escapeHtml(coverUrl || '/static/data/covers/cover_en.webp')}" alt="" style="width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/data/covers/cover_en.webp';">
                        <div style="flex: 1 1 auto; min-width: 0;">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                <div style="font-weight: 700; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${title}${level ? ` · ${level}` : ''}</div>
                                <span style="margin-left: auto; flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 700; font-size: 13px;">${badgeText}</span>
                            </div>
                            <div style="margin-top: 4px; display:flex; gap: 10px; flex-wrap: wrap; color: rgba(31,41,51,0.75); font-size: 13px;">
                                <span>${group}</span>
                                <span>${positionsLabel}</span>
                                <span>план: ${req}</span>
                                <span>факт: ${done}</span>
                            </div>
                        </div>

                        <div style="flex: 0 0 auto; display:flex; align-items:center; gap: 10px; padding-top: 2px;">
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-mint, #aae7e4);">
                                <i data-lucide="star" style="width: 16px; height: 16px;"></i>
                                <span style="font-weight: 800;">${perfect}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-lightgreen, #bbf1ca);">
                                <i data-lucide="star-half" style="width: 16px; height: 16px;"></i>
                                <span style="font-weight: 800;">${corrected}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap: 6px; color: var(--color-panel-text-purple, rgb(152, 154, 224));">
                                <i data-lucide="mic" style="width: 16px; height: 16px;"></i>
                                <span style="font-weight: 800;">${audio}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const extrasHtml = extra.length
                ? `
                    <div style="margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(251, 191, 36, 0.10); border: 1px solid rgba(251, 191, 36, 0.25);">
                        <div style="font-weight: 700; margin-bottom: 6px;">Другая активность (вне плана)</div>
                        ${extra.map(x => {
                            const did = Number(x && x.dictation_id) || 0;
                            const dictTitleRaw = String(x && x.dictation_title ? x.dictation_title : '');
                            const titleFallback = did ? `Диктант ${did}` : 'Диктант';
                            const title = this.escapeHtml(dictTitleRaw || titleFallback);
                            const level = this.escapeHtml(String(x && x.dictation_level ? x.dictation_level : ''));
                            const coverUrl = String(x && x.dictation_cover_url ? x.dictation_cover_url : '');
                            const act = x && x.activity ? x.activity : {};
                            const perfect = Number(act && act.perfect) || 0;
                            const corrected = Number(act && act.corrected) || 0;
                            const audio = Number(act && act.audio) || 0;
                            return `
                                <div style="display:flex; align-items:center; gap: 10px; padding: 6px 0; color: rgba(31,41,51,0.8);">
                                    <img src="${this.escapeHtml(coverUrl || '/static/data/covers/cover_en.webp')}" alt="" style="width: 34px; height: 34px; border-radius: 9px; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/data/covers/cover_en.webp';">
                                    <div style="flex: 1 1 auto; min-width: 0; font-weight: 700; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${title}${level ? ` · ${level}` : ''}</div>
                                    <div style="display:flex; align-items:center; gap: 10px;">
                                        <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-mint, #aae7e4);">
                                            <i data-lucide="star" style="width: 16px; height: 16px;"></i>
                                            <span style="font-weight: 800;">${perfect}</span>
                                        </div>
                                        <div style="display:flex; align-items:center; gap: 6px; color: var(--color-button-lightgreen, #bbf1ca);">
                                            <i data-lucide="star-half" style="width: 16px; height: 16px;"></i>
                                            <span style="font-weight: 800;">${corrected}</span>
                                        </div>
                                        <div style="display:flex; align-items:center; gap: 6px; color: var(--color-panel-text-purple, rgb(152, 154, 224));">
                                            <i data-lucide="mic" style="width: 16px; height: 16px;"></i>
                                            <span style="font-weight: 800;">${audio}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `
                : '';

            const hasAny = Boolean((items && items.length) || (extra && extra.length));
            const rowsHtml = rows || '';
            const itemsBlock = (rowsHtml && String(rowsHtml).trim())
                ? `<div style="display:flex; flex-direction: column; gap: 10px;">${rowsHtml}</div>`
                : '';

            return `
                <div style="margin-bottom: 14px;">
                    <div style="display:flex; align-items:center; gap: 10px; margin: 10px 2px;">
                        <span style="display:inline-flex; align-items:center; justify-content:center; min-width: 34px; height: 22px; padding: 0 8px; border-radius: 999px; ${this.getWeekdayBadgeStyle(dateLabel)}">${this.escapeHtml(this.getWeekdayShort(dateLabel))}</span>
                        <div style="font-weight: 800; font-size: 16px;">${this.escapeHtml(dateLabel)}</div>
                        <div style="flex: 1 1 auto; height: 1px; background: rgba(31,41,51,0.12);"></div>
                    </div>
                    ${hasAny ? `${itemsBlock}${extrasHtml}` : ''}
                </div>
            `;
        }).join('');

        root.innerHTML = `<div class="chart-container" style="display:flex; flex-direction: column;">${htmlDays}</div>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        try {
            const selectedUserId = this.getSelectedUserIdFromUI();
            const currentUserId = this.getCurrentUserId();
            const todayIso = this.formatIsoDate(new Date());

            root.querySelectorAll('[data-action="planfact-launch"]').forEach(el => {
                el.addEventListener('dblclick', (e) => {
                    try {
                        e.preventDefault();
                        e.stopPropagation();
                    } catch (e2) {
                    }

                    try {
                        if (currentUserId == null || selectedUserId == null || Number(selectedUserId) !== Number(currentUserId)) {
                            alert('Нельзя запускать диктант за другого пользователя');
                            return;
                        }

                        const dictationId = Number(el.getAttribute('data-dictation-id') || 0) || 0;
                        if (!dictationId) return;
                        const dateIso = String(el.getAttribute('data-date') || '').trim();
                        const lang = String(el.getAttribute('data-dictation-lang') || '').trim();
                        const title = String(el.getAttribute('data-dictation-title') || '').trim();
                        const coverUrl = String(el.getAttribute('data-dictation-cover-url') || '').trim();
                        const posCsv = String(el.getAttribute('data-selected-positions') || '').trim();
                        const req = Number(el.getAttribute('data-required-completions') || 0) || 0;
                        const positions = posCsv
                            ? posCsv.split(',').map(x => Number(String(x || '').trim())).filter(n => Number.isFinite(n))
                            : [];
                        const isToday = Boolean(dateIso && todayIso && dateIso === todayIso);

                        if (isToday) {
                            try {
                                if (typeof _setAssignmentLaunchContext === 'function') {
                                    _setAssignmentLaunchContext({
                                        assignment_id: null,
                                        dictation_id: dictationId,
                                        source_group_id: null,
                                        source_group_title: null,
                                        selected_sentence_positions: positions.length ? positions : null,
                                        required_completions: req,
                                    });
                                }
                            } catch (e3) {
                            }
                            try {
                                if (typeof _studentPlanOpenDictation === 'function') {
                                    _studentPlanOpenDictation(dictationId, lang);
                                    return;
                                }
                            } catch (e3) {
                            }
                            try {
                                const langNorm = String(lang || 'en').trim().toLowerCase() || 'en';
                                const native = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
                                    ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
                                    : '';
                                const openUrl = `/dictation/dict_${Number(dictationId)}/${langNorm}/${(native || langNorm || 'en')}`;
                                window.location.href = openUrl;
                            } catch (e3) {
                            }
                            return;
                        }

                        if (typeof openStudentPlanLaunchConfirmModal !== 'function') {
                            alert('Запуск недоступен: модальное окно не загружено');
                            return;
                        }

                        openStudentPlanLaunchConfirmModal({
                            assignment_id: null,
                            dictation_id: dictationId,
                            dictation_language_code: lang,
                            dictation_title: title,
                            dictation_cover_url: coverUrl,
                            plan_date: dateIso,
                            source_group_id: null,
                            source_group_title: null,
                            selected_sentence_positions: positions.length ? positions : null,
                            required_completions: req,
                        });
                    } catch (err) {
                        try { console.log('[planfact] launch failed', err); } catch (e2) {}
                    }
                });
            });
        } catch (e) {
        }
    }

    async updateReport() {
        const seq = ++this._updateSeq;
        const root = document.getElementById('planfactRoot');
        if (root) {
            root.innerHTML = '<p class="no-data">Формируем отчет…</p>';
        }

        const token = this.getToken();
        if (!token) {
            if (root) root.innerHTML = '<p class="no-data">Не найден токен</p>';
            return;
        }

        const startInput = document.getElementById('planfactStartDate');
        const endInput = document.getElementById('planfactEndDate');
        if (!startInput || !endInput) return;
        this.validateAndNormalizeCustomRange();

        let userId = this.selectedUserId;
        try {
            const userSelect = document.getElementById('planfactUserSelect');
            if (userSelect && String(userSelect.value || '').trim() !== '') {
                const parsed = parseInt(String(userSelect.value || ''), 10);
                if (Number.isFinite(parsed)) {
                    userId = parsed;
                    this.selectedUserId = parsed;
                }
            }
        } catch (e) {
        }

        const startDate = String(startInput.value || '');
        const endDate = String(endInput.value || '');
        if (!startDate || !endDate) {
            if (root) root.innerHTML = '<p class="no-data">Выберите даты</p>';
            return;
        }

        let days = [];
        try {
            let languageCode = null;
            try {
                languageCode = String(this.selectedLanguage || 'all').trim().toLowerCase() || 'all';
            } catch (e) {
                languageCode = null;
            }
            const res = await fetch('/api/statistics/planfact', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: userId,
                    start_date: startDate,
                    end_date: endDate,
                    ...(languageCode && languageCode !== 'all' ? { language_code: languageCode } : {}),
                })
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success && Array.isArray(js.days))) {
                days = [];
            } else {
                days = js.days;
            }
        } catch (e) {
            days = [];
        }

        if (seq !== this._updateSeq) return;
        this.renderReport(days);
    }

    static async open(activityHistory) {
        const rep = new PlanFactReport(activityHistory);
        await rep.show();
    }
}
