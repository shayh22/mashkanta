import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LiveMarket } from '../../engine/boiMarket';
import { applyLiveMarket } from '../../engine/liveMarket';
import { useConsolidation, useConsolidationAnalysis } from '../../store/consolidationStore';
import { useMarket } from '../../store/marketStore';

afterEach(() => {
  vi.unstubAllGlobals();
  applyLiveMarket(undefined);
  useMarket.setState({ market: undefined, status: 'idle' });
  useConsolidation.getState().reset();
});

describe('a market refresh', () => {
  it('re-measures the debts against the new consumer-loan average', async () => {
    useConsolidation.setState({
      debts: [
        {
          id: 'car',
          kind: 'CAR',
          label: 'רכב',
          balance: 80_000,
          annualRate: 0.09,
          monthlyPayment: 2_000,
          remainingMonths: 48,
          include: true,
        },
      ],
    });
    const { result } = renderHook(() => useConsolidationAnalysis());
    // 9% against the 7.9% seed: more than a point above.
    expect(result.current.recommendations[0]?.aboveMarket).toBeCloseTo(0.011, 10);

    const market: LiveMarket = {
      fetchedAt: '2026-10-27T08:00:00Z',
      prime: { value: 0.0475, asOf: '2026-10-27', since: '2026-09-03' },
      consumerUnsecured: { value: 0.085, asOf: '2026-09' },
      missing: [],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(market))));
    await act(() => useMarket.getState().refresh());

    // 9% against 8.5%: no longer worth flagging.
    expect(result.current.recommendations[0]?.aboveMarket).toBeUndefined();
  });
});
