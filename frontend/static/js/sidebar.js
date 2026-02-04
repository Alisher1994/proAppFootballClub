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
            // Если меню свернуто - показываем ☰ (чтобы развернуть)
            // Если меню развернуто - показываем ✕ (чтобы свернуть)
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '☰' : '✕';
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

