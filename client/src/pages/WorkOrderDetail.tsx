/**
 * WorkOrderDetail.tsx
 * Internal completion wizard for a single 360° Work Order.
 *
 * Flow:
 *  1. Technician opens the work order (status: open | scheduled | in_progress)
 *  2. Rates each checklist item (Good / Monitor / Repair / Urgent / N/A)
 *  3. Adds notes + cost estimates + photos per flagged item
 *  4. Enters overall health score (0-100) and technician notes
 *  5. Clicks "Complete & Send Report" → server generates portal report + email
 *
 * For baseline_scan type: completion auto-creates seasonal work orders for the year.
 * For seasonal types: completion generates the customer-facing portal report.
 */

import { useState, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  ClipboardList,
  Zap,
  Play,
  CalendarClock,
  SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Condition = 'good' | 'monitor' | 'repair_needed' | 'urgent' | 'na' | 'fair';

const CONDITION_CONFIG: Record<Condition, { label: string; color: string; bg: string; border: string }> = {
  good:         { label: '✓ Good',        color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-300' },
  fair:         { label: '~ Fair',         color: 'text-yellow-700',  bg: 'bg-yellow-50',   border: 'border-yellow-300'  },
  monitor:      { label: '👁 Monitor',     color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-300'    },
  repair_needed:{ label: '⚡ Repair',      color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-300'  },
  urgent:       { label: '🚨 Urgent',      color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-300'     },
  na:           { label: '— N/A',          color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border'   },
};

const TYPE_LABELS: Record<string, string> = {
  baseline_scan: '🏠 Baseline Home Scan',
  spring: '🌸 Spring Visit',
  summer: '☀️ Summer Visit',
  fall: '🍂 Fall Visit',
  winter: '❄️ Winter Visit',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-gray-100 text-gray-500',
};

interface ItemState {
  condition: Condition;
  notes: string;
  costLow: string;
  costHigh: string;
  photoUrls: string[];
  expanded: boolean;
}

// Default checklist items by work order type
const BASELINE_CHECKLIST = [
  // Exterior
  { id: 'b-roof',       section: 'Exterior', item: 'Roof condition & shingles',      systemType: 'roof' },
  { id: 'b-gutters',    section: 'Exterior', item: 'Gutters & downspouts',            systemType: 'roof' },
  { id: 'b-siding',     section: 'Exterior', item: 'Siding, trim & paint',            systemType: 'exterior_siding' },
  { id: 'b-foundation', section: 'Exterior', item: 'Foundation & grading',            systemType: 'foundation' },
  { id: 'b-driveway',   section: 'Exterior', item: 'Driveway & walkways',             systemType: 'exterior_siding' },
  { id: 'b-windows',    section: 'Exterior', item: 'Windows & doors (seals, caulk)',  systemType: 'exterior_siding' },
  { id: 'b-deck',       section: 'Exterior', item: 'Deck / patio condition',          systemType: 'exterior_siding' },
  // Systems
  { id: 'b-hvac',       section: 'Systems',  item: 'HVAC age, filter, operation',     systemType: 'hvac' },
  { id: 'b-plumbing',   section: 'Systems',  item: 'Plumbing — visible leaks, water heater', systemType: 'plumbing' },
  { id: 'b-electrical', section: 'Systems',  item: 'Electrical panel & visible wiring', systemType: 'electrical' },
  { id: 'b-appliances', section: 'Systems',  item: 'Major appliances condition',      systemType: 'appliances' },
  // Interior
  { id: 'b-attic',      section: 'Interior', item: 'Attic insulation & ventilation',  systemType: 'interior' },
  { id: 'b-crawl',      section: 'Interior', item: 'Crawl space / basement moisture', systemType: 'foundation' },
  { id: 'b-interior',   section: 'Interior', item: 'Interior walls, ceilings, floors', systemType: 'interior' },
  { id: 'b-smoke',      section: 'Safety',   item: 'Smoke & CO detectors',            systemType: 'interior' },
  { id: 'b-fire',       section: 'Safety',   item: 'Fire extinguisher present',       systemType: 'interior' },
];

const SEASONAL_CHECKLISTS: Record<string, typeof BASELINE_CHECKLIST> = {
  spring: [
    { id: 'sp-roof',    section: 'Exterior', item: 'Roof — winter damage check',        systemType: 'roof' },
    { id: 'sp-gutters', section: 'Exterior', item: 'Clean gutters & flush downspouts',  systemType: 'roof' },
    { id: 'sp-siding',  section: 'Exterior', item: 'Siding & trim — winter wear',       systemType: 'exterior_siding' },
    { id: 'sp-windows', section: 'Exterior', item: 'Window & door seals / caulking',    systemType: 'exterior_siding' },
    { id: 'sp-hvac',    section: 'Systems',  item: 'AC tune-up — filter, coils, test',  systemType: 'hvac' },
    { id: 'sp-plumb',   section: 'Systems',  item: 'Check for frost damage to pipes',   systemType: 'plumbing' },
    { id: 'sp-deck',    section: 'Exterior', item: 'Deck / patio — clean & inspect',    systemType: 'exterior_siding' },
    { id: 'sp-grading', section: 'Exterior', item: 'Grading & drainage after thaw',     systemType: 'foundation' },
    { id: 'sp-smoke',   section: 'Safety',   item: 'Test smoke & CO detectors',         systemType: 'interior' },
  ],
  summer: [
    { id: 'su-hvac',    section: 'Systems',  item: 'AC performance check mid-season',   systemType: 'hvac' },
    { id: 'su-roof',    section: 'Exterior', item: 'Roof — UV & heat damage check',     systemType: 'roof' },
    { id: 'su-ext',     section: 'Exterior', item: 'Exterior paint & caulk condition',  systemType: 'exterior_siding' },
    { id: 'su-irrig',   section: 'Exterior', item: 'Irrigation / sprinkler system',     systemType: 'exterior_siding' },
    { id: 'su-pest',    section: 'Exterior', item: 'Pest / insect entry points',        systemType: 'exterior_siding' },
    { id: 'su-attic',   section: 'Interior', item: 'Attic ventilation & insulation',    systemType: 'interior' },
    { id: 'su-plumb',   section: 'Systems',  item: 'Water heater & plumbing check',     systemType: 'plumbing' },
    { id: 'su-safety',  section: 'Safety',   item: 'Smoke & CO detectors',              systemType: 'interior' },
  ],
  fall: [
    { id: 'fa-hvac',    section: 'Systems',  item: 'Furnace tune-up — filter, igniter, test', systemType: 'hvac' },
    { id: 'fa-gutters', section: 'Exterior', item: 'Clean gutters — leaf removal',      systemType: 'roof' },
    { id: 'fa-roof',    section: 'Exterior', item: 'Roof — pre-winter inspection',      systemType: 'roof' },
    { id: 'fa-windows', section: 'Exterior', item: 'Weatherstrip windows & doors',      systemType: 'exterior_siding' },
    { id: 'fa-pipes',   section: 'Systems',  item: 'Winterize exterior hose bibs',      systemType: 'plumbing' },
    { id: 'fa-attic',   section: 'Interior', item: 'Attic insulation adequacy',         systemType: 'interior' },
    { id: 'fa-chimney', section: 'Exterior', item: 'Chimney / fireplace inspection',    systemType: 'interior' },
    { id: 'fa-safety',  section: 'Safety',   item: 'Smoke & CO detectors — battery swap', systemType: 'interior' },
    { id: 'fa-grading', section: 'Exterior', item: 'Grading & drainage pre-freeze',     systemType: 'foundation' },
  ],
  winter: [
    { id: 'wi-hvac',    section: 'Systems',  item: 'Heating system mid-season check',   systemType: 'hvac' },
    { id: 'wi-pipes',   section: 'Systems',  item: 'Pipe freeze risk assessment',       systemType: 'plumbing' },
    { id: 'wi-roof',    section: 'Exterior', item: 'Roof — ice dam & snow load check',  systemType: 'roof' },
    { id: 'wi-windows', section: 'Interior', item: 'Window condensation / seal failure', systemType: 'exterior_siding' },
    { id: 'wi-attic',   section: 'Interior', item: 'Attic — ice dam prevention check',  systemType: 'interior' },
    { id: 'wi-safety',  section: 'Safety',   item: 'Smoke & CO detectors',              systemType: 'interior' },
    { id: 'wi-ext',     section: 'Exterior', item: 'Exterior — cracks from freeze/thaw', systemType: 'foundation' },
  ],
};

function getChecklist(type: string) {
  if (type === 'baseline_scan') return BASELINE_CHECKLIST;
  return SEASONAL_CHECKLISTS[type] ?? SEASONAL_CHECKLISTS.spring;
}

// ─── Props ────────────────────────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkOrderDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const workOrderId = parseInt(params.id ?? '0', 10);
  function onBack() { navigate('/360/members'); }
  const utils = trpc.useUtils();
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [techNotes, setTechNotes] = useState('');
  const [healthScore, setHealthScore] = useState<string>('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadingForItemId, setUploadingForItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: wo, isLoading } = trpc.workOrders.get.useQuery({ id: workOrderId });
  const membershipId = wo?.membershipId;

  const startMutation = trpc.workOrders.start.useMutation({
    onSuccess: () => {
      utils.workOrders.get.invalidate({ id: workOrderId });
      if (membershipId) utils.workOrders.list.invalidate({ membershipId });
      toast.success('Work order started');
    },
  });

  const completeMutation = trpc.workOrders.complete.useMutation({
    onSuccess: (data) => {
      if (membershipId) utils.workOrders.list.invalidate({ membershipId });
      utils.workOrders.get.invalidate({ id: workOrderId });
      if (data.portalReportId) {
        toast.success('Report generated and sent to customer portal!');
      } else {
        toast.success('Baseline complete — seasonal work orders created!');
      }
      onBack();
    },
    onError: (err) => toast.error(`Failed to complete: ${err.message}`),
  });

  const skipMutation = trpc.workOrders.skip.useMutation({
    onSuccess: () => {
      if (membershipId) utils.workOrders.list.invalidate({ membershipId });
      toast('Work order skipped');
      onBack();
    },
  });

  const uploadPhoto = trpc.threeSixty.propertySystems.uploadPhoto.useMutation();

  if (isLoading || !wo) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const checklist = getChecklist(wo.type);
  const sections = [...new Set(checklist.map(i => i.section))];

  // ── State helpers ──────────────────────────────────────────────────────────

  function getState(id: string): ItemState {
    return itemStates[id] ?? {
      condition: 'good',
      notes: '',
      costLow: '',
      costHigh: '',
      photoUrls: [],
      expanded: false,
    };
  }

  function updateState(id: string, patch: Partial<ItemState>) {
    setItemStates(prev => ({ ...prev, [id]: { ...getState(id), ...patch } }));
  }

  function setCondition(id: string, condition: Condition) {
    const shouldExpand = condition !== 'good' && condition !== 'na';
    updateState(id, { condition, expanded: shouldExpand });
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>, itemId: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Photo must be under 10 MB'); return; }
    setUploading(itemId);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await uploadPhoto.mutateAsync({
        membershipId: wo?.membershipId ?? 0,
        systemType: 'inspection',
          dataUrl: reader.result as string,
          fileName: file.name,
        });
        const prev = getState(itemId);
        updateState(itemId, { photoUrls: [...prev.photoUrls, result.url] });
        toast.success('Photo attached');
      } catch {
        toast.error('Photo upload failed');
      } finally {
        setUploading(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Derived lists ──────────────────────────────────────────────────────────

  const flaggedItems = checklist.filter(i => {
    const c = getState(i.id).condition;
    return c === 'repair_needed' || c === 'urgent';
  });
  const monitorItems = checklist.filter(i => getState(i.id).condition === 'monitor');
  const totalRated = checklist.filter(i => getState(i.id).condition !== 'na').length;

  // ── Completion handler ─────────────────────────────────────────────────────

  function handleComplete() {
    const inspectionItems = checklist.map(item => {
      const s = getState(item.id);
      return {
        id: item.id,
        section: item.section,
        item: item.item,
        condition: s.condition as 'good' | 'fair' | 'repair_needed' | 'urgent' | 'na',
        notes: s.notes || undefined,
        photoUrls: s.photoUrls.length > 0 ? s.photoUrls : undefined,
        estimatedCostLow: s.costLow ? parseFloat(s.costLow) : undefined,
        estimatedCostHigh: s.costHigh ? parseFloat(s.costHigh) : undefined,
      };
    });

    completeMutation.mutate({
      id: workOrderId,
      inspectionItems,
      technicianNotes: techNotes || undefined,
      healthScore: healthScore ? parseInt(healthScore) : undefined,
      laborBankUsed: 0,
    });
  }

  const isCompleted = wo.status === 'completed' || wo.status === 'skipped';
  const isBaseline = wo.type === 'baseline_scan';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="container py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{TYPE_LABELS[wo.type] ?? wo.type}</h1>
            <Badge className={`text-xs ${STATUS_COLORS[wo.status] ?? ''}`}>{wo.status}</Badge>
            <Badge variant="outline" className="text-xs">{wo.visitYear}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {checklist.length} inspection items · {flaggedItems.length} flagged
            {wo.scheduledDate && (
              <span className="ml-2">
                · <CalendarClock className="w-3 h-3 inline mr-0.5" />
                {new Date(wo.scheduledDate).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        {/* Start button */}
        {wo.status === 'open' || wo.status === 'scheduled' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => startMutation.mutate({ id: workOrderId })}
            disabled={startMutation.isPending}
            className="gap-1 shrink-0"
          >
            <Play className="w-3.5 h-3.5" /> Start
          </Button>
        ) : null}
      </div>

      {/* Baseline info banner */}
      {isBaseline && !isCompleted && (
        <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-800">
          <strong>Baseline Home Scan</strong> — Document all property systems and their current condition.
          Completing this will automatically create seasonal visit work orders for the year.
        </div>
      )}

      {/* Summary banners */}
      {flaggedItems.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{flaggedItems.length} item{flaggedItems.length > 1 ? 's' : ''}</strong> need attention —{' '}
            {flaggedItems.slice(0, 3).map(i => i.item).join(', ')}
            {flaggedItems.length > 3 && ` +${flaggedItems.length - 3} more`}
          </span>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <strong>Work order {wo.status}</strong>
            {wo.completedDate && ` on ${new Date(wo.completedDate).toLocaleDateString()}`}
            {wo.status === 'skipped' && wo.skipReason && ` — ${wo.skipReason}`}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="checklist">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="checklist" className="text-xs">
            Checklist ({checklist.length})
          </TabsTrigger>
          <TabsTrigger value="findings" className="text-xs">
            Findings
            {(flaggedItems.length + monitorItems.length) > 0 && (
              <span className="ml-1 bg-red-100 text-red-700 rounded-full px-1.5 text-[10px]">
                {flaggedItems.length + monitorItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes & Score</TabsTrigger>
        </TabsList>

        {/* ── CHECKLIST ─────────────────────────────────────────────── */}
        <TabsContent value="checklist">
          {sections.map(section => (
            <div key={section} className="mb-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {section}
              </h3>
              <div className="space-y-2">
                {checklist.filter(i => i.section === section).map(item => (
                  <InspectionCard
                    key={item.id}
                    item={item}
                    state={getState(item.id)}
                    onCondition={(c) => setCondition(item.id, c)}
                    onUpdate={(patch) => updateState(item.id, patch)}
                    onPhotoClick={() => {
                      setUploadingForItemId(item.id);
                      fileInputRef.current?.click();
                    }}
                    uploading={uploading === item.id}
                    disabled={isCompleted}
                  />
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ── FINDINGS ──────────────────────────────────────────────── */}
        <TabsContent value="findings">
          {(flaggedItems.length + monitorItems.length) === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No issues flagged — all systems good.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedItems.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Needs Attention ({flaggedItems.length})
                  </h3>
                  {flaggedItems.map(item => {
                    const s = getState(item.id);
                    const cfg = CONDITION_CONFIG[s.condition];
                    return (
                      <Card key={item.id} className={`border ${cfg.border} ${cfg.bg}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">{item.item}</span>
                            <Badge className={`text-[10px] ${cfg.color} bg-white border ${cfg.border}`}>
                              {cfg.label}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-1">{item.section} · {item.systemType}</p>
                          {s.notes && <p className="text-xs">{s.notes}</p>}
                          {(s.costLow || s.costHigh) && (
                            <p className="text-xs font-medium text-orange-700 mt-1">
                              Est. cost: ${s.costLow || '?'} – ${s.costHigh || '?'}
                            </p>
                          )}
                          {s.photoUrls.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {s.photoUrls.map(url => (
                                <img key={url} src={url} alt="" className="w-12 h-12 rounded object-cover border" />
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
              {monitorItems.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-1 mt-4">
                    <ClipboardList className="w-4 h-4" /> Monitor ({monitorItems.length})
                  </h3>
                  {monitorItems.map(item => {
                    const s = getState(item.id);
                    return (
                      <Card key={item.id} className="border border-blue-200 bg-blue-50">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">{item.item}</span>
                            <Badge className="text-[10px] text-blue-700 bg-white border border-blue-300">👁 Monitor</Badge>
                          </div>
                          {s.notes && <p className="text-xs">{s.notes}</p>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── NOTES & SCORE ─────────────────────────────────────────── */}
        <TabsContent value="notes">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Home Health Score (0–100)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 82"
                  value={healthScore}
                  onChange={e => setHealthScore(e.target.value)}
                  className="w-28 text-sm"
                  disabled={isCompleted}
                />
                {healthScore && (
                  <span className={`text-sm font-bold ${
                    parseInt(healthScore) >= 75 ? 'text-emerald-600' :
                    parseInt(healthScore) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {parseInt(healthScore) >= 75 ? '✓ Good' : parseInt(healthScore) >= 50 ? '⚠ Fair' : '🚨 Needs Work'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This score appears prominently in the customer report and portal.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Technician Notes
              </label>
              <Textarea
                placeholder="Overall observations, access issues, follow-up recommendations, customer requests…"
                value={techNotes}
                onChange={e => setTechNotes(e.target.value)}
                rows={6}
                className="text-sm"
                disabled={isCompleted}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => uploadingForItemId !== null && handlePhotoUpload(e, uploadingForItemId)}
      />

      {/* Action bar */}
      {!isCompleted && (
        <div className="mt-6 pt-4 border-t flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {totalRated} / {checklist.length} items rated
            {flaggedItems.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                <Zap className="w-3.5 h-3.5 inline mr-0.5" />
                {flaggedItems.length} flagged
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => {
                const reason = window.prompt('Skip reason (optional):') ?? 'No reason provided';
                skipMutation.mutate({ id: workOrderId, reason });
              }}
              disabled={skipMutation.isPending}
            >
              <SkipForward className="w-3.5 h-3.5" /> Skip
            </Button>
            <Button
              onClick={handleComplete}
              disabled={completeMutation.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {completeMutation.isPending
                ? 'Generating Report…'
                : isBaseline
                  ? 'Complete Baseline'
                  : 'Complete & Send Report'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InspectionCard sub-component ────────────────────────────────────────────

interface InspectionCardProps {
  item: { id: string; section: string; item: string; systemType: string };
  state: ItemState;
  onCondition: (c: Condition) => void;
  onUpdate: (patch: Partial<ItemState>) => void;
  onPhotoClick: () => void;
  uploading: boolean;
  disabled?: boolean;
}

function InspectionCard({ item, state, onCondition, onUpdate, onPhotoClick, uploading, disabled }: InspectionCardProps) {
  const cfg = CONDITION_CONFIG[state.condition];
  const hasIssue = state.condition === 'repair_needed' || state.condition === 'urgent' || state.condition === 'monitor';

  return (
    <Card className={`border transition-colors ${
      state.condition !== 'good' && state.condition !== 'na'
        ? `${cfg.bg} ${cfg.border}`
        : ''
    }`}>
      <CardContent className="py-3 px-4">
        {/* Top row */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium">{item.item}</span>
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {item.systemType}
              </span>
            </div>
          </div>
          <button
            onClick={() => onUpdate({ expanded: !state.expanded })}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            {state.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Condition buttons */}
        <div className="grid grid-cols-5 gap-1">
          {(['good', 'monitor', 'repair_needed', 'urgent', 'na'] as Condition[]).map(c => {
            const cc = CONDITION_CONFIG[c];
            return (
              <button
                key={c}
                onClick={() => !disabled && onCondition(c)}
                disabled={disabled}
                className={`py-1 px-1 rounded text-[10px] font-medium border transition-all leading-tight ${
                  state.condition === c
                    ? `${cc.bg} ${cc.border} ${cc.color} ring-1 ring-current ring-offset-1`
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {cc.label}
              </button>
            );
          })}
        </div>

        {/* Expanded details */}
        {(state.expanded || hasIssue) && !disabled && (
          <div className="mt-3 space-y-2 pt-2 border-t border-border/50">
            <Textarea
              placeholder="Notes about this item…"
              value={state.notes}
              onChange={e => onUpdate({ notes: e.target.value })}
              rows={2}
              className="text-xs resize-none"
            />
            {(state.condition === 'repair_needed' || state.condition === 'urgent') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Est. Cost Low ($)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={state.costLow}
                    onChange={e => onUpdate({ costLow: e.target.value })}
                    className="text-xs h-7"
                    min={0}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Est. Cost High ($)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={state.costHigh}
                    onChange={e => onUpdate({ costHigh: e.target.value })}
                    className="text-xs h-7"
                    min={0}
                  />
                </div>
              </div>
            )}
            {/* Photos */}
            <div className="flex items-center gap-2 flex-wrap">
              {state.photoUrls.map(url => (
                <div key={url} className="relative w-14 h-14 rounded overflow-hidden border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => onUpdate({ photoUrls: state.photoUrls.filter(u => u !== url) })}
                    className="absolute top-0 right-0 bg-black/60 rounded-bl p-0.5"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
              <button
                onClick={onPhotoClick}
                disabled={uploading}
                className="w-14 h-14 rounded border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span className="text-[8px] mt-0.5">{uploading ? '…' : 'Photo'}</span>
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
