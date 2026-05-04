import { useMemo, useState } from 'react';
import type { ElementType } from 'react';
import {
  Bot,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Flame,
  Hammer,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Customer, Opportunity, PipelineArea } from '@/lib/types';
import {
  getOpportunityHeat,
  getWorkflowStep,
  type OpportunityHeat,
} from '@/components/OpportunityWorkflowPanel';
import {
  inferOpportunityThreeSixtyStep,
  type ThreeSixtyMethodStep,
} from '@/lib/threeSixtyMethod';
import {
  getOpportunityWorkflowDefinition,
  type RevenueRoleId,
} from '@/lib/revenueWorkflow';

type DeskKey =
  | 'lead'
  | 'consultant'
  | 'pm'
  | 'field'
  | 'closeout'
  | 'retainment'
  | 'membership';

type DeskDefinition = {
  key: DeskKey;
  label: string;
  owner: string;
  icon: ElementType;
  mission: string;
  aiRole: string;
  outcomes: string[];
};

type DeskOpportunity = Opportunity & {
  customerId: string | null;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  heat: OpportunityHeat;
  methodStep: ThreeSixtyMethodStep;
  methodPriority: 'red' | 'yellow' | 'green';
};

const DESKS: DeskDefinition[] = [
  {
    key: 'lead',
    label: 'Lead Desk',
    owner: 'Lead intake / qualification',
    icon: Phone,
    mission: 'Answer quickly, qualify cleanly, and set the consultant up to win before anyone knocks on the door.',
    aiRole: 'Lead Copilot drafts first responses, qualification recaps, follow-up timing, and consultant handoff notes.',
    outcomes: ['Qualified or disqualified', 'Photos/details gathered', 'Estimate visit scheduled or converted'],
  },
  {
    key: 'consultant',
    label: 'Consultant Desk',
    owner: 'Consultant / estimator',
    icon: ClipboardList,
    mission: 'Guide the homeowner like an expert, define the scope, build the estimate, and help them make a confident decision.',
    aiRole: 'Consultant Copilot prepares site-visit briefs, estimate checklists, proposal summaries, and follow-up drafts.',
    outcomes: ['Site visit completed', 'Estimate reviewed', 'Approval or next decision captured'],
  },
  {
    key: 'pm',
    label: 'PM Desk',
    owner: 'Project manager',
    icon: Briefcase,
    mission: 'Turn approved work into a controlled production plan with deposit, materials, schedule, crew, and customer expectations aligned.',
    aiRole: 'PM Copilot builds kickoff notes, material checklists, customer updates, and change-order prompts.',
    outcomes: ['Deposit/materials controlled', 'Schedule confirmed', 'Crew ready with scope and blockers'],
  },
  {
    key: 'field',
    label: 'Field Desk',
    owner: 'Labor / field team',
    icon: Hammer,
    mission: 'Execute the work, document progress, surface blockers early, and close punch items without losing context.',
    aiRole: 'Field Assistant turns notes/photos into progress updates, punch lists, and internal blocker summaries.',
    outcomes: ['Work completed', 'Photos and notes captured', 'Punch items or blockers escalated'],
  },
  {
    key: 'closeout',
    label: 'Closeout Desk',
    owner: 'AR / closeout',
    icon: CreditCard,
    mission: 'Secure sign-off, invoice correctly, collect payment, and protect the customer relationship at the finish line.',
    aiRole: 'Closeout Agent prepares sign-off requests, invoice reminders, completion summaries, and review timing.',
    outcomes: ['Completion accepted', 'Invoice paid', 'Review/referral moment created'],
  },
  {
    key: 'retainment',
    label: 'Retainment Desk',
    owner: 'Customer success / 360 membership',
    icon: RefreshCw,
    mission: 'Bring the customer back for recurring care, seasonal work, referrals, and 360 membership value.',
    aiRole: 'Retainment Agent watches past jobs, membership status, home-health findings, and next best service prompts.',
    outcomes: ['Next service identified', 'Membership opportunity created', 'Customer relationship extended'],
  },
  {
    key: 'membership',
    label: 'Membership Engine',
    owner: '360 recurring care',
    icon: RefreshCw,
    mission: 'Keep customers inside the 360 Method with baseline, seasonal visits, priority planning, labor bank, and upgrade opportunities.',
    aiRole: 'Membership Agent monitors method step, seasonal timing, work-order findings, red/yellow/green priorities, and next-best-service prompts.',
    outcomes: ['Baseline current', 'Seasonal visits controlled', 'One-off work routed back into recurring care'],
  },
];

