/**
 * Captures the landing-page screenshots in public/images/ from a running copy of the app.
 *
 * It signs up a demo planner (a new random email each run), creates two client weddings with
 * realistic data through the real forms, and photographs the planner dashboard, decisions,
 * event-day schedule, seating chart and budget pages.
 *
 * Usage: start the app against a throwaway database, then
 *   BASE_URL=http://localhost:3000 node scripts/screenshots.cjs
 * Needs Playwright (npm install --no-save playwright && npx playwright install chromium).
 */
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'public', 'images');
const VIEWPORT = { width: 1200, height: 750 };
const PASSWORD = 'demo password 2026';

const nextYear = new Date().getFullYear() + 1;

/** Fills and submits one form, waiting for the redirect to finish. */
const submit = async (page, formSelector, fields) => {
    for (const [selector, value] of Object.entries(fields)) {
        const element = page.locator(`${formSelector} ${selector}`);
        if ((await element.evaluate((el) => el.tagName)) === 'SELECT') await element.selectOption(value);
        else await element.fill(value);
    }
    await Promise.all([page.waitForNavigation(), page.locator(`${formSelector} button[type=submit]`).last().click()]);
};

/** Opens a collapsed "+ Add …" panel if it is closed. */
const openPanel = async (page, id) => {
    const open = await page.locator(`#${id}`).evaluate((el) => el.open);
    if (!open) await page.locator(`#${id} > summary`).click();
};

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });

    await page.goto(`${BASE_URL}/register?as=planner`);
    await submit(page, 'main form', {
        '#name': 'Sofia Reyes',
        '#business_name': 'Reyes Weddings',
        '#email': `demo-${Date.now()}@example.com`,
        '#password': PASSWORD,
        '#confirm_password': PASSWORD
    });

    const weddings = [
        ['Ana & Luis', `${nextYear}-05-16`],
        ['Mia & Theo', `${nextYear}-06-13`],
        ['Priya & Sam', `${nextYear}-09-05`]
    ];
    for (const [name, date] of weddings) {
        await page.goto(`${BASE_URL}/planner`);
        await openPanel(page, 'add-client-wedding');
        await submit(page, 'form[method="post"][action="/planner/weddings"]', { '#name': name, '#wedding_date': date });
    }

    // Fill in the first wedding.
    await page.goto(`${BASE_URL}/planner`);
    await Promise.all([page.waitForNavigation(), page.locator('.wedding-card__open button').first().click()]);

    await page.goto(`${BASE_URL}/budget`);
    await submit(page, 'form[method="post"][action="/budget/limit"]', { '#total': '32000' });
    for (const [name, category, amount] of [
        ['Venue deposit', 'Venue', '8500'],
        ['Catering deposit', 'Catering', '4200'],
        ['Photographer retainer', 'Photography', '2800'],
        ['Florist deposit', 'Flowers', '1650'],
        ['Invitations and stationery', 'Invitations', '640'],
        ['Dress alterations', 'Attire', '450']
    ]) {
        await openPanel(page, 'add-expense');
        await submit(page, 'form[method="post"][action="/budget/expenses"]', {
            '#name': name,
            '#category': category,
            '#amount': amount
        });
    }

    for (const [name, rsvp, plusOne, group] of [
        ['Elena Garcia', 'Confirmed', 'Marco Garcia', "Ana's family"],
        ['Rosa Martinez', 'Confirmed', '', "Ana's family"],
        ['Diego Lopez', 'Pending', 'Clara Lopez', "Luis's family"],
        ['Hannah Kim', 'Confirmed', '', 'University friends'],
        ['Omar Haddad', 'Confirmed', 'Leila Haddad', 'University friends'],
        ['Grace Chen', 'Pending', '', 'Work'],
        ['Tom Baker', 'Confirmed', '', 'Work']
    ]) {
        await page.goto(`${BASE_URL}/guests`);
        await openPanel(page, 'add-guest');
        await submit(page, 'form[method="post"][action="/guests"]', {
            '#name': name,
            '#rsvp': rsvp,
            '#plus_one': plusOne,
            '#group_name': group
        });
    }

    for (const [name, category, status, phone] of [
        ['Bloom & Blossom', 'Florist', 'Booked', '(555) 010-2000'],
        ['Golden Hour Photo', 'Photographer', 'Booked', '(555) 010-3100'],
        ['DJ Nova', 'DJ / Band', 'Contacted', '(555) 010-7788']
    ]) {
        await page.goto(`${BASE_URL}/vendors`);
        await openPanel(page, 'add-vendor');
        await submit(page, 'form[method="post"][action="/vendors"]', {
            '#name': name,
            '#category': category,
            '#status': status,
            '#phone': phone
        });
    }

    for (const [start, end, title, location, vendor, notes, contingency] of [
        [
            '12:00',
            '',
            'Florist arrives to set up',
            'Garden terrace',
            'Bloom & Blossom',
            'Arch, aisle flowers and 12 centrepieces',
            ''
        ],
        [
            '14:00',
            '15:00',
            'Photos with the families',
            'Rose garden',
            'Golden Hour Photo',
            'Family list printed for the photographer',
            'Library if it rains'
        ],
        [
            '15:30',
            '16:00',
            'Ceremony',
            'Garden terrace',
            '',
            'Chairs set by 15:00; music cue from DJ',
            'Move into the barn if it rains'
        ],
        ['16:00', '17:30', 'Cocktail hour', 'Courtyard', 'DJ Nova', 'Acoustic playlist', ''],
        ['18:00', '', 'Dinner and speeches', 'Barn', '', 'Speeches between courses', '']
    ]) {
        await page.goto(`${BASE_URL}/schedule`);
        await openPanel(page, 'add-schedule-item');
        const fields = {
            '#starts_at': start,
            '#title': title,
            '#location': location,
            '#notes': notes,
            '#contingency': contingency
        };
        if (end) fields['#ends_at'] = end;
        if (vendor) fields['#vendor_id'] = { label: vendor };
        await submit(page, 'form[method="post"][action="/schedule"]', fields);
    }

    for (const [name, seats] of [
        ['Head table', '6'],
        ['Table 1', '8'],
        ['Table 2', '8']
    ]) {
        await page.goto(`${BASE_URL}/seating`);
        await openPanel(page, 'add-table');
        await submit(page, 'form[method="post"][action="/seating/tables"]', {
            '#table-name': name,
            '#table-seats': seats
        });
    }
    for (const [guest, table] of [
        ['Elena Garcia', 'Head table'],
        ['Rosa Martinez', 'Head table'],
        ['Hannah Kim', 'Table 1'],
        ['Omar Haddad', 'Table 1']
    ]) {
        await page.goto(`${BASE_URL}/seating`);
        const select = page.locator(`[data-guest="${guest}"] select[name="table_id"]`);
        await Promise.all([page.waitForNavigation(), select.selectOption({ label: table })]);
    }

    for (const [title, details, due] of [
        ['Choose the ceremony music', 'Pick one of the three pieces from our call.', `${nextYear}-02-01`],
        ['Approve the dinner menu', 'Three courses with a vegetarian option.', `${nextYear}-03-01`],
        ['Confirm the flower palette', 'Blush, ivory and sage, as on the mood board.', '']
    ]) {
        await page.goto(`${BASE_URL}/decisions`);
        await openPanel(page, 'ask-decision');
        await submit(page, 'form[method="post"][action="/decisions"]', {
            '#title': title,
            '#details': details,
            '#due_date': due
        });
    }

    // Some activity on the other weddings so the dashboard looks lived in.
    await page.goto(`${BASE_URL}/planner`);
    await Promise.all([page.waitForNavigation(), page.locator('.wedding-card__open button').nth(1).click()]);
    await page.goto(`${BASE_URL}/checklist`);
    await openPanel(page, 'add-task');
    await submit(page, 'form[method="post"][action="/checklist"]', {
        '#text': 'Book the string quartet',
        '#category': 'Other',
        '#due_date': `${nextYear}-01-10`
    });

    const shots = [
        ['landing-planner.jpg', '/planner'],
        ['landing-decisions.jpg', '/decisions'],
        ['landing-schedule.jpg', '/schedule'],
        ['landing-seating.jpg', '/seating'],
        ['landing-budget.jpg', '/budget']
    ];
    // Screenshots of the first wedding (except the dashboard, which shows all of them).
    await page.goto(`${BASE_URL}/planner`);
    await Promise.all([page.waitForNavigation(), page.locator('.wedding-card__open button').first().click()]);
    for (const [file, url] of shots) {
        await page.goto(`${BASE_URL}${url}`);
        // Start at the page heading, below the site header, and collapse open add panels.
        await page.evaluate(() =>
            document.querySelectorAll('details.add-panel[open]').forEach((d) => (d.open = false))
        );
        const top = await page.locator('main').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        await page.evaluate((y) => window.scrollTo(0, y), top);
        await page.screenshot({ path: path.join(OUT_DIR, file), type: 'jpeg', quality: 82 });
        console.info(`Saved public/images/${file}`);
    }
    await browser.close();
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
