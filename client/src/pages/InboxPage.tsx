// ============================================================
// InboxPage — Unified Communications Hub
// 3-panel layout: sidebar | conversation list | thread view
// Channels: SMS · Email · Call · Internal Note
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import { useInboxSSE } from '@/hooks/useInboxSSE';
import {
  MessageSquare, Mail, Phone, StickyNote, Search, Plus,
  Send, Paperclip, Inbox, Users, Briefcase,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  RefreshCw, MoreHorizontal, X, CheckCheck, AlertCircle, Clock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'sms' | 'email' | 'call' | 'note';
type SidebarFilter = 'all' | 'customers' | 'employees' | 'calls';

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
  body: string;
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
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
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

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors flex items-start gap-3 ${
        isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''
      }`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
            {conv.contactName || conv.contactPhone || conv.contactEmail || 'Unknown'}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtTime(conv.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
            {conv.lastMessagePreview || 'No messages yet'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
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
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
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
      <div className="flex justify-center my-2">
        <div className="max-w-[80%] bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 mb-1 text-amber-600 font-semibold">
            <StickyNote className="w-3 h-3" />
            Internal Note
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{msg.body}</p>
          <div className="mt-1 text-[10px] text-amber-600 text-right">{fmtTime(msg.sentAt)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[72%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {msg.subject && (
          <div className="text-[10px] text-muted-foreground font-medium px-1">Re: {msg.subject}</div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
          isOutbound
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}>
          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
          {msg.attachmentUrl && (
            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-2 text-xs underline opacity-80">
              <Paperclip className="w-3 h-3" />
              Attachment
            </a>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] text-muted-foreground px-1 ${isOutbound ? 'flex-row-reverse' : ''}`}>
          <ChanIcon className={`w-3 h-3 ${CHANNEL_COLORS[msg.channel]}`} />
          <span>{fmtTime(msg.sentAt)}</span>
          {isOutbound && (
            msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-primary" /> :
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">New Conversation</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (360) 555-0100" type="tel" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1" disabled={findOrCreate.isPending}>
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

  const SIDEBAR_ITEMS: { id: SidebarFilter; icon: typeof Inbox; label: string }[] = [
    { id: 'all', icon: Inbox, label: 'All Comms' },
    { id: 'customers', icon: Users, label: 'Customers' },
    { id: 'employees', icon: Briefcase, label: 'Employees' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] bg-background overflow-hidden">

      {/* Notification permission banner */}
      {notifPermission === 'default' && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>Turn on browser notifications to be notified of customer and employee communications</span>
          </div>
          <button
            onClick={requestNotifPermission}
            className="text-xs font-semibold text-amber-900 underline hover:no-underline flex-shrink-0 ml-4"
          >
            Turn on notifications
          </button>
        </div>
      )}

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── SIDEBAR ── */}
        <div className="w-44 flex-shrink-0 border-r border-border bg-muted/30 flex flex-col py-3 gap-0.5 px-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Chat</div>
          {SIDEBAR_ITEMS.map(({ id, icon: Icon, label }) => (
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
              <span className="truncate">{label}</span>
            </button>
          ))}

          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-3 mb-1">Calls</div>
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
        </div>

        {/* ── CONVERSATION / CALL LOG LIST ── */}
        <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {sidebarFilter === 'all' ? 'All Comms' :
               sidebarFilter === 'customers' ? 'Customers' :
               sidebarFilter === 'employees' ? 'Employees' : 'Voice Call Log'}
            </h2>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => refetchConvs()} className="p-1.5 rounded hover:bg-muted transition-colors">
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              {sidebarFilter !== 'calls' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setShowNewConv(true)} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>New Conversation</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Search */}
          {sidebarFilter !== 'calls' && (
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {sidebarFilter === 'calls' ? (
              callLogsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
              ) : callLogs.length === 0 ? (
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
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Click + to start a new conversation</p>
                </div>
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

        {/* ── THREAD PANEL ── */}
        {activeConv ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Thread header */}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>More options</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
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

            {/* Compose bar */}
            <div className="border-t border-border bg-background px-4 py-3">
              {/* Channel switcher */}
              <div className="flex items-center gap-1 mb-2">
                {(['sms', 'email', 'note'] as Channel[]).map(ch => {
                  const Icon = CHANNEL_ICONS[ch];
                  const labels = { sms: 'SMS', email: 'Email', note: 'Internal Note' };
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

              {/* Subject line (email only) */}
              {showSubject && (
                <Input
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="mb-2 h-8 text-sm"
                />
              )}

              {/* Message input */}
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
                <div className="flex flex-col gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                        <Paperclip className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Attach file</TooltipContent>
                  </Tooltip>
                  <Button
                    onClick={handleSend}
                    disabled={!composeBody.trim() || isSending}
                    size="sm"
                    className="px-3"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Channel status hints */}
              {composeChannel === 'sms' && (
                <p className={`text-[10px] mt-1.5 ${twilioStatus?.configured ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {twilioStatus?.configured
                    ? `SMS via ${twilioStatus.phoneNumber}`
                    : 'SMS via Twilio — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in Settings → Secrets'}
                </p>
              )}
              {composeChannel === 'email' && (
                <p className={`text-[10px] mt-1.5 ${gmailStatus?.connected ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {gmailStatus?.connected
                    ? `Email via ${gmailStatus.email}`
                    : 'Email via Gmail — connect help@handypioneers.com in Settings → Inbox → Gmail Connect'}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Empty state — no conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-1">Select a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Choose a conversation from the list, or start a new one to communicate with clients and vendors.
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
          }}
        />
      )}
    </div>
  );
}
