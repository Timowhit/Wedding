import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/js/palette.js', import.meta.url), 'utf8');
const context = { self: {} };
vm.runInNewContext(source, context);
const { extractColors } = context.self.FPPalette;

/** RGBA pixels: `count` copies of each [r, g, b, a]. */
const pixels = (...groups) =>
    Uint8ClampedArray.from(groups.flatMap(([rgba, count]) => Array.from({ length: count }, () => rgba).flat()));

describe('photo colour extraction', () => {
    it('returns the main colours, most common first, as hex', () => {
        const data = pixels([[200, 40, 60, 255], 60], [[30, 90, 200, 255], 30], [[240, 220, 120, 255], 10]);
        assert.deepEqual(Array.from(extractColors(data, 3)), ['#c8283c', '#1e5ac8', '#f0dc78']);
    });

    it('merges near-identical shades and skips transparent pixels', () => {
        const data = pixels(
            [[200, 40, 60, 255], 50],
            [[203, 42, 61, 255], 50],
            [[0, 0, 0, 0], 500],
            [[30, 90, 200, 255], 20]
        );
        const result = Array.from(extractColors(data, 5));
        assert.equal(result.length, 2);
        assert.equal(result[1], '#1e5ac8');
    });

    it('copes with an empty image', () => {
        assert.deepEqual(Array.from(extractColors(new Uint8ClampedArray(0), 5)), []);
    });
});
