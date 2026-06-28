// settings.js updated: FORCE REBUILD 2
document.addEventListener('DOMContentLoaded', initSettings);
let expenseCategories = [];
let bridgeStatusTimer = null;
let lastBridgeProgress = null;
let settingsDirtyTrackingReady = false;
const settingsFormSnapshots = new Map();

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

    const hikvisionForm = document.getElementById('hikvisionSettingsForm');
    if (hikvisionForm) {
        hikvisionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSettings();
        });
    }

    const hikvisionManualSyncBtn = document.getElementById('hikvisionManualSyncBtn');
    if (hikvisionManualSyncBtn) {
        hikvisionManualSyncBtn.addEventListener('click', requestHikvisionSync);
    }
    document.querySelectorAll('[data-open-hikvision-door]').forEach((button) => {
        button.addEventListener('click', () => requestHikvisionDoorOpen(button.dataset.openHikvisionDoor, button));
    });
    document.querySelectorAll('[data-clear-hikvision-device]').forEach((button) => {
        button.addEventListener('click', () => requestHikvisionClearDevice(button.dataset.clearHikvisionDevice, button));
    });

    const bridgeStatusRefreshBtn = document.getElementById('bridgeStatusRefreshBtn');
    if (bridgeStatusRefreshBtn) {
        bridgeStatusRefreshBtn.addEventListener('click', loadBridgeStatus);
    }
    if (document.getElementById('bridgeStatusBanner')) {
        loadBridgeStatus();
        bridgeStatusTimer = setInterval(loadBridgeStatus, 5000);
    }
    const bridgePauseBtn = document.getElementById('bridgePauseBtn');
    if (bridgePauseBtn) bridgePauseBtn.addEventListener('click', () => requestBridgeControl(bridgePauseBtn.dataset.action || 'pause'));
    const bridgeStopBtn = document.getElementById('bridgeStopBtn');
    if (bridgeStopBtn) bridgeStopBtn.addEventListener('click', () => requestBridgeControl('stop'));

    const bridgeResultsBtn = document.getElementById('bridgeResultsBtn');
    if (bridgeResultsBtn) bridgeResultsBtn.addEventListener('click', openBridgeResultsModal);
    const copyBridgeLogsBtn = document.getElementById('copyBridgeLogsBtn');
    if (copyBridgeLogsBtn) copyBridgeLogsBtn.addEventListener('click', copyBridgeLiveLogs);
    ['bridgeResultsDeviceFilter', 'bridgeResultsTypeFilter', 'bridgeResultsSearch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'bridgeResultsSearch' ? 'input' : 'change', renderBridgeResultsList);
    });

    initializeSettingsDirtyTracking();
}

