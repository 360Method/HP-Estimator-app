import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lock,
  MessageSquare,
  Flame,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PipelineArea } from '@/lib/types';

type WorkflowArea = PipelineArea | 'membership';

type ApprovalLevel = 'auto_safe' | 'review_draft' | 'approval_required';

type WorkflowStep = {
  objective: string;
  nextAction: string;
  aiDraft: string;
  customerReceives: string;
  approvalLevel: ApprovalLevel;
  approvalReason: string;
  safeSends: string[];
  approvalRequiredFor: string[];
};

interface OpportunityWorkflowPanelProps {
  area: WorkflowArea;
  stage: string;
  value?: number;
  updatedAt?: string;
  title?: string;
  stats?: Array<{ label: string; value: string | number; tone?: 'default' | 'warn' | 'good' }>;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  compact?: boolean;
}

export type OpportunityHeat = {
  level: 'hot' | 'warm' | 'cool';
  label: string;
  priority: string;
  reason: string;
  className: string;
  dotClassName: string;
};

const DEFAULT_STEP: WorkflowStep = {
  objective: 'Keep the customer and team aligned on the next clear step.',
  nextAction: 'Review the opportunity, confirm what is missing, and choose the next customer touch.',
  aiDraft: 'Prepare a concise customer update based on the latest notes.',
  customerReceives: 'Only messages or documents sent from this opportunity.',
  approvalLevel: 'review_draft',
  approvalReason: 'Review because this stage can affect customer expectations.',
  safeSends: ['general follow-up', 'photo/detail request', 'scheduling coordination'],
  approvalRequiredFor: ['pricing', 'scope commitments', 'payment requests'],
};

const LEAD_STEPS: Record<string, WorkflowStep> = {
  'New Lead': {
    objective: 'Capture the request and make first contact quickly.',
    nextAction: 'Call or send a short intro asking for project details, photos, and preferred estimate windows.',
    aiDraft: 'First-response SMS or email.',
    customerReceives: 'A friendly confirmation and detail request.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe when it does not mention price, schedule promises, or final scope.',
    safeSends: ['first response', 'photo request', 'preferred times request'],
    approvalRequiredFor: ['price ranges', 'discounts', 'definite timeline promises'],
  },
  'Return Call Needed': {
    objective: 'Return the customer to active conversation.',
    nextAction: 'Call back, then log the result and schedule the next follow-up if they do not answer.',
    aiDraft: 'Missed-call follow-up text.',
    customerReceives: 'A simple callback note or voicemail follow-up.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe if it only references the attempted call and next contact window.',
    safeSends: ['missed-call text', 'voicemail follow-up', 'callback availability request'],
    approvalRequiredFor: ['scope recommendations', 'price guidance', 'job timing commitments'],
  },
  'First Contact': {
    objective: 'Qualify the lead enough to schedule or convert.',
    nextAction: 'Confirm scope, address, photos, timeline, and whether an estimate visit is needed.',
    aiDraft: 'Qualification recap and missing-info request.',
    customerReceives: 'A recap of what was discussed and any missing details.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review because the message may summarize job specifics.',
    safeSends: ['recap', 'missing-info request', 'estimate scheduling options'],
    approvalRequiredFor: ['exact scope acceptance', 'project price', 'firm start date'],
  },
  'Second Contact': {
    objective: 'Keep the opportunity warm without over-contacting.',
    nextAction: 'Send a concise follow-up with one clear response path.',
    aiDraft: 'Second follow-up SMS/email.',
    customerReceives: 'A helpful reminder with a next step.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe when it avoids pricing and commitments.',
    safeSends: ['follow-up reminder', 'photo request', 'schedule prompt'],
    approvalRequiredFor: ['pricing', 'discounts', 'scope promises'],
  },
  'Third Contact': {
    objective: 'Make the final active attempt before hold/dormant.',
    nextAction: 'Send final follow-up and set the lead to On Hold if there is no response.',
    aiDraft: 'Final follow-up.',
    customerReceives: 'A low-pressure final check-in.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe when framed as a check-in, not a sales pressure message.',
    safeSends: ['final check-in', 'close-the-loop message'],
    approvalRequiredFor: ['special offers', 'discounts', 'price anchoring'],
  },
  'On Hold': {
    objective: 'Pause active work while preserving context.',
    nextAction: 'Set a reminder date or wait for the customer to re-engage.',
    aiDraft: 'Optional check-in for a future date.',
    customerReceives: 'Nothing unless a check-in is intentionally sent.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review to avoid contacting a paused lead too often.',
    safeSends: ['future check-in', 'availability update'],
    approvalRequiredFor: ['offers', 'pricing', 'scope changes'],
  },
  'Won': {
    objective: 'Move the qualified lead into an estimate workflow.',
    nextAction: 'Convert this lead to an estimate and carry notes/photos forward.',
    aiDraft: 'Internal handoff summary.',
    customerReceives: 'Nothing until the estimate workflow sends it.',
    approvalLevel: 'approval_required',
    approvalReason: 'Approval required before any estimate, price, or scope is sent.',
    safeSends: ['internal handoff summary'],
    approvalRequiredFor: ['estimate', 'scope of work', 'pricing', 'deposit terms'],
  },
};

