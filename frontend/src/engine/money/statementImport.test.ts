import { describe, expect, it } from 'vitest';
import { BANK_CSV, cardXlsx } from './__fixtures__/statements';
import { parseCsv, readXlsx } from './sheets';
import { parseAmount, parseDate, readStatement } from './statementImport';

describe('reading a statement', () => {
  it('reads a bank account: signed amounts, the balance after each line, dates day first', () => {
    const statement = readStatement(parseCsv(BANK_CSV))!;
    expect(statement.source).toBe('BANK');
    expect(statement.transactions).toHaveLength(16);
    expect(statement.transactions[1]).toMatchObject({
      date: '2026-06-28',
      description: 'משכורת חברת דוגמה',
      amount: 15_000,
      balance: -2_250,
      source: 'BANK',
    });
    expect(statement.transactions[0]!.amount).toBe(-150);
    expect([statement.from, statement.to]).toEqual(['2026-04-01', '2026-06-30']);
  });

  it('reads a card export under a title row: purchases as money out, the card, the kind of deal, totals skipped', async () => {
    const statement = readStatement(await readXlsx(await cardXlsx()))!;
    expect(statement.source).toBe('CARD');
    expect(statement.cards).toEqual(['1111', '3333']);
    expect(statement.transactions[0]).toMatchObject({
      date: '2026-04-03',
      description: 'רמי לוי סניף דוגמה',
      amount: -2_000,
      card: '3333',
      kind: 'רגילה',
    });
    // A refund on the card is money back.
    expect(statement.transactions.at(-1)).toMatchObject({ amount: 100 });
    expect(statement.transactions.some((transaction) => transaction.description.includes('סה"כ'))).toBe(false);
  });

  it('reads separate debit and credit columns', () => {
    const rows = parseCsv('תאריך,תיאור,חובה,זכות,יתרה\n01/02/2026,ארנונה,"1,200",,500\n02/02/2026,משכורת,,9000,9500\n');
    expect(readStatement(rows)!.transactions.map((transaction) => transaction.amount)).toEqual([-1_200, 9_000]);
  });

  it('is nothing for a sheet with no table of transactions', () => {
    expect(readStatement(parseCsv('שם,טלפון\nדוגמה,050\n'))).toBeUndefined();
  });

  it('reads the date and amount formats exports use', () => {
    expect(parseDate('27/10/26')).toBe('2026-10-27');
    expect(parseDate('1.2.2026')).toBe('2026-02-01');
    expect(parseDate(46_322)).toBe('2026-10-27');
    expect(parseDate('31/13/26')).toBeUndefined();
    expect(parseDate('סה"כ')).toBeUndefined();
    expect(parseAmount('-5,433.4')).toBe(-5_433.4);
    expect(parseAmount('₪ 1,000')).toBe(1_000);
    expect(parseAmount('250-')).toBe(-250);
    expect(parseAmount('(80)')).toBe(-80);
    expect(parseAmount('')).toBeUndefined();
  });
});
