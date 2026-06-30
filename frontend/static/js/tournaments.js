const tournamentState = {
    tournaments: [],
    groups: [],
    teams: [],
    matches: [],
    players: [],
    selectedTournamentId: null,
    selectedMatchId: null,
    currentMatch: null,
    lineup: [],
    activeLineupSlot: null,
    activeEventSlot: null,
    eventDraftType: null,
    analytics: null,
    activeTab: 'bracket',
    lineupSnapshot: '',
    matchSettingsSnapshot: '',
};

const POSITIONS_ORDER = ['Вратарь', 'Защитник', 'Полузащитник', 'Нападающий', 'Игрок'];
const ROUND_LABELS = {
    group: 'Группа',
    quarterfinal: '1/4 финала',
    semifinal: 'Полуфинал',
    final: 'Финал',
};
const STATUS_LABELS = {
    planned: 'Запланирован',
    active: 'Идёт',
    finished: 'Завершён',
    scheduled: 'Запланирован',
    live: 'Идёт',
};
const FORMATION_ROWS = {
    '4-3-3': [1, 4, 3, 3],
    '4-4-2': [1, 4, 4, 2],
    '3-5-2': [1, 3, 5, 2],
    '5-3-2': [1, 5, 3, 2],
    '4-2-3-1': [1, 4, 2, 3, 1],
};

