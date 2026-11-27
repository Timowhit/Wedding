/** Account kinds. Planners run client weddings; couples plan their own (and are planners' clients). */
const ACCOUNT_TYPES = Object.freeze(['couple', 'planner']);

/** The founding offer: the first FOUNDING_SPOTS planners keep FOUNDING_DISCOUNT_PCT off for life. */
const FOUNDING_SPOTS = 300;
const FOUNDING_DISCOUNT_PCT = 40;

/** Colour themes. Values are stored in users.theme_palette / brand_palette and theme_mode. */
const PALETTES = Object.freeze(['rose', 'sage', 'navy', 'champagne', 'slate']);
const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);

/**
 * Fixed option lists. Values are stored in the database exactly as written here (several are
 * also enforced by CHECK constraints), so never rename a value without a migration. Views show
 * them translated via the i18n keys built from these values (see src/i18n/en.js).
 */

const BUDGET_CATEGORIES = Object.freeze([
    'Venue',
    'Catering',
    'Photography',
    'Flowers',
    'Music',
    'Attire',
    'Invitations',
    'Transportation',
    'Honeymoon',
    'Other'
]);

const TASK_CATEGORIES = Object.freeze([
    'Venue',
    'Catering',
    'Attire',
    'Flowers',
    'Photography',
    'Invitations',
    'Honeymoon',
    'Beauty',
    'Other'
]);

const TASK_STATUSES = Object.freeze(['active', 'done']);

const RSVP_STATUSES = Object.freeze(['Pending', 'Confirmed', 'Declined']);

const VENDOR_CATEGORIES = Object.freeze([
    'Photographer',
    'Videographer',
    'Florist',
    'Caterer',
    'Venue',
    'DJ / Band',
    'Hair & Makeup',
    'Cake',
    'Officiant',
    'Transportation',
    'Other'
]);

const VENDOR_STATUSES = Object.freeze(['Researching', 'Contacted', 'Booked', 'Declined']);

/** Playlist sections, in ceremony order. `slug` is used in URLs. */
const MUSIC_SECTIONS = Object.freeze([
    { name: 'Processional', slug: 'processional' },
    { name: 'Ceremony', slug: 'ceremony' },
    { name: 'Cocktail Hour', slug: 'cocktail-hour' },
    { name: 'First Dance', slug: 'first-dance' },
    { name: 'Reception', slug: 'reception' },
    { name: 'Last Dance', slug: 'last-dance' }
]);

/** Example tasks offered on an empty checklist. `key` is the i18n key of the task text. */
const EXAMPLE_TASKS = Object.freeze([
    { key: 'examples.bookVenue', category: 'Venue' },
    { key: 'examples.chooseCaterer', category: 'Catering' },
    { key: 'examples.orderAttire', category: 'Attire' },
    { key: 'examples.bookPhotographer', category: 'Photography' },
    { key: 'examples.sendSaveTheDates', category: 'Invitations' },
    { key: 'examples.bookHairMakeup', category: 'Beauty' },
    { key: 'examples.chooseFlowers', category: 'Flowers' },
    { key: 'examples.bookHoneymoon', category: 'Honeymoon' },
    { key: 'examples.finaliseGuestList', category: 'Other' },
    { key: 'examples.arrangeTransport', category: 'Other' }
]);

/** Which budget category a booked vendor's contract counts under (the two lists use different names). */
const VENDOR_BUDGET_CATEGORY = Object.freeze({
    Photographer: 'Photography',
    Videographer: 'Photography',
    Florist: 'Flowers',
    Caterer: 'Catering',
    Cake: 'Catering',
    Venue: 'Venue',
    'DJ / Band': 'Music',
    'Hair & Makeup': 'Attire',
    Transportation: 'Transportation',
    Officiant: 'Other',
    Other: 'Other'
});

/** Vendor status whose contract and payments count in full. */
const COUNTED_STATUS = 'Booked';
/** Vendor status whose already-paid payments still count (that money is gone). */
const PAID_ONLY_STATUS = 'Declined';
/** "Payments due" on a wedding's dashboard: overdue, plus due within this many days. */
const PAYMENT_DUE_WINDOW_DAYS = 30;
/** Filters for the planner's cross-wedding "Payments due" list; the first is the default. */
const PLANNER_PAYMENT_FILTERS = Object.freeze(['month', 'next30', 'overdue']);

/** What can be saved as a template. */
const TEMPLATE_KINDS = Object.freeze(['checklist', 'schedule']);
/** Per account, so one person can't fill the database with templates. */
const MAX_TEMPLATES_PER_USER = 100;
/** Per template; more than any real checklist or timeline. */
const MAX_TEMPLATE_ITEMS = 300;

export {
    ACCOUNT_TYPES,
    FOUNDING_SPOTS,
    FOUNDING_DISCOUNT_PCT,
    PALETTES,
    THEME_MODES,
    BUDGET_CATEGORIES,
    TASK_CATEGORIES,
    TASK_STATUSES,
    RSVP_STATUSES,
    VENDOR_CATEGORIES,
    VENDOR_STATUSES,
    MUSIC_SECTIONS,
    EXAMPLE_TASKS,
    VENDOR_BUDGET_CATEGORY,
    COUNTED_STATUS,
    PAID_ONLY_STATUS,
    PAYMENT_DUE_WINDOW_DAYS,
    PLANNER_PAYMENT_FILTERS,
    TEMPLATE_KINDS,
    MAX_TEMPLATES_PER_USER,
    MAX_TEMPLATE_ITEMS
};
