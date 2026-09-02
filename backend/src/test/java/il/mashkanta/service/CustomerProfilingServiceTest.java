package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.BuyerSegment;
import il.mashkanta.domain.LiquidityEvent;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CustomerProfilingServiceTest {

    private final CustomerProfilingService profiling = new CustomerProfilingService();

    @Test
    @DisplayName("Tolerance maps monotonically onto the optimizer's weights and caps")
    void toleranceMapsMonotonically() {
        RiskProfile conservative = profiling.profile(TestProfiles.firstHome(1));
        RiskProfile balanced = profiling.profile(TestProfiles.firstHome(5));
        RiskProfile dynamic = profiling.profile(TestProfiles.firstHome(10));

        assertThat(conservative.costWeight()).isLessThan(balanced.costWeight());
        assertThat(balanced.costWeight()).isLessThan(dynamic.costWeight());
        assertThat(conservative.cpiAversion()).isGreaterThan(dynamic.cpiAversion());
        assertThat(conservative.maxVariableShare()).isLessThan(dynamic.maxVariableShare());
        assertThat(dynamic.maxVariableShare()).isLessThanOrEqualTo(RegulatoryLimits.MAX_VARIABLE_SHARE);
    }

    @Test
    @DisplayName("A household with no budget headroom is capped regardless of what it says it tolerates")
    void affordabilityOverridesStatedTolerance() {
        BorrowerProfile stretched = new BorrowerProfile(2_000_000, 1_400_000, 300, BuyerSegment.FIRST_HOME,
                12_000, 3_600, 10, 0, List.of(), 0.3, 0.4, 0.3, 0, 0);

        RiskProfile risk = profiling.profile(stretched);

        assertThat(stretched.comfortablePayment()).isZero();
        assertThat(risk.maxVariableShare()).isLessThanOrEqualTo(0.25);
        assertThat(risk.maxPrimeShare()).isLessThanOrEqualTo(0.25);
    }

    @Test
    @DisplayName("The earliest earmarked lump sum becomes the prepayment horizon")
    void prepaymentHorizonIsTheEarliestEarmarkedEvent() {
        BorrowerProfile borrower = new BorrowerProfile(2_400_000, 1_680_000, 300, BuyerSegment.FIRST_HOME,
                32_000, 1_500, 5, 1_500,
                List.of(new LiquidityEvent(96, 500_000, "ירושה", true),
                        new LiquidityEvent(60, 200_000, "קרן השתלמות", true),
                        new LiquidityEvent(24, 50_000, "בונוס", false)),
                0.25, 0.5, 0.25, 0, 0);

        RiskProfile risk = profiling.profile(borrower);

        assertThat(risk.prepaymentHorizon()).isEqualTo(60);
        assertThat(risk.expectsEarlyRepayment()).isTrue();
        assertThat(risk.narrative()).contains("פירעון חלקי");
    }

    @Test
    @DisplayName("An unstated volatility capacity is inferred from disposable income")
    void capacityIsInferredWhenNotStated() {
        BorrowerProfile silent = new BorrowerProfile(2_400_000, 1_600_000, 300, BuyerSegment.FIRST_HOME,
                30_000, 2_000, 5, 0, List.of(), 0.25, 0.5, 0.25, 0, 0);

        assertThat(profiling.profile(silent).volatilityCapacity()).isCloseTo(1_400,
                org.assertj.core.data.Offset.offset(0.01));
    }
}
