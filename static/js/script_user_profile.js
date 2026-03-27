let UM;
let language_selector;
let originalData = {};
let hasUnsavedChanges = false;
let isSavingProfile = false;
let pendingAvatarBlob = null;

let profileTestRecorder = null;
let profileTestMediaStream = null;
let profileTestChunks = [];
let profileTestIsRecording = false;
let profileTestTimerId = null;
let profileTestAutoStopId = null;

function createLucideToggleButton({ checked, title, disabled }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'groups-lucide-toggle';
    btn.title = title || '';
    btn.disabled = Boolean(disabled);
    btn.dataset.checked = checked ? '1' : '0';
    btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    btn.innerHTML = `<i data-lucide="${checked ? 'circle-check-big' : 'circle'}"></i>`;
    try {
        if (window.lucide) {
            window.lucide.createIcons({ root: btn });
        }
    } catch (e) {
    }
    return btn;
}

async function swRequest(action, payload = {}) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        throw new Error('Service Worker не активен');
    }

    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Math.max(1000, Number(payload.timeoutMs) || 15000);

    return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
            try { channel.port1.onmessage = null; } catch (e) {}
            reject(new Error('sw_timeout'));
        }, timeoutMs);

        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.requestId !== requestId) return;
            clearTimeout(timer);
            if (data && data.success) {
                resolve(data);
            } else {
                reject(new Error(data && data.error ? data.error : 'sw_error'));
            }
        };

        try {
            navigator.serviceWorker.controller.postMessage({ action, requestId, ...payload }, [channel.port2]);
        } catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}

async function createEmailInviteForSelectedGroup(targetEmail) {
    const g = getSelectedGroup();
    if (!g) {
        showInfo('Выбери группу');
        return null;
    }
    const email = String(targetEmail || '').trim().toLowerCase();
    if (!email) {
        showInfo('Введи email ученика');
        return null;
    }
    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}/invite/email`, {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
        if (!data || !data.success) {
            const msg = data && (data.error || data.message) ? String(data.error || data.message) : 'Ошибка';
            throw new Error(msg);
        }
        showSuccess('Инвайт создан');
        return data.invite || null;
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
        return null;
    }
}

function toggleGroupEmailInviteModal(isOpen) {
    const modal = document.getElementById('groupEmailInviteModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
        const input = document.getElementById('groupEmailInviteInput');
        try {
            if (input) {
                input.value = '';
                input.focus();
            }
        } catch (e) {
        }
    }
}

async function submitGroupEmailInviteFromModal() {
    const input = document.getElementById('groupEmailInviteInput');
    const email = input ? String(input.value || '').trim() : '';
    if (!email) {
        showInfo('Введи email ученика');
        return;
    }
    const res = await createEmailInviteForSelectedGroup(email);
    if (res) {
        toggleGroupEmailInviteModal(false);
        try {
            await refreshStudents();
        } catch (e) {
        }
    }
}

function initializeProfileSectionToggles() {
    try {
        if (document.body.dataset.profileSectionTogglesBound === '1') return;
        document.body.dataset.profileSectionTogglesBound = '1';

        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.profile-section-toggle') : null;
            if (!btn) return;

            const targetSelector = btn.dataset ? btn.dataset.target : null;
            if (!targetSelector) return;

            const target = document.querySelector(targetSelector);
            if (!target) return;

            const isCollapsed = target.style.display === 'none';
            target.style.display = isCollapsed ? '' : 'none';

            const icon = btn.querySelector('i[data-lucide]');
            if (icon) {
                icon.setAttribute('data-lucide', isCollapsed ? 'chevrons-up' : 'chevrons-down');
            } else {
                btn.innerHTML = `<i data-lucide="${isCollapsed ? 'chevrons-up' : 'chevrons-down'}"></i>`;
            }

            if (window.lucide) {
                window.lucide.createIcons({ root: btn });
            }
        });
    } catch (e) {
    }
}

async function groupsApiRequest(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (UM && UM.token) {
        headers['Authorization'] = `Bearer ${UM.token}`;
    }

    const res = await fetch(path, {
        method: options.method || 'GET',
        headers,
        body: options.body,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

let groupsUiState = {
    groups: [],
    selectedGroupId: null,
    selectedStudentId: null,
    filterMode: 'active',
};

function getGroupsFilterMode() {
    const m = String(groupsUiState.filterMode || '').toLowerCase();
    return m === 'all' ? 'all' : 'active';
}

function getVisibleGroups() {
    const groups = Array.isArray(groupsUiState.groups) ? groupsUiState.groups : [];
    const mode = getGroupsFilterMode();
    if (mode === 'all') return groups;
    return groups.filter((g) => !g || !g.archived_at);
}

function getSelectedGroup() {
    const id = groupsUiState.selectedGroupId;
    if (!id) return null;
    return (groupsUiState.groups || []).find((g) => String(g.id) === String(id)) || null;
}

function setSelectedGroup(groupId) {
    groupsUiState.selectedGroupId = groupId != null ? String(groupId) : null;
    groupsUiState.selectedStudentId = null;
    try {
        const inviteEl = document.getElementById('groupsInviteLink');
        if (inviteEl) inviteEl.value = '';
    } catch (e) {
    }
    updateInviteCopyButtonIcon();
    renderGroupsTable();
    renderGroupsDetails();
    refreshStudents();

    // подтянуть последнюю активную инвайт-ссылку (если есть)
    refreshInviteForSelectedGroup();
}

async function refreshInviteForSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) return;

    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}/invite/latest`, { method: 'GET' });
        const joinPath = data && data.join_path ? String(data.join_path) : (data && data.join_path === '' ? '' : null);
        const token = data && data.invite && data.invite.token ? String(data.invite.token) : null;
        const path = joinPath || (token ? `/join-group/${token}` : null);
        const fullUrl = path ? `${location.origin}${path}` : '';

        const inviteEl = document.getElementById('groupsInviteLink');
        if (inviteEl) inviteEl.value = fullUrl;
        if (!groupsUiState._inviteLinksByGroupId) groupsUiState._inviteLinksByGroupId = {};
        groupsUiState._inviteLinksByGroupId[String(g.id)] = fullUrl;

        updateInviteCopyButtonIcon();
    } catch (e) {
        // не блокируем UI если не получилось подтянуть
    }
}

function setSelectedStudent(studentId) {
    groupsUiState.selectedStudentId = studentId != null ? String(studentId) : null;
    renderStudentsTable(groupsUiState._studentsCache || []);
}

