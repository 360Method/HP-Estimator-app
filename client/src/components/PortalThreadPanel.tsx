// ============================================================
// PortalThreadPanel — HP-side view of a single portal customer thread
// Used in InboxPage when sidebarFilter === 'portal'
// ============================================================
import { useRef, useEffect } from 'react';
import { ChevronLeft, Send, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PortalMsg {
  id: number;
  customerId: number;
  senderRole: 'customer' | 'hp_team';
  senderName?: string | null;
  body: string;
  readAt?: Date | null;
  createdAt: Date;
}

interface PortalThreadPanelProps {
  customerId: number;
  messages: PortalMsg[];
  replyText: string;
  onReplyChange: (val: string) => void;
  onReply: () => void;
  isSending: boolean;
  onBack?: () => void; // mobile only
}

function fmtTime(d: Date | string) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLabel(d: Date | string) {
  const date = d instanceof Date ? d : new Date(d);
  const today = new Date();
  const diff = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function PortalThreadPanel({
  customerId,
  messages,
  replyText,
  onReplyChange,
  onReply,
  isSending,
  onBack,
}: PortalThreadPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Group by date label
  const grouped = sorted.reduce<{ date: string; msgs: PortalMsg[] }[]>((acc, msg) => {
    const label = fmtDateLabel(msg.createdAt);
    const last = acc[acc.length - 1];
    if (last && last.date === label) last.msgs.push(msg);
    else acc.push({ date: label, msgs: [msg] });
    return acc;
  }, []);

  const customerName = sorted.find(m => m.senderRole === 'customer')?.senderName || `Customer #${customerId}`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (replyText.trim()) onReply();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-background">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-primary font-medium flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[15px]">Portal Messages</span>
          </button>
        )}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">
          {customerName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{customerName}</div>
          <div className="text-xs text-muted-foreground">Client Portal</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div>
            {grouped.map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">{group.date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {group.msgs.map(msg => {
                  const isHP = msg.senderRole === 'hp_team';
                  return (
                    <div
                      key={msg.id}
                      className={`flex mb-3 ${isHP ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isHP && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold mr-2 mt-0.5">
                          {customerName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={`max-w-[70%] ${isHP ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isHP
                              ? 'bg-[#1a2e1a] text-white rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                          }`}
                        >
                          {msg.body}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {isHP ? 'HP Team · ' : ''}{fmtTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <div className="border-t border-border bg-background px-3 py-3 pb-safe">
        <div className="flex items-end gap-2">
          <Textarea
            value={replyText}
            onChange={e => onReplyChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply to customer via portal..."
            className="flex-1 resize-none text-sm min-h-[60px] max-h-[140px]"
            rows={2}
          />
          <Button
            onClick={onReply}
            disabled={!replyText.trim() || isSending}
            size="sm"
            className="px-3 bg-[#1a2e1a] hover:bg-[#2d4a2d]"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">⌘↵ to send · Replies visible in client portal</p>
      </div>
    </div>
  );
}
