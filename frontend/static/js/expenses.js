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

function syncSalaryEmployeeField(categorySelect, employeeSelect) {
    if (!categorySelect || !employeeSelect) return;
    const group = employeeSelect.closest('.salary-employee-group');
    const isSalary = categorySelect.value === 'Зарплата';
    if (group) group.style.display = isSalary ? 'block' : 'none';
    if (isSalary) {
        employeeSelect.setAttribute('required', 'required');
    } else {
        employeeSelect.value = '';
        employeeSelect.removeAttribute('required');
    }
}

addExpenseBtn.addEventListener('click', () => {
    addExpenseModal.style.display = 'block';
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

window.addEventListener('click', (e) => {
    if (e.target === addExpenseModal) {
        addExpenseModal.style.display = 'none';
    }
    if (e.target === editExpenseModal) {
        editExpenseModal.style.display = 'none';
    }
});

// Добавить расход
document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        category: formData.get('category'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        employee_id: formData.get('category') === 'Зарплата' ? formData.get('employee_id') : null
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
        const { id, category, amount, description, employeeId } = btn.dataset;
        editExpenseId.value = id;
        editCategory.value = category;
        editAmount.value = amount;
        editDescription.value = description || '';
        if (editExpenseEmployee) editExpenseEmployee.value = employeeId || '';
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
        employee_id: editCategory.value === 'Зарплата' ? editExpenseEmployee?.value : null
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
