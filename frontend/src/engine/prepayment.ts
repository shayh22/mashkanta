import type { TrackType } from '../lib/types';
import { monthlyRate, payment as annuityPayment } from './math';
import { TRACKS } from './tracks';

/**
 * Early repayment fees on a housing loan, per the Banking Order (Early Repayment of a Housing Loan),
 * 2002 (צו הבנקאות — פירעון מוקדם של הלוואה לדיור).
 *
 * Four components, each independently waivable, which is why the quote reports them separately:
 * a borrower can avoid the notice fee by writing to the bank 10–45 days ahead, and the average-CPI
 * fee by repaying after the 15th, but the capitalization fee can only be timed, never avoided.
 */

export const PREPAYMENT = {
  /** Charged once per repayment event, across all tracks. */
  OPERATIONAL_FEE: 60,
  /** Share of the repaid amount charged when no advance notice was given. */
  NO_NOTICE_RATE: 0.001,
  /** The average-CPI fee applies to linked tracks repaid on days 1–15 of the month. */
  CPI_FEE_LAST_DAY: 15,
  /** A variable track whose rate resets this often or more never carries a capitalization fee. */
  CAPITALIZATION_EXEMPT_RESET_MONTHS: 12,
} as const;

/** One track of a mortgage as it stands today — what a payoff statement (דוח יתרות לסילוק) shows. */
export interface ExistingTrack {
  readonly id: string;
  readonly type: TrackType;
  /** Outstanding principal including indexation to date. */
  readonly balance: number;
  /** The rate the track carries now (for prime: prime plus margin). */
  readonly annualRate: number;
  readonly remainingMonths: number;
  /** Months since the loan was taken out — drives the seniority discount. */
  readonly monthsElapsed: number;
  /**
   * The Bank of Israel average rate for this track when the loan was taken. The fee is measured
   * against the lower of this and the loan's own rate; unknown means the loan's own rate is used.
   */
  readonly originationAverageRate?: number;
  /** Variable tracks: months until the next rate reset. Derived from `monthsElapsed` when absent. */
  readonly monthsToReset?: number;
  /** Bank money lent alongside a directed (eligibility) loan gets the steeper discount schedule. */
  readonly additionalToDirected?: boolean;
  /** Where the track came from, e.g. the loan and sub-loan number on an imported statement. */
  readonly label?: string;
  /**
   * The early repayment fee the bank itself stated for this track, as of the statement date and
   * without advance notice. When present it replaces the estimate: the bank knows the published
   * averages and origination references that the estimate has to approximate.
   */
  readonly statedFee?: number;
  /** Day of month the stated fee was computed for; it includes the average-CPI fee if 1–15. */
  readonly statedFeeDay?: number;
}

export interface PrepaymentOptions {
  /** Written notice was given 10–45 days ahead. */
  readonly noticeGiven: boolean;
  /** Calendar day the repayment settles on, 1–31. */
  readonly dayOfMonth: number;
  /** Trailing annual inflation, for the average-CPI fee. */
  readonly cpiAnnual: number;
}

export interface TrackPrepaymentQuote {
  readonly id: string;
  readonly type: TrackType;
  readonly balance: number;
  /** Today's published average rate the cash flows were discounted at. */
  readonly marketAverageRate: number;
  /** The rate the fee is measured against: min(loan rate, origination average). */
  readonly referenceRate: number;
  /** Capitalization differential before the seniority discount. */
  readonly grossCapitalizationFee: number;
  readonly seniorityDiscount: number;
  readonly capitalizationFee: number;
  readonly noticeFee: number;
  readonly cpiFee: number;
  /** Value of a rate gap in the borrower's favour, which offsets the notice and CPI fees. */
  readonly borrowerGainOffset: number;
  readonly total: number;
  /** Why the capitalization fee is zero, when it is. */
  readonly exemption?: string;
  /** BANK when the figure comes from the bank's own statement, ESTIMATE when computed here. */
  readonly source: 'BANK' | 'ESTIMATE';
  /** Months until the seniority discount steps up, if it will. */
  readonly monthsToNextDiscount?: number;
  readonly nextDiscount?: number;
}

export interface PrepaymentQuote {
  readonly tracks: readonly TrackPrepaymentQuote[];
  readonly operationalFee: number;
  readonly capitalizationFee: number;
  readonly noticeFee: number;
  readonly cpiFee: number;
  readonly total: number;
}

/** [fromYears, discount] steps, ascending. */
const REGULAR_DISCOUNTS: readonly (readonly [number, number])[] = [
  [3, 0.2],
  [5, 0.3],
];
const DIRECTED_ADDITIONAL_DISCOUNTS: readonly (readonly [number, number])[] = [
  [1, 0.1],
  [2, 0.2],
  [3, 0.3],
  [4, 0.4],
];

