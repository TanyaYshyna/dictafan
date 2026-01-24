const userManager = window.UM;
const waveformContainer = document.getElementById('audioWaveform');
const currentAudioInfo = document.getElementById('currentAudioInfo');
const currentSentenceInfo = document.getElementById('currentSentenceInfo');
const startInput = document.getElementById('audioStartTime');
const endInput = document.getElementById('audioEndTime');


let currentAudioFile = null; // текущий файл в настройках аудио

// Кнопки для работы с аудио
const selectFileBtn = document.getElementById('selectFileBtn');
const scissorsBtn = document.getElementById('scissorsBtn');
const audioTableActionBtn = document.getElementById('audioTableActionBtn');


// Модальные окна для новой архитектуры
let startModal = null; // стартовое модальное окно
let audioSettingsModal = null; // модальное окно настроек аудио


let data = [];
let currentDictation = {
    id: '', // ID текущего диктанта
    isNew: true, // Флаг - новый это диктант или существующий
    safe_email: '',  // имя папки пользователся в виде test_at_example_dot_com
    language_original: '',
    language_translation: '',
    level: 'A1',
    category_key: '', // ключ категории в дереве
    category_title: '', // название категории
    category_path: '', // путь к категории в дереве
    coverFile: null, // загруженный файл cover в памяти
    dictationStartTime: 0, // начало диктанта
    dictationEndTime: 0, // конец диктанта
    tableFilled: false, // флаг заполнения таблицы
    is_dialog: false, // флаг диалога
    speakers: {}, // словарь спикеров {"1": "Таня", "2": "Ваня"}
    title_translations: {}, // переводы заголовка {"en": "Title", "ru": "Заголовок"}
    current_edit_mode: null, // 'original' | 'translation' | null
    current_row_key: null, // текущая строка для настроек аудио
    isSaved: false // флаг - сохранен ли диктант
};

let currentRowIndex = 0;
let sentenceRows = [];
let waveformCanvas = null;
let lastAudioUrl = null;
let currentRegion = null;
let wordPointer = 0; // для алгоритма сравнения текущая позиция
// Цвета теперь определяются в WaveformCanvas классе

// Неиспользуемые переменные удалены - данные хранятся в workingData

let workingData = {
    original: {
        language: '',
        title: '',
        speakers: {}, // словарь спикеров {"1": "Таня", "2": "Ваня"}
        sentences: [], // {key, speaker, text, audio, audio_users_shared, start, end, chain}
        audio_user_shared: '',
        audio_user_shared_start: 0,
        audio_user_shared_end: 0
    },
    translation: {
        language: '',
        title: '',
        speakers: {}, // словарь спикеров {"1": "Таня", "2": "Ваня"}
        sentences: [], // {key, speaker, text, audio, shared_audio, start, end, chain}
        audio_user_shared: '',
        audio_user_shared_start: 0,
        audio_user_shared_end: 0
    }
};

const LEVEL_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
let levelSelectWrapper = null;
let levelSelectOutsideHandler = null;

let currentTabName = 'general';
let explanationVisible = false;

// Глобальные переменные для обрезки изображений
let cropper = null;
let croppedImageBlob = null;













// Глобальные переменные для воспроизведения
let isPlaying = false;
let playheadAnimationId = null;



// ==================== сover обложка ========================================
// Функция для настройки обработчиков cover
function setupCoverHandlers() {
    const coverUploadBtn = document.getElementById('coverUploadBtn');
    const coverFile = document.getElementById('coverFile');
    const coverImage = document.getElementById('coverImage');

    if (coverUploadBtn && coverFile) {
        // При клике на кнопку "Загрузить" открываем файловый диалог
        coverUploadBtn.addEventListener('click', () => {
            coverFile.click();
        });

        // При выборе файла открываем модальное окно обрезки
        coverFile.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            // Проверяем что это изображение
            if (!file.type.startsWith('image/')) {
                alert('Выберите изображение');
                return;
            }

            // Проверяем размер файла (максимум 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('Размер файла не должен превышать 5MB');
                return;
            }

            // Открываем crop modal
                const reader = new FileReader();
                reader.onload = (e) => {
                openCropModal(e.target.result);
                };
                reader.readAsDataURL(file);
        });
    }

    // Обработчики для модального окна обрезки
    const cropClose = document.getElementById('crop-close');
    const cropCancel = document.getElementById('crop-cancel');
    const cropConfirm = document.getElementById('crop-confirm');

    if (cropClose) {
        cropClose.addEventListener('click', () => closeCropModal(true));
    }
    if (cropCancel) {
        cropCancel.addEventListener('click', () => closeCropModal(true));
    }
    if (cropConfirm) {
        cropConfirm.addEventListener('click', handleCropConfirm);
    }
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
    
    // Инициализируем cropper с прямоугольным crop box 200x120 (ШxВ)
    cropper = new Cropper(image, {
        aspectRatio: 200 / 120, // Прямоугольник 200x120
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
        const coverFile = document.getElementById("coverFile");
        if (coverFile) {
            coverFile.value = '';
        }
    }
}

async function handleCropConfirm() {
    if (!cropper) return;
    
    // Получаем canvas с обрезанным изображением для ковера диктанта (200x120, ШxВ)
    const canvas = cropper.getCroppedCanvas({
        width: 200,
        height: 120,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });
    
    if (!canvas) {
        alert('Ошибка обрезки изображения');
        return;
    }
    
    // Конвертируем canvas в blob (webp)
    canvas.toBlob(async (blob) => {
        if (!blob) {
            alert('Ошибка создания изображения');
            return;
        }
        
        croppedImageBlob = blob;
        
        // Показываем preview в элементе coverImage
        const coverImage = document.getElementById("coverImage");
        if (coverImage) {
            const url = URL.createObjectURL(blob);
            coverImage.src = url;
        }
        
        // Отправляем обрезанное изображение на сервер
        try {
                const formData = new FormData();
            formData.append('cover', blob, 'cover.webp');
                formData.append('dictation_id', currentDictation.id);
                // Передаем user_id для правильного пути temp/<user_id>/dict_temp_<timestamp>/
                if (currentDictation.user_id) {
                    formData.append('user_id', currentDictation.user_id);
                }

                const response = await fetch('/api/cover', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                // Сохраняем blob в памяти для последующего сохранения
                currentDictation.coverFile = blob;
                // Закрываем crop modal БЕЗ очистки blob
                closeCropModal(false);
                } else {
                    const error = await response.json();
                    console.error('Ошибка сохранения cover:', error.error);
                    alert('Ошибка сохранения изображения: ' + error.error);
                }
            } catch (error) {
                console.error('Ошибка при загрузке cover:', error);
                alert('Ошибка при загрузке изображения');
            }
    }, 'image/webp', 0.9);
}

// Функция для загрузки cover существующего диктанта
async function loadCoverForExistingDictation(dictationId, originalLanguage) {
    const coverImage = document.getElementById('coverImage');
    if (!coverImage) return;

    // Пытаемся загрузить cover диктанта
    const dictationCoverUrl = `/static/data/dictations/${dictationId}/cover.webp`;

    try {
        const response = await fetch(dictationCoverUrl, { method: 'HEAD' });
        if (response.ok) {
            coverImage.src = dictationCoverUrl;
            return;
        }
    } catch (error) {
        // Игнорируем ошибку
    }

    // Если cover диктанта нет, используем cover по умолчанию
    const defaultCoverUrl = coverImage.dataset.defaultCover || `/static/data/covers/cover_${originalLanguage}.webp`;
    coverImage.src = defaultCoverUrl;
}




// Функция loadCategoryInfoForDictation удалена - данные категории теперь передаются через POST запрос

// Функция для получения пути к категории из узла дерева
function getCategoryPathFromNode(node) {
    const path = [];
    let currentNode = node;

    while (currentNode && currentNode.title !== 'root') {
        path.unshift(currentNode.title);
        currentNode = currentNode.parent;
    }

    return path.join(' > ');
}

// Функция для обновления отображения пути к категории
function updateCategoryPathDisplay(categoryPath) {
    const categoryPathElement = document.getElementById('category-path');
    if (categoryPathElement && categoryPath) {
        categoryPathElement.innerHTML = `<i data-lucide="folder"></i> ${categoryPath}`;
        // Обновляем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    // Также обновляем путь во вкладке
    updateDictationPathDisplay();
}

function newSentances(key, text, key_audio, start = '', end = '') {
    return {
        key: key,
        text: text,
        audio: key_audio,
        start: start,
        end: end
    };

}

// ============================================================
// Инициализация нового диктанта
async function initNewDictation(safe_email, initData) {
    // Получаем информацию о категории и языках из sessionStorage
    const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
    const categoryInfo = categoryDataStr ? JSON.parse(categoryDataStr) : {};
    const language_original = categoryInfo.language_original || 'en';
    const language_translation = categoryInfo.language_translation || 'ru';

    const initialLevel = (initData && initData.level) ? initData.level : 'A1';

    // Создаём временный ID для работы (не создаём в БД до сохранения)
    const timestamp = Date.now();
    const temp_id = `dict_temp_${timestamp}`;

    // Получаем user_id из UserManager (если доступен)
    // Пробуем несколько раз, так как UserManager может еще не быть полностью инициализирован
    let user_id = null;
    if (window.UM && window.UM.getCurrentUser) {
        const user = window.UM.getCurrentUser();
        if (user && user.id) {
            user_id = user.id;
        } else {
            // Пробуем еще раз через небольшую задержку
            setTimeout(() => {
                if (window.UM && window.UM.getCurrentUser) {
                    const userRetry = window.UM.getCurrentUser();
                    if (userRetry && userRetry.id) {
                        currentDictation.user_id = userRetry.id;
                        console.log('✅ user_id получен после повторной попытки:', userRetry.id);
                    }
                }
            }, 500);
            console.warn('⚠️ UserManager.getCurrentUser() не вернул user.id, попробуем позже');
        }
    } else {
        // Пробуем еще раз через небольшую задержку
        setTimeout(() => {
            if (window.UM && window.UM.getCurrentUser) {
                const userRetry = window.UM.getCurrentUser();
                if (userRetry && userRetry.id) {
                    currentDictation.user_id = userRetry.id;
                    console.log('✅ user_id получен после повторной попытки:', userRetry.id);
                }
            }
        }, 500);
        console.warn('⚠️ UserManager не доступен при инициализации нового диктанта, попробуем позже');
    }
    
    // Пытаемся получить целевую книгу/раздел для привязки диктанта (из приватной библиотеки)
    let targetBookId = null;
    try {
        const targetRaw = sessionStorage.getItem('dictationTargetBook');
        if (targetRaw) {
            const target = JSON.parse(targetRaw);
            if (target && target.book_id) {
                targetBookId = Number(target.book_id) || null;
            }
        }
    } catch (e) {
        console.warn('⚠️ Не удалось прочитать dictationTargetBook из sessionStorage:', e);
    }
    
    console.log('📝 Инициализация нового диктанта:', {
        temp_id,
        user_id,
        safe_email,
        language_original,
        language_translation,
        targetBookId
    });

    // Используем временный ID для работы
    currentDictation = {
        id: temp_id,  // Временный ID для работы с файлами
        temp_id: temp_id,  // Сохраняем временный ID отдельно
        db_id: null,  // Будет установлен при сохранении в БД
        user_id: user_id,  // ID пользователя для пути temp/<user_id>/
        isNew: true,
        safe_email: safe_email,
        language_original: language_original,
        language_translation: language_translation,
        level: initialLevel,
        category_key: categoryInfo.key || '',
        category_title: categoryInfo.title || '',
        category_path: categoryInfo.path || '',
        coverFile: null, // загруженный файл cover в памяти
        is_dialog: false,
        speakers: {},
        // Целевая книга (книга или раздел из приватной библиотеки), может быть null
        book_id: targetBookId,
        current_edit_mode: null, // 'original' | 'translation' | null - группа активных секций в таблице
        current_row_key: null, // текущая строка в таблице
        isSaved: false // новый диктант - не сохранен
    };

    // ID не показываем пока не сохранён в БД
    const dictationIdElement = document.getElementById('dictation-id');
    if (dictationIdElement) {
        dictationIdElement.style.display = 'none';
        dictationIdElement.textContent = 'id: ';
    }

    // Очищаем поля формы
    document.getElementById('title').value = '';
    document.getElementById('title_translation').value = '';
    // document.getElementById('text').value = ''; // TODO: Добавить элемент text в шаблон
    // document.querySelector('#sentences-table tbody').innerHTML = ''; // TODO: Добавить таблицу sentences в шаблон
    
    document.getElementById('dictation-name').textContent = ``;
    
    // ==================== Открываем стартовое модальное окно для нового диктанта ========================================

    // Проверяем существование элементов
    const startModal = document.getElementById('startModal');
 
    // Открыть стартовое модальное окно для нового диктанта
    setTimeout(() => {
        openStartModal();
    }, 100);

    // Показываем путь к категории если есть
    if (currentDictation.category_path) {
        updateCategoryPathDisplay(currentDictation.category_path);
    } else {
        console.log('❌ Путь категории пустой!');
    }
    
    // Обновляем отображение пути к диктанту
    updateDictationPathDisplay();
    
    // Загружаем обложку книги, если диктант принадлежит книге
    if (currentDictation.book_id) {
        await loadBookCoverForDictation(null, currentDictation.book_id);
    }

    initLevelSelector(initialLevel);


    // TODO: зачем это?
    // Сброс значения input (без добавления нового обработчика)
    // const input = document.getElementById('audioFile');
    // if (input) {
    //     input.value = '';
    // }

}

function initLevelSelector(initialLevel = 'A1') {
    const wrapper = document.getElementById('levelSelectControl');
    if (!wrapper) {
        return;
    }

    levelSelectWrapper = wrapper;

    const button = wrapper.querySelector('.speed-select-button');
    const valueEl = wrapper.querySelector('.level-select-value');
    const list = wrapper.querySelector('.speed-options');

    if (!button || !valueEl || !list) {
        return;
    }

    let optionElements = Array.from(list.querySelectorAll('li'));
    if (optionElements.length === 0) {
        LEVEL_OPTIONS.forEach(levelOption => {
            const li = document.createElement('li');
            li.dataset.value = levelOption;
            li.textContent = levelOption;
            list.appendChild(li);
        });
        optionElements = Array.from(list.querySelectorAll('li'));
    }

    const setLevelValue = (value) => {
        const normalized = LEVEL_OPTIONS.includes(value) ? value : 'A1';
        currentDictation.level = normalized;
        valueEl.textContent = normalized;
        optionElements.forEach(li => {
            li.classList.toggle('selected', li.dataset.value === normalized);
        });
    };

    if (!wrapper.dataset.initialized) {
        optionElements.forEach(li => {
            li.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setLevelValue(li.dataset.value);
                wrapper.classList.remove('open');
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

        if (!levelSelectOutsideHandler) {
            levelSelectOutsideHandler = (event) => {
                if (levelSelectWrapper && !levelSelectWrapper.contains(event.target)) {
                    levelSelectWrapper.classList.remove('open');
                }
            };
            document.addEventListener('click', levelSelectOutsideHandler);
        }

        wrapper.dataset.initialized = 'true';
    }

    setLevelValue(initialLevel);
}


// ==================== Загрузка существующего диктанта ========================================
async function loadExistingDictation(initData) {

    const {
        dictation_id,
        original_language,
        translation_language,
        title,
        title_translations,
        level,
        original_data,
        translation_data,
        audio_file,
        audio_words,
        safe_email,
        is_dialog,
        speakers,
        cover_url,
        author_materials_url
    } = initData;

    // Для редактирования диктанта категория берется из sessionStorage (текущее местоположение в дереве)
    const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
    const categoryInfo = categoryDataStr ? JSON.parse(categoryDataStr) : {};

    const resolvedLevel = level || 'A1';
    
    // Извлекаем db_id из dictation_id (формат dict_<id>)
    let db_id = null;
    if (dictation_id && dictation_id.startsWith('dict_')) {
        const idMatch = dictation_id.match(/^dict_(\d+)$/);
        if (idMatch) {
            db_id = parseInt(idMatch[1], 10);
        }
    }

    currentDictation = {
        id: dictation_id,
        db_id: db_id,  // ID из БД для существующих диктантов
        isNew: false,
        safe_email: safe_email,
        language_original: original_language,
        language_translation: translation_language,
        level: resolvedLevel,
        audio_words: audio_words,
        category_key: categoryInfo.key || '',
        category_title: categoryInfo.title || '',
        category_path: categoryInfo.path || '',
        coverFile: null, // загруженный файл cover в памяти
        is_dialog: is_dialog || false,
        speakers: speakers || {}, // Спикеры теперь только в info.json
        title_translations: title_translations || {}, // Переводы заголовка из БД
        author_materials_url: author_materials_url || null, // Ссылка на материалы автора
        isSaved: true // существующий диктант - уже сохранен
    };

    // Обновляем заголовки
    document.getElementById('dictation-name').textContent = title;
    // Показываем ID только если он есть
    const dictationIdElement = document.getElementById('dictation-id');
    if (dictationIdElement && dictation_id) {
        dictationIdElement.textContent = `id: ${dictation_id}`;
     } else if (dictationIdElement) {
        dictationIdElement.textContent = '';
    }
    document.getElementById('title').value = title;
    document.getElementById('title_translation').value = translation_data?.title || "";
    
    // Загружаем author_materials_url если есть
    const authorMaterialsUrlInput = document.getElementById('dictation-author-materials-url-input');
    if (authorMaterialsUrlInput && initData.author_materials_url) {
        authorMaterialsUrlInput.value = initData.author_materials_url || "";
    }

    // Синхронизируем с вкладками
    const tabTitle = document.getElementById('tabTitle');
    const tabTitleTranslation = document.getElementById('tabTitleTranslation');
    if (tabTitle) tabTitle.value = title;
    if (tabTitleTranslation) tabTitleTranslation.value = translation_data?.title || "";

    // Загружаем cover если есть
    const coverImage = document.getElementById('coverImage');
    if (coverImage) {
        if (cover_url) {
            coverImage.src = cover_url;
        } else {
            await loadCoverForExistingDictation(dictation_id, original_language);
        }
        
        // Устанавливаем обработчик двойного щелчка для открытия ссылки на материалы автора
        if (currentDictation?.author_materials_url) {
            coverImage.addEventListener('dblclick', () => {
                window.open(currentDictation.author_materials_url, '_blank');
            });
            coverImage.style.cursor = 'pointer';
            coverImage.title = 'Двойной щелчок для открытия ссылки на материалы автора';
        }
    } else {
        await loadCoverForExistingDictation(dictation_id, original_language);
    }
    
    // Загружаем обложку книги, если диктант принадлежит книге
    // И устанавливаем book_id в currentDictation для последующего сохранения
    if (db_id) {
        const bookInfo = await loadBookCoverForDictation(db_id);
        if (bookInfo && bookInfo.book_id) {
            currentDictation.book_id = bookInfo.book_id;
        }
    }

    initLevelSelector(resolvedLevel);

    // Показываем путь к категории если есть (данные уже загружены из info.json)
    if (currentDictation.category_path) {
        updateCategoryPathDisplay(currentDictation.category_path);
    }

    // Обновляем данные диалога во вкладке (вызывается после setupTabsPanel)
    setTimeout(() => {
        updateDialogTab();
    }, 100);

    // Копируем диктант в temp для редактирования
    try {
        const response = await fetch('/copy_dictation_to_temp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dictation_id: dictation_id,
                language_original: original_language,
                language_translation: translation_language
            })
        });

    } catch (error) {
        console.error('❌ Ошибка при копировании диктанта в temp:', error);
    }


    // Создаём таблицу с предложениями из загруженных данных
    workingData = {
        original: original_data,
        translation: translation_data
    };

    // Инициализируем поле checked для всех предложений, если его нет
    if (workingData.original && workingData.original.sentences) {
        workingData.original.sentences.forEach(s => {
            if (s.checked === undefined) {
                s.checked = false;
            }
        });
    }

    // console.log('📊 Загруженные данные original_data:', original_data);
    // console.log('📊 Загруженные данные translation_data:', translation_data);

    // Создаем таблицу
    await createTable();

    // TODO: инициализировать колонки таблицы 

    // Инициализируем волну и информацию о файле, если есть аудио
    // initializeAudioForExistingDictation();

    // Инициализируем Lucide иконки
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}


// Инициализация при загрузке страницы
async function initDictationGenerator() {
    // const path = window.location.pathname;


    // 1. Получаем JSON как строку
    const initRaw = document.getElementById("init-data")?.textContent;

    // 2. Превращаем в объект
    const initData = JSON.parse(initRaw);

    // Получаем safe_email из UserManager
    let safe_email = window.UM.getSafeEmail();
    if (safe_email === 'anonymous') {
        safe_email = initData.safe_email || 'anonymous';
    }


    // 4. Анализируем dictation_id для определения режима
    if (initData.dictation_id !== 'new') {
        await loadExistingDictation(initData);
    } else {
        initNewDictation(safe_email, initData);
    }

    // Инициализируем language_selector для отображения флагов
    initLanguageFlags(initData);

    // Настраиваем обработчики для ковера
    setupCoverHandlers();

    setupStartModalHandlers(); // Настраиваем обработчики стартового модального окна
    setupTitleTranslationHandler(); // Настраиваем автоматический перевод названия

    // Инициализируем панель вкладок
    setupTabsPanel();
    // Обработчики навигации по строкам таблицы
    setupTableControlsHandlers();

    // Обновляем отображение пути к диктанту
    updateDictationPathDisplay();

    // Инициализируем иконки радио-кнопок
    updateRadioButtonIcons('full');

}



// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ФЛАГОВ ЯЗЫКОВ
function initLanguageFlags(initData) {
    try {
        // Получаем контейнер для флагов
        const langPairContainer = document.getElementById('langPair');
        if (!langPairContainer) {
            console.warn('Контейнер langPair не найден');
            return;
        }

        // Получаем данные языков из initData или sessionStorage
        let language_original = initData.original_language;
        let language_translation = initData.translation_language;

        // Если это новый диктант, берем языки из sessionStorage
        if (initData.dictation_id === 'new') {
            const categoryDataStr = sessionStorage.getItem('selectedCategoryForDictation');
            if (categoryDataStr) {
                const categoryData = JSON.parse(categoryDataStr);
                language_original = categoryData.language_original || language_original;
                language_translation = categoryData.language_translation || language_translation;
            }
        }

        // Проверяем, что LanguageManager и LanguageSelector доступны
        if (typeof window.LanguageManager === 'undefined') {
            console.warn('LanguageManager не найден');
            return;
        }

        if (typeof LanguageSelector === 'undefined') {
            console.warn('LanguageSelector не найден');
            return;
        }

        // Получаем данные языков
        const languageData = window.LanguageManager.getLanguageData();
        if (!languageData) {
            console.warn('Данные языков не найдены');
            return;
        }

        // Создаем флаги с помощью LanguageSelector
        const flagCombo = new LanguageSelector({
            container: langPairContainer,
            mode: 'flag-combo',
            nativeLanguage: language_translation, // родной язык (перевод)
            currentLearning: language_original,   // изучаемый язык (оригинал)
            languageData: languageData
        });

    } catch (error) {
        console.error('Ошибка при инициализации флагов языков:', error);
    }
}

// ============================================================================
// УНИВЕРСАЛЬНАЯ СИСТЕМА ПРОИГРЫВАНИЯ АУДИО
// ============================================================================

let currentPlayingButton = null;

/**
 * Гарантированно устанавливает регион волны в соответствие текущему режиму
 * - full: берёт workingData.original.audio_user_shared_start/end или весь файл
 * - sentence: регион выбранного предложения
 * - mic: регион выбранного предложения
 */
function ensureWaveformRegionMatchesMode(currentMode) {
    const wf = window.waveformCanvas;
    if (!wf) return;

    if (currentMode === 'full' || currentMode === 'sentence' || currentMode === 'mic') {
        // В режимах по предложениям/микрофон берём границы из полей под волной
        const start = Number(startInput && startInput.value) || 0;
        const end = Number(endInput && endInput.value) || 0;
        if (end > start) {
            wf.setRegion(start, end);
            wf.setCurrentTime(start);
        }
    }
}

/**
 * Универсальная функция проигрывания аудио
 * @param {Event} event - событие клика
 */
async function handleAudioPlayback(event) {
    const button = event.target.closest('button.audio-btn');

    if (!button) {
        return;
    }

    // 1️⃣ Определяем URL    
    const state = button.dataset.state;
    const language = button.dataset.language; // 'en' или 'ru'
    const languageUrl = getAudioPath(language);
    
    let fieldName = 'audio'; // 'audio', 'audio_avto', 'audio_user', 'audio_mic', 'audio_user_shared'
    let nameAudioFile = 'audio.mp3';
    let sentence = {};
    let audioUrl = null;
    
    // Определяем, является ли это кнопкой под волной (объявляем в начале, чтобы была доступна везде)
    const isUnderWave = button && button.id === 'audioPlayBtn';

    // Кнопка воспроизведения созданного файла
     if (button.id === 'playCreatedAudioBtn') {
        audioUrl = button.dataset.audioUrl;
        if (!audioUrl) {
            console.warn('⚠️ Нет URL для воспроизведения созданного файла');
            return;
        }
    } else {
        sentence = getSentenceForButton(button);

        // Кнопка под волной: играем строго currentAudioFile (волна уже подготовлена внешними процедурами)
        if (isUnderWave) {
            const file = typeof currentAudioFileName !== 'undefined' ? currentAudioFileName : '';
            if (!file) {
                console.warn('⚠️ Нет текущего файла под волной — воспроизведение отменено');
                return;
            }
            audioUrl = `${languageUrl}/${file}`;

            // Не трогаем регион/волну из Play
        } else {
            fieldName = button.dataset.fieldName; // 'audio', 'audio_avto', 'audio_user', 'audio_mic', 'audio_user_shared'
            nameAudioFile = sentence && sentence[fieldName];
            audioUrl = `${languageUrl}/${nameAudioFile}`;
        }
    }
    // 2️⃣ Если что-то уже играет — остановим
    if (audioManager.currentButton && audioManager.currentButton !== button) {
        audioManager.stop();
    }

    // Проверяем наличие файла для состояния 'ready' (не для кнопки под волной)
    if (state === 'ready' && button.id !== 'audioPlayBtn' && button.id !== 'playCreatedAudioBtn') {
        const hasFile = nameAudioFile && typeof nameAudioFile === 'string' && nameAudioFile.trim() !== '';
        if (!hasFile) {
            console.warn('⚠️ Файл не найден для воспроизведения, переключаем на создание', {
                fieldName: fieldName,
                sentence: sentence,
                sentenceKey: sentence?.key,
                sentenceFieldValue: sentence?.[fieldName],
                buttonState: button.dataset.state,
                buttonOriginalState: button.dataset.originalState,
                nameAudioFile: nameAudioFile,
                audioUrl: audioUrl,
                workingDataSentence: sentence ? workingData.original.sentences.find(s => s.key === sentence.key) : null
            });
            
            // Проверяем, может файл есть в workingData, но не найден в sentence
            if (sentence && sentence.key) {
                const workingSentence = workingData.original.sentences.find(s => s.key === sentence.key);
                if (workingSentence && workingSentence[fieldName]) {
                    nameAudioFile = workingSentence[fieldName];
                    audioUrl = `${languageUrl}/${nameAudioFile}`;
                    // Не переключаем на creating, продолжаем воспроизведение
                } else {
                    // Файл не найден - переключаем на создание
                    button.dataset.state = 'creating';
                    setButtonState(button);
                    return;
                }
            } else {
                // Файл не найден - переключаем на создание
                button.dataset.state = 'creating';
                setButtonState(button);
                return;
            }
        }
    }

    switch (state) {
        case 'ready':
            // Для кнопки под волной (audioPlayBtn) проверяем только audioUrl, так как nameAudioFile для неё не используется
            if (isUnderWave) {
                if (!audioUrl || audioUrl.includes('undefined') || audioUrl.includes('null')) {
                    console.error('❌ ОШИБКА: URL не найден для кнопки под волной!', {
                        audioUrl: audioUrl,
                        currentAudioFileName: typeof currentAudioFileName !== 'undefined' ? currentAudioFileName : 'undefined'
                    });
                    return;
                }
            } else {
                // Для остальных кнопок проверяем и nameAudioFile
                if (!nameAudioFile || !audioUrl || audioUrl.includes('undefined') || audioUrl.includes('null')) {
                    console.error('❌ ОШИБКА: файл не найден при воспроизведении ready!', {
                        nameAudioFile: nameAudioFile,
                        audioUrl: audioUrl,
                        sentence: sentence,
                        fieldName: fieldName
                    });
                    button.dataset.state = 'creating';
                    setButtonState(button);
                    return;
                }
            }
            
            // Для кнопки под волной нужно передать waveformCanvas в audioManager
            if (isUnderWave && window.waveformCanvas && typeof audioManager.setWaveformCanvas === 'function') {
                audioManager.setWaveformCanvas(window.waveformCanvas);
            }
            
            audioManager.play(button, audioUrl);
            break;
        case 'ready-shared': {
            // Кнопка под волной: играем строго currentAudioFile
            if (button.id === 'audioPlayBtn') {
                const file = typeof currentAudioFileName !== 'undefined' ? currentAudioFileName : '';
                if (!file) {
                    console.warn('⚠️ Нет текущего файла под волной — воспроизведение отменено');
                    return;
                }
                audioUrl = `${languageUrl}/${file}`;
            }
            
            // Проверяем наличие audioUrl
            if (!audioUrl || audioUrl.includes('undefined') || audioUrl.includes('null')) {
                console.error('❌ ОШИБКА: URL не найден для кнопки ready-shared!', {
                    audioUrl: audioUrl,
                    buttonId: button.id,
                    currentAudioFileName: typeof currentAudioFileName !== 'undefined' ? currentAudioFileName : 'undefined'
                });
                return;
            }
            
            // Волна готовится извне; Play ничего не меняет
            if (window.waveformCanvas && typeof audioManager.setWaveformCanvas === 'function') {
                audioManager.setWaveformCanvas(window.waveformCanvas);
            }
            audioManager.play(button, audioUrl);
            break;
        }
        case 'playing':
        case 'playing-shared':
            audioManager.pause();
            break;
        case 'creating':
            // в состоянии "создание"
            await createAndPlayAudio(button, language, fieldName, languageUrl);
            break;
        case 'creating_user':
            // в состоянии "создание"
            await createAndPlayAudio(button, language, fieldName, languageUrl);
            break;
        case 'creating_mic':
            // в состоянии "создание микрофона" показываем иконку микрофона
            // TODO: реализовать создание аудио с микрофона
            break;
    }
}



