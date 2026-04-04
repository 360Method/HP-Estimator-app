// ============================================================
// CustomersListPage — "All Customers" list view
// Design: Clean white table with search, filter, and a
//         "Create customer" button. Matches the reference
//         design: Display name / Company / Address / Mobile /
//         Email columns with checkbox selection.
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Customer } from '@/lib/types';
import NewCustomerModal from '@/components/NewCustomerModal';
import {
  Search, Filter, SlidersHorizontal, UserPlus,
  ChevronDown, AlertTriangle,
} from 'lucide-react';

export default function CustomersListPage() {
  const { state, addCustomer, setActiveCustomer } = useEstimator();
  const { customers } = state;

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter customers by search query
  const filtered = customers.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.mobilePhone.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const handleCreated = (customer: Customer) => {
    addCustomer(customer);
    setShowModal(false);
    // Immediately open the new customer's profile
    setActiveCustomer(customer.id);
  };

  const handleOpenCustomer = (id: string) => {
    setActiveCustomer(id);
  };

  const formatAddress = (c: Customer) => {
    const parts = [c.street, c.city && c.state ? `${c.city}, ${c.state} ${c.zip}`.trim() : c.city].filter(Boolean);
    return parts.join('\n');
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Page header ── */}
      <div className="bg-white border-b border-border px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <nav className="text-xs text-muted-foreground mb-1">
            Customers &rsaquo; All Customers
          </nav>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">All Customers</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {customers.length} record{customers.length !== 1 ? 's' : ''}
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
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search customers"
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Filter / Edit columns */}
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Filter size={14} />
            Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <SlidersHorizontal size={14} />
            Edit columns
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions (bulk) */}
          {selected.size > 0 && (
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              Actions
              <ChevronDown size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        {customers.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <UserPlus size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground mb-1">No customers yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first customer to get started with leads, estimates, and jobs.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <UserPlus size={14} />
              Create customer
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Display name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Mobile
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No customers match "{searchQuery}"
                    </td>
                  </tr>
                ) : (
                  filtered.map(customer => (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => handleOpenCustomer(customer.id)}
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'}
                          </span>
                          {customer.doNotService && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded">
                              <AlertTriangle size={9} /> DNS
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {customer.company || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {customer.street ? (
                          <div className="whitespace-pre-line text-xs leading-relaxed">
                            {formatAddress(customer)}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {customer.mobilePhone || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
                        {customer.email || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
