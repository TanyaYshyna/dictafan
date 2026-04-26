// Скрипт для новой страницы приватной библиотеки

var __APP_BUILD_LOCAL = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';

let bookEditDirty = false;

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

function applyPrivateLibraryTranslations() {
  try {
    document.title = libT('private_library.page_title');
  } catch (e) {
  }

  const setText = (id, key, fallback) => {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = libT(key, null, fallback);
    } catch (e) {
    }
  };

  const setAttr = (id, attr, key, fallback) => {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute(attr, libT(key, null, fallback));
    } catch (e) {
    }
  };

  try {
    const profileLabel = document.querySelector('#userMenuProfileBtn span');
    if (profileLabel) profileLabel.textContent = libT('private_library.user_menu.profile');
  } catch (e) {
  }
  try {
    const activityLabel = document.querySelector('#userMenuActivityReportBtn span');
    if (activityLabel) activityLabel.textContent = libT('private_library.user_menu.activity_report');
  } catch (e) {
  }
  try {
    const ratingLabel = document.querySelector('#userMenuRatingReportBtn span');
    if (ratingLabel) ratingLabel.textContent = libT('private_library.user_menu.rating');
  } catch (e) {
  }
  try {
    const planFactLabel = document.querySelector('#userMenuPlanFactBtn span');
    if (planFactLabel) planFactLabel.textContent = libT('private_library.user_menu.plan_fact');
  } catch (e) {
  }

  try {
    const streak = document.querySelector('.streak');
    if (streak) streak.setAttribute('title', libT('private_library.topbar.streak_title'));
  } catch (e) {
  }

  setAttr('logoutBtn', 'title', 'private_library.topbar.logout_title');
  try {
    const logoutText = document.querySelector('#logoutBtn .logout-text');
    if (logoutText) logoutText.textContent = libT('private_library.topbar.logout_title');
  } catch (e) {
  }

  setAttr('logoutBtn', 'aria-label', 'private_library.topbar.logout_title');

  try {
    const h = document.querySelector('#delete-dictation-modal h3');
    if (h) h.textContent = libT('private_library.delete_modal.title');
  } catch (e) {
  }
  setAttr('delete-dictation-close', 'aria-label', 'private_library.common.close');
  setAttr('delete-dictation-close', 'title', 'private_library.common.close');
  setText('delete-dictation-confirm', 'private_library.delete_modal.confirm');
  try {
    const q = document.getElementById('delete-dictation-question');
    const name = document.getElementById('delete-dictation-name');
    if (q && name) {
      q.innerHTML = `${libT('private_library.delete_modal.question_prefix')} <span id="delete-dictation-name"></span>?`;
      const name2 = document.getElementById('delete-dictation-name');
      if (name2) name2.textContent = name.textContent;
    }
  } catch (e) {
  }

  try {
    const h = document.querySelector('#home-library-modal h3');
    if (h) h.textContent = libT('private_library.home_library.title');
  } catch (e) {
  }
  setAttr('home-library-close', 'aria-label', 'private_library.common.close');
  setAttr('home-library-close', 'title', 'private_library.common.close');
  try {
    const h = document.querySelector('#booksZone .books-zone-header h3');
    if (h) h.textContent = libT('private_library.home_library.my_books');
  } catch (e) {
  }
  setAttr('btnNewBookInZone', 'title', 'private_library.home_library.new_book');

  setAttr('btnNewDictationQuick', 'title', 'private_library.toolbar.create_dictation');
  setAttr('btnHomeLibrary', 'title', 'private_library.toolbar.my_library');
  setAttr('btnPublicLibrary', 'title', 'private_library.toolbar.public_library');
  setAttr('btnStudentPlan', 'title', 'private_library.toolbar.plan');
  setAttr('btnTeacherAssignments', 'title', 'private_library.toolbar.assignments');
  setAttr('btnDeskZoomIn', 'title', 'private_library.toolbar.zoom_in');
  setAttr('btnDeskZoomOut', 'title', 'private_library.toolbar.zoom_out');

  try {
    const h = document.getElementById('book-edit-title');
    if (h) {
      const star = document.getElementById('book-edit-unsaved-star');
      const starHtml = star ? star.outerHTML : '';
      h.innerHTML = `${libT('private_library.book_edit.title_new')}${starHtml}`;
    }
  } catch (e) {
  }
  try {
    const btn = document.querySelector('.book-edit-save-header');
    if (btn) btn.textContent = libT('private_library.common.save');
  } catch (e) {
  }
  setAttr('book-edit-close', 'title', 'private_library.common.close');
  setAttr('book-edit-close', 'aria-label', 'private_library.common.close');

  try {
    const label = document.querySelector('.book-cover-label');
    if (label) label.textContent = libT('private_library.book_edit.cover_label');
  } catch (e) {
  }
  try {
    const prev = document.getElementById('book-cover-preview');
    if (prev) prev.setAttribute('alt', libT('private_library.book_edit.cover_alt'));
  } catch (e) {
  }
  setText('book-cover-upload-btn', 'private_library.book_edit.cover_upload');

  try {
    const label = document.querySelector('label[for="book-title-input"]');
    if (label) label.textContent = libT('private_library.book_edit.book_title');
  } catch (e) {
  }
  try {
    const label = document.querySelector('label[for="book-author-text-input"]');
    if (label) label.textContent = libT('private_library.book_edit.author_optional');
  } catch (e) {
  }

  try {
    const label = document.querySelector('label[for="book-author-materials-url-input"]');
    if (label) label.textContent = libT('private_library.book_edit.author_materials_url');
  } catch (e) {
  }
  setAttr('book-author-materials-url-input', 'placeholder', 'private_library.book_edit.url_placeholder');

  try {
    const label = document.querySelector('#book-language-selector')?.closest('.form-row')?.querySelector('label');
    if (label) label.textContent = libT('private_library.book_edit.original_language');
  } catch (e) {
  }

  try {
    const label = document.querySelector('label[for="book-theme-input"]');
    if (label) label.textContent = libT('private_library.book_edit.theme');
  } catch (e) {
  }
  setAttr('book-theme-input', 'placeholder', 'private_library.book_edit.theme_placeholder');

  try {
    const label = document.querySelector('label[for="book-visibility-input"]');
    if (label) label.textContent = libT('private_library.book_edit.visibility');
  } catch (e) {
  }
  try {
    const sel = document.getElementById('book-visibility-input');
    if (sel) {
      const optPrivate = sel.querySelector('option[value="private"]');
      const optPublic = sel.querySelector('option[value="public"]');
      if (optPrivate) optPrivate.textContent = libT('private_library.book_edit.visibility_private');
      if (optPublic) optPublic.textContent = libT('private_library.book_edit.visibility_public');
    }
  } catch (e) {
  }

  try {
    const label = document.querySelector('label[for="book-description-input"]');
    if (label) label.textContent = libT('private_library.book_edit.description');
  } catch (e) {
  }

  try {
    const h = document.getElementById('section-edit-title');
    if (h && !h.textContent) h.textContent = libT('private_library.section_edit.title_new');
  } catch (e) {
  }
  setAttr('section-edit-close', 'aria-label', 'private_library.common.close');
  setAttr('section-edit-close', 'title', 'private_library.common.close');
  try {
    const label = document.querySelector('label[for="section-number-input"]');
    if (label) label.textContent = libT('private_library.section_edit.number');
  } catch (e) {
  }
  setAttr('section-number-input', 'placeholder', 'private_library.section_edit.number_placeholder');
  try {
    const label = document.querySelector('label[for="section-title-input"]');
    if (label) label.textContent = libT('private_library.section_edit.name');
  } catch (e) {
  }
  setAttr('section-title-input', 'placeholder', 'private_library.section_edit.placeholder');
  try {
    const btn = document.querySelector('.section-edit-submit');
    if (btn) btn.textContent = libT('private_library.common.save');
  } catch (e) {
  }

  try {
    const h = document.getElementById('book-view-title');
    if (h && !h.textContent) h.textContent = libT('private_library.book_view.title');
  } catch (e) {
  }
  setAttr('book-view-close', 'aria-label', 'private_library.common.close');
  setAttr('book-view-close', 'title', 'private_library.common.close');

  try {
    const h = document.querySelector('#public-library-modal .modal-header h3');
    if (h) h.textContent = libT('private_library.public_library.title');
  } catch (e) {
  }
  setAttr('public-library-close', 'aria-label', 'private_library.common.close');
  setAttr('public-library-close', 'title', 'private_library.common.close');

  try {
    const h = document.querySelector('#move-dictation-modal .modal-header h3');
    if (h) h.textContent = libT('private_library.move_dictation.title');
  } catch (e) {
  }
  setAttr('move-dictation-close', 'aria-label', 'private_library.common.close');
  setAttr('move-dictation-close', 'title', 'private_library.common.close');
  try {
    const label = document.querySelector('label[for="move-target-book"]');
    if (label) label.textContent = libT('private_library.move_dictation.choose_book');
  } catch (e) {
  }
  try {
    const opt = document.querySelector('#move-target-book option[value=""]');
    if (opt) opt.textContent = libT('private_library.move_dictation.choose_book_placeholder');
  } catch (e) {
  }
  try {
    const label = document.querySelector('#move-dictation-sections-container > label');
    if (label) label.textContent = libT('private_library.move_dictation.choose_section');
  } catch (e) {
  }
  try {
    const btn = document.querySelector('.move-dictation-submit');
    if (btn) btn.textContent = libT('private_library.move_dictation.select');
  } catch (e) {
  }

  try {
    const h = document.querySelector('#crop-modal h3');
    if (h) h.textContent = libT('private_library.crop.title');
  } catch (e) {
  }
  setAttr('crop-close', 'aria-label', 'private_library.common.close');
  setAttr('crop-close', 'title', 'private_library.common.close');
  setText('crop-cancel', 'private_library.common.cancel');
  setText('crop-confirm', 'private_library.crop.apply');
}

function setBookEditDirty(nextDirty) {
  bookEditDirty = !!nextDirty;
  const star = document.getElementById('book-edit-unsaved-star');
  if (star) {
    star.style.display = bookEditDirty ? 'inline' : 'none';
  }
}

function _nowTs() {
  try {
    return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  } catch (e) {
    return Date.now();
  }
}

function _fmtMs(ms) {
  try {
    return `${(Number(ms) || 0).toFixed(1)}ms`;
  } catch (e) {
    return `${ms}ms`;
  }
}

function _planLog(label, t0) {
  try {
    const dt = (typeof t0 === 'number') ? (_nowTs() - t0) : null;
    if (dt == null) {
      console.log(`[student_plan] ${label}`);
    } else {
      console.log(`[student_plan] ${label}: ${_fmtMs(dt)}`);
    }
  } catch (e) {
  }
}

async function _getCachedDictationIdSetIdb() {
  try {
    const t0 = _nowTs();
    const db = await openDraftDb();
    try {
      return await new Promise((resolve) => {
        const out = new Set();
        const tx = db.transaction('dictations', 'readonly');
        const store = tx.objectStore('dictations');
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            try { _planLog(`idb_dictations_scan(size=${out.size})`, t0); } catch (e) {}
            return resolve(out);
          }
          const v = cursor.value;
          try {
            const raw = v && (v.dictationId != null) ? String(v.dictationId) : '';
            const cleaned = raw.replace(/^dict_/, '').trim();
            if (cleaned) out.add(cleaned);
          } catch (e) {
          }
          cursor.continue();
        };
        req.onerror = () => resolve(new Set());
      });
    } finally {
      try { db.close(); } catch (e) {}
    }
  } catch (e) {
    return new Set();
  }
}

async function _isDictationCachedIdb(dictationId) {
  try {
    const rawUserId = String(getDraftUserIdForKey());
    const dictId = String(dictationId || '').trim();
    if (!dictId) return false;
    const keys = [];
    keys.push(`${rawUserId}:${dictId}`);
    keys.push(`${rawUserId}:dict_${dictId}`);
    keys.push(`anon:${dictId}`);
    keys.push(`anon:dict_${dictId}`);

    const langPairs = [
      ['en', 'ru'],
      ['ru', 'en'],
      ['en', 'uk'],
      ['uk', 'en'],
    ];
    for (const [lo, lt] of langPairs) {
      keys.push(`${rawUserId}:${dictId}:${lo}:${lt}`);
      keys.push(`${rawUserId}:dict_${dictId}:${lo}:${lt}`);
      keys.push(`anon:${dictId}:${lo}:${lt}`);
      keys.push(`anon:dict_${dictId}:${lo}:${lt}`);
    }

    for (const k of keys) {
      const row = await idbGet('dictations', k);
      if (row && Array.isArray(row.sentences) && row.sentences.length) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function applyCachedDictationCardStyles(container) {
  try {
    if (!container) return;
    const cachedIds = await _getCachedDictationIdSetIdb();
    const cards = container.querySelectorAll('.short-card[data-dictation-id]');
    for (const card of cards) {
      try {
        const raw = String(card.dataset.dictationId || '').trim();
        const cleaned = raw.replace(/^dict_/, '').trim();
        const isCached = cleaned ? cachedIds.has(cleaned) : false;
        card.classList.toggle('short-card--cached', !!isCached);
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

function diffDaysIsoDate(aIso, bIso) {
  try {
    const a = String(aIso || '').split('-');
    const b = String(bIso || '').split('-');
    if (a.length !== 3 || b.length !== 3) return null;
    const da = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]));
    const db = new Date(Number(b[0]), Number(b[1]) - 1, Number(b[2]));
    const ms = db.getTime() - da.getTime();
    if (!isFinite(ms)) return null;
    return Math.round(ms / (1000 * 60 * 60 * 24));
  } catch (e) {
    return null;
  }
}

function validateAssignmentDaysWeekLimit(modal) {
  const cur = getCreateAssignmentDaysState(modal);
  const dates = cur.map(x => String(x && x.date ? x.date : '').trim()).filter(Boolean);
  if (!dates.length) return { ok: true, reason: '' };
  const uniq = Array.from(new Set(dates)).sort();
  if (uniq.length > 7) return { ok: false, reason: libT('private_library.assignments.max_7_days') };
  const span = diffDaysIsoDate(uniq[0], uniq[uniq.length - 1]);
  if (span != null && span > 6) return { ok: false, reason: libT('private_library.assignments.max_7_days') };
  return { ok: true, reason: '' };
}

function getAssignmentLastGroupId() {
  try {
    const v = String(localStorage.getItem('assignments_last_group_id') || '').trim();
    return v || null;
  } catch (e) {
    return null;
  }
}

function setAssignmentLastGroupId(groupId) {
  try {
    const v = String(groupId || '').trim();
    if (!v) return;
    localStorage.setItem('assignments_last_group_id', v);
  } catch (e) {
  }
}

function setupUserDropdownMenu() {
  const toggleBtn = document.getElementById('userMenuToggle');
  const dropdown = document.getElementById('userMenuDropdown');
  const profileBtn = document.getElementById('userMenuProfileBtn');
  const activityBtn = document.getElementById('userMenuActivityReportBtn');
  const ratingBtn = document.getElementById('userMenuRatingReportBtn');
  const planFactBtn = document.getElementById('userMenuPlanFactBtn');

  if (!toggleBtn || !dropdown) return;

  const close = () => {
    dropdown.classList.remove('show');
    try { toggleBtn.setAttribute('aria-expanded', 'false'); } catch (e) {}
  };

  const open = () => {
    dropdown.classList.add('show');
    try { toggleBtn.setAttribute('aria-expanded', 'true'); } catch (e) {}
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: dropdown });
      }
    } catch (e) {
    }
  };

  const toggle = () => {
    const isOpen = dropdown.classList.contains('show');
    if (isOpen) close();
    else open();
  };

  toggleBtn.addEventListener('click', (e) => {
    try { e.preventDefault(); } catch (e2) {}
    try { e.stopPropagation(); } catch (e2) {}
    toggle();
  });

  document.addEventListener('click', (e) => {
    try {
      if (!dropdown.classList.contains('show')) return;
      const target = e && e.target;
      if (!target) return;
      if (toggleBtn.contains(target)) return;
      if (dropdown.contains(target)) return;
      close();
    } catch (e2) {
    }
  });

  document.addEventListener('keydown', (e) => {
    try {
      if (e && e.key === 'Escape' && dropdown.classList.contains('show')) {
        close();
      }
    } catch (e2) {
    }
  });

  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch (e2) {}
      close();
      window.location.href = '/user/profile';
    });
  }

  if (ratingBtn) {
    ratingBtn.addEventListener('click', async (e) => {
      try { e.preventDefault(); } catch (e2) {}
      close();

      if (typeof RatingReport === 'undefined') {
        alert(libT('private_library.reports.rating_unavailable'));
        return;
      }

      try {
        await RatingReport.open();
      } catch (err) {
        alert(libT('private_library.reports.rating_open_failed'));
      }
    });
  }

  if (activityBtn) {
    activityBtn.addEventListener('click', async (e) => {
      try { e.preventDefault(); } catch (e2) {}
      close();

      if (typeof StatisticsReport === 'undefined') {
        alert(libT('private_library.reports.activity_unavailable'));
        return;
      }

      try {
        const history = new UserActivityHistory('/user/api');
        await StatisticsReport.open(history);
      } catch (err) {
        alert(libT('private_library.reports.activity_open_failed'));
      }
    });
  }

  if (planFactBtn) {
    planFactBtn.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch (e2) {}
      close();
      if (typeof PlanFactReport === 'undefined') {
        alert(libT('private_library.reports.plan_fact_unavailable'));
        return;
      }
      if (typeof UserActivityHistory === 'undefined') {
        alert(libT('private_library.reports.plan_fact_unavailable'));
        return;
      }

      try {
        const history = new UserActivityHistory('/user/api');
        PlanFactReport.open(history);
      } catch (err) {
        alert(libT('private_library.reports.plan_fact_open_failed'));
      }
    });
  }

}

let __userMenuReportsFallbackInstalled = false;

function installUserMenuReportsClickFallback() {
  if (__userMenuReportsFallbackInstalled) return;
  __userMenuReportsFallbackInstalled = true;

  const closeDropdown = () => {
    try {
      const dropdown = document.getElementById('userMenuDropdown');
      const toggleBtn = document.getElementById('userMenuToggle');
      if (dropdown) dropdown.classList.remove('show');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    } catch (e) {
    }
  };

  document.addEventListener('click', async (e) => {
    try {
      const target = e && e.target;
      if (!target || !target.closest) return;

      const activityBtn = target.closest('#userMenuActivityReportBtn');
      const ratingBtn = target.closest('#userMenuRatingReportBtn');
      const planFactBtn = target.closest('#userMenuPlanFactBtn');
      if (!activityBtn && !ratingBtn && !planFactBtn) return;

      try {
        console.log('[user_menu_reports] click', { activity: !!activityBtn, planFact: !!planFactBtn });
      } catch (e0) {
      }

      try { e.preventDefault(); } catch (e2) {}
      closeDropdown();

      if (activityBtn) {
        if (typeof StatisticsReport === 'undefined' || typeof UserActivityHistory === 'undefined') {
          try {
            console.log('[user_menu_reports] missing globals', {
              StatisticsReport: typeof StatisticsReport,
              UserActivityHistory: typeof UserActivityHistory,
            });
          } catch (e0) {
          }
          alert(libT('private_library.reports.activity_unavailable'));
          return;
        }
        try {
          const history = new UserActivityHistory('/user/api');
          await StatisticsReport.open(history);
        } catch (err) {
          try {
            console.log('[user_menu_reports] open activity report failed', err);
          } catch (e0) {
          }
          alert(libT('private_library.reports.activity_open_failed'));
        }
        return;
      }

      if (planFactBtn) {
        if (typeof PlanFactReport === 'undefined' || typeof UserActivityHistory === 'undefined') {
          alert(libT('private_library.reports.plan_fact_unavailable'));
          return;
        }
        try {
          const history = new UserActivityHistory('/user/api');
          await PlanFactReport.open(history);
        } catch (err) {
          alert(libT('private_library.reports.plan_fact_open_failed'));
        }
        return;
      }
    } catch (err) {
    }
  }, true);
}

async function loadDictationMetaForAssignmentModal(dictationId) {
  const id = Number(dictationId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const res = await apiRequest(`/api/dictation/${encodeURIComponent(id)}`, { method: 'GET' });
  if (!res || !res.success || !res.dictation) return null;
  return res.dictation;
}

async function loadDictationSentencesForAssignmentModal(dictationId) {
  const id = Number(dictationId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const meta = await loadDictationMetaForAssignmentModal(id);
  const langOrig = meta && meta.language_code ? String(meta.language_code) : 'en';
  // ВАЖНО: endpoint ожидает dict_<id>, иначе отдаёт 400
  const url = `/api/dictation/${encodeURIComponent(`dict_${id}`)}/${encodeURIComponent(langOrig)}/${encodeURIComponent(langOrig)}/sentences`;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  const sentences = (data && Array.isArray(data.sentences)) ? data.sentences : [];
  return sentences.filter(s => s && typeof s === 'object');
}

function getCreateAssignmentSentencesState(modal) {
  try {
    const raw = modal.dataset.sentencesState;
    if (!raw) return { sentences: [], selectedPositions: null };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { sentences: [], selectedPositions: null };
  } catch (e) {
    return { sentences: [], selectedPositions: null };
  }
}

function setCreateAssignmentSentencesState(modal, state) {
  try {
    modal.dataset.sentencesState = JSON.stringify(state && typeof state === 'object' ? state : { sentences: [], selectedPositions: null });
  } catch (e) {
  }
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
      <td style="padding:8px 10px; color: rgba(0,0,0,0.65); font-variant-numeric: tabular-nums; white-space:nowrap;">${escapeHtml(labelNum)}</td>
      <td style="padding:8px 10px; width:46px;">
        <button type="button" class="topbar-icon-btn create-assignment-sentence-check" data-position="${escapeHtml(fullPos)}" aria-label="${escapeHtml(libT('private_library.assignments.select_sentence'))}" style="width:32px; height:32px; padding:0; display:inline-flex; align-items:center; justify-content:center;"></button>
      </td>
      <td style="padding:8px 10px;">${escapeHtml(text)}</td>
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
    });
  }
}

function ensureCreateAssignmentModal() {
  let modal = document.getElementById('create-assignment-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'create-assignment-modal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  modal.style.backdropFilter = 'blur(2px)';
  modal.style.webkitBackdropFilter = 'blur(2px)';
  modal.style.zIndex = '100200';

  modal.innerHTML = `
    <div class="modal-content create-assignment-modal-content">
      <div class="modal-header create-assignment-modal-header">
        <div class="create-assignment-modal-title">
          <div class="create-assignment-modal-title-icon"><i data-lucide="clipboard-list"></i></div>
          <div class="create-assignment-modal-title-text">${escapeHtml(libT('private_library.assignments.modal_title'))}</div>
        </div>

        <div class="create-assignment-modal-header-actions">
          <button type="button" id="create-assignment-save" class="btn-primary create-assignment-save-btn">
            <i data-lucide="save"></i>
            <span>${escapeHtml(libT('private_library.common.save'))}</span>
          </button>
          <button type="button" id="create-assignment-close" class="modal-close create-assignment-close-btn" title="${escapeHtml(libT('private_library.common.close'))}">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>

      <div class="modal-body create-assignment-modal-body">
        <input type="hidden" id="create-assignment-dictation-id" value="">

        <!-- ВЕРХНЯЯ ПАНЕЛЬ -->
        <div class="create-assignment-top">
          <!-- верхняя-левая: ковер стандартного вида как в карточках -->
          <div class="create-assignment-cover">
            <div class="create-assignment-cover-box">
              <img id="create-assignment-cover-img" alt="" class="create-assignment-cover-img" />
            </div>
          </div>

          <!-- верхняя-правая: инфо -->
          <div class="create-assignment-top-right">
            <div id="create-assignment-dictation-title" class="create-assignment-dictation-title"></div>
            <div id="create-assignment-cover-meta" class="create-assignment-cover-meta"></div>
            <div class="create-assignment-top-controls">
              <div class="create-assignment-top-row">
                <select id="create-assignment-group" class="create-assignment-select"></select>
              </div>
            </div>
          </div>
        </div>

        <!-- НИЖНЯЯ ПАНЕЛЬ -->
        <div id="create-assignment-bottom" class="create-assignment-bottom">
          <div id="create-assignment-days-panel" class="create-assignment-panel create-assignment-panel--days">
            <div class="create-assignment-panel-body">
              <div class="create-assignment-panel-actions">
                <button type="button" id="create-assignment-days-add" class="topbar-icon-btn create-assignment-icon-btn" title="${escapeHtml(libT('private_library.assignments.add_day'))}">
                  <i data-lucide="plus"></i>
                </button>
              </div>
              <div id="create-assignment-days-table"></div>
            </div>
          </div>

          <div class="create-assignment-panel create-assignment-panel--sentences">
            <div class="create-assignment-panel-body">
              <table class="create-assignment-table create-assignment-table--sentences">
                <thead>
                  <tr>
                    <th class="create-assignment-th-num">№</th>
                    <th class="create-assignment-th-check">
                      <button type="button" id="create-assignment-sentences-toggle-all" class="topbar-icon-btn create-assignment-icon-btn" title="${escapeHtml(libT('private_library.assignments.toggle_all_select'))}">
                        <i data-lucide="circle"></i>
                      </button>
                    </th>
                    <th class="create-assignment-th-text">${escapeHtml(libT('private_library.assignments.text_column'))}</th>
                  </tr>
                </thead>
                <tbody id="create-assignment-sentences-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }
  } catch (e) {
  }

  return modal;
}

function getTodayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function addDaysIsoDate(iso, days) {
  try {
    const parts = String(iso || '').split('-');
    if (parts.length !== 3) return iso;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + Number(days || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return iso;
  }
}

function isWeekendIsoDate(iso) {
  try {
    const parts = String(iso || '').split('-');
    if (parts.length !== 3) return false;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const w = d.getDay();
    return w === 0 || w === 6;
  } catch (e) {
    return false;
  }
}

function getCreateAssignmentDaysState(modal) {
  try {
    const raw = modal.dataset.daysState;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function setCreateAssignmentDaysState(modal, days) {
  try {
    modal.dataset.daysState = JSON.stringify(Array.isArray(days) ? days : []);
  } catch (e) {
  }
}

function ensureStudentPlanPanel() {
  let panel = document.getElementById('student-plan-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'student-plan-panel';
  panel.tabIndex = -1;
  panel.style.display = 'none';
  panel.style.position = 'fixed';
  panel.style.left = '0';
  panel.style.top = '0';
  panel.style.width = '100%';
  panel.style.height = '100%';
  panel.style.zIndex = '100000';
  panel.style.background = 'rgba(0,0,0,0.35)';
  panel.style.backdropFilter = 'blur(4px)';
  panel.style.outline = 'none';

  panel.innerHTML = `
    <div id="student-plan-panel-drawer" tabindex="-1" style="position:absolute; right:0; top:0; height:100%; width:min(75vw, 980px); background:#fff; color:#222; box-shadow:-12px 0 40px rgba(0,0,0,0.25); display:flex; flex-direction:column; outline:none;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 14px 10px 14px; border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background: rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center;">
            <i data-lucide="calendar-check"></i>
          </div>
          <div>
            <div style="font-weight:700; font-size:16px; line-height:1.1;">${escapeHtml(libT('private_library.student_plan.title'))}</div>
            <div id="student-plan-subtitle" style="font-size:12px; color: rgba(0,0,0,0.55); margin-top:2px;"></div>
          </div>
        </div>
        <button type="button" id="student-plan-close" class="modal-close" title="${escapeHtml(libT('private_library.common.close'))}" style="background:transparent; border:0; cursor:pointer; padding:6px;">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" id="student-plan-prev" class="topbar-icon-btn" title="${escapeHtml(libT('private_library.student_plan.prev_day'))}" style="width:40px; height:40px;">
            <i data-lucide="chevron-left"></i>
          </button>
          <input type="date" id="student-plan-date" style="height:40px; padding:0 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.16);">
          <button type="button" id="student-plan-next" class="topbar-icon-btn" title="${escapeHtml(libT('private_library.student_plan.next_day'))}" style="width:40px; height:40px;">
            <i data-lucide="chevron-right"></i>
          </button>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" id="student-plan-today" class="button-secondary" style="height:40px;">${escapeHtml(libT('private_library.student_plan.today'))}</button>
          <button type="button" id="student-plan-refresh" class="topbar-icon-btn" title="${escapeHtml(libT('private_library.student_plan.refresh'))}" style="width:40px; height:40px;">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>
      </div>

      <div id="student-plan-list" style="padding:14px; overflow:auto; flex:1;"></div>
    </div>
  `;

  document.body.appendChild(panel);
  return panel;
}

function ensureTeacherAssignmentStudentsModal() {
  let modal = document.getElementById('teacher-assignment-students-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'teacher-assignment-students-modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.zIndex = '100001';
  modal.style.background = 'rgba(0,0,0,0.35)';
  modal.style.backdropFilter = 'blur(4px)';

  modal.innerHTML = `
    <div style="position:absolute; right:0; top:0; height:100%; width:min(62vw, 760px); background:#fff; color:#222; box-shadow:-12px 0 40px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 14px 10px 14px; border-bottom:1px solid rgba(0,0,0,0.08);">
        <div>
          <div id="teacher-assignment-students-title" style="font-weight:700; font-size:16px; line-height:1.1;">${escapeHtml(libT('private_library.teacher_students.title'))}</div>
          <div id="teacher-assignment-students-subtitle" style="font-size:12px; color: rgba(0,0,0,0.55); margin-top:2px;"></div>
        </div>
        <button type="button" id="teacher-assignment-students-close" class="modal-close" title="${escapeHtml(libT('private_library.common.close'))}" style="background:transparent; border:0; cursor:pointer; padding:6px;">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div id="teacher-assignment-students-list" style="padding:14px; overflow:auto; flex:1;"></div>
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      try { modal.style.display = 'none'; } catch (e2) { }
    }
  });

  document.body.appendChild(modal);
  return modal;
}

