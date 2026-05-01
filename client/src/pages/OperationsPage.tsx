import {
  BarChart2,
  BookOpen,
  Bot,
  Calculator,
  Database,
  GitBranch,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
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
    actions: ['Visionary console', 'Department projects', 'AI agent queue'],
    href: '/admin/visionary',
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

export default function OperationsPage() {
  const { setSection } = useEstimator();

  const openSettings = (section?: string) => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { section: section ?? 'general' } }));
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
