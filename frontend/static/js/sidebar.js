// Сохранение активной страницы
function saveActivePage() {
    const activeLink = document.querySelector('.sidebar a.active');
    if (activeLink) {
        const href = activeLink.getAttribute('href');
        if (href) {
            // Извлечь имя страницы из href
            const pageName = href.split('/').filter(p => p).pop() || 'dashboard';
            localStorage.setItem('active_page', pageName);
        }
    }
}

// Управление боковым меню
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.sidebar-toggle');
    
    // Сохранить активную страницу при клике на ссылки
    const navLinks = document.querySelectorAll('.sidebar a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Сохранить активную страницу после небольшой задержки
            setTimeout(() => {
                saveActivePage();
            }, 100);
        });
    });
    
    // Функция обновления иконки кнопки
    function updateToggleIcon() {
        if (toggleBtn) {
            const collapsed = sidebar.classList.contains('collapsed');
            toggleBtn.innerHTML = collapsed
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 3v18" />
                    <path d="m14 9 3 3-3 3" />
                </svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 3v18" />
                    <path d="m16 15-3-3 3-3" />
                </svg>`;
            toggleBtn.setAttribute('aria-label', collapsed ? 'Развернуть меню' : 'Свернуть меню');
        }
    }
    
    // Загрузить состояние из localStorage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }
    updateToggleIcon();
    
    // Обработчик клика на кнопку переключения
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            sidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed');
            
            // Обновить иконку
            updateToggleIcon();
            
            // Сохранить состояние в localStorage
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });
    }
});
