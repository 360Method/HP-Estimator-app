/**
 * server/routers/os.ts
 *
 * HP-OS backend: the folder tree, the document library (with Save vs Publish
 * semantics for SOPs), the human task queue, and the append-only decisions
 * log. Staff-only; nothing here is ever portal-serialized (margin privacy).
 *
 * Save vs Publish:
 *   - save() always appends an os_document_versions row. If the document is
 *     a LIVE agent SOP (kind=agent, status=final, enabled=true) the edit is
 *     held as a pending version and the live row is untouched; otherwise the
 *     edit applies to the row immediately.
 *   - publish() validates the newest version and applies it to the row,
 *     marks the document final, and invalidates the SOP registry cache.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  osBusiness,
  osDecisions,
  osDocuments,
  osDocumentVersions,
  osFolders,
  osTasks,
} from "../../drizzle/schema";
import { invalidateDbSopCache } from "../lib/agentRuntime/dispatcher/sopRegistry";
import { validateSopForPublish } from "../osCore/sopValidation";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

const DOC_TYPES = ["SOP", "WF", "DOC", "TPL", "REF", "DATA"] as const;
const frontmatterInput = z.object({
  title: z.string().min(1).max(300).optional(),
  type: z.enum(DOC_TYPES).optional(),
  layer: z.string().max(4).nullable().optional(),
  kind: z.enum(["human", "agent"]).optional(),
  events: z.string().nullable().optional(),
  cron: z.string().max(100).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  tools: z.string().nullable().optional(),
  approval: z.enum(["default", "always", "never-send"]).optional(),
  model: z.string().max(64).nullable().optional(),
  maxTurns: z.number().int().min(1).max(8).optional(),
  runLimitDaily: z.number().int().min(1).max(500).optional(),
  taskTitleTemplate: z.string().max(300).nullable().optional(),
  taskDueOffsetHours: z.number().int().min(0).max(2160).nullable().optional(),
  defaultAssigneeUserId: z.number().int().nullable().optional(),
});

type Doc = typeof osDocuments.$inferSelect;

function isLiveAgentSop(doc: Doc): boolean {
  return doc.type === "SOP" && doc.kind === "agent" && doc.status === "final" && doc.enabled;
}

function frontmatterSnapshot(doc: Partial<Doc>): string {
  return JSON.stringify({
    title: doc.title,
    type: doc.type,
    layer: doc.layer,
    kind: doc.kind,
    events: doc.events,
    cron: doc.cron,
    timezone: doc.timezone,
    tools: doc.tools,
    approval: doc.approval,
    model: doc.model,
    maxTurns: doc.maxTurns,
    runLimitDaily: doc.runLimitDaily,
    taskTitleTemplate: doc.taskTitleTemplate,
    taskDueOffsetHours: doc.taskDueOffsetHours,
    defaultAssigneeUserId: doc.defaultAssigneeUserId,
  });
}

async function getDocOrThrow(d: Awaited<ReturnType<typeof db>>, docId: string): Promise<Doc> {
  const [doc] = await d.select().from(osDocuments).where(eq(osDocuments.docId, docId)).limit(1);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: `Document ${docId} not found` });
  return doc;
}

async function nextVersionNumber(d: Awaited<ReturnType<typeof db>>, docId: string): Promise<number> {
  const [row] = await d
    .select({ max: sql<number>`COALESCE(MAX(version), 0)` })
    .from(osDocumentVersions)
    .where(eq(osDocumentVersions.docId, docId));
  return Number(row?.max ?? 0) + 1;
}

/** Allocates the next HP-TYPE-NNN id by scanning existing docIds of that type. */
async function allocateDocId(
  d: Awaited<ReturnType<typeof db>>,
  businessSlugUpper: string,
  type: string,
): Promise<string> {
  const prefix = `${businessSlugUpper}-${type}-`;
  const rows = await d
    .select({ docId: osDocuments.docId })
    .from(osDocuments)
    .where(like(osDocuments.docId, `${prefix}%`));
  let max = 0;
  for (const r of rows) {
    const n = Number(r.docId.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export const osRouter = router({
  business: router({
    get: adminProcedure.query(async () => {
      const d = await db();
      const [biz] = await d.select().from(osBusiness).where(eq(osBusiness.id, 1)).limit(1);
      return biz ?? null;
    }),
  }),

  folders: router({
    tree: adminProcedure.query(async () => {
      const d = await db();
      const folders = await d
        .select()
        .from(osFolders)
        .orderBy(asc(osFolders.sortOrder), asc(osFolders.name));
      const docCounts = await d
        .select({ folderId: osDocuments.folderId, count: sql<number>`COUNT(*)` })
        .from(osDocuments)
        .groupBy(osDocuments.folderId);
      const countByFolder = new Map(docCounts.map((r) => [r.folderId, Number(r.count)]));
      return folders.map((f) => ({ ...f, docCount: countByFolder.get(f.id) ?? 0 }));
    }),

    create: adminProcedure
      .input(
        z.object({
          parentId: z.number().int().nullable(),
          name: z.string().min(1).max(200),
        }),
      )
      .mutation(async ({ input }) => {
        const d = await db();
        const slug = input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 120);
        const [inserted] = await d
          .insert(osFolders)
          .values({ parentId: input.parentId, name: input.name, slug: slug || "folder" })
          .returning();
        return inserted;
      }),

    rename: adminProcedure
      .input(z.object({ id: z.number().int(), name: z.string().min(1).max(200) }))
      .mutation(async ({ input }) => {
        const d = await db();
        await d.update(osFolders).set({ name: input.name }).where(eq(osFolders.id, input.id));
        return { ok: true };
      }),
  }),

  docs: router({
    list: adminProcedure
      .input(z.object({ folderId: z.number().int().optional() }).optional())
      .query(async ({ input }) => {
        const d = await db();
        const where = input?.folderId ? eq(osDocuments.folderId, input.folderId) : undefined;
        const rows = await d
          .select({
            docId: osDocuments.docId,
            folderId: osDocuments.folderId,
            title: osDocuments.title,
            type: osDocuments.type,
            layer: osDocuments.layer,
            status: osDocuments.status,
            kind: osDocuments.kind,
            enabled: osDocuments.enabled,
            version: osDocuments.version,
            updatedAt: osDocuments.updatedAt,
          })
          .from(osDocuments)
          .where(where)
          .orderBy(asc(osDocuments.docId));
        return rows;
      }),

    search: adminProcedure
      .input(z.object({ query: z.string().min(1).max(200) }))
      .query(async ({ input }) => {
        const d = await db();
        const q = `%${input.query}%`;
        return d
          .select({
            docId: osDocuments.docId,
            folderId: osDocuments.folderId,
            title: osDocuments.title,
            type: osDocuments.type,
            status: osDocuments.status,
            kind: osDocuments.kind,
          })
          .from(osDocuments)
          .where(or(like(osDocuments.title, q), like(osDocuments.body, q), like(osDocuments.docId, q)))
          .limit(25);
      }),

    get: adminProcedure.input(z.object({ docId: z.string() })).query(async ({ input }) => {
      const d = await db();
      const doc = await getDocOrThrow(d, input.docId);
      // Surface a pending (unpublished) edit if one is newer than the live row.
      const [latest] = await d
        .select()
        .from(osDocumentVersions)
        .where(eq(osDocumentVersions.docId, input.docId))
        .orderBy(desc(osDocumentVersions.version))
        .limit(1);
      const pendingVersion = latest && latest.version > doc.version ? latest : null;
      return { ...doc, pendingVersion };
    }),

    create: adminProcedure
      .input(
        z.object({
          folderId: z.number().int(),
          title: z.string().min(1).max(300),
          type: z.enum(DOC_TYPES).default("DOC"),
          kind: z.enum(["human", "agent"]).default("human"),
          body: z.string().default(""),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const docId = await allocateDocId(d, "HP", input.type);
        const [inserted] = await d
          .insert(osDocuments)
          .values({
            docId,
            folderId: input.folderId,
            title: input.title,
            type: input.type,
            kind: input.kind,
            body: input.body,
            status: "draft",
            updatedByUserId: ctx.user.id,
          })
          .returning();
        await d.insert(osDocumentVersions).values({
          docId,
          version: 1,
          body: input.body,
          frontmatter: frontmatterSnapshot(inserted),
          editedByUserId: ctx.user.id,
          editedBy: "human",
        });
        return inserted;
      }),

    save: adminProcedure
      .input(
        z.object({
          docId: z.string(),
          body: z.string().optional(),
          frontmatter: frontmatterInput.optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const doc = await getDocOrThrow(d, input.docId);
        const merged = {
          ...doc,
          ...(input.frontmatter ?? {}),
          body: input.body ?? doc.body,
        } as Doc;
        const version = await nextVersionNumber(d, input.docId);
        await d.insert(osDocumentVersions).values({
          docId: input.docId,
          version,
          body: merged.body,
          frontmatter: frontmatterSnapshot(merged),
          editedByUserId: ctx.user.id,
          editedBy: "human",
        });

        if (isLiveAgentSop(doc)) {
          // Live agent SOP: hold the edit as pending; Publish applies it.
          return { ok: true, pending: true, version };
        }

        await d
          .update(osDocuments)
          .set({
            body: merged.body,
            title: merged.title,
            type: merged.type,
            layer: merged.layer,
            kind: merged.kind,
            events: merged.events,
            cron: merged.cron,
            timezone: merged.timezone,
            tools: merged.tools,
            approval: merged.approval,
            model: merged.model,
            maxTurns: merged.maxTurns,
            runLimitDaily: merged.runLimitDaily,
            taskTitleTemplate: merged.taskTitleTemplate,
            taskDueOffsetHours: merged.taskDueOffsetHours,
            defaultAssigneeUserId: merged.defaultAssigneeUserId,
            version,
            updatedByUserId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(osDocuments.docId, input.docId));
        invalidateDbSopCache();
        return { ok: true, pending: false, version };
      }),

    /** Applies the newest version to the live row and marks the doc final. */
    publish: adminProcedure
      .input(z.object({ docId: z.string(), enable: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const doc = await getDocOrThrow(d, input.docId);
        const [latest] = await d
          .select()
          .from(osDocumentVersions)
          .where(eq(osDocumentVersions.docId, input.docId))
          .orderBy(desc(osDocumentVersions.version))
          .limit(1);
        if (!latest) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to publish" });

        let fm: Record<string, unknown> = {};
        try {
          fm = JSON.parse(latest.frontmatter);
        } catch {
          fm = {};
        }
        const candidate = {
          kind: (fm.kind as "human" | "agent") ?? doc.kind,
          body: latest.body,
          events: (fm.events as string | null) ?? doc.events,
          cron: (fm.cron as string | null) ?? doc.cron,
          tools: (fm.tools as string | null) ?? doc.tools,
          approval: (fm.approval as string) ?? doc.approval,
          maxTurns: Number(fm.maxTurns ?? doc.maxTurns),
          runLimitDaily: Number(fm.runLimitDaily ?? doc.runLimitDaily),
          taskTitleTemplate: (fm.taskTitleTemplate as string | null) ?? doc.taskTitleTemplate,
          taskDueOffsetHours:
            fm.taskDueOffsetHours === undefined
              ? doc.taskDueOffsetHours
              : (fm.taskDueOffsetHours as number | null),
        };
        if (doc.type === "SOP") {
          const result = validateSopForPublish(candidate);
          if (!result.ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: result.errors.join("\n") });
          }
        }

        await d
          .update(osDocuments)
          .set({
            body: latest.body,
            title: (fm.title as string) ?? doc.title,
            type: (fm.type as Doc["type"]) ?? doc.type,
            layer: (fm.layer as string | null) ?? doc.layer,
            kind: candidate.kind,
            events: candidate.events,
            cron: candidate.cron,
            timezone: (fm.timezone as string | null) ?? doc.timezone,
            tools: candidate.tools,
            approval: candidate.approval as Doc["approval"],
            model: (fm.model as string | null) ?? doc.model,
            maxTurns: candidate.maxTurns,
            runLimitDaily: candidate.runLimitDaily,
            taskTitleTemplate: candidate.taskTitleTemplate,
            taskDueOffsetHours: candidate.taskDueOffsetHours,
            defaultAssigneeUserId:
              fm.defaultAssigneeUserId === undefined
                ? doc.defaultAssigneeUserId
                : (fm.defaultAssigneeUserId as number | null),
            status: "final",
            enabled: input.enable ?? doc.enabled,
            version: latest.version,
            updatedByUserId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(osDocuments.docId, input.docId));
        invalidateDbSopCache();
        return { ok: true, version: latest.version };
      }),

    setEnabled: adminProcedure
      .input(z.object({ docId: z.string(), enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const doc = await getDocOrThrow(d, input.docId);
        if (input.enabled && doc.type === "SOP") {
          const result = validateSopForPublish(doc);
          if (!result.ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: result.errors.join("\n") });
          }
          if (doc.status !== "final") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Publish this SOP before turning it on (only final documents can run).",
            });
          }
        }
        await d
          .update(osDocuments)
          .set({ enabled: input.enabled, updatedByUserId: ctx.user.id, updatedAt: new Date() })
          .where(eq(osDocuments.docId, input.docId));
        invalidateDbSopCache();
        return { ok: true };
      }),

    versions: adminProcedure.input(z.object({ docId: z.string() })).query(async ({ input }) => {
      const d = await db();
      return d
        .select({
          version: osDocumentVersions.version,
          editedBy: osDocumentVersions.editedBy,
          editedByUserId: osDocumentVersions.editedByUserId,
          createdAt: osDocumentVersions.createdAt,
        })
        .from(osDocumentVersions)
        .where(eq(osDocumentVersions.docId, input.docId))
        .orderBy(desc(osDocumentVersions.version))
        .limit(50);
    }),

    /** One-click rollback: copies an old version forward as a new save. */
    restore: adminProcedure
      .input(z.object({ docId: z.string(), version: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const doc = await getDocOrThrow(d, input.docId);
        const [old] = await d
          .select()
          .from(osDocumentVersions)
          .where(
            and(
              eq(osDocumentVersions.docId, input.docId),
              eq(osDocumentVersions.version, input.version),
            ),
          )
          .limit(1);
        if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        const version = await nextVersionNumber(d, input.docId);
        await d.insert(osDocumentVersions).values({
          docId: input.docId,
          version,
          body: old.body,
          frontmatter: old.frontmatter,
          editedByUserId: ctx.user.id,
          editedBy: "human",
        });
        if (!isLiveAgentSop(doc)) {
          await d
            .update(osDocuments)
            .set({ body: old.body, version, updatedByUserId: ctx.user.id, updatedAt: new Date() })
            .where(eq(osDocuments.docId, input.docId));
          invalidateDbSopCache();
        }
        return { ok: true, version, pending: isLiveAgentSop(doc) };
      }),
  }),

  tasks: router({
    list: adminProcedure
      .input(
        z
          .object({
            status: z.enum(["open", "in_progress", "done", "dismissed"]).optional(),
            linkType: z.string().optional(),
            linkId: z.string().optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        const d = await db();
        const conds = [];
        if (input?.status) conds.push(eq(osTasks.status, input.status));
        else conds.push(sql`${osTasks.status} IN ('open', 'in_progress')`);
        if (input?.linkType) conds.push(eq(osTasks.linkType, input.linkType));
        if (input?.linkId) conds.push(eq(osTasks.linkId, input.linkId));
        return d
          .select()
          .from(osTasks)
          .where(and(...conds))
          .orderBy(sql`${osTasks.dueAt} ASC NULLS LAST`, asc(osTasks.createdAt))
          .limit(100);
      }),

    create: adminProcedure
      .input(
        z.object({
          title: z.string().min(1).max(300),
          detail: z.string().optional(),
          dueAt: z.string().datetime().optional(),
          linkType: z.string().max(30).optional(),
          linkId: z.string().max(60).optional(),
          hourglass: z.enum(["top", "pinch", "bottom"]).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const [inserted] = await d
          .insert(osTasks)
          .values({
            title: input.title,
            detail: input.detail ?? null,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            linkType: input.linkType ?? null,
            linkId: input.linkId ?? null,
            hourglass: input.hourglass ?? null,
            sourceType: "manual",
            assigneeUserId: ctx.user.id,
          })
          .returning();
        return inserted;
      }),

    setStatus: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          status: z.enum(["open", "in_progress", "done", "dismissed"]),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const d = await db();
        const done = input.status === "done" || input.status === "dismissed";
        await d
          .update(osTasks)
          .set({
            status: input.status,
            completedAt: done ? new Date() : null,
            completedByUserId: done ? ctx.user.id : null,
          })
          .where(eq(osTasks.id, input.id));
        return { ok: true };
      }),
  }),

  decisions: router({
    list: adminProcedure.query(async () => {
      const d = await db();
      return d.select().from(osDecisions).orderBy(desc(osDecisions.createdAt)).limit(100);
    }),

    append: adminProcedure
      .input(
        z.object({
          decision: z.string().min(1),
          why: z.string().optional(),
          alternatives: z.string().optional(),
          areaCode: z.string().max(20).optional(),
          linkDocId: z.string().max(40).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const d = await db();
        const [inserted] = await d
          .insert(osDecisions)
          .values({
            decision: input.decision,
            why: input.why ?? null,
            alternatives: input.alternatives ?? null,
            areaCode: input.areaCode ?? null,
            linkDocId: input.linkDocId ?? null,
          })
          .returning();
        return inserted;
      }),
  }),
});
