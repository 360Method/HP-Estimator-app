// SchedulePage — World-class scheduling hub for Handy Pioneers
// Day / Week / Month calendar views, drag-to-reschedule, color-coded event types,
// filters, and deep links to opportunities/jobs.
// ============================================================

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, List, Grid3X3,
  Briefcase, ClipboardList, RefreshCw, CheckSquare, Phone,
  Filter, X, Clock, MapPin, User, MoreHorizontal, Trash2,
  Edit2, ExternalLink, ChevronDown,
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { ScheduleEvent, ScheduleEventType, Customer, Opportunity } from '@/lib/types';
import { trpc } from '@/lib/trpc';

// ── Color palette per event type ──────────────────────────────
const EVENT_COLORS: Record<ScheduleEventType, { bg: string; border: string; text: string; dot: string; badge: string }> = {
  estimate:   { bg: 'bg-blue-500/15',   border: 'border-blue-500',   text: 'text-blue-700',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  job:        { bg: 'bg-emerald-500/15', border: 'border-emerald-500', text: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  recurring:  { bg: 'bg-violet-500/15', border: 'border-violet-500', text: 'text-violet-700', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  task:       { bg: 'bg-amber-500/15',  border: 'border-amber-500',  text: 'text-amber-700',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  follow_up:  { bg: 'bg-rose-500/15',   border: 'border-rose-500',   text: 'text-rose-700',   dot: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-700' },
};

const EVENT_TYPE_LABELS: Record<ScheduleEventType, string> = {
  estimate: 'Estimate Visit',
  job: 'Job / Work Order',
  recurring: 'Recurring',
  task: 'Task',
  follow_up: 'Follow-Up',
};

const EVENT_TYPE_ICONS: Record<ScheduleEventType, React.ReactNode> = {
  estimate:  <ClipboardList className="w-3 h-3" />,
  job:       <Briefcase className="w-3 h-3" />,
  recurring: <RefreshCw className="w-3 h-3" />,
  task:      <CheckSquare className="w-3 h-3" />,
  follow_up: <Phone className="w-3 h-3" />,
};

// ── Date helpers ──────────────────────────────────────────────
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateHeader(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // pad start
  for (let i = 0; i < first.getDay(); i++) {
    days.push(new Date(year, month, -first.getDay() + 1 + i));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // pad end to fill 6 rows
  while (days.length < 42) {
    const last2 = days[days.length - 1];
    days.push(addDays(last2, 1));
  }
  return days;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WORK_HOURS = { start: 7, end: 19 }; // 7am–7pm

// ── Event form defaults ───────────────────────────────────────
function defaultEventForDate(date: Date): Partial<ScheduleEvent> {
  const start = new Date(date);
  start.setHours(8, 0, 0, 0);
  const end = new Date(date);
  end.setHours(10, 0, 0, 0);
  return {
    type: 'job',
    title: '',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    assignedTo: [],
    notes: '',
    completed: false,
  };
}

// ── EventChip — compact chip for month/week grid ─────────────
interface EventChipProps {
  event: ScheduleEvent;
  onClick: () => void;
  compact?: boolean;
  customer?: Customer;
}

function EventChip({ event, onClick, compact, customer }: EventChipProps) {
  const c = EVENT_COLORS[event.type];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded px-1.5 py-0.5 border-l-2 ${c.bg} ${c.border} ${c.text} hover:opacity-80 transition-opacity group`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="shrink-0">{EVENT_TYPE_ICONS[event.type]}</span>
        <span className={`truncate font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {event.title || 'Untitled'}
        </span>
        {!compact && !event.allDay && (
          <span className="text-[10px] opacity-70 shrink-0">{formatTime(event.start)}</span>
        )}
      </div>
      {!compact && customer && (
        <div className="text-[10px] opacity-60 truncate pl-4">{customer.displayName}</div>
      )}
    </button>
  );
}

// ── EventDetailPanel — slide-in detail view ──────────────────
interface EventDetailPanelProps {
  event: ScheduleEvent;
  customer?: Customer;
  opportunity?: Opportunity;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}

function EventDetailPanel({ event, customer, opportunity, onClose, onEdit, onDelete, onNavigate }: EventDetailPanelProps) {
  const c = EVENT_COLORS[event.type];
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-[420px] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 rounded-t-2xl sm:rounded-t-2xl ${c.bg} border-b ${c.border}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`p-1.5 rounded-lg ${c.badge}`}>{EVENT_TYPE_ICONS[event.type]}</span>
              <div className="min-w-0">
                <div className={`text-xs font-medium ${c.text}`}>{EVENT_TYPE_LABELS[event.type]}</div>
                <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{event.title || 'Untitled Event'}</h3>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-600 transition-colors" title="Edit">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Date/time */}
          <div className="flex items-start gap-2 text-sm text-gray-700">
            <Clock className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
            <div>
              {event.allDay ? (
                <div>{startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              ) : (
                <>
                  <div>{startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  <div className="text-gray-500">{formatTime(event.start)} – {formatTime(event.end)}</div>
                </>
              )}
            </div>
          </div>

          {/* Customer */}
          {customer && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{customer.displayName}</span>
              {customer.mobilePhone && (
                <a href={`tel:${customer.mobilePhone}`} className="text-blue-600 text-xs ml-auto">{customer.mobilePhone}</a>
              )}
            </div>
          )}

          {/* Address */}
          {customer?.street && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {customer.street}, {customer.city}, {customer.state}
              </a>
            </div>
          )}

          {/* Assigned to */}
          {event.assignedTo.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-500">Crew:</span>
              <span>{event.assignedTo.join(', ')}</span>
            </div>
          )}

          {/* Opportunity link */}
          {opportunity && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200">
              <div className="min-w-0">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{opportunity.area}</div>
                <div className="text-sm font-medium text-gray-800 truncate">{opportunity.title}</div>
                <div className="text-xs text-gray-500">{opportunity.stage} · ${opportunity.value.toLocaleString()}</div>
              </div>
              <button
                onClick={onNavigate}
                className="ml-2 p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors shrink-0"
                title="Open in app"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Notes</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}

          {/* Status */}
          {event.completed && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <CheckSquare className="w-4 h-4" />
              Completed {event.completedAt ? `on ${new Date(event.completedAt).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EventFormModal — create/edit event ───────────────────────
interface EventFormModalProps {
  initial: Partial<ScheduleEvent>;
  customers: Customer[];
  onSave: (event: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

function EventFormModal({ initial, customers, onSave, onClose }: EventFormModalProps) {
  const [form, setForm] = useState<Partial<ScheduleEvent>>({ ...initial });
  const [assignedInput, setAssignedInput] = useState(initial.assignedTo?.join(', ') || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState(initial.customerId || '');
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(!!initial.recurrence);
  const [recurrenceFreq, setRecurrenceFreq] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly'>(initial.recurrence?.frequency || 'weekly');
  const [recurrenceEnd, setRecurrenceEnd] = useState(initial.recurrence?.endDate || '');

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const availableOpportunities = selectedCustomer?.opportunities?.filter(o => !o.archived) || [];

  function toLocalDatetimeInput(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalDatetimeInput(val: string): string {
    return new Date(val).toISOString();
  }

  function handleSave() {
    if (!form.title?.trim()) return;
    const assigned = assignedInput.split(',').map(s => s.trim()).filter(Boolean);
    onSave({
      type: form.type || 'job',
      title: form.title!,
      start: form.start || new Date().toISOString(),
      end: form.end || new Date().toISOString(),
      allDay: form.allDay || false,
      opportunityId: form.opportunityId,
      customerId: selectedCustomerId || undefined,
      assignedTo: assigned,
      notes: form.notes || '',
      color: form.color,
      completed: form.completed || false,
      recurrence: recurrenceEnabled ? { frequency: recurrenceFreq, endDate: recurrenceEnd || undefined } : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{initial.id ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Event type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Event Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(EVENT_TYPE_LABELS) as ScheduleEventType[]).map(t => {
                const c = EVENT_COLORS[t];
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${
                      active ? `${c.bg} ${c.border} ${c.text}` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {EVENT_TYPE_ICONS[t]}
                    <span className="text-[10px] leading-tight text-center">{EVENT_TYPE_LABELS[t].split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Install baseboard — Smith residence"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* All day toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={form.allDay || false}
              onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="allDay" className="text-sm text-gray-700">All day</label>
          </div>

          {/* Date/time */}
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={toLocalDatetimeInput(form.start)}
                  onChange={e => setForm(f => ({ ...f, start: fromLocalDatetimeInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                <input
                  type="datetime-local"
                  value={toLocalDatetimeInput(form.end)}
                  onChange={e => setForm(f => ({ ...f, end: fromLocalDatetimeInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
          {form.allDay && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={form.start ? form.start.split('T')[0] : ''}
                onChange={e => {
                  const d = e.target.value;
                  setForm(f => ({
                    ...f,
                    start: new Date(d + 'T00:00:00').toISOString(),
                    end: new Date(d + 'T23:59:59').toISOString(),
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Customer */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer (optional)</label>
            <select
              value={selectedCustomerId}
              onChange={e => {
                setSelectedCustomerId(e.target.value);
                setForm(f => ({ ...f, customerId: e.target.value || undefined, opportunityId: undefined }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— No customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
          </div>

          {/* Opportunity */}
          {selectedCustomerId && availableOpportunities.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Linked Opportunity (optional)</label>
              <select
                value={form.opportunityId || ''}
                onChange={e => setForm(f => ({ ...f, opportunityId: e.target.value || undefined }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— None —</option>
                {availableOpportunities.map(o => (
                  <option key={o.id} value={o.id}>{o.area.toUpperCase()}: {o.title} (${o.value.toLocaleString()})</option>
                ))}
              </select>
            </div>
          )}

          {/* Assigned to */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To (comma-separated)</label>
            <input
              type="text"
              value={assignedInput}
              onChange={e => setAssignedInput(e.target.value)}
              placeholder="e.g. Mike, Sarah"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Recurrence */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="recurrence"
                checked={recurrenceEnabled}
                onChange={e => setRecurrenceEnabled(e.target.checked)}
                className="rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="recurrence" className="text-sm text-gray-700 font-medium">Repeating event</label>
            </div>
            {recurrenceEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                  <select
                    value={recurrenceFreq}
                    onChange={e => setRecurrenceFreq(e.target.value as typeof recurrenceFreq)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End date (optional)</label>
                  <input
                    type="date"
                    value={recurrenceEnd}
                    onChange={e => setRecurrenceEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Additional details, instructions, access codes…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title?.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {initial.id ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main SchedulePage ─────────────────────────────────────────
type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export default function SchedulePage() {
  const { state, addScheduleEvent, updateScheduleEvent, removeScheduleEvent, navigateToTopLevel, setActiveCustomer, setActiveOpportunity, setSection, setScheduleFilter } = useEstimator();

  // ── DB mutations (dual-write: localStorage + DB) ─────────────────────────────────────
  const createScheduleEventMutation = trpc.schedule.create.useMutation({
    onError: (err) => console.warn('[SchedulePage] DB create failed:', err.message),
  });
  const updateScheduleEventMutation = trpc.schedule.update.useMutation({
    onError: (err) => console.warn('[SchedulePage] DB update failed:', err.message),
  });
  const deleteScheduleEventMutation = trpc.schedule.delete.useMutation({
    onError: (err) => console.warn('[SchedulePage] DB delete failed:', err.message),
  });

  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<ScheduleEvent> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createForDate, setCreateForDate] = useState<Date>(new Date());

  // Filters
  const [filterTypes, setFilterTypes] = useState<Set<ScheduleEventType>>(new Set());
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterOpportunityId, setFilterOpportunityId] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Deep-link: pre-apply job filter from state.scheduleFilterJobId on mount
  useEffect(() => {
    if (state.scheduleFilterJobId) {
      setFilterOpportunityId(state.scheduleFilterJobId);
      setShowFilters(true);
      // Clear the deep-link after applying so navigating away and back doesn't re-apply
      setScheduleFilter(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag state
  const dragEventRef = useRef<ScheduleEvent | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ── Derived data ──────────────────────────────────────────
  const allEvents = useMemo(() => {
    let events = state.scheduleEvents;

    // Also synthesize events from opportunities that have scheduledDate
    const synthEvents: ScheduleEvent[] = [];
    state.customers.forEach(customer => {
      (customer.opportunities || []).forEach(opp => {
        if (opp.scheduledDate && !opp.archived) {
          const existing = events.find(e => e.opportunityId === opp.id);
          if (!existing) {
            const start = new Date(opp.scheduledDate);
            const end = opp.scheduledEndDate
              ? new Date(opp.scheduledEndDate)
              : new Date(start.getTime() + (opp.scheduledDuration || 120) * 60000);
            synthEvents.push({
              id: `synth-${opp.id}`,
              type: opp.area === 'job' ? 'job' : 'estimate',
              title: opp.title,
              start: start.toISOString(),
              end: end.toISOString(),
              allDay: false,
              opportunityId: opp.id,
              customerId: customer.id,
              assignedTo: opp.assignedTo ? opp.assignedTo.split(',').map(s => s.trim()) : [],
              notes: opp.scheduleNotes || '',
              completed: ['Completed', 'Invoice Paid', 'Invoice Sent'].includes(opp.stage),
              createdAt: opp.createdAt,
              updatedAt: opp.updatedAt,
            });
          }
        }
      });
    });
    events = [...events, ...synthEvents];

    // Expand recurring events into instances within a 90-day window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30); // include past 30 days
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 90);

    const expandedEvents: ScheduleEvent[] = [];
    events.forEach(ev => {
      if (!ev.recurrence) {
        expandedEvents.push(ev);
        return;
      }
      const { frequency, endDate } = ev.recurrence;
      const recEnd = endDate ? new Date(endDate) : windowEnd;
      const effectiveEnd = recEnd < windowEnd ? recEnd : windowEnd;

      const stepMs: Record<string, number> = {
        daily: 86400000,
        weekly: 7 * 86400000,
        biweekly: 14 * 86400000,
        monthly: 0, // handled separately
      };

      const baseStart = new Date(ev.start);
      const baseEnd = new Date(ev.end);
      const durationMs = baseEnd.getTime() - baseStart.getTime();

      let instanceStart = new Date(baseStart);
      let instanceIndex = 0;
      while (instanceStart <= effectiveEnd) {
        if (instanceStart >= windowStart) {
          const instanceEnd = new Date(instanceStart.getTime() + durationMs);
          expandedEvents.push({
            ...ev,
            id: instanceIndex === 0 ? ev.id : `${ev.id}-r${instanceIndex}`,
            start: instanceStart.toISOString(),
            end: instanceEnd.toISOString(),
            _isRecurrenceInstance: instanceIndex > 0,
            _parentId: ev.id,
          } as ScheduleEvent & { _isRecurrenceInstance?: boolean; _parentId?: string });
        }
        instanceIndex++;
        if (frequency === 'monthly') {
          const next = new Date(instanceStart);
          next.setMonth(next.getMonth() + 1);
          instanceStart = next;
        } else {
          instanceStart = new Date(instanceStart.getTime() + stepMs[frequency]);
        }
        if (instanceIndex > 365) break; // safety cap
      }
    });
    events = expandedEvents;

    // Apply filters
    if (filterTypes.size > 0) {
      events = events.filter(e => filterTypes.has(e.type));
    }
    if (filterCustomerId) {
      events = events.filter(e => e.customerId === filterCustomerId);
    }
    if (filterAssignee) {
      events = events.filter(e => e.assignedTo.some(a => a.toLowerCase().includes(filterAssignee.toLowerCase())));
    }
    if (filterStatus === 'pending') {
      events = events.filter(e => !e.completed);
    } else if (filterStatus === 'completed') {
      events = events.filter(e => e.completed);
    }
    if (filterOpportunityId) {
      events = events.filter(e => e.opportunityId === filterOpportunityId);
    }
    return events;
  }, [state.scheduleEvents, state.customers, filterTypes, filterCustomerId, filterOpportunityId, filterAssignee, filterStatus]);

  const getEventsForDay = useCallback((day: Date) => {
    return allEvents.filter(e => isSameDay(new Date(e.start), day));
  }, [allEvents]);

  const getCustomer = useCallback((customerId?: string) => {
    if (!customerId) return undefined;
    return state.customers.find(c => c.id === customerId);
  }, [state.customers]);

  const getOpportunity = useCallback((opportunityId?: string, customerId?: string) => {
    if (!opportunityId || !customerId) return undefined;
    const customer = state.customers.find(c => c.id === customerId);
    return customer?.opportunities?.find(o => o.id === opportunityId);
  }, [state.customers]);

  // ── Navigation ────────────────────────────────────────────
  function navigate(dir: -1 | 1) {
    setCurrentDate(d => {
      if (view === 'day') return addDays(d, dir);
      if (view === 'week') return addWeeks(d, dir);
      if (view === 'month') return addMonths(d, dir);
      return addDays(d, dir * 7);
    });
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  // ── Header label ──────────────────────────────────────────
  function getHeaderLabel(): string {
    if (view === 'day') return formatDateHeader(currentDate);
    if (view === 'week') return formatWeekRange(startOfWeek(currentDate));
    if (view === 'month') return formatMonthYear(currentDate);
    return 'Agenda';
  }

  // ── Event actions ─────────────────────────────────────────
  function handleCreateEvent(date: Date) {
    setCreateForDate(date);
    setEditingEvent(defaultEventForDate(date));
    setIsCreating(true);
  }

  function handleSaveEvent(payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>) {
    if (editingEvent?.id) {
      // 1. Update local state
      updateScheduleEvent(editingEvent.id, payload);
      // 2. Persist to DB
      updateScheduleEventMutation.mutate({
        id: editingEvent.id,
        data: {
          ...payload,
          assignedTo: Array.isArray(payload.assignedTo)
            ? JSON.stringify(payload.assignedTo)
            : (payload.assignedTo ?? '[]'),
        },
      });
    } else {
      // Pre-generate ID so we can write to both local state and DB with the same ID
      const newId = Math.random().toString(36).slice(2, 10);
      // 1. Update local state with pre-generated ID
      addScheduleEvent({ ...payload, id: newId });
      // 2. Persist to DB
      createScheduleEventMutation.mutate({
        id: newId,
        type: payload.type,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        allDay: payload.allDay ?? false,
        opportunityId: payload.opportunityId,
        customerId: payload.customerId,
        assignedTo: Array.isArray(payload.assignedTo)
          ? JSON.stringify(payload.assignedTo)
          : (payload.assignedTo ?? '[]'),
        notes: payload.notes ?? '',
        color: payload.color,
        completed: payload.completed ?? false,
        completedAt: payload.completedAt,
        recurrence: payload.recurrence ? JSON.stringify(payload.recurrence) : undefined,
        parentEventId: payload.parentEventId,
      });
    }
    setEditingEvent(null);
    setIsCreating(false);
  }

  function handleDeleteEvent(id: string) {
    // 1. Update local state
    removeScheduleEvent(id);
    // 2. Persist to DB
    deleteScheduleEventMutation.mutate({ id });
    setSelectedEvent(null);
  }

  function handleNavigateToOpportunity(event: ScheduleEvent) {
    if (!event.customerId) return;
    setActiveCustomer(event.customerId);
    if (event.opportunityId) {
      setActiveOpportunity(event.opportunityId);
      const opp = getOpportunity(event.opportunityId, event.customerId);
      if (opp) {
        setSection(opp.area === 'job' ? 'job-details' : 'estimate');
      }
    } else {
      setSection('customer');
    }
    setSelectedEvent(null);
  }

  // ── Drag and drop ─────────────────────────────────────────
  function handleDragStart(event: ScheduleEvent) {
    dragEventRef.current = event;
    setDraggingId(event.id);
  }

  function handleDragEnd() {
    dragEventRef.current = null;
    setDraggingId(null);
  }

  // targetHour: when dropping on a time-slot cell, pass the hour for precision
  function handleDropOnDay(targetDay: Date, targetHour?: number) {
    const ev = dragEventRef.current;
    if (!ev) return;
    const origStart = new Date(ev.start);
    const origEnd = new Date(ev.end);
    const duration = origEnd.getTime() - origStart.getTime();
    const newStart = new Date(targetDay);
    // Use time-slot hour if provided (week/day views), else preserve original time
    if (targetHour !== undefined) {
      newStart.setHours(targetHour, 0, 0, 0);
    } else {
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
    }
    const newEnd = new Date(newStart.getTime() + duration);
    if (!ev.id.startsWith('synth-')) {
      updateScheduleEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
      updateScheduleEventMutation.mutate({
        id: ev.id,
        data: { start: newStart.toISOString(), end: newEnd.toISOString() },
      });
    }
    handleDragEnd();
  }

  // ── Resize (drag bottom handle to extend end time) ────────
  const resizeEventRef = useRef<ScheduleEvent | null>(null);
  const resizeStartYRef = useRef<number>(0);
  const resizeOrigEndRef = useRef<Date>(new Date());
  const [resizingId, setResizingId] = useState<string | null>(null);

  function handleResizeStart(e: React.MouseEvent, ev: ScheduleEvent) {
    e.stopPropagation();
    e.preventDefault();
    resizeEventRef.current = ev;
    resizeStartYRef.current = e.clientY;
    resizeOrigEndRef.current = new Date(ev.end);
    setResizingId(ev.id);

    // Commit only on mouseup — no live updates to avoid excessive re-renders
    function onMouseUp(ue: MouseEvent) {
      const deltaY = ue.clientY - resizeStartYRef.current;
      const deltaHours = deltaY / 56; // 56px per hour (h-14)
      const deltaMs = deltaHours * 3600 * 1000;
      const newEnd = new Date(resizeOrigEndRef.current.getTime() + deltaMs);
      const minEnd = new Date(new Date(resizeEventRef.current!.start).getTime() + 30 * 60 * 1000);
      if (newEnd > minEnd && !resizeEventRef.current!.id.startsWith('synth-')) {
        const evId = resizeEventRef.current!.id;
        updateScheduleEvent(evId, { end: newEnd.toISOString() });
        updateScheduleEventMutation.mutate({ id: evId, data: { end: newEnd.toISOString() } });
      }
      setResizingId(null);
      resizeEventRef.current = null;
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Filter toggle ─────────────────────────────────────────
  function toggleTypeFilter(t: ScheduleEventType) {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  const activeFilterCount = filterTypes.size + (filterCustomerId ? 1 : 0) + (filterOpportunityId ? 1 : 0) + (filterAssignee ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0);

  // ── Render ────────────────────────────────────────────────
  const weekStart = startOfWeek(currentDate);
  const weekDays = getWeekDays(weekStart);
  const monthDays = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const today = new Date();

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ minHeight: 'calc(100vh - 56px)' }}>
      {/* ── Top toolbar ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Period label */}
        <h2 className="text-base font-semibold text-gray-900 flex-1 min-w-0 truncate">{getHeaderLabel()}</h2>

        {/* View switcher */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['month', 'week', 'day', 'agenda'] as CalendarView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
            activeFilterCount > 0
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filter'}
        </button>

        {/* New event */}
        <button
          onClick={() => handleCreateEvent(currentDate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Event</span>
        </button>
      </div>

      {/* ── Filter bar ── */}
      {showFilters && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Event type:</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EVENT_TYPE_LABELS) as ScheduleEventType[]).map(t => {
              const c = EVENT_COLORS[t];
              const active = filterTypes.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTypeFilter(t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                    active ? `${c.bg} ${c.border} ${c.text}` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {EVENT_TYPE_ICONS[t]}
                  {EVENT_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide ml-2">Customer:</span>
          <select
            value={filterCustomerId}
            onChange={e => setFilterCustomerId(e.target.value)}
            className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All customers</option>
            {state.customers.map(c => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide ml-2">Assignee:</span>
          <input
            type="text"
            placeholder="Search crew..."
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
          />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide ml-2">Status:</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | 'pending' | 'completed')}
            className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterTypes(new Set()); setFilterCustomerId(''); setFilterOpportunityId(null); setFilterAssignee(''); setFilterStatus('all'); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-1.5 flex items-center gap-4 overflow-x-auto">
        {(Object.keys(EVENT_TYPE_LABELS) as ScheduleEventType[]).map(t => (
          <div key={t} className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${EVENT_COLORS[t].dot}`} />
            <span className="text-xs text-gray-500">{EVENT_TYPE_LABELS[t]}</span>
          </div>
        ))}
        <div className="ml-auto text-xs text-gray-400 shrink-0">{allEvents.length} event{allEvents.length !== 1 ? 's' : ''}</div>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex-1 overflow-auto">

        {/* MONTH VIEW */}
        {view === 'month' && (
          <div className="p-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
              {monthDays.map((day, i) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = isSameDay(day, today);
                const dayEvents = getEventsForDay(day);
                const MAX_VISIBLE = 3;

                return (
                  <div
                    key={i}
                    className={`bg-white min-h-[90px] p-1 cursor-pointer hover:bg-blue-50/30 transition-colors ${
                      !isCurrentMonth ? 'opacity-40' : ''
                    }`}
                    onClick={() => { setCurrentDate(day); setView('day'); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDropOnDay(day)}
                  >
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                    }`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, MAX_VISIBLE).map(ev => (
                        <div
                          key={ev.id}
                          draggable={!ev.id.startsWith('synth-')}
                          onDragStart={() => handleDragStart(ev)}
                          onDragEnd={handleDragEnd}
                          className={draggingId === ev.id ? 'opacity-40' : ''}
                        >
                          <EventChip
                            event={ev}
                            compact
                            customer={getCustomer(ev.customerId)}
                            onClick={() => { setSelectedEvent(ev); }}
                          />
                        </div>
                      ))}
                      {dayEvents.length > MAX_VISIBLE && (
                        <button
                          onClick={e => { e.stopPropagation(); setCurrentDate(day); setView('day'); }}
                          className="text-[10px] text-blue-600 font-medium hover:underline pl-1"
                        >
                          +{dayEvents.length - MAX_VISIBLE} more
                        </button>
                      )}
                    </div>
                    {/* Quick add */}
                    <button
                      onClick={e => { e.stopPropagation(); handleCreateEvent(day); }}
                      className="hidden group-hover:flex w-full mt-1 text-[10px] text-gray-400 hover:text-blue-600 items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WEEK VIEW */}
        {view === 'week' && (
          <div className="flex flex-col h-full">
            {/* Day headers */}
            <div className="grid grid-cols-8 bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="border-r border-gray-200 py-2" />
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, today);
                const dayEvents = getEventsForDay(day);
                return (
                  <div
                    key={i}
                    className={`border-r border-gray-200 py-2 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                      isToday ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => { setCurrentDate(day); setView('day'); }}
                  >
                    <div className="text-xs text-gray-500">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-lg font-semibold mx-auto w-8 h-8 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-900'
                    }`}>
                      {day.getDate()}
                    </div>
                    {dayEvents.length > 0 && (
                      <div className="flex justify-center gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <span key={ev.id} className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[ev.type].dot}`} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-8">
                {/* Hour labels */}
                <div className="border-r border-gray-200">
                  {HOURS.map(h => (
                    <div
                      key={h}
                      className={`h-14 border-b border-gray-100 flex items-start justify-end pr-2 pt-1 ${
                        h < WORK_HOURS.start || h >= WORK_HOURS.end ? 'bg-gray-50/50' : ''
                      }`}
                    >
                      <span className="text-[10px] text-gray-400">
                        {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day, di) => {
                  const isToday = isSameDay(day, today);
                  const dayEvents = getEventsForDay(day).filter(e => !e.allDay);

                  return (
                    <div
                      key={di}
                      className={`border-r border-gray-200 relative ${isToday ? 'bg-blue-50/20' : ''}`}
                    >
                      {HOURS.map(h => (
                        <div
                          key={h}
                          className={`h-14 border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer transition-colors ${
                            h < WORK_HOURS.start || h >= WORK_HOURS.end ? 'bg-gray-50/30' : ''
                          }`}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDropOnDay(day, h)}
                          onClick={() => {
                            const d = new Date(day);
                            d.setHours(h, 0, 0, 0);
                            handleCreateEvent(d);
                          }}
                        />
                      ))}

                      {/* Events overlay */}
                      {dayEvents.map(ev => {
                        const startH = new Date(ev.start).getHours() + new Date(ev.start).getMinutes() / 60;
                        const endH = new Date(ev.end).getHours() + new Date(ev.end).getMinutes() / 60;
                        const top = startH * 56; // 56px per hour (h-14)
                        const height = Math.max((endH - startH) * 56, 24);
                        const c = EVENT_COLORS[ev.type];

                        return (
                          <div
                            key={ev.id}
                            draggable={!ev.id.startsWith('synth-')}
                            onDragStart={e => { e.stopPropagation(); handleDragStart(ev); }}
                            onDragEnd={handleDragEnd}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className={`absolute left-0.5 right-0.5 rounded border-l-2 px-1 py-0.5 cursor-pointer hover:opacity-80 transition-opacity ${c.bg} ${c.border} ${c.text} ${draggingId === ev.id ? 'opacity-40' : ''} ${resizingId === ev.id ? 'ring-1 ring-blue-400' : ''}`}
                            style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 }}
                          >
                            <div className="text-[10px] font-semibold truncate">{ev.title}</div>
                            <div className="text-[9px] opacity-70">{formatTime(ev.start)}</div>
                            {/* Resize handle */}
                            {!ev.id.startsWith('synth-') && height > 28 && (
                              <div
                                className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-100"
                                onMouseDown={e => handleResizeStart(e, ev)}
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="w-6 h-0.5 rounded-full bg-current opacity-50" />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Current time indicator */}
                      {isToday && (() => {
                        const now = new Date();
                        const nowH = now.getHours() + now.getMinutes() / 60;
                        return (
                          <div
                            className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                            style={{ top: `${nowH * 56}px` }}
                          >
                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* DAY VIEW */}
        {view === 'day' && (
          <div className="flex flex-col h-full">
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
              <div className={`text-sm font-medium ${isSameDay(currentDate, today) ? 'text-blue-600' : 'text-gray-700'}`}>
                {formatDateHeader(currentDate)}
              </div>
              <button
                onClick={() => handleCreateEvent(currentDate)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add event
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* All-day events */}
              {getEventsForDay(currentDate).filter(e => e.allDay).length > 0 && (
                <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-1">All day</div>
                  <div className="space-y-1">
                    {getEventsForDay(currentDate).filter(e => e.allDay).map(ev => (
                      <EventChip key={ev.id} event={ev} customer={getCustomer(ev.customerId)} onClick={() => setSelectedEvent(ev)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Time grid */}
              <div className="grid grid-cols-[64px_1fr]">
                {HOURS.map(h => {
                  const hourEvents = getEventsForDay(currentDate).filter(e => {
                    if (e.allDay) return false;
                    return new Date(e.start).getHours() === h;
                  });
                  return (
                    <React.Fragment key={h}>
                      <div
                        className={`h-16 border-b border-gray-100 flex items-start justify-end pr-3 pt-1 ${
                          h < WORK_HOURS.start || h >= WORK_HOURS.end ? 'bg-gray-50/50' : ''
                        }`}
                      >
                        <span className="text-xs text-gray-400">
                          {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                        </span>
                      </div>
                      <div
                        className={`h-16 border-b border-gray-100 px-2 py-1 space-y-0.5 cursor-pointer hover:bg-blue-50/20 transition-colors ${
                          h < WORK_HOURS.start || h >= WORK_HOURS.end ? 'bg-gray-50/30' : ''
                        }`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDropOnDay(currentDate, h)}
                        onClick={() => {
                          const d = new Date(currentDate);
                          d.setHours(h, 0, 0, 0);
                          handleCreateEvent(d);
                        }}
                      >
                        {hourEvents.map(ev => (
                          <div
                            key={ev.id}
                            draggable={!ev.id.startsWith('synth-')}
                            onDragStart={e => { e.stopPropagation(); handleDragStart(ev); }}
                            onDragEnd={handleDragEnd}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className={draggingId === ev.id ? 'opacity-40' : ''}
                          >
                            <EventChip event={ev} customer={getCustomer(ev.customerId)} onClick={() => setSelectedEvent(ev)} />
                          </div>
                        ))}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* AGENDA VIEW */}
        {view === 'agenda' && (
          <div className="p-4 max-w-2xl mx-auto">
            {(() => {
              // Group events by date for next 60 days
              const upcoming: Record<string, ScheduleEvent[]> = {};
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              allEvents
                .filter(e => new Date(e.start) >= now)
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .forEach(ev => {
                  const key = new Date(ev.start).toDateString();
                  if (!upcoming[key]) upcoming[key] = [];
                  upcoming[key].push(ev);
                });

              const keys = Object.keys(upcoming);
              if (keys.length === 0) {
                return (
                  <div className="text-center py-16">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No upcoming events</p>
                    <p className="text-gray-400 text-sm mt-1">Click "New Event" to schedule something</p>
                  </div>
                );
              }

              return keys.map(key => {
                const dayDate = new Date(key);
                const isToday = isSameDay(dayDate, today);
                return (
                  <div key={key} className="mb-6">
                    <div className={`flex items-center gap-2 mb-2 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                        {dayDate.getDate()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{dayDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                        <div className="text-xs opacity-70">{dayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      {isToday && <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Today</span>}
                    </div>
                    <div className="space-y-2 ml-10">
                      {upcoming[key].map(ev => {
                        const c = EVENT_COLORS[ev.type];
                        const customer = getCustomer(ev.customerId);
                        const opp = getOpportunity(ev.opportunityId, ev.customerId);
                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className={`p-3 rounded-xl border-l-4 ${c.bg} ${c.border} cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.badge}`}>
                                    {EVENT_TYPE_LABELS[ev.type]}
                                  </span>
                                  {ev.completed && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Done</span>
                                  )}
                                </div>
                                <div className={`font-semibold text-sm ${c.text}`}>{ev.title}</div>
                                {customer && <div className="text-xs text-gray-500 mt-0.5">{customer.displayName}</div>}
                                {opp && <div className="text-xs text-gray-400">{opp.stage} · ${opp.value.toLocaleString()}</div>}
                              </div>
                              <div className="text-right shrink-0">
                                {!ev.allDay && (
                                  <div className="text-xs text-gray-500">{formatTime(ev.start)}</div>
                                )}
                                {ev.assignedTo.length > 0 && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">{ev.assignedTo.join(', ')}</div>
                                )}
                              </div>
                            </div>
                            {ev.notes && (
                              <div className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ev.notes}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* ── Event detail panel ── */}
      {selectedEvent && !editingEvent && (
        <EventDetailPanel
          event={selectedEvent}
          customer={getCustomer(selectedEvent.customerId)}
          opportunity={getOpportunity(selectedEvent.opportunityId, selectedEvent.customerId)}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => { setEditingEvent({ ...selectedEvent }); setIsCreating(false); }}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
          onNavigate={() => handleNavigateToOpportunity(selectedEvent)}
        />
      )}

      {/* ── Event form modal ── */}
      {(isCreating || editingEvent) && (
        <EventFormModal
          initial={editingEvent || defaultEventForDate(createForDate)}
          customers={state.customers}
          onSave={handleSaveEvent}
          onClose={() => { setEditingEvent(null); setIsCreating(false); }}
        />
      )}
    </div>
  );
}
