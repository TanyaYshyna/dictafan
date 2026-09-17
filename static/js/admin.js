/**
 * admin.js
 *
 * Отдельная страница администратора (/admin).
 * Пульт управления админскими задачами:
 *   - закладка «Управление лицензиями» (перенесена из admin_license_modal.js)
 *   - закладка «Права пользователей»
 */
(function () {
    'use strict';

    let currentUserId = null;
    let currentUserEmail = null;

    // ----------------------------------------------------------------
    // Инициализация
    // ----------------------------------------------------------------
    function init() {
        bindTabs();
        bindLicenseSection();
        bindPermissionsSection();
        bindToolbar();

        // Дождёмся инициализации UserManager (user_manager.js загружается в base.html)
        checkAccess();

        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ attrs: {} });
            }
        } catch (e) {}
    }

    // ----------------------------------------------------------------
    // Проверка доступа
    // ----------------------------------------------------------------
    function checkAccess() {
        const panelEmpty = document.getElementById('adminPanelEmpty');
        const panelBody = document.getElementById('adminPanelBody');

        function grant() {
            if (panelEmpty) panelEmpty.style.display = 'none';
            if (panelBody) panelBody.style.display = 'block';
        }

        function deny() {
            if (panelEmpty) panelEmpty.style.display = 'block';
            if (panelBody) panelBody.style.display = 'none';
        }

        const userData = (window.UM && window.UM.userData) || null;

        // Если UserManager ещё не закончил инициализацию — ждём.
        if (!userData) {
            let attempts = 0;
            const maxAttempts = 100;
            const timer = setInterval(function () {
                attempts++;
                const ud = (window.UM && window.UM.userData) || null;
                if (ud) {
                    clearInterval(timer);
                    decide(ud);
                } else if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    deny();
                }
            }, 100);
            return;
        }

        decide(userData);

        function decide(ud) {
            const roleCode = String(ud.role_code || '').toLowerCase();
            // Право access_admin_panel есть только у роли admin (см. role_permissions seed)
            if (roleCode === 'admin') {
                grant();
            } else {
                deny();
            }
        }
    }

    // ----------------------------------------------------------------
    // Закладки
    // ----------------------------------------------------------------
    function bindTabs() {
        const tabs = document.querySelectorAll('.admin-panel__tab-btn[data-tab]');
        tabs.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const tab = btn.getAttribute('data-tab');
                tabs.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');

                document.querySelectorAll('.admin-panel__tab-content').forEach(function (c) {
                    c.classList.remove('active');
                });
                const target = document.getElementById('admin-tab-' + tab);
                if (target) target.classList.add('active');
            });
        });
    }

    // ----------------------------------------------------------------
    // Панель инструментов (кнопки, перенесённые с рабочего стола)
    // ----------------------------------------------------------------
    let toastTimer = null;

    function showToast(message, type) {
        var el = document.getElementById('adminToast');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'admin-toast' + (type ? ' ' + type : '');
        el.style.display = 'block';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.style.display = 'none';
        }, 3000);
    }

    function clearHistoryCurrentCache() {
        try {
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('history_current:') === 0) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) {}
    }

    function bindToolbar() {
        document.querySelectorAll('.admin-toolbar__btn[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var action = btn.getAttribute('data-action');

                if (action === 'admin-mult-preview') {
                    openMultPreview();
                } else if (action === 'admin-active-dictations') {
                    openActiveDictations();
                } else if (action === 'admin-audio-cache') {
                    openAudioCache();
                } else if (action === 'admin-recalc-history') {
                    recalcHistory();
                } else if (action === 'admin-recalc-all') {
                    recalcAll();
                }
            });
        });
    }

    function openMultPreview() {
        try {
            if (window.MultManager && typeof window.MultManager.openPreview === 'function') {
                window.MultManager.openPreview();
            } else {
                showToast('Менеджер мультфильмов не загружен', 'error');
            }
        } catch (e) {
            showToast('Ошибка открытия предпросмотра мультфильмов', 'error');
        }
    }

    function openActiveDictations() {
        try {
            if (window.ActiveDictationsModal && typeof window.ActiveDictationsModal.open === 'function') {
                window.ActiveDictationsModal.open();
            } else {
                showToast('Модалка активных диктантов не загружена', 'error');
            }
        } catch (e) {
            showToast('Ошибка открытия списка активных диктантов', 'error');
        }
    }

    function openAudioCache() {
        try {
            if (window.AudioCacheModal && typeof window.AudioCacheModal.open === 'function') {
                window.AudioCacheModal.open();
            } else {
                showToast('Модалка аудио-кэша не загружена', 'error');
            }
        } catch (e) {
            showToast('Ошибка открытия списка аудио в кэше', 'error');
        }
    }

    function recalcHistory() {
        apiPost('/api/statistics/success/recalc', {})
            .then(function (data) {
                if (data && data.success) {
                    clearHistoryCurrentCache();
                    showToast('history_current пересчитан', 'success');
                } else {
                    showToast((data && data.error) ? data.error : 'Ошибка пересчёта history_current', 'error');
                }
            })
            .catch(function () {
                showToast('Ошибка соединения при пересчёте history_current', 'error');
            });
    }

    function recalcAll() {
        apiPost('/api/statistics/success/recalc_all', {})
            .then(function (data) {
                if (data && data.success) {
                    clearHistoryCurrentCache();
                    showToast('Количество проходов пересчитано по всем диктантам', 'success');
                } else {
                    showToast((data && data.error) ? data.error : 'Ошибка пересчёта количества проходов', 'error');
                }
            })
            .catch(function () {
                showToast('Ошибка соединения при пересчёте количества проходов', 'error');
            });
    }

    // ----------------------------------------------------------------
    // API-хелперы
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
    // Вкладка «Управление лицензиями»
    // ----------------------------------------------------------------
    function bindLicenseSection() {
        var searchBtn = document.getElementById('adminLicenseSearchBtn');
        if (searchBtn) searchBtn.addEventListener('click', searchUser);

        var searchInput = document.getElementById('adminLicenseSearchEmail');
        if (searchInput) {
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') searchUser();
            });
        }

        var grantBtn = document.getElementById('adminLicenseGrantBtn');
        if (grantBtn) grantBtn.addEventListener('click', grantLicense);
    }

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
    // Вкладка «Права пользователей»
    // ----------------------------------------------------------------
    let permissionsUserId = null;

    function bindPermissionsSection() {
        var searchBtn = document.getElementById('adminPermissionsSearchBtn');
        if (searchBtn) searchBtn.addEventListener('click', searchPermissionUser);

        var searchInput = document.getElementById('adminPermissionsSearchEmail');
        if (searchInput) {
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') searchPermissionUser();
            });
        }

        var saveBtn = document.getElementById('adminPermissionsSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveRole);
    }

    function searchPermissionUser() {
        var input = document.getElementById('adminPermissionsSearchEmail');
        var resultDiv = document.getElementById('adminPermissionsSearchResult');
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

                resultDiv.querySelectorAll('.user-item').forEach(function (item) {
                    item.addEventListener('click', function () {
                        selectPermissionUser(parseInt(item.getAttribute('data-user-id')));
                    });
                });
            })
            .catch(function () {
                resultDiv.innerHTML = '<p style="color: #c62828; font-size: 14px;">Ошибка поиска</p>';
                resultDiv.style.display = 'block';
            });
    }

    function selectPermissionUser(userId) {
        permissionsUserId = userId;

        var form = document.getElementById('adminPermissionsRoleForm');
        if (form) form.style.display = 'block';

        loadRole(userId);
    }

    function loadRole(userId) {
        apiGet('/api/admin/user/' + userId + '/role')
            .then(function (data) {
                var badge = document.getElementById('adminPermissionsCurrentRole');
                var select = document.getElementById('adminPermissionsRoleSelect');
                if (!data.success) {
                    if (badge) badge.textContent = 'Ошибка загрузки';
                    return;
                }

                var currentRole = data.current_role || {};
                if (badge) {
                    badge.textContent = currentRole.code
                        ? currentRole.code + ' — ' + (currentRole.name || '')
                        : 'Роль не задана';
                }

                if (select && data.roles) {
                    select.innerHTML = data.roles.map(function (r) {
                        var selected = currentRole.code === r.code ? ' selected' : '';
                        return '<option value="' + escapeHtml(r.code) + '"' + selected + '>' +
                            escapeHtml(r.name) + ' (' + escapeHtml(r.code) + ')</option>';
                    }).join('');
                }
            })
            .catch(function () {
                var badge = document.getElementById('adminPermissionsCurrentRole');
                if (badge) badge.textContent = 'Ошибка загрузки';
            });
    }

    function saveRole() {
        if (!permissionsUserId) return;

        var select = document.getElementById('adminPermissionsRoleSelect');
        var msgEl = document.getElementById('adminPermissionsMessage');
        var saveBtn = document.getElementById('adminPermissionsSaveBtn');
        if (!select) return;

        var roleCode = select.value;

        if (saveBtn) saveBtn.disabled = true;
        if (msgEl) msgEl.style.display = 'none';

        apiPost('/api/admin/user/' + permissionsUserId + '/role', { role_code: roleCode })
            .then(function (data) {
                if (msgEl) {
                    msgEl.textContent = data.success
                        ? '✅ ' + data.message
                        : '❌ ' + (data.error || 'Ошибка');
                    msgEl.className = 'admin-license-message ' + (data.success ? 'success' : 'error');
                    msgEl.style.display = 'block';
                }
                if (data.success) {
                    loadRole(permissionsUserId);
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
                if (saveBtn) saveBtn.disabled = false;
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
