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
  DEFAULT_ROADMAP_DROPOUT_STEPS,
  ROADMAP_FOLLOWUP_KEY,
  ROADMAP_DROPOUT_KEY,
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

  it("dropout cadence has four steps at 45m / 24h / 3d / 7d (email, sms, email, email)", () => {
    const t0 = new Date("2026-06-05T10:00:00Z");
    const planned = planSchedule(DEFAULT_ROADMAP_DROPOUT_STEPS, t0);
    expect(planned).toHaveLength(4);
    expect(planned.map((s) => s.key)).toEqual([
      "t_plus_45m_email",
      "t_plus_24h_sms",
      "t_plus_3d_email",
      "t_plus_7d_email",
    ]);
    expect(planned.map((s) => s.channel)).toEqual(["email", "sms", "email", "email"]);
    expect(planned.map((s) => s.scheduledFor.getTime() - t0.getTime())).toEqual([
      45 * 60_000,
      24 * 60 * 60_000,
      3 * 24 * 60 * 60_000,
      7 * 24 * 60 * 60_000,
    ]);
    for (const step of DEFAULT_ROADMAP_DROPOUT_STEPS) {
      expect(step.voicePrompt.length).toBeGreaterThan(60);
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

/**
 * Walk a drizzle predicate (eq / and trees) and collect {columnName: value}
 * pairs so the fake can honor playbook-scoped filters. Test-only; relies on
 * drizzle exposing Column.name and Param.value inside queryChunks.
 */
function predicatePairs(pred: any): Record<string, unknown> {
  const pairs: Record<string, unknown> = {};
  const walk = (node: any, lastCol: string | null = null): string | null => {
    if (!node || typeof node !== "object") return lastCol;
    if (Array.isArray(node.queryChunks)) {
      for (const chunk of node.queryChunks) {
        lastCol = walk(chunk, lastCol);
      }
      return lastCol;
    }
    if (typeof node.name === "string" && !("value" in node)) {
      return node.name; // a Column — remember it for the next Param
    }
    if ("encoder" in node && "value" in node && lastCol) {
      pairs[lastCol] = node.value; // a Param — pair it with the last column
      return null;
    }
    return lastCol; // StringChunk etc. — pass through
  };
  walk(pred);
  return pairs;
}

function matchesPairs(d: FakeDraft, pairs: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(pairs)) {
    if ((d as any)[k] !== v) return false;
  }
  return true;
}

function buildFakeDb(opts: {
  customer: { id: string; bypassAutoNurture?: boolean; email?: string; mobilePhone?: string };
}) {
  const inserted: FakeDraft[] = [];
  let nextId = 1;

  // The chainable `.where()` doubles as a Promise so callers can either await
  // it directly (drizzle returns an array of rows) or chain `.limit(n)`.
  const buildWhereResult = (table: any, pred: any) => {
    const resolveRows = (): Promise<unknown[]> => {
      const name = tableName(table);
      if (name === "customers") {
        return Promise.resolve(opts.customer ? [opts.customer] : []);
      }
      if (name === "agentDrafts") {
        const pairs = predicatePairs(pred);
        return Promise.resolve(inserted.filter((d) => matchesPairs(d, pairs)));
      }
      // nurturerPlaybooks etc. — empty, so loadPlaybook falls back to the
      // in-memory defaults (matches a cold start before the boot seed).
      return Promise.resolve([]);
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
        where: (pred: any) => buildWhereResult(table, pred),
        orderBy: () => ({
          limit: () => Promise.resolve([] as FakeDraft[]),
        }),
      }),
    }),
    update: (table: any) => ({
      set: (patch: Partial<FakeDraft>) => ({
        where: (pred: any) => {
          if (tableName(table) === "agentDrafts") {
            const pairs = predicatePairs(pred);
            for (const d of inserted) {
              if (matchesPairs(d, pairs)) {
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

  it("schedules the dropout cadence under its own playbook key", async () => {
    const customer = { id: "cust_4", firstName: "Step", lastName: "One", bypassAutoNurture: false, email: "s1@example.com", mobilePhone: "+15035550000" };
    const fakeDb = buildFakeDb({ customer });
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const t0 = new Date("2026-06-05T10:00:00Z");
    const result = await scheduleRoadmapFollowup({
      customerId: customer.id,
      playbookKey: ROADMAP_DROPOUT_KEY,
      startedAt: t0,
    });

    expect(result.skipped).toBeNull();
    expect(result.scheduled).toBe(4);
    const inserted = (fakeDb as any)._inserted as FakeDraft[];
    expect(inserted.every((d) => d.playbookKey === ROADMAP_DROPOUT_KEY)).toBe(true);
    expect(inserted[0].scheduledFor.getTime()).toBe(t0.getTime() + 45 * 60_000);
  });

  it("scoped cancel drains only the dropout cadence, leaving the followup untouched", async () => {
    const customer = { id: "cust_5", firstName: "Both", lastName: "Cadences", bypassAutoNurture: false, email: "b@example.com", mobilePhone: "+15035550001" };
    const fakeDb = buildFakeDb({ customer });
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const t0 = new Date("2026-06-05T10:00:00Z");
    await scheduleRoadmapFollowup({ customerId: customer.id, startedAt: t0 });
    await scheduleRoadmapFollowup({ customerId: customer.id, playbookKey: ROADMAP_DROPOUT_KEY, startedAt: t0 });
    const inserted = (fakeDb as any)._inserted as FakeDraft[];
    expect(inserted.filter((d) => d.status === "pending")).toHaveLength(9); // 5 + 4

    const result = await cancelPendingFollowupsForCustomer(customer.id, "report_submitted", {
      playbookKey: ROADMAP_DROPOUT_KEY,
    });
    expect(result.cancelled).toBe(4);

    const pendingAfter = inserted.filter((d) => d.status === "pending");
    expect(pendingAfter).toHaveLength(5);
    expect(pendingAfter.every((d) => d.playbookKey === ROADMAP_FOLLOWUP_KEY)).toBe(true);
    const cancelledAfter = inserted.filter((d) => d.status === "cancelled");
    expect(cancelledAfter.every((d) => d.playbookKey === ROADMAP_DROPOUT_KEY)).toBe(true);
    expect(cancelledAfter.every((d) => d.cancelReason === "report_submitted")).toBe(true);
  });
});
