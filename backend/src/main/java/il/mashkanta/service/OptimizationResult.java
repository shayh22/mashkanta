package il.mashkanta.service;

import il.mashkanta.engine.MacroScenario;
import java.util.List;

/**
 * Everything the results page needs: the tailored mix, the three regulatory baskets it is measured
 * against, and the honest accounting of which constraints had to be relaxed to find a solution.
 *
 * @param recommended        the tailored optimal mix (סל אופטימלי מומלץ)
 * @param baskets            the Bank of Israel standardised baskets, priced identically
 * @param alternatives       materially different runners-up, for borrowers who want to compare
 * @param savings            recommended versus each basket
 * @param riskProfile        the risk vector the optimizer used
 * @param termSensitivity    the same mix priced at other terms
 * @param relaxedConstraints constraints that had to be dropped to find any feasible mix
 * @param scenario           the macro path everything was priced against
 * @param candidatesEvaluated size of the search space actually scored
 * @param computeMillis      wall-clock time of the optimization
 */
public record OptimizationResult(
        MixProposal recommended,
        List<MixProposal> baskets,
        List<MixProposal> alternatives,
        List<SavingsComparison> savings,
        RiskProfile riskProfile,
        List<TermOption> termSensitivity,
        List<String> relaxedConstraints,
        MacroScenario scenario,
        int candidatesEvaluated,
        long computeMillis) {

    /**
     * The recommendation measured against one alternative mix.
     *
     * @param againstId          identifier of the mix compared against
     * @param againstName        its Hebrew name
     * @param totalPaidSaving    lifetime shekels saved by taking the recommendation
     * @param initialPaymentDelta month-1 payment difference; positive means the recommendation costs more now
     * @param irrDelta           difference in effective annual cost
     */
    public record SavingsComparison(
            String againstId,
            String againstName,
            double totalPaidSaving,
            double initialPaymentDelta,
            double irrDelta) {
    }

    /**
     * The recommended mix re-priced at a different term.
     *
     * @param termMonths     the term
     * @param initialPayment month-1 payment
     * @param totalPaid      lifetime nominal cost
     * @param nominalIrr     effective annual cost
     * @param affordable     whether the payment fits inside the 40% ceiling
     */
    public record TermOption(
            int termMonths,
            double initialPayment,
            double totalPaid,
            double nominalIrr,
            boolean affordable) {
    }
}
