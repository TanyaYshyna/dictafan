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
        this._telegramSendBusy = false;
        this._lastStats = null;
        this._lastRange = null;
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
        try {
            const t = localStorage.getItem('jwt_token');
            if (t) return t;
        } catch (e) {
        }
        return null;
    }

    async sendTelegramSelfReportFromActivity() {
        if (this._telegramSendBusy) return;
        const token = this.getToken();
        if (!token) {
            alert('Не найден токен');
            return;
        }

        const userId = Number(this.selectedUserId) || null;
        const userLabel = (() => {
            try {
                const u = (this._activityUsers || []).find(x => Number(x && x.id) === Number(userId));
                const label = String(u && u.label ? u.label : (u && u.username ? u.username : ''));
                if (label) return label;
            } catch (e) {
            }
            return (userId != null) ? `User #${userId}` : '';
        })();

        const stats = Array.isArray(this._lastStats) ? this._lastStats : [];
        const range = this._lastRange || {};
        const title = 'Отчет об активности';
        const startLabel = range.start ? String(range.start) : '';
        const endLabel = range.end ? String(range.end) : '';
        const langLabel = String(this.selectedLanguage || 'all').trim().toLowerCase() === 'all'
            ? 'все языки'
            : String(this.selectedLanguage || '').trim().toLowerCase();

        if (!stats.length) {
            alert('Нет данных для отправки');
            return;
        }

        let sumPerfect = 0;
        let sumCorrected = 0;
        let sumAudio = 0;
        let sumTimeMs = 0;
        for (const s of stats) {
            sumPerfect += Number(s && s.perfect) || 0;
            sumCorrected += Number(s && s.corrected) || 0;
            sumAudio += Number(s && s.audio) || 0;
            sumTimeMs += Number(s && s.time_ms) || 0;
        }
        const timeLabel = sumTimeMs > 0 ? this.formatDurationHhMmSs(sumTimeMs) : '00:00:00';

        const text = [
            `<b>${title}</b>`,
            startLabel && endLabel ? `${startLabel} — ${endLabel}` : '',
            userLabel ? `Пользователь: ${userLabel}` : '',
            `Язык: ${langLabel}`,
            '',
            `⭐ Perfect: ${sumPerfect}`,
            `⭐½ Corrected: ${sumCorrected}`,
            `🎤 Audio: ${sumAudio}`,
            `⏱ Время: ${timeLabel}`,
        ].filter(Boolean).join('\n');

        const btn = document.getElementById('sendActivityTelegramBtn');
        this._telegramSendBusy = true;
        try {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            }
        } catch (e) {}

        try {
            const res = await fetch('/api/statistics/telegram/send_self', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success)) {
                const err = js && js.error ? String(js.error) : 'send_failed';
                if (err === 'telegram_not_linked') {
                    alert('Telegram не подключен (нужно привязать чат)');
                } else {
                    alert('Не удалось отправить отчет');
                }
                return;
            }
            alert('Отчет отправлен');
        } catch (e) {
            alert('Не удалось отправить отчет');
        } finally {
            this._telegramSendBusy = false;
            try {
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '';
                    btn.style.cursor = '';
                }
            } catch (e) {}
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

    formatIsoLocal(d) {
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

    formatDurationHMS(ms) {
        let v = 0;
        try {
            v = Number(ms || 0);
        } catch (e) {
            v = 0;
        }
        if (!Number.isFinite(v) || v <= 0) return '00:00:00';
        const totalSec = Math.max(0, Math.floor(v / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
                        <button id="sendActivityTelegramBtn" class="action-btn" title="Отправить в Telegram" style="display:flex; align-items:center; justify-content:center; padding-left: 10px; padding-right: 10px;">
                            <i data-lucide="send" style="width: 18px; height: 18px;"></i>
                        </button>
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
            const sendBtn = document.getElementById('sendActivityTelegramBtn');
            if (sendBtn) {
                sendBtn.addEventListener('click', () => {
                    this.sendTelegramSelfReportFromActivity();
                });
            }
        } catch (e) {
        }

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

        try {
            this._lastStats = Array.isArray(stats) ? stats : [];
            this._lastRange = {
                start: (startDateInput && startDateInput.value) ? String(startDateInput.value) : null,
                end: (endDateInput && endDateInput.value) ? String(endDateInput.value) : null,
            };
        } catch (e) {
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
        this.topLimit = 10;

        // Параметры для сравнения: порядок приоритета (индексы 0,1,2)
        // и какие включены (чекбоксы)
        this.priorityOrder = ['money', 'time', 'symbols'];
        this.checkedParams = { money: true, time: false, symbols: false };
        this._currentPriorityRow = 0;
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

    // ====== Управление приоритетами ======

    _getParamLabel(key) {
        const labels = { time: 'Время', money: 'Деньги', symbols: 'Символы' };
        return labels[key] || key;
    }

    _getParamIcon(key) {
        const icons = { time: 'clock', money: 'coins', symbols: 'keyboard' };
        return icons[key] || 'circle';
    }

    _movePriorityRow(direction) {
        const idx = this._currentPriorityRow;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= this.priorityOrder.length) return;

        const arr = this.priorityOrder;
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        this._currentPriorityRow = newIdx;

        this._renderPriorityHeader();
        this.updateRating();
    }

    _toggleParam(paramKey) {
        const checkedCount = Object.values(this.checkedParams).filter(Boolean).length;
        if (this.checkedParams[paramKey] && checkedCount <= 1) {
            return; // нельзя выключить последний
        }
        this.checkedParams[paramKey] = !this.checkedParams[paramKey];
        this._renderPriorityHeader();
        this.updateRating();
    }

    // ====== Рендер шапки с приоритетами ======

    _renderPriorityHeader() {
        const container = document.getElementById('ratingPriorityHeader');
        if (!container) return;

        const order = this.priorityOrder;
        const currentIdx = this._currentPriorityRow;

        let rowsHtml = order.map((key, idx) => {
            const checked = this.checkedParams[key] ? 'checked' : '';
            const isActive = idx === currentIdx;
            const activeClass = isActive ? 'rating-priority-row--active' : '';
            const icon = this._getParamIcon(key);
            const label = this._getParamLabel(key);
            return `
                <div class="rating-priority-row ${activeClass}" data-index="${idx}">
                    <input type="checkbox" ${checked} data-param="${key}" class="rating-priority-checkbox">
                    <i data-lucide="${icon}" style="width: 16px; height: 16px; flex-shrink: 0;"></i>
                    <span class="rating-priority-label">${label}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="rating-priority-header-inner">
                <div class="rating-priority-rows">
                    ${rowsHtml}
                </div>
                <div class="rating-priority-arrows">
                    <button class="rating-priority-arrow" id="priorityArrowUp" title="Переместить вверх">
                        <i data-lucide="chevron-up" style="width: 18px; height: 18px;"></i>
                    </button>
                    <button class="rating-priority-arrow" id="priorityArrowDown" title="Переместить вниз">
                        <i data-lucide="chevron-down" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>
            </div>
        `;

        const checkboxes = container.querySelectorAll('.rating-priority-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const param = e.target.dataset.param;
                this._toggleParam(param);
            });
        });

        const rows = container.querySelectorAll('.rating-priority-row');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const idx = parseInt(row.dataset.index, 10);
                if (!isNaN(idx)) {
                    this._currentPriorityRow = idx;
                    this._renderPriorityHeader();
                }
            });
        });

        const arrowUp = document.getElementById('priorityArrowUp');
        const arrowDown = document.getElementById('priorityArrowDown');
        if (arrowUp) arrowUp.addEventListener('click', () => this._movePriorityRow(-1));
        if (arrowDown) arrowDown.addEventListener('click', () => this._movePriorityRow(1));

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ====== Сортировка рейтинга ======

    _sortRating(rating) {
        const order = this.priorityOrder;
        const checked = this.checkedParams;

        const activeParams = order.filter(key => checked[key]);

        if (activeParams.length === 0) {
            return [...rating].sort((a, b) => {
                const aVal = Number(a.money_dt_count || 0);
                const bVal = Number(b.money_dt_count || 0);
                if (bVal !== aVal) return bVal - aVal;
                return (Number(a.user_id) || 0) - (Number(b.user_id) || 0);
            });
        }

        return [...rating].sort((a, b) => {
            for (const key of activeParams) {
                let aVal, bVal;
                switch (key) {
                    case 'time':
                        aVal = Number(a.lead_time || 0);
                        bVal = Number(b.lead_time || 0);
                        break;
                    case 'money':
                        aVal = Number(a.money_dt_count || 0);
                        bVal = Number(b.money_dt_count || 0);
                        break;
                    case 'symbols':
                        aVal = Number(a.monenumber_of_characters || 0);
                        bVal = Number(b.monenumber_of_characters || 0);
                        break;
                    default:
                        aVal = 0;
                        bVal = 0;
                }
                if (bVal !== aVal) return bVal - aVal;
            }
            return (Number(a.user_id) || 0) - (Number(b.user_id) || 0);
        });
    }

    // ====== Форматирование ======

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

    formatMoney(value) {
        const v = Number(value || 0);
        return v.toLocaleString('ru-RU');
    }

    formatSymbols(value) {
        const v = Number(value || 0);
        return v.toLocaleString('ru-RU');
    }

    // ====== Создание модального окна ======

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

                        <div style="display:flex; align-items:center; gap: 8px;">
                            <span style="opacity: 0.8; font-size: 13px;">выводить первых</span>
                            <input id="ratingTopLimit" type="number" min="1" max="50" step="1" value="10" class="date-input" style="width: 70px; padding-right: 12px;">
                        </div>

                        <div id="ratingTotalParticipants" style="opacity: 0.85; font-size: 13px;"></div>

                        <div class="date-range-controls" style="display:flex; align-items:center; gap: 8px; flex-wrap: nowrap;">
                            <input type="date" id="ratingStartDate" class="date-input" style="width: 112px; padding-right: 18px;">
                            <span>—</span>
                            <input type="date" id="ratingEndDate" class="date-input" style="width: 112px; padding-right: 18px;">
                        </div>
                    </div>

                    <!-- Блок приоритетов: чекбоксы и стрелки -->
                    <div id="ratingPriorityHeader" class="rating-priority-header" style="margin-top: 8px;"></div>
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

        // Рендерим шапку с приоритетами
        this._renderPriorityHeader();

        try {
            const topLimitInput = document.getElementById('ratingTopLimit');
            if (topLimitInput) {
                topLimitInput.value = String(this.topLimit);
                topLimitInput.addEventListener('change', () => {
                    const v = parseInt(String(topLimitInput.value || ''), 10);
                    if (!isNaN(v)) {
                        this.topLimit = Math.min(50, Math.max(1, v));
                        topLimitInput.value = String(this.topLimit);
                        this.updateRating();
                    }
                });
                topLimitInput.addEventListener('blur', () => {
                    const v = parseInt(String(topLimitInput.value || ''), 10);
                    if (isNaN(v) || v < 1) {
                        this.topLimit = 10;
                        topLimitInput.value = String(this.topLimit);
                        this.updateRating();
                        return;
                    }
                    this.topLimit = Math.min(50, Math.max(1, v));
                    topLimitInput.value = String(this.topLimit);
                });
            }
        } catch (e) {
        }
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
        let totalUsers = null;
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
                totalUsers = js.total_users != null ? Number(js.total_users) : null;
            }
        } catch (e) {
            rating = [];
        }

        // Фильтр: оставляем тех, у кого есть хоть какие-то данные по новым полям
        try {
            rating = (Array.isArray(rating) ? rating : []).filter(r => {
                const lt = Number(r?.lead_time || 0);
                const mn = Number(r?.money_dt_count || 0);
                const ch = Number(r?.monenumber_of_characters || 0);
                return (lt + mn + ch) > 0;
            });
        } catch (e) {
        }

        // Сортировка по выбранным параметрам в порядке приоритета
        try {
            rating = this._sortRating(rating);
        } catch (e) {
        }

        if (!root) return;

        try {
            const totalEl = document.getElementById('ratingTotalParticipants');
            if (totalEl) {
                if (totalUsers != null && !Number.isNaN(totalUsers)) {
                    totalEl.textContent = `в рейтинге всего участвовало ${totalUsers}`;
                } else {
                    totalEl.textContent = '';
                }
            }
        } catch (e) {
        }

        if (!rating.length) {
            root.innerHTML = '<p class="no-data">Нет данных</p>';
            return;
        }

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
        if (currentUserId != null && Number.isNaN(currentUserId)) currentUserId = null;

        const limit = Math.min(50, Math.max(1, Number(this.topLimit) || 10));
        const top = rating.slice(0, limit);
        const selfIndex = currentUserId != null
            ? rating.findIndex(r => Number(r && r.user_id) === currentUserId)
            : -1;
        const selfRow = selfIndex >= 0 ? rating[selfIndex] : null;
        const isSelfInTop = selfIndex >= 0 && selfIndex < limit;

        const listToRender = isSelfInTop
            ? top
            : (
                selfRow
                    ? [...top, { __ellipsis: true }, { ...selfRow, __forcedRank: selfIndex + 1, __isSelf: true }]
                    : top
            );

        // Определяем порядок отображения колонок на основе checkedParams и priorityOrder
        const paramKeys = this.priorityOrder.filter(k => this.checkedParams[k]);

        const rows = listToRender.map((r, idx) => {
            if (r && r.__ellipsis) {
                return `
                    <div class="chart-row" style="align-items:center; gap: 12px; padding: 10px 12px; opacity: 0.7;">
                        <div style="min-width: 30px; text-align:right; font-weight: 600; color: rgba(31,41,51,0.75);">…</div>
                        <div style="flex: 1 1 auto; font-size: 14px;">…</div>
                    </div>
                `;
            }

            const uid = Number(r && r.user_id);
            const name = String(r && r.username ? r.username : '');
            const leadTime = Number(r && r.lead_time) || 0;
            const money = Number(r && r.money_dt_count) || 0;
            const symbols = Number(r && r.monenumber_of_characters) || 0;
            const avatar = this.avatarUrlForUser(uid);

            const forcedRank = r && r.__forcedRank ? Number(r.__forcedRank) : null;
            const rank = (forcedRank != null && !Number.isNaN(forcedRank)) ? forcedRank : (idx + 1);
            const isSelf = (currentUserId != null && uid === currentUserId) || Boolean(r && r.__isSelf);
            const rowStyle = isSelf
                ? 'border: 2px solid var(--color-button-text-yellow, rgb(255, 198, 9)); border-radius: 12px; padding: 10px 12px;'
                : 'padding: 10px 12px;';
            const nameStyle = isSelf ? 'font-weight: 800;' : 'font-weight: 600;';

            // Строим колонки параметров
            const paramCols = paramKeys.map(k => {
                let icon, value, color;
                if (k === 'time') {
                    icon = 'clock';
                    value = this.formatDurationHhMmSs(leadTime);
                    color = 'var(--color-button-mint, #aae7e4)';
                } else if (k === 'money') {
                    icon = 'coins';
                    value = this.formatMoney(money);
                    color = 'var(--color-button-text-yellow, rgb(255, 198, 9))';
                } else if (k === 'symbols') {
                    icon = 'keyboard';
                    value = this.formatSymbols(symbols);
                    color = 'var(--color-panel-text-purple, rgb(152, 154, 224))';
                }
                return `
                    <div style="display:flex; align-items:center; gap: 6px; color: ${color};">
                        <i data-lucide="${icon}" style="width: 18px; height: 18px;"></i>
                        <span style="font-size: 16px; font-weight: 700; white-space: nowrap;">${value}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="chart-row" style="align-items:center; gap: 12px; ${rowStyle}">
                    <div style="min-width: 30px; text-align:right; font-weight: 600; color: rgba(31,41,51,0.75);">${rank}</div>
                    <img src="${avatar}" alt="" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/icons/default-avatar-small.svg';">
                    <div style="flex: 1 1 auto; min-width: 0; display:flex; align-items:center; gap: 12px;">
                        <div style="font-size: 15px; ${nameStyle} overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(name)}</div>
                        <div style="margin-left: auto; display:flex; align-items:center; gap: 12px; flex: 0 0 auto;">
                            ${paramCols}
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
        this.selectedLanguage = 'all';
        this.selectedYear = new Date().getFullYear();
        this._activityUsers = [];
        this._userDropdownOpen = false;
        this._languageSelectorInited = false;
        this._yearSelectorInited = false;
        this._updateTimer = null;
        this._updateSeq = 0;
        this._telegramSendBusy = false;
        this._lastDays = null;
        this._lastRange = null;
        this._planfactTelegramText = null;
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
        try {
            const t = localStorage.getItem('jwt_token');
            if (t) return t;
        } catch (e) {
        }
        return null;
    }

    async sendTelegramSelfReportFromPlanFact() {
        if (this._telegramSendBusy) return;
        const token = this.getToken();
        if (!token) {
            alert('Не найден токен');
            return;
        }

        const selectedUserId = this.getSelectedUserIdFromUI();
        const userLabel = (() => {
            try {
                const u = (this._activityUsers || []).find(x => Number(x && x.id) === Number(selectedUserId));
                const label = String(u && u.label ? u.label : (u && u.username ? u.username : ''));
                if (label) return label;
            } catch (e) {
            }
            return (selectedUserId != null) ? `User #${selectedUserId}` : '';
        })();

        const days = Array.isArray(this._lastDays) ? this._lastDays : [];
        if (!days.length) {
            alert('Нет данных для отправки');
            return;
        }

        const telegramText = String(this._planfactTelegramText || '').trim();
        if (!telegramText) {
            alert('Нет данных для отправки');
            return;
        }

        const text = telegramText;

        const btn = document.getElementById('sendPlanFactTelegramBtn');
        this._telegramSendBusy = true;
        try {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            }
        } catch (e) {}

        try {
            const res = await fetch('/api/statistics/telegram/send_self', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success)) {
                const err = js && js.error ? String(js.error) : 'send_failed';
                if (err === 'telegram_not_linked') {
                    alert('Telegram не подключен (нужно привязать чат)');
                } else {
                    alert('Не удалось отправить отчет');
                }
                return;
            }
            alert('Отчет отправлен');
        } catch (e) {
            alert('Не удалось отправить отчет');
        } finally {
            this._telegramSendBusy = false;
            try {
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '';
                    btn.style.cursor = '';
                }
            } catch (e) {}
        }
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

    getTokenSafe() {
        try {
            if (window.UM && window.UM.token) return window.UM.token;
        } catch (e) {
        }
        try {
            const t = localStorage.getItem('token');
            if (t) return t;
        } catch (e) {
        }
        try {
            const t = localStorage.getItem('jwt_token');
            if (t) return t;
        } catch (e) {
        }
        return null;
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
                        <button class="action-btn" id="sendPlanFactTelegramBtn" title="Отправить в Telegram" style="display:flex; align-items:center; justify-content:center; padding-left: 10px; padding-right: 10px;">
                            <i data-lucide="send"></i>
                        </button>
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

        try {
            const sendBtn = document.getElementById('sendPlanFactTelegramBtn');
            if (sendBtn) {
                sendBtn.addEventListener('click', () => {
                    this.sendTelegramSelfReportFromPlanFact();
                });
            }
        } catch (e) {
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

        try {
            this._lastDays = Array.isArray(days) ? days : [];
            const startInput = document.getElementById('planfactStartDate');
            const endInput = document.getElementById('planfactEndDate');
            this._lastRange = {
                start: (startInput && startInput.value) ? String(startInput.value) : null,
                end: (endInput && endInput.value) ? String(endInput.value) : null,
            };
        } catch (e) {
        }

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

        const selectedUserId = this.getSelectedUserIdFromUI();
        const selectedUserLabel = (() => {
            try {
                const u = (this._activityUsers || []).find(x => Number(x && x.id) === Number(selectedUserId));
                const label = String(u && u.label ? u.label : (u && u.username ? u.username : ''));
                if (label) return label;
            } catch (e) {
            }
            return (selectedUserId != null) ? `User #${selectedUserId}` : '';
        })();

        const teacherLabel = (() => {
            try {
                if (window.UM && typeof window.UM.getCurrentUser === 'function') {
                    const u = window.UM.getCurrentUser();
                    const nm = String(u && (u.username || u.name || u.full_name) ? (u.username || u.name || u.full_name) : '').trim();
                    if (nm) return nm;
                }
            } catch (e) {
            }
            try {
                const nm = String(window.UM && window.UM.userData && (window.UM.userData.username || window.UM.userData.name) ? (window.UM.userData.username || window.UM.userData.name) : '').trim();
                if (nm) return nm;
            } catch (e) {
            }
            return '';
        })();

        const range = this._lastRange || {};
        const startLabel = range.start ? String(range.start) : '';
        const endLabel = range.end ? String(range.end) : '';

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

                const totalSentences = Number(it && (it.dictation_sentences_count ?? it.sentences_count ?? it.sentences_total)) || 0;
                const selCount = Array.isArray(posArr) ? posArr.length : 0;
                const sentencesLabel = (selCount > 0 && totalSentences > 0) ? `(${selCount}/${totalSentences})` : '';

                const activity = it && it.activity ? it.activity : null;
                const perfect = Number(activity && activity.perfect != null ? activity.perfect : (it && it.perfect)) || 0;
                const corrected = Number(activity && activity.corrected != null ? activity.corrected : (it && it.corrected)) || 0;
                const audio = Number(activity && activity.audio != null ? activity.audio : (it && it.audio)) || 0;
                const badgeText = completed ? 'выполнено' : (hasProgress ? 'частично' : 'не выполнено');
                const badgeBg = completed
                    ? 'var(--color-button-lightgreen, #bbf1ca)'
                    : (hasProgress ? 'var(--color-button-yellow, rgb(252, 235, 163))' : 'var(--color-button-gray, #eeede8)');
                const badgeColor = completed
                    ? 'var(--color-button-text-lightgreen, #366f40)'
                    : (hasProgress ? 'var(--color-button-text-yellow, rgb(255, 198, 9))' : 'var(--color-button-text-gray, rgb(162, 161, 153))');

                const ratio = (req > 0) ? Math.max(0, Math.min(1, done / req)) : 0;
                const ratioPct = Math.round(ratio * 100);
                const barBg = 'var(--color-cesh-text, rgb(162, 161, 153))';
                const barDone = 'var(--color-button-yellow, rgb(252, 235, 163))';

                return `
                    <div data-action="planfact-launch" data-date="${this.escapeHtml(dateLabel)}" data-dictation-id="${this.escapeHtml(String(did || ''))}" data-dictation-lang="${this.escapeHtml(String(langCode || ''))}" data-dictation-title="${this.escapeHtml(String(dictTitleRaw || titleFallback))}" data-dictation-cover-url="${this.escapeHtml(String(coverUrl || ''))}" data-selected-positions="${this.escapeHtml(String(posCsv || ''))}" data-required-completions="${this.escapeHtml(String(req || 0))}" style="display:flex; align-items:flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(31,41,51,0.04); cursor: default;">
                        <img src="${this.escapeHtml(coverUrl || '/static/data/covers/cover_en.webp')}" alt="" style="width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/data/covers/cover_en.webp';">
                        <div style="flex: 1 1 auto; min-width: 0;">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                <div style="font-weight: 700; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${title}${langCode ? ` · ${this.escapeHtml(String(langCode).trim().toLowerCase())}` : ''}${level ? ` ${level}` : ''}${sentencesLabel ? ` ${sentencesLabel}` : ''}</div>
                                <span style="margin-left: auto; flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 700; font-size: 13px;">${badgeText}</span>
                            </div>
                            <div style="margin-top: 4px; display:flex; gap: 10px; flex-wrap: wrap; color: rgba(31,41,51,0.75); font-size: 13px;">
                                <span>${group}</span>
                                <span>${positionsLabel}</span>
                            </div>
                        </div>

                        <div style="flex: 0 0 auto; display:flex; flex-direction: column; align-items: flex-end; gap: 6px; padding-top: 2px;">
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
                            <div style="display:flex; align-items:center; gap: 8px; color: rgba(31,41,51,0.75); font-size: 13px;">
                                <span style="display:inline-block; width: 176px; height: 10px; border-radius: 999px; background: ${barBg}; overflow: hidden;">
                                    <span style="display:block; height: 100%; width: ${ratioPct}%; background: ${barDone};"></span>
                                </span>
                                <span style="font-weight: 700;">${done}/${req}</span>
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
                            const langCode = String(x && (x.dictation_language_code || x.dictation_language_code_norm || x.dictation_language) ? (x.dictation_language_code || x.dictation_language_code_norm || x.dictation_language) : '');
                            const coverUrl = String(x && x.dictation_cover_url ? x.dictation_cover_url : '');
                            const act = x && x.activity ? x.activity : {};
                            const perfect = Number(act && act.perfect) || 0;
                            const corrected = Number(act && act.corrected) || 0;
                            const audio = Number(act && act.audio) || 0;
                            return `
                                <div style="display:flex; align-items:center; gap: 10px; padding: 6px 0; color: rgba(31,41,51,0.8);">
                                    <img src="${this.escapeHtml(coverUrl || '/static/data/covers/cover_en.webp')}" alt="" style="width: 34px; height: 34px; border-radius: 9px; object-fit: cover; background:#e9eef5; flex: 0 0 auto;" onerror="this.onerror=null; this.src='/static/data/covers/cover_en.webp';">
                                    <div style="flex: 1 1 auto; min-width: 0; font-weight: 700; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${title}${langCode ? ` · ${this.escapeHtml(String(langCode).trim().toLowerCase())}` : ''}${level ? ` ${level}` : ''}</div>
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
            let planTotal = 0;
            let factTotal = 0;
            let perfectTotal = 0;
            let correctedTotal = 0;
            let audioTotal = 0;
            let sentencesSelectedTotal = 0;
            let sentencesAllTotal = 0;

            const lines = [];
            lines.push('<b>Отчет План‑Факт</b>');
            if (selectedUserLabel) lines.push(selectedUserLabel);
            if (startLabel && endLabel) lines.push(`${startLabel} — ${endLabel}`);
            lines.push('');

            // Итоги считаем по плановым строкам
            for (const d of list) {
                const items = Array.isArray(d && d.items) ? d.items : [];
                for (const it of items) {
                    const req = Number(it && (it.required_completions ?? it.plan_required_completions ?? it.plan_count ?? it.required ?? it.plan)) || 0;
                    const done = Number(it && (it.successes_done ?? it.done ?? it.successes_count ?? it.completions_done ?? it.completions ?? it.fact)) || 0;
                    planTotal += req;
                    factTotal += done;

                    try {
                        const posArr = Array.isArray(it && it.selected_sentence_positions) ? it.selected_sentence_positions : null;
                        const totalSentences = Number(it && (it.dictation_sentences_count ?? it.sentences_count ?? it.sentences_total)) || 0;
                        const selCount = Array.isArray(posArr) ? posArr.length : 0;
                        if (selCount > 0) sentencesSelectedTotal += selCount;
                        if (totalSentences > 0) sentencesAllTotal += totalSentences;
                    } catch (e) {
                    }

                    const act = it && it.activity ? it.activity : null;
                    perfectTotal += Number(act && act.perfect != null ? act.perfect : (it && it.perfect)) || 0;
                    correctedTotal += Number(act && act.corrected != null ? act.corrected : (it && it.corrected)) || 0;
                    audioTotal += Number(act && act.audio != null ? act.audio : (it && it.audio)) || 0;
                }
            }

            lines.push(`Итоги: ${perfectTotal} - ${correctedTotal} - ${audioTotal}`);
            if (sentencesSelectedTotal > 0 && sentencesAllTotal > 0) {
                lines.push(`(sentences/all) ${sentencesSelectedTotal}/${sentencesAllTotal}`);
            }
            lines.push(`fakt/plan ${factTotal}/${planTotal}`);
            lines.push('(sentenses/all)  fakt/plan  ⭐ Perfect -  ⭐½ Corrected - 🎤 Audio');
            lines.push('');

            for (const d of list) {
                const dateIso = String(d && d.date ? d.date : '').trim();
                const items = Array.isArray(d && d.items) ? d.items : [];
                const extra = Array.isArray(d && d.extra_activity) ? d.extra_activity : [];
                if (!dateIso || (!items.length && !extra.length)) continue;

                const dow = this.getWeekdayShort(dateIso);
                lines.push(`${dow ? dow + ' ' : ''}${dateIso} -------------------`);

                for (const it of items) {
                    const dictTitleRaw = String(it && it.dictation_title ? it.dictation_title : '');
                    const titleFallback = it?.dictation_id ? `Диктант ${it.dictation_id}` : 'Диктант';
                    const title = (dictTitleRaw || titleFallback).trim();
                    const level = String(it && it.dictation_level ? it.dictation_level : '').trim();
                    const langCode = String(it && (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) ? (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) : '').trim().toLowerCase();
                    const posArr = Array.isArray(it && it.selected_sentence_positions) ? it.selected_sentence_positions : null;
                    const posLabel = this.getPositionsLabel(it && it.selected_sentence_positions);
                    const totalSentences = Number(it && (it.dictation_sentences_count ?? it.sentences_count ?? it.sentences_total)) || 0;
                    const selCount = Array.isArray(posArr) ? posArr.length : 0;
                    const sentencesLabel = (selCount > 0 && totalSentences > 0) ? `(${selCount}/${totalSentences})` : '';

                    const req = Number(it && (it.required_completions ?? it.plan_required_completions ?? it.plan_count ?? it.required ?? it.plan)) || 0;
                    const done = Number(it && (it.successes_done ?? it.done ?? it.successes_count ?? it.completions_done ?? it.completions ?? it.fact)) || 0;
                    const act = it && it.activity ? it.activity : null;
                    const perfect = Number(act && act.perfect != null ? act.perfect : (it && it.perfect)) || 0;
                    const corrected = Number(act && act.corrected != null ? act.corrected : (it && it.corrected)) || 0;
                    const audio = Number(act && act.audio != null ? act.audio : (it && it.audio)) || 0;

                    const nameParts = [posLabel, title, langCode, level].filter(Boolean).join(' ');
                    const left = `${nameParts} ${sentencesLabel}`.trim();
                    lines.push(`${left}    ${done}/${req}   ${perfect} - ${corrected} - ${audio}`.trim());
                }

                if (items.length && extra.length) {
                    lines.push('---');
                }

                for (const it of extra) {
                    const dictTitleRaw = String(it && it.dictation_title ? it.dictation_title : '');
                    const titleFallback = it?.dictation_id ? `Диктант ${it.dictation_id}` : 'Диктант';
                    const title = (dictTitleRaw || titleFallback).trim();
                    const level = String(it && it.dictation_level ? it.dictation_level : '').trim();
                    const langCode = String(it && (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) ? (it.dictation_language_code || it.dictation_language_code_norm || it.dictation_language) : '').trim().toLowerCase();
                    const act = it && it.activity ? it.activity : null;
                    const perfect = Number(act && act.perfect != null ? act.perfect : (it && it.perfect)) || 0;
                    const corrected = Number(act && act.corrected != null ? act.corrected : (it && it.corrected)) || 0;
                    const audio = Number(act && act.audio != null ? act.audio : (it && it.audio)) || 0;

                    const nameParts = [title, langCode, level].filter(Boolean).join(' ');
                    lines.push(`${nameParts}   ${perfect} - ${corrected} - ${audio}`.trim());
                }

                if (!extra.length) {
                    lines.push('---');
                }
                lines.push('');
            }

            this._planfactTelegramText = lines.join('\n').trim();
        } catch (e) {
            this._planfactTelegramText = null;
        }

        try {
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

class ActivityTrackerReport {
    constructor(activityHistory, options = {}) {
        this.history = activityHistory;
        this.modal = null;
        this.selectedUserId = options.userId || null;
        this.selectedLanguage = options.language || 'all';
        this.selectedYear = Number(options.year) || (new Date()).getFullYear();
        this._users = [];
        this._languageSelectorInited = false;
        this._dataDaysByIso = {};
        this._bounds = { minYear: null, maxYear: null };
        this._updateSeq = 0;
        this._selectedIso = '';
    }

    getTokenSafe() {
        try {
            if (window.UM && window.UM.token) return window.UM.token;
        } catch (e) {
        }
        try {
            const t = localStorage.getItem('token');
            if (t) return t;
        } catch (e) {
        }
        try {
            const t = localStorage.getItem('jwt_token');
            if (t) return t;
        } catch (e) {
        }
        return null;
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

    formatIsoLocal(d) {
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

    formatDurationHMS(ms) {
        let v = 0;
        try {
            v = Number(ms || 0);
        } catch (e) {
            v = 0;
        }
        if (!Number.isFinite(v) || v <= 0) return '00:00:00';
        const totalSec = Math.max(0, Math.floor(v / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    createModal() {
        const modal = document.getElementById('activity-tracker-modal');
        if (!modal) {
            throw new Error('activity-tracker-modal not found (reports_modal.html not included)');
        }
        this.modal = modal;

        try {
            const closeBtn = document.getElementById('closeActivityTrackerBtn');
            if (closeBtn && !closeBtn.__activityTrackerBound) {
                closeBtn.__activityTrackerBound = true;
                closeBtn.addEventListener('click', () => this.hide());
            }
        } catch (e) {
        }

        try {
            const updateBtn = document.getElementById('updateActivityTrackerBtn');
            if (updateBtn && !updateBtn.__activityTrackerBound) {
                updateBtn.__activityTrackerBound = true;
                updateBtn.addEventListener('click', async () => {
                    await this.reloadData({ force: true });
                });
            }
        } catch (e) {
        }

        // NOTE: we intentionally do NOT close on overlay click for this modal.

        try {
            const prevBtn = document.getElementById('activityTrackerYearPrev');
            const nextBtn = document.getElementById('activityTrackerYearNext');
            if (prevBtn && !prevBtn.__activityTrackerBound) {
                prevBtn.__activityTrackerBound = true;
                prevBtn.addEventListener('click', () => {
                    const nextYear = Number(this.selectedYear) - 1;
                    if (this._bounds.minYear != null && nextYear < this._bounds.minYear) return;
                    this.selectedYear = nextYear;
                    this.reloadData({ force: false });
                });
            }
            if (nextBtn && !nextBtn.__activityTrackerBound) {
                nextBtn.__activityTrackerBound = true;
                nextBtn.addEventListener('click', () => {
                    const nextYear = Number(this.selectedYear) + 1;
                    if (this._bounds.maxYear != null && nextYear > this._bounds.maxYear) return;
                    this.selectedYear = nextYear;
                    this.reloadData({ force: false });
                });
            }
        } catch (e) {
        }

        try {
            const userSel = document.getElementById('activityTrackerUserSelect');
            if (userSel && !userSel.__activityTrackerBound) {
                userSel.__activityTrackerBound = true;
                userSel.addEventListener('change', () => {
                    try {
                        const v = String(userSel.value || '').trim();
                        this.selectedUserId = v ? (Number(v) || null) : null;
                    } catch (e2) {
                    }
                    this.reloadData({ force: true });
                });
            }
        } catch (e) {
        }

        try {
            const root = document.getElementById('activityTrackerGrid');
            if (root && !root.__activityTrackerClickBound) {
                root.__activityTrackerClickBound = true;
                root.addEventListener('click', (e) => {
                    try {
                        const cell = e && e.target ? e.target.closest('.reports-tracker-cell[data-iso]') : null;
                        if (!cell) return;
                        const iso = String(cell.getAttribute('data-iso') || '').trim();
                        if (!iso) return;
                        this.setSelectedIso(iso);
                    } catch (e2) {
                    }
                });
            }
        } catch (e) {
        }
    }

    setSelectedIso(iso) {
        this._selectedIso = String(iso || '').trim();
        try {
            const root = document.getElementById('activityTrackerGrid');
            if (!root) return;
            const prev = root.querySelector('.reports-tracker-cell--active');
            if (prev) prev.classList.remove('reports-tracker-cell--active');
            const next = root.querySelector(`.reports-tracker-cell[data-iso="${CSS.escape(this._selectedIso)}"]`);
            if (next) next.classList.add('reports-tracker-cell--active');
        } catch (e) {
        }
        this.renderSelectedDetails();
    }

    renderSelectedDetails() {
        const box = document.getElementById('activityTrackerDetails');
        if (!box) return;

        const iso = String(this._selectedIso || '').trim();
        if (!iso) {
            box.innerHTML = '';
            return;
        }

        const row = (this._dataDaysByIso && this._dataDaysByIso[iso]) ? this._dataDaysByIso[iso] : null;
        const ms = row && row.ms != null ? Number(row.ms) || 0 : 0;
        const money = row && row.money_dt != null ? Number(row.money_dt) || 0 : 0;
        const mistakes = row && row.mistakes != null ? Number(row.mistakes) || 0 : 0;
        const chars = row && row.chars != null ? Number(row.chars) || 0 : 0;

        box.innerHTML = `
            <div class="reports-tracker-details-line">${this.escapeHtml(iso)}</div>
            <div class="reports-tracker-details-line">${this.escapeHtml(this.formatDurationHMS(ms))}</div>
            <div class="reports-tracker-details-line"><span class="lucide-icon-inline" data-lucide="dollar-sign"></span> ${this.escapeHtml(String(money))}</div>
            <div class="reports-tracker-details-line"><span class="lucide-icon-inline" data-lucide="bug"></span> ${this.escapeHtml(String(mistakes))} / ${this.escapeHtml(String(chars))}</div>
        `;
        try {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: box });
            }
        } catch (e) {
        }
    }

    async reloadData({ force }) {
        const seq = ++this._updateSeq;
        try {
            await this.loadYearData({ force });
        } catch (e) {
        }
        if (seq !== this._updateSeq) return;
        this.renderYear();
        this.updateYearButtons();
    }

    updateYearButtons() {
        try {
            const prevBtn = document.getElementById('activityTrackerYearPrev');
            const nextBtn = document.getElementById('activityTrackerYearNext');
            const y = Number(this.selectedYear) || (new Date()).getFullYear();
            if (prevBtn) {
                prevBtn.disabled = (this._bounds.minYear != null) ? (y <= this._bounds.minYear) : false;
            }
            if (nextBtn) {
                nextBtn.disabled = (this._bounds.maxYear != null) ? (y >= this._bounds.maxYear) : false;
            }
        } catch (e) {
        }
    }

    async loadYearData({ force }) {
        const t = this.getTokenSafe();
        if (!t) {
            this._dataDaysByIso = {};
            this._bounds = { minYear: null, maxYear: null };
            return;
        }

        const y = Number(this.selectedYear) || (new Date()).getFullYear();
        const cacheKey = `${String(this.selectedUserId || '')}::${String(this.selectedLanguage || 'all')}::${String(y)}`;
        if (!force && this._lastCacheKey === cacheKey && this._dataDaysByIso) {
            return;
        }

        const body = {
            user_id: this.selectedUserId,
            year: y,
            language_code: String(this.selectedLanguage || 'all'),
        };

        const res = await fetch('/api/statistics/activity/tracker', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${t}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
        });

        const js = await res.json().catch(() => null);
        if (!(res && res.ok && js && js.success)) {
            this._dataDaysByIso = {};
            this._bounds = { minYear: null, maxYear: null };
            return;
        }

        const minY = (js.min_year == null) ? null : Number(js.min_year);
        const maxY = (js.max_year == null) ? null : Number(js.max_year);
        this._bounds = {
            minYear: Number.isFinite(minY) ? minY : null,
            maxYear: Number.isFinite(maxY) ? maxY : null,
        };

        try {
            const srvYear = Number(js.year);
            if (Number.isFinite(srvYear)) this.selectedYear = srvYear;
        } catch (e) {
        }

        const map = {};
        const days = Array.isArray(js.days) ? js.days : [];
        for (const d of days) {
            try {
                const iso = String(d.date || '').slice(0, 10);
                if (!iso) continue;
                map[iso] = {
                    ms: Number(d.lead_time || 0) || 0,
                    money_dt: Number(d.money_dt || 0) || 0,
                    mistakes: Number(d.mistakes || 0) || 0,
                    chars: Number(d.chars || 0) || 0,
                };
            } catch (e) {
            }
        }
        this._dataDaysByIso = map;
        this._lastCacheKey = cacheKey;
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    async ensureUsersLoaded() {
        try {
            if (Array.isArray(this._users) && this._users.length) return;
            if (!this.history || typeof this.history.listActivityReportUsers !== 'function') {
                this._users = [];
                return;
            }
            this._users = await this.history.listActivityReportUsers();
        } catch (e) {
            this._users = [];
        }
    }

    populateUsers() {
        const sel = document.getElementById('activityTrackerUserSelect');
        if (!sel) return;
        const users = Array.isArray(this._users) ? this._users : [];
        const options = [];
        for (const u of users) {
            try {
                const id = Number(u && u.id);
                if (!Number.isFinite(id)) continue;
                const label = String(u && (u.label || u.username || u.name) ? (u.label || u.username || u.name) : `User #${id}`);
                options.push({ id, label });
            } catch (e) {
            }
        }
        sel.innerHTML = options.map(o => `<option value="${String(o.id)}">${this.escapeHtml(o.label)}</option>`).join('');
        try {
            if (this.selectedUserId == null && options.length) this.selectedUserId = options[0].id;
            if (this.selectedUserId != null) sel.value = String(this.selectedUserId);
        } catch (e) {
        }
    }

    initLanguageSelector() {
        try {
            const wrap = document.getElementById('activityTrackerLanguagePicker');
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
                    this.reloadData({ force: true });
                }
            });
            this._languageSelectorInited = true;
        } catch (e) {
        }
    }

    renderYear() {
        const year = Number(this.selectedYear) || (new Date()).getFullYear();
        const yearLabel = document.getElementById('activityTrackerYearLabel');
        if (yearLabel) yearLabel.textContent = String(year);

        const root = document.getElementById('activityTrackerGrid');
        if (!root) return;

        const weeks = this.buildYearWeeks(year);
        const monthMarkers = this.buildMonthMarkers(year, weeks);

        const monthParts = [];
        monthParts.push(`<div class="reports-tracker-months" style="grid-template-columns: 40px repeat(${weeks.length}, 12px);">`);
        monthParts.push('<div></div>');
        let lastM = '';
        for (let w = 0; w < weeks.length; w++) {
            const m = monthMarkers[w];
            if (m && m !== lastM) {
                monthParts.push(`<div class="reports-tracker-month">${this.escapeHtml(m)}</div>`);
                lastM = m;
            } else {
                monthParts.push('<div></div>');
            }
        }
        monthParts.push('</div>');

        const weekdays = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
        const dayParts = [];
        dayParts.push(`<div class="reports-tracker-days" style="grid-template-columns: 40px repeat(${weeks.length}, 12px);">`);
        for (let d = 0; d < 7; d++) {
            dayParts.push(`<div class="reports-tracker-weekday">${this.escapeHtml(weekdays[d])}</div>`);
            for (let w = 0; w < weeks.length; w++) {
                const day = weeks[w][d];
                if (!day) {
                    dayParts.push('<div></div>');
                    continue;
                }
                const isInYear = day.getFullYear() === year;
                const iso = this.formatIsoLocal(day);
                if (!isInYear) {
                    dayParts.push(`<div class="reports-tracker-cell reports-tracker-cell--out" title="${this.escapeHtml(iso)}"></div>`);
                    continue;
                }

                const row = (this._dataDaysByIso && this._dataDaysByIso[iso]) ? this._dataDaysByIso[iso] : null;
                const ms = row && row.ms != null ? Number(row.ms) || 0 : 0;
                const money = row && row.money_dt != null ? Number(row.money_dt) || 0 : 0;
                const mistakes = row && row.mistakes != null ? Number(row.mistakes) || 0 : 0;
                const chars = row && row.chars != null ? Number(row.chars) || 0 : 0;
                const minutes = ms / 60000;
                let cls = 'reports-tracker-cell';
                if (minutes > 0 && minutes < 15) {
                    cls += ' reports-tracker-cell--white';
                } else if (minutes >= 15) {
                    const capped = Math.min(180, minutes);
                    const idx = Math.min(12, Math.floor((capped - 15) / 15) + 1);
                    cls += ` reports-tracker-cell--l${idx}`;
                }
                const title = `${iso} ${this.formatDurationHMS(ms)} $${money} 🐛${mistakes}/${chars}`;
                const active = (this._selectedIso && this._selectedIso === iso) ? ' reports-tracker-cell--active' : '';
                dayParts.push(`<div class="${cls}${active}" data-iso="${this.escapeHtml(iso)}" title="${this.escapeHtml(title)}"></div>`);
            }
        }
        dayParts.push('</div>');

        root.innerHTML = `${monthParts.join('')}${dayParts.join('')}`;
        this.renderSelectedDetails();
    }

    buildYearWeeks(year) {
        const jan1 = new Date(year, 0, 1);
        const day = jan1.getDay();
        const mondayIndex = (day + 6) % 7;
        const start = new Date(jan1);
        start.setDate(jan1.getDate() - mondayIndex);

        const weeks = [];
        const cursor = new Date(start);
        for (let w = 0; w < 54; w++) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                week.push(new Date(cursor));
                cursor.setDate(cursor.getDate() + 1);
            }
            weeks.push(week);
        }

        let lastIdx = weeks.length - 1;
        while (lastIdx >= 0) {
            const wk = weeks[lastIdx];
            const anyInYear = wk.some(dt => dt && dt.getFullYear && dt.getFullYear() === year);
            if (anyInYear) break;
            lastIdx--;
        }
        return weeks.slice(0, lastIdx + 1);
    }

    buildMonthMarkers(year, weeks) {
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const markers = new Array(weeks.length).fill('');
        for (let m = 0; m < 12; m++) {
            const first = new Date(year, m, 1);
            let idx = -1;
            for (let w = 0; w < weeks.length; w++) {
                const wk = weeks[w];
                if (!wk) continue;
                const has = wk.some(dt => dt && dt.getFullYear() === year && dt.getMonth() === m);
                if (has) {
                    idx = w;
                    break;
                }
            }
            if (idx >= 0) markers[idx] = labels[m];
        }
        return markers;
    }

    escapeHtml(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    async show() {
        if (!this.modal) {
            this.createModal();
        }

        // Show modal immediately (avoid "appears later" effect).
        this.modal.style.display = 'flex';
        // Render an empty year grid immediately, then load data in background.
        try {
            this.renderYear();
            this.updateYearButtons();
        } catch (e) {
        }

        // Initialize selector UI immediately (so user sees language control right away).
        try {
            this.initLanguageSelector();
        } catch (e) {
        }

        try {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: this.modal });
            }
        } catch (e) {
        }


        // Background load: users list and year data.
        (async () => {
            try {
                await this.ensureUsersLoaded();
                this.populateUsers();
            } catch (e) {
            }

            try {
                await this.reloadData({ force: true });
            } catch (e) {
            }
        })();
    }

    static async open(activityHistory) {
        const rep = new ActivityTrackerReport(activityHistory);
        await rep.show();
    }
}


