/**
 * Close Flow router — staff-side procedures for the on-site close
 * (consultant's iPad, client in the room). Everything here renders on a
 * customer-VISIBLE staff surface, so every procedure composes
 * portalLeakGuard: payloads must stay customer-safe (no cost, markup, or
 * margin fields) even though the caller is staff-authenticated.
 *
 * approveEstimateInPerson runs the same shared approval pipeline as the
 * portal (server/lib/estimateApproval.ts) with channel 'in_person' and a
 * recorded attestation, so the downstream Won stage, deposit invoice, and
 * job generation are untouched.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { portalLeakGuard } from "../_core/portalLeakGuard";
import { getPortalEstimateById, findPortalCustomerById } from "../portalDb";
import { approvePortalEstimate } from "../lib/estimateApproval";

const closeProcedure = protectedProcedure.use(portalLeakGuard);

export const closeFlowRouter = router({
  approveEstimateInPerson: closeProcedure
    .input(
      z.object({
        portalEstimateId: z.number().int(),
        signerName: z.string().min(1),
        signatureDataUrl: z.string().min(1),
        /** e.g. navigator userAgent summary from the consultant's device */
        deviceInfo: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const est = await getPortalEstimateById(input.portalEstimateId);
      if (!est) throw new TRPCError({ code: "NOT_FOUND" });
      const portalCustomer = await findPortalCustomerById(est.customerId);
      if (!portalCustomer) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No portal account is linked to this estimate. Send the estimate to the portal first.",
        });
      }
      const witnessName = ctx.user.name || ctx.user.email || `Staff user ${ctx.user.id}`;
      return approvePortalEstimate({
        estimateId: est.id,
        signerName: input.signerName,
        signatureDataUrl: input.signatureDataUrl,
        channel: "in_person",
        attestation: {
          witnessUserId: ctx.user.id,
          witnessName,
          device: input.deviceInfo ?? "staff device",
          signedAt: new Date().toISOString(),
        },
        portalCustomer: {
          id: portalCustomer.id,
          name: portalCustomer.name,
          email: portalCustomer.email,
          phone: (portalCustomer as any).phone ?? null,
        },
      });
    }),
});
