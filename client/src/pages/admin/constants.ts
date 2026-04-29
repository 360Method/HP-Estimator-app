export const DEPARTMENTS = [
  { slug: "sales", label: "Sales & Lead Management", tileGroup: "Pipeline" },
  { slug: "operations", label: "Operations", tileGroup: "Operations" },
  { slug: "marketing", label: "Marketing", tileGroup: "Marketing" },
  { slug: "finance", label: "Finance", tileGroup: "Finance" },
  { slug: "customer_success", label: "Customer Success", tileGroup: "CX" },
  { slug: "vendor_network", label: "Vendor Network", tileGroup: "Operations" },
  { slug: "technology", label: "Technology", tileGroup: "Agent Health" },
  { slug: "strategy", label: "Strategy & Expansion", tileGroup: "Revenue" },
  { slug: "integrator", label: "Integrator", tileGroup: "Agent Health" },
] as const;

export type DepartmentSlug = (typeof DEPARTMENTS)[number]["slug"];

export const TILE_GROUPS = [
  "Revenue",
  "Pipeline",
  "Members",
  "Operations",
  "Marketing",
  "Finance",
  "CX",
  "Agent Health",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  draft_queue: "Draft",
  autonomous: "Autonomous",
  paused: "Paused",
  disabled: "Disabled",
};

export const STATUS_CLASS: Record<string, string> = {
  draft_queue: "bg-amber-100 text-amber-700 border-amber-200",
  autonomous: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-slate-100 text-slate-700 border-slate-200",
  disabled: "bg-red-100 text-red-700 border-red-200",
};

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function departmentLabel(slug: string): string {
  return DEPARTMENTS.find((d) => d.slug === slug)?.label ?? slug;
}
