// ============================================================
// ThreeSixtyChecklists — Admin page for managing 360° seasonal
// inspection checklists. Operators can view all items, toggle
// active/inactive, edit task names, cascade risk, cost ranges,
// and upsell trigger flags.
// ============================================================

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ArrowLeft,
  Search,
  Save,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';


const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
type Season = typeof SEASONS[number];

const SEASON_LABELS: Record<Season, string> = {
  spring: '🌸 Spring',
  summer: '☀️ Summer',
  fall: '🍂 Fall',
  winter: '❄️ Winter',
};

const CONDITION_COLORS: Record<string, string> = {
  roof: 'bg-red-100 text-red-800 border-red-200',
  hvac: 'bg-orange-100 text-orange-800 border-orange-200',
  plumbing: 'bg-blue-100 text-blue-800 border-blue-200',
  electrical: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  foundation: 'bg-stone-100 text-stone-800 border-stone-200',
  exterior: 'bg-green-100 text-green-800 border-green-200',
  interior: 'bg-purple-100 text-purple-800 border-purple-200',
  appliances: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

interface EditState {
  taskName?: string;
  description?: string;
  estimatedMinutes?: number;
  cascadeRiskBase?: number;
  defaultCostLow?: number;
  defaultCostHigh?: number;
  isUpsellTrigger?: boolean;
  active?: boolean;
}

interface Props { onBack?: () => void; }

export default function ThreeSixtyChecklists({ onBack }: Props) {
  const utils = trpc.useUtils();

  const [activeSeason, setActiveSeason] = useState<Season>('spring');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());

  const { data: items = [], isLoading } = trpc.threeSixty.checklists.getAll.useQuery({ region: 'PNW' });

  const updateMutation = trpc.threeSixty.checklists.update.useMutation({
    onSuccess: (_, vars) => {
      setSaving(prev => { const n = new Set(prev); n.delete(vars.id); return n; });
      setEdits(prev => { const n = { ...prev }; delete n[vars.id]; return n; });
      utils.threeSixty.checklists.getAll.invalidate();
      toast.success('Checklist item updated.');
    },
    onError: (err, vars) => {
      setSaving(prev => { const n = new Set(prev); n.delete(vars.id); return n; });
      toast.error(err.message);
    },
  });

  const seasonItems = useMemo(() => {
    return items.filter(i => i.season === activeSeason);
  }, [items, activeSeason]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return seasonItems;
    return seasonItems.filter(i =>
      (i.taskName ?? '').toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      (i.systemType ?? '').toLowerCase().includes(q)
    );
  }, [seasonItems, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredItems>();
    filteredItems.forEach(item => {
      const cat = item.category ?? 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return map;
  }, [filteredItems]);

  function getEdit<K extends keyof EditState>(id: number, key: K, fallback: EditState[K]): EditState[K] {
    return (edits[id]?.[key] !== undefined ? edits[id][key] : fallback) as EditState[K];
  }

  function setEdit(id: number, key: keyof EditState, value: unknown) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  function saveItem(id: number) {
    const e = edits[id];
    if (!e || Object.keys(e).length === 0) return;
    setSaving(prev => new Set([...prev, id]));
    updateMutation.mutate({ id, ...e });
  }

  function isDirty(id: number) {
    return !!(edits[id] && Object.keys(edits[id]).length > 0);
  }

  const totalItems = items.length;
  const activeCount = items.filter(i => i.active).length;
  const upsellCount = items.filter(i => i.isUpsellTrigger).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => onBack?.()}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">360° Inspection Checklists</h1>
          <p className="text-xs text-muted-foreground">Manage seasonal inspection items, cascade risk scores, and cost estimates</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> {activeCount} active</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {upsellCount} upsell triggers</span>
          <span>{totalItems} total items</span>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search checklist items…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* ── Season tabs ── */}
      <div className="px-4">
        <Tabs value={activeSeason} onValueChange={v => setActiveSeason(v as Season)}>
          <TabsList className="h-8">
            {SEASONS.map(s => (
              <TabsTrigger key={s} value={s} className="text-xs px-3">
                {SEASON_LABELS[s]}
                <Badge variant="secondary" className="ml-1.5 text-[10px] py-0 px-1.5">
                  {items.filter(i => i.season === s).length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {SEASONS.map(s => (
            <TabsContent key={s} value={s} className="mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : grouped.size === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No checklist items found for {SEASON_LABELS[s]}.
                </div>
              ) : (
                <div className="space-y-6 pb-8">
                  {Array.from(grouped.entries()).map(([category, catItems]) => (
                    <div key={category} className="rounded-xl border border-border overflow-hidden">
                      {/* Category header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${CONDITION_COLORS[catItems[0]?.systemType ?? ''] ?? 'bg-muted text-muted-foreground border-border'}`}
                        >
                          {catItems[0]?.systemType ?? category}
                        </span>
                        <span className="font-semibold text-sm text-foreground">{category}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{catItems.length} items</span>
                      </div>

                      {/* Items table */}
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[11px]">
                            <TableHead className="w-8 text-center">On</TableHead>
                            <TableHead className="min-w-[200px]">Task</TableHead>
                            <TableHead className="w-20 text-center">
                              <span className="flex items-center gap-1 justify-center">
                                <TrendingUp className="w-3 h-3" /> Risk
                              </span>
                            </TableHead>
                            <TableHead className="w-28 text-center">Cost Low</TableHead>
                            <TableHead className="w-28 text-center">Cost High</TableHead>
                            <TableHead className="w-20 text-center">Est. Min</TableHead>
                            <TableHead className="w-16 text-center">Upsell</TableHead>
                            <TableHead className="w-16 text-center">Save</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {catItems.map(item => {
                            const dirty = isDirty(item.id);
                            const isSaving = saving.has(item.id);
                            return (
                              <TableRow key={item.id} className={dirty ? 'bg-primary/3' : ''}>
                                {/* Active toggle */}
                                <TableCell className="text-center">
                                  <Switch
                                    checked={getEdit(item.id, 'active', item.active ?? true) as boolean}
                                    onCheckedChange={v => setEdit(item.id, 'active', v)}
                                    className="scale-75"
                                  />
                                </TableCell>

                                {/* Task name */}
                                <TableCell>
                                  <Input
                                    value={getEdit(item.id, 'taskName', item.taskName ?? '') as string}
                                    onChange={e => setEdit(item.id, 'taskName', e.target.value)}
                                    className="h-7 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                                  />
                                </TableCell>

                                {/* Cascade risk */}
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.5}
                                    value={getEdit(item.id, 'cascadeRiskBase', item.cascadeRiskBase ?? 5) as number}
                                    onChange={e => setEdit(item.id, 'cascadeRiskBase', parseFloat(e.target.value) || 0)}
                                    className="h-7 text-xs text-center border-transparent hover:border-input focus:border-input bg-transparent"
                                  />
                                </TableCell>

                                {/* Cost low */}
                                <TableCell>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={getEdit(item.id, 'defaultCostLow', item.defaultCostLow ?? 0) as number}
                                      onChange={e => setEdit(item.id, 'defaultCostLow', parseFloat(e.target.value) || 0)}
                                      className="h-7 text-xs pl-5 border-transparent hover:border-input focus:border-input bg-transparent"
                                    />
                                  </div>
                                </TableCell>

                                {/* Cost high */}
                                <TableCell>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={getEdit(item.id, 'defaultCostHigh', item.defaultCostHigh ?? 0) as number}
                                      onChange={e => setEdit(item.id, 'defaultCostHigh', parseFloat(e.target.value) || 0)}
                                      className="h-7 text-xs pl-5 border-transparent hover:border-input focus:border-input bg-transparent"
                                    />
                                  </div>
                                </TableCell>

                                {/* Estimated minutes */}
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={getEdit(item.id, 'estimatedMinutes', item.estimatedMinutes ?? 0) as number}
                                    onChange={e => setEdit(item.id, 'estimatedMinutes', parseInt(e.target.value) || 0)}
                                    className="h-7 text-xs text-center border-transparent hover:border-input focus:border-input bg-transparent"
                                  />
                                </TableCell>

                                {/* Upsell trigger */}
                                <TableCell className="text-center">
                                  <Switch
                                    checked={getEdit(item.id, 'isUpsellTrigger', item.isUpsellTrigger ?? false) as boolean}
                                    onCheckedChange={v => setEdit(item.id, 'isUpsellTrigger', v)}
                                    className="scale-75"
                                  />
                                </TableCell>

                                {/* Save button */}
                                <TableCell className="text-center">
                                  {dirty ? (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => saveItem(item.id)}
                                      disabled={isSaving}
                                    >
                                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
