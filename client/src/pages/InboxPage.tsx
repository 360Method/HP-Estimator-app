// ============================================================
// InboxPage — Unified Communications Hub
// Mobile-first 3-screen navigation:
//   Screen 1: Inbox Home (sections list)
//   Screen 2: Conversation List (with back button)
//   Screen 3: Thread View (with back button)
// Desktop: shows all 3 panels side-by-side
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import { useInboxSSE } from '@/hooks/useInboxSSE';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  MessageSquare, Mail, Phone, StickyNote, Search, Plus,
  Send, Paperclip, Inbox, Users, Briefcase,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  RefreshCw, MoreHorizontal, X, CheckCheck, AlertCircle, Clock,
  ChevronRight, ChevronLeft, Settings, Edit,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import PortalThreadPanel from '@/components/PortalThreadPanel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'sms' | 'email' | 'call' | 'note';
type SidebarFilter = 'all' | 'customers' | 'employees' | 'calls' | 'portal';
// Mobile screen stack
type MobileScreen = 'home' | 'list' | 'thread';

interface Conversation {
  id: number;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

interface Message {
  id: number;
  conversationId: number;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  body: string | null;
  subject: string | null;
  status: string | null;
  isInternal: boolean;
  attachmentUrl: string | null;
  sentAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string | null) {
  const colors = [
    'bg-slate-400', 'bg-blue-400', 'bg-emerald-500', 'bg-violet-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500',
  ];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

function fmtTime(d: Date | null) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }) });
}

function fmtDateLabel(d: Date | null) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

const CHANNEL_ICONS = {
  sms: MessageSquare,
  email: Mail,
  call: Phone,
  note: StickyNote,
};

const CHANNEL_COLORS = {
  sms: 'text-blue-500',
  email: 'text-violet-500',
  call: 'text-emerald-500',
  note: 'text-amber-500',
};

// ─── ConversationItem ─────────────────────────────────────────────────────────

