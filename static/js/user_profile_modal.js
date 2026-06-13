/**
 * user_profile_modal.js — инициализация и управление модальным окном профиля пользователя
 * Используется на desktop.html в модальном окне #user-profile-modal
 *
 * Заменяет собой script_user_profile.js (удалён).
 * Содержит только функции, необходимые для работы модального окна профиля.
 */

// ==================== СОСТОЯНИЕ ====================
let UM;
let language_selector;
let originalData = {};
let hasUnsavedChanges = false;
let isSavingProfile = false;
let pendingAvatarBlob = null;
let passwordTouched = false;

let learningListSelector = null;

let profileTestRecorder = null;
let profileTestMediaStream = null;
let profileTestChunks = [];
let profileTestIsRecording = false;
let profileTestTimerId = null;
let profileTestAutoStopId = null;

const PROFILE_SAVE_KEY_VALUES = ['s', 'ы', 'і', 'س'];

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function profileT(key, params, fallback) {
    try {
        if (window.I18n && typeof window.I18n.t === 'function') {
            const v = window.I18n.t(key, params);
            if (v && v !== key) return v;
        }
    } catch (e) {
    }
    if (typeof fallback === 'string') return fallback;
    return String(key || '');
}

function showToast(message, type = 'info') {
    if (!message) return;
    const toast = document.createElement('div');
    toast.className = `toast-notice toast-with-icon${type ? ` ${type}` : ''}`;
    const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'circle-check' : 'info';
    toast.innerHTML = `
        <span class="toast-icon"><i data-lucide="${iconName}"></i></span>
        <span class="toast-message">${message}</span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        if (window.lucide) window.lucide.createIcons({ root: toast });
        toast.classList.add('visible');
    });
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 200);
    }, 2400);
}

function showInfo(message) { showToast(message, 'info'); }
function showSuccess(message) { showToast(message, 'success'); }
function showError(message) { showToast(message, 'error'); }

function extractLearningFlagsFromUser(userData) {
    const flags = {};
    try {
        if (!userData || typeof userData !== 'object') return flags;
        Object.keys(userData).forEach((k) => {
            if (!k || typeof k !== 'string') return;
            if (!k.startsWith('tr_')) return;
            const code = k.slice(3);
            if (!code) return;
            flags[code] = !!userData[k];
        });
    } catch (e) { }
    return flags;
}

function buildLearningFlagsFromLanguages(langs) {
    const out = {};
    try {
        const list = Array.isArray(langs) ? langs.map(x => String(x || '').trim().toLowerCase()).filter(Boolean) : [];
        list.forEach((code) => { out[`tr_${code}`] = true; });
    } catch (e) { }
    return out;
}

function createLucideToggleButton({ checked, title, disabled }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'groups-lucide-toggle';
    btn.title = title || '';
    btn.disabled = Boolean(disabled);
    btn.dataset.checked = checked ? '1' : '0';
    btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    btn.innerHTML = `<i data-lucide="${checked ? 'circle-check-big' : 'circle'}"></i>`;
    try { if (window.lucide) window.lucide.createIcons({ root: btn }); } catch (e) { }
    return btn;
}

function normalizeAvatarForCompare(avatar) {
    if (!avatar || typeof avatar !== 'object') return { large: '', small: '' };
    return {
        large: String(avatar.large || avatar.medium || avatar.original || ''),
        small: String(avatar.small || avatar.medium || avatar.original || '')
    };
}

function updateAvatarDisplay(avatar) {
    const avatarLarge = document.getElementById('avatarLarge');
    const avatarSmall = document.getElementById('avatarSmall');
    if (avatar && (avatar.large || avatar.original)) {
        const largeUrl = avatar.large || avatar.medium || avatar.original;
        const smallUrl = avatar.small || avatar.medium || avatar.original || largeUrl;
        let finalLarge = largeUrl;
        let finalSmall = smallUrl;
        try {
            if (window && window.CoverManager && typeof window.CoverManager.withCacheBust === 'function') {
                finalLarge = window.CoverManager.withCacheBust(largeUrl);
                finalSmall = window.CoverManager.withCacheBust(smallUrl);
            }
        } catch (e) { }
        avatarLarge.src = finalLarge;
        avatarSmall.src = finalSmall;
    } else {
        avatarLarge.src = '/static/icons/default-avatar-large.svg';
        avatarSmall.src = '/static/icons/default-avatar-small.svg';
    }
}

// ==================== SERVICE WORKER ====================

async function swRequest(action, payload = {}) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        throw new Error(profileT('profile.common.service_worker_inactive', null, 'Service Worker не активен'));
    }
    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Math.max(1000, Number(payload.timeoutMs) || 15000);
    return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
            try { channel.port1.onmessage = null; } catch (e) { }
            reject(new Error('sw_timeout'));
        }, timeoutMs);
        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.requestId !== requestId) return;
            clearTimeout(timer);
            if (data && data.success) resolve(data);
            else reject(new Error(data && data.error ? data.error : 'sw_error'));
        };
        try {
            navigator.serviceWorker.controller.postMessage({ action, requestId, ...payload }, [channel.port2]);
        } catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}

async function checkAppCacheRevision() {
    try {
        const res = await fetch('/api/app-cache-revision', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || !data.success || !data.revision) return;
        const serverRev = String(data.revision);
        const localRev = localStorage.getItem('app_cache_revision');
        if (!localRev) { localStorage.setItem('app_cache_revision', serverRev); return; }
        if (localRev === serverRev) return;
        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                await swRequest('cacheClearAppShell', { timeoutMs: 60000 });
            }
        } catch (e) { }
        localStorage.setItem('app_cache_revision', serverRev);
        try {
            if (sessionStorage.getItem('profile_forced_reload_done') === serverRev) return;
            sessionStorage.setItem('profile_forced_reload_done', serverRev);
        } catch (e) { }
        location.reload();
    } catch (e) { }
}

// ==================== UI LANGUAGE SELECTOR ====================

function initializeUiLangSelector() {
    const container = document.getElementById('uiLangSelectorContainer');
    if (!container) return;
    const supported = ['en', 'uk', 'ru', 'ar'];
    let current = '';
    try { current = (document.documentElement && document.documentElement.lang) ? String(document.documentElement.lang) : ''; } catch (e) { current = ''; }
    current = String(current || '').trim().toLowerCase();
    if (!supported.includes(current)) {
        try {
            const stored = (localStorage.getItem('ui_lang') || '').trim().toLowerCase();
            if (supported.includes(stored)) current = stored;
        } catch (e) { }
    }
    if (!supported.includes(current)) current = 'en';
    let uiLangSelector = null;
    try {
        const languageData = window.LanguageManager.getLanguageData();
        const refreshLearningDropdownAvailable = () => {
            try {
                const values = languageSelector && typeof languageSelector.getValues === 'function' ? languageSelector.getValues() : null;
                const learningLanguages = (values && Array.isArray(values.learningLanguages)) ? values.learningLanguages : originalData.learning_languages;
                if (learningSelector && learningSelector.options) {
                    learningSelector.options.learningAvailableLanguages = learningLanguages;
                    learningSelector.render();
                    if (window.lucide) window.lucide.createIcons();
                }
            } catch (e) { }
        };
        uiLangSelector = new LanguageSelector({
            container,
            mode: 'native-selector',
            nativeLanguage: current,
            nativeLanguages: supported,
            learningLanguages: supported,
            currentLearning: current,
            languageData,
            onLanguageChange: function (data) {
                try {
                    const next = String(data && data.nativeLanguage ? data.nativeLanguage : '').trim().toLowerCase();
                    if (!supported.includes(next)) return;
                    if (next === current) return;
                    handleUiLangChange(next);
                } catch (e) { }
            }
        });
    } catch (e) {
        container.innerHTML = '';
        return;
    }
    async function handleUiLangChange(next) {
        container.style.pointerEvents = 'none';
        container.style.opacity = '0.7';
        try {
            try { localStorage.setItem('ui_lang', next); } catch (e) { }
            if (window.I18n && typeof window.I18n.setLanguage === 'function') {
                try { await window.I18n.setLanguage(next); } catch (e) { }
            }
            const headers = { 'Content-Type': 'application/json' };
            try { if (UM && UM.token) headers['Authorization'] = `Bearer ${UM.token}`; } catch (e) { }
            const res = await fetch('/user/api/ui-lang', {
                method: 'POST', headers, body: JSON.stringify({ lang: next }),
            });
            if (!res.ok) throw new Error(profileT('profile.ui_language.save_error', null, 'Не удалось сохранить язык'));
            location.reload();
        } catch (e) {
            container.style.pointerEvents = '';
            container.style.opacity = '';
            showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
            try {
                if (uiLangSelector && typeof uiLangSelector.render === 'function') {
                    uiLangSelector.options.nativeLanguage = current;
                    uiLangSelector.options.currentLearning = current;
                    uiLangSelector.render();
                }
            } catch (e2) { }
        }
    }
}

// ==================== SAVE HOTKEY ====================

function installProfileSaveHotkey() {
    try {
        if (document.body && document.body.dataset && document.body.dataset.profileSaveHotkeyBound) return;
        if (document.body && document.body.dataset) document.body.dataset.profileSaveHotkeyBound = '1';
    } catch (e) { }
    document.addEventListener('keydown', async (event) => {
        try {
            if (event.repeat) return;
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.altKey) return;
            const key = (event.key || '').toLowerCase();
            if (!(event.code === 'KeyS' || PROFILE_SAVE_KEY_VALUES.includes(key))) return;
            event.preventDefault();
            const saveButton = document.getElementById('saveButton');
            if (saveButton && saveButton.disabled) return;
            await handleSave();
        } catch (e) { }
    }, true);
}

// ==================== PASSWORD TOGGLES ====================

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
        toggleBtn.setAttribute('aria-label', willShow
            ? profileT('profile.password_toggle.hide', null, 'Скрыть пароль')
            : profileT('profile.password_toggle.show', null, 'Показать пароль'));
        const iconName = willShow ? 'eye-off' : 'eye';
        toggleBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

// ==================== SECTION TOGGLES ====================

function initializeProfileSectionToggles() {
    try {
        if (document.body.dataset.profileSectionTogglesBound === '1') return;
        document.body.dataset.profileSectionTogglesBound = '1';
        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.profile-section-toggle') : null;
            if (!btn) return;
            const wasUnsaved = !!hasUnsavedChanges;
            const targetSelector = btn.dataset ? btn.dataset.target : null;
            if (!targetSelector) return;
            const target = document.querySelector(targetSelector);
            if (!target) return;
            const isCollapsed = (() => {
                try {
                    if (target.style && target.style.display) return target.style.display === 'none';
                    const cs = window.getComputedStyle ? window.getComputedStyle(target) : null;
                    return !!cs && cs.display === 'none';
                } catch (e2) { return target.style.display === 'none'; }
            })();
            target.style.display = isCollapsed ? 'block' : 'none';
            const icon = btn.querySelector('i[data-lucide]');
            if (icon) icon.setAttribute('data-lucide', isCollapsed ? 'chevrons-up' : 'chevrons-down');
            else btn.innerHTML = `<i data-lucide="${isCollapsed ? 'chevrons-up' : 'chevrons-down'}"></i>`;
            if (window.lucide) window.lucide.createIcons({ root: btn });
            if (!wasUnsaved) {
                setTimeout(() => {
                    try { checkForChanges(); if (hasUnsavedChanges) setUnsavedState(false); } catch (e) { }
                }, 0);
            }
        });
    } catch (e) { }
}

// ==================== GROUPS API ====================

async function groupsApiRequest(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    try { if (UM && UM.token) headers['Authorization'] = `Bearer ${UM.token}`; } catch (e) { }
    const res = await fetch(path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body || undefined,
    });
    if (!res.ok) {
        let errMsg = profileT('profile.common.error', null, 'Ошибка');
        try {
            const errData = await res.json().catch(() => null);
            if (errData && (errData.error || errData.message)) errMsg = String(errData.error || errData.message);
        } catch (e) { }
        throw new Error(errMsg);
    }
    return await res.json();
}

// ==================== GROUPS STATE ====================

let groupsUiState = {
    filterMode: 'active',
    selectedGroupId: null,
    selectedStudentId: null,
    selectedMembershipId: null,
    groups: [],
    memberships: [],
    myInvites: [],
};

function getGroupsFilterMode() { return groupsUiState.filterMode || 'active'; }

function getVisibleGroups() {
    const mode = getGroupsFilterMode();
    const all = Array.isArray(groupsUiState.groups) ? groupsUiState.groups : [];
    if (mode === 'active') return all.filter(g => !g.archived_at);
    if (mode === 'archived') return all.filter(g => !!g.archived_at);
    return all;
}

function getSelectedGroup() {
    const visible = getVisibleGroups();
    return visible.find(g => String(g.id) === String(groupsUiState.selectedGroupId)) || null;
}

function setSelectedGroup(groupId) {
    groupsUiState.selectedGroupId = groupId;
    renderGroupsDetails();
    refreshStudents();
}

function setSelectedStudent(studentId) { groupsUiState.selectedStudentId = studentId; }
function setSelectedMembership(groupId) { groupsUiState.selectedMembershipId = groupId; }

// ==================== GROUPS: INVITES ====================

async function refreshMyInvites() {
    try {
        const data = await groupsApiRequest('/groups/api/my-invites', { method: 'GET' });
        groupsUiState.myInvites = data && Array.isArray(data.invites) ? data.invites : [];
        renderMyInvitesTable();
    } catch (e) {
        groupsUiState.myInvites = [];
        renderMyInvitesTable();
    }
}

function renderMyInvitesTable() {
    const table = document.getElementById('groupsMyInvitesTable');
    if (!table) return;
    table.innerHTML = '';
    const invites = Array.isArray(groupsUiState.myInvites) ? groupsUiState.myInvites : [];
    invites.forEach((inv) => {
        const row = document.createElement('div');
        row.className = 'groups-students-table-row groups-memberships-table-row';
        const name = document.createElement('div');
        name.className = 'groups-student-name';
        name.textContent = String(inv.group_title || '');
        const actions = document.createElement('div');
        actions.className = 'groups-student-notify';
        const acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'button-color-lightgreen';
        acceptBtn.textContent = profileT('profile.groups.invites.accept', null, 'Принять');
        acceptBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                acceptBtn.disabled = true;
                const r = await groupsApiRequest(`/groups/api/invite/${encodeURIComponent(inv.id)}/accept`, { method: 'POST' });
                if (r && r.success) {
                    showSuccess(profileT('profile.groups.invites.accepted', null, 'Приглашение принято'));
                    await refreshMemberships();
                    await refreshMyInvites();
                } else {
                    showError(r && (r.error || r.message) ? String(r.error || r.message) : profileT('profile.common.error', null, 'Ошибка'));
                }
            } catch (err) { showError(err && err.message ? err.message : profileT('profile.common.error', null, 'Ошибка')); }
            finally { acceptBtn.disabled = false; }
        });
        const declineBtn = document.createElement('button');
        declineBtn.type = 'button';
        declineBtn.className = 'button-secondary';
        declineBtn.textContent = profileT('profile.groups.invites.decline', null, 'Отклонить');
        declineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                declineBtn.disabled = true;
                const r = await groupsApiRequest(`/groups/api/invite/${encodeURIComponent(inv.id)}/decline`, { method: 'POST' });
                if (r && r.success) {
                    showSuccess(profileT('profile.groups.invites.declined', null, 'Приглашение отклонено'));
                    await refreshMyInvites();
                } else {
                    showError(r && (r.error || r.message) ? String(r.error || r.message) : profileT('profile.common.error', null, 'Ошибка'));
                }
            } catch (err) { showError(err && err.message ? err.message : profileT('profile.common.error', null, 'Ошибка')); }
            finally { declineBtn.disabled = false; }
        });
        actions.appendChild(acceptBtn);
        actions.appendChild(declineBtn);
        const teacher = document.createElement('div');
        teacher.className = 'groups-student-status groups-memberships-teacher';
        const teacherName = document.createElement('span');
        teacherName.textContent = String(inv.teacher_username || '');
        teacher.appendChild(teacherName);
        const status = document.createElement('div');
        status.className = 'groups-student-status';
        status.textContent = profileT('profile.groups.invites.pending', null, 'ожидает');
        row.appendChild(name);
        row.appendChild(actions);
        row.appendChild(teacher);
        row.appendChild(status);
        table.appendChild(row);
    });
}

// ==================== GROUPS: MEMBERSHIPS ====================

function renderMembershipsTable() {
    const table = document.getElementById('groupsMembershipsTable');
    if (!table) return;
    table.innerHTML = '';
    const memberships = Array.isArray(groupsUiState.memberships) ? groupsUiState.memberships : [];
    memberships.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'groups-students-table-row groups-memberships-table-row';
        const name = document.createElement('div');
        name.className = 'groups-student-name';
        name.textContent = String(m.group_title || '');
        const teacher = document.createElement('div');
        teacher.className = 'groups-student-status groups-memberships-teacher';
        const teacherName = document.createElement('span');
        teacherName.textContent = String(m.teacher_username || '');
        teacher.appendChild(teacherName);
        row.appendChild(name);
        row.appendChild(teacher);
        table.appendChild(row);
    });
}

async function refreshMemberships() {
    try {
        const data = await groupsApiRequest('/groups/api/memberships', { method: 'GET' });
        groupsUiState.memberships = data && Array.isArray(data.memberships) ? data.memberships : [];
        renderMembershipsTable();
    } catch (e) {
        groupsUiState.memberships = [];
        renderMembershipsTable();
    }
}

async function leaveSelectedMembershipGroup() {
    const id = groupsUiState.selectedMembershipId;
    if (!id) { showInfo(profileT('profile.groups.errors.select_membership', null, 'Выбери группу')); return; }
    try {
        await groupsApiRequest(`/groups/api/memberships/${encodeURIComponent(id)}/leave`, { method: 'POST' });
        showSuccess(profileT('profile.groups.membership_left', null, 'Вы вышли из группы'));
        await refreshMemberships();
    } catch (e) { showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка')); }
}

// ==================== GROUPS: TABLE & DETAILS ====================

function renderGroupsTable() {
    const table = document.getElementById('groupsTable');
    if (!table) return;
    table.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'groups-table-header';
    const h1 = document.createElement('div');
    h1.textContent = profileT('profile.groups.table.id', null, 'ID');
    const h2 = document.createElement('div');
    h2.textContent = profileT('profile.groups.table.name', null, 'Название');
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
        empty.textContent = profileT('profile.groups.table.empty', null, 'Пока нет групп');
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
        c2.className = 'groups-table-cell-name';
        c2.textContent = String(g.title || '');
        const c3 = document.createElement('div');
        c3.className = 'groups-table-actions-cell';
        if (isArchived) {
            // Кнопка восстановления (save-off)
            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'groups-row-restore-btn';
            restoreBtn.title = profileT('profile.groups.actions.restore_title', null, 'Снять архивацию группы');
            restoreBtn.innerHTML = '<i data-lucide="save-off"></i>';
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
        if (!btn) return;
        btn.innerHTML = '<i data-lucide="copy"></i>';
        if (window.lucide) {
            window.lucide.createIcons({ root: btn });
        }
    } catch (e) {
    }
}

// ==================== GROUPS: INVITE LINK ====================

async function refreshInviteForSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) return;
    if (g.is_personal) return;

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

async function createInviteForSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
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
        if (!path) throw new Error(profileT('profile.groups.invite_link.errors.get_failed', null, 'Не удалось получить ссылку'));
        const fullUrl = `${location.origin}${path}`;
        if (inviteEl) inviteEl.value = fullUrl;
        if (!groupsUiState._inviteLinksByGroupId) groupsUiState._inviteLinksByGroupId = {};
        groupsUiState._inviteLinksByGroupId[String(g.id)] = fullUrl;
        updateInviteCopyButtonIcon();
        return fullUrl;
    } catch (e) {
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
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
        showSuccess(profileT('profile.common.link_copied', null, 'Ссылка скопирована'));
    } catch (e) {
        showInfo(profileT('profile.common.copy_manually', null, 'Скопируй ссылку вручную'));
    }
}

let _deleteGroupId = null;

function toggleGroupDeleteConfirmModal(isOpen) {
    const modal = document.getElementById('groupDeleteConfirmModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
}

function openGroupDeleteConfirmModal(group) {
    _deleteGroupId = group ? group.id : null;
    const textEl = document.getElementById('groupDeleteConfirmModalText');
    if (textEl && group) {
        const groupName = String(group.title || group.id || '');
        textEl.textContent = profileT(
            'profile.groups.actions.delete_permanently_confirm',
            { name: groupName },
            'Точно удалить группу "' + groupName + '" навсегда? Все ученики, задания и приглашения будут безвозвратно удалены.'
        );
    }
    toggleGroupDeleteConfirmModal(true);
}

async function confirmDeleteGroupFromModal() {
    if (!_deleteGroupId) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
        return;
    }
    toggleGroupDeleteConfirmModal(false);
    try {
        await groupsApiRequest(`/groups/api/group/${_deleteGroupId}`, {
            method: 'DELETE',
        });
        showSuccess(profileT('profile.groups.actions.deleted_permanently', null, 'Группа удалена навсегда'));
        groupsUiState.selectedGroupId = null;
        _deleteGroupId = null;
        await refreshGroups();
    } catch (e) {
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
    }
}

async function deleteSelectedGroup(group) {
    const g = group || getSelectedGroup();
    if (!g) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
        return;
    }
    openGroupDeleteConfirmModal(g);
}

// ==================== GROUPS: ARCHIVE / DELETE ====================

async function archiveSelectedGroup() {
    const g = getSelectedGroup();
    if (!g) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
        return;
    }
    try {
        await groupsApiRequest(`/groups/api/group/${g.id}`, {
            method: 'PUT',
            body: JSON.stringify({ archived_at: new Date().toISOString() }),
        });
        showSuccess(profileT('profile.groups.actions.archived', null, 'Группа архивирована'));
        groupsUiState.selectedGroupId = null;
        await refreshGroups();
    } catch (e) {
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
    }
}

// ==================== GROUPS: STUDENTS ====================

function renderStudentsTable(students) {
    const table = document.getElementById('groupsStudentsTable');
    if (!table) return;
    table.innerHTML = '';

    const currentUserId = (window.UM && window.UM.userData && window.UM.userData.id != null) ? String(window.UM.userData.id) : null;

    if (!groupsUiState.selectedGroupId) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.color = '#666';
        empty.textContent = profileT('profile.groups.details.select_left', null, 'Выбери группу слева');
        table.appendChild(empty);
        return;
    }

    if (!Array.isArray(students) || students.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.color = '#666';
        empty.textContent = profileT('profile.groups.students.empty', null, 'Пока нет учеников');
        table.appendChild(empty);
        return;
    }

    students.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'groups-students-table-row';
        row.dataset.studentId = String(s.id);
        const isEmailInviteRow = String(s.kind || '') === 'email_invite' || String(s.id || '').startsWith('email_invite:');
        const g = getSelectedGroup();
        const isSelfRow = !isEmailInviteRow && currentUserId && String(s.id) === currentUserId;
        const hideNotifyToggle = Boolean(g && g.is_personal) && isSelfRow;
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
        if (isEmailInviteRow) {
            status.textContent = profileT('profile.groups.invites.pending', null, 'ожидает');
        } else {
            status.textContent = st === 'active' ? '' : 'не подтвердил';
        }

        const notifyWrap = document.createElement('div');
        notifyWrap.className = 'groups-student-notify';

        const notifyLabel = document.createElement('span');
        notifyLabel.className = 'groups-student-notify-label';
        notifyLabel.textContent = 'TG';

        if (hideNotifyToggle) {
            notifyLabel.style.visibility = 'hidden';
            notifyWrap.appendChild(notifyLabel);
            const spacer = document.createElement('div');
            spacer.className = 'groups-student-notify-spacer';
            notifyWrap.appendChild(spacer);
        } else {
            notifyWrap.appendChild(notifyLabel);
            const startChecked = isEmailInviteRow ? false : (s.notify_teacher_on_success !== false);
            const notifyBtn = createLucideToggleButton({
                checked: startChecked,
                title: profileT('profile.groups.students.notify_teacher_title', null, 'Уведомлять учителя о выполнении этим учеником'),
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
                    showSuccess(profileT('profile.common.saved', null, 'Сохранено'));
                } catch (e) {
                    showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
                } finally {
                    notifyBtn.disabled = false;
                }
            });

            notifyWrap.appendChild(notifyBtn);
        }

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(notifyWrap);
        row.appendChild(status);

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

async function refreshStudents() {
    const g = getSelectedGroup();
    if (!g) return;
    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}/students`, { method: 'GET' });
        renderStudentsTable(data && Array.isArray(data.students) ? data.students : []);
    } catch (e) { renderStudentsTable([]); }
}

