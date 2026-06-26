// Theme Toggle Script - FORCED LIGHT THEME
(function () {
    'use strict';

    document.documentElement.classList.remove('theme-dark');
    document.documentElement.classList.add('theme-light');
    document.documentElement.style.background = '#f5f7fb';

    function applyLightTheme() {
        if (document.body) {
            document.body.classList.remove('theme-dark');
            document.body.classList.add('theme-light');
        }
    }

    applyLightTheme();
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', applyLightTheme, { once: true });
    }

    localStorage.setItem('app-theme', 'light');
    localStorage.setItem('theme', 'light');

    // Hide theme toggle button to prevent switching
    function hideThemeToggle() {
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.style.display = 'none';
        }
    }

    hideThemeToggle();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideThemeToggle, { once: true });
    }

    // Expose dummy functions to prevent errors
    window.toggleTheme = function () { };
    window.getCurrentTheme = function () { return 'light'; };
})();



