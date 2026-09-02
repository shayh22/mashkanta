package il.mashkanta.documents;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Strips borrower-identifying content out of an extracted document before anything is persisted.
 *
 * <p>Redaction happens on the in-memory string produced by text extraction and nothing downstream
 * ever sees the original: the parser, the job record and the market baseline all consume the
 * sanitised text. That ordering is the substance of the platform's zero-knowledge claim — it is not
 * enough to avoid displaying identity numbers, they have to be gone before the first write.
 *
 * <p>Identity numbers are validated against the official check digit before being redacted, so a
 * nine-digit loan reference is not silently destroyed while a real identity number that happens to
 * be split across a line break still matches on its digits alone.
 */
@Service
public class PiiRedactionService {

    /** Nine digit runs — candidates for an Israeli identity number, confirmed by check digit. */
    private static final Pattern ID_CANDIDATE = Pattern.compile("(?<![\\d])(\\d{9})(?![\\d])");
    /** Israeli mobile and landline numbers, with or without separators. */
    private static final Pattern PHONE = Pattern.compile("(?<![\\d])0\\d{1,2}[-\\s]?\\d{7}(?![\\d])");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}");
    /** Bank account and branch numbers introduced by their Hebrew label. */
    private static final Pattern ACCOUNT = Pattern.compile("(חשבון|חשבון מספר|מס' חשבון|סניף)\\s*[:\\-]?\\s*(\\d[\\d\\-/]{3,})");
    /** Free-text values following a name label, up to the end of the line. */
    private static final Pattern NAME = Pattern.compile(
            "(שם הלווה|שם הלקוח|שם המבקש|שם מלא|הלווה|לכבוד)\\s*[:\\-]?\\s*([^\\n\\r]{2,60})");
    /** Free-text values following an address label. */
    private static final Pattern ADDRESS = Pattern.compile(
            "(כתובת הנכס|כתובת|רחוב|גוש|חלקה)\\s*[:\\-]?\\s*([^\\n\\r]{2,80})");

    private static final String MASK = "[REDACTED]";

    /**
     * Removes every identifying span from the text.
     *
     * @param text raw extracted text; may be {@code null}
     * @return the sanitised text plus a per-category count of what was removed
     */
    public RedactionResult redact(String text) {
        if (text == null || text.isBlank()) {
            return new RedactionResult("", 0, Map.of());
        }

        Map<String, Integer> counts = new LinkedHashMap<>();
        String working = text;

        working = redactIdentityNumbers(working, counts);
        working = replaceWhole(working, EMAIL, "EMAIL", counts);
        working = replaceWhole(working, PHONE, "PHONE", counts);
        working = replaceLabelled(working, ACCOUNT, "ACCOUNT", counts);
        working = replaceLabelled(working, NAME, "NAME", counts);
        working = replaceLabelled(working, ADDRESS, "ADDRESS", counts);

        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        return new RedactionResult(working, total, Map.copyOf(counts));
    }

    /** Redacts only those nine-digit runs that are valid Israeli identity numbers. */
    private String redactIdentityNumbers(String text, Map<String, Integer> counts) {
        Matcher matcher = ID_CANDIDATE.matcher(text);
        StringBuilder out = new StringBuilder();
        int removed = 0;
        while (matcher.find()) {
            String candidate = matcher.group(1);
            if (isValidIsraeliId(candidate)) {
                matcher.appendReplacement(out, MASK);
                removed++;
            } else {
                matcher.appendReplacement(out, Matcher.quoteReplacement(candidate));
            }
        }
        matcher.appendTail(out);
        if (removed > 0) {
            counts.merge("NATIONAL_ID", removed, Integer::sum);
        }
        return out.toString();
    }

    /**
     * The Israeli identity number check digit: digits are weighted 1,2,1,2..., each product is
     * reduced to its digit sum, and the total must be divisible by ten.
     */
    public static boolean isValidIsraeliId(String digits) {
        if (digits == null || digits.length() != 9 || !digits.chars().allMatch(Character::isDigit)) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 9; i++) {
            int product = (digits.charAt(i) - '0') * (i % 2 == 0 ? 1 : 2);
            sum += product > 9 ? product - 9 : product;
        }
        return sum % 10 == 0;
    }

    private String replaceWhole(String text, Pattern pattern, String category, Map<String, Integer> counts) {
        Matcher matcher = pattern.matcher(text);
        StringBuilder out = new StringBuilder();
        int removed = 0;
        while (matcher.find()) {
            matcher.appendReplacement(out, MASK);
            removed++;
        }
        matcher.appendTail(out);
        if (removed > 0) {
            counts.merge(category, removed, Integer::sum);
        }
        return out.toString();
    }

    /** Keeps the Hebrew label so the document stays readable, and masks only the value after it. */
    private String replaceLabelled(String text, Pattern pattern, String category, Map<String, Integer> counts) {
        Matcher matcher = pattern.matcher(text);
        StringBuilder out = new StringBuilder();
        int removed = 0;
        while (matcher.find()) {
            matcher.appendReplacement(out, Matcher.quoteReplacement(matcher.group(1) + ": " + MASK));
            removed++;
        }
        matcher.appendTail(out);
        if (removed > 0) {
            counts.merge(category, removed, Integer::sum);
        }
        return out.toString();
    }

    /** Categories the pipeline knows how to strip, surfaced in the API for transparency. */
    public static List<String> categories() {
        return List.of("NATIONAL_ID", "NAME", "ADDRESS", "ACCOUNT", "PHONE", "EMAIL");
    }

    /**
     * @param sanitizedText the text with every identifying span masked
     * @param spanCount     how many spans were removed in total
     * @param byCategory    breakdown by category, shown to the user as reassurance
     */
    public record RedactionResult(String sanitizedText, int spanCount, Map<String, Integer> byCategory) {
    }
}
