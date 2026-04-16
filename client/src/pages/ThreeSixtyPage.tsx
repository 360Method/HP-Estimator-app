/**
 * Members — Global 360° Membership Roster
 * Read-only roster of all active memberships, filterable by tier, renewal date, and labor bank balance.
 * Memberships are managed from Customer → Property → Membership panel.
 */

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, Users, Wallet, Crown, Shield, Star,
  Search, CalendarClock, AlertCircle, CheckCircle2,
  User, ExternalLink, MapPin,
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  TIER_DEFINITIONS,
  ALL_TIERS,
  type MemberTier,
  formatDollars,
} from '../../../shared/threeSixtyTiers';
import ThreeSixtyMemberList from './ThreeSixtyMemberList';
import ThreeSixtyChecklists from './ThreeSixtyChecklists';

const TIER_COLORS: Record<MemberTier, { badge: string; dot: string }> = {
  bronze: { badge: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
  silver: { badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-400' },
  gold:   { badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
};

const TIER_ICONS: Record<MemberTier, React.ElementType> = {
  bronze: Shield,
  silver: Star,
  gold: Crown,
};

type RenewalFilter = 'all' | 'overdue' | '30d' | '60d' | '90d';
type TierFilter = 'all' | MemberTier;
type StatusFilter = 'all' | 'active' | 'paused' | 'cancelled';

export default function ThreeSixtyPage() {
  const { setActiveCustomer, setSection } = useEstimator();
  const [view, setView] = useState<'roster' | 'member-list' | 'checklists'>('roster');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('all');

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.list.useQuery();

  const now = Date.now();

  const filtered = useMemo(() => {
    if (!memberships) return [];
    return memberships.filter(m => {
      // Tier
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      // Status
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      // Renewal window
      if (renewalFilter !== 'all') {
        const renewalMs = new Date(m.renewalDate).getTime();
        const diffDays = (renewalMs - now) / 86_400_000;
        if (renewalFilter === 'overdue' && diffDays > 0) return false;
        if (renewalFilter === '30d' && (diffDays < 0 || diffDays > 30)) return false;
        if (renewalFilter === '60d' && (diffDays < 0 || diffDays > 60)) return false;
        if (renewalFilter === '90d' && (diffDays < 0 || diffDays > 90)) return false;
      }
      // Search (member id for now — will show customer name once linked)
      if (search.trim()) {
        const q = search.toLowerCase();
        const idStr = String(m.id);
        const email = (m as any).email ?? '';
        const name = (m as any).customerName ?? '';
        if (!idStr.includes(q) && !email.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [memberships, tierFilter, statusFilter, renewalFilter, search, now]);

  // KPI aggregates
  const activeMemberships = memberships?.filter(m => m.status === 'active') ?? [];
  const totalLaborBank = activeMemberships.reduce((sum, m) => sum + (m.laborBankBalance ?? 0), 0);
  const overdueCount = activeMemberships.filter(m => new Date(m.renewalDate).getTime() < now).length;
  const renewingSoon = activeMemberships.filter(m => {
    const diff = (new Date(m.renewalDate).getTime() - now) / 86_400_000;
    return diff >= 0 && diff <= 30;
  }).length;

  if (view === 'member-list') {
    return <ThreeSixtyMemberList onBack={() => setView('roster')} />;
  }
  if (view === 'checklists') {
    return <ThreeSixtyChecklists onBack={() => setView('roster')} />;
  }

  return (
    <div className="container py-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
            <RefreshCw className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Members</h1>
            <p className="text-sm text-muted-foreground truncate">360° proactive membership roster</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setView('checklists')} className="gap-1.5 text-xs">
            Checklists
          </Button>
          <Button variant="outline" size="sm" onClick={() => setView('member-list')} className="gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" /> Full List
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700">{isLoading ? '—' : activeMemberships.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Labor Bank</span>
            </div>
            <div className="text-2xl font-bold text-purple-700">{isLoading ? '—' : formatDollars(totalLaborBank)}</div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${overdueCount > 0 ? 'bg-gradient-to-br from-red-50 to-white' : 'bg-gradient-to-br from-slate-50 to-white'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`w-4 h-4 ${overdueCount > 0 ? 'text-red-500' : 'text-slate-400'}`} />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Overdue</span>
            </div>
            <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-slate-500'}`}>{isLoading ? '—' : overdueCount}</div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${renewingSoon > 0 ? 'bg-gradient-to-br from-amber-50 to-white' : 'bg-gradient-to-br from-slate-50 to-white'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock className={`w-4 h-4 ${renewingSoon > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Renewing 30d</span>
            </div>
            <div className={`text-2xl font-bold ${renewingSoon > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{isLoading ? '—' : renewingSoon}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tier summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {ALL_TIERS.map(tier => {
          const def = TIER_DEFINITIONS[tier];
          const colors = TIER_COLORS[tier];
          const TierIcon = TIER_ICONS[tier];
          const count = activeMemberships.filter(m => m.tier === tier).length;
          return (
            <button
              key={tier}
              onClick={() => setTierFilter(tierFilter === tier ? 'all' : tier)}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                tierFilter === tier ? 'ring-2 ring-offset-1 ring-primary shadow-sm' : 'hover:bg-muted/40'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
              <TierIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{def.label}</div>
                <div className="text-xs text-muted-foreground">{count} active</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 text-xs w-[110px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={renewalFilter} onValueChange={v => setRenewalFilter(v as RenewalFilter)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder="Renewal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All renewals</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="30d">Renewing in 30d</SelectItem>
            <SelectItem value="60d">Renewing in 60d</SelectItem>
            <SelectItem value="90d">Renewing in 90d</SelectItem>
          </SelectContent>
        </Select>
        {(tierFilter !== 'all' || statusFilter !== 'active' || renewalFilter !== 'all' || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2"
            onClick={() => { setTierFilter('all'); setStatusFilter('active'); setRenewalFilter('all'); setSearch(''); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Roster table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">
              {memberships?.length === 0 ? 'No memberships yet' : 'No memberships match these filters'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {memberships?.length === 0
                ? 'Enroll a homeowner from their Customer → Property tab.'
                : 'Try adjusting the tier, status, or renewal filters above.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(m => {
            const colors = TIER_COLORS[m.tier as MemberTier];
            const TierIcon = TIER_ICONS[m.tier as MemberTier];
            const renewalMs = new Date(m.renewalDate).getTime();
            const diffDays = Math.round((renewalMs - now) / 86_400_000);
            const isOverdue = diffDays < 0;
            const isRenewingSoon = diffDays >= 0 && diffDays <= 30;
            return (
              <Card key={m.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <TierIcon className={`w-4 h-4 shrink-0 ${
                    m.tier === 'gold' ? 'text-yellow-500' :
                    m.tier === 'silver' ? 'text-slate-400' : 'text-amber-500'
                  }`} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${colors.badge}`}>
                    {m.tier.charAt(0).toUpperCase() + m.tier.slice(1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {(m as any).customerName ?? `Member #${m.id}`}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {((m as any).propertyStreet || (m as any).propertyCity) && (
                        <><MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{[(m as any).propertyStreet, (m as any).propertyCity].filter(Boolean).join(', ')}</span>
                        <span className="mx-1">·</span></>
                      )}
                      <span>Labor bank: {formatDollars(m.laborBankBalance ?? 0)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(m as any).hpCustomerId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                        onClick={() => {
                          setActiveCustomer((m as any).hpCustomerId, 'direct');
                          setSection('customer');
                        }}
                        title="Open customer profile"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Profile</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                    {isOverdue ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5">Overdue</Badge>
                    ) : isRenewingSoon ? (
                      <Badge className="text-[10px] px-1.5 bg-amber-500 hover:bg-amber-500">Renews in {diffDays}d</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Renews {new Date(m.renewalDate).toLocaleDateString()}
                      </span>
                    )}
                    <Badge
                      variant={m.status === 'active' ? 'default' : 'secondary'}
                      className="text-[10px] px-1.5"
                    >
                      {m.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-xs text-muted-foreground text-right pt-1">
            Showing {filtered.length} of {memberships?.length ?? 0} memberships
          </p>
        </div>
      )}
    </div>
  );
}
