import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const HASH_LENGTH = 10;
const stamps = new Map();

/**
 * A static file's URL with a hash of its contents (`/css/main.css?v=1a2b3c4d5e`). Browsers and
 * the offline service worker cache by full URL, so a release with new CSS or JS is never shown
 * with an old copy. Hashes are worked out once per process (each deploy is a fresh start).
 * Paths outside public/ or missing files are returned unchanged.
 * @param {string} urlPath - e.g. "/css/main.css"
 * @returns {string}
 */
const assetUrl = (urlPath) => {
    if (!stamps.has(urlPath)) {
        const file = path.join(PUBLIC_DIR, urlPath);
        let stamped = urlPath;
        if (file.startsWith(PUBLIC_DIR)) {
            try {
                const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, HASH_LENGTH);
                stamped = `${urlPath}?v=${hash}`;
            } catch {
                // Missing file: leave the URL as it is.
            }
        }
        stamps.set(urlPath, stamped);
    }
    return stamps.get(urlPath);
};

export { assetUrl };