const DESK_STAGE_MAP: Record<DeskKey, { areas: PipelineArea[]; stages: string[] }> = {
  lead: {
    areas: ['lead'],
    stages: ['New Lead', 'Return Call Needed', 'First Contact', 'Second Contact', 'Third Contact', 'On Hold', 'Won'],
  },
  consultant: {
    areas: ['estimate'],
    stages: ['Unscheduled', 'Scheduled', 'In Progress', 'Draft', 'Ready to Send', 'Sent', 'Verbal Acceptance', 'Approved'],
  },
  pm: {
    areas: ['job'],
    stages: ['New Job', 'Deposit Needed', 'Deposit Collected', 'Need to Order Materials', 'Waiting on Materials', 'Materials Received', 'Unscheduled', 'Scheduled'],
  },
  field: {
    areas: ['job'],
    stages: ['Scheduled', 'In Progress', 'Completed', 'Awaiting Sign-Off'],
  },
  closeout: {
    areas: ['job'],
    stages: ['Awaiting Sign-Off', 'Invoice Sent'],
  },
  retainment: {
    areas: ['job'],
    stages: ['Invoice Paid'],
  },
  membership: {
    areas: ['lead', 'estimate', 'job'],
    stages: [],
  },
};

const DESK_ROLE_MAP: Partial<Record<DeskKey, RevenueRoleId>> = {
  lead: 'lead_nurturer',
  consultant: 'consultant',
  pm: 'project_manager',
  field: 'field_team',
  closeout: 'closeout',
  retainment: 'retainment',
};

function fmtMoney(value = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function daysSince(iso?: string) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function customerName(customer: Customer) {
  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
    customer.displayName ||
    customer.company ||
    'Unknown customer'
  );
}

function collectOpportunities(customers: Customer[], working: Opportunity[], activeCustomerId: string | null): DeskOpportunity[] {
  const seen = new Set<string>();
  const result: DeskOpportunity[] = [];

  const enrich = (opp: Opportunity, customerId: string | null, name: string, phone?: string, email?: string): DeskOpportunity => {
    const methodStep = inferOpportunityThreeSixtyStep(opp);
    const heat = getOpportunityHeat(opp.area, opp.stage, opp.value, opp.updatedAt);
    const methodPriority = opp.threeSixtyPriority ?? (
      heat.level === 'hot' ? 'red' : heat.level === 'warm' ? 'yellow' : 'green'
    );
    return {
      ...opp,
      customerId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      heat,
      methodStep,
      methodPriority,
    };
  };

  for (const customer of customers) {
    for (const opp of customer.opportunities ?? []) {
      if (seen.has(opp.id)) continue;
      seen.add(opp.id);
      result.push(enrich(
        opp,
        customer.id,
        customerName(customer),
        customer.mobilePhone || customer.homePhone || customer.workPhone || undefined,
        customer.email || undefined,
      ));
    }
  }

  for (const opp of working) {
    if (seen.has(opp.id)) continue;
    seen.add(opp.id);
    result.push(enrich(opp, activeCustomerId, (opp as any).clientSnapshot?.client || 'Working customer'));
  }

  return result.filter(opp =>
    !opp.archived ||
    opp.stage === 'Invoice Paid' ||
    ['track', 'preserve', 'upgrade', 'cfo_intelligence'].includes(opp.methodStep.key)
  );
}

function isForDesk(opp: DeskOpportunity, desk: DeskKey) {
  if (desk === 'membership') {
    return Boolean(
      opp.membershipId ||
      ['baseline', 'inspect', 'track', 'preserve', 'upgrade', 'cfo_intelligence'].includes(opp.methodStep.key) ||
      opp.threeSixtySource === 'baseline' ||
      opp.threeSixtySource === 'seasonal_visit' ||
      opp.threeSixtySource === 'membership_recommendation'
    );
  }
  const roleId = DESK_ROLE_MAP[desk];
  return roleId ? getOpportunityWorkflowDefinition(opp).roleId === roleId : false;
}

function rankOpp(opp: DeskOpportunity) {
  const methodRank = opp.methodPriority === 'red' ? 0 : opp.methodPriority === 'yellow' ? 1 : 2;
  const heatRank = opp.heat.level === 'hot' ? 0 : opp.heat.level === 'warm' ? 1 : 2;
  return methodRank * 2_000_000 + heatRank * 1_000_000 - (opp.value || 0) + daysSince(opp.updatedAt) * 1000;
}

