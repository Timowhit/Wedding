import { readText } from '../validators/common.js';
import { isLocalPath } from './session.js';

/**
 * Where to go after a form in a section, e.g. back to "/guests?rsvp=Pending" so a filter
 * survives a status click. Forms send the current URL as `return_to`; anything that is not a
 * local path inside `section` falls back to the section itself.
 * @param {import('express').Request} req
 * @param {string} section - e.g. "/guests"
 * @returns {string}
 */
const backTo = (req, section) => {
    const target = readText(req.body?.return_to);
    const inSection = target === section || target.startsWith(`${section}?`);
    return isLocalPath(target) && inSection ? target : section;
};

export { backTo };
