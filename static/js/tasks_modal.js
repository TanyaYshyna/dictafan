(function () {
  try {
    function libT(key, params, fallback) {
      try {
        if (window.I18n && typeof window.I18n.t === 'function') {
          const v = window.I18n.t(key, params);
          if (v && v !== key) return v;
        }
      } catch (e) {
      }
      if (typeof fallback === 'string') return fallback;
      return String(key || '');
    }

    const _sentencesStateByModal = new WeakMap();
    const _exercisesStateByModal = new WeakMap();

    function escapeHtml(s) {
      try {
        return String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      } catch (e) {
        return '';
      }
    }

    function getToken() {
      try {
        if (window.UM && window.UM.token) return window.UM.token;
      } catch (e) {
      }
      try {
        return localStorage.getItem('jwt_token');
      } catch (e) {
        return null;
      }
    }

    function updateCreateAssignmentExerciseLabelCell(modal, exerciseIdRaw, positions, isDraft) {
      const tbody = document.getElementById('create-assignment-exercisesTableBody');
      if (!tbody) return;
      const idStr = String(exerciseIdRaw);
      const row = tbody.querySelector(`tr[data-exercise-id="${idStr}"]`);
      if (!row) return;
      const td = row.querySelector('td');
      if (!td) return;
      const pos = Array.isArray(positions) ? positions : [];
      const posLabel = pos.length
        ? createAssignmentPositionsToTitle(pos).replace(/^s:\s*/g, '')
        : (isDraft ? 'выбери предложения' : 'весь диктант');
      td.textContent = String(posLabel);
    }

    async function apiRequest(url, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const token = getToken();
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      }

      const response = await fetch(url, Object.assign({}, opts, { headers, cache: 'no-store' }));

      if (response.status === 401 || response.status === 422) {
        try {
          if (window.UM) window.UM.requireAuth();
        } catch (e) {
        }
        throw new Error('Требуется авторизация');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json();
    }

    function showToast(message, opts) {
      const o = opts && typeof opts === 'object' ? opts : {};
      const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 4000;
      const sticky = o && o.sticky === true;

      let el = document.getElementById('auto-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'auto-toast';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = '24px';
        el.style.transform = 'translateX(-50%)';
        el.style.zIndex = '200500';
        el.style.background = 'rgba(0,0,0,0.78)';
        el.style.color = '#fff';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '12px';
        el.style.fontSize = '14px';
        el.style.maxWidth = 'min(92vw, 520px)';
        el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
        el.style.userSelect = 'text';
        el.style.cursor = 'pointer';
        el.style.display = 'none';
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
          try {
            const node = document.getElementById('auto-toast');
            if (node) node.style.display = 'none';
          } catch (e) {
          }
        }, Math.max(0, durationMs));
      }
    }

    function ensureCreateAssignmentModal() {
      return document.getElementById('create-assignment-modal');
    }

    function getTodayIsoDate() {
      try {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
      } catch (e) {
        return '';
      }
    }

    async function loadDictationMetaForAssignmentModal(dictationId) {
      const id = Number(dictationId);
      if (!Number.isFinite(id) || id <= 0) return null;
      const res = await apiRequest(`/api/dictation/${encodeURIComponent(id)}`, { method: 'GET' });
      if (!res || !res.success || !res.dictation) return null;
      return res.dictation;
    }

    async function loadDictationSentencesForAssignmentModal(dictationId, originalLanguageCode) {
      const id = Number(dictationId);
      if (!Number.isFinite(id) || id <= 0) return [];
      const res = await apiRequest(`/api/dictation/${encodeURIComponent(id)}/sentences`, { method: 'GET' });
      if (!res || !res.success || !Array.isArray(res.sentences)) return [];
      let sentences = res.sentences.filter(s => s && typeof s === 'object');
      // Фильтруем только предложения оригинального языка (не переводы)
      if (originalLanguageCode) {
        sentences = sentences.filter(s => String(s.language_code || '') === String(originalLanguageCode));
      }
      return sentences;
    }

    function getCreateAssignmentSentencesState(modal) {
      const st = modal ? _sentencesStateByModal.get(modal) : null;
      if (!st || typeof st !== 'object') return { sentences: [], selectedPositions: null };
      return Object.assign({ sentences: [], selectedPositions: null }, st);
    }

    function setCreateAssignmentSentencesState(modal, state) {
      if (!modal) return;
      const next = (state && typeof state === 'object') ? state : { sentences: [], selectedPositions: null };
      _sentencesStateByModal.set(modal, Object.assign({ sentences: [], selectedPositions: null }, next));
    }

    function renderLucideCheckboxButton(btn, checked, disabled) {
      if (!btn) return;
      btn.dataset.checked = checked ? '1' : '0';
      btn.dataset.disabled = disabled ? '1' : '0';
      btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
      btn.disabled = Boolean(disabled);
      btn.innerHTML = `<i data-lucide="${checked ? 'circle-check-big' : 'circle'}"></i>`;
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: btn });
        }
      } catch (e) {
      }
    }

    function renderCreateAssignmentSentencesTable(modal) {
      const tbody = document.getElementById('create-assignment-sentences-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      const state = getCreateAssignmentSentencesState(modal);
      const sentences = Array.isArray(state.sentences) ? state.sentences : [];
      const selected = Array.isArray(state.selectedPositions) ? new Set(state.selectedPositions.map(x => Number(x)).filter(x => Number.isFinite(x))) : null;

      if (!sentences.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" style="padding:10px; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.assignments.no_sentences'))}</td>`;
        tbody.appendChild(tr);
        return;
      }

      const allPositions = sentences.map(s => Number(s.position)).filter(p => Number.isFinite(p));
      const allSelected = !selected || allPositions.every(p => selected.has(p));

      const headerToggleBtn = document.getElementById('create-assignment-sentences-toggle-all');
      if (headerToggleBtn) {
        renderLucideCheckboxButton(headerToggleBtn, allSelected, !allPositions.length);
        headerToggleBtn.title = allSelected
          ? libT('private_library.assignments.toggle_all_deselect')
          : libT('private_library.assignments.toggle_all_select');
      }

      sentences.forEach((s, idx) => {
        const pos = Number(s.position);
        const fullPos = Number.isFinite(pos) ? pos : null;
        const isChecked = allSelected ? true : (fullPos != null && selected && selected.has(fullPos));
        const labelNum = fullPos != null ? String(fullPos) : String(idx + 1);
        const text = String(s.text || '');

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
        tr.innerHTML = `
          <td class="create-assignment-td-num" style="padding:8px 10px;">${escapeHtml(labelNum)}</td>
          <td class="create-assignment-td-check" style="padding:8px 10px;">
            <button type="button" class="topbar-icon-btn create-assignment-sentence-check" data-position="${escapeHtml(fullPos)}" aria-label="${escapeHtml(libT('private_library.assignments.select_sentence'))}" style="width:32px; height:32px; padding:0; display:inline-flex; align-items:center; justify-content:center;"></button>
          </td>
          <td class="create-assignment-td-text" style="padding:8px 10px;">${escapeHtml(text)}</td>
        `;
        tbody.appendChild(tr);

        const btn = tr.querySelector('.create-assignment-sentence-check');
        renderLucideCheckboxButton(btn, Boolean(isChecked), fullPos == null);
      });

      if (!tbody.dataset.listenerAttached) {
        tbody.dataset.listenerAttached = '1';
        tbody.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('.create-assignment-sentence-check') : null;
          if (!(btn instanceof HTMLButtonElement)) return;
          e.preventDefault();
          e.stopPropagation();

          if (btn.disabled) return;

          const cur = getCreateAssignmentSentencesState(modal);
          const sents = Array.isArray(cur.sentences) ? cur.sentences : [];
          const allPos = sents.map(x => Number(x.position)).filter(p => Number.isFinite(p));

          const p = Number(btn.dataset.position);
          if (!Number.isFinite(p)) return;

          const selectedNow = Array.isArray(cur.selectedPositions)
            ? cur.selectedPositions.map(x => Number(x)).filter(x => Number.isFinite(x))
            : allPos.slice();

          const set = new Set(selectedNow);
          if (set.has(p)) set.delete(p);
          else set.add(p);

          const nextSelected = Array.from(set);
          nextSelected.sort((a, b) => a - b);

          const setAll = allPos.length > 0 && nextSelected.length === allPos.length;
          setCreateAssignmentSentencesState(modal, Object.assign({}, cur, { selectedPositions: setAll ? null : nextSelected }));
          renderCreateAssignmentSentencesTable(modal);

          try {
            syncCreateAssignmentSelectedExerciseFromSentences(modal);
          } catch (e2) {
          }
        });
      }
    }

    function getCreateAssignmentExercisesState(modal) {
      const st = modal ? _exercisesStateByModal.get(modal) : null;
      if (!st || typeof st !== 'object') return { exercises: [], selectedExerciseId: null, draft: null, dirty: false };
      return Object.assign({ exercises: [], selectedExerciseId: null, draft: null, dirty: false }, st);
    }

    function setCreateAssignmentExercisesState(modal, state) {
      if (!modal) return;
      const next = (state && typeof state === 'object') ? state : { exercises: [], selectedExerciseId: null, draft: null, dirty: false };
      _exercisesStateByModal.set(modal, Object.assign({ exercises: [], selectedExerciseId: null, draft: null, dirty: false }, next));
    }

    function setCreateAssignmentExercisesDirty(modal, isDirty) {
      const st = getCreateAssignmentExercisesState(modal);
      st.dirty = !!isDirty;
      setCreateAssignmentExercisesState(modal, st);
      try {
        const star2 = document.getElementById('create-assignment-dictation-unsaved-star');
        if (star2) star2.style.display = st.dirty ? 'inline' : 'none';
      } catch (e) {
      }
    }

    function normalizeExercisePositions(positions) {
      const prepared = [];
      try {
        for (const x of Array.isArray(positions) ? positions : []) {
          const n = Number(x);
          if (!Number.isFinite(n)) continue;
          prepared.push(n);
        }
      } catch (e) {
      }
      const uniq = Array.from(new Set(prepared));
      uniq.sort((a, b) => a - b);
      return uniq;
    }

    function createAssignmentPositionsKey(positions) {
      try {
        return JSON.stringify(normalizeExercisePositions(positions));
      } catch (e) {
        return '[]';
      }
    }

    function createAssignmentPositionsToTitle(positions) {
      const arr = normalizeExercisePositions(positions);
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
      return `s: ${ranges.join(', ')}`;
    }

    function normalizeExerciseItem(raw) {
      try {
        const ex = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
        let pos = ex.positions;
        if (typeof pos === 'string') {
          try {
            pos = JSON.parse(pos);
          } catch (e2) {
            pos = [];
          }
        }
        if (!Array.isArray(pos)) pos = [];
        ex.positions = normalizeExercisePositions(pos);
        return ex;
      } catch (e) {
        return { id: (raw && raw.id) != null ? raw.id : null, positions: [] };
      }
    }

    function getVisibleCreateAssignmentExercises(modal) {
      const st = getCreateAssignmentExercisesState(modal);
      const items = Array.isArray(st.exercises) ? st.exercises : [];
      return items.filter(x => x && x.__deleted !== true);
    }

    function findCreateAssignmentExerciseById(modal, id) {
      const st = getCreateAssignmentExercisesState(modal);
      const items = Array.isArray(st.exercises) ? st.exercises : [];
      return items.find(x => x && Number(x.id) === Number(id)) || null;
    }

    function pickNeighborExerciseId(modal, deletedId) {
      try {
        const st = getCreateAssignmentExercisesState(modal);
        const items = getVisibleCreateAssignmentExercises(modal);
        const list = (Array.isArray(items) ? items : []).filter(x => x && Number.isFinite(Number(x.id)));
        if (!list.length) return null;
        const did = Number(deletedId);
        const idx = list.findIndex(x => Number(x.id) === did);
        if (idx < 0) return Number(list[0].id);
        if (idx < list.length - 1) return Number(list[idx + 1].id);
        if (idx > 0) return Number(list[idx - 1].id);
        return null;
      } catch (e) {
        return null;
      }
    }

    function syncCreateAssignmentSelectedExerciseFromSentences(modal) {
      const st = getCreateAssignmentExercisesState(modal);
      const sent = getCreateAssignmentSentencesState(modal);
      const sel = Array.isArray(sent.selectedPositions) ? normalizeExercisePositions(sent.selectedPositions) : null;
      const positions = sel == null ? [] : sel;

      if (st.draft && st.draft.selected === true) {
        st.draft.positions = positions;
        setCreateAssignmentExercisesState(modal, st);
        setCreateAssignmentExercisesDirty(modal, true);
        try { updateCreateAssignmentExerciseLabelCell(modal, 'draft', st.draft.positions, true); } catch (e2) { }
        return;
      }

      const id = Number(st.selectedExerciseId);
      if (!Number.isFinite(id)) return;
      const ex = findCreateAssignmentExerciseById(modal, id);
      if (!ex) return;
      ex.positions = positions;
      setCreateAssignmentExercisesState(modal, st);
      setCreateAssignmentExercisesDirty(modal, true);
      try { updateCreateAssignmentExerciseLabelCell(modal, String(id), ex.positions, false); } catch (e2) { }
    }

    function renderCreateAssignmentExercisesTable(modal) {
      const tbody = document.getElementById('create-assignment-exercisesTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const st = getCreateAssignmentExercisesState(modal);
      const items = getVisibleCreateAssignmentExercises(modal);
      const rows = items.slice();
      if (st.draft && typeof st.draft === 'object') {
        rows.push(Object.assign({ __draft: true }, st.draft));
      }

      if (!rows.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding:10px; color: rgba(0,0,0,0.55);">Нет упражнений</td>`;
        tbody.appendChild(tr);
        return;
      }

      rows.forEach((ex) => {
        const isDraft = ex && ex.__draft === true;
        const idRaw = isDraft ? 'draft' : String(Number(ex.id));
        const pos = Array.isArray(ex.positions) ? ex.positions : [];
        const canDelete = isDraft ? true : (pos.length > 0);
        const posLabel = pos.length
          ? createAssignmentPositionsToTitle(pos).replace(/^s:\s*/g, '')
          : (isDraft ? 'выбери предложения' : 'весь диктант');

        const tr = document.createElement('tr');
        tr.dataset.exerciseId = idRaw;
        tr.classList.add('exercise-row');

        if (isDraft) {
          if (st.draft && st.draft.selected === true) tr.classList.add('selected');
        } else if (st.selectedExerciseId && Number(st.selectedExerciseId) === Number(ex.id)) {
          tr.classList.add('selected');
        }

        tr.innerHTML = `
          <td style="padding:8px 10px;">${escapeHtml(posLabel)}</td>
        `;
        tbody.appendChild(tr);
      });

      if (!tbody.dataset.listenerAttached) {
        tbody.dataset.listenerAttached = '1';
        tbody.addEventListener('click', (e) => {
          const row = e.target && e.target.closest ? e.target.closest('tr[data-exercise-id]') : null;
          if (!row) return;
          e.preventDefault();
          e.stopPropagation();
          const idRaw = row.dataset.exerciseId;
          if (idRaw === 'draft') {
            selectCreateAssignmentDraftExercise(modal);
            return;
          }
          const id = Number(idRaw);
          if (!Number.isFinite(id)) return;
          selectCreateAssignmentExerciseById(modal, id);
        });
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: tbody });
        }
      } catch (e) {
      }
    }

    function selectCreateAssignmentExerciseById(modal, id) {
      const st = getCreateAssignmentExercisesState(modal);
      st.selectedExerciseId = id;
      if (st.draft) st.draft.selected = false;
      setCreateAssignmentExercisesState(modal, st);

      const ex = findCreateAssignmentExerciseById(modal, id);
      const positions = ex && Array.isArray(ex.positions) ? normalizeExercisePositions(ex.positions) : [];
      const curSent = getCreateAssignmentSentencesState(modal);
      setCreateAssignmentSentencesState(modal, Object.assign({}, curSent, { selectedPositions: positions.length ? positions : null }));
      renderCreateAssignmentSentencesTable(modal);
      renderCreateAssignmentExercisesTable(modal);
    }

    function selectCreateAssignmentDraftExercise(modal) {
      const st = getCreateAssignmentExercisesState(modal);
      if (!st.draft) return;
      st.selectedExerciseId = null;
      st.draft.selected = true;
      setCreateAssignmentExercisesState(modal, st);
      const curSent = getCreateAssignmentSentencesState(modal);
      setCreateAssignmentSentencesState(modal, Object.assign({}, curSent, { selectedPositions: [] }));
      renderCreateAssignmentSentencesTable(modal);
      renderCreateAssignmentExercisesTable(modal);
    }

    function _getCreateAssignmentSelectedPositionsForSave(modal) {
      const st = getCreateAssignmentExercisesState(modal);
      if (st.draft && st.draft.selected === true) {
        const pos = normalizeExercisePositions(st.draft.positions || []);
        return pos;
      }
      const id = Number(st.selectedExerciseId);
      if (Number.isFinite(id)) {
        const ex = findCreateAssignmentExerciseById(modal, id);
        const pos = normalizeExercisePositions(ex && ex.positions ? ex.positions : []);
        return pos;
      }
      const sentenceState = getCreateAssignmentSentencesState(modal);
      const pos = normalizeExercisePositions(Array.isArray(sentenceState.selectedPositions) ? sentenceState.selectedPositions : []);
      return pos;
    }

    function _getCreateAssignmentExercisesPayloadForSave(modal) {
      try {
        const st = getCreateAssignmentExercisesState(modal);
        const items = getVisibleCreateAssignmentExercises(modal);
        const out = [];

        if (st && st.draft && st.draft.selected === true) {
          const pos = normalizeExercisePositions(st.draft.positions || []);
          if (pos && pos.length) {
            out.push({ positions: pos });
          }
        }

        (Array.isArray(items) ? items : []).forEach((ex) => {
          if (!ex || ex.__deleted === true) return;
          const positions = normalizeExercisePositions(ex.positions || []);
          const id = Number(ex.id);
          const title = (ex.title && String(ex.title).trim()) ? String(ex.title).trim() : null;
          const row = { positions };
          if (Number.isFinite(id) && id > 0) row.id = id;
          if (title) row.title = title;
          out.push(row);
        });

        const seen = new Set();
        return out.filter((x) => {
          const key = createAssignmentPositionsKey(x.positions || []);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } catch (e) {
        return [];
      }
    }

    async function openCreateAssignmentModal(dictationId) {
      const modal = ensureCreateAssignmentModal();
      const options = arguments && arguments.length > 1 ? arguments[1] : null;
      if (!modal) return;

      try {
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.removeAttribute('hidden');
      } catch (e) {
      }

      try {
        if (window.I18n && typeof window.I18n.ensureLoaded === 'function') {
          await window.I18n.ensureLoaded();
        }
      } catch (e) {
      }

      try {
        const z = parseInt(String(modal.style.zIndex || '0'), 10);
        modal.style.zIndex = String(Number.isFinite(z) ? Math.max(z, 100200) : 100200);
      } catch (e) {
      }

      try {
        if (options && typeof options === 'object') {
          if (options.edit_assignment_id != null) {
            modal.dataset.editAssignmentId = String(options.edit_assignment_id);
          } else {
            delete modal.dataset.editAssignmentId;
          }
        } else {
          delete modal.dataset.editAssignmentId;
        }
      } catch (e) {
      }

      const today = getTodayIsoDate();
      try {
        modal.__assignmentDays = [{ date: today, required_completions: 1 }];
      } catch (e) {
      }

      const idInput = document.getElementById('create-assignment-dictation-id');
      if (idInput) idInput.value = String(dictationId || '');

      let dictationLanguageCode = null;
      try {
        const meta = await loadDictationMetaForAssignmentModal(dictationId);
        if (meta && meta.language_code) {
          dictationLanguageCode = String(meta.language_code);
        }
        const titleEl = document.getElementById('create-assignment-dictation-title');
        const coverImg = document.getElementById('create-assignment-cover-img');
        const metaEl = document.getElementById('create-assignment-cover-meta');
        if (titleEl) {
          const title = meta && meta.title ? String(meta.title) : '';
          titleEl.innerHTML = `${escapeHtml(title)}<span id="create-assignment-dictation-unsaved-star" class="unsaved-star" style="display:none;">*</span>`;
        }
        if (coverImg) {
          const url = meta && meta.cover_url ? String(meta.cover_url) : '';
          const src = (window.maybeCacheBustDictationCover && url) ? window.maybeCacheBustDictationCover(url) : url;
          coverImg.src = src || '/static/data/covers/cover_en.webp';
          coverImg.onerror = () => {
            try { coverImg.onerror = null; } catch (e) { }
            coverImg.src = '/static/data/covers/cover_en.webp';
          };
        }
        if (metaEl) {
          const level = meta && meta.level ? String(meta.level) : '—';
          const lang = meta && meta.language_code ? String(meta.language_code) : '—';
          metaEl.textContent = `${lang.toUpperCase()} · ${level}`;
        }
      } catch (e) {
      }

      try {
        const sentences = await loadDictationSentencesForAssignmentModal(dictationId, dictationLanguageCode);
        setCreateAssignmentSentencesState(modal, { sentences, selectedPositions: null });
        renderCreateAssignmentSentencesTable(modal);
      } catch (e) {
        setCreateAssignmentSentencesState(modal, { sentences: [], selectedPositions: null });
        renderCreateAssignmentSentencesTable(modal);
      }

      setCreateAssignmentExercisesState(modal, { exercises: [], selectedExerciseId: null, draft: null, dirty: false });
      setCreateAssignmentExercisesDirty(modal, false);

      try {
        const res = await apiRequest(`/api/dictation/${encodeURIComponent(String(dictationId))}/exercises`, { method: 'GET' });
        const itemsRaw = (res && res.success && Array.isArray(res.exercises)) ? res.exercises : [];
        const items = itemsRaw.map(normalizeExerciseItem);
        const st = getCreateAssignmentExercisesState(modal);
        st.exercises = items;
        st.draft = null;
        st.selectedExerciseId = (items && items.length && items[0].id) ? Number(items[0].id) : null;
        setCreateAssignmentExercisesState(modal, st);

        renderCreateAssignmentExercisesTable(modal);
        if (st.selectedExerciseId) {
          selectCreateAssignmentExerciseById(modal, Number(st.selectedExerciseId));
        }
      } catch (e) {
        renderCreateAssignmentExercisesTable(modal);
      }

      const toggleAllBtn = document.getElementById('create-assignment-sentences-toggle-all');
      if (toggleAllBtn) {
        toggleAllBtn.onclick = () => {
          const cur = getCreateAssignmentSentencesState(modal);
          const sents = Array.isArray(cur.sentences) ? cur.sentences : [];
          const allPos = sents.map(x => Number(x.position)).filter(p => Number.isFinite(p));
          if (!allPos.length) return;

          const selected = Array.isArray(cur.selectedPositions)
            ? new Set(cur.selectedPositions.map(x => Number(x)).filter(x => Number.isFinite(x)))
            : null;
          const allSelected = !selected || allPos.every(p => selected.has(p));

          setCreateAssignmentSentencesState(modal, Object.assign({}, cur, { selectedPositions: allSelected ? [] : null }));
          renderCreateAssignmentSentencesTable(modal);

          try {
            syncCreateAssignmentSelectedExerciseFromSentences(modal);
          } catch (e2) {
          }
        };
      }

      const closeBtn = document.getElementById('create-assignment-close');
      const saveBtn = document.getElementById('create-assignment-save');

      const persistExercises = async () => {
        const dictationIdRaw = idInput ? String(idInput.value || '').trim() : '';
        if (!dictationIdRaw) {
          showToast('Не найден dictation_id');
          return false;
        }

        const dictation_id = Number(dictationIdRaw);
        if (!Number.isFinite(dictation_id) || dictation_id <= 0) {
          showToast('Неверный dictation_id');
          return false;
        }

        const selectedPositions = _getCreateAssignmentSelectedPositionsForSave(modal);

        try {
          const exSt = getCreateAssignmentExercisesState(modal);
          const isDraftSelected = Boolean(exSt && exSt.draft && exSt.draft.selected === true);
          if (isDraftSelected && Array.isArray(selectedPositions) && selectedPositions.length === 0) {
            showToast('Выбери хотя бы одно предложение');
            return false;
          }
        } catch (e0) {
        }

        try {
          const exSt = getCreateAssignmentExercisesState(modal);
          if (exSt && exSt.dirty === true) {
            const exercisesPayload = _getCreateAssignmentExercisesPayloadForSave(modal);
            const reconcile = await apiRequest(`/api/dictation/${encodeURIComponent(String(dictation_id))}/exercises/reconcile`, {
              method: 'POST',
              body: JSON.stringify({ exercises: exercisesPayload }),
            });
            if (!reconcile || reconcile.success !== true) {
              const msg = reconcile && reconcile.error ? String(reconcile.error) : 'Не удалось сохранить упражнения';
              showToast(msg, { durationMs: 3500 });
              return false;
            }

            try {
              const itemsRaw = (reconcile && Array.isArray(reconcile.exercises)) ? reconcile.exercises : [];
              const items = itemsRaw.map(normalizeExerciseItem);
              const next = getCreateAssignmentExercisesState(modal);
              next.exercises = items;
              next.draft = null;
              if (next.selectedExerciseId && !findCreateAssignmentExerciseById(modal, Number(next.selectedExerciseId))) {
                next.selectedExerciseId = (items && items.length && items[0].id) ? Number(items[0].id) : null;
              }
              setCreateAssignmentExercisesState(modal, next);
              setCreateAssignmentExercisesDirty(modal, false);
              renderCreateAssignmentExercisesTable(modal);

              // Инвалидируем кэш упражнений в IndexedDB, чтобы карточка диктанта не показывала устаревший список
              try {
                const idb = window.IdbManager;
                if (idb && typeof idb.idbDelete === 'function') {
                  const cacheKey = `exercises:${String(dictation_id)}`;
                  idb.idbDelete('dictations', cacheKey).catch(() => {});
                }
              } catch (eCache) {
              }
            } catch (e) {
              try { setCreateAssignmentExercisesDirty(modal, false); } catch (e2) { }
            }
          }
        } catch (e) {
          showToast('Ошибка сохранения упражнений', { durationMs: 2500 });
          return false;
        }

        showToast('Упражнения сохранены', { durationMs: 2500 });
        return true;
      };

      const close = () => {
        try {
          modal.style.display = 'none';
          modal.style.visibility = '';
          modal.style.opacity = '';
        } catch (e) { }
      };

      const maybeCloseWithPrompt = async () => {
        const st = getCreateAssignmentExercisesState(modal);
        if (!st || st.dirty !== true) {
          close();
          return;
        }

        if (window.DesktopConfirmModal && typeof window.DesktopConfirmModal.open === 'function') {
          window.DesktopConfirmModal.open({
            showSave: true,
            onDiscard: () => close(),
            onSave: async () => {
              const ok = await persistExercises();
              if (ok) close();
            },
          });
          return;
        }

        const wantSave = window.confirm('Есть несохранённые изменения. Сохранить и выйти?');
        if (wantSave) {
          const ok = await persistExercises();
          if (ok) close();
          return;
        }

        const wantDiscard = window.confirm('Выйти без сохранения?');
        if (wantDiscard) {
          close();
          return;
        }
      };

      if (closeBtn) closeBtn.onclick = () => { void maybeCloseWithPrompt(); };
      modal.onclick = (e) => {
        if (e.target === modal) { void maybeCloseWithPrompt(); }
      };

      const createBtn = document.getElementById('create-assignment-exercise-create');
      if (createBtn && createBtn.dataset.listenerAttached !== '1') {
        createBtn.dataset.listenerAttached = '1';
        createBtn.addEventListener('click', () => {
          const st = getCreateAssignmentExercisesState(modal);

          if (st.draft && st.draft.selected === true) {
            const pos = normalizeExercisePositions(st.draft.positions || []);
            if (!pos.length) {
              try { showToast('Выбери хотя бы одно предложение'); } catch (e) { }
              return;
            }
            const key = createAssignmentPositionsKey(pos);
            const exists = getVisibleCreateAssignmentExercises(modal).some(x => x && createAssignmentPositionsKey(x.positions || []) === key);
            if (exists) {
              try { showToast('Такое упражнение уже существует'); } catch (e) { }
              return;
            }

            const nextId = -Math.floor(Math.random() * 1000000000) - 1;
            st.exercises = Array.isArray(st.exercises) ? st.exercises : [];
            st.exercises.push({ id: nextId, positions: pos });
            st.draft = null;
            st.selectedExerciseId = nextId;
          }

          st.draft = { positions: [], selected: true };
          st.selectedExerciseId = null;
          setCreateAssignmentExercisesState(modal, st);
          setCreateAssignmentExercisesDirty(modal, true);

          const curSent = getCreateAssignmentSentencesState(modal);
          setCreateAssignmentSentencesState(modal, Object.assign({}, curSent, { selectedPositions: [] }));
          renderCreateAssignmentSentencesTable(modal);
          renderCreateAssignmentExercisesTable(modal);
        });
      }

      const deleteBtn = document.getElementById('create-assignment-exercise-delete');
      if (deleteBtn && deleteBtn.dataset.listenerAttached !== '1') {
        deleteBtn.dataset.listenerAttached = '1';
        deleteBtn.addEventListener('click', () => {
          const st = getCreateAssignmentExercisesState(modal);
          if (st.draft && st.draft.selected === true) {
            st.draft = null;
            setCreateAssignmentExercisesState(modal, st);
            setCreateAssignmentExercisesDirty(modal, true);
            renderCreateAssignmentExercisesTable(modal);

            try {
              const nextId = pickNeighborExerciseId(modal, null);
              if (Number.isFinite(nextId)) {
                selectCreateAssignmentExerciseById(modal, nextId);
              }
            } catch (e2) {
            }
            return;
          }

          const id = Number(st.selectedExerciseId);
          if (!Number.isFinite(id)) return;

          let nextId = null;
          try {
            const beforeIds = getVisibleCreateAssignmentExercises(modal)
              .map(x => Number(x && x.id))
              .filter(x => Number.isFinite(x));
            const idx = beforeIds.findIndex(x => x === id);
            const afterIds = beforeIds.filter(x => x !== id);
            if (afterIds.length) {
              if (idx >= 0 && idx < afterIds.length) nextId = afterIds[idx];
              else nextId = afterIds[afterIds.length - 1];
            }
          } catch (e) {
            nextId = null;
          }

          const ex = findCreateAssignmentExerciseById(modal, id);
          if (!ex) return;
          const pos = Array.isArray(ex.positions) ? ex.positions : [];
          if (!pos.length) {
            try { showToast('Упражнение "весь диктант" удалить нельзя'); } catch (e) { }
            return;
          }
          try {
            st.exercises = (Array.isArray(st.exercises) ? st.exercises : []).filter(x => Number(x && x.id) !== id);
          } catch (e0) {
            ex.__deleted = true;
          }
          st.selectedExerciseId = Number.isFinite(nextId) ? nextId : null;
          setCreateAssignmentExercisesState(modal, st);
          setCreateAssignmentExercisesDirty(modal, true);

          if (Number.isFinite(nextId)) {
            selectCreateAssignmentExerciseById(modal, nextId);
          } else {
            renderCreateAssignmentExercisesTable(modal);
            try {
              const curSent = getCreateAssignmentSentencesState(modal);
              setCreateAssignmentSentencesState(modal, Object.assign({}, curSent, { selectedPositions: null }));
              renderCreateAssignmentSentencesTable(modal);
            } catch (e2) {
            }
          }
        });
      }

      if (saveBtn) {
        saveBtn.onclick = async () => {
          try {
            await persistExercises();
          } catch (e) {
            showToast((e && e.message) ? String(e.message) : 'Ошибка сохранения', { durationMs: 20000, sticky: true });
          }
        };
      }

      modal.style.display = 'flex';

      if (modal.dataset.i18nListenerAttached !== '1') {
        modal.dataset.i18nListenerAttached = '1';
        window.addEventListener('ui-language-changed', () => {
          try {
            const t = document.getElementById('create-assignment-modal-title') || document.querySelector('.create-assignment-modal-title-text');
            if (t) t.textContent = libT('private_library.assignments.exercises_modal_title', null, 'Все упражнения');
          } catch (e) {
          }
          try {
            const h = document.getElementById('create-assignment-exercises-col-title');
            if (h) h.textContent = libT('private_library.assignments.exercises_column', null, 'Упражнения');
          } catch (e) {
          }
          try {
            const h = document.getElementById('create-assignment-sentences-col-text');
            if (h) h.textContent = libT('private_library.assignments.text_column', null, 'Текст');
          } catch (e) {
          }
        });
      }

      try {
        const t = document.getElementById('create-assignment-modal-title') || document.querySelector('.create-assignment-modal-title-text');
        if (t) {
          t.textContent = libT('private_library.assignments.exercises_modal_title', null, 'Все упражнения');
        }
      } catch (e) {
      }

      try {
        const h = document.getElementById('create-assignment-exercises-col-title');
        if (h) h.textContent = libT('private_library.assignments.exercises_column', null, 'Упражнения');
      } catch (e) {
      }

      try {
        const h = document.getElementById('create-assignment-sentences-col-text');
        if (h) h.textContent = libT('private_library.assignments.text_column', null, 'Текст');
      } catch (e) {
      }

      try {
        const toggleAllBtn = document.getElementById('create-assignment-sentences-toggle-all');
        if (toggleAllBtn) {
          toggleAllBtn.title = libT('private_library.assignments.toggle_all_select');
        }
      } catch (e) {
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }
    }

    window.openCreateAssignmentModal = openCreateAssignmentModal;
    window.openTasksModal = openCreateAssignmentModal;
  } catch (e) {
  }
})();
