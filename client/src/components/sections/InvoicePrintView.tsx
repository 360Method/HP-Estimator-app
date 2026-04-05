// ============================================================
// InvoicePrintView — HP-branded invoice document
// Mirrors the EstimateSection print layout.
// Includes: header, job reference, line items, tax breakdown,
//           payment history, balance due, and job-completion
//           signature block (canvas-based e-signature).
// ============================================================

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Invoice, PaymentRecord, Customer, Opportunity } from '@/lib/types';
import { CheckCircle2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Brand constants ─────────────────────────────────────────
const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';
const HP_COMPANY = {
  name: 'Handy Pioneers',
  fullName: 'Handy Pioneers, LLC',
  address: '808 SE Chkalov Dr 3-433',
  city: 'Vancouver, WA 98683',
  phone: '(360) 544-9858',
  email: 'help@handypioneers.com',
  website: 'www.HandyPioneers.com',
  license: 'HANDYP*761NH',
};

// ── Helpers ─────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const METHOD_LABEL: Record<string, string> = {
  stripe: 'Credit Card (Stripe)',
  paypal: 'PayPal',
  cash: 'Cash',
  check: 'Check',
  zelle: 'Zelle',
  venmo: 'Venmo',
  other: 'Other',
};

// ── Signature canvas ─────────────────────────────────────────
interface SignatureCanvasProps {
  onSave: (dataUrl: string, name: string) => void;
  onCancel: () => void;
}

