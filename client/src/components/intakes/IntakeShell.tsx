// ============================================================
// IntakeShell — shared full-screen modal shell for all intake forms
// Design: HP Industrial — mobile-first
//
// Mobile (< md): stacked layout — left panel on top, right panel below,
//                scrollable single column
// Desktop (≥ md): two-column side-by-side layout
//
// CustomerGate: enforces 2-step customer-first flow.
//   Step 1: Search existing or create new customer (required gate)
//   Step 2: Opportunity details (existing fields)
// ============================================================

import { useState, useRef, useEffect, ReactNode } from 'react';
import { X, Plus, Trash2, GripVertical, Search, User, UserPlus, ChevronRight, Check, Pencil } from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { nanoid } from 'nanoid';
import { Customer } from '@/lib/types';

export interface SelectedCustomer {
  id: string;
  displayName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

// ─── Types ────────────────────────────────────────────────────
export interface LineItem {
  id: string;
  type: 'service' | 'material';
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxable: boolean;
}

export interface IntakeShellProps {
  title: string;
  /** Called when the user renames the title inline */
  onTitleChange?: (newTitle: string) => void;
  /** Sequential tracking number badge, e.g. "L-001" */
  trackingNumber?: string;
  onClose: () => void;
  onSave: () => void;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  saveLabel?: string;
  /** When set, the shell shows a customer gate step before the main form */
  requireCustomer?: boolean;
  /** Pre-selected customer (bypasses gate step) */
  prefillCustomer?: SelectedCustomer | null;
  /** Called when customer is confirmed in gate step */
  onCustomerConfirmed?: (c: SelectedCustomer) => void;
}

// ─── InlineTitle ─────────────────────────────────────────────
function InlineTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className="text-base sm:text-lg font-semibold text-slate-800 tracking-tight bg-transparent border-b-2 border-primary outline-none min-w-0 w-full max-w-[260px]"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 group min-w-0"
      title="Click to rename"
    >
      <span className="text-base sm:text-lg font-semibold text-slate-800 tracking-tight truncate max-w-[200px] sm:max-w-[320px]">{value}</span>
      <Pencil size={12} className="shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── Shell ────────────────────────────────────────────────────
export default function IntakeShell({
  title, onTitleChange, trackingNumber, onClose, onSave, leftPanel, rightPanel, saveLabel = 'Save',
  requireCustomer = true, prefillCustomer = null, onCustomerConfirmed,
}: IntakeShellProps) {
  const [step, setStep] = useState<'customer' | 'details'>(
    requireCustomer && !prefillCustomer ? 'customer' : 'details'
  );
  const [confirmedCustomer, setConfirmedCustomer] = useState<SelectedCustomer | null>(prefillCustomer ?? null);

  const handleCustomerConfirm = (c: SelectedCustomer) => {
    setConfirmedCustomer(c);
    onCustomerConfirmed?.(c);
    setStep('details');
  };

  if (step === 'customer') {
    return (
      <CustomerGateStep
        title={title}
        onClose={onClose}
        onConfirm={handleCustomerConfirm}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f5f5] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-500 shrink-0"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {trackingNumber && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500 rounded font-mono">
                {trackingNumber}
              </span>
            )}
            {onTitleChange ? (
              <InlineTitle value={title} onChange={onTitleChange} />
            ) : (
              <h1 className="text-base sm:text-lg font-semibold text-slate-800 tracking-tight truncate">
                {title}
              </h1>
            )}
          </div>
          {confirmedCustomer && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check size={11} className="text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[140px]">
                {confirmedCustomer.displayName}
              </span>
              <button
                onClick={() => setStep('customer')}
                className="text-[10px] text-emerald-500 hover:text-emerald-700 underline underline-offset-1 ml-0.5"
              >
                change
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onSave}
          className="shrink-0 ml-3 px-3 sm:px-4 py-1.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
        >
          {saveLabel}
        </button>
      </div>

      {/* Body — stacked on mobile, side-by-side on md+ */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden md:flex">
        {/* Left sidebar */}
        <div className="md:w-72 md:shrink-0 md:border-r border-b md:border-b-0 border-slate-200 bg-white md:overflow-y-auto">
          {leftPanel}
        </div>
        {/* Right main */}
        <div className="flex-1 md:overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}

// ─── Customer Gate Step ───────────────────────────────────────
function CustomerGateStep({
  title,
  onClose,
  onConfirm,
}: {
  title: string;
  onClose: () => void;
  onConfirm: (c: SelectedCustomer) => void;
}) {
  const { state, addCustomer } = useEstimator();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SelectedCustomer | null>(null);
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [newForm, setNewForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const inputRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'search') {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setTimeout(() => firstNameRef.current?.focus(), 50);
    }
  }, [mode]);

