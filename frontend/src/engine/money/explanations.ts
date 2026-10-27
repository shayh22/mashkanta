import type { CategoryId } from './categories';
import type { CategoryOverrides } from './picture';

/**
 * What the household says about a business on its statements: what it really is (a pension loan
 * the statement names after the insurer), where it belongs, and whether it can go. The rules only
 * read the statement; this is what the household knows. Kept by business name, in the browser.
 */

export type Flexibility = 'MUST' | 'REDUCE' | 'CANCEL';

export const FLEXIBILITY_LABELS: Record<Flexibility, string> = {
  MUST: 'חובה',
  REDUCE: 'אפשר לצמצם',
  CANCEL: 'אפשר לבטל',
};

export interface PayeeExplanation {
  readonly category?: CategoryId;
  /** In the household's words: "החזר הלוואה מהפנסיה". */
  readonly note?: string;
  readonly flexibility?: Flexibility;
}

export type Explanations = Readonly<Record<string, PayeeExplanation>>;

export const MAX_NOTE_LENGTH = 80;

/** The categories the household chose, as the picture takes them. */
export function overridesOf(explanations: Explanations): CategoryOverrides {
  return Object.fromEntries(
    Object.entries(explanations).flatMap(([payee, explanation]) => (explanation.category ? [[payee, explanation.category]] : [])),
  );
}

export const isExplained = (explanation?: PayeeExplanation) => !!explanation?.flexibility || !!explanation?.note;
