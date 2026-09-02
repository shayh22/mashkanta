package il.mashkanta.service;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackResult;
import il.mashkanta.engine.TrackSpec;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Finds the mix that minimises lifetime cost subject to regulation, affordability and the
 * borrower's own tolerance for a moving payment.
 *
 * <p>The search is an exhaustive enumeration over a 5% allocation grid rather than a heuristic. That
 * is affordable because every amortization output is linear in principal: each candidate track is
 * priced once at unit principal, and a mix is then a weighted sum of those unit vectors. The search
 * therefore costs a few million floating point operations instead of tens of thousands of schedule
 * builds, and — unlike a hill climb — it cannot get stuck in a local minimum or return a different
 * answer for the same inputs.
 */
@Service
public class OptimizationService {

    /** Tracks the optimizer is allowed to allocate to. Eligibility is locked, not optimized. */
    private static final TrackType[] CANDIDATES = {
            TrackType.PRIME,
            TrackType.FIXED_UNLINKED,
            TrackType.FIXED_LINKED,
            TrackType.VARIABLE_UNLINKED,
            TrackType.VARIABLE_LINKED
    };

    /** Allocation granularity: 20 steps of 5% each. */
    private static final int GRID_STEPS = 20;
    /** Rate shock used to score payment volatility inside the search loop. */
    private static final double SCORING_RATE_SHOCK = 0.020;
    /** Inflation path used to score payment volatility inside the search loop. */
    private static final double SCORING_CPI = 0.045;
    /** Weight of the borrower's stated track preferences in the objective. */
    private static final double PREFERENCE_WEIGHT = 0.15;
    /** Extra penalty on fixed principal when the borrower plans to prepay and would owe a break fee. */
    private static final double PREPAYMENT_PENALTY_WEIGHT = 0.12;
    /** How different an alternative must be from the winner to be worth showing. */
    private static final double ALTERNATIVE_DISTANCE = 0.20;

    private final AmortizationEngine engine;
    private final MarketBaselineService baseline;
    private final RegulatoryValidationService regulatory;
    private final StressTestService stressTests;

    public OptimizationService(AmortizationEngine engine, MarketBaselineService baseline,
                               RegulatoryValidationService regulatory, StressTestService stressTests) {
        this.engine = engine;
        this.baseline = baseline;
        this.regulatory = regulatory;
        this.stressTests = stressTests;
    }

    /**
     * Runs the full optimization.
     *
     * @param borrower   the profile from the wizard
     * @param risk       the derived risk vector
     * @param scenario   the macro path to price against
     * @param percentile where in the market rate distribution to price, 0 being best in market
     */
    public OptimizationResult optimize(BorrowerProfile borrower, RiskProfile risk,
                                       MacroScenario scenario, double percentile) {
        long start = System.nanoTime();

        Map<TrackType, Double> rates = ratesFor(borrower, percentile);
        double lockedAmount = Math.min(borrower.eligibilityAmount(), borrower.loanAmount());
        double optimizable = borrower.loanAmount() - lockedAmount;

        TrackSpec locked = lockedAmount > 0
                ? new TrackSpec(TrackType.ELIGIBILITY, lockedAmount, borrower.termMonths(),
                        borrower.eligibilityRate() > 0 ? borrower.eligibilityRate() : rates.get(TrackType.ELIGIBILITY),
                        0, AmortizationMethod.SPITZER, 0)
                : null;

        Search search = new Search(borrower, risk, scenario, rates, locked, optimizable);
        SearchOutcome outcome = search.run();

        MixProposal recommended = proposal("OPTIMAL", "סל אופטימלי מומלץ",
                "תמהיל שנבנה במיוחד עבור פרופיל הסיכון, ההכנסה ואופק הנזילות שהוזנו.",
                outcome.best(), borrower, risk, scenario, true, outcome.bestScore());

        List<MixProposal> baskets = regulatoryBaskets(borrower, risk, scenario, rates, locked, optimizable);

        List<MixProposal> alternatives = new ArrayList<>();
        for (Candidate candidate : outcome.alternatives()) {
            alternatives.add(proposal("ALTERNATIVE_" + (alternatives.size() + 1),
                    alternatives.isEmpty() ? "חלופה שמרנית יותר" : "חלופה דינמית יותר",
                    "תמהיל חלופי עם איזון שונה בין עלות לתנודתיות.",
                    search.toSpecs(candidate.weights()), borrower, risk, scenario, false, candidate.score()));
        }

        List<OptimizationResult.SavingsComparison> savings = new ArrayList<>();
        for (MixProposal basket : baskets) {
            savings.add(new OptimizationResult.SavingsComparison(
                    basket.id(),
                    basket.name(),
                    basket.result().totalPaid() - recommended.result().totalPaid(),
                    recommended.result().initialPayment() - basket.result().initialPayment(),
                    recommended.result().nominalIrr() - basket.result().nominalIrr()));
        }

        List<OptimizationResult.TermOption> termSensitivity =
                termSensitivity(outcome.best(), borrower, scenario);

        long millis = (System.nanoTime() - start) / 1_000_000;
        return new OptimizationResult(recommended, baskets, alternatives, savings, risk,
                termSensitivity, outcome.relaxed(), scenario, outcome.evaluated(), millis);
    }