function _teacherStudentsRender(data) {
  const modal = ensureTeacherAssignmentStudentsModal();
  const titleEl = document.getElementById('teacher-assignment-students-title');
  const subtitleEl = document.getElementById('teacher-assignment-students-subtitle');
  const list = document.getElementById('teacher-assignment-students-list');

  const assignment = data && data.assignment ? data.assignment : {};
  const summary = data && data.summary ? data.summary : {};
  const students = Array.isArray(data && data.students ? data.students : null) ? data.students : [];

  let deadlineDate = null;
  try {
    const days = Array.isArray(assignment && assignment.days ? assignment.days : null) ? assignment.days : [];
    const ds = days
      .map(x => String(x && (x.date || x.day_date) ? (x.date || x.day_date) : '').trim())
      .filter(Boolean)
      .sort();
    const ed = ds.length ? ds[ds.length - 1] : '';
    if (ed) {
      const d = new Date(ed);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        deadlineDate = d;
      }
    }
  } catch (e) {
  }
  let todayDate = null;
  try {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    todayDate = t;
  } catch (e) {
  }

  if (titleEl) titleEl.textContent = assignment && assignment.dictation_title ? String(assignment.dictation_title) : libT('private_library.teacher_students.title');
  if (subtitleEl) {
    const pct = typeof summary.percent_completed === 'number' ? summary.percent_completed : 0;
    const done = typeof summary.students_completed === 'number' ? summary.students_completed : 0;
    const total = typeof summary.students_total === 'number' ? summary.students_total : students.length;
    subtitleEl.textContent = libT('private_library.teacher_students.subtitle', { pct, done, total });
  }
  if (!list) return;

  if (!students.length) {
    list.innerHTML = `<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.teacher_students.none'))}</div>`;
    return;
  }

  const blocks = students.map(s => {
    const username = String(s && s.username ? s.username : '');
    const done = Number(s && typeof s.done !== 'undefined' ? s.done : 0);
    const req = Number(s && typeof s.required !== 'undefined' ? s.required : 1);
    const isDone = Boolean(s && s.is_done);
    const avatarUrl = String(s && s.avatar_small_url ? s.avatar_small_url : '');
    const isOverdue = Boolean(!isDone && deadlineDate && todayDate && todayDate.getTime() > deadlineDate.getTime());

    const statusText = isDone
      ? libT('private_library.teacher_students.status_done')
      : (isOverdue ? libT('private_library.teacher_students.status_overdue') : libT('private_library.teacher_students.status_not_done'));
    const statusBg = isDone ? 'rgba(34,197,94,0.14)' : (isOverdue ? 'rgba(239,68,68,0.14)' : 'rgba(0,0,0,0.06)');
    const statusColor = isDone ? '#166534' : (isOverdue ? '#991b1b' : 'rgba(0,0,0,0.65)');

    const badgeBg = isDone ? 'rgba(34,197,94,0.14)' : 'rgba(0,0,0,0.06)';
    const badgeColor = isDone ? '#166534' : 'rgba(0,0,0,0.65)';
    const leftBg = avatarUrl ? `url(${escapeHtml(avatarUrl)})` : 'none';

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid rgba(0,0,0,0.06);">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <div style="width:32px; height:32px; border-radius:50%; background:#eee; background-image:${leftBg}; background-size:cover; background-position:center;"></div>
          <div style="min-width:0;">
            <div style="font-weight:650; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(username)}</div>
          </div>
        </div>
        <div style="flex-shrink:0; display:flex; align-items:center; gap:8px;">
          <div style="padding:6px 10px; border-radius:999px; background:${statusBg}; color:${statusColor}; font-weight:800; font-size:12px;">${escapeHtml(statusText)}</div>
          <div style="padding:6px 10px; border-radius:999px; background:${badgeBg}; color:${badgeColor}; font-weight:800; font-size:12px;">${done}/${req}</div>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = blocks;
}

async function openTeacherAssignmentStudentsModal(assignmentId) {
  const modal = ensureTeacherAssignmentStudentsModal();
  const closeBtn = document.getElementById('teacher-assignment-students-close');
  const list = document.getElementById('teacher-assignment-students-list');

  if (closeBtn) closeBtn.onclick = () => { try { modal.style.display = 'none'; } catch (e) { } };
  if (list) list.innerHTML = `<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.teacher_students.loading'))}</div>`;

  modal.style.display = 'block';
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }
  } catch (e) {
  }

  try {
    const res = await apiRequest(`/api/assignments/teacher/assignment/${encodeURIComponent(String(assignmentId))}/students`, { method: 'GET' });
    if (!res || !res.success) {
      if (list) list.innerHTML = `<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.teacher_students.load_failed'))}</div>`;
      return;
    }
    _teacherStudentsRender(res);
  } catch (e) {
    if (list) list.innerHTML = `<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.teacher_students.load_failed'))}</div>`;
  }
}

function _studentPlanOpenDictation(dictationId, dictationLanguageCode) {
  try {
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    // NOTE: dictationLanguageCode must be the dictation's original language.
    // (Not the user's current learning language.)
    const langOriginal = String(dictationLanguageCode || 'en').trim().toLowerCase() || 'en';
    const langTranslation = (nativeLang || langOriginal || 'en');
    const openUrl = `/dictation/dict_${Number(dictationId)}/${langOriginal}/${langTranslation}`;
    window.location.href = openUrl;
  } catch (e) {
    try {
      window.location.href = `/dictation/dict_${Number(dictationId)}/en/en`;
    } catch (e2) {
    }
  }
}

function _setAssignmentLaunchContext(ctx) {
  try {
    if (!ctx || typeof ctx !== 'object') return;
    localStorage.setItem('dictafan_assignment_launch_ctx', JSON.stringify(Object.assign({ ts: Date.now() }, ctx)));
  } catch (e) {
  }
}

function ensureStudentPlanLaunchConfirmModal() {
  let modal = document.getElementById('student-plan-launch-confirm-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'student-plan-launch-confirm-modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.zIndex = '100050';
  modal.style.background = 'rgba(0,0,0,0.35)';
  modal.style.backdropFilter = 'blur(4px)';

  modal.innerHTML = `
    <div id="student-plan-launch-confirm-card" style="position:absolute; left:50%; top:50%; transform: translate(-50%, -50%); width:min(92vw, 720px); max-height: 86vh; overflow:hidden; background:#fff; color:#222; border-radius:18px; box-shadow: 0 30px 70px rgba(0,0,0,0.35); display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px 10px 16px; border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          <div id="student-plan-launch-confirm-cover" style="width:54px; height:54px; border-radius:14px; background:#e9eef5; flex:0 0 auto; background-size: cover; background-position:center;"></div>
          <div style="min-width:0;">
            <div id="student-plan-launch-confirm-title" style="font-weight:900; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            <div id="student-plan-launch-confirm-subtitle" style="font-size:12px; color: rgba(0,0,0,0.55); margin-top:2px;"></div>
          </div>
        </div>
        <button type="button" id="student-plan-launch-confirm-close" class="modal-close" title="${escapeHtml(libT('private_library.common.close'))}" style="background:transparent; border:0; cursor:pointer; padding:6px;">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div style="padding: 12px 16px; overflow:auto; flex: 1;">
        <div id="student-plan-launch-confirm-warning" style="padding:10px 12px; border-radius:14px; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.24); color: rgba(17,24,39,0.88); font-weight:650; line-height:1.35;"></div>

        <div style="margin-top: 12px; font-weight:900; font-size:13px; color: rgba(0,0,0,0.70);">${escapeHtml(libT('private_library.student_plan_launch.sentences_from_assignment'))}</div>
        <div id="student-plan-launch-confirm-positions" style="margin-top: 4px; font-size: 13px; color: rgba(0,0,0,0.65);"></div>
        <div id="student-plan-launch-confirm-sentences" style="margin-top: 10px; display:flex; flex-direction:column; gap:8px;"></div>
      </div>

      <div style="padding: 12px 16px; border-top:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:flex-end; gap: 10px;">
        <button type="button" id="student-plan-launch-confirm-start" class="button-color-yellow" style="height:40px; padding:0 16px; font-weight:900;">${escapeHtml(libT('private_library.student_plan_launch.start'))}</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      try { modal.style.display = 'none'; } catch (e2) { }
    }
  });

  document.body.appendChild(modal);
  return modal;
}

async function openStudentPlanLaunchConfirmModal(ctx) {
  const modal = ensureStudentPlanLaunchConfirmModal();
  const closeBtn = document.getElementById('student-plan-launch-confirm-close');
  const startBtn = document.getElementById('student-plan-launch-confirm-start');
  const titleEl = document.getElementById('student-plan-launch-confirm-title');
  const subtitleEl = document.getElementById('student-plan-launch-confirm-subtitle');
  const coverEl = document.getElementById('student-plan-launch-confirm-cover');
  const warningEl = document.getElementById('student-plan-launch-confirm-warning');
  const posEl = document.getElementById('student-plan-launch-confirm-positions');
  const sentsEl = document.getElementById('student-plan-launch-confirm-sentences');

  if (titleEl) titleEl.textContent = String((ctx && ctx.dictation_title) || libT('private_library.student_plan_launch.dictation_fallback_title'));
  if (subtitleEl) subtitleEl.textContent = String((ctx && ctx.plan_date) ? libT('private_library.student_plan_launch.assignment_for_date', { date: ctx.plan_date }) : '');
  if (coverEl) {
    const url = String((ctx && ctx.dictation_cover_url) || '');
    coverEl.style.backgroundImage = url ? `url(${escapeHtml(url)})` : 'none';
  }
  if (warningEl) {
    warningEl.textContent = libT('private_library.student_plan_launch.past_day_warning');
  }

  const positions = Array.isArray(ctx && ctx.selected_sentence_positions)
    ? ctx.selected_sentence_positions.map(x => Number(x)).filter(x => Number.isFinite(x))
    : [];
  positions.sort((a, b) => a - b);

  const formatPositionsLabel = () => {
    try {
      if (!positions.length) return libT('private_library.student_plan_launch.all_sentences');
      const uniq = Array.from(new Set(positions));
      uniq.sort((a, b) => a - b);
      const ranges = [];
      let start = null;
      let prev = null;
      for (const n of uniq) {
        if (start == null) {
          start = n;
          prev = n;
          continue;
        }
        if (n === prev + 1) {
          prev = n;
          continue;
        }
        ranges.push(start === prev ? String(start) : `${start}-${prev}`);
        start = n;
        prev = n;
      }
      if (start != null && prev != null) ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      const compact = ranges.join(',');
      return compact ? `(${compact})` : libT('private_library.student_plan_launch.all_sentences');
    } catch (e) {
      return '';
    }
  };

  if (posEl) posEl.textContent = formatPositionsLabel();
  if (sentsEl) sentsEl.innerHTML = `<div style="color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.student_plan_launch.loading'))}</div>`;

  try {
    const did = Number(ctx && ctx.dictation_id);
    const all = await loadDictationSentencesForAssignmentModal(did);
    const list = Array.isArray(all) ? all : [];

    let pick = list;
    if (positions.length) {
      const set = new Set(positions);
      pick = list.filter(s => {
        try {
          const p = Number(s && s.position);
          return Number.isFinite(p) && set.has(p);
        } catch (e) {
          return false;
        }
      });
    }

    const rows = pick.slice(0, 60).map(s => {
      const p = Number(s && s.position);
      const txt = String((s && (s.text || s.sentence || s.value)) || '').trim();
      const short = txt.length > 160 ? `${txt.slice(0, 160)}…` : txt;
      return `
        <div style="display:flex; gap:10px; padding:10px 12px; border-radius:14px; background: rgba(0,0,0,0.04);">
          <div style="flex:0 0 auto; min-width:38px; height:26px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.06); font-weight:900; font-size:12px;">${escapeHtml(String(Number.isFinite(p) ? p : ''))}</div>
          <div style="flex:1 1 auto; font-size:13px; line-height:1.35; color: rgba(0,0,0,0.78);">${escapeHtml(short || '')}</div>
        </div>
      `;
    }).join('');
    if (sentsEl) sentsEl.innerHTML = rows || `<div style="color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.student_plan_launch.no_sentences'))}</div>`;
  } catch (e) {
    if (sentsEl) sentsEl.innerHTML = `<div style="color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.student_plan_launch.load_sentences_failed'))}</div>`;
  }

  const close = () => {
    try { modal.style.display = 'none'; } catch (e) { }
  };
  if (closeBtn) closeBtn.onclick = () => close();

  if (startBtn) {
    startBtn.onclick = () => {
      try {
        _setAssignmentLaunchContext({
          assignment_id: Number(ctx && ctx.assignment_id),
          dictation_id: Number(ctx && ctx.dictation_id),
          source_group_id: ctx && ctx.source_group_id != null ? Number(ctx.source_group_id) : null,
          source_group_title: ctx && ctx.source_group_title != null ? String(ctx.source_group_title) : null,
          selected_sentence_positions: positions.length ? positions : null,
          required_completions: Number(ctx && ctx.required_completions || 0) || 0,
        });
      } catch (e) {
      }
      close();
      _studentPlanOpenDictation(ctx && ctx.dictation_id, ctx && ctx.dictation_language_code);
    };
  }

  modal.style.display = 'block';
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }
  } catch (e) {
  }
}

const STUDENT_PLAN_CACHE_STORE = 'student_plan_cache';
const STUDENT_PLAN_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function _getStudentPlanCacheKey(dateIso) {
  const d = String(dateIso || '').trim();
  if (!d) return null;
  const userId = getDraftUserIdForKey();
  if (!userId) return null;
  return `${String(userId)}:${d}`;
}

async function _getStudentPlanCacheForDateIdb(dateIso) {
  try {
    const key = _getStudentPlanCacheKey(dateIso);
    if (!key) return null;
    const row = await idbGet(STUDENT_PLAN_CACHE_STORE, key);
    if (!row || typeof row !== 'object') return null;
    const assignments = Array.isArray(row.assignments) ? row.assignments : [];
    return { ts: row.updatedAt || row.ts, assignments };
  } catch (e) {
    return null;
  }
}

async function _setStudentPlanCacheForDateIdb(dateIso, assignments) {
  try {
    const d = String(dateIso || '').trim();
    const key = _getStudentPlanCacheKey(d);
    if (!key) return;
    await idbPut(STUDENT_PLAN_CACHE_STORE, {
      key,
      userId: String(getDraftUserIdForKey()),
      dateIso: d,
      updatedAt: Date.now(),
      assignments: Array.isArray(assignments) ? assignments : [],
    });
  } catch (e) {
  }
}

async function _cleanupStudentPlanCacheIdb() {
  try {
    const rows = await idbGetAll(STUDENT_PLAN_CACHE_STORE);
    if (!Array.isArray(rows) || !rows.length) return;
    const now = Date.now();
    for (const row of rows) {
      try {
        const ts = Number(row && (row.updatedAt || row.ts) ? (row.updatedAt || row.ts) : 0) || 0;
        if (ts && now - ts > STUDENT_PLAN_CACHE_TTL_MS) {
          if (row && row.key) {
            await idbDelete(STUDENT_PLAN_CACHE_STORE, row.key);
          }
        }
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

function _pickTranslationLanguageForOpen({ preferredNative, availableTranslations, fallbackLang }) {
  const available = Array.isArray(availableTranslations)
    ? availableTranslations.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const preferred = preferredNative ? String(preferredNative).trim().toLowerCase() : '';
  const fallback = fallbackLang ? String(fallbackLang).trim().toLowerCase() : '';

  if (preferred && available.includes(preferred)) {
    return { lang: preferred, usedFallback: false, reason: '' };
  }

  if (available.length === 1) {
    return {
      lang: available[0],
      usedFallback: !!preferred && available[0] !== preferred,
      reason: preferred ? libT('private_library.translation_pick.only_available', { lang: preferred }) : ''
    };
  }

  if (fallback && available.includes(fallback)) {
    return { lang: fallback, usedFallback: false, reason: '' };
  }

  if (available.length > 1) {
    return { lang: available[0], usedFallback: !!preferred, reason: preferred ? libT('private_library.translation_pick.other_available', { lang: preferred }) : '' };
  }

  return { lang: fallback || 'en', usedFallback: false, reason: '' };
}

function _studentPlanRender(panel, dateIso, items) {
  const list = document.getElementById('student-plan-list');
  const subtitle = document.getElementById('student-plan-subtitle');
  if (subtitle) subtitle.textContent = dateIso ? String(dateIso) : '';
  if (!list) return;

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
      if (!cnt) {
        return total ? `${total}/${total}` : '';
      }
      const base = `${cnt}/${total || 0}`;
      if (minP != null && maxP != null) {
        return `${base} (${minP}-${maxP})`;
      }
      return base;
    } catch (e) {
      return '';
    }
  };

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = `<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">${escapeHtml(libT('private_library.student_plan.no_assignments'))}</div>`;
    return;
  }

  // Group by dictation first, then show per-group rows inside dictation card.
  const byDictation = new Map();
  for (const a of rows) {
    const dictationId = a && a.dictation_id ? Number(a.dictation_id) : null;
    const key = dictationId != null ? String(dictationId) : `no_dict_${Math.random()}`;
    if (!byDictation.has(key)) byDictation.set(key, []);
    byDictation.get(key).push(a);
  }

  const blocks = [];
  for (const [dictKey, dictItems] of byDictation.entries()) {
    const first = dictItems[0] || {};
    const dictationTitle = String(first && first.dictation_title
      ? first.dictation_title
      : libT('private_library.student_plan.dictation_fallback_title', { id: first.dictation_id }));
    const level = first && first.dictation_level ? String(first.dictation_level) : '—';
    const coverUrl = String(first && first.dictation_cover_url ? first.dictation_cover_url : '');
    const isCached = !!(first && first.__cached);
    const cacheBadge = isCached
      ? `<div title="${escapeHtml(libT('private_library.student_plan.cached_title'))}" style="display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:var(--color-cesh); color:var(--color-cesh-text); font-weight:800; font-size:12px;"><i data-lucide="download"></i><span>${escapeHtml(libT('private_library.student_plan.cached_badge'))}</span></div>`
      : '';
    const range = dateIso ? String(dateIso) : '—';

    const coverStyle = coverUrl
      ? `background-image:url(${escapeHtml(coverUrl)}); background-size:cover; background-position:center;`
      : '';
    const cacheCoverBorder = isCached ? 'border: 1px solid var(--color-cesh-text);' : '';
    const cardBg = isCached ? 'background: var(--color-cesh);' : 'background: #fff;';

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
            <button type="button" class="button-color-yellow" data-action="student-plan-open" data-assignment-id="${escapeHtml(String(assignmentId || ''))}" data-source-group-id="${escapeHtml(String(groupId || ''))}" data-source-group-title="${escapeHtml(String(groupTitle || ''))}" data-selected-positions="${escapeHtml(String(selectedPositionsAttr || ''))}" data-required-completions="${escapeHtml(String(req || 1))}" data-dictation-id="${dictationId || ''}" data-dictation-lang="${escapeHtml(langCode)}" data-plan-date="${escapeHtml(String(range || ''))}" data-dictation-title="${escapeHtml(String(dictationTitle || ''))}" data-dictation-cover-url="${escapeHtml(String(coverUrl || ''))}" style="height:34px; padding:0 10px;">${escapeHtml(libT('private_library.student_plan_launch.start'))}</button>
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

  list.querySelectorAll('[data-action="student-plan-open"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dictationId = btn.getAttribute('data-dictation-id');
      const lang = btn.getAttribute('data-dictation-lang');
      const assignmentId = btn.getAttribute('data-assignment-id');
      const sourceGroupId = btn.getAttribute('data-source-group-id');
      const sourceGroupTitle = btn.getAttribute('data-source-group-title');
      const selectedPositionsStr = btn.getAttribute('data-selected-positions');
      const requiredCompletions = btn.getAttribute('data-required-completions');
      const planDate = btn.getAttribute('data-plan-date');
      const dictTitle = btn.getAttribute('data-dictation-title');
      const coverUrl = btn.getAttribute('data-dictation-cover-url');
      if (dictationId) {
        const positions = String(selectedPositionsStr || '')
          .split(',')
          .map(x => Number(String(x || '').trim()))
          .filter(x => Number.isFinite(x));

        const today = getTodayIsoDate();
        const forDay = String(planDate || '').trim();
        const isToday = Boolean(forDay && today && forDay === today);
        if (isToday) {
          _setAssignmentLaunchContext({
            assignment_id: Number(assignmentId),
            dictation_id: Number(dictationId),
            source_group_id: sourceGroupId != null ? Number(sourceGroupId) : null,
            source_group_title: sourceGroupTitle != null ? String(sourceGroupTitle) : null,
            selected_sentence_positions: positions.length ? positions : null,
            required_completions: Number(requiredCompletions || 0) || 0,
          });
          _studentPlanOpenDictation(dictationId, lang);
          return;
        }

        openStudentPlanLaunchConfirmModal({
          assignment_id: Number(assignmentId),
          dictation_id: Number(dictationId),
          dictation_language_code: String(lang || ''),
          dictation_title: String(dictTitle || ''),
          dictation_cover_url: String(coverUrl || ''),
          plan_date: forDay,
          source_group_id: sourceGroupId != null ? Number(sourceGroupId) : null,
          source_group_title: sourceGroupTitle != null ? String(sourceGroupTitle) : null,
          selected_sentence_positions: positions.length ? positions : null,
          required_completions: Number(requiredCompletions || 0) || 0,
        });
      }
    });
  });

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: list });
    }
  } catch (e) {
  }
}

async function openStudentPlanPanel(dateIso = null) {
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

    try {
      const tClean0 = _nowTs();
      await _cleanupStudentPlanCacheIdb();
      _planLog('cleanup_cache', tClean0);
    } catch (e) {
    }

    if (!forceRefresh) {
      const tIdb0 = _nowTs();
      const cached = await _getStudentPlanCacheForDateIdb(d);
      _planLog('idb_read', tIdb0);
      if (cached && Array.isArray(cached.assignments) && cached.assignments.length) {
        _studentPlanRender(panel, d, cached.assignments);
      } else {
        if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Загрузка…</div>';
      }
    } else {
      if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Загрузка…</div>';
    }
    try {
      const tNet0 = _nowTs();
      const res = await apiRequest(`/api/assignments/student/my?date=${encodeURIComponent(d)}`, { method: 'GET' });
      _planLog('api_fetch', tNet0);
      if (!res || !res.success) {
        const fallback = await _getStudentPlanCacheForDateIdb(d);
        if (fallback && Array.isArray(fallback.assignments) && fallback.assignments.length) {
          _studentPlanRender(panel, d, fallback.assignments);
          return;
        }
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

      const tIdbW0 = _nowTs();
      await _setStudentPlanCacheForDateIdb(d, items);
      _planLog('idb_write', tIdbW0);

      const tRender0 = _nowTs();
      _studentPlanRender(panel, d, items);
      _planLog('render', tRender0);
      _planLog(`load_total(force=${forceRefresh ? '1' : '0'})`, tLoad0);
    } catch (e) {
      const fallback = await _getStudentPlanCacheForDateIdb(d);
      if (fallback && Array.isArray(fallback.assignments) && fallback.assignments.length) {
        _studentPlanRender(panel, d, fallback.assignments);
        return;
      }
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

function ensureTeacherAssignmentsPanel() {
  let panel = document.getElementById('teacher-assignments-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'teacher-assignments-panel';
  panel.style.display = 'none';
  panel.style.position = 'fixed';
  panel.style.left = '0';
  panel.style.top = '0';
  panel.style.width = '100%';
  panel.style.height = '100%';
  panel.style.zIndex = '100000';
  panel.style.background = 'rgba(0,0,0,0.35)';
  panel.style.backdropFilter = 'blur(4px)';

  panel.innerHTML = `
    <div id="teacher-assignments-panel-drawer" style="position:absolute; right:0; top:0; height:100%; width:min(75vw, 980px); background:#fff; color:#222; box-shadow:-12px 0 40px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 14px 10px 14px; border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background: rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center;">
            <i data-lucide="hat-glasses"></i>
          </div>
          <div>
            <div style="font-weight:700; font-size:16px; line-height:1.1;">Задания</div>
            <div style="font-size:12px; color: rgba(0,0,0,0.55); margin-top:2px;">Список заданий для выбранной группы</div>
          </div>
        </div>
        <button type="button" id="teacher-assignments-close" class="modal-close" title="Закрыть" style="background:transparent; border:0; cursor:pointer; padding:6px;">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.08); display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <div style="font-size:12px; color: rgba(0,0,0,0.65); white-space:nowrap;">Группа</div>
            <select id="teacher-assignments-group" style="height:40px; padding:0 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.16); min-width:0; flex:1;"></select>
          </div>
          <button type="button" id="teacher-assignments-refresh" class="topbar-icon-btn" title="Обновить" style="width:40px; height:40px;">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>
      </div>

      <div id="teacher-assignments-list" style="padding:14px; overflow:auto; flex:1;"></div>
    </div>
  `;

  document.body.appendChild(panel);
  return panel;
}

function _teacherAssignmentsRender(items) {
  const list = document.getElementById('teacher-assignments-list');
  if (!list) return;

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
      if (!cnt) {
        return total ? `${total}/${total}` : '';
      }
      const base = `${cnt}/${total || 0}`;
      if (minP != null && maxP != null) {
        return `${base} (${minP}-${maxP})`;
      }
      return base;
    } catch (e) {
      return '';
    }
  };

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Заданий нет</div>';
    return;
  }

  const blocks = rows.map(a => {
    const dictationTitle = String(a && a.dictation_title ? a.dictation_title : `Диктант ${a.dictation_id}`);
    const groupTitle = String(a && (a.group_title || a.group_id) ? (a.group_title || `Группа ${a.group_id}`) : '');
    const level = a && a.dictation_level ? String(a.dictation_level) : '—';
    const sentencesCount = Number(a && typeof a.dictation_sentences_count !== 'undefined' ? a.dictation_sentences_count : 0);
    const selectedPositions = Array.isArray(a && a.selected_sentence_positions)
      ? a.selected_sentence_positions.map(x => Number(x)).filter(x => Number.isFinite(x))
      : null;
    const subsetLabel = buildSubsetLabel(selectedPositions, sentencesCount);
    const groupLabel = groupTitle ? `${groupTitle}${subsetLabel ? ` · ${subsetLabel}` : ''}` : '';
    const sentenceCountLabel = subsetLabel ? subsetLabel : String(sentencesCount || 0);
    const coverUrl = String(a && a.dictation_cover_url ? a.dictation_cover_url : '');
    const days = Array.isArray(a && a.days ? a.days : null) ? a.days : [];
    const dayDates = days
      .map(d => String(d && (d.date || d.day_date) ? (d.date || d.day_date) : '').trim())
      .filter(Boolean)
      .sort();
    const start = dayDates.length ? dayDates[0] : '';
    const end = dayDates.length ? dayDates[dayDates.length - 1] : '';
    const range = (start && end && start !== end) ? `${start} — ${end}` : (start || end || '—');
    const req = (() => {
      let maxReq = 1;
      for (const d of days) {
        const v = Number(d && (d.required_completions ?? d.count) ? (d.required_completions ?? d.count) : 1);
        if (Number.isFinite(v) && v > maxReq) maxReq = v;
      }
      return maxReq;
    })();
    const isCached = !!(a && a.__cached);
    const pct = (a && typeof a.class_percent_completed === 'number') ? a.class_percent_completed : null;
    const badgeBg = 'rgba(245,158,11,0.16)';
    const badgeColor = '#92400e';

    const coverStyle = coverUrl
      ? `background-image:url(${escapeHtml(coverUrl)}); background-size:cover; background-position:center;`
      : '';

    const leftBadge = (pct == null)
      ? ''
      : `<div title="Выполнение классом" style="padding:6px 10px; border-radius:999px; background:rgba(37,99,235,0.12); color:#1e40af; font-weight:800; font-size:12px;">${Number(pct)}%</div>`;

    const cacheBadge = isCached
      ? '<div title="В кеше" style="display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:var(--color-cesh); color:var(--color-cesh-text); font-weight:800; font-size:12px;"><i data-lucide="download"></i><span>в кеше</span></div>'
      : '';

    const cacheCoverBorder = isCached ? 'border: 1px solid var(--color-cesh-text);' : '';
    const cardBg = isCached ? 'background: var(--color-cesh);' : 'background: #fff;';

    return `
      <div style="border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:12px; margin-top:10px; ${cardBg}">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div style="min-width:0; display:flex; gap:10px;">
            <div style="width:200px; height:120px; border-radius:14px; background:#eee; flex-shrink:0; ${coverStyle} ${cacheCoverBorder}"></div>
            <div style="min-width:0;">
              <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(dictationTitle)}</div>
              <div style="margin-top:4px; font-size:12px; color: rgba(0,0,0,0.55);">${escapeHtml(range)}${groupLabel ? ` · ${escapeHtml(groupLabel)}` : ''} · уровень ${escapeHtml(level)} · ${escapeHtml(String(sentenceCountLabel))} предлож.</div>
              <div style="margin-top:8px;">${cacheBadge}</div>
            </div>
          </div>
          <div style="flex-shrink:0; display:flex; gap:8px; align-items:center;">
            <button type="button" class="topbar-icon-btn" data-action="teacher-view-assignment-students" data-assignment-id="${escapeHtml(String(a.id))}" title="Ученики" style="width:34px; height:34px;">
              <i data-lucide="user"></i>
            </button>
            <button type="button" class="topbar-icon-btn" data-action="teacher-edit-assignment" data-assignment-id="${escapeHtml(String(a.id))}" data-group-id="${escapeHtml(String(a.group_id))}" data-dictation-id="${escapeHtml(String(a.dictation_id))}" title="Редактировать" style="width:34px; height:34px;">
              <i data-lucide="pencil"></i>
            </button>
            ${leftBadge}
            <div title="Сколько раз пройти на медальку" style="padding:6px 10px; border-radius:999px; background:${badgeBg}; color:${badgeColor}; font-weight:800; font-size:12px;">${req}x</div>
            <button type="button" class="topbar-icon-btn" data-action="teacher-delete-assignment" data-assignment-id="${escapeHtml(String(a.id))}" title="Удалить" style="width:34px; height:34px;"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      </div>
    `
  }).join('');

  list.innerHTML = blocks;

  list.querySelectorAll('[data-action="teacher-delete-assignment"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-assignment-id');
      if (!id) return;
      const ok = window.confirm('Удалить задание?');
      if (!ok) return;
      btn.disabled = true;
      try {
        await apiRequest('/api/assignments/teacher/delete', {
          method: 'POST',
          body: JSON.stringify({ ids: [Number(id)] }),
        });
        try { showToast('Задание удалено', { durationMs: 2000 }); } catch (e2) { }
        await _teacherAssignmentsReload();
      } catch (err) {
        try { showToast('Не удалось удалить', { durationMs: 2500 }); } catch (e2) { }
      } finally {
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-action="teacher-view-assignment-students"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-assignment-id');
      if (!id) return;
      btn.disabled = true;
      try {
        await openTeacherAssignmentStudentsModal(id);
      } finally {
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-action="teacher-edit-assignment"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-assignment-id');
      if (!id) return;
      btn.disabled = true;
      try {
        let dictationId = null;
        try {
          const raw = btn.getAttribute('data-dictation-id');
          const n = Number(String(raw || '').trim());
          dictationId = (Number.isFinite(n) && n > 0) ? n : null;
        } catch (e2) {
        }

        if (!dictationId) {
          const a = await loadAssignmentForTeacherModal(id);
          dictationId = (a && a.dictation_id != null) ? Number(a.dictation_id) : null;
        }

        if (!dictationId) {
          try { showToast('Не найден dictation_id', { durationMs: 2500 }); } catch (e3) { }
          return;
        }

        await openCreateAssignmentModal(dictationId, { edit_assignment_id: Number(id) });
      } finally {
        btn.disabled = false;
      }
    });
  });

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: list });
    }
  } catch (e) {
  }
}

async function _teacherAssignmentsReload(opts = {}) {
  const groupSelect = document.getElementById('teacher-assignments-group');
  const list = document.getElementById('teacher-assignments-list');
  const groupIdRaw = groupSelect ? String(groupSelect.value || '').trim() : '';
  if (!groupIdRaw) {
    if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Выбери группу</div>';
    return;
  }

  if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Загрузка…</div>';
  try {
    const groupIdInt = Number(groupIdRaw);
    if (!Number.isFinite(groupIdInt) || groupIdInt <= 0) {
      if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Некорректная группа</div>';
      return;
    }
    const res = await apiRequest(`/api/assignments/teacher/group/${encodeURIComponent(String(groupIdInt))}`, { method: 'GET' });
    if (!res || !res.success) {
      if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Не удалось загрузить задания</div>';
      return;
    }
    const items = Array.isArray(res.assignments) ? res.assignments : [];
    _teacherAssignmentsRender(items);
  } catch (e) {
    if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Не удалось загрузить задания</div>';
  }
}

