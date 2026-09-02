package il.mashkanta.api.dto;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MortgageMath;
import il.mashkanta.service.TrackAllocation;

/**
 * One row of the mix table, rounded for display.
 *
 * @param track           track identifier
 * @param hebrewName      display name
 * @param amount          principal
 * @param share           fraction of the loan
 * @param annualRate      rate at origination
 * @param termMonths      term
 * @param method          repayment table
 * @param initialPayment  month-1 payment for this track
 * @param maxPayment      peak monthly payment for this track
 * @param totalPaid       lifetime cash out for this track
 * @param totalInterest   interest component
 * @param totalIndexation CPI uplift component
 */
public record TrackAllocationDto(
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

    static TrackAllocationDto from(TrackAllocation allocation) {
        return new TrackAllocationDto(
                allocation.track(),
                allocation.hebrewName(),
                MortgageMath.round2(allocation.amount()),
                MortgageMath.roundRate(allocation.share()),
                MortgageMath.roundRate(allocation.annualRate()),
                allocation.termMonths(),
                allocation.method(),
                MortgageMath.round2(allocation.initialPayment()),
                MortgageMath.round2(allocation.maxPayment()),
                MortgageMath.round2(allocation.totalPaid()),
                MortgageMath.round2(allocation.totalInterest()),
                MortgageMath.round2(allocation.totalIndexation()));
    }
}
