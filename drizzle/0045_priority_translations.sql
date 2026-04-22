-- 0045_priority_translations.sql
--
-- Priority Translation lead magnet: multi-entity schema.
--
--   portal_accounts      (one per email — owns a set of properties)
--       │
--       ▼
--   portal_properties    (one per physical address)
--       │
--       ▼
--   home_health_records  (one per property — the "living health record")
--       │
--       ▼
--   priority_translations (one per submitted inspection report)
--       │
--       └── findings[] stored as jsonb on the record
--
-- Baseline Assessments (Path B.2) will also write to home_health_records,
-- merging into the SAME record for a given property.
--
-- NOTE: 360° memberships and full customer records still live in the
-- primary `customers` table. portal_accounts.customer_id FK links the two
-- once a portal user becomes a paying customer.

BEGIN;

-- ─── portal_accounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_accounts (
  id                 VARCHAR(64) PRIMARY KEY,
  email              VARCHAR(320) NOT NULL UNIQUE,
  first_name         VARCHAR(128) NOT NULL DEFAULT '',
  last_name          VARCHAR(128) NOT NULL DEFAULT '',
  phone              VARCHAR(32)  NOT NULL DEFAULT '',
  customer_id        VARCHAR(64), -- FK → customers(id) once they become a paying customer
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS portal_accounts_email_idx ON portal_accounts(email);
CREATE INDEX IF NOT EXISTS portal_accounts_customer_id_idx ON portal_accounts(customer_id);

-- ─── portal_magic_links ───────────────────────────────────────────────────
-- Passwordless auth tokens (7-day expiry). One-time use.
CREATE TABLE IF NOT EXISTS portal_magic_links (
  token              VARCHAR(128) PRIMARY KEY,
  portal_account_id  VARCHAR(64) NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  expires_at         TIMESTAMP NOT NULL,
  consumed_at        TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_magic_links_account_idx ON portal_magic_links(portal_account_id);

-- ─── portal_properties ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_properties (
  id                 VARCHAR(64) PRIMARY KEY,
  portal_account_id  VARCHAR(64) NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  street             VARCHAR(255) NOT NULL DEFAULT '',
  unit               VARCHAR(64)  NOT NULL DEFAULT '',
  city               VARCHAR(128) NOT NULL DEFAULT '',
  state              VARCHAR(64)  NOT NULL DEFAULT '',
  zip                VARCHAR(10)  NOT NULL DEFAULT '',
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_properties_account_idx ON portal_properties(portal_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_properties_account_zip_street_idx
  ON portal_properties(portal_account_id, street, zip);

-- ─── home_health_records ──────────────────────────────────────────────────
-- One per property. Union of findings from Priority Translations, Baseline
-- Assessments, and any other source. Merge strategy: append new findings,
-- preserve status on existing ones.
CREATE TABLE IF NOT EXISTS home_health_records (
  id                 VARCHAR(64) PRIMARY KEY,
  property_id        VARCHAR(64) NOT NULL REFERENCES portal_properties(id) ON DELETE CASCADE,
  portal_account_id  VARCHAR(64) NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  findings           JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary            TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS home_health_records_property_idx
  ON home_health_records(property_id);

-- ─── priority_translations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_translations (
  id                    VARCHAR(64) PRIMARY KEY,
  portal_account_id     VARCHAR(64) NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  property_id           VARCHAR(64) NOT NULL REFERENCES portal_properties(id) ON DELETE CASCADE,
  home_health_record_id VARCHAR(64)          REFERENCES home_health_records(id) ON DELETE SET NULL,
  -- Source data
  pdf_storage_path      TEXT,        -- e.g. 'priority-translations/<id>.pdf' in volume/R2
  report_url            TEXT,        -- if they gave us a Spectora link instead
  notes                 TEXT,
  -- Lifecycle
  status                VARCHAR(32) NOT NULL DEFAULT 'submitted',
    -- submitted | processing | completed | failed
  claude_response       JSONB,
  output_pdf_path       TEXT,        -- rendered branded roadmap PDF
  delivered_at          TIMESTAMP,
  failure_reason        TEXT,
  -- Meta
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS priority_translations_account_idx ON priority_translations(portal_account_id);
CREATE INDEX IF NOT EXISTS priority_translations_property_idx ON priority_translations(property_id);
CREATE INDEX IF NOT EXISTS priority_translations_status_idx   ON priority_translations(status);

COMMIT;