const ESTIMATE_STEPS: Record<string, WorkflowStep> = {
  'Unscheduled': {
    objective: 'Get the estimate visit or consultation on the calendar.',
    nextAction: 'Offer appointment windows and confirm address/access details.',
    aiDraft: 'Estimate scheduling message.',
    customerReceives: 'Scheduling options and prep instructions.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe when it only coordinates scheduling.',
    safeSends: ['appointment windows', 'prep instructions', 'address confirmation'],
    approvalRequiredFor: ['price', 'scope', 'discounts'],
  },
  'Scheduled': {
    objective: 'Prepare the customer for the estimate appointment.',
    nextAction: 'Send confirmation, arrival expectations, and photo/access reminders.',
    aiDraft: 'Appointment confirmation.',
    customerReceives: 'Visit confirmation and what to expect.',
    approvalLevel: 'auto_safe',
    approvalReason: 'Safe when appointment details are confirmed.',
    safeSends: ['appointment confirmation', 'photo/access reminder'],
    approvalRequiredFor: ['price', 'scope promises', 'completion timeline'],
  },
  'In Progress': {
    objective: 'Turn field notes into a complete estimate package.',
    nextAction: 'Finish scope, measurements, labor/material notes, and internal review.',
    aiDraft: 'Internal estimate-building checklist.',
    customerReceives: 'Usually nothing yet.',
    approvalLevel: 'approval_required',
    approvalReason: 'Approval required before any scope or price leaves the app.',
    safeSends: ['internal checklist', 'missing-info request'],
    approvalRequiredFor: ['estimate PDF', 'scope of work', 'line items', 'pricing'],
  },
  'Draft': {
    objective: 'Review the estimate before it becomes customer-facing.',
    nextAction: 'Check scope, totals, exclusions, deposit terms, and customer note.',
    aiDraft: 'Proposal summary for internal review.',
    customerReceives: 'Nothing until approved to send.',
    approvalLevel: 'approval_required',
    approvalReason: 'Drafts contain pricing and project commitments.',
    safeSends: ['internal review notes'],
    approvalRequiredFor: ['estimate PDF', 'proposal email', 'discounts', 'payment terms'],
  },
  'Ready to Send': {
    objective: 'Send a clear, approved estimate package.',
    nextAction: 'Preview the estimate, approve the customer message, and send through the portal.',
    aiDraft: 'Estimate email/portal message.',
    customerReceives: 'Estimate, scope, price, and approval/payment path.',
    approvalLevel: 'approval_required',
    approvalReason: 'Customer-facing pricing and scope must be approved.',
    safeSends: ['internal send checklist'],
    approvalRequiredFor: ['estimate PDF', 'scope', 'price', 'deposit terms'],
  },
  'Sent': {
    objective: 'Help the customer make a decision.',
    nextAction: 'Follow up with a short explanation and offer to answer questions.',
    aiDraft: 'Estimate follow-up.',
    customerReceives: 'Follow-up tied to the sent estimate.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review because it references a specific estimate.',
    safeSends: ['follow-up', 'question prompt', 'approval reminder'],
    approvalRequiredFor: ['price changes', 'discounts', 'scope changes'],
  },
  'Verbal Acceptance': {
    objective: 'Convert verbal yes into formal approval.',
    nextAction: 'Send approval/signature/payment instructions after confirming the estimate is current.',
    aiDraft: 'Approval next-step message.',
    customerReceives: 'How to approve and what happens next.',
    approvalLevel: 'approval_required',
    approvalReason: 'Approval/payment instructions are tied to contract terms.',
    safeSends: ['internal conversion checklist'],
    approvalRequiredFor: ['approval link', 'deposit request', 'schedule promise'],
  },
  'Approved': {
    objective: 'Handoff cleanly into the job workflow.',
    nextAction: 'Create or confirm the job, deposit status, and scheduling requirements.',
    aiDraft: 'Internal job handoff.',
    customerReceives: 'Next-steps message only after job details are confirmed.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review customer expectations after approval.',
    safeSends: ['thank-you message', 'next-step overview'],
    approvalRequiredFor: ['start date', 'deposit request', 'scope changes'],
  },
};

