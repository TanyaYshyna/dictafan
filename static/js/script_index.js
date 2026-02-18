if (!window.UM) {
    console.error('❌ UserManager не загружен! Проверьте порядок загрузки скриптов');
    // Создаем заглушку
    window.UM = {
        isAuthenticated: () => false,
        getCurrentUser: () => null,
        updateProfile: async () => { throw new Error('UM not loaded') }
    };
}

// Берём контейнер для сетки карточек
const GRID = document.getElementById('dictationsGrid');
let language_original = "en";
let language_translation = "ru";
let selectedCategory = null;
let selectedCategoryForDictation = null; // Сохраняем категорию для создания диктанта
let languageFilterUI = null;
let languageFilterOutsideHandler = null;

function getNodeLanguageContext(node) {
    let current = node;
    while (current) {
        const data = current.data || {};
        if (data.language_original && data.language_translation) {
            return {
                language_original: data.language_original,
                language_translation: data.language_translation
            };
        }
        current = current.parent;
    }
    return null;
}

function canAddCategoryChild(node) {
    if (!node || node.isRoot()) {
        return false;
    }
    const context = getNodeLanguageContext(node);
    return !!(context && context.language_translation);
}

async function fetchCategoriesFromServer(activeKey = null) {
    try {
        const response = await fetch('/api/categories/tree');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        allCategoriesData = await response.json();
        if (activeKey && categoriesTree) {
            const node = categoriesTree.getNodeByKey(activeKey);
            if (node) {
                selectedCategory = node;
            }
        }
        return true;
    } catch (error) {
        console.error('❌ Не удалось обновить категории с сервера:', error);
        return false;
    }
}

async function renameCategoryOnServer(key, title) {
    const response = await fetch(`/api/categories/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Server returned ${response.status}`);
    }

    return result.node;
}

// Убеждаемся, что в данных категорий есть родительский и дочерний узел для выбранной языковой пары
function ensureLanguageNodesLocally(treeData, learningLang, nativeLang) {
    const result = {
        createdParent: false,
        createdPair: false
    };

    if (!treeData || !learningLang) {
        return result;
    }

    treeData.children = treeData.children || [];

    let parentNode = treeData.children.find(child => {
        const data = child.data || {};
        return data.language_original === learningLang && !data.language_translation;
    });

    if (!parentNode) {
        const langManager = window.LanguageManager;
        const title = langManager && typeof langManager.getLanguageName === 'function'
            ? langManager.getLanguageName(learningLang, 'en')
            : learningLang.toUpperCase();

        parentNode = {
            expanded: false,
            folder: true,
            key: learningLang,
            title: title,
            data: {
                language_original: learningLang,
                language_translation: ""
            },
            children: []
        };

        treeData.children.push(parentNode);
        result.createdParent = true;
    } else {
        parentNode.children = parentNode.children || [];
    }

    if (!nativeLang) {
        return result;
    }

    let pairNode = parentNode.children.find(child => {
        const data = child.data || {};
        return data.language_original === learningLang && data.language_translation === nativeLang;
    });

    if (!pairNode) {
        pairNode = {
            expanded: false,
            folder: true,
            key: `${learningLang}${nativeLang}`,
            title: `${learningLang}=>${nativeLang}`,
            data: {
                language_original: learningLang,
                language_translation: nativeLang,
                dictations: []
            },
            children: []
        };

        parentNode.children.push(pairNode);
        result.createdPair = true;
    } else {
        pairNode.data = pairNode.data || {};
        pairNode.data.dictations = pairNode.data.dictations || [];
        pairNode.children = pairNode.children || [];
    }

    return result;
}

