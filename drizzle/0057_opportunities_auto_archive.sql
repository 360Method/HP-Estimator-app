-- 0057_opportunities_auto_archive.sql
-- Track reason an opportunity was archived so the auto-archive-lost job can
-- find its own rows and so manual archives are preserved.
ALTER TABLE `opportunities` ADD COLUMN `archivedReason` varchar(32);
