/**
 * 360 Method — Visit Detail Page
 * Shows the PNW seasonal checklist for a specific visit with inspect/service tabs.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CheckCircle2, Circle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const SEASON_LABELS: Record<string, string> = {
  spring: '🌸 Spring',
  summer: '☀️ Summer',
  fall: '🍂 Fall',
  winter: '❄️ Winter',
};

interface Props {
  visitId: number;
  membershipId: number;
  onBack: () => void;
}

export default function ThreeSixtyVisitDetail({ visitId, membershipId, onBack }: Props) {
  
  const utils = trpc.useUtils();
  const [techNotes, setTechNotes] = useState('');
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [upsellFlagged, setUpsellFlagged] = useState<Set<number>>(new Set());

  const { data: visit, isLoading: visitLoading } = trpc.threeSixty.visits.get.useQuery({ id: visitId });

  const { data: checklist } = trpc.threeSixty.checklist.getBySeason.useQuery(
    { season: visit?.season as any, region: 'PNW' },
    { enabled: !!visit?.season }
  );

  const completeVisit = trpc.threeSixty.visits.complete.useMutation({
    onSuccess: () => {
      utils.threeSixty.visits.list.invalidate({ membershipId });
      toast('Visit completed and saved');
      onBack();
    },
  });

  if (visitLoading || !visit) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const inspectItems = (checklist ?? []).filter(t => t.category === 'inspect');
  const serviceItems = (checklist ?? []).filter(t => t.category === 'service');
  const flaggedCount = upsellFlagged.size;
  const totalEstimatedMinutes = (checklist ?? [])
    .filter(t => checkedItems.has(t.id))
    .reduce((sum, t) => sum + t.estimatedMinutes, 0);

  const toggleCheck = (id: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleUpsell = (id: number) => {
    setUpsellFlagged(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleComplete = () => {
    const snapshot = JSON.stringify({
      checked: Array.from(checkedItems),
      upsellFlagged: Array.from(upsellFlagged),
    });
    completeVisit.mutate({
      id: visitId,
      technicianNotes: techNotes,
      checklistSnapshot: snapshot,
    });
  };

  return (
    <div className="container py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">
              {SEASON_LABELS[visit.season]} {visit.visitYear} Visit
            </h1>
            <Badge variant={visit.status === 'completed' ? 'default' : 'secondary'}>
              {visit.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            PNW Checklist · {inspectItems.length} inspect · {serviceItems.length} service tasks
            {totalEstimatedMinutes > 0 && ` · ~${Math.round(totalEstimatedMinutes / 60 * 10) / 10} hrs checked`}
          </p>
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{flaggedCount} upsell item{flaggedCount > 1 ? 's' : ''}</strong> flagged — create linked estimates from the customer record.</span>
        </div>
      )}

      <Tabs defaultValue="inspect">
        <TabsList className="mb-4">
          <TabsTrigger value="inspect">
            Inspect ({inspectItems.length})
          </TabsTrigger>
          <TabsTrigger value="service">
            Service ({serviceItems.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Tech Notes</TabsTrigger>
        </TabsList>

        {/* ── INSPECT ─────────────────────────────────────────────── */}
        <TabsContent value="inspect">
          <p className="text-xs text-muted-foreground mb-3">
            Observation and documentation only — no extra charge. Flag items that need follow-up work.
          </p>
          <div className="space-y-2">
            {inspectItems.map(task => (
              <Card
                key={task.id}
                className={`border transition-colors ${checkedItems.has(task.id) ? 'bg-emerald-50 border-emerald-200' : ''}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleCheck(task.id)}
                      className="mt-0.5 shrink-0"
                    >
                      {checkedItems.has(task.id)
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : <Circle className="w-5 h-5 text-muted-foreground" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${checkedItems.has(task.id) ? 'line-through text-muted-foreground' : ''}`}>
                          {task.taskName}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {task.estimatedMinutes}m
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                    </div>
                    {task.isUpsellTrigger && (
                      <button
                        onClick={() => toggleUpsell(task.id)}
                        className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                          upsellFlagged.has(task.id)
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'bg-white border-muted text-muted-foreground hover:border-amber-400 hover:text-amber-700'
                        }`}
                      >
                        {upsellFlagged.has(task.id) ? '⚑ Flagged' : '⚐ Flag'}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── SERVICE ─────────────────────────────────────────────── */}
        <TabsContent value="service">
          <p className="text-xs text-muted-foreground mb-3">
            Included labor within the visit window. Check off each task as completed.
          </p>
          <div className="space-y-2">
            {serviceItems.map(task => (
              <Card
                key={task.id}
                className={`border transition-colors ${checkedItems.has(task.id) ? 'bg-emerald-50 border-emerald-200' : ''}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleCheck(task.id)}
                      className="mt-0.5 shrink-0"
                    >
                      {checkedItems.has(task.id)
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : <Circle className="w-5 h-5 text-muted-foreground" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${checkedItems.has(task.id) ? 'line-through text-muted-foreground' : ''}`}>
                          {task.taskName}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {task.estimatedMinutes}m
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                    </div>
                    {task.isUpsellTrigger && (
                      <button
                        onClick={() => toggleUpsell(task.id)}
                        className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                          upsellFlagged.has(task.id)
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'bg-white border-muted text-muted-foreground hover:border-amber-400 hover:text-amber-700'
                        }`}
                      >
                        {upsellFlagged.has(task.id) ? '⚑ Flagged' : '⚐ Flag'}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── NOTES ───────────────────────────────────────────────── */}
        <TabsContent value="notes">
          <p className="text-xs text-muted-foreground mb-3">
            Technician notes are saved with the visit record and visible to the customer on request.
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

      {/* Complete button */}
      {visit.status !== 'completed' && (
        <div className="mt-6 flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {checkedItems.size} of {(checklist ?? []).length} tasks checked
            {flaggedCount > 0 && ` · ${flaggedCount} flagged for follow-up`}
          </div>
          <Button
            onClick={handleComplete}
            disabled={completeVisit.isPending}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {completeVisit.isPending ? 'Saving…' : 'Complete Visit'}
          </Button>
        </div>
      )}
    </div>
  );
}
