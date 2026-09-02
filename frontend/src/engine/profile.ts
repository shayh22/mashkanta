import type { BuyerSegment, LiquidityEvent } from '../lib/types';
import { LIMITS, SEGMENT_MAX_LTV } from './regulatory';

/** Everything the onboarding wizard collects, in one value. */
export interface BorrowerProfile {
  readonly propertyValue: number;
  readonly loanAmount: number;
  readonly termMonths: number;
  readonly segment: BuyerSegment;
  readonly monthlyNetIncome: number;
  readonly existingMonthlyObligations: number;
  /** 1 (ultra conservative) to 10 (dynamic). */
  readonly riskTolerance: number;
  /** Shekels of monthly payment increase the household can absorb. */
  readonly volatilityCapacity: number;
  readonly liquidityEvents: readonly LiquidityEvent[];
  readonly primePreference: number;
  readonly stablePreference: number;
  readonly dynamicPreference: number;
  readonly eligibilityAmount: number;
  readonly eligibilityRate: number;
}

export function ltvOf(borrower: BorrowerProfile): number {
  return borrower.loanAmount / borrower.propertyValue;
}

export function maxLtvOf(borrower: BorrowerProfile): number {
  return SEGMENT_MAX_LTV[borrower.segment];
}

/** Income left for a mortgage payment once existing obligations are served. */
export function disposableIncome(borrower: BorrowerProfile): number {
  return Math.max(0, borrower.monthlyNetIncome - borrower.existingMonthlyObligations);
}

/** The largest month-1 payment that keeps total obligations inside the 40% ceiling. */
export function maxAffordablePayment(borrower: BorrowerProfile): number {
  return Math.max(0, borrower.monthlyNetIncome * LIMITS.PTI_CEILING - borrower.existingMonthlyObligations);
}

/** The largest month-1 payment that stays inside the 30% comfort band. */
export function comfortablePayment(borrower: BorrowerProfile): number {
  return Math.max(0, borrower.monthlyNetIncome * LIMITS.PTI_WARNING - borrower.existingMonthlyObligations);
}

/** The earliest lump sum earmarked for prepayment, or undefined when there is none. */
export function firstPrepaymentEvent(borrower: BorrowerProfile): LiquidityEvent | undefined {
  return borrower.liquidityEvents
    .filter((event) => event.earmarkedForPrepayment)
    .sort((a, b) => a.month - b.month)[0];
}

/** The borrower's tolerance translated into the weights and caps the optimizer consumes. */
export interface RiskProfile {
  readonly riskTolerance: number;
  readonly costWeight: number;
  readonly riskWeight: number;
  readonly cpiAversion: number;
  readonly maxVariableShare: number;
  readonly maxPrimeShare: number;
  readonly volatilityCapacity: number;
  /** Month of the first lump sum earmarked for prepayment, 0 when none. */
  readonly prepaymentHorizon: number;
  readonly narrative: string;
}

/** Fraction of disposable income assumed absorbable when the borrower states no capacity. */
const IMPLIED_CAPACITY_SHARE = 0.05;

/**
 * Turns the onboarding answers into an optimizer-ready risk vector.
 *
 * The mapping is deliberately monotonic and explainable: a borrower who moves one notch up the
 * tolerance slider always gets a higher cost weight and a looser variable cap, never a surprise.
 * Affordability then overrides stated tolerance — a household with no room in its budget is capped
 * regardless of how adventurous it says it feels.
 */
export function profileRisk(borrower: BorrowerProfile): RiskProfile {
  const normalized = (borrower.riskTolerance - 1) / 9;

  const costWeight = 0.35 + 0.5 * normalized;
  const cpiAversion = 1 - 0.7 * normalized;

  let maxVariableShare = Math.min(LIMITS.MAX_VARIABLE_SHARE, 0.2 + 0.5 * normalized);
  let maxPrimeShare = Math.min(LIMITS.MAX_PRIME_SHARE, 0.2 + 0.5 * normalized);

  const capacity =
    borrower.volatilityCapacity > 0
      ? borrower.volatilityCapacity
      : disposableIncome(borrower) * IMPLIED_CAPACITY_SHARE;

  // A thin budget is a hard constraint, not a preference: tighten the caps whatever was said.
  if (comfortablePayment(borrower) <= 0) {
    maxVariableShare = Math.min(maxVariableShare, 0.25);
    maxPrimeShare = Math.min(maxPrimeShare, 0.25);
  }

  const prepaymentHorizon = firstPrepaymentEvent(borrower)?.month ?? 0;

  return {
    riskTolerance: borrower.riskTolerance,
    costWeight,
    riskWeight: 1 - costWeight,
    cpiAversion,
    maxVariableShare,
    maxPrimeShare,
    volatilityCapacity: capacity,
    prepaymentHorizon,
    narrative: narrative(borrower, normalized, capacity, prepaymentHorizon),
  };
}

function narrative(
  borrower: BorrowerProfile,
  normalized: number,
  capacity: number,
  prepaymentHorizon: number,
): string {
  const parts: string[] = [];
  if (normalized <= 0.25) {
    parts.push('פרופיל שמרני: העדפה לוודאות תשלום על פני חיסכון בריבית.');
  } else if (normalized <= 0.65) {
    parts.push('פרופיל מאוזן: שילוב של ודאות בחלק מהתמהיל וניצול מסלולים משתנים בחלק האחר.');
  } else {
    parts.push('פרופיל דינמי: נכונות לספוג תנודתיות בהחזר החודשי בתמורה לעלות כוללת נמוכה יותר.');
  }
  parts.push(`יכולת ספיגה חודשית של כ-${Math.round(capacity).toLocaleString('he-IL')} ₪ מעל ההחזר הבסיסי.`);
  if (prepaymentHorizon > 0) {
    parts.push(
      `צפוי פירעון חלקי בחודש ${prepaymentHorizon}, ולכן ניתן משקל נמוך יותר למסלולים עם עמלת היוון.`,
    );
  }
  if (borrower.eligibilityAmount > 0) {
    parts.push('נלקחה בחשבון הלוואת זכאות ממשרד הבינוי והשיכון.');
  }
  return parts.join(' ');
}

/** True when the borrower expects to repay a meaningful chunk early. */
export function expectsEarlyRepayment(risk: RiskProfile): boolean {
  return risk.prepaymentHorizon > 0;
}
