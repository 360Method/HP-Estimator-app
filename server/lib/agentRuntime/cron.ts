/**
 * server/lib/agentRuntime/cron.ts
 *
 * Tiny cron expression evaluator. Five-field standard: minute hour dom month dow.
 * Supports `*`, comma lists (`1,5,10`), and step (`* /5`). Range and slash
 * combos (`9-17/2`) and named months/days are NOT supported — keep it boring.
 *
 * Why hand-rolled instead of `node-cron`: avoids adding a dep just to read
 * five integers. The agent scheduler already polls every 30s, so we only need
 * a `shouldFire(expr, now, lastRunAt)` predicate, not a full daemon.
 *
 * Timezone is applied via Intl.DateTimeFormat — no tzdata bundle needed.
 */

export type CronFields = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>; // 1-12
  dayOfWeek: Set<number>; // 0-6 (Sunday=0)
};

export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = parseField(parts[0], 0, 59);
  const hour = parseField(parts[1], 0, 23);
  const dayOfMonth = parseField(parts[2], 1, 31);
  const month = parseField(parts[3], 1, 12);
  const dayOfWeek = parseField(parts[4], 0, 6);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function parseField(raw: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  const tokens = raw.split(",");
  for (const tok of tokens) {
    let step = 1;
    let body = tok;
    const slashIdx = tok.indexOf("/");
    if (slashIdx >= 0) {
      step = Number(tok.slice(slashIdx + 1));
      body = tok.slice(0, slashIdx);
      if (!Number.isFinite(step) || step <= 0) return null;
    }
    if (body === "*") {
      for (let v = min; v <= max; v += step) out.add(v);
      continue;
    }
    if (body.includes("-")) {
      const [a, b] = body.split("-").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < min || b > max || a > b) return null;
      for (let v = a; v <= b; v += step) out.add(v);
      continue;
    }
    const n = Number(body);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    out.add(n);
  }
  return out;
}

/**
 * Returns true when `now` (in `tz`) matches `expr` AND we haven't already
 * fired in the last 60s (idempotent across multiple scheduler ticks). The
 * caller is expected to persist `lastRunAt` and pass it back next tick.
 */
export function shouldFire(
  expr: string,
  now: Date,
  lastRunAt: Date | null,
  tz: string = "America/Los_Angeles"
): boolean {
  const fields = parseCron(expr);
  if (!fields) return false;
  const local = toTzParts(now, tz);
  if (!fields.minute.has(local.minute)) return false;
  if (!fields.hour.has(local.hour)) return false;
  if (!fields.month.has(local.month)) return false;
  // Standard cron: if both dom and dow are restricted (not *), fire on either match.
  // We approximate "is restricted" by checking if the set is the full range.
  const domAll = fields.dayOfMonth.size === 31;
  const dowAll = fields.dayOfWeek.size === 7;
  if (!domAll && !dowAll) {
    if (!fields.dayOfMonth.has(local.day) && !fields.dayOfWeek.has(local.dow)) return false;
  } else {
    if (!fields.dayOfMonth.has(local.day)) return false;
    if (!fields.dayOfWeek.has(local.dow)) return false;
  }
  // De-dupe — this minute already fired.
  if (lastRunAt) {
    const elapsed = now.getTime() - lastRunAt.getTime();
    if (elapsed < 60_000) return false;
  }
  return true;
}

type TzParts = { minute: number; hour: number; day: number; month: number; dow: number };

function toTzParts(date: Date, tz: string): TzParts {
  // Intl.DateTimeFormat with timeZone gives us localized fields. We then map
  // weekday name → number ourselves because `weekday: 'short'` is locale-tuned.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    minute: "2-digit",
    hour: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "0";
  // hour with hour12:false sometimes returns '24' at midnight; clamp.
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const day = Number(get("day"));
  const month = Number(get("month"));
  const dow = WEEKDAY_TO_NUM[get("weekday")] ?? 0;
  return { minute, hour, day, month, dow };
}

const WEEKDAY_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
