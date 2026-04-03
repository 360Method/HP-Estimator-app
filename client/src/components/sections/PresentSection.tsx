// ============================================================
// HP Field Estimator v3 — Present Section
// Full-screen client presentation mode with e-signature capture
// ============================================================

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcCustomItem, calcTotals, fmtDollar } from '@/lib/calc';
import { ALL_PHASES } from '@/lib/phases';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, PenLine,
  RotateCcw, Check, Mail, Printer,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── SOW bullet generator (same logic as EstimateSection) ─────
function buildSowBullets(phase: { description: string; items: { id: string; name: string; shortName: string; qty: number; tier: string; tiers: Record<string, { name: string }>; hasTiers: boolean; unitType: string; wastePct: number; salesDesc?: string; hasPaintPrep?: boolean; paintPrep?: string; flagged?: boolean; flagNote?: string }[] }, activeItems: typeof phase.items): string[] {
  const bullets: string[] = [];
  for (const item of activeItems) {
    const tierData = item.hasTiers ? item.tiers[item.tier] : null;
    const tierName = tierData?.name ?? '';
    const qty = item.qty;
    const u = item.unitType;
    const map: Record<string, string> = {
      lf: `${qty} linear ft`, sqft: `${qty} sq ft`, unit: `${qty} unit${qty !== 1 ? 's' : ''}`,
      hr: `${qty} hr${qty !== 1 ? 's' : ''}`, opening: `${qty} opening${qty !== 1 ? 's' : ''}`,
      load: `${qty} load${qty !== 1 ? 's' : ''}`, patch: `${qty} patch${qty !== 1 ? 'es' : ''}`,
      step: `${qty} step${qty !== 1 ? 's' : ''}`, closet: `${qty} closet${qty !== 1 ? 's' : ''}`,
      fixture: `${qty} fixture${qty !== 1 ? 's' : ''}`, circuit: `${qty} circuit${qty !== 1 ? 's' : ''}`,
      can: `${qty} can${qty !== 1 ? 's' : ''}`, door: `${qty} door${qty !== 1 ? 's' : ''}`,
      box: `${qty} box${qty !== 1 ? 'es' : ''}`, window: `${qty} window${qty !== 1 ? 's' : ''}`,
      fan: `${qty} fan${qty !== 1 ? 's' : ''}`, device: `${qty} device${qty !== 1 ? 's' : ''}`,
    };
    const qtyLabel = map[u] ?? `${qty} ${u}`;
    let bullet = item.hasTiers && tierName
      ? `Supply and install ${qtyLabel} of ${tierName}${item.wastePct > 0 ? ` (includes ${item.wastePct}% waste)` : ''}`
      : `${item.name} — ${qtyLabel}`;
    if (item.hasPaintPrep && item.paintPrep !== 'none') {
      bullet += item.paintPrep === 'caulk' ? '. Includes caulk and touch-up.' : '. Includes full paint prep.';
    }
    bullets.push(bullet);
  }
  if (bullets.length > 6) {
    const shown = bullets.slice(0, 5);
    shown.push(`Plus ${bullets.length - 5} additional items`);
    return shown;
  }
  return bullets;
}

