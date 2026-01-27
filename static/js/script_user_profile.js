let UM;
let language_selector;
let originalData = {};
let hasUnsavedChanges = false;
let isSavingProfile = false;

// Глобальные переменные для обрезки изображений
let cropper = null;
let croppedImageBlob = null;


// Инициализация при загрузке страницы - ТОЛЬКО ОДИН ОБРАБОТЧИК
document.addEventListener('DOMContentLoaded', async function () {
    UM = new UserManager();

    try {
        await UM.init();
        if (!UM.isAuthenticated()) {
            // Показываем сообщение вместо редиректа
            showError('Пожалуйста, войдите в систему');
            // Скрываем форму профиля
            document.querySelector('.profile-container').style.display = 'none';
            return;
        }

        loadUserData();
        initializeLanguageSelector();
        initializeLanguageModelsSelector();
        initializeAudioSettings();
        setupFormListeners();
        initializeTopbarControls();

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки профиля: ' + error.message);
    }
});

// Загрузка данных пользователя
function loadUserData() {
    const userData = UM.userData;
    // console.log('userData:', userData);
    originalData = {
        username: userData.username,
        email: userData.email,
        native_language: userData.native_language || 'ru',
        learning_languages: userData.learning_languages || ['en'],
        current_learning: userData.current_learning || userData.learning_languages?.[0] || 'en',
        avatar: userData.avatar || {},
        // Сохраняем настройки аудио в originalData
        audio_start: userData.audio_start || '',
        audio_typo: userData.audio_typo || '',
        audio_success: userData.audio_success || '',
        audio_repeats: userData.audio_repeats || 3
    };

    document.getElementById('username').value = originalData.username;
    document.getElementById('email').value = originalData.email;
    updateAvatarDisplay(originalData.avatar);
    setUnsavedState(false);
}


// Инициализация языкового селектора (только выбор родного и изучаемого языка)
function initializeLanguageSelector() {
    const container = document.getElementById('languageSelectorContainer');
    
    if (!container) {
        console.error('❌ Контейнер для LanguageSelector не найден');
        return;
    }

    try {
        const languageData = window.LanguageManager.getLanguageData();

        languageSelector = new LanguageSelector({
            container: container,
            mode: 'registration', // Режим как при регистрации - только родной и изучаемый язык
            nativeLanguage: originalData.native_language,
            learningLanguages: originalData.learning_languages,
            currentLearning: originalData.current_learning,
            languageData: languageData,
            onLanguageChange: function (data) {
                checkForChanges();
            }
        });
        
        // Делаем глобальной для доступа из других селекторов
        window.languageSelector = languageSelector;

    } catch (error) {
        console.error('❌ Ошибка инициализации LanguageSelector:', error);
        container.innerHTML = `
            <div style="padding: 20px; background: #f8f9fa; border-radius: 5px; text-align: center;">
                <p style="color: #dc3545;">Ошибка загрузки языковых настроек</p>
            </div>
        `;
    }
}

// Инициализация селектора языковых моделей (только модели, без выбора языков)
let languageModelsSelector = null;

function initializeLanguageModelsSelector() {
    const container = document.getElementById('languageSelectorModelsContainer');
    
    if (!container) {
        console.error('❌ Контейнер для LanguageModelsSelector не найден');
        return;
    }

    try {
        const languageData = window.LanguageManager.getLanguageData();

        languageModelsSelector = new LanguageSelector({
            container: container,
            mode: 'models-only', // Новый режим - только модели, без выбора языков
            nativeLanguage: originalData.native_language,
            learningLanguages: originalData.learning_languages,
            currentLearning: originalData.current_learning,
            languageData: languageData,
            onLanguageChange: function (data) {
                // Модели не влияют на сохранение профиля
            }
        });
        
        // Делаем глобальной для доступа из других селекторов
        window.languageModelsSelector = languageModelsSelector;

    } catch (error) {
        console.error('❌ Ошибка инициализации LanguageModelsSelector:', error);
        container.innerHTML = `
            <div style="padding: 20px; background: #f8f9fa; border-radius: 5px; text-align: center;">
                <p style="color: #dc3545;">Ошибка загрузки настроек моделей</p>
            </div>
        `;
    }
}

