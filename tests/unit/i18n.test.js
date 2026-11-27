import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTIONARIES, languageFromHeader, translate } from '../../src/i18n/index.js';
import { COMING_NEXT, FEATURES } from '../../src/controllers/home.js';
import {
    BUDGET_CATEGORIES,
    EXAMPLE_TASKS,
    PALETTES,
    PLANNER_PAYMENT_FILTERS,
    TEMPLATE_KINDS,
    THEME_MODES,
    CUSTOM_PALETTE,
    CUSTOM_BACKGROUNDS,
    LAYOUT_FIXTURES,
    LAYOUT_UNITS,
    LAYOUT_SHAPES,
    MUSIC_SECTIONS,
    RSVP_STATUSES,
    TASK_CATEGORIES,
    VENDOR_CATEGORIES,
    VENDOR_STATUSES
} from '../../src/constants.js';

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const { en, es } = DICTIONARIES;

/** Every 'namespace.key' string literal in the app's code and views. */
const findUsedKeys = () => {
    const namespaces = new Set(Object.keys(en).map((key) => key.split('.')[0]));
    const used = new Set();
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const file = path.join(dir, name);
            if (statSync(file).isDirectory()) {
                if (name !== 'i18n') walk(file);
            } else if (/\.(js|ejs)$/.test(name)) {
                for (const match of readFileSync(file, 'utf8').matchAll(/['"]([a-zA-Z]+\.[a-zA-Z0-9_.-]+)['"]/g)) {
                    if (namespaces.has(match[1].split('.')[0])) used.add(match[1]);
                }
            }
        }
    };
    walk(srcDir);
    return used;
};

/** Keys built at runtime from option lists, e.g. t(`rsvp.${guest.rsvp}`). */
const dynamicKeys = () => [
    ...BUDGET_CATEGORIES.map((v) => `budgetCategory.${v}`),
    ...TASK_CATEGORIES.map((v) => `taskCategory.${v}`),
    ...VENDOR_CATEGORIES.map((v) => `vendorCategory.${v}`),
    ...VENDOR_STATUSES.map((v) => `vendorStatus.${v}`),
    ...RSVP_STATUSES.flatMap((v) => [`rsvp.${v}`, `rsvpPlural.${v}`]),
    ...MUSIC_SECTIONS.map((s) => `music.section.${s.slug}`),
    ...EXAMPLE_TASKS.map((task) => task.key),
    ...['owner', 'editor', 'client', 'viewer'].map((r) => `role.${r}`),
    ...['upcoming', 'past', 'all'].map((w) => `planner.when.${w}`),
    ...['task', 'decision'].map((k) => `planner.kind.${k}`),
    ...['open', 'approved', 'changes_requested'].map((s) => `decisionStatus.${s}`),
    ...['editor', 'viewer'].map((r) => `role.${r}Description`),
    ...['client', 'editor', 'viewer', 'planner'].map((r) => `invite.role.${r}`),
    'role.planner',
    ...['client', 'editor', 'viewer'].map((r) => `role.planner.${r}`),
    ...['pending', 'accepted', 'expired'].map((s) => `inviteStatus.${s}`),
    ...Object.keys(DICTIONARIES).map((code) => `language.${code}`),
    ...[...PALETTES, CUSTOM_PALETTE].map((p) => `palette.${p}`),
    ...CUSTOM_BACKGROUNDS.map((b) => `background.${b}`),
    ...Object.keys(LAYOUT_FIXTURES).map((k) => `layoutKind.${k}`),
    ...LAYOUT_UNITS.map((u) => `layoutUnit.${u}`),
    ...LAYOUT_SHAPES.map((s) => `layoutShape.${s}`),
    ...['primary', 'secondary', 'accent'].map((f) => `field.${f}`),
    ...FEATURES.flatMap(({ key }) => ['title', 'body', 'alt'].map((part) => `landing.feature.${key}.${part}`)),
    ...COMING_NEXT.map((item) => `landing.coming.${item}`),
    ...THEME_MODES.map((m) => `themeMode.${m}`),
    ...PLANNER_PAYMENT_FILTERS.map((f) => `paymentsDue.filter.${f}`),
    ...TEMPLATE_KINDS.flatMap((k) =>
        ['kind', 'empty', 'count', 'countOne', 'namePlaceholder', 'saveHint', 'option', 'optionOne', 'addHint'].map(
            (part) => `templates.${part}.${k}`
        )
    )
];

describe('translations', () => {
    it('English and Spanish have exactly the same keys', () => {
        assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
    });

    it('every key used in the code exists', () => {
        const missing = [...findUsedKeys(), ...dynamicKeys()].filter((key) => !(key in en));
        assert.deepEqual(missing, []);
    });

    it('no translation is unused', () => {
        const used = new Set([...findUsedKeys(), ...dynamicKeys()]);
        // field.* keys are looked up from error.field, which matches each form input's name.
        const unused = Object.keys(en).filter((key) => !used.has(key) && !key.startsWith('field.'));
        assert.deepEqual(unused, []);
    });

    it('placeholders match between languages', () => {
        const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        for (const key of Object.keys(en)) {
            assert.deepEqual(placeholders(es[key]), placeholders(en[key]), key);
        }
    });

    it('translations contain no HTML (views escape them, so markup would show as text)', () => {
        for (const [key, text] of Object.entries({ ...en, ...es })) assert.doesNotMatch(text, /[<>]/, key);
    });

    it('translate fills placeholders and falls back to English, then the key', () => {
        assert.equal(translate('es', 'guests.added', { name: 'Ana' }), 'Se agregó a Ana.');
        assert.equal(translate('fr', 'nav.budget'), 'Budget');
        assert.equal(translate('en', 'no.such.key'), 'no.such.key');
        assert.equal(translate('en', 'guests.added'), '{name} added.');
    });

    it('languageFromHeader picks the first supported language', () => {
        assert.equal(languageFromHeader('es-MX,es;q=0.9,en;q=0.8'), 'es');
        assert.equal(languageFromHeader('fr-FR,de'), 'en');
        assert.equal(languageFromHeader(undefined), 'en');
    });
});
