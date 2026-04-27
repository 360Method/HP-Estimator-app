-- Add recordingAppUrl to callLogs. The Drizzle schema declares this column but
-- the prod table was created by ensurePhoneTables() before the column was added
-- to the CREATE statement, and IF NOT EXISTS left the old shape in place.
-- Without this column, every Drizzle insert into callLogs fails (ER_BAD_FIELD_ERROR),
-- which silently swallows inbound call / voicemail logging.

ALTER TABLE callLogs ADD COLUMN recordingAppUrl TEXT AFTER recordingUrl;
