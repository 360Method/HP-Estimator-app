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
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import { storagePut } from "../storage";
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
import { isRoadmapZipServed } from "../lib/priorityTranslation/serviceArea";
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
      /** Realtor/inspector partner attribution (?ref= on the roadmap page) */
      partnerRef = "",
    } = req.body ?? {};

    // Roadmap funnel (give-first, 2026-06-06): the visitor uploads before any
    // contact ask, so quiet capture fires on email entry alone — name and phone
    // may not exist yet. The lead is still the dropout-drip anchor.
    const isRoadmapFunnel = funnel === "roadmap_generator";

    // Basic validation — roadmap funnel needs only an email.
    if (isRoadmapFunnel ? !email : (!firstName || !phone || !email)) {
      res.status(400).json({
        error: isRoadmapFunnel
          ? "email is required."
          : "firstName, phone, and email are required.",
      });
      return;
    }

    const emailNorm = String(email).toLowerCase().trim();
    const firstSafe = String(firstName ?? "").trim();
    const phoneSafe = String(phone ?? "").trim();
    const greetName = firstSafe || "there";
    const displayName = `${firstSafe} ${lastName}`.trim() || emailNorm;
    // Partner attribution — sanitized slug, capped length (lands in leadSource).
    const partner = String(partnerRef ?? "").trim().replace(/[^\w\s\-\.]/g, "").slice(0, 64);

    // 1. Find or create customer
    let customer = await findCustomerByEmail(emailNorm);
    let isNewCustomer = false;

    if (!customer) {
      isNewCustomer = true;
      const id = nanoid();
      customer = await createCustomer({
        id,
        firstName: String(firstName ?? "").trim(),
        lastName: String(lastName ?? "").trim(),
        displayName,
        email: emailNorm,
        mobilePhone: String(phone ?? "").trim(),
        street: String(street).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        zip: String(zip).trim(),
        sendNotifications: true,
        sendMarketingOptIn: Boolean(smsConsent),
        customerType: "homeowner",
        tags: "[]",
        leadSource: partner && isRoadmapFunnel
          ? `Partner — ${partner} (Roadmap)`
          : funnel === "360_method" || isRoadmapFunnel
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
        partner ? `Partner ref: ${partner}` : "",
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
      firstName: firstSafe,
      lastName: String(lastName).trim(),
      phone: phoneSafe,
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
        `From: ${displayName} (${emailNorm})${phoneSafe ? ` — ${phoneSafe}` : ""}`,
        city ? `Location: ${city}, ${state} ${zip}` : "",
        `Service: ${serviceType}`,
        `Source: ${source}`,
        isNewCustomer ? "New customer created." : "Matched to existing customer.",
      ].filter(Boolean).join("\n"),
    }).catch((e) => console.error("[publicInquiry] notifyOwner error:", e));

    // 5. Fire automation trigger (non-blocking)
    runAutomationsForTrigger("new_booking", {
      customerName: displayName,
      customerFirstName: firstSafe,
      phone: phoneSafe,
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

    // Quiet capture (give-first funnel): the email-blur background lead from
    // the details form. The visitor is still ON the form, so the instant
    // "finish your roadmap" ack would be noise — the 45-min drip step covers
    // true dropouts. Skip the immediate ack email + SMS for these.
    const isQuietCapture = isRoadmapFunnel && String(source).includes("quiet-capture");

    // 7. Send customer acknowledgment email (non-blocking)
    if (isEmailSenderReady() && !isQuietCapture) {
      const ackHtml = isRoadmapFunnel
        ? `<p>Hi ${greetName},</p>
<p>You're one step from your complimentary 360° Roadmap. Finish by adding your home's details and your inspection report. It takes about two minutes.</p>
<p><a href="https://handypioneers.com/roadmap-generator" style="display:inline-block;background:#1a2e1a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;">Finish My Roadmap</a></p>
<p>Once your report is in, we'll sort every item into NOW, SOON, and WAIT with investment ranges, and deliver your roadmap by email.</p>
<p>Questions? Call or text us at <a href="tel:+13608386731">(360) 838-6731</a>.</p>
<p>The Handy Pioneers Team</p>`
        : `<p>Hi ${greetName},</p>
<p>We've received your inquiry and are getting ready for a thoughtful first conversation.</p>
<p>Our Concierge will reach out within one business day to learn more about your home and what you have in mind. There's no pressure. The first conversation is simply exploratory.</p>
<p>In the meantime, feel free to call or text us at <a href="tel:+13608386731">(360) 838-6731</a>.</p>
<p>The Handy Pioneers Team</p>`;
      sendEmail({
        to: emailNorm,
        subject: isRoadmapFunnel
          ? `Your 360° Roadmap is one step away${firstSafe ? `, ${firstSafe}` : ""}`
          : `Your inquiry is in our care${firstSafe ? `, ${firstSafe}` : ""}`,
        html: ackHtml,
      }).catch((e) => console.error("[publicInquiry] ack email error:", e));
    }

    // 8. Send customer acknowledgment SMS if consented (non-blocking)
    if (smsConsent && phoneSafe && isTwilioConfigured() && !isQuietCapture) {
      sendSms(
        phoneSafe,
        isRoadmapFunnel
          ? `Hi ${greetName}, it's Handy Pioneers. Your 360° Roadmap is started. Just add your home details and inspection report to finish: handypioneers.com/roadmap-generator`
          : `Your inquiry is in our care, ${greetName}. Your Handy Pioneers Concierge will reach out within one business day. (360) 838-6731 if anything is time-sensitive.`
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
              subject: `Your Handy Pioneers portal is ready${firstSafe ? `, ${firstSafe}` : ""}`,
              html: `<p>Hi ${greetName},</p>
<p>Your inquiry is confirmed. While we prepare for our first conversation, you can access your secure Handy Pioneers portal, where you can view your 360° Roadmap, track your project, and message our team.</p>
<p><a href="${portalLink}" style="display:inline-block;background:#1a2e1a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;">Open My Portal</a></p>
<p style="font-size:12px;color:#888;">This link is valid for 7 days and works on any device. No password needed.</p>
<p>The Handy Pioneers Team</p>`,
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
            recipientPhone: smsConsent && phoneSafe ? phoneSafe : null,
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
    const isBaselineFunnel = funnel === "baseline_walkthrough";

    // Defense-in-depth for the baseline funnel: re-check the ZIP server-side so a
    // home outside the service area is waitlisted even if the client didn't flag
    // it. Single source of truth is the serviceZipCodes table (Clark County
    // constant fallback). Fail open — a lookup error never blocks a booking.
    let effectiveOutOfArea = Boolean(outOfArea);
    if (isBaselineFunnel && !effectiveOutOfArea && String(zip).trim()) {
      try {
        const served = await isRoadmapZipServed(String(zip));
        if (!served) effectiveOutOfArea = true;
      } catch (e) {
        console.warn("[publicInquiry/details] baseline ZIP recheck failed:", e);
      }
    }

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
      effectiveOutOfArea ? "OUT OF AREA — waitlist (ZIP outside the current service area)" : "",
      street ? `Address: ${street}, ${city}, ${state} ${zip}` : "",
      sqft ? `Approx. sq ft: ${sqft}` : "",
      yearBuilt ? `Year built: ${yearBuilt}` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const existing = await getOpportunityById(String(leadId));
    const mergedNotes = existing?.notes
      ? `${existing.notes}\n\n${detailBlock}`
      : detailBlock;

    const waitlistLabel = city
      ? `${String(city).trim()}, ${String(state).trim()}`
      : `ZIP ${String(zip).trim()}`;
    const patch: { notes: string; title?: string } = { notes: mergedNotes };
    if (effectiveOutOfArea) {
      patch.title = isRoadmapFunnel
        ? `Roadmap Waitlist — ${waitlistLabel}`
        : `Baseline Waitlist — ${waitlistLabel}`;
    } else if (city && !isRoadmapFunnel) {
      patch.title = `Baseline Walkthrough — ${String(city).trim()}, ${String(state).trim()}`;
    }
    await updateOpportunity(String(leadId), patch);

    // 2b. Out-of-area roadmap lead: the funnel ends here (no report upload) —
    // drain the dropout drip so the waitlisted lead isn't nudged to finish. The
    // baseline funnel's drip suppresses itself off the OUT OF AREA note marker
    // (see baselineDrip.isBaselineStepOneLead), so it needs no cancel call here.
    if (isRoadmapFunnel && effectiveOutOfArea) {
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
      title: effectiveOutOfArea
        ? `${isRoadmapFunnel ? "Roadmap" : "Baseline"} waitlist signup — ${city ? `${city}, ${state}` : `ZIP ${zip}`} (${leadId})`
        : `Baseline details received — ${city ? `${city}, ${state}` : "lead"} (${leadId})`,
      content: detailBlock,
    }).catch((e) => console.error("[publicInquiry/details] notifyOwner error:", e));

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[publicInquiry/details] error:", err);
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

/**
 * Public attachment upload — POST /api/public/upload
 *
 * Lets the public website attach photos and documents to a consultation inquiry
 * BEFORE the lead is submitted. The browser uploads one file at a time (base64),
 * gets back a stored CDN URL, and includes the collected URLs as `photoUrls`
 * on the /inquiry submit. Those URLs land on the lead + online request, so the
 * back-office leads inbox and the customer portal can both show them.
 *
 * Mounted in server/_core/index.ts with its OWN rate limiter (more generous than
 * the tight public-write limiter) because this only writes to Cloudinary — never
 * to the DB, Stripe, or email — and a single inquiry can carry many photos.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per file (stays under the 25 MB JSON body cap once base64-encoded)

// Photos plus the documents homeowners actually send: inspection reports,
// quotes, plans, warranties.
const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export async function handleInquiryUpload(req: Request, res: Response): Promise<void> {
  try {
    const { filename = "", mimeType = "", base64 = "" } = req.body ?? {};

    if (!mimeType || !ALLOWED_UPLOAD_TYPES.includes(String(mimeType))) {
      res.status(400).json({ error: "Unsupported file type. Please upload a photo (JPG, PNG, WEBP, HEIC) or a document (PDF, DOC, TXT)." });
      return;
    }
    if (!base64 || typeof base64 !== "string") {
      res.status(400).json({ error: "Missing file data." });
      return;
    }

    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(raw, "base64");
    if (buffer.byteLength === 0) {
      res.status(400).json({ error: "Empty file." });
      return;
    }
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "That file is too large. Please keep each file under 15 MB." });
      return;
    }

    const safeExt = (String(filename).split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = EXT_BY_TYPE[String(mimeType)] ?? (safeExt || "bin");
    const suffix = randomBytes(6).toString("hex");
    const key = `inquiry-attachments/${Date.now()}-${suffix}.${ext}`;

    const { url } = await storagePut(key, buffer, String(mimeType));
    res.status(201).json({ url, filename: String(filename), mimeType: String(mimeType), size: buffer.byteLength });
  } catch (err: any) {
    console.error("[publicInquiry/upload] error:", err);
    res.status(500).json({ error: "Upload failed. Please try again." });
  }
}
