import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import {
  getCustomerById,
  getOpportunityById,
  listMessagesByOpportunity,
} from "../../db";

type BrainPriority = "red" | "yellow" | "green";
type BrainApprovalLevel = "auto_safe" | "review_draft" | "approval_required";

type BaselineTimeframe = "now" | "soon" | "wait";

export type OpportunityBrainRecommendation = {
  source: "claude" | "rules";
  providerConfigured: boolean;
  opportunityId: string;
  customerId: string;
  roleDesk: string;
  methodStepKey: string;
  priority: BrainPriority;
  approvalLevel: BrainApprovalLevel;
  nextAction: string;
  internalBrief: string;
  customerDraft: string;
  approvalReason: string;
  risks: string[];
  missingInputs: string[];
  handoffNotes: string[];
  confidence: number;
};

export type BaselineFindingInput = {
  id: string;
  section: string;
  title: string;
  condition: string;
  severity: string;
  timeframe: string;
  impact: string[];
  notes: string;
  photoCount: number;
  needsSpecialist: boolean;
  createOpportunity: boolean;
};

export type BaselineFindingRecommendation = {
  findingId: string;
  priority: BrainPriority;
  timeframe: BaselineTimeframe;
  confidence: number;
  consultantSummary: string;
  customerSummary: string;
  recommendedAction: string;
  reviewRequired: boolean;
  reviewReason: string;
  qualityFlags: string[];
};

export type BaselinePrioritizationResult = {
  source: "claude" | "rules";
  providerConfigured: boolean;
  executiveSummary: string;
  consultantReviewChecklist: string[];
  findings: BaselineFindingRecommendation[];
};

type AuditSeverity = "blocking" | "review" | "info";

export type EstimateAuditInput = {
  customerId?: string;
  propertyId?: string | null;
  opportunityId?: string;
  estimateSnapshot: any;
  consultantNotes?: string;
  findings?: string;
  photos?: string;
  proposalStyle: "single_with_alternates";
};

export type EstimateAuditResult = {
  source: "claude" | "rules";
  providerConfigured: boolean;
  readinessScore: number;
  blockingIssues: Array<{ id: string; severity: AuditSeverity; area: string; message: string; fix: string }>;
  suggestedFixes: Array<{ id: string; title: string; suggestion: string; customerSafe: boolean }>;
  pricingRisks: Array<{ id: string; level: "red" | "yellow" | "green"; message: string }>;
  scopeQuestions: string[];
  customerSummaryDraft: string;
  recommendedAlternates: Array<{ id: string; title: string; summary: string; investmentRange: string }>;
  approvalChecklist: Array<{ id: string; label: string; passed: boolean; required: boolean }>;
};

const AREA_ROLE: Record<string, string> = {
  lead: "Lead Nurturer",
  estimate: "Consultant",
  job: "Project Manager",
};

function inferRoleDesk(area?: string, stage?: string) {
  if (area === "job") {
    if (["Scheduled", "In Progress", "Completed", "Awaiting Sign-Off"].includes(stage ?? "")) return "Field / PM Desk";
    if (["Invoice Sent", "Invoice Paid"].includes(stage ?? "")) return "Closeout / Retainment Desk";
  }
  return AREA_ROLE[area ?? ""] ?? "Revenue Desk";
}

function inferPriority(value?: number | null, stage?: string | null): BrainPriority {
  if (["Ready to Send", "Verbal Acceptance", "Approved", "Deposit Needed", "Awaiting Sign-Off", "Invoice Sent"].includes(stage ?? "")) {
    return "red";
  }
  if ((value ?? 0) >= 5000) return "red";
  if ((value ?? 0) >= 1500) return "yellow";
  return "green";
}

