-- Password reset tokens
-- Each row is a single-use, time-bound token that lets a staff user set a
-- new password without contacting an admin. Token value itself is hashed at
-- rest (bcrypt); only the user ever sees the raw value (in the email link).

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `staffUserId` int NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `requestIp` varchar(64),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `prt_staff_user_idx` ON `password_reset_tokens` (`staffUserId`);
--> statement-breakpoint
CREATE INDEX `prt_expires_idx` ON `password_reset_tokens` (`expiresAt`);
