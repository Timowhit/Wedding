/**
 * Progressive enhancement only. Every feature works without JavaScript: forms post normally
 * and the server renders the result. This file adds conveniences on top:
 * - selects marked [data-autosubmit] submit their form on change (their button is then hidden)
 * - forms marked [data-confirm] ask for confirmation before submitting
 * - buttons marked [data-copy] copy the value of the input they name
 * - the mobile navigation toggle
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
})();
