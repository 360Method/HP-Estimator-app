/**
 * PortalRoadmapSubmitted — confirmation page after a homeowner uploads an
 * inspection report through the Roadmap Generator on handypioneers.com.
 *
 * Route: /portal/roadmap/submitted/:id
 *
 * Public (no portal session required). The marketing site posts the multipart
 * upload to /api/roadmap-generator/submit, receives `confirmationUrl` in the
 * 202 response, and redirects the homeowner here. We poll
 * priorityTranslation.getPublicStatus every 5s to advance the progress bar
 * until the email lands.
 *
 * Voice rules: stewardship / standard-of-care / proactive / concierge —
 * never the forbidden vocabulary list.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { CheckCircle2, Clock, Loader2, Mail, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

type Stage = {
  key: "received" | "reviewing" | "preparing" | "delivered";
  label: string;
};

const STAGES: Stage[] = [
  { key: "received", label: "Report received" },
  { key: "reviewing", label: "Reviewing with our standard-of-care framework" },
  { key: "preparing", label: "Your personalized 360° Roadmap is being prepared" },
  { key: "delivered", label: "Delivered to your inbox" },
];

function activeStageIndex(status: string | undefined, deliveredAt: Date | string | null | undefined): number {
  if (deliveredAt || status === "completed") return 3;
  if (status === "processing") return 1;
  if (status === "submitted") return 0;
  if (status === "failed") return 1;
  return 0;
}

export default function PortalRoadmapSubmitted() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const { data, isLoading, isError, error } = trpc.priorityTranslation.getPublicStatus.useQuery(
    { id },
    {
      enabled: id.length > 0,
      refetchInterval: (q: any) => {
        const s = (q.state.data as any)?.status;
        if (s === "completed" || s === "failed") return false;
        return 5000;
      },
      refetchOnWindowFocus: true,
    },
  );

  // Show the first stage immediately on mount to avoid a flash of "loading…"
  // before the first poll lands.
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    setBootstrapped(true);
  }, []);

  const status = data?.status;
  const deliveredAt = data?.deliveredAt;
  const failed = status === "failed";
  const idx = activeStageIndex(status, deliveredAt);

  return (
    <div className="min-h-screen" style={{ background: "#faf8f3" }}>
      {/* Top bar */}
      <header className="border-b" style={{ borderColor: "#e0dcc8", background: "white" }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={HP_LOGO} alt="Handy Pioneers" className="h-8" />
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#c8892a" }}
          >
            360° Method
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-3"
          style={{ color: "#c8892a" }}
        >
          Submission confirmed
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold leading-tight mb-3"
          style={{ color: "#1a2d24", fontFamily: "Georgia, serif" }}
        >
          Your inspection report is in our care.
        </h1>
        <p className="text-base text-muted-foreground mb-10" style={{ color: "#5a5e54" }}>
          Reference: <span className="font-mono text-xs">{id || "—"}</span>
        </p>

        {/* Status bar */}
        <section
          className="rounded-xl p-6 sm:p-8 mb-10 border"
          style={{ background: "white", borderColor: "#e0dcc8" }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#1a2d24" }}>
              Where your roadmap is
            </h2>
            {!failed && idx < 3 && bootstrapped && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "#c8892a" }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Updating live</span>
              </div>
            )}
          </div>

          <ol className="space-y-4">
            {STAGES.map((stage, i) => {
              const isComplete = !failed && i < idx;
              const isActive = !failed && i === idx;
              const isPending = failed ? i > 0 : i > idx;
              return (
                <li key={stage.key} className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                    style={{
                      background: isComplete ? "#1a2d24" : isActive ? "#c8892a" : "#e0dcc8",
                      color: isComplete || isActive ? "white" : "#8a8a82",
                    }}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isActive ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-semibold">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p
                      className="text-sm font-medium"
                      style={{
                        color: isPending ? "#8a8a82" : "#1a2d24",
                      }}
                    >
                      {stage.label}
                      {isActive && i === 1 ? (
                        <span className="text-xs font-normal ml-2" style={{ color: "#8a8a82" }}>
                          (~60–90 seconds)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {failed && (
            <div
              className="mt-6 rounded-lg p-4 flex gap-3 items-start"
              style={{ background: "#fef6e7", border: "1px solid #f0d8a8" }}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#c8892a" }} />
              <div className="text-sm" style={{ color: "#5a4a14" }}>
                <p className="font-semibold mb-1">A member of our Concierge team is taking this one by hand.</p>
                <p>
                  Our review needs a closer look than the usual flow. We've been notified and will
                  follow up at the email you provided within one business day.
                </p>
              </div>
            </div>
          )}

          {idx === 3 && !failed && (
            <div
              className="mt-6 rounded-lg p-4 flex gap-3 items-start"
              style={{ background: "#eef5ee", border: "1px solid #cfe3cf" }}
            >
              <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#1a2d24" }} />
              <div className="text-sm" style={{ color: "#1a2d24" }}>
                <p className="font-semibold mb-1">Your roadmap is in your inbox.</p>
                <p>
                  Look for an email from <strong>noreply@handypioneers.com</strong> with your
                  personalized 360° Priority Roadmap PDF and a private link to your portal.
                  If it isn't visible within a few minutes, please check your spam folder.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* What happens next */}
        <section className="mb-12">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.18em] mb-5"
            style={{ color: "#c8892a" }}
          >
            What happens next
          </h2>
          <div className="space-y-5 text-base leading-relaxed" style={{ color: "#1a2d24" }}>
            <p>
              We're reviewing your home's condition through the lens of our 360° Method —
              the same standard-of-care framework our Consultants apply during an on-site
              Baseline. Every finding is weighed for cascade risk, sequencing, and how it
              fits into the broader story of your property.
            </p>
            <p>
              Within a few minutes, you'll receive a personalized roadmap to your email
              with prioritized findings, contextual recommendations, and an estimated
              investment range for each item. The PDF is yours to keep, and a private
              portal link travels with it so the roadmap stays alongside your home's
              living health record.
            </p>
            <p>
              A member of our Concierge team will reach out within one business day to
              walk you through the roadmap and answer any questions — no pressure, no
              upsell. The goal is simple: make sure you understand what your inspection
              actually said, and what stewardship of your property looks like from here.
            </p>
            <p>
              While you wait, you can preview what a proactive partnership with Handy
              Pioneers looks like at our{" "}
              <Link
                href="/portal/360-membership"
                className="underline font-medium"
                style={{ color: "#c8892a" }}
              >
                360° Method membership page
              </Link>{" "}
              — it's how most of our Roadmap recipients eventually choose to keep their
              home in continuous care.
            </p>
          </div>
        </section>

        {/* Soft CTA — optional follow-up form */}
        <section
          className="rounded-xl p-6 sm:p-8 border"
          style={{ background: "white", borderColor: "#e0dcc8" }}
        >
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: "#1a2d24", fontFamily: "Georgia, serif" }}
          >
            Tell us more about your home
          </h3>
          <p className="text-sm mb-5" style={{ color: "#5a5e54" }}>
            Optional — sharing a few more details helps our Concierge team give you a
            more contextual conversation when we reach out. Skip this if you'd rather
            wait for the roadmap.
          </p>
          <a
            href="https://handypioneers.com/about-your-home"
            className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider px-5 py-3 rounded-md transition-colors"
            style={{
              background: "#1a2d24",
              color: "white",
            }}
          >
            Share details about my home →
          </a>
        </section>

        {/* Loading / error states */}
        {isLoading && !data && (
          <div className="text-center mt-10 text-sm" style={{ color: "#8a8a82" }}>
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Loading status…
          </div>
        )}
        {isError && (
          <div
            className="mt-10 rounded-lg p-4 text-sm"
            style={{ background: "#fef6e7", border: "1px solid #f0d8a8", color: "#5a4a14" }}
          >
            <p className="font-semibold mb-1">We couldn't pull a live status update.</p>
            <p>
              Your submission was received. The roadmap email will still arrive — if it
              doesn't land within 30 minutes, please reach out at{" "}
              <a href="mailto:help@handypioneers.com" className="underline">
                help@handypioneers.com
              </a>
              .
              {error?.message ? (
                <span className="block text-xs mt-2 font-mono opacity-60">{error.message}</span>
              ) : null}
            </p>
          </div>
        )}

        <p className="text-xs text-center mt-12" style={{ color: "#8a8a82" }}>
          Questions any time —{" "}
          <a href="mailto:help@handypioneers.com" style={{ color: "#c8892a" }}>
            help@handypioneers.com
          </a>
        </p>
      </main>
    </div>
  );
}
