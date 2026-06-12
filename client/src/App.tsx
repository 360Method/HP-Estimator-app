import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import type { ComponentType } from "react";

// ── GA4 helpers ───────────────────────────────────────────────────────────────
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export function trackPageview(path: string) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
    });
  }
}

export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
}
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { EstimatorProvider } from "./contexts/EstimatorContext";
import { PortalProvider } from "./contexts/PortalContext";

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
    Loading...
  </div>
);

const DataMigrationPage = lazy(() => import("./pages/DataMigrationPage"));

// Booking wizard (public)
const BookingWizard = lazy(() => import("./pages/book/BookingWizard"));

// Portal pages
const PortalHome = lazy(() => import("./pages/portal/PortalHome"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalAppointments = lazy(() => import("./pages/portal/PortalAppointments"));
const PortalInvoices = lazy(() => import("./pages/portal/PortalInvoices"));
const PortalInvoiceDetail = lazy(() => import("./pages/portal/PortalInvoiceDetail"));
const PortalEstimates = lazy(() => import("./pages/portal/PortalEstimates"));
const PortalEstimateDetail = lazy(() => import("./pages/portal/PortalEstimateDetail"));
const PortalGallery = lazy(() => import("./pages/portal/PortalGallery"));
const PortalDocuments = lazy(() => import("./pages/portal/PortalDocuments"));
const PortalWallet = lazy(() => import("./pages/portal/PortalWallet"));
const PortalReferral = lazy(() => import("./pages/portal/PortalReferral"));
const PortalMessages = lazy(() => import("./pages/portal/PortalMessages"));
const PortalCommunicationThread = lazy(() => import("./pages/portal/PortalCommunicationThread"));
const PortalRequest = lazy(() => import("./pages/portal/PortalRequest"));
const PortalJobDetail = lazy(() => import("./pages/portal/PortalJobDetail"));
const PortalJobComplete = lazy(() => import("./pages/portal/PortalJobComplete"));
const PortalChangeOrderDetail = lazy(() => import("./pages/portal/PortalChangeOrderDetail"));
const PortalJobs = lazy(() => import("./pages/portal/PortalJobs"));
const PortalReports = lazy(() => import("./pages/portal/PortalReports"));
const PortalReportDetail = lazy(() => import("./pages/portal/PortalReportDetail"));
const PortalRoadmap = lazy(() => import("./pages/portal/PortalRoadmap"));
const Portal360Membership = lazy(() => import("./pages/portal/Portal360Membership"));
const PortalEnrollmentConfirmation = lazy(() => import("./pages/portal/PortalEnrollmentConfirmation"));
const PortalRoadmapSubmitted = lazy(() => import("./pages/portal/PortalRoadmapSubmitted"));
const PortalSchedule = lazy(() => import("./pages/portal/PortalSchedule"));
const PortalConsultationSubmitted = lazy(() => import("./pages/portal/PortalConsultationSubmitted"));
const PortalProjectDetail = lazy(() => import("./pages/portal/PortalProjectDetail"));
const WorkOrderDetail = lazy(() => import("./pages/WorkOrderDetail"));

// Field tech PWA pages
const TechLogin = lazy(() => import("./pages/TechLogin"));
const TechDashboard = lazy(() => import("./pages/TechDashboard"));
const TechJobDetail = lazy(() => import("./pages/TechJobDetail"));

const Welcome360Page = lazy(() => import("./pages/Welcome360Page"));
const AgentPlaybooksPage = lazy(() => import("./pages/admin/AgentPlaybooksPage"));
const ReengagementCampaignPage = lazy(() => import("./pages/admin/ReengagementCampaignPage"));

// Admin pages (Phase 1 AI agent runtime + KPI dashboard)
const AgentsHubPage = lazy(() => import("./pages/admin/AgentsHubPage"));
const AdminSchedulingPage = lazy(() => import("./pages/admin/AdminSchedulingPage"));
const AdminVendorsList = lazy(() => import("./pages/admin/AdminVendorsList"));
const AdminVendorDetail = lazy(() => import("./pages/admin/AdminVendorDetail"));
const AdminVendorNew = lazy(() => import("./pages/admin/AdminVendorNew"));
const ClientDetailPage = lazy(() => import("./pages/clients/ClientDetailPage"));

// Self-serve password reset (public)
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// HP-OS — the staff app rebuilt as the business's operating system.
// Built alongside the old UI; old screens are deleted at the Phase 3 cutover.
const OsToday = lazy(() => import("./os/pages/OsToday"));
const OsLibrary = lazy(() => import("./os/pages/OsLibrary"));
const OsDocument = lazy(() => import("./os/pages/OsDocument"));
const OsChat = lazy(() => import("./os/pages/OsChat"));
const OsApprovals = lazy(() => import("./os/pages/OsApprovals"));
const OsRoom = lazy(() => import("./os/pages/OsRoom"));
const OsDecisions = lazy(() => import("./os/pages/OsDecisions"));
const OsSettings = lazy(() => import("./os/pages/OsSettings"));
const OsPriceBook = lazy(() => import("./os/pages/OsPriceBook"));
const OsCommissions = lazy(() => import("./os/pages/OsCommissions"));
const OsMethod = lazy(() => import("./os/pages/OsMethod"));
const OsQuickQuote = lazy(() => import("./os/pages/OsQuickQuote"));
const OsSpotInspection = lazy(() => import("./os/pages/OsSpotInspection"));
const OsEstimateWizard = lazy(() => import("./os/estimate/OsEstimateWizard"));

// Domains that should serve only the customer portal (no admin app).
// On these hostnames any /admin or /onboarding URL is hidden behind a
// NotFound — the SPA build is shared between subdomains so we can't
// physically separate the bundles, but we can refuse to render staff
// surfaces. This is a soft security boundary (the JS bundle still
// contains those components); pair with API-side authz for hard guards.
const PORTAL_HOSTNAMES = [
  "client.handypioneers.com",
  "staging-client.handypioneers.com",
];

const isPortalDomain = PORTAL_HOSTNAMES.includes(window.location.hostname);

/**
 * On portal domains, redirect root "/" to "/portal/login" so customers
 * never load the admin app and never hit the staff login gate.
 */
function PortalDomainRoot() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/portal/login", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Wraps an admin/internal route component so it 404s on the customer
 * subdomain. Use for everything under /admin and /onboarding.
 */
function staffOnly<P extends object>(Component: ComponentType<P>) {
  return (props: P) => {
    if (isPortalDomain) return <NotFound />;
    return <Component {...props} />;
  };
}

/**
 * Phase 3 cutover: the staff root lands on the OS. Old "?section=" deep
 * links (notification emails, bookmarks) map to their room so they still
 * land somewhere sensible.
 */
const ROOM_BY_SECTION: Record<string, string> = {
  inbox: "/os/inbox",
  pipeline: "/os/pipeline",
  leads: "/os/pipeline",
  requests: "/os/pipeline",
  jobs: "/os/pipeline",
  customers: "/os/clients",
  customer: "/os/clients",
  "three-sixty": "/os/clients",
  financials: "/os/money",
  quickbooks: "/os/money",
  reporting: "/os/money",
  schedule: "/os/schedule",
};

function StaffRootRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    navigate((section && ROOM_BY_SECTION[section]) || "/os", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Router() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageview(location);
  }, [location]);

  return (
    <Switch>
      {/* Root: customers to the portal, staff to the OS */}
      <Route path="/" component={isPortalDomain ? PortalDomainRoot : StaffRootRedirect} />

        {/* Public booking wizard — no login required */}
      <Route path="/book" component={BookingWizard} />

      {/* Self-serve password reset (public) */}
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* Customer portal — public (no login required) */}
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/auth" component={PortalLogin} />

      {/* Roadmap Generator post-submit confirmation — public, polls status */}
      <Route path="/portal/roadmap/submitted/:id" component={PortalRoadmapSubmitted} />

      {/* Customer portal — session-gated (PortalProvider handles redirect) */}
      <Route path="/portal/home" component={PortalHome} />
      <Route path="/portal/appointments" component={PortalAppointments} />
      <Route path="/portal/invoices/:id" component={PortalInvoiceDetail} />
      <Route path="/portal/invoices" component={PortalInvoices} />
      <Route path="/portal/job/:hpOpportunityId/complete" component={PortalJobComplete} />
      <Route path="/portal/job/:hpOpportunityId" component={PortalJobDetail} />
      <Route path="/portal/change-orders/:id" component={PortalChangeOrderDetail} />
      <Route path="/portal/estimates/:id" component={PortalEstimateDetail} />
      <Route path="/portal/estimates" component={PortalEstimates} />
      <Route path="/portal/documents" component={PortalDocuments} />
      <Route path="/portal/gallery" component={PortalGallery} />
      <Route path="/portal/wallet" component={PortalWallet} />
      <Route path="/portal/referral" component={PortalReferral} />
      <Route path="/portal/messages" component={PortalMessages} />
      <Route path="/portal/communications/:threadId" component={PortalCommunicationThread} />
      <Route path="/portal/jobs" component={PortalJobs} />
      <Route path="/portal/request" component={PortalRequest} />
      <Route path="/portal/reports/:id" component={PortalReportDetail} />
      <Route path="/portal/reports" component={PortalReports} />
      <Route path="/portal/roadmap" component={PortalRoadmap} />
      <Route path="/portal/360-membership" component={Portal360Membership} />
      <Route path="/portal/360-confirmation" component={PortalEnrollmentConfirmation} />
      <Route path="/portal/schedule" component={PortalSchedule} />

      {/* Book Consultation pipeline — public (id is a long random token) */}
      <Route path="/portal/consultation/submitted/:id" component={PortalConsultationSubmitted} />
      <Route path="/portal/projects/:id" component={PortalProjectDetail} />

      {/* 360° Method post-checkout confirmation (public) */}
      <Route path="/360-welcome" component={Welcome360Page} />

      {/* Internal 360° work order completion wizard */}
      <Route path="/360/work-orders/:id">{() => <WorkOrderDetail />}</Route>

      {/* Data migration onboarding wizard (staff-only) */}
      <Route path="/onboarding" component={staffOnly(() => <DataMigrationPage />)} />

      {/* HP-OS — the operating system shell (staff-only) */}
      <Route path="/os" component={staffOnly(OsToday)} />
      <Route path="/os/chat" component={staffOnly(OsChat)} />
      <Route path="/os/approvals" component={staffOnly(OsApprovals)} />
      <Route path="/os/library/f/:folderId" component={staffOnly(OsLibrary)} />
      <Route path="/os/library" component={staffOnly(OsLibrary)} />
      <Route path="/os/d/:docId" component={staffOnly(OsDocument)} />
      <Route path="/os/decisions" component={staffOnly(OsDecisions)} />
      <Route path="/os/settings" component={staffOnly(OsSettings)} />
      <Route path="/os/pricebook" component={staffOnly(OsPriceBook)} />
      <Route path="/os/commissions" component={staffOnly(OsCommissions)} />
      <Route path="/os/method" component={staffOnly(OsMethod)} />
      <Route path="/os/quickquote" component={staffOnly(OsQuickQuote)} />
      <Route path="/os/spot/new" component={staffOnly(OsSpotInspection)} />
      <Route path="/os/spot/:id" component={staffOnly(OsSpotInspection)} />
      <Route path="/os/estimate/new" component={staffOnly(OsEstimateWizard)} />
      {/* Business rooms (Phase 2): pipeline, clients, money, schedule, inbox */}
      <Route path="/os/:room" component={staffOnly(OsRoom)} />

      {/* Admin — AI agent runtime + KPI dashboard (Phase 1).
          All staff-only — wrapped to 404 on client.handypioneers.com. */}
      {/* Phase 3 cutover: the OS replaced these surfaces */}
      <Route path="/admin/dashboard">{() => <Redirect to="/os" />}</Route>
      <Route path="/admin/chat">{() => <Redirect to="/os/chat" />}</Route>

      {/* The Agents Hub — replaces the old visionary/teams/org-chart/control/
          runs/tasks/agents-list/departments/drafts page sprawl. Old URLs
          redirect so existing notification links keep working. */}
      <Route path="/admin/agents" component={staffOnly(AgentsHubPage)} />
      <Route path="/admin/visionary">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/agents/teams">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/org-chart">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/agents/control">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/agents/runs">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/agents/drafts">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/ai-agents/tasks">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/ai-agents/:id">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/ai-agents">{() => <Redirect to="/admin/agents" />}</Route>
      <Route path="/admin/departments/:slug">{() => <Redirect to="/admin/agents" />}</Route>

      <Route path="/admin/scheduling" component={staffOnly(AdminSchedulingPage)} />
      <Route path="/admin/vendors/new" component={staffOnly(AdminVendorNew)} />
      <Route path="/admin/vendors/:id" component={staffOnly(AdminVendorDetail)} />
      <Route path="/admin/vendors" component={staffOnly(AdminVendorsList)} />

      {/* Client umbrella — deep-linkable single-client view (Phase C shell) */}
      <Route path="/admin/clients/:id/:tab?" component={staffOnly(ClientDetailPage)} />

      {/* Lead Nurturer cadence editor (the drafts inbox lives in the Agents Hub) */}
      <Route path="/admin/agents/playbooks" component={AgentPlaybooksPage} />

      {/* Admin: re-engagement campaign console */}
      <Route path="/admin/marketing/reengagement-campaign" component={staffOnly(ReengagementCampaignPage)} />

      {/* Field tech PWA */}
      <Route path="/tech" component={TechLogin} />
      <Route path="/tech/dashboard" component={TechDashboard} />
      <Route path="/tech/job/:jobType/:jobId" component={TechJobDetail} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <EstimatorProvider>
          <PortalProvider>
            <TooltipProvider>
              <Toaster />
              <Suspense fallback={<PageLoader />}>
                <Router />
              </Suspense>
            </TooltipProvider>
          </PortalProvider>
        </EstimatorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
