package il.mashkanta.documents;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

/**
 * Pulls text out of an uploaded approval-in-principle.
 *
 * <p>Israeli approvals are issued as text-bearing PDFs by every major lender, so the text layer is
 * extracted directly. A scanned upload has no text layer; rather than silently returning an empty
 * extraction, {@link #extract} reports it so the caller can route the file to an OCR engine or ask
 * the borrower for the original PDF.
 */
@Component
public class TextExtractor {

    /** Below this many characters a PDF is treated as a scan rather than a text document. */
    private static final int TEXT_LAYER_THRESHOLD = 40;

    public Extraction extract(byte[] content, String contentType, String fileName) throws IOException {
        if (content == null || content.length == 0) {
            return new Extraction("", 0, false, "הקובץ ריק.");
        }
        if (isPdf(content, contentType, fileName)) {
            return extractPdf(content);
        }
        String text = new String(content, StandardCharsets.UTF_8);
        return new Extraction(text, 1, true, null);
    }

    private Extraction extractPdf(byte[] content) throws IOException {
        try (PDDocument document = Loader.loadPDF(new ByteArrayInputStream(content).readAllBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            String text = stripper.getText(document);
            int pages = document.getNumberOfPages();
            if (text == null || text.strip().length() < TEXT_LAYER_THRESHOLD) {
                return new Extraction(text == null ? "" : text, pages, false,
                        "לא נמצאה שכבת טקסט במסמך. ככל הנראה מדובר בסריקה — נדרש עיבוד OCR או קובץ PDF מקורי.");
            }
            return new Extraction(text, pages, true, null);
        }
    }

    private boolean isPdf(byte[] content, String contentType, String fileName) {
        if (content.length >= 4 && content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F') {
            return true;
        }
        if (contentType != null && contentType.toLowerCase().contains("pdf")) {
            return true;
        }
        return fileName != null && fileName.toLowerCase().endsWith(".pdf");
    }

    /**
     * @param text      the extracted text, before redaction
     * @param pageCount pages in the source document
     * @param hasText   false when the document carries no text layer
     * @param warning   Hebrew explanation when extraction was partial
     */
    public record Extraction(String text, int pageCount, boolean hasText, String warning) {
    }
}
