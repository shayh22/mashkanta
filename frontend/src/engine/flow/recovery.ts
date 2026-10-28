import type { CategoryId } from '../money/categories';
import type { Explanations, Flexibility } from '../money/explanations';
import type { MonthlyPicture, Payee } from '../money/picture';
import { recurringPayees } from '../money/savings';
import type { AnswerValue, Choice, Step } from './flow';

/**
 * The recovery plan's own questions, built from the statements: what the unclear charges are, and
 * which recurring ones are a must, can shrink or can go. The answers are the household's
 * explanations of those businesses (kept by name, as the statements journey keeps them), so they
 * also reshape the picture they were asked from.
 *
 * Which charges are asked about is read from the picture as the rules alone see it, so that
 * answering one — moving it out of "other" — does not take it off the screen.
 */

const UNCLEAR: ReadonlySet<CategoryId> = new Set(['OTHER', 'INSURANCE']);
const MAX_ASKED = 6;
const MIN_MONTHLY = 50;

export const WHAT_CHOICES: readonly (Choice & { readonly id: CategoryId })[] = [
  { id: 'LOANS', label: 'הלוואה' },
  { id: 'INSURANCE', label: 'ביטוח' },
  { id: 'SUBSCRIPTIONS', label: 'מנוי' },
  { id: 'SHOPPING', label: 'קניות' },
  { id: 'OTHER', label: 'אחר' },
];

export const FLEX_CHOICES: readonly (Choice & { readonly id: Flexibility })[] = [
  { id: 'MUST', label: 'חובה' },
  { id: 'REDUCE', label: 'לצמצם' },
  { id: 'CANCEL', label: 'לבטל' },
];

/** The charges the rules could not place with confidence: "other" and insurers (a pension loan is charged under one). */
export function unclearPayees(raw: MonthlyPicture): Payee[] {
  return raw.spendingLines
    .filter((line) => UNCLEAR.has(line.id))
    .flatMap((line) => line.payees)
    .filter((payee) => payee.monthly >= MIN_MONTHLY)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, MAX_ASKED);
}

/** The charges that come every month and could be cancelled, switched or renegotiated. */
export function reviewPayees(raw: MonthlyPicture): Payee[] {
  return recurringPayees(raw).slice(0, MAX_ASKED);
}

const shekels = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;

export interface RecoveryQuestions {
  readonly steps: readonly Step[];
  /** Each field's business, by the field's id. */
  readonly payees: Readonly<Record<string, string>>;
}

/** The two screens, after the statements: what is it, then what can go. */
export function recoveryQuestions(raw: MonthlyPicture): RecoveryQuestions {
  const unclear = unclearPayees(raw);
  const review = reviewPayees(raw);
  const payees: Record<string, string> = {};
  const steps: Step[] = [];
  if (unclear.length > 0) {
    steps.push({
      id: 'whatIsIt',
      section: 'statements',
      title: 'מה החיובים האלה?',
      help: 'statements',
      list: true,
      fields: unclear.map((payee, index) => {
        payees[`what${index}`] = payee.description;
        return { id: `what${index}`, label: `${payee.description} · ${shekels(payee.monthly)} בחודש`, kind: 'choice', options: WHAT_CHOICES, optional: true };
      }),
    });
  }
  if (review.length > 0) {
    steps.push({
      id: 'canGo',
      section: 'statements',
      title: 'מה מזה אפשר לבטל או לצמצם?',
      list: true,
      fields: review.map((payee, index) => {
        payees[`flex${index}`] = payee.description;
        return { id: `flex${index}`, label: `${payee.description} · ${shekels(payee.monthly)} בחודש`, kind: 'choice', options: FLEX_CHOICES, optional: true };
      }),
    });
  }
  return { steps, payees };
}

/** The answers these screens show: what the household already said about each business. */
export function recoveryAnswers(questions: RecoveryQuestions, explanations: Explanations): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const [field, payee] of Object.entries(questions.payees)) {
    const said = field.startsWith('what') ? explanations[payee]?.category : explanations[payee]?.flexibility;
    if (said) {
      out[field] = said;
    }
  }
  return out;
}

/** An answer on these screens as what it says about the business; undefined for any other field. */
export function explanationFor(
  questions: RecoveryQuestions,
  field: string,
  value: AnswerValue | undefined,
): { payee: string; patch: { category?: CategoryId; flexibility?: Flexibility } } | undefined {
  const payee = questions.payees[field];
  if (!payee) {
    return undefined;
  }
  const id = typeof value === 'string' ? value : undefined;
  return field.startsWith('what')
    ? { payee, patch: { category: WHAT_CHOICES.find((choice) => choice.id === id)?.id } }
    : { payee, patch: { flexibility: FLEX_CHOICES.find((choice) => choice.id === id)?.id } };
}
