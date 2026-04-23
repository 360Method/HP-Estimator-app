-- 0051_tier_rename.sql
-- Canonical tier labels are Bronze / Silver / Gold.
-- DB keys (bronze/silver/gold) are unchanged — only display labels were renamed in code.
-- Stripe price IDs remain the same; Stripe product display names need a separate manual update.
-- No schema changes are required for this migration — it's a docs/no-op marker
-- so the migration number sequence stays aligned with the port-batch-1 feature set.
SELECT 1 WHERE false;
