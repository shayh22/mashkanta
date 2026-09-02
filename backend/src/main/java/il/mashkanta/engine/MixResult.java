package il.mashkanta.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * The aggregate view of a multi-track mix: the household's actual monthly cash flow.
 *
 * @param tracks          per-track detail
 * @param totalPrincipal  sum of the track principals
 * @param termMonths      the longest track term — how long the household carries a payment
 * @param combinedPayments monthly total payment, index 0 being month 1
 * @param initialPayment  month-1 total payment
 * @param maxPayment      highest total monthly payment
 * @param maxPaymentMonth the month in which {@code maxPayment} occurs
 * @param totalPaid       nominal shekels paid over the life of the mix
 * @param totalInterest   interest component
 * @param totalIndexation CPI uplift component
 * @param nominalIrr      effective annual all-in cost
 * @param realIrr         effective annual all-in cost net of inflation
 * @param weightedInitialRate principal-weighted month-1 rate
 */
public record MixResult(
        List<TrackResult> tracks,
        double totalPrincipal,
        int termMonths,
        double[] combinedPayments,
        double initialPayment,
        double maxPayment,
        int maxPaymentMonth,
        double totalPaid,
        double totalInterest,
        double totalIndexation,
        double nominalIrr,
        double realIrr,
        double weightedInitialRate) {

    static MixResult combine(List<TrackResult> tracks, double principal, int horizon, MacroScenario scenario) {
        double[] combined = new double[horizon];
        double totalPaid = 0;
        double totalInterest = 0;
        double totalIndexation = 0;
        double weightedRate = 0;

        for (TrackResult track : tracks) {
            for (ScheduleRow row : track.schedule()) {
                combined[row.month() - 1] += row.payment();
            }
            totalPaid += track.totalPaid();
            totalInterest += track.totalInterest();
            totalIndexation += track.totalIndexation();
            weightedRate += track.initialRate() * track.amount();
        }
        weightedRate = principal > 0 ? weightedRate / principal : 0;

        double max = 0;
        int maxMonth = 1;
        for (int i = 0; i < combined.length; i++) {
            if (combined[i] > max) {
                max = combined[i];
                maxMonth = i + 1;
            }
        }

        double nominalIrr = MortgageMath.irr(principal, combined);
        double[] real = new double[combined.length];
        double deflator = 1;
        for (int i = 0; i < combined.length; i++) {
            deflator *= 1 + scenario.monthlyInflationAt(i + 1);
            real[i] = combined[i] / deflator;
        }
        double realIrr = MortgageMath.irr(principal, real);

        return new MixResult(List.copyOf(tracks), principal, horizon, combined,
                combined.length > 0 ? combined[0] : 0, max, maxMonth,
                totalPaid, totalInterest, totalIndexation, nominalIrr, realIrr, weightedRate);
    }

    /** Total payment in the given 1-based month, or zero once the mix is fully repaid. */
    public double paymentAt(int month) {
        if (month < 1 || month > combinedPayments.length) {
            return 0;
        }
        return combinedPayments[month - 1];
    }

    /** Share of principal sitting in tracks matching the predicate — used for regulatory checks. */
    public double shareOf(java.util.function.Predicate<TrackResult> predicate) {
        if (totalPrincipal <= 0) {
            return 0;
        }
        double sum = 0;
        for (TrackResult track : tracks) {
            if (predicate.test(track)) {
                sum += track.amount();
            }
        }
        return sum / totalPrincipal;
    }

    /** Yearly roll-up of the combined cash flow, which is what the amortization chart plots. */
    public List<YearPoint> yearlySummary() {
        List<YearPoint> points = new ArrayList<>();
        int years = (int) Math.ceil(termMonths / 12.0);
        double cumulativeInterest = 0;
        double cumulativeIndexation = 0;
        double cumulativePaid = 0;

        for (int year = 1; year <= years; year++) {
            int from = (year - 1) * 12 + 1;
            int to = Math.min(year * 12, termMonths);
            double interest = 0;
            double indexation = 0;
            double paid = 0;
            double balance = 0;
            for (TrackResult track : tracks) {
                for (ScheduleRow row : track.schedule()) {
                    if (row.month() >= from && row.month() <= to) {
                        interest += row.interest();
                        indexation += row.indexation();
                        paid += row.payment();
                    }
                    if (row.month() == Math.min(to, track.termMonths())) {
                        balance += row.closingBalance();
                    }
                }
            }
            cumulativeInterest += interest;
            cumulativeIndexation += indexation;
            cumulativePaid += paid;
            double averagePayment = to >= from ? paid / (to - from + 1) : 0;
            points.add(new YearPoint(year, balance, averagePayment, interest, indexation,
                    cumulativeInterest, cumulativeIndexation, cumulativePaid));
        }
        return points;
    }

    /** One year of the amortization chart. */
    public record YearPoint(
            int year,
            double remainingBalance,
            double averageMonthlyPayment,
            double interestPaid,
            double indexationAccrued,
            double cumulativeInterest,
            double cumulativeIndexation,
            double cumulativePaid) {
    }
}
