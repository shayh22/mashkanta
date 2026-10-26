import type { ComplianceFinding, ComplianceLevel } from '../lib/types';
import { monthlyRate, payment as annuityPayment, presentValue } from './math';

/**
 * Consolidating household debt into a loan secured on the home (הלוואה לכל מטרה במשכון דירה),
 * tested against Directive 329 as amended by circular H-06-2840 (in force from 1 October 2026).
 *
 * The amendment that matters: the payment on loans already secured on the same property now sits in
 * the *numerator* of the payment-to-income ratio, next to the new payment, instead of reducing the
 * income in the denominator. Under a 50% ceiling every shekel already paid on the property removes
 * half a shekel more of capacity than it used to — which is why a household with a large existing
 * mortgage can find consolidation blocked, and why the tool shows the room left before the borrower
 * ever talks to a bank.
 */

export const CONSOLIDATION_LIMITS = {
  /** Loans with this many months left or fewer are left out of the payment-to-income test. */
  SHORT_TERM_MONTHS: 18,
  /** Directive 329 §5 — may not be underwritten above this. */
  PTI_REGULATORY: 0.5,
  /** Above this the bank carries a higher risk weight; the practical policy ceiling. */
  PTI_BANK_POLICY: 0.4,
  PTI_COMFORT: 0.3,
  /** Base LTV for a loan not used to buy property. */
  LTV_BASE: 0.5,
  /** §10a — up to 70%, provided the part above 50% does not exceed ₪200,000 (cumulative, FAQ 2.31). */
  LTV_RELIEF: 0.7,
  LTV_RELIEF_CAP: 200_000,
  /** §11 and §12.2 — all-purpose loans up to this cumulative amount are exempt from PTI and ⅔. */
  ALL_PURPOSE_EXEMPTION: 120_000,
  /** §7, tested on all credit secured by the property at the same bank (FAQ 5.1). */
  MAX_VARIABLE_SHARE: 2 / 3,
} as const;

export type DebtKind = 'CAR' | 'CREDIT_CARD' | 'NON_BANK' | 'OVERDRAFT' | 'BALLOON' | 'OTHER';

export const DEBT_KIND_LABELS: Record<DebtKind, string> = {
  CAR: 'הלוואת רכב',
  CREDIT_CARD: 'כרטיס אשראי / קרדיט',
  NON_BANK: 'הלוואה חוץ-בנקאית',
  OVERDRAFT: 'מינוס בעו"ש',
  BALLOON: 'בלון / גישור',
  OTHER: 'הלוואה צרכנית אחרת',
};

export interface ConsumerDebt {
  readonly id: string;
  readonly kind: DebtKind;
  readonly label: string;
  readonly balance: number;
  readonly annualRate: number;
  readonly monthlyPayment: number;
  readonly remainingMonths: number;
  /** Whether the borrower has chosen to fold this debt into the new loan. */
  readonly include: boolean;
}

/** What is already secured on the home. */
export interface PropertyPosition {
  readonly value: number;
  readonly mortgageBalance: number;
  readonly mortgagePayment: number;
  readonly mortgageRemainingMonths: number;
  /** The part of the mortgage at the same bank whose rate can change within five years. */
  readonly mortgageVariableBalance: number;
  /** All-purpose loans already taken against the home — they count toward the ₪120,000 exemption. */
  readonly priorAllPurposeBalance: number;
}

export interface ConsolidationTerms {
  readonly termMonths: number;
  /** All-in annual rate of the prime-linked part (prime + margin). */
  readonly variableRate: number;
  /** All-in annual rate of the fixed unlinked part. */
  readonly fixedRate: number;
  /** Share the borrower would like in the variable track, before the ⅔ rule cuts it. */
  readonly preferredVariableShare: number;
  /** Cash taken on top of the debts being repaid. */
  readonly extraCash: number;
  /** Opening, appraisal and lien registration, financed into the loan. */
  readonly closingCosts: number;
}

export interface ConsolidationInput {
  readonly netIncome: number;
  readonly debts: readonly ConsumerDebt[];
  readonly property: PropertyPosition;
  readonly terms: ConsolidationTerms;
}

export type DebtAction = 'CONSOLIDATE' | 'KEEP' | 'OPTIONAL';

export interface DebtRecommendation {
  readonly id: string;
  readonly action: DebtAction;
  readonly reason: string;
  readonly shortTerm: boolean;
}