    /** The market rate each candidate track is priced at for this borrower. */
    private Map<TrackType, Double> ratesFor(BorrowerProfile borrower, double percentile) {
        Map<TrackType, Double> rates = new EnumMap<>(TrackType.class);
        for (TrackType track : TrackType.values()) {
            MarketRate rate = baseline.rateFor(track, borrower.ltv(), borrower.termMonths());
            rates.put(track, rate.atPercentile(percentile));
        }
        return rates;
    }

    /** Prices the three standardised baskets the banks must present alongside their own offer. */
    private List<MixProposal> regulatoryBaskets(BorrowerProfile borrower, RiskProfile risk,
                                                MacroScenario scenario, Map<TrackType, Double> rates,
                                                TrackSpec locked, double optimizable) {
        Map<String, MixProposal> baskets = new LinkedHashMap<>();

        baskets.put("BASKET_1", proposal("BASKET_1", "סל 1 — ודאות מלאה",
                "100% ריבית קבועה לא צמודה. ההחזר החודשי ידוע וקבוע לכל אורך התקופה.",
                specsFor(Map.of(TrackType.FIXED_UNLINKED, 1.0), rates, borrower, scenario, locked, optimizable),
                borrower, risk, scenario, false, 0));

        baskets.put("BASKET_2", proposal("BASKET_2", "סל 2 — שליש שליש שליש",
                "שליש פריים, שליש קבועה צמודה, שליש משתנה צמודה. תמהיל השוק הקלאסי.",
                specsFor(Map.of(
                        TrackType.PRIME, 1.0 / 3,
                        TrackType.FIXED_LINKED, 1.0 / 3,
                        TrackType.VARIABLE_LINKED, 1.0 / 3), rates, borrower, scenario, locked, optimizable),
                borrower, risk, scenario, false, 0));

        baskets.put("BASKET_3", proposal("BASKET_3", "סל 3 — פריים וקבועה לא צמודה",
                "שליש פריים ושני שליש קבועה לא צמודה. ללא חשיפה למדד המחירים לצרכן.",
                specsFor(Map.of(
                        TrackType.PRIME, 1.0 / 3,
                        TrackType.FIXED_UNLINKED, 2.0 / 3), rates, borrower, scenario, locked, optimizable),
                borrower, risk, scenario, false, 0));

        return List.copyOf(baskets.values());
    }

    private List<TrackSpec> specsFor(Map<TrackType, Double> shares, Map<TrackType, Double> rates,
                                     BorrowerProfile borrower, MacroScenario scenario,
                                     TrackSpec locked, double optimizable) {
        List<TrackSpec> specs = new ArrayList<>();
        if (locked != null) {
            specs.add(locked);
        }
        shares.forEach((track, share) -> {
            double amount = optimizable * share;
            if (amount > 0.5) {
                // ofRate backs the bank margin out of the quoted rate, so anchored tracks keep
                // re-pricing correctly when the scenario is shocked.
                specs.add(TrackSpec.ofRate(track, amount, borrower.termMonths(), rates.get(track), scenario));
            }
        });
        return specs;
    }

    /** Prices, checks and stresses one mix. */
    private MixProposal proposal(String id, String name, String description, List<TrackSpec> specs,
                                 BorrowerProfile borrower, RiskProfile risk, MacroScenario scenario,
                                 boolean recommended, double score) {
        MixResult result = engine.priceMix(specs, scenario);
        StressMatrix stress = stressTests.run(specs, scenario, result, risk.volatilityCapacity());
        ComplianceReport compliance = regulatory.validate(borrower, result, stress.worstPayment());
        List<TrackAllocation> allocations = new ArrayList<>();
        for (TrackResult track : result.tracks()) {
            allocations.add(TrackAllocation.from(track, result.totalPrincipal()));
        }
        allocations.sort((a, b) -> Double.compare(b.amount(), a.amount()));
        return new MixProposal(id, name, description, specs, List.copyOf(allocations), result,
                compliance, stress, score, recommended);
    }

