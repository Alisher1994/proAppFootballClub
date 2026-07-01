let accountData = null;
let removePhoto = false;
let initialProfileState = null;
let initialPasswordState = '';
const defaultAvatarUrl = '/static/uploads/avatar_ccount.png';

function setStatus(id, message, type = '') {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message || '';
    node.className = `account-status ${type}`;
}

function setAvatar(url) {
    const img = document.getElementById('account-avatar-img');
    if (!img) return;
    img.src = url || defaultAvatarUrl;
}

function getProfileState() {
    return JSON.stringify({
        full_name: document.getElementById('account-full-name')?.value.trim() || '',
        phone: document.getElementById('account-phone')?.value.trim() || '',
        email: document.getElementById('account-email')?.value.trim() || '',
        hasPhotoFile: Boolean(document.getElementById('account-photo')?.files?.[0]),
        removePhoto
    });
}

function syncProfileButton() {
    const button = document.getElementById('account-save-btn');
    if (!button) return;
    button.disabled = !initialProfileState || getProfileState() === initialProfileState;
}

function syncPasswordButton() {
    const button = document.getElementById('password-save-btn');
    if (!button) return;
    const current = document.getElementById('current-password')?.value || '';
    const next = document.getElementById('new-password')?.value || '';
    const confirm = document.getElementById('confirm-password')?.value || '';
    const state = JSON.stringify({ current, next, confirm });
    button.disabled = state === initialPasswordState || !current || !next || !confirm;
}

async function loadAccount() {
    const response = await fetch('/api/my-account');
    accountData = await response.json();

    document.getElementById('account-username').textContent = accountData.username || '-';
    document.getElementById('account-full-name').value = accountData.full_name || '';
    document.getElementById('account-phone').value = accountData.phone || '';
    document.getElementById('account-email').value = accountData.email || '';
    document.getElementById('account-role').textContent = accountData.role_name || accountData.role || '-';
    document.getElementById('account-google-state').textContent = accountData.google_linked ? 'Google: привязан' : 'Google: не привязан';
    setAvatar(accountData.photo_url || defaultAvatarUrl);
    initialProfileState = getProfileState();
    syncProfileButton();
}

async function saveAccount(event) {
    event.preventDefault();
    const data = new FormData();
    data.append('full_name', document.getElementById('account-full-name').value.trim());
    data.append('phone', document.getElementById('account-phone').value.trim());
    data.append('email', document.getElementById('account-email').value.trim());
    data.append('remove_photo', removePhoto ? 'true' : 'false');
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
    initialPasswordState = JSON.stringify({ current: '', next: '', confirm: '' });
    syncPasswordButton();
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
    ['account-full-name', 'account-phone', 'account-email'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', syncProfileButton);
    });
    initialPasswordState = JSON.stringify({ current: '', next: '', confirm: '' });
    ['current-password', 'new-password', 'confirm-password'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', syncPasswordButton);
    });
    syncPasswordButton();
    document.getElementById('account-photo')?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            removePhoto = false;
            setAvatar(URL.createObjectURL(file));
            syncProfileButton();
        }
    });
    document.getElementById('account-remove-photo')?.addEventListener('click', () => {
        removePhoto = Boolean(accountData?.photo_url);
        document.getElementById('account-photo').value = '';
        setAvatar(defaultAvatarUrl);
        syncProfileButton();
    });
});
