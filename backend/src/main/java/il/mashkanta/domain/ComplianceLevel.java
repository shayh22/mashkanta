package il.mashkanta.domain;

/** Severity of a regulatory finding, mirrored by the traffic-light palette in the UI. */
public enum ComplianceLevel {
    /** Within the optimal band — green. */
    OK,
    /** Permitted but priced at a premium or requiring a management exception — amber. */
    WARNING,
    /** Breaches a hard Bank of Israel ceiling — the offer cannot legally be underwritten. */
    BLOCKING
}
