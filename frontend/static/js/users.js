// Хранилище данных
let allUsers = [];
let allRoles = [];
let allGroups = [];

const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';

// Секции системы
const sections = [
    { key: 'dashboard', name: 'Главная' },
    { key: 'students', name: 'Ученики' },
    { key: 'groups', name: 'Группы' },
    { key: 'tariffs', name: 'Тарифы' },
    { key: 'finances', name: 'Финансы' },
    { key: 'attendance', name: 'Посещаемость' },
    { key: 'tournaments', name: 'Турниры' },
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
            tbody.innerHTML = '<tr><td colspan="11" class="info-text">Ошибка загрузки данных</td></tr>';
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

async function loadGroupsForUsers() {
    try {
        const response = await fetch('/api/groups');
        if (!response.ok) throw new Error('Ошибка загрузки групп');
        allGroups = await response.json();
        updateTrainerGroupSelect();
    } catch (error) {
        console.error('Ошибка загрузки групп для тренеров:', error);
        allGroups = [];
        updateTrainerGroupSelect();
    }
}

// Отображение таблицы пользователей
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="info-text">Сотрудники не найдены</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => {
        const statusBadge = user.is_active
            ? '<span class="user-status-badge active">Активен</span>'
            : '<span class="user-status-badge inactive">Неактивен</span>';

        const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '-';
        const displayName = user.full_name || user.username;
        const roleName = user.role_name || user.role || '-';
        const isGuest = (user.role_name || user.role || '') === 'Гость';
        const salaryLabel = isGuest
            ? 'Не используется'
            : user.salary_type === 'floating'
            ? 'Плавающая'
            : 'Фиксированная';
        const hasFixedSalary = user.fixed_salary !== null && user.fixed_salary !== undefined && user.fixed_salary !== '';
        const salaryAmountLabel = hasFixedSalary
            ? `${Number(user.fixed_salary).toLocaleString('ru-RU')} сум`
            : '-';
        const listPhotoUrl = user.photo_thumb_url || user.photo_url;
        const photoCell = listPhotoUrl
            ? `<img src="${escapeHtml(listPhotoUrl)}" alt="${escapeHtml(displayName)}" style="width:42px;height:42px;object-fit:cover;border-radius:8px;border:1px solid var(--theme-border);">`
            : '<span style="color:#94a3b8;font-size:12px;">Нет фото</span>';
        const mobilePhoto = listPhotoUrl
            ? `<img class="mobile-staff-photo" src="${escapeHtml(listPhotoUrl)}" alt="${escapeHtml(displayName)}">`
            : `<span class="mobile-staff-photo mobile-staff-photo-placeholder">${escapeHtml((displayName || 'С').trim().charAt(0).toUpperCase())}</span>`;

        return `
            <tr>
                <td class="mobile-staff-card-cell" colspan="11">
                    <div class="mobile-staff-card">
                        <div class="mobile-staff-main">
                            ${mobilePhoto}
                            <div class="mobile-staff-info">
                                <div class="mobile-staff-name">${escapeHtml(displayName)}</div>
                                <div class="mobile-staff-role">${escapeHtml(roleName)}</div>
                                <div class="mobile-staff-role">${escapeHtml(user.phone || user.email || '')}</div>
                            </div>
                        </div>
                        <div class="mobile-staff-side">
                            ${statusBadge}
                            <div class="mobile-staff-actions">
                                <button type="button" class="mobile-staff-more user-actions-toggle" aria-label="Действия сотрудника">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="12" cy="5" r="1.8"></circle>
                                        <circle cx="12" cy="12" r="1.8"></circle>
                                        <circle cx="12" cy="19" r="1.8"></circle>
                                    </svg>
                                </button>
                                <div class="mobile-staff-menu">
                                    <button type="button" class="mobile-staff-menu-item mobile-edit-user-btn" data-user-id="${user.id}">${editIcon}<span>Редактировать</span></button>
                                    <button type="button" class="mobile-staff-menu-item mobile-delete-user-btn danger" data-user-id="${user.id}">${trashIcon}<span>Удалить</span></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="desktop-user-cell" data-label="Фото">${photoCell}</td>
                <td class="desktop-user-cell" data-label="Логин">${escapeHtml(user.username)}</td>
                <td class="desktop-user-cell" data-label="Полное имя">${escapeHtml(displayName)}</td>
                <td class="desktop-user-cell" data-label="Телефон">${escapeHtml(user.phone || '-')}</td>
                <td class="desktop-user-cell" data-label="Email">${escapeHtml(user.email || '-')}</td>
                <td class="desktop-user-cell" data-label="Роль">${escapeHtml(roleName)}</td>
                <td class="desktop-user-cell" data-label="Зарплата">${escapeHtml(salaryLabel)}</td>
                <td class="desktop-user-cell" data-label="Сумма зарплаты">${escapeHtml(salaryAmountLabel)}</td>
                <td class="desktop-user-cell" data-label="Статус">${statusBadge}</td>
                <td class="desktop-user-cell" data-label="Дата создания">${createdDate}</td>
                <td class="desktop-user-cell" data-label="Действия">
                    <button class="btn-info edit-user-btn" data-user-id="${user.id}" style="margin-right: 8px;" title="Изменить">${editIcon}</button>
                    <button class="btn-danger delete-user-btn" data-user-id="${user.id}" title="Удалить">${trashIcon}</button>
                </td>
            </tr>
        `;
    }).join('');

    // Добавить обработчики событий
    document.querySelectorAll('.user-actions-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = e.target.closest('.mobile-staff-actions')?.querySelector('.mobile-staff-menu');
            document.querySelectorAll('.mobile-staff-menu.open').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('open');
            });
            if (menu) menu.classList.toggle('open');
        });
    });

    document.querySelectorAll('.edit-user-btn, .mobile-edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = parseInt(e.target.closest('.edit-user-btn, .mobile-edit-user-btn').dataset.userId);
            document.querySelectorAll('.mobile-staff-menu.open').forEach(menu => menu.classList.remove('open'));
            editUser(userId);
        });
    });

    document.querySelectorAll('.delete-user-btn, .mobile-delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = parseInt(e.target.closest('.delete-user-btn, .mobile-delete-user-btn').dataset.userId);
            document.querySelectorAll('.mobile-staff-menu.open').forEach(menu => menu.classList.remove('open'));
            deleteUser(userId);
        });
    });
}