function SignatureCanvas({ onSave, onCancel }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState('');
  const [hasStrokes, setHasStrokes] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => setDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes || !name.trim()) return;
    onSave(canvas.toDataURL('image/png'), name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Job Completion Sign-Off</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          By signing below, you confirm that all work described in this invoice has been completed
          to your satisfaction and you authorize final payment.
        </p>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">
            Print your name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">
            Signature
          </label>
          <canvas
            ref={canvasRef}
            width={460}
            height={120}
            className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <button onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 mt-1">
            Clear
          </button>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={save}
            disabled={!hasStrokes || !name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Confirm Job Complete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────
interface InvoicePrintViewProps {
  invoice: Invoice;
  customer: Customer;
  opportunity: Opportunity | null;
  onClose: () => void;
  onSaveSignature?: (sig: string, name: string, invoiceId: string) => void;
}

// ── Main component ───────────────────────────────────────────
export default function InvoicePrintView({
  invoice,
  customer,
  opportunity,
  onClose,
  onSaveSignature,
}: InvoicePrintViewProps) {
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  const [completionSig, setCompletionSig] = useState<string | null>(invoice.completionSignature ?? null);
  const [completionName, setCompletionName] = useState<string | null>(invoice.completionSignedBy ?? null);
  const [completionDate, setCompletionDate] = useState<string | null>(invoice.completionSignedAt ?? null);

  const handleSaveSignature = (dataUrl: string, name: string) => {
    const now = new Date().toISOString();
    setCompletionSig(dataUrl);
    setCompletionName(name);
    setCompletionDate(now);
    setShowSignatureCanvas(false);
    onSaveSignature?.(dataUrl, name, invoice.id);
  };

  const isFinal = invoice.type === 'final';
  const isFullyPaid = invoice.balance <= 0;

  // Customer display info
  const clientName = customer.displayName || `${customer.firstName} ${customer.lastName}`.trim() || 'Customer';
  const clientAddress = [customer.street, customer.unit].filter(Boolean).join(' ');
  const clientCityStateZip = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

  // Job info from opportunity
  const jobTitle = opportunity?.title ?? 'Project';
  const jobNumber = (opportunity as any)?.jobNumber ?? '';
  const jobType = (opportunity as any)?.jobType ?? '';
  const serviceAddress = (opportunity as any)?.serviceAddress ?? clientAddress;
  const serviceCity = (opportunity as any)?.serviceCity ?? clientCityStateZip;
  const scopeOfWork = (opportunity as any)?.scopeOfWork ?? opportunity?.notes ?? '';

  return (
    <div className="fixed inset-0 z-40 bg-black/50 overflow-y-auto no-print-overlay invoice-print-root">
      {/* Action bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between no-print shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
          <span className="font-semibold text-slate-800">{invoice.invoiceNumber}</span>
          <span className="text-sm text-slate-500">
            {invoice.type === 'deposit' ? 'Deposit Invoice' : 'Final Invoice'}
          </span>
        </div>
        <div className="flex gap-2">
          {isFinal && !completionSig && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setShowSignatureCanvas(true)}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Sign Job Complete
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="max-w-3xl mx-auto my-8 px-4 print-area">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

          {/* ── Header ─────────────────────────────────────── */}
          <div className="bg-slate-900 text-white px-8 py-6">
            <div className="flex items-start justify-between gap-6">
              {/* Logo + company */}
              <div className="flex items-center gap-4">
                <img src={HP_LOGO} alt="Handy Pioneers" className="h-14 w-14 rounded-xl object-cover" />
                <div>
                  <div className="text-xl font-black tracking-tight">{HP_COMPANY.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{HP_COMPANY.address}</div>
                  <div className="text-xs text-slate-400">{HP_COMPANY.city}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{HP_COMPANY.phone} · {HP_COMPANY.email}</div>
                </div>
              </div>
              {/* Invoice meta */}
              <div className="text-right shrink-0">
                <div className="text-3xl font-black tracking-tight text-white mb-1">
                  {invoice.type === 'deposit' ? 'DEPOSIT' : 'INVOICE'}
                </div>
                <div className="text-lg font-bold text-blue-300">{invoice.invoiceNumber}</div>
                <div className="text-xs text-slate-400 mt-2 space-y-0.5">
                  <div>Issued: {fmtDate(invoice.issuedAt)}</div>
                  <div>Due: {fmtDate(invoice.dueDate)}</div>
                </div>
                <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                  isFullyPaid
                    ? 'bg-emerald-500 text-white'
                    : invoice.status === 'partial'
                    ? 'bg-yellow-400 text-yellow-900'
                    : invoice.status === 'sent'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-600 text-slate-200'
                }`}>
                  {isFullyPaid ? 'PAID' : invoice.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* ── Bill To / Job Reference ─────────────────────── */}
          <div className="grid grid-cols-2 gap-0 border-b border-slate-200">
            {/* Bill To */}
            <div className="px-8 py-5 border-r border-slate-200">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-2">Bill To</div>
              <div className="font-bold text-slate-900 text-sm">{clientName}</div>
              {customer.company && <div className="text-sm text-slate-600">{customer.company}</div>}
              {clientAddress && <div className="text-sm text-slate-600 mt-1">{clientAddress}</div>}
              {clientCityStateZip && <div className="text-sm text-slate-600">{clientCityStateZip}</div>}
              {customer.email && <div className="text-sm text-slate-500 mt-1">{customer.email}</div>}
              {customer.mobilePhone && <div className="text-sm text-slate-500">{customer.mobilePhone}</div>}
            </div>
            {/* Job Reference */}
            <div className="px-8 py-5">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-2">Job Reference</div>
              <div className="font-bold text-slate-900 text-sm">{jobTitle}</div>
              {jobNumber && <div className="text-sm text-slate-600">Job #{jobNumber}</div>}
              {jobType && <div className="text-sm text-slate-600">{jobType}</div>}
              {serviceAddress && serviceAddress !== clientAddress && (
                <>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-2 mb-0.5">Service Address</div>
                  <div className="text-sm text-slate-600">{serviceAddress}</div>
                  {serviceCity && <div className="text-sm text-slate-600">{serviceCity}</div>}
                </>
              )}
              {opportunity?.convertedToJobAt && (
                <div className="text-xs text-slate-400 mt-2">
                  Job started: {fmtShort(opportunity.convertedToJobAt)}
                </div>
              )}
            </div>
          </div>

          {/* ── Scope of Work ───────────────────────────────── */}
          {scopeOfWork && (
            <div className="px-8 py-4 border-b border-slate-200 bg-slate-50">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Scope of Work</div>
              <p className="text-sm text-slate-700 leading-relaxed">{scopeOfWork}</p>
            </div>
          )}

          {/* ── Line Items ──────────────────────────────────── */}
          <div className="px-8 py-5 border-b border-slate-200">
            <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-3">Services</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-semibold text-slate-600">Description</th>
                  <th className="text-right py-2 font-semibold text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-semibold text-slate-600 w-28">Unit Price</th>
                  <th className="text-right py-2 font-semibold text-slate-600 w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lineItems.map(item => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-slate-800">{item.description}</td>
                    <td className="py-2.5 text-right text-slate-600">{item.qty}</td>
                    <td className="py-2.5 text-right text-slate-600">{fmt(item.unitPrice)}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Totals ──────────────────────────────────────── */}
          <div className="px-8 py-5 border-b border-slate-200">
            <div className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>
              {invoice.taxRate > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Sales Tax ({(invoice.taxRate * 100).toFixed(1)}%)</span>
                  <span>{fmt(invoice.taxAmount)}</span>
                </div>
              )}
              {invoice.type === 'deposit' && invoice.depositPercent && (
                <div className="flex justify-between text-slate-500 text-xs">
                  <span>{invoice.depositPercent}% deposit of project total</span>
                  <span></span>
                </div>
              )}
              <div className="flex justify-between font-black text-base text-slate-900 border-t border-slate-200 pt-2 mt-2">
                <span>Total Due</span>
                <span>{fmt(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* ── Payment History ─────────────────────────────── */}
          {invoice.payments.length > 0 && (
            <div className="px-8 py-5 border-b border-slate-200 bg-slate-50">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-3">Payment History</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1.5 font-semibold text-slate-500">Date</th>
                    <th className="text-left py-1.5 font-semibold text-slate-500">Method</th>
                    <th className="text-left py-1.5 font-semibold text-slate-500">Reference</th>
                    <th className="text-right py-1.5 font-semibold text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.payments.map((p: PaymentRecord) => (
                    <tr key={p.id}>
                      <td className="py-2 text-slate-700">{fmtShort(p.paidAt)}</td>
                      <td className="py-2 text-slate-700">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="py-2 text-slate-500 text-xs">{p.reference || p.note || '—'}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2 mt-2">
                <span>Total Paid</span>
                <span className="text-emerald-700">{fmt(invoice.amountPaid)}</span>
              </div>
            </div>
          )}

          {/* ── Balance Due ─────────────────────────────────── */}
          <div className={`px-8 py-5 ${isFullyPaid ? 'bg-emerald-50' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-widest font-bold mb-1 ${isFullyPaid ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {isFullyPaid ? 'Paid in Full' : 'Balance Due'}
                </div>
                <div className={`text-3xl font-black ${isFullyPaid ? 'text-emerald-700' : 'text-white'}`}>
                  {fmt(Math.max(0, invoice.balance))}
                </div>
              </div>
              {isFullyPaid && (
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-8 h-8" />
                  <span className="text-lg">PAID</span>
                </div>
              )}
              {!isFullyPaid && (
                <div className="text-right text-xs text-slate-400 space-y-1">
                  <div>Due: {fmtDate(invoice.dueDate)}</div>
                  <div>Pay by card, PayPal, cash, or check</div>
                  <div className="text-slate-500">3% processing fee applies to cards</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Customer Notes ──────────────────────────────── */}
          {invoice.notes && (
            <div className="px-8 py-4 border-t border-slate-200">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Notes</div>
              <p className="text-sm text-slate-700 leading-relaxed">{invoice.notes}</p>
            </div>
          )}

          {/* ── Job Completion Sign-Off ──────────────────────── */}
          {isFinal && (
            <div className={`px-8 py-6 border-t border-slate-200 ${completionSig ? 'bg-emerald-50' : 'bg-slate-50'}`}>
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-3">
                Job Completion Sign-Off
              </div>
              {completionSig ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    By signing below, the customer confirms that all work described in this invoice has been
                    completed to their satisfaction and authorizes final payment.
                  </p>
                  <div className="flex items-start gap-8">
                    <div>
                      <div className="text-xs text-slate-500 mb-1 font-semibold">Customer Signature</div>
                      <div className="border border-emerald-300 rounded-lg p-2 bg-white inline-block">
                        <img src={completionSig} alt="Customer signature" className="max-h-16 object-contain" />
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-1">{completionName}</div>
                      <div className="text-xs text-slate-500">
                        {completionDate ? new Date(completionDate).toLocaleString() : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm mt-4">
                      <CheckCircle2 className="w-5 h-5" />
                      Job Accepted &amp; Complete
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Customer signature required to confirm job completion. Click "Sign Job Complete" above
                    to capture the customer's e-signature.
                  </p>
                  {/* Print placeholder */}
                  <div className="grid grid-cols-2 gap-8 mt-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Customer Signature</div>
                      <div className="border-b-2 border-slate-400 h-12 w-full"></div>
                      <div className="text-xs text-slate-400 mt-1">Signature</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Date</div>
                      <div className="border-b-2 border-slate-400 h-12 w-full"></div>
                      <div className="text-xs text-slate-400 mt-1">Date</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    "I confirm that all work described in this invoice has been completed to my satisfaction
                    and authorize final payment of {fmt(Math.max(0, invoice.balance))}."
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Payment Terms ────────────────────────────────── */}
          <div className="px-8 py-5 border-t border-slate-200 bg-slate-50">
            <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-2">Payment Terms</div>
            <ul className="space-y-1 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">•</span>
                Payment is due by {fmtDate(invoice.dueDate)}. Late payments may incur a 1.5% monthly finance charge (18% APR).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">•</span>
                A 3% processing fee applies to all credit card payments for non-360° HomeCare Members.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">•</span>
                All work is guaranteed — 1-year workmanship warranty on labor.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">•</span>
                {HP_COMPANY.fullName} is fully licensed and insured in the State of Washington (License: {HP_COMPANY.license}).
              </li>
            </ul>
          </div>

          {/* ── Footer ──────────────────────────────────────── */}
          <div className="px-8 py-4 border-t border-slate-200 flex items-center justify-between gap-4 flex-wrap bg-white">
            <div className="flex items-center gap-3">
              <img src={HP_LOGO} alt="Handy Pioneers" className="h-8 w-8 object-contain rounded" />
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{HP_COMPANY.fullName}</span>
                {' · '}Vancouver, WA · Licensed &amp; Insured
              </div>
            </div>
            <div className="text-xs text-slate-500 text-right">
              <a href={`tel:${HP_COMPANY.phone}`} className="hover:text-blue-600">{HP_COMPANY.phone}</a>
              {' · '}
              <a href={`mailto:${HP_COMPANY.email}`} className="hover:text-blue-600">{HP_COMPANY.email}</a>
              {' · '}
              {HP_COMPANY.website}
            </div>
          </div>
        </div>
      </div>

      {/* Signature modal */}
      {showSignatureCanvas && (
        <SignatureCanvas
          onSave={handleSaveSignature}
          onCancel={() => setShowSignatureCanvas(false)}
        />
      )}

      {/* Print styles — isolate only the invoice document */}
      <style>{`
        @media print {
          /* Hide everything on the page */
          body > * { display: none !important; }
          /* Show only the invoice document inside the overlay */
          body .invoice-print-root { display: block !important; position: static !important; background: white !important; overflow: visible !important; }
          body .invoice-print-root .no-print { display: none !important; }
          body .invoice-print-root .print-area { display: block !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          /* Reset overlay chrome */
          body .invoice-print-root { position: fixed !important; inset: 0 !important; z-index: 9999 !important; background: white !important; }
          .shadow-sm, .shadow { box-shadow: none !important; }
          .rounded-xl { border-radius: 0 !important; }
          .border { border: none !important; }
        }
      `}</style>
    </div>
  );
}
