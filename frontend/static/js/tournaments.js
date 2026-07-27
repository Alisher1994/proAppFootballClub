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
        <article class="team-catalog-card" data-open-team="${team.id}" tabindex="0" role="button"
            aria-label="Открыть команду ${escapeHtml(team.name)}">
            <div class="team-catalog-card-logo">
                ${team.logo_url
                    ? `<img src="${escapeHtml(team.logo_url)}" alt="${escapeHtml(team.name)}">`
                    : `<span>${escapeHtml(initials(team.name))}</span>`}
            </div>
            <strong>${escapeHtml(team.name)}</strong>
            <span class="team-catalog-member-count">
                <i data-lucide="users-round"></i>
                ${escapeHtml(pluralizeMembers(Number(team.member_count) || 0))}
            </span>
            ${team.trainer_name ? `<small class="team-catalog-trainer">Тренер: ${escapeHtml(team.trainer_name)}</small>` : ''}
            <div class="team-catalog-card-actions">
                <button class="btn-secondary team-open-button" type="button" data-open-team="${team.id}">
                    Открыть
                </button>
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

function renderStadiums() {
    byId('stadiumCount').textContent = catalogState.stadiums.length;
    if (!catalogState.stadiums.length) {
        byId('stadiumList').innerHTML = `
            <div class="tournament-catalog-empty">
                <i data-lucide="map-pinned"></i>
                <strong>Стадионов пока нет</strong>
                <span>Добавьте стадион и отметьте его точку на карте.</span>
            </div>`;
        refreshIcons();
        return;
    }
    byId('stadiumList').innerHTML = catalogState.stadiums.map((stadium) => `
        <article class="stadium-catalog-card">
            <div class="stadium-catalog-card-icon"><i data-lucide="map-pin"></i></div>
            <div class="stadium-catalog-card-copy">
                <strong>${escapeHtml(stadium.name)}</strong>
                <span>${escapeHtml(stadium.owner_phone || 'Телефон не указан')}</span>
                <small>${Number(stadium.latitude).toFixed(6)}, ${Number(stadium.longitude).toFixed(6)}</small>
            </div>
            <div class="stadium-catalog-card-actions">
                <a class="btn-secondary" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(stadium.latitude)}&mlon=${encodeURIComponent(stadium.longitude)}#map=17/${encodeURIComponent(stadium.latitude)}/${encodeURIComponent(stadium.longitude)}"
                    target="_blank" rel="noopener">На карте</a>
                <button class="icon-button" type="button" data-edit-stadium="${stadium.id}" aria-label="Редактировать">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="icon-button danger" type="button" data-delete-stadium="${stadium.id}" aria-label="Удалить">
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
    byId('openStadiumModalBtn').addEventListener('click', openStadiumCreator);
    byId('openMemberModalBtn').addEventListener('click', () => {
        resetMemberForm();
        openModal('memberModal');
    });
    byId('tournamentForm').addEventListener('submit', saveTournament);
    byId('teamForm').addEventListener('submit', saveTeam);
    byId('memberForm').addEventListener('submit', saveMember);
    byId('stadiumForm').addEventListener('submit', saveStadium);
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
        const editButton = event.target.closest('[data-edit-team]');
        const deleteButton = event.target.closest('[data-delete-team]');
        if (editButton) {
            openTeamEditor(editButton.dataset.editTeam);
            return;
        }
        if (deleteButton) {
            deleteTeam(deleteButton.dataset.deleteTeam).catch(showPageError);
            return;
        }
        const openButton = event.target.closest('[data-open-team]');
        if (openButton) openTeamDetails(openButton.dataset.openTeam).catch(showPageError);
    });
    byId('teamList').addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        const card = event.target.closest('article[data-open-team]');
        if (!card || event.target.closest('button')) return;
        event.preventDefault();
        openTeamDetails(card.dataset.openTeam).catch(showPageError);
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
