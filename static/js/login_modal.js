/**
 * Класс для отображения модального окна логина и регистрации
 * Показывает модальное окно поверх страницы, не теряя данные пользователя
 * Поддерживает переключение между режимами логина и регистрации
 */
const __DICTAFAN_LOGIN_MODAL_HTML = `
<div class="modal-content login-modal-content">
    <div class="login-header">
        <h2 id="loginModalTitle"></h2>
        <div class="login-ui-lang" id="loginModalUiLangWrap" style="margin-left: 10px;"></div>
        <button class="close-login-btn" id="closeLoginBtn" style="display: none;">
            <i data-lucide="x"></i>
        </button>
    </div>

    <div class="login-body">
        <p class="login-message" id="loginModalMessage"></p>

        <form id="loginModalForm" class="login-form" style="display: none;" autocomplete="off">
            <div class="form-row">
                <label for="loginModalEmail"></label>
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
                <label for="loginModalPassword"></label>
                <div class="password-input-wrapper">
                    <input
                        id="loginModalPassword"
                        class="text-input auth-input"
                        type="password"
                        name="password"
                        required
                        autocomplete="current-password"
                    >
                    <button type="button" class="button-color-transparent password-toggle-btn" data-password-toggle="1" data-target-input="loginModalPassword">
                        <i data-lucide="eye"></i>
                    </button>
                </div>
            </div>

            <div id="loginModalErrorMessage" class="form-message error-message" style="display: none;"></div>

            <div class="login-form-actions">
                <button type="submit" class="button-color-yellow auth-submit" id="loginModalSubmitBtn"></button>
            </div>

            <div class="login-form-actions" style="margin-top: 10px;">
                <button type="button" class="button-color-purple auth-submit" id="loginWithGoogleBtn">
                    <i data-lucide="chrome"></i>
                    Google
                </button>
            </div>

            <p class="form-note" style="margin-top: 10px;">
                <a href="#" id="switchToForgotLink"></a>
            </p>

            <p class="form-note">
                <span id="loginNoAccountPrefix"></span> <a href="#" id="switchToRegisterLink"></a>
            </p>
        </form>

        <form id="forgotModalForm" class="login-form" style="display: none;" autocomplete="off">
            <div class="form-row">
                <label for="forgotModalEmail"></label>
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
                <button type="submit" class="button-color-yellow auth-submit" id="forgotModalSubmitBtn"></button>
            </div>

            <div class="login-form-actions" style="margin-top: 10px;">
                <button type="button" class="button-color-purple auth-submit" id="forgotModalTelegramBtn"></button>
            </div>

            <p class="form-note" style="margin-top: 10px;">
                <a href="#" id="switchBackToLoginFromForgotLink"></a>
            </p>
        </form>

        <form id="resetModalForm" class="login-form" style="display: none;" autocomplete="off">
            <div class="form-row">
                <label for="resetModalToken"></label>
                <input
                    id="resetModalToken"
                    class="text-input auth-input"
                    type="text"
                    name="token"
                    required
                    autocomplete="off"
                >
            </div>

            <div class="form-row">
                <label for="resetModalPassword"></label>
                <div class="password-input-wrapper">
                    <input
                        id="resetModalPassword"
                        class="text-input auth-input"
                        type="password"
                        name="password"
                        required
                        minlength="6"
                        autocomplete="new-password"
                    >
                    <button type="button" class="button-color-transparent password-toggle-btn" data-password-toggle="1" data-target-input="resetModalPassword">
                        <i data-lucide="eye"></i>
                    </button>
                </div>
            </div>

            <div id="resetModalInfoMessage" class="form-message" style="display: none;"></div>
            <div id="resetModalErrorMessage" class="form-message error-message" style="display: none;"></div>

            <div class="login-form-actions">
                <button type="submit" class="button-color-yellow auth-submit" id="resetModalSubmitBtn"></button>
            </div>

            <p class="form-note" style="margin-top: 10px;">
                <a href="#" id="switchBackToLoginFromResetLink"></a>
            </p>
        </form>

        <form id="registerModalForm" class="login-form" style="display: none;" autocomplete="off" data-form-type="register">
            <div class="form-row">
                <label for="registerModalUsername"></label>
                <input
                    id="registerModalUsername"
                    class="text-input auth-input"
                    type="text"
                    name="username"
                    required
                    autocomplete="off"
                >
            </div>

            <div class="form-row">
                <label for="registerModalEmail"></label>
                <input
                    id="registerModalEmail"
                    class="text-input auth-input"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    autocomplete="username"
                >
            </div>

            <div class="form-row">
                <label for="registerModalPassword"></label>
                <div class="password-input-wrapper">
                    <input
                        id="registerModalPassword"
                        class="text-input auth-input"
                        type="password"
                        name="password"
                        required
                        minlength="6"
                        autocomplete="new-password"
                        data-1p-ignore="true"
                        data-lpignore="true"
                    >
                    <button type="button" class="button-color-transparent password-toggle-btn" data-password-toggle="1" data-target-input="registerModalPassword">
                        <i data-lucide="eye"></i>
                    </button>
                </div>
            </div>

            <div id="registerModalLanguageSelector" class="language-selector-wrapper"></div>

            <div id="registerModalErrorMessage" class="form-message error-message" style="display: none;"></div>

            <div class="login-form-actions">
                <button type="submit" class="button-color-yellow auth-submit" id="registerModalSubmitBtn"></button>
            </div>

            <div class="login-form-actions" style="margin-top: 10px;">
                <button type="button" class="button-color-purple auth-submit" id="registerWithGoogleBtn">
                    <i data-lucide="chrome"></i>
                    Google
                </button>
            </div>

            <p class="form-note">
                <span id="registerAlreadyPrefix"></span> <a href="#" id="switchToLoginLink"></a>
            </p>
        </form>
    </div>
</div>
`;

