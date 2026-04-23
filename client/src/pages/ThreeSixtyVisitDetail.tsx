/**
 * 360 Method — Visit Detail Page (Sprint 3 upgrade)
 * Full 360° inspection flow: condition-based ratings, per-item notes,
 * cost estimates, structured findings, and cascade-risk-aware completion.
 */
import { useState, useRef } from 'react';
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
  Circle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  DollarSign,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';

const SEASON_LABELS: Record<string, string> = {
  spring: '🌸 Spring',
  summer: '☀️ Summer',
  fall: '🍂 Fall',
  winter: '❄️ Winter',
};

type Condition = 'good' | 'monitor' | 'repair_needed' | 'urgent' | 'na';

interface ItemState {
  condition: Condition;
  notes: string;
  costLow: string;
  costHigh: string;
  photoUrls: string[];
  expanded: boolean;
}

const CONDITION_CONFIG: Record<Condition, { label: string; color: string; bg: string; border: string }> = {
  good:         { label: '✓ Good',        color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-300' },
  monitor:      { label: '👁 Monitor',     color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-300'    },
  repair_needed:{ label: '⚡ Repair',      color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-300'  },
  urgent:       { label: '🚨 Urgent',      color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-300'     },
  na:           { label: '— N/A',          color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border'   },
};

interface Props {
  visitId: number;
  membershipId: number;
  onBack: () => void;
}

export default function ThreeSixtyVisitDetail({ visitId, membershipId, onBack }: Props) {
  const utils = trpc.useUtils();
  const [techNotes, setTechNotes] = useState('');
  const [itemStates, setItemStates] = useState<Record<number, ItemState>>({});
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingForItemId, setUploadingForItemId] = useState<number | null>(null);

  const { data: visit, isLoading: visitLoading } = trpc.threeSixty.visits.get.useQuery({ id: visitId });
  const { data: checklist } = trpc.threeSixty.checklist.getBySeason.useQuery(
    { season: visit?.season as any, region: 'PNW' },
    { enabled: !!visit?.season }
  );
  const uploadPhoto = trpc.threeSixty.propertySystems.uploadPhoto.useMutation();

  const completeVisit = trpc.threeSixty.visits.complete.useMutation({
    onSuccess: () => {
      utils.threeSixty.visits.list.invalidate({ membershipId });
      utils.threeSixty.scans.list.invalidate({ membershipId });
      toast.success('Visit completed — report generated');
      onBack();
    },
    onError: () => toast.error('Failed to complete visit'),
  });

  if (visitLoading || !visit) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const inspectItems = (checklist ?? []).filter(t => t.category === 'inspect');
  const serviceItems = (checklist ?? []).filter(t => t.category === 'service');

  function getState(id: number): ItemState {
    return itemStates[id] ?? {
      condition: 'good',
      notes: '',
      costLow: '',
      costHigh: '',
      photoUrls: [],
      expanded: false,
    };
  }

  function updateState(id: number, patch: Partial<ItemState>) {
    setItemStates(prev => ({
      ...prev,
      [id]: { ...getState(id), ...patch },
    }));
  }

  function setCondition(id: number, condition: Condition) {
    const shouldExpand = condition !== 'good' && condition !== 'na';
    updateState(id, { condition, expanded: shouldExpand });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>, itemId: number) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5 MB'); return; }
    setUploading(itemId);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await uploadPhoto.mutateAsync({
          membershipId,
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

  const flaggedItems = (checklist ?? []).filter(t => {
    const s = getState(t.id);
    return s.condition === 'repair_needed' || s.condition === 'urgent';
  });

  const monitorItems = (checklist ?? []).filter(t => getState(t.id).condition === 'monitor');

  const handleComplete = () => {
    const inspectionItems = (checklist ?? []).map(task => {
      const s = getState(task.id);
      return {
        section: task.category === 'inspect' ? 'Inspection' : 'Service',
        itemName: task.taskName,
        condition: s.condition,
        notes: s.notes || undefined,
        photoUrls: s.photoUrls,
        estimatedCostLow: s.costLow ? parseFloat(s.costLow) : (task.defaultCostLow ? parseFloat(String(task.defaultCostLow)) : undefined),
        estimatedCostHigh: s.costHigh ? parseFloat(s.costHigh) : (task.defaultCostHigh ? parseFloat(String(task.defaultCostHigh)) : undefined),
        systemType: task.systemType ?? undefined,
      };
    });

    // Legacy snapshot for backward compat
    const legacyChecked = (checklist ?? [])
      .filter(t => getState(t.id).condition !== 'na')
      .map(t => t.id);
    const legacyFlagged = flaggedItems.map(t => t.id);
    const checklistSnapshot = JSON.stringify({ checked: legacyChecked, upsellFlagged: legacyFlagged });

    completeVisit.mutate({
      id: visitId,
      technicianNotes: techNotes,
      checklistSnapshot,
      inspectionItems,
      laborBankUsed: 0,
    });
  };

  const totalChecked = (checklist ?? []).filter(t => getState(t.id).condition !== 'na').length;

  return (
    <div className="container py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">
              {SEASON_LABELS[visit.season]} {visit.visitYear} Visit
            </h1>
            <Badge variant={visit.status === 'completed' ? 'default' : 'secondary'}>
              {visit.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            360° Inspection · {inspectItems.length} inspect · {serviceItems.length} service tasks
          </p>
        </div>
      </div>

      {/* Summary banners */}
      {flaggedItems.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{flaggedItems.length} item{flaggedItems.length > 1 ? 's' : ''}</strong> need attention —{' '}
            {flaggedItems.map(t => t.taskName).join(', ')}
          </span>
        </div>
      )}
      {monitorItems.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2 text-sm text-blue-800">
          <ClipboardList className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{monitorItems.length} item{monitorItems.length > 1 ? 's' : ''}</strong> to monitor
          </span>
        </div>
      )}

      <Tabs defaultValue="inspect">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="inspect" className="text-xs">
            Inspect ({inspectItems.length})
          </TabsTrigger>
          <TabsTrigger value="service" className="text-xs">
            Service ({serviceItems.length})
          </TabsTrigger>
          <TabsTrigger value="findings" className="text-xs">
            Findings {(flaggedItems.length + monitorItems.length) > 0 && (
              <span className="ml-1 bg-red-100 text-red-700 rounded-full px-1.5 text-[10px]">
                {flaggedItems.length + monitorItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
        </TabsList>

        {/* ── INSPECT ─────────────────────────────────────────────── */}
        <TabsContent value="inspect">
          <p className="text-xs text-muted-foreground mb-3">
            Rate each item's condition. Items rated Repair or Urgent will auto-populate the report.
          </p>
          <div className="space-y-2">
            {inspectItems.map(task => (
              <InspectionCard
                key={task.id}
                task={task}
                state={getState(task.id)}
                onCondition={(c) => setCondition(task.id, c)}
                onUpdate={(patch) => updateState(task.id, patch)}
                onPhotoClick={() => {
                  setUploadingForItemId(task.id);
                  fileInputRef.current?.click();
                }}
                uploading={uploading === task.id}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── SERVICE ─────────────────────────────────────────────── */}
        <TabsContent value="service">
          <p className="text-xs text-muted-foreground mb-3">
            Included labor within the visit window. Rate each task as completed or flag issues.
          </p>
          <div className="space-y-2">
            {serviceItems.map(task => (
              <InspectionCard
                key={task.id}
                task={task}
                state={getState(task.id)}
                onCondition={(c) => setCondition(task.id, c)}
                onUpdate={(patch) => updateState(task.id, patch)}
                onPhotoClick={() => {
                  setUploadingForItemId(task.id);
                  fileInputRef.current?.click();
                }}
                uploading={uploading === task.id}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── FINDINGS ────────────────────────────────────────────── */}
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
                    <AlertTriangle className="w-4 h-4" /> Needs Attention
                  </h3>
                  {flaggedItems.map(task => {
                    const s = getState(task.id);
                    const cfg = CONDITION_CONFIG[s.condition];
                    return (
                      <Card key={task.id} className={`border ${cfg.border} ${cfg.bg}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">{task.taskName}</span>
                            <Badge className={`text-[10px] ${cfg.color} bg-white border ${cfg.border}`}>
                              {cfg.label}
                            </Badge>
                          </div>
                          {task.systemType && (
                            <p className="text-xs text-muted-foreground mb-1">System: {task.systemType}</p>
                          )}
                          {s.notes && <p className="text-xs">{s.notes}</p>}
                          {(s.costLow || s.costHigh || task.defaultCostLow || task.defaultCostHigh) && (
                            <p className="text-xs font-medium text-orange-700 mt-1">
                              Est. cost: ${s.costLow || task.defaultCostLow || '?'} – ${s.costHigh || task.defaultCostHigh || '?'}
                            </p>
                          )}
                          {s.photoUrls.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {s.photoUrls.map(url => (
                                <img key={url} src={url} alt="" className="w-10 h-10 rounded object-cover border" />
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
                    <ClipboardList className="w-4 h-4" /> Monitor
                  </h3>
                  {monitorItems.map(task => {
                    const s = getState(task.id);
                    return (
                      <Card key={task.id} className="border border-blue-200 bg-blue-50">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">{task.taskName}</span>
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

        {/* ── NOTES ───────────────────────────────────────────────── */}
        <TabsContent value="notes">
          <p className="text-xs text-muted-foreground mb-3">
            Technician notes are saved with the visit and included in the customer report.
          </p>
          <Textarea
            placeholder="Add technician notes, observations, or follow-up recommendations…"
            value={techNotes}
            onChange={e => setTechNotes(e.target.value)}
            rows={8}
            className="text-sm"
          />
        </TabsContent>
      </Tabs>

      {/* Hidden file input for photo uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => uploadingForItemId !== null && handlePhotoUpload(e, uploadingForItemId)}
      />

      {/* Complete button */}
      {visit.status !== 'completed' && (
        <div className="mt-6 flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {totalChecked} of {(checklist ?? []).length} tasks rated
            {flaggedItems.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">{flaggedItems.length} flagged</span>
            )}
          </div>
          <Button
            onClick={handleComplete}
            disabled={completeVisit.isPending}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {completeVisit.isPending ? 'Generating Report…' : 'Complete & Generate Report'}
          </Button>
        </div>
      )}

      {visit.status === 'completed' && (
        <div className="mt-6 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Visit completed — view the report in the Scans tab.
        </div>
      )}
    </div>
  );
}

// ─── Inspection Card sub-component ───────────────────────────────────────────
interface InspectionCardProps {
  task: {
    id: number;
    taskName: string;
    description?: string | null;
    estimatedMinutes: number;
    isUpsellTrigger: boolean;
    systemType?: string | null;
    defaultCostLow?: string | null;
    defaultCostHigh?: string | null;
  };
  state: ItemState;
  onCondition: (c: Condition) => void;
  onUpdate: (patch: Partial<ItemState>) => void;
  onPhotoClick: () => void;
  uploading: boolean;
}

function InspectionCard({ task, state, onCondition, onUpdate, onPhotoClick, uploading }: InspectionCardProps) {
  const cfg = CONDITION_CONFIG[state.condition];
  const hasIssue = state.condition === 'repair_needed' || state.condition === 'urgent' || state.condition === 'monitor';

  return (
    <Card className={`border transition-colors ${state.condition !== 'good' && state.condition !== 'na' ? `${cfg.bg} ${cfg.border}` : ''}`}>
      <CardContent className="py-3 px-4">
        {/* Top row: task name + condition selector */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium">{task.taskName}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-3 h-3" /> {task.estimatedMinutes}m
              </span>
              {task.systemType && (
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {task.systemType}
                </span>
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
            )}
          </div>
          <button
            onClick={() => onUpdate({ expanded: !state.expanded })}
            className="shrink-0 text-muted-foreground hover:text-foreground"
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
                onClick={() => onCondition(c)}
                className={`py-1 px-1 rounded text-[10px] font-medium border transition-all leading-tight ${
                  state.condition === c
                    ? `${cc.bg} ${cc.border} ${cc.color} ring-1 ring-current ring-offset-1`
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {cc.label}
              </button>
            );
          })}
        </div>

        {/* Expanded details */}
        {(state.expanded || hasIssue) && (
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
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Cost Low ($)</label>
                  <Input
                    type="number"
                    placeholder={task.defaultCostLow ?? '0'}
                    value={state.costLow}
                    onChange={e => onUpdate({ costLow: e.target.value })}
                    className="text-xs h-7"
                    min={0}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Cost High ($)</label>
                  <Input
                    type="number"
                    placeholder={task.defaultCostHigh ?? '0'}
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
                <div key={url} className="relative w-12 h-12 rounded overflow-hidden border">
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
                className="w-12 h-12 rounded border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="text-[8px] mt-0.5">{uploading ? '…' : 'Photo'}</span>
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
