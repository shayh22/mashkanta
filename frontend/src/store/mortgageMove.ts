import { bestRoute } from '../lib/routes';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from './refinanceStore';

/**
 * The household's mortgage as the engine would refinance it — from the homeowner path's data, so it
 * is entered once. Nothing while the mortgage there is still the illustrative one.
 */
export function useMortgageMove() {
  const tracks = useRefinance((state) => state.tracks);
  const sample = isSampleTracks(tracks);
  const { comparison } = useRefinanceAnalysis();
  const route = !sample && comparison ? bestRoute(comparison) : undefined;
  return { sample, route };
}
