// Extracted Student Plan Panel controller

class StudentPlanPanel {
  static async open(dateIso = null) {
    const panel = ensureStudentPlanPanel();
    const dateInput = document.getElementById('student-plan-date');
    const closeBtn = document.getElementById('student-plan-close');
    const prevBtn = document.getElementById('student-plan-prev');
    const nextBtn = document.getElementById('student-plan-next');
    const todayBtn = document.getElementById('student-plan-today');
    const refreshBtn = document.getElementById('student-plan-refresh');

    const today = getTodayIsoDate();
    const initial = String(dateIso || (dateInput && dateInput.value) || today);
    if (dateInput) dateInput.value = initial;

    const close = () => {
      try { panel.style.display = 'none'; } catch (e) { }
    };

    panel.onclick = (e) => {
      const drawer = document.getElementById('student-plan-panel-drawer');
      if (e.target === panel) close();
      if (drawer && e.target === drawer) {
      }
    };

    if (closeBtn) closeBtn.onclick = () => close();

    const updateTodayVisibility = () => {
      try {
        if (!todayBtn) return;
        const v = dateInput ? String(dateInput.value || '').trim() : '';
        todayBtn.style.display = (v && v === today) ? 'none' : 'inline-flex';
      } catch (e) {
      }
    };

    const load = async (opts = {}) => {
      const forceRefresh = !!(opts && opts.forceRefresh);
      const tLoad0 = _nowTs();
      const d = dateInput ? String(dateInput.value || '').trim() : '';
      if (!d) return;
      const list = document.getElementById('student-plan-list');

      updateTodayVisibility();

      if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Загрузка…</div>';
      try {
        const tNet0 = _nowTs();
        const res = await apiRequest(`/api/assignments/student/my?date=${encodeURIComponent(d)}`, { method: 'GET' });
        _planLog('api_fetch', tNet0);
        if (!res || !res.success) {
          if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Не удалось загрузить задания</div>';
          return;
        }
        const items = Array.isArray(res.assignments) ? res.assignments : [];

        try {
          const tCache0 = _nowTs();
          const cachedIds = await _getCachedDictationIdSetIdb();
          for (const it of items) {
            try {
              const did = (it && it.dictation_id != null) ? String(it.dictation_id) : '';
              const cleaned = did.replace(/^dict_/, '').trim();
              if (cleaned) it.__cached = cachedIds.has(cleaned);
            } catch (e) {
            }
          }
          _planLog('check_dictations_cache', tCache0);
        } catch (e) {
        }

        const tRender0 = _nowTs();
        _studentPlanRender(panel, d, items);
        _planLog('render', tRender0);
        _planLog(`load_total(force=${forceRefresh ? '1' : '0'})`, tLoad0);
      } catch (e) {
        if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Не удалось загрузить задания</div>';
      }
    };

    if (dateInput) dateInput.onchange = () => load();
    if (todayBtn) todayBtn.onclick = () => {
      if (dateInput) dateInput.value = today;
      load();
    };
    if (refreshBtn) refreshBtn.onclick = () => {
      load({ forceRefresh: true });
    };
    if (prevBtn) prevBtn.onclick = () => {
      if (!dateInput) return;
      const cur = String(dateInput.value || today);
      dateInput.value = addDaysIsoDate(cur, -1);
      load();
    };
    if (nextBtn) nextBtn.onclick = () => {
      if (!dateInput) return;
      const cur = String(dateInput.value || today);
      dateInput.value = addDaysIsoDate(cur, 1);
      load();
    };

    panel.style.display = 'block';

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: panel });
      }
    } catch (e) {
    }

    updateTodayVisibility();
    await load();
  }
}

try {
  window.StudentPlanPanel = StudentPlanPanel;
} catch (e) {
}
