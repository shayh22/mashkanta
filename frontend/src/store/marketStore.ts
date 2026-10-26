import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isUsable, type LiveMarket } from '../engine/boiMarket';
import { applyLiveMarket, liveMarket } from '../engine/liveMarket';
import { allPurposeRates, useConsolidation } from './consolidationStore';
import { browserStorage, storageKey } from './persistence';
import { bumpMarketVersion } from './marketVersion';

/** Served by the Worker in production and by a Vite middleware in development. */
export const MARKET_ENDPOINT = '/api/market';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface MarketState {
  /** The last figures successfully read; kept across reloads so the app starts on them. */
  market?: LiveMarket;
  status: Status;
  error?: string;
  /** Bumped whenever the figures the engine prices against change; computed views depend on it. */
  version: number;
  /** Fetches the figures. `force` asks the server to bypass its cache as well. */
  refresh: (force?: boolean) => Promise<void>;
}

/** Points the engine at a market and carries untouched default loan terms along with it. */
function adopt(market: LiveMarket): void {
  const previous = liveMarket();
  applyLiveMarket(market);
  bumpMarketVersion();
  useConsolidation.getState().syncMarketRates(allPurposeRates(previous), allPurposeRates(market));
}

const PIECES = [
  'boiRate',
  'prime',
  'inflationExpectation',
  'bondYield5y',
  'linkedYield5y',
  'housing',
  'allPurpose',
  'history',
  'consumerUnsecured',
] as const satisfies readonly (keyof LiveMarket)[];

/**
 * A read that came back without some figures keeps the last good value of each one it lacks, so a
 * single file failing upstream does not drop the rate table back to the seed or hide the trend.
 */
export function fillGaps(fetched: LiveMarket, previous: LiveMarket | undefined): LiveMarket {
  if (!previous || fetched.missing.length === 0) {
    return fetched;
  }
  const filled: Record<string, unknown> = { ...fetched };
  for (const piece of PIECES) {
    filled[piece] ??= previous[piece];
  }
  return filled as unknown as LiveMarket;
}

export const useMarket = create<MarketState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      version: 0,
      refresh: async (force = false) => {
        if (get().status === 'loading') {
          return;
        }
        set({ status: 'loading', error: undefined });
        try {
          const response = await fetch(`${MARKET_ENDPOINT}${force ? '?fresh=1' : ''}`, {
            headers: { accept: 'application/json' },
            // Always ask the edge: a copy the browser kept from before a forced refresh would
            // otherwise come back on the next load and replace the newer figures.
            cache: 'no-store',
            signal: AbortSignal.timeout(20_000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const fetched = (await response.json()) as LiveMarket;
          if (!fetched || !Array.isArray(fetched.missing) || !isUsable(fetched)) {
            throw new Error('unusable response');
          }
          const market = fillGaps(fetched, get().market);
          adopt(market);
          set((state) => ({ market, status: 'ready', version: state.version + 1 }));
        } catch (error) {
          set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
    {
      name: storageKey('market'),
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({ market: state.market }),
      // Storage is synchronous, so this runs while the module loads — before anything renders —
      // and the first views are already priced on the cached figures.
      onRehydrateStorage: () => (state) => {
        if (state?.market) {
          adopt(state.market);
        }
      },
    },
  ),
);

export { useMarketVersion } from './marketVersion';
