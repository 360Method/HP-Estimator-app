-- 0078_drafts_attach_to_opportunity.sql
-- Backfill agentDrafts.opportunityId so every existing draft is anchored to a
-- specific lead/estimate/job rather than living as a flat customer-level row.
-- Marcin's UI groups drafts under their source opportunity; orphan drafts make
-- it impossible to know which lead a draft is about.
--
-- Strategy: for each draft with NULL opportunityId, set it to the customer's
-- most-recent non-archived `lead` opportunity (oldest fallback if none open).
-- The column itself was added in 0065_agent_drafts.sql; this migration only
-- fills the existing rows. New drafts always set opportunityId at insert time
-- (see server/lib/projectEstimator/cadence.ts and the patched roadmap-followup
-- caller in priorityTranslation.ts).
--
-- Idempotent: re-running is a no-op once orphans are drained.

UPDATE `agentDrafts` d
JOIN (
  SELECT
    d2.id AS draftId,
    (
      SELECT o.id FROM `opportunities` o
      WHERE o.customerId = d2.customerId
        AND o.area = 'lead'
        AND o.archived = 0
      ORDER BY o.createdAt DESC
      LIMIT 1
    ) AS pickedOppId
  FROM `agentDrafts` d2
  WHERE d2.opportunityId IS NULL
) pick ON pick.draftId = d.id
SET d.opportunityId = pick.pickedOppId
WHERE pick.pickedOppId IS NOT NULL;
