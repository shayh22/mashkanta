import type { TrackType } from '../lib/types';
import { rateFor } from './baseline';
import { CONSOLIDATION_LIMITS, DEBT_KIND_LABELS, type ConsolidationAnalysis } from './consolidation';
import { payment as annuityPayment, monthlyRate } from './math';
import type { CombinedMove } from './combined';
import { VERDICT_LABELS, type RefinanceComparison, type RouteAnalysis } from './refinance';
import { TRACKS } from './tracks';

/**
 * Turns an analysis into the borrower's to-do list: what to ask the bank for, which loans to close,
 * how to fit inside the payment-to-income limit, and when to act.
 *
 * Every item carries the shekel figure behind it, so the plan is something a borrower can take
 * into a meeting with a banker rather than a list of platitudes.
 */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PlanItem {
  readonly priority: Priority;
  readonly text: string;
  readonly detail?: string;
}

export interface PlanSection {
  readonly title: string;
  readonly items: readonly PlanItem[];
}

export interface NegotiationTarget {
  readonly label: string;
  /** All-in annual rate to ask for — the best decile of the published distribution. */
  readonly targetRate: number;
  readonly medianRate: number;
  /** For prime tracks, the target expressed as a margin over prime. */
  readonly targetMargin?: number;
  readonly currentRate?: number;
}

export interface ActionPlan {
  readonly title: string;
  readonly headline: string;
  readonly sections: readonly PlanSection[];
  readonly targets: readonly NegotiationTarget[];
  readonly generatedOn: string;
}

/**
 * Margins over prime for an all-purpose loan secured on a home: the ceiling is the market average
 * (Bank of Israel, August 2026, about prime + 1.5), the target half a point under it.
 */
export const ALL_PURPOSE_MARGIN = { target: 0.01, ceiling: 0.015 } as const;

const ils = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;
const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const today = () => new Date().toISOString().slice(0, 10);

const TRACK_NAMES: Record<TrackType, string> = {
  PRIME: 'פריים',
  FIXED_UNLINKED: 'קבועה לא צמודה',
  FIXED_LINKED: 'קבועה צמודה',
  VARIABLE_UNLINKED: 'משתנה לא צמודה',
  VARIABLE_LINKED: 'משתנה צמודה',
  ELIGIBILITY: 'זכאות',
};

/** Best-decile targets for each track of the proposal, at the borrower's LTV and term. */
export function negotiationTargets(
  tracks: readonly { type: TrackType; annualRate: number; termMonths: number }[],
  ltv: number,
  prime: number,
): NegotiationTarget[] {
  const seen = new Set<TrackType>();
  const targets: NegotiationTarget[] = [];
  for (const track of tracks) {
    if (track.type === 'ELIGIBILITY' || seen.has(track.type)) {
      continue;
    }
    seen.add(track.type);
    const market = rateFor(track.type, ltv, track.termMonths, prime);
    targets.push({
      label: TRACK_NAMES[track.type],
      targetRate: market.bestRate,
      medianRate: market.medianRate,
      targetMargin: TRACKS[track.type].primeAnchored ? market.bestRate - prime : undefined,
      currentRate: track.annualRate,
    });
  }
  return targets;
}

function bestOf(comparison: RefinanceComparison): RouteAnalysis {
  return comparison.best === 'EXTERNAL' ? comparison.external : comparison.internal;
}

