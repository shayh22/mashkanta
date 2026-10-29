import { describe, expect, it } from 'vitest';
import { tasksFor } from './tasks';

const ids = (input: Parameters<typeof tasksFor>[0]) => tasksFor(input).map((task) => task.id);

describe('what to do now', () => {
  it('sends a buyer to the banks with the mix, missing equity and eligibility first', () => {
    const tasks = tasksFor({
      goals: ['BUY'],
      answers: { hasEligibility: 'UNKNOWN' },
      buy: { equityShort: 100_000, cheapestBank: 'בנק לדוגמה', mix: 'קבועה לא צמודה 60%, פריים 40%' },
    });
    expect(tasks.map((task) => task.id)).toEqual(['buy-equity', 'buy-eligibility', 'buy-approval', 'buy-mix', 'buy-cheapest']);
    expect(tasks[0]!.text).toContain('100,000');
    expect(tasks.at(-1)!.text).toBe('להתחיל מבנק לדוגמה, הזול לתמהיל הזה');
  });

  it('asks a homeowner for the report, or for the offer and the fee, or to wait', () => {
    expect(ids({ goals: ['REFINANCE'], answers: {}, refinance: { exact: false } })).toEqual(['refi-report']);
    expect(ids({ goals: ['REFINANCE'], answers: { hasLoans: 'YES' }, refinance: { exact: true, verdict: 'IMMEDIATE', route: 'EXTERNAL' } })).toEqual([
      'refi-offer',
      'refi-fee',
      'refi-loans',
    ]);
    expect(tasksFor({ goals: ['REFINANCE'], answers: {}, refinance: { exact: true, verdict: 'IMMEDIATE', route: 'EXTERNAL' } })[0]!.text).toContain('מבנק אחר');
    expect(ids({ goals: ['REFINANCE'], answers: {}, refinance: { exact: true, verdict: 'NOT_WORTHWHILE', route: 'INTERNAL' } })).toEqual(['refi-later']);
  });

  it('lists each charge marked to cancel or cut, by name, then the overdraft and the fees', () => {
    const tasks = tasksFor({
      goals: ['RECOVERY'],
      answers: {},
      recovery: { hasStatements: true, cancel: ['מנוי דוגמה'], reduce: ['חנות דוגמה'], overdraft: true, fees: true },
    });
    expect(tasks.map((task) => task.text)).toEqual([
      'לבטל: מנוי דוגמה',
      'לצמצם: חנות דוגמה',
      'לסגור את המינוס: לבדוק הלוואה בריבית נמוכה מריבית המינוס',
      'לבקש מהבנק מסלול עמלות בסיסי, ולוותר על דמי כרטיס',
    ]);
    expect(ids({ goals: ['RECOVERY'], answers: {}, recovery: { hasStatements: false, cancel: [], reduce: [], overdraft: false, fees: false } })).toEqual(['rec-statements']);
  });

  it('asks the lender for each loan move kept, and for a refinance kept where it is not the goal', () => {
    const recovery = { hasStatements: true, cancel: [], reduce: [], overdraft: false, fees: false, loanMoves: [{ key: 'loan:car', label: 'רכב: בלון' }], mortgage: true };
    expect(tasksFor({ goals: ['BUY'], answers: {}, recovery }).map((task) => task.text)).toEqual(['לבקש מהמלווה: רכב: בלון', 'לבקש הצעת מיחזור למשכנתא, לפי התמהיל החדש']);
    expect(ids({ goals: ['REFINANCE'], answers: {}, recovery })).toEqual(['loan:car']);
    expect(ids({ goals: ['REFINANCE'], answers: {}, recovery: { ...recovery, loanMoves: [], consolidate: true } })).toEqual(['rec-consolidate']);
  });

  it('takes the cheapest offer forward, or a single one to the other banks', () => {
    expect(tasksFor({ goals: ['BUY'], answers: {}, offers: [{ goal: 'BUY', best: 'בנק א', count: 3 }] })[0]!.text).toBe(
      'להתקדם עם בנק א, הזולה מבין 3 ההצעות, או להציג אותה לבנקים האחרים',
    );
    expect(tasksFor({ goals: ['REFINANCE'], answers: {}, offers: [{ goal: 'REFINANCE', best: 'בנק ב', count: 1 }] })[0]!.text).toContain('לבנקים נוספים');
    expect(ids({ goals: ['BUY'], answers: {}, offers: [{ goal: 'REFINANCE', best: 'בנק ב', count: 1 }] })).toEqual([]);
  });

  it('does not ask again for a step already taken: offers in hand, or the loans’ consolidation decided', () => {
    const buy = { equityShort: 0, cheapestBank: 'בנק לדוגמה', mix: 'פריים 100%' };
    // Offers for the purchase stand for asking the banks, and for the estimate of the cheapest.
    expect(ids({ goals: ['BUY'], answers: {}, buy, offers: [{ goal: 'BUY', best: 'בנק א', count: 1 }] })).toEqual(['buy-mix', 'offer-BUY']);
    // Offers for a refinance do not count for the purchase.
    expect(ids({ goals: ['BUY'], answers: {}, buy, offers: [{ goal: 'REFINANCE', best: 'בנק א', count: 1 }] })).toEqual(['buy-approval', 'buy-mix', 'buy-cheapest']);

    const refinance = { exact: true, verdict: 'IMMEDIATE', route: 'EXTERNAL' } as const;
    expect(ids({ goals: ['REFINANCE'], answers: {}, refinance, offers: [{ goal: 'REFINANCE', best: 'בנק ב', count: 2 }] })).toEqual(['refi-fee', 'offer-REFINANCE']);

    const recovery = { hasStatements: true, cancel: [], reduce: [], overdraft: false, fees: false, consolidate: true };
    expect(ids({ goals: ['REFINANCE'], answers: { hasLoans: 'YES' }, refinance, recovery })).toEqual(['refi-offer', 'refi-fee', 'rec-consolidate']);
  });

  it('takes the cheapest loan offer, and asks for the market rate when it is well above', () => {
    expect(tasksFor({ goals: ['RECOVERY'], answers: {}, loanOffer: { best: 'מלווה א', count: 2, rate: 0.12, average: 0.079 } }).map((task) => task.text)).toEqual([
      'לקחת את ההלוואה ממלווה א, הזולה מבין 2 ההצעות',
      'לבקש ממלווה א ריבית קרובה לממוצע השוק, 7.9%',
    ]);
    expect(ids({ goals: ['RECOVERY'], answers: {}, loanOffer: { best: 'מלווה א', count: 1, rate: 0.08, average: 0.079 } })).toEqual(['loan-offer']);
  });

  it('has nothing for a goal not chosen, or a result not yet worked out', () => {
    expect(ids({ goals: ['BUY'], answers: {}, refinance: { exact: false } })).toEqual([]);
    expect(ids({ goals: ['BUY', 'REFINANCE'], answers: {} })).toEqual([]);
  });
});
