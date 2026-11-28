/**
 * Shared helpers for calling third-party APIs.
 */

const TIMEOUT_MS = 5000;

/** Failure of an external service, with a reason the controller can turn into a message. */
class ServiceError extends Error {
    /**
     * @param {'not-configured'|'unavailable'|'not-found'} reason
     * @param {string} message - Details for the server log only, never shown to users.
     */
    constructor(reason, message) {
        super(message);
        this.name = 'ServiceError';
        this.reason = reason;
    }
}

/**
 * fetch() with a timeout that turns network failures and non-2xx answers into ServiceError.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>} The parsed JSON body.
 */
const fetchJson = async (url, options = {}) => {
    let response;
    try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
        throw new ServiceError('unavailable', `${new URL(url).host} request failed: ${err.message}`);
    }
    if (response.status === 404) throw new ServiceError('not-found', `${new URL(url).host} returned 404`);
    if (!response.ok) throw new ServiceError('unavailable', `${new URL(url).host} returned ${response.status}`);
    try {
        return await response.json();
    } catch {
        throw new ServiceError('unavailable', `${new URL(url).host} returned something other than JSON`);
    }
};

/**
 * Keeps a URL only if it is https on one of the expected hosts (the hosts the CSP allows).
 * @param {unknown} value
 * @param {string[]} hosts
 * @returns {string|null}
 */
const httpsUrlOnHost = (value, hosts) => {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : null;
    } catch {
        return null;
    }
};

export { ServiceError, fetchJson, httpsUrlOnHost };
