// ============================================================
// MetricsBar â€” App header + slim metrics context bar
// Design: HP Industrial â€” mobile-first, clean white, slate borders
//
// Mobile layout (< sm):
//   - Logo only (no wordmark), search icon tap-to-expand, New button
//   - Backend nav icons hidden; hamburger menu placeholder
//   - Breadcrumb collapses to short labels
//
// Desktop layout (â‰¥ md):
//   - Full logo + wordmark, search bar, all backend nav icons
//   - Full breadcrumb labels
//
// Navigation logic:
//   - activeOpportunityId null â†’ customer profile, no builder tabs
//   - activeOpportunityId set â†’ estimate builder, all 4 tabs + breadcrumb
// ============================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import AIEstimateChat from '@/components/AIEstimateChat';
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
import UserMenu, { UserMenuAction } from '@/components/UserMenu';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import MyAccountPage from '@/pages/MyAccountPage';
import MyTasksPage from '@/pages/MyTasksPage';
import HelpPage from '@/pages/HelpPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import NotificationBell from '@/components/NotificationBell';
import {
  Search, LayoutDashboard, Users, Inbox, GitBranch,
  Settings,
  ChevronDown, ArrowLeft, Plus, Menu, X, Briefcase, CalendarDays, RefreshCw, BookOpen, Star,
  Workflow, ShieldCheck,
} from 'lucide-react';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

interface MetricsBarProps {
  totals: TotalsResult;
}

const BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'opp-details', icon: 'ðŸ“Œ', label: 'Command',     shortLabel: 'Command' },
  { id: 'calculator',  icon: 'ðŸ§®', label: 'Scope/Price', shortLabel: 'Scope' },
  { id: 'estimate',    icon: 'ðŸ“„', label: 'Proposal',    shortLabel: 'Proposal' },
];

const JOB_BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'opp-details', icon: 'ðŸ“Œ', label: 'Command',     shortLabel: 'Command' },
  { id: 'job-details', icon: 'ðŸ“‹', label: 'Work Plan',   shortLabel: 'Plan' },
  { id: 'calculator',  icon: 'ðŸ§®', label: 'Scope/Price', shortLabel: 'Scope' },
  { id: 'invoice',     icon: 'ðŸ’³', label: 'Billing',     shortLabel: 'Billing' },
];

