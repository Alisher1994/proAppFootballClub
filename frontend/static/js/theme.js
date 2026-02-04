// Theme Toggle Script - FORCED LIGHT THEME
(function () {
    'use strict';

    // Always force light theme
    document.body.classList.add('theme-light');
    localStorage.setItem('app-theme', 'light');

    // Hide theme toggle button to prevent switching
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.style.display = 'none';
    }

    // Expose dummy functions to prevent errors
    window.toggleTheme = function () { };
    window.getCurrentTheme = function () { return 'light'; };
})();



