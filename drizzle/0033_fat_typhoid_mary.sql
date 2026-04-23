ALTER TABLE `threeSixtyMemberships` ADD `scheduledCreditAt` bigint;--> statement-breakpoint
ALTER TABLE `threeSixtyMemberships` ADD `scheduledCreditCents` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyMemberships` ADD `hpCustomerId` varchar(64);