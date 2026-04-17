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
  threeSixtyWorkOrders,
  portalCustomers,
} from "../drizzle/schema";
import { eq, isNotNull, lte, gt, and } from "drizzle-orm";
import { TIER_DEFINITIONS, type MemberTier, type BillingCadence } from "../shared/threeSixtyTiers";
import { sendEmail } from "./gmail";
import { notifyOwner } from "./_core/notification";
import { sendSms } from "./twilio";
import { ENV } from "./_core/env";
import {
  findCustomerByEmail,
  createCustomer,
  updateCustomer,
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
  if (!db) throw new Error('Database unavailable');
  const meta = session.metadata ?? {};

  // Normalize funnel tier names (exterior_shield/full_coverage/max/essential/full/maximum) to internal names
  const TIER_NAME_MAP: Record<string, MemberTier> = {
    exterior_shield: "bronze", bronze: "bronze", essential: "bronze",
    full_coverage: "silver", silver: "silver", full: "silver",
    max: "gold", gold: "gold", maximum: "gold",
  };
  const rawTier = (meta.tier ?? "bronze").toLowerCase();
  const tier = (TIER_NAME_MAP[rawTier] ?? "bronze") as MemberTier;
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
  // Deferred labor bank: monthly silver/gold credit loads after 90 days
  const deferCredit = cadence === "monthly" && (tier === "silver" || tier === "gold");
  const scheduledCreditAt = deferCredit ? now + 90 * 24 * 60 * 60 * 1000 : null;
  const scheduledCreditCents = deferCredit ? tierDef.laborBankCreditCents : 0;
  const initialBalance = deferCredit ? 0 : tierDef.laborBankCreditCents;

  const membershipResult = await db.insert(threeSixtyMemberships).values({
    customerId: String(portalCustomerId ?? ''), // CRM customer ID (string nanoid) — linked later
    propertyAddressId: propertyAddressId ?? undefined,
    tier,
    status: "active",
    startDate: now,
    renewalDate: calcRenewalDate(cadence),
    laborBankBalance: initialBalance,
    stripeSubscriptionId: session.subscription as string | undefined,
    stripeCustomerId: session.customer as string | undefined,
    billingCadence: cadence,
    annualScanCompleted: false,
    scheduledCreditAt: scheduledCreditAt ?? undefined,
    scheduledCreditCents,
  });
  const membershipId = (membershipResult as any).insertId as number;

  // ── 3. Add initial labor bank credit (immediate; deferred for monthly silver/gold) ─
  if (tierDef.laborBankCreditCents > 0 && !deferCredit) {
    await db.insert(threeSixtyLaborBankTransactions).values({
      membershipId,
      type: "credit",
      amountCents: tierDef.laborBankCreditCents,
      description: `Initial ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier enrollment credit`,
      createdAt: new Date(),
    });
  } else if (deferCredit) {
    console.log(`[360 Webhook] Labor bank credit deferred 90 days for membership ${membershipId} (monthly ${tier})`);
  }

  // ── 4. Schedule first seasonal visit ─────────────────────────────────────
  const currentSeason = getCurrentSeason();
  // Bronze only gets spring + fall; skip summer/winter for bronze
  const shouldSchedule =
    tier !== "bronze" || currentSeason === "spring" || currentSeason === "fall";

  if (shouldSchedule) {
    await db.insert(threeSixtyVisits).values({
      membershipId,
      customerId: String(portalCustomerId ?? ''),
      season: currentSeason,
      status: "scheduled",
      visitYear: new Date().getFullYear(),
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
  let crmCustomerId: string | null = null;
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
      // Create a scheduled job for the Annual 360° Home Scan
      if (crmCustomerId) {
        await createOpportunity({
          id: nanoid(),
          customerId: String(crmCustomerId),
          area: "job",
          stage: "Scheduled",
          title: `Annual 360° Home Scan — ${tier.charAt(0).toUpperCase() + tier.slice(1)} Member`,
          notes: [
            `Auto-created on 360° enrollment.`,
            `Tier: ${tier} | Cadence: ${cadence} | Membership ID: ${membershipId}`,
            `Stripe subscription: ${session.subscription ?? "n/a"}`,
            `Service address: ${serviceAddress}, ${serviceCity}, ${serviceState} ${serviceZip}`,
            `ACTION: Schedule Annual 360° Home Scan within 48 hours.`,
          ].join("\n"),
          archived: false,
        }).catch((err: Error) => console.error("[360 Webhook] createOpportunity (job) failed:", err));
      }
    }
  } catch (err) {
    console.error("[360 Webhook] CRM customer/opportunity creation failed:", err);
  }

  // ── 7. Auto-create baseline work order ──────────────────────────────────────
  try {
    const crmCustomerId = String(portalCustomerId ?? '');
    const currentYear = new Date().getFullYear();
    await db.insert(threeSixtyWorkOrders).values({
      membershipId,
      customerId: crmCustomerId,
      type: 'baseline_scan',
      status: 'open',
      visitYear: currentYear,
    });
  } catch (err) {
    console.error('[360 Webhook] Failed to create baseline work order:', err);
  }

  // ── 8. Notify HP owner ────────────────────────────────────────────────────
  await notifyOwner({
    title: `🏠 New 360° Member — ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
    content: `${customerName} (${customerEmail}) enrolled in the ${tier} tier (${cadence} billing). Membership ID: ${membershipId}. A baseline work order has been created — schedule within 48 hours.`,
  }).catch(() => null);

  // ── 9. SMS owner alert ────────────────────────────────────────────────────
  if (ENV.ownerPhone) {
    await sendSms(
      ENV.ownerPhone,
      `[Handy Pioneers] New 360° Enrollment: ${customerName} — ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier. Schedule baseline scan within 48h. Membership #${membershipId}.`
    ).catch((err) => console.error('[360 Webhook] SMS alert failed:', err));
  }
}


// PORTFOLIO WEBHOOK HANDLER
// create360PortfolioMembershipsFromWebhook — handles planType=portfolio Stripe sessions

export async function create360PortfolioMembershipsFromWebhook(
  session: Stripe.Checkout.Session
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const meta = session.metadata ?? {};
  const cadence = (meta.cadence ?? "annual") as BillingCadence;
  const customerEmail = meta.customerEmail || session.customer_email || "";
  const customerName = meta.customerName || "Portfolio Member";
  const customerPhone = meta.customerPhone || "";
  const interiorAddonDoors = parseInt(meta.interiorAddonDoors ?? "0") || 0;
  let properties: Array<{ address: string; city: string; state: string; zip: string; tier: string; units: number; interiorAddon: boolean; interiorDoors: number }> = [];
  try { properties = JSON.parse(meta.properties ?? "[]"); } catch { /* ignore */ }
  const now = Date.now();

  // Find or create portalCustomer
  let portalCustomerId: number | null = null;
  if (customerEmail) {
    const [existing] = await db.select().from(portalCustomers).where(eq(portalCustomers.email, customerEmail)).limit(1);
    if (existing) {
      portalCustomerId = existing.id;
      if (session.customer && !existing.stripeCustomerId) {
        await db.update(portalCustomers).set({ stripeCustomerId: session.customer as string }).where(eq(portalCustomers.id, existing.id));
      }
    } else {
      const result = await db.insert(portalCustomers).values({
        name: customerName,
        email: customerEmail,
        phone: customerPhone || undefined,
        stripeCustomerId: session.customer as string | undefined,
      });
      portalCustomerId = (result as any).insertId as number;
    }
  }

  // Create portfolio membership record
  const membershipResult = await db.insert(threeSixtyMemberships).values({
    customerId: String(portalCustomerId ?? ''),
    tier: "bronze",
    status: "active",
    startDate: now,
    renewalDate: calcRenewalDate(cadence),
    laborBankBalance: 0,
    stripeSubscriptionId: session.subscription as string | undefined,
    stripeCustomerId: session.customer as string | undefined,
    billingCadence: cadence,
    annualScanCompleted: false,
    scheduledCreditAt: undefined,
    scheduledCreditCents: 0,
  });
  const membershipId = (membershipResult as any).insertId as number;

  // CRM customer
  let crmCustomerId: string | null = null;
  try {
    if (customerEmail) {
      const existingCrm = await findCustomerByEmail(customerEmail);
      if (existingCrm) {
        crmCustomerId = existingCrm.id;
        const existingTags: string[] = existingCrm.tags ? JSON.parse(existingCrm.tags as unknown as string) : [];
        const newTags = Array.from(new Set([...existingTags, "360 Portfolio", "360 Member"]));
        await updateCustomer(existingCrm.id, {
          tags: JSON.stringify(newTags),
          customerNotes: ((existingCrm.customerNotes ?? "") + `\n[360 Portfolio] ${properties.length} properties (${cadence}) — Membership ID: ${membershipId} — ${new Date().toLocaleDateString()}`).trim(),
        });
      } else {
        const nameParts = customerName.trim().split(" ");
        const newCrm = await createCustomer({
          id: nanoid(),
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" ") || "",
          displayName: customerName.trim(),
          email: customerEmail.toLowerCase().trim(),
          mobilePhone: customerPhone || "",
          customerType: "landlord",
          leadSource: "360 Portfolio Funnel",
          customerNotes: `Enrolled via 360 Portfolio funnel — ${properties.length} properties (${cadence}) — Membership ID: ${membershipId}`,
          sendNotifications: true,
          tags: JSON.stringify(["360 Portfolio", "360 Member"]),
        });
        crmCustomerId = newCrm.id;
      }
      if (crmCustomerId) {
        await db.update(threeSixtyMemberships).set({ hpCustomerId: crmCustomerId.toString() }).where(eq(threeSixtyMemberships.id, membershipId));
        // Archive any cart abandoned leads
        const abandoned = await listOpportunities("lead", String(crmCustomerId), false);
        await Promise.all(
          abandoned
            .filter(o => o.stage === "Cart Abandoned")
            .map(o => updateOpportunity(o.id, {
              archived: true,
              notes: (o.notes ? o.notes + "\n" : "") + `[Auto-archived] Portfolio checkout completed. Membership ID: ${membershipId}.`,
            }))
        );
        // Create scheduled job for Portfolio Scan
        await createOpportunity({
          id: nanoid(),
          customerId: String(crmCustomerId),
          area: "job",
          stage: "Scheduled",
          title: `Annual 360 Portfolio Scan — ${properties.length} Properties`,
          notes: [
            `Auto-created on 360 Portfolio enrollment.`,
            `Properties: ${properties.length} | Cadence: ${cadence} | Membership ID: ${membershipId}`,
            `Stripe: ${session.subscription ?? "n/a"}`,
            `ACTION: Schedule within 48 hours.`,
          ].join("\n"),
          archived: false,
        }).catch((err: Error) => console.error("[360 Portfolio Webhook] createOpportunity failed:", err));
      }
    }
  } catch (err) {
    console.error("[360 Portfolio Webhook] CRM failed:", err);
  }

  // Welcome email
  if (customerEmail) {
    const html = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;"><table width="600" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#0f1f3d,#1a3a6b);padding:32px 40px;text-align:center;"><p style="color:#c8922a;font-size:28px;font-weight:900;margin:0;">360</p><p style="color:#fff;font-size:16px;font-weight:700;margin:4px 0 0;">Portfolio Plan Confirmed</p></td></tr><tr><td style="padding:36px 40px;color:#1a1a1a;font-size:15px;line-height:1.7;"><p>Hi ${customerName.split(" ")[0]},</p><p>Your <strong>${properties.length}-property portfolio</strong> is enrolled in the 360 Method. Our team will reach out within 48 hours to schedule your first Annual 360 Portfolio Scan.</p><p style="text-align:center;margin-top:28px;"><a href="https://client.handypioneers.com" style="display:inline-block;background:#c8922a;color:#fff;font-weight:700;padding:14px 36px;border-radius:6px;text-decoration:none;">Access Your Member Portal</a></p></td></tr></table></body></html>`;
    await sendEmail({
      to: customerEmail,
      subject: `360 Portfolio Plan Confirmed — ${properties.length} Properties`,
      html,
    }).catch(err => console.error("[360 Portfolio Webhook] Email failed:", err));
  }

  await notifyOwner({
    title: `New 360 Portfolio — ${properties.length} Properties`,
    content: `${customerName} (${customerEmail}) enrolled ${properties.length} properties (${cadence}). Membership ID: ${membershipId}. Schedule Portfolio Scan within 48 hours.`,
  }).catch(() => null);

  if (ENV.ownerPhone) {
    await sendSms(
      ENV.ownerPhone,
      `[Handy Pioneers] New 360° Portfolio: ${customerName} — ${properties.length} properties (${cadence}). Schedule scan within 48h. Membership #${membershipId}.`
    ).catch((err) => console.error('[360 Portfolio Webhook] SMS alert failed:', err));
  }
}

