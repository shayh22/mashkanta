package il.mashkanta.service;

/**
 * The Loan-to-Value buckets the Bank of Israel publishes its average rate table by
 * (קו המשווה). Pricing steps at the bucket boundaries, not continuously.
 */
public enum LtvTier {

    UP_TO_45,
    FROM_45_TO_60,
    ABOVE_60;

    /** Buckets are inclusive of their upper bound, matching how the rate table is published. */
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