async function openTeacherAssignmentsPanel() {
  const panel = ensureTeacherAssignmentsPanel();
  const closeBtn = document.getElementById('teacher-assignments-close');
  const refreshBtn = document.getElementById('teacher-assignments-refresh');
  const groupSelect = document.getElementById('teacher-assignments-group');
  const list = document.getElementById('teacher-assignments-list');

  const close = () => {
    try { panel.style.display = 'none'; } catch (e) { }
  };

  panel.onclick = (e) => {
    if (e.target === panel) close();
  };
  if (closeBtn) closeBtn.onclick = () => close();

  if (groupSelect) {
    groupSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— выбери группу —';
    groupSelect.appendChild(opt);
  }
  if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Загрузка…</div>';

  try {
    const groups = await loadMyGroupsForAssignmentModal();
    if (groupSelect) {
      groups.forEach(g => {
        const o = document.createElement('option');
        o.value = String(g.id);
        o.textContent = String(g.title || `Группа ${g.id}`);
        groupSelect.appendChild(o);
      });
      const last = getAssignmentLastGroupId();
      if (last && groupSelect.querySelector(`option[value="${CSS.escape(last)}"]`)) {
        groupSelect.value = last;
      } else if (groups.length === 1) {
        groupSelect.value = String(groups[0].id);
        try { setAssignmentLastGroupId(groupSelect.value); } catch (e) { }
      } else if (groups.length > 0) {
        groupSelect.value = String(groups[0].id);
        try { setAssignmentLastGroupId(groupSelect.value); } catch (e) { }
      }
    }
  } catch (e) {
    if (list) list.innerHTML = '<div style="padding: 10px 0; color: rgba(0,0,0,0.55);">Не удалось загрузить группы</div>';
  }

  if (groupSelect) {
    groupSelect.onchange = () => {
      try { setAssignmentLastGroupId(groupSelect.value); } catch (e) { }
      _teacherAssignmentsReload().catch(() => { });
    };
  }
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      _teacherAssignmentsReload().catch(() => { });
    };
  }

  panel.style.display = 'block';
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: panel });
    }
  } catch (e) {
  }

  await _teacherAssignmentsReload();
}

function renderCreateAssignmentDaysTable(modal) {
  const table = document.getElementById('create-assignment-days-table');
  if (!table) return;
  table.innerHTML = '';

  const days = getCreateAssignmentDaysState(modal);
  if (days.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '10px 0';
    empty.style.color = '#666';
    empty.textContent = 'Добавь дни кнопкой +';
    table.appendChild(empty);
    return;
  }

  const tableEl = document.createElement('table');
  tableEl.style.width = '100%';
  tableEl.style.borderCollapse = 'collapse';
  tableEl.style.fontSize = '13px';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr style="border-bottom:1px solid rgba(0,0,0,0.08);">
      <th style="text-align:left; padding:8px 6px; font-weight:700; width:60%;">Дата</th>
      <th style="text-align:left; padding:8px 6px; width:96px; font-weight:700;"><i data-lucide="award" style="width:18px; height:18px; color: var(--color-button-yellow-dark, #eab308);"></i></th>
      <th style="text-align:center; padding:8px 6px; width:46px; font-weight:700;"></th>
    </tr>
  `;
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  days.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(0,0,0,0.06)';

    const dateTd = document.createElement('td');
    dateTd.style.padding = '0';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = row && row.date ? String(row.date) : '';
    dateInput.style.height = '40px';
    dateInput.style.width = '100%';
    dateInput.style.padding = '0 6px';
    dateInput.style.borderRadius = '0';
    dateInput.style.border = '0';
    dateInput.style.background = 'transparent';
    dateInput.style.boxSizing = 'border-box';
    dateInput.style.minWidth = '0';
    dateInput.style.overflow = 'hidden';
    dateTd.appendChild(dateInput);

    const medalTd = document.createElement('td');
    medalTd.style.padding = '0';
    const medalWrap = document.createElement('div');
    medalWrap.style.display = 'flex';
    medalWrap.style.alignItems = 'stretch';
    medalWrap.style.gap = '0';
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.min = '1';
    countInput.step = '1';
    countInput.value = row && row.count ? String(row.count) : '1';
    countInput.style.height = '40px';
    countInput.style.width = '100%';
    countInput.style.padding = '0 10px';
    countInput.style.borderRadius = '0';
    countInput.style.border = '0';
    countInput.style.background = 'transparent';
    countInput.style.boxSizing = 'border-box';
    medalWrap.appendChild(countInput);
    medalTd.appendChild(medalWrap);

    const delTd = document.createElement('td');
    delTd.style.padding = '0';
    delTd.style.textAlign = 'center';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'topbar-icon-btn';
    delBtn.title = 'Удалить день';
    delBtn.style.width = '100%';
    delBtn.style.height = '40px';
    delBtn.style.margin = '0';
    delBtn.style.borderRadius = '0';
    delBtn.style.display = 'flex';
    delBtn.style.alignItems = 'center';
    delBtn.style.justifyContent = 'center';
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    delTd.appendChild(delBtn);

    dateInput.addEventListener('change', () => {
      const prev = row && row.date ? String(row.date) : '';
      const next = getCreateAssignmentDaysState(modal);
      next[idx] = Object.assign({}, next[idx], { date: String(dateInput.value || '') });
      setCreateAssignmentDaysState(modal, next);

      const v = validateAssignmentDaysWeekLimit(modal);
      if (!v.ok) {
        next[idx] = Object.assign({}, next[idx], { date: prev });
        setCreateAssignmentDaysState(modal, next);
        dateInput.value = prev;
        try { showToast(v.reason); } catch (e) { }
      }
    });
    countInput.addEventListener('change', () => {
      const next = getCreateAssignmentDaysState(modal);
      const v = parseInt(String(countInput.value || '1'), 10);
      next[idx] = Object.assign({}, next[idx], { count: Number.isFinite(v) && v > 0 ? v : 1 });
      setCreateAssignmentDaysState(modal, next);
    });
    delBtn.addEventListener('click', () => {
      const next = getCreateAssignmentDaysState(modal);
      next.splice(idx, 1);
      setCreateAssignmentDaysState(modal, next);
      renderCreateAssignmentDaysTable(modal);
    });

    tr.appendChild(dateTd);
    tr.appendChild(medalTd);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  });
  tableEl.appendChild(tbody);
  table.appendChild(tableEl);

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: table });
    }
  } catch (e) {
  }
}

async function loadMyGroupsForAssignmentModal() {
  const res = await apiRequest('/groups/api/my', { method: 'GET' });
  if (!res || !res.success) return [];
  const groups = Array.isArray(res.groups) ? res.groups : [];
  return groups.filter(g => !g.archived_at);
}

async function loadAssignmentForTeacherModal(assignmentId) {
  const id = Number(assignmentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const res = await apiRequest(`/api/assignments/teacher/assignment/${encodeURIComponent(String(id))}`, { method: 'GET' });
  if (!res || !res.success) return null;
  return res.assignment || null;
}

async function openCreateAssignmentModal(dictationId) {
  const modal = ensureCreateAssignmentModal();
  const options = arguments && arguments.length > 1 ? arguments[1] : null;

  try {
    // Ensure create-assignment modal is always above side panels.
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

  const idInput = document.getElementById('create-assignment-dictation-id');
  if (idInput) idInput.value = String(dictationId || '');

  const groupSelect = document.getElementById('create-assignment-group');
  if (groupSelect) {
    groupSelect.innerHTML = '';
  }

  try {
    const groups = await loadMyGroupsForAssignmentModal();
    if (groupSelect) {
      groups.forEach(g => {
        const o = document.createElement('option');
        o.value = String(g.id);
        o.textContent = String(g.title || `Группа ${g.id}`);
        groupSelect.appendChild(o);
      });

      const last = getAssignmentLastGroupId();
      if (last && groupSelect.querySelector(`option[value="${CSS.escape(last)}"]`)) {
        groupSelect.value = last;
      } else if (groups.length > 0) {
        groupSelect.value = String(groups[0].id);
      }
    }
  } catch (e) {
  }

  if (groupSelect) {
    groupSelect.onchange = () => {
      setAssignmentLastGroupId(groupSelect.value);
    };
  }

  try {
    const meta = await loadDictationMetaForAssignmentModal(dictationId);
    const titleEl = document.getElementById('create-assignment-dictation-title');
    const coverImg = document.getElementById('create-assignment-cover-img');
    const metaEl = document.getElementById('create-assignment-cover-meta');
    if (titleEl) titleEl.textContent = meta && meta.title ? String(meta.title) : '';
    if (coverImg) coverImg.src = meta && meta.cover_url ? String(meta.cover_url) : '';
    if (metaEl) {
      const level = meta && meta.level ? String(meta.level) : '—';
      const lang = meta && meta.language_code ? String(meta.language_code) : '—';
      metaEl.textContent = `${lang.toUpperCase()} · ${level}`;
    }
  } catch (e) {
  }

  try {
    const sentences = await loadDictationSentencesForAssignmentModal(dictationId);
    setCreateAssignmentSentencesState(modal, { sentences, selectedPositions: null });
    renderCreateAssignmentSentencesTable(modal);
  } catch (e) {
    setCreateAssignmentSentencesState(modal, { sentences: [], selectedPositions: null });
    renderCreateAssignmentSentencesTable(modal);
  }

  const daysAddBtn = document.getElementById('create-assignment-days-add');

  const today = getTodayIsoDate();

  setCreateAssignmentDaysState(modal, [{ date: today, count: 1 }]);
  renderCreateAssignmentDaysTable(modal);

  const editAssignmentId = (() => {
    try {
      const raw = modal.dataset.editAssignmentId;
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
      return null;
    }
  })();

  if (editAssignmentId) {
    try {
      const a = await loadAssignmentForTeacherModal(editAssignmentId);
      if (a && typeof a === 'object') {
        try {
          if (groupSelect && a.group_id != null) {
            const v = String(a.group_id);
            if (groupSelect.querySelector(`option[value="${CSS.escape(v)}"]`)) {
              groupSelect.value = v;
              setAssignmentLastGroupId(v);
            }
          }
        } catch (e) {
        }

        try {
          const daysSrc = Array.isArray(a.days) ? a.days : [];
          const preparedDays = (daysSrc.length ? daysSrc : [{ date: today, required_completions: 1 }])
            .map(x => ({
              date: String(x && (x.date || x.day_date) ? (x.date || x.day_date) : '').trim(),
              count: Number(x && (x.required_completions ?? x.count) ? (x.required_completions ?? x.count) : 1) || 1,
            }))
            .filter(x => x.date);

          setCreateAssignmentDaysState(modal, preparedDays.length ? preparedDays : [{ date: today, count: 1 }]);
          renderCreateAssignmentDaysTable(modal);
          if (daysAddBtn) daysAddBtn.disabled = false;
        } catch (e) {
        }

        try {
          const curSent = getCreateAssignmentSentencesState(modal);
          const selected = Array.isArray(a.selected_sentence_positions)
            ? a.selected_sentence_positions.map(x => Number(x)).filter(x => Number.isFinite(x))
            : null;
          setCreateAssignmentSentencesState(modal, Object.assign({}, curSent, { selectedPositions: selected && selected.length ? selected : null }));
          renderCreateAssignmentSentencesTable(modal);
        } catch (e) {
        }
      }
    } catch (e) {
    }
  } else {
    if (daysAddBtn) daysAddBtn.disabled = false;
  }

  if (daysAddBtn) {
    daysAddBtn.onclick = () => {
      const cur0 = getCreateAssignmentDaysState(modal);
      const uniq0 = Array.from(new Set(cur0.map(x => String(x && x.date ? x.date : '').trim()).filter(Boolean)));
      if (uniq0.length >= 7) {
        try { showToast('Максимум 7 дней'); } catch (e) { }
        return;
      }
      const cur = getCreateAssignmentDaysState(modal);
      const last = cur.length > 0 ? cur[cur.length - 1] : null;
      const lastDate = last && last.date ? String(last.date) : today;
      cur.push({ date: addDaysIsoDate(lastDate, 1), count: 1 });
      setCreateAssignmentDaysState(modal, cur);

      const v = validateAssignmentDaysWeekLimit(modal);
      if (!v.ok) {
        cur.pop();
        setCreateAssignmentDaysState(modal, cur);
        try { showToast(v.reason); } catch (e) { }
        return;
      }
      renderCreateAssignmentDaysTable(modal);
    };
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
    };
  }

  const closeBtn = document.getElementById('create-assignment-close');
  const saveBtn = document.getElementById('create-assignment-save');

  const close = () => {
    try { modal.style.display = 'none'; } catch (e) { }
  };

  if (closeBtn) closeBtn.onclick = () => close();
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        const groupId = groupSelect ? String(groupSelect.value || '').trim() : '';
        const dictationIdRaw = idInput ? String(idInput.value || '').trim() : '';

        if (!groupId) {
          showToast('Выбери группу');
          return;
        }
        if (!dictationIdRaw) {
          showToast('Не найден dictation_id');
          return;
        }

        const group_id = Number(groupId);
        const dictation_id = Number(dictationIdRaw);
        if (!Number.isFinite(group_id) || group_id <= 0) {
          showToast('Неверный group_id');
          return;
        }
        if (!Number.isFinite(dictation_id) || dictation_id <= 0) {
          showToast('Неверный dictation_id');
          return;
        }

        const state = getCreateAssignmentDaysState(modal);
        const days = (Array.isArray(state) ? state : []).map(x => ({
          date: String(x?.date || '').trim(),
          required_completions: Number(x?.count || 1)
        })).filter(x => x.date);

        const sentenceState = getCreateAssignmentSentencesState(modal);
        const selected_sentence_positions = Array.isArray(sentenceState.selectedPositions) ? sentenceState.selectedPositions : null;

        if (Array.isArray(selected_sentence_positions) && selected_sentence_positions.length === 0) {
          showToast('Выбери хотя бы одно предложение');
          return;
        }

        if (!days.length) {
          showToast('Добавь хотя бы один день');
          return;
        }

        for (const d of days) {
          if (!Number.isFinite(d.required_completions) || d.required_completions <= 0) {
            showToast('Неверное число попыток в плане');
            return;
          }
        }

        const uniq = Array.from(new Set(days.map(x => x.date))).sort();
        if (uniq.length > 7) {
          showToast('Максимум 7 дней');
          return;
        }
        const span = uniq.length ? diffDaysIsoDate(uniq[0], uniq[uniq.length - 1]) : 0;
        if (span != null && span > 6) {
          showToast('Максимум 7 дней');
          return;
        }

        const editIdRaw = (() => {
          try { return modal.dataset.editAssignmentId || ''; } catch (e) { return ''; }
        })();
        const editId = Number(editIdRaw);

        const isEdit = Number.isFinite(editId) && editId > 0;

        const res = isEdit
          ? await apiRequest(`/api/assignments/teacher/assignment/${encodeURIComponent(String(editId))}`, {
            method: 'PUT',
            body: JSON.stringify({
              group_id,
              days,
              selected_sentence_positions
            })
          })
          : await apiRequest('/api/assignments/teacher/create', {
            method: 'POST',
            body: JSON.stringify({
              group_id,
              dictation_id,
              mode: 'days',
              days,
              selected_sentence_positions
            })
          });

        if (!res || !res.success) {
          const rawErr = res && res.error ? String(res.error) : '';
          const friendly = (rawErr && rawErr.toLowerCase().includes('overlap'))
            ? 'На выбранные даты уже есть задание для этого диктанта и этого же набора предложений. Если хочешь второе задание — выбери другой набор предложений или другую дату.'
            : (rawErr || 'Ошибка сохранения');
          showToast(friendly, { durationMs: 4000 });
          return;
        }

        showToast('Задание сохранено', { durationMs: 2500 });
        close();
        try {
          await _teacherAssignmentsReload();
        } catch (e) {
        }
        return;
      } catch (e) {
        showToast('Ошибка сохранения', { durationMs: 2500 });
      }
    };
  }

  modal.style.display = 'flex';

  try {
    const t = document.querySelector('.create-assignment-modal-title-text');
    if (t) t.textContent = editAssignmentId ? 'Задание (редактирование)' : 'Задание';
  } catch (e) {
  }

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }
  } catch (e) {
  }
}

let __selectedBookDictationCard = null;

function getDefaultOriginalLanguageForNewBook() {
  try {
    const fromFilter = (typeof currentBooksFilterLanguage !== 'undefined')
      ? currentBooksFilterLanguage
      : null;
    const fromSelector = (booksLanguageSelectorInstance && typeof booksLanguageSelectorInstance.getValues === 'function')
      ? (booksLanguageSelectorInstance.getValues() || {}).currentLearning
      : null;
    const fromUser = window.USER_LANGUAGE_DATA?.currentLearning || null;
    const raw = fromFilter || fromSelector || fromUser || null;
    if (!raw) return null;
    const v = String(raw).trim().toLowerCase();
    if (!v || v === 'all') return null;
    return v;
  } catch (e) {
    return null;
  }
}

// Debug helper: capture clicks globally to understand if modal buttons are actually receiving events.
// (Useful when something overlays the button or stops propagation.)
// Вспомогательная функция отладки: глобально перехватывает клики, чтобы понять, получают ли кнопки модального окна события.
// (Полезно, когда что-то перекрывает кнопку или препятствует распространению событий.)
try {
  if (!window.__deleteModalClickDebugInstalled) {
    window.__deleteModalClickDebugInstalled = true;
    document.addEventListener('click', (event) => {
      try {
        const t = event.target;
        if (!t) return;
        const confirmBtn = t.closest ? t.closest('#delete-dictation-confirm') : null;
        const closeBtn = t.closest ? t.closest('#delete-dictation-close') : null;
        const modal = t.closest ? t.closest('#delete-dictation-modal') : null;
        if (confirmBtn || closeBtn || (modal && t.id === 'delete-dictation-modal')) {
          console.log('🗑️ [capture] click', {
            targetTag: t.tagName,
            targetId: t.id || null,
            targetClass: (typeof t.className === 'string') ? t.className : null,
            isConfirm: !!confirmBtn,
            isClose: !!closeBtn,
            isModalBackdrop: !!(modal && t.id === 'delete-dictation-modal'),
            pendingDeleteDictationId: (typeof pendingDeleteDictationId !== 'undefined') ? pendingDeleteDictationId : null
          });
        }
      } catch (e) {
        // ignore
      }
    }, true);
  }
} catch (e) {
  // ignore
}

function getJoinGroupTokenFromUrl() {
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get('join_group');
    const v = String(t || '').trim();
    return v || null;
  } catch (e) {
    return null;
  }
}

function waitForUserManagerReady(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        const ready = !!(window.UM && typeof window.UM.isAuthenticated === 'function' && window.UM.isInitialized);
        if (ready) {
          clearInterval(timer);
          resolve(true);
          return;
        }
      } catch (e) {
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

function clearJoinGroupTokenInUrl() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('join_group');
    window.history.replaceState({}, '', u.toString());
  } catch (e) {
  }
}

function ensureJoinGroupConfirmModal() {
  let modal = document.getElementById('join-group-confirm-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'join-group-confirm-modal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  modal.style.backdropFilter = 'blur(2px)';
  modal.style.webkitBackdropFilter = 'blur(2px)';
  modal.style.zIndex = '10090';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 520px;">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 16px 12px 16px;">
        <h3 style="margin:0;">Вступить в группу</h3>
      </div>
      <div class="modal-body" style="padding:0 16px 16px 16px;">
        <div id="join-group-confirm-text" style="margin-top:6px;">Вступить в группу учителя?</div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:12px; padding:0 16px 16px 16px;">
        <button type="button" class="button-secondary" id="join-group-confirm-cancel">Отмена</button>
        <button type="button" class="button-color-yellow" id="join-group-confirm-yes">Вступить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.position = 'relative';
      content.style.zIndex = '10091';
    }
  } catch (e) {
  }

  try {
    if (window.lucide) window.lucide.createIcons({ root: modal });
  } catch (e) {
  }
  return modal;
}

async function getJoinGroupInvitePreview(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('token is required');
  const data = await apiRequest(`/groups/api/join/${encodeURIComponent(t)}/preview`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  return data;
}

function ensureEmailInviteModal() {
  let modal = document.getElementById('email-invite-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'email-invite-modal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  modal.style.backdropFilter = 'blur(2px)';
  modal.style.webkitBackdropFilter = 'blur(2px)';
  modal.style.zIndex = '10092';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 560px; background: #fff; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.35); overflow: hidden; color: #222;">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 16px 12px 16px;">
        <h3 style="margin:0;">Приглашение в группу</h3>
      </div>
      <div class="modal-body" style="padding:0 16px 16px 16px;">
        <div id="email-invite-text" style="margin-top:6px;"></div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:12px; padding:0 16px 16px 16px;">
        <button type="button" class="button-secondary" id="email-invite-decline">Отклонить</button>
        <button type="button" class="button-color-yellow" id="email-invite-accept">Принять</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.position = 'relative';
      content.style.zIndex = '10093';
    }
  } catch (e) {
  }
  return modal;
}

async function showEmailInviteModal(text) {
  return new Promise((resolve) => {
    const modal = ensureEmailInviteModal();
    const textEl = document.getElementById('email-invite-text');
    const acceptBtn = document.getElementById('email-invite-accept');
    const declineBtn = document.getElementById('email-invite-decline');
    if (textEl) textEl.textContent = String(text || '').trim();

    const cleanup = () => {
      try { modal.style.display = 'none'; } catch (e) {}
      try { acceptBtn && acceptBtn.removeEventListener('click', onAccept); } catch (e) {}
      try { declineBtn && declineBtn.removeEventListener('click', onDecline); } catch (e) {}
    };
    const onAccept = () => { cleanup(); resolve(true); };
    const onDecline = () => { cleanup(); resolve(false); };

    acceptBtn && acceptBtn.addEventListener('click', onAccept);
    declineBtn && declineBtn.addEventListener('click', onDecline);
    modal.style.display = 'flex';
  });
}

async function fetchMyPendingEmailInvites() {
  const data = await apiRequest('/groups/api/my-invites', { method: 'GET' });
  return data;
}

async function acceptEmailInvite(inviteId) {
  const data = await apiRequest(`/groups/api/invite/${encodeURIComponent(inviteId)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return data;
}

async function declineEmailInvite(inviteId) {
  const data = await apiRequest(`/groups/api/invite/${encodeURIComponent(inviteId)}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return data;
}

let __emailInvitesCheckedOnce = false;

async function handlePendingEmailInvitesAfterLogin() {
  if (__emailInvitesCheckedOnce) return;
  __emailInvitesCheckedOnce = true;
  try {
    if (!window.UM || typeof window.UM.isAuthenticated !== 'function' || !window.UM.isAuthenticated()) return;
  } catch (e) {
    return;
  }

  try {
    const res = await fetchMyPendingEmailInvites();
    if (!res || !res.success) return;
    const invites = Array.isArray(res.invites) ? res.invites : [];
    if (invites.length === 0) return;
    const inv = invites[0];
    const groupTitle = inv && inv.group_title ? String(inv.group_title) : '';
    const teacherUsername = inv && inv.teacher_username ? String(inv.teacher_username) : '';
    const txt = groupTitle && teacherUsername
      ? `Учитель ${teacherUsername} приглашает тебя в группу «${groupTitle}». Принять приглашение?`
      : 'Тебя пригласили в группу. Принять приглашение?';

    const ok = await showEmailInviteModal(txt);
    if (ok) {
      const r = await acceptEmailInvite(inv.id);
      if (r && r.success) {
        showToast('Приглашение принято');
        try { if (typeof loadLibraryData === 'function') loadLibraryData(); } catch (e) {}
      } else {
        const msg = r && (r.error || r.message) ? String(r.error || r.message) : 'Ошибка';
        showToast(`Не удалось принять приглашение: ${msg}`);
      }
    } else {
      const r = await declineEmailInvite(inv.id);
      if (r && r.success) {
        showToast('Приглашение отклонено');
      } else {
        const msg = r && (r.error || r.message) ? String(r.error || r.message) : 'Ошибка';
        showToast(`Не удалось отклонить приглашение: ${msg}`);
      }
    }
  } catch (e) {
    // ignore
  }
}

async function showJoinGroupConfirmModal() {
  return new Promise((resolve) => {
    const modal = ensureJoinGroupConfirmModal();
    const cancelBtn = document.getElementById('join-group-confirm-cancel');
    const yesBtn = document.getElementById('join-group-confirm-yes');

    const cleanup = () => {
      try {
        modal.style.display = 'none';
      } catch (e) {
      }
      try {
        cancelBtn && cancelBtn.removeEventListener('click', onCancel);
      } catch (e) {
      }
      try {
        yesBtn && yesBtn.removeEventListener('click', onYes);
      } catch (e) {
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onYes = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn && cancelBtn.addEventListener('click', onCancel);
    yesBtn && yesBtn.addEventListener('click', onYes);
    modal.style.display = 'flex';
    try {
      if (window.lucide) window.lucide.createIcons({ root: modal });
    } catch (e) {
    }
  });
}

async function joinGroupByToken(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('token is required');

  const data = await apiRequest(`/groups/api/join/${encodeURIComponent(t)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return data;
}

let __joinGroupInviteInFlight = false;

async function handleJoinGroupInviteFromUrl() {
  if (__joinGroupInviteInFlight) return;
  const token = getJoinGroupTokenFromUrl();
  if (!token) return;

  __joinGroupInviteInFlight = true;

  try {
    console.log('[join-group] token detected', token);

    // If not authed -> force login via modal
    try {
      if (!window.UM || typeof window.UM.isAuthenticated !== 'function' || !window.UM.isAuthenticated()) {
        console.log('[join-group] user not authenticated, showing login modal');
        if (window.LoginModal && typeof window.LoginModal.showAndWaitForLogin === 'function') {
          await window.LoginModal.showAndWaitForLogin();
        } else if (typeof window.showLoginModal === 'function') {
          window.showLoginModal();
          // wait until authenticated
          await new Promise((resolve) => {
            const started = Date.now();
            const timer = setInterval(() => {
              const ok = window.UM && typeof window.UM.isAuthenticated === 'function' && window.UM.isAuthenticated();
              if (ok) {
                clearInterval(timer);
                resolve();
                return;
              }
              if (Date.now() - started > 5 * 60 * 1000) {
                clearInterval(timer);
                resolve();
              }
            }, 300);
          });
        }
      }
    } catch (e) {
      console.warn('[join-group] login modal flow failed', e);
    }

    if (!window.UM || typeof window.UM.isAuthenticated !== 'function' || !window.UM.isAuthenticated()) {
      showToast('Нужно войти, чтобы вступить в группу');
      return;
    }

    // Try to show teacher/group info before confirmation
    try {
      const previewRes = await getJoinGroupInvitePreview(token);
      const preview = previewRes && previewRes.preview ? previewRes.preview : null;
      const groupTitle = preview && preview.group_title ? String(preview.group_title) : '';
      const teacherUsername = preview && preview.teacher_username ? String(preview.teacher_username) : '';
      const textEl = document.getElementById('join-group-confirm-text');
      if (textEl) {
        if (groupTitle && teacherUsername) {
          textEl.textContent = `Вступить в группу «${groupTitle}» учителя ${teacherUsername}?`;
        } else if (groupTitle) {
          textEl.textContent = `Вступить в группу «${groupTitle}»?`;
        } else if (teacherUsername) {
          textEl.textContent = `Вступить в группу учителя ${teacherUsername}?`;
        }
      }
    } catch (e) {
      // ignore preview failures
    }

    console.log('[join-group] showing confirm modal');
    const ok = await showJoinGroupConfirmModal();
    console.log('[join-group] confirm result', ok);
    if (!ok) {
      clearJoinGroupTokenInUrl();
      return;
    }

    console.log('[join-group] calling join API');
    const res = await joinGroupByToken(token);
    console.log('[join-group] join API result', res);
    if (res && res.success) {
      showToast('Ты вступил в группу');
      clearJoinGroupTokenInUrl();
      try {
        // refresh library data if available
        if (typeof loadLibraryData === 'function') loadLibraryData();
      } catch (e) {
      }
    } else {
      const msg = res && (res.error || res.message) ? String(res.error || res.message) : 'Ошибка';
      showToast(`Не удалось вступить в группу: ${msg}`);
    }
  } catch (e) {
    console.warn('[join-group] failed', e);
    const msg = e && e.message ? e.message : String(e);
    showToast(`Не удалось вступить в группу: ${msg}`);
  } finally {
    __joinGroupInviteInFlight = false;
  }
}

let bookLanguageSelector = null;
let booksLanguageSelectorInstance = null;
let publicBooksLanguageSelectorInstance = null;
let activeBookId = null;
let activeBookIsWorkbook = false;
let bookViewActiveBookId = null;
let currentView = 'cards'; // 'cards' or 'list'
let deskItems = []; // Список диктантов на столе
let deskLoadSeq = 0;
let deskLoadInFlight = null;
let pendingDeleteDictationId = null;

let __workbookBookId = null;

let lastOwnBooks = [];
let lastShelfBooks = [];
let currentBooksFilterLanguage = null;
let currentPublicBooksFilterLanguage = null;
let pendingDeleteSectionId = null;

function getToken() {
  return localStorage.getItem("jwt_token");
}

function getBookCroppedCoverBlob() {
  try {
    const m = window.CoverManager;
    if (m && typeof m.getCroppedBlob === 'function') {
      return m.getCroppedBlob();
    }
  } catch (e) {
  }
  return null;
}

function clearBookCroppedCoverBlob() {
  try {
    const m = window.CoverManager;
    if (m && typeof m.clearCroppedBlob === 'function') {
      m.clearCroppedBlob();
      return;
    }
  } catch (e) {
  }
}

function bindCoverHandlers() {
  try {
    const m = window.CoverManager;
    if (!m || typeof m.bind !== 'function') return;

    m.bind({
      fileInputId: 'book-cover-upload',
      uploadBtnId: 'book-cover-upload-btn',
      clickableId: 'book-cover-clickable',
      previewImgId: 'book-cover-preview',
      placeholderId: 'book-cover-placeholder',
      aspectRatio: 1,
      outputWidth: 200,
      outputHeight: 200,
      outputType: 'image/webp',
      outputQuality: 0.95,
      maxFileSizeBytes: 5 * 1024 * 1024,
      successToast: 'Обложка готова к сохранению',
      onDirty: () => {
        try { setBookEditDirty(true); } catch (e) {}
      },
      onConfirm: () => {
        try { setBookEditDirty(true); } catch (e) {}
      },
    });
  } catch (e) {
  }
}

async function idbPut(storeName, value) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbPut === 'function') {
    return idb.idbPut(storeName, value);
  }
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(storeName, key) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbDelete === 'function') {
    return idb.idbDelete(storeName, key);
  }
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteDictationCache(dictationId) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbDeleteDictationCache === 'function') {
    return idb.idbDeleteDictationCache(dictationId);
  }
  try {
    const dictId = String(dictationId || '').trim();
    if (!dictId) return;
    const rows = await idbGetAll('dictations');
    for (const row of rows || []) {
      try {
        if (row && String(row.dictationId || '') === dictId && row.key) {
          await idbDelete('dictations', row.key);
        }
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

async function idbGetAll(storeName) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbGetAll === 'function') {
    return idb.idbGetAll(storeName);
  }
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function withCacheBust(url) {
  return window.CoverManager.withCacheBust(url);
}

function withCacheBustVersion(url, version) {
  return window.CoverManager.withCacheBustVersion(url, version);
}

function maybeCacheBustDictationCover(url) {
  return window.CoverManager.maybeCacheBustDictationCover(url);
}

function getDraftUserIdForKey() {
  try {
    const um = window.UM;
    const id = um && um.userData ? um.userData.id : null;
    return id ? String(id) : 'anon';
  } catch (e) {
    return 'anon';
  }
}

function _normalizeLangCodeSafe(v) {
  try {
    const s = String(v || '').trim().toLowerCase();
    return s || '';
  } catch (e) {
    return '';
  }
}

function _dictationIdToDictKey(dictationId) {
  const raw = String(dictationId || '').trim();
  if (!raw) return '';
  return raw.startsWith('dict_') ? raw : `dict_${raw}`;
}

function _buildSentencesUrl(dictKey, langOrig, langTr) {
  const d = _dictationIdToDictKey(dictKey);
  const lo = _normalizeLangCodeSafe(langOrig);
  const lt = _normalizeLangCodeSafe(langTr);
  if (!d || !lo || !lt) return '';
  return `/api/dictation/${encodeURIComponent(d)}/${encodeURIComponent(lo)}/${encodeURIComponent(lt)}/sentences`;
}

async function _fetchSentencesFromServer(dictKey, langOrig, langTr) {
  const url = _buildSentencesUrl(dictKey, langOrig, langTr);
  if (!url) throw new Error('bad_sentences_url');
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    let t = '';
    try { t = await res.text(); } catch (e) {}
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
  return sentences;
}

const __B2_DIRECT_PREFETCH_TEST = false;

async function _b2DirectPrefetchTest(dictKey, urls) {
  if (!__B2_DIRECT_PREFETCH_TEST) return;
  try {
    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!list.length) return;

    const sample = list.slice(0, 3);
    console.log('[B2_DIRECT_TEST] start', { dictKey, sampleCount: sample.length });

    for (const u of sample) {
      try {
        const abs = new URL(String(u), location.origin);
        const m = abs.pathname.match(/^\/api\/dictations\/(dict_[^/]+)\/([^/]+)\/(.+)$/);
        if (!m) {
          console.log('[B2_DIRECT_TEST] skip (not dictation api url)', u);
          continue;
        }
        const dictation_id = m[1];
        const lang = m[2];
        const filename = decodeURIComponent(m[3]).split('?', 1)[0].split('/').pop();
        if (!filename) {
          console.log('[B2_DIRECT_TEST] skip (no filename)', u);
          continue;
        }

        const t0 = performance.now();
        const j = await apiRequest('/api/b2/get_download_url', {
          method: 'POST',
          body: JSON.stringify({ dictation_id, lang, filename }),
        });
        const directUrl = j && j.url ? String(j.url) : '';
        if (!directUrl) {
          console.log('[B2_DIRECT_TEST] no direct url', { u, dictation_id, lang, filename, j });
          continue;
        }

        let status = 'no_response';
        let ok = false;
        try {
          const res = await fetch(directUrl, { method: 'GET', cache: 'no-store' });
          status = res ? res.status : 'no_response';
          ok = !!(res && res.ok);
        } catch (e) {
          status = `error_${e && e.name ? e.name : 'fetch_error'}`;
        }
        const ms = Math.round(performance.now() - t0);
        console.log('[B2_DIRECT_TEST] result', { ok, status, ms, apiUrl: u, directUrl });
      } catch (e) {
        console.log('[B2_DIRECT_TEST] exception', e);
      }
    }
  } catch (e) {
  }
}

function _collectAudioUrlsFromSentences({ dictKey, langOrig, langTr, sentences, includeOriginal = true, includeTranslation = true }) {
  const urls = [];
  try {
    const am = window.AudioManager;
    if (!am || typeof am.buildDictationAudioUrl !== 'function' || typeof am.normalizeMediaUrl !== 'function') {
      return [];
    }
    const dictId = _dictationIdToDictKey(dictKey);
    const lo = _normalizeLangCodeSafe(langOrig);
    const lt = _normalizeLangCodeSafe(langTr);
    const list = Array.isArray(sentences) ? sentences : [];
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      const audio = s.audio != null ? String(s.audio || '').trim() : '';
      const audioTr = s.audio_tr != null ? String(s.audio_tr || '').trim() : '';
      if (includeOriginal && audio) urls.push(am.buildDictationAudioUrl(dictId, lo, audio));
      if (includeTranslation && audioTr) urls.push(am.buildDictationAudioUrl(dictId, lt, audioTr));
    }
  } catch (e) {
  }
  return Array.from(new Set(urls.filter(Boolean)));
}

