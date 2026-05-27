CREATE TABLE `adminAllowlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`addedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAllowlist_id` PRIMARY KEY(`id`),
	CONSTRAINT `adminAllowlist_email_unique` UNIQUE(`email`)
);