export interface Allocation {
  readonly amount: number;
  readonly variableAmount: number;
  readonly fixedAmount: number;
  readonly variableRate: number;
  readonly fixedRate: number;
  readonly termMonths: number;
  readonly blendedRate: number;
  readonly variablePayment: number;
  readonly fixedPayment: number;
  readonly payment: number;
  /** True when the ⅔ rule forced part of the preferred variable share into the fixed track. */
  readonly variableCapped: boolean;
}

export type LtvStatus = 'BASE' | 'RELIEF' | 'EXCEEDED';

export interface RegulatoryCheck {
  readonly netIncome: number;
  /** F — unsecured obligations with more than 18 months left that stay in place. */
  readonly otherObligations: number;
  /** E — payment already secured on the property, when it has more than 18 months left. */
  readonly existingSecuredPayment: number;
  readonly disposableIncome: number;
  /** (P_new + E) / (N − F) — the October 2026 formula. */
  readonly pti: number;
  /** P_new / (N − F − E) — the formula it replaced, for comparison. */
  readonly legacyPti: number;
  readonly ptiExempt: boolean;
  readonly exemptionRemaining: number;
  /** c·(N − F) − E at the 50% regulatory ceiling. */
  readonly maxPaymentRegulatory: number;
  /** The same at the 40% bank policy ceiling. */
  readonly maxPaymentBank: number;
  /** c·(N − F − E) — the pre-amendment capacity at 50%. */
  readonly legacyMaxPaymentRegulatory: number;
  /** The loan the PTI room supports at the proposed rates and term (50% / 40%). */
  readonly creditRoomRegulatory: number;
  readonly creditRoomBank: number;
  readonly ltvBefore: number;
  readonly ltvAfter: number;
  readonly maxSecuredTotal: number;
  readonly ltvStatus: LtvStatus;
  readonly ltvRoom: number;
  /** Cumulative amount above 50% LTV — capped at ₪200,000. */
  readonly reliefUsed: number;
  readonly totalSecured: number;
  readonly maxVariableNew: number;
  readonly variableShareAfter: number;
  readonly variableExempt: boolean;
  /** The largest consolidation loan both the LTV and PTI tests allow (bank policy ceiling). */
  readonly maxFeasibleLoan: number;
  /** Passes every regulatory test. */
  readonly feasible: boolean;
  /** Also within the 40% bank policy ceiling. */
  readonly bankFeasible: boolean;
  readonly findings: readonly ComplianceFinding[];
}

export interface TimelinePoint {
  readonly month: number;
  readonly before: number;
  readonly after: number;
  readonly cumulativeBefore: number;
  readonly cumulativeAfter: number;
}

export interface ShorteningPoint {
  readonly share: number;
  readonly monthlyPayment: number;
  readonly months: number;
  readonly totalPaid: number;
}

export interface ConsolidationAnalysis {
  readonly included: readonly ConsumerDebt[];
  readonly kept: readonly ConsumerDebt[];
  readonly recommendations: readonly DebtRecommendation[];
  readonly allocation: Allocation;
  readonly regulation: RegulatoryCheck;
  readonly paymentBefore: number;
  readonly paymentAfter: number;
  /** "Oxygen": the immediate fall in the household's monthly payments. */
  readonly monthlyRelief: number;
  /** What is still owed on the consolidated debts if they ran to term. */
  readonly includedRemainingCost: number;
  readonly newLoanTotalPaid: number;
  /** newLoanTotalPaid − includedRemainingCost − extraCash: the price of spreading the debt out. */
  readonly extraLifetimeCost: number;
  readonly timeline: readonly TimelinePoint[];
  readonly shortening: readonly ShorteningPoint[];
  /** Smallest share of the relief that, paid back in, keeps the total at or below today's. */
  readonly breakEvenShare?: number;
}

/** A debt with 18 months or less left does not enter the payment-to-income test at all. */
export function isShortTerm(debt: Pick<ConsumerDebt, 'remainingMonths'>): boolean {
  return debt.remainingMonths <= CONSOLIDATION_LIMITS.SHORT_TERM_MONTHS;
}

