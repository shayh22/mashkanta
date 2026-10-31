import { CATEGORY_LABELS, type CategoryId } from './categories';
import type { Explanations } from './explanations';
import type { MonthlyPicture } from './picture';
import { savingIdeas, type SavingKind } from './savings';
import { cleanText } from '../text';

/**
 * The household advisor: the borrower writes what matters to them, and a model turns the monthly
 * picture into a few steps — some of them a monthly target for a spending category. Only totals go
 * out: categories and their averages, the overdraft, the ideas found. No business names, no dates,
 * no accounts. The app works out what the targets free up; the model's words carry no figure that
 * is shown as a result.
 */

export const MAX_GOAL_LENGTH = 400;
const MAX_STEPS = 5;
const MAX_NOTES = 5;

export const ADVICE_CATEGORIES = [
  'HOUSING_LOANS',
  'LOANS',
  'HOME_BILLS',
  'TELECOM',
  'INSURANCE',
  'GROCERIES',
  'DINING',
  'TRANSPORT',
  'HEALTH',
  'EDUCATION',
  'DONATIONS',
  'SUBSCRIPTIONS',
  'SHOPPING',
  'TRANSFERS_OUT',
  'CASH',
  'FEES',
  'CARD_UNDETAILED',
  'OTHER',
] as const satisfies readonly CategoryId[];

type AdviceCategory = (typeof ADVICE_CATEGORIES)[number];

const IDEA_KINDS: readonly SavingKind[] = [
  'CANCEL',
  'REDUCE',
  'OVERDRAFT',
  'LOANS',
  'FEES',
  'RISING',
  'RECURRING',
  'INSURANCE',
  'CASH',
  'MORTGAGE',
];

export interface AdviceCategoryTotal {
  readonly id: AdviceCategory;
  readonly monthly: number;
  /** Of it, what the household marked a must, could cut, could cancel — amounts only, never the notes. */
  readonly must: number;
  readonly reduce: number;
  readonly cancel: number;
}

export interface AdviceRequest {
  readonly goal: string;
  readonly income: number;
  readonly spending: number;
  readonly fixed: number;
  /** One-off money that came in over the period: a fund cashed, a loan taken. */
  readonly oneOff: number;
  readonly months: number;
  readonly overdraft: { readonly monthsBelow: number; readonly lowest: number; readonly interestMonthly: number } | null;
  readonly categories: readonly AdviceCategoryTotal[];
  readonly ideas: readonly { readonly kind: SavingKind; readonly monthly: number | null }[];
  /** What the household wrote on the screens before, in its own words. */
  readonly notes: readonly string[];
}

export interface AdviceStep {
  readonly title: string;
  readonly detail: string;
  /** A monthly spending target for one category, where the step is one. */
  readonly target?: { readonly category: AdviceCategory; readonly monthly: number };
}

export interface Advice {
  readonly summary: string;
  readonly steps: readonly AdviceStep[];
  readonly cautions: readonly string[];
}

const nullable = (type: string) => ({ type: [type, 'null'] });