// ─── Signature Canvas ─────────────────────────────────────────
function SignatureCanvas({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    setHasStrokes(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSave = () => {
    if (!hasStrokes) { toast.error('Please sign before accepting'); return; }
    if (!signerName.trim()) { toast.error('Please enter your name'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-bold text-foreground">Client Signature</div>
            <div className="text-xs text-muted-foreground">Sign to accept the estimate</div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="mb-4">
            <label className="field-label">Full Name</label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Client's full name"
              className="field-input w-full"
            />
          </div>

          <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signature</div>
          <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-slate-50 relative">
            <canvas
              ref={canvasRef}
              width={500}
              height={160}
              className="w-full touch-none cursor-crosshair"
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
                <div className="flex items-center gap-2 text-muted-foreground/50 text-sm">
                  <PenLine size={16} />
                  Sign here
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={clearCanvas}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw size={12} />
              Clear
            </button>
            <div className="text-xs text-muted-foreground">Draw your signature above</div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
          >
            <Check size={14} />
            Accept & Sign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Slide types ──────────────────────────────────────────────
type Slide =
  | { type: 'cover' }
  | { type: 'phase'; phaseIndex: number }
  | { type: 'total' }
  | { type: 'terms' }
  | { type: 'sign' };

// ─── MAIN PRESENT SECTION ─────────────────────────────────────
export default function PresentSection() {
  const { state, setSection, setSignature, clearSignature } = useEstimator();
  const [slideIndex, setSlideIndex] = useState(0);
  const [showSignModal, setShowSignModal] = useState(false);

  const phaseResults = useMemo(() =>
    state.phases.map(p => calcPhase(p, state.global)),
    [state.phases, state.global]
  );
  const customResults = useMemo(() =>
    state.customItems.map(ci => calcCustomItem(ci, state.global)),
    [state.customItems, state.global]
  );
  const totals = useMemo(() =>
    calcTotals(phaseResults, customResults),
    [phaseResults, customResults]
  );

  const activePhaseData = useMemo(() => {
    return state.phases
      .map((phase, idx) => {
        const activeItems = phase.items.filter(i => i.enabled && i.qty > 0);
        if (activeItems.length === 0) return null;
        const result = phaseResults[idx];
        const bullets = buildSowBullets(phase, activeItems);
        const phaseCustom = customResults.filter(c => c.phaseId === phase.id && c.hasData);
        const phasePrice = result.price + phaseCustom.reduce((s, c) => s + c.price, 0);
        return { phase, result, activeItems, bullets, phaseCustom, phasePrice };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [state.phases, phaseResults, customResults]);

  // Build slide deck
  const slides: Slide[] = useMemo(() => {
    const s: Slide[] = [{ type: 'cover' }];
    activePhaseData.forEach((_, i) => s.push({ type: 'phase', phaseIndex: i }));
    s.push({ type: 'total' });
    s.push({ type: 'terms' });
    s.push({ type: 'sign' });
    return s;
  }, [activePhaseData]);

  const currentSlide = slides[slideIndex];
  const canPrev = slideIndex > 0;
  const canNext = slideIndex < slides.length - 1;

  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  const prev = useCallback(() => setSlideIndex(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setSlideIndex(i => Math.min(slidesRef.current.length - 1, i + 1)), []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
      if (e.key === 'Escape') setSection('estimate');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, setSection]);

  const handleSign = (dataUrl: string) => {
    // Get signer name from the canvas modal — we pass it back via a ref trick
    // For now we'll use the client name from jobInfo as fallback
    const name = state.jobInfo.client || 'Client';
    setSignature(dataUrl, name);
    setShowSignModal(false);
    toast.success('Estimate accepted and signed!');
    // Advance to next slide if on sign slide
    if (currentSlide.type === 'sign') {
      setTimeout(() => setSection('estimate'), 1500);
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Handy Pioneers — Project Estimate`);
    const to = state.jobInfo.email ? encodeURIComponent(state.jobInfo.email) : '';
    window.open(`mailto:${to}?subject=${subject}`, '_blank');
  };

  // ── Slide renderers ──────────────────────────────────────────

  const renderCover = () => (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-6 shadow-xl">
        <span className="text-white font-black text-3xl leading-none">HP</span>
      </div>
      <div className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">Handy Pioneers</div>
      <div className="text-slate-300 text-lg mb-8">Project Estimate</div>
      {state.jobInfo.client && (
        <div className="bg-white/10 rounded-2xl px-6 py-4 backdrop-blur-sm">
          <div className="text-slate-300 text-sm mb-1">Prepared for</div>
          <div className="text-white text-2xl font-bold">{state.jobInfo.client}</div>
          {state.jobInfo.address && <div className="text-slate-300 text-sm mt-1">{state.jobInfo.address}{state.jobInfo.city ? `, ${state.jobInfo.city}` : ''}</div>}
        </div>
      )}
      <div className="mt-8 text-slate-400 text-sm">
        {activePhaseData.length} trade{activePhaseData.length !== 1 ? 's' : ''} · Total investment: <span className="text-white font-bold">{fmtDollar(totals.totalPrice)}</span>
      </div>
    </div>
  );

  const renderPhase = (phaseIndex: number) => {
    const data = activePhaseData[phaseIndex];
    if (!data) return null;
    const { phase, bullets, phaseCustom, phasePrice } = data;
    return (
      <div className="flex flex-col h-full px-8 py-6 overflow-y-auto">
        {/* Phase header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-2xl shrink-0">
              {phase.icon}
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-white">{phase.name}</div>
              <div className="text-slate-300 text-sm mt-0.5">{phase.description}</div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Investment</div>
            <div className="text-2xl sm:text-3xl font-black text-white mono">{fmtDollar(phasePrice)}</div>
          </div>
        </div>

        {/* SOW bullets */}
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Scope of Work</div>
          <ul className="space-y-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-white">
                <span className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-base leading-relaxed">{b}</span>
              </li>
            ))}
            {phaseCustom.map(c => (
              <li key={c.id} className="flex gap-3 text-white">
                <span className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0 mt-0.5">+</span>
                <span className="text-base leading-relaxed">{c.description}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Phase progress */}
        <div className="mt-6 text-xs text-slate-500 text-center">
          Trade {phaseIndex + 1} of {activePhaseData.length}
        </div>
      </div>
    );
  };

  const renderTotal = () => (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="text-slate-300 text-lg mb-4 uppercase tracking-widest font-bold">Total Investment</div>
      <div className="text-6xl sm:text-7xl font-black text-white mono mb-6">{fmtDollar(totals.totalPrice)}</div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
        <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
          <div className="text-slate-400 text-xs mb-1">Materials</div>
          <div className="text-white font-bold text-lg mono">{fmtDollar(totals.totalMatPrice)}</div>
        </div>
        <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
          <div className="text-slate-400 text-xs mb-1">Labor</div>
          <div className="text-white font-bold text-lg mono">{fmtDollar(totals.totalLaborPrice)}</div>
        </div>
      </div>
      <div className="space-y-2 text-sm text-slate-300">
        {activePhaseData.map(({ phase, phasePrice }) => (
          <div key={phase.id} className="flex items-center justify-between gap-8">
            <span>{phase.icon} {phase.name}</span>
            <span className="font-mono font-semibold text-white">{fmtDollar(phasePrice)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTerms = () => (
    <div className="flex flex-col justify-center h-full px-8 py-6">
      <div className="text-2xl sm:text-3xl font-black text-white mb-6">Terms &amp; Conditions</div>
      <ul className="space-y-4">
        {[
          '50% deposit required to schedule work; balance due upon project completion.',
          'This estimate is valid for 30 days from the date above.',
          'All work is guaranteed — 1-year workmanship warranty on labor.',
          'Any changes to scope will be documented in a written change order before work proceeds.',
          'Handy Pioneers is fully licensed and insured in the state of Washington.',
        ].map((term, i) => (
          <li key={i} className="flex gap-4 text-slate-200">
            <span className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
            <span className="text-base leading-relaxed">{term}</span>
          </li>
        ))}
      </ul>
      {state.clientNote && (
        <div className="mt-6 bg-white/10 rounded-xl p-4">
          <div className="text-slate-400 text-xs mb-2 uppercase tracking-wider font-bold">Note</div>
          <div className="text-white text-sm leading-relaxed">{state.clientNote}</div>
        </div>
      )}
    </div>
  );

  const renderSign = () => (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      {state.signature ? (
        <>
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white mb-2">Accepted!</div>
          <div className="text-slate-300 mb-6">Signed by {state.signedBy}</div>
          <div className="bg-white rounded-xl p-3 mb-6 inline-block">
            <img src={state.signature} alt="Signature" className="max-h-20 object-contain" />
          </div>
          <div className="text-slate-400 text-sm mb-6">{state.signedAt ? new Date(state.signedAt).toLocaleString() : ''}</div>
          <div className="flex gap-3">
            <button
              onClick={handleEmail}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              <Mail size={14} />
              Send Copy
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={() => setSection('estimate')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle2 size={14} />
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
            <PenLine size={28} className="text-white" />
          </div>
          <div className="text-3xl font-black text-white mb-2">Ready to Accept?</div>
          <div className="text-slate-300 text-lg mb-2 mono">{fmtDollar(totals.totalPrice)}</div>
          <div className="text-slate-400 text-sm mb-8">Sign below to accept this estimate and authorize Handy Pioneers to proceed.</div>
          <button
            onClick={() => setShowSignModal(true)}
            className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-emerald-600 text-white text-lg font-bold hover:bg-emerald-700 transition-colors shadow-xl"
          >
            <PenLine size={20} />
            Sign &amp; Accept Estimate
          </button>
          {state.signature === null && (
            <button
              onClick={clearSignature}
              className="mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear previous signature
            </button>
          )}
        </>
      )}
    </div>
  );

  const renderSlide = () => {
    switch (currentSlide.type) {
      case 'cover': return renderCover();
      case 'phase': return renderPhase(currentSlide.phaseIndex);
      case 'total': return renderTotal();
      case 'terms': return renderTerms();
      case 'sign': return renderSign();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-40 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-black text-xs">HP</span>
          </div>
          <div className="text-white font-semibold text-sm hidden sm:block">
            {state.jobInfo.client ? `Estimate for ${state.jobInfo.client}` : 'Project Estimate'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-slate-400 text-xs">{slideIndex + 1} / {slides.length}</div>
          <button
            onClick={() => setSection('estimate')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
          >
            <X size={12} />
            Exit
          </button>
        </div>
      </div>

      {/* Slide content */}
      <div className="flex-1 overflow-hidden relative">
        {renderSlide()}
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 shrink-0">
        {/* Slide dots */}
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className={`rounded-full transition-all ${i === slideIndex ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={!canPrev}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          {canNext ? (
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={() => currentSlide.type === 'sign' && !state.signature ? setShowSignModal(true) : setSection('estimate')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
            >
              {currentSlide.type === 'sign' && !state.signature ? (
                <><PenLine size={14} /> Sign</>
              ) : (
                <><CheckCircle2 size={14} /> Done</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Signature modal */}
      {showSignModal && (
        <SignatureCanvas
          onSave={handleSign}
          onCancel={() => setShowSignModal(false)}
        />
      )}
    </div>
  );
}
