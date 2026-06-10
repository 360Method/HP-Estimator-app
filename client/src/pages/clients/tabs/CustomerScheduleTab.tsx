// Phase E — Schedule tab: every scheduled touchpoint for this client in one
// place, merged from the internal calendar (scheduleEvents), scheduled jobs
// (opportunities with a scheduledDate), and the customer's portal appointments.
// Read-only over customers.getFullContext — zero backend. Each item is tagged
// with whether the customer can see it in their portal (portal appointments)
// or it is internal-only (calendar events, job schedules). A scheduleEvent
// linked to a job via opportunityId supersedes that job's own scheduledDate
// row so the same visit isn't listed twice.
import { Globe, EyeOff, CheckCircle, XCircle, User } from 'lucide-react';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

type ItemSource = 'portal' | 'event' | 'job';

interface ScheduleItem {
  key: string;
  when: Date;
  endWhen: Date | null;
  allDay: boolean;
  title: string;
  source: ItemSource;
  typeLabel: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  tech: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  estimate: 'Estimate visit',
  job: 'Job',
  follow_up: 'Follow-up',
  consultation: 'Consultation',
  recurring: 'Recurring',
  task: 'Task',
  three_sixty: '360° visit',
};

function parseAssigned(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.join(', ') || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(', ') || null;
    } catch {
      /* plain comma-separated string */
    }
    return raw.trim() || null;
  }
  return null;
}

function asDate(ts: unknown): Date | null {
  if (!ts) return null;
  const d = new Date(ts as any);
  return isNaN(d.getTime()) ? null : d;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function VisibilityChip({ source }: { source: ItemSource }) {
  if (source === 'portal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
        <Globe className="w-3 h-3" />Customer sees this
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
      <EyeOff className="w-3 h-3" />Internal only
    </span>
  );
}

function StatusChip({ status }: { status: ScheduleItem['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />Completed
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" />Cancelled
      </span>
    );
  }
  if (status === 'rescheduled') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Rescheduled</span>;
  }
  return null;
}

function ItemRow({ item }: { item: ScheduleItem }) {
  const dimmed = item.status === 'cancelled';
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="w-12 shrink-0 text-center rounded-lg border border-gray-200 py-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-500">
          {item.when.toLocaleDateString('en-US', { month: 'short' })}
        </p>
        <p className="text-lg font-bold leading-tight text-gray-900">{item.when.getDate()}</p>
        <p className="text-[10px] text-gray-400">
          {item.when.toLocaleDateString('en-US', { weekday: 'short' })}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
          <StatusChip status={item.status} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.typeLabel}
          {!item.allDay && ` · ${fmtTime(item.when)}${item.endWhen ? `–${fmtTime(item.endWhen)}` : ''}`}
          {item.allDay && ' · All day'}
        </p>
        {item.tech && (
          <p className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1">
            <User className="w-3 h-3" />{item.tech}
          </p>
        )}
      </div>
      <div className="shrink-0"><VisibilityChip source={item.source} /></div>
    </div>
  );
}

const CustomerScheduleTab = () => {
  const { customerContext } = useClientUmbrella();

  const events: any[] = customerContext?.scheduleEvents ?? [];
  const portalAppts: any[] = customerContext?.portal?.appointments ?? [];
  const opportunities: any[] = customerContext?.opportunities ?? [];

  const items: ScheduleItem[] = [];

  for (const ev of events) {
    const when = asDate(ev.start);
    if (!when) continue;
    items.push({
      key: `ev-${ev.id}`,
      when,
      endWhen: asDate(ev.end),
      allDay: !!ev.allDay,
      title: ev.title || 'Untitled event',
      source: 'event',
      typeLabel: TYPE_LABELS[ev.type] ?? ev.type ?? 'Event',
      status: ev.completed ? 'completed' : 'scheduled',
      tech: parseAssigned(ev.assignedTo),
    });
  }

  for (const appt of portalAppts) {
    const when = asDate(appt.scheduledAt);
    if (!when) continue;
    items.push({
      key: `pa-${appt.id}`,
      when,
      endWhen: asDate(appt.scheduledEndAt),
      allDay: false,
      title: appt.title || 'Appointment',
      source: 'portal',
      typeLabel: TYPE_LABELS[appt.type] ?? appt.type ?? 'Appointment',
      status: (appt.status as ScheduleItem['status']) ?? 'scheduled',
      tech: appt.techName || null,
    });
  }

  // Scheduled jobs without a linked calendar event (an event with the same
  // opportunityId already represents that visit above).
  const linkedOppIds = new Set(events.map((ev) => ev.opportunityId).filter(Boolean));
  for (const opp of opportunities) {
    if (opp.archived || !opp.scheduledDate || linkedOppIds.has(opp.id)) continue;
    const when = asDate(opp.scheduledDate);
    if (!when) continue;
    items.push({
      key: `opp-${opp.id}`,
      when,
      endWhen: asDate(opp.scheduledEndDate),
      allDay: false,
      title: opp.title || 'Scheduled job',
      source: 'job',
      typeLabel: opp.area === 'estimate' ? 'Estimate visit' : 'Job',
      status: 'scheduled',
      tech: parseAssigned(opp.assignedTo),
    });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = items
    .filter((i) => i.when >= startOfToday)
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  const past = items
    .filter((i) => i.when < startOfToday)
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 10);

  const customerVisible = upcoming.filter((i) => i.source === 'portal' && i.status === 'scheduled').length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Client Schedule</h3>
            <p className="text-xs text-muted-foreground">
              Everything on the calendar for this customer — internal events, scheduled jobs, and portal appointments.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {upcoming.length} upcoming · {customerVisible} visible to the customer
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Nothing scheduled. Book the next visit from the Opportunities tab or the main Schedule.
          </p>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden divide-y divide-gray-100">
            {upcoming.map((item) => <ItemRow key={item.key} item={item} />)}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent (last {past.length})</h3>
          <div className="rounded-xl border bg-white overflow-hidden divide-y divide-gray-100">
            {past.map((item) => <ItemRow key={item.key} item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerScheduleTab;
