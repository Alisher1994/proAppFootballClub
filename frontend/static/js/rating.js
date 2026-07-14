// Загрузка рейтинга всех групп
async function loadAllGroupsRating() {
    try {
        const response = await fetch('/api/rating/all-groups');
        const data = await response.json();
        
        if (!data.groups || data.groups.length === 0) {
            document.getElementById('ratingContent').innerHTML = '<p style="text-align: center; padding: 40px; color: #95a5a6;">Нет данных для отображения рейтинга</p>';
            return;
        }
        
        renderAllGroupsPodium(data.groups);
        
        // Запустить анимацию частиц
        triggerParticlesAnimation();
    } catch (error) {
        console.error('Ошибка загрузки рейтинга:', error);
        document.getElementById('ratingContent').innerHTML = '<p style="text-align: center; padding: 40px; color: #e74c3c;">Ошибка загрузки рейтинга</p>';
    }
}

// Отрисовка пьедестала для одной группы
function renderPodium(rating, groupName) {
    if (!rating || rating.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #95a5a6;">
                <p>Нет данных для отображения</p>
            </div>
        `;
    }
    
    return `
        <div class="podium-container">
            ${rating.map((student, index) => {
                const place = index + 1;
                let podiumClass = 'podium-other';
                let placeEmoji = `${place}`;
                
                if (place === 1) {
                    podiumClass = 'podium-1';
                    placeEmoji = '🥇';
                } else if (place === 2) {
                    podiumClass = 'podium-2';
                    placeEmoji = '🥈';
                } else if (place === 3) {
                    podiumClass = 'podium-3';
                    placeEmoji = '🥉';
                }
                
                const photoUrl = student.photo_url || (student.photo_path
                    ? `/static/${student.photo_path.replace('frontend/static/', '').replace(/\\/g, '/')}`
                    : null);
                
                const placeholderId = `placeholder-${student.student_id}-${groupName}`;
                let medalClass = '';
                if (place === 1) {
                    medalClass = 'medal-1';
                } else if (place === 2) {
                    medalClass = 'medal-2';
                } else if (place === 3) {
                    medalClass = 'medal-3';
                }
                
                // Разделение имени на фамилию и имя
                const nameParts = student.full_name.trim().split(/\s+/);
                let lastName = '';
                let firstName = '';
                
                if (nameParts.length >= 2) {
                    // Фамилия - последнее слово, имя - все остальное
                    lastName = nameParts[nameParts.length - 1];
                    firstName = nameParts.slice(0, -1).join(' ');
                } else if (nameParts.length === 1) {
                    // Если только одно слово, считаем его фамилией
                    lastName = nameParts[0];
                }
                
                return `
                    <div class="podium-item">
                        <div class="podium-student">
                            <div class="podium-place ${medalClass}">${placeEmoji}</div>
                            <div class="podium-photo-wrapper">
                                ${photoUrl ? 
                                    `<img src="${photoUrl}" alt="${student.full_name}" class="podium-photo" loading="lazy" decoding="async" onerror="document.getElementById('${placeholderId}').style.display='flex'; this.style.display='none';">` :
                                    ''
                                }
                                <div id="${placeholderId}" class="avatar-placeholder" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto; display: ${photoUrl ? 'none' : 'flex'}; align-items: center; justify-content: center; background: #e0e0e0; font-size: 32px; border: 4px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); position: relative; z-index: 5;">👤</div>
                            </div>
                            <div class="podium-name">
                                ${lastName ? `<span class="podium-name-last" title="${lastName}">${lastName}</span>` : ''}
                                ${firstName ? `<span class="podium-name-first" title="${firstName}">${firstName}</span>` : ''}
                            </div>
                            <div class="podium-points">⭐ ${student.points}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Отрисовка пьедесталов для всех групп
function renderAllGroupsPodium(groups) {
    const container = document.getElementById('ratingContent');
    
    let html = '';
    
    groups.forEach(group => {
        if (!group.rating || group.rating.length === 0) {
            html += `
                <div style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 20px; color: #1a202c; font-size: 20px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">
                        👨‍👩‍👦 ${group.group_name}
                    </h3>
                    <p style="text-align: center; padding: 40px; color: #95a5a6;">Нет данных для отображения</p>
                </div>
            `;
        } else {
            html += `
                <div style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 20px; color: #1a202c; font-size: 20px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">
                        👨‍👩‍👦 ${group.group_name}
                    </h3>
                    ${renderPodium(group.rating, group.group_name)}
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}

// Анимация частиц (хлопушки)
function triggerParticlesAnimation() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const colors = ['#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7', '#ff8a00', '#d96f00', '#ff8a00', '#e74c3c'];
    
    // Создать несколько взрывов по всей площади экрана
    const burstCount = 5; // Увеличено количество взрывов
    for (let burst = 0; burst < burstCount; burst++) {
        setTimeout(() => {
            // Случайная позиция по всей площади экрана с отступом от краев
            const margin = 100;
            const centerX = margin + Math.random() * (canvas.width - 2 * margin);
            const centerY = margin + Math.random() * (canvas.height - 2 * margin);
            
            // Увеличено количество частиц в каждом взрыве
            const particlesPerBurst = 80;
            for (let i = 0; i < particlesPerBurst; i++) {
                const angle = (Math.PI * 2 * i) / particlesPerBurst + Math.random() * 0.8;
                const speed = 3 + Math.random() * 6; // Увеличена скорость
                particles.push({
                    x: centerX,
                    y: centerY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: 4 + Math.random() * 5, // Увеличен размер частиц
                    life: 1.0,
                    decay: 0.015 + Math.random() * 0.02 // Медленнее затухание для большей видимости
                });
            }
        }, burst * 250); // Уменьшена задержка между взрывами
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // гравитация
            p.life -= p.decay;
            
            if (p.life > 0) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                particles.splice(i, 1);
            }
        }
        
        if (particles.length > 0) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    setTimeout(() => animate(), 100);
}

// Загрузить рейтинг всех групп при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadAllGroupsRating();
});
