const translations = {
    es: { /* ... */ },
    en: { /* ... */ }
};

document.addEventListener('DOMContentLoaded', () => {
    const userLang = navigator.language.startsWith('es') ? 'es' : 'en';
    const elems = Object.keys(translations[userLang]);
    
    elems.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = translations[userLang][id];
    });
});