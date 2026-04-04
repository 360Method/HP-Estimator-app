// ============================================================
// MetricsBar — App header + slim metrics context bar
// Design: Full app header with logo, search, and backend nav
//         icons (placeholders for future backend modules).
//
// Navigation logic:
//   - When activeOpportunityId is null → user is on the
//     customer profile. Only the "Customer Info" tab is shown
//     (no Sales/Calculator/Estimate tabs).
//   - When activeOpportunityId is set → user is inside an
//     opportunity / estimate builder. All 4 tabs are shown
//     plus a breadcrumb "← Back to Profile" button.
// ============================================================

import { useState, useRef } from 'react';
import { fmtDollar, fmtPct, getMarginFlag, TotalsResult } from '@/lib/calc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { AppSection, Customer } from '@/lib/types';
import { toast } from 'sonner';
import NewCustomerModal from '@/components/NewCustomerModal';
import NewMenu, { NewMenuAction } from '@/components/NewMenu';
import NewJobModal from '@/components/intakes/NewJobModal';
import NewRecurringJobModal from '@/components/intakes/NewRecurringJobModal';
import NewEstimateModal from '@/components/intakes/NewEstimateModal';
import NewEventModal from '@/components/intakes/NewEventModal';
import NewIntakeModal from '@/components/intakes/NewIntakeModal';
import NewLeadModal from '@/components/intakes/NewLeadModal';
import {
  Search, LayoutDashboard, Users, Inbox, GitBranch,
  DollarSign, BarChart2, Megaphone, Settings, UserCircle,
  ChevronDown, ArrowLeft, Plus,
} from 'lucide-react';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

interface MetricsBarProps {
  totals: TotalsResult;
}

// All 4 estimator section tabs (only shown when inside an opportunity)
const BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'sales',      icon: '🛍', label: 'Sales View',   shortLabel: 'Sales'    },
  { id: 'calculator', icon: '🧮', label: 'Calculator',   shortLabel: 'Calc'     },
  { id: 'estimate',   icon: '📄', label: 'Estimate',     shortLabel: 'Estimate' },
];

