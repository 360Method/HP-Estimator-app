/**
 * 360 Method — Scan Detail / Report Builder (Sprint 4)
 * Shows health score, cascade-risk-sorted repair list, editable summary,
 * Create Estimate one-tap action, and Send to Portal.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Wrench,
  Zap,
  ClipboardList,
  Send,
  FileText,
  ChevronDown,
  ChevronUp,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

interface Recommendation {
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  section: string;
  item: string;
  estimatedCostLow?: number;
  estimatedCostHigh?: number;
  cascadeRiskScore: number;
  notes?: string;
  systemType?: string;
}

interface InspectionItem {
  section: string;
  itemName: string;
  condition: string;
  notes?: string;
  photoUrls?: string[];
  estimatedCostLow?: number;
  estimatedCostHigh?: number;
  systemType?: string;
  cascadeRiskScore?: number;
  priority?: string;
}

const PRIORITY_CONFIG = {
  Critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: '🚨' },
  High:     { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: '⚡' },
  Medium:   { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚠' },
  Low:      { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: '👁' },
};

function HealthScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const label = score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Attention';

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="mt-[-72px] flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
      <div className="mt-10 text-xs font-semibold" style={{ color }}>{label}</div>
    </div>
  );
}

interface Props {
  scanId: number;
  membershipId: number;
  onBack: () => void;
}

export default function ThreeSixtyScanDetail({ scanId, membershipId, onBack }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [expandedRec, setExpandedRec] = useState<number | null>(null);
  const [sendingPortal, setSendingPortal] = useState(false);

  const { data: scan, isLoading } = trpc.threeSixty.scans.getDetail.useQuery({ id: scanId });

  const updateSummary = trpc.threeSixty.scans.updateSummary.useMutation({
    onSuccess: () => {
      utils.threeSixty.scans.getDetail.invalidate({ id: scanId });
      setEditingSummary(false);
      toast.success('Summary saved');
    },
  });

  const sendToPortal = trpc.threeSixty.scans.sendToPortal.useMutation({
    onSuccess: () => {
      utils.threeSixty.scans.list.invalidate({ membershipId });
      utils.threeSixty.scans.getDetail.invalidate({ id: scanId });
      toast.success('Report sent to customer portal');
      setSendingPortal(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to send to portal');
      setSendingPortal(false);
    },
  });

  const createEstimate = trpc.threeSixty.scans.createEstimateFromFinding.useMutation({
    onSuccess: (data) => {
      // Navigate to new estimate with prefill data
      const params = new URLSearchParams({
        title: data.prefill.title,
        description: data.prefill.description,
        customerId: String(data.prefill.customerId),
        linkedScanId: String(data.prefill.linkedScanId),
        ...(data.prefill.estimatedCostLow ? { costLow: String(data.prefill.estimatedCostLow) } : {}),
        ...(data.prefill.estimatedCostHigh ? { costHigh: String(data.prefill.estimatedCostHigh) } : {}),
      });
      navigate(`/estimates/new?${params.toString()}`);
    },
    onError: () => toast.error('Failed to create estimate'),
  });

  if (isLoading || !scan) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading report…</div>;
  }

  const recommendations: Recommendation[] = scan.recommendations ?? [];
  const items: InspectionItem[] = scan.items ?? [];
  const healthScore = scan.healthScore ?? 0;

  const criticalCount = recommendations.filter(r => r.priority === 'Critical').length;
  const highCount = recommendations.filter(r => r.priority === 'High').length;
  const totalEstCostLow = recommendations.reduce((s, r) => s + (r.estimatedCostLow ?? 0), 0);
  const totalEstCostHigh = recommendations.reduce((s, r) => s + (r.estimatedCostHigh ?? 0), 0);

  const goodItems = items.filter(i => i.condition === 'good');

  function startEditSummary() {
    setSummaryDraft(scan?.summary ?? '');
    setEditingSummary(true);
  }

  function handleSendToPortal() {
    setSendingPortal(true);
    sendToPortal.mutate({ scanId });
  }

  return (
    <div className="container py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">360° Inspection Report</h1>
            <Badge variant={scan.status === 'delivered' ? 'default' : 'secondary'} className="text-xs">
              {scan.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(scan.scanDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {scan.status !== 'delivered' && (
          <Button
            size="sm"
            onClick={handleSendToPortal}
            disabled={sendingPortal || sendToPortal.isPending}
            className="gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {sendingPortal ? 'Sending…' : 'Send to Portal'}
          </Button>
        )}
        {scan.status === 'delivered' && (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Delivered
          </Badge>
        )}
      </div>

      {/* Health Score + KPIs */}
      <Card className="border shadow-sm mb-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-6">
            <HealthScoreRing score={healthScore} />
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="text-center p-2 rounded-lg bg-red-50 border border-red-100">
                <div className="text-xl font-bold text-red-700">{criticalCount}</div>
                <div className="text-xs text-red-600">Critical</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-orange-50 border border-orange-100">
                <div className="text-xl font-bold text-orange-700">{highCount}</div>
                <div className="text-xs text-orange-600">High Priority</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-xl font-bold text-emerald-700">{goodItems.length}</div>
                <div className="text-xs text-emerald-600">Systems Good</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/40 border border-border">
                <div className="text-sm font-bold text-foreground">
                  {totalEstCostLow > 0 ? `$${(totalEstCostLow / 100).toFixed(0)}k` : '—'}
                </div>
                <div className="text-xs text-muted-foreground">Est. Repairs</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card className="border shadow-sm mb-4">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Executive Summary
            </CardTitle>
            {!editingSummary && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={startEditSummary}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editingSummary ? (
            <div className="space-y-2">
              <Textarea
                value={summaryDraft}
                onChange={e => setSummaryDraft(e.target.value)}
                rows={5}
                className="text-sm resize-none"
                placeholder="Write an executive summary for the customer…"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditingSummary(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => updateSummary.mutate({ id: scanId, summary: summaryDraft })}
                  disabled={updateSummary.isPending}
                >
                  {updateSummary.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scan.summary || (
                <span className="italic">
                  No summary yet.{' '}
                  <button className="underline text-primary" onClick={startEditSummary}>Add one</button>
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Priority Repair List */}
      {recommendations.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> Priority Repair List
            <span className="text-xs text-muted-foreground font-normal">
              (sorted by cascade risk)
            </span>
          </h2>
          <div className="space-y-2">
            {recommendations.map((rec, i) => {
              const cfg = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.Low;
              const isExpanded = expandedRec === i;
              return (
                <Card key={i} className={`border ${cfg.border} ${cfg.bg}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{rec.item}</span>
                          <Badge className={`text-[10px] ${cfg.color} bg-white border ${cfg.border}`}>
                            {rec.priority}
                          </Badge>
                          {rec.systemType && (
                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              {rec.systemType}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.section}</p>
                        {(rec.estimatedCostLow || rec.estimatedCostHigh) && (
                          <p className="text-xs font-medium text-orange-700 mt-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Est. ${rec.estimatedCostLow ?? '?'} – ${rec.estimatedCostHigh ?? '?'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-2"
                          onClick={() => createEstimate.mutate({
                            scanId,
                            item: rec.item,
                            section: rec.section,
                            estimatedCostLow: rec.estimatedCostLow,
                            estimatedCostHigh: rec.estimatedCostHigh,
                            notes: rec.notes,
                            customerId: scan.customerId,
                          })}
                          disabled={createEstimate.isPending}
                        >
                          + Estimate
                        </Button>
                        <button
                          onClick={() => setExpandedRec(isExpanded ? null : i)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && rec.notes && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">{rec.notes}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Cascade Risk Score: {rec.cascadeRiskScore}/10
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All Inspection Items */}
      {items.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" /> Full Inspection Log
          </h2>
          <div className="space-y-1.5">
            {items.map((item, i) => {
              const condColors: Record<string, string> = {
                good: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                monitor: 'text-blue-700 bg-blue-50 border-blue-200',
                repair_needed: 'text-orange-700 bg-orange-50 border-orange-200',
                urgent: 'text-red-700 bg-red-50 border-red-200',
                na: 'text-muted-foreground bg-muted/30 border-border',
              };
              const condLabel: Record<string, string> = {
                good: '✓ Good', monitor: '👁 Monitor', repair_needed: '⚡ Repair', urgent: '🚨 Urgent', na: '— N/A',
              };
              const cls = condColors[item.condition] ?? condColors.na;
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${cls}`}>
                  <span className="flex-1 font-medium">{item.itemName}</span>
                  {item.systemType && (
                    <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded border border-current/20">
                      {item.systemType}
                    </span>
                  )}
                  <span className="text-xs font-semibold shrink-0">{condLabel[item.condition] ?? item.condition}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Technician Notes */}
      {scan.technicianNotes && (
        <Card className="border shadow-sm mb-4">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Technician Notes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{scan.technicianNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Property Systems Baseline */}
      {(scan.systems ?? []).length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> Property System Baselines
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(scan.systems ?? []).map(sys => {
              const condBadge: Record<string, string> = {
                good: 'bg-emerald-100 text-emerald-800',
                fair: 'bg-yellow-100 text-yellow-800',
                poor: 'bg-orange-100 text-orange-800',
                critical: 'bg-red-100 text-red-800',
              };
              const sysLabels: Record<string, string> = {
                hvac: 'HVAC', roof: 'Roof', plumbing: 'Plumbing', electrical: 'Electrical',
                foundation: 'Foundation', exterior_siding: 'Exterior', interior: 'Interior', appliances: 'Appliances',
              };
              return (
                <div key={sys.id} className="p-2 rounded-lg border bg-muted/20 text-center">
                  <div className="text-xs font-semibold mb-1">{sysLabels[sys.systemType] ?? sys.systemType}</div>
                  <Badge className={`text-[10px] capitalize ${condBadge[sys.condition] ?? ''}`}>
                    {sys.condition}
                  </Badge>
                  {sys.installYear && (
                    <div className="text-[10px] text-muted-foreground mt-1">Installed {sys.installYear}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      {scan.status !== 'delivered' && (
        <div className="sticky bottom-0 bg-background border-t pt-3 pb-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleSendToPortal}
            disabled={sendingPortal || sendToPortal.isPending}
          >
            <Send className="w-4 h-4" />
            {sendingPortal ? 'Sending…' : 'Send to Customer Portal'}
          </Button>
        </div>
      )}
    </div>
  );
}
