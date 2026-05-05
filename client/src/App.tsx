import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
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

const Home = lazy(() => import("./pages/Home"));
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
const AgentDraftsPage = lazy(() => import("./pages/admin/AgentDraftsPage"));
const AgentPlaybooksPage = lazy(() => import("./pages/admin/AgentPlaybooksPage"));
const ReengagementCampaignPage = lazy(() => import("./pages/admin/ReengagementCampaignPage"));

// Admin pages (Phase 1 AI agent runtime + KPI dashboard)
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AiAgentsList = lazy(() => import("./pages/admin/AiAgentsList"));
const AiAgentDetail = lazy(() => import("./pages/admin/AiAgentDetail"));
const AiAgentTasks = lazy(() => import("./pages/admin/AiAgentTasks"));
const DepartmentDetail = lazy(() => import("./pages/admin/DepartmentDetail"));
const AdminSchedulingPage = lazy(() => import("./pages/admin/AdminSchedulingPage"));
const IntegratorChat = lazy(() => import("./pages/admin/IntegratorChat"));
const VisionaryConsole = lazy(() => import("./pages/admin/VisionaryConsole"));
const AgentTeamsPage = lazy(() => import("./pages/admin/AgentTeamsPage"));
const AdminVendorsList = lazy(() => import("./pages/admin/AdminVendorsList"));
const AdminVendorDetail = lazy(() => import("./pages/admin/AdminVendorDetail"));
const AdminVendorNew = lazy(() => import("./pages/admin/AdminVendorNew"));
const AgentsControl = lazy(() => import("./pages/admin/AgentsControl"));
const AgentsRuns = lazy(() => import("./pages/admin/AgentsRuns"));
const OrgChart = lazy(() => import("./pages/admin/OrgChart"));

// Self-serve password reset (public)
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Domains that should serve only the customer portal (no admin app).
// On these hostnames any /admin or /onboarding URL is hidden behind a
// NotFound — the SPA build is shared between subdomains so we can't
// physically separate the bundles, but we can refuse to render staff
// surfaces. This is a soft security boundary (the JS bundle still
// contains those components); pair with API-side authz for hard guards.
const PORTAL_HOSTNAMES = ["client.handypioneers.com"];

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

function Router() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageview(location);
  }, [location]);

  return (
    <Switch>
      {/* Main app — on portal domains, root redirects to portal login */}
      <Route path="/" component={isPortalDomain ? PortalDomainRoot : Home} />

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

      {/* Admin — AI agent runtime + KPI dashboard (Phase 1).
          All staff-only — wrapped to 404 on client.handypioneers.com. */}
      <Route path="/admin/dashboard" component={staffOnly(AdminDashboard)} />
      <Route path="/admin/visionary" component={staffOnly(VisionaryConsole)} />
      <Route path="/admin/chat" component={staffOnly(IntegratorChat)} />
      <Route path="/admin/agents/teams" component={staffOnly(AgentTeamsPage)} />
      <Route path="/admin/org-chart" component={staffOnly(OrgChart)} />
      <Route path="/admin/agents/control" component={staffOnly(AgentsControl)} />
      <Route path="/admin/agents/runs" component={staffOnly(AgentsRuns)} />
      <Route path="/admin/ai-agents/tasks" component={staffOnly(AiAgentTasks)} />
      <Route path="/admin/ai-agents/:id" component={staffOnly(AiAgentDetail)} />
      <Route path="/admin/ai-agents" component={staffOnly(AiAgentsList)} />
      <Route path="/admin/departments/:slug" component={staffOnly(DepartmentDetail)} />
      <Route path="/admin/scheduling" component={staffOnly(AdminSchedulingPage)} />
      <Route path="/admin/vendors/new" component={staffOnly(AdminVendorNew)} />
      <Route path="/admin/vendors/:id" component={staffOnly(AdminVendorDetail)} />
      <Route path="/admin/vendors" component={staffOnly(AdminVendorsList)} />

      {/* Lead Nurturer admin — drafts inbox + playbook editor */}
      <Route path="/admin/agents/drafts" component={AgentDraftsPage} />
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
