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

        try {
          panel.dataset.studentPlanLastFetchedAt = new Date().toISOString();
          panel.dataset.studentPlanLastFetchedDate = String(d);
        } catch (e) {
        }
        const items = Array.isArray(res.assignments) ? res.assignments : [];

        try {
          const sample = (items && items.length) ? items[0] : null;
          console.log('[student_plan] api_success', { date: d, count: Array.isArray(items) ? items.length : null, sample });
        } catch (e) {
        }

        const tRender0 = _nowTs();
        try {
          if (typeof _studentPlanRender === 'function') {
            _studentPlanRender(panel, d, items);
          } else {
            renderStudentPlan(d, items);
          }
        } catch (e) {
          renderStudentPlan(d, items);
        }
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

function _renderStudentPlanGrouped(list, dateIso, rows) {
  const buildSubsetLabel = (selectedPositions, totalCount) => {
    try {
      const total = Number(totalCount || 0) || 0;
      const pos = Array.isArray(selectedPositions)
        ? selectedPositions.map(x => Number(x)).filter(x => Number.isFinite(x))
        : [];
      const uniq = Array.from(new Set(pos));
      uniq.sort((a, b) => a - b);
      const cnt = uniq.length;
      const minP = cnt ? uniq[0] : null;
      const maxP = cnt ? uniq[cnt - 1] : null;
      if (!cnt) return total ? `${total}/${total}` : '';
      const base = `${cnt}/${total || 0}`;
      return (minP != null && maxP != null) ? `${base} (${minP}-${maxP})` : base;
    } catch (e) {
      return '';
    }
  };

  const byDictation = new Map();
  for (const a of rows) {
    const dictationId = a && a.dictation_id ? Number(a.dictation_id) : null;
    const key = dictationId != null ? String(dictationId) : `no_dict_${Math.random()}`;
    if (!byDictation.has(key)) byDictation.set(key, []);
    byDictation.get(key).push(a);
  }

  const blocks = [];
  for (const dictItems of byDictation.values()) {
    const first = dictItems[0] || {};
    const dictationTitle = String(first && first.dictation_title
      ? first.dictation_title
      : libT('private_library.student_plan.dictation_fallback_title', { id: first.dictation_id }));
    const level = first && first.dictation_level ? String(first.dictation_level) : '—';
    let coverUrl = String(first && first.dictation_cover_url ? first.dictation_cover_url : '');
    try {
      if (window.ImageManager && typeof window.ImageManager.getCoverUrl === 'function') {
        const did = first && first.dictation_id != null ? first.dictation_id : null;
        const lang = first && first.dictation_language_code ? first.dictation_language_code : null;
        const u = window.ImageManager.getCoverUrl(did, lang);
        if (u) coverUrl = String(u);
      }
    } catch (e) {
    }

    const isCached = !!(first && first.__cached);
    const range = dateIso ? String(dateIso) : '—';
    const coverStyle = coverUrl ? `background-image:url(${escapeHtml(coverUrl)}); background-size:cover; background-position:center;` : '';
    const cacheCoverBorder = isCached ? 'border: 1px solid var(--color-cesh-text);' : '';
    const cardBg = isCached ? 'background: var(--color-cesh);' : 'background: #fff;';
    const cacheBadge = isCached
      ? `<div title="${escapeHtml(libT('private_library.student_plan.cached_title'))}" style="display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:var(--color-cesh); color:var(--color-cesh-text); font-weight:800; font-size:12px;"><i data-lucide="download"></i><span>${escapeHtml(libT('private_library.student_plan.cached_badge'))}</span></div>`
      : '';

    const rowsHtml = dictItems.map(a => {
      const groupTitle = String(a && (a.group_title || a.group_id)
        ? (a.group_title || libT('private_library.student_plan.group_fallback_title', { id: a.group_id }))
        : libT('private_library.student_plan.group_generic_title'));
      const groupId = a && a.group_id ? Number(a.group_id) : null;
      const dictationId = a && a.dictation_id ? Number(a.dictation_id) : null;
      const langCode = a && a.dictation_language_code ? String(a.dictation_language_code) : 'en';
      const assignmentId = a && a.id ? Number(a.id) : null;
      const req = Number(a && a.required_completions ? a.required_completions : 1);
      const done = Number(a && typeof a.done !== 'undefined' ? a.done : 0);
      const overdue = !!(a && a.overdue);
      const badgeBg = overdue ? 'rgba(239,68,68,0.12)' : 'rgba(0,0,0,0.06)';
      const badgeColor = overdue ? '#b91c1c' : '#111827';
      const selectedPositions = Array.isArray(a && a.selected_sentence_positions)
        ? a.selected_sentence_positions.map(x => Number(x)).filter(x => Number.isFinite(x))
        : null;
      const selectedPositionsAttr = Array.isArray(selectedPositions) ? selectedPositions.join(',') : '';
      const subsetLabel = buildSubsetLabel(selectedPositions, a && a.dictation_sentences_count);

      return `
        <tr>
          <td style="padding:4px 6px 4px 0; font-weight:800; font-size:12px; color: rgba(0,0,0,0.72); text-align:right; white-space:nowrap; border:none !important; outline:none !important; box-shadow:none !important; background:transparent !important;">${escapeHtml(String(groupTitle))}</td>
          <td style="padding:4px 6px; width:1%; white-space:nowrap; text-align:right; border:none !important; outline:none !important; box-shadow:none !important; background:transparent !important;">
            <div style="display:inline-flex; padding:4px 8px; border-radius:999px; background:${badgeBg}; color:${badgeColor}; font-weight:900; font-size:12px; line-height:1;">${done}/${req}</div>
          </td>
          <td style="padding:4px 6px; width:1%; white-space:nowrap; text-align:right; border:none !important; outline:none !important; box-shadow:none !important; background:transparent !important;">
            <div style="display:inline-flex; padding:4px 8px; border-radius:999px; background:rgba(0,0,0,0.06); color:#111827; font-weight:900; font-size:12px; line-height:1;">${escapeHtml(String(subsetLabel || ''))}</div>
          </td>
          <td style="padding:4px 0 4px 6px; width:1%; white-space:nowrap; text-align:right; border:none !important; outline:none !important; box-shadow:none !important; background:transparent !important;">
            <button type="button" class="button-color-yellow" data-action="student-plan-open" data-assignment-id="${escapeHtml(String(assignmentId || ''))}" data-source-group-id="${escapeHtml(String(groupId || ''))}" data-source-group-title="${escapeHtml(String(groupTitle || ''))}" data-selected-positions="${escapeHtml(String(selectedPositionsAttr || ''))}" data-required-completions="${escapeHtml(String(req || 1))}" data-dictation-id="${escapeHtml(String(dictationId || ''))}" data-dictation-lang="${escapeHtml(String(langCode || 'en'))}" data-plan-date="${escapeHtml(String(range || ''))}" data-dictation-title="${escapeHtml(String(dictationTitle || ''))}" data-dictation-cover-url="${escapeHtml(String(coverUrl || ''))}" style="height:34px; padding:0 10px;">${escapeHtml(libT('private_library.student_plan_launch.start'))}</button>
          </td>
        </tr>
      `;
    }).join('');

    blocks.push(`
      <div style="border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:10px 10px 8px 10px; margin-top:10px; ${cardBg}">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="width:96px; height:96px; border-radius:16px; background:#eee; flex-shrink:0; ${coverStyle} ${cacheCoverBorder}"></div>
          <div style="min-width:0; flex:1; display:flex; flex-direction:column; align-items:flex-end;">
            <div style="width:100%; display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
              <div style="min-width:0; text-align:right;">
                <div style="font-weight:900; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(dictationTitle)}</div>
                <div style="margin-top:2px; font-size:12px; color: rgba(0,0,0,0.55);">${escapeHtml(range)} · уровень ${escapeHtml(level)}</div>
              </div>
              <div style="flex-shrink:0;">${cacheBadge}</div>
            </div>
            <div style="margin-top:6px; width:auto; margin-left:auto;">
              <table style="width:auto; border:none !important; border-collapse:separate; border-spacing:0 4px; margin-left:auto; background:transparent !important;">
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  list.innerHTML = blocks.join('');

  list.querySelectorAll('[data-action="student-plan-open"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dictId = btn.getAttribute('data-dictation-id');
      const lang = btn.getAttribute('data-dictation-lang');
      const assignmentId = btn.getAttribute('data-assignment-id');
      const sourceGroupId = btn.getAttribute('data-source-group-id');
      const sourceGroupTitle = btn.getAttribute('data-source-group-title');
      const selectedPositionsStr = btn.getAttribute('data-selected-positions');
      const requiredCompletions = btn.getAttribute('data-required-completions');
      const planDate = btn.getAttribute('data-plan-date');
      const dictTitle = btn.getAttribute('data-dictation-title');
      const coverUrl = btn.getAttribute('data-dictation-cover-url');
      const positions = String(selectedPositionsStr || '')
        .split(',')
        .map(x => Number(String(x || '').trim()))
        .filter(x => Number.isFinite(x));

      const ctx = {
        assignment_id: assignmentId ? Number(assignmentId) : null,
        dictation_id: dictId ? Number(dictId) : null,
        dictation_language_code: String(lang || ''),
        dictation_title: String(dictTitle || ''),
        dictation_cover_url: String(coverUrl || ''),
        plan_date: planDate != null ? String(planDate) : null,
        source_group_id: sourceGroupId ? Number(sourceGroupId) : null,
        source_group_title: sourceGroupTitle != null ? String(sourceGroupTitle) : null,
        selected_sentence_positions: positions.length ? positions : null,
        required_completions: Number(requiredCompletions || 0) || 0,
      };

      try {
        console.log('[student_plan] launch_click', ctx);
      } catch (e2) {
      }

      try {
        if (typeof openStudentPlanLaunchConfirmModal === 'function') {
          openStudentPlanLaunchConfirmModal(ctx);
          return;
        }
      } catch (e2) {
      }

      _setAssignmentLaunchContext(ctx);
      _studentPlanOpenDictation(dictId, lang);
    });
  });

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: list });
    }
  } catch (e) {
  }
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
  if (subtitle) {
    let suffix = '';
    try {
      const panel = ensureStudentPlanPanel();
      const fetchedAtIso = panel && panel.dataset ? panel.dataset.studentPlanLastFetchedAt : '';
      const fetchedForDate = panel && panel.dataset ? panel.dataset.studentPlanLastFetchedDate : '';
      if (fetchedAtIso && fetchedForDate && String(fetchedForDate) === String(dateIso || '')) {
        const dt = new Date(String(fetchedAtIso));
        if (!Number.isNaN(dt.getTime())) {
          const d = dt.toLocaleDateString('ru-RU');
          const t = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          suffix = ` · обновлено ${d} ${t}`;
        }
      }
    } catch (e) {
    }
    subtitle.textContent = (dateIso ? String(dateIso) : '') + suffix;
  }
  if (!list) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Заданий нет</div>';
    return;
  }
  try {
    const sample = (rows && rows.length) ? rows[0] : null;
    console.log('[student_plan] render_start', { date: dateIso, count: rows.length, sample });
  } catch (e) {
  }

  _renderStudentPlanGrouped(list, dateIso, rows);
  return;

  list.innerHTML = rows.map((a) => {
    const dictId = a && a.dictation_id != null ? String(a.dictation_id) : '';
    const lang = a && a.dictation_language_code ? String(a.dictation_language_code) : 'en';
    const title = a && a.dictation_title ? String(a.dictation_title) : '';
    const coverUrl = a && a.dictation_cover_url ? String(a.dictation_cover_url) : '';
    const group = a && (a.group_title || a.group_id) ? String(a.group_title || a.group_id) : '';
    const req = Number(a && a.required_completions ? a.required_completions : 1);
    const done = Number(a && typeof a.done !== 'undefined' ? a.done : 0);
    const assignmentId = a && a.id != null ? String(a.id) : '';
    const groupId = a && a.group_id != null ? String(a.group_id) : '';
    const selectedPositions = Array.isArray(a && a.selected_sentence_positions)
      ? a.selected_sentence_positions.map(x => Number(x)).filter(x => Number.isFinite(x))
      : [];
    const selectedPositionsAttr = selectedPositions.length ? selectedPositions.join(',') : '';
    return `<div style="border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:12px; margin-top:10px; background:#fff;">
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <div style="width:42px; height:42px; border-radius:12px; background:#e9eef5; flex:0 0 auto; background-size:cover; background-position:center; ${coverUrl ? `background-image:url(${escapeHtml(coverUrl)});` : ''}"></div>
          <div style="min-width:0;">
            <div style="font-weight:900; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(title)}</div>
            <div style="margin-top:3px; font-size:12px; color: rgba(0,0,0,0.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(group)}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="display:inline-flex; padding:4px 8px; border-radius:999px; background:rgba(0,0,0,0.06); font-weight:900; font-size:12px;">${done}/${req}</div>
          <button type="button" class="button-color-yellow" data-action="student-plan-open" data-assignment-id="${escapeHtml(assignmentId)}" data-source-group-id="${escapeHtml(groupId)}" data-source-group-title="${escapeHtml(group)}" data-selected-positions="${escapeHtml(selectedPositionsAttr)}" data-required-completions="${escapeHtml(String(req || 1))}" data-dictation-id="${escapeHtml(dictId)}" data-dictation-lang="${escapeHtml(lang)}" data-plan-date="${escapeHtml(String(dateIso || ''))}" data-dictation-title="${escapeHtml(String(title || ''))}" data-dictation-cover-url="${escapeHtml(String(coverUrl || ''))}" style="height:34px; padding:0 10px;">${escapeHtml(libT('private_library.student_plan_launch.start'))}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-action="student-plan-open"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dictId = btn.getAttribute('data-dictation-id');
      const lang = btn.getAttribute('data-dictation-lang');
      const assignmentId = btn.getAttribute('data-assignment-id');
      const sourceGroupId = btn.getAttribute('data-source-group-id');
      const sourceGroupTitle = btn.getAttribute('data-source-group-title');
      const selectedPositionsStr = btn.getAttribute('data-selected-positions');
      const requiredCompletions = btn.getAttribute('data-required-completions');
      const planDate = btn.getAttribute('data-plan-date');
      const dictTitle = btn.getAttribute('data-dictation-title');
      const coverUrl = btn.getAttribute('data-dictation-cover-url');
      const positions = String(selectedPositionsStr || '')
        .split(',')
        .map(x => Number(String(x || '').trim()))
        .filter(x => Number.isFinite(x));

      const ctx = {
        assignment_id: assignmentId ? Number(assignmentId) : null,
        dictation_id: dictId ? Number(dictId) : null,
        dictation_language_code: lang,
        dictation_title: String(dictTitle || ''),
        dictation_cover_url: String(coverUrl || ''),
        plan_date: planDate != null ? String(planDate) : null,
        source_group_id: sourceGroupId ? Number(sourceGroupId) : null,
        source_group_title: sourceGroupTitle != null ? String(sourceGroupTitle) : null,
        selected_sentence_positions: positions.length ? positions : null,
        required_completions: Number(requiredCompletions || 0) || 0,
      };

      try {
        console.log('[student_plan] launch_click', ctx);
      } catch (e2) {
      }

      try {
        if (typeof openStudentPlanLaunchConfirmModal === 'function') {
          openStudentPlanLaunchConfirmModal(ctx);
          return;
        }
      } catch (e2) {
      }

      _setAssignmentLaunchContext(ctx);
      _studentPlanOpenDictation(dictId, lang);
    });
  });
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons({ root: list });
  } catch (e) {}
}
