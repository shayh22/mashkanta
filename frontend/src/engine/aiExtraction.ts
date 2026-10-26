import type { TrackType } from '../lib/types';
import type { ParsedTrack } from './approval';
import type { ConsumerDebt, DebtKind } from './consolidation';
import type { ExistingTrack } from './prepayment';
import { TRACKS } from './tracks';

/**
 * Reading documents whose layout no local parser knows, with a language model.
 *
 * The local parsers stay first: a known format never leaves the browser. Only when they find
 * nothing does the app offer to send the document out, and only after the borrower agrees. Text
 * is redacted before it is sent; an image cannot be, and the consent says so.
 *
 * This module is shared by the browser and the Worker. It defines what the model is asked for
 * (a strict JSON schema per document kind, so the answer is machine-checked structure rather than
 * prose) and turns the answer into the engine's own types — validating every number against a
 * plausible range, because a model can misread a column, and a misread rate is worse than none.
 */

export type AiDocumentKind = 'consumerLoans' | 'mortgage' | 'offer';

export const AI_DOCUMENT_LABELS: Record<AiDocumentKind, string> = {
  consumerLoans: 'פירוט הלוואות',
  mortgage: 'דוח משכנתא',
  offer: 'הצעה / אישור עקרוני',
};

const DEBT_KINDS = ['CAR', 'CREDIT_CARD', 'NON_BANK', 'OVERDRAFT', 'BALLOON', 'OTHER'] as const satisfies readonly DebtKind[];
const TRACK_TYPES = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
  'ELIGIBILITY',
] as const satisfies readonly TrackType[];

const number = { type: ['number', 'null'] } as const;
const integer = { type: ['integer', 'null'] } as const;
const text = { type: ['string', 'null'] } as const;

/** Strict schemas: every property required, unknowns as null, nothing extra. */
export const AI_SCHEMAS: Record<AiDocumentKind, Record<string, unknown>> = {
  consumerLoans: {
    type: 'object',
    additionalProperties: false,
    required: ['loans'],
    properties: {
      loans: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'label', 'balance', 'annualRatePercent', 'monthlyPayment', 'remainingMonths'],
          properties: {
            kind: { type: 'string', enum: DEBT_KINDS },
            label: text,
            balance: number,
            annualRatePercent: number,
            monthlyPayment: number,
            remainingMonths: integer,
          },
        },
      },
    },
  },
  mortgage: {
    type: 'object',
    additionalProperties: false,
    required: ['asOf', 'tracks'],
    properties: {
      asOf: text,
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'label', 'balance', 'annualRatePercent', 'remainingMonths', 'monthsElapsed', 'startDate', 'statedFee'],
          properties: {
            type: { type: 'string', enum: TRACK_TYPES },
            label: text,
            balance: number,
            annualRatePercent: number,
            remainingMonths: integer,
            monthsElapsed: integer,
            startDate: text,
            statedFee: number,
          },
        },
      },
    },
  },
  offer: {
    type: 'object',
    additionalProperties: false,
    required: ['bank', 'tracks'],
    properties: {
      bank: text,
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'amount', 'annualRatePercent', 'termMonths'],
          properties: {
            type: { type: 'string', enum: TRACK_TYPES },
            amount: number,
            annualRatePercent: number,
            termMonths: integer,
          },
        },
      },
    },
  },
};

const COMMON = `You read Israeli bank documents (Hebrew, right-to-left) and return only the JSON the schema asks for.
Copy numbers exactly as printed; never estimate or compute a figure that is not in the document — use null instead.
Rates are annual percentages as printed (5.25 for 5.25%). Amounts are in shekels without separators.
Personal details have been masked as [REDACTED] tokens; ignore them.`;

const TRACK_GUIDE = `Track types: PRIME = פריים; FIXED_UNLINKED = קבועה לא צמודה (קל"צ); FIXED_LINKED = קבועה צמודה (ק"צ);
VARIABLE_UNLINKED = משתנה לא צמודה (e.g. every 5 years, on bonds); VARIABLE_LINKED = משתנה צמודה; ELIGIBILITY = זכאות / משרד השיכון.`;

