CREATE TABLE `properties` (
	`id` varchar(64) NOT NULL,
	`customerId` varchar(64) NOT NULL,
	`label` varchar(64) NOT NULL DEFAULT 'Home',
	`street` varchar(255) NOT NULL DEFAULT '',
	`unit` varchar(64) NOT NULL DEFAULT '',
	`city` varchar(128) NOT NULL DEFAULT '',
	`state` varchar(64) NOT NULL DEFAULT '',
	`zip` varchar(10) NOT NULL DEFAULT '',
	`isPrimary` boolean NOT NULL DEFAULT false,
	`isBilling` boolean NOT NULL DEFAULT false,
	`propertyNotes` text,
	`addressNotes` text,
	`lat` text,
	`lng` text,
	`membershipId` int,
	`source` varchar(32) DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `opportunities` ADD `propertyId` varchar(64);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `propertyIdSource` varchar(32);