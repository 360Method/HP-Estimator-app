/**
 * PendingReview — pinned at the top of the customer profile when this
 * customer has anything awaiting Marcin's tap. Replaces the old
 * "draft hidden in /admin/agents/drafts" workflow: the operator now sees
 * the draft in the customer's context, with inline edit + approve in place.
 *
 * Two sources surface here:
 *   1. agentDrafts (status=ready) — Lead Nurturer SMS/email cadence drafts.
 *   2. projectEstimates (status=needs_review|needs_info) — Book Consultation
 *      AI estimator output. Customer-facing presentation leads with scope
 *      (stewardship voice) and surfaces the range as a qualifying signal,
 *      not as a headline.
 *
 * The section anchors a `data-focus="pending-review"` element so notification
 * deep-links can scroll the operator straight to it.
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Edit3,
  FileText,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface PendingReviewProps {
  customerId: string;
  customerFirstName?: string | null;
  /**
   * Optional — when set to a token (eg "pending-review"), the section will
   * scroll itself into view on mount. Used by the bell deep-links.
   */
  focusToken?: string | null;
}

export default function PendingReview({
  customerId,
  customerFirstName,
  focusToken,
}: PendingReviewProps) {
  const utils = trpc.useUtils();

  const draftsQ = trpc.agentDrafts.listForCustomer.useQuery(
    { customerId },
    { staleTime: 15_000 },
  );
  const estimatesQ = trpc.projectEstimator.listPendingForCustomer.useQuery(
    { customerId },
    { staleTime: 15_000 },
  );

  // Auto-scroll into view when bell deep-links here.
  const sectionRef = useScrollIntoView(focusToken === "pending-review");

  const drafts = draftsQ.data ?? [];
  const estimates = estimatesQ.data ?? [];

  const ready = useMemo(() => drafts.filter((d) => d.status === "ready"), [drafts]);
  const totalPending = ready.length + estimates.length;

  // Hide the section entirely when there's nothing for the operator to do —
  // the customer profile shouldn't be cluttered with empty states.
  if (totalPending === 0 && !draftsQ.isLoading && !estimatesQ.isLoading) {
    return null;
  }

  return (
    <div
      ref={sectionRef}
      data-focus="pending-review"
      className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm overflow-hidden mb-6"
    >
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-amber-200/60 bg-white/40">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700" />
          <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
            Pending your review
          </h2>
          <Badge variant="outline" className="ml-auto bg-amber-600 text-white border-amber-600 text-[10px]">
            {totalPending}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-amber-900/80">
          Nothing here gets sent to {customerFirstName || "this customer"} until you tap approve.
        </p>
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {estimates.map((est) => (
          <ProjectEstimateCard
            key={`pe-${est.id}`}
            estimate={est}
            customerFirstName={customerFirstName ?? null}
            onChanged={() => {
              utils.projectEstimator.listPendingForCustomer.invalidate({ customerId });
              utils.notifications.list.invalidate();
              utils.notifications.countUnread.invalidate();
            }}
          />
        ))}
        {ready.map((d) => (
          <NurturerDraftCard
            key={`d-${d.id}`}
            draft={d}
            onChanged={() => {
              utils.agentDrafts.listForCustomer.invalidate({ customerId });
              utils.agentDrafts.counts.invalidate();
              utils.notifications.list.invalidate();
              utils.notifications.countUnread.invalidate();
            }}
          />
        ))}
        {totalPending === 0 && (draftsQ.isLoading || estimatesQ.isLoading) && (
          <div className="text-xs text-amber-800/70 italic px-1 py-2">Loading…</div>
        )}
      </div>
    </div>
  );
}

// ─── Project Estimate card ───────────────────────────────────────────────────

type ProjectEstimateRow = {
  id: string;
  status: string;
  confidence: string | null;
  scopeSummary: string | null;
  inclusionsMd: string | null;
  customerRangeLowUsd: number | null;
  customerRangeHighUsd: number | null;
  marginAudit: string | null;
  claudeResponse: any;
  createdAt: Date | string;
};

