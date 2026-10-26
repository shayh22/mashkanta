import type { ConsumerDebt } from './consolidation';

/**
 * Reads a loan's amortization schedule (לוח סילוקין) — the table every lender issues, one row per
 * payment: its date, the principal and interest it pays, the total, and the balance left after it.
 *
 * Lenders lay the columns out differently, so the parser does not rely on their order. In each row
 * it finds the date and the three amounts where one is the sum of the other two (principal plus
 * interest makes the payment); the remaining amount is the balance. Which of the two parts is the
 * principal is settled by the balances themselves: it is the part the balance falls by.
 *
 * From the rows and today's date it derives what the consolidation tools need: the balance today,
 * the payment, the payments left, and the rate — printed in the header, or else implied by the
 * interest charged on the balance.
 */

export interface ScheduleRow {
  /** ISO date of the payment. */
  readonly date: string;
  readonly principal: number;
  readonly interest: number;
  readonly payment: number;
  /** Balance left after this payment. */
  readonly balance: number;
}

export interface ParsedSchedule {
  readonly rows: readonly ScheduleRow[];
  /** The date the figures below describe (today, unless the schedule has ended). */
  readonly asOf: string;
  readonly balance: number;
  readonly monthlyPayment: number;
  readonly remainingMonths: number;
  readonly paidCount: number;
  /** Annual nominal rate, as a fraction. */
  readonly annualRate: number;
  readonly rateSource: 'printed' | 'implied';
  readonly fixedRate?: boolean;
  /** What the loan is for, when the document says (car loans are the common case). */
  readonly purpose?: 'CAR';
  readonly warnings: readonly string[];
}

const DATE = /(?<!\d)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/;
const AMOUNT = /(?<![\d/.])-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?![\d/])|(?<![\d/.,])-?\d+(?:\.\d{1,2})?(?![\d/,])/g;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-4);
const parseAmount = (raw: string) => Number(raw.replace(/,/g, ''));

interface RawRow {
  readonly date: string;
  readonly amounts: number[];
}

function rawRows(text: string): RawRow[] {
  const rows: RawRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const date = DATE.exec(line);
    if (!date) {
      continue;
    }
    const [, day, month, year] = date;
    const rest = line.replace(date[0], ' ');
    const amounts = (rest.match(AMOUNT) ?? []).map(parseAmount).filter(Number.isFinite);
    if (amounts.length >= 4) {
      rows.push({ date: `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`, amounts });
    }
  }
  return rows;
}

/** In one row: the two parts and the sum among the amounts, and the balance — by position. */
function columnsOf(amounts: readonly number[]): { parts: [number, number]; sum: number; balance: number } | undefined {
  for (let k = 0; k < amounts.length; k++) {
    for (let i = 0; i < amounts.length; i++) {
      for (let j = i + 1; j < amounts.length; j++) {
        if (i === k || j === k || !near(amounts[i]! + amounts[j]!, amounts[k]!)) {
          continue;
        }
        const others = amounts.map((_, index) => index).filter((index) => index !== i && index !== j && index !== k);
        if (others.length === 0) {
          continue;
        }
        // The balance is the largest of what is left (a row may carry an index or a running count).
        const balance = others.reduce((best, index) => (amounts[index]! > amounts[best]! ? index : best));
        return { parts: [i, j], sum: k, balance };
      }
    }
  }
  return undefined;
}

