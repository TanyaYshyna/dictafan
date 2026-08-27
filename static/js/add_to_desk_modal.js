(function () {
  try {
    if (window.AddToDeskModal) return;

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
      const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 3000;
      try {
        if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
          window.DictationKart._showToast(message || '', { durationMs });
          return;
        }
      } catch (e) {
      }

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
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      el.textContent = message || '';
      el.style.display = 'block';
      if (el._hideTimer) window.clearTimeout(el._hideTimer);
      el._hideTimer = window.setTimeout(() => {
        try { el.style.display = 'none'; } catch (e) { }
      }, durationMs);
    }

    function getTodayIsoDate() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    async function loadGroups() {
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

    function fillTargetSelect(groups) {
      const sel = document.getElementById('add-to-desk-target');
      if (!sel) return;
      sel.innerHTML = '';

      // Первая опция — свой рабочий стол.
      const ownOpt = document.createElement('option');
      ownOpt.value = 'own';
      ownOpt.textContent = 'Мой стол';
      sel.appendChild(ownOpt);

      (Array.isArray(groups) ? groups : []).forEach(g => {
        const opt = document.createElement('option');
        opt.value = String(g && g.id != null ? g.id : '');
        const isPersonal = Boolean(g && g.is_personal === true);
        const title = g && g.title ? String(g.title) : '';
        opt.textContent = isPersonal ? 'Моя группа' : title;
        sel.appendChild(opt);
      });

      // По умолчанию — свой стол.
      if (ownOpt) sel.value = 'own';
    }

    async function loadDictationMeta(dictationId) {
      const id = Number(String(dictationId || '').replace(/^dict_/, '').trim());
      if (!Number.isFinite(id) || id <= 0) return null;
      return apiRequest(`/api/dictation/${encodeURIComponent(id)}`, { method: 'GET' });
    }

    function closeModal() {
      const modal = document.getElementById('add-to-desk-modal');
      if (!modal) return;
      modal.style.display = 'none';
    }

    async function submitAdd() {
      const idInput = document.getElementById('add-to-desk-dictation-id');
      const dictationIdRaw = idInput ? String(idInput.value || '').trim() : '';
      const dictationIdNum = Number(dictationIdRaw);

      if (!Number.isFinite(dictationIdNum) || dictationIdNum <= 0) {
        showToast('Неизвестный диктант', { durationMs: 2500 });
        return;
      }

      const sel = document.getElementById('add-to-desk-target');
      const target = sel ? String(sel.value || '').trim() : '';

      const saveBtn = document.getElementById('add-to-desk-save');
      const plannedDate = getTodayIsoDate();

      try {
        if (saveBtn) saveBtn.disabled = true;

        if (!target || target === 'own') {
          // Добавляем на свой рабочий стол.
          await apiRequest(`/api/dictation/${encodeURIComponent(String(dictationIdNum))}/add-to-desk`, {
            method: 'POST',
            body: JSON.stringify({ planned_date: plannedDate }),
          });
          showToast('Диктант добавлен на ваш рабочий стол', { durationMs: 3000 });
        } else {
          const groupIdNum = Number(target);
          if (!Number.isFinite(groupIdNum) || groupIdNum <= 0) {
            showToast('Выберите группу', { durationMs: 2500 });
            return;
          }
          await apiRequest(`/api/dictation/${encodeURIComponent(String(dictationIdNum))}/add-to-desk-group`, {
            method: 'POST',
            body: JSON.stringify({ group_id: groupIdNum, planned_date: plannedDate }),
          });
          showToast('Диктант добавлен ученикам группы', { durationMs: 3000 });
        }

        closeModal();

        // Обновляем индикацию на карточках и рабочий стол.
        try {
          if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
            window.Desktop.loadDeskItems();
          }
        } catch (e) {
        }
        try {
          if (window.DictationKart && typeof window.DictationKart.addToDesk === 'function') {
            window.__deskItemIds = window.__deskItemIds || [];
            if (window.__deskItemIds.indexOf(dictationIdNum) === -1) {
              window.__deskItemIds.push(dictationIdNum);
            }
          }
        } catch (e) {
        }
      } catch (err) {
        showToast(err && err.message ? String(err.message) : 'Ошибка добавления', { durationMs: 3500 });
      } finally {
        try {
          if (saveBtn) saveBtn.disabled = false;
        } catch (e) {
        }
      }
    }

    async function openAddToDeskModal(dictationId) {
      const modal = document.getElementById('add-to-desk-modal');
      if (!modal) return;

      const idNormalized = String(dictationId || '').trim();
      const dictationIdNum = Number(idNormalized.replace(/^dict_/, '').trim());
      const idInput = document.getElementById('add-to-desk-dictation-id');
      if (idInput) idInput.value = String(dictationIdNum || '');

      try {
        const meta = await loadDictationMeta(dictationIdNum);
        const titleEl = document.getElementById('add-to-desk-dictation-title');
        const coverImg = document.getElementById('add-to-desk-cover-img');
        const coverMeta = document.getElementById('add-to-desk-cover-meta');

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

      try {
        const groups = await loadGroups();
        fillTargetSelect(groups);
      } catch (e) {
        fillTargetSelect([]);
      }

      if (!modal.dataset.listenersAttached) {
        modal.dataset.listenersAttached = '1';
        const closeBtn = document.getElementById('add-to-desk-close');
        const saveBtn = document.getElementById('add-to-desk-save');

        if (closeBtn) {
          closeBtn.addEventListener('click', closeModal);
        }
        if (saveBtn) {
          saveBtn.addEventListener('click', submitAdd);
        }
        // Клик по подложке закрывает модалку.
        modal.addEventListener('click', (e) => {
          try {
            if (e.target === modal) closeModal();
          } catch (e2) {
          }
        });
      }

      modal.style.display = 'flex';

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }
    }

    window.AddToDeskModal = {
      open: openAddToDeskModal,
      close: closeModal,
    };

    if (!window.openAddToDeskModal) {
      window.openAddToDeskModal = openAddToDeskModal;
    }
  } catch (e) {
  }
})();
