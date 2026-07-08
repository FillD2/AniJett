/**
 * AniJett Service Worker
 * Caching strategies:
 *   - Images / fonts / icons  → Cache First (long-lived assets)
 *   - JS / CSS                → Stale While Revalidate (fast load + background update)
 *   - HTML / navigation       → Network First (always try to get fresh markup)
 *   - API calls               → Network Only (never cache dynamic data)
 *   - Push notifications      → handled via push event
 */

const CACHE_VERSION  = 'anijett-v12';
const STATIC_ASSETS  = ['/img/anj-favicon.png', '/manifest.json'];

// ======================== INSTALL ========================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ======================== ACTIVATE ========================
// Delete all caches except the current version.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
                )
            )
            .then(() => self.clients.claim())
    );
});

// ======================== FETCH ========================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin requests (skip cross-origin e.g. CDN, Jikan API)
    if (url.origin !== self.location.origin) return;

    // API calls — always go to network, never cache
    if (url.pathname.startsWith('/api/')) return;

    const ext = url.pathname.split('.').pop().toLowerCase();

    // Images & icons — Cache First (serve from cache, fetch on miss)
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'woff', 'woff2'].includes(ext)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // JS & CSS — Stale While Revalidate (serve cached, update in background)
    if (['js', 'css'].includes(ext)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // HTML / navigation — Network First (fresh content, fallback to cache)
    if (request.mode === 'navigate' || ext === 'html' || url.pathname === '/') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Everything else — Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request));
});

// ======================== PUSH NOTIFICATIONS ========================
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data?.json() || {}; } catch {}

    const title   = data.title   || 'AniJett';
    const options = {
        body:    data.body || data.message || '',
        icon:    data.icon || '/img/anj-favicon.png',
        badge:   '/img/anj-favicon.png',
        data:    data.data || {},
        vibrate: [100, 50, 100],
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks — open/focus the app
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(list => {
                const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
                if (existing) return existing.focus();
                if (clients.openWindow) return clients.openWindow(target);
            })
    );
});

// ======================== STRATEGY HELPERS ========================

/**
 * Cache First — serve from cache, fall back to network on miss.
 * Best for immutable assets (images, fonts).
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

/**
 * Stale While Revalidate — serve from cache immediately, update in background.
 * Best for JS/CSS that changes occasionally.
 * Always returns a valid Response — never resolves to null.
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);

    // Kick off background fetch regardless (updates cache silently)
    const fetchPromise = fetch(request)
        .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    if (cached) {
        // Serve stale immediately; background fetch updates the cache
        return cached;
    }

    // No cache — wait for network
    const response = await fetchPromise;
    return response || new Response('', { status: 503, statusText: 'Offline' });
}

/**
 * Network First — try network, fall back to cache.
 * Best for HTML pages that should stay fresh.
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Ultimate fallback for navigation
        if (request.mode === 'navigate') {
            const root = await cache.match('/');
            if (root) return root;
        }
        return new Response('Offline — please check your connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}
