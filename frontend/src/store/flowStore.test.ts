// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { useFlow, useHasDebts } from './flowStore';
import { useRefinance } from './refinanceStore';

beforeEach(() => {
  useConsolidation.getState().reset();
  useFlow.setState({ hasDebts: undefined });
});
afterEach(cleanup);

describe("whether the homeowner's other loans are part of the check", () => {
  it('ignores the illustrative loans the app starts with', () => {
    expect(isSampleDebts(useConsolidation.getState().debts)).toBe(true);
    expect(renderHook(() => useHasDebts()).result.current).toBe(false);
  });

  it('counts loans the borrower entered, until they answer otherwise', () => {
    const { result } = renderHook(() => useHasDebts());
    const first = useConsolidation.getState().debts[0]!;
    act(() => useConsolidation.getState().updateDebt(first.id, { balance: 50_000 }));
    expect(isSampleDebts(useConsolidation.getState().debts)).toBe(false);
    expect(result.current).toBe(true);

    act(() => useFlow.getState().setHasDebts(false));
    expect(result.current).toBe(false);
  });

  it('takes a yes even for the sample list, and a no for an empty one', () => {
    const { result } = renderHook(() => useHasDebts());
    act(() => useFlow.getState().setHasDebts(true));
    expect(result.current).toBe(true);
    act(() => {
      useFlow.setState({ hasDebts: undefined });
      useConsolidation.getState().importDebts([], true);
    });
    expect(result.current).toBe(false);
  });
});

describe('the refinance proposal a returning visitor sees', () => {
  const migrate = useRefinance.persist.getOptions().migrate!;

  it("moves the old same-mix default to the engine's mix", async () => {
    expect(await migrate({ proposalMode: 'AUTO', percentile: 0.3 }, 1)).toEqual({ proposalMode: 'OPTIMAL', percentile: 0.3 });
  });

  it('keeps a quote the borrower typed in, and anything already current', async () => {
    expect(await migrate({ proposalMode: 'MANUAL' }, 1)).toEqual({ proposalMode: 'MANUAL' });
    expect(await migrate({ proposalMode: 'AUTO' }, 2)).toEqual({ proposalMode: 'AUTO' });
  });
});
