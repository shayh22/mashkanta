package il.mashkanta.engine;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;
import java.util.List;

/**
 * The priced outcome of a single track under one macro scenario.
 *
 * @param type            the track
 * @param method          repayment table used
 * @param amount          original principal
 * @param termMonths      term
 * @param initialRate     annual rate in month 1
 * @param initialPayment  first monthly payment
 * @param maxPayment      highest monthly payment over the life of the loan
 * @param finalPayment    last monthly payment (the balloon, when relevant)
 * @param totalPaid       sum of every payment, in nominal shekels
 * @param totalInterest   interest component of {@code totalPaid}
 * @param totalIndexation CPI uplift added to principal over the life of the loan
 * @param nominalIrr      effective annual cost including indexation (ריבית כוללת מתואמת)
 * @param realIrr         the same figure with inflation stripped out
 * @param schedule        full month-by-month table, empty unless the caller asked for it
 */
public record TrackResult(
        TrackType type,
        AmortizationMethod method,
        double amount,
        int termMonths,
        double initialRate,
        double initialPayment,
        double maxPayment,
        double finalPayment,
        double totalPaid,
        double totalInterest,
        double totalIndexation,
        double nominalIrr,
        double realIrr,
        List<ScheduleRow> schedule) {
}