export const AI_INSTRUCTIONS: Record<AiDocumentKind, string> = {
  consumerLoans: `${COMMON}
The document lists a household's consumer loans (not a mortgage). Return one entry per loan:
kind: CAR = רכב; CREDIT_CARD = loans from a credit card company or a card credit line (קרדיט, אשראי בכרטיס);
NON_BANK = a non-bank lender; OVERDRAFT = מינוס / מסגרת בעו"ש; BALLOON = בלון / גישור; OTHER = any other loan.
balance = outstanding balance (יתרה לסילוק / יתרת קרן); monthlyPayment = the monthly instalment (החזר חודשי);
remainingMonths = payments left (תשלומים שנותרו), or derive it only if the final payment date is printed.`,
  mortgage: `${COMMON}
The document describes an existing mortgage. Return one entry per track (מסלול / תת-הלוואה):
balance = outstanding balance including indexation; annualRatePercent = the current rate (for prime, prime plus margin);
remainingMonths = payments left; monthsElapsed = months since the loan was taken, only if printed as a number;
startDate = the date the loan or track was taken (תאריך ביצוע / העמדה / תחילת ההלוואה) as printed, written YYYY-MM or YYYY-MM-DD;
asOf = the statement's own date, written YYYY-MM-DD;
statedFee = the early repayment fee the bank states for that track, if printed. ${TRACK_GUIDE}`,
  offer: `${COMMON}
The document is a mortgage offer or approval in principle (אישור עקרוני). Return the lender's name if printed,
and one entry per track: amount = principal; annualRatePercent = the offered rate (for prime, prime plus margin);
termMonths = the track's term in months. ${TRACK_GUIDE}`,
};

export interface AiResult<T> {
  readonly items: T[];
  /** Rows the model returned that failed validation, explained for the borrower. */
  readonly warnings: string[];
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const between = (value: unknown, min: number, max: number) => finite(value) && value >= min && value <= max;
const rateOf = (percent: unknown, max = 40) => (between(percent, 0, max) ? Math.round((percent as number) * 1e4) / 1e6 : undefined);

type Row = Record<string, unknown>;
const rowsOf = (data: unknown, key: string): Row[] => {
  const rows = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(rows) ? rows.filter((row): row is Row => typeof row === 'object' && row !== null) : [];
};

export function toConsumerDebts(data: unknown, newId: () => string): AiResult<ConsumerDebt> {
  const items: ConsumerDebt[] = [];
  const warnings: string[] = [];
  rowsOf(data, 'loans').forEach((row, index) => {
    const kind = DEBT_KINDS.includes(row.kind as DebtKind) ? (row.kind as DebtKind) : 'OTHER';
    const annualRate = rateOf(row.annualRatePercent);
    if (!between(row.balance, 1, 5_000_000) || annualRate === undefined) {
      warnings.push(`שורה ${index + 1}: לא זוהו יתרה וריבית סבירות — לא יובאה.`);
      return;
    }
    const remainingMonths = between(row.remainingMonths, 1, 480) ? Math.round(row.remainingMonths as number) : 12;
    const monthlyPayment = between(row.monthlyPayment, 1, 200_000) ? (row.monthlyPayment as number) : 0;
    if (!between(row.remainingMonths, 1, 480)) {
      warnings.push(`שורה ${index + 1}: לא צוין מספר התשלומים שנותרו — הוזן 12; עדכנו ידנית.`);
    }
    if (monthlyPayment === 0 && kind !== 'OVERDRAFT') {
      warnings.push(`שורה ${index + 1}: לא צוין החזר חודשי; עדכנו ידנית.`);
    }
    items.push({
      id: newId(),
      kind,
      label: typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 40) : kindLabel(kind),
      balance: row.balance as number,
      annualRate,
      monthlyPayment,
      remainingMonths,
      include: true,
    });
  });
  return { items, warnings };
}

/** Kept local to avoid importing the consolidation engine's runtime into the Worker bundle. */
function kindLabel(kind: DebtKind): string {
  return {
    CAR: 'הלוואת רכב',
    CREDIT_CARD: 'כרטיס אשראי / קרדיט',
    NON_BANK: 'הלוואה חוץ-בנקאית',
    OVERDRAFT: 'מינוס בעו"ש',
    BALLOON: 'בלון / גישור',
    OTHER: 'הלוואה צרכנית אחרת',
  }[kind];
}

/** `YYYY-MM` or `YYYY-MM-DD`, read as the first of the month when the day is missing. */
function parseDate(value: unknown): { year: number; month: number } | undefined {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim()) : null;
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1980 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : undefined;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Whole months from a start date to the statement date, if both read and plausible. */
function monthsSince(start: unknown, asOf: unknown): number | undefined {
  const from = parseDate(start);
  const to = parseDate(asOf);
  if (!from || !to) {
    return undefined;
  }
  const months = (to.year - from.year) * 12 + (to.month - from.month);
  return months >= 0 && months <= 480 ? months : undefined;
}

