// Routed entry point for a single client ("client umbrella").
//
// Phase C of the client-umbrella revamp: give the umbrella a real, deep-linkable
// URL (/admin/clients/:id/:tab?) without touching the internals of the large
// CustomerSection component. This is a thin adapter — it reads the route params,
// primes the EstimatorContext (active customer + tab), and renders the existing
// admin app (Home), which already shows CustomerSection when the active section
// is "customer". The old inline flow (clicking a row in the customers list) keeps
// working unchanged; this just lets a client page survive a refresh, be
// bookmarked, and be linked to directly.
import { useEffect, useRef } from 'react';
import { useRoute } from 'wouter';
import { useEstimator } from '@/contexts/EstimatorContext';
import type { CustomerProfileTab } from '@/lib/types';
import Home from '@/pages/Home';

// Canonical tabs that may appear in the URL. Anything else is ignored and the
// customer's last/default tab is used (CustomerSection also redirects legacy
// tab keys, so we don't need to replicate that table here).
const URL_TABS: CustomerProfileTab[] = [
  'overview', 'properties', 'opportunities', 'schedule', 'roadmap', 'membership', 'billing', 'portal',
];

export default function ClientDetailPage() {
  const [, params] = useRoute('/admin/clients/:id/:tab?');
  const { state, setActiveCustomer, setCustomerTab } = useEstimator();

  const id = params?.id ?? null;
  const tab = params?.tab as CustomerProfileTab | undefined;

  // Focus the customer named in the URL (no-op if already active, so navigating
  // between tabs of the same client doesn't reset it).
  useEffect(() => {
    if (id && state.activeCustomerId !== id) {
      setActiveCustomer(id, 'direct');
    }
  }, [id, state.activeCustomerId, setActiveCustomer]);

  // Apply the tab from the URL when it changes — one-shot, URL → state only.
  // Components inside the umbrella (quick actions, count tiles) may change the
  // tab through context without touching the URL; re-applying the stale URL
  // tab on every state change would snap those navigations straight back.
  const appliedUrlTab = useRef<CustomerProfileTab | null>(null);
  useEffect(() => {
    if (tab && URL_TABS.includes(tab) && tab !== appliedUrlTab.current) {
      appliedUrlTab.current = tab;
      if (state.activeCustomerTab !== tab) setCustomerTab(tab);
    }
  }, [tab, state.activeCustomerTab, setCustomerTab]);

  return <Home />;
}
