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
      return createOpportunity({ id, ...input });
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
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await updateOpportunity(input.id, {
        archived: true,
        archivedAt: new Date().toISOString(),
      });
      return { success: true };
    }),

  /** Move opportunity to a new stage */
  moveStage: protectedProcedure
    .input(z.object({ id: z.string(), stage: z.string(), area: z.enum(["lead", "estimate", "job"]).optional() }))
    .mutation(async ({ input }) => {
      const update: Record<string, unknown> = { stage: input.stage };
      if (input.area) update.area = input.area;
      await updateOpportunity(input.id, update);
      return { success: true };
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
});
