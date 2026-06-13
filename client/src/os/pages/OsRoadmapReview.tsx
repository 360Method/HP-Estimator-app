/**
 * OsRoadmapReview (/os/roadmap-review/:id): the human gate for funnel
 * roadmaps. The public Roadmap Generator no longer auto-sends; every AI
 * draft parks here until someone reads it, fixes it, and approves it. The
 * homeowner is promised their roadmap within one business day.
 */
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { OsShell } from "../OsShell";
import { DraftReviewEditor, type ReviewDraft } from "../spot/DraftReviewEditor";

export default function OsRoadmapReview() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/os/roadmap-review/:id");
  const id = params?.id ?? "";

  const utils = trpc.useUtils();
  const getQ = trpc.priorityTranslation.getForReview.useQuery({ id }, { enabled: !!id });
  const row = getQ.data ?? null;

  const updateDraftM = trpc.priorityTranslation.updateDraftResponse.useMutation({
    onSuccess: () => {
      utils.priorityTranslation.getForReview.invalidate({ id });
      toast.success("Draft saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  const approveM = trpc.priorityTranslation.approveAndDeliverFunnel.useMutation({
    onSuccess: () => {
      utils.priorityTranslation.getForReview.invalidate({ id });
      utils.priorityTranslation.listAwaitingReview.invalidate();
      toast.success("Delivered. The customer has it in their portal and inbox.");
    },
    onError: (e) => toast.error(e.message),
  });

  const delivered = row?.status === "completed";

  return (
    <OsShell active="/os/approvals">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Roadmap review{row?.customerName ? `: ${row.customerName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {[row?.propertyAddress, row?.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-600">
          {delivered ? "Delivered" : row?.status === "awaiting_review" ? "Awaiting your review" : row?.status ?? ""}
        </span>
      </div>

      {getQ.isLoading && (
        <div className="flex items-center gap-2 mt-8 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the draft…
        </div>
      )}

      {row?.homeownerNotes && !delivered && (
        <p className="text-xs text-muted-foreground mt-4">
          <span className="font-medium" style={{ color: "var(--hp-ink)" }}>Homeowner notes: </span>
          {row.homeownerNotes}
        </p>
      )}

      {row?.status === "awaiting_review" && row.draft && (
        <section className="mt-6 mb-8">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
            The draft. Review it like dictation: fix anything, then approve.
          </h2>
          <DraftReviewEditor
            draft={row.draft as ReviewDraft}
            onSave={(edited) =>
              updateDraftM.mutate({ id, summary: edited.summary, findings: edited.findings })
            }
            onApprove={() => approveM.mutate({ id })}
            approving={approveM.isPending}
            approveConfirmText="Send this roadmap? The customer gets the email with the PDF right away."
          />
        </section>
      )}

      {delivered && (
        <section className="mt-6 mb-8">
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: "rgba(200,146,42,0.4)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
              <Check className="w-4 h-4 text-emerald-600" /> Delivered. It is in their inbox and their portal.
            </div>
          </div>
          <button
            type="button"
            className="text-xs underline text-muted-foreground mt-3"
            onClick={() => navigate("/os/approvals")}
          >
            Back to approvals
          </button>
        </section>
      )}

      {row && row.status !== "awaiting_review" && !delivered && (
        <p className="text-sm text-muted-foreground mt-6">
          This roadmap is not waiting on a review
          {row.failureReason ? ` (last run: ${row.failureReason})` : ""}.{" "}
          <Link href="/os/approvals"><span className="underline cursor-pointer">Back to approvals</span></Link>
        </p>
      )}
    </OsShell>
  );
}
