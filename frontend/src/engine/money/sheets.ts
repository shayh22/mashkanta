/**
 * Reading the files banks and card companies export — CSV and Excel — into rows of cells, in the
 * browser, with no library: an .xlsx file is a zip of XML parts, and the browser can inflate them.
 * Nothing here knows what a statement is; `statementImport.ts` reads the rows.
 */

export type Cell = string | number | null;
export type Row = readonly Cell[];

/** CSV as exported by Israeli banks: quoted fields, commas, UTF-8 or Windows-1255. */
export function readCsv(bytes: Uint8Array): Row[] {
  return parseCsv(decodeText(bytes));
}

export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // the decoder drops a byte-order mark
  } catch {
    // Older exports are in the Hebrew Windows code page.
    return new TextDecoder('windows-1255').decode(bytes);
  }
}

export function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',' || char === '\t') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell ?? '').trim() !== ''));
}

const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The named parts of a zip archive, as text; parts not in it are left out. */
export async function readZipText(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new Error('not a zip archive');
  }
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const parts = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL) {
      throw new Error('damaged zip archive');
    }
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) {
      continue;
    }
    if (view.getUint32(local, true) !== ZIP_LOCAL) {
      throw new Error('damaged zip archive');
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method !== 0 && method !== 8) {
      throw new Error('unsupported zip compression');
    }
    parts.set(name, decoder.decode(method === 8 ? await inflate(data) : data));
  }
  return parts;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) =>
    entity[0] === '#'
      ? String.fromCodePoint(entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
      : ENTITIES[entity.toLowerCase()]!,
  );
}

/** The text of every `<t>` inside an element: a shared string can be split into rich-text runs. */
const textOf = (xml: string) =>
  [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => unescapeXml(match[1]!)).join('');

/** Column letters to a 0-based index: A → 0, AA → 26. */
function columnIndex(reference: string): number {
  let index = 0;
  for (const letter of reference.replace(/\d+$/, '')) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * The first worksheet of an .xlsx file as rows of cells. Some exporters prefix every element
 * (`<x:row>`), so the patterns accept a namespace prefix. Numbers stay numbers — a date is the Excel
 * day number, which the statement reader turns into a date where the column holds dates.
 */
export async function readXlsx(bytes: Uint8Array): Promise<Row[]> {
  const parts = await readZipText(bytes, (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheets = [...parts.keys()].filter((name) => name.startsWith('xl/worksheets/')).sort((a, b) => sheetNumber(a) - sheetNumber(b));
  if (sheets.length === 0) {
    throw new Error('no worksheet');
  }
  const shared = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) => textOf(match[1]!));
  const rows: Row[] = [];
  for (const rowMatch of parts.get(sheets[0]!)!.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells: Cell[] = [];
    for (const cell of rowMatch[1]!.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attributes = cell[1]!;
      const body = cell[2] ?? '';
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const type = /\bt="(\w+)"/.exec(attributes)?.[1];
      const raw = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === 's' && raw !== undefined) {
        value = shared[Number(raw)] ?? null;
      } else if (type === 'inlineStr') {
        value = textOf(body);
      } else if (type === 'str' || type === 'e') {
        value = raw === undefined ? null : unescapeXml(raw);
      } else if (type === 'b') {
        value = raw === '1' ? 'TRUE' : 'FALSE';
      } else if (raw !== undefined) {
        value = Number(raw);
      }
      const index = reference ? columnIndex(reference) : cells.length;
      while (cells.length < index) {
        cells.push(null);
      }
      cells[index] = value;
    }
    if (cells.some((cell) => cell !== null && String(cell).trim() !== '')) {
      rows.push(cells);
    }
  }
  return rows;
}

const sheetNumber = (name: string) => Number(/sheet(\d+)\.xml$/.exec(name)?.[1] ?? 0);
