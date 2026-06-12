/**
 * OsQuickActions — global search + the New menu, living in the OS shell
 * top bar so every surface (Today, Chat, the rooms) can find a client or
 * start an intake. Extracted from MetricsBar when the old app header left
 * the rooms.
 *
 * Selecting a search result (or finishing an intake) from outside a room
 * primes the estimator context, marks nav intent so the room mount keeps
 * that state, and lands in /os/clients.
 */
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import AIEstimateChat from '@/components/AIEstimateChat';
import NewCustomerModal from '@/components/NewCustomerModal';
import NewMenu, { NewMenuAction } from '@/components/NewMenu';
import NewJobModal from '@/components/intakes/NewJobModal';
import NewRecurringJobModal from '@/components/intakes/NewRecurringJobModal';
import NewEstimateModal from '@/components/intakes/NewEstimateModal';
import NewEventModal from '@/components/intakes/NewEventModal';
import NewIntakeModal from '@/components/intakes/NewIntakeModal';
import NewLeadModal from '@/components/intakes/NewLeadModal';
import { useEstimator } from '@/contexts/EstimatorContext';
import { dbCustomerToLocal } from '@/hooks/useDbSync';
import { trpc } from '@/lib/trpc';
import type { Customer } from '@/lib/types';
import { markNavIntent } from './navIntent';

/** The room URLs whose section machinery is already mounted. */
const ROOM_PATHS = ['/os/pipeline', '/os/clients', '/os/money', '/os/schedule', '/os/inbox'];

export default function OsQuickActions() {
  const [location, navigate] = useLocation();
  const { state, setSection, setActiveOpportunity, setActiveCustomer, addCustomer, mergeDbCustomers } = useEstimator();
  const utils = trpc.useUtils();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<NewMenuAction | null>(null);
  const [aiEstimateOpen, setAiEstimateOpen] = useState(false);
  const newBtnRef = useRef<HTMLDivElement>(null);
  const ensuredCustomersRef = useRef(false);

  const inRoom = ROOM_PATHS.some(p => location.startsWith(p));

  /**
   * The rooms run useDbSync, but Today/Chat/Library don't, so the context
   * customer list can be empty there. Pull it once on first search focus
   * instead of running a second full sync per page.
   */
  const ensureCustomersLoaded = () => {
    if (ensuredCustomersRef.current || state.customers.length > 0) return;
    ensuredCustomersRef.current = true;
    utils.customers.listWithOpportunities.fetch({ limit: 500 })
      .then((rows) => mergeDbCustomers(rows.map(dbCustomerToLocal)))
      .catch(() => { /* search just shows fewer results */ });
  };

  /** Land in the Clients room with the context state we just primed. */
  const goToClients = () => {
    if (location === '/os/clients') return;
    markNavIntent();
    navigate('/os/clients');
  };

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
          meta: [customer.email, customer.mobilePhone || customer.homePhone || customer.workPhone].filter(Boolean).join(' · ') || 'Customer profile',
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
            meta: `${name} · ${opp.area} · ${opp.stage}`,
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
        meta: `${opp.clientSnapshot?.client || activeSearchCustomerName} · ${opp.area} · ${opp.stage}`,
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
      goToClients();
      return;
    }
    if (result.customerId && result.customerId !== state.activeCustomerId) {
      setActiveCustomer(result.customerId, 'search');
    }
    setActiveOpportunity(result.opportunityId);
    setSection('opp-details');
    goToClients();
  };

  const handleNewMenuSelect = (action: NewMenuAction) => {
    setShowNewMenu(false);
    if (action === 'ai-estimate') {
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
    goToClients();
  };

  const handleIntakeSaved = (oppId: string) => {
    setActiveModal(null);
    setActiveOpportunity(oppId);
    setSection('opp-details');
    if (!inRoom) goToClients();
  };

  const closeModal = () => setActiveModal(null);

  const activeCustomerRecord = state.activeCustomerId
    ? state.customers.find(c => c.id === state.activeCustomerId)
    : null;
  const customerPrefill = activeCustomerRecord ? {
    id: activeCustomerRecord.id,
    displayName: [activeCustomerRecord.firstName, activeCustomerRecord.lastName].filter(Boolean).join(' ') || activeCustomerRecord.displayName || activeCustomerRecord.company || 'Customer',
    phone: activeCustomerRecord.mobilePhone || activeCustomerRecord.homePhone || activeCustomerRecord.workPhone || '',
    email: activeCustomerRecord.email || '',
    address: activeCustomerRecord.street || '',
    city: activeCustomerRecord.city || '',
    state: activeCustomerRecord.state || '',
    zip: activeCustomerRecord.zip || '',
  } : undefined;

  return (
    <>
      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            ensureCustomersLoaded();
            setSearchOpen(v => !v);
            if (searchOpen) setSearchQuery('');
          }}
          title="Search clients and opportunities"
          aria-label="Search"
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
        {searchOpen && (
          <div className="absolute right-0 top-full mt-2 z-[80] w-72 sm:w-80">
            <div className="rounded-lg border border-border bg-white p-2 shadow-xl">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); }
                    if (e.key === 'Enter' && pendingSearchResults[0]) openPendingSearchResult(pendingSearchResults[0]);
                  }}
                  placeholder="Search estimates, clients…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground text-foreground"
                />
              </div>
              {searchQuery.trim().length >= 2 && (
                <div className="mt-1 max-h-80 overflow-y-auto">
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
          </div>
        )}
      </div>

      {/* ── New ────────────────────────────────────────────────── */}
      <div ref={newBtnRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowNewMenu(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/85 hover:bg-white/10 cursor-pointer transition-colors text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>
        {showNewMenu && (
          <NewMenu
            onSelect={handleNewMenuSelect}
            onClose={() => setShowNewMenu(false)}
          />
        )}
      </div>

      {/* ── Intake modals (prefilled with the active customer) ──── */}
      {activeModal === 'customer'      && <NewCustomerModal onClose={closeModal} onCreated={handleNewCustomerCreated} />}
      {activeModal === 'job'           && <NewJobModal onClose={closeModal} prefill={customerPrefill} onSaved={handleIntakeSaved} />}
      {activeModal === 'recurring-job' && <NewRecurringJobModal onClose={closeModal} />}
      {activeModal === 'estimate'      && <NewEstimateModal onClose={closeModal} prefill={customerPrefill} onSaved={handleIntakeSaved} />}
      {activeModal === 'event'         && <NewEventModal onClose={closeModal} />}
      {activeModal === 'intake'        && <NewIntakeModal onClose={closeModal} />}
      {activeModal === 'lead'          && <NewLeadModal onClose={closeModal} prefill={customerPrefill} onSaved={handleIntakeSaved} />}

      {/* ── AI Estimate Chat drawer ────────────────────────────── */}
      <AIEstimateChat
        open={aiEstimateOpen}
        onClose={() => {
          setAiEstimateOpen(false);
          if (!inRoom && state.activeOpportunityId) {
            toast.info('Estimate saved', { description: 'Open the Clients room to keep building it.' });
          }
        }}
      />
    </>
  );
}
