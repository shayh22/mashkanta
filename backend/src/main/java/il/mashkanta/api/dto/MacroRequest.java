package il.mashkanta.api.dto;

import il.mashkanta.engine.MacroScenario;
import il.mashkanta.ingestion.MacroAnchors;

/**
 * Macro assumptions supplied by the client. Every field is optional — anything omitted falls back to
 * the latest published anchor, so a minimal request is still priced against real data.
 *
 * @param prime    Bank of Israel prime rate as a fraction
 * @param cpiAnnual expected annual inflation as a fraction
 * @param anchor   5-year government bond yield anchoring the variable tracks
 */
public record MacroRequest(Double prime, Double cpiAnnual, Double anchor) {

    public MacroScenario toScenario(MacroAnchors anchors) {
        return MacroScenario.baseline(
                prime != null ? prime : anchors.prime(),
                cpiAnnual != null ? cpiAnnual : anchors.cpiAnnual(),
                anchor != null ? anchor : anchors.bondYield5y());
    }
}
