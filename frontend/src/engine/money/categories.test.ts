import { describe, expect, it } from 'vitest';
import { cardPaidBy, categorize, isCardBill } from './categories';
import type { Transaction } from './statementImport';

const card = (description: string, kind?: string): Transaction => ({
  id: 'c',
  date: '2026-01-01',
  description,
  amount: -100,
  source: 'CARD',
  ...(kind ? { kind } : {}),
});
const bank = (description: string, amount: number): Transaction => ({ id: 'b', date: '2026-01-01', description, amount, source: 'BANK' });

describe('categories', () => {
  it.each([
    ['רמי לוי סניף דוגמה', 'GROCERIES'],
    ['סופר פארם דוגמה', 'HEALTH'],
    ['פז גז', 'HOME_BILLS'],
    ['פז תחנת דוגמה', 'TRANSPORT'],
    ['תרומות עמותת דוגמה (ע"ר)', 'DONATIONS'],
    ['מגדל חברה חיוב', 'INSURANCE'],
    ['מגדלי הים דוגמה', 'OTHER'],
    ['ביטוח ישיר דירה', 'INSURANCE'],
    ['העברה ב BIT', 'TRANSFERS_OUT'],
    ['GOOGLE*CLAUDE', 'SUBSCRIPTIONS'],
    ['עיריית דוגמה', 'HOME_BILLS'],
    ['גלידות דוגמה', 'DINING'],
    ['חנות שאף כלל לא מכיר', 'OTHER'],
  ])('%s → %s', (description, category) => {
    expect(categorize(card(description))).toBe(category);
  });

  it('reads money out of the bank account by the same rules', () => {
    expect(categorize(bank('בנק-משכ חיוב', -5_000))).toBe('HOUSING_LOANS');
    expect(categorize(bank('הו"ק לוועד בית 12', -375))).toBe('HOME_BILLS');
    expect(categorize(bank('כספומט בנק דוגמה 25/10 18:33', -400))).toBe('CASH');
    expect(categorize(bank('תשלום ריבית על משיכת יתר- מינוס', -90))).toBe('FEES');
  });

  it('tells income from money that only passes through', () => {
    expect(categorize(bank('משכורת חברת דוגמה', 15_000))).toBe('SALARY');
    expect(categorize(bank('ביטוח לאומי - ילדים', 600))).toBe('BENEFITS');
    expect(categorize(bank('קרן השתל פדיון', 20_000))).toBe('ONE_OFF_IN');
    expect(categorize(bank('הקמת הלוואה 123456', 20_000))).toBe('ONE_OFF_IN');
    expect(categorize(bank('ביטול תשלום ריבית על משיכת יתר', 90))).toBe('FEES');
    expect(categorize(bank('העברה מחשבון אחר', 1_000))).toBe('TRANSFERS_IN');
  });

  it('a cash withdrawal on a card is cash, whatever the business', () => {
    expect(categorize(card('בנק דוגמה', 'משיכת מזומן'))).toBe('CASH');
  });

  it('finds the bank lines that pay a card, and which card', () => {
    expect(isCardBill(bank('חיוב לכרטיס ויזה 1111', -150))).toBe(true);
    expect(cardPaidBy(bank('חיוב לכרטיס ויזה 1111', -150))).toBe('1111');
    expect(isCardBill(bank('כ.א.ל חיוב', -6_000))).toBe(true);
    expect(cardPaidBy(bank('כ.א.ל חיוב', -6_000))).toBeUndefined();
    expect(isCardBill(bank('ישראכרט החזר', 50))).toBe(false);
    expect(categorize(bank('כ.א.ל חיוב', -6_000))).toBe('CARD_PAYMENT');
  });
});
