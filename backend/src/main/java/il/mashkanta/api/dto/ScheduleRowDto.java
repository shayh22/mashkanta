package il.mashkanta.api.dto;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MortgageMath;
import il.mashkanta.engine.ScheduleRow;

/**
 * One month of one track's amortization table.
 *
 * @param track          which track the row belongs to
 * @param month          1-based month
 * @param openingBalance balance before indexation and payment
 * @param indexation     CPI uplift added this month
 * @param interest       interest accrued
 * @param principal      principal repaid
 * @param payment        cash paid
 * @param closingBalance balance carried forward
 * @param annualRate     rate applied this month
 */
public record ScheduleRowDto(
        TrackType track,
        int month,
        double openingBalance,
        double indexation,
        double interest,
        double principal,
        double payment,
        double closingBalance,
        double annualRate) {

    public static ScheduleRowDto from(TrackType track, ScheduleRow row) {
        return new ScheduleRowDto(
                track,
                row.month(),
                MortgageMath.round2(row.openingBalance()),
                MortgageMath.round2(row.indexation()),
                MortgageMath.round2(row.interest()),
                MortgageMath.round2(row.principal()),
                MortgageMath.round2(row.payment()),
                MortgageMath.round2(row.closingBalance()),
                MortgageMath.roundRate(row.annualRate()));
    }
}
