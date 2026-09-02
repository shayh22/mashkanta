import type { TrackType } from '../lib/types';
import { priceMix, priceTrack, type MixResult, type TrackResult } from './amortization';
import { atPercentile, rateFor } from './baseline';
import { LIMITS } from './regulatory';
import { validate } from './regulatory';
import { runStressTests, worstPayment, type StressMatrix } from './stress';
import { withShock, type MacroScenario } from './scenario';
import { annualRateAt, initialRate, TRACKS, trackFromRate, withTerm, type TrackSpec } from './tracks';
import { maxAffordablePayment, type BorrowerProfile, type RiskProfile } from './profile';
import type { ComplianceReport } from '../lib/types';

/** Tracks the optimizer may allocate to. Eligibility is locked, not optimized. */
const CANDIDATES: readonly TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
];

/** Allocation granularity: 20 steps of 5% each. */
const GRID_STEPS = 20;
/** Rate shock used to score payment volatility inside the search loop. */
const SCORING_RATE_SHOCK = 0.02;
/** Inflation path used to score payment volatility inside the search loop. */
const SCORING_CPI = 0.045;
/** Weight of the borrower's stated track preferences in the objective. */
const PREFERENCE_WEIGHT = 0.15;
/** Extra penalty on fixed principal when the borrower plans to prepay and would owe a break fee. */
const PREPAYMENT_PENALTY_WEIGHT = 0.12;
/** How different an alternative must be from the winner to be worth showing. */
const ALTERNATIVE_DISTANCE = 0.2;

export interface TrackAllocation {
  readonly track: TrackType;
  readonly hebrewName: string;
  readonly amount: number;
  readonly share: number;
  readonly annualRate: number;
  readonly termMonths: number;
  readonly method: TrackSpec['method'];
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly totalPaid: number;
  readonly totalInterest: number;
  readonly totalIndexation: number;
}

export interface MixProposal {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly specs: readonly TrackSpec[];
  readonly allocations: readonly TrackAllocation[];
  readonly result: MixResult;
  readonly compliance: ComplianceReport;
  readonly stress: StressMatrix;
  readonly score: number;
  readonly recommended: boolean;
}

export interface SavingsComparison {
  readonly againstId: string;
  readonly againstName: string;
  readonly totalPaidSaving: number;
  readonly initialPaymentDelta: number;
  readonly irrDelta: number;
}

export interface TermOption {
  readonly termMonths: number;
  readonly initialPayment: number;
  readonly totalPaid: number;
  readonly nominalIrr: number;
  readonly affordable: boolean;
}

export interface OptimizationResult {
  readonly recommended: MixProposal;
  readonly baskets: readonly MixProposal[];
  readonly alternatives: readonly MixProposal[];
  readonly savings: readonly SavingsComparison[];
  readonly riskProfile: RiskProfile;
  readonly termSensitivity: readonly TermOption[];
  readonly relaxedConstraints: readonly string[];
  readonly scenario: MacroScenario;
  readonly candidatesEvaluated: number;
  readonly computeMillis: number;
}

function allocationOf(track: TrackResult, totalPrincipal: number): TrackAllocation {
  return {
    track: track.type,
    hebrewName: TRACKS[track.type].hebrewName,
    amount: track.amount,
    share: totalPrincipal > 0 ? track.amount / totalPrincipal : 0,
    annualRate: track.initialRate,
    termMonths: track.termMonths,
    method: track.method,
    initialPayment: track.initialPayment,
    maxPayment: track.maxPayment,
    totalPaid: track.totalPaid,
    totalInterest: track.totalInterest,
    totalIndexation: track.totalIndexation,
  };
}

