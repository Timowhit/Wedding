import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const partial = (name) => fileURLToPath(new URL(`../../src/views/partials/${name}.ejs`, import.meta.url));
const t = (key) => key;

describe('flash partial', () => {
    it('success and info notices fade on their own; errors stay until dismissed', async () => {
        for (const type of ['success', 'info']) {
            const html = await ejs.renderFile(partial('flash'), { flash: { type, key: 'k' }, t });
            assert.match(html, /data-autohide/, type);
            assert.match(html, /data-dismiss[^>]*hidden/, `${type} has a close button revealed by JS`);
        }
        const error = await ejs.renderFile(partial('flash'), { flash: { type: 'error', key: 'k' }, t });
        assert.doesNotMatch(error, /data-autohide/);
        assert.match(error, /role="alert"/);
        assert.match(error, /data-dismiss/);
    });
});
