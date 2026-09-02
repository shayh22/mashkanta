package il.mashkanta.api.dto;

import il.mashkanta.engine.MacroScenario;
import il.mashkanta.service.BankComparisonService.BankQuote;
import il.mashkanta.service.OptimizationResult;
import il.mashkanta.service.RiskProfile;
import java.util.List;

/**
 * The answer to "what mix should I take, and how does it compare".
 *
 * @param recommended         the tailored optimal mix
 * @param baskets             the three Bank of Israel standardised baskets
 * @param alternatives        materially different runners-up
 * @param savings             recommended versus each basket
 * @param riskProfile         the risk vector used
 * @param termSensitivity     the recommendation re-priced at other terms
 * @param bankQuotes          the recommended allocation priced at every lender
 * @param relaxedConstraints  constraints dropped to reach a feasible mix, empty in the normal case
 * @param macro               the macro path used
 * @param candidatesEvaluated size of the searched space
 * @param computeMillis       wall clock time of the optimization
 */
public record OptimizationResponse(
        MixProposalDto recommended,
        List<MixProposalDto> baskets,
        List<MixProposalDto> alternatives,
        List<OptimizationResult.SavingsComparison> savings,
        RiskProfile riskProfile,
        List<OptimizationResult.TermOption> termSensitivity,
        List<BankQuote> bankQuotes,
        List<String> relaxedConstraints,
        MacroScenario macro,
        int candidatesEvaluated,
        long computeMillis) {
}
