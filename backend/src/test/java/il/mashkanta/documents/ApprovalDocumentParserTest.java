package il.mashkanta.documents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;

import il.mashkanta.domain.TrackType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApprovalDocumentParserTest {

    private final ApprovalDocumentParser parser = new ApprovalDocumentParser();

    /** The shape of a standardised approval-in-principle, already through redaction. */
    private static final String APPROVAL = """
            בנק מזרחי טפחות בע"מ
            אישור עקרוני אחיד למשכנתא
            שם הלווה: [REDACTED]
            מסלול קבועה לא צמודה 600,000 ש"ח ל-300 חודשים בריבית 4.95%
            מסלול קבועה צמודה 400,000 ש"ח ל-300 חודשים בריבית 3.15%
            מסלול פריים 500,000 ש"ח ל-300 חודשים פריים מינוס 0.50
            סה"כ ההלוואה 1,500,000 ש"ח
            """;

    @Test
    @DisplayName("Every track row is lifted with its amount, rate and term")
    void parsesTheTrackTable() {
        ApprovalDocumentParser.ParsedApproval parsed = parser.parse(APPROVAL, 0.0575);

        assertThat(parsed.bankCode()).isEqualTo("MIZRAHI");
        assertThat(parsed.tracks()).hasSize(3);

        ApprovalDocumentParser.ParsedTrack fixed = parsed.tracks().get(0);
        assertThat(fixed.track()).isEqualTo(TrackType.FIXED_UNLINKED);
        assertThat(fixed.amount()).isEqualTo(600_000);
        assertThat(fixed.annualRate()).isCloseTo(0.0495, offset(1e-9));
        assertThat(fixed.termMonths()).isEqualTo(300);

        assertThat(parsed.tracks().get(1).track()).isEqualTo(TrackType.FIXED_LINKED);
        assertThat(parsed.totalAmount()).isEqualTo(1_500_000);
    }

    @Test
    @DisplayName("A prime row quoted as a margin is resolved into an all-in rate")
    void resolvesPrimeMinusQuotes() {
        ApprovalDocumentParser.ParsedApproval parsed = parser.parse(APPROVAL, 0.0575);

        ApprovalDocumentParser.ParsedTrack prime = parsed.tracks().get(2);

        assertThat(prime.track()).isEqualTo(TrackType.PRIME);
        assertThat(prime.annualRate()).isCloseTo(0.0525, offset(1e-9));
    }

    @Test
    @DisplayName("The more specific track name wins over the shorter one it contains")
    void prefersTheMoreSpecificTrackName() {
        ApprovalDocumentParser.ParsedApproval parsed =
                parser.parse("מסלול משתנה צמודה 300,000 ש\"ח ל-240 חודשים בריבית 2.65%", 0.0575);

        assertThat(parsed.tracks()).hasSize(1);
        assertThat(parsed.tracks().get(0).track()).isEqualTo(TrackType.VARIABLE_LINKED);
    }

    @Test
    @DisplayName("Prose without a rate produces no phantom track")
    void ignoresNarrativeLines() {
        ApprovalDocumentParser.ParsedApproval parsed = parser.parse(
                "האישור העקרוני בתוקף ל-24 יום. מסלול פריים כפוף לשינויי ריבית בנק ישראל.", 0.0575);

        assertThat(parsed.tracks()).isEmpty();
        assertThat(parsed.warnings()).isNotEmpty();
    }

    @Test
    @DisplayName("An empty document reports a warning rather than failing")
    void emptyDocumentWarns() {
        assertThat(parser.parse("", 0.0575).warnings()).isNotEmpty();
    }
}