async function prefetchDictationToCache({ dictationId, langOrig, translationLanguages, coverUrl }) {
  const numericId = String(dictationId || '').trim().replace(/^dict_/, '').trim();
  const dictKey = _dictationIdToDictKey(numericId);
  const lo = _normalizeLangCodeSafe(langOrig);
  const langs = Array.isArray(translationLanguages)
    ? translationLanguages.map(_normalizeLangCodeSafe).filter(Boolean)
    : [];
  const finalLangs = Array.from(new Set([lo, ...langs])).filter(Boolean);
  if (!dictKey || !lo) {
    throw new Error('missing_dictation_params');
  }

  showLoadingIndicator('Получаем в кеш…');

  try {
    try {
      await swRequest('purgeDictation', { dictationId: dictKey });
    } catch (e) {
    }
    try {
      await idbDeleteDictationCache(dictKey);
    } catch (e) {
    }

    const userId = String(getDraftUserIdForKey());
    const updatedAt = Date.now();

    const allAudioUrls = [];
    let cachedPairs = 0;

    // First: cache original text (lo -> lo) and collect ONLY original audio once.
    try {
      const msg = `Текст: ${lo} → ${lo}`;
      try {
        const overlay = document.getElementById('loading-overlay');
        const textEl = overlay ? overlay.querySelector('.loading-text') : null;
        if (textEl) textEl.textContent = msg;
      } catch (e) {
      }

      const sentences = await _fetchSentencesFromServer(dictKey, lo, lo);

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

      for (const key of keysToWrite) {
        await idbPut('dictations', {
          key,
          dictationId: dictKey,
          langOrig: lo,
          langTr: lo,
          sentences,
          updatedAt,
        });
      }
      cachedPairs += 1;

      const audioUrls = _collectAudioUrlsFromSentences({
        dictKey,
        langOrig: lo,
        langTr: lo,
        sentences,
        includeOriginal: true,
        includeTranslation: false,
      });
      for (const u of audioUrls) allAudioUrls.push(u);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(`cache_text_failed_${msg}`);
    }

    // Then: cache translations (lo -> lt) and collect ONLY translation audio.
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

        const sentences = await _fetchSentencesFromServer(dictKey, lo, lt);

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

        for (const key of keysToWrite) {
          await idbPut('dictations', {
            key,
            dictationId: dictKey,
            langOrig: lo,
            langTr: lt,
            sentences,
            updatedAt,
          });
        }
        cachedPairs += 1;

        const audioUrls = _collectAudioUrlsFromSentences({
          dictKey,
          langOrig: lo,
          langTr: lt,
          sentences,
          includeOriginal: false,
          includeTranslation: true,
        });
        for (const u of audioUrls) allAudioUrls.push(u);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(`cache_text_failed_${msg}`);
      }
    }

    const uniqueAudio = Array.from(new Set(allAudioUrls.filter(Boolean)));

    try {
      await _b2DirectPrefetchTest(dictKey, uniqueAudio);
    } catch (e) {
    }

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
      } catch (e) {}
      if (coverToFetch) {
        await swRequest('prefetchStrict', { urls: [coverToFetch], ignoreLimit: true });
      }
    } catch (e) {
    }

    try {
      if (uniqueAudio.length) {
        try {
          const overlay = document.getElementById('loading-overlay');
          const textEl = overlay ? overlay.querySelector('.loading-text') : null;
          if (textEl) textEl.textContent = `Аудио… (${uniqueAudio.length})`;
        } catch (e) {}

        if (window.AudioManager && typeof window.AudioManager.prefetchMediaUrls === 'function') {
          await window.AudioManager.prefetchMediaUrls(uniqueAudio, { concurrency: 4 });
        } else {
          await swRequest('prefetchStrict', { urls: uniqueAudio, ignoreLimit: true });
        }
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(`cache_audio_failed_${msg}`);
    }

    completeLoadingIndicator(`В кеше: ${cachedPairs} языков, аудио ${uniqueAudio.length}`, 1200);
    return { ok: true, cachedPairs, audio: uniqueAudio.length };
  } finally {
    try {
      const overlay = document.getElementById('loading-overlay');
      if (!overlay || overlay.dataset.autoclosing !== '1') {
        hideLoadingIndicator();
      }
    } catch (e) {
      hideLoadingIndicator();
    }
  }
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = options.headers || {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (response.status === 401 || response.status === 422) {
    if (window.UM) {
      window.UM.requireAuth();
    }
    throw new Error("Требуется авторизация");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function showToast(message, opts = {}) {
  const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 1000;
  const beepUrl = typeof opts.beepUrl === 'string' ? opts.beepUrl : null;

  let el = document.getElementById('auto-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auto-toast';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.top = '24px';
    el.style.transform = 'translateX(-50%)';
    el.style.zIndex = '100000';
    el.style.background = 'rgba(0,0,0,0.78)';
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '12px';
    el.style.fontSize = '14px';
    el.style.maxWidth = 'min(92vw, 520px)';
    el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
    el.style.display = 'none';
    document.body.appendChild(el);
  }

  el.textContent = message || '';
  el.style.display = 'block';

  if (beepUrl) {
    try {
      const a = new Audio(beepUrl);
      a.volume = 0.7;
      a.play().catch(() => { });
    } catch (e) {
    }
  }

  if (el._hideTimer) window.clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => {
    try {
      const node = document.getElementById('auto-toast');
      if (node) node.style.display = 'none';
    } catch (e) {
    }
  }, Math.max(0, durationMs));
}

const deskToggleInFlight = new Set();

function ensureSwStatusBar() {
  try {
    const old = document.getElementById('swStatusBar');
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
  } catch (e) {
  }
  return null;
}

function setSwStatus(message, opts = {}) {
  try {
    // Route to the global status bar (sw_status_bar.js)
    if (typeof window.setSwStatus === 'function') {
      window.setSwStatus(message, opts);
      return;
    }
  } catch (e) {
  }
  // If global bar is not available, ensure we don't show legacy bar.
  try { ensureSwStatusBar(); } catch (e2) { }
}

const PAGE_NAME = 'private_library';
(async () => {
  try {
    const res = await fetch('/api/app-cache-revision', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rev = data && (data.revision || data.app_cache_revision || data.value);
    console.log('[Version]', `${PAGE_NAME}__${rev || 'unknown'}`);
  } catch (e) {
    console.log('[Version]', `${PAGE_NAME}__unknown`);
  }
})();

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  const value = n / Math.pow(k, i);
  const decimals = i === 0 ? 0 : (i === 1 ? 0 : 1);
  return `${value.toFixed(decimals)} ${units[i]}`;
}

function formatMbValue(bytes) {
  const b = Number(bytes);
  if (!isFinite(b) || b <= 0) return 300;
  return Math.max(10, Math.round(b / (1024 * 1024)));
}

async function swRequest(action, payload = {}) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    throw new Error('Service Worker не активен');
  }

  try {
    setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
  } catch (e) {
  }

  const timeoutMs = typeof payload.timeoutMs === 'number' ? payload.timeoutMs : 15000;
  const message = { action, ...payload };
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
          setSwStatus(`SW: ${String(action)} ok`);
        } catch (e) {
        }
        resolve(data);
      } else {
        try {
          const err = new Error(data && data.error ? data.error : 'sw_error');
          err.swAction = action;
          err.swError = data && data.error ? data.error : 'sw_error';
          err.swResult = data && data.result ? data.result : null;
          err.swPayload = payload || null;
          try {
            setSwStatus(`SW: ${String(action)} error`);
          } catch (e2) {
          }
          reject(err);
        } catch (e) {
          try {
            setSwStatus(`SW: ${String(action)} error`);
          } catch (e2) {
          }
          reject(new Error(data && data.error ? data.error : 'sw_error'));
        }
      }
    };

    navigator.serviceWorker.controller.postMessage({ ...message, requestId }, [channel.port2]);
  });
}

function chunkArray(arr, size) {
  const n = Array.isArray(arr) ? arr : [];
  const s = Math.max(1, Number(size) || 1);
  const out = [];
  for (let i = 0; i < n.length; i += s) {
    out.push(n.slice(i, i + s));
  }
  return out;
}

