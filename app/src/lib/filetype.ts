// What a file really is, from its contents rather than the type the browser reports
// (which comes from the file name and can be anything). Only the formats we read are
// accepted, and the stored type is the one found here.

export type Detected = { contentType: string; kind: 'read' | 'text'; label: string };

const starts = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0));

/** Names of the entries in a ZIP file, read from its central directory. */
function zipEntries(b: Uint8Array): string[] | null {
  // End of central directory record: signature 50 4B 05 06, within the last 64 KB + 22 bytes.
  const min = Math.max(0, b.length - 65_557);
  let eocd = -1;
  for (let i = b.length - 22; i >= min; i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  if (eocd < 0) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let n = 0; n < count && n < 5000; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return null;
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    names.push(new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen)));
    p += 46 + nameLen + extra + comment;
  }
  return names;
}

/** The file's real type, or an explanation of why it can't be accepted. */
export function detectFile(b: Uint8Array): Detected | { error: string } {
  if (b.length === 0) return { error: 'This file is empty.' };
  if (starts(b, ascii('%PDF-'))) return { contentType: 'application/pdf', kind: 'read', label: 'PDF' };
  if (starts(b, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', kind: 'read', label: 'JPEG photo' };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: 'image/png', kind: 'read', label: 'PNG image' };
  if (starts(b, [0x49, 0x49, 0x2a, 0x00]) || starts(b, [0x4d, 0x4d, 0x00, 0x2a])) return { contentType: 'image/tiff', kind: 'read', label: 'TIFF scan' };
  if (starts(b, [0x50, 0x4b, 0x03, 0x04])) {
    const names = zipEntries(b);
    if (!names) return { error: 'This file looks damaged. Save it again and re-upload it.' };
    if (names.some(n => /vbaProject\.bin$/i.test(n)))
      return { error: 'This Word document contains macros, which we don’t accept. Save it as a normal .docx or a PDF and upload that.' };
    if (names.includes('[Content_Types].xml') && names.includes('word/document.xml'))
      return { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'read', label: 'Word document' };
    return { error: 'This is a zip file, not a document. Upload the documents inside it one by one.' };
  }
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return { error: 'This is an old-style Word (.doc) file. Save it as .docx or PDF and upload that.' };
  if (starts(b, [0x00, 0x00, 0x00]) && starts(b, ascii('ftyp'), 4))
    return { error: 'This photo is in HEIC format. Set the phone to take photos as JPEG ("Most compatible"), or export the photo as JPEG.' };
  // Plain text: valid UTF-8 with no control characters other than tab and line breaks.
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(b);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return { contentType: 'text/plain', kind: 'text', label: 'text' };
  } catch { /* not UTF-8 */ }
  return { error: 'We can only read PDFs, Word documents (.docx), photos and scans (JPEG, PNG, TIFF) and plain text.' };
}
