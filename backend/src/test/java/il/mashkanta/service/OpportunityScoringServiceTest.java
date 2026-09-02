package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.TrackSpec;
import il.mashkanta.persistence.CrowdOfferRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class OpportunityScoringServiceTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final MarketBaselineService baseline =
            new MarketBaselineService(Mockito.mock(CrowdOfferRepository.class));
    private final OpportunityScoringService scoring = new OpportunityScoringService(baseline, engine);
    private final MacroScenario scenario = MacroScenario.defaults();

    @Test
    @DisplayName("An expensive offer scores low and is quoted a saving worth negotiating for")
    void expensiveOfferScoresLow() {
        List<TrackSpec> offered = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 300, 0.058, scenario));

        OpportunityScoringService.OpportunityReport report = scoring.score(offered, 0.65, scenario);

        assertThat(report.score()).isLessThan(30);
        assertThat(report.potentialSaving()).isGreaterThan(50_000);
        assertThat(report.tracks().get(0).gapToMedian()).isGreaterThan(0);
    }

    @Test
    @DisplayName("A best-in-market offer scores at the top with nothing left to negotiate")
    void bestInMarketOfferScoresHigh() {
        double best = baseline.rateFor(TrackType.FIXED_UNLINKED, 0.65, 300).bestRate();
        List<TrackSpec> offered = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 300, best, scenario));

        OpportunityScoringService.OpportunityReport report = scoring.score(offered, 0.65, scenario);

        assertThat(report.score()).isEqualTo(100);
        assertThat(report.potentialSaving()).isLessThan(1.0);
        assertThat(report.narrative()).contains("קרובה מאוד");
    }

    @Test
    @DisplayName("A lower LTV is compared against a cheaper bucket, so the same rate scores worse")
    void ltvBucketChangesTheComparison() {
        List<TrackSpec> offered = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 300, 0.0512, scenario));

        int highLtvScore = scoring.score(offered, 0.70, scenario).score();
        int lowLtvScore = scoring.score(offered, 0.40, scenario).score();

        assertThat(lowLtvScore).isLessThan(highLtvScore);
    }
}
