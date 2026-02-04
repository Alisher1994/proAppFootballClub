// Загрузка типов вознаграждений
async function loadRewardTypes() {
    try {
        const response = await fetch('/api/rewards');
        const rewards = await response.json();
        const select = document.getElementById('reward_type_select');
        if (select) {
            select.innerHTML = '<option value="">Выберите тип вознаграждения</option>' +
                rewards.map(r => `<option value="${r.id}" data-points="${r.points}">${r.name} (+${r.points} баллов)</option>`).join('');
        }
        return rewards;
    } catch (error) {
        console.error('Ошибка загрузки типов вознаграждений:', error);
        return [];
    }
}

// Модальные окна
const giveRewardModal = document.getElementById('giveRewardModal');
const rewardsHistoryModal = document.getElementById('rewardsHistoryModal');

// Открыть модалку выдачи вознаграждения
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.give-reward-btn');
    if (!btn) return;
    
    const studentId = btn.getAttribute('data-student-id');
    
    // Получить имя ученика из нового интерфейса или старой таблицы
    let studentName = 'Ученик';
    
    // Попытка получить из нового интерфейса (панель деталей)
    const detailsContent = document.getElementById(`studentDetails_${studentId}`);
    if (detailsContent) {
        const nameElement = detailsContent.querySelector('.student-full-name');
        if (nameElement) {
            studentName = nameElement.textContent.replace('■', '').trim();
        }
    }
    
    // Если не нашли, попробуем из списка учеников
    if (studentName === 'Ученик') {
        const listItem = document.querySelector(`.student-list-item[data-student-id="${studentId}"]`);
        if (listItem) {
            const nameElement = listItem.querySelector('.student-item-name');
            if (nameElement) {
                studentName = nameElement.textContent.trim();
            }
        }
    }
    
    // Если всё ещё не нашли, попробуем из старой таблицы (для совместимости)
    if (studentName === 'Ученик') {
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        if (row) {
            const nameCell = row.querySelector('td:nth-child(3)');
            if (nameCell) {
                studentName = nameCell.textContent.trim();
            }
        }
    }
    
    document.getElementById('reward_student_id').value = studentId;
    document.getElementById('reward-student-name').textContent = `Ученик: ${studentName}`;
    
    await loadRewardTypes();
    giveRewardModal.style.display = 'block';
});

// Закрыть модалки
document.querySelectorAll('.give-reward-close, .rewards-history-close').forEach(btn => {
    btn.addEventListener('click', () => {
        giveRewardModal.style.display = 'none';
        rewardsHistoryModal.style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target === giveRewardModal) giveRewardModal.style.display = 'none';
    if (e.target === rewardsHistoryModal) rewardsHistoryModal.style.display = 'none';
});

// Выдать вознаграждение
document.getElementById('giveRewardForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const studentId = document.getElementById('reward_student_id').value;
    const rewardTypeId = document.getElementById('reward_type_select').value;
    
    if (!rewardTypeId) {
        alert('Выберите тип вознаграждения');
        return;
    }
    
    try {
        const response = await fetch(`/api/students/${studentId}/rewards`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({reward_type_id: rewardTypeId})
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            giveRewardModal.style.display = 'none';
            document.getElementById('giveRewardForm').reset();
            // Обновить страницу для отображения новых баллов
            location.reload();
        } else {
            alert('Ошибка: ' + (result.message || 'Не удалось выдать вознаграждение'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при выдаче вознаграждения');
    }
});

// Показать историю баллов
window.showRewardsHistory = async function(studentId) {
    let studentName = 'Ученик';
    
    // Попытка получить из нового интерфейса (панель деталей)
    const detailsContent = document.getElementById(`studentDetails_${studentId}`);
    if (detailsContent) {
        const nameElement = detailsContent.querySelector('.student-full-name');
        if (nameElement) {
            studentName = nameElement.textContent.replace('■', '').trim();
        }
    }
    
    // Если не нашли, попробуем из списка учеников
    if (studentName === 'Ученик') {
        const listItem = document.querySelector(`.student-list-item[data-student-id="${studentId}"]`);
        if (listItem) {
            const nameElement = listItem.querySelector('.student-item-name');
            if (nameElement) {
                studentName = nameElement.textContent.trim();
            }
        }
    }
    
    // Если всё ещё не нашли, попробуем из старой таблицы (для совместимости)
    if (studentName === 'Ученик') {
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`) || 
                     Array.from(document.querySelectorAll('tr')).find(tr => 
                         tr.querySelector(`button[data-student-id="${studentId}"]`));
        if (row) {
            const nameCell = row.querySelector('td:nth-child(3)');
            if (nameCell) studentName = nameCell.textContent.trim();
        }
    }
    
    document.getElementById('history-student-name').textContent = `Ученик: ${studentName}`;
    
    try {
        const response = await fetch(`/api/students/${studentId}/rewards`);
        const rewards = await response.json();
        
        const list = document.getElementById('rewardsHistoryList');
        if (rewards.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: #95a5a6; padding: 20px;">Нет выданных вознаграждений</p>';
        } else {
            list.innerHTML = rewards.map(r => {
                const date = new Date(r.issued_at);
                const dateStr = date.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
                return `
                    <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #2c3e50;">${r.reward_name}</strong>
                            <div style="font-size: 12px; color: #7f8c8d; margin-top: 4px;">
                                ${dateStr} • Выдал: ${r.issuer_name}
                            </div>
                        </div>
                        <span style="color: #f39c12; font-weight: bold; font-size: 18px;">+${r.points}</span>
                    </div>
                `;
            }).join('');
        }
        
        rewardsHistoryModal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        alert('Ошибка загрузки истории вознаграждений');
    }
};

// Загрузить типы вознаграждений при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadRewardTypes();
});





