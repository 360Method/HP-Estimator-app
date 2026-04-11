// ============================================================
// SendEstimateDialog — in-app email + SMS send dialog
// Replaces the old mailto:/sms: fallback with server-side delivery
// ============================================================

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Mail, MessageSquare, Send, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface SendEstimateDialogProps {
  estimateNumber: string;
  customerName: string;
  jobTitle: string;
  totalPrice: number;
  depositLabel?: string;
  depositAmount?: number;
  scopeSummary?: string;
  lineItemsText?: string;
  /** Structured JSON string — array of phase objects with line items */
  lineItemsJson?: string;
  portalUrl?: string;
  hpCustomerId?: string;
  // Pre-filled from customer profile
  defaultEmail?: string;
  defaultPhone?: string;
  onClose: () => void;
  onSent?: () => void;
}

export default function SendEstimateDialog({
  estimateNumber,
  customerName,
  jobTitle,
  totalPrice,
  depositLabel,
  depositAmount,
  scopeSummary,
  lineItemsText,
  lineItemsJson,
  portalUrl,
  hpCustomerId,
  defaultEmail = '',
  defaultPhone = '',
  onClose,
  onSent,
}: SendEstimateDialogProps & { lineItemsJson?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [sendViaEmail, setSendViaEmail] = useState(!!defaultEmail);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [sent, setSent] = useState(false);

  const sendMutation = trpc.estimate.send.useMutation({
    onSuccess: (data) => {
      const channels: string[] = [];
      if (data.email) channels.push('email');
      if (data.sms) channels.push('SMS');
      const partial = data.errors.length > 0 ? ` (partial — ${data.errors.join(', ')})` : '';
      toast.success(`Estimate sent via ${channels.join(' & ')}${partial}`);
      setSent(true);
      onSent?.();
    },
    onError: (err) => {
      toast.error(`Send failed: ${err.message}`);
    },
  });

  const fmt = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSend = () => {
    if (!sendViaEmail && !sendViaSms) {
      toast.error('Select at least one channel (email or SMS)');
      return;
    }
    if (sendViaEmail && !email.trim()) {
      toast.error('Enter a valid email address');
      return;
    }
    if (sendViaSms && !phone.trim()) {
      toast.error('Enter a phone number for SMS');
      return;
    }
    sendMutation.mutate({
      sendEmail: sendViaEmail,
      sendSms: sendViaSms,
      toEmail: sendViaEmail ? email.trim() : undefined,
      toPhone: sendViaSms ? phone.trim() : undefined,
      estimateNumber,
      customerName,
      jobTitle,
      totalPrice,
      depositLabel,
      depositAmount,
      scopeSummary,
      lineItemsText,
      lineItemsJson,
      portalUrl,
      hpCustomerId,
      origin: window.location.origin,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">Send Estimate to Customer</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {sent ? (
          /* ── Success state ── */
          <div className="px-6 py-10 text-center">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground mb-1">Estimate Sent!</p>
            <p className="text-sm text-muted-foreground mb-6">
              {customerName} will receive estimate {estimateNumber} shortly.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* ── Estimate summary ── */}
            <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Estimate {estimateNumber}</p>
                  <p className="text-sm font-semibold text-foreground">{jobTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">To: {customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-foreground">{fmt(totalPrice)}</p>
                  {depositLabel && depositAmount && (
                    <p className="text-xs text-muted-foreground">{depositLabel} — {fmt(depositAmount)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* ── Channel toggles ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send via</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Email toggle */}
                  <button
                    onClick={() => setSendViaEmail(v => !v)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      sendViaEmail
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <Mail size={16} />
                    Email
                    {sendViaEmail && <CheckCircle2 size={14} className="ml-auto" />}
                  </button>
                  {/* SMS toggle */}
                  <button
                    onClick={() => setSendViaSms(v => !v)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      sendViaSms
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <MessageSquare size={16} />
                    SMS
                    {sendViaSms && <CheckCircle2 size={14} className="ml-auto" />}
                  </button>
                </div>
              </div>

              {/* ── Email field ── */}
              {sendViaEmail && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Customer Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              {/* ── Phone field ── */}
              {sendViaSms && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Customer Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (360) 555-0100"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              {/* ── Portal link note ── */}
              {portalUrl && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-green-600" />
                  <span>A <strong>Review &amp; Approve</strong> button linking to the customer portal will be included.</span>
                </div>
              )}

              {!sendViaEmail && !sendViaSms && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertCircle size={13} className="shrink-0" />
                  Select at least one channel above.
                </div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sendMutation.isPending || (!sendViaEmail && !sendViaSms)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Sending…</>
                ) : (
                  <><Send size={14} /> Send Estimate</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
