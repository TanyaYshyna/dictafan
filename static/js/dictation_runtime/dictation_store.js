(function () {
  const MAX_OPEN_SESSIONS = 5;

  function _nowMs() {
    return Date.now();
  }

  function _contentKey(dictationId, langTr) {
    return String(dictationId || '') + '|' + String(langTr || '');
  }

  function _sessionKey(dictationId, langTr, exerciseId, subsetSignature) {
    const base = _contentKey(dictationId, langTr);
    if (exerciseId != null && exerciseId !== '') return base + '|ex:' + String(exerciseId);
    if (subsetSignature != null && subsetSignature !== '') return base + '|sub:' + String(subsetSignature);
    return base + '|ex:none';
  }

  function _normalizeSubsetPositions(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const uniq = Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
    uniq.sort((a, b) => a - b);
    return uniq.length ? uniq : null;
  }

  function _safeStr(x) {
    return x == null ? '' : String(x);
  }

  class DictationContent {
    constructor({ dictationId, langTr }) {
      this.dictationId = _safeStr(dictationId);
      this.langTr = _safeStr(langTr);

      this._byKey = new Map();
      this._allKeys = [];
      this.loadedAtMs = 0;
    }

    get key() {
      return _contentKey(this.dictationId, this.langTr);
    }

    setSentences(sentences) {
      const list = Array.isArray(sentences) ? sentences : [];
      this._byKey = new Map();
      const normalized = [];

      for (const raw of list) {
        if (!raw) continue;
        const key = raw.key != null ? String(raw.key) : '';
        if (!key) continue;

        const position = Number(raw.position);

        const core = {
          key,
          position: Number.isFinite(position) ? position : null,
          text_original: raw.text_original != null ? String(raw.text_original) : (raw.text != null ? String(raw.text) : ''),
          text_translation: raw.text_translation != null ? String(raw.text_translation) : (raw.translation != null ? String(raw.translation) : ''),
          audio_original: raw.audio_original != null ? String(raw.audio_original) : (raw.audio != null ? String(raw.audio) : ''),
          audio_translation: raw.audio_translation != null
            ? String(raw.audio_translation)
            : (raw.audio_tr != null
              ? String(raw.audio_tr)
              : (raw.audio_translation_url != null ? String(raw.audio_translation_url) : '')),
        };

        this._byKey.set(key, core);
        normalized.push(core);
      }

      normalized.sort((a, b) => String(a.key).localeCompare(String(b.key)));
      this._allKeys = normalized.map((s) => s.key);
      this.loadedAtMs = _nowMs();
    }

    has(key) {
      return this._byKey.has(String(key));
    }

    getSentenceCore(key) {
      return this._byKey.get(String(key)) || null;
    }

    getAllKeys() {
      return this._allKeys.slice();
    }

    getAllSentenceCores() {
      return this._allKeys.map((k) => this._byKey.get(k)).filter(Boolean);
    }

    /** Сериализация для сохранения в IndexedDB */
    toJSON() {
      return {
        dictationId: this.dictationId,
        langTr: this.langTr,
        loadedAtMs: this.loadedAtMs,
        sentences: this.getAllSentenceCores(),
      };
    }

    /** Восстановление из сохранённого объекта */
    static fromJSON(data) {
      if (!data) return null;
      const c = new DictationContent({ dictationId: data.dictationId, langTr: data.langTr });
      if (Array.isArray(data.sentences)) {
        c.setSentences(data.sentences);
      }
      c.loadedAtMs = data.loadedAtMs || 0;
      return c;
    }
  }

  class DictationSession {
    constructor({ content, exerciseId = null, subsetPositions = null }) {
      this.content = content;
      this.dictationId = content ? content.dictationId : null;

      this.exerciseId = (exerciseId != null && exerciseId !== '') ? String(exerciseId) : null;
      this.subsetPositions = _normalizeSubsetPositions(subsetPositions);
      this.subsetSignature = this.subsetPositions ? this.subsetPositions.join(',') : null;

      this.activeKeys = null;
      this.selectedKeys = [];
      this.currentSelectedIndex = 0;

      this._stateByKey = new Map();

      this.timer = {
        running: false,
        startedAtMs: 0,
        accumulatedMs: 0,
      };

      this.lastUsedAtMs = _nowMs();
    }

    touch() {
      this.lastUsedAtMs = _nowMs();
    }

    get key() {
      const dictId = this.content ? this.content.dictationId : '';
      const langTr = this.content ? this.content.langTr : '';
      return _sessionKey(dictId, langTr, this.exerciseId, this.exerciseId ? null : this.subsetSignature);
    }

    _ensureStateForKnownKeys() {
      const all = this.content ? this.content.getAllKeys() : [];
      for (const k of all) {
        if (!this._stateByKey.has(k)) {
          this._stateByKey.set(k, {
            number_of_perfect: 0, // Кол-во полученных «звёзд» за предложение (perfect)
            number_of_corrected: 0, // Кол-во полученных «полузвёзд» за предложение (corrected)
            number_of_audio: 0, // Кол-во успешно выполненных повторов по микрофону
            number_of_time: 0, // Служебный счётчик времени/попыток (legacy поле)
            mistake_count: 0, // Суммарные ошибки (накопительно)
            mistake_count_current: 0, // Ошибки в текущей попытке/проверке
            text_activity_count: 0,
            audio_activity50_count: 0,
            money_count: 0,
            text_exchange_half_star: false, // Флаг: half-star был получен через «покупку» за text_activity_count
            audio_exchange_mic: false, // Флаг: микрофон был получен через «покупку» за audio_activity50_count
            selection_state: 'unchecked', // unchecked | checked | completed — состояние выбора/прохождения в списке
            all_audio_completed: false, // Служебный флаг (legacy): микрофон полностью завершён
            time_count: 0, // Накопительное время выполнения предложения в миллисекундах
            number_of_characters: 0, // Количество символов в предложении (без знаков препинания, с пробелами)
          });
        }
      }
    }

    getState(key) {
      const k = String(key);
      const st = this._stateByKey.get(k);
      if (st) return st;
      const init = {
        number_of_perfect: 0, // Кол-во полученных «звёзд» за предложение (perfect)
        number_of_corrected: 0, // Кол-во полученных «полузвёзд» за предложение (corrected)
        number_of_audio: 0, // Кол-во успешно выполненных повторов по микрофону
        number_of_time: 0, // Служебный счётчик времени/попыток (legacy поле)
        mistake_count: 0, // Суммарные ошибки (накопительно)
        mistake_count_current: 0, // Ошибки в текущей попытке/проверке
        text_activity_count: 0,
        audio_activity50_count: 0,
        money_count: 0,
        number_of_characters: 0, // Количество символов в предложении (без знаков препинания, с пробелами)
        text_exchange_half_star: false, // Флаг: half-star был получен через «покупку» за text_activity_count
        audio_exchange_mic: false, // Флаг: микрофон был получен через «покупку» за audio_activity50_count
        selection_state: 'unchecked', // unchecked | checked | completed — состояние выбора/прохождения в списке
        all_audio_completed: false, // Служебный флаг (legacy): микрофон полностью завершён
        time_count: 0, // Накопительное время выполнения предложения в миллисекундах
      };
      this._stateByKey.set(k, init);
      return init;
    }

    setActiveSubsetByKeys(keys) {
      const list = Array.isArray(keys) ? keys.map((k) => String(k)).filter(Boolean) : [];
      this.activeKeys = Array.from(new Set(list));
      this._ensureStateForKnownKeys();
      this._rebuildSelectedKeysFromStates();
      this.touch();
    }

    isActiveKey(key) {
      const k = String(key);
      if (!this.activeKeys) return true;
      return this.activeKeys.includes(k);
    }

    setSelectionState(key, state) {
      const k = String(key);
      if (!this.isActiveKey(k)) return;
      const st = this.getState(k);
      const s = String(state);
      if (s === 'unchecked' || s === 'checked' || s === 'completed') {
        st.selection_state = s;
      }
      this._rebuildSelectedKeysFromStates();
      this.touch();
    }

    _rebuildSelectedKeysFromStates() {
      this._ensureStateForKnownKeys();
      const allKeys = this.content ? this.content.getAllKeys() : [];
      const selected = [];
      for (const k of allKeys) {
        if (!this.isActiveKey(k)) continue;
        const st = this.getState(k);
        if (st.selection_state === 'checked') selected.push(k);
      }
      this.selectedKeys = selected;
      if (this.currentSelectedIndex >= this.selectedKeys.length) {
        this.currentSelectedIndex = Math.max(0, this.selectedKeys.length - 1);
      }
    }

    ensureDefaultSelection() {
      this._ensureStateForKnownKeys();
      this._rebuildSelectedKeysFromStates();

      if (this.selectedKeys.length > 0) return;

      const allKeys = this.content ? this.content.getAllKeys() : [];
      let changed = false;
      for (const k of allKeys) {
        if (!this.isActiveKey(k)) continue;
        const st = this.getState(k);
        if (st.selection_state !== 'completed') {
          st.selection_state = 'checked';
          changed = true;
        }
      }

      if (changed) {
        this._rebuildSelectedKeysFromStates();
      }
      this.touch();
    }

    getSerialNumber(key) {
      const k = String(key);
      const idx = this.selectedKeys.indexOf(k);
      return idx >= 0 ? (idx + 1) : 0;
    }

    setCurrentByKey(key) {
      const k = String(key);
      const idx = this.selectedKeys.indexOf(k);
      if (idx >= 0) {
        this.currentSelectedIndex = idx;
        this.touch();
      }
    }

    getCurrentKey() {
      if (!this.selectedKeys.length) return null;
      return this.selectedKeys[this.currentSelectedIndex] || null;
    }

    goNext() {
      if (!this.selectedKeys.length) return null;
      if (this.currentSelectedIndex < this.selectedKeys.length - 1) {
        this.currentSelectedIndex += 1;
        this.touch();
      }
      return this.getCurrentKey();
    }

    goPrev() {
      if (!this.selectedKeys.length) return null;
      if (this.currentSelectedIndex > 0) {
        this.currentSelectedIndex -= 1;
        this.touch();
      }
      return this.getCurrentKey();
    }

    getSentenceView(key) {
      const core = this.content ? this.content.getSentenceCore(key) : null;
      if (!core) return null;
      const st = this.getState(core.key);
      return Object.assign({}, core, st, {
        serial_number: this.getSerialNumber(core.key),
      });
    }

    startTimer() {
      if (this.timer.running) return;
      this.timer.running = true;
      this.timer.startedAtMs = _nowMs();
      this.touch();
    }

    stopTimer() {
      if (!this.timer.running) return;
      const now = _nowMs();
      const delta = Math.max(0, now - (this.timer.startedAtMs || now));
      this.timer.running = false;
      this.timer.startedAtMs = 0;
      this.timer.accumulatedMs += delta;
      this.touch();
    }

    getElapsedMs() {
      if (!this.timer.running) return this.timer.accumulatedMs || 0;
      const now = _nowMs();
      const delta = Math.max(0, now - (this.timer.startedAtMs || now));
      return (this.timer.accumulatedMs || 0) + delta;
    }

    addTimeToSentence(key, ms) {
      const k = String(key);
      const add = Number(ms) || 0;
      if (add <= 0) return;
      const st = this.getState(k);
      st.number_of_time = (Number(st.number_of_time) || 0) + add;
      this.touch();
    }

    /** Сериализация сессии для сохранения в IndexedDB */
    toJSON() {
      const stateByKeyObj = {};
      this._stateByKey.forEach((val, key) => {
        stateByKeyObj[key] = Object.assign({}, val);
      });

      return {
        contentKey: this.content ? this.content.key : null,
        exerciseId: this.exerciseId,
        subsetPositions: this.subsetPositions,
        subsetSignature: this.subsetSignature,
        activeKeys: this.activeKeys ? this.activeKeys.slice() : null,
        selectedKeys: this.selectedKeys.slice(),
        currentSelectedIndex: this.currentSelectedIndex,
        stateByKey: stateByKeyObj,
        timer: {
          running: false, // не сохраняем running — восстановим как остановленный
          startedAtMs: 0,
          accumulatedMs: this.timer.accumulatedMs || 0,
        },
        lastUsedAtMs: this.lastUsedAtMs,
      };
    }

    /** Восстановление сессии из сохранённого объекта */
    static fromJSON(data, content) {
      if (!data || !content) return null;
      const s = new DictationSession({
        content,
        exerciseId: data.exerciseId || null,
        subsetPositions: data.subsetPositions || null,
      });

      if (Array.isArray(data.activeKeys)) {
        s.activeKeys = data.activeKeys.slice();
      }
      if (Array.isArray(data.selectedKeys)) {
        s.selectedKeys = data.selectedKeys.slice();
      }
      s.currentSelectedIndex = Number(data.currentSelectedIndex) || 0;

      // Восстанавливаем stateByKey
      if (data.stateByKey && typeof data.stateByKey === 'object') {
        Object.keys(data.stateByKey).forEach((k) => {
          s._stateByKey.set(k, Object.assign({}, data.stateByKey[k]));
        });
      }

      // Восстанавливаем таймер (всегда остановленный)
      s.timer.running = false;
      s.timer.startedAtMs = 0;
      s.timer.accumulatedMs = Number(data.timer && data.timer.accumulatedMs) || 0;

      s.lastUsedAtMs = Number(data.lastUsedAtMs) || _nowMs();

      return s;
    }
  }

  class DictationSessionsStore {
    constructor({ maxSessions = MAX_OPEN_SESSIONS } = {}) {
      this.maxSessions = Number(maxSessions) || MAX_OPEN_SESSIONS;
      this._contents = new Map();
      this._sessions = new Map();
    }

    getContentKey(dictationId, langTr) {
      return _contentKey(dictationId, langTr);
    }

    getSessionKey({ dictationId, langTr, exerciseId = null, subsetSignature = null }) {
      return _sessionKey(dictationId, langTr, exerciseId, subsetSignature);
    }

    getOrCreateContent({ dictationId, langTr }) {
      const k = _contentKey(dictationId, langTr);
      const existing = this._contents.get(k);
      if (existing) return existing;
      const c = new DictationContent({ dictationId, langTr });
      this._contents.set(k, c);
      return c;
    }

    getContent({ dictationId, langTr }) {
      return this._contents.get(_contentKey(dictationId, langTr)) || null;
    }

    setContentSentences({ dictationId, langTr, sentences }) {
      const c = this.getOrCreateContent({ dictationId, langTr });
      c.setSentences(sentences);
      return c;
    }

    getOrCreateSession({ dictationId, langTr, exerciseId = null, subsetPositions = null, subsetSignature = null }) {
      const content = this.getOrCreateContent({ dictationId, langTr });

      const normalizedSubset = _normalizeSubsetPositions(subsetPositions);
      const signature = subsetSignature != null ? String(subsetSignature) : (normalizedSubset ? normalizedSubset.join(',') : null);
      const sk = _sessionKey(dictationId, langTr, exerciseId, signature);

      const existing = this._sessions.get(sk);
      if (existing) {
        existing.touch();
        return existing;
      }

      this._evictIfNeeded(1);

      const s = new DictationSession({ content, exerciseId, subsetPositions: normalizedSubset });
      this._sessions.set(sk, s);
      return s;
    }

    getSession({ dictationId, langTr, exerciseId = null, subsetSignature = null }) {
      const sk = _sessionKey(dictationId, langTr, exerciseId, subsetSignature);
      return this._sessions.get(sk) || null;
    }

    closeSessionByKey(sessionKey) {
      this._sessions.delete(String(sessionKey));
    }

    closeAll() {
      this._sessions.clear();
      this._contents.clear();
    }

    listSessions() {
      return Array.from(this._sessions.values());
    }

    _evictIfNeeded(incomingCount) {
      const need = (this._sessions.size + (incomingCount || 0)) - this.maxSessions;
      if (need <= 0) return;

      const entries = Array.from(this._sessions.entries());
      entries.sort((a, b) => {
        const at = a[1] && a[1].lastUsedAtMs ? a[1].lastUsedAtMs : 0;
        const bt = b[1] && b[1].lastUsedAtMs ? b[1].lastUsedAtMs : 0;
        return at - bt;
      });

      for (let i = 0; i < need; i++) {
        const e = entries[i];
        if (!e) continue;
        const session = e[1];
        this._sessions.delete(e[0]);

        // Если после удаления сессии на контент больше нет ссылок — удаляем контент и чистим кэш
        if (session && session.content && session.content.key) {
          const contentKey = session.content.key;
          const hasOtherSessions = Array.from(this._sessions.values()).some(
            (s) => s && s.content && s.content.key === contentKey
          );
          if (!hasOtherSessions) {
            const dictationId = session.content.dictationId;
            // Удаляем контент из памяти
            this._contents.delete(contentKey);
            // Чистим blob URL'ы в AudioManager для этого диктанта
            if (dictationId && window.AudioManager && typeof window.AudioManager.revokeDictationBlobUrls === 'function') {
              window.AudioManager.revokeDictationBlobUrls(dictationId);
            }
          }
        }
      }
    }

    /** Сохранить все сессии и контенты в IndexedDB */
    async persistToIdb() {
      if (typeof window.IdbManager === 'undefined') return;

      // Сохраняем контенты
      const contents = Array.from(this._contents.values());
      for (const content of contents) {
        try {
          await window.IdbManager.idbPut('sessions', {
            key: 'content:' + content.key,
            type: 'content',
            data: content.toJSON(),
            savedAt: _nowMs(),
          });
        } catch (e) {
          // ignore
        }
      }

      // Сохраняем сессии
      const sessions = Array.from(this._sessions.values());
      for (const session of sessions) {
        try {
          await window.IdbManager.idbPut('sessions', {
            key: 'session:' + session.key,
            type: 'session',
            data: session.toJSON(),
            savedAt: _nowMs(),
          });
        } catch (e) {
          // ignore
        }
      }
    }

    /** Восстановить сессии и контенты из IndexedDB */
    async restoreFromIdb() {
      if (typeof window.IdbManager === 'undefined') return;

      const allRecords = await window.IdbManager.idbGetAll('sessions');
      if (!Array.isArray(allRecords)) return;

      // Сначала восстанавливаем контенты
      const contentRecords = allRecords.filter((r) => r && r.type === 'content');
      for (const rec of contentRecords) {
        try {
          const c = DictationContent.fromJSON(rec.data);
          if (c) {
            this._contents.set(c.key, c);
          }
        } catch (e) {
          // ignore
        }
      }

      // Потом восстанавливаем сессии (ссылаются на контенты)
      const sessionRecords = allRecords.filter((r) => r && r.type === 'session');
      for (const rec of sessionRecords) {
        try {
          const data = rec.data;
          if (!data || !data.contentKey) continue;
          const content = this._contents.get(data.contentKey);
          if (!content) continue;
          const s = DictationSession.fromJSON(data, content);
          if (s) {
            this._sessions.set(s.key, s);
          }
        } catch (e) {
          // ignore
        }
      }
    }

    /** Очистить сохранённые сессии в IndexedDB */
    async clearIdbSessions() {
      if (typeof window.IdbManager === 'undefined') return;
      const allRecords = await window.IdbManager.idbGetAll('sessions');
      if (!Array.isArray(allRecords)) return;
      for (const rec of allRecords) {
        try {
          if (rec && rec.key) {
            await window.IdbManager.idbDelete('sessions', rec.key);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.DictationRuntime = {
      MAX_OPEN_SESSIONS,
      DictationContent,
      DictationSession,
      DictationSessionsStore,
      normalizeSubsetPositions: _normalizeSubsetPositions,
      makeSubsetSignature: (arr) => {
        const n = _normalizeSubsetPositions(arr);
        return n ? n.join(',') : '';
      },
    };
  }
})();
