// Скрипт для новой страницы приватной библиотеки

(function () {
  let bookLanguageSelector = null;
  let activeBookId = null;
  let currentView = 'cards'; // 'cards' or 'list'
  let cropper = null;
  let croppedImageBlob = null;
  let deskItems = []; // Список диктантов на столе

  function getToken() {
    return localStorage.getItem("jwt_token");
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

  function showToast(message) {
    alert(message);
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
    } else {
      overlay.querySelector('.loading-text').textContent = message;
    }
    overlay.style.display = 'flex';
  }

  function hideLoadingIndicator() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // ==================== ЗОНА 1: Рабочий стол ====================
  
  async function loadDeskItems() {
    try {
      const data = await apiRequest("/desk/api/items");
      if (data.success && data.items) {
        deskItems = data.items; // Сохраняем список диктантов на столе
        console.log("📋 Загружены диктанты на столе:", data.items.map(item => ({
          id: item.dictation_id,
          title: item.title,
          cover_url: item.cover_url
        })));
        renderDeskCards(data.items);
        // Обновляем индикаторы "в работе" в карточках диктантов
        updateInWorkIndicators();
      }
    } catch (error) {
      console.error("Ошибка загрузки диктантов на столе:", error);
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
    // Не добавляем индикатор "в работе" для карточек на столе (desk-card)
    document.querySelectorAll('.short-card[data-dictation-id]:not(.desk-card)').forEach(card => {
      const dictationId = card.dataset.dictationId;
      if (!dictationId) return;
      
      let indicator = card.querySelector('.short-in-work-indicator');
      const isOnDesk = isDictationOnDesk(dictationId);
      const thumb = card.querySelector('.short-thumb');
      
      if (isOnDesk && !indicator && thumb) {
        // Добавляем индикатор
        indicator = document.createElement('div');
        indicator.className = 'short-in-work-indicator';
        indicator.title = 'В работе';
        indicator.innerHTML = '<i data-lucide="pen-tool"></i>';
        thumb.appendChild(indicator);
        if (window.lucide) lucide.createIcons();
      } else if (!isOnDesk && indicator) {
        // Удаляем индикатор
        indicator.remove();
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
        // Очищаем незаконченные значения диктанта
        try {
          await apiRequest(`/statistics/dictation_state/${dictationId}`, {
            method: 'DELETE'
          });
          console.log('✅ Незаконченные значения диктанта очищены');
        } catch (error) {
          console.warn('⚠️ Не удалось очистить незаконченные значения:', error);
        }
        
        // Обновляем список диктантов на столе
        await loadDeskItems();
        showToast('Диктант убран со стола');
      } else {
        showToast('Ошибка при удалении диктанта со стола');
      }
    } catch (error) {
      console.error('❌ Ошибка удаления диктанта со стола:', error);
      showToast('Ошибка при удалении диктанта со стола');
    }
  }
  
  // Добавляет или удаляет диктант со стола (используется кликом на карточку в библиотеке)
  async function toggleDictationOnDesk(dictationId) {
    const isOnDesk = isDictationOnDesk(dictationId);
    
    if (isOnDesk) {
      // Удаляем со стола
      const itemId = getDeskItemId(dictationId);
      if (!itemId) {
        console.error('❌ Не найден item_id для диктанта на столе:', dictationId);
        return;
      }
      
      await removeFromDesk(itemId, dictationId);
    } else {
      // Добавляем на стол
      try {
        const addData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        
        if (addData.success) {
          // Обновляем список диктантов на столе
          await loadDeskItems();
          showToast('Диктант добавлен на стол');
        } else {
          showToast('Ошибка при добавлении диктанта на стол');
        }
      } catch (error) {
        console.error('❌ Ошибка добавления диктанта на стол:', error);
        showToast('Ошибка при добавлении диктанта на стол');
      }
    }
  }

  // Создает карточку диктанта для публичной библиотеки
  // item - объект с данными диктанта
  // book - объект с данными книги (для проверки, является ли книга своей)
  function createPublicDictationCard(item, book) {
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';
    
    const langOriginal = d.language_original || d.language_code || 'en';
    const langTranslation = d.language_translation || d.language_code || 'en';
    
    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;
    
    // Проверяем, является ли книга своей
    let isOwnBook = false;
    if (window.UM && window.UM.isAuthenticated()) {
      const currentUser = window.UM.getCurrentUser();
      if (currentUser && book && book.creator_user_id) {
        isOwnBook = currentUser.id === book.creator_user_id;
      }
    }
    
    // Проверяем, есть ли книга в библиотеке пользователя
    // Для публичной библиотеки всегда считаем, что книги чужие (кроме своих)
    // Проверку наличия в библиотеке можно добавить через API, но пока используем простую логику
    let isBookInLibrary = false;
    if (!isOwnBook && window.UM && window.UM.isAuthenticated()) {
      // TODO: можно добавить проверку через API /library/api/user-books
      // Пока используем простую логику - если книга не своя, считаем что её нет в библиотеке
      isBookInLibrary = false;
    }
    
    // Кнопки для публичной библиотеки
    const actionButtons = [];
    
    // Кнопка "Взять в работу" - только для чужих книг
    if (!isOwnBook && book && book.id) {
      const notebookIcon = isBookInLibrary ? 'notebook-pen' : 'notebook';
      actionButtons.push(`
        <button class="short-action-btn" data-action="add-to-work" data-dictation-id="${dbId}" data-book-id="${book.id}" title="Взять в работу">
          <i data-lucide="${notebookIcon}"></i>
        </button>
      `);
    }
    
    // Кнопка "Просмотреть диктант" - для всех
    actionButtons.push(`
      <button class="short-action-btn" data-action="view-dictation" data-dictation-id="${dbId}" data-book-id="${book ? book.id : ''}" title="Просмотреть диктант">
        <i data-lucide="eye"></i>
      </button>
    `);
    
    return `
      <div class="short-card" data-dictation-id="${dbId}">
        <div class="short-thumb">
          <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
        </div>
        <h3 class="short-title">${d.title || 'Без названия'}</h3>
        <div class="short-id-container">
          <div class="short-sentences-count" title="Количество предложений">
            <i data-lucide="layers"></i><span>${d.sentences_count || 0}</span>
          </div>
          <div class="short-dikt-number">${dictationId}</div>
        </div>
        <div class="short-meta">
          <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
          <span class="short-level">${d.level || '—'}</span>
        </div>
        <div class="short-actions">
          ${actionButtons.join('')}
        </div>
      </div>
    `;
  }

  // Создает карточку диктанта (для стола или для книги)
  // item - объект с данными диктанта
  // isDeskCard - true для карточки на столе, false для карточки в книге
  function createDictationCard(item, isDeskCard = false) {
    if (isDeskCard) {
      // Карточка для рабочего стола
      const dictationId = item.dictation_id;
      const dictationIdFormatted = `dict_${dictationId}`;
      const langOriginal = item.language_code || 'en';
      const langTranslation = item.language_translation || item.language_code || 'en';
      const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
      const coverUrl = item.cover_url || `/static/data/covers/cover_${langOriginal || 'en'}.webp`;
      // Убеждаемся, что sentencesCount - это число, а не строка или что-то еще
      const sentencesCount = typeof item.sentences_count === 'number' ? item.sentences_count : (parseInt(item.sentences_count, 10) || 0);
      
      return `
        <div class="short-card desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}">
          <a class="short-thumb" href="${openUrl}" target="_blank">
            <img src="${coverUrl}" alt="${item.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
          </a>
          <h3 class="short-title">
            <a href="${openUrl}" target="_blank">${item.title || 'Без названия'}</a>
          </h3>
          <div class="short-id-container">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
            <div class="short-dikt-number">${dictationIdFormatted}</div>
          </div>
          <div class="short-stats" data-dictation-id="${dictationId}">
            <div class="stats-placeholder"></div>
          </div>
          <div class="short-meta">
            <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
            <span class="short-level">${item.level || '—'}</span>
            <button class="short-action-btn" data-action="remove-from-desk" data-desk-item-id="${item.id}" data-dictation-id="${dictationId}" title="Убрать со стола">
              <i data-lucide="arrow-big-down-dash"></i>
            </button>
          </div>
        </div>
      `;
    } else {
      // Карточка для книги
      const d = item;
      const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';
      
      // Определяем языки для URL
      const langOriginal = d.language_original || d.language_code || 'en';
      const langTranslation = d.language_translation || d.language_code || 'en';
      
      // ID в формате dict_X для URL
      const dictationId = d.dictation_id || `dict_${d.id}`;
      const dbId = d.db_id || d.id;
      
      // URL для редактирования (используем формат dict_X)
      const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;
      
      // Проверяем, находится ли диктант на столе
      const isOnDesk = isDictationOnDesk(dbId);
      const inWorkIndicator = isOnDesk ? `
        <div class="short-in-work-indicator" title="В работе">
          <i data-lucide="pen-tool"></i>
        </div>
      ` : '';
      
      // Кнопки для карточки в книге (правый нижний угол)
      const actionButtons = `
        <a href="${editUrl}" target="_blank" class="short-action-btn" title="Редактировать">
          <i data-lucide="pencil-ruler"></i>
        </a>
        <button class="short-action-btn" data-action="move-dictation" data-dictation-id="${dbId}" title="Переместить в книгу">
          <i data-lucide="folder-symlink"></i>
        </button>
        <button class="short-action-btn danger" data-action="delete-dictation" data-dictation-id="${dbId}" title="Удалить">
          <i data-lucide="trash-2"></i>
        </button>
      `;
      
      // Медалька будет добавлена асинхронно через updateCompletionBadges
      // Статистика (звезды/полузвезды/микрофон) убрана - она только на столе
      
      return `
        <div class="short-card" data-dictation-id="${dbId}" data-action="toggle-desk">
          <div class="short-thumb">
            <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
            ${inWorkIndicator}
          </div>
          <h3 class="short-title">${d.title || 'Без названия'}</h3>
          <div class="short-id-container">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${d.sentences_count || 0}</span>
            </div>
            <div class="short-dikt-number">${dictationId}</div>
          </div>
          <div class="short-meta">
            <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
            <span class="short-level">${d.level || '—'}</span>
            ${d.author_materials_url ? `<button class="short-action-btn" title="Открыть материалы автора" onclick="event.stopPropagation(); window.open('${d.author_materials_url}', '_blank');">
              <i data-lucide="external-link"></i>
            </button>` : ''}
          </div>
          <div class="short-actions">
            ${actionButtons}
          </div>
        </div>
      `;
    }
  }

  function renderDeskCards(items) {
    const container = document.getElementById("deskCardsContainer");
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
      return;
    }

    // Очищаем контейнер перед рендерингом, чтобы избежать дублирования
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = 'shorts-grid';
    
    items.forEach(item => {
      const cardHtml = createDictationCard(item, true); // true = карточка для стола
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });
    
    container.appendChild(grid);

    // Обновляем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons();
    }
    
    // Загружаем статистику и медальки для карточек на столе
    setTimeout(async () => {
      updateDictationCardsStats(container);
      updateCompletionBadges(container);
    }, 100);
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

    const allBooks = [
      ...(ownBooks || []).map(book => ({ ...book, isOwn: true })),
      ...(shelfBooks || []).map(book => ({ ...book, isOwn: false }))
    ];

    if (allBooks.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Нет книг</div>';
      return;
    }

    container.innerHTML = allBooks.map(book => createMiniBookCard(book)).join('');

    // Обработчики событий
    container.querySelectorAll('.book-card-mini').forEach(card => {
      const bookId = parseInt(card.getAttribute('data-book-id'));
      const book = allBooks.find(b => b.id === bookId);
      
      // Одиночный клик - выделить
      card.addEventListener('click', (e) => {
        setActiveBook(bookId);
      });
      
      // Двойной клик - открыть зону 3
      card.addEventListener('dblclick', (e) => {
        setActiveBook(bookId);
        openActiveBookZone(book);
      });
    });
  }

  function createMiniBookCard(book) {
    const foreignClass = book.isOwn ? '' : 'foreign';
    const activeClass = activeBookId === book.id ? 'active' : '';
    
    // Формируем URL аватара создателя
    let creatorAvatarHtml = '';
    if (book.creator_user_id) {
      const avatarUrl = `/user/api/avatar?user_id=${book.creator_user_id}&size=small&t=${Date.now()}`;
      creatorAvatarHtml = `<img src="${avatarUrl}" alt="Creator" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`;
    } else {
      creatorAvatarHtml = '<i data-lucide="user"></i>';
    }
    
    const creatorName = book.creator_username || 'Неизвестный';
    
    // Формируем HTML обложки
    let coverHtml;
    if (book.cover_url) {
      coverHtml = `<img class="book-card-mini-cover" src="${book.cover_url}" alt="${book.title}">`;
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

  function setActiveBook(bookId) {
    activeBookId = bookId;
    
    // Обновляем выделение в списке
    document.querySelectorAll('.book-card-mini').forEach(card => {
      if (parseInt(card.getAttribute('data-book-id')) === bookId) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  // ==================== ЗОНА 3: Активная книга ====================
  
  async function openActiveBookZone(book) {
    const zone = document.getElementById("activeBookZone");
    if (!zone) return;

    zone.style.display = 'flex';
    
    // Показываем разделитель и добавляем класс для изменения стилей
    const libraryContent = document.querySelector('.library-content');
    const resizer = document.getElementById('zoneResizer');
    if (libraryContent) {
      libraryContent.classList.add('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'block';
    }
    
    // Загружаем информацию о книге
    const bookId = book.id || book;
    const isWorkbook = book.is_workbook || false;
    await loadActiveBook(bookId, isWorkbook);
    
    // Обновляем иконки
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function closeActiveBookZone() {
    const zone = document.getElementById("activeBookZone");
    if (zone) {
      zone.style.display = 'none';
      activeBookId = null;
      
      // Скрываем разделитель и убираем класс
      const libraryContent = document.querySelector('.library-content');
      const resizer = document.getElementById('zoneResizer');
      if (libraryContent) {
        libraryContent.classList.remove('has-active-book');
      }
      if (resizer) {
        resizer.style.display = 'none';
      }
      
      // Убираем выделение
      document.querySelectorAll('.book-card-mini').forEach(card => {
        card.classList.remove('active');
      });
    }
  }

  async function loadActiveBook(bookId, isWorkbook = false) {
    try {
      // Загружаем информацию о книге
      const bookData = await apiRequest(`/library/api/book/${bookId}`);
      
      if (bookData.success && bookData.book) {
        renderActiveBookCard(bookData.book, isWorkbook);
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
      
      renderBookContent(sections, dictations, isWorkbook);
    } catch (error) {
      console.error("Ошибка загрузки активной книги:", error);
    }
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

  function renderActiveBookCard(book, targetContainer = null) {
    const container = targetContainer || document.getElementById("activeBookCard");
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
    const coverImage = book.cover_url 
      ? `<img src="${book.cover_url}" alt="${book.title}">`
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
      <button class="book-card-max-close-btn" id="btnCloseActiveBook" title="Закрыть книгу">
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
              <button class="book-card-max-btn dropdown-toggle" id="btnBookActions" title="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu" id="bookActionsMenu" style="display: none;">
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
    const closeBtn = document.getElementById("btnCloseActiveBook");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeActiveBookZone();
      });
    }

    // Обработчики выпадающего меню действий книги
    const bookActionsBtn = document.getElementById("btnBookActions");
    const bookActionsMenu = document.getElementById("bookActionsMenu");
    
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
            const closeMenuHandler = function(e) {
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
        
        switch(action) {
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

  function renderBookContent(sections, dictations, isWorkbook = false) {
    const container = document.getElementById("bookStructure");
    
    if (!container) return;

    if ((!sections || sections.length === 0) && (!dictations || dictations.length === 0)) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
      return;
    }

    let html = '<div class="book-structure-list">';
    
    // Отображаем разделы
    if (sections && sections.length > 0) {
      sections.forEach(section => {
        const sectionNumber = section.section_number ? `§ ${section.section_number}. ` : '§ ';
        console.log(`📝 Рендерю раздел ${section.id}: section_number=${section.section_number}, title="${section.title}", будет отображено: "${sectionNumber}${section.title}"`);
        
        // Проверяем, есть ли у раздела дочерние элементы (подразделы)
        const hasChildSections = sections.some(s => s.parent_id === section.id);
        
        // Проверяем, есть ли диктанты в этом разделе
        // Диктанты могут быть в dictations, если они привязаны к этому разделу
        const hasDictations = dictations && dictations.some(d => {
          // Проверяем, есть ли диктант, привязанный к этому разделу через book_dictations
          // Но в текущем контексте dictations - это диктанты верхнего уровня книги
          // Нужно всегда показывать кнопку, так как диктанты загружаются динамически
          return false; // Всегда показываем кнопку, так как диктанты могут быть загружены позже
        });
        
        // Кнопка показа/скрытия вложений - всегда показываем, так как диктанты загружаются динамически
        const toggleButton = `
              <button class="structure-item-toggle" data-section-id="${section.id}" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
        `;
        
        console.log(`🔘 Рендерю кнопку toggle для раздела ${section.id}:`, { hasChildSections, toggleButton: toggleButton ? 'есть' : 'нет' });
        
        html += `
          <div class="structure-item structure-section" data-section-id="${section.id}">
            <div class="structure-item-header">
              ${toggleButton}
              <span class="structure-item-title">${sectionNumber}${section.title}</span>
              <div class="structure-item-actions">
                <div class="dropdown-menu-wrapper">
                  <button class="btn-icon-sm dropdown-toggle" data-action="section-actions" data-section-id="${section.id}" title="Действия">
                    <i data-lucide="more-vertical"></i>
                  </button>
                  <div class="dropdown-menu section-actions-menu" data-section-id="${section.id}" style="display: none;">
                    <button class="dropdown-menu-item" data-action="add-subsection" data-section-id="${section.id}">
                      <i data-lucide="plus"></i>
                      <span>Добавить подраздел</span>
                    </button>
                    <button class="dropdown-menu-item" data-action="add-dictation" data-section-id="${section.id}">
                      <i data-lucide="plus"></i>
                      <span>Добавить диктант</span>
                    </button>
                    <button class="dropdown-menu-item" data-action="edit-section" data-section-id="${section.id}">
                      <i data-lucide="edit-3"></i>
                      <span>Редактировать раздел</span>
                    </button>
                    <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-section" data-section-id="${section.id}">
                      <i data-lucide="trash-2"></i>
                      <span>Удалить раздел</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="structure-item-content" data-section-content-id="${section.id}" style="display: none;">
              <div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>
            </div>
          </div>
        `;
      });
    }
    
    // Отображаем диктанты
    if (dictations && dictations.length > 0) {
      if (currentView === 'cards') {
        html += '</div>'; // Закрываем book-structure-list
        html += '<div class="shorts-grid">';
        dictations.forEach(d => {
          html += createDictationCard(d, false); // false = карточка для книги
        });
        html += '</div>';
        html = html.replace('</div><div class="shorts-grid">', '<div class="shorts-grid">'); // Убираем лишний закрывающий div если нет разделов
      } else {
        html += '<ul class="dictations-list">';
        dictations.forEach(d => {
          html += `
            <li class="dictation-list-item">
              <span class="dictation-list-title">${d.title}</span>
              <span class="dictation-list-meta">${d.language_code || ''} ${d.level ? `• ${d.level}` : ''}</span>
              <a href="/editor/${d.id}" target="_blank" class="btn-outline">Открыть</a>
            </li>
          `;
        });
        html += '</ul>';
      }
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // Создаём иконки Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Загружаем статистику и медальки для всех карточек диктантов
    setTimeout(() => {
      // Статистика (звезды/полузвезды/микрофон) только на столе, не в библиотеке
      updateCompletionBadges(container); // Медальки остаются
    }, 100);
  }

  async function toggleSection(sectionId) {
    console.log('🔄 toggleSection вызвана для раздела:', sectionId);
    const sectionItem = document.querySelector(`.structure-section[data-section-id="${sectionId}"]`);
    if (!sectionItem) {
      console.error('❌ Раздел не найден в DOM:', sectionId);
      return;
    }

    const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
    const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
    
    console.log('🔍 Элементы раздела:', { 
      sectionItem: !!sectionItem, 
      toggleBtn: !!toggleBtn, 
      contentDiv: !!contentDiv
    });
    
    if (!contentDiv) {
      console.error('❌ contentDiv не найден для раздела:', sectionId);
      return;
    }
    if (!toggleBtn) {
      console.error('❌ toggleBtn не найден для раздела:', sectionId);
      return;
    }

    const isExpanded = contentDiv.style.display !== 'none';
    
    // Ищем иконку - может быть внутри кнопки или как дочерний элемент
    let icon = toggleBtn.querySelector('i[data-lucide]');
    if (!icon) {
      // Если иконка не найдена, создаем её
      icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'chevron-right');
      toggleBtn.innerHTML = '';
      toggleBtn.appendChild(icon);
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
    
    if (isExpanded) {
      // Сворачиваем
      contentDiv.style.display = 'none';
      icon.setAttribute('data-lucide', 'chevron-right');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      // Раскрываем и загружаем диктанты
      contentDiv.style.display = 'block';
      icon.setAttribute('data-lucide', 'chevron-down');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      // Проверяем, загружены ли уже диктанты
      const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
      if (!existingContent || existingContent.classList.contains('section-dictations-loading')) {
        await loadSectionDictations(sectionId, contentDiv);
      }
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
              <a href="/editor/${d.id}" target="_blank" class="btn-secondary">Открыть</a>
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
            <a href="/editor/${d.id}" target="_blank" class="btn-outline">Открыть</a>
          </li>
        `).join('')}
      </ul>
    `;
  }

  // ==================== Модальное окно книги ====================

  function openBookModal(book) {
    // Очищаем предыдущий cropped blob
    croppedImageBlob = null;
    
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
    
    initBookLanguageSelector(book ? book.original_language : null);
    
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
    const parentId = parseInt(parentIdInput.value, 10);
    const sectionNumber = numberInput.value ? parseInt(numberInput.value, 10) : null;

    if (!titleInput.value.trim()) {
      showToast("Введите название раздела");
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

  // ==================== Crop Modal ====================
  
  function handleCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Проверяем, что это изображение
    if (!file.type.startsWith('image/')) {
      showToast('Пожалуйста, выберите изображение');
      return;
    }
    
    // Открываем crop modal
    const reader = new FileReader();
    reader.onload = (e) => {
      openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
  }
  
  function openCropModal(imageSrc) {
    const modal = document.getElementById("crop-modal");
    const image = document.getElementById("crop-image");
    
    if (!modal || !image) return;
    
    // Устанавливаем изображение
    image.src = imageSrc;
    
    // Показываем модальное окно
    modal.style.display = "flex";
    modal.classList.add("show");
    
    // Уничтожаем предыдущий cropper если есть
    if (cropper) {
      cropper.destroy();
    }
    
    // Инициализируем cropper с квадратным crop box 200x200
    cropper = new Cropper(image, {
      aspectRatio: 1, // Квадрат
      viewMode: 2,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      minCropBoxWidth: 100,
      minCropBoxHeight: 100,
    });
  }
  
  function closeCropModal(clearBlob = true) {
    const modal = document.getElementById("crop-modal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("show");
    }
    
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    
    // Очищаем blob только при отмене, НЕ при применении
    if (clearBlob) {
      croppedImageBlob = null;
      
      // Очищаем input только при отмене
      const coverUploadInput = document.getElementById("book-cover-upload");
      if (coverUploadInput) {
        coverUploadInput.value = '';
      }
    }
  }
  
  function handleCropConfirm() {
    if (!cropper) return;
    
    // Получаем canvas с обрезанным изображением (200x200)
    const canvas = cropper.getCroppedCanvas({
      width: 200,
      height: 200,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    
    if (!canvas) {
      showToast('Ошибка обрезки изображения');
      return;
    }
    
    // Конвертируем canvas в blob (webp)
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Ошибка создания изображения');
        return;
      }
      
      croppedImageBlob = blob;
      
      // Показываем preview в модальном окне книги
      const preview = document.getElementById("book-cover-preview");
      const placeholder = document.getElementById("book-cover-placeholder");
      
      if (preview && placeholder) {
        const url = URL.createObjectURL(blob);
        preview.src = url;
        preview.style.display = "block";
        placeholder.style.display = "none";
      }
      
      // Закрываем crop modal БЕЗ очистки blob
      closeCropModal(false);
      
      showToast('Обложка готова к сохранению');
    }, 'image/webp', 0.95);
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
          onLanguageChange: function(values) {}
        });
      }
    };

    initSelector();
  }

  function handleCoverUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Выберите изображение");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const coverPreview = document.getElementById("book-cover-preview");
      const coverPlaceholder = document.getElementById("book-cover-placeholder");
      if (coverPreview && coverPlaceholder) {
        coverPreview.src = e.target.result;
        coverPreview.style.display = "block";
        coverPlaceholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
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
      const hasCover = croppedImageBlob || coverUploadInput?.files[0];
      
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
        if (croppedImageBlob) {
          formData.append("cover", croppedImageBlob, "cover.webp");
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

      // Очищаем cropped blob
      croppedImageBlob = null;
      
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

  // ==================== Разделитель между зонами ====================
  
  function initZoneResizer() {
    const resizer = document.getElementById('zoneResizer');
    const booksZone = document.getElementById('booksZone');
    const libraryContent = document.querySelector('.library-content');
    
    if (!resizer || !booksZone || !libraryContent) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Восстанавливаем сохраненную ширину
    const savedWidth = localStorage.getItem('books-zone-width');
    if (savedWidth) {
      document.documentElement.style.setProperty('--books-zone-width', savedWidth + 'px');
    }

    const startResize = (e) => {
      isResizing = true;
      startX = e.clientX || e.touches[0].clientX;
      startWidth = booksZone.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const doResize = (e) => {
      if (!isResizing) return;
      
      const currentX = e.clientX || e.touches[0].clientX;
      const diff = currentX - startX;
      const newWidth = Math.max(200, Math.min(startWidth + diff, libraryContent.offsetWidth * 0.5));
      
      document.documentElement.style.setProperty('--books-zone-width', newWidth + 'px');
      localStorage.setItem('books-zone-width', newWidth.toString());
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
  }

  // ==================== Инициализация ====================
  
  function initEventHandlers() {
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

    // Кнопка публичной библиотеки
    const publicLibraryBtn = document.getElementById("btnPublicLibrary");
    if (publicLibraryBtn) {
      publicLibraryBtn.addEventListener("click", () => openPublicLibraryModal());
    }

    // Инициализация перетаскивания разделителя между зонами
    initZoneResizer();

    // Закрытие модального окна публичной библиотеки
    const publicLibraryCloseBtn = document.getElementById("public-library-close");
    if (publicLibraryCloseBtn) {
      publicLibraryCloseBtn.addEventListener("click", closePublicLibraryModal);
    }

    const publicLibraryModal = document.getElementById("public-library-modal");
    if (publicLibraryModal) {
      publicLibraryModal.addEventListener("click", (event) => {
        if (event.target === publicLibraryModal) {
          closePublicLibraryModal();
        }
      });
    }

    // Закрытие модального окна просмотра диктанта
    const viewDictationCloseBtn = document.getElementById("view-dictation-close");
    if (viewDictationCloseBtn) {
      viewDictationCloseBtn.addEventListener("click", () => {
        const modal = document.getElementById("view-dictation-modal");
        if (modal) {
          modal.style.display = "none";
        }
      });
    }

    const viewDictationModal = document.getElementById("view-dictation-modal");
    if (viewDictationModal) {
      viewDictationModal.addEventListener("click", (event) => {
        if (event.target === viewDictationModal) {
          viewDictationModal.style.display = "none";
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
    
    if (coverUploadBtn && coverUploadInput) {
      coverUploadBtn.addEventListener("click", () => {
        coverUploadInput.click();
      });
      coverUploadInput.addEventListener("change", handleCoverSelect);
    }
    
    if (coverClickable && coverUploadInput) {
      coverClickable.addEventListener("click", () => {
        coverUploadInput.click();
      });
    }
    
    // Crop modal controls
    const cropCloseBtn = document.getElementById("crop-close");
    const cropCancelBtn = document.getElementById("crop-cancel");
    const cropConfirmBtn = document.getElementById("crop-confirm");
    
    if (cropCloseBtn) {
      cropCloseBtn.addEventListener("click", closeCropModal);
    }
    if (cropCancelBtn) {
      cropCancelBtn.addEventListener("click", closeCropModal);
    }
    if (cropConfirmBtn) {
      cropConfirmBtn.addEventListener("click", handleCropConfirm);
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

    // Инициализация прокрутки desk
    // Обработчики для кнопок в карточках диктантов (делегирование событий)
    document.addEventListener('click', async (e) => {
      // Кнопка раскрытия/сворачивания раздела
      if (e.target.closest('.structure-item-toggle')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('.structure-item-toggle');
        const sectionId = btn.getAttribute('data-section-id');
        if (sectionId) {
          await toggleSection(sectionId);
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
          document.querySelectorAll('#bookActionsMenu').forEach(m => {
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
              const closeMenuHandler = function(e) {
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
        
        switch(action) {
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
        
        switch(action) {
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
          return;
        }
        // Игнорируем карточки на столе (они открываются для работы)
        if (card.classList.contains('desk-card')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const dictationId = card.getAttribute('data-dictation-id');
        if (dictationId) {
          toggleDictationOnDesk(dictationId);
        }
        return;
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

      // Кнопка "Удалить диктант"
      if (e.target.closest('[data-action="delete-dictation"]')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="delete-dictation"]');
        const dictationId = btn.getAttribute('data-dictation-id');
        console.log('🗑️ Удаляю диктант:', dictationId);
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
          removeFromDesk(itemId, dictationId);
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
    bookSelect.onchange = async function() {
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
        // Очищаем активную книгу
        activeBookId = null;
        const container = document.getElementById("activeBookCard");
        if (container) {
          container.innerHTML = '';
        }
        const structureContainer = document.getElementById("bookStructure");
        if (structureContainer) {
          structureContainer.innerHTML = '';
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
    if (!confirm("Вы уверены, что хотите удалить этот диктант? Действие необратимо.")) {
      return;
    }

    try {
      const dictIdStr = `dict_${dictationId}`;
      const response = await fetch(`/api/dictations/${encodeURIComponent(dictIdStr)}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Диктант удалён");
        // Перезагружаем активную книгу
        if (activeBookId) {
          await loadActiveBook(activeBookId);
        }
      } else {
        showToast(data.error || "Ошибка при удалении", "error");
      }
    } catch (error) {
      console.error("Ошибка удаления диктанта:", error);
      showToast("Ошибка при удалении", "error");
    }
  }

  // ==================== Статистика и медальки диктантов ====================

  // Загрузка статистики диктанта (звезды, полузвезды, микрофон)
  async function getDictationStats(dictationId) {
    if (!dictationId) {
      return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
    }

    const token = localStorage.getItem('jwt_token');
    const isAuthenticated = window.UM && typeof window.UM.isAuthenticated === 'function' && window.UM.isAuthenticated();
    if (!token || !isAuthenticated) {
      return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
    }

    try {
      // Получаем статистику из БД через API
      const response = await fetch(`/api/statistics/dictation_state/${dictationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const state = data.state;
        if (state) {
          // Вычисляем статистику из данных БД
          const draftStats = computeDraftStatistics(state);
          draftStats.hasDraft = true;
          return draftStats;
        }
      } else if (response.status === 401) {
        console.warn('Не авторизован для получения статистики');
      }
    } catch (error) {
      console.warn('Ошибка загрузки статистики диктанта:', dictationId, error);
    }

    return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
  }

  // Вычисление статистики из состояния диктанта
  function computeDraftStatistics(state) {
    const perSentence = state.per_sentence || {};
    let perfect = 0;
    let corrected = 0;
    let audio = 0;

    const toNumber = (value) => Number(value) || 0;

    // Если есть агрегированные значения - добавляем их как базу
    perfect += toNumber(state.number_of_perfect);
    corrected += toNumber(state.number_of_corrected);
    audio += toNumber(state.number_of_audio);

    Object.values(perSentence).forEach(sentence => {
      perfect += toNumber(sentence.number_of_perfect) + toNumber(sentence.circle_number_of_perfect || 0);
      corrected += toNumber(sentence.number_of_corrected) + toNumber(sentence.circle_number_of_corrected || 0);
      audio += toNumber(sentence.number_of_audio) + toNumber(sentence.circle_number_of_audio || 0);
    });

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

  // Кеш для количества выполнений
  let completionCountsCache = {};

  // Загрузка количества выполнений из БД
  async function loadCompletionCounts(container = null) {
    const targetContainer = container || document;
    const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');
    if (cards.length === 0) {
      return;
    }
    
    // Собираем все ID диктантов
    const dictationIds = Array.from(cards)
      .map(card => card.dataset.dictationId)
      .filter(id => id);
    
    if (dictationIds.length === 0) {
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
        body: JSON.stringify({ dictation_ids: dictationIds })
      });
      
      if (response.ok) {
        const result = await response.json();
        // Обновляем кеш, добавляя новые данные (не заменяя полностью)
        if (result.counts) {
          Object.assign(completionCountsCache, result.counts);
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
        badge.title = `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`;
        badge.setAttribute('aria-label', `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`);
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
    
    // Закрываем активную книгу, если она была открыта
    closePublicActiveBookZone();
    
    // Загружаем публичные книги
    await loadPublicBooks();
    
    // Инициализация перетаскивания разделителя для публичной библиотеки
    initPublicZoneResizer();
    
    // Обновляем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  function initPublicZoneResizer() {
    const resizer = document.getElementById('publicZoneResizer');
    const libraryContent = document.querySelector('.public-library-content');
    if (!resizer || !libraryContent) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    const startResize = (e) => {
      isResizing = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX);
      const booksZone = libraryContent.querySelector('.public-books-zone');
      if (booksZone) {
        startWidth = booksZone.offsetWidth;
      }
      libraryContent.classList.add('resizing');
      resizer.classList.add('resizing');
      e.preventDefault();
    };
    
    const doResize = (e) => {
      if (!isResizing) return;
      const currentX = e.clientX || (e.touches && e.touches[0].clientX);
      const diff = startX - currentX;
      const newWidth = startWidth + diff;
      const minWidth = 200;
      const maxWidth = libraryContent.offsetWidth * 0.7;
      const finalWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      libraryContent.style.setProperty('--public-books-zone-width', `${finalWidth}px`);
      e.preventDefault();
    };
    
    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        libraryContent.classList.remove('resizing');
        resizer.classList.remove('resizing');
        
        // Сохраняем ширину в localStorage
        const booksZone = libraryContent.querySelector('.public-books-zone');
        if (booksZone) {
          localStorage.setItem('publicBooksZoneWidth', booksZone.offsetWidth.toString());
        }
      }
    };
    
    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
    
    // Восстанавливаем сохраненную ширину
    const savedWidth = localStorage.getItem('publicBooksZoneWidth');
    if (savedWidth) {
      libraryContent.style.setProperty('--public-books-zone-width', `${savedWidth}px`);
    } else {
      libraryContent.style.setProperty('--public-books-zone-width', '280px');
    }
  }

  function closePublicLibraryModal() {
    const modal = document.getElementById("public-library-modal");
    if (modal) {
      modal.style.display = "none";
    }
    // Закрываем активную книгу при закрытии модального окна
    closePublicActiveBookZone();
  }

  let publicBooks = []; // Список публичных книг

  async function loadPublicBooks() {
    const list = document.getElementById("publicBooksList");
    if (!list) return;
    
    try {
      list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';
      
      const data = await apiRequest("/library/api/public-books?limit=200");
      if (data.success && data.books) {
        publicBooks = data.books;
        console.log('📚 Загружены публичные книги:', data.books.length);
        if (data.books.length > 0) {
          console.log('📚 Первая книга:', {
            id: data.books[0].id,
            creator_user_id: data.books[0].creator_user_id,
            creator_username: data.books[0].creator_username
          });
        }
        
        if (data.books.length === 0) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Публичных книг пока нет</div>';
          return;
        }
        
        // Используем функцию createMiniBookCard для единообразия
        list.innerHTML = data.books.map(book => createMiniBookCard(book)).join('');
        
        // Обновляем иконки Lucide
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          lucide.createIcons();
        }
        
        // Добавляем обработчики кликов на карточки
        list.querySelectorAll('.book-card-mini').forEach(card => {
          const bookId = parseInt(card.getAttribute('data-book-id'));
          const book = data.books.find(b => b.id === bookId);
          
          // Одиночный клик - выделить и показать детали
          card.addEventListener('click', async (e) => {
            if (e.target.closest('button')) return; // Игнорируем клики на кнопки
            setPublicActiveBook(bookId);
            // Загружаем полные данные книги через API
            try {
              const bookData = await apiRequest(`/library/api/book/${bookId}`);
              if (bookData.success && bookData.book) {
                openPublicActiveBookZone(bookData.book);
              } else if (book) {
                // Fallback на данные из списка
                openPublicActiveBookZone(book);
              }
            } catch (error) {
              console.error("Ошибка загрузки данных книги:", error);
              // Fallback на данные из списка
              if (book) {
                openPublicActiveBookZone(book);
              }
            }
          });
        });
      } else {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
      }
    } catch (error) {
      console.error("Ошибка загрузки публичных книг:", error);
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
    }
  }

  function setPublicActiveBook(bookId) {
    // Обновляем выделение в списке
    const list = document.getElementById("publicBooksList");
    if (list) {
      list.querySelectorAll('.book-card-mini').forEach(card => {
        if (parseInt(card.getAttribute('data-book-id')) === bookId) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
  }

  async function openPublicActiveBookZone(book) {
    const zone = document.getElementById("publicActiveBookZone");
    const container = document.getElementById("publicActiveBookCard");
    if (!zone || !container) return;

    zone.style.display = 'flex';
    
    // Показываем разделитель
    const libraryContent = document.querySelector('.public-library-content');
    const resizer = document.getElementById('publicZoneResizer');
    if (libraryContent) {
      libraryContent.classList.add('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'block';
    }
    
    // Сохраняем данные книги в глобальной переменной для использования в карточках диктантов
    window.currentPublicBook = book;
    
    // Используем существующую функцию renderActiveBookCard для единообразия
    await renderActiveBookCard(book, container);
    
    // Загружаем разделы и диктанты
    await loadPublicBookContent(book.id);
    
    // Меняем обработчик кнопки закрытия - закрываем только активную книгу в модальном окне
    const closeBtn = container.querySelector('#btnCloseActiveBook');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePublicActiveBookZone();
      };
    }
    
    // Заменяем меню действий на кнопку "Добавить на полку"
    const actionsBtn = container.querySelector('#btnBookActions');
    const actionsMenu = container.querySelector('#bookActionsMenu');
    if (actionsBtn && actionsMenu) {
      // Удаляем старое меню и создаем простое
      actionsBtn.onclick = null;
      actionsMenu.innerHTML = '';
      
      const addToShelfBtn = document.createElement('button');
      addToShelfBtn.className = 'dropdown-menu-item';
      addToShelfBtn.innerHTML = '<i data-lucide="plus"></i><span>Добавить на мою полку</span>';
      addToShelfBtn.addEventListener('click', async () => {
        await addPublicBookToShelf(book.id);
      });
      actionsMenu.appendChild(addToShelfBtn);
      
      // Восстанавливаем обработчик меню
      actionsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = actionsMenu.style.display === 'block';
        actionsMenu.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
          setTimeout(() => {
            const closeMenuHandler = function(e) {
              if (!actionsMenu.contains(e.target) && !actionsBtn.contains(e.target)) {
                actionsMenu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
              }
            };
            document.addEventListener('click', closeMenuHandler);
          }, 0);
        }
      });
    }
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  async function loadPublicBookContent(bookId) {
    try {
      // Загружаем разделы и диктанты
      const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
      const dictationsData = await apiRequest(`/library/api/book/${bookId}/dictations`);
      
      const sections = sectionsData.success ? sectionsData.sections : [];
      const dictations = dictationsData.success ? dictationsData.dictations : [];
      
      // Используем функцию renderBookContent, но с другим контейнером
      renderPublicBookContent(sections, dictations);
    } catch (error) {
      console.error("Ошибка загрузки содержимого публичной книги:", error);
    }
  }

  function renderPublicBookContent(sections, dictations) {
    const container = document.getElementById("publicBookStructure");
    if (!container) return;
    
    // Используем ту же логику, что и в renderBookContent, но без кнопок редактирования
    if ((!sections || sections.length === 0) && (!dictations || dictations.length === 0)) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
      return;
    }

    let html = '<div class="book-structure-list">';
    
    // Отображаем разделы (без кнопок редактирования)
    if (sections && sections.length > 0) {
      sections.forEach(section => {
        const sectionNumber = section.section_number ? `§ ${section.section_number}. ` : '§ ';
        
        const toggleButton = `
              <button class="structure-item-toggle" data-section-id="${section.id}" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
        `;
        
        html += `
          <div class="structure-item structure-section" data-section-id="${section.id}">
            <div class="structure-item-header">
              ${toggleButton}
              <span class="structure-item-title">${sectionNumber}${section.title}</span>
            </div>
            <div class="structure-item-content" data-section-content-id="${section.id}" style="display: none;">
              <div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>
            </div>
          </div>
        `;
      });
    }
    
    // Отображаем диктанты
    if (dictations && dictations.length > 0) {
      html += '</div>'; // Закрываем book-structure-list
      html += '<div class="shorts-grid">';
      // Получаем данные книги из контекста
      const bookData = window.currentPublicBook || null;
      dictations.forEach(d => {
        html += createPublicDictationCard(d, bookData);
      });
      html += '</div>';
    } else {
      html += '</div>';
    }
    
    container.innerHTML = html;
    
    // Создаём иконки Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Добавляем обработчики для раскрытия разделов
    container.querySelectorAll('.structure-item-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sectionId = parseInt(btn.getAttribute('data-section-id'));
        await togglePublicSection(sectionId);
      });
    });
    
    // Добавляем обработчики для кнопок карточек диктантов
    attachPublicDictationCardHandlers(container);
    
    // Загружаем статистику и медальки для всех карточек диктантов
    setTimeout(() => {
      updateCompletionBadges(container);
    }, 100);
  }

  async function togglePublicSection(sectionId) {
    const sectionItem = document.querySelector(`#publicBookStructure .structure-section[data-section-id="${sectionId}"]`);
    if (!sectionItem) return;

    const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
    const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
    
    if (!contentDiv || !toggleBtn) return;

    const isExpanded = contentDiv.style.display !== 'none';
    
    let icon = toggleBtn.querySelector('i[data-lucide]');
    if (!icon) {
      icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'chevron-right');
      toggleBtn.innerHTML = '';
      toggleBtn.appendChild(icon);
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
    
    if (isExpanded) {
      contentDiv.style.display = 'none';
      icon.setAttribute('data-lucide', 'chevron-right');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      contentDiv.style.display = 'block';
      icon.setAttribute('data-lucide', 'chevron-down');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
      if (!existingContent || existingContent.classList.contains('section-dictations-loading')) {
        await loadPublicSectionDictations(sectionId, contentDiv);
      }
    }
  }

  async function loadPublicSectionDictations(sectionId, container) {
    try {
      const dictationsData = await apiRequest(`/library/api/book/${sectionId}/dictations`);
      const dictations = dictationsData.success ? dictationsData.dictations : [];
      
      const loadingDiv = container.querySelector('.section-dictations-loading');
      if (loadingDiv) {
        loadingDiv.remove();
      }
      
      if (dictations.length === 0) {
        container.innerHTML = '<div class="section-dictations-empty" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">В этом разделе нет диктантов</div>';
        return;
      }
      
      // Рендерим диктанты как карточки (используем функцию для публичной библиотеки)
      let html = '<div class="section-dictations-grid shorts-grid">';
      // Получаем данные книги из контекста
      const bookData = window.currentPublicBook || null;
      dictations.forEach(d => {
        html += createPublicDictationCard(d, bookData);
      });
      html += '</div>';
      
      container.innerHTML = html;
      
      // Обновляем иконки и медальки
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      setTimeout(() => {
        updateCompletionBadges(container);
      }, 100);
    } catch (error) {
      console.error("Ошибка загрузки диктантов раздела:", error);
      container.innerHTML = '<div class="section-dictations-error" style="padding: 20px; text-align: center; color: var(--color-error);">Ошибка загрузки диктантов</div>';
    }
  }

  function attachPublicDictationCardHandlers(container) {
    // Обработчик кнопки "Взять в работу"
    container.querySelectorAll('[data-action="add-to-work"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dictationId = parseInt(btn.getAttribute('data-dictation-id'));
        const bookId = parseInt(btn.getAttribute('data-book-id'));
        await addDictationToWork(dictationId, bookId);
      });
    });
    
    // Обработчик кнопки "Просмотреть диктант"
    container.querySelectorAll('[data-action="view-dictation"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dictationId = parseInt(btn.getAttribute('data-dictation-id'));
        const bookIdAttr = btn.getAttribute('data-book-id');
        const bookId = bookIdAttr && bookIdAttr !== '' ? parseInt(bookIdAttr) : null;
        await openViewDictationModal(dictationId, bookId);
      });
    });
  }

  async function addDictationToWork(dictationId, bookId) {
    try {
      // Сначала добавляем книгу в библиотеку, если её там нет
      const bookData = await apiRequest(`/library/api/book/${bookId}/add-to-my`, {
        method: "POST",
        body: JSON.stringify({})
      });
      
      if (bookData.success) {
        // Теперь добавляем диктант на стол
        const deskData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
          method: "POST",
          body: JSON.stringify({})
        });
        
        if (deskData.success) {
          showToast('Диктант добавлен в работу');
          // Обновляем иконку кнопки
          const btn = document.querySelector(`[data-action="add-to-work"][data-dictation-id="${dictationId}"]`);
          if (btn) {
            const icon = btn.querySelector('i[data-lucide]');
            if (icon) {
              icon.setAttribute('data-lucide', 'notebook-pen');
              if (typeof lucide !== 'undefined') {
                lucide.createIcons();
              }
            }
          }
        } else {
          showToast('Ошибка при добавлении диктанта в работу', 'error');
        }
      } else {
        showToast('Ошибка при добавлении книги в библиотеку', 'error');
      }
    } catch (error) {
      console.error("Ошибка добавления диктанта в работу:", error);
      showToast('Ошибка при добавлении диктанта в работу', 'error');
    }
  }

  async function openViewDictationModal(dictationId, bookId = null) {
    const modal = document.getElementById("view-dictation-modal");
    if (!modal) {
      console.error("Модальное окно view-dictation-modal не найдено");
      return;
    }
    
    modal.style.display = "flex";
    
    // Показываем индикатор загрузки
    const tbody = document.getElementById("view-dictation-sentences-tbody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Загрузка...</td></tr>';
    }
    
    try {
      console.log('📖 Загружаю данные диктанта:', dictationId);
      
      // Загружаем данные диктанта
      const dictationData = await apiRequest(`/api/dictation/${dictationId}`);
      console.log('📖 Данные диктанта получены:', dictationData);
      
      if (dictationData.success && dictationData.dictation) {
        const d = dictationData.dictation;
        
        // Устанавливаем заголовок
        const titleEl = document.getElementById("view-dictation-title");
        if (titleEl) {
          titleEl.textContent = d.title || 'Без названия';
        }
        
        // Устанавливаем обложку
        const coverImg = document.getElementById("view-dictation-cover-img");
        if (coverImg) {
          coverImg.src = d.cover_url || '/static/data/covers/cover_en.webp';
          coverImg.alt = d.title || 'Обложка диктанта';
        }
        
        
        // Устанавливаем ссылку на материалы автора
        const materialsLink = document.getElementById("view-dictation-materials-link");
        if (materialsLink) {
          if (d.author_materials_url) {
            materialsLink.href = d.author_materials_url;
            materialsLink.style.display = 'inline-flex';
          } else {
            materialsLink.style.display = 'none';
          }
        }
        
        // Загружаем предложения
        console.log('📖 Загружаю предложения диктанта:', dictationId);
        const sentencesData = await apiRequest(`/api/dictation/${dictationId}/sentences`);
        console.log('📖 Предложения получены:', sentencesData);
        
        if (sentencesData.success && sentencesData.sentences && sentencesData.sentences.length > 0) {
          if (tbody) {
            tbody.innerHTML = sentencesData.sentences.map((sentence, index) => {
              const audioUrl = sentence.audio || '';
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${sentence.text || ''}</td>
                  <td>
                    ${audioUrl ? `
                      <button class="btn-play-audio" data-audio-url="${audioUrl}" title="Проиграть">
                        <i data-lucide="play"></i>
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('');
            
            // Добавляем обработчики для кнопок проигрывания через AudioManager
            // AudioManager доступен глобально после загрузки audio_manager.js
            const audioMgr = typeof audioManager !== 'undefined' ? audioManager : (typeof window.AudioManager !== 'undefined' ? window.AudioManager : null);
            if (audioMgr && typeof audioMgr.play === 'function') {
              tbody.querySelectorAll('.btn-play-audio').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const audioUrl = btn.getAttribute('data-audio-url');
                  if (audioUrl) {
                    audioMgr.play(btn, audioUrl);
                  }
                });
              });
            } else {
              console.warn('AudioManager не найден, используем стандартное воспроизведение');
              tbody.querySelectorAll('.btn-play-audio').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  const audioUrl = btn.getAttribute('data-audio-url');
                  if (audioUrl) {
                    const audio = new Audio(audioUrl);
                    audio.play().catch(err => console.error("Ошибка воспроизведения:", err));
                  }
                });
              });
            }
          }
        } else {
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-text-secondary);">В диктанте нет предложений</td></tr>';
          }
        }
        
        // Обновляем иконки
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      } else {
        console.error("Некорректные данные диктанта:", dictationData);
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-error);">Ошибка загрузки данных диктанта</td></tr>';
        }
        showToast('Ошибка загрузки данных диктанта', 'error');
      }
    } catch (error) {
      console.error("Ошибка загрузки данных диктанта:", error);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-error);">Ошибка: ${error.message || 'Неизвестная ошибка'}</td></tr>`;
      }
      showToast(`Ошибка загрузки данных диктанта: ${error.message || 'Неизвестная ошибка'}`, 'error');
    }
  }

  function closePublicActiveBookZone() {
    const zone = document.getElementById("publicActiveBookZone");
    if (zone) {
      zone.style.display = 'none';
    }
    
    const libraryContent = document.querySelector('.public-library-content');
    const resizer = document.getElementById('publicZoneResizer');
    if (libraryContent) {
      libraryContent.classList.remove('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'none';
    }
    
    // Убираем выделение
    const list = document.getElementById("publicBooksList");
    if (list) {
      list.querySelectorAll('.book-card-mini').forEach(card => {
        card.classList.remove('active');
      });
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
        // Открываем книгу в основной библиотеке
        const bookData = await apiRequest(`/library/api/book/${bookId}`);
        if (bookData.success && bookData.book) {
          setActiveBook(bookId);
          openActiveBookZone(bookData.book);
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

      const userSettings = window.USER_LANGUAGE_DATA;
      
      if (!userSettings) {
        console.warn('⚠️ USER_LANGUAGE_DATA не загружен');
        return;
      }

      if (typeof window.initLanguageSelector === 'function') {
        const options = {
          mode: 'learning-selector-compact',
          currentLearning: userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en',
          learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
          languageData: window.LanguageManager.getLanguageData(),
          onLanguageChange: function (values) {
            console.log('🔄 Изменение языка изучения в панели "Мои книги":', values);
            // Здесь можно добавить логику обновления фильтрации книг по языку
          }
        };

        console.log('🎯 Создаем LanguageSelector для панели "Мои книги"');
        const selector = window.initLanguageSelector('booksLanguageSelector', options);
        
        if (selector) {
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
  function loadLibraryData() {
    loadDeskItems();
    loadBooksFromAPI();
  }

  // Инициализация при загрузке страницы
  document.addEventListener("DOMContentLoaded", async () => {
    initEventHandlers();
    
    // Ждем пока UserManager инициализируется и завершит валидацию токена
    const waitForUserManager = setInterval(() => {
      if (window.UM && typeof window.UM.isAuthenticated === 'function') {
        // КРИТИЧНО: ждем завершения асинхронной инициализации
        // UserManager инициализируется асинхронно через init(), нужно дождаться isInitialized
        if (window.UM.isInitialized) {
          clearInterval(waitForUserManager);
          
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
          
          // Инициализируем селектор языка после загрузки данных пользователя
          // Используем setTimeout для гарантии готовности DOM
          setTimeout(() => {
            initializeBooksLanguageSelector();
          }, 100);
          
          // Загружаем данные только если пользователь авторизован
          if (isAuthenticated) {
            console.log('📚 Пользователь авторизован, загружаем данные библиотеки');
            loadDeskItems();
            loadBooksFromAPI();
          } else {
            console.log('⚠️ Пользователь не авторизован, данные не загружаются');
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
        }
      }
    });
    
    // Таймаут на случай, если UserManager не загрузится
    setTimeout(() => {
      clearInterval(waitForUserManager);
      if (!window.USER_LANGUAGE_DATA) {
        window.USER_LANGUAGE_DATA = {
          nativeLanguage: 'ru',
          learningLanguages: ['en'],
          currentLearning: 'en',
          isAuthenticated: false
        };
        setTimeout(() => {
          initializeBooksLanguageSelector();
        }, 100);
        loadDeskItems();
        loadBooksFromAPI();
      }
    }, 5000);
  });
})();

