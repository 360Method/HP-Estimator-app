ALTER TABLE `customerAddresses` ADD `isBilling` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `additionalPhones` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `additionalEmails` text;