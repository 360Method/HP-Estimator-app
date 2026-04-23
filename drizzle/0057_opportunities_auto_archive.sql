-- 0057_opportunities_auto_archive.sql
-- Track reason an opportunity was archived so the auto-archive-lost job can find its own rows
-- and so manual archives are preserved (don't un-archive them when re-running the job).

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "archivedReason" varchar(32);
