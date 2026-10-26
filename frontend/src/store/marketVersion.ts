import { create } from 'zustand';

/**
 * Bumped whenever the market figures the engine prices against change. It lives apart from the
 * market store so that stores the market store itself updates (consolidation) can depend on it
 * without an import cycle.
 */
const useVersion = create<{ version: number }>(() => ({ version: 0 }));

export const bumpMarketVersion = () => useVersion.setState((state) => ({ version: state.version + 1 }));

/** Subscribes a computed view to market changes. */
export const useMarketVersion = () => useVersion((state) => state.version);
