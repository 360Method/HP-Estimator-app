import { useEffect, useState, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  ArrowLeft, MapPin, Phone, Clock, CheckCircle2, PlayCircle, StopCircle,
  Loader2, Navigation,
} from 'lucide-react';

const STORAGE_KEY = 'hp_tech_name';

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTime(isoOrMs: string | number | null | undefined) {
  if (!isoOrMs) return '';
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function TechJobDetail() {
  const [, nav] = useLocation();
  const params = useParams<{ jobType: string; jobId: string }>();
  const techName = localStorage.getItem(STORAGE_KEY) ?? '';
  const [techNotes, setTechNotes] = useState('');
  const [clockNotes, setClockNotes] = useState('');
  const [showClockOutNotes, setShowClockOutNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds since clock-in
  const [completed, setCompleted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!techName) nav('/tech');
  }, []);

  const { data, isLoading, refetch } = trpc.tech.today.useQuery(
    { techName },
    { refetchOnMount: true, enabled: !!techName }
  );

  const { data: logs = [], refetch: refetchLogs } = trpc.tech.myTimeLogs.useQuery(
    { techName },
    { enabled: !!techName, refetchOnMount: true }
  );

  // Find active time log for this job
  const jobKey = params.jobType === 'workorder' ? 'workOrderId' : 'scheduleEventId';
  const jobIdVal = params.jobType === 'workorder' ? Number(params.jobId) : params.jobId;
  const activeLog = logs.find(l => !l.clockOut && (l as any)[jobKey] == jobIdVal);

  // Elapsed timer
  useEffect(() => {
    if (activeLog) {
      const update = () => setElapsed(Math.floor((Date.now() - new Date(activeLog.clockIn).getTime()) / 1000));
      update();
      timerRef.current = setInterval(update, 30000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [activeLog?.id]);

  const clockIn = trpc.tech.clockIn.useMutation({
    onSuccess: () => { toast.success('Clocked in!'); refetchLogs(); refetch(); },
    onError: () => toast.error('Clock in failed'),
  });

  const clockOut = trpc.tech.clockOut.useMutation({
    onSuccess: (r) => {
      toast.success(`Clocked out — ${fmtMins(r.durationMins)} on this job`);
      setShowClockOutNotes(false);
      setClockNotes('');
      refetchLogs();
    },
    onError: () => toast.error('Clock out failed'),
  });

  const completeJob = trpc.tech.completeJob.useMutation({
    onSuccess: () => {
      setCompleted(true);
      toast.success('Job marked complete ✅');
      refetch();
    },
    onError: () => toast.error('Failed to mark complete'),
  });

  // Find the current job item
  const job = params.jobType === 'workorder'
    ? data?.workOrders.find(wo => wo.id === Number(params.jobId))
    : data?.scheduleEvents.find(ev => ev.id === params.jobId);

  const title = params.jobType === 'workorder'
    ? ((job as any)?.customerData?.displayName ?? `Work Order #${params.jobId}`)
    : ((job as any)?.opportunityData?.customerName ?? (job as any)?.title ?? 'Job Detail');

  const address = params.jobType === 'event'
    ? (job as any)?.opportunityData?.customerAddress
    : null;

  const phone = params.jobType === 'event'
    ? ((job as any)?.customerData?.mobilePhone ?? (job as any)?.opportunityData?.customerPhone)
    : (job as any)?.customerData?.mobilePhone;

  const subtitle = params.jobType === 'workorder'
    ? ((job as any)?.type?.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? '')
    : ((job as any)?.opportunityData?.title ?? (job as any)?.type ?? '');

  const notes = (job as any)?.notes ?? '';
  const status = params.jobType === 'workorder'
    ? ((job as any)?.status ?? 'open')
    : ((job as any)?.completed ? 'completed' : 'scheduled');

  const isJobCompleted = completed || status === 'completed';

  const handleClockIn = () => {
    clockIn.mutate({
      techName,
      ...(params.jobType === 'workorder' ? { workOrderId: Number(params.jobId) } : { scheduleEventId: params.jobId }),
      customerId: (job as any)?.customerId ?? undefined,
      jobTitle: title,
    });
  };

  const handleClockOut = () => {
    if (!activeLog) return;
    clockOut.mutate({ timeLogId: activeLog.id, notes: clockNotes || undefined });
  };

  const handleComplete = () => {
    completeJob.mutate({
      ...(params.jobType === 'workorder' ? { workOrderId: Number(params.jobId) } : { scheduleEventId: params.jobId }),
      technicianNotes: techNotes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="px-5 pt-10 pb-5" style={{ background: '#7A5D12' }}>
        <button onClick={() => nav('/tech/dashboard')} className="flex items-center gap-1.5 text-yellow-200 text-sm mb-3">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-white text-lg font-bold leading-tight">{title}</h1>
        <p className="text-yellow-200 text-sm mt-0.5">{subtitle}</p>
        {isJobCompleted && (
          <div className="mt-2 inline-flex items-center gap-1.5 bg-green-500/20 text-green-200 text-xs font-semibold px-3 py-1 rounded-full">
            <CheckCircle2 size={12} /> Completed
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Job Info */}
        <div className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
          {address && (
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900">{address}</p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold mt-1"
                  style={{ color: '#7A5D12' }}
                >
                  <Navigation size={11} /> Navigate
                </a>
              </div>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-gray-400 shrink-0" />
              <a href={`tel:${phone}`} className="text-sm font-semibold" style={{ color: '#7A5D12' }}>
                {phone}
              </a>
            </div>
          )}
          {notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
            </div>
          )}
        </div>

        {/* Clock In/Out */}
        {!isJobCompleted && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-gray-500" />
              <h2 className="text-sm font-bold text-gray-700">Time Tracking</h2>
            </div>

            {!activeLog ? (
              <button
                onClick={handleClockIn}
                disabled={clockIn.isPending}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold text-base"
                style={{ background: '#7A5D12' }}
              >
                {clockIn.isPending ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={20} />}
                Clock In
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm font-semibold text-amber-800">Clocked in</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-amber-800">
                    {fmtMins(Math.floor(elapsed / 60))}
                  </span>
                </div>

                {showClockOutNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={clockNotes}
                      onChange={e => setClockNotes(e.target.value)}
                      placeholder="Optional notes for this session..."
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setShowClockOutNotes(false)} className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                        Cancel
                      </button>
                      <button
                        onClick={handleClockOut}
                        disabled={clockOut.isPending}
                        className="py-3 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-1"
                      >
                        {clockOut.isPending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={16} />}
                        Clock Out
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClockOutNotes(true)}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-red-500 text-white font-semibold text-base"
                  >
                    <StopCircle size={20} /> Clock Out
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Complete Job */}
        {!isJobCompleted && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-gray-500" />
              <h2 className="text-sm font-bold text-gray-700">Complete Job</h2>
            </div>
            <textarea
              value={techNotes}
              onChange={e => setTechNotes(e.target.value)}
              placeholder="Technician notes (what was done, issues found, materials used...)"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 mb-3"
              style={{ '--tw-ring-color': '#7A5D12' } as React.CSSProperties}
            />
            <button
              onClick={handleComplete}
              disabled={completeJob.isPending}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-green-600 text-white font-semibold text-base"
            >
              {completeJob.isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={20} />}
              Mark Job Complete
            </button>
          </div>
        )}

        {isJobCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-green-800">Job Complete</p>
            <p className="text-xs text-green-600 mt-1">Great work! Head back to your dashboard.</p>
            <button onClick={() => nav('/tech/dashboard')} className="mt-3 text-sm font-semibold" style={{ color: '#7A5D12' }}>
              ← Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