const JOB_STEPS: Record<string, WorkflowStep> = {
  'New Job': {
    objective: 'Confirm the project handoff from approved estimate to production.',
    nextAction: 'Confirm deposit needs, materials, schedule status, and customer expectations.',
    aiDraft: 'Job kickoff message.',
    customerReceives: 'A clear kickoff and what happens next.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review because kickoff can set schedule and project expectations.',
    safeSends: ['thank-you/kickoff', 'general next steps'],
    approvalRequiredFor: ['start date', 'deposit amount', 'scope changes'],
  },
  'Deposit Needed': {
    objective: 'Collect deposit before production commitments.',
    nextAction: 'Send the approved deposit/payment request.',
    aiDraft: 'Deposit request message.',
    customerReceives: 'Payment instructions and next steps.',
    approvalLevel: 'approval_required',
    approvalReason: 'Payment requests and dollar amounts require approval.',
    safeSends: ['internal payment checklist'],
    approvalRequiredFor: ['deposit amount', 'payment link', 'payment terms'],
  },
  'Deposit Collected': {
    objective: 'Move from payment to scheduling/materials.',
    nextAction: 'Confirm materials and scheduling path.',
    aiDraft: 'Deposit received confirmation.',
    customerReceives: 'Confirmation and upcoming scheduling/materials steps.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review if the message includes date expectations.',
    safeSends: ['payment received confirmation', 'general next steps'],
    approvalRequiredFor: ['firm start date', 'material ETA promise'],
  },
  'Need to Order Materials': {
    objective: 'Make sure materials are ordered and tracked.',
    nextAction: 'Confirm material list, owner, and ETA.',
    aiDraft: 'Internal materials checklist.',
    customerReceives: 'Nothing unless a status update is needed.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review updates that mention ETA.',
    safeSends: ['general materials update'],
    approvalRequiredFor: ['ETA commitments', 'price changes'],
  },
  'Waiting on Materials': {
    objective: 'Keep the customer informed while materials are pending.',
    nextAction: 'Send a status update if the customer is waiting on us.',
    aiDraft: 'Materials delay/update message.',
    customerReceives: 'A status update and next check-in window.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review because ETA language can create expectations.',
    safeSends: ['materials status update'],
    approvalRequiredFor: ['firm ETA', 'schedule change', 'price change'],
  },
  'Scheduled': {
    objective: 'Prepare the customer and crew for the scheduled work.',
    nextAction: 'Send schedule confirmation and access/prep instructions.',
    aiDraft: 'Schedule confirmation.',
    customerReceives: 'Confirmed date/time and prep instructions.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review because dates and crew expectations are specific.',
    safeSends: ['prep instructions'],
    approvalRequiredFor: ['date/time confirmation', 'duration promise'],
  },
  'In Progress': {
    objective: 'Keep production moving and customer expectations clear.',
    nextAction: 'Send progress update when milestones, delays, or access needs change.',
    aiDraft: 'Progress update.',
    customerReceives: 'Progress note tied to this job.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review job-specific updates before sending.',
    safeSends: ['progress update', 'access request'],
    approvalRequiredFor: ['change order', 'schedule change', 'price change'],
  },
  'Awaiting Sign-Off': {
    objective: 'Get completion sign-off and close open punch items.',
    nextAction: 'Send sign-off request after confirming work is complete.',
    aiDraft: 'Completion/sign-off request.',
    customerReceives: 'Sign-off request and punch-list path.',
    approvalLevel: 'approval_required',
    approvalReason: 'Approval required before requesting formal completion sign-off.',
    safeSends: ['internal completion checklist'],
    approvalRequiredFor: ['sign-off request', 'final completion statement', 'invoice'],
  },
  'Invoice Sent': {
    objective: 'Collect final payment and answer any invoice questions.',
    nextAction: 'Follow up on payment only after invoice details are confirmed.',
    aiDraft: 'Invoice follow-up.',
    customerReceives: 'Invoice/payment reminder.',
    approvalLevel: 'approval_required',
    approvalReason: 'Payment requests require approval.',
    safeSends: ['internal payment follow-up checklist'],
    approvalRequiredFor: ['invoice amount', 'payment link', 'late/overdue language'],
  },
  'Invoice Paid': {
    objective: 'Close the job and preserve the relationship.',
    nextAction: 'Send thank-you/closeout and optional review request if appropriate.',
    aiDraft: 'Closeout thank-you.',
    customerReceives: 'Thank-you and closeout note.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review review-request timing and tone.',
    safeSends: ['thank-you', 'care instructions', 'review request'],
    approvalRequiredFor: ['warranty commitments', 'future discounts'],
  },
};

