/**
 * Vendors router — admin-only CRM for the vendor network.
 * Public agent-facing reads are exposed via the tool registry, not here.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createOnboardingStep,
  createVendor,
  getVendor,
  listTrades,
  listVendorCommunications,
  listVendorJobs,
  listVendors,
  logCommunication,
  rankVendorsForOpportunity,
  setVendorTrades,
  updateOnboardingStep,
  updateVendor,
} from "../vendors";

const VendorStatus = z.enum(["prospect", "onboarding", "active", "paused", "retired"]);
const VendorTier = z.enum(["preferred", "approved", "trial", "probation"]);

export const vendorsRouter = router({
  listTrades: protectedProcedure.query(async () => listTrades()),

  list: protectedProcedure
    .input(
      z
        .object({
          status: VendorStatus.optional(),
          tier: VendorTier.optional(),
          tradeSlug: z.string().optional(),
          limit: z.number().min(1).max(500).default(200),
        })
        .optional(),
    )
    .query(async ({ input }) => listVendors(input ?? {})),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const v = await getVendor(input.id);
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      return v;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        companyName: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        addressLine1: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        serviceArea: z.string().optional(),
        licenseNumber: z.string().optional(),
        status: VendorStatus.optional(),
        tier: VendorTier.optional(),
        notes: z.string().optional(),
        tradeSlugs: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { tradeSlugs, email, ...rest } = input;
      return createVendor({
        ...rest,
        email: email && email.length > 0 ? email : undefined,
        tradeSlugs,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().optional(),
          companyName: z.string().optional(),
          contactName: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          phone: z.string().optional(),
          addressLine1: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
          serviceArea: z.string().optional(),
          licenseNumber: z.string().optional(),
          status: VendorStatus.optional(),
          tier: VendorTier.optional(),
          notes: z.string().optional(),
          w9OnFile: z.boolean().optional(),
          coiOnFile: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => updateVendor(input.id, input.patch)),

  setTrades: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), tradeSlugs: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      await setVendorTrades(input.id, input.tradeSlugs);
      return { ok: true };
    }),

  logCommunication: protectedProcedure
    .input(
      z.object({
        vendorId: z.number().int().positive(),
        channel: z.enum(["call", "email", "sms", "meeting", "note", "quote", "order", "followup"]),
        direction: z.enum(["inbound", "outbound", "internal"]).default("outbound"),
        subject: z.string().optional(),
        body: z.string().optional(),
        opportunityId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => logCommunication(input)),

  listCommunications: protectedProcedure
    .input(z.object({ vendorId: z.number().int().positive(), limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ input }) => listVendorCommunications(input.vendorId, input.limit)),

  createOnboardingStep: protectedProcedure
    .input(
      z.object({
        vendorId: z.number().int().positive(),
        stepKey: z.string(),
        label: z.string(),
        status: z.enum(["pending", "in_progress", "complete", "skipped", "blocked"]).default("pending"),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => createOnboardingStep(input)),

  updateOnboardingStep: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: z.object({
          status: z.enum(["pending", "in_progress", "complete", "skipped", "blocked"]).optional(),
          notes: z.string().optional(),
          completedAt: z.string().datetime().optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const patch: Record<string, unknown> = { ...input.patch };
      if (input.patch.completedAt) patch.completedAt = new Date(input.patch.completedAt);
      await updateOnboardingStep(input.id, patch as never);
      return { ok: true };
    }),

  listJobs: protectedProcedure
    .input(
      z
        .object({
          vendorId: z.number().int().positive().optional(),
          opportunityId: z.string().optional(),
          limit: z.number().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => listVendorJobs(input ?? {})),

  rankForOpportunity: protectedProcedure
    .input(
      z.object({
        tradeSlug: z.string(),
        opportunityId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ input }) => rankVendorsForOpportunity(input)),
});