function renderGroupsTable() {
    const table = document.getElementById('groupsTable');
    if (!table) return;
    table.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'groups-table-header';
    const h1 = document.createElement('div');
    h1.textContent = 'ID';
    const h2 = document.createElement('div');
    h2.textContent = 'Название';
    const h3 = document.createElement('div');
    h3.textContent = '';
    header.appendChild(h1);
    header.appendChild(h2);
    header.appendChild(h3);
    table.appendChild(header);

    const groups = getVisibleGroups();
    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.color = '#666';
        empty.textContent = 'Пока нет групп';
        table.appendChild(empty);
        return;
    }

    groups.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'groups-table-row';
        const isArchived = Boolean(g && g.archived_at);
        if (isArchived) {
            row.classList.add('archived');
        }
        if (String(g.id) === String(groupsUiState.selectedGroupId)) {
            row.classList.add('selected');
        }
        row.dataset.groupId = String(g.id);
        const c1 = document.createElement('div');
        c1.textContent = String(g.id);
        const c2 = document.createElement('div');
        c2.textContent = String(g.title || '');
        const c3 = document.createElement('div');
        c3.className = 'groups-table-actions-cell';
        if (isArchived) {
            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'groups-row-restore-btn button-color-yellow';
            restoreBtn.title = 'Снять удаление группы';
            restoreBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            restoreBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openGroupRestoreModal(g);
            });
            c3.appendChild(restoreBtn);
        }
        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(c3);

        row.addEventListener('click', () => {
            setSelectedGroup(g.id);
        });
        row.addEventListener('dblclick', () => {
            openGroupModal('edit', g);
        });

        table.appendChild(row);
    });

    try {
        if (window.lucide) {
            window.lucide.createIcons({ root: table });
        }
    } catch (e) {
    }
}

function renderGroupsDetails() {
    const g = getSelectedGroup();
    const titleEl = document.getElementById('groupsDetailsTitle');
    const descEl = document.getElementById('groupsDetailsDescription');
    const inviteEl = document.getElementById('groupsInviteLink');
    if (titleEl) titleEl.textContent = g ? (g.title || '—') : '—';
    if (descEl) descEl.textContent = g ? (g.description || '—') : '—';
    if (inviteEl) {
        if (!g) {
            inviteEl.value = '';
        } else {
            const map = groupsUiState._inviteLinksByGroupId || {};
            inviteEl.value = map[String(g.id)] || '';
        }
    }
    updateInviteCopyButtonIcon();
}

function updateInviteCopyButtonIcon() {
    try {
        const btn = document.getElementById('groupsInviteCopyBtn');
        const inviteEl = document.getElementById('groupsInviteLink');
        if (!btn || !inviteEl) return;
        const hasLink = Boolean(String(inviteEl.value || '').trim());
        btn.title = hasLink ? 'Скопировать' : 'Создать инвайт';
        btn.innerHTML = `<i data-lucide="${hasLink ? 'copy' : 'plus'}"></i>`;
        if (window.lucide) {
            window.lucide.createIcons({ root: btn });
        }
    } catch (e) {
    }
}

function avatarUrlForUser(userId) {
    if (!userId) return '';
    return `/user/api/avatar?user_id=${encodeURIComponent(String(userId))}&size=small`;
}

async function telegramApiRequest(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (UM && UM.token) {
        headers['Authorization'] = `Bearer ${UM.token}`;
    }

    const res = await fetch(path, {
        method: options.method || 'GET',
        headers,
        body: options.body,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

function renderTelegramSection() {
    const statusEl = document.getElementById('telegramStatusText');
    const helpEl = document.getElementById('telegramHelpText');
    const codeInput = document.getElementById('telegramLinkCodeInput');
    const enabledToggle = document.getElementById('telegramEnabledToggle');
    const selfReportsToggle = document.getElementById('telegramSelfReportsEnabledToggle');
    const getCodeBtn = document.getElementById('telegramGetCodeBtn');
    const copyBtn = document.getElementById('telegramCopyStartCmdBtn');
    const refreshBtn = document.getElementById('telegramRefreshStatusBtn');

    if (!statusEl || !helpEl || !codeInput || !enabledToggle || !selfReportsToggle || !getCodeBtn || !copyBtn || !refreshBtn) return;

    const user = (UM && UM.userData) ? UM.userData : {};
    const chatId = user.telegram_chat_id;
    const enabled = Boolean(user.telegram_enabled);
    const selfReportsEnabled = Boolean(user.telegram_self_reports_enabled);
    const linked = Boolean(chatId);

    statusEl.textContent = linked ? `Привязан (chat_id: ${chatId})` : 'Не привязан';
    enabledToggle.checked = enabled;
    selfReportsToggle.checked = selfReportsEnabled;

    const codeVal = String(user.telegram_link_code || codeInput.value || '').trim();
    codeInput.value = codeVal;

    if (linked) {
        helpEl.textContent = 'Telegram уже привязан. Чтобы привязать другой аккаунт: нажми «Получить код», затем отправь в Telegram команду из кнопки «Скопировать /start». (Важно: между /start и кодом есть пробел.)';
    } else {
        helpEl.textContent = 'Нажми «Получить код», затем отправь в Telegram команду из кнопки «Скопировать /start». (Важно: между /start и кодом есть пробел.)';
    }

    try {
        getCodeBtn.disabled = false;
        copyBtn.disabled = !codeInput.value;
    } catch (e) {
    }

    getCodeBtn.onclick = async () => {
        try {
            getCodeBtn.disabled = true;
            const data = await telegramApiRequest('/user/api/telegram/link_code', { method: 'POST' });
            if (!data || !data.success || !data.code) {
                throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : 'Ошибка');
            }
            codeInput.value = String(data.code);
            if (UM && UM.userData) {
                UM.userData.telegram_link_code = String(data.code);
            }
            copyBtn.disabled = false;
            showSuccess('Код получен');
        } catch (e) {
            showError(e && e.message ? e.message : 'Ошибка');
        } finally {
            getCodeBtn.disabled = false;
        }
    };

    refreshBtn.onclick = async () => {
        try {
            refreshBtn.disabled = true;
            const data = await telegramApiRequest('/user/api/profile', { method: 'GET' });
            const nextUser = data && data.user ? data.user : null;
            if (!nextUser) {
                throw new Error('Не удалось обновить профиль');
            }
            if (UM) {
                UM.userData = Object.assign({}, UM.userData || {}, nextUser);
                if (typeof UM._saveUserCache === 'function') {
                    UM._saveUserCache(UM.userData);
                }
            }
            renderTelegramSection();
            showSuccess('Обновлено');
        } catch (e) {
            showError(e && e.message ? e.message : 'Ошибка');
        } finally {
            refreshBtn.disabled = false;
        }
    };

    copyBtn.onclick = async () => {
        const code = String(codeInput.value || '').trim();
        if (!code) {
            showInfo('Сначала получи код');
            return;
        }
        const cmd = `/start ${code}`;
        try {
            await navigator.clipboard.writeText(cmd);
            showSuccess('Скопировано');
        } catch (e) {
            showInfo(cmd);
        }
    };

    enabledToggle.onchange = async () => {
        const next = Boolean(enabledToggle.checked);
        try {
            enabledToggle.disabled = true;
            const data = await telegramApiRequest('/user/api/telegram/enabled', {
                method: 'POST',
                body: JSON.stringify({ enabled: next }),
            });
            if (!data || !data.success) {
                throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : 'Ошибка');
            }
            if (UM && UM.userData) {
                UM.userData.telegram_enabled = Boolean(data.enabled);
                if (typeof UM._saveUserCache === 'function') {
                    UM._saveUserCache(UM.userData);
                }
            }
            showSuccess('Сохранено');
        } catch (e) {
            enabledToggle.checked = !next;
            showError(e && e.message ? e.message : 'Ошибка');
        } finally {
            enabledToggle.disabled = false;
        }
    };

    selfReportsToggle.onchange = async () => {
        const next = Boolean(selfReportsToggle.checked);
        try {
            selfReportsToggle.disabled = true;
            const data = await telegramApiRequest('/user/api/telegram/self_reports_enabled', {
                method: 'POST',
                body: JSON.stringify({ enabled: next }),
            });
            if (!data || !data.success) {
                throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : 'Ошибка');
            }
            if (UM && UM.userData) {
                UM.userData.telegram_self_reports_enabled = Boolean(data.enabled);
                if (typeof UM._saveUserCache === 'function') {
                    UM._saveUserCache(UM.userData);
                }
            }
            showSuccess('Сохранено');
        } catch (e) {
            selfReportsToggle.checked = !next;
            showError(e && e.message ? e.message : 'Ошибка');
        } finally {
            selfReportsToggle.disabled = false;
        }
    };

    try {
        if (window.lucide) {
            window.lucide.createIcons({ root: document.getElementById('telegramSection') });
        }
    } catch (e) {
    }
}

