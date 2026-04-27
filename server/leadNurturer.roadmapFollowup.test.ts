/**
 * Vitest — synthetic test for the post-Roadmap follow-up cadence.
 *
 * Goals:
 *   1. planSchedule returns five steps at the right offsets.
 *   2. scheduleRoadmapFollowup writes one agentDrafts row per step at
 *      `pending` status with the right scheduledFor.
 *   3. customer.bypassAutoNurture short-circuits the cadence.
 *   4. cancelPendingFollowupsForCustomer drains pending drafts.
 *
 * The first test is pure (no DB). The DB-touching tests stub `getDb` so they
 * run without needing a live MySQL — matches the booking.test.ts pattern.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_ROADMAP_FOLLOWUP_STEPS,
  ROADMAP_FOLLOWUP_KEY,
  planSchedule,
} from "./lib/leadNurturer/playbook";

describe("planSchedule — pure timing math", () => {
  it("computes scheduledFor for all five default steps", () => {
    const t0 = new Date("2026-04-27T10:00:00Z");
    const planned = planSchedule(DEFAULT_ROADMAP_FOLLOWUP_STEPS, t0);
    expect(planned).toHaveLength(5);
    expect(planned[0].key).toBe("t_plus_4h_sms");
    expect(planned[0].scheduledFor.getTime()).toBe(t0.getTime() + 4 * 60 * 60_000);

    expect(planned[1].key).toBe("t_plus_24h_email");
    expect(planned[1].scheduledFor.getTime()).toBe(t0.getTime() + 24 * 60 * 60_000);

    expect(planned[2].key).toBe("t_plus_72h_sms");
    expect(planned[2].scheduledFor.getTime()).toBe(t0.getTime() + 72 * 60 * 60_000);

    expect(planned[3].key).toBe("t_plus_7d_email_360");
    expect(planned[3].scheduledFor.getTime()).toBe(t0.getTime() + 7 * 24 * 60 * 60_000);

    expect(planned[4].key).toBe("t_plus_14d_handoff");
    expect(planned[4].scheduledFor.getTime()).toBe(t0.getTime() + 14 * 24 * 60 * 60_000);
  });

  it("step channels match the cadence design (SMS / email mix)", () => {
    const channels = DEFAULT_ROADMAP_FOLLOWUP_STEPS.map((s) => s.channel);
    expect(channels).toEqual(["sms", "email", "sms", "email", "email"]);
  });

  it("voice prompts are non-trivial (Lead Nurturer needs guidance to render the draft)", () => {
    for (const step of DEFAULT_ROADMAP_FOLLOWUP_STEPS) {
      expect(step.voicePrompt.length).toBeGreaterThan(60);
      expect(step.label).toBeTruthy();
    }
  });
});

// ─── DB-touching tests (mocked getDb) ────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./leadRouting", () => ({
  findDefaultUserForRole: vi.fn().mockResolvedValue(7), // a fake "nurturer" id
}));

import { getDb } from "./db";
import {
  cancelPendingFollowupsForCustomer,
  scheduleRoadmapFollowup,
} from "./lib/leadNurturer/roadmapFollowup";

interface FakeDraft {
  id: number;
  customerId: string;
  playbookKey: string;
  stepKey: string;
  channel: "sms" | "email";
  status: "pending" | "ready" | "sent" | "cancelled" | "failed";
  scheduledFor: Date;
  cancelReason: string | null;
}

function buildFakeDb(opts: {
  customer: { id: string; bypassAutoNurture?: boolean; email?: string; mobilePhone?: string };
}) {
  const inserted: FakeDraft[] = [];
  let nextId = 1;

  // The chainable `.where()` doubles as a Promise so callers can either await
  // it directly (drizzle returns an array of rows) or chain `.limit(n)`.
  const buildWhereResult = (table: any) => {
    const resolveRows = (): Promise<unknown[]> => {
      if (tableName(table) === "customers") {
        return Promise.resolve(opts.customer ? [opts.customer] : []);
      }
      return Promise.resolve(inserted.filter((d) => d.status === "pending"));
    };
    const promiseLike = resolveRows();
    return Object.assign(promiseLike, {
      limit: (_n: number) => resolveRows(),
      orderBy: () => ({ limit: () => Promise.resolve([] as FakeDraft[]) }),
    });
  };

  const fakeDb = {
    select: () => ({
      from: (table: any) => ({
        where: (_pred: any) => buildWhereResult(table),
        orderBy: () => ({
          limit: () => Promise.resolve([] as FakeDraft[]),
        }),
      }),
    }),
    update: (table: any) => ({
      set: (patch: Partial<FakeDraft>) => ({
        where: (_pred: any) => {
          // crude but adequate for our two callers — flip status on rows that
          // currently match. The where predicate is a drizzle expression we
          // can't introspect, so we apply patch to all `pending` entries
          // belonging to this customer (matches the orchestrator's intent).
          if (tableName(table) === "agentDrafts") {
            for (const d of inserted) {
              if (d.customerId === opts.customer.id && d.status === "pending") {
                if (patch.status) d.status = patch.status;
                if (patch.cancelReason !== undefined) d.cancelReason = patch.cancelReason;
              }
            }
          }
          return Promise.resolve(undefined);
        },
      }),
    }),
    insert: (table: any) => ({
      values: (rows: any) => {
        if (tableName(table) === "agentDrafts") {
          const arr = Array.isArray(rows) ? rows : [rows];
          for (const r of arr) {
            inserted.push({
              id: nextId++,
              customerId: r.customerId,
              playbookKey: r.playbookKey,
              stepKey: r.stepKey,
              channel: r.channel,
              status: r.status ?? "pending",
              scheduledFor: r.scheduledFor,
              cancelReason: r.cancelReason ?? null,
            });
          }
        }
        return Promise.resolve(undefined);
      },
    }),
    _inserted: inserted,
  };
  return fakeDb;
}

function tableName(t: any): string {
  // drizzle exposes the table name on a hidden Symbol — fall back to the .name property
  const sym = Object.getOwnPropertySymbols(t).find((s) => s.toString().includes("Name"));
  return sym ? t[sym] : t?._?.name ?? "";
}

describe("scheduleRoadmapFollowup — orchestrator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts one pending draft per playbook step at the right offsets", async () => {
    const customer = {
      id: "cust_1",
      firstName: "Avery",
      lastName: "Hamilton",
      displayName: "Avery Hamilton",
      email: "avery@example.com",
      mobilePhone: "+15035551234",
      bypassAutoNurture: false,
      street: "1234 Pioneer Ln",
      city: "Vancouver",
      state: "WA",
      zip: "98661",
    };
    const fakeDb = buildFakeDb({ customer });
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const t0 = new Date("2026-04-27T10:00:00Z");
    const result = await scheduleRoadmapFollowup({
      customerId: customer.id,
      portalAccountId: "portalAcct_1",
      homeHealthRecordId: "hhr_1",
      startedAt: t0,
    });

    expect(result.skipped).toBeNull();
    expect(result.scheduled).toBe(5);
    expect(result.draftIds).toHaveLength(5);

    const inserted = (fakeDb as any)._inserted as FakeDraft[];
    expect(inserted.map((d) => d.stepKey)).toEqual([
      "t_plus_4h_sms",
      "t_plus_24h_email",
      "t_plus_72h_sms",
      "t_plus_7d_email_360",
      "t_plus_14d_handoff",
    ]);
    expect(inserted.every((d) => d.playbookKey === ROADMAP_FOLLOWUP_KEY)).toBe(true);
    expect(inserted.every((d) => d.status === "pending")).toBe(true);

    const offsets = inserted.map((d) => d.scheduledFor.getTime() - t0.getTime());
    expect(offsets).toEqual([
      4 * 60 * 60_000,
      24 * 60 * 60_000,
      72 * 60 * 60_000,
      7 * 24 * 60 * 60_000,
      14 * 24 * 60 * 60_000,
    ]);
  });

  it("skips when customer.bypassAutoNurture is true", async () => {
    const customer = {
      id: "cust_2",
      firstName: "Hand",
      lastName: "Held",
      bypassAutoNurture: true,
      email: "h@example.com",
    };
    const fakeDb = buildFakeDb({ customer });
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const result = await scheduleRoadmapFollowup({ customerId: customer.id });
    expect(result.skipped).toBe("bypass_auto_nurture");
    expect(result.scheduled).toBe(0);
    expect((fakeDb as any)._inserted).toHaveLength(0);
  });

  it("cancelPendingFollowupsForCustomer drains pending drafts only", async () => {
    const customer = { id: "cust_3", firstName: "Engaged", lastName: "Booker", bypassAutoNurture: false };
    const fakeDb = buildFakeDb({ customer });
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    await scheduleRoadmapFollowup({
      customerId: customer.id,
      startedAt: new Date("2026-04-27T10:00:00Z"),
    });
    expect((fakeDb as any)._inserted).toHaveLength(5);

    const result = await cancelPendingFollowupsForCustomer(customer.id, "appointment_scheduled");
    expect(result.cancelled).toBe(5);
    const stillPending = ((fakeDb as any)._inserted as FakeDraft[]).filter((d) => d.status === "pending");
    expect(stillPending).toHaveLength(0);
    const cancelled = ((fakeDb as any)._inserted as FakeDraft[]).filter((d) => d.status === "cancelled");
    expect(cancelled).toHaveLength(5);
    expect(cancelled.every((d) => d.cancelReason === "appointment_scheduled")).toBe(true);
  });
});
