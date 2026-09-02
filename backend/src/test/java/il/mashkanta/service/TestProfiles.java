package il.mashkanta.service;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.BuyerSegment;
import java.util.List;

/** Borrower fixtures shared across the service tests. */
final class TestProfiles {

    private TestProfiles() {
    }

    /** A typical first-home buyer: ₪2.4m property, 70% LTV, comfortable income. */
    static BorrowerProfile firstHome(int riskTolerance) {
        return new BorrowerProfile(2_400_000, 1_680_000, 300, BuyerSegment.FIRST_HOME,
                32_000, 1_500, riskTolerance, 1_500, List.of(), 0.25, 0.5, 0.25, 0, 0);
    }

    /** An investor at the 50% ceiling. */
    static BorrowerProfile investor() {
        return new BorrowerProfile(3_000_000, 1_500_000, 240, BuyerSegment.INVESTOR,
                45_000, 4_000, 8, 3_000, List.of(), 0.4, 0.4, 0.2, 0, 0);
    }
}
