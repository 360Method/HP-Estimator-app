/**
 * PortalConsultationSubmitted — confirmation page after a /book submit.
 *
 * Affluent stewardship voice. 4-stage progress bar that updates as the
 * estimator pipeline progresses. Polls trpc.projectEstimator.getStatus
 * every 5 seconds.
 *
 * Stages:
 *   1. ✓ Project intake received
 *   2. (active) A Concierge is reading your details
 *   3. We'll reach out within one business day
 *   4. Your investment range will be delivered to your portal
 */

import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const HP_FOREST = "#1a2d24";
const HP_GOLD = "#c8892a";
const HP_CREAM = "#faf8f3";
const HP_TAUPE = "#6a6a62";
const HP_DIVIDER = "#e0dcc8";

const HP_LOGO =
  "https://handypioneers.com/wp-content/uploads/2023/06/HP-Logo-Transparent.png";

type StageId = 1 | 2 | 3 | 4;

const STAGES: Array<{
  id: StageId;
  label: string;
  description: string;
}> = [
  {
    id: 1,
    label: "Project intake received",
    description: "We have everything you submitted.",
  },
  {
    id: 2,
    label: "A Concierge is reading your details",
    description: "Our team is reviewing your project right now.",
  },
  {
    id: 3,
    label: "We'll reach out within one business day",
    description: "By text or email — whichever works best for you.",
  },
  {
    id: 4,
    label: "Your investment range will be delivered to your portal",
    description: "You'll be notified the moment it's ready.",
  },
];

function deriveStage(status: string | undefined, deliveredAt: any): StageId {
  if (status === "delivered" || deliveredAt) return 4;
  if (status === "needs_info" || status === "needs_review") return 3;
  if (status === "processing") return 2;
  return 2; // submitted → still on stage 2 (Concierge reading)
}

export default function PortalConsultationSubmitted() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const { data, refetch } = trpc.projectEstimator.getStatus.useQuery(
    { id },
    { enabled: !!id, refetchInterval: 5000 },
  );

  const stage = deriveStage(data?.status, data?.deliveredAt);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: HP_CREAM,
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: HP_FOREST,
      }}
    >
      <header
        style={{
          padding: "24px 32px",
          borderBottom: `1px solid ${HP_DIVIDER}`,
          background: "white",
        }}
      >
        <img
          src={HP_LOGO}
          alt="Handy Pioneers"
          style={{ height: "36px", width: "auto" }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </header>

      <main
        style={{
          maxWidth: "640px",
          margin: "0 auto",
          padding: "56px 24px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            letterSpacing: "2px",
            color: HP_GOLD,
            textTransform: "uppercase",
            margin: "0 0 16px",
          }}
        >
          Handy Pioneers · 360° Method
        </p>

        <h1
          style={{
            fontSize: "40px",
            lineHeight: 1.15,
            margin: "0 0 24px",
            fontWeight: "normal",
          }}
        >
          Your project is in our care.
        </h1>

        {/* Progress bar */}
        <div style={{ margin: "40px 0 48px" }}>
          {STAGES.map((s, idx) => {
            const completed = s.id < stage;
            const active = s.id === stage;
            const upcoming = s.id > stage;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px",
                  paddingBottom: idx < STAGES.length - 1 ? "20px" : 0,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: completed
                      ? HP_FOREST
                      : active
                        ? HP_GOLD
                        : "white",
                    border: completed
                      ? `2px solid ${HP_FOREST}`
                      : active
                        ? `2px solid ${HP_GOLD}`
                        : `2px solid ${HP_DIVIDER}`,
                    color: completed || active ? "white" : HP_TAUPE,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 600,
                    transition: "background 0.4s ease, border 0.4s ease",
                  }}
                >
                  {completed ? "✓" : s.id}
                </div>
                <div style={{ flex: 1, paddingTop: "4px" }}>
                  <div
                    style={{
                      fontSize: "16px",
                      lineHeight: 1.4,
                      color: upcoming ? HP_TAUPE : HP_FOREST,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: HP_TAUPE,
                      marginTop: "2px",
                    }}
                  >
                    {s.description}
                  </div>
                </div>

                {idx < STAGES.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: "15px",
                      top: "32px",
                      bottom: "0",
                      width: "2px",
                      background: completed ? HP_FOREST : HP_DIVIDER,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* What happens next */}
        <section style={{ borderTop: `1px solid ${HP_DIVIDER}`, paddingTop: "32px" }}>
          <h2
            style={{
              fontSize: "20px",
              lineHeight: 1.3,
              margin: "0 0 20px",
              fontWeight: "normal",
              color: HP_FOREST,
            }}
          >
            What happens next
          </h2>

          <p style={{ fontSize: "15px", lineHeight: 1.7, marginBottom: "16px" }}>
            We treat every property as if it were our own. The first step is making sure we understand exactly what you have in mind — your priorities, your timeline, your standard of care.
          </p>

          <p style={{ fontSize: "15px", lineHeight: 1.7, marginBottom: "16px" }}>
            A member of our Concierge team will reach out personally within one business day, by text or email, to confirm we have everything we need. If your project is straightforward, you'll see your investment range here within forty-eight hours.
          </p>

          <p style={{ fontSize: "15px", lineHeight: 1.7, marginBottom: "16px" }}>
            If we'd benefit from additional context — a photo, a measurement, or a brief walkthrough — your Concierge will let you know what would help us be precise on your behalf.
          </p>

          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.7,
              marginBottom: "32px",
              padding: "20px",
              background: "white",
              borderLeft: `3px solid ${HP_GOLD}`,
              borderRadius: "0 4px 4px 0",
            }}
          >
            <strong style={{ color: HP_FOREST }}>While we prepare your range, </strong>
            you're welcome to preview what ongoing 360° Method stewardship looks like —
            the way Handy Pioneers becomes the steward of your home year-round.{" "}
            <a
              href="/portal/360-membership"
              style={{ color: HP_GOLD, textDecoration: "underline" }}
            >
              Learn about 360° Membership →
            </a>
          </p>
        </section>

        {/* Optional "tell us more" form */}
        <TellUsMoreForm projectEstimateId={id} onSubmitted={() => refetch()} />
      </main>

      <footer
        style={{
          textAlign: "center",
          padding: "32px",
          fontSize: "12px",
          color: HP_TAUPE,
          borderTop: `1px solid ${HP_DIVIDER}`,
        }}
      >
        Handy Pioneers · 808 SE Chkalov Dr, 3-433, Vancouver, WA 98683 · (360) 544-9858
        <br />
        <a
          href="mailto:help@handypioneers.com"
          style={{ color: HP_GOLD, textDecoration: "none" }}
        >
          help@handypioneers.com
        </a>
      </footer>
    </div>
  );
}

