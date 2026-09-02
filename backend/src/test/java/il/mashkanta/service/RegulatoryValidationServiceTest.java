package il.mashkanta.service;

import static org.assertj.core.api.Assertions.assertThat;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.BuyerSegment;
import il.mashkanta.domain.ComplianceLevel;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RegulatoryValidationServiceTest {

    private final AmortizationEngine engine = new AmortizationEngine();
    private final RegulatoryValidationService validator = new RegulatoryValidationService();
    private final MacroScenario scenario = MacroScenario.defaults();

    private MixResult mix(List<TrackSpec> specs) {
        return engine.priceMix(specs, scenario);
    }

    private ComplianceFinding finding(ComplianceReport report, String code) {
        return report.findings().stream()
                .filter(f -> f.code().equals(code))
                .findFirst()
                .orElseThrow();
    }

    @Test
    @DisplayName("An investor above the 50% ceiling is blocked")
    void investorLtvCeilingBlocks() {
        BorrowerProfile borrower = new BorrowerProfile(2_000_000, 1_400_000, 240, BuyerSegment.INVESTOR,
                60_000, 0, 5, 2_000, List.of(), 0.3, 0.5, 0.2, 0, 0);
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_400_000, 240, 0.05, scenario)));

        ComplianceReport report = validator.validate(borrower, result, result.maxPayment());

        assertThat(finding(report, "LTV").level()).isEqualTo(ComplianceLevel.BLOCKING);
        assertThat(report.isUnderwritable()).isFalse();
        assertThat(report.ltv()).isEqualTo(0.70);
    }

    @Test
    @DisplayName("Payment-to-income above 40% is blocked, and 30-40% only warns")
    void paymentToIncomeZones() {
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 1_500_000, 240, 0.05, scenario)));
        double payment = result.initialPayment();

        BorrowerProfile stretched = new BorrowerProfile(3_000_000, 1_500_000, 240, BuyerSegment.FIRST_HOME,
                payment / 0.45, 0, 5, 1_000, List.of(), 0.3, 0.5, 0.2, 0, 0);
        BorrowerProfile warned = new BorrowerProfile(3_000_000, 1_500_000, 240, BuyerSegment.FIRST_HOME,
                payment / 0.35, 0, 5, 1_000, List.of(), 0.3, 0.5, 0.2, 0, 0);

        assertThat(finding(validator.validate(stretched, result, payment), "DTI").level())
                .isEqualTo(ComplianceLevel.BLOCKING);
        assertThat(finding(validator.validate(warned, result, payment), "DTI").level())
                .isEqualTo(ComplianceLevel.WARNING);
    }

    @Test
    @DisplayName("Existing obligations count towards the debt-to-income ceiling")
    void existingObligationsCountTowardsDti() {
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 800_000, 240, 0.05, scenario)));
        double payment = result.initialPayment();

        BorrowerProfile withDebt = new BorrowerProfile(2_000_000, 800_000, 240, BuyerSegment.FIRST_HOME,
                payment / 0.25, payment * 0.8, 5, 1_000, List.of(), 0.3, 0.5, 0.2, 0, 0);

        ComplianceReport report = validator.validate(withDebt, result, payment);

        assertThat(report.pti()).isLessThan(RegulatoryLimits.PTI_WARNING);
        assertThat(report.dti()).isGreaterThan(RegulatoryLimits.PTI_CEILING);
        assertThat(finding(report, "DTI").level()).isEqualTo(ComplianceLevel.BLOCKING);
    }

    @Test
    @DisplayName("More than two thirds prime is blocked")
    void primeShareCeilingBlocks() {
        BorrowerProfile borrower = TestProfiles.firstHome(7);
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.PRIME, 1_400_000, 300, 0.0525, scenario),
                TrackSpec.ofRate(TrackType.FIXED_UNLINKED, 280_000, 300, 0.0532, scenario)));

        ComplianceReport report = validator.validate(borrower, result, result.maxPayment());

        assertThat(finding(report, "PRIME_SHARE").level()).isEqualTo(ComplianceLevel.BLOCKING);
    }

    @Test
    @DisplayName("Less than a third fixed is blocked")
    void fixedFloorBlocks() {
        BorrowerProfile borrower = TestProfiles.firstHome(9);
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.PRIME, 840_000, 300, 0.0525, scenario),
                TrackSpec.ofRate(TrackType.VARIABLE_LINKED, 840_000, 300, 0.0284, scenario)));

        ComplianceReport report = validator.validate(borrower, result, result.maxPayment());

        assertThat(finding(report, "FIXED_FLOOR").level()).isEqualTo(ComplianceLevel.BLOCKING);
    }

    @Test
    @DisplayName("An exact thirds mix passes every share test")
    void classicThirdsMixIsCompliant() {
        BorrowerProfile borrower = TestProfiles.firstHome(5);
        double third = 1_680_000 / 3.0;
        MixResult result = mix(List.of(
                TrackSpec.ofRate(TrackType.PRIME, third, 300, 0.0525, scenario),
                TrackSpec.ofRate(TrackType.FIXED_LINKED, third, 300, 0.0315, scenario),
                TrackSpec.ofRate(TrackType.VARIABLE_LINKED, third, 300, 0.0265, scenario)));

        ComplianceReport report = validator.validate(borrower, result, result.maxPayment());

        assertThat(finding(report, "PRIME_SHARE").level()).isEqualTo(ComplianceLevel.OK);
        assertThat(finding(report, "FIXED_FLOOR").level()).isEqualTo(ComplianceLevel.OK);
        assertThat(finding(report, "VARIABLE_SHARE").level()).isEqualTo(ComplianceLevel.OK);
    }
}
