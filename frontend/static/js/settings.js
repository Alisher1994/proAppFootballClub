// settings.js updated: FORCE REBUILD 2
document.addEventListener('DOMContentLoaded', initSettings);
let expenseCategories = [];

async function initSettings() {
    attachWorkingDayToggles();
    await loadSettings();

    const expenseInput = document.getElementById('expense-category-input');
    if (expenseInput) {
        expenseInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addExpenseCategorySetting();
            }
        });
    }

    const form = document.getElementById('settingsForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSettings();
        });
    }

    const expenseForm = document.getElementById('expenseCategoriesForm');
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSettings();
        });
    }

    // Обработчик формы Telegram
    const telegramForm = document.getElementById('telegramSettingsForm');
    if (telegramForm) {
        telegramForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveTelegramSettings();
        });
    }

    // Обработчик формы Камеры
    const cameraForm = document.getElementById('cameraSettingsForm');
    if (cameraForm) {
        cameraForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveCameraSettings();
        });
    }
}

function attachWorkingDayToggles() {
    const container = document.getElementById('working-days');
    if (!container) return;
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.day-toggle');
        if (!btn) return;
        btn.classList.toggle('active');
    });
}

function collectWorkingDays() {
    return Array.from(document.querySelectorAll('.day-toggle.active'))
        .map(btn => parseInt(btn.dataset.day, 10));
}