/**
 * Обновить состояние кнопки после изменения текста
 */
// function updateAudioButtonState(audioBtn) {
//     // Получаем предложение для кнопки
//     const sentence = getSentenceForButton(audioBtn);
//     const hasAudio = sentence && sentence[audioBtn.dataset.fieldName];

//     // Обновляем dataset.create в зависимости от наличия аудио
//     audioBtn.dataset.create = hasAudio ? 'false' : 'true';
//     audioBtn.title = hasAudio ? 'Воспроизвести аудио' : 'Создать аудио';

//     // Обновляем состояние кнопки
//     setButtonState(audioBtn, 'ready');
// }

/**
 * Создать и проиграть аудио
 */
async function createAndPlayAudio(button, language, fieldName, languageUrl) {
    setButtonState(button, 'creating');

    try {
        // Получаем данные предложения
        const sentence = getSentenceForButton(button);
        if (!sentence) {
            throw new Error('Не найдено предложение для кнопки');
        }

        // Проверяем режим и наличие start/end для вырезания из общего файла
        const audioMode = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioMode ? audioMode.value : 'full';
        let nameAudioFile = null;

        // В режиме "sentence" для поля "audio_user" проверяем, можно ли вырезать из общего файла
        if (currentMode === 'sentence' && fieldName === 'audio_user' && 
            sentence.start !== undefined && sentence.end !== undefined &&
            sentence.start >= 0 && sentence.end > sentence.start &&
            currentAudioFileName) { // есть общий файл
            
            // Вырезаем кусочек из общего файла
            nameAudioFile = await trimAudioForSentence(sentence, language, currentAudioFileName);
            
            if (!nameAudioFile) {
                throw new Error('Не удалось вырезать аудио из общего файла');
            }
        } else {
            // Для других режимов или если не удалось вырезать - генерируем TTS
            nameAudioFile = await generateAudioForSentence(sentence, language);
            
            if (!nameAudioFile) {
                throw new Error('Не удалось создать аудио файл');
            }
        }

        // Обновляем данные предложения
        sentence[fieldName] = nameAudioFile;
        console.log('✅ Файл создан и сохранен в предложение:', {
            key: sentence.key,
            fieldName: fieldName,
            filename: nameAudioFile,
            sentence: sentence
        });

        // Меняем кнопку в режим готовности к воспроизведению (файл теперь существует)
        button.dataset.state = 'playing';
        button.dataset.originalState = 'ready';
        button.title = 'Воспроизвести аудио';
        setButtonState(button);
        
        // Обновляем видимость кнопки редактирования всех
        updateEditAllCreatingButtonVisibility();

        // Устанавливаем текущую кнопку и проигрываем созданный файл
        currentPlayingButton = button;
        audioUrl = `${languageUrl}/${nameAudioFile}`;
        audioManager.play(button, audioUrl);

    } catch (error) {
        console.error('❌ Ошибка при создании аудио:', error);
        setButtonState(button, 'creating');
        updateEditAllCreatingButtonVisibility();
        throw error;
    }
}

/**
 * Обработать редактирование всех строк с состоянием 'creating'
 */
async function handleEditAllCreating() {
    const editAllBtn = document.getElementById('editAllCreatingBtn');
    if (!editAllBtn) return;
    
    // Находим все кнопки с состоянием 'creating' и fieldName = 'audio_user'
    const creatingButtons = document.querySelectorAll('button.audio-btn[data-field-name="audio_user"][data-state="creating"]');
    
    if (creatingButtons.length === 0) {
        console.log('Нет строк с состоянием "creating" для редактирования');
        return;
    }
    
    showLoadingIndicator(`Создание аудио для ${creatingButtons.length} строк...`);
    
    try {
        const language = currentDictation.language_original;
        const languageUrl = getAudioPath(language);
        
        // Создаем аудио для каждой кнопки последовательно
        for (let i = 0; i < creatingButtons.length; i++) {
            const button = creatingButtons[i];
            
            // Обновляем индикатор загрузки
            showLoadingIndicator(`Создание аудио ${i + 1} из ${creatingButtons.length}...`);
            
            try {
                await createAndPlayAudio(button, language, 'audio_user', languageUrl);
                // Небольшая задержка между запросами, чтобы не перегружать сервер
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Ошибка при создании аудио для строки ${i + 1}:`, error);
                // Продолжаем обработку остальных строк
            }
        }
        
        console.log(`✅ Обработано ${creatingButtons.length} строк`);
    } catch (error) {
        console.error('❌ Ошибка при обработке всех строк:', error);
        alert('Произошла ошибка при создании аудио. Проверьте консоль для деталей.');
    } finally {
        hideLoadingIndicator();
        updateEditAllCreatingButtonVisibility();
    }
}

/**
 * Обновить видимость кнопки "Отредактировать все отмеченные"
 */
function updateEditAllCreatingButtonVisibility() {
    const editAllBtn = document.getElementById('editAllCreatingBtn');
    if (!editAllBtn) return;
    
    // Находим все кнопки с состоянием 'creating' и fieldName = 'audio_user'
    const creatingButtons = document.querySelectorAll('button.audio-btn[data-field-name="audio_user"][data-state="creating"]');
    
    // Показываем кнопку только если есть строки с состоянием 'creating'
    // и если мы находимся в режиме, где видна колонка с кнопками
    const table = document.getElementById('sentences-table');
    const isUserColumnVisible = table && table.querySelector('.col-play-audio.panel-editing-user')?.style.display !== 'none';
    
    if (creatingButtons.length > 0 && isUserColumnVisible) {
        editAllBtn.style.display = 'inline-block';
    } else {
        editAllBtn.style.display = 'none';
    }
}


/**
 * Проиграть существующий аудио файл
 */
// async function playExistingAudio(button, language, fieldName) {
//     // Получаем имя файла из данных предложения
//     const audioFile = getAudioFileName(button, language, fieldName);

//     if (!audioFile) {
//         console.warn('⚠️ Аудио файл не найден');
//         return;
//     }

//     // Устанавливаем текущую кнопку
//     currentPlayingButton = button;

//     // Определяем правильное состояние для кнопки
//     const isSharedButton = button.dataset.state === 'ready-shared' || button.dataset.state === 'playing-shared';
//     const playingState = isSharedButton ? 'playing-shared' : 'playing';
//     setButtonState(button, playingState);

//     // Обновляем playhead только для кнопки под волной
//     const shouldUpdatePlayhead = isSharedButton;

//     // Используем window.waveformCanvas вместо локальной переменной
//     const activeWaveformCanvas = window.waveformCanvas || waveformCanvas;

//     if (isSharedButton && activeWaveformCanvas) {
//         // Для кнопки под волной передаем управление WaveformCanvas
//         const audioElement = AudioManager.getPlayer(audioFile, language);
//         const audioUrl = `/static/data/temp/${currentDictation.id}/${language}/${audioFile}`;
//         // Если плеер еще не загружен, устанавливаем URL
//         if (!audioElement.src) {
//             audioElement.src = audioUrl;
//         }

//         // Запускаем воспроизведение через WaveformCanvas
//         await activeWaveformCanvas.startPlayback(audioElement);

//         // НО также устанавливаем обработчики событий через playAudioFile
//         await playAudioFile(audioFile, language, shouldUpdatePlayhead);
//     } else {
//         // Для обычных кнопок используем старую логику
//         await playAudioFile(audioFile, language, shouldUpdatePlayhead);
//     }
// }

/**
 * Проиграть аудио файл через AudioManager
 */
async function playAudioFile(nameAudioFile, language, updatePlayhead = false) {

    if (!nameAudioFile) {
        console.warn("playAudioFile: no nameAudioFile");
        return;
    }

    const audioUrl = `${getAudioPath(language)}/${nameAudioFile}`;

    // Если сейчас играет другая кнопка — остановим и восстановим её состояние
    if (currentPlayingButton && currentPlayingButton !== button) {
        // восстановление состояния предыдущей кнопки
        const originalStatePrev = currentPlayingButton.dataset.originalState || 'ready';
        setButtonState(currentPlayingButton, originalStatePrev);
        currentPlayingButton = null;
        // остановим аудиоManager
        audioManager.stop();
        // и остановим контроль волны, если нужен
        if (window.waveformCanvas) {
            window.waveformCanvas.stopAudioControl();
        }
    }

    // Передаем контроль воспроизведения в WaveformCanvas (только если нужно)
    if (updatePlayhead && window.waveformCanvas) {
        window.waveformCanvas.startAudioControl(player);
    }

    return new Promise((resolve, reject) => {
        // Очищаем старые обработчики (если они есть)
        player.onloadeddata = null;
        player.onended = null;
        player.onpause = null;
        player.onerror = null;

        player.onloadeddata = () => {
            player.play().catch(error => {
                console.error('❌ Ошибка воспроизведения:', error);
                console.error('❌ URL файла:', audioUrl);
                console.error('❌ Имя файла:', audioFile);
                reject(error);
            });
        };

        // Функция для восстановления состояния кнопки
        const restoreButtonState = () => {
            if (currentPlayingButton) {
                const originalState = currentPlayingButton.dataset.originalState || 'ready';
                console.log('📣 📣 📣  Плеер: Восстанавливаем состояние кнопки:', originalState);
                setButtonState(currentPlayingButton, originalState);
                currentPlayingButton = null;
            }
        };

        player.onended = () => {
            console.log('📣 📣 📣 📣 📣 📣  Плеер: Воспроизведение завершено:', audioFile);
            // Останавливаем контроль WaveformCanvas
            if (updatePlayhead && window.waveformCanvas) {
                console.log('📣  Плеер: Останавливаем WaveformCanvas');
                window.waveformCanvas.stopAudioControl();
            }
            console.log('📣 📣 📣 📣 📣 📣 currentPlayingButton:', currentPlayingButton);
            restoreButtonState();
            resolve();
        };

        // Добавляем слушатель на pause (когда WaveformCanvas останавливает аудио в конце региона)
        player.onpause = () => {
            console.log('📣 📣 📣 📣 📣 📣  Плеер: Аудио приостановлено');
            console.log('📣 📣 📣 📣 📣 📣  Плеер: currentPlayingButton:', currentPlayingButton);
            console.log('📣 📣 📣 📣 📣 📣  Плеер: updatePlayhead:', updatePlayhead);
            // Проверяем, что это остановка WaveformCanvas в конце региона, а не ручная остановка
            if (currentPlayingButton && updatePlayhead) {
                console.log('📣  Плеер: Это остановка WaveformCanvas в конце региона');
                restoreButtonState();
                resolve();
            }
        };

        player.onerror = (error) => {
            console.error('❌ Ошибка воспроизведения:', error);
            restoreButtonState();
            reject(error);
        };
    });
}

/**
 * Остановить текущее проигрывание
 */
// async function stopCurrentPlayback() {
//     console.log('🔘 stopCurrentPlayback вызвана');

//     // Останавливаем все аудио через AudioManager
//     AudioManager.stopAll();

//     // Останавливаем контроль WaveformCanvas
//     if (window.waveformCanvas) {
//         console.log('🔘 Вызываем waveformCanvas.stopAudioControl()');
//         window.waveformCanvas.stopAudioControl();
//     }

//     if (currentPlayingButton) {
//         // Восстанавливаем исходное состояние кнопки
//         const originalState = currentPlayingButton.dataset.originalState || 'ready';
//         setButtonState(currentPlayingButton, originalState);
//         currentPlayingButton = null;
//     }
// }

/**
 * Получить предложение для кнопки
 */
function getSentenceForButton(button) {

    // Определяем язык из данных кнопки
    const language = button.dataset.language;

    if (language === currentDictation.language_original) {
        if (button.dataset.state === 'ready-shared') {
            return workingData.original;
        } else {
            const row = button.closest('tr');
            const key = row.dataset.key;
            return workingData.original.sentences.find(s => s.key === key);
        }
    } else {
        if (button.dataset.state === 'ready-shared') {
            return workingData.translation;
        } else {
            const row = button.closest('tr');
            const key = row.dataset.key;
            return workingData.translation.sentences.find(s => s.key === key);
        }
    }
}

/**
 * Получить имя аудио файла
 */
function getAudioFileName(button, language, fieldName) {
    const sentence = getSentenceForButton(button);
    const fileName = sentence ? sentence[fieldName] : null;
    return fileName;
}

/**
 * Установить состояние кнопки
 * показываем то стостояние, которое передали в функцию или из dataset.state
 */
function setButtonState(button, state = '') {
    // Убираем все состояния
    // button.classList.remove('state-ready', 'state-playing', 'state-creating');

    // // Добавляем новое состояние
    // button.classList.add(`state-${state}`);
    if (state === '') {
        state = button.dataset.state;
    }

    let newIcon = '';
    switch (state) {
        case 'ready':
            // в состоянии "готов" показываем иконку воспроизведения
            newIcon = 'play';
            break;
        case 'ready-shared':
            // в состоянии "готов-shared" показываем иконку воспроизведения
            // это состояние для кнопки, которая воспроизводит аудио общего пользователя
            newIcon = 'play';
            break;
        case 'playing':
            // в состоянии "воспроизведение" показываем иконку паузы
            newIcon = 'pause';
            break;
        case 'playing-shared':
            // в состоянии "воспроизведение-shared" показываем иконку паузы
            // это состояние для кнопки под волной во время воспроизведения
            newIcon = 'pause';
            break;
        case 'creating':
            // в состоянии "создание" показываем иконку молотка
            newIcon = 'hammer';
            break;
        case 'creating_mic':
            // в состоянии "создание микрофона" показываем иконку микрофона
            newIcon = 'mic';
            break;
    }
    button.innerHTML = `<i data-lucide="${newIcon}"></i>`;

    // Обновляем состояние кнопки в DOM
    button.dataset.state = state;

    // Перерисовываем иконку Lucide
    lucide.createIcons();
}

// ============================================================================
// ФУНКЦИИ ДЛЯ ИНДИКАТОРА ЗАГРУЗКИ
// ============================================================================

function showLoadingIndicator(message = 'Загрузка...') {
    // Создаем overlay
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

// ============================================================================
// ФУНКЦИИ ДЛЯ ПОДСВЕТКИ СИНТАКСИСА В TEXTAREA
// ============================================================================

/**
 * Настройка подсветки синтаксиса для contenteditable div
 * @param {HTMLElement} editor - элемент contenteditable
 */
function setupTextareaHighlighting(editor) {
    let isUpdating = false;

    // Функция обновления подсветки
    function updateHighlight() {
        if (isUpdating) return;

        const text = editor.innerText || editor.textContent;
        const lines = text.split('\n');
        // Старое значение по умолчанию: '/*'
        const delimiter = document.getElementById('translationDelimiter')?.value || '//';

        const highlightedText = lines.map(line => {
            if (line.trim().startsWith(delimiter)) {
                return `<span class="line-translation">${escapeHtml(line)}</span>`;
            }
            return escapeHtml(line);
        }).join('\n');

        // Сохраняем позицию курсора
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const cursorOffset = range ? getCursorOffset(editor, range) : 0;

        isUpdating = true;
        editor.innerHTML = highlightedText;

        // Восстанавливаем позицию курсора
        if (cursorOffset !== null) {
            setCursorAtOffset(editor, cursorOffset);
        }
        isUpdating = false;
    }

    // Обработчики событий
    editor.addEventListener('input', () => {
        if (!isUpdating) {
            setTimeout(updateHighlight, 10);
        }
    });

    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, text);
        setTimeout(updateHighlight, 10);
    });

    // Обработчик изменения разделителя
    const delimiterInput = document.getElementById('translationDelimiter');
    if (delimiterInput) {
        delimiterInput.addEventListener('input', updateHighlight);
    }

    // Первоначальная подсветка
    updateHighlight();
}

/**
 * Получить позицию курсора относительно начала элемента
 * @param {HTMLElement} element - элемент
 * @param {Range} range - диапазон выделения
 * @returns {number} - позиция курсора
 */
function getCursorOffset(element, range) {
    let offset = 0;
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        if (node === range.startContainer) {
            offset += range.startOffset;
            break;
        }
        offset += node.textContent.length;
    }

    return offset;
}

/**
 * Установить курсор в указанную позицию
 * @param {HTMLElement} element - элемент
 * @param {number} offset - позиция курсора
 */
function setCursorAtOffset(element, offset) {
    const range = document.createRange();
    const selection = window.getSelection();

    let currentOffset = 0;
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= offset) {
            range.setStart(node, offset - currentOffset);
            range.setEnd(node, offset - currentOffset);
            break;
        }
        currentOffset += nodeLength;
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Экранирование HTML символов
 * @param {string} text - текст для экранирования
 * @returns {string} - экранированный текст
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С БОКОВОЙ ПАНЕЛЬЮ НАСТРОЕК АУДИО
// ============================================================================

/**
 * Открыть боковую панель настроек аудио
 * @param {string} language - 'original' или 'translation'
 * @param {string} rowKey - ключ строки
 */
function openAudioSettingsPanel(language, rowKey) {
    // Сохраняем текущий режим редактирования
    currentDictation.current_edit_mode = language;
    currentDictation.current_row_key = rowKey;

    // Переключаемся на вкладку "Настройка аудио"
    switchTab('audio');

    // Инициализируем режим "отображать весь файл" при открытии
    const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
    if (fullRadio) {
        fullRadio.checked = true;
        // Инициируем обработчик изменения режима
        handleAudioModeChange({ target: fullRadio });
    }

    // Обновляем иконки радио-кнопок при открытии
    updateRadioButtonIcons('full');
}

/**
 * Закрыть боковую панель настроек аудио
 */
function closeAudioSettingsPanel() {
    // Очищаем текущий режим редактирования
    currentDictation.current_edit_mode = null;
    currentDictation.current_row_key = null;

    console.log('Боковая панель закрыта');
}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ПАНЕЛЬЮ ВКЛАДОК
// ============================================================================

/**
 * Переключение вкладок
 * @param {string} tabName - имя вкладки ('general', 'audio', 'dialog')
 */
function switchTab(tabName) {
    // Убираем активный класс у всех кнопок и контента
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Активируем выбранную вкладку
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`tab-${tabName}`);

    if (tabBtn && tabContent) {
        tabBtn.classList.add('active');
        tabContent.classList.add('active');

        // Обновляем иконки Lucide при переключении
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/**
 * Инициализация панели вкладок
 */
function setupTabsPanel() {
    // Обработчики для кнопок вкладок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
            applyTableViewForTab(tabName);
        });
    });

    // Синхронизация полей названий между основной формой и вкладкой
    const titleInput = document.getElementById('title');
    const tabTitleInput = document.getElementById('tabTitle');
    const titleTranslationInput = document.getElementById('title_translation');
    const tabTitleTranslationInput = document.getElementById('tabTitleTranslation');

    if (titleInput && tabTitleInput) {
        // Синхронизация из основной формы во вкладку
        titleInput.addEventListener('input', () => {
            tabTitleInput.value = titleInput.value;
        });

        // Синхронизация из вкладки в основную форму
        tabTitleInput.addEventListener('input', () => {
            titleInput.value = tabTitleInput.value;
        });
    }

    if (titleTranslationInput && tabTitleTranslationInput) {
        // Синхронизация из основной формы во вкладку
        titleTranslationInput.addEventListener('input', () => {
            tabTitleTranslationInput.value = titleTranslationInput.value;
        });

        // Синхронизация из вкладки в основную форму
        tabTitleTranslationInput.addEventListener('input', () => {
            titleTranslationInput.value = tabTitleTranslationInput.value;
        });
    }

    // Синхронизация обложки
    const coverImage = document.getElementById('coverImage');
    const tabCoverImage = document.getElementById('tabCoverImage');
    const coverFile = document.getElementById('coverFile');
    const tabCoverFile = document.getElementById('tabCoverFile');

    if (coverImage && tabCoverImage) {
        // Синхронизация обложки через MutationObserver
        const observer = new MutationObserver(() => {
            if (coverImage.src !== tabCoverImage.src) {
                tabCoverImage.src = coverImage.src;
            }
        });
        observer.observe(coverImage, { attributes: true, attributeFilter: ['src'] });

        const tabObserver = new MutationObserver(() => {
            if (tabCoverImage.src !== coverImage.src) {
                coverImage.src = tabCoverImage.src;
            }
        });
        tabObserver.observe(tabCoverImage, { attributes: true, attributeFilter: ['src'] });
    }

    // Обработчик загрузки обложки во вкладке
    const tabCoverUploadBtn = document.getElementById('tabCoverUploadBtn');
    if (tabCoverUploadBtn && tabCoverFile) {
        tabCoverUploadBtn.addEventListener('click', () => {
            tabCoverFile.click();
        });

        tabCoverFile.addEventListener('change', (e) => {
            if (coverFile && e.target.files && e.target.files[0]) {
                // Используем тот же обработчик что и для основной кнопки
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgUrl = event.target.result;
                    if (coverImage) coverImage.src = imgUrl;
                    if (tabCoverImage) tabCoverImage.src = imgUrl;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Обработчик чекбокса диалога во вкладке
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    const isDialogCheckbox = document.getElementById('isDialogCheckbox');
    const tabSpeakersTable = document.getElementById('tabSpeakersTable');

    if (tabIsDialogCheckbox) {
        tabIsDialogCheckbox.addEventListener('change', () => {
            const isDialog = tabIsDialogCheckbox.checked;
            currentDictation.is_dialog = isDialog;

            // Синхронизируем с основным чекбоксом
            if (isDialogCheckbox) {
                isDialogCheckbox.checked = isDialog;
                updateCheckboxIcon(isDialogCheckbox);
            }

            // Показываем/скрываем таблицу спикеров
            if (tabSpeakersTable) {
                tabSpeakersTable.style.display = isDialog ? 'block' : 'none';
            }

            // Обновляем иконку чекбокса
            const checkboxIcon = document.querySelector('#tabDialogCheckboxLabel .checkbox-icon');
            if (checkboxIcon) {
                if (isDialog) {
                    checkboxIcon.setAttribute('data-lucide', 'circle-check');
                } else {
                    checkboxIcon.setAttribute('data-lucide', 'circle');
                }
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }

            // Только показать/скрыть колонку без пересборки таблицы
            const show = !!isDialog;
            const speakerHeader = document.querySelector('th.col-speaker');
            if (speakerHeader) speakerHeader.style.display = show ? 'table-cell' : 'none';
            document.querySelectorAll('td.col-speaker').forEach(td => {
                td.style.display = show ? 'table-cell' : 'none';
            });
        });

        // Обработчики для таблицы спикеров во вкладке
        setupTabSpeakersHandlers();
    }
    
    // Обработчики для вкладки "Создание аудио"
    setupCreateAudioHandlers();
}

/**
 * Обработчик переключения чекбокса (общий для всех строк, как handleAudioPlayback)
 */
function handleCheckboxToggle(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Находим кнопку через closest (как в handleAudioPlayback)
    const btn = e.target.closest('button.checkbox-btn');
    
    if (!btn) {
        return;
    }
    
    const key = btn.dataset.key;
    
    if (!key) return;
    
    // Находим предложение по ключу
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) return;
    
    // Переключаем состояние checked
    sentence.checked = !sentence.checked;
    
    // Находим иконку в этой кнопке и обновляем её
    const icon = btn.querySelector('.checkbox-icon');
    if (icon) {
        const iconName = sentence.checked ? 'circle-check' : 'circle';
        
        // Очищаем старую иконку (удаляем SVG, если есть)
        const oldSvg = icon.querySelector('svg');
        if (oldSvg) {
            oldSvg.remove();
        }
        
        // Устанавливаем новый атрибут data-lucide
        icon.setAttribute('data-lucide', iconName);
        
        // Перерисовываем иконку Lucide
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }
    
    // Обновляем состояние общего чекбокса
    updateSelectAllCheckboxState();
}

/**
 * Настройка обработчиков для вкладки "Создание аудио"
 */
// Глобальный список созданных файлов в этой сессии
let createdAudioFiles = [];

function setupCreateAudioHandlers() {
    // Обработчик для общего чекбокса "Выбрать все"
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectAllCheckboxLabel = document.getElementById('selectAllCheckboxLabel');
    
    if (selectAllCheckbox && selectAllCheckboxLabel) {
        // Обработчик клика на label
        selectAllCheckboxLabel.addEventListener('click', function(e) {
            e.preventDefault();
            selectAllCheckbox.checked = !selectAllCheckbox.checked;
            selectAllCheckbox.dispatchEvent(new Event('change'));
        });
        
        // Обработчик изменения чекбокса
        selectAllCheckbox.addEventListener('change', function() {
            const isChecked = selectAllCheckbox.checked;
            const checkboxIcon = selectAllCheckboxLabel.querySelector('.checkbox-icon');
            
            if (checkboxIcon) {
                checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
            
            // Устанавливаем состояние checked для всех предложений в данных
            if (workingData && workingData.original && workingData.original.sentences) {
                workingData.original.sentences.forEach(sentence => {
                    sentence.checked = isChecked;
                });
            }
            
            // Обновляем иконки во всех строках таблицы
            const allCheckboxBtns = document.querySelectorAll('td.col-checkbox-create-audio .checkbox-btn');
            allCheckboxBtns.forEach(btn => {
                const icon = btn.querySelector('.checkbox-icon');
                if (icon) {
                    icon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                }
            });
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
    
    // Обработчик кнопки "Создать файл"
    const createAudioFileBtn = document.getElementById('createAudioFileBtn');
    if (createAudioFileBtn) {
        createAudioFileBtn.addEventListener('click', async function() {
            await showCreateAudioFileModal();
        });
    }
    
    // Обработчик кнопки "Сохранить файл на диск"
    const saveAudioFileBtn = document.getElementById('saveAudioFileBtn');
    if (saveAudioFileBtn) {
        saveAudioFileBtn.addEventListener('click', async function() {
            await saveAudioFileToDisk();
        });
    }
    
    // Обработчик dropdown списка файлов
    const dropdownBtn = document.getElementById('audioFileDropdownBtn');
    const dropdown = document.getElementById('audioFileDropdown');
    
    if (dropdownBtn && dropdown) {
        dropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
        
        // Закрываем dropdown при клике вне его
        document.addEventListener('click', function(e) {
            if (!dropdownBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
    
    // Обработчик кнопки воспроизведения созданного аудио
    const playCreatedAudioBtn = document.getElementById('playCreatedAudioBtn');
    if (playCreatedAudioBtn) {
        playCreatedAudioBtn.addEventListener('click', handleAudioPlayback);
    }
    
    // Обработчик кнопки "Отредактировать все отмеченные"
    const editAllCreatingBtn = document.getElementById('editAllCreatingBtn');
    if (editAllCreatingBtn) {
        editAllCreatingBtn.addEventListener('click', handleEditAllCreating);
    }
    
    // Обработчик выпадающего списка обозначений
    const audioNotationsSelect = document.getElementById('audioNotationsSelect');
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (audioNotationsSelect && audioTypeInput) {
        const button = audioNotationsSelect.querySelector('.speed-select-button');
        const list = audioNotationsSelect.querySelector('.speed-options');
        const optionElements = Array.from(list.querySelectorAll('li'));
        
        if (button && list && optionElements.length > 0) {
            // Обработчик открытия/закрытия списка
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                audioNotationsSelect.classList.toggle('open');
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
            
            // Обработчик выбора элемента из списка
            optionElements.forEach(li => {
                li.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const textToAdd = li.dataset.text || '';
                    if (textToAdd) {
                        // Добавляем текст в поле ввода (в конец)
                        const currentValue = audioTypeInput.value || '';
                        audioTypeInput.value = currentValue + textToAdd;
                    }
                    
                    // Закрываем список
                    audioNotationsSelect.classList.remove('open');
                });
            });
            
            // Закрываем список при клике вне его
            if (!audioNotationsSelect.dataset.initialized) {
                document.addEventListener('click', function(e) {
                    if (audioNotationsSelect && !audioNotationsSelect.contains(e.target)) {
                        audioNotationsSelect.classList.remove('open');
                    }
                });
                audioNotationsSelect.dataset.initialized = 'true';
            }
        }
    }
}
/**
 * Создать комбинированный аудио файл из выбранных предложений
 * @param {string} customFileName - кастомное имя файла (если не указано, используется паттерн)
 */
async function createCombinedAudioFile(customFileName = null) {
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (!audioTypeInput) {
        console.error('Поле ввода типа аудио не найдено');
        return;
    }
    
    const pattern = audioTypeInput.value.trim().toLowerCase();
    if (!pattern) {
        alert('Введите паттерн аудио (например: op, op_o, tp_mm)');
        return;
    }
    
    // Определяем имя файла
    const fileName = customFileName || `audio_${pattern}.mp3`;
    
    // Получаем все выбранные предложения
    const selectedSentences = workingData.original.sentences.filter(s => s.checked === true);
    
    if (selectedSentences.length === 0) {
        alert('Выберите хотя бы одно предложение');
        return;
    }
    
    // Парсим паттерн на элементы (o, p, p_o, t, m, и т.д.)
    const patternElements = parseAudioPattern(pattern);
    
    if (patternElements.length === 0) {
        alert('Неверный паттерн аудио');
        return;
    }
    
    // Собираем список файлов для каждого предложения
    const fileSequence = [];
    
    for (const sentence of selectedSentences) {
        // Находим соответствующее предложение перевода
        const translationSentence = workingData.translation.sentences.find(s => s.key === sentence.key);
        
        // Для каждого элемента паттерна получаем файл или паузу
        for (const element of patternElements) {
            const audioInfo = getAudioFileForPattern(element, sentence, translationSentence);
            if (audioInfo) {
                fileSequence.push(audioInfo);
            }
        }
    }
    
    if (fileSequence.length === 0) {
        alert('Не удалось найти аудио файлы для создания комбинации');
        return;
    }
    
    // Показываем индикатор загрузки
    showLoadingIndicator('Создание комбинированного аудио файла...');
    
    try {
        // Отправляем запрос на сервер для склейки
        const response = await fetch('/create-combined-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dictation_id: currentDictation.id,
                safe_email: currentDictation.safe_email,
                file_sequence: fileSequence,
                pattern: pattern,
                filename: fileName
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Добавляем файл в список созданных
            const fileInfo = {
                filename: result.filename,
                filepath: result.filepath,
                pattern: pattern,
                createdAt: new Date().toISOString()
            };
            createdAudioFiles.push(fileInfo);
            
            // Обновляем интерфейс
            updateAudioFileList();
            selectAudioFileFromList(fileInfo);
         } else {
            alert('Ошибка создания файла: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('❌ Ошибка при создании комбинированного аудио:', error);
        alert('Ошибка при создании файла: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Показать модальное окно для создания аудио файла
 */
async function showCreateAudioFileModal() {
    const modal = document.getElementById('createAudioFileModal');
    const fileNameInput = document.getElementById('newAudioFileName');
    const audioTypeInput = document.getElementById('audioTypeInput');
    
    if (!modal || !fileNameInput || !audioTypeInput) {
        console.error('Элементы модального окна не найдены');
        return;
    }
    
    // Получаем паттерн из поля ввода
    const pattern = audioTypeInput.value.trim().toLowerCase();
    
    // Предзаполняем имя файла
    const defaultName = pattern ? `audio_${pattern}.mp3` : 'audio.mp3';
    fileNameInput.value = defaultName;
    
    // Показываем модальное окно
    modal.style.display = 'flex';
    
    // Фокусируемся на поле ввода
    fileNameInput.focus();
    fileNameInput.select();
    
    // Обработчики кнопок модального окна
    const confirmBtn = document.getElementById('createAudioFileModalConfirm');
    const cancelBtn = document.getElementById('createAudioFileModalCancel');
    
    const handleConfirm = async () => {
        const fileName = fileNameInput.value.trim();
        if (!fileName) {
            alert('Введите имя файла');
            return;
        }
        
        // Закрываем модальное окно
        modal.style.display = 'none';
        
        // Создаем файл с указанным именем
        await createCombinedAudioFile(fileName);
    };
    
    const handleCancel = () => {
        modal.style.display = 'none';
    };
    
    // Удаляем старые обработчики, если есть
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleConfirm);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', handleCancel);
    
    // Закрытие по Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Обновляем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Обновить список созданных файлов в dropdown
 */
function updateAudioFileList() {
    const dropdown = document.getElementById('audioFileDropdown');
    const dropdownWrapper = document.querySelector('.audio-file-dropdown-wrapper');
    
    if (!dropdown || !dropdownWrapper) return;
    
    if (createdAudioFiles.length === 0) {
        dropdownWrapper.style.display = 'none';
        return;
    }
    
    // Показываем dropdown если есть файлы
    dropdownWrapper.style.display = 'inline-block';
    
    // Очищаем список
    dropdown.innerHTML = '';
    
    // Добавляем файлы в обратном порядке (новые сверху)
    createdAudioFiles.slice().reverse().forEach((fileInfo, index) => {
        const item = document.createElement('div');
        item.className = 'audio-file-dropdown-item';
        item.textContent = fileInfo.filename;
        item.dataset.index = createdAudioFiles.length - 1 - index;
        
        item.addEventListener('click', () => {
            selectAudioFileFromList(fileInfo);
            dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(item);
    });
    
    // Обновляем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Выбрать файл из списка
 */
function selectAudioFileFromList(fileInfo) {
    const audioFileNameLabel = document.getElementById('audioFileNameLabel');
    const playBtn = document.getElementById('playCreatedAudioBtn');
    const saveBtn = document.getElementById('saveAudioFileBtn');
    
    if (!audioFileNameLabel || !fileInfo) return;
    
    // Обновляем лейбл
    audioFileNameLabel.textContent = `Имя файла: ${fileInfo.filename}`;
    
    // Сохраняем выбранный файл
    window.createdAudioFileName = fileInfo.filename;
    window.createdAudioFilePath = fileInfo.filepath;
    
    // Показываем и обновляем кнопку воспроизведения, когда файл создан/выбран
    if (playBtn) {
        playBtn.style.display = 'inline-flex';
        playBtn.dataset.state = 'ready';
        playBtn.dataset.audioUrl = fileInfo.filepath;
        setButtonState(playBtn, 'ready');
    }
    
    // Показываем кнопку сохранения, когда файл создан/выбран
    if (saveBtn) {
        saveBtn.style.display = 'inline-flex';
    }
}

/**
 * Сохранить аудио файл на диск
 */
async function saveAudioFileToDisk() {
    const currentFile = window.createdAudioFileName;
    const currentFilePath = window.createdAudioFilePath;
    
    if (!currentFile || !currentFilePath) {
        alert('Выберите файл для сохранения');
        return;
    }
    
    try {
        // Скачиваем файл
        const response = await fetch(currentFilePath);
        if (!response.ok) {
            throw new Error('Не удалось загрузить файл');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error('❌ Ошибка при сохранении файла:', error);
        alert('Ошибка при сохранении файла: ' + error.message);
    }
}

/**
 * Парсить паттерн аудио на элементы
 * Например: "op" -> ["o", "p"], "op_o" -> ["o", "p_o"], "tp_mm" -> ["t", "p", "m", "m"]
 */
function parseAudioPattern(pattern) {
    const elements = [];
    let i = 0;
    
    while (i < pattern.length) {
        // Проверяем паузу с длиной файла (p_o, p_t, p_a, p_f, p_m)
        if (pattern[i] === 'p' && i + 2 < pattern.length && pattern[i + 1] === '_') {
            const pauseType = pattern[i + 2];
            if (['o', 't', 'a', 'f', 'm'].includes(pauseType)) {
                elements.push(`p_${pauseType}`);
                i += 3;
                continue;
            }
        }
        
        // Обычный символ (o, t, a, f, m, p)
        if (['o', 't', 'a', 'f', 'm', 'p'].includes(pattern[i])) {
            elements.push(pattern[i]);
            i++;
        } else {
            // Пропускаем неизвестные символы
            i++;
        }
    }
    
    return elements;
}

/**
 * Получить информацию об аудио файле для элемента паттерна
 * @param {string} element - элемент паттерна (o, t, a, f, m, p, p_o, p_t, и т.д.)
 * @param {Object} originalSentence - предложение оригинала
 * @param {Object|null} translationSentence - предложение перевода
 * @returns {Object|null} - информация об аудио файле или паузе
 */
function getAudioFileForPattern(element, originalSentence, translationSentence) {
    const language_original = currentDictation.language_original;
    const language_translation = currentDictation.language_translation;
    
    // Пауза 1 секунда
    if (element === 'p') {
        return {
            type: 'pause',
            duration: 1.0
        };
    }
    
    // Пауза длиной в файл
    if (element.startsWith('p_')) {
        const pauseType = element.substring(2); // o, t, a, f, m
        const referenceFile = getReferenceAudioFile(pauseType, originalSentence, translationSentence);
        
        return {
            type: 'pause_file',
            duration_file: referenceFile ? referenceFile.filename : null,
            language: referenceFile ? referenceFile.language : language_original,
            fallback_duration: 1.0 // Если файл не найден, используем 1 секунду
        };
    }
    
    // Аудио файлы
    let filename = null;
    let language = language_original;
    let fieldName = null;
    
    switch (element) {
        case 'o': // оригинал
            filename = originalSentence?.audio;
            language = language_original;
            fieldName = 'audio';
            break;
        case 't': // перевод
            filename = translationSentence?.audio || originalSentence?.audio; // fallback на оригинал
            language = translationSentence ? language_translation : language_original;
            fieldName = 'audio';
            break;
        case 'a': // автоматическое
            filename = originalSentence?.audio_avto;
            language = language_original;
            fieldName = 'audio_avto';
            break;
        case 'f': // вырезанное из файла
            filename = originalSentence?.audio_user;
            language = language_original;
            fieldName = 'audio_user';
            break;
        case 'm': // микрофон
            filename = originalSentence?.audio_mic;
            language = language_original;
            fieldName = 'audio_mic';
            break;
    }
    
    // Если файл не найден, используем fallback на оригинал
    if (!filename && element !== 'o') {
        filename = originalSentence?.audio;
        language = language_original;
        fieldName = 'audio';
    }
    
    if (!filename) {
        return null;
    }
    
    return {
        type: 'file',
        filename: filename,
        language: language,
        sentence_key: originalSentence.key
    };
}

/**
 * Получить файл для определения длины паузы
 */
function getReferenceAudioFile(pauseType, originalSentence, translationSentence) {
    switch (pauseType) {
        case 'o': // оригинал
            return originalSentence?.audio ? {
                filename: originalSentence.audio,
                language: currentDictation.language_original
            } : null;
        case 't': // перевод
            return translationSentence?.audio ? {
                filename: translationSentence.audio,
                language: currentDictation.language_translation
            } : (originalSentence?.audio ? {
                filename: originalSentence.audio,
                language: currentDictation.language_original
            } : null);
        case 'a': // автоматическое
            return originalSentence?.audio_avto ? {
                filename: originalSentence.audio_avto,
                language: currentDictation.language_original
            } : null;
        case 'f': // вырезанное из файла
            return originalSentence?.audio_user ? {
                filename: originalSentence.audio_user,
                language: currentDictation.language_original
            } : null;
        case 'm': // микрофон
            return originalSentence?.audio_mic ? {
                filename: originalSentence.audio_mic,
                language: currentDictation.language_original
            } : null;
        default:
            return null;
    }
}

/**
 * Обновить состояние чекбокса "Выбрать все" на основе состояния всех чекбоксов строк
 */
function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectAllCheckboxLabel = document.getElementById('selectAllCheckboxLabel');
    
    if (!selectAllCheckbox || !selectAllCheckboxLabel) return;
    
    // Получаем все предложения и проверяем их checked
    const allSentences = workingData.original.sentences || [];
    const checkedCount = allSentences.filter(s => s.checked === true).length;
    
    if (allSentences.length === 0) {
        selectAllCheckbox.checked = false;
    } else {
        selectAllCheckbox.checked = (checkedCount === allSentences.length);
    }
    
    const checkboxIcon = selectAllCheckboxLabel.querySelector('.checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', selectAllCheckbox.checked ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/**
 * Применяет вид таблицы в зависимости от выбранной вкладки
 * general: оригинал + перевод
 * audio: оригинал + панель редактирования (по текущему радио)
 * dialog: как general (таблица без панели редактирования)
 */
function applyTableViewForTab(tabName) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    currentTabName = tabName;

    if (tabName === 'audio') {
        // Открываем режим редактирования
        toggleColumnGroup('original');
        // Учитываем текущее радио для показа правых колонок
        let checked = document.querySelector('input[name="audioMode"]:checked');
        if (!checked) {
            // Если ни одно радио не выбрано (первый заход), выбираем "full" и запускаем обработчик
            const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
            if (fullRadio) {
                fullRadio.checked = true;
                if (typeof handleAudioModeChange === 'function') {
                    handleAudioModeChange({ target: fullRadio });
                }
                checked = fullRadio;
            }
        }

        if (checked) {
            updateTableColumnsVisibility(checked.value);
        }

        // Обновляем текущее аудио и волну (важно при первом входе)
        if (typeof updateCurrentAudioWave === 'function') {
            updateCurrentAudioWave();
        }

        // Устанавливаем регион в зависимости от режима
        const mode = checked ? checked.value : 'full';
        if (mode === 'full') {
            if (typeof setRegionToFullShared === 'function') setRegionToFullShared();
        } else if (mode === 'sentence') {
            if (typeof setRegionToSelectedSentence === 'function') setRegionToSelectedSentence();
        }
        
        // Скрываем колонку чекбоксов на вкладке "Настройка аудио"
        toggleCheckboxColumn(false);
        
    } else if (tabName === 'create-audio') {
        // На вкладке "Создание аудио" показываем оригинал + перевод + специальные колонки
        // Не используем toggleColumnGroup, так как он скрывает перевод
        // Вручную показываем нужные колонки
        const table = document.getElementById('sentences-table');
        if (table) {
            table.classList.remove('state-original-translation', 'state-original-editing');
            // Показываем оригинал
            const originalHeaders = document.querySelectorAll('th.panel-original');
            const originalCells = document.querySelectorAll('td.panel-original');
            originalHeaders.forEach(th => th.style.display = 'table-cell');
            originalCells.forEach(td => td.style.display = 'table-cell');
            
            // Показываем перевод (текст)
            const translationTextHeaders = document.querySelectorAll('th.col-translation');
            const translationTextCells = document.querySelectorAll('td.col-translation');
            translationTextHeaders.forEach(th => th.style.display = 'table-cell');
            translationTextCells.forEach(td => td.style.display = 'table-cell');
        }
        
        // Показываем колонку чекбоксов
        toggleCheckboxColumn(true);
        // Показываем колонки аудио для вкладки "Создание аудио"
        toggleCreateAudioColumns(true);
    } else {
        // Общие данные и Диалог — показываем оригинал + перевод
        toggleColumnGroup('translation');
        // Скрываем колонку чекбоксов
        toggleCheckboxColumn(false);
        // Скрываем колонки для вкладки "Создание аудио"
        toggleCreateAudioColumns(false);
    }

    // Показываем колонку спикера во всех вкладках, если это диалог
    const showSpeaker = (currentDictation.is_dialog || false);
    const speakerHeader = document.querySelector('th.col-speaker');
    if (speakerHeader) {
        speakerHeader.style.display = showSpeaker ? 'table-cell' : 'none';
    }
    const speakerCells = document.querySelectorAll('td.col-speaker');
    speakerCells.forEach(td => { td.style.display = showSpeaker ? 'table-cell' : 'none'; });

    updateExplanationColumnVisibility();
}

/**
 * Переключить видимость колонки с чекбоксами
 */
function toggleCheckboxColumn(show) {
    const header = document.querySelector('th.col-checkbox-create-audio');
    const cells = document.querySelectorAll('td.col-checkbox-create-audio');
    
    if (header) {
        header.style.display = show ? 'table-cell' : 'none';
    }
    
    cells.forEach(cell => {
        cell.style.display = show ? 'table-cell' : 'none';
        
        // При показе колонки обновляем иконку чекбокса на основе данных
        if (show) {
            const btn = cell.querySelector('.checkbox-btn');
            if (btn) {
                const key = btn.dataset.key;
                if (key) {
                    const sentence = workingData.original.sentences.find(s => s.key === key);
                    if (sentence) {
                        const isChecked = sentence.checked === true;
                        const icon = btn.querySelector('.checkbox-icon');
                        if (icon) {
                            icon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
                        }
                    }
                }
            }
        }
    });
    
    // Перерисовываем иконки Lucide для чекбоксов
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Переключить видимость колонок для вкладки "Создание аудио"
 */
function toggleCreateAudioColumns(show) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    const setDisplay = (el, value) => {
        if (value === null) {
            el.style.display = '';
        } else {
            el.style.display = value;
        }
    };

    // Находим все заголовки и ячейки с классом panel-create-audio
    const headers = table.querySelectorAll('th.panel-create-audio');
    const cells = table.querySelectorAll('td.panel-create-audio');

    headers.forEach(th => {
        if (show) {
            setDisplay(th, 'table-cell');
        } else {
            setDisplay(th, null);
        }
    });

    cells.forEach(td => {
        if (show) {
            setDisplay(td, 'table-cell');
        } else {
            setDisplay(td, null);
        }
    });

    // Управляем колонками перевода (текст)
    const translationHeaders = table.querySelectorAll('th.panel-translation');
    const translationCells = table.querySelectorAll('td.panel-translation');

    translationHeaders.forEach(th => {
        const isCreateAudioColumn = th.classList.contains('panel-create-audio') || th.classList.contains('col-translation');
        if (show && isCreateAudioColumn) {
            setDisplay(th, 'table-cell');
        } else if (!show) {
            setDisplay(th, null);
        }
    });

    translationCells.forEach(td => {
        const isCreateAudioColumn = td.classList.contains('panel-create-audio') || td.classList.contains('col-translation');
        if (show && isCreateAudioColumn) {
            setDisplay(td, 'table-cell');
        } else if (!show) {
            setDisplay(td, null);
        }
    });

    // Прячем прочие колонки редактирования, если они не относятся к "Создание аудио"
    const editingColumns = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');
    editingColumns.forEach(col => {
        if (show) {
            if (!col.classList.contains('panel-create-audio')) {
                col.dataset.prevDisplay = col.style.display || '';
                setDisplay(col, 'none');
            } else {
                setDisplay(col, 'table-cell');
            }
        } else {
            if (col.classList.contains('panel-create-audio')) {
                setDisplay(col, null);
            } else if ('prevDisplay' in col.dataset) {
                setDisplay(col, col.dataset.prevDisplay || null);
                delete col.dataset.prevDisplay;
            } else {
                setDisplay(col, null);
            }
        }
    });
}

/**
 * Настройка обработчиков для таблицы спикеров во вкладке
 */
function setupTabSpeakersHandlers() {
    const tabAddSpeakerBtn = document.getElementById('tabAddSpeakerBtn');
    const tabSpeakersTableContent = document.getElementById('tabSpeakersTableContent');

    if (tabAddSpeakerBtn && tabSpeakersTableContent) {
        tabAddSpeakerBtn.addEventListener('click', () => {
            addSpeakerToTabTable();
            syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
        });

        // Обработчики для кнопок удаления спикеров
        tabSpeakersTableContent.addEventListener('click', (e) => {
            if (e.target.closest('.remove-speaker')) {
                const btn = e.target.closest('.remove-speaker');
                removeSpeakerFromTabTable(btn);
                syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
            }
        });

        // Обработчики для изменения имен спикеров
        tabSpeakersTableContent.addEventListener('input', (e) => {
            if (e.target.classList.contains('speaker-name')) {
                syncSpeakersFromTab();
                refreshAllSpeakerSelectOptions();
            }
        });
    }
}

/**
 * Добавить спикера в таблицу во вкладке
 */
function addSpeakerToTabTable() {
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (!tbody) return;

    const speakerCount = tbody.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${speakerCount}:</td>
        <td><input type="text" class="speaker-name" value="Спикер ${speakerCount}" placeholder="Имя спикера"></td>
        <td>
            <button type="button" class="remove-speaker" title="Удалить спикера">
                <i data-lucide="trash-2"></i>
            </button>
        </td>
    `;
    tbody.appendChild(row);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Удалить спикера из таблицы во вкладке
 */
function removeSpeakerFromTabTable(button) {
    const row = button.closest('tr');
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    
    if (row && tbody && tbody.children.length > 1) {
        row.remove();
        // Перенумеровываем спикеров
        Array.from(tbody.children).forEach((tr, index) => {
            tr.querySelector('td:first-child').textContent = `${index + 1}:`;
        });
    }
}

/**
 * Обновить путь к диктанту во вкладке (путь в дереве категорий)
 */
function updateDictationPathDisplay() {
    const pathText = document.getElementById('dictationPathText');
    if (!pathText) return;

    // Показываем путь в дереве категорий
    const path = currentDictation.category_path || 'Не выбран';
    pathText.textContent = path;
}

/**
 * Синхронизировать данные спикеров из вкладки в currentDictation
 */
function syncSpeakersFromTab() {
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (!tbody) return;

    const speakers = {};
    tbody.querySelectorAll('tr').forEach((row, index) => {
        const speakerNameInput = row.querySelector('.speaker-name');
        if (speakerNameInput && speakerNameInput.value.trim()) {
            speakers[String(index + 1)] = speakerNameInput.value.trim();
        }
    });

    currentDictation.speakers = speakers;
    return speakers;
}

/**
 * Обновить вкладку диалога данными из currentDictation
 */
function updateDialogTab() {
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    const tabSpeakersTable = document.getElementById('tabSpeakersTable');
    const tabSpeakersTableContent = document.getElementById('tabSpeakersTableContent');

    if (!tabIsDialogCheckbox) return;

    // Устанавливаем чекбокс
    tabIsDialogCheckbox.checked = currentDictation.is_dialog || false;

    // Обновляем иконку чекбокса
    const checkboxIcon = document.querySelector('#tabDialogCheckboxLabel .checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', tabIsDialogCheckbox.checked ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Показываем/скрываем таблицу спикеров
    if (tabSpeakersTable) {
        tabSpeakersTable.style.display = tabIsDialogCheckbox.checked ? 'block' : 'none';
    }

    // Заполняем таблицу спикеров
    if (tabSpeakersTableContent && currentDictation.speakers) {
        const tbody = tabSpeakersTableContent.querySelector('tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const speakerEntries = Object.entries(currentDictation.speakers);

            // Больше НЕ добавляем дефолтные имена «Спикер 1/2» — пользователь сам вводит имена спикеров
            speakerEntries.forEach(([id, name]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${id}:</td>
                    <td><input type="text" class="speaker-name" value="${name}" placeholder="Имя спикера"></td>
                    <td>
                        <button type="button" class="remove-speaker" title="Удалить спикера">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }
}
// ============================================================================
// ФУНКЦИИ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ВИДИМОСТИ КОЛОНОК
// ============================================================================

/**
 * Настройка обработчиков для переключения видимости колонок
 */
function setupColumnToggleHandlers() {
    // Кнопка и колонка переключения удалены — переключение делаем через вкладки
}

/**
 * Переключить состояние редактора между original-translation и original-editing
 * @param {string} group - 'original' или 'translation'
 */
function toggleColumnGroup(group) {
    const table = document.getElementById('sentences-table');
    if (!table) {
        console.warn('❌ Таблица sentences-table не найдена');
        return;
    }
    // Удаляем все классы состояний
    table.classList.remove('state-original-translation', 'state-original-editing');

    if (group === 'original') {
        // Переключаем в состояние original-editing (оригинал + правая панель редактирования аудио)
        table.classList.add('state-original-editing');
        // Обновляем иконку кнопки
        // updateToggleButtonIcon('open_left_panel_original', 'original');

        // Устанавливаем режим "отображать весь файл" при первом открытии
        const fullRadio = document.querySelector('input[name="audioMode"][value="full"]');
        if (fullRadio && !fullRadio.checked) {
            fullRadio.checked = true;
            // Инициируем обработчик изменения режима
            handleAudioModeChange({ target: fullRadio });
        }
    } else if (group === 'translation') {
        // Переключаем в состояние original-translation (оригинал + перевод)
        table.classList.add('state-original-translation');
        // Обновляем иконку кнопки
        // updateToggleButtonIcon('open_left_panel_original', 'translation');
    }

}

/**
 * Обновить иконку кнопки переключения на основе текущего состояния таблицы
 * @param {string} buttonId - ID кнопки
 * @param {string} state - текущее состояние ('original' или 'translation')
 */
function updateToggleButtonIcon(buttonId, state) {
    const button = document.getElementById(buttonId);

    if (button) {
        if (state === 'original') {
            // В состоянии original-editing показываем иконку "закрыть панель"
            button.innerHTML = `<i data-lucide="panel-left-close"></i>`;
        } else if (state === 'translation') {
            // В состоянии original-translation показываем иконку "открыть панель"
            button.innerHTML = `<i data-lucide="panel-left-open"></i>`;
        }

        // Перерисовываем иконку Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            console.warn('⚠️ Lucide не найден');
        }
    } else {
        console.error('❌ Кнопка не найдена:', buttonId);
    }
}

// ============================================================================
// ОБРАБОТЧИКИ БОКОВОЙ ПАНЕЛИ НАСТРОЕК АУДИО
// ============================================================================

/**
 * Настройка обработчиков для боковой панели настроек аудио
 */
function setupAudioSettingsModalHandlers() {
    // Обработчики радио кнопок для режима аудио
    const radioButtons = document.querySelectorAll('input[name="audioMode"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', handleAudioModeChange);
    });

    // Инициализация обработчика выбора файлов
    setupFileInputHandler();

    // Инициализация кнопки выбора файла
    initSelectFileBtn();

    // Инициализация обработчиков полей под волной
    setupWaveformFieldsHandlers();

    const audioPlayBtn = document.getElementById('audioPlayBtn');
    if (audioPlayBtn) {
        audioPlayBtn.addEventListener('click', handleAudioPlayback);
    }

    const audioStartBtn = document.getElementById('audioStartBtn');
    if (audioStartBtn) {
        audioStartBtn.addEventListener('click', handleAudioStart);
    }
    const audioEndBtn = document.getElementById('audioEndBtn');
    if (audioEndBtn) {
        audioEndBtn.addEventListener('click', handleAudioEnd);
    }

    // Кнопка с ножницами
    const scissorsBtn = document.getElementById('scissorsBtn');
    if (scissorsBtn) {
        scissorsBtn.addEventListener('click', () => {
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            console.log('🔧 Кнопка ножниц нажата в режиме:', currentMode);

            switch (currentMode) {
                case 'full':
                    // Режим "Отображать весь файл" - обычная функция разрезания
                    handleScissorsFullMode();
                    break;
                case 'sentence':
                    // Режим "Текущее предложение" - кнопка должна быть скрыта
                    break;
                case 'mic':
                    handleScissorsFullMode();
                    break;
                case 'auto':
                    break;
            }
        });
    }

    // Кнопка "Разрезать аудио на 1000 кусков"
    // const audioTableActionBtn = document.getElementById('audioTableActionBtn');
    if (audioTableActionBtn) {
        audioTableActionBtn.addEventListener('click', () => {
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';
            switch (currentMode) {
                case 'full':
                    // Режим "Отображать весь файл" - обычная функция разрезания
                    splitAudioIntoSentences();
                    break;
                case 'sentence':
                    // Режим "Текущее предложение" - кнопка должна быть скрыта
                    break;
                case 'mic':
                    handleMicRecordMode();
                    break;
                case 'auto':
                    break;
            }
        });
    }
}

/**
 * Настройка обработчиков для кнопок управления таблицей
 */
function setupTableControlsHandlers() {
    // Кнопка предыдущей строки
    const prevRowBtn = document.getElementById('prevRowBtn');
    if (prevRowBtn) {
        prevRowBtn.addEventListener('click', () => {
            navigateToPreviousRow();
        });
    }

    // Кнопка следующей строки
    const nextRowBtn = document.getElementById('nextRowBtn');
    if (nextRowBtn) {
        nextRowBtn.addEventListener('click', () => {
            navigateToNextRow();
        });
    }

    // Кнопка добавления строки
    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            showAddRowDialog();
        });
    }

    // Кнопка удаления строки
    const deleteRowBtn = document.getElementById('deleteRowBtn');
    if (deleteRowBtn) {
        deleteRowBtn.addEventListener('click', () => {
            showDeleteRowDialog();
        });
    }

    const rowNumberSpan = document.getElementById('currentRowNumber');
    if (rowNumberSpan) {
        rowNumberSpan.contentEditable = true;
        rowNumberSpan.setAttribute('inputmode', 'numeric');
        rowNumberSpan.setAttribute('title', 'Введите номер строки и нажмите Enter');
        rowNumberSpan.setAttribute('aria-label', 'Номер текущей строки');

        const applyRowNumberInput = () => {
            const rows = Array.from(document.querySelectorAll('#sentences-table tbody tr'));
            if (!rows.length) {
                rowNumberSpan.textContent = '1';
                return;
            }

            const rawValue = rowNumberSpan.textContent.replace(/[^\d]/g, '');
            let targetNumber = parseInt(rawValue, 10);

            if (isNaN(targetNumber)) {
                updateCurrentRowNumber();
                return;
            }

            if (targetNumber < 1) targetNumber = 1;
            if (targetNumber > rows.length) targetNumber = rows.length;

            const targetRow = rows[targetNumber - 1];
            if (targetRow) {
                selectSentenceRow(targetRow);
            } else {
                updateCurrentRowNumber();
            }
        };

        rowNumberSpan.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                rowNumberSpan.blur();
                return;
            }

            const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
            if (!/^\d$/.test(event.key) && !allowedKeys.includes(event.key)) {
                event.preventDefault();
            }
        });

        rowNumberSpan.addEventListener('blur', applyRowNumberInput);
    }

    // Инициализация номера текущей строки
    updateCurrentRowNumber();
}