async function refreshSelectedGroupDetailsFromServer() {
    const g = getSelectedGroup();
    if (!g) return;
    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}`, { method: 'GET' });
        if (data && data.group) { Object.assign(g, data.group); renderGroupsDetails(); }
    } catch (e) { }
}

async function removeSelectedStudent() {
    const g = getSelectedGroup();
    const studentId = groupsUiState.selectedStudentId;
    if (!g) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
        return;
    }
    if (!studentId) {
        showInfo(profileT('profile.groups.students.select_student', null, 'Выбери ученика'));
        return;
    }
    if (String(studentId).startsWith('email_invite:')) {
        showInfo(profileT('profile.groups.students.cannot_remove_pending_invite', null, 'Нельзя удалить: ученик ещё не подтвердил приглашение'));
        return;
    }
    try {
        await groupsApiRequest(`/groups/api/group/${g.id}/students/${studentId}/remove`, { method: 'POST' });
        showSuccess(profileT('profile.groups.students.removed', null, 'Ученик удалён'));
        groupsUiState.selectedStudentId = null;
        await refreshGroups();
        await refreshStudents();
    } catch (e) {
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
    }
}

// ==================== GROUPS: MODALS ====================

function toggleGroupModal(isOpen) {
    const modal = document.getElementById('groupModal');
    console.log('[toggleGroupModal] isOpen:', isOpen, 'modal:', modal);
    if (!modal) { console.warn('[toggleGroupModal] modal not found!'); return; }
    modal.style.display = isOpen ? 'flex' : 'none';
    console.log('[toggleGroupModal] display set to:', modal.style.display);
    if (isOpen && window.lucide) window.lucide.createIcons({ root: modal });
}

function toggleGroupRestoreModal(isOpen) {
    const modal = document.getElementById('groupRestoreModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
}

function openGroupRestoreModal(group) {
    if (!group) return;
    groupsUiState.restoreGroupId = group.id;
    const nameEl = document.getElementById('groupRestoreModalName');
    if (nameEl) nameEl.textContent = String(group.title || '');
    toggleGroupRestoreModal(true);
}

async function restoreGroupFromModal() {
    const groupId = groupsUiState.restoreGroupId;
    if (!groupId) return;
    try {
        await groupsApiRequest(`/groups/api/group/${groupId}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) });
        showSuccess(profileT('profile.groups.restored', null, 'Группа восстановлена'));
        toggleGroupRestoreModal(false);
        await refreshGroups();
    } catch (e) { showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка')); }
}

