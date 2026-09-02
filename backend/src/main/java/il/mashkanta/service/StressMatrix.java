package il.mashkanta.service;

import java.util.List;

/**
 * The full sensitivity matrix for one mix.
 *
 * @param scenarios      every shock that was run, in display order
 * @param worstCase      the scenario producing the highest peak payment
 * @param worstIncrease  that peak less the unshocked month-1 payment
 * @param anyBreach      true when at least one scenario exceeds the borrower's absorption capacity
 */
public record StressMatrix(
        List<StressScenarioResult> scenarios,
        StressScenarioResult worstCase,
        double worstIncrease,
        boolean anyBreach) {

    /** The peak monthly payment across every scenario — the figure the DTI stress test uses. */
    public double worstPayment() {
        return worstCase == null ? 0 : worstCase.maxPayment();
    }
}
