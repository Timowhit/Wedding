/**
 * Progressive enhancement only. Every feature works without JavaScript: forms post normally
 * and the server renders the result. This file adds conveniences on top:
 * - success and info notices fade after a few seconds; every notice gets a close button
 * - Settings > Appearance previews every change and saves it with fetch
 * - selects marked [data-autosubmit] submit their form on change (their button is then hidden)
 * - forms marked [data-confirm] ask for confirmation before submitting
 * - buttons marked [data-copy] copy the value of the input they name
 * - the mobile navigation toggle
 * - venue layout: drag pieces or move them with the arrow keys, saved with fetch
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
            // Inside a wedding with its own colours (or a planner's brand) the page keeps those: the
            // choice is saved for elsewhere, and swapping the stylesheet here would hide the wedding's.
            if (
                previewHere &&
                palette === 'custom' &&
                /^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}-[npsa]$/.test(colorsKey(form))
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

    // Dropdowns (navigation groups, the wedding menu, the task badge): <details> elements that
    // already work without JavaScript. Here only one is open at a time, and a click elsewhere or
    // Escape closes it (focus goes back to its summary).
    const dropdowns = Array.from(document.querySelectorAll('[data-dropdown], .task-badge'));
    dropdowns.forEach(function (dropdown) {
        dropdown.addEventListener('toggle', function () {
            if (!dropdown.open) return;
            dropdowns.forEach(function (other) {
                if (other !== dropdown) other.open = false;
            });
        });
    });
    // The progress badge's panel also closes a while after the mouse leaves it: never while the
    // pointer is over it or keyboard focus is inside it (a mouse click also focuses it, so only
    // :focus-visible counts). Opened by keyboard, screen reader or touch, there is no mouseleave,
    // so it stays open until closed.
    const BADGE_IDLE_MS = 8000;
    document.querySelectorAll('.task-badge').forEach(function (badge) {
        let timer = null;
        const inUse = function () {
            return badge.matches(':hover') || Boolean(badge.querySelector(':focus-visible'));
        };
        const stop = function () {
            window.clearTimeout(timer);
            timer = null;
        };
        const start = function () {
            stop();
            if (!badge.open || inUse()) return;
            timer = window.setTimeout(function () {
                if (!inUse()) badge.open = false;
            }, BADGE_IDLE_MS);
        };
        badge.addEventListener('toggle', function () {
            if (!badge.open) stop();
        });
        badge.addEventListener('mouseenter', stop);
        badge.addEventListener('focusin', function () {
            if (inUse()) stop();
        });
        badge.addEventListener('mouseleave', start);
    });
    document.addEventListener('click', function (event) {
        dropdowns.forEach(function (dropdown) {
            if (dropdown.open && !dropdown.contains(event.target)) dropdown.open = false;
        });
    });
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        dropdowns.forEach(function (dropdown) {
            if (!dropdown.open) return;
            dropdown.open = false;
            dropdown.querySelector('summary').focus();
        });
    });

    // Questionnaire builder: each question's −/+ pill removes it or adds an empty one under it, in
    // place. Without JavaScript the same buttons post the form and the server sends it back changed.
    const builder = document.querySelector('[data-question-builder]');
    if (builder) {
        const list = builder.querySelector('.question-rows');
        const maxRows = Number(builder.getAttribute('data-max-rows'));
        const label = (attr, n) => list.getAttribute(attr).replace('{n}', n);
        const rows = () => Array.from(list.querySelectorAll('[data-question-row]'));
        // Fields are numbered in page order, because the server reads q0, q1… in that order.
        const renumber = function () {
            const all = rows();
            all.forEach(function (row, i) {
                row.querySelector('[data-question-legend]').textContent = label('data-legend', i + 1);
                row.querySelectorAll('[name^="q"],[id^="q"],[for^="q"]').forEach(function (el) {
                    ['name', 'id', 'for'].forEach(function (attr) {
                        const value = el.getAttribute(attr);
                        if (value) el.setAttribute(attr, value.replace(/^q\d+([_-])/, 'q' + i + '$1'));
                    });
                });
                const remove = row.querySelector('[data-remove-question]');
                const add = row.querySelector('[data-add-question]');
                remove.setAttribute('aria-label', label('data-remove-label', i + 1));
                remove.title = remove.getAttribute('aria-label');
                remove.disabled = all.length <= 1;
                add.setAttribute('aria-label', label('data-add-label', i + 1));
                add.title = add.getAttribute('aria-label');
                add.disabled = all.length >= maxRows;
            });
        };
        const blank = function (template) {
            const row = template.cloneNode(true);
            row.querySelectorAll('input[type="text"], textarea').forEach(function (el) {
                el.value = '';
                el.removeAttribute('aria-invalid');
                el.removeAttribute('autofocus');
            });
            row.querySelectorAll('select').forEach(function (el) {
                el.selectedIndex = 0;
            });
            return row;
        };
        list.addEventListener('click', function (event) {
            const button = event.target.closest('[data-remove-question], [data-add-question]');
            if (!button || button.disabled) return;
            event.preventDefault();
            const row = button.closest('[data-question-row]');
            let focus;
            if (button.hasAttribute('data-add-question')) {
                focus = blank(row);
                row.after(focus);
            } else {
                focus = row.nextElementSibling || row.previousElementSibling;
                row.remove();
            }
            renumber();
            focus.querySelector('input[type="text"]').focus();
        });
        // Buttons in place now, so Enter in a field saves rather than pressing a row's pill.
        list.querySelectorAll('[data-row-tools] button').forEach(function (button) {
            button.type = 'button';
        });
        renumber();
    }

    document.querySelectorAll('[data-print]').forEach(function (button) {
        button.hidden = false;
        button.addEventListener('click', function () {
            window.print();
        });
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
    // Venue layout: drag a piece, or focus it and use the arrow keys (Shift moves further). Each
    // move is saved with fetch; the server keeps it inside the room and answers the final spot.
    const plan = document.querySelector('svg[data-layout-editable]');
    if (plan && window.fetch && plan.getScreenCTM) {
        const room = { width: Number(plan.dataset.roomWidth), depth: Number(plan.dataset.roomDepth) };
        const tokenInput = document.querySelector('input[name="_csrf"]');
        const failed = document.querySelector('[data-layout-error]');
        const KEY_STEP = 0.5;
        const KEY_STEP_LARGE = 5;
        const KEY_SAVE_DELAY_MS = 500;
        const snap = (value) => Math.round(value * 2) / 2;
        const positionOf = (piece) => {
            const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(piece.getAttribute('transform') || '');
            return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
        };
        // The same rule as clampToRoom in src/validators/layout.js, so pieces don't jump on save.
        const inside = (piece, x, y) => {
            const radians = (Number(piece.dataset.rotation) * Math.PI) / 180;
            const cos = Math.abs(Math.cos(radians));
            const sin = Math.abs(Math.sin(radians));
            const width = Number(piece.dataset.width);
            const depth = Number(piece.dataset.depth);
            const halfX = (width * cos + depth * sin) / 2;
            const halfY = (width * sin + depth * cos) / 2;
            const fit = (value, half, size) =>
                half * 2 >= size ? size / 2 : Math.min(Math.max(value, half), size - half);
            return { x: snap(fit(x, halfX, room.width)), y: snap(fit(y, halfY, room.depth)) };
        };
        const place = (piece, position) => {
            piece.setAttribute('transform', 'translate(' + position.x + ' ' + position.y + ')');
            const id = piece.getAttribute('data-piece-id');
            const form = document.querySelector('[data-piece-form="' + id + '"]');
            if (form) {
                form.elements.x.value = position.x;
                form.elements.y.value = position.y;
            }
            const meta = document.querySelector('[data-piece-meta="' + id + '"]');
            if (meta)
                meta.textContent = meta
                    .getAttribute('data-template')
                    .replace('{x}', position.x)
                    .replace('{y}', position.y);
        };
        // Each piece remembers its latest save, so an older reply arriving late can't move it back.
        const latestSave = new WeakMap();
        const save = (piece) => {
            const position = positionOf(piece);
            const attempt = (latestSave.get(piece) || 0) + 1;
            latestSave.set(piece, attempt);
            fetch('/layout/items/' + piece.getAttribute('data-piece-id') + '/move', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ _csrf: tokenInput ? tokenInput.value : '', x: position.x, y: position.y })
            })
                .then((response) =>
                    response.ok ? response.json() : Promise.reject(new Error(String(response.status)))
                )
                .then((saved) => {
                    if (latestSave.get(piece) !== attempt) return;
                    place(piece, saved);
                    if (failed) failed.hidden = true;
                })
                .catch(() => {
                    if (failed && latestSave.get(piece) === attempt) failed.hidden = false;
                });
        };
        const toPlan = (event) => {
            const point = plan.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            return point.matrixTransform(plan.getScreenCTM().inverse());
        };

        let drag = null;
        plan.querySelectorAll('[data-piece-id]').forEach((piece) => {
            piece.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                const start = toPlan(event);
                const position = positionOf(piece);
                drag = { piece, dx: start.x - position.x, dy: start.y - position.y, moved: false };
                // Drawn last, so the piece being moved stays on top. Re-inserting a node releases
                // pointer capture, so this comes before capturing.
                piece.parentNode.appendChild(piece);
                piece.setPointerCapture(event.pointerId);
                piece.classList.add('is-dragging');
            });
            piece.addEventListener('pointermove', (event) => {
                if (!drag || drag.piece !== piece) return;
                const point = toPlan(event);
                place(piece, inside(piece, point.x - drag.dx, point.y - drag.dy));
                drag.moved = true;
            });
            const end = () => {
                if (!drag || drag.piece !== piece) return;
                piece.classList.remove('is-dragging');
                if (drag.moved) save(piece);
                drag = null;
            };
            piece.addEventListener('pointerup', end);
            piece.addEventListener('pointercancel', end);

            let keyTimer = null;
            piece.addEventListener('keydown', (event) => {
                const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
                const moves = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step]
                };
                const move = moves[event.key];
                if (!move) return;
                event.preventDefault();
                const position = positionOf(piece);
                place(piece, inside(piece, position.x + move[0], position.y + move[1]));
                clearTimeout(keyTimer);
                keyTimer = setTimeout(() => save(piece), KEY_SAVE_DELAY_MS);
            });
        });
    }

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
                    '/layout',
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
