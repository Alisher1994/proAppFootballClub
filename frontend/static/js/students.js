// Переключение поля причины для чёрного списка
function toggleBlacklistReason() {
    const statusSelect = document.getElementById('statusSelect');
    const blacklistBlock = document.getElementById('blacklistReasonBlock');

    if (statusSelect && blacklistBlock) {
        if (statusSelect.value === 'blacklist') {
            blacklistBlock.style.display = 'block';
        } else {
            blacklistBlock.style.display = 'none';
        }
    }
}

// Переключение поля причины для редактирования
function toggleEditBlacklistReason() {
    const statusSelect = document.getElementById('edit_statusSelect');
    const blacklistBlock = document.getElementById('edit_blacklistReasonBlock');

    if (statusSelect && blacklistBlock) {
        if (statusSelect.value === 'blacklist') {
            blacklistBlock.style.display = 'block';
        } else {
            blacklistBlock.style.display = 'none';
        }
    }
}

function buildFullName(lastName, firstName, middleName) {
    const parts = [lastName, firstName, middleName]
        .map(part => (part || '').trim())
        .filter(Boolean);
    return parts.join(' ');
}

function splitFullName(fullName) {
    if (!fullName) {
        return { last: '', first: '', middle: '' };
    }
    const parts = fullName.trim().split(/\s+/);
    const last = parts.shift() || '';
    const first = parts.shift() || '';
    const middle = parts.join(' ');
    return { last, first, middle };
}

const DAY_LABELS = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' };

function formatScheduleTimeLabel(scheduleTime) {
    if (!scheduleTime) return '--:--';

    if (typeof scheduleTime === 'string' && scheduleTime.trim().startsWith('{')) {
        try {
            const timeMap = JSON.parse(scheduleTime);
            const entries = Object.entries(timeMap);
            const uniqueTimes = [...new Set(entries.map(([, time]) => time))];

            if (uniqueTimes.length === 1) {
                return uniqueTimes[0];
            }

            return entries.map(([day, time]) => `${DAY_LABELS[day] || day} ${time}`).join(', ');
        } catch {
            return scheduleTime;
        }
    }

    return scheduleTime;
}

// Загрузка списков при открытии формы
async function loadFormData() {
    // Загрузить города
    try {
        const citiesResponse = await fetch('/api/locations/cities');
        const cities = await citiesResponse.json();

        const citySelect = document.getElementById('citySelect');
        citySelect.innerHTML = '<option value="">Выберите город</option>' +
            cities.map(city => `<option value="${city}">${city}</option>`).join('');
    } catch (error) {
        console.error('Ошибка загрузки городов:', error);
    }

    // Загрузить группы
    try {
        const groupsResponse = await fetch('/api/groups');
        const groups = await groupsResponse.json();

        const groupSelect = document.getElementById('groupSelect');
        groupSelect.innerHTML = '<option value="">Без группы</option>' +
            groups.map(g => {
                const currentCount = g.active_student_count || 0;
                const maxCount = g.max_students || '∞';
                const timeStr = formatScheduleTimeLabel(g.schedule_time);
                return `<option value="${g.id}">${g.name} - ${timeStr} - ${currentCount}/${maxCount}</option>`;
            }).join('');
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }

    // Загрузить тарифы
    try {
        const tariffsResponse = await fetch('/api/tariffs');
        const tariffs = await tariffsResponse.json();

        const tariffSelect = document.getElementById('tariffSelect');
        tariffSelect.innerHTML = '<option value="">Без тарифа</option>' +
            tariffs.map(t => `<option value="${t.id}">${t.name} - ${parseInt(t.price).toLocaleString('ru-RU')} сум (${t.lessons_count} занятий)</option>`).join('');
    } catch (error) {
        console.error('Ошибка загрузки тарифов:', error);
    }
}

// Обработчик выбора города
document.getElementById('citySelect')?.addEventListener('change', async (e) => {
    const city = e.target.value;
    const districtSelect = document.getElementById('districtSelect');

    if (!city) {
        districtSelect.innerHTML = '<option value="">Сначала выберите город</option>';
        districtSelect.disabled = true;
        return;
    }

    try {
        const response = await fetch(`/api/locations/districts/${encodeURIComponent(city)}`);
        const districts = await response.json();

        districtSelect.innerHTML = '<option value="">Выберите район</option>' +
            districts.map(d => `<option value="${d}">${d}</option>`).join('');
        districtSelect.disabled = false;
    } catch (error) {
        console.error('Ошибка загрузки районов:', error);
    }
});

// Загрузка данных для формы редактирования
async function loadEditFormData() {
    // Загрузить города
    try {
        const citiesResponse = await fetch('/api/locations/cities');
        const cities = await citiesResponse.json();

        const citySelect = document.getElementById('edit_citySelect');
        citySelect.innerHTML = '<option value="">Выберите город</option>' +
            cities.map(city => `<option value="${city}">${city}</option>`).join('');
    } catch (error) {
        console.error('Ошибка загрузки городов:', error);
    }

    // Загрузить группы
    try {
        const groupsResponse = await fetch('/api/groups');
        const groups = await groupsResponse.json();

        const groupSelect = document.getElementById('edit_groupSelect');
        groupSelect.innerHTML = '<option value="">Без группы</option>' +
            groups.map(g => {
                const currentCount = g.active_student_count || 0;
                const maxCount = g.max_students || '∞';
                const timeStr = formatScheduleTimeLabel(g.schedule_time);
                return `<option value="${g.id}">${g.name} - ${timeStr} - ${currentCount}/${maxCount}</option>`;
            }).join('');
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }

    // Загрузить тарифы
    try {
        const tariffsResponse = await fetch('/api/tariffs');
        const tariffs = await tariffsResponse.json();

        const tariffSelect = document.getElementById('edit_tariffSelect');
        tariffSelect.innerHTML = '<option value="">Без тарифа</option>' +
            tariffs.map(t => `<option value="${t.id}">${t.name} - ${parseInt(t.price).toLocaleString('ru-RU')} сум (${t.lessons_count} занятий)</option>`).join('');
    } catch (error) {
        console.error('Ошибка загрузки тарифов:', error);
    }
}

// Загрузка районов для формы редактирования
async function loadEditDistricts(city) {
    const districtSelect = document.getElementById('edit_districtSelect');

    if (!city) {
        districtSelect.innerHTML = '<option value="">Сначала выберите город</option>';
        districtSelect.disabled = true;
        return;
    }

    try {
        const response = await fetch(`/api/locations/districts/${encodeURIComponent(city)}`);
        const districts = await response.json();

        districtSelect.innerHTML = '<option value="">Выберите район</option>' +
            districts.map(d => `<option value="${d}">${d}</option>`).join('');
        districtSelect.disabled = false;
    } catch (error) {
        console.error('Ошибка загрузки районов:', error);
    }
}