const MEMBERSHIP_STEPS: Record<string, WorkflowStep> = {
  active: {
    objective: 'Keep the membership current and turn findings into clean work orders.',
    nextAction: 'Review open work orders, upcoming seasonal visits, and renewal timing.',
    aiDraft: 'Membership check-in or visit reminder.',
    customerReceives: 'Membership updates tied to visits, findings, or renewal.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review if recommendations mention paid repairs or renewal pricing.',
    safeSends: ['visit reminder', 'maintenance check-in', 'general membership update'],
    approvalRequiredFor: ['repair quotes', 'renewal pricing', 'discounts', 'paid work orders'],
  },
  scheduled: {
    objective: 'Prepare for the next membership visit.',
    nextAction: 'Confirm appointment details and access instructions.',
    aiDraft: 'Visit confirmation.',
    customerReceives: 'Visit date/time and access prep.',
    approvalLevel: 'review_draft',
    approvalReason: 'Review specific appointment details before sending.',
    safeSends: ['visit prep instructions'],
    approvalRequiredFor: ['date/time confirmation', 'paid work recommendations'],
  },
  completed: {
    objective: 'Convert inspection findings into clear options.',
    nextAction: 'Review findings, decide what becomes a work order, and send customer options.',
    aiDraft: 'Inspection summary.',
    customerReceives: 'Findings summary and recommended next steps.',
    approvalLevel: 'approval_required',
    approvalReason: 'Approval required if findings include paid work recommendations.',
    safeSends: ['general maintenance summary'],
    approvalRequiredFor: ['repair pricing', 'work order quote', 'discounted options'],
  },
};

export function getWorkflowStep(area: WorkflowArea, stage: string): WorkflowStep {
  if (area === 'lead') return LEAD_STEPS[stage] ?? DEFAULT_STEP;
  if (area === 'estimate') return ESTIMATE_STEPS[stage] ?? DEFAULT_STEP;
  if (area === 'job') return JOB_STEPS[stage] ?? DEFAULT_STEP;
  return MEMBERSHIP_STEPS[stage] ?? MEMBERSHIP_STEPS.active;
}

export function getOpportunityHeat(area: WorkflowArea, stage: string, value = 0, updatedAt?: string): OpportunityHeat {
  const hotStages = new Set([
    'Return Call Needed',
    'Third Contact',
    'Ready to Send',
    'Verbal Acceptance',
    'Deposit Needed',
    'Waiting on Materials',
    'Awaiting Sign-Off',
    'Invoice Sent',
  ]);
  const coolStages = new Set(['On Hold', 'Lost', 'Rejected', 'Invoice Paid']);
  const daysStale = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000) : 0;
  const highValue = value >= 10_000;

  if (hotStages.has(stage) || highValue || daysStale >= 3) {
    return {
      level: 'hot',
      label: 'Hot',
      priority: 'Look at this first',
      reason: hotStages.has(stage)
        ? 'This stage usually means the customer is waiting on a response, approval, payment, or schedule clarity.'
        : highValue
          ? 'High-value opportunity. Keep it visible and controlled.'
          : 'No recent movement. Follow up or intentionally move stages.',
      className: 'border-rose-300 bg-rose-50 text-rose-800',
      dotClassName: 'bg-rose-500',
    };
  }

  if (coolStages.has(stage)) {
    return {
      level: 'cool',
      label: 'Cool',
      priority: 'Monitor',
      reason: 'No urgent customer action is expected unless something changes.',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      dotClassName: 'bg-emerald-500',
    };
  }

  return {
    level: 'warm',
    label: 'Warm',
    priority: 'Keep moving',
    reason: 'There is a clear next step, but it is not an urgent blocker yet.',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
    dotClassName: 'bg-amber-500',
  };
}

