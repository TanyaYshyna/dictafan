/**
 * Перехватчик для обработки ошибок авторизации (401)
 * Автоматически показывает модальное окно логина при потере авторизации
 */

(function() {
    'use strict';

    // Сохраняем оригинальный fetch
    const originalFetch = window.fetch;

    // Переопределяем fetch
    window.fetch = async function(...args) {
        // Вызываем оригинальный fetch
        const response = await originalFetch.apply(this, args);

        // Проверяем статус 401 (Unauthorized)
        if (response.status === 401) {
            // Проверяем, что это не запрос на логин или регистрацию
            const url = args[0];
            const urlString = typeof url === 'string' ? url : url?.url || '';
            
            if (urlString.includes('/api/login') || 
                urlString.includes('/api/register')) {
                // Это запрос на логин/регистрацию, не обрабатываем
                return response;
            }

            // Проверяем, что пользователь действительно не авторизован
            if (window.UM && window.UM.isAuthenticated && window.UM.isAuthenticated()) {
                // Пользователь был авторизован, но токен истек
                console.log('⚠️ Токен истек или невалиден, требуется повторная авторизация');
                
                // Очищаем токен
                if (window.UM) {
                    window.UM.token = null;
                    window.UM.userData = null;
                    localStorage.removeItem('jwt_token');
                    // Показываем модальное окно авторизации - гостевого режима нет!
                    if (window.UM) {
                        window.UM.requireAuth();
                    }
                }

                // Показываем модальное окно логина
                showLoginModal();
            } else {
                // Пользователь не был авторизован, показываем модальное окно
                showLoginModal();
            }
        }

        return response;
    };

    /**
     * Показать модальное окно логина
     */
    function showLoginModal() {
        // Загружаем скрипт модального окна, если он еще не загружен
        if (typeof LoginModal === 'undefined') {
            // Проверяем, не загружается ли уже скрипт
            if (document.querySelector('script[src="/static/js/login_modal.js"]')) {
                return;
            }

            const script = document.createElement('script');
            script.src = '/static/js/login_modal.js';
            script.onload = () => {
                if (window.loginModal) {
                    window.loginModal.show();
                } else if (LoginModal) {
                    LoginModal.show();
                }
            };
            document.head.appendChild(script);
        } else {
            // Модальное окно уже загружено, показываем его
            if (window.loginModal) {
                window.loginModal.show();
            } else if (LoginModal) {
                LoginModal.show();
            }
        }
    }

    // Экспортируем функцию для ручного вызова
    window.showLoginModal = showLoginModal;
})();