class LoginModal {
    constructor() {
        this.modal = null;
        this.isVisible = false;
        this.pendingResolve = null;
        this.mode = 'login'; // 'login' или 'register' или 'forgot' или 'reset'
        this.languageSelector = null;
        this.uiLanguageSelector = null;
    }

    _t(key, fallback, params) {
        try {
            if (window.I18n && typeof window.I18n.t === 'function') {
                const v = window.I18n.t(key, params);
                if (v && v !== key) return v;
            }
        } catch (e) {
        }
        return (fallback !== undefined && fallback !== null) ? String(fallback) : String(key || '');
    }

    _getUiLang() {
        try {
            const v = (localStorage.getItem('ui_lang') || '').trim().toLowerCase();
            if (v) return v;
        } catch (e) {
        }
        try {
            if (window.I18n && typeof window.I18n.getLang === 'function') {
                return window.I18n.getLang();
            }
        } catch (e) {
        }
        return 'en';
    }

    async _ensureI18n() {
        try {
            if (window.I18n && typeof window.I18n.ensureLoaded === 'function') {
                await window.I18n.ensureLoaded();
            }
        } catch (e) {
        }
    }

    _consumeResetTokenFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const token = (params.get('reset_token') || '').trim();
            if (!token) {
                return null;
            }