/** Prices, checks and stresses one mix. */
function buildProposal(
  id: string,
  name: string,
  description: string,
  specs: readonly TrackSpec[],
  borrower: BorrowerProfile,
  risk: RiskProfile,
  scenario: MacroScenario,
  recommended: boolean,
  score: number,
): MixProposal {
  const result = priceMix(specs, scenario);
  const stress = runStressTests(specs, scenario, result, risk.volatilityCapacity);
  const compliance = validate(borrower, result, worstPayment(stress));
  const allocations = result.tracks
    .map((track) => allocationOf(track, result.totalPrincipal))
    .sort((a, b) => b.amount - a.amount);

  return { id, name, description, specs, allocations, result, compliance, stress, score, recommended };
}

/**
 * Finds the mix that minimises lifetime cost subject to regulation, affordability and the
 * borrower's own tolerance for a moving payment.
 *
 * The search is an exhaustive enumeration over a 5% allocation grid rather than a heuristic. That
 * is affordable because every amortization output is linear in principal: each candidate track is
 * priced once at unit principal, and a mix is then a weighted sum of those unit vectors. The search
 * therefore costs a few million floating point operations instead of tens of thousands of schedule
 * builds, and — unlike a hill climb — it cannot get stuck in a local minimum or return a different
 * answer for the same inputs.
 */
