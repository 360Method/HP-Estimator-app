/**
 * Booking router — public-facing procedures for the online request wizard.
 * No authentication required (customers submit requests without logging in).
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  isZipCodeAllowed,
  listServiceZipCodes,
  addServiceZipCode,
  removeServiceZipCode,
  findCustomerByEmail,
  createCustomer,
  createOpportunity,
  createOnlineRequest,
  listOnlineRequests,
  markOnlineRequestRead,
  countUnreadOnlineRequests,
  getOnlineRequestById,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { onLeadCreated } from "../leadRouting";
import { nanoid } from "nanoid";
import { runAutomationsForTrigger } from "../automationEngine";
import { sendEmail } from "../gmail";

export const bookingRouter = router({
  /** Check if a zip code is in the service area. Public — no auth required. */
  checkZip: publicProcedure
    .input(z.object({ zip: z.string().min(5).max(10) }))
    .query(async ({ input }) => {
      const allowed = await isZipCodeAllowed(input.zip.trim());
      return { allowed, zip: input.zip.trim() };
    }),

  /**
   * Submit an online service request.
   * Creates or matches a customer, creates a lead in the pipeline,
   * stores the raw request, and notifies the owner.
   */
  submit: publicProcedure
    .input(z.object({
      // Step 1
      zip: z.string().min(5).max(10),
      // Step 2
      serviceType: z.string().default("General Inquiry / Custom Request"),
      description: z.string().max(2000).default(""),
      timeline: z.enum(["ASAP", "Within a week", "Flexible"]),
      photoUrls: z.array(z.string().url()).max(5).default([]),
      // Step 3
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().min(7),
      email: z.string().email(),
      street: z.string().min(1),
      unit: z.string().default(""),
      city: z.string().min(1),
      state: z.string().min(2),
      smsConsent: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      // 1. Find or create customer
      let customer = await findCustomerByEmail(input.email);
      let isNewCustomer = false;

      if (!customer) {
        isNewCustomer = true;
        const id = nanoid();
        const displayName = `${input.firstName} ${input.lastName}`.trim();
        customer = await createCustomer({
          id,
          firstName: input.firstName,
          lastName: input.lastName,
          displayName,
          email: input.email.toLowerCase().trim(),
          mobilePhone: input.phone,
          street: input.street,
          unit: input.unit,
          city: input.city,
          state: input.state,
          zip: input.zip,
          sendNotifications: true,
          sendMarketingOptIn: input.smsConsent,
          customerType: "homeowner",
          tags: "[]",
          leadSource: "Booking",
        });
      }

      // 2. Create lead in pipeline
      const leadId = nanoid();
      const title = `${input.serviceType} — ${input.city}, ${input.state}`;
      const lead = await createOpportunity({
        id: leadId,
        customerId: customer.id,
        area: "lead",
        stage: "New Lead",
        title,
        notes: [
          `Timeline: ${input.timeline}`,
          input.description ? `Description: ${input.description}` : "",
          `Address: ${input.street}${input.unit ? ` ${input.unit}` : ""}, ${input.city}, ${input.state} ${input.zip}`,
          `SMS Consent: ${input.smsConsent ? "Yes" : "No"}`,
          input.photoUrls.length > 0 ? `Photos: ${input.photoUrls.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        archived: false,
      });

      // 3. Store raw online request
      const request = await createOnlineRequest({
        zip: input.zip,
        serviceType: input.serviceType,
        description: input.description,
        timeline: input.timeline,
        photoUrls: input.photoUrls,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        street: input.street,
        unit: input.unit,
        city: input.city,
        state: input.state,
        smsConsent: input.smsConsent,
        customerId: customer.id,
        leadId,
      });

      // 4. Notify owner
      const displayName = `${input.firstName} ${input.lastName}`.trim();
      await notifyOwner({
        title: `New Online Request — ${displayName}`,
        content: [
          `From: ${displayName} (${input.email}) — ${input.phone}`,
          `Location: ${input.city}, ${input.state} ${input.zip}`,
          `Service: ${input.serviceType}`,
          `Timeline: ${input.timeline}`,
          input.description ? `Details: ${input.description}` : "",
          isNewCustomer ? "New customer created." : "Matched to existing customer.",
        ].filter(Boolean).join("\n"),
      });

      // 5. Auto-ack email to the customer (non-blocking; sender silently
      // skips if Gmail isn't connected — see gmail.ts).
      const ackHtml = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;">
<table width="600" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#1a2e1a,#2d4a2d);padding:28px 40px;text-align:center;">
  <p style="color:#fff;font-size:20px;font-weight:700;margin:0;">We received your request</p>
  <p style="color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:6px 0 0;">Handy Pioneers</p>
</td></tr>
<tr><td style="padding:36px 40px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  <p>Hi ${input.firstName},</p>
  <p>Thanks for reaching out. We have your request for <strong>${input.serviceType}</strong> in <strong>${input.city}, ${input.state}</strong>, and a member of our team will follow up within one business day.</p>
  <p style="margin:18px 0 6px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Reference</p>
  <p style="margin:0;font-family:'Courier New',monospace;font-size:14px;">${leadId}</p>
  <p style="margin-top:24px;font-size:13px;color:#888;">Questions in the meantime? Reply to this email or call <a href="tel:+13602415718" style="color:#c8922a;">(360) 241-5718</a>.</p>
</td></tr></table></body></html>`;
      sendEmail({
        to: input.email,
        subject: `We received your request — ${input.serviceType}`,
        html: ackHtml,
      }).catch((err) => console.error('[booking] auto-ack email failed:', err));

      // Fire new_booking automation (non-blocking)
      runAutomationsForTrigger('new_booking', {
        customerName: displayName,
        customerFirstName: input.firstName,
        phone: input.phone,
        email: input.email,
        description: input.serviceType,
        referenceNumber: leadId,
      }).catch(e => console.error('[automation] new_booking error:', e));

      // Fire lead-routing notification to the Nurturer (non-blocking)
      onLeadCreated({
        opportunityId: leadId,
        customerId: customer.id,
        title: `New online request — ${displayName}`,
        source: input.serviceType,
        priority: input.timeline === 'emergency' ? 'high' : 'normal',
      }).catch((e) => console.error('[leadRouting] onLeadCreated error:', e));
      return {
        success: true,
        leadId,
        customerId: customer.id,
        isNewCustomer,
      };
    }),

  // ── Admin: Zip Code Management ─────────────────────────────────────────────

  listZipCodes: protectedProcedure
    .query(async () => listServiceZipCodes()),

  addZipCode: protectedProcedure
    .input(z.object({ zip: z.string().min(5).max(10) }))
    .mutation(async ({ input }) => {
      await addServiceZipCode(input.zip.trim());
      return { success: true };
    }),

  removeZipCode: protectedProcedure
    .input(z.object({ zip: z.string() }))
    .mutation(async ({ input }) => {
      await removeServiceZipCode(input.zip.trim());
      return { success: true };
    }),

  // ── Admin: View submitted requests ─────────────────────────────────────────

  listRequests: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ input }) => listOnlineRequests(input.limit)),

  /** Count unread (not yet viewed) online requests — used for pipeline badge */
  unreadCount: protectedProcedure
    .query(async () => {
      const count = await countUnreadOnlineRequests();
      return { count };
    }),

  /** Mark a single request as read when admin opens it */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await markOnlineRequestRead(input.id);
      return { success: true };
    }),

  /** Fetch a single online request by ID — used by LeadNurturingPanel */
  getRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getOnlineRequestById(input.id)),
});
