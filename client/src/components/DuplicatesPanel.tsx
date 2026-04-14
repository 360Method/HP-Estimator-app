/**
 * DuplicatesPanel — collapsible banner shown at the top of CustomersListPage
 * when duplicate customer groups are detected.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Customer } from '@/lib/types';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronDown, ChevronUp, GitMerge } from 'lucide-react';
import MergeCustomerDialog from './MergeCustomerDialog';

interface DuplicateGroup {
  reason: 'email' | 'phone' | 'name_zip';
  customers: Customer[];
}

interface Props {
  onMerged: (sourceId: string, targetId: string) => void;
}

const REASON_LABEL: Record<string, string> = {
  email: 'Same email',
  phone: 'Same phone',
  name_zip: 'Same name + zip',
};

export default function DuplicatesPanel({ onMerged }: Props) {
  const { updateCustomer } = useEstimator();
  const [expanded, setExpanded] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ a: Customer; b: Customer } | null>(null);

  const { data, refetch } = trpc.customers.detectDuplicates.useQuery(undefined, {
    staleTime: 60_000,
  });

  const groups = (data ?? []) as DuplicateGroup[];
  if (groups.length === 0) return null;

  const totalDups = groups.reduce((acc, g) => acc + g.customers.length - 1, 0);

  return (
    <>
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm font-medium text-amber-800 flex-1">
            {totalDups} possible duplicate{totalDups !== 1 ? 's' : ''} detected across {groups.length} group{groups.length !== 1 ? 's' : ''}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-amber-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-amber-600" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-amber-200 divide-y divide-amber-100">
            {groups.map((group, gi) => (
              <div key={gi} className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                    {REASON_LABEL[group.reason] ?? group.reason}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{group.customers.length} records</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.customers.map((c, ci) =>
                    group.customers.slice(ci + 1).map((c2, c2i) => (
                      <button
                        key={`${c.id}-${c2.id}-${c2i}`}
                        onClick={() => setMergeTarget({ a: c as unknown as Customer, b: c2 as unknown as Customer })}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-50 transition-colors text-xs"
                      >
                        <GitMerge className="w-3 h-3 text-amber-600" />
                        <span className="font-medium">
                          {(c as any).displayName || `${(c as any).firstName} ${(c as any).lastName}`.trim()}
                        </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-medium">
                          {(c2 as any).displayName || `${(c2 as any).firstName} ${(c2 as any).lastName}`.trim()}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mergeTarget && (
        <MergeCustomerDialog
          open={!!mergeTarget}
          onOpenChange={(v) => { if (!v) setMergeTarget(null); }}
          customerA={mergeTarget.a}
          customerB={mergeTarget.b}
          onMerged={(sourceId, targetId) => {
            updateCustomer(sourceId, { mergedIntoId: targetId } as any);
            refetch();
            onMerged(sourceId, targetId);
          }}
        />
      )}
    </>
  );
}
