import { beforeEach, describe, expect, it } from 'vitest';
import { analyseConsolidation } from '../engine/consolidation';
import { useConsolidation } from './consolidationStore';

const analyse = () => {
  const { netIncome, debts, property, terms } = useConsolidation.getState();
  return analyseConsolidation({ netIncome, debts, property, terms });
};

describe('consolidation store', () => {
  beforeEach(() => useConsolidation.getState().reset());

  it('ships a default household that is feasible and relieves cash flow', () => {
    const analysis = analyse();
    expect(analysis.regulation.feasible).toBe(true);
    expect(analysis.monthlyRelief).toBeGreaterThan(0);
    // The default card deal has under 18 months left and starts excluded.
    expect(analysis.kept.some((debt) => debt.remainingMonths <= 18)).toBe(true);
  });

  it('applies the engine recommendations to the include flags', () => {
    const { debts, applyRecommendations, updateDebt } = useConsolidation.getState();
    debts.forEach((debt) => updateDebt(debt.id, { include: false }));
    applyRecommendations(analyse().allocation.blendedRate);
    const after = useConsolidation.getState().debts;
    expect(after.filter((debt) => debt.include).length).toBeGreaterThan(0);
    expect(after.filter((debt) => debt.remainingMonths <= 18).every((debt) => !debt.include)).toBe(true);
  });

  it('adds imported loans in place of the illustrative ones, and keeps the same loan once', () => {
    const loan = (id: string, balance: number) => ({ id, kind: 'CAR' as const, label: 'רכב', balance, annualRate: 0.07, monthlyPayment: 1_000, remainingMonths: 30, include: true });
    const { importDebts } = useConsolidation.getState();
    importDebts([loan('a', 20_000)], false);
    expect(useConsolidation.getState().debts.map((debt) => debt.id)).toEqual(['a']);
    importDebts([loan('b', 30_000), loan('c', 20_000)], false);
    expect(useConsolidation.getState().debts.map((debt) => debt.id)).toEqual(['a', 'b']);
    importDebts([loan('d', 40_000), loan('e', 40_000)], false);
    expect(useConsolidation.getState().debts.map((debt) => debt.id)).toEqual(['a', 'b', 'd']);
    importDebts([loan('f', 50_000)], true);
    expect(useConsolidation.getState().debts.map((debt) => debt.id)).toEqual(['f']);
  });

  it('keeps the variable part of the mortgage within its balance', () => {
    useConsolidation.getState().setProperty({ mortgageBalance: 100_000 });
    expect(useConsolidation.getState().property.mortgageBalance).toBe(100_000);
    useConsolidation.getState().setReinvestShare(4);
    expect(useConsolidation.getState().reinvestShare).toBe(1);
  });
});
