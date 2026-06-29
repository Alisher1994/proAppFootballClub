const startBtn = document.getElementById('startCamera');
const recognitionResult = document.getElementById('recognitionResult');

const toggleResizeBtn = document.getElementById('toggleResize');
const cameraContainer = document.querySelector('.camera-container');

let recognitionInterval = null;
let isProcessing = false;

// Переключение размера (Масштабирование)
if (toggleResizeBtn) {
    toggleResizeBtn.addEventListener('click', () => {
        cameraContainer.classList.toggle('maximized');

        // Сохраняем выбор пользователя
        const isMaximized = cameraContainer.classList.contains('maximized');
        localStorage.setItem('camera-maximized', isMaximized);

        // Визуальная иконка (опционально можно менять)
        if (isMaximized) {
            toggleResizeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
                </svg>
            `;
        } else {
            toggleResizeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
            `;
        }
    });

    // Восстанавливаем состояние при загрузке
    if (localStorage.getItem('camera-maximized') === 'true') {
        cameraContainer.classList.add('maximized');
        toggleResizeBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
            </svg>
        `;
    }
}

// Запуск автоматического распознавания
startBtn.addEventListener('click', () => {
    if (recognitionInterval) {
        clearInterval(recognitionInterval);
        recognitionInterval = null;
        startBtn.textContent = '🎥 Запустить автосканирование';
        startBtn.className = 'btn-success';
        recognitionResult.innerHTML = '<p class="info-text">Сканирование остановлено</p>';
    } else {
        startBtn.textContent = '⏹ Остановить автосканирование';
        startBtn.className = 'btn-danger';
        recognitionResult.innerHTML = '<p class="info-text">🔍 Автоматическое сканирование активно...</p>';

        // Запустить автоматическое распознавание чаще (каждые 800мс для мгновенного поиска)
        recognitionInterval = setInterval(autoRecognize, 800);
    }
});

// Автоматическое распознавание (теперь на стороне сервера)
async function autoRecognize() {
    if (isProcessing) return;

    isProcessing = true;

    try {
        const response = await fetch('/api/recognize_from_cam', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success && data.count > 0) {
            // Если распознано, отмечаем приход
            for (const student of data.students) {
                await autoCheckInStudent(student);
            }

            // Пауза перед следующим сканированием, если кто-то найден
            setTimeout(() => {
                isProcessing = false;
            }, 4000);
            return;
        }
    } catch (error) {
        console.error('Ошибка распознавания:', error);
    }

    isProcessing = false;
}

// Автоматическая отметка прихода ученика
async function autoCheckInStudent(student) {
    try {
        const response = await fetch('/api/attendance/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.student_id })
        });

        const data = await response.json();

        if (data.success) {
            playBeep();

            if (data.low_balance) {
                showNotification(student.student_name, student.balance, data.remaining_balance, 'low');
            } else {
                showNotification(student.student_name, student.balance, data.remaining_balance, 'success');
            }

            loadTodayAttendance();
            return true;
        } else if (data.message === 'Уже отмечен сегодня') {
            console.log(`${student.student_name} уже отмечен сегодня`);
            showNotification(student.student_name, student.balance, student.balance, 'already');
            return false;
        } else {
            console.error('Ошибка отметки:', data.message);
            return false;
        }
    } catch (error) {
        console.error('Ошибка при отметке:', error);
        return false;
    }
}

// Показать уведомление
function showNotification(name, oldBalance, newBalance, type) {
    const resultDiv = document.getElementById('recognitionResult');

    if (type === 'success') {
        resultDiv.innerHTML = `
            <div style="background: #27ae60; color: white; padding: 20px; border-radius: 8px; text-align: center; animation: slideIn 0.3s ease;">
                <h2 style="margin: 0; font-size: 2rem;">✓ ${name}</h2>
                <p style="font-size: 1.3rem; margin: 10px 0; font-weight: bold;">Приход зафиксирован!</p>
                <p style="margin: 0; font-size: 1.1rem;">Баланс: ${oldBalance} → <strong style="font-size: 1.5rem;">${newBalance}</strong> занятий</p>
            </div>
        `;
    } else if (type === 'already') {
        resultDiv.innerHTML = `
            <div style="background: #ff8a00; color: white; padding: 20px; border-radius: 8px; text-align: center; animation: slideIn 0.3s ease;">
                <h2 style="margin: 0; font-size: 2rem;">👤 ${name}</h2>
                <p style="font-size: 1.3rem; margin: 10px 0; font-weight: bold;">Вы уже отмечены!</p>
                <p style="margin: 0; font-size: 1.1rem;">Хорошей тренировки!</p>
            </div>
        `;
    }

    setTimeout(() => {
        if (recognitionInterval) {
            resultDiv.innerHTML = '<p class="info-text">🔍 Автоматическое сканирование активно...</p>';
        }
    }, 4000);
}

// Звуковой сигнал
function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) { }
}

// Загрузить список присутствующих сегодня
async function loadTodayAttendance() {
    try {
        const response = await fetch('/api/attendance/today');
        const data = await response.json();

        const list = document.getElementById('todayList');
        const counter = document.getElementById('todayCounter');
        if (counter) counter.textContent = data.length;

        if (data.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">Список пуст</div>';
            return;
        }

        list.innerHTML = data.map(record => {
            const escapedName = record.student_name.replace(/'/g, "\\'");
            // Определяем фото или заглушку
            const photoHtml = record.photo_url
                ? `<img src="${record.photo_url}" class="visit-avatar" onerror="this.src='https://via.placeholder.com/48/ccc/666?text=👤'">`
                : `<div class="visit-avatar" style="display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>`;

            return `
                <div class="visit-item" style="position: relative;">
                    ${photoHtml}
                    <div class="visit-info">
                        <div class="visit-name">${record.student_name}</div>
                        <div class="visit-group">${record.group_name || 'Без группы'}</div>
                        <div class="visit-time">🕒 ${record.check_in} (Ост: ${record.balance})</div>
                    </div>
                    
                    <button onclick="deleteAttendance(${record.id}, '${escapedName}')" 
                        style="background:none; border:none; color: #ff6b6b; cursor:pointer; padding:5px; font-size:16px; opacity: 0.6; transition:opacity 0.2s;"
                        onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6"
                        title="Удалить">
                        ✕
                    </button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки посещаемости:', error);
    }
}

async function deleteAttendance(id, name) {
    if (!confirm(`Удалить отметку посещения для ${name}?`)) return;

    try {
        const response = await fetch(`/api/attendance/delete/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            loadTodayAttendance();
        } else {
            alert('Ошибка: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка при удалении:', error);
        alert('Не удалось удалить запись');
    }
}

