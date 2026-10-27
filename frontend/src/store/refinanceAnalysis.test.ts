// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useConsolidation, useConsolidationAnalysis } from './consolidationStore';
import { useFlow } from './flowStore';
import { useRefinance, useRefinanceAnalysis } from './refinanceStore';
import { useWizard } from './wizardStore';

beforeEach(() => {
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useWizard.getState().reset();
  useFlow.setState({ hasDebts: undefined });
});
afterEach(cleanup);

/** What the engine counted as other monthly payments when it chose the mix. */
const obligationsSeen = (view: ReturnType<typeof useRefinanceAnalysis>) => {
  const compliance = view.optimal!.result.recommended.compliance;
  return (compliance.dti - compliance.pti) * useConsolidation.getState().netIncome;
};

describe("the household behind the engine's refinance mix", () => {
  it('counts the new all-purpose loan when other loans are being consolidated, beside the loans that stay', () => {
    useFlow.setState({ hasDebts: true });
    const [kept, ...consolidated] = useConsolidation.getState().debts;
    useConsolidation.getState().updateDebt(kept!.id, { include: false });
    const { result } = renderHook(() => ({ view: useRefinanceAnalysis(), consolidation: useConsolidationAnalysis() }));
    expect(consolidated.some((debt) => debt.include)).toBe(true);
    // Every loan that stays (the one excluded here, and any the sample leaves out) plus the new loan.
    const staying = useConsolidation
      .getState()
      .debts.filter((debt) => !debt.include)
      .reduce((sum, debt) => sum + debt.monthlyPayment, 0);
    expect(staying).toBeGreaterThan(kept!.monthlyPayment - 1);
    const expected = staying + result.current.consolidation.allocation.payment;
    expect(obligationsSeen(result.current.view)).toBeCloseTo(expected, 0);
  });

  it('counts nothing beside the mortgage when there are no other loans', () => {
    useFlow.setState({ hasDebts: false });
    const { result } = renderHook(() => useRefinanceAnalysis());
    expect(obligationsSeen(result.current)).toBeCloseTo(0, 6);
  });

  it('runs the search once for every view that asks with the same inputs', () => {
    const { result } = renderHook(() => [useRefinanceAnalysis(), useRefinanceAnalysis()] as const);
    expect(result.current[0].optimal).toBeDefined();
    expect(result.current[0].optimal).toBe(result.current[1].optimal);
  });

  it('does not re-run when wizard fields the mix does not depend on change', () => {
    const { result, rerender } = renderHook(() => useRefinanceAnalysis());
    const before = result.current.optimal;
    useWizard.getState().setProfile({ loanAmount: 1_500_000, propertyValue: 2_600_000 });
    rerender();
    expect(result.current.optimal).toBe(before);
    useWizard.getState().setProfile({ riskTolerance: 9 });
    rerender();
    expect(result.current.optimal).not.toBe(before);
  });
});