/**
 * Навигация к предыдущей строке
 */
function navigateToPreviousRow() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const prevRow = currentRow.previousElementSibling;
    if (prevRow) {
        selectSentenceRow(prevRow);
        console.log('⬅️ Переход к предыдущей строке');
    } else {
        console.log('⬅️ Это первая строка');
    }
}

/**
 * Навигация к следующей строке
 */
function navigateToNextRow() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const nextRow = currentRow.nextElementSibling;
    if (nextRow) {
        selectSentenceRow(nextRow);
        console.log('➡️ Переход к следующей строке');
    } else {
        console.log('➡️ Это последняя строка');
    }
}

/**
 * Обновление номера текущей строки в лейбле
 */
function updateCurrentRowNumber() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    const rowNumberSpan = document.getElementById('currentRowNumber');

    if (currentRow && rowNumberSpan) {
        const rowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
        rowNumberSpan.textContent = rowNumber;
    }
}

/**
 * Показать модальное окно добавления строки
 */
function showAddRowDialog() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для добавления новой строки');
        return;
    }

    const currentRowNumber = currentRow.querySelector('.col-number')?.textContent || '1';

    // Обновляем номера в модальном окне
    document.getElementById('addRowCurrentNumber').textContent = currentRowNumber;
    document.getElementById('addRowAboveNumber').textContent = currentRowNumber;
    document.getElementById('addRowBelowNumber').textContent = currentRowNumber;

    // Сохраняем ссылку на текущую строку для использования в модальном окне
    window.currentRowForAdd = currentRow;

    // Показываем модальное окно
    document.getElementById('addRowModal').style.display = 'flex';
}

/**
 * Закрыть модальное окно добавления строки
 */
function closeAddRowModal() {
    document.getElementById('addRowModal').style.display = 'none';
    window.currentRowForAdd = null;
}

/**
 * Подтвердить добавление строки
 */
function confirmAddRow(position) {
    if (window.currentRowForAdd) {
        addNewRow(window.currentRowForAdd, position);
        closeAddRowModal();
    } else {
        console.error('❌ window.currentRowForAdd не установлена!');
        alert('Ошибка: не выбрана строка для добавления');
    }
}

/**
 * Показать модальное окно удаления строки
 */
function showDeleteRowDialog() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для удаления');
        return;
    }

    const currentRowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
    const currentKey = currentRow.dataset.key;

    // Обновляем данные в модальном окне
    document.getElementById('deleteRowNumber').textContent = currentRowNumber;
    document.getElementById('deleteRowKey').textContent = currentKey;

    // Сохраняем ссылку на текущую строку для использования в модальном окне
    window.currentRowForDelete = currentRow;

    // Показываем модальное окно
    document.getElementById('deleteRowModal').style.display = 'flex';
}

/**
 * Закрыть модальное окно удаления строки
 */
function closeDeleteRowModal() {
    document.getElementById('deleteRowModal').style.display = 'none';
    window.currentRowForDelete = null;
}

/**
 * Подтвердить удаление строки
 */
function confirmDeleteRow() {
    if (window.currentRowForDelete) {
        deleteRow(window.currentRowForDelete);
        closeDeleteRowModal();
    }
}

/**
 * Добавить новую строку
 */
