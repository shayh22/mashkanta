package il.mashkanta.ingestion;

import il.mashkanta.service.MarketBaselineService;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the platform's view of the market current against the public publication calendar.
 *
 * <p>Three cadences matter in Israel and each gets its own job: the CBS publishes the CPI on the
 * 15th of every month at 18:30, the Bank of Israel announces its rate eight times a year and
 * publishes the monthly average mortgage rate table shortly after, and the bond curve moves daily.
 *
 * <p>Remote fetching is opt-in. Without configured feed URLs the worker still runs, re-blending the
 * crowdsourced observations into the baseline, and leaves the published anchors at their seeded
 * values rather than inventing numbers.
 */
@Component
public class BoIDataIngestionWorker {

    private static final Logger log = LoggerFactory.getLogger(BoIDataIngestionWorker.class);

    private final MarketBaselineService baseline;
    private final MacroAnchorService anchors;
    private final PublicDataFeed feed;

    @Value("${app.ingestion.enabled:false}")
    private boolean ingestionEnabled;

    public BoIDataIngestionWorker(MarketBaselineService baseline, MacroAnchorService anchors, PublicDataFeed feed) {
        this.baseline = baseline;
        this.anchors = anchors;
        this.feed = feed;
    }

    /**
     * The CBS publishes the consumer price index on the 15th of each month at 18:30 local time.
     * The job runs a few minutes later so the figure is on the wire.
     */
    @Scheduled(cron = "0 35 18 15 * *", zone = "Asia/Jerusalem")
    public void ingestConsumerPriceIndex() {
        if (!enabled("CPI")) {
            return;
        }
        feed.fetchCpi().ifPresent(cpi -> {
            MacroAnchors current = anchors.current();
            LocalDate today = LocalDate.now();
            anchors.update(new MacroAnchors(current.prime(), cpi, current.bondYield5y(), current.linkedYield5y(),
                    current.primeUpdatedOn(), today, today.plusMonths(1), "הלשכה המרכזית לסטטיסטיקה"));
            log.info("CPI anchor updated to {}", cpi);
        });
    }

    /**
     * The Bank of Israel rate decision is published on eight scheduled Mondays a year. Polling every
     * weekday evening picks the change up the same day without needing the decision calendar.
     */
    @Scheduled(cron = "0 15 16 * * MON-FRI", zone = "Asia/Jerusalem")
    public void ingestPrimeRate() {
        if (!enabled("PRIME")) {
            return;
        }
        feed.fetchPrime().ifPresent(prime -> {
            MacroAnchors current = anchors.current();
            if (Math.abs(prime - current.prime()) < 1e-9) {
                return;
            }
            anchors.update(new MacroAnchors(prime, current.cpiAnnual(), current.bondYield5y(),
                    current.linkedYield5y(), LocalDate.now(), current.cpiUpdatedOn(), current.nextCpiOn(),
                    "בנק ישראל — החלטת ריבית"));
            log.info("prime anchor updated from {} to {}", current.prime(), prime);
        });
    }

    /** The 5-year government bond curve re-anchors every variable track, so it is polled daily. */
    @Scheduled(cron = "0 0 20 * * MON-FRI", zone = "Asia/Jerusalem")
    public void ingestBondCurve() {
        if (!enabled("BONDS")) {
            return;
        }
        feed.fetchFiveYearYields().ifPresent(yields -> {
            MacroAnchors current = anchors.current();
            anchors.update(new MacroAnchors(current.prime(), current.cpiAnnual(), yields.unlinked(),
                    yields.linked(), current.primeUpdatedOn(), current.cpiUpdatedOn(), current.nextCpiOn(),
                    "הבורסה לניירות ערך בתל אביב — עקום אג\"ח ממשלתי"));
        });
    }

    /**
     * Re-blends verified community observations into the baseline overnight. This runs whether or not
     * remote feeds are configured, because the crowdsourced data is local.
     */
    @Scheduled(cron = "0 30 2 * * *", zone = "Asia/Jerusalem")
    public void rebuildBaseline() {
        baseline.refresh();
        log.info("market baseline rebuilt from {} entries", baseline.currentTable().size());
    }

    private boolean enabled(String job) {
        if (!ingestionEnabled) {
            log.debug("ingestion job {} skipped — app.ingestion.enabled is false", job);
            return false;
        }
        return true;
    }
}
