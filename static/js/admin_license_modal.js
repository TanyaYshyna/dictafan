/**
 * admin_license_modal.js
 *
 * Админ-панель управления лицензиями.
 */

(function () {
    'use strict';

    const MODAL_ID = 'adminLicenseModal';

    let modalEl = null;
    let currentUserId = null;
    let currentUserEmail = null;

    // ----------------------------------------------------------------
    // Инициализация
    // ----------------------------------------------------------------
    function init() {
        modalEl = document.getElementById(MODAL_ID);
        if (!modalEl) return;

        // Закрытие
        var closeBtn = document.getElementById('adminLicenseModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) {
                closeModal();
            }
        });

        // Поиск пользователя
        var searchBtn = document.getElementById('adminLicenseSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', searchUser);
        }

        var searchInput = document.getElementById('adminLicenseSearchEmail');
        if (searchInput) {
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') searchUser();
            });
        }

        // Выдача лицензии
        var grantBtn = document.getElementById('adminLicenseGrantBtn');
        if (grantBtn) {
            grantBtn.addEventListener('click', grantLicense);
        }
    }

    // ----------------------------------------------------------------
    // Открыть / закрыть
    // ----------------------------------------------------------------
    function openModal() {
        if (!modalEl) return;
        resetForm();
        modalEl.style.display = 'flex';
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

    function resetForm() {
        currentUserId = null;
        currentUserEmail = null;

        var grantForm = document.getElementById('adminLicenseGrantForm');
        var historySection = document.getElementById('adminLicenseHistorySection');
        var calendarSection = document.getElementById('adminLicenseCalendarSection');
        var searchResult = document.getElementById('adminLicenseSearchResult');
        var grantMessage = document.getElementById('adminLicenseGrantMessage');

        if (grantForm) grantForm.style.display = 'none';
        if (historySection) historySection.style.display = 'none';
        if (calendarSection) calendarSection.style.display = 'none';
        if (searchResult) { searchResult.style.display = 'none'; searchResult.innerHTML = ''; }
        if (grantMessage) { grantMessage.style.display = 'none'; grantMessage.textContent = ''; }

        var searchInput = document.getElementById('adminLicenseSearchEmail');
        if (searchInput) searchInput.value = '';
    }

    // ----------------------------------------------------------------
    // API-хелпер
    // ----------------------------------------------------------------
    function getToken() {
        try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
    }

    function apiGet(url) {
        return fetch(url, {
            headers: { 'Authorization': 'Bearer ' + (getToken() || '') }
        }).then(function (r) { return r.json(); });
    }

    function apiPost(url, body) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (getToken() || ''),
            },
            body: JSON.stringify(body),
        }).then(function (r) { return r.json(); });
    }

    // ----------------------------------------------------------------
    // Поиск пользователя
    // ----------------------------------------------------------------
    function searchUser() {
        var input = document.getElementById('adminLicenseSearchEmail');
        var resultDiv = document.getElementById('adminLicenseSearchResult');
        if (!input || !resultDiv) return;

        var email = input.value.trim();
        if (!email) return;

        apiGet('/api/admin/license/find_user?email=' + encodeURIComponent(email))
            .then(function (data) {
                if (!data.success || !data.users || data.users.length === 0) {
                    resultDiv.innerHTML = '<p style="color: #999; font-size: 14px;">Пользователь не найден</p>';
                    resultDiv.style.display = 'block';
                    return;
                }

                var html = '';
                data.users.forEach(function (u) {
                    html += '<div class="user-item" data-user-id="' + u.id + '" data-user-email="' + escapeHtml(u.email) + '">';
                    html += '<div><div class="user-email">' + escapeHtml(u.email) + '</div>';
                    html += '<div class="user-name">' + escapeHtml(u.username || '') + '</div></div>';
                    html += '<i data-lucide="arrow-right"></i>';
                    html += '</div>';
                });

                resultDiv.innerHTML = html;
                resultDiv.style.display = 'block';

                try {
                    if (window.lucide && typeof window.lucide.createIcons === 'function') {
                        window.lucide.createIcons({ attrs: {} });
                    }
                } catch (e) {}

                // Клик по пользователю
                resultDiv.querySelectorAll('.user-item').forEach(function (item) {
                    item.addEventListener('click', function () {
                        selectUser(
                            parseInt(item.getAttribute('data-user-id')),
                            item.getAttribute('data-user-email')
                        );
                    });
                });
            })
            .catch(function () {
                resultDiv.innerHTML = '<p style="color: #c62828; font-size: 14px;">Ошибка поиска</p>';
                resultDiv.style.display = 'block';
            });
    }

    function selectUser(userId, email) {
        currentUserId = userId;
        currentUserEmail = email;

        var grantForm = document.getElementById('adminLicenseGrantForm');
        var historySection = document.getElementById('adminLicenseHistorySection');
        var calendarSection = document.getElementById('adminLicenseCalendarSection');

        if (grantForm) grantForm.style.display = 'block';
        if (historySection) historySection.style.display = 'block';
        if (calendarSection) calendarSection.style.display = 'block';

        loadHistory(userId);
        loadCalendar(userId);
    }

    // ----------------------------------------------------------------
    // История
    // ----------------------------------------------------------------
    function loadHistory(userId) {
        var tableWrap = document.getElementById('adminLicenseHistoryTable');
        if (!tableWrap) return;

        apiGet('/api/admin/license/history/' + userId)
            .then(function (data) {
                if (!data.success || !data.history) {
                    tableWrap.innerHTML = '<p style="color: #999;">Нет данных</p>';
                    return;
                }

                var rows = data.history.map(function (op) {
                    return '<tr>' +
                        '<td>' + escapeHtml(op.license_type) + '</td>' +
                        '<td>' + escapeHtml(op.document_type) + '</td>' +
                        '<td>' + escapeHtml(op.date_begin) + '</td>' +
                        '<td>' + (op.days === 0 ? '∞' : op.days) + '</td>' +
                        '<td>' + escapeHtml(op.comment || '') + '</td>' +
                        '<td>' + escapeHtml(formatDate(op.created_at)) + '</td>' +
                        '</tr>';
                }).join('');

                tableWrap.innerHTML =
                    '<table>' +
                    '<thead><tr><th>Лицензия</th><th>Тип</th><th>Начало</th><th>Дней</th><th>Комментарий</th><th>Создана</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                    '</table>';
            })
            .catch(function () {
                tableWrap.innerHTML = '<p style="color: #c62828;">Ошибка загрузки</p>';
            });
    }

    // ----------------------------------------------------------------
    // Календарь
    // ----------------------------------------------------------------
    function loadCalendar(userId) {
        var tableWrap = document.getElementById('adminLicenseCalendarTable');
        if (!tableWrap) return;

        apiGet('/api/admin/license/calendar/' + userId)
            .then(function (data) {
                if (!data.success || !data.calendar) {
                    tableWrap.innerHTML = '<p style="color: #999;">Нет данных</p>';
                    return;
                }

                var rows = data.calendar.map(function (entry) {
                    return '<tr>' +
                        '<td>' + escapeHtml(entry.date) + '</td>' +
                        '<td>' + escapeHtml(entry.role_code) + '</td>' +
                        '<td>' + escapeHtml(entry.source_document_type) + '</td>' +
                        '</tr>';
                }).join('');

                tableWrap.innerHTML =
                    '<table>' +
                    '<thead><tr><th>Дата</th><th>Роль</th><th>Источник</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                    '</table>';
            })
            .catch(function () {
                tableWrap.innerHTML = '<p style="color: #c62828;">Ошибка загрузки</p>';
            });
    }

    // ----------------------------------------------------------------
    // Выдача лицензии
    // ----------------------------------------------------------------
    function grantLicense() {
        if (!currentUserId || !currentUserEmail) return;

        var typeSelect = document.getElementById('adminLicenseTypeSelect');
        var daysInput = document.getElementById('adminLicenseDaysInput');
        var commentInput = document.getElementById('adminLicenseCommentInput');
        var msgEl = document.getElementById('adminLicenseGrantMessage');
        var grantBtn = document.getElementById('adminLicenseGrantBtn');

        var licenseType = typeSelect ? typeSelect.value : 'Free';
        var days = daysInput ? parseInt(daysInput.value) || 30 : 30;
        var comment = commentInput ? commentInput.value.trim() : '';

        if (grantBtn) grantBtn.disabled = true;
        if (msgEl) { msgEl.style.display = 'none'; }

        apiPost('/api/admin/license/grant', {
            email: currentUserEmail,
            license_type: licenseType,
            days: days,
            comment: comment,
        })
            .then(function (data) {
                if (msgEl) {
                    msgEl.textContent = data.success
                        ? '✅ ' + data.message
                        : '❌ ' + (data.error || 'Ошибка');
                    msgEl.className = 'admin-license-message ' + (data.success ? 'success' : 'error');
                    msgEl.style.display = 'block';
                }
                if (data.success) {
                    loadHistory(currentUserId);
                    loadCalendar(currentUserId);
                }
            })
            .catch(function () {
                if (msgEl) {
                    msgEl.textContent = '❌ Ошибка соединения';
                    msgEl.className = 'admin-license-message error';
                    msgEl.style.display = 'block';
                }
            })
            .finally(function () {
                if (grantBtn) grantBtn.disabled = false;
            });
    }

    // ----------------------------------------------------------------
    // Вспомогательные
    // ----------------------------------------------------------------
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            return d.toISOString().slice(0, 10);
        } catch (e) {
            return dateStr;
        }
    }

    // ----------------------------------------------------------------
    // Публичный API
    // ----------------------------------------------------------------
    window.AdminLicenseModal = {
        open: openModal,
        close: closeModal,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
