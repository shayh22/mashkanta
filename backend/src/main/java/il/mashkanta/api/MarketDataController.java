package il.mashkanta.api;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.BuyerSegment;
import il.mashkanta.domain.TrackType;
import il.mashkanta.documents.PiiRedactionService;
import il.mashkanta.ingestion.MacroAnchorService;
import il.mashkanta.ingestion.MacroAnchors;
import il.mashkanta.service.BankComparisonService;
import il.mashkanta.service.MarketBaselineService;
import il.mashkanta.service.MarketRate;
import il.mashkanta.service.RegulatoryLimits;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public market data: the rate baseline, lender positions and the reference metadata the UI needs. */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Market data", description = "בסיס נתוני השוק, ריביות הבנקים ונתוני עזר")
public class MarketDataController {

    private final MarketBaselineService baseline;
    private final BankComparisonService banks;
    private final MacroAnchorService anchors;

    public MarketDataController(MarketBaselineService baseline, BankComparisonService banks,
                                MacroAnchorService anchors) {
        this.baseline = baseline;
        this.banks = banks;
        this.anchors = anchors;
    }

    @GetMapping("/market-baseline/current")
    @Operation(summary = "The current market rate distribution by track and LTV bucket")
    public ResponseEntity<BaselineResponse> baseline() {
        return ResponseEntity.ok(new BaselineResponse(
                baseline.currentTable(), baseline.lastRefreshedOn(), anchors.current()));
    }

    @GetMapping("/banks")
    @Operation(summary = "Indicative pricing positions per lender, derived from public tariffs")
    public ResponseEntity<List<BankComparisonService.BankRateSheet>> banks() {
        return ResponseEntity.ok(banks.rateSheets());
    }

    @GetMapping("/reference")
    @Operation(summary = "Enumerations, regulatory limits and published anchors used by the wizard")
    public ResponseEntity<ReferenceResponse> reference() {
        List<TrackDescriptor> tracks = new ArrayList<>();
        for (TrackType track : TrackType.values()) {
            tracks.add(new TrackDescriptor(track, track.hebrewName(), track.englishName(),
                    track.isCpiLinked(), track.isVariableRate(), track.anchorResetMonths(),
                    track.isPrimeAnchored()));
        }

        List<SegmentDescriptor> segments = new ArrayList<>();
        for (BuyerSegment segment : BuyerSegment.values()) {
            segments.add(new SegmentDescriptor(segment, segment.code(), segment.hebrewName(),
                    segment.englishName(), segment.maxLtv()));
        }

        List<MethodDescriptor> methods = new ArrayList<>();
        for (AmortizationMethod method : AmortizationMethod.values()) {
            methods.add(new MethodDescriptor(method, method.hebrewName(), method.englishName()));
        }

        Map<String, Double> limits = Map.of(
                "ptiWarning", RegulatoryLimits.PTI_WARNING,
                "ptiCeiling", RegulatoryLimits.PTI_CEILING,
                "maxPrimeShare", RegulatoryLimits.MAX_PRIME_SHARE,
                "maxVariableShare", RegulatoryLimits.MAX_VARIABLE_SHARE,
                "minFixedShare", RegulatoryLimits.MIN_FIXED_SHARE,
                "maxTermMonths", (double) RegulatoryLimits.MAX_TERM_MONTHS,
                "minTermMonths", (double) RegulatoryLimits.MIN_TERM_MONTHS);

        return ResponseEntity.ok(new ReferenceResponse(tracks, segments, methods, limits,
                anchors.current(), PiiRedactionService.categories()));
    }

    /**
     * @param rates          the rate distribution per track and bucket
     * @param lastRefreshed  when the baseline was last rebuilt
     * @param anchors        the published economic anchors in force
     */
    public record BaselineResponse(List<MarketRate> rates, LocalDate lastRefreshed, MacroAnchors anchors) {
    }

    /**
     * @param tracks           track metadata driving the UI labels and badges
     * @param segments         buyer segments and their LTV ceilings
     * @param methods          repayment tables
     * @param limits           regulatory thresholds
     * @param anchors          published economic anchors
     * @param redactedCategories the PII categories the document pipeline strips
     */
    public record ReferenceResponse(
            List<TrackDescriptor> tracks,
            List<SegmentDescriptor> segments,
            List<MethodDescriptor> methods,
            Map<String, Double> limits,
            MacroAnchors anchors,
            List<String> redactedCategories) {
    }

    /**
     * @param id                track identifier
     * @param hebrewName        display name
     * @param englishName       English name
     * @param cpiLinked         whether principal is indexed to the CPI
     * @param variableRate      whether the rate can change
     * @param anchorResetMonths months between rate resets
     * @param primeAnchored     whether it is quoted over prime
     */
    public record TrackDescriptor(
            TrackType id,
            String hebrewName,
            String englishName,
            boolean cpiLinked,
            boolean variableRate,
            int anchorResetMonths,
            boolean primeAnchored) {
    }

    /**
     * @param id          segment identifier
     * @param code        segment code, e.g. SEG-01
     * @param hebrewName  display name
     * @param englishName English name
     * @param maxLtv      the regulatory LTV ceiling
     */
    public record SegmentDescriptor(
            BuyerSegment id,
            String code,
            String hebrewName,
            String englishName,
            double maxLtv) {
    }

    /**
     * @param id          method identifier
     * @param hebrewName  display name
     * @param englishName English name
     */
    public record MethodDescriptor(AmortizationMethod id, String hebrewName, String englishName) {
    }
}
