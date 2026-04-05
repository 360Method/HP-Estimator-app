// ============================================================
// MetricsBar — App header + slim metrics context bar
// Design: HP Industrial — mobile-first, clean white, slate borders
//
// Mobile layout (< sm):
//   - Logo only (no wordmark), search icon tap-to-expand, New button
//   - Backend nav icons hidden; hamburger menu placeholder
//   - Breadcrumb collapses to short labels
//
// Desktop layout (≥ md):
//   - Full logo + wordmark, search bar, all backend nav icons
//   - Full breadcrumb labels
//
// Navigation logic:
//   - activeOpportunityId null → customer profile, no builder tabs
//   - activeOpportunityId set → estimate builder, all 4 tabs + breadcrumb
// ============================================================

import React, { useState, useRef } from 'react';
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
  ChevronDown, ArrowLeft, Plus, Menu, X, Briefcase,
} from 'lucide-react';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

interface MetricsBarProps {
  totals: TotalsResult;
}

const BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'sales',      icon: '🛍', label: 'Sales View', shortLabel: 'Sales'    },
  { id: 'calculator', icon: '🧮', label: 'Calculator',  shortLabel: 'Calc'     },
  { id: 'estimate',   icon: '📄', label: 'Estimate',    shortLabel: 'Estimate' },
  { id: 'invoice',    icon: '💳', label: 'Invoice',     shortLabel: 'Invoice'  },
];

const JOB_BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'job-details', icon: '📋', label: 'Job Details', shortLabel: 'Job'     },
  { id: 'calculator',  icon: '🧮', label: 'Calculator',  shortLabel: 'Calc'    },
  { id: 'estimate',    icon: '📄', label: 'Estimate',    shortLabel: 'Estimate'},
  { id: 'invoice',     icon: '💳', label: 'Invoice',     shortLabel: 'Invoice' },
];