/** The share of the capitalization fee waived for seniority, per the Order's table. */
export function seniorityDiscount(monthsElapsed: number, additionalToDirected = false): number {
  const schedule = additionalToDirected ? DIRECTED_ADDITIONAL_DISCOUNTS : REGULAR_DISCOUNTS;
  let discount = 0;
  for (const [fromYears, value] of schedule) {
    if (monthsElapsed >= fromYears * 12) {
      discount = value;
    }
  }
  return discount;
}

/** The next step up in the discount, so the borrower can see whether waiting pays. */
export function nextDiscountStep(
  monthsElapsed: number,
  additionalToDirected = false,
): { months: number; discount: number } | undefined {
  const schedule = additionalToDirected ? DIRECTED_ADDITIONAL_DISCOUNTS : REGULAR_DISCOUNTS;
  for (const [fromYears, value] of schedule) {
    if (monthsElapsed < fromYears * 12) {
      return { months: fromYears * 12 - monthsElapsed, discount: value };
    }
  }
  return undefined;
}

/** Months until a variable track's next reset; zero means it resets this month. */
export function monthsToReset(track: ExistingTrack): number {
  if (track.monthsToReset !== undefined) {
    return Math.max(0, Math.min(track.monthsToReset, track.remainingMonths));
  }
  const reset = TRACKS[track.type].anchorResetMonths;
  if (reset <= 0) {
    return track.remainingMonths;
  }
  const intoWindow = track.monthsElapsed % reset;
  return Math.min(track.remainingMonths, intoWindow === 0 ? 0 : reset - intoWindow);
}

/**
 * The future payments the fee is computed over.
 *
 * A fixed track runs to maturity. A variable track only runs to its next reset, with the balance
 * outstanding at that point treated as the last payment — the bank's loss stops at the reset,
 * because it could re-price the loan then anyway.
 */
export function futureCashFlows(track: ExistingTrack): number[] {
  const meta = TRACKS[track.type];
  const periodic = monthlyRate(track.annualRate);
  const level = annuityPayment(track.balance, periodic, track.remainingMonths);
  const horizon = meta.variableRate ? monthsToReset(track) : track.remainingMonths;

  const flows: number[] = [];
  let balance = track.balance;
  for (let month = 1; month <= horizon; month++) {
    const interest = balance * periodic;
    balance -= level - interest;
    flows.push(level);
  }
  if (meta.variableRate && horizon > 0 && horizon < track.remainingMonths) {
    flows[horizon - 1] = (flows[horizon - 1] ?? 0) + Math.max(0, balance);
  }
  return flows;
}

/** Present value of a monthly stream at an annual nominal rate. */
export function presentValueOf(flows: readonly number[], annualRate: number): number {
  const factor = 1 / (1 + monthlyRate(annualRate));
  let discount = 1;
  let total = 0;
  for (const flow of flows) {
    discount *= factor;
    total += flow * discount;
  }
  return total;
}

function capitalizationExemption(track: ExistingTrack): string | undefined {
  const meta = TRACKS[track.type];
  if (track.type === 'ELIGIBILITY') {
    return 'הלוואה מוכוונת — פטורה מעמלת פירעון מוקדם';
  }
  if (meta.variableRate && meta.anchorResetMonths <= PREPAYMENT.CAPITALIZATION_EXEMPT_RESET_MONTHS) {
    return 'ריבית משתנה בתדירות של שנה או פחות — אין עמלת היוון';
  }
  if (meta.variableRate && monthsToReset(track) === 0) {
    return 'פירעון במועד שינוי הריבית — עמלה תפעולית בלבד';
  }
  return undefined;
}

/**
 * Quotes the fees for repaying one track in full.
 *
 * @param marketAverageRate today's published average for the track over its remaining term
 */
