package il.mashkanta.service;

import il.mashkanta.api.dto.MixSummaryDto;
import il.mashkanta.api.dto.ScheduleRowDto;
import il.mashkanta.api.dto.SimulationRequest;
import il.mashkanta.api.dto.SimulationResponse;
import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackResult;
import il.mashkanta.engine.TrackSpec;
import il.mashkanta.ingestion.MacroAnchorService;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * The request-facing calculation facade: takes a mix the borrower already has, prices it, checks it
 * against the regulator, stresses it, and scores it against the market — in one pass.
 */
@Service
public class MortgageCalculationService {

    private final AmortizationEngine engine;
    private final RegulatoryValidationService regulatory;
    private final StressTestService stressTests;
    private final CustomerProfilingService profiling;
    private final OpportunityScoringService opportunities;
    private final MacroAnchorService anchors;

    public MortgageCalculationService(AmortizationEngine engine, RegulatoryValidationService regulatory,
                                      StressTestService stressTests, CustomerProfilingService profiling,
                                      OpportunityScoringService opportunities, MacroAnchorService anchors) {
        this.engine = engine;
        this.regulatory = regulatory;
        this.stressTests = stressTests;
        this.profiling = profiling;
        this.opportunities = opportunities;
        this.anchors = anchors;
    }

    public SimulationResponse simulate(SimulationRequest request) {
        long start = System.nanoTime();

        BorrowerProfile borrower = request.profile().toDomain();
        MacroScenario scenario = request.macro() == null
                ? MacroScenario.baseline(anchors.current().prime(), anchors.current().cpiAnnual(),
                        anchors.current().bondYield5y())
                : request.macro().toScenario(anchors.current());

        List<TrackSpec> specs = request.tracks().stream()
                .map(track -> track.toSpec(borrower.termMonths(), scenario))
                .toList();

        RiskProfile risk = profiling.profile(borrower);
        MixResult result = engine.priceMix(specs, scenario);
        StressMatrix stress = stressTests.run(specs, scenario, result, risk.volatilityCapacity());
        ComplianceReport compliance = regulatory.validate(borrower, result, stress.worstPayment());
        OpportunityScoringService.OpportunityReport opportunity =
                opportunities.score(specs, borrower.ltv(), scenario);

        List<TrackAllocation> allocations = new ArrayList<>();
        for (TrackResult track : result.tracks()) {
            allocations.add(TrackAllocation.from(track, result.totalPrincipal()));
        }
        allocations.sort((a, b) -> Double.compare(b.amount(), a.amount()));

        List<ScheduleRowDto> schedule = List.of();
        if (request.includeSchedule()) {
            List<ScheduleRowDto> rows = new ArrayList<>();
            for (TrackResult track : result.tracks()) {
                track.schedule().forEach(row -> rows.add(ScheduleRowDto.from(track.type(), row)));
            }
            schedule = List.copyOf(rows);
        }

        long millis = (System.nanoTime() - start) / 1_000_000;
        return new SimulationResponse(
                MixSummaryDto.from(result, allocations),
                compliance,
                stress,
                opportunity,
                schedule,
                scenario,
                millis);
    }
}
