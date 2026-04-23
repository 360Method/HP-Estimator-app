// ============================================================
// NotificationBell — admin header bell + drawer for in-app notifications
// ------------------------------------------------------------
// Shows the unread count as a red badge on a bell icon. Clicking opens
// a right-side sheet with the 20 most recent notifications for the
// signed-in user. Each row deep-links into the relevant entity.
// ============================================================

import { useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { trpc } from '@/lib/trpc';

function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function priorityAccent(priority: string): string {
  if (priority === 'high') return 'border-l-red-500';
  if (priority === 'low') return 'border-l-slate-300';
  return 'border-l-primary';
}

function eventBadge(eventType: string): string {
  const map: Record<string, string> = {
    new_lead: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    lead_assigned: 'bg-blue-50 text-blue-700 border-blue-200',
    appointment_booked: 'bg-violet-50 text-violet-700 border-violet-200',
    job_created: 'bg-orange-50 text-orange-700 border-orange-200',
    job_scheduled: 'bg-orange-50 text-orange-700 border-orange-200',
    missed_call: 'bg-red-50 text-red-700 border-red-200',
    new_booking: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return map[eventType] || 'bg-slate-50 text-slate-700 border-slate-200';
}

function humanEvent(eventType: string): string {
  return eventType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: unreadData } = trpc.notifications.countUnread.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const { data: items = [], isLoading } = trpc.notifications.list.useQuery(
    { limit: 20 },
    { enabled: open, refetchOnWindowFocus: false },
  );

  const utils = trpc.useUtils();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.countUnread.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.countUnread.invalidate();
    },
  });

  const handleRowClick = (id: number, linkUrl: string | null | undefined, isUnread: boolean) => {
    if (isUnread) markRead.mutate({ id });
    if (linkUrl) {
      window.location.href = linkUrl;
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SheetTitle className="text-base">Notifications</SheetTitle>
                <SheetDescription className="text-xs">
                  {unreadCount > 0 ? `${unreadCount} unread — most recent first` : 'All caught up'}
                </SheetDescription>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  New leads, appointments, and job handoffs will show up here.
                </p>
              </div>
            )}
            {items.map((n) => {
              const isUnread = !n.readAt;
              return (
                <button
                  key={n.id}
                  onClick={() => handleRowClick(n.id, n.linkUrl, isUnread)}
                  className={`w-full text-left px-4 py-3 border-b border-border border-l-4 hover:bg-muted/40 transition-colors ${priorityAccent(n.priority)} ${isUnread ? 'bg-blue-50/40' : 'bg-white'}`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${eventBadge(n.eventType)}`}>
                      {humanEvent(n.eventType)}
                    </span>
                    {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1" />}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <div className={`text-sm ${isUnread ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                    {n.title}
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {n.role && <span className="px-1.5 py-0.5 bg-muted rounded">{n.role.replace('_', ' ')}</span>}
                    {n.emailSent && <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />email</span>}
                    {n.smsSent && <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />sms</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