export function toMortgageTracks(data: unknown, newId: () => string): AiResult<ExistingTrack> {
  const items: ExistingTrack[] = [];
  const warnings: string[] = [];
  const statementDate = (data as Record<string, unknown> | null)?.asOf;
  const asOf = parseDate(statementDate) ? statementDate : undefined;
  rowsOf(data, 'tracks').forEach((row, index) => {
    const type = TRACK_TYPES.includes(row.type as TrackType) ? (row.type as TrackType) : undefined;
    const annualRate = rateOf(row.annualRatePercent, 20);
    if (!type || !between(row.balance, 1, 20_000_000) || annualRate === undefined || !between(row.remainingMonths, 1, 480)) {
      warnings.push(`מסלול ${index + 1}: חסרים סוג, יתרה, ריבית או תקופה סבירים — לא יובא.`);
      return;
    }
    // Seniority as printed, or worked out here from the dates the model copied — date arithmetic is
    // done in code, never left to the model.
    const elapsed = between(row.monthsElapsed, 0, 480)
      ? Math.round(row.monthsElapsed as number)
      : monthsSince(row.startDate, asOf ?? today());
    items.push({
      id: newId(),
      type,
      balance: row.balance as number,
      annualRate,
      remainingMonths: Math.round(row.remainingMonths as number),
      monthsElapsed: elapsed ?? 0,
      ...(typeof row.label === 'string' && row.label.trim() ? { label: row.label.trim().slice(0, 40) } : {}),
      ...(between(row.statedFee, 0, 2_000_000) ? { statedFee: row.statedFee as number } : {}),
    });
    if (elapsed === undefined) {
      warnings.push(`מסלול ${index + 1}: לא צוין ותק ההלוואה — הנחת ותק אפס (עמלה שמרנית); עדכנו ידנית.`);
    }
  });
  return { items, warnings };
}

export function toOfferTracks(data: unknown): AiResult<ParsedTrack> & { bank?: string } {
  const items: ParsedTrack[] = [];
  const warnings: string[] = [];
  rowsOf(data, 'tracks').forEach((row, index) => {
    const type = TRACK_TYPES.includes(row.type as TrackType) ? (row.type as TrackType) : undefined;
    const annualRate = rateOf(row.annualRatePercent, 20);
    if (!type || !between(row.amount, 1, 20_000_000) || annualRate === undefined || !between(row.termMonths, 12, 480)) {
      warnings.push(`מסלול ${index + 1}: חסרים סוג, סכום, ריבית או תקופה סבירים — לא נקלט.`);
      return;
    }
    items.push({
      track: type,
      hebrewName: TRACKS[type].hebrewName,
      amount: row.amount as number,
      annualRate,
      termMonths: Math.round(row.termMonths as number),
      sourceLine: 'AI',
    });
  });
  const bank = (data as Record<string, unknown> | null)?.bank;
  return { items, warnings, ...(typeof bank === 'string' && bank.trim() ? { bank: bank.trim().slice(0, 40) } : {}) };
}

/** Largest redacted text sent to the model, in characters — about thirty pages of a statement. */
export const AI_MAX_TEXT = 60_000;
/** Largest image payload, base64 characters (about 4.5MB of image). */
export const AI_MAX_IMAGE = 6_000_000;
/** Pages of a scanned PDF rendered to images for the model. */
export const AI_MAX_PAGES = 3;

export interface AiRequest {
  readonly kind: AiDocumentKind;
  /** Redacted document text. */
  readonly text?: string;
  /** Page images as data URLs, sent unredacted with the borrower's explicit consent. */
  readonly images?: readonly string[];
}

/** The request body is checked on both sides; the Worker trusts nothing the browser sends. */
export function validateAiRequest(body: unknown): AiRequest | string {
  const request = body as Partial<AiRequest> | null;
  if (!request || !['consumerLoans', 'mortgage', 'offer'].includes(request.kind as string)) {
    return 'unknown document kind';
  }
  const hasText = typeof request.text === 'string' && request.text.trim().length > 0;
  const images = Array.isArray(request.images) ? request.images : [];
  if (!hasText && images.length === 0) {
    return 'empty document';
  }
  if (hasText && request.text!.length > AI_MAX_TEXT) {
    return 'document too long';
  }
  if (images.length > AI_MAX_PAGES) {
    return 'too many pages';
  }
  for (const image of images) {
    if (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(image) || image.length > AI_MAX_IMAGE) {
      return 'unsupported image';
    }
  }
  return { kind: request.kind as AiDocumentKind, ...(hasText ? { text: request.text } : {}), ...(images.length ? { images } : {}) };
}
