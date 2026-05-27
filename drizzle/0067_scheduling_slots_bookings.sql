-- 0067_scheduling_slots_bookings.sql
-- In-house customer scheduling widget. Two tables:
--   scheduling_slots    — operator-configured availability windows
--   scheduled_bookings  — customer-confirmed visits booked into a slot
--
-- The default seed inserts M-F 8am-6pm PT 60-min slots for the next 30 days.
-- Operators block/edit slots from /admin/scheduling.
--
-- IF NOT EXISTS used so re-runs are non-fatal even when the drizzle tracker
-- diverges from prod state.

CREATE TABLE IF NOT EXISTS `scheduling_slots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `startAt` timestamp NOT NULL,
  `endAt` timestamp NOT NULL,
  `capacity` int NOT NULL DEFAULT 1,
  `bookedCount` int NOT NULL DEFAULT 0,
  `blocked` boolean NOT NULL DEFAULT false,
  `notes` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `scheduling_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scheduling_slots_start_idx` ON `scheduling_slots` (`startAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scheduled_bookings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` varchar(64) NOT NULL,
  `slotId` int NOT NULL,
  `visitType` enum('consultation','baseline','seasonal','project') NOT NULL DEFAULT 'consultation',
  `status` enum('confirmed','rescheduled','cancelled','completed','no_show') NOT NULL DEFAULT 'confirmed',
  `notes` text,
  `bookedBy` varchar(64) NOT NULL DEFAULT 'customer',
  `confirmationCode` varchar(16),
  `cancelledAt` timestamp NULL,
  `cancelReason` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `scheduled_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scheduled_bookings_customer_idx` ON `scheduled_bookings` (`customerId`);
--> statement-breakpoint
CREATE INDEX `scheduled_bookings_slot_idx` ON `scheduled_bookings` (`slotId`);
--> statement-breakpoint
CREATE INDEX `scheduled_bookings_status_idx` ON `scheduled_bookings` (`status`);