function ProjectEstimateCard({
  estimate,
  customerFirstName,
  onChanged,
}: {
  estimate: ProjectEstimateRow;
  customerFirstName: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState(estimate.scopeSummary ?? "");
  const [inclusions, setInclusions] = useState(estimate.inclusionsMd ?? "");
  const [low, setLow] = useState(estimate.customerRangeLowUsd ?? 0);
  const [high, setHigh] = useState(estimate.customerRangeHighUsd ?? 0);

  const approve = trpc.projectEstimator.approveProject.useMutation({
    onSuccess: () => {
      toast.success(`Estimate approved — ${customerFirstName || "customer"} can view their range now.`);
      onChanged();
      setEditing(false);
    },
    onError: (err) => toast.error(`Approve failed: ${err.message}`),
  });

  const reject = trpc.projectEstimator.rejectProject.useMutation({
    onSuccess: () => {
      toast.success("Estimate rejected — won't be shared with the customer.");
      onChanged();
    },
    onError: (err) => toast.error(`Reject failed: ${err.message}`),
  });

  const tier =
    estimate.confidence === "high"
      ? { label: "High confidence", color: "bg-emerald-100 text-emerald-800 border-emerald-200" }
      : estimate.confidence === "medium"
        ? { label: "Medium confidence", color: "bg-amber-100 text-amber-800 border-amber-200" }
        : { label: "Low confidence — needs more info", color: "bg-rose-100 text-rose-800 border-rose-200" };

  const range = formatRange(estimate.customerRangeLowUsd, estimate.customerRangeHighUsd);

  return (
    <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 bg-gradient-to-r from-violet-50 to-white">
        <div className="flex items-start gap-2 flex-wrap">
          <Badge variant="outline" className="bg-violet-100 text-violet-800 border-violet-200 text-[10px]">
            <FileText className="w-3 h-3 mr-1" /> Project Estimate
          </Badge>
          <Badge variant="outline" className="bg-stone-100 text-stone-700 border-stone-200 text-[10px]">
            <Bot className="w-3 h-3 mr-1" /> Project Estimator
          </Badge>
          <Badge variant="outline" className={`${tier.color} text-[10px]`}>
            {tier.label}
          </Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {fmtAgo(estimate.createdAt)}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* SCOPE FIRST — stewardship voice. Range is a qualifying signal, not the headline. */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
            Scope
          </div>
          {editing ? (
            <Textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={5}
              className="text-sm leading-relaxed"
              placeholder="Stewardship-voice scope summary…"
            />
          ) : (
            <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
              {estimate.scopeSummary || <span className="italic text-stone-500">No scope summary yet.</span>}
            </p>
          )}
        </div>

        {/* What's included */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
            What's included
          </div>
          {editing ? (
            <Textarea
              value={inclusions}
              onChange={(e) => setInclusions(e.target.value)}
              rows={6}
              className="text-xs font-mono leading-relaxed"
              placeholder="Markdown — effort breakdown + materials…"
            />
          ) : (
            <pre className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap font-sans bg-stone-50 rounded-lg p-3 border border-stone-100">
              {estimate.inclusionsMd || "—"}
            </pre>
          )}
        </div>

        {/* Range — framed as a qualifying signal */}
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
            Customer-facing range
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-600">$</span>
              <Input
                type="number"
                value={low}
                onChange={(e) => setLow(Number(e.target.value) || 0)}
                className="w-32 text-sm"
              />
              <span className="text-xs text-stone-600">to $</span>
              <Input
                type="number"
                value={high}
                onChange={(e) => setHigh(Number(e.target.value) || 0)}
                className="w-32 text-sm"
              />
            </div>
          ) : (
            <p className="text-sm text-stone-800 font-medium">{range}</p>
          )}
          <p className="text-[10px] text-stone-500 mt-2 leading-snug">
            We will share this range with {customerFirstName || "the customer"} only if you approve.
            Lead with value; the range qualifies seriousness.
          </p>
        </div>

        {/* Margin audit (internal — not shown to customer) */}
        {estimate.marginAudit && !editing && (
          <details className="text-xs">
            <summary className="cursor-pointer text-stone-600 hover:text-stone-900 font-medium">
              Internal margin audit
            </summary>
            <pre className="mt-2 text-[11px] font-mono leading-relaxed text-stone-700 bg-stone-100 rounded-lg p-2 whitespace-pre-wrap">
              {estimate.marginAudit}
            </pre>
          </details>
        )}

        {/* Confidence rationale (when medium/low) */}
        {estimate.claudeResponse?.missing_info_questions?.length > 0 && !editing && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">
              Open questions before sharing
            </div>
            <ul className="list-disc list-inside text-xs text-rose-900 space-y-1">
              {estimate.claudeResponse.missing_info_questions.slice(0, 4).map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            <p className="text-[10px] text-rose-700/80 mt-2">
              Recommendation: walkthrough first before sharing a number.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() =>
                approve.mutate({
                  id: estimate.id,
                  scopeSummary: scope,
                  inclusionsMd: inclusions,
                  rangeLow: low,
                  rangeHigh: high,
                })
              }
              disabled={approve.isPending}
              style={{ minHeight: 44 }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Approve with edits
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setScope(estimate.scopeSummary ?? "");
                setInclusions(estimate.inclusionsMd ?? "");
                setLow(estimate.customerRangeLowUsd ?? 0);
                setHigh(estimate.customerRangeHighUsd ?? 0);
              }}
              style={{ minHeight: 44 }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => approve.mutate({ id: estimate.id })}
              disabled={approve.isPending}
              style={{ minHeight: 44 }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Approve as-is
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              style={{ minHeight: 44 }}
            >
              <Edit3 className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const reason =
                  typeof window !== "undefined"
                    ? window.prompt("Reject reason (optional):", "")
                    : "";
                reject.mutate({ id: estimate.id, reason: reason ?? undefined });
              }}
              disabled={reject.isPending}
              className="text-rose-700 hover:text-rose-900 hover:bg-rose-50 ml-auto"
              style={{ minHeight: 44 }}
            >
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Lead Nurturer draft card ────────────────────────────────────────────────

type DraftRow = {
  id: number;
  customerId: string;
  channel: string;
  status: string;
  subject: string | null;
  body: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  stepKey: string;
  generatedAt: Date | string | null;
  scheduledFor: Date | string;
};

function NurturerDraftCard({
  draft,
  onChanged,
}: {
  draft: DraftRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");

  const approve = trpc.agentDrafts.approve.useMutation({
    onSuccess: () => {
      toast.success("Sent");
      onChanged();
    },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });
  const update = trpc.agentDrafts.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft updated");
      onChanged();
    },
  });
  const cancel = trpc.agentDrafts.cancel.useMutation({
    onSuccess: () => {
      toast.success("Draft rejected");
      onChanged();
    },
  });

  const channelMeta =
    draft.channel === "sms"
      ? { Icon: MessageSquare, label: "SMS Draft", color: "bg-blue-100 text-blue-800 border-blue-200" }
      : { Icon: Mail, label: "Email Draft", color: "bg-indigo-100 text-indigo-800 border-indigo-200" };
  const ChannelIcon = channelMeta.Icon;

  const recipient = draft.channel === "sms" ? draft.recipientPhone : draft.recipientEmail;

  return (
    <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 bg-gradient-to-r from-amber-50/40 to-white">
        <div className="flex items-start gap-2 flex-wrap">
          <Badge variant="outline" className={`${channelMeta.color} text-[10px]`}>
            <ChannelIcon className="w-3 h-3 mr-1" />
            {channelMeta.label}
          </Badge>
          <Badge variant="outline" className="bg-stone-100 text-stone-700 border-stone-200 text-[10px]">
            <Bot className="w-3 h-3 mr-1" /> Lead Nurturer
          </Badge>
          <Badge variant="outline" className="bg-stone-50 text-stone-600 border-stone-200 text-[10px]">
            {humanStepKey(draft.stepKey)}
          </Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {fmtAgo(draft.generatedAt ?? draft.scheduledFor)}
          </span>
        </div>
        {recipient && (
          <p className="mt-1.5 text-[11px] text-stone-500 truncate">To: {recipient}</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {editing ? (
          <>
            {draft.channel === "email" && (
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-stone-600">
                  Subject
                </Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-stone-600">
                Body
              </Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={draft.channel === "sms" ? 4 : 10}
                className="mt-1 text-sm leading-relaxed"
              />
            </div>
          </>
        ) : (
          <>
            {draft.subject && (
              <p className="text-sm font-semibold text-stone-900">{draft.subject}</p>
            )}
            <pre className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap font-sans bg-stone-50 rounded-lg p-3 border border-stone-100">
              {draft.body || <span className="italic text-stone-500">Empty body.</span>}
            </pre>
          </>
        )}
      </div>

      <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() => {
                update.mutate(
                  {
                    id: draft.id,
                    subject: draft.channel === "email" ? subject : undefined,
                    body,
                  },
                  { onSuccess: () => setEditing(false) },
                );
              }}
              disabled={update.isPending}
              style={{ minHeight: 44 }}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Save edits
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setSubject(draft.subject ?? "");
                setBody(draft.body ?? "");
              }}
              style={{ minHeight: 44 }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => approve.mutate({ id: draft.id })}
              disabled={approve.isPending}
              style={{ minHeight: 44 }}
            >
              <Send className="w-4 h-4 mr-1" />
              Approve & send
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              style={{ minHeight: 44 }}
            >
              <Edit3 className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const reason =
                  typeof window !== "undefined"
                    ? window.prompt("Reject reason (optional):", "")
                    : "";
                cancel.mutate({ id: draft.id, reason: reason ?? undefined });
              }}
              disabled={cancel.isPending}
              className="text-rose-700 hover:text-rose-900 hover:bg-rose-50 ml-auto"
              style={{ minHeight: 44 }}
            >
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAgo(iso: Date | string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatRange(low: number | null, high: number | null): string {
  if (!low && !high) return "—";
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  if (low && high) return `${fmt(low)} – ${fmt(high)}`;
  if (low) return `${fmt(low)}+`;
  return `up to ${fmt(high ?? 0)}`;
}

function humanStepKey(key: string): string {
  const map: Record<string, string> = {
    t_plus_4h_sms: "T+4h SMS",
    t_plus_24h_email: "T+24h Email",
    t_plus_72h_sms: "T+72h Check-in",
    t_plus_7d_email_360: "T+7d 360°",
    estimate_ready_immediate: "Estimate Ready",
    missing_info_immediate: "Missing Info",
    concierge_personal_followup: "Concierge T+4h",
    estimate_ready_or_questions: "Estimate T+24h",
    estimate_view_nudge: "View Nudge T+48h",
    membership_intro: "360° Intro T+5d",
    long_term_nurture: "Long-term Nurture",
  };
  return map[key] ?? key;
}

function useScrollIntoView(active: boolean) {
  const ref = useScrollRefOnce(active);
  return ref;
}

// Tiny one-shot scroll-into-view ref. Triggers once on mount when active=true.
function useScrollRefOnce(active: boolean) {
  return (node: HTMLDivElement | null) => {
    if (!node || !active) return;
    // Defer past the first paint so the layout has settled.
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
}
