/**
 * The page the service worker shows when a page that is not saved for offline is opened without
 * a connection. Public, so it can be cached for anyone and rendered without a session.
 * @type {import('express').RequestHandler}
 */
const showOffline = (req, res) => res.render('offline', { title: req.t('offline.title') });

export { showOffline };
