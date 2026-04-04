// ============================================================
// IntakeShell — shared full-screen modal shell for all intake forms
// Design: HP Industrial — mobile-first
//
// Mobile (< md): stacked layout — left panel on top, right panel below,
//                scrollable single column
// Desktop (≥ md): two-column side-by-side layout
// ============================================================

import { useState, ReactNode } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';

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
  onClose: () => void;
  onSave: () => void;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  saveLabel?: string;
}

// ─── Shell ────────────────────────────────────────────────────
export default function IntakeShell({
  title, onClose, onSave, leftPanel, rightPanel, saveLabel = 'Save',
}: IntakeShellProps) {
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
          <h1 className="text-base sm:text-lg font-semibold text-slate-800 tracking-tight truncate">
            {title}
          </h1>
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

// ─── Reusable sub-components ──────────────────────────────────

/** Customer search box */
export function CustomerSearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-4 border-b border-slate-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer</span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Name, email, phone, or address"
          className="w-full pr-8 pl-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
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
                className={`px-3 py-1 font-medium transition-colors ${
                  activeTab === t ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'
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
        placeholder="Add a private note here"
        rows={3}
        className="w-full px-4 py-3 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none"
      />
    </div>
  );
}

/** Line items panel — mobile-first item rows */
export function LineItemsPanel({
  items, onChange, showCostBreakdown = false,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showCostBreakdown?: boolean;
}) {
  const [taxRate] = useState(0);

  const addItem = (type: 'service' | 'material') => {
    onChange([...items, {
      id: crypto.randomUUID(), type, name: '', description: '', qty: 1, unitPrice: 0, taxable: false,
    }]);
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const removeItem = (id: string) => {
    onChange(items.filter(i => i.id !== id));
  };

  const services = items.filter(i => i.type === 'service');
  const materials = items.filter(i => i.type === 'material');
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const fmt = (n: number) => '$' + n.toFixed(2);

  const ItemRow = ({ item }: { item: LineItem }) => (
    <div className="space-y-2 pb-3 border-b border-slate-100 last:border-0">
      {/* Row 1: name + remove */}
      <div className="flex items-center gap-2">
        <GripVertical size={14} className="text-slate-300 shrink-0 hidden sm:block" />
        <input
          type="text"
          value={item.name}
          onChange={e => updateItem(item.id, { name: e.target.value })}
          placeholder="Item name"
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      {/* Row 2: qty + unit price + total */}
      <div className="flex items-center gap-2 pl-0 sm:pl-6">
        <span className="text-xs text-slate-400 shrink-0">Qty</span>
        <input
          type="number"
          value={item.qty}
          onChange={e => updateItem(item.id, { qty: parseFloat(e.target.value) || 1 })}
          className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30 text-center"
          min={0}
        />
        <span className="text-xs text-slate-400 shrink-0">@ $</span>
        <input
          type="number"
          value={item.unitPrice}
          onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
          min={0}
        />
        <span className="text-sm text-slate-600 shrink-0 w-16 text-right">{fmt(item.qty * item.unitPrice)}</span>
      </div>
      {/* Row 3: description */}
      <div className="pl-0 sm:pl-6">
        <input
          type="text"
          value={item.description}
          onChange={e => updateItem(item.id, { description: e.target.value })}
          placeholder="Description (optional)"
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30 text-slate-500"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-base font-semibold text-slate-800">Line items</span>
        <div className="flex gap-1">
          <button className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <span className="text-xs">≡</span>
          </button>
          <button className="p-1.5 rounded border border-slate-200 bg-slate-100 text-slate-700">
            <span className="text-xs font-bold">≡</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Services */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Services</span>
            <button className="text-xs text-primary font-medium hover:underline">Service Price Book ↗</button>
          </div>
          {services.map(item => <ItemRow key={item.id} item={item} />)}
          <button
            onClick={() => addItem('service')}
            className="flex items-center gap-1 text-sm text-primary font-medium hover:underline mt-2"
          >
            <Plus size={14} /> Add service
          </button>
        </div>

        {/* Materials */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Materials</span>
            <button className="text-xs text-primary font-medium hover:underline">Material Price Book ↗</button>
          </div>
          {materials.map(item => <ItemRow key={item.id} item={item} />)}
          <button
            onClick={() => addItem('material')}
            className="flex items-center gap-1 text-sm text-primary font-medium hover:underline mt-2"
          >
            <Plus size={14} /> Add material
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>Tax rate <span className="text-xs text-slate-400">Out of scope ({(taxRate * 100).toFixed(1)}%)</span></span>
            <span>{fmt(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-slate-800 pt-1 border-t border-slate-200">
            <span>Total</span><span>{fmt(total)}</span>
          </div>
          {showCostBreakdown && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="grid grid-cols-3 text-xs text-slate-500 mb-1">
                <span>Cost breakdown</span>
                <span className="text-right">Total cost</span>
                <span className="text-right">Profit/Loss</span>
              </div>
              <div className="grid grid-cols-3 text-sm text-slate-700">
                <span></span>
                <span className="text-right">{fmt(0)}</span>
                <span className="text-right text-slate-500">0.00 %</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Intake field row */
export function IntakeField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

/** Standard text input */
export function IntakeInput({ placeholder, value, onChange, type = 'text' }: {
  placeholder?: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
    />
  );
}
