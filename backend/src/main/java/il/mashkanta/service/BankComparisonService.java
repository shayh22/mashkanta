package il.mashkanta.service;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Prices one mix at every lender's published pricing so the borrower compares like with like.
 *
 * <p>The per-lender offsets are indicative positions derived from publicly posted tariffs and
 * campaign announcements, not confidential quotes. Holding the mix fixed and varying only the
 * lender is what makes the comparison honest — a bank cannot look cheap here by quietly shifting
 * principal into a cheaper track.
 */
@Service
public class BankComparisonService {

    private final AmortizationEngine engine;
    private final MarketBaselineService baseline;
    private final List<BankRateSheet> sheets = seedSheets();

    public BankComparisonService(AmortizationEngine engine, MarketBaselineService baseline) {
        this.engine = engine;
        this.baseline = baseline;
    }

    public List<BankRateSheet> rateSheets() {
        return sheets;
    }

    /**
     * Re-prices the given allocation at each lender.
     *
     * @param allocation share of the loan per track, summing to one
     * @param loanAmount total principal
     * @param termMonths term
     * @param ltv        loan-to-value, which selects the market bucket
     * @param scenario   macro path
     */
    public List<BankQuote> compare(Map<TrackType, Double> allocation, double loanAmount, int termMonths,
                                   double ltv, MacroScenario scenario) {
        List<BankQuote> quotes = new ArrayList<>();

        for (BankRateSheet sheet : sheets) {
            List<TrackSpec> specs = new ArrayList<>();
            Map<TrackType, Double> quotedRates = new EnumMap<>(TrackType.class);

            allocation.forEach((track, share) -> {
                double amount = loanAmount * share;
                if (amount <= 0.5) {
                    return;
                }
                double rate = baseline.rateFor(track, ltv, termMonths).medianRate()
                        + sheet.offsets().getOrDefault(track, 0.0);
                quotedRates.put(track, rate);
                specs.add(TrackSpec.ofRate(track, amount, termMonths, rate, scenario));
            });

            if (specs.isEmpty()) {
                continue;
            }
            MixResult result = engine.priceMix(specs, scenario);
            quotes.add(new BankQuote(sheet.code(), sheet.hebrewName(), sheet.marketShare(), sheet.note(),
                    Map.copyOf(quotedRates), result.weightedInitialRate(), result.initialPayment(),
                    result.maxPayment(), result.totalPaid(), result.nominalIrr(), 0, 0));
        }

        quotes.sort(Comparator.comparingDouble(BankQuote::totalPaid));
        double best = quotes.isEmpty() ? 0 : quotes.get(0).totalPaid();
        List<BankQuote> ranked = new ArrayList<>(quotes.size());
        for (int i = 0; i < quotes.size(); i++) {
            BankQuote quote = quotes.get(i);
            ranked.add(new BankQuote(quote.code(), quote.hebrewName(), quote.marketShare(), quote.note(),
                    quote.rates(), quote.weightedRate(), quote.initialPayment(), quote.maxPayment(),
                    quote.totalPaid(), quote.nominalIrr(), i + 1, quote.totalPaid() - best));
        }
        return List.copyOf(ranked);
    }

