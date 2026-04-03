/**
 * Класс для отображения модального окна логина и регистрации
 * Показывает модальное окно поверх страницы, не теряя данные пользователя
 * Поддерживает переключение между режимами логина и регистрации
 */
class LoginModal {
    constructor() {
        this.modal = null;
        this.isVisible = false;
        this.pendingResolve = null;
        this.mode = 'login'; // 'login' или 'register' или 'forgot' или 'reset'
        this.languageSelector = null;
    }

    /**
     * Создать модальное окно для логина/регистрации
     */
    createModal() {
        // Проверяем, существует ли уже модальное окно
        let modal = document.getElementById('login-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        // Создаем модальное окно
        modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.className = 'modal';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="modal-content login-modal-content">
                <div class="login-header">
                    <h2 id="loginModalTitle">Требуется авторизация</h2>
                    <button class="close-login-btn" id="closeLoginBtn" style="display: none;">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="login-body">
                    <p class="login-message" id="loginModalMessage">Для работы с приложением необходимо войти в систему</p>
                    
                    <!-- Режим логина -->
                    <form id="loginModalForm" class="login-form" style="display: none;" autocomplete="off">
                        <div class="form-row">
                            <label for="loginModalEmail">Почта</label>
                            <input 
                                id="loginModalEmail" 
                                class="text-input auth-input" 
                                type="email" 
                                name="email" 
                                placeholder="you@example.com" 
                                required
                                autocomplete="username"
                            >
                        </div>

                        <div class="form-row">
                            <label for="loginModalPassword">Пароль</label>
                            <div class="password-input-wrapper">
                                <input 
                                    id="loginModalPassword" 
                                    class="text-input auth-input" 
                                    type="password" 
                                    name="password" 
                                    placeholder="Ваш пароль" 
                                    required
                                    autocomplete="current-password"
                                >
                                <button type="button" class="button-color-transparent password-toggle-btn" aria-label="Показать пароль" data-password-toggle="1" data-target-input="loginModalPassword">
                                    <i data-lucide="eye"></i>
                                </button>
                            </div>
                        </div>

                        <div id="loginModalErrorMessage" class="form-message error-message" style="display: none;"></div>

                        <div class="login-form-actions">
                            <button type="submit" class="button-color-yellow auth-submit" id="loginModalSubmitBtn">
                                Войти
                            </button>
                        </div>


                        <div class="login-form-actions" style="margin-top: 10px;">
                            <button type="button" class="button-color-gray auth-submit" id="loginWithGoogleBtn">
                                <i data-lucide="chrome"></i>
                                Google
                            </button>
                        </div>

                        <p class="form-note" style="margin-top: 10px;">
                            <a href="#" id="switchToForgotLink">Забыл пароль?</a>
                        </p>

                        <p class="form-note">
                            Нет аккаунта? <a href="#" id="switchToRegisterLink">Зарегистрироваться</a>
                        </p>
                    </form>

                    <form id="forgotModalForm" class="login-form" style="display: none;" autocomplete="off">
                        <div class="form-row">
                            <label for="forgotModalEmail">Почта</label>
                            <input
                                id="forgotModalEmail"
                                class="text-input auth-input"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                required
                                autocomplete="username"
                            >
                        </div>

                        <div id="forgotModalInfoMessage" class="form-message" style="display: none;"></div>
                        <div id="forgotModalErrorMessage" class="form-message error-message" style="display: none;"></div>

                        <div class="login-form-actions">
                            <button type="submit" class="button-color-yellow auth-submit" id="forgotModalSubmitBtn">
                                Отправить
                            </button>
                        </div>

                        <p class="form-note" style="margin-top: 10px;">
                            <a href="#" id="switchBackToLoginFromForgotLink">Назад ко входу</a>
                        </p>
                    </form>

                    <form id="resetModalForm" class="login-form" style="display: none;" autocomplete="off">
                        <div class="form-row">
                            <label for="resetModalToken">Код</label>
                            <input
                                id="resetModalToken"
                                class="text-input auth-input"
                                type="text"
                                name="token"
                                placeholder="вставь код из ссылки"
                                required
                                autocomplete="off"
                            >
                        </div>

                        <div class="form-row">
                            <label for="resetModalPassword">Новый пароль</label>
                            <div class="password-input-wrapper">
                                <input
                                    id="resetModalPassword"
                                    class="text-input auth-input"
                                    type="password"
                                    name="password"
                                    placeholder="Минимум 6 символов"
                                    required
                                    minlength="6"
                                    autocomplete="new-password"
                                >
                                <button type="button" class="button-color-transparent password-toggle-btn" aria-label="Показать пароль" data-password-toggle="1" data-target-input="resetModalPassword">
                                    <i data-lucide="eye"></i>
                                </button>
                            </div>
                        </div>

                        <div id="resetModalInfoMessage" class="form-message" style="display: none;"></div>
                        <div id="resetModalErrorMessage" class="form-message error-message" style="display: none;"></div>

                        <div class="login-form-actions">
                            <button type="submit" class="button-color-yellow auth-submit" id="resetModalSubmitBtn">
                                Сохранить
                            </button>
                        </div>

                        <p class="form-note" style="margin-top: 10px;">
                            <a href="#" id="switchBackToLoginFromResetLink">Назад ко входу</a>
                        </p>
                    </form>

                    <!-- Режим регистрации -->
                    <form id="registerModalForm" class="login-form" style="display: none;" autocomplete="off" data-form-type="register">
                        <div class="form-row">
                            <label for="registerModalUsername">Имя пользователя</label>
                            <input 
                                id="registerModalUsername" 
                                class="text-input auth-input" 
                                type="text" 
                                name="username" 
                                placeholder="Как вас называть?" 
                                required
                                autocomplete="off"
                                data-1p-ignore="true"
                                data-lpignore="true"
                            >
                        </div>

                        <div class="form-row">
                            <label for="registerModalEmail">Почта</label>
                            <input 
                                id="registerModalEmail" 
                                class="text-input auth-input" 
                                type="email" 
                                name="email" 
                                placeholder="you@example.com" 
                                required
                                autocomplete="off"
                                data-1p-ignore="true"
                                data-lpignore="true"
                            >
                        </div>

                        <div class="form-row">
                            <label for="registerModalPassword">Пароль</label>
                            <div class="password-input-wrapper">
                                <input 
                                    id="registerModalPassword" 
                                    class="text-input auth-input" 
                                    type="password" 
                                    name="password" 
                                    placeholder="Минимум 6 символов" 
                                    required
                                    minlength="6"
                                    autocomplete="new-password"
                                    data-1p-ignore="true"
                                    data-lpignore="true"
                                >
                                <button type="button" class="button-color-transparent password-toggle-btn" aria-label="Показать пароль" data-password-toggle="1" data-target-input="registerModalPassword">
                                    <i data-lucide="eye"></i>
                                </button>
                            </div>
                        </div>

                        <div id="registerModalLanguageSelector" class="language-selector-wrapper"></div>

                        <div id="registerModalErrorMessage" class="form-message error-message" style="display: none;"></div>

                        <div class="login-form-actions">
                            <button type="submit" class="button-color-yellow auth-submit" id="registerModalSubmitBtn">
                                Зарегистрироваться
                            </button>
                        </div>


                        <div class="login-form-actions" style="margin-top: 10px;">
                            <button type="button" class="button-color-gray auth-submit" id="registerWithGoogleBtn">
                                <i data-lucide="chrome"></i>
                                Google
                            </button>
                        </div>

                        <p class="form-note">
                            Уже зарегистрированы? <a href="#" id="switchToLoginLink">Войти</a>
                        </p>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;

        // Инициализируем иконки
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Обработчики событий
        this.setupEventHandlers();
    }

    /**
     * Настроить обработчики событий
     */
    setupEventHandlers() {
        // Форма логина
        const loginForm = document.getElementById('loginModalForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin();
            });
        }

