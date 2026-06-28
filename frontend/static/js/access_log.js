const accessState = {
    timer: null,
};

function formatAccessDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function directionLabel(direction) {
    return direction === 'exit' ? 'Выход' : 'Вход';
}

function resultLabel(result) {
    if (result === 'denied') return 'Отклонён';
    if (result === 'error') return 'Ошибка';
    return 'Пропущен';
}

function renderAccessLogs(logs) {
    const body = document.getElementById('accessLogBody');
    if (!body) return;

    if (!logs.length) {
        body.innerHTML = '<tr><td colspan="7" class="access-empty">Записей пока нет</td></tr>';
        return;
    }

    body.innerHTML = logs.map((log) => {
        const direction = log.direction === 'exit' ? 'exit' : 'entry';
        const result = ['denied', 'error'].includes(log.result) ? log.result : 'granted';
        const terminal = [log.device_name, log.device_ip].filter(Boolean).join(' · ') || '-';
        return `
            <tr>
                <td>${formatAccessDateTime(log.event_time)}</td>
                <td><span class="access-pill access-${direction}">${directionLabel(direction)}</span></td>
                <td class="access-id">${escapeHtml(log.employee_no || '-')}</td>
                <td>
                    <strong>${escapeHtml(log.full_name || 'Неизвестно')}</strong>
                    <div class="access-muted">${log.person_type === 'staff' ? 'Сотрудник' : log.person_type === 'student' ? 'Ученик' : 'Не найден в системе'}</div>
                </td>
                <td>${escapeHtml(log.group_name || '-')}</td>
                <td>${escapeHtml(terminal)}</td>
                <td><span class="access-status access-status-${result}">${resultLabel(result)}</span></td>
            </tr>
        `;
    }).join('');
}

async function loadAccessLogs() {
    const params = new URLSearchParams();
    const date = document.getElementById('accessDateFilter')?.value;
    const direction = document.getElementById('accessDirectionFilter')?.value;
    const result = document.getElementById('accessResultFilter')?.value;
    const search = document.getElementById('accessSearchFilter')?.value.trim();

    if (date) params.set('date', date);
    if (direction) params.set('direction', direction);
    if (result) params.set('result', result);
    if (search) params.set('search', search);

    try {
        const response = await fetch(`/api/access-log?${params.toString()}`);
        const data = await response.json();
        renderAccessLogs(data.logs || []);
    } catch (error) {
        const body = document.getElementById('accessLogBody');
        if (body) body.innerHTML = '<tr><td colspan="7" class="access-empty access-error">Не удалось загрузить журнал</td></tr>';
    }
}

function debounceAccessLoad() {
    clearTimeout(accessState.timer);
    accessState.timer = setTimeout(loadAccessLogs, 250);
}

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const dateInput = document.getElementById('accessDateFilter');
    if (dateInput) dateInput.value = today.toISOString().slice(0, 10);

    ['accessDateFilter', 'accessDirectionFilter', 'accessResultFilter'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', loadAccessLogs);
    });
    document.getElementById('accessSearchFilter')?.addEventListener('input', debounceAccessLoad);
    document.getElementById('refreshAccessLogBtn')?.addEventListener('click', loadAccessLogs);
    loadAccessLogs();
});
