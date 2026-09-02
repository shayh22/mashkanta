# Software Requirements & Technical Specification Document
## Smart Mortgage Comparison & Optimization Platform (Israel)
**Document Identifier:** SPECIFICATION.md
**Version:** 1.0.0
**Status:** Approved for Implementation
**Target Region & Regulatory Scope:** Israel (Bank of Israel Guidelines 2022–2026, Privacy Protection Regulations 5777-2017)

---

## 1. Executive Summary

### 1.1 Vision & Core Purpose
The Israeli mortgage market has historically been characterized by high information asymmetry, complex multi-track borrowing structures, and non-transparent bank pricing models. While the Bank of Israel (BoI) introduced landmark regulatory reforms requiring commercial lenders to present three standardized baskets (סלים אחידים) alongside custom proposals, comparing offers across multiple institutions remains burdensome and mathematically opaque for prospective borrowers.

The **Smart Mortgage Comparison & Optimization Platform** is an independent, objective, data-driven web application designed to bring complete transparency to mortgage borrowing in Israel. The platform aggregates public regulatory rate data, official economic anchors, and crowdsourced market offers to establish a dynamic market baseline. By pairing this baseline with an interactive, risk-aware recommendation engine, the application empowers borrowers to evaluate offers "apples-to-apples," simulate stress conditions, and secure substantial lifetime interest savings.

### 1.2 Core Objectives
- **Objective Market Benchmarking:** Deliver a dynamic baseline database mapping actual interest rate spreads across major Israeli commercial banks and non-bank lenders.
- **Regulatory Reform Alignment:** Fully integrate the Bank of Israel 2022–2026 standardized basket framework (Baskets 1, 2, and 3) while computing personalized optimal loan mixes (תמהיל אופטימלי).
- **Automated Offer Ingestion:** Provide an intelligent OCR and document parsing pipeline to extract interest rates, spreads, and terms directly from official Approval-in-Principle documents (אישור עקרוני אחיד) with instant PII anonymization.
- **Dynamic Risk Profiling:** Go beyond static income-to-loan ratios by factoring in user-specific risk tolerance, liquidity horizons (e.g. Keren Hishtalmut maturation), and volatility absorption capacities.
- **Ultra-Responsive Performance:** Provide sub-50ms recalculations of amortization schedules, internal rates of return (IRR), and scenario stress tests within an intuitive Right-to-Left (RTL) interface.

---

## 2. Target Market Segments & User Personas

The system caters to four primary borrowing segments in Israel, each governed by specific regulatory Loan-to-Value (LTV) caps and financial risk profiles:

### 2.1 Segment Breakdown

