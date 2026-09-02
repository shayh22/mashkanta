package il.mashkanta.ingestion;

import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

/**
 * Holds the current economic anchors and hands them to every simulation that does not override them.
 *
 * <p>Readers take a single volatile read; the ingestion worker swaps the whole record atomically, so
 * a simulation never sees a prime rate from one publication paired with a CPI from another.
 */
@Service
public class MacroAnchorService {

    private final AtomicReference<MacroAnchors> anchors = new AtomicReference<>(MacroAnchors.seed());

    public MacroAnchors current() {
        return anchors.get();
    }

    public void update(MacroAnchors updated) {
        anchors.set(updated);
    }
}
