import { parseApproval, type ParsedApproval } from './approval';
import { redact } from './redaction';

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
    // Group by vertical position so a table row stays on one line for the parser.
    const rows = new Map<number, string[]>();
    for (const item of content.items) {
      if (!('str' in item)) {
        continue;
      }
      const y = Math.round((item.transform[5] as number) / 3);
      const row = rows.get(y) ?? [];
      row.push(item.str);
      rows.set(y, row);
    }
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    parts.push(ordered.map(([, cells]) => cells.join(' ')).join('\n'));
  }
  return { text: parts.join('\n'), pageCount: document.numPages };
}

function isPdf(bytes: Uint8Array, file: File): boolean {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return true;
  }
  return file.type.toLowerCase().includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
}

export async function extractApproval(file: File, primeRate: number): Promise<DocumentExtraction> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('הקובץ גדול מ-10MB.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let text: string;
  let pageCount = 1;
  const warnings: string[] = [];

  if (isPdf(bytes, file)) {
    const extracted = await extractPdfText(buffer);
    text = extracted.text;
    pageCount = extracted.pageCount;
    if (text.trim().length < TEXT_LAYER_THRESHOLD) {
      warnings.push(
        'לא נמצאה שכבת טקסט במסמך. ככל הנראה מדובר בסריקה — נדרש קובץ PDF מקורי מהבנק.',
      );
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
  }

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