// Сохраняем языковую пару на сервере (idempotent)
async function persistLanguagePair(learningLang, nativeLang) {
    if (!learningLang || !nativeLang) {
        return;
    }

    try {
        const response = await fetch('/api/categories/ensure-language-pair', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                language_original: learningLang,
                language_translation: nativeLang
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        console.log('🔄 Синхронизация языковой пары с сервером:', data);
    } catch (error) {
        console.error('❌ Не удалось синхронизировать языковую пару с сервером', error);
    }
}



console.log('✅ script_index.js загружен');
console.log('UserManager:', window.UM);
console.log('LanguageManager:', window.LanguageManager);



async function saveLanguageSettings(values) {
    // ✅ Безопасная проверка метода isAuthenticated
    const isAuthenticated = window.UM && typeof window.UM.isAuthenticated === 'function'
        ? window.UM.isAuthenticated()
        : false;

    if (!isAuthenticated) {
        console.log('Пользователь не авторизован, настройки не сохраняются');
        localStorage.setItem('tempLanguageSettings', JSON.stringify(values));
        return;
    }

    try {
        console.log('Сохранение языковых настроек:', values);

        // РЕАЛЬНОЕ СОХРАНЕНИЕ через UserManager
        const updateData = {
            native_language: values.nativeLanguage,
            learning_languages: values.learningLanguages,
            current_learning: values.currentLearning
        };

        const updatedUser = await window.UM.updateProfile(updateData);
        console.log('Настройки сохранены:', updatedUser);

        // Обновляем локальные данные
        // ✅ ВАЖНО: Обновляем локальные данные ТОЛЬКО если сервер вернул правильные
        // Если сервер вернул старые данные - используем НАШИ новые данные
        if (updatedUser.current_learning === values.currentLearning) {
            window.USER_LANGUAGE_DATA = {
                nativeLanguage: updatedUser.native_language,
                learningLanguages: updatedUser.learning_languages,
                currentLearning: updatedUser.current_learning,
                isAuthenticated: true
            };
        } else {
            // ❌ Сервер вернул старые данные - используем НАШИ
            console.warn('⚠️ Сервер вернул старые данные, используем локальные');
            window.USER_LANGUAGE_DATA = {
                nativeLanguage: values.nativeLanguage,
                learningLanguages: values.learningLanguages,
                currentLearning: values.currentLearning,
                isAuthenticated: true
            };
        }

        // ✅ ОБНОВЛЯЕМ LanguageSelector с ПРАВИЛЬНЫМИ данными
        if (window.headerLanguageSelector) {
            window.headerLanguageSelector.setValues({
                nativeLanguage: window.USER_LANGUAGE_DATA.nativeLanguage,
                learningLanguages: window.USER_LANGUAGE_DATA.learningLanguages,
                currentLearning: window.USER_LANGUAGE_DATA.currentLearning
            });
        }
    } catch (error) {
        console.error('Ошибка сохранения языковых настроек:', error);
        // При ошибке всё равно обновляем локально
        window.USER_LANGUAGE_DATA = {
            nativeLanguage: values.nativeLanguage,
            learningLanguages: values.learningLanguages,
            currentLearning: values.currentLearning,
            isAuthenticated: true
        };
    }
}

function reloadDictationsWithNewLanguages() {
    // Перезагружаем текущие диктанты с новыми языками
    if (categoriesTree && categoriesTree.getActiveNode()) {
        const node = categoriesTree.getActiveNode();
        const ids = node.data.dictations || [];
        const filteredDictations = allDictations.filter(d => ids.includes(d.id));
        renderDictationsGrid(filteredDictations);
    }
}

// Путь к обложке диктанта:
// 1) если в JSON есть d.cover — используем его,
// 2) иначе пытаемся подставить стандартный путь по id,
// 3) если картинка не найдётся — в onerror подменим на плейсхолдер.
// Путь к обложке диктанта:
async function coverPath(d) {
    //   if (d.cover) return d.cover;
    //   if (d.preview_image) return d.preview_image;

    if (d.id) {
        const idStr = String(d.id).trim();
        const folderId = (idStr.startsWith('dict_') || idStr.startsWith('dicta_')) ? idStr : `dict_${idStr}`;
        const coverUrl = `/static/data/dictations/${folderId}/cover.webp`;
        try {
            const response = await fetch(coverUrl, { method: 'HEAD' });
            if (response.ok) return coverUrl;
        } catch (e) {
            console.warn(`Не удалось проверить наличие обложки ${coverUrl}`, e);
        }
    }

    // плейсхолдер в статической папке
    return '/static/images/cover_en.webp';
}


// Собрать одну карточку диктанта как DOM-дерево
function createCardDOM(d) {
    // Ссылки «открыть» и «редактировать»
    // const openUrl = d.openUrl || (d.link ? hrefFromHTML(d.link) : '#');
    // const editUrl = d.editUrl || (d.link_red ? hrefFromHTML(d.link_red) : openUrl);
    const openUrl = `/dictation/${d.id}/${language_original}/${language_translation}`;
    
    // Для редактирования используем простой URL (категория будет загружена из диктанта)
    const editUrl = `/dictation_editor/${d.id}/${language_original}/${language_translation}`;

    // <article class="short-card">
    const card = document.createElement('article');
    card.className = 'short-card';
    card.dataset.dictationId = d.id; // Сохраняем ID для обновления медалек

    // Цвет рамки из JSON: d.color, например "var(--color-button-orange)" или "#aabbcc"
    if (d.color) card.style.setProperty('--card-accent', d.color);

    // <a class="short-thumb" href="..."><img .../></a>
    const thumb = document.createElement('a');
    thumb.className = 'short-thumb';
    thumb.href = openUrl;
    thumb.setAttribute('aria-label', `Открыть диктант: ${d.title || ''}`);

    const img = document.createElement('img');
    img.src = d.cover_url || '/static/data/covers/cover_en.webp';
    img.alt = d.title || 'Обложка диктанта';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { img.src = '/static/data/covers/cover_en.webp'; };

    thumb.appendChild(img);
    card.appendChild(thumb);

    // <h3 class="short-title"><a href="...">Название</a></h3>
    const h3 = document.createElement('h3');
    h3.className = 'short-title';
    const titleLink = document.createElement('a');
    titleLink.href = openUrl;
    titleLink.textContent = d.title || 'Без названия';
    h3.appendChild(titleLink);
    card.appendChild(h3);

    // Получаем количество предложений (загружаем асинхронно если нужно)
    const sentencesCount = d.sentences_count || d.sentences?.length || 0;
    
    // Создаем контейнер для ID и количества предложений
    const idContainer = document.createElement('div');
    idContainer.className = 'short-id-container';
    
    // Стопка бумаг - количество предложений (перед ID) - всегда видна
    const papersIcon = document.createElement('div');
    papersIcon.className = 'short-sentences-count';
    papersIcon.title = `Количество предложений: ${sentencesCount || 0}`;
    papersIcon.innerHTML = `<i data-lucide="layers"></i><span>${sentencesCount || 0}</span>`;
    idContainer.appendChild(papersIcon);
    
    // ID диктанта
    const diktNumber = d.Dikt_numer || d.dikt_numer || d.id;
    if (diktNumber) {
        const diktBadge = document.createElement('div');
        diktBadge.className = 'short-dikt-number';
        diktBadge.textContent = diktNumber;
        idContainer.appendChild(diktBadge);
    }
    
    // Контейнер всегда добавляется (хотя бы с количеством предложений)
    card.appendChild(idContainer);

    // Медалька с количеством выполнений будет добавлена функцией updateCompletionBadges()
    // после загрузки истории (не создаем здесь, так как история может быть еще не загружена)

    // Добавляем статистику диктанта (асинхронно)
    const statsContainer = document.createElement('div');
    statsContainer.className = 'short-stats';
    statsContainer.innerHTML = '<div class="stats-placeholder"></div>';
    card.appendChild(statsContainer);

    // Загружаем статистику асинхронно
    // Статистика показывается ТОЛЬКО если есть незаконченный документ (черновик)
    const renderStatsIcons = (stats = {}) => {
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
            statsContainer.innerHTML = '<div class="stats-placeholder"></div>';
            return;
        }

        statsContainer.innerHTML = '';
        const statsIcons = document.createElement('div');
        statsIcons.className = 'stats-icons';

        metrics.forEach(metric => {
            const el = document.createElement('div');
            el.className = metric.className;
            el.title = `${metric.title}: ${metric.value}`;
            el.innerHTML = `<i data-lucide="${metric.icon}"></i><span>${metric.value}</span>`;
            statsIcons.appendChild(el);
        });

        statsContainer.appendChild(statsIcons);

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    };
    
    getDictationStats(d.id)
        .then(stats => renderStatsIcons(stats))
        .catch(error => {
            console.warn('Ошибка загрузки статистики для диктанта:', d.id, error);
            renderStatsIcons({ perfect: 0, corrected: 0, audio: 0 });
        });

    // <div class="short-meta">Флаги языков • Уровень ...</div>
    const meta = document.createElement('div');
    meta.className = 'short-meta';
    
    // Создаем контейнер для флагов
    const flagsContainer = document.createElement('span');
    flagsContainer.className = 'short-lang-flags';
    
    // Получаем языки из разных возможных полей
    const langOriginal = d.language_original || d.language || d.langIcon || '';
    const langTranslation = d.language_translation || d.translations || '';
    
    // Используем готовый компонент LanguageSelector (если загружен)
    if (window.LanguageManager && typeof LanguageSelector !== 'undefined' && langOriginal) {
        try {
            const languageData = window.LanguageManager.getLanguageData ? window.LanguageManager.getLanguageData() : null;
            if (languageData) {
                const tempContainer = document.createElement('div');
                new LanguageSelector({
                    container: tempContainer,
                    mode: 'flag-combo',
                    nativeLanguage: langTranslation,
                    currentLearning: langOriginal,
                    languageData
                });
                flagsContainer.innerHTML = tempContainer.innerHTML;
                
                // Заменяем текстовую стрелку на иконку Lucide
                const separator = flagsContainer.querySelector('.flag-separator');
                if (separator) {
                    separator.innerHTML = '<i data-lucide="arrow-big-right"></i>';
                }
            } else {
                flagsContainer.textContent = langTranslation
                    ? `${langOriginal} ⇒ ${langTranslation}`
                    : langOriginal;
            }
        } catch (error) {
            console.warn('Ошибка создания флагов для', langOriginal, langTranslation, ':', error);
            flagsContainer.textContent = langTranslation
                ? `${langOriginal} ⇒ ${langTranslation}`
                : langOriginal;
        }
    } else {
        // Fallback: текстовое представление языков
        flagsContainer.textContent = langTranslation
            ? `${langOriginal} ⇒ ${langTranslation}`
            : langOriginal;
    }
    
    meta.appendChild(flagsContainer);
    
    // Уровень
    const levelSpan = document.createElement('span');
    levelSpan.className = 'short-level';
    levelSpan.textContent = d.level || '—';
    meta.appendChild(levelSpan);
    
    // Кнопка для открытия ссылки на материалы автора (если есть)
    if (d.author_materials_url) {
        const authorLinkBtn = document.createElement('button');
        authorLinkBtn.type = 'button';
        authorLinkBtn.className = 'short-action-btn';
        authorLinkBtn.title = 'Открыть материалы автора';
        authorLinkBtn.setAttribute('aria-label', 'Открыть материалы автора');
        authorLinkBtn.innerHTML = `<i data-lucide="external-link"></i>`;
        authorLinkBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open(d.author_materials_url, '_blank');
        });
        meta.appendChild(authorLinkBtn);
    }
    
    card.appendChild(meta);
    
    // Сохраняем ID диктанта в data-атрибуте для обновления медалек
    card.dataset.dictationId = d.id;

    const actions = document.createElement('div');
    actions.className = 'short-actions';

    const editBtn = document.createElement('a');
    editBtn.className = 'short-action-btn';
    editBtn.href = editUrl;
    editBtn.title = 'Редактировать';
    editBtn.setAttribute('aria-label', 'Редактировать');
    editBtn.innerHTML = `<i data-lucide="pencil-ruler"></i>`;
    actions.appendChild(editBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'short-action-btn';
    moveBtn.title = 'Перенести в другую категорию';
    moveBtn.setAttribute('aria-label', 'Перенести в другую категорию');
    moveBtn.innerHTML = `<i data-lucide="folder-symlink"></i>`;
    moveBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openMoveDictationModal(d);
    });
    actions.appendChild(moveBtn);

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'short-action-btn';
    downloadBtn.title = 'Скачать диктант';
    downloadBtn.setAttribute('aria-label', 'Скачать диктант');
    downloadBtn.innerHTML = `<i data-lucide="download"></i>`;
    downloadBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        exportDictation(d);
    });
    actions.appendChild(downloadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'short-action-btn danger';
    deleteBtn.title = 'Удалить диктант';
    deleteBtn.setAttribute('aria-label', 'Удалить диктант');
    deleteBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
    deleteBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteDictationWithConfirmation(d);
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    return card;
}