/** The layout most rows agree on, so one odd row (a zero payment, a fee line) cannot mislead it. */
function dominantLayout(rows: readonly RawRow[]) {
  const votes = new Map<string, { count: number; layout: NonNullable<ReturnType<typeof columnsOf>> }>();
  for (const row of rows) {
    const layout = columnsOf(row.amounts);
    if (!layout) {
      continue;
    }
    const key = `${row.amounts.length}:${layout.parts.join(',')}:${layout.sum}:${layout.balance}`;
    const entry = votes.get(key) ?? { count: 0, layout };
    entry.count++;
    votes.set(key, entry);
  }
  const best = [...votes.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return best ? { width: Number(best[0].split(':')[0]), ...best[1].layout, count: best[1].count } : undefined;
}

export function isAmortizationSchedule(text: string): boolean {
  return /לוח\s*סילוקין|לוח\s*תשלומים/.test(text) || rawRows(text).length >= 6;
}

/** The rate printed in the header: the first percentage after the word ריבית, within a few lines. */
function printedRate(text: string): number | undefined {
  const match = /ריבית[^%]{0,80}?(\d{1,2}(?:\.\d{1,3})?)\s*%|ריבית[^%]{0,80}?%\s*(\d{1,2}(?:\.\d{1,3})?)/.exec(text);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value > 0 && value < 40 ? value / 100 : undefined;
}

export function parseAmortizationSchedule(redactedText: string, today: string): ParsedSchedule | null {
  const raw = rawRows(redactedText);
  const layout = dominantLayout(raw);
  if (!layout || layout.count < 3) {
    return null;
  }

  const parsed = raw
    .filter((row) => row.amounts.length === layout.width)
    .map((row) => ({
      date: row.date,
      a: row.amounts[layout.parts[0]]!,
      b: row.amounts[layout.parts[1]]!,
      payment: row.amounts[layout.sum]!,
      balance: row.amounts[layout.balance]!,
    }))
    .sort((x, y) => (x.date < y.date ? -1 : 1));

  // The principal is the part the balance falls by, row to row.
  let votesA = 0;
  let votesB = 0;
  for (let i = 1; i < parsed.length; i++) {
    const drop = parsed[i - 1]!.balance - parsed[i]!.balance;
    if (near(drop, parsed[i]!.a) && !near(drop, parsed[i]!.b)) votesA++;
    if (near(drop, parsed[i]!.b) && !near(drop, parsed[i]!.a)) votesB++;
  }
  const rows: ScheduleRow[] = parsed.map((row) => ({
    date: row.date,
    principal: votesB > votesA ? row.b : row.a,
    interest: votesB > votesA ? row.a : row.b,
    payment: row.payment,
    balance: row.balance,
  }));

  const warnings: string[] = [];
  const upcoming = rows.filter((row) => row.date > today);
  const paid = rows.filter((row) => row.date <= today);
  const first = rows[0]!;
  const balance = paid.length > 0 ? paid.at(-1)!.balance : first.balance + first.principal;
  if (upcoming.length === 0) {
    warnings.push('לפי לוח הסילוקין ההלוואה כבר נפרעה במלואה.');
  }

  // The payment the borrower makes from now on: the most common upcoming amount, so a final
  // rounding payment or an interest-only grace month does not stand in for it.
  const counts = new Map<number, number>();
  for (const row of upcoming) {
    counts.set(row.payment, (counts.get(row.payment) ?? 0) + 1);
  }
  const monthlyPayment = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;

  // The rate the interest implies: interest on a row over the balance before it, annualised —
  // from the next full payment, which reflects a variable rate as it is now.
  let implied: number | undefined;
  const next = rows.findIndex((row) => row.date > today && row.principal > 0);
  const at = next > 0 ? next : rows.findIndex((row, index) => index > 0 && row.principal > 0);
  if (at > 0 && rows[at - 1]!.balance > 0) {
    implied = Math.round((rows[at]!.interest / rows[at - 1]!.balance) * 12 * 10_000) / 10_000;
  }
  const printed = printedRate(redactedText);
  const annualRate = printed ?? implied ?? 0;
  if (printed !== undefined && implied !== undefined && Math.abs(printed - implied) > 0.0025) {
    warnings.push(
      `הריבית המודפסת (${(printed * 100).toFixed(2)}%) שונה מהריבית שעולה מהלוח (${(implied * 100).toFixed(2)}%) — בדקו מול הבנק.`,
    );
  }
  if (annualRate === 0) {
    warnings.push('לא זוהתה ריבית בלוח — עדכנו אותה ידנית.');
  }

  return {
    rows,
    asOf: upcoming.length === 0 ? rows.at(-1)!.date : today,
    balance: Math.max(0, Math.round(balance * 100) / 100),
    monthlyPayment,
    remainingMonths: upcoming.length,
    paidCount: paid.length,
    annualRate: Math.round(annualRate * 1e6) / 1e6,
    rateSource: printed !== undefined ? 'printed' : 'implied',
    ...(/קבועה/.test(redactedText) ? { fixedRate: true } : /משתנה|פריים/.test(redactedText) ? { fixedRate: false } : {}),
    ...(/רכב/.test(redactedText) ? { purpose: 'CAR' as const } : {}),
    warnings,
  };
}

/** The schedule as a debt for the consolidation check. */
export function scheduleToDebt(schedule: ParsedSchedule, id: string): ConsumerDebt {
  return {
    id,
    kind: schedule.purpose ?? 'OTHER',
    label: schedule.purpose === 'CAR' ? 'הלוואת רכב (לוח סילוקין)' : 'הלוואה (לוח סילוקין)',
    balance: schedule.balance,
    annualRate: schedule.annualRate,
    monthlyPayment: schedule.monthlyPayment,
    remainingMonths: Math.max(1, schedule.remainingMonths),
    include: true,
  };
}
