-- Migration 0061: Notifications table — delivered notification log
-- One row per delivered notification (in-app bell feed). Email/SMS are sent
-- in the same action but this row drives the bell UI and unread count.

CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int,
  `role` varchar(32),
  `eventType` varchar(60) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text,
  `linkUrl` varchar(500),
  `opportunityId` varchar(64),
  `customerId` varchar(64),
  `priority` varchar(16) NOT NULL DEFAULT 'normal',
  `emailSent` tinyint(1) NOT NULL DEFAULT 0,
  `smsSent` tinyint(1) NOT NULL DEFAULT 0,
  `readAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `notifications_user_idx` (`userId`),
  KEY `notifications_role_idx` (`role`),
  KEY `notifications_event_idx` (`eventType`),
  KEY `notifications_opp_idx` (`opportunityId`)
);