// DEFERRED CREDIT RELEASE
// Call this from a scheduled job (e.g., daily cron) to release labor bank credits
// that were deferred 90 days for monthly silver/gold members.

export async function releaseDeferredLaborBankCredits(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const now = Date.now();
  const due = await db
    .select()
    .from(threeSixtyMemberships)
    .where(
      and(
        isNotNull(threeSixtyMemberships.scheduledCreditAt),
        lte(threeSixtyMemberships.scheduledCreditAt, now),
        gt(threeSixtyMemberships.scheduledCreditCents, 0)
      )
    );
  let credited = 0;
  for (const row of due) {
    try {
      await db.insert(threeSixtyLaborBankTransactions).values({
        membershipId: row.id,
        type: "credit",
        amountCents: row.scheduledCreditCents!,
        description: `Deferred 90-day labor bank credit — ${row.tier} monthly plan`,
        createdAt: new Date(),
      });
      await db.update(threeSixtyMemberships)
        .set({
          laborBankBalance: (row.laborBankBalance ?? 0) + row.scheduledCreditCents!,
          scheduledCreditCents: 0,
          scheduledCreditAt: undefined,
        })
        .where(eq(threeSixtyMemberships.id, row.id));
      console.log(`[360 Deferred Credit] Released ${row.scheduledCreditCents} cents for membership ${row.id}`);
      credited++;
    } catch (err) {
      console.error(`[360 Deferred Credit] Failed for membership ${row.id}:`, err);
    }
  }
  return credited;
}
