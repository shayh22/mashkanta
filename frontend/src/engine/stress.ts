import { priceMix, paymentAt, type MixResult } from './amortization';
import { withShock, type MacroScenario } from './scenario';
import type { TrackSpec } from './tracks';

/** One cell of the sensitivity matrix. */
export interface StressScenario {
  readonly id: string;
  readonly label: string;
  readonly ratePoints: number;
  readonly cpiAnnual: number;
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly maxPaymentMonth: number;
  readonly paymentAtYear5: number;
  readonly totalPaid: number;
  readonly paymentIncrease: number;
  readonly totalPaidIncrease: number;
  readonly breachesCapacity: boolean;
}

export interface StressMatrix {
  readonly scenarios: readonly StressScenario[];
  readonly worstCase: StressScenario;
  readonly worstIncrease: number;
  readonly anyBreach: boolean;
}

/** Rate shocks in percentage points, per the platform's sensitivity specification. */
const RATE_SHOCKS = [0.005, 0.01, 0.02, 0.03];
/** Absolute annual inflation paths tested against every mix. */
const CPI_PATHS = [0.015, 0.03, 0.045, 0.06];

/**
 * Runs a mix through the macro shocks a 25-year loan has to survive.
 *
 * Rate shocks move prime and the 5-year anchor together, because in practice they share a policy
 * driver — shocking prime alone would flatter any mix holding variable tracks. Inflation scenarios
 * are stated as absolute annual rates rather than deltas, matching how the Bank of Israel and the
 * Central Bureau of Statistics publish them.
 */
export function runStressTests(
  specs: readonly TrackSpec[],
  baseline: MacroScenario,
  baselineResult: MixResult,
  volatilityCapacity: number,
): StressMatrix {
  const scenarios: StressScenario[] = [];

  for (const shock of RATE_SHOCKS) {
    scenarios.push(
      evaluate(
        specs,
        baseline,
        baselineResult,
        volatilityCapacity,
        `PRIME_${Math.round(shock * 1000)}`,
        `עליית ריבית של ${(shock * 100).toFixed(1)}%`,
        shock,
        baseline.cpiAnnual,
      ),
    );
  }
  for (const cpi of CPI_PATHS) {
    scenarios.push(
      evaluate(
        specs,
        baseline,
        baselineResult,
        volatilityCapacity,
        `CPI_${Math.round(cpi * 1000)}`,
        `אינפלציה שנתית של ${(cpi * 100).toFixed(1)}%`,
        0,
        cpi,
      ),
    );
  }

  // The combined path is what actually happens: the central bank raises rates because of inflation.
  scenarios.push(
    evaluate(specs, baseline, baselineResult, volatilityCapacity, 'COMBINED_MODERATE', 'משולב: ריבית +2% ואינפלציה 4.5%', 0.02, 0.045),
  );
  scenarios.push(
    evaluate(specs, baseline, baselineResult, volatilityCapacity, 'COMBINED_SEVERE', 'משולב חמור: ריבית +3% ואינפלציה 6%', 0.03, 0.06),
  );

  let worst = scenarios[0]!;
  for (const scenario of scenarios) {
    if (scenario.maxPayment > worst.maxPayment) {
      worst = scenario;
    }
  }

  return {
    scenarios,
    worstCase: worst,
    worstIncrease: worst.maxPayment - baselineResult.initialPayment,
    anyBreach: scenarios.some((scenario) => scenario.breachesCapacity),
  };
}

function evaluate(
  specs: readonly TrackSpec[],
  baseline: MacroScenario,
  baselineResult: MixResult,
  capacity: number,
  id: string,
  label: string,
  ratePoints: number,
  cpiAnnual: number,
): StressScenario {
  const shocked = withShock(baseline, ratePoints, cpiAnnual - baseline.cpiAnnual, 1, label);
  const result = priceMix(specs, shocked);
  const increase = result.maxPayment - baselineResult.initialPayment;

  return {
    id,
    label,
    ratePoints,
    cpiAnnual,
    initialPayment: result.initialPayment,
    maxPayment: result.maxPayment,
    maxPaymentMonth: result.maxPaymentMonth,
    paymentAtYear5: paymentAt(result, 60),
    totalPaid: result.totalPaid,
    paymentIncrease: increase,
    totalPaidIncrease: result.totalPaid - baselineResult.totalPaid,
    breachesCapacity: capacity > 0 && increase > capacity,
  };
}

/** The peak monthly payment across every scenario — the figure the DTI stress test uses. */
export function worstPayment(matrix: StressMatrix): number {
  return matrix.worstCase?.maxPayment ?? 0;
}
