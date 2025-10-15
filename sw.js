const CACHE_NAME = 'medicine-inventory-v3';
// Derive base path from service worker scope so it works on GitHub Pages subpaths
const SCOPE_PATH = new URL(self.registration.scope).pathname; // e.g. /medicine-inventory/
const urlsToCache = [
    SCOPE_PATH,
    SCOPE_PATH + 'index.html',
    SCOPE_PATH + 'styles.css',
    SCOPE_PATH + 'app.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
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
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            }
        )
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