function openGroupModal(mode, group) {
    const modal = document.getElementById('groupModal');
    const titleEl = document.getElementById('groupModalTitle');
    const nameInput = document.getElementById('groupModalTitleInput');
    const descInput = document.getElementById('groupModalDescriptionInput');
    console.log('[openGroupModal] mode:', mode, 'modal:', !!modal, 'titleEl:', !!titleEl, 'nameInput:', !!nameInput, 'descInput:', !!descInput);
    if (!modal || !titleEl || !nameInput) { console.warn('[openGroupModal] missing elements, aborting'); return; }
    if (mode === 'edit' && group) {
        titleEl.textContent = profileT('profile.groups.modal.edit_title', null, 'Редактировать группу');
        nameInput.value = String(group.title || '');
        if (descInput) descInput.value = String(group.description || '');
        groupsUiState.editingGroupId = group.id;
    } else {
        titleEl.textContent = profileT('profile.groups.modal.create_title', null, 'Создать группу');
        nameInput.value = '';
        if (descInput) descInput.value = '';
        groupsUiState.editingGroupId = null;
    }
    toggleGroupModal(true);
}

async function saveGroupFromModal() {
    const nameInput = document.getElementById('groupModalTitleInput');
    const descInput = document.getElementById('groupModalDescriptionInput');
    const saveBtn = document.getElementById('groupModalSave');
    if (!nameInput) return;
    const title = String(nameInput.value || '').trim();
    if (!title) { showInfo(profileT('profile.groups.errors.name_required', null, 'Введите название группы')); return; }
    const description = descInput ? String(descInput.value || '').trim() : '';
    const editingId = groupsUiState.editingGroupId;
    if (saveBtn) saveBtn.disabled = true;
    try {
        if (editingId) {
            await groupsApiRequest(`/groups/api/group/${editingId}`, {
                method: 'PUT', body: JSON.stringify({ title, description }),
            });
            showSuccess(profileT('profile.groups.updated', null, 'Группа обновлена'));
        } else {
            await groupsApiRequest('/groups/api/group', {
                method: 'POST', body: JSON.stringify({ title, description }),
            });
            showSuccess(profileT('profile.groups.created', null, 'Группа создана'));
        }
        toggleGroupModal(false);
        await refreshGroups();
    } catch (e) {
        if (saveBtn) saveBtn.disabled = false;
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
    }
}

async function refreshGroups() {
    try {
        const data = await groupsApiRequest('/groups/api/my', { method: 'GET' });
        groupsUiState.groups = data && Array.isArray(data.groups) ? data.groups : [];
        renderGroupsTable();
        renderGroupsDetails();
        refreshStudents();
    } catch (e) {
        groupsUiState.groups = [];
        renderGroupsTable();
        renderGroupsDetails();
        refreshStudents();
    }
}