// Обработчик выбора города в форме редактирования
document.getElementById('edit_citySelect')?.addEventListener('change', async (e) => {
    const city = e.target.value;
    await loadEditDistricts(city);
});

// Модальные окна
const addStudentModal = document.getElementById('addStudentModal');
const editStudentModal = document.getElementById('editStudentModal');
const paymentModal = document.getElementById('paymentModal');
const addStudentBtn = document.getElementById('addStudentBtn');
const closeBtns = document.querySelectorAll('.close');

// Открыть модалку добавления ученика
addStudentBtn.addEventListener('click', () => {
    loadFormData();
    document.getElementById('addStudentForm').reset();
    document.getElementById('last_name').value = '';
    document.getElementById('first_name').value = '';
    document.getElementById('middle_name').value = '';
    document.getElementById('full_name_hidden').value = '';
    const admissionInput = document.getElementById('admission_date');
    if (admissionInput) {
        admissionInput.value = new Date().toISOString().split('T')[0];
    }
    // Сброс превью фото
    const addPreview = document.getElementById('add-photo-preview');
    if (addPreview) {
        addPreview.innerHTML = `
            <div class="photo-placeholder">
                <button type="button" class="photo-select-btn" id="add-photo-select-btn">
                    <span class="photo-select-icon">+</span>
                    <span class="photo-select-text">Выбрать</span>
                </button>
                <small class="photo-hint">Или нажмите в любом месте и вставьте фото (Ctrl+V)</small>
            </div>
        `;
        // Переинициализировать компонент
        setTimeout(() => {
            initPhotoUpload('add-photo-upload', 'add_photo_input', 'add-photo-preview', 'add-photo-area', 'add-photo-select-btn');
        }, 100);
    }
    addStudentModal.style.display = 'block';
});

// Закрыть модалки
closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (addStudentModal.style.display === 'block') {
            addStudentModal.style.display = 'none';
            document.getElementById('addStudentForm').reset();
            // Сброс превью фото
            const addPreview = document.getElementById('add-photo-preview');
            if (addPreview) {
                addPreview.innerHTML = `
                    <div class="photo-placeholder">
                        <button type="button" class="photo-select-btn" id="add-photo-select-btn">
                            <span class="photo-select-icon">+</span>
                            <span class="photo-select-text">Выбрать</span>
                        </button>
                        <small class="photo-hint">Или нажмите в любом месте и вставьте фото (Ctrl+V)</small>
                    </div>
                `;
                // Переинициализировать компонент
                setTimeout(() => {
                    initPhotoUpload('add-photo-upload', 'add_photo_input', 'add-photo-preview', 'add-photo-area', 'add-photo-select-btn');
                }, 100);
            }
        }
        if (editStudentModal.style.display === 'block') {
            editStudentModal.style.display = 'none';
        }
        paymentModal.style.display = 'none';
    });
});

// Закрыть при клике вне модалки
window.addEventListener('click', (e) => {
    if (e.target === addStudentModal) addStudentModal.style.display = 'none';
    if (e.target === editStudentModal) editStudentModal.style.display = 'none';
    if (e.target === paymentModal) paymentModal.style.display = 'none';
});