// Обновить медальки на всех карточках
async function updateCompletionBadges() {
    if (!GRID) {
        console.log('[updateCompletionBadges] GRID не найден');
        return;
    }
    
    const cards = GRID.querySelectorAll('.short-card');
    console.log(`[updateCompletionBadges] Найдено ${cards.length} карточек для обновления`);
    
    // Загружаем данные из БД, если кеш пуст
    if (Object.keys(completionCountsCache).length === 0) {
        await loadCompletionCounts();
    }
    
    cards.forEach(card => {
        const dictationId = card.dataset.dictationId;
        if (!dictationId) {
            console.log('[updateCompletionBadges] Карточка без dictationId');
            return;
        }
        
        const completionCount = countDictationCompletions(dictationId);
        let badge = card.querySelector('.short-completion-badge');
        
        if (completionCount > 0) {
            if (!badge) {
                // Создаем новую медальку
                badge = document.createElement('div');
                badge.className = 'short-completion-badge';
                badge.dataset.dictationId = dictationId; // Сохраняем ID для обработчика
                card.appendChild(badge);
                console.log(`[updateCompletionBadges] Создана медалька для диктанта ${dictationId}: ${completionCount} выполнений`);
                
                // Добавляем обработчик клика только один раз при создании
                badge.style.cursor = 'pointer';
                badge.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const clickedDictationId = e.currentTarget.dataset.dictationId;
                    if (clickedDictationId && typeof DictationsReport !== 'undefined') {
                        await DictationsReport.open(clickedDictationId);
                    }
                });
            } else {
                console.log(`[updateCompletionBadges] Обновлена медалька для диктанта ${dictationId}: ${completionCount} выполнений`);
            }
            badge.title = `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`;
            badge.setAttribute('aria-label', `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`);
            badge.innerHTML = `<i data-lucide="award"></i><span class="completion-count">${completionCount}</span>`;
        } else if (badge) {
            // Удаляем медальку, если выполнений нет
            badge.remove();
            console.log(`[updateCompletionBadges] Удалена медалька для диктанта ${dictationId} (нет выполнений)`);
        }
    });
    
    // Обновить иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Отрисовать всю сетку
function renderDictationsGrid(dictations) {
    if (!GRID) {
        console.warn('#dictationsGrid не найден в DOM');
        return;
    }
    GRID.innerHTML = '';

    dictations.forEach(d => {
        const card = createCardDOM(d);
        GRID.appendChild(card);
    });

    // Обновить иконки Lucide (если библиотека подключена на странице)
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
    
    // Обновляем медальки после рендеринга (загружаем данные из БД)
    setTimeout(async () => {
        await updateCompletionBadges();
        // Обновляем иконки Lucide после добавления медалек
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }, 50);
}



// Функция для обновления языкового селектора при изменении данных пользователя
function updateLanguageSelector(userData) {
    if (!window.headerLanguageSelector) return;

    window.headerLanguageSelector.setValues({
        nativeLanguage: userData.nativeLanguage,
        learningLanguages: userData.learningLanguages,
        currentLearning: userData.currentLearning
    });
}

// Функция для загрузки данных пользователя
async function initializeUserData() {
    try {
        // Безопасная проверка на существование метода
        const isAuthenticated = window.UM && typeof window.UM.isAuthenticated === 'function'
            ? window.UM.isAuthenticated()
            : false;

        console.log('🔐 Проверка авторизации через JWT:', isAuthenticated);

        if (!isAuthenticated) {
            console.log('Пользователь не авторизован, используем настройки по умолчанию');
            window.USER_LANGUAGE_DATA = {
                nativeLanguage: 'ru',
                learningLanguages: ['en'],
                currentLearning: 'en',
                isAuthenticated: false
            };
            return;
        }

        // ДЛЯ АВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ - загружаем реальные данные из JWT
        const user = window.UM.getCurrentUser();
        console.log('Текущий пользователь из JWT:', user);

        if (!user) {
            throw new Error('Данные пользователя не найдены в JWT');
        }

        window.USER_LANGUAGE_DATA = {
            nativeLanguage: user.native_language || 'ru',
            learningLanguages: user.learning_languages || ['en'],
            currentLearning: user.current_learning || user.learning_languages?.[0] || 'en',
            isAuthenticated: true
        };

        if (window.headerLanguageSelector) {
            updateLanguageSelector(window.USER_LANGUAGE_DATA);
        }

        console.log('USER_LANGUAGE_DATA установлен:', window.USER_LANGUAGE_DATA);

    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        // Fallback на настройки по умолчанию
        window.USER_LANGUAGE_DATA = {
            nativeLanguage: 'ru',
            learningLanguages: ['en'],
            currentLearning: 'en',
            isAuthenticated: false
        };
    }
}

// оставляем
function initializeLanguageSelector() {
    try {
        const userSettings = window.USER_LANGUAGE_DATA;

        // ЕСЛИ УЖЕ ЕСТЬ СЕЛЕКТОР - ОБНОВЛЯЕМ, А НЕ СОЗДАЕМ НОВЫЙ
        if (window.headerLanguageSelector) {
            console.log('🔄 Обновление существующего LanguageSelector');
            window.headerLanguageSelector.setValues({
                nativeLanguage: userSettings.nativeLanguage,
                learningLanguages: userSettings.learningLanguages,
                currentLearning: userSettings.currentLearning
            });
            return;
        }

        if (typeof initLanguageSelector === 'function') {
            const options = {
                mode: 'header-selector',
                nativeLanguage: userSettings.nativeLanguage,
                learningLanguages: userSettings.learningLanguages,
                currentLearning: userSettings.currentLearning,
                languageData: window.LanguageManager.getLanguageData(),
                onLanguageChange: function (values) {
                    console.log('🔄 Языковой селектор: изменение языков', values);
                    try {
                        updateLanguages(values);
                    } catch (error) {
                        console.error('❌ Ошибка в обработчике изменения языков:', error);
                    }
                }
            };

            console.log('🎯 Создаем LanguageSelector с options:', options);
            const selector = initLanguageSelector('header-language-selector', options);

            if (selector) {
                console.log('✅ LanguageSelector создан успешно');
                // Сохраняем ссылку на селектор для возможного обновления
                window.headerLanguageSelector = selector;
            } else {
                console.warn('❌ LanguageSelector не был создан');
                createSimpleLanguageDisplay();
            }

        } else {
            console.warn('❌ Функция initLanguageSelector не найдена');
            createSimpleLanguageDisplay();
        }

    } catch (error) {
        console.error('❌ Ошибка инициализации языкового селектора:', error);
        createSimpleLanguageDisplay();
    }
}