async function createEmailInviteForSelectedGroup(targetEmail) {
    const g = getSelectedGroup();
    if (!g) {
        showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
        return null;
    }
    try {
        const data = await groupsApiRequest(`/groups/api/group/${g.id}/invite/email`, {
            method: 'POST',
            body: JSON.stringify({ email: targetEmail }),
        });
        if (data && data.success) {
            showSuccess(profileT('profile.groups.invite_email_sent', null, 'Приглашение отправлено'));
            return data;
        }
        const msg = data && (data.error || data.message) ? String(data.error || data.message) : profileT('profile.common.error', null, 'Ошибка');
        showError(msg);
        return null;
    } catch (e) {
        showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
        return null;
    }
}

function toggleGroupEmailInviteModal(isOpen) {
    const modal = document.getElementById('groupEmailInviteModal');
    if (!modal) return;
    modal.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
        const input = document.getElementById('groupEmailInviteInput');
        if (input) { input.value = ''; input.focus(); }
    }
}

async function submitGroupEmailInviteFromModal() {
    const input = document.getElementById('groupEmailInviteInput');
    if (!input) return;
    const email = String(input.value || '').trim();
    if (!email) { showInfo(profileT('profile.groups.errors.email_required', null, 'Введите email')); return; }
    const result = await createEmailInviteForSelectedGroup(email);
    if (result) toggleGroupEmailInviteModal(false);
}

// ==================== GROUPS: INIT ====================

function initializeGroupsSection() {
    const groupsTable = document.getElementById('groupsTable');
    const createBtn = document.getElementById('groupsCreateBtn');
    const archiveBtn = document.getElementById('groupsArchiveBtn');
    const delBtn = document.getElementById('groupsDeleteBtn');
    const inviteCopyBtn = document.getElementById('groupsInviteCopyBtn');
    const studentsRefreshBtn = document.getElementById('groupsStudentsRefreshBtn');
    const studentsInviteEmailBtn = document.getElementById('groupsStudentsInviteEmailBtn');
    const studentsInviteLinkBtn = document.getElementById('groupsStudentsInviteLinkBtn');
    const studentsDeleteBtn = document.getElementById('groupsStudentsDeleteBtn');

    const membershipsRefreshBtn = document.getElementById('groupsMembershipsRefreshBtn');
    const membershipsLeaveBtn = document.getElementById('groupsMembershipsLeaveBtn');

    const myInvitesRefreshBtn = document.getElementById('groupsMyInvitesRefreshBtn');

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

    if (!groupsTable || !createBtn || !archiveBtn || !delBtn || !modal || !modalClose || !modalSave) return;

    // Чекбокс "лише активні" вместо select
    const filterBtn = document.getElementById('groupsFilterActiveBtn');
    if (filterBtn) {
        groupsUiState.filterMode = 'active';
        filterBtn.dataset.checked = '1';
        filterBtn.setAttribute('aria-pressed', 'true');
        filterBtn.innerHTML = '<i data-lucide="circle-check-big"></i>';
        requestAnimationFrame(() => {
            try { if (window.lucide) window.lucide.createIcons({ root: filterBtn }); } catch (e) { }
        });

        filterBtn.addEventListener('click', () => {
            const isActive = filterBtn.dataset.checked === '1';
            const newChecked = isActive ? '0' : '1';
            filterBtn.dataset.checked = newChecked;
            filterBtn.setAttribute('aria-pressed', newChecked === '1' ? 'true' : 'false');
            filterBtn.innerHTML = `<i data-lucide="${newChecked === '1' ? 'circle-check-big' : 'circle'}"></i>`;
            requestAnimationFrame(() => {
                try { if (window.lucide) window.lucide.createIcons({ root: filterBtn }); } catch (e) { }
            });
            groupsUiState.filterMode = newChecked === '1' ? 'active' : 'all';
            groupsUiState.selectedGroupId = null;
            renderGroupsTable();
            renderGroupsDetails();
            refreshStudents();
            const visible = getVisibleGroups();
            if (visible.length > 0) setSelectedGroup(visible[0].id);
        });
    }

    createBtn.addEventListener('click', () => openGroupModal('create'));
    archiveBtn.addEventListener('click', () => archiveSelectedGroup());
    delBtn.addEventListener('click', () => {
        const g = getSelectedGroup();
        if (!g) {
            showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу'));
            return;
        }
        deleteSelectedGroup(g);
    });
    inviteCopyBtn && inviteCopyBtn.addEventListener('click', () => copyInviteLink());
    studentsRefreshBtn && studentsRefreshBtn.addEventListener('click', async () => {
        await refreshSelectedGroupDetailsFromServer();
        await refreshStudents();
    });
    studentsInviteEmailBtn && studentsInviteEmailBtn.addEventListener('click', async () => {
        const g = getSelectedGroup();
        if (!g) { showInfo(profileT('profile.groups.errors.select_group', null, 'Выбери группу')); return; }
        toggleGroupEmailInviteModal(true);
    });
    studentsInviteLinkBtn && studentsInviteLinkBtn.addEventListener('click', () => copyInviteLink());
    studentsDeleteBtn && studentsDeleteBtn.addEventListener('click', () => removeSelectedStudent());

    membershipsRefreshBtn && membershipsRefreshBtn.addEventListener('click', async () => {
        await refreshMemberships();
        await refreshMyInvites();
    });
    membershipsLeaveBtn && membershipsLeaveBtn.addEventListener('click', async () => {
        await leaveSelectedMembershipGroup();
    });

    myInvitesRefreshBtn && myInvitesRefreshBtn.addEventListener('click', async () => {
        await refreshMyInvites();
    });

    if (emailInviteModal && emailInviteModalClose && emailInviteModalCancel && emailInviteModalSend) {
        emailInviteModalClose.addEventListener('click', () => toggleGroupEmailInviteModal(false));
        emailInviteModalCancel.addEventListener('click', () => toggleGroupEmailInviteModal(false));
        emailInviteModal.addEventListener('click', (e) => {
            if (e.target === emailInviteModal) toggleGroupEmailInviteModal(false);
        });
        emailInviteModalSend.addEventListener('click', async () => submitGroupEmailInviteFromModal());
        if (emailInviteInput) {
            emailInviteInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') { e.preventDefault(); await submitGroupEmailInviteFromModal(); }
            });
        }
    }

    modalClose.addEventListener('click', () => toggleGroupModal(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) toggleGroupModal(false); });
    modalSave.addEventListener('click', () => saveGroupFromModal());

    if (restoreModal && restoreModalClose && restoreModalYes) {
        restoreModalClose.addEventListener('click', () => toggleGroupRestoreModal(false));
        restoreModal.addEventListener('click', (e) => { if (e.target === restoreModal) toggleGroupRestoreModal(false); });
        restoreModalYes.addEventListener('click', () => restoreGroupFromModal());
    }

    // Модалка подтверждения полного удаления группы
    const deleteConfirmModal = document.getElementById('groupDeleteConfirmModal');
    const deleteConfirmModalClose = document.getElementById('groupDeleteConfirmModalClose');
    const deleteConfirmModalCancel = document.getElementById('groupDeleteConfirmModalCancel');
    const deleteConfirmModalYes = document.getElementById('groupDeleteConfirmModalYes');
    if (deleteConfirmModal && deleteConfirmModalClose && deleteConfirmModalCancel && deleteConfirmModalYes) {
        deleteConfirmModalClose.addEventListener('click', () => toggleGroupDeleteConfirmModal(false));
        deleteConfirmModalCancel.addEventListener('click', () => toggleGroupDeleteConfirmModal(false));
        deleteConfirmModal.addEventListener('click', (e) => { if (e.target === deleteConfirmModal) toggleGroupDeleteConfirmModal(false); });
        deleteConfirmModalYes.addEventListener('click', () => confirmDeleteGroupFromModal());
    }

    refreshGroups();
    refreshMemberships();
    refreshMyInvites();
}

// ==================== TELEGRAM SECTION ====================

function avatarUrlForUser(userId) {
    if (!userId) return '';
    return `/user/api/avatar?user_id=${encodeURIComponent(String(userId))}&size=small`;
}