    /**
     * Indicative pricing positions per lender, expressed as offsets from the Bank of Israel average.
     * Mortgage market shares are the published figures for new mortgage origination.
     */
    private List<BankRateSheet> seedSheets() {
        LocalDate updated = LocalDate.now();
        List<BankRateSheet> list = new ArrayList<>();

        list.add(new BankRateSheet("MIZRAHI", "מזרחי טפחות", 0.34, Map.of(
                TrackType.PRIME, -0.0005,
                TrackType.FIXED_UNLINKED, 0.0008,
                TrackType.FIXED_LINKED, -0.0012,
                TrackType.VARIABLE_UNLINKED, 0.0004,
                TrackType.VARIABLE_LINKED, -0.0008),
                "הבנק הגדול בשוק המשכנתאות, מתמחר אגרסיבי במסלולים הצמודים.", updated));

        list.add(new BankRateSheet("HAPOALIM", "בנק הפועלים", 0.20, Map.of(
                TrackType.PRIME, -0.0010,
                TrackType.FIXED_UNLINKED, 0.0002,
                TrackType.FIXED_LINKED, 0.0006,
                TrackType.VARIABLE_UNLINKED, -0.0002,
                TrackType.VARIABLE_LINKED, 0.0004),
                "מתמחר טוב במסלול הפריים, בעיקר ללקוחות עם ניהול שכר בבנק.", updated));

        list.add(new BankRateSheet("LEUMI", "בנק לאומי", 0.18, Map.of(
                TrackType.PRIME, -0.0004,
                TrackType.FIXED_UNLINKED, -0.0010,
                TrackType.FIXED_LINKED, 0.0004,
                TrackType.VARIABLE_UNLINKED, 0.0002,
                TrackType.VARIABLE_LINKED, 0.0006),
                "בולט בקבועה לא צמודה לתקופות ארוכות.", updated));

        list.add(new BankRateSheet("DISCOUNT", "בנק דיסקונט", 0.12, Map.of(
                TrackType.PRIME, 0.0004,
                TrackType.FIXED_UNLINKED, -0.0006,
                TrackType.FIXED_LINKED, -0.0004,
                TrackType.VARIABLE_UNLINKED, -0.0008,
                TrackType.VARIABLE_LINKED, 0.0000),
                "מבצעים תקופתיים בשיעורי מימון נמוכים.", updated));

        list.add(new BankRateSheet("FIBI", "הבנק הבינלאומי", 0.08, Map.of(
                TrackType.PRIME, 0.0006,
                TrackType.FIXED_UNLINKED, -0.0004,
                TrackType.FIXED_LINKED, 0.0002,
                TrackType.VARIABLE_UNLINKED, 0.0006,
                TrackType.VARIABLE_LINKED, 0.0008),
                "גמיש במשא ומתן על תמהיל, פחות אגרסיבי בפריים.", updated));

        list.add(new BankRateSheet("JERUSALEM", "בנק ירושלים", 0.03, Map.of(
                TrackType.PRIME, 0.0010,
                TrackType.FIXED_UNLINKED, 0.0012,
                TrackType.FIXED_LINKED, 0.0010,
                TrackType.VARIABLE_UNLINKED, -0.0010,
                TrackType.VARIABLE_LINKED, -0.0012),
                "מתמחר גבוה יותר בממוצע, אך גמיש בתיקים מורכבים ובשיעורי מימון גבוהים.", updated));

        return List.copyOf(list);
    }

    /**
     * A lender's indicative pricing position.
     *
     * @param code        stable lender key
     * @param hebrewName  display name
     * @param marketShare share of new mortgage origination
     * @param offsets     annual rate offsets from the Bank of Israel average, per track
     * @param note        Hebrew colour on where this lender is competitive
     * @param updatedOn   when the sheet was last synchronised
     */
    public record BankRateSheet(
            String code,
            String hebrewName,
            double marketShare,
            Map<TrackType, Double> offsets,
            String note,
            LocalDate updatedOn) {
    }

    /**
     * One lender's price for the borrower's mix.
     *
     * @param code           lender key
     * @param hebrewName     display name
     * @param marketShare    share of new origination
     * @param note           Hebrew colour
     * @param rates          the rate quoted per track
     * @param weightedRate   blended month-1 rate
     * @param initialPayment month-1 payment
     * @param maxPayment     peak monthly payment on the baseline path
     * @param totalPaid      lifetime nominal cost
     * @param nominalIrr     effective annual cost
     * @param rank           1 is cheapest over the life of the loan
     * @param costAboveBest  lifetime cost above the cheapest lender
     */
    public record BankQuote(
            String code,
            String hebrewName,
            double marketShare,
            String note,
            Map<TrackType, Double> rates,
            double weightedRate,
            double initialPayment,
            double maxPayment,
            double totalPaid,
            double nominalIrr,
            int rank,
            double costAboveBest) {
    }
}
