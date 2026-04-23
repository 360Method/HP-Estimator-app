/**
 * ManualMergeFlow
 * ───────────────
 * Two-step merge flow launched from the customer profile:
 *   Step 1 — Search & pick a second customer to merge with.
 *   Step 2 — Side-by-side MergeCustomerDialog to confirm which fields to keep.
 */
import { useState } from 'react';
import { X, Search, User } from 'lucide-react';
import { Customer } from '@/lib/types';
import MergeCustomerDialog from '@/components/MergeCustomerDialog';

interface Props {
  currentCustomer: Customer;
  allCustomers: Customer[];
  onClose: () => void;
  onMerged: (sourceId: string, targetId: string) => void;
}

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

export default function ManualMergeFlow({ currentCustomer, allCustomers, onClose, onMerged }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = allCustomers.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (c.displayName ?? '').toLowerCase().includes(q) ||
      (c.firstName ?? '').toLowerCase().includes(q) ||
      (c.lastName ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.mobilePhone ?? '').includes(q) ||
      (c.company ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 50);

  // Step 2: show the full merge dialog
  if (selected) {
    return (
      <MergeCustomerDialog
        open
        onOpenChange={open => { if (!open) setSelected(null); }}
        customerA={currentCustomer}
        customerB={selected}
        onMerged={onMerged}
      />
    );
  }

  // Step 1: customer picker
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Merge customer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Merging <span className="font-semibold text-foreground">{currentCustomer.displayName || currentCustomer.firstName}</span> with…
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Search by name, email, phone…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Customer list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <User size={28} className="mb-2 opacity-30" />
              <p className="text-sm">No customers found</p>
            </div>
          )}
          {filtered.map(c => {
            const tags = parseTags(c.tags);
            const name = c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown';
            const sub = [c.email, c.mobilePhone, c.city].filter(Boolean).join(' · ');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="w-full text-left px-5 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{name}</div>
                  {sub && <div className="text-xs text-muted-foreground truncate mt-0.5">{sub}</div>}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 text-xs text-muted-foreground">
          {filtered.length} customer{filtered.length !== 1 ? 's' : ''} shown
          {query && ` matching "${query}"`}
        </div>
      </div>
    </div>
  );
}
