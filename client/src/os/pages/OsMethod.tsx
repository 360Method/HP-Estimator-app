/**
 * OsMethod: the 360 Method hub (/os/method).
 *
 * The one page that makes the method clear as day for anyone who logs in:
 * why we do it, how we do it step by step (each step linked to its SOP),
 * and where every member sits in the journey right now.
 */
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Compass, BookOpen, ChevronRight, RefreshCw } from "lucide-react";
import { OsShell } from "../OsShell";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstimator } from "@/contexts/EstimatorContext";
import { markNavIntent } from "../navIntent";
import {
  THREE_SIXTY_METHOD_PHASES,
  METHOD_PHILOSOPHY,
  METHOD_ONE_LINER,
  SEASON_LABELS,
  currentSeason,
} from "@shared/threeSixtyMethod";
import { TIER_DEFINITIONS, ALL_TIERS } from "@shared/threeSixtyTiers";
import { MethodStepChip } from "@/components/threeSixty/MethodJourneyStrip";

const cardStyle = { borderColor: "var(--hp-hairline)" } as const;

export default function OsMethod() {
  const [, navigate] = useLocation();
  const { setActiveCustomer } = useEstimator();
  const { user } = useAuth();
  // enabled gate matches OsShell: never fire protected queries pre-auth.
  const rosterQ = trpc.threeSixty.journey.roster.useQuery(undefined, { enabled: !!user });
  const roster = rosterQ.data ?? [];
  const season = SEASON_LABELS[currentSeason()];

  function openClient(customerId: string) {
    setActiveCustomer(customerId, "direct");
    markNavIntent();
    navigate("/os/clients");
  }

  return (
    <OsShell active="/os/method">
      <div className="flex items-start gap-3">
        <Compass className="w-7 h-7 mt-1 shrink-0" style={{ color: "var(--hp-gold-deep)" }} />
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            The 360 Method
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{METHOD_ONE_LINER}</p>
        </div>
      </div>

      {/* ── Why we do it ───────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
          Why we do it
        </h2>
        <div className="bg-white rounded-xl border px-5 py-4 space-y-3" style={cardStyle}>
          {METHOD_PHILOSOPHY.why.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--hp-ink)" }}>
              {p}
            </p>
          ))}
          <ul className="space-y-1.5 pt-1">
            {METHOD_PHILOSOPHY.principles.map((p, i) => (
              <li key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--hp-ink)" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--hp-gold-deep)" }} />
                {p}
              </li>
            ))}
          </ul>
          <div
            className="rounded-lg px-4 py-3 text-sm italic"
            style={{ background: "rgba(200,146,42,0.07)", color: "var(--hp-ink)" }}
          >
            What we promise the member: "{METHOD_PHILOSOPHY.promise}"
          </div>
          <p className="text-xs text-muted-foreground">
            Delivered through the Proactive Path membership:{" "}
            {ALL_TIERS.map((t) => TIER_DEFINITIONS[t].label).join(", ")}. Members always see those
            names, never internal codes.
          </p>
        </div>
      </section>

      {/* ── How we do it ───────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
          How we do it: 3 phases, 9 steps
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Steps 2 through 6 repeat as a seasonal cycle four times a year. Phase 3 opens in
          membership year two. Every step has an SOP you can open right here.
        </p>
        <div className="space-y-3">
          {THREE_SIXTY_METHOD_PHASES.map((phase, idx) => (
            <div key={phase.id} className="bg-white rounded-xl border overflow-hidden" style={cardStyle}>
              <div className="px-4 py-2.5 border-b flex items-center gap-2" style={cardStyle}>
                <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                  Phase {idx + 1}: {phase.name}
                </span>
                <span className="text-xs text-muted-foreground">{phase.subtitle}</span>
              </div>
              <div className="divide-y" style={cardStyle}>
                {phase.steps.map((step) => (
                  <div key={step.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] mr-2"
                            style={{ background: "rgba(200,146,42,0.14)", color: "var(--hp-gold-deep)" }}
                          >
                            {step.number}
                          </span>
                          {step.name}
                          {step.cadence === "seasonal" && (
                            <RefreshCw className="inline w-3 h-3 ml-1.5 text-muted-foreground" />
                          )}
                          {step.yearTwoPlus && (
                            <span className="text-[10px] font-normal text-muted-foreground ml-1.5">year two</span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: "var(--hp-ink)" }}>
                          {step.delivers}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{step.staffWhy}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">In this app:</span> {step.staffHow}
                        </p>
                      </div>
                      <Link href={`/os/d/${step.sopDocId}`}>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border cursor-pointer hover:bg-black/[0.02] shrink-0"
                          style={{ borderColor: "var(--hp-hairline)", color: "var(--hp-gold-deep)" }}
                        >
                          <BookOpen className="w-3 h-3" /> SOP
                        </span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Members right now ──────────────────────────────────── */}
      <section className="mt-6 mb-8">
        <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>
          Members right now · {season}
        </h2>
        {rosterQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : roster.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border" style={cardStyle}>
            <Compass className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              No members yet. The first baseline walkthrough starts the first journey.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border divide-y" style={cardStyle}>
            {roster.map((m) => (
              <button
                key={m.membershipId}
                type="button"
                onClick={() => openClient(m.customerId)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                    {m.customerName || "Unnamed member"}
                    {m.membershipStatus === "paused" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-2">paused</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {m.tierLabel}
                    {m.journey.membershipYear > 1 && ` · Year ${m.journey.membershipYear}`}
                    {" · "}
                    {m.journey.steps.find((s) => s.key === m.journey.currentStepKey)?.detail}
                  </div>
                </div>
                <MethodStepChip journey={m.journey} />
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>
    </OsShell>
  );
}
