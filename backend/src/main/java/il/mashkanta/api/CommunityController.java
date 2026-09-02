package il.mashkanta.api;

import il.mashkanta.api.dto.CommunityOfferRequest;
import il.mashkanta.persistence.CrowdOffer;
import il.mashkanta.persistence.CrowdOfferRepository;
import il.mashkanta.service.MarketBaselineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The community contribution endpoint that keeps the baseline current between regulatory
 * publications.
 *
 * <p>A submission is accepted regardless of plausibility but only marked verified when it survives
 * the outlier screen; unverified observations never move the baseline. Rejecting outright would
 * discard genuine outliers from unusual deals, while trusting them would let one mistyped rate
 * distort a whole bucket.
 */
@RestController
@RequestMapping("/api/v1/community")
@Tag(name = "Community", description = "תרומת תנאי משכנתא אנונימיים לבסיס הנתונים")
public class CommunityController {

    private final CrowdOfferRepository offers;
    private final MarketBaselineService baseline;

    public CommunityController(CrowdOfferRepository offers, MarketBaselineService baseline) {
        this.offers = offers;
        this.baseline = baseline;
    }

    @PostMapping("/offers")
    @Operation(summary = "Submits an anonymised term sheet observation")
    public ResponseEntity<SubmissionResult> submit(@Valid @RequestBody CommunityOfferRequest request) {
        boolean plausible = baseline.isPlausible(request.track(), request.ltv(), request.annualRate());

        CrowdOffer offer = new CrowdOffer(
                request.bankCode(),
                request.track(),
                request.ltv(),
                request.annualRate(),
                request.termMonths(),
                request.dtiBand(),
                request.observedOn() == null ? LocalDate.now() : request.observedOn(),
                false,
                plausible);
        offers.save(offer);

        if (plausible) {
            baseline.refresh();
        }

        return ResponseEntity.ok(new SubmissionResult(offer.getId().toString(), plausible,
                plausible
                        ? "תודה — הנתון נקלט ומשוקלל בבסיס הנתונים."
                        : "תודה — הנתון נקלט אך חורג משמעותית מהממוצע בשוק ולכן אינו משפיע על הבסיס עד לאימות."));
    }

    /**
     * @param id       identifier of the stored observation
     * @param verified whether it passed the outlier screen
     * @param message  Hebrew confirmation text
     */
    public record SubmissionResult(String id, boolean verified, String message) {
    }
}
