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
        modal.style.overflowY = 'auto';
        // На странице приватной библиотеки много элементов с высоким z-index
        // (карточки, дропдауны, оверлеи). Ставим выше, чтобы модалка была видна.
        modal.style.zIndex = '10150';

        modal.innerHTML = `
            <div class="modal-content statistics-modal-content">
                <div class="statistics-header">
                    <h2>Статистика занятий</h2>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <button id="updateStatisticsBtn" class="button-color-yellow">Сформировать</button>
                        <button class="close-statistics-btn" id="closeStatisticsBtn">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>
                
                <div class="statistics-controls">
                    <div class="group-by-controls">
                        <label>Пользователь:</label>
                        <select id="activityUserSelect" class="group-select"></select>
                    </div>
                    <div class="date-range-controls">
                        <label>Период:</label>
                        <input type="date" id="startDate" class="date-input">
                        <span>—</span>
                        <input type="date" id="endDate" class="date-input">
                    </div>
                    <div class="group-by-controls">
                        <label>Группировка:</label>
                        <select id="groupBySelect" class="group-select">
                            <option value="days">По дням</option>
                            <option value="weeks">По неделям</option>
                            <option value="months">По месяцам</option>
                        </select>
                    </div>
                </div>

                <div class="statistics-chart" id="statisticsChart">
                    <!-- Здесь будет график -->
                </div>

                <div class="statistics-legend">
                    <div class="legend-item">
                        <span class="legend-color perfect-color"></span>
                        <span>Perfect (без ошибок с 1-й попытки)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color corrected-color"></span>
                        <span>Corrected (исправленные)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color audio-color"></span>
                        <span>Audio (аудио контроль)</span>
                    </div>
                </div>
            </div>
        `;

        try {
            const content = modal.querySelector('.modal-content');
            if (content) content.style.zIndex = '10151';
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
                    this.updateStatistics();
                });
            }
        } catch (e) {
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

        // Находим максимальное значение для масштабирования
        const maxValue = Math.max(...stats.map(s => s.perfect + s.corrected + s.audio));

        let html = '<div class="chart-container">';

        stats.forEach(stat => {
            const total = stat.perfect + stat.corrected + stat.audio;
            const perfectPercent = maxValue > 0 ? (stat.perfect / maxValue) * 100 : 0;
            const correctedPercent = maxValue > 0 ? (stat.corrected / maxValue) * 100 : 0;
            const audioPercent = maxValue > 0 ? (stat.audio / maxValue) * 100 : 0;

            html += `
                <div class="chart-row">
                    <div class="chart-date">${this.formatDate(stat.date)}</div>
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

    /**
     * Открыть статистику для текущего пользователя
     */
    static async open(activityHistory) {
        const report = new StatisticsReport(activityHistory);
        await report.show();
    }
}
