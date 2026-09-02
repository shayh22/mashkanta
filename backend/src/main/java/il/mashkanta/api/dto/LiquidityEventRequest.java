package il.mashkanta.api.dto;

import il.mashkanta.domain.LiquidityEvent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * A future lump sum from the liquidity timeline step of the wizard.
 *
 * @param month                  months from origination
 * @param amount                 expected amount in shekels
 * @param source                 Hebrew label, e.g. "קרן השתלמות"
 * @param earmarkedForPrepayment whether it is intended to repay mortgage principal
 */
public record LiquidityEventRequest(
        @Min(1) int month,
        @PositiveOrZero double amount,
        String source,
        Boolean earmarkedForPrepayment) {

    public LiquidityEvent toDomain() {
        return new LiquidityEvent(month, amount, source == null ? "" : source,
                earmarkedForPrepayment != null && earmarkedForPrepayment);
    }
}