function renderStudentsTable(students) {
    const table = document.getElementById('groupsStudentsTable');
    if (!table) return;
    table.innerHTML = '';

    if (!groupsUiState.selectedGroupId) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.color = '#666';
        empty.textContent = 'Выбери группу слева';
        table.appendChild(empty);
        return;
    }

    if (!Array.isArray(students) || students.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.color = '#666';
        empty.textContent = 'Пока нет учеников';
        table.appendChild(empty);
        return;
    }

    students.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'groups-students-table-row';
        row.dataset.studentId = String(s.id);
        const isEmailInviteRow = String(s.kind || '') === 'email_invite' || String(s.id || '').startsWith('email_invite:');
        if (!isEmailInviteRow && String(s.id) === String(groupsUiState.selectedStudentId)) {
            row.classList.add('selected');
        }

        const avatar = document.createElement('img');
        avatar.className = 'groups-student-avatar';
        avatar.alt = 'avatar';
        if (!isEmailInviteRow) {
            avatar.src = avatarUrlForUser(s.id);
        } else {
            avatar.src = '';
            avatar.style.opacity = '0.2';
        }

        const name = document.createElement('div');
        name.className = 'groups-student-name';
        name.textContent = String((isEmailInviteRow ? (s.email || s.username) : s.username) || '');

        const status = document.createElement('div');
        status.className = 'groups-student-status';
        const st = String(s.status || '').toLowerCase();
        status.textContent = st === 'active' ? 'подтвердил' : 'не подтвердил';

        const notifyWrap = document.createElement('div');
        notifyWrap.className = 'groups-student-notify';

        const notifyLabel = document.createElement('span');
        notifyLabel.className = 'groups-student-notify-label';
        notifyLabel.textContent = 'TG';

        const startChecked = isEmailInviteRow ? false : (s.notify_teacher_on_success !== false);
        const notifyBtn = createLucideToggleButton({
            checked: startChecked,
            title: 'Уведомлять учителя о выполнении этим учеником',
            disabled: isEmailInviteRow,
        });
        notifyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        notifyBtn.addEventListener('click', async () => {
            if (isEmailInviteRow) return;
            const g = getSelectedGroup();
            if (!g) return;
            const current = notifyBtn.dataset.checked === '1';
            const next = !current;
            try {
                notifyBtn.disabled = true;
                await groupsApiRequest(`/groups/api/group/${g.id}/students/${s.id}/notify_teacher_on_success`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled: next }),
                });
                notifyBtn.dataset.checked = next ? '1' : '0';
                notifyBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
                notifyBtn.innerHTML = `<i data-lucide="${next ? 'circle-check-big' : 'circle'}"></i>`;
                try {
                    if (window.lucide) {
                        window.lucide.createIcons({ root: notifyBtn });
                    }
                } catch (e) {
                }

                const cache = Array.isArray(groupsUiState._studentsCache) ? groupsUiState._studentsCache : [];
                const idx = cache.findIndex((x) => String(x.id) === String(s.id));
                if (idx >= 0) {
                    cache[idx] = Object.assign({}, cache[idx], { notify_teacher_on_success: next });
                }
                groupsUiState._studentsCache = cache;
                showSuccess('Сохранено');
            } catch (e) {
                showError(e && e.message ? e.message : 'Ошибка');
            } finally {
                notifyBtn.disabled = false;
            }
        });

        notifyWrap.appendChild(notifyLabel);
        notifyWrap.appendChild(notifyBtn);

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(status);
        row.appendChild(notifyWrap);

        row.addEventListener('click', () => {
            if (isEmailInviteRow) {
                groupsUiState.selectedStudentId = null;
                renderStudentsTable(groupsUiState._studentsCache || []);
                return;
            }
            setSelectedStudent(s.id);
        });

        table.appendChild(row);
    });
}

async function refreshGroups() {
    try {
        const data = await groupsApiRequest('/groups/api/my', { method: 'GET' });
        const groups = data && Array.isArray(data.groups) ? data.groups : [];
        groupsUiState.groups = groups;
        renderGroupsTable();

        const visible = getVisibleGroups();
        if (!groupsUiState.selectedGroupId && visible.length > 0) {
            setSelectedGroup(visible[0].id);
        } else {
            renderGroupsDetails();
            refreshStudents();
        }
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
    }
}

async function refreshSelectedGroupDetailsFromServer() {
    const id = groupsUiState.selectedGroupId;
    if (!id) return;
    try {
        const data = await groupsApiRequest(`/groups/api/group/${id}`, { method: 'GET' });
        const updated = data && data.group ? data.group : null;
        if (!updated) return;
        const groups = Array.isArray(groupsUiState.groups) ? groupsUiState.groups : [];
        const idx = groups.findIndex((g) => String(g.id) === String(id));
        if (idx >= 0) {
            groups[idx] = Object.assign({}, groups[idx], updated);
        }
        groupsUiState.groups = groups;
        renderGroupsTable();
        renderGroupsDetails();
    } catch (e) {
    }
}

async function refreshStudents() {
    groupsUiState._studentsCache = [];
    if (!groupsUiState.selectedGroupId) {
        renderStudentsTable([]);
        return;
    }
    try {
        const data = await groupsApiRequest(`/groups/api/group/${groupsUiState.selectedGroupId}/students`, { method: 'GET' });
        const students = data && Array.isArray(data.students) ? data.students : [];
        groupsUiState._studentsCache = students;
        renderStudentsTable(students);
    } catch (e) {
        renderStudentsTable([]);
    }
}

