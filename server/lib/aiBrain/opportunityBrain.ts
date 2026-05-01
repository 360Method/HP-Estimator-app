import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import {
  getCustomerById,
  getOpportunityById,
  listMessagesByOpportunity,
} from "../../db";

type BrainPriority = "red" | "yellow" | "green";
type BrainApprovalLevel = "auto_safe" | "review_draft" | "approval_required";

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
