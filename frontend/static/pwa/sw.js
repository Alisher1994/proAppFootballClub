/* FK Karasu — service worker.
   Deliberately conservative: HTML is always fetched from the network so the app
   never boots from a stale build. Only versioned static assets are cached. */

const VERSION = 'fk-karasu-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/static/pwa/offline.html';

const PRECACHE = [
    OFFLINE_URL,
    '/static/pwa/icon-192.png',
    '/static/pwa/icon-512.png',
    '/static/pwa/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .catch(() => undefined)
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
    return url.pathname.startsWith('/static/')
        && !url.pathname.startsWith('/static/uploads/');
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Never cache API responses or media — они всегда должны быть свежими.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

    // Навигация: только сеть, офлайн-страница как запасной вариант.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
        );
        return;
    }

    // Статика: отдаём из кеша мгновенно и обновляем в фоне.
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.open(STATIC_CACHE).then((cache) => cache.match(request).then((cached) => {
                const network = fetch(request).then((response) => {
                    if (response && response.ok && response.type === 'basic') {
                        cache.put(request, response.clone());
                    }
                    return response;
                }).catch(() => cached);
                return cached || network;
            }))
        );
    }
});
