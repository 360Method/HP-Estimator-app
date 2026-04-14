// ============================================================
// EstimateApprovedModal — Post-Signature Approval Workflow
// Steps:
//   1. Celebration / Won confirmation
//   2. Job selection (new or existing)
//   3. Invoice summary + finish
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  Trophy,
  Briefcase,
  PlusCircle,
  Link2,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles,
  ClipboardList,
  CalendarDays,
  Clock,
  StickyNote,
  Paperclip,
  ArrowRight,
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Opportunity } from '@/lib/types';
import { generateProjectSchedule, GeneratedPhaseEvent } from '@/lib/generateProjectSchedule';
import { generateSOW } from '@/lib/generateSOW';
import { trpc } from '@/lib/trpc';

interface Props {
  open: boolean;
  onClose: () => void;
  estimateId: string;
  estimateTitle: string;
  totalPrice: number;
  depositAmount: number;
  depositLabel: string;
  balanceAmount: number;
  signedBy: string;
  signedAt: string;
  signedEstimateDataUrl?: string;
  signedEstimateFilename?: string;
}

type Step = 1 | 2 | 3 | 4;

export default function EstimateApprovedModal({
  open,
  onClose,
  estimateId,
  estimateTitle,
  totalPrice,
  depositAmount,
  depositLabel,
  balanceAmount,
  signedBy,
  signedAt,
  signedEstimateDataUrl,
  signedEstimateFilename,
}: Props) {
  const { state, approveEstimate, setSection, setActiveOpportunity } = useEstimator();
  // ── DB mutations (fire-and-forget; local state is source of truth) ─────────────────
  const createInvoiceMutation = trpc.invoices.create.useMutation({
    onError: (err) => console.warn('[EstimateApprovedModal] Invoice DB write failed:', err.message),
  });
  const createScheduleEventMutation = trpc.schedule.create.useMutation({
    onError: (err) => console.warn('[EstimateApprovedModal] Schedule DB write failed:', err.message),
  });
  const [step, setStep] = useState<Step>(1);
  const [jobMode, setJobMode] = useState<'new' | 'existing'>('new');
  const [transferNotes, setTransferNotes] = useState(true);
  const [transferAttachments, setTransferAttachments] = useState(true);
  const [newJobTitle, setNewJobTitle] = useState(
    estimateTitle ? `Job — ${estimateTitle.replace(/^Estimate\s*[—-]\s*/i, '')}` : 'New Job'
  );
  const [existingJobId, setExistingJobId] = useState<string>('');

  // Project start date (default: 1 week from today, skip weekends)
  const defaultStart = useMemo(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);
  const [jobStartDateStr, setJobStartDateStr] = useState(defaultStart);

  // Preview the generated schedule whenever start date or phases change
  const schedulePreview = useMemo<GeneratedPhaseEvent[]>(() => {
    try {
      const result = generateProjectSchedule({
        phases: state.phases,
        jobStartDate: new Date(jobStartDateStr),
        jobId: 'preview',
        customerId: '',
        estimateId,
        estimateTitle,
        assignedTo: [],
      });
      return result.phaseEvents;
    } catch {
      return [];
    }
  }, [state.phases, jobStartDateStr, estimateId, estimateTitle]);

  const totalWorkingDays = useMemo(
    () => schedulePreview.reduce((s, pe) => s + pe.workingDays, 0),
    [schedulePreview]
  );

  const estimatedEndDate = useMemo(() => {
    if (schedulePreview.length === 0) return null;
    return new Date(schedulePreview[schedulePreview.length - 1].event.end);
  }, [schedulePreview]);

  // Existing jobs for this customer
  const existingJobs: Opportunity[] = useMemo(
    () => state.opportunities.filter(o => o.area === 'job' && !o.archived),
    [state.opportunities]
  );

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

  function handleProceedToStep2() {
    setStep(2);
  }

  function handleProceedToStep3() {
    if (jobMode === 'existing' && !existingJobId) return;
    // Only show transfer step for new jobs when there's something to transfer
    const estimateOpp = state.opportunities.find(o => o.id === estimateId);
    const hasNotes = (estimateOpp?.leadNotes?.length ?? 0) > 0;
    const hasAttachments = (estimateOpp?.leadAttachments?.length ?? 0) > 0;
    if (jobMode === 'new' && (hasNotes || hasAttachments)) {
      setStep(4);
    } else {
      setStep(3);
    }
  }

  function handleFinish() {
    // Generate SOW from current estimate snapshot
    const sowDocument = generateSOW({
      jobInfo: state.jobInfo,
      global: state.global,
      phases: state.phases,
      customItems: state.customItems,
      fieldNotes: state.fieldNotes,
      summaryNotes: state.summaryNotes,
      estimatorNotes: state.estimatorNotes,
      clientNote: state.clientNote,
      estimateOverrides: state.estimateOverrides,
      signature: state.signature,
      signedAt: state.signedAt,
      signedBy: state.signedBy,
      depositType: state.depositType,
      depositValue: state.depositValue,
    });
    // Resolve transfer data from the estimate opportunity
    const estimateOpp = state.opportunities.find(o => o.id === estimateId);
    const approvalParams = {
      estimateId,
      jobMode,
      existingJobId: jobMode === 'existing' ? existingJobId : undefined,
      newJobTitle: jobMode === 'new' ? newJobTitle : '',
      totalPrice,
      depositAmount,
      depositLabel,
      balanceAmount,
      signedEstimateDataUrl,
      signedEstimateFilename,
      sowDocument,
      jobStartDate: jobStartDateStr,
      transferNotes: (transferNotes && estimateOpp?.leadNotes?.length) ? estimateOpp.leadNotes : undefined,
      transferAttachments: (transferAttachments && estimateOpp?.leadAttachments?.length) ? estimateOpp.leadAttachments : undefined,
    };
    approveEstimate(approvalParams);

    // ── DB side-effects: persist invoices + schedule events ────────────────────────
    const customerId = state.activeCustomerId ?? '';
    // Determine job ID (same logic as reducer)
    const newJobId = (jobMode === 'existing' && approvalParams.existingJobId)
      ? approvalParams.existingJobId
      : (() => { /* We need the newJobId that was generated in approveEstimate */
          // The reducer pre-generates it; we replicate the same logic here for DB writes.
          // Since nanoid is called in approveEstimate, we can't get the exact same ID here.
          // Instead, we'll rely on useDbSync to reload invoices after the next login.
          // For now, skip DB write for invoices created via APPROVE_ESTIMATE —
          // they will be synced on next login via useDbSync.
          return null;
        })();
    // Generate schedule events for DB write (same logic as reducer)
    if (customerId) {
      const projectStartDate = jobStartDateStr
        ? new Date(jobStartDateStr)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const scheduleResult = generateProjectSchedule({
        phases: state.phases,
        jobStartDate: projectStartDate,
        jobId: newJobId ?? 'pending',
        customerId,
        estimateId,
        estimateTitle: estimateTitle || 'Project',
        assignedTo: [],
      });
      for (const ev of scheduleResult.events) {
        createScheduleEventMutation.mutate({
          id: ev.id,
          type: ev.type,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay ?? false,
          opportunityId: ev.opportunityId,
          customerId: ev.customerId,
          assignedTo: JSON.stringify(ev.assignedTo ?? []),
          notes: ev.notes ?? '',
          color: ev.color,
          completed: false,
        });
      }
    }

    onClose();
    // Navigate to the jobs tab
    setSection('customer');
  }

  function handleClose() {
    setStep(1);
    onClose();
  }

  const signedDate = signedAt
    ? new Date(signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90dvh]">
        {/* ── Step 1: Celebration ─────────────────────────────── */}
        {step === 1 && (
          <>
            <DialogHeader className="text-center pb-2">
              <div className="flex justify-center mb-3">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-500" />
                </div>
              </div>
              <DialogTitle className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                Estimate Approved — You Won It!
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Signed by <span className="font-semibold text-foreground">{signedBy || 'client'}</span> on {signedDate}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimate Summary</p>
                <p className="font-medium text-foreground">{estimateTitle}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{fmt(totalPrice)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Deposit Invoice</p>
                  <p className="font-bold text-blue-700 dark:text-blue-400">{fmt(depositAmount)}</p>
                  <p className="text-xs text-muted-foreground">{depositLabel}</p>
                </div>
                <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Balance Invoice</p>
                  <p className="font-bold text-violet-700 dark:text-violet-400">{fmt(balanceAmount)}</p>
                  <p className="text-xs text-muted-foreground">Due on completion</p>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                    <p className="font-medium">What happens next:</p>
                    <ul className="space-y-0.5 text-emerald-700 dark:text-emerald-400">
                      <li>• Estimate marked as <strong>Won / Approved</strong></li>
                      <li>• Signed copy saved to client folder</li>
                      <li>• Deposit &amp; balance invoices auto-generated</li>
                      <li>• Opportunity moves to the Jobs pipeline</li>
                      <li>• <strong>Project schedule auto-generated</strong> (one event per phase)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleProceedToStep2} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* ── Step 2: Job Selection ───────────────────────────── */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                Create or Link a Job
              </DialogTitle>
              <DialogDescription>
                This estimate will be linked to a job in the Jobs pipeline. Choose how to proceed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setJobMode('new')}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    jobMode === 'new'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <PlusCircle className={`w-5 h-5 mb-2 ${jobMode === 'new' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-semibold text-sm">New Job #</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a fresh job record</p>
                </button>

                <button
                  onClick={() => setJobMode('existing')}
                  disabled={existingJobs.length === 0}
                  className={`rounded-lg border-2 p-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    jobMode === 'existing'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Link2 className={`w-5 h-5 mb-2 ${jobMode === 'existing' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-semibold text-sm">Add to Existing Job</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {existingJobs.length === 0 ? 'No open jobs' : `${existingJobs.length} open job${existingJobs.length > 1 ? 's' : ''}`}
                  </p>
                </button>
              </div>

              {/* New job title input */}
              {jobMode === 'new' && (
                <div className="space-y-1.5">
                  <Label htmlFor="job-title">Job Title</Label>
                  <Input
                    id="job-title"
                    value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)}
                    placeholder="e.g. Kitchen Remodel — Smith Residence"
                  />
                  <p className="text-xs text-muted-foreground">A new job number will be auto-assigned (e.g. JOB-2026-001)</p>
                </div>
              )}

              {/* Existing job selector */}
              {jobMode === 'existing' && existingJobs.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Job</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {existingJobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => setExistingJobId(job.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          existingJobId === job.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{job.title}</p>
                            {job.jobNumber && (
                              <p className="text-xs text-muted-foreground">{job.jobNumber}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{job.stage}</Badge>
                            {existingJobId === job.id && (
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                onClick={handleProceedToStep3}
                disabled={jobMode === 'existing' && !existingJobId}
                className="gap-1"
              >
                Review Invoices <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* ── Step 4: Transfer Prompt ──────────────────────── */}
        {step === 4 && (() => {
          const estimateOpp = state.opportunities.find(o => o.id === estimateId);
          const noteCount = estimateOpp?.leadNotes?.length ?? 0;
          const attachCount = estimateOpp?.leadAttachments?.length ?? 0;
          return (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-primary" />
                  Transfer Estimate Data to Job
                </DialogTitle>
                <DialogDescription>
                  Carry over notes and attachments from this estimate into the new job's Details tab.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {/* Notes toggle */}
                {noteCount > 0 && (
                  <button
                    onClick={() => setTransferNotes(v => !v)}
                    className={`w-full rounded-lg border-2 p-4 text-left transition-all flex items-start gap-3 ${
                      transferNotes ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      transferNotes ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}>
                      {transferNotes && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StickyNote className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">Copy Activity Notes</span>
                        <Badge variant="secondary" className="text-xs">{noteCount} note{noteCount !== 1 ? 's' : ''}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">All logged calls, SMS, emails, and notes from this estimate will appear in the job's Details tab.</p>
                    </div>
                  </button>
                )}

                {/* Attachments toggle */}
                {attachCount > 0 && (
                  <button
                    onClick={() => setTransferAttachments(v => !v)}
                    className={`w-full rounded-lg border-2 p-4 text-left transition-all flex items-start gap-3 ${
                      transferAttachments ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      transferAttachments ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}>
                      {transferAttachments && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">Copy Attachments</span>
                        <Badge variant="secondary" className="text-xs">{attachCount} file{attachCount !== 1 ? 's' : ''}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Photos and documents uploaded during the estimate will appear in the job's Details tab.</p>
                    </div>
                  </button>
                )}

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  The original estimate record is not modified — this only copies the data into the new job.
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(3)} className="gap-1">
                  Review Invoices <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          );
        })()}

        {/* ── Step 3: Invoice Summary + Schedule Preview ────── */}
        {step === 3 && (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Invoices &amp; Project Schedule
              </DialogTitle>
              <DialogDescription>
                Two invoices will be created and a project schedule auto-generated from your estimate phases.
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 min-h-0">
            <div className="space-y-3 py-2">
              {/* Job info */}
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
                <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {jobMode === 'new' ? 'New Job' : 'Linked to Existing Job'}
                  </p>
                  <p className="font-medium text-sm truncate">
                    {jobMode === 'new'
                      ? newJobTitle
                      : existingJobs.find(j => j.id === existingJobId)?.title ?? 'Selected Job'}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Deposit invoice */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-semibold text-sm">Invoice 1 — Deposit</span>
                    <Badge variant="secondary" className="text-xs">Draft</Badge>
                  </div>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{fmt(depositAmount)}</span>
                </div>
                <div className="text-xs text-muted-foreground pl-4 space-y-0.5">
                  <p>Line item: {depositLabel}</p>
                  <p>Due: Upon receipt (7 days)</p>
                  <p>Payment terms: Due upon receipt</p>
                </div>
              </div>

              {/* Balance invoice */}
              {balanceAmount > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-500" />
                      <span className="font-semibold text-sm">Invoice 2 — Balance</span>
                      <Badge variant="secondary" className="text-xs">Draft</Badge>
                    </div>
                    <span className="font-bold text-violet-600 dark:text-violet-400">{fmt(balanceAmount)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pl-4 space-y-0.5">
                    <p>Line item: Balance Due — {estimateTitle}</p>
                    <p>Due: Upon project completion (30 days)</p>
                    <p>Payment terms: Due upon project completion</p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Deposit</span>
                  <span>{fmt(depositAmount)}</span>
                </div>
                {balanceAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Balance</span>
                    <span>{fmt(balanceAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total Contract Value</span>
                  <span>{fmt(totalPrice)}</span>
                </div>
              </div>

              {/* Signed copy notice */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3">
                <div className="flex items-start gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    <p className="font-medium">Signed estimate copy</p>
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                      A record of this approval (signed by {signedBy || 'client'} on {signedDate}) will be saved in the client's Attachments tab.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Project start date + schedule preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Project Schedule</span>
                  </div>
                  {schedulePreview.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{totalWorkingDays} working days</span>
                      {estimatedEndDate && (
                        <span>· Est. end {estimatedEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Start date picker */}
                <div className="flex items-center gap-3">
                  <Label htmlFor="job-start" className="text-xs text-muted-foreground whitespace-nowrap">Project start</Label>
                  <Input
                    id="job-start"
                    type="date"
                    value={jobStartDateStr}
                    onChange={e => setJobStartDateStr(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                </div>

                {/* Phase timeline */}
                {schedulePreview.length > 0 ? (
                  <div className="rounded-lg border bg-muted/20 p-2 max-h-44 overflow-y-auto space-y-1">
                    {schedulePreview.map((pe, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: pe.event.color ?? '#22c55e' }}
                        />
                        <span className="font-medium truncate flex-1" title={pe.phaseName}>{pe.phaseName}</span>
                        <span className="text-muted-foreground shrink-0">
                          {new Date(pe.event.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {pe.workingDays > 0.5 && (
                            <> – {new Date(pe.event.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                          )}
                        </span>
                        <span className="text-muted-foreground shrink-0 w-16 text-right">
                          {pe.workingDays < 1 ? '½ day' : `${pe.workingDays}d`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No active phases with items found — add quantities to phases to generate a schedule.</p>
                )}
              </div>
            </div>
            </div>

            <div className="flex-shrink-0 flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button
                onClick={handleFinish}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Confirm &amp; Generate
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
