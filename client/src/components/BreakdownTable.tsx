// ============================================================
// BreakdownTable — Transparent cost breakdown for a trade
// ============================================================

import { BreakdownRow } from '@/lib/calc';

interface BreakdownTableProps {
  rows: BreakdownRow[];
  hardCost: number;
}

export default function BreakdownTable({ rows, hardCost }: BreakdownTableProps) {
  if (hardCost === 0) {
    return (
      <div className="text-[12px] text-muted-foreground italic py-2">
        Enter dimensions above to see cost breakdown.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => {
        if (row.isTotal) {
          return (
            <div key={i} className="flex justify-between items-center pt-2 mt-1 border-t border-border">
              <span className="text-[13px] font-bold text-foreground">{row.label}</span>
              <span className="text-[15px] font-black mono text-primary">{row.value}</span>
            </div>
          );
        }
        if (row.isSubtotal) {
          return (
            <div key={i} className="flex justify-between items-center py-0.5">
              <span className="text-[11px] text-muted-foreground italic">{row.label}</span>
              <span className="text-[11px] font-semibold mono text-muted-foreground">{row.value}</span>
            </div>
          );
        }
        return (
          <div key={i} className="flex justify-between items-center py-0.5">
            <span className="text-[12px] text-muted-foreground">{row.label}</span>
            <span className="text-[12px] font-semibold mono text-foreground">{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}
