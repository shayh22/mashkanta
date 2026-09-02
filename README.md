# Smart Mortgage Comparison & Optimization Platform (Israel)

An independent, data-driven platform for comparing mortgage offers in the Israeli market. It prices
multi-track mixes the way Israeli lenders actually structure them, enforces the Bank of Israel
constraints a proposal has to satisfy, stress tests it against rate and inflation shocks, and scores
it against a market baseline built only from public and crowdsourced data.

Full functional requirements are in [SPECIFICATION.md](SPECIFICATION.md).

---

## What it does

| Capability | Where |
| --- | --- |
| Prices a mix you were quoted, with regulatory checks, stress tests and a market score | `POST /api/v1/mortgage/simulate` |
| Builds the tailored optimal mix and prices the three Bank of Israel baskets beside it | `POST /api/v1/mortgage/optimize` |
| Tests whether refinancing pays, net of the early repayment fee | `POST /api/v1/mortgage/refinance` |
| Extracts tracks and rates from an approval-in-principle, stripping identifying data first | `POST /api/v1/documents/upload-approval` |
| Serves the market rate distribution by track and LTV bucket | `GET /api/v1/market-baseline/current` |
| Accepts anonymised community observations of real offers | `POST /api/v1/community/offers` |

Interactive API documentation is served at `/swagger-ui.html` when the backend is running.

---

## Running it

### Everything at once

```bash
docker compose up --build
```

The frontend is then on <http://localhost:8081> and the API on <http://localhost:8080>. nginx proxies
`/api` to the backend, so the browser sees a single origin and CORS is not involved.

### Backend on its own

```bash
cd backend
mvn spring-boot:run          # H2 in memory, schema created at startup
mvn test                     # 65 tests
```

With PostgreSQL instead:

```bash
SPRING_PROFILES_ACTIVE=postgres \
DATABASE_URL=jdbc:postgresql://localhost:5432/mashkanta \
DATABASE_USER=mashkanta DATABASE_PASSWORD=secret \
mvn spring-boot:run          # Flyway owns the schema; Hibernate only validates it
```

### Frontend on its own

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173, proxies /api to localhost:8080
npm run build && npm run preview
npm run typecheck
```

---

## Architecture

```
                         ┌──────────────────────────────┐
   Browser ──────────────│  React 18 + TS + Tailwind    │
   (RTL, Hebrew)         │  Zustand · TanStack Query    │
                         └──────────────┬───────────────┘
                                        │ /api (same origin via nginx)
                         ┌──────────────▼───────────────┐
                         │   Spring Boot 3.3 · Java 21  │
                         ├──────────────────────────────┤
                         │ AmortizationEngine  (pure)   │
                         │ OptimizationService (search) │
                         │ RegulatoryValidationService  │
                         │ StressTestService            │
                         │ MarketBaselineService        │
                         │ DocumentProcessingService    │
                         └───────┬──────────────┬───────┘
                                 │              │
                    ┌────────────▼───┐    ┌─────▼──────────────┐
                    │  PostgreSQL    │    │ Public data feeds  │
                    │  (anonymised)  │    │ BoI · CBS · TASE   │
                    └────────────────┘    └────────────────────┘
