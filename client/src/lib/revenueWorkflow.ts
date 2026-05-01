import type { Opportunity, PipelineArea } from '@/lib/types';
import type { ThreeSixtyMethodStep } from '@/lib/threeSixtyMethod';

export type RevenueRoleId =
  | 'lead_nurturer'
  | 'consultant'
  | 'project_manager'
  | 'field_team'
  | 'closeout'
  | 'retainment'
  | 'membership_engine';

export type WorkflowPhaseId =
  | 'intake'
  | 'consult'
  | 'production'
  | 'closeout'
  | 'retain'
  | 'membership';

export type TaskTone = 'urgent' | 'watch' | 'good';

export interface RevenueRoleDefinition {
  id: RevenueRoleId;
  label: string;
  deskLabel: string;
  humanOwner: string;
  aiCopilot: string;
  outcome: string;
}

export interface OpportunityWorkflowDefinition {
  area: PipelineArea | 'membership';
  stage: string;
  phase: WorkflowPhaseId;
  phaseLabel: string;
  roleId: RevenueRoleId;
  requiredInputs: string[];
  completionSignal: string;
  handoffTo?: RevenueRoleId;
  customerMirror: string;
}

export interface CommandTask {
  label: string;
  detail: string;
  owner: string;
  tone: TaskTone;
}

export interface OpportunityCommandPlan {
  role: RevenueRoleDefinition;
  workflow: OpportunityWorkflowDefinition;
  tasks: CommandTask[];
  portalCue: {
    label: string;
    detail: string;
    tone: TaskTone;
  };
  handoffSummary: string;
}

export const REVENUE_ROLES: Record<RevenueRoleId, RevenueRoleDefinition> = {
  lead_nurturer: {
    id: 'lead_nurturer',
    label: 'Lead Nurturer',
    deskLabel: 'Lead Desk',
    humanOwner: 'Lead intake / qualification',
    aiCopilot: 'Lead Copilot prepares first responses, call notes, follow-ups, and consultant handoff summaries.',
    outcome: 'Qualified lead with scope, address, contact path, photos/details, and appointment path.',
  },
  consultant: {
    id: 'consultant',
    label: 'Consultant',
    deskLabel: 'Consultant Desk',
    humanOwner: 'Consultant / estimator',
    aiCopilot: 'Consultant Copilot prepares site briefs, baseline prompts, estimate checklists, and proposal summaries.',
    outcome: 'Customer guided to a clear scope, estimate, priority plan, or 360 Method recommendation.',
  },
  project_manager: {
    id: 'project_manager',
    label: 'Project Manager',
    deskLabel: 'PM Desk',
    humanOwner: 'Project manager',
    aiCopilot: 'PM Copilot prepares kickoff notes, material checklists, schedule updates, crew briefs, and change prompts.',
    outcome: 'Approved work is controlled: deposit, materials, schedule, crew, and customer expectations aligned.',
  },
  field_team: {
    id: 'field_team',
    label: 'Field Team',
    deskLabel: 'Field Desk',
    humanOwner: 'Labor / field team',
    aiCopilot: 'Field Assistant turns notes/photos into progress updates, blocker summaries, and completion proof.',
    outcome: 'Work completed with photos, notes, punch items, and clean closeout context.',
  },
  closeout: {
    id: 'closeout',
    label: 'Closeout',
    deskLabel: 'Closeout Desk',
    humanOwner: 'Accounts receivable / closeout',
    aiCopilot: 'Closeout Agent prepares sign-off requests, invoice reminders, payment summaries, and review timing.',
    outcome: 'Completion accepted, invoice paid, record closed, and next relationship moment created.',
  },
  retainment: {
    id: 'retainment',
    label: 'Retainment',
    deskLabel: 'Retainment Desk',
    humanOwner: 'Customer success / recurring care',
    aiCopilot: 'Retainment Agent watches completed work, membership fit, seasonal timing, and next-best-service prompts.',
    outcome: 'Customer returns to the 360 flywheel through membership, seasonal care, review, referral, or next project.',
  },
  membership_engine: {
    id: 'membership_engine',
    label: '360 Membership Engine',
    deskLabel: 'Membership Engine',
    humanOwner: '360 recurring care owner',
    aiCopilot: 'Membership Agent monitors baseline, seasonal visits, home score, labor bank, findings, and recurring opportunities.',
    outcome: 'The property stays inside a recurring baseline, seasonal, repair, preserve, and upgrade operating system.',
  },
};

const DEFAULT_WORKFLOW: OpportunityWorkflowDefinition = {
  area: 'lead',
  stage: 'Default',
  phase: 'intake',
  phaseLabel: 'Intake',
  roleId: 'lead_nurturer',
  requiredInputs: ['Customer', 'request', 'contact path'],
  completionSignal: 'Next responsible person can act without guessing.',
  handoffTo: 'consultant',
  customerMirror: 'A clear next step and one simple response path.',
};

