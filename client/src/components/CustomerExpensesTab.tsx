/**
 * CustomerExpensesTab — lists and creates expenses for a specific customer.
 * Expenses can optionally be linked to a specific job/opportunity.
 * Amounts stored in cents; display divides by 100.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Receipt, DollarSign, Tag, Calendar,
  Building2, FileText, AlertCircle,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "materials",     label: "Materials",      color: "bg-blue-100 text-blue-800" },
  { value: "labor",         label: "Labor",          color: "bg-purple-100 text-purple-800" },
  { value: "subcontractor", label: "Subcontractor",  color: "bg-indigo-100 text-indigo-800" },
  { value: "equipment",     label: "Equipment",      color: "bg-orange-100 text-orange-800" },
  { value: "fuel",          label: "Fuel/Travel",    color: "bg-amber-100 text-amber-800" },
  { value: "permits",       label: "Permits",        color: "bg-teal-100 text-teal-800" },
  { value: "other",         label: "Other",          color: "bg-gray-100 text-gray-700" },
] as const;

type Category = typeof CATEGORIES[number]["value"];

const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;
const catColor = (v: string) => CATEGORIES.find(c => c.value === v)?.color ?? "bg-gray-100 text-gray-700";

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);

const today = () => new Date().toISOString().slice(0, 10);

// ─── ADD EXPENSE DIALOG ───────────────────────────────────────────────────────

interface AddExpenseDialogProps {
  customerId: string;
  opportunityId?: string;
  opportunityOptions?: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function AddExpenseDialog({
  customerId,
  opportunityId: defaultOppId,
  opportunityOptions = [],
  onClose,
  onSaved,
}: AddExpenseDialogProps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      onSaved();
    },
  });

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("materials");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today());
  const [oppId, setOppId] = useState(defaultOppId ?? "");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(cents) || cents <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    setError("");
    await createMutation.mutateAsync({
      customerId,
      opportunityId: oppId || undefined,
      vendor: vendor || undefined,
      amount: cents,
      category,
      description: description || undefined,
      date,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-600" />
            Add Expense
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount *</label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="field-input pl-7 w-full"
              />
            </div>
          </div>
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category *</label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Date */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="field-input w-full"
            />
          </div>
          {/* Vendor */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendor</label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Home Depot, Lowes, etc."
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                className="field-input pl-7 w-full"
              />
            </div>
          </div>
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea
              rows={2}
              placeholder="What was purchased or incurred?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="field-input w-full resize-none text-sm"
            />
          </div>
          {/* Link to job */}
          {opportunityOptions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Link to Job (optional)</label>
              <Select value={oppId || "_none"} onValueChange={v => setOppId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No job linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No job linked</SelectItem>
                  {opportunityOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Saving…" : "Add Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface CustomerExpensesTabProps {
  customerId: string;
  /** If provided, shows only expenses for this job and pre-fills the link */
  opportunityId?: string;
  /** List of jobs for the customer to link expenses to */
  opportunityOptions?: { id: string; title: string }[];
}

export default function CustomerExpensesTab({
  customerId,
  opportunityId,
  opportunityOptions = [],
}: CustomerExpensesTabProps) {
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const { data: expenses, isLoading } = trpc.expenses.list.useQuery({
    customerId,
    opportunityId,
    limit: 200,
  });

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => utils.expenses.list.invalidate(),
  });

  const filtered = (expenses ?? []).filter(
    e => filterCategory === "all" || e.category === filterCategory
  );

  const totalCents = filtered.reduce((sum, e) => sum + e.amount, 0);

  // Group by category for summary
  const byCat: Record<string, number> = {};
  for (const e of expenses ?? []) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold">
            {expenses?.length ?? 0} expense{(expenses?.length ?? 0) !== 1 ? "s" : ""}
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-bold text-orange-700">{fmt(totalCents)}</span>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add Expense
        </Button>
      </div>

      {/* Category filter pills */}
      {(expenses?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            All ({expenses?.length ?? 0})
          </button>
          {CATEGORIES.filter(c => byCat[c.value]).map(c => (
            <button
              key={c.value}
              onClick={() => setFilterCategory(c.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filterCategory === c.value
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {c.label} ({fmt(byCat[c.value] ?? 0)})
            </button>
          ))}
        </div>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Receipt className="w-8 h-8 opacity-30" />
          <p className="text-sm font-medium">No expenses recorded</p>
          <p className="text-xs">Track materials, labor, and other job costs here.</p>
          <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add First Expense
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(exp => (
            <Card key={exp.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] px-1.5 py-0 ${catColor(exp.category)}`}>
                        {catLabel(exp.category)}
                      </Badge>
                      {exp.vendor && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Building2 className="w-3 h-3" />
                          {exp.vendor}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="w-3 h-3" />
                        {exp.date}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{exp.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-orange-700">{fmt(exp.amount)}</span>
                    <button
                      onClick={() => {
                        if (confirm("Delete this expense?")) {
                          deleteMutation.mutate({ id: exp.id });
                        }
                      }}
                      className="text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      {showAdd && (
        <AddExpenseDialog
          customerId={customerId}
          opportunityId={opportunityId}
          opportunityOptions={opportunityOptions}
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
