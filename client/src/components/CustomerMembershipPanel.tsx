/**
 * CustomerMembershipPanel
 * Shown on the "360° Membership" tab inside a customer profile.
 * Displays active memberships for all properties, their work orders, and any linked jobs.
 */

import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw, Shield, Star, Crown, Wallet, CalendarCheck,
  ClipboardList, CheckCircle2, Clock, SkipForward, Briefcase,
  ExternalLink, MapPin, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { formatDollars, TIER_DEFINITIONS, type MemberTier } from '../../../shared/threeSixtyTiers';
import { useEstimator } from '@/contexts/EstimatorContext';
import { useLocation } from 'wouter';

const TIER_ICONS: Record<MemberTier, React.ElementType> = {
  bronze: Shield,
  silver: Star,
  gold: Crown,
};

const TIER_BADGE: Record<MemberTier, string> = {
  bronze: 'bg-amber-100 text-amber-800 border-amber-300',
  silver: 'bg-slate-100 text-slate-700 border-slate-300',
  gold: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const WO_STATUS_ICON: Record<string, React.ElementType> = {
  completed: CheckCircle2,
  open: Clock,
  scheduled: CalendarCheck,
  skipped: SkipForward,
};

const WO_STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600',
  open: 'text-amber-600',
  scheduled: 'text-blue-600',
  skipped: 'text-gray-400',
};

const WO_TYPE_LABEL: Record<string, string> = {
  baseline_scan: '🏠 Baseline Scan',
  spring: '🌸 Spring Visit',
  summer: '☀️ Summer Visit',
  fall: '🍂 Fall Visit',
  winter: '❄️ Winter Visit',
};

interface Props {
  customerId: string;
}

export default function CustomerMembershipPanel({ customerId }: Props) {
  const { setActiveOpportunity, setSection } = useEstimator();
  const [, navigate] = useLocation();

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.getByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40" />
        Loading memberships…
      </div>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-base font-semibold text-muted-foreground">No 360° Memberships</p>
        <p className="text-sm text-muted-foreground mt-1">
          Enroll a property from the <strong>Properties</strong> tab to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {memberships.map(m => (
        <MembershipCard
          key={m.id}
          membership={m}
          onOpenWorkOrder={(woId) => navigate(`/360/work-orders/${woId}`)}
          onOpenJob={(jobId) => {
            setActiveOpportunity(jobId);
            setSection('opp-details');
          }}
        />
      ))}
    </div>
  );
}

// ─── Per-membership card ──────────────────────────────────────────────────────
function MembershipCard({
  membership,
  onOpenWorkOrder,
  onOpenJob,
}: {
  membership: any;
  onOpenWorkOrder: (id: number) => void;
  onOpenJob: (id: string) => void;
}) {
  const TierIcon = TIER_ICONS[membership.tier as MemberTier] ?? Shield;
  const tierDef = TIER_DEFINITIONS[membership.tier as MemberTier];
  const propertyLine = [membership.propertyStreet, membership.propertyCity]
    .filter(Boolean).join(', ');

  const { data: workOrders, isLoading: woLoading } = trpc.workOrders.list.useQuery(
    { membershipId: membership.id },
    { enabled: !!membership.id }
  );

  const { data: linkedJobs, isLoading: jobsLoading } = trpc.threeSixty.memberships.listJobsByMembership.useQuery(
    { membershipId: membership.id },
    { enabled: !!membership.id }
  );

  const openWOs = (workOrders ?? []).filter(wo => wo.status === 'open' || wo.status === 'scheduled');
  const completedWOs = (workOrders ?? []).filter(wo => wo.status === 'completed');

  return (
    <Card className="border shadow-sm">
      {/* Membership header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              membership.tier === 'gold' ? 'bg-yellow-100' :
              membership.tier === 'silver' ? 'bg-slate-100' : 'bg-amber-100'
            }`}>
              <TierIcon className={`w-4 h-4 ${
                membership.tier === 'gold' ? 'text-yellow-600' :
                membership.tier === 'silver' ? 'text-slate-500' : 'text-amber-600'
              }`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">
                  {tierDef?.label ?? membership.tier} Membership
                </CardTitle>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIER_BADGE[membership.tier as MemberTier]}`}>
                  #{membership.id}
                </span>
                <Badge variant={membership.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                  {membership.status}
                </Badge>
              </div>
              {propertyLine && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{propertyLine}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Wallet className="w-3 h-3 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Labor Bank</span>
            </div>
            <div className="text-sm font-bold text-emerald-700">{formatDollars(membership.laborBankBalance ?? 0)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <CalendarCheck className="w-3 h-3 text-blue-600" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Completed</span>
            </div>
            <div className="text-sm font-bold text-blue-700">{completedWOs.length}</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 text-amber-600" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Open</span>
            </div>
            <div className="text-sm font-bold text-amber-700">{openWOs.length}</div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Work Orders */}
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Orders</span>
          <span className="text-xs text-muted-foreground">({(workOrders ?? []).length})</span>
        </div>

        {woLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>
        ) : !workOrders || workOrders.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">No work orders yet.</div>
        ) : (
          <div className="space-y-1.5">
            {workOrders.map(wo => {
              const StatusIcon = WO_STATUS_ICON[wo.status] ?? Clock;
              const statusColor = WO_STATUS_COLOR[wo.status] ?? 'text-muted-foreground';
              const typeLabel = WO_TYPE_LABEL[wo.type] ?? wo.type;
              return (
                <button
                  key={wo.id}
                  onClick={() => onOpenWorkOrder(wo.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-white hover:bg-muted/40 transition-colors text-left group"
                >
                  <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{typeLabel}</span>
                    {wo.scheduledDate && (
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {new Date(wo.scheduledDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant={wo.status === 'completed' ? 'default' : 'secondary'}
                    className="text-[10px] px-1.5 shrink-0"
                  >
                    {wo.status}
                  </Badge>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Linked Jobs */}
      {((linkedJobs && linkedJobs.length > 0) || jobsLoading) && (
        <>
          <Separator />
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked Jobs & Estimates</span>
              <span className="text-xs text-muted-foreground">({(linkedJobs ?? []).length})</span>
            </div>

            {jobsLoading ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>
            ) : (
              <div className="space-y-1.5">
                {(linkedJobs ?? []).map(job => (
                  <button
                    key={job.id}
                    onClick={() => onOpenJob(job.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-white hover:bg-muted/40 transition-colors text-left group"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">{job.title || `Job #${job.id}`}</span>
                      {job.scheduledDate && (
                        <span className="text-[10px] text-muted-foreground">
                          Scheduled {new Date(job.scheduledDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {job.value > 0 && (
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">
                        ${(job.value / 100).toLocaleString()}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                      {job.stage}
                    </Badge>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}