| Segment Code | Segment Name (Hebrew / English) | Regulatory LTV Ceiling | Key Demographics & Financial Objectives | Critical System Features |
| :--- | :--- | :--- | :--- | :--- |
| **SEG-01** | First-Time Homebuyers<br>*(רוכשי דירה ראשונה)* | **75%** | Young families, couples, and individuals purchasing their sole residential property. Characterized by limited equity, high LTV, and sensitivity to initial monthly payments. | Government subsidized eligibility calculators (*זכאות משרד הבינוי והשיכון*), strict DTI validation (<30%), and long-term stability safeguards. |
| **SEG-02** | Move-Up Buyers / Upgraders<br>*(משפרי דיור)* | **70%** | Existing homeowners selling a primary property to buy a larger home. Frequently require bridging solutions (*הלוואות גישור / גרייס / בלון*) during the transition. | Multi-asset equity mapping, bridge financing calculators, transition cash flow simulation, and prepayment penalty optimization. |
| **SEG-03** | Real Estate Investors<br>*(משקיעי נדל"ן)* | **50%** | Individuals purchasing a second or additional residential property. Motivated by rental yields, tax efficiency, cash-flow coverage, and interest deductibility. | Net yield analysis, rental income coverage matching, sensitivity to floating rates, and capital exit modeling. |
| **SEG-04** | Refinancing Borrowers<br>*(ממחזרי משכנתא)* | **50% – 70%** | Existing mortgage holders seeking to exploit lower market spreads, remove high CPI exposure, shorten terms, or consolidate debt. | Direct differential comparison vs. current schedule, prepayment fee (*עמלת פירעון מוקדם*) breakeven analysis, net NPV of refinancing. |

---

## 3. Data Collection Strategy Using Public Sources

To address the reality of a closed banking ecosystem in Israel (where proprietary commercial bank APIs are unavailable to third parties), the platform implements an ethical, robust multi-tiered data ingestion pipeline operating strictly over publicly available data and verified crowdsourcing.

### 3.1 Strict Public Data Policy (Public Data Only)
The platform strictly gathers and processes data that is publicly accessible on the open web. It enforces an absolute prohibition against accessing, scraping, or storing private, confidential, or authenticated banking data.

### 3.2 Ingestion Architecture & Data Sources

```
+-----------------------------------------------------------------------------------+
|                           PUBLIC DATA INGESTION ENGINE                            |
+-----------------------------------------------------------------------------------+
       |                                |                                 |
       v                                v                                 v
[Regulatory Portals]          [Financial Markets & Banks]      [Crowdsourcing & Documents]
- Bank of Israel (BoI)        - Commercial Bank Tariffs        - User-Submitted Offers
  * Monthly Avg Rates (LTV)     * Hapoalim, Leumi, Mizrahi,    - OCR / PDF Approval-in-Principle
  * Prime Decisions (8x/yr)       Discount, FIBI, Jerusalem      * Instant PII Redaction
  * Gov Bond Anchors / MAKAM  - TASE / Maya Bond Yields        - Community Trackers
- MoCH Subsidy Points         - Competitor Public Calculators    * Verified Spreads
- CBS (CPI / Housing Index)     (Wizer, Mashkantaman, WiFix)
       |                                |                                 |
       +--------------------------------+---------------------------------+
                                        |
                                        v
                    [Data Normalization & Outlier Filtering]
                                        |
                                        v
                    [Dynamic Market Baseline Store (PostgreSQL)]
```

#### 3.2.1 Government & Regulatory Portals
1. **Bank of Israel (בנק ישראל):**
   - **Monthly Average Rates Table (*קו המשווה*):** Ingestion of average monthly rates granted across all commercial banks, categorized by LTV tiers (<=45%, 45%-60%, >60%) and track types (Fixed Non-Linked, Fixed Linked, Variable Non-Linked, Variable Linked, Prime).
   - **Prime Interest Announcements:** Triggered synchronization 8 times per year immediately upon BoI monetary policy releases.
   - **Government Bond Yield Anchors & MAKAM:** Ingestion of 5-year non-linked and linked government bond yields used as benchmark anchors for adjustable-rate tracks.
2. **Ministry of Construction and Housing (*משרד הבינוי והשיכון*):**
   - Subsidized loan eligibility point systems (*ניקוד זכאות*), base entitlement amounts, and regulated discounted interest rates.
3. **Central Bureau of Statistics (*למ"ס - הלשכה המרכזית לסטטיסטיקה*):**
   - Consumer Price Index (CPI / *מדד המחירים לצרכן*) published on the 15th of each month at 18:30.
   - Construction Inputs Index and National Housing Price Indices for inflation modeling.

#### 3.2.2 Official Financial Portals & Competitor Aggregators
- **Commercial Bank Tariff Schedules:** Automated scheduled ingestion of publicly posted base interest rate tariffs and campaign announcements across Bank Hapoalim, Bank Leumi, Mizrahi-Tefahot, Discount Bank, First International Bank of Israel (FIBI), and Bank of Jerusalem.
- **Tel Aviv Stock Exchange (TASE / MAYA):** Real-time tracking of sovereign bond curve shifts affecting 5-year adjustment pegs.
- **Public Aggregator Benchmarking:** Ethical monitoring of public calculators and web aggregators (e.g. Wizer, Mashkantaman, WiFix) to identify active marketing promotions and benchmark margins.

#### 3.2.3 Crowdsourced Ground-Truth & Document Pipeline
- **Community Contribution Portal:** Structured, anonymous web form allowing borrowers to submit verified terms received from banks (Bank name, loan track, spread above anchor, LTV bracket, DTI, loan duration, date).
- **OCR & Vision Ingestion Pipeline:** Automated parsing of standardized Approval-in-Principle PDF documents (*אישור עקרוני אחיד*). Identifies exact track distributions, anchors, and discretionary bank spreads (*מרווח הבנק*).
- **Automated PII Stripping:** The ingestion pipeline enforces immediate stripping of Israeli National IDs (*תעודות זהות*), borrower names, and physical addresses at memory-buffer level prior to database persistence.
- **Outlier Cleaning & Confidence Scoring:** Statistical deviation checks against current BoI averages. High-confidence weighting is assigned to OCR-verified files; manual inputs receive secondary weighting.

---

## 4. Interactive Customer Data Inputs

The application utilizes a guided, multi-step onboarding wizard to collect user inputs without cognitive friction, calculating real-time financial metrics on the client side.

```
Step 1: Property & Loan   -->   Step 2: Borrower Profile   -->   Step 3: Risk & Preferences
- Property Value (ILS)         - Monthly Net Income (ILS)      - Risk Tolerance (1-10)
- Requested Mortgage (ILS)     - Existing Obligations (ILS)    - Max Monthly Volatility (ILS)
- Loan Term (10-30 Years)      - Buyer Classification          - Liquidity Events (Horizon)
- Macro Anchors (Prime/CPI)    - Automatic LTV / DTI Checks    - Track Preference Allocation
```

### 4.1 Input Field Specifications

| Category | Input Parameter | Control Type | Validation Rules & Defaults | Contextual Micro-Copy / Badges |
| :--- | :--- | :--- | :--- | :--- |
| **Property & Loan** | Property Valuation (*שווי נכס*) | Formatted Number Input / Slider | ₪500,000 to ₪20,000,000 (Step: ₪10,000) | Live formatting with thousands separators |
| | Loan Amount Requested (*סכום מבוקש*) | Formatted Number Input / Slider | ₪100,000 to ₪15,000,000 (Bounded by LTV) | Dynamically bounded by borrower segment |
| | Loan Duration (*תקופת הלוואה*) | Segmented Slider / Stepper | 4 to 30 years (Standard steps of 5 years) | Visual term slider showing long-term impact |
| | Macro Assumptions | Numerical Inputs / Defaults | BoI Prime (Default: 5.75%), CPI (Default: 2.4%) | Auto-fetched from latest BoI / CBS sync |
| **Borrower Profile** | Monthly Household Net Income | Formatted Currency Input | Minimum ₪5,000; strictly validated | Combines co-borrower / spouse net income |
| | Existing Monthly Debt Obligations | Formatted Currency Input | Default ₪0; loans maturing >18 months counted | Essential for accurate DTI calculation |
| | Buyer Classification | Segmented Button Group | Single selection: First Home / Upgrader / Investor | Auto-sets regulatory LTV threshold warning |
| **Risk & Preferences** | Risk Tolerance Score | Gamified Rating Slider | Scale 1 (Ultra Conservative) to 10 (Dynamic) | Visual indicator of interest risk appetite |
| | Volatility Absorption Capacity | Currency Stepper / Slider | ₪0 to ₪10,000 above baseline payment | "Max acceptable monthly payment increase" |
| | Liquidity Horizon & Cashflows | Interactive Timeline Form | Future lump sums (Date, Expected Amount, Source) | Models Keren Hishtalmut, bonus, inheritance |
| | Track Allocation Weights | 3-Way Linked Sliders | 100% total sum: Prime / Stable / Dynamic | Live visual preview of recommended mix |

---

## 5. Risk-Based Analysis & Regulatory Criteria

### 5.1 Regulatory Constraint Validation
The analysis engine enforces strict Bank of Israel regulatory directives:

1. **Loan-To-Value (LTV) Limits:**
   - Sole Residence (First-Time Buyer): <= 75%
   - Move-Up Buyer (Upgrader): <= 70%
   - Investment Property: <= 50%
2. **Debt-To-Income / Payment-To-Income (DTI / PTI) Limits:**
   - **Green Zone (<= 30%):** Optimal eligibility; lowest bank risk premium.
   - **Warning Zone (30.1% - 40.0%):** Elevated pricing tier; requires bank management exceptions.
   - **Hard Regulatory Ceiling (> 40.0%):** Immediate blocking alert; legally non-compliant under BoI rules.

### 5.2 Amortization & Simulation Modeling
The calculation engine supports all standard Israeli repayment tables:
- **Spitzer Schedule (*לוח שפיצר*):** Standard annuity calculation accounting for compounding monthly interest and periodic indexation.
- **Equal Principal (*קרן שווה*):** Constant principal amortization with linearly decreasing monthly interest payments.
- **Grace & Balloon (*גרייס ובלון*):** Partial or full interest-only deferrals for bridging scenarios.
- **Internal Rate of Return (IRR / *ריבית כוללת מתואמת*):** True economic cost calculation factoring in all compounding schedules, projected inflation, and fee structures.

### 5.3 Stress Testing & Sensitivity Matrix
Every candidate portfolio is subjected to automated macroeconomic shock simulations:
- **Prime Interest Rate Shocks:** Testing payment sensitivity at +0.5%, +1.0%, +2.0%, and +3.0% increments.
- **CPI Inflation Shocks:** Testing debt balance erosion and monthly payment jumps at annual inflation rates of 1.5%, 3.0%, 4.5%, and 6.0%.
- **Personalized Volatility Breach:** Automated detection if any stress scenario causes the monthly payment to exceed the borrower's defined Volatility Absorption limit.

### 5.4 Standardized Regulatory Baskets vs. Optimal Mix

| Basket Identifier | Track Composition Structure | Primary Characteristics |
| :--- | :--- | :--- |
| **Regulatory Basket 1** (Full Certainty) | 100% Fixed Non-Linked (קל"צ) | Maximum certainty; zero volatility risk; higher initial rate. |
| **Regulatory Basket 2** (Thirds Mix) | 33.3% Prime (פריים), 33.3% Fixed Linked (ק"צ), 33.3% Variable Linked (מ"צ) | Classic market average; moderate initial rate; dual inflation exposure. |
| **Regulatory Basket 3** (Prime + Fixed Non-Linked) | 33.3% Prime (פריים), 66.7% Fixed Non-Linked (קל"צ) | High certainty; zero CPI exposure; single variable anchor. |
| **Recommended Optimal Basket** (*סל אופטימלי מומלץ*) | Dynamic Profile-Tailored Mix across Prime, Fixed, and Variable tracks | Algorithmic balance minimizing total cost while capping volatility risk. |

---

## 6. Technical Specifications: Spring Boot Backend

### 6.1 Architecture Overview
The backend is designed as a stateless, modular microservice architecture built on Java 21 LTS and Spring Boot 3.3+. High-throughput endpoints deliver sub-50ms responses for real-time client simulations.

### 6.2 Key Services & Responsibilities
1. `MortgageCalculationService`:
   - Pure, stateless computational engine.
   - Computes multi-track amortization matrices (Spitzer, Equal Principal, Balloon).
   - Runs parallelized Monte Carlo simulations across interest rate and inflation paths.
   - P99 latency target: <50ms.
2. `CustomerProfilingService`:
   - Processes onboarding questionnaire responses.
   - Computes composite risk tolerance vectors and preference boundaries.
3. `BoIDataIngestionWorker`:
   - Scheduled Quartz / Spring Batch jobs fetching monthly BoI tables, CBS CPI figures, and yield curves.
   - Event-driven hooks triggered on BoI rate announcements.
4. `DocumentProcessingService`:
   - Asynchronous OCR worker pulling files from cloud storage.
   - Leverages Tesseract / Vision LLMs for tabular financial extraction.
   - Executes immediate PII redaction pipeline before database commits.
5. `OpportunityScoringService`:
   - Compares borrower profiles against the dynamic baseline.
   - Calculates market median, top 10% best-in-market spreads, and net potential savings.

### 6.3 RESTful API Endpoints
- `POST /api/v1/mortgage/simulate`: Real-time schedule calculation, IRR, and regulatory checks.
- `POST /api/v1/mortgage/optimize`: Computes optimal customized mix alongside BoI Baskets 1, 2, 3.
- `POST /api/v1/documents/upload-approval`: Uploads PDF approval-in-principle for OCR analysis.
- `GET /api/v1/documents/jobs/{jobId}`: Retrieves extraction status and sanitized terms.
- `GET /api/v1/market-baseline/current`: Fetches real-time market baseline percentiles by LTV tier.

---

## 7. Technical Specifications: React & Tailwind CSS Frontend

### 7.1 Architecture & Tech Stack
- **Framework:** React 18/19 with TypeScript and Vite for near-instant HMR.
- **Styling:** Tailwind CSS 3.4+ configured with native RTL directional plugins (`tailwindcss-rtl`).
- **State Management:**
  - `TanStack Query (React Query v5)` for server-state caching, optimistic updates, and background baseline re-fetching.
  - `Zustand` for ultra-fast, client-side reactive simulation state.
- **Data Visualization:** Recharts / Chart.js for interactive amortization area charts and scenario simulators.

### 7.2 Design System & Visual Principles
- **Aesthetic Direction:** Clean, modern financial dashboard utilizing a card-based layout with soft shadows (`shadow-sm`, `shadow-md`), subtle borders (`border-slate-200/80`), and glassmorphic badges (`backdrop-blur-md`).
- **Typography & RTL:** Full Right-to-Left (RTL) hierarchy styled with Israeli web standard fonts (*Heebo* / *Rubik*), ensuring strict alignment of currency symbols (₪) and tabular numeric figures.
- **Semantic Palette:**
  - Primary / Slate: `#0F172A` (Navy), `#334155` (Slate-700), `#F8FAFC` (Canvas).
  - Status Success: `#10B981` (Emerald-500) for savings, valid regulatory status, and top-tier spreads.
  - Status Warning: `#F59E0B` (Amber-500) for DTI between 30% and 40%.
  - Status Danger: `#EF4444` (Rose-500) for regulatory breaches (LTV >75%, DTI >40%).

### 7.3 Key UI Components
1. **Interactive Onboarding Wizard (`<MortgageWizard />`):** Multi-step progress tracker with contextual tooltips and formatted currency inputs.
2. **Bank Comparison Cards (`<BankComparisonCard />`):** Interactive bank cards ranking lender proposals by initial payment, total cost, IRR, and market share.
3. **Interactive Amortization & Scenario Chart (`<AmortizationChart />`):** Stacked area and line graph displaying principal decay vs. cumulative interest payments.
4. **What-If Sensitivity Simulator (`<ScenarioSimulator />`):** Quick-toggle sliders for BoI rate adjustments and inflation shifts with instant re-rendering.
5. **Drag-and-Drop Document Uploader (`<ApprovalUploader />`):** Accessible drag-and-drop file upload zone for PDF approvals-in-principle with side-by-side verification.
6. **Export & Sharing Module (`<ReportExportModal />`):** Instant client-side PDF export of branded mortgage comparison dossiers and direct WhatsApp/email sharing.

---

## 8. Scalability & System Architecture

### 8.1 Cloud Topology & Infrastructure
- **Containerization & Orchestration:** All services containerized via Docker multi-stage builds and deployed on managed Kubernetes (AWS EKS or GCP GKE).
- **Horizontal Pod Autoscaling (HPA):** Auto-scaling triggers configured on computation pods based on CPU utilization (>70%) and HTTP request queue depths.
- **High Availability & Fault Tolerance:** Multi-Availability Zone (Multi-AZ) active-active deployment across 3 physical zones in the AWS/GCP Israel cloud regions (Tel Aviv), ensuring 99.99% infrastructure availability.
- **Edge Acceleration:** Cloudflare / CloudFront CDN caching static assets, frontend bundles, and pre-computed public baseline aggregates.

### 8.2 Reliability Targets & SLOs
- **Simulation Latency:** P99 < 50ms (measured at API Gateway for pure calculation requests).
- **End-to-End Comparison Latency:** P95 < 250ms (full portfolio generation including DB read-replica queries).
- **OCR Document Parsing:** P90 < 5.0 seconds (asynchronous queue completion time from upload to extraction).
- **System Availability:** 99.9% Monthly Uptime.
- **Cache Hit Ratio:** > 95% for BoI baseline tables and public market rates in Redis.

---

## 9. Security & Compliance (Israeli Regulatory Standards)

### 9.1 Compliance Frameworks
1. **Protection of Privacy Law, 5741-1981 (*חוק הגנת הפרטיות*):** Adherence to data minimization, lawful processing, and customer consent mandates.
2. **Protection of Privacy Regulations (Data Security), 5777-2017 (*תקנות הגנת הפרטיות - אבטחת מידע*):** High Level security classification for financial and credit data handling.
3. **Bank of Israel Directive 361 (*הוראה 361 - ניהול הגנת הסייבר*):** Cyber resilience guidelines, secure API standards, and financial transaction boundary controls.

### 9.2 Data Protection & Privacy Engineering
- **Zero-Knowledge PII Storage for Crowdsourcing:** Optical extraction coordinates for National Identity Numbers (*מספרי תעודת זהות*), full legal names, physical addresses, and bank branch account numbers are purged in volatile memory. Only anonymized deal parameters are stored.
- **Cryptographic Protections:** Enforced TLS 1.3 with HSTS in transit; AES-256 encryption at rest via AWS KMS / GCP Cloud KMS with annual key rotation.
- **Ephemeral Document Storage:** Uploaded approval PDFs stored via short-lived pre-signed URLs (maximum TTL: 10 minutes) and permanently shredded after extraction.
- **Identity & Access Management (IAM):** Stateless OAuth2.0 / OpenID Connect with short-lived JWT tokens, HttpOnly refresh cookies, and RBAC separating Borrowers, Advisors, and Admins.
- **Audit Logging & Tamper Resistance:** Immutable audit trails tracking every read/write action on financial records, streamed to an immutable log lake.
