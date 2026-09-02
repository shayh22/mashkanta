package il.mashkanta.documents;

import il.mashkanta.domain.TrackType;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Reads the track table out of a standardised approval-in-principle (אישור עקרוני אחיד).
 *
 * <p>The Bank of Israel mandated format puts one track per row: track name, principal, term, anchor
 * and the bank's discretionary margin. The parser works line by line and only emits a track when a
 * line yields both a recognisable track name and a plausible rate, which keeps the summary tables
 * and legal boilerplate that surround the real table from producing phantom rows.
 *
 * <p>It always runs on redacted text — by the time a line reaches here, identity numbers and names
 * have already been masked.
 */
@Component
public class ApprovalDocumentParser {

    /** Amounts with thousands separators, optionally prefixed by a shekel sign. */
    private static final Pattern AMOUNT = Pattern.compile("(?:₪\\s*)?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{5,})");
    private static final Pattern RATE = Pattern.compile("(\\d{1,2}[.,]\\d{1,3})\\s*%");
    private static final Pattern TERM_MONTHS = Pattern.compile("(\\d{2,3})\\s*(?:חודשים|חודש)");
    private static final Pattern TERM_YEARS = Pattern.compile("(\\d{1,2})\\s*(?:שנים|שנה)");
    private static final Pattern PRIME_MARGIN = Pattern.compile("פריים\\s*([+\\-−])\\s*(\\d{1,2}[.,]\\d{1,3})");

    /** Hebrew spellings seen in the wild, most specific first so "קבועה צמודה" wins over "קבועה". */
    private static final Map<String, TrackType> TRACK_KEYWORDS = trackKeywords();

    private static Map<String, TrackType> trackKeywords() {
        Map<String, TrackType> map = new LinkedHashMap<>();
        map.put("קבועה לא צמודה", TrackType.FIXED_UNLINKED);
        map.put("קל\"צ", TrackType.FIXED_UNLINKED);
        map.put("קלצ", TrackType.FIXED_UNLINKED);
        map.put("משתנה לא צמודה", TrackType.VARIABLE_UNLINKED);
        map.put("משתנה צמודה", TrackType.VARIABLE_LINKED);
        map.put("משתנה כל 5", TrackType.VARIABLE_LINKED);
        map.put("קבועה צמודה", TrackType.FIXED_LINKED);
        map.put("ק\"צ", TrackType.FIXED_LINKED);
        map.put("זכאות", TrackType.ELIGIBILITY);
        map.put("פריים", TrackType.PRIME);
        return map;
    }

    /**
     * @param redactedText the sanitised document text
     * @param primeRate    today's prime, used to resolve "prime minus" quotes into an all-in rate
     */
    public ParsedApproval parse(String redactedText, double primeRate) {
        List<ParsedTrack> tracks = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        if (redactedText == null || redactedText.isBlank()) {
            return new ParsedApproval(List.of(), 0, null, List.of("לא הופק טקסט מהמסמך."));
        }

        String bank = detectBank(redactedText);

        for (String rawLine : redactedText.split("\\R")) {
            String line = rawLine.replace(' ', ' ').trim();
            if (line.length() < 8) {
                continue;
            }
            TrackType track = detectTrack(line);
            if (track == null) {
                continue;
            }
            Double rate = detectRate(line, track, primeRate);
            if (rate == null) {
                continue;
            }
            Double amount = detectAmount(line);
            Integer termMonths = detectTerm(line);
            if (amount == null) {
                warnings.add(String.format("זוהה מסלול %s ללא סכום — יש להשלים ידנית.", track.hebrewName()));
            }
            tracks.add(new ParsedTrack(track, track.hebrewName(), amount == null ? 0 : amount,
                    rate, termMonths == null ? 0 : termMonths, line));
        }

        double total = tracks.stream().mapToDouble(ParsedTrack::amount).sum();
        if (tracks.isEmpty()) {
            warnings.add("לא זוהו מסלולי הלוואה במסמך. ניתן להזין את הנתונים ידנית.");
        }
        return new ParsedApproval(List.copyOf(tracks), total, bank, List.copyOf(warnings));
    }

    private TrackType detectTrack(String line) {
        for (Map.Entry<String, TrackType> entry : TRACK_KEYWORDS.entrySet()) {
            if (line.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    /**
     * Prime rows are usually quoted as a margin ("פריים מינוס 0.5"), everything else as an
     * absolute rate. A prime row that also carries an absolute rate keeps the absolute figure.
     */
    private Double detectRate(String line, TrackType track, double primeRate) {
        if (track == TrackType.PRIME) {
            Matcher margin = PRIME_MARGIN.matcher(line.replace("מינוס", "-").replace("פלוס", "+"));
            if (margin.find()) {
                double value = Double.parseDouble(margin.group(2).replace(',', '.')) / 100.0;
                boolean negative = !"+".equals(margin.group(1));
                return Math.max(0, primeRate + (negative ? -value : value));
            }
        }
        Matcher rate = RATE.matcher(line);
        if (rate.find()) {
            return Double.parseDouble(rate.group(1).replace(',', '.')) / 100.0;
        }
        return null;
    }

    private Double detectAmount(String line) {
        Matcher matcher = AMOUNT.matcher(line);
        double best = 0;
        while (matcher.find()) {
            double value = Double.parseDouble(matcher.group(1).replace(",", ""));
            // Terms and percentages never reach six figures; principals always do.
            if (value >= 10_000 && value > best) {
                best = value;
            }
        }
        return best > 0 ? best : null;
    }

    private Integer detectTerm(String line) {
        Matcher months = TERM_MONTHS.matcher(line);
        if (months.find()) {
            return Integer.parseInt(months.group(1));
        }
        Matcher years = TERM_YEARS.matcher(line);
        if (years.find()) {
            return Integer.parseInt(years.group(1)) * 12;
        }
        return null;
    }

    private String detectBank(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        Map<String, String> banks = Map.of(
                "מזרחי", "MIZRAHI",
                "הפועלים", "HAPOALIM",
                "לאומי", "LEUMI",
                "דיסקונט", "DISCOUNT",
                "הבינלאומי", "FIBI",
                "ירושלים", "JERUSALEM");
        for (Map.Entry<String, String> entry : banks.entrySet()) {
            if (lower.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    /**
     * One track row lifted from the document.
     *
     * @param track      the recognised track
     * @param hebrewName display name
     * @param amount     principal, zero when the row carried no readable amount
     * @param annualRate all-in annual rate
     * @param termMonths term, zero when the row carried no readable term
     * @param sourceLine the redacted line the row came from, shown in the verification panel
     */
    public record ParsedTrack(
            TrackType track,
            String hebrewName,
            double amount,
            double annualRate,
            int termMonths,
            String sourceLine) {
    }

    /**
     * The extraction result.
     *
     * @param tracks      recognised track rows
     * @param totalAmount their principal total
     * @param bankCode    the lender, when the document names one
     * @param warnings    Hebrew notes about anything that needs manual confirmation
     */
    public record ParsedApproval(
            List<ParsedTrack> tracks,
            double totalAmount,
            String bankCode,
            List<String> warnings) {
    }
}
