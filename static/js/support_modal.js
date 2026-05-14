class SupportModal {
    static getJarUrl() {
        try {
            const v = (window && window.__MONOBANK_JAR_URL) ? String(window.__MONOBANK_JAR_URL) : '';
            return v.trim();
        } catch (e) {
            return '';
        }
    }

    static t(key, fallback, params) {
        try {
            if (window.I18n && typeof window.I18n.t === 'function') {
                const v = window.I18n.t(key, params);
                if (v && v !== key) return v;
            }
        } catch (e) {
        }
        return (fallback != null) ? String(fallback) : String(key || '');
    }

    static ensureModal() {
        const modal = document.getElementById('support-modal');
        if (!modal) {
            throw new Error('support-modal not found (support_modal.html not included)');
        }

        const titleEl = document.getElementById('supportModalTitle');
        const textEl = document.getElementById('supportModalText');
        const closeBtn = document.getElementById('closeSupportModalBtn');
        const openBtn = document.getElementById('supportOpenJarBtn');
        const openBtnLabel = document.getElementById('supportOpenJarBtnLabel');
        const copyBtn = document.getElementById('supportCopyJarLinkBtn');
        const linkInput = document.getElementById('supportJarLinkInput');

        if (titleEl) titleEl.textContent = SupportModal.t('support.modal.title', 'Поддержать проект');
        if (openBtnLabel) openBtnLabel.textContent = SupportModal.t('support.modal.open', 'Открыть банку');
        if (textEl) {
            textEl.textContent = SupportModal.t(
                'support.modal.text',
                'Если тебе нравится DictaFan, можешь поддержать разработку через monobank.'
            );
        }

        const jarUrl = SupportModal.getJarUrl();
        if (linkInput) linkInput.value = jarUrl;

        try {
            if (openBtn) openBtn.disabled = !jarUrl;
            if (copyBtn) copyBtn.disabled = !jarUrl;
        } catch (e) {
        }

        if (openBtn && !openBtn.__supportBound) {
            openBtn.__supportBound = true;
            openBtn.addEventListener('click', () => {
                const url = SupportModal.getJarUrl();
                if (!url) return;
                window.open(url, '_blank', 'noopener,noreferrer');
            });
        }

        if (copyBtn && !copyBtn.__supportBound) {
            copyBtn.__supportBound = true;
            copyBtn.addEventListener('click', async () => {
                const url = SupportModal.getJarUrl();
                if (!url) return;
                try {
                    await navigator.clipboard.writeText(url);
                } catch (e) {
                    try {
                        if (linkInput) linkInput.focus();
                        if (linkInput) linkInput.select();
                    } catch (e2) {
                    }
                }
            });
        }

        const hide = () => {
            try {
                modal.style.display = 'none';
            } catch (e) {
            }
        };

        if (closeBtn && !closeBtn.__supportBound) {
            closeBtn.__supportBound = true;
            closeBtn.addEventListener('click', hide);
        }

        if (!modal.__supportOverlayBound) {
            modal.__supportOverlayBound = true;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hide();
            });
        }

        return modal;
    }

    static open() {
        const modal = SupportModal.ensureModal();

        try {
            modal.style.display = 'flex';
        } catch (e) {
            modal.style.display = 'block';
        }

        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ root: modal });
            }
        } catch (e) {
        }

        try {
            const openBtn = document.getElementById('supportOpenJarBtn');
            if (openBtn && !openBtn.disabled) openBtn.focus();
        } catch (e) {
        }
    }
}

window.SupportModal = SupportModal;
