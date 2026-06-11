/**
 * server/lib/agentRuntime/osTools.ts
 *
 * HP-OS tools for the agent runtime and the Integrator/OS chat: read and
 * search the document library, draft new documents, work the human task
 * queue, and append to the decisions log.
 *
 * Guardrails baked in:
 *   - docs.write can create drafts and update draft/review bodies only. It
 *     can NEVER set status=final or enabled=true; going live is a human
 *     action in the Library UI (Publish).
 *   - Library content is internal. Tool descriptions remind the model that
 *     SOP/cost content must never be pasted into client-facing drafts.
 */

import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import {
  osDecisions,
  osDocuments,
  osDocumentVersions,
  osFolders,
  osTasks,
} from "../../../drizzle/schema";
import { registerTool } from "./tools";
import { invalidateDbSopCache } from "./dispatcher/sopRegistry";

type Db = any;

registerTool({
  key: "docs.search",
  requiresApproval: false,
  definition: {
    name: "docs_search",
    description:
      "Search the HP-OS library (SOPs, references, operating documents) by title, id, or body text. Returns matches with docId, title, type, and status. Library content is internal only; never paste it into anything a customer will see.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, e.g. 'margin audit' or 'HP-SOP-004'." },
      },
      required: ["query"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const q = `%${String(input.query ?? "").slice(0, 200)}%`;
    const rows = await db
      .select({
        docId: osDocuments.docId,
        title: osDocuments.title,
        type: osDocuments.type,
        status: osDocuments.status,
        kind: osDocuments.kind,
        folderId: osDocuments.folderId,
      })
      .from(osDocuments)
      .where(or(like(osDocuments.title, q), like(osDocuments.body, q), like(osDocuments.docId, q)))
      .limit(15);
    return { results: rows };
  },
});