function qs(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

async function apiJson(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const response = await fetch(url, {
        ...options,
        headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Не удалось выполнить действие');
    }
    return data;
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('ru-RU');
}

function formatDateTime(value) {
    if (!value) return 'Дата не указана';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function displayStudentName(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts.join(' ') || 'Без имени';
    return `${parts.slice(1).join(' ')} ${parts[0]}`;
}

function firstNameLetter(value) {
    return (displayStudentName(value).trim()[0] || '#').toLocaleUpperCase('ru-RU');
}

function selectedTournament() {
    return tournamentState.tournaments.find((item) => Number(item.id) === Number(tournamentState.selectedTournamentId));
}

function teamById(id) {
    return tournamentState.teams.find((item) => Number(item.id) === Number(id));
}

function logoImg(url, className, alt = '') {
    return url ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : '';
}

function systemSquareLogo(className = 'lineup-system-logo') {
    const url = window.SYSTEM_SQUARE_LOGO_URL || '/static/uploads/favicon.png';
    return `<img class="${className}" src="${escapeHtml(url)}" alt="">`;
}

function lineupSnapshotKey(lineup = tournamentState.lineup) {
    return JSON.stringify(
        (lineup || [])
            .map((item) => ({
                student_id: Number(item.student_id),
                position: item.position || '',
                sort_order: Number(item.sort_order),
                is_starter: item.is_starter !== false,
            }))
            .sort((a, b) => a.sort_order - b.sort_order || a.student_id - b.student_id)
    );
}

function matchSettingsSnapshotKey(match = tournamentState.currentMatch) {
    if (!match) return '';
    return JSON.stringify({
        round_name: match.round_name || 'group',
        bracket_side: match.bracket_side || 'left',
        bracket_order: String(match.bracket_order || 0),
        formation: match.formation || '4-3-3',
    });
}

function currentMatchSettingsKeyFromControls() {
    return JSON.stringify({
        round_name: qs('currentMatchRound')?.value || tournamentState.currentMatch?.round_name || 'group',
        bracket_side: qs('currentMatchSide')?.value || tournamentState.currentMatch?.bracket_side || 'left',
        bracket_order: String(qs('currentMatchOrder')?.value || tournamentState.currentMatch?.bracket_order || 0),
        formation: qs('currentMatchFormation')?.value || tournamentState.currentMatch?.formation || '4-3-3',
    });
}

function updateLineupHeaderDirtyButtons() {
    const saveLineupBtn = qs('saveLineupBtn');
    const saveMatchBtn = qs('saveMatchSettingsBtn');
    if (saveLineupBtn) saveLineupBtn.disabled = lineupSnapshotKey() === tournamentState.lineupSnapshot;
    if (saveMatchBtn) saveMatchBtn.disabled = currentMatchSettingsKeyFromControls() === tournamentState.matchSettingsSnapshot;
}

function openModal(id) {
    const modal = qs(id);
    if (modal) {
        modal.hidden = false;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = qs(id);
    if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function loadGroups() {
    const groups = await apiJson('/api/groups');
    tournamentState.groups = Array.isArray(groups) ? groups : (groups.groups || []);
    renderGroupControls();
}

async function loadTournaments() {
    const data = await apiJson('/api/tournaments');
    tournamentState.tournaments = data.tournaments || [];
    if (!tournamentState.selectedTournamentId && tournamentState.tournaments.length) {
        tournamentState.selectedTournamentId = tournamentState.tournaments[0].id;
    }
    renderTournamentSelect();
    if (tournamentState.selectedTournamentId) {
        await selectTournament(tournamentState.selectedTournamentId, false);
    } else {
        renderEmptyState();
    }
}

function renderTournamentSelect() {
    const select = qs('tournamentSelect');
    if (select) {
        select.innerHTML = '<option value="">Выберите турнир</option>' + tournamentState.tournaments.map((item) => (
            `<option value="${item.id}" ${Number(item.id) === Number(tournamentState.selectedTournamentId) ? 'selected' : ''}>
                ${escapeHtml(item.name)} · ${STATUS_LABELS[item.status] || item.status || '-'}
            </option>`
        )).join('');
    }
    renderTournamentList();
}

function renderTournamentList() {
    const list = qs('tournamentList');
    if (!list) return;
    if (!tournamentState.tournaments.length) {
        list.innerHTML = '<div class="empty-state small">Турниров пока нет.</div>';
        return;
    }

    list.innerHTML = tournamentState.tournaments.map((item) => {
        const isActive = Number(item.id) === Number(tournamentState.selectedTournamentId);
        const status = STATUS_LABELS[item.status] || item.status || '-';
        const startDate = formatDate(item.start_date);
        const endDate = formatDate(item.end_date);
        const dates = [startDate, endDate].filter((value) => value && value !== '-').join(' - ');
        const matchesCount = Number(item.matches_count || item.match_count || item.matches?.length || 0);
        return `
            <button class="tournament-list-item ${isActive ? 'active' : ''}" type="button" data-tournament-id="${item.id}">
                <span class="tournament-list-title">${escapeHtml(item.name || 'Без названия')}</span>
                <span class="tournament-list-status">${escapeHtml(status)}</span>
                <span class="tournament-list-meta">
                    <span>${escapeHtml(item.season || 'Без сезона')}</span>
                    ${dates ? `<span>${escapeHtml(dates)}</span>` : ''}
                </span>
                <span class="tournament-list-count">${matchesCount} матч.</span>
            </button>
        `;
    }).join('');

    list.querySelectorAll('[data-tournament-id]').forEach((button) => {
        button.addEventListener('click', () => selectTournament(button.dataset.tournamentId));
    });
}

function renderGroupControls() {
    const options = tournamentState.groups.map((group) => (
        `<option value="${group.id}">${escapeHtml(group.name)}</option>`
    )).join('');
    qs('teamSourceGroups').innerHTML = options;
}

function renderTeamSelects() {
    const empty = '<option value="">Выберите команду</option>';
    const options = tournamentState.teams.map((team) => (
        `<option value="${team.id}">${escapeHtml(team.name)}</option>`
    )).join('');
    qs('matchHomeTeam').innerHTML = empty + options;
    qs('matchAwayTeam').innerHTML = empty + options;
}

async function selectTournament(tournamentId, resetMatch = true) {
    tournamentState.selectedTournamentId = Number(tournamentId) || null;
    if (resetMatch) {
        tournamentState.selectedMatchId = null;
        tournamentState.currentMatch = null;
        tournamentState.lineup = [];
    }
    qs('openTeamModalBtn').disabled = !tournamentState.selectedTournamentId;
    qs('openMatchModalBtn').disabled = !tournamentState.selectedTournamentId;
    renderTournamentSelect();
    if (!tournamentState.selectedTournamentId) {
        tournamentState.teams = [];
        tournamentState.matches = [];
        tournamentState.analytics = null;
        renderEmptyState();
        return;
    }
    await Promise.all([loadTeams(), loadMatches(), loadAnalytics()]);
    renderBracket();
    if (!tournamentState.selectedMatchId) hideWorkspace();
}

async function loadTeams() {
    if (!tournamentState.selectedTournamentId) return;
    const data = await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/teams`);
    tournamentState.teams = data.teams || [];
    renderTeams();
    renderTeamSelects();
}

function renderTeams() {
    const list = qs('teamList');
    if (!tournamentState.selectedTournamentId) {
        list.innerHTML = '<div class="empty-state">Выберите турнир.</div>';
        return;
    }
    if (!tournamentState.teams.length) {
        list.innerHTML = '<div class="empty-state">Добавьте команды турнира.</div>';
        return;
    }
    list.innerHTML = tournamentState.teams.map((team) => {
        const groups = (team.source_groups || []).map((item) => item.group_name).filter(Boolean).join(', ');
        const typeLabel = team.team_type === 'external' ? 'Внешняя команда' : 'Наша команда';
        const players = [...(team.players || []), ...(team.external_players || [])].slice(0, 6);
        return `
            <article class="tournament-team-card">
                ${logoImg(team.logo_url, 'tournament-team-logo', team.name) || '<span class="tournament-team-logo avatar-fallback">?</span>'}
                <div>
                    <strong>${escapeHtml(team.name)}</strong>
                    <span>${escapeHtml(typeLabel)}${groups ? ` · ${escapeHtml(groups)}` : ''}</span>
                </div>
                <div class="team-mini-roster">
                    ${players.map((player) => `<span>${escapeHtml(player.name)}${player.number ? ` №${escapeHtml(player.number)}` : ''}</span>`).join('')}
                    ${(team.players_count || 0) > players.length ? `<span>+${(team.players_count || 0) - players.length}</span>` : ''}
                </div>
            </article>
        `;
    }).join('');
}

async function loadMatches() {
    if (!tournamentState.selectedTournamentId) return;
    const data = await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/matches`);
    tournamentState.matches = data.matches || [];
    if (!tournamentState.selectedMatchId && tournamentState.matches.length) {
        tournamentState.selectedMatchId = tournamentState.matches[0].id;
    }
    renderMatches();
    if (tournamentState.selectedMatchId) {
        await selectMatch(tournamentState.selectedMatchId, false);
    } else {
        hideWorkspace();
    }
}

function renderMatches() {
    const list = qs('matchList');
    if (!tournamentState.selectedTournamentId) {
        list.innerHTML = '<div class="empty-state">Выберите турнир.</div>';
        return;
    }
    if (!tournamentState.matches.length) {
        list.innerHTML = '<div class="empty-state">Матчей пока нет.</div>';
        return;
    }
    list.innerHTML = tournamentState.matches.map((match) => `
        <button class="entity-item match-item ${match.id === tournamentState.selectedMatchId ? 'active' : ''}" type="button"
            data-match-id="${match.id}">
            <span class="entity-title">${escapeHtml(match.home_team)} <b>${match.home_score}:${match.away_score}</b> ${escapeHtml(match.away_team)}</span>
            <span class="entity-meta">${formatDateTime(match.match_date)}</span>
            <span class="entity-bottom">
                <span>${escapeHtml(ROUND_LABELS[match.round_name] || 'Матч')}</span>
                <span>${match.players_count || 0} игрок.</span>
            </span>
        </button>
    `).join('');
    list.querySelectorAll('[data-match-id]').forEach((button) => {
        button.addEventListener('click', () => selectMatch(Number(button.dataset.matchId)));
    });
}

async function selectMatch(matchId, rerenderList = true) {
    tournamentState.selectedMatchId = matchId;
    tournamentState.activeLineupSlot = null;
    tournamentState.activeEventSlot = null;
    tournamentState.eventDraftType = null;
    const data = await apiJson(`/api/tournament-matches/${matchId}`);
    tournamentState.currentMatch = data.match;
    tournamentState.lineup = [...(data.match.lineups || [])];
    tournamentState.lineupSnapshot = lineupSnapshotKey();
    tournamentState.matchSettingsSnapshot = matchSettingsSnapshotKey();
    if (rerenderList) {
        renderMatches();
        renderBracket();
    }
    await loadPlayersForMatch(data.match);
    showWorkspace();
}

async function loadPlayersForMatch(match) {
    const url = new URL(`/api/tournaments/${tournamentState.selectedTournamentId}/players`, window.location.origin);
    if (match.home_team_id) {
        url.searchParams.set('team_id', match.home_team_id);
    } else if (match.group_id) {
        url.searchParams.set('group_id', match.group_id);
    }
    const data = await apiJson(url.pathname + url.search);
    tournamentState.players = data.players || [];
    renderPlayerSelects();
}

async function loadStudentsForTeamPicker() {
    const selectedGroupIds = Array.from(qs('teamSourceGroups').selectedOptions).map((option) => Number(option.value));
    let players = [];
    if (!selectedGroupIds.length) {
        qs('teamPlayerPicker').innerHTML = '<div class="empty-state small">Выберите одну или несколько групп-источников.</div>';
        return;
    }
    for (const groupId of selectedGroupIds) {
        const url = new URL(`/api/tournaments/${tournamentState.selectedTournamentId}/players`, window.location.origin);
        url.searchParams.set('group_id', groupId);
        const data = await apiJson(url.pathname + url.search);
        players = players.concat(data.players || []);
    }
    const seen = new Set();
    players = players.filter((player) => {
        if (seen.has(player.id)) return false;
        seen.add(player.id);
        return true;
    });
    qs('teamPlayerPicker').innerHTML = players.length ? players.map((player) => `
        <label class="team-player-option">
            <input type="checkbox" value="${player.id}" checked>
            ${player.photo_url ? `<img src="${player.photo_url}" alt="">` : `<span class="avatar-fallback">${escapeHtml((player.name || '?').slice(0, 1))}</span>`}
            <span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.group_name || '')}</small></span>
        </label>
    `).join('') : '<div class="empty-state small">В выбранных группах нет игроков.</div>';
}

function renderPlayerSelects() {
    const match = tournamentState.currentMatch;
    const homeTeam = teamById(match?.home_team_id);
    const awayTeam = teamById(match?.away_team_id);
    const eventPlayers = [];
    tournamentState.players.forEach((player) => {
        eventPlayers.push({
            value: `student:${player.id}`,
            label: `${player.name}${player.number ? ` (№${player.number})` : ''}`,
        });
    });
    [homeTeam, awayTeam].filter(Boolean).forEach((team) => {
        (team.external_players || []).forEach((player) => {
            eventPlayers.push({
                value: `external:${player.id}`,
                label: `${player.name}${player.number ? ` (№${player.number})` : ''} · ${team.name}`,
            });
        });
    });
    const options = eventPlayers.map((player) =>
        `<option value="${escapeHtml(player.value)}">${escapeHtml(player.label)}</option>`
    ).join('');
    if (qs('eventPlayer')) {
        qs('eventPlayer').innerHTML = '<option value="">Выберите игрока</option>' + options;
    }
    if (qs('eventAssist')) {
        qs('eventAssist').innerHTML = '<option value="">Без голевого паса</option>' + options;
    }
    renderLineupPicker();
}

function renderLineupPicker() {
    const picker = qs('lineupPlayerPopover');
    if (!picker) return;
    const activeSlot = tournamentState.activeLineupSlot === null
        ? null
        : lineupSlots().find((slot) => slot.order === Number(tournamentState.activeLineupSlot));
    if (!activeSlot) {
        picker.innerHTML = '';
        closeLineupPicker();
        return;
    }
    const search = (qs('lineupModalSearch')?.value || qs('lineupSearch')?.value || '').trim().toLowerCase();
    const currentPlayer = tournamentState.lineup.find((item) => Number(item.sort_order) === activeSlot.order);
    const selectedIds = new Set(
        tournamentState.lineup
            .filter((item) => Number(item.sort_order) !== activeSlot.order)
            .map((item) => Number(item.student_id))
    );
    const players = tournamentState.players.filter((player) => {
        const displayName = displayStudentName(player.name);
        const haystack = `${player.name || ''} ${displayName} ${player.number || ''} ${player.group_name || ''}`.toLowerCase();
        return !selectedIds.has(Number(player.id)) && (!search || haystack.includes(search));
    }).sort((a, b) => displayStudentName(a.name).localeCompare(displayStudentName(b.name), 'ru'));
    const groups = players.reduce((acc, player) => {
        const letter = firstNameLetter(player.name);
        if (!acc.has(letter)) acc.set(letter, []);
        acc.get(letter).push(player);
        return acc;
    }, new Map());
    const groupedPlayersHtml = Array.from(groups.entries()).map(([letter, groupPlayers]) => `
        <section class="lineup-alpha-group">
            <h3>${escapeHtml(letter)}</h3>
            <div class="lineup-alpha-grid">
                ${groupPlayers.map((player) => {
                    const displayName = displayStudentName(player.name);
                    return `
                        <button class="lineup-player-choice" type="button" data-player-id="${player.id}">
                            ${player.photo_url ? `<img src="${player.photo_url}" alt="">` : `<span class="avatar-fallback">${escapeHtml(displayName.slice(0, 1))}</span>`}
                            <span>
                                <strong>${systemSquareLogo()}${escapeHtml(displayName)}</strong>
                                <small>${player.number ? `№${escapeHtml(player.number)} · ` : ''}${escapeHtml(player.group_name || 'Без группы')}</small>
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>
        </section>
    `).join('');

    picker.innerHTML = `
        <div class="lineup-popover-head">
            <strong>${escapeHtml(activeSlot.position)}</strong>
            <span>${currentPlayer ? escapeHtml(currentPlayer.student_name) : 'Выберите ученика'}</span>
            <button type="button" data-close-lineup-picker title="Закрыть">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
            </button>
        </div>
        <div class="lineup-popover-list">
            ${players.length ? groupedPlayersHtml : '<div class="empty-state small">Игроков для добавления нет.</div>'}
        </div>
    `;
    picker.querySelector('[data-close-lineup-picker]')?.addEventListener('click', () => {
        tournamentState.activeLineupSlot = null;
        renderLineupPicker();
    });
    picker.querySelectorAll('[data-player-id]').forEach((button) => {
        button.addEventListener('click', () => assignLineupPlayerToSlot(activeSlot.order, Number(button.dataset.playerId)));
    });
}

function openLineupPicker(slotOrder) {
    tournamentState.activeLineupSlot = Number(slotOrder);
    tournamentState.activeEventSlot = null;
    tournamentState.eventDraftType = null;
    if (qs('lineupModalSearch')) {
        qs('lineupModalSearch').value = qs('lineupSearch')?.value || '';
    }
    renderLineup();
    renderLineupPicker();
    openModal('lineupPlayerModal');
    setTimeout(() => qs('lineupModalSearch')?.focus(), 0);
}

function closeLineupPicker() {
    const modal = qs('lineupPlayerModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

function hideWorkspace() {
    const panel = qs('matchWorkspacePanel');
    if (panel) panel.hidden = tournamentState.activeTab !== 'bracket';
    qs('matchWorkspace').hidden = true;
    qs('matchWorkspaceEmpty').hidden = false;
}

function showWorkspace() {
    const match = tournamentState.currentMatch;
    const panel = qs('matchWorkspacePanel');
    if (panel) panel.hidden = tournamentState.activeTab !== 'bracket';
    qs('matchWorkspace').hidden = false;
    qs('matchWorkspaceEmpty').hidden = true;
    qs('scoreHomeTeam').innerHTML = `
        ${logoImg(match.home_logo_url, 'score-team-logo', match.home_team)}
        <span class="score-team-name">${escapeHtml(match.home_team)}</span>
    `;
    qs('scoreAwayTeam').innerHTML = `
        ${logoImg(match.away_logo_url, 'score-team-logo', match.away_team)}
        <span class="score-team-name">${escapeHtml(match.away_team)}</span>
    `;
    qs('matchScore').textContent = `${match.home_score || 0} : ${match.away_score || 0}`;
    qs('matchMeta').textContent = `${formatDateTime(match.match_date)} · ${ROUND_LABELS[match.round_name] || 'Матч'}`;
    qs('matchStatusLabel').textContent = STATUS_LABELS[match.status] || match.status || '-';
    renderLineup();
    renderTimeline();
    renderAnalytics();
    renderPitchPoster();
}

function renderLineup() {
    const board = qs('lineupBoard');
    if (!board) return;
    const match = tournamentState.currentMatch;
    if (!match) {
        board.innerHTML = '<div class="empty-state">Выберите матч.</div>';
        return;
    }
    const formation = qs('currentMatchFormation')?.value || match.formation || '4-3-3';
    const rows = FORMATION_ROWS[formation] || FORMATION_ROWS['4-3-3'];
    const slots = lineupSlots(formation);
    const assignments = lineupAssignments(slots);
    const eventSummary = lineupEventSummary();
    let cursor = 0;
    const selected = (value, current) => String(value) === String(current) ? ' selected' : '';
    const currentRound = match.round_name || 'group';
    const currentSide = match.bracket_side || 'left';
    const currentOrder = match.bracket_order || 0;
    const searchValue = qs('lineupSearch')?.value || '';

    board.innerHTML = `
        <div class="lineup-stadium">
            <div class="pitch-title">
                <div class="pitch-title-main">
                    <span>${escapeHtml(match.home_team)} vs ${escapeHtml(match.away_team)}</span>
                    <strong>${systemSquareLogo('pitch-title-logo')}${escapeHtml(formation)}</strong>
                </div>
                <div class="pitch-title-controls">
                    <input id="lineupSearch" type="search" placeholder="Поиск игрока" value="${escapeHtml(searchValue)}">
                    <select id="currentMatchRound" title="Этап">
                        <option value="group"${selected('group', currentRound)}>Групповой этап</option>
                        <option value="quarterfinal"${selected('quarterfinal', currentRound)}>1/4 финала</option>
                        <option value="semifinal"${selected('semifinal', currentRound)}>Полуфинал</option>
                        <option value="final"${selected('final', currentRound)}>Финал</option>
                    </select>
                    <select id="currentMatchSide" title="Сетка">
                        <option value="left"${selected('left', currentSide)}>Левая сетка</option>
                        <option value="right"${selected('right', currentSide)}>Правая сетка</option>
                        <option value="center"${selected('center', currentSide)}>Центр</option>
                    </select>
                    <input id="currentMatchOrder" type="number" min="0" value="${escapeHtml(currentOrder)}" title="Порядок в сетке">
                    <select id="currentMatchFormation" title="Схема">
                        <option value="4-3-3"${selected('4-3-3', formation)}>4-3-3</option>
                        <option value="4-4-2"${selected('4-4-2', formation)}>4-4-2</option>
                        <option value="3-5-2"${selected('3-5-2', formation)}>3-5-2</option>
                        <option value="5-3-2"${selected('5-3-2', formation)}>5-3-2</option>
                        <option value="4-2-3-1"${selected('4-2-3-1', formation)}>4-2-3-1</option>
                    </select>
                    <button class="pitch-icon-button" id="saveLineupBtn" type="button" title="Сохранить состав" aria-label="Сохранить состав">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                            <path d="M17 21v-8H7v8" />
                            <path d="M7 3v5h8" />
                        </svg>
                    </button>
                    <button class="pitch-icon-button" id="saveMatchSettingsBtn" type="button" title="Обновить матч" aria-label="Обновить матч">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                            <path d="M3 21v-5h5" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M21 3v5h-5" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="pitch-lines lineup-pitch-lines ${tournamentState.activeEventSlot !== null ? 'lineup-focus-mode' : ''}">
                <div class="pitch-center-circle"></div>
                ${rows.map((count, rowIndex) => {
                    const rowSlots = slots.slice(cursor, cursor + count);
                    cursor += count;
                    return `
                        <div class="pitch-row pitch-row-${rowIndex}" style="grid-template-columns: repeat(${count}, minmax(76px, 1fr));">
                            ${rowSlots.map((slot) => {
                                const player = assignments.get(slot.order);
                                const summary = player ? eventSummary.get(Number(player.student_id)) || {} : {};
                                const isLineupActive = tournamentState.activeLineupSlot !== null && Number(tournamentState.activeLineupSlot) === slot.order;
                                const isEventActive = tournamentState.activeEventSlot !== null && Number(tournamentState.activeEventSlot) === slot.order;
                                return `
                                    <div class="lineup-slot ${player ? 'filled' : 'empty'} ${slot.rowIndex <= 1 ? 'panel-up' : ''} ${isLineupActive || isEventActive ? 'active' : ''}" data-lineup-slot="${slot.order}" role="button" tabindex="0">
                                        ${player ? `
                                            <div class="lineup-avatar-wrap">
                                                ${player.photo_url ? `<img src="${player.photo_url}" alt="">` : `<span class="pitch-avatar">${escapeHtml((player.student_name || '?').slice(0, 1))}</span>`}
                                                ${renderLineupEventBadges(summary)}
                                            </div>
                                            <strong>${systemSquareLogo()}${escapeHtml(player.student_name)}</strong>
                                            <span>${escapeHtml(slot.position)}${player.shirt_number ? ` · №${escapeHtml(player.shirt_number)}` : ''}</span>
                                            <button class="lineup-slot-remove" type="button" data-remove-lineup-slot="${slot.order}" title="Убрать игрока">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                                </svg>
                                            </button>
                                            ${isEventActive ? renderLineupEventPanel(player) : ''}
                                        ` : `
                                            <span class="lineup-slot-plus">+</span>
                                            <strong>${escapeHtml(slot.position)}</strong>
                                            <span>Выбрать игрока</span>
                                        `}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }).reverse().join('')}
            </div>
        </div>
    `;
    bindLineupHeaderControls();
    board.querySelectorAll('[data-lineup-slot]').forEach((slotElement) => {
        const openSlot = () => {
            const slotOrder = Number(slotElement.dataset.lineupSlot);
            const hasPlayer = assignments.has(slotOrder);
            if (hasPlayer) {
                tournamentState.activeLineupSlot = null;
                tournamentState.activeEventSlot = tournamentState.activeEventSlot === slotOrder ? null : slotOrder;
                tournamentState.eventDraftType = null;
                renderLineup();
                return;
            }
            openLineupPicker(slotOrder);
        };
        slotElement.addEventListener('click', openSlot);
        slotElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openSlot();
            }
        });
    });
    board.querySelectorAll('[data-remove-lineup-slot]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            removeLineupSlot(Number(button.dataset.removeLineupSlot));
        });
    });
    board.querySelectorAll('[data-lineup-event-type]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            tournamentState.eventDraftType = button.dataset.lineupEventType;
            renderLineup();
        });
    });
    board.querySelectorAll('[data-replace-lineup-player]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const activeSlot = tournamentState.activeEventSlot;
            if (activeSlot === null) return;
            tournamentState.activeEventSlot = null;
            tournamentState.eventDraftType = null;
            openLineupPicker(activeSlot);
        });
    });
    board.querySelectorAll('[data-close-lineup-event]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            tournamentState.activeEventSlot = null;
            tournamentState.eventDraftType = null;
            renderLineup();
        });
    });
    board.querySelectorAll('.lineup-event-form').forEach((form) => {
        form.addEventListener('click', (event) => event.stopPropagation());
        form.addEventListener('submit', createLineupEvent);
    });
}

function bindLineupHeaderControls() {
    qs('lineupSearch')?.addEventListener('input', renderLineupPicker);
    qs('saveLineupBtn')?.addEventListener('click', saveLineup);
    qs('saveMatchSettingsBtn')?.addEventListener('click', saveCurrentMatchSettings);
    ['currentMatchRound', 'currentMatchSide', 'currentMatchOrder'].forEach((id) => {
        const control = qs(id);
        control?.addEventListener('input', updateLineupHeaderDirtyButtons);
        control?.addEventListener('change', updateLineupHeaderDirtyButtons);
    });
    qs('currentMatchFormation')?.addEventListener('change', () => {
        tournamentState.activeLineupSlot = null;
        tournamentState.activeEventSlot = null;
        tournamentState.eventDraftType = null;
        if (tournamentState.currentMatch) {
            tournamentState.currentMatch = {
                ...tournamentState.currentMatch,
                formation: qs('currentMatchFormation').value,
            };
        }
        renderLineup();
        renderLineupPicker();
    });
    updateLineupHeaderDirtyButtons();
}

function lineupEventSummary() {
    const summary = new Map();
    (tournamentState.currentMatch?.events || []).forEach((event) => {
        if (!event.student_id) return;
        const id = Number(event.student_id);
        const row = summary.get(id) || { goals: 0, yellow: 0, red: 0 };
        if (event.event_type === 'goal') row.goals += 1;
        if (event.event_type === 'card' && event.card_color === 'red') row.red += 1;
        if (event.event_type === 'card' && event.card_color !== 'red') row.yellow += 1;
        summary.set(id, row);
    });
    return summary;
}

function renderLineupEventBadges(summary = {}) {
    const badges = [];
    if (summary.goals) badges.push(`<span class="lineup-event-badge goal">Г ${summary.goals}</span>`);
    if (summary.yellow) badges.push(`<span class="lineup-event-badge yellow">${summary.yellow}</span>`);
    if (summary.red) badges.push(`<span class="lineup-event-badge red">${summary.red}</span>`);
    return badges.length ? `<div class="lineup-event-badges">${badges.join('')}</div>` : '';
}

function renderLineupEventPanel(player) {
    const draftType = tournamentState.eventDraftType;
    const assistOptions = tournamentState.lineup
        .filter((item) => Number(item.student_id) !== Number(player.student_id))
        .map((item) => `<option value="student:${item.student_id}">${escapeHtml(item.student_name)}${item.shirt_number ? ` (№${escapeHtml(item.shirt_number)})` : ''}</option>`)
        .join('');
    return `
        <div class="lineup-event-panel">
            <div class="lineup-event-actions">
                <button type="button" data-replace-lineup-player>Заменить</button>
                <button type="button" class="${draftType === 'goal' ? 'active' : ''}" data-lineup-event-type="goal">Гол</button>
                <button type="button" class="${draftType === 'card' ? 'active' : ''}" data-lineup-event-type="card">Карточка</button>
                <button type="button" data-close-lineup-event title="Закрыть">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                </button>
            </div>
            ${draftType ? `
                <form class="lineup-event-form" data-event-player-id="${player.student_id}" data-event-type="${draftType}">
                    <div class="lineup-event-row">
                        <select name="half">
                            <option value="1">1 тайм</option>
                            <option value="2">2 тайм</option>
                            <option value="3">Доп.</option>
                        </select>
                        <input name="minute" type="number" min="1" max="130" value="1" placeholder="Мин.">
                    </div>
                    ${draftType === 'goal' ? `
                        <select name="assist_ref">
                            <option value="">Без голевого паса</option>
                            ${assistOptions}
                        </select>
                    ` : `
                        <select name="card_color">
                            <option value="yellow">Жёлтая</option>
                            <option value="red">Красная</option>
                        </select>
                    `}
                    <textarea name="note" rows="2" placeholder="Комментарий"></textarea>
                    <button type="submit">${draftType === 'goal' ? 'Записать гол' : 'Записать карточку'}</button>
                </form>
            ` : ''}
        </div>
    `;
}

function lineupSlots(formation) {
    const selectedFormation = formation || qs('currentMatchFormation')?.value || tournamentState.currentMatch?.formation || '4-3-3';
    const rows = FORMATION_ROWS[selectedFormation] || FORMATION_ROWS['4-3-3'];
    let order = 0;
    return rows.flatMap((count, rowIndex) => (
        Array.from({ length: count }, (_, slotIndex) => ({
            rowIndex,
            slotIndex,
            order: order++,
            position: positionForFormationRow(rowIndex, rows.length),
        }))
    ));
}

function positionForFormationRow(rowIndex, totalRows) {
    if (rowIndex === 0) return 'Вратарь';
    if (rowIndex === totalRows - 1) return 'Нападающий';
    if (rowIndex >= totalRows - 2) return 'Полузащитник';
    return 'Защитник';
}

function lineupAssignments(slots) {
    const assignments = new Map();
    const used = new Set();
    const starters = tournamentState.lineup.filter((item) => item.is_starter !== false);

    slots.forEach((slot) => {
        const player = starters.find((item) => Number(item.sort_order) === slot.order && !used.has(item));
        if (player) {
            assignments.set(slot.order, player);
            used.add(player);
        }
    });

    slots.forEach((slot) => {
        if (assignments.has(slot.order)) return;
        const player = starters.find((item) => item.position === slot.position && !used.has(item));
        if (player) {
            assignments.set(slot.order, player);
            used.add(player);
        }
    });

    slots.forEach((slot) => {
        if (assignments.has(slot.order)) return;
        const player = starters.find((item) => !used.has(item));
        if (player) {
            assignments.set(slot.order, player);
            used.add(player);
        }
    });

    return assignments;
}

function assignLineupPlayerToSlot(slotOrder, playerId) {
    const slot = lineupSlots().find((item) => item.order === Number(slotOrder));
    const player = tournamentState.players.find((item) => Number(item.id) === Number(playerId));
    if (!slot || !player) return;
    tournamentState.lineup = tournamentState.lineup.filter((item) => (
        Number(item.sort_order) !== slot.order && Number(item.student_id) !== Number(player.id)
    ));
    tournamentState.lineup.push({
        student_id: player.id,
        student_name: player.name,
        student_number: player.number,
        photo_url: player.photo_url,
        team_side: 'home',
        position: slot.position,
        shirt_number: player.number || '',
        is_starter: true,
        sort_order: slot.order,
    });
    tournamentState.lineup.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    tournamentState.activeLineupSlot = null;
    renderLineup();
    renderLineupPicker();
    closeLineupPicker();
}

function removeLineupSlot(slotOrder) {
    tournamentState.lineup = tournamentState.lineup.filter((item) => Number(item.sort_order) !== Number(slotOrder));
    if (tournamentState.activeLineupSlot !== null && Number(tournamentState.activeLineupSlot) === Number(slotOrder)) {
        tournamentState.activeLineupSlot = null;
    }
    renderLineup();
    renderLineupPicker();
}

function renderTimeline() {
    const timeline = qs('eventTimeline');
    const events = tournamentState.currentMatch?.events || [];
    if (!events.length) {
        timeline.innerHTML = '<div class="empty-state">Событий пока нет.</div>';
        return;
    }
    timeline.innerHTML = events.map((event) => {
        const isGoal = event.event_type === 'goal';
        const typeLabel = isGoal ? 'Гол' : (event.card_color === 'red' ? 'Красная карточка' : 'Жёлтая карточка');
        const assist = event.assist_student_name ? ` · пас: ${escapeHtml(event.assist_student_name)}` : '';
        return `
            <div class="timeline-item ${isGoal ? 'goal' : event.card_color === 'red' ? 'red-card' : 'yellow-card'}">
                <div>
                    <strong>${event.minute}' · ${event.half} тайм · ${typeLabel}</strong>
                    <span>${escapeHtml(event.student_name || '-')}${assist}</span>
                    ${event.note ? `<small>${escapeHtml(event.note)}</small>` : ''}
                </div>
                <button type="button" data-event-id="${event.id}" title="Удалить событие">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                    </svg>
                </button>
            </div>
        `;
    }).join('');
    timeline.querySelectorAll('[data-event-id]').forEach((button) => {
        button.addEventListener('click', () => deleteEvent(Number(button.dataset.eventId)));
    });
}

async function loadAnalytics() {
    if (!tournamentState.selectedTournamentId) return;
    const data = await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/analytics`);
    tournamentState.analytics = data;
    renderAnalytics();
}

function renderAnalytics() {
    const data = tournamentState.analytics;
    if (!data) return;
    const summary = data.summary || {};
    qs('tournamentSummary').innerHTML = `
        <span>Матчи: ${summary.matches || 0}</span>
        <span>Голы: ${summary.goals || 0}</span>
        <span>ЖК: ${summary.yellow_cards || 0}</span>
        <span>КК: ${summary.red_cards || 0}</span>
    `;
    const rows = data.players || [];
    qs('playerAnalyticsBody').innerHTML = rows.length ? rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.student_name)}<small>${escapeHtml(row.group_name || '-')}</small></td>
            <td>${row.matches}</td>
            <td>${row.goals}</td>
            <td>${row.assists}</td>
            <td>${row.yellow_cards}</td>
            <td>${row.red_cards}</td>
            <td>${row.score}</td>
        </tr>
    `).join('') : '<tr><td colspan="7" class="empty-cell">Нет данных</td></tr>';
}

async function saveLineup() {
    if (!tournamentState.selectedMatchId) return;
    const data = await apiJson(`/api/tournament-matches/${tournamentState.selectedMatchId}/lineup`, {
        method: 'PUT',
        body: JSON.stringify({ players: tournamentState.lineup }),
    });
    tournamentState.currentMatch = data.match;
    tournamentState.lineup = data.match.lineups || [];
    tournamentState.lineupSnapshot = lineupSnapshotKey();
    showWorkspace();
    renderLineupPicker();
    await loadAnalytics();
}

async function deleteEvent(eventId) {
    await apiJson(`/api/tournament-events/${eventId}`, { method: 'DELETE' });
    await selectMatch(tournamentState.selectedMatchId);
    await loadAnalytics();
}

function toggleEventFields() {
    if (!qs('eventType')) return;
    const isCard = qs('eventType').value === 'card';
    if (qs('eventAssist')) qs('eventAssist').style.display = isCard ? 'none' : '';
    if (qs('eventCardColor')) qs('eventCardColor').style.display = isCard ? '' : 'none';
}

async function createLineupEvent(event) {
    event.preventDefault();
    if (!tournamentState.selectedMatchId) return;
    const form = event.currentTarget;
    const eventType = form.dataset.eventType;
    const playerId = form.dataset.eventPlayerId;
    await apiJson(`/api/tournament-matches/${tournamentState.selectedMatchId}/events`, {
        method: 'POST',
        body: JSON.stringify({
            event_type: eventType,
            half: form.elements.half?.value || 1,
            minute: form.elements.minute?.value || 1,
            player_ref: `student:${playerId}`,
            assist_ref: eventType === 'goal' ? (form.elements.assist_ref?.value || '') : '',
            card_color: eventType === 'card' ? (form.elements.card_color?.value || 'yellow') : '',
            note: form.elements.note?.value || '',
        }),
    });
    tournamentState.activeEventSlot = null;
    tournamentState.eventDraftType = null;
    await selectMatch(tournamentState.selectedMatchId);
    await loadAnalytics();
}

async function saveCurrentMatchSettings() {
    const match = tournamentState.currentMatch;
    if (!match) return;
    const data = await apiJson(`/api/tournament-matches/${match.id}`, {
        method: 'PUT',
        body: JSON.stringify({
            group_id: match.group_id || '',
            home_team_id: match.home_team_id || '',
            away_team_id: match.away_team_id || '',
            match_date: match.match_date || '',
            home_team: match.home_team,
            away_team: match.away_team,
            status: match.status || 'scheduled',
            venue: match.venue || '',
            notes: match.notes || '',
            round_name: qs('currentMatchRound').value,
            bracket_side: qs('currentMatchSide').value,
            bracket_order: qs('currentMatchOrder').value,
            formation: qs('currentMatchFormation').value,
        }),
    });
    tournamentState.currentMatch = { ...match, ...data.match };
    tournamentState.matches = tournamentState.matches.map((item) => item.id === data.match.id ? data.match : item);
    tournamentState.matchSettingsSnapshot = matchSettingsSnapshotKey(tournamentState.currentMatch);
    if (qs('currentMatchFormation')) qs('currentMatchFormation').value = data.match.formation || '4-3-3';
    showWorkspace();
    renderMatches();
    renderBracket();
}

function lineupForPitch() {
    const starters = tournamentState.lineup.filter((item) => item.is_starter !== false);
    const ordered = [];
    POSITIONS_ORDER.forEach((position) => {
        ordered.push(...starters.filter((item) => item.position === position));
    });
    starters.forEach((item) => {
        if (!ordered.includes(item)) ordered.push(item);
    });
    return ordered.slice(0, 11);
}

function renderPitchPoster() {
    const pitch = qs('pitchPoster');
    if (!pitch) return;
    const match = tournamentState.currentMatch;
    if (!match) {
        pitch.innerHTML = '<div class="pitch-empty">Выберите матч.</div>';
        return;
    }
    const formation = qs('currentMatchFormation')?.value || match.formation || '4-3-3';
    const rows = FORMATION_ROWS[formation] || FORMATION_ROWS['4-3-3'];
    const players = lineupForPitch();
    if (!players.length) {
        pitch.innerHTML = '<div class="pitch-empty">Добавьте игроков в состав.</div>';
        return;
    }
    let cursor = 0;
    const rowHtml = rows.map((count, rowIndex) => {
        const rowPlayers = players.slice(cursor, cursor + count);
        cursor += count;
        return `
            <div class="pitch-row pitch-row-${rowIndex}" style="grid-template-columns: repeat(${count}, minmax(72px, 1fr));">
                ${rowPlayers.map((player) => `
                    <div class="pitch-player">
                        ${player.photo_url ? `<img src="${player.photo_url}" alt="">` : `<span class="pitch-avatar">${escapeHtml((player.student_name || '?').slice(0, 1))}</span>`}
                        <strong>${escapeHtml(player.student_name)}</strong>
                        <span>${escapeHtml(player.position || 'Игрок')}${player.shirt_number ? ` · №${escapeHtml(player.shirt_number)}` : ''}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
    pitch.innerHTML = `
        <div class="pitch-title">
            <span>${escapeHtml(match.home_team)} vs ${escapeHtml(match.away_team)}</span>
            <strong>${escapeHtml(formation)}</strong>
        </div>
        <div class="pitch-lines">
            <div class="pitch-center-circle"></div>
            ${rowHtml}
        </div>
    `;
}

function renderBracket() {
    const board = qs('bracketBoard');
    if (!board) return;
    if (!tournamentState.matches.length) {
        board.innerHTML = '<div class="empty-state">Добавьте матчи для построения сетки.</div>';
        return;
    }
    const roundOrder = ['group', 'quarterfinal', 'semifinal', 'final'];
    const html = roundOrder.map((round) => {
        const matches = tournamentState.matches
            .filter((match) => (match.round_name || 'group') === round)
            .sort((a, b) => (a.bracket_order || 0) - (b.bracket_order || 0) || a.id - b.id);
        if (!matches.length) return '';
        return `
            <div class="bracket-column">
                <h4>${ROUND_LABELS[round]}</h4>
                ${matches.map((match) => `
                    <button class="bracket-match ${match.id === tournamentState.selectedMatchId ? 'active' : ''}" type="button" data-bracket-match="${match.id}">
                        <span>${logoImg(match.home_logo_url, 'bracket-team-logo', match.home_team)}<span class="bracket-team-name">${escapeHtml(match.home_team)}</span></span>
                        <strong>${match.home_score || 0}:${match.away_score || 0}</strong>
                        <span>${logoImg(match.away_logo_url, 'bracket-team-logo', match.away_team)}<span class="bracket-team-name">${escapeHtml(match.away_team)}</span></span>
                    </button>
                `).join('')}
            </div>
        `;
    }).join('');
    board.innerHTML = html || '<div class="empty-state">Укажите раунд матча, чтобы построить сетку.</div>';
    board.querySelectorAll('[data-bracket-match]').forEach((button) => {
        button.addEventListener('click', () => selectMatch(Number(button.dataset.bracketMatch)));
    });
}

function switchTournamentTab(tabName) {
    tournamentState.activeTab = tabName;
    document.querySelectorAll('.tournament-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tournamentTab === tabName);
    });
    document.querySelectorAll('.tournament-tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tournamentTab-${tabName}`);
    });
    const workspacePanel = qs('matchWorkspacePanel');
    if (workspacePanel) {
        workspacePanel.hidden = tabName !== 'bracket';
    }
}

function renderEmptyState() {
    qs('teamList').innerHTML = '<div class="empty-state">Создайте или выберите турнир.</div>';
    qs('matchList').innerHTML = '<div class="empty-state">Создайте или выберите турнир.</div>';
    qs('bracketBoard').innerHTML = '<div class="empty-state">Создайте или выберите турнир.</div>';
    hideWorkspace();
}

async function createTournament(event) {
    event.preventDefault();
    const data = await apiJson('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
            name: qs('tournamentName').value,
            season: qs('tournamentSeason').value,
            status: qs('tournamentStatus').value,
            location: qs('tournamentLocation').value,
            start_date: qs('tournamentStart').value,
            end_date: qs('tournamentEnd').value,
            notes: qs('tournamentNotes').value,
        }),
    });
    qs('tournamentForm').reset();
    closeModal('tournamentModal');
    tournamentState.selectedTournamentId = data.tournament.id;
    await loadTournaments();
}

