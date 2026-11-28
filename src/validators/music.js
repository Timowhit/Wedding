import { MUSIC_SECTIONS } from '../constants.js';
import { collectErrors, readText } from './common.js';

/** Validators for the music (DJ) page. */

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
// open.spotify.com/track/<id>, with an optional /intl-xx/ part and ?si= or another query after it.
const TRACK_LINK =
    /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i;
const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const LINK_MAX = 500;

/**
 * The track id in something a person pasted: a Spotify track link, a spotify:track: URI or a bare id.
 * @param {unknown} text
 * @returns {string|null}
 */
const parseTrackLink = (text) => {
    const value = typeof text === 'string' ? text.trim() : '';
    if (value.length > LINK_MAX) return null;
    if (TRACK_ID.test(value)) return value;
    return (TRACK_LINK.exec(value) ?? TRACK_URI.exec(value))?.[1] ?? null;
};

/**
 * "Add a song by its Spotify link": the link and the section to add it to.
 * @param {object} [body] - req.body
 * @returns {{values: {link: string, section: string}, data: {trackId: string|null, section: {name: string, slug: string}|null}, errors: Array}}
 */
const validateTrackLink = (body = {}) => {
    const values = { link: readText(body.link), section: readText(body.section) };
    const { errors, fail } = collectErrors();
    const trackId = parseTrackLink(values.link);
    if (!trackId) fail('link', 'music.badLink');
    const section = MUSIC_SECTIONS.find((item) => item.slug === values.section) ?? null;
    if (!section) fail('section', 'validation.choice');
    return { values, data: { trackId, section }, errors };
};

export { parseTrackLink, validateTrackLink };
