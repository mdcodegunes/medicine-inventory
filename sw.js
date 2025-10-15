const CACHE_NAME = 'medicine-inventory-v4';
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
    // For navigation requests (HTML), prefer network first so URL params are respected
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(event.request);
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
    // For other requests, cache-first fallback to network
    event.respondWith(
        caches.match(event.request, { ignoreSearch: false })
            .then((response) => response || fetch(event.request))
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
