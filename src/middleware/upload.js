import multer from 'multer';
import { MAX_FILE_BYTES } from '../constants.js';
import { CSRF_FIELD_NAME, tokensMatch } from './csrf.js';

// One file per request, held in memory (it goes straight into PostgreSQL), plus a few short fields.
const MAX_FIELDS = 10;
const MAX_FIELD_BYTES = 4096;
const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: MAX_FIELDS, fieldSize: MAX_FIELD_BYTES }
}).single('file');

/**
 * Parses an upload form. A file over the size limit (or an upload multer can't read) is not an
 * error page: it is reported to the controller as `req.uploadError` ('tooBig' or 'unreadable'),
 * so the form can be shown again with a message.
 * Mount only after the login and role checks, so strangers never get to send a file.
 * @type {import('express').RequestHandler}
 */
const parseUpload = (req, res, next) => {
    parser(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            req.uploadError = 'tooBig';
            return next();
        }
        // Too many files or fields, or a cut-off upload: shown on the form like any other problem.
        if (error instanceof multer.MulterError) {
            req.uploadError = 'unreadable';
            return next();
        }
        next(error);
    });
};

/**
 * The CSRF check for upload forms, run after parseUpload (the global check can't read a
 * multipart body and defers these routes to here).
 * @type {import('express').RequestHandler}
 */
const verifyUploadCsrf = (req, res, next) => {
    const expected = req.session.csrfToken;
    const submitted = req.body?.[CSRF_FIELD_NAME];
    if (typeof expected === 'string' && typeof submitted === 'string' && tokensMatch(expected, submitted))
        return next();
    res.status(403).render('errors/403', {
        title: req.t('errors.formExpiredTitle'),
        message: req.t('errors.formExpired')
    });
};

export { parseUpload, verifyUploadCsrf };
