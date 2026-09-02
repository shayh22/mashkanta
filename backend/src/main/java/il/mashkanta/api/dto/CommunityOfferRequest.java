package il.mashkanta.api.dto;

import il.mashkanta.domain.TrackType;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * An anonymous community submission of terms received from a lender.
 *
 * <p>The shape is the privacy control: there is no field for a name, an identity number or an
 * account, so a well-meaning contributor has nowhere to type one.
 *
 * @param bankCode   the lender
 * @param track      the track
 * @param ltv        loan-to-value of the deal, which selects the comparison bucket
 * @param annualRate the all-in rate quoted
 * @param termMonths the term quoted
 * @param dtiBand    coarse DTI band such as "30-40%", never the underlying income
 * @param observedOn when the offer was received
 */
public record CommunityOfferRequest(
        String bankCode,
        @NotNull TrackType track,
        @DecimalMin("0.05") @DecimalMax("0.95") double ltv,
        @DecimalMin("0.0") @DecimalMax("0.25") double annualRate,
        @Min(12) int termMonths,
        String dtiBand,
        LocalDate observedOn) {
}
