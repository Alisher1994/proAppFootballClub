const catalogState = {
    tournaments: [],
    teams: [],
    editingTournamentId: null,
    editingTeamId: null,
    teamLogoObjectUrl: null,
};

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
}

function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

async function apiJson(url, options = {}) {
    const requestOptions = { credentials: 'same-origin', ...options };
    if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
        requestOptions.headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
    }
    const response = await fetch(url, requestOptions);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Не удалось выполнить действие');
    }
    return data;
}

function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
}

function tournamentDates(item) {
    const start = formatDate(item.start_date);
    const end = formatDate(item.end_date);
    return item.start_date === item.end_date ? start : `${start} — ${end}`;
}

function initials(name) {
    return String(name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function renderTournaments() {
    byId('tournamentCount').textContent = catalogState.tournaments.length;
    if (!catalogState.tournaments.length) {
        byId('tournamentList').innerHTML = `
            <div class="tournament-catalog-empty">
                <i data-lucide="trophy"></i>
                <strong>Турниров пока нет</strong>
                <span>Создайте первый турнир, указав дату, время, возраст и локацию.</span>
            </div>`;
        refreshIcons();
        return;
    }
    byId('tournamentList').innerHTML = catalogState.tournaments.map((item) => `
        <article class="tournament-catalog-card">
            <div class="tournament-catalog-card-top">
                <span class="tournament-catalog-card-icon"><i data-lucide="trophy"></i></span>
                <div class="tournament-catalog-card-actions">
                    <button class="icon-button" type="button" data-edit-tournament="${item.id}" aria-label="Редактировать">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="icon-button danger" type="button" data-delete-tournament="${item.id}" aria-label="Удалить">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="tournament-catalog-meta">
                <span><i data-lucide="calendar-days"></i>${escapeHtml(tournamentDates(item))}</span>
                <span><i data-lucide="clock-3"></i>${escapeHtml(item.start_time || '—')}</span>
                <span><i data-lucide="map-pin"></i>${escapeHtml(item.location || '—')}</span>
            </div>
            <div class="tournament-catalog-age-groups">
                ${(item.age_groups || []).map((group) => `<span>${escapeHtml(group)}</span>`).join('')}
            </div>
        </article>
    `).join('');
    refreshIcons();
}

function renderTeams() {
    byId('teamCount').textContent = catalogState.teams.length;
    if (!catalogState.teams.length) {
        byId('teamList').innerHTML = `
            <div class="tournament-catalog-empty">
                <i data-lucide="shield"></i>
                <strong>База команд пуста</strong>
                <span>Добавьте название и логотип первой команды.</span>
            </div>`;
        refreshIcons();
        return;
    }
    byId('teamList').innerHTML = catalogState.teams.map((team) => `
        <article class="team-catalog-card">
            <div class="team-catalog-card-logo">
                ${team.logo_url
                    ? `<img src="${escapeHtml(team.logo_url)}" alt="${escapeHtml(team.name)}">`
                    : `<span>${escapeHtml(initials(team.name))}</span>`}
            </div>
            <strong>${escapeHtml(team.name)}</strong>
            <div class="team-catalog-card-actions">
                <button class="icon-button" type="button" data-edit-team="${team.id}" aria-label="Редактировать">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="icon-button danger" type="button" data-delete-team="${team.id}" aria-label="Удалить">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </article>
    `).join('');
    refreshIcons();
}

async function loadTournaments() {
    const data = await apiJson('/api/tournaments');
    catalogState.tournaments = data.tournaments || [];
    renderTournaments();
}

async function loadTeams() {
    const data = await apiJson('/api/tournament-team-catalog');
    catalogState.teams = data.teams || [];
    renderTeams();
}

function openModal(id) {
    const modal = byId(id);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    refreshIcons();
}

function closeModal(id) {
    byId(id).hidden = true;
    if (!document.querySelector('.tournament-catalog-modal:not([hidden])')) {
        document.body.classList.remove('modal-open');
    }
}

function showFormError(id, message = '') {
    const element = byId(id);
    element.textContent = message;
    element.hidden = !message;
}

function resetTournamentForm() {
    catalogState.editingTournamentId = null;
    byId('tournamentForm').reset();
    byId('tournamentModalTitle').textContent = 'Новый турнир';
    showFormError('tournamentFormError');
}

function openTournamentEditor(id) {
    const item = catalogState.tournaments.find((row) => Number(row.id) === Number(id));
    if (!item) return;
    catalogState.editingTournamentId = item.id;
    byId('tournamentModalTitle').textContent = 'Редактировать турнир';
    byId('tournamentName').value = item.name || '';
    byId('tournamentStartDate').value = item.start_date || '';
    byId('tournamentStartTime').value = item.start_time || '';
    byId('tournamentEndDate').value = item.end_date || '';
    byId('tournamentLocation').value = item.location || '';
    byId('tournamentAgeGroups').value = (item.age_groups || []).join(', ');
    showFormError('tournamentFormError');
    openModal('tournamentModal');
}

async function saveTournament(event) {
    event.preventDefault();
    const editingId = catalogState.editingTournamentId;
    try {
        showFormError('tournamentFormError');
        await apiJson(editingId ? `/api/tournaments/${editingId}` : '/api/tournaments', {
            method: editingId ? 'PUT' : 'POST',
            body: JSON.stringify({
                name: byId('tournamentName').value,
                start_date: byId('tournamentStartDate').value,
                start_time: byId('tournamentStartTime').value,
                end_date: byId('tournamentEndDate').value,
                location: byId('tournamentLocation').value,
                age_groups: byId('tournamentAgeGroups').value,
            }),
        });
        closeModal('tournamentModal');
        resetTournamentForm();
        await loadTournaments();
    } catch (error) {
        showFormError('tournamentFormError', error.message);
    }
}

async function deleteTournament(id) {
    const item = catalogState.tournaments.find((row) => Number(row.id) === Number(id));
    if (!item || !window.confirm(`Удалить турнир «${item.name}»?`)) return;
    await apiJson(`/api/tournaments/${id}`, { method: 'DELETE' });
    await loadTournaments();
}

function releaseTeamLogoPreview() {
    if (catalogState.teamLogoObjectUrl) {
        URL.revokeObjectURL(catalogState.teamLogoObjectUrl);
        catalogState.teamLogoObjectUrl = null;
    }
}

function setTeamLogoPreview(url = '', fileName = 'PNG, JPG или WEBP') {
    releaseTeamLogoPreview();
    byId('teamLogoPreview').innerHTML = url
        ? `<img src="${escapeHtml(url)}" alt="">`
        : '<i data-lucide="image-plus"></i>';
    byId('teamLogoFileName').textContent = fileName;
    refreshIcons();
}

function resetTeamForm() {
    catalogState.editingTeamId = null;
    byId('teamForm').reset();
    byId('teamModalTitle').textContent = 'Новая команда';
    setTeamLogoPreview();
    showFormError('teamFormError');
}

function openTeamEditor(id) {
    const team = catalogState.teams.find((row) => Number(row.id) === Number(id));
    if (!team) return;
    catalogState.editingTeamId = team.id;
    byId('teamModalTitle').textContent = 'Редактировать команду';
    byId('teamName').value = team.name || '';
    setTeamLogoPreview(team.logo_url || '', team.logo_url ? 'Текущий логотип' : 'PNG, JPG или WEBP');
    showFormError('teamFormError');
    openModal('teamModal');
}

async function saveTeam(event) {
    event.preventDefault();
    const editingId = catalogState.editingTeamId;
    const logo = byId('teamLogo').files[0];
    if (!editingId && !logo) {
        showFormError('teamFormError', 'Добавьте логотип команды');
        return;
    }
    const formData = new FormData();
    formData.append('name', byId('teamName').value);
    if (logo) formData.append('logo', logo);
    try {
        showFormError('teamFormError');
        await apiJson(editingId ? `/api/tournament-team-catalog/${editingId}` : '/api/tournament-team-catalog', {
            method: editingId ? 'PUT' : 'POST',
            body: formData,
        });
        closeModal('teamModal');
        resetTeamForm();
        await loadTeams();
    } catch (error) {
        showFormError('teamFormError', error.message);
    }
}

async function deleteTeam(id) {
    const team = catalogState.teams.find((row) => Number(row.id) === Number(id));
    if (!team || !window.confirm(`Удалить команду «${team.name}» из базы?`)) return;
    await apiJson(`/api/tournament-team-catalog/${id}`, { method: 'DELETE' });
    await loadTeams();
}

function switchTab(tabName) {
    document.querySelectorAll('[data-catalog-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.catalogTab === tabName);
    });
    document.querySelectorAll('.tournament-catalog-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `catalogPanel-${tabName}`);
    });
}

