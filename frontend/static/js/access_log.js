const accessState = {
    timer: null,
    page: 1,
    perPage: 50,
    pages: 1,
    verificationTimer: null,
    requestController: null,
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

function faceVerificationStatus(log) {
    const status = log.face_verification_status || 'pending';
    const hasScore = log.face_similarity !== null && log.face_similarity !== undefined && log.face_similarity !== '';
    const score = hasScore ? Number(log.face_similarity) : NaN;
    const percent = hasScore ? `${score.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : '';
    if (status === 'confirmed') return { label: `Подтверждено${percent ? ` · ${percent}` : ''}`, className: 'confirmed' };
    if (status === 'suspicious') return { label: `Сомнительно${percent ? ` · ${percent}` : ''}`, className: 'suspicious' };
    if (status === 'mismatch') return { label: `Не совпадает${percent ? ` · ${percent}` : ''}`, className: 'mismatch' };
    if (status === 'unavailable') return { label: 'Не удалось проверить', className: 'unavailable' };
    if (status === 'processing') return { label: 'Сверка...', className: 'pending' };
    if (status === 'not_applicable') return { label: '—', className: 'not-applicable' };
    return { label: 'Не проверено', className: 'pending' };
}

function renderAccessPhoto(log) {
    const rawLabel = log.full_name || log.employee_no || 'Фото прохода';
    const label = escapeHtml(rawLabel);
    if (log.access_photo_url) {
        const verification = faceVerificationStatus(log);
        return `
            <button type="button" class="access-photo-thumb" data-photo-url="${escapeHtml(log.access_photo_url)}" data-system-photo-url="${escapeHtml(log.person_photo_url || '')}" data-photo-title="${label}" data-photo-meta="${escapeHtml(formatAccessDateTime(log.event_time))}" data-photo-verification="${escapeHtml(log.face_verification_reason || verification.label)}" data-actual-name="${escapeHtml(actualPersonLabel(log))}" data-claimed-name="${label}">
                <img src="${escapeHtml(log.access_photo_thumb_url || log.access_photo_url)}" alt="${label}" loading="lazy" decoding="async">
            </button>
        `;
    }
    return '<span class="access-photo-none" title="Фото прохода нет">-</span>';
}

function actualPersonLabel(log) {
    if (log.person_type !== 'student') return log.full_name || 'Проверка не применяется';
    if (log.identified_full_name) return `${log.identified_tentative ? 'Предположительно: ' : ''}${log.identified_full_name}`;
    if (!log.face_identified_at || ['pending', 'processing'].includes(log.face_verification_status)) return 'Определяется...';
    return 'Не удалось определить';
}

function renderActualPerson(log) {
    const name = actualPersonLabel(log);
    const score = log.person_type !== 'student'
        ? 'Без серверной сверки'
        : log.identified_similarity !== null && log.identified_similarity !== undefined
        ? `Сходство ${Number(log.identified_similarity).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`
        : (log.face_identified_at ? 'Нет надёжного совпадения' : 'Проверка фото');
    return `<strong>${escapeHtml(name)}</strong><div class="access-muted">${escapeHtml(score)}</div>`;
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
        body.innerHTML = '<tr><td colspan="10" class="access-empty">Записей пока нет</td></tr>';
        return;
    }

    body.innerHTML = logs.map((log) => {
        const direction = log.direction === 'exit' ? 'exit' : 'entry';
        const terminal = [log.device_name, log.device_ip].filter(Boolean).join(' · ') || '-';
        const status = attendanceStatus(log);
        const faceStatus = faceVerificationStatus(log);
        return `
            <tr>
                <td>${formatAccessDateTime(log.event_time)}</td>
                <td>${renderAccessPhoto(log)}</td>
                <td><span class="access-pill access-${direction}">${directionLabel(direction)}</span></td>
                <td class="access-id">${escapeHtml(log.employee_no || '-')}</td>
                <td>${renderActualPerson(log)}</td>
                <td>
                    <strong>${escapeHtml(log.full_name || 'Неизвестно')}</strong>
                    <div class="access-muted">${log.person_type === 'staff' ? 'Сотрудник' : log.person_type === 'student' ? 'Ученик' : 'Не найден в системе'}</div>
                </td>
                <td>${escapeHtml(log.group_name || '-')}</td>
                <td>${escapeHtml(terminal)}</td>
                <td><span class="access-face-status access-face-${faceStatus.className}" title="${escapeHtml(log.face_verification_reason || faceStatus.label)}">${faceStatus.label}</span></td>
                <td><span class="access-status access-status-${status.className}" title="${escapeHtml(resultLabel(log.result))}">${status.label}</span></td>
            </tr>
        `;
    }).join('');

    body.querySelectorAll('.access-photo-thumb[data-photo-url]').forEach((button) => {
        button.addEventListener('click', () => openAccessPhotoModal(
            button.dataset.photoUrl,
            button.dataset.systemPhotoUrl,
            button.dataset.photoTitle,
            button.dataset.photoMeta,
            button.dataset.photoVerification,
            button.dataset.actualName,
            button.dataset.claimedName
        ));
    });
    body.querySelectorAll('.access-photo-thumb img').forEach((img) => {
        img.addEventListener('error', () => replaceBrokenAccessPhoto(img), { once: true });
    });

    clearTimeout(accessState.verificationTimer);
    if (logs.some((log) => !log.face_verification_status || ['pending', 'processing'].includes(log.face_verification_status))) {
        accessState.verificationTimer = setTimeout(() => loadAccessLogs(), 2500);
    }
}

function renderAccessPagination(pagination = {}) {
    accessState.page = Number(pagination.page || accessState.page || 1);
    accessState.pages = Math.max(1, Number(pagination.pages || 1));
    const total = Number(pagination.total || 0);
    const perPage = Number(pagination.per_page || accessState.perPage || 50);
    const from = total ? ((accessState.page - 1) * perPage) + 1 : 0;
    const to = Math.min(total, accessState.page * perPage);

    const info = document.getElementById('accessPageInfo');
    const numbers = document.getElementById('accessPageNumbers');
    const prev = document.getElementById('accessPrevPage');
    const next = document.getElementById('accessNextPage');

    if (info) info.textContent = total ? `${from}-${to} из ${total}` : '0 записей';
    if (numbers) {
        const visiblePages = [];
        for (let page = 1; page <= accessState.pages; page += 1) {
            if (page === 1 || page === accessState.pages || Math.abs(page - accessState.page) <= 2) {
                visiblePages.push(page);
            }
        }
        const items = [];
        visiblePages.forEach((page, index) => {
            if (index > 0 && page - visiblePages[index - 1] > 1) items.push('ellipsis');
            items.push(page);
        });
        numbers.innerHTML = items.map((item) => {
            if (item === 'ellipsis') return '<span class="access-page-ellipsis" aria-hidden="true">…</span>';
            const active = item === accessState.page;
            return `<button type="button" class="access-page-number${active ? ' active' : ''}" data-page="${item}"${active ? ' aria-current="page" disabled' : ''}>${item}</button>`;
        }).join('');
    }
    if (prev) prev.disabled = accessState.page <= 1;
    if (next) next.disabled = accessState.page >= accessState.pages;
}

async function loadAccessLogs({ resetPage = false } = {}) {
    if (resetPage) accessState.page = 1;
    clearTimeout(accessState.verificationTimer);
    if (accessState.requestController) accessState.requestController.abort();
    const controller = new AbortController();
    accessState.requestController = controller;
    const params = new URLSearchParams();
    const startDate = document.getElementById('accessStartDateFilter')?.value;
    const endDate = document.getElementById('accessEndDateFilter')?.value;
    const direction = document.getElementById('accessDirectionFilter')?.value;
    const result = document.getElementById('accessResultFilter')?.value;
    const faceStatus = document.getElementById('accessFaceStatusFilter')?.value;
    const search = document.getElementById('accessSearchFilter')?.value.trim();

    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (direction) params.set('direction', direction);
    if (result) params.set('result', result);
    if (faceStatus) params.set('face_status', faceStatus);
    if (search) params.set('search', search);
    params.set('page', accessState.page);
    params.set('per_page', accessState.perPage);

    try {
        const response = await fetch(`/api/access-log?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        renderAccessLogs(data.logs || []);
        renderAccessPagination(data.pagination || {});
    } catch (error) {
        if (error.name === 'AbortError') return;
        const body = document.getElementById('accessLogBody');
        if (body) body.innerHTML = '<tr><td colspan="10" class="access-empty access-error">Не удалось загрузить журнал</td></tr>';
        renderAccessPagination({ page: 1, pages: 1, total: 0, per_page: accessState.perPage });
    }
}

function goToAccessPage(page) {
    const target = Math.max(1, Math.min(accessState.pages, Number(page) || 1));
    if (target === accessState.page) return;
    accessState.page = target;
    loadAccessLogs();
}

function debounceAccessLoad() {
    clearTimeout(accessState.timer);
    accessState.timer = setTimeout(() => loadAccessLogs({ resetPage: true }), 250);
}

function openAccessPhotoModal(photoUrl, systemPhotoUrl, title, meta, verification, actualName, claimedName) {
    const modal = document.getElementById('accessPhotoModal');
    const image = document.getElementById('accessPhotoImage');
    const systemImage = document.getElementById('accessSystemPhotoImage');
    const systemEmpty = document.getElementById('accessSystemPhotoEmpty');
    const titleEl = document.getElementById('accessPhotoTitle');
    const metaEl = document.getElementById('accessPhotoMeta');
    const actualNameEl = document.getElementById('accessActualPersonName');
    const claimedNameEl = document.getElementById('accessClaimedPersonName');
    if (!modal || !image) return;
    image.src = photoUrl;
    image.alt = title || 'Фото прохода';
    if (systemImage && systemEmpty) {
        if (systemPhotoUrl) {
            systemImage.src = systemPhotoUrl;
            systemImage.alt = title || 'Фото в системе';
            systemImage.hidden = false;
            systemEmpty.hidden = true;
        } else {
            systemImage.hidden = true;
            systemImage.removeAttribute('src');
            systemEmpty.hidden = false;
        }
    }
    if (titleEl) titleEl.textContent = title || 'Фото прохода';
    if (metaEl) metaEl.textContent = [meta, verification].filter(Boolean).join(' · ');
    if (actualNameEl) actualNameEl.textContent = actualName || 'Не удалось определить';
    if (claimedNameEl) claimedNameEl.textContent = claimedName || 'Неизвестно';
    modal.hidden = false;
    modal.style.display = 'flex';
}

function closeAccessPhotoModal() {
    const modal = document.getElementById('accessPhotoModal');
    const image = document.getElementById('accessPhotoImage');
    const systemImage = document.getElementById('accessSystemPhotoImage');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    if (image) image.removeAttribute('src');
    if (systemImage) systemImage.removeAttribute('src');
}

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const todayValue = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const startDateInput = document.getElementById('accessStartDateFilter');
    const endDateInput = document.getElementById('accessEndDateFilter');
    if (startDateInput) startDateInput.value = todayValue;
    if (endDateInput) endDateInput.value = todayValue;

    ['accessStartDateFilter', 'accessEndDateFilter', 'accessDirectionFilter', 'accessResultFilter', 'accessFaceStatusFilter'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', () => loadAccessLogs({ resetPage: true }));
    });
    document.getElementById('accessSearchFilter')?.addEventListener('input', debounceAccessLoad);
    document.getElementById('refreshAccessLogBtn')?.addEventListener('click', () => loadAccessLogs());
    document.getElementById('accessPrevPage')?.addEventListener('click', () => {
        goToAccessPage(accessState.page - 1);
    });
    document.getElementById('accessNextPage')?.addEventListener('click', () => {
        goToAccessPage(accessState.page + 1);
    });
    document.getElementById('accessPageNumbers')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-page]');
        if (button) goToAccessPage(button.dataset.page);
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
