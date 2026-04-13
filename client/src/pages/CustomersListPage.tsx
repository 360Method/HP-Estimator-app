// ============================================================
// CustomersListPage — All Customers list view
// Phases: Dedup panel, filter bar, property badges, bulk actions,
//         quick-view slide-over
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Customer } from '@/lib/types';
import { trpc } from '@/lib/trpc';
import NewCustomerModal from '@/components/NewCustomerModal';
import DuplicatesPanel from '@/components/DuplicatesPanel';
import MergeCustomerDialog from '@/components/MergeCustomerDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search, UserPlus, AlertTriangle, ChevronDown, ChevronUp,
  GitMerge, Tag, Download, Trash2, X, Building2, Home,
  MapPin, Phone, Mail, ArrowUpDown, ArrowUp, ArrowDown,
  SlidersHorizontal, Eye, Briefcase,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const LEAD_SOURCES = ['Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor', 'Yelp', 'Direct Mail', 'Repeat Customer', 'Other'];

type SortField = 'lastName' | 'city' | 'createdAt' | 'lifetimeValue';
type SortDir = 'asc' | 'desc';

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50 ml-1 inline" />;
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3 text-primary ml-1 inline" />
    : <ArrowDown className="w-3 h-3 text-primary ml-1 inline" />;
}

