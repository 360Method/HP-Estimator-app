// ============================================================
// EstimateApprovedModal — Post-Signature Approval Workflow
// Steps:
//   1. Celebration / Won confirmation
//   2. Job selection (new or existing)
//   3. Invoice summary + finish
// ============================================================

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { Opportunity } from '@/lib/types';

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

type Step = 1 | 2 | 3;

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
  const [step, setStep] = useState<Step>(1);
  const [jobMode, setJobMode] = useState<'new' | 'existing'>('new');
  const [newJobTitle, setNewJobTitle] = useState(
    estimateTitle ? `Job — ${estimateTitle.replace(/^Estimate\s*[—-]\s*/i, '')}` : 'New Job'
  );
  const [existingJobId, setExistingJobId] = useState<string>('');

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
    setStep(3);
  }

  function handleFinish() {
    approveEstimate({
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
    });
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
      <DialogContent className="max-w-lg">
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

        {/* ── Step 3: Invoice Summary ─────────────────────────── */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Invoices Ready to Generate
              </DialogTitle>
              <DialogDescription>
                Two invoices will be created and saved to the client's invoice folder.
              </DialogDescription>
            </DialogHeader>

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
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button
                onClick={handleFinish}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Confirm &amp; Generate Invoices
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
