import { describe, expect, it } from 'vitest';
import { payment } from './math';
import { isAmortizationSchedule, parseAmortizationSchedule, scheduleToDebt } from './schedule';

/**
 * A synthetic schedule: 100,000 at 6% over 36 payments after two interest-only months, paid on
 * the 10th from January 2026. Built here rather than copied from a real document.
 */
function schedule(order: 'bank' | 'reversed', header = 'שיעור ריבית נומינלית שנתית 6%\nסוג הריבית קבועה'): string {
  const rate = 0.06 / 12;
  const lines = [header, 'לוח סילוקין'];
  let balance = 100_000;
  const instalment = payment(balance, rate, 36);
  for (let n = 0; n < 38; n++) {
    const date = new Date(Date.UTC(2026, n, 10));
    const stamp = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    const interest = Math.round(balance * rate * 100) / 100;
    const principal = n < 2 ? 0 : Math.round(Math.min(balance, instalment - interest) * 100) / 100;
    balance = Math.round((balance - principal) * 100) / 100;
    const total = Math.round((principal + interest) * 100) / 100;
    const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cells = [stamp, money(principal), money(interest), money(total), money(balance)];
    lines.push((order === 'bank' ? cells : [...cells].reverse()).join(' '));
  }
  return lines.join('\n');
}

describe('amortization schedule', () => {
  it('reads balance today, payment, payments left and the printed rate', () => {
    const parsed = parseAmortizationSchedule(schedule('bank'), '2026-06-20')!;
    expect(parsed.rows).toHaveLength(38);
    expect(parsed.paidCount).toBe(6);
    expect(parsed.remainingMonths).toBe(32);
    expect(parsed.balance).toBe(parsed.rows[5]!.balance);
    expect(parsed.monthlyPayment).toBeCloseTo(payment(100_000, 0.005, 36), 1);
    expect(parsed).toMatchObject({ annualRate: 0.06, rateSource: 'printed', fixedRate: true, warnings: [] });
    // Interest-only months come first: principal is told apart from interest by the balances.
    expect(parsed.rows[0]).toMatchObject({ principal: 0, interest: 500 });
    expect(parsed.rows[2]!.principal).toBeGreaterThan(parsed.rows[2]!.interest);
  });

  it('does not depend on the order of the columns', () => {
    const bank = parseAmortizationSchedule(schedule('bank'), '2026-06-20')!;
    const reversed = parseAmortizationSchedule(schedule('reversed'), '2026-06-20')!;
    expect(reversed.rows).toEqual(bank.rows);
    expect(reversed.balance).toBe(bank.balance);
  });

  it('works out the rate from the interest when none is printed, and flags a mismatch', () => {
    const implied = parseAmortizationSchedule(schedule('bank', 'לוח סילוקין'), '2026-06-20')!;
    expect(implied.rateSource).toBe('implied');
    expect(implied.annualRate).toBeCloseTo(0.06, 3);

    const mismatch = parseAmortizationSchedule(schedule('bank', 'שיעור ריבית 7.5%'), '2026-06-20')!;
    expect(mismatch.annualRate).toBe(0.075);
    expect(mismatch.warnings[0]).toContain('שונה מהריבית שעולה מהלוח');
  });

  it('before the first payment and after the last', () => {
    const early = parseAmortizationSchedule(schedule('bank'), '2025-12-01')!;
    expect(early).toMatchObject({ paidCount: 0, remainingMonths: 38, balance: 100_000 });
    const late = parseAmortizationSchedule(schedule('bank'), '2030-01-01')!;
    expect(late.remainingMonths).toBe(0);
    expect(late.warnings[0]).toContain('נפרעה');
  });

  it('turns into a debt for consolidation, a car loan when the document says so', () => {
    const parsed = parseAmortizationSchedule(`הלוואה לרכישת רכב\n${schedule('bank')}`, '2026-06-20')!;
    expect(scheduleToDebt(parsed, 'x')).toMatchObject({
      id: 'x',
      kind: 'CAR',
      balance: parsed.balance,
      annualRate: 0.06,
      remainingMonths: 32,
      include: true,
    });
  });

  it('is not fooled by text that only mentions dates and amounts', () => {
    const letter = 'תאריך 01/02/2026 יתרה 100,000\nתאריך 01/03/2026 יתרה 99,000';
    expect(isAmortizationSchedule(letter)).toBe(false);
    expect(parseAmortizationSchedule(letter, '2026-06-20')).toBeNull();
  });
});