function renderTelegramSection() {
    const statusEl = document.getElementById('telegramStatusText');
    const codeLabel = document.getElementById('telegramLinkCodeLabel');
    const qrImg = document.getElementById('telegramQrImg');
    const selfReportsToggleBtn = document.getElementById('telegramSelfReportsEnabledToggleBtn');
    const getCodeBtn = document.getElementById('telegramGetCodeBtn');
    const openBotBtn = document.getElementById('telegramOpenBotBtn');
    const copyBtn = document.getElementById('telegramCopyStartCmdBtn');
    const refreshBtn = document.getElementById('telegramRefreshStatusBtn');
    const botUsernameLabel = document.getElementById('telegramBotUsernameLabel');
    const testSendBtn = document.getElementById('telegramTestSendBtn');
    const testInput = document.getElementById('telegramTestMessageInput');

    if (!statusEl || !codeLabel || !selfReportsToggleBtn || !getCodeBtn || !copyBtn || !refreshBtn) return;

    const user = (UM && UM.userData) ? UM.userData : {};
    const chatId = user.telegram_chat_id;
    const selfReportsEnabled = Boolean(user.telegram_self_reports_enabled);
    const linked = Boolean(chatId);

    const t = (key, params, fallback) => {
        try {
            if (window.I18n && typeof window.I18n.t === 'function') {
                const v = window.I18n.t(key, params);
                if (v && v !== key) return v;
            }
        } catch (e) {
        }
        if (typeof fallback === 'string') return fallback;
        return String(key || '');
    };

    statusEl.textContent = linked ? `chat_id: ${chatId}` : '';

    // Обновляем имя бота динамически
    const botUsername = (UM && UM.userData && UM.userData.telegram_bot_name) ? UM.userData.telegram_bot_name : 'dictafan_user_bot';
    if (botUsernameLabel) {
        botUsernameLabel.textContent = `@${botUsername}`;
    }

    const _setBtnState = (btn, value) => {
        if (!btn) return;
        btn.dataset.checked = value ? '1' : '0';
        btn.setAttribute('aria-pressed', value ? 'true' : 'false');
        btn.innerHTML = `<i data-lucide="${value ? 'circle-check-big' : 'circle'}"></i>`;
        try {
            if (window.lucide) {
                window.lucide.createIcons({ root: btn });
            }
        } catch (e) {
        }
    };

    _setBtnState(selfReportsToggleBtn, selfReportsEnabled);

    const codeVal = String(user.telegram_link_code || codeLabel.dataset.code || '').trim();
    codeLabel.dataset.code = codeVal;
    codeLabel.textContent = codeVal || profileT('profile.telegram.link.code_placeholder', null, 'код');

    if (qrImg) {
        if (codeVal) {
            qrImg.style.display = 'block';
            qrImg.src = `/user/api/telegram/qr?code=${encodeURIComponent(codeVal)}&r=${Date.now()}`;
        } else {
            qrImg.style.display = 'none';
            qrImg.removeAttribute('src');
        }
    }

    try {
        getCodeBtn.disabled = false;
        copyBtn.disabled = !codeVal;
    } catch (e) {
    }

    getCodeBtn.onclick = async () => {
        try {
            getCodeBtn.disabled = true;
            const data = await telegramApiRequest('/user/api/telegram/link_code', { method: 'POST' });
            if (!data || !data.success || !data.code) {
                throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : profileT('profile.common.error', null, 'Ошибка'));
            }
            codeLabel.dataset.code = String(data.code);
            codeLabel.textContent = String(data.code);
            if (UM && UM.userData) {
                UM.userData.telegram_link_code = String(data.code);
            }
            copyBtn.disabled = false;
            renderTelegramSection();
            showSuccess(profileT('profile.telegram.link.code_received', null, 'Код получен'));
        } catch (e) {
            showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
        } finally {
            getCodeBtn.disabled = false;
        }
    };

    if (openBotBtn) {
        openBotBtn.onclick = async (e) => {
            try {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                openBotBtn.disabled = true;
                if (linked) {
                    const url = `https://t.me/${encodeURIComponent(botUsername)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                    return;
                }

                let code = String(codeLabel.dataset.code || '').trim();
                if (!code) {
                    const data = await telegramApiRequest('/user/api/telegram/link_code', { method: 'POST' });
                    if (!data || !data.success || !data.code) {
                        throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : profileT('profile.common.error', null, 'Ошибка'));
                    }
                    code = String(data.code).trim();
                    codeLabel.dataset.code = code;
                    codeLabel.textContent = code;
                    if (UM && UM.userData) {
                        UM.userData.telegram_link_code = code;
                    }
                    try { copyBtn.disabled = false; } catch (e2) {}
                    // Обновляем QR-код без перерисовки всей секции
                    if (qrImg) {
                        qrImg.style.display = 'block';
                        qrImg.src = `/user/api/telegram/qr?code=${encodeURIComponent(code)}&r=${Date.now()}`;
                    }
                }

                const url = `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(code)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch (e) {
                showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
            } finally {
                openBotBtn.disabled = false;
            }
        };
    }

    refreshBtn.onclick = async () => {
        try {
            refreshBtn.disabled = true;
            const data = await telegramApiRequest('/user/api/profile', { method: 'GET' });
            const nextUser = data && data.user ? data.user : null;
            if (!nextUser) {
                throw new Error(profileT('profile.telegram.errors.profile_refresh_failed', null, 'Не удалось обновить профиль'));
            }
            if (UM) {
                UM.userData = Object.assign({}, UM.userData || {}, nextUser);
                if (typeof UM._saveUserCache === 'function') {
                    UM._saveUserCache(UM.userData);
                }
            }
            renderTelegramSection();
            showSuccess(profileT('profile.common.updated', null, 'Обновлено'));
        } catch (e) {
            showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
        } finally {
            refreshBtn.disabled = false;
        }
    };

    copyBtn.onclick = async () => {
        const code = String(codeLabel.dataset.code || '').trim();
        if (!code) {
            showInfo(profileT('profile.telegram.link.get_code_first', null, 'Сначала получи код'));
            return;
        }
        const cmd = `/start ${code}`;
        try {
            await navigator.clipboard.writeText(cmd);
            showSuccess(profileT('profile.common.copied', null, 'Скопировано'));
        } catch (e) {
            showInfo(cmd);
        }
    };

    selfReportsToggleBtn.onclick = async () => {
        const next = !(selfReportsToggleBtn.dataset.checked === '1');
        try {
            selfReportsToggleBtn.disabled = true;
            const data = await telegramApiRequest('/user/api/telegram/self_reports_enabled', {
                method: 'POST',
                body: JSON.stringify({ enabled: next }),
            });
            if (!data || !data.success) {
                throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : profileT('profile.common.error', null, 'Ошибка'));
            }
            if (UM && UM.userData) {
                UM.userData.telegram_self_reports_enabled = Boolean(data.enabled);
                if (typeof UM._saveUserCache === 'function') {
                    UM._saveUserCache(UM.userData);
                }
            }
            _setBtnState(selfReportsToggleBtn, Boolean(data.enabled));
            showSuccess(profileT('profile.common.saved', null, 'Сохранено'));
        } catch (e) {
            showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
        } finally {
            selfReportsToggleBtn.disabled = false;
        }
    };

    // Обработчик кнопки отправки тестового сообщения
    if (testSendBtn && testInput) {
        testSendBtn.onclick = async () => {
            try {
                testSendBtn.disabled = true;
                const text = testInput.value.trim() || 'Тест';
                const data = await telegramApiRequest('/user/api/telegram/test_send', {
                    method: 'POST',
                    body: JSON.stringify({ text }),
                });
                if (!data || !data.success) {
                    throw new Error(data && (data.error || data.message) ? String(data.error || data.message) : profileT('profile.common.error', null, 'Ошибка'));
                }
                const sentCount = data.sent_count || 0;
                showSuccess(profileT('profile.telegram.test_sent', { count: sentCount }, `Тестовое сообщение отправлено (${sentCount} получателей)`));
            } catch (e) {
                showError(e && e.message ? e.message : profileT('profile.common.error', null, 'Ошибка'));
            } finally {
                testSendBtn.disabled = false;
            }
        };
    }

    try {
        if (window.lucide) {
            window.lucide.createIcons({ root: document.getElementById('telegramSection') });
        }
    } catch (e) {
    }
}

async function telegramApiRequest(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    try { if (UM && UM.token) headers['Authorization'] = `Bearer ${UM.token}`; } catch (e) { }
    const res = await fetch(path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body || undefined,
    });
    if (!res.ok) {
        let errMsg = 'Ошибка';
        try {
            const errData = await res.json().catch(() => null);
            if (errData && (errData.error || errData.message)) errMsg = String(errData.error || errData.message);
        } catch (e) { }
        throw new Error(errMsg);
    }
    return await res.json();
}

// ==================== LANGUAGE SELECTOR ====================

function initializeLanguageSelector() {
    const nativeContainer = document.getElementById('nativeLanguageSelectorContainer');
    const learningContainer = document.getElementById('learningLanguageSelectorContainer');
    const learningListContainer = document.getElementById('learningLanguagesListContainer');

    if (!nativeContainer || !learningContainer) {
        console.error('❌ Контейнеры для LanguageSelector не найдены');
        return;
    }

    try {
        const languageData = window.LanguageManager.getLanguageData();

        const nativeSelector = new LanguageSelector({
            container: nativeContainer,
            mode: 'native-selector',
            nativeLanguage: originalData.native_language,
            learningLanguages: originalData.learning_languages,
            currentLearning: originalData.current_learning,
            languageData: languageData,
            onLanguageChange: function () { checkForChanges(); }
        });

        const learningSelector = new LanguageSelector({
            container: learningContainer,
            mode: 'learning-selector',
            nativeLanguage: originalData.native_language,
            learningLanguages: originalData.learning_languages,
            currentLearning: originalData.current_learning,
            learningAvailableLanguages: originalData.learning_languages,
            languageData: languageData,
            onLanguageChange: function () { checkForChanges(); }
        });

        const refreshLearningDropdownAvailable = () => {
            try {
                const values = languageSelector && typeof languageSelector.getValues === 'function' ? languageSelector.getValues() : null;
                const learningLanguages = (values && Array.isArray(values.learningLanguages)) ? values.learningLanguages : originalData.learning_languages;
                if (learningSelector && learningSelector.options) {
                    learningSelector.options.learningAvailableLanguages = learningLanguages;
                    learningSelector.render();
                    if (window.lucide) window.lucide.createIcons();
                }
            } catch (e) { }
        };

        if (learningListContainer) {
            learningListSelector = new LanguageSelector({
                container: learningListContainer,
                mode: 'learning-flags',
                nativeLanguage: originalData.native_language,
                learningLanguages: originalData.learning_languages,
                currentLearning: originalData.current_learning,
                languageData: languageData,
                onLanguageChange: function (changeData) {
                    try {
                        const langs = changeData && Array.isArray(changeData.learningLanguages) ? changeData.learningLanguages : null;
                        if (langs && learningSelector && learningSelector.options) {
                            learningSelector.options.learningAvailableLanguages = langs;
                            learningSelector.options.learningLanguages = langs;
                            if (changeData && changeData.currentLearning) {
                                learningSelector.options.currentLearning = changeData.currentLearning;
                            }
                            learningSelector.render();
                            if (window.lucide) window.lucide.createIcons();
                        } else {
                            try { refreshLearningDropdownAvailable(); } catch (e2) { }
                        }
                    } catch (e) {
                        try { refreshLearningDropdownAvailable(); } catch (e2) { }
                    }
                    checkForChanges();
                }
            });
        }

        languageSelector = {
            getValues: function () {
                const a = nativeSelector && typeof nativeSelector.getValues === 'function' ? nativeSelector.getValues() : null;
                const b = learningSelector && typeof learningSelector.getValues === 'function' ? learningSelector.getValues() : null;
                const c = learningListSelector && typeof learningListSelector.getValues === 'function' ? learningListSelector.getValues() : null;
                const learningLanguages = (c && Array.isArray(c.learningLanguages)) ? c.learningLanguages : ((b && b.learningLanguages) ? b.learningLanguages : originalData.learning_languages);
                const fromSelector = (b && b.currentLearning) ? String(b.currentLearning) : '';
                const baseCurrent = fromSelector ? fromSelector : String(originalData.current_learning || '');
                const safeCurrent = learningLanguages.includes(baseCurrent) ? baseCurrent : (learningLanguages[0] || baseCurrent);
                return {
                    nativeLanguage: (a && a.nativeLanguage) ? a.nativeLanguage : originalData.native_language,
                    learningLanguages: learningLanguages,
                    currentLearning: safeCurrent,
                };
            }
        };

        try { refreshLearningDropdownAvailable(); } catch (e) { }
        window.languageSelector = languageSelector;

    } catch (error) {
        console.error('❌ Ошибка инициализации LanguageSelector:', error);
        nativeContainer.innerHTML = '<div style="padding:10px;background:#f8f9fa;border-radius:5px;text-align:center;"><p style="color:#dc3545;">Ошибка загрузки языковых настроек</p></div>';
        learningContainer.innerHTML = nativeContainer.innerHTML;
    }
}

