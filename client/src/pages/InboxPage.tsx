// ============================================================
// InboxPage — Customer-Centric Unified Inbox
// Desktop: 2-panel (customer list | unified feed)
// Mobile: 2-screen stack (customer list → unified thread)
// ============================================================
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import { useInboxSSE } from '@/hooks/useInboxSSE';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  MessageSquare, Mail, Phone, StickyNote, Search,
  Send, Inbox, Users, Globe,
  PhoneIncoming, PhoneOutgoing,
  RefreshCw, MoreHorizontal, ChevronLeft,
  CheckCheck, AlertCircle, Clock, MessageCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────────────────
type Channel = 'sms' | 'email' | 'note';
type MobileScreen = 'list' | 'thread';

interface FeedItem {
  id: string;
  source: 'conversation' | 'portal';
  channel: 'sms' | 'email' | 'note' | 'call' | 'portal';
  direction: 'inbound' | 'outbound';
  body: string;
  subject: string | null;
  isInternal: boolean;
  sentAt: Date;
  readAt: Date | null;
  conversationId: number | null;
  senderName: string | null;
  attachmentUrl: string | null;
  attachmentMime: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];
function getAvatarColor(name: string | null | undefined) {
  if (!name) return 'bg-slate-400';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtTime(d: Date | string | null | undefined) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }) });
}

function fmtDateLabel(d: Date | string | null | undefined) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Channel badge ────────────────────────────────────────────────────────────
const CHANNEL_ICON: Record<string, React.ElementType> = {
  sms: MessageCircle,
  email: Mail,
  note: StickyNote,
  call: Phone,
  portal: Globe,
};
const CHANNEL_COLOR: Record<string, string> = {
  sms: 'bg-blue-100 text-blue-600',
  email: 'bg-violet-100 text-violet-600',
  note: 'bg-amber-100 text-amber-700',
  call: 'bg-emerald-100 text-emerald-600',
  portal: 'bg-rose-100 text-rose-600',
};

function ChannelBadge({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICON[channel] ?? MessageSquare;
  const color = CHANNEL_COLOR[channel] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {channel}
    </span>
  );
}

