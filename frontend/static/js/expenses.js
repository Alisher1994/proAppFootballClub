// Модалка добавления расхода
const addExpenseModal = document.getElementById('addExpenseModal');
const addExpenseBtn = document.getElementById('addExpenseBtn');
const closeBtn = document.querySelector('.close');

// Модалка редактирования расхода
const editExpenseModal = document.getElementById('editExpenseModal');
const editCloseBtn = document.querySelector('.edit-close');
const editExpenseForm = document.getElementById('editExpenseForm');
const editCategory = document.getElementById('editCategory');
const editAmount = document.getElementById('editAmount');
const editDescription = document.getElementById('editDescription');
const editExpenseId = document.getElementById('editExpenseId');
const addExpenseCategory = document.querySelector('#addExpenseForm select[name="category"]');
const addExpenseEmployee = document.getElementById('addExpenseEmployee');
const editExpenseEmployee = document.getElementById('editExpenseEmployee');
const addSalaryMonth = document.getElementById('addSalaryMonth');
const addSalaryYear = document.getElementById('addSalaryYear');
const editSalaryMonth = document.getElementById('editSalaryMonth');
const editSalaryYear = document.getElementById('editSalaryYear');

function populateSalaryPeriod(monthSelect, yearSelect, selectedYear = null, selectedMonth = null) {
    if (!monthSelect || !yearSelect) return;
    const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const now = new Date();
    const year = selectedYear || now.getFullYear();
    const month = selectedMonth || (now.getMonth() + 1);
    monthSelect.innerHTML = names.map((name, index) => `<option value="${index + 1}">${name}</option>`).join('');
    yearSelect.innerHTML = '';
    for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y += 1) {
        yearSelect.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
    }
    monthSelect.value = String(month);
    yearSelect.value = String(year);
}

function syncSalaryEmployeeField(categorySelect, employeeSelect) {
    if (!categorySelect || !employeeSelect) return;
    const group = employeeSelect.closest('.salary-employee-group');
    const periodGroup = group?.nextElementSibling?.classList.contains('salary-period-group') ? group.nextElementSibling : null;
    const isSalary = categorySelect.value === 'Зарплата';
    if (group) group.style.display = isSalary ? 'block' : 'none';
    if (periodGroup) periodGroup.style.display = isSalary ? 'block' : 'none';
    if (isSalary) {
        employeeSelect.setAttribute('required', 'required');
    } else {
        employeeSelect.value = '';
        employeeSelect.removeAttribute('required');
    }
}

addExpenseBtn.addEventListener('click', () => {
    addExpenseModal.style.display = 'block';
    populateSalaryPeriod(addSalaryMonth, addSalaryYear);
    syncSalaryEmployeeField(addExpenseCategory, addExpenseEmployee);
});

if (closeBtn) closeBtn.addEventListener('click', () => {
    addExpenseModal.style.display = 'none';
});

// Закрыть модалку редактирования
if (editCloseBtn) editCloseBtn.addEventListener('click', () => {
    editExpenseModal.style.display = 'none';
});

if (addExpenseCategory) {
    addExpenseCategory.addEventListener('change', () => syncSalaryEmployeeField(addExpenseCategory, addExpenseEmployee));
}
if (editCategory) {
    editCategory.addEventListener('change', () => syncSalaryEmployeeField(editCategory, editExpenseEmployee));
}

// Формы расходов закрываются только явными кнопками, чтобы случайный клик по фону
// не приводил к потере уже введенных данных.

// Добавить расход
document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        category: formData.get('category'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        employee_id: formData.get('category') === 'Зарплата' ? formData.get('employee_id') : null,
        salary_month: formData.get('category') === 'Зарплата' ? formData.get('salary_month') : null,
        salary_year: formData.get('category') === 'Зарплата' ? formData.get('salary_year') : null
    };
    
    try {
        const response = await fetch('/api/expenses/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Расход добавлен!');
            location.reload();
        } else {
            alert('Ошибка: ' + result.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Открыть модалку редактирования
document.querySelectorAll('.edit-expense-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const { id, category, amount, description, employeeId, salaryYear, salaryMonth } = btn.dataset;
        editExpenseId.value = id;
        editCategory.value = category;
        editAmount.value = amount;
        editDescription.value = description || '';
        if (editExpenseEmployee) editExpenseEmployee.value = employeeId || '';
        populateSalaryPeriod(editSalaryMonth, editSalaryYear, salaryYear ? Number(salaryYear) : null, salaryMonth ? Number(salaryMonth) : null);
        syncSalaryEmployeeField(editCategory, editExpenseEmployee);
        editExpenseModal.style.display = 'block';
    });
});

// Сохранить изменения расхода
editExpenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        category: editCategory.value,
        amount: editAmount.value,
        description: editDescription.value,
        employee_id: editCategory.value === 'Зарплата' ? editExpenseEmployee?.value : null,
        salary_month: editCategory.value === 'Зарплата' ? editSalaryMonth?.value : null,
        salary_year: editCategory.value === 'Зарплата' ? editSalaryYear?.value : null
    };

    const expenseId = editExpenseId.value;

    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert('Расход обновлён!');
            location.reload();
        } else {
            alert('Ошибка: ' + result.message);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});