        const forgotForm = document.getElementById('forgotModalForm');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleForgot();
            });
        }

        const resetForm = document.getElementById('resetModalForm');
        if (resetForm) {
            resetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleReset();
            });
        }

        // Форма регистрации
        const registerForm = document.getElementById('registerModalForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleRegister();
            });
        }

        const loginWithGoogleBtn = document.getElementById('loginWithGoogleBtn');
        if (loginWithGoogleBtn) {
            loginWithGoogleBtn.addEventListener('click', () => {
                try {
                    const next = window.location.pathname + window.location.search + window.location.hash;
                    window.location.href = '/user/auth/google/start?next=' + encodeURIComponent(next);
                } catch (e) {
                    window.location.href = '/user/auth/google/start';
                }
            });
        }

        const registerWithGoogleBtn = document.getElementById('registerWithGoogleBtn');
        if (registerWithGoogleBtn) {
            registerWithGoogleBtn.addEventListener('click', () => {
                try {
                    const next = window.location.pathname + window.location.search + window.location.hash;
                    window.location.href = '/user/auth/google/start?next=' + encodeURIComponent(next);
                } catch (e) {
                    window.location.href = '/user/auth/google/start';
                }
            });
        }

        // Переключение на регистрацию
        const switchToRegisterLink = document.getElementById('switchToRegisterLink');
        if (switchToRegisterLink) {
            switchToRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToRegister();
            });
        }

        // Переключение на логин
        const switchToLoginLink = document.getElementById('switchToLoginLink');
        if (switchToLoginLink) {
            switchToLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToLogin();
            });
        }

        const switchToForgotLink = document.getElementById('switchToForgotLink');
        if (switchToForgotLink) {
            switchToForgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToForgot();
            });
        }

        const switchBackToLoginFromForgotLink = document.getElementById('switchBackToLoginFromForgotLink');
        if (switchBackToLoginFromForgotLink) {
            switchBackToLoginFromForgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToLogin();
            });
        }

        const switchBackToLoginFromResetLink = document.getElementById('switchBackToLoginFromResetLink');
        if (switchBackToLoginFromResetLink) {
            switchBackToLoginFromResetLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToLogin();
            });
        }

        // Кнопка закрытия
        const closeBtn = document.getElementById('closeLoginBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (window.UM && window.UM.isAuthenticated && window.UM.isAuthenticated()) {
                    this.hide();
                } else {
                    alert('Для работы с приложением необходимо войти в систему');
                }
            });
        }

        // Закрытие по клику вне модального окна
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    if (window.UM && window.UM.isAuthenticated && window.UM.isAuthenticated()) {
                        this.hide();
                    } else {
                        alert('Для работы с приложением необходимо войти в систему');
                    }
                }
            });
        }

        // Блокируем клавишу Escape, если пользователь не авторизован
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                if (window.UM && window.UM.isAuthenticated && window.UM.isAuthenticated()) {
                    this.hide();
                } else {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });

        document.addEventListener('click', (e) => {
            const toggleBtn = e.target?.closest?.('[data-password-toggle]');
            if (!toggleBtn) return;

            const targetId = toggleBtn.getAttribute('data-target-input');
            if (!targetId) return;

            const input = document.getElementById(targetId);
            if (!input) return;

            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            toggleBtn.setAttribute('aria-label', willShow ? 'Скрыть пароль' : 'Показать пароль');

            const iconName = willShow ? 'eye-off' : 'eye';
            toggleBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Переключиться на режим регистрации
     */
    switchToRegister() {
        this.mode = 'register';
        this.updateModalView();
        this.initLanguageSelector();
    }

    /**
     * Переключиться на режим логина
     */
    switchToLogin() {
        this.mode = 'login';
        this.updateModalView();
    }

    switchToForgot() {
        this.mode = 'forgot';
        this.updateModalView();
    }

    switchToReset() {
        this.mode = 'reset';
        this.updateModalView();
    }

    /**
     * Обновить вид модального окна в зависимости от режима
     */
    updateModalView() {
        const loginForm = document.getElementById('loginModalForm');
        const registerForm = document.getElementById('registerModalForm');
        const forgotForm = document.getElementById('forgotModalForm');
        const resetForm = document.getElementById('resetModalForm');
        const title = document.getElementById('loginModalTitle');
        const message = document.getElementById('loginModalMessage');

        if (this.mode === 'login') {
            if (loginForm) loginForm.style.display = 'block';
            if (registerForm) registerForm.style.display = 'none';
            if (forgotForm) forgotForm.style.display = 'none';
            if (resetForm) resetForm.style.display = 'none';
            if (title) title.textContent = 'Требуется авторизация';
            if (message) message.textContent = 'Для работы с приложением необходимо войти в систему';
        } else if (this.mode === 'register') {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'block';
            if (forgotForm) forgotForm.style.display = 'none';
            if (resetForm) resetForm.style.display = 'none';
            if (title) title.textContent = 'Регистрация';
            if (message) message.textContent = 'Создайте доступ к диктантам и личному кабинету';
        } else if (this.mode === 'forgot') {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'none';
            if (forgotForm) forgotForm.style.display = 'block';
            if (resetForm) resetForm.style.display = 'none';
            if (title) title.textContent = 'Восстановление пароля';
            if (message) message.textContent = 'Введи почту — мы отправим ссылку для сброса пароля';
        } else {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'none';
            if (forgotForm) forgotForm.style.display = 'none';
            if (resetForm) resetForm.style.display = 'block';
            if (title) title.textContent = 'Новый пароль';
            if (message) message.textContent = 'Вставь код и задай новый пароль';
        }

        // Очищаем ошибки
        this.clearErrors();
    }

    async handleForgot() {
        const emailInput = document.getElementById('forgotModalEmail');
        const submitBtn = document.getElementById('forgotModalSubmitBtn');
        const infoMessage = document.getElementById('forgotModalInfoMessage');

        const email = emailInput?.value?.trim();
        if (!email) {
            this.showError('Введи почту', 'forgot');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправляем...';
        }
        this.clearErrors();
        if (infoMessage) {
            infoMessage.style.display = 'none';
            infoMessage.textContent = '';
        }

        try {
            const res = await fetch('/user/api/password_reset/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || !data.success) {
                const msg = data && (data.error || data.message) ? String(data.error || data.message) : `HTTP ${res.status}`;
                throw new Error(msg);
            }

            if (infoMessage) {
                infoMessage.style.display = 'block';
                infoMessage.style.background = '#ecfdf5';
                infoMessage.style.color = '#065f46';
                infoMessage.style.border = '1px solid #a7f3d0';
                infoMessage.style.padding = '10px';
                infoMessage.style.borderRadius = '6px';
                infoMessage.textContent = 'Если аккаунт существует — ссылка для сброса пароля отправлена на почту.';
            }
        } catch (e) {
            this.showError(e && e.message ? e.message : 'Ошибка', 'forgot');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Отправить';
            }
        }
    }

    async handleReset() {
        const tokenInput = document.getElementById('resetModalToken');
        const passwordInput = document.getElementById('resetModalPassword');
        const submitBtn = document.getElementById('resetModalSubmitBtn');
        const infoMessage = document.getElementById('resetModalInfoMessage');

        const token = tokenInput?.value?.trim();
        const password = passwordInput?.value;
        if (!token || !password) {
            this.showError('Заполни все поля', 'reset');
            return;
        }
        if (String(password).length < 6) {
            this.showError('Пароль должен содержать не менее 6 символов', 'reset');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняем...';
        }
        this.clearErrors();
        if (infoMessage) {
            infoMessage.style.display = 'none';
            infoMessage.textContent = '';
        }

        try {
            const res = await fetch('/user/api/password_reset/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || !data.success) {
                const msg = data && (data.error || data.message) ? String(data.error || data.message) : `HTTP ${res.status}`;
                throw new Error(msg);
            }
            if (infoMessage) {
                infoMessage.style.display = 'block';
                infoMessage.style.background = '#ecfdf5';
                infoMessage.style.color = '#065f46';
                infoMessage.style.border = '1px solid #a7f3d0';
                infoMessage.style.padding = '10px';
                infoMessage.style.borderRadius = '6px';
                infoMessage.textContent = 'Пароль обновлён. Теперь можно войти.';
            }
            this.switchToLogin();
        } catch (e) {
            this.showError(e && e.message ? e.message : 'Ошибка', 'reset');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Сохранить';
            }
        }
    }

    /**
     * Инициализировать селектор языков для регистрации
     */
    async initLanguageSelector() {
        const container = document.getElementById('registerModalLanguageSelector');
        if (!container) return;

        // Очищаем контейнер перед инициализацией
        container.innerHTML = '';

        // Проверяем, что LanguageManager доступен
        if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
            // Ждем инициализации LanguageManager
            let attempts = 0;
            const maxAttempts = 60; // 3 секунды
            while (attempts < maxAttempts && (!window.LanguageManager || !window.LanguageManager.isInitialized)) {
                await new Promise(resolve => setTimeout(resolve, 50));
                attempts++;
            }
        }

        if (!window.LanguageManager) {
            console.warn('LanguageManager не доступен для селектора языков');
            return;
        }

        // Получаем данные языков
        const languageData = window.LanguageManager?.getLanguageData?.() || window.LANGUAGE_DATA || {};
        
        if (!languageData || Object.keys(languageData).length === 0) {
            console.warn('Данные языков не доступны');
            return;
        }

        // Определяем языки по умолчанию
        const availableLanguages = Object.keys(languageData);
        const defaultNative = this.detectDefaultNativeLanguage(availableLanguages);
        const defaultLearning = defaultNative === 'en' ? 'ru' : 'en';

        // Инициализируем селектор, если функция доступна
        if (typeof window.initLanguageSelector === 'function') {
            this.languageSelector = window.initLanguageSelector('registerModalLanguageSelector', {
                mode: 'registration',
                nativeLanguage: defaultNative,
                currentLearning: defaultLearning,
                learningLanguages: [defaultLearning],
                languageData,
                onLanguageChange: () => {
                    this.clearErrors();
                    // Устанавливаем лейблы после изменения языков
                    setTimeout(() => this.decorateLanguageSelector(), 0);
                },
            });
            
            // Устанавливаем лейблы для селектора языков после инициализации
            // Используем небольшую задержку, чтобы DOM успел обновиться
            setTimeout(() => {
                this.decorateLanguageSelector();
            }, 100);
        } else {
            console.warn('initLanguageSelector не доступна');
        }
    }

    /**
     * Установить лейблы для селектора языков
     */
    decorateLanguageSelector() {
        const container = document.getElementById('registerModalLanguageSelector');
        if (!container) {
            return;
        }

        const groups = container.querySelectorAll('.language-selector-group');
        if (groups[0]) {
            groups[0].setAttribute('data-label', 'Родной язык');
        }
        if (groups[1]) {
            groups[1].setAttribute('data-label', 'Изучаю');
        }
    }

    /**
     * Определить язык по умолчанию
     */
    detectDefaultNativeLanguage(available) {
        if (!navigator.languages || !Array.isArray(navigator.languages)) {
            return available.includes('ru') ? 'ru' : (available[0] || 'ru');
        }

        const preferred = navigator.languages
            .map((lang) => lang.toLowerCase().split('-')[0])
            .find((lang) => available.includes(lang));

        if (preferred) {
            return preferred;
        }

        return available.includes('ru') ? 'ru' : (available[0] || 'ru');
    }

    /**
     * Обработка логина
     */
    async handleLogin() {
        const emailInput = document.getElementById('loginModalEmail');
        const passwordInput = document.getElementById('loginModalPassword');
        const errorMessage = document.getElementById('loginModalErrorMessage');
        const submitBtn = document.getElementById('loginModalSubmitBtn');

        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            this.showError('Пожалуйста, заполните все поля', 'login');
            return;
        }

        // Показываем состояние загрузки
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';
        }

        this.clearErrors();

        try {
            if (!window.UM) {
                throw new Error('UserManager не доступен');
            }

            const result = await window.UM.login(email, password);

            if (result?.success) {
                // Успешный вход
                this.hide();
                
                // Разрешаем промис, если он был установлен
                if (this.pendingResolve) {
                    this.pendingResolve();
                    this.pendingResolve = null;
                }
            } else {
                this.showError(result?.error || 'Ошибка входа', 'login');
            }
        } catch (error) {
            console.error('Ошибка при входе:', error);
            this.showError('Произошла ошибка при входе. Попробуйте еще раз.', 'login');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Войти';
            }
        }
    }

    /**
     * Обработка регистрации
     */
    async handleRegister() {
        const usernameInput = document.getElementById('registerModalUsername');
        const emailInput = document.getElementById('registerModalEmail');
        const passwordInput = document.getElementById('registerModalPassword');
        const errorMessage = document.getElementById('registerModalErrorMessage');
        const submitBtn = document.getElementById('registerModalSubmitBtn');

        const username = usernameInput?.value?.trim();
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!username || !email || !password) {
            this.showError('Пожалуйста, заполните все поля', 'register');
            return;
        }

        if (password.length < 6) {
            this.showError('Пароль должен содержать не менее 6 символов', 'register');
            return;
        }

        // Получаем языки из селектора
        const selectorValues = this.languageSelector?.getValues?.();
        const nativeLanguage = selectorValues?.nativeLanguage || 'ru';
        const learningLanguage = selectorValues?.currentLearning || 'en';

        if (nativeLanguage === learningLanguage) {
            this.showError('Родной и изучаемый языки должны различаться', 'register');
            return;
        }

        // Показываем состояние загрузки
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Создаём аккаунт...';
        }

        this.clearErrors();

        try {
            if (!window.UM) {
                throw new Error('UserManager не доступен');
            }

            const result = await window.UM.register({
                username,
                email,
                password,
                nativeLanguage,
                learningLanguage,
            });

            if (result?.success) {
                // Успешная регистрация
                this.hide();
                
                // Разрешаем промис, если он был установлен
                if (this.pendingResolve) {
                    this.pendingResolve();
                    this.pendingResolve = null;
                }
            } else {
                this.showError(result?.error || 'Ошибка регистрации', 'register');
            }
        } catch (error) {
            console.error('Ошибка при регистрации:', error);
            this.showError('Произошла ошибка при регистрации. Попробуйте еще раз.', 'register');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Зарегистрироваться';
            }
        }
    }

    /**
     * Показать ошибку
     */
    showError(message, mode = null) {
        const currentMode = mode || this.mode;
        const errorMessageId = currentMode === 'login'
            ? 'loginModalErrorMessage'
            : (currentMode === 'forgot' ? 'forgotModalErrorMessage' : (currentMode === 'reset' ? 'resetModalErrorMessage' : 'registerModalErrorMessage'));
        const errorMessage = document.getElementById(errorMessageId);
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }
    }

    /**
     * Очистить ошибки
     */
    clearErrors() {
        const loginError = document.getElementById('loginModalErrorMessage');
        const registerError = document.getElementById('registerModalErrorMessage');
        const forgotError = document.getElementById('forgotModalErrorMessage');
        const resetError = document.getElementById('resetModalErrorMessage');
        if (loginError) {
            loginError.style.display = 'none';
            loginError.textContent = '';
        }
        if (registerError) {
            registerError.style.display = 'none';
            registerError.textContent = '';
        }
        if (forgotError) {
            forgotError.style.display = 'none';
            forgotError.textContent = '';
        }
        if (resetError) {
            resetError.style.display = 'none';
            resetError.textContent = '';
        }
    }

    /**
     * Показать модальное окно
     */
    show(mode = 'login') {
        if (!this.modal) {
            this.createModal();
        }

        this.mode = mode;
        this.updateModalView();

        this.modal.style.display = 'flex';
        this.isVisible = true;

        // Инициализируем селектор языков для регистрации (асинхронно)
        if (mode === 'register') {
            // Запускаем инициализацию селектора языков
            this.initLanguageSelector().then(() => {
                // После инициализации фокусируемся на первом поле
                const firstInput = document.getElementById('registerModalUsername');
                if (firstInput) {
                    setTimeout(() => firstInput.focus(), 100);
                }
            }).catch(err => {
                console.warn('Ошибка инициализации селектора языков:', err);
                // Все равно фокусируемся на первом поле
                const firstInput = document.getElementById('registerModalUsername');
                if (firstInput) {
                    setTimeout(() => firstInput.focus(), 100);
                }
            });
        } else {
            // Фокус на первое поле для логина
            const firstInput = document.getElementById('loginModalEmail');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        // Блокируем прокрутку фона
        document.body.style.overflow = 'hidden';
    }

    /**
     * Скрыть модальное окно
     */
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.isVisible = false;
        }

        // Разблокируем прокрутку фона
        document.body.style.overflow = '';

        // Очищаем формы
        const loginForm = document.getElementById('loginModalForm');
        const registerForm = document.getElementById('registerModalForm');
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();

        this.clearErrors();
    }

    /**
     * Показать модальное окно и вернуть промис, который разрешится после успешного входа
     */
    async showAndWaitForLogin() {
        return new Promise((resolve) => {
            this.pendingResolve = resolve;
            this.show('login');
        });
    }

    /**
     * Статический метод для показа модального окна
     */
    static show(mode = 'login') {
        if (!window.loginModal) {
            window.loginModal = new LoginModal();
        }
        window.loginModal.show(mode);
        return window.loginModal;
    }

    /**
     * Статический метод для скрытия модального окна
     */
    static hide() {
        if (window.loginModal) {
            window.loginModal.hide();
        }
    }

    /**
     * Статический метод для показа модального окна с ожиданием входа
     */
    static async showAndWaitForLogin() {
        if (!window.loginModal) {
            window.loginModal = new LoginModal();
        }
        return await window.loginModal.showAndWaitForLogin();
    }
}

// Создаем глобальный экземпляр
if (!window.loginModal) {
    window.loginModal = new LoginModal();
}
