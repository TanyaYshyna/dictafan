class ПроверкаНаОшибки {
  constructor(opts = {}) {
    this.opts = {
      requireEveryWord: true,
      requiredPassedStarHalf: 3,
      ...opts,
    };

    this._initRegexes();
    this._numberTableManager = null;
  }

  /**
   * Инициализирует NumberTableManager для загрузки таблиц чисел по языку.
   */
  _ensureNumberTableManager() {
    if (this._numberTableManager) return this._numberTableManager;
    try {
      if (window.__numberTableManager) {
        this._numberTableManager = window.__numberTableManager;
      } else if (window.NumberTableManager) {
        this._numberTableManager = new window.NumberTableManager();
        window.__numberTableManager = this._numberTableManager;
      }
    } catch (e) {
    }
    return this._numberTableManager;
  }

  _initRegexes() {
    this.LATIN_TEST_REGEX = /[A-Za-z]/;
    this.LATIN_REPLACE_REGEX = /[A-Za-z]/g;
    this.CYRILLIC_TEST_REGEX = /[\u0400-\u04FF]/;
    this.CYRILLIC_REPLACE_REGEX = /[\u0400-\u04FF]/g;
    this.ARABIC_TEST_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    this.ARABIC_REPLACE_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

    try {
      this.LATIN_TEST_REGEX = new RegExp('\\p{Script=Latin}', 'u');
      this.LATIN_REPLACE_REGEX = new RegExp('\\p{Script=Latin}', 'gu');
      this.CYRILLIC_TEST_REGEX = new RegExp('\\p{Script=Cyrillic}', 'u');
      this.CYRILLIC_REPLACE_REGEX = new RegExp('\\p{Script=Cyrillic}', 'gu');
      this.ARABIC_TEST_REGEX = new RegExp('\\p{Script=Arabic}', 'u');
      this.ARABIC_REPLACE_REGEX = new RegExp('\\p{Script=Arabic}', 'gu');
    } catch (e) {
    }

    this.DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212-]/g;
    this.CURLY_APOS = /[\u2019\u2018\u02BC]/g;
    this.PUNCTUATION_REGEX = /[.,!?:;"«»„"'()\[\]{}،؛؟\u201C\u201D\u201E\u201F\u2033\u2036]/g;
    this.ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u0671\u06D6-\u06ED]/g;
    this.ARABIC_ALIF_VARIANTS_REGEX = /[\u0622\u0623\u0625\u0671]/g;

    // NUM_WORDS_SET теперь заполняется динамически через NumberTableManager,
    // но оставляем базовый набор для обратной совместимости
    this.NUM_WORDS_SET = new Set([
      "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
      "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
      "nitton",
      "ноль", "один", "одна", "одно", "два", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
      "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
      "семнадцать", "восемнадцать", "девятнадцать", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят",
      "семьдесят", "восемьдесят", "девяносто", "сто", "тысяча",
      "нуль", "одна", "одне", "два", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять",
      "десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять",
      "сімнадцять", "вісімнадцять", "дев'ятнадцять", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят",
      "сімдесят", "вісімдесят", "дев'яносто", "сто", "тисяча",
    ]);

    this.CONTRACTIONS_DICT = {
      im: ["i", "am"],
      youre: ["you", "are"],
      hes: ["he", "is"],
      shes: ["she", "is"],
      its: ["it", "is"],
      were: ["we", "are"],
      theyre: ["they", "are"],
      ive: ["i", "have"],
      youve: ["you", "have"],
      weve: ["we", "have"],
      theyve: ["they", "have"],
      id: ["i", "had"],
      youd: ["you", "had"],
      hed: ["he", "had"],
      shed: ["she", "had"],
      wed: ["we", "had"],
      theyd: ["they", "had"],
      ill: ["i", "will"],
      youll: ["you", "will"],
      hell: ["he", "will"],
      shell: ["she", "will"],
      well: ["we", "will"],
      theyll: ["they", "will"],
      dont: ["do", "not"],
      doesnt: ["does", "not"],
      didnt: ["did", "not"],
      wont: ["will", "not"],
      wouldnt: ["would", "not"],
      shouldnt: ["should", "not"],
      couldnt: ["could", "not"],
      cant: ["can", "not"],
      isnt: ["is", "not"],
      arent: ["are", "not"],
      wasnt: ["was", "not"],
      werent: ["were", "not"],
      hasnt: ["has", "not"],
      havent: ["have", "not"],
      hadnt: ["had", "not"],
      thats: ["that", "is"],
      theres: ["there", "is"],
      heres: ["here", "is"],
      wheres: ["where", "is"],
      whats: ["what", "is"],
      whos: ["who", "is"],
      hows: ["how", "is"],
      whens: ["when", "is"],
      whys: ["why", "is"],
      lets: ["let", "us"],
    };

    this.EQUIVALENT_WORDS_DICT = {
      cannot: ["cant"],
      cant: ["cannot"],
    };
  }

  /**
   * Обновляет NUM_WORDS_SET из NumberTableManager для указанного языка.
   * @param {string} langCode
   */
  async _updateNumberWordsForLang(langCode) {
    try {
      const mgr = this._ensureNumberTableManager();
      if (mgr) {
        const code = String(langCode || '').split('-')[0].toLowerCase();
        await mgr.ensureLanguage(code);
        const words = mgr.getNumberWordsSet(code);
        if (words && words.size > 0) {
          // Добавляем слова из таблицы в существующий Set
          for (const w of words) {
            this.NUM_WORDS_SET.add(w);
          }
        }
        // Также добавляем contractions из таблицы
        const contractions = mgr.getContractions(code);
        if (contractions) {
          for (const [key, val] of Object.entries(contractions)) {
            if (!this.CONTRACTIONS_DICT[key]) {
              this.CONTRACTIONS_DICT[key] = val;
            }
          }
        }
      }
    } catch (e) {
      // не критично
    }
  }

  /**
   * Проверяет, является ли строка числом (цифрами).
   */
  /**
   * Проверяет, является ли строка цифровой.
   * Расширенная версия: распознаёт также форматы времени HH:MM и HH.MM,
   * а также очищает от апострофов и суффиксов (например "8.00'de" → "8.00").
   * @param {string} str
   * @returns {boolean}
   */
  _isDigitString(str) {
    const s = String(str || '').trim();
    if (!s) return false;
    // Прямая проверка: только цифры
    if (/^\d+$/.test(s)) return true;
    // Формат HH:MM или HH.MM (время)
    if (/^\d{1,2}[:\.]\d{2}$/.test(s)) return true;
    // Очищаем от апострофа и суффикса (например "8.00'de" → "8.00")
    const cleaned = s.replace(/['\u2018\u2019].*$/, '');
    if (cleaned !== s) {
      return this._isDigitString(cleaned);
    }
    return false;
  }

  /**
   * Проверяет, эквивалентны ли два слова с учётом чисел.
   * Например: "ten" ≡ "10", "один" ≡ "1", "10" ≡ "ten"
   */
  /**
   * Извлекает числовой префикс из строки.
   * Например: "8.00de" → "8.00", "10:00da" → "10:00", "123abc" → "123"
   * @param {string} str
   * @returns {string|null}
   */
  _extractDigitPrefix(str) {
    const s = String(str || '').trim();
    if (!s) return null;
    // Пробуем извлечь HH:MM или HH.MM в начале строки
    const timeMatch = s.match(/^\d{1,2}[:\.]\d{2}/);
    if (timeMatch) return timeMatch[0];
    // Пробуем извлечь просто цифры в начале строки
    const digitMatch = s.match(/^\d+/);
    if (digitMatch) return digitMatch[0];
    return null;
  }

  _areNumberEquivalent(word1, word2, langCode) {
    if (!word1 || !word2) return false;

    // Очищаем слова от апострофов и суффиксов для сравнения
    // Например: "8.00'de" → "8.00", "sekizde" → проверяем основу "sekiz"
    const cleanWord1 = String(word1).replace(/['\u2018\u2019].*$/, '').trim();
    const cleanWord2 = String(word2).replace(/['\u2018\u2019].*$/, '').trim();

    // Пробуем извлечь числовой префикс (для случаев вроде "8.00de" после simplifyText)
    const prefix1 = this._extractDigitPrefix(cleanWord1);
    const prefix2 = this._extractDigitPrefix(cleanWord2);

    const d1 = this._isDigitString(prefix1 || cleanWord1);
    const d2 = this._isDigitString(prefix2 || cleanWord2);

    if (d1 && !d2) {
      // word1 — цифры (или цифровой префикс), word2 — слово
      const digitStr = prefix1 || cleanWord1;
      try {
        const mgr = this._ensureNumberTableManager();
        if (mgr) {
          const code = String(langCode || '').split('-')[0].toLowerCase();
          const digit = mgr.wordToDigit(cleanWord2, code);
          if (digit === digitStr) return true;
          // Если цифры длиннее — возможно это время HH:MM без двоеточия (1000 = 10:00)
          if (digit && digitStr.length > digit.length && digitStr.startsWith(digit)) {
            return true;
          }
        }
      } catch (e) {}
      // fallback: проверяем через NUM_WORDS_SET
      const simple = this._wordToDigitSimple(cleanWord2);
      if (simple === digitStr) return true;
      if (simple && digitStr.length > simple.length && digitStr.startsWith(simple)) {
        return true;
      }
      return false;
    }

    if (!d1 && d2) {
      // word1 — слово, word2 — цифры (или цифровой префикс)
      const digitStr = prefix2 || cleanWord2;
      try {
        const mgr = this._ensureNumberTableManager();
        if (mgr) {
          const code = String(langCode || '').split('-')[0].toLowerCase();
          const digit = mgr.wordToDigit(cleanWord1, code);
          if (digit === digitStr) return true;
          // Если цифры длиннее — возможно это время HH:MM без двоеточия
          if (digit && digitStr.length > digit.length && digitStr.startsWith(digit)) {
            return true;
          }
        }
      } catch (e) {}
      const simple = this._wordToDigitSimple(cleanWord1);
      if (simple === digitStr) return true;
      if (simple && digitStr.length > simple.length && digitStr.startsWith(simple)) {
        return true;
      }
      return false;
    }

    // Если оба не цифры — проверяем, не является ли одно из слов
    // числовой основой с аффиксом (например "sekizde" содержит "sekiz")
    if (!d1 && !d2) {
      try {
        const mgr = this._ensureNumberTableManager();
        if (mgr) {
          const code = String(langCode || '').split('-')[0].toLowerCase();
          const numberWordsSet = mgr.getNumberWordsSet(code);
          if (numberWordsSet && numberWordsSet.size > 0) {
            // Проверяем, содержит ли одно из слов числовую основу
            for (const numWord of numberWordsSet) {
              const w1Starts = cleanWord1.startsWith(numWord) && cleanWord1.length > numWord.length;
              const w2Starts = cleanWord2.startsWith(numWord) && cleanWord2.length > numWord.length;
              if (w1Starts && w2Starts) {
                // Оба слова содержат одну и ту же числовую основу с разными аффиксами
                return true;
              }
              if (w1Starts && cleanWord2 === numWord) {
                // word1 = число+аффикс, word2 = чистое число
                return true;
              }
              if (w2Starts && cleanWord1 === numWord) {
                // word2 = число+аффикс, word1 = чистое число
                return true;
              }
            }
          }
        }
      } catch (e) {}
    }

    return false;
  }

  /**
   * Простой fallback: преобразует английское слово-число в цифру.
   */
  _wordToDigitSimple(word) {
    const map = {
      "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
      "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
      "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
      "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
      "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
      "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
      "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
      "nitton": "19",
    };
    return map[String(word || '').toLowerCase()] || null;
  }

  getDictationScript(langCode) {
    const raw = String(langCode || '').trim().toLowerCase();
    if (raw.startsWith('ru') || raw.startsWith('uk')) return 'cyrillic';
    if (raw.startsWith('ar')) return 'arabic';
    return 'latin';
  }

  getDisallowedScriptRegexes(script) {
    if (script === 'latin') return [this.CYRILLIC_REPLACE_REGEX, this.ARABIC_REPLACE_REGEX];
    if (script === 'cyrillic') return [this.LATIN_REPLACE_REGEX, this.ARABIC_REPLACE_REGEX];
    if (script === 'arabic') return [this.LATIN_REPLACE_REGEX, this.CYRILLIC_REPLACE_REGEX];
    return [];
  }

  hasDisallowedChars(text, script) {
    if (!text) return false;
    if (script === 'latin') return this.CYRILLIC_TEST_REGEX.test(text) || this.ARABIC_TEST_REGEX.test(text);
    if (script === 'cyrillic') return this.LATIN_TEST_REGEX.test(text) || this.ARABIC_TEST_REGEX.test(text);
    if (script === 'arabic') return this.LATIN_TEST_REGEX.test(text) || this.CYRILLIC_TEST_REGEX.test(text);
    return false;
  }

  stripDisallowedChars(text, script) {
    let result = String(text || '');
    for (const rx of this.getDisallowedScriptRegexes(script)) {
      result = result.replace(rx, '');
    }
    return result;
  }

  normalizeTurkishDottedI(text) {
    return String(text || '').replace(/\u0307/g, '');
  }

  normalizeDictationInvisibleChars(text) {
    return String(text || '')
      .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
      .replace(/\u00AD/g, '');
  }

  splitWordsForDisplay(text) {
    return String(text || '')
      .normalize('NFKC')
      .replace(/\u0307/g, '')
      .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
      .replace(/\u00AD/g, '')
      .replace(this.DASHES, ' ')
      .trim()
      .split(/\s+/);
  }

  splitUserWords(text) {
    return String(text || '')
      .normalize('NFKC')
      .replace(/\u0307/g, '')
      .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
      .replace(/\u00AD/g, '')
      .replace(this.DASHES, ' ')
      .replace(this.PUNCTUATION_REGEX, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  simplifyText(text) {
    const originalText = String(text || '');
    let result = this.normalizeDictationInvisibleChars(originalText)
      .normalize('NFKC')
      .toLowerCase();

    result = this.normalizeTurkishDottedI(result);

    try {
      result = result.replace(this.ARABIC_ALIF_VARIANTS_REGEX, 'ا');
    } catch (e) {
    }

    try {
      result = result.replace(/=/g, ' equals ');
    } catch (e) {
    }

    const allQuotesRegex = /["'""""«»„"\u201C\u201D\u201E\u201F\u2033\u2036]/g;

    result = result
      .replace(this.CURLY_APOS, "'")
      .replace(/['`´]/g, '')
      .replace(allQuotesRegex, '')
      .replace(this.DASHES, ' ')
      .replace(this.PUNCTUATION_REGEX, '')
      .replace(this.ARABIC_DIACRITICS_REGEX, '')
      .replace(/\s+/g, ' ')
      .trim();

    return result ? result.split(' ') : [];
  }

  /**
   * Строит массив display-слов, выровненный по simplifyText(original).
   *
   * Проблема: splitWordsForDisplay оставляет одиночные знаки препинания
   * отдельными токенами (например "..."), а simplifyText их полностью убирает.
   * Из-за этого длина simplOriginal и originalWords не совпадает, и в checkWords
   * индекс i указывал не на то display-слово (последнее слово "обрезалось").
   *
   * Здесь каждый display-токен упрощается отдельно:
   *  - токен без букв ("...") прикрепляется к предыдущему display-слову
   *    (чтобы он всё же отображался: "But ...");
   *  - токен с "=" раскрывается в несколько упрощённых токенов, поэтому
   *    на каждый такой токен возвращаем один и тот же display-токен.
   *
   * @param {string[]} originalWords
   * @returns {string[]} массив display-слов, параллельный simplifyText(original)
   */
  _alignOriginalDisplayWords(originalWords) {
    const aligned = [];
    let pending = '';

    for (const disp of originalWords || []) {
      const simpTokens = this.simplifyText(disp);
      if (!simpTokens.length) {
        // Чистые знаки препинания (например "...") — прикрепляем к предыдущему слову.
        if (aligned.length) {
          aligned[aligned.length - 1] = aligned[aligned.length - 1] + ' ' + disp;
        } else {
          pending += (pending ? ' ' : '') + disp;
        }
        continue;
      }
      for (let k = 0; k < simpTokens.length; k++) {
        if (k === 0 && pending) {
          aligned.push(pending + ' ' + disp);
          pending = '';
        } else {
          aligned.push(disp);
        }
      }
    }

    if (pending && aligned.length) {
      aligned[aligned.length - 1] = aligned[aligned.length - 1] + ' ' + pending;
    }

    return aligned;
  }

  areWordsEquivalent(word1, word2, langCode) {
    if (!word1 || !word2) return false;
    if (word1 === word2) return true;

    // Проверка эквивалентности чисел (цифры ↔ слова)
    if (this._areNumberEquivalent(word1, word2, langCode)) return true;

    try {
      const eq1 = this.EQUIVALENT_WORDS_DICT[word1];
      if (eq1 && Array.isArray(eq1) && eq1.includes(word2)) return true;
      const eq2 = this.EQUIVALENT_WORDS_DICT[word2];
      if (eq2 && Array.isArray(eq2) && eq2.includes(word1)) return true;
    } catch (e) {
    }

    const expansion1 = this.CONTRACTIONS_DICT[word1];
    if (expansion1 && expansion1.length === 1 && expansion1[0] === word2) return true;

    const expansion2 = this.CONTRACTIONS_DICT[word2];
    if (expansion2 && expansion2.length === 1 && expansion2[0] === word1) return true;

    return false;
  }

  findFirstErrorIndex(word1, word2) {
    const len = Math.min(word1.length, word2.length);
    for (let k = 0; k < len; k++) {
      if (word1[k] !== word2[k]) return k;
    }
    return len;
  }

  checkWords(original, userInput, langCode) {
    const simplOriginal = this.simplifyText(original);
    const simplUser = this.simplifyText(userInput);

    const originalWords = this.splitWordsForDisplay(original);
    const userWords = this.splitUserWords(userInput);

    // Выровненный по simplifyText массив display-слов.
    // Без него originalWords[i] может указывать не на то слово
    // (например, когда в предложении есть отдельные знаки "...").
    const displayOrig = this._alignOriginalDisplayWords(originalWords);

    try {
      console.log('[ПроверкаНаОшибки] checkWords start', {
        original,
        userInput,
        langCode,
        simplOriginal,
        simplUser,
        originalWords,
        userWords,
        displayOrig,
      });
    } catch (eLog) {}

    const userVerified = [];
    let i = 0;
    let j = 0;
    let errorCount = 0;

    while (i < simplOriginal.length || j < simplUser.length) {
      const wordOrig = simplOriginal[i];
      const wordUser = simplUser[j];
      const fullWordOrig = displayOrig[i] || originalWords[i] || '';
      const fullWordUser = userWords[j] || '';

      if (wordOrig === wordUser) {
        userVerified.push({ type: 'correct', text: fullWordOrig });
        i++;
        j++;
        continue;
      }

      // Проверка: если слово из оригинала отсутствует в вводе пользователя
      // (ASR мог пропустить слово, например "o'clock")
      if (!this.opts.requireEveryWord && simplOriginal[i + 1] === wordUser) {
        userVerified.push({ type: 'missing', text: fullWordOrig });
        errorCount++;
        i++;
        continue;
      }

      let isEquivalent = false;

      // Проверка эквивалентности чисел (цифры ↔ слова) с учётом языка
      if (this._areNumberEquivalent(wordOrig, wordUser, langCode)) {
        userVerified.push({ type: 'correct', text: fullWordOrig });
        i++;
        j++;
        isEquivalent = true;

        // Если слово из оригинала было числом (словом), а ASR вернул цифры,
        // ASR мог потерять следующие за числом слова (например, "o'clock" после "ten").
        // Проверяем: если следующее слово в оригинале не число и отсутствует в userInput,
        // пропускаем его как опциональное.
        const isUserDigit = this._isDigitString(wordUser) || this._extractDigitPrefix(wordUser) !== null;
        const isOrigDigit = this._isDigitString(wordOrig) || this._extractDigitPrefix(wordOrig) !== null;
        if (isUserDigit && !isOrigDigit) {
          // wordOrig — слово-число (например "ten"), wordUser — цифры (например "10")
          // Смотрим, нет ли в оригинале следующих слов, которые ASR потерял
          while (i < simplOriginal.length) {
            const nextOrig = simplOriginal[i];
            const nextUser = simplUser[j];
            // Если следующее слово в userInput совпадает с текущим в оригинале — выходим
            if (nextUser !== undefined && nextOrig === nextUser) {
              break;
            }
            // Если следующее слово в userInput — число, эквивалентное текущему в оригинале — выходим
            if (nextUser !== undefined && this._areNumberEquivalent(nextOrig, nextUser, langCode)) {
              break;
            }
            // Иначе — ASR потерял это слово, пропускаем
            userVerified.push({ type: 'missing', text: displayOrig[i] || originalWords[i] || '' });
            errorCount++;
            i++;
          }
        }
        continue;
      }

      const expansionOrig = this.CONTRACTIONS_DICT[wordOrig];
      if (expansionOrig && j + expansionOrig.length <= simplUser.length) {
        let matches = true;
        for (let k = 0; k < expansionOrig.length; k++) {
          if (simplUser[j + k] !== expansionOrig[k]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          userVerified.push({ type: 'correct', text: fullWordOrig });
          i++;
          for (let k = 0; k < expansionOrig.length; k++) j++;
          isEquivalent = true;
        }
      }

      if (!isEquivalent) {
        const expansionUser = this.CONTRACTIONS_DICT[wordUser];
        if (expansionUser && i + expansionUser.length <= simplOriginal.length) {
          let matches = true;
          for (let k = 0; k < expansionUser.length; k++) {
            if (simplOriginal[i + k] !== expansionUser[k]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            let fullText = '';
            for (let k = 0; k < expansionUser.length; k++) {
              if (k > 0) fullText += ' ';
              fullText += displayOrig[i + k] || originalWords[i + k] || '';
            }
            userVerified.push({ type: 'correct', text: fullText });
            for (let k = 0; k < expansionUser.length; k++) i++;
            j++;
            isEquivalent = true;
          }
        }
      }

      if (!isEquivalent && this.areWordsEquivalent(wordOrig, wordUser, langCode)) {
        userVerified.push({ type: 'correct', text: fullWordOrig });
        i++;
        j++;
        isEquivalent = true;
      }

      if (!isEquivalent) {
        const errorIndex = this.findFirstErrorIndex(wordOrig || '', wordUser || '');
        userVerified.push({
          type: 'error',
          userText: fullWordUser,
          correctText: fullWordOrig,
          errorIndex,
        });
        errorCount++;
        i++;
        j++;
      }
    }

    try {
      console.log('[ПроверкаНаОшибки] checkWords result', {
        verified: userVerified,
        errorCount,
      });
    } catch (eLog) {}

    return { verified: userVerified, errorCount };
  }

  normalizeForMinLength(raw) {
    try {
      return this.normalizeDictationInvisibleChars(String(raw || ''))
        .toLowerCase()
        .replace(this.ARABIC_ALIF_VARIANTS_REGEX, 'ا')
        .replace(this.PUNCTUATION_REGEX, '')
        .replace(this.ARABIC_DIACRITICS_REGEX, '')
        .replace(/\s+/g, '')
        .trim();
    } catch (e) {
      return String(raw || '')
        .toLowerCase()
        .replace(/[.,!?:;"«»()\[\]{}—–\-]/g, '')
        .replace(this.ARABIC_DIACRITICS_REGEX, '')
        .replace(/\s+/g, '')
        .trim();
    }
  }

  analyze({ originalText, userText, langOriginal, textAttemptCount = 0, prevPerfect = 0, prevCorrected = 0, requiredPassedStarHalf, totalMistakeCount = 0 } = {}) {
    const script = this.getDictationScript(langOriginal);

    const userNorm = this.normalizeForMinLength(userText);
    const origNorm = this.normalizeForMinLength(originalText);

    if (!userNorm) {
      return {
        okToCheck: false,
        noticeKey: 'input_empty',
        noticeMessage: 'Ты ещё ни одной буквы не набрал — что ты хочешь проверять?',
        script,
      };
    }

    const minNeed = Math.ceil((origNorm || '').length / 2);
    if (userNorm.length < minNeed) {
      return {
        okToCheck: false,
        noticeKey: 'input_min_half',
        noticeMessage: 'Введи хотя бы половину предложения, а потом проверяй.',
        script,
        minNeed,
      };
    }

    // Асинхронно загружаем таблицу чисел для языка, если ещё не загружена
    // (не ждём — это не критично для проверки)
    if (langOriginal) {
      this._updateNumberWordsForLang(langOriginal).catch(() => {});
    }

    const { verified, errorCount } = this.checkWords(originalText, userText, langOriginal);
    const allCorrect = verified.every(w => w && w.type === 'correct');

    let nextPerfect = Number(prevPerfect) || 0;
    let nextCorrected = Number(prevCorrected) || 0;
    let starOutcome = null;

    if (allCorrect) {
      const attemptCount = Number(textAttemptCount) || 0;
      if (attemptCount === 0) {
        // Первая проверка — всё правильно с первого раза → звезда
        nextPerfect = 1;
        starOutcome = 'perfect';
      } else if (attemptCount === 1) {
        // Была 1 проверка с ошибками, теперь всё правильно → полузвезда
        nextCorrected = nextCorrected + 1;
        starOutcome = 'half';
      } else {
        // Было 2+ проверок с ошибками, теперь всё правильно → кружочек (активность)
        starOutcome = null;
      }
    }

    return {
      okToCheck: true,
      script,
      verified,
      errorCount,
      allCorrect,
      starOutcome,
      nextPerfect,
      nextCorrected,
    };
  }
}

try {
  window.ПроверкаНаОшибки = ПроверкаНаОшибки;
} catch (e) {
}
