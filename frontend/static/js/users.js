// Хранилище данных
let allUsers = [];
let allRoles = [];

// Секции системы
const sections = [
    { key: 'dashboard', name: 'Главная' },
    { key: 'students', name: 'Ученики' },
    { key: 'groups', name: 'Группы' },
    { key: 'tariffs', name: 'Тарифы' },
    { key: 'finances', name: 'Финансы' },
    { key: 'attendance', name: 'Посещаемость' },
    { key: 'camera', name: 'Камера' },
    { key: 'rewards', name: 'Вознаграждения' },
    { key: 'rating', name: 'Рейтинг учеников' },
    { key: 'users', name: 'Сотрудники клуба' },
    { key: 'cash', name: 'Касса' },
    { key: 'settings', name: 'Настройки' }
];

// Загрузка пользователей
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Ошибка загрузки пользователей');

        allUsers = await response.json();
        renderUsersTable();
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        const tbody = document.getElementById('users-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="info-text">Ошибка загрузки данных</td></tr>';
        }
    }
}

// Загрузка ролей
async function loadRoles() {
    try {
        const response = await fetch('/api/roles');
        if (!response.ok) throw new Error('Ошибка загрузки ролей');

        allRoles = await response.json();
        renderRolesTable();
        updateRoleSelect();
    } catch (error) {
        console.error('Ошибка загрузки ролей:', error);
        const tbody = document.getElementById('roles-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="info-text">Ошибка загрузки данных</td></tr>';
        }
    }
}

// Отображение таблицы пользователей
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="info-text">Сотрудники не найдены</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => {
        const statusBadge = user.is_active
            ? '<span style="color: #27ae60; font-weight: 600;">✓ Активен</span>'
            : '<span style="color: #e74c3c; font-weight: 600;">✗ Неактивен</span>';

        const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '-';

        return `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.full_name || '-')}</td>
                <td>${escapeHtml(user.role_name || user.role || '-')}</td>
                <td>${statusBadge}</td>
                <td>${createdDate}</td>
                <td>
                    <button class="btn-info edit-user-btn" data-user-id="${user.id}" style="margin-right: 8px;" title="Изменить">✏️</button>
                    <button class="btn-danger delete-user-btn" data-user-id="${user.id}" title="Удалить">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Добавить обработчики событий
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = parseInt(e.target.closest('.edit-user-btn').dataset.userId);
            editUser(userId);
        });
    });

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = parseInt(e.target.closest('.delete-user-btn').dataset.userId);
            deleteUser(userId);
        });
    });
}

// Отображение таблицы ролей
function renderRolesTable() {
    const tbody = document.getElementById('roles-table-body');
    if (!tbody) return;

    if (allRoles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="info-text">Роли не найдены</td></tr>';
        return;
    }

    tbody.innerHTML = allRoles.map(role => {
        return `
            <tr>
                <td><strong>${escapeHtml(role.name)}</strong></td>
                <td>${escapeHtml(role.description || '-')}</td>
                <td>${role.users_count || 0}</td>
                <td>
                    <button class="btn-info edit-role-btn" data-role-id="${role.id}" style="margin-right: 8px;" title="Изменить">✏️</button>
                    <button class="btn-danger delete-role-btn" data-role-id="${role.id}" title="Удалить">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Добавить обработчики событий
    document.querySelectorAll('.edit-role-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const roleId = parseInt(e.target.closest('.edit-role-btn').dataset.roleId);
            editRole(roleId);
        });
    });

    document.querySelectorAll('.delete-role-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const roleId = parseInt(e.target.closest('.delete-role-btn').dataset.roleId);
            deleteRole(roleId);
        });
    });
}

// Обновление select с ролями
function updateRoleSelect() {
    const select = document.getElementById('user-role-id');
    if (!select) return;

    select.innerHTML = '<option value="">Выберите роль</option>' +
        allRoles.map(role => `<option value="${role.id}">${role.name}</option>`).join('');
}

// Открыть модальное окно для добавления пользователя
function openAddUserModal() {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');
    const editId = document.getElementById('edit-user-id');
    const passwordRequired = document.getElementById('password-required');
    const passwordHint = document.getElementById('password-hint');

    if (modal && title && form && editId) {
        title.textContent = 'Добавить сотрудника';
        editId.value = '';
        form.reset();
        passwordRequired.style.display = 'inline';
        passwordHint.style.display = 'none';
        document.getElementById('user-password').required = true;

        modal.style.display = 'flex';
    }
}

// Открыть модальное окно для редактирования пользователя
async function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');
    const editId = document.getElementById('edit-user-id');
    const passwordRequired = document.getElementById('password-required');
    const passwordHint = document.getElementById('password-hint');

    if (modal && title && form && editId) {
        title.textContent = 'Редактировать сотрудника';
        editId.value = userId;

        document.getElementById('user-username').value = user.username;
        document.getElementById('user-full-name').value = user.full_name || '';
        document.getElementById('user-role-id').value = user.role_id || '';
        document.getElementById('user-is-active').checked = user.is_active !== false;

        passwordRequired.style.display = 'none';
        passwordHint.style.display = 'block';
        document.getElementById('user-password').required = false;
        document.getElementById('user-password').value = '';

        modal.style.display = 'flex';
    }
}

// Закрыть модальное окно пользователя
function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('userForm');
        if (form) {
            form.reset();
        }
    }
}

