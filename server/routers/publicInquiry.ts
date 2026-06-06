/**
 * Public Inquiry REST endpoint — /api/public/inquiry
 *
 * This is a thin REST wrapper around the existing booking.submit tRPC mutation.
 * It allows the public handypioneers.com website to post lead data directly
 * without requiring the tRPC client.
 *
 * The endpoint accepts a simplified payload (name, phone, email, serviceType)
 * and fills in sensible defaults for the fields the mini-form doesn't collect
 * (zip, street, etc.). A full /book wizard submission can still be used for
 * customers who want to provide more detail.
 *
 * Mount this in server/index.ts:
 *   import { publicInquiryRouter } from "./routers/publicInquiry";
 *   app.use("/api/public", publicInquiryRouter);
 */

import express from "express";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import {
  findCustomerByEmail,
  createCustomer,
  createOpportunity,
  createOnlineRequest,
  isZipCodeAllowed,
  updateCustomer,
  updateOpportunity,
  getOpportunityById,
  getDb,
} from "../db";
import { properties } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { upsertPortalCustomer, createPortalToken, generateReferralCode } from "../portalDb";
import { notifyOwner } from "../_core/notification";
import { onLeadCreated } from "../leadRouting";
import { runAutomationsForTrigger } from "../automationEngine";
import { sendEmail, isEmailSenderReady } from "../gmail";
import { sendSms, isTwilioConfigured } from "../twilio";

export const publicInquiryRouter = express.Router();

// CORS — allow requests from the public website only
const ALLOWED_ORIGINS = [
  "https://www.handypioneers.com",
  "https://handypioneers.com",
  // Staging website (custom domain + Railway service URL)
  "https://staging.handypioneers.com",
  "https://www-staging-production.up.railway.app",
  // Allow localhost in development
  "http://localhost:5173",
  "http://localhost:3000",
];

publicInquiryRouter.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

