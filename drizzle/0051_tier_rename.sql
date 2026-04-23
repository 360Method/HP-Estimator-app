-- 0051_tier_rename.sql
-- Tier display labels renamed Essential/Full Coverage/Maximum Protection ->
-- Bronze/Silver/Gold. DB keys (bronze/silver/gold) are unchanged. No schema
-- changes. No-op marker so the migration sequence stays aligned with the
-- port-batch-1 feature set.
SELECT 1;
