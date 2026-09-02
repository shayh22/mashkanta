package il.mashkanta.engine;

/**
 * A single month of an amortization table.
 *
 * @param month           1-based month index
 * @param openingBalance  balance before indexation and before the payment
 * @param indexation      CPI uplift added to the balance this month (0 for non-linked tracks)
 * @param interest        interest accrued this month
 * @param principal       principal repaid this month
 * @param payment         cash actually paid this month
 * @param closingBalance  balance carried into the next month
 * @param annualRate      the nominal annual rate applied this month
 */
public record ScheduleRow(
        int month,
        double openingBalance,
        double indexation,
        double interest,
        double principal,
        double payment,
        double closingBalance,
        double annualRate) {
}
