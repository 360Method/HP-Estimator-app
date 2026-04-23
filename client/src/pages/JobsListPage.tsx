// ============================================================
// JobsListPage — "All Jobs" global pipeline view
// Design: HP Industrial — mobile-first, clean white table
//
// Shows every opportunity with area='job' across ALL customers
// in one searchable, filterable table. Clicking a row opens
// that customer's profile and navigates to the job opportunity.
//
// Columns: Customer / Job Title / Stage / Value / Type / Created
// ============================================================

import { useState, useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Opportunity, Customer, JobStage, JOB_STAGES } from '@/lib/types';
import {
  Search, Filter, Briefcase, ChevronDown, Plus,
  ArrowUpDown, CheckCircle2, Clock, AlertCircle, RefreshCw, MapPin,
} from 'lucide-react';

// ── Stage badge color map (mirrors CustomerSection) ──────────
const STAGE_COLORS: Record<string, string> = {
  'New Job':                  'bg-blue-100 text-blue-800',
  'Deposit Needed':           'bg-amber-100 text-amber-800',
  'Deposit Collected':        'bg-amber-100 text-amber-700',
  'Need to Order Materials':  'bg-orange-100 text-orange-800',
  'Waiting on Materials':     'bg-orange-100 text-orange-700',
  'Materials Received':       'bg-yellow-100 text-yellow-800',
  'Unscheduled':              'bg-slate-100 text-slate-700',
  'Scheduled':                'bg-sky-100 text-sky-800',
  'In Progress':              'bg-indigo-100 text-indigo-800',
  'Completed':                'bg-emerald-100 text-emerald-800',
  'Awaiting Sign-Off':        'bg-rose-100 text-rose-800',
  'Invoice Sent':             'bg-violet-100 text-violet-800',
  'Invoice Paid':             'bg-green-100 text-green-800',
};

