package il.mashkanta.service;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Answers the question the whole platform exists for: is this offer any good, and what is the gap
 * to a well-negotiated one worth in shekels?
 *
 * <p>The gap is priced, not asserted: the borrower's own mix is re-run at best-in-market rates and
 * the lifetime difference is the number reported.
 */
@Service
public class OpportunityScoringService {

    /** The percentile that counts as "best in market" — the top decile of observed deals. */
    private static final double BEST_IN_MARKET_PERCENTILE = 0.10;

    private final MarketBaselineService baseline;
    private final AmortizationEngine engine;

    public OpportunityScoringService(MarketBaselineService baseline, AmortizationEngine engine) {
        this.baseline = baseline;
        this.engine = engine;
    }

    /**
     * Scores an offer the borrower actually received.
     *
     * @param offered  the tracks as quoted by the bank
     * @param ltv      loan-to-value, which decides the comparison bucket
     * @param scenario macro path used for pricing
     */
    public OpportunityReport score(List<TrackSpec> offered, double ltv, MacroScenario scenario) {
        MixResult asOffered = engine.priceMix(offered, scenario);

        List<TrackOpportunity> perTrack = new ArrayList<>();
        List<TrackSpec> improved = new ArrayList<>();
        double weightedPercentile = 0;

        for (TrackSpec spec : offered) {
            if (spec.amount() <= 0) {
                continue;
            }
            TrackType track = spec.type();
            MarketRate market = baseline.rateFor(track, ltv, spec.termMonths());
            double offeredRate = spec.initialRate(scenario);
            double bestRate = market.atPercentile(BEST_IN_MARKET_PERCENTILE);
            double percentile = market.percentileOf(offeredRate);

            weightedPercentile += percentile * spec.amount();
            perTrack.add(new TrackOpportunity(track, track.hebrewName(), spec.amount(), offeredRate,
                    market.medianRate(), bestRate, percentile, offeredRate - market.medianRate()));

            double targetRate = Math.min(offeredRate, bestRate);
            improved.add(TrackSpec.ofRate(track, spec.amount(), spec.termMonths(), targetRate, scenario,
                    spec.method(), spec.graceMonths()));
        }

        MixResult atBest = engine.priceMix(improved, scenario);
        double principal = asOffered.totalPrincipal();
        weightedPercentile = principal > 0 ? weightedPercentile / principal : 0;

        // A score of 100 means the offer already sits at the top decile of the market.
        int score = (int) Math.round(Math.max(0, Math.min(100, 100 * (1 - weightedPercentile))));

        return new OpportunityReport(
                score,
                grade(score),
                weightedPercentile,
                asOffered.weightedInitialRate(),
                atBest.weightedInitialRate(),
                asOffered.totalPaid(),
                atBest.totalPaid(),
                asOffered.totalPaid() - atBest.totalPaid(),
                asOffered.initialPayment() - atBest.initialPayment(),
                List.copyOf(perTrack),
                narrative(score, asOffered.totalPaid() - atBest.totalPaid()));
    }

    private String grade(int score) {
        if (score >= 85) {
            return "מצוין";
        }
        if (score >= 70) {
            return "טוב";
        }
        if (score >= 50) {
            return "ממוצע";
        }
        if (score >= 30) {
            return "מתחת לממוצע";
        }
        return "יקר";
    }

    private String narrative(int score, double saving) {
        if (saving < 1000) {
            return "ההצעה שקיבלת כבר קרובה מאוד לטובות ביותר בשוק. אין כמעט מקום למשא ומתן נוסף.";
        }
        return String.format(
                "ההצעה מדורגת %d מתוך 100 מול השוק. סגירה בריביות של העשירון העליון תחסוך כ-%,.0f ₪ לאורך חיי ההלוואה.",
                score, saving);
    }

    /**
     * How one quoted track compares to the market.
     *
     * @param track       the track
     * @param hebrewName  display name
     * @param amount      principal in that track
     * @param offeredRate the rate quoted
     * @param medianRate  market median for the borrower's bucket
     * @param bestRate    top-decile rate
     * @param percentile  where the quote sits, 0 being best in market
     * @param gapToMedian offered less median; positive means worse than average
     */
    public record TrackOpportunity(
            TrackType track,
            String hebrewName,
            double amount,
            double offeredRate,
            double medianRate,
            double bestRate,
            double percentile,
            double gapToMedian) {
    }

    /**
     * The verdict on an offer.
     *
     * @param score                0..100, higher is better
     * @param grade                Hebrew label for the score
     * @param marketPercentile     principal-weighted position in the market distribution
     * @param offeredWeightedRate  the blended rate as offered
     * @param bestWeightedRate     the blended rate at top-decile pricing
     * @param totalPaidAsOffered   lifetime cost as offered
     * @param totalPaidAtBest      lifetime cost at top-decile pricing
     * @param potentialSaving      the difference — the prize for negotiating
     * @param monthlySaving        month-1 payment difference
     * @param tracks               per-track detail
     * @param narrative            Hebrew summary
     */
    public record OpportunityReport(
            int score,
            String grade,
            double marketPercentile,
            double offeredWeightedRate,
            double bestWeightedRate,
            double totalPaidAsOffered,
            double totalPaidAtBest,
            double potentialSaving,
            double monthlySaving,
            List<TrackOpportunity> tracks,
            String narrative) {
    }
}
