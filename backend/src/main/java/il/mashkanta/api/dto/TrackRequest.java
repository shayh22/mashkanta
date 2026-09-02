package il.mashkanta.api.dto;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.TrackSpec;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * One track of a mix as quoted to the borrower.
 *
 * @param type        the track
 * @param amount      principal in shekels
 * @param termMonths  term; falls back to the mix term when omitted
 * @param annualRate  the all-in rate quoted at origination
 * @param method      repayment table; Spitzer when omitted
 * @param graceMonths interest-only months for a grace schedule
 */
public record TrackRequest(
        @NotNull TrackType type,
        @Positive double amount,
        Integer termMonths,
        @PositiveOrZero double annualRate,
        AmortizationMethod method,
        Integer graceMonths) {

    public TrackSpec toSpec(int defaultTermMonths, MacroScenario scenario) {
        return TrackSpec.ofRate(
                type,
                amount,
                termMonths != null && termMonths > 0 ? termMonths : defaultTermMonths,
                annualRate,
                scenario,
                method == null ? AmortizationMethod.SPITZER : method,
                graceMonths == null ? 0 : graceMonths);
    }
}
