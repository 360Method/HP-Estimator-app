// ============================================================
// CustomerActivityFeed — reusable unified feed component
// Used in:
//   • CustomerSection (Profile tab) — full feed for the customer
//   • OpportunityDetailsTab — same feed, scoped to the customer
//     associated with the current lead/estimate/job
// Features:
//   • Server-backed via trpc.inbox.unifiedFeed.getByCustomer
//   • SSE auto-refresh on new_message events
//   • Channel icons, In/Out direction badges, recording player
//   • "Open in Inbox" deep-link button on each item
//   • Quick-action shortcuts (SMS / Email / Note / Call) that
//     scroll the parent to the compose panel
// ============================================================
import {
  MessageSquare, Mail, PhoneCall, StickyNote, AtSign,
  ArrowDownLeft, ArrowUpRight, Paperclip, ExternalLink,
  RefreshCw, Inbox,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { useInboxSSE } from '@/hooks/useInboxSSE';

// ── Helpers ──────────────────────────────────────────────────
function fmtRelative(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  customerId: string;
  /** If provided, clicking "Open in Inbox" will also set the conversation */
  onOpenInInbox?: (conversationId: number | null, channel: 'sms' | 'email' | 'note' | null) => void;
  /** Compact mode — hides the quick-action shortcuts row */
  compact?: boolean;
}

export default function CustomerActivityFeed({ customerId, onOpenInInbox, compact }: Props) {
  const { setSection, setInboxCustomer, setInboxConversation } = useEstimator();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.inbox.unifiedFeed.getByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId, staleTime: 30_000 }
  );

  const feed = data?.feed ?? [];

  // SSE: auto-refresh when new messages arrive
  useInboxSSE({
    onNewMessage: () => utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId }),
    onPortalMessage: () => utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId }),
  });

  // Navigate to inbox and open the right conversation
  const openInInbox = (conversationId: number | null, channel: 'sms' | 'email' | 'note' | null) => {
    setInboxCustomer(customerId);
    if (conversationId) setInboxConversation(conversationId, channel);
    setSection('inbox' as any);
    if (onOpenInInbox) onOpenInInbox(conversationId, channel);
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <RefreshCw size={16} className="mx-auto mb-2 animate-spin opacity-50" />
        Loading activity…
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
        <Inbox size={24} className="mx-auto mb-2 opacity-30" />
        No activity yet. SMS, calls, emails, and notes will all appear here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {[...feed].reverse().map(item => {
        const isInbound = item.direction === 'inbound';
        const channelIcon =
          item.channel === 'sms' ? <MessageSquare size={13} className="text-primary" /> :
          item.channel === 'email' ? <Mail size={13} className="text-sky-500" /> :
          item.channel === 'call' ? <PhoneCall size={13} className="text-emerald-500" /> :
          item.channel === 'portal' ? <AtSign size={13} className="text-violet-500" /> :
          item.channel === 'note' ? <StickyNote size={13} className="text-amber-500" /> :
          <MessageSquare size={13} className="text-muted-foreground" />;

        const channelLabel =
          item.channel === 'sms' ? 'SMS' :
          item.channel === 'email' ? 'Email' :
          item.channel === 'call' ? 'Call' :
          item.channel === 'portal' ? 'Portal' :
          item.channel === 'note' ? 'Note' : item.channel;

        const convId = (item as any).conversationId as number | null;
        const itemChannel = (['sms', 'email', 'note'].includes(item.channel) ? item.channel : null) as 'sms' | 'email' | 'note' | null;

        return (
          <div key={item.id} className="group flex items-start gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
              {channelIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{channelLabel}</span>
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  isInbound
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                }`}>
                  {isInbound ? <ArrowDownLeft size={9} /> : <ArrowUpRight size={9} />}
                  {isInbound ? 'In' : 'Out'}
                </span>
                {item.isInternal && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Internal</span>
                )}
                {item.subject && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={item.subject}>{item.subject}</span>
                )}
              </div>
              <p className="text-sm text-foreground line-clamp-2">{item.body || '(no content)'}</p>
              {/* Recording player for call items */}
              {item.channel === 'call' && (item as any).recordingAppUrl && (
                <audio
                  controls
                  src={(item as any).recordingAppUrl}
                  className="mt-2 h-8 w-full max-w-xs"
                  preload="none"
                />
              )}
              {/* Attachment */}
              {item.attachmentUrl && (
                <a
                  href={item.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                >
                  <Paperclip size={11} /> Attachment
                </a>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="text-[10px] text-muted-foreground">{fmtRelative(new Date(item.sentAt).toISOString())}</div>
              {/* Open in Inbox deep-link */}
              {item.channel !== 'portal' && (
                <button
                  onClick={() => openInInbox(convId, itemChannel)}
                  title="Open full thread in Inbox"
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                >
                  <ExternalLink size={10} /> Inbox
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
