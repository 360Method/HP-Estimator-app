/**
 * shared/homeSystems.ts
 *
 * The one home-area taxonomy for spot inspections and everything
 * downstream: capture chips on the consultant's phone, the AI prompt and
 * validation, the spot-to-estimate transfer, and PDF grouping. Free text
 * snaps onto a key via normalizeToSystem so the categories stay
 * constrained without ever hard-failing on a model's wording.
 */

export type HomeSystemKey =
  | "roof"
  | "exterior_envelope"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "structural"
  | "interior"
  | "cosmetic"
  | "site_drainage"
  | "other";

export type HomeSystem = {
  key: HomeSystemKey;
  /** Internal label on capture chips and admin surfaces. */
  label: string;
  /** What the homeowner sees on deliverables. */
  customerLabel: string;
  /** Lowercased fragments that snap free text onto this system. */
  keywords: string[];
  sortOrder: number;
};

export const HOME_SYSTEMS: HomeSystem[] = [
  {
    key: "roof",
    label: "Roof and gutters",
    customerLabel: "Roof and gutters",
    keywords: ["roof", "shingle", "gutter", "downspout", "flashing", "chimney", "skylight", "fascia", "soffit", "eave", "moss"],
    sortOrder: 1,
  },
  {
    key: "exterior_envelope",
    label: "Exterior envelope",
    customerLabel: "Exterior and siding",
    keywords: ["siding", "exterior", "envelope", "window", "door", "trim", "caulk", "paint", "deck", "fence", "stucco", "brick", "weatherstrip"],
    sortOrder: 2,
  },
  {
    key: "plumbing",
    label: "Plumbing",
    customerLabel: "Plumbing",
    keywords: ["plumb", "pipe", "leak", "water heater", "drain", "faucet", "toilet", "sink", "supply line", "shutoff", "sewer", "sump"],
    sortOrder: 3,
  },
  {
    key: "electrical",
    label: "Electrical",
    customerLabel: "Electrical",
    keywords: ["electric", "panel", "breaker", "outlet", "wiring", "gfci", "afci", "light fixture", "switch", "smoke detector", "receptacle"],
    sortOrder: 4,
  },
  {
    key: "hvac",
    label: "Heating and cooling",
    customerLabel: "Heating and cooling",
    keywords: ["hvac", "furnace", "heat pump", "air condition", "ac unit", "duct", "thermostat", "ventilation", "filter", "mini split", "boiler"],
    sortOrder: 5,
  },
  {
    key: "structural",
    label: "Structural",
    customerLabel: "Structure and foundation",
    keywords: ["structur", "foundation", "framing", "joist", "beam", "crawl space", "crawlspace", "settling", "crack", "post", "sill", "subfloor"],
    sortOrder: 6,
  },
  {
    key: "interior",
    label: "Interior",
    customerLabel: "Interior",
    keywords: ["interior", "drywall", "ceiling", "floor", "stair", "insulation", "attic", "cabinet", "countertop", "tile", "bathroom", "kitchen"],
    sortOrder: 7,
  },
  {
    key: "cosmetic",
    label: "Cosmetic",
    customerLabel: "Cosmetic and finish",
    keywords: ["cosmetic", "finish", "touch up", "touch-up", "scuff", "stain", "patch", "refresh"],
    sortOrder: 8,
  },
  {
    key: "site_drainage",
    label: "Site and drainage",
    customerLabel: "Yard and drainage",
    keywords: ["drainage", "grade", "grading", "yard", "landscap", "walkway", "driveway", "retaining", "erosion", "standing water", "french drain"],
    sortOrder: 9,
  },
  {
    key: "other",
    label: "Other",
    customerLabel: "Other",
    keywords: [],
    sortOrder: 10,
  },
];

const BY_KEY = new Map(HOME_SYSTEMS.map((s) => [s.key, s]));

export function isHomeSystemKey(value: unknown): value is HomeSystemKey {
  return typeof value === "string" && BY_KEY.has(value as HomeSystemKey);
}

export function homeSystemLabel(key: HomeSystemKey, audience: "internal" | "customer" = "internal"): string {
  const s = BY_KEY.get(key);
  if (!s) return "Other";
  return audience === "customer" ? s.customerLabel : s.label;
}

/**
 * Snap free text (an AI category, a legacy finding label) onto a system
 * key. Never fails: anything unrecognized lands on "other".
 */
export function normalizeToSystem(freeText: string | null | undefined): HomeSystemKey {
  const text = (freeText ?? "").toLowerCase().trim();
  if (!text) return "other";
  if (isHomeSystemKey(text)) return text;
  // Score by how many of a system's keywords appear ("GFCI outlets in the
  // bathroom" is electrical twice and interior once), tie-break on the
  // total matched length.
  let best: { key: HomeSystemKey; hits: number; len: number } | null = null;
  for (const s of HOME_SYSTEMS) {
    let hits = 0;
    let len = 0;
    for (const kw of s.keywords) {
      if (text.includes(kw)) {
        hits += 1;
        len += kw.length;
      }
    }
    if (hits > 0 && (!best || hits > best.hits || (hits === best.hits && len > best.len))) {
      best = { key: s.key, hits, len };
    }
  }
  return best?.key ?? "other";
}
