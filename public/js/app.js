/**
 * Progressive enhancement only. Every feature works without JavaScript: forms post normally
 * and the server renders the result. This file adds conveniences on top:
 * - selects marked [data-autosubmit] submit their form on change (their button is then hidden)
 * - forms marked [data-confirm] ask for confirmation before submitting
 * - buttons marked [data-copy] copy the value of the input they name
 * - the mobile navigation toggle
 * - seating chart drag and drop (it sets the guest's table picker and submits the same form)
 * - offline event day: registers /sw.js on signed-in pages, saves the event-day pages, shows the
 *   offline banner (see public/sw.js)
 * Loaded as an external file because the Content-Security-Policy forbids inline scripts.
 */
(function () {
    'use strict';

    document.documentElement.classList.add('js');

    document.querySelectorAll('select[data-autosubmit]').forEach(function (select) {
        select.addEventListener('change', function () {
            select.form.requestSubmit();
        });
    });
    document.querySelectorAll('[data-hide-with-js]').forEach(function (element) {
        element.hidden = true;
    });

    document.addEventListener('submit', function (event) {
        const message = event.target.getAttribute('data-confirm');
        if (message && !window.confirm(message)) event.preventDefault();
    });

    document.querySelectorAll('button[data-copy]').forEach(function (button) {
        const input = document.getElementById(button.getAttribute('data-copy'));
        if (!input || !navigator.clipboard) return;
        const label = button.textContent;
        button.hidden = false;
        button.addEventListener('click', function () {
            navigator.clipboard.writeText(input.value).then(function () {
                button.textContent = button.getAttribute('data-copied-label') || label;
                setTimeout(function () {
                    button.textContent = label;
                }, 2000);
            });
        });
    });

    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('site-nav');
    if (toggle && nav) {
        toggle.hidden = false;
        toggle.addEventListener('click', function () {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            nav.classList.toggle('site-nav--open', open);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && nav.classList.contains('site-nav--open')) {
                toggle.setAttribute('aria-expanded', 'false');
                nav.classList.remove('site-nav--open');
                toggle.focus();
            }
        });
    }

    // Seating chart: drag a guest onto a table card (or the unseated list) to move them.
    let dragged = null;
    document.querySelectorAll('[data-guest-id]').forEach((guest) => {
        guest.addEventListener('dragstart', (event) => {
            dragged = guest;
            event.dataTransfer.effectAllowed = 'move';
            guest.classList.add('is-dragging');
        });
        guest.addEventListener('dragend', () => {
            guest.classList.remove('is-dragging');
            dragged = null;
        });
    });
    document.querySelectorAll('[data-drop-table]').forEach((zone) => {
        zone.addEventListener('dragover', (event) => {
            if (!dragged) return;
            event.preventDefault();
            zone.classList.add('is-drop-target');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('is-drop-target');
            const select = dragged && dragged.querySelector('select[name="table_id"]');
            if (!select || select.value === zone.getAttribute('data-drop-table')) return;
            select.value = zone.getAttribute('data-drop-table');
            select.form.requestSubmit();
        });
    });
    // Offline event day -------------------------------------------------------------------------
    const body = document.body;
    // A page older than this when it loads came from the saved copy, not the network.
    const SAVED_COPY_AGE_MS = 10 * 60 * 1000;
    const WORKER_REPLY_TIMEOUT_MS = 20000;
    const renderedAt = new Date(body.getAttribute('data-rendered-at'));
    const isSavedCopy =
        body.hasAttribute('data-saved-copy') ||
        (!Number.isNaN(renderedAt.getTime()) && Date.now() - renderedAt.getTime() > SAVED_COPY_AGE_MS);

    const formatSavedTime = (date) => {
        const time = { hour: '2-digit', minute: '2-digit' };
        return date.toDateString() === new Date().toDateString()
            ? date.toLocaleTimeString([], time)
            : date.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', ...time });
    };

    const banner = document.querySelector('[data-offline-banner]');
    const showBanner = () => {
        if (!banner) return;
        banner.hidden = navigator.onLine && !isSavedCopy;
        const time = banner.querySelector('[data-saved-time]');
        if (time && !Number.isNaN(renderedAt.getTime())) {
            time.dateTime = renderedAt.toISOString();
            time.textContent = formatSavedTime(renderedAt);
        }
    };
    showBanner();
    window.addEventListener('online', showBanner);
    window.addEventListener('offline', showBanner);

    if (body.hasAttribute('data-offline') && 'serviceWorker' in navigator) {
        /** Sends a message to the active worker; resolves with its reply, or null on timeout. */
        const ask = (message) =>
            navigator.serviceWorker.ready.then(
                (registration) =>
                    new Promise((resolve) => {
                        if (!registration.active) return resolve(null);
                        const channel = new MessageChannel();
                        const timer = window.setTimeout(() => resolve(null), WORKER_REPLY_TIMEOUT_MS);
                        channel.port1.onmessage = (event) => {
                            window.clearTimeout(timer);
                            resolve(event.data);
                        };
                        registration.active.postMessage(message, [channel.port2]);
                    })
            );

        const saveButton = document.querySelector('[data-save-offline]');
        navigator.serviceWorker
            .register('/sw.js')
            .then(() => {
                if (!saveButton || isSavedCopy) return;
                const status = document.querySelector('[data-save-offline-status]');
                const failed = document.querySelector('[data-save-offline-failed]');
                const hint = document.querySelector('[data-save-offline-hint]');
                const pages = () => [
                    '/schedule',
                    '/schedule?print=1',
                    '/vendors',
                    ...Array.from(document.querySelectorAll('a[data-offline-page]'), (link) =>
                        link.getAttribute('href')
                    )
                ];
                const save = () => {
                    saveButton.setAttribute('aria-busy', 'true');
                    ask({ type: 'save', urls: pages() }).then((reply) => {
                        saveButton.removeAttribute('aria-busy');
                        // Only a stored schedule counts: Wi-Fi without internet "succeeds" with nothing saved.
                        const saved = Boolean(reply && reply.type === 'saved' && reply.schedule);
                        if (status) {
                            status.querySelector('time').textContent = formatSavedTime(new Date());
                            status.hidden = !saved;
                        }
                        if (failed) failed.hidden = saved;
                    });
                };
                saveButton.hidden = false;
                if (hint) hint.hidden = false;
                saveButton.addEventListener('click', save);
                save();
            })
            .catch(() => {});
    }
})();
