/**
 * 360 Method — Member Detail Page
 * Shows membership info, seasonal visits, labor bank ledger, and annual scan history.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useEstimator } from '@/contexts/EstimatorContext';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CalendarCheck, Wallet, ClipboardList, Plus, CheckCircle2, Clock, SkipForward, Wrench, CalendarClock, AlertTriangle, User, ExternalLink, Briefcase } from 'lucide-react';
import { formatDollars, TIER_DEFINITIONS, type MemberTier } from '../../../shared/threeSixtyTiers';
import { toast } from 'sonner';
import ThreeSixtyVisitDetail from './ThreeSixtyVisitDetail';
import ThreeSixtyBaselineWizard from './ThreeSixtyBaselineWizard';
import ThreeSixtyScanDetail from './ThreeSixtyScanDetail';


const SEASON_LABELS: Record<string, string> = {
  spring: '🌸 Spring',
  summer: '☀️ Summer',
  fall: '🍂 Fall',
  winter: '❄️ Winter',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-gray-100 text-gray-600',
};

interface Props {
  membershipId: number;
  onBack: () => void;
}

export default function ThreeSixtyMemberDetail({ membershipId, onBack }: Props) {
  const { setActiveCustomer, setSection, setActiveOpportunity } = useEstimator();
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [showBaselineWizard, setShowBaselineWizard] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: membership, isLoading } = trpc.threeSixty.memberships.get.useQuery({ id: membershipId });
  const { data: visits } = trpc.threeSixty.visits.list.useQuery({ membershipId });
  const { data: ledger } = trpc.threeSixty.laborBank.getLedger.useQuery({ membershipId });
  const { data: scans } = trpc.threeSixty.scans.list.useQuery({ membershipId });
  const { data: propertySystems } = trpc.threeSixty.propertySystems.list.useQuery({ membershipId });
  const { data: workOrders } = trpc.workOrders.list.useQuery({ membershipId });
  const { data: linkedJobs } = trpc.threeSixty.memberships.listJobsByMembership.useQuery({ membershipId });

  const createScan = trpc.threeSixty.scans.create.useMutation({
    onSuccess: (data) => {
      utils.threeSixty.scans.list.invalidate({ membershipId });
      setSelectedScanId(data.id);
    },
    onError: (err) => toast.error(`Failed to create scan: ${err.message}`),
  });

  const handleNewScan = () => {
    if (!membership) return;
    createScan.mutate({
      membershipId,
      customerId: membership.customerId,
      scanDate: Date.now(),
    });
  };

  const scheduleVisit = trpc.threeSixty.visits.schedule.useMutation({
    onSuccess: () => {
      utils.threeSixty.visits.list.invalidate({ membershipId });
      toast('Visit scheduled');
    },
  });

  const skipVisit = trpc.threeSixty.visits.skip.useMutation({
    onSuccess: () => {
      utils.threeSixty.visits.list.invalidate({ membershipId });
      toast('Visit marked as skipped');
    },
  });

  if (selectedScanId !== null) {
    return (
      <ThreeSixtyScanDetail
        scanId={selectedScanId}
        membershipId={membershipId}
        onBack={() => setSelectedScanId(null)}
      />
    );
  }

  if (showBaselineWizard) {
    return (
      <ThreeSixtyBaselineWizard
        membershipId={membershipId}
        customerId={membership?.customerId ?? ""}
        onBack={() => setShowBaselineWizard(false)}
        onComplete={() => setShowBaselineWizard(false)}
      />
    );
  }

  if (selectedVisitId !== null) {
    return (
      <ThreeSixtyVisitDetail
        visitId={selectedVisitId}
        membershipId={membershipId}
        onBack={() => setSelectedVisitId(null)}
      />
    );
  }

  if (isLoading || !membership) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const tierDef = TIER_DEFINITIONS[membership.tier as MemberTier];
  const currentYear = new Date().getFullYear();
  const seasons: Array<'spring' | 'summer' | 'fall' | 'winter'> = ['spring', 'summer', 'fall', 'winter'];
  const scheduledSeasons = new Set((visits ?? []).filter(v => v.visitYear === currentYear).map(v => v.season));

  return (
    <div className="container py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Membership #{membership.id}</h1>
            <Badge className={
              membership.tier === 'gold' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
              membership.tier === 'silver' ? 'bg-slate-100 text-slate-700 border-slate-300' :
              'bg-amber-100 text-amber-800 border-amber-300'
            }>
              {tierDef.label}
            </Badge>
            <Badge variant={membership.status === 'active' ? 'default' : 'secondary'}>
              {membership.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tierDef.tagline} · Renews {new Date(membership.renewalDate).toLocaleDateString()}
          </p>
        </div>
        {membership.hpCustomerId && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => {
              setActiveCustomer(membership.hpCustomerId!, 'direct');
              setSection('customer');
            }}
          >
            <User className="w-3.5 h-3.5" />
            Customer Profile
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> Labor Bank
            </div>
            <div className="text-xl font-bold text-emerald-700">{formatDollars(membership.laborBankBalance ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <CalendarCheck className="w-3.5 h-3.5" /> Visits This Year
            </div>
            <div className="text-xl font-bold text-blue-700">
              {(visits ?? []).filter(v => v.visitYear === currentYear && v.status === 'completed').length}
              <span className="text-sm font-normal text-muted-foreground"> / {tierDef.seasonalVisits}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" /> Annual Scan
            </div>
            <div className="text-xl font-bold text-purple-700">
              {membership.annualScanCompleted ? (
                <span className="text-emerald-600 text-sm font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Done
                </span>
              ) : (
                <span className="text-amber-600 text-sm font-semibold">Pending</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="visits">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="work-orders" className="text-xs">
            <Wrench className="w-3 h-3 mr-1" />Work Orders
            {(workOrders ?? []).filter(wo => wo.status === 'open' || wo.status === 'scheduled').length > 0 && (
              <span className="ml-1 bg-amber-100 text-amber-700 rounded-full px-1.5 text-[10px]">
                {(workOrders ?? []).filter(wo => wo.status === 'open' || wo.status === 'scheduled').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="visits" className="text-xs">Visits</TabsTrigger>
          <TabsTrigger value="property-systems" className="text-xs">Property Systems</TabsTrigger>
          <TabsTrigger value="labor-bank" className="text-xs">Labor Bank</TabsTrigger>
          <TabsTrigger value="scans" className="text-xs">Scans</TabsTrigger>
          <TabsTrigger value="discounts" className="text-xs">Discounts</TabsTrigger>
        </TabsList>

        {/* ── WORK ORDERS ─────────────────────────────────────────── */}
        <TabsContent value="work-orders">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Work Orders</h3>
            <p className="text-xs text-muted-foreground">Auto-created on enrollment & after each visit</p>
          </div>
          {(workOrders ?? []).length === 0 ? (
            <div className="text-center py-10">
              <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">No work orders yet.</p>
              <p className="text-xs text-muted-foreground mt-1">A baseline scan work order is created automatically on enrollment.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(workOrders ?? []).map(wo => {
                const WO_TYPE_LABELS: Record<string, string> = {
                  baseline_scan: '🏠 Baseline Scan',
                  spring: '🌸 Spring Visit',
                  summer: '☀️ Summer Visit',
                  fall: '🍂 Fall Visit',
                  winter: '❄️ Winter Visit',
                };
                const WO_STATUS_COLORS: Record<string, string> = {
                  open: 'bg-gray-100 text-gray-700',
                  scheduled: 'bg-blue-100 text-blue-800',
                  in_progress: 'bg-amber-100 text-amber-800',
                  completed: 'bg-emerald-100 text-emerald-800',
                  skipped: 'bg-gray-100 text-gray-500',
                };
                const isActionable = wo.status === 'open' || wo.status === 'scheduled' || wo.status === 'in_progress';
                return (
                  <Card
                    key={wo.id}
                    className={`border shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
                      isActionable ? 'border-amber-200 bg-amber-50/30' : ''
                    }`}
                    onClick={() => navigate(`/360/work-orders/${wo.id}`)}
                  >
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted">
                        <Wrench className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{WO_TYPE_LABELS[wo.type] ?? wo.type}</span>
                          <span className="text-xs text-muted-foreground">{wo.visitYear}</span>
                        </div>
                        {wo.scheduledDate && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CalendarClock className="w-3 h-3" />
                            {new Date(wo.scheduledDate).toLocaleDateString()}
                          </div>
                        )}
                        {wo.healthScore != null && (
                          <div className="text-xs font-semibold mt-0.5" style={{
                            color: wo.healthScore >= 75 ? '#059669' : wo.healthScore >= 50 ? '#d97706' : '#dc2626'
                          }}>
                            Health Score: {wo.healthScore}/100
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={`text-[10px] ${WO_STATUS_COLORS[wo.status] ?? ''}`}>{wo.status}</Badge>
                        {isActionable && (
                          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Action needed
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {/* Linked Jobs section */}
          {linkedJobs && linkedJobs.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Linked Jobs & Estimates</h3>
                <span className="text-xs text-muted-foreground">({linkedJobs.length})</span>
              </div>
              <div className="space-y-2">
                {linkedJobs.map(job => (
                  <Card
                    key={job.id}
                    className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setActiveOpportunity(job.id);
                      setSection('opp-details');
                    }}
                  >
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-100">
                        <Briefcase className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{job.title || `Job #${job.id}`}</div>
                        {job.scheduledDate && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Scheduled {new Date(job.scheduledDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-[10px]">{job.stage}</Badge>
                        {job.value > 0 && (
                          <span className="text-xs font-semibold text-muted-foreground">
                            ${(job.value / 100).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── VISITS ──────────────────────────────────────────────── */}
        <TabsContent value="visits">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{currentYear} Seasonal Visits</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {seasons.map(season => {
              const visit = (visits ?? []).find(v => v.season === season && v.visitYear === currentYear);
              const isIncluded = tierDef.seasonalVisits === 4 || ['spring', 'fall'].includes(season);
              return (
                <Card
                  key={season}
                  className={`border cursor-pointer hover:shadow-md transition-shadow ${!isIncluded ? 'opacity-40' : ''}`}
                  onClick={() => visit ? setSelectedVisitId(visit.id) : undefined}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-lg mb-1">{SEASON_LABELS[season].split(' ')[0]}</div>
                    <div className="text-xs font-medium mb-2">{SEASON_LABELS[season].split(' ')[1]}</div>
                    {!isIncluded ? (
                      <Badge variant="secondary" className="text-[10px]">Not included</Badge>
                    ) : visit ? (
                      <Badge className={`text-[10px] ${STATUS_COLORS[visit.status]}`}>
                        {visit.status}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={e => {
                          e.stopPropagation();
                          scheduleVisit.mutate({
                            membershipId,
                            customerId: membership.customerId,
                            season,
                            visitYear: currentYear,
                          });
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Schedule
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Past visits */}
          {(visits ?? []).filter(v => v.visitYear < currentYear).length > 0 && (
            <>
              <h3 className="text-sm font-semibold mb-3">Past Visits</h3>
              <div className="space-y-2">
                {(visits ?? [])
                  .filter(v => v.visitYear < currentYear)
                  .map(v => (
                    <Card
                      key={v.id}
                      className="border cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedVisitId(v.id)}
                    >
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <span className="text-base">{SEASON_LABELS[v.season]?.split(' ')[0]}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{SEASON_LABELS[v.season]} {v.visitYear}</div>
                          {v.completedDate && (
                            <div className="text-xs text-muted-foreground">
                              Completed {new Date(v.completedDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <Badge className={`text-xs ${STATUS_COLORS[v.status]}`}>{v.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── LABOR BANK ──────────────────────────────────────────── */}
        <TabsContent value="labor-bank">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Labor Bank Ledger</h3>
            <div className="text-sm font-bold text-emerald-700">
              Balance: {formatDollars(membership.laborBankBalance ?? 0)}
            </div>
          </div>
          {(ledger ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</div>
          ) : (
            <div className="space-y-2">
              {(ledger ?? []).map(tx => (
                <Card key={tx.id} className="border shadow-sm">
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      tx.type === 'credit' ? 'bg-emerald-100' :
                      tx.type === 'debit' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {tx.type === 'credit' ? <Plus className="w-4 h-4 text-emerald-600" /> :
                       tx.type === 'debit' ? <Clock className="w-4 h-4 text-red-500" /> :
                       <SkipForward className="w-4 h-4 text-gray-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tx.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={`text-sm font-bold shrink-0 ${
                      tx.type === 'credit' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {tx.type === 'credit' ? '+' : '-'}{formatDollars(tx.amountCents)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── PROPERTY SYSTEMS ────────────────────────────────────── */}
        <TabsContent value="property-systems">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Property System Baselines</h3>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowBaselineWizard(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              {(propertySystems ?? []).length > 0 ? 'Update' : 'Document'}
            </Button>
          </div>
          {(propertySystems ?? []).length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No property systems documented yet.</p>
              <Button size="sm" onClick={() => setShowBaselineWizard(true)}>Start Baseline Wizard</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(propertySystems ?? []).map(sys => {
                const condColors: Record<string, string> = {
                  good: 'bg-emerald-50 border-emerald-200',
                  fair: 'bg-yellow-50 border-yellow-200',
                  poor: 'bg-orange-50 border-orange-200',
                  critical: 'bg-red-50 border-red-200',
                };
                const condBadge: Record<string, string> = {
                  good: 'bg-emerald-100 text-emerald-800',
                  fair: 'bg-yellow-100 text-yellow-800',
                  poor: 'bg-orange-100 text-orange-800',
                  critical: 'bg-red-100 text-red-800',
                };
                const sysLabels: Record<string, string> = {
                  hvac: 'HVAC', roof: 'Roof', plumbing: 'Plumbing', electrical: 'Electrical',
                  foundation: 'Foundation', exterior_siding: 'Exterior & Siding',
                  interior: 'Interior', appliances: 'Appliances',
                };
                const photos: string[] = sys.photoUrls ? JSON.parse(sys.photoUrls) : [];
                return (
                  <Card key={sys.id} className={`border ${condColors[sys.condition] ?? ''}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{sysLabels[sys.systemType] ?? sys.systemType}</span>
                        <Badge className={`text-[10px] capitalize ${condBadge[sys.condition]}`}>{sys.condition}</Badge>
                      </div>
                      {sys.brandModel && <p className="text-xs text-muted-foreground">{sys.brandModel}</p>}
                      {sys.installYear && <p className="text-xs text-muted-foreground">Installed {sys.installYear}</p>}
                      {sys.conditionNotes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sys.conditionNotes}</p>
                      )}
                      {photos.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {photos.slice(0, 3).map((url) => (
                            <img key={url} src={url} alt="" className="w-10 h-10 rounded object-cover border" />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── SCANS ───────────────────────────────────────────────── */}
        <TabsContent value="scans">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Annual 360 Home Scans</h3>
            <Button
              size="sm"
              onClick={handleNewScan}
              disabled={createScan.isPending}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {createScan.isPending ? 'Creating…' : 'New Scan'}
            </Button>
          </div>
          {(scans ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No scans recorded yet.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={handleNewScan} disabled={createScan.isPending}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Start First Scan
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {(scans ?? []).map(scan => (
                <Card
                  key={scan.id}
                  className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedScanId(scan.id)}
                >
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        Scan #{scan.id} — {new Date(scan.scanDate).toLocaleDateString()}
                      </div>
                      {scan.healthScore != null && (
                        <div className="text-xs font-semibold mt-0.5" style={{
                          color: scan.healthScore >= 75 ? '#059669' : scan.healthScore >= 50 ? '#d97706' : '#dc2626'
                        }}>
                          Health Score: {scan.healthScore}/100
                        </div>
                      )}
                      {scan.technicianNotes && (
                        <div className="text-xs text-muted-foreground truncate">{scan.technicianNotes}</div>
                      )}
                    </div>
                    <Badge variant={scan.status === 'delivered' ? 'default' : 'secondary'} className="text-xs">
                      {scan.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── DISCOUNT SCHEDULE ───────────────────────────────────── */}
        <TabsContent value="discounts">
          <h3 className="text-sm font-semibold mb-3">Member Discount Schedule — {tierDef.label}</h3>
            <Card className="border shadow-sm">
            <CardContent className="p-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left pb-2">Job Size</th>
                    <th className="text-right pb-2">Discount Rate</th>
                    <th className="text-right pb-2">Max Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {tierDef.discountBrackets.map((bracket, i) => {
                    const prev = i === 0 ? 0 : tierDef.discountBrackets[i - 1].ceilingCents;
                    const isLast = bracket.ceilingCents === Infinity;
                    const label = isLast
                      ? `Above ${formatDollars(prev)}`
                      : `${formatDollars(prev + 1)} – ${formatDollars(bracket.ceilingCents)}`;
                    const maxSavings = isLast
                      ? '—'
                      : formatDollars(Math.round((bracket.ceilingCents - prev) * bracket.rate));
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 text-foreground">{label}</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">
                          {bracket.rate === 0 ? 'No discount' : `${(bracket.rate * 100).toFixed(0)}% off`}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">{maxSavings}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">
                Discounts apply to labor and materials. The step-ladder structure ensures larger jobs remain profitable for both parties.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