// Инициализация панели настроек аудио
let audioSettingsPanel = null;

function initializeAudioSettings() {
    const container = document.getElementById('userAudioSettingsContainer');
    
    if (!container) {
        console.error('❌ Контейнер для AudioSettingsPanel не найден');
        return;
    }

    try {
        // Загружаем настройки пользователя из settings_json (приоритет) или из отдельных полей
        let userSettings = {};
        
        if (UM.userData.settings_json) {
            try {
                const settings = JSON.parse(UM.userData.settings_json);
                const audioSettings = settings.audio || {};
                userSettings = {
                    audio_start: audioSettings.start,
                    audio_typo: audioSettings.typo,
                    audio_success: audioSettings.success,
                    audio_repeats: audioSettings.repeats,
                    without_entering_text: audioSettings.without_entering_text,
                    show_text: audioSettings.show_text
                };
            } catch (e) {
                console.warn('Ошибка парсинга settings_json:', e);
                // Fallback на отдельные поля
                userSettings = {
                    audio_start: UM.userData.audio_start,
                    audio_typo: UM.userData.audio_typo,
                    audio_success: UM.userData.audio_success,
                    audio_repeats: UM.userData.audio_repeats
                };
            }
        } else {
            // Используем отдельные поля (обратная совместимость)
            userSettings = {
                audio_start: UM.userData.audio_start,
                audio_typo: UM.userData.audio_typo,
                audio_success: UM.userData.audio_success,
                audio_repeats: UM.userData.audio_repeats
            };
        }

        audioSettingsPanel = new AudioSettingsPanel({
            container: container,
            mode: 'user-settings',
            showExplanations: true,
            onSettingsChange: (settings) => {
                checkForChanges();
            }
        });

        audioSettingsPanel.init(userSettings);

    } catch (error) {
        console.error('❌ Ошибка инициализации AudioSettingsPanel:', error);
        container.innerHTML = `
            <div style="padding: 20px; background: #f8f9fa; border-radius: 5px; text-align: center;">
                <p style="color: #dc3545;">Ошибка загрузки настроек аудио</p>
            </div>
        `;
    }
}


// Настройка отслеживания изменений в форме
function setupFormListeners() {
    const inputs = ['username', 'password'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', checkForChanges);
    });
}

function initializeTopbarControls() {
    const avatarButton = document.getElementById('avatarUploadButton');
    const avatarInput = document.getElementById('avatarUpload');
    if (avatarButton && avatarInput) {
        avatarButton.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', handleAvatarFileSelection);
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

    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            await handleSave();
        });
    }

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
            proceedToExit();
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
}

function handleAvatarFileSelection(event) {
    const input = event.target;
    if (!input.files || input.files.length === 0) {
        return;
    }
    
    const file = input.files[0];
    
    // Проверяем что это изображение
    if (!file.type.startsWith('image/')) {
        showError('Выберите изображение');
        input.value = '';
        return;
    }

    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showError('Размер файла не должен превышать 5MB');
        input.value = '';
        return;
    }

    // Открываем модальное окно обрезки
    const reader = new FileReader();
    reader.onload = (e) => {
        openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
}


// Проверка изменений данных
function checkForChanges() {
    const currentValues = getCurrentFormValues();

    const hasChanges =
        currentValues.username !== originalData.username ||
        currentValues.password !== '' ||
        currentValues.native_language !== originalData.native_language ||
        JSON.stringify(currentValues.learning_languages) !== JSON.stringify(originalData.learning_languages) ||
        currentValues.current_learning !== originalData.current_learning ||
        currentValues.audio_start !== (originalData.audio_start || '') ||
        currentValues.audio_typo !== (originalData.audio_typo || '') ||
        currentValues.audio_success !== (originalData.audio_success || '') ||
        currentValues.audio_repeats !== (originalData.audio_repeats || 3);

    setUnsavedState(hasChanges);
}

