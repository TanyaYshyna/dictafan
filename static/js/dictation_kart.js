// Локальный escapeHtml на случай, если window.escapeHtml ещё не определён
function _localEscapeHtml(s) {
  try {
    return String(s ?? '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#x27;');
  } catch (e) {
    return '';
  }
}

function _escapeHtml(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return _localEscapeHtml(s);
}

/**
 * Возвращает родной язык пользователя в нижнем регистре.
 * Использует window.USER_LANGUAGE_DATA (уст. при открытии профиля)
 * с fallback на window.UM.userData.native_language (доступен всегда).
 * Возвращает пустую строку, если язык не определён.
 */
function _getUserNativeLang() {
  try {
    if (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage) {
      return String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase();
    }
  } catch (e) {}
  try {
    if (window.UM && window.UM.userData && window.UM.userData.native_language) {
      return String(window.UM.userData.native_language).toLowerCase();
    }
  } catch (e) {}
  return '';
}

window.DictationKart = window.DictationKart || {
  _createElementFromHtml(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(html || '').trim();
    return wrap.firstElementChild;
  },

  _renderLucide(root) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons(root ? { root: root } : undefined);
      }
    } catch (e) {
    }
  },

  _showToast(message, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 4000;
    const sticky = o && o.sticky === true;

    let el = document.getElementById('auto-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auto-toast';
      el.addEventListener('click', () => {
        try { el.style.display = 'none'; } catch (e) { }
      });
      document.body.appendChild(el);
    }

    el.textContent = message || '';
    el.style.display = 'block';

    if (el._hideTimer) window.clearTimeout(el._hideTimer);
    if (!sticky) {
      el._hideTimer = window.setTimeout(() => {
        try { el.style.display = 'none'; } catch (e) { }
      }, Math.max(0, durationMs));
    }
  },

  _showLoadingIndicator(message) {
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
        window.DesktopLoadingModal.show(message || 'Загрузка…');
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof window.setSwBarProgress === 'function') {
        const msg = String(message || '').trim();
        window.setSwBarProgress(msg || 'Загрузка…', null, 'cache');
        return;
      }
    } catch (e) {
    }

    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    try {
      const t = overlay.querySelector('.loading-text');
      if (t) t.textContent = String(message || 'Загрузка…');
    } catch (e) {
    }

    overlay.style.display = 'flex';
  },

  _hideLoadingIndicator() {
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
        window.DesktopLoadingModal.hide();
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof window.setSwBarProgress === 'function') {
        window.setSwBarProgress('', null, '');
      }
    } catch (e) {
    }

    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  _completeLoadingIndicator(message, durationMs) {
    try {
      this._showLoadingIndicator(message);
    } catch (e) {
    }
    const ms = typeof durationMs === 'number' ? durationMs : 1200;
    window.setTimeout(() => {
      try { this._hideLoadingIndicator(); } catch (e) { }
    }, Math.max(0, ms));
  },

  _getDraftUserIdForKey() {
    try {
      const um = window.UM;
      const id = um && um.userData ? um.userData.id : null;
      return id ? String(id) : 'anon';
    } catch (e) {
      return 'anon';
    }
  },

  _normalizeLangCodeSafe(v) {
    try {
      const s = String(v || '').trim().toLowerCase();
      return s || '';
    } catch (e) {
      return '';
    }
  },

  _dictationIdToDictKey(dictationId) {
    const raw = String(dictationId || '').trim();
    if (!raw) return '';
    return raw.startsWith('dict_') ? raw : `dict_${raw}`;
  },

  _buildSentencesUrl(dictKey, langOrig, langTr) {
    const d = this._dictationIdToDictKey(dictKey);
    const lo = this._normalizeLangCodeSafe(langOrig);
    const lt = this._normalizeLangCodeSafe(langTr);
    if (!d || !lo || !lt) return '';
    return `/api/dictation/${encodeURIComponent(d)}/${encodeURIComponent(lo)}/${encodeURIComponent(lt)}/sentences`;
  },

  async _fetchSentencesFromServer(dictKey, langOrig, langTr, timeoutMs = 10000) {
    const url = this._buildSentencesUrl(dictKey, langOrig, langTr);
    if (!url) throw new Error('bad_sentences_url');

    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);

    var res;
    try {
      res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 502 || res.status === 503) {
        throw new Error(`storage_unavailable_${res.status}`);
      }
      let t = '';
      try { t = await res.text(); } catch (e) { }
      throw new Error(`fetch_sentences_failed_${res.status}_${t}`);
    }
    const data = await res.json();
    const sentences = (data && Array.isArray(data.sentences)) ? data.sentences : [];
    if (!sentences.length) throw new Error('empty_sentences');
    sentences.sort((a, b) => {
      const ap = (a && a.position !== undefined && a.position !== null && isFinite(Number(a.position))) ? Number(a.position) : null;
      const bp = (b && b.position !== undefined && b.position !== null && isFinite(Number(b.position))) ? Number(b.position) : null;
      if (ap !== null && bp !== null) return ap - bp;
      if (ap !== null) return -1;
      if (bp !== null) return 1;
      const ak = a && a.key ? String(a.key) : '';
      const bk = b && b.key ? String(b.key) : '';
      return ak.localeCompare(bk);
    });
    return {
      sentences: sentences,
      audio_user_shared: (data && data.audio_user_shared) ? String(data.audio_user_shared) : null,
      audio_order: (data && data.audio_order) ? String(data.audio_order) : '',
    };
  },

  /**
   * Загружает предложения из IndexedDB cache (если есть).
   * Ключ кеша: `${userId}:${dictKey}:${langOrig}:${langTr}`
   */
  async _loadSentencesFromCache(dictKey, langOrig, langTr) {
    try {
      const idb = window.IdbManager;
      if (!idb || typeof idb.idbGet !== 'function') return null;
      const userId = String(this._getDraftUserIdForKey());
      const cacheKey = userId + ':' + dictKey + ':' + langOrig + ':' + langTr;
      const cached = await idb.idbGet('dictations', cacheKey);
      if (cached && Array.isArray(cached.sentences) && cached.sentences.length) {
        return {
          sentences: cached.sentences,
          audio_user_shared: cached.audio_user_shared || null
        };
      }
      // Пробуем анонимный ключ
      const anonKey = 'anon:' + dictKey + ':' + langOrig + ':' + langTr;
      if (anonKey !== cacheKey) {
        const anonCached = await idb.idbGet('dictations', anonKey);
        if (anonCached && Array.isArray(anonCached.sentences) && anonCached.sentences.length) {
          return {
            sentences: anonCached.sentences,
            audio_user_shared: anonCached.audio_user_shared || null
          };
        }
      }
    } catch (e) {
      console.warn('[dictation_kart] _loadSentencesFromCache error', e);
    }
    return null;
  },

  _collectAudioUrlsFromSentences({ dictKey, langOrig, langTr, sentences, includeOriginal = true, includeTranslation = true }) {
    const urls = [];
    try {
      const am = window.AudioManager;
      if (!am || typeof am.buildDictationAudioUrl !== 'function') {
        return [];
      }
      const dictId = this._dictationIdToDictKey(dictKey);
      const lo = this._normalizeLangCodeSafe(langOrig);
      const lt = this._normalizeLangCodeSafe(langTr);
      const list = Array.isArray(sentences) ? sentences : [];
      for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        // Поля audio / audio_a — уже готовые URL (с сервера)
        const audio = s.audio != null ? String(s.audio || '').trim() : '';
        const audioA = s.audio_a != null ? String(s.audio_a || '').trim() : '';
        // Поля audio_tr — уже готовый URL для перевода
        const audioTr = s.audio_tr != null ? String(s.audio_tr || '').trim() : '';
        // Поля audio_m / audio_mic — имена файлов микрофона, строим URL
        const audioM = s.audio_m != null ? String(s.audio_m || '').trim() : '';
        const audioMic = s.audio_mic != null ? String(s.audio_mic || '').trim() : '';
        // Поля audio_f / audio_file — имена загруженных файлов, строим URL
        const audioF = s.audio_f != null ? String(s.audio_f || '').trim() : '';
        const audioFile = s.audio_file != null ? String(s.audio_file || '').trim() : '';

        if (includeOriginal) {
          if (audio) urls.push(audio);
          else if (audioA) urls.push(audioA);
          // audio_mic / audio_file — имена файлов, строим URL через AudioManager
          const micName = audioMic || audioM;
          if (micName) urls.push(am.buildDictationAudioUrl(dictId, lo, micName));
          const fileName = audioFile || audioF;
          if (fileName) urls.push(am.buildDictationAudioUrl(dictId, lo, fileName));
        }
        if (includeTranslation) {
          if (audioTr) urls.push(audioTr);
          // Для перевода тоже могут быть audio_mic / audio_file
          const micNameTr = s.audio_mic_tr || s.audio_m_tr || '';
          if (micNameTr) urls.push(am.buildDictationAudioUrl(dictId, lt, micNameTr));
          const fileNameTr = s.audio_file_tr || s.audio_f_tr || '';
          if (fileNameTr) urls.push(am.buildDictationAudioUrl(dictId, lt, fileNameTr));
        }
      }
    } catch (e) {
    }
    return Array.from(new Set(urls.filter(Boolean)));
  },

  async _fetchExercisesFromServer(dictationId) {
    try {
      const url = `/api/dictation/${encodeURIComponent(String(dictationId))}/exercises`;
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = res && res.ok ? await res.json() : null;
      const raw = data && data.success && Array.isArray(data.exercises) ? data.exercises : [];
      return raw.map((x) => {
        const p = x && typeof x.positions === 'string'
          ? (() => { try { return JSON.parse(x.positions); } catch (e) { return []; } })()
          : (x && Array.isArray(x.positions) ? x.positions : []);
        return { id: x && x.id != null ? x.id : null, positions: p };
      });
    } catch (e) {
      return null;
    }
  },

  async _loadExercisesFromCache(dictationId) {
    try {
      const idb = window.IdbManager;
      if (!idb || typeof idb.idbGet !== 'function') return null;
      const cacheKey = `exercises:${String(dictationId)}`;
      const cached = await idb.idbGet('dictations', cacheKey);
      if (cached && Array.isArray(cached.exercises) && cached.exercises.length) {
        return cached.exercises;
      }
    } catch (e) {
    }
    return null;
  },

  async _cacheExercises(dictationId, exercises) {
    try {
      const idb = window.IdbManager;
      if (!idb || typeof idb.idbPut !== 'function') return;
      const cacheKey = `exercises:${String(dictationId)}`;
      await idb.idbPut('dictations', {
        key: cacheKey,
        dictationId: String(dictationId),
        exercises,
        updatedAt: Date.now(),
      });
    } catch (e) {
    }
  },

  async _swRequest(action, payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker не активен');
    }

    try {
      if (typeof window.setSwStatus === 'function') {
        window.setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
      }
    } catch (e) {
    }

    const timeoutMs = typeof p.timeoutMs === 'number' ? p.timeoutMs : 15000;
    const message = { action, ...p };
    delete message.timeoutMs;

    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const timeout = setTimeout(() => {
        reject(new Error('SW timeout'));
      }, timeoutMs);

      channel.port1.onmessage = (event) => {
        const data = event.data || {};
        if (data.requestId !== requestId) return;
        clearTimeout(timeout);
        if (data && data.success) {
          try {
            if (typeof window.setSwStatus === 'function') {
              window.setSwStatus(`SW: ${String(action)} ok`);
            }
          } catch (e) {
          }
          resolve(data);
        } else {
          try {
            if (typeof window.setSwStatus === 'function') {
              window.setSwStatus(`SW: ${String(action)} error`);
            }
          } catch (e) {
          }
          reject(new Error(data && data.error ? data.error : 'sw_error'));
        }
      };

      navigator.serviceWorker.controller.postMessage({ ...message, requestId }, [channel.port2]);
    });
  },

  async prefetchDictationToCache({ dictationId, langOrig, translationLanguages, coverUrl }) {
    const numericId = String(dictationId || '').trim().replace(/^dict_/, '').trim();
    const dictKey = this._dictationIdToDictKey(numericId);
    const lo = this._normalizeLangCodeSafe(langOrig);
    const langs = Array.isArray(translationLanguages)
      ? translationLanguages.map((x) => this._normalizeLangCodeSafe(x)).filter(Boolean)
      : [];
    const finalLangs = Array.from(new Set([lo, ...langs])).filter(Boolean);
    if (!dictKey || !lo) {
      throw new Error('missing_dictation_params');
    }

    this._showLoadingIndicator('Получаем в кеш…');

    try {
      try {
        await this._swRequest('purgeDictation', { dictationId: dictKey });
      } catch (e) {
      }
      try {
        const idb = window.IdbManager;
        if (idb && typeof idb.idbDeleteDictationCache === 'function') {
          await idb.idbDeleteDictationCache(dictKey);
        }
      } catch (e) {
      }

      const userId = String(this._getDraftUserIdForKey());
      const updatedAt = Date.now();

      const allAudioUrls = [];
      let cachedPairs = 0;

      try {
        const msg = `Текст: ${lo} → ${lo}`;
        try {
          const overlay = document.getElementById('loading-overlay');
          const textEl = overlay ? overlay.querySelector('.loading-text') : null;
          if (textEl) textEl.textContent = msg;
        } catch (e) {
        }

        const sentencesResp = await this._fetchSentencesFromServer(dictKey, lo, lo);
        const sentences = sentencesResp.sentences;
        const sharedAudioFilename = sentencesResp.audio_user_shared;
        const keysToWrite = new Set();
        keysToWrite.add(`${userId}:${dictKey}:${lo}:${lo}`);
        keysToWrite.add(`anon:${dictKey}:${lo}:${lo}`);
        try {
          const n = parseInt(dictKey.replace(/^dict_/, ''), 10);
          if (Number.isFinite(n)) {
            keysToWrite.add(`${userId}:${n}:${lo}:${lo}`);
            keysToWrite.add(`${userId}:dict_${n}:${lo}:${lo}`);
            keysToWrite.add(`anon:dict_${n}:${lo}:${lo}`);
          }
        } catch (e) {
        }

        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') throw new Error('idb_unavailable');
        for (const key of keysToWrite) {
          await idb.idbPut('dictations', {
            key,
            dictationId: dictKey,
            langOrig: lo,
            langTr: lo,
            sentences,
            audio_user_shared: sharedAudioFilename || null,
            updatedAt,
          });
        }
        cachedPairs += 1;

        const audioUrls = this._collectAudioUrlsFromSentences({
          dictKey,
          langOrig: lo,
          langTr: lo,
          sentences,
          includeOriginal: true,
          includeTranslation: false,
        });
        for (const u of audioUrls) allAudioUrls.push(u);

        // Добавляем shared audio (audio_user_shared) — имя файла, строим URL
        if (sharedAudioFilename) {
          try {
            const am = window.AudioManager;
            if (am && typeof am.buildDictationAudioUrl === 'function') {
              const sharedUrl = am.buildDictationAudioUrl(dictKey, lo, sharedAudioFilename);
              if (sharedUrl) allAudioUrls.push(sharedUrl);
            }
          } catch (e) {}
        }
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(`cache_text_failed_${msg}`);
      }

      for (const lt of finalLangs) {
        if (lt === lo) continue;
        try {
          const msg = `Текст: ${lo} → ${lt}`;
          try {
            const overlay = document.getElementById('loading-overlay');
            const textEl = overlay ? overlay.querySelector('.loading-text') : null;
            if (textEl) textEl.textContent = msg;
          } catch (e) {
          }

          const sentencesResp = await this._fetchSentencesFromServer(dictKey, lo, lt);
          const sentences = sentencesResp.sentences;
          const sharedAudioFilename = sentencesResp.audio_user_shared;
          const keysToWrite = new Set();
          keysToWrite.add(`${userId}:${dictKey}:${lo}:${lt}`);
          keysToWrite.add(`anon:${dictKey}:${lo}:${lt}`);
          try {
            const n = parseInt(dictKey.replace(/^dict_/, ''), 10);
            if (Number.isFinite(n)) {
              keysToWrite.add(`${userId}:${n}:${lo}:${lt}`);
              keysToWrite.add(`${userId}:dict_${n}:${lo}:${lt}`);
              keysToWrite.add(`anon:dict_${n}:${lo}:${lt}`);
            }
          } catch (e) {
          }

          const idb = window.IdbManager;
          if (!idb || typeof idb.idbPut !== 'function') throw new Error('idb_unavailable');
          for (const key of keysToWrite) {
            await idb.idbPut('dictations', {
              key,
              dictationId: dictKey,
              langOrig: lo,
              langTr: lt,
              sentences,
              audio_user_shared: sharedAudioFilename || null,
              updatedAt,
            });
          }
          cachedPairs += 1;

          const audioUrls = this._collectAudioUrlsFromSentences({
            dictKey,
            langOrig: lo,
            langTr: lt,
            sentences,
            includeOriginal: false,
            includeTranslation: true,
          });
          for (const u of audioUrls) allAudioUrls.push(u);

          // Добавляем shared audio (audio_user_shared) — имя файла, строим URL
          if (sharedAudioFilename) {
            try {
              const am = window.AudioManager;
              if (am && typeof am.buildDictationAudioUrl === 'function') {
                const sharedUrl = am.buildDictationAudioUrl(dictKey, lo, sharedAudioFilename);
                if (sharedUrl) allAudioUrls.push(sharedUrl);
              }
            } catch (e) {}
          }
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          throw new Error(`cache_text_failed_${msg}`);
        }
      }

      // Кешируем задания (exercises) для этого диктанта
      try {
        const numericId = String(dictationId || '').trim().replace(/^dict_/, '').trim();
        const exercises = await this._fetchExercisesFromServer(numericId);
        if (Array.isArray(exercises) && exercises.length) {
          await this._cacheExercises(numericId, exercises);
        }
      } catch (e) {
        // Не фатально, если не удалось закешировать задания
      }

      const uniqueAudio = Array.from(new Set(allAudioUrls.filter(Boolean)));

      try {
        const coverPath = numericId
          ? `/api/dictations_covers/${encodeURIComponent(numericId)}.webp`
          : '';
        const coverToFetch = coverPath
          ? `${coverPath}${coverPath.includes('?') ? '&' : '?'}ts=${Date.now()}`
          : '';

        try {
          const overlay = document.getElementById('loading-overlay');
          const textEl = overlay ? overlay.querySelector('.loading-text') : null;
          if (textEl) textEl.textContent = 'Обложка…';
        } catch (e) {
        }

        if (coverToFetch) {
          await this._swRequest('prefetchStrict', { urls: [coverToFetch], ignoreLimit: true });
        }
      } catch (e) {
      }

      try {
        if (uniqueAudio.length) {
          try {
            const overlay = document.getElementById('loading-overlay');
            const textEl = overlay ? overlay.querySelector('.loading-text') : null;
            if (textEl) textEl.textContent = `Аудио… (${uniqueAudio.length})`;
          } catch (e) {
          }

          if (window.AudioManager && typeof window.AudioManager.prefetchMediaUrls === 'function') {
            await window.AudioManager.prefetchMediaUrls(uniqueAudio, { concurrency: 4 });
          } else {
            await this._swRequest('prefetchStrict', { urls: uniqueAudio, ignoreLimit: true });
          }
        }
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(`cache_audio_failed_${msg}`);
      }

      this._completeLoadingIndicator(`В кеше: ${cachedPairs} языков, аудио ${uniqueAudio.length}`, 1200);
      return { ok: true, cachedPairs, audio: uniqueAudio.length, coverUrl: coverUrl || '' };
    } finally {
      try { this._hideLoadingIndicator(); } catch (e) { }
    }
  },

  _bindHandlers(cardEl) {
    if (!cardEl) return;

    try {
      console.log(
        '[DK:bind] _bindHandlers dictation-id=', cardEl.getAttribute('data-dictation-id'),
        '| toggle-desk-explicit=', !!cardEl.querySelector('[data-action="toggle-desk-explicit"]'),
        '| toggle-card-actions=', !!cardEl.querySelector('[data-action="toggle-card-actions"]')
      );
    } catch (e) {}

    const thumb = cardEl.querySelector('.short-thumb');
    if (thumb && thumb.hasAttribute('data-href')) {
      const open = (e) => {
        try {
          const href = thumb.getAttribute('data-href');
          if (!href) return;
          e.preventDefault();
          e.stopPropagation();
          const dictationId = Number(cardEl.getAttribute('data-dictation-id'));
          const title = cardEl.querySelector('.short-title');
          const dictationTitle = title ? String(title.textContent || '').trim() : '';

          // Читаем языки перевода из data-атрибутов карточки
          var rawTranslations = cardEl.getAttribute('data-available-translations') || '[]';
          var availableTranslations = [];
          try { availableTranslations = JSON.parse(rawTranslations); } catch (e3) { availableTranslations = []; }
          if (!Array.isArray(availableTranslations)) availableTranslations = [];

          var langOriginal = (cardEl.getAttribute('data-lang-original') || '').toLowerCase();

          // Показываем модалку выбора языка перевода (даже если язык один — хороший стиль)
          var match = href.match(/\/dictation\/(dict_\d+)\//);
          var dictIdFormatted = match ? match[1] : ('dict_' + dictationId);

          console.log('[DK:thumbClick] dictationIdFormatted=', dictIdFormatted, 'langOriginal=', langOriginal, 'availableTranslations=', availableTranslations, 'DictationLanguageModal=', !!window.DictationLanguageModal);

          if (availableTranslations.length >= 1 && window.DictationLanguageModal && typeof window.DictationLanguageModal.open === 'function') {
            console.log('[DK:thumbClick] открываю DictationLanguageModal');
            window.DictationLanguageModal.open({
              dictationId: dictIdFormatted,
              langOriginal: langOriginal,
              translationLanguages: availableTranslations,
              cardEl: cardEl,
            });
            return;
          }

          // Fallback: если модалка не загружена — открываем сразу
          console.log('[DK:thumbClick] fallback: DictationLanguageModal не загружен или нет переводов, вызываю openDictationLaunch');
          if (Number.isFinite(dictationId) && dictationId > 0 && typeof window.openDictationLaunch === 'function') {
            window.openDictationLaunch(dictationId, href, cardEl, dictationTitle);
          } else {
            console.warn('[dictation_kart] openDictationLaunch не загружен, невозможно открыть диктант');
          }
        } catch (e2) {
        }
      };
      thumb.addEventListener('click', open);
      thumb.addEventListener('keydown', (e) => {
        if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
        open(e);
      });
    }

    try {
      const launchBtn = cardEl.querySelector('[data-action="launch-assignment"]');
      const launchMenu = cardEl.querySelector('.dictation-kart-launch-menu');
      const closeLaunchMenu = () => {
        try {
          if (!launchMenu) return;
          launchMenu.classList.remove('show');
          launchMenu.style.display = 'none';
        } catch (e) {
        }
      };

      const openLaunchMenu = () => {
        try {
          if (!launchMenu) return;
          // Закрываем другие выпадающие списки на этой карточке
          document.querySelectorAll('.dictation-kart-launch-menu').forEach((m) => {
            try {
              if (m !== launchMenu) {
                m.classList.remove('show');
                m.style.display = 'none';
              }
            } catch (e0) {
            }
          });
          // Закрываем меню "...", если открыто
          const actionsMenu = cardEl.querySelector('.short-card-actions-menu:not(.dictation-kart-launch-menu)');
          if (actionsMenu) {
            try {
              actionsMenu.classList.remove('show');
              actionsMenu.style.display = 'none';
            } catch (e0) {}
          }
          cardEl.classList.remove('short-card--menu-open');
          launchMenu.classList.add('show');
          launchMenu.style.display = 'block';
          this._renderLucide(launchMenu);
        } catch (e) {
        }
      };

      const normalizePositions = (pos) => {
        const arr = Array.isArray(pos) ? pos : [];
        const uniq = Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
        uniq.sort((a, b) => a - b);
        return uniq;
      };

      const positionsToLabel = (positions) => {
        const arr = normalizePositions(positions);
        if (!arr.length) return 'весь диктант';
        const ranges = [];
        let start = arr[0];
        let prev = arr[0];
        for (let i = 1; i < arr.length; i++) {
          const cur = arr[i];
          if (cur === prev + 1) {
            prev = cur;
            continue;
          }
          ranges.push(start === prev ? String(start) : `${start}-${prev}`);
          start = cur;
          prev = cur;
        }
        ranges.push(start === prev ? String(start) : `${start}-${prev}`);
        return ranges.join(', ');
      };

      const openDictationModal = (subsetPositions) => {
        try {
          const href = thumb ? String(thumb.getAttribute('data-href') || '').trim() : '';
          if (!href) {
            return;
          }
          if (window.DictationModal && typeof window.DictationModal.open === 'function') {
            window.DictationModal.open(href, { cardEl, subsetPositions: subsetPositions && subsetPositions.length ? subsetPositions : null });
            return;
          }
          console.warn('[dictation_kart] DictationModal не загружен, невозможно открыть диктант');
        } catch (e) {
        }
      };

      if (launchBtn && launchMenu && launchBtn.dataset.boundLaunchAssignment !== '1') {
        launchBtn.dataset.boundLaunchAssignment = '1';
        launchBtn.addEventListener('click', async (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          const dictationId = Number(cardEl.getAttribute('data-dictation-id'));
          if (!Number.isFinite(dictationId) || dictationId <= 0) {
            openDictationModal(null);
            return;
          }

          let exercises = [];
          try {
            // Сначала проверяем кеш
            const cached = await this._loadExercisesFromCache(dictationId);
            if (Array.isArray(cached) && cached.length) {
              exercises = cached.map((x) => ({
                id: x && x.id != null ? x.id : null,
                positions: normalizePositions(x && Array.isArray(x.positions) ? x.positions : []),
              }));
            } else {
              // Нет в кеше — грузим с сервера и сразу кешируем
              const url = `/api/dictation/${encodeURIComponent(String(dictationId))}/exercises`;
              const res = await fetch(url, { method: 'GET', cache: 'no-store' });
              const data = res && res.ok ? await res.json() : null;
              const raw = data && data.success && Array.isArray(data.exercises) ? data.exercises : [];
              exercises = raw.map((x) => {
                const p = x && typeof x.positions === 'string' ? (() => { try { return JSON.parse(x.positions); } catch (e) { return []; } })() : x.positions;
                return { id: x && x.id != null ? x.id : null, positions: normalizePositions(p) };
              });
              // Кешируем полученные с сервера задания
              if (Array.isArray(exercises) && exercises.length) {
                this._cacheExercises(dictationId, exercises).catch(() => {});
              }
            }
          } catch (e1) {
            exercises = [];
          }

          const visible = exercises.filter((x) => x && x.id != null);
          const uniqueBySig = new Map();
          for (const ex of visible) {
            const sig = ex.positions && ex.positions.length ? ex.positions.join(',') : '';
            if (!uniqueBySig.has(sig)) uniqueBySig.set(sig, ex);
          }
          const list = Array.from(uniqueBySig.values());

          // Перышко ВСЕГДА показывает выпадающий список со всеми упражнениями
          try {
            launchMenu.innerHTML = list.map((ex) => {
              const pos = Array.isArray(ex.positions) ? ex.positions : [];
              const sig = pos.length ? pos.join(',') : '';
              const label = positionsToLabel(pos);
              return `
                <button class="dropdown-menu-item" type="button" data-action="launch-assignment-item" data-positions="${_escapeHtml(sig)}">
                  <i data-lucide="play"></i>
                  <span>${_escapeHtml(label)}</span>
                  <span class="launch-menu-medal" data-dictation-id="${dictationId}" data-positions="${_escapeHtml(sig)}" style="margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--color-button-gray);">
                    <i data-lucide="medal" style="width:14px;height:14px;"></i>
                    <span class="launch-menu-medal-count">...</span>
                  </span>
                </button>
              `;
            }).join('');
          } catch (e2) {
          }

          openLaunchMenu();

          // Асинхронно загружаем количество завершений для каждого упражнения
          (async () => {
            try {
              const token = (() => { try { return localStorage.getItem('jwt_token'); } catch (e) { return null; } })();
              if (!token) return;
              const medalSpans = launchMenu.querySelectorAll('.launch-menu-medal');
              if (!medalSpans.length) return;
              // Для каждого упражнения делаем запрос
              for (const span of medalSpans) {
                const dId = Number(span.getAttribute('data-dictation-id'));
                const posStr = String(span.getAttribute('data-positions') || '').trim();
                const positions = posStr ? posStr.split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0) : [];
                try {
                  const resp = await fetch('/api/statistics/success/count_subset', {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Bearer ' + token,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      dictation_id: dId,
                      selected_sentence_positions: positions.length ? positions : null,
                    }),
                  });
                  if (resp.ok) {
                    const data = await resp.json();
                    const count = Number(data.count) || 0;
                    const countEl = span.querySelector('.launch-menu-medal-count');
                    if (countEl) countEl.textContent = String(count);
                    if (count > 0) {
                      span.style.color = 'var(--color-gold, #f59e0b)';
                    }
                  }
                } catch (e) {
                  // Если нет интернета — пробуем кеш localStorage
                  try {
                    const userId = window.UM?.userId || null;
                    if (userId) {
                      const cacheKey = 'history_current:' + userId + ':' + dId + ':' + (positions.length ? positions.join(',') : '');
                      const cached = localStorage.getItem(cacheKey);
                      if (cached) {
                        const entry = JSON.parse(cached);
                        const count = Number(entry.count) || 0;
                        const countEl = span.querySelector('.launch-menu-medal-count');
                        if (countEl) countEl.textContent = String(count);
                        if (count > 0) {
                          span.style.color = 'var(--color-gold, #f59e0b)';
                        }
                      }
                    }
                  } catch (e2) {}
                }
              }
            } catch (e) {}
          })();
        });

        launchMenu.addEventListener('click', (e) => {
          try {
            const btn = e.target && e.target.closest ? e.target.closest('[data-action="launch-assignment-item"]') : null;
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();

            const posStr = String(btn.getAttribute('data-positions') || '').trim();
            const positions = posStr
              ? posStr.split(',').map((x) => Number(String(x).trim())).filter((x) => Number.isFinite(x) && x > 0)
              : [];
            closeLaunchMenu();
            openDictationModal(positions.length ? positions : null);
          } catch (e3) {
          }
        });

        document.addEventListener('click', (e) => {
          try {
            if (!launchMenu || !launchBtn) return;
            if (launchMenu.contains(e.target) || launchBtn.contains(e.target)) return;
          } catch (e4) {
          }
          closeLaunchMenu();
        });
      }
    } catch (e) {
    }

    const kebabBtn = cardEl.querySelector('[data-action="toggle-card-actions"]');
    const menu = cardEl.querySelector('.short-card-actions-menu:not(.dictation-kart-launch-menu)');
    if (!kebabBtn || !menu) {
      try {
        console.warn(
          '[DK:bind] РАННИЙ return: kebabBtn=', !!kebabBtn, 'menu=', !!menu,
          '→ обработчик toggle-desk-explicit НЕ привязан, dictation-id=', cardEl.getAttribute('data-dictation-id')
        );
      } catch (e) {}
      return;
    }

    const closeMenu = () => {
      try {
        menu.classList.remove('show');
        menu.style.display = 'none';
        cardEl.classList.remove('short-card--menu-open');
      } catch (e) {
      }
    };

    const openMenu = () => {
      try {
        document.querySelectorAll('.short-card-actions-menu').forEach((m) => {
          try {
            if (m !== menu) {
              m.classList.remove('show');
              m.style.display = 'none';
            }
          } catch (e0) {
          }
        });
        document.querySelectorAll('.short-card.short-card--menu-open').forEach((c) => {
          try {
            if (c !== cardEl) c.classList.remove('short-card--menu-open');
          } catch (e0) {
          }
        });

        // Закрываем меню перышка, если открыто
        try {
          const lm = cardEl.querySelector('.dictation-kart-launch-menu');
          if (lm) {
            lm.classList.remove('show');
            lm.style.display = 'none';
          }
        } catch (e0) {}

        menu.classList.add('show');
        menu.style.display = 'block';
        cardEl.classList.add('short-card--menu-open');
        this._renderLucide(menu);
      } catch (e) {
      }
    };

    kebabBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('show');
      if (isOpen) closeMenu();
      else openMenu();
    });

    document.addEventListener('click', (e) => {
      try {
        if (menu.contains(e.target) || kebabBtn.contains(e.target)) return;
      } catch (e2) {
      }
      closeMenu();
    });

    menu.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        if (!action) return;

        if (action === 'edit-dictation') {
          const editUrl = String(btn.getAttribute('data-edit-url') || '').trim();
          if (editUrl) {
            closeMenu();
            window.location.href = editUrl;
            return;
          }
        }

        if (action === 'edit-dictation-v2') {
          closeMenu();
          console.log('[dictation_kart] edit-dictation-v2 clicked, DictationEditorModal=', !!window.DictationEditorModal);
          try {
            const dictationId = btn.getAttribute('data-dictation-id') || '';
            const langOriginal = btn.getAttribute('data-lang-original') || '';
            const langTranslation = btn.getAttribute('data-lang-translation') || '';
            const title = btn.getAttribute('data-title') || '';
            const level = btn.getAttribute('data-level') || '';
            const coverUrl = btn.getAttribute('data-cover-url') || '';
            const authorMaterialsUrl = btn.getAttribute('data-author-materials-url') || '';
            const isDialog = btn.getAttribute('data-is-dialog') === 'true';
            const audioOrder = btn.getAttribute('data-audio-order') || '';

            console.log('[dictation_kart] edit-dictation-v2 data:', { dictationId, langOriginal, langTranslation, title, level, coverUrl });

            if (window.DictationEditorModal && typeof window.DictationEditorModal.open === 'function') {
              console.log('[dictation_kart] calling DictationEditorModal.open');

              // Стратегия: КЕШ ПЕРВЫЙ → сервер для обновления
              // 1. Пробуем загрузить из IndexedDB (мгновенно)
              // 2. Если есть в кеше — открываем редактор сразу
              // 3. Параллельно пробуем сервер — если данные новее, обновляем
              // 4. Если кеша нет — ждём сервер
              // 5. Если сервер упал — используем кеш (fallback)
              var sentencesPromise = null;
              var cachePromise = null;
              
              // Пробуем загрузить из IndexedDB cache (для всех языковых пар, не только текущей)
              if (window.DictationKart && typeof window.DictationKart._loadSentencesFromCache === 'function') {
                cachePromise = window.DictationKart._loadSentencesFromCache(dictationId, langOriginal, langTranslation)
                  .then(function (cachedResult) {
                    if (cachedResult && Array.isArray(cachedResult.sentences) && cachedResult.sentences.length) {
                      console.log('[dictation_kart] Cache HIT for editor, sentences count:', cachedResult.sentences.length);
                      return { source: 'cache', sentences: cachedResult.sentences, audio_user_shared: cachedResult.audio_user_shared };
                    }
                    return null;
                  })
                  .catch(function () { return null; });
              } else {
                cachePromise = Promise.resolve(null);
              }
              
              // Пробуем загрузить с сервера
              var serverPromise = null;
              if (window.DictationKart && typeof window.DictationKart._fetchSentencesFromServer === 'function') {
                serverPromise = window.DictationKart._fetchSentencesFromServer(dictationId, langOriginal, langTranslation)
                  .then(function (result) {
                    console.log('[dictation_kart] Server OK for editor, sentences count:', result.sentences ? result.sentences.length : 0);
                    return { source: 'server', sentences: result.sentences || [], audio_user_shared: result.audio_user_shared || null };
                  })
                  .catch(function (err) {
                    console.warn('[dictation_kart] Server failed for editor:', err.message || err);
                    return null;
                  });
              } else {
                serverPromise = Promise.resolve(null);
              }
              
              // Гонка: кеш первый, но если кеша нет — ждём сервер
              sentencesPromise = cachePromise.then(function (cached) {
                if (cached && cached.sentences && cached.sentences.length) {
                  // Кеш есть — открываем редактор сразу, но в фоне проверяем сервер
                  serverPromise.then(function (serverResult) {
                    if (serverResult && serverResult.sentences && serverResult.sentences.length) {
                      // Сервер вернул данные — проверяем, не изменились ли они
                      if (serverResult.sentences.length !== cached.sentences.length) {
                        console.log('[dictation_kart] Server has different data, reopening editor with fresh data');
                        window.DictationEditorModal.open({
                          dictationId: dictationId,
                          originalLanguage: langOriginal,
                          translationLanguage: langTranslation,
                          title: title,
                          level: level,
                          coverUrl: coverUrl,
                          authorMaterialsUrl: authorMaterialsUrl,
                          is_dialog: isDialog,
                          sentences: serverResult.sentences,
                          audio_user_shared: serverResult.audio_user_shared,
                          audio_order: audioOrder,
                        });
                      }
                    }
                  }).catch(function () {});
                  return { sentences: cached.sentences, audio_user_shared: cached.audio_user_shared };
                }
                // Кеша нет — ждём сервер
                return serverPromise.then(function (serverResult) {
                  if (serverResult && serverResult.sentences && serverResult.sentences.length) {
                    return { sentences: serverResult.sentences, audio_user_shared: serverResult.audio_user_shared };
                  }
                  // И сервер не дал данных — показываем пустую таблицу
                  console.warn('[dictation_kart] No data from cache or server, editor will be empty');
                  if (typeof window.DictationKart._showToast === 'function') {
                    window.DictationKart._showToast('Не вдалося завантажити дані. Перевірте підключення до інтернету.', { type: 'warning' });
                  }
                  return { sentences: [], audio_user_shared: null };
                });
              });

              sentencesPromise.then(function (result) {
                var sentences = result && Array.isArray(result.sentences) ? result.sentences : [];
                var audio_user_shared = result ? result.audio_user_shared : null;
                window.DictationEditorModal.open({
                  dictationId: dictationId,
                  originalLanguage: langOriginal,
                  translationLanguage: langTranslation,
                  title: title,
                  level: level,
                  coverUrl: coverUrl,
                  authorMaterialsUrl: authorMaterialsUrl,
                  is_dialog: isDialog,
                  sentences: sentences,
                  audio_user_shared: audio_user_shared,
                  audio_order: audioOrder,
                });
              });
            } else {
              console.warn('[dictation_kart] DictationEditorModal not available!');
            }
          } catch (e) {
            console.warn('[dictation_kart] edit-dictation-v2 error', e);
          }
          return;
        }

        closeMenu();

        try {
          if (action === 'remove-from-desk' && typeof window.removeFromDesk === 'function') {
            const itemId = btn.getAttribute('data-desk-item-id');
            const dictationId = btn.getAttribute('data-dictation-id');
            if (itemId && dictationId) {
              await window.removeFromDesk(itemId, dictationId);
              return;
            }
          }
        } catch (e2) {
        }

        try {
          if (action === 'create-assignment' && typeof window.openCreateAssignmentModal === 'function') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId) window.openCreateAssignmentModal(dictationId);
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'plan-tasks' && typeof window.openPlanTasksModal === 'function') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId) window.openPlanTasksModal(dictationId);
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'show-in-book') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId && window.BookModal && typeof window.BookModal.showDictationInBook === 'function') {
              await window.BookModal.showDictationInBook(dictationId);
              return;
            }
          }
        } catch (e2) {
        }

        try {
          if (action === 'move-dictation') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (!dictationId) return;

            if (window.BookModal && typeof window.BookModal.openMoveDictation === 'function') {
              await window.BookModal.openMoveDictation(dictationId);
              return;
            }

            if (typeof window.openMoveDictationModal === 'function') {
              window.openMoveDictationModal(dictationId);
              return;
            }

            try {
              console.warn('[dictation_kart] move-dictation: no modal opener found');
            } catch (e0) {
            }
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'prefetch-dictation-cache') {
            const dictationId = btn.getAttribute('data-dictation-id');
            const langOriginal = btn.getAttribute('data-lang-original');
            const coverUrl = btn.getAttribute('data-cover-url');
            const trRaw = btn.getAttribute('data-translation-langs');
            const translationLanguages = String(trRaw || '')
              .split(',')
              .map((x) => String(x || '').trim())
              .filter(Boolean);

            const card = btn && btn.closest ? btn.closest('.short-card') : null;
            try {
              if (card) card.classList.remove('short-card--cached');
            } catch (e0) {
            }

            try {
              await this.prefetchDictationToCache({
                dictationId,
                langOrig: langOriginal,
                translationLanguages,
                coverUrl,
              });
              try {
                if (card) card.classList.add('short-card--cached');
              } catch (e1) {
              }
              try {
                this._showToast('Скачано в кэш', { durationMs: 2200 });
              } catch (e3) {
              }
            } catch (err) {
              try {
                const msg = err && err.message ? String(err.message) : 'Не удалось скачать в кэш';
                this._showToast(msg, { durationMs: 3500 });
              } catch (e4) {
              }
            }
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'delete-dictation') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (!dictationId) return;

            // Читаем обложку и название из data-атрибутов кнопки
            const coverUrl = btn.getAttribute('data-cover-url') || '';
            const dictationTitle = btn.getAttribute('data-title') || '';

            // Показываем подтверждение
            if (typeof window.DesktopConfirmModal !== 'undefined' && typeof window.DesktopConfirmModal.open === 'function') {
              await new Promise(function (resolveConfirm) {
                window.DesktopConfirmModal.open({
                  title: 'Видалити диктант',
                  message: 'Ви впевнені, що хочете видалити цей диктант? Цю дію неможливо скасувати.',
                  coverUrl: coverUrl,
                  dictationTitle: dictationTitle,
                  buttons: [
                    {
                      text: 'Видалити',
                      type: 'primary',
                      onClick: function () { resolveConfirm(true); }
                    }
                  ],
                  onClose: function () { resolveConfirm(false); }
                });
              });
            } else {
              // Fallback: просто confirm()
              var confirmed = confirm('Ви впевнені, що хочете видалити цей диктант?');
              if (!confirmed) return;
            }

            try {
              var token = (window.UM && window.UM.token) || localStorage.getItem('jwt_token');
              if (!token) {
                this._showToast('Помилка: немає токена авторизації', { durationMs: 3000 });
                return;
              }

              var deleteResp = await fetch('/api/dictations/' + encodeURIComponent(String(dictationId)), {
                method: 'DELETE',
                headers: {
                  'Authorization': 'Bearer ' + token
                }
              });

              // Логируем ответ сервера для диагностики
              var deleteResultText = await deleteResp.text();
              console.log('[dictation_kart] delete response:', deleteResp.status, deleteResultText);
              var deleteResult = null;
              try {
                deleteResult = JSON.parse(deleteResultText);
              } catch (e) {
                console.warn('[dictation_kart] delete response not JSON:', deleteResultText);
              }

              if (deleteResp.ok && deleteResult && deleteResult.success) {
                this._showToast('Диктант видалено', { durationMs: 2200 });

                // Очищаем кеш SW для этого диктанта
                try {
                  await this._swRequest('purgeDictation', { dictationId: dictationId });
                } catch (swErr) {
                  console.warn('[dictation_kart] purgeDictation error:', swErr);
                }

                // Удаляем карточку из DOM
                try {
                  var card = btn && btn.closest ? btn.closest('.short-card') : null;
                  if (card && card.parentNode) {
                    card.parentNode.removeChild(card);
                  }
                } catch (domErr) {
                  console.warn('[dictation_kart] remove card error:', domErr);
                }

                // Обновляем десктоп — удаляем диктант с десктопа
                try {
                  // Сначала очищаем IDB кэш desk_items, чтобы loadDeskItems не отрендерил старые данные
                  if (typeof window.idbRemove === 'function') {
                    window.idbRemove('desk_items', 'latest').catch(function () {});
                  }
                  if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
                    window.Desktop.loadDeskItems();
                  }
                } catch (deskErr) {
                  console.warn('[dictation_kart] loadDeskItems error:', deskErr);
                }

              } else {
                var errMsg = (deleteResult && deleteResult.error) ? deleteResult.error : 'Не вдалося видалити диктант';
                this._showToast(errMsg, { durationMs: 3000 });
              }
            } catch (fetchErr) {
              console.error('[dictation_kart] delete-dictation fetch error:', fetchErr);
              this._showToast('Помилка з\'єднання', { durationMs: 3000 });
            }
            return;
          }
        } catch (e2) {
        }

        try {
          console.log('[dictation_kart] menu action', action);
        } catch (e2) {
        }
      });
    });

    // Обработчик для кнопки "добавить/убрать со стола" (toggle-desk-explicit)
    var toggleDeskBtn = cardEl.querySelector('[data-action="toggle-desk-explicit"]');
    if (toggleDeskBtn) {
      try {
        console.log('[DK:bind] кнопка toggle-desk-explicit НАЙДЕНА, привязываю click-обработчик, dictation-id=', cardEl.getAttribute('data-dictation-id'));
      } catch (e) {}
      toggleDeskBtn.addEventListener('click', async function (e) {
        try { console.log('[DK:toggleDesk] КЛИК по кнопке toggle-desk-explicit'); } catch (e) {}
        e.preventDefault();
        e.stopPropagation();
        var dbId = toggleDeskBtn.getAttribute('data-dictation-id');
        try { console.log('[DK:toggleDesk] data-dictation-id кнопки =', dbId); } catch (e) {}
        if (!dbId) return;
        dbId = Number(dbId);
        if (!Number.isFinite(dbId) || dbId <= 0) return;

        var isOnDesk = window.DictationKart.isDictationOnDesk(dbId);
        try { console.log('[DK:toggleDesk] dbId=', dbId, '| isOnDesk=', isOnDesk); } catch (e) {}
        try {
          if (isOnDesk) {
            // Найти itemId для этого диктанта
            var itemId = null;
            try {
              if (typeof window.idbGet === 'function') {
                var cached = await window.idbGet('desk_items', 'latest');
                var items = cached && Array.isArray(cached.items) ? cached.items : [];
                for (var i = 0; i < items.length; i++) {
                  if (Number(items[i].dictation_id) === dbId) {
                    itemId = items[i].id;
                    break;
                  }
                }
              }
            } catch (e) {
            }
            if (itemId) {
              await window.DictationKart.removeFromDesk(itemId, dbId);
            }
          } else {
            await window.DictationKart.addToDesk(dbId);
          }
          // Обновляем иконку и классы на карточке
          var newIsOnDesk = window.DictationKart.isDictationOnDesk(dbId);
          var icon = toggleDeskBtn.querySelector('i[data-lucide]');
          if (icon) {
            icon.setAttribute('data-lucide', newIsOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash');
          }
          try {
            if (newIsOnDesk) {
              cardEl.classList.add('short-card--on-desk');
              cardEl.classList.remove('short-card--off-desk');
            } else {
              cardEl.classList.add('short-card--off-desk');
              cardEl.classList.remove('short-card--on-desk');
            }
          } catch (e) {
          }
          try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
            }
          } catch (e) {
          }
        } catch (err) {
          console.warn('[dictation_kart] toggle-desk error:', err);
        }
      });
    }
  },

  buildMenuItems(context) {
    if (context === 'desk') {
      return [
        { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment_new', labelFallback: 'Все упражнения' },
        { action: 'plan-tasks', icon: 'calendar-plus', labelKey: 'private_library.dictation_card_actions.plan', labelFallback: 'Запланировать' },
        { action: 'prefetch-dictation-cache', icon: 'download', labelKey: 'private_library.dictation_card_actions.cache', labelFallback: 'Скачать в кэш' },
        { action: 'edit-dictation-v2', icon: 'sparkles', labelKey: 'private_library.dictation_card_actions.editor', labelFallback: 'Редактор' },
        { action: 'show-in-book', icon: 'book-marked', labelKey: 'private_library.dictation_card_actions.show_in_book', labelFallback: 'Показать в книге' },
        { action: 'remove-from-desk', icon: 'arrow-big-down-dash', labelKey: 'private_library.dictation_card_actions.remove_from_desk', labelFallback: 'Убрать со стола' },
      ];
    }

    return [
      { action: 'edit-dictation-v2', icon: 'sparkles', labelKey: 'private_library.dictation_card_actions.editor', labelFallback: 'Редактор' },
      { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment', labelFallback: 'Все упражнения' },
      { action: 'plan-tasks', icon: 'calendar-plus', labelKey: 'private_library.dictation_card_actions.plan', labelFallback: 'Запланировать' },
      { action: 'move-dictation', icon: 'folder-symlink', labelKey: 'private_library.dictation_card_actions.move', labelFallback: 'Переместить' },
      { action: 'delete-dictation', icon: 'trash-2', labelKey: 'private_library.dictation_card_actions.delete', labelFallback: 'Удалить', danger: true },
    ];
  },

  renderMenuHtml({ context, dictationId, deskItemId, editUrl, editV2Url, langOriginal, coverUrl, availableTranslations, title, level, langTranslation, isDialog, audioOrder }) {
    const items = this.buildMenuItems(context);

    const t = (key, fallback) => {
      try {
        if (typeof window.libT === 'function') return window.escapeHtml(window.libT(key, null, fallback));
      } catch (e) {
      }
      try {
        return window.escapeHtml(fallback);
      } catch (e2) {
        return String(fallback);
      }
    };

    return `
      <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
        <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="${t('private_library.dictation_card_actions.title', 'Действия')}" aria-label="${t('private_library.dictation_card_actions.title', 'Действия')}">
          <i data-lucide="more-vertical"></i>
        </button>
        <div class="dropdown-menu short-card-actions-menu" style="display: none;">
          ${items
            .map((it) => {
              const cls = it.danger ? 'dropdown-menu-item dropdown-menu-item-danger' : 'dropdown-menu-item';
              const attrs = [];
              attrs.push(`class="${cls}"`);
              attrs.push(`data-action="${it.action}"`);

              if (it.action === 'edit-dictation') {
                attrs.push(`type="button"`);
                attrs.push(`data-edit-url="${window.escapeHtml(String(editUrl || ''))}"`);
              } else if (it.action === 'edit-dictation-v2') {
                attrs.push(`type="button"`);
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
                attrs.push(`data-lang-original="${window.escapeHtml(String(langOriginal || ''))}"`);
                attrs.push(`data-lang-translation="${window.escapeHtml(String(langTranslation || ''))}"`);
                attrs.push(`data-title="${window.escapeHtml(String(title || ''))}"`);
                attrs.push(`data-level="${window.escapeHtml(String(level || ''))}"`);
                attrs.push(`data-cover-url="${window.escapeHtml(String(coverUrl || ''))}"`);
                attrs.push(`data-is-dialog="${isDialog ? 'true' : 'false'}"`);
                attrs.push(`data-audio-order="${window.escapeHtml(String(audioOrder || ''))}"`);
              } else if (it.action === 'remove-from-desk') {
                attrs.push(`data-desk-item-id="${window.escapeHtml(String(deskItemId || ''))}"`);
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
              } else if (it.action === 'prefetch-dictation-cache') {
                attrs.push(`type="button"`);
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
                attrs.push(`data-lang-original="${window.escapeHtml(String(langOriginal || ''))}"`);
                attrs.push(`data-cover-url="${window.escapeHtml(String(coverUrl || ''))}"`);
                attrs.push(`data-translation-langs="${window.escapeHtml(String((availableTranslations || []).join(','))) }"`);
              } else if (it.action === 'delete-dictation') {
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
                attrs.push(`data-cover-url="${window.escapeHtml(String(coverUrl || ''))}"`);
                attrs.push(`data-title="${window.escapeHtml(String(title || ''))}"`);
              } else {
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
              }

              return `
                <button ${attrs.join(' ')}>
                  <i data-lucide="${it.icon}"></i>
                  <span>${t(it.labelKey, it.labelFallback)}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },

  renderDeskCard(item) {
    const dictationId = item.dictation_id;
    const dictationIdFormatted = `dict_${dictationId}`;

    const langOriginal = item.language_original || item.language_code || 'en';
    const nativeLang = _getUserNativeLang();

    const availableTranslations = Array.isArray(item.translation_languages)
      ? item.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredTrLang = nativeLang && availableTranslations.includes(nativeLang)
      ? nativeLang
      : (availableTranslations.length ? availableTranslations[0] : '');
    const langTranslation = preferredTrLang || item.language_translation || nativeLang || langOriginal || 'en';
    const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editUrl = `/dictation_editor/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editV2Url = `/editor_v2/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;

    const coverUrl = window.maybeCacheBustDictationCover ? window.maybeCacheBustDictationCover(item.cover_url) : (item.cover_url || '');

    const sentencesCount = typeof item.sentences_count === 'number' ? item.sentences_count : (parseInt(item.sentences_count, 10) || 0);
    const langPair = `${langOriginal}`;

    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';
    const coverLoading = 'lazy';

    const menu = this.renderMenuHtml({
      context: 'desk',
      dictationId,
      deskItemId: item.id,
      editUrl,
      editV2Url,
      langOriginal,
      coverUrl,
      availableTranslations,
      title: item.title,
      level: item.level,
      langTranslation,
      isDialog: item.is_dialog,
      audioOrder: item.audio_order,
    });

    return `
      <div class="short-card dictation-kart desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}" data-lang-original="${langOriginal}" data-available-translations="${window.escapeHtml(JSON.stringify(availableTranslations))}">
        <div class="short-thumb" data-href="${openUrl}" role="link" tabindex="0">
          <img src="${coverSrc}" data-cover-url="${coverUrl || ''}" alt="" class="short-cover" loading="${coverLoading}" decoding="async" draggable="false" onerror="this.onerror=null;this.src='/static/data/covers/cover_en.webp'">
          <div class="card-progress-stats">
            <span class="card-medal-badge" data-dictation-id="${dictationId}" style="display:none;">
              <i data-lucide="medal" style="width:14px;height:14px;"></i>
              <span class="card-medal-count">0</span>
            </span>
          </div>
        </div>
        <h3 class="short-title" title="${window.escapeHtml(item.title || 'Без названия')}">${item.title || 'Без названия'}</h3>

        <div class="short-meta short-meta--row">
          <div class="short-meta-left">
            <span class="short-lang-flags">${langPair}</span>
            <span class="short-level">${item.level || '—'}</span>
          </div>
          <div class="short-meta-right">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
          </div>
        </div>

        <div class="short-stats" data-dictation-id="${dictationId}">
          <div class="stats-placeholder"></div>
        </div>

        <div class="short-footer">
          <div class="short-dikt-number">${dictationIdFormatted}</div>
          ${menu}
        </div>
      </div>
    `;
  },

  renderBookCard(item) {
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';

    const langOriginal = d.language_original || d.language_code || 'en';
    const nativeLang = _getUserNativeLang();

    const availableTranslations = Array.isArray(d.translation_languages)
      ? d.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = nativeLang && availableTranslations.includes(nativeLang) ? nativeLang : '';
    const langTranslation = preferredNative || d.language_translation || nativeLang || d.language_code || 'en';

    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;

    const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;
    const editV2Url = `/editor_v2/${dictationId}/${langOriginal}/${langTranslation}`;

    const isOnDesk = window.isDictationOnDesk ? window.isDictationOnDesk(dbId) : false;

    const langPair = `${langOriginal}`;
    const sentencesCount = typeof d.sentences_count === 'number' ? d.sentences_count : (parseInt(d.sentences_count, 10) || 0);

    const menu = this.renderMenuHtml({
      context: 'book',
      dictationId: dbId,
      deskItemId: null,
      editUrl,
      editV2Url,
      langOriginal,
      coverUrl,
      availableTranslations,
      title: d.title,
      level: d.level,
      langTranslation,
      isDialog: d.is_dialog,
      audioOrder: d.audio_order,
    });

    return `
      <div class="short-card dictation-kart dictation-kart--book-row ${isOnDesk ? 'short-card--on-desk' : 'short-card--off-desk'}" data-dictation-id="${dbId}" data-action="toggle-desk" data-edit-url="${editUrl}" data-lang-original="${langOriginal}" data-available-translations="${window.escapeHtml(JSON.stringify(availableTranslations))}">
        <div class="short-thumb">
          <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
        </div>
        <h3 class="short-title">${d.title || 'Без названия'}</h3>

        <div class="short-meta short-meta--row">
          <div class="short-meta-left">
            <span class="short-lang-flags">${langPair}</span>
            <span class="short-level">${d.level || '—'}</span>
          </div>
          <div class="short-meta-right">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
          </div>
        </div>

        <div class="short-footer">
          <button class="short-action-btn short-action-btn--kebab short-desk-toggle-btn" data-action="toggle-desk-explicit" data-dictation-id="${dbId}" title="" aria-label="">
            <i data-lucide="${isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash'}"></i>
          </button>
          <div class="short-dikt-number">${dictationId}</div>
          ${menu}
        </div>
      </div>
    `;
  },

  render(item, opts = {}) {
    const context = opts && opts.context ? String(opts.context) : 'book';
    if (context === 'desk') return this.renderDeskCard(item);
    return this.renderBookCard(item);
  },

  createDeskCardElement(item) {
    const tpl = document.getElementById('dictationKartDeskTemplate');
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      const el = this._createElementFromHtml(this.renderDeskCard(item));
      this._bindHandlers(el);
      this._renderLucide(el);
      return el;
    }

    const node = tpl.content.firstElementChild.cloneNode(true);

    const dictationId = item.dictation_id;
    const dictationIdFormatted = `dict_${dictationId}`;

    const langOriginal = item.language_original || item.language_code || 'en';
    const nativeLang = _getUserNativeLang();

    const availableTranslations = Array.isArray(item.translation_languages)
      ? item.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredTrLang = nativeLang && availableTranslations.includes(nativeLang)
      ? nativeLang
      : (availableTranslations.length ? availableTranslations[0] : '');
    const langTranslation = preferredTrLang || item.language_translation || nativeLang || langOriginal || 'en';
    const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editUrl = `/dictation_editor/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editV2Url = `/editor_v2/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;

    const coverUrl = window.maybeCacheBustDictationCover
      ? window.maybeCacheBustDictationCover(item.cover_url)
      : (item.cover_url || '');
    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';

    const sentencesCount = typeof item.sentences_count === 'number'
      ? item.sentences_count
      : (parseInt(item.sentences_count, 10) || 0);

    node.setAttribute('data-dictation-id', String(dictationId || ''));
    node.setAttribute('data-desk-item-id', String(item.id || ''));
    node.setAttribute('data-lang-original', String(langOriginal || ''));
    node.setAttribute('data-available-translations', String(JSON.stringify(availableTranslations)));

    const thumb = node.querySelector('.short-thumb');
    if (thumb) {
      thumb.setAttribute('data-href', openUrl);
    }

    const img = node.querySelector('img.short-cover');
    if (img) {
      img.src = coverSrc;
      img.setAttribute('data-cover-url', String(coverUrl || ''));
    }

    const titleSlot = node.querySelector('[data-slot="title"]');
    if (titleSlot) {
      titleSlot.textContent = item.title || 'Без названия';
      titleSlot.setAttribute('title', item.title || 'Без названия');
    }

    const langPairSlot = node.querySelector('[data-slot="langPair"]');
    if (langPairSlot) langPairSlot.textContent = `${langOriginal}`;

    const levelSlot = node.querySelector('[data-slot="level"]');
    if (levelSlot) levelSlot.textContent = item.level || '—';

    const sentencesSlot = node.querySelector('[data-slot="sentencesCount"]');
    if (sentencesSlot) sentencesSlot.textContent = String(sentencesCount);

    const diktNumSlot = node.querySelector('[data-slot="dictationIdFormatted"]');
    if (diktNumSlot) diktNumSlot.textContent = dictationIdFormatted;

    const stats = node.querySelector('.short-stats');
    if (stats) stats.setAttribute('data-dictation-id', String(dictationId || ''));

    // Устанавливаем dictation-id на медальку в правом верхнем углу
    const medalBadge = node.querySelector('.card-medal-badge');
    if (medalBadge) {
      medalBadge.setAttribute('data-dictation-id', String(dictationId || ''));
    }

    const menuSlot = node.querySelector('[data-slot="menu"]');
    if (menuSlot) {
      menuSlot.innerHTML = this.renderMenuHtml({
        context: 'desk',
        dictationId,
        deskItemId: item.id,
        editUrl,
        editV2Url,
        langOriginal,
        coverUrl,
        availableTranslations,
        title: item.title,
        level: item.level,
        langTranslation,
        isDialog: item.is_dialog,
        audioOrder: item.audio_order,
      });
    }

    this._bindHandlers(node);
    this._renderLucide(node);
    return node;
  },

  createBookCardElement(item) {
    const tpl = document.getElementById('dictationKartBookTemplate');
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      const el = this._createElementFromHtml(this.renderBookCard(item));
      this._bindHandlers(el);
      this._renderLucide(el);
      return el;
    }

    const node = tpl.content.firstElementChild.cloneNode(true);

    const d = item;
    const coverUrl = d.cover_url || '';
    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';

    const langOriginal = d.language_original || d.language_code || 'en';
    const nativeLang = _getUserNativeLang();

    const availableTranslations = Array.isArray(d.translation_languages)
      ? d.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = nativeLang && availableTranslations.includes(nativeLang) ? nativeLang : '';
    const langTranslation = preferredNative || d.language_translation || nativeLang || d.language_code || 'en';

    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;
    const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;
    const editV2Url = `/editor_v2/${dictationId}/${langOriginal}/${langTranslation}`;

    const isOnDesk = window.isDictationOnDesk ? window.isDictationOnDesk(dbId) : false;
    const sentencesCount = typeof d.sentences_count === 'number' ? d.sentences_count : (parseInt(d.sentences_count, 10) || 0);

    node.setAttribute('data-dictation-id', String(dbId || ''));
    node.setAttribute('data-edit-url', editUrl);
    node.setAttribute('data-lang-original', String(langOriginal || ''));
    node.setAttribute('data-available-translations', String(JSON.stringify(availableTranslations)));

    const img = node.querySelector('.short-thumb img');
    if (img) {
      img.src = coverSrc;
      img.alt = d.title || 'Обложка диктанта';
    }

    const titleSlot = node.querySelector('[data-slot="title"]');
    if (titleSlot) titleSlot.textContent = d.title || 'Без названия';

    const langPairSlot = node.querySelector('[data-slot="langPair"]');
    if (langPairSlot) langPairSlot.textContent = `${langOriginal}`;

    const levelSlot = node.querySelector('[data-slot="level"]');
    if (levelSlot) levelSlot.textContent = d.level || '—';

    const sentencesSlot = node.querySelector('[data-slot="sentencesCount"]');
    if (sentencesSlot) sentencesSlot.textContent = String(sentencesCount);

    const diktNumSlot = node.querySelector('[data-slot="dictationId"]');
    if (diktNumSlot) diktNumSlot.textContent = String(dictationId || '');

    const toggleBtn = node.querySelector('[data-action="toggle-desk-explicit"]');
    if (toggleBtn) {
      toggleBtn.setAttribute('data-dictation-id', String(dbId || ''));
      const icon = toggleBtn.querySelector('i[data-lucide]');
      if (icon) icon.setAttribute('data-lucide', isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash');
    }

    try {
      if (isOnDesk) {
        node.classList.add('short-card--on-desk');
        node.classList.remove('short-card--off-desk');
      } else {
        node.classList.add('short-card--off-desk');
        node.classList.remove('short-card--on-desk');
      }
    } catch (e) {
    }

    const menuSlot = node.querySelector('[data-slot="menu"]');
    if (menuSlot) {
      menuSlot.innerHTML = this.renderMenuHtml({
        context: 'book',
        dictationId: dbId,
        deskItemId: null,
        editUrl,
        editV2Url,
        langOriginal,
        coverUrl,
        availableTranslations,
        title: d.title,
        level: d.level,
        langTranslation,
        isDialog: d.is_dialog,
        audioOrder: d.audio_order,
      });
    }

    this._bindHandlers(node);
    this._renderLucide(node);
    return node;
  },

  /**
   * Проверяет, находится ли диктант на рабочем столе.
   * Читает из IDB кеша desk_items.
   * @param {number|string} dbId - ID диктанта в БД
   * @returns {boolean}
   */
  isDictationOnDesk(dbId) {
    try {
      // Синхронная проверка: читаем из памяти, если есть
      if (Array.isArray(window.__deskItemIds)) {
        return window.__deskItemIds.indexOf(Number(dbId)) !== -1;
      }
    } catch (e) {
    }
    return false;
  },

  /**
   * Добавляет диктант на рабочий стол.
   * @param {number|string} dbId - ID диктанта в БД
   * @returns {Promise<object>}
   */
  async addToDesk(dbId) {
    try { console.log('[DK:addToDesk] ВХОД dbId=', dbId, '| jwt_token=', !!localStorage.getItem('jwt_token')); } catch (e) {}
    var token = (function () {
      try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
    })();
    if (!token) { console.warn('[DK:addToDesk] НЕТ JWT токена'); throw new Error('No auth token'); }

    var resp = await fetch('/desk/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ dictation_id: Number(dbId) })
    });
    try { console.log('[DK:addToDesk] POST /desk/api/items статус=', resp.status); } catch (e) {}
    var data = await resp.json();
    try { console.log('[DK:addToDesk] ответ сервера:', data); } catch (e) {}
    if (!data.success) { console.warn('[DK:addToDesk] сервер вернул success=false:', data); throw new Error(data.error || 'Failed to add to desk'); }

    // Обновляем кеш ID диктантов на столе
    try {
      if (Array.isArray(window.__deskItemIds)) {
        window.__deskItemIds.push(Number(dbId));
      } else {
        window.__deskItemIds = [Number(dbId)];
      }
    } catch (e) {
    }

    // Показываем тост
    try {
      this._showToast('Диктант додано на робочий стіл', { durationMs: 2200 });
    } catch (e) {
    }

    // Обновляем UI десктопа
    try {
      if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
        window.Desktop.loadDeskItems();
      }
    } catch (e) {
    }

    return data;
  },

  /**
   * Убирает диктант с рабочего стола.
   * @param {number|string} itemId - ID записи в desk_items
   * @param {number|string} dictationId - ID диктанта
   * @returns {Promise<object>}
   */
  async removeFromDesk(itemId, dictationId) {
    var token = (function () {
      try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
    })();
    if (!token) throw new Error('No auth token');

    var resp = await fetch('/desk/api/item/' + Number(itemId), {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    var data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed to remove from desk');

    // Обновляем кеш ID диктантов на столе
    try {
      if (Array.isArray(window.__deskItemIds)) {
        var idx = window.__deskItemIds.indexOf(Number(dictationId));
        if (idx !== -1) window.__deskItemIds.splice(idx, 1);
      }
    } catch (e) {
    }

    // Обновляем UI десктопа
    try {
      if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
        window.Desktop.loadDeskItems();
      }
    } catch (e) {
    }

    return data;
  },

  /**
   * Загружает количество завершений для медалек на всех карточках рабочего стола.
   * Вызывается после renderDeskCards().
   */
  async loadCardMedals() {
    try {
      const badges = document.querySelectorAll('.card-medal-badge');
      if (!badges.length) return;

      const token = (() => { try { return localStorage.getItem('jwt_token'); } catch (e) { return null; } })();
      if (!token) return;

      // Собираем все dictation_id
      const ids = [];
      const badgeMap = {};
      badges.forEach((badge) => {
        const id = Number(badge.getAttribute('data-dictation-id'));
        if (Number.isFinite(id) && id > 0) {
          ids.push(id);
          if (!badgeMap[id]) badgeMap[id] = [];
          badgeMap[id].push(badge);
        }
      });

      if (!ids.length) return;

      // Запрашиваем counts для всех диктантов одним запросом
      try {
        const resp = await fetch('/api/statistics/success/count', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ dictation_ids: ids }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && data.counts) {
            for (const dictIdStr in data.counts) {
              const count = Number(data.counts[dictIdStr]) || 0;
              const list = badgeMap[Number(dictIdStr)];
              if (list) {
                list.forEach((badge) => {
                  const countEl = badge.querySelector('.card-medal-count');
                  if (countEl) countEl.textContent = String(count);
                  badge.style.display = count > 0 ? 'inline-flex' : 'none';
                });
              }
            }
            return;
          }
        }
      } catch (e) {
        // Нет интернета — пробуем кеш
      }

      // Режим 2: нет интернета — пробуем localStorage кеш
      const userId = window.UM?.userId || null;
      if (!userId) return;
      for (const id of ids) {
        const cacheKey = 'history_current:' + userId + ':' + id + ':';
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const entry = JSON.parse(cached);
            const count = Number(entry.count) || 0;
            const list = badgeMap[id];
            if (list) {
              list.forEach((badge) => {
                const countEl = badge.querySelector('.card-medal-count');
                if (countEl) countEl.textContent = String(count);
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
              });
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[DictationKart] loadCardMedals error', e);
    }
  },
};

// Глобальные функции для обратной совместимости
window.isDictationOnDesk = function (dbId) {
  return window.DictationKart.isDictationOnDesk(dbId);
};
window.addToDesk = function (dbId) {
  return window.DictationKart.addToDesk(dbId);
};
window.removeFromDesk = function (itemId, dictationId) {
  return window.DictationKart.removeFromDesk(itemId, dictationId);
};