async function openDraftDb() {
  const idb = window.IdbManager;
  if (idb && typeof idb.openDraftDb === 'function') {
    return idb.openDraftDb();
  }
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open('dictafan_drafts');
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('activity_outbox')) {
        db.createObjectStore('activity_outbox', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('success_outbox')) {
        db.createObjectStore('success_outbox', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('dictations')) {
        db.createObjectStore('dictations', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('desk_items')) {
        db.createObjectStore('desk_items', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('media_manifest')) {
        db.createObjectStore('media_manifest', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, key) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbGet === 'function') {
    return idb.idbGet(storeName, key);
  }
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function getDraftUserIdForKey() {
  try {
    const um = window.UM;
    const id = um?.userData?.id;
    return id ? String(id) : 'anon';
  } catch {
    return 'anon';
  }
}

function getDraftKey(dictationId) {
  const id = dictationId ? String(dictationId) : '';
  if (!id) return null;
  return `${getDraftUserIdForKey()}:${id}`;
}

async function refreshOfflineCacheStatus() {
  try {
    if (typeof window.setSwBarProgress === 'function') {
      window.setSwBarProgress('', null, 'cache');
    }
  } catch (e0) {
  }
  try {
    const res = await swRequest('cacheStats');
    const bytes = res.stats?.totalBytes || 0;
    const entries = res.stats?.entries || 0;
    const maxBytes = res.stats?.maxBytes || 0;

    try {
      if (typeof window.setSwBarProgress === 'function') {
        const mb = 1024 * 1024;
        const usedMb = Math.max(0, bytes) / mb;
        const maxMb = Math.max(0, maxBytes) / mb;
        const usedText = (usedMb >= 10) ? String(Math.round(usedMb)) : usedMb.toFixed(1);
        const maxText = maxMb > 0 ? String(Math.round(maxMb)) : '0';
        const label = `${usedText}/${maxText}`;
        const pct = maxBytes > 0 ? Math.max(0, Math.min(100, (bytes / maxBytes) * 100)) : null;
        window.setSwBarProgress(label, pct, 'cache');
      }
    } catch (e1) {
    }
  } catch (e) {
    try {
      if (typeof window.setSwBarProgress === 'function') {
        window.setSwBarProgress('', null, 'cache');
      }
    } catch (e2) {
    }
  }
}

function openHomeLibraryModal() {
  const modal = document.getElementById('home-library-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function closeHomeLibraryModal() {
  const modal = document.getElementById('home-library-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function openBookViewModal() {
  const modal = document.getElementById('book-view-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function closeBookViewModal() {
  const modal = document.getElementById('book-view-modal');
  if (!modal) return;
  modal.style.display = 'none';
  bookViewActiveBookId = null;
  activeBookId = null;
  activeBookIsWorkbook = false;
  const card = document.getElementById('bookViewCard');
  const structure = document.getElementById('bookViewStructure');
  if (card) card.innerHTML = '';
  if (structure) structure.innerHTML = '';
}

async function openBookViewBook(bookId, isWorkbook = false) {
  const idNum = parseInt(String(bookId || ''), 10);
  if (!idNum || !isFinite(idNum)) return;

  openBookViewModal();

  bookViewActiveBookId = idNum;
  activeBookId = idNum;
  activeBookIsWorkbook = !!isWorkbook;

  const card = document.getElementById('bookViewCard');
  const structure = document.getElementById('bookViewStructure');
  if (!card || !structure) return;

  // Загружаем книгу
  const bookData = await apiRequest(`/library/api/book/${idNum}`);
  if (bookData && bookData.success && bookData.book) {
    const titleEl = document.getElementById('book-view-title');
    if (titleEl) titleEl.textContent = bookData.book.title || 'Книга';
    renderActiveBookCard(bookData.book, card, { onClose: closeBookViewModal });
  }

  // Загружаем структуру
  let sections = [];
  let dictations = [];
  if (isWorkbook) {
    const orphanData = await apiRequest(`/library/api/orphan-dictations`);
    dictations = orphanData.success ? orphanData.dictations : [];
  } else {
    const sectionsData = await apiRequest(`/library/api/book/${idNum}/sections`);
    const dictationsData = await apiRequest(`/library/api/book/${idNum}/dictations`);
    sections = sectionsData.success ? sectionsData.sections : [];
    dictations = dictationsData.success ? dictationsData.dictations : [];
    window.currentBookSections = sections;
  }

  renderBookContentTo(structure, sections, dictations, isWorkbook);
}

async function showDeskDictationInBook(dictationId) {
  try {
    const raw = String(dictationId || '').trim();
    if (!raw) return;

    const numId = raw.startsWith('dict_')
      ? parseInt(raw.replace('dict_', ''), 10)
      : parseInt(raw, 10);
    if (!numId || !isFinite(numId)) {
      try { showToast('Некорректный id диктанта', 'error'); } catch (e) {}
      return;
    }

    const data = await apiRequest(`/library/api/dictation/${numId}/book`);
    if (!data || !data.success || !data.book_id) {
      // Orphan dictation: open workbook instead.
      try {
        let wbId = __workbookBookId;
        if (!wbId) {
          const booksData = await apiRequest('/library/api/user-books');
          const own = (booksData && booksData.success) ? (booksData.own_books || []) : [];
          const wb = Array.isArray(own) ? own.find(b => b && b.is_workbook) : null;
          wbId = wb && wb.id ? Number(wb.id) : null;
          if (wbId) __workbookBookId = wbId;
        }
        if (wbId) {
          await openBookViewBook(wbId, true);
          setTimeout(() => {
            try {
              const card = document.querySelector(`#book-view-modal .short-card[data-dictation-id="dict_${CSS.escape(String(numId))}"]`)
                || document.querySelector(`#book-view-modal .short-card[data-dictation-id="${CSS.escape(String(raw))}"]`);
              if (card) {
                try {
                  if (__selectedBookDictationCard && __selectedBookDictationCard !== card) {
                    __selectedBookDictationCard.classList.remove('short-card--selected');
                  }
                  card.classList.add('short-card--selected');
                  __selectedBookDictationCard = card;
                } catch (e2) {
                }
                try {
                  card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                } catch (e3) {
                  card.scrollIntoView();
                }
              }
            } catch (e) {
            }
          }, 150);
          return;
        }
      } catch (e) {
      }

      try { showToast('Этот диктант не находится ни в одной книге', 'info'); } catch (e) {}
      return;
    }

    const directBookId = Number(data.book_id) || null;
    const rootBookId = Number(data.root_book_id) || directBookId;
    if (!rootBookId) {
      try { showToast('Не удалось определить книгу для диктанта', 'error'); } catch (e) {}
      return;
    }

    await openBookViewBook(rootBookId, false);

    // If dictation is stored under a section (directBookId != rootBookId), try to expand that section.
    try {
      if (directBookId && directBookId !== rootBookId) {
        const structure = document.getElementById('bookViewStructure');
        if (structure) {
          const sectionEl = structure.querySelector(`.structure-item.structure-section[data-section-id="${CSS.escape(String(directBookId))}"]`);
          if (sectionEl) {
            const contentDiv = structure.querySelector(`.structure-item-content[data-section-content-id="${CSS.escape(String(directBookId))}"]`);
            const isOpen = contentDiv && contentDiv.style.display !== 'none';
            if (!isOpen) {
              await toggleSectionInContainer(directBookId, structure);
            }
          }
        }
      }
    } catch (e) {
    }

    // Scroll and highlight dictation card inside the opened book modal.
    setTimeout(() => {
      try {
        const card = document.querySelector(`#book-view-modal .short-card[data-dictation-id="dict_${CSS.escape(String(numId))}"]`)
          || document.querySelector(`#book-view-modal .short-card[data-dictation-id="${CSS.escape(String(raw))}"]`);
        if (card) {
          try {
            if (__selectedBookDictationCard && __selectedBookDictationCard !== card) {
              __selectedBookDictationCard.classList.remove('short-card--selected');
            }
            card.classList.add('short-card--selected');
            __selectedBookDictationCard = card;
          } catch (e2) {
          }
          try {
            card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch (e3) {
            card.scrollIntoView();
          }
        } else {
          try { showToast('Диктант не найден в книге (возможно, в подразделе)', 'info'); } catch (e4) {}
        }
      } catch (e) {
      }
    }, 150);
  } catch (error) {
    console.error('showDeskDictationInBook error:', error);
    try { showToast('Не удалось показать диктант в книге', 'error'); } catch (e2) {}
  }
}

async function toggleSectionInContainer(sectionId, rootContainer) {
  if (!rootContainer) return;
  const sectionItem = rootContainer.querySelector(`.structure-section[data-section-id="${String(sectionId)}"]`);
  if (!sectionItem) return;

  const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
  const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${String(sectionId)}"]`);
  if (!toggleBtn || !contentDiv) return;

  const icon = toggleBtn.querySelector('i[data-lucide]');
  const expanded = contentDiv.style.display !== 'none';

  if (expanded) {
    contentDiv.style.display = 'none';
    if (icon) icon.setAttribute('data-lucide', 'chevron-right');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  contentDiv.style.display = 'block';
  if (icon) icon.setAttribute('data-lucide', 'chevron-down');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
  if (existingContent) return;

  try {
    await loadSectionDictations(sectionId, contentDiv);
  } catch (e) {
    console.warn('[toggleSectionInContainer] loadSectionDictations failed', e);
  }
}

/**
 * Сохраняем целевую книгу/раздел для нового диктанта в sessionStorage,
 * чтобы редактор диктанта мог после сохранения привязать его к книге.
 */
function setDictationTargetBook(bookId) {
  try {
    if (!bookId) return;
    const payload = { book_id: Number(bookId) || null };
    sessionStorage.setItem('dictationTargetBook', JSON.stringify(payload));
    console.log('📚 dictationTargetBook сохранён в sessionStorage:', payload);
  } catch (e) {
    console.warn('⚠️ Не удалось сохранить dictationTargetBook в sessionStorage:', e);
  }
}

// Функции для показа/скрытия индикатора загрузки
function showLoadingIndicator(message = 'Сохранение...') {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text">${message}</div>
        </div>
      `;
    document.body.appendChild(overlay);
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '99999';
    overlay.style.pointerEvents = 'auto';
  } else {
    overlay.querySelector('.loading-text').textContent = message;
  }
  overlay.style.display = 'flex';
  overlay.dataset.autoclosing = '';
}

function hideLoadingIndicator() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.dataset.autoclosing = '';
  }
}

function completeLoadingIndicator(message = 'Загрузка закончена', delayMs = 1000) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const text = overlay.querySelector('.loading-text');
  if (text) text.textContent = message;
  overlay.dataset.autoclosing = '1';
  window.setTimeout(() => {
    try {
      const ov = document.getElementById('loading-overlay');
      if (!ov) return;
      ov.style.display = 'none';
      ov.dataset.autoclosing = '';
    } catch (e) {
    }
  }, Math.max(0, Number(delayMs) || 0));
}

async function checkAppCacheRevision() {
  try {
    const res = await fetch('/api/app-cache-revision', { method: 'GET' });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data || !data.success || !data.revision) return;

    const serverRev = String(data.revision);
    const localRev = localStorage.getItem('app_cache_revision');

    if (!localRev) {
      localStorage.setItem('app_cache_revision', serverRev);
      return;
    }

    if (localRev === serverRev) return;

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        await swRequest('cacheClearAppShell', { timeoutMs: 60000 });
      }
    } catch (e) {
    }

    localStorage.setItem('app_cache_revision', serverRev);
    location.reload();
  } catch (e) {
    // ignore
  }
}

// ==================== ЗОНА 1: Рабочий стол ====================
function normalizeUrlForSwPrefetch(rawUrl) {
  try {
    let v = String(rawUrl || '').trim();
    if (!v) return '';
    if (v.startsWith('blob:')) return v;

    // Normalize absolute URLs: enforce https on https pages and prefer same-origin relative path.
    try {
      if (v.startsWith('http://') || v.startsWith('https://')) {
        const u = new URL(v);
        const desiredProtocol = (typeof location !== 'undefined' && location && location.protocol)
          ? location.protocol
          : u.protocol;
        if (desiredProtocol === 'https:' && u.protocol === 'http:') {
          u.protocol = 'https:';
        }
        try {
          if (typeof location !== 'undefined' && location && u.origin === location.origin) {
            v = `${u.pathname}${u.search || ''}`;
          } else {
            v = u.toString();
          }
        } catch (e) {
          v = `${u.pathname}${u.search || ''}`;
        }
      }
    } catch (e) {
    }

    // Safety: never keep plain http URL on an https page.
    try {
      if (v.startsWith('http://') && typeof location !== 'undefined' && location && location.protocol === 'https:') {
        v = `https://${v.slice('http://'.length)}`;
      }
    } catch (e) {
    }

    // Ensure leading slash for same-origin relative requests.
    if (!v.startsWith('/') && (v.startsWith('api/') || v.startsWith('api\\'))) {
      v = `/${v}`;
    }

    return v;
  } catch (e) {
    return String(rawUrl || '').trim();
  }
}

function areDeskItemEffectivelyEqual(a, b) {
  const x = a || {};
  const y = b || {};
  return (
    String(x.id || '') === String(y.id || '')
    && String(x.dictation_id || '') === String(y.dictation_id || '')
    && String(x.cover_url || '') === String(y.cover_url || '')
    && String(x.title || '') === String(y.title || '')
    && String(x.language_code || '') === String(y.language_code || '')
    && String(x.language_translation || '') === String(y.language_translation || '')
    && String(x.level || '') === String(y.level || '')
    && String(x.sentences_count || '') === String(y.sentences_count || '')
  );
}

function applyDeskItemsIncremental(prevItems, nextItems) {
  const container = document.getElementById('deskCardsContainer');
  if (!container) return { applied: false };

  const grid = container.querySelector('.shorts-grid');
  if (!grid) return { applied: false };

  const prev = Array.isArray(prevItems) ? prevItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];

  const prevById = new Map(prev.map(x => [String(x && x.id), x]));
  const nextById = new Map(next.map(x => [String(x && x.id), x]));

  const removed = [];
  const added = [];
  const updated = [];

  for (const item of prev) {
    const id = String(item && item.id);
    if (!nextById.has(id)) removed.push(item);
  }
  for (const item of next) {
    const id = String(item && item.id);
    if (!prevById.has(id)) {
      added.push(item);
    } else {
      const prevItem = prevById.get(id);
      if (!areDeskItemEffectivelyEqual(prevItem, item)) {
        updated.push(item);
      }
    }
  }

  for (const item of removed) {
    try {
      const card = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
      if (card) card.remove();
    } catch (e) {
    }
    try {
      localStorage.removeItem(getDeskCardPosStorageKey(String(item.id)));
    } catch (e) {
    }
  }

  for (const item of updated) {
    try {
      const existing = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
      if (!existing) continue;
      const wrap = document.createElement('div');
      wrap.innerHTML = createDictationCard(item, true);
      const fresh = wrap.firstElementChild;
      if (fresh) {
        existing.replaceWith(fresh);
      }
    } catch (e) {
    }
  }

  for (const item of added) {
    insertDeskCardElement(item, 'start');
  }

  try {
    const remaining = grid.querySelectorAll('.desk-card').length;
    if (!remaining) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
    }
  } catch (e) {
  }

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {
  }

  try {
    if (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container)) {
      enableDeskFreeLayout(container);
      installDeskDragAndDrop(container);
    }
  } catch (e) {
  }

  requestAnimationFrame(() => {
    (async () => {
      try {
        await applyDeskCovers(container);
        updateDictationCardsStats(container);
        await updateCompletionBadges(container);
      } catch (e) {
      }
    })().catch(() => { });
  });

  return { applied: true, added: added.length, removed: removed.length, updated: updated.length };
}

async function loadDeskItems() {
  const seq = ++deskLoadSeq;
  if (deskLoadInFlight) {
    try {
      await deskLoadInFlight;
    } catch (e) {
    }
  }

  let resolveInFlight;
  let rejectInFlight;
  deskLoadInFlight = new Promise((resolve, reject) => {
    resolveInFlight = resolve;
    rejectInFlight = reject;
  });

  const t0 = performance.now();
  let renderedFromCache = false;
  let cachedItemsSnapshot = [];
  let cachedDeskVersion = '';

  try {
    const cached = await idbGet('desk_items', 'latest');
    const cachedVer = await idbGet('desk_items', 'desk_version');
    try {
      cachedDeskVersion = cachedVer && typeof cachedVer.version === 'string' ? cachedVer.version : '';
    } catch (e) {
      cachedDeskVersion = '';
    }
    const items = cached && Array.isArray(cached.items) ? cached.items : [];
    if (items.length) {
      if (seq !== deskLoadSeq) {
        resolveInFlight();
        return;
      }
      // Mark items as coming from IDB cache so we can load covers immediately
      // (fast repeat loads) while keeping staged cover loading for network renders.
      const itemsMarked = items.map(it => {
        try {
          if (!it || typeof it !== 'object') return it;
          if (it.__desk_cached_render === true) return it;
          return { ...it, __desk_cached_render: true };
        } catch (e) {
          return it;
        }
      });
      deskItems = itemsMarked;
      cachedItemsSnapshot = itemsMarked;
      if (typeof renderDeskCards === 'function' && deskItems.length > 0) {
        renderDeskCards(deskItems);
      }
      updateInWorkIndicators();
      try {
        if (typeof refreshDeskOutboxIndicator === 'function') {
          refreshDeskOutboxIndicator().catch(() => { });
        }
      } catch (e) {
      }
      renderedFromCache = true;
      const tCache = performance.now();
      console.log('[desk-render] stage0 cached items:', items.length, 'time:', Math.round(tCache - t0), 'ms');
    }
  } catch (e) {
  }

  try {
    if (cachedDeskVersion) {
      try {
        const tVerStart = performance.now();
        const verData = await apiRequest("/desk/api/items/version");
        const tVerEnd = performance.now();
        console.log('[desk-render] stage0 desk version check:', Math.round(tVerEnd - tVerStart), 'ms');

        if (verData && verData.success && typeof verData.version === 'string') {
          if (String(verData.version) === String(cachedDeskVersion)) {
            if (renderedFromCache) {
              const cachedCount = Array.isArray(cachedItemsSnapshot) ? cachedItemsSnapshot.length : 0;
              const serverCount = (verData && typeof verData.items_count === 'number') ? verData.items_count : null;
              const hasLocalOnly = Array.isArray(cachedItemsSnapshot)
                ? cachedItemsSnapshot.some(it => it && typeof it === 'object' && it.__local_only)
                : false;

              const shouldSelfHeal = hasLocalOnly || (serverCount !== null && serverCount !== cachedCount);
              try {
                if (window.PersistentLog && typeof window.PersistentLog.log === 'function') {
                  window.PersistentLog.log('desk_version_match', {
                    matched: true,
                    cachedCount: cachedCount,
                    serverCount: serverCount,
                    hasLocalOnly: !!hasLocalOnly,
                    selfHeal: !!shouldSelfHeal,
                  });
                }
              } catch (e) {
              }

              if (!shouldSelfHeal) {
                // Even if desk items did not change, completion counts can change (new successes).
                // Refresh medals from server to avoid stale IDB cache after deploy.
                try {
                  const deskContainer = document.getElementById('deskCardsContainer');
                  setTimeout(() => {
                    refreshCompletionBadgesFromServer(deskContainer).catch(() => { });
                  }, 0);
                } catch (e) {
                }
                resolveInFlight();
                return;
              }
            }
          }
        }
      } catch (e) {
        // If version check fails, fall back to full fetch.
      }
    }

    const tNetStart = performance.now();
    const data = await apiRequest("/desk/api/items");
    const tNetEnd = performance.now();
    console.log('[desk-render] stage0 network fetch:', Math.round(tNetEnd - tNetStart), 'ms');

    if (data.success && data.items) {
      if (seq !== deskLoadSeq) {
        resolveInFlight();
        return;
      }

      const prevSnapshot = Array.isArray(cachedItemsSnapshot) ? cachedItemsSnapshot : [];
      const nextSnapshot = Array.isArray(data.items) ? data.items : [];

      // If desk was rendered from cache, reconcile removed items and purge their cached dictation media.
      // This is important for cross-tab/cross-device cleanup after a dictation is deleted on the server.
      try {
        const prev = Array.isArray(cachedItemsSnapshot) ? cachedItemsSnapshot : [];
        const next = Array.isArray(data.items) ? data.items : [];
        if (renderedFromCache && prev.length) {
          const nextSet = new Set(next.map(x => String(x && x.dictation_id)));
          const removed = prev.filter(x => x && !nextSet.has(String(x.dictation_id)));
          for (const item of removed) {
            try {
              const did = item && item.dictation_id ? String(item.dictation_id) : '';
              if (!did) continue;
              try {
                await swRequest('purgeDictation', { dictationId: did, timeoutMs: 60000 });
              } catch (e) {
              }
              try {
                await idbDeleteDictationCache(`dict_${did}`);
              } catch (e) {
              }
            } catch (e) {
            }
          }
        }
      } catch (e) {
      }

      // Merge with locally cached items to avoid wiping the desk if the server
      // temporarily returns an incomplete list (e.g. dictations missing in JOIN,
      // offline-only cached items, etc.).
      const serverItems = Array.isArray(data.items) ? data.items : [];
      const cleanedServerItems = serverItems.map(it => {
        try {
          if (!it || typeof it !== 'object') return it;
          if (!it.__desk_cached_render) return it;
          const { __desk_cached_render, ...rest } = it;
          return rest;
        } catch (e) {
          return it;
        }
      });

      // IMPORTANT: server is authoritative for the desk.
      // Persist only server items to avoid accumulating stale/deleted cards in IDB
      // (e.g. long-lived Safari tabs).
      deskItems = cleanedServerItems;
      try {
        await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
      } catch (e) {
      }

      try {
        const verData = await apiRequest("/desk/api/items/version");
        if (verData && verData.success && typeof verData.version === 'string') {
          await idbPut('desk_items', { key: 'desk_version', updatedAt: Date.now(), version: String(verData.version) });
        }
      } catch (e) {
      }

      if (renderedFromCache && prevSnapshot.length) {
        const res = applyDeskItemsIncremental(prevSnapshot, nextSnapshot);
        if (!res || !res.applied) {
          if (typeof renderDeskCards === 'function') {
            renderDeskCards(deskItems);
          }
        }
        try {
          if (window.PersistentLog && typeof window.PersistentLog.log === 'function') {
            window.PersistentLog.log('desk_reconcile', {
              renderedFromCache: true,
              prevCount: prevSnapshot.length,
              nextCount: nextSnapshot.length,
              applied: !!(res && res.applied),
              added: res && typeof res.added === 'number' ? res.added : null,
              removed: res && typeof res.removed === 'number' ? res.removed : null,
              updated: res && typeof res.updated === 'number' ? res.updated : null,
            });
          }
        } catch (e) {
        }
      } else {
        if (typeof renderDeskCards === 'function') {
          renderDeskCards(deskItems);
        }
        try {
          if (window.PersistentLog && typeof window.PersistentLog.log === 'function') {
            window.PersistentLog.log('desk_render', {
              renderedFromCache: false,
              count: Array.isArray(deskItems) ? deskItems.length : 0
            });
          }
        } catch (e) {
        }
      }
      // Обновляем индикаторы "в работе" в карточках диктантов
      updateInWorkIndicators();

      // После успешной сетевой загрузки стола принудительно обновляем completion counts
      // (кеш в IDB может быть устаревшим после деплоя)
      try {
        const deskContainer = document.getElementById('deskCardsContainer');
        setTimeout(() => {
          refreshCompletionBadgesFromServer(deskContainer).catch(() => { });
        }, 0);
      } catch (e) {
      }
      try {
        if (typeof refreshDeskOutboxIndicator === 'function') {
          refreshDeskOutboxIndicator().catch(() => { });
        }
      } catch (e) {
      }
      resolveInFlight();
      return;
    }
    resolveInFlight();
  } catch (error) {
    rejectInFlight(error);
    if (!renderedFromCache) {
      console.error("Ошибка загрузки диктантов на столе:", error);
    } else {
      console.warn("Ошибка обновления диктантов на столе (показан кеш):", error);
    }
  }
}

// Проверяет, находится ли диктант на столе
function isDictationOnDesk(dictationId) {
  return deskItems.some(item => item.dictation_id === parseInt(dictationId));
}

// Получает item_id диктанта на столе
function getDeskItemId(dictationId) {
  const item = deskItems.find(item => item.dictation_id === parseInt(dictationId));
  return item ? item.id : null;
}

// Обновляет индикаторы "в работе" во всех карточках диктантов
function updateInWorkIndicators() {
  // Синхронизируем состояние карточек в книге с тем, на столе диктант или нет:
  // - фон карточки
  // - кнопка add/remove desk (стрелка вверх/вниз) в левом нижнем углу
  document.querySelectorAll('.short-card[data-dictation-id]:not(.desk-card)').forEach(card => {
    const dictationId = card.dataset.dictationId;
    if (!dictationId) return;

    const isOnDesk = isDictationOnDesk(dictationId);
    card.classList.toggle('short-card--on-desk', !!isOnDesk);
    card.classList.toggle('short-card--off-desk', !isOnDesk);

    const btn = card.querySelector('[data-action="toggle-desk-explicit"]');
    if (btn) {
      btn.setAttribute('title', isOnDesk
        ? libT('private_library.dictation_card_actions.remove_from_desk')
        : libT('private_library.dictation_card_actions.add_to_desk'));
      btn.setAttribute('aria-label', isOnDesk
        ? libT('private_library.dictation_card_actions.remove_from_desk')
        : libT('private_library.dictation_card_actions.add_to_desk'));
      const icon = btn.querySelector('i[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash');
      }
      try {
        if (window.lucide) lucide.createIcons();
      } catch (e) {
      }
    }
  });
}

// Удаляет диктант со стола (используется кнопкой "убрать со стола")
async function removeFromDesk(itemId, dictationId) {
  try {
    // Удаляем со стола
    const removeData = await apiRequest(`/desk/api/item/${itemId}`, {
      method: 'DELETE'
    });

    if (removeData.success) {
      try {
        await swRequest('purgeDictation', { dictationId });
      } catch (e) {
        // ignore
      }

      try {
        await idbDeleteDictationCache(`dict_${dictationId}`);
      } catch (e) {
      }

      try {
        const container = document.getElementById('deskCardsContainer');
        const card = container ? container.querySelector(`.desk-card[data-desk-item-id="${String(itemId)}"]`) : null;
        if (card) {
          card.remove();
        }
      } catch (e) {
      }

      try {
        const before = Array.isArray(deskItems) ? deskItems.length : 0;
        deskItems = Array.isArray(deskItems)
          ? deskItems.filter(x => String(x.id) !== String(itemId))
          : [];
        const after = Array.isArray(deskItems) ? deskItems.length : 0;
        if (before !== after) {
          try {
            await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
          } catch (e) {
          }
        }
      } catch (e) {
      }

      try {
        localStorage.removeItem(getDeskCardPosStorageKey(String(itemId)));
      } catch (e) {
      }

      try {
        const container = document.getElementById('deskCardsContainer');
        if (container) {
          const grid = container.querySelector('.shorts-grid');
          const remaining = grid ? grid.querySelectorAll('.desk-card').length : 0;
          if (!remaining) {
            container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
          }
        }
      } catch (e) {
      }

      showToast('Диктант убран со стола', { durationMs: 1000, beepUrl: '/static/sounds/victory/beep2.mp3' });
      refreshOfflineCacheStatus();
    } else {
      showToast('Ошибка при удалении диктанта со стола');
    }
  } catch (error) {
    console.error('❌ Ошибка удаления диктанта со стола:', error);
    showToast('Ошибка при удалении диктанта со стола');
  }
}

function ensureDeskGridContainer() {
  const container = document.getElementById('deskCardsContainer');
  if (!container) return null;
  let grid = container.querySelector('.shorts-grid');
  if (grid) return grid;

  container.innerHTML = '';
  grid = document.createElement('div');
  grid.className = 'shorts-grid';
  container.appendChild(grid);
  return grid;
}

function insertDeskCardElement(item, position = 'start') {
  const grid = ensureDeskGridContainer();
  if (!grid) return null;
  const html = createDictationCard(item, true);
  if (position === 'end') {
    grid.insertAdjacentHTML('beforeend', html);
  } else {
    grid.insertAdjacentHTML('afterbegin', html);
  }

  const el = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
  if (!el) return null;

  try {
    (async () => {
      try {
        const did = String(item && item.dictation_id ? item.dictation_id : '').trim();
        if (!did) return;
        const isCached = await _isDictationCachedIdb(did);
        el.classList.toggle('short-card--cached', !!isCached);
      } catch (e) {
      }
    })().catch(() => { });
  } catch (e) {
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  try {
    const container = document.getElementById('deskCardsContainer');
    if (container && (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container))) {
      enableDeskFreeLayout(container);
      installDeskDragAndDrop(container);
    }
  } catch (e) {
  }

  try {
    applyDeskCovers(document.getElementById('deskCardsContainer'));
  } catch (e) {
  }

  try {
    const tmpWrap = document.createElement('div');
    tmpWrap.appendChild(el.cloneNode(true));
    updateDictationCardsStats(tmpWrap);
    updateCompletionBadges(tmpWrap);
    const fresh = tmpWrap.firstElementChild;
    if (fresh) {
      el.replaceWith(fresh);

      try {
        (async () => {
          try {
            const did = String(item && item.dictation_id ? item.dictation_id : '').trim();
            if (!did) return;
            const isCached = await _isDictationCachedIdb(did);
            fresh.classList.toggle('short-card--cached', !!isCached);
          } catch (e) {
          }
        })().catch(() => { });
      } catch (e) {
      }

      return fresh;
    }
  } catch (e) {
  }

  return el;
}

async function syncDeskFromServerIncremental() {
  const data = await apiRequest('/desk/api/items');
  if (!data || !data.success || !Array.isArray(data.items)) {
    return { success: false };
  }

  const next = data.items;
  const prev = Array.isArray(deskItems) ? deskItems : [];

  // Same safety merge as in loadDeskItems(): keep local cached items that are missing
  // from server response, so desk UI won't suddenly lose cards.
  const nextMerged = (() => {
    try {
      const byDictationId = new Map();
      for (const it of next) {
        if (!it) continue;
        const k = String(it.dictation_id ?? it.id ?? '');
        if (!k) continue;
        byDictationId.set(k, it);
      }
      for (const it of prev) {
        if (!it) continue;
        const k = String(it.dictation_id ?? it.id ?? '');
        if (!k) continue;
        if (!byDictationId.has(k)) {
          byDictationId.set(k, { ...it, __local_only: true });
        }
      }
      return Array.from(byDictationId.values());
    } catch (e) {
      return next;
    }
  })();

  const prevById = new Map(prev.map(x => [String(x.id), x]));
  const nextById = new Map(next.map(x => [String(x.id), x]));

  const added = [];
  const removed = [];

  for (const item of next) {
    if (!prevById.has(String(item.id))) {
      added.push(item);
    }
  }
  for (const item of prev) {
    if (!nextById.has(String(item.id))) {
      removed.push(item);
    }
  }

  deskItems = nextMerged;
  try {
    await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
  } catch (e) {
  }

  const container = document.getElementById('deskCardsContainer');
  if (!container) {
    return { success: true, added: added.length, removed: removed.length };
  }

  // Remove cards first
  for (const item of removed) {
    try {
      const card = container.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
      if (card) card.remove();
    } catch (e) {
    }
    try {
      localStorage.removeItem(getDeskCardPosStorageKey(String(item.id)));
    } catch (e) {
    }
  }

  // Add new cards
  for (const item of added) {
    insertDeskCardElement(item, 'start');
  }

  // If container is empty now, render empty state
  try {
    const grid = container.querySelector('.shorts-grid');
    const remaining = grid ? grid.querySelectorAll('.desk-card').length : 0;
    if (!remaining) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
    }
  } catch (e) {
  }

  updateInWorkIndicators();
  try {
    if (typeof refreshDeskOutboxIndicator === 'function') {
      refreshDeskOutboxIndicator().catch(() => { });
    }
  } catch (e) {
  }
  return { success: true, added: added.length, removed: removed.length };
}

// Добавляет или удаляет диктант со стола (используется кликом на карточку в библиотеке)
async function toggleDictationOnDesk(dictationId) {
  if (!dictationId) return;
  const key = String(dictationId);
  if (deskToggleInFlight.has(key)) return;
  deskToggleInFlight.add(key);

  console.log('===DESK_TOGGLE=== start', { dictationId: String(dictationId) });

  const isOnDesk = isDictationOnDesk(dictationId);

  if (isOnDesk) {
    // Удаляем со стола
    try {
      const ok = confirm('Вы точно хотите убрать диктант с рабочего стола?');
      if (!ok) {
        deskToggleInFlight.delete(key);
        return;
      }
    } catch (e) {
    }

    const itemId = getDeskItemId(dictationId);
    if (!itemId) {
      console.error('❌ Не найден item_id для диктанта на столе:', dictationId);
      deskToggleInFlight.delete(key);
      return;
    }

    try {
      await removeFromDesk(itemId, dictationId);
    } finally {
      deskToggleInFlight.delete(key);
    }
  } else {
    // Добавляем на стол
    try {
      showLoadingIndicator('Добавляю на рабочий стол…');

      console.log('===DESK_TOGGLE=== add flow: fast path (no prefetch)', { dictationId: String(dictationId) });

      // Жёсткое правило: диктант можно добавить на стол только если ассеты влезают в оффлайн-лимит
      // (HTML страница диктанта + JS/CSS + аудио + обложка). Если не влезает — не добавляем.
      // NOTE: перенесено в отдельный flow "обновить кеш" (см. TODO). Здесь мы работаем только с базой данных.

      const addData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      console.log('===DESK_TOGGLE=== add-to-desk response', {
        dictationId: String(dictationId),
        success: Boolean(addData && addData.success),
        error: addData && (addData.error || addData.message) ? String(addData.error || addData.message) : '',
      });

      // Treat "added: false" (already exists) as non-error, but don't claim it was added.
      const wasAdded = !!(addData && addData.success && (addData.added === true || addData.added === 1));

      if (addData && addData.success) {
        try {
          const syncRes = await syncDeskFromServerIncremental();
          console.log('===DESK_TOGGLE=== desk sync incremental done', {
            dictationId: String(dictationId),
            success: Boolean(syncRes && syncRes.success),
            added: syncRes && typeof syncRes.added === 'number' ? syncRes.added : null,
            removed: syncRes && typeof syncRes.removed === 'number' ? syncRes.removed : null,
          });
        } catch (e) {
          await loadDeskItems();
          console.log('===DESK_TOGGLE=== loadDeskItems fallback done', { dictationId: String(dictationId) });
        }

        // Сохраняем контент диктанта (предложения) в IndexedDB, чтобы страница диктанта работала только из IDB
        // NOTE: отключено. Добавление на рабочий стол работает только с базой данных.

        refreshOfflineCacheStatus();
        completeLoadingIndicator(wasAdded ? 'Диктант добавлен на рабочий стол' : 'Диктант уже на рабочем столе', 1000);
        console.log('===DESK_TOGGLE=== done ok', { dictationId: String(dictationId) });
      } else {
        const apiMsg = (addData && (addData.error || addData.message))
          ? String(addData.error || addData.message)
          : '';
        console.warn('[toggleDictationOnDesk] add-to-desk failed', { dictationId, addData });
        showToast(apiMsg ? `Не удалось добавить диктант на стол: ${apiMsg}` : 'Ошибка при добавлении диктанта на стол');
      }
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      console.error('❌ Ошибка добавления диктанта на стол:', error);
      showToast(`Ошибка при добавлении диктанта на стол: ${msg}`);
      console.log('===DESK_TOGGLE=== failed', { dictationId: String(dictationId), msg });
    } finally {
      const overlay = document.getElementById('loading-overlay');
      if (!overlay || overlay.dataset.autoclosing !== '1') {
        hideLoadingIndicator();
      }
      console.log('===DESK_TOGGLE=== finally', { dictationId: String(dictationId) });
      deskToggleInFlight.delete(key);
    }
  }
}

// Создает карточку диктанта (для стола или для книги)
// item - объект с данными диктанта
// isDeskCard - true для карточки на столе, false для карточки в книге
function createDictationCard(item, isDeskCard = false) {
  if (isDeskCard) {
    // Карточка для рабочего стола
    const dictationId = item.dictation_id;
    const dictationIdFormatted = `dict_${dictationId}`;

    // Important: original language must come from dictation meta, not from user profile.
    const langOriginal = (item.language_original || item.language_code || 'en');
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(item.translation_languages)
      ? item.translation_languages.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = nativeLang;

    const pick = _pickTranslationLanguageForOpen({
      preferredNative,
      availableTranslations,
      fallbackLang: (item.language_translation || nativeLang || langOriginal || 'en')
    });

    const langTranslation = pick.lang;
    const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editUrl = `/dictation_editor/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const coverUrl = maybeCacheBustDictationCover(item.cover_url);

    const sentencesCount = typeof item.sentences_count === 'number'
      ? item.sentences_count
      : (parseInt(item.sentences_count, 10) || 0);

    const langPair = `${langOriginal}`;

    const isCachedRender = !!(item && item.__desk_cached_render);

    const coverSrc = isCachedRender
      ? (coverUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
      : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const coverLoading = isCachedRender ? 'eager' : 'lazy';

    const noticeMessage = pick && pick.reason ? String(pick.reason) : '';

    return `
        <div class="short-card desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}">
          <div class="short-thumb" data-href="${openUrl}" data-lang-notice="${escapeHtml(noticeMessage)}" role="link" tabindex="0">
            <img src="${coverSrc}" data-cover-url="${coverUrl || ''}" alt="" class="short-cover" loading="${coverLoading}" decoding="async">
            <div class="card-progress-stats"></div>
          </div>
          <h3 class="short-title">${item.title || 'Без названия'}</h3>

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
            <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
              <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="${escapeHtml(libT('private_library.dictation_card_actions.title'))}" aria-label="${escapeHtml(libT('private_library.dictation_card_actions.title'))}">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu short-card-actions-menu" style="display: none;">
                <button class="dropdown-menu-item" data-action="create-assignment" data-dictation-id="${dictationId}">
                  <i data-lucide="clipboard-list"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.create_assignment_new'))}</span>
                </button>
                <button class="dropdown-menu-item" type="button" data-action="prefetch-dictation-cache" data-dictation-id="${dictationId}" data-lang-original="${escapeHtml(langOriginal)}" data-cover-url="${escapeHtml(coverUrl || '')}" data-translation-langs="${escapeHtml(availableTranslations.join(','))}">
                  <i data-lucide="download"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.cache'))}</span>
                </button>
                <button class="dropdown-menu-item" type="button" data-action="edit-dictation" data-edit-url="${editUrl}">
                  <i data-lucide="pencil-ruler"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.edit'))}</span>
                </button>
                <button class="dropdown-menu-item" data-action="show-in-book" data-dictation-id="${dictationId}">
                  <i data-lucide="book-marked"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.show_in_book'))}</span>
                </button>
                <button class="dropdown-menu-item" data-action="remove-from-desk" data-desk-item-id="${item.id}" data-dictation-id="${dictationId}">
                  <i data-lucide="arrow-big-down-dash"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.remove_from_desk'))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
  } else {
    // Карточка для книги
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';

    // Определяем языки для URL
    const langOriginal = d.language_original || d.language_code || 'en';
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(d.translation_languages)
      ? d.translation_languages.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = (nativeLang && availableTranslations.includes(nativeLang))
      ? nativeLang
      : '';

    const langTranslation = preferredNative || d.language_translation || nativeLang || d.language_code || 'en';

    // ID в формате dict_X для URL
    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;

    // URL для редактирования (используем формат dict_X)
    const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;

    // Проверяем, находится ли диктант на столе
    const isOnDesk = isDictationOnDesk(dbId);

    const langPair = `${langOriginal}`;
    const sentencesCount = typeof d.sentences_count === 'number'
      ? d.sentences_count
      : (parseInt(d.sentences_count, 10) || 0);

    // Медалька будет добавлена асинхронно через updateCompletionBadges
    // Статистика (звезды/полузвезды/микрофон) убрана - она только на столе

    return `
        <div class="short-card ${isOnDesk ? 'short-card--on-desk' : 'short-card--off-desk'}" data-dictation-id="${dbId}" data-action="toggle-desk" data-edit-url="${editUrl}">
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
            <button class="short-action-btn short-action-btn--kebab short-desk-toggle-btn" data-action="toggle-desk-explicit" data-dictation-id="${dbId}" title="${escapeHtml(isOnDesk ? libT('private_library.dictation_card_actions.remove_from_desk') : libT('private_library.dictation_card_actions.add_to_desk'))}" aria-label="${escapeHtml(isOnDesk ? libT('private_library.dictation_card_actions.remove_from_desk') : libT('private_library.dictation_card_actions.add_to_desk'))}">
              <i data-lucide="${isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash'}"></i>
            </button>
            <div class="short-dikt-number">${dictationId}</div>
            <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
              <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="${escapeHtml(libT('private_library.dictation_card_actions.title'))}" aria-label="${escapeHtml(libT('private_library.dictation_card_actions.title'))}">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu short-card-actions-menu" style="display: none;">
                <button class="dropdown-menu-item" type="button" data-action="edit-dictation" data-edit-url="${editUrl}">
                  <i data-lucide="pencil-ruler"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.edit'))}</span>
                </button>
                <button class="dropdown-menu-item" data-action="create-assignment" data-dictation-id="${dbId}">
                  <i data-lucide="clipboard-list"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.create_assignment'))}</span>
                </button>
                <button class="dropdown-menu-item" data-action="move-dictation" data-dictation-id="${dbId}">
                  <i data-lucide="folder-symlink"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.move'))}</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-dictation" data-dictation-id="${dbId}">
                  <i data-lucide="trash-2"></i>
                  <span>${escapeHtml(libT('private_library.dictation_card_actions.delete'))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
  }
}

async function applyDeskCovers(container) {
  try {
    const imgs = container.querySelectorAll('.desk-card .short-cover[data-cover-url]');

    for (const img of imgs) {
      if (img.dataset.coverApplied === '1') continue;
      const url = img.dataset.coverUrl;
      if (!url) continue;

      img.dataset.coverApplied = '1';

      const src = maybeCacheBustDictationCover(url);

      img.src = src;
    }
  } catch (e) {
    console.warn('[desk-render] applyDeskCovers failed', e);
  }
}

function getDeskCardPosStorageKey(deskItemId) {
  return `dictafan:desk:pos:${String(deskItemId || '')}`;
}

function readDeskCardPos(deskItemId) {
  try {
    const raw = localStorage.getItem(getDeskCardPosStorageKey(deskItemId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch (e) {
    return null;
  }
}

function writeDeskCardPos(deskItemId, x, y) {
  try {
    const payload = { x: Number(x) || 0, y: Number(y) || 0, updatedAt: Date.now() };
    localStorage.setItem(getDeskCardPosStorageKey(deskItemId), JSON.stringify(payload));
  } catch (e) {
  }
}

function isDeskFreeLayoutEnabled() {
  try {
    return String(localStorage.getItem('dictafan:desk:layout') || '') === 'free';
  } catch (e) {
    return false;
  }
}

function setDeskFreeLayoutEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem('dictafan:desk:layout', 'free');
    } else {
      localStorage.setItem('dictafan:desk:layout', 'grid');
    }
  } catch (e) {
  }
}

function updateDeskLayoutToggleButtonState(btn) {
  try {
    if (!btn) return;
    const enabled = isDeskFreeLayoutEnabled();
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = enabled
      ? 'Свободный стол: можно таскать карточки'
      : 'Обычный стол: карточки в ряд (таскать нельзя)';

    const iconName = enabled ? 'move' : 'grip-vertical';
    btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    if (enabled) {
      btn.classList.add('active');
      btn.style.background = 'rgba(0,0,0,0.08)';
      btn.style.border = '1px solid rgba(0,0,0,0.18)';
    } else {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.border = '';
    }
  } catch (e) {
  }
}

function ensureDeskLayoutToggleButton() {
  try {
    const palette = document.getElementById('toolPalette');
    if (!palette) return;
    if (document.getElementById('btnDeskFreeLayoutToggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btnDeskFreeLayoutToggle';
    btn.className = 'tool-palette-btn';
    btn.addEventListener('click', () => {
      const enabled = !isDeskFreeLayoutEnabled();
      setDeskFreeLayoutEnabled(enabled);
      updateDeskLayoutToggleButtonState(btn);
      try {
        loadDeskItems();
      } catch (e) {
      }
    });

    const sep = palette.querySelector('.tool-palette-separator');
    if (sep && sep.parentNode === palette) {
      palette.insertBefore(btn, sep);
    } else {
      palette.appendChild(btn);
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    updateDeskLayoutToggleButtonState(btn);
  } catch (e) {
  }
}

function hasAnyDeskCardPositions(container) {
  try {
    const cards = container.querySelectorAll('.desk-card[data-desk-item-id]');
    for (const card of cards) {
      const deskItemId = card.getAttribute('data-desk-item-id');
      if (!deskItemId) continue;
      if (readDeskCardPos(deskItemId)) return true;
    }
  } catch (e) {
  }
  return false;
}

function enableDeskFreeLayout(container) {
  try {
    const grid = container.querySelector('.shorts-grid');
    if (!grid) return null;
    grid.dataset.deskLayoutMode = 'free';
    grid.style.position = 'relative';
    grid.style.display = 'block';
    grid.style.minHeight = grid.style.minHeight || '240px';

    const cards = grid.querySelectorAll('.desk-card[data-desk-item-id]');
    let maxBottom = 0;

    cards.forEach((card, idx) => {
      const deskItemId = card.getAttribute('data-desk-item-id');
      const pos = deskItemId ? readDeskCardPos(deskItemId) : null;

      const x = pos ? pos.x : (idx * 220);
      const y = pos ? pos.y : 0;

      card.style.position = 'absolute';
      card.style.left = '0px';
      card.style.top = '0px';
      card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      card.style.willChange = 'transform';
      card.dataset.deskX = String(x);
      card.dataset.deskY = String(y);
      card.style.touchAction = 'none';

      try {
        const rect = card.getBoundingClientRect();
        const h = rect && rect.height ? rect.height : 220;
        maxBottom = Math.max(maxBottom, y + h);
      } catch (e) {
        maxBottom = Math.max(maxBottom, y + 220);
      }
    });

    if (maxBottom > 0) {
      grid.style.minHeight = `${Math.ceil(maxBottom + 40)}px`;
    }

    return grid;
  } catch (e) {
    console.warn('[desk-render] enableDeskFreeLayout failed', e);
    return null;
  }
}

function installDeskDragAndDrop(container) {
  try {
    const grid = container.querySelector('.shorts-grid');
    if (!grid) return;
    if (grid.dataset.deskDndInstalled === '1') return;
    if (grid.dataset.deskLayoutMode !== 'free') return;
    grid.dataset.deskDndInstalled = '1';

    let dragging = null;

    const onPointerDown = (e) => {
      try {
        if (!e || e.button !== undefined && e.button !== 0) return;
        const thumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
        if (!thumb) return;
        const card = thumb.closest('.desk-card[data-desk-item-id]');
        if (!card) return;
        if (e.target.closest('button')) return;

        const deskItemId = card.getAttribute('data-desk-item-id');
        if (!deskItemId) return;

        const gridRect = grid.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const startX = Number(card.dataset.deskX) || 0;
        const startY = Number(card.dataset.deskY) || 0;
        const pointerX = (e.clientX - gridRect.left);
        const pointerY = (e.clientY - gridRect.top);
        const cardLeft = (cardRect.left - gridRect.left);
        const cardTop = (cardRect.top - gridRect.top);
        const offsetX = pointerX - cardLeft;
        const offsetY = pointerY - cardTop;

        dragging = {
          deskItemId,
          card,
          gridRect,
          offsetX,
          offsetY,
          startX,
          startY,
          moved: false,
          active: false,
          pointerId: e.pointerId
        };

        card.style.zIndex = '999';
      } catch (err) {
      }
    };

    const onPointerMove = (e) => {
      try {
        if (!dragging) return;
        const gridRect = dragging.gridRect || grid.getBoundingClientRect();
        const x = (e.clientX - gridRect.left) - dragging.offsetX;
        const y = (e.clientY - gridRect.top) - dragging.offsetY;
        const nx = Math.max(-2000, Math.min(20000, x));
        const ny = Math.max(-2000, Math.min(20000, y));
        if (Math.abs(nx - dragging.startX) > 3 || Math.abs(ny - dragging.startY) > 3) {
          dragging.moved = true;
        }
        if (dragging.moved) {
          if (!dragging.active) {
            dragging.active = true;
            if (dragging.card && dragging.card.setPointerCapture) {
              try { dragging.card.setPointerCapture(dragging.pointerId); } catch (err) { }
            }
          }
          dragging.card.style.transform = `translate(${Math.round(nx)}px, ${Math.round(ny)}px)`;
          dragging.card.dataset.deskX = String(nx);
          dragging.card.dataset.deskY = String(ny);
          e.preventDefault();
        }
      } catch (err) {
      }
    };

    const onPointerUp = (e) => {
      try {
        if (!dragging) return;
        if (!dragging.active) {
          dragging.card.style.zIndex = '';
          dragging = null;
          return;
        }
        const x = Number(dragging.card.dataset.deskX) || 0;
        const y = Number(dragging.card.dataset.deskY) || 0;
        writeDeskCardPos(dragging.deskItemId, x, y);
        if (dragging.moved) {
          dragging.card.dataset.deskJustDragged = '1';
        }
        dragging.card.style.zIndex = '';
        dragging = null;
        e.preventDefault();
      } catch (err) {
        dragging = null;
      }
    };

    const onClickCapture = (e) => {
      try {
        const card = e.target && e.target.closest ? e.target.closest('.desk-card[data-desk-item-id]') : null;
        if (!card) return;
        const moved = card.dataset && card.dataset.deskJustDragged === '1';
        if (moved) {
          card.dataset.deskJustDragged = '';
          e.preventDefault();
          e.stopPropagation();
        }
      } catch (err) {
      }
    };

    grid.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    grid.addEventListener('click', onClickCapture, true);
  } catch (e) {
    console.warn('[desk-render] installDeskDragAndDrop failed', e);
  }
}

function renderDeskCards(items) {
  const container = document.getElementById("deskCardsContainer");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
    return;
  }

  const t0 = performance.now();

  // Очищаем контейнер перед рендерингом, чтобы избежать дублирования
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'shorts-grid';

  items.forEach(item => {
    const cardHtml = createDictationCard(item, true); // true = карточка для стола
    grid.insertAdjacentHTML('beforeend', cardHtml);
  });

  container.appendChild(grid);

  const t1 = performance.now();
  console.log('[desk-render] stage1 cards:', {
    ms: Math.round(t1 - t0),
    items: items.length,
  });

  // Обновляем иконки Lucide
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  ensureDeskLayoutToggleButton();

  if (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container)) {
    enableDeskFreeLayout(container);
    installDeskDragAndDrop(container);
  }

  requestAnimationFrame(() => {
    (async () => {
      const t2Start = performance.now();
      await applyDeskCovers(container);
      await applyCachedDictationCardStyles(container);
      const t2End = performance.now();
      console.log('[desk-render] stage2 covers applied:', { ms: Math.round(t2End - t2Start) });

      setTimeout(async () => {
        const t3Start = performance.now();
        try {
          updateDictationCardsStats(container);
          await updateCompletionBadges(container);
        } finally {
          const t3End = performance.now();
          console.log('[desk-render] stage3 stats/badges:', { ms: Math.round(t3End - t3Start) });
        }
      }, 0);
    })().catch(() => { });
  });
}


// ==================== ЗОНА 2: Список книг ====================

async function loadBooks() {
  try {
    const response = await fetch('/');
    // Здесь нужно получить данные из серверного рендера или через API
    // Пока используем существующий endpoint
    await loadBooksFromAPI();
  } catch (error) {
    console.error("Ошибка загрузки книг:", error);
  }
}

async function loadBooksFromAPI() {
  // Временно: загружаем книги через существующую логику
  // TODO: создать отдельный API endpoint для получения всех книг
  try {
    const token = getToken();
    if (!token) {
      console.warn("⚠️ Нет токена для загрузки книг");
      return;
    }

    const response = await fetch('/library/api/user-books', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('📦 Данные книг получены от API:', data);
      if (data.success) {
        lastOwnBooks = Array.isArray(data.own_books) ? data.own_books : [];
        lastShelfBooks = Array.isArray(data.shelf_books) ? data.shelf_books : [];
        renderBooksList(data.own_books, data.shelf_books);
      } else {
        console.error("❌ Ошибка загрузки книг:", data.error);
      }
    } else {
      const errorText = await response.text();
      console.error("❌ Ошибка загрузки книг:", response.status, errorText);
      if (response.status === 401 || response.status === 422) {
        // Токен невалидный, нужно авторизоваться
        if (window.UM) {
          window.UM.requireAuth();
        }
      }
    }
  } catch (error) {
    console.error("❌ Ошибка загрузки книг:", error);
  }
}

function renderBooksList(ownBooks, shelfBooks) {
  const container = document.getElementById("booksList");
  if (!container) return;

  const rawFilterLang = currentBooksFilterLanguage
    || window.USER_LANGUAGE_DATA?.currentLearning
    || null;
  const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

  const normalizeBookLang = (b) => {
    if (!b) return '';
    return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
  };

  const allBooksRaw = [
    ...(ownBooks || []).map(book => ({ ...book, isOwn: true })),
    ...(shelfBooks || []).map(book => ({ ...book, isOwn: false }))
  ];

  // Deduplicate by book id to avoid double rendering when a book is both own and on shelf.
  const byId = new Map();
  allBooksRaw.forEach(b => {
    if (!b || b.id == null) return;
    const id = Number(b.id);
    if (!isFinite(id)) return;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, b);
      return;
    }
    // Prefer own copy if both exist.
    if (prev.isOwn) return;
    if (b.isOwn) {
      byId.set(id, b);
      return;
    }
  });

  const allBooksDeduped = Array.from(byId.values());

  const allBooks = filterLang
    ? allBooksDeduped.filter(b => {
      // Workbook is multilingual: always show, regardless of filter.
      if (b && b.is_workbook) return true;
      const lang = normalizeBookLang(b);
      return !lang || lang === String(filterLang).toLowerCase();
    })
    : allBooksDeduped;

  if (allBooks.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Нет книг</div>';
    return;
  }

  container.innerHTML = allBooks.map(book => createMiniBookCard(book)).join('');

  hydrateMiniBookCardImages(container);

  // Обработчики событий
  container.querySelectorAll('.book-card-mini').forEach(card => {
    const bookId = parseInt(card.getAttribute('data-book-id'));
    const book = allBooks.find(b => b.id === bookId);

    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveBook(bookId, container);
    });

    card.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        setActiveBook(bookId, container);
        await openBookViewBook(bookId, !!(book && book.is_workbook));
      } catch (err) {
      }
    });
  });
}

function hydrateMiniBookCardImages(root) {
  if (!root) return;
  root.querySelectorAll('img[data-src]').forEach(img => {
    const src = img.getAttribute('data-src');
    if (!src) return;
    img.setAttribute('src', src);
    img.removeAttribute('data-src');
  });
}

function createMiniBookCard(book) {
  const foreignClass = book.isOwn ? '' : 'foreign';
  const activeClass = activeBookId === book.id ? 'active' : '';
  const blankImg = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  // Формируем URL аватара создателя
  let creatorAvatarHtml = '';
  if (book.creator_user_id) {
    const avatarUrl = withCacheBust(`/user/api/avatar?user_id=${book.creator_user_id}&size=small`);
    creatorAvatarHtml = `<img src="${blankImg}" data-src="${avatarUrl}" alt="Creator" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`;
  } else {
    creatorAvatarHtml = '<i data-lucide="user"></i>';
  }

  const creatorName = book.creator_username || 'Неизвестный';

  // Формируем HTML обложки
  let coverHtml;
  if (book.cover_url) {
    const coverV = (book.cover_url && String(book.cover_url).includes('/library/api/book-cover'))
      ? (book.updated_at || Date.now())
      : (__APP_BUILD_LOCAL || '1');
    coverHtml = `<img class="book-card-mini-cover" src="${blankImg}" data-src="${withCacheBustVersion(book.cover_url, coverV)}" alt="${book.title}">`;
  } else {
    coverHtml = `<div class="book-card-mini-cover-placeholder"><i data-lucide="book"></i></div>`;
  }

  return `
      <div class="book-card-mini ${foreignClass} ${activeClass}" data-book-id="${book.id}">
        <div class="book-card-mini-cover-wrapper">
          ${coverHtml}
          <div class="book-card-mini-creator-bar">
            <div class="book-card-mini-creator">
              ${creatorAvatarHtml}
            </div>
            <div class="book-card-mini-creator-name">${creatorName}</div>
          </div>
        </div>
        <div class="book-card-mini-title">${book.title}</div>
      </div>
    `;
}

function setActiveBook(bookId, root = document) {
  activeBookId = bookId;

  // Обновляем выделение в списке
  root.querySelectorAll('.book-card-mini').forEach(card => {
    if (parseInt(card.getAttribute('data-book-id')) === bookId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

// ==================== ЗОНА 3: Активная книга (устарело, заменено на book-view-modal) ====================
async function openActiveBookZone(book) {
  const bookId = book && typeof book === 'object' ? (book.id || null) : book;
  if (bookId) {
    await openBookViewBook(bookId, !!(book && book.is_workbook));
  }
}

function closeActiveBookZone() {
  closeBookViewModal();
}

async function loadActiveBook(bookId, isWorkbook = false) {
  try {
    activeBookIsWorkbook = !!isWorkbook;
    // Загружаем информацию о книге
    const bookData = await apiRequest(`/library/api/book/${bookId}`);

    if (bookData.success && bookData.book) {
      const viewCard = document.getElementById('bookViewCard');
      const viewStructure = document.getElementById('bookViewStructure');

      if (viewCard && viewStructure) {
        openBookViewModal();
        bookViewActiveBookId = bookId;
        renderActiveBookCard(bookData.book, viewCard, { onClose: closeBookViewModal });
      } else {
        renderActiveBookCard(bookData.book);
      }
    }

    let sections = [];
    let dictations = [];

    if (isWorkbook) {
      // Для рабочей тетради загружаем бесхозные диктанты
      const orphanData = await apiRequest(`/library/api/orphan-dictations`);
      dictations = orphanData.success ? orphanData.dictations : [];
    } else {
      // Для обычных книг загружаем разделы и диктанты
      const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
      const dictationsData = await apiRequest(`/library/api/book/${bookId}/dictations`);

      sections = sectionsData.success ? sectionsData.sections : [];
      dictations = dictationsData.success ? dictationsData.dictations : [];

      console.log('📚 Загружены разделы:', sections);
      sections.forEach(s => {
        console.log(`  - Раздел ${s.id}: "${s.title}", section_number: ${s.section_number}`);
      });

      // Сохраняем разделы в глобальной переменной для доступа при редактировании
      window.currentBookSections = sections;
    }

    const viewStructure = document.getElementById('bookViewStructure');
    if (viewStructure) {
      renderBookContentTo(viewStructure, sections, dictations, isWorkbook);
    }
  } catch (error) {
    console.error("Ошибка загрузки активной книги:", error);
  }
}

function renderBookContentTo(container, sections, dictations, isWorkbook = false) {
  if (!container) return;

  if ((!sections || sections.length === 0) && (!dictations || dictations.length === 0)) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
    return;
  }

  let html = '';

  if (!isWorkbook && sections && sections.length > 0) {
    html += '<div class="book-structure-list">';
    sections.forEach(section => {
      const sectionNumber = section.section_number ? `§ ${section.section_number}. ` : '§ ';

      html += `
          <div class="structure-item structure-section" data-section-id="${section.id}">
            <div class="structure-item-header">
              <button class="structure-item-toggle" data-section-id="${section.id}" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
              <span class="structure-item-title">${sectionNumber}${section.title}</span>
              <button class="structure-item-actions" data-action="section-actions" data-section-id="${section.id}" title="Действия">
                <i data-lucide="more-horizontal"></i>
              </button>
              <div class="section-actions-menu" data-section-id="${section.id}" style="display: none;">
                <button class="dropdown-menu-item" data-action="add-subsection" data-section-id="${section.id}">
                  <i data-lucide="folder-plus"></i><span>Добавить подраздел</span>
                </button>
                <button class="dropdown-menu-item" data-action="add-dictation" data-section-id="${section.id}">
                  <i data-lucide="plus"></i><span>Добавить диктант</span>
                </button>
                <button class="dropdown-menu-item" data-action="edit-section" data-section-id="${section.id}">
                  <i data-lucide="edit-3"></i><span>Редактировать</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-section" data-section-id="${section.id}">
                  <i data-lucide="trash-2"></i><span>Удалить</span>
                </button>
              </div>
            </div>
            <div class="structure-item-content" data-section-content-id="${section.id}" style="display: none;">
              <div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>
            </div>
          </div>
        `;
    });
    html += '</div>';
  }

  if (dictations && dictations.length > 0) {
    html += '<div class="shorts-grid">';
    dictations.forEach(d => {
      html += createDictationCard(d, false);
    });
    html += '</div>';
  }

  container.innerHTML = html;

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    applyCachedDictationCardStyles(container);
  } catch (e) {
  }

  setTimeout(() => {
    updateCompletionBadges(container);
  }, 100);
}

async function loadSectionForEdit(sectionId) {
  try {
    console.log('📚 Загружаю раздел для редактирования:', sectionId);
    const sectionData = await apiRequest(`/library/api/book/${sectionId}`);
    if (sectionData.success && sectionData.book) {
      console.log('📚 Данные раздела загружены:', sectionData.book);
      openSectionModal(sectionData.book, sectionData.book.parent_id);
    } else {
      // Если не получилось загрузить через API, ищем в текущих разделах
      const sections = window.currentBookSections || [];
      const section = sections.find(s => s.id === parseInt(sectionId));
      if (section) {
        console.log('📚 Раздел найден в текущих разделах:', section);
        openSectionModal(section, section.parent_id);
      } else {
        console.error('📚 Раздел не найден');
        showToast("Не удалось загрузить данные раздела", "error");
      }
    }
  } catch (error) {
    console.error("Ошибка загрузки раздела для редактирования:", error);
    showToast("Ошибка загрузки раздела", "error");
  }
}

function renderActiveBookCard(book, targetContainer = null, options = {}) {
  const container = targetContainer
    || document.getElementById("bookViewCard")
    ;
  if (!container) return;

  console.log('📖 Рендерю большую карточку книги:', {
    id: book.id,
    title: book.title,
    creator_user_id: book.creator_user_id,
    creator_username: book.creator_username
  });

  const avatarUrl = book.creator_user_id
    ? `/user/api/avatar?user_id=${book.creator_user_id}&size=small&t=${Date.now()}`
    : '';
  // Проверяем все возможные варианты имени создателя
  const creatorName = book.creator_username ||
    (book.creator_user_id ? 'Загрузка...' : 'Неизвестный') ||
    'Неизвестный';

  console.log('👤 Имя создателя:', creatorName);
  console.log('👤 book.creator_username:', book.creator_username);
  console.log('👤 book.creator_user_id:', book.creator_user_id);
  console.log('👤 Все поля book:', Object.keys(book));

  // Если creator_user_id отсутствует, пытаемся найти его в массиве publicBooks
  let finalCreatorUserId = book.creator_user_id;
  if (!finalCreatorUserId && book.id && typeof publicBooks !== 'undefined') {
    const bookFromList = publicBooks.find(b => b.id === book.id);
    if (bookFromList && bookFromList.creator_user_id) {
      finalCreatorUserId = bookFromList.creator_user_id;
      book.creator_user_id = finalCreatorUserId;
      console.log('👤 Найден creator_user_id из списка:', finalCreatorUserId);
    }
  }

  // Используем обновленный avatarUrl или исходный
  const finalAvatarUrl = finalCreatorUserId
    ? `/user/api/avatar?user_id=${finalCreatorUserId}&size=small&t=${Date.now()}`
    : '';

  // Если есть ссылка на материалы автора, делаем картинку кликабельной
  const coverV = (book.cover_url && String(book.cover_url).includes('/library/api/book-cover'))
    ? (book.updated_at || Date.now())
    : (__APP_BUILD_LOCAL || '1');
  const coverImage = book.cover_url
    ? `<img src="${withCacheBustVersion(book.cover_url, coverV)}" alt="${book.title}">`
    : `<div class="book-card-max-cover-placeholder"><i data-lucide="book-open"></i></div>`;

  const coverContent = book.author_materials_url
    ? `<a href="${book.author_materials_url}" target="_blank" title="${book.author_materials_url}" style="display: block; width: 100%; height: 100%;">${coverImage}</a>`
    : coverImage;

  // Индикатор видимости (перемещен в заголовок, перед названием)
  const isPublic = book.visibility === 'public' || book.is_public === true;
  const visibilityBadge = `
      <div class="book-card-max-visibility-badge" title="${isPublic ? 'Публичная книга (видна всем)' : 'Вижу только я'}">
        <i data-lucide="${isPublic ? 'globe' : 'home'}"></i>
      </div>
    `;

  // Кнопка закрытия книги
  const closeButton = `
      <button class="book-card-max-close-btn btn-close-active-book" title="Закрыть книгу">
        <i data-lucide="arrow-left-to-line"></i>
      </button>
    `;

  container.innerHTML = `
      <div class="book-card-max">
        ${closeButton}
        <div class="book-card-max-cover-wrapper">
          <div class="book-card-max-cover" ${book.author_materials_url ? 'style="cursor: pointer;"' : ''}>
            ${coverContent}
          </div>
          <div class="book-card-max-creator">
            <div class="book-card-max-creator-avatar">
              ${finalAvatarUrl
      ? `<img src="${finalAvatarUrl}" alt="${creatorName}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`
      : '<i data-lucide="user"></i>'
    }
            </div>
            <div class="book-card-max-creator-name">${creatorName}</div>
          </div>
        </div>
        <div class="book-card-max-info">
          <div class="book-card-max-header">
            <div class="book-card-max-header-left">
              ${visibilityBadge}
              <div class="book-card-max-title-author-wrapper">
                <h2 class="book-card-max-title">${book.title}</h2>
                ${book.author_text ? `<p class="book-card-max-author">${book.author_text}</p>` : ''}
              </div>
            </div>
          </div>
          ${book.short_description ? `<p class="book-card-max-description">${book.short_description}</p>` : ''}
          <div class="book-card-max-actions">
            <div class="dropdown-menu-wrapper">
              <button class="book-card-max-btn dropdown-toggle btn-book-actions" title="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu book-actions-menu" style="display: none;">
                <button class="dropdown-menu-item" data-action="add-section">
                  <i data-lucide="plus"></i>
                  <span>Добавить раздел</span>
                </button>
                <button class="dropdown-menu-item" data-action="add-dictation">
                  <i data-lucide="plus"></i>
                  <span>Добавить диктант</span>
                </button>
                <button class="dropdown-menu-item" data-action="edit-book">
                  <i data-lucide="edit-3"></i>
                  <span>Редактировать книгу</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-book">
                  <i data-lucide="trash-2"></i>
                  <span>Удалить книгу</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

  // Обработчик кнопки закрытия книги
  const closeBtn = container.querySelector(".btn-close-active-book");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof options.onClose === 'function') {
        options.onClose();
      } else {
        closeActiveBookZone();
      }
    });
  }

  // Обработчики выпадающего меню действий книги
  const bookActionsBtn = container.querySelector(".btn-book-actions");
  const bookActionsMenu = container.querySelector(".book-actions-menu");

  if (bookActionsBtn && bookActionsMenu) {
    // Открытие/закрытие меню
    bookActionsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Закрываем все другие меню
      document.querySelectorAll('.section-actions-menu').forEach(m => {
        m.classList.remove('show');
        m.style.display = 'none';
      });

      const isVisible = bookActionsMenu.classList.contains('show');
      if (isVisible) {
        bookActionsMenu.classList.remove('show');
        bookActionsMenu.style.display = 'none';
      } else {
        bookActionsMenu.classList.add('show');
        bookActionsMenu.style.display = 'block';

        // Закрываем меню при клике вне его
        setTimeout(() => {
          const closeMenuHandler = function (e) {
            if (!bookActionsMenu.contains(e.target) && !bookActionsBtn.contains(e.target)) {
              bookActionsMenu.classList.remove('show');
              bookActionsMenu.style.display = 'none';
              document.removeEventListener('click', closeMenuHandler);
            }
          };
          document.addEventListener('click', closeMenuHandler);
        }, 0);
      }
    });

    // Обработчики пунктов меню
    bookActionsMenu.addEventListener("click", (e) => {
      const item = e.target.closest('.dropdown-menu-item');
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();

      const action = item.getAttribute('data-action');
      bookActionsMenu.classList.remove('show');
      bookActionsMenu.style.display = 'none';

      switch (action) {
        case 'add-section':
          openSectionModal(null, activeBookId);
          break;
        case 'add-dictation':
          if (activeBookId) {
            setDictationTargetBook(activeBookId);
          }
          window.location.href = '/dictation_editor/new';
          break;
        case 'edit-book':
          openBookModal(book);
          break;
        case 'delete-book':
          if (confirm(`Вы уверены, что хотите удалить книгу "${book.title}"?`)) {
            deleteBook(book.id);
          }
          break;
      }
    });
  }

  // Обновляем иконки
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

