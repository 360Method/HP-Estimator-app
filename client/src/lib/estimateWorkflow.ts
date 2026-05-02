import { calcCustomItem, calcLineItem, calcPhase, calcTotals } from './calc';
import { getProductionAudit } from './productionRateAudit';
import {
  ConsultantWorkflowMeta,
  CustomLineItem,
  EstimateApprovalCheck,
  EstimateAuditIssue,
  EstimateReadinessStatus,
  GlobalSettings,
  LineItem,
  PhaseGroup,
} from './types';

export const ESTIMATOR_WORKFLOW_STEPS: Array<{
  id: ConsultantWorkflowMeta['currentStep'];
  label: string;
  shortLabel: string;
}> = [
  { id: 'prep', label: 'Opportunity Context', shortLabel: 'Prep' },
  { id: 'scope', label: 'Scope Capture', shortLabel: 'Scope' },
  { id: 'measurements', label: 'Measurements & Findings', shortLabel: 'Measure' },
  { id: 'calculator', label: 'Calculator Pricing', shortLabel: 'Price' },
  { id: 'audit', label: 'AI Audit & Approval', shortLabel: 'Audit' },
  { id: 'proposal', label: 'Customer Proposal', shortLabel: 'Proposal' },
];

export function selectedScopeCount(phases: PhaseGroup[], customItems: CustomLineItem[]) {
  const standard = phases.reduce((count, phase) => count + phase.items.filter(item => item.qty > 0).length, 0);
  const custom = customItems.filter(item => item.qty > 0 || item.description.trim()).length;
  return standard + custom;
}

export function findCalculatorQualityIssues(input: {
  phases: PhaseGroup[];
  customItems: CustomLineItem[];
  global: GlobalSettings;
  workflow: ConsultantWorkflowMeta;
  linkedPhotoCount?: number;
}) {
  const phaseResults = input.phases.map(phase => calcPhase(phase, input.global));
  const customResults = input.customItems.map(item => calcCustomItem(item, input.global));
  const totals = calcTotals(phaseResults, customResults);
  const selectedItems = input.phases.flatMap(phase => phase.items.filter(item => item.qty > 0));
  const issues: EstimateAuditIssue[] = [];

  if (!input.workflow.problemStatement.trim() && !input.workflow.customerGoals.trim()) {
    issues.push({
      id: 'scope-missing',
      severity: 'blocking',
      area: 'Scope',
      message: 'Problem statement and customer goals are missing.',
      fix: 'Capture what the customer asked for and the outcome they want.',
    });
  }

  if (selectedScopeCount(input.phases, input.customItems) === 0) {
    issues.push({
      id: 'priced-items-missing',
      severity: 'blocking',
      area: 'Calculator',
      message: 'No priced scope items are selected.',
      fix: 'Add calculator line items or approved custom work before creating the proposal.',
    });
  }

  if (!input.workflow.measurementNotes.trim() && selectedItems.some(item => item.qty > 0)) {
    issues.push({
      id: 'measurement-basis-missing',
      severity: 'review',
      area: 'Measurements',
      message: 'Selected items do not have a written measurement basis.',
      fix: 'Add measurement notes so the estimate can be reviewed later.',
    });
  }

  if (totals.hasData && totals.gm < 0.3) {
    issues.push({
      id: 'margin-floor',
      severity: 'blocking',
      area: 'Pricing',
      message: 'Blended gross margin is below the required floor.',
      fix: 'Review costs, quantities, or gross margin target before delivery.',
    });
  }

  if (selectedItems.some(item => item.flagged)) {
    issues.push({
      id: 'licensed-review',
      severity: 'review',
      area: 'Specialty review',
      message: 'One or more selected items may require licensed or specialty review.',
      fix: 'Confirm customer-facing language does not overpromise licensed trade work.',
    });
  }

  const subcontractorItems = selectedItems.filter(item => {
    const audit = getProductionAudit(item);
    return (audit.pricingMode === 'subcontractor' || audit.pricingMode === 'allowance') && audit.subcontractorAllowance <= 0;
  });
  if (subcontractorItems.length > 0) {
    issues.push({
      id: 'subcontractor-allowance-missing',
      severity: 'blocking',
      area: 'Production rate audit',
      message: 'Specialty or licensed scope is selected without a quote or allowance.',
      fix: 'Add a subcontractor allowance, attach the quote, or move the item out of customer-ready scope.',
    });
  }

  if (selectedItems.some(item => getProductionAudit(item).confidence === 'low')) {
    issues.push({
      id: 'production-confidence-low',
      severity: 'review',
      area: 'Production rate audit',
      message: 'One or more selected line items has low production-rate confidence.',
      fix: 'Validate the production hours or add a consultant override note before approval.',
    });
  }

  if (selectedItems.some(item => {
    const audit = getProductionAudit(item);
    return audit.recommendedSellRate && audit.laborCostRate >= audit.recommendedSellRate;
  })) {
    issues.push({
      id: 'maintenance-sell-rate-as-cost',
      severity: 'review',
      area: 'Maintenance pricing',
      message: 'A maintenance service sell rate appears to be treated as internal hard cost.',
      fix: 'Use the internal cost rate for hard cost and keep the service sell rate as a pricing reference.',
    });
  }

  if (totals.hasData && totals.price >= 2500 && !input.workflow.photoNotes.trim() && (input.linkedPhotoCount ?? input.workflow.linkedPhotoAttachmentIds.length) === 0) {
    issues.push({
      id: 'photo-support',
      severity: 'review',
      area: 'Photos',
      message: 'Higher-value work should have supporting photos or photo notes.',
      fix: 'Link relevant attachments or add a short note describing the photos taken.',
    });
  }

  return { issues, totals };
}