// Мониторинг системных ресурсов (Task Manager)
async function updateSystemStats() {
    try {
        const response = await fetch('/api/system_stats');
        const data = await response.json();

        // CPU
        const cpuVal = Math.round(data.cpu);
        document.getElementById('statCPU').textContent = `${cpuVal}%`;
        document.getElementById('barCPU').style.width = `${cpuVal}%`;

        // RAM
        const ramVal = Math.round(data.ram);
        document.getElementById('statRAM').textContent = `${ramVal}%`;
        document.getElementById('barRAM').style.width = `${ramVal}%`;

        // GPU
        const gpuVal = Math.round(data.gpu);
        document.getElementById('statGPU').textContent = `${gpuVal}%`;
        document.getElementById('barGPU').style.width = `${gpuVal}%`;

        // VRAM & Temp
        document.getElementById('statVRAM').textContent = `${data.vram}%`;
        document.getElementById('statGPUTemp').textContent = `${data.gpu_temp}°C`;
        document.getElementById('gpuName').textContent = `GPU: ${data.gpu_name}`;

    } catch (e) {
        console.error('Stats error:', e);
    }
}

// Запуск мониторинга
setInterval(updateSystemStats, 2000); // Обновлять каждые 2 сек
updateSystemStats();

loadTodayAttendance();
setInterval(loadTodayAttendance, 30000);
