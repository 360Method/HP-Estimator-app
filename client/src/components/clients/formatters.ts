// Shared display formatters + stage color tokens for the client-umbrella UI.
// Extracted verbatim from CustomerSection.tsx (Phase D) so the per-tab components
// can share them. Pure functions / constants — no React, no app state.

export const STAGE_COLORS: Record<string, string> = {
  'New Lead': 'bg-blue-100 text-blue-800 border-blue-200',
  'Return Call Needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'First Contact': 'bg-sky-100 text-sky-800 border-sky-200',
  'Second Contact': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Third Contact': 'bg-teal-100 text-teal-800 border-teal-200',
  'On Hold': 'bg-gray-100 text-gray-600 border-gray-200',
  'Won': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
  'Unscheduled': 'bg-slate-100 text-slate-700 border-slate-200',
  'Scheduled': 'bg-blue-100 text-blue-800 border-blue-200',
  'In Progress': 'bg-amber-100 text-amber-800 border-amber-200',
  'Completed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Draft': 'bg-gray-100 text-gray-600 border-gray-200',
  'Ready to Send': 'bg-violet-100 text-violet-800 border-violet-200',
  'Created on Job': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Sent': 'bg-sky-100 text-sky-800 border-sky-200',
  'Verbal Acceptance': 'bg-lime-100 text-lime-800 border-lime-200',
  'Approved': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Rejected': 'bg-red-100 text-red-700 border-red-200',
  'New Job': 'bg-blue-100 text-blue-800 border-blue-200',
  'Deposit Needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'Deposit Collected': 'bg-lime-100 text-lime-800 border-lime-200',
  'Need to Order Materials': 'bg-orange-100 text-orange-800 border-orange-200',
  'Waiting on Materials': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Materials Received': 'bg-teal-100 text-teal-800 border-teal-200',
  'Invoice Sent': 'bg-violet-100 text-violet-800 border-violet-200',
  'Invoice Paid': 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export function stageColor(stage: string) {
  return STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

export function fmtDollar(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}
