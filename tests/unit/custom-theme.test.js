import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    colorsKey,
    contrastRatio,
    customTokens,
    parseColorsKey,
    renderCustomCss,
    resolveTheme
} from '../../src/themes.js';

const TEXT_AA = 4.5;
const NON_TEXT_AA = 3;

// Awkward inputs: too light, too dark, pure hues, near-identical colours, every background choice.
const AWKWARD = [
    'ffff00-ffffff-000000-p',
    'ffffff-ffffff-ffffff-n',
    '000000-000000-000000-a',
    '0000ff-ff0000-00ff00-s',
    'faf8f5-f4f0ec-fffdf8-p',
    'a85a73-4f7a59-b8862b-n',
    '7fffd4-ffc0cb-e6e6fa-a',
    '808080-808080-808080-s'
];

describe('custom colours', () => {
    it('parses and builds keys, rejecting anything else', () => {
        assert.deepEqual(parseColorsKey('a85a73-4f7a59-b8862b-p'), {
            primary: '#a85a73',
            secondary: '#4f7a59',
            accent: '#b8862b',
            background: 'p'
        });
        assert.equal(
            colorsKey({ primary: '#A85A73', secondary: '#4f7a59', accent: '#b8862b', background: 'p' }),
            'a85a73-4f7a59-b8862b-p'
        );
        for (const bad of [
            '',
            'a85a73-4f7a59-b8862b',
            'a85a73-4f7a59-b8862b-x',
            'A85A73-4f7a59-b8862b-p',
            'zzzzzz-4f7a59-b8862b-p',
            '../x',
            null,
            42
        ]) {
            assert.equal(parseColorsKey(bad), null, String(bad));
        }
    });

    it('every derived theme passes AA in both modes, whatever the input', () => {
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
            ['danger', 'danger-soft'],
            ['success', 'success-soft']
        ];
        for (const key of AWKWARD) {
            const tokens = customTokens(key);
            for (const mode of ['light', 'dark']) {
                const set = tokens[mode];
                for (const [fg, bg] of textPairs) {
                    const ratio = contrastRatio(set[fg], set[bg]);
                    assert.ok(ratio >= TEXT_AA, `${key}/${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
                }
                for (const bg of ['surface', 'bg']) {
                    assert.ok(
                        contrastRatio(set['field-border'], set[bg]) >= NON_TEXT_AA,
                        `${key}/${mode}: field-border on ${bg}`
                    );
                    assert.ok(contrastRatio(set.accent, set[bg]) >= NON_TEXT_AA, `${key}/${mode}: accent on ${bg}`);
                }
            }
        }
    });

    it('keeps reasonable colours close to what was picked', () => {
        const { light } = customTokens('a85a73-4f7a59-b8862b-n');
        assert.equal(light.primary, '#a85a73', 'a colour that already passes is not changed');
        assert.equal(light.bg, '#faf8f5', 'a neutral background stays the default');
        const tinted = customTokens('a85a73-4f7a59-b8862b-s').light.bg;
        assert.notEqual(tinted, '#faf8f5');
    });

    it('renders CSS for the custom palette only', () => {
        const css = renderCustomCss('a85a73-4f7a59-b8862b-n');
        assert.match(css, /html\[data-palette='custom'\]\[data-mode='light'\]/);
        assert.match(css, /prefers-color-scheme: dark/);
        assert.match(css, /--primary: #a85a73;/);
        assert.doesNotMatch(css, /data-palette='rose'/);
        assert.equal(renderCustomCss('nope'), null);
    });

    it('resolveTheme: wedding colours, then brand, then the personal choice', () => {
        const user = { themePalette: 'custom', themeColors: '111111-222222-333333-n', themeMode: 'dark' };
        assert.deepEqual(resolveTheme({ user }), { palette: 'custom', mode: 'dark', colors: '111111-222222-333333-n' });
        assert.deepEqual(resolveTheme({ user: { ...user, themeColors: 'broken' } }), { palette: 'rose', mode: 'dark' });
        const branded = { planner_managed: true, owner_brand_palette: 'navy' };
        assert.deepEqual(resolveTheme({ user, wedding: branded }), { palette: 'navy', mode: 'dark' });
        const colored = { ...branded, theme_colors: 'a85a73-4f7a59-b8862b-p' };
        assert.deepEqual(resolveTheme({ user, wedding: colored }), {
            palette: 'custom',
            mode: 'dark',
            colors: 'a85a73-4f7a59-b8862b-p'
        });
        assert.deepEqual(resolveTheme({ user, wedding: { theme_colors: 'bad' } }), {
            palette: 'custom',
            mode: 'dark',
            colors: '111111-222222-333333-n'
        });
    });
});
