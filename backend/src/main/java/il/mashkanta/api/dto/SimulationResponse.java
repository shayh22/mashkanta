package il.mashkanta.api.dto;

import il.mashkanta.engine.MacroScenario;
import il.mashkanta.service.ComplianceReport;
import il.mashkanta.service.OpportunityScoringService.OpportunityReport;
import il.mashkanta.service.StressMatrix;
import java.util.List;

/**
 * The answer to "price this exact mix for me".
 *
 * @param mix           the priced numbers
 * @param compliance    regulatory and affordability verdict
 * @param stress        sensitivity matrix
 * @param opportunity   how the quoted rates compare to the market
 * @param schedule      full monthly table, empty unless the request asked for it
 * @param macro         the macro path used
 * @param computeMillis wall clock time of the calculation
 */
public record SimulationResponse(
        MixSummaryDto mix,
        ComplianceReport compliance,
        StressMatrix stress,
        OpportunityReport opportunity,
        List<ScheduleRowDto> schedule,
        MacroScenario macro,
        long computeMillis) {
}
