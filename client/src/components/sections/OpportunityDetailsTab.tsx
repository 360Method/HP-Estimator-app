// ============================================================
// OpportunityDetailsTab — first tab inside any lead/estimate/job
// Shows: contact info, address, opportunity name/description,
// and the lineage chain (Lead → Estimate → Job) with clickable
// links. Approved estimates open in read-only mode.
// ============================================================

import { useState, useRef } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  User, Phone, Mail, MapPin, FileText, Briefcase, MessageSquare,
  Star, ChevronRight, Lock, ExternalLink, Calendar, DollarSign, ArrowLeft, ArrowRight, Pencil, Check, X, RefreshCw,
  AlertTriangle, Bot, ClipboardCheck, Sparkles,
} from 'lucide-react';
import {
  ESTIMATE_STAGES,
  JOB_STAGES,
  LEAD_STAGES,
  type Opportunity,
} from '@/lib/types';
import LeadNurturingPanel from '@/components/sections/LeadNurturingPanel';
import EstimateDetailsPanel from '@/components/sections/EstimateDetailsPanel';
import ConsultantBrief from '@/components/sections/ConsultantBrief';
import PmHandoffBrief from '@/components/sections/PmHandoffBrief';
import { ConvertToEstimateModal } from '@/components/ConversionModal';
import CustomerActivityFeed from '@/components/CustomerActivityFeed';
import { getOpportunityHeat, getWorkflowStep } from '@/components/OpportunityWorkflowPanel';
import {
  THREE_SIXTY_METHOD_STEPS,
  inferOpportunityThreeSixtyStep,
  type ThreeSixtyMethodStep,
} from '@/lib/threeSixtyMethod';
import {
  buildOpportunityCommandPlan,
  type OpportunityCommandPlan,
} from '@/lib/revenueWorkflow';

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDollar(n?: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function areaLabel(area: string) {
  if (area === 'lead') return 'Lead';
  if (area === 'estimate') return 'Estimate';
  if (area === 'job') return 'Job';
  return area;
}

function areaIcon(area: string) {
  if (area === 'lead') return <Star className="w-4 h-4" />;
  if (area === 'estimate') return <FileText className="w-4 h-4" />;
  if (area === 'job') return <Briefcase className="w-4 h-4" />;
  return null;
}

function displayId(opp: Opportunity) {
  if (opp.jobNumber) return opp.jobNumber;
  // Fall back to first 8 chars of the UUID
  return `#${opp.id.slice(0, 8).toUpperCase()}`;
}

// ── Lineage node ─────────────────────────────────────────────

function stagesForOpportunity(opp: Opportunity) {
  if (opp.area === 'lead') return LEAD_STAGES;
  if (opp.area === 'estimate') return ESTIMATE_STAGES;
  return JOB_STAGES;
}

function approvalLabel(level: ReturnType<typeof getWorkflowStep>['approvalLevel']) {
  if (level === 'auto_safe') return 'Safe to draft';
  if (level === 'approval_required') return 'Approval required';
  return 'Review draft';
}

function sourceLabel(source?: Opportunity['threeSixtySource']) {
  const labels: Record<string, string> = {
    website: 'Website',
    inbound_call: 'Inbound call',
    baseline: 'Baseline finding',
    seasonal_visit: 'Seasonal visit',
    customer_request: 'Customer request',
    prior_job_follow_up: 'Prior job follow-up',
    membership_recommendation: 'Membership recommendation',
  };
  return labels[source ?? ''] ?? 'Not set';
}

function OpportunityCommandCenter({
  activeOpp,
  chain,
  contact,
  methodStep,
  workflowStep,
  commandPlan,
  hasPortalActivity,
  jobMessageCount,
  onBackToCustomer,
  onOpenAncestor,
  onUpdateOpportunity,
  onCall,
  onEmail,
}: {
  activeOpp: Opportunity;
  chain: Opportunity[];
  contact: { name: string; phone: string; email: string };
  methodStep: ThreeSixtyMethodStep;
  workflowStep: ReturnType<typeof getWorkflowStep>;
  commandPlan: OpportunityCommandPlan;
  hasPortalActivity: boolean;
  jobMessageCount: number;
  onBackToCustomer: () => void;
  onOpenAncestor: (opp: Opportunity) => void;
  onUpdateOpportunity: (payload: Partial<Opportunity>) => void;
  onCall?: () => void;
  onEmail?: () => void;
}) {
  const heat = getOpportunityHeat(activeOpp.area, activeOpp.stage, activeOpp.value, activeOpp.updatedAt);
  const brainRecommendation = trpc.aiBrain.recommendOpportunityNextStep.useMutation();
  const tasks = commandPlan.tasks;
  const priorChain = chain.filter(opp => opp.id !== activeOpp.id);
  const stages = stagesForOpportunity(activeOpp);
  const desk = commandPlan.role.deskLabel;
  const priorityClass =
    activeOpp.threeSixtyPriority === 'red' ? 'border-rose-200 bg-rose-50 text-rose-700' :
    activeOpp.threeSixtyPriority === 'yellow' ? 'border-amber-200 bg-amber-50 text-amber-700' :
    activeOpp.threeSixtyPriority === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
    'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={onBackToCustomer}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Customer profile
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize gap-1">
                {areaIcon(activeOpp.area)}
                {areaLabel(activeOpp.area)}
              </Badge>
              <Badge variant="outline" className={heat.className}>{heat.label}</Badge>
              <Badge variant="outline">{desk}</Badge>
              <Badge variant="outline">{commandPlan.workflow.phaseLabel}</Badge>
              <Badge variant="outline" className={priorityClass}>
                {activeOpp.threeSixtyPriority ? `${activeOpp.threeSixtyPriority} priority` : 'Priority not set'}
              </Badge>
            </div>
            <h1 className="mt-2 text-xl font-bold leading-tight text-foreground">{activeOpp.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {contact.name} · {activeOpp.stage} · {fmtDollar(activeOpp.value)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onCall && (
              <Button size="sm" onClick={onCall}>
                <Phone className="mr-1.5 h-3.5 w-3.5" />
                Call
              </Button>
            )}
            {onEmail && (
              <Button size="sm" variant="outline" onClick={onEmail}>
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                Email
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr] sm:p-5">
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Bot className="h-3.5 w-3.5" />
                  AI brain
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Claude reviews this opportunity context and returns a structured next move, customer draft, risks, and approval rule.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={brainRecommendation.isPending}
                onClick={() => brainRecommendation.mutate({ opportunityId: activeOpp.id })}
              >
                {brainRecommendation.isPending ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Ask brain
              </Button>
            </div>
            {brainRecommendation.error && (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {brainRecommendation.error.message}
              </p>
            )}
            {brainRecommendation.data && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{brainRecommendation.data.roleDesk}</Badge>
                    <Badge
                      variant="outline"
                      className={
                        brainRecommendation.data.approvalLevel === 'approval_required'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : brainRecommendation.data.approvalLevel === 'review_draft'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }
                    >
                      {brainRecommendation.data.approvalLevel.replaceAll('_', ' ')}
                    </Badge>
                    <Badge variant="secondary">
                      {brainRecommendation.data.source === 'claude' ? 'Claude' : 'Rules fallback'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended next action</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{brainRecommendation.data.nextAction}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{brainRecommendation.data.approvalReason}</p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer draft</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{brainRecommendation.data.customerDraft}</p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal brief</p>
                  <p className="mt-1 text-sm text-foreground">{brainRecommendation.data.internalBrief}</p>
                  {brainRecommendation.data.handoffNotes.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {brainRecommendation.data.handoffNotes.map(note => <li key={note}>- {note}</li>)}
                    </ul>
                  )}
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risks and missing inputs</p>
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {brainRecommendation.data.risks.length > 0 && (
                      <p><span className="font-medium text-foreground">Risks:</span> {brainRecommendation.data.risks.join('; ')}</p>
                    )}
                    {brainRecommendation.data.missingInputs.length > 0 && (
                      <p><span className="font-medium text-foreground">Missing:</span> {brainRecommendation.data.missingInputs.join(', ')}</p>
                    )}
                    {brainRecommendation.data.risks.length === 0 && brainRecommendation.data.missingInputs.length === 0 && (
                      <p>No major gaps flagged.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Do this next</p>
                <p className="mt-1 text-base font-semibold text-foreground">{workflowStep.nextAction}</p>
                <p className="mt-1 text-sm text-muted-foreground">AI prep: {workflowStep.aiDraft}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">Complete when: {commandPlan.workflow.completionSignal}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer sees next</p>
              <p className="mt-1 text-sm text-foreground">{commandPlan.workflow.customerMirror}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review rule</p>
              <p className="mt-1 text-sm font-medium">{approvalLabel(workflowStep.approvalLevel)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{workflowStep.approvalReason}</p>
            </div>
            <div className={`rounded-lg border p-3 ${
              commandPlan.portalCue.tone === 'watch' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portal mirror</p>
              <p className="mt-1 text-sm font-medium">{commandPlan.portalCue.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{commandPlan.portalCue.detail}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Task list</p>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.label} className="flex gap-3 rounded-lg border px-3 py-2">
                  {task.tone === 'urgent' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  ) : task.tone === 'watch' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="text-xs text-muted-foreground">{task.detail}</p>
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">Owner: {task.owner}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role command</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{commandPlan.role.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{commandPlan.role.outcome}</p>
            <p className="mt-2 text-xs text-muted-foreground">{commandPlan.handoffSummary}</p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow controls</p>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Stage</span>
                <select
                  className="mt-1 field-input w-full text-sm"
                  value={activeOpp.stage}
                  onChange={e => onUpdateOpportunity({ stage: e.target.value as Opportunity['stage'] })}
                >
                  {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">360 step</span>
                <select
                  className="mt-1 field-input w-full text-sm"
                  value={activeOpp.threeSixtyStepKey ?? methodStep.key}
                  onChange={e => onUpdateOpportunity({ threeSixtyStepKey: e.target.value })}
                >
                  {THREE_SIXTY_METHOD_STEPS.map(step => (
                    <option key={step.key} value={step.key}>{step.number}. {step.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Source</span>
                  <select
                    className="mt-1 field-input w-full text-sm"
                    value={activeOpp.threeSixtySource ?? ''}
                    onChange={e => onUpdateOpportunity({ threeSixtySource: (e.target.value || null) as Opportunity['threeSixtySource'] })}
                  >
                    <option value="">Not set</option>
                    <option value="website">Website</option>
                    <option value="inbound_call">Inbound call</option>
                    <option value="baseline">Baseline</option>
                    <option value="seasonal_visit">Seasonal</option>
                    <option value="customer_request">Request</option>
                    <option value="prior_job_follow_up">Prior job</option>
                    <option value="membership_recommendation">Membership</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Priority</span>
                  <select
                    className="mt-1 field-input w-full text-sm"
                    value={activeOpp.threeSixtyPriority ?? ''}
                    onChange={e => onUpdateOpportunity({ threeSixtyPriority: (e.target.value || null) as Opportunity['threeSixtyPriority'] })}
                  >
                    <option value="">Not set</option>
                    <option value="red">Red</option>
                    <option value="yellow">Yellow</option>
                    <option value="green">Green</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Finding / reason</span>
                <textarea
                  className="mt-1 field-input w-full resize-none text-sm"
                  rows={3}
                  value={activeOpp.threeSixtyFinding ?? ''}
                  onChange={e => onUpdateOpportunity({ threeSixtyFinding: e.target.value })}
                  placeholder="Why this opportunity exists..."
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened before</p>
            {priorChain.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">This is the first recorded step for this opportunity.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {priorChain.map(opp => (
                  <button
                    key={opp.id}
                    className="w-full rounded-md border bg-muted/20 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => onOpenAncestor(opp)}
                  >
                    <p className="text-sm font-medium">{areaLabel(opp.area)}: {opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.stage} · {fmtDate(opp.updatedAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-muted/20 px-2 py-2">
              <p className="text-sm font-bold">{jobMessageCount}</p>
              <p className="text-[10px] text-muted-foreground">Messages</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-2 py-2">
              <p className="text-sm font-bold">{hasPortalActivity ? 'Yes' : 'No'}</p>
              <p className="text-[10px] text-muted-foreground">Portal</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-2 py-2">
              <p className="truncate text-sm font-bold">{sourceLabel(activeOpp.threeSixtySource)}</p>
              <p className="text-[10px] text-muted-foreground">Source</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface LineageNodeProps {
  opp: Opportunity;
  isCurrent: boolean;
  isReadOnly: boolean;
  onClick: () => void;
}

function LineageNode({ opp, isCurrent, isReadOnly, onClick }: LineageNodeProps) {
  const label = areaLabel(opp.area);
  const id = displayId(opp);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:bg-muted/50 cursor-pointer'
      }`}
      onClick={isCurrent ? undefined : onClick}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
        isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        {areaIcon(opp.area)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-xs font-mono text-muted-foreground">{id}</span>
          {isReadOnly && (
            <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
              <Lock className="w-2.5 h-2.5" /> Approved — Read Only
            </Badge>
          )}
          {isCurrent && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
              Current
            </Badge>
          )}
        </div>
        <div className="text-sm font-medium text-foreground truncate mt-0.5">{opp.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {fmtDate(opp.createdAt)} · {fmtDollar(opp.value)}
          {opp.wonAt && <span className="ml-2 text-emerald-600 font-medium">✓ Approved {fmtDate(opp.wonAt)}</span>}
        </div>
      </div>
      {!isCurrent && (
        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function OpportunityDetailsTab() {
  const { state, setActiveOpportunity, setSection, navigateToTopLevel, convertLeadToEstimate, updateOpportunity } = useEstimator();
  // MUST be before any early return (Rules of Hooks)
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const activeOpp = state.opportunities.find(o => o.id === state.activeOpportunityId)!;
  const { data: jobContext, isLoading: jobContextLoading } = trpc.customers.getJobContext.useQuery(
    { opportunityId: activeOpp?.id ?? '' },
    { enabled: !!activeOpp?.id, staleTime: 30_000 },
  );
  if (!activeOpp) return null;

  // Build lineage chain: lead → estimate → job
  const chain: Opportunity[] = [];

  // Walk backwards to find the root lead
  const findLead = (opp: Opportunity): Opportunity | undefined => {
    if (opp.sourceLeadId) {
      return state.opportunities.find(o => o.id === opp.sourceLeadId);
    }
    return undefined;
  };

  const findEstimate = (opp: Opportunity): Opportunity | undefined => {
    if (opp.sourceEstimateId) {
      return state.opportunities.find(o => o.id === opp.sourceEstimateId);
    }
    return undefined;
  };

  // Build chain based on current area
  if (activeOpp.area === 'lead') {
    chain.push(activeOpp);
  } else if (activeOpp.area === 'estimate') {
    const lead = findLead(activeOpp);
    if (lead) chain.push(lead);
    chain.push(activeOpp);
  } else if (activeOpp.area === 'job') {
    const estimate = findEstimate(activeOpp);
    if (estimate) {
      const lead = findLead(estimate);
      if (lead) chain.push(lead);
      chain.push(estimate);
    } else if (activeOpp.sourceLeadId) {
      const lead = findLead(activeOpp);
      if (lead) chain.push(lead);
    }
    chain.push(activeOpp);
  }

  // Navigate to an ancestor opportunity
  const openAncestor = (opp: Opportunity) => {
    if (opp.id === activeOpp.id) return;
    // Switch to the ancestor — SET_ACTIVE_OPPORTUNITY saves current snapshot and restores theirs
    setActiveOpportunity(opp.id);
    // Default to details tab for the ancestor
    setSection('opp-details');
  };

  // Contact info: prefer live customer record (always up-to-date),
  // fall back to clientSnapshot (frozen at conversion), then jobInfo.
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
  const snap = activeOpp.clientSnapshot;
  const contact = {
    name: activeCustomer
      ? [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') || activeCustomer.displayName || '—'
      : snap?.client || state.jobInfo.client || '—',
    company: activeCustomer?.company || snap?.companyName || state.jobInfo.companyName || '',
    phone: activeCustomer?.mobilePhone || activeCustomer?.homePhone || activeCustomer?.workPhone || snap?.phone || state.jobInfo.phone || '—',
    email: activeCustomer?.email || snap?.email || state.jobInfo.email || '—',
    address: activeCustomer?.street || snap?.address || state.jobInfo.address || '',
    city: activeCustomer?.city || snap?.city || state.jobInfo.city || '',
    stateAbbr: activeCustomer?.state || snap?.state || state.jobInfo.state || '',
    zip: activeCustomer?.zip || snap?.zip || state.jobInfo.zip || '',
    scope: snap?.scope || state.jobInfo.scope || '',
    jobType: snap?.jobType || state.jobInfo.jobType || '',
  };

  const fullAddress = [contact.address, contact.city, contact.stateAbbr, contact.zip]
    .filter(Boolean).join(', ');

  const isApproved = !!activeOpp.wonAt;
  const internalInvoiceCount = jobContext?.invoices?.length ?? 0;
  const portalInvoiceCount = jobContext?.portalInvoices?.length ?? 0;
  const scheduleEventCount = jobContext?.scheduleEvents?.length ?? 0;
  const jobMessageCount = jobContext?.messages?.length ?? 0;
  const milestoneCount = jobContext?.milestones?.length ?? 0;
  const updateCount = jobContext?.updates?.length ?? 0;
  const hasPortalEstimate = !!jobContext?.portalEstimate;
  const hasPortalActivity = hasPortalEstimate || portalInvoiceCount > 0 || jobMessageCount > 0;
  const showPortalGap = !jobContextLoading && activeOpp.area !== 'lead' && !hasPortalActivity;
  const methodStep = inferOpportunityThreeSixtyStep(activeOpp);
  const workflowStep = getWorkflowStep(activeOpp.area, activeOpp.stage);
  const commandPlan = buildOpportunityCommandPlan({
    opportunity: activeOpp,
    methodStep,
    hasPortalActivity,
    workflowNextAction: workflowStep.nextAction,
    workflowAiDraft: workflowStep.aiDraft,
    approvalLevel: workflowStep.approvalLevel,
  });

  // Back-to-customer: navigate to the customer profile if we know the active customer
  const handleBackToCustomer = () => {
    if (state.activeCustomerId) {
      setActiveOpportunity(null);
      setSection('customer');
    } else {
      navigateToTopLevel('customers');
    }
  };

  return (
    <div className="container py-6 max-w-6xl space-y-6">

      <OpportunityCommandCenter
        activeOpp={activeOpp}
        chain={chain}
        contact={{ name: contact.name, phone: contact.phone, email: contact.email }}
        methodStep={methodStep}
        workflowStep={workflowStep}
        commandPlan={commandPlan}
        hasPortalActivity={hasPortalActivity}
        jobMessageCount={jobMessageCount}
        onBackToCustomer={handleBackToCustomer}
        onOpenAncestor={openAncestor}
        onUpdateOpportunity={payload => updateOpportunity(activeOpp.id, payload)}
        onCall={contact.phone !== '—' ? () => { window.location.href = `tel:${contact.phone}`; } : undefined}
        onEmail={contact.email !== '—' ? () => { window.location.href = `mailto:${contact.email}?subject=${activeOpp.area === 'lead' ? 'Following up on your project' : activeOpp.area === 'estimate' ? 'Your Handy Pioneers estimate' : 'Project update from Handy Pioneers'}`; } : undefined}
      />
      {/* Approved / locked banner */}
      {isApproved && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
          <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Approved Estimate — Read Only
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              This estimate was signed on {fmtDate(activeOpp.wonAt)}. Any changes must be done as a change order on the associated job.
            </p>
          </div>
        </div>
      )}

      <details className="rounded-xl border bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40">
          Reference record, role workspace, portal links, and history
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Open when you need details beyond the next action.
          </span>
        </summary>
        <div className="space-y-5 border-t p-4">

      {/* Opportunity header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="capitalize text-xs gap-1">
                  {areaIcon(activeOpp.area)}
                  {areaLabel(activeOpp.area)}
                </Badge>
                {activeOpp.jobNumber && (
                  <span className="text-xs font-mono text-muted-foreground">{activeOpp.jobNumber}</span>
                )}
                <Badge
                  variant="secondary"
                  className="text-xs"
                >
                  {activeOpp.stage}
                </Badge>
              </div>
              {/* Inline editable title */}
              {editingTitle ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (titleDraft.trim()) updateOpportunity(activeOpp.id, { title: titleDraft.trim() });
                        setEditingTitle(false);
                      } else if (e.key === 'Escape') {
                        setEditingTitle(false);
                      }
                    }}
                    className="text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none flex-1 min-w-0"
                    autoFocus
                  />
                  <button onClick={() => { if (titleDraft.trim()) updateOpportunity(activeOpp.id, { title: titleDraft.trim() }); setEditingTitle(false); }} className="text-emerald-600 hover:text-emerald-700"><Check size={16} /></button>
                  <button onClick={() => setEditingTitle(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 group/title">
                  <CardTitle className="text-xl leading-tight">{activeOpp.title}</CardTitle>
                  {!isApproved && (
                    <button
                      onClick={() => { setTitleDraft(activeOpp.title); setEditingTitle(true); }}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-bold text-primary">{fmtDollar(activeOpp.value)}</div>
              <div className="text-xs text-muted-foreground">Estimated value</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {fmtDate(activeOpp.createdAt)}</span>
            </div>
            {activeOpp.scheduledDate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Scheduled {fmtDate(activeOpp.scheduledDate)}</span>
              </div>
            )}
            {activeOpp.wonAt && (
              <div className="flex items-center gap-2 text-emerald-600">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Won {fmtDate(activeOpp.wonAt)}</span>
              </div>
            )}
          </div>

          {(activeOpp.notes || contact.scope) && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description / Scope</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {activeOpp.notes || contact.scope}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">{contact.name}</div>
                  {contact.company && <div className="text-xs text-muted-foreground">{contact.company}</div>}
                </div>
              </div>
              {contact.phone !== '—' && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a>
                </div>
              )}
              {contact.email !== '—' && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                </div>
              )}
            </div>
            {fullAddress && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <div>{contact.address}</div>
                  {(contact.city || contact.stateAbbr || contact.zip) && (
                    <div className="text-muted-foreground">{[contact.city, contact.stateAbbr, contact.zip].filter(Boolean).join(', ')}</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {contact.jobType && (
            <>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Job type: </span>
                <span className="font-medium">{contact.jobType}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Canonical job/opportunity record */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Job Record
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internal app and client portal links for this specific {areaLabel(activeOpp.area).toLowerCase()}.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Internal invoices</p>
              <p className="text-lg font-semibold">{jobContextLoading ? '...' : internalInvoiceCount}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Portal estimate</p>
              <p className="text-sm font-semibold">{jobContextLoading ? '...' : hasPortalEstimate ? 'Linked' : 'Not linked'}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Portal invoices</p>
              <p className="text-lg font-semibold">{jobContextLoading ? '...' : portalInvoiceCount}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Schedule events</p>
              <p className="text-lg font-semibold">{jobContextLoading ? '...' : scheduleEventCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-border px-3 py-2">
              <span className="text-muted-foreground">Messages</span>
              <span className="float-right font-semibold">{jobContextLoading ? '...' : jobMessageCount}</span>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <span className="text-muted-foreground">Milestones</span>
              <span className="float-right font-semibold">{jobContextLoading ? '...' : milestoneCount}</span>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <span className="text-muted-foreground">Updates</span>
              <span className="float-right font-semibold">{jobContextLoading ? '...' : updateCount}</span>
            </div>
          </div>

          {jobContext?.signOff && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Client sign-off is attached to this job record.
            </div>
          )}

          {showPortalGap && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This {areaLabel(activeOpp.area).toLowerCase()} has no linked portal estimate, portal invoice, or job-scoped portal messages yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role-specific briefs — when a user is assigned a role, swap in their tailored view */}
      {activeOpp.assignedRole === 'consultant' && (
        <ConsultantBrief opportunity={activeOpp} customer={activeCustomer} />
      )}
      {activeOpp.assignedRole === 'project_manager' && activeOpp.area === 'job' && (
        <PmHandoffBrief opportunity={activeOpp} customer={activeCustomer} />
      )}

      {/* Lead nurturing workspace — only shown for leads (skip if consultant brief is active) */}
      {activeOpp.area === 'lead' && activeOpp.assignedRole !== 'consultant' && <LeadNurturingPanel />}

      {/* Estimate / job details panel — stage switcher, notes, attachments, contact */}
      {(activeOpp.area === 'estimate' || activeOpp.area === 'job') &&
        activeOpp.assignedRole !== 'consultant' &&
        !(activeOpp.assignedRole === 'project_manager' && activeOpp.area === 'job') && <EstimateDetailsPanel />}

      {/* Lineage chain */}
      {chain.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="w-4 h-4" /> Opportunity Journey
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any ancestor to open it as a reference. Approved estimates are read-only.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {chain.map((opp, i) => {
              const isCurrent = opp.id === activeOpp.id;
              const isReadOnly = opp.area === 'estimate' && !!opp.wonAt && !isCurrent;
              return (
                <div key={opp.id} className="space-y-2">
                  <LineageNode
                    opp={opp}
                    isCurrent={isCurrent}
                    isReadOnly={isReadOnly}
                    onClick={() => openAncestor(opp)}
                  />
                  {i < chain.length - 1 && (
                    <div className="flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Job-scoped communication feed */}
      {!!jobContext?.messages?.length && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Job Communication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobContext.messages.slice(0, 5).map((message: any) => (
              <div key={message.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">{message.subject || message.channel || 'Message'}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fmtDate(message.sentAt || message.createdAt)}</span>
                </div>
                {message.body && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{message.body}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Customer Activity Feed — all comms for this customer */}
      {state.activeCustomerId && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <MessageSquare size={13} />
            <span>Customer Activity</span>
            <span className="ml-auto font-normal normal-case">All channels — live</span>
          </div>
          <CustomerActivityFeed customerId={state.activeCustomerId} compact />
        </div>
      )}

        </div>
      </details>

      {/* Convert to Estimate modal */}
      {showConvertModal && activeOpp.area === 'lead' && (
        <ConvertToEstimateModal
          lead={activeOpp}
          onConfirm={(title, value, transferNotes, transferAttachments) => {
            convertLeadToEstimate(activeOpp.id, title, value, transferNotes, transferAttachments);
            setShowConvertModal(false);
          }}
          onClose={() => setShowConvertModal(false)}
        />
      )}

    </div>
  );
}
