// ============================================================
// NotificationsSettings — DB-backed via trpc.notificationPreferences
// Every toggle persists immediately to the database
// ============================================================

import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function NotificationsSettings() {
  const { data: prefs, isLoading } = trpc.notificationPreferences.getAll.useQuery();
  const utils = trpc.useUtils();

  const upsertMutation = trpc.notificationPreferences.upsert.useMutation({
    onSuccess: () => {
      utils.notificationPreferences.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = (eventKey: string, channel: 'email' | 'sms' | 'in_app', current: boolean) => {
    upsertMutation.mutate({ eventKey, channel, enabled: !current });
  };

  const Toggle = ({
    checked,
    onChange,
    disabled,
  }: {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted border border-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which channels fire for each event. Changes save instantly to the database and take effect on the next event.
        </p>
      </div>

      <section className="card-section">
        <div className="card-section-header">
          <Bell size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">Notification Preferences</span>
        </div>
        <div className="card-section-body">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 border-b border-border mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Event</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">Email</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">SMS</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">In-App</span>
          </div>

          <div className="divide-y divide-border/60">
            {(prefs ?? []).map((pref) => {
              const emailCh  = pref.channels.find((c) => c.channel === 'email');
              const smsCh    = pref.channels.find((c) => c.channel === 'sms');
              const inAppCh  = pref.channels.find((c) => c.channel === 'in_app');
              const busy = upsertMutation.isPending;

              return (
                <div
                  key={pref.eventKey}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.description}</p>
                  </div>
                  <div className="w-10 flex justify-center">
                    <Toggle
                      checked={emailCh?.enabled ?? false}
                      onChange={() => toggle(pref.eventKey, 'email', emailCh?.enabled ?? false)}
                      disabled={busy}
                    />
                  </div>
                  <div className="w-10 flex justify-center">
                    <Toggle
                      checked={smsCh?.enabled ?? false}
                      onChange={() => toggle(pref.eventKey, 'sms', smsCh?.enabled ?? false)}
                      disabled={busy}
                    />
                  </div>
                  <div className="w-10 flex justify-center">
                    <Toggle
                      checked={inAppCh?.enabled ?? true}
                      onChange={() => toggle(pref.eventKey, 'in_app', inAppCh?.enabled ?? true)}
                      disabled={busy}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Toggles save automatically. SMS requires Twilio to be configured; Email requires Gmail to be connected.
      </p>
    </div>
  );
}
