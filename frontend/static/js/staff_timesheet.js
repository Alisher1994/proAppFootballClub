(function () {
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const searchInput = document.getElementById('staff-timesheet-search');
    const monthSelect = document.getElementById('staff-timesheet-month');
    const yearSelect = document.getElementById('staff-timesheet-year');
    const refreshBtn = document.getElementById('staff-timesheet-refresh');
    const exportBtn = document.getElementById('staff-timesheet-export');
    const table = document.getElementById('staff-timesheet-table');
    const thead = table?.querySelector('thead');
    const tbody = table?.querySelector('tbody');
    let searchTimer = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function formatMoney(value) {
        return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
    }

    function initFilters() {
        if (!monthSelect || !yearSelect) return;
        const now = new Date();
        monthSelect.innerHTML = monthNames
            .map((name, index) => `<option value="${index + 1}">${name}</option>`)
            .join('');
        for (let year = now.getFullYear() - 2; year <= now.getFullYear() + 1; year += 1) {
            yearSelect.insertAdjacentHTML('beforeend', `<option value="${year}">${year}</option>`);
        }
        monthSelect.value = String(now.getMonth() + 1);
        yearSelect.value = String(now.getFullYear());
    }

    function renderHeader(days) {
        const dayHeaders = days.map(day => `
            <th class="${day.weekend ? 'weekend' : ''}">
                <div>${escapeHtml(day.weekday)}</div>
                <div>${day.day}</div>
            </th>
        `).join('');

        thead.innerHTML = `
            <tr>
                <th class="sticky-col col-index">№</th>
                <th class="sticky-col col-photo">Фото</th>
                <th class="sticky-col col-name">ФИО</th>
                ${dayHeaders}
                <th>Итого</th>
                <th>Зарплата</th>
            </tr>
        `;
    }

    function renderPhoto(row) {
        if (row.photo_url) {
            return `<img class="staff-photo" src="${escapeHtml(row.photo_url)}" alt="">`;
        }
        const initials = (row.full_name || row.username || '?').trim().slice(0, 1).toUpperCase();
        return `<span class="staff-photo">${escapeHtml(initials)}</span>`;
    }

    function renderDayCell(day) {
        const classes = ['day-cell'];
        if (day.has_data) classes.push('has-data');
        const content = [];
        if (day.entry && day.exit) {
            content.push(`<span class="time">${escapeHtml(day.entry)}</span>`);
            content.push(`<span class="time">${escapeHtml(day.exit)}</span>`);
            if (day.hours_label) content.push(`<span class="hours">${escapeHtml(day.hours_label)}</span>`);
        } else if (day.entry || day.exit || day.single) {
            content.push(`<span class="time">${escapeHtml(day.entry || day.exit || day.single)}</span>`);
        } else {
            content.push('<span class="time empty-mark">-</span>');
        }
        return `<td class="${classes.join(' ')}">${content.join('')}</td>`;
    }

    function renderSalary(row) {
        const salaryType = row.salary_type === 'floating' ? 'Плавающая' : 'Фиксированная';
        const planned = row.salary_type === 'floating'
            ? 'Расчет позже'
            : (row.fixed_salary ? formatMoney(row.fixed_salary) : 'Оклад не указан');
        const paid = Number(row.salary_paid || 0);
        return `
            <div class="${paid > 0 ? 'salary-paid' : 'salary-muted'}">${escapeHtml(row.salary_paid_label || 'Не получил')}</div>
            <div class="staff-sub">${escapeHtml(salaryType)} · ${escapeHtml(planned)}</div>
        `;
    }

    function renderRows(rows, daysCount) {
        if (!rows.length) {
            tbody.innerHTML = `<tr><td class="timesheet-empty" colspan="${daysCount + 5}">Сотрудники не найдены</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td class="sticky-col col-index">${row.index}</td>
                <td class="sticky-col col-photo">${renderPhoto(row)}</td>
                <td class="sticky-col col-name">
                    <div class="staff-name">${escapeHtml(row.full_name)}</div>
                    <div class="staff-sub staff-role-sub">${escapeHtml(row.role || '-')}</div>
                    <div class="staff-sub">${escapeHtml(row.employee_no || '-')}</div>
                </td>
                ${(row.days || []).map(renderDayCell).join('')}
                <td class="summary-cell">${escapeHtml(row.total_hours_label || '-')}</td>
                <td class="salary-cell">${renderSalary(row)}</td>
            </tr>
        `).join('');
    }

    function downloadTimesheetXls() {
        if (!table) return;
        const monthName = monthSelect?.selectedOptions?.[0]?.textContent || '';
        const year = yearSelect?.value || '';
        const html = `
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
                <h3>Табель сотрудников ${escapeHtml(monthName)} ${escapeHtml(year)}</h3>
                ${table.outerHTML}
            </body>
            </html>
        `;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tabel_sotrudnikov_${year}_${String(monthSelect?.value || '').padStart(2, '0')}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function loadTimesheet() {
        if (!thead || !tbody) return;
        const params = new URLSearchParams({
            year: yearSelect.value,
            month: monthSelect.value,
            search: searchInput.value.trim()
        });
        tbody.innerHTML = '<tr><td class="timesheet-empty">Загрузка...</td></tr>';

        try {
            const response = await fetch(`/api/staff-timesheet?${params.toString()}`);
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось загрузить табель');
            }
            renderHeader(data.days || []);
            renderRows(data.rows || [], (data.days || []).length);
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td class="timesheet-empty">Ошибка загрузки табеля</td></tr>';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initFilters();
        loadTimesheet();

        refreshBtn?.addEventListener('click', loadTimesheet);
        exportBtn?.addEventListener('click', downloadTimesheetXls);
        monthSelect?.addEventListener('change', loadTimesheet);
        yearSelect?.addEventListener('change', loadTimesheet);
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadTimesheet, 250);
        });
    });
})();
