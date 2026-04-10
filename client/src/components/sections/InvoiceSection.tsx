// ============================================================
// InvoiceSection — Full invoice lifecycle UI
// Deposit invoice + Final invoice, Stripe + PayPal + manual payments
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Invoice, PaymentRecord, PaymentMethod, InvoiceStatus, Customer, Opportunity } from '@/lib/types';
import InvoicePrintView from './InvoicePrintView';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CreditCard, DollarSign, CheckCircle2, Clock, AlertCircle, FileText,
  Plus, Printer, Send, ChevronRight, Banknote, Smartphone, PenLine, ShieldCheck,
} from 'lucide-react';

// ── Clark County WA Tax Rates (WA DOR Q2 2026) ───────────────────
const CLARK_COUNTY_TAX_RATES: { label: string; rate: number; code: string }[] = [
  { label: 'No Tax (0%)', rate: 0, code: 'none' },
  // Unincorporated areas
  { label: 'Clark County Unincorp. Areas (8.0%)', rate: 0.0800, code: '0600' },
  { label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.0870, code: '0666' },
  // Cities — alphabetical
  { label: 'Battle Ground (8.9%)', rate: 0.0890, code: '0601' },
  { label: 'Camas (8.8%)', rate: 0.0880, code: '0602' },
  { label: 'La Center (8.8%)', rate: 0.0880, code: '0611' },
  { label: 'Ridgefield (8.8%)', rate: 0.0880, code: '0604' },
  { label: 'Vancouver (8.9%)', rate: 0.0890, code: '0603' },
  { label: 'Washougal (8.6%)', rate: 0.0860, code: '0605' },
  { label: 'Woodland (7.9%)', rate: 0.0790, code: '0607' },
  { label: 'Yacolt (8.5%)', rate: 0.0850, code: '0606' },
  // Tribal areas
  { label: 'Cowlitz Tribe – Clark Unincorp. (8.0%)', rate: 0.0800, code: '0609' },
  { label: 'Cowlitz Tribe – La Center (8.8%)', rate: 0.0880, code: '0611' },
  // Manual entry
  { label: 'Custom rate…', rate: -1, code: 'custom' },
];

// ── Stripe loader (lazy, keyed on publishable key) ─────────────
let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

// ── Helpers ────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  due: 'bg-orange-100 text-orange-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
  pending_signoff: 'bg-amber-100 text-amber-700',
};

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  stripe: <CreditCard className="w-4 h-4" />,
  paypal: <span className="text-xs font-bold text-blue-600">PP</span>,
  cash: <Banknote className="w-4 h-4" />,
  check: <DollarSign className="w-4 h-4" />,
  zelle: <Smartphone className="w-4 h-4" />,
  venmo: <Smartphone className="w-4 h-4" />,
  other: <DollarSign className="w-4 h-4" />,
};