/**
 * Отчёт по диктантам — иерархическая таблица: язык → книга → раздел → диктант → упражнение.
 * Слева блок диктантов, справа — колонки повторений (1, 2, 3…).
 * В каждой ячейке: время, деньги, ошибки/символы (настраиваемые чекбоксы).
 */
class DictationReport {
    constructor() {
        this._modalId = 'dictation-report-modal';
        this._token = null;
        this._users = [];
        this._selectedUserId = null;
        this._languagesData = null;
        this._startDate = null;
        this._endDate = null;
        this._showTime = true;
        this._showMoney = true;
        this._showErrors = true;
        this._loading = false;
    }

    /* ---------- helpers ---------- */

    getToken() {
        if (this._token) return this._token;
        try {
            // Пробуем через UserManager
            if (typeof window !== 'undefined' && window.UM && window.UM.token) {
                this._token = window.UM.token;
                return this._token;
            }
            // Пробуем из localStorage (ключ jwt_token)
            const raw = localStorage.getItem('jwt_token');
            if (raw) {
                this._token = raw;
                return this._token;
            }
        } catch (e) { /* ignore */ }
        return this._token;
    }

    escapeHtml(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#039;');
    }

    formatDateForInput(dt) {
        if (!dt) return '';
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    formatDurationHhMmSs(ms) {
        if (!ms || ms <= 0) return '—';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}ч ${m}м`;
        if (m > 0) return `${m}м ${s}с`;
        return `${s}с`;
    }

    formatMoney(val) {
        if (val == null || val === 0) return '—';
        return String(val);
    }

    formatSymbols(val) {
        if (val == null || val === 0) return '—';
        return String(val);
    }

    avatarUrlForUser(userId) {
        return `/user/api/avatar?user_id=${userId}&size=small`;
    }

    /* ---------- user picker ---------- */

    async ensureUsersLoaded() {
        if (this._users.length > 0) return;
        const token = this.getToken();
        if (!token) return;
        try {
            console.log('[DictationReport] Загружаю пользователей...');
            const res = await fetch('/api/statistics/report-users', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('[DictationReport] Статус ответа:', res.status, res.statusText);
            const text = await res.text();
            console.log('[DictationReport] Сырой ответ:', text.substring(0, 500));
            const js = JSON.parse(text);
            if (js && js.success && Array.isArray(js.users)) {
                this._users = js.users;
                console.log('[DictationReport] Загружено пользователей:', this._users.length, JSON.stringify(this._users));
                if (this._users.length === 0) {
                    console.warn('[DictationReport] API вернул пустой список пользователей');
                }
            } else {
                console.warn('[DictationReport] Ошибка загрузки пользователей:', js?.error || 'неизвестная ошибка', 'full:', JSON.stringify(js));
            }
        } catch (e) {
            console.warn('[DictationReport] Failed to load users for dictation report', e);
        }
    }

    _getFlatUsers() {
        const flat = [];
        for (const u of this._users) {
            if (u.type === 'group' && Array.isArray(u.children)) {
                for (const c of u.children) {
                    flat.push(c);
                }
            } else {
                flat.push(u);
            }
        }
        return flat;
    }

    _findUserById(id) {
        const flat = this._getFlatUsers();
        return flat.find(u => String(u.id) === String(id)) || null;
    }

    _renderUserPicker(container) {
        console.log('[DictationReport] _renderUserPicker() вызван, container:', container?.id || container?.className || 'unknown');
        console.log('[DictationReport] _users в _renderUserPicker:', JSON.stringify(this._users));
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'dictation-report-user-picker';

        const trigger = document.createElement('button');
        trigger.className = 'user-picker-trigger';
        trigger.type = 'button';

        const avatarImg = document.createElement('img');
        avatarImg.className = 'avatar';
        avatarImg.alt = '';
        const chevron = document.createElement('i');
        chevron.setAttribute('data-lucide', 'chevron-down');
        chevron.className = 'chevron';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';

        trigger.appendChild(avatarImg);
        trigger.appendChild(labelSpan);
        trigger.appendChild(chevron);

        const menu = document.createElement('div');
        menu.className = 'user-picker-menu';

        const updateTrigger = (user) => {
            console.log('[DictationReport] updateTrigger() вызван с user:', user?.id, user?.label);
            if (!user) {
                const self = this._users.find(u => u.type === 'self');
                if (self) {
                    this._selectedUserId = self.id;
                    updateTrigger(self);
                    return;
                }
                console.warn('[DictationReport] Нет self user в _users!');
                return;
            }
            avatarImg.src = this.avatarUrlForUser(user.id);
            avatarImg.onerror = () => { avatarImg.src = '/static/icons/default-avatar-small.svg'; };
            labelSpan.textContent = user.label || `User #${user.id}`;
            this._selectedUserId = user.id;
        };