function parseExternalPlayers(text) {
    return String(text || '').split('\n').map((line) => {
        const [fullName, number, position] = line.split(',').map((part) => (part || '').trim());
        return fullName ? { full_name: fullName, shirt_number: number || '', position: position || '' } : null;
    }).filter(Boolean);
}

function resetTeamLogoPreview() {
    const preview = qs('teamLogoPreview');
    const fileName = qs('teamLogoFileName');
    if (preview) preview.textContent = 'Лого';
    if (fileName) fileName.textContent = 'PNG, JPG или WEBP';
}

function updateTeamTypeView() {
    const external = qs('teamType')?.value === 'external';
    const logoPicker = qs('teamLogoPicker');
    if (logoPicker) logoPicker.hidden = !external;
    qs('teamSourceGroups').style.display = external ? 'none' : '';
    qs('teamPlayerPicker').style.display = external ? 'none' : '';
    qs('teamExternalPlayers').style.display = external ? '' : 'none';
    if (!external && qs('teamLogo')) {
        qs('teamLogo').value = '';
        resetTeamLogoPreview();
    }
}

async function createTeam(event) {
    event.preventDefault();
    if (!tournamentState.selectedTournamentId) return;
    const playerIds = Array.from(qs('teamPlayerPicker').querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    const groupIds = Array.from(qs('teamSourceGroups').selectedOptions).map((option) => option.value);
    const formData = new FormData();
    formData.append('name', qs('teamName').value);
    formData.append('team_type', qs('teamType').value);
    formData.append('notes', qs('teamNotes').value);
    groupIds.forEach((id) => formData.append('group_ids', id));
    playerIds.forEach((id) => formData.append('player_ids', id));
    formData.append('external_players', JSON.stringify(parseExternalPlayers(qs('teamExternalPlayers').value)));
    if (qs('teamType').value === 'external' && qs('teamLogo')?.files?.[0]) {
        formData.append('logo', qs('teamLogo').files[0]);
    }
    await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/teams`, {
        method: 'POST',
        headers: {},
        body: formData,
    });
    qs('teamForm').reset();
    resetTeamLogoPreview();
    updateTeamTypeView();
    qs('teamPlayerPicker').innerHTML = '';
    closeModal('teamModal');
    await loadTeams();
}

async function createMatch(event) {
    event.preventDefault();
    if (!tournamentState.selectedTournamentId) return;
    const homeTeam = teamById(qs('matchHomeTeam').value);
    const awayTeam = teamById(qs('matchAwayTeam').value);
    if (!homeTeam || !awayTeam) {
        alert('Выберите обе команды матча');
        return;
    }
    const data = await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/matches`, {
        method: 'POST',
        body: JSON.stringify({
            match_date: qs('matchDate').value,
            home_team_id: homeTeam.id,
            away_team_id: awayTeam.id,
            group_id: (homeTeam.source_group_ids || [])[0] || '',
            home_team: homeTeam.name,
            away_team: awayTeam.name,
            status: qs('matchStatus').value,
            venue: qs('matchVenue').value,
            round_name: qs('matchRound').value,
            bracket_side: qs('matchBracketSide').value,
            bracket_order: qs('matchBracketOrder').value,
            formation: qs('matchFormation').value,
            notes: qs('matchNotes').value,
        }),
    });
    qs('matchForm').reset();
    qs('matchBracketOrder').value = '0';
    closeModal('matchModal');
    tournamentState.selectedMatchId = data.match.id;
    await loadMatches();
    switchTournamentTab('bracket');
}

