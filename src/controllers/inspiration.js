import { addPhoto, deleteAllPhotos, deletePhoto, findPhotos } from '../models/inspiration.js';
import { getPhoto, isUnsplashConfigured, isUnsplashPhotoId, searchPhotos } from '../services/unsplash.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readText } from '../validators/common.js';
import { validateSearch } from '../validators/planning.js';

/** i18n keys for each ServiceError reason. */
const SERVICE_MESSAGES = {
    'not-configured': 'inspiration.notConfigured',
    unavailable: 'inspiration.searchFailed',
    'not-found': 'inspiration.photoMissing'
};

/** Logs unexpected errors; returns the i18n key for a service failure, or rethrows anything else. */
const serviceMessage = (err) => {
    if (err.name !== 'ServiceError') throw err;
    if (err.reason === 'unavailable') console.error('Unsplash:', err.message);
    return SERVICE_MESSAGES[err.reason];
};

const showInspiration = async (req, res) => {
    const { query, errors } = validateSearch(req.query.q);
    let results = [];
    let searchError = null;
    if (query && isUnsplashConfigured()) {
        try {
            results = await searchPhotos(query);
        } catch (err) {
            searchError = serviceMessage(err);
        }
    }

    const photos = await findPhotos(req.wedding.id);
    const savedIds = new Set(photos.map((photo) => photo.photo_id));

    res.status(errors.length > 0 ? 400 : 200).render('inspiration', {
        title: req.t('inspiration.title'),
        query,
        results: results.map((photo) => ({ ...photo, saved: savedIds.has(photo.photoId) })),
        searchError,
        searchEnabled: isUnsplashConfigured(),
        photos,
        errors
    });
};

/** Saves a search result. Only the Unsplash id comes from the form; URLs come from Unsplash. */
const processSavePhoto = async (req, res) => {
    const photoId = readText(req.body?.photo_id);
    const back = backTo(req, '/inspiration');
    if (!isUnsplashPhotoId(photoId)) {
        setFlash(req, 'error', 'inspiration.photoMissing');
        return res.redirect(back);
    }

    let photo;
    try {
        photo = await getPhoto(photoId);
    } catch (err) {
        setFlash(req, 'error', serviceMessage(err));
        return res.redirect(back);
    }

    const added = await addPhoto(req.wedding.id, photo);
    setFlash(req, added ? 'success' : 'info', added ? 'inspiration.photoSaved' : 'inspiration.photoDuplicate');
    res.redirect(back);
};

const processDeletePhoto = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deletePhoto(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'inspiration.photoRemoved');
    res.redirect(backTo(req, '/inspiration'));
};

const processClearBoard = async (req, res) => {
    const removed = await deleteAllPhotos(req.wedding.id);
    setFlash(req, 'success', 'inspiration.boardCleared', { count: removed });
    res.redirect(backTo(req, '/inspiration'));
};

export { showInspiration, processSavePhoto, processDeletePhoto, processClearBoard };