        const buildMenu = () => {
            console.log('[DictationReport] buildMenu() вызван, _users.length:', this._users.length);
            menu.innerHTML = '';
            for (const u of this._users) {
                if (u.type === 'group' && Array.isArray(u.children)) {
                    const groupLabel = document.createElement('div');
                    groupLabel.className = 'menu-group-label';
                    const icon = document.createElement('i');
                    icon.setAttribute('data-lucide', 'users');
                    groupLabel.appendChild(icon);
                    groupLabel.appendChild(document.createTextNode(u.label));
                    menu.appendChild(groupLabel);

                    for (const c of u.children) {
                        const item = document.createElement('button');
                        item.className = 'menu-item menu-item--child';
                        item.type = 'button';
                        if (String(c.id) === String(this._selectedUserId)) {
                            item.classList.add('selected');
                        }
                        const cAvatar = document.createElement('img');
                        cAvatar.className = 'avatar';
                        cAvatar.src = this.avatarUrlForUser(c.id);
                        cAvatar.onerror = () => { cAvatar.src = '/static/icons/default-avatar-small.svg'; };
                        cAvatar.alt = '';
                        item.appendChild(cAvatar);
                        item.appendChild(document.createTextNode(c.label || `User #${c.id}`));
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            updateTrigger(c);
                            menu.classList.remove('open');
                            chevron.classList.remove('open');
                            buildMenu();
                            this._onUserChange();
                        });
                        menu.appendChild(item);
                    }
                } else {
                    const item = document.createElement('button');
                    item.className = 'menu-item';
                    item.type = 'button';
                    if (String(u.id) === String(this._selectedUserId)) {
                        item.classList.add('selected');
                    }
                    const uAvatar = document.createElement('img');
                    uAvatar.className = 'avatar';
                    uAvatar.src = this.avatarUrlForUser(u.id);
                    uAvatar.onerror = () => { uAvatar.src = '/static/icons/default-avatar-small.svg'; };
                    uAvatar.alt = '';
                    item.appendChild(uAvatar);
                    item.appendChild(document.createTextNode(u.label || `User #${u.id}`));
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        updateTrigger(u);
                        menu.classList.remove('open');
                        chevron.classList.remove('open');
                        buildMenu();
                        this._onUserChange();
                    });
                    menu.appendChild(item);
                }
            }
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: menu });
            }
            console.log('[DictationReport] buildMenu() завершён, menu.children.length:', menu.children.length);
        };

        trigger.addEventListener('click', () => {
            console.log('[DictationReport] trigger click!');
            const isOpen = menu.classList.contains('open');
            menu.classList.toggle('open');
            chevron.classList.toggle('open');
            if (!isOpen) buildMenu();
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                menu.classList.remove('open');
                chevron.classList.remove('open');
            }
        });

        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        container.appendChild(wrapper);

        // Init trigger with self user
        const self = this._users.find(u => u.type === 'self');
        if (self) {
            updateTrigger(self);
        } else {
            console.warn('[DictationReport] self не найден в _users, триггер не инициализирован');
        }
        console.log('[DictationReport] _renderUserPicker() завершён');
    }

    /* ---------- modal ---------- */

    createModal() {
        const existing = document.getElementById(this._modalId);
        if (existing) return;

        const modal = document.createElement('div');
        modal.id = this._modalId;
        modal.className = 'modal dictation-report-modal';
        modal.style.cssText = `
            position: fixed; left: 0; top: 0; width: 100%; height: 100%;
            align-items: flex-start; justify-content: center;
            background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
            overflow: hidden; z-index: 10150; padding-top: 20px;
        `;

        const content = document.createElement('div');
        content.className = 'modal-content statistics-modal-content';
        content.style.cssText = `
            max-width: 95vw; width: 1400px; margin: 0 auto;
            display: flex; flex-direction: column; max-height: calc(100vh - 40px);
        `;

        // Header
        const header = document.createElement('div');
        header.className = 'dictation-report-header';

        const leftPanel = document.createElement('div');
        leftPanel.className = 'dictation-report-header-left';

        // Title
        const title = document.createElement('h2');
        title.className = 'reports-modal-title';
        title.textContent = 'Отчет по диктантам';

        // User picker
        const userPickerContainer = document.createElement('div');
        userPickerContainer.id = 'dictation-report-user-picker';

        // Date range
        const dateRange = document.createElement('div');
        dateRange.className = 'dictation-report-date-range';

        const dateFromLabel = document.createElement('label');
        dateFromLabel.textContent = 'с';
        const dateFromInput = document.createElement('input');
        dateFromInput.type = 'date';
        dateFromInput.id = 'dictation-report-date-from';
        const now = new Date();
        dateFromInput.value = this.formatDateForInput(now);

        const dateToLabel = document.createElement('label');
        dateToLabel.textContent = 'по';
        const dateToInput = document.createElement('input');
        dateToInput.type = 'date';
        dateToInput.id = 'dictation-report-date-to';
        dateToInput.value = this.formatDateForInput(now);

        dateRange.appendChild(dateFromLabel);
        dateRange.appendChild(dateFromInput);
        dateRange.appendChild(dateToLabel);
        dateRange.appendChild(dateToInput);

        leftPanel.appendChild(title);
        leftPanel.appendChild(userPickerContainer);
        leftPanel.appendChild(dateRange);

        // Right panel
        const rightPanel = document.createElement('div');
        rightPanel.className = 'dictation-report-header-right';

        // Refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'dictation-report-refresh-btn';
        refreshBtn.title = 'Обновить';
        refreshBtn.type = 'button';
        const refreshIcon = document.createElement('i');
        refreshIcon.setAttribute('data-lucide', 'rotate-cw');
        refreshBtn.appendChild(refreshIcon);
        refreshBtn.addEventListener('click', () => this._onRefresh());

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'statistics-close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.hide());

        rightPanel.appendChild(refreshBtn);
        rightPanel.appendChild(closeBtn);

        header.appendChild(leftPanel);
        header.appendChild(rightPanel);

        // Column options (checkboxes)
        const colOptions = document.createElement('div');
        colOptions.className = 'dictation-report-column-options';

        const timeOpt = this._makeColOption('time', 'clock', 'Время', this._showTime);
        const moneyOpt = this._makeColOption('money', 'dollar-sign', 'Деньги', this._showMoney);
        const errorsOpt = this._makeColOption('errors', 'bug', 'Ошибки/Символы', this._showErrors);

        timeOpt.querySelector('input').addEventListener('change', (e) => {
            this._showTime = e.target.checked;
            this._renderTable();
        });
        moneyOpt.querySelector('input').addEventListener('change', (e) => {
            this._showMoney = e.target.checked;
            this._renderTable();
        });
        errorsOpt.querySelector('input').addEventListener('change', (e) => {
            this._showErrors = e.target.checked;
            this._renderTable();
        });

        colOptions.appendChild(timeOpt);
        colOptions.appendChild(moneyOpt);
        colOptions.appendChild(errorsOpt);

        // Body (table wrapper)
        const body = document.createElement('div');
        body.className = 'statistics-content reports-modal-body';
        const tableWrapper = document.createElement('div');
        tableWrapper.id = 'dictation-report-table-wrapper';
        tableWrapper.className = 'dictation-report-table-wrapper';
        body.appendChild(tableWrapper);

        content.appendChild(header);
        content.appendChild(colOptions);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);
