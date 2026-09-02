package il.mashkanta.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * A request to test whether refinancing pays (SEG-04).
 *
 * @param profile      the borrower; the loan amount is the total being refinanced
 * @param macro        macro assumptions
 * @param existing     the tracks still running today
 * @param proposed     the replacement mix; when omitted the optimizer builds one
 * @param discountRate annual rate used for the present value comparison; defaults to the market
 *                     fixed non-linked rate, which is the borrower's true alternative use of money
 */
public record RefinanceRequest(
        @Valid @NotNull BorrowerProfileRequest profile,
        @Valid MacroRequest macro,
        @Valid @NotEmpty List<ExistingTrackRequest> existing,
        @Valid List<TrackRequest> proposed,
        Double discountRate) {
}
