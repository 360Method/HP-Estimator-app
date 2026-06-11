// ClientPanels — Phase D4 extraction.
//
// The shared 360 / opportunity panels lifted out of CustomerSection verbatim
// (no visual or behavior change). Each component pulls its data and handlers
// from useClientUmbrella(); the module-private pure helpers take plain args.
// Kept in one file so the cross-references between the panels stay intact.
import { useClientUmbrella } from './ClientUmbrellaContext';
import {
  LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, Opportunity,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PipelineBoard from '@/components/PipelineBoard';
import BaselineWalkthroughPanel from '@/components/BaselineWalkthroughPanel';
import { getOpportunityHeat, getWorkflowStep } from '@/components/OpportunityWorkflowPanel';
import {
  inferOpportunityThreeSixtyStep,
  getCustomerFacingStepAction,
  getThreeSixtyRoleResponsibility,
  type ThreeSixtyOperatorRole,
} from '@/lib/threeSixtyMethod';
import {
  bucketRoadmapItems,
  buildRoadmapItemsFromOpportunities,
  formatInvestmentRange,
  roadmapSummary,
  type RoadmapItem,
} from '@/lib/roadmap';
import { fmtDollar } from '@/components/clients/formatters';
import { toast } from 'sonner';
import { Download, ChevronRight } from 'lucide-react';

// ── Pure helpers (module-level; take plain args) ──
export const roleForOpportunity = (opp: Opportunity): ThreeSixtyOperatorRole => {
  if (opp.area === 'lead') return 'Lead Desk';
  if (opp.area === 'estimate') return 'Consultant Desk';
  if (opp.area === 'job') {
    if (['New Job', 'Deposit Needed', 'Deposit Collected', 'Need to Order Materials', 'Waiting on Materials', 'Materials Received', 'Unscheduled', 'Scheduled'].includes(opp.stage)) return 'PM Desk';
    if (['In Progress', 'Completed', 'Awaiting Sign-Off'].includes(opp.stage)) return 'Field Desk';
    if (opp.stage === 'Invoice Paid') return 'Retainment Desk';
    if (opp.stage === 'Invoice Sent') return 'Closeout Desk';
  }
  return 'Retainment Desk';
};

const opportunityPriorityScore = (opp: Opportunity) => {
  const heat = getOpportunityHeat(opp.area, opp.stage, opp.value, opp.updatedAt);
  const heatScore = heat.level === 'hot' ? 400 : heat.level === 'warm' ? 250 : 100;
  const methodPriority = opp.threeSixtyPriority === 'red' ? 300 : opp.threeSixtyPriority === 'yellow' ? 150 : 0;
  const valueScore = Math.min(Math.floor((opp.value || 0) / 1000), 100);
  const staleDays = Math.floor((Date.now() - new Date(opp.updatedAt || opp.createdAt).getTime()) / 86_400_000);
  return heatScore + methodPriority + valueScore + Math.min(staleDays * 4, 80);
};

const customerVisibilityPolicy = (opp: Opportunity) => {
  const methodStep = inferOpportunityThreeSixtyStep(opp);
  const hasMoney = (opp.value || 0) > 0 || opp.area === 'estimate' || opp.stage.includes('Invoice') || opp.stage.includes('Deposit');
  const requiresReview =
    hasMoney ||
    methodStep.key === 'prioritize' ||
    methodStep.key === 'upgrade' ||
    methodStep.key === 'scale';

  if (requiresReview) {
    return {
      label: 'Review before customer',
      detail: 'Scope, price, schedule, roadmap, or property-intelligence language needs human approval before portal visibility.',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  return {
    label: 'AI can prep draft',
    detail: 'AI can draft the next touch, but the desk owner still controls sending.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
};

export const PipelineTab = () => {
  const {
    areaMap, activeCustomerTab, opportunities, addOpportunity, createOpportunityMutation,
    activeCustomerId, updateOpportunity, removeOpportunity, convertLeadToEstimate,
    convertEstimateToJob, archiveJob, setActiveOpportunity, setSection, displayName,
    customerFullName, activeCustomer, setShowDuplicateWarning, setIntakeModal,
  } = useClientUmbrella();
  const area = areaMap[activeCustomerTab] as PipelineArea;
  const areaStages: OpportunityStage[] =
    area === 'lead' ? LEAD_STAGES :
    area === 'estimate' ? ESTIMATE_STAGES :
    JOB_STAGES;
  const areaOpps = opportunities.filter(o => o.area === area);
  return (
    <PipelineBoard
      area={area}
      stages={areaStages}
      opportunities={areaOpps}
      onAdd={(title, stage, value, notes) => {
        addOpportunity({ area, stage, title, value, notes, archived: false });
        if (activeCustomerId) {
          createOpportunityMutation.mutate({ customerId: activeCustomerId, area, stage, title, value, notes, archived: false });
        }
      }}
      onUpdate={updateOpportunity}
      onRemove={removeOpportunity}
      onConvertToEstimate={area === 'lead' ? convertLeadToEstimate : undefined}
      onConvertToJob={area === 'estimate' ? convertEstimateToJob : undefined}
      onArchive={area === 'job' ? archiveJob : undefined}
      onOpen={(id) => {
        setActiveOpportunity(id);
        setSection('opp-details');
      }}
      customerName={displayName}
      onOpenIntakeModal={() => {
        const targetArea = area === 'lead' ? 'lead' : area === 'estimate' ? 'estimate' : 'job';
        // Check for existing open (non-archived) opportunities in this area for this customer
        const existing = opportunities.find(o =>
          o.area === targetArea &&
          !o.archived &&
          (o.clientSnapshot?.client === (customerFullName || activeCustomer?.displayName) ||
           (activeCustomer && o.clientSnapshot?.client === (activeCustomer.displayName || [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' '))))
        );
        if (existing) {
          setShowDuplicateWarning({ area: targetArea, existing: existing.title });
        } else {
          setIntakeModal(targetArea);
        }
      }}
      compact
    />
  );
};

export const CustomerActionQueuePanel = () => {
  const { activeOpps, handleTabClick, setActiveOpportunity, setSection } = useClientUmbrella();
  const openOpportunityCommand = (id: string) => {
    setActiveOpportunity(id);
    setSection('opp-details');
  };
  const actionOpps = [...activeOpps]
    .sort((a, b) => opportunityPriorityScore(b) - opportunityPriorityScore(a))
    .slice(0, 6);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Customer action queue</p>
          <h3 className="mt-1 text-base font-semibold">What needs attention next</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by heat, 360 priority, value, and stale follow-up so each desk sees the next move without searching through tabs.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => handleTabClick('workflow')}>
          View role desks
        </Button>
      </div>

      {actionOpps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          No active opportunities. Start with a lead, baseline walkthrough, seasonal visit, or membership recommendation.
        </div>
      ) : (
        <div className="space-y-2">
          {actionOpps.map((opp, index) => {
            const heat = getOpportunityHeat(opp.area, opp.stage, opp.value, opp.updatedAt);
            const workflow = getWorkflowStep(opp.area, opp.stage);
            const methodStep = inferOpportunityThreeSixtyStep(opp);
            const role = roleForOpportunity(opp);
            const roleModel = getThreeSixtyRoleResponsibility(role);
            const visibility = customerVisibilityPolicy(opp);
            return (
              <div key={opp.id} className="rounded-lg border bg-background px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-foreground">{opp.title}</h4>
                      <Badge variant="outline" className={heat.className}>
                        <span className={`mr-1.5 h-2 w-2 rounded-full ${heat.dotClassName}`} />
                        {heat.label}
                      </Badge>
                      <Badge variant="secondary">{role}</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {methodStep.number}. {methodStep.name}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {opp.area} / {opp.stage} / {fmtDollar(opp.value || 0)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openOpportunityCommand(opp.id)}>
                    Open Command
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr]">
                  <div className="rounded-md border bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desk action</p>
                    <p className="mt-1 text-xs leading-relaxed">{workflow.nextAction}</p>
                  </div>
                  <div className="rounded-md border bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI support</p>
                    <p className="mt-1 text-xs leading-relaxed">{methodStep.aiSupport}</p>
                  </div>
                  <div className={`rounded-md border px-3 py-2 ${visibility.className}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide">{visibility.label}</p>
                    <p className="mt-1 text-xs leading-relaxed">{visibility.detail}</p>
                  </div>
                </div>

                {roleModel && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Review trigger: {roleModel.reviewRequiredFor.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CustomerOpportunityCommandCard = ({ opp }: { opp: Opportunity }) => {
  const { setActiveOpportunity, setSection } = useClientUmbrella();
  const openOpportunityCommand = (id: string) => {
    setActiveOpportunity(id);
    setSection('opp-details');
  };
  const heat = getOpportunityHeat(opp.area, opp.stage, opp.value, opp.updatedAt);
  const step = getWorkflowStep(opp.area, opp.stage);
  const methodStep = inferOpportunityThreeSixtyStep(opp);
  return (
    <div className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${heat.className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground truncate">{opp.title}</h3>
            <Badge variant="outline" className={heat.className}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ${heat.dotClassName}`} />
              {heat.label}
            </Badge>
            <Badge variant="secondary" className="capitalize">{opp.area}</Badge>
            <Badge variant="outline" className="text-[10px]">
              360: {methodStep.number}. {methodStep.name}
            </Badge>
            {opp.threeSixtyPriority && (
              <Badge
                variant="outline"
                className={`text-[10px] capitalize ${
                  opp.threeSixtyPriority === 'red' ? 'border-rose-200 bg-rose-50 text-rose-700' :
                  opp.threeSixtyPriority === 'yellow' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                  'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {opp.threeSixtyPriority}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {opp.stage} · {fmtDollar(opp.value || 0)} · Owner: {roleForOpportunity(opp)}
          </p>
          {opp.threeSixtyFinding && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{opp.threeSixtyFinding}</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => openOpportunityCommand(opp.id)}>
          Open Command
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
          <p className="mt-1 text-sm leading-relaxed">{step.nextAction}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer sees</p>
          <p className="mt-1 text-sm leading-relaxed">{step.customerReceives}</p>
        </div>
      </div>
    </div>
  );
};

export const CustomerThreeSixtyStatusPanel = () => {
  const { threeSixtyStatus, membershipEnginePlan } = useClientUmbrella();
  const statusToneClass = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    watch: 'border-amber-200 bg-amber-50 text-amber-800',
    urgent: 'border-rose-200 bg-rose-50 text-rose-800',
    empty: 'border-slate-200 bg-slate-50 text-slate-700',
  }[threeSixtyStatus.healthTone as 'good' | 'watch' | 'urgent' | 'empty'];
  const seasonClass = {
    completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    scheduled: 'bg-blue-50 text-blue-800 border-blue-200',
    due: 'bg-amber-50 text-amber-800 border-amber-200',
    included: 'bg-slate-50 text-slate-700 border-slate-200',
    not_included: 'bg-slate-50 text-slate-400 border-slate-200',
  };
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">360 Method status</p>
          <h3 className="mt-1 text-base font-semibold">
            {threeSixtyStatus.currentStep.number}. {threeSixtyStatus.currentStep.name} / {threeSixtyStatus.currentPhase.toUpperCase()}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{threeSixtyStatus.nextInternalAction}</p>
        </div>
        <Badge className={statusToneClass}>
          {threeSixtyStatus.healthScore == null ? 'No score' : `Score ${threeSixtyStatus.healthScore}/100`}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Baseline</p>
          <p className="mt-1 text-sm font-medium capitalize">{threeSixtyStatus.baselineStatus}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Labor bank</p>
          <p className="mt-1 text-sm font-medium">{fmtDollar(threeSixtyStatus.laborBankBalanceCents / 100)}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Open work</p>
          <p className="mt-1 text-sm font-medium">{threeSixtyStatus.openWorkOrders.length} work order{threeSixtyStatus.openWorkOrders.length === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</p>
          <p className="mt-1 text-sm font-medium">
            <span className="text-rose-600">{threeSixtyStatus.priorityCounts.red} red</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-amber-600">{threeSixtyStatus.priorityCounts.yellow} yellow</span>
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Membership engine</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">{membershipEnginePlan.current.label}</p>
            <p className="mt-1 text-sm text-emerald-900">{membershipEnginePlan.current.internalAction}</p>
            <p className="mt-2 text-xs text-emerald-800">Complete when: {membershipEnginePlan.current.completionSignal}</p>
          </div>
          <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
            {membershipEnginePlan.current.owner}
          </Badge>
        </div>
        {membershipEnginePlan.next && (
          <p className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
            Next in flywheel: <span className="font-semibold">{membershipEnginePlan.next.label}</span> - {membershipEnginePlan.next.internalAction}
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {threeSixtyStatus.seasonalVisits.map((visit: any) => (
          <div key={visit.season} className={`rounded-lg border px-3 py-2 ${seasonClass[visit.status as keyof typeof seasonClass]}`}>
            <p className="text-sm font-medium">{visit.label}</p>
            <p className="mt-0.5 text-[11px] capitalize">{visit.status.replace('_', ' ')}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer-facing next step</p>
        <p className="mt-1 text-sm">{threeSixtyStatus.nextCustomerAction}</p>
      </div>
    </div>
  );
};

export const PropertyThreeSixtyWorkspace = () => {
  const {
    propertyBoard, selectedPropertyPhase, setSelectedPropertyPhase, activeProperty,
    activeOpps, activeCustomer, activeCustomerId, setActiveOpportunity, setSection,
  } = useClientUmbrella();
  const openOpportunityCommand = (id: string) => {
    setActiveOpportunity(id);
    setSection('opp-details');
  };
  const activePhase = propertyBoard.phases.find((phase: any) => phase.id === selectedPropertyPhase) ?? propertyBoard.phases[0];
  const propertyAddress = activeProperty
    ? [activeProperty.street, activeProperty.city, activeProperty.state, activeProperty.zip].filter(Boolean).join(', ')
    : 'No property selected';
  const scopedPropertyOpps = activeOpps.filter((opp: Opportunity) => !activeProperty?.id || !opp.propertyId || opp.propertyId === activeProperty.id);
  const roadmapItems = buildRoadmapItemsFromOpportunities(scopedPropertyOpps);

  const downloadRoadmapDraft = async (items: RoadmapItem[]) => {
    if (items.length === 0) {
      toast.info('Add at least one property opportunity or finding before exporting a roadmap.');
      return;
    }
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const buckets = bucketRoadmapItems(items);
    const summary = roadmapSummary(items);
    const left = 48;
    let y = 56;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('360 Method Priority Roadmap Draft', left, y);
    y += 22;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`${activeProperty?.label ?? 'Primary property'} - ${propertyAddress}`, left, y);
    y += 16;
    pdf.text(`Review before sending. Total planning range: ${formatInvestmentRange(summary.totalLow, summary.totalHigh)}`, left, y);
    y += 24;

    for (const bucket of buckets) {
      if (y > 700) {
        pdf.addPage();
        y = 56;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(`${bucket.label.toUpperCase()} - ${bucket.horizon} - ${formatInvestmentRange(bucket.totalLow, bucket.totalHigh)}`, left, y);
      y += 16;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(bucket.internalMeaning, left, y, { maxWidth: 500 });
      y += 20;
      for (const item of bucket.items) {
        if (y > 700) {
          pdf.addPage();
          y = 56;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(item.title, left, y, { maxWidth: 500 });
        y += 13;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(`${formatInvestmentRange(item.investmentLow, item.investmentHigh)} - ${item.finding}`, left, y, { maxWidth: 500 });
        y += 24;
      }
      if (bucket.items.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.text('No items in this bucket yet.', left, y);
        y += 18;
      }
      y += 8;
    }
    pdf.save(`360-roadmap-draft-${activeCustomerId ?? 'customer'}.pdf`);
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Property 360 Method</p>
          <h3 className="mt-1 text-lg font-semibold">{activeProperty?.label ?? 'Primary property'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{propertyAddress}</p>
        </div>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-800">
          Customer - Property - 360 Method - Opportunities
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {propertyBoard.phases.map((phase: any) => {
          const count = phase.steps.reduce((sum: number, step: any) => sum + step.opportunities.length, 0);
          return (
            <button
              key={phase.id}
              onClick={() => setSelectedPropertyPhase(phase.id)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                selectedPropertyPhase === phase.id
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-background hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{phase.name}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{count}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{phase.promise}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {activePhase.steps.map((step: any) => {
          const ownerModel = getThreeSixtyRoleResponsibility(step.owner);
          return (
          <div key={step.key} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {step.number}
                </p>
                <h4 className="mt-1 text-sm font-semibold">{step.name}</h4>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{step.owner}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{step.operatorOutcome}</p>
            {step.key === 'baseline' && activePhase.id === 'aware' && (
              <div className="mt-3">
                <BaselineWalkthroughPanel
                  customerName={
                    activeCustomer
                      ? [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') || activeCustomer.displayName || activeCustomer.company || 'Customer'
                      : 'Customer'
                  }
                  propertyLabel={activeProperty?.label ?? 'Primary property'}
                  propertyAddress={propertyAddress}
                />
              </div>
            )}
            {step.key === 'prioritize' && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Roadmap Generator</p>
                    <h5 className="mt-1 text-sm font-semibold text-amber-950">Internal consultant draft</h5>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900">
                      This is Step 3. Review NOW / SOON / WAIT, investment ranges, and source findings before anything is sent to the portal.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => downloadRoadmapDraft(roadmapItems)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Draft PDF
                  </Button>
                </div>
                {roadmapItems.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed border-amber-300 bg-white px-3 py-3 text-center text-xs text-amber-800">
                    No source findings yet. Add a lead, estimate, job, or consultant finding to generate this property's roadmap.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {bucketRoadmapItems(roadmapItems).map(bucket => (
                      <div key={bucket.urgency} className="rounded-lg border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{bucket.label}</p>
                            <p className="text-[11px] text-muted-foreground">{bucket.horizon}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{bucket.items.length}</Badge>
                        </div>
                        <p className="mt-2 text-xs font-medium">{formatInvestmentRange(bucket.totalLow, bucket.totalHigh)}</p>
                        <div className="mt-2 space-y-1.5">
                          {bucket.items.slice(0, 3).map(item => (
                            <button
                              key={item.id}
                              className="w-full rounded-md border bg-background px-2 py-2 text-left hover:bg-muted"
                              onClick={() => item.sourceOpportunityId && openOpportunityCommand(item.sourceOpportunityId)}
                            >
                              <p className="truncate text-xs font-medium">{item.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.finding}</p>
                            </button>
                          ))}
                          {bucket.items.length === 0 && (
                            <p className="rounded-md border border-dashed px-2 py-2 text-center text-[11px] text-muted-foreground">No items.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 rounded-md border bg-white px-3 py-2 text-xs text-muted-foreground">
                  Send rule: roadmap items with dollar ranges must be consultant-reviewed before portal delivery.
                </div>
              </div>
            )}
            <div className="mt-3 rounded-md border bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer next step</p>
              <p className="mt-1 text-xs leading-relaxed">{getCustomerFacingStepAction(step)}</p>
            </div>
            {ownerModel && (
              <div className="mt-2 rounded-md border bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role owns</p>
                <p className="mt-1 text-xs leading-relaxed">{ownerModel.owns}</p>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {step.opportunities.length === 0 ? (
                <p className="rounded-md border border-dashed bg-white px-3 py-3 text-center text-xs text-muted-foreground">
                  No opportunities here yet.
                </p>
              ) : (
                step.opportunities.map((opp: Opportunity) => (
                  <CustomerOpportunityCommandCard key={opp.id} opp={opp} />
                ))
              )}
            </div>
          </div>
          );
        })}
      </div>

      {activePhase.id === 'advance' && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Step 9 disclaimer</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            CFO Intelligence is property documentation and planning support. Handy Pioneers is not acting as a financial advisor,
            appraiser, or licensed real estate agent. The record is intended to help the customer discuss property value,
            sale readiness, insurance, refinance, or planning questions with qualified professionals.
          </p>
        </div>
      )}
    </div>
  );
};
