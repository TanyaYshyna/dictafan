(function () {
  try {
    if (window.PlanTasksModal) return;

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

    function escapeHtml(value) {
      const s = String(value == null ? '' : value);
      return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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
          try { el.style.display = 'none'; } catch (e) { }
        }, durationMs);
      }
    }

    function getTodayIsoDate() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function ensurePlanTasksModal() {
      return document.getElementById('plan-tasks-modal');
    }

    const _planTasksStore = new WeakMap();

    function _ensurePlanTasksStore(modal) {
      if (!modal) return { tasks: [], exercises: [], currentId: null, dirty: false };
      const existing = _planTasksStore.get(modal);
      if (existing) return existing;
      const init = { tasks: [], exercises: [], currentId: null, dirty: false };
      _planTasksStore.set(modal, init);
      return init;
    }

    function _sortPlanTasks(items) {
      const tasks = Array.isArray(items) ? items.slice() : [];
      tasks.sort((a, b) => {
        const da = String(a && a.date_plan ? a.date_plan : '');
        const db = String(b && b.date_plan ? b.date_plan : '');
        if (da < db) return -1;
        if (da > db) return 1;
        const ia = (a && a.id != null) ? Number(a.id) : NaN;
        const ib = (b && b.id != null) ? Number(b.id) : NaN;
        if (Number.isFinite(ia) && Number.isFinite(ib)) return ia - ib;
        return 0;
      });
      return tasks;
    }

    function _getPlanTasksState(modal) {
      return _ensurePlanTasksStore(modal).tasks;
    }

    function _setPlanTasksState(modal, tasks) {
      const st = _ensurePlanTasksStore(modal);
      st.tasks = _sortPlanTasks(tasks);
    }

    function _getPlanTasksExercises(modal) {
      return _ensurePlanTasksStore(modal).exercises;
    }

    function _setPlanTasksExercises(modal, exercises) {
      const st = _ensurePlanTasksStore(modal);
      st.exercises = Array.isArray(exercises) ? exercises.slice() : [];
    }

    function _getPlanTasksCurrentId(modal) {
      return _ensurePlanTasksStore(modal).currentId;
    }

    function _setPlanTasksCurrentId(modal, id) {
      const st = _ensurePlanTasksStore(modal);
      st.currentId = (id == null || id === '') ? null : Number(id);
    }

    function _setPlanTasksDirty(modal, dirty) {
      _ensurePlanTasksStore(modal).dirty = Boolean(dirty);
    }

    function _getPlanTasksDirty(modal) {
      return Boolean(_ensurePlanTasksStore(modal).dirty);
    }

    function _findPlanTaskIndexById(tasks, id) {
      const idNum = Number(id);
      if (!Array.isArray(tasks) || !Number.isFinite(idNum)) return -1;
      return tasks.findIndex(t => Number(t && t.id) === idNum);
    }

    function _planPositionsKey(pos) {
      try {
        const arr = Array.isArray(pos)
          ? pos.map(x => Number(x)).filter(x => Number.isFinite(x)).sort((a, b) => a - b)
          : [];
        return arr.join(',');
      } catch (e) {
        return '';
      }
    }

    function _planExerciseLabel(ex) {
      try {
        if (!ex) return '';
        const t = (ex.title != null) ? String(ex.title).trim() : '';
        if (t) return t;
        const pos = Array.isArray(ex.positions) ? ex.positions : [];
        if (!pos.length) return 'Весь диктант';
        return `s: ${pos.join(', ')}`;
      } catch (e) {
        return '';
      }
    }

    function _getPlanTasksContext(modal) {
      const idInput = document.getElementById('plan-tasks-dictation-id');
      const dictationIdRaw = idInput ? String(idInput.value || '').trim() : '';
      const dictationIdNum = Number(dictationIdRaw);
      const groupSel = document.getElementById('plan-tasks-group');
      const groupIdNum = groupSel ? Number(groupSel.value) : NaN;
      return { dictationIdNum, groupIdNum };
    }

    function _buildPlanTasksPayload(modal) {
      const tasks = _getPlanTasksState(modal);
      return (Array.isArray(tasks) ? tasks : []).map(t => ({
        id: t && t.id != null ? Number(t.id) : null,
        positions: Array.isArray(t && t.positions) ? t.positions : [],
        date_plan: t && t.date_plan ? String(t.date_plan) : '',
        repeat_count: t && t.repeat_count != null ? Number(t.repeat_count) : 1,
      }));
    }

    function _validatePlanTasksPayload(payload) {
      const items = Array.isArray(payload) ? payload : [];
      const seen = new Set();
      for (const t of items) {
        if (!t.date_plan) return 'Заполни дату во всех строках';
        if (!Number.isFinite(Number(t.repeat_count)) || Number(t.repeat_count) <= 0) return 'Повторы должны быть >= 1';

        const k = `${String(t.date_plan)}|${_planPositionsKey(Array.isArray(t.positions) ? t.positions : [])}`;
        if (seen.has(k)) return 'Нельзя сохранять две одинаковые строки (одна дата + одно упражнение)';
        seen.add(k);
      }
      return null;
    }

    const _planTasksAutosaveTimers = new WeakMap();
    const _planTasksAutosaveInFlight = new WeakMap();

    async function _reconcilePlanTasksNow(modal, opts) {
      const silent = Boolean(opts && opts.silent);
      if (!modal) return;

      const { dictationIdNum, groupIdNum } = _getPlanTasksContext(modal);
      if (!Number.isFinite(dictationIdNum) || dictationIdNum <= 0) return;
      if (!Number.isFinite(groupIdNum) || groupIdNum <= 0) return;
      if (_planTasksAutosaveInFlight.get(modal) === true) return;

      const payload = _buildPlanTasksPayload(modal);
      const validationError = _validatePlanTasksPayload(payload);
      if (validationError) {
        if (!silent) showToast(validationError);
        return;
      }

      _planTasksAutosaveInFlight.set(modal, true);
      try {
        const res = await apiRequest(
          `/api/plan_tasks/teacher/group/${encodeURIComponent(String(groupIdNum))}/dictation/${encodeURIComponent(String(dictationIdNum))}/reconcile`,
          { method: 'POST', body: JSON.stringify({ tasks: payload }) }
        );
        if (!res || res.success !== true) {
          if (!silent) {
            const msg = res && res.error ? String(res.error) : 'Не удалось сохранить планы';
            showToast(msg, { durationMs: 3500 });
          }
          return;
        }

        const next = (res && Array.isArray(res.tasks)) ? res.tasks : [];
        _setPlanTasksState(modal, next.map(t => ({
          id: t && t.id != null ? Number(t.id) : null,
          positions: Array.isArray(t && t.positions) ? t.positions : [],
          date_plan: t && t.date_plan ? String(t.date_plan) : '',
          repeat_count: t && t.repeat_count != null ? Number(t.repeat_count) : 1,
        })));
        _setPlanTasksDirty(modal, false);
        _renderPlanTasksTable(modal);
      } catch (e) {
        if (!silent) showToast('Ошибка сохранения планов', { durationMs: 2500 });
      } finally {
        _planTasksAutosaveInFlight.set(modal, false);
        if (_getPlanTasksDirty(modal)) _schedulePlanTasksAutosave(modal);
      }
    }

    function _schedulePlanTasksAutosave(modal) {
      if (!modal) return;
      _setPlanTasksDirty(modal, true);

      const prev = _planTasksAutosaveTimers.get(modal);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        _planTasksAutosaveTimers.delete(modal);
        void _reconcilePlanTasksNow(modal, { silent: true });
      }, 450);
      _planTasksAutosaveTimers.set(modal, t);
    }

    function _ensurePlanTaskEditOverlay() {
      let el = document.getElementById('plan-task-edit-overlay');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'plan-task-edit-overlay';
      el.className = 'plan-task-edit-overlay';

      el.innerHTML = `
        <div class="plan-task-edit-card" role="dialog" aria-modal="true">
          <div class="plan-task-edit-header">
            <div class="plan-task-edit-title" id="plan-task-edit-title">${escapeHtml(libT('profile.common.save', null, 'Сохранить'))}</div>
            <button type="button" id="plan-task-edit-close" class="modal-close" title="${escapeHtml(libT('profile.common.close', null, 'Закрыть'))}">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="plan-task-edit-body">
            <div class="plan-task-edit-row">
              <input id="plan-task-edit-date" class="plan-task-edit-input" type="date" />
              <select id="plan-task-edit-ex" class="plan-task-edit-input"></select>
              <input id="plan-task-edit-count" class="plan-task-edit-input" type="number" min="1" step="1" />
            </div>
            <div class="plan-task-edit-actions">
              <button type="button" id="plan-task-edit-save" class="plan-task-edit-save-btn">${escapeHtml(libT('profile.common.save', null, 'Сохранить'))}</button>
            </div>
          </div>
        </div>
      `;

      el.addEventListener('click', (e) => {
        if (e && e.target === el) {
          try { e.preventDefault(); } catch (e2) { }
          try { e.stopPropagation(); } catch (e2) { }
          return;
        }
      });

      document.body.appendChild(el);

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: el });
        }
      } catch (e) {
      }

      return el;
    }

    function _closePlanTaskEditor() {
      const el = document.getElementById('plan-task-edit-overlay');
      if (el) el.style.display = 'none';
    }

    function _maybeClosePlanTaskEditor() {
      const overlay = document.getElementById('plan-task-edit-overlay');
      if (!overlay) return;

      try {
        const modeNow = String(overlay.dataset.mode || 'edit');
        const isDelete = modeNow === 'delete';
        if (!isDelete) {
          const dEl = overlay.querySelector('#plan-task-edit-date');
          const exEl = overlay.querySelector('#plan-task-edit-ex');
          const cEl = overlay.querySelector('#plan-task-edit-count');

          const curDate = dEl ? String(dEl.value || '').trim() : '';
          const curEx = exEl ? String(exEl.value || '').trim() : '';
          const curCount = cEl ? String(cEl.value || '').trim() : '';

          const initDate = String(overlay.dataset.initDate || '');
          const initEx = String(overlay.dataset.initEx || '');
          const initCount = String(overlay.dataset.initCount || '');

          const dirty = (curDate !== initDate) || (curEx !== initEx) || (curCount !== initCount);
          if (dirty) {
            const ok = confirm('Закрыть без сохранения?');
            if (!ok) return;
          }
        }
      } catch (e) {
      }

      _closePlanTaskEditor();
    }

    function _fillPlanTaskEditorExercises(exSel, exercises, positions) {
      if (!exSel) return;
      exSel.innerHTML = '';
      (Array.isArray(exercises) ? exercises : []).forEach(ex => {
        const opt = document.createElement('option');
        opt.value = String(ex && ex.id != null ? ex.id : '');
        opt.textContent = _planExerciseLabel(ex);
        exSel.appendChild(opt);
      });

      const posKey = _planPositionsKey(Array.isArray(positions) ? positions : []);
      const found = (Array.isArray(exercises) ? exercises : []).find(ex => _planPositionsKey(ex && ex.positions ? ex.positions : []) === posKey);
      if (found && found.id != null) {
        exSel.value = String(found.id);
      } else {
        const first = (Array.isArray(exercises) ? exercises : [])[0];
        if (first && first.id != null) exSel.value = String(first.id);
      }
    }

    function _openPlanTaskEditor(modal, opts) {
      const el = _ensurePlanTaskEditOverlay();
      const dateInput = el.querySelector('#plan-task-edit-date');
      const exSel = el.querySelector('#plan-task-edit-ex');
      const countInput = el.querySelector('#plan-task-edit-count');
      const saveBtn = el.querySelector('#plan-task-edit-save');
      const closeBtn = el.querySelector('#plan-task-edit-close');
      const titleEl = el.querySelector('#plan-task-edit-title');

      const mode = opts && opts.mode ? String(opts.mode) : 'edit';
      const taskId = (opts && opts.id != null) ? Number(opts.id) : null;
      const idxFallback = Number(opts && opts.idx != null ? opts.idx : -1);

      const tasks = Array.isArray(_getPlanTasksState(modal)) ? _getPlanTasksState(modal) : [];
      const exercises = Array.isArray(_getPlanTasksExercises(modal)) ? _getPlanTasksExercises(modal) : [];
      const idx = (taskId != null) ? _findPlanTaskIndexById(tasks, taskId) : idxFallback;
      const row = (idx >= 0 && idx < tasks.length) ? tasks[idx] : null;

      try { el.dataset.mode = mode; } catch (e) { }
      try { el.dataset.taskId = (taskId != null ? String(taskId) : ''); } catch (e) { }

      const initDate = (row && row.date_plan) ? String(row.date_plan) : getTodayIsoDate();
      const initPositions = (row && Array.isArray(row.positions)) ? row.positions : [];
      const initRepeat = (row && row.repeat_count != null) ? Number(row.repeat_count) : 1;

      if (dateInput) dateInput.value = initDate;
      if (countInput) countInput.value = String((Number.isFinite(initRepeat) && initRepeat > 0 ? initRepeat : 1) || 1);
      _fillPlanTaskEditorExercises(exSel, exercises, initPositions);

      try {
        el.dataset.initDate = dateInput ? String(dateInput.value || '').trim() : '';
        el.dataset.initEx = exSel ? String(exSel.value || '').trim() : '';
        el.dataset.initCount = countInput ? String(countInput.value || '').trim() : '';
      } catch (e) {
      }

      const isDelete = mode === 'delete';
      if (dateInput) dateInput.disabled = isDelete;
      if (exSel) exSel.disabled = isDelete;
      if (countInput) countInput.disabled = isDelete;
      if (saveBtn) saveBtn.textContent = isDelete ? 'Удалить' : libT('profile.common.save', null, 'Сохранить');
      if (titleEl) titleEl.textContent = isDelete ? 'Удалить' : libT('profile.common.save', null, 'Сохранить');

      if (!el.dataset.listenersAttached) {
        el.dataset.listenersAttached = '1';
        if (closeBtn) closeBtn.addEventListener('click', () => { _maybeClosePlanTaskEditor(); });
        if (saveBtn) {
          saveBtn.addEventListener('click', async () => {
            const overlay = document.getElementById('plan-task-edit-overlay');
            if (!overlay) return;

            if (saveBtn.disabled) return;
            saveBtn.disabled = true;

            try {
              const modeNow = String(overlay.dataset.mode || 'edit');
              const idNowRaw = String(overlay.dataset.taskId || '').trim();
              const idNow = idNowRaw ? Number(idNowRaw) : null;

              const dEl = overlay.querySelector('#plan-task-edit-date');
              const exEl = overlay.querySelector('#plan-task-edit-ex');
              const cEl = overlay.querySelector('#plan-task-edit-count');

              const datePlan = dEl ? String(dEl.value || '').trim() : '';
              const exId = exEl ? String(exEl.value || '').trim() : '';
              const repeatRaw = cEl ? parseInt(String(cEl.value || '1'), 10) : 1;
              const repeatCount = Number.isFinite(repeatRaw) && repeatRaw > 0 ? repeatRaw : 1;

              if (!datePlan) {
                showToast('Укажи дату', { durationMs: 2200 });
                return;
              }

              const tasksNow = Array.isArray(_getPlanTasksState(modal)) ? _getPlanTasksState(modal) : [];
              const exercisesNow = Array.isArray(_getPlanTasksExercises(modal)) ? _getPlanTasksExercises(modal) : [];
              const exObj = exercisesNow.find(x => String(x && x.id != null ? x.id : '') === String(exId));
              const positions = exObj && Array.isArray(exObj.positions)
                ? exObj.positions.map(p => Number(p)).filter(p => Number.isFinite(p))
                : [];

              if (modeNow !== 'delete') {
                const isDup = tasksNow.some((t) => {
                  if (modeNow !== 'new' && idNow != null && Number(t && t.id) === Number(idNow)) return false;
                  const sameDate = String(t && t.date_plan ? t.date_plan : '') === datePlan;
                  const samePos = _planPositionsKey(t && t.positions ? t.positions : []) === _planPositionsKey(positions);
                  return sameDate && samePos;
                });
                if (isDup) {
                  showToast('Нельзя сохранять две одинаковые строки (одна дата + одно упражнение)', { durationMs: 3200 });
                  return;
                }
              }

              const next = tasksNow.slice();

              if (modeNow === 'new') {
                next.push({ id: null, date_plan: datePlan, positions, repeat_count: repeatCount });
                _setPlanTasksState(modal, next);
              } else if (modeNow === 'delete') {
                if (idNow != null) {
                  const delIdx = _findPlanTaskIndexById(next, idNow);
                  if (delIdx >= 0) next.splice(delIdx, 1);
                  _setPlanTasksState(modal, next);
                }
              } else {
                if (idNow != null) {
                  const editIdx = _findPlanTaskIndexById(next, idNow);
                  if (editIdx >= 0) next[editIdx] = Object.assign({}, next[editIdx], { date_plan: datePlan, positions, repeat_count: repeatCount });
                  _setPlanTasksState(modal, next);
                }
              }

              await _reconcilePlanTasksNow(modal, { silent: false });
              _closePlanTaskEditor();
            } finally {
              saveBtn.disabled = false;
            }
          });
        }
      }

      el.style.display = 'flex';

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: el });
        }
      } catch (e) {
      }
    }

    async function _loadGroupsForPlanTasksModal() {
      const res = await apiRequest('/groups/api/my', { method: 'GET' });
      if (!res || !res.success) return [];
      const groups = Array.isArray(res.groups) ? res.groups : [];

      const personal = groups.filter(g => g && g.is_personal === true);
      const activeTeacher = groups.filter(g => g && !g.archived_at && g.is_personal !== true);

      const out = [];
      (personal || []).forEach(g => out.push(g));
      (activeTeacher || []).forEach(g => out.push(g));
      return out;
    }

    function _fillPlanTasksGroupsSelect(groups, preferredGroupId) {
      const sel = document.getElementById('plan-tasks-group');
      if (!sel) return null;
      sel.innerHTML = '';

      const items = Array.isArray(groups) ? groups : [];
      items.forEach(g => {
        const opt = document.createElement('option');
        opt.value = String(g && g.id != null ? g.id : '');
        const isPersonal = Boolean(g && g.is_personal === true);
        const title = g && g.title ? String(g.title) : '';
        opt.textContent = isPersonal ? 'Моя группа' : title;
        sel.appendChild(opt);
      });

      const pick = (() => {
        const pref = Number(preferredGroupId);
        if (Number.isFinite(pref) && pref > 0 && items.some(g => Number(g && g.id) === pref)) return String(pref);
        const p = items.find(g => g && g.is_personal === true);
        if (p && p.id != null) return String(p.id);
        const a = items.find(g => g && !g.archived_at);
        if (a && a.id != null) return String(a.id);
        return (items[0] && items[0].id != null) ? String(items[0].id) : '';
      })();

      if (pick) sel.value = String(pick);
      return pick ? Number(pick) : null;
    }

    async function _loadDictationMeta(dictationId) {
      const id = Number(String(dictationId || '').replace(/^dict_/, '').trim());
      if (!Number.isFinite(id) || id <= 0) return null;
      return apiRequest(`/api/dictation/${encodeURIComponent(id)}`, { method: 'GET' });
    }

    async function _loadPlanTasksForSelectedGroup(modal) {
      const idInput = document.getElementById('plan-tasks-dictation-id');
      const dictationIdRaw = idInput ? String(idInput.value || '').trim() : '';
      const dictationIdNum = Number(dictationIdRaw);
      const groupSel = document.getElementById('plan-tasks-group');
      const groupIdNum = groupSel ? Number(groupSel.value) : NaN;

      if (!Number.isFinite(dictationIdNum) || dictationIdNum <= 0 || !Number.isFinite(groupIdNum) || groupIdNum <= 0) {
        _setPlanTasksExercises(modal, []);
        _setPlanTasksState(modal, []);
        _renderPlanTasksTable(modal);
        return;
      }

      try {
        const exRes = await apiRequest(`/dictation_editor/api/dictation/${encodeURIComponent(String(dictationIdNum))}/exercises`, { method: 'GET' });
        const exercises = (exRes && exRes.success && Array.isArray(exRes.exercises)) ? exRes.exercises : [];
        _setPlanTasksExercises(modal, exercises);
      } catch (e) {
        _setPlanTasksExercises(modal, []);
      }

      try {
        const res = await apiRequest(`/api/plan_tasks/teacher/group/${encodeURIComponent(String(groupIdNum))}/dictation/${encodeURIComponent(String(dictationIdNum))}`, { method: 'GET' });
        const tasks = (res && res.success && Array.isArray(res.tasks)) ? res.tasks : [];
        _setPlanTasksState(modal, tasks.map(t => ({
          id: t && t.id != null ? Number(t.id) : null,
          positions: Array.isArray(t && t.positions) ? t.positions : [],
          date_plan: t && t.date_plan ? String(t.date_plan) : '',
          repeat_count: t && t.repeat_count != null ? Number(t.repeat_count) : 1,
        })));
      } catch (e) {
        _setPlanTasksState(modal, []);
      }

      _setPlanTasksDirty(modal, false);
      _renderPlanTasksTable(modal);
    }

    function _renderPlanTasksTable(modal) {
      const body = document.getElementById('plan-tasks-body');
      if (!body) return;
      body.innerHTML = '';

      const tasks = _getPlanTasksState(modal);
      const exercises = _getPlanTasksExercises(modal);

      let currentId = _getPlanTasksCurrentId(modal);
      if (!Array.isArray(tasks) || !tasks.length) {
        _setPlanTasksCurrentId(modal, null);
      } else {
        const hasCurrent = currentId != null && _findPlanTaskIndexById(tasks, currentId) >= 0;
        if (!hasCurrent) {
          const firstId = (tasks[0] && tasks[0].id != null) ? Number(tasks[0].id) : null;
          _setPlanTasksCurrentId(modal, firstId);
          currentId = firstId;
        }
      }

      if (!tasks.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.style.padding = '12px 10px';
        td.style.color = 'rgba(0,0,0,0.55)';
        td.textContent = 'Добавь план кнопкой +';
        tr.appendChild(td);
        body.appendChild(tr);
        return;
      }

      const setCurrentIdSoft = (nextId) => {
        _setPlanTasksCurrentId(modal, nextId);
        try {
          const rows = Array.from(body.querySelectorAll('tr'));
          rows.forEach((r) => {
            const rid = r && r.dataset ? String(r.dataset.taskId || '') : '';
            r.style.background = (nextId != null && rid && Number(rid) === Number(nextId)) ? 'rgba(236, 72, 153, 0.10)' : '';
          });
        } catch (e) {
        }
      };

      tasks.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
        const rowId = (row && row.id != null) ? Number(row.id) : null;
        try { tr.dataset.taskId = (rowId != null ? String(rowId) : ''); } catch (e) { }
        if (rowId != null && currentId != null && Number(rowId) === Number(currentId)) {
          tr.style.background = 'rgba(236, 72, 153, 0.10)';
        }

        let pressTimer = null;
        let didLongPress = false;
        const clearPressTimer = () => {
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
        };

        tr.addEventListener('click', () => {
          if (didLongPress) {
            didLongPress = false;
            return;
          }
          const nextTasks = _getPlanTasksState(modal);
          if (!Array.isArray(nextTasks) || !nextTasks.length) return;
          if (rowId != null) setCurrentIdSoft(rowId);
        });

        tr.addEventListener('dblclick', () => {
          const nextTasks = _getPlanTasksState(modal);
          if (!Array.isArray(nextTasks) || !nextTasks.length) return;
          if (rowId != null) setCurrentIdSoft(rowId);
          _openPlanTaskEditor(modal, { mode: 'edit', id: rowId, idx });
        });

        tr.addEventListener('pointerdown', (e) => {
          try {
            if (!e || e.pointerType !== 'touch') return;
          } catch (err) {
            return;
          }

          clearPressTimer();
          didLongPress = false;
          pressTimer = setTimeout(() => {
            pressTimer = null;
            didLongPress = true;

            const nextTasks = _getPlanTasksState(modal);
            if (!Array.isArray(nextTasks) || !nextTasks.length) return;
            if (rowId != null) setCurrentIdSoft(rowId);
            _openPlanTaskEditor(modal, { mode: 'edit', id: rowId, idx });
          }, 600);
        });

        tr.addEventListener('pointerup', () => {
          clearPressTimer();
        });

        tr.addEventListener('pointercancel', () => {
          clearPressTimer();
        });

        tr.addEventListener('pointermove', () => {
          clearPressTimer();
        });

        const tdDate = document.createElement('td');
        tdDate.style.padding = '10px';
        tdDate.style.width = '120px';
        tdDate.style.maxWidth = '120px';
        tdDate.style.whiteSpace = 'nowrap';
        tdDate.textContent = row && row.date_plan ? String(row.date_plan) : '';

        const tdEx = document.createElement('td');
        tdEx.style.padding = '10px';
        tdEx.style.whiteSpace = 'nowrap';
        tdEx.style.overflow = 'hidden';
        tdEx.style.textOverflow = 'ellipsis';
        const selectedKey = _planPositionsKey(row && row.positions ? row.positions : []);
        const exObj = (Array.isArray(exercises) ? exercises : []).find(ex => _planPositionsKey(ex && ex.positions ? ex.positions : []) === selectedKey);
        tdEx.textContent = _planExerciseLabel(exObj || { positions: (row && row.positions) ? row.positions : [] });

        const tdCount = document.createElement('td');
        tdCount.style.padding = '10px';
        tdCount.style.width = '56px';
        tdCount.style.maxWidth = '56px';
        tdCount.style.whiteSpace = 'nowrap';
        tdCount.textContent = String((row && row.repeat_count != null ? row.repeat_count : 1) || 1);

        tr.appendChild(tdDate);
        tr.appendChild(tdEx);
        tr.appendChild(tdCount);
        body.appendChild(tr);
      });
    }

    async function openPlanTasksModal(dictationId) {
      const modal = ensurePlanTasksModal();
      if (!modal) return;

      const idNormalized = String(dictationId || '').trim();
      const dictationIdNum = Number(idNormalized.replace(/^dict_/, '').trim());
      const idInput = document.getElementById('plan-tasks-dictation-id');
      if (idInput) idInput.value = String(dictationIdNum || '');

      _setPlanTasksState(modal, []);
      _setPlanTasksExercises(modal, []);
      _renderPlanTasksTable(modal);

      try {
        const meta = await _loadDictationMeta(dictationIdNum);
        const titleEl = document.getElementById('plan-tasks-dictation-title');
        const coverImg = document.getElementById('plan-tasks-cover-img');
        const coverMeta = document.getElementById('plan-tasks-cover-meta');

        if (titleEl) titleEl.textContent = meta && meta.title ? String(meta.title) : '';
        if (coverImg) {
          const numericId = String(dictationIdNum || '').trim();
          const canonicalCover = numericId ? `/api/dictations_covers/${encodeURIComponent(numericId)}.webp` : '';
          const src = (
            (meta && (meta.cover_url || meta.coverUrl))
              ? String(meta.cover_url || meta.coverUrl)
              : canonicalCover
          );
          coverImg.src = src || '';
          coverImg.onerror = () => { coverImg.src = '/static/data/covers/cover_en.webp'; };
        }
        if (coverMeta) coverMeta.textContent = meta && meta.metaText ? String(meta.metaText) : '';
      } catch (e) {
      }

      const closeBtn = document.getElementById('plan-tasks-close');
      const saveBtn = document.getElementById('plan-tasks-save');
      const refreshBtn = document.getElementById('plan-tasks-refresh');
      const addBtn = document.getElementById('plan-tasks-add');
      const deleteBtn = document.getElementById('plan-tasks-delete');
      const groupSel = document.getElementById('plan-tasks-group');

      try {
        const groups = await _loadGroupsForPlanTasksModal();
        _fillPlanTasksGroupsSelect(groups, groupSel ? groupSel.value : null);
      } catch (e) {
      }

      try {
        await _loadPlanTasksForSelectedGroup(modal);
      } catch (e) {
      }

      if (!modal.dataset.listenersAttached) {
        modal.dataset.listenersAttached = '1';
        modal.addEventListener('click', (e) => {
          try {
            if (e.target === modal) {
              return;
            }
          } catch (e2) {
          }
        });
      }

      if (closeBtn && !closeBtn.dataset.listenerAttached) {
        closeBtn.dataset.listenerAttached = '1';
        closeBtn.addEventListener('click', () => {
          modal.style.display = 'none';
        });
      }
      if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.dataset.listenerAttached = '1';
        saveBtn.addEventListener('click', async () => {
          await _reconcilePlanTasksNow(modal, { silent: false });
        });
      }
      if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
        refreshBtn.dataset.listenerAttached = '1';
        refreshBtn.addEventListener('click', async () => {
          await _loadPlanTasksForSelectedGroup(modal);
        });
      }
      if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.dataset.listenerAttached = '1';
        addBtn.addEventListener('click', () => {
          _openPlanTaskEditor(modal, { mode: 'new' });
        });
      }
      if (deleteBtn && !deleteBtn.dataset.listenerAttached) {
        deleteBtn.dataset.listenerAttached = '1';
        deleteBtn.addEventListener('click', () => {
          const next = _getPlanTasksState(modal);
          if (!Array.isArray(next) || !next.length) return;
          const currentId = _getPlanTasksCurrentId(modal);
          let idx = (currentId != null) ? _findPlanTaskIndexById(next, currentId) : -1;
          if (!(idx >= 0 && idx < next.length)) idx = 0;

          const row = next[idx];
          const rowId = (row && row.id != null) ? Number(row.id) : null;
          if (rowId != null) _setPlanTasksCurrentId(modal, rowId);
          _openPlanTaskEditor(modal, { mode: 'delete', id: rowId, idx });
        });
      }
      if (groupSel && !groupSel.dataset.listenerAttached) {
        groupSel.dataset.listenerAttached = '1';
        groupSel.addEventListener('change', () => { void _loadPlanTasksForSelectedGroup(modal); });
      }

      modal.style.display = 'flex';

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }
    }

    window.PlanTasksModal = {
      open: openPlanTasksModal,
      refresh() {
        const modal = ensurePlanTasksModal();
        if (!modal) return;
        void _loadPlanTasksForSelectedGroup(modal);
      },
    };

    if (!window.openPlanTasksModal) {
      window.openPlanTasksModal = openPlanTasksModal;
    }
  } catch (e) {
  }
})();
