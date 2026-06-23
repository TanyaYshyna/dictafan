(function () {
  'use strict';

  function _sessionKey(dictationId, langTr, exerciseId, subsetSignature) {
    const parts = [dictationId, langTr];
    if (exerciseId) parts.push('ex:' + exerciseId);
    if (subsetSignature) parts.push('sub:' + subsetSignature);
    return parts.join('::');
  }

  function _normalizeSubsetPositions(arr) {
    if (!Array.isArray(arr)) return [];
    const nums = arr.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }).filter((v) => v !== null && v > 0);
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  }

  class DictationContent {
    constructor({ dictationId, langOrig, langTr, sentences }) {
      this.dictationId = dictationId;
      this.langOrig = langOrig;
      this.langTr = langTr;
      this._sentences = [];
      if (Array.isArray(sentences)) {
        this.setSentences(sentences);
      }
    }

    setSentences(sentences) {
      if (!Array.isArray(sentences)) return;
      this._sentences = sentences.map((s, idx) => {
        const key = (s && s.key) ? String(s.key) : String(idx);
        const position = (s && s.position != null) ? Number(s.position) : null;
        const text_original = (s && s.text_original != null) ? String(s.text_original) : ((s && s.text != null) ? String(s.text) : ((s && s.original != null) ? String(s.original) : ''));
        const text_translation = (s && s.text_translation != null) ? String(s.text_translation) : ((s && s.translation != null) ? String(s.translation) : '');
        const audio_original = (s && s.audio_original != null) ? String(s.audio_original) : ((s && s.audio != null) ? String(s.audio) : '');
        const audio_translation = (s && s.audio_translation != null) ? String(s.audio_translation) : ((s && s.audio_tr != null) ? String(s.audio_tr) : '');
        return {
          key,
          position: Number.isFinite(position) ? position : null,
          text_original,
          text_translation,
          audio_original,
          audio_translation,
        };
      });
    }

    getAllKeys() {
      return this._sentences.map((s) => s.key);
    }

    getAllSentenceCores() {
      return this._sentences.slice();
    }

    getSentence(key) {
      const k = String(key);
      return this._sentences.find((s) => s.key === k) || null;
    }

    toJSON() {
      return {
        dictationId: this.dictationId,
        langOrig: this.langOrig,
        langTr: this.langTr,
        sentences: this._sentences,
      };
    }

    static fromJSON(data) {
      return new DictationContent(data);
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

      // Дата начала диктанта (локальная, без времени) — устанавливается при старте
      this.dateStart = null;

      // Количество успешных завершений этого упражнения (диктант + позиции)
      this.completionCount = 0;

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
            money_count: 0, // Текущий баланс монет за предложение (earned - spent)
            money_earned: 0, // Сколько монет заработано за предложение (начисления)
            money_spent: 0, // Сколько монет потрачено за предложение (покупки)
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
        money_count: 0, // Текущий баланс монет за предложение (earned - spent)
        money_earned: 0, // Сколько монет заработано за предложение (начисления)
        money_spent: 0, // Сколько монет потрачено за предложение (покупки)
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
      const allKeys = this.content ? this.content.getAllKeys() : [];
      let hasChecked = false;
      for (const k of allKeys) {
        if (!this.isActiveKey(k)) continue;
        const st = this.getState(k);
        if (st.selection_state === 'checked') {
          hasChecked = true;
          break;
        }
      }
      if (!hasChecked) {
        for (const k of allKeys) {
          if (!this.isActiveKey(k)) continue;
          const st = this.getState(k);
          st.selection_state = 'checked';
        }
        this._rebuildSelectedKeysFromStates();
      }
    }

    getSerialNumber(key) {
      const all = this.content ? this.content.getAllKeys() : [];
      const idx = all.indexOf(String(key));
      return idx >= 0 ? idx + 1 : 0;
    }

    setCurrentByKey(key) {
      const k = String(key);
      const idx = this.selectedKeys.indexOf(k);
      if (idx >= 0) {
        this.currentSelectedIndex = idx;
      }
    }

    getCurrentKey() {
      if (this.selectedKeys.length === 0) return null;
      if (this.currentSelectedIndex < 0 || this.currentSelectedIndex >= this.selectedKeys.length) {
        this.currentSelectedIndex = 0;
      }
      return this.selectedKeys[this.currentSelectedIndex];
    }

    goNext() {
      if (this.selectedKeys.length === 0) return null;
      if (this.currentSelectedIndex < this.selectedKeys.length - 1) {
        this.currentSelectedIndex += 1;
      }
      return this.getCurrentKey();
    }

    goPrev() {
      if (this.selectedKeys.length === 0) return null;
      if (this.currentSelectedIndex > 0) {
        this.currentSelectedIndex -= 1;
      }
      return this.getCurrentKey();
    }

    getSentenceView(key) {
      if (!this.content) return null;
      return this.content.getSentence(key);
    }

    startTimer() {
      if (this.timer.running) return;
      this.timer.running = true;
      this.timer.startedAtMs = Date.now();
    }

    stopTimer() {
      if (!this.timer.running) return;
      const elapsed = Date.now() - this.timer.startedAtMs;
      this.timer.accumulatedMs += elapsed;
      this.timer.running = false;
    }

    getElapsedMs() {
      if (this.timer.running) {
        return this.timer.accumulatedMs + (Date.now() - this.timer.startedAtMs);
      }
      return this.timer.accumulatedMs;
    }

    addTimeToSentence(key, ms) {
      const st = this.getState(key);
      st.time_count = (Number(st.time_count) || 0) + ms;
    }

    toJSON() {
      const stateObj = {};
      for (const [k, v] of this._stateByKey) {
        stateObj[k] = v;
      }
      return {
        dictationId: this.dictationId,
        exerciseId: this.exerciseId,
        subsetPositions: this.subsetPositions,
        subsetSignature: this.subsetSignature,
        activeKeys: this.activeKeys,
        selectedKeys: this.selectedKeys,
        currentSelectedIndex: this.currentSelectedIndex,
        stateByKey: stateObj,
        dateStart: this.dateStart,
        completed: this.completed === true ? true : undefined,
        completionCount: Number(this.completionCount) || 0,
        timer: {
          running: this.timer.running,
          startedAtMs: this.timer.startedAtMs,
          accumulatedMs: this.timer.accumulatedMs,
        },
      };
    }

    static fromJSON(data, content) {
      const s = new DictationSession({
        content: content || null,
        exerciseId: data.exerciseId || null,
        subsetPositions: data.subsetPositions || null,
      });
      s.activeKeys = data.activeKeys || null;
      s.selectedKeys = data.selectedKeys || [];
      s.currentSelectedIndex = data.currentSelectedIndex || 0;
      s.dateStart = data.dateStart || null;
      if (data.completed === true) {
        s.completed = true;
      }
      if (data.stateByKey) {
        for (const [k, v] of Object.entries(data.stateByKey)) {
          s._stateByKey.set(k, { ...v });
        }
      }
      if (data.timer) {
        s.timer.running = !!data.timer.running;
        s.timer.startedAtMs = Number(data.timer.startedAtMs) || 0;
        s.timer.accumulatedMs = Number(data.timer.accumulatedMs) || 0;
      }
      if (data.completionCount != null) {
        s.completionCount = Number(data.completionCount) || 0;
      }
      return s;
    }
  }

  class DictationSessionsStore {
    constructor() {
      this._contents = new Map();
      this._sessions = new Map();
      this._maxSessions = 20;
    }

    getOrCreateContent({ dictationId, langTr }) {
      const key = dictationId + '::' + langTr;
      if (!this._contents.has(key)) {
        this._contents.set(key, new DictationContent({ dictationId, langTr }));
      }
      return this._contents.get(key);
    }

    setContentSentences({ dictationId, langTr, sentences }) {
      const content = this.getOrCreateContent({ dictationId, langTr });
      content.setSentences(sentences);
      return content;
    }

    getOrCreateSession({ dictationId, langTr, exerciseId = null, subsetPositions = null, subsetSignature = null }) {
      const content = this.getOrCreateContent({ dictationId, langTr });
      const sig = subsetSignature || (subsetPositions ? _normalizeSubsetPositions(subsetPositions).join(',') : null);
      const key = _sessionKey(dictationId, langTr, exerciseId, sig);
      if (!this._sessions.has(key)) {
        const session = new DictationSession({
          content,
          exerciseId,
          subsetPositions: subsetPositions || (sig ? sig.split(',').map(Number) : null),
        });
        this._sessions.set(key, session);
        this._evictIfNeeded(1);
      }
      const session = this._sessions.get(key);
      // Если сессия уже существовала (например, восстановлена из IDB) и у неё нет activeKeys,
      // а мы запрашиваем с subsetPositions — обновляем activeKeys при следующем вызове ensureDefaultSelection
      session.touch();
      return session;
    }

    getContent({ dictationId, langTr }) {
      const key = dictationId + '::' + langTr;
      return this._contents.get(key) || null;
    }

    getSession({ dictationId, langTr, exerciseId = null, subsetSignature = null }) {
      const key = _sessionKey(dictationId, langTr, exerciseId, subsetSignature);
      return this._sessions.get(key) || null;
    }

    removeSession({ dictationId, langTr, exerciseId = null, subsetSignature = null }) {
      const key = _sessionKey(dictationId, langTr, exerciseId, subsetSignature);
      this._sessions.delete(key);
    }

    async removeSessionFromIdb({ dictationId, langTr, exerciseId = null, subsetSignature = null }) {
      try {
        if (!window.IdbManager || typeof window.IdbManager.idbDelete !== 'function') return;
        const key = _sessionKey(dictationId, langTr, exerciseId, subsetSignature);
        await window.IdbManager.idbDelete('sessions', key);
      } catch (e) {
        // silent
      }
    }

    closeAll() {
      this._sessions.clear();
      this._contents.clear();
    }

    _evictIfNeeded(incomingCount) {
      if (this._sessions.size + incomingCount <= this._maxSessions) return;
      const entries = Array.from(this._sessions.entries())
        .map(([k, v]) => ({ key: k, session: v, lastUsed: v.lastUsedAtMs || 0 }))
        .sort((a, b) => a.lastUsed - b.lastUsed);
      const toRemove = this._sessions.size + incomingCount - this._maxSessions;
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this._sessions.delete(entries[i].key);
      }
    }

    async persistToIdb() {
      // Сериализуем вызовы: если persist уже выполняется, ждём его,
      // чтобы не было гонок и потери данных при конкурентных вызовах.
      if (this._persistPromise) {
        try {
          await this._persistPromise;
        } catch (e) {
          // ignore
        }
      }
      this._persistPromise = this._doPersistToIdb();
      try {
        await this._persistPromise;
      } finally {
        this._persistPromise = null;
      }
    }

    async _doPersistToIdb() {
      try {
        if (!window.IdbManager || typeof window.IdbManager.idbPut !== 'function') return;
        for (const [key, session] of this._sessions) {
          const data = session.toJSON();
          // Сохраняем langTr отдельно, чтобы при восстановлении создать правильный контент
          const langTr = session.content ? session.content.langTr : '';
          await window.IdbManager.idbPut('sessions', {
            key,
            dictationId: session.dictationId,
            langTr: langTr,
            data: JSON.stringify(data),
            updatedAt: Date.now(),
          });
        }
      } catch (e) {
        // silent
      }
    }

    async restoreFromIdb() {
      try {
        if (!window.IdbManager || typeof window.IdbManager.idbGetAll !== 'function') return;
        const records = await window.IdbManager.idbGetAll('sessions');
        if (!Array.isArray(records)) return;
        for (const rec of records) {
          try {
            const data = JSON.parse(rec.data);
            const dictId = data.dictationId || rec.dictationId;
            if (!dictId) continue;
            // Используем langTr из записи, если есть, иначе из данных сессии
            const langTr = String(rec.langTr || data.langTr || '').trim();
            const content = this.getOrCreateContent({ dictationId: dictId, langTr });
            // Если контент пустой (нет предложений) — не восстанавливаем сессию,
            // она будет создана заново при открытии диктанта
            const allKeys = content ? content.getAllKeys() : [];
            if (!allKeys.length) continue;
            const session = DictationSession.fromJSON(data, content);
            // Используем ключ из IDB записи, чтобы при повторном открытии
            // getOrCreateSession мог найти эту сессию по правильному ключу
            this._sessions.set(rec.key, session);
          } catch (e) {
            // skip corrupt record
          }
        }
      } catch (e) {
        // silent
      }
    }

    async clearIdbSessions() {
      try {
        if (!window.IdbManager || typeof window.IdbManager.idbDeleteAll !== 'function') return;
        await window.IdbManager.idbDeleteAll('sessions');
      } catch (e) {
        // silent
      }
    }
  }

  function _nowMs() {
    return Date.now();
  }

  window.DictationRuntime = {
    DictationContent,
    DictationSession,
    DictationSessionsStore,
  };
})();
