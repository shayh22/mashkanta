// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The PDF side of the document readers, with pdf.js replaced by pages whose text items each test
 * sets: words in rows, a glyph-by-glyph bank schedule, and a scan with no text at all.
 */

interface Item {
  str: string;
  transform: number[];
  width: number;
}

const pdf = vi.hoisted(() => ({ pages: [] as Item[][], rendered: 0 }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pdf.pages.length,
      getPage: async (pageNumber: number) => ({
        getTextContent: async () => ({ items: pdf.pages[pageNumber - 1] }),
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => {
          pdf.rendered += 1;
          return { promise: Promise.resolve() };
        },
      }),
    }),
  }),
}));

const { extractApproval, extractMortgageDocument, isImageFile, MAX_UPLOAD_BYTES, prepareForAi } = await import('./documents');

/** A word at a position on the page. */
const word = (str: string, x: number, y: number): Item => ({ str, width: str.length * 5, transform: [1, 0, 0, 1, x, y] });

/** One glyph per item, left to right from x — how some bank generators write a schedule. */
const glyphs = (text: string, x: number, y: number): Item[] =>
  [...text].map((str, index) => ({ str, width: 6, transform: [1, 0, 0, 1, x + index * 6, y] }));

/** A file starting with the PDF signature; jsdom's File has no `arrayBuffer`, so it is given one. */
const pdfFile = (name = 'doc.pdf') => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const file = new File([bytes], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer.slice(0) });
  return file;
};

beforeEach(() => {
  pdf.pages = [];
  pdf.rendered = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading a PDF', () => {
  it('keeps each table row on one line, top to bottom, and redacts before anything leaves', async () => {
    pdf.pages = [
      [
        word('יתרה', 300, 500),
        word('10,000', 100, 500),
        word('מספר זהות 000000018', 100, 560),
        word('נתוני הלוואה לדוגמה', 100, 530),
      ],
    ];
    const payload = await prepareForAi(pdfFile(), 10_000, 3);
    const lines = payload.text!.split('\n');
    expect(lines[1]).toBe('נתוני הלוואה לדוגמה');
    expect(lines[2]).toBe('יתרה 10,000');
    expect(payload.text).not.toContain('000000018');
    expect(payload.redaction!.spanCount).toBeGreaterThan(0);
    expect(payload).toMatchObject({ pageCount: 1, truncated: false });
    expect(pdf.rendered).toBe(0);
  });

  it('rebuilds a glyph-by-glyph page into reading order', async () => {
    const row = (date: string, y: number) => [...glyphs(date, 300, y), ...glyphs('1,520.85', 200, y), ...glyphs('133,905.00', 50, y)];
    pdf.pages = [[...row('10/03/2026', 500), ...row('10/04/2026', 480)]];
    const payload = await prepareForAi(pdfFile(), 10_000, 3);
    expect(payload.text).toBe('10/03/2026 1,520.85 133,905.00\n10/04/2026 1,520.85 133,905.00');
  });

  it('cuts the text to the limit, and says so', async () => {
    pdf.pages = [[word('שורה ארוכה של טקסט לדוגמה שחוזרת על עצמה', 100, 500), word('ועוד שורה ארוכה של טקסט לדוגמה', 100, 480)]];
    const payload = await prepareForAi(pdfFile(), 20, 3);
    expect(payload.text).toHaveLength(20);
    expect(payload.truncated).toBe(true);
  });

  it('sends a scan as images of its first pages, since it has no text to redact', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    pdf.pages = [[], [], [], []];
    const payload = await prepareForAi(pdfFile(), 10_000, 3);
    expect(payload.images).toEqual(Array(3).fill('data:image/jpeg;base64,AAAA'));
    expect(payload).toMatchObject({ pageCount: 4, truncated: true });
    expect(payload.text).toBeUndefined();
    expect(pdf.rendered).toBe(3);
  });

  it('warns that a scan cannot be read in the browser', async () => {
    pdf.pages = [[]];
    const extraction = await extractApproval(pdfFile(), 0.06);
    expect(extraction.warnings.join(' ')).toContain('סריקה');
    expect(extraction.tracks).toEqual([]);
  });

  it('reads a document that is not a mortgage statement as an approval', async () => {
    pdf.pages = [[word('מסמך כללי לדוגמה בלי מסלולים ובלי יתרות', 100, 500)]];
    const document = await extractMortgageDocument(pdfFile(), 0.06);
    expect(document.kind).toBe('approval');
    expect(document.pageCount).toBe(1);
  });

  it('refuses a file over the size limit before reading it', async () => {
    const big = pdfFile();
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await expect(prepareForAi(big, 10_000, 3)).rejects.toThrow('10MB');
    await expect(extractApproval(big, 0.06)).rejects.toThrow('10MB');
  });

  it('tells an image by its type or its name', () => {
    expect(isImageFile(new File([], 'scan', { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new File([], 'photo.JPG'))).toBe(true);
    expect(isImageFile(new File([], 'doc.pdf', { type: 'application/pdf' }))).toBe(false);
  });
});
