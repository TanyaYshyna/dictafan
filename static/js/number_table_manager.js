(function () {
  if (typeof window === 'undefined') return;

  /**
   * NumberTableManager — загружает и кеширует таблицы чисел для разных языков.
   * Таблицы хранятся в отдельных JSON-файлах в static/data/number_tables/.
   * Загружается только таблица для нужного языка, экономя ресурсы.
   *
   * Использование:
   *   const mgr = new NumberTableManager();
   *   await mgr.ensureLanguage('en');
   *   const words = mgr.digitToWord('10', 'en'); // → "ten"
   *   const digits = mgr.wordToDigit('ten', 'en'); // → "10"
   *   const normalized = mgr.normalizeTranscript('10 o\'clock', 'en'); // → "ten o'clock"
   */
  class NumberTableManager {
    constructor() {
      this._cache = {};        // langCode -> table data
      this._index = null;      // cached index.json
      this._basePath = 'static/data/number_tables';
      this._loadPromise = null;
    }

    /**
     * Загружает индекс (список доступных языков).
     * @returns {Promise<Object>}
     */
    async _loadIndex() {
      if (this._index) return this._index;
      if (this._loadPromise) return this._loadPromise;

      this._loadPromise = this._fetchJson(this._basePath + '/index.json')
        .then((data) => {
          this._index = data && data.languages ? data : { languages: {} };
          return this._index;
        })
        .catch((err) => {
          console.warn('[NumberTableManager] Failed to load index:', err);
          this._index = { languages: {} };
          return this._index;
        });

      return this._loadPromise;
    }

    /**
     * Проверяет, доступен ли язык в индексе.
     * @param {string} langCode - код языка (например, 'en', 'ru')
     * @returns {Promise<boolean>}
     */
    async hasLanguage(langCode) {
      const idx = await this._loadIndex();
      const code = this._normalizeLangCode(langCode);
      return !!(idx.languages && idx.languages[code]);
    }

    /**
     * Загружает таблицу для указанного языка, если ещё не загружена.
     * @param {string} langCode - код языка (например, 'en', 'ru')
     * @returns {Promise<Object|null>} - данные таблицы или null
     */
    async ensureLanguage(langCode) {
      const code = this._normalizeLangCode(langCode);
      if (this._cache[code]) return this._cache[code];

      const idx = await this._loadIndex();
      const langInfo = idx.languages && idx.languages[code];
      if (!langInfo || !langInfo.file) {
        // Язык не найден — пробуем загрузить по базовому коду (en → en, en-US → en)
        const baseCode = code.split('-')[0] || code;
        if (baseCode !== code) {
          return this.ensureLanguage(baseCode);
        }
        return null;
      }

      try {
        const data = await this._fetchJson(this._basePath + '/' + langInfo.file);
        if (data && data.lang) {
          this._cache[code] = data;
          // Также кешируем по базовому коду
          const baseCode = code.split('-')[0];
          if (baseCode && baseCode !== code && !this._cache[baseCode]) {
            this._cache[baseCode] = data;
          }
          return data;
        }
      } catch (err) {
        console.warn('[NumberTableManager] Failed to load table for', code, err);
      }
      return null;
    }

    /**
     * Загружает таблицы для нескольких языков одновременно.
     * @param {string[]} langCodes
     * @returns {Promise<Object>} - map langCode -> table data
     */
    async ensureLanguages(langCodes) {
      const codes = Array.isArray(langCodes) ? langCodes : [langCodes];
      const results = {};
      await Promise.all(codes.map(async (c) => {
        results[c] = await this.ensureLanguage(c);
      }));
      return results;
    }

    /**
     * Преобразует цифру/число в слово для указанного языка.
     * @param {string|number} digit - цифра или число (например, '10', 10)
     * @param {string} langCode
     * @returns {string|null} - слово или null, если не найдено
     */
    digitToWord(digit, langCode) {
      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table || !table.digit_to_word) return null;
      const key = String(digit);
      return table.digit_to_word[key] || null;
    }

    /**
     * Преобразует слово-число в цифру для указанного языка.
     * @param {string} word - слово (например, 'ten', 'один')
     * @param {string} langCode
     * @returns {string|null} - цифра или null, если не найдено
     */
    wordToDigit(word, langCode) {
      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table || !table.word_to_digit) return null;
      const key = String(word || '').toLowerCase().trim();
      return table.word_to_digit[key] || null;
    }

    /**
     * Проверяет, является ли слово числительным для указанного языка.
     * @param {string} word
     * @param {string} langCode
     * @returns {boolean}
     */
    isNumberWord(word, langCode) {
      const val = this.wordToDigit(word, langCode);
      return val !== null;
    }

    /**
     * Нормализует транскрипт ASR: заменяет цифры на слова.
     * Например: "10 o'clock" → "ten o'clock"
     * 
     * @param {string} transcript - текст из ASR
     * @param {string} langCode
     * @returns {string}
     */
    normalizeTranscript(transcript, langCode) {
      const text = String(transcript || '').trim();
      if (!text) return text;

      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table) return text;

      // 1. Обработка специальных фраз (целиком)
      let result = text;
      if (table.special_phrases) {
        // Сортируем по длине (сначала длинные фразы, чтобы избежать частичной замены)
        const phrases = Object.keys(table.special_phrases).sort((a, b) => b.length - a.length);
        for (const phrase of phrases) {
          const replacement = table.special_phrases[phrase];
          // case-insensitive замена
          const regex = new RegExp(this._escapeRegex(phrase), 'gi');
          result = result.replace(regex, replacement);
        }
      }

      // 2. Замена чисел (цифр) на слова
      // Ищем последовательности цифр (например, "10", "32", "100")
      result = result.replace(/\d+/g, (match) => {
        const word = this.digitToWord(match, langCode);
        return word || match;
      });

      // 3. Замена отдельных цифр (например, "1" → "one", если не было заменено выше)
      result = result.replace(/\b(\d)\b/g, (match, digit) => {
        const word = this.digitToWord(digit, langCode);
        return word || match;
      });

      return result;
    }

    /**
     * Нормализует оригинальный текст: заменяет слова-числа на цифры.
     * Это нужно для сравнения: если в оригинале "ten o'clock", а ASR вернул "10",
     * то после замены "ten" → "10" можно сравнивать.
     * 
     * @param {string} text - оригинальный текст
     * @param {string} langCode
     * @returns {string}
     */
    normalizeOriginalText(text, langCode) {
      const s = String(text || '').trim();
      if (!s) return s;

      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table || !table.word_to_digit) return s;

      // Разбиваем на слова и заменяем каждое слово-число на цифру
      const words = s.split(/\s+/);
      const result = words.map((word) => {
        const cleaned = word.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0080-\u00FF']/g, '');
        const digit = this.wordToDigit(cleaned, langCode);
        if (digit !== null) {
          // Сохраняем пунктуацию вокруг слова
          const before = word.substring(0, word.indexOf(cleaned));
          const after = word.substring(word.indexOf(cleaned) + cleaned.length);
          return before + digit + after;
        }
        return word;
      });

      return result.join(' ');
    }

    /**
     * Получает Set всех слов-чисел для указанного языка.
     * @param {string} langCode
     * @returns {Set<string>}
     */
    getNumberWordsSet(langCode) {
      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table || !table.word_to_digit) return new Set();
      return new Set(Object.keys(table.word_to_digit));
    }

    /**
     * Получает словарь contractions для указанного языка.
     * @param {string} langCode
     * @returns {Object|null}
     */
    getContractions(langCode) {
      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table) return null;
      return table.contractions || null;
    }

    /**
     * Получает специальные фразы для указанного языка.
     * @param {string} langCode
     * @returns {Object|null}
     */
    getSpecialPhrases(langCode) {
      const table = this._cache[this._normalizeLangCode(langCode)];
      if (!table) return null;
      return table.special_phrases || null;
    }

    /**
     * Очищает кеш для указанного языка (или весь кеш).
     * @param {string} [langCode] - если не указан, очищается весь кеш
     */
    clearCache(langCode) {
      if (langCode) {
        delete this._cache[this._normalizeLangCode(langCode)];
      } else {
        this._cache = {};
        this._index = null;
        this._loadPromise = null;
      }
    }

    // --- Вспомогательные методы ---

    _normalizeLangCode(code) {
      return String(code || '').trim().toLowerCase().split('-')[0];
    }

    _escapeRegex(str) {
      return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async _fetchJson(url) {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status + ' for ' + url);
      }
      return resp.json();
    }
  }

  // Экспортируем в глобальную область
  window.NumberTableManager = NumberTableManager;

  // Создаём singleton-экземпляр для удобства
  if (!window.__numberTableManager) {
    window.__numberTableManager = new NumberTableManager();
  }
})();
