// ============================================================
// HP Field Estimator — Present Section (PDF-style single page)
// Design: Matches the HP estimate PDF layout exactly.
//   - White document on dark overlay
//   - HP logo top-left, estimate info table top-right
//   - Client block left / HP contact block right
//   - Per-phase service tables with SOW bullets
//   - Subtotal per phase, grand total, deposit
//   - Inline e-signature: Draw OR Adopt (type-to-sign)
//   - Column visibility panel: toggle qty/unit price/labor/material/amount
//   - Email-to-sign button (mailto: pre-filled)
//   - Print button (triggers window.print())
// ============================================================

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcCustomItem, calcTotals, fmtDollar, fmtDollarCents } from '@/lib/calc';
import { X, Printer, Mail, PenLine, RotateCcw, Check, CheckCircle2, Settings2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import EstimateApprovedModal from '@/components/EstimateApprovedModal';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';
const HP_ADDRESS = '808 SE Chkalov Dr, 3-433\nVancouver, WA 98683';
const HP_PHONE = '(360) 544-9858';
const HP_EMAIL = 'help@handypioneers.com';
const HP_WEB = 'http://handypioneers.com';

// ─── Column visibility config ─────────────────────────────────
export type ColKey = 'qty' | 'unitPrice' | 'labor' | 'material' | 'amount';

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: 'qty',       label: 'Qty' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'labor',     label: 'Labor' },
  { key: 'material',  label: 'Material' },
  { key: 'amount',    label: 'Amount' },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  qty:       true,
  unitPrice: true,
  labor:     false,
  material:  false,
  amount:    true,
};

// ─── SOW bullet generator ─────────────────────────────────────
function buildSowBullets(items: { id: string; name: string; qty: number; tier: string; tiers: Record<string, { name: string }>; hasTiers: boolean; unitType: string; wastePct: number; paintPrep?: string; hasPaintPrep?: boolean; sowTemplate?: string; salesSelected?: boolean }[]): { title: string; desc: string }[] {
  const bullets: { title: string; desc: string }[] = [];
  for (const item of items) {
    const tierData = item.hasTiers ? item.tiers[item.tier] : null;
    const tierName = tierData?.name ?? '';
    const qty = item.qty;
    const u = item.unitType;
    const qtyMap: Record<string, string> = {
      lf: `${qty} linear ft`, sqft: `${qty} sq ft`, unit: `${qty} unit${qty !== 1 ? 's' : ''}`,
      hr: `${qty} hr${qty !== 1 ? 's' : ''}`, opening: `${qty} opening${qty !== 1 ? 's' : ''}`,
      load: `${qty} load${qty !== 1 ? 's' : ''}`, patch: `${qty} patch${qty !== 1 ? 'es' : ''}`,
      step: `${qty} step${qty !== 1 ? 's' : ''}`, closet: `${qty} closet${qty !== 1 ? 's' : ''}`,
      fixture: `${qty} fixture${qty !== 1 ? 's' : ''}`, circuit: `${qty} circuit${qty !== 1 ? 's' : ''}`,
      can: `${qty} can${qty !== 1 ? 's' : ''}`, door: `${qty} door${qty !== 1 ? 's' : ''}`,
      box: `${qty} box${qty !== 1 ? 'es' : ''}`, window: `${qty} window${qty !== 1 ? 's' : ''}`,
      fan: `${qty} fan${qty !== 1 ? 's' : ''}`, device: `${qty} device${qty !== 1 ? 's' : ''}`,
    };
    const qtyLabel = qtyMap[u] ?? `${qty} ${u}`;
    const matLabel = item.hasTiers && tierName ? tierName : item.name;
    const title = item.hasTiers
      ? `Supply and install ${qtyLabel} of ${matLabel}${item.wastePct > 0 ? ` (includes ${item.wastePct}% waste allowance)` : ''}`
      : `${item.name} — ${qtyLabel}`;
    const desc = item.hasPaintPrep && item.paintPrep && item.paintPrep !== 'none'
      ? item.paintPrep === 'caulk' ? 'Includes caulk and touch-up prep.' : 'Includes full paint prep and caulking.'
      : '';
    bullets.push({ title, desc });
  }
  return bullets;
}

// ─── Adopted (typed) signature renderer ───────────────────────
// Renders the typed name in a cursive font onto a canvas and returns a data URL.
function renderAdoptedSig(name: string, width = 700, height = 160): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, width, height);
  ctx.font = `italic 64px 'Dancing Script', 'Brush Script MT', cursive`;
  ctx.fillStyle = '#1a1a2e';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 24, height / 2);
  return canvas.toDataURL('image/png');
}

