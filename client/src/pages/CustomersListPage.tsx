// ============================================================
// CustomersListPage — All Customers (reference layout)
// Table with Display Name, Company, Address, Mobile, Email,
// Lead Source, Notes, Tags columns.
// Filter slide-over | Edit Columns | Actions (Import/Export/Merge/Delete)
// ============================================================

import { useState, useMemo, useRef, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Customer } from '@/lib/types';
import { trpc } from '@/lib/trpc';
import NewCustomerModal from '@/components/NewCustomerModal';
import DuplicatesPanel from '@/components/DuplicatesPanel';
import MergeCustomerDialog from '@/components/MergeCustomerDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search, UserPlus, SlidersHorizontal, Columns2,
  ChevronDown, GitMerge, Tag, Download, Trash2, Upload,
  ArrowUpDown, ArrowUp, ArrowDown, X, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try { const v = JSON.parse(raw as string); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LEAD_SOURCES = ['Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor', 'Yelp', 'Direct Mail', 'Repeat Customer', 'Other'];

type SortField = 'displayName' | 'company' | 'city' | 'createdAt' | 'lifetimeValue';
type SortDir = 'asc' | 'desc';

type ColKey = 'company' | 'address' | 'mobile' | 'email' | 'leadSource' | 'notes' | 'tags';
const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: 'company',    label: 'Company' },
  { key: 'address',   label: 'Address' },
  { key: 'mobile',    label: 'Mobile' },
  { key: 'email',     label: 'Email' },
  { key: 'leadSource', label: 'Lead Source' },
  { key: 'notes',     label: 'Notes' },
  { key: 'tags',      label: 'Tags' },
];

