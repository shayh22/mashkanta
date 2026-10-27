import { describe, expect, it } from 'vitest';
import { waffleCells } from '../../lib/waffle';
import { BANK_CSV, cardXlsx } from './__fixtures__/statements';
import { factsFor, MAX_QUESTION_LENGTH, toConsultAnswer, validateConsultRequest } from './consultRequest';
import { decisionsOf, freedBy } from './decisions';
import { flexibilityRows } from './flexibility';
import { balancesOf, monthlyPicture } from './picture';
import { parseCsv, readXlsx } from './sheets';
import { readStatement } from './statementImport';

const bank = readStatement(parseCsv(BANK_CSV), 'b')!;
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

describe('the AI box on each screen', () => {
  it('sends the screen’s totals under fixed labels, never a business name', async () => {
    const picture = await both();
    const spending = factsFor('spending', picture, { 'חנות הדוגמאות': { flexibility: 'CANCEL', note: 'פרטי' } });
    expect(spending.find((fact) => fact.label === 'סופר ומזון')).toEqual({ label: 'סופר ומזון', value: 2_000 });
    expect(spending.find((fact) => fact.label === 'אחר — אפשר לבטל')?.value).toBe(667);
    for (const step of ['flow', 'spending', 'debts', 'savings', 'summary'] as const) {
      const sent = JSON.stringify(factsFor(step, picture));
      for (const secret of ['רמי לוי', 'חנות הדוגמאות', 'משכורת חברת', '2026-', '1111']) {
        expect(sent).not.toContain(secret);
      }
    }
    expect(factsFor('flow', picture).find((fact) => fact.label === 'היתרה הנמוכה ביותר')?.value).toBe(-44_360);
  });

  it('accepts exactly its shape, and holds the answer to its length', () => {
    const facts = [{ label: 'הכנסה', value: 15_000 }];
    expect(validateConsultRequest({ step: 'flow', question: ' בונוס\nבאוגוסט ', facts, extra: 1 })).toEqual({ step: 'flow', question: 'בונוס באוגוסט', facts });
    expect(validateConsultRequest({ step: 'files', question: 'שאלה', facts })).toBe('bad step');
    expect(validateConsultRequest({ step: 'flow', question: 'אב', facts })).toBe('bad question');
    expect(validateConsultRequest({ step: 'flow', question: 'א'.repeat(MAX_QUESTION_LENGTH + 1), facts })).toBe('bad question');
    expect(validateConsultRequest({ step: 'flow', question: 'שאלה', facts: [] })).toBe('bad facts');
    expect(validateConsultRequest({ step: 'flow', question: 'שאלה', facts: [{ label: 'x', value: 'y' }] })).toBe('bad fact');
    expect(toConsultAnswer({ answer: 'א'.repeat(700), points: ['1', '', '2', '3', '4'] })).toEqual({ answer: 'א'.repeat(600), points: ['1', '2', '3'] });
    expect(toConsultAnswer({ points: [] })).toBeNull();
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

  it('splits each category by what the household said, with the line after cancellations', async () => {
    const rows = flexibilityRows(await both(), { 'חנות הדוגמאות': { flexibility: 'CANCEL' }, 'רמי לוי סניף דוגמה': { flexibility: 'MUST' } });
    expect(rows.find((row) => row.key === 'GROCERIES')).toMatchObject({ must: 2_000, open: 0 });
    const other = rows.find((row) => row.key === 'OTHER')!;
    expect(other.cancel).toBeCloseTo(2_000 / 3, 6);
    expect(other.target).toBeCloseTo(0, 6);
    expect(rows.some((row) => row.key === 'CARD_UNDETAILED')).toBe(false);
  });
});

describe('the waffle', () => {
  it('always fills exactly 100 cells, by largest remainder', () => {
    expect(waffleCells([1, 1, 1])).toEqual([34, 33, 33]);
    expect(waffleCells([50, 30, 20])).toEqual([50, 30, 20]);
    expect(waffleCells([2, 1, -5, Number.NaN]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(waffleCells([0, 0])).toEqual([0, 0]);
  });
});
