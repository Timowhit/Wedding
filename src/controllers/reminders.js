import { findUserById, setReminderEmails } from '../models/users.js';
import { isUnsubscribeToken } from '../utils/unsubscribe.js';
import { isUuid } from '../validators/common.js';

/** The person an unsubscribe link belongs to, if its signed token is valid. */
const linkUser = async (req) => {
    const { u, t } = req.query;
    if (!isUuid(u) || !isUnsubscribeToken(u, t)) return null;
    return findUserById(u);
};

const renderUnsubscribe = (req, res, state) =>
    res.render('unsubscribe', {
        title: req.t('unsubscribe.title'),
        state,
        action: req.originalUrl
    });

/** GET /reminders/unsubscribe: asks first, because link scanners open links in emails. */
const showUnsubscribe = async (req, res, next) => {
    if (!(await linkUser(req))) return next();
    renderUnsubscribe(req, res, 'confirm');
};

/** POST /reminders/unsubscribe: the button on that page, or a mail client's one-click unsubscribe. */
const processUnsubscribe = async (req, res, next) => {
    const user = await linkUser(req);
    if (!user) return next();
    await setReminderEmails(user.id, false);
    renderUnsubscribe(req, res, 'done');
};

export { showUnsubscribe, processUnsubscribe };
