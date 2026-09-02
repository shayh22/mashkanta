package il.mashkanta.api.dto;

import il.mashkanta.service.ComplianceReport;
import il.mashkanta.service.MixProposal;
import il.mashkanta.service.StressMatrix;

/**
 * A named, priced, checked mix as returned to the client.
 *
 * @param id          stable key
 * @param name        Hebrew display name
 * @param description Hebrew explanation
 * @param recommended whether this is the tailored recommendation
 * @param score       optimizer objective value, lower is better
 * @param summary     the priced numbers
 * @param compliance  regulatory verdict
 * @param stress      sensitivity matrix
 */
public record MixProposalDto(
        String id,
        String name,
        String description,
        boolean recommended,
        double score,
        MixSummaryDto summary,
        ComplianceReport compliance,
        StressMatrix stress) {

    public static MixProposalDto from(MixProposal proposal) {
        return new MixProposalDto(
                proposal.id(),
                proposal.name(),
                proposal.description(),
                proposal.recommended(),
                proposal.score(),
                MixSummaryDto.from(proposal.result(), proposal.allocations()),
                proposal.compliance(),
                proposal.stress());
    }
}
