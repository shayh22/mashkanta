package il.mashkanta.documents;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PiiRedactionServiceTest {

    private final PiiRedactionService redaction = new PiiRedactionService();

    /** 123456782 satisfies the official check digit; 123456789 does not. */
    private static final String VALID_ID = "123456782";
    private static final String INVALID_ID = "123456789";

    @Test
    @DisplayName("The check digit decides what counts as an identity number")
    void checkDigitValidation() {
        assertThat(PiiRedactionService.isValidIsraeliId(VALID_ID)).isTrue();
        assertThat(PiiRedactionService.isValidIsraeliId(INVALID_ID)).isFalse();
        assertThat(PiiRedactionService.isValidIsraeliId("12345")).isFalse();
        assertThat(PiiRedactionService.isValidIsraeliId(null)).isFalse();
    }

    @Test
    @DisplayName("A real identity number is stripped and a nine-digit reference is preserved")
    void identityNumbersAreRedactedButReferencesSurvive() {
        String text = "תעודת זהות " + VALID_ID + " מספר בקשה " + INVALID_ID;

        PiiRedactionService.RedactionResult result = redaction.redact(text);

        assertThat(result.sanitizedText()).doesNotContain(VALID_ID);
        assertThat(result.sanitizedText()).contains(INVALID_ID);
        assertThat(result.byCategory()).containsEntry("NATIONAL_ID", 1);
    }

    @Test
    @DisplayName("Names and addresses are masked but their labels stay readable")
    void namesAndAddressesAreMasked() {
        String text = """
                שם הלווה: ישראל ישראלי
                כתובת: הרצל 15, תל אביב
                מסלול קבועה לא צמודה 500,000 ש"ח בריבית 4.95%
                """;

        PiiRedactionService.RedactionResult result = redaction.redact(text);

        assertThat(result.sanitizedText()).doesNotContain("ישראל ישראלי");
        assertThat(result.sanitizedText()).doesNotContain("הרצל 15");
        assertThat(result.sanitizedText()).contains("שם הלווה");
        // The commercial terms must survive: they are the reason the document was uploaded.
        assertThat(result.sanitizedText()).contains("4.95%").contains("500,000");
    }

    @Test
    @DisplayName("Phones, emails and account numbers are stripped")
    void contactAndAccountDetailsAreStripped() {
        String text = "טלפון 050-1234567 מייל borrower@example.com חשבון: 12-345-678901";

        PiiRedactionService.RedactionResult result = redaction.redact(text);

        assertThat(result.sanitizedText())
                .doesNotContain("050-1234567")
                .doesNotContain("borrower@example.com")
                .doesNotContain("345-678901");
        assertThat(result.spanCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("Empty input is handled without allocating a result")
    void emptyInputIsSafe() {
        assertThat(redaction.redact(null).spanCount()).isZero();
        assertThat(redaction.redact("   ").sanitizedText()).isEmpty();
    }
}
