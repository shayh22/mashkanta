package il.mashkanta.api;

import il.mashkanta.api.dto.ExistingTrackRequest;
import il.mashkanta.api.dto.MixProposalDto;
import il.mashkanta.api.dto.OptimizationRequest;
import il.mashkanta.api.dto.OptimizationResponse;
import il.mashkanta.api.dto.RefinanceRequest;
import il.mashkanta.api.dto.SimulationRequest;
import il.mashkanta.api.dto.SimulationResponse;
import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.TrackSpec;
import il.mashkanta.ingestion.MacroAnchorService;
import il.mashkanta.service.BankComparisonService;
import il.mashkanta.service.CustomerProfilingService;
import il.mashkanta.service.MarketBaselineService;
import il.mashkanta.service.MortgageCalculationService;
import il.mashkanta.service.OptimizationResult;
import il.mashkanta.service.OptimizationService;
import il.mashkanta.service.RefinanceService;
import il.mashkanta.service.RiskProfile;
import il.mashkanta.service.TrackAllocation;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Pricing, optimization and refinancing endpoints. */
@RestController
@RequestMapping("/api/v1/mortgage")
@Tag(name = "Mortgage", description = "חישוב, אופטימיזציה ומיחזור משכנתא")
public class MortgageController {

    private final MortgageCalculationService calculations;
    private final OptimizationService optimization;
    private final CustomerProfilingService profiling;
    private final BankComparisonService banks;
    private final RefinanceService refinance;
    private final MarketBaselineService baseline;
    private final MacroAnchorService anchors;

    public MortgageController(MortgageCalculationService calculations, OptimizationService optimization,
                              CustomerProfilingService profiling, BankComparisonService banks,
                              RefinanceService refinance, MarketBaselineService baseline,
                              MacroAnchorService anchors) {
        this.calculations = calculations;
        this.optimization = optimization;
        this.profiling = profiling;
        this.banks = banks;
        this.refinance = refinance;
        this.baseline = baseline;
        this.anchors = anchors;
    }

    @PostMapping("/simulate")
    @Operation(summary = "Prices a specific mix, with regulatory checks, stress tests and a market score")
    public ResponseEntity<SimulationResponse> simulate(@Valid @RequestBody SimulationRequest request) {
        return ResponseEntity.ok(calculations.simulate(request));
    }

    @PostMapping("/optimize")
    @Operation(summary = "Computes the tailored optimal mix alongside the three Bank of Israel baskets")
    public ResponseEntity<OptimizationResponse> optimize(@Valid @RequestBody OptimizationRequest request) {
        BorrowerProfile borrower = request.profile().toDomain();
        MacroScenario scenario = scenarioOf(request);
        RiskProfile risk = profiling.profile(borrower);

        OptimizationResult result = optimization.optimize(borrower, risk, scenario, request.percentileOrDefault());

        Map<TrackType, Double> allocation = new EnumMap<>(TrackType.class);
        for (TrackAllocation track : result.recommended().allocations()) {
            allocation.merge(track.track(), track.share(), Double::sum);
        }
        List<BankComparisonService.BankQuote> quotes = banks.compare(allocation, borrower.loanAmount(),
                borrower.termMonths(), borrower.ltv(), scenario);

        List<MixProposalDto> baskets = result.baskets().stream().map(MixProposalDto::from).toList();
        List<MixProposalDto> alternatives = result.alternatives().stream().map(MixProposalDto::from).toList();

        return ResponseEntity.ok(new OptimizationResponse(
                MixProposalDto.from(result.recommended()),
                baskets,
                alternatives,
                result.savings(),
                result.riskProfile(),
                result.termSensitivity(),
                quotes,
                result.relaxedConstraints(),
                scenario,
                result.candidatesEvaluated(),
                result.computeMillis()));
    }

    @PostMapping("/refinance")
    @Operation(summary = "Compares an existing mortgage against a replacement, net of the early repayment fee")
    public ResponseEntity<RefinanceService.RefinanceAnalysis> refinance(@Valid @RequestBody RefinanceRequest request) {
        BorrowerProfile borrower = request.profile().toDomain();
        MacroScenario scenario = request.macro() == null
                ? MacroScenario.baseline(anchors.current().prime(), anchors.current().cpiAnnual(),
                        anchors.current().bondYield5y())
                : request.macro().toScenario(anchors.current());

        List<TrackSpec> existing = new ArrayList<>();
        List<Double> marketRates = new ArrayList<>();
        for (ExistingTrackRequest track : request.existing()) {
            existing.add(track.toSpec(scenario));
            marketRates.add(track.currentMarketRate() != null
                    ? track.currentMarketRate()
                    : baseline.rateFor(track.type(), borrower.ltv(), track.remainingMonths()).medianRate());
        }

        List<TrackSpec> proposed;
        if (request.proposed() == null || request.proposed().isEmpty()) {
            // No replacement offer supplied — measure the switch against the mix we would recommend.
            RiskProfile risk = profiling.profile(borrower);
            proposed = optimization.optimize(borrower, risk, scenario, 0.35).recommended().specs();
        } else {
            proposed = request.proposed().stream()
                    .map(track -> track.toSpec(borrower.termMonths(), scenario))
                    .toList();
        }

        double discountRate = request.discountRate() != null
                ? request.discountRate()
                : baseline.rateFor(TrackType.FIXED_UNLINKED, borrower.ltv(), borrower.termMonths()).medianRate();

        return ResponseEntity.ok(refinance.analyse(existing, proposed, marketRates, scenario, discountRate));
    }

    private MacroScenario scenarioOf(OptimizationRequest request) {
        return request.macro() == null
                ? MacroScenario.baseline(anchors.current().prime(), anchors.current().cpiAnnual(),
                        anchors.current().bondYield5y())
                : request.macro().toScenario(anchors.current());
    }
}