```

### The calculation engine

`AmortizationEngine` is pure and stateless: it takes a `TrackSpec` and a `MacroScenario` and returns
the schedule. Every track is built the same way — index the balance, accrue interest on the indexed
balance, then apply the method's payment rule — which is what makes the Israeli behaviours fall out
naturally rather than needing special cases:

- A **fixed non-linked** track produces a flat payment, because recomputing the annuity from an
  unchanged balance and rate gives the same number every month.
- A **CPI-linked** track produces the growing payment Israeli borrowers actually see, because the
  balance is re-valued before the annuity is recomputed.
- A **prime** track reprices the moment the scenario's prime rate moves.
- A **variable** track holds its anchor for the whole five-year window and only resets at the
  boundary — so a shock landing in month 37 does not touch the payment until month 61.

Nominal and real IRR (*ריבית כוללת מתואמת*) are solved by bisection rather than Newton's method: the
payment vector of an indexed mortgage is not smooth, and bisection cannot diverge on cash flows with
a single sign change.

### The optimizer

`OptimizationService` searches the whole allocation space on a 5% grid rather than hill-climbing.
That is affordable because **every amortization output is linear in principal**: each candidate track
is priced once at unit principal, and a mix is then a weighted sum of those unit vectors. The search
costs a few million floating point operations instead of tens of thousands of schedule builds, and —
unlike a heuristic — it is deterministic and cannot settle in a local minimum.

Hard constraints, in the order they are relaxed when nothing is feasible:

1. Bank of Israel share rules — at most ⅔ prime, at most ⅔ rate-sensitive, at least ⅓ fixed to maturity
2. The borrower's own caps, derived from their risk tolerance
3. Affordability — the 40% payment-to-income ceiling
4. The borrower's stated volatility absorption capacity

Whatever had to be relaxed is reported in `relaxedConstraints` and shown prominently in the UI. The
platform never presents an infeasible mix as if it were a recommendation.

The objective normalises lifetime cost and stressed payment increase across the feasible set before
weighting them, so neither dominates the other just by having larger units. The weights come from the
borrower's risk tolerance, and the mapping is monotonic by construction: one notch up the slider
always buys more cost weight and a looser variable cap, never a surprise.

**The stress scoring is deliberately independent of the borrower's own inflation forecast.** A
borrower who expects 1% inflation but can only absorb ₪1,500 a month still gets no CPI-linked
principal, because if they are wrong the payment breaks their budget. A stress test anchored to the
user's optimism is not a stress test.

### Regulatory model

Encoded in `RegulatoryLimits` and checked by `RegulatoryValidationService`, one stable finding code
per rule so the frontend can key off it:

| Code | Rule |
| --- | --- |
| `LTV` | 75% first home, 70% upgrader, 50% investor, 70% refinance (Directive 329) |
| `DTI` | Green ≤30%, amber 30–40%, blocking >40% |
| `DTI_STRESS` | The same ratio measured at the worst stressed payment |
| `TERM` | 30 year maximum |
| `PRIME_SHARE` | Prime at most ⅔ of the loan |
| `VARIABLE_SHARE` | At most ⅔ may reprice within five years |
| `FIXED_FLOOR` | At least ⅓ fixed until maturity |

Findings are reported, never thrown. A borrower is entitled to see a non-compliant mix and understand
exactly which line breaks it — that is the whole point of an independent comparison tool.

### Market baseline

Seeded from the Bank of Israel monthly average rate table by LTV bucket, then blended with verified
community observations that survive an outlier screen. Both the median and the top decile are shown:
a borrower who only sees the average has no way of knowing there is a better price to ask for.

`BoIDataIngestionWorker` runs on the Israeli publication calendar — CPI on the 15th at 18:30, the
rate decision polled each weekday afternoon, the bond curve nightly. **Remote fetching is opt-in.**
Without configured feed URLs the platform serves its seeded anchors rather than inventing numbers,
and still re-blends the crowdsourced data nightly.

---

## Privacy engineering

The document pipeline's ordering *is* the security control, not a policy on top of one:

1. Text is extracted from the upload into a string.
2. `PiiRedactionService` consumes that string and produces a sanitised one.
3. Everything downstream — the parser, the job record, the market baseline — sees only the sanitised
   string.
4. The upload buffer is zeroed in the same method that read it, so the raw document exists for the
   duration of one call and is never written to disk or to the database.

Identity numbers are validated against the official check digit before redaction. That distinction
matters in both directions: a nine-digit loan reference is not silently destroyed, and a real
identity number is not missed because it appeared without a label.

The `crowd_offer` table has no column for a name, identity number, address or account. Identifying
data is stripped before persistence, and the schema gives it nowhere to land even if a future code
path tried to write it.

---

## Testing

```bash
cd backend && mvn test        # 65 tests
cd frontend && npm run typecheck
```

The backend suite covers:

- The engine against textbook annuity values (₪1,000,000 at 5% over 30 years is 5,368.22 a month),
  full amortization to a zero balance, indexation, prime repricing, five-year anchor windows, grace
  and balloon deferral.
- Every regulatory threshold, in both the passing and the breaching direction.
- Optimizer invariants: the recommendation is compliant at every risk tolerance, the allocation sums
  to the loan, tolerance moves the mix monotonically, the baskets carry their mandated shares, and an
  infeasible borrower gets an explicit list of what was relaxed.
- The refinance edge case worth knowing about: refinancing at exactly the rate the break fee is
  discounted at is a **wash** — the discounting fee is defined as the lender's lost present value at
  that rate, so the borrower hands the entire gain straight back. A refinance only pays when the new
  rate beats the published average the fee is computed against.
- The API contract end to end, including that an uploaded approval comes back with its identifying
  data already gone.

---

## Configuration

| Property | Default | Purpose |
| --- | --- | --- |
| `app.cors.allowed-origins` | localhost/127.0.0.1 on 5173 and 4173 | Browser origins allowed to call the API. `localhost` and `127.0.0.1` are distinct origins to a browser, so both are listed. |
| `app.ingestion.enabled` | `false` | Opt in to fetching the public feeds. |
| `app.ingestion.cpi-url` / `prime-url` / `bond-url` | empty | Public feed endpoints. Unset means the seeded anchors are kept. |
| `SPRING_PROFILES_ACTIVE=postgres` | — | PostgreSQL with Flyway migrations instead of in-memory H2. |
| `VITE_API_BASE_URL` | empty | Absolute API origin for the frontend. Empty means same-origin. |

---

## Scope and limitations

Worth stating plainly, since this is a financial tool:

- **The seeded rates are representative, not live.** They reflect the shape of the Bank of Israel
  average rate table but are not a feed. Point `app.ingestion.*` at real endpoints before treating
  any number as current.
- **Bank pricing offsets are indicative** positions derived from publicly posted tariffs, not quotes.
  The comparison holds the mix constant across lenders so the ranking reflects pricing alone.
- **The engine models rate paths, not rate forecasts.** Scenarios are parallel shifts; it does not
  model a yield curve, a term structure, or correlated shocks.
- **OCR of scanned documents is not implemented.** `TextExtractor` reads the text layer that every
  major Israeli lender's approval carries, and reports clearly when a file is a scan instead of
  silently returning nothing.
- **The platform accesses no private or authenticated banking data**, holds no lender credentials,
  and never authenticates against a bank.

This is a comparison tool built on public data. It is not financial advice.