const BACKEND_NAV: { icon: React.ElementType; label: string; section: AppSection | null }[] = [
  { icon: LayoutDashboard, label: 'Command',    section: 'dashboard' as AppSection },
  { icon: Users,           label: 'Customers',  section: 'customers' },
  { icon: Star,            label: 'Leads',      section: 'leads' as AppSection },
  { icon: Workflow,        label: 'Workflow',   section: 'workflow' as AppSection },
  { icon: Inbox,           label: 'Inbox',      section: 'inbox' as AppSection },
  { icon: CalendarDays,    label: 'Schedule',   section: 'schedule' as AppSection },
  { icon: ShieldCheck,     label: 'Operations', section: 'operations' as AppSection },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, setActiveOpportunity, setActiveCustomer, addCustomer, reset, navigateToTopLevel } = useEstimator();
  // Unread leads badge (online requests + leads created in last 24h) â€” poll every 60s.
  // The leads.counts query is the new source of truth; booking.unreadCount stays
  // around for back-compat with anything that still imports it, but the nav
  // surfaces the unified counter.
  const { data: leadCounts } = trpc.leads.counts.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = leadCounts?.unreadRequests ?? 0;
  const newLeadCount = leadCounts?.newLast24h ?? 0;

  // Portal unread message count for Inbox badge
  const { data: portalUnreadData } = trpc.portal.getPortalUnreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const portalUnreadCount = portalUnreadData?.count ?? 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [activeModal, setActiveModal] = useState<NewMenuAction | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [overlay, setOverlay] = useState<'account' | 'tasks' | 'help' | 'shortcuts' | 'settings' | null>(null);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const newBtnRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Back button is shown when state.customerNavSource is 'list' or 'search'

  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<{ section: string }>).detail?.section;
      setSettingsSection(section);
      setOverlay('settings');
    };
    window.addEventListener('open-settings', handler);
    return () => window.removeEventListener('open-settings', handler);
  }, []);

  const utils = trpc.useUtils();
  const markAllPortalReadMutation = trpc.portal.markAllPortalRead.useMutation({
    onSuccess: () => utils.portal.getPortalUnreadCount.invalidate(),
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      // Always clear local state and redirect to login regardless of server response
      reset();
      window.location.href = getLoginUrl();
    },
  });

  const handleUserMenuSelect = (action: UserMenuAction) => {
    if (action === 'my-account') setOverlay('account');
    else if (action === 'my-tasks') setOverlay('tasks');
    else if (action === 'help') setOverlay('help');
    else if (action === 'keyboard-shortcuts') setOverlay('shortcuts');
    else if (action === 'settings') setOverlay('settings');
    else if (action === 'sign-out') logoutMutation.mutate();
  };

  const [aiEstimateOpen, setAiEstimateOpen] = useState(false);

  const handleNewMenuSelect = (action: NewMenuAction) => {
    setShowNewMenu(false);
    if (action === 'ai-estimate') {
      // Navigate to calculator section first, then open AI chat
      setSection('calculator');
      setAiEstimateOpen(true);
    } else {
      setActiveModal(action);
    }
  };

  const handleNewCustomerCreated = (customer: Customer) => {
    addCustomer(customer);
    setActiveModal(null);
    setActiveCustomer(customer.id);
  };

  const closeModal = () => setActiveModal(null);
  const activeSearchCustomerName = state.jobInfo.client || 'Active customer';

  const pendingSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];

    const matches: Array<{
      id: string;
      type: 'customer' | 'opportunity';
      label: string;
      meta: string;
      customerId: string;
      opportunityId?: string;
    }> = [];

    for (const customer of state.customers) {
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.displayName || customer.company || 'Unnamed customer';
      const customerFields = [
        name,
        customer.company,
        customer.email,
        customer.mobilePhone,
        customer.homePhone,
        customer.workPhone,
        customer.street,
        customer.city,
        customer.zip,
        ...(customer.tags ?? []),
      ].filter(Boolean).join(' ').toLowerCase();

      if (customerFields.includes(q)) {
        matches.push({
          id: `customer-${customer.id}`,
          type: 'customer',
          label: name,
          meta: [customer.email, customer.mobilePhone || customer.homePhone || customer.workPhone].filter(Boolean).join(' Â· ') || 'Customer profile',
          customerId: customer.id,
        });
      }

      for (const opp of customer.opportunities ?? []) {
        const oppFields = [
          opp.title,
          opp.stage,
          opp.area,
          opp.notes,
          opp.clientSnapshot?.jobType,
          opp.clientSnapshot?.scope,
          opp.clientSnapshot?.address,
        ].filter(Boolean).join(' ').toLowerCase();

        if (oppFields.includes(q)) {
          matches.push({
            id: `opp-${customer.id}-${opp.id}`,
            type: 'opportunity',
            label: opp.title,
            meta: `${name} Â· ${opp.area} Â· ${opp.stage}`,
            customerId: customer.id,
            opportunityId: opp.id,
          });
        }
      }
    }

    for (const opp of state.opportunities) {
      if (matches.some(match => match.opportunityId === opp.id)) continue;
      const oppFields = [opp.title, opp.stage, opp.area, opp.notes, opp.clientSnapshot?.client].filter(Boolean).join(' ').toLowerCase();
      if (!oppFields.includes(q)) continue;
      matches.push({
        id: `active-opp-${opp.id}`,
        type: 'opportunity',
        label: opp.title,
        meta: `${opp.clientSnapshot?.client || activeSearchCustomerName} Â· ${opp.area} Â· ${opp.stage}`,
        customerId: state.activeCustomerId ?? '',
        opportunityId: opp.id,
      });
    }

    return matches.slice(0, 8);
  }, [activeSearchCustomerName, searchQuery, state.activeCustomerId, state.customers, state.opportunities]);

  const openPendingSearchResult = (result: typeof pendingSearchResults[number]) => {
    setSearchQuery('');
    setSearchOpen(false);
    if (result.type === 'customer' || !result.opportunityId) {
      setActiveCustomer(result.customerId, 'search');
      return;
    }
    if (result.customerId && result.customerId !== state.activeCustomerId) {
      setActiveCustomer(result.customerId, 'search');
    }
    setActiveOpportunity(result.opportunityId);
    setSection('opp-details');
  };

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);

  const insideOpportunity = !!state.activeOpportunityId;
  const activeOpp = insideOpportunity
    ? state.opportunities.find(o => o.id === state.activeOpportunityId)
    : null;
  const isCustomerFacing = state.activeSection === 'sales' || state.activeSection === 'estimate';

  // Derive customer display name from the customer record (not jobInfo.client) so
  // DB-synced customers always show the correct name in the breadcrumb.
  const activeCustomerRecord = state.activeCustomerId
    ? state.customers.find(c => c.id === state.activeCustomerId)
    : null;
  const activeCustomerDisplayName = activeCustomerRecord
    ? ([activeCustomerRecord.firstName, activeCustomerRecord.lastName].filter(Boolean).join(' ') ||
       activeCustomerRecord.displayName ||
       activeCustomerRecord.company ||
       state.jobInfo.client ||
       'Profile')
    : (state.jobInfo.client || 'Profile');

  const gmColor = {
    empty: 'text-muted-foreground',
    ok:    'text-emerald-600',
    warn:  'text-amber-600',
    bad:   'text-red-600',
  }[gmFlag];

  const handleReset = () => {
    if (window.confirm('Clear all estimate data and start fresh?')) {
      reset();
      toast.success('Estimate cleared â€” ready for a new job');
    }
  };

  const handleBackendNav = (label: string) => {
    toast.info(`${label} â€” coming soon`, { description: 'This module is part of the upcoming HP backend.' });
  };

  const handleBackToProfile = () => {
    setActiveOpportunity(null);
  };

  const handleGoToCustomers = () => {
    navigateToTopLevel('customers');
    setShowMobileNav(false);
  };

  const handleGoToDashboard = () => {
    navigateToTopLevel('dashboard');
    setShowMobileNav(false);
  };

  const handleGoToSchedule = () => {
    navigateToTopLevel('schedule');
    setShowMobileNav(false);
  };

  const handleGoToInbox = () => {
    navigateToTopLevel('inbox' as AppSection);
    setShowMobileNav(false);
    markAllPortalReadMutation.mutate();
  };

  const handleGoToLeads = () => {
    navigateToTopLevel('leads' as AppSection);
    setShowMobileNav(false);
  };

  const handleNavClick = (section: AppSection | null, label: string) => {
    if (section === 'customers') { handleGoToCustomers(); return; }
    if (section === 'leads') { handleGoToLeads(); return; }
    if (section === 'workflow') { navigateToTopLevel('workflow' as AppSection); setShowMobileNav(false); return; }
    if (section === 'dashboard') { handleGoToDashboard(); return; }
    if (section === 'operations') { navigateToTopLevel('operations' as AppSection); setShowMobileNav(false); return; }
    if (section === 'schedule') { handleGoToSchedule(); return; }
    if (section === 'inbox') { handleGoToInbox(); return; }
    handleBackendNav(label);
  };

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-border shadow-sm no-print">

      {/* â”€â”€ TOP APP HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 h-14">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <img src={HP_LOGO} alt="HP" className="w-8 h-8 object-contain rounded shrink-0" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-bold text-foreground leading-tight">Operating System</div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden sm:block mx-1" />

          {/* Search bar â€” desktop */}
          <div className="flex-1 max-w-xs relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setSearchQuery('');
                if (e.key === 'Enter' && pendingSearchResults[0]) openPendingSearchResult(pendingSearchResults[0]);
              }}
              placeholder="Search estimates, clientsâ€¦"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            {searchQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-[80] mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-xl">
                {pendingSearchResults.length > 0 ? pendingSearchResults.map(result => (
                  <button key={result.id} onMouseDown={e => e.preventDefault()} onClick={() => openPendingSearchResult(result)} className="w-full rounded-md px-3 py-2 text-left hover:bg-muted">
                    <div className="truncate text-xs font-semibold text-foreground">{result.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{result.type === 'customer' ? 'Customer' : 'Opportunity'} - {result.meta}</div>
                  </button>
                )) : (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No matches found.</div>
                )}
              </div>
            )}
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
                  onKeyDown={e => {
                    if (e.key === 'Escape') setSearchQuery('');
                    if (e.key === 'Enter' && pendingSearchResults[0]) openPendingSearchResult(pendingSearchResults[0]);
                  }}
                  placeholder="Searchâ€¦"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-[80] mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-xl">
                    {pendingSearchResults.length > 0 ? pendingSearchResults.map(result => (
                      <button key={result.id} onMouseDown={e => e.preventDefault()} onClick={() => openPendingSearchResult(result)} className="w-full rounded-md px-3 py-2 text-left hover:bg-muted">
                        <div className="truncate text-xs font-semibold text-foreground">{result.label}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{result.type === 'customer' ? 'Customer' : 'Opportunity'} - {result.meta}</div>
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-xs text-muted-foreground">No matches found.</div>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setSearchOpen(false)} className="p-1.5 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Spacer */}
          {!searchOpen && <div className="flex-1" />}

          {/* Search icon â€” mobile only */}
          {!searchOpen && (
            <button
              onClick={() => setSearchOpen(true)}
              className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Backend module nav icons â€” desktop */}
          {!searchOpen && (
            <nav className="hidden md:flex items-center gap-0.5">
              {BACKEND_NAV.map(({ icon: Icon, label, section }) => {
                // Leads carries the live intake badge: unread online requests
                // + leads created in the last 24h (the things still awaiting first touch).
                const leadBadge = label === 'Leads' ? (unreadCount + newLeadCount) : 0;
                const showInboxBadge = portalUnreadCount > 0 && label === 'Inbox';
                return (
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
                    <div className="relative">
                      <Icon className="w-4 h-4" />
                      {leadBadge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">
                          {leadBadge > 9 ? '9+' : leadBadge}
                        </span>
                      )}
                      {showInboxBadge && (
                        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold leading-none px-0.5">
                          {portalUnreadCount > 9 ? '9+' : portalUnreadCount}
                        </span>
                      )}
                    </div>
                    <span className="absolute top-full mt-1 bg-foreground text-background px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                      {label}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Divider */}
          {!searchOpen && <div className="h-6 w-px bg-border shrink-0 hidden md:block" />}

          {/* Settings + My Account â€” desktop */}
          {!searchOpen && (
            <div className="hidden sm:flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={() => setOverlay('settings')}
                title="Settings"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
              {/* User avatar + dropdown */}
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  title="My Account"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {state.userProfile.avatarUrl ? (
                    <img src={state.userProfile.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: state.userProfile.teamColor }}
                    >
                      {[state.userProfile.firstName[0], state.userProfile.lastName[0]].filter(Boolean).join('').toUpperCase() || 'HP'}
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showUserMenu && (
                  <UserMenu
                    onSelect={handleUserMenuSelect}
                    onClose={() => setShowUserMenu(false)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Full-screen overlays for account pages */}
          {overlay && (
            <div className="fixed inset-0 z-[300] bg-background overflow-y-auto">
              {overlay === 'account' && <MyAccountPage onBack={() => setOverlay(null)} />}
              {overlay === 'tasks' && <MyTasksPage onBack={() => setOverlay(null)} />}
              {(overlay === 'help' || overlay === 'shortcuts') && (
                <HelpPage onBack={() => setOverlay(null)} initialTab={overlay === 'shortcuts' ? 'shortcuts' : 'help'} />
              )}
              {overlay === 'settings' && <SettingsPage onBack={() => { setOverlay(null); setSettingsSection(undefined); }} initialSection={settingsSection as any} />}
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

          {/* Hamburger â€” mobile only (shows nav drawer) */}
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

      {/* â”€â”€ MOBILE NAV DRAWER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showMobileNav && (
        <div className="md:hidden border-t border-border bg-white">
          <div className="px-3 py-2 grid grid-cols-4 gap-1">
            {BACKEND_NAV.map(({ icon: Icon, label, section }) => {
              const leadBadge = label === 'Leads' ? (unreadCount + newLeadCount) : 0;
              const showInboxBadge = portalUnreadCount > 0 && label === 'Inbox';
              return (
                <button
                  key={label}
                  onClick={() => handleNavClick(section, label)}
                  className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] font-semibold transition-colors ${
                    section && state.activeSection === section
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  style={{ minHeight: 56 }} // mobile tap target
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {leadBadge > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">
                        {leadBadge > 9 ? '9+' : leadBadge}
                      </span>
                    )}
                    {showInboxBadge && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold leading-none px-0.5">
                        {portalUnreadCount > 9 ? '9+' : portalUnreadCount}
                      </span>
                    )}
                  </div>
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => { setOverlay('settings'); setShowMobileNav(false); }}
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

      {/* â”€â”€ SLIM METRICS CONTEXT BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                sub={totalGM >= minGM - 0.001 ? 'âœ“' : 'âœ—'}
                valueClass={gmColor}
              />
              <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
              <MetricPill label="GP" value={fmtDollar(totalGP)} sub="profit" />
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Intake Modals â”€â”€ */}
      {/* When inside a customer profile, pre-fill the active customer into intake modals */}
      {(() => {
        const customerPrefill = activeCustomerRecord ? {
          id: activeCustomerRecord.id,
          displayName: activeCustomerDisplayName,
          phone: activeCustomerRecord.mobilePhone || activeCustomerRecord.homePhone || activeCustomerRecord.workPhone || '',
          email: activeCustomerRecord.email || '',
          address: activeCustomerRecord.street || '',
          city: activeCustomerRecord.city || '',
          state: activeCustomerRecord.state || '',
          zip: activeCustomerRecord.zip || '',
        } : undefined;
        return (
          <>
            {activeModal === 'customer'      && <NewCustomerModal onClose={closeModal} onCreated={handleNewCustomerCreated} />}
            {activeModal === 'job'           && <NewJobModal onClose={closeModal} prefill={customerPrefill} onSaved={(oppId) => { closeModal(); setActiveOpportunity(oppId); setSection('opp-details'); }} />}
            {activeModal === 'recurring-job' && <NewRecurringJobModal onClose={closeModal} />}
            {activeModal === 'estimate'      && <NewEstimateModal onClose={closeModal} prefill={customerPrefill} onSaved={(oppId) => { closeModal(); setActiveOpportunity(oppId); setSection('opp-details'); }} />}
            {activeModal === 'event'         && <NewEventModal onClose={closeModal} />}
            {activeModal === 'intake'        && <NewIntakeModal onClose={closeModal} />}
            {activeModal === 'lead'          && <NewLeadModal onClose={closeModal} prefill={customerPrefill} onSaved={(oppId) => { closeModal(); setActiveOpportunity(oppId); setSection('opp-details'); }} />}
          </>
        );
      })()}

      {/* â”€â”€ AI Estimate Chat drawer â”€â”€ */}
      <AIEstimateChat open={aiEstimateOpen} onClose={() => setAiEstimateOpen(false)} />

      {/* â”€â”€ NAVIGATION BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="border-t border-border bg-white">
        <div className="px-3 sm:px-4 md:px-6">
          {insideOpportunity ? (
            /* â”€â”€ Estimate builder tabs (inside an opportunity) â”€â”€ */
            <div className="flex items-stretch">
              {/* Back to profile */}
              <button
                onClick={handleBackToProfile}
                className="flex items-center gap-1.5 pr-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {activeCustomerDisplayName}
                </span>
              </button>

              <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>

              {/* Opportunity name */}
              <div className="flex items-center px-1 py-2 text-[11px] font-semibold text-foreground truncate max-w-[100px] sm:max-w-xs">
                {activeOpp?.title ?? 'Opportunity'}
              </div>

              <div className="flex-1" />

              {/* Builder section tabs â€” Leads show only Details; Estimates get Sales/Calc/Estimate/Invoice; Jobs get Job Details/Calc/Estimate/Invoice */}
              {(activeOpp?.area === 'lead'
                ? BUILDER_TABS.filter(t => t.id === 'opp-details')
                : activeOpp?.area === 'job'
                  ? JOB_BUILDER_TABS
                  : BUILDER_TABS
              ).map(item => (
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
            /* â”€â”€ Customers list nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ‘¥</span>
                <span>All Customers</span>
              </span>
            </div>
          ) : state.activeSection === 'jobs' ? (
            /* â”€â”€ Jobs list nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>All Jobs</span>
              </span>
            </div>
          ) : state.activeSection === 'pipeline' ? (
            /* â”€â”€ Pipeline nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Pipeline</span>
              </span>
            </div>
          ) : state.activeSection === 'workflow' ? (
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <Workflow className="w-3.5 h-3.5" />
                <span>Workflow</span>
              </span>
            </div>
          ) : state.activeSection === 'operations' ? (
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Operations</span>
              </span>
            </div>
          ) : state.activeSection === 'dashboard' ? (
            /* â”€â”€ Dashboard nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Command</span>
              </span>
            </div>
          ) : state.activeSection === 'schedule' ? (
            /* â”€â”€ Schedule nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ“…</span>
                <span>Schedule</span>
              </span>
            </div>
          ) : state.activeSection === 'financials' ? (
            /* â”€â”€ Financials nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ’°</span>
                <span>Financials</span>
              </span>
            </div>
          ) : state.activeSection === 'quickbooks' ? (
            /* â”€â”€ QuickBooks nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ“–</span>
                <span>QuickBooks</span>
              </span>
            </div>
          ) : state.activeSection === 'marketing' ? (
            /* â”€â”€ Marketing nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ“£</span>
                <span>Marketing</span>
              </span>
            </div>
          ) : state.activeSection === 'reporting' || state.activeSection === 'three-sixty' ? (
            /* â”€â”€ Reporting nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ“Š</span>
                <span>Reports</span>
              </span>
            </div>
          ) : state.activeSection === 'inbox' ? (
            /* â”€â”€ Inbox nav â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <span className="text-sm">ðŸ“¥</span>
                <span>Inbox</span>
              </span>
            </div>
          ) : (state.activeSection === 'leads' || state.activeSection === 'requests') ? (
            /* â”€â”€ Leads nav (folded in former Requests) â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                <span>Leads</span>
              </span>
            </div>
          ) : state.activeSection === 'customer' && !state.activeCustomerId ? (
            /* â”€â”€ Empty / no customer selected â”€â”€ */
            <div className="flex items-center py-2 gap-2">
              <span className="text-[11px] text-muted-foreground">Select a customer to get started</span>
            </div>
          ) : (
            /* â”€â”€ Profile-only nav (inside a customer profile) â”€â”€ */
            <div className="flex items-stretch">
              {/* Only show back button when we drilled in from the Customers list or search */}
              {(state.customerNavSource === 'list' || state.customerNavSource === 'search') && (
                <>
                  <button
                    onClick={handleGoToCustomers}
                    className="flex items-center gap-1.5 pr-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xs:inline">Customers</span>
                  </button>
                  <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>
                </>
              )}
              <div className="flex items-center px-1 py-2 text-[11px] font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">
                {activeCustomerDisplayName !== 'Profile' ? activeCustomerDisplayName : (state.jobInfo.client || 'New Customer')}
              </div>
              <div className="flex-1" />
              <span className="hidden sm:flex items-center px-4 py-2 text-[11px] text-muted-foreground">
                Open an opportunity â†’
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
