/**
 * server/lib/projectEstimator/processor.ts
 *
 * Calls Claude with the estimator prompt, parses the JSON response, runs the
 * margin-floor enforcement, and recomputes the customer-facing range.
 *
 * Margin enforcement is local to this module so it runs even if Claude
 * returns inconsistent math. The prompt asks Claude to comply, but we
 * verify and adjust here so the customer never sees a sub-floor estimate.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  PROJECT_ESTIMATOR_MODEL,
  PROJECT_ESTIMATOR_SYSTEM_PROMPT,
  PROJECT_ESTIMATOR_USER_TEMPLATE,
  RANGE_BUFFER,
  SMALL_JOB_THRESHOLD_USD,
  SMALL_JOB_MIN_MARGIN,
  STANDARD_MIN_MARGIN,
} from "./prompt";
import type {
  EstimatorClaudeResponse,
  EstimatorEffortLine,
  EstimatorMaterialLine,
} from "../../../drizzle/schema.bookConsultation";

export type ProcessInput = {
  serviceType: string;
  description: string;
  timeline: string;
  address: string;
  photoUrls: string[];
  additionalContext?: {
    sqft?: number | null;
    yearBuilt?: number | null;
    urgency?: string | null;
    budgetHint?: string | null;
  };
  apiKey: string;
};

export async function callClaudeForEstimate(
  input: ProcessInput,
): Promise<EstimatorClaudeResponse> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const response = await client.messages.create({
    model: PROJECT_ESTIMATOR_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: PROJECT_ESTIMATOR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: PROJECT_ESTIMATOR_USER_TEMPLATE({
          serviceType: input.serviceType,
          description: input.description,
          timeline: input.timeline,
          address: input.address,
          photos: input.photoUrls,
          additionalContext: input.additionalContext,
        }),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }

  const parsed = extractJson(textBlock.text) as EstimatorClaudeResponse;
  return enforceMarginFloor(parsed);
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : text;
  const firstBrace = payload.indexOf("{");
  const lastBrace = payload.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in Claude response");
  }
  return JSON.parse(payload.slice(firstBrace, lastBrace + 1));
}

// ─── Margin enforcement ─────────────────────────────────────────────────────

/**
 * Recompute totals from line items and uplift the customer total if the
 * realized gross margin is below the floor. Internal labor lines are NOT
 * touched (they're already at the customer rate); we proportionally raise
 * sub-labor and materials markup to close the gap.
 *
 * Always recomputes the ±25% range from the (possibly uplifted) customer
 * total. Always recomputes gross_margin_pct.
 */
export function enforceMarginFloor(
  resp: EstimatorClaudeResponse,
): EstimatorClaudeResponse {
  const effort = resp.effort_breakdown ?? [];
  const materials = resp.materials ?? [];

  // Recompute line totals defensively (Claude may round).
  const cleanedEffort: EstimatorEffortLine[] = effort.map(normalizeEffortLine);
  const cleanedMaterials: EstimatorMaterialLine[] = materials.map(
    normalizeMaterialLine,
  );

  let customerTotal = sumCustomerTotals(cleanedEffort, cleanedMaterials);
  let hardCost = sumHardCosts(cleanedEffort, cleanedMaterials);

  if (customerTotal <= 0 || hardCost <= 0) {
    return {
      ...resp,
      effort_breakdown: cleanedEffort,
      materials: cleanedMaterials,
      hard_cost_subtotal_usd: hardCost,
      customer_total_usd: customerTotal,
      customer_range_low_usd: Math.max(0, Math.round(customerTotal * (1 - RANGE_BUFFER))),
      customer_range_high_usd: Math.max(0, Math.round(customerTotal * (1 + RANGE_BUFFER))),
      gross_margin_pct: 0,
      margin_floor_applied: false,
    };
  }

  const minMargin =
    hardCost < SMALL_JOB_THRESHOLD_USD ? SMALL_JOB_MIN_MARGIN : STANDARD_MIN_MARGIN;

  let realizedMargin = (customerTotal - hardCost) / customerTotal;
  let floorApplied = false;

  if (realizedMargin < minMargin) {
    // Required customer total to hit the floor: hardCost / (1 - minMargin).
    const requiredTotal = hardCost / (1 - minMargin);
    const liftableHardCost = sumLiftableHardCost(cleanedEffort, cleanedMaterials);
    const liftableCustomer = sumLiftableCustomer(cleanedEffort, cleanedMaterials);
    const fixedCustomer = customerTotal - liftableCustomer; // internal labor stays
    const newLiftableCustomer = requiredTotal - fixedCustomer;

    if (liftableHardCost > 0 && newLiftableCustomer > 0) {
      const newMultiplier = newLiftableCustomer / liftableHardCost;
      applyLiftMultiplier(cleanedEffort, cleanedMaterials, newMultiplier);
      customerTotal = sumCustomerTotals(cleanedEffort, cleanedMaterials);
      hardCost = sumHardCosts(cleanedEffort, cleanedMaterials);
      realizedMargin = (customerTotal - hardCost) / customerTotal;
      floorApplied = true;
    } else {
      // Fallback: if there's nothing to lift (all internal labor), uplift the
      // customer total directly via a single synthetic margin adjustment by
      // appending a "scope contingency" materials line. This is rare.
      const adjustment = Math.max(0, requiredTotal - customerTotal);
      cleanedMaterials.push({
        description: "Project coordination & contingency",
        quantity: 1,
        unit_cost_usd: 0,
        markup_multiplier: 1.0,
        customer_line_total_usd: Math.round(adjustment),
        hard_cost_usd: 0,
      });
      customerTotal = sumCustomerTotals(cleanedEffort, cleanedMaterials);
      realizedMargin = (customerTotal - hardCost) / customerTotal;
      floorApplied = true;
    }
  }

  const customerTotalRounded = Math.round(customerTotal);
  return {
    ...resp,
    effort_breakdown: cleanedEffort,
    materials: cleanedMaterials,
    hard_cost_subtotal_usd: Math.round(hardCost),
    customer_total_usd: customerTotalRounded,
    customer_range_low_usd: Math.round(customerTotalRounded * (1 - RANGE_BUFFER)),
    customer_range_high_usd: Math.round(customerTotalRounded * (1 + RANGE_BUFFER)),
    gross_margin_pct: Math.round(realizedMargin * 1000) / 10,
    margin_floor_applied: floorApplied,
  };
}

