import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFileName, contentDisposition, detectFileType } from '../../src/utils/file-types.js';

/** A minimal zip (stored, empty entries) with these entry names, as Office files are. */
const zipWith = (names) => {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const name of names) {
        const nameBytes = Buffer.from(name);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBytes);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length;
    }
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(names.length, 8);
    end.writeUInt16LE(names.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
};
const DOCX = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const XLSX = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml'];

describe('file types', () => {
    it('recognises supported files by their first bytes, not their names', () => {
        assert.equal(detectFileType(Buffer.from('%PDF-1.7 ...'), 'x.txt').contentType, 'application/pdf');
        assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'photo.png').contentType, 'image/jpeg');
        assert.equal(detectFileType(Buffer.from('GIF89a...'), 'a.gif').contentType, 'image/gif');
        assert.equal(
            detectFileType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'a.webp').contentType,
            'image/webp'
        );
        assert.match(detectFileType(zipWith(XLSX), 'Budget.XLSX').contentType, /spreadsheetml/);
        assert.match(detectFileType(zipWith(DOCX), 'Contract.docx').contentType, /wordprocessingml/);
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

    it('checks what is inside Word and Excel files, not just that they are zips', () => {
        assert.equal(detectFileType(zipWith(['notes.txt']), 'fake.docx'), null, 'any zip renamed');
        assert.equal(detectFileType(zipWith(DOCX), 'Budget.xlsx'), null, 'a Word file named .xlsx');
        assert.equal(detectFileType(zipWith(XLSX), 'Contract.docx'), null, 'an Excel file named .docx');
        assert.equal(detectFileType(zipWith([...DOCX, 'word/vbaProject.bin']), 'm.docx'), null, 'macros');
        assert.equal(detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]), 'Budget.xlsx'), null, 'broken zip');
        const truncated = zipWith(DOCX);
        truncated.writeUInt32LE(0xffffff, truncated.length - 6); // directory offset past the end
        assert.equal(detectFileType(truncated, 'x.docx'), null, 'bad directory');
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