// ─── Feed bubble ──────────────────────────────────────────────────────────────
function FeedBubble({ item }: { item: FeedItem }) {
  const isOut = item.direction === 'outbound';

  // Call log — centered pill
  if (item.channel === 'call') {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-xs text-emerald-800">
          {isOut
            ? <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500" />
            : <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600" />}
          <span className="font-medium">{isOut ? 'Outbound call' : 'Inbound call'}</span>
          <span className="text-emerald-600">{fmtTime(item.sentAt)}</span>
        </div>
      </div>
    );
  }

  // Internal note — centered card
  if (item.isInternal || item.channel === 'note') {
    return (
      <div className="flex justify-center my-3">
        <div className="max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-600 font-semibold text-[11px]">
            <StickyNote className="w-3 h-3" />
            Internal Note · {fmtTime(item.sentAt)}
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 mb-3 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${isOut ? 'bg-primary' : 'bg-slate-400'}`}>
        {isOut ? 'HP' : getInitials(item.senderName)}
      </div>
      <div className={`max-w-[72%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-1.5 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
          <ChannelBadge channel={item.channel} />
          <span className="text-[10px] text-muted-foreground">{fmtTime(item.sentAt)}</span>
        </div>
        {item.subject && (
          <div className={`text-xs font-semibold text-foreground/70 ${isOut ? 'text-right' : 'text-left'}`}>
            {item.subject}
          </div>
        )}
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isOut
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        }`}>
          {item.body || <span className="italic opacity-50">(empty)</span>}
        </div>
        {item.attachmentUrl && (
          <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary underline">
            Attachment
          </a>
        )}
        {item.readAt && isOut && (
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <CheckCheck className="w-3 h-3" /> Read
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer list item ───────────────────────────────────────────────────────
function CustomerListItem({
  name, phone, lastPreview, lastAt, unread, isActive, isStub, onClick,
}: {
  name: string;
  phone?: string | null;
  lastPreview?: string | null;
  lastAt?: Date | null;
  unread: number;
  isActive: boolean;
  isStub?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-border/40 hover:bg-muted/40 transition-colors flex items-center gap-3 ${
        isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''
      }`}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-white text-sm font-bold`}>
        {getInitials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[14px] font-semibold truncate ${unread > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
            {name}
            {isStub && (
              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-100 rounded px-1 py-0.5">Unknown</span>
            )}
          </span>
          {lastAt && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtTime(lastAt)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${unread > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
            {lastPreview || phone || 'No messages yet'}
          </p>
          {unread > 0 && (
            <span className="flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxPage() {
  const { state, setInboxCustomer, setActiveCustomer, navigateToTopLevel } = useEstimator();
  const { inboxCustomerId } = state;

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeChannel, setComposeChannel] = useState<Channel>('sms');
  const [composeBody, setComposeBody] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('list');
  const [threadTab, setThreadTab] = useState<'all' | 'calls'>('all');

  const threadEndRef = useRef<HTMLDivElement>(null);

  // ── Data queries ──
  const { data: activityList = [], refetch: refetchActivity } =
    trpc.inbox.customerList.listWithActivity.useQuery();

  const { data: unifiedFeed, isLoading: feedLoading, refetch: refetchFeed } =
    trpc.inbox.unifiedFeed.getByCustomer.useQuery(
      { customerId: selectedCustomerId! },
      { enabled: !!selectedCustomerId }
    );

  const primaryConvId = unifiedFeed?.conversationId ?? null;
  const { data: callLogItems = [] } = trpc.inbox.callLogs.byConversation.useQuery(
    { conversationId: primaryConvId! },
    { enabled: !!primaryConvId && threadTab === 'calls' }
  );

  const { data: twilioStatus } = trpc.inbox.twilio.status.useQuery();
  const { data: gmailStatus } = trpc.gmail.status.useQuery();

  // ── Mutations ──
  const findOrCreateConv = trpc.inbox.conversations.findOrCreateByCustomer.useMutation();
  const sendMessage = trpc.inbox.messages.send.useMutation({
    onSuccess: () => { setComposeBody(''); setComposeSubject(''); refetchFeed(); refetchActivity(); },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });
  const sendSms = trpc.inbox.twilio.sendSms.useMutation({
    onSuccess: () => { setComposeBody(''); refetchFeed(); refetchActivity(); },
    onError: (err) => toast.error(`SMS failed: ${err.message}`),
  });
  const sendEmailMutation = trpc.gmail.sendEmail.useMutation({
    onSuccess: () => { setComposeBody(''); setComposeSubject(''); refetchFeed(); refetchActivity(); },
    onError: (err) => toast.error(`Email failed: ${err.message}`),
  });
  const replyPortalMsg = trpc.portal.replyToPortalMessage.useMutation({
    onSuccess: () => { setComposeBody(''); refetchFeed(); refetchActivity(); },
    onError: (err) => toast.error(err.message),
  });

  // ── Deep-link: when inboxCustomerId is set from CommunicationTab ──
  useEffect(() => {
    if (!inboxCustomerId) return;
    setSelectedCustomerId(inboxCustomerId);
    setMobileScreen('thread');
    setInboxCustomer(null);
  }, [inboxCustomerId]);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    if (unifiedFeed?.feed?.length) {
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [unifiedFeed?.feed?.length]);

  // ── SSE real-time updates ──
  useInboxSSE({
    onNewMessage: () => { refetchFeed(); refetchActivity(); },
    onNewConversation: () => refetchActivity(),
  });

  // ── Build customer list from EstimatorContext + activity data ──
  const activityMap = useMemo(() => {
    const m = new Map<string, { lastMessageAt: Date; lastMessagePreview: string | null; unreadCount: number }>();
    for (const a of activityList) {
      m.set(a.customerId, {
        lastMessageAt: new Date(a.lastMessageAt),
        lastMessagePreview: a.lastMessagePreview,
        unreadCount: a.unreadCount,
      });
    }
    return m;
  }, [activityList]);

  const customerList = useMemo(() => {
    const customers = state.customers.filter(c => !(c as any).mergedIntoId);
    const q = searchQuery.toLowerCase();
    const filtered = q
      ? customers.filter(c =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.mobilePhone?.includes(q) ||
          c.email?.toLowerCase().includes(q)
        )
      : customers;

    return filtered
      .map(c => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim() || c.email || c.mobilePhone || 'Unknown',
        phone: c.mobilePhone,
        email: c.email,
        activity: activityMap.get(c.id),
        isStub: (c as any).leadSource === 'inbound_call' && (c.firstName === 'Unknown' || !c.firstName),
      }))
      .sort((a, b) => {
        const ta = a.activity?.lastMessageAt?.getTime() ?? 0;
        const tb = b.activity?.lastMessageAt?.getTime() ?? 0;
        return tb - ta;
      });
  }, [state.customers, activityMap, searchQuery]);

  const totalUnread = useMemo(() =>
    activityList.reduce((s, a) => s + (a.unreadCount ?? 0), 0),
    [activityList]
  );

  const selectedCustomer = useMemo(
    () => customerList.find(c => c.id === selectedCustomerId) ?? null,
    [customerList, selectedCustomerId]
  );

  // ── Feed grouped by date ──
  const groupedFeed = useMemo(() => {
    const feed = (unifiedFeed?.feed ?? []) as FeedItem[];
    const groups: { date: string; items: FeedItem[] }[] = [];
    for (const item of feed) {
      const label = fmtDateLabel(item.sentAt);
      const last = groups[groups.length - 1];
      if (last && last.date === label) last.items.push(item);
      else groups.push({ date: label, items: [item] });
    }
    return groups;
  }, [unifiedFeed?.feed]);

  // ── Send handler ──
  const handleSend = useCallback(async () => {
    if (!composeBody.trim() || !selectedCustomerId) return;

    // Portal reply if the compose channel is note and there's a portal customer
    if (composeChannel === 'note' && unifiedFeed?.portalCustomerId) {
      replyPortalMsg.mutate({ customerId: unifiedFeed.portalCustomerId, body: composeBody.trim() });
      return;
    }

    // Ensure a conversation exists
    let convId = unifiedFeed?.conversationId ?? null;
    if (!convId) {
      try {
        const result = await findOrCreateConv.mutateAsync({
          customerId: selectedCustomerId,
          phone: selectedCustomer?.phone,
          email: selectedCustomer?.email,
          name: selectedCustomer?.name,
          channel: composeChannel,
        });
        convId = result.conversationId;
      } catch (e: any) {
        toast.error(`Could not create conversation: ${e.message}`);
        return;
      }
    }

    if (composeChannel === 'sms') {
      const phone = unifiedFeed?.contactPhone || selectedCustomer?.phone;
      if (!phone) { toast.error('No phone number for this customer'); return; }
      if (!twilioStatus?.configured) { toast.error('Twilio not configured — add credentials in Settings → Secrets'); return; }
      sendSms.mutate({ conversationId: convId, to: phone, body: composeBody.trim() });
    } else if (composeChannel === 'email') {
      const email = unifiedFeed?.contactEmail || selectedCustomer?.email;
      if (!email) { toast.error('No email address for this customer'); return; }
      if (!gmailStatus?.connected) { toast.error('Gmail not connected — go to Settings → Integrations'); return; }
      sendEmailMutation.mutate({
        conversationId: convId,
        to: email,
        subject: composeSubject.trim() || 'Message from Handy Pioneers',
        body: composeBody.trim(),
      });
    } else {
      sendMessage.mutate({
        conversationId: convId,
        channel: 'note',
        body: composeBody.trim(),
        isInternal: true,
      });
    }
  }, [composeBody, composeChannel, composeSubject, selectedCustomerId, selectedCustomer, unifiedFeed, twilioStatus, gmailStatus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSending = sendMessage.isPending || sendSms.isPending || sendEmailMutation.isPending
    || replyPortalMsg.isPending || findOrCreateConv.isPending;

  // ─── Customer List Panel ──────────────────────────────────────────────────
  const CustomerListPanel = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Inbox</h2>
          {totalUnread > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalUnread}
            </span>
          )}
        </div>
        <button onClick={() => refetchActivity()} className="p-1.5 rounded hover:bg-muted transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search customers..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {customerList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <Users className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery ? 'No customers match' : 'No customers yet'}
            </p>
          </div>
        ) : (
          customerList.map(c => (
            <CustomerListItem
              key={c.id}
              name={c.name}
              phone={c.phone}
              lastPreview={c.activity?.lastMessagePreview}
              lastAt={c.activity?.lastMessageAt}
              unread={c.activity?.unreadCount ?? 0}
              isActive={selectedCustomerId === c.id}
              isStub={c.isStub}
              onClick={() => {
                setSelectedCustomerId(c.id);
                setMobileScreen('thread');
              }}
            />
          ))
        )}
      </div>
    </div>
  );

  // ─── Thread Panel ─────────────────────────────────────────────────────────
  const ThreadPanel = (
    <div className="flex flex-col h-full min-w-0">
      {selectedCustomer ? (
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0 bg-background">
            <button
              onClick={() => setMobileScreen('list')}
              className="md:hidden p-1.5 rounded hover:bg-muted transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className={`flex-shrink-0 w-9 h-9 rounded-full ${getAvatarColor(selectedCustomer.name)} flex items-center justify-center text-white text-sm font-bold`}>
              {getInitials(selectedCustomer.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{selectedCustomer.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
                {selectedCustomer.email && <span className="truncate">{selectedCustomer.email}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <VoiceCallPanel
                toNumber={selectedCustomer.phone ?? undefined}
                toName={selectedCustomer.name}
                onCallEnd={(secs) => {
                  refetchFeed();
                  toast.success(`Call ended — ${Math.floor(secs / 60)}m ${secs % 60}s`);
                }}
              />
              <button
                onClick={() => {
                  setActiveCustomer(selectedCustomerId, 'direct');
                  navigateToTopLevel('customer');
                }}
                title="View customer profile"
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <Users className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thread tab bar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border flex-shrink-0 bg-background">
            {(['all', 'calls'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setThreadTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  threadTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab === 'all' ? <MessageSquare size={11} /> : <Phone size={11} />}
                {tab === 'all' ? 'All' : 'Calls'}
              </button>
            ))}
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {threadTab === 'calls' ? (
              callLogItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <Phone className="w-10 h-10 text-muted-foreground/30" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No calls yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Inbound calls will appear here</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {callLogItems.map(log => {
                    const mins = Math.floor((log.durationSecs ?? 0) / 60);
                    const secs = (log.durationSecs ?? 0) % 60;
                    const durationStr = log.durationSecs
                      ? `${mins}m ${secs}s`
                      : null;
                    const statusColors: Record<string, string> = {
                      answered: 'text-green-600 dark:text-green-400',
                      missed: 'text-red-500',
                      voicemail: 'text-amber-500',
                      busy: 'text-orange-500',
                      'no-answer': 'text-red-400',
                    };
                    const statusColor = statusColors[log.status] ?? 'text-muted-foreground';
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                        <div className={`mt-0.5 p-1.5 rounded-full ${
                          log.direction === 'inbound' ? 'bg-blue-500/10' : 'bg-muted'
                        }`}>
                          {log.direction === 'inbound'
                            ? <PhoneIncoming size={13} className="text-blue-500" />
                            : <PhoneOutgoing size={13} className="text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground capitalize">
                              {log.direction} call
                            </span>
                            <span className={`text-xs font-medium capitalize ${statusColor}`}>
                              {log.status}
                            </span>
                            {durationStr && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Clock size={10} />{durationStr}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(log.startedAt).toLocaleString()}
                          </p>
                          {log.callerPhone && (
                            <p className="text-xs text-muted-foreground">{log.callerPhone}</p>
                          )}
                          {/* Inline audio player — uses app S3 URL so no Twilio login needed */}
                          {((log as any).recordingAppUrl || log.recordingUrl || log.voicemailUrl) && (
                            <div className="mt-2 space-y-1.5">
                              {((log as any).recordingAppUrl || log.recordingUrl) && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                                    <Phone size={9} /> Recording
                                  </p>
                                  <audio
                                    controls
                                    src={(log as any).recordingAppUrl || log.recordingUrl!}
                                    className="w-full h-8"
                                    preload="none"
                                  />
                                </div>
                              )}
                              {log.voicemailUrl && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                                    <MessageSquare size={9} /> Voicemail
                                  </p>
                                  <audio
                                    controls
                                    src={log.voicemailUrl}
                                    className="w-full h-8"
                                    preload="none"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : feedLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
            ) : groupedFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Send the first message below</p>
                </div>
              </div>
            ) : (
              <div>
                {groupedFeed.map(group => (
                  <div key={group.date}>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground font-medium">{group.date}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {group.items.map(item => (
                      <FeedBubble key={item.id} item={item} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Compose bar */}
          <div className="border-t border-border bg-background px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-1 mb-2">
              {(['sms', 'email', 'note'] as Channel[]).map(ch => {
                const Icon = CHANNEL_ICON[ch] ?? MessageSquare;
                const labels: Record<string, string> = { sms: 'SMS', email: 'Email', note: 'Note' };
                return (
                  <button
                    key={ch}
                    onClick={() => setComposeChannel(ch)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      composeChannel === ch
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {labels[ch]}
                  </button>
                );
              })}
              {composeChannel === 'sms' && !twilioStatus?.configured && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600">
                  <AlertCircle className="w-3 h-3" /> Twilio not configured
                </span>
              )}
              {composeChannel === 'email' && !gmailStatus?.connected && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600">
                  <AlertCircle className="w-3 h-3" /> Gmail not connected
                </span>
              )}
            </div>
            {composeChannel === 'email' && (
              <Input
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="mb-2 h-8 text-sm"
              />
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  composeChannel === 'sms' ? 'Type a message... (⌘↵ to send)' :
                  composeChannel === 'email' ? 'Type an email...' :
                  'Add an internal note...'
                }
                className="flex-1 min-h-[60px] max-h-[160px] resize-none text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={!composeBody.trim() || isSending}
                size="icon"
                className="h-10 w-10 flex-shrink-0"
              >
                {isSending ? <Clock className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-primary/60" />
          </div>
          <div>
            <h3 className="text-base font-semibold mb-1">Select a customer</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Choose a customer from the list to view their full communication history.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden flex flex-col h-[calc(100vh-57px)] overflow-hidden">
        {mobileScreen === 'list' ? CustomerListPanel : ThreadPanel}
      </div>

      {/* Desktop: 2-panel */}
      <div className="hidden md:flex h-[calc(100vh-57px)] overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
          {CustomerListPanel}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {ThreadPanel}
        </div>
      </div>
    </>
  );
}
