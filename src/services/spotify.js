import { ServiceError, fetchJson, httpsUrlOnHost } from './http.js';

/**
 * Spotify Web API search, using the client-credentials flow (no Spotify login needed).
 * The access token is cached in memory until shortly before it expires.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
const ARTWORK_HOSTS = ['i.scdn.co'];
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

/** Clears the cached token (used by tests). */
const resetSpotifyToken = () => {
    cachedToken = null;
};

export { isSpotifyConfigured, isSpotifyTrackId, searchTracks, getTrack, resetSpotifyToken };
