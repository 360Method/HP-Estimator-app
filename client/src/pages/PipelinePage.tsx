// ============================================================
// PipelinePage — Global pipeline view across ALL customers
// Reads from state.customers[*].opportunities (persisted source)
// so it always shows the latest data regardless of active customer.
// ============================================================

import { useState, useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, Opportunity,
} from '@/lib/types';
import PipelineBoard from '@/components/PipelineBoard';
import { trpc } from '@/lib/trpc';
import { Star, FileText, Briefcase, TrendingUp, DollarSign, Bell, ArrowRight } from 'lucide-react';

type PipelineTab = 'lead' | 'estimate' | 'job';

const TABS: { key: PipelineTab; label: string; icon: React.ReactNode }[] = [
  { key: 'lead',     label: 'Leads',     icon: <Star size={14} /> },
  { key: 'estimate', label: 'Estimates', icon: <FileText size={14} /> },
  { key: 'job',      label: 'Jobs',      icon: <Briefcase size={14} /> },
];

function fmtDollar(n: number) {
  if (n === 0) return '$0';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function PipelinePage() {
  const {
    state,
    addOpportunity, updateOpportunity, removeOpportunity,
    convertLeadToEstimate, convertEstimateToJob, archiveJob,
    setActiveOpportunity, setActiveCustomer, setSection, navigateToTopLevel,
  } = useEstimator();

  const [activeTab, setActiveTab] = useState<PipelineTab>('lead');

  // ── Aggregate all opportunities from ALL customers ──────────
  // We read directly from state.customers[*].opportunities which is always
  // kept in sync by the reducer (ADD/UPDATE/ARCHIVE all sync back to customers).
  // We also include any opportunities in state.opportunities that don't belong
  // to a known customer (edge case: no active customer when opp was created).
  const allOpportunities = useMemo(() => {
    const seen = new Set<string>();
    const opps: (Opportunity & { customerName: string; customerId: string | null })[] = [];

    // Primary source: persisted customer records
    for (const customer of state.customers) {
      const name =
        [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
        customer.displayName ||
        'Unknown';
      for (const opp of customer.opportunities ?? []) {
        if (!seen.has(opp.id)) {
          seen.add(opp.id);
          opps.push({ ...opp, customerName: name, customerId: customer.id });
        }
      }
    }

    // Fallback: working-context opportunities not yet matched to a customer record
    for (const opp of state.opportunities) {
      if (!seen.has(opp.id)) {
        seen.add(opp.id);
        opps.push({
          ...opp,
          customerName:
            (opp as any).clientSnapshot?.client ||
            state.jobInfo.client ||
            'Unknown',
          customerId: state.activeCustomerId,
        });
      }
    }

    return opps;
  }, [state.customers, state.opportunities, state.activeCustomerId, state.jobInfo.client]);

  const tabOpps = useMemo(
    () => allOpportunities.filter(o => o.area === activeTab),
    [allOpportunities, activeTab],
  );

  // Stats per tab (active only)
  const stats = useMemo(() => {
    const result: Record<PipelineTab, { count: number; value: number }> = {
      lead:     { count: 0, value: 0 },
      estimate: { count: 0, value: 0 },
      job:      { count: 0, value: 0 },
    };
    for (const o of allOpportunities) {
      if (!o.archived) {
        result[o.area as PipelineTab].count++;
        result[o.area as PipelineTab].value += o.value;
      }
    }
    return result;
  }, [allOpportunities]);

  const stages: OpportunityStage[] =
    activeTab === 'lead' ? LEAD_STAGES :
    activeTab === 'estimate' ? ESTIMATE_STAGES :
    JOB_STAGES;

  // ── Handlers ────────────────────────────────────────────────
  const handleOpen = (id: string) => {
    const opp = allOpportunities.find(o => o.id === id);
    if (!opp) return;
    if (opp.customerId) {
      setActiveCustomer(opp.customerId);
      // Small delay to let the customer load into working state
      setTimeout(() => {
        setActiveOpportunity(id);
        setSection('opp-details');
      }, 60);
    } else {
      setActiveOpportunity(id);
      setSection('opp-details');
    }
  };

  const createOpportunityMutation = trpc.opportunities.create.useMutation({
    onError: (err) => console.warn('[PipelinePage] DB opportunity create failed (local state preserved):', err.message),
  });
  const handleAdd = (title: string, stage: OpportunityStage, value: number, notes: string, customerId?: string, customerDisplayName?: string) => {
    // If a customer was picked in the modal, switch to that customer first
    if (customerId) setActiveCustomer(customerId);
    addOpportunity({ area: activeTab, stage, title, value, notes, archived: false });
    // Persist to DB if we have a customerId
    if (customerId) {
      createOpportunityMutation.mutate({
        customerId,
        area: activeTab,
        stage,
        title,
        value,
        notes,
        archived: false,
      });
    }
  };

  const unreadQuery = trpc.booking.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const unreadCount = unreadQuery.data?.count ?? 0;

  return (
    <div className="min-h-screen bg-background">

      {/* ── New online requests banner ── */}
      {activeTab === 'lead' && unreadCount > 0 && (
        <div className="bg-blue-600 text-white px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-semibold">
                {unreadCount} new online request{unreadCount !== 1 ? 's' : ''} waiting for review
              </span>
            </div>
            <button
              onClick={() => navigateToTopLevel('requests')}
              className="flex items-center gap-1 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 transition-colors"
            >
              View Requests <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <TrendingUp size={22} className="text-primary" />
                Pipeline
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                All leads, estimates, and jobs across every customer
              </p>
            </div>
          </div>

          {/* ── Summary stat cards ── */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  activeTab === tab.key
                    ? 'border-primary/40 bg-primary/5 shadow-sm'
                    : 'border-border bg-white hover:bg-slate-50'
                }`}
              >
                <div className={`shrink-0 ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`}>
                  {tab.icon}
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{tab.label}</div>
                  <div className="text-base font-bold text-foreground">{stats[tab.key].count}</div>
                  {stats[tab.key].value > 0 && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <DollarSign size={9} />{fmtDollar(stats[tab.key].value)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div className="bg-white border-b border-border px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {stats[tab.key].count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Board ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <PipelineBoard
          area={activeTab}
          stages={stages}
          opportunities={tabOpps}
          onAdd={handleAdd}
          onUpdate={(id, payload) => updateOpportunity(id, payload)}
          onRemove={(id) => removeOpportunity(id)}
          onConvertToEstimate={activeTab === 'lead' ? (id, title, value) => convertLeadToEstimate(id, title, value) : undefined}
          onConvertToJob={activeTab === 'estimate' ? (id, title, value) => convertEstimateToJob(id, title, value) : undefined}
          onArchive={activeTab === 'job' ? (id, value) => archiveJob(id, value) : undefined}
          onOpen={handleOpen}
        />
      </div>
    </div>
  );
}