function setUnsavedState(state) {
    hasUnsavedChanges = state;

    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        if (isSavingProfile) {
            saveButton.disabled = true;
        } else {
            saveButton.disabled = !state;
        }
    }

    const unsavedStar = document.getElementById('unsavedStar');
    if (unsavedStar) {
        unsavedStar.style.display = state ? 'inline-flex' : 'none';
    }

    if (state) {
        window.addEventListener('beforeunload', beforeUnloadHandler);
    } else {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    }
}

function beforeUnloadHandler(event) {
    event.preventDefault();
    event.returnValue = '';
}

// Получение текущих значений формы
function getCurrentFormValues() {
    const languageValues = languageSelector ? languageSelector.getValues() : {
        nativeLanguage: originalData.native_language,
        learningLanguages: originalData.learning_languages,
        currentLearning: originalData.current_learning
    };

    // Получаем настройки аудио из панели
    let audioSettings = {
        audio_start: '',
        audio_typo: '',
        audio_success: '',
        audio_repeats: 3
    };
    
    if (audioSettingsPanel) {
        const settings = audioSettingsPanel.getSettings();
        audioSettings.audio_start = settings.start || '';
        audioSettings.audio_typo = settings.typo || '';
        audioSettings.audio_success = settings.success || '';
        audioSettings.audio_repeats = settings.repeats || 3;
    }

    return {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        native_language: languageValues.nativeLanguage,
        learning_languages: languageValues.learningLanguages,
        current_learning: languageValues.currentLearning,
        audio_start: audioSettings.audio_start,
        audio_typo: audioSettings.audio_typo,
        audio_success: audioSettings.audio_success,
        audio_repeats: audioSettings.audio_repeats
    };
}

// Функции для обрезки изображения
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
        const avatarInput = document.getElementById("avatarUpload");
        if (avatarInput) {
            avatarInput.value = '';
        }
    }
}

async function handleCropConfirm() {
    if (!cropper) return;
    
    // Получаем canvas с обрезанным изображением для большого аватара (120x120)
    const canvas = cropper.getCroppedCanvas({
        width: 120,
        height: 120,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });
    
    if (!canvas) {
        showError('Ошибка обрезки изображения');
        return;
    }
    
    // Конвертируем canvas в blob (webp)
    canvas.toBlob(async (blob) => {
        if (!blob) {
            showError('Ошибка создания изображения');
            return;
        }
        
        croppedImageBlob = blob;
        
        // Показываем preview в элементах аватара
        const avatarLarge = document.getElementById("avatarLarge");
        const avatarSmall = document.getElementById("avatarSmall");
        if (avatarLarge || avatarSmall) {
            const url = URL.createObjectURL(blob);
            if (avatarLarge) avatarLarge.src = url;
            if (avatarSmall) avatarSmall.src = url;
        }
        
        // Отправляем обрезанное изображение на сервер
        try {
            showInfo('Загружаем аватар...');
            const response = await UM.uploadAvatar(blob);
            
            // Обновляем данные из текущего пользователя (где теперь должен быть аватар)
            originalData.avatar = UM.userData.avatar || {};
            updateAvatarDisplay(originalData.avatar);
            
            // НЕ обновляем topbar здесь - пользователь может передумать сохранять
            // Topbar обновится только после сохранения профиля через кнопку "Сохранить"
            
            showSuccess('Аватар успешно загружен! Для применения изменений нажмите "Сохранить"');
            
            // Отмечаем, что есть несохраненные изменения (аватар уже загружен, но нужно сохранить)
            checkForChanges();
            
            // Закрываем crop modal БЕЗ очистки blob
            closeCropModal(false);
            
            // Очищаем input
            const avatarInput = document.getElementById("avatarUpload");
            if (avatarInput) {
                avatarInput.value = '';
            }
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            showError('Ошибка загрузки аватара: ' + error.message);
        }
    }, 'image/webp', 0.9);
}

