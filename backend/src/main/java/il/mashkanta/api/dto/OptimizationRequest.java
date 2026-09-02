package il.mashkanta.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * A request for the tailored mix plus the three regulatory baskets.
 *
 * @param profile    the borrower
 * @param macro      macro assumptions; omitted fields use the published anchors
 * @param percentile where in the market rate distribution to price, 0 being best in market and 0.5
 *                   the Bank of Israel published average. Defaults to the average, which is what a
 *                   bank quotes before any negotiation.
 */
public record OptimizationRequest(
        @Valid @NotNull BorrowerProfileRequest profile,
        @Valid MacroRequest macro,
        @DecimalMin("0.0") @DecimalMax("1.0") Double percentile) {

    public double percentileOrDefault() {
        return percentile == null ? 0.5 : percentile;
    }
}
