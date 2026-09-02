package il.mashkanta.api;

import il.mashkanta.documents.DocumentProcessingService;
import il.mashkanta.ingestion.MacroAnchorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Upload and polling endpoints for approval-in-principle extraction.
 *
 * <p>The upload returns immediately with a job id: extraction runs on a worker thread so a slow
 * document never occupies a request thread, and the client polls the job endpoint for the sanitised
 * result.
 */
@RestController
@RequestMapping("/api/v1/documents")
@Tag(name = "Documents", description = "העלאת אישור עקרוני וחילוץ נתונים עם הסרת פרטים מזהים")
public class DocumentController {

    /** Formats the extractor can read. Anything else is rejected before it is buffered. */
    private static final List<String> ACCEPTED_EXTENSIONS = List.of(".pdf", ".txt");

    private final DocumentProcessingService documents;
    private final MacroAnchorService anchors;

    public DocumentController(DocumentProcessingService documents, MacroAnchorService anchors) {
        this.documents = documents;
        this.anchors = anchors;
    }

    @PostMapping(path = "/upload-approval", consumes = "multipart/form-data")
    @Operation(summary = "Uploads an approval-in-principle for extraction; identifying data is stripped in memory")
    public ResponseEntity<?> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "ltv", defaultValue = "0.65") double ltv,
            @RequestParam(value = "contribute", defaultValue = "false") boolean contribute) throws IOException {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(new UploadError("הקובץ ריק."));
        }
        if (file.getSize() > DocumentProcessingService.MAX_UPLOAD_BYTES) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body(new UploadError("הקובץ גדול מ-10MB."));
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (ACCEPTED_EXTENSIONS.stream().noneMatch(name::endsWith)) {
            return ResponseEntity.badRequest().body(new UploadError("ניתן להעלות קבצי PDF בלבד."));
        }

        UUID jobId = documents.submit(file.getOriginalFilename(), file.getSize());
        documents.process(jobId, file.getBytes(), file.getContentType(), file.getOriginalFilename(),
                ltv, anchors.current().prime(), contribute);

        return ResponseEntity.accepted().body(new UploadAccepted(jobId,
                "הקובץ התקבל. פרטים מזהים מוסרים לפני כל שמירה, והקובץ עצמו אינו נשמר."));
    }

    @GetMapping("/jobs/{jobId}")
    @Operation(summary = "Returns extraction status and, once complete, the sanitised terms")
    public ResponseEntity<?> job(@PathVariable UUID jobId) {
        return documents.find(jobId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(new UploadError("לא נמצאה בקשת עיבוד עם המזהה שנשלח.")));
    }

    /**
     * @param jobId   the id to poll
     * @param message Hebrew confirmation shown in the uploader
     */
    public record UploadAccepted(UUID jobId, String message) {
    }

    /** @param message Hebrew error text */
    public record UploadError(String message) {
    }
}