// Добавить ученика
document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const lastName = document.getElementById('last_name').value;
    const firstName = document.getElementById('first_name').value;
    const middleName = document.getElementById('middle_name').value;
    const fullName = buildFullName(lastName, firstName, middleName);
    document.getElementById('full_name_hidden').value = fullName;

    // Проверка наличия фото
    const photoInput = document.getElementById('add_photo_input');
    if (!photoInput.files || photoInput.files.length === 0) {
        alert('Пожалуйста, загрузите фото ученика');
        const container = document.getElementById('add-photo-upload');
        if (container) {
            container.focus();
            container.classList.add('error');
            setTimeout(() => container.classList.remove('error'), 2000);
        }
        return;
    }

    const formData = new FormData(e.target);

    try {
        const response = await fetch('/api/students/add', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            alert('Ученик успешно добавлен!');
            location.reload();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Редактировать ученика (отправка формы)
document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentId = document.getElementById('edit_student_id').value;
    const lastName = document.getElementById('edit_last_name').value;
    const firstName = document.getElementById('edit_first_name').value;
    const middleName = document.getElementById('edit_middle_name').value;
    const fullName = buildFullName(lastName, firstName, middleName);
    document.getElementById('edit_full_name').value = fullName;
    const formData = new FormData(e.target);

    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'PUT',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            alert('✓ Данные ученика обновлены!');
            location.reload();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Открыть модалку оплаты
// Обработчик кнопок добавления оплаты (новая версия)
document.addEventListener('click', async function (e) {
    const btn = e.target.closest('.add-payment-btn');
    if (!btn) return;

    const studentId = btn.getAttribute('data-student-id');
    if (!studentId) return;

    e.preventDefault();

    // Установить ID ученика
    document.getElementById('payment_student_id').value = studentId;

    // Загрузить настройки клуба и данные ученика
    let clubSettings = { block_future_payments: false };
    let studentData = { admission_date: null };

    try {
        const settingsResponse = await fetch('/api/club-settings');
        if (settingsResponse.ok) {
            clubSettings = await settingsResponse.json();
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек клуба:', error);
    }

    try {
        const studentResponse = await fetch(`/api/students/${studentId}`);
        if (studentResponse.ok) {
            studentData = await studentResponse.json();
        }
    } catch (error) {
        console.error('Ошибка загрузки данных ученика:', error);
    }

    // Сохранить данные для использования в других функциях
    window.currentPaymentSettings = {
        blockFuturePayments: clubSettings.block_future_payments || false,
        admissionDate: studentData.admission_date ? new Date(studentData.admission_date) : null,
        studentId: studentId
    };

    // Заполнить год (текущий год по умолчанию)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const yearSelect = document.getElementById('payment_year');
    yearSelect.innerHTML = '<option value="">Выберите год</option>';

    // Определить диапазон лет
    let minYear = currentYear - 1;
    let maxYear = currentYear + 1;

    // Если есть дата принятия, начинать с года принятия
    if (window.currentPaymentSettings.admissionDate) {
        const admissionYear = window.currentPaymentSettings.admissionDate.getFullYear();
        minYear = Math.min(minYear, admissionYear);
    }

    // Добавить годы
    for (let year = minYear; year <= maxYear; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    }

    // Обновить список месяцев для выбранного года
    updateMonthsList(currentYear);

    // Установить дату оплаты (сегодня)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payment_date').value = today;

    // Сбросить форму
    document.getElementById('payment_month').value = '';
    document.getElementById('payment_amount').value = '';
    document.getElementById('payment_notes').value = '';

    // Сбросить кнопки типов оплаты на "Наличные"
    document.querySelectorAll('.payment-type-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.border = '2px solid #e2e8f0';
        btn.style.background = 'white';
        btn.style.color = '#4a5568';
    });
    const cashBtn = document.querySelector('.payment-type-btn[data-payment-type="cash"]');
    if (cashBtn) {
        cashBtn.classList.add('active');
        cashBtn.style.border = '2px solid #667eea';
        cashBtn.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)';
        cashBtn.style.color = '#667eea';
    }
    document.getElementById('selected_payment_type').value = 'cash';

    const debtInfoBlock = document.getElementById('month-debt-info-block');
    if (debtInfoBlock) debtInfoBlock.style.display = 'none';

    // Показать модалку
    paymentModal.style.display = 'block';
});

// Функция обновления списка месяцев с учетом ограничений
function updateMonthsList(selectedYear) {
    if (!window.currentPaymentSettings) return;

    const monthSelect = document.getElementById('payment_month');
    if (!monthSelect) return;

    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const { blockFuturePayments, admissionDate } = window.currentPaymentSettings;

    // Определить минимальный месяц
    let minMonth = 1;
    let minYear = null;

    if (admissionDate) {
        minYear = admissionDate.getFullYear();
        minMonth = admissionDate.getMonth() + 1;
    }

    // Сохранить текущее значение месяца
    const currentValue = monthSelect.value;
    monthSelect.innerHTML = '<option value="">Выберите месяц</option>';

    // Заполнить месяцы
    for (let month = 1; month <= 12; month++) {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = monthNames[month - 1];

        // Проверить, должен ли месяц быть неактивным
        let isDisabled = false;

        // Проверка 1: Месяц до даты принятия
        if (minYear !== null) {
            if (selectedYear < minYear || (selectedYear === minYear && month < minMonth)) {
                isDisabled = true;
            }
        }

        // Проверка 2: Будущий месяц (если запрещено)
        if (blockFuturePayments && !isDisabled) {
            if (selectedYear > currentYear || (selectedYear === currentYear && month > currentMonth)) {
                isDisabled = true;
            }
        }

        if (isDisabled) {
            option.disabled = true;
            option.style.color = '#9ca3af';
            option.textContent += ' (недоступен)';
        }

        monthSelect.appendChild(option);
    }

    // Восстановить значение, если оно было и не стало недоступным
    if (currentValue) {
        const option = monthSelect.querySelector(`option[value="${currentValue}"]`);
        if (option && !option.disabled) {
            monthSelect.value = currentValue;
        }
    }
}

// Обработчик изменения года (через делегирование для динамически добавляемых элементов)
document.addEventListener('change', function (e) {
    if (e.target.id === 'payment_year') {
        const selectedYear = parseInt(e.target.value);
        if (selectedYear) {
            updateMonthsList(selectedYear);
            // Очистить выбранный месяц если он стал недоступным
            const monthSelect = document.getElementById('payment_month');
            if (monthSelect) {
                const selectedOption = monthSelect.querySelector('option:checked');
                if (selectedOption && selectedOption.disabled) {
                    monthSelect.value = '';
                    // Скрыть блок информации о долге, если месяц не выбран
                    const debtInfoBlock = document.getElementById('month-debt-info-block');
                    if (debtInfoBlock) debtInfoBlock.style.display = 'none';
                }
            }
            // Обновить информацию о долге
            if (typeof updateMonthDebtInfo === 'function') {
                updateMonthDebtInfo();
            }
        }
    }
});

// Глобальные переменные для управления годом и выбранным месяцем
let currentPaymentYear = new Date().getFullYear();
let selectedMonth = null;
let studentPaymentsData = {};
let selectedMonthInfo = null; // хранит остаток и тариф для проверки суммы
let paymentClubSettings = { block_future_payments: false };

async function ensurePaymentSettingsLoaded() {
    if (paymentClubSettings.__loaded) return;
    try {
        const resp = await fetch('/api/club-settings');
        const data = await resp.json();
        paymentClubSettings = { ...data, __loaded: true };
    } catch (e) {
        console.error('Не удалось загрузить настройки клуба для оплат:', e);
        paymentClubSettings = { block_future_payments: false, __loaded: true };
    }
}

// Инициализация помесячного отображения оплаты
async function initMonthlyPaymentView(studentId, tariffPrice) {
    await ensurePaymentSettingsLoaded();
    currentPaymentYear = new Date().getFullYear();
    selectedMonth = null;

    // Загрузить данные о платежах ученика
    try {
        const response = await fetch(`/api/students/${studentId}/monthly-payments`);
        const data = await response.json();
        // Новый формат API возвращает объект с payments_by_month
        studentPaymentsData = data.payments_by_month || {};
    } catch (error) {
        console.error('Ошибка загрузки платежей:', error);
        studentPaymentsData = {};
    }

    // Загрузить дату принятия ученика
    let admissionDate = null;
    try {
        const studentResponse = await fetch(`/api/students/${studentId}`);
        const studentData = await studentResponse.json();
        admissionDate = studentData.admission_date ? new Date(studentData.admission_date) : null;
    } catch (error) {
        console.error('Ошибка загрузки данных ученика:', error);
    }

    // Сохранить дату принятия глобально
    window.studentAdmissionDate = admissionDate;

    // Обновить интерфейс
    updateYearDisplay();
    renderMonthlyGrid(tariffPrice);
    hidePaymentInput();
}

// Обновить отображение года
function updateYearDisplay() {
    document.getElementById('currentYear').textContent = currentPaymentYear;
    document.getElementById('prevYear').textContent = currentPaymentYear - 1;
    document.getElementById('nextYear').textContent = currentPaymentYear + 1;
}

// Отрисовать сетку месяцев
function renderMonthlyGrid(tariffPrice) {
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const monthlyGrid = document.getElementById('monthlyPayments');
    monthlyGrid.innerHTML = '';

    // Определить минимально доступный месяц на основе admission_date
    let minYear = 1900;
    let minMonth = 1;
    if (window.studentAdmissionDate) {
        const admission = new Date(window.studentAdmissionDate);
        minYear = admission.getFullYear();
        minMonth = admission.getMonth() + 1; // JS месяцы 0-based
    }

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;

    monthNames.forEach((monthName, index) => {
        const monthNumber = index + 1;
        const monthKey = `${currentPaymentYear}-${String(monthNumber).padStart(2, '0')}`;
        const monthData = studentPaymentsData[monthKey];

        // Получить данные из нового формата API
        const totalPaid = monthData ? monthData.total_paid : 0;
        const remainder = monthData ? monthData.remainder : tariffPrice;
        const isPaid = remainder === 0;

        // Проверить доступность месяца
        const isBeforeAdmission = (currentPaymentYear < minYear) ||
            (currentPaymentYear === minYear && monthNumber < minMonth);
        const isFuture = paymentClubSettings.block_future_payments && (
            currentPaymentYear > todayYear ||
            (currentPaymentYear === todayYear && monthNumber > todayMonth)
        );
        const isDisabled = isBeforeAdmission || isFuture;

        const monthCard = document.createElement('div');
        monthCard.className = 'month-payment-card';

        // Добавить классы для стилизации
        if (isDisabled) {
            monthCard.classList.add('disabled');
        } else if (isPaid) {
            monthCard.classList.add('paid');
        }

        // Определить статус и иконку
        let statusIcon = '';
        let statusText = '';
        let statusColor = '';

        if (isDisabled) {
            statusIcon = '🔒';
            statusText = 'Недоступно';
            statusColor = '#94a3b8';
        } else if (isPaid) {
            statusIcon = '✓';
            statusText = 'Оплачено';
            statusColor = '#10b981';
        } else {
            statusIcon = '⏳';
            statusText = 'Не оплачено';
            statusColor = '#f59e0b';
        }

        monthCard.innerHTML = `
            <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-weight: 700; font-size: 16px; color: ${isDisabled ? '#94a3b8' : '#1e293b'};">
                        ${monthName}
                    </div>
                    <div style="font-size: 14px; color: ${statusColor}; display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 16px;">${statusIcon}</span>
                        <span style="font-weight: 600;">${statusText}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 20px; font-size: 13px;">
                    <div style="color: #64748b;">
                        Сумма: <strong style="color: #475569; font-weight: 600;">${totalPaid.toLocaleString('ru-RU')} сум</strong>
                    </div>
                    <div style="font-weight: 600;">
                        Остаток: <strong style="color: ${remainder > 0 ? '#ef4444' : '#10b981'}; font-size: 14px;">${remainder.toLocaleString('ru-RU')} сум</strong>
                    </div>
                </div>
            </div>
            <div style="font-size: 20px; color: #cbd5e1; margin-left: 16px;">
                →
            </div>
        `;

        if (!isDisabled) {
            monthCard.addEventListener('click', () => {
                // Убрать выделение с других карточек
                document.querySelectorAll('.month-payment-card').forEach(card => {
                    card.classList.remove('selected');
                });
                // Добавить выделение к выбранной карточке
                monthCard.classList.add('selected');

                selectedMonth = { year: currentPaymentYear, month: monthNumber, name: monthName, key: monthKey };
                showPaymentInput(monthName, monthData, tariffPrice);
            });
        }

        monthlyGrid.appendChild(monthCard);
    });
}

// Показать форму ввода оплаты за выбранный месяц
function showPaymentInput(monthName, monthData, tariffPrice) {
    // monthData теперь это объект с payments, total_paid, remainder
    const existingPayments = monthData ? monthData.payments : [];
    const remainder = monthData ? monthData.remainder : tariffPrice;
    selectedMonthInfo = {
        remainder,
        tariffPrice
    };

    document.getElementById('selectedMonthName').textContent = monthName;
    document.getElementById('paymentInputSection').style.display = 'flex';
    document.getElementById('noMonthSelected').style.display = 'none';

    // Установить сегодняшнюю дату
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payment_date').value = today;

    // Очистить поля
    const paymentAmountInput = document.getElementById('payment_amount');
    if (paymentAmountInput) paymentAmountInput.value = '';
    const paymentNotesInput = document.getElementById('payment_notes');
    if (paymentNotesInput) paymentNotesInput.value = '';

    // Сбросить кнопки типов оплаты на "Наличные"
    document.querySelectorAll('.payment-type-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.border = '2px solid #e2e8f0';
        btn.style.background = 'white';
        btn.style.color = '#4a5568';
    });
    const cashBtn = document.querySelector('.payment-type-btn[data-payment-type="cash"]');
    if (cashBtn) {
        cashBtn.classList.add('active');
        cashBtn.style.border = '2px solid #667eea';
        cashBtn.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)';
        cashBtn.style.color = '#667eea';
    }
    const selectedPaymentType = document.getElementById('selected_payment_type');
    if (selectedPaymentType) selectedPaymentType.value = 'cash';

    // Отобразить историю частичных платежей
    const historyDiv = document.getElementById('partialPaymentsHistory');
    if (existingPayments.length > 0) {
        historyDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0;">
                <span style="font-size: 18px;">📋</span>
                <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">История оплат</h4>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${existingPayments.map(p => `
                    <div class="payment-history-row" data-payment-id="${p.id || ''}" data-amount="${p.amount}" data-date="${p.date || ''}" data-notes="${p.notes || ''}" style="background: white; padding: 14px 16px; border-left: none; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); transition: all 0.2s ease;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
                                <span style="font-size: 14px; color: #64748b;">📅</span>
                                <strong style="color: #1e293b; font-size: 14px;">${p.date ? new Date(p.date).toLocaleDateString('ru-RU') : '—'}</strong>
                                <span style="color: #64748b;">•</span>
                                <strong style="color: #667eea; font-size: 15px; font-weight: 700;">${p.amount.toLocaleString('ru-RU')} сум</strong>
                            </div>
                            ${p.notes ? `<div style="margin-top: 6px; padding-left: 28px;"><small style="color: #64748b; font-size: 12px;">${p.notes}</small></div>` : ''}
                        </div>
                        ${p.id ? `
                            <div style="display: flex; gap: 6px;">
                                <button type="button" class="btn-small btn-info payment-edit-btn" data-payment-id="${p.id}" data-amount="${p.amount}" data-date="${p.date || ''}" data-notes="${p.notes || ''}" style="border-radius: 8px;">✏️</button>
                                <button type="button" class="btn-small btn-danger payment-delete-btn" data-payment-id="${p.id}" style="border-radius: 8px;">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        historyDiv.style.display = 'block';
    } else {
        historyDiv.style.display = 'none';
    }

    // Подсказка по остатку
    const amountInput = document.getElementById('payment_amount');
    if (amountInput) {
        if (remainder > 0) {
            amountInput.placeholder = `Осталось: ${remainder.toLocaleString('ru-RU')} сум`;
        } else {
            amountInput.placeholder = 'Дополнительная оплата';
        }
    }
}

// Обработчики переключения способа оплаты
document.getElementById('payment_method_cash')?.addEventListener('change', function () {
    if (this.checked) {
        document.getElementById('cash_payment_fields').style.display = 'block';
        document.getElementById('other_payment_fields').style.display = 'none';
    }
});

document.getElementById('payment_method_other')?.addEventListener('change', function () {
    if (this.checked) {
        document.getElementById('cash_payment_fields').style.display = 'none';
        document.getElementById('other_payment_fields').style.display = 'block';
    }
});

// Скрыть форму ввода
function hidePaymentInput() {
    document.getElementById('paymentInputSection').style.display = 'none';
    document.getElementById('noMonthSelected').style.display = 'flex';
    selectedMonth = null;
    selectedMonthInfo = null;

    // Убрать выделение со всех карточек
    document.querySelectorAll('.month-payment-card').forEach(card => {
        card.classList.remove('selected');
    });
}

// Обработчики кнопок переключения года
document.getElementById('prevYearBtn')?.addEventListener('click', () => {
    currentPaymentYear--;
    updateYearDisplay();
    const tariffPrice = parseInt(document.getElementById('student_tariff_price').value) || 500000;
    renderMonthlyGrid(tariffPrice);
    hidePaymentInput();
});

document.getElementById('nextYearBtn')?.addEventListener('click', () => {
    currentPaymentYear++;
    updateYearDisplay();
    const tariffPrice = parseInt(document.getElementById('student_tariff_price').value) || 500000;
    renderMonthlyGrid(tariffPrice);
    hidePaymentInput();
});

// Отправка формы оплаты (новая упрощенная версия)
document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentId = document.getElementById('payment_student_id').value;
    const year = document.getElementById('payment_year').value;
    const month = document.getElementById('payment_month').value;
    const paymentDate = document.getElementById('payment_date').value;
    const notes = document.getElementById('payment_notes').value;

    if (!year || !month) {
        alert('Выберите год и месяц для оплаты');
        return;
    }

    // Получить выбранный тип оплаты и сумму
    const paymentType = document.getElementById('selected_payment_type').value;
    const amount = parseFloat(document.getElementById('payment_amount').value);

    if (!amount || amount <= 0) {
        alert('Введите корректную сумму оплаты');
        return;
    }

    if (!paymentType) {
        alert('Выберите способ оплаты');
        return;
    }

    try {
        const response = await fetch('/api/students/add-monthly-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentId,
                year: parseInt(year),
                month: parseInt(month),
                payment_date: paymentDate,
                amount: amount,
                payment_type: paymentType,
                notes: notes
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('✓ Оплата успешно добавлена!');
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal) paymentModal.style.display = 'none';
            // Перезагрузить страницу для обновления истории
            location.reload();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Обработчик переключения способа оплаты (новые кнопки)
document.addEventListener('click', function (e) {
    const btn = e.target.closest('.payment-type-btn');
    if (!btn) return;

    e.preventDefault();

    const paymentType = btn.getAttribute('data-payment-type');

    // Убрать активный класс со всех кнопок
    document.querySelectorAll('.payment-type-btn').forEach(b => {
        b.classList.remove('active');
        b.style.border = '2px solid #e2e8f0';
        b.style.background = 'white';
        b.style.color = '#4a5568';
    });

    // Добавить активный класс к выбранной кнопке
    btn.classList.add('active');
    btn.style.border = '2px solid #667eea';
    btn.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)';
    btn.style.color = '#667eea';

    // Установить значение в скрытое поле
    document.getElementById('selected_payment_type').value = paymentType;
});

// Редактирование оплаты: открытие модалки по кнопке в истории (через делегирование событий)
// Убрано, так как элемент partialPaymentsHistory больше не используется в новой модалке
// Обработчик редактирования оплаты теперь обрабатывается через общий обработчик кликов выше

// Закрытие модалки редактирования оплаты
document.querySelector('.edit-payment-close')?.addEventListener('click', () => {
    document.getElementById('editPaymentModal').style.display = 'none';
});

// Сохранение изменений оплаты
document.getElementById('editPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const paymentId = document.getElementById('edit_payment_id').value;
    const amount = parseFloat(document.getElementById('edit_payment_amount').value);
    const paymentDate = document.getElementById('edit_payment_date').value;
    const notes = document.getElementById('edit_payment_notes').value;

    if (!amount || amount <= 0) {
        alert('Введите корректную сумму');
        return;
    }

    try {
        const resp = await fetch(`/api/payments/${paymentId}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount_paid: amount,
                payment_date: paymentDate,
                notes: notes
            })
        });
        const data = await resp.json();
        if (data.success) {
            alert('Оплата обновлена');
            location.reload();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Удаление оплаты из истории платежей (делегирование событий)
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.payment-delete-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const paymentId = btn.dataset.paymentId;

    if (!confirm('Вы уверены, что хотите удалить этот платеж?')) {
        return;
    }

    try {
        const response = await fetch(`/api/payments/${paymentId}/delete`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Платеж успешно удален!');
            location.reload(); // Перезагружаем страницу для обновления данных
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Не удалось удалить платеж'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Ошибка при удалении платежа');
    }
});