// ==================== LANGUAGE MODELS SELECTOR ====================

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
            onLanguageChange: function (data) { }
        });
        window.languageModelsSelector = languageModelsSelector;
    } catch (error) {
        console.error('❌ Ошибка инициализации LanguageModelsSelector:', error);
        container.innerHTML = '<div style="padding:20px;background:#f8f9fa;border-radius:5px;text-align:center;"><p style="color:#dc3545;">Ошибка загрузки настроек моделей</p></div>';
    }
}

// ==================== AUDIO SETTINGS ====================

let audioSettingsPanel = null;

function getProfileSpeechRecognitionModeFromModelsTable() {
    try {
        const root = document.getElementById('languageSelectorModelsContainer');
        if (!root) return '';
        const checked = root.querySelector('input[name="speech_recognition_mode"]:checked');
        return checked ? String(checked.value) : '';
    } catch (e) { return ''; }
}

function getAudioSettingsFromDom() {
    const startEl = document.getElementById('playSequenceStart');
    const start = startEl ? String(startEl.value || '') : '';
    const modeRadios = document.querySelectorAll('input[name="audio_exercise_mode"]');
    let exercise_mode = 'record';
    modeRadios.forEach(r => { if (r.checked) exercise_mode = r.value; });
    const speechRecognitionMode = getProfileSpeechRecognitionModeFromModelsTable();
    return {
        start,
        exercise_mode,
        typo: 'o',
        success: 'ot',
        repeats: 3,
        required_passed_star_half: 3,
        speech_recognition_mode: speechRecognitionMode || 'route',
        without_entering_text: false,
        show_text: false,
    };
}

async function initializeAudioSettings() {
    const container = document.getElementById('userAudioSettingsContainer');
    if (!container) {
        console.error(profileT('profile.audio.errors.container_not_found', null, '❌ Контейнер для AudioSettingsPanel не найден'));
        return;
    }
    try {
        try {
            if (window.I18n && typeof window.I18n.ensureLoaded === 'function') {
                await window.I18n.ensureLoaded();
            }
        } catch (e) { }

        let userSettings = {};
        if (UM.userData.settings_json) {
            try {
                const settings = JSON.parse(UM.userData.settings_json);
                const audioSettings = settings.audio || {};
                userSettings = {
                    audio_start: audioSettings.start,
                    audio_exercise_mode: audioSettings.exercise_mode,
                };
            } catch (e) {
                userSettings = {
                    audio_start: UM.userData.audio_start,
                    audio_exercise_mode: (UM.userData && UM.userData.audio_exercise_mode) ? UM.userData.audio_exercise_mode : 'record',
                };
            }
        } else {
            userSettings = {
                audio_start: UM.userData.audio_start,
                audio_exercise_mode: (UM.userData && UM.userData.audio_exercise_mode) ? UM.userData.audio_exercise_mode : 'record',
            };
        }

        audioSettingsPanel = null;

        try {
            const startEl = document.getElementById('playSequenceStart');
            if (startEl) startEl.value = userSettings.audio_start || '';
        } catch (e) { }

        try {
            const mode = String(userSettings.audio_exercise_mode || 'record');
            const setChecked = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.checked = (mode === v);
            };
            setChecked('audioExerciseModeRecord', 'record');
            setChecked('audioExerciseModeNoRecord', 'no-record');
            setChecked('audioExerciseModeOnlyNoHint', 'audio-only-no-hint');
            setChecked('audioExerciseModeOnlyHint', 'audio-only-hint');
        } catch (e) { }

        try {
            const bindInput = (id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', () => checkForChanges());
                el.addEventListener('change', () => checkForChanges());
            };
            bindInput('playSequenceStart');
            ['audioExerciseModeRecord', 'audioExerciseModeNoRecord', 'audioExerciseModeOnlyNoHint', 'audioExerciseModeOnlyHint'].forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('change', () => checkForChanges());
            });
        } catch (e) { }

        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ root: container });
            }
        } catch (e) { }

        setTimeout(() => {
            try { bindProfileTestRecording(); } catch (e) { }
        }, 0);

    } catch (error) {
        console.error(profileT('profile.audio.errors.init_failed', null, '❌ Ошибка инициализации AudioSettingsPanel:'), error);
        container.innerHTML = '<div style="padding:20px;background:#f8f9fa;border-radius:5px;text-align:center;"><p style="color:#dc3545;">' + profileT('profile.audio.errors.load_failed', null, 'Ошибка загрузки настроек аудио') + '</p></div>';
    }
}

// ==================== FORM LISTENERS ====================

function setupFormListeners() {
    const inputs = ['username', 'password'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (id === 'password') passwordTouched = true;
            checkForChanges();
        });
    });
}

// ==================== TOPBAR CONTROLS ====================

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
                focusConfirm: true,
                maxFileSizeBytes: 5 * 1024 * 1024,
                onConfirm: async (blob) => {
                    pendingAvatarBlob = blob;
                    setUnsavedState(true);
                    try { checkForChanges(); } catch (e) { }
                    try { const input = document.getElementById('avatarUpload'); if (input) input.value = ''; } catch (e) { }
                }
            });
        } else {
            try { if (avatarButton) avatarButton.disabled = true; if (avatarInput) avatarInput.disabled = true; } catch (e) { }
        }
    } catch (e) {
        try { if (avatarButton) avatarButton.disabled = true; if (avatarInput) avatarInput.disabled = true; } catch (e2) { }
    }

    try {
        const saveButton = document.getElementById('saveButton');
        if (saveButton && saveButton.dataset && !saveButton.dataset.boundClick) {
            saveButton.dataset.boundClick = '1';
            saveButton.addEventListener('click', async () => { await handleSave(); });
        }
    } catch (e) { }
}

// ==================== CHECK FOR CHANGES ====================

function checkForChanges() {
    const currentValues = getCurrentFormValues();

    const avatarChanged = (() => {
        try {
            const a = normalizeAvatarForCompare(UM && UM.userData ? UM.userData.avatar : null);
            const b = normalizeAvatarForCompare(originalData ? originalData.avatar : null);
            return a.large !== b.large || a.small !== b.small || !!pendingAvatarBlob;
        } catch (e) { return !!pendingAvatarBlob; }
    })();

    const diffs = {
        username: currentValues.username !== originalData.username,
        password: passwordTouched && currentValues.password !== '',
        native_language: currentValues.native_language !== originalData.native_language,
        learning_languages: JSON.stringify(currentValues.learning_languages) !== JSON.stringify(originalData.learning_languages),
        current_learning: currentValues.current_learning !== originalData.current_learning,
        avatar: avatarChanged,
        audio_start: currentValues.audio_start !== (originalData.audio_start || ''),
        audio_exercise_mode: (currentValues.audio_exercise_mode || 'record') !== (originalData.audio_exercise_mode || 'record'),
        audio_typo: currentValues.audio_typo !== (originalData.audio_typo || ''),
        audio_success: currentValues.audio_success !== (originalData.audio_success || ''),
        audio_repeats: currentValues.audio_repeats !== (originalData.audio_repeats || 3),
        audio_required_passed_star_half: currentValues.audio_required_passed_star_half !== (originalData.audio_required_passed_star_half || 3),
        speech_recognition_mode: currentValues.speech_recognition_mode !== (originalData.speech_recognition_mode || 'route'),
        without_entering_text: Boolean(currentValues.without_entering_text) !== Boolean(originalData.without_entering_text),
        show_text: Boolean(currentValues.show_text) !== Boolean(originalData.show_text),
        assignment_history_retention_days: currentValues.assignment_history_retention_days !== (originalData.assignment_history_retention_days ?? 7),
        daily_activity_goal: currentValues.daily_activity_goal !== (originalData.daily_activity_goal ?? 100),
    };

    const hasChanges = Object.values(diffs).some(Boolean);
    setUnsavedState(hasChanges);
}

function setUnsavedState(state) {
    hasUnsavedChanges = state;
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        if (isSavingProfile) saveButton.disabled = true;
        else saveButton.disabled = false;
    }
    const unsavedStar = document.getElementById('unsavedStar');
    if (unsavedStar) unsavedStar.style.display = state ? 'inline-flex' : 'none';
    if (state) window.addEventListener('beforeunload', beforeUnloadHandler);
    else window.removeEventListener('beforeunload', beforeUnloadHandler);
}

function beforeUnloadHandler(event) {
    event.preventDefault();
    event.returnValue = '';
}

// ==================== GET CURRENT FORM VALUES ====================

function getCurrentFormValues() {
    const languageValues = languageSelector ? languageSelector.getValues() : {
        nativeLanguage: originalData.native_language,
        learningLanguages: originalData.learning_languages,
        currentLearning: originalData.current_learning
    };
    const settings = getAudioSettingsFromDom();
    const audioSettings = {
        audio_start: settings.start || '',
        audio_exercise_mode: settings.exercise_mode || 'record',
        audio_typo: settings.typo || '',
        audio_success: settings.success || '',
        audio_repeats: settings.repeats || 3,
        audio_required_passed_star_half: settings.required_passed_star_half || 3,
        speech_recognition_mode: settings.speech_recognition_mode || 'route',
        without_entering_text: Boolean(settings.without_entering_text),
        show_text: Boolean(settings.show_text),
    };
    return {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        native_language: languageValues.nativeLanguage,
        learning_languages: languageValues.learningLanguages,
        current_learning: languageValues.currentLearning,
        audio_start: audioSettings.audio_start,
        audio_exercise_mode: audioSettings.audio_exercise_mode,
        audio_typo: audioSettings.audio_typo,
        audio_success: audioSettings.audio_success,
        audio_repeats: audioSettings.audio_repeats,
        audio_required_passed_star_half: audioSettings.audio_required_passed_star_half,
        speech_recognition_mode: audioSettings.speech_recognition_mode,
        without_entering_text: audioSettings.without_entering_text,
        show_text: audioSettings.show_text,
        assignment_history_retention_days: (() => {
            try {
                const el = document.getElementById('assignmentHistoryRetentionDays');
                const n = Number(el ? el.value : 7);
                return (Number.isFinite(n) && (n === 0 || n === 7 || n === 30)) ? n : 7;
            } catch (e) { return 7; }
        })(),
        daily_activity_goal: (() => {
            try {
                const el = document.getElementById('dailyActivityGoal');
                const n = Number(el ? el.value : 100);
                if (!Number.isFinite(n) || n < 0) return 100;
                return Math.floor(n);
            } catch (e) { return 100; }
        })(),
    };
}