// Простой fallback
function createSimpleLanguageDisplay() {
    const selectorContainer = document.getElementById('header-language-selector');
    if (!selectorContainer) return;

    console.warn('❌❌❌❌ что-то не так');

    const userSettings = window.USER_LANGUAGE_DATA || {
        nativeLanguage: 'ru',
        learningLanguages: ['en'],
        currentLearning: 'en'
    };

    selectorContainer.innerHTML = `
        <div class="simple-language-display">
            <span>${userSettings.currentLearning.toUpperCase()} → ${userSettings.nativeLanguage.toUpperCase()}</span>
        </div>
    `;
}



// ================ все диктанты в массив ========================
let allDictations = [];
// Кеш для количества завершений диктантов (загружается из БД)
let completionCountsCache = {};

function loadDictations() {
    // console.log("🔄 Загружаем диктанты...");

    return fetch('/dictations-list')
        .then(res => {
            if (!res.ok) throw new Error("Ошибка при получении списка диктантов");
            return res.json();
        })
        .then(data => {
            // console.log(`📦 Получено диктантов: ${data.length}`);
            allDictations = data;
        })
        .catch(err => console.error("❌ Ошибка загрузки диктантов:", err));
}

/**
 * Загрузить всю историю пользователя для подсчета выполнений
 */
async function loadAllHistory() {
    try {
        const token = localStorage.getItem('jwt_token');
        if (!token) {
            console.log('⚠️ Токен не найден, пропускаем загрузку истории');
            return {};
        }

        const response = await fetch('/user/api/history/all', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 422) {
                console.log('⚠️ Ошибка аутентификации при загрузке истории');
                return {};
            }
            throw new Error(`Failed to load all history: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Ошибка загрузки всей истории:', error);
        return {};
    }
}

/**
 * Подсчитать количество полных выполнений диктанта (использует данные из БД)
 * @param {string} dictationId - ID диктанта
 * @returns {number} - Количество полных выполнений
 */

/**
 * Загружает количество завершений для всех диктантов из БД
 */
async function loadCompletionCounts() {
    if (!GRID) {
        return;
    }
    
    const cards = GRID.querySelectorAll('.short-card');
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
            completionCountsCache = result.counts || {};
            console.log('[loadCompletionCounts] Загружены количества завершений:', completionCountsCache);
        } else {
            console.error('[loadCompletionCounts] Ошибка загрузки:', await response.text());
        }
    } catch (error) {
        console.error('[loadCompletionCounts] Ошибка при загрузке:', error);
    }
}

function countDictationCompletions(dictationId) {
    if (!dictationId) {
        return 0;
    }
    
    // Получаем из кеша
    const count = completionCountsCache[dictationId] || 0;
    
    if (count > 0) {
        console.log(`[countDictationCompletions] Диктант ${dictationId}: найдено ${count} выполнений`);
    }
    
    return count;
}

/**
 * Получить статистику диктанта из БД (perfect, corrected, audio)
 * @param {string} dictationId - ID диктанта
 * @returns {Object} - Объект с полями {perfect, corrected, audio, hasDraft}
 */
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
            console.warn('Не авторизован для получения состояния диктанта');
        }
    } catch (error) {
        console.warn('Ошибка получения черновика диктанта из БД:', error);
    }

    return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
}

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
        perfect += toNumber(sentence.number_of_perfect) + toNumber(sentence.circle_number_of_perfect);
        corrected += toNumber(sentence.number_of_corrected) + toNumber(sentence.circle_number_of_corrected);
        audio += toNumber(sentence.number_of_audio) + toNumber(sentence.circle_number_of_audio);
    });

    return {
        perfect,
        corrected,
        audio,
        hasDraft: false
    };
}




// ================ дерево FancyTree ========================
// Глобальная ссылка на дерево
let categoriesTree = null;
let allCategoriesData = null;
let lastAppliedIconHtml = '';

function chooseLucideIcon(name, fallback = 'folder') {
    if (typeof lucide !== 'undefined' && lucide.icons && lucide.icons[name]) {
        return name;
    }
    return fallback;
}

function getLucideIconSvg(iconName, size = 18) {
    const html = `<span class="tree-icon" data-lucide="${iconName}" aria-hidden="true" style="display:inline-flex;width:${size}px;height:${size}px;"></span>`;
    lastAppliedIconHtml = html;
    return html;
}

function nodeHasChildren(node) {
    if (!node) return false;
    if (node.children && node.children.length > 0) return true;
    if (node.lazy && !node.children) return true;
    return false;
}

function getTreeNodeIconName(node) {
    if (!node) {
        return chooseLucideIcon('file-text', 'folder');
    }

    if (node.isRoot && node.isRoot()) {
        return chooseLucideIcon('library', 'folder');
    }

    const data = node.data || {};
    const hasOriginal = !!data.language_original;
    const hasTranslation = !!data.language_translation;

    if (hasOriginal && !hasTranslation) {
        return chooseLucideIcon('languages', 'book-open');
    }

    if (hasOriginal && hasTranslation) {
        const closedIcon = chooseLucideIcon('folder-symlink', 'folder');
        const openIcon = chooseLucideIcon('folder-open', 'folder');
        return node.isExpanded() ? openIcon : closedIcon;
    }

    if (node.folder !== false || nodeHasChildren(node)) {
        const closedIcon = chooseLucideIcon('folder', 'folder');
        const openIcon = chooseLucideIcon('folder-open', 'folder');
        return node.isExpanded() ? openIcon : closedIcon;
    }

    return chooseLucideIcon('file-text', 'file');
}

function updateFancyTreeNodeIcons(node) {
    if (!node || !node.span) {
        return;
    }

    const span = node.span;
    const expander = span.querySelector('.fancytree-expander');
    const iconSpan = span.querySelector('.fancytree-icon');

    if (expander) {
        const hasChildren = nodeHasChildren(node);
        if (hasChildren) {
            const iconName = node.isExpanded()
                ? chooseLucideIcon('chevron-down', 'chevron-down')
                : chooseLucideIcon('chevron-right', 'chevron-right');
            expander.innerHTML = getLucideIconSvg(iconName, 16);
            expander.classList.remove('is-empty');
        } else {
            expander.innerHTML = '';
            expander.classList.add('is-empty');
        }
    }

    if (iconSpan) {
        const iconName = getTreeNodeIconName(node);
        iconSpan.innerHTML = getLucideIconSvg(iconName, 16);
    }

    if (typeof lucide !== 'undefined') {
        const icons = span.querySelectorAll('[data-lucide]');
        if (icons.length) {
            lucide.createIcons({ elements: icons });
        }
    }
}

function refreshFancyTreeIcons(tree) {
    if (!tree) return;
    tree.visit(updateFancyTreeNodeIcons);
}

// Функция для загрузки данных категорий из HTML
function loadCategoriesData() {
    const categoriesDataElement = document.getElementById('categories-data');
    if (categoriesDataElement) {
        try {
            allCategoriesData = JSON.parse(categoriesDataElement.textContent);
            console.log('✅ Данные категорий загружены из HTML:',
                allCategoriesData.children ? allCategoriesData.children.length : 0, 'языковых групп');
            return true;
        } catch (error) {
            console.error('❌ Ошибка парсинга данных категорий:', error);
            return false;
        }
    } else {
        console.error('❌ Элемент categories-data не найден в HTML');
        return false;
    }
}

function initFancyTree() {
    console.log("🌳 Инициализация FancyTree...");

    // Загружаем данные категорий из HTML
    if (!loadCategoriesData()) {
        console.error('❌ Не удалось загрузить данные категорий');
        return;
    }

    // Используем языки из настроек пользователя
    language_original = window.USER_LANGUAGE_DATA.currentLearning;
    language_translation = window.USER_LANGUAGE_DATA.nativeLanguage;

    console.log("🗣️ Языки для дерева:", language_original, "→", language_translation);

    const ensureResult = ensureLanguageNodesLocally(allCategoriesData, language_original, language_translation);
    if (ensureResult.createdParent || ensureResult.createdPair) {
        console.log('✅ Автоматически добавлены отсутствующие узлы языковой пары для дерева');
        persistLanguagePair(language_original, language_translation);
    }

    try {
        // Фильтруем данные
        const filteredData = filterTreeData(allCategoriesData, currentLanguageFilter);
        // console.log("🔍 Отфильтрованные данные:", filteredData.children ? filteredData.children.length : 0, 'групп');

        $('#treeContainer').fancytree({
            extensions: ["dnd5", "edit"],
            source: filteredData,
            lazy: false,
            renderNode: function (event, data) {
                updateFancyTreeNodeIcons(data.node);
            },
            renderComplete: function (event, data) {
                refreshFancyTreeIcons(data.tree);
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            },
            edit: {
                triggerStart: ["f2", "dblclick", "shift+click"],
                beforeClose: function (event, data) {
                    if (data.save) {
                        const value = data.input.val().trim();
                        if (!value) {
                            alert("Название категории не может быть пустым");
                            data.input.focus();
                            return false;
                        }
                    }
                },
                close: function (event, data) {
                    if (!data.save) {
                        data.node.setTitle(data.orgTitle);
                        return;
                    }

                    const newTitle = data.input.val().trim();
                    if (newTitle === data.orgTitle) {
                        data.node.setTitle(newTitle);
                        return;
                    }

                    renameCategoryOnServer(data.node.key, newTitle)
                        .then(async () => {
                            data.node.setTitle(newTitle);
                            selectedCategory = data.node;
                            await fetchCategoriesFromServer(data.node.key);
                            await reloadTreeWithFilter(data.node.key);
                        })
                        .catch(error => {
                            console.error("❌ Ошибка переименования категории:", error);
                            data.node.setTitle(data.orgTitle);
                            alert(`Не удалось переименовать категорию: ${error.message || error}`);
                        });
                }
            },
            init: function (event, data) {
                categoriesTree = data.tree;
                console.log("✅ FancyTree инициализирован");

                // Развернуть все узлы после загрузки
                categoriesTree.visit(function (node) {
                    node.setExpanded(true);
                });

                refreshFancyTreeIcons(categoriesTree);
                if (typeof lucide !== 'undefined') {
        lucide.createIcons();
        if (lastAppliedIconHtml) {
            lucide.createIcons();
        }
                }
            },
            activate: function (event, data) {
                const node = data.node;
                selectedCategory = node; // Сохраняем выбранную категорию
                console.log("✅ FancyTree selectedCategory", selectedCategory);
                
                // Сохраняем данные категории в sessionStorage для использования при редактировании
                const categoryData = {
                    key: node.key,
                    title: node.title,
                    path: getCategoryPath(node),
                    language_original: language_original,
                    language_translation: language_translation
                };
                sessionStorage.setItem('selectedCategoryForDictation', JSON.stringify(categoryData));
                
                const ids = node.data.dictations || [];

                // Обновляем языки на текущие
                // language_original = window.USER_LANGUAGE_DATA.currentLearning;
                // language_translation = window.USER_LANGUAGE_DATA.nativeLanguage;

                const filteredDictations = allDictations.filter(d => ids.includes(d.id));
                renderDictationsGrid(filteredDictations);
                updateUIForSelectedNode(node);

                // Показываем путь к узлу
                let pathParts = [];
                let current = node;
                while (current) {
                    if (current.title.toLowerCase() !== "root") {
                        pathParts.unshift(current.title);
                    }
                    current = current.parent;
                }

                const path = pathParts.join(" / ");
                document.getElementById("text_tree_branch").textContent = path;
            }
        });
    } catch (error) {
        console.error("❌ Ошибка инициализации FancyTree:", error);
    }
}


function setupTreeButtons() {
    $('#btnAddNode').off('click').on('click', async function () {
        if (!categoriesTree) {
            console.warn("Дерево не инициализировано");
            return;
        }

        const activeNode = categoriesTree.getActiveNode();

        if (!activeNode) {
            alert("Сначала выберите категорию");
            highlightTreeContainer();
            return;
        }

        if (!canAddCategoryChild(activeNode)) {
            alert("Новые папки можно создавать только внутри выбранной языковой пары");
            return;
        }

        try {
            const response = await fetch('/api/categories/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parent_key: activeNode.key,
                    title: "Новая категория"
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || `Server returned ${response.status}`);
            }

            await fetchCategoriesFromServer(activeNode.key);

            const newNode = activeNode.addChildren(result.node);
            activeNode.setExpanded(true);

            if (newNode) {
                newNode.setActive(true);
                selectedCategory = newNode;
                newNode.editStart();
            }
        } catch (error) {
            console.error("❌ Ошибка создания категории:", error);
            alert(`Не удалось создать категорию: ${error.message || error}`);
        }
    });

    $('#btnDeleteNode').off('click').on('click', async function () {
        if (!categoriesTree) {
            return;
        }

        const node = categoriesTree.getActiveNode();
        if (!node || node.isRoot()) {
            alert("Нельзя удалить этот элемент");
            return;
        }

        const parentNode = node.getParent();
        const confirmMessage = `Удалить категорию "${node.title}"? Все вложенные папки будут удалены.`;

        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            const response = await fetch(`/api/categories/${encodeURIComponent(node.key)}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || `Server returned ${response.status}`);
            }

            const parentKey = parentNode ? parentNode.key : null;
            node.remove();

            await fetchCategoriesFromServer(parentKey);
            await reloadTreeWithFilter(parentKey);
        } catch (error) {
            console.error("❌ Ошибка удаления категории:", error);
            alert(`Не удалось удалить категорию: ${error.message || error}`);
        }
    });
}