/** The action plan for a refinance decision. */
export function refinancePlan(
  comparison: RefinanceComparison,
  proposal: readonly { type: TrackType; annualRate: number; termMonths: number }[],
  ltv: number,
  prime: number,
  noticeGiven: boolean,
): ActionPlan {
  const best = bestOf(comparison);
  const other = comparison.best === 'EXTERNAL' ? comparison.internal : comparison.external;
  const routeName = comparison.best === 'EXTERNAL' ? 'מעבר לבנק מתחרה' : 'מיחזור פנימי';
  const fees = best.prepayment;
  const sections: PlanSection[] = [];

  const decision: PlanItem[] = [];
  if (best.verdict === 'NOT_WORTHWHILE') {
    decision.push({
      priority: 'HIGH',
      text: 'לא למחזר כרגע.',
      detail: `החיסכון אינו מכסה עלות מעבר של ${ils(best.upfrontCost)}. בדקו שוב כשהריביות בשוק יירדו, או במועד שינוי הריבית של המסלולים המשתנים — אז העמלה מתאפסת.`,
    });
  } else {
    decision.push({
      priority: 'HIGH',
      text: `${VERDICT_LABELS[best.verdict]} — ${routeName}.`,
      detail: `חיסכון של ${ils(best.monthlySaving)} בחודש, נקודת איזון בחודש ${best.breakevenMonth}, ערך נוכחי נקי ${ils(best.netPresentValue)}.`,
    });
    if (
      other.netPresentValue > 0 &&
      Math.abs(best.netPresentValue - other.netPresentValue) < best.upfrontCost
    ) {
      decision.push({
        priority: 'MEDIUM',
        text: 'השתמשו בהצעת המתחרה כמנוף מול הבנק הנוכחי.',
        detail: `הפער בין שתי הדרכים (${ils(Math.abs(best.netPresentValue - other.netPresentValue))}) קטן מעלות המעבר — בקשו "שימור לקוח" בתנאי המתחרה ונצלו את היתרון של מיחזור פנימי בלי שמאות ורישום.`,
      });
    }
  }
  sections.push({ title: 'ההחלטה', items: decision });

  const timing: PlanItem[] = [];
  if (!noticeGiven && fees.noticeFee > 0) {
    timing.push({
      priority: 'HIGH',
      text: 'מסרו לבנק הודעה בכתב 10–45 יום לפני מועד הפירעון.',
      detail: `חוסך עמלת אי-הודעה של ${ils(fees.noticeFee)}.`,
    });
  }
  if (fees.cpiFee > 0) {
    timing.push({
      priority: 'MEDIUM',
      text: 'קבעו את הפירעון בין ה-16 לסוף החודש.',
      detail: `חוסך עמלת מדד ממוצע של ${ils(fees.cpiFee)} על המסלולים הצמודים.`,
    });
  }
  for (const quote of fees.tracks) {
    if (
      quote.monthsToNextDiscount !== undefined &&
      quote.monthsToNextDiscount <= 6 &&
      quote.nextDiscount !== undefined
    ) {
      const saving = quote.grossCapitalizationFee * (quote.nextDiscount - quote.seniorityDiscount);
      timing.push({
        priority: 'MEDIUM',
        text: `שקלו להמתין ${quote.monthsToNextDiscount} חודשים במסלול ${TRACK_NAMES[quote.type]}.`,
        detail: `ההנחה על עמלת ההיוון עולה ל-${pct(quote.nextDiscount, 0)} — חיסכון של כ-${ils(saving)}.`,
      });
    }
  }
  if (fees.capitalizationFee > 0) {
    const heavy = [...fees.tracks].sort((a, b) => b.capitalizationFee - a.capitalizationFee)[0];
    if (heavy && heavy.capitalizationFee > 0.5 * fees.capitalizationFee) {
      timing.push({
        priority: 'LOW',
        text: `רוב עמלת ההיוון נובעת ממסלול ${TRACK_NAMES[heavy.type]} (${ils(heavy.capitalizationFee)}).`,
        detail: 'אפשר למחזר רק את המסלולים הזולים לפירעון ולהשאיר אותו כמות שהוא.',
      });
    }
  }
  if (timing.length > 0) {
    sections.push({ title: 'תזמון וחיסכון בעמלות', items: timing });
  }

  const targets = negotiationTargets(proposal, ltv, prime);
  sections.push({
    title: 'יעדי מיקוח',
    items: targets.map((target) => ({
      priority: 'MEDIUM' as Priority,
      text:
        target.targetMargin !== undefined
          ? `${target.label}: לבקש פריים ${target.targetMargin >= 0 ? '+' : '−'} ${pct(Math.abs(target.targetMargin))} (${pct(target.targetRate)}).`
          : `${target.label}: לבקש ${pct(target.targetRate)} או פחות.`,
      detail: `ממוצע השוק ${pct(target.medianRate)}${target.currentRate !== undefined ? `; בהצעה ${pct(target.currentRate)}` : ''}.`,
    })),
  });

  return {
    title: 'תוכנית פעולה — מיחזור משכנתא',
    headline: decision[0]!.text,
    sections,
    targets,
    generatedOn: today(),
  };
}

/** The term at which the new loan's payment fits a payment ceiling, or undefined if none does. */
export function termForPayment(
  amount: number,
  annualRate: number,
  maxPayment: number,
  limit = 360,
): number | undefined {
  const r = monthlyRate(annualRate);
  for (let n = 12; n <= limit; n += 12) {
    if (annuityPayment(amount, r, n) <= maxPayment) {
      return n;
    }
  }
  return undefined;
}

