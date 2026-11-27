import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFileName, contentDisposition, detectFileType } from '../../src/utils/file-types.js';

describe('file types', () => {
    it('recognises supported files by their first bytes, not their names', () => {
        assert.equal(detectFileType(Buffer.from('%PDF-1.7 ...'), 'x.txt').contentType, 'application/pdf');
        assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'photo.png').contentType, 'image/jpeg');
        assert.equal(detectFileType(Buffer.from('GIF89a...'), 'a.gif').contentType, 'image/gif');
        assert.equal(
            detectFileType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'a.webp').contentType,
            'image/webp'
        );
        assert.match(
            detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]), 'Budget.XLSX').contentType,
            /spreadsheetml/
        );
        assert.equal(
            detectFileType(Buffer.from('Menu: fish or beef'), 'notes.txt').contentType,
            'text/plain; charset=utf-8'
        );
    });

    it('refuses HTML, SVG, scripts, unknown zips, binary text and empty files', () => {
        for (const [bytes, name] of [
            ['<!doctype html><script>x</script>', 'a.pdf'],
            ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'a.svg'],
            ['#!/bin/sh\nrm -rf /', 'a.sh'],
            ['PK\u0003\u0004zip', 'archive.zip'],
            ['text\u0000with nul', 'a.txt'],
            ['', 'a.pdf']
        ]) {
            assert.equal(detectFileType(Buffer.from(bytes), name), null, name);
        }
    });

    it('cleans names and encodes them for downloads', () => {
        assert.equal(cleanFileName('../../etc/passwd'), 'passwd');
        assert.equal(cleanFileName('C:\\Users\\a\\Contrato "final".pdf'), 'Contrato final.pdf');
        assert.equal(cleanFileName('bad\r\nname.pdf'), 'badname.pdf');
        assert.equal(cleanFileName(''), 'file');
        assert.equal(
            contentDisposition("Ana's plan (v2).pdf", true),
            "inline; filename*=UTF-8''Ana%27s%20plan%20%28v2%29.pdf"
        );
        assert.match(contentDisposition('Plano.docx', false), /^attachment; /);
    });
});