function setWorkingDays(days) {
    const set = new Set(days || []);
    document.querySelectorAll('.day-toggle').forEach(btn => {
        const day = parseInt(btn.dataset.day, 10);
        if (set.has(day)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

async function loadSettings() {
    try {
        const resp = await fetch('/api/club-settings');
        const data = await resp.json();
        document.getElementById('system_name').value = data.system_name || '';
        setWorkingDays(data.working_days || []);
        document.getElementById('work_start_time').value = data.work_start_time || '09:00';
        document.getElementById('work_end_time').value = data.work_end_time || '21:00';
        document.getElementById('max_groups_per_slot').value = data.max_groups_per_slot || 1;
        document.getElementById('block_future_payments').checked = !!data.block_future_payments;
        document.getElementById('rewards_reset_period_months').value = data.rewards_reset_period_months || 1;
        // Убедимся, что значение кратно 5 и в диапазоне 5-50
        const podiumValue = data.podium_display_count || 20;
        const normalizedPodiumValue = Math.max(5, Math.min(50, Math.round(podiumValue / 5) * 5));
        document.getElementById('podium_display_count').value = normalizedPodiumValue;

        // Загружаем настройки Telegram (если элементы существуют)
        const telegramTokenEl = document.getElementById('telegram_bot_token');
        const telegramBotUrlEl = document.getElementById('telegram_bot_url');
        const telegramNotificationEl = document.getElementById('telegram_notification_template');
        const telegramRewardEl = document.getElementById('telegram_reward_template');
        const telegramCardEl = document.getElementById('telegram_card_template');
        const telegramPaymentEl = document.getElementById('telegram_payment_template');

        if (telegramTokenEl) telegramTokenEl.value = data.telegram_bot_token || '';
        if (telegramBotUrlEl) telegramBotUrlEl.value = data.telegram_bot_url || '';
        if (telegramNotificationEl) telegramNotificationEl.value = data.telegram_notification_template || '';
        if (telegramRewardEl) telegramRewardEl.value = data.telegram_reward_template || '';
        if (telegramCardEl) telegramCardEl.value = data.telegram_card_template || '';
        if (telegramPaymentEl) telegramPaymentEl.value = data.telegram_payment_template || '';

        // Телефоны руководства
        const directorPhoneEl = document.getElementById('director_phone');
        const founderPhoneEl = document.getElementById('founder_phone');
        const cashierPhoneEl = document.getElementById('cashier_phone');

        if (directorPhoneEl) directorPhoneEl.value = data.director_phone || '';
        if (founderPhoneEl) founderPhoneEl.value = data.founder_phone || '';
        if (cashierPhoneEl) cashierPhoneEl.value = data.cashier_phone || '';

        // Настройки камеры
        const rtspUrlEl = document.getElementById('rtsp_url_setting');
        if (rtspUrlEl) {
            rtspUrlEl.value = data.rtsp_url || '';
        }

        const clickEnabledEl = document.getElementById('payment_click_enabled');
        const clickQrEl = document.getElementById('payment_click_qr_url');
        const paymeEnabledEl = document.getElementById('payment_payme_enabled');
        const paymeQrEl = document.getElementById('payment_payme_qr_url');
        const uzumEnabledEl = document.getElementById('payment_uzum_enabled');
        const uzumQrEl = document.getElementById('payment_uzum_qr_url');
        const uzcardEnabledEl = document.getElementById('payment_uzcard_enabled');
        const humoEnabledEl = document.getElementById('payment_humo_enabled');
        const paynetEnabledEl = document.getElementById('payment_paynet_enabled');
        const paynetQrEl = document.getElementById('payment_paynet_qr_url');
        const xaznaEnabledEl = document.getElementById('payment_xazna_enabled');
        const xaznaQrEl = document.getElementById('payment_xazna_qr_url');
        const osonEnabledEl = document.getElementById('payment_oson_enabled');
        const osonQrEl = document.getElementById('payment_oson_qr_url');
        const transferEnabledEl = document.getElementById('payment_transfer_enabled');

        if (clickEnabledEl) clickEnabledEl.checked = !!data.payment_click_enabled;
        if (clickQrEl) clickQrEl.value = data.payment_click_qr_url || '';
        if (paymeEnabledEl) paymeEnabledEl.checked = !!data.payment_payme_enabled;
        if (paymeQrEl) paymeQrEl.value = data.payment_payme_qr_url || '';
        if (uzumEnabledEl) uzumEnabledEl.checked = !!data.payment_uzum_enabled;
        if (uzumQrEl) uzumQrEl.value = data.payment_uzum_qr_url || '';
        if (uzcardEnabledEl) uzcardEnabledEl.checked = !!data.payment_uzcard_enabled;
        if (humoEnabledEl) humoEnabledEl.checked = !!data.payment_humo_enabled;
        if (paynetEnabledEl) paynetEnabledEl.checked = !!data.payment_paynet_enabled;
        if (paynetQrEl) paynetQrEl.value = data.payment_paynet_qr_url || '';
        if (xaznaEnabledEl) xaznaEnabledEl.checked = !!data.payment_xazna_enabled;
        if (xaznaQrEl) xaznaQrEl.value = data.payment_xazna_qr_url || '';
        if (osonEnabledEl) osonEnabledEl.checked = !!data.payment_oson_enabled;
        if (osonQrEl) osonQrEl.value = data.payment_oson_qr_url || '';
        if (transferEnabledEl) transferEnabledEl.checked = !!data.payment_transfer_enabled;

        // Статьи расхода
        expenseCategories = Array.isArray(data.expense_categories) ? data.expense_categories : [];
        if (!expenseCategories.length) {
            expenseCategories = ['Аренда', 'Зарплата', 'Оборудование', 'Коммунальные', 'Ремонт стадиона', 'Дивидент', 'Прочее'];
        }
        renderExpenseCategories();
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
        alert('Не удалось загрузить настройки');
    }
}

async function saveSettings() {
    const data = gatherAllSettings();
    if (!data.system_name) {
        alert('Введите название системы');
        return;
    }

    try {
        const resp = await fetch('/api/club-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.success) {
            alert('Настройки сохранены');
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось сохранить'));
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        alert('Не удалось сохранить настройки');
    }
}

function gatherAllSettings() {
    return {
        system_name: document.getElementById('system_name').value.trim(),
        working_days: collectWorkingDays(),
        work_start_time: document.getElementById('work_start_time').value,
        work_end_time: document.getElementById('work_end_time').value,
        max_groups_per_slot: parseInt(document.getElementById('max_groups_per_slot').value, 10),
        block_future_payments: document.getElementById('block_future_payments').checked,
        rewards_reset_period_months: parseInt(document.getElementById('rewards_reset_period_months').value, 10),
        podium_display_count: parseInt(document.getElementById('podium_display_count').value, 10),
        telegram_bot_url: (document.getElementById('telegram_bot_url')?.value || '').trim(),
        telegram_bot_token: (document.getElementById('telegram_bot_token')?.value || '').trim(),
        telegram_notification_template: (document.getElementById('telegram_notification_template')?.value || '').trim(),
        telegram_reward_template: (document.getElementById('telegram_reward_template')?.value || '').trim(),
        telegram_card_template: (document.getElementById('telegram_card_template')?.value || '').trim(),
        telegram_payment_template: (document.getElementById('telegram_payment_template')?.value || '').trim(),
        director_phone: (document.getElementById('director_phone')?.value || '').trim(),
        founder_phone: (document.getElementById('founder_phone')?.value || '').trim(),
        cashier_phone: (document.getElementById('cashier_phone')?.value || '').trim(),
        rtsp_url: (document.getElementById('rtsp_url_setting')?.value || '').trim(),
        payment_click_enabled: document.getElementById('payment_click_enabled')?.checked || false,
        payment_click_qr_url: (document.getElementById('payment_click_qr_url')?.value || '').trim(),
        payment_payme_enabled: document.getElementById('payment_payme_enabled')?.checked || false,
        payment_payme_qr_url: (document.getElementById('payment_payme_qr_url')?.value || '').trim(),
        payment_uzum_enabled: document.getElementById('payment_uzum_enabled')?.checked || false,
        payment_uzum_qr_url: (document.getElementById('payment_uzum_qr_url')?.value || '').trim(),
        payment_uzcard_enabled: document.getElementById('payment_uzcard_enabled')?.checked || false,
        payment_humo_enabled: document.getElementById('payment_humo_enabled')?.checked || false,
        payment_paynet_enabled: document.getElementById('payment_paynet_enabled')?.checked || false,
        payment_paynet_qr_url: (document.getElementById('payment_paynet_qr_url')?.value || '').trim(),
        payment_xazna_enabled: document.getElementById('payment_xazna_enabled')?.checked || false,
        payment_xazna_qr_url: (document.getElementById('payment_xazna_qr_url')?.value || '').trim(),
        payment_oson_enabled: document.getElementById('payment_oson_enabled')?.checked || false,
        payment_oson_qr_url: (document.getElementById('payment_oson_qr_url')?.value || '').trim(),
        payment_transfer_enabled: document.getElementById('payment_transfer_enabled')?.checked || false,
        expense_categories: expenseCategories
    };
}

async function saveTelegramSettings() {
    const data = gatherAllSettings();
    try {
        const resp = await fetch('/api/club-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await resp.json();
        if (result.success) {
            alert('Настройки Telegram сохранены!');
        } else {
            alert('Ошибка: ' + (result.message || 'Не удалось сохранить настройки'));
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек Telegram:', error);
        alert('Не удалось сохранить настройки Telegram');
    }
}

async function saveCameraSettings() {
    const data = gatherAllSettings();
    try {
        const resp = await fetch('/api/club-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await resp.json();
        if (result.success) {
            alert('Настройки камеры сохранены! Видео обновится при следующем открытии страницы камеры.');
        } else {
            alert('Ошибка: ' + (result.message || 'Не удалось сохранить настройки'));
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек камеры:', error);
        alert('Не удалось сохранить настройки камеры');
    }
}

function renderExpenseCategories() {
    const list = document.getElementById('expense-categories-list');
    if (!list) return;

    list.innerHTML = '';

    if (!expenseCategories.length) {
        const empty = document.createElement('div');
        empty.textContent = 'Статей расхода пока нет';
        empty.style.color = '#94a3b8';
        empty.style.fontSize = '14px';
        list.appendChild(empty);
        return;
    }

    expenseCategories.forEach((category, index) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '6px';
        item.style.background = 'var(--theme-card-bg)';
        item.style.border = '1px solid var(--theme-border)';
        item.style.borderRadius = '12px';
        item.style.padding = '8px 12px';
        item.style.color = 'var(--theme-text-primary)';

        const name = document.createElement('span');
        name.textContent = category;
        name.style.fontSize = '14px';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.title = 'Удалить статью';
        removeBtn.style.border = 'none';
        removeBtn.style.background = 'transparent';
        removeBtn.style.color = '#ef4444';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontSize = '16px';
        removeBtn.addEventListener('click', () => removeExpenseCategorySetting(index));

        item.appendChild(name);
        item.appendChild(removeBtn);
        list.appendChild(item);
    });
}

function addExpenseCategorySetting() {
    const input = document.getElementById('expense-category-input');
    if (!input) return;

    const value = (input.value || '').trim();
    if (!value) return;

    const exists = expenseCategories.some((cat) => cat.toLowerCase() === value.toLowerCase());
    if (exists) {
        alert('Такая статья уже есть');
        return;
    }

    expenseCategories.push(value);
    input.value = '';
    renderExpenseCategories();
}

function removeExpenseCategorySetting(index) {
    if (index < 0 || index >= expenseCategories.length) return;
    expenseCategories.splice(index, 1);
    renderExpenseCategories();
}

window.addExpenseCategorySetting = addExpenseCategorySetting;
window.removeExpenseCategorySetting = removeExpenseCategorySetting;
