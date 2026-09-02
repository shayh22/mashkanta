import type { AmortizationMethod, TrackType } from '../lib/types';
import { irr, monthlyRate, payment as annuityPayment } from './math';
import { monthlyInflationAt, type MacroScenario } from './scenario';
import { annualRateAt, initialRate, TRACKS, type TrackSpec } from './tracks';

/** A single month of an amortization table. */
export interface ScheduleRow {
  readonly month: number;
  readonly openingBalance: number;
  readonly indexation: number;
  readonly interest: number;
  readonly principal: number;
  readonly payment: number;
  readonly closingBalance: number;
  readonly annualRate: number;
}

/** The priced outcome of a single track under one macro scenario. */
export interface TrackResult {
  readonly type: TrackType;
  readonly method: AmortizationMethod;
  readonly amount: number;
  readonly termMonths: number;
  readonly initialRate: number;
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly finalPayment: number;
  readonly totalPaid: number;
  readonly totalInterest: number;
  readonly totalIndexation: number;
  readonly nominalIrr: number;
  readonly realIrr: number;
  readonly schedule: readonly ScheduleRow[];
}

/**
 * Prices one track along the supplied macro path.
 *
 * Every schedule is built the same way regardless of track: index the balance, accrue interest on
 * the indexed balance, then apply the method's payment rule. Because the Spitzer payment is
 * recomputed from the live balance and rate every month, a fixed non-linked track naturally
 * produces a flat payment while a linked or prime track produces the growing payment Israeli
 * borrowers see — no special cases needed.
 */
export function priceTrack(spec: TrackSpec, scenario: MacroScenario): TrackResult {
  const n = spec.termMonths;
  const meta = TRACKS[spec.type];
  const schedule: ScheduleRow[] = [];
  const payments = new Array<number>(n);

  let balance = spec.amount;
  let totalInterest = 0;
  let totalIndexation = 0;
  let totalPaid = 0;
  let maxPayment = 0;

  for (let month = 1; month <= n; month++) {
    const annualRate = annualRateAt(spec, month, scenario);
    const periodic = monthlyRate(annualRate);
    const opening = balance;

    let indexation = 0;
    if (meta.cpiLinked) {
      indexation = balance * monthlyInflationAt(scenario, month);
      balance += indexation;
      totalIndexation += indexation;
    }

    const interest = balance * periodic;
    const remaining = n - month + 1;
    let pmt: number;
    let principal: number;

    switch (spec.method) {
      case 'BALLOON':
        if (month < n) {
          // Nothing is paid; interest capitalises into the balance.
          pmt = 0;
          principal = -interest;
        } else {
          pmt = balance + interest;
          principal = balance;
        }
        break;
      case 'GRACE':
        if (month <= spec.graceMonths) {
          pmt = interest;
          principal = 0;
        } else {
          pmt = annuityPayment(balance, periodic, remaining);
          principal = pmt - interest;
        }
        break;
      case 'EQUAL_PRINCIPAL':
        principal = balance / remaining;
        pmt = principal + interest;
        break;
      case 'SPITZER':
      default:
        pmt = annuityPayment(balance, periodic, remaining);
        principal = pmt - interest;
        break;
    }

    balance -= principal;
    if (month === n) {
      // Absorb the accumulated floating-point residue into the final payment.
      pmt += balance;
      principal += balance;
      balance = 0;
    }

    totalInterest += interest;
    totalPaid += pmt;
    payments[month - 1] = pmt;
    maxPayment = Math.max(maxPayment, pmt);

    schedule.push({
      month,
      openingBalance: opening,
      indexation,
      interest,
      principal,
      payment: pmt,
      closingBalance: balance,
      annualRate,
    });
  }

  return {
    type: spec.type,
    method: spec.method,
    amount: spec.amount,
    termMonths: n,
    initialRate: initialRate(spec, scenario),
    initialPayment: payments[0] ?? 0,
    maxPayment,
    finalPayment: payments[n - 1] ?? 0,
    totalPaid,
    totalInterest,
    totalIndexation,
    nominalIrr: irr(spec.amount, payments),
    realIrr: irr(spec.amount, deflate(payments, scenario)),
    schedule,
  };
}

/** Restates nominal payments in origination-date shekels so the real cost is comparable. */
function deflate(payments: readonly number[], scenario: MacroScenario): number[] {
  const real = new Array<number>(payments.length);
  let deflator = 1;
  for (let i = 0; i < payments.length; i++) {
    deflator *= 1 + monthlyInflationAt(scenario, i + 1);
    real[i] = (payments[i] ?? 0) / deflator;
  }
  return real;
}

/** One year of the amortization chart. */
export interface YearPoint {
  readonly year: number;
  readonly remainingBalance: number;
  readonly averageMonthlyPayment: number;
  readonly interestPaid: number;
  readonly indexationAccrued: number;
  readonly cumulativeInterest: number;
  readonly cumulativeIndexation: number;
  readonly cumulativePaid: number;
}

