package il.mashkanta.persistence;

import il.mashkanta.domain.TrackType;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Read and write access to the anonymised community observations. */
public interface CrowdOfferRepository extends JpaRepository<CrowdOffer, UUID> {

    /** Verified observations recent enough to describe today's market. */
    List<CrowdOffer> findByVerifiedTrueAndObservedOnAfter(LocalDate cutoff);

    long countByTrackAndVerifiedTrue(TrackType track);
}
