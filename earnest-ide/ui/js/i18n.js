/**
 * Lightweight i18n helper for Earnest IDE (default: 'en', extensible to any locale).
 */
(function () {
    const TRANSLATIONS = {
        en: {
            'app.title': 'Earnest IDE',
            'nav.files': 'Files',
            'nav.search': 'Search',
            'nav.git': 'Source Control',
            'nav.kb': 'Knowledge Base',
            'nav.settings': 'Settings',
            'btn.save': 'Save',
            'btn.run': 'Run',
            'btn.resume': 'Resume',
            'btn.new': 'New',
            'btn.approve_seal': 'Approve & Seal (SHA-256)',
            'btn.reject': 'Reject',
            'btn.cancel': 'Cancel',
            'chat.placeholder': 'Development instruction...',
            'chat.thinking': 'Earnest Copilot is thinking...',
            'chat.in_progress': 'In progress...',
            'chat.see_more': '+ See more',
            'chat.see_less': '- See less',
            'status.model_unknown': 'Model : Unknown',
            'status.model_prefix': 'Model :',
            'history.loading': 'Loading history...',
            'history.empty': 'No previous sessions recorded',
        },
        fr: {
            'app.title': 'Earnest IDE',
            'nav.files': 'Fichiers',
            'nav.search': 'Recherche',
            'nav.git': 'Contrôle de source',
            'nav.kb': 'Base de connaissances',
            'nav.settings': 'Paramètres',
            'btn.save': 'Sauvegarder',
            'btn.run': 'Exécuter',
            'btn.resume': 'Reprendre',
            'btn.new': 'Nouveau',
            'btn.approve_seal': 'Approuver & Sceller (SHA-256)',
            'btn.reject': 'Rejeter',
            'btn.cancel': 'Annuler',
            'chat.placeholder': 'Consigne de développement...',
            'chat.thinking': 'Earnest Copilote réfléchit...',
            'chat.in_progress': 'En cours…',
            'chat.see_more': '+ Voir plus',
            'chat.see_less': '- Réduire',
            'status.model_unknown': 'Modèle : Inconnu',
            'status.model_prefix': 'Modèle :',
            'history.loading': 'Chargement historique...',
            'history.empty': 'Aucune session précédente enregistrée',
        }
    };

    let currentLang = localStorage.getItem('earnest_lang') || 'en';
    if (!TRANSLATIONS[currentLang]) currentLang = 'en';

    window.t = function (key) {
        return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
            || TRANSLATIONS.en[key]
            || key;
    };

    window.setLang = function (lang) {
        if (!TRANSLATIONS[lang]) return;
        currentLang = lang;
        localStorage.setItem('earnest_lang', lang);
        window.applyI18n();
    };

    window.getLang = function () {
        return currentLang;
    };

    window.applyI18n = function () {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = window.t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.setAttribute('placeholder', window.t(key));
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.applyI18n();
    });
})();
