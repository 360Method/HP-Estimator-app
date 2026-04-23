/**
 * Members — Global 360° Membership Roster
 * Read-only roster of all active memberships, filterable by tier, renewal date, and labor bank balance.
 * Memberships are managed from Customer → Property → Membership panel.
 *
 * NEW ENROLLMENTS QUEUE: Shows unscheduled baseline_scan work orders with 48h SLA badge.
 */

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, Users, Wallet, Crown, Shield, Star,
  Search, CalendarClock, AlertCircle, CheckCircle2,
  User, ExternalLink, MapPin, Clock, Calendar,
  Inbox,
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
import { toast } from 'sonner';

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

/** SLA badge: red if >48h since createdAt, amber if 24-48h, green if <24h */
function SlaBadge({ createdAt }: { createdAt: Date }) {
  const hoursElapsed = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (hoursElapsed > 48) {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 gap-1 shrink-0">
        <AlertCircle className="w-3 h-3" />
        {Math.round(hoursElapsed)}h — Overdue
      </Badge>
    );
  }
  if (hoursElapsed > 24) {
    return (
      <Badge className="text-[10px] px-1.5 gap-1 shrink-0 bg-amber-500 hover:bg-amber-500">
        <Clock className="w-3 h-3" />
        {Math.round(hoursElapsed)}h / 48h SLA
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] px-1.5 gap-1 shrink-0 bg-emerald-500 hover:bg-emerald-500">
      <Clock className="w-3 h-3" />
      {Math.round(hoursElapsed)}h / 48h SLA
    </Badge>
  );
}

