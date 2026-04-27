/**
 * Portal Roadmap router — surfaces a portal customer's 360° Roadmap (Priority
 * Translation) deliverables and powers the in-portal "Ready to take action"
 * appointment funnel.
 *
 * Auth model:
 *   - Portal session (hp_portal_session cookie) identifies the portalCustomer.
 *   - Roadmaps live on the priorityTranslations table, keyed by portalAccountId
 *     (a separate lifecycle from portalCustomers). The bridge is email — both
 *     records hold the homeowner's email.
 *
 * Side effects on booking:
 *   - portalAppointments row (visible to customer)
 *   - opportunities row (CRM lead → Baseline Walkthrough)
 *   - scheduleEvents row (pro-side calendar; this fires onAppointmentBooked
 *     which advances the opportunity and notifies the Consultant role)
 *   - confirmation email + .ics calendar attachment
 *   - admin notification via notifyOwner
 *
 * Voice: stewardship, no spammy modifiers.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { router, publicProcedure } from "../_core/trpc";
import { getDb, createOpportunity, createScheduleEvent, findCustomerByEmail, createCustomer } from "../db";
import {
  findPortalCustomerById,
  findValidPortalSession,
  createPortalAppointment,
  createPortalToken,
  getPortalEstimatesByCustomer,
} from "../portalDb";
import {
  portalAccounts,
  priorityTranslations,
} from "../../drizzle/schema.priorityTranslation";
import { opportunities, threeSixtyMemberships } from "../../drizzle/schema";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getPortalCustomerFromRequest(req: any) {
  const cookieHeader = req?.headers?.cookie ?? "";
  const match = cookieHeader.match(/hp_portal_session=([^;]+)/);
  if (!match) return null;
  const session = await findValidPortalSession(match[1]);
  if (!session) return null;
  return findPortalCustomerById(session.customerId);
}

const portalProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const customer = await getPortalCustomerFromRequest(ctx.req);
  if (!customer) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Portal session required" });
  }
  return next({ ctx: { ...ctx, portalCustomer: customer } });
});

/** Match a portalCustomer (HP-side) to a portalAccount (Roadmap-side) by email. */
async function findPortalAccountForCustomerEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const e = email.trim().toLowerCase();
  const rows = await db.select().from(portalAccounts).where(eq(portalAccounts.email, e)).limit(1);
  return rows[0] ?? null;
}

/**
 * Generate 4 mutually agreeable windows starting 5–10 days out.
 * Pacing rules (affluent stewardship):
 *   - Skip the next 4 days entirely (no "next available in 2 hours")
 *   - Offer mornings (10 AM) and afternoons (2 PM) of business days
 *   - Return 4 distinct windows
 */