// ==================== LOAD USER DATA ====================

function loadUserData() {
    const userData = UM.userData;

    let assignmentHistoryRetentionDays = 7;
    try {
        if (userData) {
            const n = Number(userData.assignment_history_retention_days);
            if (Number.isFinite(n) && (n === 0 || n === 7 || n === 30)) assignmentHistoryRetentionDays = n;
        }
    } catch (e) { }

    const initialAudioExerciseMode = (() => {
        try {
            if (userData && userData.settings_json) {
                const parsed = JSON.parse(userData.settings_json);
                const audio = parsed && parsed.audio ? parsed.audio : null;
                const v = audio && audio.exercise_mode ? String(audio.exercise_mode || '') : '';
                if (v) return v;
            }
        } catch (e) { }
        try {
            const v2 = userData && userData.audio_exercise_mode ? String(userData.audio_exercise_mode || '') : '';
            return v2 || 'record';
        } catch (e2) { return 'record'; }
    })();

    originalData = {
        username: userData.username,
        email: userData.email,
        native_language: userData.native_language || 'ru',
        learning_languages: userData.learning_languages || ['en'],
        current_learning: userData.current_learning || userData.learning_languages?.[0] || 'en',
        avatar: userData.avatar || {},
        audio_start: userData.audio_start || '',
        audio_typo: userData.audio_typo || '',
        audio_success: userData.audio_success || '',
        audio_exercise_mode: initialAudioExerciseMode,
        audio_repeats: userData.audio_repeats || 3,
        audio_required_passed_star_half: userData.audio_required_passed_star_half || 3,
        speech_recognition_mode: userData.speech_recognition_mode || 'route',
        without_entering_text: Boolean(userData.without_entering_text),
        show_text: Boolean(userData.show_text),
        assignment_history_retention_days: assignmentHistoryRetentionDays,
        daily_activity_goal: (() => {
            try {
                const n = Number(userData.daily_activity_goal);
                return (Number.isFinite(n) && n >= 0) ? n : 100;
            } catch (e) { return 100; }
        })(),
    };

    try {
        originalData.learning_flags = extractLearningFlagsFromUser(userData);
        const langsFromFlags = Object.entries(originalData.learning_flags)
            .filter(([, v]) => !!v)
            .map(([code]) => code);
        if (langsFromFlags.length) {
            originalData.learning_languages = langsFromFlags;
            if (!originalData.learning_languages.includes(originalData.current_learning)) {
                originalData.current_learning = originalData.learning_languages[0];
            }
        }
    } catch (e) { }

    document.getElementById('username').value = originalData.username;
    document.getElementById('email').value = originalData.email;
    try {
        const pwd = document.getElementById('password');
        if (pwd) pwd.value = '';
        passwordTouched = false;
    } catch (e) { }
    updateAvatarDisplay(originalData.avatar);

    try {
        const sel = document.getElementById('assignmentHistoryRetentionDays');
        if (sel) {
            sel.value = String(originalData.assignment_history_retention_days ?? 7);
            sel.onchange = () => { checkForChanges(); };
        }
    } catch (e) { }

    try {
        const goalEl = document.getElementById('dailyActivityGoal');
        if (goalEl) {
            goalEl.value = String(originalData.daily_activity_goal ?? 100);
            goalEl.oninput = () => { checkForChanges(); };
        }
    } catch (e) { }

    renderTelegramSection();
    setUnsavedState(false);
}

// ==================== SAVE PROFILE ====================

async function saveProfile(options = {}) {
    if (isSavingProfile) return;
    const { afterSave } = options;
    const formValues = getCurrentFormValues();

    const hasAudioChanges = (
        (formValues.audio_start || '') !== (originalData.audio_start || '') ||
        (formValues.audio_exercise_mode || 'record') !== (originalData.audio_exercise_mode || 'record') ||
        (formValues.audio_typo || '') !== (originalData.audio_typo || '') ||
        (formValues.audio_success || '') !== (originalData.audio_success || '') ||
        (formValues.audio_repeats || 3) !== (originalData.audio_repeats || 3) ||
        (formValues.audio_required_passed_star_half || 3) !== (originalData.audio_required_passed_star_half || 3) ||
        (formValues.speech_recognition_mode || 'route') !== (originalData)
        );
        
    if (!hasUnsavedChanges && !hasAudioChanges) {
        if (typeof afterSave === 'function') afterSave();
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
        } catch (e) { throw e; }

        const updateData = {
            username: formValues.username,
            native_language: formValues.native_language,
            learning_languages: formValues.learning_languages,
            current_learning: formValues.current_learning
        };

        try {
            const flags = buildLearningFlagsFromLanguages(formValues.learning_languages);
            Object.assign(updateData, flags);
        } catch (e) { }

        if (formValues.password) updateData.password = formValues.password;

        updateData.assignment_history_retention_days = formValues.assignment_history_retention_days;
        updateData.daily_activity_goal = formValues.daily_activity_goal;

        {
            let merged = {};
            try {
                const raw = (UM && UM.userData && UM.userData.settings_json) ? UM.userData.settings_json : '';
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') merged = parsed;
                }
            } catch (e) { }

            const settings = getAudioSettingsFromDom();
            try {
                if (!merged.audio || typeof merged.audio !== 'object') merged.audio = {};
                merged.audio.start = (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto';
                merged.audio.exercise_mode = (settings.exercise_mode !== undefined && settings.exercise_mode !== null) ? settings.exercise_mode : 'record';
                merged.audio.speech_recognition_mode = settings.speech_recognition_mode || 'route';
            } catch (e) { }

            try { updateData.settings_json = JSON.stringify(merged); } catch (e) { }

            updateData.audio_start = (settings.start !== undefined && settings.start !== null) ? settings.start : 'oto';
            updateData.audio_typo = 'o';
            updateData.audio_success = 'ot';
            updateData.speech_recognition_mode = settings.speech_recognition_mode || 'route';
        }

        showInfo(profileT('profile.common.saving_changes', null, 'Сохраняем изменения…'));

        const updatedUser = await UM.updateProfile(updateData);

        try {
            if (updatedUser && updatedUser.avatar) originalData.avatar = updatedUser.avatar;
            else if (UM && UM.userData && UM.userData.avatar) originalData.avatar = UM.userData.avatar;
        } catch (e) { }

        let audioSettings = { audio_start: '', audio_exercise_mode: 'record', speech_recognition_mode: 'route' };

        if (updatedUser.settings_json) {
            try {
                const settings = JSON.parse(updatedUser.settings_json);
                const audio = settings.audio || {};
                audioSettings = {
                    audio_start: audio.start || '',
                    audio_exercise_mode: audio.exercise_mode || 'record',
                    speech_recognition_mode: audio.speech_recognition_mode || 'route'
                };
            } catch (e) { }
        }

        if (!audioSettings.audio_start && updatedUser.audio_start !== undefined) audioSettings.audio_start = updatedUser.audio_start;
        if ((audioSettings.speech_recognition_mode === 'route' || audioSettings.speech_recognition_mode === '') && updatedUser.speech_recognition_mode !== undefined) audioSettings.speech_recognition_mode = updatedUser.speech_recognition_mode;
        if (!audioSettings.audio_start) audioSettings.audio_start = updateData.audio_start || '';
        if ((audioSettings.speech_recognition_mode === 'route' || audioSettings.speech_recognition_mode === '') && updateData.speech_recognition_mode !== undefined) audioSettings.speech_recognition_mode = updateData.speech_recognition_mode;

        let assignmentHistoryRetentionDaysAfterSave = 7;
        try {
            const n = Number(updatedUser && updatedUser.assignment_history_retention_days);
            if (Number.isFinite(n) && (n === 0 || n === 7 || n === 30)) assignmentHistoryRetentionDaysAfterSave = n;
        } catch (e) { }

        originalData = {
            ...originalData,
            username: updatedUser.username,
            native_language: updatedUser.native_language,
            learning_languages: updatedUser.learning_languages,
            current_learning: updatedUser.current_learning,
            audio_start: audioSettings.audio_start,
            audio_exercise_mode: audioSettings.audio_exercise_mode,
            audio_typo: audioSettings.audio_typo,
            audio_success: audioSettings.audio_success,
            audio_repeats: audioSettings.audio_repeats,
            audio_required_passed_star_half: audioSettings.audio_required_passed_star_half,
            speech_recognition_mode: audioSettings.speech_recognition_mode,
            assignment_history_retention_days: assignmentHistoryRetentionDaysAfterSave,
            daily_activity_goal: (() => {
                try {
                    const n = Number(updatedUser && updatedUser.daily_activity_goal);
                    return (Number.isFinite(n) && n >= 0) ? n : (originalData.daily_activity_goal ?? 100);
                } catch (e) { return (originalData.daily_activity_goal ?? 100); }
            })(),
        };

        if (UM && UM.userData) {
            UM.userData.username = updatedUser.username;
            UM.userData.native_language = updatedUser.native_language;
            UM.userData.learning_languages = updatedUser.learning_languages;
            UM.userData.current_learning = updatedUser.current_learning;
            try { UM.userData.audio_exercise_mode = audioSettings.audio_exercise_mode; } catch (e) { }

            try {
                window.USER_LANGUAGE_DATA = {
                    nativeLanguage: UM.userData.native_language || 'ru',
                    learningLanguages: UM.userData.learning_languages || ['en'],
                    currentLearning: UM.userData.current_learning || (UM.userData.learning_languages && UM.userData.learning_languages[0]) || 'en',
                    isAuthenticated: true
                };
            } catch (e) { }

            try {
                if (avatarUploadedThisSave) originalData.avatar = UM.userData.avatar || originalData.avatar || {};
            } catch (e) { }

            if (originalData.avatar) UM.userData.avatar = originalData.avatar;
            else if (updatedUser.avatar) UM.userData.avatar = updatedUser.avatar;

            if (updatedUser.settings_json) UM.userData.settings_json = updatedUser.settings_json;
            if (updatedUser.assignment_history_retention_days !== undefined && updatedUser.assignment_history_retention_days !== null) UM.userData.assignment_history_retention_days = updatedUser.assignment_history_retention_days;
            if (updatedUser.daily_activity_goal !== undefined && updatedUser.daily_activity_goal !== null) UM.userData.daily_activity_goal = updatedUser.daily_activity_goal;

            try {
                const goalEl = document.getElementById('dailyActivityGoal');
                if (goalEl) goalEl.value = String(originalData.daily_activity_goal ?? 100);
            } catch (e) { }

            try {
                const sel = document.getElementById('assignmentHistoryRetentionDays');
                if (sel) sel.value = String(originalData.assignment_history_retention_days ?? 7);
            } catch (e) { }

            UM.userData.audio_start = originalData.audio_start;
            UM.userData.audio_typo = originalData.audio_typo;
            UM.userData.audio_success = originalData.audio_success;
            UM.userData.audio_repeats = originalData.audio_repeats;
            UM.userData.audio_required_passed_star_half = originalData.audio_required_passed_star_half;
            UM.userData.speech_recognition_mode = originalData.speech_recognition_mode;

            setTimeout(() => {
                if (UM && UM.setupAuthenticatedUser) UM.setupAuthenticatedUser(UM.userData);
            }, 100);
        }

        if (audioSettingsPanel) {
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
                } catch (e) { }
            }

            audioSettingsPanel.setSettings(settingsToApply);
        }

        if (formValues.password) document.getElementById('password').value = '';

        passwordTouched = false;
        checkForChanges();
        setUnsavedState(false);
        pendingAvatarBlob = null;
        showSuccess(profileT('profile.common.profile_saved', null, 'Профиль успешно сохранен!'));

        if (typeof afterSave === 'function') afterSave();

    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showError(profileT('profile.errors.save_failed', { message: String(error && error.message ? error.message : '') }, 'Ошибка сохранения: ' + (error && error.message ? error.message : '')));
    } finally {
        isSavingProfile = false;
        checkForChanges();
    }
}

