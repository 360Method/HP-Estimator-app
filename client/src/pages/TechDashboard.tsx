import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Sun, Clock, MapPin, ChevronRight, CheckCircle2, Loader2, RefreshCw, LogOut } from 'lucide-react';

const STORAGE_KEY = 'hp_tech_name';

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTime(isoOrMs: string | number | null | undefined) {
  if (!isoOrMs) return '—';
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Done', cls: 'bg-green-100 text-green-700' },
    in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
    scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
    open: { label: 'Upcoming', cls: 'bg-gray-100 text-gray-600' },
  };
  return map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
}

export default function TechDashboard() {
  const [, nav] = useLocation();
  const techName = localStorage.getItem(STORAGE_KEY);

  useEffect(() => {
    if (!techName) nav('/tech');
  }, []);

  if (!techName) return null;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data, isLoading, refetch } = trpc.tech.today.useQuery({ techName }, { refetchOnMount: true });
  const { data: logs = [] } = trpc.tech.myTimeLogs.useQuery({ techName }, { refetchInterval: 30000 });

  const totalMins = logs.reduce((sum, l) => sum + (l.durationMins ?? 0), 0);
  const activeClock = logs.find(l => !l.clockOut);

  // Combine and sort all jobs
  type JobItem = { key: string; title: string; subtitle: string; time: string; address: string | null; phone: string | null; status: string; nav: string };
  const jobs: JobItem[] = [
    ...(data?.scheduleEvents ?? []).map(ev => ({
      key: `event-${ev.id}`,
      title: ev.customerData?.displayName ?? ev.title,
      subtitle: ev.opportunityData?.title ?? ev.type,
      time: `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`,
      address: null,
      phone: ev.customerData?.mobilePhone ?? null,
      status: ev.completed ? 'completed' : 'scheduled',
      nav: `/tech/job/event/${ev.id}`,
    })),
    ...(data?.workOrders ?? []).map(wo => ({
      key: `wo-${wo.id}`,
      title: wo.customerData?.displayName ?? `Work Order #${wo.id}`,
      subtitle: wo.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      time: wo.scheduledDate ? fmtTime(wo.scheduledDate) : 'All day',
      address: null,
      phone: wo.customerData?.mobilePhone ?? null,
      status: wo.status,
      nav: `/tech/job/workorder/${wo.id}`,
    })),
  ];

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    nav('/tech');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="px-5 pt-10 pb-5" style={{ background: '#7A5D12' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-yellow-200 text-sm font-medium">{dateLabel}</p>
            <h1 className="text-white text-xl font-bold mt-0.5">{greeting}, {techName}</h1>
          </div>
          <button onClick={signOut} className="flex items-center gap-1 text-yellow-200 text-xs mt-1">
            <LogOut size={13} /> Sign out
          </button>
        </div>
        {/* Hours summary */}
        <div className="mt-4 bg-white/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-yellow-200" />
            <span className="text-white text-sm font-semibold">
              {activeClock ? 'Currently clocked in' : totalMins > 0 ? `${fmtMins(totalMins)} today` : 'Not clocked in'}
            </span>
          </div>
          {totalMins > 0 && !activeClock && (
            <span className="text-yellow-200 text-xs">{logs.length} job{logs.length !== 1 ? 's' : ''}</span>
          )}
          {activeClock && (
            <span className="text-yellow-200 text-xs animate-pulse">● Live</span>
          )}
        </div>
      </div>

      {/* Jobs */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Today's Jobs</h2>
          <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-gray-400">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sun size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">No jobs scheduled for today</p>
            <p className="text-xs text-gray-400 mt-1">Check back or contact the office</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => {
              const badge = getStatusBadge(job.status);
              return (
                <button
                  key={job.key}
                  onClick={() => nav(job.nav)}
                  className="w-full bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{job.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{job.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock size={11} />{job.time}</span>
                    {job.address && <span className="flex items-center gap-1 truncate"><MapPin size={11} />{job.address}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