// Редактировать ученика
// Делегирование событий для кнопок редактирования (работает с динамическими элементами)
document.addEventListener('click', async (e) => {
    // Проверяем, кликнули ли на кнопку или на элемент внутри кнопки (SVG, path и т.д.)
    const btn = e.target.closest('.edit-student-btn');
    if (!btn) return;

    // Предотвращаем всплытие и действие по умолчанию
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const studentId = btn.getAttribute('data-student-id');
    if (!studentId) {
        console.error('Не найден data-student-id у кнопки редактирования');
        return;
    }

    try {
        const response = await fetch(`/api/students/${studentId}`);
        const student = await response.json();

        // Заполнить форму редактирования
        document.getElementById('edit_student_id').value = student.id;
        const nameParts = splitFullName(student.full_name || '');
        document.getElementById('edit_last_name').value = nameParts.last;
        document.getElementById('edit_first_name').value = nameParts.first;
        document.getElementById('edit_middle_name').value = nameParts.middle;
        document.getElementById('edit_full_name').value = student.full_name || '';
        document.getElementById('edit_student_number').value = student.student_number || '';
        document.getElementById('edit_phone').value = student.phone || '';
        document.getElementById('edit_parent_phone').value = student.parent_phone || '';
        document.getElementById('edit_street').value = student.street || '';
        document.getElementById('edit_house_number').value = student.house_number || '';
        document.getElementById('edit_birth_year').value = student.birth_year || '';
        document.getElementById('edit_passport_series').value = student.passport_series || '';
        document.getElementById('edit_passport_number').value = student.passport_number || '';
        document.getElementById('edit_passport_issued_by').value = student.passport_issued_by || '';
        document.getElementById('edit_passport_issue_date').value = student.passport_issue_date || '';
        document.getElementById('edit_passport_expiry_date').value = student.passport_expiry_date || '';
        document.getElementById('edit_admission_date').value = student.admission_date || '';
        document.getElementById('edit_club_funded').checked = student.club_funded || false;
        document.getElementById('edit_statusSelect').value = student.status || 'active';
        document.getElementById('edit_blacklist_reason').value = student.blacklist_reason || '';

        // Загрузить города и группы
        await loadEditFormData();

        // Установить город
        if (student.city) {
            document.getElementById('edit_citySelect').value = student.city;
            // Загрузить районы
            await loadEditDistricts(student.city);
            if (student.district) {
                document.getElementById('edit_districtSelect').value = student.district;
            }
        }

        // Установить группу
        if (student.group_id) {
            document.getElementById('edit_groupSelect').value = student.group_id;
        }

        // Установить тариф
        if (student.tariff_id) {
            document.getElementById('edit_tariffSelect').value = student.tariff_id;
        }

        // Заполнить параметры ученика (если функция доступна)
        if (typeof fillStudentParameters === 'function') {
            fillStudentParameters(student);
        }

        // Загрузить фото ученика
        const preview = document.getElementById('edit-photo-preview');
        if (preview) {
            if (student.photo_path) {
                const photoPath = student.photo_path.replace('frontend/static/', '').replace(/\\/g, '/');
                preview.innerHTML = `
                        <img src="/static/${photoPath}" alt="Current photo">
                        <button type="button" class="photo-delete-btn" onclick="deletePhoto('edit-photo-upload', 'edit_photo', 'edit-photo-preview', 'edit-photo-area', 'edit-photo-select-btn')">🗑️ Удалить фото</button>
                    `;
            } else {
                preview.innerHTML = `
                        <div class="photo-placeholder">
                            <button type="button" class="photo-select-btn" id="edit-photo-select-btn">
                                <span class="photo-select-icon">+</span>
                                <span class="photo-select-text">Выбрать</span>
                            </button>
                            <small class="photo-hint">Или нажмите в любом месте и вставьте фото (Ctrl+V)</small>
                        </div>
                    `;
                // Переинициализировать кнопку
                setTimeout(() => {
                    const newSelectBtn = document.getElementById('edit-photo-select-btn');
                    if (newSelectBtn) {
                        newSelectBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            document.getElementById('edit_photo').click();
                        });
                    }
                }, 100);
            }
        }

        // Показать/скрыть блок причины ЧС
        toggleEditBlacklistReason();

        // Открыть модальное окно
        document.getElementById('editStudentModal').style.display = 'block';

    } catch (error) {
        console.error('Ошибка загрузки ученика:', error);
        alert('Ошибка загрузки данных ученика');
    }
});

