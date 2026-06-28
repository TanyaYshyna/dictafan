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

  function getActiveDictations() {
    const store = getRuntimeStore();
    if (!store) return [];

    const contents = [];
    try {
      // DictationSessionsStore хранит _contents как Map<key, DictationContent>
      // и _sessions как Map<key, DictationSession>
      if (store._contents && typeof store._contents.values === 'function') {
        for (const content of store._contents.values()) {
          if (content && content.dictationId) {
            // Считаем количество сессий для этого контента
            let sessionsCount = 0;
            if (store._sessions && typeof store._sessions.values === 'function') {
              for (const session of store._sessions.values()) {
                if (session && session.content && session.content.key === content.key) {
                  sessionsCount++;
                }
              }
            }
            contents.push({
              dictationId: content.dictationId,
              langTr: content.langTr,
              sentencesCount: content.getAllKeys ? content.getAllKeys().length : 0,
              sessionsCount: sessionsCount,
              loadedAtMs: content.loadedAtMs || 0,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[activeDictations] error reading store:', e);
    }

    // Сортируем по времени загрузки (сначала новые)
    contents.sort((a, b) => (b.loadedAtMs || 0) - (a.loadedAtMs || 0));
    return contents;
  }

  function renderActiveDictations() {
    const listEl = document.getElementById('activeDictationsList');
    if (!listEl) return;

    const dictations = getActiveDictations();

    if (dictations.length === 0) {
      listEl.innerHTML = '<div class="active-dictations-empty">Нет активных диктантов</div>';
      return;
    }

    let html = '';
    for (const d of dictations) {
      const title = `Диктант #${window.escapeHtml(d.dictationId)}`;
      const langLabel = d.langTr ? `язык: ${window.escapeHtml(d.langTr)}` : '';
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

  function openModal() {
    const modal = document.getElementById('activeDictationsModal');
    if (!modal) return;

    renderActiveDictations();

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
