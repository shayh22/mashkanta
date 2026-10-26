import { parseApproval, type ParsedApproval } from './approval';
import { redact, type RedactionResult } from './redaction';
import { parseAmortizationSchedule, type ParsedSchedule } from './schedule';
import { parseMortgageStatement, statementToTracks, type ParsedStatement, type StatementTrack } from './statement';

/**
 * Client-side extraction of an approval-in-principle.
 *
 * The whole pipeline runs in the browser: the file is read into memory, text is extracted, every
 * identifying span is masked, and only the sanitised text reaches the parser. Nothing is uploaded,
 * which makes the privacy guarantee structural rather than a promise about what a server does.
 */

export interface DocumentExtraction {
  readonly pageCount: number;
  readonly redactedSpans: number;
  readonly redactionsByCategory: Readonly<Record<string, number>>;
  readonly bankCode?: string;
  readonly totalAmount: number;
  readonly tracks: ParsedApproval['tracks'];
  readonly warnings: readonly string[];
}

/** Below this many characters a PDF is treated as a scan rather than a text document. */
const TEXT_LAYER_THRESHOLD = 40;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * pdf.js is around a megabyte, and most visitors never open a document. Importing it on demand
 * keeps it out of the initial bundle entirely.
 */
async function extractPdfText(data: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist');
  // Vite resolves this to a hashed asset URL at build time.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const document = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = content.items.flatMap((item) => ('str' in item ? [item] : []));
    parts.push(isGlyphByGlyph(items) ? rebuildVisualText(items) : joinTextItems(items));
  }
  return { text: parts.join('\n'), pageCount: document.numPages };
}

/** The part of a pdf.js text item the extraction uses. */
interface PdfTextItem {
  readonly str: string;
  readonly transform: number[];
  readonly width: number;
}

/** Rows of a page, top to bottom, keyed by vertical position so a table row stays on one line. */
function rowsOf(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const rows = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const y = Math.round((item.transform[5] as number) / 3);
    const row = rows.get(y) ?? [];
    row.push(item);
    rows.set(y, row);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => row);
}

/** Most PDFs carry words and phrases as items, in reading order. */
function joinTextItems(items: readonly PdfTextItem[]): string {
  return rowsOf(items)
    .map((row) => row.map((item) => item.str).join(' '))
    .join('\n');
}

/**
 * Some document generators (Quadient Inspire, used by banks for printed schedules) write every
 * character as its own item, in visual order, so joining items gives "6 5 . 4 3 2 , 1" for
 * 1,234.56 and Hebrew backwards. Recognised by most items being a single character.
 */
function isGlyphByGlyph(items: readonly PdfTextItem[]): boolean {
  const visible = items.filter((item) => item.str.trim().length > 0);
  const single = visible.filter((item) => [...item.str.trim()].length === 1).length;
  return visible.length >= 20 && single / visible.length > 0.6;
}

const HEBREW = /[\u0590-\u05FF]/;

/**
 * Rebuilds such a page by position: characters left to right, a space wherever the gap between
 * them is wider than letter spacing — which gives numbers and dates in reading order — then each
 * line turned from visual to logical order for right-to-left text: words last to first, and each
 * Hebrew word's letters reversed.
 */
export function rebuildVisualText(items: readonly PdfTextItem[]): string {
  return rowsOf(items.filter((item) => item.str.trim().length > 0))
    .map((row) => {
      const sorted = [...row].sort((a, b) => (a.transform[4] as number) - (b.transform[4] as number));
      let line = '';
      let end = -Infinity;
      for (const item of sorted) {
        const x = item.transform[4] as number;
        if (line && x - end > 1.5) {
          line += ' ';
        }
        line += item.str;
        end = x + item.width;
      }
      return line
        .split(/\s+/)
        .filter(Boolean)
        .reverse()
        .map((word) => (HEBREW.test(word) ? [...word].reverse().join('') : word))
        .join(' ');
    })
    .join('\n');
}

function isPdf(bytes: Uint8Array, file: File): boolean {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return true;
  }
  return file.type.toLowerCase().includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
}

/** Reads a file into text, ready for redaction. Shared by every document parser. */
async function readDocumentText(file: File): Promise<{ text: string; pageCount: number; warnings: string[] }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('הקובץ גדול מ-10MB.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const warnings: string[] = [];

  if (isPdf(bytes, file)) {
    const extracted = await extractPdfText(buffer);
    if (extracted.text.trim().length < TEXT_LAYER_THRESHOLD) {
      warnings.push(
        'לא נמצאה שכבת טקסט במסמך. ככל הנראה מדובר בסריקה — נדרש קובץ PDF מקורי מהבנק.',
      );
    }
    return { text: extracted.text, pageCount: extracted.pageCount, warnings };
  }
  return { text: new TextDecoder('utf-8').decode(bytes), pageCount: 1, warnings };
}

