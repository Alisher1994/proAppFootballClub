let currentDate = new Date();
let currentGroups = [];
let currentStudents = [];
let selectedGroup = null;

const DAY_LABELS = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' };

// Функция для форматирования времени группы
function formatGroupTime(scheduleTime) {
    if (!scheduleTime) return 'Время не указано';
    
    // Проверяем, является ли это JSON объектом
    if (typeof scheduleTime === 'string' && scheduleTime.startsWith('{')) {
        try {
            const timeMap = JSON.parse(scheduleTime);
            // Берем первое значение или показываем что времена разные
            const times = Object.values(timeMap);
            const uniqueTimes = [...new Set(times)];
            if (uniqueTimes.length === 1) {
                return uniqueTimes[0];
            } else {
                // Разные времена - показываем диапазон
                const hours = times.map(t => parseInt(t.split(':')[0]));
                return `${Math.min(...hours)}:00-${Math.max(...hours)}:00`;
            }
        } catch (e) {
            return scheduleTime;
        }
    }
    
    return scheduleTime;
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    updateDateDisplay();
    loadGroups();
});

// === УПРАВЛЕНИЕ ДАТОЙ ===

function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateDateDisplay();
    loadGroups();
}

function updateDateDisplay() {
    const display = document.getElementById('currentDateDisplay');
    const subtext = document.getElementById('currentDateSubtext');

    // Форматирование даты
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateStr = currentDate.toLocaleDateString('ru-RU', options);

    // "Сегодня" / "Завтра" / "Вчера"
    const now = new Date();
    const isToday = isSameDay(currentDate, now);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = isSameDay(currentDate, tomorrow);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = isSameDay(currentDate, yesterday);

    let title = capitalize(dateStr);

    if (isToday) title = "Сегодня";
    else if (isTomorrow) title = "Завтра";
    else if (isYesterday) title = "Вчера";

    display.textContent = title;
    // Делаем первую букву заглавной для подтекста (день недели)
    subtext.textContent = isToday || isTomorrow || isYesterday ? capitalize(dateStr) : '';
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// === ЗАГРУЗКА ДАННЫХ ===

async function loadGroups() {
    const grid = document.getElementById('groupsGrid');
    grid.innerHTML = '<div class="loading-spinner">Загрузка расписания...</div>';

    try {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const day = currentDate.getDate();

        const response = await fetch(`/api/attendance/groups-statistics?year=${year}&month=${month}&day=${day}`);
        const data = await response.json();

        currentGroups = data.groups || [];
        renderGroups();

        // Если мы были внутри группы, обновим и её данные
        if (selectedGroup) {
            const updatedGroup = currentGroups.find(g => g.group_id === selectedGroup.group_id);
            if (updatedGroup) {
                // Мягкое обновление без мерцания перехода
                selectedGroup = updatedGroup;
                renderStudents(false);
            } else {
                // Группа исчезла из расписания (например, смена дня)
                showGroupsView();
            }
        }

    } catch (error) {
        console.error("Ошибка загрузки групп:", error);
        grid.innerHTML = '<div class="loading-spinner" style="color: #ef4444;">Ошибка загрузки. Повторите попытку.</div>';
    }
}


// === ОТРИСОВКА ===

function renderGroups() {
    const grid = document.getElementById('groupsGrid');
    grid.innerHTML = '';

    if (currentGroups.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--theme-text-secondary);">
                <div style="font-size: 40px; margin-bottom: 10px;">📅</div>
                <div>На этот день занятий не запланировано</div>
            </div>
        `;
        return;
    }

    currentGroups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'group-card animate-scale-in';
        card.onclick = () => openGroup(group);

        const formattedTime = formatGroupTime(group.schedule_time);

        card.innerHTML = `
            <div class="group-header">
                <div class="group-name">${group.group_name}</div>
                <div class="group-time">${formattedTime}</div>
            </div>
            <div class="group-stats">
                <div class="stat-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>${group.attended_count} / ${group.total_students}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openGroup(group) {
    selectedGroup = group;

    document.getElementById('selectedGroupName').textContent = group.group_name;
    document.getElementById('groupsView').style.display = 'none';
    document.getElementById('studentsView').style.display = 'block';

    // Скролл вверх
    document.querySelector('.game-layout > div[style*="overflow-y: auto"]').scrollTop = 0;

    // Скрываем навигацию по датам, чтобы не менять дату внутри группы
    document.querySelector('.date-navigator').style.display = 'none';

    renderStudents(true);
}

function showGroupsView() {
    selectedGroup = null;
    document.getElementById('studentsView').style.display = 'none';
    document.getElementById('groupsView').style.display = 'block';
    document.querySelector('.date-navigator').style.display = 'flex';
    loadGroups(); // Обновить данные
}

function renderStudents(animate = true) {
    const grid = document.getElementById('studentsGrid');
    grid.innerHTML = '';

    if (!selectedGroup || !selectedGroup.students) return;

    selectedGroup.students.forEach((student, index) => {
        const card = document.createElement('div');
        card.className = `student-card ${student.has_attended ? 'checked' : ''}`;
        if (animate) {
            card.classList.add('animate-scale-in');
            card.style.animationDelay = `${index * 0.05}s`;
        }

        // Check Indicator
        const indicator = document.createElement('div');
        indicator.className = 'check-indicator';
        indicator.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        card.appendChild(indicator);

        // Initials (safe fallback)
        const initials = (student.first_name?.[0] || '') + (student.last_name?.[0] || '');

        // Photo or Fallback
        if (student.photo_path) {
            const img = document.createElement('img');
            img.className = 'student-photo';
            img.alt = student.first_name;

            // Clean path logic
            const rawPath = student.photo_path.replace('frontend/static/', '').replace(/\\/g, '/').replace(/^\//, '');
            img.src = `/static/${rawPath}`;

            img.onerror = function () {
                // Replace img with fallback div
                const fallback = document.createElement('div');
                fallback.className = 'student-photo';
                fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;background:var(--theme-bg-tertiary);font-weight:bold;font-size:1.5em;color:var(--theme-text-secondary)';
                fallback.textContent = initials;
                if (img.parentNode) {
                    img.replaceWith(fallback);
                }
            };
            card.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'student-photo';
            fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;background:var(--theme-bg-tertiary);font-weight:bold;font-size:1.5em;color:var(--theme-text-secondary)';
            fallback.textContent = initials;
            card.appendChild(fallback);
        }

        // Name
        // Name: Show only Surname + Name (ignore patronymic)
        const nameDiv = document.createElement('div');
        nameDiv.className = 'student-name';

        let displayName = '';
        if (student.full_name) {
            const parts = student.full_name.split(' ').filter(p => p.trim());
            if (parts.length > 0) displayName += parts[0]; // Surname
            if (parts.length > 1) displayName += '<br>' + parts[1]; // First Name
        } else {
            displayName = `${student.first_name || ''}<br>${student.last_name ? student.last_name.split(' ')[0] : ''}`;
        }

        nameDiv.innerHTML = displayName;
        card.appendChild(nameDiv);

        card.onclick = () => toggleAttendance(student, card);

        grid.appendChild(card);
    });
}

// === ЛОГИКА ОТМЕТКИ ===

async function toggleAttendance(student, cardElement) {
    const isChecked = cardElement.classList.contains('checked');
    const originalState = isChecked;

    // Оптимистичное обновление UI
    if (isChecked) {
        cardElement.classList.remove('checked');
    } else {
        cardElement.classList.add('checked');
    }

    try {
        let success = false;

        if (isChecked) {
            // Удаляем отметку (если есть attendance_id)
            if (student.attendance_id) {
                const response = await fetch(`/api/attendance/delete/${student.attendance_id}`, {
                    method: 'DELETE'
                });
                const result = await response.json();
                if (result.success) {
                    student.has_attended = false;
                    student.attendance_id = null;
                    success = true;
                }
            }
        } else {
            // Ставим отметку
            const response = await fetch('/api/attendance/manual-checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id: student.id,
                    year: currentDate.getFullYear(),
                    month: currentDate.getMonth() + 1,
                    day: currentDate.getDate()
                })
            });
            const result = await response.json();
            if (result.success) {
                student.has_attended = true;
                if (result.attendance_id) {
                    student.attendance_id = result.attendance_id;
                } else {
                    loadGroups(); // Fallback
                }
                success = true;
            }
        }

        if (!success) {
            // Откат изменений при ошибке
            if (originalState) cardElement.classList.add('checked');
            else cardElement.classList.remove('checked');
            alert("Не удалось изменить статус посещения");
        }
    } catch (error) {
        console.error("Ошибка при изменении посещаемости:", error);
        // Откат
        if (originalState) cardElement.classList.add('checked');
        else cardElement.classList.remove('checked');
        alert("Ошибка соединения");
    }
}
