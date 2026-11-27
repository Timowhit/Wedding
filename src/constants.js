/** Account kinds. Planners run client weddings; couples plan their own (and are planners' clients). */
const ACCOUNT_TYPES = Object.freeze(['couple', 'planner']);

/** The founding offer: the first FOUNDING_SPOTS planners keep FOUNDING_DISCOUNT_PCT off for life. */
const FOUNDING_SPOTS = 300;
const FOUNDING_DISCOUNT_PCT = 40;

/** Colour themes. Values are stored in users.theme_palette / brand_palette and theme_mode. */
const PALETTES = Object.freeze(['rose', 'sage', 'navy', 'champagne', 'slate']);
const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);
// The palette whose colours a person (or a wedding) picks; its stylesheet is /css/custom/<key>.css.
const CUSTOM_PALETTE = 'custom';
// Background of custom colours: n = neutral, or a light tint of the primary, secondary or accent.
const CUSTOM_BACKGROUNDS = Object.freeze(['n', 'p', 's', 'a']);

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
// Highest first: the checklist sorts by this order within a due date.
const TASK_PRIORITIES = Object.freeze(['high', 'normal', 'low']);
const DEFAULT_TASK_PRIORITY = 'normal';

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

// Wrap-up tasks added after the wedding, due this many days after the day itself.
const WRAPUP_TASKS = Object.freeze([
    { key: 'wrapup.returnRentals', daysAfter: 2 },
    { key: 'wrapup.payBalances', daysAfter: 7 },
    { key: 'wrapup.sendThanks', daysAfter: 21 },
    { key: 'wrapup.reviewVendors', daysAfter: 21 },
    { key: 'wrapup.collectPhotos', daysAfter: 30 },
    { key: 'wrapup.preserveKeepsakes', daysAfter: 30 }
]);
const RATING_MAX = 5;

// Files (stored in PostgreSQL, see migration 015).
const FILE_KINDS = Object.freeze(['contract', 'floor_plan', 'inspiration', 'other']);
const BYTES_PER_MB = 1024 * 1024;
const MAX_FILE_MB = 10;
const MAX_WEDDING_FILES_MB = 250;
const MAX_FILE_BYTES = MAX_FILE_MB * BYTES_PER_MB;
const MAX_WEDDING_FILE_BYTES = MAX_WEDDING_FILES_MB * BYTES_PER_MB;
const FILE_NOTE_MAX = 300;
// Everything one person has uploaded, across all their weddings: stops one account filling the database.
const MAX_USER_FILES_GB = 1;
const MAX_USER_FILE_BYTES = MAX_USER_FILES_GB * 1024 * BYTES_PER_MB;
const FILES_PER_PAGE = 24;

// Messages and questionnaires library (a person's own, like templates).
const MESSAGE_KINDS = Object.freeze(['email', 'follow_up', 'proposal']);
const QUESTION_TYPES = Object.freeze(['short', 'long', 'choice']);
const MAX_MESSAGES_PER_USER = 100;
const MAX_QUESTIONNAIRES_PER_USER = 50;
const MAX_QUESTIONS = 30;
const MAX_CHOICE_OPTIONS = 20;
const LIBRARY_LIMITS = Object.freeze({
    name: 120,
    subject: 200,
    body: 10000,
    intro: 2000,
    question: 300,
    option: 100,
    answer: 2000
});
// Empty question rows shown under the saved ones in the questionnaire builder.
const SPARE_QUESTION_ROWS = 3;
const REVIEW_MAX = 2000;

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
// Wedding colours page: swatches per wedding and the length of a swatch's name.
const MAX_WEDDING_COLORS = 12;
const COLOR_NAME_MAX = 40;