function ConversationItem({
  conv, isActive, onClick,
}: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  const initials = getInitials(conv.contactName);
  const avatarColor = getAvatarColor(conv.contactName);
  const displayName = conv.contactName || conv.contactPhone || conv.contactEmail || 'Unknown';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-border/40 hover:bg-muted/40 active:bg-muted/60 transition-colors flex items-center gap-3.5 ${
        isActive ? 'bg-primary/5' : ''
      }`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-11 h-11 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-bold`}>
        {initials}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[15px] font-semibold truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{fmtTime(conv.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
            {conv.lastMessagePreview || 'No messages yet'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === 'outbound';
  const isNote = msg.channel === 'note' || msg.isInternal;
  const isCall = msg.channel === 'call';
  const ChanIcon = CHANNEL_ICONS[msg.channel] ?? MessageSquare;

  if (isCall) {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-800">
          {msg.direction === 'inbound'
            ? <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600" />
            : <PhoneOutgoing className="w-3.5 h-3.5 text-blue-600" />}
          <span className="font-medium">{msg.direction === 'inbound' ? 'Inbound call' : 'Outbound call'}</span>
          <span className="text-amber-600">{fmtTime(msg.sentAt)}</span>
        </div>
      </div>
    );
  }

  if (isNote) {
    return (
      <div className="flex justify-center my-3">
        <div className="max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-600 font-semibold">
            <StickyNote className="w-3 h-3" />
            Internal Note
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{msg.body}</p>
          <div className="mt-1.5 text-[10px] text-amber-600 text-right">{fmtTime(msg.sentAt)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[78%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {msg.subject && (
          <div className="text-[10px] text-muted-foreground font-medium px-1">Re: {msg.subject}</div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isOutbound
            ? 'bg-blue-500 text-white rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}>
          <p className="whitespace-pre-wrap">{msg.body}</p>
          {msg.attachmentUrl && (
            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-2 text-xs underline opacity-80">
              <Paperclip className="w-3 h-3" />
              Attachment
            </a>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground px-1 ${isOutbound ? 'flex-row-reverse' : ''}`}>
          <ChanIcon className={`w-3 h-3 ${CHANNEL_COLORS[msg.channel]}`} />
          <span>{fmtTime(msg.sentAt)}</span>
          {isOutbound && (
            msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-blue-500" /> :
            msg.status === 'failed' ? <AlertCircle className="w-3 h-3 text-destructive" /> :
            <Clock className="w-3 h-3 opacity-50" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── NewConversationModal ─────────────────────────────────────────────────────

function NewConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const findOrCreate = trpc.inbox.conversations.findOrCreate.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone && !email) { toast.error('Enter a phone number or email'); return; }
    try {
      const conv = await findOrCreate.mutateAsync({
        contactName: name || null,
        contactPhone: phone || null,
        contactEmail: email || null,
      });
      onCreated(conv.id);
    } catch {
      toast.error('Failed to create conversation');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-6 pb-8 sm:pb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Conversation</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Contact Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className="h-11 text-base" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Phone Number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (360) 555-0100" type="tel" className="h-11 text-base" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" className="h-11 text-base" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11">Cancel</Button>
            <Button type="submit" disabled={findOrCreate.isPending} className="flex-1 h-11">
              {findOrCreate.isPending ? 'Creating...' : 'Start Conversation'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── InboxPage (main) ─────────────────────────────────────────────────────────
export default function InboxPage() {
  const { state, setInboxCustomer, setInboxConversation } = useEstimator();
  const { inboxCustomerId, inboxConversationId, inboxChannel } = state;
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all');
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeChannel, setComposeChannel] = useState<Channel>('sms');
  const [composeBody, setComposeBody] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [showSubject, setShowSubject] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  // Mobile navigation state
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('home');
  // Deep-link: HP customer id to pre-select in portal thread panel
  const [deepLinkHpCustomerId, setDeepLinkHpCustomerId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') toast.success('Browser notifications enabled');
  };

  const utils = trpc.useUtils();

  // ── Data queries ──
  const { data: conversations = [], isLoading: convsLoading, refetch: refetchConvs } =
    trpc.inbox.conversations.list.useQuery({ limit: 50, offset: 0 });

  const { data: messages = [], isLoading: msgsLoading, refetch: refetchMsgs } =
    trpc.inbox.messages.list.useQuery(
      { conversationId: activeConvId!, limit: 100, offset: 0 },
      { enabled: activeConvId !== null }
    );

  const { data: callLogs = [], isLoading: callLogsLoading } = trpc.inbox.callLogs.list.useQuery(
    { limit: 100, offset: 0 },
    { enabled: sidebarFilter === 'calls' }
  );

  // Portal messages (all customers, HP-side view)
  const { data: portalMsgsAll = [], isLoading: portalMsgsLoading, refetch: refetchPortalMsgs } =
    trpc.portal.getAllPortalMessages.useQuery(
      undefined,
      { enabled: sidebarFilter === 'portal' || !!deepLinkHpCustomerId }
    );
  const [activePortalCustomerId, setActivePortalCustomerId] = useState<number | null>(null);
  const [portalReplyText, setPortalReplyText] = useState('');
  const replyPortalMsg = trpc.portal.replyToPortalMessage.useMutation({
    onSuccess: () => { setPortalReplyText(''); refetchPortalMsgs(); },
    onError: (err) => toast.error(err.message),
  });

  const { data: twilioStatus } = trpc.inbox.twilio.status.useQuery();
  const { data: gmailStatus } = trpc.gmail.status.useQuery();

  // ── Mutations ──
  const sendMessage = trpc.inbox.messages.send.useMutation({
    onSuccess: () => { setComposeBody(''); setComposeSubject(''); refetchMsgs(); refetchConvs(); },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });

  const sendSms = trpc.inbox.twilio.sendSms.useMutation({
    onSuccess: () => { setComposeBody(''); refetchMsgs(); refetchConvs(); },
    onError: (err) => toast.error(`SMS failed: ${err.message}`),
  });

  const sendEmailMutation = trpc.gmail.sendEmail.useMutation({
    onSuccess: () => { setComposeBody(''); setComposeSubject(''); refetchMsgs(); refetchConvs(); },
    onError: (err) => toast.error(`Email failed: ${err.message}`),
  });

  const markRead = trpc.inbox.conversations.markRead.useMutation({
    onSuccess: () => utils.inbox.conversations.list.invalidate(),
  });

  // ── Deep-link: when inboxCustomerId is set, switch to portal filter for that customer ──
  useEffect(() => {
    if (!inboxCustomerId) return;
    setSidebarFilter('portal');
    setDeepLinkHpCustomerId(inboxCustomerId);
    setInboxCustomer(null);
  }, [inboxCustomerId]);

  // ── Deep-link: when inboxConversationId is set, auto-select that conversation ──
  useEffect(() => {
    if (!inboxConversationId) return;
    setActiveConvId(inboxConversationId);
    if (inboxChannel && (inboxChannel === 'sms' || inboxChannel === 'email' || inboxChannel === 'note')) {
      setComposeChannel(inboxChannel as Channel);
    }
    setMobileScreen('thread');
    // Clear context values after consuming
    setInboxConversation(null, null);
  }, [inboxConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve deepLinkHpCustomerId to a portal customer id once messages load ──
  useEffect(() => {
    if (!deepLinkHpCustomerId || !portalMsgsAll.length) return;
    const match = (portalMsgsAll as any[]).find((m: any) => m.hpCustomerId === deepLinkHpCustomerId);
    if (match) {
      setActivePortalCustomerId(match.customerId);
      setMobileScreen('thread');
      setDeepLinkHpCustomerId(null);
    }
  }, [deepLinkHpCustomerId, portalMsgsAll]);

  // ── Auto-scroll to bottom of thread ──
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Mark as read when opening a conversation ──
  useEffect(() => {
    if (activeConvId !== null) {
      const conv = conversations.find(c => c.id === activeConvId);
      if (conv && conv.unreadCount > 0) markRead.mutate({ id: activeConvId });
    }
  }, [activeConvId]);

  // ── When channel switches to email, show subject ──
  useEffect(() => {
    setShowSubject(composeChannel === 'email');
  }, [composeChannel]);

  // ── Real-time SSE updates ──
  useInboxSSE({
    onNewMessage: (conversationId) => {
      refetchMsgs();
      refetchConvs();
      if (conversationId !== activeConvId) {
        const conv = conversations.find(c => c.id === conversationId);
        const name = conv?.contactName || conv?.contactPhone || 'Someone';
        if (Notification.permission === 'granted') {
          new Notification('New message — Handy Pioneers', { body: `${name} sent a message`, icon: '/favicon.ico' });
        }
      }
    },
    onNewConversation: () => refetchConvs(),
    onPortalMessage: () => {
      // Refresh portal messages list when a customer sends a portal message
      refetchPortalMsgs();
      if (Notification.permission === 'granted') {
        new Notification('New portal message — Handy Pioneers', { body: 'A customer sent a message via the portal', icon: '/favicon.ico' });
      }
    },
  });

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  const filteredConvs = conversations.filter(conv => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        conv.contactName?.toLowerCase().includes(q) ||
        conv.contactPhone?.includes(q) ||
        conv.contactEmail?.toLowerCase().includes(q) ||
        conv.lastMessagePreview?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSend = useCallback(() => {
    if (!activeConvId || !composeBody.trim()) return;
    if (composeChannel === 'sms') {
      if (!activeConv?.contactPhone) { toast.error('No phone number on this conversation'); return; }
      sendSms.mutate({ conversationId: activeConvId, to: activeConv.contactPhone, body: composeBody.trim() });
    } else if (composeChannel === 'email') {
      if (!activeConv?.contactEmail) { toast.error('No email address on this conversation'); return; }
      sendEmailMutation.mutate({
        conversationId: activeConvId,
        to: activeConv.contactEmail,
        subject: composeSubject.trim() || 'Message from Handy Pioneers',
        body: composeBody.trim(),
      });
    } else {
      sendMessage.mutate({
        conversationId: activeConvId,
        channel: 'note',
        body: composeBody.trim(),
        isInternal: true,
      });
    }
  }, [activeConvId, activeConv, composeBody, composeChannel, composeSubject]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSending = sendMessage.isPending || sendSms.isPending || sendEmailMutation.isPending;

  const groupedMessages = messages.reduce<{ date: string; msgs: Message[] }[]>((acc, msg) => {
    const label = fmtDateLabel(msg.sentAt);
    const last = acc[acc.length - 1];
    if (last && last.date === label) last.msgs.push(msg);
    else acc.push({ date: label, msgs: [msg] });
    return acc;
  }, []);

  // Navigate to list screen and set filter
  const goToList = (filter: SidebarFilter) => {
    setSidebarFilter(filter);
    setMobileScreen('list');
  };

  // Navigate to thread
  const openConversation = (id: number) => {
    setActiveConvId(id);
    setMobileScreen('thread');
  };

  // Total unread count
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  // ── Section items for home screen ──
  const chatSections = [
    { id: 'all' as SidebarFilter, label: 'All comms', unread: totalUnread },
    { id: 'customers' as SidebarFilter, label: 'Customers', unread: 0 },
    { id: 'employees' as SidebarFilter, label: 'Employees', unread: 0 },
  ];

  const callSections = [
    { id: 'calls' as SidebarFilter, label: 'Voice call log', unread: 0 },
  ];

  // ─── Screen: Home ─────────────────────────────────────────────────────────

  const HomeScreen = (
    <div className="flex flex-col h-full bg-[#f0f0f5]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 bg-[#f0f0f5]">
        <h1 className="text-3xl font-bold text-foreground">Inbox</h1>
        <button className="p-1.5 rounded-full hover:bg-black/10 transition-colors">
          <Settings className="w-6 h-6 text-foreground/70" />
        </button>
      </div>

      {/* Notification banner */}
      {notifPermission === 'default' && (
        <div className="mx-4 mb-3 flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="text-xs">Enable notifications for new messages</span>
          <button onClick={requestNotifPermission} className="text-xs font-semibold text-amber-900 underline ml-3">Turn on</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {/* CHAT section */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Chat</div>

          {/* All comms — standalone card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-3">
            <button
              onClick={() => goToList('all')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[16px] font-medium text-foreground">All comms</span>
                {totalUnread > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                    {totalUnread}
                  </span>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Customers / Employees / etc — grouped card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-border/50">
            {[
              { id: 'customers' as SidebarFilter, label: 'Customers' },
              { id: 'employees' as SidebarFilter, label: 'Employees' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => goToList(id)}
                className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 active:bg-muted/50 transition-colors"
              >
                <span className="text-[16px] font-medium text-foreground">{label}</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>

        {/* CALLS section */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Calls</div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-border/50">
            <button
              onClick={() => goToList('calls')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 active:bg-muted/50 transition-colors"
            >
              <span className="text-[16px] font-medium text-foreground">Voice call log</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {/* PORTAL section */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Client Portal</div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-border/50">
            <button
              onClick={() => goToList('portal')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-medium text-foreground">Portal Messages</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Screen: Conversation List ────────────────────────────────────────────

  const listTitle =
    sidebarFilter === 'all' ? 'All Comms' :
    sidebarFilter === 'customers' ? 'Customers' :
    sidebarFilter === 'employees' ? 'Employees' :
    sidebarFilter === 'portal' ? 'Portal Messages' : 'Voice Call Log';

  const ListScreen = (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-border bg-background">
        <button
          onClick={() => setMobileScreen('home')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-primary font-medium"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-[15px]">Inbox</span>
        </button>
        <h2 className="text-[17px] font-semibold">{listTitle}</h2>
        {sidebarFilter !== 'calls' ? (
          <button
            onClick={() => setShowNewConv(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Edit className="w-5 h-5 text-primary" />
          </button>
        ) : (
          <button
            onClick={() => refetchConvs()}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Search */}
      {sidebarFilter !== 'calls' && sidebarFilter !== 'portal' && (
        <div className="px-4 py-2.5 border-b border-border bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 h-9 text-sm bg-muted/50 border-0 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sidebarFilter === 'portal' ? (
          portalMsgsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading...</div>
          ) : portalMsgsAll.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No portal messages yet</p>
            </div>
          ) : (
            <div>
              {/* Group by customer */}
              {Object.entries(
                (portalMsgsAll as any[]).reduce((acc: Record<number, any>, msg: any) => {
                  if (!acc[msg.customerId]) acc[msg.customerId] = { customerId: msg.customerId, messages: [] };
                  acc[msg.customerId].messages.push(msg);
                  return acc;
                }, {})
              ).map(([custId, group]: [string, any]) => {
                const latest = group.messages[0];
                const unread = group.messages.filter((m: any) => m.senderRole === 'customer' && !m.readAt).length;
                const isActive = activePortalCustomerId === group.customerId;
                return (
                  <button
                    key={custId}
                    onClick={() => setActivePortalCustomerId(group.customerId)}
                    className={`w-full text-left px-4 py-3.5 border-b border-border/40 hover:bg-muted/40 transition-colors flex items-center gap-3.5 ${
                      isActive ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">
                      {latest.senderName ? latest.senderName.charAt(0).toUpperCase() : 'C'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[15px] font-semibold truncate ${unread > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
                          {latest.senderName || `Customer #${custId}`}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{fmtTime(latest.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-sm truncate ${unread > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                          {latest.senderRole === 'customer' ? '' : 'You: '}{latest.body}
                        </p>
                        {unread > 0 && (
                          <span className="flex-shrink-0 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : sidebarFilter === 'calls' ? (
          callLogsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading...</div>
          ) : (callLogs as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
              <Phone className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No call logs yet</p>
            </div>
          ) : (
            <div>
              {(callLogs as any[]).map((log) => (
                <div key={log.id} className="px-4 py-3.5 border-b border-border/40 flex items-center gap-3.5 hover:bg-muted/30">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    log.status === 'missed' ? 'bg-red-100' :
                    log.direction === 'inbound' ? 'bg-emerald-100' : 'bg-blue-100'
                  }`}>
                    {log.status === 'missed' ? <PhoneMissed className="w-5 h-5 text-destructive" /> :
                     log.direction === 'inbound' ? <PhoneIncoming className="w-5 h-5 text-emerald-600" /> :
                     <PhoneOutgoing className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-medium truncate">{log.callerPhone || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {log.durationSecs ? `${Math.floor(log.durationSecs / 60)}m ${log.durationSecs % 60}s` : '—'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 capitalize">
                      {log.status} · {log.startedAt ? fmtTime(log.startedAt) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : convsLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading...</div>
        ) : filteredConvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground mt-1">Tap the compose button to start one</p>
            </div>
          </div>
        ) : (
          <div>
            {filteredConvs.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv as Conversation}
                isActive={conv.id === activeConvId}
                onClick={() => openConversation(conv.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Screen: Thread View ──────────────────────────────────────────────────

  const ThreadScreen = (
    <div className="flex flex-col h-full bg-background">
      {/* Thread header */}
      <div className="flex items-center gap-2 px-2 py-3 border-b border-border bg-background">
        <button
          onClick={() => setMobileScreen('list')}
          className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-primary font-medium flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-[15px]">{listTitle}</span>
        </button>
        {activeConv && (
          <>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full ${getAvatarColor(activeConv.contactName)} flex items-center justify-center text-white text-xs font-bold`}>
              {getInitials(activeConv.contactName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold truncate">
                {activeConv.contactName || activeConv.contactPhone || activeConv.contactEmail || 'Unknown'}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <VoiceCallPanel
                toNumber={activeConv.contactPhone ?? undefined}
                toName={activeConv.contactName ?? undefined}
                onCallEnd={(secs) => {
                  refetchMsgs();
                  refetchConvs();
                  toast.success(`Call ended — ${Math.floor(secs / 60)}m ${secs % 60}s`);
                }}
              />
              <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {msgsLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Send the first message below</p>
            </div>
          </div>
        ) : (
          <div>
            {groupedMessages.map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">{group.date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {group.msgs.map(msg => (
                  <MessageBubble key={msg.id} msg={msg as Message} />
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Compose bar */}
      <div className="border-t border-border bg-background px-3 py-3 pb-safe">
        {/* Subject line (email only) */}
        {showSubject && (
          <Input
            value={composeSubject}
            onChange={e => setComposeSubject(e.target.value)}
            placeholder="Subject"
            className="mb-2 h-9 text-sm"
          />
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* Channel + attach button */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowNewConv(true)}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            {/* Channel dropdown button */}
            <div className="relative">
              <button
                onClick={() => {
                  const channels: Channel[] = ['sms', 'email', 'note'];
                  const idx = channels.indexOf(composeChannel);
                  setComposeChannel(channels[(idx + 1) % channels.length]);
                }}
                className="flex items-center gap-1 px-2 h-9 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors text-xs font-medium"
              >
                {(() => {
                  const Icon = CHANNEL_ICONS[composeChannel];
                  return <Icon className="w-3.5 h-3.5" />;
                })()}
                <span className="uppercase text-[10px]">{composeChannel}</span>
                <ChevronRight className="w-3 h-3 rotate-90" />
              </button>
            </div>
          </div>

          {/* Text input */}
          <div className="flex-1 relative">
            <Textarea
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                composeChannel === 'sms' ? 'Type a message' :
                composeChannel === 'email' ? 'Type an email...' :
                'Add an internal note...'
              }
              className={`resize-none text-[15px] min-h-[40px] max-h-[120px] rounded-2xl py-2 px-4 ${
                composeChannel === 'note' ? 'bg-amber-50/80 border-amber-200' : 'bg-muted/50 border-border'
              }`}
              rows={1}
            />
          </div>

          {/* Send button */}
          {composeBody.trim() ? (
            <Button
              onClick={handleSend}
              disabled={isSending}
              size="icon"
              className="w-9 h-9 rounded-full flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          ) : (
            <button className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
              <Paperclip className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Channel status hints */}
        {composeChannel === 'sms' && (
          <p className={`text-[10px] mt-1.5 px-1 ${twilioStatus?.configured ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {twilioStatus?.configured
              ? `SMS via ${twilioStatus.phoneNumber}`
              : 'SMS not configured — add Twilio credentials in Settings'}
          </p>
        )}
        {composeChannel === 'email' && (
          <p className={`text-[10px] mt-1.5 px-1 ${gmailStatus?.connected ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {gmailStatus?.connected
              ? `Email via ${gmailStatus.email}`
              : 'Gmail not connected — go to Settings → Inbox → Gmail Connect'}
          </p>
        )}
      </div>
    </div>
  );

  // ─── Desktop layout (md+): show all 3 panels side by side ────────────────

  return (
    <>
      {/* ── MOBILE: single-screen stack ── */}
      <div className="md:hidden flex flex-col h-[calc(100vh-57px)] overflow-hidden">
        {mobileScreen === 'home' && HomeScreen}
        {mobileScreen === 'list' && ListScreen}
        {mobileScreen === 'thread' && (
        sidebarFilter === 'portal' && activePortalCustomerId ? (
          <PortalThreadPanel
            customerId={activePortalCustomerId}
            messages={(portalMsgsAll as any[]).filter((m: any) => m.customerId === activePortalCustomerId)}
            replyText={portalReplyText}
            onReplyChange={setPortalReplyText}
            onReply={() => replyPortalMsg.mutate({ customerId: activePortalCustomerId, body: portalReplyText.trim() })}
            isSending={replyPortalMsg.isPending}
            onBack={() => setMobileScreen('list')}
          />
        ) : activeConv ? ThreadScreen : ListScreen
      )}
      </div>

      {/* ── DESKTOP: 3-panel side-by-side ── */}
      <div className="hidden md:flex h-[calc(100vh-57px)] overflow-hidden">

        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-border bg-[#f0f0f5] flex flex-col py-4 gap-0.5 px-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Chat</div>
          {[
            { id: 'all' as SidebarFilter, icon: Inbox, label: 'All Comms', unread: totalUnread },
            { id: 'customers' as SidebarFilter, icon: Users, label: 'Customers', unread: 0 },
            { id: 'employees' as SidebarFilter, icon: Briefcase, label: 'Employees', unread: 0 },
          ].map(({ id, icon: Icon, label, unread }) => (
            <button
              key={id}
              onClick={() => setSidebarFilter(id)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
                sidebarFilter === id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate flex-1">{label}</span>
              {unread > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {unread}
                </span>
              )}
            </button>
          ))}

          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-3 mb-1">Calls</div>
          <button
            onClick={() => setSidebarFilter('calls')}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
              sidebarFilter === 'calls'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-foreground/70 hover:bg-muted hover:text-foreground'
            }`}
          >
            <Phone className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Voice Call Log</span>
          </button>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-3 mb-1">Portal</div>
          <button
            onClick={() => setSidebarFilter('portal')}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
              sidebarFilter === 'portal'
                ? 'bg-amber-100 text-amber-700 font-semibold'
                : 'text-foreground/70 hover:bg-muted hover:text-foreground'
            }`}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Portal Messages</span>
          </button>
        </div>

        {/* Conversation list */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">{listTitle}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => refetchConvs()} className="p-1.5 rounded hover:bg-muted transition-colors">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              {sidebarFilter !== 'calls' && (
                <button onClick={() => setShowNewConv(true)} className="p-1.5 rounded hover:bg-muted transition-colors">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          {sidebarFilter !== 'calls' && (
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {sidebarFilter === 'portal' ? (
              portalMsgsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
              ) : portalMsgsAll.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No portal messages yet</p>
                </div>
              ) : (
                <div>
                  {Object.entries(
                    (portalMsgsAll as any[]).reduce((acc: Record<number, any>, msg: any) => {
                      if (!acc[msg.customerId]) acc[msg.customerId] = { customerId: msg.customerId, messages: [] };
                      acc[msg.customerId].messages.push(msg);
                      return acc;
                    }, {})
                  ).map(([custId, group]: [string, any]) => {
                    const latest = group.messages[0];
                    const unread = group.messages.filter((m: any) => m.senderRole === 'customer' && !m.readAt).length;
                    const isActive = activePortalCustomerId === group.customerId;
                    return (
                      <button
                        key={custId}
                        onClick={() => setActivePortalCustomerId(group.customerId)}
                        className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors flex items-center gap-3 ${
                          isActive ? 'bg-amber-50' : ''
                        }`}
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">
                          {latest.senderName ? latest.senderName.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`text-sm font-semibold truncate ${unread > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
                              {latest.senderName || `Customer #${custId}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtTime(latest.createdAt)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={`text-xs truncate ${unread > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                              {latest.senderRole === 'customer' ? '' : 'You: '}{latest.body}
                            </p>
                            {unread > 0 && (
                              <span className="flex-shrink-0 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : sidebarFilter === 'calls' ? (
              callLogsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
              ) : (callLogs as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                  <Phone className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No call logs yet</p>
                </div>
              ) : (
                <div>
                  {(callLogs as any[]).map((log) => (
                    <div key={log.id} className="px-4 py-3 border-b border-border/50 flex items-start gap-3 hover:bg-muted/30">
                      <div className={`mt-0.5 flex-shrink-0 ${
                        log.status === 'missed' ? 'text-destructive' :
                        log.direction === 'inbound' ? 'text-emerald-600' : 'text-blue-600'
                      }`}>
                        {log.status === 'missed' ? <PhoneMissed className="w-4 h-4" /> :
                         log.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> :
                         <PhoneOutgoing className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{log.callerPhone || 'Unknown'}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {log.durationSecs ? `${Math.floor(log.durationSecs / 60)}m ${log.durationSecs % 60}s` : '—'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {log.status} · {log.startedAt ? fmtTime(log.startedAt) : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : convsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground/60">Click + to start a new conversation</p>
              </div>
            ) : (
              <div>
                {filteredConvs.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv as Conversation}
                    isActive={conv.id === activeConvId}
                    onClick={() => setActiveConvId(conv.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Thread panel — portal mode */}
        {sidebarFilter === 'portal' ? (
          activePortalCustomerId ? (
            <PortalThreadPanel
              customerId={activePortalCustomerId}
              messages={(portalMsgsAll as any[]).filter((m: any) => m.customerId === activePortalCustomerId)}
              replyText={portalReplyText}
              onReplyChange={setPortalReplyText}
              onReply={() => replyPortalMsg.mutate({ customerId: activePortalCustomerId, body: portalReplyText.trim() })}
              isSending={replyPortalMsg.isPending}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1">Select a portal conversation</h3>
                <p className="text-sm text-muted-foreground max-w-xs">Choose a customer from the list to view their messages.</p>
              </div>
            </div>
          )
        ) : activeConv ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-background">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full ${getAvatarColor(activeConv.contactName)} flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(activeConv.contactName)}
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {activeConv.contactName || activeConv.contactPhone || activeConv.contactEmail || 'Unknown'}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {activeConv.contactPhone && <span>{activeConv.contactPhone}</span>}
                    {activeConv.contactEmail && <span>{activeConv.contactEmail}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <VoiceCallPanel
                  toNumber={activeConv.contactPhone ?? undefined}
                  toName={activeConv.contactName ?? undefined}
                  onCallEnd={(secs) => {
                    refetchMsgs();
                    refetchConvs();
                    toast.success(`Call ended — ${Math.floor(secs / 60)}m ${secs % 60}s`);
                  }}
                />
                <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {msgsLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Send the first message below</p>
                </div>
              ) : (
                <div>
                  {groupedMessages.map(group => (
                    <div key={group.date}>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground font-medium">{group.date}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      {group.msgs.map(msg => (
                        <MessageBubble key={msg.id} msg={msg as Message} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div ref={threadEndRef} />
            </div>
            {/* Desktop compose bar */}
            <div className="border-t border-border bg-background px-4 py-3">
              <div className="flex items-center gap-1 mb-2">
                {(['sms', 'email', 'note'] as Channel[]).map(ch => {
                  const Icon = CHANNEL_ICONS[ch];
                  const labels: Record<string, string> = { sms: 'SMS', email: 'Email', note: 'Note' };
                  return (
                    <button
                      key={ch}
                      onClick={() => setComposeChannel(ch)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        composeChannel === ch
                          ? ch === 'note'
                            ? 'bg-amber-100 text-amber-700 border border-amber-300'
                            : 'bg-primary/10 text-primary border border-primary/30'
                          : 'text-muted-foreground hover:bg-muted border border-transparent'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {labels[ch]}
                    </button>
                  );
                })}
                <div className="ml-auto text-[10px] text-muted-foreground">⌘↵ to send</div>
              </div>
              {showSubject && (
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
                    composeChannel === 'sms' ? 'Type a text message...' :
                    composeChannel === 'email' ? 'Type an email...' :
                    'Add an internal note (not visible to customer)...'
                  }
                  className={`flex-1 resize-none text-sm min-h-[60px] max-h-[160px] ${
                    composeChannel === 'note' ? 'bg-amber-50/50 border-amber-200 focus-visible:ring-amber-300' : ''
                  }`}
                  rows={2}
                />
                <Button
                  onClick={handleSend}
                  disabled={!composeBody.trim() || isSending}
                  size="sm"
                  className="px-3"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
              {composeChannel === 'sms' && (
                <p className={`text-[10px] mt-1.5 ${twilioStatus?.configured ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {twilioStatus?.configured ? `SMS via ${twilioStatus.phoneNumber}` : 'SMS not configured'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-1">Select a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Choose a conversation from the list, or start a new one.
              </p>
            </div>
            <Button onClick={() => setShowNewConv(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Conversation
            </Button>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={(id) => {
            setShowNewConv(false);
            refetchConvs();
            setActiveConvId(id);
            setMobileScreen('thread');
          }}
        />
      )}
    </>
  );
}