// ==================== HANDLE SAVE ====================

async function handleSave() {
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.disabled = true;
        const originalHTML = saveButton.innerHTML;
        saveButton.innerHTML = '<i data-lucide="loader-2"></i>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        try {
            await saveProfile();
        } catch (error) {
            console.error('[Save] error', error);
        } finally {
            saveButton.innerHTML = originalHTML;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            saveButton.disabled = false;
        }
    }
}

// ==================== BIND PROFILE TEST RECORDING ====================

function bindProfileTestRecording() {
    const btn = document.getElementById('profileTestRecordingBtn');
    const statusEl = document.getElementById('profileTestRecordingStatus');
    const resultEl = document.getElementById('profileTestRecordingResult');
    if (!btn || !statusEl || !resultEl) return;

    const setStatus = (text, color = '#666') => {
        statusEl.textContent = text || '';
        statusEl.style.color = color;
    };

    const setResult = (text) => { resultEl.textContent = text || ''; };

    const getCurrentMode = () => {
        try {
            const m = getProfileSpeechRecognitionModeFromModelsTable();
            if (m) return m;
        } catch (e) { }
        return UM && UM.userData && UM.userData.speech_recognition_mode ? UM.userData.speech_recognition_mode : 'route';
    };

    const stopAndCleanup = async () => {
        try {
            if (profileTestTimerId) { clearInterval(profileTestTimerId); profileTestTimerId = null; }
            if (profileTestAutoStopId) { clearTimeout(profileTestAutoStopId); profileTestAutoStopId = null; }
        } catch (e) { }
        try {
            if (profileTestRecorder && profileTestRecorder.state !== 'inactive') profileTestRecorder.stop();
        } catch (e) { }
        try {
            if (profileTestMediaStream) profileTestMediaStream.getTracks().forEach(t => { try { t.stop(); } catch (e) { } });
        } catch (e) { }
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
                if (profileTestRecorder && profileTestRecorder.state !== 'inactive') profileTestRecorder.stop();
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

        try { profileTestMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (e) { setStatus('Нет доступа к микрофону', '#b00020'); return; }

        try {
            profileTestChunks = [];
            profileTestRecorder = new MediaRecorder(profileTestMediaStream);
        } catch (e) {
            await stopAndCleanup();
            setStatus('MediaRecorder не поддерживается', '#b00020');
            return;
        }

        profileTestRecorder.ondataavailable = (ev) => {
            try { if (ev && ev.data && ev.data.size > 0) profileTestChunks.push(ev.data); } catch (e) { }
        };

        profileTestRecorder.onstop = async () => {
            try {
                profileTestIsRecording = false;
                btn.textContent = 'Записать';

                const blob = new Blob(profileTestChunks, { type: profileTestRecorder && profileTestRecorder.mimeType ? profileTestRecorder.mimeType : 'audio/webm' });
                await stopAndCleanup();

                if (!blob || blob.size === 0) { setStatus('Пустая запись', '#b00020'); return; }
                if (!window.WhisperModelManager) { setStatus('WhisperModelManager не загружен', '#b00020'); return; }

                if (!window.__dictafanWhisperModelManager) window.__dictafanWhisperModelManager = new window.WhisperModelManager();
                const wm = window.__dictafanWhisperModelManager;
                const lang = (originalData && originalData.current_learning) ? String(originalData.current_learning) : 'en';

                let size = 'base';
                try {
                    const mk = localStorage.getItem('selected_asr_model_v2_' + lang);
                    if (mk && mk.includes('whisper-tiny')) size = 'tiny';
                    if (mk && mk.includes('whisper-small')) size = 'small';
                    if (mk && mk.includes('whisper-base')) size = 'base';
                } catch (e) { }

                try {
                    const preferred = [size, 'small', 'base', 'tiny'];
                    let picked = null;
                    for (const s of preferred) {
                        const k = 'whisper_model_' + s;
                        const v = localStorage.getItem(k);
                        if (v === 'downloaded' || v === 'ready') { picked = s; break; }
                    }
                    if (picked) size = picked;
                } catch (e) { }

                try {
                    const key = (typeof wm._getModelKey === 'function') ? wm._getModelKey(lang, size) : 'whisper_model_' + size;
                    const inMemory = window.WhisperModels && typeof window.WhisperModels.get === 'function' ? window.WhisperModels.get(key) : null;
                    if (!inMemory || !inMemory.recognizer) {
                        setStatus('Загружаю модель Whisper (' + size + ')…');
                        await wm.loadLanguageModel(lang, size, (p) => {
                            try {
                                if (!p) return;
                                const percent = Math.round((Number(p.progress) || 0) * 100);
                                if (isFinite(percent) && percent > 0 && percent < 100) setStatus('Загружаю модель Whisper (' + size + ')… ' + percent + '%');
                            } catch (e) { }
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
                } else if (typeof res === 'string') text = res.trim();

                setResult(text);
                setStatus(text ? 'Готово' : 'Пустой результат', text ? '#1b7f3a' : '#b00020');
            } catch (err) {
                try { await stopAndCleanup(); } catch (e) { }
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
                    setStatus('Идёт запись… ' + s + 'с');
                } catch (e) { }
            }, 500);

            profileTestAutoStopId = setTimeout(() => {
                try {
                    if (profileTestIsRecording && profileTestRecorder && profileTestRecorder.state !== 'inactive') {
                        setStatus('Авто-стоп…');
                        profileTestRecorder.stop();
                    }
                } catch (e) { }
            }, maxSeconds * 1000);

            profileTestRecorder.start(1000);
        } catch (e) {
            await stopAndCleanup();
            setStatus('Не удалось начать запись', '#b00020');
        }
    };
}

// ==================== INIT ====================

async function initUserProfilePageOrModal() {
    if (!window.UM) {
        console.error('[profile] window.UM не найден');
        showError(profileT('profile.errors.load_failed', { message: 'UserManager не найден' }, 'Ошибка загрузки профиля: UserManager не найден'));
        return;
    }
    UM = window.UM;

    try {
        checkAppCacheRevision().catch(() => { });
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                try {
                    const key = 'profile_controllerchange_reload';
                    if (sessionStorage.getItem(key) === '1') return;
                    sessionStorage.setItem(key, '1');
                } catch (e) { }
                location.reload();
            });
        }
    } catch (e) { }

    try {
        if (!UM.isInitialized) await UM.init();
        if (!UM.isAuthenticated()) {
            showError(profileT('profile.auth.please_login', null, 'Пожалуйста, войдите в систему'));
            try {
                const c = document.querySelector('.profile-container');
                if (c) c.style.display = 'none';
            } catch (e) { }
            return;
        }

        try {
            if (window.I18n && typeof window.I18n.ensureLoaded === 'function') await window.I18n.ensureLoaded();
        } catch (e) { }

        initializeUiLangSelector();
        loadUserData();
        initializeLanguageSelector();
        initializeLanguageModelsSelector();
        await initializeAudioSettings();
        initializeGroupsSection();
        initializeProfileSectionToggles();
        setupFormListeners();
        initializeTopbarControls();
        setupPasswordToggles();

        try { installProfileSaveHotkey(); } catch (e) { }

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError(profileT('profile.errors.load_failed', { message: String(error && error.message ? error.message : '') }, 'Ошибка загрузки профиля: ' + (error && error.message ? error.message : '')));
    }
}

window.UserProfile = window.UserProfile || {};
window.UserProfile.init = async function () {
    return initUserProfilePageOrModal();
};
