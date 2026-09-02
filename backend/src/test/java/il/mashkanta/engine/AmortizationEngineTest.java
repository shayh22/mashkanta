package il.mashkanta.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AmortizationEngineTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final MacroScenario baseline = MacroScenario.baseline(0.0575, 0.024, 0.042);
    private final MacroScenario noInflation = MacroScenario.baseline(0.0575, 0.0, 0.042);

    @Test
    @DisplayName("A fixed non-linked Spitzer track pays a flat instalment and closes at zero")
    void fixedUnlinkedIsFlatAndFullyAmortising() {
        TrackSpec spec = TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_000_000, 360, 0.05, baseline);

        TrackResult result = engine.price(spec, baseline);

        assertThat(result.initialPayment()).isCloseTo(5368.22, offset(0.05));
        assertThat(result.maxPayment()).isCloseTo(result.initialPayment(), offset(0.05));
        assertThat(result.schedule()).hasSize(360);
        assertThat(result.schedule().get(359).closingBalance()).isCloseTo(0, offset(0.01));
        assertThat(result.totalIndexation()).isZero();
        assertThat(result.totalPaid()).isCloseTo(result.amount() + result.totalInterest(), offset(1.0));
    }

    @Test
    @DisplayName("Equal principal repays the same principal every month with falling payments")
    void equalPrincipalDecreases() {
        TrackSpec spec = new TrackSpec(TrackType.FIXED_UNLINKED, 600_000, 240, 0.045, 0,
                AmortizationMethod.EQUAL_PRINCIPAL, 0);

        TrackResult result = engine.price(spec, baseline);

        assertThat(result.schedule().get(0).principal()).isCloseTo(2500, offset(0.01));
        assertThat(result.schedule().get(120).principal()).isCloseTo(2500, offset(0.01));
        assertThat(result.schedule().get(0).payment()).isGreaterThan(result.schedule().get(239).payment());
        assertThat(result.schedule().get(239).closingBalance()).isCloseTo(0, offset(0.01));
        // Equal principal repays faster, so it always costs less interest than the same Spitzer loan.
        TrackResult spitzer = engine.price(TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 600_000, 240, 0.045, baseline),
                baseline);
        assertThat(result.totalInterest()).isLessThan(spitzer.totalInterest());
    }

    @Test
    @DisplayName("A CPI-linked track grows its payment with the index and records the uplift")
    void linkedTrackIndexesPrincipal() {
        TrackSpec spec = TrackSpec.ofRate(TrackType.FIXED_LINKED, 1_000_000, 300, 0.03, baseline);

        TrackResult withInflation = engine.price(spec, baseline);
        TrackResult withoutInflation = engine.price(spec, noInflation);

        assertThat(withInflation.totalIndexation()).isGreaterThan(0);
        assertThat(withoutInflation.totalIndexation()).isCloseTo(0, offset(1e-6));
        assertThat(withInflation.maxPayment()).isGreaterThan(withInflation.initialPayment());
        assertThat(withInflation.totalPaid()).isGreaterThan(withoutInflation.totalPaid());
        // Inflation inflates the nominal cost but not the real one.
        assertThat(withInflation.realIrr()).isCloseTo(withoutInflation.nominalIrr(), offset(0.002));
    }

    @Test
    @DisplayName("A prime track reprices when the Bank of Israel moves")
    void primeTrackRepricesOnShock() {
        TrackSpec spec = TrackSpec.ofRate(TrackType.PRIME, 500_000, 240, 0.0525, baseline);

        TrackResult flat = engine.price(spec, baseline);
        TrackResult shocked = engine.price(spec, baseline.withShock(0.02, 0, 1, "shock"));

        assertThat(flat.initialRate()).isCloseTo(0.0525, offset(1e-9));
        assertThat(shocked.initialRate()).isCloseTo(0.0725, offset(1e-9));
        assertThat(shocked.initialPayment()).isGreaterThan(flat.initialPayment());
    }

    @Test
    @DisplayName("A variable track holds its rate for the whole five-year window, then resets")
    void variableTrackResetsEveryFiveYears() {
        TrackSpec spec = TrackSpec.ofRate(TrackType.VARIABLE_UNLINKED, 500_000, 240, 0.0478, baseline);
        MacroScenario shockAtYearThree = baseline.withShock(0.015, 0, 37, "delayed");

        TrackResult result = engine.price(spec, shockAtYearThree);

        // The shock lands in month 37 but the rate is fixed until the month-61 reset.
        assertThat(result.schedule().get(36).annualRate()).isCloseTo(0.0478, offset(1e-9));
        assertThat(result.schedule().get(59).annualRate()).isCloseTo(0.0478, offset(1e-9));
        assertThat(result.schedule().get(60).annualRate()).isCloseTo(0.0628, offset(1e-9));
    }

    @Test
    @DisplayName("A grace period pays interest only, then amortises the full principal")
    void gracePeriodDefersPrincipal() {
        TrackSpec spec = new TrackSpec(TrackType.FIXED_UNLINKED, 400_000, 240, 0.05, 0,
                AmortizationMethod.GRACE, 24);

        TrackResult result = engine.price(spec, baseline);

        assertThat(result.schedule().get(0).principal()).isZero();
        assertThat(result.schedule().get(23).closingBalance()).isCloseTo(400_000, offset(0.01));
        assertThat(result.schedule().get(24).principal()).isGreaterThan(0);
        assertThat(result.schedule().get(239).closingBalance()).isCloseTo(0, offset(0.01));
    }

    @Test
    @DisplayName("A balloon defers everything and capitalises interest into the final payment")
    void balloonCapitalisesInterest() {
        TrackSpec spec = new TrackSpec(TrackType.FIXED_UNLINKED, 300_000, 24, 0.06, 0,
                AmortizationMethod.BALLOON, 0);

        TrackResult result = engine.price(spec, baseline);

        assertThat(result.initialPayment()).isZero();
        // 300,000 compounding monthly at 6% for two years.
        assertThat(result.finalPayment()).isCloseTo(300_000 * Math.pow(1 + 0.06 / 12, 24), offset(1.0));
        assertThat(result.totalPaid()).isCloseTo(result.finalPayment(), offset(0.01));
    }

    @Test
    @DisplayName("A mix sums its tracks month by month")
    void mixCombinesTracks() {
        List<TrackSpec> specs = List.of(
                TrackSpec.ofRate(TrackType.PRIME, 400_000, 240, 0.0525, baseline),
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 600_000, 240, 0.0495, baseline));

        MixResult mix = engine.priceMix(specs, baseline);
        TrackResult prime = engine.price(specs.get(0), baseline);
        TrackResult fixed = engine.price(specs.get(1), baseline);

        assertThat(mix.totalPrincipal()).isEqualTo(1_000_000);
        assertThat(mix.initialPayment()).isCloseTo(prime.initialPayment() + fixed.initialPayment(), offset(0.01));
        assertThat(mix.weightedInitialRate()).isCloseTo(0.4 * 0.0525 + 0.6 * 0.0495, offset(1e-9));
        assertThat(mix.yearlySummary()).hasSize(20);
        assertThat(mix.yearlySummary().get(19).remainingBalance()).isCloseTo(0, offset(0.02));
    }

    @Test
    @DisplayName("Tracks of different lengths leave the household paying only the longer one")
    void mixHandlesUnequalTerms() {
        List<TrackSpec> specs = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 300_000, 120, 0.045, baseline),
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 700_000, 300, 0.0495, baseline));

        MixResult mix = engine.priceMix(specs, baseline);

        assertThat(mix.termMonths()).isEqualTo(300);
        assertThat(mix.paymentAt(120)).isGreaterThan(mix.paymentAt(121));
        assertThat(mix.paymentAt(301)).isZero();
    }
}