function addNewRow(referenceRow, position) {
    console.log('➕ Добавление новой строки:', position);

    // Генерируем новый ключ с префиксом 't_'
    const newKey = generateNewTableKey();

    // Сначала создаем данные в workingData
    let originalSentence = null;
    let translationSentence = null;

    if (workingData && workingData.original) {
        originalSentence = {
            key: newKey,
            speaker: '1',
            text: '',
            audio: '',
            audio_avto: '',
            audio_user: '',
            audio_mic: '',
            start: 0,
            end: 0,
            chain: false,
            checked: false
        };
        workingData.original.sentences.push(originalSentence);
    }

    if (workingData && workingData.translation) {
        translationSentence = {
            key: newKey,
            text: '',
            audio: '',
            audio_avto: '',
            audio_user: '',
            audio_mic: '',
            start: 0,
            end: 0,
            chain: false
        };
        workingData.translation.sentences.push(translationSentence);
    }

    // Теперь создаем DOM-элемент с данными
    const newRow = createTableRow(newKey, originalSentence, translationSentence);

    // Вставляем в нужное место
    const tbody = document.querySelector('#sentences-table tbody');
    if (tbody) {
        if (position === 'above') {
            tbody.insertBefore(newRow, referenceRow);
        } else {
            tbody.insertBefore(newRow, referenceRow.nextSibling);
        }

        // Обновляем нумерацию строк
        updateTableRowNumbers();

        // Пересоздаем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Выделяем новую строку
    selectSentenceRow(newRow);
}

/**
 * Удалить строку
 */
function deleteRow(rowToDelete) {
    console.log('🗑️ Удаление строки:', rowToDelete.dataset.key);

    // Удаляем строку из DOM
    rowToDelete.remove();

    // Обновляем нумерацию
    updateTableRowNumbers();

    // Выделяем следующую строку или предыдущую
    const nextRow = rowToDelete.nextElementSibling;
    const prevRow = rowToDelete.previousElementSibling;

    if (nextRow) {
        selectSentenceRow(nextRow);
    } else if (prevRow) {
        selectSentenceRow(prevRow);
    }
}

/**
 * Генерировать новый ключ для табличной строки
 */
function generateNewTableKey() {
    // Находим максимальный номер среди табличных ключей
    const tableRows = document.querySelectorAll('#sentences-table tbody tr[data-key^="t_"]');
    let maxNumber = 0;

    tableRows.forEach(row => {
        const key = row.dataset.key;
        const match = key.match(/^t_(\d+)$/);
        if (match) {
            const number = parseInt(match[1]);
            if (number > maxNumber) {
                maxNumber = number;
            }
        }
    });

    return `t_${String(maxNumber + 1).padStart(3, '0')}`;
}

/**
 * Обновить нумерацию строк в таблице
 */
function updateTableRowNumbers() {
    const rows = document.querySelectorAll('#sentences-table tbody tr');
    rows.forEach((row, index) => {
        const numberCell = row.querySelector('.col-number');
        if (numberCell) {
            numberCell.textContent = String(index + 1).padStart(2, '0');
        }
    });

    // Обновляем номер текущей строки
    updateCurrentRowNumber();
}

/**
 * Управление видимостью и функциональностью кнопок ножниц в зависимости от режима аудио
 */
// удалить ножницы иконка не перерисовывается только управляем видимостью
function initSelectFileBtn() {

    // Кнопка выбора файла
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', (event) => {
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            handleSelectFile(currentMode);
        });
    } else {
        console.error('❌ Кнопка selectFileBtn НЕ НАЙДЕНА!');
    }

}

/**
 * Управление видимостью волны в режиме микрофона
 */
function updateWaveformVisibilityForMicMode() {
    const waveformContainer = document.getElementById('audioWaveform');
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');

    if (!waveformContainer || !currentRow) return;

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (sentence && sentence.audio_mic) {
        // Есть записанное аудио - загружаем и показываем волну
        // Сначала пробуем загрузить из постоянной папки dictations
        let audioPath = `/static/data/dictations/${currentDictation.id}/${currentDictation.language_original}/${sentence.audio_mic}`;

        // Загружаем аудио в волну
        loadAudioIntoWaveform(audioPath).then(() => {
            if (window.waveformCanvas) {
                window.waveformCanvas.show();
            }
        }).catch(error => {
            console.warn('⚠️ Файл не найден в dictations, пробуем temp:', error);
            // Если не найден в dictations, пробуем temp
            audioPath = `${getAudioPath(currentDictation.language_original)}/${sentence.audio_mic}`;
            return loadAudioIntoWaveform(audioPath);
        }).then(() => {
            if (window.waveformCanvas) {
                window.waveformCanvas.show();
            }
        }).catch(error => {
            console.error('❌ Ошибка загрузки аудио в волну:', error);
            if (window.waveformCanvas) {
                window.waveformCanvas.hide();
            }
        });
    } else {
        // Нет записанного аудио - скрываем волну
        if (window.waveformCanvas) {
            window.waveformCanvas.hide();
        }
    }
}

/**
 * Обновить информацию о текущем аудио для режима микрофона
 */
function updateCurrentAudioInfoForMicMode() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) return;

    // Обновляем информацию о текущем аудио
    const currentAudioInfoElement = document.getElementById('currentAudioInfo');
    if (currentAudioInfoElement) {
        if (sentence.audio_mic) {
            currentAudioInfoElement.textContent = `Аудио для волны: ${sentence.audio_mic}`;
        } else {
            currentAudioInfoElement.textContent = 'Аудио для волны: не выбрано';
        }
    }

    // Обновляем отображение волны для режима микрофона
    updateWaveformVisibilityForMicMode();
}

/**
 * Обновить состояние кнопки микрофона в таблице
 */
function updateMicButtonState(sentenceKey) {
    // Находим строку таблицы по ключу
    const row = document.querySelector(`tr[data-key="${sentenceKey}"]`);
    if (!row) {
        console.error('❌ Строка таблицы не найдена для ключа:', sentenceKey);
        return;
    }

    // Находим ячейку с кнопкой микрофона
    const micCell = row.querySelector('td[data-col_id="col-or-mic-play"]');
    if (!micCell) {
        console.error('❌ Ячейка микрофона не найдена для строки:', sentenceKey);
        return;
    }

    // Находим кнопку в ячейке
    const micButton = micCell.querySelector('.audio-btn');
    if (!micButton) {
        console.error('❌ Кнопка микрофона не найдена в ячейке:', sentenceKey);
        return;
    }

    // Обновляем состояние кнопки на 'ready' (показываем треугольник)
    setButtonState(micButton, 'ready');
}

/**
 * Загрузить аудио в волну
 */
async function loadAudioIntoWaveform(audioPath) {
    if (!window.waveformCanvas) {
        throw new Error('WaveformCanvas не инициализирован');
    }

    try {
        // Добавляем cache-busting, чтобы перерисовывать даже при том же имени файла
        const cacheBusted = `${audioPath}${audioPath.includes('?') ? '&' : '?'}ts=${Date.now()}`;
        await window.waveformCanvas.loadAudio(cacheBusted);

        // Устанавливаем регион на всю длительность
        const duration = window.waveformCanvas.getDuration();
        window.waveformCanvas.setRegion(0, duration);

    } catch (error) {
        console.error('❌ Ошибка загрузки аудио в волну:', error);
        throw error;
    }
}

/**
 * Управление видимостью элементов интерфейса в режиме микрофона
 */
function updateInterfaceForMicMode() {
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    // Показываем информацию о текущем предложении
    updateCurrentSentenceInfoForMicMode();

    // Управляем видимостью волны
    updateWaveformVisibilityForMicMode();
}

/**
 * Обновление информации о текущем предложении в режиме микрофона
 */
function updateCurrentSentenceInfoForMicMode() {
    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) return;

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) return;

    // Показываем информацию о текущем предложении
    const sentenceInfoElement = document.getElementById('currentSentenceInfo');
    if (sentenceInfoElement) {
        sentenceInfoElement.textContent = sentence.text || '';
        sentenceInfoElement.style.display = 'block';
    }
}

/**
 * Обработчик кнопки ножниц в режиме "Отображать весь файл"
 */
function handleScissorsFullMode() {
    console.log('✂️ Режим "Отображать весь файл" - функция разрезания аудио');

    const start = parseFloat(startInput.value) || 0;
    const end = parseFloat(endInput.value) || 0;

    if (start >= end) {
        alert('Время начала должно быть меньше времени окончания');
        return;
    }

    console.log('✂️✂️✂️✂️✂️ 1 ✂️ currentAudioFile:', currentAudioFileName);
    // Получаем текущий аудиофайл из режима "отображать весь файл"
    //const currentAudioFile = getCurrentAudioFileForScissors();
    if (!currentAudioFileName) {
        alert('Не выбран аудиофайл для обрезки');
        return;
    }

    // Вызываем функцию обрезки аудио
    trimAudioFile(currentAudioFileName, start, end);
}

/**
 * Обработчик кнопки ножниц в режиме "Микрофон"
 */
function handleScissorsMicMode() {
    console.log('✂️ Режим "Микрофон" - обрезание записанного аудио');

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для обрезания аудио');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    const currentAudioFile = sentence?.audio_mic;
    if (!currentAudioFile) {
        alert('Не выбран аудиофайл для обрезки');
        return;
    }


    // Вызываем функцию обрезки аудио
    trimAudioFile(currentAudioFile, start, end);

}

/**
 * Запись с микрофона для текущего предложения
 */
function handleMicRecordMode() {

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для записи');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) {
        alert('Предложение не найдено');
        return;
    }

    // Открываем модальное окно записи
    openMicRecordModal(sentence);
}

// Глобальные переменные для записи
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let currentRecordingSentence = null;

/**
 * Получить поддерживаемый mimeType для записи (копия с script_dictation.js)
 */
function getSupportedMimeType() {
    const types = [
        'audio/mp4; codecs="mp4a.40.2"', // AAC (лучший для Safari)
        'audio/webm; codecs=opus',        // Opus (для Chrome/Firefox)
        'audio/webm'                      // Fallback
    ];

    for (const type of types) {
        const supported = MediaRecorder.isTypeSupported(type);
    }

    const result = types.find(type => MediaRecorder.isTypeSupported(type)) || '';
    return result;
}

/**
 * Открыть модальное окно записи с микрофона
 */
function openMicRecordModal(sentence) {
    currentRecordingSentence = sentence;

    // Заполняем текст предложения
    const sentenceTextElement = document.getElementById('micRecordSentenceText');
    if (sentenceTextElement) {
        sentenceTextElement.textContent = sentence.text || 'Текст не найден';
    }

    // Сбрасываем состояние
    resetRecordingState();

    // Показываем модальное окно
    const modal = document.getElementById('micRecordModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.error('❌ Модальное окно micRecordModal не найдено!');
    }

    // Инициализируем обработчики событий
    setupMicRecordEventHandlers();
}

/**
 * Закрыть модальное окно записи с микрофона
 */
function closeMicRecordModal() {
    // Останавливаем запись если она идет
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }

    // Очищаем таймер
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }

    // Скрываем модальное окно
    const modal = document.getElementById('micRecordModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Сбрасываем состояние
    resetRecordingState();
    currentRecordingSentence = null;
}
/**
 * Сбросить состояние записи
 */
function resetRecordingState() {
    // Сбрасываем элементы интерфейса
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const playbackSection = document.getElementById('playbackSection');
    const saveBtn = document.getElementById('saveRecordBtn');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const recordingStatusText = document.getElementById('recordingStatusText');
    const recordingTimer = document.getElementById('recordingTimer');

    console.log('🔄 Сбрасываем состояние записи');

    if (startBtn) {
        startBtn.style.display = 'block';
    }
    if (stopBtn) {
        stopBtn.style.display = 'none';
        console.log('❌ Кнопка "Остановить" скрыта');
    }
    if (playbackSection) {
        playbackSection.style.display = 'none';
        console.log('❌ Секция воспроизведения скрыта');
    }
    if (saveBtn) {
        saveBtn.style.display = 'none';
        console.log('❌ Кнопка "Сохранить" скрыта');
    }
    if (recordingIndicator) recordingIndicator.classList.remove('recording');
    if (recordingStatusText) recordingStatusText.textContent = 'Готов к записи';
    if (recordingTimer) recordingTimer.textContent = '00:00';

    // Очищаем данные записи
    recordedChunks = [];
    recordingStartTime = null;
}

/**
 * Настроить обработчики событий для модального окна записи
 */
function setupMicRecordEventHandlers() {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const playBtn = document.getElementById('playRecordBtn');
    const rerecordBtn = document.getElementById('rerecordBtn');
    const saveBtn = document.getElementById('saveRecordBtn');

    if (startBtn) {
        startBtn.onclick = startRecording;
    }

    if (stopBtn) {
        stopBtn.onclick = stopRecording;
    }

    if (playBtn) {
        playBtn.onclick = playRecording;
    }

    if (rerecordBtn) {
        rerecordBtn.onclick = () => {
            resetRecordingState();
            startRecording();
        };
    }

    if (saveBtn) {
        saveBtn.onclick = saveRecording;
    }
}

/**
 * Начать запись с микрофона
 */
async function startRecording() {
    try {
        // Запрашиваем доступ к микрофону с настройками для качественной записи
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,    // Убираем эхо
                noiseSuppression: true,    // Подавляем шум
                autoGainControl: true,     // Автоматическая регулировка громкости
                sampleRate: 44100,        // Высокое качество записи
                channelCount: 1,           // Моно для экономии места
                latency: 0.01              // Минимальная задержка
            }
        });

        // Определяем поддерживаемый mimeType с отладкой
        const mimeType = getSupportedMimeType();

        // Создаем MediaRecorder точно как на рабочей странице диктанта
        const options = {
            mimeType: mimeType
        };

        mediaRecorder = new MediaRecorder(stream, options);

        recordedChunks = [];

        // Обработчик данных записи
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        // Обработчик завершения записи
        mediaRecorder.onstop = () => {
            // Останавливаем все треки потока
            stream.getTracks().forEach(track => track.stop());
            showPlaybackSection();
        };

        // Начинаем запись (без параметров для стабильности)
        mediaRecorder.start();
        recordingStartTime = Date.now();

        // Обновляем интерфейс
        updateRecordingUI(true);

        // Запускаем таймер
        startRecordingTimer();

    } catch (error) {
        console.error('❌ Ошибка при начале записи:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
}

/**
 * Остановить запись
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        updateRecordingUI(false);
        stopRecordingTimer();
    }
}

/**
 * Обновить интерфейс записи
 */
function updateRecordingUI(isRecording) {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const recordingStatusText = document.getElementById('recordingStatusText');

    if (isRecording) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (recordingIndicator) recordingIndicator.classList.add('recording');
        if (recordingStatusText) recordingStatusText.textContent = 'Запись...';
    } else {
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (recordingIndicator) recordingIndicator.classList.remove('recording');
        if (recordingStatusText) recordingStatusText.textContent = 'Запись завершена';
    }
}

/**
 * Запустить таймер записи
 */
function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        if (recordingStartTime) {
            const elapsed = Date.now() - recordingStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timerElement = document.getElementById('recordingTimer');
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }, 1000);
}

/**
 * Остановить таймер записи
 */
function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

/**
 * Показать секцию воспроизведения
 */
function showPlaybackSection() {
    const playbackSection = document.getElementById('playbackSection');
    const saveBtn = document.getElementById('saveRecordBtn');

    if (playbackSection) playbackSection.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'block';

    // Обновляем информацию о длительности
    updatePlaybackDuration();
}

/**
 * Обновить информацию о длительности записи
 */
function updatePlaybackDuration() {
    const durationElement = document.getElementById('playbackDuration');
    if (durationElement && recordingStartTime) {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        durationElement.textContent = `Длительность: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

/**
 * Воспроизвести записанное аудио
 */
function playRecording() {
    if (recordedChunks.length === 0) {
        alert('Нет записанного аудио для воспроизведения');
        return;
    }

    // Определяем тип файла на основе используемого mimeType (упрощенная логика как на странице диктанта)
    const blobType = mediaRecorder.mimeType?.includes('mp4')
        ? 'audio/mp4'
        : 'audio/webm';

    // Создаем blob из записанных данных
    const blob = new Blob(recordedChunks, { type: blobType });
    const audioUrl = URL.createObjectURL(blob);

    // Создаем и воспроизводим аудио элемент
    const audio = new Audio(audioUrl);
    audio.play();

    // Очищаем URL после воспроизведения
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
    };
}

/**
 * Сохранить запись
 */
async function saveRecording() {
    if (recordedChunks.length === 0) {
        alert('Нет записанного аудио для сохранения');
        return;
    }

    if (!currentRecordingSentence) {
        alert('Ошибка: не найдено предложение для сохранения');
        return;
    }

    try {
        // Определяем тип файла и расширение (используем оригинальный формат браузера)
        const blobType = mediaRecorder.mimeType?.includes('mp4')
            ? 'audio/mp4'
            : 'audio/webm';

        const fileExtension = mediaRecorder.mimeType?.includes('mp4') ? 'mp4' : 'webm';

        // Создаем blob из записанных данных
        const blob = new Blob(recordedChunks, { type: blobType });

        // Создаем FormData для отправки на сервер
        const formData = new FormData();
        formData.append('audio', blob, `${currentRecordingSentence.key}_en_mic.${fileExtension}`);
        formData.append('dictation_id', currentDictation.id);
        formData.append('language', currentDictation.language_original);

        // Показываем индикатор загрузки
        showLoadingIndicator();

        // Отправляем на сервер
        const response = await fetch('/upload_mic_audio', {
            method: 'POST',
            body: formData
        });

        console.log('📤 Ответ сервера:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        hideLoadingIndicator();

        if (data.success) {
            // Обновляем данные предложения
            currentRecordingSentence.audio_mic = data.filename;

            // Обновляем состояние кнопки микрофона в таблице
            updateMicButtonState(currentRecordingSentence.key);

            // Обновляем отображение
            updateCurrentAudioInfoForMicMode();

            // Отмечаем что диктант изменен
            currentDictation.isSaved = false;

            // Закрываем модальное окно
            closeMicRecordModal();

            alert('Запись успешно сохранена!');

        } else {
            console.error('❌ Ошибка при сохранении записи:', data.error);
            alert('Ошибка при сохранении записи: ' + data.error);
        }

    } catch (error) {
        hideLoadingIndicator();
        console.error('❌ Ошибка при сохранении записи:', error);
        alert('Ошибка при сохранении записи: ' + error.message);
    }
}

/**
 * Выбор файла для текущего предложения (режим микрофона)
 */
function handleSelectFileForSentence() {
    console.log('📁 Выбор файла для текущего предложения');

    const currentRow = document.querySelector('#sentences-table tbody tr.selected');
    if (!currentRow) {
        alert('Выберите строку для загрузки файла');
        return;
    }

    const key = currentRow.dataset.key;
    const sentence = workingData.original.sentences.find(s => s.key === key);

    if (!sentence) {
        alert('Предложение не найдено');
        return;
    }

    // Создаем input для выбора файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Загружаем файл для текущего предложения
            await uploadFileForSentence(file, sentence, key);
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            alert('Ошибка загрузки файла');
        }

        // Удаляем input после использования
        document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

/**
 * Выбор общего файла (другие режимы)
 */
function handleSelectFile(currentMode) {
    console.log('📁 handleSelectFile вызвана, режим:', currentMode);

    // Создаем input для выбора файла
    console.log('📁 Создаем input элемент...');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';
    console.log('📁 Input элемент создан:', fileInput);

    fileInput.addEventListener('change', (event) => {
        console.log('📁 Событие change сработало!');
        console.log('📁 Файл выбран:', event.target.files[0]?.name);
        const file = event.target.files[0];
        if (!file) {
            console.log('❌ Файл не выбран');
            return;
        }

        console.log('📁 Начинаем загрузку файла:', file.name);
        // Используем существующую функцию загрузки
        uploadAudioFile(file, currentMode);

        // Удаляем input после использования
        console.log('📁 Удаляем input элемент');
        document.body.removeChild(fileInput);
    });

    console.log('📁 Добавляем input в DOM...');
    document.body.appendChild(fileInput);
    console.log('📁 Input добавлен в DOM, запускаем click()...');

    try {
        fileInput.click();
    } catch (error) {
        console.error('❌ Ошибка при fileInput.click():', error);
    }
}


/**
 * Обработчик изменения режима аудио (радио кнопки)
 *  'block'- нав всю ширину
 * 'none'- скрыть
 * 'inline'- в строку
 * 'flex'- в строку
 * 'grid'- в сетку
 * 'table'- в таблицу
 * 'list'- в список
 * 'inline-block'- в строку
 * 'inline-flex'- в строку
 * 'inline-grid'- в сетку
 * 'inline-table'- в таблицу
 * 'inline-list'- в список
 * 'inline-block-flex'- в строку
 * 'inline-block-grid'- в сетку
 * 'inline-block-table'- в таблицу
 * 'inline-block-list'- в список
 * 'inline-block-inline-flex'- в строку
 * 'inline-block-inline-grid'- в сетку
 * 'inline-block-inline-table'- в таблицу
 */
function handleAudioModeChange(event) {
    const selectedMode = event.target.value;
    // Меняем режим во время проигрывания: останавливаем текущее аудио и сбрасываем кнопку
     if (typeof audioManager !== 'undefined' && audioManager) {
        audioManager.stop();
    }
    const audioTableActionBtn = document.getElementById('audioTableActionBtn');

    let modeConfig = {};
    switch (selectedMode) {
        case 'full':
            // Режим "Отображать весь файл"
            console.log('Режим "Отображать весь файл":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'visible',
                currentSentenceInfo: 'hidden',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'visible', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };

            // Обновляем кнопку "1000 кусков"
            audioTableActionBtn.innerHTML = '<i data-lucide="scissors"></i><span>на 1000 кусков</span>';
            audioTableActionBtn.title = 'Разрезать на 1000 частей';

            break;
        case 'sentence':
            // Режим "Текущее предложение" - скрыта
            console.log('Режим "Текущее предложение":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'hidden',
                currentSentenceInfo: 'visible',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'hidden', // кнопка ножниц
                audioTableActionBtn: 'hidden' // дополнительные процедуры над аудио
            };

            break;
        case 'mic':
            // Режим "Микрофон"
            console.log('Режим "Микрофон":');
            modeConfig = {
                fileSelectionPanel: 'visible',
                currentAudioInfo: 'visible',
                selectFileBtn: 'visible',
                currentSentenceInfo: 'visible',

                // waveformContainer: 'visible', // волна
                // waveformAndControls: 'block',

                audioPlayBtn: 'visible', // кнопка воспроизведения
                audioStartTime: 'visible', // время начала
                audioEndTime: 'visible', // время окончания
                scissorsBtn: 'visible', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };

            // Обновляем кнопку "микрофон"
            audioTableActionBtn.innerHTML = '<i data-lucide="mic"></i>';
            audioTableActionBtn.title = 'Записать с микрофона';

            break;
        case 'auto':
            // Режим "Автозаполнение" - иконка молоточка
            console.log('Режим "Автозаполнение":');
            modeConfig = {
                fileSelectionPanel: 'hidden',
                currentAudioInfo: 'hidden',
                selectFileBtn: 'hidden',
                currentSentenceInfo: 'hidden',

                // waveformContainer: 'hidden', // волна
                // waveformAndControls: 'none',

                audioPlayBtn: 'hidden', // кнопка воспроизведения
                audioStartTime: 'hidden', // время начала
                audioEndTime: 'hidden', // время окончания
                scissorsBtn: 'hidden', // кнопка ножниц
                audioTableActionBtn: 'visible' // дополнительные процедуры над аудио
            };
            audioTableActionBtn.innerHTML = '<i data-lucide="hammer"></i>';
            audioTableActionBtn.title = 'Пересоздать все откорректированные аудио';

            break;

    }

    // Применяем конфигурацию
    // Простой цикл по всем элементам
    for (const [elementId, visible] of Object.entries(modeConfig)) {
        const element = document.getElementById(elementId);
        if (!element) continue;
        element.style.visibility = visible;
    }

    // Дополнительно управляем элементами без ID
    // 1) Контейнер волны скрываем в режиме автозаполнения
    const waveContainer = document.getElementById('waveformContainer');
    if (waveContainer) {
        waveContainer.style.display = (selectedMode === 'auto') ? 'none' : '';
    }
    // 2) Блок Start/End скрываем в режиме автозаполнения
    const timeControls = document.getElementById('timeControls');
    if (timeControls) {
        timeControls.style.display = (selectedMode === 'auto') ? 'none' : '';
    }

    // Обновляем файл для волны и волну если есть аудио (и другие условия)
    updateCurrentAudioWave();

    // Обновляем видимость колонок в таблице
    updateTableColumnsVisibility(selectedMode);

    // Обновляем само радио
    updateRadioButtonIcons(selectedMode);

    // Обновляем информационные блоки и регион в зависимости от режима
    if (selectedMode === 'sentence') {
        updateCurrentSentenceInfoForMicMode();
        setRegionToSelectedSentence();
    } else if (selectedMode === 'mic') {
        updateCurrentAudioInfoForMicMode();
        updateCurrentSentenceInfoForMicMode();
    } else if (selectedMode === 'full') {
        setRegionToFullShared();
    }

    // Обновляем иконку Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Установить регион и поля start/end по текущей выбранной строке
 */
function setRegionToSelectedSentence() {
    try {
        const selectedRow = document.querySelector('#sentences-table tbody tr.selected');
        if (!selectedRow) return;
        const key = selectedRow.dataset.key;
        const sentence = workingData?.original?.sentences?.find(s => s.key === key);
        if (!sentence) return;

        const start = Number(sentence.start) || 0;
        const end = Number(sentence.end) || 0;

        if (startInput && endInput) {
            startInput.value = start.toFixed(2);
            endInput.value = end.toFixed(2);
        }

        if (window.waveformCanvas && end > 0) {
            if (typeof setupWaveformRegionCallback === 'function') {
                setupWaveformRegionCallback();
            }
            // Устанавливаем флаг для программного обновления
            isProgrammaticRegionUpdate = true;
            window.waveformCanvas.setRegion(start, end);
            window.waveformCanvas.setCurrentTime(start);
            // Сбрасываем флаг после небольшой задержки
            setTimeout(() => {
                isProgrammaticRegionUpdate = false;
            }, 100);
        }
    } catch (e) {
        console.warn('setRegionToSelectedSentence error', e);
    }
}

/**
 * Установить регион на общий файл по сохраненным границам audio_user_shared_start/end
 */
function setRegionToFullShared() {
    try {
        const start = Number(workingData?.original?.audio_user_shared_start) || 0;
        const end = Number(workingData?.original?.audio_user_shared_end) || 0;

        if (startInput && endInput) {
            startInput.value = start.toFixed(2);
            endInput.value = end.toFixed(2);
        }

        if (window.waveformCanvas) {
            if (end > 0) {
                if (typeof setupWaveformRegionCallback === 'function') {
                    setupWaveformRegionCallback();
                }
                // Устанавливаем флаг для программного обновления
                isProgrammaticRegionUpdate = true;
                window.waveformCanvas.setRegion(start, end);
                window.waveformCanvas.setCurrentTime(start);
                // Сбрасываем флаг после небольшой задержки
                setTimeout(() => {
                    isProgrammaticRegionUpdate = false;
                }, 100);
            } else if (typeof window.waveformCanvas.getDuration === 'function') {
                const duration = window.waveformCanvas.getDuration();
                if (duration > 0) {
                    // Устанавливаем флаг для программного обновления
                    isProgrammaticRegionUpdate = true;
                    window.waveformCanvas.setRegion(0, duration);
                    window.waveformCanvas.setCurrentTime(0);
                    // Сбрасываем флаг после небольшой задержки
                    setTimeout(() => {
                        isProgrammaticRegionUpdate = false;
                    }, 100);
                }
            }
        }
    } catch (e) {
        console.warn('setRegionToFullShared error', e);
    }
}


/**
 * Обновление иконок радио-кнопок в зависимости от выбранного режима
 */
function updateRadioButtonIcons(selectedMode) {
    const radioButtons = document.querySelectorAll('input[name="audioMode"]');

    radioButtons.forEach(radio => {
        const label = radio.closest('.radio-label');
        if (!label) return;

        const selectedIcon = label.querySelector('.radio-icon-selected');
        const unselectedIcon = label.querySelector('.radio-icon-unselected');

        if (selectedIcon && unselectedIcon) {
            if (radio.checked) {
                // Показываем aperture иконку для выбранного
                selectedIcon.style.display = 'inline';
                unselectedIcon.style.display = 'none';
            } else {
                // Показываем circle иконку для невыбранного
                selectedIcon.style.display = 'none';
                unselectedIcon.style.display = 'inline';
            }
        }
    });
}




/**
 * Обновление видимости колонок в таблице в зависимости от режима аудио
 */
function updateTableColumnsVisibility(audioMode) {
    const table = document.getElementById('sentences-table');
    if (!table) return;

    // Определяем, открыта ли боковая панель редактирования
    const isEditingPanelOpen = table.classList.contains('state-original-editing');

    if (!isEditingPanelOpen) {
        return;
    }

    // Скрываем все колонки редактирования по умолчанию
    const allEditingColumns = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');
    allEditingColumns.forEach(col => {
        col.style.display = 'none';
    });

    // Показываем колонки в зависимости от режима
    switch (audioMode) {
        case 'auto':
            // Показываем только колонки автозаполнения
            const avtoColumns = table.querySelectorAll('.panel-editing-avto');
            avtoColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;

        case 'full':
        case 'sentence':
            // Показываем колонки пользовательского редактирования
            const userColumns = table.querySelectorAll('.panel-editing-user');
            userColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;

        case 'mic':
            // Показываем колонки микрофона
            const micColumns = table.querySelectorAll('.panel-editing-mic');
            micColumns.forEach(col => {
                col.style.display = 'table-cell';
            });
            break;
    }
    
    // Обновляем видимость кнопки редактирования всех
    updateEditAllCreatingButtonVisibility();
}


/**
 * Обработчик перезаписи с микрофона
 */
function handleReRecord() {
    // TODO: Реализовать запись с микрофона
    alert('Функция записи с микрофона будет реализована позже');
}


/**
 * Инициализация обработчика выбора файла
 */
function setupFileInputHandler() {
    const fileInput = document.getElementById('audioFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            // Получаем текущий режим аудио
            const audioMode = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioMode ? audioMode.value : 'full';

            // Используем общую функцию загрузки
            uploadAudioFile(file, currentMode);
        });
    }
}
/**
 * Инициализация обработчиков полей под волной
 */
function setupWaveformFieldsHandlers() {
    if (startInput) {
        startInput.addEventListener('input', () => {
            handleFieldChange('waveform', 'start', startInput.value);
        });
    }

    if (endInput) {
        endInput.addEventListener('input', () => {
            handleFieldChange('waveform', 'end', endInput.value);
        });
    }
}

/**
 * Загрузить аудиофайл
 */
function uploadAudioFile(file, audioMode) {

    // Показываем индикатор загрузки
    showLoadingIndicator('Загрузка аудиофайла...');

    // Получаем длительность аудио файла
    const audio = new Audio();
    const audioUrl = URL.createObjectURL(file);

    audio.addEventListener('loadedmetadata', () => {
        // Получаем длительность в секундах
        const durationSeconds = audio.duration;

        // Округляем до сотых, отбрасывая тысячные
        const durationFormatted = Math.floor(durationSeconds * 100) / 100;

        // Освобождаем память
        URL.revokeObjectURL(audioUrl);

        // Продолжаем загрузку файла
        continueUpload(file, audioMode, durationFormatted, durationSeconds);
    });

    audio.addEventListener('error', () => {
        console.error('❌ Ошибка загрузки метаданных аудио');
        URL.revokeObjectURL(audioUrl);
        // Продолжаем без длительности
        continueUpload(file, audioMode, null, null);
    });

    audio.src = audioUrl;
}

function continueUpload(file, audioMode, durationFormatted, duration) {
    // Проверяем JWT токен
    // Используем jwt_token (как в user_manager.js) или токен из UserManager
    let token = null;
    if (window.UM && window.UM.token) {
        token = window.UM.token;
    } else {
        token = localStorage.getItem('jwt_token');
    }
    // console.log('🔑 JWT токен:', token ? 'есть' : 'отсутствует');
    if (token) {
        // Проверяем структуру JWT токена (должен содержать 3 части, разделенные точками)
        const parts = token.split('.');
        // console.log('🔑 JWT токен части:', parts.length, 'частей');
        if (parts.length !== 3) {
            console.error('❌ JWT токен неправильной структуры! Ожидается 3 части, получено:', parts.length);
        } else {
        }
    } else {
        console.warn('⚠️ JWT токен отсутствует в localStorage! Продолжаем без авторизации...');
    }

    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('audioFile', file);
    formData.append('language', currentDictation.language_original);
    formData.append('dictation_id', currentDictation.id);

    for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value);
    }

    // Отправляем файл на сервер
    fetch('/upload-audio', {
        method: 'POST',
        // Временно убираем JWT токен для тестирования
        // headers: {
        //     'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        // },
        body: formData
    })
        .then(response => {

            // Получаем текст ответа независимо от статуса
            return response.text().then(text => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}\nОтвет: ${text}`);
                }
                return text;
            });
        })
        .then(text => {
            try {
                return JSON.parse(text); // Пытаемся распарсить как JSON
            } catch (e) {
                console.error('❌ Ошибка парсинга JSON:', e);
                console.error('❌ Текст ответа:', text);
                throw new Error('Сервер вернул не JSON ответ');
            }
        })
        .then(data => {
            hideLoadingIndicator();
            if (data.success) {
                // Файл уже отображается в панели выбора
                // Обновляем workingData.original
                switch (audioMode) {
                    case 'full':
                        workingData.original.audio_user_shared = data.filename;
                        workingData.original.audio_user_shared_start = 0;
                        workingData.original.audio_user_shared_end = duration;

                        // Обновляем отображение с длительностью
                        const currentAudioInfo = document.getElementById('currentAudioInfo');
                        if (currentAudioInfo) {
                            const durationText = durationFormatted ? ` (${durationFormatted}с)` : '';
                            currentAudioInfo.textContent = `Аудио для волны: ${data.filename}(${durationText}с)`;
                        }

                        // Обновляем текущее аудио

                        updateCurrentAudioWave();
                        break;
                    case 'mic':
                        const currentRow = document.querySelector('#sentences-table tbody tr.selected');
                        if (currentRow) {
                            const key = currentRow.dataset.key;
                            const sentence = workingData.original.sentences.find(s => s.key === key);
                            sentence.audio_mic = data.filename;

                            // Обновляем отображение с длительностью
                            const currentAudioInfo = document.getElementById('currentAudioInfo');
                            if (currentAudioInfo) {
                                const durationText = durationFormatted ? ` (${durationFormatted}с)` : '';
                                currentAudioInfo.textContent = `Аудио для волны: ${data.filename}${durationText}с)`;
                            }
                        }
                        break;
                }

                // Отмечаем что диктант изменен
                currentDictation.isSaved = false;

                // Автосохранение JSON удалено - данные только в workingData


                // Инициализируем волну с загруженным файлом
                if (data.filepath) {
                    // Используем правильный путь из ответа сервера
                    const audioUrl = data.filepath;
                    initWaveform(audioUrl);
                }
            } else {
                console.error('❌ Ошибка загрузки файла:', data.error);
                alert('Ошибка загрузки файла: ' + data.error);
            }
        })
        .catch(error => {
            hideLoadingIndicator();
            console.error('❌ Ошибка загрузки файла:', error);
            alert('Ошибка загрузки файла');
        });
}