/** The advice for one debt, given the blended rate the consolidation loan would carry. */
export function recommendDebt(debt: ConsumerDebt, consolidationRate: number): DebtRecommendation {
  const spread = debt.annualRate - consolidationRate;
  const revolving = debt.kind === 'CREDIT_CARD' || debt.kind === 'OVERDRAFT' || debt.kind === 'NON_BANK';
  if (isShortTerm(debt)) {
    if (spread >= 0.04 && revolving) {
      return {
        id: debt.id,
        action: 'OPTIONAL',
        shortTerm: true,
        reason: 'יקרה מאוד אך מסתיימת בקרוב ואינה נספרת ב-PTI — לאחד רק אם דרוש מרווח תזרימי מיידי.',
      };
    }
    return {
      id: debt.id,
      action: 'KEEP',
      shortTerm: true,
      reason: `נותרו ${debt.remainingMonths} חודשים — אינה נספרת במגבלת ה-PTI; עדיף לתת לה להיפרע באופן טבעי.`,
    };
  }
  if (spread > 0.005) {
    return {
      id: debt.id,
      action: 'CONSOLIDATE',
      shortTerm: false,
      reason: `ריבית גבוהה ב-${(spread * 100).toFixed(1)} נק' מההלוואה החדשה, וההחזר שלה נספר ב-PTI.`,
    };
  }
  return {
    id: debt.id,
    action: 'KEEP',
    shortTerm: false,
    reason: 'הריבית אינה גבוהה מההלוואה החדשה — איחוד רק יאריך את התקופה.',
  };
}

/** The ceiling on everything secured by the property: 50%, or 70% with at most ₪200,000 above 50%. */
export function maxSecuredTotal(value: number): number {
  const base = value * CONSOLIDATION_LIMITS.LTV_BASE;
  return Math.max(base, Math.min(value * CONSOLIDATION_LIMITS.LTV_RELIEF, base + CONSOLIDATION_LIMITS.LTV_RELIEF_CAP));
}

/** Payment ceiling for the new loan under the October 2026 formula: c·(N − F) − E. */
export function maxNewPayment(netIncome: number, otherObligations: number, existingSecured: number, ceiling: number): number {
  return Math.max(0, ceiling * (netIncome - otherObligations) - existingSecured);
}

/** The formula it replaced: c·(N − F − E). */
export function legacyMaxNewPayment(
  netIncome: number,
  otherObligations: number,
  existingSecured: number,
  ceiling: number,
): number {
  return Math.max(0, ceiling * (netIncome - otherObligations - existingSecured));
}

/** Most of a new loan that may be variable: ⅔ of all secured credit, less what is variable already. */
export function maxVariableForNewLoan(totalSecuredAfter: number, existingVariable: number): number {
  return Math.max(0, CONSOLIDATION_LIMITS.MAX_VARIABLE_SHARE * totalSecuredAfter - existingVariable);
}

function allocate(amount: number, terms: ConsolidationTerms, maxVariable: number): Allocation {
  const preferred = amount * Math.min(1, Math.max(0, terms.preferredVariableShare));
  const variableAmount = Math.min(preferred, maxVariable);
  const fixedAmount = Math.max(0, amount - variableAmount);
  const n = Math.max(1, terms.termMonths);
  const variablePayment = variableAmount > 0 ? annuityPayment(variableAmount, monthlyRate(terms.variableRate), n) : 0;
  const fixedPayment = fixedAmount > 0 ? annuityPayment(fixedAmount, monthlyRate(terms.fixedRate), n) : 0;
  return {
    amount,
    variableAmount,
    fixedAmount,
    variableRate: terms.variableRate,
    fixedRate: terms.fixedRate,
    termMonths: n,
    blendedRate: amount > 0 ? (variableAmount * terms.variableRate + fixedAmount * terms.fixedRate) / amount : terms.fixedRate,
    variablePayment,
    fixedPayment,
    payment: variablePayment + fixedPayment,
    variableCapped: variableAmount < preferred - 1e-6,
  };
}

const finding = (
  code: string,
  level: ComplianceLevel,
  title: string,
  message: string,
  actual: number,
  limit: number,
): ComplianceFinding => ({ code, level, title, message, actual, limit });

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const ils = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;

