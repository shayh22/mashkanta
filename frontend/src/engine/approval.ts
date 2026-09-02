import type { TrackType } from '../lib/types';
import { TRACKS } from './tracks';

/**
 * Reads the track table out of a standardised approval-in-principle (אישור עקרוני אחיד).
 *
 * The Bank of Israel mandated format puts one track per row: track name, principal, term, anchor
 * and the bank's discretionary margin. The parser works line by line and only emits a track when a
 * line yields both a recognisable track name and a plausible rate, which keeps the summary tables
 * and legal boilerplate that surround the real table from producing phantom rows.
 *
 * It always runs on redacted text — by the time a line reaches here, identity numbers and names
 * have already been masked.
 */

const AMOUNT = /(?:₪\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{5,})/g;
const RATE = /(\d{1,2}[.,]\d{1,3})\s*%/;
const TERM_MONTHS = /(\d{2,3})\s*(?:חודשים|חודש)/;
const TERM_YEARS = /(\d{1,2})\s*(?:שנים|שנה)/;
const PRIME_MARGIN = /פריים\s*([+\-−])\s*(\d{1,2}[.,]\d{1,3})/;

/** Hebrew spellings seen in the wild, most specific first so "קבועה צמודה" wins over "קבועה". */
const TRACK_KEYWORDS: [string, TrackType][] = [
  ['קבועה לא צמודה', 'FIXED_UNLINKED'],
  ['קל"צ', 'FIXED_UNLINKED'],
  ['קלצ', 'FIXED_UNLINKED'],
  ['משתנה לא צמודה', 'VARIABLE_UNLINKED'],
  ['משתנה צמודה', 'VARIABLE_LINKED'],
  ['משתנה כל 5', 'VARIABLE_LINKED'],
  ['קבועה צמודה', 'FIXED_LINKED'],
  ['ק"צ', 'FIXED_LINKED'],
  ['זכאות', 'ELIGIBILITY'],
  ['פריים', 'PRIME'],
];

const BANKS: [string, string][] = [
  ['מזרחי', 'MIZRAHI'],
  ['הפועלים', 'HAPOALIM'],
  ['לאומי', 'LEUMI'],
  ['דיסקונט', 'DISCOUNT'],
  ['הבינלאומי', 'FIBI'],
  ['ירושלים', 'JERUSALEM'],
];

export interface ParsedTrack {
  readonly track: TrackType;
  readonly hebrewName: string;
  readonly amount: number;
  readonly annualRate: number;
  readonly termMonths: number;
  readonly sourceLine: string;
}

export interface ParsedApproval {
  readonly tracks: readonly ParsedTrack[];
  readonly totalAmount: number;
  readonly bankCode?: string;
  readonly warnings: readonly string[];
}

export function parseApproval(redactedText: string, primeRate: number): ParsedApproval {
  const tracks: ParsedTrack[] = [];
  const warnings: string[] = [];

  if (!redactedText || redactedText.trim().length === 0) {
    return { tracks: [], totalAmount: 0, warnings: ['לא הופק טקסט מהמסמך.'] };
  }

  const bankCode = BANKS.find(([hebrew]) => redactedText.includes(hebrew))?.[1];

  for (const rawLine of redactedText.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, ' ').trim();
    if (line.length < 8) {
      continue;
    }
    const track = TRACK_KEYWORDS.find(([keyword]) => line.includes(keyword))?.[1];
    if (!track) {
      continue;
    }
    const rate = detectRate(line, track, primeRate);
    if (rate === null) {
      continue;
    }
    const amount = detectAmount(line);
    const termMonths = detectTerm(line);
    if (amount === null) {
      warnings.push(`זוהה מסלול ${TRACKS[track].hebrewName} ללא סכום — יש להשלים ידנית.`);
    }
    tracks.push({
      track,
      hebrewName: TRACKS[track].hebrewName,
      amount: amount ?? 0,
      annualRate: rate,
      termMonths: termMonths ?? 0,
      sourceLine: line,
    });
  }

  if (tracks.length === 0) {
    warnings.push('לא זוהו מסלולי הלוואה במסמך. ניתן להזין את הנתונים ידנית.');
  }

  return {
    tracks,
    totalAmount: tracks.reduce((sum, track) => sum + track.amount, 0),
    bankCode,
    warnings,
  };
}

/**
 * Prime rows are usually quoted as a margin ("פריים מינוס 0.5"), everything else as an absolute
 * rate. A prime row that also carries an absolute rate keeps the absolute figure.
 */
function detectRate(line: string, track: TrackType, primeRate: number): number | null {
  if (track === 'PRIME') {
    const normalised = line.replace(/מינוס/g, '-').replace(/פלוס/g, '+');
    const margin = PRIME_MARGIN.exec(normalised);
    if (margin) {
      const value = Number(margin[2]!.replace(',', '.')) / 100;
      const negative = margin[1] !== '+';
      return Math.max(0, primeRate + (negative ? -value : value));
    }
  }
  const rate = RATE.exec(line);
  return rate ? Number(rate[1]!.replace(',', '.')) / 100 : null;
}

function detectAmount(line: string): number | null {
  let best = 0;
  for (const match of line.matchAll(AMOUNT)) {
    const value = Number(match[1]!.replace(/,/g, ''));
    // Terms and percentages never reach six figures; principals always do.
    if (value >= 10_000 && value > best) {
      best = value;
    }
  }
  return best > 0 ? best : null;
}

function detectTerm(line: string): number | null {
  const months = TERM_MONTHS.exec(line);
  if (months) {
    return Number(months[1]);
  }
  const years = TERM_YEARS.exec(line);
  return years ? Number(years[1]) * 12 : null;
}
