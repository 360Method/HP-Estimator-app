/**
 * 360 Method — Main Dashboard Page
 * Shows membership list, tier cards with billing cadence toggle, and quick-actions.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Plus, Users, CalendarCheck, Wallet, Star, CheckCircle2, Shield, Crown } from 'lucide-react';
import {
  TIER_DEFINITIONS,
  ALL_TIERS,
  type MemberTier,
  type BillingCadence,
  formatDollars,
  getSavingsVsMonthly,
} from '../../../shared/threeSixtyTiers';
import ThreeSixtyMemberList from './ThreeSixtyMemberList';
import ThreeSixtyNewMembership from './ThreeSixtyNewMembership';

const TIER_COLORS: Record<MemberTier, { badge: string; ring: string; icon: string; bg: string }> = {
  bronze: {
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    ring: 'ring-amber-400',
    icon: 'text-amber-600',
    bg: 'from-amber-50 to-white',
  },
  silver: {
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    ring: 'ring-slate-400',
    icon: 'text-slate-500',
    bg: 'from-slate-50 to-white',
  },
  gold: {
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    ring: 'ring-yellow-500',
    icon: 'text-yellow-600',
    bg: 'from-yellow-50 to-white',
  },
};

const TIER_ICONS: Record<MemberTier, React.ElementType> = {
  bronze: Shield,
  silver: Star,
  gold: Crown,
};

const CADENCE_LABELS: Record<BillingCadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const CADENCE_PERIOD: Record<BillingCadence, string> = {
  monthly: '/mo',
  quarterly: '/quarter',
  annual: '/year',
};

export default function ThreeSixtyPage() {
  const [cadence, setCadence] = useState<BillingCadence>('monthly');
  const [view, setView] = useState<'overview' | 'members' | 'new'>('overview');

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.list.useQuery();

  const activeMemberships = memberships?.filter(m => m.status === 'active') ?? [];
  const totalLaborBank = memberships?.reduce((sum, m) => sum + (m.laborBankBalance ?? 0), 0) ?? 0;

  if (view === 'members') {
    return <ThreeSixtyMemberList onBack={() => setView('overview')} />;
  }

  if (view === 'new') {
    return <ThreeSixtyNewMembership onBack={() => setView('overview')} />;
  }

  return (
    <div className="container py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <RefreshCw className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">360 Method</h1>
            <p className="text-sm text-muted-foreground">Proactive home maintenance memberships — PNW</p>
          </div>
        </div>
        <Button onClick={() => setView('new')} className="gap-2">
          <Plus className="w-4 h-4" />
          New Membership
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Members</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700">{activeMemberships.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Members</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{memberships?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Labor Bank (Total)</span>
            </div>
            <div className="text-2xl font-bold text-purple-700">{formatDollars(totalLaborBank)}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Gold Members</span>
            </div>
            <div className="text-2xl font-bold text-amber-700">
              {memberships?.filter(m => m.tier === 'gold' && m.status === 'active').length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Cards */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Membership Tiers</h2>
            <p className="text-sm text-muted-foreground">Step-ladder discounts protect margin on large jobs</p>
          </div>
          {/* Billing cadence toggle */}
          <Tabs value={cadence} onValueChange={v => setCadence(v as BillingCadence)}>
            <TabsList className="h-8">
              {(Object.keys(CADENCE_LABELS) as BillingCadence[]).map(c => (
                <TabsTrigger key={c} value={c} className="text-xs px-3">
                  {CADENCE_LABELS[c]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_TIERS.map(tier => {
            const def = TIER_DEFINITIONS[tier];
            const colors = TIER_COLORS[tier];
            const TierIcon = TIER_ICONS[tier];
            const price = def.pricing[cadence];
            const savings = getSavingsVsMonthly(tier, cadence);
            const activeTierCount = activeMemberships.filter(m => m.tier === tier).length;

            return (
              <Card
                key={tier}
                className={`relative border shadow-sm ring-1 ${colors.ring} bg-gradient-to-b ${colors.bg} overflow-hidden`}
              >
                {tier === 'gold' && (
                  <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                    Best Value
                  </div>
                )}
                <CardHeader className="pb-2 pt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <TierIcon className={`w-5 h-5 ${colors.icon}`} />
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                      {def.label}
                    </span>
                    {activeTierCount > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">{activeTierCount} active</span>
                    )}
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    {formatDollars(price)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      {CADENCE_PERIOD[cadence]}
                    </span>
                  </CardTitle>
                  {/* Savings callout */}
                  {savings > 0 ? (
                    <div className="text-xs text-emerald-600 font-medium">
                      Save {formatDollars(savings)}/yr vs. monthly
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Billed monthly</div>
                  )}
                  {/* Monthly equivalent for quarterly/annual */}
                  {cadence !== 'monthly' && (
                    <div className="text-xs text-muted-foreground">
                      ≈ {formatDollars(Math.round(
                        cadence === 'quarterly' ? price / 3 : price / 12
                      ))}/mo
                    </div>
                  )}
                  <CardDescription className="text-xs mt-1">{def.tagline}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Separator className="mb-3" />
                  <ul className="space-y-1.5">
                    {def.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {def.laborBankCreditCents > 0 && (
                    <div className="mt-3 p-2 rounded-md bg-white/60 border border-dashed border-muted-foreground/30 text-xs text-center text-muted-foreground">
                      Includes {formatDollars(def.laborBankCreditCents)} labor bank credit on enrollment
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Members quick-list */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Recent Members</h2>
        <Button variant="ghost" size="sm" onClick={() => setView('members')} className="text-xs gap-1">
          View all <span className="text-muted-foreground">→</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading memberships…</div>
      ) : memberships && memberships.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No memberships yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "New Membership" to enroll your first homeowner.</p>
            <Button className="mt-4 gap-2" onClick={() => setView('new')}>
              <Plus className="w-4 h-4" /> Enroll First Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(memberships ?? []).slice(0, 8).map(m => {
            const colors = TIER_COLORS[m.tier as MemberTier];
            return (
              <Card key={m.id} className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('members')}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                    {m.tier.charAt(0).toUpperCase() + m.tier.slice(1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">Member #{m.id}</div>
                    <div className="text-xs text-muted-foreground">
                      Renews {new Date(m.renewalDate).toLocaleDateString()} · Labor bank: {formatDollars(m.laborBankBalance ?? 0)}
                    </div>
                  </div>
                  <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {m.status}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