/** Every regulatory test on the proposed consolidation loan. */
export function checkRegulation(input: ConsolidationInput, allocation: Allocation): RegulatoryCheck {
  const { netIncome, property } = input;
  const L = allocation.amount;
  // Same definition as analyseConsolidation: a debt is only consolidated if it has a balance to repay.
  const kept = input.debts.filter((debt) => !debt.include || debt.balance <= 0);
  const F = kept.filter((debt) => !isShortTerm(debt)).reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const E = property.mortgageRemainingMonths > CONSOLIDATION_LIMITS.SHORT_TERM_MONTHS ? property.mortgagePayment : 0;
  const disposable = netIncome - F;
  const P = allocation.payment;

  const cumulativeAllPurpose = property.priorAllPurposeBalance + L;
  const ptiExempt = L > 0 && cumulativeAllPurpose <= CONSOLIDATION_LIMITS.ALL_PURPOSE_EXEMPTION;
  const exemptionRemaining = Math.max(0, CONSOLIDATION_LIMITS.ALL_PURPOSE_EXEMPTION - property.priorAllPurposeBalance);

  const pti = disposable > 0 ? (P + E) / disposable : Infinity;
  const legacyDenominator = disposable - E;
  const legacyPti = legacyDenominator > 0 ? P / legacyDenominator : Infinity;
  const maxPaymentRegulatory = maxNewPayment(netIncome, F, E, CONSOLIDATION_LIMITS.PTI_REGULATORY);
  const maxPaymentBank = maxNewPayment(netIncome, F, E, CONSOLIDATION_LIMITS.PTI_BANK_POLICY);
  const legacyMaxPaymentRegulatory = legacyMaxNewPayment(netIncome, F, E, CONSOLIDATION_LIMITS.PTI_REGULATORY);
  const r = monthlyRate(allocation.blendedRate);
  const creditRoomRegulatory = presentValue(maxPaymentRegulatory, r, allocation.termMonths);
  const creditRoomBank = presentValue(maxPaymentBank, r, allocation.termMonths);

  const securedBefore = property.mortgageBalance + property.priorAllPurposeBalance;
  const totalSecured = securedBefore + L;
  const ceiling = maxSecuredTotal(property.value);
  const ltvBefore = property.value > 0 ? securedBefore / property.value : Infinity;
  const ltvAfter = property.value > 0 ? totalSecured / property.value : Infinity;
  const ltvStatus: LtvStatus =
    totalSecured <= property.value * CONSOLIDATION_LIMITS.LTV_BASE + 1e-6
      ? 'BASE'
      : totalSecured <= ceiling + 1e-6
        ? 'RELIEF'
        : 'EXCEEDED';
  const ltvRoom = Math.max(0, ceiling - securedBefore);
  const reliefUsed = Math.max(0, totalSecured - property.value * CONSOLIDATION_LIMITS.LTV_BASE);

  const variableExempt = ptiExempt;
  const maxVariableNew = variableExempt ? L : maxVariableForNewLoan(totalSecured, property.mortgageVariableBalance);
  const variableShareAfter =
    totalSecured > 0 ? (property.mortgageVariableBalance + allocation.variableAmount) / totalSecured : 0;

  // The PTI room in loan terms; the exempt amount is always available up to the LTV room.
  const ptiLoanRoom = Math.max(creditRoomBank, exemptionRemaining);
  const maxFeasibleLoan = Math.min(ltvRoom, ptiLoanRoom);

  const findings: ComplianceFinding[] = [];
  findings.push(
    ltvStatus === 'EXCEEDED'
      ? finding(
          'CONS_LTV',
          'BLOCKING',
          'שיעור המימון המצטבר חורג',
          `סך האשראי על הנכס יגיע ל-${pct(ltvAfter)}. המותר: עד 50%, או עד 70% כשהחלק שמעל 50% אינו עולה על 200,000 ₪ — כלומר עד ${ils(ceiling)}. ניתן להוסיף עד ${ils(ltvRoom)}.`,
          ltvAfter,
          ceiling / Math.max(1, property.value),
        )
      : ltvStatus === 'RELIEF'
        ? finding(
            'CONS_LTV',
            'WARNING',
            'בתוך ההקלה של 70%',
            `שיעור המימון המצטבר ${pct(ltvAfter)} — מעל 50%, ולכן הבנק רשאי (ולא חייב) לאשר. נוצלו ${ils(reliefUsed)} מתוך 200,000 ₪ המותרים מעל 50%.`,
            ltvAfter,
            ceiling / Math.max(1, property.value),
          )
        : finding('CONS_LTV', 'OK', 'שיעור המימון המצטבר תקין', `סך האשראי על הנכס ${pct(ltvAfter)} — עד 50%.`, ltvAfter, 0.5),
  );

  if (ptiExempt) {
    findings.push(
      finding(
        'CONS_PTI',
        'OK',
        'פטור ממגבלת ה-PTI',
        `סך ההלוואות לכל מטרה על הנכס ${ils(cumulativeAllPurpose)} — עד 120,000 ₪ (סעיפים 11 ו-12.2), ולכן ההלוואה פטורה ממגבלת שיעור ההחזר ומתקרת ⅔ המשתנה.`,
        pti,
        CONSOLIDATION_LIMITS.PTI_REGULATORY,
      ),
    );
  } else {
    const level: ComplianceLevel =
      pti > CONSOLIDATION_LIMITS.PTI_REGULATORY ? 'BLOCKING' : pti > CONSOLIDATION_LIMITS.PTI_BANK_POLICY ? 'WARNING' : 'OK';
    findings.push(
      finding(
        'CONS_PTI',
        level,
        level === 'BLOCKING' ? 'שיעור ההחזר מעל 50%' : level === 'WARNING' ? 'שיעור ההחזר בין 40% ל-50%' : 'שיעור ההחזר תקין',
        `לפי הנוסחה מ-1.10.2026, (החזר חדש + החזר קיים על הנכס) ÷ (הכנסה − התחייבויות אחרות) = ${pct(pti)}. בנוסחה הקודמת: ${pct(legacyPti)}. מרווח ההחזר הפנוי בתקרת 40%: ${ils(maxPaymentBank)} בחודש.`,
        pti,
        level === 'OK' ? CONSOLIDATION_LIMITS.PTI_BANK_POLICY : CONSOLIDATION_LIMITS.PTI_REGULATORY,
      ),
    );
  }

  if (!variableExempt) {
    findings.push(
      allocation.variableCapped
        ? finding(
            'CONS_VARIABLE',
            'WARNING',
            'תקרת ⅔ משתנה הגבילה את המסלול',
            `על הנכס כבר ${ils(property.mortgageVariableBalance)} בריבית משתנה, ולכן מתוך ההלוואה החדשה עד ${ils(maxVariableNew)} יכולים להיות משתנים. היתר הוקצה לקבועה.`,
            variableShareAfter,
            CONSOLIDATION_LIMITS.MAX_VARIABLE_SHARE,
          )
        : finding(
            'CONS_VARIABLE',
            'OK',
            'עומד בתקרת ⅔ משתנה המצטברת',
            `חלק המשתנה מכלל האשראי על הנכס: ${pct(variableShareAfter)}.`,
            variableShareAfter,
            CONSOLIDATION_LIMITS.MAX_VARIABLE_SHARE,
          ),
    );
  }

  const ltvOk = ltvStatus !== 'EXCEEDED';
  const feasible = ltvOk && (ptiExempt || pti <= CONSOLIDATION_LIMITS.PTI_REGULATORY);
  const bankFeasible = ltvOk && (ptiExempt || pti <= CONSOLIDATION_LIMITS.PTI_BANK_POLICY);

  return {
    netIncome,
    otherObligations: F,
    existingSecuredPayment: E,
    disposableIncome: disposable,
    pti,
    legacyPti,
    ptiExempt,
    exemptionRemaining,
    maxPaymentRegulatory,
    maxPaymentBank,
    legacyMaxPaymentRegulatory,
    creditRoomRegulatory,
    creditRoomBank,
    ltvBefore,
    ltvAfter,
    maxSecuredTotal: ceiling,
    ltvStatus,
    ltvRoom,
    reliefUsed,
    totalSecured,
    maxVariableNew,
    variableShareAfter,
    variableExempt,
    maxFeasibleLoan,
    feasible,
    bankFeasible,
    findings,
  };
}