function bindEvents() {
    document.querySelectorAll('[data-catalog-tab]').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.catalogTab));
    });
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });
    document.querySelectorAll('.tournament-catalog-modal').forEach((modal) => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal(modal.id);
        });
    });
    byId('openTournamentModalBtn').addEventListener('click', () => {
        resetTournamentForm();
        openModal('tournamentModal');
    });
    byId('openTeamModalBtn').addEventListener('click', () => {
        resetTeamForm();
        openModal('teamModal');
    });
    byId('tournamentForm').addEventListener('submit', saveTournament);
    byId('teamForm').addEventListener('submit', saveTeam);
    byId('teamLogo').addEventListener('change', () => {
        const file = byId('teamLogo').files[0];
        if (!file) {
            setTeamLogoPreview();
            return;
        }
        releaseTeamLogoPreview();
        catalogState.teamLogoObjectUrl = URL.createObjectURL(file);
        byId('teamLogoPreview').innerHTML = `<img src="${catalogState.teamLogoObjectUrl}" alt="">`;
        byId('teamLogoFileName').textContent = file.name;
    });
    byId('tournamentList').addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-tournament]');
        const deleteButton = event.target.closest('[data-delete-tournament]');
        if (editButton) openTournamentEditor(editButton.dataset.editTournament);
        if (deleteButton) deleteTournament(deleteButton.dataset.deleteTournament).catch(showPageError);
    });
    byId('teamList').addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-team]');
        const deleteButton = event.target.closest('[data-delete-team]');
        if (editButton) openTeamEditor(editButton.dataset.editTeam);
        if (deleteButton) deleteTeam(deleteButton.dataset.deleteTeam).catch(showPageError);
    });
}

function showPageError(error) {
    window.alert(error.message || 'Не удалось выполнить действие');
}

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    refreshIcons();
    try {
        await Promise.all([loadTournaments(), loadTeams()]);
    } catch (error) {
        showPageError(error);
    }
});
