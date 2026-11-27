/**
 * Progressive enhancement only. Every feature works without JavaScript: forms post normally
 * and the server renders the result. This file adds conveniences on top:
 * - selects marked [data-autosubmit] submit their form on change (their button is then hidden)
 * - forms marked [data-confirm] ask for confirmation before submitting
 * - buttons marked [data-copy] copy the value of the input they name
 * - the mobile navigation toggle
 * - seating chart drag and drop (it sets the guest's table picker and submits the same form)
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
})();
