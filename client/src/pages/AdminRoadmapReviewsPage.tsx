// ============================================================
// AdminRoadmapReviewsPage — Marcin's human checkpoint inbox.
//
// Two views in one route:
//   • list view:   pending reviews (status = draft_awaiting_review)
//   • detail view: inline finding editor + review note + send button
//
// Layout is intentionally minimal — this is a functional admin surface,
// not a polished product experience. Polish comes later; shipping the
// checkpoint flow is the priority so Marcin can actually use it.
// ============================================================
import { useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLogin from "@/pages/AdminLogin";
import AdminAccessDenied from "@/pages/AdminAccessDenied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Send, Trash2, Plus, Clock } from "lucide-react";

type Urgency = "NOW" | "SOON" | "WAIT";

export default function AdminRoadmapReviewsPage() {
  const { user, loading } = useAuth();
  const [match, params] = useRoute("/admin/roadmap-reviews/:id");

  if (loading) return null;
  if (!user) return <AdminLogin />;
  if ((user as { isAllowed?: boolean }).isAllowed === false) {
    return <AdminAccessDenied email={user.email} />;
  }
  if ((user as { role?: string }).role !== "admin") {
    return <AdminAccessDenied email={user.email} />;
  }

  if (match && params?.id) {
    return <RoadmapReviewDetail id={params.id} />;
  }
  return <RoadmapReviewsList />;
}

// ─── List view ──────────────────────────────────────────────────────────────
function RoadmapReviewsList() {
  const [, navigate] = useLocation();
  const { data, isLoading, refetch } = trpc.priorityTranslation.listPendingReviews.useQuery();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Roadmap Reviews</h1>
            <p className="text-sm text-gray-500">
              Claude has drafted these roadmaps. Review, edit, and send when ready.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </header>

        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Loading…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Nothing pending. When a new Roadmap Generator submission finishes Claude drafting, it will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {data.map((r) => (
              <li
                key={r.id}
                className="flex cursor-pointer items-start justify-between gap-4 p-4 hover:bg-gray-50"
                onClick={() => navigate(`/admin/roadmap-reviews/${r.id}`)}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{r.customerName || "(no name)"}</div>
                  <div className="truncate text-sm text-gray-500">{r.propertyAddress}</div>
                  <div className="mt-1 text-xs text-gray-400">{r.email}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " +
                      (r.ageHours >= 48
                        ? "bg-red-50 text-red-700"
                        : r.ageHours >= 24
                        ? "bg-amber-50 text-amber-700"
                        : "bg-gray-100 text-gray-700")
                    }
                  >
                    <Clock className="h-3 w-3" />
                    {r.ageHours}h old
                  </span>
                  <span className="text-xs text-gray-400">{r.id}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Detail view ────────────────────────────────────────────────────────────
function RoadmapReviewDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.priorityTranslation.getRoadmapDraft.useQuery({ id });

  const [localNote, setLocalNote] = useState<string | null>(null);
  const note = localNote ?? data?.reviewNotes ?? "";

  const updateFinding = trpc.priorityTranslation.updateFinding.useMutation({
    onSuccess: () => utils.priorityTranslation.getRoadmapDraft.invalidate({ id }),
  });
  const addFinding = trpc.priorityTranslation.addFinding.useMutation({
    onSuccess: () => utils.priorityTranslation.getRoadmapDraft.invalidate({ id }),
  });
  const removeFinding = trpc.priorityTranslation.removeFinding.useMutation({
    onSuccess: () => utils.priorityTranslation.getRoadmapDraft.invalidate({ id }),
  });
  const setReviewNote = trpc.priorityTranslation.setReviewNote.useMutation();
  const sendToCustomer = trpc.priorityTranslation.sendToCustomer.useMutation({
    onSuccess: () => {
      toast.success("Roadmap sent to customer.");
      utils.priorityTranslation.listPendingReviews.invalidate();
      navigate("/admin/roadmap-reviews");
    },
    onError: (err) => toast.error(err.message || "Send failed"),
  });

  const findings = useMemo(() => data?.claudeResponse?.findings ?? [], [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-5xl text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-5xl text-sm text-red-600">Roadmap not found.</div>
      </div>
    );
  }

  async function saveNote() {
    try {
      await setReviewNote.mutateAsync({ id, note });
      toast.success("Note saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save note");
    }
  }

  async function handleSend() {
    if (!confirm(`Send this roadmap to ${data?.customer?.email ?? "the customer"}?`)) return;
    if (localNote !== null && localNote !== data?.reviewNotes) {
      await setReviewNote.mutateAsync({ id, note });
    }
    await sendToCustomer.mutateAsync({ id });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/roadmap-reviews")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
          </Button>
          <Button
            className="bg-amber-700 text-white hover:bg-amber-800"
            disabled={sendToCustomer.isPending || data.status === "sent"}
            onClick={handleSend}
          >
            <Send className="mr-2 h-4 w-4" />
            {data.status === "sent" ? "Sent" : sendToCustomer.isPending ? "Sending…" : "Send to Customer"}
          </Button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">
            {data.customer?.firstName} {data.customer?.lastName}
          </h1>
          <p className="text-sm text-gray-500">{data.propertyAddress}</p>
          <p className="text-xs text-gray-400">
            {data.customer?.email} · {data.customer?.phone} · status: {data.status}
          </p>

          {data.claudeResponse?.summary_1_paragraph && (
            <div className="mt-4 rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Claude summary
              </div>
              {data.claudeResponse.summary_1_paragraph}
            </div>
          )}
        </div>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-gray-100 p-4">
            <h2 className="font-semibold text-gray-900">Findings</h2>
            <AddFindingButton onAdd={(f) => addFinding.mutateAsync({ id, finding: f })} />
          </header>
          {findings.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No findings yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {findings.map((f, idx) => (
                <FindingRow
                  key={idx}
                  index={idx}
                  finding={f}
                  onChange={(patch) => updateFinding.mutateAsync({ id, index: idx, patch })}
                  onRemove={() => removeFinding.mutateAsync({ id, index: idx })}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Your personal note
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Shown to the customer in the email and appended to the output PDF. This is your
            voice — a sentence or two about what you noticed, what you'd tackle first, anything
            that made this report stand out to you.
          </p>
          <Textarea
            rows={5}
            value={note}
            onChange={(e) => setLocalNote(e.target.value)}
            placeholder="I reviewed your inspection report myself. A few things stood out…"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={saveNote} disabled={setReviewNote.isPending}>
              {setReviewNote.isPending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Finding row ────────────────────────────────────────────────────────────
function FindingRow({
  index,
  finding,
  onChange,
  onRemove,
}: {
  index: number;
  finding: {
    category: string;
    finding: string;
    urgency: Urgency;
    investment_range_low_usd: number;
    investment_range_high_usd: number;
    reasoning: string;
  };
  onChange: (patch: Partial<typeof finding>) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [local, setLocal] = useState(finding);

  function save(patch: Partial<typeof finding>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(patch).catch((err) => toast.error(err?.message || "Save failed"));
  }

  return (
    <li className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          #{index + 1}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onRemove()}>
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs text-gray-500">Category</label>
          <Input
            value={local.category}
            onChange={(e) => setLocal({ ...local, category: e.target.value })}
            onBlur={(e) => save({ category: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-gray-500">Urgency</label>
          <Select
            value={local.urgency}
            onValueChange={(v) => save({ urgency: v as Urgency })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOW">NOW</SelectItem>
              <SelectItem value="SOON">SOON</SelectItem>
              <SelectItem value="WAIT">WAIT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-gray-500">$ Low</label>
          <Input
            type="number"
            value={local.investment_range_low_usd}
            onChange={(e) => setLocal({ ...local, investment_range_low_usd: Number(e.target.value) })}
            onBlur={(e) => save({ investment_range_low_usd: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-gray-500">$ High</label>
          <Input
            type="number"
            value={local.investment_range_high_usd}
            onChange={(e) => setLocal({ ...local, investment_range_high_usd: Number(e.target.value) })}
            onBlur={(e) => save({ investment_range_high_usd: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-12">
          <label className="mb-1 block text-xs text-gray-500">Description</label>
          <Textarea
            rows={2}
            value={local.finding}
            onChange={(e) => setLocal({ ...local, finding: e.target.value })}
            onBlur={(e) => save({ finding: e.target.value })}
          />
        </div>
        <div className="md:col-span-12">
          <label className="mb-1 block text-xs text-gray-500">Reasoning (internal + shown on PDF)</label>
          <Textarea
            rows={2}
            value={local.reasoning}
            onChange={(e) => setLocal({ ...local, reasoning: e.target.value })}
            onBlur={(e) => save({ reasoning: e.target.value })}
          />
        </div>
      </div>
    </li>
  );
}

// ─── Add finding ────────────────────────────────────────────────────────────
function AddFindingButton({
  onAdd,
}: {
  onAdd: (f: {
    category: string;
    finding: string;
    urgency: Urgency;
    investment_range_low_usd: number;
    investment_range_high_usd: number;
    reasoning: string;
  }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "",
    finding: "",
    urgency: "SOON" as Urgency,
    investment_range_low_usd: 0,
    investment_range_high_usd: 0,
    reasoning: "",
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add finding
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Category (e.g. Roof)"
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value })}
        className="w-48"
      />
      <Button
        size="sm"
        onClick={async () => {
          if (!form.category.trim()) {
            toast.error("Category required");
            return;
          }
          await onAdd({ ...form, finding: form.finding || form.category });
          setForm({
            category: "",
            finding: "",
            urgency: "SOON",
            investment_range_low_usd: 0,
            investment_range_high_usd: 0,
            reasoning: "",
          });
          setOpen(false);
        }}
      >
        Add
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