const STAGE_GROUPS: { label: string; stages: JobStage[]; color: string }[] = [
  {
    label: 'Active',
    stages: ['New Job', 'Deposit Needed', 'Deposit Collected', 'Need to Order Materials', 'Waiting on Materials', 'Materials Received'],
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    label: 'Scheduled',
    stages: ['Unscheduled', 'Scheduled', 'In Progress'],
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    label: 'Invoicing',
    stages: ['Completed', 'Invoice Sent', 'Invoice Paid'],
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

function fmtDollar(n: number) {
  return n === 0 ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Flattened job row combining opportunity + owning customer
interface JobRow {
  opp: Opportunity;
  customer: Customer | null;
  customerName: string;
}

type SortField = 'customer' | 'title' | 'stage' | 'value' | 'created';
type SortDir = 'asc' | 'desc';

const STAGE_FILTER_OPTIONS = ['All Stages', ...JOB_STAGES];

export default function JobsListPage() {
  const { state, setActiveCustomer, setActiveOpportunity, setSection } = useEstimator();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All Stages');
  const [only360, setOnly360] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');

  // Flatten all job opportunities from all customers
  const allJobs = useMemo<JobRow[]>(() => {
    const rows: JobRow[] = [];

    // Jobs from customers array (authoritative source)
    state.customers.forEach(customer => {
      const opps = customer.opportunities || [];
      opps.forEach(opp => {
        if (opp.area === 'job') {
          rows.push({
            opp,
            customer,
            customerName: customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unknown',
          });
        }
      });
    });

    // Also include jobs from the current working opportunities (if no active customer or they haven't been synced)
    if (!state.activeCustomerId) {
      state.opportunities.forEach(opp => {
        if (opp.area === 'job') {
          const alreadyIncluded = rows.some(r => r.opp.id === opp.id);
          if (!alreadyIncluded) {
            rows.push({
              opp,
              customer: null,
              customerName: opp.clientSnapshot?.client || 'Unknown',
            });
          }
        }
      });
    }

    return rows;
  }, [state.customers, state.opportunities, state.activeCustomerId]);

  // Filter
  const filtered = useMemo(() => {
    return allJobs.filter(row => {
      if (!showArchived && row.opp.archived) return false;
      if (stageFilter !== 'All Stages' && row.opp.stage !== stageFilter) return false;
      if (only360 && !(row.opp as any).membershipId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCustomer = row.customerName.toLowerCase().includes(q);
        const matchesTitle = row.opp.title.toLowerCase().includes(q);
        const matchesStage = row.opp.stage.toLowerCase().includes(q);
        const matchesAddress = (row.opp.clientSnapshot?.address || '').toLowerCase().includes(q);
        const matchesType = (row.opp.clientSnapshot?.jobType || '').toLowerCase().includes(q);
        if (!matchesCustomer && !matchesTitle && !matchesStage && !matchesAddress && !matchesType) return false;
      }
      return true;
    });
  }, [allJobs, searchQuery, stageFilter, showArchived]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'customer': cmp = a.customerName.localeCompare(b.customerName); break;
        case 'title':    cmp = a.opp.title.localeCompare(b.opp.title); break;
        case 'stage':    cmp = a.opp.stage.localeCompare(b.opp.stage); break;
        case 'value':    cmp = a.opp.value - b.opp.value; break;
        case 'created':  cmp = new Date(a.opp.createdAt).getTime() - new Date(b.opp.createdAt).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleOpenJob = (row: JobRow) => {
    if (row.customer) {
      setActiveCustomer(row.customer.id);
      // After customer loads, open the opportunity
      setTimeout(() => {
        setActiveOpportunity(row.opp.id);
        setSection('opp-details');
      }, 50);
    } else {
      // Fallback: just open the opportunity in current context
      setActiveOpportunity(row.opp.id);
      setSection('opp-details');
    }
  };

  // Stats
  const totalValue = allJobs.filter(r => !r.opp.archived).reduce((s, r) => s + r.opp.value, 0);
  const activeCount = allJobs.filter(r => !r.opp.archived && r.opp.stage !== 'Invoice Paid').length;
  const completedCount = allJobs.filter(r => r.opp.stage === 'Invoice Paid').length;
  const inProgressCount = allJobs.filter(r => r.opp.stage === 'In Progress').length;

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      size={11}
      className={`inline ml-1 ${sortField === field ? 'text-primary' : 'text-muted-foreground/40'}`}
    />
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── Page header ── */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <nav className="text-xs text-muted-foreground mb-1">
            Jobs &rsaquo; All Jobs
          </nav>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground">All Jobs</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {allJobs.filter(r => !r.opp.archived).length} active job{allJobs.filter(r => !r.opp.archived).length !== 1 ? 's' : ''} across all customers
              </p>
            </div>
          </div>

          {/* ── Quick stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatCard
              label="Pipeline Value"
              value={fmtDollar(totalValue)}
              icon={<Briefcase size={14} className="text-primary" />}
              color="bg-primary/5"
            />
            <StatCard
              label="Active Jobs"
              value={String(activeCount)}
              icon={<Clock size={14} className="text-amber-600" />}
              color="bg-amber-50"
            />
            <StatCard
              label="In Progress"
              value={String(inProgressCount)}
              icon={<AlertCircle size={14} className="text-indigo-600" />}
              color="bg-indigo-50"
            />
            <StatCard
              label="Completed"
              value={String(completedCount)}
              icon={<CheckCircle2 size={14} className="text-emerald-600" />}
              color="bg-emerald-50"
            />
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search jobs, customers…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Stage filter */}
          <div className="relative">
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-border rounded-lg bg-white hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
            >
              {STAGE_FILTER_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* 360° filter toggle */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={only360}
              onChange={e => setOnly360(e.target.checked)}
              className="accent-primary"
            />
            <RefreshCw size={12} className="text-emerald-600" />
            360° only
          </label>

          {/* Show archived toggle */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Show archived
          </label>

          <div className="flex-1" />

          {/* Result count */}
          <span className="text-xs text-muted-foreground shrink-0">
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {allJobs.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <Briefcase size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground mb-1">No jobs yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Jobs are created when you convert an estimate to a job from a customer profile.
              Start by creating a customer, adding a lead, and converting it through the pipeline.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          /* No results */
          <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
            <Search size={28} className="mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-sm font-semibold text-foreground mb-1">No jobs match your filters</h3>
            <p className="text-xs text-muted-foreground">Try adjusting the search or stage filter.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('customer')}
                  >
                    Customer <SortIcon field="customer" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none hidden sm:table-cell"
                    onClick={() => handleSort('title')}
                  >
                    Job Title <SortIcon field="title" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('stage')}
                  >
                    Stage <SortIcon field="stage" />
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none hidden md:table-cell"
                    onClick={() => handleSort('value')}
                  >
                    Value <SortIcon field="value" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell"
                  >
                    Job Type
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none hidden xl:table-cell"
                    onClick={() => handleSort('created')}
                  >
                    Created <SortIcon field="created" />
                  </th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map(row => (
                  <tr
                    key={row.opp.id}
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => handleOpenJob(row)}
                  >
                    {/* Customer */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {row.customerName}
                      </div>
                      {row.opp.clientSnapshot?.address && (
                        <div className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                          {row.opp.clientSnapshot.address}
                          {row.opp.clientSnapshot.city ? `, ${row.opp.clientSnapshot.city}` : ''}
                        </div>
                      )}
                      {/* Show title on mobile (hidden on sm+) */}
                      <div className="text-xs text-muted-foreground mt-0.5 sm:hidden">
                        {row.opp.title}
                      </div>
                    </td>

                    {/* Job Title */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-foreground font-medium">{row.opp.title}</span>
                        {(row.opp as any).membershipId && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[9px] font-bold cursor-pointer hover:bg-emerald-100 transition-colors"
                            title="360° Membership job — click to view membership"
                            onClick={e => {
                              e.stopPropagation();
                              if (row.customer) {
                                setActiveCustomer(row.customer.id);
                                setTimeout(() => {
                                  const el = document.querySelector('[data-tab="membership360"]') as HTMLElement | null;
                                  el?.click();
                                }, 150);
                              }
                            }}
                          >
                            <RefreshCw size={8} />
                            360° Member
                          </span>
                        )}
                      </div>
                      {(row.opp as any).propertyId && (
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
                          <MapPin size={9} />
                          <span>{row.opp.clientSnapshot?.address || `Property #${(row.opp as any).propertyId}`}</span>
                        </div>
                      )}
                      {row.opp.archived && (
                        <span className="text-[10px] text-muted-foreground">(archived)</span>
                      )}
                      {row.opp.sentAt && (
                        <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 rounded-full text-[9px] font-semibold">
                          ✉️ Sent {new Date(row.opp.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAGE_COLORS[row.opp.stage] || 'bg-slate-100 text-slate-700'}`}>
                        {row.opp.stage}
                      </span>
                    </td>

                    {/* Value */}
                    <td className="px-4 py-3 text-right font-mono text-sm hidden md:table-cell">
                      {row.opp.value > 0 ? (
                        <span className="font-semibold text-foreground">{fmtDollar(row.opp.value)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Job Type */}
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                      {row.opp.clientSnapshot?.jobType || '—'}
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden xl:table-cell">
                      {fmtDate(row.opp.createdAt)}
                    </td>

                    {/* Open button */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); handleOpenJob(row); }}
                        className="px-2.5 py-1 text-[11px] font-semibold border border-border rounded-md text-muted-foreground hover:text-primary hover:border-primary transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Stage breakdown cards (below table) ── */}
        {allJobs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Pipeline by Stage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STAGE_GROUPS.map(group => {
                const groupJobs = allJobs.filter(r => !r.opp.archived && group.stages.includes(r.opp.stage as JobStage));
                const groupValue = groupJobs.reduce((s, r) => s + r.opp.value, 0);
                return (
                  <div key={group.label} className={`border rounded-xl p-4 ${group.color}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">{group.label}</span>
                      <span className="text-xs font-semibold">{groupJobs.length} job{groupJobs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="text-lg font-bold">{fmtDollar(groupValue)}</div>
                    <div className="mt-2 space-y-1">
                      {group.stages.map(stage => {
                        const count = allJobs.filter(r => !r.opp.archived && r.opp.stage === stage).length;
                        if (count === 0) return null;
                        return (
                          <button
                            key={stage}
                            onClick={() => setStageFilter(stage)}
                            className="flex items-center justify-between w-full text-xs hover:opacity-70 transition-opacity"
                          >
                            <span className="truncate">{stage}</span>
                            <span className="font-semibold ml-2 shrink-0">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className={`${color} rounded-xl px-4 py-3 flex items-center gap-3`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-base font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}