/** The action plan for a consolidation. */
export function consolidationPlan(analysis: ConsolidationAnalysis, prime: number): ActionPlan {
  const r = analysis.regulation;
  const { allocation } = analysis;
  const sections: PlanSection[] = [];

  const status: PlanItem[] = [];
  if (allocation.amount <= 0) {
    status.push({ priority: 'HIGH', text: 'לא סומנו הלוואות לאיחוד.' });
  } else if (!r.feasible) {
    status.push({
      priority: 'HIGH',
      text: 'האיחוד כפי שהוגדר אינו עומד בהוראה 329.',
      detail: `ניתן לאחד עד ${ils(r.maxFeasibleLoan)} במסגרת מגבלות ה-LTV וה-PTI.`,
    });
  } else {
    status.push({
      priority: 'HIGH',
      text: r.bankFeasible
        ? 'האיחוד בר-ביצוע — אפשר לפנות לבנק.'
        : 'מותר רגולטורית, אך מעל מדיניות 40% של רוב הבנקים.',
      detail: `חמצן תזרימי של ${ils(analysis.monthlyRelief)} בחודש; התייקרות כוללת של ${ils(analysis.extraLifetimeCost)} אם לא מקצרים.`,
    });
  }
  sections.push({ title: 'השורה התחתונה', items: status });

  const close: PlanItem[] = analysis.included.map((debt) => ({
    priority: 'MEDIUM' as Priority,
    text: `לסגור: ${debt.label || DEBT_KIND_LABELS[debt.kind]} — ${ils(debt.balance)} ב-${pct(debt.annualRate)}.`,
    detail: `משחרר ${ils(debt.monthlyPayment)} בחודש.`,
  }));
  const advice = new Map(analysis.recommendations.map((item) => [item.id, item]));
  const keep: PlanItem[] = analysis.kept.map((debt) => ({
    priority: advice.get(debt.id)?.action === 'CONSOLIDATE' ? 'HIGH' : 'LOW',
    text:
      advice.get(debt.id)?.action === 'CONSOLIDATE'
        ? `שקלו לצרף: ${debt.label} (${pct(debt.annualRate)}).`
        : `להשאיר: ${debt.label}.`,
    detail: advice.get(debt.id)?.reason,
  }));
  sections.push({ title: 'אילו הלוואות לסגור ואילו להשאיר', items: [...close, ...keep] });

  const pti: PlanItem[] = [];
  if (allocation.amount > 0 && !r.ptiExempt && !r.bankFeasible) {
    if (r.exemptionRemaining > 0) {
      pti.push({
        priority: 'HIGH',
        text: `אחדו עד ${ils(r.exemptionRemaining)} במסלול הפטור.`,
        detail: 'הלוואה לכל מטרה עד 120,000 ₪ במצטבר פטורה ממגבלת ה-PTI ומתקרת ⅔ המשתנה (סעיפים 11, 12.2).',
      });
    }
    const term = termForPayment(allocation.amount, allocation.blendedRate, r.maxPaymentBank);
    if (term !== undefined && term > allocation.termMonths) {
      pti.push({
        priority: 'MEDIUM',
        text: `הארכת התקופה ל-${term / 12} שנים מורידה את ההחזר אל מתחת ל-40%.`,
        detail: 'מחיר: עלות כוללת גבוהה יותר — השתמשו בסימולטור הקיצור החכם כדי לקזז אותה.',
      });
    }
    const keptLong = analysis.kept.filter(
      (debt) => debt.remainingMonths > CONSOLIDATION_LIMITS.SHORT_TERM_MONTHS,
    );
    if (keptLong.length > 0) {
      pti.push({
        priority: 'MEDIUM',
        text: 'צירוף הלוואות ארוכות שנשארו מחוץ לאיחוד מקטין את F במכנה.',
        detail: keptLong.map((debt) => `${debt.label}: ${ils(debt.monthlyPayment)} בחודש`).join(' · '),
      });
    }
    pti.push({
      priority: 'MEDIUM',
      text: `או הקטינו את סכום האיחוד ל-${ils(Math.min(r.maxFeasibleLoan, r.creditRoomBank))}.`,
    });
  }
  if (r.ltvStatus === 'EXCEEDED') {
    pti.push({
      priority: 'HIGH',
      text: `שיעור המימון המצטבר חורג — ניתן להוסיף על הנכס עד ${ils(r.ltvRoom)}.`,
    });
  }
  if (allocation.variableCapped) {
    pti.push({
      priority: 'LOW',
      text: `תקרת ⅔ משתנה מחייבת ${ils(allocation.fixedAmount)} לפחות בריבית קבועה.`,
      detail: 'הבנק יקצה את המסלולים כך; אל תופתעו מהצעה עם חלק קבוע גדול יותר.',
    });
  }
  if (pti.length > 0) {
    sections.push({ title: 'עמידה במגבלות בנק ישראל', items: pti });
  }

  const cost: PlanItem[] = [];
  if (analysis.breakEvenShare !== undefined && analysis.breakEvenShare > 0) {
    cost.push({
      priority: 'MEDIUM',
      text: `הפנו ${ils(analysis.monthlyRelief * analysis.breakEvenShare)} בחודש להחזר מוקדם בפריים.`,
      detail: `כך האיחוד לא יעלה יותר מהמצב היום, ועדיין יישאר חמצן של ${ils(analysis.monthlyRelief * (1 - analysis.breakEvenShare))} בחודש. בפריים אין עמלת היוון.`,
    });
  }
  const margin = allocation.variableRate - prime;
  cost.push({
    priority: margin > ALL_PURPOSE_MARGIN.ceiling ? 'HIGH' : 'MEDIUM',
    text: `מרווח יעד בפריים: פריים + ${pct(ALL_PURPOSE_MARGIN.target)} (${pct(prime + ALL_PURPOSE_MARGIN.target)}).`,
    detail:
      margin > ALL_PURPOSE_MARGIN.ceiling
        ? `ההצעה הנוכחית פריים + ${pct(margin)} — גבוהה מהמקובל להלוואה מובטחת בדירה.`
        : `ההצעה הנוכחית פריים + ${pct(margin)}.`,
  });
  sections.push({ title: 'מיקוח ועלות כוללת', items: cost });

  return {
    title: 'תוכנית פעולה — איחוד הלוואות',
    headline: status[0]!.text,
    sections,
    targets: [],
    generatedOn: today(),
  };
}

