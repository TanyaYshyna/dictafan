/**
 * Общие утилиты для приложения
 * Функции, которые используются в разных модулях
 */

/**
 * Класс с утилитами для работы со временем
 */
class TimeUtils {
    /**
     * Форматировать миллисекунды в формат dd:hh:mm:ss
     * @param {number} milliseconds - время в миллисекундах
     * @returns {string} - отформатированное время в формате "dd:hh:mm:ss" или "hh:mm:ss" (если дней нет)
     */
    static formatDuration(milliseconds) {
        const elapsedMs = Number(milliseconds) || 0;
        let s = elapsedMs / 1000;
        
        const d = Math.floor(s / 86400);
        s = s - d * 86400;
        
        const h = Math.floor(s / 3600);
        s = s - h * 3600;
        
        const m = Math.floor(s / 60);
        s = Math.floor(s % 60);
        
        let time_text = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        if (d > 0) {
            time_text = `${d}:${time_text}`;
        }
        
        return time_text;
    }
    
    /**
     * Форматировать секунды в формат MM:SS
     * @param {number} seconds - время в секундах
     * @returns {string} - отформатированное время в формате "MM:SS"
     */
    static formatTime(seconds) {
        const sec = Number(seconds) || 0;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    }
}

// Делаем класс доступным глобально
window.TimeUtils = TimeUtils;

/**
 * Утилиты для работы с диапазонами дат в отчётах.
 * Защищают от «нереальных» дат (например, 01.01.0001), которые вешают страницу,
 * ограничивая диапазон допустимыми значениями.
 */
class DateRangeUtils {
    /**
     * Минимально допустимая дата для отчётов.
     * Сервис не мог иметь данных раньше этой даты.
     */
    static get MIN_REPORT_DATE() {
        return '2020-01-01';
    }

    /**
     * Привести Date к ISO-строке YYYY-MM-DD (локальное время).
     */
    static toISO(d) {
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

    /**
     * Сегодняшняя дата в формате YYYY-MM-DD.
     */
    static todayISO() {
        return DateRangeUtils.toISO(new Date());
    }

    /**
     * Ограничить ISO-дату диапазоном [minIso, maxIso].
     * Некорректную (нераспознаваемую) строку возвращает как есть.
     */
    static clampISO(iso, minIso, maxIso) {
        if (!iso) return iso;
        const d = new Date(String(iso));
        if (Number.isNaN(d.getTime())) return iso;
        const min = minIso ? new Date(String(minIso)) : null;
        const max = maxIso ? new Date(String(maxIso)) : null;
        if (min && d.getTime() < min.getTime()) return minIso;
        if (max && d.getTime() > max.getTime()) return maxIso;
        return iso;
    }

    /**
     * Нормализовать пару date-инпутов:
     *  - пустые значения заменяются на maxIso (по умолчанию сегодня);
     *  - даты ограничиваются диапазоном [minIso, maxIso];
     *  - если начало позже конца — меняем местами.
     * Возвращает true, если инпуты валидны и были обработаны.
     */
    static normalizeRange(startInput, endInput, options = {}) {
        if (!startInput || !endInput) return false;
        const minIso = options.min || DateRangeUtils.MIN_REPORT_DATE;
        const maxIso = options.max || DateRangeUtils.todayISO();

        let s = String(startInput.value || '').trim();
        let e = String(endInput.value || '').trim();

        if (!s) s = maxIso;
        if (!e) e = maxIso;

        s = DateRangeUtils.clampISO(s, minIso, maxIso);
        e = DateRangeUtils.clampISO(e, minIso, maxIso);

        const sd = new Date(s);
        const ed = new Date(e);
        if (!Number.isNaN(sd.getTime()) && !Number.isNaN(ed.getTime()) && sd.getTime() > ed.getTime()) {
            const tmp = s;
            s = e;
            e = tmp;
        }

        startInput.value = s;
        endInput.value = e;
        return true;
    }

    /**
     * Применить ограничения min/max к date-инпуту, чтобы и нативный
     * календарь не позволял выбирать даты вне допустимого диапазона.
     */
    static applyLimits(input, options = {}) {
        if (!input) return;
        try {
            input.min = options.min || DateRangeUtils.MIN_REPORT_DATE;
            input.max = options.max || DateRangeUtils.todayISO();
        } catch (e) {
        }
    }
}

window.DateRangeUtils = DateRangeUtils;

