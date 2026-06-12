/**
 * OsPropertyStep — one 360 Method step at one property, as a real page:
 * /os/property/:propertyId/step/:stepKey. Loads the property (for the
 * customer), the property-scoped journey, and renders the step's panel
 * with prev/next across the nine steps. Back lands in the client room via
 * the nav-intent handshake (the OsSpotInspection pattern).
 */
import { Suspense } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import NotFound from "@/pages/NotFound";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import {
  THREE_SIXTY_METHOD_STEPS,
  getThreeSixtyStepByKey,
  type ThreeSixtyStepKey,
} from "@shared/threeSixtyMethod";
import StepInspections from "@/components/threeSixty/steps/StepInspections";
import StepHistory from "@/components/threeSixty/steps/StepHistory";
import StepRoadmaps from "@/components/threeSixty/steps/StepRoadmaps";
import StepSchedule from "@/components/threeSixty/steps/StepSchedule";
import StepExecute from "@/components/threeSixty/steps/StepExecute";
import StepSystems from "@/components/threeSixty/steps/StepSystems";
import StepProjects from "@/components/threeSixty/steps/StepProjects";
import StepScoreboard from "@/components/threeSixty/steps/StepScoreboard";
import { OsShell } from "../OsShell";
import { markNavIntent } from "../navIntent";

export default function OsPropertyStep() {
  const [, params] = useRoute("/os/property/:propertyId/step/:stepKey");
  const [, navigate] = useLocation();
  const { setActiveCustomer, setActiveOpportunity, setSection } = useEstimator();

  const propertyId = params?.propertyId ?? "";
  const stepKey = (params?.stepKey ?? "") as ThreeSixtyStepKey;
  const step = getThreeSixtyStepByKey(stepKey);

  const propQ = trpc.properties.get.useQuery({ id: propertyId }, { enabled: !!propertyId && !!step });
  const customerId = propQ.data?.customerId ?? "";
  const journeyQ = trpc.threeSixty.journey.forProperty.useQuery(
    { customerId, propertyId },
    { enabled: !!customerId },
  );

  if (!step || !propertyId) return <NotFound />;

  const property = propQ.data ?? null;
  const j = journeyQ.data ?? null;
  const stepState = j?.journey.steps.find((s) => s.key === stepKey) ?? null;
  const items = j?.stepContents?.[stepKey] ?? [];

  const backToClient = () => {
    if (customerId) {
      setActiveCustomer(customerId);
      markNavIntent();
    }
    navigate("/os/clients");
  };
  const openOpportunity = (oppId: string) => {
    setActiveCustomer(customerId);
    setActiveOpportunity(oppId);
    setSection("opp-details");
    markNavIntent();
    navigate("/os/clients");
  };

  const stepIdx = THREE_SIXTY_METHOD_STEPS.findIndex((s) => s.key === stepKey);
  const prevStep = stepIdx > 0 ? THREE_SIXTY_METHOD_STEPS[stepIdx - 1] : null;
  const nextStep = stepIdx < THREE_SIXTY_METHOD_STEPS.length - 1 ? THREE_SIXTY_METHOD_STEPS[stepIdx + 1] : null;

  const spotHref = `/os/spot/new?customerId=${encodeURIComponent(customerId)}&propertyId=${encodeURIComponent(propertyId)}`;

  return (
    <OsShell active="/os/clients">
      <button
        type="button"
        onClick={backToClient}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline no-print"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {j?.customerName || "Client"}
      </button>

      {/* ── Step header ─────────────────────────────────────────── */}
      <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>
            Step {step.number} of 9{property ? ` · ${property.label}` : ""}
          </p>
          <h1 className="hp-serif text-2xl leading-tight" style={{ color: "var(--hp-ink)" }}>
            {step.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">{step.delivers}</p>
        </div>
        {stepState && (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-600 no-print">
            {stepState.detail}
          </span>
        )}
      </div>

      {/* ── Step panel ──────────────────────────────────────────── */}
      <div className="mt-5">
        {journeyQ.isLoading || propQ.isLoading ? (
          <div className="h-40 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />
        ) : !j ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Could not load this property's journey.</p>
        ) : (
          <Suspense fallback={null}>
            {stepKey === "baseline" && (
              <StepInspections
                items={items}
                emptyText="No baseline on record yet. The 360 scan starts everything."
              />
            )}
            {stepKey === "inspect" && (
              <StepInspections
                items={items}
                emptyText="No inspections at this property yet."
                actionHref={spotHref}
                actionLabel="Start a spot inspection"
              />
            )}
            {stepKey === "track" && j.stepContents && (
              <StepHistory
                stepContents={j.stepContents}
                propertyLabel={property?.label ?? "Home"}
                customerName={j.customerName}
              />
            )}
            {stepKey === "prioritize" && <StepRoadmaps customerId={customerId} propertyId={propertyId} />}
            {stepKey === "schedule" && <StepSchedule customerId={customerId} propertyId={propertyId} />}
            {stepKey === "execute" && (
              <StepExecute customerId={customerId} propertyId={propertyId} onOpenOpportunity={openOpportunity} />
            )}
            {stepKey === "preserve" && (
              <StepSystems
                customerId={customerId}
                propertyId={propertyId}
                membershipId={(j as any).property?.membershipId ?? null}
              />
            )}
            {stepKey === "upgrade" && (
              <StepProjects items={items} customerId={customerId} onOpenOpportunity={openOpportunity} />
            )}
            {stepKey === "scale" && <StepScoreboard customerId={customerId} propertyId={propertyId} />}
          </Suspense>
        )}
      </div>

      {/* ── Prev / next ─────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between border-t pt-3 no-print" style={{ borderColor: "var(--hp-hairline)" }}>
        {prevStep ? (
          <button
            type="button"
            onClick={() => navigate(`/os/property/${propertyId}/step/${prevStep.key}`)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Step {prevStep.number}: {prevStep.name}
          </button>
        ) : <span />}
        {nextStep ? (
          <button
            type="button"
            onClick={() => navigate(`/os/property/${propertyId}/step/${nextStep.key}`)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Step {nextStep.number}: {nextStep.name} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : <span />}
      </div>
    </OsShell>
  );
}
