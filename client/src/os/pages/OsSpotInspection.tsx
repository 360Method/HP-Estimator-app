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
import { Camera, Check, ChevronRight, FileText, Trash2, Wand2 } from "lucide-react";
import { OsShell } from "../OsShell";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { MethodContextBanner } from "@/components/threeSixty/MethodContextBanner";
import { DraftReviewEditor, type ReviewDraft } from "../spot/DraftReviewEditor";

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
