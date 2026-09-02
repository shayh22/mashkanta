package il.mashkanta.service;

import il.mashkanta.domain.TrackType;

/**
 * The observed distribution of all-in annual rates for one track in one LTV bucket.
 *
 * @param track       the track the distribution describes
 * @param tier        the LTV bucket
 * @param bestRate    10th percentile — what a well-negotiated deal looks like
 * @param medianRate  50th percentile — the Bank of Israel published average
 * @param worstRate   90th percentile — an un-negotiated first offer
 * @param sampleSize  observations behind the figures
 * @param source      provenance label shown in the UI
 */
public record MarketRate(
        TrackType track,
        LtvTier tier,
        double bestRate,
        double medianRate,
        double worstRate,
        int sampleSize,
        String source) {

    /** Linearly interpolates the distribution at an arbitrary percentile in 0..1. */
    public double atPercentile(double percentile) {
        double p = Math.min(1, Math.max(0, percentile));
        if (p <= 0.5) {
            double t = p / 0.5;
            return bestRate + (medianRate - bestRate) * t;
        }
        double t = (p - 0.5) / 0.5;
        return medianRate + (worstRate - medianRate) * t;
    }

    /** Where a quoted rate sits in the distribution, 0 being best in market and 1 the worst. */
    public double percentileOf(double rate) {
        if (rate <= bestRate) {
            return 0;
        }
        if (rate >= worstRate) {
            return 1;
        }
        if (rate <= medianRate) {
            return 0.5 * (rate - bestRate) / Math.max(1e-9, medianRate - bestRate);
        }
        return 0.5 + 0.5 * (rate - medianRate) / Math.max(1e-9, worstRate - medianRate);
    }

    MarketRate blendedWith(double observedMean, int observedCount, double weight) {
        if (observedCount <= 0 || weight <= 0) {
            return this;
        }
        double crowdWeight = weight * observedCount / (weight * observedCount + sampleSize);
        double newMedian = medianRate * (1 - crowdWeight) + observedMean * crowdWeight;
        double spreadDown = medianRate - bestRate;
        double spreadUp = worstRate - medianRate;
        return new MarketRate(track, tier, newMedian - spreadDown, newMedian, newMedian + spreadUp,
                sampleSize + observedCount, source + " + נתוני קהילה");
    }
}
