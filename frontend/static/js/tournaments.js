const tournamentState = {
    tournaments: [],
    groups: [],
    matches: [],
    players: [],
    selectedTournamentId: null,
    selectedMatchId: null,
    currentMatch: null,
    lineup: [],
    analytics: null,
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
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
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

function groupLabel(group) {
    const count = `${group.active_student_count ?? group.student_count ?? 0}/${group.max_students || '-'}`;
    return `${group.name} · ${count}`;
}

async function loadGroups() {
    const groups = await apiJson('/api/groups');
    tournamentState.groups = Array.isArray(groups) ? groups : (groups.groups || []);
    renderGroupSelects();
}

async function loadTournaments() {
    const data = await apiJson('/api/tournaments');
    tournamentState.tournaments = data.tournaments || [];
    if (!tournamentState.selectedTournamentId && tournamentState.tournaments.length) {
        tournamentState.selectedTournamentId = tournamentState.tournaments[0].id;
    }
    renderTournaments();
    if (tournamentState.selectedTournamentId) {
        await selectTournament(tournamentState.selectedTournamentId, false);
    }
}

function renderGroupSelects() {
    const html = `<option value="">Без группы</option>${tournamentState.groups.map((group) =>
        `<option value="${group.id}">${escapeHtml(groupLabel(group))}</option>`
    ).join('')}`;
    qs('matchGroup').innerHTML = html;
}

function renderTournaments() {
    const list = qs('tournamentList');
    if (!tournamentState.tournaments.length) {
        list.innerHTML = '<div class="empty-state">Турниров пока нет.</div>';
        return;
    }
    list.innerHTML = tournamentState.tournaments.map((item) => `
        <button class="entity-item ${item.id === tournamentState.selectedTournamentId ? 'active' : ''}" type="button"
            data-tournament-id="${item.id}">
            <span class="entity-title">${escapeHtml(item.name)}</span>
            <span class="entity-meta">${escapeHtml(item.season || 'Сезон не указан')} · ${formatDate(item.start_date)}</span>
            <span class="entity-bottom">
                <span>${STATUS_LABELS[item.status] || item.status || '-'}</span>
                <span>${item.matches_count || 0} матч.</span>
            </span>
        </button>
    `).join('');
    list.querySelectorAll('[data-tournament-id]').forEach((button) => {
        button.addEventListener('click', () => selectTournament(Number(button.dataset.tournamentId)));
    });
}

async function selectTournament(tournamentId, resetMatch = true) {
    tournamentState.selectedTournamentId = tournamentId;
    if (resetMatch) {
        tournamentState.selectedMatchId = null;
        tournamentState.currentMatch = null;
    }
    qs('toggleMatchForm').disabled = false;
    renderTournaments();
    await Promise.all([loadMatches(), loadAnalytics()]);
    renderBracket();
}

async function loadMatches() {
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
                <span>${escapeHtml(ROUND_LABELS[match.round_name] || match.group_name || 'Без группы')}</span>
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
    const data = await apiJson(`/api/tournament-matches/${matchId}`);
    tournamentState.currentMatch = data.match;
    tournamentState.lineup = [...(data.match.lineups || [])];
    if (rerenderList) renderMatches();
    await loadPlayers(data.match.group_id);
    showWorkspace();
}

async function loadPlayers(groupId) {
    const url = new URL(`/api/tournaments/${tournamentState.selectedTournamentId}/players`, window.location.origin);
    if (groupId) url.searchParams.set('group_id', groupId);
    const data = await apiJson(url.pathname + url.search);
    tournamentState.players = data.players || [];
    renderPlayerSelects();
}

function renderPlayerSelects() {
    const options = tournamentState.players.map((player) =>
        `<option value="${player.id}">${escapeHtml(player.name)}${player.number ? ` (№${escapeHtml(player.number)})` : ''}</option>`
    ).join('');
    const empty = '<option value="">Выберите игрока</option>';
    qs('lineupPlayer').innerHTML = empty + options;
    qs('eventPlayer').innerHTML = empty + options;
    qs('eventAssist').innerHTML = '<option value="">Без голевого паса</option>' + options;
}

function hideWorkspace() {
    qs('matchWorkspace').hidden = true;
    qs('matchWorkspaceEmpty').hidden = false;
}

function showWorkspace() {
    const match = tournamentState.currentMatch;
    qs('matchWorkspace').hidden = false;
    qs('matchWorkspaceEmpty').hidden = true;
    qs('scoreHomeTeam').textContent = match.home_team;
    qs('scoreAwayTeam').textContent = match.away_team;
    qs('matchScore').textContent = `${match.home_score || 0} : ${match.away_score || 0}`;
    qs('matchMeta').textContent = `${formatDateTime(match.match_date)} · ${match.group_name || 'Без группы'}`;
    qs('matchStatusLabel').textContent = STATUS_LABELS[match.status] || match.status || '-';
    qs('formationViewSelect').value = match.formation || '4-3-3';
    qs('currentMatchRound').value = match.round_name || 'group';
    qs('currentMatchSide').value = match.bracket_side || 'left';
    qs('currentMatchOrder').value = match.bracket_order || 0;
    qs('currentMatchFormation').value = match.formation || '4-3-3';
    renderLineup();
    renderTimeline();
    renderAnalytics();
    renderPitchPoster();
    renderBracket();
}

function renderLineup() {
    const board = qs('lineupBoard');
    if (!tournamentState.lineup.length) {
        board.innerHTML = '<div class="empty-state">Состав ещё не заполнен.</div>';
        return;
    }
    board.innerHTML = POSITIONS_ORDER.map((position) => {
        const players = tournamentState.lineup.filter((item) => item.position === position);
        if (!players.length) return '';
        return `
            <div class="lineup-position">
                <h4>${escapeHtml(position)}</h4>
                ${players.map((player, index) => `
                    <div class="lineup-chip">
                        ${player.photo_url ? `<img src="${player.photo_url}" alt="">` : `<span class="avatar-fallback">${escapeHtml((player.student_name || '?').slice(0, 1))}</span>`}
                        <span>${escapeHtml(player.shirt_number ? `№${player.shirt_number} · ` : '')}${escapeHtml(player.student_name)}</span>
                        <button type="button" data-lineup-index="${tournamentState.lineup.indexOf(player)}" title="Убрать">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('') || '<div class="empty-state">Состав ещё не заполнен.</div>';
    board.querySelectorAll('[data-lineup-index]').forEach((button) => {
        button.addEventListener('click', () => {
            tournamentState.lineup.splice(Number(button.dataset.lineupIndex), 1);
            renderLineup();
            renderPitchPoster();
        });
    });
    renderPitchPoster();
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

function addLineupPlayer() {
    const playerId = Number(qs('lineupPlayer').value);
    const player = tournamentState.players.find((item) => item.id === playerId);
    if (!player) return;
    if (tournamentState.lineup.some((item) => Number(item.student_id) === playerId && item.team_side === 'home')) {
        alert('Игрок уже есть в составе.');
        return;
    }
    tournamentState.lineup.push({
        student_id: player.id,
        student_name: player.name,
        student_number: player.number,
        photo_url: player.photo_url,
        team_side: 'home',
        position: qs('lineupPosition').value || 'Игрок',
        shirt_number: qs('lineupNumber').value.trim(),
        is_starter: qs('lineupStarter').checked,
        sort_order: tournamentState.lineup.length,
    });
    qs('lineupNumber').value = '';
    renderLineup();
}

async function saveLineup() {
    if (!tournamentState.selectedMatchId) return;
    const data = await apiJson(`/api/tournament-matches/${tournamentState.selectedMatchId}/lineup`, {
        method: 'PUT',
        body: JSON.stringify({ players: tournamentState.lineup }),
    });
    tournamentState.currentMatch = data.match;
    tournamentState.lineup = data.match.lineups || [];
    showWorkspace();
    await loadAnalytics();
}

async function deleteEvent(eventId) {
    await apiJson(`/api/tournament-events/${eventId}`, { method: 'DELETE' });
    await selectMatch(tournamentState.selectedMatchId);
    await loadAnalytics();
}

function toggleEventFields() {
    const isCard = qs('eventType').value === 'card';
    qs('eventAssist').style.display = isCard ? 'none' : '';
    qs('eventCardColor').style.display = isCard ? '' : 'none';
}

async function saveCurrentMatchSettings() {
    const match = tournamentState.currentMatch;
    if (!match) return;
    const data = await apiJson(`/api/tournament-matches/${match.id}`, {
        method: 'PUT',
        body: JSON.stringify({
            group_id: match.group_id || '',
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
    qs('formationViewSelect').value = data.match.formation || '4-3-3';
    showWorkspace();
    renderMatches();
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
    const formation = qs('formationViewSelect')?.value || match.formation || '4-3-3';
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
                        <span>${escapeHtml(match.home_team)}</span>
                        <strong>${match.home_score || 0}:${match.away_score || 0}</strong>
                        <span>${escapeHtml(match.away_team)}</span>
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

function bindForms() {
    qs('toggleTournamentForm').addEventListener('click', () => {
        qs('tournamentForm').hidden = !qs('tournamentForm').hidden;
    });
    qs('toggleMatchForm').addEventListener('click', () => {
        qs('matchForm').hidden = !qs('matchForm').hidden;
    });
    qs('refreshTournamentBtn').addEventListener('click', initTournaments);
    qs('addLineupBtn').addEventListener('click', addLineupPlayer);
    qs('saveLineupBtn').addEventListener('click', saveLineup);
    qs('saveMatchSettingsBtn').addEventListener('click', saveCurrentMatchSettings);
    qs('eventType').addEventListener('change', toggleEventFields);

    qs('tournamentForm').addEventListener('submit', async (event) => {
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
        qs('tournamentForm').hidden = true;
        tournamentState.selectedTournamentId = data.tournament.id;
        await loadTournaments();
    });

    qs('matchForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = await apiJson(`/api/tournaments/${tournamentState.selectedTournamentId}/matches`, {
            method: 'POST',
            body: JSON.stringify({
                match_date: qs('matchDate').value,
                group_id: qs('matchGroup').value,
                home_team: qs('homeTeam').value,
                away_team: qs('awayTeam').value,
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
        qs('homeTeam').value = 'Наша команда';
        qs('awayTeam').value = 'Соперник';
        qs('matchBracketOrder').value = '0';
        qs('matchForm').hidden = true;
        tournamentState.selectedMatchId = data.match.id;
        await loadMatches();
    });

    qs('eventForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await apiJson(`/api/tournament-matches/${tournamentState.selectedMatchId}/events`, {
            method: 'POST',
            body: JSON.stringify({
                event_type: qs('eventType').value,
                half: qs('eventHalf').value,
                minute: qs('eventMinute').value,
                student_id: qs('eventPlayer').value,
                assist_student_id: qs('eventAssist').value,
                card_color: qs('eventCardColor').value,
                note: qs('eventNote').value,
            }),
        });
        qs('eventNote').value = '';
        await selectMatch(tournamentState.selectedMatchId);
        await loadAnalytics();
    });

    qs('formationViewSelect').addEventListener('change', renderPitchPoster);
}

async function initTournaments() {
    try {
        await loadGroups();
        await loadTournaments();
        toggleEventFields();
    } catch (error) {
        console.error(error);
        qs('tournamentList').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bindForms();
    initTournaments();
});
