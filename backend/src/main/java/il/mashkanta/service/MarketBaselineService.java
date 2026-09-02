package il.mashkanta.service;

import il.mashkanta.domain.TrackType;
import il.mashkanta.persistence.CrowdOffer;
import il.mashkanta.persistence.CrowdOfferRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

/**
 * The dynamic market baseline: what a given track actually costs, by LTV bucket.
 *
 * <p>The seed is the Bank of Israel published average-rate table (קו המשווה). Verified crowdsourced
 * observations are then blended in, weighted by how they were verified, so the baseline tracks the
 * live market between monthly regulatory publications rather than lagging it.
 *
 * <p>The blended table is held in an {@link AtomicReference} and swapped wholesale by the ingestion
 * worker, so readers never see a half-updated table and never take a lock.
 */
@Service
public class MarketBaselineService {

    /** Confidence weight for a rate parsed out of an official approval-in-principle document. */
    private static final double OCR_WEIGHT = 1.0;
    /** Confidence weight for a hand-typed community submission. */
    private static final double MANUAL_WEIGHT = 0.5;
    /** Observations needed in a bucket before the crowd is allowed to move the baseline. */
    private static final int MIN_CROWD_SAMPLES = 5;
    /** Rates further than this from the published average are treated as data-entry noise. */
    private static final double OUTLIER_BAND = 0.025;
    /** How far back an observation still describes the current market. */
    private static final int OBSERVATION_WINDOW_DAYS = 90;

    private final CrowdOfferRepository crowdOffers;
    private final AtomicReference<Map<Key, MarketRate>> table = new AtomicReference<>();
    private final AtomicReference<LocalDate> lastRefresh = new AtomicReference<>(LocalDate.now());
    private final Map<Key, MarketRate> seed;

    public MarketBaselineService(CrowdOfferRepository crowdOffers) {
        this.crowdOffers = crowdOffers;
        this.seed = seedTable();
        this.table.set(seed);
    }

    /** The rate distribution for a track at the borrower's LTV, adjusted for the requested term. */
    public MarketRate rateFor(TrackType track, double ltv, int termMonths) {
        LtvTier tier = LtvTier.of(ltv);
        MarketRate base = table.get().get(new Key(track, tier));
        if (base == null) {
            base = seed.get(new Key(track, tier));
        }
        double adjustment = termPremium(track, termMonths);
        if (adjustment == 0) {
            return base;
        }
        return new MarketRate(base.track(), base.tier(), base.bestRate() + adjustment,
                base.medianRate() + adjustment, base.worstRate() + adjustment,
                base.sampleSize(), base.source());
    }

    /** The whole current table, for the {@code /market-baseline/current} endpoint. */
    public List<MarketRate> currentTable() {
        return new ArrayList<>(table.get().values());
    }

    public LocalDate lastRefreshedOn() {
        return lastRefresh.get();
    }

    /**
     * Rebuilds the blended table from the seed plus verified crowdsourced observations.
     * Called by the ingestion worker on a schedule and after a document extraction is confirmed.
     */
    public void refresh() {
        List<CrowdOffer> recent = crowdOffers.findByVerifiedTrueAndObservedOnAfter(
                LocalDate.now().minusDays(OBSERVATION_WINDOW_DAYS));

        Map<Key, List<CrowdOffer>> grouped = new HashMap<>();
        for (CrowdOffer offer : recent) {
            grouped.computeIfAbsent(new Key(offer.getTrack(), offer.getLtvTier()), key -> new ArrayList<>())
                    .add(offer);
        }

        Map<Key, MarketRate> rebuilt = new HashMap<>(seed);
        grouped.forEach((key, offers) -> {
            MarketRate base = seed.get(key);
            if (base == null || offers.size() < MIN_CROWD_SAMPLES) {
                return;
            }
            // Drop individual outliers first, then require the surviving mean to stay credible.
            List<CrowdOffer> kept = offers.stream()
                    .filter(offer -> Math.abs(offer.getAnnualRate() - base.medianRate()) <= OUTLIER_BAND)
                    .toList();
            if (kept.size() < MIN_CROWD_SAMPLES) {
                return;
            }
            double mean = kept.stream().mapToDouble(CrowdOffer::getAnnualRate).average().orElse(base.medianRate());
            if (Math.abs(mean - base.medianRate()) > OUTLIER_BAND) {
                return;
            }
            long ocrCount = kept.stream().filter(CrowdOffer::isOcrVerified).count();
            double weight = (ocrCount * OCR_WEIGHT + (kept.size() - ocrCount) * MANUAL_WEIGHT) / kept.size();
            rebuilt.put(key, base.blendedWith(mean, kept.size(), weight));
        });

        table.set(Map.copyOf(rebuilt));
        lastRefresh.set(LocalDate.now());
    }

