/**
 * ReportFilterPanel — единая панель отборов с закладками для отчётов.
 *
 * Закладка «Отбор»: каскад группа → пользователь группы → язык.
 * Закладка «Админ»: поиск пользователя по email/имени (первая строка — ввод + «Найти»,
 * вторая строка — список найденных, из которого выбирается один пользователь).
 * Закладка «Админ» видна только администратору.
 *
 * Панель не трогает время и специфические настройки отчётов — она лишь отдаёт выбранного
 * пользователя (и язык) наружу через getSelectedUserId()/getSelectedLanguageCode()
 * и колбэк onChange({ userId, languageCode, mode }).
 */
class ReportFilterPanel {
    constructor(options = {}) {
        this.container = options.container || null;
        this.withLanguage = options.withLanguage !== false;
        this.onChange = options.onChange || null;
        this.tokenGetter = options.tokenGetter || ReportFilterPanel.getToken;

        // Состояние закладки «Отбор»
        this._groups = [];
        this._selfId = null;
        this._selectedGroupId = null;
        this._selectedUserId = null;
        this._selectedLanguageCode = '';

        // Состояние закладки «Админ»
        this._activeTab = 'select'; // 'select' | 'admin'
        this._adminSearchResults = [];
        this._adminSelectedUser = null; // { id, email, username }
        this._adminLanguageCode = '';

        this._isAdmin = ReportFilterPanel.isAdmin();
        this._initialized = false;
    }

    /* ---------- статика ---------- */

    static getToken() {
        try {
            if (typeof window !== 'undefined' && window.UM && window.UM.token) {
                return window.UM.token;
            }
        } catch (e) {}
        try {
            const t = localStorage.getItem('token');
            if (t) return t;
        } catch (e) {}
        try {
            const t = localStorage.getItem('jwt_token');
            if (t) return t;
        } catch (e) {}
        return null;
    }

    static isAdmin() {
        try {
            const ud = (typeof window !== 'undefined' && window.UM && window.UM.userData) || {};
            return String(ud.role_code || '').toLowerCase() === 'admin';
        } catch (e) {
            return false;
        }
    }

    /* ---------- helpers ---------- */

    escapeHtml(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#039;');
    }

    _findGroupById(id) {
        return this._groups.find(g => String(g.id ?? 'self') === String(id)) || null;
    }