function bucketLabel(opp: DeskOpportunity) {
  if (opp.methodPriority === 'red') return 'Red priority';
  if (opp.methodPriority === 'yellow') return 'Yellow priority';
  if (opp.methodPriority === 'green') return 'Green / maintain';
  if (opp.heat.level === 'hot') return 'Needs me now';
  if (['Sent', 'Invoice Sent', 'Waiting on Materials', 'On Hold'].includes(opp.stage)) return 'Waiting / follow-up';
  if (opp.heat.level === 'cool') return 'Recently handled';
  return 'Next in line';
}

function DeskCard({
  opp,
  onOpen,
  onCustomer,
}: {
  opp: DeskOpportunity;
  onOpen: (opp: DeskOpportunity) => void;
  onCustomer: (opp: DeskOpportunity) => void;
}) {
  const step = getWorkflowStep(opp.area, opp.stage);
  const workflow = getOpportunityWorkflowDefinition(opp);
  const staleDays = daysSince(opp.updatedAt);

  return (
    <Card className={`max-w-full overflow-hidden border-l-4 ${opp.heat.className}`}>
      <CardContent className="p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 max-w-full break-words text-sm font-semibold leading-snug text-foreground">{opp.title}</h3>
              <Badge variant="outline" className={`shrink-0 ${opp.heat.className}`}>
                <span className={`mr-1.5 h-2 w-2 rounded-full ${opp.heat.dotClassName}`} />
                {opp.heat.label}
              </Badge>
              <Badge variant="secondary" className="shrink-0 capitalize">{opp.area}</Badge>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                360: {opp.methodStep.number}. {opp.methodStep.name}
              </Badge>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] capitalize ${
                  opp.methodPriority === 'red' ? 'border-rose-200 bg-rose-50 text-rose-700' :
                  opp.methodPriority === 'yellow' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                  'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {opp.methodPriority}
              </Badge>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {opp.customerName} · {opp.stage} · {fmtMoney(opp.value)}
            </p>
            {opp.threeSixtyFinding && (
              <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{opp.threeSixtyFinding}</p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onOpen(opp)} className="w-full shrink-0 sm:w-auto">
            Open
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next best action</p>
            <p className="mt-1 break-words text-sm leading-relaxed text-foreground">{step.nextAction}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              AI prep: {step.aiDraft}
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Complete when: {workflow.completionSignal}
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              360 outcome: {opp.methodStep.operatorOutcome}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 md:justify-end">
            {opp.customerPhone && (
              <a className="inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent" href={`tel:${opp.customerPhone}`}>
                <Phone className="mr-1.5 h-3.5 w-3.5" />
                Call
              </a>
            )}
            {opp.customerEmail && (
              <a className="inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent" href={`mailto:${opp.customerEmail}`}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Email
              </a>
            )}
            <Button size="sm" variant="outline" onClick={() => onCustomer(opp)}>
              Customer
            </Button>
          </div>
        </div>

        <div className="mt-3 flex max-w-full flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="max-w-full break-words rounded-full bg-background/80 px-2 py-0.5">Bucket: {bucketLabel(opp)}</span>
          <span className="max-w-full break-words rounded-full bg-background/80 px-2 py-0.5">Updated {staleDays === 0 ? 'today' : `${staleDays}d ago`}</span>
          <span className="max-w-full break-words rounded-full bg-background/80 px-2 py-0.5">Customer sees: {step.customerReceives}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowPage() {
  const { state, setActiveCustomer, setActiveOpportunity, setSection } = useEstimator();
  const [activeDesk, setActiveDesk] = useState<DeskKey>('lead');

  const allOpps = useMemo(
    () => collectOpportunities(state.customers, state.opportunities, state.activeCustomerId),
    [state.customers, state.opportunities, state.activeCustomerId],
  );

  const deskOpps = useMemo(
    () => allOpps.filter(opp => isForDesk(opp, activeDesk)).sort((a, b) => rankOpp(a) - rankOpp(b)),
    [allOpps, activeDesk],
  );

  const activeDefinition = DESKS.find(desk => desk.key === activeDesk) ?? DESKS[0];
  const Icon = activeDefinition.icon;
  const needsMeNow = deskOpps.filter(opp => opp.heat.level === 'hot').length;
  const redCount = deskOpps.filter(opp => opp.methodPriority === 'red').length;
  const yellowCount = deskOpps.filter(opp => opp.methodPriority === 'yellow').length;
  const greenCount = deskOpps.filter(opp => opp.methodPriority === 'green').length;
  const deskValue = deskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);

  const openOpportunity = (opp: DeskOpportunity) => {
    if (opp.customerId) setActiveCustomer(opp.customerId);
    setTimeout(() => {
      setActiveOpportunity(opp.id);
      setSection('opp-details');
    }, 60);
  };

  const openCustomer = (opp: DeskOpportunity) => {
    if (opp.customerId) setActiveCustomer(opp.customerId);
    setSection('customer');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Revenue Workflow</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
                <Sparkles className="h-5 w-5 text-primary" />
                Role Desks
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Every card is still tied to one customer and one opportunity. The desk only answers who owns the next move.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-lg font-bold">{deskOpps.length}</p>
                <p className="text-[10px] text-muted-foreground">On desk</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-lg font-bold text-rose-600">{needsMeNow}</p>
                <p className="text-[10px] text-muted-foreground">Hot</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-lg font-bold">{fmtMoney(deskValue)}</p>
                <p className="text-[10px] text-muted-foreground">Value</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-lg font-bold">
                  <span className="text-rose-600">{redCount}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600">{yellowCount}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-emerald-600">{greenCount}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">360 R/Y/G</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-7">
            {DESKS.map(desk => {
              const DeskIcon = desk.icon;
              const count = allOpps.filter(opp => isForDesk(opp, desk.key)).length;
              const hot = allOpps.filter(opp => isForDesk(opp, desk.key) && opp.heat.level === 'hot').length;
              const red = allOpps.filter(opp => isForDesk(opp, desk.key) && opp.methodPriority === 'red').length;
              return (
                <button
                  key={desk.key}
                  onClick={() => setActiveDesk(desk.key)}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    activeDesk === desk.key
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-white text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <DeskIcon className="h-4 w-4" />
                    <span className="text-xs font-bold">{count}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{desk.label}</p>
                  {hot > 0 && <p className="mt-1 text-[10px] font-semibold text-rose-600">{hot} hot</p>}
                  {red > 0 && hot === 0 && <p className="mt-1 text-[10px] font-semibold text-rose-600">{red} red</p>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Secondary views</span>
            <Button size="sm" variant="outline" onClick={() => setSection('pipeline')}>
              Pipeline board
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSection('leads')}>
              Lead inbox
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSection('jobs')}>
              Job list
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSection('three-sixty')}>
              360 roster
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <Card className="max-w-full overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" />
                  {activeDefinition.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{activeDefinition.owner}</p>
              </CardHeader>
              <CardContent className="space-y-4 break-words text-sm">
                <p className="leading-relaxed">{activeDefinition.mission}</p>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    AI support
                  </p>
                  <p className="mt-1 break-words text-sm">{activeDefinition.aiRole}</p>
                </div>
                <div className="rounded-lg border bg-emerald-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    360 operating lens
                  </p>
                  <p className="mt-1 break-words text-sm text-emerald-950">
                    Red means risk or money needs human attention. Yellow means plan the next step. Green means maintain, retain, or document.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desk outcomes</p>
                  <div className="mt-2 space-y-2">
                    {activeDefinition.outcomes.map(outcome => (
                      <div key={outcome} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="min-w-0 break-words">{outcome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="max-w-full overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  Approval Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 break-words text-xs text-muted-foreground">
                <p>Safe to automate: reminders, detail requests, appointment prep, and general updates.</p>
                <p>Human review: customer-specific summaries, job updates, and follow-ups.</p>
                <p>Approval required: pricing, scope, payment links, change orders, sign-off, and firm schedule promises.</p>
              </CardContent>
            </Card>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">Next Work</h2>
                <p className="text-sm text-muted-foreground">Sorted by hot/warm/cool, value, and stale days.</p>
              </div>
              <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
                <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                <span className="min-w-0 break-words">Red gets handled first, then yellow, then green.</span>
              </div>
            </div>

            {deskOpps.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                  <h3 className="mt-3 font-semibold">Nothing on this desk right now</h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    When an opportunity reaches one of this role's stages, it will show up here with the customer, history, next action, and AI prep.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {deskOpps.map(opp => (
                  <DeskCard key={opp.id} opp={opp} onOpen={openOpportunity} onCustomer={openCustomer} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
