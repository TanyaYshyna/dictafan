/**
 * Класс для отображения отчета о выполненных диктантах
 * Показывает статистику по statistics_sentenses
 */
class DictationsReport {
    constructor(dictationIdFilter = null) {
        this.modal = null;
        this.allHistoryData = null;
        this.allDictations = [];
        this.languageManager = window.LanguageManager;
        this.dictationIdFilter = dictationIdFilter; // Фильтр по конкретному диктанту
    }

    /**
     * Создать модальное окно для отчета
     */
    createModal() {
        // Проверяем, существует ли уже модальное окно
        let modal = document.getElementById('dictations-report-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        // Создаем модальное окно
        modal = document.createElement('div');
        modal.id = 'dictations-report-modal';
        modal.className = 'modal';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="modal-content statistics-modal-content" style="max-width: 900px;">
                <div class="statistics-header">
                    <h2>Отчет о выполненных диктантах</h2>
                    <button class="close-statistics-btn" id="closeDictationsReportBtn">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="statistics-controls">
                    <div class="date-range-controls">
                        <label>Период:</label>
                        <input type="date" id="reportStartDate" class="date-input">
                        <span>—</span>
                        <input type="date" id="reportEndDate" class="date-input">
                    </div>
                    <div class="language-controls">
                        <label>Язык оригинала:</label>
                        <select id="reportLanguageSelect" class="group-select">
                            <option value="">Все языки</option>
                        </select>
                    </div>
                    <button id="updateDictationsReportBtn" class="button-color-green">Обновить</button>
                </div>

                <div class="dictations-report-content" id="dictationsReportContent">
                    <!-- Здесь будет отчет -->
                </div>
                
                <div class="dictations-report-footer">
                    <button id="backDictationsReportBtn" class="button-color-gray">Вернуться</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;

        // Инициализируем иконки
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Обработчики событий
        document.getElementById('closeDictationsReportBtn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('backDictationsReportBtn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('updateDictationsReportBtn').addEventListener('click', () => {
            this.updateReport();
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

        document.getElementById('reportStartDate').value = this.formatDateForInput(startDate);
        document.getElementById('reportEndDate').value = this.formatDateForInput(endDate);

        // Защита от «нереальных» дат: ограничиваем диапазон выбора.
        if (window.DateRangeUtils) {
            DateRangeUtils.applyLimits(document.getElementById('reportStartDate'));
            DateRangeUtils.applyLimits(document.getElementById('reportEndDate'));
        }
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
     * Форматировать дату для отображения (YYYYMMDD -> DD.MM.YYYY)
     */
    formatDate(dateString) {
        if (dateString.length === 8) {
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            return `${day}.${month}.${year}`;
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

        // Загружаем историю и список диктантов
        await Promise.all([
            this.loadHistory(),
            this.loadDictationsList()
        ]);
        
        // Если фильтр по диктанту задан, скрываем селектор языка и устанавливаем язык из диктанта
        if (this.dictationIdFilter) {
            const languageControls = document.querySelector('.language-controls');
            if (languageControls) {
                languageControls.style.display = 'none';
            }
            
            // Находим диктант и устанавливаем язык в селекторе, обновляем заголовок
            const dictation = this.allDictations.find(d => d.id === this.dictationIdFilter);
            if (dictation) {
                if (dictation.language_original) {
                    const languageSelect = document.getElementById('reportLanguageSelect');
                    if (languageSelect) {
                        languageSelect.value = dictation.language_original;
                    }
                }
                
                // Обновляем заголовок модального окна
                const headerTitle = this.modal.querySelector('.statistics-header h2');
                if (headerTitle) {
                    headerTitle.textContent = `Отчет о выполненных диктантах: ${dictation.title || dictation.id}`;
                }
            }
        } else {
            // Заполняем список языков только если нет фильтра по диктанту
            this.populateLanguages();
        }

        this.modal.style.display = 'flex';
        await this.updateReport();
    }

    /**
     * Загрузить список всех диктантов
     */
    async loadDictationsList() {
        try {
            const response = await fetch('/dictations-list');
            if (!response.ok) {
                throw new Error(`Failed to load dictations list: ${response.statusText}`);
            }
            this.allDictations = await response.json();
            console.log('[DictationsReport] Загружено диктантов:', this.allDictations.length);
        } catch (error) {
            console.error('❌ Ошибка загрузки списка диктантов для отчета:', error);
            this.allDictations = [];
        }
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
     * Загрузить всю историю пользователя
     */
    async loadHistory() {
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) {
                throw new Error('Токен не найден');
            }

            const response = await fetch('/user/api/history/all', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load history: ${response.statusText}`);
            }

            this.allHistoryData = await response.json();
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            this.allHistoryData = {};
        }
    }

    /**
     * Заполнить список языков из истории и списка диктантов
     */
    populateLanguages() {
        const select = document.getElementById('reportLanguageSelect');
        if (!select) return;

        const languages = new Set();
        
        // Собираем языки из выполненных диктантов
        if (this.allHistoryData && this.allDictations) {
            for (const monthKey in this.allHistoryData) {
                const monthData = this.allHistoryData[monthKey];
                if (monthData && monthData.statistics_sentenses) {
                    monthData.statistics_sentenses.forEach(entry => {
                        if (entry.dictation_id) {
                            // Ищем диктант в списке, чтобы получить language_original
                            const dictation = this.allDictations.find(d => d.id === entry.dictation_id);
                            if (dictation && dictation.language_original) {
                                languages.add(dictation.language_original);
                            }
                        }
                    });
                }
            }
        }

        // Очищаем опции кроме "Все языки"
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Добавляем языки
        Array.from(languages).sort().forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = this.languageManager ? this.languageManager.getLanguageName(lang) : lang.toUpperCase();
            select.appendChild(option);
        });
    }

    /**
     * Обновить отчет
     */
    async updateReport() {
        const startDateInput = document.getElementById('reportStartDate');
        const endDateInput = document.getElementById('reportEndDate');
        const languageSelect = document.getElementById('reportLanguageSelect');
        const contentContainer = document.getElementById('dictationsReportContent');

        if (!startDateInput || !endDateInput || !languageSelect || !contentContainer) return;

        // Защита от «нереальных» дат: нормализуем диапазон перед расчётом.
        if (window.DateRangeUtils) {
            DateRangeUtils.normalizeRange(startDateInput, endDateInput);
        }

        const startDate = new Date(startDateInput.value);
        startDate.setHours(0, 0, 0, 0); // Начало дня
        
        const endDate = new Date(endDateInput.value);
        endDate.setHours(23, 59, 59, 999); // Конец дня
        
        const selectedLanguage = languageSelect.value;

        console.log('[DictationsReport] Период:', startDate, '—', endDate);

        // Собираем данные из statistics_sentenses
        const dictationsData = this.collectDictationsData(startDate, endDate, selectedLanguage);

        // Рендерим отчет
        this.renderReport(dictationsData);
    }

    /**
     * Собрать данные о диктантах за период
     */
    collectDictationsData(startDate, endDate, languageFilter) {
        const dictationsMap = new Map(); // dictation_id -> { title, language_original, completions: [] }

        if (!this.allHistoryData) {
            console.log('[DictationsReport] Нет данных истории');
            return [];
        }

        console.log('[DictationsReport] Собираем данные за период:', startDate, '—', endDate);

        // Проходим по всем месяцам
        for (const monthKey in this.allHistoryData) {
            const monthData = this.allHistoryData[monthKey];
            if (!monthData || !monthData.statistics_sentenses) {
                continue;
            }

            console.log(`[DictationsReport] Месяц ${monthKey}: ${monthData.statistics_sentenses.length} записей`);

            // Фильтруем по дате и языку
            monthData.statistics_sentenses.forEach(entry => {
                const entryDate = this.parseDate(entry.date);
                if (!entryDate) {
                    console.log('[DictationsReport] Не удалось распарсить дату:', entry.date);
                    return;
                }

                // Нормализуем entryDate к началу дня для сравнения
                entryDate.setHours(0, 0, 0, 0);
                const normalizedStartDate = new Date(startDate);
                normalizedStartDate.setHours(0, 0, 0, 0);
                const normalizedEndDate = new Date(endDate);
                normalizedEndDate.setHours(0, 0, 0, 0);

                // Проверяем период
                if (entryDate < normalizedStartDate || entryDate > normalizedEndDate) {
                    return;
                }

                const dictationId = entry.dictation_id;
                if (!dictationId) {
                    console.log('[DictationsReport] Нет dictation_id в записи');
                    return;
                }

                // Фильтр по конкретному диктанту (если задан)
                if (this.dictationIdFilter && dictationId !== this.dictationIdFilter) {
                    return;
                }

                // Ищем диктант в списке, чтобы получить title и language_original
                const dictation = this.allDictations.find(d => d.id === dictationId);
                if (!dictation) {
                    console.log(`[DictationsReport] Диктант ${dictationId} не найден в списке`);
                    return;
                }

                // Фильтр по языку
                if (languageFilter && dictation.language_original !== languageFilter) {
                    return;
                }

                if (!dictationsMap.has(dictationId)) {
                    dictationsMap.set(dictationId, {
                        id: dictationId,
                        title: dictation.title || dictationId,
                        language_original: dictation.language_original || '',
                        completions: []
                    });
                }

                const dictationData = dictationsMap.get(dictationId);
                dictationData.completions.push({
                    date: entry.date,
                    perfect: parseInt(entry.perfect || 0),
                    corrected: parseInt(entry.corrected || 0),
                    audio: parseInt(entry.audio || 0),
                    total_time_ms: parseInt(entry.total_time_ms || 0)
                });
            });
        }

        console.log(`[DictationsReport] Найдено диктантов: ${dictationsMap.size}`);

        // Сортируем по количеству завершений (убывание)
        return Array.from(dictationsMap.values()).sort((a, b) => b.completions.length - a.completions.length);
    }

    /**
     * Парсить дату из формата YYYYMMDD (может быть числом или строкой)
     */
    parseDate(dateValue) {
        if (!dateValue) return null;
        
        // Преобразуем в строку, если это число
        const dateString = String(dateValue);
        
        if (dateString.length !== 8) {
            console.log('[DictationsReport] Некорректная длина даты:', dateString);
            return null;
        }
        
        const year = parseInt(dateString.substring(0, 4));
        const month = parseInt(dateString.substring(4, 6)) - 1;
        const day = parseInt(dateString.substring(6, 8));
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            console.log('[DictationsReport] Некорректные значения даты:', year, month, day);
            return null;
        }
        
        return new Date(year, month, day);
    }

    /**
     * Рендерить отчет
     */
    renderReport(dictationsData) {
        const contentContainer = document.getElementById('dictationsReportContent');
        if (!contentContainer) return;

        if (dictationsData.length === 0) {
            contentContainer.innerHTML = '<p class="no-data">Нет данных за выбранный период</p>';
            return;
        }

        // Находим максимальное значение среди всех метрик (perfect, corrected, audio)
        // по всем диктантам и всем дням для единого масштабирования
        let maxValue = 0;

        dictationsData.forEach(dictation => {
            dictation.completions.forEach(completion => {
                maxValue = Math.max(maxValue, completion.perfect);
                maxValue = Math.max(maxValue, completion.corrected);
                maxValue = Math.max(maxValue, completion.audio);
            });
        });

        // Если все значения 0, устанавливаем 1, чтобы избежать деления на 0
        if (maxValue === 0) {
            maxValue = 1;
        }

        let html = '';

        dictationsData.forEach(dictation => {
            html += `
                <div class="dictation-report-item" data-dictation-id="${dictation.id}">
                    <h3 class="dictation-report-title">
                        ${dictation.title || dictation.id}
                        ${dictation.language_original ? `<span class="dictation-language">(${dictation.language_original.toUpperCase()})</span>` : ''}
                    </h3>
                    <div class="dictation-completions">
            `;

            // Сортируем завершения по дате (новые первыми)
            // date может быть числом (20251124) или строкой, преобразуем в строку для сравнения
            dictation.completions.sort((a, b) => {
                const dateA = String(a.date);
                const dateB = String(b.date);
                return dateB.localeCompare(dateA);
            });

            dictation.completions.forEach(completion => {
                // Используем одно максимальное значение для всех метрик
                const perfectWidth = (completion.perfect / maxValue) * 100;
                const correctedWidth = (completion.corrected / maxValue) * 100;
                const audioWidth = (completion.audio / maxValue) * 100;

                // Форматируем время выполнения
                const timeFormatted = completion.total_time_ms && window.TimeUtils 
                    ? window.TimeUtils.formatDuration(completion.total_time_ms)
                    : '';
                const dateTimeDisplay = timeFormatted 
                    ? `${this.formatDate(completion.date)} (${timeFormatted})`
                    : this.formatDate(completion.date);
                
                html += `
                    <div class="completion-item">
                        <div class="completion-date">${dateTimeDisplay}</div>
                        <div class="completion-stats">
                            <div class="stat-row">
                                <span class="stat-label">perfect:</span>
                                <span class="stat-value">${completion.perfect}</span>
                                <div class="stat-bar-container">
                                    <div class="stat-bar perfect-bar" style="width: ${perfectWidth}%"></div>
                                </div>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">corrected:</span>
                                <span class="stat-value">${completion.corrected}</span>
                                <div class="stat-bar-container">
                                    <div class="stat-bar corrected-bar" style="width: ${correctedWidth}%"></div>
                                </div>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">audio:</span>
                                <span class="stat-value">${completion.audio}</span>
                                <div class="stat-bar-container">
                                    <div class="stat-bar audio-bar" style="width: ${audioWidth}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        contentContainer.innerHTML = html;
    }

    /**
     * Открыть отчет для текущего пользователя
     * @param {string|null} dictationId - ID диктанта для фильтрации (опционально)
     */
    static async open(dictationId = null) {
        const report = new DictationsReport(dictationId);
        await report.show();
    }
}

// Делаем класс доступным глобально
window.DictationsReport = DictationsReport;

