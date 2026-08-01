/**
 * license_purchase_modal.js
 *
 * Модальное окно покупки лицензии (заглушка без реальной оплаты).
 */

(function () {
    'use strict';

    const MODAL_ID = 'licensePurchaseModal';
    const MESSAGE_ID = 'licensePurchaseMessage';

    let modalEl = null;
    let messageEl = null;

    // ----------------------------------------------------------------
    // Инициализация при загрузке DOM
    // ----------------------------------------------------------------
    function init() {
        modalEl = document.getElementById(MODAL_ID);
        messageEl = document.getElementById(MESSAGE_ID);
        if (!modalEl) return;

        // Закрытие по кнопке
        const closeBtn = modalEl.querySelector('#licensePurchaseModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Закрытие по клику на оверлей
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) {
                closeModal();
            }
        });

        // Кнопки покупки
        const purchaseBtns = modalEl.querySelectorAll('[data-action="purchase-license"]');
        purchaseBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const card = btn.closest('.license-plan-card');
                if (!card) return;
                const licenseType = card.getAttribute('data-license');
                if (licenseType) {
                    purchaseLicense(licenseType, btn);
                }
            });
        });
    }

    // ----------------------------------------------------------------
    // Открыть / закрыть
    // ----------------------------------------------------------------
    function openModal() {
        if (!modalEl) return;
        hideMessage();
        modalEl.style.display = 'flex';
        // Пересоздать иконки lucide внутри модалки
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ attrs: {} });
            }
        } catch (e) {}
    }

    function closeModal() {
        if (!modalEl) return;
        modalEl.style.display = 'none';
    }

    // ----------------------------------------------------------------
    // Сообщение
    // ----------------------------------------------------------------
    function showMessage(text, type) {
        if (!messageEl) return;
        messageEl.textContent = text;
        messageEl.className = 'license-purchase-message ' + (type || 'success');
        messageEl.style.display = 'block';
    }

    function hideMessage() {
        if (!messageEl) return;
        messageEl.style.display = 'none';
        messageEl.textContent = '';
        messageEl.className = 'license-purchase-message';
    }

    // ----------------------------------------------------------------
    // Покупка (заглушка)
    // ----------------------------------------------------------------
    function purchaseLicense(licenseType, btnEl) {
        hideMessage();

        // Блокируем кнопку на время запроса
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = '...';
        }

        var token = null;
        try {
            token = localStorage.getItem('jwt_token');
        } catch (e) {}

        fetch('/api/license/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (token || ''),
            },
            body: JSON.stringify({ license_type: licenseType }),
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    showMessage(
                        'Лицензия «' + licenseType + '» успешно активирована!',
                        'success'
                    );

                    // Обновить данные пользователя через user_manager
                    try {
                        if (window.UserManager && typeof window.UserManager.fetchUser === 'function') {
                            window.UserManager.fetchUser();
                        }
                    } catch (e) {}

                    // Закрыть через 2 секунды
                    setTimeout(function () {
                        closeModal();
                        // Перезагрузить страницу для обновления UI
                        window.location.reload();
                    }, 2000);
                } else {
                    showMessage(
                        'Ошибка: ' + (data.error || 'Неизвестная ошибка'),
                        'error'
                    );
                }
            })
            .catch(function (err) {
                showMessage('Ошибка соединения: ' + err.message, 'error');
            })
            .finally(function () {
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.textContent = licenseType === 'Free' ? 'Активировать' : 'Купить';
                }
            });
    }

    // ----------------------------------------------------------------
    // Публичный API
    // ----------------------------------------------------------------
    window.LicensePurchaseModal = {
        open: openModal,
        close: closeModal,
    };

    // Авто-инициализация
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
