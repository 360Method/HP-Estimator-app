/**
 * server/lib/agentRuntime/phase2Tools.ts
 *
 * Phase 2 tool library (15 tools) — each a thin wrapper over the existing
 * domain tables. Agents compose these to do their job. No net-new business
 * logic here. Registering on import means `import "./phase2Tools"` from the
 * boot path is enough to light the whole library up.
 *
 * Approval policy:
 *   - Customer-facing comms (email/sms drafts) → requiresApproval=true.
 *     The runtime parks the run and surfaces the draft in /admin/ai-agents/tasks.
 *   - Transactional email → NOT requiresApproval (runs off a whitelisted
 *     emailTemplates.key, internal only — no free-form copy).
 *   - Everything else is read-only or internal-write.
 */

import type { RegisteredTool } from "./tools";
import { registerTool } from "./tools";
import { getDb } from "../../db";
import {
  aiAgents,
  customers,
  opportunities,
  invoices,
  invoicePayments,
  emailTemplates,
  notifications,
  userRoles,
} from "../../../drizzle/schema";
import { and, desc, eq, gte, like, or } from "drizzle-orm";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ── 1. listCustomers ──────────────────────────────────────────────────────────
registerTool({
  key: "customers.list",
  requiresApproval: false,
  definition: {
    name: "listCustomers",
    description:
      "List customers, optionally filtered by a search string (matches name, email, phone, company). Returns up to 25 records.",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Optional substring match across name/email/phone/company." },
        limit: { type: "number", description: "Default 25, max 100." },
      },
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const limit = Math.min(100, Number(input.limit ?? 25));
    const f = (input.filter as string | undefined)?.trim();
    const rows = f
      ? await d
          .select()
          .from(customers)
          .where(
            or(
              like(customers.displayName, `%${f}%`),
              like(customers.firstName, `%${f}%`),
              like(customers.lastName, `%${f}%`),
              like(customers.email, `%${f}%`),
              like(customers.mobilePhone, `%${f}%`),
              like(customers.company, `%${f}%`)
            )
          )
          .limit(limit)
      : await d.select().from(customers).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName || `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      phone: r.mobilePhone,
      company: r.company,
      customerType: r.customerType,
      lifetimeValue: r.lifetimeValue,
      outstandingBalance: r.outstandingBalance,
    }));
  },
});

// ── 2. getCustomer ────────────────────────────────────────────────────────────
registerTool({
  key: "customers.get",
  requiresApproval: false,
  definition: {
    name: "getCustomer",
    description: "Fetch a single customer with their full profile by customer id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Customer id (nanoid)." } },
      required: ["id"],
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const [c] = await d.select().from(customers).where(eq(customers.id, String(input.id))).limit(1);
    if (!c) throw new Error(`Customer ${input.id} not found`);
    return c;
  },
});

// ── 3. listOpportunities ──────────────────────────────────────────────────────
registerTool({
  key: "opportunities.list",
  requiresApproval: false,
  definition: {
    name: "listOpportunities",
    description: "List opportunities (leads/estimates/jobs), optionally filtered by stage. Returns up to 50.",
    input_schema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "Optional exact-match stage filter (e.g. 'New Lead', 'Sent', 'Won')." },
        area: { type: "string", enum: ["lead", "estimate", "job"] },
        limit: { type: "number" },
      },
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const limit = Math.min(100, Number(input.limit ?? 50));
    const conds = [];
    if (input.stage) conds.push(eq(opportunities.stage, String(input.stage)));
    if (input.area) conds.push(eq(opportunities.area, String(input.area)));
    const rows = conds.length
      ? await d
          .select()
          .from(opportunities)
          .where(conds.length === 1 ? conds[0] : and(...conds))
          .orderBy(desc(opportunities.createdAt))
          .limit(limit)
      : await d.select().from(opportunities).orderBy(desc(opportunities.createdAt)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      area: r.area,
      stage: r.stage,
      title: r.title,
      value: r.value,
      jobNumber: r.jobNumber,
      assignedTo: r.assignedTo,
      scheduledDate: r.scheduledDate,
    }));
  },
});

// ── 4. getOpportunity ─────────────────────────────────────────────────────────
registerTool({
  key: "opportunities.get",
  requiresApproval: false,
  definition: {
    name: "getOpportunity",
    description: "Fetch a single opportunity (lead/estimate/job) by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const [o] = await d.select().from(opportunities).where(eq(opportunities.id, String(input.id))).limit(1);
    if (!o) throw new Error(`Opportunity ${input.id} not found`);
    return o;
  },
});

// ── 5. draftEmail (requires approval) ─────────────────────────────────────────
registerTool({
  key: "comms.draftEmail",
  requiresApproval: true,
  definition: {
    name: "draftEmail",
    description:
      "Draft a customer-facing email. DOES NOT SEND — the draft is queued for admin approval. Use this for any free-form copy that goes to a customer.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        customerId: { type: "string", description: "Customer id (optional, for linking)." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body. HTML allowed but keep it simple." },
        reason: { type: "string", description: "Why you're sending this — shown to the approver." },
      },
      required: ["to", "subject", "body"],
    },
  },
  handler: async () => {
    // Approval-gated: the runtime parks the run before this ever runs. If the
    // admin approves, approval.ts re-executes the stored call — this handler
    // is the post-approval receipt.
    return { ok: true, note: "approved; delivery handled by approval pipeline" };
  },
});

// ── 6. draftSms (requires approval) ───────────────────────────────────────────
registerTool({
  key: "comms.draftSms",
  requiresApproval: true,
  definition: {
    name: "draftSms",
    description:
      "Draft a customer-facing SMS. DOES NOT SEND — the draft is queued for admin approval.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "E.164 phone number." },
        customerId: { type: "string" },
        body: { type: "string", description: "SMS body, <= 320 chars." },
        reason: { type: "string" },
      },
      required: ["to", "body"],
    },
  },
  handler: async () => ({ ok: true, note: "approved; delivery handled by approval pipeline" }),
});

// ── 7. sendTransactionalEmail (NOT approval-gated) ────────────────────────────
registerTool({
  key: "comms.sendTransactionalEmail",
  requiresApproval: false,
  definition: {
    name: "sendTransactionalEmail",
    description:
      "Send a pre-approved transactional email using a whitelisted template key from the emailTemplates table. No free-form copy. Merge vars fill in the template. Use this for receipts, appointment confirmations, review requests, and other pre-written flows.",
    input_schema: {
      type: "object",
      properties: {
        templateKey: { type: "string", description: "emailTemplates.key value." },
        to: { type: "string", description: "Recipient email." },
        mergeVars: {
          type: "object",
          description: "Merge tag values as a flat object, e.g. {customerName: 'Alex'}.",
        },
      },
      required: ["templateKey", "to"],
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const [tpl] = await d
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.key, String(input.templateKey)))
      .limit(1);
    if (!tpl) throw new Error(`Template ${input.templateKey} not found`);
    // Queue via the notifications table for now — the existing notification
    // dispatcher picks up role='system_email' rows and relays via Gmail.
    // (Phase 4 will wire a proper transactional mailer; this keeps the MVP
    // closed-loop without inventing a new pipeline.)
    await d.insert(notifications).values({
      userId: 1,
      role: "system_email",
      eventType: "transactional_email",
      title: `[${tpl.key}] → ${String(input.to)}`,
      body: JSON.stringify({ templateKey: tpl.key, to: input.to, mergeVars: input.mergeVars ?? {} }),
      linkUrl: null,
      priority: "normal",
    });
    return { ok: true, templateKey: tpl.key, queued: true };
  },
});

// ── 8. createTask ─────────────────────────────────────────────────────────────
registerTool({
  key: "tasks.create",
  requiresApproval: false,
  definition: {
    name: "createTask",
    description:
      "Create a task assigned to a human role (consultant, pm, admin, installer). Delivered as a high-priority notification with an optional due date.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        details: { type: "string", description: "Optional longer description." },
        assignedRole: {
          type: "string",
          enum: ["consultant", "pm", "admin", "installer", "bookkeeper", "owner"],
        },
        customerId: { type: "string" },
        opportunityId: { type: "string" },
        dueAt: { type: "string", description: "ISO datetime (optional)." },
      },
      required: ["title", "assignedRole"],
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    // Resolve a user for this role. Fallback to userId=1 (owner) if nobody
    // holds the role yet — the role column still lets the UI route the bell.
    const role = String(input.assignedRole);
    const [holder] = await d.select().from(userRoles).where(eq(userRoles.role, role)).limit(1);
    await d.insert(notifications).values({
      userId: holder?.userId ?? 1,
      role,
      eventType: "agent_task",
      title: String(input.title),
      body: input.details ? `${input.details}${input.dueAt ? ` (due ${input.dueAt})` : ""}` : input.dueAt ? `Due ${input.dueAt}` : null,
      linkUrl: input.opportunityId ? `/jobs/${input.opportunityId}` : input.customerId ? `/customers/${input.customerId}` : null,
      priority: "high",
      customerId: (input.customerId as string | undefined) ?? null,
      opportunityId: (input.opportunityId as string | undefined) ?? null,
    });
    return { ok: true, assignedRole: role, assignedUserId: holder?.userId ?? 1 };
  },
});

// ── 9. logVendorContact ───────────────────────────────────────────────────────
registerTool({
  key: "vendors.logContact",
  requiresApproval: false,
  definition: {
    name: "logVendorContact",
    description:
      "Log a vendor-network interaction (call, email, quote received, etc.) to the vendor's communication log.",
    input_schema: {
      type: "object",
      properties: {
        vendorId: { type: "number", description: "Numeric vendor id from the vendors table." },
        channel: { type: "string", enum: ["call", "email", "sms", "meeting", "note", "quote", "order", "followup"] },
        direction: { type: "string", enum: ["inbound", "outbound", "internal"] },
        subject: { type: "string" },
        body: { type: "string" },
        opportunityId: { type: "string", description: "Optional — link to a specific opportunity." },
        loggedByAgent: { type: "string", description: "Slug of the agent doing the logging (optional)." },
      },
      required: ["vendorId", "channel"],
    },
  },
  handler: async ({ input }) => {
    const { logCommunication } = await import("../../vendors");
    const row = await logCommunication({
      vendorId: Number(input.vendorId),
      channel: input.channel as never,
      direction: (input.direction as never) ?? "outbound",
      subject: input.subject as string | undefined,
      body: input.body as string | undefined,
      opportunityId: input.opportunityId as string | undefined,
      loggedByAgent: input.loggedByAgent as string | undefined,
    });
    return { ok: true, communicationId: row.id };
  },
});

// ── 10. queryInvoices ─────────────────────────────────────────────────────────
registerTool({
  key: "invoices.query",
  requiresApproval: false,
  definition: {
    name: "queryInvoices",
    description: "List invoices, optionally filtered by status. Returns up to 50.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "sent", "due", "paid", "void", "partial", "pending_signoff"],
        },
        customerId: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const limit = Math.min(100, Number(input.limit ?? 50));
    const conds = [];
    if (input.status) conds.push(eq(invoices.status, String(input.status)));
    if (input.customerId) conds.push(eq(invoices.customerId, String(input.customerId)));
    const rows = conds.length
      ? await d
          .select()
          .from(invoices)
          .where(conds.length === 1 ? conds[0] : and(...conds))
          .orderBy(desc(invoices.createdAt))
          .limit(limit)
      : await d.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      customerId: r.customerId,
      total: r.total,
      amountPaid: r.amountPaid,
      balance: r.balance,
      dueDate: r.dueDate,
    }));
  },
});

// ── 11. queryPayments ─────────────────────────────────────────────────────────
registerTool({
  key: "payments.query",
  requiresApproval: false,
  definition: {
    name: "queryPayments",
    description: "List invoice payments, optionally filtered by method and/or date range.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["stripe", "paypal", "cash", "check", "zelle", "venmo", "other"] },
        fromDate: { type: "string", description: "ISO date — payments on or after." },
        limit: { type: "number" },
      },
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const limit = Math.min(200, Number(input.limit ?? 50));
    const conds = [];
    if (input.method) conds.push(eq(invoicePayments.method, String(input.method)));
    if (input.fromDate) conds.push(gte(invoicePayments.createdAt, new Date(String(input.fromDate))));
    const rows = conds.length
      ? await d
          .select()
          .from(invoicePayments)
          .where(conds.length === 1 ? conds[0] : and(...conds))
          .orderBy(desc(invoicePayments.createdAt))
          .limit(limit)
      : await d.select().from(invoicePayments).orderBy(desc(invoicePayments.createdAt)).limit(limit);
    return rows;
  },
});

// ── 12. getKpi ────────────────────────────────────────────────────────────────
registerTool({
  key: "kpis.get",
  requiresApproval: false,
  definition: {
    name: "getKpi",
    description: "Fetch the most recent KPI value for a key at a given scope.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        scope: { type: "string", enum: ["seat", "department", "company"] },
        scopeId: { type: "number", description: "Seat id (for scope=seat), or omit for company." },
        scopeKey: { type: "string", description: "Department slug (for scope=department)." },
      },
      required: ["key", "scope"],
    },
  },
  handler: async ({ input }) => {
    const d = await db();
    const { kpiMetrics } = await import("../../../drizzle/schema");
    const conds = [
      eq(kpiMetrics.key, String(input.key)),
      eq(kpiMetrics.scope, String(input.scope) as "seat" | "department" | "company"),
    ];
    if (input.scopeId !== undefined) conds.push(eq(kpiMetrics.scopeId, Number(input.scopeId)));
    if (input.scopeKey) conds.push(eq(kpiMetrics.scopeKey, String(input.scopeKey)));
    const [row] = await d
      .select()
      .from(kpiMetrics)
      .where(and(...conds))
      .orderBy(desc(kpiMetrics.computedAt))
      .limit(1);
    return row ?? null;
  },
});

// ── 13. recordKpi ─────────────────────────────────────────────────────────────
registerTool({
  key: "kpis.recordExplicit",
  requiresApproval: false,
  definition: {
    name: "recordKpi",
    description:
      "Record a KPI at an arbitrary scope (seat/department/company). Prefer `kpis_record` (the seat-default variant) for your own seat numbers; use this when you need to post at department/company scope.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        scope: { type: "string", enum: ["seat", "department", "company"] },
        scopeId: { type: "number" },
        scopeKey: { type: "string" },
        value: { type: "number" },
        unit: { type: "string", enum: ["usd", "pct", "count", "days"] },
        period: {
          type: "string",
          enum: ["realtime", "daily", "weekly", "monthly", "trailing_30", "trailing_90", "trailing_365"],
        },
      },
      required: ["key", "scope", "value", "unit"],
    },
  },
  handler: async ({ input, ctx }) => {
    const d = await db();
    const { kpiMetrics } = await import("../../../drizzle/schema");
    await d.insert(kpiMetrics).values({
      key: String(input.key),
      scope: String(input.scope) as "seat" | "department" | "company",
      scopeId: (input.scopeId as number | undefined) ?? null,
      scopeKey: (input.scopeKey as string | undefined) ?? null,
      value: Number(input.value).toFixed(4),
      unit: String(input.unit),
      period: ((input.period as string | undefined) ?? "realtime") as "realtime" | "daily" | "weekly" | "monthly" | "trailing_30" | "trailing_90" | "trailing_365",
      sourceTaskId: ctx.taskId,
    });
    return { ok: true };
  },
});

// ── 14. pingIntegrator ────────────────────────────────────────────────────────
registerTool({
  key: "hierarchy.pingIntegrator",
  requiresApproval: false,
  definition: {
    name: "pingIntegrator",
    description:
      "Escalate to the Integrator AI. Use when you hit a decision above your pay grade, a cross-department block, or something the Visionary should know about. Writes a high-priority notification routed to admins.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentence summary." },
        severity: { type: "string", enum: ["info", "warn", "critical"] },
        linkUrl: { type: "string" },
      },
      required: ["summary"],
    },
  },
  handler: async ({ input, ctx }) => {
    const d = await db();
    const [self] = await d.select().from(aiAgents).where(eq(aiAgents.id, ctx.agentId)).limit(1);
    const [integrator] = await d
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.department, "integrator"))
      .limit(1);
    await d.insert(notifications).values({
      userId: 1,
      role: "admin",
      eventType: "agent_escalation",
      title: `↑ ${self?.seatName ?? `#${ctx.agentId}`} → Integrator`,
      body: String(input.summary),
      linkUrl: (input.linkUrl as string | undefined) ?? `/admin/ai-agents/${integrator?.id ?? ctx.agentId}`,
      priority: input.severity === "critical" ? "high" : "normal",
    });
    return { ok: true, integratorId: integrator?.id ?? null };
  },
});

// ── 15. pingDepartmentHead ────────────────────────────────────────────────────
registerTool({
  key: "hierarchy.pingDepartmentHead",
  requiresApproval: false,
  definition: {
    name: "pingDepartmentHead",
    description:
      "Ping a Department Head AI (sales, operations, marketing, finance, customer_success, vendor_network, technology, strategy). Used by Integrator/peer-Heads to delegate or coordinate.",
    input_schema: {
      type: "object",
      properties: {
        department: {
          type: "string",
          enum: [
            "sales",
            "operations",
            "marketing",
            "finance",
            "customer_success",
            "vendor_network",
            "technology",
            "strategy",
          ],
        },
        summary: { type: "string" },
      },
      required: ["department", "summary"],
    },
  },
  handler: async ({ input, ctx }) => {
    const d = await db();
    const [self] = await d.select().from(aiAgents).where(eq(aiAgents.id, ctx.agentId)).limit(1);
    const [head] = await d
      .select()
      .from(aiAgents)
      .where(and(eq(aiAgents.department, String(input.department) as never), eq(aiAgents.isDepartmentHead, true)))
      .limit(1);
    if (!head) throw new Error(`No Department Head seated for ${input.department}`);
    await d.insert(notifications).values({
      userId: 1,
      role: "admin",
      eventType: "agent_delegation",
      title: `${self?.seatName ?? `#${ctx.agentId}`} → ${head.seatName}`,
      body: String(input.summary),
      linkUrl: `/admin/ai-agents/${head.id}`,
      priority: "normal",
    });
    return { ok: true, headId: head.id, headSeat: head.seatName };
  },
});

// ── 16. scheduling.listSlots ─────────────────────────────────────────────────
registerTool({
  key: "scheduling.listSlots",
  requiresApproval: false,
  definition: {
    name: "schedulingListSlots",
    description:
      "List open scheduling slots (operator availability windows). Returns up to 100 future slots with id, startAt, endAt, capacity, bookedCount.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO datetime — list slots on or after." },
        to: { type: "string", description: "ISO datetime — list slots on or before." },
        limit: { type: "number" },
      },
    },
  },
  handler: async ({ input }) => {
    const { listAvailableSlots } = await import("../../scheduling");
    const from = input.from ? new Date(String(input.from)) : undefined;
    const to = input.to ? new Date(String(input.to)) : undefined;
    const limit = Math.min(500, Number(input.limit ?? 100));
    return listAvailableSlots({ from, to, limit });
  },
});

// ── 17. scheduling.createBooking ─────────────────────────────────────────────
registerTool({
  key: "scheduling.createBooking",
  requiresApproval: false,
  definition: {
    name: "schedulingCreateBooking",
    description:
      "Book an available slot for a customer. Visit type defaults to consultation. Returns the booking with confirmation code.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        slotId: { type: "number" },
        visitType: {
          type: "string",
          enum: ["consultation", "baseline", "seasonal", "project"],
        },
        notes: { type: "string" },
        bookedBy: { type: "string", description: "Defaults to 'agent' when omitted." },
      },
      required: ["customerId", "slotId"],
    },
  },
  handler: async ({ input }) => {
    const { createBooking } = await import("../../scheduling");
    return createBooking({
      customerId: String(input.customerId),
      slotId: Number(input.slotId),
      visitType: (input.visitType as never) ?? "consultation",
      notes: input.notes as string | undefined,
      bookedBy: (input.bookedBy as string | undefined) ?? "agent",
    });
  },
});

// ── 18. scheduling.cancel ─────────────────────────────────────────────────────
registerTool({
  key: "scheduling.cancel",
  requiresApproval: false,
  definition: {
    name: "schedulingCancel",
    description: "Cancel a booking by id. Frees the slot for re-booking.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        reason: { type: "string" },
      },
      required: ["id"],
    },
  },
  handler: async ({ input }) => {
    const { cancelBooking } = await import("../../scheduling");
    await cancelBooking(Number(input.id), input.reason as string | undefined);
    return { ok: true };
  },
});

// ── 19. listVendors ──────────────────────────────────────────────────────────
registerTool({
  key: "vendors.list",
  requiresApproval: false,
  definition: {
    name: "listVendors",
    description: "List vendors in the network, optionally filtered by status, tier, or trade slug.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["prospect", "onboarding", "active", "paused", "retired"] },
        tier: { type: "string", enum: ["preferred", "approved", "trial", "probation"] },
        tradeSlug: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  handler: async ({ input }) => {
    const { listVendors } = await import("../../vendors");
    const rows = await listVendors({
      status: input.status as never,
      tier: input.tier as never,
      tradeSlug: input.tradeSlug as string | undefined,
      limit: (input.limit as number) ?? 50,
    });
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      companyName: v.companyName,
      status: v.status,
      tier: v.tier,
      rating: v.rating,
      jobsCompleted: v.jobsCompleted,
      lastJobAt: v.lastJobAt,
    }));
  },
});

// ── 20. getVendor ────────────────────────────────────────────────────────────
registerTool({
  key: "vendors.get",
  requiresApproval: false,
  definition: {
    name: "getVendor",
    description: "Fetch a single vendor with trades, onboarding steps, recent jobs, and recent communications.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  handler: async ({ input }) => {
    const { getVendor } = await import("../../vendors");
    const v = await getVendor(Number(input.id));
    if (!v) throw new Error("Vendor not found");
    return v;
  },
});

// ── 21. rankVendorsForOpportunity ────────────────────────────────────────────
registerTool({
  key: "vendors.rankForOpportunity",
  requiresApproval: false,
  definition: {
    name: "rankVendorsForOpportunity",
    description:
      "Score and rank vendors that match a trade for a given opportunity. Considers tier, status, rating, recency, and current load. Returns top N with score breakdown.",
    input_schema: {
      type: "object",
      properties: {
        tradeSlug: { type: "string", description: "Slug of the trade required (e.g. 'plumbing', 'electrical')." },
        opportunityId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["tradeSlug"],
    },
  },
  handler: async ({ input }) => {
    const { rankVendorsForOpportunity } = await import("../../vendors");
    return rankVendorsForOpportunity({
      tradeSlug: String(input.tradeSlug),
      opportunityId: input.opportunityId as string | undefined,
      limit: (input.limit as number) ?? 10,
    });
  },
});

// ── 22. createVendorOnboardingStep ───────────────────────────────────────────
registerTool({
  key: "vendors.createOnboardingStep",
  requiresApproval: false,
  definition: {
    name: "createVendorOnboardingStep",
    description: "Add an onboarding workflow step for a vendor (e.g. W-9 collection, COI verification).",
    input_schema: {
      type: "object",
      properties: {
        vendorId: { type: "number" },
        stepKey: { type: "string", description: "Stable slug for the step (e.g. 'w9_collected')." },
        label: { type: "string", description: "Operator-facing label." },
        status: { type: "string", enum: ["pending", "in_progress", "complete", "skipped", "blocked"] },
        notes: { type: "string" },
      },
      required: ["vendorId", "stepKey", "label"],
    },
  },
  handler: async ({ input }) => {
    const { createOnboardingStep } = await import("../../vendors");
    const row = await createOnboardingStep({
      vendorId: Number(input.vendorId),
      stepKey: String(input.stepKey),
      label: String(input.label),
      status: (input.status as never) ?? "pending",
      notes: input.notes as string | undefined,
    });
    return { ok: true, stepId: row.id };
  },
});

export const PHASE_2_TOOL_KEYS: RegisteredTool["key"][] = [
  "customers.list",
  "customers.get",
  "opportunities.list",
  "opportunities.get",
  "comms.draftEmail",
  "comms.draftSms",
  "comms.sendTransactionalEmail",
  "tasks.create",
  "vendors.logContact",
  "invoices.query",
  "payments.query",
  "kpis.get",
  "kpis.recordExplicit",
  "hierarchy.pingIntegrator",
  "hierarchy.pingDepartmentHead",
  "scheduling.listSlots",
  "scheduling.createBooking",
  "scheduling.cancel",
  "vendors.list",
  "vendors.get",
  "vendors.rankForOpportunity",
  "vendors.createOnboardingStep",
];