// Удалить ученика (делегирование событий для работы с динамическими элементами)
document.addEventListener('click', async (e) => {
    // Проверяем, кликнули ли на кнопку или на элемент внутри кнопки (SVG, path и т.д.)
    const btn = e.target.closest('.delete-student-btn');
    if (!btn) return;

    // Предотвращаем всплытие и действие по умолчанию
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const studentId = btn.getAttribute('data-student-id');
    const studentName = btn.getAttribute('data-student-name');

    if (!studentId) {
        console.error('Не найден data-student-id у кнопки удаления');
        return;
    }

    if (!confirm(`Вы уверены, что хотите удалить ученика "${studentName}"?\n\nЭто действие необратимо и удалит все связанные данные (платежи, посещения).`)) {
        return;
    }

    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            alert('✓ ' + data.message);
            location.reload();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка при удалении ученика');
    }
});

// ==================== PHOTO UPLOAD COMPONENT ====================

// Глобальная функция для удаления фото
window.deletePhoto = async function (containerId, inputId, previewId, areaId, selectBtnId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!input || !preview) return;

    // Если это форма редактирования, нужно удалить фото на сервере
    if (containerId === 'edit-photo-upload') {
        const studentId = document.getElementById('edit_student_id').value;
        if (studentId && !confirm('Вы уверены, что хотите удалить текущее фото ученика? Это также удалит данные для распознавания лиц.')) {
            return;
        }

        if (studentId) {
            try {
                const response = await fetch(`/api/students/${studentId}/delete-photo`, {
                    method: 'POST'
                });
                const result = await response.json();
                if (!result.success) {
                    alert('Ошибка при удалении фото на сервере: ' + result.message);
                    return;
                }
            } catch (error) {
                console.error('Ошибка:', error);
                alert('Не удалось удалить фото на сервере');
                return;
            }
        }
    }

    // Очистить input
    input.value = '';

    // Вернуть placeholder
    preview.innerHTML = `
        <div class="photo-placeholder">
            <button type="button" class="photo-select-btn" id="${selectBtnId}">
                <span class="photo-select-icon">+</span>
                <span class="photo-select-text">Выбрать</span>
            </button>
            <small class="photo-hint">Или нажмите в любом месте и вставьте фото (Ctrl+V)</small>
        </div>
    `;

    // Переинициализировать кнопку
    const newSelectBtn = document.getElementById(selectBtnId);
    if (newSelectBtn) {
        newSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetInput = document.getElementById(inputId);
            if (targetInput) targetInput.click();
        });
    }
};

