/**
 * Progressive enhancement only. Every feature works without JavaScript: forms post normally
 * and the server renders the result. This file adds conveniences on top:
 * - success and info notices fade after a few seconds; every notice gets a close button
 * - Settings > Appearance previews every change and saves it with fetch
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

    // Notices: success and info fade after a few seconds (paused while hovered or focused);
    // every notice gets a close button. Errors never fade, because people need them to fix a form.
    const FLASH_VISIBLE_MS = 4000;
    const FLASH_FADE_MS = 400;
    document.querySelectorAll('.flash').forEach(function (flash) {
        const close = flash.querySelector('[data-dismiss]');
        const hide = function () {
            flash.classList.add('flash--hiding');
            setTimeout(function () {
                flash.remove();
            }, FLASH_FADE_MS);
        };
        if (close) {
            close.hidden = false;
            close.addEventListener('click', hide);
        }
        if (!flash.hasAttribute('data-autohide')) return;
        let timer = setTimeout(hide, FLASH_VISIBLE_MS);
        const pause = function () {
            clearTimeout(timer);
        };
        const resume = function () {
            if (flash.matches(':hover') || flash.contains(document.activeElement)) return;
            clearTimeout(timer);
            timer = setTimeout(hide, FLASH_VISIBLE_MS);
        };
        flash.addEventListener('mouseenter', pause);
        flash.addEventListener('focusin', pause);
        flash.addEventListener('mouseleave', resume);
        flash.addEventListener('focusout', resume);
    });

    document.querySelectorAll('[data-show-with-js]').forEach(function (element) {
        element.hidden = false;
    });

    // Settings > Appearance: every change shows at once and saves itself. The custom colours'
    // stylesheet comes from the server (/css/custom/<key>.css), so the colour rules live in one
    // place. A new stylesheet replaces the old one only once it has loaded, so nothing flickers.
    const appearance = document.querySelector('form[data-live-appearance]');
    if (appearance && window.fetch && window.URLSearchParams) {
        const html = document.documentElement;
        const status = appearance.querySelector('[data-save-status]');
        // Inside a wedding with its own colours or a planner's brand, the choice applies elsewhere.
        const previewHere = appearance.getAttribute('data-theme-source') === 'personal';
        const PREVIEW_DELAY_MS = 150;
        const SAVE_DELAY_MS = 600;
        let previewTimer = null;
        let saveTimer = null;
        let saveCount = 0;

        const colorsKey = function (form) {
            const hex = function (name) {
                return String(form.get(name) || '')
                    .replace('#', '')
                    .toLowerCase();
            };
            return [hex('primary'), hex('secondary'), hex('accent'), form.get('background')].join('-');
        };
        const setStatus = function (key, text) {
            if (status) status.textContent = text || status.getAttribute(key) || '';
        };
        const useCustomSheet = function (href, done) {
            const current = document.querySelector('link[data-custom-theme]');
            if (current && current.getAttribute('href') === href) return done();
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-custom-theme', '');
            link.addEventListener('load', function () {
                document.querySelectorAll('link[data-custom-theme]').forEach(function (old) {
                    if (old !== link) old.remove();
                });
                done();
            });
            document.head.appendChild(link);
        };
        const preview = function () {
            const form = new FormData(appearance);
            const palette = String(form.get('palette') || '');
            const apply = function () {
                if (!previewHere) return;
                html.setAttribute('data-palette', palette);
                html.setAttribute('data-mode', String(form.get('mode') || 'auto'));
            };
            // The custom swatch follows the pickers even when this page shows another theme.
            if (
                /^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}-[npsa]$/.test(colorsKey(form)) &&
                (palette === 'custom' || !previewHere)
            ) {
                useCustomSheet('/css/custom/' + colorsKey(form) + '.css', apply);
            } else {
                apply();
            }
        };
        const save = function () {
            const attempt = ++saveCount;
            setStatus('data-saving');
            fetch(appearance.action, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(new FormData(appearance))
            })
                .then(function (response) {
                    return response.json().then(function (body) {
                        if (attempt !== saveCount) return; // a newer change is on its way
                        if (response.ok) setStatus('data-saved');
                        else setStatus('data-failed', (body.errors || []).join(' '));
                    });
                })
                .catch(function () {
                    if (attempt === saveCount) setStatus('data-failed');
                });
        };
        const changed = function () {
            clearTimeout(previewTimer);
            clearTimeout(saveTimer);
            previewTimer = setTimeout(preview, PREVIEW_DELAY_MS);
            saveTimer = setTimeout(save, SAVE_DELAY_MS);
        };
        appearance.addEventListener('input', changed);
        appearance.addEventListener('change', changed);
        appearance.addEventListener('submit', function (event) {
            event.preventDefault();
            changed();
        });
    }

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
