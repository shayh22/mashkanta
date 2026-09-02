package il.mashkanta.service;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.TrackResult;

/**
 * One row of a proposed mix, in the shape the comparison table renders.
 *
 * @param track          the track
 * @param hebrewName     display name
 * @param amount         principal allocated
 * @param share          fraction of the total loan
 * @param annualRate     all-in rate at origination
 * @param termMonths     term
 * @param method         repayment table
 * @param initialPayment month-1 payment for this component
 * @param maxPayment     highest monthly payment for this component under the baseline path
 * @param totalPaid      nominal lifetime cash out for this component
 * @param totalInterest  interest component
 * @param totalIndexation CPI uplift component
 */
public record TrackAllocation(
        TrackType track,
        String hebrewName,
        double amount,
        double share,
        double annualRate,
        int termMonths,
        AmortizationMethod method,
        double initialPayment,
        double maxPayment,
        double totalPaid,
        double totalInterest,
        double totalIndexation) {

    static TrackAllocation from(TrackResult result, double totalPrincipal) {
        return new TrackAllocation(
                result.type(),
                result.type().hebrewName(),
                result.amount(),
                totalPrincipal > 0 ? result.amount() / totalPrincipal : 0,
                result.initialRate(),
                result.termMonths(),
                result.method(),
                result.initialPayment(),
                result.maxPayment(),
                result.totalPaid(),
                result.totalInterest(),
                result.totalIndexation());
    }
}