/**
 * Настройка обработчиков для полей ввода в строке
 */
function setupInputHandlers(row) {
    // Поле Start
    const startInput = row.querySelector('.start-input');
    if (startInput) {
        startInput.addEventListener('change', () => {
            onStartTimeChanged(row);
        });

        startInput.addEventListener('input', () => {
            onStartTimeInput(row);
            // Обновляем цепочку
            const key = row.dataset.key;
            if (key) {
                updateChain(key, 'start', startInput.value);
            }
            // Синхронизируем с полями под волной, если это текущая строка
            handleFieldChange('table', 'start', startInput.value, row);
        });

        startInput.addEventListener('blur', () => {
            onStartTimeBlur(row);
        });
    }

    // Поле End
    const endInput = row.querySelector('.end-input');
    if (endInput) {
        endInput.addEventListener('change', () => {
            onEndTimeChanged(row);
        });

        endInput.addEventListener('input', () => {
            onEndTimeInput(row);
            // Обновляем цепочку
            const key = row.dataset.key;
            if (key) {
                updateChain(key, 'end', endInput.value);
            }
            // Синхронизируем с полями под волной, если это текущая строка
            handleFieldChange('table', 'end', endInput.value, row);
        });

        endInput.addEventListener('blur', () => {
            onEndTimeBlur(row);
        });
    }

    // Обработчик для кнопки цепочки
    const chainCell = row.querySelector('.col-chain');
    if (chainCell) {
        chainCell.addEventListener('click', () => {
            toggleChain(row);
        });
        chainCell.style.cursor = 'pointer';
    }
}

/**
 * Универсальная обработка изменения полей start/end
 */
function handleFieldChange(source, field, value, row = null) {
    // Проверяем, находимся ли мы в режиме "sentence"
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    if (currentMode !== 'sentence') {
        console.log('❌ Синхронизация только в режиме "sentence"');
        return;
    }

    let targetRow = row;
    let key = null;

    // Определяем целевую строку в зависимости от источника
    if (source === 'table' && row) {
        // Изменение в таблице - используем переданную строку
        targetRow = row;
        key = row.dataset.key;
    } else if (source === 'waveform') {
        // Изменение под волной - находим текущую выбранную строку
        targetRow = document.querySelector('#sentences-table tbody tr.selected');
        if (targetRow) {
            key = targetRow.dataset.key;
        }
    }

    if (!targetRow || !key) {
        console.log('❌ Нет целевой строки для синхронизации');
        return;
    }

    // Обновляем поле в таблице (если источник - волна)
    if (source === 'waveform') {
        if (field === 'start') {
            const startInput = targetRow.querySelector('.start-input');
            if (startInput) {
                startInput.value = value;
            }
        } else if (field === 'end') {
            const endInput = targetRow.querySelector('.end-input');
            if (endInput) {
                endInput.value = value;
            }
        }
    }

    // Обновляем поле под волной (если источник - таблица)
    if (source === 'table') {
        if (field === 'start' && startInput) {
            startInput.value = value;
        } else if (field === 'end' && endInput) {
            endInput.value = value;
        }
    }

    // Обновляем данные в workingData
    const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
    if (sentenceIndex !== -1) {
        workingData.original.sentences[sentenceIndex][field] = parseFloat(value) || 0;
    }

    // Запускаем логику цепочки (chain) для обновления соседних строк
    updateChain(key, field, value);

    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в целевой строке
    if (targetRow) {
        const audioBtnOriginalUser = targetRow.querySelector('button[data-field-name="audio_user"]');
        if (audioBtnOriginalUser) {
            audioBtnOriginalUser.dataset.state = 'creating';
            setButtonState(audioBtnOriginalUser);
            updateEditAllCreatingButtonVisibility();
        }
    }

    // Обновляем регион в волне
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        if (startInput && endInput) {
            const start = parseFloat(startInput.value) || 0;
            const end = parseFloat(endInput.value) || 0;
            setupWaveformRegionCallback();
            waveformCanvas.setRegion(start, end);
        }
    }
}

/**
 * Синхронизация полей под волной с полями в таблице (обратная синхронизация)
 * @deprecated Используйте handleFieldChange('waveform', field, value)
 */
function syncWaveformFieldsToTable(field, value) {
    handleFieldChange('waveform', field, value);
}

/**
 * Синхронизировать поля в таблице с полями под волной
 * @deprecated Используйте handleFieldChange('table', field, value, row)
 */
function syncWithWaveformFields(row, field, value) {
    // Проверяем, является ли эта строка текущей выбранной
    if (!row.classList.contains('selected')) {
        return;
    }

    handleFieldChange('table', field, value, row);
}

/**
 * Переключить состояние цепочки для строки
 */
function toggleChain(row) {
    const key = row.dataset.key;
    if (!key) return;

    // Находим предложение в workingData
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) return;

    // Переключаем состояние цепочки
    sentence.chain = !sentence.chain;

    // Обновляем иконку в ячейке
    const chainCell = row.querySelector('.col-chain');
    if (chainCell) {
        const icon = sentence.chain ? 'link' : 'unlink';
        chainCell.innerHTML = `<i data-lucide="${icon}"></i>`;

        // Обновляем иконки Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    console.log(`🔗 Цепочка для ${key}: ${sentence.chain ? 'включена' : 'выключена'}`);
}

/**
 * Настройка обработчиков для самой строки
 */
function setupRowHandlers(row) {
    // Клик по строке для выбора
    row.addEventListener('click', (e) => {
        // Пропускаем клики по чекбоксам и их элементам
        if (e.target.closest('.col-checkbox-create-audio') || e.target.closest('.checkbox-btn')) {
            return;
        }
        selectSentenceRow(row);
    });

    // Двойной клик для дополнительных действий
    row.addEventListener('dblclick', () => {
        onRowDoubleClick(row);
    });
}

/**
 * Обработчик изменения времени начала
 */
function onStartTimeChanged(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // Валидация: start не должен быть больше end
    if (startTime >= endTime && endTime > 0) {
        row.querySelector('.end-input').value = (startTime + 1).toFixed(2);
        // console.log('⚠️ Автоматически скорректировано время окончания');
    }

    updateAudioFileTimes(row);
    validateTimeInputs(row);
}

/**
 * Обработчик изменения времени окончания
 */
function onEndTimeChanged(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    console.log('⏰ Изменено время окончания:', endTime);

    // Валидация: end не должен быть меньше start
    if (endTime <= startTime) {
        row.querySelector('.end-input').value = (startTime + 1).toFixed(2);
        // console.log('⚠️ Автоматически скорректировано время окончания');
    }

    updateAudioFileTimes(row);
    validateTimeInputs(row);
}

/**
 * Обработчик ввода времени начала (в реальном времени)
 */
function onStartTimeInput(row) {
    // Здесь можно добавить валидацию в реальном времени
    // Например, подсветка невалидных значений
}

/**
 * Обработчик ввода времени окончания (в реальном времени)
 */
function onEndTimeInput(row) {
    // Здесь можно добавить валидацию в реальном времени
}

/**
 * Обработчик потери фокуса времени начала
 */
function onStartTimeBlur(row) {
    const input = row.querySelector('.start-input');
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2); // Форматируем до 2 знаков
}

/**
 * Обработчик потери фокуса времени окончания
 */
function onEndTimeBlur(row) {
    const input = row.querySelector('.end-input');
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2); // Форматируем до 2 знаков
}


/**
 * Обработчик двойного клика по строке
 */
function onRowDoubleClick(row) {
    // console.log('🖱️ Двойной клик по строке:', row.dataset.filename);

    // Можно добавить дополнительные действия, например:
    // - Открыть диалог редактирования
    // - Воспроизвести аудио
    // - Показать детали файла
}

/**
 * Валидация полей времени
 */
function validateTimeInputs(row) {
    const startInput = row.querySelector('.start-input');
    const endInput = row.querySelector('.end-input');
    const startTime = parseFloat(startInput.value) || 0;
    const endTime = parseFloat(endInput.value) || 0;

    // Сбрасываем предыдущие стили валидации
    startInput.classList.remove('invalid');
    endInput.classList.remove('invalid');

    // Проверяем валидность
    if (startTime < 0) {
        startInput.classList.add('invalid');
    }

    if (endTime <= startTime) {
        endInput.classList.add('invalid');
    }
}

/**
 * Выбрать аудиофайл для работы
 */
function selectAudioFile(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;

    // Выделяем строку
    document.querySelectorAll('#audioFilesTable tbody tr').forEach(r => {
        r.classList.remove('selected');
    });
    row.classList.add('selected');

    // Загружаем волну для этого файла
    loadWaveformForFile(filepath);
}

/**
 * Разрезать аудио на предложения
 */
function splitAudioIntoSeentences(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('✂️ Разрезаем аудио на предложения:', filename, startTime, '-', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Разрезание аудио на предложения...');

    // Отправляем запрос на сервер
    fetch('/split-audio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
            // ,
            // 'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
            filename: filename,
            filepath: filepath,
            startTime: startTime,
            endTime: endTime,
            language: currentDictation.language_original
        })
    })
        .then(response => response.json())
        .then(data => {
            hideLoadingIndicator();
            if (data.success) {
            } else {
                console.error('❌ Ошибка разрезания аудио:', data.error);
                alert('Ошибка разрезания аудио: ' + data.error);
            }
        })
        .catch(error => {
            hideLoadingIndicator();
            console.error('❌ Ошибка разрезания аудио:', error);
            alert('Ошибка разрезания аудио');
        });
}

/**
 * Обрезать аудиофайл
 */
function cutAudioFile(row) {
    const filename = row.dataset.filename;
    const filepath = row.dataset.filepath;
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('✂️ Обрезаем аудиофайл:', filename, startTime, '-', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Обрезание аудиофайла...');

    // Отправляем запрос на сервер
    fetch('/cut-audio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
            filename: filename,
            filepath: filepath,
            startTime: startTime,
            endTime: endTime,
            language: currentDictation.language_original
        })
    })
        .then(response => response.json())
        .then(data => {
            hideLoadingIndicator();
            if (data.success) {
                // Обновляем имя файла в таблице
                row.querySelector('.filename-text').textContent = data.newFilename;
                row.dataset.filename = data.newFilename;
                row.dataset.filepath = data.newFilepath;
            } else {
                console.error('❌ Ошибка обрезания аудио:', data.error);
                alert('Ошибка обрезания аудио: ' + data.error);
            }
        })
        .catch(error => {
            hideLoadingIndicator();
            console.error('❌ Ошибка обрезания аудио:', error);
            alert('Ошибка обрезания аудио');
        });
}

/**
 * Обновить цепочку при изменении start/end
 */
function updateChain(rowKey, field, value) {
    const row = document.querySelector(`tr[data-key="${rowKey}"]`);
    if (!row) return;

    // Проверяем состояние цепочки через workingData
    const sentence = workingData.original.sentences.find(s => s.key === rowKey);
    if (!sentence || !sentence.chain) return;

    // Найти соседние строки с включенными цепочками
    const allRows = Array.from(document.querySelectorAll('#sentences-table tbody tr'));
    const currentIndex = allRows.indexOf(row);

    if (field === 'end' && currentIndex < allRows.length - 1) {
        // Изменяем end текущей строки, обновляем start следующей
        const nextRow = allRows[currentIndex + 1];
        const nextRowKey = nextRow.dataset.key;
        const nextSentence = workingData.original.sentences.find(s => s.key === nextRowKey);

        if (nextSentence && nextSentence.chain) {
            const nextStartInput = nextRow.querySelector('.start-input');
            if (nextStartInput) {
                const oldValue = parseFloat(nextStartInput.value) || 0;
                const newValue = parseFloat(value) || 0;
                
                // Обновляем только если значение действительно изменилось
                if (Math.abs(oldValue - newValue) > 0.01) { // небольшой порог для сравнения float
                    nextStartInput.value = value;

                    // Обновить данные в workingData
                    const nextRowKey = nextRow.dataset.key;
                    updateSentenceData(nextRowKey, 'original', 'start', newValue);
                    
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в следующей строке
                    const nextAudioBtnOriginalUser = nextRow.querySelector('button[data-field-name="audio_user"]');
                    if (nextAudioBtnOriginalUser) {
                        nextAudioBtnOriginalUser.dataset.state = 'creating';
                        setButtonState(nextAudioBtnOriginalUser);
                        updateEditAllCreatingButtonVisibility();
                    }
                }
            }
        }
    } else if (field === 'start' && currentIndex > 0) {
        // Изменяем start текущей строки, обновляем end предыдущей
        const prevRow = allRows[currentIndex - 1];
        const prevRowKey = prevRow.dataset.key;
        const prevSentence = workingData.original.sentences.find(s => s.key === prevRowKey);

        if (prevSentence && prevSentence.chain) {
            const prevEndInput = prevRow.querySelector('.end-input');
            if (prevEndInput) {
                const oldValue = parseFloat(prevEndInput.value) || 0;
                const newValue = parseFloat(value) || 0;
                
                // Обновляем только если значение действительно изменилось
                if (Math.abs(oldValue - newValue) > 0.01) { // небольшой порог для сравнения float
                    prevEndInput.value = value;

                    // Обновить данные в workingData
                    const prevRowKey = prevRow.dataset.key;
                    updateSentenceData(prevRowKey, 'original', 'end', newValue);
                    
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser в предыдущей строке
                    const prevAudioBtnOriginalUser = prevRow.querySelector('button[data-field-name="audio_user"]');
                    if (prevAudioBtnOriginalUser) {
                        prevAudioBtnOriginalUser.dataset.state = 'creating';
                        setButtonState(prevAudioBtnOriginalUser);
                        updateEditAllCreatingButtonVisibility();
                    }
                }
            }
        }
    }
}

/**
 * Обновить данные предложения в workingData
 */
function updateSentenceData(rowKey, language, field, value) {
    if (language === 'original') {
        const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === rowKey);
        if (sentenceIndex !== -1) {
            workingData.original.sentences[sentenceIndex][field] = value;
        }
    } else if (language === 'translation') {
        const sentenceIndex = workingData.translation.sentences.findIndex(s => s.key === rowKey);
        if (sentenceIndex !== -1) {
            workingData.translation.sentences[sentenceIndex][field] = value;
        }
    }
}

/**
 * Обновить времена аудиофайла
 */
function updateAudioFileTimes(row) {
    const startTime = parseFloat(row.querySelector('.start-input').value) || 0;
    const endTime = parseFloat(row.querySelector('.end-input').value) || 0;

    // console.log('⏰ Обновлены времена файла:', startTime, '-', endTime);

    // Здесь можно добавить логику для обновления волны или других элементов
}

/**
 * Загрузить волну для файла
 */
async function loadWaveformForFile(filepath) {

    try {

        // Получаем существующий WaveformCanvas или создаем новый
        let waveformCanvas = window.waveformCanvas;
        if (!waveformCanvas) {
            waveformCanvas = new WaveformCanvas(waveformContainer);
            window.waveformCanvas = waveformCanvas;
        }

        // Загружаем аудио с cache-busting, чтобы видеть новое содержимое при том же имени
        const url = `${filepath}${filepath.includes('?') ? '&' : '?'}ts=${Date.now()}`;
        await waveformCanvas.loadAudio(url);

        // Настраиваем callback для обновления региона
        setupWaveformRegionCallback();
        
        // Устанавливаем callback для окончания воспроизведения (когда волна останавливает воспроизведение при достижении конца региона)
        waveformCanvas.onPlaybackEnd(() => {
            const audioPlayBtn = document.getElementById('audioPlayBtn');
            if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
                const originalState = audioPlayBtn.dataset.originalState || 'ready-shared';
                audioPlayBtn.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(audioPlayBtn, originalState);
                }
                console.log('✅ Состояние кнопки под волной обновлено в:', originalState);
            }
        });

        // Восстанавливаем регион в зависимости от текущего режима
        // Устанавливаем флаг, чтобы не устанавливать 'creating' при программном обновлении
        isProgrammaticRegionUpdate = true;
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        const duration = waveformCanvas.getDuration();
        
        if (currentMode === 'sentence') {
            // В режиме "sentence" устанавливаем регион по текущей выбранной строке
            setRegionToSelectedSentence();
        } else if (currentMode === 'full') {
            // В режиме "full" устанавливаем регион по сохраненным границам
            setRegionToFullShared();
        } else {
            // Для других режимов устанавливаем регион на всю длительность
            waveformCanvas.setRegion(0, duration);
            
            // Обновляем поля ввода
            if (startInput) startInput.value = '0.00';
            if (endInput) endInput.value = duration.toFixed(2);
        }
        // Сбрасываем флаг после небольшой задержки, чтобы callback успел сработать
        setTimeout(() => {
            isProgrammaticRegionUpdate = false;
        }, 100);

    } catch (error) {
        console.error('❌ Ошибка загрузки волны:', error);
    }
}



/**
 * Получить текущий аудиофайл для обрезки ножницами
 */
function getCurrentAudioFileForScissors() {
    // Проверяем режим "отображать весь файл"
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    console.log('✂️✂️✂️✂️✂️4✂️ Режим "отображать весь файл":', audioMode, audioMode.value);
    if (!audioMode || audioMode.value !== 'full') {
        console.log('❌ Режим "отображать весь файл" не активен');
        return null;
    }

    // Получаем имя файла из currentAudioFileName (уже содержит только имя файла)
    const filename = currentAudioFileName;
    console.log('✂️✂️✂️✂️✂️ 1 ✂️ Имя файла:', filename);

    if (!filename) {
        console.error('❌ Имя файла не найдено');
        return null;
    }


    // Создаем правильный путь к файлу на сервере
    const serverFilePath = `${getAudioPath(currentDictation.language_original)}/${filename}`;
    console.log('✂️✂️✂️✂️✂️ 2 ✂️ Путь к файлу на сервере:', serverFilePath);

    // Проверяем, есть ли файл в input элементе (для новых загрузок)
    const fileInput = document.getElementById('audioFileInput');
    let file = null;

    if (fileInput && fileInput.files && fileInput.files[0]) {
        file = fileInput.files[0];
    } else {
        // Файл не в input, но он может быть на сервере (для существующих диктантов)
    }
    console.log('✂️✂️✂️✂️✂️ 2 ✂️ return:', {
        filename: filename,
        filepath: serverFilePath,
        file: file // может быть null для существующих файлов
    });

    return {
        filename: filename,
        filepath: serverFilePath,
        file: file // может быть null для существующих файлов
    };
}
/**
 * Разрезать аудио на предложения
 */
async function splitAudioIntoSentences() {
    // Получаем текущий аудиофайл
    //const currentAudioFile = getCurrentAudioFileForScissors();
    const filePath = `${getAudioPath(currentDictation.language_original)}/${currentAudioFileName}`;
    console.log('✂️✂️✂️✂️✂️3✂️ Текущий аудиофайл:', currentAudioFileName);

    // Получаем все предложения
    if (!workingData || !workingData.original || !workingData.original.sentences) {
        alert('Нет предложений для разрезания');
        return;
    }

    const sentences = workingData.original.sentences.filter(s => s.key !== 'metadata');
    if (sentences.length === 0) {
        alert('Нет предложений для разрезания');
        return;
    }

    // Получаем длительность аудио
    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        alert('Волна не загружена');
        return;
    }

    const totalDuration = waveformCanvas.getDuration();
    const segmentDuration = totalDuration / sentences.length;

    console.log(`📊 Разрезаем ${totalDuration.toFixed(2)}с на ${sentences.length} частей по ${segmentDuration.toFixed(2)}с`);

    // Показываем индикатор загрузки
    showLoadingIndicator('Разрезание аудио на предложения...');

    try {
        // Сначала рассчитываем все концы интервалов
        const endTimes = [];
        let currentEndTime = 0;

        for (let i = 0; i < sentences.length; i++) {
            // Конец интервала = предыдущий конец + длительность сегмента, округленная по старому правилу
            const rawEndTime = currentEndTime + segmentDuration;
            const endTime = Math.floor(rawEndTime * 100) / 100; // Отбрасываем тысячные
            endTimes.push(endTime);
            currentEndTime = endTime;
        }

        console.log(`📊 Рассчитанные концы интервалов:`, endTimes.map(t => t.toFixed(2)).join(', '));

        // Теперь обновляем данные предложений
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];

            // Начало интервала = конец предыдущего (или 0 для первого)
            const startTime = i === 0 ? 0 : endTimes[i - 1];

            // Конец интервала = уже рассчитанный
            const endTime = endTimes[i];

            console.log(`📊 Предложение ${i + 1}: ${startTime.toFixed(2)}с - ${endTime.toFixed(2)}с`);

            // Обновляем данные в workingData
            const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === sentence.key);
            if (sentenceIndex !== -1) {
                workingData.original.sentences[sentenceIndex].start = startTime;
                workingData.original.sentences[sentenceIndex].end = endTime;
                workingData.original.sentences[sentenceIndex].chain = true; // Включаем цепочку по умолчанию
                workingData.original.sentences[sentenceIndex].audio_user = `${sentence.key}_${currentDictation.language_original}_user.mp3`;
            }

            // Обновляем данные в translation, если есть
            if (workingData.translation && workingData.translation.sentences) {
                const translationIndex = workingData.translation.sentences.findIndex(s => s.key === sentence.key);
                if (translationIndex !== -1) {
                    workingData.translation.sentences[translationIndex].start = startTime;
                    workingData.translation.sentences[translationIndex].end = endTime;
                    workingData.translation.sentences[translationIndex].chain = true;
                    workingData.translation.sentences[translationIndex].audio_user = `${sentence.key}_${currentDictation.language_translation}_user.mp3`;
                }
            }
        }

        // Отправляем запрос на сервер для разрезания аудио
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: currentAudioFileName,
                filepath: filePath,
                sentences: sentences.map(s => ({
                    key: s.key,
                    start_time: workingData.original.sentences.find(ws => ws.key === s.key)?.start || 0,
                    end_time: workingData.original.sentences.find(ws => ws.key === s.key)?.end || 0,
                    language: currentDictation.language_original
                })),
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            // Обновляем таблицу
            updateTableWithNewAudio();

            // Переключаем режим на "Текущее предложение"
            switchToSentenceMode();

        } else {
            console.error('❌ Ошибка разрезания аудио:', data.error);
            alert('Ошибка разрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка разрезания аудио:', error);
        alert('Ошибка разрезания аудио: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Переключить режим на "Текущее предложение" и обновить правую панель
 */
function switchToSentenceMode() {

    // Переключаем радио кнопку
    const sentenceRadio = document.querySelector('input[name="audioMode"][value="sentence"]');
    if (sentenceRadio) {
        sentenceRadio.checked = true;
        sentenceRadio.dispatchEvent(new Event('change'));
    }

    updateCurrentAudioWave();
}

/**
 * Загрузить аудио для текущего предложения
 */
function loadAudioForCurrentSentence() {
    // Находим первую строку таблицы
    const firstRow = document.querySelector('#sentences-table tbody tr');
    if (!firstRow) {
        console.log('❌ Нет строк в таблице');
        return;
    }

    const key = firstRow.dataset.key;
    if (!key) {
        console.log('❌ Нет ключа в строке');
        return;
    }

    // Получаем данные предложения
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) {
        console.log('❌ Предложение не найдено:', key);
        return;
    }

    // В режиме "Текущее предложение" файл уже загружен в волну
    // нужно только установить регион для текущего предложения

    // Устанавливаем регион для текущего предложения
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        waveformCanvas.setRegion(sentence.start, sentence.end);
    } else {
        console.log('❌ Волна не загружена');
    }

    // Обновляем поля start/end из данных предложения
    if (startInput && endInput) {
        startInput.value = sentence.start.toFixed(2);
        endInput.value = sentence.end.toFixed(2);
    }

    // Выбираем первую строку как текущую
    selectSentenceRow(firstRow);
}

/**
 * Обновить таблицу с новыми аудиофайлами
 */
function updateTableWithNewAudio() {
    // console.log('🔄 updateTableWithNewAudio вызвана');
    // console.log('📊 workingData.original.sentences:', workingData.original.sentences);

    // Находим все строки таблицы
    const rows = document.querySelectorAll('#sentences-table tbody tr');
    console.log(`📋 Найдено строк в таблице: ${rows.length}`);

    rows.forEach(row => {
        const key = row.dataset.key;
        if (!key) return;

        // Обновляем поля start и end
        const startInput = row.querySelector('.start-input');
        const endInput = row.querySelector('.end-input');
        const chainCell = row.querySelector('.col-chain');

        if (startInput && endInput && chainCell) {
            const sentence = workingData.original.sentences.find(s => s.key === key);
            if (sentence) {
                console.log(`📝 Устанавливаем значения: start=${sentence.start}, end=${sentence.end}, chain=${sentence.chain}`);
                startInput.value = sentence.start.toFixed(2);
                endInput.value = sentence.end.toFixed(2);

                // Обновляем иконку цепочки
                if (sentence.chain) {
                    chainCell.innerHTML = '<i data-lucide="link"></i>';
                } else {
                    chainCell.innerHTML = '<i data-lucide="unlink"></i>';
                }

                // Обновляем иконки Lucide
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } else {
                console.log(`❌ Предложение не найдено для ключа: ${key}`);
            }
        } else {
            console.log(`❌ Не найдены элементы ввода для строки ${key}:`, { startInput, endInput, chainCell });
        }

        // Обновляем плеер для аудио
        const audioFileName = `${key}_${currentDictation.language_original}_user.mp3`;
        const audioPath = `${getAudioPath(currentDictation.language_original)}/${audioFileName}`;

        try {
            const audio = new Audio(audioPath);
            audioPlayers[audioFileName] = audio;
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить плеер для:', audioFileName, error);
        }

        // Добавляем обработчик клика для выбора предложения
        row.addEventListener('click', () => {
            selectSentenceRow(row);
        });
    });
}

/**
 * Выбрать строку в таблице (универсальная функция для всех режимов)
 */
