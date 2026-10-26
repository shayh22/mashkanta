import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isUsable, type LiveMarket } from '../engine/boiMarket';
import { applyLiveMarket, liveMarket } from '../engine/liveMarket';
import { allPurposeRates, useConsolidation } from './consolidationStore';
import { browserStorage, storageKey } from './persistence';

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
  useConsolidation.getState().syncMarketRates(allPurposeRates(previous), allPurposeRates(market));
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
            signal: AbortSignal.timeout(20_000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const market = (await response.json()) as LiveMarket;
          if (!market || !Array.isArray(market.missing) || !isUsable(market)) {
            throw new Error('unusable response');
          }
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

/** Subscribes a computed view to market changes. */
export const useMarketVersion = () => useMarket((state) => state.version);
