package il.mashkanta.api.dto;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.TrackSpec;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * A track still running on the borrower's existing mortgage.
 *
 * @param type               the track
 * @param outstandingBalance principal still owed
 * @param annualRate         the contracted rate
 * @param remainingMonths    payments still to be made
 * @param currentMarketRate  today's average rate for the remaining term; used to price the break fee
 */
public record ExistingTrackRequest(
        @NotNull TrackType type,
        @Positive double outstandingBalance,
        @Positive double annualRate,
        @Min(1) int remainingMonths,
        Double currentMarketRate) {

    public TrackSpec toSpec(MacroScenario scenario) {
        return TrackSpec.ofRate(type, outstandingBalance, remainingMonths, annualRate, scenario);
    }
}
