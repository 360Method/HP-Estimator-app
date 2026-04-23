ALTER TABLE `phoneSettings` ADD `afterHoursEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `phoneSettings` ADD `businessHoursStart` varchar(5) DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE `phoneSettings` ADD `businessHoursEnd` varchar(5) DEFAULT '17:00';--> statement-breakpoint
ALTER TABLE `phoneSettings` ADD `businessDays` varchar(20) DEFAULT '1,2,3,4,5';