export default function ThreeSixtyPage() {
  const { setActiveCustomer, setSection } = useEstimator();
  const [view, setView] = useState<'roster' | 'member-list' | 'checklists'>('roster');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('all');

  // New Enrollments queue — unscheduled baseline scans
  const [scheduleWorkOrderId, setScheduleWorkOrderId] = useState<number | null>(null);
  const [scheduleMembershipId, setScheduleMembershipId] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleAssigned, setScheduleAssigned] = useState<string[]>([]);
  const utils = trpc.useUtils();

  const { data: staffList } = trpc.workOrders.listStaff.useQuery();

  const scheduleWO = trpc.workOrders.schedule.useMutation({
    onSuccess: () => {
      utils.workOrders.listGlobal.invalidate();
      setScheduleWorkOrderId(null);
      setScheduleMembershipId(null);
      setScheduleDate('');
      setScheduleTime('09:00');
      setScheduleAssigned([]);
      toast.success('Baseline scan scheduled — linked job created in Jobs tab and Calendar.');
    },
    onError: (err) => toast.error(`Failed to schedule: ${err.message}`),
  });

  const { data: newEnrollments, isLoading: enrollmentsLoading } = trpc.workOrders.listGlobal.useQuery({
    type: 'baseline_scan',
    status: 'open',
  });

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.list.useQuery();

  const now = Date.now();

  const filtered = useMemo(() => {
    if (!memberships) return [];
    return memberships.filter(m => {
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (renewalFilter !== 'all') {
        const renewalMs = new Date(m.renewalDate).getTime();
        const diffDays = (renewalMs - now) / 86_400_000;
        if (renewalFilter === 'overdue' && diffDays > 0) return false;
        if (renewalFilter === '30d' && (diffDays < 0 || diffDays > 30)) return false;
        if (renewalFilter === '60d' && (diffDays < 0 || diffDays > 60)) return false;
        if (renewalFilter === '90d' && (diffDays < 0 || diffDays > 90)) return false;
      }
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

      {/* ── NEW ENROLLMENTS QUEUE ─────────────────────────────────────────── */}
      {(enrollmentsLoading || (newEnrollments && newEnrollments.length > 0)) && (
        <Card className={`mb-6 border-2 ${
          newEnrollments?.some(wo => (Date.now() - new Date(wo.createdAt).getTime()) / 3_600_000 > 48)
            ? 'border-red-300 bg-red-50/50'
            : 'border-amber-300 bg-amber-50/50'
        }`}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Inbox className="w-4 h-4 text-amber-600" />
                New Enrollments — Schedule Baseline Scan
                {newEnrollments && newEnrollments.length > 0 && (
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5">
                    {newEnrollments.length} pending
                  </Badge>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">48h SLA from enrollment</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {enrollmentsLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : newEnrollments && newEnrollments.length > 0 ? (
              <div className="space-y-2">
                {newEnrollments.map(wo => {
                  const tier = (wo.membershipTier ?? 'bronze') as MemberTier;
                  const colors = TIER_COLORS[tier] ?? TIER_COLORS.bronze;
                  const TierIcon = TIER_ICONS[tier] ?? Shield;
                  return (
                    <div
                      key={wo.id}
                      className="flex items-center gap-3 bg-white rounded-lg border px-3 py-2.5 shadow-sm"
                    >
                      <TierIcon className={`w-4 h-4 shrink-0 ${
                        tier === 'gold' ? 'text-yellow-500' :
                        tier === 'silver' ? 'text-slate-400' : 'text-amber-500'
                      }`} />
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${colors.badge}`}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {wo.membershipCustomerName ?? `Membership #${wo.membershipId}`}
                        </div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {wo.membershipPropertyAddress && (
                            <>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{wo.membershipPropertyAddress}</span>
                              <span className="mx-1">·</span>
                            </>
                          )}
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>Enrolled {new Date(wo.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SlaBadge createdAt={wo.createdAt} />
                        {wo.membershipCustomerId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setActiveCustomer(wo.membershipCustomerId!, 'direct');
                              setSection('customer');
                            }}
                            title="Open customer profile"
                          >
                            <User className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Profile</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setScheduleWorkOrderId(wo.id);
                            setScheduleMembershipId(wo.membershipId);
                          }}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Schedule
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

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
            <p className="text-sm font-medium text-muted-foreground">No memberships match these filters</p>
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
              <Card
                key={m.id}
                className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if ((m as any).hpCustomerId) {
                    setActiveCustomer((m as any).hpCustomerId, 'direct');
                    setSection('customer');
                    setTimeout(() => {
                      const el = document.querySelector('[data-tab="membership360"]') as HTMLElement | null;
                      el?.click();
                    }, 150);
                  }
                }}
              >
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
                        onClick={e => {
                          e.stopPropagation();
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

      {/* Schedule Visit modal — triggered from New Enrollments queue */}
      {scheduleWorkOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setScheduleWorkOrderId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Schedule Baseline Scan</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {newEnrollments?.find(w => w.id === scheduleWorkOrderId)?.membershipCustomerName ?? 'Member'}
              {newEnrollments?.find(w => w.id === scheduleWorkOrderId)?.membershipPropertyAddress
                ? ` — ${newEnrollments.find(w => w.id === scheduleWorkOrderId)?.membershipPropertyAddress}`
                : ''}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={scheduleDate}
                  min={new Date().toISOString().slice(0,10)}
                  onChange={e => setScheduleDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Time</label>
                <input
                  type="time"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Assign Tech (optional)</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border rounded-lg p-2">
                  {(staffList ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No staff found</p>
                  ) : (staffList ?? []).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleAssigned.includes(s.name ?? s.openId)}
                        onChange={e => {
                          const val = s.name ?? s.openId;
                          setScheduleAssigned(prev => e.target.checked ? [...prev, val] : prev.filter(x => x !== val));
                        }}
                      />
                      {s.name ?? s.openId}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setScheduleWorkOrderId(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!scheduleDate || scheduleWO.isPending}
                onClick={() => {
                  if (!scheduleDate) return;
                  const dt = new Date(`${scheduleDate}T${scheduleTime}`);
                  scheduleWO.mutate({ id: scheduleWorkOrderId!, scheduledDate: dt.getTime(), assignedTo: scheduleAssigned.length > 0 ? scheduleAssigned : undefined });
                }}
              >
                {scheduleWO.isPending ? 'Scheduling…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