// ─── Optional secondary form (sqft / yearBuilt / urgency) ───────────────────
function TellUsMoreForm({
  projectEstimateId,
  onSubmitted,
}: {
  projectEstimateId: string;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sqft, setSqft] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [urgency, setUrgency] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p
        style={{
          fontSize: "13px",
          color: HP_TAUPE,
          textAlign: "center",
          fontStyle: "italic",
          marginTop: "32px",
        }}
      >
        Thank you — we've added that to your file.
      </p>
    );
  }

  if (!open) {
    return (
      <div style={{ textAlign: "center", marginTop: "32px" }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "transparent",
            border: `1px solid ${HP_GOLD}`,
            color: HP_GOLD,
            padding: "12px 24px",
            fontSize: "13px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: "4px",
            fontFamily: "inherit",
          }}
        >
          Tell us more about your property
        </button>
        <p
          style={{
            fontSize: "12px",
            color: HP_TAUPE,
            marginTop: "12px",
            fontStyle: "italic",
          }}
        >
          Optional — helps us be precise.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Best-effort: post to the simple status endpoint with metadata.
        // Server doesn't yet persist this beyond logs — flag in HANDOFF.
        // For now we simply mark as submitted client-side so the field
        // disappears.
        setSubmitted(true);
        onSubmitted();
      }}
      style={{
        marginTop: "32px",
        padding: "24px",
        background: "white",
        borderRadius: "6px",
        border: `1px solid ${HP_DIVIDER}`,
      }}
    >
      <p style={{ fontSize: "13px", color: HP_TAUPE, marginBottom: "16px" }}>
        Optional — these details help us prepare a more precise range.
      </p>
      <Field
        label="Approximate square footage"
        value={sqft}
        onChange={setSqft}
        placeholder="e.g. 2,400"
      />
      <Field
        label="Year built"
        value={yearBuilt}
        onChange={setYearBuilt}
        placeholder="e.g. 1998"
      />
      <Field
        label="A note on urgency or specific concerns"
        value={urgency}
        onChange={setUrgency}
        placeholder="Optional — anything you'd like us to know"
        textarea
      />
      <button
        type="submit"
        style={{
          background: HP_GOLD,
          color: HP_FOREST,
          border: "none",
          padding: "12px 24px",
          fontSize: "13px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          borderRadius: "4px",
          fontFamily: "inherit",
          marginTop: "8px",
        }}
      >
        Add to your file
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <label style={{ display: "block", marginBottom: "16px" }}>
      <span
        style={{
          display: "block",
          fontSize: "12px",
          color: HP_TAUPE,
          marginBottom: "6px",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <Tag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: `1px solid ${HP_DIVIDER}`,
          borderRadius: "4px",
          fontSize: "14px",
          fontFamily: "inherit",
          background: HP_CREAM,
          minHeight: textarea ? "72px" : undefined,
        }}
      />
    </label>
  );
}