async function loadSectionDictations(sectionId, container) {
  try {
    console.log('📚 Загружаю диктанты для раздела:', sectionId);
    console.log('📚 URL запроса:', `/library/api/book/${sectionId}/dictations`);
    const dictationsData = await apiRequest(`/library/api/book/${sectionId}/dictations`);
    console.log('📚 Полный ответ API для раздела', sectionId, ':', JSON.stringify(dictationsData, null, 2));
    const dictations = dictationsData.success ? dictationsData.dictations : [];
    console.log('📚 Загружено диктантов:', dictations.length);
    if (dictations.length > 0) {
      console.log('📚 Список диктантов:', dictations.map(d => ({ id: d.id, title: d.title })));
    }

    // Удаляем индикатор загрузки
    const loadingDiv = container.querySelector('.section-dictations-loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    if (dictations.length === 0) {
      console.log('📚 Раздел пуст, показываю сообщение');
      container.innerHTML = '<div class="section-dictations-empty" style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этом разделе нет диктантов</div>';
    } else {
      console.log('📚 Рендерю', dictations.length, 'диктантов');
      let html = '<div class="section-dictations-grid shorts-grid">';
      dictations.forEach(d => {
        html += createDictationCard(d, false); // false = карточка для книги
      });
      html += '</div>';
      container.innerHTML = html;

      // Создаём иконки Lucide для новых карточек
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      // Загружаем статистику и медальки для карточек диктантов
      setTimeout(() => {
        // Статистика (звезды/полузвезды/микрофон) только на столе, не в библиотеке
        updateCompletionBadges(container); // Медальки остаются
      }, 100);
    }
  } catch (error) {
    console.error("Ошибка загрузки диктантов раздела:", error);
    container.innerHTML = '<div class="section-dictations-error" style="padding: 20px; text-align: center; color: var(--color-error);">Ошибка загрузки диктантов</div>';
  }
}


function renderDictationsAsCards(dictations, container) {
  container.innerHTML = `
      <div class="shorts-grid">
        ${dictations.map(d => `
          <div class="short-card" data-dictation-id="${d.id}">
            <div class="short-title">${d.title}</div>
            <div class="short-meta">
              <span>Язык: ${d.language_code || ''}</span>
              ${d.level ? `<span>Уровень: ${d.level}</span>` : ''}
            </div>
            <div class="short-actions">
              <a href="/editor/${d.id}" class="btn-outline">Открыть</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
}

function renderDictationsAsList(dictations, container) {
  container.innerHTML = `
      <ul class="dictations-list">
        ${dictations.map(d => `
          <li class="dictation-list-item">
            <span class="dictation-list-title">${d.title}</span>
            <span class="dictation-list-meta">${d.language_code || ''} ${d.level ? `• ${d.level}` : ''}</span>
            <a href="/editor/${d.id}" class="btn-outline">Открыть</a>
          </li>
        `).join('')}
      </ul>
    `;
}

// ==================== Модальное окно книги ====================