export default function CustomersListPage() {
  const { state, addCustomer, setActiveCustomer, updateCustomer: updateCtxCustomer } = useEstimator();
  const { customers } = state;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'homeowner' | 'business'>('all');
  const [filterLeadSource, setFilterLeadSource] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('lastName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showFilters, setShowFilters] = useState(false);

  // ── Selection state ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);

  // ── Merge state ───────────────────────────────────────────────────────────
  const [mergeTarget, setMergeTarget] = useState<{ a: Customer; b: Customer } | null>(null);

  // ── Quick-view slide-over ─────────────────────────────────────────────────
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const quickViewCustomer = useMemo(() => customers.find(c => c.id === quickViewId) ?? null, [customers, quickViewId]);

  // ── Bulk tag popover ──────────────────────────────────────────────────────
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (showTagPopover) tagInputRef.current?.focus(); }, [showTagPopover]);

  // ── Collect all tags from customers for filter suggestions ────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => {
      const tags = Array.isArray(c.tags) ? c.tags : (c.tags ? JSON.parse(c.tags as unknown as string) : []);
      tags.forEach((t: string) => set.add(t));
    });
    return Array.from(set).sort();
  }, [customers]);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = customers.filter(c => !(c as any).mergedIntoId);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.displayName.toLowerCase().includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.mobilePhone.includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      list = list.filter(c => c.customerType === filterType);
    }
    if (filterLeadSource) {
      list = list.filter(c => c.leadSource === filterLeadSource);
    }
    if (filterTags.length > 0) {
      list = list.filter(c => {
        const cTags: string[] = Array.isArray(c.tags) ? c.tags : (c.tags ? JSON.parse(c.tags as unknown as string) : []);
        return filterTags.every(t => cTags.includes(t));
      });
    }
    if (filterCity) {
      list = list.filter(c => c.city.toLowerCase().includes(filterCity.toLowerCase()));
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortBy === 'lastName') { av = a.lastName.toLowerCase(); bv = b.lastName.toLowerCase(); }
      else if (sortBy === 'city') { av = a.city.toLowerCase(); bv = b.city.toLowerCase(); }
      else if (sortBy === 'createdAt') { av = a.createdAt ?? ''; bv = b.createdAt ?? ''; }
      else if (sortBy === 'lifetimeValue') { av = a.lifetimeValue ?? 0; bv = b.lifetimeValue ?? 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [customers, searchQuery, filterType, filterLeadSource, filterTags, filterCity, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const toggleSelect = (id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));
  };

  const handleCreated = (customer: Customer) => {
    addCustomer(customer);
    setShowModal(false);
    setActiveCustomer(customer.id);
  };

  const formatAddress = (c: Customer) => {
    const parts = [c.street, c.city && c.state ? `${c.city}, ${c.state} ${c.zip}`.trim() : c.city].filter(Boolean);
    return parts.join(', ');
  };

  const getCustomerTags = (c: Customer): string[] => {
    if (!c.tags) return [];
    return Array.isArray(c.tags) ? c.tags : JSON.parse(c.tags as unknown as string);
  };

  const getAddressCount = (c: Customer): number => {
    return c.addresses?.length ?? 0;
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const bulkAddTagMutation = trpc.customers.bulkAddTag.useMutation({
    onSuccess: () => {
      toast({ title: 'Tag added', description: `Tag added to ${selected.size} customer(s).` });
      utils.customers.list.invalidate();
      setShowTagPopover(false);
      setTagInput('');
    },
    onError: (e) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const bulkDeleteMutation = trpc.customers.bulkDelete.useMutation({
    onSuccess: (res) => {
      toast({
        title: `Deleted ${res.deleted.length} customer(s)`,
        description: res.skipped.length > 0 ? `${res.skipped.length} skipped (have linked jobs/estimates).` : undefined,
      });
      utils.customers.listWithOpportunities.invalidate();
      setSelected(new Set());
    },
    onError: (e) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
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
      toast({ title: 'CSV exported' });
    },
    onError: (e) => toast({ title: 'Export failed', description: e.message, variant: 'destructive' }),
  });

  const handleBulkMerge = () => {
    const ids = Array.from(selected);
    if (ids.length !== 2) {
      toast({ title: 'Select exactly 2 customers to merge', variant: 'destructive' });
      return;
    }
    const a = customers.find(c => c.id === ids[0]);
    const b = customers.find(c => c.id === ids[1]);
    if (a && b) setMergeTarget({ a, b });
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selected.size} customer(s)? Customers with jobs or estimates will be skipped.`)) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selected) });
  };

  const hasActiveFilters = filterType !== 'all' || filterLeadSource || filterTags.length > 0 || filterCity;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Page header ── */}
      <div className="bg-white border-b border-border px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <nav className="text-xs text-muted-foreground mb-1">Customers › All Customers</nav>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">All Customers</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {filtered.length} of {customers.filter(c => !(c as any).mergedIntoId).length} record{customers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
            >
              <UserPlus size={15} />
              Create customer
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-border px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search customers…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Type pills */}
          <div className="flex items-center gap-1">
            {(['all', 'homeowner', 'business'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filterType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t === 'homeowner' && <Home className="w-3 h-3" />}
                {t === 'business' && <Building2 className="w-3 h-3" />}
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* More filters toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
              hasActiveFilters
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <SlidersHorizontal size={13} />
            Filters
            {hasActiveFilters && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>

          <div className="flex-1" />

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>

              {/* Merge (2 only) */}
              {selected.size === 2 && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleBulkMerge}>
                  <GitMerge className="w-3 h-3" /> Merge
                </Button>
              )}

              {/* Add tag */}
              <div className="relative">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowTagPopover(v => !v)}>
                  <Tag className="w-3 h-3" /> Add tag
                </Button>
                {showTagPopover && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg p-3 w-56">
                    <p className="text-xs font-medium mb-2">Add tag to {selected.size} customer(s)</p>
                    <input
                      ref={tagInputRef}
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          bulkAddTagMutation.mutate({ customerIds: Array.from(selected), tag: tagInput.trim() });
                        }
                        if (e.key === 'Escape') setShowTagPopover(false);
                      }}
                      placeholder="Type tag name…"
                      className="w-full px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {allTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 8).map(t => (
                          <button
                            key={t}
                            onClick={() => bulkAddTagMutation.mutate({ customerIds: Array.from(selected), tag: t })}
                            className="px-1.5 py-0.5 bg-muted rounded text-[10px] hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowTagPopover(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        disabled={!tagInput.trim() || bulkAddTagMutation.isPending}
                        onClick={() => bulkAddTagMutation.mutate({ customerIds: Array.from(selected), tag: tagInput.trim() })}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Export CSV */}
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                onClick={() => exportCsvMutation.mutate({ ids: Array.from(selected) })}
                disabled={exportCsvMutation.isPending}
              >
                <Download className="w-3 h-3" /> Export
              </Button>

              {/* Delete */}
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600 hover:bg-red-50 hover:border-red-300"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="w-3 h-3" /> Delete
              </Button>

              <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── Expanded filters ── */}
        {showFilters && (
          <div className="max-w-6xl mx-auto mt-3 flex flex-wrap gap-3 pt-3 border-t border-border">
            {/* Lead source */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lead Source</label>
              <select
                value={filterLeadSource}
                onChange={e => setFilterLeadSource(e.target.value)}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-ring min-w-[140px]"
              >
                <option value="">All sources</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* City */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">City</label>
              <input
                value={filterCity}
                onChange={e => setFilterCity(e.target.value)}
                placeholder="Filter by city…"
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-ring min-w-[140px]"
              />
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</label>
              <div className="flex flex-wrap gap-1 items-center">
                {filterTags.map(t => (
                  <span key={t} className="flex items-center gap-0.5 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[11px] font-medium">
                    {t}
                    <button onClick={() => setFilterTags(prev => prev.filter(x => x !== t))}><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
                {allTags.filter(t => !filterTags.includes(t)).length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded-full px-2 py-0.5">
                        + Add tag filter
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto">
                      {allTags.filter(t => !filterTags.includes(t)).map(t => (
                        <DropdownMenuItem key={t} onClick={() => setFilterTags(prev => [...prev, t])}>
                          {t}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={() => { setFilterType('all'); setFilterLeadSource(''); setFilterTags([]); setFilterCity(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-6 py-4">

        {/* Duplicates panel */}
        <DuplicatesPanel onMerged={() => utils.customers.listWithOpportunities.invalidate()} />

        {customers.filter(c => !(c as any).mergedIntoId).length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <UserPlus size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground mb-1">No customers yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first customer to get started.</p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <UserPlus size={14} /> Create customer
            </button>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort('lastName')} className="flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                      Name <SortIcon field="lastName" active={sortBy === 'lastName'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <button onClick={() => toggleSort('city')} className="flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                      Address <SortIcon field="city" active={sortBy === 'city'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden xl:table-cell">
                    <button onClick={() => toggleSort('lifetimeValue')} className="flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                      Value <SortIcon field="lifetimeValue" active={sortBy === 'lifetimeValue'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No customers match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(customer => {
                    const tags = getCustomerTags(customer);
                    const addrCount = getAddressCount(customer);
                    return (
                      <tr
                        key={customer.id}
                        className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selected.has(customer.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => setActiveCustomer(customer.id)}
                      >
                        <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(customer.id); }}>
                          <input
                            type="checkbox"
                            checked={selected.has(customer.id)}
                            onChange={() => toggleSelect(customer.id)}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'}
                            </span>
                            {customer.doNotService && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded">
                                <AlertTriangle size={9} /> DNS
                              </span>
                            )}
                            {customer.customerType === 'business' && (
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                            )}
                            {addrCount > 1 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-semibold rounded border border-blue-200">
                                <MapPin size={8} /> {addrCount} properties
                              </span>
                            )}
                            {tags.slice(0, 2).map(t => (
                              <span key={t} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded">
                                {t}
                              </span>
                            ))}
                            {tags.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">
                          {customer.company || '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                          {customer.street ? formatAddress(customer) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                          <div>{customer.mobilePhone || '—'}</div>
                          {customer.email && <div className="text-[11px] truncate max-w-[160px]">{customer.email}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell text-xs">
                          {customer.lifetimeValue > 0 ? `$${customer.lifetimeValue.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setQuickViewId(customer.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                            title="Quick view"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick-view slide-over ── */}
      {quickViewCustomer && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setQuickViewId(null)}>
          <div
            className="relative w-full max-w-sm bg-white shadow-2xl border-l border-border h-full overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">
                  {quickViewCustomer.displayName || `${quickViewCustomer.firstName} ${quickViewCustomer.lastName}`.trim()}
                </div>
                {quickViewCustomer.company && <div className="text-xs text-muted-foreground">{quickViewCustomer.company}</div>}
              </div>
              <button onClick={() => setQuickViewId(null)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Contact */}
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contact</h4>
                <div className="space-y-1.5">
                  {quickViewCustomer.mobilePhone && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{quickViewCustomer.mobilePhone}</span>
                    </div>
                  )}
                  {quickViewCustomer.email && (
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{quickViewCustomer.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Addresses */}
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Properties ({(quickViewCustomer.addresses?.length ?? 0) + (quickViewCustomer.street ? 1 : 0)})
                </h4>
                <div className="space-y-1.5">
                  {quickViewCustomer.street && (
                    <div className="flex items-start gap-2 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{[quickViewCustomer.street, quickViewCustomer.city, quickViewCustomer.state].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {quickViewCustomer.addresses?.map(addr => (
                    <div key={addr.id} className="flex items-start gap-2 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">{addr.label}</div>
                        <div className="text-muted-foreground">{[addr.street, addr.city, addr.state].filter(Boolean).join(', ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-foreground">
                    {quickViewCustomer.opportunities?.length ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Open jobs</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-foreground">
                    {quickViewCustomer.outstandingBalance > 0 ? `$${quickViewCustomer.outstandingBalance.toLocaleString()}` : '$0'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Outstanding</div>
                </div>
              </div>

              {/* Tags */}
              {getCustomerTags(quickViewCustomer).length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {getCustomerTags(quickViewCustomer).map(t => (
                      <span key={t} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => { setActiveCustomer(quickViewCustomer.id); setQuickViewId(null); }}
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Open Full Profile
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={() => { setActiveCustomer(quickViewCustomer.id); setQuickViewId(null); }}
                >
                  <Briefcase className="w-3.5 h-3.5 mr-1.5" /> New Lead
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge dialog ── */}
      {mergeTarget && (
        <MergeCustomerDialog
          open={!!mergeTarget}
          onOpenChange={v => { if (!v) setMergeTarget(null); }}
          customerA={mergeTarget.a}
          customerB={mergeTarget.b}
          onMerged={() => {
            utils.customers.listWithOpportunities.invalidate();
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