export const ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'steps', 'cautions'],
  properties: {
    summary: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'category', 'targetMonthly'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          // A nullable enum is refused upstream; the categories are in the instructions and checked on the way back.
          category: nullable('string'),
          targetMonthly: nullable('number'),
        },
      },
    },
    cautions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const ADVICE_INSTRUCTIONS = `You are a careful household budget advisor in Israel. You receive a household's monthly picture from its bank and card statements — average income, spending by category, the fixed part, one-off money that came in, the overdraft, and saving ideas already found — and the household's goal in their own words (Hebrew).

Return up to ${MAX_STEPS} steps, most urgent first. A usual order: stop paying overdraft interest; build an emergency cushion of about three months of fixed spending; clear expensive debt; then the goal. Follow the household's goal where it is reasonable.
A step may set a monthly spending target for one category: give category (one of ${ADVICE_CATEGORIES.join(', ')}) and targetMonthly in ILS, below that category's current average.
notes are what the household wrote on earlier screens, in their own words: take them into account.
Each category also says how much of it the household marked as a must, as possible to cut, and as possible to cancel. Never set a target below the must part; start with what they marked to cancel, then what they marked to cut. Keep targets realistic: no more than about a third off a variable category; fixed categories (mortgage, insurance, bills, telecom) only by renegotiating or switching, and say so. Leave category and targetMonthly null for a step that is not a spending target.
Category names in Hebrew: ${ADVICE_CATEGORIES.map((id) => `${id} = ${CATEGORY_LABELS[id]}`).join('; ')}.

Write in Hebrew, addressed to the household in the plural (אתם), plainly and briefly: title up to 8 words, detail one or two sentences. summary: one or two sentences on the plan. cautions: up to two short sentences, or none. Do not recommend specific investment products, banks or companies, and do not state figures you were not given — the app computes what the targets free up. If the goal is not about the household's money, say so in summary and return no steps. Return only the JSON the schema asks for.`;

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** The request a picture makes, with the household's goal. */
export function adviceRequestOf(
  picture: MonthlyPicture,
  goal: string,
  explanations: Explanations = {},
  notes: readonly string[] = [],
): AdviceRequest {
  const round = (value: number) => Math.round(value);
  const { overdraft } = picture;
  return {
    goal: cleanText(goal, MAX_GOAL_LENGTH),
    income: round(picture.income),
    spending: round(picture.spending),
    fixed: round(picture.fixed),
    oneOff: round(picture.oneOff.reduce((sum, transaction) => sum + transaction.amount, 0)),
    months: picture.months.length,
    overdraft:
      overdraft && overdraft.monthsBelow > 0
        ? { monthsBelow: overdraft.monthsBelow, lowest: round(overdraft.lowest), interestMonthly: round(overdraft.interestMonthly) }
        : null,
    categories: picture.spendingLines
      .filter((line): line is typeof line & { id: AdviceCategory } => (ADVICE_CATEGORIES as readonly string[]).includes(line.id))
      .map((line) => {
        const part = (flexibility: string) =>
          round(
            line.payees
              .filter((payee) => explanations[payee.description]?.flexibility === flexibility)
              .reduce((sum, payee) => sum + Math.max(0, payee.monthly), 0),
          );
        return { id: line.id, monthly: round(line.monthly), must: part('MUST'), reduce: part('REDUCE'), cancel: part('CANCEL') };
      }),
    ideas: savingIdeas(picture, explanations).map((idea) => ({ kind: idea.kind, monthly: idea.monthly === undefined ? null : round(idea.monthly) })),
    notes: notes.map((note) => cleanText(note, MAX_GOAL_LENGTH)).filter((note) => note.length >= 3).slice(0, MAX_NOTES),
  };
}

