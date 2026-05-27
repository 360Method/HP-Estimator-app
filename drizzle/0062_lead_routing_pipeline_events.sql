-- Migration 0062: pipelineEvents — audit log of every state transition
-- Captures Lead → Estimate → Job moves, reassignments, and appointment bookings.
-- triggeredBy is either a user id (as string) or the literal 'system'.

CREATE TABLE `pipelineEvents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `opportunityId` varchar(64) NOT NULL,
  `eventType` varchar(60) NOT NULL,
  `fromStage` varchar(64),
  `toStage` varchar(64),
  `fromRole` varchar(32),
  `toRole` varchar(32),
  `fromUserId` int,
  `toUserId` int,
  `triggeredBy` varchar(64) NOT NULL DEFAULT 'system',
  `payloadJson` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pipeline_events_opp_idx` (`opportunityId`),
  KEY `pipeline_events_type_idx` (`eventType`)
);--> statement-breakpoint

-- userRoles — optional: lets a single user hold multiple team roles
-- (e.g. owner who is both a nurturer AND project_manager).
CREATE TABLE `userRoles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `role` varchar(32) NOT NULL,
  `isPrimary` tinyint(1) NOT NULL DEFAULT 0,
  `mobileUrgent` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_user_role_unique` (`userId`, `role`),
  KEY `user_roles_role_idx` (`role`)
);