function setupPanelResizer() {
    const resizer = $("#resizer");
    const leftPanel = $("#leftPanel");
    const rightPanel = $("#rightPanel");
    let startX, startWidth;

    resizer.on("mousedown", function (e) {
        startX = e.pageX;
        startWidth = leftPanel.outerWidth();
        $(document).on("mousemove", resize);
        $(document).on("mouseup", stopResize);
        return false;
    });

    function resize(e) {
        const newWidth = startWidth + e.pageX - startX;
        const minWidth = 200;
        const maxWidth = $(window).width() * 0.7;

        leftPanel.width(Math.min(maxWidth, Math.max(minWidth, newWidth)) + "px");

        // FancyTree автоматически адаптируется к изменению размера контейнера через CSS
        // Дополнительные действия не требуются
    }

    function stopResize() {
        $(document).off("mousemove", resize);
        $(document).off("mouseup", stopResize);
    }
}

function updateUIForSelectedNode(node) {
    $("#current-category").text(node.title);
    // Здесь можно добавить загрузку документов категории
}


function getFlagImg(lang) {
    if (!lang) return ''; // если язык не задан — не рисуем ничего

    const path = `/static/flags/${lang}.svg`;
    return `<img src="${path}" alt="${lang}" title="${lang.toUpperCase()}" width="20" style="vertical-align:middle;">`;
}






// ================ ФИЛЬТРАЦИЯ ПО ЯЗЫКАМ ========================

// ================ ФИЛЬТРАЦИЯ ПО ЯЗЫКАМ ========================

let currentLanguageFilter = 'learning_to_native';

function setLanguageFilter(value, { triggerReload = true, forceReload = false } = {}) {
    if (!value) {
        return;
    }

    const previousValue = currentLanguageFilter;
    currentLanguageFilter = value;

    const hiddenSelect = document.getElementById('languageFilter');
    if (hiddenSelect) {
        hiddenSelect.value = value;
    }

    if (languageFilterUI && typeof languageFilterUI.update === 'function') {
        languageFilterUI.update(value);
    }

    if (triggerReload && (forceReload || previousValue !== value)) {
        reloadTreeWithFilter();
    }
}