function toggleGroupModal(isOpen) {
    const modal = document.getElementById('groupModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
}

function toggleGroupRestoreModal(isOpen) {
    const modal = document.getElementById('groupRestoreModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
}

function openGroupRestoreModal(group) {
    const textEl = document.getElementById('groupRestoreModalText');
    groupsUiState._restoreGroupId = group && group.id != null ? String(group.id) : null;
    if (textEl) {
        const title = group && group.title ? String(group.title) : '';
        textEl.textContent = title ? `Снять удаление группы «${title}»?` : 'Снять удаление группы?';
    }
    toggleGroupRestoreModal(true);
    try {
        if (window.lucide) window.lucide.createIcons({ root: document.getElementById('groupRestoreModal') });
    } catch (e) {
    }
}

async function restoreGroupFromModal() {
    const yesBtn = document.getElementById('groupRestoreModalYes');
    const groupId = groupsUiState._restoreGroupId;
    if (!groupId) return;
    try {
        if (yesBtn) yesBtn.disabled = true;
        await groupsApiRequest(`/groups/api/group/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify({ archived_at: null }),
        });
        showSuccess('Группа восстановлена');
        toggleGroupRestoreModal(false);
        groupsUiState._restoreGroupId = null;
        await refreshGroups();
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
    } finally {
        if (yesBtn) yesBtn.disabled = false;
    }
}

function openGroupModal(mode, group) {
    const title = document.getElementById('groupModalTitle');
    const titleInput = document.getElementById('groupModalTitleInput');
    const descInput = document.getElementById('groupModalDescriptionInput');
    if (!title || !titleInput || !descInput) return;

    if (mode === 'edit' && group) {
        title.textContent = 'Группа';
        titleInput.value = String(group.title || '');
        descInput.value = String(group.description || '');
        groupsUiState._modalGroupId = String(group.id);
    } else {
        title.textContent = 'Группа';
        titleInput.value = '';
        descInput.value = '';
        groupsUiState._modalGroupId = null;
    }

    toggleGroupModal(true);
    try {
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
    }
    titleInput.focus();
}

async function saveGroupFromModal() {
    const titleInput = document.getElementById('groupModalTitleInput');
    const descInput = document.getElementById('groupModalDescriptionInput');
    const saveBtn = document.getElementById('groupModalSave');
    if (!titleInput || !descInput || !saveBtn) return;

    const title = String(titleInput.value || '').trim();
    const description = String(descInput.value || '').trim();
    if (!title) {
        showError('Название обязательно');
        return;
    }

    try {
        saveBtn.disabled = true;
        const editingId = groupsUiState._modalGroupId;
        if (editingId) {
            await groupsApiRequest(`/groups/api/group/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify({ title, description: description || null }),
            });
            showSuccess('Сохранено');
        } else {
            await groupsApiRequest('/groups/api/group', {
                method: 'POST',
                body: JSON.stringify({ title, description: description || null }),
            });
            showSuccess('Группа создана');
        }
        toggleGroupModal(false);
        groupsUiState._modalGroupId = null;
        await refreshGroups();
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
    } finally {
        saveBtn.disabled = false;
        try {
            const modal = document.getElementById('groupModal');
            if (modal) modal.style.display = 'none';
        } catch (e) {
        }
    }
}

