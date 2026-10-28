import { describe, expect, it } from 'vitest';
import { BANK_CSV, cardXlsx } from './__fixtures__/statements';
import { monthlyPicture, payeeOf } from './picture';
import { parseCsv, readXlsx } from './sheets';
import { readStatement, type Statement } from './statementImport';

const bank = readStatement(parseCsv(BANK_CSV), 'b')!;
const card = async () => readStatement(await readXlsx(await cardXlsx()), 'c')!;
const line = (picture: ReturnType<typeof monthlyPicture>, id: string) => picture!.spendingLines.find((l) => l.id === id);

describe('the monthly picture', () => {
  it('replaces the bank’s card charges with the card’s detail, so no purchase counts twice', async () => {
    const picture = monthlyPicture([bank, await card()])!;
    expect(picture.months).toEqual(['2026-04', '2026-05', '2026-06']);
    // Three charges of card 1111 and three monthly card bills.
    expect(picture.replacedCardCharges).toBe(6);
    expect(line(picture, 'GROCERIES')!.monthly).toBeCloseTo(2_000, 6);
    expect(line(picture, 'DINING')!.monthly).toBeCloseTo(150, 6);
    expect(line(picture, 'CARD_PAYMENT')).toBeUndefined();
    // Card 2222 is paid from the account with no detail uploaded.
    expect(picture.undetailedCards).toEqual(['2222']);
    expect(line(picture, 'CARD_UNDETAILED')!.monthly).toBeCloseTo(500 / 3, 6);
  });

  it('averages income and spending over the whole months, a refund netted in', async () => {
    const picture = monthlyPicture([bank, await card()])!;
    expect(picture.income).toBeCloseTo(15_000 + 1_000 / 3, 6);
    expect(line(picture, 'OTHER')!.monthly).toBeCloseTo((700 * 3 - 100) / 3, 6);
    expect(picture.spending).toBeCloseTo(5_000 + 2_000 + 300 + 2_000 / 3 + 150 + 30 + 500 / 3, 6);
    // The mortgage and the gas standing order are the fixed part.
    expect(picture.fixed).toBeCloseTo(5_300, 6);
    expect(picture.byMonth.map((month) => month.income)).toEqual([16_000, 15_000, 15_000]);
  });

  it('keeps one-off money out of income, and says so', async () => {
    const picture = monthlyPicture([bank, await card()])!;
    expect(picture.oneOff.map((transaction) => transaction.amount)).toEqual([20_000]);
    expect(picture.incomeLines.map((l) => l.id)).toEqual(['SALARY', 'TRANSFERS_IN']);
  });

  it('finds the lowest balance on every bank line, card charges included, and the overdraft interest', async () => {
    const overdraft = monthlyPicture([bank, await card()])!.overdraft!;
    expect(overdraft).toMatchObject({ monthsBelow: 3, months: 3, lowest: -44_360, lowestDate: '2026-04-10' });
    expect(overdraft.interestMonthly).toBeCloseTo(30, 6);
  });

  it('without the card detail, shows the card bills as such', () => {
    const picture = monthlyPicture([bank])!;
    expect(picture.replacedCardCharges).toBe(0);
    expect(picture.undetailedCards).toEqual(['1111', '2222', 'אשראי']);
    expect(line(picture, 'CARD_UNDETAILED')!.monthly).toBeCloseTo((150 * 3 + 500 + 6_000 * 3) / 3, 6);
  });

  it("flags a category whose last month is well above its average", async () => {
    const picture = monthlyPicture([bank, await card()])!;
    expect(line(picture, 'CARD_UNDETAILED')).toMatchObject({ rising: true, lastMonth: 500 });
    expect(line(picture, 'GROCERIES')!.rising).toBe(false);
  });

  it("applies the borrower's own category for a business", async () => {
    const picture = monthlyPicture([bank, await card()], { 'חנות הדוגמאות': 'SHOPPING' })!;
    expect(line(picture, 'OTHER')).toBeUndefined();
    expect(line(picture, 'SHOPPING')!.monthly).toBeCloseTo(2_000 / 3, 6);
  });

  it('with no whole month, gives the period as it is', () => {
    const short: Statement = { ...bank, transactions: bank.transactions.slice(0, 3), from: '2026-06-20', to: '2026-06-30' };
    const picture = monthlyPicture([short])!;
    expect(picture.partial).toBe(true);
    expect(picture.months).toEqual(['2026-06']);
  });

  it('names a payee without the dates, times and numbers in its line', () => {
    expect(payeeOf('כספומט בנק דוגמה 25/10 18:33')).toBe('כספומט בנק דוגמה');
    expect(payeeOf('הקמת הלוואה 13200000000')).toBe('הקמת הלוואה');
  });

  it('files a line that is all numbers by what the household said about it', () => {
    const numbered = { id: 'n', date: '2026-05-03', description: '987654321', amount: -200, source: 'BANK' as const };
    const picture = monthlyPicture([{ ...bank, transactions: [...bank.transactions, numbered] }], { '987654321': 'LOANS' });
    expect(line(picture, 'LOANS')?.payees.map((payee) => payee.description)).toContain('987654321');
  });

  it('is nothing without statements', () => {
    expect(monthlyPicture([])).toBeUndefined();
  });
});
