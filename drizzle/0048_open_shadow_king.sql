ALTER TABLE `appSettings` ADD `emailEstimateApprovedSubject` varchar(300) DEFAULT 'Your estimate has been approved — Handy Pioneers';--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailEstimateApprovedBody` text;--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailJobSignOffSubject` varchar(300) DEFAULT 'Job complete — your final invoice is ready';--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailJobSignOffBody` text;--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailChangeOrderApprovedSubject` varchar(300) DEFAULT 'Change order approved — Handy Pioneers';--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailChangeOrderApprovedBody` text;--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailMagicLinkSubject` varchar(300) DEFAULT 'Your Handy Pioneers Customer Portal Login';--> statement-breakpoint
ALTER TABLE `appSettings` ADD `emailMagicLinkBody` text;