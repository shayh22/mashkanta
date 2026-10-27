import type { Cell, Row } from './sheets';

/**
 * A bank or card statement, whatever its layout, as a list of transactions. The header row is found
 * by its column names — the ones Israeli banks and card companies use — so a title above it, or
 * totals and notes below, are skipped.
 */

export type StatementSource = 'BANK' | 'CARD';

export interface Transaction {
  readonly id: string;
  /** ISO date, YYYY-MM-DD: the purchase for a card, the booking for a bank account. */
  readonly date: string;
  readonly description: string;
  /** Signed, in shekels: money in is positive, money out negative. */
  readonly amount: number;
  readonly source: StatementSource;
  /** Last four digits of the card, where the statement says. */
  readonly card?: string;
  /** The card company's word for the deal: immediate, standing order, cash withdrawal… */
  readonly kind?: string;
  /** The account balance after it, on a bank statement. */
  readonly balance?: number;
}

export interface Statement {
  readonly source: StatementSource;
  readonly transactions: readonly Transaction[];
  /** First and last date in it. */
  readonly from: string;
  readonly to: string;
  readonly cards: readonly string[];
}

const COLUMNS = {
  date: ['תאריךעסקה', 'תאריךרכישה', 'תאריךהעסקה', 'תאריך'],
  description: ['שםביתעסק', 'שםביתהעסק', 'תיאורהתנועה', 'תיאור', 'פרטים', 'הפעולה', 'סוגתנועה'],
  amount: ['סכוםבשח', 'סכוםחיוב', 'סכוםהחיוב', 'זכותחובה', 'סכום'],
  debit: ['חובה'],
  credit: ['זכות'],
  balance: ['יתרה', 'יתרהבשח'],
  card: ['כרטיס', '4ספרותאחרונותשלכרטיסהאשראי', 'ספרותאחרונות'],
  kind: ['סוגעסקה'],
} as const;

type Column = keyof typeof COLUMNS;

/** A header cell without spaces, punctuation or currency signs: "סכום\nבש\"ח" → "סכוםבשח". */
const normalize = (cell: Cell) => String(cell ?? '').replace(/[\s"'״׳₪/\\.:()-]/g, '');

function findColumns(row: Row): Partial<Record<Column, number>> | undefined {
  const names = row.map(normalize);
  const found: Partial<Record<Column, number>> = {};
  for (const column of Object.keys(COLUMNS) as Column[]) {
    // The most specific name wins: "תאריך עסקה" over "תאריך", "סכום בש"ח" over "סכום".
    for (const name of COLUMNS[column]) {
      const index = names.findIndex((cell, i) => cell === name && !Object.values(found).includes(i));
      if (index >= 0) {
        found[column] = index;
        break;
      }
    }
  }
  const hasAmount = found.amount !== undefined || (found.debit !== undefined && found.credit !== undefined);
  return found.date !== undefined && found.description !== undefined && hasAmount ? found : undefined;
}

/** 1899-12-30 is day 0 of Excel's calendar. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function parseDate(cell: Cell): string | undefined {
  if (typeof cell === 'number') {
    if (cell < 20_000 || cell > 80_000) {
      return undefined;
    }
    return new Date(EXCEL_EPOCH + Math.round(cell) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(cell ?? '').trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return undefined;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined;
}

export function parseAmount(cell: Cell): number | undefined {
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : undefined;
  }
  let text = String(cell ?? '').replace(/[₪,\s‎‏]/g, '');
  if (text === '') {
    return undefined;
  }
  // "123-" and "(123)" are how some exports write a debit.
  let sign = 1;
  if (/^\(.*\)$/.test(text) || /-$/.test(text)) {
    sign = -1;
    text = text.replace(/[()]|-$/g, '');
  }
  const value = Number(text);
  return Number.isFinite(value) ? sign * value : undefined;
}

const cardDigits = (cell: Cell) => /(\d{4})\D*$/.exec(String(cell ?? ''))?.[1];

/** The statement in the rows, or undefined when no header row names a date, a description and an amount. */
export function readStatement(rows: readonly Row[], fileId = 'f'): Statement | undefined {
  const headerAt = rows.slice(0, 30).findIndex((row) => findColumns(row));
  if (headerAt < 0) {
    return undefined;
  }
  const columns = findColumns(rows[headerAt]!)!;
  // A card statement names the card or the business; a bank statement neither.
  const source: StatementSource =
    columns.card !== undefined || normalize(rows[headerAt]![columns.description!] ?? null).includes('ביתעסק') ? 'CARD' : 'BANK';
  const transactions: Transaction[] = [];
  rows.slice(headerAt + 1).forEach((row, index) => {
    const date = parseDate(row[columns.date!] ?? null);
    const description = String(row[columns.description!] ?? '').replace(/\s+/g, ' ').trim();
    let amount =
      columns.amount !== undefined
        ? parseAmount(row[columns.amount] ?? null)
        : (parseAmount(row[columns.credit!] ?? null) ?? 0) - (parseAmount(row[columns.debit!] ?? null) ?? 0);
    if (!date || !description || amount === undefined || amount === 0) {
      return;
    }
    // A card statement lists what was spent as a positive amount.
    if (source === 'CARD') {
      amount = -amount;
    }
    const balance = columns.balance !== undefined ? parseAmount(row[columns.balance] ?? null) : undefined;
    const card = columns.card !== undefined ? cardDigits(row[columns.card] ?? null) : undefined;
    const kind = columns.kind !== undefined ? String(row[columns.kind] ?? '').trim() || undefined : undefined;
    transactions.push({
      id: `${fileId}:${headerAt + 1 + index}`,
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      source,
      ...(card ? { card } : {}),
      ...(kind ? { kind } : {}),
      ...(balance !== undefined ? { balance } : {}),
    });
  });
  if (transactions.length === 0) {
    return undefined;
  }
  const dates = transactions.map((transaction) => transaction.date).sort();
  return {
    source,
    transactions,
    from: dates[0]!,
    to: dates[dates.length - 1]!,
    cards: [...new Set(transactions.flatMap((transaction) => (transaction.card ? [transaction.card] : [])))].sort(),
  };
}