// ── Stripe Payment Form ────────────────────────────────────────
function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Payment failed');
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed');
      setProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
        <strong>Amount due:</strong> {fmt(amount)}
      </div>
      <PaymentElement />
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={!stripe || processing} className="flex-1">
          {processing ? 'Processing…' : `Pay ${fmt(amount)}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Test card: 4242 4242 4242 4242 · Any future date · Any CVC
      </p>
    </form>
  );
}

// ── Manual Payment Dialog ──────────────────────────────────────
function ManualPaymentDialog({
  open,
  maxAmount,
  onClose,
  onRecord,
}: {
  open: boolean;
  maxAmount: number;
  onClose: () => void;
  onRecord: (payment: Omit<PaymentRecord, 'id'>) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setAmount(maxAmount.toFixed(2));
  }, [open, maxAmount]);

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    onRecord({ method, amount: amt, paidAt: new Date().toISOString(), reference, note });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Manual Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={v => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['cash','check','zelle','venmo','other'] as PaymentMethod[]).map(m => (
                  <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Reference / Check #</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice Card ───────────────────────────────────────────────
function InvoiceCard({
  invoice,
  onUpdate,
  publishableKey,
  paypalClientId,
  customer,
  opportunity,
  allJobInvoices = [],
}: {
  invoice: Invoice;
  onUpdate: (updated: Invoice) => void;
  publishableKey: string | null;
  paypalClientId: string | null;
  customer: Customer | undefined;
  opportunity: Opportunity | null;
  allJobInvoices?: Invoice[];
}) {
  const [showPrintView, setShowPrintView] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showStripe, setShowStripe] = useState(false);
  const [showPayPal, setShowPayPal] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showPayPrompt, setShowPayPrompt] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const createIntent = trpc.payments.createStripeIntent.useMutation();
  const createPaypalOrder = trpc.payments.createPaypalOrder.useMutation();
  const capturePaypalOrder = trpc.payments.capturePaypalOrder.useMutation();
  const sendInvoiceMutation = trpc.gmail.sendInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice emailed: ${data.subject}`);
      // Mark invoice as 'sent' if it was draft
      if (invoice.status === 'draft') {
        onUpdate({ ...invoice, status: 'sent' as InvoiceStatus });
      }
    },
    onError: (err) => toast.error(`Email failed: ${err.message}`),
  });

  const handleSendToCustomer = () => {
    const email = customer?.email;
    if (!email) { toast.error('No email address on file for this customer'); return; }
    sendInvoiceMutation.mutate({
      toEmail: email,
      toName: customer?.firstName ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : undefined,
      hpCustomerId: customer?.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.type,
      invoiceTotal: invoice.total,
      dueDate: invoice.dueDate,
      jobTitle: opportunity?.title,
    });
  };

  const balance = invoice.balance;
  const isPaid = invoice.status === 'paid';

  // ── Stripe flow ──────────────────────────────────────────────
  const handleStripeClick = async () => {
    if (!publishableKey) { toast.error('Stripe not configured'); return; }
    try {
      const amountCents = Math.round(balance * 100);
      const result = await createIntent.mutateAsync({
        amountCents,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerId,
        description: `${invoice.type === 'deposit' ? 'Deposit' : 'Final'} Invoice ${invoice.invoiceNumber}`,
      });
      setClientSecret(result.clientSecret);
      setPaymentIntentId(result.paymentIntentId);
      setShowStripe(true);
    } catch (e) {
      toast.error('Failed to create payment intent');
    }
  };

  const handleStripeSuccess = (intentId: string) => {
    const payment: PaymentRecord = {
      id: nanoid(8),
      method: 'stripe',
      amount: balance,
      paidAt: new Date().toISOString(),
      reference: intentId,
      note: 'Stripe card payment',
    };
    applyPayment(payment);
    setShowStripe(false);
    setClientSecret(null);
    toast.success('Payment received via Stripe!');
  };

  // ── PayPal in-page flow ──────────────────────────────────────
  const [showPayPalButtons, setShowPayPalButtons] = useState(false);

  const handlePayPalApprove = async (orderId: string) => {
    try {
      const result = await capturePaypalOrder.mutateAsync({ orderId });
      if (result.status === 'COMPLETED') {
        const payment: PaymentRecord = {
          id: nanoid(8),
          method: 'paypal',
          amount: balance,
          paidAt: new Date().toISOString(),
          reference: orderId,
          note: 'PayPal payment',
        };
        applyPayment(payment);
        toast.success('PayPal payment captured!');
        setShowPayPalButtons(false);
      } else {
        toast.error(`PayPal status: ${result.status}`);
      }
    } catch {
      toast.error('Failed to capture PayPal payment');
    }
  };

  // ── Apply payment to invoice ──────────────────────────────────
  const applyPayment = useCallback((payment: PaymentRecord) => {
    const newPayments = [...invoice.payments, payment];
    const newAmountPaid = newPayments.reduce((s, p) => s + p.amount, 0);
    const newBalance = Math.max(0, invoice.total - newAmountPaid);
    const newStatus: InvoiceStatus =
      newBalance <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : invoice.status;
    onUpdate({
      ...invoice,
      payments: newPayments,
      amountPaid: newAmountPaid,
      balance: newBalance,
      status: newStatus,
      paidAt: newBalance <= 0 ? new Date().toISOString() : invoice.paidAt,
    });
  }, [invoice, onUpdate]);

  const handleManualPayment = (p: Omit<PaymentRecord, 'id'>) => {
    applyPayment({ ...p, id: nanoid(8) });
    toast.success(`${p.method.charAt(0).toUpperCase() + p.method.slice(1)} payment recorded`);
  };

  const stripeOptions: StripeElementsOptions | undefined = clientSecret
    ? { clientSecret, appearance: { theme: 'stripe' } }
    : undefined;

  return (
    <Card className="border border-border">
      {/* Header */}
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isPaid ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{invoice.invoiceNumber}</span>
                <Badge className={`text-xs ${STATUS_COLORS[invoice.status]}`}>
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {invoice.type === 'deposit' ? 'Deposit Invoice' : 'Final Invoice'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Issued {fmtDate(invoice.issuedAt)} · Due {fmtDate(invoice.dueDate)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold">{fmt(invoice.total)}</div>
            {invoice.balance > 0 && (
              <div className="text-xs text-yellow-600">Balance: {fmt(invoice.balance)}</div>
            )}
            {isPaid && (
              <div className="text-xs text-green-600 flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3 h-3" /> Paid
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Line items */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-right p-2 font-medium w-16">Qty</th>
                  <th className="text-right p-2 font-medium w-24">Unit</th>
                  <th className="text-right p-2 font-medium w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map(item => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2">{item.description}</td>
                    <td className="p-2 text-right">{item.qty}</td>
                    <td className="p-2 text-right">{fmt(item.unitPrice)}</td>
                    <td className="p-2 text-right font-medium">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({(invoice.taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(invoice.taxAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{fmt(invoice.total)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>-{fmt(invoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-yellow-700">
                  <span>Balance Due</span>
                  <span>{fmt(invoice.balance)}</span>
                </div>
              </>
            )}
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded p-2">
              {invoice.notes}
            </div>
          )}

          {/* Payment history */}
          {invoice.payments.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Payment History</div>
              <div className="space-y-1">
                {invoice.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm bg-green-50 rounded p-2">
                    <div className="flex items-center gap-2">
                      {METHOD_ICONS[p.method]}
                      <span className="capitalize">{p.method}</span>
                      {p.reference && <span className="text-xs text-muted-foreground">#{p.reference.slice(-8)}</span>}
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-green-700">{fmt(p.amount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(p.paidAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Completion Sign-Off Gate (final invoices only) ── */}
          {invoice.type === 'final' && !isPaid && !invoice.completionSignature && (
            <div className="rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Client Sign-Off Required Before Payment
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    The client must confirm all work has been completed to their satisfaction before
                    this final invoice can be collected. Open the Print / PDF view to capture their
                    signature.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 w-full sm:w-auto"
                onClick={() => setShowPrintView(true)}
              >
                <PenLine className="w-4 h-4" />
                Get Client Sign-Off
              </Button>
            </div>
          )}

          {/* Completion confirmed banner */}
          {invoice.type === 'final' && !isPaid && invoice.completionSignature && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-800 dark:text-emerald-300">
                <span className="font-semibold">Work confirmed complete</span> — signed by{' '}
                <span className="font-medium">{invoice.completionSignedBy || 'client'}</span>
                {invoice.completionSignedAt && (
                  <> on {fmtDate(invoice.completionSignedAt)}</>
                )}. Payment may now be collected.
              </div>
            </div>
          )}

          {/* ── Pay Balance Prompt (shown immediately after sign-off) ── */}
          {showPayPrompt && !isPaid && invoice.completionSignature && (
            <div className="rounded-xl border-2 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                    Ready to Collect Final Payment
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                    {invoice.completionSignedBy || 'The client'} has signed off on the completed work.
                    The balance of <span className="font-bold">{fmt(balance)}</span> is now due.
                  </p>
                </div>
                <button
                  onClick={() => setShowPayPrompt(false)}
                  className="text-blue-400 hover:text-blue-600 text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Payment actions */}
          {!isPaid && (invoice.type !== 'final' || !!invoice.completionSignature) && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Collect Payment</div>

              {/* Stripe */}
              {showStripe && clientSecret && publishableKey && stripeOptions ? (
                <div className="border rounded-lg p-4">
                  <Elements stripe={getStripePromise(publishableKey)} options={stripeOptions}>
                    <StripePaymentForm
                      clientSecret={clientSecret}
                      amount={balance}
                      onSuccess={handleStripeSuccess}
                      onCancel={() => { setShowStripe(false); setClientSecret(null); }}
                    />
                  </Elements>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {publishableKey && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 justify-start"
                      onClick={handleStripeClick}
                      disabled={createIntent.isPending}
                    >
                      <CreditCard className="w-4 h-4" />
                      {createIntent.isPending ? 'Loading…' : 'Pay with Card'}
                    </Button>
                  )}
                  {paypalClientId && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 justify-start text-blue-700 border-blue-300"
                      onClick={() => setShowPayPalButtons(v => !v)}
                    >
                      <span className="font-bold text-sm">PP</span>
                      {showPayPalButtons ? 'Hide PayPal' : 'Pay with PayPal'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 justify-start"
                    onClick={() => setShowManual(true)}
                  >
                    <Banknote className="w-4 h-4" />
                    Record Payment
                  </Button>
                </div>
              )}

              {/* PayPal in-page SDK buttons */}
              {showPayPalButtons && paypalClientId && (
                <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-xs text-muted-foreground mb-3">Complete PayPal payment below:</p>
                  <PayPalScriptProvider options={{ clientId: paypalClientId, currency: 'USD' }}>
                    <PayPalButtons
                      style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
                      createOrder={async () => {
                        const result = await createPaypalOrder.mutateAsync({
                          amountUsd: balance.toFixed(2),
                          invoiceId: invoice.id,
                          invoiceNumber: invoice.invoiceNumber,
                        });
                        return result.orderId;
                      }}
                      onApprove={async (data) => {
                        await handlePayPalApprove(data.orderID);
                      }}
                      onError={(err) => {
                        console.error('[PayPal]', err);
                        toast.error('PayPal error — please try again');
                      }}
                      onCancel={() => setShowPayPalButtons(false)}
                    />
                  </PayPalScriptProvider>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1"
              onClick={() => setShowPrintView(true)}
            >
              <Printer className="w-3 h-3" /> Print / PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1"
              onClick={handleSendToCustomer}
              disabled={sendInvoiceMutation.isPending || isPaid}
            >
              {sendInvoiceMutation.isPending
                ? <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                : <Send className="w-3 h-3" />}
              {invoice.status === 'sent' ? 'Resend' : 'Send to Customer'}
            </Button>
          </div>

          {/* Invoice PDF overlay */}
          {showPrintView && customer && (
            <InvoicePrintView
              invoice={invoice}
              customer={customer}
              opportunity={opportunity}
              allJobInvoices={allJobInvoices}
              onClose={() => setShowPrintView(false)}
              onSaveSignature={(sig, name, _invId) => {
                const now = new Date().toISOString();
                // Save signature and unlock payment (status: due, NOT paid yet)
                onUpdate({
                  ...invoice,
                  completionSignature: sig,
                  completionSignedBy: name,
                  completionSignedAt: now,
                  status: 'due' as InvoiceStatus,
                });
                setShowPrintView(false);
                setExpanded(true);
                setShowPayPrompt(true);
                toast.success('Sign-off saved — ready to collect final payment');
              }}
            />
          )}
        </CardContent>
      )}

      <ManualPaymentDialog
        open={showManual}
        maxAmount={balance}
        onClose={() => setShowManual(false)}
        onRecord={handleManualPayment}
      />
    </Card>
  );
}

// ── Create Invoice Dialog ──────────────────────────────────────
function CreateInvoiceDialog({
  open,
  onClose,
  onCreate,
  defaultTotal,
  defaultType,
  invoiceNumber,
  defaultTaxCode,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (invoice: Invoice) => void;
  defaultTotal: number;
  defaultType: 'deposit' | 'final';
  invoiceNumber: string;
  defaultTaxCode?: string;
}) {
  const [type, setType] = useState<'deposit' | 'final'>(defaultType);
  const [depositPct, setDepositPct] = useState(50);
  const [taxRateCode, setTaxRateCode] = useState(defaultTaxCode || '0603'); // pre-fill from customer default
  const [customTaxPct, setCustomTaxPct] = useState(8.9);
  const selectedPreset = CLARK_COUNTY_TAX_RATES.find(r => r.code === taxRateCode);
  const taxRate = taxRateCode === 'custom'
    ? customTaxPct / 100
    : (selectedPreset?.rate ?? 0);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const subtotal = type === 'deposit' ? defaultTotal * (depositPct / 100) : defaultTotal;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const handleCreate = () => {
    const invoice: Invoice = {
      id: nanoid(8),
      type,
      status: 'draft',
      invoiceNumber,
      customerId: '',
      opportunityId: '',
      subtotal,
      taxRate,
      taxAmount,
      total,
      depositPercent: type === 'deposit' ? depositPct : undefined,
      issuedAt: new Date().toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      payments: [],
      amountPaid: 0,
      balance: total,
      lineItems: [{
        id: nanoid(8),
        description: type === 'deposit' ? `${depositPct}% Deposit` : 'Project Balance',
        qty: 1,
        unitPrice: subtotal,
        total: subtotal,
      }],
      notes,
      internalNotes: '',
    };
    onCreate(invoice);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Invoice Type</Label>
            <Select value={type} onValueChange={v => setType(v as 'deposit' | 'final')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit Invoice</SelectItem>
                <SelectItem value="final">Final Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'deposit' && (
            <div>
              <Label>Deposit Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={100} value={depositPct}
                  onChange={e => setDepositPct(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% of {fmt(defaultTotal)}</span>
              </div>
            </div>
          )}
          <div>
            <Label>Sales Tax Location (Clark County WA)</Label>
            <Select value={taxRateCode} onValueChange={setTaxRateCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {CLARK_COUNTY_TAX_RATES.map(r => (
                  <SelectItem key={r.code + r.label} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {taxRateCode === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number" min={0} max={30} step={0.1}
                  value={customTaxPct}
                  onChange={e => setCustomTaxPct(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Notes (customer-visible)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {taxRate > 0 && <div className="flex justify-between"><span>Tax</span><span>{fmt(taxAmount)}</span></div>}
            <Separator />
            <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate}>Create Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main InvoiceSection ────────────────────────────────────────
export default function InvoiceSection() {
  const { state, updateCustomer } = useEstimator();

  // Get active customer and opportunity
  const customer = state.customers.find(c => c.id === state.activeCustomerId);
  const activeOpp = state.activeOpportunityId
    ? state.opportunities.find(o => o.id === state.activeOpportunityId)
    : null;

  // Invoices for this opportunity (stored on customer)
  const allInvoices: Invoice[] = (customer?.invoices ?? []);
  const invoices = activeOpp
    ? allInvoices.filter(inv => inv.opportunityId === activeOpp.id)
    : allInvoices;

  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'deposit' | 'final'>('deposit');

  // Fetch Stripe publishable key + PayPal client ID
  const { data: stripeData } = trpc.payments.getStripePublishableKey.useQuery(undefined, {
    retry: false,
    staleTime: Infinity,
  });
  const { data: paypalData } = trpc.payments.getPaypalClientId.useQuery(undefined, {
    retry: false,
    staleTime: Infinity,
  });

  const publishableKey = stripeData?.publishableKey ?? null;
  const paypalClientId = paypalData?.clientId ?? null;

  // Invoice counter — global across all customers to avoid duplicates
  const nextInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const globalCount = state.customers.reduce(
      (sum, c) => sum + (c.invoices?.length ?? 0), 0
    );
    return `INV-${year}-${String(globalCount + 1).padStart(3, '0')}`;
  };

  const handleCreate = (invoice: Invoice) => {
    if (!customer) return;
    const filled: Invoice = {
      ...invoice,
      customerId: customer.id,
      opportunityId: activeOpp?.id ?? '',
      sourceEstimateId: activeOpp?.sourceEstimateId,
    };
    const updated = [...allInvoices, filled];
    updateCustomer(customer.id, { invoices: updated });
    toast.success(`Invoice ${invoice.invoiceNumber} created`);
  };

  const handleUpdate = (updated: Invoice) => {
    if (!customer) return;
    const newInvoices = allInvoices.map(inv => inv.id === updated.id ? updated : inv);
    updateCustomer(customer.id, { invoices: newInvoices });
  };

   const estimateValue = activeOpp?.value ?? 0;
  // Summary stats
  const sortedInvoices = [...invoices].sort((a, b) => {
    const order = { deposit: 0, final: 1, other: 2 };
    return (order[a.type as keyof typeof order] ?? 2) - (order[b.type as keyof typeof order] ?? 2);
  });
  const totalBilled = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid = invoices.reduce((s, inv) => s + inv.amountPaid, 0);
  const totalBalance = invoices.reduce((s, inv) => s + inv.balance, 0);
  const hasDeposit = invoices.some(inv => inv.type === 'deposit');
  const hasFinal = invoices.some(inv => inv.type === 'final');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Invoices</h2>
            {activeOpp?.jobNumber && (
              <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {activeOpp.jobNumber}
              </span>
            )}
          </div>
          {activeOpp && (
            <p className="text-sm text-muted-foreground">
              {activeOpp.title}
              {estimateValue > 0 && <> · <span className="font-medium text-foreground">{fmt(estimateValue)}</span> contract</>}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!hasDeposit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setCreateType('deposit'); setShowCreate(true); }}
            >
              <Plus className="w-3 h-3 mr-1" /> Deposit Invoice
            </Button>
          )}
          {!hasFinal && (
            <Button
              size="sm"
              onClick={() => { setCreateType('final'); setShowCreate(true); }}
            >
              <Plus className="w-3 h-3 mr-1" /> Final Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Contract Value', value: estimateValue, icon: <FileText className="w-4 h-4 text-slate-500" />, muted: true },
            { label: 'Total Billed', value: totalBilled, icon: <DollarSign className="w-4 h-4 text-blue-500" />, muted: false },
            { label: 'Total Paid', value: totalPaid, icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, muted: false },
            { label: 'Balance Due', value: totalBalance, icon: <Clock className="w-4 h-4 text-yellow-500" />, muted: false },
          ].map(stat => (
            <Card key={stat.label} className="p-3">
              <div className="flex items-center gap-2 mb-1">{stat.icon}<span className="text-xs text-muted-foreground">{stat.label}</span></div>
              <div className={`font-bold ${stat.muted ? 'text-muted-foreground' : ''}`}>{fmt(stat.value)}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No invoices yet</p>
          <p className="text-sm mt-1">
            {activeOpp
              ? 'Create a deposit invoice when the estimate is approved, or a final invoice when the job is complete.'
              : 'Open a job opportunity to create invoices linked to it.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedInvoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onUpdate={handleUpdate}
              publishableKey={publishableKey}
              paypalClientId={paypalClientId}
              customer={customer}
              opportunity={activeOpp ?? null}
              allJobInvoices={sortedInvoices}
            />
          ))}
        </div>
      )}

      {/* Payment processor info */}
      <div className="text-xs text-muted-foreground border rounded-lg p-3 space-y-1">
        <div className="font-medium text-foreground">Payment Processors</div>
        <div className="flex items-center gap-2">
          <span className={publishableKey ? 'text-green-600' : 'text-red-500'}>
            {publishableKey ? '✓' : '✗'} Stripe
          </span>
          {!publishableKey && <span>— configure in Settings → Payment</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={paypalClientId ? 'text-green-600' : 'text-yellow-600'}>
            {paypalClientId ? '✓' : '○'} PayPal
          </span>
          {!paypalClientId && <span>— add PAYPAL_CLIENT_ID + PAYPAL_SECRET in Secrets</span>}
        </div>
      </div>

      <CreateInvoiceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
        defaultTotal={estimateValue}
        defaultType={createType}
        invoiceNumber={nextInvoiceNumber()}
        defaultTaxCode={customer?.defaultTaxCode}
      />
    </div>
  );
}
