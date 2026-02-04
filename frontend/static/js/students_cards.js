// Глобальные переменные для карточек
let cardTypes = [];
let studentCards = {}; // {studentId: [cards]}

// Загрузка типов карточек
async function loadCardTypes() {
    try {
        const response = await fetch('/api/card-types');
        const types = await response.json();
        cardTypes = types;
        
        // Заполнить селект в модальном окне
        const select = document.getElementById('card_type_select');
        if (select) {
            select.innerHTML = '<option value="">Выберите тип карточки</option>' +
                types.map(ct => `<option value="${ct.id}" data-color="${ct.color}">${ct.name}</option>`).join('');
        }
        
        return types;
    } catch (error) {
        console.error('Ошибка загрузки типов карточек:', error);
        return [];
    }
}

// Загрузка активных карточек ученика
async function loadStudentCards(studentId) {
    try {
        const response = await fetch(`/api/students/${studentId}/cards`);
        const cards = await response.json();
        studentCards[studentId] = cards;
        renderStudentCards(studentId);
        return cards;
    } catch (error) {
        console.error('Ошибка загрузки карточек ученика:', error);
        return [];
    }
}

// Отображение карточек ученика
function renderStudentCards(studentId) {
    const container = document.getElementById(`studentCards_${studentId}`);
    if (!container) return;
    
    const cards = studentCards[studentId] || [];
    const slots = container.querySelectorAll('.student-card-slot');
    
    slots.forEach((slot, index) => {
        const card = cards[index];
        
        // Очистить слот
        slot.classList.remove('empty', 'yellow', 'red', 'orange', 'blue', 'green');
        slot.innerHTML = '';
        
        if (card) {
            // Заполненный слот
            slot.classList.add(card.card_type_color);
            slot.innerHTML = `
                <div class="student-card-content">
                    ${card.card_type_name}
                </div>
            `;
            slot.setAttribute('data-card-id', card.id);
        } else {
            // Пустой слот
            slot.classList.add('empty');
            slot.innerHTML = '<div class="card-plus-icon">+</div>';
            slot.removeAttribute('data-card-id');
        }
    });
}

// Обработка клика по карточке
window.handleCardClick = async function(studentId, slotIndex) {
    const container = document.getElementById(`studentCards_${studentId}`);
    if (!container) return;
    
    const slot = container.querySelector(`.student-card-slot[data-slot-index="${slotIndex}"]`);
    if (!slot) return;
    
    const cardId = slot.getAttribute('data-card-id');
    
    if (cardId) {
        // Карточка есть - спросить о снятии
        if (confirm('Снять эту карточку с ученика?')) {
            await removeCard(studentId, parseInt(cardId));
        }
    } else {
        // Карточки нет - выдать новую
        await openGiveCardModal(studentId, slotIndex);
    }
};

// Открыть модальное окно выдачи карточки
async function openGiveCardModal(studentId, slotIndex) {
    const modal = document.getElementById('giveCardModal');
    if (!modal) return;
    
    // Убедиться, что типы карточек загружены
    if (cardTypes.length === 0) {
        await loadCardTypes();
        if (cardTypes.length === 0) {
            alert('Ошибка: не удалось загрузить типы карточек. Попробуйте обновить страницу.');
            return;
        }
    }
    
    // Получить имя ученика
    let studentName = 'Ученик';
    const detailsContent = document.getElementById(`studentDetails_${studentId}`);
    if (detailsContent) {
        const nameElement = detailsContent.querySelector('.student-full-name');
        if (nameElement) {
            studentName = nameElement.textContent.replace('■', '').trim();
        }
    }
    
    document.getElementById('card_student_id').value = studentId;
    document.getElementById('card_slot_index').value = slotIndex;
    document.getElementById('card_is_remove').value = 'false';
    document.getElementById('card-student-name').textContent = `Ученик: ${studentName}`;
    document.getElementById('card_reason').value = '';
    document.getElementById('card_type_select').value = '';
    
    modal.style.display = 'block';
}

// Выдать карточку
async function issueCard(studentId, cardTypeId, reason) {
    try {
        const response = await fetch(`/api/students/${studentId}/cards`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                card_type_id: cardTypeId,
                reason: reason
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Перезагрузить карточки
            await loadStudentCards(studentId);
            
            // Закрыть модальное окно
            document.getElementById('giveCardModal').style.display = 'none';
            document.getElementById('giveCardForm').reset();
            
            alert(result.message);
        } else {
            alert('Ошибка: ' + (result.message || 'Не удалось выдать карточку'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при выдаче карточки');
    }
}

// Снять карточку
async function removeCard(studentId, cardId) {
    try {
        const response = await fetch(`/api/students/${studentId}/cards/${cardId}/remove`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Перезагрузить карточки
            await loadStudentCards(studentId);
            alert(result.message);
        } else {
            alert('Ошибка: ' + (result.message || 'Не удалось снять карточку'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при снятии карточки');
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    // Загрузить типы карточек
    loadCardTypes().then(types => {
        if (types.length === 0) {
            console.warn('Типы карточек не загружены. Попробуйте обновить страницу.');
        }
    });
    
    // Обработчик формы выдачи карточки
    const giveCardForm = document.getElementById('giveCardForm');
    if (giveCardForm) {
        giveCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const studentId = parseInt(document.getElementById('card_student_id').value);
            const cardTypeId = parseInt(document.getElementById('card_type_select').value);
            const reason = document.getElementById('card_reason').value.trim();
            
            if (!cardTypeId) {
                alert('Выберите тип карточки');
                return;
            }
            
            if (!reason) {
                alert('Укажите причину выдачи карточки');
                return;
            }
            
            await issueCard(studentId, cardTypeId, reason);
        });
    }
    
    // Закрытие модального окна
    const giveCardClose = document.querySelector('.give-card-close');
    if (giveCardClose) {
        giveCardClose.addEventListener('click', () => {
            document.getElementById('giveCardModal').style.display = 'none';
        });
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('giveCardModal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Экспортировать функцию для загрузки карточек при выборе ученика
window.loadStudentCardsOnSelect = loadStudentCards;