// Функция для фильтрации данных JSON перед загрузкой в дерево
function filterTreeData(treeData, filter) {
    if (!treeData) {
        return { children: [] };
    }

    const learningLang = (language_original || '').toLowerCase();
    const nativeLang = (language_translation || '').toLowerCase();

    console.log('Фильтрация данных дерева:', filter, learningLang, '→', nativeLang);

    const filteredData = JSON.parse(JSON.stringify(treeData));

    if (!filter || filter === 'all') {
        return filteredData;
    }

    function nodeMatchesLearning(node) {
        const data = node.data || {};
        const original = (data.language_original || '').toLowerCase();
        if (original && original === learningLang) {
            return true;
        }
        return (node.children || []).some(child => nodeMatchesLearning(child));
    }

    if (filter === 'learning_only') {
        filteredData.children = (filteredData.children || []).filter(child => nodeMatchesLearning(child));
        return filteredData;
    }

    if (filter === 'learning_to_native') {
        filteredData.children = (filteredData.children || []).map(rootChild => {
            if (!nodeMatchesLearning(rootChild)) {
                return null;
            }
            rootChild.children = (rootChild.children || []).filter(secondLevelChild => {
                const data = secondLevelChild.data || {};
                const original = (data.language_original || '').toLowerCase();
                const translation = (data.language_translation || '').toLowerCase();
                return original === learningLang && translation === nativeLang;
            });
            return rootChild.children && rootChild.children.length > 0 ? rootChild : null;
        }).filter(Boolean);

        return filteredData;
    }

    return filteredData;
}

// Переинициализация дерева с отфильтрованными данными
function reloadTreeWithFilter(activeKey = null) {
    if (!categoriesTree || !allCategoriesData) {
        console.log('⚠️ Дерево или данные категорий не загружены');
        return Promise.resolve();
    }

    console.log('🔄 Перезагрузка дерева с фильтром:', currentLanguageFilter);

    const filteredData = filterTreeData(allCategoriesData, currentLanguageFilter);

    return categoriesTree.reload(filteredData).then(() => {
        categoriesTree.visit(node => {
            node.setExpanded(true);
        });

        refreshFancyTreeIcons(categoriesTree);
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        if (activeKey) {
            const nodeToActivate = categoriesTree.getNodeByKey(activeKey);
            if (nodeToActivate) {
                nodeToActivate.setActive(true);
                selectedCategory = nodeToActivate;
            }
        }

        console.log('✅ Дерево перезагружено с фильтром');
    }).catch(error => {
        console.error('❌ Ошибка при перезагрузке дерева:', error);
    });
}

function updateLanguages(newLanguages) {
    try {
        console.log('Обновление языков:', newLanguages);

        if (!newLanguages || !newLanguages.currentLearning || !newLanguages.nativeLanguage) {
            console.error('Некорректные данные языков:', newLanguages);
            return;
        }

        // Обновляем глобальные переменные
        language_original = newLanguages.currentLearning;
        language_translation = newLanguages.nativeLanguage;

        // Обновляем данные пользователя
        if (window.USER_LANGUAGE_DATA) {
            window.USER_LANGUAGE_DATA.currentLearning = newLanguages.currentLearning;
            window.USER_LANGUAGE_DATA.nativeLanguage = newLanguages.nativeLanguage;

            // Сохраняем learningLanguages из селектора
            if (newLanguages.learningLanguages) {
                window.USER_LANGUAGE_DATA.learningLanguages = newLanguages.learningLanguages;
            }
        }

        if (allCategoriesData) {
            const ensureResult = ensureLanguageNodesLocally(allCategoriesData, language_original, language_translation);
            if (ensureResult.createdParent || ensureResult.createdPair) {
                console.log('✅ Автоматически добавлены узлы для новой языковой пары');
                persistLanguagePair(language_original, language_translation);
            }
        }

        console.log('Языки обновлены:', language_original, '→', language_translation);
        // ✅ Сразу обновляем LanguageSelector чтобы не ждать ответа сервера
        if (window.headerLanguageSelector) {
            window.headerLanguageSelector.setValues({
                nativeLanguage: newLanguages.nativeLanguage,
                learningLanguages: newLanguages.learningLanguages,
                currentLearning: newLanguages.currentLearning
            });
        }

        // Сохраняем настройки для авторизованных пользователей
        if (window.USER_LANGUAGE_DATA?.isAuthenticated) {
            saveLanguageSettings({
                nativeLanguage: newLanguages.nativeLanguage,
                learningLanguages: window.USER_LANGUAGE_DATA.learningLanguages,
                currentLearning: newLanguages.currentLearning
            });
        }

        // Перезагружаем дерево с новыми языками
        if (categoriesTree) {
            setTimeout(() => {
                try {
                    reloadTreeWithFilter();
                } catch (error) {
                    console.error('Ошибка при перезагрузке дерева:', error);
                }
            }, 100);
        }
    } catch (error) {
        console.error('Критическая ошибка в updateLanguages:', error);
    }
}

// Новая функция для применения фильтра
function applyTreeFilter(filter) {
    console.log('Применение фильтра к дереву:', filter);

    const treeReady = !!categoriesTree;
    setLanguageFilter(filter, { triggerReload: treeReady });

    if (!treeReady) {
        console.log('Дерево еще не инициализировано, откладываем фильтрацию');
    }
}

// Функция инициализации фильтра
function initializeLanguageFilter() {
    const filterSelect = document.getElementById('languageFilter');
    const controlContainer = document.getElementById('languageFilterControl');

    if (!filterSelect || !controlContainer) {
        return;
    }

    const options = Array.from(filterSelect.options).map(option => ({
        value: option.value,
        label: option.textContent
    }));

    controlContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-speed-select language-filter-select';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-select-button';
    button.innerHTML = `
        <span class="language-filter-icon" data-lucide="filter"></span>
        <span class="speed-current-label"></span>
        <span class="speed-arrow" data-lucide="chevron-up"></span>
    `;

    const currentLabel = button.querySelector('.speed-current-label');

    const list = document.createElement('ul');
    list.className = 'speed-options';
    list.style.zIndex = '2001';

    const optionElements = options.map(option => {
        const item = document.createElement('li');
        item.dataset.value = option.value;
        item.textContent = option.label;
        list.appendChild(item);
        return item;
    });

    wrapper.appendChild(button);
    wrapper.appendChild(list);
    controlContainer.appendChild(wrapper);

    const closeDropdown = () => {
        wrapper.classList.remove('open');
    };

    languageFilterUI = {
        update(value) {
            optionElements.forEach(item => {
                item.classList.toggle('selected', item.dataset.value === value);
            });
            const currentOption = options.find(option => option.value === value);
            currentLabel.textContent = currentOption ? currentOption.label : '';
        },
        close: closeDropdown
    };

    const applySelection = (value) => {
        setLanguageFilter(value);
        closeDropdown();
    };

    optionElements.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            applySelection(item.dataset.value);
        });
    });

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        wrapper.classList.toggle('open');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });

    if (languageFilterOutsideHandler) {
        document.removeEventListener('click', languageFilterOutsideHandler);
    }

    languageFilterOutsideHandler = (event) => {
        if (!wrapper.contains(event.target)) {
            closeDropdown();
        }
    };

    document.addEventListener('click', languageFilterOutsideHandler);

    filterSelect.addEventListener('change', (event) => {
        setLanguageFilter(event.target.value);
    });

    const initialValue = filterSelect.value || currentLanguageFilter || 'learning_to_native';
    setLanguageFilter(initialValue, { triggerReload: false });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function fitFancyTreeHeight() {
    const wrap = document.getElementById('treeContainer');
    const tree = wrap && (wrap.querySelector('ul.fancytree-container') || wrap.querySelector('.fancytree-container'));
    if (wrap && tree) {
        tree.style.height = wrap.clientHeight + 'px';
        tree.style.overflowY = 'auto';
        tree.style.overflowX = 'hidden';
    }
}



