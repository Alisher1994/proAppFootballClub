const accessState = {
    timer: null,
    page: 1,
    perPage: 50,
    pages: 1,
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
    return 'Проход разрешён';
}

function attendanceStatus(log) {
    if (log.result === 'denied') return { label: 'Отклонён', className: 'denied' };
    if (log.result === 'error') return { label: 'Ошибка', className: 'error' };
    if (log.person_type === 'staff') return { label: 'Сотрудник', className: 'staff' };
    if (log.person_type !== 'student') return { label: 'Не найден', className: 'missed' };
    if (log.attendance_id) return { label: 'Отмечен', className: 'attended' };
    return { label: 'Нет отметки', className: 'missed' };
}

function renderAccessPhoto(log) {
    const rawLabel = log.full_name || log.employee_no || 'Фото прохода';
    const label = escapeHtml(rawLabel);
    if (log.access_photo_url) {
        return `
            <button type="button" class="access-photo-thumb" data-photo-url="${escapeHtml(log.access_photo_url)}" data-photo-title="${label}" data-photo-meta="${escapeHtml(formatAccessDateTime(log.event_time))}">
                <img src="${escapeHtml(log.access_photo_url)}" alt="${label}" loading="lazy">
            </button>
        `;
    }
    return '<span class="access-photo-none" title="Фото прохода нет">-</span>';
}

function replaceBrokenAccessPhoto(img) {
    const holder = img.closest('.access-photo-thumb');
    if (!holder) return;
    holder.removeAttribute('data-photo-url');
    holder.classList.add('access-photo-fallback');
    holder.outerHTML = '<span class="access-photo-none" title="Фото прохода не загрузилось">-</span>';
}

function renderAccessLogs(logs) {
    const body = document.getElementById('accessLogBody');
    if (!body) return;

    if (!logs.length) {
        body.innerHTML = '<tr><td colspan="8" class="access-empty">Записей пока нет</td></tr>';
        return;
    }

    body.innerHTML = logs.map((log) => {
        const direction = log.direction === 'exit' ? 'exit' : 'entry';
        const terminal = [log.device_name, log.device_ip].filter(Boolean).join(' · ') || '-';
        const status = attendanceStatus(log);
        return `
            <tr>
                <td>${formatAccessDateTime(log.event_time)}</td>
                <td>${renderAccessPhoto(log)}</td>
                <td><span class="access-pill access-${direction}">${directionLabel(direction)}</span></td>
                <td class="access-id">${escapeHtml(log.employee_no || '-')}</td>
                <td>
                    <strong>${escapeHtml(log.full_name || 'Неизвестно')}</strong>
                    <div class="access-muted">${log.person_type === 'staff' ? 'Сотрудник' : log.person_type === 'student' ? 'Ученик' : 'Не найден в системе'}</div>
                </td>
                <td>${escapeHtml(log.group_name || '-')}</td>
                <td>${escapeHtml(terminal)}</td>
                <td><span class="access-status access-status-${status.className}" title="${escapeHtml(resultLabel(log.result))}">${status.label}</span></td>
            </tr>
        `;
    }).join('');

    body.querySelectorAll('.access-photo-thumb[data-photo-url]').forEach((button) => {
        button.addEventListener('click', () => openAccessPhotoModal(
            button.dataset.photoUrl,
            button.dataset.photoTitle,
            button.dataset.photoMeta
        ));
    });
    body.querySelectorAll('.access-photo-thumb img').forEach((img) => {
        img.addEventListener('error', () => replaceBrokenAccessPhoto(img), { once: true });
    });
}

