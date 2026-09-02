package il.mashkanta.service;

import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.util.List;

/**
 * A fully priced, fully checked mortgage mix — a regulatory basket or the tailored recommendation.
 *
 * @param id          stable key, e.g. {@code BASKET_2} or {@code OPTIMAL}
 * @param name        Hebrew display name
 * @param description Hebrew explanation of what the mix is for
 * @param specs       the priced components
 * @param allocations the same components in presentation shape
 * @param result      engine output for the baseline macro path
 * @param compliance  regulatory verdict
 * @param stress      sensitivity matrix
 * @param score       optimizer objective value, lower is better; 0 for baskets not scored
 * @param recommended whether this is the tailored recommendation
 */
public record MixProposal(
        String id,
        String name,
        String description,
        List<TrackSpec> specs,
        List<TrackAllocation> allocations,
        MixResult result,
        ComplianceReport compliance,
        StressMatrix stress,
        double score,
        boolean recommended) {
}
