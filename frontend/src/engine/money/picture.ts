import {
  CATEGORY_LABELS,
  cardPaidBy,
  categorize,
  FIXED_CATEGORIES,
  isCardBill,
  isIncome,
  type CategoryId,
} from './categories';
import type { Statement, Transaction } from './statementImport';

/**
 * The household's month, from its bank and card statements: what comes in, what goes out and on
 * what, averaged over the whole months every statement covers. A card's purchases appear twice —
 * one by one on the card statement, and as charges on the bank account — so when the card's own
 * detail is there, the bank's charges for it are left out.
 */

export interface Payee {
  readonly description: string;
  readonly monthly: number;
  readonly count: number;
  /** In how many of the months counted it appears. */
  readonly months: number;
  /** Charged as a standing order, where the statement says so. */
  readonly standing: boolean;
}

export interface CategoryLine {
  // Every payee in the category, dearest first.
  readonly id: CategoryId;
  readonly label: string;
  /** Average per month, positive. */
  readonly monthly: number;
  /** In the last month counted. */
  readonly lastMonth: number;
  /** The last month well above the average. */
  readonly rising: boolean;
  readonly payees: readonly Payee[];
  readonly transactions: number;
}

export interface MonthTotals {
  readonly month: string;
  readonly income: number;
  readonly spending: number;
}

export interface Overdraft {
  /** Months counted whose lowest balance was below zero. */
  readonly monthsBelow: number;
  readonly months: number;
  readonly lowest: number;
  readonly lowestDate: string;
  /** Overdraft interest net of reversals, per month. */
  readonly interestMonthly: number;
}

export interface MonthlyPicture {
  /** The months averaged, "YYYY-MM"; whole months only, unless no month is whole. */
  readonly months: readonly string[];
  /** True when no month was covered whole, and the figures are for the period as it is. */
  readonly partial: boolean;
  readonly income: number;
  readonly spending: number;
  readonly fixed: number;
  readonly incomeLines: readonly CategoryLine[];
  readonly spendingLines: readonly CategoryLine[];
  /** Money in that is not income: a fund cashed, a loan taken. */
  readonly oneOff: readonly Transaction[];
  readonly byMonth: readonly MonthTotals[];
  readonly overdraft?: Overdraft;
  /** Bank charges for a card replaced by the card's detail. */
  readonly replacedCardCharges: number;
  /** Cards paid from the bank account whose detail was not uploaded. */
  readonly undetailedCards: readonly string[];
  /** The account's balance at the end of each day with a line, over the months counted; one account only. */
  readonly balances: readonly { readonly date: string; readonly balance: number }[];
}

interface Classified extends Transaction {
  readonly category: CategoryId;
}

