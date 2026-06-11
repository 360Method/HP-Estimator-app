/**
 * OsRoom — the business rooms inside the OS shell: Pipeline, Clients, Money,
 * Schedule, Inbox. Phase 2 of the HP-OS rebuild.
 *
 * The room mounts the SAME section machinery Home wires (estimate builder,
 * invoices, client list, scheduling, unified inbox) so nothing revenue
 * critical is reimplemented; only the chrome changes. The room in the URL
 * picks the rail highlight and the section the room opens on; everything the
 * user does after that drives the estimator context exactly like the old
 * shell. MetricsBar stays: it carries global search, the New menu, the
 * builder tabs, and the margin totals.
 */
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useRoute } from "wouter";
import NotFound from "@/pages/NotFound";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { useOpportunitySSE } from "@/hooks/useOpportunitySSE";
import { calcPhase, calcTotals } from "@/lib/calc";
import MetricsBar from "@/components/MetricsBar";
import NewLeadBanner from "@/components/NewLeadBanner";
import type { AppSection } from "@/lib/types";
import { OsShell } from "../OsShell";
import { consumeNavIntent } from "../navIntent";

const OsClientProfile = lazy(() => import("../OsClientProfile"));
const OsPipelineList = lazy(() => import("../OsPipelineList"));
const SalesSection = lazy(() => import("@/components/sections/SalesSection"));
const CalculatorSection = lazy(() => import("@/components/sections/CalculatorSection"));
const EstimateSection = lazy(() => import("@/components/sections/EstimateSection"));
const JobDetailsSection = lazy(() => import("@/components/sections/JobDetailsSection"));
const InvoiceSection = lazy(() => import("@/components/sections/InvoiceSection"));
const PresentSection = lazy(() => import("@/components/sections/PresentSection"));
const CustomersListPage = lazy(() => import("@/pages/CustomersListPage"));
const JobsListPage = lazy(() => import("@/pages/JobsListPage"));
const EstimatorDashboard = lazy(() => import("@/pages/EstimatorDashboard"));
const SchedulePage = lazy(() => import("@/pages/SchedulePage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const ReportingPage = lazy(() => import("@/pages/ReportingPage"));
const MarketingPage = lazy(() => import("@/pages/MarketingPage"));
const LeadsPage = lazy(() => import("@/pages/LeadsPage"));
const ThreeSixtyPage = lazy(() => import("@/pages/ThreeSixtyPage"));
const FinancialsPage = lazy(() => import("@/pages/FinancialsPage"));
const QuickBooksPage = lazy(() => import("@/pages/QuickBooksPage"));
const WorkflowPage = lazy(() => import("@/pages/WorkflowPage"));
const OperationsPage = lazy(() => import("@/pages/OperationsPage"));

/** Room slug -> the top-level section the room opens on. */
const SECTION_BY_ROOM: Record<string, AppSection> = {
  pipeline: "pipeline",
  clients: "customers",
  money: "financials",
  schedule: "schedule",
  inbox: "inbox",
};

function SectionLoader() {
  return (
    <div className="py-10">
      <div className="h-24 rounded-lg border border-border bg-muted/40 animate-pulse" />
    </div>
  );
}

export default function OsRoom() {
  const [, params] = useRoute("/os/:room");
  const room = params?.room ?? "";
  const roomSection = SECTION_BY_ROOM[room];

  if (!roomSection) return <NotFound />;
  return <Room key={room} room={room} roomSection={roomSection} />;
}

/**
 * Exported: ClientDetailPage (/admin/clients/:id) renders the Clients room
 * directly after priming the active customer in context.
 */
export function Room({ room, roomSection }: { room: string; roomSection: AppSection }) {
  const { state, navigateToTopLevel } = useEstimator();
  useDbSync(true);
  useOpportunitySSE(true);

  // Entering a room (or switching rooms) lands on its top-level section.
  // After that the user roams freely; the section machinery drives itself.
  // Deep links (the notification bell) mark nav intent after dispatching
  // their own context state; honoring it means skipping the reset once.
  useEffect(() => {
    if (consumeNavIntent()) return;
    navigateToTopLevel(roomSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const totals = useMemo(() => {
    const phaseResults = state.phases.map((p) => calcPhase(p, state.global));
    return calcTotals(phaseResults);
  }, [state.phases, state.global]);

  return (
    <OsShell active={`/os/${room}`} wide flush>
      <NewLeadBanner />
      {/* MetricsBar ships sticky top-0; below the OS header it must stick at
          the header's height instead or it slides underneath it. */}
      <div className="[&>div]:!top-[57px]">
        <MetricsBar totals={totals} />
      </div>
      <Suspense fallback={<SectionLoader />}>
        {state.activeSection === "dashboard" ? (
          <EstimatorDashboard />
        ) : state.activeSection === "customers" ? (
          <CustomersListPage />
        ) : state.activeSection === "jobs" ? (
          <JobsListPage />
        ) : state.activeSection === "pipeline" ? (
          <OsPipelineList />
        ) : state.activeSection === "workflow" ? (
          <WorkflowPage />
        ) : state.activeSection === "operations" ? (
          <OperationsPage />
        ) : state.activeSection === "schedule" ? (
          <SchedulePage />
        ) : state.activeSection === "inbox" ? (
          <InboxPage />
        ) : state.activeSection === "reporting" ? (
          <ReportingPage />
        ) : state.activeSection === "marketing" ? (
          <MarketingPage />
        ) : state.activeSection === "leads" || state.activeSection === "requests" ? (
          <LeadsPage />
        ) : state.activeSection === "three-sixty" ? (
          <ThreeSixtyPage />
        ) : state.activeSection === "financials" ? (
          <FinancialsPage />
        ) : state.activeSection === "quickbooks" ? (
          <QuickBooksPage />
        ) : (
          <div className="container py-6 max-w-4xl">
            {state.activeSection === "customer" && <OsClientProfile />}
            {/* The simple flow: opening an opportunity lands straight in
                Scope/Price; the old Command tab is gone. */}
            {state.activeSection === "opp-details" && <CalculatorSection />}
            {state.activeSection === "sales" && <SalesSection />}
            {state.activeSection === "calculator" && <CalculatorSection />}
            {state.activeSection === "estimate" && <EstimateSection />}
            {state.activeSection === "job-details" && <JobDetailsSection />}
            {state.activeSection === "invoice" && <InvoiceSection />}
          </div>
        )}
        {state.activeSection === "present" && <PresentSection />}
      </Suspense>
    </OsShell>
  );
}
