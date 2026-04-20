CREATE TABLE IF NOT EXISTS "timeLogs" (
  "id" serial PRIMARY KEY,
  "techName" varchar(128) NOT NULL,
  "workOrderId" integer,
  "scheduleEventId" varchar(64),
  "opportunityId" varchar(64),
  "customerId" varchar(64),
  "jobTitle" text,
  "clockIn" timestamp NOT NULL,
  "clockOut" timestamp,
  "durationMins" integer,
  "notes" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "timeLogs_techName_idx" ON "timeLogs" ("techName");
CREATE INDEX IF NOT EXISTS "timeLogs_clockIn_idx" ON "timeLogs" ("clockIn");
