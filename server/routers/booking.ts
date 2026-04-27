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
import { renderEmailTemplate } from "../emailTemplates";
import { sendEmail, isGmailConfigured } from "../gmail";
import { sendSms, isTwilioConfigured } from "../twilio";
import { startProjectEstimate } from "../lib/projectEstimator/estimator";
import { getDb } from "../db";

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
          leadSource: "Online Request",
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

      // Fire new_booking automation (non-blocking)
      runAutomationsForTrigger('new_booking', {
        customerName: displayName,
        customerFirstName: input.firstName,
        phone: input.phone,
        email: input.email,
        description: input.serviceType,
        referenceNumber: leadId,
      }).catch(e => console.error('[automation] new_booking error:', e));

      // Fire lead-routing notification to the Nurturer (non-blocking).
      // `source` must match the typed LeadSource union; the free-text
      // serviceType lives in the opportunity title/notes already.
      onLeadCreated({
        opportunityId: leadId,
        customerId: customer.id,
        title: `New online request — ${displayName}`,
        source: 'book_consultation',
        priority: input.timeline === 'ASAP' ? 'high' : 'normal',
      }).catch((e) => console.error('[leadRouting] onLeadCreated error:', e));

      // Customer auto-ack — affluent-voice "your inquiry is in our care"
      // (per Customer Success Charter, 2026-04-25). Email + SMS, both
      // best-effort; the inquiry is already committed to the DB.
      void sendBookingInquiryAck({
        firstName: input.firstName,
        email: input.email,
        phone: input.phone,
        smsConsent: input.smsConsent,
      });

      // Fire the Book Consultation / Project Estimator pipeline.
      // Provisions a portal account, schedules the post-roadmap cadence
      // through the existing Lead Nurturer infrastructure, and asynchronously
      // runs the AI estimator. Auto-ack itself is handled above by
      // sendBookingInquiryAck — startProjectEstimate must not duplicate it.
      let redirectUrl: string | null = null;
      let projectEstimateId: string | null = null;
      try {
        const db = await getDb();
        if (db) {
          const result = await startProjectEstimate(db, {
            customerId: customer.id,
            opportunityId: leadId,
            onlineRequestId: (request as any)?.id ?? null,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            smsConsent: input.smsConsent,
            serviceType: input.serviceType,
            description: input.description,
            timeline: input.timeline,
            street: input.street,
            unit: input.unit,
            city: input.city,
            state: input.state,
            zip: input.zip,
            photoUrls: input.photoUrls,
          });
          redirectUrl = result.redirectUrl;
          projectEstimateId = result.projectEstimateId;
        }
      } catch (err) {
        console.error('[projectEstimator] startProjectEstimate failed:', err);
      }

      return {
        success: true,
        leadId,
        customerId: customer.id,
        isNewCustomer,
        projectEstimateId,
        redirectUrl,
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

// ─── Customer auto-ack helper ──────────────────────────────────────────────────
// Sends the "your inquiry is in our care" email + SMS after a /book wizard
// submission. Affluent-voice copy is sourced from the `booking_inquiry_received`
// template (seed-email-templates.mjs). Falls back to inline copy if the seed
// has not been re-run against the DB.
async function sendBookingInquiryAck(params: {
  firstName: string;
  email: string;
  phone: string;
  smsConsent: boolean;
}): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
  try {
    if (isGmailConfigured()) {
      const tpl = await renderEmailTemplate("booking_inquiry_received", {
        customerFirstName: params.firstName,
        portalUrl,
      });
      const subject = tpl?.subject ?? `Your inquiry is in our care, ${params.firstName}`;
      const html = tpl?.html ?? defaultBookingAckHtml(params.firstName);
      const text = tpl?.text ?? defaultBookingAckText(params.firstName);
      await sendEmail({ to: params.email, subject, html, body: text }).catch((e) =>
        console.warn("[booking ack] email failed:", e),
      );
    }
  } catch (e) {
    console.warn("[booking ack] email path errored:", e);
  }
  // SMS only if customer consented (TCPA hygiene)
  try {
    if (params.smsConsent && params.phone && isTwilioConfigured()) {
      const smsBody = `Your inquiry is in our care, ${params.firstName}. Your Handy Pioneers Concierge will reach out within one business day to align on timing. (360) 241-5718 if anything is time-sensitive.`;
      await sendSms(params.phone, smsBody).catch((e) =>
        console.warn("[booking ack] sms failed:", e),
      );
    }
  } catch (e) {
    console.warn("[booking ack] sms path errored:", e);
  }
}

function defaultBookingAckHtml(firstName: string): string {
  return `<p>${firstName},</p>
<p>Your inquiry has reached us at Handy Pioneers, and it is in our care.</p>
<p>Here is what happens next: a member of our Concierge team will reach out personally — by text or by email — within one business day to learn more about your home, understand the project you have in mind, and find a window of time that fits your schedule for a walkthrough conversation.</p>
<p>Nothing further is needed from you in the meantime. We come to you.</p>
<p>If anything time-sensitive surfaces, you are welcome to call us directly at (360) 241-5718.</p>
<p>— The Handy Pioneers Team<br>(360) 241-5718 · help@handypioneers.com</p>`;
}

function defaultBookingAckText(firstName: string): string {
  return `${firstName},

Your inquiry has reached us at Handy Pioneers, and it is in our care.

A member of our Concierge team will reach out personally — by text or by email — within one business day to learn more about your home, understand the project you have in mind, and find a window of time that fits your schedule.

Nothing further is needed from you in the meantime. We come to you.

If anything time-sensitive surfaces, call us at (360) 241-5718.

— The Handy Pioneers Team
(360) 241-5718 · help@handypioneers.com`;
}
