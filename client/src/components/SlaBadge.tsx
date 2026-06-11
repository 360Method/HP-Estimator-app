// SlaBadge — 48h service-level badge for new-enrollment baseline scans.
// Red if >48h since createdAt, amber if 24-48h, green if <24h.
// Shared by the dashboard "What needs you today" list and the 360 Members page.

import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock } from 'lucide-react';

export default function SlaBadge({ createdAt }: { createdAt: Date | string }) {
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
