package il.mashkanta.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * The lifecycle record of one approval-in-principle extraction.
 *
 * <p>Only the sanitised extraction result is persisted. The uploaded bytes never touch this table and
 * are shredded from the staging buffer as soon as extraction completes.
 */
@Entity
@Table(name = "document_job")
public class DocumentJob {

    /** Where an extraction is in its lifecycle. */
    public enum Status {
        QUEUED, PROCESSING, COMPLETED, FAILED
    }

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    private Status status;

    /** Extension only — the original filename may itself carry the borrower's name. */
    @Column(name = "file_kind", length = 16)
    private String fileKind;

    @Column(name = "size_bytes")
    private long sizeBytes;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    /** How many PII spans were redacted before persistence — surfaced to the user as reassurance. */
    @Column(name = "redacted_spans")
    private int redactedSpans;

    /** The sanitised extraction, serialised as JSON. */
    @Lob
    @Column(name = "result_json")
    private String resultJson;

    @Column(name = "error_message", length = 512)
    private String errorMessage;

    protected DocumentJob() {
    }

    public DocumentJob(String fileKind, long sizeBytes) {
        this.id = UUID.randomUUID();
        this.status = Status.QUEUED;
        this.fileKind = fileKind;
        this.sizeBytes = sizeBytes;
        this.submittedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public String getFileKind() {
        return fileKind;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public int getRedactedSpans() {
        return redactedSpans;
    }

    public String getResultJson() {
        return resultJson;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void complete(String resultJson, int redactedSpans) {
        this.resultJson = resultJson;
        this.redactedSpans = redactedSpans;
        this.status = Status.COMPLETED;
        this.completedAt = Instant.now();
    }

    public void fail(String message) {
        this.errorMessage = message == null ? "extraction failed" : message.substring(0, Math.min(512, message.length()));
        this.status = Status.FAILED;
        this.completedAt = Instant.now();
    }
}
