import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectFile } from '../src/lib/filetype.ts';

const b = (...x: (number[] | string)[]) => new Uint8Array(x.flatMap(p => typeof p === 'string' ? [...Buffer.from(p)] : p));
const fx = (n: string) => new Uint8Array(readFileSync(new URL(`fixtures/${n}`, import.meta.url)));
const type = (u: Uint8Array) => { const r = detectFile(u); return 'error' in r ? `error: ${r.error}` : r.contentType; };

test('accepts what we read, by its contents', () => {
  assert.equal(type(b('%PDF-1.7\n...')), 'application/pdf');
  assert.equal(type(b([0xff, 0xd8, 0xff, 0xe0], 'JFIF')), 'image/jpeg');
  assert.equal(type(b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(type(b('II*\0rest')), 'image/tiff');
  assert.equal(type(b('MM\0*rest')), 'image/tiff');
  assert.equal(type(fx('letter.docx')), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(type(b('# GP letter\n\nShe needs help with washing.\n')), 'text/plain');
});

test('refuses files that only claim to be documents', () => {
  assert.match(type(b('MZ\x90\0 program')), /^error: We can only read/);              // a Windows program renamed .pdf
  assert.match(type(b([0x7f], 'ELF')), /^error/);
  assert.match(type(b([0, 1, 2, 3, 0xfe, 0xff])), /^error/);                           // binary noise
  assert.match(type(fx('macros.docx')), /macros/);
  assert.match(type(fx('bundle.zip')), /zip file/);
  assert.match(type(b([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), /old-style Word/);
  assert.match(type(b([0, 0, 0, 0x18], 'ftypheic')), /HEIC/);
  assert.match(type(b('PK\x03\x04broken')), /damaged/);
  assert.match(type(new Uint8Array()), /empty/);
});

test('HTML passed off as text is still only text: it is never shown as a page', () => {
  // Accepted as plain text (pages are rendered as escaped text, and the CSP blocks script).
  assert.equal(type(b('<script>alert(1)</script>')), 'text/plain');
});