// Venue layout (see src/validators/layout.js). Sizes are in the room's unit; positions are centres.
const LAYOUT_UNITS = Object.freeze(['ft', 'm']);
const DEFAULT_ROOM = Object.freeze({ width: 60, depth: 40, unit: 'ft' });
const ROOM_SIZE_MIN = 5;
const ROOM_SIZE_MAX = 500;
const PIECE_SIZE_MIN = 0.5;
const PIECE_SIZE_MAX = 200;
const MAX_LAYOUT_ITEMS = 200;
// Rooms (or floors) per venue.
const MAX_ROOMS = 10;
const ROOM_NAME_MAX = 60;
const LAYOUT_LABEL_MAX = 60;
const LAYOUT_SHAPES = Object.freeze(['rect', 'round']);
// What can be added besides seating tables, with a typical size in feet (width, depth, shape).
const LAYOUT_FIXTURES = Object.freeze({
    dance_floor: { width: 20, depth: 20, shape: 'rect' },
    stage: { width: 16, depth: 8, shape: 'rect' },
    bar: { width: 12, depth: 3, shape: 'rect' },
    buffet: { width: 16, depth: 3, shape: 'rect' },
    dj: { width: 6, depth: 3, shape: 'rect' },
    cake: { width: 4, depth: 4, shape: 'round' },
    gifts: { width: 6, depth: 3, shape: 'rect' },
    photo_booth: { width: 8, depth: 8, shape: 'rect' },
    entrance: { width: 6, depth: 1, shape: 'rect' },
    other: { width: 6, depth: 6, shape: 'rect' }
});
/** Per template; more than any real checklist or timeline. */
const MAX_TEMPLATE_ITEMS = 300;

/** The daily summary lists what is overdue or due within this many days. */
const REMINDER_WINDOW_DAYS = 7;
/** A wedding that ended longer ago than this stops appearing in summaries (unticked leftovers would repeat forever). */
const REMINDER_PAST_WEDDING_DAYS = 30;
/** Roles that get the daily summary for a wedding (a viewer can't act on anything). */
const REMINDER_ROLES = Object.freeze(['owner', 'editor', 'client']);

export {
    ACCOUNT_TYPES,
    FOUNDING_SPOTS,
    FOUNDING_DISCOUNT_PCT,
    PALETTES,
    THEME_MODES,
    CUSTOM_PALETTE,
    CUSTOM_BACKGROUNDS,
    BUDGET_CATEGORIES,
    TASK_CATEGORIES,
    TASK_STATUSES,
    TASK_PRIORITIES,
    WRAPUP_TASKS,
    RATING_MAX,
    FILE_KINDS,
    BYTES_PER_MB,
    MAX_FILE_MB,
    MAX_WEDDING_FILES_MB,
    MAX_FILE_BYTES,
    MAX_WEDDING_FILE_BYTES,
    FILE_NOTE_MAX,
    MAX_USER_FILES_GB,
    MAX_USER_FILE_BYTES,
    FILES_PER_PAGE,
    MESSAGE_KINDS,
    QUESTION_TYPES,
    MAX_MESSAGES_PER_USER,
    MAX_QUESTIONNAIRES_PER_USER,
    MAX_QUESTIONS,
    MAX_CHOICE_OPTIONS,
    LIBRARY_LIMITS,
    SPARE_QUESTION_ROWS,
    REVIEW_MAX,
    DEFAULT_TASK_PRIORITY,
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
    MAX_WEDDING_COLORS,
    COLOR_NAME_MAX,
    LAYOUT_UNITS,
    DEFAULT_ROOM,
    ROOM_SIZE_MIN,
    ROOM_SIZE_MAX,
    PIECE_SIZE_MIN,
    PIECE_SIZE_MAX,
    MAX_LAYOUT_ITEMS,
    MAX_ROOMS,
    ROOM_NAME_MAX,
    LAYOUT_LABEL_MAX,
    LAYOUT_SHAPES,
    LAYOUT_FIXTURES,
    MAX_TEMPLATE_ITEMS,
    REMINDER_WINDOW_DAYS,
    REMINDER_ROLES,
    REMINDER_PAST_WEDDING_DAYS
};
