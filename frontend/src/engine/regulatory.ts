import type { BuyerSegment, ComplianceFinding, ComplianceLevel, ComplianceReport } from '../lib/types';
import { shareOf, type MixResult } from './amortization';
import { isFixedForRegulation, TRACKS } from './tracks';
import type { BorrowerProfile } from './profile';

/**
 * The hard numbers behind Bank of Israel Proper Conduct of Banking Business Directives 329 and 451,
 * in one place so a regulatory change is a one-line edit rather than a hunt through the engine.
 */
export const LIMITS = {
  /** Payment-to-income above which the bank prices a risk premium and needs an exception. */
  PTI_WARNING: 0.3,
  /** Payment-to-income that may not be underwritten at all. */
  PTI_CEILING: 0.4,
  MAX_TERM_MONTHS: 30 * 12,
  MIN_TERM_MONTHS: 4 * 12,
  /** Largest share of the loan that may sit in the prime track. */
  MAX_PRIME_SHARE: 2 / 3,
  /** Largest share whose rate may change within five years. */
  MAX_VARIABLE_SHARE: 2 / 3,
  /** Smallest share that must stay fixed until maturity. */
  MIN_FIXED_SHARE: 1 / 3,
  /** Tolerance applied to share tests so 33.33% does not fail a 1/3 floor. */
  SHARE_TOLERANCE: 0.005,
} as const;

/** The regulatory LTV ceiling per borrower segment. */
export const SEGMENT_MAX_LTV: Record<BuyerSegment, number> = {
  FIRST_HOME: 0.75,
  UPGRADER: 0.7,
  INVESTOR: 0.5,
  REFINANCE: 0.7,
};

export const SEGMENT_NAMES: Record<BuyerSegment, string> = {
  FIRST_HOME: 'רוכשי דירה ראשונה',
  UPGRADER: 'משפרי דיור',
  INVESTOR: 'משקיעי נדל"ן',
  REFINANCE: 'ממחזרי משכנתא',
};

/** How near the LTV ceiling counts as "close enough to warn about". */
const LTV_WARNING_BAND = 0.025;

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const shekels = (value: number) => Math.round(value).toLocaleString('he-IL');

function finding(
  code: string,
  level: ComplianceLevel,
  title: string,
  message: string,
  actual: number,
  limit: number,
): ComplianceFinding {
  return { code, level, title, message, actual, limit };
}

/**
 * Enforces the Bank of Israel constraints a proposal must satisfy before a bank can underwrite it.
 *
 * Checks are reported rather than thrown: the borrower is entitled to see a non-compliant mix and
 * understand exactly which line breaks it, which is the whole point of the platform.
 */
export function validate(
  borrower: BorrowerProfile,
  mix: MixResult,
  stressedPayment: number,
): ComplianceReport {
  const findings: ComplianceFinding[] = [];

  const ltv = borrower.loanAmount / borrower.propertyValue;
  const maxLtv = SEGMENT_MAX_LTV[borrower.segment];
  findings.push(ltvFinding(ltv, maxLtv, borrower));

  const income = borrower.monthlyNetIncome;
  const pti = mix.initialPayment / income;
  const dti = (mix.initialPayment + borrower.existingMonthlyObligations) / income;
  const stressedPti = (stressedPayment + borrower.existingMonthlyObligations) / income;

  findings.push(dtiFinding(dti));
  findings.push(stressFinding(stressedPti));
  findings.push(termFinding(mix.termMonths));
  findings.push(primeShareFinding(mix));
  findings.push(variableShareFinding(mix));
  findings.push(fixedFloorFinding(mix));

  const order: ComplianceLevel[] = ['OK', 'WARNING', 'BLOCKING'];
  const level = findings.reduce<ComplianceLevel>(
    (worst, item) => (order.indexOf(item.level) > order.indexOf(worst) ? item.level : worst),
    'OK',
  );

  return { ltv, maxLtv, pti, stressedPti, dti, level, findings, underwritable: level !== 'BLOCKING' };
}

function ltvFinding(ltv: number, maxLtv: number, borrower: BorrowerProfile): ComplianceFinding {
  const title = 'שיעור מימון (LTV)';
  if (ltv > maxLtv + 1e-9) {
    const maxLoan = borrower.propertyValue * maxLtv;
    return finding(
      'LTV',
      'BLOCKING',
      title,
      `שיעור המימון ${percent(ltv)} חורג מהתקרה של ${percent(maxLtv, 0)} שנקבעה על ידי בנק ישראל עבור ${SEGMENT_NAMES[borrower.segment]}. סכום ההלוואה המרבי הוא ${shekels(maxLoan)} ₪.`,
      ltv,
      maxLtv,
    );
  }
  // "Close to the ceiling" has to mean close, or the warning fires on ordinary deals and
  // borrowers learn to ignore it.
  if (ltv > maxLtv - LTV_WARNING_BAND) {
    return finding(
      'LTV',
      'WARNING',
      title,
      `שיעור המימון ${percent(ltv)} קרוב מאוד לתקרה של ${percent(maxLtv, 0)}. בשיעורי מימון גבוהים הבנקים מתמחרים פרמיית סיכון.`,
      ltv,
      maxLtv,
    );
  }
  return finding(
    'LTV',
    'OK',
    title,
    `שיעור המימון ${percent(ltv)} נמצא בטווח התקין (עד ${percent(maxLtv, 0)}).`,
    ltv,
    maxLtv,
  );
}

