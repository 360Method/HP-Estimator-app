/**
 * 360° Method — Stripe Webhook Handler
 * Called when a checkout.session.completed event fires for a 360 subscription.
 *
 * Responsibilities:
 * 1. Create or find the portalCustomer record
 * 2. Create the threeSixtyMemberships record
 * 3. Add initial labor bank credit transaction
 * 4. Schedule the first seasonal visit for the current season
 * 5. Send a welcome email
 * 6. Notify HP owner
 */

import Stripe from "stripe";
import { getDb } from "./db";
import {
  threeSixtyMemberships,
  threeSixtyLaborBankTransactions,
  threeSixtyVisits,
  portalCustomers,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { TIER_DEFINITIONS, type MemberTier, type BillingCadence } from "../shared/threeSixtyTiers";
import { sendEmail } from "./gmail";
import { notifyOwner } from "./_core/notification";
import {
  findCustomerByEmail,
  createCustomer,
  createOpportunity,
  listOpportunities,
  updateOpportunity,
} from "./db";
import { nanoid } from "nanoid";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getCurrentSeason(): "spring" | "summer" | "fall" | "winter" {
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

/** Returns the renewal date in Unix ms based on billing cadence */
function calcRenewalDate(cadence: BillingCadence): number {
  const now = new Date();
  if (cadence === "monthly") {
    now.setMonth(now.getMonth() + 1);
  } else if (cadence === "quarterly") {
    now.setMonth(now.getMonth() + 3);
  } else {
    now.setFullYear(now.getFullYear() + 1);
  }
  return now.getTime();
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export async function create360MembershipFromWebhook(
  session: Stripe.Checkout.Session
): Promise<void> {
  const db = await getDb();
  const meta = session.metadata ?? {};

  const tier = (meta.tier ?? "bronze") as MemberTier;
  const cadence = (meta.cadence ?? "annual") as BillingCadence;
  const hpCustomerId = meta.hpCustomerId || null;
  const propertyAddressId = meta.propertyAddressId ? parseInt(meta.propertyAddressId) : null;
  const customerEmail = meta.customerEmail || session.customer_email || "";
  const customerName = meta.customerName || "New Member";
  const customerPhone = meta.customerPhone || "";
  const serviceAddress = meta.serviceAddress || "";
  const serviceCity = meta.serviceCity || "";
  const serviceState = meta.serviceState || "";
  const serviceZip = meta.serviceZip || "";

  const tierDef = TIER_DEFINITIONS[tier];
  const now = Date.now();

  // ── 1. Find or create portalCustomer ──────────────────────────────────────
  let portalCustomerId: number | null = null;
  if (customerEmail) {
    const [existing] = await db
      .select()
      .from(portalCustomers)
      .where(eq(portalCustomers.email, customerEmail))
      .limit(1);

    if (existing) {
      portalCustomerId = existing.id;
      // Update stripeCustomerId and phone/address if we have them
      await db
        .update(portalCustomers)
        .set({
          ...(session.customer && !existing.stripeCustomerId ? { stripeCustomerId: session.customer as string } : {}),
          ...(customerPhone && !(existing as any).phone ? { phone: customerPhone } : {}),
          ...(serviceAddress && !(existing as any).address ? { address: `${serviceAddress}, ${serviceCity}, ${serviceState} ${serviceZip}`.trim() } : {}),
        })
        .where(eq(portalCustomers.id, existing.id));
    } else {
      // Create new portal customer
      const result = await db.insert(portalCustomers).values({
        name: customerName,
        email: customerEmail,
        phone: customerPhone || undefined,
        address: serviceAddress ? `${serviceAddress}, ${serviceCity}, ${serviceState} ${serviceZip}`.trim() : undefined,
        hpCustomerId: hpCustomerId ?? undefined,
        stripeCustomerId: session.customer as string | undefined,
      });
      portalCustomerId = (result as any).insertId as number;
    }
  }

  // ── 2. Create membership record ───────────────────────────────────────────
  const membershipResult = await db.insert(threeSixtyMemberships).values({
    customerId: portalCustomerId ?? 0, // 0 = unlinked, staff will link manually
    propertyAddressId: propertyAddressId ?? undefined,
    tier,
    status: "active",
    startDate: now,
    renewalDate: calcRenewalDate(cadence),
    laborBankBalance: tierDef.laborBankCreditCents,
    stripeSubscriptionId: session.subscription as string | undefined,
    stripeCustomerId: session.customer as string | undefined,
    billingCadence: cadence,
    annualScanCompleted: false,
  });
  const membershipId = (membershipResult as any).insertId as number;

  // ── 3. Add initial labor bank credit ─────────────────────────────────────
  if (tierDef.laborBankCreditCents > 0) {
    await db.insert(threeSixtyLaborBankTransactions).values({
      membershipId,
      customerId: portalCustomerId ?? 0,
      type: "credit",
      amountCents: tierDef.laborBankCreditCents,
      description: `Initial ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier enrollment credit`,
      createdAt: new Date(),
    });
  }

  // ── 4. Schedule first seasonal visit ─────────────────────────────────────
  const currentSeason = getCurrentSeason();
  // Bronze only gets spring + fall; skip summer/winter for bronze
  const shouldSchedule =
    tier !== "bronze" || currentSeason === "spring" || currentSeason === "fall";

  if (shouldSchedule) {
    await db.insert(threeSixtyVisits).values({
      membershipId,
      customerId: portalCustomerId ?? 0,
      season: currentSeason,
      status: "scheduled",
    });
  }

  // ── 5. Send welcome email ─────────────────────────────────────────────────
  if (customerEmail) {
    const laborBankDisplay =
      tierDef.laborBankCreditCents > 0
        ? `<p>Your <strong>$${tierDef.laborBankCreditCents / 100} labor bank credit</strong> is ready to use on your first call.</p>`
        : "";

    const priorityNote = tierDef.priorityScheduling
      ? `<p>As a Gold member, you have <strong>priority scheduling</strong> — your calls go to the front of the queue.</p>`
      : "";

    const welcomeHtml = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;">
<table width="600" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#0f1f3d,#1a3a6b);padding:32px 40px;text-align:center;">
  <p style="color:#c8922a;font-size:28px;font-weight:900;margin:0;letter-spacing:-0.5px;">360°</p>
  <p style="color:#fff;font-size:16px;font-weight:700;margin:4px 0 0;">Welcome to the 360° Method</p>
  <p style="color:rgba(255,255,255,0.55);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:6px 0 0;">Delivered by Handy Pioneers</p>
</td></tr>
<tr><td style="padding:36px 40px;color:#1a1a1a;font-size:15px;line-height:1.7;">
  <p>Hi ${customerName.split(" ")[0]},</p>
  <p>You're officially enrolled in the <strong>${tier.charAt(0).toUpperCase() + tier.slice(1)} tier</strong> of the 360° Method. Your home is now on a proactive maintenance plan — no more reactive emergencies.</p>
  <p><strong>What happens next:</strong></p>
  <ul style="padding-left:20px;color:#333;">
    <li>Our team will reach out within 48 hours to schedule your <strong>Annual 360° Home Scan</strong></li>
    <li>Your first seasonal visit (${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)}) will be scheduled at the same time</li>
    ${tierDef.laborBankCreditCents > 0 ? `<li>Your $${tierDef.laborBankCreditCents / 100} labor bank credit is active and ready to use</li>` : ""}
  </ul>
  ${laborBankDisplay}
  ${priorityNote}
  <p style="text-align:center;margin-top:28px;">
    <a href="https://client.handypioneers.com" style="display:inline-block;background:#c8922a;color:#fff;font-weight:700;padding:14px 36px;border-radius:6px;text-decoration:none;font-size:15px;">Access Your Member Portal →</a>
  </p>
  <p style="font-size:13px;color:#888;text-align:center;margin-top:24px;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">help@handypioneers.com</a> | (360) 544-9858</p>
</td></tr></table></body></html>`;

    await sendEmail({
      to: customerEmail,
      subject: `Welcome to the 360° Method — ${tier.charAt(0).toUpperCase() + tier.slice(1)} Membership Confirmed`,
      html: welcomeHtml,
    }).catch((err) => console.error("[360 Webhook] Welcome email failed:", err));
  }

  // ── 6. Create/match CRM customer + open lead opportunity in pro app ────────
  let crmCustomerId: number | null = null;
  try {
    if (customerEmail) {
      const existingCrm = await findCustomerByEmail(customerEmail);
      if (existingCrm) {
        crmCustomerId = existingCrm.id;
        // ── Update existing CRM customer profile with 360° signup data ──
        try {
          const tierTag = `360° ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
          const memberTag = "360° Member";
          const existingTags: string[] = existingCrm.tags
            ? JSON.parse(existingCrm.tags as unknown as string)
            : [];
          const newTags = Array.from(new Set([...existingTags, memberTag, tierTag]));
          const appendNote = `\n[360° Enrollment] ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier (${cadence}) — Membership ID: ${membershipId} — ${new Date().toLocaleDateString()}`;
          await updateCustomer(existingCrm.id, {
            // Fill phone if blank
            ...(customerPhone && !existingCrm.mobilePhone ? { mobilePhone: customerPhone } : {}),
            // Fill address fields if blank
            ...(serviceAddress && !existingCrm.street ? { street: serviceAddress } : {}),
            ...(serviceCity && !existingCrm.city ? { city: serviceCity } : {}),
            ...(serviceState && !existingCrm.state ? { state: serviceState } : {}),
            ...(serviceZip && !existingCrm.zip ? { zip: serviceZip } : {}),
            // Always update tags and notes
            tags: JSON.stringify(newTags),
            customerNotes: ((existingCrm.customerNotes ?? "") + appendNote).trim(),
            // Set leadSource if blank
            ...(!existingCrm.leadSource ? { leadSource: "360 Funnel" } : {}),
          });
          console.log(`[360 Webhook] Updated CRM customer ${existingCrm.id} with 360° membership data`);
        } catch (updateErr) {
          console.error("[360 Webhook] Failed to update existing CRM customer profile:", updateErr);
        }
      } else {
        const nameParts = customerName.trim().split(" ");
        const firstName = nameParts[0] ?? "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const displayName = `${firstName} ${lastName}`.trim();
        const newCrm = await createCustomer({
          id: nanoid(),
          firstName,
          lastName,
          displayName,
          email: customerEmail.toLowerCase().trim(),
          mobilePhone: customerPhone || "",
          street: serviceAddress,
          city: serviceCity,
          state: serviceState,
          zip: serviceZip,
          customerType: "homeowner",
          leadSource: "360 Funnel",
          customerNotes: `Enrolled via 360° Method funnel — ${tier} tier (${cadence}) — Membership ID: ${membershipId}`,
          sendNotifications: true,
          tags: JSON.stringify(["360° Member", `360° ${tier.charAt(0).toUpperCase() + tier.slice(1)}`]),
        });
        crmCustomerId = newCrm.id;
      }
      // Link CRM customer back to membership
      if (crmCustomerId) {
        await db
          .update(threeSixtyMemberships)
          .set({ hpCustomerId: crmCustomerId.toString() })
          .where(eq(threeSixtyMemberships.id, membershipId));
      }
      // Archive any open "Cart Abandoned" leads for this customer
      if (crmCustomerId) {
        try {
          const abandoned = await listOpportunities("lead", String(crmCustomerId), false);
          const cartAbandoned = abandoned.filter(o => o.stage === "Cart Abandoned");
          await Promise.all(
            cartAbandoned.map(o =>
              updateOpportunity(o.id, {
                archived: true,
                notes: (o.notes ? o.notes + "\n" : "") +
                  `[Auto-archived] Customer completed 360° checkout on ${new Date().toLocaleDateString()}. Membership ID: ${membershipId}.`,
              })
            )
          );
          if (cartAbandoned.length > 0) {
            console.log(`[360 Webhook] Archived ${cartAbandoned.length} Cart Abandoned lead(s) for customer ${crmCustomerId}`);
          }
        } catch (err) {
          console.error("[360 Webhook] Failed to archive Cart Abandoned leads:", err);
        }
      }
      // Open a lead opportunity tagged as 360-funnel
      if (crmCustomerId) {
        await createOpportunity({
          id: nanoid(),
          customerId: String(crmCustomerId),
          area: "lead",
          stage: "New Lead",
          title: `360° Membership — ${tier.charAt(0).toUpperCase() + tier.slice(1)} (${cadence})`,
          notes: `Enrolled via 360° funnel. Stripe subscription: ${session.subscription ?? "n/a"}. Membership ID: ${membershipId}.\nService address: ${serviceAddress}, ${serviceCity}, ${serviceState} ${serviceZip}`,
          archived: false,
        }).catch((err: Error) => console.error("[360 Webhook] createOpportunity failed:", err));
      }
    }
  } catch (err) {
    console.error("[360 Webhook] CRM customer/opportunity creation failed:", err);
  }

  // ── 7. Notify HP owner ────────────────────────────────────────────────────
  await notifyOwner({
    title: `🏠 New 360° Member — ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
    content: `${customerName} (${customerEmail}) enrolled in the ${tier} tier (${cadence} billing). Membership ID: ${membershipId}. Schedule their Annual 360° Home Scan within 48 hours.`,
  }).catch(() => null);
}