async function newDictation() {
    const isAuthenticated = window.UM && window.UM.isAuthenticated && window.UM.isAuthenticated();

    if (!isAuthenticated) {
        alert("Для создания диктанта необходимо авторизоваться");
        const loginUrl = '/login?next=' + encodeURIComponent(window.location.pathname);
        window.location.href = loginUrl;
        return;
    }

    if (!selectedCategory) {
        alert("Сначала выберите категорию с языковой парой!");

        // Визуальная подсказка
        highlightTreeContainer();
        return;
    }

    // Сохраняем данные категории в sessionStorage для передачи в редактор
    const categoryData = {
        key: selectedCategory.key,
        title: selectedCategory.title,
        path: getCategoryPath(selectedCategory),
        language_original: language_original,
        language_translation: language_translation
    };

    sessionStorage.setItem('selectedCategoryForDictation', JSON.stringify(categoryData));

    // Открываем редактор в модальном окне поверх текущей страницы
    const modal = document.getElementById('dictationEditorModal');
    const frame = document.getElementById('dictationEditorFrame');

    if (modal && frame) {
        frame.src = '/dictation_editor/new';
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } else {
        // Fallback: если модальное окно не найдено, переходим как раньше
        window.location.href = '/dictation_editor/new';
    }
}

// Функция для получения пути к категории в дереве
function getCategoryPath(categoryNode) {
    const path = [];
    let currentNode = categoryNode;
    
    while (currentNode && currentNode.title !== 'root') {
        path.unshift(currentNode.title);
        currentNode = currentNode.parent;
    }
    
    return path.join(' > ');
}

// Функция для подсветки контейнера дерева
function highlightTreeContainer() {
    const treeContainer = document.getElementById('treeContainer');
    if (treeContainer) {
        treeContainer.style.boxShadow = '0 0 0 2px red';
        treeContainer.style.transition = 'box-shadow 0.3s ease';

        setTimeout(() => {
            treeContainer.style.boxShadow = '';
        }, 2000);
    }
}

function findPairNode(node) {
    let current = node;
    while (current) {
        const data = current.data || {};
        if (data.language_original && data.language_translation) {
            const parent = current.getParent ? current.getParent() : current.parent;
            const parentData = parent ? (parent.data || {}) : {};
            const parentIsRoot = !parent || (typeof parent.isRoot === 'function' ? parent.isRoot() : false);
            const parentIsLanguageRoot =
                parent &&
                parentData.language_original === data.language_original &&
                !parentData.language_translation;

            if (parentIsRoot || parentIsLanguageRoot) {
                return current;
            }
        }
        current = current.getParent ? current.getParent() : current.parent;
    }
    return null;
}

function collectPairNodes(pairNode) {
    if (!pairNode) {
        return [];
    }

    const pairData = pairNode.data || {};
    const result = [];

    function traverse(node) {
        if (!node) {
            return;
        }

        const data = node.data || {};
        const matchesPair =
            data.language_original === pairData.language_original &&
            data.language_translation === pairData.language_translation;

        if (node === pairNode || matchesPair) {
            result.push(node);
            const children = node.children || [];
            children.forEach(child => traverse(child));
        } else {
            const children = node.children || [];
            children.forEach(child => traverse(child));
        }
    }

    traverse(pairNode);
    return result;
}

function getRelativePath(node, rootNode) {
    const parts = [];
    let current = node;
    while (current && current !== rootNode && current.title !== 'root') {
        parts.unshift(current.title);
        current = current.parent;
    }
    if (rootNode) {
        parts.unshift(rootNode.title);
    }
    return parts.join(' / ');
}

async function refreshDictationsForActiveNode() {
    if (!categoriesTree) {
        return;
    }

    const activeNode = categoriesTree.getActiveNode();
    if (!activeNode) {
        renderDictationsGrid([]);
        return;
    }

    const ids = (activeNode.data && activeNode.data.dictations) || [];
    const filteredDictations = allDictations.filter(d => ids.includes(d.id));
    renderDictationsGrid(filteredDictations);
    updateUIForSelectedNode(activeNode);
}

async function moveDictation(dictationId, sourceKey, targetKey) {
    const response = await fetch('/api/dictations/move', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            dictation_id: dictationId,
            source_category_key: sourceKey,
            target_category_key: targetKey
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Server returned ${response.status}`);
    }

    await fetchCategoriesFromServer(targetKey);
    await reloadTreeWithFilter(targetKey);
    await refreshDictationsForActiveNode();
}

function openMoveDictationModal(dictation) {
    if (!categoriesTree) {
        return;
    }

    const activeNode = categoriesTree.getActiveNode();
    if (!activeNode) {
        alert('Сначала выберите категорию в дереве');
        highlightTreeContainer();
        return;
    }

    const pairNode = findPairNode(activeNode);
    if (!pairNode) {
        alert('Перенос возможен только внутри выбранной языковой пары');
        return;
    }

    const options = collectPairNodes(pairNode).map(node => ({
        key: node.key,
        label: getRelativePath(node, pairNode)
    }));

    if (!options.length) {
        alert('Нет доступных категорий для переноса');
        return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal-window';

    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Перенос диктанта';
    modal.appendChild(titleEl);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const info = document.createElement('div');
    const infoTitle = document.createElement('strong');
    infoTitle.textContent = dictation.title || 'Без названия';
    info.appendChild(infoTitle);
    body.appendChild(info);

    const label = document.createElement('label');
    label.textContent = 'Целевая категория';

    const select = document.createElement('select');
    options.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.key;
        option.textContent = optionData.label;
        if (optionData.key === activeNode.key) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    label.appendChild(select);
    body.appendChild(label);

    modal.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Отмена';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn-primary';
    confirmBtn.textContent = 'Перенести';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.appendChild(actions);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function closeModal() {
        if (backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
        }
    }

    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
            closeModal();
        }
    });

    confirmBtn.addEventListener('click', async () => {
        const targetKey = select.value;
        if (!targetKey) {
            alert('Выберите целевую категорию');
            return;
        }

        if (targetKey === activeNode.key) {
            closeModal();
            return;
        }

        try {
            await moveDictation(dictation.id, activeNode.key, targetKey);
            closeModal();
        } catch (error) {
            console.error('❌ Ошибка переноса диктанта:', error);
            alert(`Не удалось перенести диктант: ${error.message || error}`);
        }
    });
}

async function deleteDictationWithConfirmation(dictation) {
    const title = dictation.title || dictation.id;
    if (!window.confirm(`Удалить диктант "${title}"? Действие необратимо.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/dictations/${encodeURIComponent(dictation.id)}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server returned ${response.status}`);
        }

        allDictations = allDictations.filter(d => d.id !== dictation.id);

        const activeNode = categoriesTree ? categoriesTree.getActiveNode() : null;
        const activeKey = activeNode ? activeNode.key : null;

        await fetchCategoriesFromServer(activeKey);
        await reloadTreeWithFilter(activeKey);
        await refreshDictationsForActiveNode();
    } catch (error) {
        console.error('❌ Ошибка удаления диктанта:', error);
        alert(`Не удалось удалить диктант: ${error.message || error}`);
    }
}

async function exportDictation(dictation) {
    try {
        const response = await fetch(`/api/dictations/${encodeURIComponent(dictation.id)}/export`);
        if (!response.ok) {
            let errorMessage = `Server returned ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (parseError) {
                // ignore parse errors, fallback to default message
            }
            throw new Error(errorMessage);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${dictation.id}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('❌ Ошибка экспорта диктанта:', error);
        alert(`Не удалось скачать диктант: ${error.message || error}`);
    }
}