// Инициализация компонента загрузки фото
function initPhotoUpload(containerId, inputId, previewId, areaId, selectBtnId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const area = document.getElementById(areaId);
    const selectBtn = document.getElementById(selectBtnId);

    if (!container || !input || !preview || !area || !selectBtn) return;

    // Функция для сжатия изображения
    async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(img.src); // Освобождаем память
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(img.src);
                reject(e);
            };
        });
    }

    // Функция для отображения превью
    async function showPreview(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Пожалуйста, выберите изображение');
            return;
        }

        // Показываем индикатор загрузки (опционально, но полезно)
        preview.innerHTML = '<div class="loading-spinner">⌛ Сжатие...</div>';

        try {
            // Сжимаем изображение (это решит проблему с долгим "зависанием" на мобильных)
            const compressedFile = await compressImage(file);

            // Используем createObjectURL для быстрого отображения превью
            const objectUrl = URL.createObjectURL(compressedFile);

            preview.innerHTML = `
                <img src="${objectUrl}" alt="Preview" onload="URL.revokeObjectURL('${objectUrl}')">
                <button type="button" class="photo-delete-btn" onclick="deletePhoto('${containerId}', '${inputId}', '${previewId}', '${areaId}', '${selectBtnId}')">🗑️ Удалить фото</button>
            `;

            // Обновляем input.files
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(compressedFile);
            input.files = dataTransfer.files;
        } catch (error) {
            console.error('Error in showPreview:', error);
            // Fallback: пробуем показать оригинал
            const objectUrl = URL.createObjectURL(file);
            preview.innerHTML = `
                <img src="${objectUrl}" alt="Preview" onload="URL.revokeObjectURL('${objectUrl}')">
                <button type="button" class="photo-delete-btn" onclick="deletePhoto('${containerId}', '${inputId}', '${previewId}', '${areaId}', '${selectBtnId}')">🗑️ Удалить фото</button>
            `;
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
        }
    }

    // Кнопка "Выбрать" - открыть проводник
    selectBtn.addEventListener('click', (e) => {
        // Убираем stopPropagation, иногда он мешает на мобильных
        input.click();
    });

    // Клик в любом месте блока (кроме кнопки) - активировать режим вставки
    area.addEventListener('click', (e) => {
        // Если клик по кнопке или по изображению, не обрабатываем
        if (e.target.closest('.photo-select-btn') || e.target.tagName === 'IMG' || e.target.closest('.photo-delete-btn')) {
            return;
        }
        // Фокусируемся на контейнере для активации Ctrl+V
        container.focus();
    });

    // Обработка вставки через Ctrl+V
    container.addEventListener('paste', async (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const file = new File([blob], 'pasted-image.jpg', { type: 'image/jpeg' });
                await showPreview(file);
                break;
            }
        }
    });

    // Обработка выбора файла через проводник
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await showPreview(file);
        }
    });
}