function inferApprovalLevel(area?: string, stage?: string): BrainApprovalLevel {
  if (area === "estimate" && ["Draft", "Ready to Send", "Verbal Acceptance"].includes(stage ?? "")) return "approval_required";
  if (area === "job" && ["Deposit Needed", "Awaiting Sign-Off", "Invoice Sent"].includes(stage ?? "")) return "approval_required";
  if (stage === "New Lead" || stage === "Return Call Needed" || stage === "Second Contact" || stage === "Third Contact") return "auto_safe";
  return "review_draft";
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildFallbackRecommendation(input: {
  opportunity: any;
  customer: any;
  messageCount: number;
}): OpportunityBrainRecommendation {
  const { opportunity, customer, messageCount } = input;
  const roleDesk = inferRoleDesk(opportunity.area, opportunity.stage);
  const priority = opportunity.threeSixtyPriority ?? inferPriority(opportunity.value, opportunity.stage);
  const methodStepKey = opportunity.threeSixtyStepKey ?? "inspect";
  const approvalLevel = inferApprovalLevel(opportunity.area, opportunity.stage);
  const customerName =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    customer?.displayName ||
    "the customer";

  return {
    source: "rules",
    providerConfigured: Boolean(ENV.anthropicApiKey),
    opportunityId: opportunity.id,
    customerId: opportunity.customerId,
    roleDesk,
    methodStepKey,
    priority,
    approvalLevel,
    nextAction:
      approvalLevel === "approval_required"
        ? "Review scope, price, schedule, and customer-facing wording before anything is sent."
        : "Confirm the missing details, choose the next customer touch, and log the result on this opportunity.",
    internalBrief: `${roleDesk} owns the next move. ${messageCount} related message(s) are currently tied to this opportunity.`,
    customerDraft:
      approvalLevel === "approval_required"
        ? `Hi ${customerName}, we are reviewing the details for your project and will follow up with the next clear step shortly.`
        : `Hi ${customerName}, thanks for reaching out. I am checking the details now and will make sure we have the right next step for your property.`,
    approvalReason:
      approvalLevel === "approval_required"
        ? "This step may affect pricing, scope, payment, sign-off, or schedule expectations."
        : "This recommendation avoids pricing, scope commitments, and firm schedule promises.",
    risks: priority === "red" ? ["High-priority item needs human review before customer-facing commitments."] : [],
    missingInputs: [
      !customer?.email && "Customer email",
      !customer?.mobilePhone && !customer?.homePhone && "Customer phone",
      !opportunity.notes && "Opportunity notes",
      !opportunity.threeSixtyFinding && "360 finding/reason",
    ].filter(Boolean) as string[],
    handoffNotes: ["Keep all customer-facing sends attached to this opportunity record."],
    confidence: 0.58,
  };
}

function parseClaudeJson(text: string): Partial<OpportunityBrainRecommendation> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fallbackBaselinePriority(finding: BaselineFindingInput): BaselineFindingRecommendation {
  const severity = finding.severity.toLowerCase();
  const condition = finding.condition.toLowerCase();
  const impacts = finding.impact.map(i => i.toLowerCase());
  const isSafetyOrWater = impacts.some(i => i.includes("safety") || i.includes("water"));
  const priority: BrainPriority =
    severity === "critical" || condition === "urgent" || isSafetyOrWater
      ? "red"
      : severity === "high" || condition === "needs_attention" || finding.timeframe === "soon"
        ? "yellow"
        : "green";
  const timeframe: BaselineTimeframe = priority === "red" ? "now" : priority === "yellow" ? "soon" : "wait";
  const needsReview = priority === "red" || finding.needsSpecialist || finding.createOpportunity;
  const title = safeText(finding.title, `${finding.section} finding`);
  const note = safeText(finding.notes, "No field note provided yet.");
  return {
    findingId: finding.id,
    priority,
    timeframe,
    confidence: finding.notes ? 0.68 : 0.45,
    consultantSummary: `${title}: ${note}`,
    customerSummary:
      priority === "red"
        ? `${title} should be reviewed first because it may affect safety, water control, or near-term property risk.`
        : priority === "yellow"
          ? `${title} should be planned into the next maintenance window before it becomes more disruptive.`
          : `${title} can be monitored as part of the normal 360 home care plan.`,
    recommendedAction:
      priority === "red"
        ? "Review with the customer, confirm photos/notes, and decide whether to create an estimate or specialist referral."
        : priority === "yellow"
          ? "Add to the roadmap and bundle with related seasonal or maintenance work."
          : "Document and monitor during the next seasonal walkthrough.",
    reviewRequired: needsReview,
    reviewReason: needsReview
      ? "Consultant review required before customer-facing delivery because this item affects priority, scope, specialist referral, or potential paid work."
      : "Consultant should still approve wording before finalizing the baseline.",
    qualityFlags: [
      finding.photoCount === 0 && priority === "red" ? "Add at least one photo for this red finding." : "",
      !finding.notes ? "Add a clear field note before finalizing." : "",
      finding.needsSpecialist ? "Avoid licensed diagnosis language; frame as specialist review recommended." : "",
    ].filter(Boolean),
  };
}

function parseBaselineJson(text: string): Partial<BaselinePrioritizationResult> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function selectedEstimateItems(snapshot: any) {
  const phases = Array.isArray(snapshot?.phases) ? snapshot.phases : [];
  const phaseItems = phases.flatMap((phase: any) =>
    Array.isArray(phase?.items)
      ? phase.items
          .filter((item: any) => Number(item?.qty ?? 0) > 0)
          .map((item: any) => ({
            phase: safeText(phase?.name, "Phase"),
            name: safeText(item?.name, safeText(item?.shortName, "Line item")),
            qty: Number(item?.qty ?? 0),
            unitType: safeText(item?.unitType, "unit"),
            notes: safeText(item?.notes),
            flagged: Boolean(item?.flagged),
            flagNote: safeText(item?.flagNote),
          }))
      : []
  );
  const customItems = Array.isArray(snapshot?.customItems)
    ? snapshot.customItems
        .filter((item: any) => Number(item?.qty ?? 0) > 0 || safeText(item?.description))
        .map((item: any) => ({
          phase: "Custom",
          name: safeText(item?.description, "Custom item"),
          qty: Number(item?.qty ?? 0),
          unitType: safeText(item?.unitType, "unit"),
          notes: safeText(item?.notes),
          flagged: false,
          flagNote: "",
        }))
    : [];
  return [...phaseItems, ...customItems];
}

function buildFallbackEstimateAudit(input: EstimateAuditInput): EstimateAuditResult {
  const snapshot = input.estimateSnapshot ?? {};
  const workflow = snapshot.consultantWorkflow ?? {};
  const proposal = snapshot.proposal ?? {};
  const items = selectedEstimateItems(snapshot);
  const totals = snapshot.totals ?? {};
  const totalPrice = Number(totals.price ?? 0);
  const gm = Number(totals.gm ?? 0);
  const hasScope =
    Boolean(safeText(workflow.problemStatement)) ||
    Boolean(safeText(snapshot.jobInfo?.scope)) ||
    Boolean(safeText(input.consultantNotes));
  const hasMeasurements =
    Boolean(safeText(workflow.measurementNotes)) ||
    items.some(item => item.qty > 0);
  const hasPhotos = Boolean(safeText(workflow.photoNotes) || safeText(input.photos));
  const hasCustomerSummary = Boolean(safeText(proposal.customerSummary) || safeText(snapshot.clientNote));

  const blockingIssues: EstimateAuditResult["blockingIssues"] = [
    !hasScope
      ? {
          id: "scope-missing",
          severity: "blocking",
          area: "Scope",
          message: "No clear customer problem or desired outcome is documented.",
          fix: "Add the problem statement, customer goals, and affected areas before customer delivery.",
        }
      : null,
    !hasMeasurements
      ? {
          id: "measurements-missing",
          severity: "blocking",
          area: "Measurements",
          message: "No measurement notes or selected priced items are present.",
          fix: "Add measured quantities or field notes that explain how the estimate was built.",
        }
      : null,
    totalPrice <= 0
      ? {
          id: "price-missing",
          severity: "blocking",
          area: "Pricing",
          message: "The estimate does not have a customer price yet.",
          fix: "Add at least one priced calculator item or approved custom item.",
        }
      : null,
    !hasCustomerSummary
      ? {
          id: "customer-summary-missing",
          severity: "blocking",
          area: "Proposal",
          message: "The customer-facing summary has not been approved.",
          fix: "Use the audit draft or write a simple recommended scope summary.",
        }
      : null,
  ].filter(Boolean) as EstimateAuditResult["blockingIssues"];

  const pricingRisks: EstimateAuditResult["pricingRisks"] = [
    gm > 0 && gm < 0.3
      ? { id: "margin-low", level: "red", message: "Blended gross margin is below the 30% minimum target." }
      : null,
    items.some(item => item.flagged)
      ? { id: "licensed-specialty", level: "yellow", message: "One or more items may require licensed or specialty review." }
      : null,
    !hasPhotos && totalPrice >= 2500
      ? { id: "photos-missing", level: "yellow", message: "This estimate should have photos attached or referenced before delivery." }
      : null,
  ].filter(Boolean) as EstimateAuditResult["pricingRisks"];

  const readinessScore = Math.max(
    0,
    Math.min(100, 100 - blockingIssues.length * 25 - pricingRisks.filter(r => r.level !== "green").length * 10)
  );

  return {
    source: "rules",
    providerConfigured: Boolean(ENV.anthropicApiKey),
    readinessScore,
    blockingIssues,
    suggestedFixes: [
      {
        id: "plain-language-summary",
        title: "Customer summary",
        suggestion:
          hasCustomerSummary
            ? safeText(proposal.customerSummary, snapshot.clientNote)
            : "Summarize the recommended scope in plain language, then list any optional alternates separately.",
        customerSafe: true,
      },
      {
        id: "assumptions",
        title: "Assumptions",
        suggestion: "State schedule assumptions, access needs, exclusions, and any specialist review before sending.",
        customerSafe: true,
      },
    ],
    pricingRisks,
    scopeQuestions: [
      !safeText(workflow.affectedAreas) ? "Which rooms, elevations, or exterior areas are included?" : "",
      !safeText(workflow.constraints) ? "Are there access, material, HOA, weather, or timing constraints?" : "",
      items.some(item => item.flagged) ? "Does the customer understand any licensed trade or specialty review boundary?" : "",
    ].filter(Boolean),
    customerSummaryDraft:
      safeText(proposal.customerSummary) ||
      safeText(snapshot.clientNote) ||
      "We recommend completing the scoped work listed in this proposal, with optional alternates separated so you can make a clear decision.",
    recommendedAlternates: [],
    approvalChecklist: [
      { id: "scope", label: "Scope and affected areas are clear", passed: hasScope, required: true },
      { id: "measurements", label: "Measurements or quantity basis are documented", passed: hasMeasurements, required: true },
      { id: "pricing", label: "Customer price is present and margin warnings are reviewed", passed: totalPrice > 0 && gm >= 0.3, required: true },
      { id: "photos", label: "Photos or photo notes support the priced work", passed: hasPhotos || totalPrice < 2500, required: false },
      { id: "summary", label: "Customer-facing summary is approved", passed: hasCustomerSummary, required: true },
    ],
  };
}

function parseEstimateAuditJson(text: string): Partial<EstimateAuditResult> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function auditEstimateDraft(input: EstimateAuditInput): Promise<EstimateAuditResult> {
  const fallback = buildFallbackEstimateAudit(input);
  if (!ENV.anthropicApiKey) return fallback;

  const snapshot = input.estimateSnapshot ?? {};
  const context = {
    customerId: input.customerId,
    propertyId: input.propertyId,
    opportunityId: input.opportunityId,
    proposalStyle: input.proposalStyle,
    consultantWorkflow: snapshot.consultantWorkflow,
    jobInfo: snapshot.jobInfo,
    consultantNotes: input.consultantNotes,
    findings: input.findings,
    photos: input.photos,
    totals: snapshot.totals,
    selectedItems: selectedEstimateItems(snapshot),
    proposal: snapshot.proposal,
  };

  const response = await invokeLLM({
    model: process.env.ANTHROPIC_BRAIN_MODEL || undefined,
    maxTokens: 2200,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "estimate_audit",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            readinessScore: { type: "number", minimum: 0, maximum: 100 },
            blockingIssues: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  severity: { type: "string", enum: ["blocking", "review", "info"] },
                  area: { type: "string" },
                  message: { type: "string" },
                  fix: { type: "string" },
                },
                required: ["id", "severity", "area", "message", "fix"],
              },
            },
            suggestedFixes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  suggestion: { type: "string" },
                  customerSafe: { type: "boolean" },
                },
                required: ["id", "title", "suggestion", "customerSafe"],
              },
            },
            pricingRisks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  level: { type: "string", enum: ["red", "yellow", "green"] },
                  message: { type: "string" },
                },
                required: ["id", "level", "message"],
              },
            },
            scopeQuestions: { type: "array", items: { type: "string" } },
            customerSummaryDraft: { type: "string" },
            recommendedAlternates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  summary: { type: "string" },
                  investmentRange: { type: "string" },
                },
                required: ["id", "title", "summary", "investmentRange"],
              },
            },
            approvalChecklist: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  passed: { type: "boolean" },
                  required: { type: "boolean" },
                },
                required: ["id", "label", "passed", "required"],
              },
            },
          },
          required: [
            "readinessScore",
            "blockingIssues",
            "suggestedFixes",
            "pricingRisks",
            "scopeQuestions",
            "customerSummaryDraft",
            "recommendedAlternates",
            "approvalChecklist",
          ],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are the Handy Pioneers consultant estimate audit layer. Review draft estimates for clarity, missing inputs, pricing risk, specialist/licensed boundaries, and customer-safe wording. AI cannot send, approve, override pricing, or make licensed claims. The consultant must approve or edit before customer delivery. Return concise, actionable JSON only.",
      },
      { role: "user", content: JSON.stringify(context) },
    ],
  });

  const claude = parseEstimateAuditJson(response.choices[0]?.message.content ?? "{}");
  return {
    ...fallback,
    ...claude,
    source: "claude",
    providerConfigured: true,
    readinessScore: typeof claude.readinessScore === "number" ? claude.readinessScore : fallback.readinessScore,
    blockingIssues: Array.isArray(claude.blockingIssues) ? claude.blockingIssues : fallback.blockingIssues,
    suggestedFixes: Array.isArray(claude.suggestedFixes) ? claude.suggestedFixes : fallback.suggestedFixes,
    pricingRisks: Array.isArray(claude.pricingRisks) ? claude.pricingRisks : fallback.pricingRisks,
    scopeQuestions: Array.isArray(claude.scopeQuestions) ? claude.scopeQuestions : fallback.scopeQuestions,
    recommendedAlternates: Array.isArray(claude.recommendedAlternates) ? claude.recommendedAlternates : fallback.recommendedAlternates,
    approvalChecklist: Array.isArray(claude.approvalChecklist) ? claude.approvalChecklist : fallback.approvalChecklist,
  };
}