function attachWorkingDayToggles() {
    const container = document.getElementById('working-days');
    if (!container) return;
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.day-toggle');
        if (!btn) return;
        btn.classList.toggle('active');
        updateSettingsFormDirtyState(document.getElementById('settingsForm'));
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
        const accessBlockDayEl = document.getElementById('access_block_day');
        const accessPaymentPolicyEl = document.getElementById('access_payment_policy');
        const hikvisionDailySyncTimeEl = document.getElementById('hikvision_daily_sync_time');
        const hikvisionParallelDevicesEl = document.getElementById('hikvision_parallel_devices');
        const hikvisionCleanupStaleUsersEl = document.getElementById('hikvision_cleanup_stale_users');
        const accessDebtStartMonthEl = document.getElementById('access_debt_start_month');
        const accessDebtStartYearEl = document.getElementById('access_debt_start_year');
        const accessMaxDebtMonthsEl = document.getElementById('access_max_debt_months');
        const hikvisionDeviceKeyEl = document.getElementById('hikvision_device_key');
        if (accessBlockDayEl) accessBlockDayEl.value = data.access_block_day || 10;
        if (accessPaymentPolicyEl) accessPaymentPolicyEl.value = data.access_payment_policy || 'partial_current_month';
        if (hikvisionDailySyncTimeEl) hikvisionDailySyncTimeEl.value = data.hikvision_daily_sync_time || '03:00';
        if (hikvisionParallelDevicesEl) hikvisionParallelDevicesEl.checked = !!data.hikvision_parallel_devices;
        if (hikvisionCleanupStaleUsersEl) hikvisionCleanupStaleUsersEl.checked = data.hikvision_cleanup_stale_users !== false;
        if (accessDebtStartMonthEl) accessDebtStartMonthEl.value = data.access_debt_start_month || '';
        if (accessDebtStartYearEl) accessDebtStartYearEl.value = data.access_debt_start_year || '';
        if (accessMaxDebtMonthsEl) accessMaxDebtMonthsEl.value = data.access_max_debt_months ?? 0;
        if (hikvisionDeviceKeyEl) hikvisionDeviceKeyEl.value = data.hikvision_device_key || '';
        setHikvisionDevices(data.hikvision_devices || []);
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

function setHikvisionDevices(devices) {
    const list = Array.isArray(devices) ? devices : [];
    const entry = list.find((d) => d.name === 'entry') || list[0] || {};
    const exit = list.find((d) => d.name === 'exit') || list[1] || {};
    const protocol = entry.protocol || exit.protocol || 'https';
    const port = entry.port || exit.port || (protocol === 'http' ? 80 : 443);

    const entryIpEl = document.getElementById('hikvision_entry_ip');
    const exitIpEl = document.getElementById('hikvision_exit_ip');
    const protocolEl = document.getElementById('hikvision_protocol');
    const portEl = document.getElementById('hikvision_port');

    if (entryIpEl) entryIpEl.value = entry.ip || '192.168.68.107';
    if (exitIpEl) exitIpEl.value = exit.ip || '192.168.68.104';
    if (protocolEl) protocolEl.value = protocol;
    if (portEl) portEl.value = port;
}

function collectHikvisionDevices() {
    const protocol = document.getElementById('hikvision_protocol')?.value || 'https';
    const port = parseInt(document.getElementById('hikvision_port')?.value || (protocol === 'http' ? '80' : '443'), 10);
    const entryIp = (document.getElementById('hikvision_entry_ip')?.value || '').trim();
    const exitIp = (document.getElementById('hikvision_exit_ip')?.value || '').trim();

    return [
        { name: 'entry', ip: entryIp, protocol, port, doorNo: 1 },
        { name: 'exit', ip: exitIp, protocol, port, doorNo: 1 }
    ].filter((device) => device.ip);
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
            markSettingsFormsClean();
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось сохранить'));
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        alert('Не удалось сохранить настройки');
    }
}

async function requestHikvisionSync() {
    const btn = document.getElementById('hikvisionManualSyncBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Команда отправляется...';
    }
    try {
        const resp = await fetch('/api/hikvision/sync', { method: 'POST' });
        const result = await resp.json();
        if (result.success) {
            alert('Команда синхронизации отправлена bridge');
            setTimeout(() => {
                loadSyncHistory();
            }, 500);
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось отправить команду'));
        }
    } catch (error) {
        console.error('Ошибка запуска синхронизации Hikvision:', error);
        alert('Не удалось отправить команду синхронизации');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Синхронизировать сейчас';
        }
    }
}

