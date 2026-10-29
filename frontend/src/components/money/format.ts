import type { CategoryId } from '../../engine/money/categories';

/** Categories a business can be moved to by hand. */
export const SPENDING_CHOICES: readonly CategoryId[] = [
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
  'CASH',
  'HOUSING_LOANS',
  'LOANS',
  'FEES',
  'OTHER',
];

export const monthName = (month: string, withYear = true) =>
  new Intl.DateTimeFormat('he-IL', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
export const shortDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

