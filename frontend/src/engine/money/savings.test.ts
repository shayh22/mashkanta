import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, type CategoryId } from './categories';
import type { CategoryLine, MonthlyPicture, Payee } from './picture';
import type { Explanations } from './explanations';
import { knownSaving, recurringPayees, savingIdeas } from './savings';

const payee = (description: string, monthly: number, extra: Partial<Payee> = {}): Payee => ({
  description,
  monthly,
  count: 3,
  months: 3,
  standing: false,
  ...extra,
});

const line = (id: CategoryId, payees: Payee[], extra: Partial<CategoryLine> = {}): CategoryLine => {
  const monthly = payees.reduce((sum, p) => sum + p.monthly, 0);
  return { id, label: CATEGORY_LABELS[id], monthly, lastMonth: monthly, rising: false, payees, transactions: payees.length * 3, ...extra };
};

function picture(lines: CategoryLine[], extra: Partial<MonthlyPicture> = {}): MonthlyPicture {
  const spending = lines.reduce((sum, l) => sum + l.monthly, 0);
  return {
    months: ['2026-04', '2026-05', '2026-06'],
    partial: false,
    income: 15_000,
    spending,
    fixed: 0,
    incomeLines: [],
    spendingLines: lines,
    oneOff: [],
    byMonth: [],
    replacedCardCharges: 0,
    undetailedCards: [],
    ...extra,
  };
}

const kinds = (p: MonthlyPicture) => savingIdeas(p).map((idea) => idea.kind);

describe('where to save', () => {
  it('prices the overdraft by the interest it cost, and points to consolidation', () => {
    const ideas = savingIdeas(
      picture([], { overdraft: { monthsBelow: 2, months: 3, lowest: -12_000, lowestDate: '2026-05-18', interestMonthly: 40 } }),
    );
    expect(ideas[0]).toMatchObject({ kind: 'OVERDRAFT', monthly: 40, action: { href: '#/own' } });
    expect(ideas[0]!.detail).toContain('12,000');
    expect(ideas[0]!.detail).toContain('18.05');
  });

  it('counts fees, not interest reversals or tax, as fees', () => {
    const ideas = savingIdeas(
      picture([line('FEES', [payee('דמי כרטיס בנק דוגמה', 10), payee('עמלת פעולה', 8), payee('ביטול קבלת תשלום על יתרת זכות', 5), payee('תשלום מס במקור', 2)])]),
    );
    const fees = ideas.find((idea) => idea.kind === 'FEES')!;
    expect(fees.monthly).toBeCloseTo(18, 6);
    expect(fees.items!.map((item) => item.description)).toEqual(['דמי כרטיס בנק דוגמה', 'עמלת פעולה']);
  });

  it('finds subscriptions and standing orders, not a shop visited every week', () => {
    const p = picture([
      line('SUBSCRIPTIONS', [payee('שירות ענן דוגמה', 40)]),
      line('TELECOM', [payee('סלולר דוגמה', 60, { count: 6, standing: true }), payee('אינטרנט דוגמה', 90, { months: 2 })]),
      line('SHOPPING', [payee('חנות שבועית', 300, { count: 12 })]),
      line('GROCERIES', [payee('סופר דוגמה', 2_000)]),
    ]);
    expect(recurringPayees(p).map((item) => item.description)).toEqual(['סלולר דוגמה', 'שירות ענן דוגמה']);
    // Fewer than two whole months, or a partial period: nothing to call recurring.
    expect(recurringPayees({ ...p, partial: true })).toEqual([]);
  });

  it('a category up last month saves the difference by going back to its average; cash is its own idea', () => {
    const ideas = savingIdeas(
      picture([
        line('DINING', [payee('מסעדה דוגמה', 500)], { rising: true, lastMonth: 900 }),
        line('CASH', [payee('כספומט דוגמה', 1_500)], { rising: true, lastMonth: 3_000 }),
        line('GROCERIES', [payee('סופר דוגמה', 10_000)]),
      ]),
    );
    expect(ideas.find((idea) => idea.kind === 'RISING')).toMatchObject({ monthly: 400 });
    expect(ideas.filter((idea) => idea.kind === 'RISING')).toHaveLength(1);
    expect(ideas.find((idea) => idea.kind === 'CASH')!.detail).toContain('3,000');
  });

  it('sends several insurances to the policy register, and a large mortgage to its check', () => {
    expect(kinds(picture([line('INSURANCE', [payee('ביטוח חיים דוגמה', 200), payee('ביטוח דירה דוגמה', 90)])]))).toContain('INSURANCE');
    expect(kinds(picture([line('INSURANCE', [payee('ביטוח חיים דוגמה', 200)])]))).not.toContain('INSURANCE');
    expect(kinds(picture([line('HOUSING_LOANS', [payee('משכנתא דוגמה', 5_000)])]))).toContain('MORTGAGE');
  });

  it('adds up only the savings the statements show', () => {
    const ideas = savingIdeas(
      picture([line('FEES', [payee('דמי כרטיס דוגמה', 10)]), line('INSURANCE', [payee('א', 1), payee('ב', 1)])], {
        overdraft: { monthsBelow: 1, months: 3, lowest: -100, lowestDate: '2026-04-02', interestMonthly: 20 },
      }),
    );
    expect(knownSaving(ideas)).toBeCloseTo(30, 6);
  });

  it("puts the household's own word first: what it marked to cancel is a saving, what to cut is a list", () => {
    const p = picture([
      line('SUBSCRIPTIONS', [payee('סטרימינג דוגמה', 60), payee('ענן דוגמה', 30)]),
      line('DINING', [payee('מסעדה דוגמה', 500)]),
    ]);
    const explanations: Explanations = {
      'סטרימינג דוגמה': { flexibility: 'CANCEL' },
      'מסעדה דוגמה': { flexibility: 'REDUCE', note: 'ארוחות עבודה' },
      'ענן דוגמה': { flexibility: 'MUST' },
    };
    const ideas = savingIdeas(p, explanations);
    expect(ideas[0]).toMatchObject({ kind: 'CANCEL', monthly: 60 });
    expect(ideas[1]).toMatchObject({ kind: 'REDUCE' });
    expect(ideas[1]!.monthly).toBeUndefined();
    // Explained charges are no longer "to review".
    expect(recurringPayees(p, explanations)).toEqual([]);
    expect(recurringPayees(p).map((item) => item.description)).toEqual(['סטרימינג דוגמה', 'ענן דוגמה']);
  });

  it('points loans, apart from the mortgage, to consolidation', () => {
    const ideas = savingIdeas(picture([line('LOANS', [payee('הלוואה מהפנסיה', 3_200)]), line('HOUSING_LOANS', [payee('משכנתא', 5_000)])]));
    expect(ideas.find((idea) => idea.kind === 'LOANS')).toMatchObject({ action: { href: '#/own' } });
    expect(ideas.find((idea) => idea.kind === 'MORTGAGE')!.detail).toContain('5,000');
  });
});
