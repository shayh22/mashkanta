# Smart Mortgage Comparison & Optimization Platform (Israel)

An independent, data-driven platform for comparing mortgage offers in the Israeli market. It prices
multi-track mixes the way Israeli lenders actually structure them, enforces the Bank of Israel
constraints a proposal has to satisfy, stress tests it against rate and inflation shocks, and scores
it against a market baseline built only from public and crowdsourced data.

It works in three modes, each a tab and a deep link:

| Mode | Link | Question it answers |
| --- | --- | --- |
| 🏠 New mortgage | `#/mortgage` | Which mix should I take, and is the offer I got any good? |
| 🔄 Refinance check | `#/refinance` | What does it cost to repay early, when does switching pay back, and should I stay or move bank? |
| 🔀 Refinance + consolidation | `#/combined` | What do both moves do together — payment, PTI under the October 2026 rules, and one action plan? |
| 🧩 Debt consolidation | `#/consolidation` | Can I fold my consumer loans into the home under the October 2026 rules, how much room is left, and what does the monthly relief cost me over the life of the loan? |

Research behind the new modes — the regulation as read from the circular itself, the fee table, the
market and competitor survey — is in [docs/MARKET_AND_REGULATION_RESEARCH.md](docs/MARKET_AND_REGULATION_RESEARCH.md).
The build plan and its log are [ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md).

Full functional requirements are in [SPECIFICATION.md](SPECIFICATION.md).

---

## What it does

| Capability | Where |
| --- | --- |
| Builds the tailored optimal mix and prices the three Bank of Israel baskets beside it | `engine/optimizer.ts` |
| Prices a mix you were quoted, with regulatory checks, stress tests and a market score | `engine/opportunity.ts` |
| Extracts tracks and rates from an approval-in-principle, stripping identifying data first | `engine/documents.ts` |
| Enforces the Bank of Israel LTV, payment-ratio and track-share limits | `engine/regulatory.ts` |
| Stress tests against four rate shocks, four inflation paths and two combined scenarios | `engine/stress.ts` |
| Ranks every lender on the same mix | `engine/banks.ts` |
| Prices the early repayment fee per the Banking Order: capitalization, seniority discount, notice, CPI, operational | `engine/prepayment.ts` |
| Decides whether refinancing pays — same bank vs. competitor, breakeven month, NPV, verdict, per-track partial refinance | `engine/refinance.ts` |
| Imports the bank's mortgage details statement (פרטי משכנתאות): every sub-loan, balances and the bank's own prepayment fee | `engine/statement.ts` |
| Tests debt consolidation against the home under the 1 October 2026 PTI formula, cumulative LTV 50/70/₪200K, cumulative ⅔ variable and the ₪120K exemption | `engine/consolidation.ts` |
| Refinances and consolidates in one move, re-testing the consolidation against the refinanced mortgage | `engine/combined.ts` |
| Traffic-light risk dials and a prioritised action plan with print/PDF and share | `engine/risk.ts`, `engine/actionPlan.ts` |

The Java service in `backend/` exposes the same capabilities over HTTP (`/api/v1/mortgage/simulate`,
`/optimize`, `/refinance`, `/documents/upload-approval`, `/market-baseline/current`) and is kept as
the reference implementation — see below.

## Running it

The calculator is a static site — no server, no database, nothing to deploy but files.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm test             # 81 tests: engine, stores, action plan end to end
npm run typecheck
npm run lint
npm run build        # -> dist/, ready to upload anywhere

