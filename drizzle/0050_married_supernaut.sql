CREATE TABLE `staffUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` text NOT NULL,
	`name` varchar(255),
	`role` enum('admin','staff') NOT NULL DEFAULT 'staff',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `staffUsers_email_unique` UNIQUE(`email`)
);