// Сохранение пользователя
async function saveUser(event) {
    event.preventDefault();

    const editId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('user-username').value.trim();
    const fullName = document.getElementById('user-full-name').value.trim();
    const password = document.getElementById('user-password').value;
    const roleId = document.getElementById('user-role-id').value;
    const isActive = document.getElementById('user-is-active').checked;

    if (!username) {
        alert('Введите логин сотрудника');
        return;
    }

    if (!editId && (!password || password.length < 4)) {
        alert('Пароль должен быть не менее 4 символов');
        return;
    }

    try {
        let response;
        const data = {
            username: username,
            full_name: fullName,
            role_id: roleId || null,
            is_active: isActive
        };

        if (password) {
            data.password = password;
        }

        if (editId) {
            response = await fetch(`/api/users/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        const result = await response.json();

        if (result.success) {
            closeUserModal();
            await loadUsers();
            alert(result.message || 'Операция выполнена успешно');
        } else {
            alert(result.message || 'Ошибка при сохранении');
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        alert('Ошибка при сохранении данных');
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого сотрудника?')) {
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            await loadUsers();
            alert(result.message || 'Сотрудник успешно удален');
        } else {
            alert(result.message || 'Ошибка при удалении');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка при удалении данных');
    }
}

// Открыть модальное окно для добавления роли
function openAddRoleModal() {
    const modal = document.getElementById('roleModal');
    const title = document.getElementById('roleModalTitle');
    const form = document.getElementById('roleForm');
    const editId = document.getElementById('edit-role-id');

    if (modal && title && form && editId) {
        title.textContent = 'Добавить роль';
        editId.value = '';
        form.reset();
        renderPermissionsGrid({});

        modal.style.display = 'flex';
    }
}

// Открыть модальное окно для редактирования роли
function editRole(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    const modal = document.getElementById('roleModal');
    const title = document.getElementById('roleModalTitle');
    const form = document.getElementById('roleForm');
    const editId = document.getElementById('edit-role-id');

    if (modal && title && form && editId) {
        title.textContent = 'Редактировать роль';
        editId.value = roleId;

        document.getElementById('role-name').value = role.name;
        document.getElementById('role-description').value = role.description || '';

        renderPermissionsGrid(role.permissions || {});

        modal.style.display = 'flex';
    }
}

// Отображение сетки прав доступа
function renderPermissionsGrid(permissions) {
    const grid = document.getElementById('permissions-grid');
    if (!grid) return;

    grid.innerHTML = sections.map(section => {
        const perm = permissions[section.key] || { can_view: false, can_edit: false };

        return `
            <div class="permission-card">
                <div class="permission-card-title">${escapeHtml(section.name)}</div>
                <label class="permission-checkbox-label">
                    <input type="checkbox" class="perm-view" data-section="${section.key}" ${perm.can_view ? 'checked' : ''}>
                    <span>Просмотр</span>
                </label>
                <label class="permission-checkbox-label">
                    <input type="checkbox" class="perm-edit" data-section="${section.key}" ${perm.can_edit ? 'checked' : ''}>
                    <span>Редактирование</span>
                </label>
            </div>
        `;
    }).join('');
}

// Закрыть модальное окно роли
function closeRoleModal() {
    const modal = document.getElementById('roleModal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('roleForm');
        if (form) {
            form.reset();
        }
    }
}

// Сохранение роли
async function saveRole(event) {
    event.preventDefault();

    const editId = document.getElementById('edit-role-id').value;
    const name = document.getElementById('role-name').value.trim();
    const description = document.getElementById('role-description').value.trim();

    if (!name) {
        alert('Введите название роли');
        return;
    }

    // Собираем права доступа
    const permissions = {};
    sections.forEach(section => {
        const viewCheckbox = document.querySelector(`.perm-view[data-section="${section.key}"]`);
        const editCheckbox = document.querySelector(`.perm-edit[data-section="${section.key}"]`);

        permissions[section.key] = {
            can_view: viewCheckbox ? viewCheckbox.checked : false,
            can_edit: editCheckbox ? editCheckbox.checked : false
        };
    });

    try {
        let response;
        const data = {
            name: name,
            description: description,
            permissions: permissions
        };

        if (editId) {
            response = await fetch(`/api/roles/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        const result = await response.json();

        if (result.success) {
            closeRoleModal();
            await loadRoles();
            await loadUsers(); // Обновить список пользователей, т.к. там отображаются роли
            alert(result.message || 'Операция выполнена успешно');
        } else {
            alert(result.message || 'Ошибка при сохранении');
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        alert('Ошибка при сохранении данных');
    }
}

// Удаление роли
async function deleteRole(roleId) {
    if (!confirm('Вы уверены, что хотите удалить эту роль?')) {
        return;
    }

    try {
        const response = await fetch(`/api/roles/${roleId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            await loadRoles();
            await loadUsers();
            alert(result.message || 'Роль успешно удалена');
        } else {
            alert(result.message || 'Ошибка при удалении');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка при удалении данных');
    }
}

// Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.users-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.users-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.querySelector(`.users-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Вспомогательная функция для экранирования HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Загрузить данные
    loadUsers();
    loadRoles();

    // Обработчики событий для вкладок
    document.querySelectorAll('.users-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Обработчики кнопок
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', openAddUserModal);
    }

    const addRoleBtn = document.getElementById('addRoleBtn');
    if (addRoleBtn) {
        addRoleBtn.addEventListener('click', openAddRoleModal);
    }

    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', saveUser);
    }

    const roleForm = document.getElementById('roleForm');
    if (roleForm) {
        roleForm.addEventListener('submit', saveRole);
    }

    // Закрытие модальных окон при клике вне их
    ['userModal', 'roleModal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (modalId === 'userModal') closeUserModal();
                    if (modalId === 'roleModal') closeRoleModal();
                }
            });
        }
    });
});




