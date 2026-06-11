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

    console.log("[boot] ensureOsTables OK");
  } catch (err) {
    console.warn("[boot] ensureOsTables failed (non-fatal):", err);
  }
}
