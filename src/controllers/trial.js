import { EXAMPLE_TASKS, TRIAL_WEDDING_DAYS_AHEAD } from '../constants.js';
import { createTrial, deleteExpiredTrials } from '../models/trials.js';
import { setFlash } from '../utils/flash.js';
import { startUserSession } from '../utils/session.js';
import { todayIso } from '../utils/today.js';
import { dueDateFrom } from '../validators/templates.js';

// The first example task is due this many days before the wedding, the next ones a fortnight later each.
const FIRST_TASK_DAYS_BEFORE = 160;
const TASK_SPACING_DAYS = 14;
const EXAMPLE_BUDGET = 25000;
// Names are the same in every language; everything else is translated.
const EXAMPLE_GUESTS = Object.freeze([
    { name: 'Ana Martínez', rsvp: 'Confirmed' },
    { name: 'Sam Lee', rsvp: 'Pending' },
    { name: 'Priya Shah', rsvp: 'Confirmed' },
    { name: 'Tom Becker', rsvp: 'Declined' },
    { name: 'Léa Dubois', rsvp: 'Pending' }
]);

/** The example wedding, in the visitor's language. */
const examplesFor = (t, weddingIso) => ({
    tasks: EXAMPLE_TASKS.map(({ key, category }, i) => ({
        text: t(key),
        category,
        dueDate: dueDateFrom(weddingIso, FIRST_TASK_DAYS_BEFORE - i * TASK_SPACING_DAYS)
    })),
    budget: EXAMPLE_BUDGET,
    expenses: [
        { name: t('trial.example.venueDeposit'), category: 'Venue', amount: 3000 },
        { name: t('trial.example.photoDeposit'), category: 'Photography', amount: 800 },
        { name: t('trial.example.invitations'), category: 'Invitations', amount: 350 }
    ],
    guests: EXAMPLE_GUESTS,
    schedule: [
        { startsAt: '15:00', title: t('trial.example.ceremony'), location: t('trial.example.garden') },
        { startsAt: '16:00', title: t('trial.example.photos'), location: t('trial.example.garden') },
        { startsAt: '17:30', title: t('trial.example.dinner'), location: t('trial.example.hall') },
        { startsAt: '21:00', title: t('trial.example.firstDance'), location: t('trial.example.hall') }
    ]
});

/** GET /try: what a trial is, with the button that starts one. */
const showTry = (req, res) => res.render('try', { title: req.t('trial.title') });

/**
 * POST /try: a private trial wedding with examples, kept if the visitor signs up. Trials left
 * alone for a day are cleared first, so they never pile up even without a scheduled job.
 */
const processTry = async (req, res) => {
    await deleteExpiredTrials();
    const weddingDate = dueDateFrom(todayIso(), -TRIAL_WEDDING_DAYS_AHEAD);
    const user = await createTrial(
        {
            displayName: req.t('trial.guestName'),
            language: req.lang,
            weddingName: req.t('trial.weddingName'),
            weddingDate
        },
        examplesFor(req.t, weddingDate)
    );
    await startUserSession(req, user);
    setFlash(req, 'info', 'trial.started');
    res.redirect('/');
};

export { showTry, processTry };
