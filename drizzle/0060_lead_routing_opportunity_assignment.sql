-- Migration 0060: Lead routing — add assignment columns to opportunities
-- Extends the existing Lead → Estimate → Job pipeline with role-based ownership.
-- Roles: nurturer (qualifies leads), consultant (home visit, expert advisor), project_manager (execution).

ALTER TABLE `opportunities` ADD `assignedUserId` int;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `assignedRole` varchar(32);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `assignedAt` varchar(32);