async function requestHikvisionDoorOpen(deviceName, btn) {
    const label = deviceName === 'entry' ? 'вход' : 'выход';
    if (!confirm(`Открыть турникет "${label}" сейчас?`)) return;

    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Открываем...';
    }
    try {
        const resp = await fetch('/api/hikvision/open-door', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_name: deviceName })
        });
        const result = await resp.json();
        if (result.success) {
            alert(result.message || `Команда открыть ${label} отправлена bridge`);
            setTimeout(loadSyncHistory, 500);
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось открыть турникет'));
        }
    } catch (error) {
        console.error('Ошибка открытия турникета Hikvision:', error);
        alert('Не удалось отправить команду открытия турникета');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function requestHikvisionClearDevice(deviceName, btn) {
    const label = deviceName === 'entry' ? 'вход' : 'выход';
    const typed = prompt(`Это удалит ВСЕХ людей из памяти терминала "${label}". Напишите ОЧИСТИТЬ для подтверждения.`);
    if (typed !== 'ОЧИСТИТЬ') return;

    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Очищаем...';
    }
    try {
        const resp = await fetch('/api/hikvision/clear-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_name: deviceName })
        });
        const result = await resp.json();
        if (result.success) {
            alert(result.message || `Команда очистить ${label} отправлена bridge`);
            setTimeout(loadSyncHistory, 500);
            setTimeout(loadBridgeStatus, 500);
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось отправить очистку терминала'));
        }
    } catch (error) {
        console.error('Ошибка очистки терминала Hikvision:', error);
        alert('Не удалось отправить команду очистки терминала');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function requestBridgeControl(action) {
    const labels = {
        pause: 'поставить запись на паузу',
        resume: 'продолжить запись',
        stop: 'полностью остановить текущую запись'
    };
    if (!confirm(`Вы уверены, что хотите ${labels[action] || 'управлять bridge'}?`)) return;

    try {
        const resp = await fetch('/api/hikvision/bridge/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const result = await resp.json();
        if (result.success) {
            alert(result.message || 'Команда отправлена bridge');
            setTimeout(loadBridgeStatus, 500);
        } else {
            alert('Ошибка: ' + (result.message || 'не удалось отправить команду'));
        }
    } catch (error) {
        console.error('Ошибка управления bridge:', error);
        alert('Не удалось отправить команду bridge');
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
        access_block_day: parseInt(document.getElementById('access_block_day')?.value || '10', 10),
        access_payment_policy: document.getElementById('access_payment_policy')?.value || 'partial_current_month',
        hikvision_daily_sync_time: document.getElementById('hikvision_daily_sync_time')?.value || '03:00',
        hikvision_parallel_devices: document.getElementById('hikvision_parallel_devices')?.checked || false,
        hikvision_cleanup_stale_users: document.getElementById('hikvision_cleanup_stale_users')?.checked !== false,
        access_debt_start_month: document.getElementById('access_debt_start_month')?.value || null,
        access_debt_start_year: document.getElementById('access_debt_start_year')?.value || null,
        access_max_debt_months: parseInt(document.getElementById('access_max_debt_months')?.value || '0', 10),
        hikvision_device_key: (document.getElementById('hikvision_device_key')?.value || '').trim(),
        hikvision_devices: collectHikvisionDevices(),
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
            markSettingsFormsClean();
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
            markSettingsFormsClean();
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

function serializeSettingsForm(form) {
    const values = [];
    form.querySelectorAll('input, select, textarea').forEach((el) => {
        const key = el.name || el.id;
        if (!key) return;
        if (el.type === 'file') {
            const files = Array.from(el.files || []).map((file) => `${file.name}:${file.size}`).join(',');
            values.push(`${key}=file:${files}`);
        } else if (el.type === 'checkbox' || el.type === 'radio') {
            values.push(`${key}=${el.checked ? '1' : '0'}`);
        } else {
            values.push(`${key}=${el.value}`);
        }
    });
    if (form.id === 'expenseCategoriesForm') {
        values.push(`expenseCategories=${JSON.stringify(expenseCategories)}`);
    }
    return values.join('|');
}

function getSettingsSubmitButtons(form) {
    const buttons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
    if (form.id) {
        buttons.push(...Array.from(document.querySelectorAll(`button[form="${form.id}"], input[form="${form.id}"]`)));
    }
    return buttons;
}

function updateSettingsFormDirtyState(form) {
    if (!settingsDirtyTrackingReady || !form) return;
    const initial = settingsFormSnapshots.get(form.id || form);
    const dirty = serializeSettingsForm(form) !== initial;
    getSettingsSubmitButtons(form).forEach((button) => {
        button.disabled = !dirty;
        button.style.opacity = dirty ? '' : '0.55';
        button.style.cursor = dirty ? '' : 'not-allowed';
        button.title = dirty ? '' : 'Нет изменений для сохранения';
    });
}

function markSettingsFormsClean() {
    document.querySelectorAll('.settings-form').forEach((form) => {
        settingsFormSnapshots.set(form.id || form, serializeSettingsForm(form));
        updateSettingsFormDirtyState(form);
    });
}

function initializeSettingsDirtyTracking() {
    const forms = Array.from(document.querySelectorAll('.settings-form'));
    settingsDirtyTrackingReady = true;
    forms.forEach((form) => {
        settingsFormSnapshots.set(form.id || form, serializeSettingsForm(form));
        form.addEventListener('input', () => updateSettingsFormDirtyState(form));
        form.addEventListener('change', () => updateSettingsFormDirtyState(form));
        updateSettingsFormDirtyState(form);
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
    updateSettingsFormDirtyState(document.getElementById('expenseCategoriesForm'));
}

function removeExpenseCategorySetting(index) {
    if (index < 0 || index >= expenseCategories.length) return;
    expenseCategories.splice(index, 1);
    renderExpenseCategories();
    updateSettingsFormDirtyState(document.getElementById('expenseCategoriesForm'));
}

window.addExpenseCategorySetting = addExpenseCategorySetting;
window.removeExpenseCategorySetting = removeExpenseCategorySetting;

// --- ИСТОРИЯ СИНХРОНИЗАЦИЙ HIKVISION ---

async function loadSyncHistory() {
    const body = document.getElementById('hikvisionSyncHistoryBody');
    if (!body) return;

    try {
        const resp = await fetch('/api/hikvision/commands/history');
        if (!resp.ok) throw new Error('Ошибка сети при загрузке истории');
        const data = await resp.json();
        
        if (!data.success) {
            body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444;">${data.message || 'Ошибка загрузки'}</td></tr>`;
            return;
        }

        const commands = data.commands || [];
        if (commands.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--theme-text-secondary); padding: 20px;">История синхронизаций пуста</td></tr>';
            return;
        }

        body.innerHTML = '';
        commands.forEach(cmd => {
            const tr = document.createElement('tr');

            // 1. Дата запуска
            const tdDate = document.createElement('td');
            tdDate.textContent = formatDateTime(cmd.created_at);
            tr.appendChild(tdDate);

            // 2. Причина запуска
            const tdReason = document.createElement('td');
            const reason = cmd.payload?.reason || 'change';
            tdReason.textContent = translateReason(reason);
            tr.appendChild(tdReason);

            // 3. Длительность
            const tdDuration = document.createElement('td');
            tdDuration.textContent = calculateDuration(cmd.picked_at, cmd.finished_at, cmd.created_at, cmd.status);
            tr.appendChild(tdDuration);

            // 4. Статус
            const tdStatus = document.createElement('td');
            let statusText = 'В очереди';
            let statusColor = '#e2e8f0';
            let textColor = '#475569';

            if (cmd.status === 'processing') {
                statusText = 'В процессе';
                statusColor = '#dbeafe';
                textColor = '#1e40af';
            } else if (cmd.status === 'done') {
                statusText = 'Выполнено';
                statusColor = '#dcfce7';
                textColor = '#15803d';
            } else if (cmd.status === 'failed') {
                statusText = 'Ошибка';
                statusColor = '#fee2e2';
                textColor = '#b91c1c';
            }

            const badge = document.createElement('span');
            badge.textContent = statusText;
            badge.style.background = statusColor;
            badge.style.color = textColor;
            badge.style.padding = '4px 10px';
            badge.style.borderRadius = '20px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '600';
            badge.style.display = 'inline-block';
            tdStatus.appendChild(badge);
            tr.appendChild(tdStatus);

            // 5. Логи
            const tdLogs = document.createElement('td');
            if (cmd.result) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-secondary';
                btn.style.padding = '4px 10px';
                btn.style.fontSize = '12px';
                btn.textContent = '📄 Показать лог';
                btn.addEventListener('click', () => {
                    showHikvisionLog(cmd.id, cmd.created_at, cmd.result);
                });
                tdLogs.appendChild(btn);
            } else {
                tdLogs.textContent = '—';
                tdLogs.style.color = 'var(--theme-text-tertiary)';
            }
            tr.appendChild(tdLogs);

            body.appendChild(tr);
        });

    } catch (error) {
        console.error('Ошибка при загрузке истории:', error);
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">Ошибка при загрузке данных: ${error.message}</td></tr>`;
    }
}

async function loadBridgeStatus() {
    const banner = document.getElementById('bridgeStatusBanner');
    if (!banner) return;

    try {
        const resp = await fetch('/api/hikvision/bridge/status');
        if (!resp.ok) throw new Error('Ошибка сети');
        const data = await resp.json();
        if (!data.success) throw new Error(data.message || 'Ошибка загрузки');

        const bridge = data.bridge;
        const queue = data.queue || {};
        const pending = queue.pending || 0;
        const processing = queue.processing;

        const queueMetric = document.getElementById('bridgeQueueMetric');
        if (queueMetric) queueMetric.textContent = processing ? `${pending} + 1` : String(pending);

        if (!bridge) {
            banner.style.borderColor = '#fecaca';
            banner.style.background = '#fff1f2';
            banner.innerHTML = '<strong>Bridge не найден</strong><br><span style="font-size:13px;">Локальный bridge еще не отправлял heartbeat.</span>';
            setBridgeText('bridgeRamMetric', '—');
            setBridgeText('bridgeTempMetric', '—');
            setBridgeText('bridgeTempDetails', '');
            setBridgeText('bridgeUptimeMetric', '—');
            updateBridgeProgress(null);
            setBridgeLogs([]);
            return;
        }

        const online = data.online;
        const metrics = bridge.metrics || {};
        const hasLiveHeartbeat = !!(bridge.pid || metrics.cpu_used_percent != null || metrics.memory_used_percent != null || (Array.isArray(bridge.logs) && bridge.logs.length));
        const legacy = online && !hasLiveHeartbeat && (bridge.version === 'legacy-no-heartbeat' || bridge.reported_status === 'legacy');
        banner.style.borderColor = online ? (legacy ? '#fde68a' : '#bbf7d0') : '#fecaca';
        banner.style.background = online ? (legacy ? '#fffbeb' : '#f0fdf4') : '#fff1f2';
        const dot = online ? '●' : '●';
        const dotColor = online ? (legacy ? '#d97706' : '#16a34a') : '#dc2626';
        const seenText = bridge.seconds_since_seen == null ? 'нет данных' : `${bridge.seconds_since_seen} сек назад`;
        const action = bridge.current_action && bridge.current_action !== 'idle' ? bridge.current_action : 'ожидает задачи';
        banner.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="color:${dotColor}; font-size:18px;">${dot}</span>
                <strong>${online ? (legacy ? 'Bridge online, но старая версия' : 'Локальный Bridge online') : 'Локальный Bridge offline'}</strong>
                <span style="color:var(--theme-text-secondary);">• ${escapeHtml(bridge.host || 'unknown')} • PID ${escapeHtml(bridge.pid || '—')}</span>
            </div>
            <div style="margin-top:6px; font-size:13px; color:var(--theme-text-secondary);">
                Сейчас: ${escapeHtml(action)} · Последний heartbeat: ${escapeHtml(seenText)}
            </div>
            ${legacy ? '<div style="margin-top:4px; font-size:13px; color:#92400e;">Обновите и перезапустите локальный bridge, чтобы появились live-логи и метрики.</div>' : ''}
            ${processing ? `<div style="margin-top:4px; font-size:13px;">Выполняется команда #${processing.id}</div>` : ''}
        `;

        setBridgeText('bridgeCpuMetric', metrics.cpu_used_percent != null ? `${metrics.cpu_used_percent}%` : '—');
        setBridgeText('bridgeRamMetric', metrics.memory_used_percent != null ? `${metrics.memory_used_percent}%` : '—');
        setBridgeTemperature(metrics);
        setBridgeText('bridgeUptimeMetric', formatUptime(bridge.uptime_seconds || 0));
        updateBridgeProgress(metrics.progress || null);
        setBridgeLogs(bridge.logs || []);
    } catch (error) {
        banner.style.borderColor = '#fecaca';
        banner.style.background = '#fff1f2';
        banner.innerHTML = `<strong>Ошибка загрузки bridge</strong><br><span style="font-size:13px;">${escapeHtml(error.message)}</span>`;
        updateBridgeProgress(null);
    }
}

function setBridgeText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setBridgeTemperature(metrics) {
    const temp = metrics.temperature_c ?? metrics.temperatures?.max_c;
    setBridgeText('bridgeTempMetric', temp != null ? `${temp}°C` : '—');
    const zones = Array.isArray(metrics.temperatures?.zones) ? metrics.temperatures.zones : [];
    const details = zones.slice(0, 3).map(zone => `${zone.name}: ${zone.c}°C`).join(' · ');
    setBridgeText('bridgeTempDetails', details);
}

function setBridgeControlButtons(enabled, paused) {
    const pauseBtn = document.getElementById('bridgePauseBtn');
    const stopBtn = document.getElementById('bridgeStopBtn');
    if (pauseBtn) {
        pauseBtn.dataset.action = paused ? 'resume' : 'pause';
        pauseBtn.textContent = paused ? '▶️ Продолжить запись' : '⏸️ Пауза записи';
        pauseBtn.disabled = !enabled;
        pauseBtn.style.opacity = enabled ? '1' : '0.55';
        pauseBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
    if (stopBtn) {
        stopBtn.disabled = !enabled;
        stopBtn.style.opacity = enabled ? '1' : '0.55';
        stopBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
}

function updateBridgeProgress(progress) {
    const panel = document.getElementById('bridgeProgressPanel');
    if (!panel) return;
    lastBridgeProgress = progress || null;

    if (!progress) {
        panel.style.display = 'none';
        renderBridgeDeviceProgress(null);
        const btn = document.getElementById('bridgeResultsBtn');
        if (btn) btn.style.display = 'none';
        setBridgeControlButtons(false, false);
        return;
    }

    const paused = !!progress.paused;
    const activeStages = new Set(['start', 'loading', 'devices_ready', 'device_start', 'probe', 'sync', 'clear_device']);
    const isActive = paused || activeStages.has(progress.stage || '');
    setBridgeControlButtons(isActive, paused);

    const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
    const processed = Number(progress.processed || 0);
    const total = Number(progress.total || 0);
    const stage = progress.stage || '';

    panel.style.display = 'block';
    setBridgeText('bridgeProgressTitle', stage === 'done' ? 'Синхронизация завершена' : (stage === 'stopped' ? 'Синхронизация остановлена' : 'Синхронизация Bridge'));
    setBridgeText('bridgeProgressPercent', `${percent}%`);
    const bar = document.getElementById('bridgeProgressBar');
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.style.background = stage === 'error' || stage === 'stopped' ? '#dc2626' : (stage === 'done' ? '#16a34a' : (progress.paused ? '#f59e0b' : '#2563eb'));
    }

    const status = progress.status_text || progress.current || 'Выполняется задача';
    const countText = total > 0 ? ` · ${processed} из ${total}` : '';
    setBridgeText('bridgeProgressText', `${status}${countText}`);

    const deviceList = Object.values(progress.devices || {});
    const aggregate = deviceList.reduce((acc, device) => {
        acc.success += Number(device.success || 0);
        acc.errors += Number(device.errors || 0);
        acc.rejected += Number(device.rejected || 0);
        return acc;
    }, { success: 0, errors: 0, rejected: 0 });
    const stats = [];
    if (progress.success != null || deviceList.length) stats.push(`успешно: ${progress.success ?? aggregate.success}`);
    if (progress.errors != null || deviceList.length) stats.push(`ошибок: ${progress.errors ?? aggregate.errors}`);
    if (progress.rejected != null || deviceList.length) stats.push(`отклонено: ${progress.rejected ?? aggregate.rejected}`);
    if (progress.skipped != null) stats.push(`заблокировано/пропущено: ${progress.skipped}`);
    setBridgeText('bridgeProgressStats', stats.join(' · '));
    renderBridgeDeviceProgress(progress);

    const btn = document.getElementById('bridgeResultsBtn');
    if (btn) {
        const hasResults = Object.values(progress.devices || {}).some(device => {
            const results = device.results || {};
            return (results.success || []).length || (results.errors || []).length || (results.rejected || []).length;
        });
        btn.style.display = hasResults ? 'inline-flex' : 'none';
    }
}

function renderBridgeDeviceProgress(progress) {
    const grid = document.getElementById('bridgeDeviceProgressGrid');
    if (!grid) return;
    const devices = Object.values(progress?.devices || {});
    if (!devices.length) {
        grid.innerHTML = '';
        return;
    }

    grid.innerHTML = devices.map(device => {
        const percent = Math.max(0, Math.min(100, Number(device.percent || 0)));
        const isEntry = device.name === 'entry';
        const accent = isEntry ? '#2563eb' : '#7c3aed';
        const bg = isEntry ? '#eff6ff' : '#f5f3ff';
        const status = device.status === 'waiting' ? 'ожидает' : (device.status_text || 'выполняется');
        return `
            <div style="border:1px solid ${accent}33; background:${bg}; border-radius:8px; padding:10px;">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                    <strong style="color:${accent};">${escapeHtml(device.label || 'Терминал')}</strong>
                    <strong>${percent}%</strong>
                </div>
                <div style="height:8px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin:8px 0;">
                    <div style="height:100%; width:${percent}%; background:${accent}; border-radius:999px;"></div>
                </div>
                <div style="font-size:12px; color:var(--theme-text-secondary);">${escapeHtml(status)}</div>
                <div style="font-size:12px; margin-top:5px;">
                    <span style="color:#16a34a;">успешно: ${Number(device.success || 0)}</span>
                    <span style="color:#dc2626; margin-left:8px;">ошибок: ${Number(device.errors || 0)}</span>
                    <span style="color:#92400e; margin-left:8px;">отклонено: ${Number(device.rejected || 0)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function setBridgeLogs(logs) {
    const el = document.getElementById('bridgeLiveLogs');
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (!logs.length) {
        el.textContent = 'Логи пока не получены.';
        return;
    }
    el.innerHTML = logs.map(line => {
        const time = line.ts ? new Date(line.ts).toLocaleTimeString('ru-RU') : '';
        const message = formatBridgeLogMessage(line.message || '');
        const color = bridgeLogColor(line.level, message);
        return `<span style="color:${color};">${escapeHtml(`${time} ${bridgeLogLevelLabel(line.level)} ${message}`)}</span>`;
    }).join('\n');
    if (nearBottom) el.scrollTop = el.scrollHeight;
}

async function copyBridgeLiveLogs() {
    const el = document.getElementById('bridgeLiveLogs');
    const btn = document.getElementById('copyBridgeLogsBtn');
    const text = el?.innerText || '';
    if (!text.trim()) return;
    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            const previous = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check" style="width:14px; height:14px;"></i> Скопировано';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                btn.innerHTML = previous;
                if (window.lucide) window.lucide.createIcons();
            }, 1600);
        }
    } catch (error) {
        alert('Не удалось скопировать лог');
    }
}

function bridgeLogLevelLabel(level) {
    if (level === 'ERROR') return 'ОШИБКА';
    if (level === 'WARN') return 'ВНИМАНИЕ';
    return 'ИНФО';
}

function formatBridgeLogMessage(message) {
    let text = String(message || '');
    text = text.replace(/\[entry\]/gi, '[Вход]');
    text = text.replace(/\[exit\]/gi, '[Выход]');
    text = text.replace(/\bentry\b/gi, 'вход');
    text = text.replace(/\bexit\b/gi, 'выход');
    text = text.replace(/server command 502/gi, 'сервер Railway временно недоступен (502)');
    text = text.replace(/server command (\d+)/gi, 'сервер вернул ошибку $1');
    text = text.replace(/offline backoff active for (\d+)s/gi, 'терминал не отвечает, повторная попытка через $1 сек');
    text = text.replace(/reason=no_photo/gi, 'причина: нет фото');
    text = text.replace(/reason=([^,\s]+)/gi, 'причина: $1');
    text = text.replace(/paidThisMonth=(\d+)/gi, 'оплачено в этом месяце=$1');
    text = text.replace(/paid=(\d+)/gi, 'оплачено=$1');
    text = text.replace(/debt=(\d+)/gi, 'долг=$1');
    text = text.replace(/paymentExempt=(yes|true)/gi, 'льгота по оплате=да');
    text = text.replace(/paymentExempt=(no|false)/gi, 'льгота по оплате=нет');
    text = text.replace(/photo=(yes|true)/gi, 'фото=есть');
    text = text.replace(/photo=(no|false)/gi, 'фото=нет');
    text = text.replace(/\[sync\] summary \{"enabled":(\d+),"no_photo":(\d+)\}/i,
        '[sync] Итог списка: к записи готово $1, без фото $2');
    text = text.replace(/\[sync\] skip (.+)/i, '[sync] Пропущено: $1');
    text = text.replace(/\[bridge\] command polling (\d+)ms, daily full sync ([^ ]+) Asia\/Tashkent/i,
        'Bridge запущен. Проверка очереди каждые $1 мс, полная синхронизация в $2');
    text = text.replace(/\[bridge\] (\d+) Hikvision terminal\(s\) -> (.+)/i,
        'Bridge подключен к серверу $2. Терминалов: $1');
    text = text.replace(/\[sync\] (\d+) student\(s\), reason=(.+)/i,
        'Получено записей с сервера: $1. Причина: $2');
    text = text.replace(/\[([^\]]+)\] upserted face=already-exists (.+)/i,
        '[$1] Записан в терминал: $2 (фото уже было в терминале)');
    text = text.replace(/\[([^\]]+)\] upserted face=uploaded (.+)/i,
        '[$1] Записан в терминал: $2 (фото записано)');
    text = text.replace(/\[([^\]]+)\] (.+): fetch failed/i,
        '[$1] Ошибка записи: $2. Причина: соединение с терминалом оборвалось');
    text = text.replace(/EHOSTUNREACH/g, 'терминал недоступен по сети');
    text = text.replace(/ECONNREFUSED/g, 'терминал отклонил подключение');
    text = text.replace(/ETIMEDOUT/g, 'терминал не ответил вовремя');
    text = text.replace(/fetch failed/g, 'соединение с терминалом оборвалось');
    return text;
}

