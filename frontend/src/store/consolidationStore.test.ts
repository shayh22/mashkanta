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

  it('keeps the variable part of the mortgage within its balance', () => {
    useConsolidation.getState().setProperty({ mortgageBalance: 100_000 });
    expect(useConsolidation.getState().property.mortgageBalance).toBe(100_000);
    useConsolidation.getState().setReinvestShare(4);
    expect(useConsolidation.getState().reinvestShare).toBe(1);
  });
});
