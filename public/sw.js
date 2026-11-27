/**
 * Service worker: keeps the event-day pages usable without a connection (see
 * docs/superpowers/specs/2026-11-27-offline-event-day-design.md).
 * - static files: served from a cache, refreshed in the background
 * - event-day pages (schedule, vendors, a vendor's page, /offline): network first; the last good
 *   copy is served when the network fails
 * - every other page: network only, with the offline page when the network fails
 * Only same-origin GETs are handled. Bump VERSION when what is cached changes meaning.
 */
(function () {
    'use strict';

    const VERSION = 'v1';
    const STATIC_CACHE = `fp-static-${VERSION}`;
    const PAGE_CACHE = `fp-pages-${VERSION}`;
    const STATIC_PRECACHE = ['/css/main.css', '/css/themes.css', '/js/app.js'];
    const OFFLINE_PAGE = '/offline';
    const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const STATIC_PATHS = /^\/(css|js|images)\//;
    const EVENT_PATHS = [/^\/schedule$/, /^\/vendors$/, new RegExp(`^/vendors/${UUID}$`, 'i'), /^\/offline$/];

    /**
     * How a URL is handled.
     * @param {URL} url
     * @param {string} origin - This site's origin.
     * @returns {'static'|'event'|'page'|'skip'}
     */
    const routeFor = (url, origin) => {
        if (url.origin !== origin) return 'skip';
        if (url.pathname === '/sw.js') return 'skip';
        if (STATIC_PATHS.test(url.pathname)) return 'static';
        if (EVENT_PATHS.some((pattern) => pattern.test(url.pathname))) return 'event';
        return 'page';
    };

    /**
     * Only successful, same-origin, non-redirected responses are kept: never an error page, and
     * never the login page a signed-out request is redirected to.
     * @param {{ok: boolean, status: number, redirected: boolean, url: string, type: string}} response
     * @returns {boolean}
     */
    const shouldStore = (response) =>
        response.ok &&
        response.status === 200 &&
        !response.redirected &&
        response.type === 'basic' &&
        !new URL(response.url).pathname.startsWith('/login');

    self.routeFor = routeFor;
    self.shouldStore = shouldStore;

    const offlineResponse = async () =>
        (await caches.match(OFFLINE_PAGE)) ??
        new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    const networkFirst = async (request) => {
        const cache = await caches.open(PAGE_CACHE);
        try {
            const response = await fetch(request);
            if (shouldStore(response)) await cache.put(request.url, response.clone());
            return response;
        } catch {
            return (await cache.match(request.url)) ?? offlineResponse();
        }
    };

    const staleWhileRevalidate = async (event) => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(event.request);
        const refresh = fetch(event.request)
            .then((response) => {
                if (shouldStore(response)) return cache.put(event.request, response.clone()).then(() => response);
                return response;
            })
            .catch(() => cached);
        if (cached) {
            event.waitUntil(refresh);
            return cached;
        }
        return refresh;
    };

    /** Saves the given event-day pages now (asked by app.js on the schedule page). */
    const savePages = async (urls) => {
        const cache = await caches.open(PAGE_CACHE);
        let count = 0;
        for (const path of urls) {
            const url = new URL(path, self.location.origin);
            if (routeFor(url, self.location.origin) !== 'event') continue;
            try {
                const response = await fetch(url.href, { credentials: 'same-origin' });
                if (shouldStore(response)) {
                    await cache.put(url.href, response);
                    count += 1;
                }
            } catch {
                // Offline or failed: keep whatever copy is already saved.
            }
        }
        return count;
    };

    self.addEventListener('install', (event) => {
        event.waitUntil(
            Promise.all([
                caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PRECACHE)),
                caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_PAGE))
            ]).then(() => self.skipWaiting())
        );
    });

    self.addEventListener('activate', (event) => {
        const current = [STATIC_CACHE, PAGE_CACHE];
        event.waitUntil(
            caches
                .keys()
                .then((names) =>
                    Promise.all(
                        names
                            .filter((name) => name.startsWith('fp-') && !current.includes(name))
                            .map((name) => caches.delete(name))
                    )
                )
                .then(() => self.clients.claim())
        );
    });

    self.addEventListener('fetch', (event) => {
        const { request } = event;
        if (request.method !== 'GET') return;
        const route = routeFor(new URL(request.url), self.location.origin);
        if (route === 'static') event.respondWith(staleWhileRevalidate(event));
        else if (route === 'event' && request.mode === 'navigate') event.respondWith(networkFirst(request));
        else if (route === 'page' && request.mode === 'navigate') {
            event.respondWith(fetch(request).catch(offlineResponse));
        }
    });

    self.addEventListener('message', (event) => {
        const data = event.data ?? {};
        const reply = (message) => event.ports[0]?.postMessage(message);
        if (data.type === 'save' && Array.isArray(data.urls)) {
            event.waitUntil(savePages(data.urls).then((count) => reply({ type: 'saved', count })));
        } else if (data.type === 'clear-pages') {
            // The active wedding changed: the saved event day belongs to another couple.
            event.waitUntil(
                caches
                    .open(PAGE_CACHE)
                    .then((cache) =>
                        cache
                            .keys()
                            .then((keys) =>
                                Promise.all(
                                    keys
                                        .filter((key) => new URL(key.url).pathname !== OFFLINE_PAGE)
                                        .map((key) => cache.delete(key))
                                )
                            )
                    )
                    .then(() => reply({ type: 'cleared' }))
            );
        }
    });
})();