    /** Re-prices the winning mix over the terms a borrower realistically chooses between. */
    private List<OptimizationResult.TermOption> termSensitivity(List<TrackSpec> specs,
                                                                BorrowerProfile borrower,
                                                                MacroScenario scenario) {
        List<OptimizationResult.TermOption> options = new ArrayList<>();
        for (int years : new int[]{15, 20, 25, 30}) {
            int months = years * 12;
            List<TrackSpec> retermed = specs.stream().map(spec -> spec.withTerm(months)).toList();
            MixResult result = engine.priceMix(retermed, scenario);
            options.add(new OptimizationResult.TermOption(months, result.initialPayment(), result.totalPaid(),
                    result.nominalIrr(),
                    result.initialPayment() + borrower.existingMonthlyObligations()
                            <= borrower.monthlyNetIncome() * RegulatoryLimits.PTI_CEILING));
        }
        return List.copyOf(options);
    }

    /** A scored point in the allocation grid. */
    private record Candidate(int[] weights, double score, double totalPaid, double stressIncrease) {
    }

    private record SearchOutcome(List<TrackSpec> best, double bestScore, List<Candidate> alternatives,
                                 List<String> relaxed, int evaluated) {
    }

    /**
     * The search itself, scoped to one request so the precomputed unit vectors stay on the stack of
     * a single call and the service remains stateless and thread safe.
     */
    private final class Search {

        private final BorrowerProfile borrower;
        private final RiskProfile risk;
        private final MacroScenario scenario;
        private final Map<TrackType, Double> rates;
        private final TrackSpec locked;
        private final double optimizable;
        private final double totalPrincipal;
        private final int horizon;

        private final double[][] unitStressPayments = new double[CANDIDATES.length][];
        private final double[] unitInitialPayment = new double[CANDIDATES.length];
        private final double[] unitTotalPaid = new double[CANDIDATES.length];

        private double[] lockedStressPayments = new double[0];
        private double lockedInitialPayment;
        private double lockedTotalPaid;

        private Search(BorrowerProfile borrower, RiskProfile risk, MacroScenario scenario,
                       Map<TrackType, Double> rates, TrackSpec locked, double optimizable) {
            this.borrower = borrower;
            this.risk = risk;
            this.scenario = scenario;
            this.rates = rates;
            this.locked = locked;
            this.optimizable = optimizable;
            this.totalPrincipal = borrower.loanAmount();
            this.horizon = borrower.termMonths();
            precompute();
        }

        /** Prices every candidate track once at unit principal, under baseline and under stress. */
        private void precompute() {
            MacroScenario stressed = scenario.withShock(SCORING_RATE_SHOCK,
                    SCORING_CPI - scenario.cpiAnnual(), 1, "scoring");

            for (int i = 0; i < CANDIDATES.length; i++) {
                TrackSpec unit = buildSpec(CANDIDATES[i], 1.0);
                TrackResult base = engine.price(unit, scenario);
                TrackResult shock = engine.price(unit, stressed);
                unitInitialPayment[i] = base.initialPayment();
                unitTotalPaid[i] = base.totalPaid();
                unitStressPayments[i] = payments(shock);
            }

            if (locked != null) {
                TrackResult base = engine.price(locked, scenario);
                TrackResult shock = engine.price(locked, stressed);
                lockedInitialPayment = base.initialPayment();
                lockedTotalPaid = base.totalPaid();
                lockedStressPayments = payments(shock);
            }
        }

        private double[] payments(TrackResult result) {
            double[] out = new double[horizon];
            result.schedule().forEach(row -> {
                if (row.month() <= horizon) {
                    out[row.month() - 1] = row.payment();
                }
            });
            return out;
        }

        private TrackSpec buildSpec(TrackType track, double amount) {
            return TrackSpec.ofRate(track, amount, horizon, rates.get(track), scenario);
        }

        List<TrackSpec> toSpecs(int[] weights) {
            List<TrackSpec> specs = new ArrayList<>();
            if (locked != null) {
                specs.add(locked);
            }
            for (int i = 0; i < CANDIDATES.length; i++) {
                if (weights[i] == 0) {
                    continue;
                }
                double amount = optimizable * weights[i] / GRID_STEPS;
                if (amount > 0.5) {
                    specs.add(buildSpec(CANDIDATES[i], amount));
                }
            }
            return specs;
        }