// Функция для удаления фото из превью
window.deletePhoto = function (containerId, inputId, previewId, areaId, selectBtnId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (input) input.value = '';
    if (preview) {
        preview.innerHTML = `
            <div class="photo-placeholder">
                <button type="button" class="photo-select-btn" id="${selectBtnId}">
                    <span class="photo-select-icon">+</span>
                    <span class="photo-select-text">Выбрать</span>
                </button>
                <small class="photo-hint">Или нажмите в любом месте и вставьте фото (Ctrl+V)</small>
            </div>
        `;

        // Переинициализируем обработчик клика для новой кнопки
        const newSelectBtn = document.getElementById(selectBtnId);
        if (newSelectBtn) {
            newSelectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetInput = document.getElementById(inputId);
                if (targetInput) targetInput.click();
            });
        }
    }
};

// ==================== FILTER FUNCTIONALITY ====================

// Переключение видимости панели фильтров
function toggleFilterPanel() {
    const filterPanel = document.getElementById('filterPanel');
    const filterToggleBtn = document.getElementById('filterToggleBtn');
    const filterToggleText = document.getElementById('filterToggleText');

    if (!filterPanel) return;

    if (filterPanel.style.display === 'none' || filterPanel.style.display === '') {
        filterPanel.style.display = 'flex';
        if (filterToggleText) filterToggleText.textContent = 'Скрыть фильтр';
        if (filterToggleBtn) filterToggleBtn.classList.add('active');
    } else {
        filterPanel.style.display = 'none';
        if (filterToggleText) filterToggleText.textContent = 'Фильтр';
        if (filterToggleBtn) filterToggleBtn.classList.remove('active');
    }
}

