package il.mashkanta.persistence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Lifecycle storage for asynchronous document extractions. */
public interface DocumentJobRepository extends JpaRepository<DocumentJob, UUID> {
}
