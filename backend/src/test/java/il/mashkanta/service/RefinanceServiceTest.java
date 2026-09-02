package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.TrackSpec;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RefinanceServiceTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final PrepaymentPenaltyService penalties = new PrepaymentPenaltyService();
    private final RefinanceService refinance = new RefinanceService(engine, penalties);
    private final MacroScenario scenario = MacroScenario.defaults();

    @Test
    @DisplayName("Refinancing below the market average pays, and the breakeven month is reported")
    void cheaperReplacementIsWorthwhile() {
        List<TrackSpec> existing = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.062, scenario));
        List<TrackSpec> proposed = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.048, scenario));

        // The break fee is discounted at the published average (5.5%); the borrower negotiated 4.8%.
        RefinanceService.RefinanceAnalysis analysis =
                refinance.analyse(existing, proposed, List.of(0.055), scenario, 0.055);

        assertThat(analysis.monthlySaving()).isGreaterThan(0);
        assertThat(analysis.breakFee()).isGreaterThan(0);
        assertThat(analysis.lifetimeSaving()).isGreaterThan(0);
        assertThat(analysis.breakevenMonth()).isBetween(1, 200);
        assertThat(analysis.netPresentValue()).isGreaterThan(0);
        assertThat(analysis.worthwhile()).isTrue();
        assertThat(analysis.recommendation()).contains("משתלם");
    }

    @Test
    @DisplayName("Refinancing at exactly the rate the break fee is discounted at is a wash")
    void refinancingAtTheDiscountingRateGainsNothing() {
        // The discounting fee is defined as the lender's lost present value at the market rate, so a
        // borrower who refinances at that same rate hands the whole gain straight back as the fee.
        List<TrackSpec> existing = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.062, scenario));
        List<TrackSpec> proposed = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.048, scenario));

        RefinanceService.RefinanceAnalysis analysis =
                refinance.analyse(existing, proposed, List.of(0.048), scenario, 0.048);

        assertThat(analysis.monthlySaving()).isGreaterThan(0);
        assertThat(analysis.netPresentValue()).isCloseTo(-60, org.assertj.core.data.Offset.offset(50.0));
    }

    @Test
    @DisplayName("Refinancing into a worse rate never pays and says so")
    void moreExpensiveReplacementIsRejected() {
        List<TrackSpec> existing = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.042, scenario));
        List<TrackSpec> proposed = List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 200, 0.055, scenario));

        RefinanceService.RefinanceAnalysis analysis =
                refinance.analyse(existing, proposed, List.of(0.05), scenario, 0.05);

        assertThat(analysis.worthwhile()).isFalse();
        assertThat(analysis.breakevenMonth()).isZero();
        assertThat(analysis.recommendation()).contains("אינו משתלם");
    }

    @Test
    @DisplayName("The discounting fee appears only when market rates have fallen below the contract")
    void discountingFeeOnlyWhenRatesFell() {
        PrepaymentPenaltyService.PrepaymentQuote whenRatesFell =
                penalties.quote(700_000, 0.06, 0.04, 180, TrackType.FIXED_UNLINKED);
        PrepaymentPenaltyService.PrepaymentQuote whenRatesRose =
                penalties.quote(700_000, 0.04, 0.06, 180, TrackType.FIXED_UNLINKED);
        PrepaymentPenaltyService.PrepaymentQuote variableTrack =
                penalties.quote(700_000, 0.06, 0.04, 180, TrackType.PRIME);

        assertThat(whenRatesFell.discountingFee()).isGreaterThan(50_000);
        assertThat(whenRatesRose.discountingFee()).isZero();
        assertThat(variableTrack.discountingFee()).isZero();
        assertThat(variableTrack.totalFee()).isEqualTo(60.0);
    }
}
