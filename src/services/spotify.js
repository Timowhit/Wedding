import { ServiceError, fetchJson, httpsUrlOnHost } from './http.js';

/**
 * Spotify Web API search, using the client-credentials flow (no Spotify login needed).
 * The access token is cached in memory until shortly before it expires.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
// Covers from the Web API (i.scdn.co) and from oEmbed (the image CDN); also allowed in the CSP.
const ARTWORK_HOSTS = ['i.scdn.co', 'image-cdn-ak.spotifycdn.com', 'image-cdn-fa.spotifycdn.com'];
const OEMBED_URL = 'https://open.spotify.com/oembed';
const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SEARCH_LIMIT = 12;

let cachedToken = null; // { value, expiresAt }

/** @returns {boolean} True when the credentials are configured. */
const isSpotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

/**
 * @param {unknown} value
 * @returns {boolean} True for a Spotify track id (22 base-62 characters).
 */
const isSpotifyTrackId = (value) => typeof value === 'string' && TRACK_ID_PATTERN.test(value);

const getAccessToken = async () => {
    if (!isSpotifyConfigured()) throw new ServiceError('not-configured', 'Spotify credentials are not set');
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

    const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString(
        'base64'
    );
    const data = await fetchJson(TOKEN_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
    });
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return cachedToken.value;
};

const callApi = async (pathAndQuery) => {
    const token = await getAccessToken();
    return fetchJson(`${API_URL}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
};

/** Maps a Spotify track object to the fields the app stores and shows. */
const toTrack = (item) => ({
    trackId: item.id,
    trackName: String(item.name ?? '').slice(0, 300),
    artistName:
        (item.artists ?? [])
            .map((artist) => artist.name)
            .join(', ')
            .slice(0, 300) || null,
    artworkUrl: httpsUrlOnHost(item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url, ARTWORK_HOSTS),
    albumName: item.album?.name ?? null
});

/**
 * @param {string} query - Already validated (non-empty, length-limited).
 * @returns {Promise<Array<{trackId: string, trackName: string, artistName: string|null, artworkUrl: string|null, albumName: string|null}>>}
 * @throws {ServiceError}
 */
const searchTracks = async (query) => {
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(SEARCH_LIMIT) });
    const data = await callApi(`/search?${params}`);
    return (data.tracks?.items ?? []).filter((item) => isSpotifyTrackId(item.id)).map(toTrack);
};

/**
 * Looks one track up, so saved details always come from Spotify rather than from the form.
 * @param {string} trackId - Already validated with isSpotifyTrackId.
 * @returns {Promise<ReturnType<typeof toTrack>>}
 * @throws {ServiceError} reason 'not-found' for an unknown id.
 */
const getTrack = async (trackId) => toTrack(await callApi(`/tracks/${trackId}`));

/**
 * Looks a public track up through Spotify's oEmbed endpoint, which needs no keys: its title and
 * cover (the artist is part of the title only when Spotify puts it there).
 * @param {string} trackId - Already validated with isSpotifyTrackId.
 * @returns {Promise<{trackId: string, trackName: string, artistName: null, artworkUrl: string|null}>}
 * @throws {ServiceError} reason 'not-found' for an unknown track, 'unavailable' when Spotify can't be reached.
 */
const getTrackByLink = async (trackId) => {
    const params = new URLSearchParams({ url: `https://open.spotify.com/track/${trackId}` });
    const data = await fetchJson(`${OEMBED_URL}?${params}`);
    const trackName = String(data.title ?? '').slice(0, 300);
    if (!trackName) throw new ServiceError('not-found', 'Spotify returned no title');
    return { trackId, trackName, artistName: null, artworkUrl: httpsUrlOnHost(data.thumbnail_url, ARTWORK_HOSTS) };
};

/** Clears the cached token (used by tests). */
const resetSpotifyToken = () => {
    cachedToken = null;
};

export {
    ARTWORK_HOSTS,
    isSpotifyConfigured,
    isSpotifyTrackId,
    searchTracks,
    getTrack,
    getTrackByLink,
    resetSpotifyToken
};