/** Accepts exactly the request above, rebuilt field by field; the reason when refused. */
export function validateAdviceRequest(body: unknown): AdviceRequest | string {
  const record = body as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return 'not an object';
  }
  const goal = cleanText(record.goal, MAX_GOAL_LENGTH + 1);
  if (goal.length < 3 || goal.length > MAX_GOAL_LENGTH) {
    return 'bad goal';
  }
  for (const key of ['income', 'spending', 'fixed', 'oneOff'] as const) {
    if (!finite(record[key], 0, 1e7)) {
      return `bad ${key}`;
    }
  }
  if (!finite(record.months, 1, 36)) {
    return 'bad months';
  }
  const overdraft = record.overdraft as Record<string, unknown> | null;
  if (
    overdraft !== null &&
    (typeof overdraft !== 'object' ||
      !finite(overdraft.monthsBelow, 0, 36) ||
      !finite(overdraft.lowest, -1e7, 1e7) ||
      !finite(overdraft.interestMonthly, 0, 1e6))
  ) {
    return 'bad overdraft';
  }
  const categories = Array.isArray(record.categories) ? (record.categories as Record<string, unknown>[]) : null;
  if (
    !categories ||
    categories.length > ADVICE_CATEGORIES.length ||
    categories.some(
      (c) =>
        !c ||
        !(ADVICE_CATEGORIES as readonly unknown[]).includes(c.id) ||
        !finite(c.monthly, -1e6, 1e7) ||
        !finite(c.must, 0, 1e7) ||
        !finite(c.reduce, 0, 1e7) ||
        !finite(c.cancel, 0, 1e7),
    )
  ) {
    return 'bad categories';
  }
  const ideas = Array.isArray(record.ideas) ? (record.ideas as Record<string, unknown>[]) : null;
  if (
    !ideas ||
    ideas.length > 20 ||
    ideas.some((i) => !i || !(IDEA_KINDS as readonly unknown[]).includes(i.kind) || (i.monthly !== null && !finite(i.monthly, 0, 1e6)))
  ) {
    return 'bad ideas';
  }
  const notes = Array.isArray(record.notes) ? record.notes.map((note) => cleanText(note, MAX_GOAL_LENGTH + 1)) : null;
  if (!notes || notes.length > MAX_NOTES || notes.some((note) => note.length === 0 || note.length > MAX_GOAL_LENGTH)) {
    return 'bad notes';
  }
  return {
    goal,
    income: record.income as number,
    spending: record.spending as number,
    fixed: record.fixed as number,
    oneOff: record.oneOff as number,
    months: record.months as number,
    overdraft: overdraft
      ? {
          monthsBelow: overdraft.monthsBelow as number,
          lowest: overdraft.lowest as number,
          interestMonthly: overdraft.interestMonthly as number,
        }
      : null,
    categories: categories.map((c) => ({
      id: c.id as AdviceCategory,
      monthly: c.monthly as number,
      must: c.must as number,
      reduce: c.reduce as number,
      cancel: c.cancel as number,
    })),
    ideas: ideas.map((i) => ({ kind: i.kind as SavingKind, monthly: i.monthly as number | null })),
    notes,
  };
}

/**
 * The answer held to the request: at most five steps; a target only for a category the household
 * has, below what it spends there now and not below what it called a must — otherwise the step
 * stays, without a target.
 */
export function toAdvice(data: unknown, request: AdviceRequest): Advice | null {
  const record = data as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || !Array.isArray(record.steps)) {
    return null;
  }
  const byId = new Map(request.categories.map((category) => [category.id as string, category]));
  const steps: AdviceStep[] = [];
  for (const raw of (record.steps as Record<string, unknown>[]).slice(0, MAX_STEPS)) {
    const title = cleanText(raw?.title, 80);
    if (!title) {
      continue;
    }
    const category = typeof raw.category === 'string' ? byId.get(raw.category) : undefined;
    const target =
      category && finite(raw.targetMonthly, category.must, category.monthly - 1)
        ? { category: raw.category as AdviceCategory, monthly: Math.round(raw.targetMonthly) }
        : undefined;
    steps.push({ title, detail: cleanText(raw.detail, 300), ...(target ? { target } : {}) });
  }
  return {
    summary: cleanText(record.summary, 300),
    steps,
    cautions: (Array.isArray(record.cautions) ? record.cautions : []).map((c) => cleanText(c, 200)).filter(Boolean).slice(0, 2),
  };
}

/** What the plan's targets free up a month, by the household's own averages. */
export function freedByAdvice(advice: Advice, request: AdviceRequest): number {
  const current = new Map(request.categories.map((category) => [category.id as string, category.monthly]));
  // One target per category: the last word on it counts.
  const targets = new Map(advice.steps.flatMap((step) => (step.target ? [[step.target.category as string, step.target.monthly]] : [])));
  let freed = 0;
  for (const [category, target] of targets) {
    freed += Math.max(0, (current.get(category) ?? 0) - target);
  }
  return freed;
}
