package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StressTestServiceTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final StressTestService stressTests = new StressTestService(engine);
    private final MacroScenario scenario = MacroScenario.defaults();

    private StressMatrix run(List<TrackSpec> specs, double capacity) {
        MixResult baseline = engine.priceMix(specs, scenario);
        return stressTests.run(specs, scenario, baseline, capacity);
    }

    @Test
    @DisplayName("A fully fixed non-linked mix is immune to both shocks")
    void fixedUnlinkedIsImmune() {
        StressMatrix matrix = run(List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 300, 0.0495, scenario)), 500);

        assertThat(matrix.anyBreach()).isFalse();
        assertThat(matrix.worstIncrease()).isLessThan(1.0);
    }

    @Test
    @DisplayName("A prime mix moves with the rate shock and the worst case is the severe one")
    void primeMovesWithRates() {
        StressMatrix matrix = run(List.of(
                TrackSpec.ofRate(TrackType.PRIME, 1_000_000, 300, 0.0525, scenario)), 500);

        StressScenarioResult plusOne = matrix.scenarios().stream()
                .filter(s -> s.id().equals("PRIME_10")).findFirst().orElseThrow();
        StressScenarioResult plusThree = matrix.scenarios().stream()
                .filter(s -> s.id().equals("PRIME_30")).findFirst().orElseThrow();

        assertThat(plusThree.maxPayment()).isGreaterThan(plusOne.maxPayment());
        // A prime track carries no CPI exposure, so the inflation leg of the combined scenario adds
        // nothing: the worst case is whatever applies the largest rate shock.
        assertThat(matrix.worstPayment()).isCloseTo(plusThree.maxPayment(),
                org.assertj.core.data.Offset.offset(0.01));
        assertThat(matrix.anyBreach()).isTrue();
    }

    @Test
    @DisplayName("Inflation shocks bite the linked tracks and leave the unlinked ones alone")
    void inflationOnlyMovesLinkedTracks() {
        StressMatrix linked = run(List.of(
                TrackSpec.ofRate(TrackType.FIXED_LINKED, 1_000_000, 300, 0.0315, scenario)), 0);
        StressMatrix unlinked = run(List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 300, 0.0495, scenario)), 0);

        StressScenarioResult linkedHighCpi = linked.scenarios().stream()
                .filter(s -> s.id().equals("CPI_60")).findFirst().orElseThrow();
        StressScenarioResult unlinkedHighCpi = unlinked.scenarios().stream()
                .filter(s -> s.id().equals("CPI_60")).findFirst().orElseThrow();

        assertThat(linkedHighCpi.paymentIncrease()).isGreaterThan(1_000);
        assertThat(unlinkedHighCpi.paymentIncrease()).isLessThan(1.0);
    }

    @Test
    @DisplayName("A breach is only flagged when the borrower stated a capacity to breach")
    void breachNeedsAStatedCapacity() {
        List<TrackSpec> specs = List.of(TrackSpec.ofRate(TrackType.PRIME, 1_000_000, 300, 0.0525, scenario));

        assertThat(run(specs, 0).anyBreach()).isFalse();
        assertThat(run(specs, 100_000).anyBreach()).isFalse();
        assertThat(run(specs, 100).anyBreach()).isTrue();
    }
}
