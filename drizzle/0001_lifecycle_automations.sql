-- Migration: Customer lifecycle stage + automation logs
-- Run: pnpm drizzle-kit push  (or Railway auto-runs on deploy)

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "life_cycle_stage" AS ENUM ('prospect', 'active', 'member', 'at_risk', 'churned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "automation_trigger" AS ENUM (
    'review_request',
    'enrollment_offer',
    'estimate_followup_d3',
    'estimate_followup_d7',
    'winback',
    'labor_bank_low'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Customers: lifecycle columns
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "lifeCycleStage" "life_cycle_stage" NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS "lastJobArchivedAt" timestamp;

-- 3. Automation logs table
CREATE TABLE IF NOT EXISTS "automationLogs" (
  "id"          serial PRIMARY KEY,
  "customerId"  varchar(64) NOT NULL,
  "trigger"     "automation_trigger" NOT NULL,
  "referenceId" varchar(64),
  "channel"     varchar(16) NOT NULL DEFAULT 'sms',
  "status"      varchar(16) NOT NULL DEFAULT 'sent',
  "error"       text,
  "firedAt"     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "automationLogs_customerId_trigger"
  ON "automationLogs" ("customerId", "trigger");
