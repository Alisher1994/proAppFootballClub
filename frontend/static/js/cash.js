// Хранилище данных
let allTransfers = [];
const cashEditIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const cashTrashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
let currentBalance = 0;
let cashDefaultFilterApplied = false;

function parseCashAmount(value) {
    const normalized = String(value || '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCashAmount(value) {
    const amount = typeof value === 'number' ? value : parseCashAmount(value);
    if (!amount) return '';
    return amount.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatCashAmountInput(inputEl) {
    if (!inputEl) return;
    inputEl.value = formatCashAmount(inputEl.value);
}

function attachCashAmountFormatting() {
    const amountInput = document.getElementById('transfer-amount');
    if (!amountInput || amountInput.dataset.amountFormattingAttached === '1') return;
    amountInput.dataset.amountFormattingAttached = '1';
    amountInput.addEventListener('input', () => {
        const cursorAtEnd = amountInput.selectionStart === amountInput.value.length;
        const raw = amountInput.value.replace(/[^\d,.-]/g, '');
        amountInput.value = raw;
        if (cursorAtEnd) amountInput.setSelectionRange(amountInput.value.length, amountInput.value.length);
    });
    amountInput.addEventListener('blur', () => formatCashAmountInput(amountInput));
}

// Загрузка баланса кассы
async function loadCashBalance() {
    try {
        const response = await fetch('/api/cash/balance');
        const data = await response.json();
        currentBalance = data.balance || 0;
        
        // Обновить поле остатка в модальном окне
        const balanceInput = document.getElementById('transfer-balance');
        if (balanceInput) {
            // Форматируем число для отображения (с пробелами и запятыми)
            balanceInput.value = currentBalance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' сум';
        }
        
        // Автоматически подставить остаток в поле суммы при открытии модального окна
        const amountInput = document.getElementById('transfer-amount');
        if (amountInput && !amountInput.value) {
            amountInput.value = formatCashAmount(currentBalance);
        }
        
        return data;
    } catch (error) {
        console.error('Ошибка загрузки баланса:', error);
        return null;
    }
}

// Загрузка списка передач
async function loadCashTransfers() {
    try {
        const dateFrom = document.getElementById('cash-date-from')?.value || '';
        const dateTo = document.getElementById('cash-date-to')?.value || '';
        const recipient = document.getElementById('cash-recipient-filter')?.value || '';
        
        let url = '/api/cash/transfers?';
        if (dateFrom) url += `date_from=${dateFrom}&`;
        if (dateTo) url += `date_to=${dateTo}&`;
        if (recipient) url += `recipient=${encodeURIComponent(recipient)}&`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Сервер вернул не JSON ответ');
        }
        
        const data = await response.json();
        
        // Проверяем, что data - это массив
        if (Array.isArray(data)) {
            allTransfers = data;
        } else if (data.error) {
            throw new Error(data.error);
        } else {
            allTransfers = [];
        }
        
        renderTransfersTable();
    } catch (error) {
        console.error('Ошибка загрузки передач:', error);
        const tbody = document.getElementById('cash-transfers-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="info-text">Ошибка загрузки данных: ${error.message}</td></tr>`;
        }
        allTransfers = [];
    }
}

// Отображение таблицы передач
function renderTransfersTable() {
    const tbody = document.getElementById('cash-transfers-table-body');
    if (!tbody) return;
    
    if (allTransfers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="info-text">Записей не найдено</td></tr>';
        return;
    }
    
    tbody.innerHTML = allTransfers.map(transfer => {
        const date = new Date(transfer.transfer_date);
        const dateStr = date.toLocaleDateString('ru-RU');
        
        return `
            <tr>
                <td>${dateStr}</td>
                <td>${escapeHtml(transfer.recipient)}</td>
                <td style="text-align: right; font-weight: 600;">${transfer.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} сум</td>
                <td>${transfer.notes ? escapeHtml(transfer.notes) : '-'}</td>
                <td>${transfer.creator_name || 'Неизвестно'}</td>
                <td>
                    <button class="btn-info edit-transfer-btn" data-transfer-id="${transfer.id}" style="margin-right: 8px;" title="Изменить">${cashEditIcon}</button>
                    <button class="btn-danger delete-transfer-btn" data-transfer-id="${transfer.id}" title="Удалить">${cashTrashIcon}</button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Добавить обработчики событий для кнопок
    document.querySelectorAll('.edit-transfer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const transferId = parseInt(e.target.closest('.edit-transfer-btn').dataset.transferId);
            editTransfer(transferId);
        });
    });
    
    document.querySelectorAll('.delete-transfer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const transferId = parseInt(e.target.closest('.delete-transfer-btn').dataset.transferId);
            deleteTransfer(transferId);
        });
    });
}

// Открыть модальное окно для добавления
function openAddTransferModal() {
    const modal = document.getElementById('transferModal');
    const title = document.getElementById('transferModalTitle');
    const form = document.getElementById('transferForm');
    const editId = document.getElementById('edit-transfer-id');
    
    if (modal && title && form && editId) {
        title.textContent = 'Добавить передачу денег';
        editId.value = '';
        form.reset();
        
        // Установить управляющего по умолчанию
        const recipientInput = document.getElementById('transfer-recipient');
        if (recipientInput) {
            recipientInput.value = 'Жавлон ака';
        }
        
        // Установить дату по умолчанию (сегодня)
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('transfer-date');
        if (dateInput) {
            dateInput.value = today;
        }
        
        // Загрузить баланс и подставить в поле суммы
        loadCashBalance().then(() => {
            const amountInput = document.getElementById('transfer-amount');
            if (amountInput) {
                amountInput.value = formatCashAmount(currentBalance);
            }
        });
        
        modal.style.display = 'flex';
    }
}

// Открыть модальное окно для редактирования
async function editTransfer(transferId) {
    const transfer = allTransfers.find(t => t.id === transferId);
    if (!transfer) return;
    
    const modal = document.getElementById('transferModal');
    const title = document.getElementById('transferModalTitle');
    const form = document.getElementById('transferForm');
    const editId = document.getElementById('edit-transfer-id');
    
    if (modal && title && form && editId) {
        title.textContent = 'Редактировать передачу денег';
        editId.value = transferId;
        
        // Заполнить форму данными
        document.getElementById('transfer-amount').value = formatCashAmount(transfer.amount);
        document.getElementById('transfer-recipient').value = transfer.recipient;
        
        const transferDate = new Date(transfer.transfer_date);
        document.getElementById('transfer-date').value = transferDate.toISOString().split('T')[0];
        
        document.getElementById('transfer-notes').value = transfer.notes || '';
        
        // Загрузить баланс (для информации)
        await loadCashBalance();
        
        modal.style.display = 'flex';
    }
}

// Закрыть модальное окно
function closeTransferModal() {
    const modal = document.getElementById('transferModal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('transferForm');
        if (form) {
            form.reset();
        }
    }
}

// Сохранение передачи (создание или обновление)
async function saveTransfer(event) {
    event.preventDefault();
    
    const editId = document.getElementById('edit-transfer-id').value;
    const amount = parseCashAmount(document.getElementById('transfer-amount').value);
    const recipient = document.getElementById('transfer-recipient').value.trim();
    const transferDate = document.getElementById('transfer-date').value;
    const notes = document.getElementById('transfer-notes').value.trim();
    
    if (!amount || amount <= 0) {
        alert('Введите корректную сумму');
        return;
    }
    
    if (!recipient) {
        alert('Введите имя управляющего');
        return;
    }
    
    try {
        let response;
        if (editId) {
            // Обновление
            response = await fetch(`/api/cash/transfers/${editId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amount,
                    recipient: recipient,
                    transfer_date: transferDate,
                    notes: notes
                })
            });
        } else {
            // Создание
            response = await fetch('/api/cash/transfers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amount,
                    recipient: recipient,
                    transfer_date: transferDate,
                    notes: notes
                })
            });
        }
        
        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }
        
        const result = await response.json();
        
        if (result.success) {
            closeTransferModal();
            await loadCashTransfers();
            await loadCashBalance();
            alert(result.message || 'Операция выполнена успешно');
        } else {
            alert(result.message || 'Ошибка при сохранении');
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        alert(`Ошибка при сохранении данных: ${error.message || error}`);
    }
}

