// ============================================================
// ConversionModal — Lead→Estimate and Estimate→Job conversion dialogs
// Pre-fills title, shows contact/address preview, confirm button
// Lead→Estimate includes a transfer step for notes and attachments
// ============================================================

import { useState } from 'react';
import {
  X, ArrowRight, User, MapPin, Phone, Mail, FileText, Briefcase,
  StickyNote, Paperclip, Check,
} from 'lucide-react';
import { Opportunity, LeadNote, JobAttachment } from '@/lib/types';

function ContactPreview({ opp }: { opp: Opportunity }) {
  const snap = opp.clientSnapshot;
  if (!snap) return null;
  const hasAny = snap.client || snap.phone || snap.email || snap.address;
  if (!hasAny) return null;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Customer Info</div>
      {snap.client && (
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <User size={13} className="text-slate-400 shrink-0" />
          <span className="font-medium">{snap.client}</span>
        </div>
      )}
      {snap.phone && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Phone size={13} className="text-slate-400 shrink-0" />
          <span>{snap.phone}</span>
        </div>
      )}
      {snap.email && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Mail size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">{snap.email}</span>
        </div>
      )}
      {snap.address && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">{[snap.address, snap.city, snap.state, snap.zip].filter(Boolean).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

// ── Lead → Estimate ──────────────────────────────────────────
export function ConvertToEstimateModal({
  lead,
  onConfirm,
  onClose,
}: {
  lead: Opportunity;
  onConfirm: (title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'details' | 'transfer'>('details');
  const [title, setTitle] = useState(lead.title);
  const [value, setValue] = useState(String(lead.value > 0 ? lead.value : ''));
  const [transferNotes, setTransferNotes] = useState(true);
  const [transferAttachments, setTransferAttachments] = useState(true);

  const hasNotes = (lead.leadNotes ?? []).length > 0;
  const hasAttachments = (lead.leadAttachments ?? []).length > 0;
  const hasAnythingToTransfer = hasNotes || hasAttachments;

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (hasAnythingToTransfer) {
      setStep('transfer');
    } else {
      onConfirm(title.trim(), Number(value) || 0);
    }
  };

  const handleTransferConfirm = () => {
    onConfirm(
      title.trim(),
      Number(value) || 0,
      transferNotes && hasNotes ? lead.leadNotes : undefined,
      transferAttachments && hasAttachments ? lead.leadAttachments : undefined,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <FileText size={14} className="text-blue-500" />
              <span>Lead</span>
            </div>
            <ArrowRight size={14} className="text-slate-400" />
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Briefcase size={14} className="text-emerald-600" />
              <span>Estimate</span>
            </div>
            {step === 'transfer' && (
              <>
                <ArrowRight size={14} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">Transfer Data</span>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Step 1: Details */}
        <form onSubmit={handleDetailsSubmit} className={`p-5 space-y-4 ${step === 'transfer' ? 'hidden' : ''}`}>
          {/* Source lead info */}
          <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Converting lead: <span className="font-semibold text-blue-700">"{lead.title}"</span>
            {lead.notes && (
              <div className="mt-1 text-slate-500 line-clamp-2">{lead.notes}</div>
            )}
          </div>

          {/* Contact preview */}
          <ContactPreview opp={lead} />

          {/* Estimate title */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Estimate Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kitchen Remodel — Estimate"
              autoFocus
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
            />
          </div>

          {/* Estimated value */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Estimated Value ($)
            </label>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">Can be updated once the estimate is built</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight size={14} />
              {hasAnythingToTransfer ? 'Next: Transfer Data' : 'Create Estimate'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Step 2: Transfer */}
        {step === 'transfer' && (
          <div className="p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Transfer lead data to the new estimate?
              </p>
              <p className="text-xs text-slate-500">
                Original lead data stays on the lead record. Transferred items will also appear in the estimate's Details tab.
              </p>
            </div>

            <div className="space-y-3">
              {hasNotes && (
                <button
                  type="button"
                  onClick={() => setTransferNotes(p => !p)}
                  className="w-full flex items-start gap-3 text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    transferNotes ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
                  }`}>
                    {transferNotes && <Check size={11} className="text-white" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <StickyNote size={13} className="text-slate-400" />
                      Copy lead notes ({(lead.leadNotes ?? []).length})
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Activity log, calls, texts, and visit notes</p>
                  </div>
                </button>
              )}
              {hasAttachments && (
                <button
                  type="button"
                  onClick={() => setTransferAttachments(p => !p)}
                  className="w-full flex items-start gap-3 text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    transferAttachments ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
                  }`}>
                    {transferAttachments && <Check size={11} className="text-white" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <Paperclip size={13} className="text-slate-400" />
                      Copy lead attachments ({(lead.leadAttachments ?? []).length})
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Photos, documents, and files from the lead</p>
                  </div>
                </button>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleTransferConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <ArrowRight size={14} />
                Create Estimate
              </button>
              <button
                type="button"
                onClick={() => onConfirm(title.trim(), Number(value) || 0)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Skip
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep('details')}
              className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Estimate → Job ───────────────────────────────────────────
export function ConvertToJobModal({
  estimate,
  onConfirm,
  onClose,
}: {
  estimate: Opportunity;
  onConfirm: (title: string, value: number) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(estimate.title);
  const [value, setValue] = useState(String(estimate.value > 0 ? estimate.value : ''));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onConfirm(title.trim(), Number(value) || 0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Briefcase size={14} className="text-emerald-600" />
              <span>Estimate</span>
            </div>
            <ArrowRight size={14} className="text-slate-400" />
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Briefcase size={14} className="text-primary" />
              <span>Job</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Source estimate info */}
          <div className="text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            Won estimate: <span className="font-semibold text-emerald-700">"{estimate.title}"</span>
            {estimate.value > 0 && (
              <span className="ml-1 text-emerald-600 font-semibold">
                · ${estimate.value.toLocaleString()}
              </span>
            )}
          </div>

          {/* Contact preview */}
          <ContactPreview opp={estimate} />

          {/* Job title */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Job Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kitchen Remodel — Job"
              autoFocus
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Job value */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Contract Value ($)
            </label>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-[11px] text-slate-400 mt-1">Pre-filled from the approved estimate</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight size={14} />
              Create Job
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