export function buildApprovalChecklist(input: {
  workflow: ConsultantWorkflowMeta;
  phases: PhaseGroup[];
  customItems: CustomLineItem[];
  global: GlobalSettings;
  customerSummary: string;
}): EstimateApprovalCheck[] {
  const { issues, totals } = findCalculatorQualityIssues(input);
  const blockingIds = new Set(issues.filter(issue => issue.severity === 'blocking').map(issue => issue.id));
  return [
    {
      id: 'scope',
      label: 'Scope, affected areas, and customer goals are documented',
      passed: Boolean(input.workflow.problemStatement.trim() || input.workflow.customerGoals.trim()),
      required: true,
    },
    {
      id: 'measurements',
      label: 'Measurements or quantity basis are documented',
      passed: Boolean(input.workflow.measurementNotes.trim() || selectedScopeCount(input.phases, input.customItems) > 0),
      required: true,
    },
    {
      id: 'pricing',
      label: 'Pricing exists and gross margin warnings are clear',
      passed: totals.hasData && totals.price > 0 && !blockingIds.has('margin-floor'),
      required: true,
    },
    {
      id: 'specialty',
      label: 'Specialty/licensed review language is checked',
      passed: !issues.some(issue => issue.id === 'licensed-review'),
      required: false,
    },
    {
      id: 'customer-summary',
      label: 'Customer-facing summary is approved',
      passed: Boolean(input.customerSummary.trim()),
      required: true,
    },
  ];
}

export function estimateReadinessStatus(input: {
  checklist: EstimateApprovalCheck[];
  auditBlockingCount: number;
  approvedAt?: string | null;
  sentAt?: string | null;
  wonAt?: string | null;
}): EstimateReadinessStatus {
  if (input.wonAt) return 'approved';
  if (input.sentAt) return 'sent';
  if (input.approvedAt && input.auditBlockingCount === 0) return 'ready_for_customer';
  const requiredPassed = input.checklist.filter(check => check.required).every(check => check.passed);
  return requiredPassed && input.auditBlockingCount === 0 ? 'needs_review' : 'draft';
}

export function lineItemQuality(item: LineItem, result: ReturnType<typeof calcLineItem>) {
  return {
    measured: item.qty > 0,
    note: Boolean(item.notes.trim()),
    margin: result.price <= 0 || result.gm >= 0.3,
    specialty: !item.flagged,
    approvedWording: Boolean(item.salesDesc.trim() || item.sowTemplate.trim()),
    productionRate: result.productionAudit.confidence !== 'low' && result.productionAudit.auditStatus !== 'replace',
  };
}
