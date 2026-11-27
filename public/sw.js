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
    const WEDDING_KEY = '/__fp-wedding'; // which wedding the saved pages belong to
    const NETWORK_TIMEOUT_MS = 4000; // weak signal: show the saved copy instead of waiting
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

    /**
     * What to do with the saved pages when a page names its wedding (the X-FP-Wedding header).
     * @param {string|null} previous - The wedding the saved pages belong to, if known.
     * @param {string|null} current - The header value: a wedding id, "none", or null when absent.
     * @returns {'keep'|'remember'|'clear'}
     */
    const weddingAction = (previous, current) => {
        if (!current || current === previous) return 'keep';
        if (!previous) return 'remember';
        return 'clear';
    };

    /**
     * Marks a saved page so app.js always shows the "offline copy" banner on it, even when the
     * browser thinks it is online (venue Wi-Fi without internet, a captive portal).
     * @param {string} html
     * @returns {string}
     */
    const markSavedCopy = (html) => html.replace(' data-rendered-at=', ' data-saved-copy data-rendered-at=');

    /** The saved copy of a page, marked as such. */
    const savedCopy = async (response) =>
        new Response(markSavedCopy(await response.text()), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

    self.routeFor = routeFor;
    self.markSavedCopy = markSavedCopy;
    self.shouldStore = shouldStore;
    self.weddingAction = weddingAction;

    /** Drops every saved page except the offline page. */
    const clearPages = async (cache) => {
        const keys = await cache.keys();
        await Promise.all(
            keys.filter((key) => new URL(key.url).pathname !== OFFLINE_PAGE).map((key) => cache.delete(key))
        );
    };

    /**
     * Reads which wedding a page belongs to and drops the saved pages when it changed (another
     * wedding, another person, or nobody signed in), so an offline copy is never someone else's.
     */
    const noteWedding = async (response) => {
        if (new URL(response.url).pathname === OFFLINE_PAGE) return;
        const current = response.headers.get('X-FP-Wedding');
        const cache = await caches.open(PAGE_CACHE);
        const stored = await cache.match(WEDDING_KEY);
        const action = weddingAction(stored ? await stored.text() : null, current);
        if (action === 'keep') return;
        if (action === 'clear') await clearPages(cache);
        await cache.put(WEDDING_KEY, new Response(current));
    };

    const offlineResponse = async () =>
        (await caches.match(OFFLINE_PAGE)) ??
        new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    const fetchAndStore = async (request, cache) => {
        const response = await fetch(request);
        await noteWedding(response);
        if (shouldStore(response)) await cache.put(request.url, response.clone());
        return response;
    };

    const networkFirst = async (event) => {
        const { request } = event;
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(request.url);
        const network = fetchAndStore(request, cache);
        if (!cached) return network.catch(offlineResponse);
        const fallback = () => savedCopy(cached);
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
        const winner = await Promise.race([network.catch(() => null), timeout]);
        if (winner) return winner;
        event.waitUntil(network.catch(() => null)); // keep refreshing the copy in the background
        return fallback();
    };

    const networkOnly = async (event) => {
        try {
            const response = await fetch(event.request);
            event.waitUntil(noteWedding(response));
            return response;
        } catch {
            return offlineResponse();
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

    /**
     * Saves the given event-day pages now (asked by app.js on the schedule page).
     * @returns {Promise<{count: number, schedule: boolean}>} `schedule` is true when /schedule
     *   itself was stored, the only result worth calling "saved".
     */
    const savePages = async (urls) => {
        const cache = await caches.open(PAGE_CACHE);
        let count = 0;
        let schedule = false;
        for (const path of new Set(urls)) {
            const url = new URL(path, self.location.origin);
            if (routeFor(url, self.location.origin) !== 'event') continue;
            try {
                const response = await fetch(url.href, { credentials: 'same-origin' });
                await noteWedding(response);
                if (shouldStore(response)) {
                    await cache.put(url.href, response);
                    count += 1;
                    if (url.pathname === '/schedule' && url.search === '') schedule = true;
                }
            } catch {
                // Offline or failed: keep whatever copy is already saved.
            }
        }
        return { count, schedule };
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
        else if (route === 'event' && request.mode === 'navigate') event.respondWith(networkFirst(event));
        else if (route === 'page' && request.mode === 'navigate') event.respondWith(networkOnly(event));
    });

    self.addEventListener('message', (event) => {
        const data = event.data ?? {};
        const reply = (message) => event.ports[0]?.postMessage(message);
        if (data.type === 'save' && Array.isArray(data.urls)) {
            event.waitUntil(savePages(data.urls).then((result) => reply({ type: 'saved', ...result })));
        }
    });
})();
