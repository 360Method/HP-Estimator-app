// ============================================================
// InvoicePrintView — matches the reference Handy Pioneers invoice layout
// White background, two-column header, bordered meta table,
// customer/contact blocks, line items, totals, payment history, footer.
// ============================================================

import React, { useRef, useState } from 'react';
import { Invoice, Customer, Opportunity } from '@/lib/types';
import { CheckCircle2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TermsAndConditions from '@/components/TermsAndConditions';

// ── Brand constants ─────────────────────────────────────────
const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';
const HP_COMPANY = {
  name: 'Handy Pioneers',
  address: '808 SE Chkalov Dr, 3-433',
  city: 'Vancouver, WA 98683',
  phone: '(360) 544-9858',
  email: 'help@handypioneers.com',
  website: 'http://handypioneers.com',
  license: 'HANDYP*761NH',
  terms: 'https://pro.housecallpro.com/HandyPioneers/701055/terms',
};

// ── Helpers ─────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
function fmtPaymentDate(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate().toString().padStart(2, '0');
  return `${month} ${day}`;
}
function fmtPaymentTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

const METHOD_LABEL: Record<string, string> = {
  stripe: 'Credit Card',
  paypal: 'PayPal',
  cash: 'Cash',
  check: 'Check',
  zelle: 'Zelle',
  venmo: 'Venmo',
  other: 'Other',
};

// ── Signature canvas ─────────────────────────────────────────
// ── Adopted signature renderer (cursive canvas) ─────────────
function renderAdoptedSig(name: string, width = 460, height = 120): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1e293b';
  ctx.font = `italic 52px 'Dancing Script', 'Brush Script MT', cursive`;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, height / 2);
  return canvas.toDataURL('image/png');
}

type SigMode = 'draw' | 'adopt';

interface SignatureCanvasProps {
  onSave: (dataUrl: string, name: string) => void;
  onCancel: () => void;
}