/**
 * Repays the consolidation loan with an extra amount every month on top of the scheduled payment.
 *
 * The extra goes to the prime track first — prepaying prime carries no capitalization fee, while
 * prepaying a fixed track can — and only then to the fixed track.
 */
export function repayWithExtra(allocation: Allocation, extra: number): { months: number; totalPaid: number } {
  let variable = allocation.variableAmount;
  let fixed = allocation.fixedAmount;
  const rv = monthlyRate(allocation.variableRate);
  const rf = monthlyRate(allocation.fixedRate);
  let totalPaid = 0;
  let month = 0;
  const limit = allocation.termMonths;

  while ((variable > 0.005 || fixed > 0.005) && month < limit) {
    month++;
    variable *= 1 + rv;
    fixed *= 1 + rf;
    // The scheduled payment stays where it was and the term shortens — what an Israeli bank does
    // after a partial prepayment unless the borrower asks for a lower payment instead.
    const variableDue = Math.min(variable, allocation.variablePayment);
    const fixedDue = Math.min(fixed, allocation.fixedPayment);
    variable -= variableDue;
    fixed -= fixedDue;
    // A track that is paid off frees its payment for the other, so the monthly outlay stays level.
    const budget = allocation.payment + extra;
    let spare = budget - variableDue - fixedDue;
    const toVariable = Math.min(variable, spare);
    variable -= toVariable;
    spare -= toVariable;
    const toFixed = Math.min(fixed, spare);
    fixed -= toFixed;
    spare -= toFixed;
    totalPaid += budget - spare;
  }
  return { months: month, totalPaid };
}

