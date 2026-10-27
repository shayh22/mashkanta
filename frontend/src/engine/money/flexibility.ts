import type { Explanations } from './explanations';
import type { MonthlyPicture } from './picture';

/** A category split by what the household said about its charges. */
export interface FlexibilityRow {
  readonly key: string;
  readonly label: string;
  readonly must: number;
  readonly reduce: number;
  readonly cancel: number;
  /** Not yet explained. */
  readonly open: number;
  /** Where the category lands after what was marked to cancel. */
  readonly target?: number;
}

/** The ten largest categories, each split into a must, could cut, could cancel and not yet explained. */
export function flexibilityRows(picture: MonthlyPicture, explanations: Explanations): FlexibilityRow[] {
  return picture.spendingLines
    .filter((line) => line.id !== 'CARD_UNDETAILED')
    .slice(0, 10)
    .map((line) => {
      const part = (flexibility: string) =>
        line.payees
          .filter((payee) => explanations[payee.description]?.flexibility === flexibility)
          .reduce((sum, payee) => sum + Math.max(0, payee.monthly), 0);
      const must = part('MUST');
      const reduce = part('REDUCE');
      const cancel = part('CANCEL');
      const open = Math.max(0, line.monthly - must - reduce - cancel);
      return { key: line.id, label: line.label, must, reduce, cancel, open, ...(cancel >= 1 ? { target: line.monthly - cancel } : {}) };
    });
}
