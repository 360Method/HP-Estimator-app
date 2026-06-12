/**
 * OsSpotInspection: the doctor-style spot visit (/os/spot/new, /os/spot/:id).
 *
 * Works for members and non-members: a member's spot visit builds on their
 * baseline; for a non-member it is the inspect-first front door. The flow on
 * one screen: pick the client, photograph what you see, narrate it, let the
 * AI draft the mini roadmap, edit it like a doctor reviewing dictation, then
 * approve. Approval is the customer-visible moment: portal plus email,
 * instantly. Until then nothing leaves this device.
 */
import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { Camera, Check, ChevronRight, FileText, Send, Trash2, Wand2 } from "lucide-react";
import { OsShell } from "../OsShell";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { MethodContextBanner } from "@/components/threeSixty/MethodContextBanner";

type Urgency = "NOW" | "SOON" | "WAIT";

const URGENCY_STYLE: Record<Urgency, string> = {
  NOW: "bg-red-100 text-red-800 border-red-200",
  SOON: "bg-amber-100 text-amber-800 border-amber-300",
  WAIT: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

type DraftFinding = {
  category: string;
  finding: string;
  interpretation?: string;
  recommended_approach?: string;
  urgency: Urgency;
  investment_range_low_usd: number;
  investment_range_high_usd: number;
  reasoning: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OsSpotInspection() {
  const [, navigate] = useLocation();
  const [matchExisting, params] = useRoute("/os/spot/:id");
  const inspectionId = matchExisting && params?.id !== "new" ? params!.id : null;

  const { state, addOpportunity, setActiveCustomer, setActiveOpportunity } = useEstimator();
  useDbSync(true);
  const utils = trpc.useUtils();

  // ── New-inspection state ──────────────────────────────────────
  const [clientQuery, setClientQuery] = useState("");
  const urlCustomerId = useMemo(
    () => new URLSearchParams(window.location.search).get("customerId"),
    [],
  );

  // ── Existing-inspection state ─────────────────────────────────
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ summary: string; findings: DraftFinding[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pickedFindings, setPickedFindings] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const getQ = trpc.spotInspection.get.useQuery(
    { id: inspectionId ?? "" },
    { enabled: !!inspectionId, refetchInterval: generating ? 3000 : false },
  );
  const insp = getQ.data ?? null;

  const createM = trpc.spotInspection.create.useMutation({
    onSuccess: (r) => navigate(`/os/spot/${r.id}`, { replace: true }),
    onError: (e) => toast.error(e.message),
  });
  const uploadM = trpc.uploads.uploadFile.useMutation();
  const addPhotoM = trpc.spotInspection.addPhoto.useMutation({
    onSuccess: () => utils.spotInspection.get.invalidate({ id: inspectionId ?? "" }),
    onError: (e) => toast.error(e.message),
  });
  const removePhotoM = trpc.spotInspection.removePhoto.useMutation({
    onSuccess: () => utils.spotInspection.get.invalidate({ id: inspectionId ?? "" }),
    onError: (e) => toast.error(e.message),
  });
  const notesM = trpc.spotInspection.updateTechNotes.useMutation({
    onSuccess: () => toast.success("Notes saved."),
    onError: (e) => toast.error(e.message),
  });
  const generateM = trpc.spotInspection.generate.useMutation({
    onSuccess: () => {
      setGenerating(false);
      setDraft(null);
      utils.spotInspection.get.invalidate({ id: inspectionId ?? "" });
      toast.success("Draft ready. Review it before anything goes out.");
    },
    onError: (e) => {
      setGenerating(false);
      toast.error(e.message);
    },
  });
  const updateDraftM = trpc.spotInspection.updateDraftResponse.useMutation({
    onSuccess: () => {
      utils.spotInspection.get.invalidate({ id: inspectionId ?? "" });
      toast.success("Draft saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  const approveM = trpc.spotInspection.approveAndDeliver.useMutation({
    onSuccess: () => {
      utils.spotInspection.get.invalidate({ id: inspectionId ?? "" });
      toast.success("Delivered. The customer has it in their portal and inbox.");
    },
    onError: (e) => toast.error(e.message),
  });
  const convertM = trpc.spotInspection.createOpportunityFromFindings.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return state.customers.slice(0, 6);
    return state.customers.filter((c) => c.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [clientQuery, state.customers]);

  async function onPickPhotos(files: FileList | null) {
    if (!files || !inspectionId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const base64 = await fileToBase64(file);
        const up = await uploadM.mutateAsync({
          filename: file.name || "photo.jpg",
          mimeType: file.type || "image/jpeg",
          base64,
          folder: "spot-inspections",
        });
        await addPhotoM.mutateAsync({ id: inspectionId, url: up.url, fileKey: up.key });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function startEditDraft() {
    if (!insp?.draft) return;
    setDraft({
      summary: insp.draft.summary_1_paragraph ?? "",
      findings: (insp.draft.findings ?? []).map((f) => ({
        category: f.category,
        finding: f.finding,
        interpretation: f.interpretation,
        recommended_approach: f.recommended_approach,
        urgency: f.urgency as Urgency,
        investment_range_low_usd: f.investment_range_low_usd,
        investment_range_high_usd: f.investment_range_high_usd,
        reasoning: f.reasoning ?? "",
      })),
    });
  }

  function saveDraft() {
    if (!draft || !inspectionId) return;
    for (const f of draft.findings) {
      if (f.investment_range_low_usd > f.investment_range_high_usd) {
        toast.error(`${f.category}: the low end of the range is above the high end.`);
        return;
      }
    }
    updateDraftM.mutate({
      id: inspectionId,
      summary: draft.summary,
      findings: draft.findings,
    });
    setDraft(null);
  }

  function buildEstimate() {
    if (!insp || !inspectionId || !insp.customerId) return;
    const indexes = Object.entries(pickedFindings)
      .filter(([, on]) => on)
      .map(([i]) => Number(i));
    if (indexes.length === 0) {
      toast.error("Pick at least one finding to price.");
      return;
    }
    const oppId = nanoid(8);
    convertM.mutate(
      { id: inspectionId, opportunityId: oppId, findingIndexes: indexes },
      {
        onSuccess: (r) => {
          addOpportunity({
            id: oppId, area: "estimate", stage: "Draft", title: r.title, value: 0,
            notes: "", archived: false,
          });
          setActiveCustomer(insp.customerId!);
          setActiveOpportunity(oppId);
          navigate(
            `/os/estimate/new?customerId=${encodeURIComponent(insp.customerId!)}&oppId=${encodeURIComponent(oppId)}&title=${encodeURIComponent(r.title)}`,
          );
        },
      },
    );
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

  // ── New inspection: client picker ─────────────────────────────
  if (!inspectionId) {
    const preselected = urlCustomerId ? state.customers.find((c) => c.id === urlCustomerId) : null;
    return (
      <OsShell active="/os/spot/new">
        <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>Spot inspection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect first, like a doctor. Photos and your notes become a mini roadmap the customer
          keeps, whether they are a member or meeting us for the first time.
        </p>
        <div className="mt-4">
          <MethodContextBanner
            stepKey="inspect"
            note="For members this builds on the baseline. For everyone else it is their first taste of how we care for a home."
          />
        </div>
        <section className="mt-5 max-w-lg">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Who is this visit for</h2>
          {preselected ? (
            <button
              type="button"
              className="w-full text-left bg-white rounded-xl border px-4 py-3 text-sm font-semibold"
              style={inputStyle}
              onClick={() => createM.mutate({ customerId: preselected.id })}
              disabled={createM.isPending}
            >
              Start for {preselected.displayName} <ChevronRight className="w-4 h-4 inline" />
            </button>
          ) : (
            <div className="bg-white rounded-xl border p-3" style={inputStyle}>
              <input className={inputCls} style={inputStyle} value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Search clients…" />
              <div className="mt-2 space-y-1">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={createM.isPending}
                    onClick={() => createM.mutate({ customerId: c.id })}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-black/[0.03]"
                    style={{ color: "var(--hp-ink)" }}
                  >
                    {c.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            The customer needs an email on file; that is where their roadmap will land.
          </p>
        </section>
      </OsShell>
    );
  }

  // ── Existing inspection ───────────────────────────────────────
  const status = insp?.status ?? "submitted";
  const delivered = status === "completed";
  const reviewing = status === "awaiting_review";

  return (
    <OsShell active="/os/spot/new">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Spot inspection{insp?.customerName ? `: ${insp.customerName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{insp?.propertyAddress}</p>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-600">
          {delivered ? "Delivered" : reviewing ? "Draft awaiting your review" : status === "processing" || generating ? "Generating…" : "Capturing"}
        </span>
      </div>

      <div className="mt-4">
        <MethodContextBanner
          stepKey="inspect"
          note="Photograph what you see and say what is going on. Nothing reaches the customer until you approve the roadmap."
        />
      </div>

      {/* ── Photos ─────────────────────────────────────────────── */}
      {!delivered && (
        <section className="mt-5">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Photos</h2>
          <div className="bg-white rounded-xl border p-4" style={inputStyle}>
            <div className="flex flex-wrap gap-2">
              {(insp?.photos ?? []).map((p) => (
                <div key={p.fileKey} className="relative w-24 h-24 rounded-lg overflow-hidden border" style={inputStyle}>
                  <img src={p.url} alt={p.caption ?? "Inspection photo"} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhotoM.mutate({ id: inspectionId, fileKey: p.fileKey })}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground"
                style={inputStyle}
              >
                <Camera className="w-5 h-5 mb-1" />
                <span className="text-[10px]">{uploading ? "Uploading…" : "Add photos"}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => onPickPhotos(e.target.files)}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── Notes ──────────────────────────────────────────────── */}
      {!delivered && (
        <section className="mt-5">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>What is going on</h2>
          <textarea
            className={inputCls + " bg-white"}
            style={inputStyle}
            rows={4}
            placeholder="Say it like you'd explain it to the homeowner: what you found, where, how bad, what you suspect."
            value={notesDraft ?? insp?.techNotes ?? ""}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft != null && notesDraft !== insp?.techNotes) {
                notesM.mutate({ id: inspectionId, techNotes: notesDraft });
              }
            }}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (notesDraft != null && notesDraft !== insp?.techNotes) {
                  notesM.mutate({ id: inspectionId, techNotes: notesDraft });
                }
                setGenerating(true);
                generateM.mutate({ id: inspectionId });
              }}
              disabled={generating || status === "processing" || ((insp?.photos?.length ?? 0) === 0 && !(notesDraft ?? insp?.techNotes))}
              className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--hp-ink)" }}
            >
              <Wand2 className="w-4 h-4" /> {reviewing ? "Generate again" : "Generate mini roadmap"}
            </button>
            {insp?.failureReason && status === "failed" && (
              <span className="text-xs text-red-600">Last run failed: {insp.failureReason}</span>
            )}
          </div>
        </section>
      )}

      {/* ── Draft review ───────────────────────────────────────── */}
      {reviewing && insp?.draft && (
        <section className="mt-6">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
            The draft. Review it like dictation: fix anything, then approve.
          </h2>

          {draft ? (
            <div className="bg-white rounded-xl border p-4 space-y-3" style={inputStyle}>
              <textarea className={inputCls} style={inputStyle} rows={3} value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              {draft.findings.map((f, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2" style={inputStyle}>
                  <div className="flex gap-2">
                    <input className={inputCls + " font-semibold"} style={inputStyle} value={f.category}
                      onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} />
                    <div className="flex gap-1">
                      {(["NOW", "SOON", "WAIT"] as Urgency[]).map((u) => (
                        <button key={u} type="button"
                          onClick={() => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, urgency: u } : x)) })}
                          className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${f.urgency === u ? URGENCY_STYLE[u] : "bg-white text-muted-foreground"}`}>
                          {u}
                        </button>
                      ))}
                    </div>
                    <button type="button" aria-label="Remove finding"
                      onClick={() => setDraft({ ...draft, findings: draft.findings.filter((_, j) => j !== i) })}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <textarea className={inputCls} style={inputStyle} rows={2} value={f.finding}
                    onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, finding: e.target.value } : x)) })} />
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-muted-foreground">Range</span>
                    <input className={inputCls + " w-28"} style={inputStyle} inputMode="numeric" value={f.investment_range_low_usd}
                      onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, investment_range_low_usd: parseFloat(e.target.value) || 0 } : x)) })} />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input className={inputCls + " w-28"} style={inputStyle} inputMode="numeric" value={f.investment_range_high_usd}
                      onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, investment_range_high_usd: parseFloat(e.target.value) || 0 } : x)) })} />
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <button type="button" className="text-xs px-3 py-2 rounded-lg border" style={inputStyle} onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className="text-xs px-4 py-2 rounded-lg font-semibold text-white" style={{ background: "var(--hp-ink)" }} onClick={saveDraft}>
                  Save draft
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-4" style={inputStyle}>
              <p className="text-sm leading-relaxed" style={{ color: "var(--hp-ink)" }}>{insp.draft.summary_1_paragraph}</p>
              <div className="mt-3 space-y-2">
                {(insp.draft.findings ?? []).map((f, i) => (
                  <div key={i} className="rounded-lg border px-3 py-2" style={inputStyle}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{f.category}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${URGENCY_STYLE[f.urgency as Urgency]}`}>{f.urgency}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{f.finding}</p>
                    <p className="text-xs font-medium mt-1" style={{ color: "var(--hp-ink)" }}>
                      {money(f.investment_range_low_usd)} to {money(f.investment_range_high_usd)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                <button type="button" className="text-xs underline text-muted-foreground" onClick={startEditDraft}>
                  Edit the draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Send this mini roadmap? The customer sees it in their portal and gets the email right away.")) {
                      approveM.mutate({ id: inspectionId });
                    }
                  }}
                  disabled={approveM.isPending}
                  className="flex items-center gap-1.5 text-sm px-5 py-2.5 rounded-xl font-semibold text-white"
                  style={{ background: "var(--hp-gold-deep)" }}
                >
                  <Send className="w-4 h-4" /> {approveM.isPending ? "Delivering…" : "Approve and send"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Delivered ──────────────────────────────────────────── */}
      {delivered && insp && (
        <section className="mt-6 mb-8">
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: "rgba(200,146,42,0.4)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
              <Check className="w-4 h-4 text-emerald-600" /> Delivered. It is in their portal and their inbox.
            </div>
            {insp.pdfUrl && (
              <a href={insp.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline text-muted-foreground mt-2">
                <FileText className="w-3.5 h-3.5" /> Open the PDF
              </a>
            )}
          </div>

          {(insp.draft?.findings?.length ?? 0) > 0 && (
            <div className="mt-4 bg-white rounded-xl border p-4" style={inputStyle}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--hp-ink)" }}>
                Ready to price something?
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Pick the findings they want handled and build the real scope.
              </p>
              <div className="space-y-1.5">
                {(insp.draft?.findings ?? []).map((f, i) => (
                  <label key={i} className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: "var(--hp-ink)" }}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!pickedFindings[i]}
                      onChange={(e) => setPickedFindings({ ...pickedFindings, [i]: e.target.checked })}
                    />
                    <span>
                      <span className="font-medium">{f.category}.</span>{" "}
                      <span className="text-muted-foreground">{money(f.investment_range_low_usd)} to {money(f.investment_range_high_usd)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={buildEstimate}
                  disabled={convertM.isPending}
                  className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl font-semibold text-white"
                  style={{ background: "var(--hp-ink)" }}
                >
                  Build the estimate <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Not a member yet? This visit is exactly what the Proactive Path does on a rhythm.{" "}
            <Link href="/os/method"><span className="underline cursor-pointer">The method</span></Link> has the pitch.
          </p>
        </section>
      )}
    </OsShell>
  );
}
