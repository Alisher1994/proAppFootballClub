document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error-message');
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Проверить, есть ли специальный редирект для роли
            if (data.redirect) {
                window.location.href = data.redirect;
            } else {
                window.location.href = '/dashboard';
            }
        } else {
            errorDiv.textContent = data.message || 'Ошибка входа';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения с сервером';
    }
});

(() => {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.getElementById('togglePassword');
    if (!passwordInput || !toggleButton) return;

    const eyeIcon = toggleButton.querySelector('[data-eye-icon]');
    const eyeOffIcon = toggleButton.querySelector('[data-eye-off-icon]');

    toggleButton.addEventListener('click', () => {
        const shouldShowPassword = passwordInput.type === 'password';
        passwordInput.type = shouldShowPassword ? 'text' : 'password';
        toggleButton.setAttribute('aria-label', shouldShowPassword ? 'Скрыть пароль' : 'Показать пароль');

        if (eyeIcon && eyeOffIcon) {
            eyeIcon.style.display = shouldShowPassword ? 'none' : '';
            eyeOffIcon.style.display = shouldShowPassword ? '' : 'none';
        }
    });
})();

// Секретная последовательность для входа в админку
(() => {
    const root = document.body;
    if (!root || !root.classList.contains('login-page')) return;

    const secret = 'adminadminadmin';
    let buffer = '';
    let lastInputTime = Date.now();

    const triggerMagicLogin = async () => {
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ magic: secret })
            });

            const data = await response.json();
            if (data.success) {
                window.location.href = data.redirect || '/dashboard';
            }
        } catch (error) {
            // ignore
        }
    };

    document.addEventListener('keydown', (e) => {
        // Сбрасываем буфер после паузы
        if (Date.now() - lastInputTime > 2000) {
            buffer = '';
        }
        lastInputTime = Date.now();

        if (e.key.length === 1) {
            buffer += e.key.toLowerCase();
            if (buffer.length > secret.length) {
                buffer = buffer.slice(-secret.length);
            }
            if (buffer === secret) {
                triggerMagicLogin();
            }
        }
    });
})();

// Анимированная сетка фона с реакцией на мышь (только для страницы входа)
(() => {
    const root = document.body;
    if (!root || !root.classList.contains('login-page')) return;

    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;
    let lastTime = performance.now();

    const handleMove = (event) => {
        const x = (event.clientX / window.innerWidth) * 100;
        const y = (event.clientY / window.innerHeight) * 100;
        targetX = Math.min(100, Math.max(0, x));
        targetY = Math.min(100, Math.max(0, y));
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', (event) => {
        if (!event.touches || !event.touches[0]) return;
        handleMove(event.touches[0]);
    }, { passive: true });

    const animate = (time) => {
        const dt = Math.min(32, time - lastTime);
        lastTime = time;

        // Плавное приближение к позиции мыши
        currentX += (targetX - currentX) * 0.06;
        currentY += (targetY - currentY) * 0.06;

        // Авто-анимация
        const t = time * 0.001;
        const driftX = Math.sin(t) * 20;
        const driftY = Math.cos(t * 0.9) * 16;
        const skew = Math.sin(t * 0.7) * 0.8;

        // Искажение от курсора
        const mouseOffsetX = (currentX - 50) * 0.4;
        const mouseOffsetY = (currentY - 50) * 0.35;

        root.style.setProperty('--grid-x', currentX.toFixed(2));
        root.style.setProperty('--grid-y', currentY.toFixed(2));
        root.style.setProperty('--grid-offset-x', (driftX + mouseOffsetX).toFixed(2));
        root.style.setProperty('--grid-offset-y', (driftY + mouseOffsetY).toFixed(2));
        root.style.setProperty('--grid-skew', skew.toFixed(2));

        requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
})();

// Анимированный текст с поддержкой года и ссылкой на Telegram
(() => {
    const ticker = document.getElementById('login-ticker-text');
    if (!ticker) return;

    const startYear = 2026;
    const currentYear = new Date().getFullYear();
    const yearText = currentYear > startYear ? `${startYear} - ${currentYear}` : `${startYear}`;

    ticker.innerHTML = `Поддержка и улучшения системы&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://t.me/alishermusayev94" target="_blank" rel="noopener">Telegram</a>&nbsp;&nbsp;|&nbsp;&nbsp;+998 99 4067406 Алишер&nbsp;&nbsp;|&nbsp;&nbsp;Разработано YTT "MUSAYEV ALISHER" ${yearText}`;
})();
