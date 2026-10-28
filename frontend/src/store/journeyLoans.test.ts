import { describe, expect, it } from 'vitest';
import type { ConsumerDebt } from '../engine/consolidation';
import { BANK_CSV, cardXlsx } from '../engine/money/__fixtures__/statements';
import { monthlyPicture } from '../engine/money/picture';
import { parseCsv, readXlsx } from '../engine/money/sheets';
import { readStatement } from '../engine/money/statementImport';
import { matchLoans, NOT_ON_STATEMENTS, planOf } from './journeyLoans';

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
  it('finds a report loan among the charges that look like one — a pension loan charged under the insurer', async () => {
    // "חנות הדוגמאות", filed here under insurance, at 667 a month; the report's loan pays 690.
    const loans = matchLoans(await picture({ 'חנות הדוגמאות': 'INSURANCE' }), [debt('r1', 'הלוואה מהפנסיה', 690)]);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({
      key: 'debt:r1',
      name: 'חנות הדוגמאות',
      onStatements: true,
      fromReport: true,
      debtId: 'r1',
      reportLabel: 'הלוואה מהפנסיה',
      defaults: { balance: 20_000, annualRate: 0.05, remainingMonths: 30 },
    });
    expect(loans[0]!.monthly).toBeCloseTo(2_000 / 3, 6);
  });

  it('never guesses a shop’s charge of the same size is the loan, but takes it when the household links it', async () => {
    // As "other", with a refund among its charges, the shop does not look like a loan's repayment.
    const guessed = matchLoans(await picture(), [debt('r1', 'הלוואה', 690)]);
    expect(guessed).toEqual([expect.objectContaining({ key: 'debt:r1', onStatements: false })]);
    const linked = matchLoans(await picture(), [debt('r1', 'הלוואה', 690)], { r1: 'חנות הדוגמאות' });
    expect(linked).toEqual([expect.objectContaining({ key: 'debt:r1', name: 'חנות הדוגמאות', onStatements: true })]);
  });

  it('honours the household’s link before guessing for another loan', async () => {
    const insured = await picture({ 'חנות הדוגמאות': 'INSURANCE' });
    // r1 would be guessed onto the insurer's charge; r2 is linked to it, and wins it.
    const loans = matchLoans(insured, [debt('r1', 'הלוואה א', 690), debt('r2', 'הלוואה ב', 650)], { r2: 'חנות הדוגמאות' });
    expect(loans.find((loan) => loan.onStatements)).toMatchObject({ debtId: 'r2' });
    expect(loans.find((loan) => !loan.onStatements)).toMatchObject({ key: 'debt:r1' });
  });

  it('keeps a report loan’s plan through linking, and a charge’s plan when a report is linked to it', async () => {
    const plans = { 'debt:r1': { move: 'BALLOON' as const }, 'קפה דוגמה': { move: 'EXTEND' as const, balance: 9_000 } };
    const standalone = matchLoans(await picture(), [debt('r1', 'הלוואה', 690)])[0]!;
    const linked = matchLoans(await picture(), [debt('r1', 'הלוואה', 690)], { r1: 'חנות הדוגמאות' })[0]!;
    expect(planOf(standalone, plans).move).toBe('BALLOON');
    expect(planOf(linked, plans).move).toBe('BALLOON');
    const charge = matchLoans(await picture({ 'קפה דוגמה': 'LOANS' }), [debt('r2', 'הלוואה', 150)], { r2: 'קפה דוגמה' })[0]!;
    expect(charge.key).toBe('debt:r2');
    expect(planOf(charge, plans)).toMatchObject({ move: 'EXTEND', balance: 9_000 });
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
    expect(loans).toEqual([expect.objectContaining({ key: 'debt:r1', name: 'פז גז', debtId: 'r1', onStatements: true })]);
  });

  it('keeps every charge filed as a loan, with or without a report', async () => {
    const loans = matchLoans(await picture({ 'קפה דוגמה': 'LOANS' }), []);
    expect(loans).toEqual([expect.objectContaining({ key: 'קפה דוגמה', fromReport: false, onStatements: true })]);
  });
});
