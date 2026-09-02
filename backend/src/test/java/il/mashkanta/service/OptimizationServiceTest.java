package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.BuyerSegment;
import il.mashkanta.domain.ComplianceLevel;
import il.mashkanta.domain.LiquidityEvent;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.persistence.CrowdOfferRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class OptimizationServiceTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final CrowdOfferRepository repository = Mockito.mock(CrowdOfferRepository.class);
    private final MarketBaselineService baseline = new MarketBaselineService(repository);
    private final RegulatoryValidationService regulatory = new RegulatoryValidationService();
    private final StressTestService stress = new StressTestService(engine);
    private final CustomerProfilingService profiling = new CustomerProfilingService();
    private final OptimizationService optimization =
            new OptimizationService(engine, baseline, regulatory, stress);
    private final MacroScenario scenario = MacroScenario.defaults();

    private OptimizationResult optimize(BorrowerProfile borrower) {
        return optimization.optimize(borrower, profiling.profile(borrower), scenario, 0.5);
    }

    private double share(MixProposal proposal, TrackType track) {
        return proposal.allocations().stream()
                .filter(allocation -> allocation.track() == track)
                .mapToDouble(TrackAllocation::share)
                .sum();
    }

    @Test
    @DisplayName("The recommended mix always satisfies the Bank of Israel share rules")
    void recommendationIsRegulationCompliant() {
        for (int tolerance = 1; tolerance <= 10; tolerance++) {
            OptimizationResult result = optimize(TestProfiles.firstHome(tolerance));
            MixProposal recommended = result.recommended();

            double fixed = recommended.allocations().stream()
                    .filter(allocation -> allocation.track().isFixedForRegulation())
                    .mapToDouble(TrackAllocation::share)
                    .sum();

            assertThat(share(recommended, TrackType.PRIME))
                    .as("prime share at tolerance %d", tolerance)
                    .isLessThanOrEqualTo(RegulatoryLimits.MAX_PRIME_SHARE + RegulatoryLimits.SHARE_TOLERANCE);
            assertThat(fixed)
                    .as("fixed share at tolerance %d", tolerance)
                    .isGreaterThanOrEqualTo(RegulatoryLimits.MIN_FIXED_SHARE - RegulatoryLimits.SHARE_TOLERANCE);
            assertThat(recommended.compliance().level())
                    .as("compliance at tolerance %d", tolerance)
                    .isNotEqualTo(ComplianceLevel.BLOCKING);
        }
    }

    @Test
    @DisplayName("The allocation always adds up to the requested loan")
    void allocationSumsToLoanAmount() {
        OptimizationResult result = optimize(TestProfiles.firstHome(5));

        double allocated = result.recommended().allocations().stream()
                .mapToDouble(TrackAllocation::amount)
                .sum();

        assertThat(allocated).isCloseTo(1_680_000, org.assertj.core.data.Offset.offset(1.0));
    }

    @Test
    @DisplayName("A conservative borrower is given less rate-sensitive principal than a dynamic one")
    void toleranceMovesTheMixMonotonically() {
        double conservativeVariable = variableShare(optimize(TestProfiles.firstHome(1)).recommended());
        double dynamicVariable = variableShare(optimize(TestProfiles.firstHome(10)).recommended());

        assertThat(conservativeVariable).isLessThan(dynamicVariable);
    }

    private double variableShare(MixProposal proposal) {
        return proposal.allocations().stream()
                .filter(allocation -> allocation.track().isVariableRate())
                .mapToDouble(TrackAllocation::share)
                .sum();
    }

    @Test
    @DisplayName("The three regulatory baskets are priced with their mandated compositions")
    void basketsHaveTheirMandatedShares() {
        OptimizationResult result = optimize(TestProfiles.firstHome(5));

        MixProposal basket1 = result.baskets().get(0);
        MixProposal basket2 = result.baskets().get(1);
        MixProposal basket3 = result.baskets().get(2);

        assertThat(share(basket1, TrackType.FIXED_UNLINKED)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));

        assertThat(share(basket2, TrackType.PRIME)).isCloseTo(1.0 / 3, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(share(basket2, TrackType.FIXED_LINKED)).isCloseTo(1.0 / 3, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(share(basket2, TrackType.VARIABLE_LINKED)).isCloseTo(1.0 / 3, org.assertj.core.data.Offset.offset(1e-6));

        assertThat(share(basket3, TrackType.PRIME)).isCloseTo(1.0 / 3, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(share(basket3, TrackType.FIXED_UNLINKED)).isCloseTo(2.0 / 3, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(basket3.result().totalIndexation()).isZero();
    }

    @Test
    @DisplayName("Savings are reported against every basket and are internally consistent")
    void savingsMatchTheBasketNumbers() {
        OptimizationResult result = optimize(TestProfiles.firstHome(5));

        assertThat(result.savings()).hasSize(3);
        for (OptimizationResult.SavingsComparison saving : result.savings()) {
            MixProposal basket = result.baskets().stream()
                    .filter(candidate -> candidate.id().equals(saving.againstId()))
                    .findFirst()
                    .orElseThrow();
            assertThat(saving.totalPaidSaving())
                    .isCloseTo(basket.result().totalPaid() - result.recommended().result().totalPaid(),
                            org.assertj.core.data.Offset.offset(0.01));
        }
    }

    @Test
    @DisplayName("A subsidised eligibility loan is locked into the mix at its regulated rate")
    void eligibilityPrincipalIsHonoured() {
        BorrowerProfile borrower = new BorrowerProfile(2_400_000, 1_680_000, 300, BuyerSegment.FIRST_HOME,
                32_000, 1_500, 5, 1_500, List.of(), 0.25, 0.5, 0.25, 200_000, 0.03);

        MixProposal recommended = optimize(borrower).recommended();

        Optional<TrackAllocation> eligibility = recommended.allocations().stream()
                .filter(allocation -> allocation.track() == TrackType.ELIGIBILITY)
                .findFirst();

        assertThat(eligibility).isPresent();
        assertThat(eligibility.get().amount()).isCloseTo(200_000, org.assertj.core.data.Offset.offset(1.0));
        assertThat(eligibility.get().annualRate()).isCloseTo(0.03, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    @DisplayName("A planned prepayment pushes the optimizer away from fixed principal")
    void prepaymentHorizonReducesFixedShare() {
        BorrowerProfile withoutEvent = TestProfiles.firstHome(6);
        BorrowerProfile withEvent = new BorrowerProfile(2_400_000, 1_680_000, 300, BuyerSegment.FIRST_HOME,
                32_000, 1_500, 6, 1_500,
                List.of(new LiquidityEvent(48, 300_000, "קרן השתלמות", true)),
                0.25, 0.5, 0.25, 0, 0);

        double fixedWithout = fixedShare(optimize(withoutEvent).recommended());
        double fixedWith = fixedShare(optimize(withEvent).recommended());

        assertThat(fixedWith).isLessThanOrEqualTo(fixedWithout);
    }

    private double fixedShare(MixProposal proposal) {
        return proposal.allocations().stream()
                .filter(allocation -> allocation.track().isFixedForRegulation())
                .mapToDouble(TrackAllocation::share)
                .sum();
    }

    @Test
    @DisplayName("A borrower who cannot afford any compliant mix is told which constraint was dropped")
    void infeasibleBorrowerReportsRelaxedConstraints() {
        BorrowerProfile stretched = new BorrowerProfile(2_000_000, 1_400_000, 180, BuyerSegment.FIRST_HOME,
                9_000, 500, 3, 200, List.of(), 0.25, 0.5, 0.25, 0, 0);

        OptimizationResult result = optimize(stretched);

        assertThat(result.relaxedConstraints()).isNotEmpty();
        assertThat(result.recommended().compliance().level()).isEqualTo(ComplianceLevel.BLOCKING);
    }

    @Test
    @DisplayName("The search covers the whole grid quickly enough for an interactive request")
    void optimizationIsFastEnoughToBeInteractive() {
        optimize(TestProfiles.firstHome(5));  // warm the JIT
        OptimizationResult result = optimize(TestProfiles.investor());

        assertThat(result.candidatesEvaluated()).isGreaterThan(100);
        assertThat(result.computeMillis()).isLessThan(1_000);
    }
}