// Удаление передачи
async function deleteTransfer(transferId) {
    if (!confirm('Вы уверены, что хотите удалить эту передачу денег?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/cash/transfers/${transferId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadCashTransfers();
            await loadCashBalance();
            alert(result.message || 'Передача успешно удалена');
        } else {
            alert(result.message || 'Ошибка при удалении');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка при удалении данных');
    }
}

// Переключение фильтра
function toggleCashFilter() {
    // Проверка на мобильное устройство
    if (window.innerWidth <= 768) {
        if (window.openFilterModal) {
            window.openFilterModal('cashFilterPanel', 'Фильтры кассы');
        }
        return;
    }

    const filterPanel = document.getElementById('cashFilterPanel');
    const filterToggleBtn = document.getElementById('cashFilterToggleBtn');
    const filterToggleText = document.getElementById('cashFilterToggleText');
    
    if (filterPanel && filterToggleBtn && filterToggleText) {
        if (filterPanel.style.display === 'none') {
            filterPanel.style.display = 'block';
            filterToggleText.textContent = 'Скрыть фильтр';
            filterToggleBtn.classList.add('active');
        } else {
            filterPanel.style.display = 'none';
            filterToggleText.textContent = 'Фильтр';
            filterToggleBtn.classList.remove('active');
        }
    }
}

// Применить фильтры
function applyCashFilters() {
    loadCashTransfers();
}

// Сбросить фильтры
function resetCashFilters() {
    document.getElementById('cash-date-from').value = '';
    document.getElementById('cash-date-to').value = '';
    document.getElementById('cash-recipient-filter').value = '';
    loadCashTransfers();
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
    attachCashAmountFormatting();
    // Загрузить данные
    if (!cashDefaultFilterApplied) {
        const todayDate = new Date();
        const startOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1).toISOString().split('T')[0];
        const today = todayDate.toISOString().split('T')[0];
        const fromInput = document.getElementById('cash-date-from');
        const toInput = document.getElementById('cash-date-to');
        if (fromInput && !fromInput.value) fromInput.value = startOfMonth;
        if (toInput && !toInput.value) toInput.value = today;
        cashDefaultFilterApplied = true;
    }

    loadCashBalance();
    loadCashTransfers();
    
    // Обработчики событий
    const addBtn = document.getElementById('addTransferBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddTransferModal);
    }
    
    const filterToggleBtn = document.getElementById('cashFilterToggleBtn');
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', toggleCashFilter);
    }
    
    const form = document.getElementById('transferForm');
    if (form) {
        form.addEventListener('submit', saveTransfer);
    }
    
    // Закрытие модального окна при клике вне его
    const modal = document.getElementById('transferModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTransferModal();
            }
        });
    }
});