export function quoteTrack(
  track: ExistingTrack,
  marketAverageRate: number,
  options: PrepaymentOptions,
): TrackPrepaymentQuote {
  if (track.statedFee !== undefined) {
    return statedQuote(track, marketAverageRate, options);
  }
  const meta = TRACKS[track.type];
  const exemption = capitalizationExemption(track);
  const origination = track.originationAverageRate ?? track.annualRate;
  const referenceRate = Math.min(track.annualRate, origination);

  // Directed loans carry no early repayment fee of any kind; a variable track repaid on its reset
  // date pays only the operational fee. Both are encoded as "exempt from everything but the
  // per-event operational fee" so the totals stay consistent.
  const fullyExempt =
    track.type === 'ELIGIBILITY' || (meta.variableRate && !meta.primeAnchored && monthsToReset(track) === 0);

  let gross = 0;
  let gain = 0;
  if (!exemption) {
    const flows = futureCashFlows(track);
    if (marketAverageRate < referenceRate) {
      gross = presentValueOf(flows, marketAverageRate) - presentValueOf(flows, referenceRate);
    } else {
      const ceiling = Math.max(track.annualRate, origination);
      if (marketAverageRate > ceiling) {
        gain = presentValueOf(flows, ceiling) - presentValueOf(flows, marketAverageRate);
      }
    }
  }

  const discount = seniorityDiscount(track.monthsElapsed, track.additionalToDirected);
  const capitalizationFee = Math.max(0, gross) * (1 - discount);

  let noticeFee = fullyExempt || options.noticeGiven ? 0 : track.balance * PREPAYMENT.NO_NOTICE_RATE;
  let cpiFee = 0;
  if (!fullyExempt && meta.cpiLinked && options.dayOfMonth <= PREPAYMENT.CPI_FEE_LAST_DAY) {
    const monthlyCpi = Math.pow(1 + options.cpiAnnual, 1 / 12) - 1;
    cpiFee = Math.max(0, 0.5 * monthlyCpi * track.balance);
  }

  // A rate gap in the borrower's favour reduces the remaining fees, down to nothing.
  let offset = Math.max(0, gain);
  const noticeOffset = Math.min(noticeFee, offset);
  noticeFee -= noticeOffset;
  offset -= noticeOffset;
  const cpiOffset = Math.min(cpiFee, offset);
  cpiFee -= cpiOffset;

  const step = nextDiscountStep(track.monthsElapsed, track.additionalToDirected);
  return {
    id: track.id,
    type: track.type,
    balance: track.balance,
    marketAverageRate,
    referenceRate,
    grossCapitalizationFee: Math.max(0, gross),
    seniorityDiscount: discount,
    capitalizationFee,
    noticeFee,
    cpiFee,
    borrowerGainOffset: noticeOffset + cpiOffset,
    total: capitalizationFee + noticeFee + cpiFee,
    source: 'ESTIMATE',
    exemption,
    monthsToNextDiscount: gross > 0 ? step?.months : undefined,
    nextDiscount: gross > 0 ? step?.discount : undefined,
  };
}

/**
 * A quote built on the bank's stated fee. The statement prices a repayment on its own date without
 * advance notice, so the notice component (at most 0.1% of the balance) is taken back out when
 * notice will be given, and the average-CPI fee follows the chosen day rather than the statement's.
 * Everything else is the bank's figure.
 */
function statedQuote(
  track: ExistingTrack,
  marketAverageRate: number,
  options: PrepaymentOptions,
): TrackPrepaymentQuote {
  const meta = TRACKS[track.type];
  const stated = Math.max(0, track.statedFee ?? 0);
  const noticePart = Math.min(stated, track.balance * PREPAYMENT.NO_NOTICE_RATE);
  const monthlyCpi = Math.pow(1 + options.cpiAnnual, 1 / 12) - 1;
  const cpiEstimate =
    track.type !== 'ELIGIBILITY' && meta.cpiLinked ? Math.max(0, 0.5 * monthlyCpi * track.balance) : 0;
  // A statement dated on the 1st–15th already contains the average-CPI fee; take it out so the
  // remainder is the capitalization fee alone, then add it back only if the chosen day needs it.
  const statementIncludesCpi = (track.statedFeeDay ?? 31) <= PREPAYMENT.CPI_FEE_LAST_DAY;
  const withoutNotice = stated - noticePart;
  const capitalizationFee = statementIncludesCpi ? Math.max(0, withoutNotice - cpiEstimate) : withoutNotice;
  const noticeFee = options.noticeGiven ? 0 : noticePart;
  const cpiFee = options.dayOfMonth <= PREPAYMENT.CPI_FEE_LAST_DAY ? cpiEstimate : 0;
  return {
    id: track.id,
    type: track.type,
    balance: track.balance,
    marketAverageRate,
    referenceRate: Math.min(track.annualRate, track.originationAverageRate ?? track.annualRate),
    grossCapitalizationFee: capitalizationFee,
    seniorityDiscount: 0,
    capitalizationFee,
    noticeFee,
    cpiFee,
    borrowerGainOffset: 0,
    total: capitalizationFee + noticeFee + cpiFee,
    source: 'BANK',
    exemption: stated === 0 ? 'לפי דוח הבנק — אין עמלה במועד הדוח' : undefined,
  };
}

/** Quotes a full payoff of every track, adding the once-per-event operational fee. */
export function quotePrepayment(
  tracks: readonly ExistingTrack[],
  marketRateFor: (track: ExistingTrack) => number,
  options: PrepaymentOptions,
): PrepaymentQuote {
  const quotes = tracks
    .filter((track) => track.balance > 0)
    .map((track) => quoteTrack(track, marketRateFor(track), options));
  const sum = (pick: (quote: TrackPrepaymentQuote) => number) =>
    quotes.reduce((total, quote) => total + pick(quote), 0);
  const operationalFee = quotes.length > 0 ? PREPAYMENT.OPERATIONAL_FEE : 0;
  return {
    tracks: quotes,
    operationalFee,
    capitalizationFee: sum((q) => q.capitalizationFee),
    noticeFee: sum((q) => q.noticeFee),
    cpiFee: sum((q) => q.cpiFee),
    total: operationalFee + sum((q) => q.total),
  };
}