function renderAccessPagination(pagination = {}) {
    accessState.page = Number(pagination.page || accessState.page || 1);
    accessState.pages = Math.max(1, Number(pagination.pages || 1));
    const total = Number(pagination.total || 0);
    const perPage = Number(pagination.per_page || accessState.perPage || 50);
    const from = total ? ((accessState.page - 1) * perPage) + 1 : 0;
    const to = Math.min(total, accessState.page * perPage);

    const info = document.getElementById('accessPageInfo');
    const number = document.getElementById('accessPageNumber');
    const prev = document.getElementById('accessPrevPage');
    const next = document.getElementById('accessNextPage');

    if (info) info.textContent = total ? `${from}-${to} из ${total}` : '0 записей';
    if (number) number.textContent = `${accessState.page} / ${accessState.pages}`;
    if (prev) prev.disabled = accessState.page <= 1;
    if (next) next.disabled = accessState.page >= accessState.pages;
}

async function loadAccessLogs({ resetPage = false } = {}) {
    if (resetPage) accessState.page = 1;
    const params = new URLSearchParams();
    const startDate = document.getElementById('accessStartDateFilter')?.value;
    const endDate = document.getElementById('accessEndDateFilter')?.value;
    const direction = document.getElementById('accessDirectionFilter')?.value;
    const result = document.getElementById('accessResultFilter')?.value;
    const search = document.getElementById('accessSearchFilter')?.value.trim();

    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (direction) params.set('direction', direction);
    if (result) params.set('result', result);
    if (search) params.set('search', search);
    params.set('page', accessState.page);
    params.set('per_page', accessState.perPage);

    try {
        const response = await fetch(`/api/access-log?${params.toString()}`);
        const data = await response.json();
        renderAccessLogs(data.logs || []);
        renderAccessPagination(data.pagination || {});
    } catch (error) {
        const body = document.getElementById('accessLogBody');
        if (body) body.innerHTML = '<tr><td colspan="8" class="access-empty access-error">Не удалось загрузить журнал</td></tr>';
        renderAccessPagination({ page: 1, pages: 1, total: 0, per_page: accessState.perPage });
    }
}

function debounceAccessLoad() {
    clearTimeout(accessState.timer);
    accessState.timer = setTimeout(() => loadAccessLogs({ resetPage: true }), 250);
}

function openAccessPhotoModal(photoUrl, title, meta) {
    const modal = document.getElementById('accessPhotoModal');
    const image = document.getElementById('accessPhotoImage');
    const titleEl = document.getElementById('accessPhotoTitle');
    const metaEl = document.getElementById('accessPhotoMeta');
    if (!modal || !image) return;
    image.src = photoUrl;
    image.alt = title || 'Фото прохода';
    if (titleEl) titleEl.textContent = title || 'Фото прохода';
    if (metaEl) metaEl.textContent = meta || '';
    modal.hidden = false;
    modal.style.display = 'flex';
}

function closeAccessPhotoModal() {
    const modal = document.getElementById('accessPhotoModal');
    const image = document.getElementById('accessPhotoImage');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    if (image) image.removeAttribute('src');
}

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const todayValue = today.toISOString().slice(0, 10);
    const startDateInput = document.getElementById('accessStartDateFilter');
    const endDateInput = document.getElementById('accessEndDateFilter');
    if (startDateInput) startDateInput.value = todayValue;
    if (endDateInput) endDateInput.value = todayValue;

    ['accessStartDateFilter', 'accessEndDateFilter', 'accessDirectionFilter', 'accessResultFilter'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', () => loadAccessLogs({ resetPage: true }));
    });
    document.getElementById('accessSearchFilter')?.addEventListener('input', debounceAccessLoad);
    document.getElementById('refreshAccessLogBtn')?.addEventListener('click', () => loadAccessLogs());
    document.getElementById('accessPrevPage')?.addEventListener('click', () => {
        if (accessState.page > 1) {
            accessState.page -= 1;
            loadAccessLogs();
        }
    });
    document.getElementById('accessNextPage')?.addEventListener('click', () => {
        if (accessState.page < accessState.pages) {
            accessState.page += 1;
            loadAccessLogs();
        }
    });
    document.getElementById('accessPhotoClose')?.addEventListener('click', closeAccessPhotoModal);
    document.getElementById('accessPhotoModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'accessPhotoModal') closeAccessPhotoModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAccessPhotoModal();
    });
    loadAccessLogs();
});
