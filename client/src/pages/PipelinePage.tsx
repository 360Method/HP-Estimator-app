// ============================================================
// PipelinePage — Global pipeline view across ALL customers
// Shows Leads / Estimates / Jobs tabs, each with the
// shared PipelineBoard (Kanban + Table views)
// ============================================================

import { useState, useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, Opportunity,
} from '@/lib/types';
import PipelineBoard from '@/components/PipelineBoard';
import { Star, FileText, Briefcase, TrendingUp, DollarSign } from 'lucide-react';

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
    setActiveOpportunity, setActiveCustomer, setSection,
  } = useEstimator();

  const [activeTab, setActiveTab] = useState<PipelineTab>('lead');

  // Aggregate all opportunities from all customers + current working context
  const allOpportunities = useMemo(() => {
    const seen = new Set<string>();
    const opps: (Opportunity & { customerName: string; customerId: string | null })[] = [];

    // From customers list
    state.customers.forEach(customer => {
      const name = customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unknown';
      (customer.opportunities || []).forEach(opp => {
        if (!seen.has(opp.id)) {
          seen.add(opp.id);
          opps.push({ ...opp, customerName: name, customerId: customer.id });
        }
      });
    });

    // From current working context (if no active customer)
    state.opportunities.forEach(opp => {
      if (!seen.has(opp.id)) {
        seen.add(opp.id);
        opps.push({
          ...opp,
          customerName: opp.clientSnapshot?.client || state.jobInfo.client || 'Unknown',
          customerId: state.activeCustomerId,
        });
      }
    });

    return opps;
  }, [state.customers, state.opportunities, state.activeCustomerId, state.jobInfo.client]);

  const tabOpps = useMemo(
    () => allOpportunities.filter(o => o.area === activeTab),
    [allOpportunities, activeTab],
  );

  // Stats per tab
  const stats = useMemo(() => {
    const result: Record<PipelineTab, { count: number; value: number }> = {
      lead:     { count: 0, value: 0 },
      estimate: { count: 0, value: 0 },
      job:      { count: 0, value: 0 },
    };
    allOpportunities.forEach(o => {
      if (!o.archived) {
        result[o.area as PipelineTab].count++;
        result[o.area as PipelineTab].value += o.value;
      }
    });
    return result;
  }, [allOpportunities]);

  const stages: OpportunityStage[] =
    activeTab === 'lead' ? LEAD_STAGES :
    activeTab === 'estimate' ? ESTIMATE_STAGES :
    JOB_STAGES;

  // Handlers — route to correct customer context
  const handleOpen = (id: string) => {
    const opp = allOpportunities.find(o => o.id === id);
    if (!opp) return;
    if (opp.customerId) {
      setActiveCustomer(opp.customerId);
      setTimeout(() => {
        setActiveOpportunity(id);
        if (opp.area === 'job') setSection('job-details');
        else setSection('sales');
      }, 50);
    } else {
      setActiveOpportunity(id);
      if (opp.area === 'job') setSection('job-details');
      else setSection('sales');
    }
  };

  const handleUpdate = (id: string, payload: Partial<Opportunity>) => {
    updateOpportunity(id, payload);
  };

  const handleRemove = (id: string) => {
    removeOpportunity(id);
  };

  const handleAdd = (title: string, stage: OpportunityStage, value: number, notes: string) => {
    addOpportunity({ area: activeTab, stage, title, value, notes, archived: false });
  };

  const handleConvertToEstimate = (id: string, title: string, value: number) => {
    convertLeadToEstimate(id, title, value);
  };

  const handleConvertToJob = (id: string, title: string, value: number) => {
    convertEstimateToJob(id, title, value);
  };

  const handleArchive = (id: string, value: number) => {
    archiveJob(id, value);
  };

  // Build a lookup for customer names to pass to PipelineBoard
  const customerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    allOpportunities.forEach(o => { map[o.id] = o.customerName; });
    return map;
  }, [allOpportunities]);

  // Enrich opportunities with customer name for display
  const enrichedOpps: Opportunity[] = tabOpps;

  return (
    <div className="min-h-screen bg-background">

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

          {/* ── Summary stats ── */}
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
          opportunities={enrichedOpps}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          onConvertToEstimate={activeTab === 'lead' ? handleConvertToEstimate : undefined}
          onConvertToJob={activeTab === 'estimate' ? handleConvertToJob : undefined}
          onArchive={activeTab === 'job' ? handleArchive : undefined}
          onOpen={handleOpen}
        />
      </div>
    </div>
  );
}
