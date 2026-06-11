// CommunicationTab — extracted from CustomerSection.tsx (Phase D3).
// Self-contained, prop-based (no shared context). Markup moved verbatim.
import { useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, AtSign, Inbox, Mail, MessageSquare, Paperclip,
  Phone, PhoneCall, StickyNote, Volume2, X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import VoiceCallPanel from '@/components/VoiceCallPanel';
export default function CommunicationTab({
  customerId,
  customerPhone,
  customerEmail,
  customerName,
}: {
  customerId: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  // legacy launcher props kept for parent compat — unused now
  onOpenInbox?: () => void;
  onOpenInboxWithConversation?: (conversationId: number, channel: 'sms' | 'email' | 'note') => void;
  onOpenInboxPortal?: () => void;
}) {
  const [showCall, setShowCall] = useState(false);
  const [composer, setComposer] = useState<null | 'email' | 'sms' | 'note'>(null);

  const utils = trpc.useUtils();
  const findOrCreate = trpc.inbox.conversations.findOrCreateByCustomer.useMutation();

  const feedQuery = trpc.inbox.unifiedFeed.getByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId, refetchInterval: 30_000 },
  );

  const conversationId = feedQuery.data?.conversationId ?? null;
  const feed = feedQuery.data?.feed ?? [];

  // Resolve the conversationId we need to attach a send to. If no
  // conversation exists yet, lazily create one when the operator opens a
  // composer.
  const ensureConversation = async (
    channel: 'sms' | 'email' | 'note',
  ): Promise<number | null> => {
    if (conversationId) return conversationId;
    try {
      const { conversationId: newId } = await findOrCreate.mutateAsync({
        customerId,
        phone: customerPhone,
        email: customerEmail,
        name: customerName,
        channel,
      });
      return newId;
    } catch (err) {
      console.error('[comms] findOrCreate failed:', err);
      toast.error('Could not open conversation');
      return null;
    }
  };

  const refresh = () => {
    void utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId });
  };

  const handleEmail = () => {
    if (!customerEmail) {
      toast.error('No email address on file for this customer');
      return;
    }
    setComposer('email');
  };
  const handleSms = () => {
    if (!customerPhone) {
      toast.error('No phone number on file for this customer');
      return;
    }
    setComposer('sms');
  };
  const handleNote = () => setComposer('note');
  const handleCall = () => {
    if (!customerPhone) {
      toast.error('No phone number on file for this customer');
      return;
    }
    setShowCall(true);
  };

  return (
    <div className="space-y-5 pb-28">
      {/* ── Header ── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Communications
        </div>
        <div className="text-sm text-foreground">
          One timeline for every email, text, call, and note with{' '}
          <span className="font-semibold">{customerName || 'this customer'}</span>.
          {customerEmail && <span className="text-muted-foreground"> · {customerEmail}</span>}
          {customerPhone && <span className="text-muted-foreground"> · {customerPhone}</span>}
        </div>
      </div>

      {/* ── In-browser call panel (only when active) ── */}
      {showCall && customerPhone && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In-Browser Call
            </span>
            <button
              type="button"
              onClick={() => setShowCall(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4">
            <VoiceCallPanel
              toNumber={customerPhone}
              toName={customerName}
              onCallEnd={() => setShowCall(false)}
            />
          </div>
        </div>
      )}

      {/* ── Unified timeline ── */}
      {feedQuery.isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading timeline…</div>
      ) : feed.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <div className="text-base font-semibold mb-1">No communications yet</div>
          <div className="text-sm">Use the action bar below to send an email, text, or call.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {feed.map((item) => (
            <CommunicationFeedRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* ── Sticky action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg p-3 z-30">
        <div className="max-w-4xl mx-auto grid grid-cols-4 gap-2">
          <ActionBarButton
            icon={<Mail size={16} className="text-sky-500" />}
            label="Email"
            sub={customerEmail || 'No email on file'}
            onClick={handleEmail}
            disabled={!customerEmail || findOrCreate.isPending}
          />
          <ActionBarButton
            icon={<MessageSquare size={16} className="text-primary" />}
            label="SMS"
            sub={customerPhone || 'No phone on file'}
            onClick={handleSms}
            disabled={!customerPhone || findOrCreate.isPending}
          />
          <ActionBarButton
            icon={<Phone size={16} className="text-emerald-500" />}
            label="Call"
            sub={customerPhone || 'No phone on file'}
            onClick={handleCall}
            disabled={!customerPhone}
          />
          <ActionBarButton
            icon={<StickyNote size={16} className="text-amber-500" />}
            label="Note"
            sub="Internal only"
            onClick={handleNote}
            disabled={findOrCreate.isPending}
          />
        </div>
      </div>

      {/* ── Composers ── */}
      {composer === 'email' && customerEmail && (
        <EmailComposer
          to={customerEmail}
          customerName={customerName}
          getConversationId={() => ensureConversation('email')}
          onClose={() => setComposer(null)}
          onSent={refresh}
          replySubject={pickReplySubject(feed)}
          inReplyTo={pickInReplyTo(feed)}
        />
      )}
      {composer === 'sms' && customerPhone && (
        <SmsComposer
          to={customerPhone}
          customerName={customerName}
          getConversationId={() => ensureConversation('sms')}
          onClose={() => setComposer(null)}
          onSent={refresh}
        />
      )}
      {composer === 'note' && (
        <NoteComposer
          customerName={customerName}
          getConversationId={() => ensureConversation('note')}
          onClose={() => setComposer(null)}
          onSent={refresh}
        />
      )}
    </div>
  );
}

type CommsFeedItem = {
  id: string;
  source: 'conversation' | 'portal';
  channel: 'sms' | 'email' | 'note' | 'call' | 'portal';
  direction: 'inbound' | 'outbound';
  body: string;
  subject: string | null;
  isInternal: boolean;
  sentAt: string | Date;
  readAt: string | Date | null;
  conversationId: number | null;
  twilioSid: string | null;
  gmailMessageId: string | null;
  attachmentUrl: string | null;
  attachmentMime: string | null;
  senderName: string | null;
  recordingAppUrl?: string | null;
};

function CommunicationFeedRow({ item }: { item: CommsFeedItem }) {
  const ts = new Date(item.sentAt);
  const tsLabel = ts.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const channelMeta = channelDisplay(item);
  const align = item.direction === 'outbound' ? 'self-end' : 'self-start';
  const bg =
    item.direction === 'outbound'
      ? 'bg-primary/5 border-primary/20'
      : 'bg-muted/30 border-border';
  const directionIcon =
    item.direction === 'outbound' ? (
      <ArrowUpRight size={11} className="text-primary" />
    ) : (
      <ArrowDownLeft size={11} className="text-emerald-600" />
    );

  return (
    <div className={`rounded-xl border ${bg} p-3 max-w-[90%] ${align}`}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
        <span className="flex items-center gap-1 font-semibold text-foreground/80">
          {channelMeta.icon}
          {channelMeta.label}
        </span>
        {directionIcon}
        <span>{item.direction === 'outbound' ? 'Sent' : 'Received'}</span>
        {item.isInternal && (
          <Badge variant="outline" className="text-[9px] uppercase">
            Internal
          </Badge>
        )}
        <span className="ml-auto">{tsLabel}</span>
      </div>
      {item.subject && (
        <div className="text-sm font-semibold text-foreground mb-1">{item.subject}</div>
      )}
      {item.body && (
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {item.body.length > 600 ? item.body.slice(0, 600) + '…' : item.body}
        </div>
      )}
      {item.channel === 'call' && item.recordingAppUrl && (
        <a
          href={item.recordingAppUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
        >
          <Volume2 size={12} /> Listen to recording
        </a>
      )}
      {item.attachmentUrl && (
        <a
          href={item.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
        >
          <Paperclip size={12} /> Attachment
        </a>
      )}
    </div>
  );
}

function channelDisplay(item: CommsFeedItem): { icon: React.ReactNode; label: string } {
  switch (item.channel) {
    case 'email':
      return { icon: <Mail size={12} className="text-sky-500" />, label: 'Email' };
    case 'sms':
      return { icon: <MessageSquare size={12} className="text-primary" />, label: 'SMS' };
    case 'call':
      return { icon: <PhoneCall size={12} className="text-emerald-500" />, label: 'Call' };
    case 'note':
      return { icon: <StickyNote size={12} className="text-amber-500" />, label: 'Note' };
    case 'portal':
      return { icon: <AtSign size={12} className="text-violet-500" />, label: 'Portal Chat' };
    default:
      return { icon: <Inbox size={12} className="text-muted-foreground" />, label: 'Message' };
  }
}

/**
 * Find the most recent inbound email's RFC Message-ID so the operator's reply
 * threads correctly. Falls back to undefined when no inbound email exists yet.
 */
function pickInReplyTo(feed: CommsFeedItem[]): string | undefined {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (item.channel === 'email' && item.direction === 'inbound' && item.gmailMessageId) {
      return item.gmailMessageId;
    }
  }
  return undefined;
}

function pickReplySubject(feed: CommsFeedItem[]): string {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (item.channel === 'email' && item.subject) {
      return item.subject.startsWith('Re:') ? item.subject : `Re: ${item.subject}`;
    }
  }
  return '';
}

function ActionBarButton({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-card hover:bg-muted/60 active:scale-95 transition-all py-2 px-2 disabled:opacity-50"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <span className="text-[10px] text-muted-foreground truncate max-w-full">{sub}</span>
    </button>
  );
}

// ─── Composers ────────────────────────────────────────────────────────────────
function EmailComposer({
  to,
  customerName,
  getConversationId,
  onClose,
  onSent,
  replySubject,
  inReplyTo,
}: {
  to: string;
  customerName?: string;
  getConversationId: () => Promise<number | null>;
  onClose: () => void;
  onSent: () => void;
  replySubject?: string;
  inReplyTo?: string;
}) {
  const [subject, setSubject] = useState(replySubject || '');
  const [body, setBody] = useState('');
  const sendEmail = trpc.gmail.sendEmail.useMutation();

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body required');
      return;
    }
    const conversationId = await getConversationId();
    if (!conversationId) return;
    try {
      await sendEmail.mutateAsync({
        conversationId,
        to,
        subject: subject.trim(),
        body: body.trim(),
        inReplyTo,
      });
      toast.success('Email sent');
      onSent();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send email');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {customerName || to}</DialogTitle>
          <DialogDescription>
            Sent from help@handypioneers.com — replies land back in this timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">To</label>
            <Input value={to} disabled />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Message</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your reply…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendEmail.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sendEmail.isPending}>
            {sendEmail.isPending ? 'Sending…' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmsComposer({
  to,
  customerName,
  getConversationId,
  onClose,
  onSent,
}: {
  to: string;
  customerName?: string;
  getConversationId: () => Promise<number | null>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const sendSms = trpc.inbox.twilio.sendSms.useMutation();

  const handleSend = async () => {
    if (!body.trim()) {
      toast.error('Message required');
      return;
    }
    if (body.length > 1600) {
      toast.error('SMS too long (max 1600 chars)');
      return;
    }
    const conversationId = await getConversationId();
    if (!conversationId) return;
    try {
      await sendSms.mutateAsync({ conversationId, to, body: body.trim() });
      toast.success('Text sent');
      onSent();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send text');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Text {customerName || to}</DialogTitle>
          <DialogDescription>
            Sent via Twilio. Customer replies land in this timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">To</label>
            <Input value={to} disabled />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              Message ({body.length}/1600)
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Quick text…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendSms.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sendSms.isPending}>
            {sendSms.isPending ? 'Sending…' : 'Send Text'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteComposer({
  customerName,
  getConversationId,
  onClose,
  onSent,
}: {
  customerName?: string;
  getConversationId: () => Promise<number | null>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const sendMessage = trpc.inbox.messages.send.useMutation();

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error('Note required');
      return;
    }
    const conversationId = await getConversationId();
    if (!conversationId) return;
    try {
      await sendMessage.mutateAsync({
        conversationId,
        channel: 'note',
        body: body.trim(),
        isInternal: true,
      });
      toast.success('Note saved');
      onSent();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save note');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Note about {customerName || 'this customer'}</DialogTitle>
          <DialogDescription>
            Internal-only — never sent to the customer. Visible to the team in the timeline.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="What should the team know?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendMessage.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={sendMessage.isPending}>
            {sendMessage.isPending ? 'Saving…' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
