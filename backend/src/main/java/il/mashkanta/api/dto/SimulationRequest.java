package il.mashkanta.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * A request to price a specific mix the borrower already has in hand.
 *
 * @param profile         the borrower, for the affordability and LTV checks
 * @param macro           macro assumptions; omitted fields use the published anchors
 * @param tracks          the mix to price
 * @param includeSchedule whether to return the full month-by-month table
 */
public record SimulationRequest(
        @Valid @NotNull BorrowerProfileRequest profile,
        @Valid MacroRequest macro,
        @Valid @NotEmpty List<TrackRequest> tracks,
        boolean includeSchedule) {
}