    async ensureGroupsLoaded() {
        if (this._groups.length > 0) return;
        const token = this.tokenGetter();
        if (!token) return;
        try {
            const res = await fetch('/api/statistics/dictation-report/groups', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const js = await res.json().catch(() => null);
            if (js && js.success && Array.isArray(js.groups)) {
                this._groups = js.groups;
                this._selfId = js.self_id || null;
                if (this._groups.length > 0 && this._selectedGroupId == null) {
                    this._selectedGroupId = String(this._groups[0].id ?? 'self');
                }
            }
        } catch (e) {
            console.warn('[ReportFilterPanel] failed to load groups', e);
        }
    }

    async _loadLanguagesFor(userId) {
        if (userId == null) return [];
        const token = this.tokenGetter();
        if (!token) return [];
        try {
            const res = await fetch(`/api/statistics/dictation-report/languages?user_id=${encodeURIComponent(userId)}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const js = await res.json().catch(() => null);
            if (js && js.success && Array.isArray(js.languages)) {
                return js.languages;
            }
        } catch (e) {
            console.warn('[ReportFilterPanel] failed to load languages', e);
        }
        return [];
    }

    /* ---------- публичный интерфейс ---------- */

    getSelectedUserId() {
        if (this._activeTab === 'admin' && this._adminSelectedUser) {
            return this._adminSelectedUser.id;
        }
        return this._selectedUserId;
    }

    getSelectedLanguageCode() {
        if (this._activeTab === 'admin' && this._adminSelectedUser) {
            return this._adminLanguageCode || '';
        }
        return this._selectedLanguageCode || '';
    }

    getMode() {
        return this._activeTab;
    }

    getAdminUser() {
        return this._adminSelectedUser;
    }

    async init(initial = {}) {
        if (!this._initialized) {
            this._selectedUserId = (initial.userId != null) ? initial.userId : null;
            this._selectedGroupId = (initial.groupId != null) ? initial.groupId : null;
            this._selectedLanguageCode = initial.languageCode || '';
            this._initialized = true;
        }
        await this.ensureGroupsLoaded();
        this.render();
    }

    _fireChange() {
        if (this.onChange) {
            this.onChange({
                userId: this.getSelectedUserId(),
                languageCode: this.getSelectedLanguageCode(),
                mode: this._activeTab,
            });
        }
    }

    /* ---------- рендер ---------- */

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const root = document.createElement('div');
        root.className = 'report-filter-panel';

        // Закладки
        const tabs = document.createElement('div');
        tabs.className = 'report-filter-tabs';

        const selectTab = document.createElement('button');
        selectTab.type = 'button';
        selectTab.className = 'report-filter-tab';
        selectTab.textContent = 'Отбор';
        selectTab.addEventListener('click', () => this._switchTab('select'));
        tabs.appendChild(selectTab);

        if (this._isAdmin) {
            const adminTab = document.createElement('button');
            adminTab.type = 'button';
            adminTab.className = 'report-filter-tab';
            adminTab.textContent = 'Админ';
            adminTab.addEventListener('click', () => this._switchTab('admin'));
            tabs.appendChild(adminTab);
        }

        root.appendChild(tabs);

        // Контент закладки «Отбор»
        const selectContent = document.createElement('div');
        selectContent.className = 'report-filter-tab-content';
        this._renderSelectTab(selectContent);
        root.appendChild(selectContent);

        // Контент закладки «Админ» (только для админов)
        if (this._isAdmin) {
            const adminContent = document.createElement('div');
            adminContent.className = 'report-filter-tab-content';
            adminContent.style.display = 'none';
            this._renderAdminTab(adminContent);
            root.appendChild(adminContent);
        }

        this.container.appendChild(root);
        this._applyActiveTab();
    }

    _switchTab(tab) {
        if (this._activeTab === tab) return;
        this._activeTab = tab;
        this._applyActiveTab();
        this._fireChange();
    }

    _applyActiveTab() {
        const root = this.container.querySelector('.report-filter-panel');
        if (!root) return;
        const tabBtns = root.querySelectorAll('.report-filter-tab');
        const contents = root.querySelectorAll('.report-filter-tab-content');
        tabBtns.forEach((btn, i) => {
            const t = (i === 0) ? 'select' : 'admin';
            btn.classList.toggle('is-active', t === this._activeTab);
        });
        contents.forEach((c, i) => {
            const t = (i === 0) ? 'select' : 'admin';
            c.style.display = (t === this._activeTab) ? '' : 'none';
        });
    }

    _renderSelectTab(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'dictation-report-selects';

        const groupSel = document.createElement('select');
        groupSel.className = 'dictation-report-select';
        groupSel.title = 'Группа';

        const userSel = document.createElement('select');
        userSel.className = 'dictation-report-select';
        userSel.title = 'Пользователь';

        const langSel = document.createElement('select');
        langSel.className = 'dictation-report-select';
        langSel.title = 'Язык';

        const fillGroupSelect = () => {
            groupSel.innerHTML = '';
            for (const g of this._groups) {
                const opt = document.createElement('option');
                opt.value = String(g.id ?? 'self');
                opt.textContent = g.title || 'Без названия';
                groupSel.appendChild(opt);
            }
            if (this._selectedGroupId == null && this._groups.length > 0) {
                this._selectedGroupId = String(this._groups[0].id ?? 'self');
            }
            groupSel.value = String(this._selectedGroupId ?? '');
        };

        const fillUserSelect = () => {
            const group = this._findGroupById(this._selectedGroupId);
            const users = (group && Array.isArray(group.users)) ? group.users : [];
            userSel.innerHTML = '';
            for (const u of users) {
                const opt = document.createElement('option');
                opt.value = String(u.id);
                opt.textContent = u.username || `User #${u.id}`;
                userSel.appendChild(opt);
            }
            if (users.length > 0) {
                if (this._selectedUserId == null || !users.some(u => String(u.id) === String(this._selectedUserId))) {
                    this._selectedUserId = users[0].id;
                }
                userSel.value = String(this._selectedUserId);
            } else {
                this._selectedUserId = null;
                userSel.value = '';
            }
        };

        const fillLanguageSelect = async () => {
            langSel.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = 'Все языки';
            langSel.appendChild(allOpt);

            const uid = this._selectedUserId;
            if (uid == null) {
                langSel.value = '';
                this._selectedLanguageCode = '';
                return;
            }
            const langs = await this._loadLanguagesFor(uid);
            for (const l of langs) {
                const opt = document.createElement('option');
                opt.value = l.code || '';
                opt.textContent = l.label || (l.code || '').toUpperCase();
                langSel.appendChild(opt);
            }
            const codes = Array.from(langSel.options).map(o => o.value);
            if (!codes.includes(String(this._selectedLanguageCode || ''))) {
                this._selectedLanguageCode = '';
            }
            langSel.value = String(this._selectedLanguageCode || '');
        };

        groupSel.addEventListener('change', async () => {
            this._selectedGroupId = groupSel.value;
            this._selectedUserId = null;
            this._selectedLanguageCode = '';
            fillUserSelect();
            if (this.withLanguage) {
                await fillLanguageSelect();
            }
            this._fireChange();
        });

        userSel.addEventListener('change', async () => {
            this._selectedUserId = userSel.value ? Number(userSel.value) : null;
            this._selectedLanguageCode = '';
            if (this.withLanguage) {
                await fillLanguageSelect();
            }
            this._fireChange();
        });

        if (this.withLanguage) {
            langSel.addEventListener('change', () => {
                this._selectedLanguageCode = langSel.value || '';
                this._fireChange();
            });
        }

        fillGroupSelect();
        fillUserSelect();

        wrapper.appendChild(groupSel);
        wrapper.appendChild(userSel);
        if (this.withLanguage) {
            wrapper.appendChild(langSel);
            fillLanguageSelect();
        }

        container.appendChild(wrapper);
    }

    _renderAdminTab(container) {
        // Первая строка: ввод email + кнопка «Найти»
        const searchRow = document.createElement('div');
        searchRow.className = 'admin-license-search-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.placeholder = 'Email или имя';

        const searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.className = 'button-color-yellow';
        searchBtn.textContent = 'Найти';

        searchRow.appendChild(input);
        searchRow.appendChild(searchBtn);
        container.appendChild(searchRow);

        // Выбранный пользователь
        const selectedEl = document.createElement('div');
        selectedEl.className = 'report-filter-admin-selected';
        container.appendChild(selectedEl);

        // Вторая строка: результат поиска (список найденных пользователей)
        const resultEl = document.createElement('div');
        resultEl.className = 'admin-license-search-result report-filter-admin-result';
        container.appendChild(resultEl);

        // Язык для выбранного пользователя (если отчёт использует язык)
        let langWrap = null;
        if (this.withLanguage) {
            langWrap = document.createElement('div');
            langWrap.className = 'dictation-report-selects report-filter-admin-lang';
            container.appendChild(langWrap);
        }

        const doSearch = async () => {
            const q = input.value.trim();
            if (!q) return;
            const token = this.tokenGetter();
            if (!token) {
                resultEl.innerHTML = '<p class="report-filter-hint">Ошибка авторизации</p>';
                return;
            }
            resultEl.innerHTML = '<p class="report-filter-hint">Поиск…</p>';
            try {
                const res = await fetch(`/api/statistics/admin/time/users?email=${encodeURIComponent(q)}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const js = await res.json().catch(() => null);
                if (js && js.success && Array.isArray(js.users) && js.users.length > 0) {
                    this._adminSearchResults = js.users;
                    this._renderAdminResults(resultEl);
                } else {
                    this._adminSearchResults = [];
                    resultEl.innerHTML = '<p class="report-filter-hint">Пользователь не найден</p>';
                }
            } catch (e) {
                this._adminSearchResults = [];
                resultEl.innerHTML = '<p class="report-filter-hint">Ошибка поиска</p>';
            }
        };

        searchBtn.addEventListener('click', doSearch);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch();
        });

        // Восстановить состояние после перерисовки
        if (this._adminSelectedUser) {
            this._renderAdminSelected(selectedEl);
            if (langWrap) this._renderAdminLang(langWrap);
        }
        if (this._adminSearchResults.length > 0) {
            this._renderAdminResults(resultEl);
        }
    }

    _renderAdminResults(resultEl) {
        resultEl.innerHTML = '';
        this._adminSearchResults.forEach(u => {
            const item = document.createElement('div');
            item.className = 'user-item';
            item.innerHTML = '<div><div class="user-email"></div><div class="user-name"></div></div><i data-lucide="arrow-right"></i>';
            item.querySelector('.user-email').textContent = u.email || '';
            item.querySelector('.user-name').textContent = u.username || '';
            item.addEventListener('click', () => this._selectAdminUser(u));
            resultEl.appendChild(item);
        });
        try {
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: resultEl });
        } catch (e) {}
    }

    _renderAdminSelected(el) {
        const u = this._adminSelectedUser;
        if (!u) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = 'Выбран: <strong></strong>';
        const strong = el.querySelector('strong');
        strong.textContent = u.email + (u.username ? ` (${u.username})` : '');
    }

    _renderAdminLang(el) {
        el.innerHTML = '';
        const langSel = document.createElement('select');
        langSel.className = 'dictation-report-select';
        langSel.title = 'Язык';

        const fill = async () => {
            langSel.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = 'Все языки';
            langSel.appendChild(allOpt);

            const uid = this._adminSelectedUser ? this._adminSelectedUser.id : null;
            if (uid == null) {
                langSel.value = '';
                this._adminLanguageCode = '';
                return;
            }
            const langs = await this._loadLanguagesFor(uid);
            for (const l of langs) {
                const opt = document.createElement('option');
                opt.value = l.code || '';
                opt.textContent = l.label || (l.code || '').toUpperCase();
                langSel.appendChild(opt);
            }
            const codes = Array.from(langSel.options).map(o => o.value);
            if (!codes.includes(String(this._adminLanguageCode || ''))) {
                this._adminLanguageCode = '';
            }
            langSel.value = String(this._adminLanguageCode || '');
        };

        langSel.addEventListener('change', () => {
            this._adminLanguageCode = langSel.value || '';
            this._fireChange();
        });

        el.appendChild(langSel);
        fill();
    }

    _selectAdminUser(u) {
        this._adminSelectedUser = u;
        this._adminLanguageCode = '';
        this.render();
        this._fireChange();
    }
}