    /**
     * True when a single observation is close enough to the published average to be credible.
     * A quote more than {@code OUTLIER_BAND} from the average is a typo or a different product,
     * not a deal worth moving the baseline for.
     */
    public boolean isPlausible(TrackType track, double ltv, double rate) {
        MarketRate base = seed.get(new Key(track, LtvTier.of(ltv)));
        return base != null && Math.abs(rate - base.medianRate()) <= OUTLIER_BAND;
    }

    /**
     * Fixed-rate tracks price the lender's duration risk, so a 30-year quote sits above a 15-year
     * one. Prime carries no duration premium — it re-prices every month regardless of term.
     */
    private double termPremium(TrackType track, int termMonths) {
        if (track == TrackType.PRIME) {
            return 0;
        }
        int yearsBeyond20 = Math.max(0, termMonths / 12 - 20);
        int yearsBelow20 = Math.max(0, 20 - termMonths / 12);
        return yearsBeyond20 * 0.0002 - yearsBelow20 * 0.00025;
    }

    /**
     * Seed values reflect the Bank of Israel monthly average table published for the current
     * period. Prime figures are all-in (prime plus the typical negative bank margin).
     */
    private Map<Key, MarketRate> seedTable() {
        Map<Key, MarketRate> map = new HashMap<>();
        String source = "בנק ישראל — ריביות ממוצעות חודשיות";

        // Prime is quoted as a margin off the 5.75% prime rate. A well-negotiated deal is around
        // prime minus 0.7; prime minus 0.2 is what an un-negotiated first offer looks like.
        put(map, TrackType.PRIME, LtvTier.UP_TO_45, 0.0475, 0.0505, 0.0545, 4200, source);
        put(map, TrackType.PRIME, LtvTier.FROM_45_TO_60, 0.0485, 0.0515, 0.0555, 5100, source);
        put(map, TrackType.PRIME, LtvTier.ABOVE_60, 0.0495, 0.0525, 0.0565, 6800, source);

        put(map, TrackType.FIXED_UNLINKED, LtvTier.UP_TO_45, 0.0455, 0.0495, 0.0540, 3900, source);
        put(map, TrackType.FIXED_UNLINKED, LtvTier.FROM_45_TO_60, 0.0470, 0.0512, 0.0558, 4700, source);
        put(map, TrackType.FIXED_UNLINKED, LtvTier.ABOVE_60, 0.0488, 0.0532, 0.0580, 6300, source);

        put(map, TrackType.FIXED_LINKED, LtvTier.UP_TO_45, 0.0265, 0.0300, 0.0345, 2600, source);
        put(map, TrackType.FIXED_LINKED, LtvTier.FROM_45_TO_60, 0.0278, 0.0315, 0.0360, 3100, source);
        put(map, TrackType.FIXED_LINKED, LtvTier.ABOVE_60, 0.0295, 0.0335, 0.0382, 4100, source);

        put(map, TrackType.VARIABLE_UNLINKED, LtvTier.UP_TO_45, 0.0440, 0.0478, 0.0520, 1800, source);
        put(map, TrackType.VARIABLE_UNLINKED, LtvTier.FROM_45_TO_60, 0.0452, 0.0492, 0.0536, 2200, source);
        put(map, TrackType.VARIABLE_UNLINKED, LtvTier.ABOVE_60, 0.0468, 0.0510, 0.0556, 2900, source);

        put(map, TrackType.VARIABLE_LINKED, LtvTier.UP_TO_45, 0.0215, 0.0250, 0.0292, 1500, source);
        put(map, TrackType.VARIABLE_LINKED, LtvTier.FROM_45_TO_60, 0.0228, 0.0265, 0.0308, 1900, source);
        put(map, TrackType.VARIABLE_LINKED, LtvTier.ABOVE_60, 0.0244, 0.0284, 0.0330, 2500, source);

        String subsidised = "משרד הבינוי והשיכון — הלוואת זכאות";
        for (LtvTier tier : LtvTier.values()) {
            put(map, TrackType.ELIGIBILITY, tier, 0.0300, 0.0300, 0.0300, 0, subsidised);
        }
        return Map.copyOf(map);
    }

    private void put(Map<Key, MarketRate> map, TrackType track, LtvTier tier,
                     double best, double median, double worst, int samples, String source) {
        map.put(new Key(track, tier), new MarketRate(track, tier, best, median, worst, samples, source));
    }

    /** Per-track view of the table at one LTV, which is what the optimizer needs. */
    public Map<TrackType, MarketRate> tableFor(double ltv, int termMonths) {
        Map<TrackType, MarketRate> rates = new EnumMap<>(TrackType.class);
        for (TrackType track : TrackType.values()) {
            rates.put(track, rateFor(track, ltv, termMonths));
        }
        return rates;
    }

    private record Key(TrackType track, LtvTier tier) {
    }
}