function selectSentenceRow(row) {
    const key = row.dataset.key;
    if (!key) return;


    // ОСТАНАВЛИВАЕМ текущее воспроизведение при смене предложения
    if (window.waveformCanvas && window.waveformCanvas.isPlaying) {
        console.log('🎯 Останавливаем воспроизведение при смене предложения');
        window.waveformCanvas.stopAudioControl();
    }

    // Также останавливаем через AudioManager
    if (audioManager && audioManager.currentButton) {
        audioManager.stop();
    }
    
    // Сбрасываем состояние кнопки под волной в ready-shared при выборе новой строки
    const audioPlayBtn = document.getElementById('audioPlayBtn');
    if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
        audioPlayBtn.dataset.state = 'ready-shared';
        if (typeof setButtonState === 'function') {
            setButtonState(audioPlayBtn, 'ready-shared');
        }
    }

    // Убираем выделение с других строк
    document.querySelectorAll('#sentences-table tbody tr').forEach(r => {
        r.classList.remove('selected');
    });

    // Выделяем текущую строку
    row.classList.add('selected');

    // Получаем данные предложения
    const sentence = workingData.original.sentences.find(s => s.key === key);
    if (!sentence) {
        console.log('❌ Предложение не найдено:', key);
        return;
    }

    // Получаем текущий режим аудио
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';

    // В зависимости от режима выполняем разные действия
    switch (currentMode) {
        case 'sentence':
            // В режиме "Текущее предложение" обновляем регион и поля
            updateWaveformForSentence(sentence);
            updateCurrentSentenceInfo(sentence);
            break;
        case 'full':
            // В режиме "Отображать весь файл" только обновляем информацию
            updateCurrentSentenceInfo(sentence);
            break;
        case 'mic':
            // В режиме "Микрофон" управляем видимостью волны
            updateWaveformVisibilityForMicMode();
            updateCurrentSentenceInfoForMicMode();
            updateCurrentAudioWave(); // Обновляем текущее аудио и волну для mic
            break;
        case 'auto':
            // В режиме "Автозаполнение" только обновляем информацию
            updateCurrentSentenceInfo(sentence);
            break;
    }

    // Обновляем номер текущей строки в лейбле
    updateCurrentRowNumber();
}

/**
 * Загрузить обложку книги для диктанта
 */
async function loadBookCoverForDictation(dictationDbId, bookId = null) {
    try {
        console.log('🔍 loadBookCoverForDictation вызвана:', { dictationDbId, bookId });
        
        // Если book_id не передан, пытаемся получить его из БД по dictation_id
        if (!bookId && dictationDbId) {
            const token = window.UM?.token || localStorage.getItem('jwt_token');
            if (!token) {
                console.warn('⚠️ Нет токена для загрузки обложки книги');
                return { book_id: null };
            }
            
            console.log('📡 Запрашиваю book_id для dictation_id:', dictationDbId);
            // Получаем информацию о диктанте, включая book_id
            const response = await fetch(`/library/api/dictation/${dictationDbId}/book`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('📦 Ответ API /dictation/book:', data);
                if (data.success && data.book_id) {
                    bookId = data.book_id;
                    console.log('✅ Получен book_id:', bookId);
                } else {
                    console.log('ℹ️ Диктант не принадлежит книге');
                    return { book_id: null }; // Диктант не принадлежит книге
                }
            } else {
                const errorText = await response.text();
                console.warn('⚠️ Ошибка при получении book_id:', response.status, errorText);
                return { book_id: null }; // Ошибка или диктант не принадлежит книге
            }
        }
        
        if (!bookId) {
            console.log('ℹ️ book_id не указан, пропускаем загрузку обложки');
            return { book_id: null };
        }
        
        // Загружаем информацию о книге
        const token = window.UM?.token || localStorage.getItem('jwt_token');
        if (!token) {
            console.warn('⚠️ Нет токена для загрузки информации о книге');
            return { book_id: bookId };
        }
        
        console.log('📡 Запрашиваю информацию о книге:', bookId);
        const bookResponse = await fetch(`/library/api/book/${bookId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (bookResponse.ok) {
            const bookData = await bookResponse.json();
            console.log('📦 Ответ API /book:', bookData);
            if (bookData.success && bookData.book) {
                const book = bookData.book;
                const bookCoverWrapper = document.getElementById('bookCoverWrapper');
                const bookCoverImage = document.getElementById('bookCoverImage');
                
                console.log('🖼️ Элементы обложки:', { bookCoverWrapper: !!bookCoverWrapper, bookCoverImage: !!bookCoverImage, cover_url: book.cover_url });
                
                if (bookCoverWrapper && bookCoverImage) {
                    if (book.cover_url) {
                        bookCoverImage.src = book.cover_url;
                        bookCoverImage.alt = book.title || 'Обложка книги';
                        bookCoverWrapper.style.display = 'flex';
                        // Добавляем tooltip с названием книги
                        bookCoverWrapper.title = book.title || '';
                        console.log('✅ Обложка книги отображена:', book.title);
                    } else {
                        console.log('ℹ️ У книги нет обложки');
                        bookCoverWrapper.style.display = 'none';
                    }
                } else {
                    console.warn('⚠️ Элементы обложки не найдены в DOM');
                }
                // Возвращаем book_id для установки в currentDictation
                return { book_id: bookId };
            }
        } else {
            const errorText = await bookResponse.text();
            console.warn('⚠️ Ошибка при получении информации о книге:', bookResponse.status, errorText);
            return { book_id: bookId }; // Все равно возвращаем book_id, даже если не удалось загрузить обложку
        }
    } catch (error) {
        console.error('❌ Ошибка при загрузке обложки книги:', error);
        return { book_id: null };
    }
    
    return { book_id: bookId };
}

/**
 * Обновить волну и поля для предложения (только в режиме sentence)
 */
function updateWaveformForSentence(sentence) {
    // Обновляем регион в волне для этого предложения
    const waveformCanvas = window.waveformCanvas;
    if (waveformCanvas) {
        // СНАЧАЛА останавливаем текущее воспроизведение
        if (waveformCanvas.isPlaying) {
            waveformCanvas.stopAudioControl();
        }

        // Устанавливаем callback (на случай если он потерялся)
        setupWaveformRegionCallback();

        // Устанавливаем новый регион
        waveformCanvas.setRegion(sentence.start, sentence.end);

        // Сбрасываем playhead в начало нового региона
        waveformCanvas.setCurrentTime(sentence.start);
    }

    // Обновляем поля start/end
    if (startInput && endInput) {
        startInput.value = sentence.start.toFixed(2);
        endInput.value = sentence.end.toFixed(2);
    }
}

/**
 * Обновить информацию о текущем предложении
 */
function updateCurrentSentenceInfo(sentence) {
    const currentSentenceInfo = document.getElementById('currentSentenceInfo');
    if (currentSentenceInfo) {
        currentSentenceInfo.textContent = sentence.text || 'Текст не найден';
    }
}


/**
 * Вырезать кусочек аудио из общего файла для конкретного предложения
 * @param {Object} sentence - объект предложения с полями start, end, key
 * @param {string} language - язык аудио
 * @param {string} sourceAudioFileName - имя исходного общего аудио файла
 * @returns {Promise<string|null>} - имя созданного файла или null при ошибке
 */
async function trimAudioForSentence(sentence, language, sourceAudioFileName) {
    if (sentence.start === undefined || sentence.end === undefined || 
        sentence.start < 0 || sentence.end <= sentence.start) {
        console.warn('⚠️ Неверные значения start/end для предложения:', sentence.key);
        return null;
    }

    if (!sourceAudioFileName) {
        console.warn('⚠️ Не указан исходный аудио файл');
        return null;
    }

    try {
        const filePath = `${getAudioPath(language)}/${sourceAudioFileName}`;
        const outputFileName = `${sentence.key}_${language}_user.mp3`;
        
        // Используем эндпоинт /split-audio с одним предложением для создания отдельного файла
        const response = await fetch('/split-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: sourceAudioFileName,
                filepath: filePath,
                sentences: [{
                    key: sentence.key,
                    start_time: sentence.start,
                    end_time: sentence.end,
                    language: language
                }],
                dictation_id: currentDictation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Ошибка вырезания аудио: HTTP ${response.status}: ${errorText}`);
            return null;
        }

        const data = await response.json();
        console.log('📦 Ответ сервера при вырезании аудио:', JSON.stringify(data, null, 2));

        if (data.success) {
            // Проверяем разные возможные форматы ответа
            let filename = null;
            
            // Вариант 1: файлы в массиве files
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                const createdFile = data.files.find(f => f.key === sentence.key);
                if (createdFile && createdFile.filename) {
                    filename = createdFile.filename;
                }
            }
            
            // Вариант 2: имя файла прямо в ответе
            if (!filename && data.filename) {
                filename = data.filename;
            }
            
            // Вариант 3: имя файла в поле с ключом предложения
            if (!filename && data[sentence.key]) {
                filename = data[sentence.key];
            }
            
            if (filename) {
                console.log(`✅ Вырезан кусочек для предложения ${sentence.key}: ${filename}`);
                return filename;
            } else {
                // Сервер вернул success: true, но не вернул имя файла - это ошибка на сервере
                console.error('❌ ОШИБКА СЕРВЕРА: success=true, но имя файла отсутствует в ответе');
                console.error('Ожидаемый ключ предложения:', sentence.key);
                console.error('Полный ответ сервера:', JSON.stringify(data, null, 2));
                return null;
            }
        } else {
            // Сервер вернул success: false
            console.error('❌ Сервер вернул ошибку при вырезании аудио:', data.error || 'Неизвестная ошибка');
            return null;
        }
    } catch (error) {
        console.error('❌ Ошибка при вырезании аудио для предложения:', error);
        return null;
    }
}

/**
 * Обрезать аудиофайл ножницами
 */
async function trimAudioFile(audioFileName, startTime, endTime) {
    // console.log('✂️ Обрезаем аудиофайл:', audioFile.filename, 'с', startTime, 'по', endTime);

    // Показываем индикатор загрузки
    showLoadingIndicator('Обрезание аудиофайла...');

    try {
        // Используем правильный путь к файлу на сервере
        // console.log('📤 Обрезаем файл на сервере:', audioFile.filepath);
        filePath = `${getAudioPath(currentDictation.language_original)}/${audioFileName}`;
        // Обрезаем файл на сервере
        const response = await fetch('/cut-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // ,
                // 'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({
                filename: audioFileName,
                filepath: filePath,
                start_time: startTime,
                end_time: endTime,
                language: currentDictation.language_original,
                dictation_id: currentDictation.id  // добавляем ID диктанта
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {

            // Обновляем значения в workingData ТОЛЬКО для режима "общий файл"
            const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
            const currentMode = audioModeEl ? audioModeEl.value : 'full';
            if (currentMode === 'full' && workingData && workingData.original) {
                workingData.original.audio_user_shared = data.filename;
                workingData.original.audio_user_shared_start = 0; // После обрезки начинаем с 0
                workingData.original.audio_user_shared_end = data.end_time - data.start_time; // Новая длительность
            }
            // if (workingData && workingData.translation) {
            //     workingData.translation.audio_user_shared = data.filename;
            //     workingData.translation.audio_user_shared_start = 0;
            //     workingData.translation.audio_user_shared_end = data.end_time - data.start_time;
            // }

            // Отмечаем что диктант изменен
            currentDictation.isSaved = false;

            // Обновляем поля ввода
            if (startInput) startInput.value = '0.00';
            if (endInput) endInput.value = (data.end_time - data.start_time).toFixed(2);

            // Перезагружаем волну с обрезанным файлом
            if (data.filepath) {
                loadWaveformForFile(data.filepath);
            }

            // Автосохранение JSON удалено - данные только в workingData

            // Приводим все кнопки воспроизведения к состоянию ready (play)
            try {
                document.querySelectorAll('.audio-btn.audio-btn-table').forEach(btn => {
                    btn.dataset.state = 'ready';
                    btn.innerHTML = '<i data-lucide="play"></i>';
                });
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } catch (e) {
                console.warn('⚠️ Не удалось обновить состояние кнопок после обрезки:', e);
            }
        } else {
            console.error('❌ Ошибка обрезания аудио:', data.error);
            alert('Ошибка обрезания аудио: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка обрезания аудио:', error);
        alert('Ошибка обрезания аудио: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

/**
 * Обработчик воспроизведения аудио
 */
function handleAudioPlay() {
    // console.log('▶️ Воспроизводим аудио');
    // Здесь будет логика воспроизведения
}

/**
 * Обработчик кнопки Start
 */
function handleAudioStart() {
    // console.log('⏰ Устанавливаем время начала');

    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        console.log('❌ Волна не загружена');
        return;
    }

    // Получаем текущую позицию playhead
    const currentTime = waveformCanvas.getCurrentTime();

    // Обновляем поле Start
    if (startInput) {
        startInput.value = currentTime.toFixed(2);
    }

    // Обновляем регион волны
    const currentRegion = waveformCanvas.getRegion();
    setupWaveformRegionCallback();
    waveformCanvas.setRegion(currentTime, currentRegion.end);
}

/**
 * Обработчик кнопки End
 */
function handleAudioEnd() {
    // console.log('⏰ Устанавливаем время окончания');

    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) {
        console.log('❌ Волна не загружена');
        return;
    }

    // Получаем текущую позицию playhead
    const currentTime = waveformCanvas.getCurrentTime();

    // Обновляем поле End
    const endTimeInput = document.getElementById('audioEndTime');
    if (endTimeInput) {
        endTimeInput.value = currentTime.toFixed(2);
    }

    // Обновляем регион волны
    const currentRegion = waveformCanvas.getRegion();
    setupWaveformRegionCallback();
    waveformCanvas.setRegion(currentRegion.start, currentTime);
}

// ============================================================================
// ОБРАБОТЧИКИ СТАРТОВОГО МОДАЛЬНОГО ОКНА
// ============================================================================

function setupStartModalHandlers() {
    // Чекбокс диалога
    const isDialogCheckbox = document.getElementById('isDialogCheckbox');
    if (isDialogCheckbox) {
        isDialogCheckbox.addEventListener('change', (e) => {
            toggleSpeakersTable(e.target.checked);
            updateCheckboxIcon(e.target.checked);
        });
    }

    // Обработчик для раскрашивания строк в textarea
    const startTextInput = document.getElementById('startTextInput');
    if (startTextInput) {
        setupTextareaHighlighting(startTextInput);
    }

    // Обработчики для переключения видимости колонок
    // console.log('🔧 Настраиваем обработчики переключения колонок...');
    setupColumnToggleHandlers();

    // Инициализируем начальное состояние - показываем оригинал и перевод
    const table = document.getElementById('sentences-table');
    if (table) {
        // Проверяем наличие элементов с групповыми классами
        const originalElements = table.querySelectorAll('.panel-original');
        const translationElements = table.querySelectorAll('.panel-translation');
        const editingElements = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');

        table.classList.add('state-original-translation');
        // Обновляем иконку кнопки для начального состояния
        // updateToggleButtonIcon('open_left_panel_original', 'translation');
    } else {
        console.error('❌ Таблица sentences-table не найдена при инициализации!');
    }

    // Обработчики для боковой панели настроек аудио
    setupAudioSettingsModalHandlers();

    // Кнопка добавления спикера
    const addSpeakerBtn = document.getElementById('addSpeakerBtn');
    if (addSpeakerBtn) {
        addSpeakerBtn.addEventListener('click', addSpeaker);
    }

    // Обработчики удаления спикеров
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-speaker')) {
            removeSpeaker(e.target);
        }
    });

    // Кнопки модального окна
    const cancelStartBtn = document.getElementById('cancelStartBtn');
    if (cancelStartBtn) {
        cancelStartBtn.addEventListener('click', cancelDictationCreation);
    }

    const createDictationBtn = document.getElementById('createDictationBtn');
    if (createDictationBtn) {
        createDictationBtn.addEventListener('click', createDictationFromStart);
    }

    // Кнопка "Внести текст заново"
    const refillTableBtn = document.getElementById('refillTableBtn');
    if (refillTableBtn) {
        refillTableBtn.addEventListener('click', () => {
            if (confirm('Это удалит все существующие предложения и аудио. Продолжить?')) {
                // Очистить таблицу
                const tbody = document.querySelector('#sentences-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                }

                // Скрыть кнопку "Внести заново"
                const reenterTextSection = document.getElementById('reenterTextSection');
                if (reenterTextSection) {
                    reenterTextSection.style.display = 'none';
                }

                // Очистить workingData
                workingData.original.sentences = [];
                workingData.translation.sentences = [];

                // Открыть стартовое модальное окно
                openStartModal();
            }
        });
    }

    // Кнопка переключения видимости колонки explanation
    const toggleExplanationBtn = document.getElementById('toggleExplanationBtn');
    if (toggleExplanationBtn) {
        toggleExplanationBtn.addEventListener('click', toggleExplanationColumn);
    }

    // Кнопка "Сохранить диктант"
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await handleSave();
        });
    }

    // Кнопка "Вернуться к списку диктантов"
    const exitToIndexBtn = document.getElementById('exitToIndexBtn');
    if (exitToIndexBtn) {
        exitToIndexBtn.addEventListener('click', () => {
            showExitModal();
        });
    }

    // Обработчики модального окна выхода
    const exitModal = document.getElementById('exitModal');
    const exitStayBtn = document.getElementById('exitStayBtn');
    const exitWithoutSavingBtn = document.getElementById('exitWithoutSavingBtn');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');

    if (exitStayBtn) {
        exitStayBtn.addEventListener('click', () => {
            if (exitModal) exitModal.style.display = 'none';
        });
    }

    if (exitWithoutSavingBtn) {
        exitWithoutSavingBtn.addEventListener('click', () => {
            if (exitModal) exitModal.style.display = 'none';
            cleanupTempAndExit();
        });
    }

    if (exitWithSavingBtn) {
        exitWithSavingBtn.addEventListener('click', async () => {
            if (exitModal) exitModal.style.display = 'none';
            await handleSaveAndExit();
        });
    }

    // Закрытие модального окна по клику вне его
    if (exitModal) {
        exitModal.addEventListener('click', (e) => {
            if (e.target === exitModal) {
                exitModal.style.display = 'none';
            }
        });
    }

    // Обработка клавиши Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && exitModal && exitModal.style.display === 'flex') {
            exitModal.style.display = 'none';
        }
    });

    // Закрытие модального окна по клику вне его
    const startModal = document.getElementById('startModal');
    if (startModal) {
        startModal.addEventListener('click', (e) => {
            if (e.target === startModal) {
                closeStartModal();
            }
        });
    }
}

function openStartModal() {
    const modal = document.getElementById('startModal');

    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

    } else {
        console.error('❌ Элемент startModal не найден!');
    }
}

function closeStartModal() {
    const modal = document.getElementById('startModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

async function cancelDictationCreation() {
    try {
        // console.log('🚫 Отмена создания диктанта...');

        // Очищаем temp папку если есть диктант в работе
        if (currentDictation && currentDictation.id && currentDictation.isNew) {
            // console.log('🧹 Очищаем temp папку для диктанта:', currentDictation.id);

            const response = await fetch('/cleanup_temp_dictation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dictation_id: tempDictationId,
                    safe_email: currentDictation.safe_email
                })
            });
        }

        // Возвращаемся на главную страницу
        // Позиция в дереве сохранится автоматически, так как мы используем sessionStorage
        goToMainPage();

    } catch (error) {
        console.error('❌ Ошибка при отмене создания диктанта:', error);
        // В случае ошибки все равно возвращаемся на главную
        goToMainPage();
    }
}

function toggleSpeakersTable(show) {
    const speakersTable = document.getElementById('speakersTable');
    if (speakersTable) {
        speakersTable.style.display = show ? 'table' : 'none';
    }
}

function updateCheckboxIcon(isChecked) {
    const checkboxIcon = document.querySelector('#isDialogCheckbox + .checkbox-icon');
    if (checkboxIcon) {
        checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check-big' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function updateExplanationColumnVisibility() {
    const table = document.getElementById('sentences-table');
    if (!table) return;
    const isGeneralTab = currentTabName === 'general';
    const displayValue = (isGeneralTab && explanationVisible) ? 'table-cell' : 'none';
    
    // Находим все колонки explanation
    const headerCells = table.querySelectorAll('th.col-explanation');
    const dataCells = table.querySelectorAll('td.col-explanation');

    headerCells.forEach(cell => cell.style.display = displayValue);
    dataCells.forEach(cell => cell.style.display = displayValue);

    // Управляем кнопкой
    const toggleBtn = document.getElementById('toggleExplanationBtn');
    if (toggleBtn) {
        toggleBtn.style.display = isGeneralTab ? '' : 'none';
    }

    const toggleIcon = document.querySelector('.toggle-explanation-icon');
    if (toggleIcon) {
        toggleIcon.setAttribute('data-lucide', explanationVisible ? 'circle-check' : 'circle');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function toggleExplanationColumn() {
    explanationVisible = !explanationVisible;
    updateExplanationColumnVisibility();
}

function addSpeaker() {
    const tbody_speakers = document.querySelector('#speakersTableContent tbody');
    if (!tbody_speakers) return;

    const speakerCount = tbody_speakers.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${speakerCount}:</td>
        <td><input type="text" value="Спикер ${speakerCount}" class="speaker-name" placeholder="Имя спикера"></td>
        <td><button type="button" class="remove-speaker" title="Удалить спикера">
        <i data-lucide="trash-2"></i>
        </button></td>
    `;
    tbody_speakers.appendChild(row);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function removeSpeaker(button) {
    const row = button.closest('tr');
    const tbody = document.querySelector('#speakersTableContent tbody');
    if (row && tbody && tbody.children.length > 1) {
        row.remove();
        // Перенумеровать оставшихся спикеров
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.cells[0].textContent = `${index + 1}:`;
        });
    }
}
async function createDictationFromStart() {
    const text = (document.getElementById('startTextInput').innerText || document.getElementById('startTextInput').textContent).trim();
    const delimiter = document.getElementById('translationDelimiter').value.trim();
    const isDialog = document.getElementById('isDialogCheckbox').checked;

    if (!text) {
        alert('Введите текст диктанта');
        return;
    }

    // Показываем индикатор загрузки
    showLoadingIndicator('Формирование диктанта...');

    try {
        const speakers = isDialog ? getSpeakersFromTable() : { '1': 'Спикер 1' };

        // Парсинг текста
        const parsedData = await parseInputText(text, delimiter, isDialog, speakers);

        // Обновить глобальные данные
        currentDictation.is_dialog = isDialog;
        currentDictation.speakers = speakers;

        workingData.original = {
            language: currentDictation.language_original,
            title: document.getElementById('title').value || 'Диктант',
            speakers: speakers,
            sentences: parsedData.original
        };

        workingData.translation = {
            language: currentDictation.language_translation,
            title: document.getElementById('title_translation').value || 'Перевод',
            speakers: speakers,
            sentences: parsedData.translation
        };

        // Показать кнопку "Внести заново"
        const reenterTextSection = document.getElementById('reenterTextSection');
        if (reenterTextSection) {
            reenterTextSection.style.display = 'block';
        }

        // Обновляем данные диалога во вкладке
        updateDialogTab();

        // Создать таблицу
        await createTable();
        
        // Обновить выпадающие списки спикеров после создания таблицы
        refreshAllSpeakerSelectOptions();

        // Очистить поле ввода текста в модальном окне
        const startTextInput = document.getElementById('startTextInput');
        if (startTextInput) {
            startTextInput.innerHTML = '';
        }

        // Закрыть модальное окно
        closeStartModal();

    } catch (error) {
        console.error('Ошибка при создании диктанта:', error);
        alert('Ошибка при создании диктанта: ' + error.message);
    } finally {
        // Скрываем индикатор загрузки
        hideLoadingIndicator();
    }
}

// Добавляем обработчик для предотвращения случайного закрытия страницы
window.addEventListener('beforeunload', function (event) {
    if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = 'У вас есть несохраненные изменения! Вы действительно хотите покинуть страницу?';
        return event.returnValue;
    }
});

/**
 * Обработчик клика по логотипу - проверяет несохраненные изменения
 */
function handleLogoClick() {
    showExitModal();
}

/**
 * Показывает модальное окно выхода
 */
function showExitModal() {
    const exitModal = document.getElementById('exitModal');
    if (!exitModal) return;

    // Проверяем: новый диктант и не создан в БД = нет сохранённых данных
    const isNewNotSaved = currentDictation.isNew && !currentDictation.db_id;
    const hasUnsaved = isNewNotSaved || hasUnsavedChanges();
    
    // Если всё сохранено - просто выходим без вопросов
    if (!hasUnsaved) {
        cleanupTempAndExit();
        return;
    }
    
    // Если есть несохранённые изменения - показываем модальное окно
    const exitModalMessage = document.getElementById('exitModalMessage');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');

    if (exitModalMessage) {
        exitModalMessage.textContent = 'Сохранить изменения?';
    }

    if (exitWithSavingBtn) {
        exitWithSavingBtn.style.display = '';
    }

    exitModal.style.display = 'flex';
    const stayBtn = document.getElementById('exitStayBtn');
    if (stayBtn) stayBtn.focus();
}

/**
 * Обработчик кнопки "Сохранить" с индикацией процесса
 */
async function handleSave() {
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i data-lucide="loader-2"></i>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
        
        try {
            await saveDictationOnly();
            updateUnsavedStar();
        } catch (error) {
            console.error('[Save] error', error);
        } finally {
            saveBtn.innerHTML = originalHTML;
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            saveBtn.disabled = false;
        }
    }
}

/**
 * Обновляет отображение звездочки несохраненных изменений
 */
function updateUnsavedStar() {
    const unsavedStar = document.getElementById('unsavedStar');
    if (unsavedStar) {
        const hasUnsaved = hasUnsavedChanges();
        unsavedStar.style.display = hasUnsaved ? 'inline-flex' : 'none';
    }
}

/**
 * Обработчик сохранения и выхода
 */
async function handleSaveAndExit() {
    await saveDictationOnly();
    cleanupTempAndExit();
}

/**
 * Проверяет есть ли несохраненные изменения
 */
function hasUnsavedChanges() {
    // Если диктант уже сохранен - нет несохраненных изменений
    if (currentDictation.isSaved) {
        return false;
    }

    // Проверяем есть ли данные в workingData
    if (!workingData || !workingData.original) {
        return false;
    }

    // Проверяем есть ли предложения
    if (!workingData.original.sentences || workingData.original.sentences.length === 0) {
        return false;
    }

    // Проверяем есть ли аудио файлы
    const hasAudio = workingData.original.sentences.some(sentence =>
        sentence.audio_user || sentence.audio_user_shared
    );

    return hasAudio;
}

/**
 * Вызывается при изменении данных - обновляет звездочку и флаг сохраненности
 */
function markAsUnsaved() {
    if (currentDictation.isSaved) {
        currentDictation.isSaved = false;
    }
    updateUnsavedStar();
}

/**
 * Сохраняет диктант без выхода со страницы
 */
async function saveDictationOnly() {
    // Синхронизируем данные из вкладок перед сохранением
    syncSpeakersFromTab();
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    if (tabIsDialogCheckbox) {
        currentDictation.is_dialog = tabIsDialogCheckbox.checked;
    }
    
    // Если это НЕ диалог, очищаем всех спикеров перед сохранением,
    // чтобы в БД не оставались старые «Спикер 1», «Спикер 2» и т.п.
    if (!currentDictation.is_dialog) {
        currentDictation.speakers = {};
    }
    
    try {
        // Показываем индикатор загрузки
        showLoadingIndicator('Сохранение диктанта...');

        // Для новых диктантов создание в БД происходит в save_dictation_final()
        // Здесь просто проверяем, что у нас есть временный ID
        if (!currentDictation.id || currentDictation.id === 'new') {
            throw new Error('Отсутствует ID диктанта');
        }

        // Получаем user_id из UserManager или из API
        let user_id = currentDictation.user_id;
        if (!user_id && window.UM && window.UM.getCurrentUser) {
            const user = window.UM.getCurrentUser();
            if (user && user.id) {
                user_id = user.id;
            }
        }
        
        // Собираем переводы заголовка
        const titleTranslationValue = document.getElementById('title_translation')?.value || '';
        const titleTranslations = currentDictation.title_translations || {};
        // Обновляем перевод для текущего языка перевода
        if (titleTranslationValue) {
            titleTranslations[currentDictation.language_translation] = titleTranslationValue;
        }
        
        // Собираем author_materials_url
        const authorMaterialsUrlInput = document.getElementById('dictation-author-materials-url-input');
        const authorMaterialsUrl = authorMaterialsUrlInput ? authorMaterialsUrlInput.value.trim() || null : null;
        
        // Подготавливаем данные для сохранения
        const saveData = {
            id: currentDictation.id,  // Может быть dict_temp_<timestamp> для новых
            temp_id: currentDictation.temp_id || currentDictation.id,  // Временный ID для копирования файлов
            db_id: currentDictation.db_id,  // Может быть null для новых диктантов
            user_id: user_id,  // ID пользователя для пути temp/<user_id>/
            language_original: currentDictation.language_original,
            language_translation: currentDictation.language_translation,
            title: workingData.original.title || 'Без названия',
            title_translations: titleTranslations,  // Переводы заголовка
            level: currentDictation.level || 'A1',
            is_dialog: currentDictation.is_dialog || false,
            speakers: currentDictation.speakers || {},
            author_materials_url: authorMaterialsUrl,  // Ссылка на материалы автора
            sentences: {
                [currentDictation.language_original]: workingData.original,
                [currentDictation.language_translation]: workingData.translation
            },
            category_key: currentDictation.category_key,
            // Если диктант создан из приватной библиотеки, сюда попадёт ID книги/раздела
            book_id: currentDictation.book_id || null
        };

        // Проверяем наличие токена
        // Используем jwt_token (как в user_manager.js) или токен из UserManager
        let token = null;
        if (window.UM && window.UM.token) {
            token = window.UM.token;
        } else {
            token = localStorage.getItem('jwt_token');
        }
        
        if (!token) {
            alert('Ошибка: отсутствует токен авторизации. Пожалуйста, войдите в систему заново.');
            hideLoadingIndicator();
            return;
        }
        
        // Получаем user_id из API, если он не установлен
        if (!saveData.user_id) {
            try {
                const userResponse = await fetch('/user/api/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData && userData.id) {
                        saveData.user_id = userData.id;
                        currentDictation.user_id = userData.id;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Не удалось получить user_id из API:', e);
            }
        }
        
        // Проверяем category_key только если нет book_id (новая идеология: диктант принадлежит книге/разделу, а не категории)
        if (!saveData.book_id && !saveData.category_key) {
            alert('Ошибка: не выбрана категория для диктанта. Пожалуйста, выберите категорию.');
            hideLoadingIndicator();
            return;
        }
        
        // Отправляем данные на сервер для сохранения предложений и обновления диктанта
        
        const response = await fetch('/save_dictation_final', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(saveData)
        });

        // Проверяем статус ответа перед парсингом JSON
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Ошибка HTTP:', {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText
            });
            
            let errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.msg || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            
            alert('Ошибка сохранения диктанта: ' + errorMessage);
            hideLoadingIndicator();
            return;
        }
        
        const result = await response.json();

        if (result.success) {
            // Если диктант был создан в БД - обновляем ID
            if (result.dictation_id && result.db_id) {
                currentDictation.id = result.dictation_id;
                currentDictation.db_id = result.db_id;
                currentDictation.isNew = false;
                
                // Показываем ID
                const dictationIdElement = document.getElementById('dictation-id');
                if (dictationIdElement) {
                    dictationIdElement.textContent = `id: ${result.dictation_id}`;
                    dictationIdElement.style.display = '';
                }
            }
            
            // Обновляем title_translations в currentDictation
            currentDictation.title_translations = titleTranslations;
            
            // Отмечаем диктант как сохраненный
            currentDictation.isSaved = true;

            // Обновляем звездочку
            updateUnsavedStar();

            // Скрываем индикатор загрузки
            hideLoadingIndicator();
        } else {
            console.error('❌ Ошибка сохранения диктанта:', result);
            alert('Ошибка сохранения диктанта: ' + (result.error || 'Неизвестная ошибка'));
            hideLoadingIndicator();
        }

    } catch (error) {
        console.error('❌ Ошибка при сохранении диктанта:', error);
        alert('Ошибка при сохранении диктанта: ' + error.message);
        hideLoadingIndicator();
    }
}

/**
 * Показывает модальное окно подтверждения выхода
 */
function showExitConfirmation() {
    const exitWithoutSave = confirm(
        'Выйти без сохранения?\n\n' +
        '• ОК — выйти без сохранения\n' +
        '• Отмена — остаться на странице'
    );
    if (exitWithoutSave) {
        cleanupTempAndExit();
    }
}

/**
 * Очищает temp папку и переходит на главную страницу
 */
async function cleanupTempAndExit() {
    try {
        // Показываем индикатор загрузки
        showLoadingIndicator('Очистка временных файлов...');

        // Очищаем temp папку если это новый диктант (используем временный ID если был создан)
        // Для нового диктанта без сохранения в БД - используем временный ID из temp если есть
        const tempDictationId = currentDictation.temp_id || currentDictation.id;
        if (tempDictationId && tempDictationId !== 'new' && tempDictationId.startsWith('dict_temp_')) {
            const response = await fetch('/cleanup_temp_dictation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.UM?.token || localStorage.getItem('jwt_token')}`
                },
                body: JSON.stringify({
                    dictation_id: tempDictationId,
                    user_id: currentDictation.user_id,  // Для пути temp/<user_id>/
                    safe_email: currentDictation.safe_email
                })
            });

            const result = await response.json();
        }

        // Переходим на главную страницу
        goToMainPage();

    } catch (error) {
        console.error('❌ Ошибка при очистке temp папки:', error);
        // В случае ошибки все равно переходим на главную
        goToMainPage();
    }
}

