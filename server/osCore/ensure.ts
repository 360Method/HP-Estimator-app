/**
 * server/osCore/ensure.ts
 *
 * Boot-time DDL for the HP-OS tables. Same defensive pattern as
 * ensureDispatcherColumns: prod drizzle state has drifted before, so the OS
 * tables are created idempotently on every boot and never via drizzle-kit.
 * Nothing here is destructive; CREATE TABLE IF NOT EXISTS and
 * ADD COLUMN IF NOT EXISTS only.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

export async function ensureOsTables(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_business (
        id serial PRIMARY KEY,
        name varchar(200) NOT NULL,
        slug varchar(60) NOT NULL UNIQUE,
        branding text NOT NULL DEFAULT '{}',
        guardrails text NOT NULL DEFAULT '{}',
        timezone varchar(64) NOT NULL DEFAULT 'America/Los_Angeles',
        "createdAt" timestamp DEFAULT now() NOT NULL
      )`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_folders (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        "parentId" integer,
        slug varchar(120) NOT NULL,
        name varchar(200) NOT NULL,
        "areaCode" varchar(20),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "contextContract" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS os_folders_parent_slug_uniq
      ON os_folders ("businessId", COALESCE("parentId", 0), slug)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_documents (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        "docId" varchar(40) NOT NULL UNIQUE,
        "folderId" integer NOT NULL,
        title varchar(300) NOT NULL,
        type text NOT NULL DEFAULT 'DOC',
        layer varchar(4),
        status text NOT NULL DEFAULT 'draft',
        kind text NOT NULL DEFAULT 'human',
        body text NOT NULL DEFAULT '',
        events text,
        cron varchar(100),
        timezone varchar(64),
        tools text,
        approval text NOT NULL DEFAULT 'default',
        model varchar(64),
        "maxTurns" integer NOT NULL DEFAULT 6,
        "runLimitDaily" integer NOT NULL DEFAULT 20,
        enabled boolean NOT NULL DEFAULT false,
        "taskTitleTemplate" varchar(300),
        "taskDueOffsetHours" integer,
        "defaultAssigneeUserId" integer,
        internal boolean NOT NULL DEFAULT true,
        "sourcePath" varchar(400),
        version integer NOT NULL DEFAULT 1,
        "updatedByUserId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS os_documents_folder_idx ON os_documents ("folderId")`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS os_documents_kind_status_idx
      ON os_documents (kind, status, enabled)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_document_versions (
        id serial PRIMARY KEY,
        "docId" varchar(40) NOT NULL,
        version integer NOT NULL,
        body text NOT NULL,
        frontmatter text NOT NULL DEFAULT '{}',
        "editedByUserId" integer,
        "editedBy" text NOT NULL DEFAULT 'human',
        "createdAt" timestamp DEFAULT now() NOT NULL
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS os_document_versions_doc_version_uniq
      ON os_document_versions ("docId", version)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_tasks (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        title varchar(300) NOT NULL,
        detail text,
        status text NOT NULL DEFAULT 'open',
        "dueAt" timestamp,
        "assigneeUserId" integer,
        "sourceType" text NOT NULL DEFAULT 'manual',
        "sourceDocId" varchar(40),
        "sourceRunId" integer,
        "linkType" varchar(30),
        "linkId" varchar(60),
        hourglass varchar(10),
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "completedAt" timestamp,
        "completedByUserId" integer
      )`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS os_tasks_open_idx ON os_tasks (status, "dueAt")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_decisions (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        decision text NOT NULL,
        why text,
        alternatives text,
        owner varchar(120) NOT NULL DEFAULT 'Marcin',
        "areaCode" varchar(20),
        "linkDocId" varchar(40),
        "createdAt" timestamp DEFAULT now() NOT NULL
      )`);

    // FILE documents: hosted binary pointer columns (added after first ship).
    await db.execute(sql`
      ALTER TABLE IF EXISTS os_documents ADD COLUMN IF NOT EXISTS "fileUrl" text`);
    await db.execute(sql`
      ALTER TABLE IF EXISTS os_documents ADD COLUMN IF NOT EXISTS "fileMime" varchar(120)`);
    await db.execute(sql`
      ALTER TABLE IF EXISTS os_documents ADD COLUMN IF NOT EXISTS "fileSize" integer`);

    // Binary blobs live in the database, served via authenticated route only.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_file_blobs (
        id serial PRIMARY KEY,
        "sourcePath" varchar(400) NOT NULL UNIQUE,
        mime varchar(120) NOT NULL,
        size integer NOT NULL,
        data bytea NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )`);

    // Chat scope: which doc/folder/customer/opportunity a conversation is about.
    await db.execute(sql`
      ALTER TABLE IF EXISTS integrator_chat_conversations
      ADD COLUMN IF NOT EXISTS "scopeType" varchar(30)`);
    await db.execute(sql`
      ALTER TABLE IF EXISTS integrator_chat_conversations
      ADD COLUMN IF NOT EXISTS "scopeId" varchar(60)`);

    // The one seed row everything defaults to.
    await db.execute(sql`
      INSERT INTO os_business (id, name, slug)
      VALUES (1, 'Handy Pioneers', 'hp')
      ON CONFLICT (id) DO NOTHING`);

    // Authorize the HP-OS tools for the Integrator chat seat (not the
    // Dispatcher singleton; its tools come from each SOP's frontmatter).
    await db.execute(sql`
      INSERT INTO ai_agent_tools ("agentId", "toolKey", authorized, notes)
      SELECT a.id, t.key, true, 'HP-OS core tool (seeded by ensureOsTables)'
      FROM ai_agents a
      CROSS JOIN (VALUES
        ('docs.search'), ('docs.read'), ('docs.write'),
        ('ostasks.create'), ('ostasks.list'), ('ostasks.complete'),
        ('decisions.append')
      ) AS t(key)
      WHERE a.department = 'integrator' AND a."seatName" != 'Dispatcher'
        AND NOT EXISTS (
          SELECT 1 FROM ai_agent_tools x
          WHERE x."agentId" = a.id AND x."toolKey" = t.key
        )`);

    // The price book — estimable items, editable in-app (B1 of the
    // estimating revamp). Money columns are internal cost figures.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_price_items (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        "itemKey" varchar(40) NOT NULL UNIQUE,
        kind text NOT NULL,
        phase integer,
        category varchar(120) NOT NULL,
        name varchar(200) NOT NULL,
        "shortName" varchar(80) NOT NULL DEFAULT '',
        "unitType" varchar(20) NOT NULL DEFAULT 'unit',
        "laborMode" varchar(10) NOT NULL DEFAULT 'hr',
        "laborRate" numeric(10,2) NOT NULL DEFAULT 0,
        "hrsPerUnit" numeric(10,3) NOT NULL DEFAULT 0,
        "flatRatePerUnit" numeric(10,2) NOT NULL DEFAULT 0,
        "hasTiers" boolean NOT NULL DEFAULT false,
        "tiersJson" text,
        "wastePct" numeric(5,2) NOT NULL DEFAULT 0,
        "hasPaintPrep" boolean NOT NULL DEFAULT false,
        "defaultQty" numeric(10,2) NOT NULL DEFAULT 0,
        "salesDesc" text,
        "sowTemplate" text,
        active boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        source text NOT NULL DEFAULT 'seed',
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS os_price_items_kind_idx ON os_price_items (kind, active)`);

    // Consultant registry + sold-by attribution (HP-SOP-205 commission plan).
    // Internal-only: commission figures never reach portal serialization.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_consultants (
        id serial PRIMARY KEY,
        "businessId" integer NOT NULL DEFAULT 1,
        name varchar(200) NOT NULL,
        email varchar(320) NOT NULL DEFAULT '',
        "userId" integer,
        "commissionRateBps" integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )`);
    await db.execute(sql`
      ALTER TABLE IF EXISTS opportunities
      ADD COLUMN IF NOT EXISTS "soldByConsultantId" integer`);
    await db.execute(sql`
      ALTER TABLE IF EXISTS opportunities
      ADD COLUMN IF NOT EXISTS "commissionPaidAt" timestamp`);

    // Remodel quick-quote presets (Step 8 on-site value consultation).
    // RETAIL room-rate ranges, margins baked in; kept apart from the
    // internal-cost price book on purpose.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS os_remodel_quote_presets (
        id serial PRIMARY KEY,
        "presetKey" varchar(40) NOT NULL UNIQUE,
        label varchar(120) NOT NULL,
        description text,
        "unitType" varchar(10) NOT NULL DEFAULT 'sqft',
        "tiersJson" text NOT NULL,
        "lfAddonsJson" text,
        "baseFeeLow" numeric(10,2) NOT NULL DEFAULT 0,
        "baseFeeHigh" numeric(10,2) NOT NULL DEFAULT 0,
        "minSqft" numeric(10,2) NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        source text NOT NULL DEFAULT 'seed',
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )`);

    console.log("[boot] ensureOsTables OK");
  } catch (err) {
    console.warn("[boot] ensureOsTables failed (non-fatal):", err);
  }

  // Apply the committed seed bundle (no-op when absent or fully applied).
  try {
    const { importOsSeedBundle, importOsFilesManifest } = await import("./seedImport");
    await importOsSeedBundle();
    await importOsFilesManifest();
  } catch (err) {
    console.warn("[boot] importOsSeedBundle failed (non-fatal):", err);
  }

  // Price book seed (same never-clobber contract as the doc bundle).
  try {
    const { importPriceBookSeed } = await import("./priceBookSeed");
    await importPriceBookSeed();
  } catch (err) {
    console.warn("[boot] importPriceBookSeed failed (non-fatal):", err);
  }

  // Remodel quick-quote presets seed (same never-clobber contract).
  try {
    const { importQuickQuoteSeed } = await import("./quickQuoteSeed");
    await importQuickQuoteSeed();
  } catch (err) {
    console.warn("[boot] importQuickQuoteSeed failed (non-fatal):", err);
  }
}