            params.delete('reset_token');
            const nextQuery = params.toString();
            const nextUrl = window.location.pathname + (nextQuery ? `?${nextQuery}` : '') + (window.location.hash || '');
            window.history.replaceState({}, '', nextUrl);
            return token;
        } catch (e) {
            return null;
        }
    }

    /**
     * Создать модальное окно для логина/регистрации
     */
    createModal() {
        // Проверяем, существует ли уже модальное окно
        let modal = document.getElementById('login-modal');
        if (modal) {
            this.modal = modal;
            if (!this._initialized) {
                this._initialized = true;
                try {
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                } catch (e) {
                }

                try {
                    this.setupEventHandlers();
                } catch (e) {
                }

                try {
                    this.initUiLanguageSelector();
                } catch (e) {
                }

                try {
                    this.applyTranslations();
                } catch (e) {
                }
            }
            return;
        }

        // Если шаблон не вставлен в HTML (страницы, которые еще не переведены на base.html)
        // — создаем полную разметку на клиенте.
        modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = __DICTAFAN_LOGIN_MODAL_HTML;
        document.body.appendChild(modal);
        this.modal = modal;

        this._initialized = true;

        // Инициализируем иконки
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Обработчики событий
        this.setupEventHandlers();

        try {
            this.initUiLanguageSelector();
        } catch (e) {
        }

        try {
            this.applyTranslations();
        } catch (e) {
        }
    }

    initUiLanguageSelector() {
        const wrap = document.getElementById('loginModalUiLangWrap');
        if (!wrap) return;

        wrap.innerHTML = '';
        const supported = ['en', 'uk', 'ru', 'ar', 'tr'];
        let current = this._getUiLang();
        try {
            const stored = (localStorage.getItem('ui_lang') || '').trim().toLowerCase();
            if (stored && supported.includes(stored)) {
                current = stored;
            }
        } catch (e) {
        }
        if (!supported.includes(current)) current = 'en';

        // Если открыли регистрацию впервые и ui_lang не задан — по умолчанию ставим English
        try {
            const stored = (localStorage.getItem('ui_lang') || '').trim().toLowerCase();
            if (!stored && this.mode === 'register') {
                current = 'en';
                localStorage.setItem('ui_lang', 'en');
            }
        } catch (e) {
        }

        const applyUiLang = async (nextLang) => {
            try {
                const next = String(nextLang || '').trim().toLowerCase();
                if (!supported.includes(next)) return;
                if (next === current) return;
                current = next;
            } catch (e) {
                return;
            }

            try { localStorage.setItem('ui_lang', current); } catch (e) {}
            try {
                if (window.I18n && typeof window.I18n.setLanguage === 'function') {
                    await window.I18n.setLanguage(current);
                }
            } catch (e) {
            }
            try { await this._ensureI18n(); } catch (e) {}
            try { await this.applyTranslations(); } catch (e) {}
        };

        try {
            const languageData = window.LanguageManager?.getLanguageData?.() || window.LANGUAGE_DATA || {};
            if (!languageData || Object.keys(languageData).length === 0) {
                if (!this._uiLangWaiterInstalled) {
                    this._uiLangWaiterInstalled = true;
                    const onData = () => {
                        try { window.removeEventListener('language-data-updated', onData); } catch (e) {}
                        try { this._uiLangWaiterInstalled = false; } catch (e) {}
                        try { this.initUiLanguageSelector(); } catch (e) {}
                    };
                    try { window.addEventListener('language-data-updated', onData, { once: true }); } catch (e) {}
                }
                return;
            }

            const uiLangSelector = new LanguageSelector({
                container: wrap,
                mode: 'native-selector',
                nativeLanguage: current,
                nativeLanguages: supported,
                learningLanguages: supported,
                currentLearning: current,
                languageData,
                onLanguageChange: async (data) => {
                    const next = String(data && data.nativeLanguage ? data.nativeLanguage : '').trim().toLowerCase();
                    await applyUiLang(next);
                }
            });

            this.uiLanguageSelector = uiLangSelector;
        } catch (e) {
            return;
        }
    }

    async applyTranslations() {
        await this._ensureI18n();

        try {
            const title = document.getElementById('loginModalTitle');
            const message = document.getElementById('loginModalMessage');
            if (title || message) {
                this.updateModalView();
            }
        } catch (e) {
        }

        try {
            const l1 = document.querySelector('label[for="loginModalEmail"]');
            if (l1) l1.textContent = this._t('login_modal.fields.email', 'Почта');
            const l2 = document.querySelector('label[for="loginModalPassword"]');
            if (l2) l2.textContent = this._t('login_modal.fields.password', 'Пароль');
            const pass = document.getElementById('loginModalPassword');
            if (pass) pass.setAttribute('placeholder', this._t('login_modal.placeholders.password', 'Ваш пароль'));
            const btn = document.getElementById('loginModalSubmitBtn');
            if (btn) btn.textContent = this._t('login_modal.actions.login', 'Войти');
            const forgot = document.getElementById('switchToForgotLink');
            if (forgot) forgot.textContent = this._t('login_modal.actions.forgot', 'Забыл пароль?');
            const swReg = document.getElementById('switchToRegisterLink');
            if (swReg) swReg.textContent = this._t('login_modal.actions.switch_to_register', 'Зарегистрироваться');
            const loginPrefix = document.getElementById('loginNoAccountPrefix');
            if (loginPrefix) loginPrefix.textContent = this._t('login_modal.hints.no_account_prefix', 'Нет аккаунта?');
        } catch (e) {
        }

        try {
            const l3 = document.querySelector('label[for="registerModalUsername"]');
            if (l3) l3.textContent = this._t('login_modal.fields.username', 'Имя пользователя');
            const u = document.getElementById('registerModalUsername');
            if (u) u.setAttribute('placeholder', this._t('login_modal.placeholders.username', 'Как вас называть?'));
            const l4 = document.querySelector('label[for="registerModalEmail"]');
            if (l4) l4.textContent = this._t('login_modal.fields.email', 'Почта');
            const l5 = document.querySelector('label[for="registerModalPassword"]');
            if (l5) l5.textContent = this._t('login_modal.fields.password', 'Пароль');
            const rp = document.getElementById('registerModalPassword');
            if (rp) rp.setAttribute('placeholder', this._t('login_modal.placeholders.password_min', 'Минимум 6 символов'));
            const rb = document.getElementById('registerModalSubmitBtn');
            if (rb) rb.textContent = this._t('login_modal.actions.register', 'Зарегистрироваться');
            const swLogin = document.getElementById('switchToLoginLink');
            if (swLogin) swLogin.textContent = this._t('login_modal.actions.switch_to_login', 'Войти');
            const regPrefix = document.getElementById('registerAlreadyPrefix');
            if (regPrefix) regPrefix.textContent = this._t('login_modal.hints.already_registered_prefix', 'Уже зарегистрированы?');
        } catch (e) {
        }

        try {
            const lf = document.querySelector('label[for="forgotModalEmail"]');
            if (lf) lf.textContent = this._t('login_modal.fields.email', 'Почта');
            const fb = document.getElementById('forgotModalSubmitBtn');
            if (fb) fb.textContent = this._t('login_modal.actions.send', 'Отправить');
            const ft = document.getElementById('forgotModalTelegramBtn');
            if (ft) ft.textContent = this._t('login_modal.actions.send_telegram', 'Отправить в Telegram');
            const back = document.getElementById('switchBackToLoginFromForgotLink');
            if (back) back.textContent = this._t('login_modal.actions.back_to_login', 'Назад ко входу');
        } catch (e) {
        }

        try {
            const lt = document.querySelector('label[for="resetModalToken"]');
            if (lt) lt.textContent = this._t('login_modal.fields.code', 'Код');
            const tok = document.getElementById('resetModalToken');
            if (tok) tok.setAttribute('placeholder', this._t('login_modal.placeholders.code', 'вставь код из ссылки'));
            const lp = document.querySelector('label[for="resetModalPassword"]');
            if (lp) lp.textContent = this._t('login_modal.fields.new_password', 'Новый пароль');
            const rpp = document.getElementById('resetModalPassword');
            if (rpp) rpp.setAttribute('placeholder', this._t('login_modal.placeholders.password_min', 'Минимум 6 символов'));
            const sb = document.getElementById('resetModalSubmitBtn');
            if (sb) sb.textContent = this._t('login_modal.actions.save', 'Сохранить');
            const back2 = document.getElementById('switchBackToLoginFromResetLink');
            if (back2) back2.textContent = this._t('login_modal.actions.back_to_login', 'Назад ко входу');
        } catch (e) {
        }

        try {
            this.decorateLanguageSelector();
        } catch (e) {
        }

        try {
            const toggles = document.querySelectorAll('.password-toggle-btn[data-password-toggle="1"]');
            for (const toggleBtn of toggles) {
                try {
                    if (!toggleBtn) continue;
                    const targetId = toggleBtn.getAttribute('data-target-input');
                    if (!targetId) continue;
                    const input = document.getElementById(targetId);
                    if (!input) continue;
                    const willShow = input.type === 'password';
                    toggleBtn.setAttribute('aria-label', willShow
                        ? this._t('login_modal.actions.show_password', 'Показать пароль')
                        : this._t('login_modal.actions.hide_password', 'Скрыть пароль'));
                } catch (e) {
                }
            }
        } catch (e) {
        }
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

        const forgotTelegramBtn = document.getElementById('forgotModalTelegramBtn');
        if (forgotTelegramBtn) {
            forgotTelegramBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleForgotTelegram();
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
                    alert(this._t('login_modal.messages.login_required_alert', 'Для работы с приложением необходимо войти в систему'));
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
                        alert(this._t('login_modal.messages.login_required_alert', 'Для работы с приложением необходимо войти в систему'));
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
            toggleBtn.setAttribute('aria-label', willShow
                ? this._t('login_modal.actions.hide_password', 'Скрыть пароль')
                : this._t('login_modal.actions.show_password', 'Показать пароль'));

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
        try { this.applyTranslations(); } catch (e) {}
    }

    /**
     * Переключиться на режим логина
     */
    switchToLogin() {
        this.mode = 'login';
        this.updateModalView();
        try { this.applyTranslations(); } catch (e) {}
    }

    switchToForgot() {
        this.mode = 'forgot';
        this.updateModalView();
        try { this.applyTranslations(); } catch (e) {}
    }

    switchToReset() {
        this.mode = 'reset';
        this.updateModalView();
        try { this.applyTranslations(); } catch (e) {}
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
            if (title) title.textContent = this._t('login_modal.titles.login_required', 'Требуется авторизация');
            if (message) message.textContent = this._t('login_modal.messages.login_required', 'Для работы с приложением необходимо войти в систему');
        } else if (this.mode === 'register') {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'block';
            if (forgotForm) forgotForm.style.display = 'none';
            if (resetForm) resetForm.style.display = 'none';
            if (title) title.textContent = this._t('login_modal.titles.register', 'Регистрация');
            if (message) message.textContent = this._t('login_modal.messages.register', 'Создайте доступ к диктантам и личному кабинету');
        } else if (this.mode === 'forgot') {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'none';
            if (forgotForm) forgotForm.style.display = 'block';
            if (resetForm) resetForm.style.display = 'none';
            if (title) title.textContent = this._t('login_modal.titles.forgot', 'Восстановление пароля');
            if (message) message.textContent = this._t('login_modal.messages.forgot', 'Введи почту — мы отправим ссылку для сброса пароля на почту или в Telegram');
        } else {
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'none';
            if (forgotForm) forgotForm.style.display = 'none';
            if (resetForm) resetForm.style.display = 'block';
            if (title) title.textContent = this._t('login_modal.titles.reset', 'Новый пароль');
            if (message) message.textContent = this._t('login_modal.messages.reset', 'Вставь код и задай новый пароль');
        }

        // Очищаем ошибки
        this.clearErrors();
    }

    async handleForgot() {
        const emailInput = document.getElementById('forgotModalEmail');
        const submitBtn = document.getElementById('forgotModalSubmitBtn');
        const telegramBtn = document.getElementById('forgotModalTelegramBtn');
        const infoMessage = document.getElementById('forgotModalInfoMessage');

        const email = emailInput?.value?.trim();
        if (!email) {
            this.showError(this._t('login_modal.errors.enter_email', 'Введи почту'), 'forgot');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = this._t('login_modal.states.sending', 'Отправляем...');
        }
        if (telegramBtn) {
            telegramBtn.disabled = true;
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
                infoMessage.textContent = this._t('login_modal.messages.reset_sent_email', 'Если аккаунт существует — ссылка для сброса пароля отправлена на почту.');
            }
        } catch (e) {
            this.showError(e && e.message ? e.message : this._t('login_modal.errors.generic', 'Ошибка'), 'forgot');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this._t('login_modal.actions.send', 'Отправить');
            }
            if (telegramBtn) {
                telegramBtn.disabled = false;
            }
        }
    }

    async handleForgotTelegram() {
        const emailInput = document.getElementById('forgotModalEmail');
        const submitBtn = document.getElementById('forgotModalSubmitBtn');
        const telegramBtn = document.getElementById('forgotModalTelegramBtn');
        const infoMessage = document.getElementById('forgotModalInfoMessage');

        const email = emailInput?.value?.trim();
        if (!email) {
            this.showError(this._t('login_modal.errors.enter_email', 'Введи почту'), 'forgot');
            return;
        }

        if (telegramBtn) {
            telegramBtn.disabled = true;
            telegramBtn.textContent = this._t('login_modal.states.sending', 'Отправляем...');
        }
        if (submitBtn) {
            submitBtn.disabled = true;
        }
        this.clearErrors();
        if (infoMessage) {
            infoMessage.style.display = 'none';
            infoMessage.textContent = '';
        }

        try {
            const res = await fetch('/user/api/password_reset/request_telegram', {
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
                infoMessage.textContent = this._t('login_modal.messages.reset_sent_telegram', 'Если аккаунт существует и Telegram привязан — ссылка для сброса пароля отправлена в Telegram.');
            }
        } catch (e) {
            this.showError(e && e.message ? e.message : this._t('login_modal.errors.generic', 'Ошибка'), 'forgot');
        } finally {
            if (telegramBtn) {
                telegramBtn.disabled = false;
                telegramBtn.textContent = this._t('login_modal.actions.send_telegram', 'Отправить в Telegram');
            }
            if (submitBtn) {
                submitBtn.disabled = false;
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
            this.showError(this._t('login_modal.errors.fill_all_fields', 'Заполни все поля'), 'reset');
            return;
        }
        if (String(password).length < 6) {
            this.showError(this._t('login_modal.errors.password_min_len', 'Пароль должен содержать не менее 6 символов'), 'reset');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = this._t('login_modal.states.saving', 'Сохраняем...');
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
                infoMessage.textContent = this._t('login_modal.messages.password_updated', 'Пароль обновлён. Теперь можно войти.');
            }
            this.switchToLogin();
        } catch (e) {
            this.showError(e && e.message ? e.message : this._t('login_modal.errors.generic', 'Ошибка'), 'reset');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this._t('login_modal.actions.save', 'Сохранить');
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

        const ensureInlineLabel = (groupEl, text) => {
            if (!groupEl) return;
            let labelEl = groupEl.querySelector(':scope > .language-selector-inline-label');
            if (!labelEl) {
                labelEl = document.createElement('label');
                labelEl.className = 'language-selector-inline-label';
                groupEl.prepend(labelEl);
            }
            labelEl.textContent = text;

            try {
                groupEl.removeAttribute('data-label');
            } catch (e) {
            }
        };

        ensureInlineLabel(groups[0], this._t('login_modal.language_selector.native', 'Родной язык'));
        ensureInlineLabel(groups[1], this._t('login_modal.language_selector.learning', 'Изучаю'));
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
            this.showError(this._t('login_modal.errors.fill_all_fields_formal', 'Пожалуйста, заполните все поля'), 'login');
            return;
        }

        // Показываем состояние загрузки
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = this._t('login_modal.states.logging_in', 'Вход...');
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
                this.showError(result?.error || this._t('login_modal.errors.login_failed', 'Ошибка входа'), 'login');
            }
        } catch (error) {
            console.error('Ошибка при входе:', error);
            this.showError(this._t('login_modal.errors.login_network', 'Произошла ошибка при входе. Попробуйте еще раз.'), 'login');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this._t('login_modal.actions.login', 'Войти');
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
            this.showError(this._t('login_modal.errors.fill_all_fields_formal', 'Пожалуйста, заполните все поля'), 'register');
            return;
        }

        if (password.length < 6) {
            this.showError(this._t('login_modal.errors.password_min_len', 'Пароль должен содержать не менее 6 символов'), 'register');
            return;
        }

        // Получаем языки из селектора
        const selectorValues = this.languageSelector?.getValues?.();
        const nativeLanguage = selectorValues?.nativeLanguage || 'ru';
        const learningLanguage = selectorValues?.currentLearning || 'en';

        if (nativeLanguage === learningLanguage) {
            this.showError(this._t('login_modal.errors.native_learning_must_differ', 'Родной и изучаемый языки должны различаться'), 'register');
            return;
        }

        // Показываем состояние загрузки
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = this._t('login_modal.states.creating_account', 'Создаём аккаунт...');
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
                this.showError(result?.error || this._t('login_modal.errors.register_failed', 'Ошибка регистрации'), 'register');
            }
        } catch (error) {
            console.error('Ошибка при регистрации:', error);
            this.showError(this._t('login_modal.errors.register_network', 'Произошла ошибка при регистрации. Попробуйте еще раз.'), 'register');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this._t('login_modal.actions.register', 'Зарегистрироваться');
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

        const resetToken = this._consumeResetTokenFromUrl();
        if (resetToken && mode === 'login') {
            mode = 'reset';
        }

        this.mode = mode;
        this.updateModalView();

        if (resetToken && mode === 'reset') {
            const tokenInput = document.getElementById('resetModalToken');
            if (tokenInput) {
                tokenInput.value = resetToken;
            }
        }

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
