CREATE TABLE `portalJobMilestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hpOpportunityId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','in_progress','complete') NOT NULL DEFAULT 'pending',
	`scheduledDate` varchar(32),
	`completedAt` timestamp,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalJobMilestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalJobUpdates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hpOpportunityId` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`photoUrl` text,
	`postedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalJobUpdates_id` PRIMARY KEY(`id`)
);
