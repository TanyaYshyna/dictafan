class ПроверкаНаОшибки {
  constructor(opts = {}) {
    this.opts = {
      requireEveryWord: true,
      requiredPassedStarHalf: 3,
      ...opts,
    };

    this._initRegexes();
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

  areWordsEquivalent(word1, word2) {
    if (!word1 || !word2) return false;
    if (word1 === word2) return true;

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

  checkWords(original, userInput) {
    const simplOriginal = this.simplifyText(original);
    const simplUser = this.simplifyText(userInput);

    const originalWords = this.splitWordsForDisplay(original);
    const userWords = this.splitUserWords(userInput);

    const userVerified = [];
    let i = 0;
    let j = 0;
    let errorCount = 0;

    while (i < simplOriginal.length || j < simplUser.length) {
      const wordOrig = simplOriginal[i];
      const wordUser = simplUser[j];
      const fullWordOrig = originalWords[i] || '';
      const fullWordUser = userWords[j] || '';

      if (wordOrig === wordUser) {
        userVerified.push({ type: 'correct', text: fullWordOrig });
        i++;
        j++;
        continue;
      }

      if (!this.opts.requireEveryWord && simplOriginal[i + 1] === wordUser) {
        userVerified.push({ type: 'missing', text: fullWordOrig });
        errorCount++;
        i++;
        continue;
      }

      let isEquivalent = false;

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
              fullText += originalWords[i + k] || '';
            }
            userVerified.push({ type: 'correct', text: fullText });
            for (let k = 0; k < expansionUser.length; k++) i++;
            j++;
            isEquivalent = true;
          }
        }
      }

      if (!isEquivalent && this.areWordsEquivalent(wordOrig, wordUser)) {
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

  analyze({ originalText, userText, langOriginal, textAttemptCount = 0, prevPerfect = 0, prevCorrected = 0, requiredPassedStarHalf } = {}) {
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

    const { verified, errorCount } = this.checkWords(originalText, userText);
    const allCorrect = verified.every(w => w && w.type === 'correct');

    let nextPerfect = Number(prevPerfect) || 0;
    let nextCorrected = Number(prevCorrected) || 0;
    let starOutcome = null;

    const shouldGrantHalfStar = (textLen, mistakes) => {
      let result = false;
      const len = Number(textLen) || 0;
      const err = Number(mistakes) || 0;
      if (len <= 25) {
        if (err === 1) result = true;
      } else {
        if (err <= 2) result = true;
      }
      return result;
    };

    if (allCorrect) {
      if (nextPerfect === 1) {
        nextCorrected = nextCorrected + 1;
        starOutcome = 'corrected';
      } else if ((Number(textAttemptCount) || 0) === 0) {
        nextPerfect = 1;
        starOutcome = 'perfect';
      } else {
        // Если пользователь исправил все ошибки, errorCount = 0.
        // Но для полузвезды нужно учитывать, сколько ошибок БЫЛО до исправления.
        // Используем textAttemptCount как индикатор того, что ошибки были:
        // если была хотя бы одна неудачная попытка, значит ошибки были.
        // Считаем, что было 1+ ошибок (иначе не было бы неудачной попытки).
        const originalLen = String(originalText || '').length;
        // Если errorCount = 0 (всё исправлено), но textAttemptCount > 0 (были ошибки),
        // то считаем что была минимум 1 ошибка для целей полузвезды.
        const effectiveErrors = errorCount > 0 ? errorCount : 1;
        if (shouldGrantHalfStar(originalLen, effectiveErrors)) {
          nextCorrected = nextCorrected + 1;
          starOutcome = 'half';
        } else {
          starOutcome = null;
        }
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
