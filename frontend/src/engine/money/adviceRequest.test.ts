import { describe, expect, it } from 'vitest';
import { BANK_CSV, cardXlsx } from './__fixtures__/statements';
import { adviceRequestOf, freedByAdvice, MAX_GOAL_LENGTH, toAdvice, validateAdviceRequest, type AdviceRequest } from './adviceRequest';
import { monthlyPicture } from './picture';
import { parseCsv, readXlsx } from './sheets';
import { readStatement } from './statementImport';

const REQUEST: AdviceRequest = {
  goal: 'לצאת מהמינוס',
  income: 15_000,
  spending: 17_000,
  fixed: 8_000,
  oneOff: 20_000,
  months: 3,
  overdraft: { monthsBelow: 3, lowest: -12_000, interestMonthly: 40 },
  categories: [
    { id: 'GROCERIES', monthly: 3_000, must: 2_000, reduce: 0, cancel: 0 },
    { id: 'DINING', monthly: 900, must: 0, reduce: 900, cancel: 0 },
    { id: 'HOUSING_LOANS', monthly: 5_000, must: 0, reduce: 0, cancel: 0 },
  ],
  ideas: [
    { kind: 'OVERDRAFT', monthly: 40 },
    { kind: 'RECURRING', monthly: null },
  ],
  notes: ['הבונוס באוגוסט חד-פעמי'],
};

describe('the advisor request', () => {
  it('is built from totals only: no business names, no dates', async () => {
    const bank = readStatement(parseCsv(BANK_CSV), 'b')!;
    const card = readStatement(await readXlsx(await cardXlsx()), 'c')!;
    const request = adviceRequestOf(monthlyPicture([bank, card])!, ' לחסוך\nלחופשה ');
    expect(request.goal).toBe('לחסוך לחופשה');
    expect(request.months).toBe(3);
    expect(request.oneOff).toBe(20_000);
    expect(request.overdraft).toMatchObject({ monthsBelow: 3, lowest: -44_360, interestMonthly: 30 });
    const sent = JSON.stringify(request);
    for (const secret of ['רמי לוי', 'חנות הדוגמאות', 'משכורת', '2026-', '1111']) {
      expect(sent).not.toContain(secret);
    }
    expect(validateAdviceRequest(JSON.parse(sent))).toEqual(request);
  });

  it('tells the advisor how much of each category is a must, could be cut or cancelled — never the notes', async () => {
    const bank = readStatement(parseCsv(BANK_CSV), 'b')!;
    const card = readStatement(await readXlsx(await cardXlsx()), 'c')!;
    const request = adviceRequestOf(monthlyPicture([bank, card])!, 'מטרה', {
      'בנק-משכ חיוב': { flexibility: 'MUST', note: 'פרט אישי שלא נשלח' },
      'חנות הדוגמאות': { flexibility: 'CANCEL' },
    });
    expect(request.categories.find((c) => c.id === 'HOUSING_LOANS')).toMatchObject({ monthly: 5_000, must: 5_000, cancel: 0 });
    expect(request.categories.find((c) => c.id === 'OTHER')).toMatchObject({ cancel: 667, must: 0 });
    expect(request.ideas.map((idea) => idea.kind)).toContain('CANCEL');
    expect(JSON.stringify(request)).not.toContain('פרט אישי');
  });

  it('accepts exactly its shape and drops anything else', () => {
    expect(validateAdviceRequest({ ...REQUEST, names: ['x'] })).toEqual(REQUEST);
    expect(validateAdviceRequest({ ...REQUEST, goal: 'אב' })).toBe('bad goal');
    expect(validateAdviceRequest({ ...REQUEST, goal: 'א'.repeat(MAX_GOAL_LENGTH + 1) })).toBe('bad goal');
    expect(validateAdviceRequest({ ...REQUEST, income: -1 })).toBe('bad income');
    const total = { must: 0, reduce: 0, cancel: 0 };
    expect(validateAdviceRequest({ ...REQUEST, categories: [{ id: 'SALARY', monthly: 1, ...total }] })).toBe('bad categories');
    expect(validateAdviceRequest({ ...REQUEST, categories: [{ id: 'רמי לוי', monthly: 1, ...total }] })).toBe('bad categories');
    expect(validateAdviceRequest({ ...REQUEST, categories: [{ id: 'DINING', monthly: 1 }] })).toBe('bad categories');
    expect(validateAdviceRequest({ ...REQUEST, ideas: [{ kind: 'X', monthly: 1 }] })).toBe('bad ideas');
    expect(validateAdviceRequest({ ...REQUEST, overdraft: { monthsBelow: 1 } })).toBe('bad overdraft');
    expect(validateAdviceRequest({ ...REQUEST, overdraft: null })).toMatchObject({ overdraft: null });
  });
});

describe('the advisor answer', () => {
  const step = (title: string, category: string | null = null, targetMonthly: number | null = null) => ({
    title,
    detail: 'פירוט',
    category,
    targetMonthly,
  });

  it('keeps a target only for a category the household has, below what it spends', () => {
    const advice = toAdvice(
      {
        summary: 'תוכנית',
        steps: [
          step('לצמצם מסעדות', 'DINING', 600.4),
          step('יעד גבוה מההוצאה', 'GROCERIES', 3_500),
          step('יעד מתחת לחובה', 'GROCERIES', 1_500),
          step('קטגוריה שאין', 'SHOPPING', 100),
          step('בלי יעד'),
          step('', 'DINING', 100),
          step('שישי', 'DINING', 500),
          step('שביעי'),
        ],
        cautions: ['א', '', 'ב', 'ג'],
      },
      REQUEST,
    )!;
    expect(advice.steps.map((s) => s.title)).toEqual(['לצמצם מסעדות', 'יעד גבוה מההוצאה', 'יעד מתחת לחובה', 'קטגוריה שאין', 'בלי יעד']);
    expect(advice.steps[0]!.target).toEqual({ category: 'DINING', monthly: 600 });
    expect(advice.steps[1]!.target).toBeUndefined();
    // Below what the household called a must: kept as a step, not as a target.
    expect(advice.steps[2]!.target).toBeUndefined();
    expect(advice.steps[3]!.target).toBeUndefined();
    expect(advice.cautions).toEqual(['א', 'ב']);
  });

  it('adds up what the targets free, one target per category', () => {
    const advice = toAdvice(
      { summary: '', steps: [step('א', 'DINING', 700), step('ב', 'GROCERIES', 2_500), step('ג', 'DINING', 600)], cautions: [] },
      REQUEST,
    )!;
    expect(freedByAdvice(advice, REQUEST)).toBe(300 + 500);
  });

  it('is nothing when the answer has no steps list', () => {
    expect(toAdvice({ summary: 'x' }, REQUEST)).toBeNull();
  });
});