/**
 * The plan for refinancing and consolidating in one move: the bottom line of the two together,
 * then the refinance and consolidation plans in that order — the refinance comes first because it
 * sets the mortgage payment and variable share that the consolidation is tested against.
 */
export function combinedPlan(
  move: CombinedMove,
  comparison: RefinanceComparison,
  proposal: readonly { type: TrackType; annualRate: number; termMonths: number }[],
  ltv: number,
  prime: number,
  noticeGiven: boolean,
): ActionPlan {
  const relief = move.paymentToday - move.paymentAfter;
  const before = move.consolidationOnly.regulation;
  const after = move.combined.regulation;
  const refinance = refinancePlan(comparison, proposal, ltv, prime, noticeGiven);
  const consolidation = consolidationPlan(move.combined, prime);

  const bottom: PlanItem[] = [
    after.feasible
      ? {
          priority: 'HIGH',
          text: `שני המהלכים יחד מורידים ${ils(relief)} מההחזר החודשי.`,
          detail: `מ-${ils(move.paymentToday)} ל-${ils(move.paymentAfter)}; המיחזור לבדו תורם ${ils(move.extraReliefFromRefinance)} מתוכם.`,
        }
      : {
          priority: 'HIGH',
          text: 'גם אחרי המיחזור האיחוד אינו עומד בהוראה 329 כפי שהוגדר.',
          detail: `ניתן לאחד עד ${ils(after.maxFeasibleLoan)}.`,
        },
    {
      priority: 'MEDIUM',
      text: 'קודם המיחזור, אחר כך האיחוד — באותה פנייה לבנק.',
      detail: after.ptiExempt
        ? 'ההלוואה לכל מטרה במסלול הפטור (עד 120,000 ₪), כך שה-PTI אינו נבחן.'
        : `המשכנתא הממוחזרת מורידה את ה-PTI של האיחוד מ-${pct(before.pti, 1)} ל-${pct(after.pti, 1)}.`,
    },
  ];
  if (move.cashUpfront > 0) {
    bottom.push({
      priority: 'MEDIUM',
      text: `הכינו ${ils(move.cashUpfront)} במזומן לעמלות ולעלויות המעבר.`,
      detail: 'אפשר במקום זאת לממן אותן מתוך ההלוואה לכל מטרה — במחיר החזר חודשי מעט גבוה יותר.',
    });
  }
  if (move.extraCreditRoom > 1) {
    bottom.push({
      priority: 'LOW',
      text: `המיחזור מגדיל את מרווח האיחוד ב-${ils(move.extraCreditRoom)}.`,
    });
  }

  const prefixed = (prefix: string, plan: ActionPlan) =>
    plan.sections.map((section) => ({ ...section, title: `${prefix} — ${section.title}` }));

  return {
    title: 'תוכנית פעולה — מיחזור ואיחוד במהלך אחד',
    headline: bottom[0]!.text,
    sections: [
      { title: 'השורה התחתונה', items: bottom },
      ...prefixed('מיחזור', refinance),
      ...prefixed('איחוד', consolidation).filter((section) => !section.title.endsWith('השורה התחתונה')),
    ],
    targets: refinance.targets,
    generatedOn: refinance.generatedOn,
  };
}

/** Plain-text rendering for sharing and copying. */
export function planToText(plan: ActionPlan): string {
  const lines = [plan.title, `הופק: ${plan.generatedOn}`, '', plan.headline];
  for (const section of plan.sections) {
    lines.push('', `■ ${section.title}`);
    for (const item of section.items) {
      lines.push(`• ${item.text}${item.detail ? ` — ${item.detail}` : ''}`);
    }
  }
  lines.push('', 'מבוסס על נתונים ציבוריים; אין באמור ייעוץ פיננסי.');
  return lines.join('\n');
}
