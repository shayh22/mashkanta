package il.mashkanta.documents;

import com.fasterxml.jackson.databind.ObjectMapper;
import il.mashkanta.persistence.CrowdOffer;
import il.mashkanta.persistence.CrowdOfferRepository;
import il.mashkanta.persistence.DocumentJob;
import il.mashkanta.persistence.DocumentJobRepository;
import il.mashkanta.service.MarketBaselineService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orchestrates approval-in-principle extraction: text out, identity in the bin, terms into the
 * market baseline.
 *
 * <p>The order of operations is the security control. Text extraction produces a string, redaction
 * consumes it and produces a sanitised string, and only the sanitised string is passed on. The
 * uploaded bytes are zeroed in the same call that read them, so the raw document exists only for the
 * duration of one method and is never written to disk or to the database.
 */
@Service
public class DocumentProcessingService {

    private static final Logger log = LoggerFactory.getLogger(DocumentProcessingService.class);

    /** Uploads larger than this are rejected before any parsing work is attempted. */
    public static final long MAX_UPLOAD_BYTES = 10L * 1024 * 1024;

    private final TextExtractor extractor;
    private final PiiRedactionService redaction;
    private final ApprovalDocumentParser parser;
    private final DocumentJobRepository jobs;
    private final CrowdOfferRepository crowdOffers;
    private final MarketBaselineService baseline;
    private final ObjectMapper objectMapper;

    public DocumentProcessingService(TextExtractor extractor, PiiRedactionService redaction,
                                     ApprovalDocumentParser parser, DocumentJobRepository jobs,
                                     CrowdOfferRepository crowdOffers, MarketBaselineService baseline,
                                     ObjectMapper objectMapper) {
        this.extractor = extractor;
        this.redaction = redaction;
        this.parser = parser;
        this.jobs = jobs;
        this.crowdOffers = crowdOffers;
        this.baseline = baseline;
        this.objectMapper = objectMapper;
    }

    /** Registers the job synchronously so the caller immediately gets an id to poll. */
    @Transactional
    public UUID submit(String fileName, long sizeBytes) {
        DocumentJob job = new DocumentJob(extensionOf(fileName), sizeBytes);
        jobs.save(job);
        return job.getId();
    }

    /**
     * Runs the extraction off the request thread.
     *
     * @param content     the uploaded bytes; zeroed before this method returns
     * @param contentType declared MIME type
     * @param fileName    original filename, used only to detect the format
     * @param ltv         loan-to-value, so extracted rates land in the right baseline bucket
     * @param primeRate   today's prime, to resolve "prime minus" quotes
     * @param contribute  whether the borrower consented to share the anonymised terms
     */
    @Async("documentExecutor")
    @Transactional
    public void process(UUID jobId, byte[] content, String contentType, String fileName,
                        double ltv, double primeRate, boolean contribute) {
        DocumentJob job = jobs.findById(jobId).orElse(null);
        if (job == null) {
            log.warn("document job {} vanished before processing", jobId);
            return;
        }
        job.setStatus(DocumentJob.Status.PROCESSING);
        jobs.save(job);

        try {
            TextExtractor.Extraction extraction = extractor.extract(content, contentType, fileName);
            PiiRedactionService.RedactionResult sanitised = redaction.redact(extraction.text());
            ApprovalDocumentParser.ParsedApproval parsed = parser.parse(sanitised.sanitizedText(), primeRate);

            List<String> warnings = new ArrayList<>(parsed.warnings());
            if (extraction.warning() != null) {
                warnings.add(extraction.warning());
            }

            DocumentExtractionResult result = new DocumentExtractionResult(
                    extraction.pageCount(),
                    sanitised.spanCount(),
                    sanitised.byCategory(),
                    parsed.bankCode(),
                    parsed.totalAmount(),
                    parsed.tracks(),
                    List.copyOf(warnings));

            job.complete(objectMapper.writeValueAsString(result), sanitised.spanCount());
            jobs.save(job);

            if (contribute) {
                contribute(parsed, ltv);
            }
        } catch (Exception exception) {
            log.warn("document job {} failed: {}", jobId, exception.toString());
            job.fail(exception.getMessage());
            jobs.save(job);
        } finally {
            // Shred the upload buffer: the raw document must not outlive this call.
            Arrays.fill(content, (byte) 0);
        }
    }

    /** Feeds credible extracted rates into the dynamic market baseline. */
    private void contribute(ApprovalDocumentParser.ParsedApproval parsed, double ltv) {
        boolean added = false;
        for (ApprovalDocumentParser.ParsedTrack track : parsed.tracks()) {
            if (track.annualRate() <= 0 || !baseline.isPlausible(track.track(), ltv, track.annualRate())) {
                continue;
            }
            crowdOffers.save(new CrowdOffer(parsed.bankCode(), track.track(), ltv, track.annualRate(),
                    track.termMonths() > 0 ? track.termMonths() : 240, null, LocalDate.now(), true, true));
            added = true;
        }
        if (added) {
            baseline.refresh();
        }
    }

    @Transactional(readOnly = true)
    public Optional<JobView> find(UUID jobId) {
        return jobs.findById(jobId).map(this::toView);
    }

    private JobView toView(DocumentJob job) {
        DocumentExtractionResult result = null;
        if (job.getResultJson() != null) {
            try {
                result = objectMapper.readValue(job.getResultJson(), DocumentExtractionResult.class);
            } catch (Exception exception) {
                log.warn("could not deserialise result for job {}", job.getId());
            }
        }
        return new JobView(job.getId(), job.getStatus(), job.getSubmittedAt(), job.getCompletedAt(),
                job.getRedactedSpans(), result, job.getErrorMessage());
    }

    private String extensionOf(String fileName) {
        if (fileName == null) {
            return "bin";
        }
        int dot = fileName.lastIndexOf('.');
        return dot > 0 && dot < fileName.length() - 1
                ? fileName.substring(dot + 1).toLowerCase()
                : "bin";
    }

    /**
     * The pollable view of a job.
     *
     * @param jobId        job identifier
     * @param status       lifecycle state
     * @param submittedAt  when the upload arrived
     * @param completedAt  when extraction finished, null while in flight
     * @param redactedSpans identifying spans removed
     * @param result       the sanitised extraction, null until completion
     * @param error        failure message, null unless the job failed
     */
    public record JobView(
            UUID jobId,
            DocumentJob.Status status,
            java.time.Instant submittedAt,
            java.time.Instant completedAt,
            int redactedSpans,
            DocumentExtractionResult result,
            String error) {
    }
}
