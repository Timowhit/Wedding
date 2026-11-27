import { PALETTES, THEME_MODES } from './constants.js';

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

/**
 * The generated stylesheet. Attribute selectors outrank main.css's :root defaults, so an explicit
 * light or dark choice wins over the device setting.
 * @returns {string}
 */
const renderThemesCss = () => {
    const blocks = PALETTES.map((palette) => {
        const { light, dark } = PALETTE_TOKENS[palette];
        const sel = `html[data-palette='${palette}']`;
        return [
            `${sel}[data-mode='light'],\n${sel}[data-mode='auto'] {\n${declarations(light, '    ')}\n}`,
            `${sel}[data-mode='dark'] {\n${declarations(dark, '    ')}\n}`,
            `@media (prefers-color-scheme: dark) {\n    ${sel}[data-mode='auto'] {\n${declarations(dark, '        ')}\n    }\n}`
        ].join('\n\n');
    });
    // Swatches in Settings show each palette's colours without inline styles (the CSP forbids them).
    const swatches = PALETTES.map(
        (palette) =>
            `.swatch[data-swatch='${palette}'] {\n    --swatch-a: ${PALETTE_TOKENS[palette].light.primary};\n    --swatch-b: ${PALETTE_TOKENS[palette].light.secondary};\n}`
    );
    return `/* Generated by scripts/build-themes.js from src/themes.js. Do not edit by hand. */\n\n${[...blocks, ...swatches].join('\n\n')}\n`;
};

/**
 * Which palette and mode a page uses. Inside a planner wedding whose owner set a brand palette,
 * that palette wins; otherwise the person's own. The mode is always personal. Unknown stored
 * values (e.g. a palette removed later) fall back to the defaults.
 * @param {{user?: {themePalette?: string, themeMode?: string}|null, wedding?: {planner_managed?: boolean, owner_brand_palette?: string|null}|null}} context
 * @returns {{palette: string, mode: string}}
 */
const resolveTheme = ({ user = null, wedding = null } = {}) => {
    const brand = wedding?.planner_managed ? wedding.owner_brand_palette : null;
    const palette = [brand, user?.themePalette].find((value) => PALETTES.includes(value)) ?? DEFAULT_PALETTE;
    const mode = THEME_MODES.includes(user?.themeMode) ? user.themeMode : DEFAULT_MODE;
    return { palette, mode };
};

export { DEFAULT_PALETTE, DEFAULT_MODE, PALETTE_TOKENS, contrastRatio, renderThemesCss, resolveTheme };
