import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assetUrl } from '../../src/utils/assets.js';

describe('asset URLs', () => {
    it('stamp each file with a hash of its contents, so a new release is never served from an old cache', () => {
        const css = readFileSync(new URL('../../public/css/main.css', import.meta.url));
        const hash = createHash('sha256').update(css).digest('hex').slice(0, 10);
        assert.equal(assetUrl('/css/main.css'), `/css/main.css?v=${hash}`);
        assert.match(assetUrl('/js/app.js'), /^\/js\/app\.js\?v=[0-9a-f]{10}$/);
    });

    it('leaves unknown or outside paths alone', () => {
        assert.equal(assetUrl('/css/nope.css'), '/css/nope.css');
        assert.equal(assetUrl('/../package.json'), '/../package.json');
    });
});