async function createInviteForSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) {
        showInfo('Выбери группу');
        return;
    }
    const inviteEl = document.getElementById('groupsInviteLink');
    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}/invite`, {
            method: 'POST',
            body: JSON.stringify({ max_uses: null }),
        });
        const joinPath = data && data.join_path ? String(data.join_path) : (data && data.join_path === '' ? '' : null);
        const token = data && data.invite && data.invite.token ? String(data.invite.token) : null;
        const path = joinPath || (token ? `/join-group/${token}` : null);
        if (!path) throw new Error('Не удалось получить ссылку');
        const fullUrl = `${location.origin}${path}`;
        if (inviteEl) inviteEl.value = fullUrl;
        if (!groupsUiState._inviteLinksByGroupId) groupsUiState._inviteLinksByGroupId = {};
        groupsUiState._inviteLinksByGroupId[String(g.id)] = fullUrl;
        updateInviteCopyButtonIcon();
        return fullUrl;
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
        return null;
    }
}

async function copyInviteLink() {
    const inviteEl = document.getElementById('groupsInviteLink');
    const val = inviteEl ? String(inviteEl.value || '').trim() : '';
    if (!val) {
        // сначала пытаемся получить существующую ссылку с сервера
        await refreshInviteForSelectedGroup();
        const afterRefresh = inviteEl ? String(inviteEl.value || '').trim() : '';
        if (!afterRefresh) {
            const created = await createInviteForSelectedGroup();
            if (!created) return;
        }
    }
    const link = inviteEl ? String(inviteEl.value || '').trim() : '';
    if (!link) return;
    try {
        await navigator.clipboard.writeText(link);
        showSuccess('Ссылка скопирована');
    } catch (e) {
        showInfo('Скопируй ссылку вручную');
    }
}

async function archiveSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) {
        showInfo('Выбери группу');
        return;
    }
    try {
        await groupsApiRequest(`/groups/api/group/${g.id}`, {
            method: 'PUT',
            body: JSON.stringify({ archived_at: new Date().toISOString() }),
        });
        showSuccess('Группа архивирована');
        groupsUiState.selectedGroupId = null;
        await refreshGroups();
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
    }
}

async function removeSelectedStudent() {
    const g = getSelectedGroup();
    const studentId = groupsUiState.selectedStudentId;
    if (!g) {
        showInfo('Выбери группу');
        return;
    }
    if (!studentId) {
        showInfo('Выбери ученика');
        return;
    }
    if (String(studentId).startsWith('email_invite:')) {
        showInfo('Нельзя удалить: ученик ещё не подтвердил приглашение');
        return;
    }
    try {
        await groupsApiRequest(`/groups/api/group/${g.id}/students/${studentId}/remove`, { method: 'POST' });
        showSuccess('Ученик удалён');
        groupsUiState.selectedStudentId = null;
        await refreshGroups();
        await refreshStudents();
    } catch (e) {
        showError(e && e.message ? e.message : 'Ошибка');
    }
}

function initializeGroupsSection() {
    const groupsTable = document.getElementById('groupsTable');
    const createBtn = document.getElementById('groupsCreateBtn');
    const delBtn = document.getElementById('groupsDeleteBtn');
    const filterSelect = document.getElementById('groupsFilterSelect');
    const inviteCopyBtn = document.getElementById('groupsInviteCopyBtn');
    const studentsRefreshBtn = document.getElementById('groupsStudentsRefreshBtn');
    const studentsInviteEmailBtn = document.getElementById('groupsStudentsInviteEmailBtn');
    const studentsInviteLinkBtn = document.getElementById('groupsStudentsInviteLinkBtn');
    const studentsDeleteBtn = document.getElementById('groupsStudentsDeleteBtn');

    const emailInviteModal = document.getElementById('groupEmailInviteModal');
    const emailInviteModalClose = document.getElementById('groupEmailInviteModalClose');
    const emailInviteModalCancel = document.getElementById('groupEmailInviteModalCancel');
    const emailInviteModalSend = document.getElementById('groupEmailInviteModalSend');
    const emailInviteInput = document.getElementById('groupEmailInviteInput');
    const modal = document.getElementById('groupModal');
    const modalClose = document.getElementById('groupModalClose');
    const modalSave = document.getElementById('groupModalSave');

    const restoreModal = document.getElementById('groupRestoreModal');
    const restoreModalClose = document.getElementById('groupRestoreModalClose');
    const restoreModalYes = document.getElementById('groupRestoreModalYes');

    if (!groupsTable || !createBtn || !delBtn || !modal || !modalClose || !modalSave) return;

    if (filterSelect) {
        try {
            const saved = localStorage.getItem('groups_filter_mode');
            if (saved) groupsUiState.filterMode = saved;
        } catch (e) {
        }
        filterSelect.value = getGroupsFilterMode();
        filterSelect.addEventListener('change', () => {
            groupsUiState.filterMode = String(filterSelect.value || 'active');
            try {
                localStorage.setItem('groups_filter_mode', getGroupsFilterMode());
            } catch (e) {
            }
            groupsUiState.selectedGroupId = null;
            renderGroupsTable();
            renderGroupsDetails();
            refreshStudents();
            const visible = getVisibleGroups();
            if (visible.length > 0) setSelectedGroup(visible[0].id);
        });
    }

    createBtn.addEventListener('click', () => openGroupModal('create'));
    delBtn.addEventListener('click', () => archiveSelectedGroup());
    inviteCopyBtn && inviteCopyBtn.addEventListener('click', () => copyInviteLink());
    studentsRefreshBtn && studentsRefreshBtn.addEventListener('click', async () => {
        await refreshSelectedGroupDetailsFromServer();
        await refreshStudents();
    });
    studentsInviteEmailBtn && studentsInviteEmailBtn.addEventListener('click', async () => {
        const g = getSelectedGroup();
        if (!g) {
            showInfo('Выбери группу');
            return;
        }
        toggleGroupEmailInviteModal(true);
    });
    studentsInviteLinkBtn && studentsInviteLinkBtn.addEventListener('click', () => copyInviteLink());
    studentsDeleteBtn && studentsDeleteBtn.addEventListener('click', () => removeSelectedStudent());

    if (emailInviteModal && emailInviteModalClose && emailInviteModalCancel && emailInviteModalSend) {
        emailInviteModalClose.addEventListener('click', () => toggleGroupEmailInviteModal(false));
        emailInviteModalCancel.addEventListener('click', () => toggleGroupEmailInviteModal(false));
        emailInviteModal.addEventListener('click', (e) => {
            if (e.target === emailInviteModal) toggleGroupEmailInviteModal(false);
        });
        emailInviteModalSend.addEventListener('click', async () => submitGroupEmailInviteFromModal());
        if (emailInviteInput) {
            emailInviteInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await submitGroupEmailInviteFromModal();
                }
            });
        }
    }

    modalClose.addEventListener('click', () => toggleGroupModal(false));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleGroupModal(false);
    });
    modalSave.addEventListener('click', () => saveGroupFromModal());

    if (restoreModal && restoreModalClose && restoreModalYes) {
        restoreModalClose.addEventListener('click', () => toggleGroupRestoreModal(false));
        restoreModal.addEventListener('click', (e) => {
            if (e.target === restoreModal) toggleGroupRestoreModal(false);
        });
        restoreModalYes.addEventListener('click', () => restoreGroupFromModal());
    }

    refreshGroups();
}

async function checkAppCacheRevision() {
    try {
        const res = await fetch('/api/app-cache-revision', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || !data.success || !data.revision) return;

        const serverRev = String(data.revision);
        const localRev = localStorage.getItem('app_cache_revision');

        if (!localRev) {
            localStorage.setItem('app_cache_revision', serverRev);
            return;
        }

        if (localRev === serverRev) return;

        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                await swRequest('cacheClearAppShell', { timeoutMs: 60000 });
            }
        } catch (e) {
        }

        localStorage.setItem('app_cache_revision', serverRev);
        // Guard against reload loops
        try {
            if (sessionStorage.getItem('profile_forced_reload_done') === serverRev) return;
            sessionStorage.setItem('profile_forced_reload_done', serverRev);
        } catch (e) {
        }
        location.reload();
    } catch (e) {
        // ignore
    }
}

function bindProfileTestRecording() {
    const btn = document.getElementById('profileTestRecordingBtn');
    const statusEl = document.getElementById('profileTestRecordingStatus');
    const resultEl = document.getElementById('profileTestRecordingResult');
    if (!btn || !statusEl || !resultEl) return;

    const setStatus = (text, color = '#666') => {
        statusEl.textContent = text || '';
        statusEl.style.color = color;
    };

    const setResult = (text) => {
        resultEl.value = text || '';
    };

    const getCurrentMode = () => {
        try {
            // Prefer current UI value from AudioSettingsPanel
            if (audioSettingsPanel && typeof audioSettingsPanel.getSettings === 'function') {
                const s = audioSettingsPanel.getSettings();
                if (s && s.speech_recognition_mode) return s.speech_recognition_mode;
            }
        } catch (e) {
        }
        // Fallback to UM.userData
        return UM && UM.userData && UM.userData.speech_recognition_mode ? UM.userData.speech_recognition_mode : 'route';
    };

    const stopAndCleanup = async () => {
        try {
            if (profileTestTimerId) {
                clearInterval(profileTestTimerId);
                profileTestTimerId = null;
            }
            if (profileTestAutoStopId) {
                clearTimeout(profileTestAutoStopId);
                profileTestAutoStopId = null;
            }
        } catch (e) {
        }
        try {
            if (profileTestRecorder && profileTestRecorder.state !== 'inactive') {
                profileTestRecorder.stop();
            }
        } catch (e) {
        }
        try {
            if (profileTestMediaStream) {
                profileTestMediaStream.getTracks().forEach(t => {
                    try { t.stop(); } catch (e) {}
                });
            }
        } catch (e) {
        }
        profileTestRecorder = null;
        profileTestMediaStream = null;
        profileTestChunks = [];
        profileTestIsRecording = false;
        btn.textContent = 'Записать';
    };

    btn.onclick = async () => {
        const mode = getCurrentMode();

        if (profileTestIsRecording) {
            setStatus('Останавливаю…');
            try {
                if (profileTestRecorder && profileTestRecorder.state !== 'inactive') {
                    profileTestRecorder.stop();
                }
            } catch (e) {
                await stopAndCleanup();
                setStatus('Не удалось остановить запись', '#b00020');
            }
            return;
        }

        if (mode !== 'route-off') {
            setResult('');
            setStatus('Для теста выбери режим «локально»', '#b00020');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('Браузер не поддерживает запись с микрофона', '#b00020');
            return;
        }

        setResult('');
        setStatus('Запрашиваю доступ к микрофону…');

        try {
            profileTestMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            setStatus('Нет доступа к микрофону', '#b00020');
            return;
        }

        try {
            profileTestChunks = [];
            profileTestRecorder = new MediaRecorder(profileTestMediaStream);
        } catch (e) {
            await stopAndCleanup();
            setStatus('MediaRecorder не поддерживается', '#b00020');
            return;
        }

        profileTestRecorder.ondataavailable = (ev) => {
            try {
                if (ev && ev.data && ev.data.size > 0) {
                    profileTestChunks.push(ev.data);
                }
            } catch (e) {
            }
        };

        profileTestRecorder.onstop = async () => {
            try {
                profileTestIsRecording = false;
                btn.textContent = 'Записать';

                const blob = new Blob(profileTestChunks, { type: profileTestRecorder && profileTestRecorder.mimeType ? profileTestRecorder.mimeType : 'audio/webm' });
                await stopAndCleanup();

                if (!blob || blob.size === 0) {
                    setStatus('Пустая запись', '#b00020');
                    return;
                }

                if (!window.WhisperModelManager) {
                    setStatus('WhisperModelManager не загружен', '#b00020');
                    return;
                }

                if (!window.__dictafanWhisperModelManager) {
                    window.__dictafanWhisperModelManager = new window.WhisperModelManager();
                }
                const wm = window.__dictafanWhisperModelManager;
                const lang = (originalData && originalData.current_learning) ? String(originalData.current_learning) : 'en';

                // Determine model size from model-centric selection or downloaded markers.
                let size = 'base';
                try {
                    const mk = localStorage.getItem(`selected_asr_model_v2_${lang}`);
                    if (mk && mk.includes('whisper-tiny')) size = 'tiny';
                    if (mk && mk.includes('whisper-small')) size = 'small';
                    if (mk && mk.includes('whisper-base')) size = 'base';
                } catch (e) {
                }

                // If selected size isn't available, pick any downloaded one.
                try {
                    const preferred = [size, 'small', 'base', 'tiny'];
                    let picked = null;
                    for (const s of preferred) {
                        const k = `whisper_model_${s}`;
                        const v = localStorage.getItem(k);
                        if (v === 'downloaded' || v === 'ready') {
                            picked = s;
                            break;
                        }
                    }
                    if (picked) size = picked;
                } catch (e) {
                }

                // Ensure model is loaded into memory (transcribe() requires recognizer in window.WhisperModels).
                try {
                    const key = (typeof wm._getModelKey === 'function') ? wm._getModelKey(lang, size) : `whisper_model_${size}`;
                    const inMemory = window.WhisperModels && typeof window.WhisperModels.get === 'function' ? window.WhisperModels.get(key) : null;
                    if (!inMemory || !inMemory.recognizer) {
                        setStatus(`Загружаю модель Whisper (${size})…`);
                        await wm.loadLanguageModel(lang, size, (p) => {
                            try {
                                if (!p) return;
                                const percent = Math.round((Number(p.progress) || 0) * 100);
                                if (isFinite(percent) && percent > 0 && percent < 100) {
                                    setStatus(`Загружаю модель Whisper (${size})… ${percent}%`);
                                }
                            } catch (e) {
                            }
                        });
                    }
                } catch (e) {
                    setStatus(e && e.message ? String(e.message) : 'Ошибка загрузки модели', '#b00020');
                    return;
                }

                setStatus('Распознаю…');
                const res = await wm.transcribe(blob, lang, size, null);
                let text = '';
                if (res && typeof res === 'object') {
                    if (res.text) text = String(res.text).trim();
                    else if (Array.isArray(res) && res[0] && res[0].text) text = String(res[0].text).trim();
                } else if (typeof res === 'string') {
                    text = res.trim();
                }

                setResult(text);
                setStatus(text ? 'Готово' : 'Пустой результат', text ? '#1b7f3a' : '#b00020');
            } catch (err) {
                try { await stopAndCleanup(); } catch (e) {}
                setResult('');
                setStatus(err && err.message ? String(err.message) : 'Ошибка распознавания', '#b00020');
            }
        };

        try {
            profileTestIsRecording = true;
            btn.textContent = 'Стоп';
            const startAt = Date.now();
            const maxSeconds = 12;
            setStatus('Идёт запись… 0с');

            profileTestTimerId = setInterval(() => {
                try {
                    const s = Math.floor((Date.now() - startAt) / 1000);
                    setStatus(`Идёт запись… ${s}с`);
                } catch (e) {
                }
            }, 500);

            profileTestAutoStopId = setTimeout(() => {
                try {
                    if (profileTestIsRecording && profileTestRecorder && profileTestRecorder.state !== 'inactive') {
                        setStatus('Авто-стоп…');
                        profileTestRecorder.stop();
                    }
                } catch (e) {
                }
            }, maxSeconds * 1000);

            // timeslice makes dataavailable fire periodically (helps memory on long clips)
            profileTestRecorder.start(1000);
        } catch (e) {
            await stopAndCleanup();
            setStatus('Не удалось начать запись', '#b00020');
        }
    };
}

// Инициализация при загрузке страницы - ТОЛЬКО ОДИН ОБРАБОТЧИК
document.addEventListener('DOMContentLoaded', async function () {
    UM = new UserManager();

    try {
        // Same scheme as desk/dictation: force reload when app cache revision changes
        checkAppCacheRevision().catch(() => { });

        // If a new SW takes control, reload once to ensure we use updated assets
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                try {
                    const key = 'profile_controllerchange_reload';
                    if (sessionStorage.getItem(key) === '1') return;
                    sessionStorage.setItem(key, '1');
                } catch (e) {
                }
                location.reload();
            });
        }
    } catch (e) {
    }

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
        initializeGroupsSection();
        initializeProfileSectionToggles();
        setupFormListeners();
        initializeTopbarControls();
        setupPasswordToggles();

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки профиля: ' + error.message);
    }
});

function setupPasswordToggles() {
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
}

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
        audio_repeats: userData.audio_repeats || 3,
        audio_required_passed_star_half: userData.audio_required_passed_star_half || 3,
        speech_recognition_mode: userData.speech_recognition_mode || 'route'
    };

    document.getElementById('username').value = originalData.username;
    document.getElementById('email').value = originalData.email;
    updateAvatarDisplay(originalData.avatar);
    renderTelegramSection();
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
            mode: 'models-centric',
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
                    settings_json: UM.userData.settings_json,
                    audio_start: audioSettings.start,
                    audio_typo: audioSettings.typo,
                    audio_success: audioSettings.success,
                    audio_repeats: audioSettings.repeats,
                    audio_required_passed_star_half: audioSettings.required_passed_star_half,
                    without_entering_text: audioSettings.without_entering_text,
                    show_text: audioSettings.show_text,
                    speech_recognition_mode: audioSettings.speech_recognition_mode
                };
            } catch (e) {
                console.warn('Ошибка парсинга settings_json:', e);
                // Fallback на отдельные поля
                userSettings = {
                    audio_start: UM.userData.audio_start,
                    audio_typo: UM.userData.audio_typo,
                    audio_success: UM.userData.audio_success,
                    audio_repeats: UM.userData.audio_repeats,
                    audio_required_passed_star_half: UM.userData.audio_required_passed_star_half,
                    speech_recognition_mode: UM.userData.speech_recognition_mode
                };
            }
        } else {
            // Используем отдельные поля (обратная совместимость)
            userSettings = {
                audio_start: UM.userData.audio_start,
                audio_typo: UM.userData.audio_typo,
                audio_success: UM.userData.audio_success,
                audio_repeats: UM.userData.audio_repeats,
                audio_required_passed_star_half: UM.userData.audio_required_passed_star_half,
                speech_recognition_mode: UM.userData.speech_recognition_mode
            };
        }

        if (!userSettings.settings_json && UM.userData.settings_json) {
            userSettings.settings_json = UM.userData.settings_json;
        }

        if (!userSettings.audio_settings_json && UM.userData.audio_settings_json) {
            userSettings.audio_settings_json = UM.userData.audio_settings_json;
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

        // Bind test recording widget (rendered inside AudioSettingsPanel in user-settings mode)
        setTimeout(() => {
            try {
                bindProfileTestRecording();
            } catch (e) {
            }
        }, 0);

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
    try {
        if (window.CoverManager && typeof window.CoverManager.bind === 'function') {
            window.CoverManager.bind({
                fileInputId: 'avatarUpload',
                uploadBtnId: 'avatarUploadButton',
                previewImgId: ['avatarLarge', 'avatarSmall'],
                aspectRatio: 1,
                outputWidth: 120,
                outputHeight: 120,
                outputType: 'image/webp',
                outputQuality: 0.95,
                maxFileSizeBytes: 5 * 1024 * 1024,
                onConfirm: async (blob) => {
                    pendingAvatarBlob = blob;
                    setUnsavedState(true);
                    try { checkForChanges(); } catch (e) {}
                    try {
                        const input = document.getElementById('avatarUpload');
                        if (input) input.value = '';
                    } catch (e) {
                    }
                }
            });
        } else {
            try {
                if (avatarButton) avatarButton.disabled = true;
                if (avatarInput) avatarInput.disabled = true;
            } catch (e) {
            }
        }
    } catch (e) {
        try {
            if (avatarButton) avatarButton.disabled = true;
            if (avatarInput) avatarInput.disabled = true;
        } catch (e2) {
        }
    }

    try {
        const saveButton = document.getElementById('saveButton');
        if (saveButton && saveButton.dataset && !saveButton.dataset.boundClick) {
            saveButton.dataset.boundClick = '1';
            saveButton.addEventListener('click', async () => {
                await handleSave();
            });
        }
    } catch (e) {
    }

    try {
        const exitToIndexBtn = document.getElementById('exitToIndexBtn');
        if (exitToIndexBtn && exitToIndexBtn.dataset && !exitToIndexBtn.dataset.boundClick) {
            exitToIndexBtn.dataset.boundClick = '1';
            exitToIndexBtn.addEventListener('click', () => {
                showExitModal();
            });
        }
    } catch (e) {
    }

    try {
        const exitStayBtn = document.getElementById('exitStayBtn');
        if (exitStayBtn && exitStayBtn.dataset && !exitStayBtn.dataset.boundClick) {
            exitStayBtn.dataset.boundClick = '1';
            exitStayBtn.addEventListener('click', () => {
                toggleExitModal(false);
            });
        }
    } catch (e) {
    }

    try {
        const exitWithoutSavingBtn = document.getElementById('exitWithoutSavingBtn');
        if (exitWithoutSavingBtn && exitWithoutSavingBtn.dataset && !exitWithoutSavingBtn.dataset.boundClick) {
            exitWithoutSavingBtn.dataset.boundClick = '1';
            exitWithoutSavingBtn.addEventListener('click', () => {
                toggleExitModal(false);
                proceedToExit();
            });
        }
    } catch (e) {
    }

    try {
        const exitWithSavingBtn = document.getElementById('exitWithSavingBtn');
        if (exitWithSavingBtn && exitWithSavingBtn.dataset && !exitWithSavingBtn.dataset.boundClick) {
            exitWithSavingBtn.dataset.boundClick = '1';
            exitWithSavingBtn.addEventListener('click', async () => {
                toggleExitModal(false);
                await handleSaveAndExit();
            });
        }
    } catch (e) {
    }

    try {
        const exitModal = document.getElementById('exitModal');
        if (exitModal && exitModal.dataset && !exitModal.dataset.boundClick) {
            exitModal.dataset.boundClick = '1';
            exitModal.addEventListener('click', (e) => {
                if (e.target === exitModal) {
                    toggleExitModal(false);
                }
            });
        }
    } catch (e) {
    }

    try {
        if (!document.body.dataset.profileExitEscBound) {
            document.body.dataset.profileExitEscBound = '1';
            document.addEventListener('keydown', (e) => {
                const exitModal = document.getElementById('exitModal');
                if (e.key === 'Escape' && exitModal && exitModal.style.display === 'flex') {
                    toggleExitModal(false);
                }
            });
        }
    } catch (e) {
    }
}

// Проверка изменений данных
function checkForChanges() {
    // ...
    const currentValues = getCurrentFormValues();

    // Аватар: сравниваем только базовые URL (без timestamp), чтобы после сохранения звёздочка гасла
    const avatarChanged = (() => {
        try {
            const a = normalizeAvatarForCompare(UM && UM.userData ? UM.userData.avatar : null);
            const b = normalizeAvatarForCompare(originalData ? originalData.avatar : null);
            return a.large !== b.large || a.small !== b.small || !!pendingAvatarBlob;
        } catch (e) {
            return !!pendingAvatarBlob;
        }
    })();

    const hasChanges =
        currentValues.username !== originalData.username ||
        currentValues.password !== '' ||
        currentValues.native_language !== originalData.native_language ||
        JSON.stringify(currentValues.learning_languages) !== JSON.stringify(originalData.learning_languages) ||
        currentValues.current_learning !== originalData.current_learning ||
        avatarChanged ||
        currentValues.audio_start !== (originalData.audio_start || '') ||
        currentValues.audio_typo !== (originalData.audio_typo || '') ||
        currentValues.audio_success !== (originalData.audio_success || '') ||
        currentValues.audio_repeats !== (originalData.audio_repeats || 3) ||
        currentValues.audio_required_passed_star_half !== (originalData.audio_required_passed_star_half || 3) ||
        currentValues.speech_recognition_mode !== (originalData.speech_recognition_mode || 'route');

    setUnsavedState(hasChanges);
}

function setUnsavedState(state) {
    hasUnsavedChanges = state;

    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        if (isSavingProfile) {
            saveButton.disabled = true;
        } else {
            saveButton.disabled = false;
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
        audio_repeats: 3,
        audio_required_passed_star_half: 3,
        speech_recognition_mode: 'route'
    };
    
    if (audioSettingsPanel) {
        const settings = audioSettingsPanel.getSettings();
        audioSettings.audio_start = settings.start || '';
        audioSettings.audio_typo = settings.typo || '';
        audioSettings.audio_success = settings.success || '';
        audioSettings.audio_repeats = settings.repeats || 3;
        audioSettings.audio_required_passed_star_half = settings.required_passed_star_half || 3;
        audioSettings.speech_recognition_mode = settings.speech_recognition_mode || 'route';
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
        audio_repeats: audioSettings.audio_repeats,
        audio_required_passed_star_half: audioSettings.audio_required_passed_star_half,
        speech_recognition_mode: audioSettings.speech_recognition_mode
    };
}

function normalizeAvatarForCompare(avatar) {
    if (!avatar || typeof avatar !== 'object') return { large: '', small: '' };
    return {
        large: String(avatar.large || avatar.medium || avatar.original || ''),
        small: String(avatar.small || avatar.medium || avatar.original || '')
    };
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
        (formValues.audio_repeats || 3) !== (originalData.audio_repeats || 3) ||
        (formValues.audio_required_passed_star_half || 3) !== (originalData.audio_required_passed_star_half || 3) ||
        (formValues.speech_recognition_mode || 'route') !== (originalData.speech_recognition_mode || 'route')
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
        let avatarUploadedThisSave = false;
        try {
            if (pendingAvatarBlob) {
                await UM.uploadAvatar(pendingAvatarBlob);
                avatarUploadedThisSave = true;
            }
        } catch (e) {
            throw e;
        }

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
                    start: (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto',
                    typo: (settings.typo !== undefined && settings.typo !== null) ? settings.typo : 'o',
                    success: (settings.success !== undefined && settings.success !== null) ? settings.success : 'ot',
                    repeats: settings.repeats !== undefined ? settings.repeats : 3,
                    required_passed_star_half: settings.required_passed_star_half !== undefined ? settings.required_passed_star_half : 3,
                    without_entering_text: Boolean(settings.without_entering_text),
                    show_text: Boolean(settings.show_text),
                    speech_recognition_mode: settings.speech_recognition_mode || 'route'
                }
            });
            
            updateData.settings_json = settingsJson;
            
            // Для обратной совместимости также отправляем отдельные поля (если бэкенд их еще использует)
            updateData.audio_start = (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto';
            updateData.audio_typo = (settings.typo !== undefined && settings.typo !== null) ? settings.typo : 'o';
            updateData.audio_success = (settings.success !== undefined && settings.success !== null) ? settings.success : 'ot';
            updateData.audio_repeats = settings.repeats !== undefined ? settings.repeats : 3;
            updateData.audio_required_passed_star_half = settings.required_passed_star_half !== undefined ? settings.required_passed_star_half : 3;
            updateData.speech_recognition_mode = settings.speech_recognition_mode || 'route';
        }

        showInfo('Сохраняем изменения...');

        const updatedUser = await UM.updateProfile(updateData);

        // Если бэкенд вернул avatar в ответе — синхронизируем, иначе оставляем текущий.
        // Это важно, чтобы после сохранения `checkForChanges()` мог корректно потушить "звёздочку".
        try {
            if (updatedUser && updatedUser.avatar) {
                originalData.avatar = updatedUser.avatar;
            } else if (UM && UM.userData && UM.userData.avatar) {
                originalData.avatar = UM.userData.avatar;
            }
        } catch (e) {
        }

        // Обновляем originalData полностью, включая настройки аудио из ответа сервера
        // Сначала пытаемся получить настройки из settings_json (новый формат)
        let audioSettings = {
            audio_start: '',
            audio_typo: '',
            audio_success: '',
            audio_repeats: 3,
            audio_required_passed_star_half: 3,
            speech_recognition_mode: 'route'
        };
        
        if (updatedUser.settings_json) {
            try {
                const settings = JSON.parse(updatedUser.settings_json);
                const audio = settings.audio || {};
                audioSettings = {
                    audio_start: audio.start || '',
                    audio_typo: audio.typo || '',
                    audio_success: audio.success || '',
                    audio_repeats: audio.repeats !== undefined ? audio.repeats : 3,
                    audio_required_passed_star_half: audio.required_passed_star_half !== undefined ? audio.required_passed_star_half : 3,
                    speech_recognition_mode: audio.speech_recognition_mode || 'route'
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
        if ((audioSettings.audio_success === undefined || audioSettings.audio_success === null) && updatedUser.audio_success !== undefined) {
            audioSettings.audio_success = updatedUser.audio_success;
        }
        if (audioSettings.audio_repeats === 3 && updatedUser.audio_repeats !== undefined) {
            audioSettings.audio_repeats = updatedUser.audio_repeats;
        }

        if (audioSettings.audio_required_passed_star_half === 3 && updatedUser.audio_required_passed_star_half !== undefined) {
            audioSettings.audio_required_passed_star_half = updatedUser.audio_required_passed_star_half;
        }

        if ((audioSettings.speech_recognition_mode === 'route' || audioSettings.speech_recognition_mode === '') && updatedUser.speech_recognition_mode !== undefined) {
            audioSettings.speech_recognition_mode = updatedUser.speech_recognition_mode;
        }
        
        // Если ничего не получили, используем значения из updateData
        if (!audioSettings.audio_start) {
            audioSettings.audio_start = updateData.audio_start || '';
        }
        if (!audioSettings.audio_typo) {
            audioSettings.audio_typo = updateData.audio_typo || '';
        }
        if (audioSettings.audio_success === undefined || audioSettings.audio_success === null) {
            audioSettings.audio_success = updateData.audio_success || '';
        }
        if (audioSettings.audio_repeats === 3 && updateData.audio_repeats !== undefined) {
            audioSettings.audio_repeats = updateData.audio_repeats;
        }

        if (audioSettings.audio_required_passed_star_half === 3 && updateData.audio_required_passed_star_half !== undefined) {
            audioSettings.audio_required_passed_star_half = updateData.audio_required_passed_star_half;
        }

        if ((audioSettings.speech_recognition_mode === 'route' || audioSettings.speech_recognition_mode === '') && updateData.speech_recognition_mode !== undefined) {
            audioSettings.speech_recognition_mode = updateData.speech_recognition_mode;
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
            audio_repeats: audioSettings.audio_repeats,
            audio_required_passed_star_half: audioSettings.audio_required_passed_star_half,
            speech_recognition_mode: audioSettings.speech_recognition_mode
        };
        
        // Обновляем UM.userData, чтобы при следующей загрузке страницы данные были актуальными
        if (UM && UM.userData) {
            // Обновляем основные данные пользователя
            UM.userData.username = updatedUser.username;
            UM.userData.native_language = updatedUser.native_language;
            UM.userData.learning_languages = updatedUser.learning_languages;
            UM.userData.current_learning = updatedUser.current_learning;

            try {
                window.USER_LANGUAGE_DATA = {
                    nativeLanguage: UM.userData.native_language || 'ru',
                    learningLanguages: UM.userData.learning_languages || ['en'],
                    currentLearning: UM.userData.current_learning || (UM.userData.learning_languages && UM.userData.learning_languages[0]) || 'en',
                    isAuthenticated: true
                };
            } catch (e) {
            }
            
            // ВАЖНО: Обновляем аватар из originalData, так как он уже был загружен через uploadAvatar
            // и сохранен в originalData.avatar при загрузке
            try {
                if (avatarUploadedThisSave) {
                    originalData.avatar = UM.userData.avatar || originalData.avatar || {};
                }
            } catch (e) {
            }

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
            UM.userData.audio_required_passed_star_half = originalData.audio_required_passed_star_half;
            UM.userData.speech_recognition_mode = originalData.speech_recognition_mode;
            
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
                repeats: originalData.audio_repeats,
                required_passed_star_half: originalData.audio_required_passed_star_half,
                speech_recognition_mode: originalData.speech_recognition_mode
            };
            
            if (updatedUser.settings_json) {
                try {
                    const settings = JSON.parse(updatedUser.settings_json);
                    const audio = settings.audio || {};
                    const hasStart = Object.prototype.hasOwnProperty.call(audio, 'start');
                    const hasTypo = Object.prototype.hasOwnProperty.call(audio, 'typo');
                    const hasSuccess = Object.prototype.hasOwnProperty.call(audio, 'success');
                    settingsToApply = {
                        start: (hasStart && audio.start !== undefined && audio.start !== null) ? audio.start : originalData.audio_start,
                        typo: (hasTypo && audio.typo !== undefined && audio.typo !== null) ? audio.typo : originalData.audio_typo,
                        success: (hasSuccess && audio.success !== undefined && audio.success !== null) ? audio.success : originalData.audio_success,
                        repeats: audio.repeats !== undefined ? audio.repeats : originalData.audio_repeats,
                        without_entering_text: Boolean(audio.without_entering_text),
                        show_text: Boolean(audio.show_text),
                        required_passed_star_half: audio.required_passed_star_half !== undefined ? audio.required_passed_star_half : originalData.audio_required_passed_star_half,
                        speech_recognition_mode: audio.speech_recognition_mode || originalData.speech_recognition_mode
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
        pendingAvatarBlob = null;
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
    const saveBtn = document.getElementById('exitWithSavingBtn');
    const stayBtn = document.getElementById('exitStayBtn');
    if (hasUnsavedChanges && saveBtn) saveBtn.focus();
    else if (stayBtn) stayBtn.focus();
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