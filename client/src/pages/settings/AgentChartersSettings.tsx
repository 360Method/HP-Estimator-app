// ============================================================
// AgentChartersSettings — Admin UI for editing department charters,
// KPI targets, and playbook templates. Two-column layout.
// Changes hit the DB and propagate to next agent run automatically.
// ============================================================

import { useState } from 'react';
import {
  Bot, Users, ChevronRight, ChevronDown, BookOpen, Target, FileText,
  Save, Loader2, AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button }  from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';

const DEPT_LABELS: Record<string, string> = {
  integrator:       'Integrator / Visionary',
  sales:            'Sales & Lead Mgmt',
  operations:       'Operations',
  marketing:        'Marketing',
  finance:          'Finance',
  customer_success: 'Customer Success',
  vendor_network:   'Vendor & Trades',
  technology:       'Technology',
  strategy:         'Strategy & Expansion',
};

type TabId = 'charter' | 'kpis' | 'playbooks';

export default function AgentChartersSettings() {
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>('charter');
  const [editingCharter, setEditingCharter] = useState<string | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: agents,   isLoading: agentsLoading }  = trpc.agents.list.useQuery();
  const { data: charters, refetch: refetchCharters }  = trpc.agents.listCharters.useQuery();
  const { data: agentStatus } = trpc.agents.status.useQuery();

  const { data: kpis, refetch: refetchKpis } = trpc.agents.listKpis.useQuery(
    selectedDept ? { scopeId: selectedDept, scopeType: 'department' } : undefined,
    { enabled: !!selectedDept && activeTab === 'kpis' }
  );
  const { data: playbooks, refetch: refetchPlaybooks } = trpc.playbooks.list.useQuery(
    selectedDept ? { department: selectedDept } : undefined,
    { enabled: !!selectedDept && activeTab === 'playbooks' }
  );
  const { data: charterDetail, refetch: refetchCharterDetail } = trpc.agents.getCharter.useQuery(
    { department: selectedDept! },
    { enabled: !!selectedDept && activeTab === 'charter' }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateCharter  = trpc.agents.updateCharter.useMutation({
    onSuccess: () => { toast.success('Charter saved'); refetchCharters(); refetchCharterDetail(); setEditingCharter(null); },
    onError:   (e) => toast.error(e.message),
  });
  const updateKpi      = trpc.agents.updateKpi.useMutation({
    onSuccess: () => { toast.success('KPI updated'); refetchKpis(); },
    onError:   (e) => toast.error(e.message),
  });
  const updatePlaybook = trpc.playbooks.update.useMutation({
    onSuccess: () => { toast.success('Playbook saved'); refetchPlaybooks(); },
    onError:   (e) => toast.error(e.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const departments = Object.keys(DEPT_LABELS);
  const deptAgents  = (dept: string) => agents?.filter(a => a.department === dept) ?? [];
  const deptStatus  = (dept: string) => {
    const seats = agentStatus?.filter(a => a.department === dept) ?? [];
    if (seats.length === 0) return 'no_agents';
    if (seats.every(s => s.operational)) return 'operational';
    return 'incomplete';
  };

  function toggleDept(dept: string) {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">
      {/* Left: department + seat tree */}
      <aside className="w-64 border-r border-border bg-muted/20 overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-muted-foreground" />
            <span className="text-sm font-bold">Agent Charters</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Edit behavior without touching code
          </p>
        </div>

        <div className="py-1">
          {departments.map(dept => {
            const status   = deptStatus(dept);
            const expanded = expandedDepts.has(dept);
            const seats    = deptAgents(dept);
            return (
              <div key={dept}>
                <button
                  onClick={() => { toggleDept(dept); setSelectedDept(dept); setActiveTab('charter'); }}
                  className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors text-left ${
                    selectedDept === dept
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="truncate text-xs">{DEPT_LABELS[dept]}</span>
                  </div>
                  <StatusDot status={status} />
                </button>

                {expanded && seats.map(seat => (
                  <button
                    key={seat.seatName}
                    onClick={() => { setSelectedDept(dept); setActiveTab('charter'); }}
                    className="w-full flex items-center gap-2 pl-9 pr-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-left"
                  >
                    {seat.isDepartmentHead ? <Bot size={11} /> : <Users size={11} />}
                    <span className="truncate">{seat.seatName}</span>
                    {seat.charterLoaded && (
                      <CheckCircle2 size={10} className="text-emerald-500 ml-auto shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right: tabbed content */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedDept ? (
          <EmptyState />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{DEPT_LABELS[selectedDept] ?? selectedDept}</h2>
              <OperationalBadge seats={agentStatus?.filter(a => a.department === selectedDept) ?? []} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              {(['charter', 'kpis', 'playbooks'] as TabId[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'charter'   && <BookOpen size={13} className="inline mr-1.5 -mt-0.5" />}
                  {tab === 'kpis'      && <Target   size={13} className="inline mr-1.5 -mt-0.5" />}
                  {tab === 'playbooks' && <FileText  size={13} className="inline mr-1.5 -mt-0.5" />}
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab: Charter */}
            {activeTab === 'charter' && (
              <CharterTab
                dept={selectedDept}
                charter={charterDetail ?? null}
                editing={editingCharter}
                setEditing={setEditingCharter}
                onSave={(md) => updateCharter.mutate({ department: selectedDept, markdownContent: md })}
                saving={updateCharter.isPending}
              />
            )}

            {/* Tab: KPIs */}
            {activeTab === 'kpis' && (
              <KpisTab
                kpis={kpis ?? []}
                onUpdate={(id, updates) => updateKpi.mutate({ id, ...updates })}
                saving={updateKpi.isPending}
              />
            )}

            {/* Tab: Playbooks */}
            {activeTab === 'playbooks' && (
              <PlaybooksTab
                playbooks={playbooks ?? []}
                onUpdate={(slug, content) => updatePlaybook.mutate({ slug, content })}
                saving={updatePlaybook.isPending}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === 'operational')
    return <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />;
  if (status === 'incomplete')
    return <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />;
}

function OperationalBadge({ seats }: { seats: { operational: boolean }[] }) {
  if (seats.length === 0) return null;
  const opCount = seats.filter(s => s.operational).length;
  const allOp   = opCount === seats.length;
  return (
    <Badge variant={allOp ? 'default' : 'secondary'} className="text-xs">
      {opCount}/{seats.length} operational
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Bot size={40} className="text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a department</p>
      <p className="text-xs text-muted-foreground mt-1">
        Choose a department from the left panel to view and edit its charter.
      </p>
    </div>
  );
}

function CharterTab({
  dept, charter, editing, setEditing, onSave, saving,
}: {
  dept: string;
  charter: { markdownContent: string; version: number; updatedAt: Date } | null;
  editing: string | null;
  setEditing: (v: string | null) => void;
  onSave: (md: string) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(charter?.markdownContent ?? '');
    setEditing(dept);
  }

  if (editing === dept) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Markdown editor — changes save to DB and propagate to next agent run
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(draft)} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : <Save size={13} className="mr-1" />}
              Save Charter
            </Button>
          </div>
        </div>
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="font-mono text-xs min-h-[500px] resize-y"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {charter ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Version {charter.version} · Last updated {new Date(charter.updatedAt).toLocaleDateString()}
            </p>
            <Button variant="outline" size="sm" onClick={startEdit}>
              Edit Charter
            </Button>
          </div>
          <pre className="text-xs bg-muted/30 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[600px] overflow-y-auto">
            {charter.markdownContent}
          </pre>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-border rounded-lg">
          <AlertCircle size={24} className="text-amber-400 mb-2" />
          <p className="text-sm text-muted-foreground">No charter loaded for this department</p>
          <p className="text-xs text-muted-foreground mt-1">
            Run <code className="bg-muted px-1 rounded">node scripts/seed-charters.mjs</code> to seed
          </p>
        </div>
      )}
    </div>
  );
}

function KpisTab({
  kpis, onUpdate, saving,
}: {
  kpis: any[];
  onUpdate: (id: number, updates: any) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});

  function startEdit(kpi: any) {
    setDraft({ label: kpi.label, targetMin: kpi.targetMin, targetMax: kpi.targetMax, unit: kpi.unit, period: kpi.period });
    setEditing(kpi.id);
  }

  if (kpis.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        No KPIs seeded for this department.{' '}
        <code className="bg-muted px-1 rounded text-xs">node scripts/seed-charters.mjs</code>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Key</th>
            <th className="pb-2 pr-4 font-medium">Label</th>
            <th className="pb-2 pr-4 font-medium">Scope</th>
            <th className="pb-2 pr-4 font-medium">Min</th>
            <th className="pb-2 pr-4 font-medium">Max</th>
            <th className="pb-2 pr-4 font-medium">Unit</th>
            <th className="pb-2 pr-4 font-medium">Period</th>
            <th className="pb-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {kpis.map(kpi => (
            <tr key={kpi.id} className="border-b border-border/50 hover:bg-muted/20">
              {editing === kpi.id ? (
                <>
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{kpi.key}</td>
                  <td className="py-2 pr-4">
                    <Input value={draft.label} onChange={e => setDraft((p: any) => ({ ...p, label: e.target.value }))}
                      className="h-7 text-xs" />
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{kpi.scopeId}</td>
                  <td className="py-2 pr-4">
                    <Input type="number" value={draft.targetMin ?? ''} onChange={e => setDraft((p: any) => ({ ...p, targetMin: e.target.value ? Number(e.target.value) : null }))}
                      className="h-7 text-xs w-20" placeholder="—" />
                  </td>
                  <td className="py-2 pr-4">
                    <Input type="number" value={draft.targetMax ?? ''} onChange={e => setDraft((p: any) => ({ ...p, targetMax: e.target.value ? Number(e.target.value) : null }))}
                      className="h-7 text-xs w-20" placeholder="—" />
                  </td>
                  <td className="py-2 pr-4">
                    <Input value={draft.unit} onChange={e => setDraft((p: any) => ({ ...p, unit: e.target.value }))}
                      className="h-7 text-xs w-16" />
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{kpi.period}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-xs px-2" onClick={() => { onUpdate(kpi.id, draft); setEditing(null); }} disabled={saving}>
                        {saving ? <Loader2 size={10} className="animate-spin" /> : 'Save'}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{kpi.key}</td>
                  <td className="py-2 pr-4">{kpi.label}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{kpi.scopeId}</td>
                  <td className="py-2 pr-4">{kpi.targetMin ?? '—'}</td>
                  <td className="py-2 pr-4">{kpi.targetMax ?? '—'}</td>
                  <td className="py-2 pr-4">{kpi.unit}</td>
                  <td className="py-2 pr-4">{kpi.period}</td>
                  <td className="py-2">
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => startEdit(kpi)}>
                      Edit
                    </Button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlaybooksTab({
  playbooks, onUpdate, saving,
}: {
  playbooks: any[];
  onUpdate: (slug: string, content: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState('');

  if (playbooks.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        No playbooks seeded for this department.{' '}
        <code className="bg-muted px-1 rounded text-xs">node scripts/seed-charters.mjs</code>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {playbooks.map(pb => (
        <div key={pb.slug} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">{pb.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">{pb.slug}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{pb.category}</Badge>
                <span className="text-[10px] text-muted-foreground">v{pb.version}</span>
              </div>
            </div>
            {editing === pb.slug ? (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => { onUpdate(pb.slug, draft); setEditing(null); }} disabled={saving}>
                  {saving ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => { setDraft(pb.content); setEditing(pb.slug); }}>
                Edit
              </Button>
            )}
          </div>
          {editing === pb.slug ? (
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="font-mono text-xs min-h-[200px] resize-y rounded-none border-0 border-t border-border focus-visible:ring-0"
            />
          ) : (
            <pre className="text-xs px-4 py-3 font-mono whitespace-pre-wrap text-muted-foreground max-h-[200px] overflow-y-auto">
              {pb.content}
            </pre>
          )}
          {pb.variables?.length > 0 && (
            <div className="px-4 py-2 border-t border-border/50 bg-muted/10 flex flex-wrap gap-1">
              {pb.variables.map((v: string) => (
                <code key={v} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