function SignatureCanvas({ onSave, onCancel }: SignatureCanvasProps) {
  const [mode, setMode] = useState<SigMode>('draw');

  // ── Draw mode state ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawName, setDrawName] = useState('');
  const [hasStrokes, setHasStrokes] = useState(false);

  // ── Adopt mode state ──
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [adoptName, setAdoptName] = useState('');

  // Load Dancing Script font for adopt mode
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap';
    document.head.appendChild(link);
  }, []);

  // Re-render adopt preview whenever name changes
  React.useEffect(() => {
    if (mode !== 'adopt') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!adoptName.trim()) return;
    ctx.fillStyle = '#1e293b';
    ctx.font = `italic 52px 'Dancing Script', 'Brush Script MT', cursive`;
    ctx.textBaseline = 'middle';
    ctx.fillText(adoptName.trim(), 20, canvas.height / 2);
  }, [adoptName, mode]);

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

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const saveDrawn = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes || !drawName.trim()) return;
    onSave(canvas.toDataURL('image/png'), drawName.trim());
  };

  const saveAdopted = () => {
    if (!adoptName.trim()) return;
    const dataUrl = renderAdoptedSig(adoptName.trim());
    onSave(dataUrl, adoptName.trim());
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

        {/* ── Mode tabs ── */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setMode('draw')}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'draw' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ✏️ Draw Signature
          </button>
          <button
            onClick={() => setMode('adopt')}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'adopt' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Aa Adopt Signature
          </button>
        </div>

        {/* ── Draw mode ── */}
        {mode === 'draw' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Print your name</label>
              <input
                type="text"
                value={drawName}
                onChange={e => setDrawName(e.target.value)}
                placeholder="Full name"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Signature</label>
              <div className="relative">
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
                {!hasStrokes && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-slate-300 text-sm italic">Sign here</span>
                  </div>
                )}
              </div>
              <button onClick={clearCanvas} className="text-xs text-slate-400 hover:text-slate-600 mt-1">Clear</button>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button
                onClick={saveDrawn}
                disabled={!hasStrokes || !drawName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Confirm Job Complete
              </Button>
            </div>
          </>
        )}

        {/* ── Adopt mode ── */}
        {mode === 'adopt' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Type your full name to adopt a signature</label>
              <input
                type="text"
                value={adoptName}
                onChange={e => setAdoptName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {/* Live cursive preview */}
            <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 overflow-hidden" style={{ height: 80 }}>
              <canvas
                ref={previewCanvasRef}
                width={460}
                height={120}
                className="w-full"
                style={{ height: 80, display: 'block' }}
              />
              {!adoptName.trim() && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-slate-300 text-sm italic">Your adopted signature will appear here</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              By clicking "Adopt &amp; Sign" you agree that this typed representation constitutes your legal electronic signature.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button
                onClick={saveAdopted}
                disabled={!adoptName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Adopt &amp; Sign Job Complete
              </Button>
            </div>
          </>
        )}
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
  /** All invoices for the same job (same opportunityId), used for the Job Invoice Summary section */
  allJobInvoices?: Invoice[];
}

// ── Main component ───────────────────────────────────────────
export default function InvoicePrintView({
  invoice,
  customer,
  opportunity,
  onClose,
  onSaveSignature,
  allJobInvoices = [],
}: InvoicePrintViewProps) {
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
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

  // Customer display info
  const clientName = customer.displayName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Customer';
  const clientAddress = [customer.street, customer.unit].filter(Boolean).join(' ');
  const clientCityStateZip = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  const clientPhone = customer.mobilePhone || customer.homePhone || customer.workPhone || '';
  const clientEmail = customer.email ?? '';

  // Job info from opportunity
  const jobNumber = (opportunity as any)?.jobNumber ?? '';
  const scopeOfWork = (opportunity as any)?.scopeOfWork ?? opportunity?.notes ?? '';

  // Invoice number — strip INV- prefix for display like reference (#167)
  const invDisplay = invoice.invoiceNumber.replace(/^INV-\d{4}-/, '#');
  const jobDisplay = jobNumber ? jobNumber.replace(/^JOB-\d{4}-/, '#') : '—';

  // Tax label
  const taxLabel = invoice.taxLabel ?? (invoice.taxRate > 0 ? `${(invoice.taxRate * 100).toFixed(1)}%` : null);

  // Amount due = balance (what's still owed)
  const amountDue = Math.max(0, invoice.balance);

  return (
    <div className="fixed inset-0 z-40 bg-gray-100 overflow-y-auto invoice-print-root">

      {/* ── Action bar (screen only) ─────────────────────────── */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-800">{invoice.invoiceNumber}</span>
          <span className="text-sm text-gray-500">
            {isFinal ? 'Final Invoice' : 'Deposit Invoice'}
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

      {/* ── Invoice document ─────────────────────────────────── */}
      <div className="print-area max-w-3xl mx-auto my-8 bg-white shadow-sm" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#222' }}>
        <div style={{ padding: '48px 52px 32px' }}>

          {/* ── TOP SECTION: Logo/Company + Meta table ─────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>

            {/* Left: Logo + company */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <img src={HP_LOGO} alt="Handy Pioneers" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '18px', lineHeight: '1.2' }}>{HP_COMPANY.name}</div>
                <div style={{ color: '#555', fontSize: '12px', marginTop: '4px' }}>{HP_COMPANY.address}</div>
                <div style={{ color: '#555', fontSize: '12px' }}>{HP_COMPANY.city}</div>
              </div>
            </div>

            {/* Right: Meta table */}
            <div style={{ border: '1px solid #ccc', minWidth: '280px', fontSize: '12px' }}>
              {/* JOB row — shows job number + title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid #e5e5e5' }}>
                <span style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '11px' }}>JOB</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: '500' }}>{jobDisplay}</span>
                  {opportunity?.title && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>{opportunity.title}</div>
                  )}
                </div>
              </div>
              {[
                { label: 'INVOICE', value: invDisplay },
                { label: 'SERVICE DATE', value: fmtDate(invoice.serviceDate ?? invoice.issuedAt) },
                { label: 'INVOICE DATE', value: fmtDate(invoice.issuedAt) },
                { label: 'PAYMENT TERMS', value: invoice.paymentTerms ?? 'Upon receipt' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid #e5e5e5' }}>
                  <span style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '11px' }}>{row.label}</span>
                  <span style={{ fontWeight: '500' }}>{row.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderTop: '1px solid #ccc' }}>
                <span style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '11px' }}>AMOUNT DUE</span>
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{fmt(amountDue)}</span>
              </div>
            </div>
          </div>

          {/* ── CUSTOMER + CONTACT block ─────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px' }}>

            {/* Left: Bill To */}
            <div>
              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{clientName}</div>
              {clientAddress && <div style={{ color: '#444' }}>{clientAddress}</div>}
              {clientCityStateZip && <div style={{ color: '#444' }}>{clientCityStateZip}</div>}
              {(clientPhone || clientEmail) && <div style={{ marginTop: '12px' }} />}
              {clientPhone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#444', fontSize: '12px' }}>
                  <span>📞</span> {clientPhone}
                </div>
              )}
              {clientEmail && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#444', fontSize: '12px' }}>
                  <span>✉️</span> {clientEmail}
                </div>
              )}
            </div>

            {/* Right: Contact Us */}
            <div style={{ minWidth: '220px' }}>
              <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '11px', marginBottom: '6px' }}>CONTACT US</div>
              <div style={{ borderTop: '1px solid #ddd', paddingTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#444', fontSize: '12px', marginBottom: '4px' }}>
                  <span>📞</span> {HP_COMPANY.phone}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#444', fontSize: '12px' }}>
                  <span>✉️</span> {HP_COMPANY.email}
                </div>
              </div>
            </div>
          </div>

          {/* ── INVOICE heading ───────────────────────────────── */}
          <div style={{ fontSize: '16px', fontWeight: '400', marginBottom: '10px', letterSpacing: '0.02em' }}>
            INVOICE
          </div>

          {/* ── Line items table ──────────────────────────────── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: '500', fontSize: '12px', color: '#444' }}>Services</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '500', fontSize: '12px', color: '#444', width: '60px' }}>qty</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '500', fontSize: '12px', color: '#444', width: '90px' }}>unit price</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '500', fontSize: '12px', color: '#444', width: '90px' }}>amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems && invoice.lineItems.length > 0 ? (
                invoice.lineItems.map((item, i) => (
                  <tr key={item.id ?? i} style={{ borderBottom: '1px solid #e8e8e8' }}>
                    <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: '500' }}>{item.description}</div>
                      {item.notes && (
                        <div style={{ color: '#666', fontSize: '11px', marginTop: '3px', lineHeight: '1.5' }}>
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{item.qty}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(item.unitPrice)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(item.total)}</td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: '500' }}>
                      {isFinal ? 'Final Invoice' : 'Deposit Invoice'} — {opportunity?.title ?? 'Project'}
                    </div>
                    {scopeOfWork && (
                      <div style={{ color: '#666', fontSize: '11px', marginTop: '4px', lineHeight: '1.6' }}>
                        SCOPE OF WORK
                        <br />
                        {scopeOfWork}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>1.0</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(invoice.subtotal)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(invoice.subtotal)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── Statement of Work (final invoices, when available) ── */}
          {isFinal && opportunity?.sowDocument && (
            <div style={{ marginBottom: '28px', borderTop: '2px solid #e8e8e8', paddingTop: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '10px', color: '#222', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Statement of Work
              </div>
              <pre style={{
                fontFamily: 'inherit',
                fontSize: '11px',
                color: '#444',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.65',
                margin: 0,
                padding: '12px 14px',
                background: '#f9f9f9',
                border: '1px solid #e8e8e8',
                borderRadius: '4px',
                maxHeight: '480px',
                overflow: 'auto',
              }}>
                {opportunity.sowDocument}
              </pre>
            </div>
          )}

          {/* ── Totals (right-aligned) ────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
            <div style={{ minWidth: '280px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e8e8e8' }}>
                <span style={{ color: '#444' }}>Subtotal</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>
              {invoice.taxAmount > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e8e8e8' }}>
                    <span style={{ color: '#444' }}>Total Tax</span>
                    <span>{fmt(invoice.taxAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 16px', borderBottom: '1px solid #e8e8e8', color: '#666', fontSize: '12px' }}>
                    <span>{taxLabel ?? `${(invoice.taxRate * 100).toFixed(1)}%`}</span>
                    <span>{fmt(invoice.taxAmount)}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #ccc' }}>
                <span style={{ fontWeight: 'bold' }}>Job Total</span>
                <span style={{ fontWeight: 'bold' }}>{fmt(invoice.total)}</span>
              </div>
              {invoice.amountPaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e8e8e8', color: '#444' }}>
                  <span>Amount Paid</span>
                  <span>−{fmt(invoice.amountPaid)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: '2px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
                  {invoice.amountPaid > 0 ? 'Amount Due' : 'Invoice Amount'}
                </span>
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{fmt(amountDue)}</span>
              </div>
            </div>
          </div>          {/* ── Payment History ──────────────────────────────────── */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontWeight: '400', marginBottom: '8px', color: '#444' }}>Payment History</div>
              {invoice.payments.map((p, i) => (
                <div key={p.id ?? i} style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#444', padding: '3px 0' }}>
                  <span style={{ minWidth: '50px' }}>{fmtPaymentDate(p.paidAt)}</span>
                  <span style={{ minWidth: '100px' }}>{fmtPaymentTime(p.paidAt)}</span>
                  <span style={{ minWidth: '80px' }}>{METHOD_LABEL[p.method] ?? p.method}</span>
                  <span>{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Job Invoice Summary (all invoices for this job) ── */}
          {allJobInvoices.length > 0 && (
            <div style={{ marginBottom: '28px', borderTop: '1px solid #e8e8e8', paddingTop: '20px' }}>
              <div style={{ fontWeight: '500', marginBottom: '10px', color: '#444', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Job Invoice Summary
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: '500', color: '#555', fontSize: '11px' }}>Invoice #</th>
                    <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: '500', color: '#555', fontSize: '11px' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: '500', color: '#555', fontSize: '11px' }}>Date Paid</th>
                    <th style={{ textAlign: 'right', padding: '5px 8px', fontWeight: '500', color: '#555', fontSize: '11px' }}>Amount</th>
                    <th style={{ textAlign: 'right', padding: '5px 8px', fontWeight: '500', color: '#555', fontSize: '11px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allJobInvoices].sort((a, b) => {
                    const order: Record<string, number> = { deposit: 0, final: 1 };
                    return (order[a.type] ?? 2) - (order[b.type] ?? 2);
                  }).map((inv, i) => {
                    const isCurrentInv = inv.id === invoice.id;
                    const lastPayment = inv.payments && inv.payments.length > 0
                      ? inv.payments.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0]
                      : null;
                    const statusLabel: Record<string, string> = {
                      paid: 'Paid', partial: 'Partial', due: 'Due', sent: 'Sent',
                      draft: 'Draft', void: 'Void', pending_signoff: 'Pending Sign-Off',
                    };
                    return (
                      <tr key={inv.id ?? i} style={{
                        borderBottom: '1px solid #ebebeb',
                        backgroundColor: isCurrentInv ? '#fffbeb' : 'transparent',
                      }}>
                        <td style={{ padding: '6px 8px', color: isCurrentInv ? '#92400e' : '#333' }}>
                          {inv.invoiceNumber.replace(/^INV-\d{4}-/, '#')}
                          {isCurrentInv && <span style={{ fontSize: '10px', color: '#b45309', marginLeft: '4px' }}>(this invoice)</span>}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#555', textTransform: 'capitalize' }}>{inv.type}</td>
                        <td style={{ padding: '6px 8px', color: '#555' }}>
                          {lastPayment ? fmtDate(lastPayment.paidAt) : (inv.status === 'paid' && inv.paidAt ? fmtDate(inv.paidAt) : '—')}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#333' }}>{fmt(inv.total)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '500',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            backgroundColor: (inv.status as string) === 'paid' ? '#d1fae5' : (inv.status as string) === 'due' ? '#fef3c7' : '#f3f4f6',
                            color: (inv.status as string) === 'paid' ? '#065f46' : (inv.status as string) === 'due' ? '#92400e' : '#374151',
                          }}>
                            {statusLabel[inv.status] ?? inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #ccc' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', fontWeight: '600', fontSize: '12px', color: '#222' }}>Contract Total</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#222' }}>
                      {fmt(allJobInvoices.reduce((s, inv) => s + inv.total, 0))}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} style={{ padding: '4px 8px', fontSize: '12px', color: '#555' }}>Total Paid</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: '12px', color: '#059669', fontWeight: '500' }}>
                      {fmt(allJobInvoices.reduce((s, inv) => s + inv.amountPaid, 0))}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} style={{ padding: '4px 8px 8px', fontSize: '12px', color: '#555' }}>Balance Remaining</td>
                    <td style={{ padding: '4px 8px 8px', textAlign: 'right', fontSize: '12px', color: '#b45309', fontWeight: '500' }}>
                      {fmt(allJobInvoices.reduce((s, inv) => s + inv.balance, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {/* ── Statement of Work (final invoices only) ──────── */}
          {isFinal && opportunity?.sowDocument && (
            <div style={{ marginBottom: '28px', borderTop: '1px solid #e8e8e8', paddingTop: '20px' }}>
              <div style={{ fontWeight: '500', marginBottom: '10px', color: '#444', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Statement of Work</div>
              <pre style={{
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '11px',
                color: '#444',
                lineHeight: '1.65',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                padding: '12px 14px',
                background: '#fafafa',
                border: '1px solid #e5e5e5',
                borderRadius: '4px',
              }}>{opportunity.sowDocument}</pre>
            </div>
          )}

          {/* ── Job completion sign-off (final invoices) ─────── */}
          {isFinal && (
            <div style={{ marginBottom: '28px', borderTop: '1px solid #e8e8e8', paddingTop: '20px' }}>
              {completionSig ? (
                <div>
                  <div style={{ fontWeight: '500', marginBottom: '8px', color: '#444' }}>Job Completion Confirmed</div>
                  <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</div>
                      <img src={completionSig} alt="Customer signature" style={{ height: '60px', border: '1px solid #ddd', padding: '4px', background: '#fafafa' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Printed Name</div>
                      <div style={{ fontWeight: '500' }}>{completionName}</div>
                      {completionDate && (
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{fmtDate(completionDate)}</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: '500', marginBottom: '12px', color: '#444' }}>Customer Sign-Off — Job Completion</div>
                  <div style={{ display: 'flex', gap: '32px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</div>
                      <div style={{ height: '60px', borderBottom: '1px solid #999', width: '100%' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Printed Name</div>
                      <div style={{ height: '60px', borderBottom: '1px solid #999', width: '100%' }} />
                    </div>
                    <div style={{ width: '120px' }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
                      <div style={{ height: '60px', borderBottom: '1px solid #999', width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Customer notes ────────────────────────────────── */}
          {invoice.notes && (
            <div style={{ marginBottom: '20px', fontSize: '12px', color: '#555' }}>
              {invoice.notes}
            </div>
          )}

          {/* ── Terms & Conditions ────────────────────────────── */}
          <div style={{ fontSize: '12px', color: '#555', marginBottom: '24px' }}>
            See our{' '}
            <button
              onClick={() => setShowTerms(true)}
              className="no-print"
              style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
            >
              Terms &amp; Conditions
            </button>
            <span className="print-only" style={{ color: '#555' }}>
              Terms &amp; Conditions — handypioneers.com/terms
            </span>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #ddd', padding: '10px 52px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#888' }}>
          <span>{HP_COMPANY.name} | {HP_COMPANY.license}</span>
          <span>{HP_COMPANY.website}</span>
        </div>
      </div>

      {/* ── Terms & Conditions modal ─────────────────────────── */}
      {showTerms && <TermsAndConditions onClose={() => setShowTerms(false)} />}

      {/* ── Signature canvas modal ───────────────────────────── */}
      {showSignatureCanvas && (
        <SignatureCanvas
          onSave={handleSaveSignature}
          onCancel={() => setShowSignatureCanvas(false)}
        />
      )}

      {/* ── Print styles ─────────────────────────────────────── */}
      <style>{`
        /* Hide print-only elements on screen */
        .print-only { display: none; }
        @media print {
          /* Hide everything on the page */
          body > * { display: none !important; }
          /* Show only the invoice root */
          body .invoice-print-root {
            display: block !important;
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            background: white !important;
            overflow: visible !important;
          }
          /* Hide the action bar and gray overlay bg */
          body .invoice-print-root .no-print { display: none !important; }
          /* Show print-only elements when printing */
          body .invoice-print-root .print-only { display: inline !important; }
          body .invoice-print-root { background: white !important; }
          /* Print area: remove screen margin/shadow */
          body .invoice-print-root .print-area {
            margin: 0 !important;
            max-width: 100% !important;
            box-shadow: none !important;
          }
          @page { margin: 0; }
        }
      `}</style>
    </div>
  );
}