/**
 * Переходит на главную страницу
 */
function goToMainPage() {
    // console.log('🏠 Переходим на главную страницу...');
    window.location.href = '/';
}

// Функция saveSentencesJsonToServer() удалена - нет автосохранения JSON

async function saveDictationAndExit() {
    // Синхронизируем данные из вкладок перед сохранением
    syncSpeakersFromTab();
    const tabIsDialogCheckbox = document.getElementById('tabIsDialogCheckbox');
    if (tabIsDialogCheckbox) {
        currentDictation.is_dialog = tabIsDialogCheckbox.checked;
    }
    
    // Если это НЕ диалог, очищаем всех спикеров перед сохранением
    if (!currentDictation.is_dialog) {
        currentDictation.speakers = {};
    }
    
    try {
        // Показываем индикатор загрузки
        showLoadingIndicator('Сохранение диктанта...');

        // Подготовить данные для сохранения
        const saveData = {
            id: currentDictation.id,
            language_original: currentDictation.language_original,
            language_translation: currentDictation.language_translation,
            title: document.getElementById('title') ? document.getElementById('title').value : 'Диктант',
            level: currentDictation.level || 'A1',
            is_dialog: currentDictation.is_dialog,
            speakers: currentDictation.speakers,
            sentences: {
                [currentDictation.language_original]: workingData.original,
                [currentDictation.language_translation]: workingData.translation
            }
        };

        // Проверяем обязательные поля
        if (!saveData.id) {
            alert('Ошибка: отсутствует ID диктанта');
            hideLoadingIndicator();
            return;
        }

        // Проверяем category_key только если нет book_id (новая идеология: диктант принадлежит книге/разделу, а не категории)
        if (!currentDictation.book_id && !currentDictation.category_key) {
            alert('Ошибка: не выбрана категория для диктанта');
            hideLoadingIndicator();
            return;
        }


        // Сохраняем диктант сразу в финальную папку и добавляем в категорию
        const requestData = {
            ...saveData,
            category_key: currentDictation.category_key
        };


        const response = await fetch('/save_dictation_final', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();


        if (result.success) {
            // console.log('Диктант сохранен в финальную папку и добавлен в категорию');

            // Отмечаем диктант как сохраненный
            currentDictation.isSaved = true;

            // Сохраняем текущую категорию в sessionStorage перед переходом
            const currentCategoryData = {
                key: currentDictation.category_key,
                title: currentDictation.category_title,
                path: currentDictation.category_path,
                language_original: currentDictation.language_original,
                language_translation: currentDictation.language_translation
            };
            sessionStorage.setItem('selectedCategoryForDictation', JSON.stringify(currentCategoryData));

            // Перенаправить на главную страницу (позиция в дереве восстановится автоматически)
            goToMainPage();
        } else {
            console.error('❌ Ошибка сохранения диктанта:', result);
            alert('Ошибка сохранения диктанта: ' + (result.error || 'Неизвестная ошибка'));
            hideLoadingIndicator();
        }

    } catch (error) {
        console.error('Ошибка при сохранении диктанта:', error);
        alert('Ошибка при сохранении диктанта: ' + error.message);
        hideLoadingIndicator();
    }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ СОЗДАНИЯ ДИКТАНТА
// ============================================================================

/**
 * Получить спикеров из таблицы
 */
function getSpeakersFromTable() {
    const speakers = {};
    // Сначала проверяем модальное окно (стартовое окно создания диктанта)
        const mainTbody = document.querySelector('#speakersTableContent tbody');
        if (mainTbody) {
        mainTbody.querySelectorAll('.speaker-name').forEach((input, index) => {
                const speakerId = (index + 1).toString();
                const speakerName = input.value.trim() || `Спикер ${speakerId}`;
            if (speakerName) {
                speakers[speakerId] = speakerName;
        }
        });
        // Если нашли спикеров в модальном окне, возвращаем их
        if (Object.keys(speakers).length > 0) {
        return speakers;
        }
    }
    
    // Если в модальном окне нет спикеров, берем из таблицы во вкладке
    const tbody = document.querySelector('#tabSpeakersTableContent tbody');
    if (tbody) {
    tbody.querySelectorAll('.speaker-name').forEach((input, index) => {
        const speakerId = (index + 1).toString();
        const speakerName = input.value.trim() || `Спикер ${speakerId}`;
            if (speakerName) {
        speakers[speakerId] = speakerName;
            }
    });
    }
    
    return speakers;
}

/**
 * Генерация имени аудиофайла
 */
function generateAudioFileName(key, language, tipe_audio = 'avto') {
    return `${key}_${language}_${tipe_audio}.mp3`;
}

/**
 * Перевод текста для редактирования (шапка и редактирование таблицы)
 * @param {string} text - текст для перевода
 * @param {string} fromLanguage - исходный язык
 * @param {string} toLanguage - целевой язык
 * @returns {Promise<string>} - переведенный текст
 */
async function translateTextForEditing(text, fromLanguage, toLanguage) {
    return await autoTranslate(text, fromLanguage, toLanguage);
}

/**
 * Автоматический перевод текста (для обратной совместимости)
 */
async function autoTranslate(text, fromLanguage, toLanguage) {
    try {
        const response = await fetch('/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                language_original: fromLanguage,
                language_translation: toLanguage
            })
        });

        if (response.ok) {
            const result = await response.json();
            const translatedText = result.translation || text;
            return translatedText;
        } else {
            console.warn('❌ Ошибка перевода (статус:', response.status, '), используем оригинальный текст');
            return text;
        }
    } catch (error) {
        console.error('Ошибка при переводе:', error);
        return text;
    }
}

/**
 * Генерировать аудио для одного предложения
 */
/**
 * Формирует путь к папке с аудио файлами для диктанта
 * @param {string} language - код языка ('en', 'ru', и т.д.)
 * @returns {string} - путь к папке с аудио
 */
function getAudioPath(language) {
    if (currentDictation.user_id && currentDictation.id.startsWith('dict_temp_')) {
        return `/static/data/temp/${currentDictation.user_id}/${currentDictation.id}/${language}`;
    }
    return `/static/data/temp/${currentDictation.id}/${language}`;
}

async function generateAudioForSentence(sentence, language) {
    if (!sentence.text.trim()) return null;

    // Очищаем текст от меток спикеров (1:, 2:) и комментариев (/* ... */)
    let cleanText = sentence.text;
    
    // Удаляем метки спикеров (например, "1: ", "2: ") - могут быть в начале строки или после пробела
    // Используем негативный просмотр назад для удаления пробела перед меткой, если он есть
    cleanText = cleanText.replace(/\s*\d+:\s*/g, ' ');
    // Убираем лишние пробелы, оставшиеся после удаления меток
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    // Удаляем комментарии вида /* ... */
    cleanText = cleanText.replace(/\/\*.*?\*\//g, '');
    
    // Очищаем от лишних пробелов
    cleanText = cleanText.trim();
    
    if (!cleanText) {
        console.warn('⚠️ Текст пустой после очистки для предложения:', sentence.key);
        return null;
    }

    // Генерируем имя файла, если его нет
    let filename = sentence.audio;
    if (!filename) {
        // Создаем имя файла на основе ключа и языка
        const key = sentence.key || '000';
        filename = `${key}_${language}_avto.mp3`;
    }

    try {
        // Получаем user_id - сначала из currentDictation, потом из UserManager
        let user_id = currentDictation.user_id;
        if (!user_id && window.UM && window.UM.getCurrentUser) {
            const user = window.UM.getCurrentUser();
            if (user && user.id) {
                user_id = user.id;
                // Сохраняем user_id в currentDictation для последующих вызовов
                currentDictation.user_id = user_id;
            }
        }
        
        // Получаем safe_email
        let safe_email = currentDictation.safe_email;
        if (!safe_email && window.UM && window.UM.getSafeEmail) {
            safe_email = window.UM.getSafeEmail();
            if (safe_email) {
                currentDictation.safe_email = safe_email;
            }
        }
        
        console.log('🎵 Генерирую аудио:', {
            text: cleanText.substring(0, 50) + '...',
            language,
            filename,
            dictation_id: currentDictation.id,
            user_id,
            safe_email
        });
        
        const response = await fetch('/generate_audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: cleanText,
                language: language,
                filename: filename,
                filename_audio: filename,
                tipe_audio: 'avto',
                dictation_id: currentDictation.id,
                user_id: user_id,  // Для пути temp/<user_id>/
                safe_email: safe_email
            })
        });

        if (response.ok) {
            const result = await response.json();
            return result.filename || filename; // Возвращаем имя файла
        } else {
            const errorText = await response.text();
            console.error(`❌ Ошибка генерации аудио для ${filename}: ${response.status} ${errorText}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Ошибка при генерации аудио:`, error);
        return null;
    }
}

/**
 * Парсинг текста диктанта
 */
async function parseInputText(text, delimiter, isDialog, speakers) {
    // Удалить пустые строки
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
        return { original: [], translation: [] };
    }

    const language_original = currentDictation.language_original;
    const language_translation = currentDictation.language_translation;
    const original = [];
    const translation = [];
    let key_i = 0; // индекс для генерации ключа
    let i_next = 0; // индекс наступного рядка в тексті, якщо в наступному рядку э /* то перекладати не тереба 
    let original_line = "";
    let translation_line = "";
    let translation_mistake = [];
    for (let i = 0; i < lines.length; i++) {
        // !!! дивимось одночасно поточний рядок і наступний рядок

        // поточний рядок - оригінальний текст
        original_line = lines[i];
        if (original_line.startsWith(delimiter)) {
            // пропущено оригінальний текст, пропускаємо цей рядок 
            // але зберемо помилки перекладу без оригіналу
            translation_mistake.push({
                id: i,
                text: original_line,
            });
            continue;
        }

        const key = key_i.toString().padStart(3, '0'); // ключ поточного речення);
        key_i++; // наступне речення
        const audio_originalFileName = generateAudioFileName(key, language_original);
        const audio_translationFileName = generateAudioFileName(key, language_translation);

        const s_original = {
            key: key,
            speaker: '1',
            text: original_line,
            audio: audio_originalFileName, //аудио которое будет в диктанте! Итоговое
            audio_avto: audio_originalFileName, // автоперевод
            audio_user: '', // отрезанный кусок
            audio_mic: '', // запись с микрофона
            // audio_user_shared: '', // источник для отрезанного куска
            start: 0,
            end: 0,
            chain: false,
            checked: false
        };
        // Генерировать аудио для оригинала
        await generateAudioForSentence(s_original, language_original);
        original.push(s_original);

        // наступний рядок - переклад
        i_next = i + 1; // індекс наступного рядка в тексті, якщо в наступному рядку э /* то перекладати не тереба 
        translation_line = "";
        let hasTranslationLine = false;
        if (i_next < lines.length) {
            if (lines[i_next].startsWith(delimiter)) {
                // есть перевод, берем его и переводить не надо
                translation_line = lines[i_next].substring(2).trim(); // удалить /*;
                i++;
                hasTranslationLine = true;
            }
            else {
                // перекладу немає, робимо автопереклад
                translation_line = await autoTranslate(original_line, language_original, language_translation);
            }
        } else {
            // останній рядок і перекладу немає, робимо автопереклад
            translation_line = await autoTranslate(original_line, language_original, language_translation);
        }

        const s_translation = {
            key: key,
            speaker: '1',
            text: translation_line,
            audio: audio_translationFileName,
            audio_avto: audio_translationFileName, // автоперевод
            audio_user: '', // отрезанный кусок
            audio_mic: '', // запись с микрофона
            // audio_user_shared: '', // источник для отрезанного куска
            start: 0,
            end: 0,
            chain: false,
            explanation: '' // поле для комментариев
        };
        // генеруємо аудио перекладу
        await generateAudioForSentence(s_translation, language_translation);
        translation.push(s_translation);
        
        // Проверяем, есть ли строки // для explanation после текущего предложения
        // Смотрим на следующую строку после перевода
        let explanation_i = i + 1;
        let explanation_text = '';
        while (explanation_i < lines.length && lines[explanation_i].startsWith('//')) {
            // Собираем все строки начинающиеся с //
            const comment_line = lines[explanation_i].substring(2).trim(); // удалить //
            if (explanation_text) {
                explanation_text += '\n' + comment_line;
            } else {
                explanation_text = comment_line;
            }
            explanation_i++;
        }
        
        // Если нашли строки объяснения, присваиваем их к текущему предложению
        if (explanation_text && translation.length > 0) {
            translation[translation.length - 1].explanation = explanation_text;
        }
        
        // Пропускаем обработанные строки explanation (учитываем, что i уже инкрементирован если был delimiter)
        if (explanation_i > i + 1) {
            i = explanation_i - 1; // -1 потому что в конце цикла for будет i++
        }

    }

    // Обработка ошибок перевода
    if (translation_mistake.length > 0) {
        let message = `Обнаружены ошибки в структуре текста:\n`;
        translation_mistake.forEach(item => {
            message += `Строка ${item.id + 1}: ${item.text}\n`;
        });
        message += `\nЭти строки пропущены, так как начинаются с символа перевода без оригинального текста.`;
        alert(message);
    }

    if (isDialog) {
        // Обработка спикеров для диалогов
        const speakerIds = Object.keys(speakers);
        const speakerNumbers = speakerIds.map(id => id + ':');
        const linesWithoutSpeakers = [];
        let currentSpeakerIndex = 0;

        // Проходим по массиву original и обрабатываем спикеров
        for (let i = 0; i < original.length; i++) {
            const sentence = original[i];
            const text = sentence.text;
            let speakerId = null;
            let cleanText = text;

            // Проверяем, начинается ли строка с номера спикера (1:, 2:, и т.д.)
            const speakerMatch = text.match(/^(\d+):\s*(.+)$/);
            if (speakerMatch) {
                const foundSpeakerId = speakerMatch[1];
                cleanText = speakerMatch[2].trim();

                // Проверяем, есть ли такой спикер в таблице
                if (speakers[foundSpeakerId]) {
                    speakerId = foundSpeakerId;
                    sentence.text = cleanText; // Удаляем номер спикера из текста
                }
            }

            // Если спикер не найден, добавляем в список строк без спикеров
            if (!speakerId) {
                linesWithoutSpeakers.push({
                    index: i + 1,
                    text: text
                });
            }

            // Обновляем speaker в предложении
            sentence.speaker = speakerId;
        }

        // Если есть строки без спикеров
        if (linesWithoutSpeakers.length > 0) {
            let message = `В следующих строках не указан спикер:\n`;
            linesWithoutSpeakers.forEach(item => {
                message += `${item.index}. ${item.text}\n`;
            });

            if (linesWithoutSpeakers.length === original.length) {
                // Если во всех строках нет спикеров, расставляем по кругу
                message += `\nСпикеры будут расставлены автоматически по порядку. Проверьте реплики!`;

                for (let i = 0; i < original.length; i++) {
                    const speakerId = speakerIds[currentSpeakerIndex % speakerIds.length];
                    original[i].speaker = speakerId;
                    currentSpeakerIndex++;
                }
            } else {
                // Если только в некоторых строках нет спикеров, проставляем первого спикера
                message += `\nВ этих строках будет проставлен спикер "1".`;

                linesWithoutSpeakers.forEach(item => {
                    const index = item.index - 1; // индекс в массиве
                    if (original[index]) {
                        original[index].speaker = '1';
                    }
                });
            }

            alert(message);
        }
    }


    return { original, translation };
}


/**
 * Предварительная загрузка аудио файлов в плееры
 */
async function preloadAudioFiles() {

    const originalSentences = workingData.original.sentences || [];
    const translationSentences = workingData.translation.sentences || [];

    // Загружаем аудио для оригинального языка
    for (const sentence of originalSentences) {
        if (sentence.audio && !audioPlayers[sentence.audio]) {
            try {
                const audioUrl = `${getAudioPath(currentDictation.language_original)}/${sentence.audio}`;
                const audio = new Audio(audioUrl);
                audioPlayers[sentence.audio] = audio;
            } catch (error) {
                console.warn(`⚠️ Не удалось загрузить аудио оригинала: ${sentence.audio}`, error);
            }
        }
    }

    // Загружаем аудио для языка перевода
    for (const sentence of translationSentences) {
        if (sentence.audio && !audioPlayers[sentence.audio]) {
            try {
                const audioUrl = `${getAudioPath(currentDictation.language_translation)}/${sentence.audio}`;
                const audio = new Audio(audioUrl);
                audioPlayers[sentence.audio] = audio;
            } catch (error) {
                console.warn(`⚠️ Не удалось загрузить аудио перевода: ${sentence.audio}`, error);
            }
        }
    }
}

/**
 * Создать таблицу предложений
 */
async function createTable() {
    const tbody = document.querySelector('#sentences-table tbody');
    if (!tbody) return;

    // Очистить таблицу
    tbody.innerHTML = '';

    // Показать/скрыть колонку спикера в зависимости от типа диктанта
    const speakerCol = document.querySelector('.col-speaker');
    if (speakerCol) {
        speakerCol.style.display = currentDictation.is_dialog ? 'table-cell' : 'none';
    }

    // Создать строки для оригинального языка
    const originalSentences = workingData.original.sentences || [];
    const translationSentences = workingData.translation.sentences || [];

    // Объединить оригинал и перевод по ключам
    const allKeys = new Set();
    originalSentences.forEach(s => allKeys.add(s.key));
    translationSentences.forEach(s => allKeys.add(s.key));

    Array.from(allKeys).sort().forEach(key => {
        const originalSentence = originalSentences.find(s => s.key === key);
        const translationSentence = translationSentences.find(s => s.key === key);

        const row = createTableRow(key, originalSentence, translationSentence);
        tbody.appendChild(row);
    });

    // Предварительно загружаем аудио файлы в плееры
    // будем подгружать аудио при первом вызвове
    // await preloadAudioFiles();

    // Пересоздать иконки Lucide после создания таблицы
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Проверяем, есть ли explanation в предложениях
    const hasExplanation = translationSentences.some(s => s.explanation && s.explanation.trim());
    if (hasExplanation) {
        explanationVisible = true;
    }
    
    // Обновляем видимость кнопки редактирования всех
    updateEditAllCreatingButtonVisibility();
    updateExplanationColumnVisibility();

    // Автоматически выбираем первую строку при создании таблицы
    setTimeout(() => {
        const firstRow = document.querySelector('#sentences-table tbody tr:first-child');
        if (firstRow) {
            selectSentenceRow(firstRow);
        }
    }, 100); // Небольшая задержка для завершения всех операций
}
/**
 * Создать строку таблицы
 * @param {string} key - ключ строки
 * @param {Object|null} originalSentence - данные оригинального предложения
 * @param {Object|null} translationSentence - данные перевода
 */