// CSV column header → Customer field mapping
const CSV_HEADER_MAP: Record<string, string> = {
  'display name': 'displayName', 'name': 'displayName',
  'first name': 'firstName', 'last name': 'lastName',
  'company': 'company', 'email': 'email',
  'mobile': 'mobilePhone', 'mobile phone': 'mobilePhone', 'phone': 'mobilePhone',
  'home phone': 'homePhone', 'work phone': 'workPhone',
  'street': 'street', 'address': 'street',
  'city': 'city', 'state': 'state', 'zip': 'zip',
  'customer type': 'customerType', 'type': 'customerType',
  'lead source': 'leadSource', 'source': 'leadSource',
  'notes': 'notes', 'tags': 'tags',
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const field = CSV_HEADER_MAP[h] ?? h;
      row[field] = vals[i] ?? '';
    });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 ml-1 inline" />;
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3 text-primary ml-1 inline" />
    : <ArrowDown className="w-3 h-3 text-primary ml-1 inline" />;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CustomersListPage() {
  const { state, addCustomer, setActiveCustomer, updateCustomer: updateCtxCustomer, removeCustomer } = useEstimator();
  const { customers } = state;
  const utils = trpc.useUtils();

  // ── Column visibility ─────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(['company', 'address', 'mobile', 'email', 'leadSource', 'notes', 'tags'])
  );
  const [showColPicker, setShowColPicker] = useState(false);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterLeadSource, setFilterLeadSource] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState('');
  const [filterDateCreatedFrom, setFilterDateCreatedFrom] = useState('');
  const [filterDateCreatedTo, setFilterDateCreatedTo] = useState('');
  const [filterLifetimeMin, setFilterLifetimeMin] = useState('');
  const [filterLifetimeMax, setFilterLifetimeMax] = useState('');

  // ── Sort state ────────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortField>('displayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Selection / modal state ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ a: Customer; b: Customer } | null>(null);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // ── Import state ──────────────────────────────────────────────────────────
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── tRPC mutations ────────────────────────────────────────────────────────
  const bulkAddTagMutation = trpc.customers.bulkAddTag.useMutation({
    onSuccess: () => {
      toast.success(`Tag added to ${selected.size} customer(s).`);
      setShowTagPopover(false);
      setTagInput('');
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMutation = trpc.customers.bulkDelete.useMutation({
    onSuccess: (res) => {
      const msg = res.skipped.length > 0
        ? `Deleted ${res.deleted.length} — ${res.skipped.length} skipped (have linked jobs/estimates).`
        : `Deleted ${res.deleted.length} customer(s).`;
      toast.success(msg);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const exportCsvMutation = trpc.customers.exportCsv.useMutation({
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    },
    onError: (e) => toast.error(e.message),
  });

  const importCsvMutation = trpc.customers.importCsv.useMutation({
    onSuccess: (res) => {
      toast.success(`Import complete: ${res.created} created, ${res.updated} updated.`);
      setShowImportDialog(false);
      setImportRows(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => {
      parseTags(c.tags).forEach(t => set.add(t));
    });
    return Array.from(set).sort();
  }, [customers]);

  const hasActiveFilters = !!(filterType || filterLeadSource || filterTags.length || filterCity || filterDateCreatedFrom || filterDateCreatedTo || filterLifetimeMin || filterLifetimeMax);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let list = customers.filter(c => !(c as any).mergedIntoId);

    if (q) {
      list = list.filter(c => {
        const name = `${c.firstName ?? ''} ${c.lastName ?? ''} ${c.displayName ?? ''}`.toLowerCase();
        return (
          name.includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.mobilePhone ?? '').includes(q) ||
          (c.company ?? '').toLowerCase().includes(q)
        );
      });
    }
    if (filterType) list = list.filter(c => c.customerType === filterType);
    if (filterLeadSource) list = list.filter(c => c.leadSource === filterLeadSource);
    if (filterCity) list = list.filter(c => (c.city ?? '').toLowerCase().includes(filterCity.toLowerCase()));
    if (filterTags.length) {
      list = list.filter(c => {
        const tags = parseTags(c.tags);
        return filterTags.every(t => tags.includes(t));
      });
    }
    if (filterDateCreatedFrom) {
      const from = new Date(filterDateCreatedFrom).getTime();
      list = list.filter(c => c.createdAt && new Date(c.createdAt).getTime() >= from);
    }
    if (filterDateCreatedTo) {
      const to = new Date(filterDateCreatedTo).getTime();
      list = list.filter(c => c.createdAt && new Date(c.createdAt).getTime() <= to);
    }
    if (filterLifetimeMin) list = list.filter(c => parseFloat(c.lifetimeValue ?? '0') >= parseFloat(filterLifetimeMin));
    if (filterLifetimeMax) list = list.filter(c => parseFloat(c.lifetimeValue ?? '0') <= parseFloat(filterLifetimeMax));

    list = [...list].sort((a, b) => {
      let av = '', bv = '';
      if (sortBy === 'displayName') { av = (a.displayName || `${a.firstName} ${a.lastName}`).toLowerCase(); bv = (b.displayName || `${b.firstName} ${b.lastName}`).toLowerCase(); }
      else if (sortBy === 'company') { av = (a.company ?? '').toLowerCase(); bv = (b.company ?? '').toLowerCase(); }
      else if (sortBy === 'city') { av = (a.city ?? '').toLowerCase(); bv = (b.city ?? '').toLowerCase(); }
      else if (sortBy === 'lifetimeValue') { return sortDir === 'asc' ? parseFloat(a.lifetimeValue ?? '0') - parseFloat(b.lifetimeValue ?? '0') : parseFloat(b.lifetimeValue ?? '0') - parseFloat(a.lifetimeValue ?? '0'); }
      else if (sortBy === 'createdAt') { return sortDir === 'asc' ? new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime() : new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(); }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [customers, searchQuery, filterType, filterLeadSource, filterTags, filterCity, filterDateCreatedFrom, filterDateCreatedTo, filterLifetimeMin, filterLifetimeMax, sortBy, sortDir]);

  const totalActive = customers.filter(c => !(c as any).mergedIntoId).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreated = useCallback((c: Customer) => {
    addCustomer(c);
    setShowModal(false);
  }, [addCustomer]);

  const handleBulkMerge = () => {
    const ids = Array.from(selected);
    if (ids.length !== 2) { toast.error('Select exactly 2 customers to merge'); return; }
    const a = customers.find(c => c.id === ids[0]);
    const b = customers.find(c => c.id === ids[1]);
    if (a && b) setMergeTarget({ a, b });
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selected.size} customer(s)? Customers with jobs or estimates will be skipped.`)) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selected) });
  };

  const handleExport = () => {
    const ids = selected.size > 0 ? Array.from(selected) : filtered.map(c => c.id);
    exportCsvMutation.mutate({ ids });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) { toast.error('No valid rows found in CSV.'); return; }
      setImportRows(rows);
      setShowImportDialog(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportConfirm = () => {
    if (!importRows) return;
    importCsvMutation.mutate({ rows: importRows as any });
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterLeadSource('');
    setFilterTags([]);
    setFilterCity('');
    setFilterDateCreatedFrom('');
    setFilterDateCreatedTo('');
    setFilterLifetimeMin('');
    setFilterLifetimeMax('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-3 border-b border-border bg-background">
        <div className="text-xs text-muted-foreground mb-0.5">Customers / All Customers</div>
        <h1 className="text-2xl font-bold text-foreground leading-tight">All Customers</h1>
        <div className="text-sm text-muted-foreground mt-0.5">{totalActive} record{totalActive !== 1 ? 's' : ''}</div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-6 py-3 flex items-center gap-2 border-b border-border bg-background flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search customers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter button */}
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 rounded-full text-sm ${hasActiveFilters ? 'border-primary text-primary bg-primary/5' : ''}`}
          onClick={() => setShowFilters(true)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter
          {hasActiveFilters && <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center ml-0.5">{[filterType, filterLeadSource, filterCity, ...(filterTags.map(() => 1)), filterDateCreatedFrom, filterDateCreatedTo, filterLifetimeMin, filterLifetimeMax].filter(Boolean).length}</span>}
        </Button>

        {/* Edit Columns */}
        <Popover open={showColPicker} onOpenChange={setShowColPicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full text-sm">
              <Columns2 className="w-3.5 h-3.5" />
              Edit columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">Visible columns</div>
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                <Checkbox
                  checked={visibleCols.has(col.key)}
                  onCheckedChange={v => {
                    setVisibleCols(prev => {
                      const next = new Set(prev);
                      v ? next.add(col.key) : next.delete(col.key);
                      return next;
                    });
                  }}
                />
                {col.label}
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Create Customer */}
        <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
          <UserPlus className="w-4 h-4" />
          Create customer
        </Button>

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 rounded-full text-sm">
              Actions <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport} disabled={exportCsvMutation.isPending}>
              <Download className="w-4 h-4 mr-2" />
              {selected.size > 0 ? `Export ${selected.size} selected` : 'Export all'}
            </DropdownMenuItem>
            {selected.size === 2 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBulkMerge}>
                  <GitMerge className="w-4 h-4 mr-2" /> Merge selected
                </DropdownMenuItem>
              </>
            )}
            {selected.size > 0 && (
              <>
                <DropdownMenuSeparator />
                <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
                  <PopoverTrigger asChild>
                    <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent rounded-sm gap-2">
                      <Tag className="w-4 h-4" /> Add tag to selected
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <Input
                      className="h-8 text-sm mb-2"
                      placeholder="Tag name…"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) bulkAddTagMutation.mutate({ customerIds: Array.from(selected), tag: tagInput.trim() }); }}
                    />
                    {allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 6).map(t => (
                      <button key={t} onClick={() => bulkAddTagMutation.mutate({ customerIds: Array.from(selected), tag: t })} className="block w-full text-left px-2 py-1 text-sm hover:bg-accent rounded">{t}</button>
                    ))}
                  </PopoverContent>
                </Popover>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete selected
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden file input for CSV import */}
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
      </div>

      {/* ── Duplicates banner ── */}
      <div className="px-6 pt-3">
        <DuplicatesPanel onMerged={(sourceId) => removeCustomer(sourceId)} />
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {totalActive === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl mt-4">
            <UserPlus size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground mb-1">No customers yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first customer to get started.</p>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <UserPlus className="w-4 h-4 mr-1.5" /> Create customer
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 py-2 pr-2 text-left">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('displayName')}>
                  Display name <SortIcon active={sortBy === 'displayName'} dir={sortDir} />
                </th>
                {visibleCols.has('company') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('company')}>
                    Company <SortIcon active={sortBy === 'company'} dir={sortDir} />
                  </th>
                )}
                {visibleCols.has('address') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('city')}>
                    Address <SortIcon active={sortBy === 'city'} dir={sortDir} />
                  </th>
                )}
                {visibleCols.has('mobile') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground whitespace-nowrap">Mobile</th>
                )}
                {visibleCols.has('email') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground whitespace-nowrap">Email</th>
                )}
                {visibleCols.has('leadSource') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground whitespace-nowrap">Lead source</th>
                )}
                {visibleCols.has('notes') && (
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground whitespace-nowrap">Notes</th>
                )}
                {visibleCols.has('tags') && (
                  <th className="py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Tags</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={20} className="py-12 text-center text-sm text-muted-foreground">
                    No customers match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map(c => {
                  const displayName = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—';
                  const address = [c.street, c.city, c.state, c.zip].filter(Boolean).join(', ') || '—';
                  const tags = parseTags(c.tags);
                  const isSelected = selected.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                      onClick={() => setActiveCustomer(c.id)}
                    >
                      <td className="py-2.5 pr-2" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-foreground hover:text-primary">{displayName}</span>
                        {(c as any).addresses?.length > 1 && (
                          <Badge variant="secondary" className="ml-2 text-[10px] py-0">{(c as any).addresses.length} props</Badge>
                        )}
                      </td>
                      {visibleCols.has('company') && (
                        <td className="py-2.5 pr-4 text-muted-foreground">{c.company || '—'}</td>
                      )}
                      {visibleCols.has('address') && (
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[200px] truncate">{address}</td>
                      )}
                      {visibleCols.has('mobile') && (
                        <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{c.mobilePhone || '—'}</td>
                      )}
                      {visibleCols.has('email') && (
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[180px] truncate">{c.email || '—'}</td>
                      )}
                      {visibleCols.has('leadSource') && (
                        <td className="py-2.5 pr-4 text-muted-foreground">{c.leadSource || '—'}</td>
                      )}
                      {visibleCols.has('notes') && (
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-[160px] truncate">{c.notes || '—'}</td>
                      )}
                      {visibleCols.has('tags') && (
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] py-0">{t}</Badge>
                            ))}
                            {tags.length > 3 && <Badge variant="outline" className="text-[10px] py-0">+{tags.length - 3}</Badge>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Filter slide-over ── */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="right" className="w-80 overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between pb-4">
            <SheetTitle>Filters</SheetTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
                <X className="w-3 h-3" /> Clear all
              </Button>
            )}
          </SheetHeader>

          <div className="space-y-5">
            {/* Date created */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Date created</label>
              <div className="flex gap-2">
                <Input type="date" className="h-8 text-xs" value={filterDateCreatedFrom} onChange={e => setFilterDateCreatedFrom(e.target.value)} />
                <Input type="date" className="h-8 text-xs" value={filterDateCreatedTo} onChange={e => setFilterDateCreatedTo(e.target.value)} />
              </div>
            </div>

            {/* Lifetime value */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Lifetime value</label>
              <div className="flex items-center gap-2">
                <Input type="number" className="h-8 text-xs" placeholder="Min" value={filterLifetimeMin} onChange={e => setFilterLifetimeMin(e.target.value)} />
                <span className="text-muted-foreground text-xs">—</span>
                <Input type="number" className="h-8 text-xs" placeholder="Max" value={filterLifetimeMax} onChange={e => setFilterLifetimeMax(e.target.value)} />
              </div>
            </div>

            {/* Lead source */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Lead source</label>
              <select
                className="w-full h-8 text-xs border border-input rounded-md px-2 bg-background"
                value={filterLeadSource}
                onChange={e => setFilterLeadSource(e.target.value)}
              >
                <option value="">Choose lead source</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Customer tags */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Customer tags</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Search tags" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterTags.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer type */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Customer type</label>
              <select
                className="w-full h-8 text-xs border border-input rounded-md px-2 bg-background"
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="">All types</option>
                <option value="homeowner">Homeowner</option>
                <option value="business">Business</option>
              </select>
            </div>

            {/* City */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">City</label>
              <Input className="h-8 text-xs" placeholder="Filter by city…" value={filterCity} onChange={e => setFilterCity(e.target.value)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Import preview dialog ── */}
      <Dialog open={showImportDialog} onOpenChange={v => { if (!v) { setShowImportDialog(false); setImportRows(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Customers</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Found <strong>{importRows?.length ?? 0}</strong> row{(importRows?.length ?? 0) !== 1 ? 's' : ''} in the CSV.
            Customers will be matched by email — existing records will be updated, new ones created.
          </p>
          {importRows && importRows.length > 0 && (
            <div className="text-xs text-muted-foreground border border-border rounded p-2 max-h-32 overflow-y-auto">
              <div className="font-medium mb-1">Preview (first 5 rows):</div>
              {importRows.slice(0, 5).map((r, i) => (
                <div key={i} className="truncate">{r.displayName || r.firstName || r.email || '(unnamed)'} — {r.email || 'no email'}</div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportRows(null); }}>Cancel</Button>
            <Button onClick={handleImportConfirm} disabled={importCsvMutation.isPending}>
              {importCsvMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</> : 'Confirm Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Merge dialog ── */}
      {mergeTarget && (
        <MergeCustomerDialog
          open={!!mergeTarget}
          onOpenChange={v => { if (!v) setMergeTarget(null); }}
          customerA={mergeTarget.a}
          customerB={mergeTarget.b}
          onMerged={(sourceId) => {
            removeCustomer(sourceId);
            setSelected(new Set());
            setMergeTarget(null);
          }}
        />
      )}

      {/* ── New Customer Modal ── */}
      {showModal && (
        <NewCustomerModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
