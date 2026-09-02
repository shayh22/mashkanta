package il.mashkanta.service;

/**
 * One cell of the sensitivity matrix.
 *
 * @param id                 stable key for the frontend
 * @param label              Hebrew description of the shock
 * @param ratePoints         parallel shift applied to prime and the variable anchor
 * @param cpiAnnual          the annual inflation rate assumed in this scenario
 * @param initialPayment     month-1 payment under the shock
 * @param maxPayment         highest monthly payment under the shock
 * @param maxPaymentMonth    when that peak occurs
 * @param paymentAtYear5     payment in month 60, the horizon most households actually plan to
 * @param totalPaid          nominal lifetime cash out
 * @param paymentIncrease    peak payment less the unshocked month-1 payment
 * @param totalPaidIncrease  lifetime cost above the unshocked baseline
 * @param breachesCapacity   true when the increase exceeds the borrower's stated absorption limit
 */
public record StressScenarioResult(
        String id,
        String label,
        double ratePoints,
        double cpiAnnual,
        double initialPayment,
        double maxPayment,
        int maxPaymentMonth,
        double paymentAtYear5,
        double totalPaid,
        double paymentIncrease,
        double totalPaidIncrease,
        boolean breachesCapacity) {
}