function normalizeEffortLine(l: EstimatorEffortLine): EstimatorEffortLine {
  const hours = Number(l.hours) || 0;
  const rate = Number(l.rate_basis_usd) || 0;
  const markup = l.source === "internal" ? 1.0 : Number(l.markup_multiplier) || 1.5;
  const customer = Math.round(hours * rate * markup);
  // Internal hard cost = customer rate (all-in opportunity cost).
  // Subcontractor hard cost = hours × cost rate (no markup).
  const hardCost =
    l.source === "internal"
      ? Math.round(hours * rate)
      : Math.round(hours * rate);
  return {
    ...l,
    hours,
    rate_basis_usd: rate,
    markup_multiplier: markup,
    customer_line_total_usd: customer,
    hard_cost_usd: hardCost,
  };
}

function normalizeMaterialLine(l: EstimatorMaterialLine): EstimatorMaterialLine {
  const qty = Number(l.quantity) || 0;
  const unit = Number(l.unit_cost_usd) || 0;
  const markup = Number(l.markup_multiplier) || 1.5;
  const hardCost = Math.round(qty * unit);
  const customer = Math.round(hardCost * markup);
  return {
    ...l,
    quantity: qty,
    unit_cost_usd: unit,
    markup_multiplier: markup,
    customer_line_total_usd: customer,
    hard_cost_usd: hardCost,
  };
}

function sumCustomerTotals(
  effort: EstimatorEffortLine[],
  materials: EstimatorMaterialLine[],
) {
  return (
    effort.reduce((acc, l) => acc + (l.customer_line_total_usd || 0), 0) +
    materials.reduce((acc, l) => acc + (l.customer_line_total_usd || 0), 0)
  );
}

function sumHardCosts(
  effort: EstimatorEffortLine[],
  materials: EstimatorMaterialLine[],
) {
  return (
    effort.reduce((acc, l) => acc + (l.hard_cost_usd || 0), 0) +
    materials.reduce((acc, l) => acc + (l.hard_cost_usd || 0), 0)
  );
}

/** Liftable = sub-labor + materials. Internal labor is fixed at $150/hr. */
function sumLiftableHardCost(
  effort: EstimatorEffortLine[],
  materials: EstimatorMaterialLine[],
) {
  return (
    effort
      .filter((l) => l.source === "subcontractor")
      .reduce((acc, l) => acc + l.hard_cost_usd, 0) +
    materials.reduce((acc, l) => acc + l.hard_cost_usd, 0)
  );
}

function sumLiftableCustomer(
  effort: EstimatorEffortLine[],
  materials: EstimatorMaterialLine[],
) {
  return (
    effort
      .filter((l) => l.source === "subcontractor")
      .reduce((acc, l) => acc + l.customer_line_total_usd, 0) +
    materials.reduce((acc, l) => acc + l.customer_line_total_usd, 0)
  );
}

function applyLiftMultiplier(
  effort: EstimatorEffortLine[],
  materials: EstimatorMaterialLine[],
  newMultiplier: number,
) {
  for (const l of effort) {
    if (l.source !== "subcontractor") continue;
    l.markup_multiplier = newMultiplier;
    l.customer_line_total_usd = Math.round(l.hard_cost_usd * newMultiplier);
  }
  for (const l of materials) {
    l.markup_multiplier = newMultiplier;
    l.customer_line_total_usd = Math.round(l.hard_cost_usd * newMultiplier);
  }
}

// ─── ID minting ─────────────────────────────────────────────────────────────
import { randomUUID } from "crypto";

export function newProjectEstimateId(): string {
  return `pe_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