function dtiFinding(dti: number): ComplianceFinding {
  const title = 'יחס החזר מהכנסה (DTI)';
  if (dti > LIMITS.PTI_CEILING + 1e-9) {
    return finding(
      'DTI',
      'BLOCKING',
      title,
      `ההחזר החודשי מהווה ${percent(dti)} מההכנסה נטו, מעל התקרה הרגולטורית של 40%. הבנק לא יוכל לאשר את ההלוואה במתכונת זו.`,
      dti,
      LIMITS.PTI_CEILING,
    );
  }
  if (dti > LIMITS.PTI_WARNING) {
    return finding(
      'DTI',
      'WARNING',
      title,
      `ההחזר החודשי מהווה ${percent(dti)} מההכנסה נטו. מעל 30% נדרש אישור חריג והתמחור מתייקר.`,
      dti,
      LIMITS.PTI_WARNING,
    );
  }
  return finding(
    'DTI',
    'OK',
    title,
    `ההחזר החודשי מהווה ${percent(dti)} מההכנסה נטו — בתוך האזור הירוק (עד 30%).`,
    dti,
    LIMITS.PTI_WARNING,
  );
}

function stressFinding(stressedPti: number): ComplianceFinding {
  const title = 'עמידות בתרחיש קיצון';
  if (stressedPti > LIMITS.PTI_CEILING) {
    return finding(
      'DTI_STRESS',
      'WARNING',
      title,
      `בתרחיש הקיצון החמור ההחזר מגיע ל-${percent(stressedPti)} מההכנסה, מעל התקרה של 40%.`,
      stressedPti,
      LIMITS.PTI_CEILING,
    );
  }
  return finding(
    'DTI_STRESS',
    'OK',
    title,
    `גם בתרחיש הקיצון החמור ההחזר נשאר על ${percent(stressedPti)} מההכנסה.`,
    stressedPti,
    LIMITS.PTI_CEILING,
  );
}

function termFinding(termMonths: number): ComplianceFinding {
  const title = 'תקופת ההלוואה';
  const years = termMonths / 12;
  if (termMonths > LIMITS.MAX_TERM_MONTHS) {
    return finding('TERM', 'BLOCKING', title, `תקופה של ${years.toFixed(1)} שנים חורגת מהמקסימום של 30 שנה.`, years, 30);
  }
  return finding('TERM', 'OK', title, `תקופת ההלוואה ${years.toFixed(0)} שנים, בתוך המותר (עד 30 שנה).`, years, 30);
}

function primeShareFinding(mix: MixResult): ComplianceFinding {
  const share = shareOf(mix, (track) => track.type === 'PRIME');
  const title = 'מרכיב הפריים';
  if (share > LIMITS.MAX_PRIME_SHARE + LIMITS.SHARE_TOLERANCE) {
    return finding(
      'PRIME_SHARE',
      'BLOCKING',
      title,
      `מסלול הפריים מהווה ${percent(share)} מההלוואה, מעל התקרה של 66.7%.`,
      share,
      LIMITS.MAX_PRIME_SHARE,
    );
  }
  return finding(
    'PRIME_SHARE',
    'OK',
    title,
    `מסלול הפריים מהווה ${percent(share)} מההלוואה, בתוך המגבלה של 66.7%.`,
    share,
    LIMITS.MAX_PRIME_SHARE,
  );
}

function variableShareFinding(mix: MixResult): ComplianceFinding {
  const share = shareOf(mix, (track) => TRACKS[track.type].variableRate);
  const title = 'מרכיב בריבית משתנה';
  if (share > LIMITS.MAX_VARIABLE_SHARE + LIMITS.SHARE_TOLERANCE) {
    return finding(
      'VARIABLE_SHARE',
      'BLOCKING',
      title,
      `החלק שהריבית בו משתנה בתוך פחות מ-5 שנים מהווה ${percent(share)}, מעל התקרה של 66.7%.`,
      share,
      LIMITS.MAX_VARIABLE_SHARE,
    );
  }
  return finding(
    'VARIABLE_SHARE',
    'OK',
    title,
    `המרכיב המשתנה מהווה ${percent(share)} מההלוואה, בתוך המגבלה של 66.7%.`,
    share,
    LIMITS.MAX_VARIABLE_SHARE,
  );
}

function fixedFloorFinding(mix: MixResult): ComplianceFinding {
  const share = shareOf(mix, (track) => isFixedForRegulation(track.type));
  const title = 'רכיב ריבית קבועה';
  if (share < LIMITS.MIN_FIXED_SHARE - LIMITS.SHARE_TOLERANCE) {
    return finding(
      'FIXED_FLOOR',
      'BLOCKING',
      title,
      `רק ${percent(share)} מההלוואה בריבית קבועה. בנק ישראל מחייב לפחות שליש בריבית קבועה עד סוף התקופה.`,
      share,
      LIMITS.MIN_FIXED_SHARE,
    );
  }
  return finding(
    'FIXED_FLOOR',
    'OK',
    title,
    `${percent(share)} מההלוואה בריבית קבועה, מעל הרף של שליש.`,
    share,
    LIMITS.MIN_FIXED_SHARE,
  );
}
