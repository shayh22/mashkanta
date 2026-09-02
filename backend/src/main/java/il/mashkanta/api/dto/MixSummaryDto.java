package il.mashkanta.api.dto;

import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.MortgageMath;
import il.mashkanta.service.TrackAllocation;
import java.util.ArrayList;
import java.util.List;

/**
 * The headline numbers of a priced mix, rounded for display.
 *
 * @param totalPrincipal      borrowed principal
 * @param termMonths          longest track term
 * @param initialPayment      month-1 payment
 * @param maxPayment          peak monthly payment on the baseline path
 * @param maxPaymentMonth     when the peak occurs
 * @param totalPaid           lifetime nominal cash out
 * @param totalInterest       interest component
 * @param totalIndexation     CPI uplift component
 * @param totalCost           everything paid above the principal
 * @param nominalIrr          effective annual cost (ריבית כוללת מתואמת)
 * @param realIrr             the same net of inflation
 * @param weightedInitialRate principal-weighted month-1 rate
 * @param allocations         per-track breakdown
 * @param yearly              yearly roll-up powering the amortization chart
 */
public record MixSummaryDto(
        double totalPrincipal,
        int termMonths,
        double initialPayment,
        double maxPayment,
        int maxPaymentMonth,
        double totalPaid,
        double totalInterest,
        double totalIndexation,
        double totalCost,
        double nominalIrr,
        double realIrr,
        double weightedInitialRate,
        List<TrackAllocationDto> allocations,
        List<YearPointDto> yearly) {

    public static MixSummaryDto from(MixResult result, List<TrackAllocation> allocations) {
        List<TrackAllocationDto> tracks = new ArrayList<>();
        for (TrackAllocation allocation : allocations) {
            tracks.add(TrackAllocationDto.from(allocation));
        }
        List<YearPointDto> yearly = new ArrayList<>();
        for (MixResult.YearPoint point : result.yearlySummary()) {
            yearly.add(YearPointDto.from(point));
        }
        return new MixSummaryDto(
                MortgageMath.round2(result.totalPrincipal()),
                result.termMonths(),
                MortgageMath.round2(result.initialPayment()),
                MortgageMath.round2(result.maxPayment()),
                result.maxPaymentMonth(),
                MortgageMath.round2(result.totalPaid()),
                MortgageMath.round2(result.totalInterest()),
                MortgageMath.round2(result.totalIndexation()),
                MortgageMath.round2(result.totalPaid() - result.totalPrincipal()),
                MortgageMath.roundRate(result.nominalIrr()),
                MortgageMath.roundRate(result.realIrr()),
                MortgageMath.roundRate(result.weightedInitialRate()),
                List.copyOf(tracks),
                List.copyOf(yearly));
    }
}