export async function extractApproval(file: File, primeRate: number): Promise<DocumentExtraction> {
  const { text, pageCount, warnings } = await readDocumentText(file);

  // Redact before anything else touches the text.
  const sanitised = redact(text);
  const parsed = parseApproval(sanitised.sanitizedText, primeRate);

  return {
    pageCount,
    redactedSpans: sanitised.spanCount,
    redactionsByCategory: sanitised.byCategory,
    bankCode: parsed.bankCode,
    totalAmount: parsed.totalAmount,
    tracks: parsed.tracks,
    warnings: [...parsed.warnings, ...warnings],
  };
}

export type MortgageDocument =
  | {
      readonly kind: 'statement';
      readonly statement: ParsedStatement;
      readonly tracks: readonly StatementTrack[];
      readonly redaction: Omit<RedactionResult, 'sanitizedText'>;
      readonly pageCount: number;
      readonly warnings: readonly string[];
    }
  | {
      readonly kind: 'approval';
      readonly tracks: ParsedApproval['tracks'];
      readonly redaction: Omit<RedactionResult, 'sanitizedText'>;
      readonly pageCount: number;
      readonly warnings: readonly string[];
    };

/**
 * Reads whatever mortgage document the borrower has: a mortgage details statement when it is one
 * (exact balances, sub-loans, the bank's own fee), otherwise an approval-in-principle.
 */
export async function extractMortgageDocument(file: File, primeRate: number): Promise<MortgageDocument> {
  const { text, pageCount, warnings } = await readDocumentText(file);
  const { sanitizedText, ...redaction } = redact(text);

  const statement = parseMortgageStatement(sanitizedText);
  if (statement) {
    return {
      kind: 'statement',
      statement,
      tracks: statementToTracks(statement),
      redaction,
      pageCount,
      warnings: [...statement.warnings, ...warnings],
    };
  }

  const approval = parseApproval(sanitizedText, primeRate);
  return { kind: 'approval', tracks: approval.tracks, redaction, pageCount, warnings: [...approval.warnings, ...warnings] };
}

/**
 * Reads a loan's amortization schedule (לוח סילוקין) in the browser. `schedule` is null when the
 * document is not one, which is the cue to offer reading it with AI instead.
 */
export async function extractLoanSchedule(
  file: File,
  today: string,
): Promise<{ schedule: ParsedSchedule | null; redaction: Omit<RedactionResult, 'sanitizedText'>; warnings: string[] }> {
  const { text, warnings } = await readDocumentText(file);
  const { sanitizedText, ...redaction } = redact(text);
  return { schedule: parseAmortizationSchedule(sanitizedText, today), redaction, warnings };
}

// ---------------------------------------------------------------------------
// Preparing an unrecognised document for the language model (see aiExtraction.ts)
// ---------------------------------------------------------------------------

/** What would be sent, shown to the borrower before they agree to send it. */
export interface AiPayload {
  /** Redacted text, when the document has a text layer. */
  readonly text?: string;
  /** Page images (data URLs) for a scan or a photo — these cannot be redacted. */
  readonly images?: readonly string[];
  readonly redaction?: Omit<RedactionResult, 'sanitizedText'>;
  readonly pageCount: number;
  /** True when the text was cut to the model's limit. */
  readonly truncated: boolean;
}

const IMAGE_TYPES = /^image\/(png|jpeg|webp)$/;

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

/** Longest image side sent to the model; enough to read a statement, small enough to send. */
const MAX_IMAGE_SIDE = 2000;

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToDataUrl(canvas);
}

async function renderPdfPages(data: ArrayBuffer, maxPages: number): Promise<{ images: string[]; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const images: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_IMAGE_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    images.push(canvasToDataUrl(canvas));
  }
  return { images, pageCount: pdf.numPages };
}

/**
 * Turns a document into what the model would receive: redacted text when there is a text layer,
 * otherwise images of the first pages. Runs entirely in the browser; nothing is sent from here.
 */
export async function prepareForAi(file: File, maxText: number, maxPages: number): Promise<AiPayload> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('הקובץ גדול מ-10MB.');
  }
  if (isImageFile(file)) {
    return { images: [await imageFileToDataUrl(file)], pageCount: 1, truncated: false };
  }
  const { text, pageCount } = await readDocumentText(file);
  if (text.trim().length >= TEXT_LAYER_THRESHOLD) {
    const { sanitizedText, ...redaction } = redact(text);
    return {
      text: sanitizedText.slice(0, maxText),
      redaction,
      pageCount,
      truncated: sanitizedText.length > maxText,
    };
  }
  const rendered = await renderPdfPages(await file.arrayBuffer(), maxPages);
  return { images: rendered.images, pageCount: rendered.pageCount, truncated: rendered.pageCount > maxPages };
}
