/**
 * Opportunities router — DB-backed CRUD for leads, estimates, and jobs.
 * All procedures are protectedProcedure (admin-only).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  findOrCreateConversation,
  insertMessage,
  updateConversationLastMessage,
} from "../db";
import { sendSms, isTwilioConfigured } from "../twilio";
import { nanoid } from "nanoid";
import { runAutomationsForTrigger } from "../automationEngine";
import {
  onLeadCreated,
  onAppointmentBooked,
  onSaleSigned,
  onReassign,
  recordPipelineEvent,
  listPipelineEventsFor,
  type TeamRole,
} from "../leadRouting";

const OpportunityInput = z.object({
  customerId: z.string(),
  area: z.enum(["lead", "estimate", "job"]).default("lead"),
  stage: z.string().default("New Lead"),
  title: z.string().default(""),
  value: z.number().default(0),
  jobNumber: z.string().optional(),
  notes: z.string().optional(),
  archived: z.boolean().default(false),
  archivedAt: z.string().optional(),
  sourceLeadId: z.string().optional(),
  sourceEstimateId: z.string().optional(),
  convertedToEstimateAt: z.string().optional(),
  convertedToJobAt: z.string().optional(),
  sentAt: z.string().optional(),
  wonAt: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledEndDate: z.string().optional(),
  scheduledDuration: z.number().optional(),
  assignedTo: z.string().optional(),
  scheduleNotes: z.string().optional(),
  estimateSnapshot: z.string().optional(), // JSON string
  tasks: z.string().optional(),            // JSON string
  attachments: z.string().optional(),      // JSON string
  jobActivity: z.string().optional(),      // JSON string
  clientSnapshot: z.string().optional(),   // JSON string
  signedEstimateUrl: z.string().optional(),
  signedEstimateFilename: z.string().optional(),
  completionSignatureUrl: z.string().optional(),
  completionSignedBy: z.string().optional(),
  completionSignedAt: z.string().optional(),
  sowDocument: z.string().optional(),
  sowGeneratedAt: z.string().optional(),
  onlineRequestId: z.number().optional(),
  propertyId: z.string().optional(),
  membershipId: z.number().optional(),
});

export const opportunitiesRouter = router({
  /** List opportunities, optionally filtered by area, customerId, or archived status */
  list: protectedProcedure
    .input(z.object({
      area: z.enum(["lead", "estimate", "job"]).optional(),
      customerId: z.string().optional(),
      archived: z.boolean().default(false),
      limit: z.number().default(500),
    }))
    .query(async ({ input }) => {
      return listOpportunities(input.area, input.customerId, input.archived, input.limit);
    }),

  /** Get a single opportunity by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const opp = await getOpportunityById(input.id);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      return opp;
    }),

  /** Create a new opportunity */
  create: protectedProcedure
    .input(OpportunityInput)
    .mutation(async ({ input }) => {
      const id = nanoid();
      const result = await createOpportunity({ id, ...input });
      // Fire lead_created automation (non-blocking)
      const triggerName = input.area === 'job' ? 'job_created' : input.area === 'estimate' ? 'estimate_sent' : 'lead_created';
      runAutomationsForTrigger(triggerName as any, {
        description: input.title || `New ${input.area}`,
        referenceNumber: id,
      }).catch(e => console.error(`[automation] ${triggerName} error:`, e));
      // Lead routing — assign to Nurturer and notify.
      if (input.area === 'lead') {
        onLeadCreated({
          opportunityId: id,
          customerId: input.customerId,
          title: input.title || 'New lead',
          source: 'manual',
        }).catch(e => console.error('[leadRouting] onLeadCreated error:', e));
      }
      return result;
    }),

  /** Update an existing opportunity */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(OpportunityInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const existing = await getOpportunityById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await updateOpportunity(id, rest);
      return getOpportunityById(id);
    }),

  /** Delete an opportunity */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteOpportunity(input.id);
      return { success: true };
    }),

  /** Archive an opportunity */
  archive: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(32).optional() }))
    .mutation(async ({ input }) => {
      const opp = await getOpportunityById(input.id);
      await updateOpportunity(input.id, {
        archived: true,
        archivedAt: new Date().toISOString(),
      });
      // Recompute lifecycle stage whenever a job is archived — disabled in MySQL port
      void opp;
      return { success: true };
    }),

  /**
   * Auto-archive Lost leads that have been stale for >= 90 days.
   * Exposed as an on-demand tRPC mutation in addition to the daily cron.
   */
  autoArchiveLostLeads: protectedProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1).max(365).default(90) }).optional())
    .mutation(async ({ input }) => {
      const { listOpportunities } = await import("../db");
      const leads = await listOpportunities("lead", undefined, false, 2000);
      const days = input?.olderThanDays ?? 90;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let archived = 0;
      for (const lead of leads) {
        if (lead.stage !== "Lost") continue;
        const ts = new Date((lead as any).updatedAt ?? (lead as any).createdAt ?? 0).getTime();
        if (ts && ts < cutoff) {
          await updateOpportunity(lead.id, {
            archived: true,
            archivedAt: new Date().toISOString(),
          }).catch(() => null);
          archived++;
        }
      }
      return { archived };
    }),

  /** Move opportunity to a new stage */
  moveStage: protectedProcedure
    .input(z.object({ id: z.string(), stage: z.string(), area: z.enum(["lead", "estimate", "job"]).optional() }))
    .mutation(async ({ input }) => {
      const update: Record<string, unknown> = { stage: input.stage };
      if (input.area) update.area = input.area;
      await updateOpportunity(input.id, update);

      // Fire job_completed automation when stage moves to Completed or Awaiting Sign-Off
      if (input.stage === 'Completed' || input.stage === 'Awaiting Sign-Off') {
        const opp2 = await getOpportunityById(input.id);
        if (opp2) {
          runAutomationsForTrigger('job_completed', {
            description: opp2.title,
            referenceNumber: opp2.jobNumber ?? input.id,
          }).catch(e => console.error('[automation] job_completed error:', e));
        }
      }
      // When job moves to "Awaiting Sign-Off": send portal sign-off email
      if (input.stage === 'Awaiting Sign-Off') {
        try {
          const { findPortalCustomerByHpId, getPortalEstimateByOpportunityId } = await import('../portalDb');
          const opp = await getOpportunityById(input.id);
          if (opp) {
            const portalCustomer = await findPortalCustomerByHpId(opp.customerId);
            const estimate = await getPortalEstimateByOpportunityId(input.id);
            if (portalCustomer) {
              const { sendEmail } = await import('../gmail');
              const { buildSignOffRequestEmail } = await import('../routers/portal');
              const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
              const signOffUrl = estimate
                ? `${baseUrl}/portal/job/${input.id}`
                : `${baseUrl}/portal/home`;
              await sendEmail({
                to: portalCustomer.email,
                subject: `Your Job is Complete — Please Sign Off`,
                html: buildSignOffRequestEmail(
                  portalCustomer.name,
                  estimate?.title ?? 'Your Project',
                  signOffUrl,
                  baseUrl,
                ),
              }).catch(() => null);
            }
          }
        } catch (e) {
          console.error('[moveStage] Failed to send sign-off email:', e);
        }
      }

      return { success: true };
    }),

  /**
   * Bulk import jobs/leads/estimates from CSV rows.
   * Matches existing records by customerId+title+area — updates if found, creates if not.
   * Supports HouseCall Pro and generic export formats.
   */
  importCsv: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        customerId: z.string().optional(),
        customerName: z.string().optional(), // fallback: match customer by name
        area: z.enum(["lead", "estimate", "job"]).default("job"),
        stage: z.string().optional(),
        title: z.string().optional(),
        value: z.number().optional(),       // in dollars (will be converted to cents)
        jobNumber: z.string().optional(),
        notes: z.string().optional(),
        scheduledDate: z.string().optional(),
        scheduledEndDate: z.string().optional(),
        wonAt: z.string().optional(),
        archived: z.boolean().optional(),
      })).max(2000),
    }))
    .mutation(async ({ input }) => {
      const { listCustomers, createOpportunity, listOpportunities, updateOpportunity } = await import("../db");
      // Build customer lookup map (name → id) for rows without customerId
      const allCustomers = await listCustomers(undefined, 2000, 0);
      const customerByName = new Map<string, string>();
      for (const c of allCustomers) {
        if (c.displayName) customerByName.set(c.displayName.toLowerCase().trim(), c.id);
        if (c.firstName && c.lastName) customerByName.set(`${c.firstName} ${c.lastName}`.toLowerCase().trim(), c.id);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of input.rows) {
        // Resolve customerId
        let customerId = row.customerId;
        if (!customerId && row.customerName) {
          customerId = customerByName.get(row.customerName.toLowerCase().trim());
        }
        if (!customerId) { skipped++; continue; }
        const area = row.area ?? "job";
        const stage = row.stage ?? (area === "job" ? "Active Job" : area === "estimate" ? "Estimate Sent" : "New Lead");
        const title = row.title ?? (row.jobNumber ? `Job #${row.jobNumber}` : `Imported ${area}`);
        const valueCents = row.value != null ? Math.round(row.value * 100) : 0;
        // Check for existing record by jobNumber or title+customerId+area
        const existing = await listOpportunities(area, customerId, undefined, 500);
        const match = existing.find(o =>
          (row.jobNumber && o.jobNumber === row.jobNumber) ||
          o.title.toLowerCase() === title.toLowerCase()
        );
        if (match) {
          await updateOpportunity(match.id, {
            stage,
            value: valueCents,
            notes: row.notes ?? match.notes ?? undefined,
            scheduledDate: row.scheduledDate ?? match.scheduledDate ?? undefined,
            scheduledEndDate: row.scheduledEndDate ?? match.scheduledEndDate ?? undefined,
            wonAt: row.wonAt ?? match.wonAt ?? undefined,
            archived: row.archived ?? match.archived,
          });
          updated++;
        } else {
          await createOpportunity({
            id: (await import("nanoid")).nanoid(),
            customerId,
            area,
            stage,
            title,
            value: valueCents,
            jobNumber: row.jobNumber,
            notes: row.notes,
            scheduledDate: row.scheduledDate,
            scheduledEndDate: row.scheduledEndDate,
            wonAt: row.wonAt,
            archived: row.archived ?? false,
          });
          created++;
        }
      }
      return { created, updated, skipped, total: input.rows.length };
    }),

  /**
   * Quick-send an SMS from the lead panel.
   * Finds or creates an inbox conversation for the contact, then sends via Twilio.
   */
  quickSendSms: protectedProcedure
    .input(z.object({
      to: z.string().min(7),
      body: z.string().min(1).max(1600),
      contactName: z.string().optional(),
      customerId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isTwilioConfigured()) {
        throw new Error("Twilio not configured. Add credentials in Settings \u2192 Secrets.");
      }
      const conversation = await findOrCreateConversation(
        input.to,
        null,
        input.contactName ?? null,
        input.customerId,
      );
      const { sid, status } = await sendSms(input.to, input.body);
      const msg = await insertMessage({
        conversationId: conversation.id,
        channel: "sms",
        direction: "outbound",
        body: input.body,
        status,
        twilioSid: sid,
        isInternal: false,
        sentAt: new Date(),
        sentByUserId: ctx.user?.id,
      });
      await updateConversationLastMessage(conversation.id, input.body, "sms");
      return { success: true, messageId: msg.id, conversationId: conversation.id };
    }),

  /**
   * Reassign an opportunity to a specific user + role.
   * Fires pipeline_events audit row + notification to the incoming owner.
   */
  reassign: protectedProcedure
    .input(z.object({
      opportunityId: z.string(),
      role: z.enum(["nurturer", "consultant", "project_manager"]),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const opp = await getOpportunityById(input.opportunityId);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await onReassign({
        opportunityId: input.opportunityId,
        toRole: input.role as TeamRole,
        toUserId: input.userId,
        triggeredByUserId: ctx.user?.id ?? null,
      });
      return { success: true };
    }),

  /**
   * Advance an opportunity to a new stage.
   * If the stage transition crosses a role boundary (lead → appointment booked,
   * estimate → job), the matching routing trigger fires automatically.
   */
  advanceStage: protectedProcedure
    .input(z.object({
      opportunityId: z.string(),
      toStage: z.string(),
      toArea: z.enum(["lead", "estimate", "job"]).optional(),
      appointmentType: z.enum(["baseline", "consultation"]).optional(),
      appointmentWhen: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const opp = await getOpportunityById(input.opportunityId);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });

      const fromStage = opp.stage;
      const update: Record<string, unknown> = { stage: input.toStage };
      if (input.toArea) update.area = input.toArea;
      await updateOpportunity(input.opportunityId, update);

      await recordPipelineEvent({
        opportunityId: input.opportunityId,
        eventType: "stage_changed",
        fromStage,
        toStage: input.toStage,
        triggeredBy: ctx.user?.id ? String(ctx.user.id) : "system",
      });

      // Cross-role triggers
      const stageLower = input.toStage.toLowerCase();
      const isAppointmentBooked = stageLower.includes("appointment") || stageLower.includes("baseline") || stageLower.includes("consultation") || stageLower.includes("scheduled");
      const isSaleSigned = input.toArea === "job" || stageLower.includes("signed") || stageLower.includes("won");

      if (isAppointmentBooked) {
        onAppointmentBooked({
          opportunityId: input.opportunityId,
          customerId: opp.customerId,
          title: opp.title,
          when: input.appointmentWhen ?? "soon",
          appointmentType: input.appointmentType ?? "consultation",
          triggeredByUserId: ctx.user?.id ?? null,
        }).catch(e => console.error("[leadRouting] onAppointmentBooked error:", e));
      } else if (isSaleSigned) {
        onSaleSigned({
          opportunityId: input.opportunityId,
          customerId: opp.customerId,
          title: opp.title,
          value: opp.value,
          triggeredByUserId: ctx.user?.id ?? null,
        }).catch(e => console.error("[leadRouting] onSaleSigned error:", e));
      }

      return { success: true };
    }),

  /** Read-only pipeline history for an opportunity (timeline view). */
  pipelineHistory: protectedProcedure
    .input(z.object({ opportunityId: z.string(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      return listPipelineEventsFor(input.opportunityId, input.limit);
    }),
});
