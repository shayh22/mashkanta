import { CATEGORY_LABELS, type CategoryId } from './categories';

/**
 * "Sort the rest with AI": the names of businesses the rules did not know, and nothing else — no
 * amounts, no dates, no account — sent for a category each. Shared by the browser, which builds the
 * request and applies the answer, and the Worker, which checks it and forwards it.
 */

/** What a business can be sorted into: spending categories only. */
export const AI_CATEGORIES = [
  'GROCERIES',
  'DINING',
  'SHOPPING',
  'HEALTH',
  'TRANSPORT',
  'HOME_BILLS',
  'TELECOM',
  'INSURANCE',
  'EDUCATION',
  'DONATIONS',
  'SUBSCRIPTIONS',
  'TRANSFERS_OUT',
  'HOUSING_LOANS',
  'FEES',
  'OTHER',
] as const satisfies readonly CategoryId[];

export type AiCategory = (typeof AI_CATEGORIES)[number];

export const MAX_PAYEES = 150;
const MAX_NAME = 80;

export interface CategorizeRequest {
  readonly payees: readonly string[];
}

export const CATEGORIZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'category'],
        properties: {
          index: { type: 'integer' },
          category: { type: 'string', enum: [...AI_CATEGORIES] },
        },
      },
    },
  },
} as const;

export const CATEGORIZE_INSTRUCTIONS = `You sort the businesses on an Israeli household's credit card and bank statements into spending categories.

You receive a list of business names as they appear on the statement (Hebrew or English, often with a branch or city). Return one item per name you can place: its index and one category:
${AI_CATEGORIES.map((id) => `- ${id}: ${CATEGORY_LABELS[id]}`).join('\n')}

Use what you know about Israeli chains and kinds of business: a toy or clothing store is SHOPPING, a bakery or butcher is GROCERIES, a restaurant, café or event venue is DINING, a yeshiva, synagogue or charity is DONATIONS, a school, kindergarten or class is EDUCATION, an accountant or lawyer is OTHER.
When a name could be several things, or is a private person's name, return OTHER. Return only the JSON the schema asks for.`;

const clean = (name: unknown) =>
  typeof name === 'string'
    ? [...name].map((char) => (char < ' ' || char === '\u007f' ? ' ' : char)).join('').replace(/\s+/g, ' ').trim()
    : '';

/** The request rebuilt name by name, or the reason it is refused. */
export function validateCategorizeRequest(body: unknown): CategorizeRequest | string {
  const payees = (body as { payees?: unknown } | null)?.payees;
  if (!Array.isArray(payees) || payees.length === 0 || payees.length > MAX_PAYEES) {
    return 'bad payees';
  }
  const names = payees.map(clean);
  if (names.some((name) => name.length === 0 || name.length > MAX_NAME)) {
    return 'bad payee';
  }
  return { payees: names };
}

/** The answer as a category per name, held to the request: unknown indexes and categories are dropped. */
export function toCategories(data: unknown, payees: readonly string[]): Record<string, AiCategory> | null {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return null;
  }
  const result: Record<string, AiCategory> = {};
  for (const item of items as { index?: unknown; category?: unknown }[]) {
    const name = typeof item?.index === 'number' ? payees[item.index] : undefined;
    if (name && (AI_CATEGORIES as readonly unknown[]).includes(item.category) && item.category !== 'OTHER') {
      result[name] = item.category as AiCategory;
    }
  }
  return result;
}
