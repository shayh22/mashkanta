/**
 * Synthetic statements in the layouts real exports use — invented businesses and amounts, never a
 * real household's. A bank account (CSV, as Israeli banks export it) and a card company's Excel
 * export, covering the same three whole months.
 */

const bankRows: string[][] = [
  // date, value date, description, signed amount, balance, reference, fee, channel
  ['30/06/26', '30/06/26', 'חיוב לכרטיס ויזה 1111', '-150', '-2,400', '9', '', ''],
  ['28/06/26', '28/06/26', 'משכורת חברת דוגמה', '15,000', '-2,250', '8', '', ''],
  ['20/06/26', '20/06/26', 'תשלום ריבית על משיכת יתר- מינוס', '-90', '-17,250', '7', '', ''],
  ['15/06/26', '15/06/26', 'חיוב לכרטיס ויזה 2222', '-500', '-17,160', '6', '', ''],
  ['10/06/26', '10/06/26', 'כ.א.ל חיוב', '-6,000', '-16,660', '5', '', ''],
  ['10/06/26', '10/06/26', 'בנק-משכ חיוב', '-5,000', '-10,660', '4', '', ''],
  ['05/06/26', '05/06/26', 'קרן השתל פדיון', '20,000', '-5,660', '3', '', ''],
  ['30/05/26', '30/05/26', 'חיוב לכרטיס ויזה 1111', '-150', '-25,660', '3', '', ''],
  ['28/05/26', '28/05/26', 'משכורת חברת דוגמה', '15,000', '-25,510', '2', '', ''],
  ['10/05/26', '10/05/26', 'כ.א.ל חיוב', '-6,000', '-40,510', '2', '', ''],
  ['10/05/26', '10/05/26', 'בנק-משכ חיוב', '-5,000', '-34,510', '2', '', ''],
  ['30/04/26', '30/04/26', 'חיוב לכרטיס ויזה 1111', '-150', '-29,510', '1', '', ''],
  ['28/04/26', '28/04/26', 'משכורת חברת דוגמה', '15,000', '-29,360', '1', '', ''],
  ['10/04/26', '10/04/26', 'כ.א.ל חיוב', '-6,000', '-44,360', '1', '', ''],
  ['10/04/26', '10/04/26', 'בנק-משכ חיוב', '-5,000', '-38,360', '1', '', ''],
  ['01/04/26', '01/04/26', 'העברה מחשבון אחר', '1,000', '-33,360', '0', '', ''],
];

export const BANK_CSV =
  'תאריך,יום ערך,תיאור התנועה,זכות/חובה ₪, יתרה ₪, אסמכתה,עמלה,ערוץ ביצוע\n' +
  bankRows.map((row) => row.map((cell) => `"${cell}"`).join(',') + ',').join('\n') +
  '\n';

/** Excel's day number for a date. */
export const excelDay = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

/** The card export's rows: a title, the header, purchases on two cards, a total under them. */
export const CARD_ROWS: (string | number | null)[][] = [
  ['פירוט עסקאות לדוגמה', null, null, null, null, null],
  ['תאריך\nעסקה', 'שם בית עסק', 'סכום\nבש"ח', 'כרטיס', 'מועד\nחיוב', 'סוג\nעסקה'],
  ...['2026-04', '2026-05', '2026-06'].flatMap((month) => [
    [excelDay(`${month}-03`), 'רמי לוי סניף דוגמה', 2000, 'ויזה 3333', excelDay(`${month}-10`), 'רגילה'],
    [excelDay(`${month}-12`), 'פז גז', 300, 'ויזה 3333', excelDay(`${month}-10`), 'הוראת קבע'],
    [excelDay(`${month}-15`), 'חנות הדוגמאות', 700, 'ויזה 3333', excelDay(`${month}-10`), 'רגילה'],
    [excelDay(`${month}-20`), 'קפה דוגמה', 150, 'ויזה 1111', excelDay(`${month}-21`), 'מיידית'],
  ]),
  [excelDay('2026-06-28'), 'חנות הדוגמאות', -100, 'ויזה 3333', excelDay('2026-07-10'), 'זיכוי'],
  [null, 'סה"כ עסקאות בגיליון זה:', 9550, null, null, null],
];

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The rows as worksheet XML with shared strings, every element prefixed the way some exporters do. */
export function sheetXml(rows: readonly (readonly (string | number | null)[])[]) {
  const strings: string[] = [];
  const letters = 'ABCDEFGHIJ';
  const body = rows
    .map((row, r) =>
      `<x:row r="${r + 1}">` +
      row
        .map((cell, c) => {
          const ref = `${letters[c]}${r + 1}`;
          if (cell === null) {
            return `<x:c r="${ref}" />`;
          }
          if (typeof cell === 'number') {
            return `<x:c r="${ref}"><x:v>${cell}</x:v></x:c>`;
          }
          strings.push(cell);
          return `<x:c r="${ref}" t="s"><x:v>${strings.length - 1}</x:v></x:c>`;
        })
        .join('') +
      '</x:row>',
    )
    .join('');
  return {
    sheet: `<?xml version="1.0"?><x:worksheet xmlns:x="main"><x:sheetData>${body}</x:sheetData></x:worksheet>`,
    shared: `<?xml version="1.0"?><x:sst xmlns:x="main">${strings.map((text) => `<x:si><x:t>${escapeXml(text)}</x:t></x:si>`).join('')}</x:sst>`,
  };
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip archive of the given parts, deflated; enough of the format for the reader (no checksums). */
export async function makeZip(parts: Record<string, string>): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = await deflate(raw);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export async function cardXlsx(rows = CARD_ROWS): Promise<Uint8Array> {
  const { sheet, shared } = sheetXml(rows);
  return makeZip({ '[Content_Types].xml': '<Types/>', 'xl/sharedStrings.xml': shared, 'xl/worksheets/sheet1.xml': sheet });
}