// ─── Signature Panel (Draw + Adopt tabs) ─────────────────────
type SigMode = 'draw' | 'adopt';

function SignaturePanel({ onSave, onCancel }: { onSave: (dataUrl: string, name: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<SigMode>('draw');

  // ── Draw mode state ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [drawName, setDrawName] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // ── Adopt mode state ──
  const [adoptName, setAdoptName] = useState('');
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load cursive font for adopt mode
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Re-render adopt preview whenever name changes
  useEffect(() => {
    if (mode !== 'adopt') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!adoptName.trim()) return;
    ctx.font = `italic 64px 'Dancing Script', 'Brush Script MT', cursive`;
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    ctx.fillText(adoptName.trim(), 24, canvas.height / 2);
  }, [adoptName, mode]);

  // ── Draw helpers ──
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const endDraw = () => { setIsDrawing(false); lastPos.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  // ── Save handlers ──
  const saveDrawn = () => {
    if (!hasStrokes) { toast.error('Please sign before accepting'); return; }
    if (!drawName.trim()) { toast.error('Please enter your name'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'), drawName.trim());
  };

  const saveAdopted = () => {
    if (!adoptName.trim()) { toast.error('Please type your name to adopt a signature'); return; }
    const dataUrl = renderAdoptedSig(adoptName.trim());
    if (!dataUrl) { toast.error('Could not render signature'); return; }
    onSave(dataUrl, adoptName.trim());
  };

  return (
    <div className="border border-border rounded-xl p-5 bg-white shadow-sm">
      <div className="text-sm font-semibold text-foreground mb-3">Client Signature</div>

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode('draw')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === 'draw' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          ✏️ Draw Signature
        </button>
        <button
          onClick={() => setMode('adopt')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === 'adopt' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Aa Adopt Signature
        </button>
      </div>

      {/* ── Draw mode ── */}
      {mode === 'draw' && (
        <>
          <div className="mb-3">
            <label className="block text-xs text-muted-foreground mb-1">Full Name (print)</label>
            <input
              type="text"
              value={drawName}
              onChange={e => setDrawName(e.target.value)}
              placeholder="Client's full name"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="border-2 border-dashed border-border rounded-lg bg-slate-50 mb-3 relative" style={{ touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={160}
              className="w-full h-28 rounded-lg cursor-crosshair"
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
                <span className="text-muted-foreground/50 text-sm italic">Sign here</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={clearCanvas} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
            <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={saveDrawn}
              disabled={!hasStrokes || !drawName.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              <Check className="w-3.5 h-3.5" /> Accept & Sign
            </button>
          </div>
        </>
      )}

      {/* ── Adopt mode ── */}
      {mode === 'adopt' && (
        <>
          <div className="mb-3">
            <label className="block text-xs text-muted-foreground mb-1">Type your full name to adopt a signature</label>
            <input
              type="text"
              value={adoptName}
              onChange={e => setAdoptName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Live cursive preview */}
          <div className="border-2 border-dashed border-border rounded-lg bg-slate-50 mb-3 relative overflow-hidden" style={{ height: 80 }}>
            <canvas
              ref={previewCanvasRef}
              width={700}
              height={160}
              className="w-full"
              style={{ height: 80, display: 'block' }}
            />
            {!adoptName.trim() && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-muted-foreground/50 text-sm italic">Your adopted signature will appear here</span>
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground mb-3">
            By clicking "Adopt &amp; Sign" you agree that this typed representation constitutes your legal electronic signature.
          </p>

          <div className="flex gap-2">
            <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={saveAdopted}
              disabled={!adoptName.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              <Check className="w-3.5 h-3.5" /> Adopt &amp; Sign
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Column Visibility Panel ──────────────────────────────────
function ColVisPanel({ cols, onChange, onClose }: { cols: Record<ColKey, boolean>; onChange: (k: ColKey, v: boolean) => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-xl p-4 w-56">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-foreground">Visible Columns</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        {ALL_COLS.map(col => (
          <label key={col.key} className="flex items-center gap-2 cursor-pointer group">
            <div
              onClick={() => onChange(col.key, !cols[col.key])}
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${cols[col.key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cols[col.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-foreground group-hover:text-foreground/80">{col.label}</span>
            {cols[col.key] ? <Eye className="w-3 h-3 text-emerald-500 ml-auto" /> : <EyeOff className="w-3 h-3 text-muted-foreground ml-auto" />}
          </label>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex gap-2">
        <button
          onClick={() => ALL_COLS.forEach(c => onChange(c.key, true))}
          className="flex-1 text-xs px-2 py-1 border border-border rounded hover:bg-muted transition-colors"
        >
          Show All
        </button>
        <button
          onClick={() => ALL_COLS.forEach(c => onChange(c.key, c.key === 'amount'))}
          className="flex-1 text-xs px-2 py-1 border border-border rounded hover:bg-muted transition-colors"
        >
          Minimal
        </button>
      </div>
    </div>
  );
}

// ─── Main PresentSection ──────────────────────────────────────
export default function PresentSection() {
  const { state, setSection, setSignature, clearSignature } = useEstimator();
  const [showSigPad, setShowSigPad] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showApprovedModal, setShowApprovedModal] = useState(false);
  const [pendingSignatureDataUrl, setPendingSignatureDataUrl] = useState<string | undefined>(undefined);
  const docRef = useRef<HTMLDivElement>(null);

  const { jobInfo } = state;

  const toggleCol = useCallback((k: ColKey, v: boolean) => {
    setCols(prev => ({ ...prev, [k]: v }));
  }, []);

  // Compute all phase results
  const phaseResults = useMemo(() =>
    state.phases.map(p => calcPhase(p, state.global)),
    [state.phases, state.global]
  );
  const customResults = useMemo(() =>
    state.customItems.map(ci => calcCustomItem(ci, state.global)),
    [state.customItems, state.global]
  );
  const totals = useMemo(() => calcTotals(phaseResults, customResults), [phaseResults, customResults]);

  const activePhases = phaseResults.filter(p => p.hasData);
  const activeCustom = customResults.filter(c => c.hasData);

  // Group custom items by phase
  const customByPhase = useMemo(() => {
    const map: Record<number, typeof activeCustom> = {};
    for (const c of activeCustom) {
      if (!map[c.phaseId]) map[c.phaseId] = [];
      map[c.phaseId].push(c);
    }
    return map;
  }, [activeCustom]);

  // Deposit from configured settings (pct or flat)
  const deposit = state.depositType === 'pct'
    ? totals.totalPrice * (state.depositValue / 100)
    : state.depositValue;
  const depositLabel = state.depositType === 'pct'
    ? `Deposit (${state.depositValue}%)`
    : 'Deposit (Fixed Amount)';

  const handleSign = (dataUrl: string, name: string) => {
    setSignature(dataUrl, name);
    setShowSigPad(false);
    // Store the signature data URL so the modal can pass it to approveEstimate
    setPendingSignatureDataUrl(dataUrl);
    // Open the approval workflow modal
    setShowApprovedModal(true);
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Handy Pioneers — Project Estimate ${jobInfo.jobNumber}`);
    const body = encodeURIComponent(
      `Hi ${jobInfo.client || 'there'},\n\nPlease review your project estimate from Handy Pioneers below.\n\nEstimate: ${jobInfo.jobNumber}\nTotal: ${fmtDollar(totals.totalPrice)}\n\nPlease reply to this email or call (360) 544-9858 to approve.\n\nThank you,\nHandy Pioneers\n${HP_WEB}`
    );
    window.open(`mailto:${jobInfo.email}?subject=${subject}&body=${body}`);
  };

  const handlePrint = () => window.print();
  const handleClose = () => setSection('estimate');

  // Format date helper
  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
  };

  // Build visible column headers
  const visibleCols = ALL_COLS.filter(c => cols[c.key]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-800/95 overflow-y-auto print:bg-white print:overflow-visible">
      {/* ── Toolbar (hidden on print) ── */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
        <button onClick={handleClose} className="p-1.5 rounded hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 text-sm font-semibold">
          Present Estimate — {jobInfo.client || 'Client'} · {jobInfo.jobNumber}
        </div>
        <div className="flex items-center gap-2">
          {/* Column visibility toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColPanel(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-semibold transition-colors ${showColPanel ? 'bg-white/20 border-white/40' : 'border-white/20 hover:bg-white/10'}`}
              title="Customize visible columns"
            >
              <Settings2 className="w-3.5 h-3.5" /> Columns
            </button>
            {showColPanel && (
              <ColVisPanel
                cols={cols}
                onChange={toggleCol}
                onClose={() => setShowColPanel(false)}
              />
            )}
          </div>

          {state.signature ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Signed by {state.signedBy}
            </div>
          ) : (
            <button
              onClick={() => setShowSigPad(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-semibold transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" />
              Sign Now
            </button>
          )}
          {state.signature && (
            <button onClick={() => clearSignature()} className="px-2 py-1.5 text-xs border border-white/20 hover:bg-white/10 rounded transition-colors">
              Clear Sig
            </button>
          )}
          <button onClick={handleEmail} className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 hover:bg-white/10 rounded text-xs font-semibold transition-colors">
            <Mail className="w-3.5 h-3.5" /> Email
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 hover:bg-white/10 rounded text-xs font-semibold transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* ── Signature Panel (shown when Sign Now clicked) ── */}
      {showSigPad && !state.signature && (
        <div className="no-print max-w-2xl mx-auto mt-4 px-4">
          <SignaturePanel onSave={handleSign} onCancel={() => setShowSigPad(false)} />
        </div>
      )}

      {/* ── THE DOCUMENT ── */}
      <div ref={docRef} className="max-w-[850px] mx-auto my-6 bg-white shadow-2xl print:shadow-none print:my-0 print:max-w-none">
        <div className="px-12 py-10 print:px-8 print:py-6">

          {/* ── HEADER ROW ── */}
          <div className="flex items-start justify-between mb-8">
            {/* Logo + company name */}
            <div>
              <img src={HP_LOGO} alt="Handy Pioneers" className="w-24 h-24 object-contain mb-2" />
              <div className="text-base font-bold text-gray-900">Handy Pioneers</div>
            </div>

            {/* Estimate info table */}
            <table className="text-xs border border-gray-300 border-collapse" style={{ minWidth: 260 }}>
              <tbody>
                {[
                  ['ESTIMATE', jobInfo.jobNumber],
                  ['ESTIMATE DATE', fmtDate(jobInfo.date)],
                  ['SERVICE DATE', fmtDate(jobInfo.servicedDate)],
                  ['EXPIRATION DATE', fmtDate(jobInfo.expiresDate)],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td className="border border-gray-300 px-3 py-1.5 font-semibold text-gray-600 bg-gray-50 whitespace-nowrap">{label}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-900 font-medium">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── CLIENT + CONTACT BLOCK ── */}
          <div className="flex gap-12 mb-8">
            {/* Client info */}
            <div className="flex-1">
              <div className="text-sm font-bold text-gray-900 mb-1">{jobInfo.client || 'Client Name'}</div>
              {jobInfo.companyName && <div className="text-xs text-gray-700 mb-0.5">{jobInfo.companyName}</div>}
              {jobInfo.address && <div className="text-xs text-gray-700">{jobInfo.address}</div>}
              {(jobInfo.city || jobInfo.state || jobInfo.zip) && (
                <div className="text-xs text-gray-700">{[jobInfo.city, jobInfo.state, jobInfo.zip].filter(Boolean).join(', ')}</div>
              )}
              {jobInfo.phone && (
                <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                  <span>📞</span> {jobInfo.phone}
                </div>
              )}
              {jobInfo.email && (
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>✉</span> {jobInfo.email}
                </div>
              )}
            </div>

            {/* HP contact */}
            <div className="flex-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact Us</div>
              {HP_ADDRESS.split('\n').map((line, i) => (
                <div key={i} className="text-xs text-gray-700">{line}</div>
              ))}
              <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                <span>📞</span> {HP_PHONE}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <span>✉</span> {HP_EMAIL}
              </div>
            </div>
          </div>

          {/* ── ESTIMATE LABEL ── */}
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">
            Estimate
          </div>

          {/* ── PHASE SECTIONS ── */}
          {activePhases.length === 0 && activeCustom.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No items entered yet. Go to the Calculator tab to add line items.
            </div>
          ) : (
            <>
              {activePhases.map(phase => {
                const phaseObj = state.phases.find(p => p.id === phase.phaseId);
                const activeItems = phase.items.filter(i => i.hasData);
                const bullets = phaseObj ? buildSowBullets(
                  activeItems.map(i => {
                    const orig = phaseObj.items.find(pi => pi.id === i.id);
                    return orig ? { ...orig, qty: i.qty } : { id: i.id, name: i.name, qty: i.qty, tier: 'good', tiers: { good: { name: i.matName }, better: { name: i.matName }, best: { name: i.matName } }, hasTiers: true, unitType: i.unitType, wastePct: 0 };
                  })
                ) : [];
                const phaseCustom = customByPhase[phase.phaseId] || [];

                return (
                  <div key={phase.phaseId} className="mb-8">
                    {/* Phase header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-bold text-gray-900">{phase.phaseName}</div>
                      {jobInfo.estimator && (
                        <div className="text-xs text-gray-500 text-right">
                          Service completed by: {jobInfo.estimator}
                        </div>
                      )}
                    </div>

                    {/* Line items table — columns driven by visibility state */}
                    <table className="w-full text-xs border-collapse mb-3">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="text-left px-3 py-2 font-semibold text-gray-600 border border-gray-200">Services</th>
                          {cols.qty       && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-12">Qty</th>}
                          {cols.material  && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Material</th>}
                          {cols.labor     && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Labor</th>}
                          {cols.unitPrice && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Unit Price</th>}
                          {cols.amount    && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Amount</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map((item, idx) => {
                          const bullet = bullets[idx];
                          const unitPrice = item.qty > 0 ? item.price / item.qty : 0;
                          // Derive material and labor from item if available
                          const matCost = (item as any).matCost ?? 0;
                          const laborCost = (item as any).laborCost ?? 0;
                          return (
                            <tr key={item.id}>
                              <td className="px-3 py-2 border-b border-gray-100 align-top">
                                <div className="font-semibold text-gray-900 mb-1">{item.name}</div>
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Scope of Work</div>
                                {bullet && (
                                  <div className="mb-1">
                                    <div className="text-xs text-gray-700">— {bullet.title}</div>
                                    {bullet.desc && <div className="text-xs text-gray-500 ml-3">{bullet.desc}</div>}
                                  </div>
                                )}
                              </td>
                              {cols.qty       && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{item.qty}</td>}
                              {cols.material  && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(matCost)}</td>}
                              {cols.labor     && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(laborCost)}</td>}
                              {cols.unitPrice && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(unitPrice)}</td>}
                              {cols.amount    && <td className="px-3 py-2 border-b border-gray-100 text-right align-top font-semibold text-gray-900">{fmtDollarCents(item.price)}</td>}
                            </tr>
                          );
                        })}
                        {/* Custom items for this phase */}
                        {phaseCustom.map(ci => {
                          const unitPrice = ci.qty > 0 ? ci.price / ci.qty : 0;
                          const matCost = (ci as any).matCost ?? 0;
                          const laborCost = (ci as any).laborCost ?? 0;
                          return (
                            <tr key={ci.id}>
                              <td className="px-3 py-2 border-b border-gray-100 align-top">
                                <div className="font-semibold text-gray-900 mb-1">{ci.description}</div>
                                <div className="text-xs text-gray-600">— {ci.qty} {ci.unitType}</div>
                              </td>
                              {cols.qty       && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{ci.qty}</td>}
                              {cols.material  && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(matCost)}</td>}
                              {cols.labor     && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(laborCost)}</td>}
                              {cols.unitPrice && <td className="px-3 py-2 border-b border-gray-100 text-right align-top text-gray-700">{fmtDollarCents(unitPrice)}</td>}
                              {cols.amount    && <td className="px-3 py-2 border-b border-gray-100 text-right align-top font-semibold text-gray-900">{fmtDollarCents(ci.price)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Phase subtotal */}
                    <div className="text-right text-xs text-gray-600 mb-1">
                      Services subtotal: <span className="font-semibold text-gray-900">{fmtDollarCents(phase.price + (phaseCustom.reduce((s, c) => s + c.price, 0)))}</span>
                    </div>
                  </div>
                );
              })}

              {/* Orphan custom items (no matching phase) */}
              {activeCustom.filter(c => !activePhases.find(p => p.phaseId === c.phaseId)).length > 0 && (
                <div className="mb-8">
                  <div className="text-sm font-bold text-gray-900 mb-2">Additional Services</div>
                  <table className="w-full text-xs border-collapse mb-3">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-600 border border-gray-200">Services</th>
                        {cols.qty       && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-12">Qty</th>}
                        {cols.material  && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Material</th>}
                        {cols.labor     && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Labor</th>}
                        {cols.unitPrice && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Unit Price</th>}
                        {cols.amount    && <th className="text-right px-3 py-2 font-semibold text-gray-600 border border-gray-200 w-24">Amount</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {activeCustom.filter(c => !activePhases.find(p => p.phaseId === c.phaseId)).map(ci => {
                        const unitPrice = ci.qty > 0 ? ci.price / ci.qty : 0;
                        const matCost = (ci as any).matCost ?? 0;
                        const laborCost = (ci as any).laborCost ?? 0;
                        return (
                          <tr key={ci.id}>
                            <td className="px-3 py-2 border-b border-gray-100">{ci.description}</td>
                            {cols.qty       && <td className="px-3 py-2 border-b border-gray-100 text-right">{ci.qty}</td>}
                            {cols.material  && <td className="px-3 py-2 border-b border-gray-100 text-right">{fmtDollarCents(matCost)}</td>}
                            {cols.labor     && <td className="px-3 py-2 border-b border-gray-100 text-right">{fmtDollarCents(laborCost)}</td>}
                            {cols.unitPrice && <td className="px-3 py-2 border-b border-gray-100 text-right">{fmtDollarCents(unitPrice)}</td>}
                            {cols.amount    && <td className="px-3 py-2 border-b border-gray-100 text-right font-semibold">{fmtDollarCents(ci.price)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── TOTALS BLOCK ── */}
              <div className="flex justify-end mb-8">
                <div className="w-72">
                  <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">{fmtDollarCents(totals.totalPrice)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
                    <span className="text-gray-600">Tax (WA — client to verify)</span>
                    <span className="text-gray-500 italic text-xs self-center">Not included</span>
                  </div>
                  <div className="flex justify-between py-3 border-b-2 border-gray-900 text-base">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold text-gray-900">{fmtDollarCents(totals.totalPrice)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-semibold text-gray-700">{depositLabel}</span>
                    <span className="font-semibold text-gray-700">{fmtDollarCents(deposit)}</span>
                  </div>
                </div>
              </div>

              {/* ── CLIENT NOTE / COMMITMENT ── */}
              {state.clientNote && (
                <div className="text-sm text-gray-700 mb-6 leading-relaxed border-t border-gray-200 pt-4">
                  {state.clientNote}
                </div>
              )}

              {/* ── SIGNATURE BLOCK ── */}
              <div className="border-t border-gray-200 pt-6 mt-4">
                {state.signature ? (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-1">Client Signature</div>
                    <img src={state.signature} alt="Signature" className="h-16 border-b border-gray-400 mb-1" />
                    <div className="text-xs text-gray-700 font-semibold">{state.signedBy}</div>
                    <div className="text-xs text-gray-500">
                      Signed {state.signedAt ? new Date(state.signedAt).toLocaleString() : ''}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-1">Client Signature</div>
                    <div className="border-b border-gray-400 h-12 mb-1" />
                    <div className="text-xs text-gray-500">Date: _______________</div>
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  By signing above, client agrees to the scope of work and pricing outlined in this estimate.
                  Full terms and conditions available at {HP_WEB}.
                </div>
              </div>
            </>
          )}

          {/* ── FOOTER ── */}
          <div className="mt-10 pt-4 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-400">
            <span>Handy Pioneers | {jobInfo.jobNumber}</span>
            <span>{HP_WEB}</span>
            <span>Reliable Renovations, Trusted Results.</span>
          </div>
        </div>
      </div>

      {/* Bottom padding for scroll */}
      <div className="h-12 no-print" />

      {/* Estimate Approved Modal — fires after signature */}
      <EstimateApprovedModal
        open={showApprovedModal}
        onClose={() => { setShowApprovedModal(false); setPendingSignatureDataUrl(undefined); }}
        estimateId={state.activeOpportunityId ?? ''}
        estimateTitle={state.jobInfo.jobNumber
          ? `Estimate ${state.jobInfo.jobNumber} — ${state.jobInfo.client || 'Project'}`
          : `Estimate — ${state.jobInfo.client || 'Project'}`
        }
        totalPrice={totals.totalPrice}
        depositAmount={deposit}
        depositLabel={depositLabel}
        balanceAmount={Math.max(0, totals.totalPrice - deposit)}
        signedBy={state.signedBy ?? ''}
        signedAt={state.signedAt ?? ''}
        signedEstimateDataUrl={pendingSignatureDataUrl}
        signedEstimateFilename={state.jobInfo.jobNumber
          ? `Estimate-${state.jobInfo.jobNumber}-Signed-${new Date().toISOString().slice(0,10)}.png`
          : `Estimate-Signed-${new Date().toISOString().slice(0,10)}.png`
        }
      />
    </div>
  );
}
