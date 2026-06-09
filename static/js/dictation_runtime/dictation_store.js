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
  }

  class DictationSession {
    constructor({ content, exerciseId = null, subsetPositions = null }) {
      this.content = content;

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
            number_of_perfect: 0,
            number_of_corrected: 0,
            number_of_audio: 0,
            number_of_time: 0,
            mistake_count: 0,
            mistake_count_current: 0,
            text_coin_count: 0,
            audio_coin_count: 0,
            text_exchange_half_star: false,
            audio_exchange_mic: false,
            selection_state: 'unchecked',
            all_audio_completed: false,
          });
        }
      }
    }

    getState(key) {
      const k = String(key);
      const st = this._stateByKey.get(k);
      if (st) return st;
      const init = {
        number_of_perfect: 0,
        number_of_corrected: 0,
        number_of_audio: 0,
        number_of_time: 0,
        mistake_count: 0,
        mistake_count_current: 0,
        text_coin_count: 0,
        audio_coin_count: 0,
        text_exchange_half_star: false,
        audio_exchange_mic: false,
        selection_state: 'unchecked',
        all_audio_completed: false,
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
        this._sessions.delete(e[0]);
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