// Загрузка аватара - РЕАЛЬНАЯ отправка на сервер (старая функция, теперь не используется напрямую)
async function uploadAvatar() {
    // Эта функция больше не используется напрямую - обрезка происходит через handleCropConfirm
    // Оставлена для совместимости, если где-то вызывается напрямую
    const fileInput = document.getElementById('avatarUpload');
    const file = fileInput.files[0];

    if (!file) {
        showError('Выберите файл для загрузки');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showError('Выберите изображение');
        fileInput.value = '';
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
        showError('Размер файла не должен превышать 5MB');
        fileInput.value = '';
        return;
    }

    // Открываем модальное окно обрезки
    const reader = new FileReader();
    reader.onload = (e) => {
        openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
}

// Обновление отображения аватара
function updateAvatarDisplay(avatar) {
    const avatarLarge = document.getElementById('avatarLarge');
    const avatarSmall = document.getElementById('avatarSmall');

    // console.log('Обновление аватара:', avatar);

    if (avatar && (avatar.large || avatar.original)) {
        // Используем large, medium или original в зависимости от того, что есть
        const largeUrl = avatar.large || avatar.medium || avatar.original;
        const smallUrl = avatar.small || avatar.medium || avatar.original || largeUrl;
        
        // Добавляем timestamp для избежания кеширования
        const timestamp = new Date().getTime();
        const largeUrlWithTimestamp = largeUrl + (largeUrl.includes('?') ? '&' : '?') + 't=' + timestamp;
        const smallUrlWithTimestamp = smallUrl + (smallUrl.includes('?') ? '&' : '?') + 't=' + timestamp;
        
        avatarLarge.src = largeUrlWithTimestamp;
        avatarSmall.src = smallUrlWithTimestamp;
        
        // console.log('Установлены URL аватаров:', { large: largeUrlWithTimestamp, small: smallUrlWithTimestamp });
    } else {
        // Заглушка для аватара по умолчанию
        const defaultLarge = '/static/icons/default-avatar-large.svg';
        const defaultSmall = '/static/icons/default-avatar-small.svg';
        
        avatarLarge.src = defaultLarge;
        avatarSmall.src = defaultSmall;
        
        // console.log('Установлены аватары по умолчанию');
    }
}



// Сохранение профиля
async function saveProfile(options = {}) {
    if (isSavingProfile) {
        return;
    }

    const { afterSave } = options;

    // Получаем значения формы для проверки изменений
    const formValues = getCurrentFormValues();
    
    // Проверяем, есть ли изменения в настройках аудио
    const hasAudioChanges = audioSettingsPanel && (
        (formValues.audio_start || '') !== (originalData.audio_start || '') ||
        (formValues.audio_typo || '') !== (originalData.audio_typo || '') ||
        (formValues.audio_success || '') !== (originalData.audio_success || '') ||
        (formValues.audio_repeats || 3) !== (originalData.audio_repeats || 3)
    );

    // Если нет изменений вообще, выходим
    if (!hasUnsavedChanges && !hasAudioChanges) {
        if (typeof afterSave === 'function') {
            afterSave();
        }
        return;
    }

    isSavingProfile = true;
    setUnsavedState(hasUnsavedChanges || hasAudioChanges);

    try {
        const updateData = {
            username: formValues.username,
            native_language: formValues.native_language,
            learning_languages: formValues.learning_languages,
            current_learning: formValues.current_learning
        };

        if (formValues.password) {
            updateData.password = formValues.password;
        }

        // Добавляем настройки аудио в формате settings_json
        if (audioSettingsPanel) {
            // Получаем настройки из панели (включая новые поля without_entering_text и show_text)
            const settings = audioSettingsPanel.getSettings();
            
            // Формируем settings_json в новом формате
            const settingsJson = JSON.stringify({
                audio: {
                    start: settings.start || 'oto',
                    typo: settings.typo || 'o',
                    success: settings.success || 'ot',
                    repeats: settings.repeats !== undefined ? settings.repeats : 3,
                    without_entering_text: Boolean(settings.without_entering_text),
                    show_text: Boolean(settings.show_text)
                }
            });
            
            updateData.settings_json = settingsJson;
            
            // Для обратной совместимости также отправляем отдельные поля (если бэкенд их еще использует)
            updateData.audio_start = settings.start || 'oto';
            updateData.audio_typo = settings.typo || 'o';
            updateData.audio_success = settings.success || 'ot';
            updateData.audio_repeats = settings.repeats !== undefined ? settings.repeats : 3;
        }

        showInfo('Сохраняем изменения...');

        const updatedUser = await UM.updateProfile(updateData);

        // Обновляем originalData полностью, включая настройки аудио из ответа сервера
        // Сначала пытаемся получить настройки из settings_json (новый формат)
        let audioSettings = {
            audio_start: '',
            audio_typo: '',
            audio_success: '',
            audio_repeats: 3
        };
        
        if (updatedUser.settings_json) {
            try {
                const settings = JSON.parse(updatedUser.settings_json);
                const audio = settings.audio || {};
                audioSettings = {
                    audio_start: audio.start || '',
                    audio_typo: audio.typo || '',
                    audio_success: audio.success || '',
                    audio_repeats: audio.repeats !== undefined ? audio.repeats : 3
                };
            } catch (e) {
                console.warn('Ошибка парсинга settings_json из ответа:', e);
            }
        }
        
        // Fallback на отдельные поля (обратная совместимость)
        if (!audioSettings.audio_start && updatedUser.audio_start !== undefined) {
            audioSettings.audio_start = updatedUser.audio_start;
        }
        if (!audioSettings.audio_typo && updatedUser.audio_typo !== undefined) {
            audioSettings.audio_typo = updatedUser.audio_typo;
        }
        if (!audioSettings.audio_success && updatedUser.audio_success !== undefined) {
            audioSettings.audio_success = updatedUser.audio_success;
        }
        if (audioSettings.audio_repeats === 3 && updatedUser.audio_repeats !== undefined) {
            audioSettings.audio_repeats = updatedUser.audio_repeats;
        }
        
        // Если ничего не получили, используем значения из updateData
        if (!audioSettings.audio_start) {
            audioSettings.audio_start = updateData.audio_start || '';
        }
        if (!audioSettings.audio_typo) {
            audioSettings.audio_typo = updateData.audio_typo || '';
        }
        if (!audioSettings.audio_success) {
            audioSettings.audio_success = updateData.audio_success || '';
        }
        if (audioSettings.audio_repeats === 3 && updateData.audio_repeats !== undefined) {
            audioSettings.audio_repeats = updateData.audio_repeats;
        }
        
        originalData = {
            ...originalData,
            username: updatedUser.username,
            native_language: updatedUser.native_language,
            learning_languages: updatedUser.learning_languages,
            current_learning: updatedUser.current_learning,
            audio_start: audioSettings.audio_start,
            audio_typo: audioSettings.audio_typo,
            audio_success: audioSettings.audio_success,
            audio_repeats: audioSettings.audio_repeats
        };
        
        // Обновляем UM.userData, чтобы при следующей загрузке страницы данные были актуальными
        if (UM && UM.userData) {
            // Обновляем основные данные пользователя
            UM.userData.username = updatedUser.username;
            UM.userData.native_language = updatedUser.native_language;
            UM.userData.learning_languages = updatedUser.learning_languages;
            UM.userData.current_learning = updatedUser.current_learning;
            
            // ВАЖНО: Обновляем аватар из originalData, так как он уже был загружен через uploadAvatar
            // и сохранен в originalData.avatar при загрузке
            if (originalData.avatar) {
                UM.userData.avatar = originalData.avatar;
            } else if (updatedUser.avatar) {
                // Fallback: если в originalData нет аватара, берем из updatedUser
                UM.userData.avatar = updatedUser.avatar;
            }
            
            // Сохраняем settings_json если он есть
            if (updatedUser.settings_json) {
                UM.userData.settings_json = updatedUser.settings_json;
            }
            // Также сохраняем отдельные поля для обратной совместимости
            UM.userData.audio_start = originalData.audio_start;
            UM.userData.audio_typo = originalData.audio_typo;
            UM.userData.audio_success = originalData.audio_success;
            UM.userData.audio_repeats = originalData.audio_repeats;
            
            // Обновляем topbar (имя пользователя и аватар, если изменились)
            // Добавляем небольшую задержку, чтобы браузер успел обработать обновление avatar
            setTimeout(() => {
                if (UM && UM.setupAuthenticatedUser) {
                    UM.setupAuthenticatedUser(UM.userData);
                }
            }, 100);
        }
        
        // Обновляем панель настроек аудио с сохраненными значениями
        if (audioSettingsPanel) {
            // Получаем полные настройки из settings_json, если есть
            let settingsToApply = {
                start: originalData.audio_start,
                typo: originalData.audio_typo,
                success: originalData.audio_success,
                repeats: originalData.audio_repeats
            };
            
            if (updatedUser.settings_json) {
                try {
                    const settings = JSON.parse(updatedUser.settings_json);
                    const audio = settings.audio || {};
                    settingsToApply = {
                        start: audio.start || originalData.audio_start,
                        typo: audio.typo || originalData.audio_typo,
                        success: audio.success || originalData.audio_success,
                        repeats: audio.repeats !== undefined ? audio.repeats : originalData.audio_repeats,
                        without_entering_text: Boolean(audio.without_entering_text),
                        show_text: Boolean(audio.show_text)
                    };
                } catch (e) {
                    console.warn('Ошибка парсинга settings_json для панели:', e);
                }
            }
            
            audioSettingsPanel.setSettings(settingsToApply);
        }

        if (formValues.password) {
            document.getElementById('password').value = '';
        }

        // Проверяем изменения после сохранения (должно быть false)
        checkForChanges();
        // Убеждаемся, что обработчик beforeunload удален
        setUnsavedState(false);
        showSuccess('Профиль успешно сохранен!');

        if (typeof afterSave === 'function') {
            afterSave();
        }

    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showError('Ошибка сохранения: ' + error.message);
    } finally {
        isSavingProfile = false;
        // После сохранения проверяем изменения еще раз, чтобы обновить hasUnsavedChanges
        checkForChanges();
    }
}

/**
 * Показывает модальное окно выхода
 */
function showExitModal() {
    const exitModal = document.getElementById('exitModal');
    if (!exitModal) return;

    // Проверяем изменения еще раз перед выходом
    checkForChanges();
    
    // Если нет несохраненных изменений, просто выходим без модального окна
    if (!hasUnsavedChanges) {
        proceedToExit();
        return;
    }

    const exitModalMessage = document.getElementById('exitModalMessage');
    const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');

    if (exitModalMessage) {
        exitModalMessage.textContent = hasUnsavedChanges
            ? 'Есть несохранённые изменения. Сохранить перед выходом?'
            : 'Все изменения уже сохранены. Что сделать дальше?';
    }

    if (exitWithSavingBtn) {
        if (hasUnsavedChanges) {
            exitWithSavingBtn.style.display = '';
        } else {
            exitWithSavingBtn.style.display = 'none';
        }
    }

    exitModal.style.display = 'flex';
    const stayBtn = document.getElementById('exitStayBtn');
    if (stayBtn) stayBtn.focus();
}

/**
 * Обработчик сохранения с индикацией процесса
 */
async function handleSave() {
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.disabled = true;
        const originalHTML = saveButton.innerHTML;
        saveButton.innerHTML = '<i data-lucide="loader-2"></i>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
        
        try {
            await saveProfile();
        } catch (error) {
            console.error('[Save] error', error);
        } finally {
            saveButton.innerHTML = originalHTML;
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            saveButton.disabled = false;
        }
    }
}

/**
 * Обработчик сохранения и выхода
 */
async function handleSaveAndExit() {
    await saveProfile({ afterSave: proceedToExit });
}

function toggleExitModal(show) {
    const modal = document.getElementById('exitModal');
    if (!modal) {
        return;
    }

    if (show) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        if (window.lucide) {
            window.lucide.createIcons({ root: modal });
        }
    } else {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function proceedToExit() {
    // Убеждаемся, что обработчик beforeunload удален перед редиректом
    setUnsavedState(false);
    // Небольшая задержка, чтобы обработчик точно удалился
    setTimeout(() => {
        window.location.href = '/';
    }, 0);
}

// Вспомогательные функции для уведомлений
function showToast(message, type = 'info') {
    if (!message) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast-notice toast-with-icon${type ? ` ${type}` : ''}`;

    const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'circle-check' : 'info';
    toast.innerHTML = `
        <span class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        if (window.lucide) {
            window.lucide.createIcons({ root: toast });
        }
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 200);
    }, 2400);
}

function showInfo(message) {
    showToast(message, 'info');
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}