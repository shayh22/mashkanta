import type { RefinanceComparison, RouteAnalysis } from '../engine/refinance';

export const ROUTE_NAME = { INTERNAL: 'מיחזור פנימי', EXTERNAL: 'בנק מתחרה' } as const;

/** The better of the two refinance routes. */
export function bestRoute(comparison: RefinanceComparison): RouteAnalysis {
  return comparison.best === 'EXTERNAL' ? comparison.external : comparison.internal;
}
