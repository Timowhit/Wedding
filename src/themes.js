import { CUSTOM_BACKGROUNDS, CUSTOM_PALETTE, PALETTES, THEME_MODES } from './constants.js';

/**
 * Colour themes. Every colour token of public/css/main.css is defined here per palette and mode;
 * `npm run build:themes` writes public/css/themes.css from this file, and tests/unit/themes.test.js
 * checks that every palette passes WCAG AA and that the CSS is up to date.
 *
 * A page carries <html data-palette="…" data-mode="auto|light|dark">. "auto" follows the device.
 */

const DEFAULT_PALETTE = 'rose';
const DEFAULT_MODE = 'auto';

/** Tokens shared by every palette; each palette overrides what gives it its character. */
const BASE = {
    light: {
        surface: '#ffffff',
        text: '#3d3535',
        'text-muted': '#6f6464',
        danger: '#b3261e',
        'danger-soft': '#fbe9e8',
        success: '#2f7a45',
        'success-soft': '#e7f4ea',
        'info-soft': '#eef2f8',
        'warning-soft': '#fdf5e2',
        focus: '#1a5fb4',
        'on-primary': '#ffffff',
        'shadow-sm': '0 2px 8px rgb(0 0 0 / 6%)',
        shadow: '0 4px 16px rgb(0 0 0 / 9%)'
    },
    dark: {
        text: '#f1eaea',
        'text-muted': '#c2b5b5',
        danger: '#ff8a80',
        'danger-soft': '#3d2120',
        success: '#8fd19e',
        'success-soft': '#1f3324',
        'info-soft': '#232a35',
        'warning-soft': '#3a3020',
        focus: '#8ab4f8',
        'on-primary': '#1b1718',
        'shadow-sm': '0 2px 8px rgb(0 0 0 / 40%)',
        shadow: '0 4px 16px rgb(0 0 0 / 50%)'
    }
};

/** What makes each palette distinct, per mode. Rose matches the original design exactly. */
const ACCENTS = {
    rose: {
        light: {
            primary: '#a85a73',
            'primary-hover': '#8d475e',
            'primary-soft': '#f6e6eb',
            secondary: '#4f7a59',
            'secondary-hover': '#3f6448',
            accent: '#b8862b',
            bg: '#faf8f5',
            'surface-2': '#f4f0ec',
            border: '#e1d9d2',
            'field-border': '#8c807b'
        },
        dark: {
            primary: '#e59ab2',
            'primary-hover': '#f0b5c7',
            'primary-soft': '#3b2730',
            secondary: '#9cc6a5',
            'secondary-hover': '#b4d6bb',
            accent: '#e0b866',
            bg: '#1b1718',
            surface: '#262122',
            'surface-2': '#312a2c',
            border: '#463c3e',
            'field-border': '#8a7d7f'
        }
    },
    sage: {
        light: {
            primary: '#3f6b4e',
            'primary-hover': '#2f5440',
            'primary-soft': '#e4efe7',
            secondary: '#8a5a44',
            'secondary-hover': '#704736',
            accent: '#a8802c',
            bg: '#f7f9f6',
            'surface-2': '#eef2ec',
            border: '#d8e0d6',
            'field-border': '#7d8a7f'
        },
        dark: {
            primary: '#9cc6a5',
            'primary-hover': '#b7d8be',
            'primary-soft': '#22332a',
            secondary: '#e0b39a',
            'secondary-hover': '#ecc8b4',
            accent: '#dcc07a',
            bg: '#161a17',
            surface: '#1f2520',
            'surface-2': '#29302a',
            border: '#3a443c',
            'field-border': '#7f8c81'
        }
    },
    navy: {
        light: {
            primary: '#2c4a7a',
            'primary-hover': '#1f3760',
            'primary-soft': '#e6ecf6',
            secondary: '#8a5a2f',
            'secondary-hover': '#6f4824',
            accent: '#b07f1f',
            bg: '#f6f8fb',
            'surface-2': '#edf1f7',
            border: '#d6dde8',
            'field-border': '#7b8597'
        },
        dark: {
            primary: '#a9c1ec',
            'primary-hover': '#c3d4f3',
            'primary-soft': '#1f2b40',
            secondary: '#e3b98c',
            'secondary-hover': '#eecba7',
            accent: '#e0c070',
            bg: '#141821',
            surface: '#1c2230',
            'surface-2': '#252d3d',
            border: '#36405a',
            'field-border': '#7c879e'
        }
    },
    champagne: {
        light: {
            primary: '#80612a',
            'primary-hover': '#664c1f',
            'primary-soft': '#f5eedf',
            secondary: '#5c6f4a',
            'secondary-hover': '#4a5a3b',
            accent: '#a8802c',
            bg: '#fbf8f1',
            'surface-2': '#f3ede0',
            border: '#e3dac6',
            'field-border': '#8c8170'
        },
        dark: {
            primary: '#e2c58a',
            'primary-hover': '#ecd6a9',
            'primary-soft': '#352c1c',
            secondary: '#b9cba2',
            'secondary-hover': '#cddbbb',
            accent: '#e8cf8f',
            bg: '#1a1712',
            surface: '#24201a',
            'surface-2': '#2f2a21',
            border: '#463e30',
            'field-border': '#8a8170'
        }
    },
    slate: {
        light: {
            primary: '#44546a',
            'primary-hover': '#333f50',
            'primary-soft': '#e8ecf1',
            secondary: '#7a4f63',
            'secondary-hover': '#633f50',
            accent: '#9b7b2c',
            bg: '#f7f8fa',
            'surface-2': '#eef0f3',
            border: '#d9dde3',
            'field-border': '#7e8591'
        },
        dark: {
            primary: '#b4c2d6',
            'primary-hover': '#cbd6e4',
            'primary-soft': '#252d38',
            secondary: '#ddb3c5',
            'secondary-hover': '#e8c8d6',
            accent: '#d9be7c',
            bg: '#16181c',
            surface: '#1f2228',
            'surface-2': '#282c33',
            border: '#3b404a',
            'field-border': '#7f8694'
        }
    }
};

