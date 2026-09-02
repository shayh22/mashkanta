package il.mashkanta.persistence;

import il.mashkanta.domain.TrackType;
import il.mashkanta.service.LtvTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One anonymised term sheet observation contributed by a borrower or extracted from an
 * approval-in-principle document.
 *
 * <p>The entity has no borrower-identifying column by construction: identity numbers, names,
 * addresses and account numbers are stripped in memory before anything reaches this class, and the
 * schema gives them nowhere to land even if a future code path tried.
 */
@Entity
@Table(name = "crowd_offer", indexes = {
        @Index(name = "idx_crowd_offer_track_tier", columnList = "track,ltv_tier"),
        @Index(name = "idx_crowd_offer_observed", columnList = "observed_on")
})
public class CrowdOffer {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** Lender identifier, e.g. {@code HAPOALIM}. Never a branch or account number. */
    @Column(name = "bank_code", length = 32)
    private String bankCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "track", length = 32, nullable = false)
    private TrackType track;

    @Enumerated(EnumType.STRING)
    @Column(name = "ltv_tier", length = 32, nullable = false)
    private LtvTier ltvTier;

    @Column(name = "ltv", nullable = false)
    private double ltv;

    /** All-in annual rate quoted for the track. */
    @Column(name = "annual_rate", nullable = false)
    private double annualRate;

    @Column(name = "term_months", nullable = false)
    private int termMonths;

    /** Coarse DTI band ("30-40%"), never the underlying income figures. */
    @Column(name = "dti_band", length = 16)
    private String dtiBand;

    @Column(name = "observed_on", nullable = false)
    private LocalDate observedOn;

    /** True when the rate came out of the document pipeline rather than a typed form. */
    @Column(name = "ocr_verified", nullable = false)
    private boolean ocrVerified;

    /** False until the observation passes the outlier screen. */
    @Column(name = "verified", nullable = false)
    private boolean verified;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CrowdOffer() {
    }

    public CrowdOffer(String bankCode, TrackType track, double ltv, double annualRate, int termMonths,
                      String dtiBand, LocalDate observedOn, boolean ocrVerified, boolean verified) {
        this.id = UUID.randomUUID();
        this.bankCode = bankCode;
        this.track = track;
        this.ltv = ltv;
        this.ltvTier = LtvTier.of(ltv);
        this.annualRate = annualRate;
        this.termMonths = termMonths;
        this.dtiBand = dtiBand;
        this.observedOn = observedOn;
        this.ocrVerified = ocrVerified;
        this.verified = verified;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getBankCode() {
        return bankCode;
    }

    public TrackType getTrack() {
        return track;
    }

    public LtvTier getLtvTier() {
        return ltvTier;
    }

    public double getLtv() {
        return ltv;
    }

    public double getAnnualRate() {
        return annualRate;
    }

    public int getTermMonths() {
        return termMonths;
    }

    public String getDtiBand() {
        return dtiBand;
    }

    public LocalDate getObservedOn() {
        return observedOn;
    }

    public boolean isOcrVerified() {
        return ocrVerified;
    }

    public boolean isVerified() {
        return verified;
    }

    public void markVerified(boolean value) {
        this.verified = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
