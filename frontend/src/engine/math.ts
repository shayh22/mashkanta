/**
 * Numeric kernel shared by the amortization engine.
 *
 * Ported from the Java `MortgageMath`. Kept free of any browser or platform dependency so the
 * same module runs in the browser today and inside a Worker if the calculation ever moves
 * server-side.
 */

const IRR_TOLERANCE = 1e-10;
const IRR_MAX_ITERATIONS = 200;

/**
 * Level annuity payment (לוח שפיצר).
 *
 * @param balance outstanding principal
 * @param monthlyRate periodic rate, may be zero
 * @param remainingMonths payments still to be made, at least one
 */
export function payment(balance: number, monthlyRate: number, remainingMonths: number): number {
  if (remainingMonths <= 0) {
    return balance;
  }
  if (Math.abs(monthlyRate) < 1e-12) {
    return balance / remainingMonths;
  }
  const growth = Math.pow(1 + monthlyRate, remainingMonths);
  return (balance * monthlyRate * growth) / (growth - 1);
}

/** Present value of a level annuity — the inverse of {@link payment}. */
export function presentValue(pmt: number, monthlyRate: number, months: number): number {
  if (months <= 0) {
    return 0;
  }
  if (Math.abs(monthlyRate) < 1e-12) {
    return pmt * months;
  }
  return (pmt * (1 - Math.pow(1 + monthlyRate, -months))) / monthlyRate;
}

/** Converts an annual nominal rate quoted monthly into its periodic equivalent. */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Compounds a periodic rate into its effective annual equivalent. */
export function annualise(periodicRate: number): number {
  return Math.pow(1 + periodicRate, 12) - 1;
}

/** Net present value of the loan cash flows at the given periodic discount rate. */
export function npv(proceeds: number, payments: readonly number[], periodicRate: number): number {
  let total = proceeds;
  let discount = 1;
  const factor = 1 / (1 + periodicRate);
  for (const value of payments) {
    discount *= factor;
    total -= value * discount;
  }
  return total;
}

/**
 * Effective annual internal rate of return of a loan: money in at t0, payments out monthly.
 *
 * Solved by bisection rather than Newton — the payment vector of an indexed mortgage is not
 * smooth, and bisection cannot diverge on the single sign change these cash flows have.
 *
 * @returns the effective annual rate, or 0 when the cash flows have no solution
 */
export function irr(proceeds: number, payments: readonly number[]): number {
  if (proceeds <= 0 || payments.length === 0) {
    return 0;
  }
  let lo = -0.9 / 12;
  let hi = 1.0;
  let fLo = npv(proceeds, payments, lo);
  const fHi = npv(proceeds, payments, hi);
  if (fLo * fHi > 0) {
    return 0;
  }
  for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(proceeds, payments, mid);
    if (Math.abs(fMid) < IRR_TOLERANCE || hi - lo < IRR_TOLERANCE) {
      return annualise(mid);
    }
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return annualise((lo + hi) / 2);
}

/** Rounds to agorot for presentation. The engine itself never rounds mid-calculation. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Rounds a rate to one hundredth of a percentage point. */
export function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
