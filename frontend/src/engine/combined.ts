import type { MixResult } from './amortization';
import {
  analyseConsolidation,
  type ConsolidationAnalysis,
  type ConsolidationInput,
  type PropertyPosition,
} from './consolidation';
import type { RouteAnalysis } from './refinance';
import { TRACKS } from './tracks';

/**
 * Refinancing the mortgage and consolidating debt in one move.
 *
 * Under Directive 329 as amended in October 2026 the two are not independent: the mortgage payment
 * is the E in the numerator of the payment-to-income test, and the mortgage's variable part counts
 * toward the two-thirds limit on all credit secured by the property. Refinancing first changes both
 * — a cheaper mortgage frees payment capacity, moving variable tracks to fixed frees variable room —
 * so the consolidation is re-tested against the refinanced mortgage, not the current one.
 */

/** The parts of a mortgage that the consolidation tests look at, read off a priced mix. */
export function positionFromMix(
  mix: MixResult,
): Pick<
  PropertyPosition,
  'mortgageBalance' | 'mortgagePayment' | 'mortgageRemainingMonths' | 'mortgageVariableBalance'
> {
  return {
    mortgageBalance: mix.totalPrincipal,
    mortgagePayment: mix.initialPayment,
    mortgageRemainingMonths: mix.termMonths,
    mortgageVariableBalance: mix.tracks
      .filter((track) => TRACKS[track.type].variableRate)
      .reduce((sum, track) => sum + track.amount, 0),
  };
}

export interface CombinedOptions {
  /** Roll the refinance's fees and switching costs into the consolidation loan instead of paying them in cash. */
  readonly financeUpfrontCosts: boolean;
}

export interface CombinedMove {
  /** Consolidation against the mortgage as it stands, taken from the refinance page. */
  readonly consolidationOnly: ConsolidationAnalysis;
  /** Consolidation against the refinanced mortgage. */
  readonly combined: ConsolidationAnalysis;
  readonly refinance: RouteAnalysis;
  /** Cash due on the day of the move; zero when the costs are financed. */
  readonly cashUpfront: number;
  /** Monthly payments today against after both steps. */
  readonly paymentToday: number;
  readonly paymentAfter: number;
  /** How much of the improvement the refinance contributes on top of consolidating alone. */
  readonly extraReliefFromRefinance: number;
  /** Change in loan room under the 40% policy ceiling that the refinance creates. */
  readonly extraCreditRoom: number;
}

export function analyseCombined(
  input: ConsolidationInput,
  refinance: RouteAnalysis,
  options: CombinedOptions,
): CombinedMove {
  const current: ConsolidationInput = {
    ...input,
    property: { ...input.property, ...positionFromMix(refinance.current) },
  };
  const consolidationOnly = analyseConsolidation(current);

  const combinedInput: ConsolidationInput = {
    ...input,
    property: { ...input.property, ...positionFromMix(refinance.proposed) },
    terms: {
      ...input.terms,
      closingCosts: input.terms.closingCosts + (options.financeUpfrontCosts ? refinance.upfrontCost : 0),
    },
  };
  const combined = analyseConsolidation(combinedInput);

  return {
    consolidationOnly,
    combined,
    refinance,
    cashUpfront: options.financeUpfrontCosts ? 0 : refinance.upfrontCost,
    paymentToday: consolidationOnly.paymentBefore,
    paymentAfter: combined.paymentAfter,
    extraReliefFromRefinance: consolidationOnly.paymentAfter - combined.paymentAfter,
    extraCreditRoom: combined.regulation.maxFeasibleLoan - consolidationOnly.regulation.maxFeasibleLoan,
  };
}
