import { CATEGORY_LABELS, type CategoryId } from './categories';
import type { Explanations } from './explanations';
import type { MonthlyPicture } from './picture';
import { savingIdeas } from './savings';

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
  readonly source: 'statements' | 'advisor';
}

export interface CategoryTarget {
  readonly category: CategoryId;
  readonly current: number;
  readonly target: number;
}

export function decisionsOf(picture: MonthlyPicture, explanations: Explanations, targets: readonly CategoryTarget[] = []): Decision[] {
  const targeted = new Set(targets.map((target) => target.category));
  const decisions: Decision[] = [];

  // What was marked to cancel, outside the categories the advisor took over.
  let cancel = 0;
  for (const line of picture.spendingLines) {
    if (targeted.has(line.id)) {
      continue;
    }
    cancel += line.payees.filter((payee) => explanations[payee.description]?.flexibility === 'CANCEL').reduce((sum, payee) => sum + Math.max(0, payee.monthly), 0);
  }
  if (cancel >= 1) {
    decisions.push({ key: 'cancel', label: 'לבטל את מה שסימנתם', monthly: cancel, source: 'statements' });
  }

  for (const idea of savingIdeas(picture, explanations)) {
    if (idea.monthly === undefined || idea.monthly < 1) {
      continue;
    }
    if (idea.kind === 'OVERDRAFT') {
      decisions.push({ key: 'overdraft', label: 'לצאת מהמינוס (בלי ריבית)', monthly: idea.monthly, source: 'statements' });
    } else if (idea.kind === 'FEES' && !targeted.has('FEES')) {
      decisions.push({ key: 'fees', label: 'לבטל עמלות ודמי כרטיס', monthly: idea.monthly, source: 'statements' });
    } else if (idea.kind === 'RISING') {
      const line = picture.spendingLines.find((l) => idea.title.startsWith(l.label));
      if (line && !targeted.has(line.id)) {
        decisions.push({ key: `rising:${line.id}`, label: `${line.label}: חזרה לממוצע`, monthly: idea.monthly, source: 'statements' });
      }
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
