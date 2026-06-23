class РендерПроверки {
  constructor(checker) {
    this.checker = checker || null;
  }

  _getRequireEveryWord() {
    try {
      return !!(this.checker && this.checker.opts && this.checker.opts.requireEveryWord);
    } catch (e) {
      return true;
    }
  }

  _getPunctuationRegex() {
    try {
      return (this.checker && this.checker.PUNCTUATION_REGEX) ? this.checker.PUNCTUATION_REGEX : null;
    } catch (e) {
      return null;
    }
  }

  _splitWordsForDisplay(text) {
    try {
      if (this.checker && typeof this.checker.splitWordsForDisplay === 'function') {
        return this.checker.splitWordsForDisplay(text);
      }
    } catch (e) {
    }
    return String(text || '').trim().split(/\s+/);
  }

  renderResult(originalText, userVerified, correctAnswerDiv) {
    if (!correctAnswerDiv) return;

    const requireEveryWord = this._getRequireEveryWord();
    const PUNCTUATION_REGEX = this._getPunctuationRegex();

    const correctLine = [];
    let foundError = false;
    let originalIndex = 0;

    (userVerified || []).forEach((word) => {
      if (!word || typeof word !== 'object') return;

      if (word.type === 'correct') {
        correctLine.push(`<span class="word-correct">${String(word.text || '')}</span> `);
        originalIndex++;
      } else if (word.type === 'missing') {
        if (requireEveryWord) {
          originalIndex++;
        } else {
          correctLine.push(`<span class="word-missing">${String(word.text || '')}</span> `);
          originalIndex++;
        }
      } else if (word.type === 'error') {
        const correctTextRaw = String(word.correctText || '');
        let correctTextNoPunct = correctTextRaw;
        try {
          if (PUNCTUATION_REGEX) {
            correctTextNoPunct = correctTextNoPunct.replace(PUNCTUATION_REGEX, '');
          }
        } catch (e) {
        }
        correctTextNoPunct = String(correctTextNoPunct || '').toLowerCase();

        const errorIndexInSimplified = Number(word.errorIndex) || 0;
        const errorIndexInOriginal = Math.min(errorIndexInSimplified, Math.max(0, correctTextNoPunct.length - 1));

        const before = correctTextNoPunct.slice(0, errorIndexInOriginal);
        const errorLetter = correctTextNoPunct[errorIndexInOriginal] || '';
        const after = correctTextNoPunct.slice(errorIndexInOriginal + 1);

        const correctHTML =
          `<span class="correct-line-word">` +
          `${before}<span class="correct-line-letter">${errorLetter}</span>${after}` +
          `</span> `;

        correctLine.push(correctHTML);
        originalIndex++;
        foundError = true;
      } else if (word.type === 'raw_user') {
      }
    });

    if (foundError) {
      const remainingWords = this._splitWordsForDisplay(originalText).slice(originalIndex);
      remainingWords.forEach((w) => {
        correctLine.push(`<span>${String(w || '')}</span> `);
      });
    }

    correctAnswerDiv.innerHTML = correctLine.join('');
  }

  renderToEditable(userVerified, inputField) {
    if (!inputField) return;

    const requireEveryWord = this._getRequireEveryWord();

    let html = '';
    let errorFound = false;
    let totalOffset = 0;
    let errorOffset = 0;

    (userVerified || []).forEach((word) => {
      if (!word || typeof word !== 'object') return;

      if (word.type === 'correct') {
        const t = String(word.text || '');
        html += `<span class="word-correct">${t} </span>`;
        totalOffset += t.length + 1;
      } else if (word.type === 'missing') {
        if (requireEveryWord) {
        } else {
          const t = String(word.text || '');
          html += `<span class="word-missing">${t} </span>`;
          totalOffset += t.length + 1;
        }
      } else if (word.type === 'error') {
        const userText = String(word.userText || '');
        const errorIndex = Math.max(0, Number(word.errorIndex) || 0);
        const before = userText.slice(0, errorIndex);
        const wrongLetter = userText[errorIndex] || '';
        const after = userText.slice(errorIndex + 1);

        html += `<span class="word-error">${before}<span class="letter-error">${wrongLetter}</span>${after} </span>`;

        if (!errorFound) {
          errorOffset = totalOffset + before.length + 1;
          errorFound = true;
        }
        totalOffset += userText.length + 1;
      } else if (word.type === 'raw_user') {
        const t = String(word.text || '');
        html += `<span class="word-correct">${t} </span>`;
        totalOffset += t.length + 1;
      }
    });

    inputField.innerHTML = html.trim();
    this._setCursorAtOffset(inputField, errorFound ? errorOffset : totalOffset);
  }

  _setCursorAtOffset(root, offset) {
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      if (!sel) return;
      let currentOffset = 0;

      const walk = (node) => {
        if (!node) return false;
        if (node.nodeType === Node.TEXT_NODE) {
          if (currentOffset + node.length >= offset) {
            range.setStart(node, Math.max(0, offset - currentOffset));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          }
          currentOffset += node.length;
          return false;
        }

        const kids = node.childNodes || [];
        for (let i = 0; i < kids.length; i++) {
          if (walk(kids[i])) return true;
        }
        return false;
      };

      walk(root);
    } catch (e) {
    }
  }
}

try {
  window.РендерПроверки = РендерПроверки;
} catch (e) {
}