async function importDictationFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const activeNode = categoriesTree ? categoriesTree.getActiveNode() : null;
    const targetKey = activeNode ? activeNode.key : '';
    if (targetKey) {
        formData.append('target_category_key', targetKey);
    }

    const response = await fetch('/api/dictations/import', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Server returned ${response.status}`);
    }

    await loadDictations();
    const keyToActivate = result.category_key || targetKey || null;

    await fetchCategoriesFromServer(keyToActivate);
    await reloadTreeWithFilter(keyToActivate);
    await refreshDictationsForActiveNode();
}

function setupImportButton() {
    const importBtn = document.getElementById('importDictationBtn');
    const fileInput = document.getElementById('dictationImportInput');

    if (!importBtn || !fileInput) {
        return;
    }

    importBtn.addEventListener('click', (event) => {
        event.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.zip')) {
            alert('Пожалуйста, выберите ZIP-файл с диктантом');
            fileInput.value = '';
            return;
        }

        try {
            await importDictationFile(file);
            alert('Диктант успешно загружен');
        } catch (error) {
            console.error('❌ Ошибка импорта диктанта:', error);
            alert(`Не удалось импортировать диктант: ${error.message || error}`);
        } finally {
            fileInput.value = '';
        }
    });
}

// Инициализация кнопки статистики
function setupStatisticsButton() {
    const showStatisticsBtn = document.getElementById('showStatisticsBtn');
    const statisticsDropdown = document.getElementById('statisticsDropdown');
    const showGeneralStatisticsBtn = document.getElementById('showGeneralStatisticsBtn');
    const showDictationsReportBtn = document.getElementById('showDictationsReportBtn');

    if (!showStatisticsBtn || !statisticsDropdown) return;

    // Показываем/скрываем выпадающее меню
    showStatisticsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = statisticsDropdown.style.display === 'block';
        statisticsDropdown.style.display = isVisible ? 'none' : 'block';
    });

    // Закрываем меню при клике вне его
    document.addEventListener('click', (e) => {
        if (!showStatisticsBtn.contains(e.target) && !statisticsDropdown.contains(e.target)) {
            statisticsDropdown.style.display = 'none';
        }
    });

    // Общая история работы
    if (showGeneralStatisticsBtn) {
        showGeneralStatisticsBtn.addEventListener('click', async () => {
            statisticsDropdown.style.display = 'none';
            if (window.activityHistory && typeof StatisticsReport !== 'undefined') {
                await StatisticsReport.open(window.activityHistory);
            } else {
                alert('История активности еще не загружена');
            }
        });
    }

    // Отчет о выполненных диктантах
    if (showDictationsReportBtn) {
        showDictationsReportBtn.addEventListener('click', async () => {
            statisticsDropdown.style.display = 'none';
            if (typeof DictationsReport !== 'undefined') {
                await DictationsReport.open();
            } else {
                alert('Модуль отчетов еще не загружен');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {

    try {
        // Ждем пока UserManager инициализируется в основном скрипте
        const waitForUserManager = setInterval(() => {
            if (window.UM && typeof window.UM.isAuthenticated === 'function') {
                clearInterval(waitForUserManager);

                // Загружаем данные пользователя
                initializeUserData().then(() => {
                    console.log('Данные пользователя инициализированы:', window.USER_LANGUAGE_DATA);

                    // Инициализируем компоненты
                    initializeLanguageSelector();
                    initializeLanguageFilter();
                    fitFancyTreeHeight();
                    setupStatisticsButton();
                    
                    // Инициализируем activityHistory для статистики
                    if (typeof UserActivityHistory !== 'undefined' && !window.activityHistory) {
                        window.activityHistory = new UserActivityHistory('/user/api');
                    }
                    
                    // Восстанавливаем позицию в дереве после возврата с создания диктанта
                    restoreTreePosition();
                    // setupNewDictationButton();
                    if (!window.USER_LANGUAGE_DATA.isAuthenticated) {
                        showAuthBanner();
                    }
                    // Загружаем диктанты и историю параллельно
                    return Promise.all([
                        loadDictations(),
                        loadAllHistory().then(history => {
                            allHistoryData = history;
                            // Обновляем медальки после загрузки (данные теперь из БД)
                            setTimeout(async () => {
                                await updateCompletionBadges();
                                console.log('✅ Медальки обновлены');
                            }, 100);
                        })
                    ]).then(() => {
                        initFancyTree();
                        setupPanelResizer();
                        setupTreeButtons();
                        setupImportButton();
                        // Перерисовываем карточки после загрузки истории
                        if (categoriesTree && categoriesTree.getActiveNode()) {
                            const node = categoriesTree.getActiveNode();
                            const ids = node.data.dictations || [];
                            const filteredDictations = allDictations.filter(d => ids.includes(d.id));
                            renderDictationsGrid(filteredDictations);
                            // Обновляем медальки после перерисовки
                            setTimeout(async () => await updateCompletionBadges(), 100);
                        } else {
                            // Обновляем медальки на всех существующих карточках
                            (async () => {
                                await updateCompletionBadges();
                            })();
                        }
                    });
                }).catch(error => {
                    console.error('Ошибка инициализации:', error);
                });

            }
        }, 100);

    } catch (error) {
        console.error('Критическая ошибка при инициализации:', error);
    }
});

// Функция для показа баннера авторизации
function showAuthBanner() {
    // Проверяем, не добавлен ли уже баннер
    if (document.querySelector('.auth-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'auth-banner';
    banner.innerHTML = `
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px; margin: 10px 0; border-radius: 5px; font-size: 14px;">
            <strong>💡 Войдите в систему</strong> для доступа ко всем функциям: сохранение настроек, создание диктантов и многое другое.
            <a href="/login?next=${encodeURIComponent(window.location.pathname)}" 
               style="margin-left: 10px; color: #007bff; text-decoration: underline;">
               Войти
            </a>
        </div>
    `;

    const main = document.querySelector('main');
    const header = document.querySelector('header');
    if (main) {
        main.insertBefore(banner, main.firstChild);
    } else if (header) {
        header.parentNode.insertBefore(banner, header.nextSibling);
    }
}

function restoreTreePosition() {
    try {
        // Проверяем, есть ли сохраненная позиция в дереве
        const savedCategoryData = sessionStorage.getItem('selectedCategoryForDictation');
        
        if (savedCategoryData) {
            const categoryData = JSON.parse(savedCategoryData);
            console.log('🔄 Восстанавливаем позицию в дереве:', categoryData.title);
            
            // Ждем пока дерево загрузится
            let attempts = 0;
            const maxAttempts = 50; // 5 секунд максимум
            
            const waitForTree = setInterval(() => {
                attempts++;
                
                if (categoriesTree && typeof categoriesTree.getNodeByKey === 'function') {
                    clearInterval(waitForTree);
                    
                    try {
                        // Ищем узел по ключу категории
                        const node = categoriesTree.getNodeByKey(categoryData.key);
                        
                        if (node) {
                            // Раскрываем родительские узлы
                            const parent = node.getParent();
                            if (parent) {
                                parent.setExpanded(true);
                            }
                            
                            // Выделяем узел
                            node.setActive(true);
                            
                            // Прокручиваем к узлу
                            setTimeout(() => {
                                try {
                                    const $node = categoriesTree.getNodeByKey(categoryData.key).$div;
                                    if ($node && $node.length) {
                                        $node[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                } catch (scrollError) {
                                    console.error('❌ Ошибка при прокрутке:', scrollError);
                                }
                            }, 100);
                            
                            console.log('✅ Позиция в дереве восстановлена');
                        } else {
                            console.warn('⚠️ Узел не найден для восстановления:', categoryData.key);
                        }
                    } catch (treeError) {
                        console.error('❌ Ошибка при работе с деревом:', treeError);
                    }
                    
                    // НЕ очищаем sessionStorage - он нужен для редактирования диктантов
                    // setTimeout(() => {
                    //     sessionStorage.removeItem('selectedCategoryForDictation');
                    // }, 2000);
                    
                } else if (attempts >= maxAttempts) {
                    clearInterval(waitForTree);
                    console.warn('⚠️ Дерево не найдено после', maxAttempts, 'попыток');
                }
            }, 100);
        }
    } catch (error) {
        console.error('❌ Ошибка при восстановлении позиции в дереве:', error);
    }
}
