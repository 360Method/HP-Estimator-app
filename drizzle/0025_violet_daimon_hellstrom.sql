ALTER TABLE `threeSixtyMemberships` ADD `planType` enum('single','portfolio') DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyMemberships` ADD `portfolioProperties` text;--> statement-breakpoint
ALTER TABLE `threeSixtyMemberships` ADD `interiorAddonDoors` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `threeSixtyMemberships` ADD `stripeQuantity` int DEFAULT 1 NOT NULL;