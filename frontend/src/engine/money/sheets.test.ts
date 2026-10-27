import { describe, expect, it } from 'vitest';
import { cardXlsx, excelDay, makeZip } from './__fixtures__/statements';
import { decodeText, parseCsv, readXlsx, readZipText } from './sheets';

describe('CSV', () => {
  it('reads quoted fields with commas, quotes and line breaks, and drops blank lines', () => {
    const rows = parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n\r\n"12,345.6",x\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['12,345.6', 'x'],
    ]);
  });

  it('decodes UTF-8 with a byte-order mark, and the Hebrew Windows code page', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xd7, 0xa9]))).toBe('ש');
    // "שלום" in Windows-1255: not valid UTF-8.
    expect(decodeText(new Uint8Array([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום');
  });
});

describe('Excel', () => {
  it('reads the first worksheet: shared strings, numbers, empty cells, prefixed elements', async () => {
    const rows = await readXlsx(await cardXlsx());
    expect(rows[0]).toEqual(['פירוט עסקאות לדוגמה', null, null, null, null, null]);
    expect(rows[1]![2]).toBe('סכום\nבש"ח');
    expect(rows[2]).toEqual([excelDay('2026-04-03'), 'רמי לוי סניף דוגמה', 2000, 'ויזה 3333', excelDay('2026-04-10'), 'רגילה']);
    expect(rows[rows.length - 1]![0]).toBeNull();
  });

  it('reads inline strings, and places cells by their column', async () => {
    const sheet =
      '<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>שם &amp; עוד</t></is></c><c r="D1"><v>7</v></c></row></sheetData></worksheet>';
    const rows = await readXlsx(await makeZip({ 'xl/worksheets/sheet1.xml': sheet }));
    expect(rows).toEqual([[null, 'שם & עוד', null, 7]]);
  });

  it('refuses what is not a zip archive', async () => {
    await expect(readZipText(new TextEncoder().encode('not a zip at all, just text'), () => true)).rejects.toThrow('not a zip');
  });
});
