/**
 * MergeCustomerDialog — side-by-side comparison of two customers.
 * User picks which record to keep (target), then confirms the merge.
 * The source record is soft-deleted; all its opps/addresses/conversations
 * are re-parented to the target.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Customer } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerA: Customer;
  customerB: Customer;
  onMerged: () => void;
}

function Field({ label, a, b, keepA }: { label: string; a: string; b: string; keepA: boolean }) {
  if (!a && !b) return null;
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-2 items-start text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground font-medium pt-0.5">{label}</span>
      <span className={`truncate ${keepA ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{a || '—'}</span>
      <span className={`truncate ${!keepA ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{b || '—'}</span>
    </div>
  );
}

export default function MergeCustomerDialog({ open, onOpenChange, customerA, customerB, onMerged }: Props) {
  // keepA=true means A is the survivor (target), B is soft-deleted
  const [keepA, setKeepA] = useState(true);

  const targetId = keepA ? customerA.id : customerB.id;
  const sourceId = keepA ? customerB.id : customerA.id;

  const mergeMutation = trpc.customers.merge.useMutation({
    onSuccess: () => {
      toast.success('Customers merged — duplicate record removed.');
      onMerged();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const nameA = customerA.displayName || `${customerA.firstName} ${customerA.lastName}`.trim() || 'Customer A';
  const nameB = customerB.displayName || `${customerB.firstName} ${customerB.lastName}`.trim() || 'Customer B';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Duplicate Customers</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Select which record to keep. The other will be removed and all its jobs, estimates, and messages will be transferred to the surviving record.
          </p>
        </DialogHeader>

        {/* Survivor selector */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          {[{ c: customerA, name: nameA, isA: true }, { c: customerB, name: nameB, isA: false }].map(({ c, name, isA }) => {
            const isKept = isA ? keepA : !keepA;
            return (
              <button
                key={c.id}
                onClick={() => setKeepA(isA)}
                className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                  isKept ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                }`}
              >
                {isKept && (
                  <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />
                )}
                <div className="font-semibold text-sm truncate pr-6">{name}</div>
                {c.company && <div className="text-xs text-muted-foreground truncate">{c.company}</div>}
                <div className="text-xs text-muted-foreground mt-1">{c.email || c.mobilePhone || '—'}</div>
                <div className="text-xs text-muted-foreground">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</div>
                <Badge variant={isKept ? 'default' : 'secondary'} className="mt-2 text-[10px]">
                  {isKept ? 'Keep this record' : 'Remove this record'}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Field comparison */}
        <div className="mt-4 rounded-lg border border-border p-3 bg-muted/30 max-h-64 overflow-y-auto">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 mb-2">
            <span />
            <span className={`text-xs font-bold truncate ${keepA ? 'text-primary' : 'text-muted-foreground'}`}>{nameA}</span>
            <span className={`text-xs font-bold truncate ${!keepA ? 'text-primary' : 'text-muted-foreground'}`}>{nameB}</span>
          </div>
          <Field label="Email" a={customerA.email} b={customerB.email} keepA={keepA} />
          <Field label="Mobile" a={customerA.mobilePhone} b={customerB.mobilePhone} keepA={keepA} />
          <Field label="Company" a={customerA.company} b={customerB.company} keepA={keepA} />
          <Field label="Street" a={customerA.street} b={customerB.street} keepA={keepA} />
          <Field label="City" a={customerA.city} b={customerB.city} keepA={keepA} />
          <Field label="State" a={customerA.state} b={customerB.state} keepA={keepA} />
          <Field label="Zip" a={customerA.zip} b={customerB.zip} keepA={keepA} />
          <Field label="Type" a={customerA.customerType} b={customerB.customerType} keepA={keepA} />
          <Field label="Lead Source" a={customerA.leadSource} b={customerB.leadSource} keepA={keepA} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2 mt-1">
          <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          All jobs, estimates, invoices, and messages from <strong className="text-foreground">{keepA ? nameB : nameA}</strong> will be moved to <strong className="text-foreground">{keepA ? nameA : nameB}</strong>. Tags from both records will be combined.
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => mergeMutation.mutate({ sourceId, targetId })}
            disabled={mergeMutation.isPending}
          >
            {mergeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Merge & Remove Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