export async function prioritizeBaselineFindings(input: {
  customerName?: string;
  propertyAddress?: string;
  consultantName?: string;
  findings: BaselineFindingInput[];
}): Promise<BaselinePrioritizationResult> {
  const fallbackFindings = input.findings.map(fallbackBaselinePriority);
  const fallback: BaselinePrioritizationResult = {
    source: "rules",
    providerConfigured: Boolean(ENV.anthropicApiKey),
    executiveSummary:
      fallbackFindings.length === 0
        ? "No baseline findings have been entered yet."
        : `Baseline review found ${fallbackFindings.filter(f => f.priority === "red").length} red, ${fallbackFindings.filter(f => f.priority === "yellow").length} yellow, and ${fallbackFindings.filter(f => f.priority === "green").length} green item(s). Consultant approval is required before customer delivery.`,
    consultantReviewChecklist: [
      "Confirm every red item has enough photos and field notes.",
      "Edit customer wording so it is simple, accurate, and non-alarming.",
      "Approve any scope, price, schedule, or specialist referral before sending.",
      "Do not present AI output as a licensed inspection, engineering, electrical, plumbing, appraisal, or financial opinion.",
    ],
    findings: fallbackFindings,
  };

  if (!ENV.anthropicApiKey || input.findings.length === 0) return fallback;

  const response = await invokeLLM({
    model: process.env.ANTHROPIC_BRAIN_MODEL || undefined,
    maxTokens: 2200,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "baseline_prioritization",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            executiveSummary: { type: "string" },
            consultantReviewChecklist: { type: "array", items: { type: "string" } },
            findings: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  findingId: { type: "string" },
                  priority: { type: "string", enum: ["red", "yellow", "green"] },
                  timeframe: { type: "string", enum: ["now", "soon", "wait"] },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  consultantSummary: { type: "string" },
                  customerSummary: { type: "string" },
                  recommendedAction: { type: "string" },
                  reviewRequired: { type: "boolean" },
                  reviewReason: { type: "string" },
                  qualityFlags: { type: "array", items: { type: "string" } },
                },
                required: [
                  "findingId",
                  "priority",
                  "timeframe",
                  "confidence",
                  "consultantSummary",
                  "customerSummary",
                  "recommendedAction",
                  "reviewRequired",
                  "reviewReason",
                  "qualityFlags",
                ],
              },
            },
          },
          required: ["executiveSummary", "consultantReviewChecklist", "findings"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are the Handy Pioneers baseline walkthrough AI support layer. Prioritize consultant-entered findings into red/yellow/green and now/soon/wait. The consultant must approve or edit every output before customer delivery. Do not diagnose as a licensed inspector, engineer, electrician, plumber, appraiser, real estate agent, or financial advisor. Flag vague notes, missing photos for urgent items, and any language needing human review.",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
  });

  const claude = parseBaselineJson(response.choices[0]?.message.content ?? "{}");
  return {
    source: "claude",
    providerConfigured: true,
    executiveSummary: safeText(claude.executiveSummary, fallback.executiveSummary),
    consultantReviewChecklist: Array.isArray(claude.consultantReviewChecklist)
      ? claude.consultantReviewChecklist
      : fallback.consultantReviewChecklist,
    findings: Array.isArray(claude.findings) && claude.findings.length > 0
      ? claude.findings as BaselineFindingRecommendation[]
      : fallback.findings,
  };
}