        SearchOutcome run() {
            List<String> relaxed = new ArrayList<>();
            List<Candidate> feasible = enumerate(true, true);

            if (feasible.isEmpty()) {
                relaxed.add("VOLATILITY_CAPACITY");
                feasible = enumerate(false, true);
            }
            if (feasible.isEmpty()) {
                relaxed.add("PAYMENT_TO_INCOME");
                feasible = enumerate(false, false);
            }
            if (feasible.isEmpty()) {
                // Nothing satisfies even the regulatory shape at this loan size and term.
                relaxed.add("NO_FEASIBLE_MIX");
                int[] fallback = new int[CANDIDATES.length];
                fallback[1] = GRID_STEPS; // 100% fixed unlinked is always regulation-compliant
                return new SearchOutcome(toSpecs(fallback), 0, List.of(), List.copyOf(relaxed), 0);
            }

            int evaluated = feasible.size();
            List<Candidate> scored = score(feasible);
            Candidate best = scored.get(0);
            List<Candidate> alternatives = pickAlternatives(scored, best);

            return new SearchOutcome(toSpecs(best.weights()), best.score(), alternatives,
                    List.copyOf(relaxed), evaluated);
        }

        /**
         * Walks the whole 5% grid. Cheap share and affordability tests run before the payment
         * vectors are combined, so the expensive work only happens for shapes that could win.
         */
        private List<Candidate> enumerate(boolean enforceVolatility, boolean enforcePti) {
            List<Candidate> found = new ArrayList<>();
            double lockedShare = totalPrincipal > 0 ? (totalPrincipal - optimizable) / totalPrincipal : 0;
            double unitShare = totalPrincipal > 0 ? optimizable / (GRID_STEPS * totalPrincipal) : 0;
            double maxPayment = borrower.maxAffordablePayment();

            for (int prime = 0; prime <= GRID_STEPS; prime++) {
                for (int fixedUnlinked = 0; fixedUnlinked <= GRID_STEPS - prime; fixedUnlinked++) {
                    for (int fixedLinked = 0; fixedLinked <= GRID_STEPS - prime - fixedUnlinked; fixedLinked++) {
                        for (int varUnlinked = 0;
                             varUnlinked <= GRID_STEPS - prime - fixedUnlinked - fixedLinked; varUnlinked++) {
                            int varLinked = GRID_STEPS - prime - fixedUnlinked - fixedLinked - varUnlinked;
                            int[] weights = {prime, fixedUnlinked, fixedLinked, varUnlinked, varLinked};

                            // Eligibility is fixed and CPI linked, so it counts towards the fixed floor.
                            double primeShare = prime * unitShare;
                            double variableShare = (prime + varUnlinked + varLinked) * unitShare;
                            double fixedShare = (fixedUnlinked + fixedLinked) * unitShare + lockedShare;

                            if (primeShare > RegulatoryLimits.MAX_PRIME_SHARE + RegulatoryLimits.SHARE_TOLERANCE
                                    || variableShare > RegulatoryLimits.MAX_VARIABLE_SHARE + RegulatoryLimits.SHARE_TOLERANCE
                                    || fixedShare < RegulatoryLimits.MIN_FIXED_SHARE - RegulatoryLimits.SHARE_TOLERANCE) {
                                continue;
                            }
                            if (primeShare > risk.maxPrimeShare() + RegulatoryLimits.SHARE_TOLERANCE
                                    || variableShare > risk.maxVariableShare() + RegulatoryLimits.SHARE_TOLERANCE) {
                                continue;
                            }

                            double initialPayment = lockedInitialPayment;
                            double totalPaid = lockedTotalPaid;
                            for (int i = 0; i < CANDIDATES.length; i++) {
                                if (weights[i] == 0) {
                                    continue;
                                }
                                double amount = optimizable * weights[i] / GRID_STEPS;
                                initialPayment += unitInitialPayment[i] * amount;
                                totalPaid += unitTotalPaid[i] * amount;
                            }

                            // maxAffordablePayment already nets off existing obligations.
                            if (enforcePti && initialPayment > maxPayment) {
                                continue;
                            }

                            double stressPeak = stressPeak(weights);
                            double stressIncrease = stressPeak - initialPayment;
                            if (enforceVolatility && risk.volatilityCapacity() > 0
                                    && stressIncrease > risk.volatilityCapacity()) {
                                continue;
                            }

                            found.add(new Candidate(weights, 0, totalPaid, stressIncrease));
                        }
                    }
                }
            }
            return found;
        }

