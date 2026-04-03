// ============================================================
// SalesSection — Customer-facing visual material selector
// Design: Clean "showroom" aesthetic — show, don't tell.
// Phases shown as expandable cards; each material item shows
// Good / Better / Best photo tiles. Selections sync to Calculator.
// Custom line item form for out-of-scope requests.
// ============================================================

import React, { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { LineItem, Tier, CustomLineItem } from '@/lib/types';
import { ITEM_PHOTOS } from '@/lib/photos';
import { ALL_PHASES } from '@/lib/phases';
import {
  ChevronDown, ChevronRight, CheckCircle2, PlusCircle,
  Trash2, Star, Sparkles, X, ZoomIn, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const TIERS: Tier[] = ['good', 'better', 'best'];
const TIER_LABEL: Record<Tier, string> = { good: 'Good', better: 'Better', best: 'Best' };
const TIER_RING: Record<Tier, string> = {
  good:   'ring-slate-400',
  better: 'ring-blue-500',
  best:   'ring-amber-500',
};
const TIER_BADGE_BG: Record<Tier, string> = {
  good:   'bg-slate-600',
  better: 'bg-blue-600',
  best:   'bg-amber-500',
};
const TIER_INFO_BG: Record<Tier, string> = {
  good:   'bg-slate-50 text-slate-700',
  better: 'bg-blue-50 text-blue-800',
  best:   'bg-amber-50 text-amber-800',
};

interface ModalState {
  open: boolean;
  photo: string;
  title: string;
  tier: Tier;
  desc: string;
  specs?: string;
}

// ── Tier Photo Card ──────────────────────────────────────────
function TierCard({
  item, tier, selected, onSelect, onZoom,
}: {
  item: LineItem;
  tier: Tier;
  selected: boolean;
  onSelect: () => void;
  onZoom: () => void;
}) {
  const tierData = item.tiers[tier];
  const photo = ITEM_PHOTOS[item.id]?.[tier];

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden group',
        selected
          ? `border-transparent ring-2 ${TIER_RING[tier]} shadow-lg scale-[1.01]`
          : 'border-border hover:border-border/60 hover:shadow-md',
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={tierData.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <span className="text-4xl opacity-30">🏗️</span>
          </div>
        )}

        {/* Zoom */}
        {photo && (
          <button
            onClick={(e) => { e.stopPropagation(); onZoom(); }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Tier badge */}
        <div className={cn('absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm', TIER_BADGE_BG[tier])}>
          {TIER_LABEL[tier]}
        </div>

        {/* Selected overlay */}
        {selected && (
          <div className="absolute inset-0 bg-black/15 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-white drop-shadow-lg" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className={cn('p-3 flex-1', TIER_INFO_BG[tier])}>
        <p className="font-semibold text-sm leading-tight">{tierData.name}</p>
        {tierData.desc && <p className="text-xs mt-0.5 opacity-75 leading-snug">{tierData.desc}</p>}
        {tierData.specs && <p className="text-[10px] mt-1 opacity-60 font-mono">{tierData.specs}</p>}
      </div>
    </div>
  );
}

// ── Material Item Row ────────────────────────────────────────
function MaterialItemRow({ item, phaseId }: { item: LineItem; phaseId: number }) {
  const { updateItem } = useEstimator();
  const [modal, setModal] = useState<ModalState>({
    open: false, photo: '', title: '', tier: 'good', desc: '',
  });

  const selectedTier: Tier | null = item.salesSelected ? item.tier : null;

  const handleSelect = (tier: Tier) => {
    if (selectedTier === tier) {
      updateItem(phaseId, item.id, { salesSelected: false });
    } else {
      updateItem(phaseId, item.id, { tier, salesSelected: true, enabled: true });
    }
  };

  const handleZoom = (tier: Tier) => {
    const photo = ITEM_PHOTOS[item.id]?.[tier];
    if (!photo) return;
    setModal({
      open: true,
      photo,
      title: item.name,
      tier,
      desc: item.tiers[tier].desc,
      specs: item.tiers[tier].specs,
    });
  };

  return (
    <div className="mb-6 last:mb-2">
      <div className="flex items-center gap-2 mb-1.5">
        <h4 className="font-semibold text-sm">{item.name}</h4>
        {selectedTier && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full text-white', TIER_BADGE_BG[selectedTier])}>
            {TIER_LABEL[selectedTier]} selected ✓
          </span>
        )}
      </div>
      {item.salesDesc && (
        <p className="text-xs text-muted-foreground mb-3">{item.salesDesc}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {TIERS.map(tier => (
          <TierCard
            key={tier}
            item={item}
            tier={tier}
            selected={selectedTier === tier}
            onSelect={() => handleSelect(tier)}
            onZoom={() => handleZoom(tier)}
          />
        ))}
      </div>

      {/* Zoom modal */}
      <Dialog open={modal.open} onOpenChange={(o) => setModal(m => ({ ...m, open: o }))}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <div className="relative">
            <img src={modal.photo} alt={modal.title} className="w-full object-cover max-h-[65vh]" />
            <button
              onClick={() => setModal(m => ({ ...m, open: false }))}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="w-4 h-4" />
            </button>
            <div className={cn('absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow', TIER_BADGE_BG[modal.tier])}>
              {TIER_LABEL[modal.tier]}
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-bold text-base">{modal.title}</h3>
            {modal.desc && <p className="text-sm text-muted-foreground mt-1">{modal.desc}</p>}
            {modal.specs && <p className="text-xs font-mono text-muted-foreground mt-1">{modal.specs}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Phase Card ───────────────────────────────────────────────
function PhaseCard({ phase }: { phase: (typeof ALL_PHASES)[0] }) {
  const [open, setOpen] = useState(false);
  const { state } = useEstimator();
  const statePhase = state.phases.find(p => p.id === phase.id);
  if (!statePhase) return null;

  const materialItems = statePhase.items.filter(i => i.hasTiers);
  if (materialItems.length === 0) return null;

  const selectedCount = materialItems.filter(i => i.salesSelected).length;

  return (
    <div className="border border-border rounded-xl overflow-hidden mb-3 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{phase.icon}</span>
          <div>
            <span className="font-semibold text-sm">{phase.name}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {materialItems.length} option{materialItems.length !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedCount > 0 && (
            <Badge className="bg-emerald-600 text-white text-[10px]">
              {selectedCount} selected
            </Badge>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pt-4 pb-2 bg-background border-t border-border">
          {materialItems.map(item => (
            <MaterialItemRow key={item.id} item={item} phaseId={phase.id} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Line Item Form ────────────────────────────────────
function CustomItemForm() {
  const { state, addCustomItem, removeCustomItem } = useEstimator();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<CustomLineItem, 'id'>>({
    phaseId: 11,
    description: '',
    unitType: 'unit',
    qty: 1,
    matCostPerUnit: 0,
    laborHrsPerUnit: 0,
    laborRate: state.global.laborRate,
    notes: '',
  });

  const handleAdd = () => {
    if (!form.description.trim()) return;
    addCustomItem(form);
    setForm(f => ({ ...f, description: '', notes: '', qty: 1, matCostPerUnit: 0, laborHrsPerUnit: 0 }));
    setOpen(false);
  };

  return (
    <div className="border-2 border-dashed border-border rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm">Custom / Out-of-Scope Items</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)} className="gap-1.5 text-xs">
          <PlusCircle className="w-3.5 h-3.5" />
          Add Custom Item
        </Button>
      </div>

      {/* Existing custom items */}
      {state.customItems.length > 0 && (
        <div className="space-y-2 mb-3">
          {state.customItems.map(ci => {
            const phase = ALL_PHASES.find(p => p.id === ci.phaseId);
            const hardCost = ci.qty * (ci.matCostPerUnit + ci.laborHrsPerUnit * ci.laborRate);
            return (
              <div key={ci.id} className="flex items-start justify-between bg-muted/50 rounded-lg px-3 py-2.5 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ci.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {phase?.name} · {ci.qty} {ci.unitType} · ${hardCost.toFixed(0)} hard cost
                  </p>
                  {ci.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{ci.notes}</p>}
                </div>
                <button
                  onClick={() => removeCustomItem(ci.id)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {open && (
        <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (customer-facing)</label>
              <Input
                placeholder="e.g. Custom built-in bookcase, master bedroom"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phase</label>
              <Select value={String(form.phaseId)} onValueChange={v => setForm(f => ({ ...f, phaseId: Number(v) }))}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PHASES.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.icon} {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit type</label>
              <Select value={form.unitType} onValueChange={v => setForm(f => ({ ...f, unitType: v as CustomLineItem['unitType'] }))}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['unit','sqft','lf','hr','door','window','fixture','step'].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</label>
              <Input type="number" min={0} value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))}
                className="text-sm h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Material $/unit (hard cost)</label>
              <Input type="number" min={0} step={0.01} value={form.matCostPerUnit}
                onChange={e => setForm(f => ({ ...f, matCostPerUnit: Number(e.target.value) }))}
                className="text-sm h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Labor hrs/unit</label>
              <Input type="number" min={0} step={0.25} value={form.laborHrsPerUnit}
                onChange={e => setForm(f => ({ ...f, laborHrsPerUnit: Number(e.target.value) }))}
                className="text-sm h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Labor rate ($/hr)</label>
              <Input type="number" min={0} value={form.laborRate}
                onChange={e => setForm(f => ({ ...f, laborRate: Number(e.target.value) }))}
                className="text-sm h-9" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Internal notes (not shown to customer)</label>
              <Textarea
                placeholder="Scope clarification, sub required, etc."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none"
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={!form.description.trim()}>
              Add to Estimate
            </Button>
          </div>
        </div>
      )}

      {state.customItems.length === 0 && !open && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Add items outside the standard scope — custom built-ins, specialty work, unique requests.
        </p>
      )}
    </div>
  );
}

// ── Main SalesSection ────────────────────────────────────────
export default function SalesSection() {
  const { state } = useEstimator();
  const totalSelected = state.phases.reduce(
    (sum, p) => sum + p.items.filter(i => i.salesSelected).length, 0,
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold tracking-tight">Material Selection</h2>
          {totalSelected > 0 && (
            <Badge className="bg-emerald-600 text-white">
              {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
            </Badge>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            Review each category with your client. Tap a photo to zoom in. Tap a tier to select it — selections flow automatically into the estimate.
          </p>
        </div>
      </div>

      {/* Phase cards */}
      {ALL_PHASES.map(phase => (
        <PhaseCard key={phase.id} phase={phase} />
      ))}

      {/* Custom items */}
      <CustomItemForm />
    </div>
  );
}
