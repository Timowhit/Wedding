import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PALETTES, THEME_MODES } from '../../src/constants.js';
import { PALETTE_TOKENS, contrastRatio, renderThemesCss, resolveTheme } from '../../src/themes.js';

const TEXT_AA = 4.5;
const NON_TEXT_AA = 3;

describe('colour themes', () => {
    it('defines every palette in both modes', () => {
        assert.deepEqual(Object.keys(PALETTE_TOKENS).sort(), [...PALETTES].sort());
        for (const palette of PALETTES) {
            assert.ok(PALETTE_TOKENS[palette].light && PALETTE_TOKENS[palette].dark, palette);
        }
    });

    it('every palette passes AA in both modes', () => {
        const textPairs = [
            ['text', 'bg'],
            ['text', 'surface'],
            ['text-muted', 'bg'],
            ['text-muted', 'surface'],
            ['text-muted', 'surface-2'],
            ['primary', 'surface'],
            ['primary', 'bg'],
            ['primary-hover', 'primary-soft'],
            ['on-primary', 'primary'],
            ['on-primary', 'secondary'],
            ['danger', 'surface'],
            ['success', 'success-soft']
        ];
        for (const palette of PALETTES) {
            for (const mode of ['light', 'dark']) {
                const tokens = PALETTE_TOKENS[palette][mode];
                for (const [fg, bg] of textPairs) {
                    const ratio = contrastRatio(tokens[fg], tokens[bg]);
                    assert.ok(ratio >= TEXT_AA, `${palette}/${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
                }
                for (const bg of ['surface', 'bg']) {
                    const ratio = contrastRatio(tokens['field-border'], tokens[bg]);
                    assert.ok(ratio >= NON_TEXT_AA, `${palette}/${mode}: field-border on ${bg} is ${ratio.toFixed(2)}`);
                }
            }
        }
    });

    it('themes.css is up to date with src/themes.js (run npm run build:themes)', async () => {
        const css = await readFile(new URL('../../public/css/themes.css', import.meta.url), 'utf8');
        assert.equal(css, renderThemesCss());
    });

    it('resolveTheme prefers the planner brand palette and falls back safely', () => {
        const user = { themePalette: 'sage', themeMode: 'dark' };
        assert.deepEqual(resolveTheme({ user, wedding: null }), { palette: 'sage', mode: 'dark' });
        assert.deepEqual(
            resolveTheme({ user, wedding: { planner_managed: true, owner_brand_palette: 'navy' } }),
            { palette: 'navy', mode: 'dark' },
            'the brand palette wins; the mode stays personal'
        );
        assert.deepEqual(
            resolveTheme({ user, wedding: { planner_managed: false, owner_brand_palette: 'navy' } }),
            { palette: 'sage', mode: 'dark' },
            "a couple's own wedding ignores any brand"
        );
        assert.deepEqual(resolveTheme({ user, wedding: { planner_managed: true, owner_brand_palette: null } }), {
            palette: 'sage',
            mode: 'dark'
        });
        assert.deepEqual(resolveTheme({ user: { themePalette: 'neon', themeMode: 'sepia' } }), {
            palette: 'rose',
            mode: 'auto'
        });
        assert.deepEqual(resolveTheme({ user: null }), { palette: 'rose', mode: 'auto' });
        assert.ok(THEME_MODES.includes(resolveTheme({}).mode));
    });
});