        /** Highest combined monthly payment under the scoring shock. */
        private double stressPeak(int[] weights) {
            double peak = 0;
            for (int month = 0; month < horizon; month++) {
                double total = month < lockedStressPayments.length ? lockedStressPayments[month] : 0;
                for (int i = 0; i < CANDIDATES.length; i++) {
                    if (weights[i] == 0) {
                        continue;
                    }
                    total += unitStressPayments[i][month] * optimizable * weights[i] / GRID_STEPS;
                }
                if (total > peak) {
                    peak = total;
                }
            }
            return peak;
        }

        /**
         * Normalises each metric across the feasible set before weighting, so the objective is not
         * dominated by whichever metric happens to have the larger units.
         */
        private List<Candidate> score(List<Candidate> candidates) {
            double minCost = Double.MAX_VALUE;
            double maxCost = -Double.MAX_VALUE;
            double minStress = Double.MAX_VALUE;
            double maxStress = -Double.MAX_VALUE;
            for (Candidate candidate : candidates) {
                minCost = Math.min(minCost, candidate.totalPaid());
                maxCost = Math.max(maxCost, candidate.totalPaid());
                minStress = Math.min(minStress, candidate.stressIncrease());
                maxStress = Math.max(maxStress, candidate.stressIncrease());
            }
            double costRange = Math.max(1e-9, maxCost - minCost);
            double stressRange = Math.max(1e-9, maxStress - minStress);
            double unitShare = totalPrincipal > 0 ? optimizable / (GRID_STEPS * totalPrincipal) : 0;
            double lockedShare = totalPrincipal > 0 ? (totalPrincipal - optimizable) / totalPrincipal : 0;

            List<Candidate> scored = new ArrayList<>(candidates.size());
            for (Candidate candidate : candidates) {
                int[] w = candidate.weights();
                double costNorm = (candidate.totalPaid() - minCost) / costRange;
                double stressNorm = (candidate.stressIncrease() - minStress) / stressRange;

                // Eligibility principal is CPI linked, so it carries indexation exposure too.
                double linkedShare = (w[2] + w[4]) * unitShare + lockedShare;
                double primeShare = w[0] * unitShare;
                double fixedShare = (w[1] + w[2]) * unitShare + lockedShare;
                double variableShare = (w[0] + w[3] + w[4]) * unitShare;

                double preferenceDeviation = (Math.abs(primeShare - borrower.primePreference())
                        + Math.abs(fixedShare - borrower.stablePreference())
                        + Math.abs(variableShare - borrower.dynamicPreference())) / 2.0;

                double score = risk.costWeight() * costNorm
                        + risk.riskWeight() * (0.65 * stressNorm + 0.35 * linkedShare * risk.cpiAversion())
                        + PREFERENCE_WEIGHT * preferenceDeviation;

                if (risk.expectsEarlyRepayment() && risk.prepaymentHorizon() < horizon) {
                    // Fixed tracks are the ones that can attract a discounting fee on early repayment.
                    score += PREPAYMENT_PENALTY_WEIGHT * fixedShare
                            * (1.0 - (double) risk.prepaymentHorizon() / horizon);
                }

                scored.add(new Candidate(w, score, candidate.totalPaid(), candidate.stressIncrease()));
            }
            scored.sort((a, b) -> Double.compare(a.score(), b.score()));
            return scored;
        }

        /** Two runners-up that are structurally different from the winner, not neighbours of it. */
        private List<Candidate> pickAlternatives(List<Candidate> scored, Candidate best) {
            List<Candidate> alternatives = new ArrayList<>();
            for (Candidate candidate : scored) {
                if (alternatives.size() >= 2) {
                    break;
                }
                if (distance(candidate.weights(), best.weights()) < ALTERNATIVE_DISTANCE) {
                    continue;
                }
                boolean tooCloseToPicked = alternatives.stream()
                        .anyMatch(picked -> distance(candidate.weights(), picked.weights()) < ALTERNATIVE_DISTANCE);
                if (!tooCloseToPicked) {
                    alternatives.add(candidate);
                }
            }
            return alternatives;
        }

        private double distance(int[] a, int[] b) {
            int sum = 0;
            for (int i = 0; i < a.length; i++) {
                sum += Math.abs(a[i] - b[i]);
            }
            return (double) sum / (2.0 * GRID_STEPS);
        }
    }
}
