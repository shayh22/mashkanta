package il.mashkanta.documents;

import il.mashkanta.documents.ApprovalDocumentParser.ParsedTrack;
import java.util.List;
import java.util.Map;

/**
 * The sanitised outcome of one extraction — the only thing that is ever persisted or returned.
 *
 * @param pageCount           pages in the source document
 * @param redactedSpans       identifying spans removed before persistence
 * @param redactionsByCategory breakdown of what was removed
 * @param bankCode            the lender named by the document, when recognised
 * @param totalAmount         principal across the recognised tracks
 * @param tracks              the recognised track rows
 * @param warnings            Hebrew notes about anything needing manual confirmation
 */
public record DocumentExtractionResult(
        int pageCount,
        int redactedSpans,
        Map<String, Integer> redactionsByCategory,
        String bankCode,
        double totalAmount,
        List<ParsedTrack> tracks,
        List<String> warnings) {
}
