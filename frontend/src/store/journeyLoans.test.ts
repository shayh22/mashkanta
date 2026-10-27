import { describe, expect, it } from 'vitest';
import type { ConsumerDebt } from '../engine/consolidation';
import { BANK_CSV, cardXlsx } from '../engine/money/__fixtures__/statements';
import { monthlyPicture } from '../engine/money/picture';
import { parseCsv, readXlsx } from '../engine/money/sheets';
import { readStatement } from '../engine/money/statementImport';
import { matchLoans, NOT_ON_STATEMENTS } from './journeyLoans';

const picture = async (overrides = {}) =>
  monthlyPicture([readStatement(parseCsv(BANK_CSV), 'b')!, readStatement(await readXlsx(await cardXlsx()), 'c')!], overrides)!;

const debt = (id: string, label: string, monthlyPayment: number): ConsumerDebt => ({
  id,
  kind: 'OTHER',
  label,
  balance: 20_000,
  annualRate: 0.05,
  monthlyPayment,
  remainingMonths: 30,
  include: true,
});

describe('one loan, counted once', () => {
  it('finds a report loan among charges filed under any category — a pension loan charged under the insurer', async () => {
    // "חנות הדוגמאות" is filed as "other" at 667 a month; the report's loan pays 690.
    const loans = matchLoans(await picture(), [debt('r1', 'הלוואה מהפנסיה', 690)]);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({
      key: 'חנות הדוגמאות',
      onStatements: true,
      fromReport: true,
      debtId: 'r1',
      reportLabel: 'הלוואה מהפנסיה',
      defaults: { balance: 20_000, annualRate: 0.05, remainingMonths: 30 },
    });
    expect(loans[0]!.monthly).toBeCloseTo(2_000 / 3, 6);
  });

  it('never takes the mortgage repayment for a report loan', async () => {
    const loans = matchLoans(await picture(), [debt('r1', 'הלוואה', 5_000)]);
    expect(loans).toEqual([expect.objectContaining({ key: 'debt:r1', onStatements: false, monthly: 5_000 })]);
  });

  it('stands a loan on its own when the household says it is paid elsewhere', async () => {
    const loans = matchLoans(await picture(), [debt('r1', 'הלוואה מהפנסיה', 690)], { r1: NOT_ON_STATEMENTS });
    expect(loans.map((loan) => loan.key)).toEqual(['debt:r1']);
  });

  it('follows the household’s link, even to a charge whose amount differs', async () => {
    const loans = matchLoans(await picture(), [debt('r1', 'הלוואת רכב', 1_000)], { r1: 'פז גז' });
    expect(loans).toEqual([expect.objectContaining({ key: 'פז גז', debtId: 'r1', onStatements: true })]);
  });

  it('keeps every charge filed as a loan, with or without a report', async () => {
    const loans = matchLoans(await picture({ 'קפה דוגמה': 'LOANS' }), []);
    expect(loans).toEqual([expect.objectContaining({ key: 'קפה דוגמה', fromReport: false, onStatements: true })]);
  });
});
