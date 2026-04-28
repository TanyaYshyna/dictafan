(function () {
    const SUPPORTED = ['en', 'uk', 'ru', 'ar'];
    const DEFAULT_LANG = 'en';

    function getHtmlLang() {
        try {
            const l = (document.documentElement && document.documentElement.lang) ? String(document.documentElement.lang) : '';
            return (l || '').trim().toLowerCase();
        } catch (e) {
            return '';
        }
    }

    function getLang() {
        try {
            const v = (localStorage.getItem('ui_lang') || '').trim().toLowerCase();
            if (SUPPORTED.includes(v)) return v;
        } catch (e) {
        }
        const html = getHtmlLang();
        if (SUPPORTED.includes(html)) return html;
        return DEFAULT_LANG;
    }

    const state = {
        lang: getLang(),
        dict: null,
        dictEn: null,
        loading: null,
    };

    function getCacheBustingSuffix() {
        try {
            const v = (window && (window.__APP_BUILD || window.__APP_CACHE_REVISION)) ? String(window.__APP_BUILD || window.__APP_CACHE_REVISION) : '';
            if (!v) return '';
            return `?v=${encodeURIComponent(v)}`;
        } catch (e) {
            return '';
        }
    }

    async function loadDict(lang) {
        const l = (lang || '').trim().toLowerCase() || DEFAULT_LANG;
        const suffix = getCacheBustingSuffix();
        const res = await fetch(`/static/i18n/${encodeURIComponent(l)}.json${suffix}`);
        if (!res.ok) throw new Error('i18n_load_failed');
        const data = await res.json();
        return (data && typeof data === 'object') ? data : {};
    }

    function lookup(obj, key) {
        try {
            let cur = obj;
            const parts = String(key || '').split('.');
            for (const p of parts) {
                if (!cur || typeof cur !== 'object' || !(p in cur)) return undefined;
                cur = cur[p];
            }
            return cur;
        } catch (e) {
            return undefined;
        }
    }

    function format(text, params) {
        if (!params) return text;
        return String(text).replace(/\{(\w+)\}/g, (m, name) => {
            if (Object.prototype.hasOwnProperty.call(params, name)) {
                return String(params[name]);
            }
            return m;
        });
    }

    async function ensureLoaded() {
        if (state.dict) return;
        if (state.loading) return await state.loading;

        state.loading = (async () => {
            if (state.lang !== DEFAULT_LANG) {
                try {
                    state.dictEn = await loadDict(DEFAULT_LANG);
                } catch (e) {
                    state.dictEn = {};
                }
            }
            try {
                state.dict = await loadDict(state.lang);
            } catch (e) {
                state.dict = state.dictEn || {};
                state.lang = DEFAULT_LANG;
            }
        })();

        try {
            await state.loading;
        } finally {
            state.loading = null;
        }
    }

    async function setLanguage(lang) {
        const l = (lang || '').trim().toLowerCase();
        if (!SUPPORTED.includes(l)) throw new Error('unsupported_lang');
        state.lang = l;
        state.dict = null;
        state.dictEn = null;
        try {
            localStorage.setItem('ui_lang', l);
        } catch (e) {
        }
        await ensureLoaded();
    }

    function t(key, params) {
        const k = String(key || '');
        const v = lookup(state.dict || {}, k);
        if (typeof v === 'string') return format(v, params);
        const v2 = lookup(state.dictEn || {}, k);
        if (typeof v2 === 'string') return format(v2, params);
        return k;
    }

    window.I18n = {
        getLang,
        setLanguage,
        ensureLoaded,
        t,
    };
})();