function openBookModal(book) {
  setBookEditDirty(false);

  const modal = document.getElementById("book-edit-modal");
  const titleEl = document.getElementById("book-edit-title");
  const idInput = document.getElementById("book-id-input");
  const titleInput = document.getElementById("book-title-input");
  const authorInput = document.getElementById("book-author-text-input");
  const themeInput = document.getElementById("book-theme-input");
  const visibilityInput = document.getElementById("book-visibility-input");
  const descInput = document.getElementById("book-description-input");
  const authorMaterialsUrlInput = document.getElementById("book-author-materials-url-input");
  const coverPreview = document.getElementById("book-cover-preview");
  const coverPlaceholder = document.getElementById("book-cover-placeholder");
  const coverUploadInput = document.getElementById("book-cover-upload");

  if (!modal) return;

  if (book) {
    titleEl.textContent = "Редактирование книги";
    idInput.value = book.id;
    titleInput.value = book.title || "";
    authorInput.value = book.author_text || "";
    themeInput.value = book.theme || "";
    visibilityInput.value = book.visibility || "private";
    descInput.value = book.short_description || "";
    if (authorMaterialsUrlInput) {
      authorMaterialsUrlInput.value = book.author_materials_url || "";
    }

    if (book.cover_url) {
      coverPreview.src = book.cover_url;
      coverPreview.style.display = "block";
      coverPlaceholder.style.display = "none";
    } else {
      coverPreview.style.display = "none";
      coverPlaceholder.style.display = "flex";
    }
  } else {
    titleEl.textContent = "Новая книга";
    idInput.value = "";
    titleInput.value = "";
    authorInput.value = "";
    themeInput.value = "";
    visibilityInput.value = "private";
    descInput.value = "";
    if (authorMaterialsUrlInput) {
      authorMaterialsUrlInput.value = "";
    }
    coverPreview.style.display = "none";
    coverPlaceholder.style.display = "flex";
    coverPreview.src = "";
    if (coverUploadInput) {
      coverUploadInput.value = "";
    }
  }

  modal.style.display = "flex";
  modal.classList.add("show");

  const defaultLang = book ? book.original_language : getDefaultOriginalLanguageForNewBook();
  initBookLanguageSelector(defaultLang);

  // Track unsaved edits in inputs/selects.
  try {
    const trackIds = [
      'book-title-input',
      'book-author-text-input',
      'book-author-materials-url-input',
      'book-theme-input',
      'book-visibility-input',
      'book-description-input'
    ];
    trackIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.dataset && el.dataset.bookDirtyBound === '1') return;
      if (el.dataset) el.dataset.bookDirtyBound = '1';
      el.addEventListener('input', () => setBookEditDirty(true));
      el.addEventListener('change', () => setBookEditDirty(true));
    });
  } catch (e) {
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function closeBookModal() {
  const modal = document.getElementById("book-edit-modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("show");
  }

  setBookEditDirty(false);
}

// ==================== Модальное окно раздела ====================

async function openSectionModal(section, parentId) {
  const modal = document.getElementById("section-edit-modal");
  const titleEl = document.getElementById("section-edit-title");
  const idInput = document.getElementById("section-id-input");
  const parentIdInput = document.getElementById("section-parent-id-input");
  const numberInput = document.getElementById("section-number-input");
  const titleInput = document.getElementById("section-title-input");

  if (!modal) return;

  if (section) {
    // Редактирование существующего раздела
    titleEl.textContent = "Редактирование раздела";
    idInput.value = section.id;
    parentIdInput.value = section.parent_id || '';
    numberInput.value = section.section_number || '';
    titleInput.value = section.title || "";
  } else {
    // Создание нового раздела
    titleEl.textContent = "Новый раздел";
    idInput.value = "";
    parentIdInput.value = parentId || activeBookId;
    titleInput.value = "";

    // Автоматически определяем номер для нового раздела
    const bookId = parentId || activeBookId;
    if (bookId) {
      try {
        const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
        const sections = sectionsData.success ? sectionsData.sections : [];

        if (sections.length === 0) {
          // Первый раздел - номер 1
          numberInput.value = "1";
        } else {
          // Находим максимальный номер и прибавляем 1
          const maxNumber = Math.max(
            ...sections
              .map(s => s.section_number)
              .filter(n => n !== null && n !== undefined)
              .concat([0]) // Если все номера null, начинаем с 0
          );
          numberInput.value = String(maxNumber + 1);
        }
      } catch (error) {
        console.error("Ошибка загрузки разделов для определения номера:", error);
        // В случае ошибки ставим 1
        numberInput.value = "1";
      }
    } else {
      numberInput.value = "1";
    }
  }

  modal.style.display = "flex";
  modal.classList.add("show");
  titleInput.focus();
}

function closeSectionModal() {
  const modal = document.getElementById("section-edit-modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("show");
  }
}

async function handleSaveSection(event) {
  event.preventDefault();

  const idInput = document.getElementById("section-id-input");
  const parentIdInput = document.getElementById("section-parent-id-input");
  const numberInput = document.getElementById("section-number-input");
  const titleInput = document.getElementById("section-title-input");

  const sectionId = idInput.value ? parseInt(idInput.value, 10) : null;
  const parentIdRaw = parentIdInput ? String(parentIdInput.value || '').trim() : '';
  const parentId = parentIdRaw ? parseInt(parentIdRaw, 10) : null;
  const sectionNumber = numberInput.value ? parseInt(numberInput.value, 10) : null;

  if (!titleInput.value.trim()) {
    showToast("Введите название раздела");
    return;
  }

  // Safety: section must have a valid parent book/section.
  // If parentId is invalid, JSON.stringify(NaN) becomes null and server will create a top-level book,
  // which looks like "section didn't add".
  if (!parentId || Number.isNaN(parentId)) {
    showToast("Ошибка: не выбрана книга для раздела", { durationMs: 2500 });
    return;
  }

  showLoadingIndicator("Сохранение раздела...");

  try {
    const payload = {
      title: titleInput.value.trim(),
      parent_id: parentId,
      section_number: sectionNumber,
      // Разделы не имеют обложек, авторов и описаний
      author_text: null,
      short_description: null,
      original_language: null,
      visibility: 'private',
      theme: null,
      order_index: 0
    };

    console.log('💾 Сохраняю раздел с payload:', payload);
    console.log('💾 section_number в payload:', payload.section_number, 'тип:', typeof payload.section_number);

    let data;
    if (sectionId) {
      // Обновление раздела
      data = await apiRequest(`/library/api/book/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      // Создание нового раздела
      data = await apiRequest("/library/api/book", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    if (!data.success) {
      hideLoadingIndicator();
      showToast(data.error || "Ошибка сохранения раздела");
      return;
    }

    console.log('✅ Раздел сохранен, ответ сервера:', data);
    if (data.book) {
      console.log('📚 Сохраненный раздел:', data.book);
      console.log('📚 section_number:', data.book.section_number);
    }

    closeSectionModal();

    // Перезагружаем активную книгу чтобы показать новые разделы
    if (activeBookId) {
      console.log('🔄 Перезагружаю активную книгу:', activeBookId);
      await loadActiveBook(activeBookId);
    }

    hideLoadingIndicator();
  } catch (error) {
    console.error("Ошибка сохранения раздела:", error);
    hideLoadingIndicator();
    showToast("Ошибка сохранения раздела");
  }
}

function initBookLanguageSelector(selectedLanguage) {
  const container = document.getElementById("book-language-selector");
  if (!container) return;

  container.innerHTML = '';

  const initSelector = () => {
    if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
      setTimeout(initSelector, 100);
      return;
    }

    const languageData = window.LanguageManager.getLanguageData();
    if (!languageData) {
      console.warn("Данные языков недоступны");
      return;
    }

    const defaultLanguage = selectedLanguage || (window.USER_LANGUAGE_DATA?.nativeLanguage) || 'en';

    if (typeof window.initLanguageSelector === 'function') {
      bookLanguageSelector = window.initLanguageSelector('book-language-selector', {
        mode: 'native-selector',
        nativeLanguage: defaultLanguage,
        languageData: languageData,
        onLanguageChange: function (values) { }
      });
    }
  };

  initSelector();
}

async function handleSaveBook(event) {
  event.preventDefault();

  const idInput = document.getElementById("book-id-input");
  const titleInput = document.getElementById("book-title-input");
  const authorInput = document.getElementById("book-author-text-input");
  const themeInput = document.getElementById("book-theme-input");
  const visibilityInput = document.getElementById("book-visibility-input");
  const descInput = document.getElementById("book-description-input");
  const authorMaterialsUrlInput = document.getElementById("book-author-materials-url-input");
  const coverUploadInput = document.getElementById("book-cover-upload");

  const bookId = idInput.value ? parseInt(idInput.value, 10) : null;

  if (!titleInput.value.trim()) {
    showToast("Введите название книги");
    return;
  }

  let originalLanguage = '';
  if (bookLanguageSelector && typeof bookLanguageSelector.getValues === 'function') {
    const values = bookLanguageSelector.getValues();
    originalLanguage = values.nativeLanguage || '';
  }

  showLoadingIndicator("Сохранение книги...");

  try {
    let data;
    const token = getToken();

    // Используем cropped blob если есть, иначе оригинальный файл
    const croppedBlob = getBookCroppedCoverBlob();
    const hasCover = croppedBlob || coverUploadInput?.files[0];

    if (hasCover) {
      const formData = new FormData();
      formData.append("title", titleInput.value.trim());
      formData.append("author_text", authorInput.value.trim());
      formData.append("original_language", originalLanguage);
      formData.append("theme", themeInput.value.trim());
      formData.append("visibility", visibilityInput.value);
      formData.append("short_description", descInput.value.trim());
      if (authorMaterialsUrlInput) {
        formData.append("author_materials_url", authorMaterialsUrlInput.value.trim());
      }

      // Используем cropped blob или оригинальный файл
      if (croppedBlob) {
        formData.append("cover", croppedBlob, "cover.webp");
      } else {
        formData.append("cover", coverUploadInput.files[0]);
      }

      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      if (bookId) {
        const response = await fetch(`/library/api/book/${bookId}`, {
          method: "PATCH",
          headers,
          body: formData,
        });
        data = await response.json();
      } else {
        const response = await fetch("/library/api/book", {
          method: "POST",
          headers,
          body: formData,
        });
        data = await response.json();
      }
    } else {
      const payload = {
        title: titleInput.value.trim(),
        author_text: authorInput.value.trim(),
        original_language: originalLanguage,
        theme: themeInput.value.trim(),
        visibility: visibilityInput.value,
        short_description: descInput.value.trim(),
      };

      if (authorMaterialsUrlInput) {
        payload.author_materials_url = authorMaterialsUrlInput.value.trim() || null;
      }

      if (bookId) {
        data = await apiRequest(`/library/api/book/${bookId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        data = await apiRequest("/library/api/book", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    }

    if (!data.success) {
      hideLoadingIndicator();
      showToast(data.error || "Ошибка сохранения книги");
      return;
    }

    setBookEditDirty(false);

    // Очищаем cropped blob
    clearBookCroppedCoverBlob();

    closeBookModal();
    // Перезагружаем список книг
    await loadBooksFromAPI();

    // Если это активная книга, обновляем её
    if (bookId && bookId === activeBookId) {
      await loadActiveBook(bookId);
    }

    hideLoadingIndicator();
  } catch (error) {
    console.error("Ошибка сохранения книги:", error);
    hideLoadingIndicator();
    showToast("Ошибка сохранения книги");
  }
}

// ==================== Инициализация ====================

function installEventHandlers() {
  // Кнопка "Новая книга" в верхней панели
  const newBookBtn = document.getElementById("btnNewBook");
  if (newBookBtn) {
    newBookBtn.addEventListener("click", () => openBookModal(null));
  }

  // Кнопка "Новая книга" в панели "Мои книги"
  const newBookBtnInZone = document.getElementById("btnNewBookInZone");
  if (newBookBtnInZone) {
    newBookBtnInZone.addEventListener("click", () => openBookModal(null));
  }

  const homeLibraryBtn = document.getElementById('btnHomeLibrary');
  if (homeLibraryBtn) {
    homeLibraryBtn.addEventListener('click', () => openHomeLibraryModal());
  }

  const newDictationQuickBtn = document.getElementById('btnNewDictationQuick');
  if (newDictationQuickBtn) {
    newDictationQuickBtn.addEventListener('click', async () => {
      try {
        // Ensure workbook id is known.
        if (!__workbookBookId) {
          try {
            const token = getToken();
            if (token) {
              const resp = await fetch('/library/api/user-books', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const j = await resp.json();
              const own = (j && j.success) ? (j.own_books || []) : [];
              const wb = Array.isArray(own) ? own.find(b => b && b.is_workbook) : null;
              __workbookBookId = wb && wb.id ? Number(wb.id) : null;
            }
          } catch (e0) {
          }
        }

        if (__workbookBookId) {
          try { setDictationTargetBook(__workbookBookId); } catch (e1) {}
        } else {
          // Fallback: still open editor; it will remain orphan until user moves to book.
          try { sessionStorage.removeItem('dictationTargetBook'); } catch (e2) {}
        }
        window.location.href = '/dictation_editor/new';
      } catch (e) {
        window.location.href = '/dictation_editor/new';
      }
    });
  }

  const studentPlanBtn = document.getElementById('btnStudentPlan');
  if (studentPlanBtn) {
    studentPlanBtn.addEventListener('click', () => {
      openStudentPlanPanel().catch(() => { });
    });
  }

  const teacherAssignmentsBtn = document.getElementById('btnTeacherAssignments');
  if (teacherAssignmentsBtn) {
    teacherAssignmentsBtn.addEventListener('click', () => {
      openTeacherAssignmentsPanel().catch(() => { });
    });
  }

  const homeLibraryCloseBtn = document.getElementById('home-library-close');
  if (homeLibraryCloseBtn) {
    homeLibraryCloseBtn.addEventListener('click', closeHomeLibraryModal);
  }

  const homeLibraryModal = document.getElementById('home-library-modal');
  if (homeLibraryModal) {
    homeLibraryModal.addEventListener('click', (event) => {
      if (event.target === homeLibraryModal) {
        closeHomeLibraryModal();
      }
    });
  }

  // Кнопка публичной библиотеки
  const publicLibraryBtn = document.getElementById("btnPublicLibrary");
  if (publicLibraryBtn) {
    publicLibraryBtn.addEventListener("click", () => openPublicLibraryModal());
  }

  // ==================== Desk zoom controls ====================
  const deskZone = document.querySelector('.desk-zone');
  const zoomInBtn = document.getElementById('btnDeskZoomIn');
  const zoomOutBtn = document.getElementById('btnDeskZoomOut');
  const zoomStorageKey = 'desk_zoom';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const applyDeskZoom = (zoom) => {
    if (!deskZone) return;
    const z = clamp(Number(zoom) || 1, 0.6, 1.8);
    deskZone.style.setProperty('--desk-zoom', String(z));
    try {
      localStorage.setItem(zoomStorageKey, String(z));
    } catch (e) {
    }
  };

  // Apply saved zoom on load
  try {
    const saved = localStorage.getItem(zoomStorageKey);
    if (saved) {
      applyDeskZoom(saved);
    }
  } catch (e) {
  }

  const step = 0.1;
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      const current = Number(getComputedStyle(deskZone).getPropertyValue('--desk-zoom')) || 1;
      applyDeskZoom(current + step);
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      const current = Number(getComputedStyle(deskZone).getPropertyValue('--desk-zoom')) || 1;
      applyDeskZoom(current - step);
    });
  }

  // Закрытие модального окна публичной библиотеки
  const publicLibraryCloseBtn = document.getElementById("public-library-close");
  if (publicLibraryCloseBtn) {
    publicLibraryCloseBtn.addEventListener("click", closePublicLibraryModal);
  }

  const bookViewCloseBtn = document.getElementById('book-view-close');
  if (bookViewCloseBtn) {
    bookViewCloseBtn.addEventListener('click', closeBookViewModal);
  }

  const bookViewModal = document.getElementById('book-view-modal');
  if (bookViewModal) {
    bookViewModal.addEventListener('click', (event) => {
      if (event.target === bookViewModal) {
        closeBookViewModal();
      }
    });
  }

  const publicLibraryModal = document.getElementById("public-library-modal");
  if (publicLibraryModal) {
    publicLibraryModal.addEventListener("click", (event) => {
      if (event.target === publicLibraryModal) {
        closePublicLibraryModal();
      }
    });
  }

  // Переключатель вида диктантов удален - всегда используем вид "cards"
  currentView = 'cards';

  // Закрыть модальное окно
  const modalCloseBtn = document.getElementById("book-edit-close");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeBookModal);
  }

  // Форма сохранения книги
  const form = document.getElementById("book-edit-form");
  if (form) {
    form.addEventListener("submit", handleSaveBook);
  }

  // Загрузка обложки
  const coverUploadBtn = document.getElementById("book-cover-upload-btn");
  const coverUploadInput = document.getElementById("book-cover-upload");
  const coverClickable = document.getElementById("book-cover-clickable");

  if (window.CoverManager) {
    bindCoverHandlers();
  } else {
    try {
      if (coverUploadBtn) coverUploadBtn.disabled = true;
    } catch (e) {
    }
    try {
      if (coverClickable) coverClickable.style.pointerEvents = 'none';
    } catch (e) {
    }
  }

  // Закрытие модального окна при клике вне его
  const bookModal = document.getElementById("book-edit-modal");
  if (bookModal) {
    bookModal.addEventListener("click", (event) => {
      if (event.target === bookModal) {
        closeBookModal();
      }
    });
  }

  // Модальное окно раздела
  const sectionCloseBtn = document.getElementById("section-edit-close");
  if (sectionCloseBtn) {
    sectionCloseBtn.addEventListener("click", closeSectionModal);
  }

  const sectionForm = document.getElementById("section-edit-form");
  if (sectionForm) {
    sectionForm.addEventListener("submit", handleSaveSection);
  }

  const sectionModal = document.getElementById("section-edit-modal");
  if (sectionModal) {
    sectionModal.addEventListener("click", (event) => {
      if (event.target === sectionModal) {
        closeSectionModal();
      }
    });
  }

  // Инициализируем прокрутку desk
  // Обработчики для кнопок в карточках диктантов (делегирование событий)
  document.addEventListener('dblclick', (e) => {
    try {
      const deskThumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
      if (!deskThumb) return;
      e.preventDefault();
      e.stopPropagation();
      const href = deskThumb.getAttribute('data-href') || deskThumb.getAttribute('href');
      if (href) {
        try {
          const notice = String(deskThumb.getAttribute('data-lang-notice') || '').trim();
          if (notice && typeof showToast === 'function') {
            showToast(notice, { durationMs: 3500 });
          }
        } catch (e2) {
        }
        window.location.href = href;
      }
    } catch (err) {
    }
  }, true);

  // dblclick по диктанту в книге: открываем редактор, НЕ toggle-desk
  document.addEventListener('dblclick', (e) => {
    try {
      const card = e.target && e.target.closest ? e.target.closest('.short-card[data-action="toggle-desk"]') : null;
      if (!card) return;
      if (card.classList.contains('desk-card')) return;

      // Игнорируем dblclick по кнопкам/ссылкам, чтобы не мешать действиям
      if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.dropdown-menu')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const editUrl = card.getAttribute('data-edit-url') || '';
      if (editUrl) {
        window.location.href = editUrl;
      }
    } catch (err) {
    }
  }, true);

  document.addEventListener('click', async (e) => {
    try {
      const deskThumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
      if (deskThumb) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    } catch (err) {
    }

    // Выпадающее меню действий карточки диктанта (desk/book)
    if (e.target.closest('[data-action="toggle-card-actions"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="toggle-card-actions"]');
      const wrap = btn ? btn.closest('.short-actions-menu-wrapper') : null;
      const card = btn ? btn.closest('.short-card') : null;
      const menu = wrap ? wrap.querySelector('.short-card-actions-menu') : null;
      if (!menu) return;

      // Закрываем все другие меню карточек
      document.querySelectorAll('.short-card-actions-menu').forEach(m => {
        if (m !== menu) {
          m.classList.remove('show');
          m.style.display = 'none';
        }
      });

      document.querySelectorAll('.short-card.short-card--menu-open').forEach(c => {
        if (c !== card) c.classList.remove('short-card--menu-open');
      });

      const isVisible = menu.classList.contains('show');
      if (isVisible) {
        menu.classList.remove('show');
        menu.style.display = 'none';
        if (card) card.classList.remove('short-card--menu-open');
      } else {
        menu.classList.add('show');
        menu.style.display = 'block';
        if (card) card.classList.add('short-card--menu-open');

        setTimeout(() => {
          const closeMenuHandler = function (ev) {
            try {
              if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
                menu.classList.remove('show');
                menu.style.display = 'none';
                if (card) card.classList.remove('short-card--menu-open');
                document.removeEventListener('click', closeMenuHandler);
              }
            } catch (e2) {
              try {
                menu.classList.remove('show');
                menu.style.display = 'none';
                if (card) card.classList.remove('short-card--menu-open');
              } catch {
              }
              document.removeEventListener('click', closeMenuHandler);
            }
          };
          document.addEventListener('click', closeMenuHandler);
        }, 0);
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (e3) {
      }

      return;
    }

    // Явное добавление/убирание со стола из меню карточки
    if (e.target.closest('[data-action="toggle-desk-explicit"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="toggle-desk-explicit"]');
      const dictationId = btn ? btn.getAttribute('data-dictation-id') : null;
      const menu = btn ? btn.closest('.short-card-actions-menu') : null;
      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
        const card = menu.closest ? menu.closest('.short-card') : null;
        if (card) card.classList.remove('short-card--menu-open');
      }
      if (dictationId) {
        toggleDictationOnDesk(dictationId);
      }
      return;
    }

    // Кнопка раскрытия/сворачивания раздела
    if (e.target.closest('.structure-item-toggle')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('.structure-item-toggle');
      const sectionId = btn.getAttribute('data-section-id');
      if (!sectionId) return;

      // Book view overlay
      if (btn.closest && btn.closest('#bookViewStructure')) {
        await toggleSectionInContainer(sectionId, document.getElementById('bookViewStructure'));
        return;
      }

      // Default: book view modal
      if (container && container.id === 'bookViewStructure') {
        await toggleSectionInContainer(String(sectionId), container);
        return;
      }
    }

    // Выпадающее меню действий раздела
    if (e.target.closest('[data-action="section-actions"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="section-actions"]');
      const sectionId = btn.getAttribute('data-section-id');
      const menu = document.querySelector(`.section-actions-menu[data-section-id="${sectionId}"]`);

      if (menu) {
        // Закрываем все другие меню
        document.querySelectorAll('.section-actions-menu').forEach(m => {
          if (m !== menu) {
            m.classList.remove('show');
            m.style.display = 'none';
          }
        });
        document.querySelectorAll('.book-actions-menu').forEach(m => {
          m.classList.remove('show');
          m.style.display = 'none';
        });

        const isVisible = menu.classList.contains('show');
        if (isVisible) {
          menu.classList.remove('show');
          menu.style.display = 'none';
        } else {
          menu.classList.add('show');
          menu.style.display = 'block';

          // Закрываем меню при клике вне его
          setTimeout(() => {
            const closeMenuHandler = function (e) {
              if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('show');
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
              }
            };
            document.addEventListener('click', closeMenuHandler);
          }, 0);
        }
      }
    }

    // Обработчики пунктов меню маленькой карточки книги
    if (e.target.closest('.mini-book-actions-menu .dropdown-menu-item')) {
      e.preventDefault();
      e.stopPropagation();
      const item = e.target.closest('.dropdown-menu-item');
      const action = item.getAttribute('data-action');
      const bookId = item.getAttribute('data-book-id');
      const menu = item.closest('.mini-book-actions-menu');

      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
      }

      switch (action) {
        case 'edit-mini-book':
          console.log('✏️ Редактирую книгу из маленькой карточки:', bookId);
          if (bookId) {
            const bookData = await apiRequest(`/library/api/book/${bookId}`);
            if (bookData.success && bookData.book) {
              openBookModal(bookData.book);
            }
          }
          break;
        case 'delete-mini-book':
          console.log('🗑️ Удаляю книгу из маленькой карточки:', bookId);
          if (bookId) {
            const bookData = await apiRequest(`/library/api/book/${bookId}`);
            if (bookData.success && bookData.book) {
              const bookTitle = bookData.book.title || 'книгу';
              if (confirm(`Вы уверены, что хотите удалить книгу "${bookTitle}"?`)) {
                await deleteBook(bookId);
              }
            }
          }
          break;
      }
    }

    // Обработчики пунктов меню раздела
    if (e.target.closest('.section-actions-menu .dropdown-menu-item')) {
      e.preventDefault();
      e.stopPropagation();
      const item = e.target.closest('.dropdown-menu-item');
      const action = item.getAttribute('data-action');
      const sectionId = item.getAttribute('data-section-id');
      const menu = item.closest('.section-actions-menu');

      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
      }

      switch (action) {
        case 'add-subsection':
          console.log('➕ Создаю подраздел для раздела:', sectionId);
          if (sectionId) {
            openSectionModal(null, sectionId);
          }
          break;
        case 'add-dictation':
          console.log('➕ Создаю диктант для раздела:', sectionId);
          if (sectionId) {
            setDictationTargetBook(sectionId);
          }
          window.location.href = '/dictation_editor/new';
          break;
        case 'edit-section':
          console.log('✏️ Редактирую раздел:', sectionId);
          if (activeBookId) {
            loadSectionForEdit(sectionId);
          }
          break;
        case 'delete-section':
          const section = window.currentBookSections?.find(s => s.id === parseInt(sectionId));
          const sectionTitle = section?.title || 'раздел';
          if (confirm(`Вы уверены, что хотите удалить раздел "${sectionTitle}"?`)) {
            deleteSection(sectionId);
          }
          break;
      }
    }

    // Клик на карточку диктанта для добавления/удаления со стола (только в библиотеке, не на столе)
    if (e.target.closest('.short-card[data-action="toggle-desk"]')) {
      const card = e.target.closest('.short-card[data-action="toggle-desk"]');
      // Игнорируем клики на кнопки действий и ссылки
      if (e.target.closest('.short-actions') || e.target.closest('a') || e.target.closest('button')) {
        // Do not handle as toggle-desk, but allow other handlers below (move/delete/etc)
      } else {
        // Игнорируем карточки на столе (они открываются для работы)
        if (card.classList.contains('desk-card')) {
          return;
        }
        // Одиночный клик по диктанту в книге: только визуально выделяем карточку.
        e.preventDefault();
        e.stopPropagation();

        try {
          if (__selectedBookDictationCard && __selectedBookDictationCard !== card) {
            __selectedBookDictationCard.classList.remove('short-card--selected');
          }
          card.classList.add('short-card--selected');
          __selectedBookDictationCard = card;
        } catch (e2) {
        }
        return;
      }
    }

    // Кнопка "Переместить в книгу"
    if (e.target.closest('[data-action="move-dictation"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="move-dictation"]');
      const dictationId = btn.getAttribute('data-dictation-id');
      console.log('🔄 Открываю модальное окно перемещения для диктанта:', dictationId);
      openMoveDictationModal(dictationId);
    }

    if (e.target.closest('[data-action="create-assignment"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="create-assignment"]');
      const dictationId = btn.getAttribute('data-dictation-id');
      if (dictationId) {
        openCreateAssignmentModal(dictationId);
      }
    }

    if (e.target.closest('[data-action="edit-dictation"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="edit-dictation"]');
      const editUrl = btn ? String(btn.getAttribute('data-edit-url') || '').trim() : '';
      if (!editUrl) return;

      const menu = btn.closest('.short-card-actions-menu');
      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
      }

      window.location.href = editUrl;
      return;
    }

    // Удалить (на карточке диктанта)
    if (e.target.closest('[data-action="delete-dictation"]')) {
      const btn = e.target.closest('[data-action="delete-dictation"]');
      const dictationId = btn.getAttribute('data-dictation-id');
      console.log('🗑️ click delete-dictation', {
        dictationId,
        activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
      });
      deleteDictation(dictationId);
    }

    // Кнопка "Убрать со стола" (на карточке на столе)
    if (e.target.closest('[data-action="remove-from-desk"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="remove-from-desk"]');
      const itemId = btn.getAttribute('data-desk-item-id');
      const dictationId = btn.getAttribute('data-dictation-id');
      if (itemId && dictationId) {
        await removeFromDesk(itemId, dictationId);
      }
    }

    if (e.target.closest('[data-action="prefetch-dictation-cache"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="prefetch-dictation-cache"]');
      const dictationId = btn ? btn.getAttribute('data-dictation-id') : '';
      const langOriginal = btn ? btn.getAttribute('data-lang-original') : '';
      const numericId = String(dictationId || '').trim().replace(/^dict_/, '').trim();
      const canonicalCover = numericId ? `/api/dictations_covers/${encodeURIComponent(numericId)}.webp` : '';
      const coverUrl = canonicalCover;
      const rawTranslations = btn ? btn.getAttribute('data-translation-langs') : '';
      const translationLanguages = String(rawTranslations || '')
        .split(',')
        .map(s => String(s || '').trim())
        .filter(Boolean);

      const menu = btn.closest('.short-card-actions-menu');
      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
        const card = menu.closest ? menu.closest('.short-card') : null;
        if (card) card.classList.remove('short-card--menu-open');
      }

      try {
        await prefetchDictationToCache({
          dictationId,
          langOrig: langOriginal,
          translationLanguages,
          coverUrl,
        });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        try {
          showToast(`Не удалось получить в кеш: ${msg}`);
        } catch (e2) {
        }
      }

      try {
        const card = btn && btn.closest ? btn.closest('.short-card') : null;
        if (card) {
          card.classList.add('short-card--cached');

          try {
            const img = card.querySelector ? card.querySelector('img.short-cover') : null;
            if (img) {
              const baseUrl = String(canonicalCover || '').trim();
              if (baseUrl) {
                img.dataset.coverApplied = '1';
                img.dataset.coverUrl = baseUrl;
                img.src = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
              }
            }
          } catch (e) {
          }
        }
        const container = document.getElementById('deskCardsContainer') || document.getElementById('deskContainer') || document;
        await applyCachedDictationCardStyles(container);
      } catch (e) {
      }

      return;
// ...
    }

    if (e.target.closest('[data-action="show-in-book"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="show-in-book"]');
      const dictationId = btn.getAttribute('data-dictation-id');
      if (dictationId) {
        await showDeskDictationInBook(dictationId);
      }
    }

    // Кнопка "Добавить диктант" в разделе (старый обработчик, оставляем для совместимости)
    if (e.target.closest('[data-action="add-dictation"]:not(.dropdown-menu-item)')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="add-dictation"]');
      const sectionId = btn.getAttribute('data-section-id');
      console.log('➕ Создаю новый диктант для раздела:', sectionId);
      // Сохраняем целевой раздел (он же книга-узел) и открываем редактор
      if (sectionId) {
        setDictationTargetBook(sectionId);
      } else if (activeBookId) {
        setDictationTargetBook(activeBookId);
      }
      window.location.href = '/dictation_editor/new';
    }

    // Кнопка "Редактировать раздел" (старый обработчик, оставляем для совместимости)
    if (e.target.closest('[data-action="edit-section"]:not(.dropdown-menu-item)')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="edit-section"]');
      const sectionId = btn.getAttribute('data-section-id');
      console.log('✏️ Редактирую раздел:', sectionId);

      // Находим данные раздела из списка разделов
      if (activeBookId) {
        loadSectionForEdit(sectionId);
      }
    }
  });

  // Модальное окно перемещения диктанта
  const moveDictationCloseBtn = document.getElementById("move-dictation-close");
  if (moveDictationCloseBtn) {
    moveDictationCloseBtn.addEventListener("click", closeMoveDictationModal);
  }

  const moveDictationForm = document.getElementById("move-dictation-form");
  if (moveDictationForm) {
    moveDictationForm.addEventListener("submit", handleMoveDictation);
  }

  const moveDictationModal = document.getElementById("move-dictation-modal");
  if (moveDictationModal) {
    moveDictationModal.addEventListener("click", (event) => {
      if (event.target === moveDictationModal) {
        closeMoveDictationModal();
      }
    });
  }

  const deleteDictationModal = document.getElementById('delete-dictation-modal');
  const deleteDictationCloseBtn = document.getElementById('delete-dictation-close');
  const deleteDictationConfirmBtn = document.getElementById('delete-dictation-confirm');
  console.log('🗑️ delete modal bind', {
    hasModal: !!deleteDictationModal,
    hasCloseBtn: !!deleteDictationCloseBtn,
    hasConfirmBtn: !!deleteDictationConfirmBtn
  });
  if (deleteDictationCloseBtn) {
    deleteDictationCloseBtn.addEventListener('click', closeDeleteDictationModal);
  }
  if (deleteDictationConfirmBtn) {
    deleteDictationConfirmBtn.addEventListener('click', async () => {
      const id = pendingDeleteDictationId;
      console.log('🗑️ delete confirm click', {
        pendingDeleteDictationId: id,
        activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
      });
      if (!id) return;
      await performDeleteDictation(id);
    });
  }
  if (deleteDictationModal) {
    deleteDictationModal.addEventListener('click', (event) => {
      if (event.target === deleteDictationModal) {
        closeDeleteDictationModal();
      }
    });
  }
}

// ==================== Перемещение диктанта ====================

function openMoveDictationModal(dictationId) {
  console.log('📖 openMoveDictationModal вызвана для диктанта:', dictationId);
  const modal = document.getElementById("move-dictation-modal");
  const dictIdInput = document.getElementById("move-dictation-id");
  const bookSelect = document.getElementById("move-target-book");
  const sectionsContainer = document.getElementById("move-dictation-sections-container");
  const sectionsList = document.getElementById("move-dictation-sections-list");
  const sectionInput = document.getElementById("move-target-section");

  console.log('Элементы модального окна:', { modal, dictIdInput, bookSelect });

  if (!modal || !dictIdInput || !bookSelect) {
    console.error('❌ Не найдены элементы модального окна!');
    return;
  }

  // Сохраняем ID диктанта
  dictIdInput.value = dictationId;
  if (sectionInput) sectionInput.value = '';

  // Скрываем контейнер разделов
  if (sectionsContainer) sectionsContainer.style.display = 'none';
  if (sectionsList) sectionsList.innerHTML = '';

  // Загружаем список книг (кроме рабочей тетради)
  const booksList = document.getElementById("booksList");
  if (booksList) {
    const bookCards = booksList.querySelectorAll('.book-card-mini');
    bookSelect.innerHTML = '<option value="">-- Выберите книгу --</option>';

    bookCards.forEach(card => {
      const bookId = card.getAttribute('data-book-id');
      const bookTitle = card.querySelector('.book-card-mini-title')?.textContent || 'Без названия';
      const isWorkbook = bookTitle === 'Рабочая тетрадь';

      if (!isWorkbook && bookId) {
        const option = document.createElement('option');
        option.value = bookId;
        option.textContent = bookTitle;
        bookSelect.appendChild(option);
      }
    });
  }

  // Обработчик изменения выбора книги
  bookSelect.onchange = async function () {
    const selectedBookId = this.value;
    const selectedBookIdInt = parseInt(selectedBookId);
    console.log('📖 Выбрана книга, ID:', selectedBookId, 'как число:', selectedBookIdInt);

    if (sectionInput) sectionInput.value = '';

    if (!selectedBookId) {
      if (sectionsContainer) sectionsContainer.style.display = 'none';
      if (sectionsList) sectionsList.innerHTML = '';
      return;
    }

    // Загружаем разделы книги
    try {
      const token = getToken();
      console.log('🔍 Запрашиваю разделы для книги:', selectedBookIdInt);
      const response = await fetch(`/library/api/book/${selectedBookIdInt}/sections`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('❌ Ошибка ответа сервера:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Текст ошибки:', errorText);
      }

      const data = await response.json();

      console.log('📚 Загружены разделы:', data);
      console.log('📚 Количество разделов:', data.sections ? data.sections.length : 0);
      console.log('📚 ID выбранной книги:', selectedBookId);
      if (data.sections && data.sections.length > 0) {
        console.log('📚 Все разделы:', data.sections);
        data.sections.forEach((s, idx) => {
          console.log(`  Раздел ${idx}: id=${s.id}, title=${s.title}, parent_id=${s.parent_id}, bookId=${selectedBookId}`);
        });
      }

      if (data.success && data.sections && data.sections.length > 0) {
        // Показываем контейнер разделов и рендерим дерево
        if (sectionsContainer) {
          sectionsContainer.style.display = 'block';
          console.log('✅ Показываю контейнер разделов');
        }
        if (sectionsList) {
          sectionsList.innerHTML = '';
          console.log('🌳 Рендерю дерево разделов, количество:', data.sections.length);
          // Передаем bookId как parentId для первого уровня (используем число)
          renderSectionsTree(data.sections, sectionsList, selectedBookIdInt, selectedBookIdInt, 0);
          // Обновляем иконки Lucide после рендеринга
          setTimeout(() => {
            if (window.lucide) {
              lucide.createIcons();
            }
            console.log('📋 Элементов в списке разделов:', sectionsList.children.length);
          }, 100);
        }
      } else {
        // Нет разделов - скрываем контейнер
        console.log('ℹ️ Разделов нет, скрываю контейнер. data.success:', data.success, 'sections:', data.sections);
        if (sectionsContainer) sectionsContainer.style.display = 'none';
        if (sectionsList) sectionsList.innerHTML = '';
      }
    } catch (error) {
      console.error('Ошибка загрузки разделов:', error);
      if (sectionsContainer) sectionsContainer.style.display = 'none';
    }
  };

  // Показываем модальное окно
  console.log('📋 Книг в списке:', bookSelect.options.length);
  console.log('🎭 Показываю модальное окно...');
  modal.classList.add('show');
  modal.style.display = 'flex';
  console.log('✅ Модальное окно должно быть видно. Стили:', {
    display: modal.style.display,
    classList: Array.from(modal.classList)
  });
}

function renderSectionsTree(sections, container, bookId, parentId = null, level = 0) {
  console.log(`🌳 renderSectionsTree вызвана: level=${level}, parentId=${parentId}, bookId=${bookId}, sections.length=${sections.length}`);

  // Фильтруем разделы по родителю
  const filteredSections = sections.filter(s => {
    // Для первого уровня (level 0) показываем разделы с parent_id === bookId
    if (level === 0 && parentId === bookId) {
      // Приводим к числам для сравнения
      const sectionParentId = parseInt(s.parent_id);
      const bookIdNum = parseInt(bookId);
      const matches = sectionParentId === bookIdNum;
      console.log(`  Проверка уровня 0: раздел "${s.title}" parent_id=${s.parent_id} (${sectionParentId}) === bookId=${bookId} (${bookIdNum})? ${matches}`);
      return matches;
    }
    // Для остальных уровней фильтруем по parentId
    if (parentId === null) {
      return !s.parent_id || s.parent_id === null;
    }
    const sectionParentId = parseInt(s.parent_id);
    const parentIdNum = parseInt(parentId);
    const matches = sectionParentId === parentIdNum;
    console.log(`  Проверка уровня ${level}: раздел "${s.title}" parent_id=${s.parent_id} (${sectionParentId}) === parentId=${parentId} (${parentIdNum})? ${matches}`);
    return matches;
  });

  console.log(`🌳 renderSectionsTree: level=${level}, parentId=${parentId}, filtered=${filteredSections.length}`);
  if (filteredSections.length === 0) {
    console.warn('⚠️ Нет разделов после фильтрации!');
  }

  // Сортируем по order_index
  filteredSections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  filteredSections.forEach(section => {
    console.log(`  📄 Рендерю раздел: ${section.title} (id=${section.id}, parent_id=${section.parent_id})`);
    const hasChildren = sections.some(s => s.parent_id === section.id);

    const item = document.createElement('div');
    item.className = 'move-dictation-section-item';
    item.setAttribute('data-level', level);
    item.setAttribute('data-section-id', section.id);
    item.setAttribute('data-book-id', bookId);

    item.innerHTML = `
        ${hasChildren ? `
          <div class="move-dictation-section-toggle" data-section-id="${section.id}">
            <i data-lucide="chevron-right"></i>
          </div>
        ` : '<div style="width: 20px;"></div>'}
        <span class="move-dictation-section-title">${section.title || 'Без названия'}</span>
      `;

    // Обработчик клика на раздел
    item.addEventListener('click', (e) => {
      if (e.target.closest('.move-dictation-section-toggle')) {
        e.stopPropagation();
        toggleSectionChildren(section.id, item);
        return;
      }

      // Выбираем раздел
      document.querySelectorAll('.move-dictation-section-item').forEach(el => {
        el.classList.remove('selected');
      });
      item.classList.add('selected');

      const sectionInput = document.getElementById("move-target-section");
      if (sectionInput) {
        sectionInput.value = section.id;
      }
    });

    container.appendChild(item);
    console.log(`  ✅ Раздел добавлен в DOM: ${section.title}`);

    // Если есть дети, создаем контейнер для них
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'move-dictation-section-children';
      childrenContainer.setAttribute('data-parent-id', section.id);
      container.appendChild(childrenContainer);

      // Рекурсивно рендерим детей
      renderSectionsTree(sections, childrenContainer, bookId, section.id, level + 1);
    }
  });

  // Инициализируем иконки Lucide после рендеринга всех элементов уровня
  if (window.lucide && filteredSections.length > 0) {
    setTimeout(() => {
      lucide.createIcons();
      console.log(`  🎨 Иконки Lucide обновлены для уровня ${level}`);
    }, 0);
  }
}