const BACKEND_NAV: { icon: React.ElementType; label: string; section: AppSection | null }[] = [
  { icon: LayoutDashboard, label: 'Dashboard',  section: null        },
  { icon: Users,           label: 'Customers',  section: 'customers' },
  { icon: Briefcase,       label: 'Jobs',       section: 'jobs'      },
  { icon: Inbox,           label: 'Inbox',      section: null        },
  { icon: GitBranch,       label: 'Pipeline',   section: 'pipeline'  },
  { icon: DollarSign,      label: 'Financials', section: null        },
  { icon: BarChart2,       label: 'Reporting',  section: null        },
  { icon: Megaphone,       label: 'Marketing',  section: null        },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, setActiveOpportunity, setActiveCustomer, addCustomer, reset } = useEstimator();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
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

  const insideOpportunity = !!state.activeOpportunityId;
  const activeOpp = insideOpportunity
    ? state.opportunities.find(o => o.id === state.activeOpportunityId)
    : null;
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
  };

  const handleGoToCustomers = () => {
    setSection('customers');
    setActiveOpportunity(null);
    setActiveCustomer(null);
    setShowMobileNav(false);
  };

  const handleGoToJobs = () => {
    setSection('jobs');
    setActiveOpportunity(null);
    setActiveCustomer(null);
    setShowMobileNav(false);
  };

  const handleGoToPipeline = () => {
    setSection('pipeline');
    setActiveOpportunity(null);
    setActiveCustomer(null);
    setShowMobileNav(false);
  };

  const handleNavClick = (section: AppSection | null, label: string) => {
    if (section === 'customers') { handleGoToCustomers(); return; }
    if (section === 'jobs') { handleGoToJobs(); return; }
    if (section === 'pipeline') { handleGoToPipeline(); return; }
    handleBackendNav(label);
  };

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-border shadow-sm no-print">

      {/* ── TOP APP HEADER ─────────────────────────────────────── */}
      <div className="px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 h-14">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <img src={HP_LOGO} alt="HP" className="w-8 h-8 object-contain rounded shrink-0" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-bold text-foreground leading-tight">Field Estimator</div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden sm:block mx-1" />

          {/* Search bar — desktop */}
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

          {/* Mobile search expand */}
          {searchOpen && (
            <div className="flex-1 flex items-center gap-2 sm:hidden">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button onClick={() => setSearchOpen(false)} className="p-1.5 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Spacer */}
          {!searchOpen && <div className="flex-1" />}

          {/* Search icon — mobile only */}
          {!searchOpen && (
            <button
              onClick={() => setSearchOpen(true)}
              className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Backend module nav icons — desktop */}
          {!searchOpen && (
            <nav className="hidden md:flex items-center gap-0.5">
              {BACKEND_NAV.map(({ icon: Icon, label, section }) => (
                <button
                  key={label}
                  onClick={() => handleNavClick(section, label)}
                  title={label}
                  className={`relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-colors group ${
                    section && state.activeSection === section
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="absolute top-full mt-1 bg-foreground text-background px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    {label}
                  </span>
                </button>
              ))}
            </nav>
          )}

          {/* Divider */}
          {!searchOpen && <div className="h-6 w-px bg-border shrink-0 hidden md:block" />}

          {/* Settings + My Account — desktop */}
          {!searchOpen && (
            <div className="hidden sm:flex items-center gap-1">
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
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* New button + dropdown */}
          {!searchOpen && (
            <div ref={newBtnRef} className="relative shrink-0">
              <button
                onClick={() => setShowNewMenu(v => !v)}
                className="flex items-center gap-1.5 text-[12px] font-bold bg-foreground text-background hover:bg-foreground/80 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
              {showNewMenu && (
                <NewMenu
                  onSelect={handleNewMenuSelect}
                  onClose={() => setShowNewMenu(false)}
                />
              )}
            </div>
          )}

          {/* Hamburger — mobile only (shows nav drawer) */}
          {!searchOpen && (
            <button
              onClick={() => setShowMobileNav(v => !v)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showMobileNav ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* ── MOBILE NAV DRAWER ─────────────────────────────────── */}
      {showMobileNav && (
        <div className="md:hidden border-t border-border bg-white">
          <div className="px-3 py-2 grid grid-cols-4 gap-1">
            {BACKEND_NAV.map(({ icon: Icon, label, section }) => (
              <button
                key={label}
                onClick={() => handleNavClick(section, label)}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] font-semibold transition-colors ${
                  section && state.activeSection === section
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
            <button
              onClick={() => { handleBackendNav('Settings'); setShowMobileNav(false); }}
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
            <button
              onClick={handleReset}
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
            >
              <X className="w-5 h-5" />
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ── SLIM METRICS CONTEXT BAR ───────────────────────────── */}
      {insideOpportunity && !isCustomerFacing && totalPrice > 0 && (
        <div className="bg-slate-50 border-t border-border">
          <div className="px-3 sm:px-4 md:px-6">
            <div className="flex items-center gap-3 sm:gap-5 py-1.5 text-xs overflow-x-auto scrollbar-none">
              <span className="text-muted-foreground shrink-0 hidden sm:inline">This estimate:</span>
              <MetricPill label="Cost" value={fmtDollar(totalHard)} sub="internal" />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Price" value={fmtDollar(totalPrice)} sub="customer" bold />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill
                label="GM"
                value={fmtPct(totalGM)}
                sub={totalGM >= minGM - 0.001 ? '✓' : '✗'}
                valueClass={gmColor}
              />
              <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
              <MetricPill label="GP" value={fmtDollar(totalGP)} sub="profit" />
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
        <div className="px-3 sm:px-4 md:px-6">
          {insideOpportunity ? (
            /* ── Estimate builder tabs (inside an opportunity) ── */
            <div className="flex items-stretch">
              {/* Back to profile */}
              <button
                onClick={handleBackToProfile}
                className="flex items-center gap-1.5 pr-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {state.jobInfo.client || 'Profile'}
                </span>
              </button>

              <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>

              {/* Opportunity name */}
              <div className="flex items-center px-1 py-2 text-[11px] font-semibold text-foreground truncate max-w-[100px] sm:max-w-xs">
                {activeOpp?.title ?? 'Opportunity'}
              </div>

              <div className="flex-1" />

              {/* Builder section tabs — Job opportunities get Job Details tab first */}
              {(activeOpp?.area === 'job' ? JOB_BUILDER_TABS : BUILDER_TABS).map(item => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-2.5 sm:px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors min-w-0 ${
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
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">👥</span>
                <span>All Customers</span>
              </span>
            </div>
          ) : state.activeSection === 'jobs' ? (
            /* ── Jobs list nav ── */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>All Jobs</span>
              </span>
            </div>
          ) : state.activeSection === 'pipeline' ? (
            /* ── Pipeline nav ── */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Pipeline</span>
              </span>
            </div>
          ) : (
            /* ── Profile-only nav ── */
            <div className="flex items-stretch">
              <button
                onClick={handleGoToCustomers}
                className="flex items-center gap-1.5 pr-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline">Customers</span>
              </button>
              <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>
              <div className="flex items-center px-1 py-2 text-[11px] font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">
                {state.jobInfo.client || 'New Customer'}
              </div>
              <div className="flex-1" />
              <span className="hidden sm:flex items-center px-4 py-2 text-[11px] text-muted-foreground">
                Open an opportunity →
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
    <div className="flex items-baseline gap-1 shrink-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-bold ${bold ? 'text-primary' : 'text-foreground'} ${valueClass}`}>{value}</span>
      <span className="text-muted-foreground/70 text-[10px] hidden sm:inline">{sub}</span>
    </div>
  );
}
