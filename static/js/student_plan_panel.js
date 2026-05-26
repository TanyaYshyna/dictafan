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
        renderStudentPlan(d, items);
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

function ensureStudentPlanPanel() {
  const panel = document.getElementById('student-plan-panel');
  if (!panel) throw new Error('student-plan-panel not found');
  return panel;
}

function _nowTs() {
  try { return performance.now(); } catch (e) { return Date.now(); }
}

function _planLog() {}

function _setAssignmentLaunchContext(ctx) {
  try {
    localStorage.setItem('dictafan_assignment_launch_ctx', JSON.stringify(Object.assign({ ts: Date.now() }, ctx || {})));
  } catch (e) {}
}

function _studentPlanOpenDictation(dictationId, dictationLanguageCode) {
  try {
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';
    const langOriginal = String(dictationLanguageCode || 'en').trim().toLowerCase() || 'en';
    const langTranslation = (nativeLang || langOriginal || 'en');
    window.location.href = `/dictation/dict_${Number(dictationId)}/${langOriginal}/${langTranslation}`;
  } catch (e) {
    window.location.href = `/dictation/dict_${Number(dictationId)}/en/en`;
  }
}

function renderStudentPlan(dateIso, items) {
  const list = document.getElementById('student-plan-list');
  const subtitle = document.getElementById('student-plan-subtitle');
  if (subtitle) subtitle.textContent = dateIso ? String(dateIso) : '';
  if (!list) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Заданий нет</div>';
    return;
  }
  list.innerHTML = rows.map((a) => {
    const dictId = a && a.dictation_id != null ? String(a.dictation_id) : '';
    const lang = a && a.dictation_language_code ? String(a.dictation_language_code) : 'en';
    const title = a && a.dictation_title ? String(a.dictation_title) : '';
    const group = a && (a.group_title || a.group_id) ? String(a.group_title || a.group_id) : '';
    const req = Number(a && a.required_completions ? a.required_completions : 1);
    const done = Number(a && typeof a.done !== 'undefined' ? a.done : 0);
    return `<div style="border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:12px; margin-top:10px; background:#fff;">
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div style="font-weight:900; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(title)}</div>
          <div style="margin-top:3px; font-size:12px; color: rgba(0,0,0,0.55);">${escapeHtml(group)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="display:inline-flex; padding:4px 8px; border-radius:999px; background:rgba(0,0,0,0.06); font-weight:900; font-size:12px;">${done}/${req}</div>
          <button type="button" class="button-color-yellow" data-action="student-plan-open" data-dictation-id="${escapeHtml(dictId)}" data-dictation-lang="${escapeHtml(lang)}" style="height:34px; padding:0 10px;">${escapeHtml(libT('private_library.student_plan_launch.start'))}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-action="student-plan-open"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dictId = btn.getAttribute('data-dictation-id');
      const lang = btn.getAttribute('data-dictation-lang');
      _setAssignmentLaunchContext({ dictation_id: Number(dictId) });
      _studentPlanOpenDictation(dictId, lang);
    });
  });
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons({ root: list });
  } catch (e) {}
}
