import { describe, expect, it } from 'vitest';
import { BANK_CSV, cardXlsx } from './__fixtures__/statements';
import { decisionsOf, defaultExtendYears, freedBy, loanDecision, mortgageDecision } from './decisions';
import { balancesOf, monthlyPicture } from './picture';
import { parseCsv, readXlsx } from './sheets';
import { readStatement } from './statementImport';

const bank = readStatement(parseCsv(BANK_CSV), 'b')!;
const loanOf = (name: string, monthly: number, key = name) => ({ key, name, monthly });
const both = async () => monthlyPicture([bank, readStatement(await readXlsx(await cardXlsx()), 'c')!])!;

describe('the balance line', () => {
  it('takes each day’s last line, in a newest-first export, over the months counted', () => {
    const balances = balancesOf([bank], ['2026-04', '2026-05', '2026-06']);
    // 10.06 has two lines; the later one (listed first) closes the day.
    expect(balances.find((point) => point.date === '2026-06-10')).toEqual({ date: '2026-06-10', balance: -16_660 });
    expect(balances[0]).toEqual({ date: '2026-04-01', balance: -33_360 });
    expect(balances.map((point) => point.date)).toEqual([...balances.map((point) => point.date)].sort());
  });

  it('has no single line for two accounts', () => {
    expect(balancesOf([bank, { ...bank, transactions: bank.transactions.map((t) => ({ ...t, id: `x${t.id}` })) }], ['2026-04'])).toEqual([]);
  });
});

describe('the decisions in the summary', () => {
  it('offers the priced savings, and counts a category once when the advisor sets its target', async () => {
    const picture = await both();
    const explanations = { 'חנות הדוגמאות': { flexibility: 'CANCEL' as const } };
    const without = decisionsOf(picture, explanations);
    expect(without.map((d) => d.key)).toEqual(['cancel', 'overdraft']);
    expect(without[0]!.monthly).toBeCloseTo(2_000 / 3, 6);
    // The advisor's target for "other" stands for it: the cancellation is not added on top.
    const withTarget = decisionsOf(picture, explanations, [{ category: 'OTHER', current: 667, target: 300 }]);
    expect(withTarget.map((d) => d.key)).toEqual(['overdraft', 'target:OTHER']);
    expect(freedBy(withTarget, new Set(['overdraft', 'target:OTHER']))).toBeCloseTo(30 + 367, 6);
    expect(freedBy(withTarget, new Set(['overdraft']))).toBeCloseTo(30, 6);
  });

  it('counts the overdraft’s interest once, whether marked to cancel or under the advisor’s fee target', async () => {
    const picture = await both();
    const interest = { 'תשלום ריבית על משיכת יתר- מינוס': { flexibility: 'CANCEL' as const } };
    expect(decisionsOf(picture, interest).map((d) => d.key)).toEqual(['overdraft']);
    expect(decisionsOf(picture, {}, [{ category: 'FEES', current: 30, target: 0 }]).map((d) => d.key)).toEqual(['target:FEES']);
  });

  it('counts a fee once: not under fees when marked to cancel, nor when it is the overdraft’s', () => {
    const fee = (id: string, month: string, description: string, amount: number) => ({ id, date: `${month}-03`, description, amount, source: 'BANK' as const });
    const months = ['2026-04', '2026-05', '2026-06'];
    const extra = months.flatMap((month, i) => [fee(`f${i}`, month, 'דמי כרטיס', -20), fee(`g${i}`, month, 'עמלת משיכת יתר', -10)]);
    const picture = monthlyPicture([{ ...bank, transactions: [...bank.transactions, ...extra] }])!;
    const overdraft = decisionsOf(picture, {}).find((d) => d.key === 'overdraft')!.monthly;
    // The overdraft's fee is in its interest; the card fee alone is under fees.
    expect(decisionsOf(picture, {}).find((d) => d.key === 'fees')!.monthly).toBeCloseTo(20, 6);
    const cancelled = decisionsOf(picture, { 'דמי כרטיס': { flexibility: 'CANCEL' } });
    expect(cancelled.map((d) => d.key)).toEqual(['cancel', 'overdraft']);
    expect(freedBy(cancelled, new Set(cancelled.map((d) => d.key)))).toBeCloseTo(20 + overdraft, 6);
  });
});

describe('moves on the loans screen, as decisions', () => {
  const plan = { balance: 20_000, annualRate: 0.06, remainingMonths: 36 };

  it('prices a balloon against the payment the statements show, and says what it costs', () => {
    const decision = loanDecision(loanOf('הלוואה דוגמה', 667), { ...plan, move: 'BALLOON' })!;
    expect(decision.monthly).toBeCloseTo(567, 6);
    expect(decision.label).toBe('הלוואה דוגמה: בלון');
    expect(decision.note).toContain('20,000');
    expect(decision.source).toBe('debts');
  });

  it('keeps two loans of the same name apart, and never prices a move as cheaper than keeping', () => {
    const one = loanDecision(loanOf('הלוואה', 667, 'debt:a'), { ...plan, move: 'BALLOON' })!;
    const two = loanDecision(loanOf('הלוואה', 667, 'debt:b'), { ...plan, move: 'BALLOON' })!;
    expect(one.key).not.toBe(two.key);
    // A stated payment well above the terms' (insurance riding on it) still costs the balloon its extra interest.
    expect(loanDecision(loanOf('הלוואה', 1_500), { ...plan, move: 'BALLOON' })!.note).not.toContain('-');
  });

  it('spreads a loan over twice what is left by default, or as chosen', () => {
    expect(defaultExtendYears(36)).toBe(6);
    expect(defaultExtendYears(300)).toBe(40);
    expect(loanDecision(loanOf('ה', 667), { ...plan, move: 'EXTEND' })!.label).toBe('ה: פריסה ל-6 שנים');
    expect(loanDecision(loanOf('ה', 667), { ...plan, move: 'EXTEND', extendYears: 10 })!.label).toBe('ה: פריסה ל-10 שנים');
  });

  it('is nothing while the loan is kept, its terms are missing, or nothing is freed', () => {
    expect(loanDecision(loanOf('ה', 667), { ...plan, move: 'KEEP' })).toBeUndefined();
    expect(loanDecision(loanOf('ה', 667), { move: 'BALLOON', balance: 20_000 })).toBeUndefined();
    expect(loanDecision(loanOf('ה', 667), undefined)).toBeUndefined();
    // A balloon dearer than the payment frees nothing.
    expect(loanDecision(loanOf('ה', 50), { ...plan, move: 'BALLOON' })).toBeUndefined();
  });

  it('counts a refinance only when it lowers the payment, with its cost', () => {
    expect(mortgageDecision({ currentPayment: 6_000, proposedPayment: 5_400, upfrontCost: 3_000 })).toMatchObject({
      monthly: 600,
      note: 'עלות מעבר 3,000 ₪',
    });
    expect(mortgageDecision({ currentPayment: 6_000, proposedPayment: 6_100, upfrontCost: 0 })).toBeUndefined();
    expect(mortgageDecision(undefined)).toBeUndefined();
  });
});

