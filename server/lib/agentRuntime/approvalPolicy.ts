import type { RegisteredTool } from "./tools";

export type ApprovalDecision = "auto_execute" | "requires_approval" | "blocked";

export type RiskCategory =
  | "internal"
  | "customer_follow_up"
  | "customer_comms"
  | "money"
  | "scope"
  | "payment"
  | "schedule_commitment"
  | "missing_context"
  | "unknown_tool";

export type ApprovalPolicyResult = {
  approvalDecision: ApprovalDecision;
  approvalReason: string;
  riskCategory: RiskCategory;
  customerFacing: boolean;
};

const MONEY_RE =
  /(\$\s?\d|\b\d+(\.\d{2})?\s?(usd|dollars?)\b|\b(price|pricing|cost|costs|deposit|discount|refund|invoice|estimate|quote|proposal|amount|balance|credit)\b)/i;
const PAYMENT_RE = /\b(payment|pay|paid|card|checkout|payment link|stripe|autopay|collection|collect|past due|overdue)\b/i;
const SCOPE_RE =
  /\b(scope|change order|warranty|exclusion|contract|licensed|permit|structural|upgrade|repair|replace|install|project|job)\b/i;
const SCHEDULE_COMMITMENT_RE =
  /\b(scheduled for|confirmed for|we will be there|crew will|arrival window|arrive at|start date|completion date|firm schedule|locked in)\b/i;
const SAFE_FOLLOW_UP_RE =
  /\b(follow up|following up|checking in|reminder|callback|return call|missed call|voicemail|touch base|appointment reminder|confirm receipt|general update)\b/i;

export function evaluateToolApproval(
  key: string,
  tool: RegisteredTool | undefined,
  input: Record<string, unknown>
): ApprovalPolicyResult {
  const customerFacing = isCustomerFacingTool(key);
  if (!tool) {
    return {
      approvalDecision: "blocked",
      approvalReason: "Tool is not registered, so it cannot be executed or approved.",
      riskCategory: "unknown_tool",
      customerFacing,
    };
  }

  if (key === "comms.sendTransactionalEmail") {
    if (!input.to || !input.templateKey) {
      return blocked("Transactional email requires a recipient and template key.", customerFacing);
    }
    return {
      approvalDecision: "auto_execute",
      approvalReason: "Whitelisted transactional template with required routing context.",
      riskCategory: "customer_follow_up",
      customerFacing,
    };
  }

  if (key === "comms.draftEmail" || key === "comms.draftSms") {
    return evaluateCustomerDraft(input, customerFacing);
  }

  if (customerFacing && tool.requiresApproval) {
    return {
      approvalDecision: "requires_approval",
      approvalReason: "Customer-facing action defaults to review.",
      riskCategory: "customer_comms",
      customerFacing,
    };
  }

  if (tool.requiresApproval) {
    return {
      approvalDecision: "requires_approval",
      approvalReason: "Tool is explicitly configured for human review.",
      riskCategory: "internal",
      customerFacing,
    };
  }

  return {
    approvalDecision: "auto_execute",
    approvalReason: "Internal, read-only, or pre-approved operational action.",
    riskCategory: customerFacing ? "customer_follow_up" : "internal",
    customerFacing,
  };
}

function evaluateCustomerDraft(input: Record<string, unknown>, customerFacing: boolean): ApprovalPolicyResult {
  const text = searchableText(input);
  if (!input.to || !input.body) {
    return blocked("Customer message requires a recipient and body.", customerFacing);
  }
  if (!input.reason) {
    return blocked("Customer message requires an approval or automation reason.", customerFacing);
  }
  if (MONEY_RE.test(text)) {
    return review("Any dollar amount, pricing, proposal, discount, refund, or invoice language needs review.", "money");
  }
  if (PAYMENT_RE.test(text)) {
    return review("Payment or collection language needs review.", "payment");
  }
  if (SCHEDULE_COMMITMENT_RE.test(text)) {
    return review("Firm scheduling commitments need review.", "schedule_commitment");
  }
  if (SCOPE_RE.test(text)) {
    return review("Scope, job, warranty, exclusion, or work-specific language needs review.", "scope");
  }
  if (SAFE_FOLLOW_UP_RE.test(text)) {
    return {
      approvalDecision: "auto_execute",
      approvalReason: "Low-risk basic follow-up with no money, scope, payment, or firm commitment.",
      riskCategory: "customer_follow_up",
      customerFacing,
    };
  }
  return review("Free-form customer message is not clearly a basic follow-up.", "customer_comms");
}

function isCustomerFacingTool(key: string): boolean {
  return key.startsWith("comms.") || key.includes("customer") || key.includes("portal");
}

function searchableText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(searchableText).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(searchableText).join(" ");
  return "";
}

function blocked(reason: string, customerFacing: boolean): ApprovalPolicyResult {
  return {
    approvalDecision: "blocked",
    approvalReason: reason,
    riskCategory: "missing_context",
    customerFacing,
  };
}

function review(reason: string, riskCategory: RiskCategory): ApprovalPolicyResult {
  return {
    approvalDecision: "requires_approval",
    approvalReason: reason,
    riskCategory,
    customerFacing: true,
  };
}
