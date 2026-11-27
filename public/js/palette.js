/**
 * Wedding colours page: suggests the main colours of a photo. The photo is read in the browser
 * (FileReader -> canvas) and never uploaded. Loaded only on /colors; needs JavaScript, while the
 * colour picker on the same page works without it.
 *
 * extractColors is a pure function of RGBA pixels, exposed as self.FPPalette for the tests.
 */
(function (root) {
    'use strict';

    // Pixels are grouped by their top 5 bits per channel; groups closer than MIN_DISTANCE (RGB
    // distance) to a colour already chosen count as the same colour.
    const BUCKET_SHIFT = 3;
    const MIN_DISTANCE = 48;
    const MIN_ALPHA = 128;
    const SAMPLE_SIZE = 64;
    const SUGGESTIONS = 6;

    const toHex = function (rgb) {
        return (
            '#' +
            rgb
                .map(function (value) {
                    return Math.round(value).toString(16).padStart(2, '0');
                })
                .join('')
        );
    };

    const distance = function (a, b) {
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };

    /**
     * The main colours of an image, most common first.
     * @param {Uint8ClampedArray} data - RGBA pixels (ImageData.data).
     * @param {number} count - How many colours at most.
     * @returns {string[]} "#rrggbb" colours.
     */
    const extractColors = function (data, count) {
        const buckets = new Map();
        for (let i = 0; i + 3 < data.length; i += 4) {
            if (data[i + 3] < MIN_ALPHA) continue;
            const key =
                ((data[i] >> BUCKET_SHIFT) << 10) |
                ((data[i + 1] >> BUCKET_SHIFT) << 5) |
                (data[i + 2] >> BUCKET_SHIFT);
            const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            bucket.n += 1;
            bucket.r += data[i];
            bucket.g += data[i + 1];
            bucket.b += data[i + 2];
            buckets.set(key, bucket);
        }
        const sorted = Array.from(buckets.values()).sort(function (a, b) {
            return b.n - a.n;
        });
        const chosen = [];
        for (const bucket of sorted) {
            if (chosen.length >= count) break;
            const rgb = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
            if (
                chosen.every(function (other) {
                    return distance(rgb, other) >= MIN_DISTANCE;
                })
            ) {
                chosen.push(rgb);
            }
        }
        return chosen.map(toHex);
    };

    root.FPPalette = { extractColors: extractColors };

    if (typeof document === 'undefined') return;

    const tools = document.querySelector('[data-palette-photo]');
    const form = document.querySelector('[data-color-form]');
    if (!tools || !form || !window.FileReader) return;
    const results = tools.querySelector('[data-palette-results]');
    const picker = form.querySelector('[name="picker"]');
    const hex = form.querySelector('[name="hex"]');
    const name = form.querySelector('[name="name"]');
    const SVG = 'http://www.w3.org/2000/svg';

    tools.hidden = false;

    const showSuggestions = function (colors) {
        results.textContent = '';
        if (colors.length === 0) {
            results.textContent = tools.getAttribute('data-empty') || '';
            return;
        }
        const label = tools.getAttribute('data-use-label') || '';
        colors.forEach(function (color) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'palette-suggestion';
            button.setAttribute('aria-label', label.replace('{hex}', color));
            const svg = document.createElementNS(SVG, 'svg');
            svg.setAttribute('viewBox', '0 0 20 20');
            svg.setAttribute('aria-hidden', 'true');
            const circle = document.createElementNS(SVG, 'circle');
            circle.setAttribute('cx', '10');
            circle.setAttribute('cy', '10');
            circle.setAttribute('r', '9');
            circle.setAttribute('fill', color);
            svg.appendChild(circle);
            const text = document.createElement('span');
            text.textContent = color;
            button.append(svg, text);
            button.addEventListener('click', function () {
                picker.value = color;
                hex.value = color;
                name.focus();
            });
            results.appendChild(button);
        });
        tools.querySelector('[data-palette-hint]').hidden = false;
    };

    const readPhoto = function (file) {
        if (!file || !/^image\//.test(file.type)) return;
        const reader = new FileReader();
        reader.addEventListener('load', function () {
            const image = new Image();
            image.addEventListener('load', function () {
                const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                showSuggestions(
                    extractColors(context.getImageData(0, 0, canvas.width, canvas.height).data, SUGGESTIONS)
                );
            });
            image.src = String(reader.result);
        });
        reader.readAsDataURL(file);
    };

    tools.querySelectorAll('input[type="file"]').forEach(function (input) {
        input.addEventListener('change', function () {
            readPhoto(input.files && input.files[0]);
            input.value = '';
        });
    });
    // Typing a hex code updates the picker, so both always show the same colour.
    hex.addEventListener('input', function () {
        const value = hex.value.trim();
        const full = value.charAt(0) === '#' ? value : '#' + value;
        if (/^#[0-9a-f]{6}$/i.test(full)) picker.value = full.toLowerCase();
    });
    picker.addEventListener('input', function () {
        hex.value = picker.value;
    });
})(typeof self !== 'undefined' ? self : globalThis);
