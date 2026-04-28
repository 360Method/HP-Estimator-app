/**
 * PortalProjectDetail — customer-facing project page.
 * URL: /portal/projects/:id
 *
 * Shows the AI-generated investment range, scope summary, and two next-step
 * actions: proceed (opens scheduling for project commencement) or schedule
 * a walkthrough first (in-person scope confirmation).
 *
 * Public route by intent — the id is an opaque random token only the
 * homeowner has. Marks the estimate as viewed on first load.
 */

import { useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";

const HP_FOREST = "#1a2d24";
const HP_GOLD = "#c8892a";
const HP_CREAM = "#faf8f3";
const HP_TAUPE = "#6a6a62";
const HP_DIVIDER = "#e0dcc8";

const HP_LOGO =
  "https://handypioneers.com/wp-content/uploads/2023/06/HP-Logo-Transparent.png";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

export default function PortalProjectDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const { data, isLoading, refetch } = trpc.projectEstimator.getProject.useQuery(
    { id },
    { enabled: !!id },
  );

  const markViewed = trpc.projectEstimator.markViewed.useMutation();
  const markProceed = trpc.projectEstimator.markProceed.useMutation();
  const markWalkthrough = trpc.projectEstimator.markWalkthrough.useMutation();

  useEffect(() => {
    if (data && !data.viewedAt) {
      markViewed.mutate({ id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (isLoading) {
    return (
      <Shell>
        <p style={{ color: HP_TAUPE, fontStyle: "italic" }}>
          Loading your project…
        </p>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <h1 style={{ fontSize: "28px", margin: 0 }}>Project not found</h1>
        <p style={{ color: HP_TAUPE }}>
          This link may have expired. Please check your email or reach{" "}
          <a href="mailto:help@handypioneers.com" style={{ color: HP_GOLD }}>
            help@handypioneers.com
          </a>
          .
        </p>
      </Shell>
    );
  }

  // Status branches.
  const stillProcessing =
    data.status === "submitted" || data.status === "processing";
  const needsInfo = data.status === "needs_info";
  const needsReview = data.status === "needs_review";
  const delivered = data.status === "delivered";

  return (
    <Shell>
      <p
        style={{
          fontSize: "11px",
          letterSpacing: "2px",
          color: HP_GOLD,
          textTransform: "uppercase",
          margin: "0 0 12px",
        }}
      >
        Handy Pioneers · 360° Method
      </p>

      <h1
        style={{
          fontSize: "36px",
          lineHeight: 1.2,
          margin: "0 0 8px",
          fontWeight: "normal",
        }}
      >
        {data.serviceType}
      </h1>
      {data.propertyAddress && (
        <p style={{ color: HP_TAUPE, margin: "0 0 32px", fontSize: "15px" }}>
          {data.propertyAddress}
        </p>
      )}

      {stillProcessing && (
        <Card>
          <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "normal" }}>
            We're putting your range together.
          </h2>
          <p style={{ color: HP_TAUPE, margin: 0, lineHeight: 1.6 }}>
            Your details are with our team now. You'll receive an email the
            moment your investment range is ready — typically within forty-eight
            hours.
          </p>
        </Card>
      )}

      {needsInfo && (
        <Card>
          <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "normal" }}>
            Your Concierge will be in touch shortly.
          </h2>
          <p style={{ color: HP_TAUPE, margin: 0, lineHeight: 1.6 }}>
            We'd like a few additional details before we put together a thoughtful
            range for you. A member of our team is preparing those questions now
            and will reach out within one business day.
          </p>
        </Card>
      )}

      {needsReview && (
        <Card>
          <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "normal" }}>
            Your range is being finalized.
          </h2>
          <p style={{ color: HP_TAUPE, margin: 0, lineHeight: 1.6 }}>
            We're double-checking a few details to be sure your range is precise.
            You'll have it shortly.
          </p>
        </Card>
      )}

      {delivered && (
        <>
          {data.scopeSummary && (
            <section style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "16px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: HP_TAUPE,
                  margin: "0 0 16px",
                  fontWeight: 600,
                }}
              >
                Scope of Work
              </h2>
              <p
                style={{
                  fontSize: "17px",
                  lineHeight: 1.7,
                  color: HP_FOREST,
                  margin: 0,
                }}
              >
                {data.scopeSummary}
              </p>
            </section>
          )}

          {/* Investment range hero */}
          <section
            style={{
              padding: "32px",
              background: HP_FOREST,
              color: "white",
              borderRadius: "6px",
              marginBottom: "32px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                margin: "0 0 12px",
                color: HP_GOLD,
              }}
            >
              Investment Range
            </p>
            <p
              style={{
                fontSize: "36px",
                lineHeight: 1.2,
                margin: 0,
                fontWeight: 400,
              }}
            >
              {fmtMoney(data.rangeLow)}{" "}
              <span style={{ color: HP_GOLD, margin: "0 8px" }}>—</span>{" "}
              {fmtMoney(data.rangeHigh)}
            </p>
            <p
              style={{
                fontSize: "13px",
                marginTop: "12px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.6,
              }}
            >
              The range reflects a ±25% buffer for any site discovery during execution.
            </p>
          </section>

          {/* Inclusions */}
          {data.inclusionsMd && (
            <section style={{ marginBottom: "40px" }}>
              <pre
                style={{
                  fontFamily: "inherit",
                  fontSize: "15px",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  background: "white",
                  padding: "24px",
                  borderRadius: "6px",
                  border: `1px solid ${HP_DIVIDER}`,
                  margin: 0,
                }}
              >
                {data.inclusionsMd}
              </pre>
            </section>
          )}

          {/* Two-path CTA */}
          <section
            style={{
              padding: "32px",
              background: "white",
              borderRadius: "6px",
              border: `1px solid ${HP_DIVIDER}`,
              marginBottom: "32px",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "normal",
                margin: "0 0 8px",
              }}
            >
              Ready to take action
            </h2>
            <p
              style={{
                color: HP_TAUPE,
                margin: "0 0 24px",
                lineHeight: 1.6,
                fontSize: "14px",
              }}
            >
              Whether you're ready to move forward or would prefer we walk through
              the property first to confirm scope, we welcome either path.
            </p>

            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={async () => {
                  const result = await markProceed.mutateAsync({ id });
                  if (result?.schedulerUrl) {
                    window.location.href = result.schedulerUrl;
                  }
                  refetch();
                }}
                disabled={markProceed.isPending}
                style={{
                  background: HP_GOLD,
                  color: HP_FOREST,
                  border: "none",
                  padding: "16px 28px",
                  fontSize: "14px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                  flex: 1,
                  minWidth: "240px",
                }}
              >
                {markProceed.isPending ? "Opening…" : "Proceed with this project"}
              </button>

              <button
                onClick={async () => {
                  const result = await markWalkthrough.mutateAsync({ id });
                  if (result?.schedulerUrl) {
                    window.location.href = result.schedulerUrl;
                  }
                  refetch();
                }}
                disabled={markWalkthrough.isPending}
                style={{
                  background: "transparent",
                  color: HP_FOREST,
                  border: `1px solid ${HP_FOREST}`,
                  padding: "16px 28px",
                  fontSize: "14px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                  flex: 1,
                  minWidth: "240px",
                }}
              >
                {markWalkthrough.isPending
                  ? "Opening…"
                  : "Request a walkthrough first"}
              </button>
            </div>

            {data.proceedClickedAt && (
              <p
                style={{
                  marginTop: "16px",
                  color: HP_TAUPE,
                  fontSize: "13px",
                  fontStyle: "italic",
                }}
              >
                You've requested to proceed. Your Concierge will follow up shortly to coordinate scheduling.
              </p>
            )}
            {data.walkthroughRequestedAt && (
              <p
                style={{
                  marginTop: "16px",
                  color: HP_TAUPE,
                  fontSize: "13px",
                  fontStyle: "italic",
                }}
              >
                You've requested a walkthrough. Your Concierge will reach out to coordinate a time.
              </p>
            )}
          </section>
        </>
      )}

      {/* Photos uploaded */}
      {data.photos && data.photos.length > 0 && (
        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "16px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: HP_TAUPE,
              margin: "0 0 16px",
              fontWeight: 600,
            }}
          >
            Photos you shared
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "12px",
            }}
          >
            {data.photos.map((url: string, i: number) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block" }}
              >
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  style={{
                    width: "100%",
                    height: "120px",
                    objectFit: "cover",
                    borderRadius: "4px",
                    border: `1px solid ${HP_DIVIDER}`,
                  }}
                />
              </a>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: "28px",
        background: "white",
        borderRadius: "6px",
        border: `1px solid ${HP_DIVIDER}`,
        borderLeft: `3px solid ${HP_GOLD}`,
        marginBottom: "32px",
      }}
    >
      {children}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
          maxWidth: "720px",
          margin: "0 auto",
          padding: "56px 24px",
        }}
      >
        {children}
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
        Handy Pioneers · (360) 544-9858 ·{" "}
        <a href="mailto:help@handypioneers.com" style={{ color: HP_GOLD }}>
          help@handypioneers.com
        </a>
      </footer>
    </div>
  );
}
