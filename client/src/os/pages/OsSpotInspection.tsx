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
import { Camera, Check, ChevronRight, FileText, Plus, Trash2, Wand2 } from "lucide-react";
import { OsShell } from "../OsShell";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { MethodContextBanner } from "@/components/threeSixty/MethodContextBanner";
import { DraftReviewEditor, type ReviewDraft } from "../spot/DraftReviewEditor";
import { HOME_SYSTEMS } from "@shared/homeSystems";

type CaptureLine = { id: string; areaKey: string; note: string };

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
  // Multi-property client: which home is this visit about?
  const [propertyChoice, setPropertyChoice] = useState<null | {
    customerId: string;
    customerName: string;
    properties: { id: string; label: string; street: string; city: string; isPrimary: boolean }[];
  }>(null);
  const urlCustomerId = useMemo(
    () => new URLSearchParams(window.location.search).get("customerId"),
    [],
  );
  // Deep links from a property-scoped profile pin the visit to that home.
  const urlPropertyId = useMemo(
    () => new URLSearchParams(window.location.search).get("propertyId"),
    [],
  );

  // ── Existing-inspection state ─────────────────────────────────
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  /** Local working copy of the structured finding lines (null until seeded). */
  const [lines, setLines] = useState<CaptureLine[] | null>(null);
  /** Which line the next photo upload belongs to (null = general). */
  const photoTargetLine = useRef<string | null>(null);
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

  // One property (or none) starts the visit straight away; more than one
  // asks which home this is about first.
  async function startVisit(customerId: string, customerName: string) {
    if (urlPropertyId && customerId === urlCustomerId) {
      createM.mutate({ customerId, propertyId: urlPropertyId });
      return;
    }
    try {
      const props = await utils.properties.listByCustomer.fetch({ customerId });
      if ((props?.length ?? 0) > 1) {
        setPropertyChoice({
          customerId,
          customerName,
          properties: props.map((p: any) => ({
            id: p.id, label: p.label, street: p.street, city: p.city, isPrimary: p.isPrimary,
          })),
        });
        return;
      }
      createM.mutate({ customerId, propertyId: props?.[0]?.id });
    } catch {
      // Property lookup is enrichment; the visit still starts.
      createM.mutate({ customerId });
    }
  }
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
  const setLinesM = trpc.spotInspection.setCaptureLines.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const generateM = trpc.spotInspection.generate.useMutation({
    onSuccess: () => {
      setGenerating(false);
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
    const lineId = photoTargetLine.current ?? undefined;
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
        await addPhotoM.mutateAsync({ id: inspectionId, url: up.url, fileKey: up.key, lineId });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      photoTargetLine.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Structured capture lines ──────────────────────────────────
  // New visits capture one card per finding (area chip + note + photos).
  // Rows that already have blob notes or untagged photos and no lines stay
  // in the legacy single-textarea mode so nothing in flight breaks.
  const blobMode =
    !insp?.captureLines &&
    ((insp?.techNotes ?? "").trim() !== "" || (insp?.photos?.length ?? 0) > 0) &&
    (lines?.length ?? 0) === 0;
  const workingLines: CaptureLine[] = lines ?? insp?.captureLines ?? [];

  function persistLines(next: CaptureLine[]) {
    setLines(next);
    if (inspectionId) setLinesM.mutate({ id: inspectionId, lines: next });
  }
  function addLine() {
    persistLines([...workingLines, { id: nanoid(8), areaKey: "other", note: "" }]);
  }
  function removeLine(lineId: string) {
    persistLines(workingLines.filter((l) => l.id !== lineId));
  }
  function patchLine(lineId: string, patch: Partial<CaptureLine>, save: boolean) {
    const next = workingLines.map((l) => (l.id === lineId ? { ...l, ...patch } : l));
    if (save) persistLines(next);
    else setLines(next);
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
          {propertyChoice ? (
            <div className="bg-white rounded-xl border p-3" style={inputStyle}>
              <div className="text-sm font-semibold mb-2" style={{ color: "var(--hp-ink)" }}>
                Which home is this visit for {propertyChoice.customerName}?
              </div>
              <div className="space-y-1">
                {propertyChoice.properties.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={createM.isPending}
                    onClick={() => createM.mutate({ customerId: propertyChoice.customerId, propertyId: p.id })}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-black/[0.03]"
                    style={{ color: "var(--hp-ink)" }}
                  >
                    <span className="font-semibold">{p.label}</span>
                    {p.isPrimary && <span className="ml-1.5 text-[10px] text-amber-600">primary</span>}
                    <span className="block text-xs text-muted-foreground">
                      {[p.street, p.city].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPropertyChoice(null)}
                className="mt-2 text-xs text-muted-foreground hover:underline"
              >
                Back
              </button>
            </div>
          ) : preselected ? (
            <button
              type="button"
              className="w-full text-left bg-white rounded-xl border px-4 py-3 text-sm font-semibold"
              style={inputStyle}
              onClick={() => startVisit(preselected.id, preselected.displayName)}
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
                    onClick={() => startVisit(c.id, c.displayName)}
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

      {/* Shared photo input: photoTargetLine decides where the upload lands. */}
      {!delivered && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => onPickPhotos(e.target.files)}
        />
      )}

      {/* ── Structured capture: one card per finding ───────────── */}
      {!delivered && !blobMode && (
        <section className="mt-5 space-y-3">
          <h2 className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>What you found</h2>
          {workingLines.map((line, idx) => {
            const linePhotos = (insp?.photos ?? []).filter((p) => p.lineId === line.id);
            return (
              <div key={line.id} className="bg-white rounded-xl border p-3 space-y-2" style={inputStyle}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Finding {idx + 1}</span>
                  <button type="button" aria-label="Remove finding line" onClick={() => removeLine(line.id)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {HOME_SYSTEMS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => patchLine(line.id, { areaKey: s.key }, true)}
                      className={"text-[11px] px-2 py-1 rounded-full border " + (line.areaKey === s.key ? "font-semibold text-white" : "bg-white text-muted-foreground")}
                      style={line.areaKey === s.key ? { background: "var(--hp-gold-deep)", borderColor: "var(--hp-gold-deep)" } : inputStyle}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className={inputCls}
                  style={inputStyle}
                  rows={2}
                  placeholder="What is going on here, like you'd explain it to the homeowner."
                  value={line.note}
                  onChange={(e) => patchLine(line.id, { note: e.target.value }, false)}
                  onBlur={() => persistLines(workingLines)}
                />
                <div className="flex flex-wrap gap-2">
                  {linePhotos.map((p) => (
                    <div key={p.fileKey} className="relative w-16 h-16 rounded-lg overflow-hidden border" style={inputStyle}>
                      <img src={p.url} alt={p.caption ?? "Finding photo"} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhotoM.mutate({ id: inspectionId, fileKey: p.fileKey })}
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                        aria-label="Remove photo"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { photoTargetLine.current = line.id; fileRef.current?.click(); }}
                    disabled={uploading}
                    className="w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground"
                    style={inputStyle}
                  >
                    <Camera className="w-4 h-4" />
                    <span className="text-[9px] mt-0.5">{uploading ? "…" : "Photos"}</span>
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border font-semibold"
            style={{ ...inputStyle, color: "var(--hp-ink)" }}
          >
            <Plus className="w-4 h-4" /> Add a finding
          </button>

          {/* General photos not tied to one finding */}
          {(insp?.photos ?? []).some((p) => !p.lineId) && (
            <div className="bg-white rounded-xl border p-3" style={inputStyle}>
              <p className="text-xs font-semibold text-muted-foreground mb-2">General photos</p>
              <div className="flex flex-wrap gap-2">
                {(insp?.photos ?? []).filter((p) => !p.lineId).map((p) => (
                  <div key={p.fileKey} className="relative w-16 h-16 rounded-lg overflow-hidden border" style={inputStyle}>
                    <img src={p.url} alt={p.caption ?? "Inspection photo"} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhotoM.mutate({ id: inspectionId, fileKey: p.fileKey })}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details className="bg-white rounded-xl border overflow-hidden" style={inputStyle}>
            <summary className="px-4 py-2.5 text-xs font-semibold cursor-pointer select-none text-muted-foreground">
              General notes (optional)
            </summary>
            <div className="px-3 pb-3">
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={3}
                placeholder="Anything that applies to the whole visit."
                value={notesDraft ?? insp?.techNotes ?? ""}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => {
                  if (notesDraft != null && notesDraft !== insp?.techNotes) {
                    notesM.mutate({ id: inspectionId, techNotes: notesDraft });
                  }
                }}
              />
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (notesDraft != null && notesDraft !== insp?.techNotes) {
                  notesM.mutate({ id: inspectionId, techNotes: notesDraft });
                }
                setGenerating(true);
                generateM.mutate({ id: inspectionId });
              }}
              disabled={
                generating ||
                status === "processing" ||
                ((insp?.photos?.length ?? 0) === 0 &&
                  !workingLines.some((l) => l.note.trim()) &&
                  !(notesDraft ?? insp?.techNotes))
              }
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

      {/* ── Legacy blob capture (rows started before finding lines) ── */}
      {!delivered && blobMode && (
        <>
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
                  onClick={() => { photoTargetLine.current = null; fileRef.current?.click(); }}
                  disabled={uploading}
                  className="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground"
                  style={inputStyle}
                >
                  <Camera className="w-5 h-5 mb-1" />
                  <span className="text-[10px]">{uploading ? "Uploading…" : "Add photos"}</span>
                </button>
              </div>
            </div>
          </section>

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
        </>
      )}

      {/* ── Draft review ───────────────────────────────────────── */}
      {reviewing && insp?.draft && (
        <section className="mt-6">
          <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
            The draft. Review it like dictation: fix anything, then approve.
          </h2>
          <DraftReviewEditor
            draft={insp.draft as ReviewDraft}
            onSave={(edited) =>
              updateDraftM.mutate({ id: inspectionId, summary: edited.summary, findings: edited.findings })
            }
            onApprove={() => approveM.mutate({ id: inspectionId })}
            approving={approveM.isPending}
            approveConfirmText="Send this mini roadmap? The customer sees it in their portal and gets the email right away."
          />
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