function approvalMeta(level: ApprovalLevel) {
  if (level === 'auto_safe') {
    return {
      label: 'Safe Draft',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (level === 'approval_required') {
    return {
      label: 'Approval Required',
      icon: <Lock className="w-3.5 h-3.5" />,
      className: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  return {
    label: 'Review Draft',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  };
}

function areaLabel(area: WorkflowArea) {
  if (area === 'membership') return '360 Membership';
  return area.charAt(0).toUpperCase() + area.slice(1);
}

export default function OpportunityWorkflowPanel({
  area,
  stage,
  value = 0,
  updatedAt,
  title,
  stats = [],
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  compact = false,
}: OpportunityWorkflowPanelProps) {
  const step = getWorkflowStep(area, stage);
  const meta = approvalMeta(step.approvalLevel);
  const heat = getOpportunityHeat(area, stage, value, updatedAt);

  return (
    <Card className={`border-2 ${heat.className} bg-opacity-60`}>
      <CardHeader className={compact ? 'pb-2 pt-4' : 'pb-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              {title ?? `${areaLabel(area)} Workflow`}
            </CardTitle>
            <p className="text-xs opacity-80 mt-1">
              Stage: <span className="font-medium text-foreground">{stage}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            <Badge variant="outline" className={`gap-1.5 shrink-0 ${heat.className}`}>
              <span className={`w-2 h-2 rounded-full ${heat.dotClassName}`} />
              {heat.label}
            </Badge>
            <Badge variant="outline" className={`gap-1.5 shrink-0 ${meta.className}`}>
              {meta.icon}
              {meta.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? 'pb-4 space-y-3' : 'space-y-4'}>
        <div className="rounded-lg border border-current/20 bg-white/75 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Flame className="w-3.5 h-3.5" />
            Priority: {heat.priority}
          </div>
          <p className="text-xs mt-1 opacity-80">{heat.reason}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Bot className="w-3.5 h-3.5" />
              Next Best Action
            </div>
            <p className="text-sm text-foreground mt-1.5 leading-relaxed">{step.nextAction}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Send className="w-3.5 h-3.5" />
              Customer Receives
            </div>
            <p className="text-sm text-foreground mt-1.5 leading-relaxed">{step.customerReceives}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <FileText className="w-3.5 h-3.5" />
            AI Role
          </div>
          <p className="text-sm text-foreground mt-1.5">{step.aiDraft}</p>
          <p className="text-xs text-muted-foreground mt-1.5">{step.approvalReason}</p>
        </div>

        {!compact && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Automatic / quick-send allowed
              </p>
              <div className="flex flex-wrap gap-1.5">
                {step.safeSends.map(item => (
                  <span key={item} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                These are safe nurture/update messages only when they avoid price, scope, payment, and firm schedule commitments.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Needs review before sending
              </p>
              <div className="flex flex-wrap gap-1.5">
                {step.approvalRequiredFor.map(item => (
                  <span key={item} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {(stats.length > 0 || onPrimaryAction || onSecondaryAction) && (
          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stats.map(stat => (
                  <span
                    key={stat.label}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      stat.tone === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : stat.tone === 'good'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <span className="font-medium text-foreground">{stat.value}</span> {stat.label}
                  </span>
                ))}
              </div>
            )}
            {(onPrimaryAction || onSecondaryAction) && (
              <div className="flex gap-2 shrink-0">
                {onSecondaryAction && (
                  <Button size="sm" variant="outline" onClick={onSecondaryAction}>
                    {secondaryActionLabel ?? 'Edit Draft'}
                  </Button>
                )}
                {onPrimaryAction && (
                  <Button size="sm" onClick={onPrimaryAction}>
                    {primaryActionLabel ?? 'Start Action'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
