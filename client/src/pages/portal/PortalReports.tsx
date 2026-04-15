/**
 * Customer Portal — 360° Inspection Reports list
 */
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';

export default function PortalReports() {
  const [, navigate] = useLocation();
  const { data: reports, isLoading } = trpc.portal.getReports.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">Loading reports…</div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="container py-10 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-lg font-semibold mb-1">No Reports Yet</h2>
        <p className="text-sm text-muted-foreground">
          Your 360° Home Inspection reports will appear here after your first visit.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-1">360° Inspection Reports</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Your home health history — click any report to view details.
      </p>
      <div className="space-y-3">
        {reports.map(report => {
          const score = report.healthScore ?? 0;
          const scoreColor = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
          const rd = report.reportData;
          const criticalCount = (rd?.recommendations ?? []).filter(
            (r: any) => r.priority === 'Critical'
          ).length;
          const highCount = (rd?.recommendations ?? []).filter(
            (r: any) => r.priority === 'High'
          ).length;
          return (
            <Card
              key={report.id}
              className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/portal/reports/${report.id}`)}
            >
              <CardContent className="py-3 px-4 flex items-center gap-4">
                {/* Score ring */}
                <div className="shrink-0 flex flex-col items-center w-12">
                  <span className="text-xl font-bold" style={{ color: scoreColor }}>{score}</span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">
                      Home Inspection Report
                    </span>
                    <Badge
                      className="text-[10px]"
                      variant={report.pdfUrl ? 'default' : 'secondary'}
                    >
                      {report.pdfUrl ? 'PDF Ready' : 'Report'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(report.sentAt ?? 0).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                  {(criticalCount > 0 || highCount > 0) && (
                    <div className="flex items-center gap-2 mt-1">
                      {criticalCount > 0 && (
                        <span className="text-[10px] text-red-700 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> {criticalCount} Critical
                        </span>
                      )}
                      {highCount > 0 && (
                        <span className="text-[10px] text-orange-700 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> {highCount} High
                        </span>
                      )}
                    </div>
                  )}
                  {criticalCount === 0 && highCount === 0 && (
                    <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 mt-1">
                      <CheckCircle2 className="w-3 h-3" /> All systems good
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
