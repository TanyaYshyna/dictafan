/**
 * Класс для работы с историей активности пользователя
 * Сохраняет и загружает статистику по диктантам в JSON файлы
 */
class UserActivityHistory {
    constructor(apiBase = '/user/api') {
        this.apiBase = apiBase;
        this.currentSession = null;
        this.currentMonthIdentifier = null;
        this.monthData = null;
    }

    async listActivityReportUsers() {
        try {
            const token = this.getToken();
            if (!token) return [];

            const res = await fetch('/api/statistics/activity/users', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success && Array.isArray(js.users))) return [];
            return js.users;
        } catch (e) {
            return [];
        }
    }

    /**
     * Получить идентификатор месяца в формате YYYYMM (год и месяц)
     */
    getMonthIdentifier(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}${month}`;
    }

    /**
     * Получить идентификатор дня в формате YYYYMMDD
     */
    getDateIdentifier(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return parseInt(`${year}${month}${day}`);
    }

    /**
     * Получить timestamp в секундах
     */
    getTimestamp(date = new Date()) {
        return Math.floor(date.getTime() / 1000);
    }

    /**
     * Загрузить историю за текущий месяц
     */
    async loadCurrentMonth() {
        try {
            const token = this.getToken();
            if (!token) {
                console.warn('⚠️ Токен не найден, возвращаем пустую структуру');
                this.monthData = {
                    id_user: '',
                    month: parseInt(this.getMonthIdentifier()),
                    statistics: [],
                    statistics_sentenses: []
                };
                return this.monthData;
            }

            this.currentMonthIdentifier = this.getMonthIdentifier();
            const response = await fetch(`${this.apiBase}/history/${this.currentMonthIdentifier}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 422) {
                    console.warn('⚠️ Ошибка аутентификации при загрузке истории');
                    this.monthData = {
                        id_user: '',
                        month: parseInt(this.getMonthIdentifier()),
                        statistics: [],
                        statistics_sentenses: []
                    };
                    return this.monthData;
                }
                throw new Error(`Failed to load history: ${response.statusText}`);
            }

            this.monthData = await response.json();
            
            // Если данных нет, создаем структуру
            if (!this.monthData.statistics) {
                this.monthData.statistics = [];
            }
            
            // Убеждаемся, что statistics_sentenses существует (важно сохранить при следующем сохранении)
            if (!this.monthData.statistics_sentenses) {
                this.monthData.statistics_sentenses = [];
            }

            return this.monthData;
        } catch (error) {
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                console.warn('⚠️ Оффлайн: не удалось загрузить историю (не критично):', error);
            } else {
                console.warn('⚠️ Не удалось загрузить историю (не критично):', error);
            }
            // Возвращаем пустую структуру при ошибке, но сохраняем statistics_sentenses если они были
            const existingSentenses = this.monthData?.statistics_sentenses || [];
            this.monthData = {
                id_user: '',
                month: parseInt(this.getMonthIdentifier()),
                statistics: [],
                statistics_sentenses: existingSentenses
            };
            return this.monthData;
        }
    }

    /**
     * Начать новую сессию диктанта
     */
    startSession(dictationId) {
        const now = new Date();
        const dateId = this.getDateIdentifier(now);
        
        this.currentSession = {
            id_diktation: dictationId,
            date: dateId,
            end: 0, // счетчик завершений диктанта
            perfect: 0,
            corrected: 0,
            audio: 0
        };

        return this.currentSession;
    }

    /**
     * Обновить текущую сессию
     */
    updateSession(stats) {
        if (!this.currentSession) return;

        // Обновляем статистику
        if (stats.perfect !== undefined) this.currentSession.perfect = stats.perfect;
        if (stats.corrected !== undefined) this.currentSession.corrected = stats.corrected;
        if (stats.audio !== undefined) this.currentSession.audio = stats.audio;
        if (stats.end !== undefined) {
            // end - счетчик завершений, принимаем значение из stats
            this.currentSession.end = stats.end || 0;
        }
    }

    /**
     * Найти существующую сессию для диктанта за сегодня
     */
    findTodaySession(dictationId) {
        if (!this.monthData || !this.monthData.statistics) return null;

        const dateId = this.getDateIdentifier();
        // В "statistics" теперь нет id_diktation, наработки суммируются по дате
        // Ищем только по дате (наработки за день, независимо от диктанта)
        const todaySession = this.monthData.statistics.find(stat => {
            return stat.date === dateId;
        });

        return todaySession;
    }

    /**
     * Сохранить сессию в историю
     */
    async saveSession(force = false) {
        if (!this.currentSession) return false;

        try {
            const token = this.getToken();
            if (!token) {
                console.warn('⚠️ Токен не найден, сессия не сохранена');
                return false;
            }

            // Загружаем актуальные данные месяца
            await this.loadCurrentMonth();

            // Находим существующую сессию за сегодня
            const existingSession = this.findTodaySession(this.currentSession.id_diktation);

            // Создаем копию без timer для сохранения
            const sessionToSave = { ...this.currentSession };
            delete sessionToSave.timer; // Убираем timer из данных для сохранения

            if (existingSession) {
                // Обновляем существующую сессию
                Object.assign(existingSession, sessionToSave);
            } else {
                // Добавляем новую сессию
                this.monthData.statistics.push(sessionToSave);
            }

            // Убеждаемся, что отправляем полную структуру со всеми полями
            const dataToSave = {
                id_user: this.monthData.id_user || '',
                month: this.monthData.month || parseInt(this.currentMonthIdentifier),
                statistics: this.monthData.statistics || [],
                statistics_sentenses: this.monthData.statistics_sentenses || []
            };
            
            console.log(`[UserActivityHistory] Сохранение: statistics=${dataToSave.statistics.length}, statistics_sentenses=${dataToSave.statistics_sentenses.length}`);
            
            // Сохраняем файл
            const response = await fetch(`${this.apiBase}/history/${this.currentMonthIdentifier}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dataToSave)
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 422) {
                    console.warn('⚠️ Ошибка аутентификации при сохранении истории');
                    return false;
                }
                
                // Пытаемся получить детали ошибки от сервера
                let errorMessage = response.statusText;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    // Игнорируем ошибку парсинга JSON
                }
                
                console.error(`❌ Ошибка сохранения истории (${response.status}):`, errorMessage);
                // Не бросаем исключение, просто возвращаем false
                // Это не должно блокировать работу приложения
                return false;
            }

            return true;
        } catch (error) {
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                console.warn('⚠️ Оффлайн: ошибка при сохранении сессии (не критично, работа продолжается):', error);
            } else {
                console.warn('⚠️ Ошибка при сохранении сессии (не критично, работа продолжается):', error);
            }
            // Возвращаем false, но не прерываем выполнение
            return false;
        }
    }

    /**
     * Загрузить всю историю пользователя
     */
    async loadAllHistory() {
        try {
            const token = this.getToken();
            if (!token) {
                console.warn('⚠️ Токен не найден, возвращаем пустую историю');
                return {};
            }

            const response = await fetch(`${this.apiBase}/history/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 422) {
                    console.warn('⚠️ Ошибка аутентификации при загрузке всей истории');
                    return {};
                }
                throw new Error(`Failed to load all history: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                console.warn('⚠️ Оффлайн: не удалось загрузить всю историю (не критично):', error);
            } else {
                console.warn('⚠️ Не удалось загрузить всю историю (не критично):', error);
            }
            return {};
        }
    }

    /**
     * Получить статистику за период
     */
    async getStatisticsByPeriod(startDate, endDate, groupBy = 'days', userId = null) {
        try {
            const token = this.getToken();
            if (!token) return [];

            const startIso = (startDate instanceof Date)
                ? startDate.toISOString().slice(0, 10)
                : new Date(startDate).toISOString().slice(0, 10);
            const endIso = (endDate instanceof Date)
                ? endDate.toISOString().slice(0, 10)
                : new Date(endDate).toISOString().slice(0, 10);

            const res = await fetch('/api/statistics/activity/report', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    start_date: startIso,
                    end_date: endIso,
                    group_by: groupBy,
                    user_id: (userId != null ? userId : null),
                })
            });
            const js = await res.json().catch(() => null);
            if (!(res && res.ok && js && js.success && Array.isArray(js.stats))) return [];
            return js.stats;
        } catch (e) {
            return [];
        }
    }

    /**
     * Группировать статистику по дням/неделям/месяцам
     */
    groupStatistics(stats, groupBy) {
        const grouped = {};

        stats.forEach(stat => {
            const dateValue = stat.date;
            if (!dateValue) return;
            
            const dateId = String(dateValue);
            let key;

            if (groupBy === 'days') {
                key = dateId; // YYYYMMDD
            } else if (groupBy === 'weeks') {
                // Вычисляем номер недели
                const year = parseInt(dateId.substring(0, 4));
                const month = parseInt(dateId.substring(4, 6)) - 1;
                const day = parseInt(dateId.substring(6, 8));
                const date = new Date(year, month, day);
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Начало недели (воскресенье)
                const weekNum = Math.ceil((date.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
                key = `${year}W${String(weekNum).padStart(2, '0')}`;
            } else if (groupBy === 'months') {
                key = dateId.substring(0, 6); // YYYYMM
            }

            if (!grouped[key]) {
                grouped[key] = {
                    date: key,
                    perfect: 0,
                    corrected: 0,
                    audio: 0,
                    count: 0
                };
            }

            grouped[key].perfect += stat.perfect || 0;
            grouped[key].corrected += stat.corrected || 0;
            grouped[key].audio += stat.audio || 0;
            grouped[key].count += 1;
        });

        return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Вычислить количество несгораемых дней (streak)
     * Несгораемый день - день, когда была хотя бы одна активность
     */
    async calculateStreakDays() {
        try {
            // ...
        } catch (error) {
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                console.warn('⚠️ Оффлайн: ошибка расчёта streak (не критично):', error);
            } else {
                console.warn('⚠️ Ошибка расчёта streak (не критично):', error);
            }
            return 0;
        }
    }

    /**
     * Получить токен из localStorage или UserManager
     */
    getToken() {
        // ...
        if (typeof window !== 'undefined' && window.UM && window.UM.token) {
            return window.UM.token;
        }
        
        // Пробуем получить из localStorage
        const token = localStorage.getItem('jwt_token');
        if (token) {
            return token;
        }
        
        // Пробуем получить из cookie (fallback)
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'access_token_cookie') {
                return value;
            }
        }
        
        return null;
    }

    /**
     * Завершить текущую сессию
     */
    async finishSession() {
        if (!this.currentSession) return false;

        // Увеличиваем счетчик завершений
        this.currentSession.end = (this.currentSession.end || 0) + 1;

        return await this.saveSession(true);
    }
}