  const q = query.toLowerCase();
  const matches = q.length < 1 ? [] : (state.customers ?? []).filter(c => {
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''} ${c.displayName ?? ''}`.toLowerCase();
    return (
      name.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.mobilePhone ?? '').includes(q) ||
      (c.street ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleSelectExisting = (c: typeof matches[0]) => {
    const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    setSelected({
      id: c.id,
      displayName: display,
      phone: c.mobilePhone ?? '',
      email: c.email ?? '',
      address: c.street ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      zip: c.zip ?? '',
    });
    setQuery(display);
  };

  const handleConfirmExisting = () => {
    if (!selected) return;
    onConfirm(selected);
  };

  const handleCreateNew = () => {
    const displayName = [newForm.firstName, newForm.lastName].filter(Boolean).join(' ');
    if (!displayName.trim()) return;
    const id = nanoid(8);
    const customer: Customer = {
      id,
      firstName: newForm.firstName,
      lastName: newForm.lastName,
      displayName,
      company: '',
      mobilePhone: newForm.phone,
      homePhone: '',
      workPhone: '',
      email: newForm.email,
      role: '',
      customerType: 'homeowner',
      doNotService: false,
      street: '',
      unit: '',
      city: '',
      state: 'WA',
      zip: '',
      addressNotes: '',
      customerNotes: '',
      billsTo: '',
      tags: [],
      leadSource: '',
      referredBy: '',
      sendNotifications: true,
      sendMarketingOptIn: false,
      createdAt: new Date().toISOString(),
      lifetimeValue: 0,
      outstandingBalance: 0,
    };
    addCustomer(customer);
    onConfirm({
      id,
      displayName,
      phone: newForm.phone,
      email: newForm.email,
      address: '',
      city: '',
      state: 'WA',
      zip: '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f5f5] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-500 shrink-0">
            <X size={18} />
          </button>
          <h1 className="text-base sm:text-lg font-semibold text-slate-800 tracking-tight">
            {title}
          </h1>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold">1</span>
          <span className="font-medium text-slate-700">Customer</span>
          <ChevronRight size={12} className="text-slate-300" />
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-400 text-[10px] font-bold">2</span>
          <span className="text-slate-400">Details</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">

          {/* Mode tabs */}
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden mb-5 shadow-sm">
            <button
              onClick={() => { setMode('search'); setSelected(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                mode === 'search'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Search size={14} />
              Existing customer
            </button>
            <button
              onClick={() => { setMode('create'); setSelected(null); setQuery(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                mode === 'create'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <UserPlus size={14} />
              New customer
            </button>
          </div>

          {mode === 'search' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Search customers
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelected(null); }}
                    placeholder="Name, email, phone, or address…"
                    className="w-full pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                  />
                  {query && (
                    <button
                      onClick={() => { setQuery(''); setSelected(null); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Search results */}
              {matches.length > 0 && (
                <div>
                  {matches.map(c => {
                    const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
                    const isSelected = selected?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectExisting(c)}
                        className={`w-full text-left px-4 py-3 transition-colors border-b border-slate-100 last:border-0 flex items-center gap-3 ${
                          isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User size={14} className="text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800">{display}</div>
                          <div className="text-xs text-slate-500 truncate">
                            {[c.street, c.city].filter(Boolean).join(', ')}
                            {c.mobilePhone ? ` · ${c.mobilePhone}` : ''}
                          </div>
                        </div>
                        {isSelected && <Check size={15} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {query.length >= 1 && matches.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <div className="text-sm text-slate-500 mb-3">No customers found for "{query}"</div>
                  <button
                    onClick={() => setMode('create')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1.5 mx-auto"
                  >
                    <UserPlus size={14} />
                    Create new customer
                  </button>
                </div>
              )}

              {query.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  Start typing to search {state.customers.length > 0 ? `${state.customers.length} customers` : 'your customer list'}
                </div>
              )}

              {/* Confirm button */}
              {selected && (
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                  <button
                    onClick={handleConfirmExisting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <Check size={15} />
                    Continue with {selected.displayName}
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Create new customer form */
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  New customer info
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">First name *</label>
                      <input
                        ref={firstNameRef}
                        type="text"
                        value={newForm.firstName}
                        onChange={e => setNewForm(f => ({ ...f, firstName: e.target.value }))}
                        placeholder="First"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Last name</label>
                      <input
                        type="text"
                        value={newForm.lastName}
                        onChange={e => setNewForm(f => ({ ...f, lastName: e.target.value }))}
                        placeholder="Last"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Mobile phone</label>
                    <input
                      type="tel"
                      value={newForm.phone}
                      onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="(360) 555-0100"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Email</label>
                    <input
                      type="email"
                      value={newForm.email}
                      onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50">
                <button
                  onClick={handleCreateNew}
                  disabled={!newForm.firstName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <UserPlus size={15} />
                  Create & Continue
                  <ChevronRight size={15} />
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Full profile can be completed after saving
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable sub-components ──────────────────────────────────

/** Customer search box with live autocomplete from state.customers */
export function CustomerSearchBox({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (c: SelectedCustomer) => void;
}) {
  const { state } = useEstimator();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const query = value.toLowerCase();
  const matches = query.length < 1 ? [] : (state.customers ?? []).filter(c => {
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''} ${c.displayName ?? ''}`.toLowerCase();
    return (
      name.includes(query) ||
      (c.email ?? '').toLowerCase().includes(query) ||
      (c.mobilePhone ?? '').includes(query) ||
      (c.street ?? '').toLowerCase().includes(query)
    );
  }).slice(0, 8);

  const handleSelect = (c: typeof matches[0]) => {
    const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    onChange(display);
    setOpen(false);
    onSelect?.({
      id: c.id,
      displayName: display,
      phone: c.mobilePhone ?? '',
      email: c.email ?? '',
      address: c.street ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      zip: c.zip ?? '',
    });
  };

  return (
    <div className="p-4 border-b border-slate-100" ref={ref}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer</span>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Name, email, phone, or address"
          className="w-full pr-8 pl-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
        />
        {value && (
          <button
            onClick={() => { onChange(''); onSelect?.({ id: '', displayName: '', phone: '', email: '', address: '', city: '', state: '', zip: '' }); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
        {open && matches.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {matches.map(c => {
              const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
              return (
                <button
                  key={c.id}
                  onMouseDown={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  <div className="text-sm font-medium text-slate-800">{display}</div>
                  <div className="text-xs text-slate-500">{[c.street, c.city].filter(Boolean).join(', ')} {c.mobilePhone ? '· ' + c.mobilePhone : ''}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button className="mt-2 text-xs text-primary font-medium hover:underline flex items-center gap-1">
        <Plus size={12} /> New customer
      </button>
    </div>
  );
}

/** Collapsible sidebar section */
export function SidebarSection({ label, icon, children, defaultOpen = false }: {
  label: string; icon?: ReactNode; children?: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">{icon}{label}</span>
        <Plus size={14} className={`transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

/** Private notes panel */
export function PrivateNotesPanel({ value, onChange, tabs }: {
  value: string;
  onChange: (v: string) => void;
  tabs?: string[];
}) {
  const [activeTab, setActiveTab] = useState(tabs?.[0] ?? '');
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span>📁</span> Private notes
        </div>
        {tabs && tabs.length > 1 && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {tabs.map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  activeTab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`Private notes for ${activeTab || 'this record'}…`}
        className="w-full px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none min-h-[120px]"
      />
    </div>
  );
}

/** Line items panel with optional cost breakdown */
export function LineItemsPanel({ items, onChange, showCostBreakdown = false }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showCostBreakdown?: boolean;
}) {
  const addItem = (type: 'service' | 'material') => {
    onChange([...items, {
      id: nanoid(8),
      type,
      name: '',
      description: '',
      qty: 1,
      unitPrice: 0,
      taxable: false,
    }]);
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const removeItem = (id: string) => {
    onChange(items.filter(i => i.id !== id));
  };

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = items.filter(i => i.taxable).reduce((s, i) => s + i.qty * i.unitPrice * 0.085, 0);
  const total = subtotal + tax;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-700">Line items</div>
        <div className="flex gap-2">
          <button
            onClick={() => addItem('service')}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            <Plus size={12} /> Service
          </button>
          <span className="text-slate-300">·</span>
          <button
            onClick={() => addItem('material')}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            <Plus size={12} /> Material
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-400">
          No items yet — add services or materials above
        </div>
      ) : (
        <div>
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-5">Name</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-3 text-right">Unit price</div>
            <div className="col-span-1 text-right">Tax</div>
            <div className="col-span-1" />
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-slate-100 last:border-0 items-center">
              <div className="col-span-5">
                <input
                  type="text"
                  value={item.name}
                  onChange={e => updateItem(item.id, { name: e.target.value })}
                  placeholder={item.type === 'service' ? 'Service name' : 'Material name'}
                  className="w-full text-xs border-0 focus:outline-none text-slate-700 placeholder:text-slate-400 bg-transparent"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.qty}
                  min={0}
                  onChange={e => updateItem(item.id, { qty: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs text-right border-0 focus:outline-none text-slate-700 bg-transparent"
                />
              </div>
              <div className="col-span-3">
                <input
                  type="number"
                  value={item.unitPrice}
                  min={0}
                  onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs text-right border-0 focus:outline-none text-slate-700 bg-transparent"
                />
              </div>
              <div className="col-span-1 flex justify-center">
                <input
                  type="checkbox"
                  checked={item.taxable}
                  onChange={e => updateItem(item.id, { taxable: e.target.checked })}
                  className="rounded"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      {(items.length > 0 || showCostBreakdown) && (
        <div className="px-4 py-3 border-t border-slate-100 space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>Tax (8.5%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-slate-800 pt-1 border-t border-slate-100">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export GripVertical for use in drag handles (unused but kept for compatibility)
export { GripVertical };
