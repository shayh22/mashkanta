/**
 * Strips borrower-identifying content out of an extracted document.
 *
 * Ported from the Java `PiiRedactionService`. Running it in the browser makes the guarantee
 * stronger than the server-side original: the document is never transmitted at all, so identifying
 * data cannot leak in flight or at rest.
 *
 * Identity numbers are validated against the official check digit before being redacted, so a
 * nine-digit loan reference is not silently destroyed while a real identity number still matches.
 */

const MASK = '[REDACTED]';

/** Nine digit runs — candidates for an Israeli identity number, confirmed by check digit. */
const ID_CANDIDATE = /(?<!\d)(\d{9})(?!\d)/g;
const PHONE = /(?<!\d)0\d{1,2}[-\s]?\d{7}(?!\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const ACCOUNT = /(חשבון מספר|מס' חשבון|חשבון|סניף)\s*[:\-]?\s*(\d[\d\-/]{3,})/g;
const NAME = /(שם הלווה|שם הלקוח|שם המבקש|שם מלא|הלווה|לכבוד)\s*[:\-]?\s*([^\n\r]{2,60})/g;
const ADDRESS = /(כתובת הנכס|כתובת|רחוב|גוש|חלקה)\s*[:\-]?\s*([^\n\r]{2,80})/g;

export interface RedactionResult {
  readonly sanitizedText: string;
  readonly spanCount: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

/** Categories the pipeline knows how to strip, surfaced in the UI for transparency. */
export const REDACTION_CATEGORIES = ['NATIONAL_ID', 'NAME', 'ADDRESS', 'ACCOUNT', 'PHONE', 'EMAIL'] as const;

/**
 * The Israeli identity number check digit: digits are weighted 1,2,1,2..., each product is reduced
 * to its digit sum, and the total must be divisible by ten.
 */
export function isValidIsraeliId(digits: string | null | undefined): boolean {
  if (!digits || digits.length !== 9 || !/^\d{9}$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

export function redact(text: string | null | undefined): RedactionResult {
  if (!text || text.trim().length === 0) {
    return { sanitizedText: '', spanCount: 0, byCategory: {} };
  }

  const counts: Record<string, number> = {};
  const bump = (category: string) => {
    counts[category] = (counts[category] ?? 0) + 1;
  };

  let working = text;

  // Only redact nine-digit runs that are valid identity numbers.
  working = working.replace(ID_CANDIDATE, (match, digits: string) => {
    if (isValidIsraeliId(digits)) {
      bump('NATIONAL_ID');
      return MASK;
    }
    return match;
  });

  working = working.replace(EMAIL, () => {
    bump('EMAIL');
    return MASK;
  });
  working = working.replace(PHONE, () => {
    bump('PHONE');
    return MASK;
  });

  // Keep the Hebrew label so the document stays readable, and mask only the value after it.
  const labelled = (pattern: RegExp, category: string) => {
    working = working.replace(pattern, (_match, label: string) => {
      bump(category);
      return `${label}: ${MASK}`;
    });
  };
  labelled(ACCOUNT, 'ACCOUNT');
  labelled(NAME, 'NAME');
  labelled(ADDRESS, 'ADDRESS');

  const spanCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { sanitizedText: working, spanCount, byCategory: counts };
}