// Init lucide icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: refreshBtn });
}


        // Date change handlers
        dateFromInput.addEventListener('change', () => this._onDateChange());
        dateToInput.addEventListener('change', () => this._onDateChange());

        // Store refs
        this._modal = modal;
        this._tableWrapper = tableWrapper;
        this._dateFromInput = dateFromInput;
        this._dateToInput = dateToInput;
        this._userPickerContainer = userPickerContainer;
    }

    _makeColOption(id, iconName, label, checked) {
        const labelEl = document.createElement('label');
        labelEl.className = 'col-option';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', iconName);
        labelEl.appendChild(cb);
        labelEl.appendChild(icon);
        labelEl.appendChild(document.createTextNode(label));
        return labelEl;
    }

    /* ---------- show / hide ---------- */

    async show() {
        console.log('[DictationReport] show() вызван');
        this.createModal();
        console.log('[DictationReport] createModal() выполнен, _modal:', !!this._modal);
        this._modal.style.display = 'flex';
        console.log('[DictationReport] modal показан');

        // Load users and render picker
        console.log('[DictationReport] вызываю ensureUsersLoaded()...');
        await this.ensureUsersLoaded();
        console.log('[DictationReport] ensureUsersLoaded() завершён, _users.length:', this._users.length, '_users:', JSON.stringify(this._users));
        console.log('[DictationReport] вызываю _renderUserPicker()...');
        this._renderUserPicker(this._userPickerContainer);
        console.log('[DictationReport] _renderUserPicker() выполнен');
// Init lucide icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}


        // Load data
        console.log('[DictationReport] вызываю _loadData()...');
        await this._loadData();
        console.log('[DictationReport] _loadData() выполнен');
    }

    hide() {
        if (this._modal) {
            this._modal.style.display = 'none';
        }
    }

    /* ---------- data loading ---------- */

    _onUserChange() {
        this._loadData();
    }

    _onDateChange() {
        this._loadData();
    }

    _onRefresh() {
        this._loadData();
    }

    async _loadData() {
        if (this._loading) return;
        this._loading = true;

        const wrapper = this._tableWrapper;
        wrapper.innerHTML = `
            <div class="dictation-report-loading">
                <i data-lucide="loader-2"></i>
                <span>Загрузка...</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: wrapper });
        }

        const token = this.getToken();
        if (!token) {
            wrapper.innerHTML = '<div class="dictation-report-empty"><p>Ошибка авторизации</p></div>';
            this._loading = false;
            return;
        }

        const userId = this._selectedUserId;
        const startDate = this._dateFromInput ? this._dateFromInput.value : '';
        const endDate = this._dateToInput ? this._dateToInput.value : '';

        if (!startDate || !endDate) {
            wrapper.innerHTML = '<div class="dictation-report-empty"><p>Выберите даты</p></div>';
            this._loading = false;
            return;
        }

        try {
            const res = await fetch('/api/statistics/dictation-report/data', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: userId,
                    start_date: startDate,
                    end_date: endDate
                })
            });
            const js = await res.json().catch(() => null);
            if (js && js.success) {
                this._data = js.languages || [];
                this._renderTable();
            } else {
                let errMsg = js?.error || 'Ошибка загрузки';
                if (js?.traceback) {
                    errMsg += '<br><br><pre style="font-size:11px;text-align:left;background:#fdd;padding:8px;border-radius:4px;max-height:300px;overflow:auto;">' + this.escapeHtml(js.traceback) + '</pre>';
                }
                wrapper.innerHTML = `<div class="dictation-report-empty"><p>${errMsg}</p></div>`;
                console.error('[DictationReport] Ошибка сервера:', js);
            }
        } catch (e) {
            wrapper.innerHTML = '<div class="dictation-report-empty"><p>Ошибка сети</p></div>';
            console.warn('DictationReport load error', e);
        } finally {
            this._loading = false;
        }
    }

    /* ---------- table rendering ---------- */

    _renderTable() {
        const wrapper = this._tableWrapper;
        if (!this._data || this._data.length === 0) {
            wrapper.innerHTML = `
                <div class="dictation-report-empty">
                    <i data-lucide="file-text"></i>
                    <p>Нет данных за выбранный период</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: wrapper });
            }
            return;
        }

        // Определяем максимальное количество повторений (упражнений) среди всех диктантов
        let maxRepeats = 0;
        for (const lang of this._data) {
            for (const book of (lang.books || [])) {
                for (const d of (book.dictations || [])) {
                    if ((d.exercises || []).length > maxRepeats) {
                        maxRepeats = d.exercises.length;
                    }
                }
                for (const sec of (book.sections || [])) {
                    for (const d of (sec.dictations || [])) {
                        if ((d.exercises || []).length > maxRepeats) {
                            maxRepeats = d.exercises.length;
                        }
                    }
                }
            }
        }
        if (maxRepeats < 1) maxRepeats = 1;

        const table = document.createElement('table');
        table.className = 'dictation-report-table';

        // THEAD
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // First column: Dictation block
        const thDict = document.createElement('th');
        thDict.className = 'dictation-report-th-sticky';
        thDict.textContent = 'Диктант';
        thDict.style.textAlign = 'left';
        headerRow.appendChild(thDict);

        // Value columns header (time, money, errors)
        const valueCols = [];
        if (this._showTime) valueCols.push('time');
        if (this._showMoney) valueCols.push('money');
        if (this._showErrors) valueCols.push('errors');

        for (const vc of valueCols) {
            const th = document.createElement('th');
            th.textContent = vc === 'time' ? 'Время' : vc === 'money' ? 'Деньги' : 'Ош/Сим';
            headerRow.appendChild(th);
        }

        // Repeat count headers
        for (let i = 1; i <= maxRepeats; i++) {
            const th = document.createElement('th');
            th.className = 'repeat-header';
            th.textContent = String(i);
            headerRow.appendChild(th);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // TBODY
        const tbody = document.createElement('tbody');

        for (const lang of this._data) {
            // Language row
            const langRow = document.createElement('tr');
            langRow.className = 'level-language';
            const langTd = document.createElement('td');
            langTd.className = 'dictation-report-td-sticky';
            langTd.textContent = `🌐 ${(lang.language || '').toUpperCase()}`;
            langTd.style.textAlign = 'left';
            langRow.appendChild(langTd);

            // Empty cells for language row
            for (let i = 0; i < valueCols.length + maxRepeats; i++) {
                const td = document.createElement('td');
                td.textContent = '';
                langRow.appendChild(td);
            }
            tbody.appendChild(langRow);

            for (const book of (lang.books || [])) {
                // Book row
                const bookRow = document.createElement('tr');
                bookRow.className = 'level-book';
                const bookTd = document.createElement('td');
                bookTd.className = 'dictation-report-td-sticky';
                bookTd.style.textAlign = 'left';

                const bookCover = document.createElement('img');
                bookCover.className = 'book-cover-thumb';
                bookCover.src = book.cover_url || '';
                bookCover.alt = '';
                bookCover.onerror = function () { this.style.display = 'none'; };
                bookTd.appendChild(bookCover);
                bookTd.appendChild(document.createTextNode(book.title || 'Без названия'));
                bookRow.appendChild(bookTd);

                for (let i = 0; i < valueCols.length + maxRepeats; i++) {
                    const td = document.createElement('td');
                    td.textContent = '';
                    bookRow.appendChild(td);
                }
                tbody.appendChild(bookRow);

                // Dictations directly in book
                for (const d of (book.dictations || [])) {
                    this._appendDictationRow(tbody, d, valueCols, maxRepeats, 'dictation');
                }

                // Sections
                for (const sec of (book.sections || [])) {
                    // Section row
                    const secRow = document.createElement('tr');
                    secRow.className = 'level-section';
                    const secTd = document.createElement('td');
                    secTd.className = 'dictation-report-td-sticky';
                    secTd.style.textAlign = 'left';
                    secTd.textContent = `📂 ${sec.title || 'Без названия'}`;
                    secRow.appendChild(secTd);

                    for (let i = 0; i < valueCols.length + maxRepeats; i++) {
                        const td = document.createElement('td');
                        td.textContent = '';
                        secRow.appendChild(td);
                    }
                    tbody.appendChild(secRow);

                    for (const d of (sec.dictations || [])) {
                        this._appendDictationRow(tbody, d, valueCols, maxRepeats, 'dictation');
                    }
                }
            }
        }

        table.appendChild(tbody);
        wrapper.innerHTML = '';
        wrapper.appendChild(table);
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    _appendDictationRow(tbody, d, valueCols, maxRepeats, level) {
        const exercises = d.exercises || [];

        if (exercises.length === 0) {
            // Dictation without exercises - single row
            const row = document.createElement('tr');
            row.className = 'level-dictation';
            const td = document.createElement('td');
            td.className = 'dictation-report-td-sticky';
            td.style.textAlign = 'left';

            const cover = document.createElement('img');
            cover.className = 'dict-cover-thumb';
            cover.src = d.cover_url || '';
            cover.alt = '';
            cover.onerror = function () { this.style.display = 'none'; };
            td.appendChild(cover);
            td.appendChild(document.createTextNode(d.title || 'Без названия'));
            row.appendChild(td);

            // Value cells (aggregated from all exercises or empty)
            let totalTime = 0, totalMoney = 0, totalMistakes = 0, totalSymbols = 0;
            // No exercises, so no data
            for (const vc of valueCols) {
                const cell = document.createElement('td');
                cell.className = 'value-cell';
                cell.textContent = '—';
                row.appendChild(cell);
            }

            // Repeat cells (empty)
            for (let i = 0; i < maxRepeats; i++) {
                const cell = document.createElement('td');
                cell.className = 'value-cell';
                cell.textContent = '—';
                row.appendChild(cell);
            }
            tbody.appendChild(row);
            return;
        }

        for (let ei = 0; ei < exercises.length; ei++) {
            const ex = exercises[ei];
            const row = document.createElement('tr');

            if (ei === 0) {
                // First exercise - show dictation name with cover
                row.className = 'level-dictation';
                const td = document.createElement('td');
                td.className = 'dictation-report-td-sticky';
                td.style.textAlign = 'left';

                const cover = document.createElement('img');
                cover.className = 'dict-cover-thumb';
                cover.src = d.cover_url || '';
                cover.alt = '';
                cover.onerror = function () { this.style.display = 'none'; };
                td.appendChild(cover);
                td.appendChild(document.createTextNode(d.title || 'Без названия'));
                row.appendChild(td);
            } else {
                // Subsequent exercises - show exercise name indented
                row.className = 'level-exercise';
                const td = document.createElement('td');
                td.className = 'dictation-report-td-sticky';
                td.style.textAlign = 'left';
                td.textContent = `↳ ${ex.title || 'Упражнение'}`;
                row.appendChild(td);
            }

            // Value cells for this exercise
            for (const vc of valueCols) {
                const cell = document.createElement('td');
                cell.className = 'value-cell';
                if (vc === 'time') {
                    cell.textContent = this.formatDurationHhMmSs(ex.lead_time);
                } else if (vc === 'money') {
                    cell.textContent = this.formatMoney(ex.money);
                } else if (vc === 'errors') {
                    const errStr = ex.mistakes > 0 ? `✗${ex.mistakes}` : '';
                    const symStr = ex.symbols > 0 ? `⟐${ex.symbols}` : '';
                    cell.textContent = [errStr, symStr].filter(Boolean).join(' ') || '—';
                }
                row.appendChild(cell);
            }

            // Repeat cells: each exercise goes into its corresponding repeat column
            for (let ri = 0; ri < maxRepeats; ri++) {
                const cell = document.createElement('td');
                cell.className = 'value-cell';
                if (ri === ei) {
                    // This exercise's data goes into this repeat column
                    const parts = [];
                    if (this._showTime) {
                        parts.push(this.formatDurationHhMmSs(ex.lead_time));
                    }
                    if (this._showMoney) {
                        parts.push(this.formatMoney(ex.money));
                    }
                    if (this._showErrors) {
                        const errStr = ex.mistakes > 0 ? `✗${ex.mistakes}` : '';
                        const symStr = ex.symbols > 0 ? `⟐${ex.symbols}` : '';
                        parts.push([errStr, symStr].filter(Boolean).join(' ') || '—');
                    }
                    cell.textContent = parts.filter(Boolean).join(' | ') || '—';
                } else {
                    cell.textContent = '—';
                }
                row.appendChild(cell);
            }

            tbody.appendChild(row);
        }
    }
}
