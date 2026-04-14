/**
 * 360 Method — Member Detail Page
 * Shows membership info, seasonal visits, labor bank ledger, and annual scan history.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CalendarCheck, Wallet, ClipboardList, Plus, CheckCircle2, Clock, SkipForward } from 'lucide-react';
import { formatDollars, TIER_DEFINITIONS, type MemberTier } from '../../../shared/threeSixtyTiers';
import { toast } from 'sonner';
import ThreeSixtyVisitDetail from './ThreeSixtyVisitDetail';

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
  
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: membership, isLoading } = trpc.threeSixty.memberships.get.useQuery({ id: membershipId });
  const { data: visits } = trpc.threeSixty.visits.list.useQuery({ membershipId });
  const { data: ledger } = trpc.threeSixty.laborBank.getLedger.useQuery({ membershipId });
  const { data: scans } = trpc.threeSixty.scans.list.useQuery({ membershipId });

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
          <div className="flex items-center gap-2">
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
          <TabsTrigger value="visits" className="text-xs">Visits</TabsTrigger>
          <TabsTrigger value="labor-bank" className="text-xs">Labor Bank</TabsTrigger>
          <TabsTrigger value="scans" className="text-xs">Scans</TabsTrigger>
          <TabsTrigger value="discounts" className="text-xs">Discounts</TabsTrigger>
        </TabsList>

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

        {/* ── SCANS ───────────────────────────────────────────────── */}
        <TabsContent value="scans">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Annual 360 Home Scans</h3>
          </div>
          {(scans ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No scans recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {(scans ?? []).map(scan => (
                <Card key={scan.id} className="border shadow-sm">
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        Scan #{scan.id} — {new Date(scan.scanDate).toLocaleDateString()}
                      </div>
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
