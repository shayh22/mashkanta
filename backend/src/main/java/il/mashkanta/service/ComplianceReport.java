package il.mashkanta.service;

import il.mashkanta.domain.ComplianceLevel;
import java.util.List;

/**
 * The full regulatory verdict on a proposal.
 *
 * @param ltv          loan-to-value as a fraction
 * @param maxLtv       the ceiling for the borrower's segment
 * @param pti          payment-to-income on the month-1 payment
 * @param stressedPti  payment-to-income at the worst stressed payment
 * @param dti          total obligations including existing debt, over net income
 * @param level        the most severe level across all findings
 * @param findings     every check that ran, in display order
 */
public record ComplianceReport(
        double ltv,
        double maxLtv,
        double pti,
        double stressedPti,
        double dti,
        ComplianceLevel level,
        List<ComplianceFinding> findings) {

    /** True when nothing blocks underwriting; warnings are still permitted. */
    public boolean isUnderwritable() {
        return level != ComplianceLevel.BLOCKING;
    }
}