registerTool({
  key: "docs.read",
  requiresApproval: false,
  definition: {
    name: "docs_read",
    description:
      "Read one HP-OS library document in full by its docId (e.g. 'HP-SOP-004'). Internal content: use it to answer the operator, never to compose customer-facing text.",
    input_schema: {
      type: "object",
      properties: {
        docId: { type: "string", description: "The document id, e.g. 'HP-REF-001'." },
      },
      required: ["docId"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const [doc] = await db
      .select()
      .from(osDocuments)
      .where(eq(osDocuments.docId, String(input.docId ?? "")))
      .limit(1);
    if (!doc) return { error: `Document ${input.docId} not found.` };
    return {
      docId: doc.docId,
      title: doc.title,
      type: doc.type,
      layer: doc.layer,
      status: doc.status,
      kind: doc.kind,
      enabled: doc.enabled,
      body: doc.body,
    };
  },
});

registerTool({
  key: "docs.write",
  requiresApproval: false,
  definition: {
    name: "docs_write",
    description:
      "Create a new draft document in the HP-OS library, or update the body of an existing document that is still in draft or review. Cannot publish, cannot enable, cannot touch final documents; a human does that in the Library.",
    input_schema: {
      type: "object",
      properties: {
        docId: {
          type: "string",
          description: "Existing document to update. Omit to create a new draft.",
        },
        folderId: {
          type: "number",
          description: "Folder for a NEW document (find one via the folder tree or docs.search).",
        },
        title: { type: "string", description: "Title for a new document." },
        body: { type: "string", description: "The full markdown body." },
      },
      required: ["body"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const body = String(input.body ?? "");

    if (input.docId) {
      const [doc] = await db
        .select()
        .from(osDocuments)
        .where(eq(osDocuments.docId, String(input.docId)))
        .limit(1);
      if (!doc) return { error: `Document ${input.docId} not found.` };
      if (doc.status === "final" || doc.status === "archived") {
        return {
          error: `Document ${doc.docId} is ${doc.status}; agents may only edit drafts. Ask the operator to edit it in the Library.`,
        };
      }
      const [verRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(version), 0)` })
        .from(osDocumentVersions)
        .where(eq(osDocumentVersions.docId, doc.docId));
      const version = Number(verRow?.max ?? 0) + 1;
      await db.insert(osDocumentVersions).values({
        docId: doc.docId,
        version,
        body,
        frontmatter: "{}",
        editedBy: "agent",
      });
      await db
        .update(osDocuments)
        .set({ body, version, updatedAt: new Date() })
        .where(eq(osDocuments.docId, doc.docId));
      invalidateDbSopCache();
      return { ok: true, docId: doc.docId, version };
    }

    // New draft.
    const folderId = Number(input.folderId ?? 0);
    if (!folderId) return { error: "folderId is required to create a new document." };
    const [folder] = await db.select().from(osFolders).where(eq(osFolders.id, folderId)).limit(1);
    if (!folder) return { error: `Folder ${folderId} not found.` };
    const prefix = "HP-DOC-";
    const existing = await db
      .select({ docId: osDocuments.docId })
      .from(osDocuments)
      .where(like(osDocuments.docId, `${prefix}%`));
    let max = 0;
    for (const r of existing) {
      const n = Number(r.docId.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const docId = `${prefix}${String(max + 1).padStart(3, "0")}`;
    await db.insert(osDocuments).values({
      docId,
      folderId,
      title: String(input.title ?? "Untitled draft").slice(0, 300),
      type: "DOC",
      kind: "human",
      status: "draft",
      body,
    });
    await db.insert(osDocumentVersions).values({
      docId,
      version: 1,
      body,
      frontmatter: "{}",
      editedBy: "agent",
    });
    return { ok: true, docId, created: true };
  },
});

registerTool({
  key: "ostasks.create",
  requiresApproval: false,
  definition: {
    name: "ostasks_create",
    description:
      "Put a task on the human work queue (the operator's Today list). Use when something needs a person: a call, a decision, a site visit, an approval outside the system.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the person should do, imperative, under 300 chars." },
        detail: { type: "string", description: "Context the person needs." },
        dueInHours: { type: "number", description: "Hours from now the task is due. Omit for no due date." },
        linkType: {
          type: "string",
          enum: ["customer", "opportunity", "invoice", "vendor", "doc"],
          description: "What the task is about.",
        },
        linkId: { type: "string", description: "Id of the linked record." },
      },
      required: ["title"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const dueInHours = Number(input.dueInHours);
    const [inserted] = await db
      .insert(osTasks)
      .values({
        title: String(input.title ?? "").slice(0, 300),
        detail: input.detail ? String(input.detail) : null,
        dueAt: Number.isFinite(dueInHours) && dueInHours >= 0
          ? new Date(Date.now() + dueInHours * 60 * 60 * 1000)
          : null,
        linkType: input.linkType ? String(input.linkType) : null,
        linkId: input.linkId ? String(input.linkId) : null,
        sourceType: "agent",
        sourceRunId: ctx.taskId,
      })
      .returning({ id: osTasks.id });
    return { ok: true, taskId: Number(inserted?.id ?? 0) };
  },
});

registerTool({
  key: "ostasks.list",
  requiresApproval: false,
  definition: {
    name: "ostasks_list",
    description: "List open tasks on the human work queue, soonest due first.",
    input_schema: {
      type: "object",
      properties: {
        linkType: { type: "string", description: "Optional filter: customer, opportunity, invoice, vendor, doc." },
        linkId: { type: "string", description: "Optional filter: id of the linked record." },
      },
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const conds = [sql`${osTasks.status} IN ('open', 'in_progress')`];
    if (input.linkType) conds.push(eq(osTasks.linkType, String(input.linkType)));
    if (input.linkId) conds.push(eq(osTasks.linkId, String(input.linkId)));
    const rows = await db
      .select({
        id: osTasks.id,
        title: osTasks.title,
        status: osTasks.status,
        dueAt: osTasks.dueAt,
        linkType: osTasks.linkType,
        linkId: osTasks.linkId,
        sourceDocId: osTasks.sourceDocId,
      })
      .from(osTasks)
      .where(and(...conds))
      .orderBy(sql`${osTasks.dueAt} ASC NULLS LAST`, asc(osTasks.createdAt))
      .limit(50);
    return { tasks: rows };
  },
});

registerTool({
  key: "ostasks.complete",
  requiresApproval: false,
  definition: {
    name: "ostasks_complete",
    description: "Mark a human-queue task done. Only do this when the operator says the work happened.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "number", description: "The os_tasks id." },
      },
      required: ["taskId"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    await db
      .update(osTasks)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(osTasks.id, Number(input.taskId)));
    return { ok: true };
  },
});

registerTool({
  key: "decisions.append",
  requiresApproval: false,
  definition: {
    name: "decisions_append",
    description:
      "Record a decision in the append-only decisions log: what was decided, why, and what else was considered. Use when the operator makes a call worth remembering.",
    input_schema: {
      type: "object",
      properties: {
        decision: { type: "string", description: "What was decided." },
        why: { type: "string", description: "The reasoning." },
        alternatives: { type: "string", description: "Other options that were on the table." },
        areaCode: {
          type: "string",
          description: "Optional area: OPS, SUBS, FIN, MKT, TECH, CLI, LEGAL, COMPASS.",
        },
      },
      required: ["decision"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const [inserted] = await db
      .insert(osDecisions)
      .values({
        decision: String(input.decision ?? ""),
        why: input.why ? String(input.why) : null,
        alternatives: input.alternatives ? String(input.alternatives) : null,
        areaCode: input.areaCode ? String(input.areaCode) : null,
      })
      .returning({ id: osDecisions.id });
    return { ok: true, decisionId: Number(inserted?.id ?? 0) };
  },
});