// Backend module nav items — placeholders for future backend
const BACKEND_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard'  },
  { icon: Users,           label: 'Customers'  },
  { icon: Inbox,           label: 'Inbox'      },
  { icon: GitBranch,       label: 'Pipeline'   },
  { icon: DollarSign,      label: 'Financials' },
  { icon: BarChart2,       label: 'Reporting'  },
  { icon: Megaphone,       label: 'Marketing'  },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, setActiveOpportunity, setActiveCustomer, addCustomer, reset } = useEstimator();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<NewMenuAction | null>(null);
  const newBtnRef = useRef<HTMLDivElement>(null);

  const handleNewMenuSelect = (action: NewMenuAction) => {
    setShowNewMenu(false);
    setActiveModal(action);
  };

  const handleNewCustomerCreated = (customer: Customer) => {
    addCustomer(customer);
    setActiveModal(null);
    setActiveCustomer(customer.id);
  };

  const closeModal = () => setActiveModal(null);

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);

  // Are we inside an opportunity / estimate builder?
  const insideOpportunity = !!state.activeOpportunityId;

  // Find the active opportunity for the breadcrumb label
  const activeOpp = insideOpportunity
    ? state.opportunities.find(o => o.id === state.activeOpportunityId)
    : null;

  // Hide internal cost data on customer-facing screens
  const isCustomerFacing = state.activeSection === 'sales' || state.activeSection === 'estimate';

  const gmColor = {
    empty: 'text-muted-foreground',
    ok:    'text-emerald-600',
    warn:  'text-amber-600',
    bad:   'text-red-600',
  }[gmFlag];

  const handleReset = () => {
    if (window.confirm('Clear all estimate data and start fresh?')) {
      reset();
      toast.success('Estimate cleared — ready for a new job');
    }
  };

  const handleBackendNav = (label: string) => {
    toast.info(`${label} — coming soon`, { description: 'This module is part of the upcoming HP backend.' });
  };

  const handleBackToProfile = () => {
    setActiveOpportunity(null);
    // activeSection resets to 'customer' automatically in the reducer
  };

  const handleGoToCustomers = () => {
    setSection('customers');
    setActiveOpportunity(null);
    setActiveCustomer(null);
  };

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-border shadow-sm no-print">

      {/* ── TOP APP HEADER ─────────────────────────────────────── */}
      <div className="container">
        <div className="flex items-center gap-3 h-14">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-2.5 shrink-0 mr-2">
            <img src={HP_LOGO} alt="Handy Pioneers" className="w-8 h-8 object-contain rounded" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-bold text-foreground leading-tight">Field Estimator</div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden sm:block" />

          {/* Search bar */}
          <div className="flex-1 max-w-xs relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search estimates, clients…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Backend module nav icons */}
          <nav className="hidden md:flex items-center gap-0.5">
            {BACKEND_NAV.map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => label === 'Customers' ? handleGoToCustomers() : handleBackendNav(label)}
                title={label}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-colors group ${
                  label === 'Customers' && state.activeSection === 'customers'
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-semibold leading-none opacity-0 group-hover:opacity-100 transition-opacity absolute mt-8 bg-foreground text-background px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none">
                  {label}
                </span>
              </button>
            ))}
          </nav>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden md:block" />

          {/* Settings + My Account */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleBackendNav('Settings')}
              title="Settings"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleBackendNav('My Account')}
              title="My Account"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <UserCircle className="w-5 h-5" />
              <ChevronDown className="w-3 h-3 hidden sm:block" />
            </button>
          </div>

          {/* New button + dropdown */}
          <div ref={newBtnRef} className="relative shrink-0">
            <button
              onClick={() => setShowNewMenu(v => !v)}
              className="flex items-center gap-1.5 text-[12px] font-bold bg-foreground text-background hover:bg-foreground/80 px-3.5 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
            {showNewMenu && (
              <NewMenu
                onSelect={handleNewMenuSelect}
                onClose={() => setShowNewMenu(false)}
              />
            )}
          </div>

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 px-2.5 py-1 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── SLIM METRICS CONTEXT BAR ───────────────────────────── */}
      {/* Only visible when inside an opportunity, on internal screens, with data */}
      {insideOpportunity && !isCustomerFacing && totalPrice > 0 && (
        <div className="bg-slate-50 border-t border-border">
          <div className="container">
            <div className="flex items-center gap-5 py-1.5 text-xs overflow-x-auto">
              <span className="text-muted-foreground shrink-0">This estimate:</span>
              <MetricPill label="Hard Cost" value={fmtDollar(totalHard)} sub="internal" />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Customer Price" value={fmtDollar(totalPrice)} sub="all phases" bold />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill
                label="GM"
                value={fmtPct(totalGM)}
                sub={totalGM >= minGM - 0.001 ? `${Math.round(minGM * 100)}% floor ✓` : `${Math.round(minGM * 100)}% floor ✗`}
                valueClass={gmColor}
              />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Gross Profit" value={fmtDollar(totalGP)} sub="price − cost" />
            </div>
          </div>
        </div>
      )}

      {/* ── Intake Modals ── */}
      {activeModal === 'customer'      && <NewCustomerModal onClose={closeModal} onCreated={handleNewCustomerCreated} />}
      {activeModal === 'job'           && <NewJobModal onClose={closeModal} />}
      {activeModal === 'recurring-job' && <NewRecurringJobModal onClose={closeModal} />}
      {activeModal === 'estimate'      && <NewEstimateModal onClose={closeModal} />}
      {activeModal === 'event'         && <NewEventModal onClose={closeModal} />}
      {activeModal === 'intake'        && <NewIntakeModal onClose={closeModal} />}
      {activeModal === 'lead'          && <NewLeadModal onClose={closeModal} />}

      {/* ── NAVIGATION BAR ─────────────────────────────────────── */}
      <div className="border-t border-border bg-white">
        <div className="container">
          {insideOpportunity ? (
            /* ── Estimate builder tabs (inside an opportunity) ── */
            <div className="flex items-stretch -mx-4 px-0">
              {/* Back to profile button */}
              <button
                onClick={handleBackToProfile}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {state.jobInfo.client ? state.jobInfo.client : 'Profile'}
                </span>
                <span className="sm:hidden">Back</span>
              </button>

              {/* Divider */}
              <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>

              {/* Opportunity name (non-clickable breadcrumb) */}
              <div className="flex items-center px-2 py-2 text-[11px] font-semibold text-foreground truncate max-w-[120px] sm:max-w-xs">
                {activeOpp?.title ?? 'Opportunity'}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Builder section tabs */}
              {BUILDER_TABS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-3 sm:px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors min-w-0 ${
                    state.activeSection === item.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-sm leading-none">{item.icon}</span>
                  <span className="leading-none hidden sm:inline">{item.label}</span>
                  <span className="leading-none sm:hidden">{item.shortLabel}</span>
                </button>
              ))}
            </div>
          ) : state.activeSection === 'customers' ? (
            /* ── Customers list nav ── */
            <div className="flex items-center -mx-4 px-4 py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">👥</span>
                <span>All Customers</span>
              </span>
            </div>
          ) : (
            /* ── Profile-only nav (not inside an opportunity) ── */
            <div className="flex items-stretch -mx-4 px-0">
              {/* Back to customers list */}
              <button
                onClick={handleGoToCustomers}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Customers</span>
                <span className="sm:hidden">Back</span>
              </button>
              <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>
              <div className="flex items-center px-2 py-2 text-[11px] font-semibold text-foreground">
                {state.jobInfo.client || 'New Customer'}
              </div>
              <div className="flex-1" />
              <span className="flex items-center px-4 py-2 text-[11px] text-muted-foreground">
                Open an opportunity to access the estimate builder →
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value, sub, bold = false, valueClass = '' }: {
  label: string; value: string; sub: string; bold?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-bold ${bold ? 'text-primary' : 'text-foreground'} ${valueClass}`}>{value}</span>
      <span className="text-muted-foreground/70 text-[10px]">{sub}</span>
    </div>
  );
}