const monthOf = (date: string) => date.slice(0, 7);
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** Months a statement covers whole, give or take a few days a statement's first or last line can miss. */
function wholeMonths(statement: Statement): Set<string> {
  const months = new Set<string>();
  const [fromYear, fromMonth] = statement.from.split('-').map(Number) as [number, number];
  let year = fromYear;
  let month = fromMonth;
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > monthOf(statement.to)) {
      break;
    }
    const first = `${key}-04`;
    const last = `${key}-${String(daysIn(key) - 3).padStart(2, '0')}`;
    if (statement.from <= first && statement.to >= last) {
      months.add(key);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** "כספומט בנק הפועלים 25/10 18:33" and the same ATM another day are one payee. */
export const payeeOf = (description: string) =>
  description
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2}|\d{5,}|[0-9-]{8,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function lines(
  transactions: readonly Classified[],
  months: readonly string[],
  sign: 1 | -1,
): CategoryLine[] {
  const last = months[months.length - 1];
  const groups = new Map<CategoryId, Classified[]>();
  for (const transaction of transactions) {
    groups.set(transaction.category, [...(groups.get(transaction.category) ?? []), transaction]);
  }
  const count = months.length;
  return [...groups.entries()]
    .map(([id, members]) => {
      const total = sign * members.reduce((sum, transaction) => sum + transaction.amount, 0);
      const lastMonth = sign * members.filter((transaction) => monthOf(transaction.date) === last).reduce((sum, t) => sum + t.amount, 0);
      const payees = new Map<string, { total: number; count: number; months: Set<string>; standing: boolean }>();
      for (const transaction of members) {
        const name = payeeOf(transaction.description) || transaction.description;
        const entry = payees.get(name) ?? { total: 0, count: 0, months: new Set<string>(), standing: false };
        entry.months.add(monthOf(transaction.date));
        payees.set(name, {
          total: entry.total + sign * transaction.amount,
          count: entry.count + 1,
          months: entry.months,
          standing: entry.standing || !!transaction.kind?.includes('הוראת קבע'),
        });
      }
      const monthly = total / count;
      return {
        id,
        label: CATEGORY_LABELS[id],
        monthly,
        lastMonth,
        rising: count >= 3 && lastMonth > monthly * 1.3 && lastMonth - monthly > 200,
        payees: [...payees.entries()]
          .map(([description, entry]) => ({
            description,
            monthly: entry.total / count,
            count: entry.count,
            months: entry.months.size,
            standing: entry.standing,
          }))
          .sort((a, b) => b.monthly - a.monthly),
        transactions: members.length,
      };
    })
    .filter((line) => line.monthly > 0.5)
    .sort((a, b) => b.monthly - a.monthly);
}

/** Categories the borrower chose for a payee, by `payeeOf` name; they win over the rules. */
export type CategoryOverrides = Readonly<Record<string, CategoryId>>;

export function monthlyPicture(statements: readonly Statement[], overrides: CategoryOverrides = {}): MonthlyPicture | undefined {
  if (statements.length === 0) {
    return undefined;
  }
  const detailedCards = new Set(statements.filter((s) => s.source === 'CARD').flatMap((s) => s.cards));
  const hasCardDetail = statements.some((s) => s.source === 'CARD');

  let replacedCardCharges = 0;
  const undetailed = new Set<string>();
  const all: Classified[] = [];
  for (const statement of statements) {
    for (const transaction of statement.transactions) {
      if (isCardBill(transaction)) {
        const card = cardPaidBy(transaction);
        if (card ? detailedCards.has(card) : hasCardDetail) {
          replacedCardCharges += 1;
          continue;
        }
        undetailed.add(card ?? 'אשראי');
        all.push({ ...transaction, category: 'CARD_UNDETAILED' });
        continue;
      }
      const own = transaction.source === 'BANK' && transaction.amount > 0 ? undefined : overrides[payeeOf(transaction.description)];
      all.push({ ...transaction, category: own ?? categorize(transaction) });
    }
  }

  // Only months every statement covers whole: a month with the bank but not the card would miss its purchases.
  const covered = statements.map(wholeMonths);
  let months = [...covered[0]!].filter((month) => covered.every((set) => set.has(month))).sort();
  const partial = months.length === 0;
  if (partial) {
    months = [...new Set(all.map((transaction) => monthOf(transaction.date)))].sort();
  }
  const counted = all.filter((transaction) => months.includes(monthOf(transaction.date)));

  const incoming = counted.filter((transaction) => isIncome(transaction.category));
  const oneOff = counted.filter((transaction) => transaction.category === 'ONE_OFF_IN');
  const spent = counted.filter((transaction) => !isIncome(transaction.category) && transaction.category !== 'ONE_OFF_IN');

  const incomeLines = lines(incoming, months, 1);
  const spendingLines = lines(spent, months, -1);
  const income = incomeLines.reduce((sum, line) => sum + line.monthly, 0);
  const spending = spendingLines.reduce((sum, line) => sum + line.monthly, 0);
  const fixed =
    -spent
      .filter((transaction) => FIXED_CATEGORIES.has(transaction.category) || transaction.kind?.includes('הוראת קבע'))
      .reduce((sum, transaction) => sum + transaction.amount, 0) / months.length;

  const byMonth = months.map((month) => {
    const inMonth = (transaction: Classified) => monthOf(transaction.date) === month;
    return {
      month,
      income: incoming.filter(inMonth).reduce((sum, t) => sum + t.amount, 0),
      spending: -spent.filter(inMonth).reduce((sum, t) => sum + t.amount, 0),
    };
  });

  return {
    months,
    partial,
    income,
    spending,
    fixed: Math.max(0, Math.min(spending, fixed)),
    incomeLines,
    spendingLines,
    oneOff,
    byMonth,
    // The balance after every bank line, card charges included: those are when the account dips.
    overdraft: overdraftOf(
      statements.flatMap((statement) => statement.transactions).filter((transaction) => months.includes(monthOf(transaction.date))),
      counted,
      months,
    ),
    replacedCardCharges,
    undetailedCards: [...undetailed].sort(),
    balances: balancesOf(statements, months),
  };
}

/**
 * The day's closing balance, from a bank statement's balance column: the last line of each day.
 * Exports list newest first or oldest first; either way the file's order within a day is kept.
 * With two accounts there is no single balance, so nothing.
 */
export function balancesOf(statements: readonly Statement[], months: readonly string[]): { date: string; balance: number }[] {
  const banks = statements.filter((statement) => statement.source === 'BANK' && statement.transactions.some((t) => t.balance !== undefined));
  if (banks.length !== 1) {
    return [];
  }
  const lines = banks[0]!.transactions.filter((t) => t.balance !== undefined);
  const newestFirst = lines.length > 1 && lines[0]!.date > lines[lines.length - 1]!.date;
  const ordered = newestFirst ? [...lines].reverse() : lines;
  const closing = new Map<string, number>();
  for (const line of ordered) {
    closing.set(line.date, line.balance!);
  }
  return [...closing.entries()]
    .filter(([date]) => months.includes(monthOf(date)))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, balance]) => ({ date, balance }));
}

function overdraftOf(
  bankLines: readonly Transaction[],
  transactions: readonly Classified[],
  months: readonly string[],
): Overdraft | undefined {
  const withBalance = bankLines.filter((transaction) => transaction.source === 'BANK' && transaction.balance !== undefined);
  if (withBalance.length === 0) {
    return undefined;
  }
  let lowest = Infinity;
  let lowestDate = '';
  const below = new Set<string>();
  for (const transaction of withBalance) {
    if (transaction.balance! < lowest) {
      lowest = transaction.balance!;
      lowestDate = transaction.date;
    }
    if (transaction.balance! < 0) {
      below.add(monthOf(transaction.date));
    }
  }
  const interest = -transactions
    .filter((transaction) => transaction.category === 'FEES' && /משיכת יתר|מינוס/.test(transaction.description))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return {
    monthsBelow: below.size,
    months: months.length,
    lowest,
    lowestDate,
    interestMonthly: Math.max(0, interest / months.length),
  };
}
