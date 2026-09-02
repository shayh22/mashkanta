package il.mashkanta.api.dto;

import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.MortgageMath;

/**
 * One year of the amortization chart.
 *
 * @param year                  1-based year index
 * @param remainingBalance      principal still owed at year end
 * @param averageMonthlyPayment mean payment across the year
 * @param interestPaid          interest paid during the year
 * @param indexationAccrued     CPI uplift added during the year
 * @param cumulativeInterest    interest paid to date
 * @param cumulativeIndexation  indexation accrued to date
 * @param cumulativePaid        total paid to date
 */
public record YearPointDto(
        int year,
        double remainingBalance,
        double averageMonthlyPayment,
        double interestPaid,
        double indexationAccrued,
        double cumulativeInterest,
        double cumulativeIndexation,
        double cumulativePaid) {

    static YearPointDto from(MixResult.YearPoint point) {
        return new YearPointDto(
                point.year(),
                MortgageMath.round2(point.remainingBalance()),
                MortgageMath.round2(point.averageMonthlyPayment()),
                MortgageMath.round2(point.interestPaid()),
                MortgageMath.round2(point.indexationAccrued()),
                MortgageMath.round2(point.cumulativeInterest()),
                MortgageMath.round2(point.cumulativeIndexation()),
                MortgageMath.round2(point.cumulativePaid()));
    }
}
