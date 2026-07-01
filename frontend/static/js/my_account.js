let accountData = null;
let removePhoto = false;

function setStatus(id, message, type = '') {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message || '';
    node.className = `account-status ${type}`;
}

function setAvatar(url, fallbackText) {
    const img = document.getElementById('account-avatar-img');
    const placeholder = document.getElementById('account-avatar-placeholder');
    if (!img || !placeholder) return;
    if (url) {
        img.src = url;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        placeholder.textContent = (fallbackText || 'A').trim().charAt(0).toUpperCase();
        placeholder.style.display = 'flex';
    }
}

async function loadRoles(selectedRoleId, canChangeRole, roleName) {
    const roleSelect = document.getElementById('account-role');
    if (!roleSelect) return;
    if (!canChangeRole) {
        roleSelect.innerHTML = `<option value="${selectedRoleId || ''}">${roleName || '-'}</option>`;
        roleSelect.disabled = true;
        return;
    }
    const response = await fetch('/api/roles');
    const roles = response.ok ? await response.json() : [];
    roleSelect.innerHTML = roles.map(role => (
        `<option value="${role.id}" ${String(role.id) === String(selectedRoleId || '') ? 'selected' : ''}>${escapeHtml(role.name)}</option>`
    )).join('');
    roleSelect.disabled = false;
}

async function loadAccount() {
    const response = await fetch('/api/my-account');
    accountData = await response.json();

    document.getElementById('account-username').value = accountData.username || '';
    document.getElementById('account-full-name').value = accountData.full_name || '';
    document.getElementById('account-phone').value = accountData.phone || '';
    document.getElementById('account-email').value = accountData.email || '';
    document.getElementById('account-google-state').textContent = accountData.google_linked ? 'Google: привязан' : 'Google: не привязан';
    setAvatar(accountData.photo_url, accountData.full_name || accountData.username);
    await loadRoles(accountData.role_id, accountData.can_change_role, accountData.role_name);
}

async function saveAccount(event) {
    event.preventDefault();
    const data = new FormData();
    data.append('full_name', document.getElementById('account-full-name').value.trim());
    data.append('phone', document.getElementById('account-phone').value.trim());
    data.append('email', document.getElementById('account-email').value.trim());
    data.append('remove_photo', removePhoto ? 'true' : 'false');
    if (accountData?.can_change_role) {
        data.append('role_id', document.getElementById('account-role').value || '');
    }
    const photo = document.getElementById('account-photo').files[0];
    if (photo) data.append('photo', photo);

    const response = await fetch('/api/my-account', { method: 'PUT', body: data });
    const result = await response.json();
    if (!result.success) {
        setStatus('account-status', result.message || 'Ошибка сохранения', 'error');
        return;
    }
    removePhoto = false;
    document.getElementById('account-photo').value = '';
    setStatus('account-status', result.message || 'Сохранено', 'success');
    await loadAccount();
}

async function changePassword(event) {
    event.preventDefault();
    const payload = {
        current_password: document.getElementById('current-password').value,
        new_password: document.getElementById('new-password').value,
        confirm_password: document.getElementById('confirm-password').value
    };
    const response = await fetch('/api/my-account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result.success) {
        setStatus('password-status', result.message || 'Ошибка смены пароля', 'error');
        return;
    }
    document.getElementById('password-form').reset();
    setStatus('password-status', result.message || 'Пароль обновлен', 'success');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    loadAccount().catch(() => setStatus('account-status', 'Не удалось загрузить аккаунт', 'error'));
    document.getElementById('account-form')?.addEventListener('submit', saveAccount);
    document.getElementById('password-form')?.addEventListener('submit', changePassword);
    document.getElementById('account-photo')?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            removePhoto = false;
            setAvatar(URL.createObjectURL(file), accountData?.full_name || accountData?.username);
        }
    });
    document.getElementById('account-remove-photo')?.addEventListener('click', () => {
        removePhoto = true;
        document.getElementById('account-photo').value = '';
        setAvatar(null, accountData?.full_name || accountData?.username);
    });
});
