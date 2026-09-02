import type { TrackType } from '../lib/types';
import { priceMix } from './amortization';
import { rateFor } from './baseline';
import type { MacroScenario } from './scenario';
import { trackFromRate, type TrackSpec } from './tracks';

/** A lender's indicative pricing position, as offsets from the Bank of Israel average. */
export interface BankRateSheet {
  readonly code: string;
  readonly hebrewName: string;
  /** Share of new mortgage origination. */
  readonly marketShare: number;
  readonly offsets: Partial<Record<TrackType, number>>;
  readonly note: string;
}

/**
 * Indicative positions derived from publicly posted tariffs and campaign announcements, not
 * confidential quotes. Market shares are the published figures for new mortgage origination.
 */
export const BANK_SHEETS: readonly BankRateSheet[] = [
  {
    code: 'MIZRAHI',
    hebrewName: 'מזרחי טפחות',
    marketShare: 0.34,
    offsets: { PRIME: -0.0005, FIXED_UNLINKED: 0.0008, FIXED_LINKED: -0.0012, VARIABLE_UNLINKED: 0.0004, VARIABLE_LINKED: -0.0008 },
    note: 'הבנק הגדול בשוק המשכנתאות, מתמחר אגרסיבי במסלולים הצמודים.',
  },
  {
    code: 'HAPOALIM',
    hebrewName: 'בנק הפועלים',
    marketShare: 0.2,
    offsets: { PRIME: -0.001, FIXED_UNLINKED: 0.0002, FIXED_LINKED: 0.0006, VARIABLE_UNLINKED: -0.0002, VARIABLE_LINKED: 0.0004 },
    note: 'מתמחר טוב במסלול הפריים, בעיקר ללקוחות עם ניהול שכר בבנק.',
  },
  {
    code: 'LEUMI',
    hebrewName: 'בנק לאומי',
    marketShare: 0.18,
    offsets: { PRIME: -0.0004, FIXED_UNLINKED: -0.001, FIXED_LINKED: 0.0004, VARIABLE_UNLINKED: 0.0002, VARIABLE_LINKED: 0.0006 },
    note: 'בולט בקבועה לא צמודה לתקופות ארוכות.',
  },
  {
    code: 'DISCOUNT',
    hebrewName: 'בנק דיסקונט',
    marketShare: 0.12,
    offsets: { PRIME: 0.0004, FIXED_UNLINKED: -0.0006, FIXED_LINKED: -0.0004, VARIABLE_UNLINKED: -0.0008, VARIABLE_LINKED: 0 },
    note: 'מבצעים תקופתיים בשיעורי מימון נמוכים.',
  },
  {
    code: 'FIBI',
    hebrewName: 'הבנק הבינלאומי',
    marketShare: 0.08,
    offsets: { PRIME: 0.0006, FIXED_UNLINKED: -0.0004, FIXED_LINKED: 0.0002, VARIABLE_UNLINKED: 0.0006, VARIABLE_LINKED: 0.0008 },
    note: 'גמיש במשא ומתן על תמהיל, פחות אגרסיבי בפריים.',
  },
  {
    code: 'JERUSALEM',
    hebrewName: 'בנק ירושלים',
    marketShare: 0.03,
    offsets: { PRIME: 0.001, FIXED_UNLINKED: 0.0012, FIXED_LINKED: 0.001, VARIABLE_UNLINKED: -0.001, VARIABLE_LINKED: -0.0012 },
    note: 'מתמחר גבוה יותר בממוצע, אך גמיש בתיקים מורכבים ובשיעורי מימון גבוהים.',
  },
];

export interface BankQuote {
  readonly code: string;
  readonly hebrewName: string;
  readonly marketShare: number;
  readonly note: string;
  readonly rates: Partial<Record<TrackType, number>>;
  readonly weightedRate: number;
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly totalPaid: number;
  readonly nominalIrr: number;
  /** 1 is cheapest over the life of the loan. */
  readonly rank: number;
  readonly costAboveBest: number;
}

/**
 * Re-prices one allocation at every lender.
 *
 * Holding the mix fixed and varying only the lender is what makes the comparison honest — a bank
 * cannot look cheap here by quietly shifting principal into a cheaper track.
 */
export function compareBanks(
  allocation: ReadonlyMap<TrackType, number>,
  loanAmount: number,
  termMonths: number,
  ltv: number,
  scenario: MacroScenario,
): BankQuote[] {
  const quotes: Omit<BankQuote, 'rank' | 'costAboveBest'>[] = [];

  for (const sheet of BANK_SHEETS) {
    const specs: TrackSpec[] = [];
    const rates: Partial<Record<TrackType, number>> = {};

    for (const [track, share] of allocation) {
      const amount = loanAmount * share;
      if (amount <= 0.5) {
        continue;
      }
      const quoted = rateFor(track, ltv, termMonths).medianRate + (sheet.offsets[track] ?? 0);
      rates[track] = quoted;
      specs.push(trackFromRate(track, amount, termMonths, quoted, scenario));
    }

    if (specs.length === 0) {
      continue;
    }
    const result = priceMix(specs, scenario);
    quotes.push({
      code: sheet.code,
      hebrewName: sheet.hebrewName,
      marketShare: sheet.marketShare,
      note: sheet.note,
      rates,
      weightedRate: result.weightedInitialRate,
      initialPayment: result.initialPayment,
      maxPayment: result.maxPayment,
      totalPaid: result.totalPaid,
      nominalIrr: result.nominalIrr,
    });
  }

  quotes.sort((a, b) => a.totalPaid - b.totalPaid);
  const best = quotes[0]?.totalPaid ?? 0;
  return quotes.map((quote, index) => ({ ...quote, rank: index + 1, costAboveBest: quote.totalPaid - best }));
}