/** Runs the whole consolidation analysis. */
export function analyseConsolidation(input: ConsolidationInput): ConsolidationAnalysis {
  const included = input.debts.filter((debt) => debt.include && debt.balance > 0);
  const kept = input.debts.filter((debt) => !debt.include || debt.balance <= 0);
  const amount =
    included.reduce((sum, debt) => sum + debt.balance, 0) + input.terms.extraCash + input.terms.closingCosts;

  const property = input.property;
  const totalSecured = property.mortgageBalance + property.priorAllPurposeBalance + amount;
  const exempt = amount > 0 && property.priorAllPurposeBalance + amount <= CONSOLIDATION_LIMITS.ALL_PURPOSE_EXEMPTION;
  const maxVariable = exempt ? amount : maxVariableForNewLoan(totalSecured, property.mortgageVariableBalance);
  const allocation = allocate(amount, input.terms, maxVariable);
  const regulation = checkRegulation(input, allocation);

  const recommendations = input.debts.map((debt) => recommendDebt(debt, allocation.blendedRate));

  const allDebtPayments = input.debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const keptPayments = kept.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const paymentBefore = property.mortgagePayment + allDebtPayments;
  const paymentAfter = property.mortgagePayment + keptPayments + allocation.payment;

  const includedRemainingCost = included.reduce((sum, debt) => sum + debt.monthlyPayment * debt.remainingMonths, 0);
  const newLoanTotalPaid = allocation.payment * allocation.termMonths;
  const extraLifetimeCost = newLoanTotalPaid - includedRemainingCost - input.terms.extraCash;

  const horizon = Math.max(
    allocation.termMonths,
    property.mortgageRemainingMonths,
    ...input.debts.map((debt) => debt.remainingMonths),
  );
  const timeline: TimelinePoint[] = [];
  let cumulativeBefore = 0;
  let cumulativeAfter = 0;
  for (let month = 1; month <= horizon; month++) {
    const mortgage = month <= property.mortgageRemainingMonths ? property.mortgagePayment : 0;
    const debtsDue = (list: readonly ConsumerDebt[]) =>
      list.reduce((sum, debt) => sum + (month <= debt.remainingMonths ? debt.monthlyPayment : 0), 0);
    const before = mortgage + debtsDue(input.debts);
    const after = mortgage + debtsDue(kept) + (month <= allocation.termMonths ? allocation.payment : 0);
    cumulativeBefore += before;
    cumulativeAfter += after;
    timeline.push({ month, before, after, cumulativeBefore, cumulativeAfter });
  }

  const relief = paymentBefore - paymentAfter;
  const shortening: ShorteningPoint[] = [];
  let breakEvenShare: number | undefined;
  if (amount > 0) {
    const target = includedRemainingCost + input.terms.extraCash;
    const costAt = (share: number) => repayWithExtra(allocation, Math.max(0, relief) * share);
    for (let step = 0; step <= 10; step++) {
      const share = step / 10;
      const result = costAt(share);
      shortening.push({
        share,
        monthlyPayment: allocation.payment + Math.max(0, relief) * share,
        months: result.months,
        totalPaid: result.totalPaid,
      });
    }
    if (costAt(0).totalPaid <= target) {
      breakEvenShare = 0;
    } else if (relief > 0 && costAt(1).totalPaid <= target) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (costAt(mid).totalPaid <= target) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      breakEvenShare = hi;
    }
  }

  return {
    included,
    kept,
    recommendations,
    allocation,
    regulation,
    paymentBefore,
    paymentAfter,
    monthlyRelief: relief,
    includedRemainingCost,
    newLoanTotalPaid,
    extraLifetimeCost,
    timeline,
    shortening,
    breakEvenShare,
  };
}
