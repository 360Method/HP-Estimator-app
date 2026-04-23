-- Migration 0063: Seed data — three demo users (one per role) + five sample
-- notifications so the admin bell UI has something to render on first boot.
-- Marcin can reassign these users to real team members in Settings later.

-- Seed 3 users with openId placeholders — real users get upserted via OAuth on login
INSERT IGNORE INTO `users` (`openId`, `name`, `email`, `loginMethod`, `role`, `lastSignedIn`)
VALUES
  ('seed-nurturer-1',  'Nurturer (Demo)',       'nurturer@handypioneers.com',       'seed', 'user',  CURRENT_TIMESTAMP),
  ('seed-consultant-1', 'Consultant (Demo)',    'consultant@handypioneers.com',     'seed', 'user',  CURRENT_TIMESTAMP),
  ('seed-pm-1',        'Project Manager (Demo)', 'projectmanager@handypioneers.com', 'seed', 'user',  CURRENT_TIMESTAMP);--> statement-breakpoint

-- Role assignments — each seed user gets their primary role. Owner (help@)
-- stays under admin users table and can self-assign any role.
INSERT IGNORE INTO `userRoles` (`userId`, `role`, `isPrimary`, `mobileUrgent`)
SELECT `id`, 'nurturer',        1, 1 FROM `users` WHERE `openId` = 'seed-nurturer-1';--> statement-breakpoint
INSERT IGNORE INTO `userRoles` (`userId`, `role`, `isPrimary`, `mobileUrgent`)
SELECT `id`, 'consultant',      1, 0 FROM `users` WHERE `openId` = 'seed-consultant-1';--> statement-breakpoint
INSERT IGNORE INTO `userRoles` (`userId`, `role`, `isPrimary`, `mobileUrgent`)
SELECT `id`, 'project_manager', 1, 0 FROM `users` WHERE `openId` = 'seed-pm-1';--> statement-breakpoint

-- Five sample notifications across the three roles
INSERT IGNORE INTO `notifications` (`userId`, `role`, `eventType`, `title`, `body`, `linkUrl`, `priority`)
SELECT `id`, 'nurturer', 'new_lead', 'New lead: Rachel T.', 'Inbound phone call from a new contact — needs qualification.', '/?section=pipeline', 'high' FROM `users` WHERE `openId` = 'seed-nurturer-1';--> statement-breakpoint
INSERT IGNORE INTO `notifications` (`userId`, `role`, `eventType`, `title`, `body`, `linkUrl`, `priority`)
SELECT `id`, 'nurturer', 'new_booking', 'Roadmap Generator submission', 'New homeowner submitted their priority translation — reach out today.', '/?section=pipeline', 'normal' FROM `users` WHERE `openId` = 'seed-nurturer-1';--> statement-breakpoint
INSERT IGNORE INTO `notifications` (`userId`, `role`, `eventType`, `title`, `body`, `linkUrl`, `priority`)
SELECT `id`, 'consultant', 'appointment_booked', 'Baseline Walkthrough booked', 'Tuesday 2:30 PM — 2410 NE Everett, Portland. Expert prep sheet is ready.', '/?section=pipeline', 'high' FROM `users` WHERE `openId` = 'seed-consultant-1';--> statement-breakpoint
INSERT IGNORE INTO `notifications` (`userId`, `role`, `eventType`, `title`, `body`, `linkUrl`, `priority`)
SELECT `id`, 'project_manager', 'job_created', 'New signed job: Kitchen refresh', 'Handoff brief is ready — scope, timeline, crew notes inside.', '/?section=jobs', 'high' FROM `users` WHERE `openId` = 'seed-pm-1';--> statement-breakpoint
INSERT IGNORE INTO `notifications` (`userId`, `role`, `eventType`, `title`, `body`, `linkUrl`, `priority`)
SELECT `id`, 'project_manager', 'job_scheduled', 'Job scheduled next week', 'Bathroom remodel — crew of 2 required, materials on order.', '/?section=schedule', 'normal' FROM `users` WHERE `openId` = 'seed-pm-1';
