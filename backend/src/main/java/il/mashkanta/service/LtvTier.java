package il.mashkanta.service;

/**
 * The Loan-to-Value buckets the Bank of Israel publishes its average rate table by
 * (קו המשווה). Pricing steps at the bucket boundaries, not continuously.
 */
public enum LtvTier {

    UP_TO_45("עד 45%", 0.0, 0.45),
    FROM_45_TO_60("45%–60%", 0.45, 0.60),
    ABOVE_60("מעל 60%", 0.60, 1.0);

    private final String hebrewLabel;
    private final double lowerBound;
    private final double upperBound;

    LtvTier(String hebrewLabel, double lowerBound, double upperBound) {
        this.hebrewLabel = hebrewLabel;
        this.lowerBound = lowerBound;
        this.upperBound = upperBound;
    }

    public String hebrewLabel() {
        return hebrewLabel;
    }

    public double lowerBound() {
        return lowerBound;
    }

    public double upperBound() {
        return upperBound;
    }

    public static LtvTier of(double ltv) {
        if (ltv <= 0.45) {
            return UP_TO_45;
        }
        if (ltv <= 0.60) {
            return FROM_45_TO_60;
        }
        return ABOVE_60;
    }
}