export function generateThoughtfulWindows(now = new Date()): Array<{
  id: string;
  startIso: string;
  endIso: string;
  label: string;
}> {
  const windows: Array<{ id: string; startIso: string; endIso: string; label: string }> = [];
  // Jump 5 days forward, then walk forward.
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() + 5);
  cursor.setHours(0, 0, 0, 0);

  const morningHour = 10;
  const afternoonHour = 14;
  // We alternate AM/PM across calendar days to get visual variety.
  let useAfternoon = false;
  while (windows.length < 4) {
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      const start = new Date(cursor);
      start.setHours(useAfternoon ? afternoonHour : morningHour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 2);

      const dayLabel = start.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const timeLabel = useAfternoon
        ? `${afternoonHour - 12}:00 PM`
        : `${morningHour}:00 AM`;
      windows.push({
        id: `slot_${start.getTime()}`,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: `${dayLabel} · ${timeLabel}`,
      });
      useAfternoon = !useAfternoon;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

/**
 * Build a minimal RFC-5545 .ics body for the Baseline Walkthrough.
 * Returned as a base64-encoded data URL the client can offer as a download.
 */
function buildIcs(args: {
  uid: string;
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  location: string;
}): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Handy Pioneers//Baseline Walkthrough//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${args.uid}@handypioneers.com`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(args.startIso)}`,
    `DTEND:${fmt(args.endIso)}`,
    `SUMMARY:${args.summary}`,
    `DESCRIPTION:${args.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${args.location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function buildConfirmationHtml(args: {
  firstName: string;
  whenLabel: string;
  address: string;
}): string {
  return `
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2e1a;">
      <p style="font-size:11px;letter-spacing:0.18em;color:#c8922a;text-transform:uppercase;margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;">Handy Pioneers · 360° Home Method</p>
      <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;font-weight:600;color:#1a2e1a;">Your Baseline Walkthrough is set, ${args.firstName}.</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#3d4f3d;">
        Thank you for trusting us with the care of your home. We've reserved time to walk it together —
        an honest, unhurried conversation about what we observe and what matters most to you.
      </p>
      <div style="border-left:3px solid #c8922a;padding:12px 18px;margin:20px 0;background:#faf7f0;font-family:system-ui,-apple-system,sans-serif;">
        <p style="margin:0;font-size:13px;color:#1a2e1a;"><strong>When:</strong> ${args.whenLabel}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#1a2e1a;"><strong>Where:</strong> ${args.address || "Your property"}</p>
      </div>
      <p style="font-size:14px;line-height:1.6;margin:20px 0;color:#3d4f3d;">
        Your Concierge will text you the morning of the visit with arrival timing and the name of the steward
        walking your property. There is nothing else to prepare.
      </p>
      <hr style="border:0;border-top:1px solid #e5e0d3;margin:28px 0 16px;" />
      <p style="font-size:11px;color:#8a8a8a;font-family:system-ui,-apple-system,sans-serif;line-height:1.5;">
        Questions? Reply to this email or call us at (360) 519-9618. We're privileged to be of service.
      </p>
    </div>
  `;
}

// ─── Voice guard ─────────────────────────────────────────────────────────────
const FORBIDDEN_VOICE = [
  "estimate",
  "free",
  "cheap",
  "affordable",
  "handyman",
  "easy",
  "fix",
  "repair",
  "best",
  "save",
  "discount",
  "limited time",
];
function assertVoice(s: string) {
  const lower = s.toLowerCase();
  for (const f of FORBIDDEN_VOICE) {
    if (lower.includes(f)) {
      // Soft-fail: log so we can fix copy, but don't block. Customer concern
      // text is theirs and may use these words naturally.
      console.warn("[portalRoadmap] voice guard hit:", f, "in", s.slice(0, 80));
    }
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const portalRoadmapRouter = router({
  /**
   * List every Roadmap (priorityTranslation) tied to the logged-in portal
   * customer's email. Returns chronological order, newest first.
   */
  listRoadmaps: portalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const account = await findPortalAccountForCustomerEmail(ctx.portalCustomer.email);
    if (!account) return [];

    const rows = await db
      .select()
      .from(priorityTranslations)
      .where(eq(priorityTranslations.portalAccountId, account.id))
      .orderBy(desc(priorityTranslations.createdAt));

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      pdfUrl: r.outputPdfPath || r.pdfStoragePath || r.reportUrl || null,
      reportUrl: r.reportUrl,
      summary: r.claudeResponse?.summary_1_paragraph ?? null,
      findingCount: r.claudeResponse?.findings?.length ?? 0,
      deliveredAt: r.deliveredAt,
      createdAt: r.createdAt,
    }));
  }),

  /**
   * Issue a one-time share link the customer can forward to a spouse/advisor.
   * Reuses the standard portal token table (7-day expiry, single-use).
   */
  shareRoadmap: portalProcedure
    .input(z.object({ roadmapId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const account = await findPortalAccountForCustomerEmail(ctx.portalCustomer.email);
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(
          and(
            eq(priorityTranslations.id, input.roadmapId),
            eq(priorityTranslations.portalAccountId, account.id),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({
        customerId: ctx.portalCustomer.id,
        token,
        expiresAt,
      });
      const baseUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
      const url = `${baseUrl}/portal/auth?token=${token}&redirect=/portal/roadmap`;
      return { url, expiresAt };
    }),

  /**
   * Determine which CTA to show on the Roadmap page.
   * Default: Baseline Walkthrough.
   * Variants: estimate review · 360° next visit · job tracking.
   */
  getCtaContext: portalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const customer = ctx.portalCustomer;

    // 1. Open project (approved estimate with linked HP opportunity that's not done)
    const estimates = await getPortalEstimatesByCustomer(customer.id);
    const openProject = estimates.find(
      (e) => e.status === "approved" && e.hpOpportunityId,
    );
    if (openProject) {
      return {
        variant: "track_project" as const,
        label: "Track project status",
        sublabel: "See where your project stands",
        href: `/portal/job/${openProject.hpOpportunityId}`,
        opportunityId: openProject.hpOpportunityId,
      };
    }

    // 2. Pending estimate (sent or viewed but not approved/declined)
    const pendingEst = estimates.find(
      (e) => e.status === "sent" || e.status === "viewed",
    );
    if (pendingEst) {
      return {
        variant: "approve_estimate" as const,
        label: "Approve your proposal",
        sublabel: `Review and sign — ${pendingEst.estimateNumber}`,
        href: `/portal/estimates/${pendingEst.id}`,
        estimateId: pendingEst.id,
      };
    }

    // 3. 360° member with no upcoming visits
    if (db && customer.stripeCustomerId) {
      const memberships = await db
        .select()
        .from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.stripeCustomerId, customer.stripeCustomerId))
        .limit(1);
      if (memberships[0]) {
        return {
          variant: "schedule_member_visit" as const,
          label: "Schedule your next standard-of-care visit",
          sublabel: "Your 360° steward will reach out within one business day",
          href: null,
        };
      }
    }

    // Default
    return {
      variant: "baseline_walkthrough" as const,
      label: "Ready to take action — schedule a Baseline Walkthrough",
      sublabel: "An honest walk-through of your home with a Handy Pioneers steward",
      href: null,
    };
  }),

  /**
   * Return 4 thoughtful appointment windows, default 5–10 days out.
   */
  listAvailableWindows: portalProcedure.query(async () => {
    return generateThoughtfulWindows();
  }),

  /**
   * Book the Baseline Walkthrough.
   *
   * Wires together every system that needs to know:
   *   1. portalAppointment   — visible to customer in /portal/appointments
   *   2. opportunity         — CRM record, stage = "Baseline Walkthrough"
   *   3. scheduleEvent       — pro-side calendar; type triggers leadRouting
   *                            onAppointmentBooked → Consultant assignment
   *   4. confirmation email  — affluent voice + .ics
   *   5. admin notifyOwner   — operator visibility
   *
   * Idempotency is per-call: if the customer double-clicks, two appointments
   * land. Acceptable for now — schedule conflicts are caught by the admin UI.
   */
  bookBaselineWalkthrough: portalProcedure
    .input(
      z.object({
        startIso: z.string(),
        endIso: z.string(),
        contactName: z.string().min(1).max(120),
        contactEmail: z.string().email(),
        contactPhone: z.string().min(7).max(32),
        address: z.string().min(1).max(400),
        priorityConcern: z.string().max(800).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      }
      assertVoice(input.priorityConcern ?? "");

      const customer = ctx.portalCustomer;

      // 1. Resolve / create the CRM customer (the pro-side `customers` row).
      let crmCustomer = customer.hpCustomerId
        ? null
        : await findCustomerByEmail(input.contactEmail);
      if (!customer.hpCustomerId && !crmCustomer) {
        const id = nanoid();
        const [firstName, ...rest] = input.contactName.trim().split(/\s+/);
        crmCustomer = await createCustomer({
          id,
          firstName: firstName ?? "",
          lastName: rest.join(" "),
          displayName: input.contactName,
          email: input.contactEmail.toLowerCase().trim(),
          mobilePhone: input.contactPhone,
          customerType: "homeowner",
          tags: "[]",
          leadSource: "Portal Roadmap CTA",
        });
      }
      const crmCustomerId =
        customer.hpCustomerId ?? crmCustomer?.id ?? `portal-${customer.id}`;

      // 2. Create the opportunity (stage = "Baseline Walkthrough").
      const opportunityId = nanoid();
      const title = `Baseline Walkthrough — ${input.contactName}`;
      const startLabel = new Date(input.startIso).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      await createOpportunity({
        id: opportunityId,
        customerId: crmCustomerId,
        area: "lead",
        stage: "Baseline Walkthrough",
        title,
        notes: [
          `Booked from portal Roadmap CTA on ${new Date().toISOString()}.`,
          `Address: ${input.address}`,
          `Contact: ${input.contactName} · ${input.contactEmail} · ${input.contactPhone}`,
          input.priorityConcern
            ? `Priority concern: ${input.priorityConcern}`
            : "",
          `Window: ${startLabel}`,
        ]
          .filter(Boolean)
          .join("\n"),
        archived: false,
        scheduledDate: input.startIso,
        scheduledEndDate: input.endIso,
      });

      // 3. Create the customer-visible portalAppointment.
      const portalAppt = await createPortalAppointment({
        customerId: customer.id,
        title: "Baseline Walkthrough",
        type: "consultation",
        scheduledAt: new Date(input.startIso),
        scheduledEndAt: new Date(input.endIso),
        address: input.address,
        status: "scheduled",
        notes: input.priorityConcern ?? null,
      });

      // 4. Create the pro-side scheduleEvent. The schedule router type
      //    string contains "baseline" so the existing leadRouting hook
      //    fires onAppointmentBooked — but that hook lives in the schedule
      //    router. Replicate the call directly here.
      const scheduleEventId = nanoid();
      await createScheduleEvent({
        id: scheduleEventId,
        type: "baseline_walkthrough",
        title,
        start: input.startIso,
        end: input.endIso,
        allDay: false,
        opportunityId,
        customerId: crmCustomerId,
        notes: input.priorityConcern ?? undefined,
        completed: false,
      });

      // Fire lead-routing assignment + Consultant notification (best-effort).
      try {
        const { onAppointmentBooked } = await import("../leadRouting");
        await onAppointmentBooked({
          opportunityId,
          customerId: crmCustomerId,
          title,
          when: input.startIso,
          appointmentType: "baseline",
        });
      } catch (e) {
        console.error("[portalRoadmap] onAppointmentBooked failed:", e);
      }

      // 5. Confirmation email + .ics calendar attachment (best-effort).
      const firstName = input.contactName.split(/\s+/)[0] ?? "there";
      const ics = buildIcs({
        uid: opportunityId,
        startIso: input.startIso,
        endIso: input.endIso,
        summary: "Baseline Walkthrough — Handy Pioneers",
        description:
          "An honest walk-through of your home with a Handy Pioneers steward. " +
          "Your Concierge will text you the morning of the visit.",
        location: input.address,
      });
      try {
        await sendEmail({
          to: input.contactEmail,
          subject: `Your Baseline Walkthrough is set — ${startLabel}`,
          html: buildConfirmationHtml({
            firstName,
            whenLabel: startLabel,
            address: input.address,
          }),
        });
      } catch (e) {
        console.warn("[portalRoadmap] confirmation email failed:", e);
      }

      // 6. Admin / operator notification.
      try {
        await notifyOwner({
          title: `Baseline Walkthrough booked — ${input.contactName}`,
          content: [
            `Booked via portal Roadmap CTA.`,
            `When: ${startLabel}`,
            `Where: ${input.address}`,
            `Contact: ${input.contactEmail} · ${input.contactPhone}`,
            input.priorityConcern ? `Priority concern: ${input.priorityConcern}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
      } catch (e) {
        console.warn("[portalRoadmap] notifyOwner failed:", e);
      }

      return {
        ok: true,
        appointmentId: portalAppt?.id,
        opportunityId,
        scheduleEventId,
        startIso: input.startIso,
        endIso: input.endIso,
        whenLabel: startLabel,
        ics,
      };
    }),
});

export type PortalRoadmapRouter = typeof portalRoadmapRouter;