const WORKFLOW_BY_STAGE: Record<string, Partial<OpportunityWorkflowDefinition>> = {
  'lead:New Lead': {
    phase: 'intake',
    phaseLabel: 'Lead intake',
    roleId: 'lead_nurturer',
    requiredInputs: ['Name', 'phone/email', 'property address', 'requested work', 'urgency'],
    completionSignal: 'Customer has received first response and missing details are requested.',
    handoffTo: 'lead_nurturer',
    customerMirror: 'We received the request and are gathering details.',
  },
  'lead:Return Call Needed': {
    phase: 'intake',
    phaseLabel: 'Lead recovery',
    roleId: 'lead_nurturer',
    requiredInputs: ['Best callback number', 'last attempt', 'reason for call'],
    completionSignal: 'Call result is logged and the next follow-up is scheduled or completed.',
    customerMirror: 'We tried to reach you and gave a simple callback path.',
  },
  'lead:First Contact': {
    phase: 'intake',
    phaseLabel: 'Qualification',
    roleId: 'lead_nurturer',
    requiredInputs: ['Scope', 'photos/details', 'budget sensitivity', 'timeline', 'appointment need'],
    completionSignal: 'Qualified/disqualified decision and consultant handoff summary are complete.',
    handoffTo: 'consultant',
    customerMirror: 'We understand the request and are confirming next steps.',
  },
  'lead:Second Contact': {
    phase: 'intake',
    phaseLabel: 'Nurture',
    roleId: 'lead_nurturer',
    requiredInputs: ['Prior contact result', 'missing decision', 'next response path'],
    completionSignal: 'Follow-up sent and next contact date or hold decision is set.',
    customerMirror: 'A helpful reminder with one clear way to continue.',
  },
  'lead:Third Contact': {
    phase: 'intake',
    phaseLabel: 'Final nurture',
    roleId: 'lead_nurturer',
    requiredInputs: ['Prior attempts', 'final prompt', 'hold/lost threshold'],
    completionSignal: 'Final attempt logged; opportunity is moved forward, held, or closed.',
    customerMirror: 'A low-pressure final check-in.',
  },
  'lead:Won': {
    phase: 'consult',
    phaseLabel: 'Consultant handoff',
    roleId: 'lead_nurturer',
    requiredInputs: ['Qualification summary', 'scope', 'photos', 'appointment/context'],
    completionSignal: 'Lead is converted with notes and the consultant can prepare.',
    handoffTo: 'consultant',
    customerMirror: 'The request has moved into the estimate process.',
  },
  'estimate:Unscheduled': {
    phase: 'consult',
    phaseLabel: 'Consult scheduling',
    roleId: 'consultant',
    requiredInputs: ['Address/access', 'scope', 'appointment windows', 'photos'],
    completionSignal: 'Consultation is scheduled or the customer has scheduling options.',
    customerMirror: 'Appointment options and prep instructions.',
  },
  'estimate:Scheduled': {
    phase: 'consult',
    phaseLabel: 'Consult prep',
    roleId: 'consultant',
    requiredInputs: ['Visit time', 'access notes', 'customer goals', 'lead summary'],
    completionSignal: 'Consultant brief is ready before the visit.',
    customerMirror: 'Visit confirmation and what to expect.',
  },
  'estimate:In Progress': {
    phase: 'consult',
    phaseLabel: 'Estimate build',
    roleId: 'consultant',
    requiredInputs: ['Measurements', 'photos', 'scope notes', 'materials/labor assumptions'],
    completionSignal: 'Estimate draft is complete enough for internal review.',
    customerMirror: 'Usually nothing yet unless missing information is needed.',
  },
  'estimate:Draft': {
    phase: 'consult',
    phaseLabel: 'Estimate review',
    roleId: 'consultant',
    requiredInputs: ['Scope', 'pricing', 'exclusions', 'deposit terms', 'customer note'],
    completionSignal: 'Proposal is approved internally or returned for changes.',
    customerMirror: 'Nothing until approved to send.',
  },
  'estimate:Ready to Send': {
    phase: 'consult',
    phaseLabel: 'Proposal send',
    roleId: 'consultant',
    requiredInputs: ['Approved estimate', 'message', 'portal link', 'approval/payment path'],
    completionSignal: 'Customer-facing estimate package is sent and linked to the portal.',
    handoffTo: 'project_manager',
    customerMirror: 'Estimate, scope, price, and approval path.',
  },
  'estimate:Sent': {
    phase: 'consult',
    phaseLabel: 'Decision support',
    roleId: 'consultant',
    requiredInputs: ['Sent estimate', 'questions', 'decision blocker', 'follow-up date'],
    completionSignal: 'Customer has approved, rejected, asked a question, or has a next follow-up.',
    customerMirror: 'Estimate follow-up and decision support.',
  },
  'estimate:Verbal Acceptance': {
    phase: 'production',
    phaseLabel: 'Approval capture',
    roleId: 'consultant',
    requiredInputs: ['Current estimate', 'approval path', 'deposit terms', 'schedule constraints'],
    completionSignal: 'Verbal yes becomes formal approval or deposit path.',
    handoffTo: 'project_manager',
    customerMirror: 'How to approve and what happens next.',
  },
  'estimate:Approved': {
    phase: 'production',
    phaseLabel: 'Production handoff',
    roleId: 'project_manager',
    requiredInputs: ['Approved scope', 'deposit status', 'materials', 'schedule constraints', 'crew notes'],
    completionSignal: 'Job exists with kickoff context and PM ownership.',
    customerMirror: 'Project kickoff next steps.',
  },
  'job:New Job': {
    phase: 'production',
    phaseLabel: 'Job kickoff',
    roleId: 'project_manager',
    requiredInputs: ['Approved scope', 'deposit need', 'materials', 'schedule status', 'customer expectations'],
    completionSignal: 'Job is ready for material/schedule control.',
    customerMirror: 'Kickoff and next production step.',
  },
  'job:Deposit Needed': {
    phase: 'production',
    phaseLabel: 'Deposit control',
    roleId: 'project_manager',
    requiredInputs: ['Approved deposit amount', 'payment link', 'terms'],
    completionSignal: 'Deposit request sent and tracked.',
    customerMirror: 'Secure payment request and next steps.',
  },
  'job:Deposit Collected': {
    phase: 'production',
    phaseLabel: 'Schedule/materials',
    roleId: 'project_manager',
    requiredInputs: ['Payment confirmation', 'materials status', 'schedule constraints'],
    completionSignal: 'Materials and schedule path are clear.',
    customerMirror: 'Payment received and what comes next.',
  },
  'job:Need to Order Materials': {
    phase: 'production',
    phaseLabel: 'Materials',
    roleId: 'project_manager',
    requiredInputs: ['Material list', 'owner', 'vendor', 'ETA'],
    completionSignal: 'Materials are ordered or blocker is escalated.',
    customerMirror: 'Only a status update if the customer is waiting.',
  },
  'job:Waiting on Materials': {
    phase: 'production',
    phaseLabel: 'Materials follow-up',
    roleId: 'project_manager',
    requiredInputs: ['ETA', 'delay reason', 'schedule impact'],
    completionSignal: 'Customer/team know the next check-in date or materials arrive.',
    customerMirror: 'Materials status and next check-in.',
  },
  'job:Materials Received': {
    phase: 'production',
    phaseLabel: 'Ready to schedule',
    roleId: 'project_manager',
    requiredInputs: ['Materials confirmed', 'crew availability', 'customer availability'],
    completionSignal: 'Job is scheduled or ready for scheduling.',
    handoffTo: 'field_team',
    customerMirror: 'Scheduling path is clear.',
  },
  'job:Unscheduled': {
    phase: 'production',
    phaseLabel: 'Scheduling',
    roleId: 'project_manager',
    requiredInputs: ['Crew availability', 'customer windows', 'job duration'],
    completionSignal: 'Work is scheduled or blocker is documented.',
    handoffTo: 'field_team',
    customerMirror: 'Scheduling options or confirmation.',
  },
  'job:Scheduled': {
    phase: 'production',
    phaseLabel: 'Crew prep',
    roleId: 'project_manager',
    requiredInputs: ['Crew notes', 'scope', 'access', 'materials', 'arrival window'],
    completionSignal: 'Crew and customer are prepared for the visit.',
    handoffTo: 'field_team',
    customerMirror: 'Confirmed date/time and prep instructions.',
  },
  'job:In Progress': {
    phase: 'production',
    phaseLabel: 'Execution',
    roleId: 'field_team',
    requiredInputs: ['Scope', 'crew notes', 'photos', 'blockers', 'change risks'],
    completionSignal: 'Progress is documented and blockers/change orders are escalated.',
    handoffTo: 'closeout',
    customerMirror: 'Progress update when useful.',
  },
  'job:Completed': {
    phase: 'closeout',
    phaseLabel: 'Completion proof',
    roleId: 'field_team',
    requiredInputs: ['Completion photos', 'notes', 'punch items', 'customer concerns'],
    completionSignal: 'Completion packet is ready for sign-off/invoice.',
    handoffTo: 'closeout',
    customerMirror: 'Work completion and proof.',
  },
  'job:Awaiting Sign-Off': {
    phase: 'closeout',
    phaseLabel: 'Sign-off',
    roleId: 'closeout',
    requiredInputs: ['Completion proof', 'punch list status', 'final scope'],
    completionSignal: 'Customer sign-off is captured or issue is escalated.',
    customerMirror: 'Sign-off request and punch-list path.',
  },
  'job:Invoice Sent': {
    phase: 'closeout',
    phaseLabel: 'Payment',
    roleId: 'closeout',
    requiredInputs: ['Invoice amount', 'payment link', 'due date', 'sign-off status'],
    completionSignal: 'Invoice is paid or payment follow-up is scheduled.',
    handoffTo: 'retainment',
    customerMirror: 'Invoice/payment reminder.',
  },
  'job:Invoice Paid': {
    phase: 'retain',
    phaseLabel: 'Retainment',
    roleId: 'retainment',
    requiredInputs: ['Paid invoice', 'completion summary', 'review timing', '360 fit'],
    completionSignal: 'Customer receives closeout and is routed into review/referral/360 membership.',
    handoffTo: 'membership_engine',
    customerMirror: 'Thank-you, care instructions, and next home-care recommendation.',
  },
};