function createTableRow(key, originalSentence, translationSentence) {
    const row = document.createElement('tr');
    row.dataset.key = key;
    row.className = 'sentence-row';

    // Колонка 0: №
    const numberCell = document.createElement('td');
    numberCell.className = 'col-number';
    numberCell.dataset.col_id = 'col-number';

    // Для табличных ключей (t_001, t_002) используем специальную логику
    if (key.startsWith('t_')) {
        numberCell.textContent = '00'; // Временно, будет обновлено в updateTableRowNumbers
    } else {
        numberCell.textContent = parseInt(key) + 1;
    }

    row.appendChild(numberCell);

    // Колонка 1: Чекбокс (видимость только на вкладке "Создание аудио")
    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'col-checkbox-create-audio panel-create-audio';
    checkboxCell.dataset.col_id = 'col-checkbox-create-audio';
    checkboxCell.style.display = 'none'; // По умолчанию скрыта
    
    // Создаем кнопку на всю ширину ячейки (как у кнопки play)
    const checkboxBtn = document.createElement('button');
    checkboxBtn.className = 'checkbox-btn checkbox-btn-table';
    checkboxBtn.dataset.key = key;
    checkboxBtn.style.width = '100%';
    checkboxBtn.style.height = '100%';
    checkboxBtn.style.padding = '0';
    checkboxBtn.style.border = 'none';
    checkboxBtn.style.background = 'transparent';
    checkboxBtn.style.cursor = 'pointer';
    checkboxBtn.style.display = 'flex';
    checkboxBtn.style.alignItems = 'center';
    checkboxBtn.style.justifyContent = 'center';
    
    const checkboxIcon = document.createElement('i');
    checkboxIcon.className = 'checkbox-icon';
    checkboxIcon.setAttribute('data-lucide', 'circle');
    
    // Инициализируем поле checked в данных предложения, если его нет
    if (originalSentence && originalSentence.checked === undefined) {
        originalSentence.checked = false;
    }
    
    // Устанавливаем начальную иконку на основе данных
    const isChecked = originalSentence ? (originalSentence.checked === true) : false;
    checkboxIcon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
    
    checkboxBtn.appendChild(checkboxIcon);
    checkboxCell.appendChild(checkboxBtn);
    
    // Вешаем общий обработчик (как у кнопки play)
    checkboxBtn.addEventListener('click', handleCheckboxToggle);
    
    row.appendChild(checkboxCell);

    // Колонка 2: Спикер (всегда присутствует; видимость управляется чекбоксом)
    const speakerCell = document.createElement('td');
    speakerCell.className = 'col-speaker';
    speakerCell.dataset.col_id = 'col-speaker';
    const selectedSpeakerId = originalSentence && originalSentence.speaker ? String(originalSentence.speaker) : '';
    buildSpeakerDropdown(speakerCell, selectedSpeakerId, (newIdWithColon) => {
        // коллбек выбора: записываем только код (например, "1:") в строку
        if (originalSentence) {
            const cleanId = newIdWithColon ? String(newIdWithColon).replace(':', '') : '';
            originalSentence.speaker = cleanId || undefined;
        }
    });
    // Первоначальная видимость берётся из текущего состояния чекбокса
    speakerCell.style.display = (currentDictation.is_dialog ? 'table-cell' : 'none');
    row.appendChild(speakerCell);

    // Колонка 2: Оригинальный текст
    const originalCell = document.createElement('td');
    originalCell.className = 'col-original panel-original';
    originalCell.dataset.col_id = 'col-or-text';

    // Создаем поле ввода для оригинала всегда
    const textareaOriginal = document.createElement('textarea');
    textareaOriginal.value = (originalSentence && originalSentence.text) ? originalSentence.text : '';
    textareaOriginal.className = 'sentence-text';
    textareaOriginal.dataset.key = key;
    textareaOriginal.dataset.type = 'original';

    // Слушатель изменения текста оригинала
    textareaOriginal.addEventListener('input', function () {
        // Обновляем текст в данных
        if (originalSentence) {
            originalSentence.text = textareaOriginal.value;
        }

        // Меняем кнопку воспроизведения в режим создания
        // const audioBtn = row.querySelector(`.col-audio .audio-btn[data-language=${currentDictation.language_original}]`);
        const audioBtn = row.querySelector(`.btn-col-or-audio`);
        if (audioBtn) {
            audioBtn.dataset.create = 'true';
            audioBtn.title = 'Создать аудио оригинала';
            audioBtn.dataset.state = 'creating';
            setButtonState(audioBtn);
        }
    });

    // Слушатель нажатия Enter для автоперевода
    textareaOriginal.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // Находим поле перевода в той же строке
            const translationTextarea = row.querySelector('.col-translation textarea[data-type="translation"]');

            // Если поле перевода пустое, создаем автоперевод
            if (translationTextarea && !translationTextarea.value.trim()) {
                event.preventDefault(); // Предотвращаем добавление новой строки в textarea

                const originalText = textareaOriginal.value.trim();
                if (originalText) {
                    console.log('🔄 Создание автоперевода для:', originalText);
                    createAutoTranslation(originalText, translationTextarea, key);
                }
            }
        }
    });

    originalCell.appendChild(textareaOriginal);
    row.appendChild(originalCell);

    // Колонка 3: Аудио Оригінал
    const audioCellOriginal = document.createElement('td');
    audioCellOriginal.className = 'col-play-original panel-original panel-create-audio';
    audioCellOriginal.dataset.col_id = 'col-or-audio';

    // Единая кнопка для оригинала
    const audioBtnOriginal = document.createElement('button');
    audioBtnOriginal.className = 'audio-btn btn-col-or-audio audio-btn-table state-ready';
    audioBtnOriginal.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginal.dataset.language = currentDictation.language_original;
    audioBtnOriginal.dataset.fieldName = 'audio';
    // audioBtnOriginal.dataset.create = 'folse';
    state = (!originalSentence || !originalSentence.audio) ? 'creating' : 'ready';
    audioBtnOriginal.dataset.state = state;
    audioBtnOriginal.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginal);
    audioBtnOriginal.title = (!originalSentence || !originalSentence.audio) ? 'Создать аудио оригинала' : 'Воспроизвести аудио оригинала';
    audioBtnOriginal.addEventListener('click', handleAudioPlayback);
    audioCellOriginal.appendChild(audioBtnOriginal);
    row.appendChild(audioCellOriginal);

    // Колонка 4: Развернуть настройку аудио
    const audioSettingsCell = document.createElement('td');
    audioSettingsCell.className = 'col-audio-settings panel-original';
    audioSettingsCell.dataset.col_id = 'col-or-open-settings';
    audioSettingsCell.style.backgroundColor = 'var(--color-hover)';
    audioSettingsCell.style.padding = '0';
    // Всегда создаем кнопку, даже если аудио нет
    const audioSettingsBtn = document.createElement('button');
    audioSettingsBtn.className = 'audio-settings-btn';
    // Удалено создание колонки разворота настроек аудио

    // Колонка 5: Перевод
    const translationCell = document.createElement('td');
    translationCell.className = 'col-translation panel-translation';
    translationCell.dataset.col_id = 'col-tr-text';

    // Создаем поле ввода для перевода всегда
    const textareaTranslation = document.createElement('textarea');
    textareaTranslation.value = (translationSentence && translationSentence.text) ? translationSentence.text : '';
    textareaTranslation.className = 'sentence-text';
    textareaTranslation.dataset.key = key;
    textareaTranslation.dataset.type = 'translation';

    // Слушатель изменения текста перевода
    textareaTranslation.addEventListener('input', function () {
        // Обновляем текст в данных
        console.log('🔄1🔄🔄🔄🔄🔄🔄 textareaTranslation.value',textareaTranslation.value);
        if (translationSentence) {
            translationSentence.text = textareaTranslation.value;
        }
        // Меняем кнопку воспроизведения в режим создания (кнопка перевода создается позже)
        const audioBtn = row.querySelector(`.btn-col-tr-audio`);
        if (audioBtn) {
            audioBtn.dataset.create = 'true';
            audioBtn.title = 'Создать аудио перевода';
            audioBtn.dataset.state = 'creating';
            setButtonState(audioBtn);
        }
    });

    translationCell.appendChild(textareaTranslation);
    row.appendChild(translationCell);

    // Колонка 6: Аудио перекладу
    const audioCell = document.createElement('td');
    audioCell.className = 'col-play-translation panel-translation panel-create-audio';
    audioCell.dataset.col_id = 'col-tr-audio';
    // Единая кнопка для перевода
    const audioBtnTranslation = document.createElement('button');
    audioBtnTranslation.className = 'audio-btn btn-col-tr-audio audio-btn-table state-ready';
    audioBtnTranslation.innerHTML = '<i data-lucide="play"></i>';
    audioBtnTranslation.dataset.language = currentDictation.language_translation;
    audioBtnTranslation.dataset.fieldName = 'audio';
    // audioBtnTranslation.dataset.create = 'folse';
    state = (!translationSentence || !translationSentence.audio) ? 'creating' : 'ready';
    audioBtnTranslation.dataset.state = state;
    audioBtnTranslation.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnTranslation);
    audioBtnTranslation.title = (!translationSentence || !translationSentence.audio) ? 'Создать аудио перевода' : 'Воспроизвести аудио перевода';
    audioBtnTranslation.addEventListener('click', handleAudioPlayback);
    audioCell.appendChild(audioBtnTranslation);
    row.appendChild(audioCell);

    // Колонка 7: Explanation
    const explanationCell = document.createElement('td');
    explanationCell.className = 'col-explanation';
    explanationCell.dataset.col_id = 'col-explanation';
    explanationCell.style.display = 'none'; // По умолчанию скрыта
    
    const explanationInput = document.createElement('textarea');
    explanationInput.className = 'sentence-text';
    explanationInput.value = (translationSentence && translationSentence.explanation) ? translationSentence.explanation : '';
    explanationInput.dataset.key = key;
    explanationInput.dataset.type = 'explanation';
    explanationInput.placeholder = 'Пояснение';
    
    // Слушатель изменения explanation
    explanationInput.addEventListener('input', function () {
        if (translationSentence) {
            translationSentence.explanation = explanationInput.value;
        }
    });
    
    explanationCell.appendChild(explanationInput);
    row.appendChild(explanationCell);

    // Боковые колонки (правая панель)
    // Колонка AVTO1: Аудио автоперевода (генерировать TTS)
    const generateTtsCell = document.createElement('td');
    generateTtsCell.className = 'col-generate-tts panel-editing-avto panel-create-audio';
    generateTtsCell.dataset.col_id = 'col-or-avto-play';
    // generateTtsCell.style.display = 'none'; // По умолчанию скрыта
    // кнпка генерации/проигрывания аудио автоперевода
    const audioBtnOriginalAvto = document.createElement('button');
    audioBtnOriginalAvto.className = 'audio-btn audio-btn-table state-ready';
    audioBtnOriginalAvto.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginalAvto.dataset.language = currentDictation.language_original;
    audioBtnOriginalAvto.dataset.fieldName = 'audio_avto';
    // audioBtnOriginalAvto.dataset.create === 'folse';
    state = (!originalSentence || !originalSentence.audio_avto) ? 'creating' : 'ready';
    audioBtnOriginalAvto.dataset.state = state;
    audioBtnOriginalAvto.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginalAvto);
    audioBtnOriginalAvto.title = 'Воспроизвести аудио оригинала';
    audioBtnOriginalAvto.addEventListener('click', handleAudioPlayback);
    generateTtsCell.appendChild(audioBtnOriginalAvto);
    row.appendChild(generateTtsCell);

    // Колонка  AVTO2: Применить audio_avto
    const applyCellAvto = document.createElement('td');
    applyCellAvto.className = 'col-apply-avto panel-editing-avto';
    applyCellAvto.dataset.col_id = 'col-or-avto-apply';
    applyCellAvto.dataset.fieldName = 'audio_avto';
    // applyCellAvto.style.display = 'none'; // По умолчанию скрыта
    applyCellAvto.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellAvto.title = 'Применить автоперевод';
    applyCellAvto.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellAvto);

    // Колонка USER1: Start
    const startCell = document.createElement('td');
    startCell.className = 'col-start panel-editing-user';
    startCell.dataset.col_id = 'col-or-user-start';
    // startCell.style.display = 'none'; // По умолчанию скрыта

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.className = 'start-input';
    startInput.step = '0.01';
    startInput.min = '0';
    startInput.value = (originalSentence && originalSentence.start) ? originalSentence.start.toFixed(2) : '0.00';
    startCell.appendChild(startInput);
    row.appendChild(startCell);

    // Колонка USER2: End
    const endCell = document.createElement('td');
    endCell.className = 'col-end panel-editing-user';
    endCell.dataset.col_id = 'col-or-user-end';
    // endCell.style.display = 'none'; // По умолчанию скрыта

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.className = 'end-input';
    endInput.step = '0.01';
    endInput.min = '0';
    endInput.value = (originalSentence && originalSentence.end) ? originalSentence.end.toFixed(2) : '0.00';
    endCell.appendChild(endInput);
    row.appendChild(endCell);

    // Колонка USER3: 🔗 (цепочка)
    const chainCell = document.createElement('td');
    chainCell.className = 'col-chain panel-editing-user';
    chainCell.dataset.col_id = 'col-or-user-chain';
    // chainCell.style.display = 'none'; // По умолчанию скрыта
    chainCell.innerHTML = (originalSentence && originalSentence.chain) ? '<i data-lucide="link"></i>' : '<i data-lucide="unlink"></i>';
    row.appendChild(chainCell);

    // // Колонка Б8: С-ть (создать аудио)
    // const createAudioCell = document.createElement('td');
    // createAudioCell.className = 'col-create-audio';
    // // createAudioCell.style.display = 'none'; // По умолчанию скрыта
    // createAudioCell.textContent = 'С-ть';
    // row.appendChild(createAudioCell);

    // Колонка USER4: Воспроизвести аудио
    const playAudioUserCell = document.createElement('td');
    playAudioUserCell.className = 'col-play-audio panel-editing-user panel-create-audio';
    playAudioUserCell.dataset.col_id = 'col-or-user-play';
    // playAudioCell.style.display = 'none'; // По умолчанию скрыта
    // кнопка генерации/проигрывания аудио автоперевода
    const audioBtnOriginalUser = document.createElement('button');
    audioBtnOriginalUser.className = 'audio-btn audio-btn-table state-ready';
    audioBtnOriginalUser.innerHTML = '<i data-lucide="play"></i>';
    audioBtnOriginalUser.dataset.language = currentDictation.language_original;
    audioBtnOriginalUser.dataset.fieldName = 'audio_user';
    // audioBtnOriginalUser.dataset.create = 'folse';
    state = (!originalSentence || !originalSentence.audio_user) ? 'creating' : 'ready';
    audioBtnOriginalUser.dataset.state = state;
    audioBtnOriginalUser.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnOriginalUser);
    audioBtnOriginalUser.title = 'Воспроизвести аудио оригинала';
    audioBtnOriginalUser.addEventListener('click', handleAudioPlayback);
    playAudioUserCell.appendChild(audioBtnOriginalUser);
    row.appendChild(playAudioUserCell);

    // Колонка  USER5: Применить audio_user
    const applyCellUser = document.createElement('td');
    applyCellUser.className = 'col-apply-user panel-editing-user';
    applyCellUser.dataset.col_id = 'col-or-user-apply';
    applyCellUser.dataset.fieldName = 'audio_user';
    // applyCellUser.style.display = 'none'; // По умолчанию скрыта
    applyCellUser.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellUser.title = 'Применить запись пользователя';
    applyCellUser.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellUser);


    // панель микрофона ------------------------------------------------------------

    // Колонка MIC1: Аудио автоперевода (генерировать TTS)
    const generateAudioMicCell = document.createElement('td');
    generateAudioMicCell.className = 'col-play-audio panel-editing-mic panel-create-audio';
    generateAudioMicCell.dataset.col_id = 'col-or-mic-play';
    // generateTtsCell.style.display = 'none'; // По умолчанию скрыта
    // кнпка генерации/проигрывания аудио записи с микрофона
    const audioBtnAudioMic = document.createElement('button');
    audioBtnAudioMic.className = 'audio-btn audio-btn-table state-ready';
    audioBtnAudioMic.innerHTML = '<i data-lucide="play"></i>';
    audioBtnAudioMic.dataset.language = currentDictation.language_original;
    audioBtnAudioMic.dataset.fieldName = 'audio_mic';
    // audioBtnAudioMic.dataset.create = 'folse';
    state = (!originalSentence || !originalSentence.audio_mic) ? 'creating_mic' : 'ready';
    audioBtnAudioMic.dataset.state = state;
    audioBtnAudioMic.dataset.originalState = state; // Сохраняем исходное состояние один раз
    setButtonState(audioBtnAudioMic);
    audioBtnAudioMic.title = 'Воспроизвести аудио записи с микрофона';
    audioBtnAudioMic.addEventListener('click', handleAudioPlayback);
    generateAudioMicCell.appendChild(audioBtnAudioMic);
    row.appendChild(generateAudioMicCell);

    // Колонка  MIC2: Применить audio_avto
    const applyCellMic = document.createElement('td');
    applyCellMic.className = 'col-apply-avto panel-editing-mic';
    applyCellMic.dataset.col_id = 'col-or-mic-apply';
    applyCellMic.dataset.fieldName = 'audio_mic';
    // applyCellMic.style.display = 'none'; // По умолчанию скрыта
    applyCellMic.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
    applyCellMic.title = 'Применить запись с микрофона';
    applyCellMic.addEventListener('click', handleApplyAudioSource);
    row.appendChild(applyCellMic);

    // // Колонка для компенсации ширины скроллбара
    // const scrollingCell = document.createElement('td');
    // scrollingCell.className = 'col-scrolling';
    // row.appendChild(scrollingCell);

    // Настраиваем обработчики для полей ввода
    setupInputHandlers(row);

    // Настраиваем обработчики для строки
    setupRowHandlers(row);

    return row;
}

/**
 * Заполнить select опциями спикеров (текст — номер с двоеточием)
 */
function buildSpeakerOptionsForSelect(selectEl, selectedId) { /* deprecated for custom dropdown */ }

/**
 * Построить выпадающий список спикеров в ячейке
 * label: "{id:}" и chevron; при выборе сохраняется только код (с двоеточием) через коллбек
 */
function buildSpeakerDropdown(cellEl, selectedId, onSelect) {
    cellEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'speaker-dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speaker-dropdown-btn';
    const currentLabel = selectedId ? `${selectedId}:` : '';
    button.innerHTML = `<span class="speaker-code">${currentLabel}</span><i data-lucide="chevron-down"></i>`;

    const menu = document.createElement('div');
    menu.className = 'speaker-dropdown-menu';

    const entries = Object.entries(currentDictation.speakers || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    // Пустой вариант
    const emptyItem = document.createElement('div');
    emptyItem.className = 'speaker-option';
    emptyItem.textContent = '';
    emptyItem.addEventListener('click', () => {
        button.querySelector('.speaker-code').textContent = '';
        menu.classList.remove('open');
        if (typeof onSelect === 'function') onSelect('');
    });
    menu.appendChild(emptyItem);

    entries.forEach(([id, name]) => {
        const item = document.createElement('div');
        item.className = 'speaker-option';
        item.textContent = `${id}: ${name}`;
        item.title = name;
        item.dataset.id = id;
        item.addEventListener('click', () => {
            button.querySelector('.speaker-code').textContent = `${id}:`;
            menu.classList.remove('open');
            if (typeof onSelect === 'function') onSelect(`${id}:`);
        });
        menu.appendChild(item);
    });

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });

    // Закрытие при клике вне
    document.addEventListener('click', () => {
        menu.classList.remove('open');
    });

    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    cellEl.appendChild(wrapper);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Обновить опции спикеров во всех строках таблицы (после изменения списка спикеров)
 */
function refreshAllSpeakerSelectOptions() {
    // Обновляем пункты в кастомных выпадающих списках
    document.querySelectorAll('td.col-speaker').forEach(td => {
        const currentCode = td.querySelector('.speaker-code')?.textContent || '';
        const selectedId = currentCode ? currentCode.replace(':', '') : '';
        buildSpeakerDropdown(td, selectedId, (newIdWithColon) => {
            const row = td.closest('tr');
            const key = row?.dataset.key;
            if (!key) return;
            const sentence = (workingData.original.sentences || []).find(s => s.key === key);
            if (sentence) {
                const cleanId = newIdWithColon ? String(newIdWithColon).replace(':', '') : '';
                sentence.speaker = cleanId || undefined;
            }
        });
    });
}

/**
 * Создать автоперевод для поля перевода
 */
async function createAutoTranslation(originalText, translationTextarea, key) {
    try {
        console.log('🔄 Создание автоперевода для ключа:', key);

        // Используем функцию перевода для редактирования
        const translatedText = await translateTextForEditing(
            originalText,
            currentDictation.language_original,
            currentDictation.language_translation
        );

        // Заполняем поле перевода
        translationTextarea.value = translatedText;

        // Обновляем данные в workingData
        if (workingData && workingData.translation) {
            let translationSentence = workingData.translation.sentences.find(s => s.key === key);
            if (!translationSentence) {
                // Создаем новое предложение перевода, если его нет
                translationSentence = {
                    key: key,
                    text: translatedText,
                    audio: '',
                    audio_avto: '',
                    audio_user: '',
                    audio_mic: '',
                    start: 0,
                    end: 0,
                    chain: false
                };
                workingData.translation.sentences.push(translationSentence);
            } else {
                // Обновляем существующее предложение
                translationSentence.text = translatedText;
            }
        }

        // Обновляем текст оригинала в workingData (если есть)
        if (workingData && workingData.original) {
            let originalSentence = workingData.original.sentences.find(s => s.key === key);
            if (originalSentence) {
                originalSentence.text = originalText;
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при переводе предложения:', error);
    }
}

// ==================== Автоматический перевод названия =====================

function setupTitleTranslationHandler() {
    const titleInput = document.getElementById('title');
    const translationTitleInput = document.getElementById('title_translation');


    // Обработчик для автоматического перевода по Enter
    titleInput.addEventListener('keydown', async function (event) {
        // Переводим только при нажатии Enter
        if (event.key === 'Enter') {
            event.preventDefault();

            const originalTitle = titleInput.value.trim();
            if (!originalTitle || !translationTitleInput) {
                console.log('❌ Нет текста или поля перевода');
                return;
            }

            try {
                // Используем функцию перевода для редактирования
                const translatedTitle = await translateTextForEditing(
                    originalTitle,
                    currentDictation.language_original,
                    currentDictation.language_translation
                );

                translationTitleInput.value = translatedTitle;
                // Обновляем title в workingData после перевода
                updateTitlesInWorkingData();
            } catch (error) {
                console.error('❌ Ошибка при переводе названия:', error);
            }
        }
    });

    // Обработчики для обновления workingData при изменении полей
    titleInput.addEventListener('input', updateTitlesInWorkingData);
    if (translationTitleInput) {
        translationTitleInput.addEventListener('input', updateTitlesInWorkingData);
    }
}

function updateTitlesInWorkingData() {
    const titleInput = document.getElementById('title');
    const translationTitleInput = document.getElementById('title_translation');

    if (!titleInput || !workingData) return;

    // Обновляем title для оригинального языка
    if (workingData.original) {
        workingData.original.title = titleInput.value || 'Диктант';
    }

    // Обновляем title для языка перевода
    if (workingData.translation && translationTitleInput) {
        workingData.translation.title = translationTitleInput.value || 'Перевод';
    }
}

// ============================================================================
// НОВАЯ АРХИТЕКТУРА - СТАРТОВОЕ МОДАЛЬНОЕ ОКНО
// ===========================================================================

/**
 * Инициализация волны аудио
 */
async function initWaveform(audioUrl) {
    if (audioUrl) lastAudioUrl = audioUrl;

    // Проверяем, что контейнер видим
    const waveformContainer = document.getElementById('audioWaveform');
    if (!waveformContainer) {
        console.warn('Контейнер audioWaveform не найден');
        return;
    }

    // Проверяем, что контейнер имеет размеры
    if (waveformContainer.offsetWidth === 0 || waveformContainer.offsetHeight === 0) {
        console.warn('Контейнер audioWaveform не видим, принудительно устанавливаем размеры');
        // Принудительно устанавливаем размеры
        waveformContainer.style.width = '100%';
        waveformContainer.style.height = '100px';
        waveformContainer.style.minHeight = '100px';

        // Если размеры все еще 0, откладываем инициализацию
        if (waveformContainer.offsetWidth === 0 || waveformContainer.offsetHeight === 0) {
            console.warn('Не удалось установить размеры, откладываем инициализацию');
            return;
        }
    }

    // Проверяем, что WaveformCanvas загружен
    if (typeof WaveformCanvas === 'undefined') {
        console.error('❌ WaveformCanvas не загружен!');
        return;
    }

    if (waveformCanvas) {
        waveformCanvas.destroy();
    }

    try {
        // Создаем новый экземпляр WaveformCanvas
        // Класс сам определяет цвета из CSS переменных
        waveformCanvas = new WaveformCanvas(waveformContainer);
        window.waveformCanvas = waveformCanvas; // Сохраняем в window для глобального доступа
        // Подключаем волну к аудио-менеджеру для синхронизации плейхеда
        if (window.AudioManager && typeof window.AudioManager.setWaveformCanvas === 'function') {
            window.AudioManager.setWaveformCanvas(waveformCanvas);
        } else if (typeof audioManager !== 'undefined' && audioManager && typeof audioManager.setWaveformCanvas === 'function') {
            audioManager.setWaveformCanvas(waveformCanvas);
        }

        // WaveformCanvas НЕ управляет состоянием кнопки - это делает плеер
        // waveformCanvas.onPlaybackEnd(() => { ... }); // Убрано - плеер сам управляет кнопкой

        // Проверяем, есть ли уже загруженное аудио для этого файла
        const audioFileName = audioUrl.split('/').pop();
        const language = currentDictation.language_original;
        let audioElement = null;

        try {
            if (window.AudioManager && AudioManager.players) {
                const playerKey = `${audioFileName}_${language}`;
                if (AudioManager.players[playerKey] && AudioManager.players[playerKey].src) {
                    audioElement = AudioManager.players[playerKey];
                }
            }
        } catch (e) {
            // безопасно игнорируем отсутствие AudioManager.players
        }

        // Если нашли загруженное аудио, используем его, иначе загружаем по URL с cache-busting
        if (audioElement) {
            await waveformCanvas.loadAudioFromElement(audioElement);
        } else {
            const cacheBusted = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
            await waveformCanvas.loadAudio(cacheBusted);
        }


        // Получаем длительность аудио
        const duration = waveformCanvas.getDuration();
        const roundedDuration = Math.floor(duration * 100) / 100;

        // Настраиваем callback для обновления региона
        setupWaveformRegionCallback();
        
        // Устанавливаем callback для окончания воспроизведения (когда волна останавливает воспроизведение при достижении конца региона)
        waveformCanvas.onPlaybackEnd(() => {
            const audioPlayBtn = document.getElementById('audioPlayBtn');
            if (audioPlayBtn && (audioPlayBtn.dataset.state === 'playing-shared' || audioPlayBtn.dataset.state === 'playing')) {
                const originalState = audioPlayBtn.dataset.originalState || 'ready-shared';
                audioPlayBtn.dataset.state = originalState;
                if (typeof setButtonState === 'function') {
                    setButtonState(audioPlayBtn, originalState);
                }
                console.log('✅ Состояние кнопки под волной обновлено в:', originalState);
            }
        });

        // Восстанавливаем регион в зависимости от текущего режима
        // Устанавливаем флаг, чтобы не устанавливать 'creating' при программном обновлении
        isProgrammaticRegionUpdate = true;
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        
        if (currentMode === 'sentence') {
            // В режиме "sentence" устанавливаем регион по текущей выбранной строке
            setRegionToSelectedSentence();
        } else if (currentMode === 'full') {
            // В режиме "full" устанавливаем регион по сохраненным границам
            setRegionToFullShared();
        } else {
            // Для других режимов (mic, auto) устанавливаем регион по умолчанию на всю длительность
            waveformCanvas.setRegion(0, roundedDuration);
            if (startInput) startInput.value = '0.00';
            if (endInput) endInput.value = roundedDuration.toFixed(2);
        }
        // Сбрасываем флаг после небольшой задержки, чтобы callback успел сработать
        setTimeout(() => {
            isProgrammaticRegionUpdate = false;
        }, 100);

    } catch (error) {
        console.error('❌ Ошибка инициализации WaveformCanvas:', error);
    }
}

/**
 * Установить callback для обновления региона волны
 */
// Флаг для предотвращения установки 'creating' при программном обновлении региона
let isProgrammaticRegionUpdate = false;

function setupWaveformRegionCallback() {
    const waveformCanvas = window.waveformCanvas;
    if (!waveformCanvas) return;

    waveformCanvas.onRegionUpdate((region) => {
        if (startInput) startInput.value = region.start.toFixed(2);
        if (endInput) endInput.value = region.end.toFixed(2);

        // Обновляем значения в workingData
        // Обновляем границы ТОЛЬКО для режима "общий файл"
        const audioModeEl = document.querySelector('input[name="audioMode"]:checked');
        const currentMode = audioModeEl ? audioModeEl.value : 'full';
        if (currentMode === 'full') {
            if (workingData && workingData.original) {
                workingData.original.audio_user_shared_start = region.start;
                workingData.original.audio_user_shared_end = region.end;
            }
            if (workingData && workingData.translation) {
                workingData.translation.audio_user_shared_start = region.start;
                workingData.translation.audio_user_shared_end = region.end;
            }
        } else if (currentMode === 'sentence') {
            // В режиме "sentence" обновляем поля в таблице и устанавливаем состояние 'creating'
            // НО только если это НЕ программное обновление (например, при инициализации или загрузке)
            const selectedRow = document.querySelector('#sentences-table tbody tr.selected');
            if (selectedRow && !isProgrammaticRegionUpdate) {
                const key = selectedRow.dataset.key;
                
                // Получаем текущие значения для сравнения
                const rowStartInput = selectedRow.querySelector('.start-input');
                const rowEndInput = selectedRow.querySelector('.end-input');
                const oldStart = rowStartInput ? parseFloat(rowStartInput.value) : 0;
                const oldEnd = rowEndInput ? parseFloat(rowEndInput.value) : 0;
                
                // Обновляем поля start/end в таблице
                if (rowStartInput) rowStartInput.value = region.start.toFixed(2);
                if (rowEndInput) rowEndInput.value = region.end.toFixed(2);
                
                // Обновляем данные в workingData
                const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
                if (sentenceIndex !== -1) {
                    workingData.original.sentences[sentenceIndex].start = region.start;
                    workingData.original.sentences[sentenceIndex].end = region.end;
                }
                
                // Устанавливаем состояние 'creating' ТОЛЬКО если значения реально изменились
                const startChanged = Math.abs(oldStart - region.start) > 0.01;
                const endChanged = Math.abs(oldEnd - region.end) > 0.01;
                
                if (startChanged || endChanged) {
                    // Устанавливаем состояние 'creating' для audioBtnOriginalUser
                    const audioBtnOriginalUser = selectedRow.querySelector('button[data-field-name="audio_user"]');
                    if (audioBtnOriginalUser) {
                        // НЕ устанавливаем 'creating' если кнопка уже играет
                        const currentState = audioBtnOriginalUser.dataset.state;
                        // Также проверяем, не играет ли сейчас какой-то другой аудио (через audioManager)
                        const audioManagerButton = window.audioManager?.currentButton;
                        const isThisButtonPlaying = audioManagerButton === audioBtnOriginalUser;
                        
                        if (currentState === 'playing' || isThisButtonPlaying) {
                            // Не меняем состояние во время воспроизведения, но продолжаем обновление цепочки
                        } else {
                            audioBtnOriginalUser.dataset.state = 'creating';
                            setButtonState(audioBtnOriginalUser);
                            updateEditAllCreatingButtonVisibility();
                        }
                    }
                    
                    // Запускаем логику цепочки для обновления соседних строк
                    // НО только если кнопка не играет сейчас
                    if (key) {
                        const shouldUpdateChain = !audioBtnOriginalUser || 
                                                 (audioBtnOriginalUser.dataset.state !== 'playing' && 
                                                  window.audioManager?.currentButton !== audioBtnOriginalUser);
                        
                        if (shouldUpdateChain) {
                            // Обновляем цепочку для start и end, но только если они изменились
                            if (endChanged) {
                                updateChain(key, 'end', region.end.toFixed(2));
                            }
                            if (startChanged) {
                                updateChain(key, 'start', region.start.toFixed(2));
                            }
                        }
                    }
                }
            } else if (selectedRow) {
                // Программное обновление - просто синхронизируем значения без установки 'creating'
                const key = selectedRow.dataset.key;
                const rowStartInput = selectedRow.querySelector('.start-input');
                const rowEndInput = selectedRow.querySelector('.end-input');
                if (rowStartInput) rowStartInput.value = region.start.toFixed(2);
                if (rowEndInput) rowEndInput.value = region.end.toFixed(2);
                
                // Обновляем данные в workingData
                const sentenceIndex = workingData.original.sentences.findIndex(s => s.key === key);
                if (sentenceIndex !== -1) {
                    workingData.original.sentences[sentenceIndex].start = region.start;
                    workingData.original.sentences[sentenceIndex].end = region.end;
                }
            }
        }

        // Отмечаем что диктант изменен
        currentDictation.isSaved = false;
    });
}

// Заглушки удалены - используются реальные функции showLoadingIndicator() и hideLoadingIndicator()

/**
 * Управление текущим аудио в зависимости от режима
 * волна и информация об аудио
 */
let currentAudioFileName = "";
function updateCurrentAudioWave() {
    // читаем режим радио из DOM
    const audioMode = document.querySelector('input[name="audioMode"]:checked');
    const currentMode = audioMode ? audioMode.value : 'full';


    let shouldRedrawWaveform = false; // флаг для перерисовки волны
    let audioFileName = "";

    switch (currentMode) {
        case 'full':
            // Режим "Отображать весь файл"
            audioFileName = workingData?.original?.audio_user_shared;
            // Режим "Общий файл" - используем audio_user_shared
            if (audioFileName) {
                //currentAudioFile = workingData.original.audio_user_shared;
                shouldRedrawWaveform = true;
            }

            break;
        case 'sentence':
            // Режим "Текущее предложение" - скрыта
            audioFileName = workingData?.original?.audio_user_shared;
            // Режим "Общий файл" - используем audio_user_shared
            if (audioFileName) {
                //currentAudioFile = workingData.original.audio_user_shared;
                shouldRedrawWaveform = true;
            }

            break;
        case 'mic':
            // Режим "Микрофон"
            const currentRow = document.querySelector('#sentences-table tbody tr.selected');
            if (currentRow) {
                const key = currentRow.dataset.key;
                const sentence = workingData.original.sentences.find(s => s.key === key);
                audioFileName = sentence?.audio_mic;
                if (audioFileName) {
                    // currentAudioFile = sentence.audio_mic;
                    shouldRedrawWaveform = true;
                }
            }

            break;
        case 'auto':
            // Режим "Автозаполнение" - иконка молоточка
            shouldRedrawWaveform = false;

            break;
    }

    // Обновляем информацию о текущем аудио
    // Перерисовываем волну только если изменилось текущее аудио
    if (audioFileName !== "") {
        if (shouldRedrawWaveform) {
            if (currentAudioFileName !== audioFileName) {
                currentAudioFileName = audioFileName;
                currentAudioInfo.textContent = `Текущее аудио: ${audioFileName}`;
                if (window.waveformCanvas) {
                    window.waveformCanvas.show();
                }
                waveformContainer.classList.remove('mode-auto', 'mode-full', 'mode-sentence', 'mode-mic');
                // Добавляем соответствующий класс для цвета волны
                switch (currentMode) {
                    case 'full':
                        waveformContainer.classList.add('mode-full');
                        break;
                    case 'sentence':
                        waveformContainer.classList.add('mode-sentence');
                        break;
                    case 'mic':
                        waveformContainer.classList.add('mode-mic');
                        break;
                    case 'auto':
                        waveformContainer.classList.add('mode-auto');
                        break;
                }
                loadWaveformForCurrentAudio(currentAudioFileName);
            }
        } else {
            // Скрываем волну если нет аудио
            if (window.waveformCanvas) {
                window.waveformCanvas.hide();
            }
        }
    } else {
        // Скрываем волну если нет аудио
        if (window.waveformCanvas) {
            window.waveformCanvas.hide();
        }
    }
}



/**
 * Загрузка волны для текущего аудио
 */
function loadWaveformForCurrentAudio(audioFile) {

    if (!audioFile) return;

    const audioUrl = `${getAudioPath(currentDictation.language_original)}/${audioFile}`;

    loadWaveformForFile(audioUrl);
}

/**
 * Универсальный обработчик для кнопок "Применить" (авто/пользователь/мик)
 * Копирует значение из поля-источника в главное поле "audio"
 */
function handleApplyAudioSource(event) {
    // Получаем кнопку, на которую кликнули
    const button = event.target.closest('td[data-field-name]');
    if (!button) return;

    // Извлекаем данные из атрибутов
    const sentenceKey = button.closest('tr').dataset.key;
    const sourceField = button.dataset.fieldName;

    console.log(`🔄 Применяем аудио: ${sentenceKey} -> ${sourceField}`);

    // Находим предложение в workingData
    const sentence = workingData.original.sentences.find(s => s.key === sentenceKey);
    if (!sentence) {
        console.error(`❌ Предложение с ключом ${sentenceKey} не найдено`);
        return;
    }

    // Получаем значение из поля-источника
    const sourceValue = sentence[sourceField];
    if (!sourceValue || sourceValue.trim() === '') {
        console.log(`⚠️ Поле ${sourceField} пустое, ничего не копируем`);
        return;
    }

    // Копируем в главное поле "audio"
    sentence.audio = sourceValue;

    // Обновляем визуальные индикаторы (галочки) для всех кнопок "Применить" в этой строке
    updateApplyButtonsIndicators(sentenceKey, sourceField);
}

/**
 * Обновляет визуальные индикаторы (галочки) для кнопок "Применить"
 * Показывает галочку только на активной кнопке
 */
function updateApplyButtonsIndicators(sentenceKey, activeSourceField) {
    // Находим строку таблицы
    const row = document.querySelector(`tr[data-key="${sentenceKey}"]`);
    if (!row) return;

    // Находим все кнопки "Применить" в этой строке по col_id
    const applyButtons = row.querySelectorAll('td[data-col-id*="-apply"]');

    applyButtons.forEach(button => {
        const fieldName = button.dataset.fieldName;

        if (fieldName === activeSourceField) {
            // Активная кнопка - показываем галочку
            button.innerHTML = '<i data-lucide="check"></i>';
            button.style.color = '#28a745'; // Зеленый цвет
            button.title = `Активно: ${getFieldDisplayName(fieldName)}`;
        } else {
            // Неактивные кнопки - показываем стрелку
            button.innerHTML = '<i data-lucide="arrow-big-left-dash"></i>';
            button.style.color = ''; // Сброс цвета
            button.title = `Применить ${getFieldDisplayName(fieldName)}`;
        }
    });

    // Пересоздаем иконки Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Возвращает отображаемое имя поля
 */
function getFieldDisplayName(fieldName) {
    const names = {
        'audio_avto': 'автоперевод',
        'audio_user': 'запись пользователя',
        'audio_mic': 'запись с микрофона'
    };
    return names[fieldName] || fieldName;
}