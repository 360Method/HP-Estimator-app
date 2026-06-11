import {
  BarChart2,
  BookOpen,
  Bot,
  Calculator,
  CheckCircle2,
  Database,
  GitBranch,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const OPS = [
  {
    title: 'Marketing',
    icon: Megaphone,
    owner: 'Demand creation and nurture',
    ai: 'Marketing Agent turns job history, memberships, seasonality, and customer segments into campaigns.',
    actions: ['Website/funnel attribution', 'Reactivation campaigns', 'Review/referral flywheel'],
    target: 'marketing' as const,
  },
  {
    title: 'Accounting',
    icon: Calculator,
    owner: 'AR/AP, deposits, reconciliation',
    ai: 'Finance Agent watches invoices, deposits, overdue balances, margin flags, and QuickBooks sync health.',
    actions: ['Invoice queue', 'Payment exceptions', 'QuickBooks review'],
    target: 'financials' as const,
  },
  {
    title: 'Reports',
    icon: BarChart2,
    owner: 'Scorecard and operating metrics',
    ai: 'Reporting Agent turns pipeline, revenue, response time, reviews, rework, and membership data into weekly scorecards.',
    actions: ['EOS scorecard', 'Revenue reports', 'Role performance'],
    target: 'reporting' as const,
  },
  {
    title: 'Memberships',
    icon: RefreshCw,
    owner: '360 retention engine',
    ai: 'Retainment Agent tracks membership health, upcoming visits, labor bank value, and repair opportunities.',
    actions: ['Member list', 'Seasonal visits', 'Repair recommendations'],
    target: 'three-sixty' as const,
  },
  {
    title: 'QuickBooks',
    icon: BookOpen,
    owner: 'Accounting integration',
    ai: 'Finance Agent flags sync issues, unmatched payments, invoice gaps, and reconciliation exceptions.',
    actions: ['Sync status', 'Customer matching', 'Invoice reconciliation'],
    target: 'quickbooks' as const,
  },
  {
    title: 'People',
    icon: Users,
    owner: 'Team roles, accountability, capacity',
    ai: 'People Agent highlights role load, missed handoffs, training needs, and operating scorecard gaps.',
    actions: ['Role chart', 'Desk workload', 'Training / SOP needs'],
    settings: 'team',
  },
  {
    title: 'Integrator',
    icon: GitBranch,
    owner: 'Owner-to-COO operating bridge',
    ai: 'Integrator Agent turns owner direction into accountable projects, department priorities, and follow-up tasks.',
    actions: ['Agents hub', 'Approvals inbox', 'SOP library'],
    href: '/admin/agents',
  },
  {
    title: 'Systems / IT',
    icon: Settings,
    owner: 'Integrations, permissions, automations',
    ai: 'Systems Agent monitors phone, email, Stripe, database, portal, and workflow configuration readiness.',
    actions: ['Twilio/email health', 'Portal settings', 'Security and access'],
    settings: 'phone',
  },
] as const;

type CutoverStatus = 'needs-review' | 'testing' | 'ready';

const CUTOVER_STATUS_LABEL: Record<CutoverStatus, string> = {
  'needs-review': 'Needs Review',
  testing: 'Testing',
  ready: 'Ready',
};

const CUTOVER_STATUS_CLASS: Record<CutoverStatus, string> = {
  'needs-review': 'border-amber-200 bg-amber-50 text-amber-700',
  testing: 'border-blue-200 bg-blue-50 text-blue-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const CUTOVER_ITEMS = [
  {
    id: 'migrated-data',
    title: 'Migrated data reconciliation',
    detail: 'Spot-check customers, properties, jobs, invoices, notes, and statuses imported from the old system.',
  },
  {
    id: 'phone-sms',
    title: 'Phone and SMS',
    detail: 'Verify inbound routing, outbound browser calls, SMS, call logs, and customer timeline records.',
  },
  {
    id: 'email-inbox',
    title: 'Email and inbox',
    detail: 'Verify Gmail connection, outbound messages, inbound replies, and AI review queues.',
  },
  {
    id: 'estimates-invoices',
    title: 'Estimate to invoice lifecycle',
    detail: 'Confirm calculator, proposal approval, job conversion, invoice, deposit, and payment flow.',
  },
  {
    id: 'schedule-tech',
    title: 'Schedule and field tech',
    detail: 'Confirm scheduled work appears for the technician and completion updates the internal job.',
  },
  {
    id: 'client-portal',
    title: 'Client portal',
    detail: 'Confirm the customer sees only approved scopes, next steps, payments, memberships, and updates.',
  },
  {
    id: 'quickbooks',
    title: 'QuickBooks and accounting',
    detail: 'Verify customer matching, invoice sync, payment reconciliation, exceptions, and tax handling.',
  },
  {
    id: 'go-live-smoke',
    title: 'Go-live smoke test',
    detail: 'Run one complete customer lifecycle before turning off old operating habits.',
  },
] as const;

const CUTOVER_STORAGE_KEY = 'hp_housecall_cutover_status';

export default function OperationsPage() {
  const { setSection } = useEstimator();
  const [cutoverStatuses, setCutoverStatuses] = useState<Record<string, CutoverStatus>>(() => {
    try {
      const raw = localStorage.getItem(CUTOVER_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, CutoverStatus>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUTOVER_STORAGE_KEY, JSON.stringify(cutoverStatuses));
    } catch {}
  }, [cutoverStatuses]);

  const openSettings = (section?: string) => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { section: section ?? 'general' } }));
  };

  const cycleCutoverStatus = (id: string) => {
    setCutoverStatuses(prev => {
      const current = prev[id] ?? 'needs-review';
      const next: CutoverStatus = current === 'needs-review' ? 'testing' : current === 'testing' ? 'ready' : 'needs-review';
      return { ...prev, [id]: next };
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Business Operations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Company Operating Layer
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Revenue workflow moves customers through the business. Operations keeps the whole company healthy behind it.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {OPS.map(area => {
            const Icon = area.icon;
            return (
              <Card key={area.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" />
                    {area.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{area.owner}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" />
                      AI agent
                    </p>
                    <p className="mt-1 text-sm">{area.ai}</p>
                  </div>
                  <div className="space-y-2">
                    {area.actions.map(action => (
                      <div key={action} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {action}
                      </div>
                    ))}
                  </div>
                  {'target' in area ? (
                    <Button size="sm" variant="outline" onClick={() => setSection(area.target)}>
                      Open {area.title}
                    </Button>
                  ) : 'href' in area ? (
                    <Button size="sm" variant="outline" onClick={() => { window.location.href = area.href; }}>
                      Open {area.title}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openSettings(area.settings)}>
                      Open Settings
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  HouseCall Cutover Readiness
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  The API migration already happened. This is the operating checklist for proving the replacement works before relying on it with live customers.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">
                Internal only
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {CUTOVER_ITEMS.map(item => {
                const status = cutoverStatuses[item.id] ?? 'needs-review';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => cycleCutoverStatus(item.id)}
                    className="rounded-lg border border-border bg-white p-4 text-left transition hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                      <Badge variant="outline" className={CUTOVER_STATUS_CLASS[status]}>
                        {CUTOVER_STATUS_LABEL[status]}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart2 className="h-4 w-4 text-primary" />
                Scorecard
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Weekly EOS-style numbers should eventually live here: leads, close rate, gross margin, cash collected, reviews, callback time, and rework.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                SOP Library
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Each role desk should link to the exact checklist, script, standard, and approval rule needed for the stage in front of them.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-primary" />
                SaaS Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Handy Pioneers is tenant one. The same operating model should later support other service companies with their own roles, stages, branding, and portal.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