function toggleSectionChildren(sectionId, itemElement) {
  const toggle = itemElement.querySelector('.move-dictation-section-toggle');
  const childrenContainer = itemElement.nextElementSibling;

  if (!childrenContainer || !childrenContainer.classList.contains('move-dictation-section-children')) {
    return;
  }

  const isExpanded = childrenContainer.classList.contains('expanded');

  if (isExpanded) {
    childrenContainer.classList.remove('expanded');
    toggle.classList.remove('expanded');
  } else {
    childrenContainer.classList.add('expanded');
    toggle.classList.add('expanded');
  }

  // Обновляем иконки
  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeMoveDictationModal() {
  const modal = document.getElementById("move-dictation-modal");
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
    // Очищаем форму
    const form = document.getElementById("move-dictation-form");
    if (form) form.reset();

    // Очищаем контейнер разделов
    const sectionsContainer = document.getElementById("move-dictation-sections-container");
    const sectionsList = document.getElementById("move-dictation-sections-list");
    if (sectionsContainer) sectionsContainer.style.display = 'none';
    if (sectionsList) sectionsList.innerHTML = '';

    // Снимаем выделение с разделов
    document.querySelectorAll('.move-dictation-section-item').forEach(el => {
      el.classList.remove('selected');
    });
  }
}

async function handleMoveDictation(e) {
  e.preventDefault();

  const dictationId = document.getElementById("move-dictation-id").value;
  const bookId = document.getElementById("move-target-book").value;
  const sectionId = document.getElementById("move-target-section")?.value || null;
  const sectionsContainer = document.getElementById("move-dictation-sections-container");

  if (!dictationId || !bookId) {
    showToast("Выберите книгу", "error");
    return;
  }

  // Если есть разделы и контейнер виден, но раздел не выбран - можно переместить в саму книгу
  // Используем раздел, если выбран, иначе саму книгу
  const targetId = sectionId || bookId;

  try {
    const token = getToken();
    const response = await fetch(`/library/api/dictation/${dictationId}/move-to-book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ book_id: parseInt(targetId) })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast("Диктант перемещён");
      closeMoveDictationModal();

      // Определяем ID целевой книги (если выбран раздел, это родительская книга)
      const targetBookIdNum = parseInt(bookId);

      // Перезагружаем активную книгу, если она открыта
      if (activeBookId) {
        const currentBookId = parseInt(activeBookId);

        // Определяем, является ли текущая открытая книга рабочей тетрадью
        const bookCards = document.querySelectorAll('.book-card-mini');
        let isCurrentWorkbook = false;
        bookCards.forEach(card => {
          if (parseInt(card.getAttribute('data-book-id')) === currentBookId) {
            const title = card.querySelector('.book-card-mini-title')?.textContent;
            if (title === 'Рабочая тетрадь') {
              isCurrentWorkbook = true;
            }
          }
        });

        // Если открыта рабочая тетрадь - обновляем её (диктант оттуда ушёл)
        if (isCurrentWorkbook) {
          await loadActiveBook(currentBookId, true);
        }
        // Если открыта целевая книга - обновляем её (диктант туда пришёл)
        else if (currentBookId === targetBookIdNum) {
          await loadActiveBook(currentBookId, false);

          // Если диктант перемещён в раздел, и этот раздел открыт - обновляем его
          if (sectionId) {
            const sectionContent = document.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
            if (sectionContent && sectionContent.style.display !== 'none') {
              await loadSectionDictations(sectionId, sectionContent);
            }
          }
        }
      }
    } else {
      showToast(data.error || "Ошибка при перемещении", "error");
    }
  } catch (error) {
    console.error("Ошибка перемещения диктанта:", error);
    showToast("Ошибка при перемещении", "error");
  }
}

// ==================== Удаление диктанта ====================

async function deleteBook(bookId) {
  try {
    const data = await apiRequest(`/library/api/book/${bookId}`, {
      method: "DELETE",
    });

    if (data.success) {
      showToast("Книга удалена");
      // Перезагружаем список книг
      await loadBooksFromAPI();
      if (String(bookViewActiveBookId || '') === String(bookId || '') || String(activeBookId || '') === String(bookId || '')) {
        closeBookViewModal();
      }
    } else {
      showToast(data.error || "Ошибка при удалении книги", "error");
    }
  } catch (error) {
    console.error("Ошибка удаления книги:", error);
    showToast("Ошибка при удалении книги", "error");
  }
}

async function deleteSection(sectionId) {
  try {
    const data = await apiRequest(`/library/api/book/${sectionId}`, {
      method: "DELETE",
    });

    if (data.success) {
      showToast("Раздел удалён");
      // Перезагружаем активную книгу
      if (activeBookId) {
        await loadActiveBook(activeBookId);
      }
    } else {
      showToast(data.error || "Ошибка при удалении раздела", "error");
    }
  } catch (error) {
    console.error("Ошибка удаления раздела:", error);
    showToast("Ошибка при удалении раздела", "error");
  }
}

async function deleteDictation(dictationId) {
  console.log('🗑️ deleteDictation()', { dictationId });
  openDeleteDictationModal(dictationId);
}

function openDeleteDictationModal(dictationId) {
  const modal = document.getElementById('delete-dictation-modal');
  if (!modal) {
    console.warn('🗑️ openDeleteDictationModal: modal not found');
    return;
  }
  pendingDeleteDictationId = String(dictationId || '');
  pendingDeleteSectionId = null;

  console.log('🗑️ openDeleteDictationModal', {
    dictationId: pendingDeleteDictationId,
    activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
  });

  const nameEl = document.getElementById('delete-dictation-name');
  const deskWarnEl = document.getElementById('delete-dictation-desk-warning');
  try {
    const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(dictationId))}"]`);
    const title = card ? (card.querySelector('.short-title')?.textContent || '') : '';
    if (nameEl) {
      nameEl.textContent = title ? `«${title.trim()}»` : '';
    }

    // If delete was triggered from a section (paragraph) view, remember that sectionId.
    // Otherwise we fall back to activeBookId.
    try {
      const sectionContent = card ? card.closest('.structure-item-content[data-section-content-id]') : null;
      const sectionIdAttr = sectionContent ? sectionContent.getAttribute('data-section-content-id') : '';
      const sectionIdNum = sectionIdAttr ? parseInt(String(sectionIdAttr), 10) : NaN;
      if (sectionIdNum && isFinite(sectionIdNum) && sectionIdNum > 0) {
        pendingDeleteSectionId = String(sectionIdNum);
      }
    } catch (e2) {
      pendingDeleteSectionId = null;
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = '';
  }

  try {
    const isOnDesk = typeof isDictationOnDesk === 'function' ? !!isDictationOnDesk(String(dictationId)) : false;
    if (deskWarnEl) {
      if (isOnDesk) {
        deskWarnEl.style.display = 'block';
        deskWarnEl.textContent = 'Внимание: диктант лежит на рабочем столе. При удалении он будет убран и со стола.';
      } else {
        deskWarnEl.style.display = 'none';
        deskWarnEl.textContent = '';
      }
    }
  } catch (e) {
    if (deskWarnEl) {
      deskWarnEl.style.display = 'none';
      deskWarnEl.textContent = '';
    }
  }

  console.log('🗑️ delete modal show', {
    displayBefore: modal.style.display,
    classBefore: modal.className,
    hasNameEl: !!nameEl,
    nameText: nameEl ? nameEl.textContent : null
  });

  modal.style.display = 'flex';
  modal.classList.add('show');
  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeDeleteDictationModal() {
  const modal = document.getElementById('delete-dictation-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.style.display = 'none';
  pendingDeleteDictationId = null;
  pendingDeleteSectionId = null;
}

async function performDeleteDictation(dictationId) {
  try {
    const idStr = String(dictationId || '');
    if (!idStr) return;

    console.log('🗑️ performDeleteDictation start', {
      dictationId: idStr,
      activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
    });

    const dictIdStr = `dict_${idStr}`;
    const deleteUrl = `/api/dictations/${encodeURIComponent(dictIdStr)}`;
    console.log('🗑️ global delete request', { url: deleteUrl, dictationId: dictIdStr });
    const token = getToken();
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      cache: 'no-store'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    console.log('🗑️ global delete response', {
      status: response.status,
      ok: response.ok,
      data
    });

    if (response.ok && data && data.success) {
      closeDeleteDictationModal();
      showToast('Диктант удалён');

      try {
        await swRequest('purgeDictation', { dictationId: idStr, timeoutMs: 60000 });
      } catch (e) {
      }

      try {
        await idbDeleteDictationCache(`dict_${idStr}`);
      } catch (e) {
      }

      try {
        const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(idStr))}"]`);
        if (card) {
          card.remove();
        }
      } catch (e) {
      }

      // If dictation is on desk, remove it from desk list as well.
      try {
        const itemId = typeof getDeskItemId === 'function' ? getDeskItemId(idStr) : null;
        if (itemId) {
          await removeFromDesk(itemId, idStr);
        }
      } catch (e) {
      }

      if (activeBookId) {
        try {
          await loadActiveBook(activeBookId, activeBookIsWorkbook);
        } catch (e) {
        }
      }
    } else {
      showToast((data && data.error) ? data.error : 'Ошибка при удалении', 'error');
    }
  } catch (error) {
    console.error('Ошибка удаления диктанта:', error);
    showToast('Ошибка при удалении', 'error');
  }
}

// ==================== Статистика и медальки диктантов ====================

// Загрузка статистики диктанта (звезды, полузвезды, микрофон)
async function getDictationStats(dictationId) {
  if (!dictationId) {
    return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
  }

  const loadDraftStatistics = async (dictationId) => {
    try {
      const userId = getDraftUserIdForKey();
      const rawId = dictationId ? String(dictationId) : '';
      if (!rawId) return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };

      const numericId = parseInt(rawId.replace(/^dict_/, ''), 10);
      const variants = [];
      variants.push(rawId);
      if (!rawId.startsWith('dict_')) variants.push(`dict_${rawId}`);
      if (Number.isFinite(numericId)) {
        variants.push(String(numericId));
        variants.push(`dict_${numericId}`);
      }

      const tried = new Set();
      for (const v of variants) {
        if (!v) continue;
        const k = `${userId}:${v}`;
        if (tried.has(k)) continue;
        tried.add(k);
        const local = await idbGet('drafts', k);
        const state = local && local.state ? local.state : null;
        if (state) {
          const draftStats = computeDraftStatistics(state);
          draftStats.hasDraft = true;
          return draftStats;
        }
      }
    } catch (error) {
      console.warn('Ошибка загрузки статистики диктанта:', dictationId, error);
    }

    return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
  };

  return loadDraftStatistics(dictationId);
}

// Вычисление статистики из состояния диктанта
function computeDraftStatistics(state) {
  const perSentence = state.per_sentence || {};
  let perfect = 0;
  let corrected = 0;
  let audio = 0;

  const toNumber = (value) => Number(value) || 0;

  const values = Object.values(perSentence);
  if (values.length) {
    values.forEach(sentence => {
      perfect += toNumber(sentence.number_of_perfect);
      corrected += toNumber(sentence.number_of_corrected);
      audio += toNumber(sentence.number_of_audio);
    });
  } else {
    // fallback (если черновик сохранён без per_sentence)
    perfect = toNumber(state.number_of_perfect);
    corrected = toNumber(state.number_of_corrected);
    audio = toNumber(state.number_of_audio);
  }

  return {
    perfect,
    corrected,
    audio,
    hasDraft: false
  };
}

// Обновление статистики для всех карточек диктантов
async function updateDictationCardsStats(container = null) {
  const targetContainer = container || document;
  const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');

  cards.forEach(async (card) => {
    const dictationId = card.dataset.dictationId;
    if (!dictationId) return;

    const statsContainer = card.querySelector('.short-stats[data-dictation-id]');
    if (!statsContainer) return;

    const stats = await getDictationStats(dictationId);
    renderStatsIcons(statsContainer, stats);
  });
}

// Рендеринг иконок статистики
function renderStatsIcons(container, stats = {}) {
  const metrics = [
    {
      className: 'stat-icon stat-icon-perfect',
      icon: 'star',
      value: Number(stats.perfect) || 0,
      title: 'Звезд'
    },
    {
      className: 'stat-icon stat-icon-corrected',
      icon: 'star-half',
      value: Number(stats.corrected) || 0,
      title: 'Полузвезд'
    },
    {
      className: 'stat-icon stat-icon-audio',
      icon: 'mic',
      value: Number(stats.audio) || 0,
      title: 'Аудио'
    }
  ];

  const hasProgress = metrics.some(metric => metric.value > 0);

  if (!hasProgress) {
    container.innerHTML = '<div class="stats-placeholder"></div>';
    return;
  }

  container.innerHTML = '';
  const statsIcons = document.createElement('div');
  statsIcons.className = 'stats-icons';

  metrics.forEach(metric => {
    const el = document.createElement('div');
    el.className = metric.className;
    el.title = `${metric.title}: ${metric.value}`;
    el.innerHTML = `<i data-lucide="${metric.icon}"></i><span>${metric.value}</span>`;
    statsIcons.appendChild(el);
  });

  container.appendChild(statsIcons);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

async function refreshCompletionBadgesFromServer(container = null) {
  const targetContainer = container || document;
  try {
    await loadCompletionCounts(targetContainer, { forceNetwork: true });
  } catch (e) {
  }
  try {
    await updateCompletionBadges(targetContainer);
  } catch (e) {
  }
}

// Кеш для количества выполнений
let completionCountsCache = {};

let completionCountsLoadedFromIdb = false;

// Загрузка количества выполнений из БД
async function loadCompletionCounts(container = null, options = {}) {
  const targetContainer = container || document;
  const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');
  if (cards.length === 0) {
    return;
  }

  const forceNetwork = !!(options && options.forceNetwork);

  // Собираем все ID диктантов
  const dictationIds = Array.from(cards)
    .map(card => card.dataset.dictationId)
    .filter(id => id);

  if (dictationIds.length === 0) {
    return;
  }

  if (!completionCountsLoadedFromIdb) {
    completionCountsLoadedFromIdb = true;
    try {
      const cached = await idbGet('desk_items', 'completion_counts');
      if (cached && cached.counts && typeof cached.counts === 'object') {
        Object.assign(completionCountsCache, cached.counts);
      }
    } catch (e) {
    }
  }

  const hasCachedCount = (dictationId) => {
    if (!dictationId) return false;
    const formats = [
      dictationId,
      `dict_${dictationId}`,
      String(dictationId),
      `dict_${String(dictationId)}`,
    ];
    for (const key of formats) {
      if (completionCountsCache[key] !== undefined) {
        return true;
      }
    }
    return false;
  };

  const missingIds = dictationIds.filter(id => !hasCachedCount(id));
  const requestIds = forceNetwork ? dictationIds : missingIds;
  if (!forceNetwork && missingIds.length === 0) {
    return;
  }

  // Получаем токен
  const token = window.UM?.token || localStorage.getItem('jwt_token');
  if (!token) {
    console.warn('[loadCompletionCounts] Нет токена, пропускаем загрузку');
    return;
  }

  try {
    const response = await fetch('/api/statistics/success/count', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dictation_ids: requestIds })
    });

    if (response.ok) {
      const result = await response.json();
      // Обновляем кеш, добавляя новые данные (не заменяя полностью)
      if (result.counts) {
        Object.assign(completionCountsCache, result.counts);
        try {
          await idbPut('desk_items', { key: 'completion_counts', updatedAt: Date.now(), counts: completionCountsCache });
        } catch (e) {
        }
      }
    } else {
      console.error('[loadCompletionCounts] Ошибка загрузки:', await response.text());
    }
  } catch (error) {
    console.error('[loadCompletionCounts] Ошибка при загрузке:', error);
  }
}

// Подсчет выполнений для конкретного диктанта
function countDictationCompletions(dictationId) {
  if (!dictationId) return 0;

  // Пробуем разные форматы ключа
  const formats = [
    dictationId,
    `dict_${dictationId}`,
    String(dictationId),
    `dict_${String(dictationId)}`
  ];

  for (const key of formats) {
    if (completionCountsCache[key] !== undefined) {
      return completionCountsCache[key];
    }
  }

  return 0;
}

// Обновление медалек на всех карточках
async function updateCompletionBadges(container = null) {
  const targetContainer = container || document;
  const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');

  if (cards.length === 0) {
    return;
  }

  // Всегда загружаем данные из БД для всех карточек в контейнере
  // Это гарантирует, что медальки появятся даже для старых диктантов
  await loadCompletionCounts(targetContainer);

  cards.forEach(card => {
    const dictationId = card.dataset.dictationId;
    if (!dictationId) return;

    const completionCount = countDictationCompletions(dictationId);
    let badge = card.querySelector('.short-completion-badge');

    if (completionCount > 0) {
      if (!badge) {
        // Создаем новую медальку
        badge = document.createElement('div');
        badge.className = 'short-completion-badge';
        badge.dataset.dictationId = dictationId;
        card.appendChild(badge);

        // Добавляем обработчик клика
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const clickedDictationId = e.currentTarget.dataset.dictationId;
          if (clickedDictationId && typeof DictationsReport !== 'undefined') {
            await DictationsReport.open(clickedDictationId);
          }
        });
      }
      badge.title = `Выполнено полностью (весь диктант): ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`;
      badge.setAttribute('aria-label', `Выполнено полностью (весь диктант): ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`);
      badge.innerHTML = `<i data-lucide="award"></i><span class="completion-count">${completionCount}</span>`;
    } else if (badge) {
      // Удаляем медальку, если выполнений нет
      badge.remove();
    }
  });

  // Обновить иконки Lucide
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==================== Модальное окно публичной библиотеки ====================

async function openPublicLibraryModal() {
  const modal = document.getElementById("public-library-modal");
  if (!modal) return;

  modal.style.display = "flex";

  initializePublicBooksLanguageSelector();

  // Загружаем публичные книги
  if (Array.isArray(publicBooks) && publicBooks.length > 0 && (Date.now() - publicBooksLoadedAt) < 5 * 60 * 1000) {
    renderPublicBooksList();
  } else {
    await loadPublicBooks();
  }

  // Обновляем иконки Lucide
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

function closePublicLibraryModal() {
  const modal = document.getElementById("public-library-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

let publicBooks = []; // Список публичных книг
let publicBooksLoadedAt = 0;

function initializePublicBooksLanguageSelector() {
  try {
    const container = document.getElementById('publicBooksLanguageSelector');
    if (!container) return;

    container.innerHTML = '';

    const userSettings = window.USER_LANGUAGE_DATA;
    if (!userSettings) return;

    const baseLanguageData = window.LanguageManager.getLanguageData();
    const languageData = {
      all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
      ...(baseLanguageData || {})
    };

    if (typeof window.initLanguageSelector === 'function') {
      const options = {
        mode: 'learning-selector-compact',
        currentLearning: (currentPublicBooksFilterLanguage != null ? currentPublicBooksFilterLanguage : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
        learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
        languageData,
        onLanguageChange: function (values) {
          const v = values && values.currentLearning ? String(values.currentLearning) : '';
          currentPublicBooksFilterLanguage = v || 'all';
          renderPublicBooksList();
        }
      };

      publicBooksLanguageSelectorInstance = window.initLanguageSelector('publicBooksLanguageSelector', options);
      if (!currentPublicBooksFilterLanguage) {
        const v = String(options.currentLearning || '');
        currentPublicBooksFilterLanguage = v || 'all';
      }
    }
  } catch (e) {
  }
}

function renderPublicBooksList() {
  const list = document.getElementById('publicBooksList');
  if (!list) return;

  const rawFilterLang = currentPublicBooksFilterLanguage
    || window.USER_LANGUAGE_DATA?.currentLearning
    || null;
  const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

  const normalizeBookLang = (b) => {
    if (!b) return '';
    return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
  };

  const items = filterLang
    ? publicBooks.filter(b => {
      const lang = normalizeBookLang(b);
      return !lang || lang === String(filterLang).toLowerCase();
    })
    : publicBooks;

  if (!items.length) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Публичных книг пока нет</div>';
    return;
  }

  list.innerHTML = items.map(book => createMiniBookCard(book)).join('');
  hydrateMiniBookCardImages(list);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  list.querySelectorAll('.book-card-mini').forEach(card => {
    const bookId = parseInt(card.getAttribute('data-book-id'));
    const book = items.find(b => b.id === bookId) || publicBooks.find(b => b.id === bookId);

    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveBook(bookId, list);
    });

    card.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        setActiveBook(bookId, list);
        await openBookViewBook(bookId, !!(book && book.is_workbook));
      } catch (e2) {
      }
    });
  });
}

async function loadPublicBooks() {
  const list = document.getElementById("publicBooksList");
  if (!list) return;

  try {
    list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';

    const data = await apiRequest("/library/api/public-books?limit=200");
    if (data.success && data.books) {
      publicBooks = data.books;
      publicBooksLoadedAt = Date.now();
      console.log('📚 Загружены публичные книги:', data.books.length);
      if (data.books.length > 0) {
        console.log('📚 Первая книга:', {
          id: data.books[0].id,
          creator_user_id: data.books[0].creator_user_id,
          creator_username: data.books[0].creator_username
        });
      }

      if (!currentPublicBooksFilterLanguage) {
        currentPublicBooksFilterLanguage = window.USER_LANGUAGE_DATA?.currentLearning || null;
      }

      renderPublicBooksList();
    } else {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
    }
  } catch (error) {
    console.error("Ошибка загрузки публичных книг:", error);
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
  }
}

async function addPublicBookToShelf(bookId) {
  try {
    const data = await apiRequest(`/library/api/book/${bookId}/add-to-my`, {
      method: "POST",
      body: JSON.stringify({})
    });

    if (data.success) {
      // Закрываем модальное окно публичной библиотеки
      closePublicLibraryModal();
      // Обновляем список книг
      await loadBooksFromAPI();
      try {
        setActiveBook(bookId);
        await openBookViewBook(bookId);
      } catch (e) {
      }
      showToast('Книга добавлена на вашу полку');
    } else {
      showToast('Ошибка при добавлении книги на полку', 'error');
    }
  } catch (error) {
    console.error("Ошибка добавления книги на полку:", error);
    showToast('Ошибка при добавлении книги на полку');
  }
}

// Инициализация селектора языка для панели "Мои книги"
function initializeBooksLanguageSelector() {
  try {
    const container = document.getElementById('booksLanguageSelector');
    if (!container) {
      console.warn('⚠️ Контейнер booksLanguageSelector не найден, повторная попытка через 100ms');
      setTimeout(initializeBooksLanguageSelector, 100);
      return;
    }

    container.innerHTML = '';

    const userSettings = window.USER_LANGUAGE_DATA;

    if (!userSettings) {
      console.warn('⚠️ USER_LANGUAGE_DATA не загружен');
      return;
    }

    if (typeof window.initLanguageSelector === 'function') {
      const baseLanguageData = window.LanguageManager.getLanguageData();
      const languageData = {
        all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
        ...(baseLanguageData || {})
      };
      const options = {
        mode: 'learning-selector-compact',
        currentLearning: (currentBooksFilterLanguage != null ? currentBooksFilterLanguage : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
        learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
        languageData,
        onLanguageChange: function (values) {
          console.log('🔄 Изменение языка изучения в панели "Мои книги":', values);
          const v = values && values.currentLearning ? String(values.currentLearning) : '';
          currentBooksFilterLanguage = v || 'all';
          renderBooksList(lastOwnBooks, lastShelfBooks);
        }
      };

      console.log('🎯 Создаем LanguageSelector для панели "Мои книги"');
      booksLanguageSelectorInstance = window.initLanguageSelector('booksLanguageSelector', options);

      if (!currentBooksFilterLanguage) {
        const v = String(options.currentLearning || '');
        currentBooksFilterLanguage = v || 'all';
      }

      if (booksLanguageSelectorInstance) {
        console.log('✅ Селектор языка успешно инициализирован');
      } else {
        console.warn('❌ LanguageSelector не был создан');
      }
    } else {
      console.warn('❌ Функция initLanguageSelector не найдена');
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации языкового селектора:', error);
  }
}

// Функция для загрузки данных после авторизации
let __initialDeskLoadTriggered = false;
let __initialBooksLoadTriggered = false;
let __autoOpenTodayPlanChecked = false;

function _hasUnfinishedTodayHomework(items) {
  try {
    const rows = Array.isArray(items) ? items : [];
    for (const a of rows) {
      try {
        const req = Number(a && (a.required_completions ?? a.count ?? 1)) || 0;
        const done = Number(a && (a.done ?? a.successes_done ?? 0)) || 0;
        if ((req > 0 && done < req) || (req === 0 && done === 0)) {
          return true;
        }
      } catch (e) {
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function _autoOpenTodayPlanIfNeeded() {
  if (__autoOpenTodayPlanChecked) return;
  __autoOpenTodayPlanChecked = true;

  try {
    if (!window.UM || typeof window.UM.isAuthenticated !== 'function') return;
    if (!window.UM.isAuthenticated()) return;
  } catch (e) {
    return;
  }

  const today = (typeof getTodayIsoDate === 'function') ? getTodayIsoDate() : '';
  if (!today) return;

  const panel = document.getElementById('student-plan-panel');
  if (panel && panel.style && panel.style.display && panel.style.display !== 'none') return;

  // 1) Fast path: check cached assignments for today (if any)
  try {
    const cached = await _getStudentPlanCacheForDateIdb(today);
    if (cached && Array.isArray(cached.assignments) && _hasUnfinishedTodayHomework(cached.assignments)) {
      openStudentPlanPanel(today);
      return;
    }
  } catch (e) {
  }

  // 2) Network verification: open if API says there is unfinished homework
  try {
    const res = await apiRequest(`/api/assignments/student/my?date=${encodeURIComponent(today)}`, { method: 'GET' });
    if (res && res.success) {
      const items = Array.isArray(res.assignments) ? res.assignments : [];
      if (_hasUnfinishedTodayHomework(items)) {
        openStudentPlanPanel(today);
      }
    }
  } catch (e) {
  }
}

function triggerDeskLoadOnce() {
  if (__initialDeskLoadTriggered) return;
  try {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('jwt_token') : null;
    if (!token) {
      return;
    }
  } catch (e) {
    return;
  }
  __initialDeskLoadTriggered = true;
  try {
    const p = loadDeskItems();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { });
    }
  } catch (e) {
  }
}

function triggerBooksLoadOnce() {
  if (__initialBooksLoadTriggered) return;
  __initialBooksLoadTriggered = true;
  loadBooksFromAPI();
}

function loadLibraryData() {
  refreshOfflineCacheStatus();
  triggerDeskLoadOnce();
  triggerBooksLoadOnce();
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (window.I18n && typeof window.I18n.ensureLoaded === 'function') {
      await window.I18n.ensureLoaded();
    }
  } catch (e) {
  }

  try {
    applyPrivateLibraryTranslations();
  } catch (e) {
  }

  installEventHandlers();

  try {
    setupUserDropdownMenu();
  } catch (e) {
  }

  try {
    installUserMenuReportsClickFallback();
  } catch (e) {
  }

  checkAppCacheRevision().catch(() => { });

  // Ранний auth-gate: если токена нет, не дергаем защищенные API (например, /desk/api/items)
  // до момента успешного логина.
  try {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      console.log('⚠️ Нет токена на старте страницы, ждём логин');
    }
  } catch (e) {
  }

  refreshOfflineCacheStatus();

  // Ждем пока UserManager инициализируется и завершит валидацию токена
  const waitForUserManager = setInterval(() => {
    if (window.UM && typeof window.UM.isAuthenticated === 'function') {
      // КРИТИЧНО: ждем завершения асинхронной инициализации
      // UserManager инициализируется асинхронно через init(), нужно дождаться isInitialized
      if (window.UM.isInitialized) {
        clearInterval(waitForUserManager);

        // join-group flow: handle invite token passed as URL param
        try {
          handleJoinGroupInviteFromUrl().catch(() => { });
        } catch (e) {
        }

        // email-invite flow: if user already authenticated on page load
        try {
          handlePendingEmailInvitesAfterLogin().catch(() => { });
        } catch (e) {
        }

        // Если в оффлайне были накоплены activity/success, пробуем дослать их сразу при загрузке страницы
        // (это позволяет закрыть страницу диктанта, а потом открыть стол и синкнуть данные на сервер)
        try {
          if (typeof syncOfflineOutboxes === 'function') {
            syncOfflineOutboxes().catch(() => { });
          }
        } catch (e) {
        }

        // Инициализируем USER_LANGUAGE_DATA (как на index странице)
        const isAuthenticated = window.UM.isAuthenticated();
        if (isAuthenticated) {
          const user = window.UM.getCurrentUser();
          if (user) {
            window.USER_LANGUAGE_DATA = {
              nativeLanguage: user.native_language || 'ru',
              learningLanguages: user.learning_languages || ['en'],
              currentLearning: user.current_learning || user.learning_languages?.[0] || 'en',
              isAuthenticated: true
            };
          }
        } else {
          window.USER_LANGUAGE_DATA = {
            nativeLanguage: 'ru',
            learningLanguages: ['en'],
            currentLearning: 'en',
            isAuthenticated: false
          };
        }

        // Загружаем данные только если пользователь авторизован
        if (isAuthenticated) {
          // Инициализируем селектор языка после загрузки данных пользователя
          // Используем setTimeout для гарантии готовности DOM
          setTimeout(() => {
            initializeBooksLanguageSelector();
          }, 100);

          console.log('📚 Пользователь авторизован, загружаем данные библиотеки');
          refreshOfflineCacheStatus();
          triggerDeskLoadOnce();
          triggerBooksLoadOnce();
          try {
            setTimeout(() => {
              _autoOpenTodayPlanIfNeeded().catch(() => { });
            }, 250);
          } catch (e) {
          }
          try {
            if (typeof syncOfflineOutboxes === 'function') {
              syncOfflineOutboxes().catch(() => { }); // Trigger offline outbox sync on page load after UserManager initialization
            }
          } catch (e) {
          }
        } else {
          console.log('⚠️ Пользователь не авторизован, данные не загружаются');
          refreshOfflineCacheStatus();
          // Важно: не вызываем loadDeskItems без токена (иначе 401 и __initialDeskLoadTriggered=true,
          // а после логина повторная загрузка уже не произойдет)
        }
      }
      // Если UserManager еще не инициализирован, продолжаем ждать
    }
  }, 100);

  // Слушаем событие успешного логина/регистрации
  window.addEventListener('user-logged-in', () => {
    console.log('✅ Пользователь авторизован, загружаем данные библиотеки');
    // Обновляем USER_LANGUAGE_DATA
    if (window.UM && window.UM.isAuthenticated()) {
      const user = window.UM.getCurrentUser();
      if (user) {
        window.USER_LANGUAGE_DATA = {
          nativeLanguage: user.native_language || 'ru',
          learningLanguages: user.learning_languages || ['en'],
          currentLearning: user.current_learning || user.learning_languages?.[0] || 'en',
          isAuthenticated: true
        };
        // Перезагружаем селектор языка
        setTimeout(() => {
          initializeBooksLanguageSelector();
        }, 100);
        // Загружаем данные
        loadLibraryData();

        try {
          setTimeout(() => {
            _autoOpenTodayPlanIfNeeded().catch(() => { });
          }, 250);
        } catch (e) {
        }

        // join-group flow: если пользователь только что залогинился/зарегистрировался
        // и в URL есть join_group, показываем подтверждение вступления.
        try {
          handleJoinGroupInviteFromUrl().catch(() => { });
        } catch (e) {
        }

        // email-invite flow: если есть приглашения по email, показываем их после логина
        try {
          handlePendingEmailInvitesAfterLogin().catch(() => { });
        } catch (e) {
        }
      }
    }
  });

  // ВРЕМЕННО ОТКЛЮЧЕНО (диагностика двойной инициализации стола/книг).
  // Если после нескольких деплоев все стабильно (нет "очистилось и по новой" и нет зависаний),
  // этот watchdog можно удалить при чистке кода.
  // setTimeout(() => {
  //   clearInterval(waitForUserManager);
  //   ...
  // }, 5000);
});
