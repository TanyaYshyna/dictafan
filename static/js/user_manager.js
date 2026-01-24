class UserManager {
  constructor() {
    if (window.UM) {
      // console.warn('⚠️ UserManager уже создан, возвращаем существующий экземпляр');
      return window.UM;
    }

    this.token = localStorage.getItem('jwt_token');
    this.userData = null;
    this.isInitialized = false;


    // ✅ АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ
    this.init().then(() => {
      // console.log('✅ UserManager авто-инициализирован');
    });
  }

  getSafeEmail() {
    if (this.userData && this.userData.email) {
      return this.userData.email.replace('@', '_at_').replace('.', '_dot_');
    }
    return 'anonymous';
  }

  isAuthenticated() {
    return !!this.userData;
  }

  getCurrentUser() {
    return this.userData;
  }
  // Инициализация пользователя
  async init() {
    try {
      console.log('🔄 Инициализация UserManager, токен:', this.token ? 'есть' : 'нет');

      if (this.token) {
        console.log('🔐 Валидируем токен...');
        this.userData = await this.validateToken(this.token);
        console.log('✅ Валидация токена завершена, userData:', this.userData ? 'есть' : 'null');

        if (this.userData) {
          // console.log('✅ Пользователь авторизован:', this.userData.username);
          this.setupAuthenticatedUser(this.userData);
        } else {
          console.log('❌ Токен невалиден, очищаем и показываем модальное окно');
          localStorage.removeItem('jwt_token');
          this.token = null;
          // Показываем модальное окно авторизации - гостевого режима нет!
          this.requireAuth();
        }
      } else {
        console.log('❌ Нет токена - показываем модальное окно авторизации');
        // Нет токена - показываем модальное окно авторизации - гостевого режима нет!
        this.requireAuth();
      }

      this.setupAuthHandlers();
      this.isInitialized = true;
      // console.log('✅ UserManager инициализирован');

    } catch (error) {
      console.error('🚨 Ошибка инициализации пользователя:', error);
      // Показываем модальное окно авторизации при ошибке - гостевого режима нет!
      this.requireAuth();
    }
  }

  // Требовать авторизацию - показываем модальное окно
  requireAuth() {
    // Не показываем модальное окно, если пользователь уже авторизован
    if (this.isAuthenticated()) {
      console.log('✅ Пользователь авторизован, модальное окно не показываем');
      return;
    }

    console.log('🔐 Требуем авторизацию - показываем модальное окно');

    // Проверяем, подключен ли скрипт login_modal.js в HTML
    const scriptExists = document.querySelector('script[src*="login_modal.js"]');
    
    // Проверяем, определен ли LoginModal или window.loginModal
    if (typeof LoginModal !== 'undefined' || window.loginModal) {
      // Модальное окно уже загружено, показываем его
      console.log('✅ LoginModal уже загружен, показываем модальное окно');
      if (window.loginModal) {
        window.loginModal.show();
      } else if (typeof LoginModal !== 'undefined') {
        LoginModal.show();
      }
      return;
    }
    
    // Если скрипт подключен в HTML, но еще не выполнился, ждем
    if (scriptExists) {
      console.log('⏳ Скрипт login_modal.js подключен в HTML, ждём загрузки');
      // Ждем загрузки скрипта (максимум 3 секунды)
      let attempts = 0;
      const maxAttempts = 60;
      const checkInterval = setInterval(() => {
        attempts++;
        if (typeof LoginModal !== 'undefined' || window.loginModal) {
          clearInterval(checkInterval);
          console.log('✅ LoginModal загружен, показываем модальное окно');
          if (window.loginModal) {
            window.loginModal.show();
          } else if (typeof LoginModal !== 'undefined') {
            LoginModal.show();
          }
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.error('❌ LoginModal не загрузился за 3 секунды');
        }
      }, 50);
      return;
    }
    
    // Если скрипт не подключен в HTML, загружаем его динамически
    console.log('📦 LoginModal не найден, загружаем скрипт');
    const script = document.createElement('script');
    script.src = '/static/js/login_modal.js';
    script.onload = () => {
      console.log('✅ Скрипт login_modal.js загружен');
      // Небольшая задержка, чтобы класс успел определиться
      setTimeout(() => {
        if (window.loginModal) {
          window.loginModal.show();
        } else if (typeof LoginModal !== 'undefined') {
          LoginModal.show();
        } else {
          console.error('❌ Модальное окно не найдено после загрузки скрипта');
        }
      }, 100);
    };
    script.onerror = () => {
      console.error('❌ Ошибка загрузки скрипта login_modal.js');
    };
    document.head.appendChild(script);
  }

  // Получение URL аватара
  getAvatarUrl(size = 'small') {

    if (!this.userData?.avatar) {
      return null;
    }

    // avatar - объект с полями large и small
    const avatarUrl = this.userData.avatar[size];

    return avatarUrl || null;
  }

  // Валидация токена
  async validateToken(token) {
    try {
      // console.log('🔐 Валидация токена:', token);

      const response = await fetch('/user/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // console.log('📡 Статус ответа:', response.status);

      if (response.ok) {
        const userData = await response.json();
        // console.log('✅ Данные пользователя получены:', userData);
        return userData;
      } else {
        // console.log('❌ Ошибка валидации, статус:', response.status);
        // Попробуем прочитать текст ошибки
        try {
          const errorText = await response.text();
          // console.log('📄 Текст ошибки:', errorText);
        } catch (e) {
          // console.log('Не удалось прочитать текст ошибки');
        }
        return null;
      }
    } catch (error) {
      console.error('🚨 Ошибка валидации токена:', error);
      return null;
    }
  }

  // Выход
  logout() {
    localStorage.removeItem('jwt_token');
    // console.log('✅✅✅✅✅✅ 2 ✅token  Выход', this.token);
    this.token = null;
    this.userData = null;
    // Показываем модальное окно авторизации после выхода - гостевого режима нет!
    this.requireAuth();
  }

  // Настройка авторизованного пользователя
  setupAuthenticatedUser(userData) {
    const userSection = document.getElementById('user-section');
    if (!userSection) {
      // Это нормально на страницах, где нет элемента user-section (например, страница профиля)
      console.log('ℹ️ user-section не найден в DOM - это нормально');
      return;
    }

    // console.log('🔄 Настройка интерфейса для авторизованного пользователя');

    // Находим блоки
    const authButtons = userSection.querySelector('.auth-buttons');
    const userInfo = userSection.querySelector('.user-info');
    const usernameElement = userSection.querySelector('.username-text');
    const avatarElement = userSection.querySelector('.user-avatar-small');
    const streakElement = userSection.querySelector('.streak-days');

    // console.log('📋 Найденные элементы:', {
    //   authButtons,
    //   userInfo,
    //   usernameElement,
    //   avatarElement,
    //   streakElement
    // });

    // Заполняем данные пользователя
    if (usernameElement) {
      usernameElement.textContent = userData.username || 'Пользователь';
    }

    // Аватар
    if (avatarElement && userData.avatar) {
      const avatarUrl = this.getAvatarUrl('small');

      if (avatarUrl) {
        // Добавляем временную метку для избежания кэширования
        const avatarUrlWithTimestamp = `${avatarUrl}&t=${Date.now()}`;
        avatarElement.style.backgroundImage = `url(${avatarUrlWithTimestamp})`;
        avatarElement.style.backgroundSize = 'cover';
        avatarElement.style.backgroundPosition = 'center';
        avatarElement.style.width = '32px';
        avatarElement.style.height = '32px';
        avatarElement.style.borderRadius = '50%';
        avatarElement.style.display = 'block';
      } else {
        console.warn('⚠️ URL аватара не получен');
        // Установите аватар по умолчанию
        avatarElement.style.backgroundImage = 'url(/static/icons/default-avatar-small.svg)';
      }
    }

    // Streak
    if (streakElement) {
      streakElement.textContent = userData.streak_days || 0;
    }

    // Переключаем видимость блоков
    if (authButtons) authButtons.style.display = 'none';
    if (userInfo) userInfo.style.display = 'flex';

    // console.log('✅ Интерфейс настроен для авторизованного пользователя');
  }

  // Гостевой режим
  // Гостевой режим удален - всегда требуем авторизацию!
  // Эта функция оставлена для обратной совместимости, но теперь просто показывает модальное окно
  setupGuestMode() {
    // Гостевого режима больше нет - всегда требуем авторизацию
    this.requireAuth();
  }



  // Обработчики аутентификации
  setupAuthHandlers() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        // Показываем модальное окно логина вместо перехода на страницу
        if (window.loginModal) {
          window.loginModal.show('login');
        } else if (typeof LoginModal !== 'undefined') {
          LoginModal.show('login');
        } else {
          window.location.href = 'user/login';
        }
      });
    }

    if (registerBtn) {
      registerBtn.addEventListener('click', () => {
        // Показываем модальное окно регистрации вместо перехода на страницу
        if (window.loginModal) {
          window.loginModal.show('register');
        } else if (typeof LoginModal !== 'undefined') {
          LoginModal.show('register');
        } else {
          window.location.href = 'user/register';
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  // Сохранение прогресса
  async saveProgress(progressData) {
    try {
      if (!this.token) {
        console.log('Пользователь не авторизован, прогресс не сохранен');
        return false;
      }

      const response = await fetch('/api/progress/save', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(progressData)
      });

      if (response.ok) {
        console.log('Прогресс успешно сохранен');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка при сохранении прогресса:', error);
      return false;
    }
  }

  // Загрузка прогресса
  async loadProgress() {
    try {
      if (!this.token) {
        console.log('Пользователь не авторизован, прогресс не загружен');
        return null;
      }

      const response = await fetch('/api/progress/load', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Ошибка при загрузке прогресса:', error);
      return null;
    }
  }

  async login(email, password) {
    try {
      console.log('🎯 Попытка входа с ' + email);

      const response = await fetch('/user/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      // Читаем ответ ТОЛЬКО ОДИН РАЗ
      const data = await response.json();
      console.log('🔐 Ответ от сервера:', data);

      if (response.ok) {
        // Используем access_token вместо token
        const token = data.access_token;
        console.log('💾 Сохраняем токен:', token);

        localStorage.setItem('jwt_token', token);
        this.token = token;
        this.userData = data.user;

        // Обновляем UI
        this.setupAuthenticatedUser(this.userData);

        // Скрываем модальное окно логина, если оно открыто
        if (window.loginModal && window.loginModal.isVisible) {
          window.loginModal.hide();
        }

        // Отправляем событие о успешном логине
        window.dispatchEvent(new CustomEvent('user-logged-in', { detail: { user: this.userData } }));

        return { success: true, user: this.userData };
      } else {
        return { success: false, error: data.error || 'Ошибка входа' };
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      return { success: false, error: 'Сетевая ошибка' };
    }
  }


  async register(arg1, arg2, arg3) {
    const payload = normalizeRegisterArgs(arg1, arg2, arg3);
    const {
      username,
      email,
      password,
      nativeLanguage,
      learningLanguage,
      learningLanguages,
    } = payload;

    if (!username || !email || !password) {
      return { success: false, error: 'Не все обязательные поля заполнены' };
    }

    try {
      const response = await fetch('/user/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          email,
          password,
          native_language: nativeLanguage,
          learning_language: learningLanguage,
          learning_languages: learningLanguages
        })
      });

      // Читаем ответ ТОЛЬКО ОДИН РАЗ
      const data = await response.json();

      if (response.ok) {
        // Используем access_token вместо token
        const token = data.access_token;
        localStorage.setItem('jwt_token', token);
        this.token = token;
        this.userData = data.user;

        this.setupAuthenticatedUser(this.userData);
        
        // Скрываем модальное окно логина, если оно открыто
        if (window.loginModal && window.loginModal.isVisible) {
          window.loginModal.hide();
        }
        
        // Отправляем событие о успешной регистрации
        window.dispatchEvent(new CustomEvent('user-logged-in', { detail: { user: this.userData } }));
        
        return { success: true, user: this.userData };
      } else {
        return { success: false, error: data.error || 'Ошибка регистрации' };
      }
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      return { success: false, error: 'Сетевая ошибка' };
    }
  }

  async updateProfile(updateData) {
    try {
      const response = await fetch('/user/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const updatedUser = await response.json();
        this.userData = updatedUser.user;
        return updatedUser.user;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка обновления профиля');
      }
    } catch (error) {
      console.error('Ошибка обновления профиля:', error);
      throw error;
    }
  }

  async uploadAvatar(file) {
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/user/api/avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        // Обновляем userData с новой информацией об аватаре
        if (this.userData) {
          this.userData.avatar = {
            large: result.avatar_urls.large,
            small: result.avatar_urls.small,
            uploaded: new Date().toISOString()
          };
        }
        
        // Также обновляем данные с сервера
        const userResponse = await fetch('/user/api/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (userResponse.ok) {
          const updatedUserData = await userResponse.json();
          // Убираем пароль из данных
          if ('password' in updatedUserData) {
            delete updatedUserData.password;
          }
          this.userData = updatedUserData;
        }
        
        return result;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка загрузки аватара');
      }
    } catch (error) {
      console.error('Ошибка загрузки аватара:', error);
      throw error;
    }
  }

}



function normalizeRegisterArgs(arg1, arg2, arg3) {
  if (typeof arg1 === 'object' && arg1 !== null) {
    const {
      username = '',
      email = '',
      password = '',
      nativeLanguage = 'ru',
      learningLanguage = 'en',
      learningLanguages,
    } = arg1;

    const normalizedLearning = Array.isArray(learningLanguages) && learningLanguages.length
      ? [...new Set(learningLanguages.map((lang) => (lang || '').toLowerCase()).filter(Boolean))]
      : [learningLanguage.toLowerCase()];

    if (!normalizedLearning.includes(learningLanguage.toLowerCase())) {
      normalizedLearning.push(learningLanguage.toLowerCase());
    }

    return {
      username,
      email,
      password,
      nativeLanguage: nativeLanguage.toLowerCase(),
      learningLanguage: learningLanguage.toLowerCase(),
      learningLanguages: normalizedLearning,
    };
  }

  return {
    username: arg1,
    email: arg2,
    password: arg3,
    nativeLanguage: 'ru',
    learningLanguage: 'en',
    learningLanguages: ['en'],
  };
}

if (!window.UM) {
  window.UM = new UserManager();
}