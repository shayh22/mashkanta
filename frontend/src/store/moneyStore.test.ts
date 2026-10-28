// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { storageKey } from './persistence';
import { useMoneyCategories, withoutRepeats, type MoneyFile } from './moneyStore';
import { BANK_CSV } from '../engine/money/__fixtures__/statements';
import { parseCsv } from '../engine/money/sheets';
import { readStatement } from '../engine/money/statementImport';

beforeEach(() => {
  localStorage.clear();
  useMoneyCategories.setState({ explanations: {} });
});

describe('what the household says about its charges', () => {
  it('merges a change into the explanation, and drops what is emptied', () => {
    const { explain } = useMoneyCategories.getState();
    explain('דוגמה', { note: 'הלוואה', flexibility: 'MUST' });
    explain('דוגמה', { category: 'LOANS' });
    expect(useMoneyCategories.getState().explanations['דוגמה']).toEqual({ note: 'הלוואה', flexibility: 'MUST', category: 'LOANS' });
    explain('דוגמה', { note: '', flexibility: undefined, category: undefined });
    expect(useMoneyCategories.getState().explanations).toEqual({});
  });

  it('takes AI categories only where the household chose none', () => {
    useMoneyCategories.setState({ explanations: { א: { category: 'OTHER' }, ב: { note: 'משהו' } } });
    useMoneyCategories.getState().merge({ א: 'SHOPPING', ב: 'DINING', ג: 'HEALTH' });
    expect(useMoneyCategories.getState().explanations).toEqual({
      א: { category: 'OTHER' },
      ב: { note: 'משהו', category: 'DINING' },
      ג: { category: 'HEALTH' },
    });
  });

  it('keeps categories saved before explanations existed', async () => {
    localStorage.setItem(storageKey('money-categories'), JSON.stringify({ state: { overrides: { דוגמה: 'LOANS' } }, version: 1 }));
    await useMoneyCategories.persist.rehydrate();
    expect(useMoneyCategories.getState().explanations).toEqual({ דוגמה: { category: 'LOANS' } });
  });
});

describe('the same statement uploaded twice', () => {
  const file = (id: string, name: string): MoneyFile => ({ id, name, statement: readStatement(parseCsv(BANK_CSV), id)! });

  it('is counted once, under any name, and said so', () => {
    const [again, renamed, other] = withoutRepeats([file('a', 'bank.csv')], [file('b', 'bank.csv'), file('c', 'bank (1).csv'), { id: 'd', name: 'x.pdf', error: 'שגיאה' }]);
    expect(again).toMatchObject({ id: 'b', error: expect.stringContaining('כבר הועלה') });
    expect(again!.statement).toBeUndefined();
    expect(renamed!.statement).toBeUndefined();
    expect(other).toMatchObject({ id: 'd', error: 'שגיאה' });
  });

  it('within one upload too, keeping the first', () => {
    const [first, second] = withoutRepeats([], [file('a', 'one.csv'), file('b', 'two.csv')]);
    expect(first!.statement).toBeDefined();
    expect(second!.statement).toBeUndefined();
  });
});
