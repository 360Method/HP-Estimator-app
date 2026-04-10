import { z } from "zod";
import { randomBytes } from "crypto";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { sendEmail } from "../gmail";
import { sendSms, isTwilioConfigured } from "../twilio";
import { createPortalToken } from "../portalDb";

// ─── Catalog: all line items the AI can reference ──────────────────────────
const CATALOG = [
  // Phase 1 — Pre-Construction
  { id: "p1-site", phase: 1, phaseName: "Pre-Construction", name: "Site Assessment / Measurements", unit: "hr" },
  { id: "p1-permit", phase: 1, phaseName: "Pre-Construction", name: "Permit Pulling", unit: "unit" },
  { id: "p1-material", phase: 1, phaseName: "Pre-Construction", name: "Material Procurement / Lead Time Tracking", unit: "hr" },
  { id: "p1-sub", phase: 1, phaseName: "Pre-Construction", name: "Subcontractor Scheduling", unit: "hr" },
  // Phase 2 — Demo
  { id: "p2-demo-int", phase: 2, phaseName: "Demo & Rough Work", name: "Interior Demolition", unit: "sqft" },
  { id: "p2-demo-ext", phase: 2, phaseName: "Demo & Rough Work", name: "Exterior Demolition", unit: "sqft" },
  { id: "p2-haul", phase: 2, phaseName: "Demo & Rough Work", name: "Haul-Away / Dumpster", unit: "load" },
  { id: "p2-hazmat", phase: 2, phaseName: "Demo & Rough Work", name: "Asbestos / Hazmat Testing & Abatement", unit: "unit" },
  { id: "p2-struct", phase: 2, phaseName: "Demo & Rough Work", name: "Structural Work (Beams, Posts, Headers)", unit: "unit" },
  // Phase 3 — Mechanical
  { id: "p3-plumb", phase: 3, phaseName: "Mechanical Rough-In", name: "Plumbing Rough-In", unit: "fixture" },
  { id: "p3-elec", phase: 3, phaseName: "Mechanical Rough-In", name: "Electrical Rough-In", unit: "circuit" },
  { id: "p3-hvac", phase: 3, phaseName: "Mechanical Rough-In", name: "HVAC Rough-In", unit: "unit" },
  { id: "p3-gas", phase: 3, phaseName: "Mechanical Rough-In", name: "Gas Lines", unit: "unit" },
  // Phase 4 — Insulation
  { id: "p4-batt", phase: 4, phaseName: "Insulation & Weatherproofing", name: "Batt Insulation", unit: "sqft" },
  { id: "p4-foam", phase: 4, phaseName: "Insulation & Weatherproofing", name: "Spray Foam Insulation", unit: "sqft" },
  { id: "p4-wrap", phase: 4, phaseName: "Insulation & Weatherproofing", name: "House Wrap / Weather Barrier", unit: "sqft" },
  { id: "p4-vapor", phase: 4, phaseName: "Insulation & Weatherproofing", name: "Vapor Barrier (Crawl Space)", unit: "sqft" },
  // Phase 5 — Drywall
  { id: "p5-hang", phase: 5, phaseName: "Drywall", name: "Hang Drywall", unit: "sqft" },
  { id: "p5-tape", phase: 5, phaseName: "Drywall", name: "Tape, Mud & Finish", unit: "sqft" },
  { id: "p5-texture", phase: 5, phaseName: "Drywall", name: "Texture", unit: "sqft" },
  { id: "p5-repair", phase: 5, phaseName: "Drywall", name: "Drywall Repair / Patch", unit: "patch" },
  // Phase 6 — Flooring
  { id: "p6-subfloor", phase: 6, phaseName: "Flooring", name: "Subfloor Prep", unit: "sqft" },
  { id: "p6-lvp", phase: 6, phaseName: "Flooring", name: "LVP / LVT Flooring", unit: "sqft" },
  { id: "p6-tile", phase: 6, phaseName: "Flooring", name: "Tile Flooring", unit: "sqft" },
  { id: "p6-hardwood", phase: 6, phaseName: "Flooring", name: "Hardwood Flooring", unit: "sqft" },
  { id: "p6-carpet", phase: 6, phaseName: "Flooring", name: "Carpet", unit: "sqft" },
  { id: "p6-trans", phase: 6, phaseName: "Flooring", name: "Transitions & Thresholds", unit: "unit" },
  { id: "p6-demo", phase: 6, phaseName: "Flooring", name: "Floor Demo / Removal", unit: "sqft" },
  // Phase 7 — Tile
  { id: "p7-shower", phase: 7, phaseName: "Tile Work", name: "Shower Wall Tile", unit: "sqft" },
  { id: "p7-tub", phase: 7, phaseName: "Tile Work", name: "Tub Surround Tile", unit: "sqft" },
  { id: "p7-backsplash", phase: 7, phaseName: "Tile Work", name: "Backsplash Tile", unit: "sqft" },
  { id: "p7-feature", phase: 7, phaseName: "Tile Work", name: "Feature Wall / Fireplace Tile", unit: "sqft" },
  { id: "p7-waterproof", phase: 7, phaseName: "Tile Work", name: "Waterproofing / Membrane", unit: "sqft" },
  { id: "p7-grout", phase: 7, phaseName: "Tile Work", name: "Grout, Caulk & Sealing", unit: "sqft" },
  // Phase 8 — Framing
  { id: "p8-wall", phase: 8, phaseName: "Framing & Carpentry", name: "New Wall Framing", unit: "lf" },
  { id: "p8-ceiling", phase: 8, phaseName: "Framing & Carpentry", name: "Ceiling Framing", unit: "sqft" },
  { id: "p8-block", phase: 8, phaseName: "Framing & Carpentry", name: "Blocking (Grab Bars, TV, Cabinets)", unit: "unit" },
  { id: "p8-joist", phase: 8, phaseName: "Framing & Carpentry", name: "Subfloor Framing Repair", unit: "lf" },
  { id: "p8-opening", phase: 8, phaseName: "Framing & Carpentry", name: "Exterior Framing (New Openings)", unit: "opening" },
  // Phase 9 — Exterior
  { id: "p9-siding", phase: 9, phaseName: "Exterior Work", name: "Siding Installation", unit: "sqft" },
  { id: "p9-siding-paint", phase: 9, phaseName: "Exterior Work", name: "Siding Paint / Stain", unit: "sqft" },
  { id: "p9-soffit", phase: 9, phaseName: "Exterior Work", name: "Soffit & Fascia", unit: "lf" },
  { id: "p9-gutter", phase: 9, phaseName: "Exterior Work", name: "Gutters", unit: "lf" },
  { id: "p9-roof", phase: 9, phaseName: "Exterior Work", name: "Roofing", unit: "sqft" },
  { id: "p9-deck", phase: 9, phaseName: "Exterior Work", name: "Deck — New Build", unit: "sqft" },
  { id: "p9-deck-repair", phase: 9, phaseName: "Exterior Work", name: "Deck Refinish / Repair", unit: "sqft" },
  { id: "p9-fence", phase: 9, phaseName: "Exterior Work", name: "Fence — New Install", unit: "lf" },
  { id: "p9-fence-repair", phase: 9, phaseName: "Exterior Work", name: "Fence Repair", unit: "lf" },
  { id: "p9-concrete", phase: 9, phaseName: "Exterior Work", name: "Concrete / Flatwork", unit: "sqft" },
  { id: "p9-landscape", phase: 9, phaseName: "Exterior Work", name: "Landscaping / Cleanup", unit: "hr" },
  // Phase 10 — Doors & Windows
  { id: "p10-int-door", phase: 10, phaseName: "Doors & Windows", name: "Interior Doors", unit: "door" },
  { id: "p10-ext-door", phase: 10, phaseName: "Doors & Windows", name: "Exterior Doors", unit: "door" },
  { id: "p10-pocket", phase: 10, phaseName: "Doors & Windows", name: "Sliding / Pocket Doors", unit: "door" },
  { id: "p10-window", phase: 10, phaseName: "Doors & Windows", name: "Window Replacement", unit: "window" },
  { id: "p10-win-trim", phase: 10, phaseName: "Doors & Windows", name: "Window Trim — Exterior", unit: "window" },
  { id: "p10-hardware", phase: 10, phaseName: "Doors & Windows", name: "Door Hardware", unit: "set" },
  { id: "p10-garage", phase: 10, phaseName: "Doors & Windows", name: "Garage Door Install / Replace", unit: "door" },
  // Phase 11 — Trim
  { id: "p11-bb", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Baseboard", unit: "lf" },
  { id: "p11-dc", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Door Casing", unit: "opening" },
  { id: "p11-wc", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Window Casing", unit: "window" },
  { id: "p11-crown", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Crown Molding", unit: "lf" },
  { id: "p11-chair", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Chair Rail", unit: "lf" },
  { id: "p11-wains", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Wainscoting / Board & Batten", unit: "sqft" },
  { id: "p11-shelf", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Built-In Shelving", unit: "lf" },
  { id: "p11-stair", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Stair Treads & Risers", unit: "step" },
  { id: "p11-rail", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Handrail & Balusters", unit: "lf" },
  { id: "p11-mantel", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Fireplace Mantel", unit: "unit" },
  { id: "p11-closet", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Closet Systems", unit: "unit" },
  { id: "p11-attic", phase: 11, phaseName: "Trim & Finish Carpentry", name: "Attic Access / Pull-Down Stair", unit: "unit" },
  // Phase 12 — Cabinetry
  { id: "p12-cab", phase: 12, phaseName: "Cabinetry & Countertops", name: "Kitchen Cabinets", unit: "lf" },
  { id: "p12-vanity", phase: 12, phaseName: "Cabinetry & Countertops", name: "Bathroom Vanity", unit: "unit" },
  { id: "p12-counter", phase: 12, phaseName: "Cabinetry & Countertops", name: "Countertops", unit: "sqft" },
  { id: "p12-hardware", phase: 12, phaseName: "Cabinetry & Countertops", name: "Cabinet Hardware", unit: "set" },
  { id: "p12-shelf", phase: 12, phaseName: "Cabinetry & Countertops", name: "Shelving (Pantry / Laundry)", unit: "unit" },
  // Phase 13 — Plumbing Finish
  { id: "p13-faucet", phase: 13, phaseName: "Plumbing Finish", name: "Faucet Install", unit: "fixture" },
  { id: "p13-toilet", phase: 13, phaseName: "Plumbing Finish", name: "Toilet Install", unit: "unit" },
  { id: "p13-sink", phase: 13, phaseName: "Plumbing Finish", name: "Sink Install", unit: "unit" },
  { id: "p13-tub", phase: 13, phaseName: "Plumbing Finish", name: "Tub Install", unit: "unit" },
  { id: "p13-shower", phase: 13, phaseName: "Plumbing Finish", name: "Shower Install", unit: "unit" },
  { id: "p13-wh", phase: 13, phaseName: "Plumbing Finish", name: "Water Heater", unit: "unit" },
  { id: "p13-dw", phase: 13, phaseName: "Plumbing Finish", name: "Dishwasher Hookup", unit: "unit" },
  { id: "p13-disp", phase: 13, phaseName: "Plumbing Finish", name: "Garbage Disposal", unit: "unit" },
  { id: "p13-washer", phase: 13, phaseName: "Plumbing Finish", name: "Washer Hookup", unit: "unit" },
  // Phase 14 — Electrical Finish
  { id: "p14-light", phase: 14, phaseName: "Electrical Finish", name: "Light Fixture Swap", unit: "fixture" },
  { id: "p14-fan", phase: 14, phaseName: "Electrical Finish", name: "Ceiling Fan Install", unit: "fan" },
  { id: "p14-outlet", phase: 14, phaseName: "Electrical Finish", name: "Outlet / Switch Replacement", unit: "device" },
  { id: "p14-gfci", phase: 14, phaseName: "Electrical Finish", name: "GFCI Outlet Install", unit: "device" },
  { id: "p14-undercab", phase: 14, phaseName: "Electrical Finish", name: "Under-Cabinet Lighting", unit: "lf" },
  { id: "p14-can", phase: 14, phaseName: "Electrical Finish", name: "Recessed Can Lights", unit: "can" },
  { id: "p14-exhaust", phase: 14, phaseName: "Electrical Finish", name: "Exhaust Fan (Bath)", unit: "fan" },
  { id: "p14-circuit", phase: 14, phaseName: "Electrical Finish", name: "Dedicated Appliance Circuits", unit: "circuit" },
  { id: "p14-smart", phase: 14, phaseName: "Electrical Finish", name: "Smart Switch / Dimmer", unit: "device" },
  { id: "p14-doorbell", phase: 14, phaseName: "Electrical Finish", name: "Doorbell / Camera Rough-In", unit: "unit" },
  // Phase 15 — Painting
  { id: "p15-int-wall", phase: 15, phaseName: "Painting", name: "Interior Walls", unit: "sqft" },
  { id: "p15-ceiling", phase: 15, phaseName: "Painting", name: "Interior Ceilings", unit: "sqft" },
  { id: "p15-trim", phase: 15, phaseName: "Painting", name: "Interior Trim & Doors — Paint", unit: "lf" },
  { id: "p15-cab", phase: 15, phaseName: "Painting", name: "Cabinet Painting", unit: "box" },
  { id: "p15-ext-wall", phase: 15, phaseName: "Painting", name: "Exterior Walls / Siding", unit: "sqft" },
  { id: "p15-ext-trim", phase: 15, phaseName: "Painting", name: "Exterior Trim, Fascia, Soffits", unit: "lf" },
  { id: "p15-deck", phase: 15, phaseName: "Painting", name: "Deck Stain / Paint", unit: "sqft" },
  { id: "p15-fence", phase: 15, phaseName: "Painting", name: "Fence Stain / Paint", unit: "lf" },
  { id: "p15-epoxy", phase: 15, phaseName: "Painting", name: "Epoxy Floor Coating (Garage)", unit: "sqft" },
  // Phase 16 — Appliances
  { id: "p16-appliance", phase: 16, phaseName: "Appliances & Specialties", name: "Appliance Install", unit: "unit" },
  { id: "p16-hood", phase: 16, phaseName: "Appliances & Specialties", name: "Hood Vent Install", unit: "unit" },
  { id: "p16-fireplace", phase: 16, phaseName: "Appliances & Specialties", name: "Fireplace Gas Insert", unit: "unit" },
  { id: "p16-bath-acc", phase: 16, phaseName: "Appliances & Specialties", name: "Bathroom Accessories", unit: "unit" },
  { id: "p16-blinds", phase: 16, phaseName: "Appliances & Specialties", name: "Window Treatments / Blinds", unit: "window" },
  // Phase 17 — Closeout
  { id: "p17-clean", phase: 17, phaseName: "Final Cleaning & Closeout", name: "Post-Construction Clean — Interior", unit: "sqft" },
  { id: "p17-windows", phase: 17, phaseName: "Final Cleaning & Closeout", name: "Window Cleaning — Post-Construction", unit: "window" },
  { id: "p17-ext-clean", phase: 17, phaseName: "Final Cleaning & Closeout", name: "Exterior Site Cleanup", unit: "hr" },
  { id: "p17-punch", phase: 17, phaseName: "Final Cleaning & Closeout", name: "Touch-Up Punch List", unit: "hr" },
  { id: "p17-walkthrough", phase: 17, phaseName: "Final Cleaning & Closeout", name: "Final Walkthrough / Sign-Off", unit: "hr" },
];

// ─── JSON schema the LLM must return ───────────────────────────────────────
const AI_ESTIMATE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "estimate_parse",
    strict: true,
    schema: {
      type: "object",
      properties: {
        jobTitle: { type: "string", description: "Short job title inferred from notes (max 60 chars)" },
        scopeSummary: { type: "string", description: "2-3 sentence scope summary for the estimate header" },
        lineItems: {
          type: "array",
          description: "Catalog items to enable in the calculator",
          items: {
            type: "object",
            properties: {
              itemId: { type: "string", description: "Exact item ID from the catalog (e.g. p11-bb)" },
              qty: { type: "number", description: "Quantity in the item's native unit" },
              tier: { type: "string", enum: ["good", "better", "best"], description: "Material/quality tier" },
              paintPrepMode: { type: "string", enum: ["none", "caulk", "full"], description: "Paint prep mode: none=skip, caulk=caulk+prime only (for pre-primed), full=sand+prime+paint" },
              notes: { type: "string", description: "Brief note explaining the mapping (max 80 chars)" },
            },
            required: ["itemId", "qty", "tier", "paintPrepMode", "notes"],
            additionalProperties: false,
          },
        },
        customItems: {
          type: "array",
          description: "Items with no catalog match — added as custom line items",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "Short description of the custom item" },
              qty: { type: "number" },
              unit: { type: "string", description: "Unit label (e.g. door, hr, lf, unit)" },
              estimatedHrsPerUnit: { type: "number", description: "Estimated labor hours per unit" },
              notes: { type: "string", description: "Why this is a custom item (max 80 chars)" },
            },
            required: ["description", "qty", "unit", "estimatedHrsPerUnit", "notes"],
            additionalProperties: false,
          },
        },
        warnings: {
          type: "array",
          description: "Ambiguous items, assumptions made, or items needing estimator review",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["info", "review", "missing"] },
              message: { type: "string", description: "Clear description of the ambiguity or assumption" },
            },
            required: ["severity", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["jobTitle", "scopeSummary", "lineItems", "customItems", "warnings"],
      additionalProperties: false,
    },
  },
};

// ─── Prompt builder ─────────────────────────────────────────────────────────
function buildPrompt(notes: string): string {
  const catalogText = CATALOG.map(
    (item) => `  ${item.id} | Phase ${item.phase}: ${item.phaseName} | "${item.name}" | unit: ${item.unit}`
  ).join("\n");

  return `You are an expert general contractor estimator for Handy Pioneers, a residential remodeling company in Vancouver, WA / Portland metro.

Your job is to parse field walkthrough notes and map them to the estimator catalog below.

## Rules
1. Sum all linear footage lists (e.g. "6, 3, 12, 26" → 47 lf). Show your math in the notes field.
2. Count openings/doors/windows explicitly from the notes.
3. If notes say "pre-primed", "primed", or "factory primed" → set paintPrepMode to "caulk" (caulk-only prep). Otherwise use "full" for raw wood trim or "none" for items that don't need prep.
4. Infer tier from material descriptions: hollow-core/basic/standard → "good", solid-core/MDF/vinyl → "better", solid-wood/poplar/fiberglass/custom → "best".
5. If a task has no catalog match, add it to customItems with a reasonable labor estimate.
6. If a quantity is unclear or ambiguous, set qty to 0 and add a "missing" warning.
7. Never invent scope that isn't in the notes.
8. For "adjust", "service", or "repair" tasks on existing items, use the closest catalog item or add to customItems.

## Catalog (id | phase | name | unit)
${catalogText}

## Walkthrough Notes
${notes}

Return the structured JSON estimate.`;
}

// ─── Router ─────────────────────────────────────────────────────────────────
// ─── AI rewrite helpers ──────────────────────────────────────────────────

/**
 * Rewrites a full phase section (title + description + all SOW bullets)
 * using professional contractor language.
 */
async function aiRewritePhase(input: {
  phaseName: string;
  phaseDescription: string;
  bullets: string[];
  jobTitle: string;
  customerName: string;
}): Promise<{ title: string; description: string; bullets: string[] }> {
  const prompt = [
    `You are a professional contractor writing customer-facing estimate copy for Handy Pioneers, a licensed home improvement company in Vancouver, WA.`,
    ``,
    `Rewrite the following estimate section in clear, professional, friendly language that builds trust with the homeowner.`,
    `Keep the same scope and facts — do NOT add or remove line items. Keep bullets concise (1-2 sentences max).`,
    ``,
    `Job: ${input.jobTitle}`,
    `Customer: ${input.customerName}`,
    ``,
    `Current section title: ${input.phaseName}`,
    `Current section description: ${input.phaseDescription}`,
    `Current SOW bullets:`,
    ...input.bullets.map((b, i) => `${i + 1}. ${b}`),
    ``,
    `Return JSON with: { "title": string, "description": string, "bullets": string[] }`,
    `The bullets array must have exactly ${input.bullets.length} items.`,
  ].join('\n');

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a professional contractor copywriter. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'phase_rewrite',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'description', 'bullets'],
          additionalProperties: false,
        },
      },
    } as Parameters<typeof invokeLLM>[0]['response_format'],
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI returned empty response');
  const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
  return parsed as { title: string; description: string; bullets: string[] };
}

export const estimateRouter = router({
  aiParse: publicProcedure
    .input(z.object({ notes: z.string().min(10).max(8000) }))
    .mutation(async ({ input }) => {
      const prompt = buildPrompt(input.notes);

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are a construction estimating AI. Always return valid JSON matching the schema exactly. Never add fields not in the schema.",
          },
          { role: "user", content: prompt },
        ],
        response_format: AI_ESTIMATE_SCHEMA as Parameters<typeof invokeLLM>[0]["response_format"],
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("AI returned empty response");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      const parsed = JSON.parse(content);
      return parsed as {
        jobTitle: string;
        scopeSummary: string;
        lineItems: Array<{
          itemId: string;
          qty: number;
          tier: "good" | "better" | "best";
          paintPrepMode: "none" | "caulk" | "full";
          notes: string;
        }>;
        customItems: Array<{
          description: string;
          qty: number;
          unit: string;
          estimatedHrsPerUnit: number;
          notes: string;
        }>;
        warnings: Array<{
          severity: "info" | "review" | "missing";
          message: string;
        }>;
      };
    }),

  // ─── Send estimate to customer via email and/or SMS ──────────────────────
  send: publicProcedure
    .input(
      z.object({
        sendEmail: z.boolean().default(true),
        sendSms: z.boolean().default(false),
        toEmail: z.string().email().optional(),
        toPhone: z.string().optional(),
        estimateNumber: z.string(),
        customerName: z.string(),
        jobTitle: z.string(),
        totalPrice: z.number(),
        depositLabel: z.string().optional(),
        depositAmount: z.number().optional(),
        scopeSummary: z.string().optional(),
        lineItemsText: z.string().optional(),
        portalUrl: z.string().optional(),
        customerId: z.number().optional(),
        origin: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const results: { email?: string; sms?: string; errors: string[] } = { errors: [] };

      // Auto-generate portalUrl using the customer portal base URL
      let portalUrl = input.portalUrl;
      if (!portalUrl && input.customerId) {
        try {
          const token = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
          await createPortalToken({ customerId: input.customerId, token, expiresAt });
          const portalBase = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
          portalUrl = `${portalBase}/portal/auth?token=${token}&redirect=/portal/estimates`;
        } catch (e) {
          console.warn('[estimate.send] Could not generate portal token:', e);
        }
      }
      const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // ── Email ──────────────────────────────────────────────────────────────
      if (input.sendEmail && input.toEmail) {
        try {
          const depositLine = input.depositLabel && input.depositAmount
            ? `<tr><td style="padding:4px 0;color:#6b7280;">Deposit Required</td><td style="padding:4px 0;text-align:right;font-weight:600;">${input.depositLabel} — $${fmt(input.depositAmount)}</td></tr>`
            : "";
          const scopeBlock = input.scopeSummary
            ? `<div style="margin:20px 0;"><h3 style="margin:0 0 8px;font-size:14px;color:#374151;">Scope of Work</h3><p style="margin:0;color:#4b5563;line-height:1.6;">${input.scopeSummary.replace(/\n/g, "<br>")}</p></div>`
            : "";
          const lineItemsBlock = input.lineItemsText
            ? `<div style="margin:20px 0;"><h3 style="margin:0 0 8px;font-size:14px;color:#374151;">Estimate Details</h3><pre style="margin:0;font-size:12px;color:#374151;white-space:pre-wrap;font-family:monospace;">${input.lineItemsText}</pre></div>`
            : "";
          const approveBtn = portalUrl
            ? `<div style="text-align:center;margin:28px 0;"><a href="${portalUrl}" style="background:#1e3a5f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Review &amp; Approve Estimate</a></div>`
            : "";

          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f9fafb;"><div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:#1e3a5f;padding:28px 32px;"><div style="color:#fff;font-size:22px;font-weight:700;">Handy Pioneers</div><div style="color:#93c5fd;font-size:13px;margin-top:4px;">Licensed &amp; Insured · Vancouver, WA · HANDYP*761NH</div></div><div style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${input.customerName},</p><p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">Thank you for the opportunity to work with you. Please find your project estimate below.</p><div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;margin-bottom:24px;"><div style="font-size:13px;color:#0369a1;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Estimate Summary</div><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:4px 0;color:#6b7280;">Estimate #</td><td style="padding:4px 0;text-align:right;font-weight:600;">${input.estimateNumber}</td></tr><tr><td style="padding:4px 0;color:#6b7280;">Project</td><td style="padding:4px 0;text-align:right;">${input.jobTitle}</td></tr><tr><td style="padding:4px 0;color:#6b7280;">Total</td><td style="padding:4px 0;text-align:right;font-size:18px;font-weight:700;color:#111827;">$${fmt(input.totalPrice)}</td></tr>${depositLine}</table></div>${scopeBlock}${lineItemsBlock}${approveBtn}<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Questions? Call or text us at <a href="tel:+13605449858" style="color:#1e3a5f;">(360) 544-9858</a> or reply to this email.</p></div><div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Handy Pioneers, LLC · Vancouver, WA · <a href="https://handypioneers.com" style="color:#6b7280;">handypioneers.com</a></p></div></div></body></html>`;

          const res = await sendEmail({
            to: input.toEmail,
            subject: `Handy Pioneers — Project Estimate ${input.estimateNumber}`,
            html,
          });
          results.email = res.messageId || "sent";
        } catch (err: any) {
          results.errors.push(`Email: ${err?.message ?? "failed"}`);
        }
      }

      // ── SMS ────────────────────────────────────────────────────────────────
      if (input.sendSms && input.toPhone) {
        if (!isTwilioConfigured()) {
          results.errors.push("SMS: Twilio not configured");
        } else {
          try {
            const parts = [
              `Hi ${input.customerName}, your Handy Pioneers estimate is ready!`,
              `Estimate ${input.estimateNumber} — ${input.jobTitle}`,
              `Total: $${fmt(input.totalPrice)}`,
              input.depositLabel && input.depositAmount
                ? `Deposit: ${input.depositLabel} — $${fmt(input.depositAmount)}`
                : null,
              portalUrl ? `View & approve: ${portalUrl}` : "Reply or call (360) 544-9858 to approve.",
            ].filter(Boolean) as string[];
            const res = await sendSms(input.toPhone, parts.join("\n"));
            results.sms = res.sid;
          } catch (err: any) {
            results.errors.push(`SMS: ${err?.message ?? "failed"}`);
          }
        }
      }

      if (results.errors.length > 0 && !results.email && !results.sms) {
        throw new Error(results.errors.join("; "));
      }
      return results;
    }),

  // ─── AI rewrite a single phase section ──────────────────────────────────
  rewritePhase: protectedProcedure
    .input(
      z.object({
        phaseName: z.string(),
        phaseDescription: z.string(),
        bullets: z.array(z.string()),
        jobTitle: z.string(),
        customerName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await aiRewritePhase(input);
    }),

  // ─── AI rewrite a single bullet ─────────────────────────────────────────
  rewriteBullet: protectedProcedure
    .input(
      z.object({
        bullet: z.string(),
        phaseName: z.string(),
        jobTitle: z.string(),
        customerName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are a professional contractor copywriter. Return only the rewritten bullet text, no JSON, no quotes, no numbering.' },
          { role: 'user', content: `Rewrite this scope-of-work bullet in clear, professional, friendly language for a homeowner estimate.\n\nJob: ${input.jobTitle}\nCustomer: ${input.customerName}\nSection: ${input.phaseName}\n\nOriginal bullet: ${input.bullet}\n\nReturn only the rewritten bullet text.` },
        ],
      });
      const raw = response.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== 'string') throw new Error('AI returned empty response');
      return { bullet: raw.trim() };
    }),
});