// Загрузить группы для фильтра
async function loadFilterGroups() {
    try {
        const response = await fetch('/api/groups');
        const groups = await response.json();
        const groupSelect = document.getElementById('filterGroup');

        if (groupSelect) {
            // Подсчет количества каждого имени группы
            const nameCounts = {};
            groups.forEach(g => {
                nameCounts[g.name] = (nameCounts[g.name] || 0) + 1;
            });

            groupSelect.innerHTML = '<option value="">Все группы</option>' +
                groups.map(g => {
                    const displayName = nameCounts[g.name] > 1 ? `${g.name} (ID: ${g.id})` : g.name;
                    return `<option value="${g.id}">${displayName}</option>`;
                }).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки групп для фильтра:', error);
    }
}

// Применить фильтры
function applyFilters() {
    const nameFilter = document.getElementById('filterName').value.toLowerCase().trim();
    const groupFilter = document.getElementById('filterGroup').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const balanceFilter = document.getElementById('filterBalance').value;

    const table = document.getElementById('studentsTable');
    const rows = table.querySelectorAll('tbody tr');

    // Новый интерфейс: список учеников
    const listItems = document.querySelectorAll('.student-list-item');

    let visibleCount = 0;

    // Фильтрация для таблицы (старый интерфейс)
    rows.forEach(row => {
        let show = true;

        // Фильтр по имени
        if (nameFilter) {
            const nameCell = row.cells[2]; // Колонка "Имя"
            const nameText = nameCell ? nameCell.textContent.toLowerCase() : '';
            if (!nameText.includes(nameFilter)) {
                show = false;
            }
        }

        // Фильтр по группе
        if (groupFilter && show) {
            const groupDataId = row.dataset.groupId || '';
            if (groupDataId !== groupFilter) {
                show = false;
            }
        }

        // Фильтр по статусу
        if (statusFilter && show) {
            const rowStatus = row.dataset.status || '';
            if (rowStatus !== statusFilter) {
                show = false;
            }
        }

        // Фильтр по балансу
        if (balanceFilter && show) {
            const balanceCell = row.cells[8]; // Колонка "Баланс"
            const balanceText = balanceCell ? balanceCell.textContent.trim() : '';

            if (balanceFilter === 'club') {
                if (!balanceText.includes('Клуб')) {
                    show = false;
                }
            } else if (balanceFilter === 'low') {
                if (!row.classList.contains('low-balance')) {
                    show = false;
                }
            } else if (balanceFilter === 'normal') {
                if (row.classList.contains('low-balance') || balanceText.includes('Клуб')) {
                    show = false;
                }
            }
        }

        if (show) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Фильтрация для нового интерфейса списка
    let listVisibleCount = 0;
    listItems.forEach(item => {
        let show = true;

        // Фильтр по имени
        if (nameFilter) {
            const nameElement = item.querySelector('.student-item-name');
            const nameText = nameElement ? nameElement.textContent.toLowerCase() : '';
            if (!nameText.includes(nameFilter)) {
                show = false;
            }
        }

        // Фильтр по группе
        if (groupFilter && show) {
            const groupDataId = item.dataset.groupId || '';
            if (groupDataId !== groupFilter) {
                show = false;
            }
        }

        // Фильтр по статусу
        if (statusFilter && show) {
            const itemStatus = item.dataset.status || '';
            if (itemStatus !== statusFilter) {
                show = false;
            }
        }

        // Фильтр по балансу
        if (balanceFilter && show) {
            const clubBadge = item.querySelector('.badge-club');
            const balanceBadge = item.querySelector('.badge-balance');

            if (balanceFilter === 'club') {
                if (!clubBadge) {
                    show = false;
                }
            } else if (balanceFilter === 'low') {
                if (!item.classList.contains('low-balance') || clubBadge) {
                    show = false;
                }
            } else if (balanceFilter === 'normal') {
                if (item.classList.contains('low-balance') || clubBadge) {
                    show = false;
                }
            }
        }

        if (show) {
            item.style.display = 'flex';
            listVisibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Показать сообщение, если ничего не найдено (для таблицы)
    const tbody = table.querySelector('tbody');
    let noResultsMsg = table.querySelector('.no-results-message');

    if (visibleCount === 0 && rows.length > 0) {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('tr');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.innerHTML = `
                <td colspan="14" style="text-align: center; padding: 40px; color: #94a3b8;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <div style="font-size: 18px; font-weight: 600;">Ничего не найдено</div>
                    <div style="font-size: 14px; margin-top: 8px;">Попробуйте изменить параметры фильтра</div>
                </td>
            `;
            tbody.appendChild(noResultsMsg);
        }
        noResultsMsg.style.display = '';
    } else {
        if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
        }
    }

    // Показать сообщение, если ничего не найдено (для нового интерфейса)
    const listContent = document.getElementById('studentListContent');
    if (listContent) {
        let noResultsMsgList = listContent.querySelector('.no-results-message-list');

        if (listVisibleCount === 0 && listItems.length > 0) {
            if (!noResultsMsgList) {
                noResultsMsgList = document.createElement('div');
                noResultsMsgList.className = 'no-results-message-list';
                noResultsMsgList.style.cssText = 'text-align: center; padding: 40px; color: #94a3b8;';
                noResultsMsgList.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <div style="font-size: 18px; font-weight: 600;">Ничего не найдено</div>
                    <div style="font-size: 14px; margin-top: 8px;">Попробуйте изменить параметры фильтра</div>
                `;
                listContent.appendChild(noResultsMsgList);
            }
            noResultsMsgList.style.display = 'block';
        } else {
            if (noResultsMsgList) {
                noResultsMsgList.style.display = 'none';
            }
        }
    }
}

// Сбросить фильтры
function clearFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterGroup').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterBalance').value = '';

    // Показать все строки таблицы
    const table = document.getElementById('studentsTable');
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = '';
    });

    // Показать все элементы списка
    const listItems = document.querySelectorAll('.student-list-item');
    listItems.forEach(item => {
        item.style.display = 'flex';
    });

    // Очистить поиск в списке
    const listSearch = document.getElementById('studentListSearch');
    if (listSearch) {
        listSearch.value = '';
    }

    // Убрать сообщение "Ничего не найдено" из таблицы
    const noResultsMsg = table.querySelector('.no-results-message');
    if (noResultsMsg) {
        noResultsMsg.style.display = 'none';
    }

    // Убрать сообщение "Ничего не найдено" из списка
    const listContent = document.getElementById('studentListContent');
    if (listContent) {
        const noResultsMsgList = listContent.querySelector('.no-results-message-list');
        if (noResultsMsgList) {
            noResultsMsgList.style.display = 'none';
        }
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация фильтров
    const filterToggleBtn = document.getElementById('filterToggleBtn');
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', toggleFilterPanel);
    }

    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }

    // Закрытие панели фильтров
    const closeFilterPanel = document.getElementById('closeFilterPanel');
    if (closeFilterPanel) {
        closeFilterPanel.addEventListener('click', () => {
            toggleFilterPanel();
        });
    }

    // Закрытие панели фильтров при клике вне её
    const filterPanel = document.getElementById('filterPanel');
    if (filterPanel) {
        filterPanel.addEventListener('click', (e) => {
            if (e.target === filterPanel) {
                toggleFilterPanel();
            }
        });
    }

    // Загрузить группы для фильтра
    loadFilterGroups();

    // Фильтрация при вводе в поле поиска (с задержкой)
    const filterNameInput = document.getElementById('filterName');
    if (filterNameInput) {
        let filterTimeout;
        filterNameInput.addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                applyFilters();
            }, 300);
        });
    }

    // Фильтрация при изменении селектов
    ['filterGroup', 'filterStatus', 'filterBalance'].forEach(filterId => {
        const filterElement = document.getElementById(filterId);
        if (filterElement) {
            filterElement.addEventListener('change', applyFilters);
        }
    });

    // Инициализация для формы добавления
    initPhotoUpload('add-photo-upload', 'add_photo_input', 'add-photo-preview', 'add-photo-area', 'add-photo-select-btn');

    // Инициализация для формы редактирования
    initPhotoUpload('edit-photo-upload', 'edit_photo', 'edit-photo-preview', 'edit-photo-area', 'edit-photo-select-btn');

    // ==================== SIDEBAR GROUP FILTER ====================
    // Логика фильтрации групп в боковой панели (которая была пропущена)

    const groupFilterSelect = document.getElementById('groupFilterSelect');

    // 1. Загрузка групп в селект боковой панели
    async function loadSidebarGroups() {
        if (!groupFilterSelect) return;

        try {
            const response = await fetch('/api/groups');
            const groups = await response.json();

            // Подсчет количества каждого имени группы для выявления дубликатов
            const nameCounts = {};
            groups.forEach(g => {
                nameCounts[g.name] = (nameCounts[g.name] || 0) + 1;
            });

            const currentValue = groupFilterSelect.value;
            groupFilterSelect.innerHTML = '<option value="">Все группы</option>' +
                groups.map(g => {
                    // Если имя группы встречается более одного раза, добавляем ID для уникальности
                    const displayName = nameCounts[g.name] > 1 ? `${g.name} (ID: ${g.id})` : g.name;
                    return `<option value="${g.id}">${displayName}</option>`;
                }).join('');

            if (currentValue) {
                groupFilterSelect.value = currentValue;
            }
        } catch (error) {
            console.error('Ошибка загрузки групп для сайдбара:', error);
        }
    }

    loadSidebarGroups();

    // 2. Обработчик изменения фильтра
    if (groupFilterSelect) {
        groupFilterSelect.addEventListener('change', () => {
            const selectedGroupId = groupFilterSelect.value;
            const items = document.querySelectorAll('.student-list-item');
            const listContent = document.getElementById('studentListContent');
            const clearBtn = document.getElementById('clearGroupFilter');

            // Показать/скрыть кнопку очистки
            if (clearBtn) {
                clearBtn.style.opacity = selectedGroupId ? '1' : '0';
                clearBtn.style.pointerEvents = selectedGroupId ? 'auto' : 'none';
            }

            let visibleCount = 0;

            items.forEach(item => {
                const itemGroupId = item.getAttribute('data-group-id');
                // Используем нестрогое сравнение, так как id могут быть строками или числами
                if (!selectedGroupId || itemGroupId == selectedGroupId) {
                    item.style.display = 'flex';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            // Обработка сообщения "Ничего не найдено"
            let noResultsMsgList = listContent.querySelector('.no-results-message-list');

            if (visibleCount === 0 && items.length > 0) {
                if (!noResultsMsgList) {
                    noResultsMsgList = document.createElement('div');
                    noResultsMsgList.className = 'no-results-message-list';
                    noResultsMsgList.style.cssText = 'text-align: center; padding: 40px; color: #94a3b8;';
                    noResultsMsgList.innerHTML = `
                        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                        <div style="font-size: 18px; font-weight: 600;">Ничего не найдено</div>
                        <div style="font-size: 14px; margin-top: 8px;">В этой группе нет учеников</div>
                    `;
                    listContent.appendChild(noResultsMsgList);
                }
                noResultsMsgList.style.display = 'block';
            } else {
                if (noResultsMsgList) {
                    noResultsMsgList.style.display = 'none';
                }
            }
        });
    }

    // 3. Обработчик клика на иконку очистки
    const clearGroupFilterBtn = document.getElementById('clearGroupFilter');
    if (clearGroupFilterBtn && groupFilterSelect) {
        clearGroupFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            groupFilterSelect.value = '';
            groupFilterSelect.dispatchEvent(new Event('change'));
        });
    }
});

