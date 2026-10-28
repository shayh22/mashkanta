import { CATEGORY_LABELS, type CategoryId } from './categories';
import type { Explanations } from './explanations';
import { OVERDRAFT_INTEREST, type MonthlyPicture, type Payee, type CategoryLine } from './picture';
import { loanMoves, validTerms, type LoanMoveKind } from './loanMoves';
import { savingIdeas, type SavingKind } from './savings';

/**
 * The moves the summary offers to choose from, each with what it frees a month: the savings the
 * statements price, and the advisor's category targets. A shekel is counted once — where the
 * advisor set a target for a category, that target stands for the category, and the category's
 * own cancellations and return-to-average are not added on top.
 */

export interface Decision {
  readonly key: string;
  readonly label: string;
  /** Freed a month. */
  readonly monthly: number;
  readonly source: 'statements' | 'advisor' | 'debts';
  /** What it costs or asks, where it is not free: a balloon's lump sum, a refinance's fees. */
  readonly note?: string;
}

/** A loan as the household describes it, and what it chose to do with it. */
export interface LoanPlan {
  readonly balance?: number;
  readonly annualRate?: number;
  readonly remainingMonths?: number;
  readonly move: LoanMoveKind;
  /** For EXTEND: the new length, in years. */
  readonly extendYears?: number;
}

export interface MortgageMove {
  readonly currentPayment: number;
  readonly proposedPayment: number;
  readonly upfrontCost: number;
}

const shekel = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;

/** Spreading a loan over twice what is left, up to forty years, unless the household says otherwise. */
export const defaultExtendYears = (remainingMonths: number) => Math.min(40, Math.max(1, Math.ceil((remainingMonths * 2) / 12)));

/** A loan's chosen move, priced; undefined while it is kept or its terms are missing. */
export function loanDecision(
  loan: { readonly key: string; readonly name: string; readonly monthly: number },
  plan: LoanPlan | undefined,
): Decision | undefined {
  const terms = { balance: plan?.balance, annualRate: plan?.annualRate, remainingMonths: plan?.remainingMonths };
  if (!plan || plan.move === 'KEEP' || !validTerms(terms)) {
    return undefined;
  }
  const moves = loanMoves(terms, (plan.extendYears ?? defaultExtendYears(terms.remainingMonths)) * 12, loan.monthly);
  const move = moves[plan.move];
  const freed = moves.KEEP.monthly - move.monthly;
  if (freed < 1) {
    return undefined;
  }
  return {
    key: `loan:${loan.key}`,
    label: `${loan.name}: ${plan.move === 'BALLOON' ? 'בלון' : `פריסה ל-${Math.round(move.months / 12)} שנים`}`,
    monthly: freed,
    source: 'debts',
    note:
      plan.move === 'BALLOON'
        ? `בסוף התקופה ${shekel(move.atEnd)} בבת אחת · עולה ${shekel(move.extraCost)} יותר בסך הכל`
        : `עולה ${shekel(move.extraCost)} יותר בסך הכל`,
  };
}

/** Refinancing the mortgage into the engine's mix, when it lowers the payment. */
export function mortgageDecision(move: MortgageMove | undefined): Decision | undefined {
  if (!move || move.currentPayment - move.proposedPayment < 1) {
    return undefined;
  }
  return {
    key: 'mortgage',
    label: 'מיחזור המשכנתא לתמהיל של המנוע',
    monthly: move.currentPayment - move.proposedPayment,
    source: 'debts',
    ...(move.upfrontCost >= 1 ? { note: `עלות מעבר ${shekel(move.upfrontCost)}` } : {}),
  };
}

export interface CategoryTarget {
  readonly category: CategoryId;
  readonly current: number;
  readonly target: number;
}

export function decisionsOf(picture: MonthlyPicture, explanations: Explanations, targets: readonly CategoryTarget[] = []): Decision[] {
  const targeted = new Set(targets.map((target) => target.category));
  const ideas = savingIdeas(picture, explanations);
  const idea = (kind: SavingKind) => ideas.find((item) => item.kind === kind);
  const decisions: Decision[] = [];

  // Fees and overdraft interest have their own decisions, unless the advisor took the category over.
  const overdraft = targeted.has('FEES') ? 0 : (idea('OVERDRAFT')?.monthly ?? 0);
  const isInterest = (line: CategoryLine, payee: Payee) => overdraft >= 1 && line.id === 'FEES' && OVERDRAFT_INTEREST.test(payee.description);
  const cancelledIn = (line: CategoryLine) =>
    line.payees
      .filter((payee) => explanations[payee.description]?.flexibility === 'CANCEL' && !isInterest(line, payee))
      .reduce((sum, payee) => sum + Math.max(0, payee.monthly), 0);

  // What was marked to cancel, outside the categories the advisor took over.
  const cancel = picture.spendingLines.filter((line) => !targeted.has(line.id)).reduce((sum, line) => sum + cancelledIn(line), 0);
  if (cancel >= 1) {
    decisions.push({ key: 'cancel', label: 'לבטל את מה שסימנתם', monthly: cancel, source: 'statements' });
  }
  if (overdraft >= 1) {
    decisions.push({ key: 'overdraft', label: 'לצאת מהמינוס (בלי ריבית)', monthly: overdraft, source: 'statements' });
  }
  const feesLine = picture.spendingLines.find((line) => line.id === 'FEES');
  const fees = targeted.has('FEES') || !feesLine
    ? 0
    : (idea('FEES')?.items ?? [])
        .filter((payee) => explanations[payee.description]?.flexibility !== 'CANCEL' && !isInterest(feesLine, payee))
        .reduce((sum, payee) => sum + payee.monthly, 0);
  if (fees >= 1) {
    decisions.push({ key: 'fees', label: 'לבטל עמלות ודמי כרטיס', monthly: fees, source: 'statements' });
  }
  // Back to the average, less what is cancelled there anyway; fees are counted above.
  for (const rising of ideas.filter((item) => item.kind === 'RISING')) {
    const line = picture.spendingLines.find((l) => rising.title.startsWith(l.label));
    if (!line || line.id === 'FEES' || targeted.has(line.id)) {
      continue;
    }
    const monthly = (rising.monthly ?? 0) - cancelledIn(line);
    if (monthly >= 1) {
      decisions.push({ key: `rising:${line.id}`, label: `${line.label}: חזרה לממוצע`, monthly, source: 'statements' });
    }
  }

  for (const target of targets) {
    const freed = target.current - target.target;
    if (freed >= 1) {
      decisions.push({
        key: `target:${target.category}`,
        label: `${CATEGORY_LABELS[target.category]}: יעד ${Math.round(target.target).toLocaleString('he-IL')} ₪`,
        monthly: freed,
        source: 'advisor',
      });
    }
  }
  return decisions;
}

/** What the chosen decisions free a month. */
export const freedBy = (decisions: readonly Decision[], chosen: ReadonlySet<string>) =>
  decisions.filter((decision) => chosen.has(decision.key)).reduce((sum, decision) => sum + decision.monthly, 0);