function bridgeLogColor(level, message) {
    if (level === 'ERROR' || /ОШИБКА|Ошибка/i.test(message)) return '#fecaca';
    if (/УСПЕШНО|успешно|Записан/i.test(message)) return '#bbf7d0';
    if (/Доступ закрыт|Отклонено|отклонено/i.test(message)) return '#fde68a';
    if (/\[Выход|Выход \(/i.test(message)) return '#ddd6fe';
    if (/\[Вход|Вход \(/i.test(message)) return '#bfdbfe';
    return '#e5eefb';
}

function openBridgeResultsModal() {
    const modal = document.getElementById('bridgeResultsModal');
    if (!modal) return;
    populateBridgeResultsDevices();
    renderBridgeResultsList();
    modal.style.display = 'block';
}

function populateBridgeResultsDevices() {
    const select = document.getElementById('bridgeResultsDeviceFilter');
    if (!select) return;
    const currentValue = select.value || 'all';
    const devices = Object.values(lastBridgeProgress?.devices || {});
    select.innerHTML = '<option value="all">Все терминалы</option>' + devices.map(device =>
        `<option value="${escapeHtml(device.key)}">${escapeHtml(device.label || device.key)}</option>`
    ).join('');
    select.value = Array.from(select.options).some(option => option.value === currentValue) ? currentValue : 'all';
}

function renderBridgeResultsList() {
    const list = document.getElementById('bridgeResultsList');
    if (!list) return;
    const deviceFilter = document.getElementById('bridgeResultsDeviceFilter')?.value || 'all';
    const type = document.getElementById('bridgeResultsTypeFilter')?.value || 'errors';
    const search = (document.getElementById('bridgeResultsSearch')?.value || '').trim().toLowerCase();
    const devices = Object.values(lastBridgeProgress?.devices || {})
        .filter(device => deviceFilter === 'all' || device.key === deviceFilter);

    const rows = [];
    devices.forEach(device => {
        const items = device.results?.[type] || [];
        items.forEach(item => {
            const text = `${item.employeeNo || ''} ${item.fullName || ''} ${item.reason || ''} ${item.detail || ''}`.toLowerCase();
            if (search && !text.includes(search)) return;
            rows.push({ device, item });
        });
    });

    if (!rows.length) {
        list.innerHTML = '<div style="padding:18px; color:var(--theme-text-secondary);">Записей нет.</div>';
        return;
    }

    const typeColor = type === 'success' ? '#16a34a' : (type === 'errors' ? '#dc2626' : '#92400e');
    const typeLabel = type === 'success' ? 'Успешно' : (type === 'errors' ? 'Ошибка' : 'Отклонено');
    list.innerHTML = rows.map(({ device, item }) => `
        <div class="bridge-result-row">
            <div class="bridge-result-device">${escapeHtml(device.label || device.key)}</div>
            <div>${escapeHtml(item.employeeNo || '—')}</div>
            <div>
                <div class="bridge-result-name">${escapeHtml(item.fullName || '—')}</div>
                <div class="bridge-result-detail">${escapeHtml(item.reason || item.detail || '')}</div>
            </div>
            <div class="bridge-result-status" style="color:${typeColor};">${typeLabel}</div>
        </div>
    `).join('');
}

function formatUptime(seconds) {
    const total = Number(seconds || 0);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}д ${hours}ч`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
}

function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return isoStr;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
    } catch {
        return isoStr;
    }
}

function translateReason(reason) {
    if (!reason) return 'Автоматически';
    if (reason === 'manual') return 'Вручную (UI)';
    if (reason === 'settings_updated') return 'Обновление настроек';
    if (reason === 'startup') return 'Запуск моста';
    if (reason.startsWith('daily-')) return 'По расписанию (03:00)';
    if (reason === 'student_created') return 'Новый ученик';
    if (reason === 'student_updated') return 'Ученик обновлен';
    if (reason === 'student_deleted') return 'Ученик удален';
    if (reason === 'student_photo_deleted') return 'Фото ученика удалено';
    if (reason === 'staff_created') return 'Новый сотрудник';
    if (reason === 'staff_updated') return 'Сотрудник обновлен';
    if (reason === 'staff_deleted') return 'Сотрудник удален';
    if (reason === 'payment_added') return 'Оплата добавлена';
    if (reason === 'payment_updated') return 'Оплата обновлена';
    if (reason === 'payment_deleted') return 'Оплата удалена';
    if (reason === 'payment_refunded') return 'Возврат оплаты';
    if (reason === 'monthly_payment_added') return 'Месячная оплата';
    if (reason === 'change') return 'Изменение данных';
    return reason;
}

function calculateDuration(pickedStr, finishedStr, createdStr, status) {
    if (status === 'pending') return 'В очереди...';
    if (status === 'processing') return 'Выполняется...';
    if (!finishedStr) return '—';

    const end = new Date(finishedStr);
    const start = new Date(pickedStr || createdStr);
    if (isNaN(end.getTime()) || isNaN(start.getTime())) return '—';

    const diffMs = end - start;
    if (diffMs < 0) return '—';

    const diffSeconds = Math.round(diffMs / 1000);
    if (diffSeconds < 60) {
        return `${diffSeconds} сек`;
    }
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return `${minutes} мин ${seconds} сек`;
}

function showHikvisionLog(id, createdTime, logText) {
    const modal = document.getElementById('hikvisionLogModal');
    const idSpan = document.getElementById('hikLogModalId');
    const timeSpan = document.getElementById('hikLogModalTime');
    const textEl = document.getElementById('hikLogModalText');

    if (modal && idSpan && timeSpan && textEl) {
        idSpan.textContent = `#${id}`;
        timeSpan.textContent = formatDateTime(createdTime);
        textEl.textContent = logText
            ? String(logText).split('\n').map(formatBridgeLogMessage).join('\n')
            : 'Нет записей в логе.';
        modal.style.display = 'block';
    }
}

// Экспортируем функцию глобально
window.loadSyncHistory = loadSyncHistory;
window.showHikvisionLog = showHikvisionLog;
