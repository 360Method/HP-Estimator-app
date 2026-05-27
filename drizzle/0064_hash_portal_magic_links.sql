-- Migration 0064: store portal magic-link tokens hashed at rest.
--
-- Before: `portalMagicLinks.token` held the raw bearer token that a read of
-- the table would leak for 7 days (TTL). After: we store SHA-256(token).
--
-- Existing rows are short-lived and we cannot rehash without the plaintext,
-- so we invalidate them — any homeowner with a pending link will need a
-- fresh one. SMS / email re-send is self-serve.

DELETE FROM `portalMagicLinks`;--> statement-breakpoint

ALTER TABLE `portalMagicLinks` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `portalMagicLinks` DROP COLUMN `token`;--> statement-breakpoint
ALTER TABLE `portalMagicLinks` ADD COLUMN `tokenHash` CHAR(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `portalMagicLinks` ADD PRIMARY KEY (`tokenHash`);