function bindForms() {
    qs('refreshTournamentBtn').addEventListener('click', initTournaments);
    qs('tournamentSelect')?.addEventListener('change', (event) => selectTournament(event.target.value));
    qs('openTournamentModalBtn').addEventListener('click', () => openModal('tournamentModal'));
    qs('openTeamModalBtn').addEventListener('click', () => openModal('teamModal'));
    qs('openMatchModalBtn').addEventListener('click', () => openModal('matchModal'));
    qs('teamSourceGroups').addEventListener('change', loadStudentsForTeamPicker);
    qs('teamLogo')?.addEventListener('change', () => {
        const file = qs('teamLogo')?.files?.[0];
        const preview = qs('teamLogoPreview');
        const fileName = qs('teamLogoFileName');
        if (fileName) fileName.textContent = file ? file.name : 'PNG, JPG или WEBP';
        if (!preview) return;
        if (!file) {
            resetTeamLogoPreview();
            return;
        }
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${url}" alt="">`;
    });
    qs('teamType').addEventListener('change', updateTeamTypeView);
    updateTeamTypeView();
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });
    document.querySelectorAll('[data-close-lineup-picker]').forEach((button) => {
        button.addEventListener('click', () => {
            tournamentState.activeLineupSlot = null;
            renderLineup();
            closeLineupPicker();
        });
    });
    document.querySelectorAll('.tournament-modal').forEach((modal) => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal(modal.id);
        });
    });
    document.querySelectorAll('.tournament-tab').forEach((button) => {
        button.addEventListener('click', () => switchTournamentTab(button.dataset.tournamentTab));
        button.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            switchTournamentTab(button.dataset.tournamentTab);
        });
    });

    qs('tournamentForm').addEventListener('submit', createTournament);
    qs('teamForm').addEventListener('submit', createTeam);
    qs('matchForm').addEventListener('submit', createMatch);
    qs('lineupModalSearch')?.addEventListener('input', renderLineupPicker);
    qs('eventType')?.addEventListener('change', toggleEventFields);
    qs('eventForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await apiJson(`/api/tournament-matches/${tournamentState.selectedMatchId}/events`, {
            method: 'POST',
            body: JSON.stringify({
                event_type: qs('eventType').value,
                half: qs('eventHalf').value,
                minute: qs('eventMinute').value,
                player_ref: qs('eventPlayer').value,
                assist_ref: qs('eventAssist').value,
                card_color: qs('eventCardColor').value,
                note: qs('eventNote').value,
            }),
        });
        qs('eventNote').value = '';
        await selectMatch(tournamentState.selectedMatchId);
        await loadAnalytics();
    });
}

async function initTournaments() {
    try {
        await loadGroups();
        await loadTournaments();
        toggleEventFields();
        qs('teamExternalPlayers').style.display = 'none';
    } catch (error) {
        console.error(error);
        qs('bracketBoard').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bindForms();
    initTournaments();
});