# Browser smoke test: every mode, desktop and 360px phone, light and dark, with axe-core
npx vite preview --port 4173 &
npm run e2e
```

### Deploying to Cloudflare

The whole app is static, so it fits the free tier with no request cap: *"Requests to static assets
are free and unlimited."*

It is configured for **Workers Static Assets**, which is what Cloudflare's build pipeline uses when
the deploy command is `npx wrangler deploy`. `frontend/wrangler.toml` carries:

```toml
main = "worker/index.ts"
routes = [{ pattern = "mashkanta.birkat-hanasi.com", custom_domain = true }]

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*"]
```

Asset requests are served straight from the edge; only `/api/*` runs the Worker script (the live
market data, see below). The app is served at **https://mashkanta.birkat-hanasi.com** — Cloudflare
creates the DNS record and certificate on deploy because the zone is in the same account — and at
https://mashkanta.shayh22.workers.dev.

Build settings in the dashboard:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

**The `name` in wrangler.toml must match your Worker's name**, or the deploy creates a second Worker
called `mashkanta` alongside your project.

`public/_headers` is copied into `dist/` by Vite and is read natively by Workers Static Assets. The
Content-Security-Policy in it was verified against the running app, including pdf.js starting its
worker.

Deploying by hand:

```bash
cd frontend && npm run build && npx wrangler deploy
npx wrangler deploy --dry-run     # validate the config without shipping
```

If you would rather use **Pages** than Workers, change the deploy command to
`npx wrangler pages deploy dist` and delete the `[assets]` block — the two deploy paths read
different configuration and cannot both be described in one file.

### The Java backend

`backend/` is still here and still passes its 65 tests. It is no longer required to run the app — it
is the reference implementation the TypeScript engine was ported from, and
`frontend/src/engine/parity.check.ts` re-verifies the two against each other:

```bash
cd backend && mvn spring-boot:run          # terminal 1
cd frontend && npx tsx src/engine/parity.check.ts   # terminal 2
```

Keep it if you later want server-side features (shared crowdsourced data, saved comparisons); delete
it if you don't.

## Architecture

```
                    ┌──────────────────────────────────────┐
   Browser ─────────│  React 18 + TS + Tailwind (RTL)      │
                    │  Zustand · TanStack Query            │
                    │  ┌────────────────────────────────┐  │
                    │  │  src/engine — the whole model  │  │
                    │  │  amortization · optimizer      │  │
                    │  │  regulation · stress · scoring │  │
                    │  │  PII redaction · PDF parsing   │  │
                    │  └────────────────────────────────┘  │
                    └──────────────────┬───────────────────┘
                                       │ static files only
                            ┌──────────▼──────────┐
                            │  Cloudflare Pages   │
                            └─────────────────────┘

   backend/  — the Java reference implementation the engine was ported from.
               Not required to run the app; kept as the parity target.
```

Everything runs in the browser. That is not a compromise for this app — it is the right shape for
it, because the model is a **stateless calculator**: pure arithmetic with no I/O in the hot path and
no server-side secret. Consequences worth stating:

- **Free and unmetered.** Static assets on Cloudflare have no request cap. A Worker backend was the
  first instinct, but the free Workers plan allows 10 ms of CPU per invocation and the optimizer
  needs ~60 ms — it would not fit. In the browser, 60 ms is imperceptible.
- **No round trip.** Recalculation is instant.
- **The document never leaves the device.** PII redaction used to be a promise about what a server
  did with your identity number; now the file is simply never transmitted.

The engine is deliberately free of browser dependencies, so the same modules can move into a Worker
unchanged if the app ever needs a paid plan and server-side execution.

### Verified against the Java implementation

The port is not "believed equivalent" — it is checked. `parity.check.ts` runs both engines over the
same borrower profiles and diffs the results:

```
worst relative drift across all comparisons: 0.00002992%
```

Lifetime cost matches to the shekel, and the optimizer selects the identical mix at every risk
tolerance from 1 to 10.

The check runs both engines at the Java seed (prime 5.75%). Since October 2026 the browser engine's
own market table and default prime (4.75%) follow the Bank of Israel's August 2026 averages, so the
two **intentionally diverge** in data while the parity check still pins the calculation logic.

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

The consolidation mode applies the rules for a loan secured on a home that is not used to buy it, as
amended by circular H-06-2840 (PTI change in force from 1 October 2026):

| Code | Rule |
| --- | --- |
| `CONS_PTI` | $(P_{new}+E)/(N-F)$ — the existing secured payment $E$ in the numerator; $F$ and $E$ count only loans with more than 18 months left. Blocking above 50%, warning above 40%. Exempt when all-purpose loans on the property total ≤ ₪120,000. |
| `CONS_LTV` | All credit on the property ≤ 50% of value, or ≤ 70% with at most ₪200,000 above 50% (cumulative). |
| `CONS_VARIABLE` | ≤ ⅔ variable across all credit on the property; the excess moves to the fixed track. |

The worked examples published with the change (capacity falling from ₪5,650 to ₪2,650; ₪80,000 of
variable room on a ₪300,000 loan) are unit tests.

Findings are reported, never thrown. A borrower is entitled to see a non-compliant mix and understand
exactly which line breaks it — that is the whole point of an independent comparison tool.

### The interface

Colours are CSS-variable tokens with a separately tuned dark palette; the theme follows the system
until toggled, is applied before first paint by `public/theme-init.js` (an external script, because
the CSP forbids inline ones), and printing always uses the light palette. Chart series were checked
for colour-vision-deficiency separation against both surfaces. The three modes form an ARIA tablist
with right-to-left arrow-key handling.

### Live market data

The app reads the Bank of Israel's statistics service on every load, and again when the ⟳ button in
the header is pressed: the Bank of Israel rate (prime = rate + 1.5), the 5-year inflation expectation
and government yields, and the latest monthly averages on new housing loans and on all-purpose loans
secured on a home, and the average on unsecured consumer loans to households (`BIR`, item A2B1),
which the consolidation screen and action plan measure each debt against. The service does not answer cross-origin browser requests, so a small Worker
(`frontend/worker/index.ts`, the only server code, routed for `/api/*` only) fetches and parses the
CSV files and caches the result at the edge for six hours. `npm run dev` / `vite preview` serve the
same endpoint from a middleware (behind an HTTP proxy, start them with `NODE_USE_ENV_PROXY=1`).

What changes when the figures arrive: the default prime and inflation, each track's rate distribution
(re-centred on the published average, LTV steps and spread kept), the all-purpose loan rates offered
in consolidation (only while they are still the previous defaults — rates typed in from a real offer
are never overwritten), the negotiation targets in the action plan, and the consumer-loan benchmark. The Bank of Israel's
open data has no per-bank rates, so the bank comparison prices each lender around the live average with
an estimated offset, and says so. Every figure is range-checked;
anything missing or implausible falls back to the seeded value below, and the header says which is in
use. The last good set is cached in the browser so the app starts on it.

### Market baseline

The browser build's table (`frontend/src/engine/baseline.ts`, `BASELINE_AS_OF`) is anchored to the
Bank of Israel's average rates on new housing loans, dataset `BIR_MRTG_99` (SDMX API at
`edge.boi.gov.il`), August 2026: each track's distribution is centred on the published average with
its LTV spread kept. Prime-track rows move with the prime rate entered by the user. The Java backend's
table below is the original seed.

Seeded from the Bank of Israel monthly average rate table by LTV bucket, then blended with verified
community observations that survive an outlier screen. Both the median and the top decile are shown:
a borrower who only sees the average has no way of knowing there is a better price to ask for.

`BoIDataIngestionWorker` runs on the Israeli publication calendar — CPI on the 15th at 18:30, the
rate decision polled each weekday afternoon, the bond curve nightly. **Remote fetching is opt-in.**
Without configured feed URLs the platform serves its seeded anchors rather than inventing numbers,
and still re-blends the crowdsourced data nightly.

---

## Privacy engineering

In the browser build the guarantee is structural rather than procedural: **the document is never
transmitted**, so there is no server to trust with it. The pipeline still redacts before parsing, so
identifying data does not reach the parser, the extraction result, or anything the user might export:

1. Text is extracted from the upload into a string.
2. `PiiRedactionService` consumes that string and produces a sanitised one.
3. Everything downstream — the parser, the job record, the market baseline — sees only the sanitised
   string.
4. Nothing is uploaded. In the Java service the upload buffer was additionally zeroed in the same
   method that read it, so the raw document existed for one call and never reached disk.

Identity numbers are validated against the official check digit before redaction. That distinction
matters in both directions: a nine-digit loan reference is not silently destroyed, and a real
identity number is not missed because it appeared without a label.

The `crowd_offer` table has no column for a name, identity number, address or account. Identifying
data is stripped before persistence, and the schema gives it nowhere to land even if a future code
path tried to write it.

---

## Testing

```bash
cd frontend && npm test      # 81 tests (vitest)
cd frontend && npm run e2e   # axe-core, console errors and overflow in a real browser
cd backend  && mvn test      # 65 tests on the reference implementation
```

The TypeScript tests are ports of the Java ones, asserting the same values, so a divergence in
either engine shows up as a failure rather than as a quiet difference in someone's mortgage:

- The engine against textbook annuity values (₪1,000,000 at 5% over 30 years is 5,368.22 a month),
  full amortization to a zero balance, indexation, prime repricing, five-year anchor windows, grace
  and balloon deferral.
- Optimizer invariants: the recommendation is compliant at every risk tolerance, the allocation sums
  to the loan, tolerance moves the mix monotonically, the baskets carry their mandated shares, and an
  infeasible borrower gets an explicit list of what was relaxed.
- The Java suite additionally covers every regulatory threshold in both directions, the refinance
  break-even edge case, and the old HTTP contract end to end.

## Configuration

The static app needs none — the published anchors are seeded constants and every macro assumption is
adjustable in the wizard.

The Java service, if you run it, still reads:

| Property | Default | Purpose |
| --- | --- | --- |
| `app.cors.allowed-origins` | localhost/127.0.0.1 on 5173 and 4173 | Browser origins allowed to call the API. `localhost` and `127.0.0.1` are distinct origins to a browser, so both are listed. |
| `app.ingestion.enabled` | `false` | Opt in to fetching the public feeds. |
| `app.ingestion.cpi-url` / `prime-url` / `bond-url` | empty | Public feed endpoints. Unset means the seeded anchors are kept. |
| `SPRING_PROFILES_ACTIVE=postgres` | — | PostgreSQL with Flyway migrations instead of in-memory H2. |

## Scope and limitations

Worth stating plainly, since this is a financial tool:

- **The seeded rates are representative, not live.** They reflect the shape of the Bank of Israel
  average rate table but are not a feed. Point `app.ingestion.*` at real endpoints before treating
  any number as current.
- **Bank pricing offsets are indicative** positions derived from publicly posted tariffs, not quotes.
  The comparison holds the mix constant across lenders so the ranking reflects pricing alone.
- **The engine models rate paths, not rate forecasts.** Scenarios are parallel shifts; it does not
  model a yield curve, a term structure, or correlated shocks.
- **OCR of scanned documents is not implemented.** The extractor reads the text layer that every
  major Israeli lender's approval carries, and reports clearly when a file is a scan instead of
  silently returning nothing.
- **The platform accesses no private or authenticated banking data**, holds no lender credentials,
  and never authenticates against a bank.

### Specified but not built

Stated plainly so the gap between this repository and SPECIFICATION.md is visible:

- **Authentication and IAM** (§9.2 — OAuth2/OIDC, JWT, RBAC). There are no user accounts: the
  application is anonymous and stateless, and stores nothing that identifies a borrower. Adding
  accounts is a prerequisite for the advisor and admin roles the specification describes.
- **Immutable audit logging** (§9.2). Not implemented.
- **Kubernetes manifests and horizontal pod autoscaling** (§8.1). Docker images and a compose file
  are provided; the cluster topology is not.
- **OCR of scanned documents** (§3.2.3). Only the text layer is read. `TextExtractor` reports a scan
  explicitly rather than returning an empty extraction, so wiring in Tesseract or a vision model is
  a matter of implementing one seam.
- **Competitor aggregator benchmarking** (§3.2.2). Not implemented.
- **Redis** (§8.2). Not applicable to the static build; the baseline table is a constant compiled
  into the bundle.
- **Live rate ingestion in the browser build.** The scheduled Bank of Israel and CBS ingestion lives
  in the Java service. The static app ships the seeded table and lets the borrower override prime and
  inflation, which is honest but not live. Wiring it up means either running the Java service or
  publishing a small JSON feed the app fetches at startup.
- **Crowdsourced submissions** are not wired into the static build. They need somewhere to write; a
  Worker plus D1 would fit the free plan comfortably, since a single insert costs about a
  millisecond of CPU.

One deliberate deviation: §6.2 specifies parallelised Monte Carlo simulation for the optimizer.
The implementation uses exhaustive enumeration over a 5% grid instead, exploiting the linearity of
amortization in principal. It searches the same space in a comparable time budget while being
deterministic — the same inputs always yield the same recommendation, which matters for a tool
borrowers will use to make a decision they cannot easily reverse.

This is a comparison tool built on public data. It is not financial advice.
