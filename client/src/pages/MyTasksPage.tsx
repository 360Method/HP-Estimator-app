// ============================================================
// MyTasksPage — Aggregated personal task list
//   • Shows all job tasks across all opportunities
//   • Filter by: All / My Tasks (assigned to me) / Incomplete / Complete
//   • Sort by: Priority / Due Date / Job
//   • Click a task to navigate to that job
// ============================================================

import { useState, useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { JobTask, JobTaskPriority } from '@/lib/types';
import {
  ArrowLeft, CheckCircle2, Circle, Flag, AlertCircle,
  Briefcase, Filter, SortAsc, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

const PRIORITY_CONFIG: Record<JobTaskPriority, { label: string; color: string; icon: React.ReactNode; order: number }> = {
  high:   { label: 'High',   color: 'text-rose-500',  icon: <AlertCircle size={12} />, order: 0 },
  normal: { label: 'Normal', color: 'text-sky-500',   icon: <Flag size={12} />,        order: 1 },
  low:    { label: 'Low',    color: 'text-slate-400', icon: <Circle size={12} />,      order: 2 },
};

type FilterMode = 'all' | 'mine' | 'incomplete' | 'complete';
type SortMode = 'priority' | 'job' | 'created';

interface TaskRow extends JobTask {
  oppId: string;
  oppTitle: string;
  customerName: string;
}

interface Props {
  onBack: () => void;
}

export default function MyTasksPage({ onBack }: Props) {
  const { state, updateJobTask, setActiveOpportunity, setSection } = useEstimator();
  // Note: customer name is pulled from clientSnapshot on the opportunity
  const profile = state.userProfile;
  const myName = `${profile.firstName} ${profile.lastName}`.trim();

  const [filter, setFilter] = useState<FilterMode>('incomplete');
  const [sort, setSort] = useState<SortMode>('priority');

  // Flatten all tasks across all opportunities
  const allTasks = useMemo<TaskRow[]>(() => {
    const rows: TaskRow[] = [];
    state.opportunities.forEach(opp => {
      const customerName = opp.clientSnapshot?.client || '';
      (opp.tasks ?? []).forEach(task => {
        rows.push({ ...task, oppId: opp.id, oppTitle: opp.title, customerName });
      });
    });
    return rows;
  }, [state.opportunities, state.customers]);

  const filtered = useMemo(() => {
    let rows = allTasks;
    if (filter === 'mine') rows = rows.filter(t => t.assignedTo && t.assignedTo.toLowerCase().includes(myName.toLowerCase()));
    if (filter === 'incomplete') rows = rows.filter(t => !t.completed);
    if (filter === 'complete') rows = rows.filter(t => t.completed);
    // Sort
    if (sort === 'priority') {
      rows = [...rows].sort((a, b) => PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order);
    } else if (sort === 'job') {
      rows = [...rows].sort((a, b) => a.oppTitle.localeCompare(b.oppTitle));
    } else {
      rows = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return rows;
  }, [allTasks, filter, sort, myName]);

  const handleToggle = (task: TaskRow) => {
    updateJobTask(task.oppId, task.id, {
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
    });
    toast.success(task.completed ? 'Task reopened' : 'Task completed');
  };

  const handleNavigate = (task: TaskRow) => {
    setActiveOpportunity(task.oppId);
    setSection('job-details');
    onBack();
  };

  const incompleteCount = allTasks.filter(t => !t.completed).length;
  const completeCount = allTasks.filter(t => t.completed).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground leading-tight">My Tasks</h1>
          <p className="text-xs text-muted-foreground">{incompleteCount} open · {completeCount} complete</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Filter + Sort bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter size={12} /> Filter:
          </div>
          {(['all', 'mine', 'incomplete', 'complete'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors capitalize ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'mine' ? 'Assigned to me' : f}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <SortAsc size={12} /> Sort:
          </div>
          {(['priority', 'job', 'created'] as SortMode[]).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors capitalize ${
                sort === s
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Task list */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-sm font-semibold">
              {filter === 'incomplete' ? 'All caught up! No open tasks.' : 'No tasks match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(task => {
              const pc = PRIORITY_CONFIG[task.priority];
              return (
                <div
                  key={`${task.oppId}-${task.id}`}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 group transition-colors ${
                    task.completed ? 'bg-muted/20 opacity-60' : 'bg-card hover:bg-muted/30'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(task)}
                    className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                  >
                    {task.completed
                      ? <CheckCircle2 size={17} className="text-emerald-500" />
                      : <Circle size={17} />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {/* Priority */}
                      <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${pc.color}`}>
                        {pc.icon} {pc.label}
                      </span>
                      {/* Assignee */}
                      {task.assignedTo && (
                        <span className="text-[10px] text-muted-foreground">→ {task.assignedTo}</span>
                      )}
                      {/* Job link */}
                      <button
                        onClick={() => handleNavigate(task)}
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      >
                        <Briefcase size={10} />
                        {task.oppTitle}
                        {task.customerName && ` · ${task.customerName}`}
                        <ExternalLink size={9} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
