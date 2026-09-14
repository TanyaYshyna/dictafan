(function () {
  'use strict';

  function getRuntimeStore() {
    try {
      if (window.__dictationRuntimeStore) return window.__dictationRuntimeStore;
      if (window.DictationRuntime && window.DictationRuntime.DictationSessionsStore) {
        window.__dictationRuntimeStore = new window.DictationRuntime.DictationSessionsStore({
          maxSessions: window.DictationRuntime.MAX_OPEN_SESSIONS || 5,
        });
        // Восстанавливаем сессии из IDB, чтобы активные диктанты отображались корректно.
        // Вызов без await — fire-and-forget, так как это не критично для отображения списка.
        // Сессии восстановятся только для уже загруженного контента; список активных
        // диктантов читается из IDB напрямую в getActiveDictations().
        try {
          window.__dictationRuntimeStore.restoreFromIdb().catch(function(e){});
        } catch (eRestore) {
        }
        return window.__dictationRuntimeStore;
      }
    } catch (e) {
    }
    return null;
  }

  async function getActiveDictations() {
    const store = getRuntimeStore();
    const byDict = new Map();

    function ensure(dictId) {
      const d = String(dictId);
      if (!byDict.has(d)) {
        byDict.set(d, { dictationId: d, sessionsCount: 0, languages: [], sentencesCount: 0, loadedAtMs: 0 });
      }
      return byDict.get(d);
    }

    // Главный источник незавершённых диктантов — сессии в IndexedDB.
    // Раньше список строился по _contents (которые создавались пустыми в
    // restoreFromIdb через getOrCreateContent). Теперь restoreFromIdb не создаёт
    // пустых контентов, поэтому читаем записи 'sessions' напрямую.
    try {
      if (window.IdbManager && typeof window.IdbManager.idbGetAll === 'function') {
        const records = await window.IdbManager.idbGetAll('sessions');
        for (const rec of (records || [])) {
          let dictId = null;
          if (rec && rec.dictationId) {
            dictId = rec.dictationId;
          } else if (rec && rec.data) {
            try { dictId = (JSON.parse(rec.data) || {}).dictationId; } catch (e) { }
          }
          if (!dictId) continue;
          ensure(dictId).sessionsCount += 1;
        }
      }
    } catch (e) {
      console.warn('[activeDictations] error reading IDB sessions:', e);
    }

    // Дополняем данными загруженного контента из runtime store
    // (языки, количество предложений) — если контент уже загружен.
    if (store && store._contents && typeof store._contents.values === 'function') {
      for (const content of store._contents.values()) {
        if (!content || !content.dictationId) continue;
        const entry = ensure(content.dictationId);
        entry.languages = content.getLanguages ? content.getLanguages() : [];
        entry.sentencesCount = content.getAllKeys ? content.getAllKeys().length : 0;
        entry.loadedAtMs = content.loadedAtMs || 0;
      }
    }

    const result = Array.from(byDict.values());
    // Сортируем по времени загрузки (сначала новые)
    result.sort((a, b) => (b.loadedAtMs || 0) - (a.loadedAtMs || 0));
    return result;
  }

  async function renderActiveDictations() {
    const listEl = document.getElementById('activeDictationsList');
    if (!listEl) return;

    const dictations = await getActiveDictations();

    if (dictations.length === 0) {
      listEl.innerHTML = '<div class="active-dictations-empty">Нет активных диктантов</div>';
      return;
    }

    let html = '';
    for (const d of dictations) {
      const title = `Диктант #${window.escapeHtml(d.dictationId)}`;
      const langLabel = d.languages && d.languages.length > 0 ? `языки: ${d.languages.map(function(l){return window.escapeHtml(l);}).join(', ')}` : '';
      const sentencesLabel = `${d.sentencesCount} предложений`;
      const sessionsLabel = d.sessionsCount > 0 ? `${d.sessionsCount} сессий` : '';

      const metaParts = [sentencesLabel];
      if (langLabel) metaParts.push(langLabel);
      if (sessionsLabel) metaParts.push(sessionsLabel);

      html += '<div class="active-dictation-item">';
      html += `<span class="dictation-id-badge">#${window.escapeHtml(d.dictationId)}</span>`;
      html += '<div class="dictation-info">';
      html += `<div class="dictation-title">${title}</div>`;
      html += `<div class="dictation-meta">${metaParts.join(' · ')}</div>`;
      html += '</div>';
      html += '</div>';
    }

    listEl.innerHTML = html;
  }

  async function openModal() {
    const modal = document.getElementById('activeDictationsModal');
    if (!modal) return;

    await renderActiveDictations();

    modal.style.display = 'flex';

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: modal });
      }
    } catch (e) {
    }
  }

  function closeModal() {
    const modal = document.getElementById('activeDictationsModal');
    if (!modal) return;
    modal.style.display = 'none';
  }

  function init() {
    const modal = document.getElementById('activeDictationsModal');
    if (!modal) return;

    // Закрытие по крестику
    const closeBtn = document.getElementById('activeDictationsModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    // Закрытие по клику на оверлей
    modal.addEventListener('click', (e) => {
      if (e && e.target === modal) closeModal();
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape') {
        if (modal.style.display === 'flex') closeModal();
      }
    });

    // Обновляем список при каждом открытии
    // (renderActiveDictations вызывается в openModal)
  }

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Экспортируем API
  window.ActiveDictationsModal = {
    open: openModal,
    close: closeModal,
    refresh: renderActiveDictations,
  };
})();
