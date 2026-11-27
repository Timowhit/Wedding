import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

// Minimal real files: the server checks their first bytes.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a00000000049454e44ae426082',
    'hex'
);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');

describe('file uploads', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let viewer;
    let outsider;
    let weddingId;
    let vendorId;
    const files = async () =>
        (
            await app.pool.query(
                `SELECT id, name, kind, content_type, size, vendor_id FROM wedding_files WHERE wedding_id = $1 ORDER BY created_at, id;`,
                [weddingId]
            )
        ).rows;

    /** Posts a multipart form like a browser does. */
    const upload = async (
        client,
        path,
        { file, name = 'file.pdf', type = 'application/pdf', fields = {}, csrf = true } = {}
    ) => {
        if (!client.csrfToken) await client.get('/files');
        const form = new FormData();
        if (csrf) form.append('_csrf', client.csrfToken);
        for (const [key, value] of Object.entries({ kind: 'contract', note: '', ...fields })) form.append(key, value);
        if (file) form.append('file', new Blob([file], { type }), name);
        return client.request(path, { method: 'POST', body: form });
    };

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        const rows = (
            await app.pool.query(
                `SELECT u.email, u.id, wm.wedding_id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
            )
        ).rows;
        weddingId = rows.find((row) => row.email === 'ana@example.com').wedding_id;
        await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'viewer');`, [
            weddingId,
            rows.find((row) => row.email === 'vik@example.com').id
        ]);
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        vendorId = (
            await app.pool.query(
                `INSERT INTO vendors (wedding_id, name, category, status) VALUES ($1, 'Bloom Florals', 'Florist', 'Booked') RETURNING id;`,
                [weddingId]
            )
        ).rows[0].id;
        await ana.get('/files');
    });
    after(() => app?.close());

    it('an editor uploads a PDF and a photo; the page lists them by kind', async () => {
        const pdf = await upload(ana, '/files', {
            file: PDF,
            name: 'Florist contract.pdf',
            fields: { kind: 'contract', vendor_id: vendorId }
        });
        assert.equal(pdf.location, '/files');
        const png = await upload(ana, '/files', {
            file: PNG,
            name: 'moodboard.png',
            type: 'image/png',
            fields: { kind: 'inspiration' }
        });
        assert.equal(png.location, '/files');
        const stored = await files();
        assert.deepEqual(
            stored.map(({ name, kind, content_type, size }) => [name, kind, content_type, size]),
            [
                ['Florist contract.pdf', 'contract', 'application/pdf', PDF.length],
                ['moodboard.png', 'inspiration', 'image/png', PNG.length]
            ]
        );
        assert.equal(stored[0].vendor_id, vendorId);
        const page = await ana.get('/files');
        assert.match(page.body, /Florist contract\.pdf/);
        assert.match(page.body, new RegExp(`<img[^>]+src="/files/${stored[1].id}"`));
        assert.match(page.body, /enctype="multipart\/form-data"/);
    });

    it('downloads are safe: real type, sandboxed, inline only for images and PDFs', async () => {
        const [pdf, png] = await files();
        const download = await ana.get(`/files/${pdf.id}`);
        assert.equal(download.status, 200);
        assert.equal(download.headers.get('content-type'), 'application/pdf');
        assert.match(download.headers.get('content-security-policy'), /sandbox/);
        assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
        assert.match(download.headers.get('content-disposition'), /^inline; filename\*=UTF-8''Florist%20contract\.pdf/);
        assert.equal(download.body, PDF.toString());
        assert.match((await ana.get(`/files/${png.id}`)).headers.get('content-type'), /^image\/png/);
    });

    it('refuses files whose content is not what they claim, and unknown types', async () => {
        const fake = await upload(ana, '/files', { file: HTML, name: 'contract.pdf', type: 'application/pdf' });
        assert.equal(fake.status, 400);
        assert.match(fake.body, /can.t be uploaded|not a supported/i);
        const svg = await upload(ana, '/files', {
            file: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
            name: 'x.svg',
            type: 'image/svg+xml'
        });
        assert.equal(svg.status, 400);
        assert.equal((await upload(ana, '/files', {})).status, 400, 'no file chosen');
        assert.equal((await files()).length, 2);
    });

    it('enforces 10 MB per file and 250 MB per wedding', async () => {
        const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
        const tooBig = await upload(ana, '/files', { file: big, name: 'big.pdf' });
        assert.equal(tooBig.status, 400);
        assert.match(tooBig.body, /10 MB/);
        await app.pool.query(
            `INSERT INTO wedding_files (wedding_id, kind, name, content_type, size, data) VALUES ($1, 'other', 'filler', 'application/pdf', $2, '\\x00');`,
            [weddingId, 250 * 1024 * 1024 - 10]
        );
        const over = await upload(ana, '/files', { file: PDF, name: 'one more.pdf' });
        assert.equal(over.status, 400);
        assert.match(over.body, /250 MB/);
        await app.pool.query(`DELETE FROM wedding_files WHERE name = 'filler';`);
    });

    it('uploads need a CSRF token, and other multipart posts are refused', async () => {
        assert.equal((await upload(ana, '/files', { file: PDF, csrf: false })).status, 403);
        const form = new FormData();
        form.append('_csrf', ana.csrfToken);
        form.append('name', 'x');
        assert.equal((await ana.request('/guests', { method: 'POST', body: form })).status, 403);
        assert.equal((await files()).length, 2);
    });

    it('viewers can download but not upload or delete; other weddings get 404', async () => {
        const [pdf] = await files();
        assert.equal((await viewer.get(`/files/${pdf.id}`)).status, 200);
        const viewerPage = await viewer.get('/files');
        assert.doesNotMatch(viewerPage.body, /enctype="multipart\/form-data"/);
        await upload(viewer, '/files', { file: PDF, name: 'sneaky.pdf' });
        await viewer.post(`/files/${pdf.id}/delete`, {});
        assert.equal((await files()).length, 2);
        await outsider.get('/files');
        assert.equal((await outsider.get(`/files/${pdf.id}`)).status, 404);
        assert.equal((await outsider.post(`/files/${pdf.id}/delete`, {})).status, 404);
        assert.equal((await outsider.get('/files/not-a-uuid')).status, 404);
    });

    it('the vendor page shows its files and can upload straight to it', async () => {
        const page = await ana.get(`/vendors/${vendorId}`);
        assert.match(page.body, /Florist contract\.pdf/);
        assert.match(page.body, new RegExp(`name="vendor_id" value="${vendorId}"`));
    });

    it('a failed upload from a vendor page shows the error on that vendor page', async () => {
        await ana.get(`/vendors/${vendorId}`);
        const failed = await upload(ana, '/files', {
            file: Buffer.from('<html>no</html>'),
            name: 'page.html',
            type: 'text/html',
            fields: { vendor_id: vendorId, return_to: `/vendors/${vendorId}` }
        });
        assert.equal(failed.status, 400);
        assert.match(failed.body, /id="rating-heading"|id="vendor-files-heading"/, 'the vendor page');
        assert.match(failed.body, /id="upload-errors"/);
        assert.match(failed.body, /id="upload-file"[^>]*aria-invalid="true"/);
        assert.doesNotMatch(failed.body, /id="upload-vendor"/, 'not the /files form with a vendor picker');
    });

    it('an editor deletes a file', async () => {
        const [pdf] = await files();
        await ana.get('/files');
        assert.equal((await ana.post(`/files/${pdf.id}/delete`, {})).location, '/files');
        assert.equal((await files()).length, 1);
    });

    describe('review fixes', () => {
        it('keeps non-English file names intact', async () => {
            await ana.get('/files');
            await upload(ana, '/files', { file: PDF, name: 'contrato niño.pdf' });
            assert.ok((await files()).some((file) => file.name === 'contrato niño.pdf'));
        });

        it('simultaneous uploads cannot slip past the wedding limit', async () => {
            const before = (await files()).length;
            const used = (
                await app.pool.query(
                    `SELECT COALESCE(SUM(size),0)::bigint AS n FROM wedding_files WHERE wedding_id = $1;`,
                    [weddingId]
                )
            ).rows[0].n;
            const room = 2 * PDF.length + 5;
            await app.pool.query(
                `INSERT INTO wedding_files (wedding_id, kind, name, content_type, size, data) VALUES ($1, 'other', 'filler', 'application/pdf', $2, '\\x00');`,
                [weddingId, 250 * 1024 * 1024 - Number(used) - room]
            );
            await ana.get('/files');
            await Promise.all(
                Array.from({ length: 5 }, (_, i) => upload(ana, '/files', { file: PDF, name: `race ${i}.pdf` }))
            );
            assert.equal((await files()).length - before - 1, 2, 'only two fit');
            await app.pool.query(
                `DELETE FROM wedding_files WHERE wedding_id = $1 AND (name = 'filler' OR name LIKE 'race %');`,
                [weddingId]
            );
        });

        it('each person can upload at most 1 GB across all their weddings', async () => {
            const anaId = (await app.pool.query(`SELECT id FROM users WHERE email = 'ana@example.com';`)).rows[0].id;
            const other = (
                await app.pool.query(`INSERT INTO weddings (name, created_by) VALUES ('Elsewhere', $1) RETURNING id;`, [
                    anaId
                ])
            ).rows[0].id;
            await app.pool.query(
                `INSERT INTO wedding_files (wedding_id, uploaded_by, kind, name, content_type, size, data) VALUES ($1, $2, 'other', 'big', 'application/pdf', $3, '\\x00');`,
                [other, anaId, 1024 * 1024 * 1024 - 10]
            );
            const refused = await upload(ana, '/files', { file: PDF, name: 'over.pdf' });
            assert.equal(refused.status, 400);
            assert.match(refused.body, /1 GB/);
            await app.pool.query(`DELETE FROM weddings WHERE id = $1;`, [other]);
        });

        it('a broken upload is a form error, not a server error', async () => {
            await ana.get('/files');
            const broken = await ana.request('/files', {
                method: 'POST',
                headers: { 'content-type': 'multipart/form-data; boundary=XYZ' },
                body: `--XYZ\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${ana.csrfToken}\r\n--XYZ\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF-cut`
            });
            assert.ok([400, 403].includes(broken.status), `got ${broken.status}`);
        });

        it('downloads are not kept in the browser cache, and large files arrive whole', async () => {
            const big = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024 + 17, 7)]);
            await ana.get('/files');
            await upload(ana, '/files', { file: big, name: 'big plan.pdf' });
            const { id } = (await files()).find((file) => file.name === 'big plan.pdf');
            const response = await fetch(`${app.baseUrl}/files/${id}`, {
                headers: { cookie: [...ana.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
            });
            assert.match(response.headers.get('cache-control'), /no-store/);
            assert.ok(Buffer.from(await response.arrayBuffer()).equals(big), 'every chunk, in order');
        });

        it('the photo grid shows 24 per page', async () => {
            await app.pool.query(
                `INSERT INTO wedding_files (wedding_id, kind, name, content_type, size, data)
                 SELECT $1, 'inspiration', 'photo ' || n, 'image/png', 1, '\\x00' FROM generate_series(1, 30) AS n;`,
                [weddingId]
            );
            const first = await ana.get('/files?kind=inspiration');
            assert.equal(first.body.match(/class="photo-card"/g).length, 24);
            assert.match(first.body, /href="\/files\?kind=inspiration&amp;page=2"/);
            const second = await ana.get('/files?kind=inspiration&page=2');
            assert.ok(second.body.match(/class="photo-card"/g).length >= 6);
        });

        it('the file input links to its error message on a failed upload', async () => {
            await ana.get('/files');
            const bad = await upload(ana, '/files', { file: HTML, name: 'x.pdf' });
            assert.match(bad.body, /id="upload-file"[^>]*aria-describedby="upload-hint upload-errors"/);
            assert.equal((bad.body.match(/id="upload-file"[^>]*/)[0].match(/aria-describedby/g) || []).length, 1);
        });
    });
});
