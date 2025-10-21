const CACHE_NAME = 'medicine-inventory-v6';
// Derive base path from service worker scope so it works on GitHub Pages subpaths
const SCOPE_PATH = new URL(self.registration.scope).pathname; // e.g. /medicine-inventory/
const urlsToCache = [
    SCOPE_PATH,
    SCOPE_PATH + 'index.html',
    SCOPE_PATH + 'styles.css',
    SCOPE_PATH + 'app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // For navigation requests (HTML), prefer network first so URL params are respected
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                // Update cached index for offline
                cache.put(SCOPE_PATH + 'index.html', networkResponse.clone());
                return networkResponse;
            } catch (e) {
                // Offline fallback to cached index
                return (await caches.match(SCOPE_PATH + 'index.html'))
                    || (await caches.match(SCOPE_PATH))
                    || Response.error();
            }
        })());
        return;
    }
    const url = new URL(request.url);
    const isAppShellAsset = url.pathname.startsWith(SCOPE_PATH) && (
        url.pathname.endsWith('app.js') ||
        url.pathname.endsWith('styles.css') ||
        url.pathname.endsWith('manifest.json')
    );

    if (isAppShellAsset) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const networkResponse = await fetch(request);
                cache.put(request, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                const cached = await cache.match(request);
                if (cached) return cached;
                throw error;
            }
        })());
        return;
    }

    // For other requests, cache-first fallback to network
    event.respondWith(
        caches.match(request, { ignoreSearch: false })
            .then((response) => response || fetch(request))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Clear old caches
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});
