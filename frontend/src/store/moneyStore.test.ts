// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { storageKey } from './persistence';
import { useMoneyCategories } from './moneyStore';

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
