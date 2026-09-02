package il.mashkanta.api;

import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.awaitility.Awaitility;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class MortgageApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** A representative first-home borrower, matching what the wizard posts. */
    private Map<String, Object> profile() {
        return Map.of(
                "propertyValue", 2_400_000,
                "loanAmount", 1_680_000,
                "termMonths", 300,
                "segment", "FIRST_HOME",
                "monthlyNetIncome", 32_000,
                "existingMonthlyObligations", 1_500,
                "riskTolerance", 5,
                "volatilityCapacity", 1_500);
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    @Test
    @DisplayName("POST /simulate prices a mix, checks it and scores it against the market")
    void simulateReturnsAFullyPricedMix() throws Exception {
        String body = json(Map.of(
                "profile", profile(),
                "tracks", java.util.List.of(
                        Map.of("type", "PRIME", "amount", 560_000, "annualRate", 0.0525),
                        Map.of("type", "FIXED_UNLINKED", "amount", 700_000, "annualRate", 0.0532),
                        Map.of("type", "FIXED_LINKED", "amount", 420_000, "annualRate", 0.0335)),
                "includeSchedule", false));

        mockMvc.perform(post("/api/v1/mortgage/simulate").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mix.totalPrincipal", is(1_680_000.0)))
                .andExpect(jsonPath("$.mix.allocations", hasSize(3)))
                .andExpect(jsonPath("$.mix.initialPayment", greaterThan(0.0)))
                .andExpect(jsonPath("$.mix.nominalIrr", greaterThan(0.0)))
                .andExpect(jsonPath("$.mix.yearly", hasSize(25)))
                .andExpect(jsonPath("$.compliance.ltv", closeTo(0.7, 0.001)))
                .andExpect(jsonPath("$.compliance.findings", hasSize(7)))
                .andExpect(jsonPath("$.stress.scenarios", hasSize(10)))
                .andExpect(jsonPath("$.opportunity.score", notNullValue()))
                .andExpect(jsonPath("$.schedule", hasSize(0)));
    }

    @Test
    @DisplayName("POST /simulate returns the monthly table on request")
    void simulateCanReturnTheFullSchedule() throws Exception {
        String body = json(Map.of(
                "profile", profile(),
                "tracks", java.util.List.of(
                        Map.of("type", "FIXED_UNLINKED", "amount", 1_680_000, "annualRate", 0.0532)),
                "includeSchedule", true));

        mockMvc.perform(post("/api/v1/mortgage/simulate").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule", hasSize(300)))
                .andExpect(jsonPath("$.schedule[0].month", is(1)))
                .andExpect(jsonPath("$.schedule[299].closingBalance", is(0.0)));
    }

    @Test
    @DisplayName("POST /optimize returns the tailored mix, the three baskets and lender pricing")
    void optimizeReturnsTheFullComparison() throws Exception {
        String body = json(Map.of("profile", profile()));

        mockMvc.perform(post("/api/v1/mortgage/optimize").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recommended.id", is("OPTIMAL")))
                .andExpect(jsonPath("$.recommended.recommended", is(true)))
                .andExpect(jsonPath("$.recommended.summary.totalPrincipal", is(1_680_000.0)))
                // A warning is legitimate here — the severe stress scenario pushes this borrower
                // past 40% of income — but nothing may block.
                .andExpect(jsonPath("$.recommended.compliance.level", not(is("BLOCKING"))))
                .andExpect(jsonPath("$.recommended.compliance.findings[?(@.code == 'LTV')].level",
                        contains("OK")))
                // 70% LTV is comfortably inside the 75% first-home ceiling, but this household's
                // payment lands in the 30-40% amber band — both are reported, neither blocks.
                .andExpect(jsonPath("$.recommended.compliance.findings[?(@.code == 'DTI')].level",
                        contains("WARNING")))
                .andExpect(jsonPath("$.baskets", hasSize(3)))
                .andExpect(jsonPath("$.baskets[0].id", is("BASKET_1")))
                .andExpect(jsonPath("$.savings", hasSize(3)))
                .andExpect(jsonPath("$.termSensitivity", hasSize(4)))
                .andExpect(jsonPath("$.bankQuotes", hasSize(6)))
                .andExpect(jsonPath("$.bankQuotes[0].rank", is(1)))
                .andExpect(jsonPath("$.bankQuotes[0].costAboveBest", is(0.0)))
                .andExpect(jsonPath("$.riskProfile.narrative", notNullValue()))
                .andExpect(jsonPath("$.relaxedConstraints", hasSize(0)))
                .andExpect(jsonPath("$.computeMillis", lessThanOrEqualTo(2000)));
    }

    @Test
    @DisplayName("POST /refinance compares an existing mortgage against a replacement")
    void refinanceComparesAgainstTheCurrentLoan() throws Exception {
        String body = json(Map.of(
                "profile", Map.of(
                        "propertyValue", 2_600_000,
                        "loanAmount", 900_000,
                        "termMonths", 180,
                        "segment", "REFINANCE",
                        "monthlyNetIncome", 30_000,
                        "existingMonthlyObligations", 0,
                        "riskTolerance", 4,
                        "volatilityCapacity", 1_000),
                "existing", java.util.List.of(Map.of(
                        "type", "FIXED_UNLINKED",
                        "outstandingBalance", 900_000,
                        "annualRate", 0.062,
                        "remainingMonths", 180,
                        "currentMarketRate", 0.055)),
                "proposed", java.util.List.of(Map.of(
                        "type", "FIXED_UNLINKED", "amount", 900_000, "termMonths", 180, "annualRate", 0.047))));

        mockMvc.perform(post("/api/v1/mortgage/refinance").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.monthlySaving", greaterThan(0.0)))
                .andExpect(jsonPath("$.breakFee", greaterThan(0.0)))
                .andExpect(jsonPath("$.breakevenMonth", greaterThan(0)))
                .andExpect(jsonPath("$.worthwhile", is(true)))
                .andExpect(jsonPath("$.cumulativeSavingPath", hasSize(15)));
    }

    @Test
    @DisplayName("Invalid input is rejected with a field-level explanation, not a stack trace")
    void invalidInputIsRejected() throws Exception {
        String body = json(Map.of(
                "profile", Map.of(
                        "propertyValue", -1,
                        "loanAmount", 1_000_000,
                        "termMonths", 300,
                        "segment", "FIRST_HOME",
                        "monthlyNetIncome", 20_000,
                        "existingMonthlyObligations", 0,
                        "riskTolerance", 99),
                "tracks", java.util.List.of(Map.of("type", "PRIME", "amount", 1_000_000, "annualRate", 0.05))));

        mockMvc.perform(post("/api/v1/mortgage/simulate").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is("VALIDATION_FAILED")))
                .andExpect(jsonPath("$.details", hasSize(greaterThan(0))));
    }

    @Test
    @DisplayName("GET /market-baseline/current exposes the rate distribution and anchors")
    void baselineIsPublic() throws Exception {
        mockMvc.perform(get("/api/v1/market-baseline/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rates", hasSize(18)))
                .andExpect(jsonPath("$.anchors.prime", greaterThan(0.0)))
                .andExpect(jsonPath("$.lastRefreshed", notNullValue()));
    }

    @Test
    @DisplayName("GET /reference gives the wizard its enumerations and regulatory limits")
    void referenceDataIsAvailable() throws Exception {
        mockMvc.perform(get("/api/v1/reference"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks", hasSize(6)))
                .andExpect(jsonPath("$.segments", hasSize(4)))
                .andExpect(jsonPath("$.methods", hasSize(4)))
                .andExpect(jsonPath("$.limits.ptiCeiling", is(0.4)))
                .andExpect(jsonPath("$.redactedCategories", hasSize(6)));
    }

    @Test
    @DisplayName("An uploaded approval is parsed and returned with its identifying data already gone")
    void documentUploadStripsIdentifyingDataBeforeReturningTerms() throws Exception {
        String approval = """
                בנק לאומי לישראל בע"מ - אישור עקרוני אחיד
                שם הלווה: ישראל ישראלי
                תעודת זהות 123456782
                מסלול קבועה לא צמודה 600,000 ש"ח ל-240 חודשים בריבית 4.95%
                מסלול פריים 400,000 ש"ח ל-240 חודשים פריים מינוס 0.50
                """;
        MockMultipartFile file = new MockMultipartFile("file", "approval.txt", "text/plain",
                approval.getBytes(StandardCharsets.UTF_8));

        String response = mockMvc.perform(multipart("/api/v1/documents/upload-approval").file(file)
                        .param("ltv", "0.6").param("contribute", "false"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId", notNullValue()))
                .andReturn().getResponse().getContentAsString();

        String jobId = objectMapper.readTree(response).get("jobId").asText();

        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                mockMvc.perform(get("/api/v1/documents/jobs/" + jobId))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.status", is("COMPLETED"))));

        mockMvc.perform(get("/api/v1/documents/jobs/" + jobId))
                .andExpect(jsonPath("$.redactedSpans", greaterThan(0)))
                .andExpect(jsonPath("$.result.bankCode", is("LEUMI")))
                .andExpect(jsonPath("$.result.tracks", hasSize(2)))
                .andExpect(jsonPath("$.result.tracks[0].amount", is(600_000.0)))
                .andExpect(jsonPath("$.result.tracks[0].annualRate", is(0.0495)))
                .andExpect(jsonPath("$.result.totalAmount", is(1_000_000.0)))
                .andExpect(jsonPath("$.result.redactionsByCategory.NATIONAL_ID", is(1)));
    }

    @Test
    @DisplayName("Non-PDF uploads are refused before anything is buffered")
    void unsupportedUploadsAreRefused() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "offer.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x".getBytes());

        mockMvc.perform(multipart("/api/v1/documents/upload-approval").file(file))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("A plausible community submission is accepted and marked verified")
    void communitySubmissionIsAccepted() throws Exception {
        String body = json(Map.of(
                "bankCode", "DISCOUNT",
                "track", "FIXED_UNLINKED",
                "ltv", 0.62,
                "annualRate", 0.0505,
                "termMonths", 300,
                "dtiBand", "30-40%"));

        mockMvc.perform(post("/api/v1/community/offers").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verified", is(true)));
    }

    @Test
    @DisplayName("An implausible community submission is stored but kept out of the baseline")
    void implausibleSubmissionDoesNotMoveTheBaseline() throws Exception {
        String body = json(Map.of(
                "bankCode", "DISCOUNT",
                "track", "FIXED_UNLINKED",
                "ltv", 0.62,
                "annualRate", 0.005,
                "termMonths", 300));

        mockMvc.perform(post("/api/v1/community/offers").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verified", is(false)));
    }
}
