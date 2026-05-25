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
} from "../db";
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
      funnel = "project",   // "project" | "360_method" | "baseline_walkthrough"
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
        leadSource: funnel === "360_method"
          ? "Website — Roadmap Generator"
          : funnel === "baseline_walkthrough"
            ? "Website — Baseline Walkthrough"
            : "Website — Online Request",
      });
    }

    // 2. Create lead opportunity
    const leadId = nanoid();
    const title = city
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
      sendEmail({
        to: emailNorm,
        subject: `Your inquiry is in our care, ${firstName} — Handy Pioneers`,
        html: `<p>Hi ${firstName},</p>
<p>We've received your inquiry and are getting ready for a thoughtful first conversation.</p>
<p>Our Concierge will reach out within one business day to learn more about your home and what you have in mind. There's no pressure — the first conversation is simply exploratory.</p>
<p>In the meantime, feel free to call or text us at <a href="tel:+13603344428">(360) 334-4428</a>.</p>
<p>— The Handy Pioneers Team</p>`,
      }).catch((e) => console.error("[publicInquiry] ack email error:", e));
    }

    // 8. Send customer acknowledgment SMS if consented (non-blocking)
    if (smsConsent && isTwilioConfigured()) {
      sendSms(
        String(phone).trim(),
        `Your inquiry is in our care, ${firstName}. Your Handy Pioneers Concierge will reach out within one business day. (360) 334-4428 if anything is time-sensitive.`
      ).catch((e) => console.error("[publicInquiry] ack sms error:", e));
    }

    // 9. Provision portal account + send magic link to /portal/roadmap (non-blocking)
    //    Path A inquiry → portal account created → customer can log in and view roadmap.
    void (async () => {
      try {
        const portalCustomer = await upsertPortalCustomer({
          email: emailNorm,
          name: displayName,
          hpCustomerId: customer.id,
          referralCode: await generateReferralCode(displayName).catch(() => undefined),
        });
        if (portalCustomer) {
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