function workflowKey(area: PipelineArea | 'membership', stage: string) {
  return `${area}:${stage}`;
}

export function getOpportunityWorkflowDefinition(opportunity: Pick<Opportunity, 'area' | 'stage'>): OpportunityWorkflowDefinition {
  const override = WORKFLOW_BY_STAGE[workflowKey(opportunity.area, opportunity.stage)] ?? {};
  return {
    ...DEFAULT_WORKFLOW,
    area: opportunity.area,
    stage: opportunity.stage,
    ...override,
  };
}

export function buildOpportunityCommandPlan(input: {
  opportunity: Opportunity;
  methodStep: ThreeSixtyMethodStep;
  hasPortalActivity: boolean;
  workflowNextAction: string;
  workflowAiDraft: string;
  approvalLevel: 'auto_safe' | 'review_draft' | 'approval_required';
}): OpportunityCommandPlan {
  const { opportunity, methodStep, hasPortalActivity, workflowNextAction, workflowAiDraft, approvalLevel } = input;
  const workflow = getOpportunityWorkflowDefinition(opportunity);
  const role = REVENUE_ROLES[workflow.roleId];
  const handoffRole = workflow.handoffTo ? REVENUE_ROLES[workflow.handoffTo] : null;
  const methodTone: TaskTone = opportunity.threeSixtyPriority === 'red'
    ? 'urgent'
    : opportunity.threeSixtyPriority === 'yellow'
      ? 'watch'
      : 'good';

  const tasks: CommandTask[] = [
    {
      label: workflowNextAction,
      detail: `Complete when: ${workflow.completionSignal}`,
      owner: role.deskLabel,
      tone: approvalLevel === 'approval_required' ? 'urgent' : approvalLevel === 'review_draft' ? 'watch' : 'good',
    },
    {
      label: methodStep.operatorOutcome,
      detail: `360 Method step ${methodStep.number}: ${methodStep.name}. ${methodStep.aiSupport}`,
      owner: methodStep.owner,
      tone: methodTone,
    },
    {
      label: workflowAiDraft,
      detail: role.aiCopilot,
      owner: 'AI Copilot',
      tone: 'good',
    },
  ];

  if (!hasPortalActivity && opportunity.area !== 'lead') {
    tasks.push({
      label: 'Create or link the portal-facing artifact for this opportunity.',
      detail: 'Estimate, invoice, appointment, message, or job update should be tied to this specific opportunity.',
      owner: role.deskLabel,
      tone: 'watch',
    });
  }

  if (workflow.handoffTo) {
    tasks.push({
      label: `Prepare handoff to ${handoffRole?.deskLabel ?? 'next desk'}.`,
      detail: workflow.requiredInputs.join(', '),
      owner: role.deskLabel,
      tone: 'watch',
    });
  }

  return {
    role,
    workflow,
    tasks,
    portalCue: hasPortalActivity
      ? {
          label: 'Portal is linked',
          detail: workflow.customerMirror,
          tone: 'good',
        }
      : {
          label: opportunity.area === 'lead' ? 'Portal not needed yet' : 'Portal artifact missing',
          detail: opportunity.area === 'lead'
            ? 'Lead qualification can happen before portal creation.'
            : 'Customer-facing documents/messages should be mirrored in the portal before relying on self-service.',
          tone: opportunity.area === 'lead' ? 'good' : 'watch',
        },
    handoffSummary: handoffRole
      ? `${role.deskLabel} owns this until ${workflow.completionSignal} Then it moves to ${handoffRole.deskLabel}.`
      : `${role.deskLabel} owns this stage until ${workflow.completionSignal}`,
  };
}
