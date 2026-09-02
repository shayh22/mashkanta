-- Anonymised community observations that keep the market baseline current between the Bank of
-- Israel's monthly publications.
--
-- The table deliberately has no column for a borrower name, identity number, address or account:
-- identifying data is stripped in memory before persistence, and the schema gives it nowhere to
-- land even if a future code path tried to write it.
CREATE TABLE crowd_offer (
    id           UUID         NOT NULL PRIMARY KEY,
    bank_code    VARCHAR(32),
    track        VARCHAR(32)  NOT NULL,
    ltv_tier     VARCHAR(32)  NOT NULL,
    ltv          DOUBLE PRECISION NOT NULL,
    annual_rate  DOUBLE PRECISION NOT NULL,
    term_months  INTEGER      NOT NULL,
    dti_band     VARCHAR(16),
    observed_on  DATE         NOT NULL,
    ocr_verified BOOLEAN      NOT NULL DEFAULT FALSE,
    verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP    NOT NULL
);

-- The baseline rebuild groups by track and LTV bucket over a rolling window, which is exactly
-- what these two indexes serve.
CREATE INDEX idx_crowd_offer_track_tier ON crowd_offer (track, ltv_tier);
CREATE INDEX idx_crowd_offer_observed ON crowd_offer (observed_on);

-- Lifecycle records for approval-in-principle extractions. Only the sanitised result is stored;
-- the uploaded document itself is never written to disk or to this table.
CREATE TABLE document_job (
    id             UUID        NOT NULL PRIMARY KEY,
    status         VARCHAR(16) NOT NULL,
    file_kind      VARCHAR(16),
    size_bytes     BIGINT,
    submitted_at   TIMESTAMP   NOT NULL,
    completed_at   TIMESTAMP,
    redacted_spans INTEGER,
    result_json    TEXT,
    error_message  VARCHAR(512)
);
