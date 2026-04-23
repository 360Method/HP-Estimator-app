/**
 * Customer Portal — 360° Inspection Report Detail
 * Shows health score, executive summary, priority repair list, and full inspection log.
 */
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Wrench,
  ChevronDown,
  ChevronUp,
  DollarSign,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useParams } from 'wouter';

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

const PRIORITY_CONFIG = {
  Critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: '🚨' },
  High:     { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: '⚡' },
  Medium:   { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚠' },
  Low:      { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: '👁' },
};

function HealthScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const label = score >= 75 ? 'Good Standing' : score >= 50 ? 'Fair Condition' : 'Needs Attention';

  return (
    <div className="flex flex-col items-center">
      <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="55" cy="55" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="mt-[-82px] flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="mt-12 text-sm font-semibold text-center" style={{ color }}>{label}</div>
    </div>
  );
}

export default function PortalReportDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [expandedRec, setExpandedRec] = useState<number | null>(null);

  const { data: report, isLoading } = trpc.portal.getReport.useQuery(
    { id: parseInt(params.id ?? '0') },
    { enabled: !!params.id }
  );

  if (isLoading || !report) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading report…</div>;
  }

  const rd = report.reportData;
  const recommendations: Recommendation[] = rd?.recommendations ?? [];
  const items: any[] = rd?.items ?? [];
  const healthScore = report.healthScore ?? 0;
  const criticalCount = recommendations.filter(r => r.priority === 'Critical').length;
  const highCount = recommendations.filter(r => r.priority === 'High').length;
  const goodCount = items.filter(i => i.condition === 'good').length;

  return (
    <div className="container py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/reports')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">360° Home Inspection Report</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(report.sentAt ?? 0).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        {report.pdfUrl && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => window.open(report.pdfUrl!, '_blank')}
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
        )}
      </div>

      {/* Health Score Card */}
      <Card className="border shadow-sm mb-4">
        <CardContent className="p-5">
          <div className="flex items-center gap-6">
            <HealthScoreRing score={healthScore} />
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-red-50 border border-red-100">
                <div className="text-2xl font-bold text-red-700">{criticalCount}</div>
                <div className="text-xs text-red-600">Critical</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-orange-50 border border-orange-100">
                <div className="text-2xl font-bold text-orange-700">{highCount}</div>
                <div className="text-xs text-orange-600">High Priority</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-2xl font-bold text-emerald-700">{goodCount}</div>
                <div className="text-xs text-emerald-600">Systems Good</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      {rd?.summary && (
        <Card className="border shadow-sm mb-4">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Summary from Your Technician</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{rd.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Priority Repairs */}
      {recommendations.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> Recommended Repairs
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
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.section}</p>
                        {(rec.estimatedCostLow || rec.estimatedCostHigh) && (
                          <p className="text-xs font-medium text-orange-700 mt-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Estimated ${rec.estimatedCostLow ?? '?'} – ${rec.estimatedCostHigh ?? '?'}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedRec(isExpanded ? null : i)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                    {isExpanded && rec.notes && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">{rec.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Inspection Log */}
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
                good: '✓ Good', monitor: '👁 Monitor', repair_needed: '⚡ Repair Needed',
                urgent: '🚨 Urgent', na: '— N/A',
              };
              const cls = condColors[item.condition] ?? condColors.na;
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${cls}`}>
                  <span className="flex-1 font-medium">{item.itemName}</span>
                  <span className="text-xs font-semibold shrink-0">
                    {condLabel[item.condition] ?? item.condition}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA */}
      <Card className="border border-[#c8922a]/30 bg-amber-50 mb-4">
        <CardContent className="p-4 text-center">
          <h3 className="text-sm font-semibold text-[#1a2e1a] mb-1">Ready to schedule repairs?</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Contact Handy Pioneers to get a free estimate on any flagged items.
          </p>
          <Button
            size="sm"
            className="bg-[#c8922a] hover:bg-[#b07a1f] text-white"
            onClick={() => navigate('/portal/request')}
          >
            Request Service
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