/** Full token sets: PALETTE_TOKENS[palette][mode][token] = CSS value. */
const PALETTE_TOKENS = Object.freeze(
    Object.fromEntries(
        PALETTES.map((palette) => [
            palette,
            Object.freeze({
                light: Object.freeze({ ...BASE.light, ...ACCENTS[palette].light }),
                dark: Object.freeze({ ...BASE.dark, ...ACCENTS[palette].dark })
            })
        ])
    )
);

const relativeLuminance = (hex) => {
    const channels = hex
        .replace('#', '')
        .match(/../g)
        .map((part) => parseInt(part, 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

/**
 * WCAG contrast ratio of two #rrggbb colours.
 * @param {string} foreground
 * @param {string} background
 * @returns {number} Between 1 and 21.
 */
const contrastRatio = (foreground, background) => {
    const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
};

const declarations = (tokens, indent) =>
    Object.entries(tokens)
        .map(([name, value]) => `${indent}--${name}: ${value};`)
        .join('\n');

/** The three rules of one palette: light (and auto), dark, and auto on a dark device. */
const paletteBlocks = (palette, { light, dark }) => {
    const sel = `html[data-palette='${palette}']`;
    return [
        `${sel}[data-mode='light'],\n${sel}[data-mode='auto'] {\n${declarations(light, '    ')}\n}`,
        `${sel}[data-mode='dark'] {\n${declarations(dark, '    ')}\n}`,
        `@media (prefers-color-scheme: dark) {\n    ${sel}[data-mode='auto'] {\n${declarations(dark, '        ')}\n    }\n}`
    ].join('\n\n');
};

// Swatches in Settings show each palette's colours without inline styles (the CSP forbids them).
const swatchRule = (palette, tokens) =>
    `.swatch[data-swatch='${palette}'] {\n    --swatch-a: ${tokens.primary};\n    --swatch-b: ${tokens.secondary};\n}`;

/**
 * The generated stylesheet. Attribute selectors outrank main.css's :root defaults, so an explicit
 * light or dark choice wins over the device setting.
 * @returns {string}
 */
const renderThemesCss = () => {
    const blocks = PALETTES.map((palette) => paletteBlocks(palette, PALETTE_TOKENS[palette]));
    const swatches = PALETTES.map((palette) => swatchRule(palette, PALETTE_TOKENS[palette].light));
    return `/* Generated by scripts/build-themes.js from src/themes.js. Do not edit by hand. */\n\n${[...blocks, ...swatches].join('\n\n')}\n`;
};

// ---------- Custom colours ----------
// Four choices become a key such as "a85a73-4f7a59-b8862b-p": primary, secondary and accent as
// lowercase hex, then the background (n = neutral, or a tint of p, s or a). The key is the whole
// state, so /css/custom/<key>.css is a pure function of its URL and can be cached for ever.

const COLORS_KEY = /^([0-9a-f]{6})-([0-9a-f]{6})-([0-9a-f]{6})-([npsa])$/;
const HEX = /^#?([0-9a-f]{6})$/i;
const TEXT_AA = 4.5;
const NON_TEXT_AA = 3;
// Checked on the final hex value, so there is no rounding margin to leave.
const TEXT_TARGET = TEXT_AA;
const NON_TEXT_TARGET = NON_TEXT_AA;
const LIGHTNESS_STEP = 0.5;

/**
 * Reads a custom colours key.
 * @param {unknown} key
 * @returns {{primary: string, secondary: string, accent: string, background: string}|null} Colours as "#rrggbb"; null if the key is malformed.
 */
const parseColorsKey = (key) => {
    const match = typeof key === 'string' ? COLORS_KEY.exec(key) : null;
    if (!match) return null;
    return { primary: `#${match[1]}`, secondary: `#${match[2]}`, accent: `#${match[3]}`, background: match[4] };
};

/**
 * Builds a custom colours key.
 * @param {{primary: string, secondary: string, accent: string, background: string}} colors - Hex colours, with or without "#".
 * @returns {string|null} Null when a colour or the background choice is invalid.
 */
const colorsKey = ({ primary, secondary, accent, background } = {}) => {
    const hexes = [primary, secondary, accent].map((value) => HEX.exec(String(value ?? ''))?.[1]?.toLowerCase());
    if (hexes.some((hex) => !hex) || !CUSTOM_BACKGROUNDS.includes(background)) return null;
    return `${hexes.join('-')}-${background}`;
};

const hexToHsl = (hex) => {
    const [r, g, b] = hex
        .replace('#', '')
        .match(/../g)
        .map((part) => parseInt(part, 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: s * 100, l: l * 100 };
};

const hslToHex = ({ h, s, l }) => {
    const sat = Math.min(100, Math.max(0, s)) / 100;
    const light = Math.min(100, Math.max(0, l)) / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const channel = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[0, 8, 4]
        .map((n) =>
            Math.round(channel(n) * 255)
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`;
};

/**
 * Moves a colour's lightness, darker or lighter, until every check passes. Pure black or white
 * always passes against the surfaces used here, so the search ends.
 */
const shiftUntil = (hex, direction, passes) => {
    const hsl = hexToHsl(hex);
    let candidate = hex;
    for (let l = hsl.l; l >= 0 && l <= 100; l += direction * LIGHTNESS_STEP) {
        candidate = hslToHex({ ...hsl, l });
        if (passes(candidate)) return candidate;
    }
    return direction < 0 ? '#000000' : '#ffffff';
};

const tint = (hex, { s, l }) => {
    const hsl = hexToHsl(hex);
    return hslToHex({ h: hsl.h, s: Math.min(hsl.s, s), l });
};

const passesAll = (pairs) => (candidate) => pairs.every(([other, ratio]) => contrastRatio(candidate, other) >= ratio);

/** One mode's tokens. `dir` is -1 (darken, light mode) or +1 (lighten, dark mode). */
const deriveMode = (colors, mode) => {
    const base = BASE[mode];
    const dir = mode === 'light' ? -1 : 1;
    const light = mode === 'light';
    const source = { p: colors.primary, s: colors.secondary, a: colors.accent }[colors.background];
    const neutral = ACCENTS.rose[mode];

    const bg = source ? tint(source, light ? { s: 45, l: 96.5 } : { s: 30, l: 9 }) : neutral.bg;
    const surface = light ? base.surface : source ? tint(source, { s: 25, l: 13 }) : neutral.surface;
    const hue = source ?? colors.primary;
    const surface2 = source ? tint(source, light ? { s: 30, l: 94 } : { s: 22, l: 17 }) : neutral['surface-2'];
    const border = source ? tint(source, light ? { s: 22, l: 86 } : { s: 18, l: 27 }) : neutral.border;
    const fieldBorder = shiftUntil(
        tint(hue, { s: 10, l: light ? 60 : 40 }),
        dir,
        passesAll([
            [bg, NON_TEXT_TARGET],
            [surface, NON_TEXT_TARGET]
        ])
    );

    const onPrimary = base['on-primary'];
    const primary = shiftUntil(
        colors.primary,
        dir,
        passesAll([
            [surface, TEXT_TARGET],
            [bg, TEXT_TARGET],
            [onPrimary, TEXT_TARGET]
        ])
    );
    const primarySoft = tint(colors.primary, light ? { s: 50, l: 94 } : { s: 35, l: 20 });
    const primaryHover = shiftUntil(
        hslToHex({ ...hexToHsl(primary), l: hexToHsl(primary).l + dir * 8 }),
        dir,
        passesAll([
            [primarySoft, TEXT_TARGET],
            [surface, TEXT_TARGET]
        ])
    );
    const secondary = shiftUntil(colors.secondary, dir, passesAll([[onPrimary, TEXT_TARGET]]));
    const secondaryHover = shiftUntil(
        hslToHex({ ...hexToHsl(secondary), l: hexToHsl(secondary).l + dir * 7 }),
        dir,
        passesAll([[onPrimary, TEXT_TARGET]])
    );
    const accent = shiftUntil(
        colors.accent,
        dir,
        passesAll([
            [surface, NON_TEXT_TARGET],
            [bg, NON_TEXT_TARGET]
        ])
    );

    return {
        ...base,
        primary,
        'primary-hover': primaryHover,
        'primary-soft': primarySoft,
        secondary,
        'secondary-hover': secondaryHover,
        accent,
        bg,
        surface,
        'surface-2': surface2,
        border,
        'field-border': fieldBorder
    };
};

/**
 * Turns custom colours into full token sets. Each colour keeps its hue; only its lightness moves,
 * and only as far as WCAG AA needs (text 4.5:1, borders and accents 3:1) in each mode.
 * @param {string} key - A custom colours key (see parseColorsKey).
 * @returns {{light: Object<string, string>, dark: Object<string, string>}|null} Null for a malformed key.
 */
const customTokens = (key) => {
    const colors = parseColorsKey(key);
    if (!colors) return null;
    return { light: deriveMode(colors, 'light'), dark: deriveMode(colors, 'dark') };
};

/**
 * The stylesheet for one set of custom colours, served at /css/custom/<key>.css.
 * @param {string} key
 * @returns {string|null} Null for a malformed key.
 */
const renderCustomCss = (key) => {
    const tokens = customTokens(key);
    if (!tokens) return null;
    return `${paletteBlocks(CUSTOM_PALETTE, tokens)}\n\n${swatchRule(CUSTOM_PALETTE, tokens.light)}\n`;
};

/**
 * Which palette and mode a page uses. Inside a wedding with its own colours switched on, those
 * win; then, inside a planner wedding whose owner set a brand palette, that palette; otherwise the
 * person's own palette or custom colours. The mode is always personal. Unknown or malformed stored
 * values (e.g. a palette removed later) fall back to the next choice, then the defaults.
 * @param {{user?: {themePalette?: string, themeMode?: string, themeColors?: string|null}|null, wedding?: {planner_managed?: boolean, owner_brand_palette?: string|null, theme_colors?: string|null}|null}} context
 * @returns {{palette: string, mode: string, colors?: string}} `colors` (a custom colours key) only when palette is "custom".
 */
const resolveTheme = ({ user = null, wedding = null } = {}) => {
    const mode = THEME_MODES.includes(user?.themeMode) ? user.themeMode : DEFAULT_MODE;
    if (parseColorsKey(wedding?.theme_colors)) return { palette: CUSTOM_PALETTE, mode, colors: wedding.theme_colors };
    const brand = wedding?.planner_managed ? wedding.owner_brand_palette : null;
    if (PALETTES.includes(brand)) return { palette: brand, mode };
    if (user?.themePalette === CUSTOM_PALETTE && parseColorsKey(user.themeColors)) {
        return { palette: CUSTOM_PALETTE, mode, colors: user.themeColors };
    }
    const palette = PALETTES.includes(user?.themePalette) ? user.themePalette : DEFAULT_PALETTE;
    return { palette, mode };
};

export {
    DEFAULT_PALETTE,
    DEFAULT_MODE,
    PALETTE_TOKENS,
    colorsKey,
    contrastRatio,
    customTokens,
    parseColorsKey,
    renderCustomCss,
    renderThemesCss,
    resolveTheme
};
