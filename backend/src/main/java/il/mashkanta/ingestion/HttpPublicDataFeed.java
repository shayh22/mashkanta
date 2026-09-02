package il.mashkanta.ingestion;

import java.time.Duration;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Fetches the public feeds over HTTP.
 *
 * <p>Endpoints are supplied by configuration rather than hard-coded: the Bank of Israel and the CBS
 * both publish through versioned open-data services whose paths change, and a redeploy is a worse
 * failure mode than a configuration edit. When a URL is not configured the feed reports nothing and
 * the platform keeps its seeded anchors.
 *
 * <p>Only public, unauthenticated endpoints are ever called. The platform holds no banking
 * credentials and never authenticates against a lender.
 */
@Component
public class HttpPublicDataFeed implements PublicDataFeed {

    private static final Logger log = LoggerFactory.getLogger(HttpPublicDataFeed.class);

    private final RestClient client;

    @Value("${app.ingestion.cpi-url:}")
    private String cpiUrl;

    @Value("${app.ingestion.prime-url:}")
    private String primeUrl;

    @Value("${app.ingestion.bond-url:}")
    private String bondUrl;

    public HttpPublicDataFeed() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public Optional<Double> fetchCpi() {
        return fetchRate(cpiUrl, "CPI");
    }

    @Override
    public Optional<Double> fetchPrime() {
        return fetchRate(primeUrl, "prime");
    }

    @Override
    public Optional<FiveYearYields> fetchFiveYearYields() {
        if (bondUrl.isBlank()) {
            return Optional.empty();
        }
        try {
            YieldPayload payload = client.get().uri(bondUrl).retrieve().body(YieldPayload.class);
            if (payload == null) {
                return Optional.empty();
            }
            return Optional.of(new FiveYearYields(payload.unlinked(), payload.linked()));
        } catch (Exception exception) {
            log.warn("bond feed unavailable, keeping previous anchors: {}", exception.toString());
            return Optional.empty();
        }
    }

    private Optional<Double> fetchRate(String url, String label) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        try {
            RatePayload payload = client.get().uri(url).retrieve().body(RatePayload.class);
            return payload == null ? Optional.empty() : Optional.of(payload.value());
        } catch (Exception exception) {
            log.warn("{} feed unavailable, keeping previous anchors: {}", label, exception.toString());
            return Optional.empty();
        }
    }

    /** Minimal shape a configured feed must expose: a single decimal rate as a fraction. */
    record RatePayload(double value) {
    }

    /** Minimal shape for the bond curve feed. */
    record YieldPayload(double unlinked, double linked) {
    }
}