/** The aggregate view of a multi-track mix: the household's actual monthly cash flow. */
export interface MixResult {
  readonly tracks: readonly TrackResult[];
  readonly totalPrincipal: number;
  /** The longest track term — how long the household carries a payment. */
  readonly termMonths: number;
  readonly combinedPayments: readonly number[];
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly maxPaymentMonth: number;
  readonly totalPaid: number;
  readonly totalInterest: number;
  readonly totalIndexation: number;
  readonly nominalIrr: number;
  readonly realIrr: number;
  readonly weightedInitialRate: number;
}

/**
 * Prices a whole mix. Tracks are priced independently and then summed month by month, which is
 * exactly how a multi-track Israeli mortgage behaves — each track has its own rate and term.
 */
export function priceMix(specs: readonly TrackSpec[], scenario: MacroScenario): MixResult {
  const tracks: TrackResult[] = [];
  let horizon = 0;
  let principal = 0;

  for (const spec of specs) {
    if (spec.amount <= 0) {
      continue;
    }
    tracks.push(priceTrack(spec, scenario));
    horizon = Math.max(horizon, spec.termMonths);
    principal += spec.amount;
  }

  const combined = new Array<number>(horizon).fill(0);
  let totalPaid = 0;
  let totalInterest = 0;
  let totalIndexation = 0;
  let weightedRate = 0;

  for (const track of tracks) {
    for (const row of track.schedule) {
      combined[row.month - 1] = (combined[row.month - 1] ?? 0) + row.payment;
    }
    totalPaid += track.totalPaid;
    totalInterest += track.totalInterest;
    totalIndexation += track.totalIndexation;
    weightedRate += track.initialRate * track.amount;
  }
  weightedRate = principal > 0 ? weightedRate / principal : 0;

  let max = 0;
  let maxMonth = 1;
  for (let i = 0; i < combined.length; i++) {
    const value = combined[i] ?? 0;
    if (value > max) {
      max = value;
      maxMonth = i + 1;
    }
  }

  const real = new Array<number>(combined.length);
  let deflator = 1;
  for (let i = 0; i < combined.length; i++) {
    deflator *= 1 + monthlyInflationAt(scenario, i + 1);
    real[i] = (combined[i] ?? 0) / deflator;
  }

  return {
    tracks,
    totalPrincipal: principal,
    termMonths: horizon,
    combinedPayments: combined,
    initialPayment: combined[0] ?? 0,
    maxPayment: max,
    maxPaymentMonth: maxMonth,
    totalPaid,
    totalInterest,
    totalIndexation,
    nominalIrr: irr(principal, combined),
    realIrr: irr(principal, real),
    weightedInitialRate: weightedRate,
  };
}

/** Total payment in the given 1-based month, or zero once the mix is fully repaid. */
export function paymentAt(mix: MixResult, month: number): number {
  if (month < 1 || month > mix.combinedPayments.length) {
    return 0;
  }
  return mix.combinedPayments[month - 1] ?? 0;
}

/** Share of principal sitting in tracks matching the predicate — used for regulatory checks. */
export function shareOf(mix: MixResult, predicate: (track: TrackResult) => boolean): number {
  if (mix.totalPrincipal <= 0) {
    return 0;
  }
  let sum = 0;
  for (const track of mix.tracks) {
    if (predicate(track)) {
      sum += track.amount;
    }
  }
  return sum / mix.totalPrincipal;
}

/** Yearly roll-up of the combined cash flow, which is what the amortization chart plots. */
export function yearlySummary(mix: MixResult): YearPoint[] {
  const points: YearPoint[] = [];
  const years = Math.ceil(mix.termMonths / 12);
  let cumulativeInterest = 0;
  let cumulativeIndexation = 0;
  let cumulativePaid = 0;

  for (let year = 1; year <= years; year++) {
    const from = (year - 1) * 12 + 1;
    const to = Math.min(year * 12, mix.termMonths);
    let interest = 0;
    let indexation = 0;
    let paid = 0;
    let balance = 0;

    for (const track of mix.tracks) {
      const boundary = Math.min(to, track.termMonths);
      for (const row of track.schedule) {
        if (row.month >= from && row.month <= to) {
          interest += row.interest;
          indexation += row.indexation;
          paid += row.payment;
        }
        if (row.month === boundary) {
          balance += row.closingBalance;
        }
      }
    }

    cumulativeInterest += interest;
    cumulativeIndexation += indexation;
    cumulativePaid += paid;

    points.push({
      year,
      remainingBalance: balance,
      averageMonthlyPayment: to >= from ? paid / (to - from + 1) : 0,
      interestPaid: interest,
      indexationAccrued: indexation,
      cumulativeInterest,
      cumulativeIndexation,
      cumulativePaid,
    });
  }
  return points;
}
