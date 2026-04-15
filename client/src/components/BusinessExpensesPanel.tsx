/**
 * BusinessExpensesPanel
 * Full expense ledger for FinancialsPage.
 * Shows ALL expenses (job + business) with scope badge, filterable.
 * Includes an "Add Business Expense" form for overhead not tied to any job.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Trash2, Building2, Briefcase, Receipt } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'materials',     label: 'Materials' },
  { value: 'labor',         label: 'Labor' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment',     label: 'Equipment' },
  { value: 'fuel',          label: 'Fuel' },
  { value: 'permits',       label: 'Permits' },
  { value: 'other',         label: 'Other' },
] as const;

type Category = typeof CATEGORIES[number]['value'];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c.label])
);

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const todayIso = () => new Date().toISOString().slice(0, 10);

// ── Add Business Expense Dialog ───────────────────────────────────────────────

interface AddDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function AddBusinessExpenseDialog({ open, onClose, onAdded }: AddDialogProps) {
  const utils = trpc.useUtils();
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());

  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.listBusiness.invalidate();
      utils.expenses.summary.invalidate();
      utils.financials.getExpenseSummary.invalidate();
      utils.financials.getPnLByMonth.invalidate();
      toast.success('Business expense added');
      onAdded();
      onClose();
      setVendor(''); setAmount(''); setCategory('other'); setDescription(''); setDate(todayIso());
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(cents) || cents <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!date) { toast.error('Enter a date'); return; }
    create.mutate({
      vendor: vendor || undefined,
      amount: cents,
      category,
      description: description || undefined,
      date,
      scope: 'business',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Add Business Expense
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount *</label>
              <Input
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendor / Payee</label>
            <Input
              placeholder="e.g. Home Depot, Insurance Co."
              value={vendor}
              onChange={e => setVendor(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
            <Select value={category} onValueChange={v => setCategory(v as Category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input
              placeholder="e.g. Monthly truck insurance, office supplies…"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface BusinessExpensesPanelProps {
  /** Optional date range filter from parent */
  dateFrom?: string;
  dateTo?: string;
}

export default function BusinessExpensesPanel({ dateFrom, dateTo }: BusinessExpensesPanelProps) {
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'job' | 'business'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: rows, isLoading } = trpc.expenses.list.useQuery({
    scope: scopeFilter === 'all' ? undefined : scopeFilter,
    category: categoryFilter === 'all' ? undefined : categoryFilter,
    dateFrom,
    dateTo,
    limit: 300,
  });

  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.listBusiness.invalidate();
      utils.expenses.summary.invalidate();
      utils.financials.getExpenseSummary.invalidate();
      utils.financials.getPnLByMonth.invalidate();
      toast.success('Expense deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  const totalCents = (rows ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={scopeFilter} onValueChange={v => setScopeFilter(v as typeof scopeFilter)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Expenses</SelectItem>
            <SelectItem value="job">Job Expenses</SelectItem>
            <SelectItem value="business">Business Overhead</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {rows && rows.length > 0 && (
          <span className="text-xs text-muted-foreground font-medium">
            Total: <span className="text-foreground font-semibold">{fmt$(totalCents)}</span>
          </span>
        )}

        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add Business Expense
        </Button>
      </div>

      {/* ── Ledger ── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !rows?.length ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <Receipt className="w-8 h-8 opacity-30" />
          <p className="text-sm">No expenses recorded yet.</p>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Business Expense
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Vendor</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Scope</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.date}</td>
                  <td className="px-3 py-2 font-medium truncate max-w-[120px]">{row.vendor || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                      {CATEGORY_LABEL[row.category] ?? row.category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.scope === 'business' ? (
                      <Badge variant="outline" className="text-[10px] gap-1 border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300">
                        <Building2 className="w-2.5 h-2.5" />
                        Business
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300">
                        <Briefcase className="w-2.5 h-2.5" />
                        Job
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">
                    {row.description || '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmt$(row.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteExpense.mutate({ id: row.id })}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20">
                <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                  {rows.length} expense{rows.length !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold">{fmt$(totalCents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <AddBusinessExpenseDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => {}}
      />
    </div>
  );
}
