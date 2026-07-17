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

    function escapeHtml(s) {
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

    function getTodayIsoDate() {
      try {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      } catch (e) {
        return '';
      }
    }

    function normalizePositions(pos) {
      const arr = Array.isArray(pos) ? pos : [];
      const uniq = Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
      uniq.sort((a, b) => a - b);
      return uniq;
    }

    function positionsToLabel(positions) {
      const arr = normalizePositions(positions);
      if (!arr.length) return libT('private_library.assignments.full_dictation', null, 'весь диктант');
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
    }

    let _modalEl = null;
    let _modalOverlay = null;

    function ensureModal() {
      if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
      _modalEl = document.createElement('div');
      _modalEl.id = 'dictation-launch-modal';

      _modalEl.innerHTML = `
        <!-- dictation-launch-modal: промежуточная модалка выбора упражнения -->
        <div class="dictation-launch-modal-content">
          <div class="dictation-launch-modal-header">
            <img id="dictation-launch-cover" src="" alt="" class="dictation-launch-modal-cover" />
            <div id="dictation-launch-title" class="dictation-launch-modal-title"></div>
            <button type="button" id="dictation-launch-close" class="dictation-launch-modal-close" title="Закрыть">
              <i data-lucide="x" class="dictation-launch-modal-close-icon"></i>
            </button>
          </div>
          <div class="dictation-launch-modal-body">
            <div id="dictation-launch-list"></div>
          </div>
        </div>
      `;

      document.body.appendChild(_modalEl);

      // Закрытие по клику на оверлей
      _modalEl.addEventListener('click', (e) => {
        if (e.target === _modalEl) closeModal();
      });

      // Кнопка закрытия
      const closeBtn = _modalEl.querySelector('#dictation-launch-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      // Lucide иконки
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: _modalEl });
        }
      } catch (e) {
      }

      return _modalEl;
    }

    function closeModal() {
      try {
        if (_modalEl) {
          _modalEl.style.display = 'none';
          _modalEl.style.visibility = '';
          _modalEl.style.opacity = '';
        }
      } catch (e) {
      }
    }

    /**
     * Открыть промежуточную модалку запуска диктанта.
     * @param {object} options
     * @param {number} options.dictationId - ID диктанта
     * @param {string} options.title - Название диктанта
     * @param {string} options.openUrl - URL для открытия диктанта
     * @param {HTMLElement} options.cardEl - элемент карточки (для DictationModal.open)
     * @param {string} [options.coverUrl] - URL обложки диктанта
     * @param {Array<{id: number|null, positions: number[]}>} options.exercises - список упражнений
     * @param {Array<{group_id: number, teacher_user_id: number, positions: number[]|null, done: number, required_completions: number}>} [options.todayTasks] - задания на сегодня от учителей
     * @param {object} [options.teacherAvatars] - словарь teacher_user_id -> URL аватарки
     */
    async function openLaunchModal(options) {
      const opts = options || {};
      const dictationId = Number(opts.dictationId);
      const title = String(opts.title || '');
      const openUrl = String(opts.openUrl || '');
      const cardEl = opts.cardEl || null;
      const coverUrl = opts.coverUrl || '';
      const exercises = Array.isArray(opts.exercises) ? opts.exercises : [];
      const todayTasks = Array.isArray(opts.todayTasks) ? opts.todayTasks : [];
      const teacherAvatars = opts.teacherAvatars || {};

      const modal = ensureModal();

      // Показываем модалку
      try {
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.removeAttribute('hidden');
      } catch (e) {
      }

      // Заголовок
      const titleEl = modal.querySelector('#dictation-launch-title');
      if (titleEl) titleEl.textContent = title;

      // Обложка диктанта
      const coverEl = modal.querySelector('#dictation-launch-cover');
      if (coverEl) {
        if (coverUrl) {
          coverEl.src = coverUrl;
          coverEl.alt = title || 'cover';
          coverEl.style.display = '';
        } else {
          coverEl.src = '';
          coverEl.alt = '';
          coverEl.style.display = 'none';
        }
      }

      // Строим список
      const listEl = modal.querySelector('#dictation-launch-list');
      if (!listEl) return;

      // Группируем задания учителей по positions
      const tasksByPosKey = {};
      for (const task of todayTasks) {
        const pos = task.selected_sentence_positions;
        const key = Array.isArray(pos) && pos.length ? pos.join(',') : '';
        if (!tasksByPosKey[key]) tasksByPosKey[key] = [];
        tasksByPosKey[key].push(task);
      }

      // Строим HTML списка
      let html = '';

      // Сначала упражнения
      const visibleExercises = exercises.filter((x) => x && x.id != null);
      const uniqueBySig = new Map();
      for (const ex of visibleExercises) {
        const sig = ex.positions && ex.positions.length ? ex.positions.join(',') : '';
        if (!uniqueBySig.has(sig)) uniqueBySig.set(sig, ex);
      }
      const exerciseList = Array.from(uniqueBySig.values());

      // Сортируем: "по всем" (пустые позиции) сверху, остальные по первому номеру позиции
      exerciseList.sort((a, b) => {
        const aPos = Array.isArray(a.positions) ? a.positions : [];
        const bPos = Array.isArray(b.positions) ? b.positions : [];
        const aEmpty = !aPos.length;
        const bEmpty = !bPos.length;
        if (aEmpty && !bEmpty) return -1;
        if (!aEmpty && bEmpty) return 1;
        return (aPos[0] || 0) - (bPos[0] || 0);
      });

      for (const ex of exerciseList) {
        const pos = Array.isArray(ex.positions) ? ex.positions : [];
        const sig = pos.length ? pos.join(',') : '';
        const label = positionsToLabel(pos);
        const isFull = !pos.length;

        // Ищем задания учителей для этого упражнения
        const tasksForThis = tasksByPosKey[sig] || [];
        const incompleteTasks = tasksForThis.filter(t => {
          const done = Number(t.done || 0);
          const required = Number(t.required_completions || 1);
          return done < required;
        });

        html += `
          <button type="button" class="dictation-launch-item" data-positions="${escapeHtml(sig)}" data-full="${isFull ? '1' : '0'}">
            <i data-lucide="${isFull ? 'crown' : 'play'}" class="dictation-launch-item-icon"></i>
            <span class="dictation-launch-item-label">${escapeHtml(label)}</span>
            ${incompleteTasks.map(t => {
              const teacherId = t.created_by_teacher_user_id;
              const avatarUrl = teacherAvatars[teacherId] || '';
              const groupTitle = t.group_title || '';
              return avatarUrl
                ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(groupTitle)}" title="${escapeHtml(groupTitle)}" class="dictation-launch-item-avatar" />`
                : `<span class="dictation-launch-item-avatar-placeholder" title="${escapeHtml(groupTitle)}">${escapeHtml((groupTitle || '?')[0])}</span>`;
            }).join('')}
          </button>
        `;
      }

      if (!html) {
        // Если нет упражнений — показываем "весь диктант"
        html = `
          <button type="button" class="dictation-launch-item" data-positions="" data-full="1">
            <i data-lucide="crown" class="dictation-launch-item-icon"></i>
            <span class="dictation-launch-item-label">${escapeHtml(libT('private_library.assignments.full_dictation', null, 'весь диктант'))}</span>
          </button>
        `;
      }

      listEl.innerHTML = html;

      // Lucide иконки
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }

      // Обработчики клика на пункты списка
      listEl.querySelectorAll('.dictation-launch-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const positionsStr = btn.getAttribute('data-positions') || '';
          const positions = positionsStr ? positionsStr.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
          closeModal();
          // Открываем диктант
          if (window.DictationModal && typeof window.DictationModal.open === 'function') {
            window.DictationModal.open(openUrl, { cardEl, subsetPositions: positions.length ? positions : null });
          } else {
            console.warn('[dictation_launch_modal] DictationModal не загружен, невозможно открыть диктант');
          }
        });
      });
    }

    /**
     * Основная функция: вызывается из карточки диктанта.
     * Загружает упражнения и задания на сегодня, решает, показывать модалку или сразу открыть диктант.
     */
    async function openDictationLaunch(dictationId, openUrl, cardEl, dictationTitle) {
      console.log('[2] dictation_launch_modal: openDictationLaunch вызван, dictationId=' + dictationId + ', openUrl=' + openUrl);
      const id = Number(dictationId);
      if (!Number.isFinite(id) || id <= 0) {
        console.log('[2a] dictation_launch_modal: id <= 0, открываем напрямую');
        // Если DictationModal не загружен — не пытаемся открыть старую страницу
        if (window.DictationModal && typeof window.DictationModal.open === 'function') {
          window.DictationModal.open(openUrl, { cardEl, subsetPositions: null });
        } else {
          console.warn('[dictation_launch_modal] DictationModal не загружен, невозможно открыть диктант');
        }
        return;
      }

      console.log('[3] dictation_launch_modal: начинаем загрузку упражнений для id=' + id);
      // 1. Загружаем упражнения
      let exercises = [];

      // Сначала из кэша (если ошибка кэша — не фатально, продолжаем)
      try {
        const idb = window.IdbManager;
        if (idb && typeof idb.idbGet === 'function') {
          const cacheKey = `exercises:${String(id)}`;
          const cached = await idb.idbGet('dictations', cacheKey);
          if (cached && Array.isArray(cached.exercises) && cached.exercises.length) {
            exercises = cached.exercises.map((x) => ({
              id: x && x.id != null ? x.id : null,
              positions: normalizePositions(x && Array.isArray(x.positions) ? x.positions : []),
            }));
          }
        }
      } catch (e) {
        try { console.warn('[dictation_launch_modal] cache load error (non-fatal):', e); } catch (e2) {}
      }

      // Если в кэше нет — загружаем с сервера
      if (!exercises.length) {
        try {
          const res = await apiRequest(`/api/dictation/${encodeURIComponent(String(id))}/exercises`, { method: 'GET' });
          const raw = (res && res.success && Array.isArray(res.exercises)) ? res.exercises : [];
          exercises = raw.map((x) => {
            const p = x && typeof x.positions === 'string' ? (() => { try { return JSON.parse(x.positions); } catch (e) { return []; } })() : (x && Array.isArray(x.positions) ? x.positions : []);
            return { id: x && x.id != null ? x.id : null, positions: normalizePositions(p) };
          });
        } catch (e) {
          try { console.warn('[dictation_launch_modal] server load error:', e); } catch (e2) {}
          exercises = [];
        }
      }

      // 2. Загружаем задания на сегодня
      let todayTasks = [];
      let teacherAvatars = {};
      try {
        const today = getTodayIsoDate();
        if (today) {
          const res = await apiRequest(`/api/assignments/student/my?date=${encodeURIComponent(today)}`, { method: 'GET' });
          if (res && res.success && Array.isArray(res.assignments)) {
            // Фильтруем только задания для этого диктанта
            todayTasks = res.assignments.filter(a => Number(a.dictation_id) === id);
            // Собираем аватарки учителей
            const teacherIds = new Set();
            for (const t of todayTasks) {
              if (t.created_by_teacher_user_id) teacherIds.add(Number(t.created_by_teacher_user_id));
            }
            // Загружаем информацию об учителях (аватарки)
            for (const tid of teacherIds) {
              try {
                const userRes = await apiRequest(`/api/user/${encodeURIComponent(String(tid))}/profile`, { method: 'GET' });
                if (userRes && userRes.success && userRes.user) {
                  const avatar = userRes.user.avatar_url || userRes.user.avatar || '';
                  if (avatar) teacherAvatars[Number(tid)] = avatar;
                }
              } catch (e) {
              }
            }
          }
        }
      } catch (e) {
        todayTasks = [];
      }

      // 3. Решаем, показывать модалку или сразу открыть
      const visibleExercises = exercises.filter((x) => x && x.id != null);
      const uniqueBySig = new Map();
      for (const ex of visibleExercises) {
        const sig = ex.positions && ex.positions.length ? ex.positions.join(',') : '';
        if (!uniqueBySig.has(sig)) uniqueBySig.set(sig, ex);
      }
      const exerciseList = Array.from(uniqueBySig.values());

      console.log('[4] dictation_launch_modal: exercises count=' + exerciseList.length + ', items=' + exerciseList.map(function(e) { return '{id:' + e.id + ',pos:[' + (e.positions||[]).join(',') + ']}'; }).join('; '));

      // Есть ли невыполненные задания от учителей
      const hasIncompleteTasks = todayTasks.some(t => {
        const done = Number(t.done || 0);
        const required = Number(t.required_completions || 1);
        return done < required;
      });

      console.log('[5] dictation_launch_modal: hasIncompleteTasks=' + hasIncompleteTasks + ', todayTasks count=' + todayTasks.length);

      // Если только "весь диктант" (или пусто) и нет заданий от учителя — сразу открываем
      const onlyFull = exerciseList.length === 0 || (exerciseList.length === 1 && !exerciseList[0].positions.length);
      console.log('[6] dictation_launch_modal: onlyFull=' + onlyFull + ', willShowModal=' + !(onlyFull && !hasIncompleteTasks));
      if (onlyFull && !hasIncompleteTasks) {
        console.log('[7] dictation_launch_modal: открываем DictationModal.open напрямую');
        if (window.DictationModal && typeof window.DictationModal.open === 'function') {
          window.DictationModal.open(openUrl, { cardEl, subsetPositions: null });
        } else {
          console.warn('[dictation_launch_modal] DictationModal не загружен, невозможно открыть диктант');
        }
        return;
      }

      console.log('[8] dictation_launch_modal: показываем launch modal');

      // Извлекаем URL обложки из карточки
      let coverUrl = '';
      try {
        if (cardEl) {
          const coverImg = cardEl.querySelector('.short-thumb img');
          if (coverImg) coverUrl = coverImg.getAttribute('src') || '';
        }
      } catch (e) {
      }

      // Иначе показываем модалку
      openLaunchModal({
        dictationId: id,
        title: dictationTitle || '',
        openUrl,
        cardEl,
        coverUrl,
        exercises: exerciseList,
        todayTasks,
        teacherAvatars,
      });
    }

    // Экспортируем
    window.openDictationLaunch = openDictationLaunch;
    window.DictationLaunchModal = {
      open: openDictationLaunch,
      openLaunchModal,
      close: closeModal,
    };
  } catch (e) {
    try {
      console.error('[dictation_launch_modal] init error:', e);
    } catch (e2) {
    }
  }
})();
