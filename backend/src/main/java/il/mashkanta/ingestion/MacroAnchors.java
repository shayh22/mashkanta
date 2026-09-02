package il.mashkanta.ingestion;

import java.time.LocalDate;

/**
 * The published economic anchors every simulation starts from.
 *
 * @param prime           Bank of Israel prime rate
 * @param cpiAnnual       trailing twelve-month CPI change published by the CBS
 * @param bondYield5y     5-year non-linked government bond yield
 * @param linkedYield5y   5-year CPI-linked government bond yield
 * @param primeUpdatedOn  date of the last monetary policy decision
 * @param cpiUpdatedOn    date of the last CPI publication
 * @param nextCpiOn       date of the next CPI publication
 * @param source          Hebrew provenance label shown in the UI
 */
public record MacroAnchors(
        double prime,
        double cpiAnnual,
        double bondYield5y,
        double linkedYield5y,
        LocalDate primeUpdatedOn,
        LocalDate cpiUpdatedOn,
        LocalDate nextCpiOn,
        String source) {

    /** The seeded anchors used until an ingestion run replaces them. */
    public static MacroAnchors seed() {
        LocalDate today = LocalDate.now();
        LocalDate lastCpi = today.getDayOfMonth() >= 15
                ? today.withDayOfMonth(15)
                : today.minusMonths(1).withDayOfMonth(15);
        return new MacroAnchors(
                0.0575,
                0.024,
                0.042,
                0.018,
                today.minusMonths(1).withDayOfMonth(1),
                lastCpi,
                lastCpi.plusMonths(1),
                "ערכי בסיס — בנק ישראל והלשכה המרכזית לסטטיסטיקה");
    }
}
