import { MUSIC_SECTIONS } from '../constants.js';
import { addTrack, deleteSection, deleteTrack, findTracks } from '../models/music.js';
import { getTrack, isSpotifyConfigured, isSpotifyTrackId, searchTracks } from '../services/spotify.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readText } from '../validators/common.js';
import { validateSearch } from '../validators/planning.js';

/** i18n keys for each ServiceError reason. */
const SERVICE_MESSAGES = {
    'not-configured': 'music.notConfigured',
    unavailable: 'music.searchFailed',
    'not-found': 'music.trackMissing'
};

/** @returns {{name: string, slug: string}|undefined} */
const findSection = (slug) => MUSIC_SECTIONS.find((section) => section.slug === slug);

/** Logs unexpected errors; returns the i18n key for a service failure, or rethrows anything else. */
const serviceMessage = (err) => {
    if (err.name !== 'ServiceError') throw err;
    if (err.reason === 'unavailable') console.error('Spotify:', err.message);
    return SERVICE_MESSAGES[err.reason];
};

const showMusic = async (req, res) => {
    const { query, errors } = validateSearch(req.query.q);
    let results = [];
    let searchError = null;
    if (query && isSpotifyConfigured()) {
        try {
            results = await searchTracks(query);
        } catch (err) {
            searchError = serviceMessage(err);
        }
    }

    const tracks = await findTracks(req.wedding.id);
    const playlists = MUSIC_SECTIONS.map((section) => ({
        ...section,
        tracks: tracks.filter((track) => track.section === section.name)
    }));

    res.status(errors.length > 0 ? 400 : 200).render('music', {
        title: req.t('music.title'),
        query,
        results,
        searchError,
        searchEnabled: isSpotifyConfigured(),
        sections: MUSIC_SECTIONS,
        playlists,
        trackCount: tracks.length,
        errors
    });
};

/** Adds a search result to a section. Only the Spotify id comes from the form. */
const processAddTrack = async (req, res) => {
    const section = findSection(readText(req.body?.section));
    const trackId = readText(req.body?.track_id);
    const back = backTo(req, '/music');
    if (!section || !isSpotifyTrackId(trackId)) {
        setFlash(req, 'error', 'music.trackMissing');
        return res.redirect(back);
    }

    let track;
    try {
        track = await getTrack(trackId);
    } catch (err) {
        setFlash(req, 'error', serviceMessage(err));
        return res.redirect(back);
    }

    const added = await addTrack(req.wedding.id, { ...track, section: section.name });
    const sectionLabel = req.t(`music.section.${section.slug}`);
    setFlash(req, added ? 'success' : 'info', added ? 'music.trackAdded' : 'music.trackDuplicate', {
        name: track.trackName,
        section: sectionLabel
    });
    res.redirect(back);
};

const processDeleteTrack = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteTrack(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'music.trackRemoved');
    res.redirect(backTo(req, '/music'));
};

const processClearSection = async (req, res, next) => {
    const section = findSection(req.params.slug);
    if (!section) return next();
    const removed = await deleteSection(req.wedding.id, section.name);
    setFlash(req, 'success', 'music.sectionCleared', {
        count: removed,
        section: req.t(`music.section.${section.slug}`)
    });
    res.redirect(backTo(req, '/music'));
};

export { showMusic, processAddTrack, processDeleteTrack, processClearSection };