function setUserPhotoPreview(url) {
    const preview = document.getElementById('user-photo-preview');
    const img = document.getElementById('user-photo-preview-img');
    if (!preview || !img) return;

    if (url) {
        img.src = url;
        preview.style.display = 'flex';
    } else {
        img.removeAttribute('src');
        preview.style.display = 'none';
    }
}

function setUserPhotoFileName(name) {
    const fileName = document.getElementById('user-photo-file-name');
    if (fileName) {
        fileName.textContent = name || 'Файл не выбран';
        fileName.title = name || '';
    }
}

function syncUserSalaryFields() {
    const typeSelect = document.getElementById('user-salary-type');
    const salaryInput = document.getElementById('user-fixed-salary');
    const roleSelect = document.getElementById('user-role-id');
    if (!typeSelect || !salaryInput) return;
    const selectedRole = roleSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
    const isGuest = selectedRole === 'Гость';
    if (isGuest) {
        typeSelect.value = 'fixed';
        typeSelect.disabled = true;
        salaryInput.value = '';
        salaryInput.disabled = true;
        salaryInput.placeholder = 'Для гостя не используется';
        return;
    }
    typeSelect.disabled = false;
    const isFixed = typeSelect.value !== 'floating';
    salaryInput.disabled = !isFixed;
    salaryInput.placeholder = isFixed ? 'Сумма' : 'Расчет позже';
    if (!isFixed) {
        salaryInput.value = '';
    }
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
        const deleteButton = role.is_system
            ? `<button class="btn-danger" disabled title="Системную роль нельзя удалить" style="opacity:.45;cursor:not-allowed;">${trashIcon}</button>`
            : `<button class="btn-danger delete-role-btn" data-role-id="${role.id}" title="Удалить">${trashIcon}</button>`;
        return `
            <tr>
                <td data-label="Название">${escapeHtml(role.name)}</td>
                <td data-label="Описание">${escapeHtml(role.description || '-')}</td>
                <td data-label="Пользователей">${role.users_count || 0}</td>
                <td data-label="Действия">
                    <button class="btn-info edit-role-btn" data-role-id="${role.id}" style="margin-right: 8px;" title="Изменить">${editIcon}</button>
                    ${deleteButton}
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

function updateTrainerGroupSelect(selectedIds = []) {
    const select = document.getElementById('user-trainer-groups');
    if (!select) return;
    const selectedSet = new Set((selectedIds || []).map(id => String(id)));
    select.classList.add('native-multi-select');
    select.innerHTML = allGroups.map(group => `
        <option value="${group.id}" ${selectedSet.has(String(group.id)) ? 'selected' : ''}>
            ${escapeHtml(group.name)}
        </option>
    `).join('');
    renderTrainerGroupChecklist();
}

function renderTrainerGroupChecklist() {
    const select = document.getElementById('user-trainer-groups');
    const list = document.getElementById('user-trainer-groups-checklist');
    if (!select || !list) return;

    const options = Array.from(select.options);
    if (!options.length) {
        list.innerHTML = '<div class="trainer-check-empty">Группы не найдены</div>';
        return;
    }

    list.innerHTML = options.map(option => `
        <label class="trainer-check-option">
            <input type="checkbox" value="${escapeHtml(option.value)}" ${option.selected ? 'checked' : ''}>
            <span>${escapeHtml(option.textContent.trim())}</span>
        </label>
    `).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const option = Array.from(select.options).find(item => String(item.value) === String(checkbox.value));
            if (option) option.selected = checkbox.checked;
        });
    });
}

function isTrainerRoleSelected() {
    const roleSelect = document.getElementById('user-role-id');
    const roleName = roleSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
    return roleName === 'Учитель (тренер)' || roleName === 'Тренер';
}

function syncUserTrainerFields(selectedIds = null) {
    const wrapper = document.getElementById('user-trainer-groups-wrap');
    if (!wrapper) return;
    const visible = isTrainerRoleSelected();
    wrapper.style.display = visible ? 'block' : 'none';
    if (selectedIds) {
        updateTrainerGroupSelect(selectedIds);
    }
    if (!visible) {
        const select = document.getElementById('user-trainer-groups');
        if (select) Array.from(select.options).forEach(option => { option.selected = false; });
        renderTrainerGroupChecklist();
    }
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
        setUserPhotoFileName('');
        document.getElementById('remove-user-photo').value = 'false';
        setUserPhotoPreview(null);
        passwordRequired.style.display = 'inline';
        passwordHint.style.display = 'none';
        document.getElementById('user-password').required = true;
        document.getElementById('user-salary-type').value = 'fixed';
        document.getElementById('user-fixed-salary').value = '';
        syncUserSalaryFields();
        syncUserTrainerFields([]);

        modal.style.display = 'flex';
        document.body.classList.add('user-modal-open');
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
        document.getElementById('user-phone').value = user.phone || '';
        document.getElementById('user-email').value = user.email || '';
        document.getElementById('user-role-id').value = user.role_id || '';
        document.getElementById('user-salary-type').value = user.salary_type || 'fixed';
        document.getElementById('user-fixed-salary').value = user.fixed_salary || '';
        syncUserSalaryFields();
        updateTrainerGroupSelect(user.trainer_group_ids || []);
        syncUserTrainerFields(user.trainer_group_ids || []);
        document.getElementById('user-is-active').checked = user.is_active !== false;
        document.getElementById('remove-user-photo').value = 'false';
        document.getElementById('user-photo').value = '';
        setUserPhotoFileName('');
        setUserPhotoPreview(user.photo_url || null);

        passwordRequired.style.display = 'none';
        passwordHint.style.display = 'block';
        document.getElementById('user-password').required = false;
        document.getElementById('user-password').value = '';

        modal.style.display = 'flex';
        document.body.classList.add('user-modal-open');
    }
}

// Закрыть модальное окно пользователя
function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('user-modal-open');
        const form = document.getElementById('userForm');
        if (form) {
            form.reset();
            setUserPhotoPreview(null);
            setUserPhotoFileName('');
        }
    }
}

// Сохранение пользователя
async function saveUser(event) {
    event.preventDefault();

    const editId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('user-username').value.trim();
    const fullName = document.getElementById('user-full-name').value.trim();
    const phone = document.getElementById('user-phone').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;
    const roleId = document.getElementById('user-role-id').value;
    const salaryType = document.getElementById('user-salary-type').value;
    const fixedSalary = document.getElementById('user-fixed-salary').value;
    const isActive = document.getElementById('user-is-active').checked;
    const photo = document.getElementById('user-photo').files[0];
    const removePhoto = document.getElementById('remove-user-photo').value === 'true';
    const trainerGroupSelect = document.getElementById('user-trainer-groups');
    const trainerGroupIds = trainerGroupSelect
        ? Array.from(trainerGroupSelect.selectedOptions).map(option => option.value)
        : [];

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
        const data = new FormData();
        data.append('username', username);
        data.append('full_name', fullName);
        data.append('phone', phone);
        data.append('email', email);
        data.append('role_id', roleId || '');
        data.append('salary_type', salaryType || 'fixed');
        data.append('fixed_salary', salaryType === 'fixed' ? (fixedSalary || '') : '');
        data.append('is_active', isActive ? 'true' : 'false');
        data.append('remove_photo', removePhoto ? 'true' : 'false');
        trainerGroupIds.forEach(groupId => data.append('trainer_group_ids', groupId));

        if (password) {
            data.append('password', password);
        }
        if (photo) {
            data.append('photo', photo);
        }

        if (editId) {
            response = await fetch(`/api/users/${editId}`, {
                method: 'PUT',
                body: data
            });
        } else {
            response = await fetch('/api/users', {
                method: 'POST',
                body: data
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

    bindPermissionSelectAll();
}

function updatePermissionSelectAllState() {
    const selectAll = document.getElementById('permissions-select-all');
    if (!selectAll) return;
    const checkboxes = Array.from(document.querySelectorAll('#permissions-grid input[type="checkbox"]'));
    if (!checkboxes.length) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    const checkedCount = checkboxes.filter(checkbox => checkbox.checked).length;
    selectAll.checked = checkedCount === checkboxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function bindPermissionSelectAll() {
    const selectAll = document.getElementById('permissions-select-all');
    const grid = document.getElementById('permissions-grid');
    if (!selectAll || !grid) return;

    selectAll.onchange = () => {
        grid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = selectAll.checked;
        });
        selectAll.indeterminate = false;
    };

    grid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.onchange = updatePermissionSelectAllState;
    });

    updatePermissionSelectAllState();
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
    loadGroupsForUsers();

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

    const mobileAddUserFab = document.getElementById('mobileAddUserFab');
    if (mobileAddUserFab) {
        mobileAddUserFab.addEventListener('click', openAddUserModal);
    }

    const addRoleBtn = document.getElementById('addRoleBtn');
    if (addRoleBtn) {
        addRoleBtn.addEventListener('click', openAddRoleModal);
    }

    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', saveUser);
    }

    const salaryTypeSelect = document.getElementById('user-salary-type');
    if (salaryTypeSelect) {
        salaryTypeSelect.addEventListener('change', syncUserSalaryFields);
        syncUserSalaryFields();
    }

    const userRoleSelect = document.getElementById('user-role-id');
    if (userRoleSelect) {
        userRoleSelect.addEventListener('change', () => {
            syncUserSalaryFields();
            syncUserTrainerFields();
        });
    }

    const userPhotoInput = document.getElementById('user-photo');
    if (userPhotoInput) {
        userPhotoInput.addEventListener('change', () => {
            const file = userPhotoInput.files[0];
            document.getElementById('remove-user-photo').value = 'false';
            setUserPhotoFileName(file ? file.name : '');
            setUserPhotoPreview(file ? URL.createObjectURL(file) : null);
        });
    }

    const removeUserPhotoBtn = document.getElementById('removeUserPhotoBtn');
    if (removeUserPhotoBtn) {
        removeUserPhotoBtn.addEventListener('click', () => {
            document.getElementById('remove-user-photo').value = 'true';
            document.getElementById('user-photo').value = '';
            setUserPhotoFileName('');
            setUserPhotoPreview(null);
        });
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

    document.addEventListener('click', () => {
        document.querySelectorAll('.mobile-staff-menu.open').forEach(menu => menu.classList.remove('open'));
    });
});
