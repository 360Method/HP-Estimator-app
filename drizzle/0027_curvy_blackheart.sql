ALTER TABLE `threeSixtyMemberships` MODIFY COLUMN `customerId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyPropertySystems` MODIFY COLUMN `customerId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` MODIFY COLUMN `customerId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyVisits` MODIFY COLUMN `customerId` varchar(64) NOT NULL;