publicInquiryRouter.post("/inquiry", async (req, res) => {
  try {
    const {
      firstName,
      lastName = "",
      phone,
      email,
      serviceType = "General Inquiry",
      source = "website",
      funnel = "project",   // "project" | "360_method" | "baseline_walkthrough" | "roadmap_generator"
      // Optional enrichment fields — may be empty from the mini-form
      zip = "",
      street = "",
      city = "",
      state = "WA",
      description = "",
      timeline = "Flexible",
      photoUrls = [],
      smsConsent = false,
    } = req.body ?? {};

    // Basic validation
    if (!firstName || !phone || !email) {
      res.status(400).json({ error: "firstName, phone, and email are required." });
      return;
    }

    const emailNorm = String(email).toLowerCase().trim();
    const displayName = `${firstName} ${lastName}`.trim();
    // Roadmap funnel (step 1 of 3): the lead is the dropout-drip anchor — the
    // report upload happens at step 2 and may never come.
    const isRoadmapFunnel = funnel === "roadmap_generator";

    // 1. Find or create customer
    let customer = await findCustomerByEmail(emailNorm);
    let isNewCustomer = false;

    if (!customer) {
      isNewCustomer = true;
      const id = nanoid();
      customer = await createCustomer({
        id,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        displayName,
        email: emailNorm,
        mobilePhone: String(phone).trim(),
        street: String(street).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        zip: String(zip).trim(),
        sendNotifications: true,
        sendMarketingOptIn: Boolean(smsConsent),
        customerType: "homeowner",
        tags: "[]",
        leadSource: funnel === "360_method" || isRoadmapFunnel
          ? "Website — Roadmap Generator"
          : funnel === "baseline_walkthrough"
            ? "Website — Baseline Walkthrough"
            : "Website — Online Request",
      });
    }

    // 2. Create lead opportunity
    const leadId = nanoid();
    const title = isRoadmapFunnel
      ? `Roadmap Generator — ${displayName}`
      : city
        ? `${serviceType} — ${city}, ${state}`
        : `${serviceType} — Website Inquiry`;

    await createOpportunity({
      id: leadId,
      customerId: customer.id,
      area: "lead",
      stage: "New Lead",
      title,
      notes: [
        `Source: ${source}`,
        description ? `Description: ${description}` : "",
        `Timeline: ${timeline}`,
        street ? `Address: ${street}, ${city}, ${state} ${zip}` : "",
        `SMS Consent: ${smsConsent ? "Yes" : "No"}`,
        photoUrls.length > 0 ? `Photos: ${(photoUrls as string[]).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      archived: false,
    });

    // 3. Store online request record (for the leads inbox)
    await createOnlineRequest({
      zip: String(zip).trim(),
      serviceType: String(serviceType),
      description: String(description),
      timeline: timeline as "ASAP" | "Within a week" | "Flexible",
      photoUrls: photoUrls as string[],
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phone: String(phone).trim(),
      email: emailNorm,
      street: String(street).trim(),
      unit: "",
      city: String(city).trim(),
      state: String(state).trim(),
      smsConsent: Boolean(smsConsent),
      customerId: customer.id,
      leadId,
      funnel: String(funnel),
    });

    // 4. Notify owner (non-blocking)
    notifyOwner({
      title: `New Website Inquiry — ${displayName}`,
      content: [
        `From: ${displayName} (${emailNorm}) — ${phone}`,
        city ? `Location: ${city}, ${state} ${zip}` : "",
        `Service: ${serviceType}`,
        `Source: ${source}`,
        isNewCustomer ? "New customer created." : "Matched to existing customer.",
      ].filter(Boolean).join("\n"),
    }).catch((e) => console.error("[publicInquiry] notifyOwner error:", e));

    // 5. Fire automation trigger (non-blocking)
    runAutomationsForTrigger("new_booking", {
      customerName: displayName,
      customerFirstName: String(firstName).trim(),
      phone: String(phone).trim(),
      email: emailNorm,
      description: String(serviceType),
      referenceNumber: leadId,
    }).catch((e) => console.error("[publicInquiry] automation error:", e));

    // 6. Fire lead routing (non-blocking)
    onLeadCreated({
      opportunityId: leadId,
      customerId: customer.id,
      title: `New website inquiry — ${displayName}`,
      source: "book_consultation",
      priority: timeline === "ASAP" ? "high" : "normal",
    }).catch((e) => console.error("[publicInquiry] leadRouting error:", e));

    // 7. Send customer acknowledgment email (non-blocking)
    if (isEmailSenderReady()) {
      const ackHtml = isRoadmapFunnel
        ? `<p>Hi ${firstName},</p>
<p>You're one step from your complimentary 360° Roadmap. Finish by adding your home's details and your inspection report — it takes about two minutes.</p>
<p><a href="https://handypioneers.com/roadmap-generator" style="display:inline-block;background:#1a2e1a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;">Finish My Roadmap</a></p>
<p>Once your report is in, we'll sort every item into NOW, SOON, and WAIT with investment ranges, and deliver your roadmap by email.</p>
<p>Questions? Call or text us at <a href="tel:+13603344428">(360) 334-4428</a>.</p>
<p>— The Handy Pioneers Team</p>`
        : `<p>Hi ${firstName},</p>
<p>We've received your inquiry and are getting ready for a thoughtful first conversation.</p>
<p>Our Concierge will reach out within one business day to learn more about your home and what you have in mind. There's no pressure — the first conversation is simply exploratory.</p>
<p>In the meantime, feel free to call or text us at <a href="tel:+13603344428">(360) 334-4428</a>.</p>
<p>— The Handy Pioneers Team</p>`;
      sendEmail({
        to: emailNorm,
        subject: isRoadmapFunnel
          ? `Your 360° Roadmap is one step away, ${firstName}`
          : `Your inquiry is in our care, ${firstName} — Handy Pioneers`,
        html: ackHtml,
      }).catch((e) => console.error("[publicInquiry] ack email error:", e));
    }

    // 8. Send customer acknowledgment SMS if consented (non-blocking)
    if (smsConsent && isTwilioConfigured()) {
      sendSms(
        String(phone).trim(),
        isRoadmapFunnel
          ? `Hi ${firstName}, it's Handy Pioneers. Your 360° Roadmap is started — just add your home details and inspection report to finish: handypioneers.com/roadmap-generator`
          : `Your inquiry is in our care, ${firstName}. Your Handy Pioneers Concierge will reach out within one business day. (360) 334-4428 if anything is time-sensitive.`
      ).catch((e) => console.error("[publicInquiry] ack sms error:", e));
    }

    // 9. Provision portal account + send magic link to /portal/roadmap (non-blocking)
    //    Path A inquiry → portal account created → customer can log in and view roadmap.
    //    Roadmap funnel: provision the account but SKIP the magic-link email — it's
    //    premature at step 1 (the roadmap delivery email carries its own link).
    void (async () => {
      try {
        const portalCustomer = await upsertPortalCustomer({
          email: emailNorm,
          name: displayName,
          hpCustomerId: customer.id,
          referralCode: await generateReferralCode(displayName).catch(() => undefined),
        });
        if (portalCustomer && !isRoadmapFunnel) {
          const token = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          await createPortalToken({ customerId: portalCustomer.id, token, expiresAt });
          const portalBase = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
          const portalLink = `${portalBase}/portal/auth?token=${token}&redirect=/portal/roadmap`;
          if (isEmailSenderReady()) {
            await sendEmail({
              to: emailNorm,
              subject: `Your Handy Pioneers portal is ready, ${String(firstName).trim()}`,
              html: `<p>Hi ${String(firstName).trim()},</p>
<p>Your inquiry is confirmed. While we prepare for our first conversation, you can access your secure Handy Pioneers portal — where you can view your 360° Roadmap, track your project, and message our team.</p>
<p><a href="${portalLink}" style="display:inline-block;background:#1a2e1a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;">Open My Portal</a></p>
<p style="font-size:12px;color:#888;">This link is valid for 7 days and works on any device. No password needed.</p>
<p>— The Handy Pioneers Team</p>`,
            }).catch((e) => console.error("[publicInquiry] portal magic link email error:", e));
          }
        }
      } catch (e) {
        console.error("[publicInquiry] portal provisioning error:", e);
      }
    })();

    // 10. Roadmap funnel: schedule the dropout-recovery drip (non-blocking).
    //     Cancelled automatically when the report lands (submitRoadmap), a
    //     membership is purchased (webhook), an appointment is booked, or the
    //     lead replies. All drafts are approval-gated in the admin inbox.
    if (isRoadmapFunnel) {
      void (async () => {
        try {
          const { scheduleRoadmapFollowup } = await import("../lib/leadNurturer/roadmapFollowup");
          const { ROADMAP_DROPOUT_KEY } = await import("../lib/leadNurturer/playbook");
          const result = await scheduleRoadmapFollowup({
            customerId: customer.id,
            opportunityId: leadId,
            playbookKey: ROADMAP_DROPOUT_KEY,
            recipientEmail: emailNorm,
            recipientPhone: smsConsent ? String(phone).trim() : null,
          });
          console.log(`[publicInquiry] roadmap_dropout drip: scheduled=${result.scheduled} skipped=${result.skipped ?? "no"}`);
        } catch (e) {
          console.error("[publicInquiry] roadmap_dropout scheduling error:", e);
        }
      })();
    }

    res.status(201).json({
      success: true,
      leadId,
      customerId: customer.id,
      isNewCustomer,
    });
  } catch (err: any) {
    console.error("[publicInquiry] error:", err);
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

/**
 * Enrich an existing baseline-walkthrough lead with home details.
 * Step 2 of the baseline funnel: Step 1 created the customer + lead (basics), this
 * adds the address + home details to the SAME records. Idempotent enough to re-call.
 */
publicInquiryRouter.post("/inquiry/details", async (req, res) => {
  try {
    const {
      customerId,
      leadId,
      street = "",
      city = "",
      state = "WA",
      zip = "",
      sqft = "",
      yearBuilt = "",
      notes = "",
      funnel = "",
      /** Roadmap funnel: ZIP outside the service area — waitlist branch */
      outOfArea = false,
    } = req.body ?? {};

    if (!customerId || !leadId) {
      res.status(400).json({ error: "customerId and leadId are required." });
      return;
    }
    const isRoadmapFunnel = funnel === "roadmap_generator";

    // 1. Enrich the customer record with their address.
    await updateCustomer(String(customerId), {
      street: String(street).trim(),
      city: String(city).trim(),
      state: String(state).trim(),
      zip: String(zip).trim(),
    });

    // 1b. Capture the home as a STRUCTURED property record now, straight from this
    // form. This is the authoritative source of sqft/yearBuilt — it does not depend
    // on the value surviving the funnel's sessionStorage relay into checkout. On
    // purchase, the 360 webhook links this row to the membership by address match,
    // so the portal reflects the home the member described.
    try {
      const cleanStreet = String(street).trim();
      if (cleanStreet) {
        const db = await getDb();
        if (db) {
          const sqftNum = parseInt(String(sqft).replace(/[^0-9]/g, ""), 10);
          const yearNum = parseInt(String(yearBuilt).replace(/[^0-9]/g, ""), 10);
          const homeFields = {
            street: cleanStreet,
            city: String(city).trim(),
            state: String(state).trim(),
            zip: String(zip).trim(),
            ...(Number.isFinite(sqftNum) && sqftNum > 0 ? { sqft: sqftNum } : {}),
            ...(Number.isFinite(yearNum) && yearNum > 0 ? { yearBuilt: yearNum } : {}),
          };
          const existingProps = await db
            .select()
            .from(properties)
            .where(eq(properties.customerId, String(customerId)));
          const match = existingProps.find(
            (p) => (p.street ?? "").toLowerCase().trim() === cleanStreet.toLowerCase()
          );
          if (match) {
            await db.update(properties).set(homeFields).where(eq(properties.id, match.id));
          } else {
            await db.insert(properties).values({
              id: nanoid(),
              customerId: String(customerId),
              label: "Home",
              isPrimary: existingProps.length === 0,
              source: "360-funnel",
              ...homeFields,
            });
          }
        }
      }
    } catch (propErr) {
      console.error("[publicInquiry/details] structured property upsert failed:", propErr);
    }

    // 2. Append the home details to the existing lead's notes (preserve step-1 notes).
    const detailBlock = [
      isRoadmapFunnel ? "— Home details (roadmap generator) —" : "— Home details (baseline walkthrough) —",
      outOfArea ? "OUT OF AREA — waitlist (ZIP outside the current service area)" : "",
      street ? `Address: ${street}, ${city}, ${state} ${zip}` : "",
      sqft ? `Approx. sq ft: ${sqft}` : "",
      yearBuilt ? `Year built: ${yearBuilt}` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const existing = await getOpportunityById(String(leadId));
    const mergedNotes = existing?.notes
      ? `${existing.notes}\n\n${detailBlock}`
      : detailBlock;

    const patch: { notes: string; title?: string } = { notes: mergedNotes };
    if (isRoadmapFunnel && outOfArea) {
      patch.title = `Roadmap Waitlist — ${city ? `${String(city).trim()}, ${String(state).trim()}` : `ZIP ${String(zip).trim()}`}`;
    } else if (city && !isRoadmapFunnel) {
      patch.title = `Baseline Walkthrough — ${String(city).trim()}, ${String(state).trim()}`;
    }
    await updateOpportunity(String(leadId), patch);

    // 2b. Out-of-area roadmap lead: the funnel ends here (no report upload) —
    // drain the dropout drip so the waitlisted lead isn't nudged to finish.
    if (isRoadmapFunnel && outOfArea) {
      try {
        const { cancelPendingFollowupsForCustomer } = await import("../lib/leadNurturer/roadmapFollowup");
        const { ROADMAP_DROPOUT_KEY } = await import("../lib/leadNurturer/playbook");
        await cancelPendingFollowupsForCustomer(String(customerId), "manual", {
          playbookKey: ROADMAP_DROPOUT_KEY,
        });
      } catch (e) {
        console.error("[publicInquiry/details] dropout drip cancel error:", e);
      }
    }

    // 3. Notify owner the details arrived (non-blocking).
    notifyOwner({
      title: isRoadmapFunnel && outOfArea
        ? `Roadmap waitlist signup — ${city ? `${city}, ${state}` : `ZIP ${zip}`} (${leadId})`
        : `Baseline details received — ${city ? `${city}, ${state}` : "lead"} (${leadId})`,
      content: detailBlock,
    }).catch((e) => console.error("[publicInquiry/details] notifyOwner error:", e));

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[publicInquiry/details] error:", err);
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});
