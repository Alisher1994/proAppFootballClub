const catalogState = {
    tournaments: [],
    teams: [],
    stadiums: [],
    editingTournamentId: null,
    editingTeamId: null,
    editingMemberId: null,
    editingStadiumId: null,
    activeTeamId: null,
    teamLogoObjectUrl: null,
    trainerPhotoObjectUrl: null,
    memberPhotoObjectUrl: null,
    stadiumMap: null,
    stadiumMarker: null,
    activeFilterTab: 'tournaments',
    filters: {
        tournaments: { search: '', location: '', age: '' },
        teams: { search: '', trainer: '', minMembers: '' },
        stadiums: { search: '', phone: '' },
    },
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

function formatBirthDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    return year && month && day ? `${day}.${month}.${year}` : '—';
}

function isoToDisplayDate(value) {
    if (!value) return '';
    const [year, month, day] = String(value).split('-');
    return year && month && day ? `${day}.${month}.${year}` : '';
}

function pluralizeMembers(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} участник`;
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} участника`;
    return `${count} участников`;
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

function normalizeSearch(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function includesSearch(value, query) {
    return !query || normalizeSearch(value).includes(normalizeSearch(query));
}

function filteredTournaments() {
    const filter = catalogState.filters.tournaments;
    return catalogState.tournaments.filter((item) => {
        const searchable = [
            item.name,
            item.location,
            item.start_date,
            item.end_date,
            item.start_time,
            ...(item.age_groups || []),
        ].join(' ');
        return includesSearch(searchable, filter.search)
            && includesSearch(item.location, filter.location)
            && includesSearch((item.age_groups || []).join(' '), filter.age);
    });
}

function filteredTeams() {
    const filter = catalogState.filters.teams;
    const minimumMembers = filter.minMembers === '' ? null : Number(filter.minMembers);
    return catalogState.teams.filter((team) => {
        const searchable = [
            team.name,
            team.trainer_name,
            team.trainer_phone,
            team.administration_phone,
            team.club_address,
        ].join(' ');
        return includesSearch(searchable, filter.search)
            && includesSearch(team.trainer_name, filter.trainer)
            && (minimumMembers === null || (Number(team.member_count) || 0) >= minimumMembers);
    });
}

function filteredStadiums() {
    const filter = catalogState.filters.stadiums;
    return catalogState.stadiums.filter((stadium) => {
        const searchable = [
            stadium.name,
            stadium.owner_phone,
            stadium.latitude,
            stadium.longitude,
        ].join(' ');
        return includesSearch(searchable, filter.search)
            && includesSearch(stadium.owner_phone, filter.phone);
    });
}

function setCatalogCount(id, visibleCount, totalCount) {
    byId(id).textContent = visibleCount === totalCount
        ? String(totalCount)
        : `${visibleCount}/${totalCount}`;
}

function emptyCatalogMarkup(icon, title, description) {
    return `
        <div class="tournament-catalog-empty">
            <i data-lucide="${icon}"></i>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(description)}</span>
        </div>`;
}

function renderTournaments() {
    const items = filteredTournaments();
    setCatalogCount('tournamentCount', items.length, catalogState.tournaments.length);
    if (!items.length) {
        byId('tournamentList').innerHTML = emptyCatalogMarkup(
            'trophy',
            catalogState.tournaments.length ? 'Ничего не найдено' : 'Турниров пока нет',
            catalogState.tournaments.length
                ? 'Измените поисковый запрос или сбросьте фильтры.'
                : 'Создайте первый турнир, указав дату, время, возраст и локацию.',
        );
        refreshIcons();
        return;
    }
    byId('tournamentList').innerHTML = `
        <div class="catalog-table-wrap">
            <table class="catalog-data-table tournament-catalog-table">
                <thead>
                    <tr>
                        <th>Турнир</th>
                        <th>Дата проведения</th>
                        <th>Время</th>
                        <th>Локация</th>
                        <th>Возрастные группы</th>
                        <th aria-label="Действия"></th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item) => `
                        <tr>
                            <td data-label="Турнир">
                                <span class="catalog-primary-cell">
                                    <span class="catalog-row-icon"><i data-lucide="trophy"></i></span>
                                    <strong>${escapeHtml(item.name)}</strong>
                                </span>
                            </td>
                            <td data-label="Дата">${escapeHtml(tournamentDates(item))}</td>
                            <td data-label="Время">${escapeHtml(item.start_time || '—')}</td>
                            <td data-label="Локация">${escapeHtml(item.location || '—')}</td>
                            <td data-label="Возраст">
                                <span class="catalog-age-list">
                                    ${(item.age_groups || []).length
                                        ? item.age_groups.map((group) => `<span>${escapeHtml(group)}</span>`).join('')
                                        : '—'}
                                </span>
                            </td>
                            <td class="catalog-actions-cell">
                                <details class="team-actions-menu">
                                    <summary class="icon-button" aria-label="Действия с турниром">
                                        <i data-lucide="ellipsis-vertical"></i>
                                    </summary>
                                    <div class="team-actions-popover">
                                        <button type="button" data-edit-tournament="${item.id}">
                                            <i data-lucide="pencil"></i>
                                            Редактировать
                                        </button>
                                        <button class="danger" type="button" data-delete-tournament="${item.id}">
                                            <i data-lucide="trash-2"></i>
                                            Удалить
                                        </button>
                                    </div>
                                </details>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    refreshIcons();
}

function renderTeams() {
    const teams = filteredTeams();
    setCatalogCount('teamCount', teams.length, catalogState.teams.length);
    if (!teams.length) {
        byId('teamList').innerHTML = emptyCatalogMarkup(
            'shield',
            catalogState.teams.length ? 'Ничего не найдено' : 'База команд пуста',
            catalogState.teams.length
                ? 'Измените поисковый запрос или сбросьте фильтры.'
                : 'Добавьте название и логотип первой команды.',
        );
        refreshIcons();
        return;
    }
    byId('teamList').innerHTML = `
        <div class="team-catalog-table-wrap">
            <table class="catalog-data-table team-catalog-table">
                <thead>
                    <tr>
                        <th>Команда</th>
                        <th>Тренер</th>
                        <th>Контакты</th>
                        <th>Участники</th>
                        <th aria-label="Действия"></th>
                    </tr>
                </thead>
                <tbody>
                    ${teams.map((team) => `
                        <tr>
                            <td data-label="Команда">
                                <button class="team-table-team" type="button" data-open-team="${team.id}">
                                    <span class="team-table-logo">
                                        ${team.logo_url
                                            ? `<img src="${escapeHtml(team.logo_url)}" alt="">`
                                            : `<span>${escapeHtml(initials(team.name))}</span>`}
                                    </span>
                                    <span class="team-table-name">
                                        <strong>${escapeHtml(team.name)}</strong>
                                        <small>Открыть состав</small>
                                    </span>
                                </button>
                            </td>
                            <td data-label="Тренер">
                                <span class="team-table-value">${escapeHtml(team.trainer_name || '—')}</span>
                            </td>
                            <td data-label="Контакты">
                                <span class="team-table-contacts">
                                    ${team.trainer_phone || team.administration_phone
                                        ? `<span>${escapeHtml(team.trainer_phone || team.administration_phone)}</span>`
                                        : '<span>—</span>'}
                                    ${team.club_address ? `<small>${escapeHtml(team.club_address)}</small>` : ''}
                                </span>
                            </td>
                            <td data-label="Участники">
                                <span class="team-table-members">
                                    <i data-lucide="users-round"></i>
                                    ${escapeHtml(pluralizeMembers(Number(team.member_count) || 0))}
                                </span>
                            </td>
                            <td class="team-table-actions">
                                <details class="team-actions-menu">
                                    <summary class="icon-button" aria-label="Действия с командой">
                                        <i data-lucide="ellipsis-vertical"></i>
                                    </summary>
                                    <div class="team-actions-popover">
                                        <button type="button" data-edit-team="${team.id}">
                                            <i data-lucide="pencil"></i>
                                            Редактировать
                                        </button>
                                        <button class="danger" type="button" data-delete-team="${team.id}">
                                            <i data-lucide="trash-2"></i>
                                            Удалить
                                        </button>
                                    </div>
                                </details>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    refreshIcons();
}

function renderStadiums() {
    const stadiums = filteredStadiums();
    setCatalogCount('stadiumCount', stadiums.length, catalogState.stadiums.length);
    if (!stadiums.length) {
        byId('stadiumList').innerHTML = emptyCatalogMarkup(
            'map-pinned',
            catalogState.stadiums.length ? 'Ничего не найдено' : 'Стадионов пока нет',
            catalogState.stadiums.length
                ? 'Измените поисковый запрос или сбросьте фильтры.'
                : 'Добавьте стадион и отметьте его точку на карте.',
        );
        refreshIcons();
        return;
    }
    byId('stadiumList').innerHTML = `
        <div class="catalog-table-wrap">
            <table class="catalog-data-table stadium-catalog-table">
                <thead>
                    <tr>
                        <th>Стадион</th>
                        <th>Телефон владельца</th>
                        <th>Координаты</th>
                        <th>Локация</th>
                        <th aria-label="Действия"></th>
                    </tr>
                </thead>
                <tbody>
                    ${stadiums.map((stadium) => `
                        <tr>
                            <td data-label="Стадион">
                                <span class="catalog-primary-cell">
                                    <span class="catalog-row-icon"><i data-lucide="map-pin"></i></span>
                                    <strong>${escapeHtml(stadium.name)}</strong>
                                </span>
                            </td>
                            <td data-label="Телефон">${escapeHtml(stadium.owner_phone || '—')}</td>
                            <td data-label="Координаты">
                                ${Number(stadium.latitude).toFixed(6)}, ${Number(stadium.longitude).toFixed(6)}
                            </td>
                            <td data-label="Локация">
                                <a class="catalog-map-link" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(stadium.latitude)}&mlon=${encodeURIComponent(stadium.longitude)}#map=17/${encodeURIComponent(stadium.latitude)}/${encodeURIComponent(stadium.longitude)}"
                                    target="_blank" rel="noopener">
                                    <i data-lucide="map"></i>
                                    На карте
                                </a>
                            </td>
                            <td class="catalog-actions-cell">
                                <details class="team-actions-menu">
                                    <summary class="icon-button" aria-label="Действия со стадионом">
                                        <i data-lucide="ellipsis-vertical"></i>
                                    </summary>
                                    <div class="team-actions-popover">
                                        <button type="button" data-edit-stadium="${stadium.id}">
                                            <i data-lucide="pencil"></i>
                                            Редактировать
                                        </button>
                                        <button class="danger" type="button" data-delete-stadium="${stadium.id}">
                                            <i data-lucide="trash-2"></i>
                                            Удалить
                                        </button>
                                    </div>
                                </details>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
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

async function loadStadiums() {
    const data = await apiJson('/api/tournament-stadiums');
    catalogState.stadiums = data.stadiums || [];
    renderStadiums();
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

function releaseObjectUrl(stateKey) {
    if (catalogState[stateKey]) {
        URL.revokeObjectURL(catalogState[stateKey]);
        catalogState[stateKey] = null;
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

function setPhotoPreview(previewId, fileNameId, url = '', fallbackIcon = 'user-round', fileName = 'PNG, JPG или WEBP') {
    byId(previewId).innerHTML = url
        ? `<img src="${escapeHtml(url)}" alt="">`
        : `<i data-lucide="${fallbackIcon}"></i>`;
    byId(fileNameId).textContent = fileName;
    refreshIcons();
}

function resetTeamForm() {
    catalogState.editingTeamId = null;
    byId('teamForm').reset();
    byId('teamModalTitle').textContent = 'Новая команда';
    setTeamLogoPreview();
    releaseObjectUrl('trainerPhotoObjectUrl');
    setPhotoPreview(
        'trainerPhotoPreview',
        'trainerPhotoFileName',
        '',
        'user-round',
        'Необязательно · PNG, JPG или WEBP',
    );
    showFormError('teamFormError');
}

function openTeamEditor(id) {
    const team = catalogState.teams.find((row) => Number(row.id) === Number(id));
    if (!team) return;
    catalogState.editingTeamId = team.id;
    byId('teamModalTitle').textContent = 'Редактировать команду';
    byId('teamName').value = team.name || '';
    byId('teamTrainerName').value = team.trainer_name || '';
    byId('teamAdministrationPhone').value = team.administration_phone || '';
    byId('teamTrainerPhone').value = team.trainer_phone || '';
    byId('teamClubAddress').value = team.club_address || '';
    setTeamLogoPreview(team.logo_url || '', team.logo_url ? 'Текущий логотип' : 'PNG, JPG или WEBP');
    setPhotoPreview(
        'trainerPhotoPreview',
        'trainerPhotoFileName',
        team.trainer_photo_url || '',
        'user-round',
        team.trainer_photo_url ? 'Текущее фото тренера' : 'Необязательно · PNG, JPG или WEBP',
    );
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
    formData.append('trainer_name', byId('teamTrainerName').value);
    formData.append('administration_phone', byId('teamAdministrationPhone').value);
    formData.append('trainer_phone', byId('teamTrainerPhone').value);
    formData.append('club_address', byId('teamClubAddress').value);
    if (logo) formData.append('logo', logo);
    const trainerPhoto = byId('teamTrainerPhoto').files[0];
    if (trainerPhoto) formData.append('trainer_photo', trainerPhoto);
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

function teamLogoMarkup(team) {
    return team.logo_url
        ? `<img src="${escapeHtml(team.logo_url)}" alt="${escapeHtml(team.name)}">`
        : `<span>${escapeHtml(initials(team.name))}</span>`;
}

function renderTeamDetails(team) {
    catalogState.activeTeamId = team.id;
    byId('teamDetailsTitle').textContent = team.name;
    byId('teamDetailsLogo').innerHTML = teamLogoMarkup(team);
    const contacts = [
        team.trainer_name ? {
            icon: 'user-round',
            label: 'Тренер',
            value: team.trainer_name,
            photo: team.trainer_photo_url,
        } : null,
        team.trainer_phone ? { icon: 'phone', label: 'Телефон тренера', value: team.trainer_phone } : null,
        team.administration_phone ? { icon: 'building-2', label: 'Администрация', value: team.administration_phone } : null,
        team.club_address ? { icon: 'map-pin', label: 'Адрес клуба', value: team.club_address } : null,
    ].filter(Boolean);
    byId('teamContactSummary').innerHTML = contacts.length
        ? contacts.map((item) => `
            <div class="team-contact-item">
                ${item.photo
                    ? `<img src="${escapeHtml(item.photo)}" alt="">`
                    : `<span><i data-lucide="${item.icon}"></i></span>`}
                <div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></div>
            </div>`).join('')
        : '<div class="team-contact-empty">Контактные данные команды пока не заполнены.</div>';
    const members = team.members || [];
    byId('teamMemberCount').textContent = pluralizeMembers(members.length);
    byId('teamMembersTableBody').innerHTML = members.length
        ? members.map((member) => `
            <tr>
                <td data-label="Участник">
                    <div class="team-member-person">
                        <span class="team-member-avatar">
                            ${member.photo_url
                                ? `<img src="${escapeHtml(member.photo_url)}" alt="">`
                                : escapeHtml(initials(member.full_name))}
                        </span>
                        <div>
                            <strong>${escapeHtml(member.full_name)}</strong>
                            <small>${escapeHtml(member.address || 'Адрес не указан')}</small>
                        </div>
                    </div>
                </td>
                <td data-label="Дата рождения">${escapeHtml(formatBirthDate(member.birth_date))}</td>
                <td data-label="Паспорт">${escapeHtml(member.passport_series || '—')}</td>
                <td data-label="Телефоны">
                    <div class="team-member-phones">
                        <span>${escapeHtml(member.phone_primary || '—')}</span>
                        ${member.phone_secondary ? `<small>${escapeHtml(member.phone_secondary)}</small>` : ''}
                    </div>
                </td>
                <td data-label="Номер"><span class="team-number-badge">${escapeHtml(member.team_number || '—')}</span></td>
                <td class="team-member-actions">
                    <button class="icon-button" type="button" data-edit-member="${member.id}" aria-label="Редактировать">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="icon-button danger" type="button" data-delete-member="${member.id}" aria-label="Удалить">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>`).join('')
        : `<tr><td colspan="6"><div class="team-members-empty">
            <i data-lucide="users-round"></i>
            <strong>Участников пока нет</strong>
            <span>Добавьте первого игрока в состав команды.</span>
        </div></td></tr>`;
    refreshIcons();
}

async function openTeamDetails(id) {
    const data = await apiJson(`/api/tournament-team-catalog/${id}`);
    const index = catalogState.teams.findIndex((item) => Number(item.id) === Number(data.team.id));
    if (index >= 0) catalogState.teams[index] = data.team;
    renderTeamDetails(data.team);
    openModal('teamDetailsModal');
}

function resetMemberForm() {
    catalogState.editingMemberId = null;
    byId('memberForm').reset();
    byId('memberModalTitle').textContent = 'Новый участник';
    releaseObjectUrl('memberPhotoObjectUrl');
    setPhotoPreview('memberPhotoPreview', 'memberPhotoFileName', '', 'user-round-plus');
    showFormError('memberFormError');
}

function activeTeamMember(id) {
    const team = catalogState.teams.find((item) => Number(item.id) === Number(catalogState.activeTeamId));
    return (team?.members || []).find((item) => Number(item.id) === Number(id));
}

async function getActiveTeam() {
    if (!catalogState.activeTeamId) return null;
    const data = await apiJson(`/api/tournament-team-catalog/${catalogState.activeTeamId}`);
    const index = catalogState.teams.findIndex((item) => Number(item.id) === Number(data.team.id));
    if (index >= 0) catalogState.teams[index] = data.team;
    renderTeamDetails(data.team);
    renderTeams();
    return data.team;
}

async function openMemberEditor(id) {
    let member = activeTeamMember(id);
    if (!member) {
        const team = await getActiveTeam();
        member = (team?.members || []).find((item) => Number(item.id) === Number(id));
    }
    if (!member) return;
    catalogState.editingMemberId = member.id;
    byId('memberModalTitle').textContent = 'Редактировать участника';
    byId('memberLastName').value = member.last_name || '';
    byId('memberFirstName').value = member.first_name || '';
    byId('memberMiddleName').value = member.middle_name || '';
    byId('memberBirthDate').value = isoToDisplayDate(member.birth_date);
    byId('memberPassportSeries').value = member.passport_series || '';
    byId('memberAddress').value = member.address || '';
    byId('memberPhonePrimary').value = member.phone_primary || '';
    byId('memberPhoneSecondary').value = member.phone_secondary || '';
    byId('memberTeamNumber').value = member.team_number || '';
    setPhotoPreview(
        'memberPhotoPreview',
        'memberPhotoFileName',
        member.photo_url || '',
        'user-round-plus',
        member.photo_url ? 'Текущее фото участника' : 'PNG, JPG или WEBP',
    );
    showFormError('memberFormError');
    openModal('memberModal');
}

async function saveMember(event) {
    event.preventDefault();
    if (!catalogState.activeTeamId) return;
    const formData = new FormData();
    formData.append('last_name', byId('memberLastName').value);
    formData.append('first_name', byId('memberFirstName').value);
    formData.append('middle_name', byId('memberMiddleName').value);
    formData.append('birth_date', byId('memberBirthDate').value);
    formData.append('passport_series', byId('memberPassportSeries').value);
    formData.append('address', byId('memberAddress').value);
    formData.append('phone_primary', byId('memberPhonePrimary').value);
    formData.append('phone_secondary', byId('memberPhoneSecondary').value);
    formData.append('team_number', byId('memberTeamNumber').value);
    const photo = byId('memberPhoto').files[0];
    if (photo) formData.append('photo', photo);
    const editingId = catalogState.editingMemberId;
    try {
        showFormError('memberFormError');
        await apiJson(
            editingId
                ? `/api/tournament-team-members/${editingId}`
                : `/api/tournament-team-catalog/${catalogState.activeTeamId}/members`,
            { method: editingId ? 'PUT' : 'POST', body: formData },
        );
        closeModal('memberModal');
        resetMemberForm();
        await getActiveTeam();
    } catch (error) {
        showFormError('memberFormError', error.message);
    }
}

async function deleteMember(id) {
    const member = activeTeamMember(id);
    if (!member || !window.confirm(`Удалить участника «${member.full_name}»?`)) return;
    await apiJson(`/api/tournament-team-members/${id}`, { method: 'DELETE' });
    await getActiveTeam();
}

function setStadiumCoordinates(latitude, longitude) {
    byId('stadiumLatitude').value = Number(latitude).toFixed(7);
    byId('stadiumLongitude').value = Number(longitude).toFixed(7);
    byId('stadiumCoordinates').textContent = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
    if (!catalogState.stadiumMap || !window.L) return;
    const latLng = [Number(latitude), Number(longitude)];
    if (catalogState.stadiumMarker) {
        catalogState.stadiumMarker.setLatLng(latLng);
    } else {
        catalogState.stadiumMarker = L.marker(latLng).addTo(catalogState.stadiumMap);
    }
}

function ensureStadiumMap(latitude = 41.3111, longitude = 69.2797, hasSelection = false) {
    if (!window.L) {
        byId('stadiumMap').innerHTML = '<div class="stadium-map-error">Карта не загрузилась. Проверьте подключение к интернету.</div>';
        return;
    }
    if (!catalogState.stadiumMap) {
        catalogState.stadiumMap = L.map('stadiumMap').setView([latitude, longitude], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
        }).addTo(catalogState.stadiumMap);
        catalogState.stadiumMap.on('click', (event) => {
            setStadiumCoordinates(event.latlng.lat, event.latlng.lng);
        });
    } else {
        catalogState.stadiumMap.setView([latitude, longitude], hasSelection ? 16 : 12);
    }
    if (catalogState.stadiumMarker) {
        catalogState.stadiumMarker.remove();
        catalogState.stadiumMarker = null;
    }
    if (hasSelection) setStadiumCoordinates(latitude, longitude);
    window.setTimeout(() => catalogState.stadiumMap.invalidateSize(), 80);
}

function resetStadiumForm() {
    catalogState.editingStadiumId = null;
    byId('stadiumForm').reset();
    byId('stadiumModalTitle').textContent = 'Новый стадион';
    byId('stadiumCoordinates').textContent = 'Нажмите на карту, чтобы поставить точку';
    showFormError('stadiumFormError');
}

function openStadiumCreator() {
    resetStadiumForm();
    openModal('stadiumModal');
    ensureStadiumMap();
}

function openStadiumEditor(id) {
    const stadium = catalogState.stadiums.find((item) => Number(item.id) === Number(id));
    if (!stadium) return;
    catalogState.editingStadiumId = stadium.id;
    byId('stadiumModalTitle').textContent = 'Редактировать стадион';
    byId('stadiumName').value = stadium.name || '';
    byId('stadiumOwnerPhone').value = stadium.owner_phone || '';
    showFormError('stadiumFormError');
    openModal('stadiumModal');
    ensureStadiumMap(stadium.latitude, stadium.longitude, true);
}

async function saveStadium(event) {
    event.preventDefault();
    const editingId = catalogState.editingStadiumId;
    try {
        showFormError('stadiumFormError');
        await apiJson(editingId ? `/api/tournament-stadiums/${editingId}` : '/api/tournament-stadiums', {
            method: editingId ? 'PUT' : 'POST',
            body: JSON.stringify({
                name: byId('stadiumName').value,
                owner_phone: byId('stadiumOwnerPhone').value,
                latitude: byId('stadiumLatitude').value,
                longitude: byId('stadiumLongitude').value,
            }),
        });
        closeModal('stadiumModal');
        resetStadiumForm();
        await loadStadiums();
    } catch (error) {
        showFormError('stadiumFormError', error.message);
    }
}

async function deleteStadium(id) {
    const stadium = catalogState.stadiums.find((item) => Number(item.id) === Number(id));
    if (!stadium || !window.confirm(`Удалить стадион «${stadium.name}»?`)) return;
    await apiJson(`/api/tournament-stadiums/${id}`, { method: 'DELETE' });
    await loadStadiums();
}

function renderCatalogTab(tabName) {
    if (tabName === 'tournaments') renderTournaments();
    if (tabName === 'teams') renderTeams();
    if (tabName === 'stadiums') renderStadiums();
}

function hasActiveCatalogFilter(tabName) {
    const filter = catalogState.filters[tabName];
    if (tabName === 'tournaments') return Boolean(filter.location || filter.age);
    if (tabName === 'teams') return Boolean(filter.trainer || filter.minMembers !== '');
    if (tabName === 'stadiums') return Boolean(filter.phone);
    return false;
}

function updateFilterIndicator(tabName) {
    const indicator = document.querySelector(`[data-filter-indicator="${tabName}"]`);
    if (indicator) indicator.hidden = !hasActiveCatalogFilter(tabName);
}

function openCatalogFilter(tabName) {
    catalogState.activeFilterTab = tabName;
    const titles = {
        tournaments: 'Фильтр турниров',
        teams: 'Фильтр команд',
        stadiums: 'Фильтр стадионов',
    };
    byId('catalogFilterTitle').textContent = titles[tabName] || 'Фильтр';
    document.querySelectorAll('[data-filter-fields]').forEach((section) => {
        section.hidden = section.dataset.filterFields !== tabName;
    });

    const filter = catalogState.filters[tabName];
    if (tabName === 'tournaments') {
        byId('filterTournamentLocation').value = filter.location;
        byId('filterTournamentAge').value = filter.age;
    }
    if (tabName === 'teams') {
        byId('filterTeamTrainer').value = filter.trainer;
        byId('filterTeamMinMembers').value = filter.minMembers;
    }
    if (tabName === 'stadiums') {
        byId('filterStadiumPhone').value = filter.phone;
    }
    openModal('catalogFilterModal');
}

function applyCatalogFilter(event) {
    event.preventDefault();
    const tabName = catalogState.activeFilterTab;
    if (tabName === 'tournaments') {
        catalogState.filters.tournaments.location = byId('filterTournamentLocation').value.trim();
        catalogState.filters.tournaments.age = byId('filterTournamentAge').value.trim();
    }
    if (tabName === 'teams') {
        catalogState.filters.teams.trainer = byId('filterTeamTrainer').value.trim();
        catalogState.filters.teams.minMembers = byId('filterTeamMinMembers').value;
    }
    if (tabName === 'stadiums') {
        catalogState.filters.stadiums.phone = byId('filterStadiumPhone').value.trim();
    }
    updateFilterIndicator(tabName);
    renderCatalogTab(tabName);
    closeModal('catalogFilterModal');
}

function resetCatalogFilter() {
    const tabName = catalogState.activeFilterTab;
    if (tabName === 'tournaments') {
        catalogState.filters.tournaments.location = '';
        catalogState.filters.tournaments.age = '';
    }
    if (tabName === 'teams') {
        catalogState.filters.teams.trainer = '';
        catalogState.filters.teams.minMembers = '';
    }
    if (tabName === 'stadiums') {
        catalogState.filters.stadiums.phone = '';
    }
    updateFilterIndicator(tabName);
    renderCatalogTab(tabName);
    closeModal('catalogFilterModal');
}

function switchTab(tabName) {
    document.querySelectorAll('[data-catalog-tab]').forEach((button) => {
        const isActive = button.dataset.catalogTab === tabName;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('.tournament-catalog-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `catalogPanel-${tabName}`);
    });
    document.querySelectorAll('.team-actions-menu[open]').forEach((menu) => menu.removeAttribute('open'));
}

function bindEvents() {
    document.querySelectorAll('[data-catalog-tab]').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.catalogTab));
    });
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });
    document.querySelectorAll('[data-catalog-search]').forEach((input) => {
        input.addEventListener('input', () => {
            const tabName = input.dataset.catalogSearch;
            catalogState.filters[tabName].search = input.value;
            renderCatalogTab(tabName);
        });
    });
    document.querySelectorAll('[data-open-filter]').forEach((button) => {
        button.addEventListener('click', () => openCatalogFilter(button.dataset.openFilter));
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
    byId('openStadiumModalBtn').addEventListener('click', openStadiumCreator);
    byId('openMemberModalBtn').addEventListener('click', () => {
        resetMemberForm();
        openModal('memberModal');
    });
    byId('tournamentForm').addEventListener('submit', saveTournament);
    byId('teamForm').addEventListener('submit', saveTeam);
    byId('memberForm').addEventListener('submit', saveMember);
    byId('stadiumForm').addEventListener('submit', saveStadium);
    byId('catalogFilterForm').addEventListener('submit', applyCatalogFilter);
    byId('resetCatalogFilterBtn').addEventListener('click', resetCatalogFilter);
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
    byId('teamTrainerPhoto').addEventListener('change', () => {
        const file = byId('teamTrainerPhoto').files[0];
        releaseObjectUrl('trainerPhotoObjectUrl');
        if (!file) {
            setPhotoPreview(
                'trainerPhotoPreview',
                'trainerPhotoFileName',
                '',
                'user-round',
                'Необязательно · PNG, JPG или WEBP',
            );
            return;
        }
        catalogState.trainerPhotoObjectUrl = URL.createObjectURL(file);
        setPhotoPreview(
            'trainerPhotoPreview',
            'trainerPhotoFileName',
            catalogState.trainerPhotoObjectUrl,
            'user-round',
            file.name,
        );
    });
    byId('memberPhoto').addEventListener('change', () => {
        const file = byId('memberPhoto').files[0];
        releaseObjectUrl('memberPhotoObjectUrl');
        if (!file) {
            setPhotoPreview('memberPhotoPreview', 'memberPhotoFileName', '', 'user-round-plus');
            return;
        }
        catalogState.memberPhotoObjectUrl = URL.createObjectURL(file);
        setPhotoPreview(
            'memberPhotoPreview',
            'memberPhotoFileName',
            catalogState.memberPhotoObjectUrl,
            'user-round-plus',
            file.name,
        );
    });
    byId('memberBirthDate').addEventListener('input', (event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
        event.target.value = [
            digits.slice(0, 2),
            digits.slice(2, 4),
            digits.slice(4, 8),
        ].filter(Boolean).join('.');
    });
    byId('tournamentList').addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-tournament]');
        const deleteButton = event.target.closest('[data-delete-tournament]');
        if (editButton) openTournamentEditor(editButton.dataset.editTournament);
        if (deleteButton) deleteTournament(deleteButton.dataset.deleteTournament).catch(showPageError);
    });
    byId('teamList').addEventListener('click', (event) => {
        const menu = event.target.closest('.team-actions-menu');
        const menuSummary = event.target.closest('.team-actions-menu > summary');
        if (menuSummary) {
            document.querySelectorAll('.team-actions-menu[open]').forEach((item) => {
                if (item !== menu) item.removeAttribute('open');
            });
            return;
        }
        const editButton = event.target.closest('[data-edit-team]');
        const deleteButton = event.target.closest('[data-delete-team]');
        if (editButton) {
            menu?.removeAttribute('open');
            openTeamEditor(editButton.dataset.editTeam);
            return;
        }
        if (deleteButton) {
            menu?.removeAttribute('open');
            deleteTeam(deleteButton.dataset.deleteTeam).catch(showPageError);
            return;
        }
        const openButton = event.target.closest('[data-open-team]');
        if (openButton) openTeamDetails(openButton.dataset.openTeam).catch(showPageError);
    });
    document.addEventListener('click', (event) => {
        const menu = event.target.closest('.team-actions-menu');
        const summary = event.target.closest('.team-actions-menu > summary');
        if (summary) {
            document.querySelectorAll('.team-actions-menu[open]').forEach((item) => {
                if (item !== menu) item.removeAttribute('open');
            });
            return;
        }
        if (menu) return;
        document.querySelectorAll('.team-actions-menu[open]').forEach((menu) => {
            menu.removeAttribute('open');
        });
    });
    byId('teamMembersTableBody').addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-member]');
        const deleteButton = event.target.closest('[data-delete-member]');
        if (editButton) openMemberEditor(editButton.dataset.editMember).catch(showPageError);
        if (deleteButton) deleteMember(deleteButton.dataset.deleteMember).catch(showPageError);
    });
    byId('stadiumList').addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-stadium]');
        const deleteButton = event.target.closest('[data-delete-stadium]');
        if (editButton) openStadiumEditor(editButton.dataset.editStadium);
        if (deleteButton) deleteStadium(deleteButton.dataset.deleteStadium).catch(showPageError);
    });
}

function showPageError(error) {
    window.alert(error.message || 'Не удалось выполнить действие');
}

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    refreshIcons();
    try {
        await Promise.all([loadTournaments(), loadTeams(), loadStadiums()]);
    } catch (error) {
        showPageError(error);
    }
});