export function optimize(
  borrower: BorrowerProfile,
  risk: RiskProfile,
  scenario: MacroScenario,
  percentile = 0.5,
): OptimizationResult {
  const started = performance.now();

  const rates = new Map<TrackType, number>();
  for (const track of Object.keys(TRACKS) as TrackType[]) {
    rates.set(track, atPercentile(rateFor(track, borrower.loanAmount / borrower.propertyValue, borrower.termMonths), percentile));
  }

  const lockedAmount = Math.min(borrower.eligibilityAmount, borrower.loanAmount);
  const optimizable = borrower.loanAmount - lockedAmount;
  const horizon = borrower.termMonths;

  const locked: TrackSpec | null =
    lockedAmount > 0
      ? {
          type: 'ELIGIBILITY',
          amount: lockedAmount,
          termMonths: horizon,
          fixedRate: borrower.eligibilityRate > 0 ? borrower.eligibilityRate : rates.get('ELIGIBILITY')!,
          margin: 0,
          method: 'SPITZER',
          graceMonths: 0,
        }
      : null;

  const buildSpec = (track: TrackType, amount: number): TrackSpec =>
    trackFromRate(track, amount, horizon, rates.get(track)!, scenario);

  const toSpecs = (weights: readonly number[]): TrackSpec[] => {
    const specs: TrackSpec[] = [];
    if (locked) {
      specs.push(locked);
    }
    for (let i = 0; i < CANDIDATES.length; i++) {
      const weight = weights[i] ?? 0;
      if (weight === 0) {
        continue;
      }
      const amount = (optimizable * weight) / GRID_STEPS;
      if (amount > 0.5) {
        specs.push(buildSpec(CANDIDATES[i]!, amount));
      }
    }
    return specs;
  };

  // --- Precompute each candidate track once at unit principal, baseline and stressed ---
  const stressScenario = withShock(scenario, SCORING_RATE_SHOCK, SCORING_CPI - scenario.cpiAnnual, 1, 'scoring');
  const unitStressPayments: number[][] = [];
  const unitInitialPayment: number[] = [];
  const unitTotalPaid: number[] = [];

  const paymentsOf = (result: TrackResult): number[] => {
    const out = new Array<number>(horizon).fill(0);
    for (const row of result.schedule) {
      if (row.month <= horizon) {
        out[row.month - 1] = row.payment;
      }
    }
    return out;
  };

  for (let i = 0; i < CANDIDATES.length; i++) {
    const unit = buildSpec(CANDIDATES[i]!, 1);
    const base = priceTrack(unit, scenario);
    const shocked = priceTrack(unit, stressScenario);
    unitInitialPayment[i] = base.initialPayment;
    unitTotalPaid[i] = base.totalPaid;
    unitStressPayments[i] = paymentsOf(shocked);
  }

  let lockedStressPayments: number[] = [];
  let lockedInitialPayment = 0;
  let lockedTotalPaid = 0;
  if (locked) {
    const base = priceTrack(locked, scenario);
    lockedInitialPayment = base.initialPayment;
    lockedTotalPaid = base.totalPaid;
    lockedStressPayments = paymentsOf(priceTrack(locked, stressScenario));
  }

  const totalPrincipal = borrower.loanAmount;
  const lockedShare = totalPrincipal > 0 ? (totalPrincipal - optimizable) / totalPrincipal : 0;
  const unitShare = totalPrincipal > 0 ? optimizable / (GRID_STEPS * totalPrincipal) : 0;
  const affordable = maxAffordablePayment(borrower);

  interface Candidate {
    weights: number[];
    score: number;
    totalPaid: number;
    stressIncrease: number;
  }

  /** Highest combined monthly payment under the scoring shock. */
  const stressPeak = (weights: readonly number[]): number => {
    let peak = 0;
    for (let month = 0; month < horizon; month++) {
      let total = month < lockedStressPayments.length ? lockedStressPayments[month]! : 0;
      for (let i = 0; i < CANDIDATES.length; i++) {
        const weight = weights[i] ?? 0;
        if (weight === 0) {
          continue;
        }
        total += unitStressPayments[i]![month]! * ((optimizable * weight) / GRID_STEPS);
      }
      if (total > peak) {
        peak = total;
      }
    }
    return peak;
  };

  /**
   * Walks the whole 5% grid. Cheap share and affordability tests run before the payment vectors
   * are combined, so the expensive work only happens for shapes that could win.
   */
  const enumerate = (enforceVolatility: boolean, enforcePti: boolean): Candidate[] => {
    const found: Candidate[] = [];
    for (let prime = 0; prime <= GRID_STEPS; prime++) {
      for (let fixedUnlinked = 0; fixedUnlinked <= GRID_STEPS - prime; fixedUnlinked++) {
        for (let fixedLinked = 0; fixedLinked <= GRID_STEPS - prime - fixedUnlinked; fixedLinked++) {
          for (let varUnlinked = 0; varUnlinked <= GRID_STEPS - prime - fixedUnlinked - fixedLinked; varUnlinked++) {
            const varLinked = GRID_STEPS - prime - fixedUnlinked - fixedLinked - varUnlinked;
            const weights = [prime, fixedUnlinked, fixedLinked, varUnlinked, varLinked];

            // Eligibility is fixed and CPI linked, so it counts towards the fixed floor.
            const primeShare = prime * unitShare;
            const variableShare = (prime + varUnlinked + varLinked) * unitShare;
            const fixedShare = (fixedUnlinked + fixedLinked) * unitShare + lockedShare;

            if (
              primeShare > LIMITS.MAX_PRIME_SHARE + LIMITS.SHARE_TOLERANCE ||
              variableShare > LIMITS.MAX_VARIABLE_SHARE + LIMITS.SHARE_TOLERANCE ||
              fixedShare < LIMITS.MIN_FIXED_SHARE - LIMITS.SHARE_TOLERANCE
            ) {
              continue;
            }
            if (
              primeShare > risk.maxPrimeShare + LIMITS.SHARE_TOLERANCE ||
              variableShare > risk.maxVariableShare + LIMITS.SHARE_TOLERANCE
            ) {
              continue;
            }

            let initialPayment = lockedInitialPayment;
            let totalPaid = lockedTotalPaid;
            for (let i = 0; i < CANDIDATES.length; i++) {
              const weight = weights[i]!;
              if (weight === 0) {
                continue;
              }
              const amount = (optimizable * weight) / GRID_STEPS;
              initialPayment += unitInitialPayment[i]! * amount;
              totalPaid += unitTotalPaid[i]! * amount;
            }

            // maxAffordablePayment already nets off existing obligations.
            if (enforcePti && initialPayment > affordable) {
              continue;
            }

            const stressIncrease = stressPeak(weights) - initialPayment;
            if (enforceVolatility && risk.volatilityCapacity > 0 && stressIncrease > risk.volatilityCapacity) {
              continue;
            }

            found.push({ weights, score: 0, totalPaid, stressIncrease });
          }
        }
      }
    }
    return found;
  };

  /**
   * Normalises each metric across the feasible set before weighting, so the objective is not
   * dominated by whichever metric happens to have the larger units.
   */
  const scoreAll = (candidates: Candidate[]): Candidate[] => {
    let minCost = Number.MAX_VALUE;
    let maxCost = -Number.MAX_VALUE;
    let minStress = Number.MAX_VALUE;
    let maxStress = -Number.MAX_VALUE;
    for (const candidate of candidates) {
      minCost = Math.min(minCost, candidate.totalPaid);
      maxCost = Math.max(maxCost, candidate.totalPaid);
      minStress = Math.min(minStress, candidate.stressIncrease);
      maxStress = Math.max(maxStress, candidate.stressIncrease);
    }
    const costRange = Math.max(1e-9, maxCost - minCost);
    const stressRange = Math.max(1e-9, maxStress - minStress);

    for (const candidate of candidates) {
      const w = candidate.weights;
      const costNorm = (candidate.totalPaid - minCost) / costRange;
      const stressNorm = (candidate.stressIncrease - minStress) / stressRange;

      // Eligibility principal is CPI linked, so it carries indexation exposure too.
      const linkedShare = (w[2]! + w[4]!) * unitShare + lockedShare;
      const primeShare = w[0]! * unitShare;
      const fixedShare = (w[1]! + w[2]!) * unitShare + lockedShare;
      const variableShare = (w[0]! + w[3]! + w[4]!) * unitShare;

      const preferenceDeviation =
        (Math.abs(primeShare - borrower.primePreference) +
          Math.abs(fixedShare - borrower.stablePreference) +
          Math.abs(variableShare - borrower.dynamicPreference)) /
        2;

      let score =
        risk.costWeight * costNorm +
        risk.riskWeight * (0.65 * stressNorm + 0.35 * linkedShare * risk.cpiAversion) +
        PREFERENCE_WEIGHT * preferenceDeviation;

      if (risk.prepaymentHorizon > 0 && risk.prepaymentHorizon < horizon) {
        // Fixed tracks are the ones that can attract a discounting fee on early repayment.
        score += PREPAYMENT_PENALTY_WEIGHT * fixedShare * (1 - risk.prepaymentHorizon / horizon);
      }

      candidate.score = score;
    }
    return candidates.sort((a, b) => a.score - b.score);
  };

  const distance = (a: readonly number[], b: readonly number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    }
    return sum / (2 * GRID_STEPS);
  };

  // --- Run the search, relaxing constraints in a fixed order when nothing is feasible ---
  const relaxed: string[] = [];
  let feasible = enumerate(true, true);
  if (feasible.length === 0) {
    relaxed.push('VOLATILITY_CAPACITY');
    feasible = enumerate(false, true);
  }
  if (feasible.length === 0) {
    relaxed.push('PAYMENT_TO_INCOME');
    feasible = enumerate(false, false);
  }

  let bestSpecs: TrackSpec[];
  let bestScore = 0;
  let alternatives: Candidate[] = [];
  let evaluated = 0;

  if (feasible.length === 0) {
    // Nothing satisfies even the regulatory shape at this loan size and term.
    relaxed.push('NO_FEASIBLE_MIX');
    const fallback = [0, GRID_STEPS, 0, 0, 0]; // 100% fixed unlinked is always compliant
    bestSpecs = toSpecs(fallback);
  } else {
    evaluated = feasible.length;
    const scored = scoreAll(feasible);
    const best = scored[0]!;
    bestScore = best.score;
    bestSpecs = toSpecs(best.weights);

    for (const candidate of scored) {
      if (alternatives.length >= 2) {
        break;
      }
      if (distance(candidate.weights, best.weights) < ALTERNATIVE_DISTANCE) {
        continue;
      }
      if (alternatives.every((picked) => distance(candidate.weights, picked.weights) >= ALTERNATIVE_DISTANCE)) {
        alternatives.push(candidate);
      }
    }
  }

  const recommended = buildProposal(
    'OPTIMAL',
    'סל אופטימלי מומלץ',
    'תמהיל שנבנה במיוחד עבור פרופיל הסיכון, ההכנסה ואופק הנזילות שהוזנו.',
    bestSpecs,
    borrower,
    risk,
    scenario,
    true,
    bestScore,
  );

  // --- The three standardised baskets the banks must present alongside their own offer ---
  const basketSpecs = (shares: Partial<Record<TrackType, number>>): TrackSpec[] => {
    const specs: TrackSpec[] = [];
    if (locked) {
      specs.push(locked);
    }
    for (const [track, share] of Object.entries(shares) as [TrackType, number][]) {
      const amount = optimizable * share;
      if (amount > 0.5) {
        specs.push(buildSpec(track, amount));
      }
    }
    return specs;
  };

  const third = 1 / 3;
  const baskets: MixProposal[] = [
    buildProposal(
      'BASKET_1',
      'סל 1 — ודאות מלאה',
      '100% ריבית קבועה לא צמודה. ההחזר החודשי ידוע וקבוע לכל אורך התקופה.',
      basketSpecs({ FIXED_UNLINKED: 1 }),
      borrower,
      risk,
      scenario,
      false,
      0,
    ),
    buildProposal(
      'BASKET_2',
      'סל 2 — שליש שליש שליש',
      'שליש פריים, שליש קבועה צמודה, שליש משתנה צמודה. תמהיל השוק הקלאסי.',
      basketSpecs({ PRIME: third, FIXED_LINKED: third, VARIABLE_LINKED: third }),
      borrower,
      risk,
      scenario,
      false,
      0,
    ),
    buildProposal(
      'BASKET_3',
      'סל 3 — פריים וקבועה לא צמודה',
      'שליש פריים ושני שליש קבועה לא צמודה. ללא חשיפה למדד המחירים לצרכן.',
      basketSpecs({ PRIME: third, FIXED_UNLINKED: 2 / 3 }),
      borrower,
      risk,
      scenario,
      false,
      0,
    ),
  ];

  const savings: SavingsComparison[] = baskets.map((basket) => ({
    againstId: basket.id,
    againstName: basket.name,
    totalPaidSaving: basket.result.totalPaid - recommended.result.totalPaid,
    initialPaymentDelta: recommended.result.initialPayment - basket.result.initialPayment,
    irrDelta: recommended.result.nominalIrr - basket.result.nominalIrr,
  }));

  const alternativeProposals = alternatives.map((candidate, index) =>
    buildProposal(
      `ALTERNATIVE_${index + 1}`,
      index === 0 ? 'חלופה שמרנית יותר' : 'חלופה דינמית יותר',
      'תמהיל חלופי עם איזון שונה בין עלות לתנודתיות.',
      toSpecs(candidate.weights),
      borrower,
      risk,
      scenario,
      false,
      candidate.score,
    ),
  );

  // --- The same mix re-priced over the terms a borrower realistically chooses between ---
  const termSensitivity: TermOption[] = [15, 20, 25, 30].map((years) => {
    const months = years * 12;
    const result = priceMix(bestSpecs.map((spec) => withTerm(spec, months)), scenario);
    return {
      termMonths: months,
      initialPayment: result.initialPayment,
      totalPaid: result.totalPaid,
      nominalIrr: result.nominalIrr,
      affordable:
        result.initialPayment + borrower.existingMonthlyObligations <=
        borrower.monthlyNetIncome * LIMITS.PTI_CEILING,
    };
  });

  return {
    recommended,
    baskets,
    alternatives: alternativeProposals,
    savings,
    riskProfile: risk,
    termSensitivity,
    relaxedConstraints: relaxed,
    scenario,
    candidatesEvaluated: evaluated,
    computeMillis: Math.round(performance.now() - started),
  };
}

/** Re-exported so callers can price a single quoted track without importing the whole engine. */
export { annualRateAt, initialRate };
