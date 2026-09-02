package il.mashkanta.ingestion;

import java.util.Optional;

/**
 * Reads the public regulatory and market feeds.
 *
 * <p>Every method returns an {@link Optional} rather than throwing: an unreachable or restructured
 * public feed must leave the platform serving its last known anchors, never failing a borrower's
 * simulation.
 */
public interface PublicDataFeed {

    /** Trailing twelve-month CPI change as a fraction, from the Central Bureau of Statistics. */
    Optional<Double> fetchCpi();

    /** Bank of Israel prime rate as a fraction. */
    Optional<Double> fetchPrime();

    /** 5-year government bond yields used to anchor the variable tracks. */
    Optional<FiveYearYields> fetchFiveYearYields();

    /**
     * @param unlinked 5-year non-linked government bond yield
     * @param linked   5-year CPI-linked government bond yield
     */
    record FiveYearYields(double unlinked, double linked) {
    }
}
