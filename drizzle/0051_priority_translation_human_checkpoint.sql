-- 0051_priority_translation_human_checkpoint.sql
--
-- Human checkpoint for Priority Translation pipeline.
--
-- Status flow changes:
--   submitted ──► draft_awaiting_claude ──► draft_awaiting_review
--                 (worker pulls, calls Claude,          ▲
--                  writes findings JSON)                │
--                                                       │
--   Marcin reviews in admin, edits findings, clicks
--   "Send to Customer" ──► ready_to_send ──► sent
--
--   Anywhere in the chain: failed
--
-- New columns: reviewed_by_user_id, reviewed_at, sent_at, review_notes,
-- reminder_sent_at (48h overdue reminder to owner).

BEGIN;

ALTER TABLE priority_translations
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sent_at             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes        TEXT,
  ADD COLUMN IF NOT EXISTS reminder_sent_at    TIMESTAMP;

-- Widen status vocabulary. Still a VARCHAR(32) — validation is at the app layer
-- (see PriorityTranslationStatus in drizzle/schema.priorityTranslation.ts) so
-- we do not need a CHECK constraint migration dance here.
--
-- Accepted values (app-enforced):
--   draft_awaiting_claude | draft_awaiting_review | ready_to_send | sent | failed
--   (legacy: submitted | processing | completed — kept readable for old rows)
ALTER TABLE priority_translations
  ALTER COLUMN status SET DEFAULT 'draft_awaiting_claude';

-- Backfill any legacy rows so the new worker / admin UI queries find them in
-- the right bucket without manual intervention.
UPDATE priority_translations SET status = 'draft_awaiting_claude' WHERE status = 'submitted';
UPDATE priority_translations SET status = 'draft_awaiting_claude' WHERE status = 'processing';
UPDATE priority_translations SET status = 'sent'                  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS priority_translations_reviewed_by_idx ON priority_translations(reviewed_by_user_id);
CREATE INDEX IF NOT EXISTS priority_translations_sent_at_idx     ON priority_translations(sent_at);

COMMIT;
