(function () {
    const STATE_URL = '/api/service-control/state';
    const OVERLAY_ID = 'service-lock-overlay';
    const STYLE_ID = 'service-lock-overlay-style';

    function createStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.service-lock-active > *:not(.service-lock-overlay) {
                filter: blur(8px);
                pointer-events: none !important;
                user-select: none !important;
            }
            .service-lock-overlay {
                position: fixed;
                inset: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(10, 14, 26, 0.35);
                backdrop-filter: blur(4px);
            }
            .service-lock-modal {
                width: min(560px, 100%);
                border-radius: 16px;
                padding: 20px;
                background: rgba(15, 23, 42, 0.94);
                color: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.25);
                box-shadow: 0 20px 50px rgba(2, 6, 23, 0.45);
                text-align: center;
            }
            .service-lock-badge {
                display: inline-block;
                padding: 6px 10px;
                border-radius: 999px;
                background: rgba(239, 68, 68, 0.2);
                color: #fecaca;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.03em;
                margin-bottom: 10px;
            }
            .service-lock-title {
                margin: 0 0 10px 0;
                font-size: 22px;
                line-height: 1.2;
            }
            .service-lock-message {
                margin: 0;
                font-size: 15px;
                line-height: 1.5;
                color: #ffedd5;
            }
            .service-lock-phone {
                margin-top: 12px;
                font-size: 18px;
                font-weight: 700;
                color: #fde68a;
                word-break: break-word;
            }
            @media (max-width: 640px) {
                .service-lock-modal {
                    border-radius: 14px;
                    padding: 16px;
                }
                .service-lock-title {
                    font-size: 19px;
                }
                .service-lock-message {
                    font-size: 14px;
                }
                .service-lock-phone {
                    font-size: 16px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function buildOverlay(state) {
        if (document.getElementById(OVERLAY_ID)) return;

        createStyles();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'service-lock-overlay';

        const title = state.title || 'Система временно отключена';
        const message = state.message || 'Система временно отключена из-за неоплаты.';
        const phone = state.support_phone || '+998994067406';

        overlay.innerHTML = `
            <div class="service-lock-modal" role="alertdialog" aria-live="assertive" aria-modal="true">
                <div class="service-lock-badge">СЕРВИС ОТКЛЮЧЕН</div>
                <h2 class="service-lock-title">${title}</h2>
                <p class="service-lock-message">${message}</p>
                <div class="service-lock-phone">Телефон для оплаты: ${phone}</div>
            </div>
        `;

        document.body.classList.add('service-lock-active');
        document.body.appendChild(overlay);
    }

    async function initServiceLockOverlay() {
        try {
            const response = await fetch(STATE_URL, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (!response.ok) return;

            const state = await response.json();
            if (!state || state.enabled) return;

            buildOverlay(state);
        } catch (error) {
            console.warn('Service lock overlay init failed:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initServiceLockOverlay);
    } else {
        initServiceLockOverlay();
    }
})();
