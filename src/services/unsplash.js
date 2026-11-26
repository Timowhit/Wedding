import { ServiceError, fetchJson, httpsUrlOnHost } from './http.js';

/**
 * Unsplash photo search. The access key stays on the server. Following the Unsplash API
 * guidelines, images are hot-linked, photographers are credited, and saving a photo triggers
 * its download endpoint.
 */

const API_URL = 'https://api.unsplash.com';
const IMAGE_HOSTS = ['images.unsplash.com', 'plus.unsplash.com'];
const LINK_HOSTS = ['unsplash.com'];
const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const SEARCH_LIMIT = 18;
const ALT_MAX = 500;

/** @returns {boolean} True when the access key is configured. */
const isUnsplashConfigured = () => Boolean(process.env.UNSPLASH_ACCESS_KEY);

/**
 * @param {unknown} value
 * @returns {boolean} True for an Unsplash photo id.
 */
const isUnsplashPhotoId = (value) => typeof value === 'string' && PHOTO_ID_PATTERN.test(value);

const callApi = (pathAndQuery) => {
    if (!isUnsplashConfigured()) throw new ServiceError('not-configured', 'UNSPLASH_ACCESS_KEY is not set');
    return fetchJson(`${API_URL}${pathAndQuery}`, {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' }
    });
};

/** Maps an Unsplash photo object to the fields the app stores and shows; null if unusable. */
const toPhoto = (item) => {
    const thumbUrl = httpsUrlOnHost(item.urls?.small, IMAGE_HOSTS);
    const fullUrl = httpsUrlOnHost(item.urls?.regular, IMAGE_HOSTS);
    if (!isUnsplashPhotoId(item.id) || !thumbUrl || !fullUrl) return null;
    return {
        photoId: item.id,
        thumbUrl,
        fullUrl,
        altDesc: String(item.alt_description ?? item.description ?? '').slice(0, ALT_MAX) || null,
        sourceLink: httpsUrlOnHost(item.links?.html, LINK_HOSTS),
        photographer: item.user?.name ?? null,
        downloadLocation: httpsUrlOnHost(item.links?.download_location, ['api.unsplash.com'])
    };
};

/**
 * @param {string} query - Already validated (non-empty, length-limited).
 * @returns {Promise<Array<NonNullable<ReturnType<typeof toPhoto>>>>}
 * @throws {ServiceError}
 */
const searchPhotos = async (query) => {
    const params = new URLSearchParams({ query, per_page: String(SEARCH_LIMIT), content_filter: 'high' });
    const data = await callApi(`/search/photos?${params}`);
    return (data.results ?? []).map(toPhoto).filter(Boolean);
};

/**
 * Looks one photo up, so saved URLs always come from Unsplash rather than from the form.
 * Also registers the "download" Unsplash asks apps to report when a photo is used.
 * @param {string} photoId - Already validated with isUnsplashPhotoId.
 * @returns {Promise<NonNullable<ReturnType<typeof toPhoto>>>}
 * @throws {ServiceError} reason 'not-found' for an unknown or unusable photo.
 */
const getPhoto = async (photoId) => {
    const photo = toPhoto(await callApi(`/photos/${photoId}`));
    if (!photo) throw new ServiceError('not-found', `Unsplash photo ${photoId} has no usable image URLs`);
    if (photo.downloadLocation) {
        const path = new URL(photo.downloadLocation);
        callApi(`${path.pathname}${path.search}`).catch((err) =>
            console.warn('Unsplash download tracking failed:', err.message)
        );
    }
    return photo;
};

export { IMAGE_HOSTS as UNSPLASH_IMAGE_HOSTS, isUnsplashConfigured, isUnsplashPhotoId, searchPhotos, getPhoto };
