// Theme Toggle Script
(function() {
    'use strict';

    // Get saved theme from localStorage or default to dark
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    
    // Apply theme on page load
    if (savedTheme === 'light') {
        document.body.classList.add('theme-light');
    }

    // Theme toggle button handler
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function() {
            const isLight = document.body.classList.contains('theme-light');
            
            if (isLight) {
                // Switch to dark
                document.body.classList.remove('theme-light');
                localStorage.setItem('app-theme', 'dark');
            } else {
                // Switch to light
                document.body.classList.add('theme-light');
                localStorage.setItem('app-theme', 'light');
            }
        });
    }

    // Expose theme toggle function globally for other scripts
    window.toggleTheme = function() {
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.click();
        }
    };

    window.getCurrentTheme = function() {
        return document.body.classList.contains('theme-light') ? 'light' : 'dark';
    };
})();