export async function recommendOpportunityNextStep(input: {
  opportunityId: string;
  operatorQuestion?: string;
}): Promise<OpportunityBrainRecommendation> {
  const opportunity = await getOpportunityById(input.opportunityId);
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const [customer, messages] = await Promise.all([
    getCustomerById(opportunity.customerId),
    listMessagesByOpportunity(opportunity.id, 25).catch(() => []),
  ]);

  const fallback = buildFallbackRecommendation({
    opportunity,
    customer,
    messageCount: messages.length,
  });

  if (!ENV.anthropicApiKey) return fallback;

  const opportunityMeta = opportunity as typeof opportunity & {
    threeSixtyStepKey?: string | null;
    threeSixtyPriority?: BrainPriority | null;
    threeSixtySource?: string | null;
    threeSixtyFinding?: string | null;
  };

  const context = {
    customer: customer
      ? {
          id: customer.id,
          name:
            [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
            customer.displayName ||
            customer.company,
          email: customer.email,
          phone: customer.mobilePhone || customer.homePhone || customer.workPhone,
          address: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
          tags: customer.tags,
        }
      : null,
    opportunity: {
      id: opportunity.id,
      area: opportunity.area,
      stage: opportunity.stage,
      title: opportunity.title,
      value: opportunity.value,
      notes: opportunity.notes,
      threeSixtyStepKey: opportunityMeta.threeSixtyStepKey,
      threeSixtyPriority: opportunityMeta.threeSixtyPriority,
      threeSixtySource: opportunityMeta.threeSixtySource,
      threeSixtyFinding: opportunityMeta.threeSixtyFinding,
      scheduledDate: opportunity.scheduledDate,
      updatedAt: opportunity.updatedAt,
    },
    recentMessages: messages.slice(-8).map((message: any) => ({
      channel: message.channel,
      direction: message.direction,
      subject: message.subject,
      body: safeText(message.body).slice(0, 1200),
      sentAt: message.sentAt,
      status: message.status,
    })),
    operatorQuestion: input.operatorQuestion ?? "",
  };

  const response = await invokeLLM({
    model: process.env.ANTHROPIC_BRAIN_MODEL || undefined,
    maxTokens: 1600,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "opportunity_brain_recommendation",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            roleDesk: { type: "string" },
            methodStepKey: { type: "string" },
            priority: { type: "string", enum: ["red", "yellow", "green"] },
            approvalLevel: { type: "string", enum: ["auto_safe", "review_draft", "approval_required"] },
            nextAction: { type: "string" },
            internalBrief: { type: "string" },
            customerDraft: { type: "string" },
            approvalReason: { type: "string" },
            risks: { type: "array", items: { type: "string" } },
            missingInputs: { type: "array", items: { type: "string" } },
            handoffNotes: { type: "array", items: { type: "string" } },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "roleDesk",
            "methodStepKey",
            "priority",
            "approvalLevel",
            "nextAction",
            "internalBrief",
            "customerDraft",
            "approvalReason",
            "risks",
            "missingInputs",
            "handoffNotes",
            "confidence",
          ],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are the Handy Pioneers AI Brain supporting internal operators. Give practical recommendations only. Never claim to be a licensed financial advisor, inspector, engineer, electrician, plumber, or real estate agent. Pricing, scope, payment, schedule commitments, and sign-off language require human approval. Keep drafts concise and customer-safe.",
      },
      {
        role: "user",
        content: JSON.stringify(context),
      },
    ],
  });

  const content = response.choices[0]?.message.content ?? "{}";
  const claude = parseClaudeJson(content);

  return {
    ...fallback,
    ...claude,
    source: "claude",
    providerConfigured: true,
    opportunityId: opportunity.id,
    customerId: opportunity.customerId,
    risks: Array.isArray(claude.risks) ? claude.risks : fallback.risks,
    missingInputs: Array.isArray(claude.missingInputs) ? claude.missingInputs : fallback.missingInputs,
    handoffNotes: Array.isArray(claude.handoffNotes) ? claude.handoffNotes : fallback.handoffNotes,
    confidence: typeof claude.confidence === "number" ? claude.confidence : fallback.confidence,
  };
}
