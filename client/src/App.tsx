import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";

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
import Home from "./pages/Home";
import DataMigrationPage from "./pages/DataMigrationPage";

// Booking wizard (public)
import BookingWizard from "./pages/book/BookingWizard";

// Portal pages
import PortalHome from "./pages/portal/PortalHome";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalAppointments from "./pages/portal/PortalAppointments";
import PortalInvoices from "./pages/portal/PortalInvoices";
import PortalInvoiceDetail from "./pages/portal/PortalInvoiceDetail";
import PortalEstimates from "./pages/portal/PortalEstimates";
import PortalEstimateDetail from "./pages/portal/PortalEstimateDetail";
import PortalGallery from "./pages/portal/PortalGallery";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalWallet from "./pages/portal/PortalWallet";
import PortalReferral from "./pages/portal/PortalReferral";
import PortalMessages from "./pages/portal/PortalMessages";
import PortalRequest from "./pages/portal/PortalRequest";
import PortalJobDetail from "./pages/portal/PortalJobDetail";
import PortalJobComplete from "./pages/portal/PortalJobComplete";
import PortalChangeOrderDetail from "./pages/portal/PortalChangeOrderDetail";
import PortalJobs from "./pages/portal/PortalJobs";
import PortalReports from "./pages/portal/PortalReports";
import PortalReportDetail from "./pages/portal/PortalReportDetail";
import Portal360Membership from "./pages/portal/Portal360Membership";
import PortalEnrollmentConfirmation from "./pages/portal/PortalEnrollmentConfirmation";
import PortalSchedule from "./pages/portal/PortalSchedule";
import WorkOrderDetail from "./pages/WorkOrderDetail";
import Welcome360Page from "./pages/Welcome360Page";

// Admin pages (Phase 1 AI agent runtime + KPI dashboard)
import AdminDashboard from "./pages/admin/AdminDashboard";
import AiAgentsList from "./pages/admin/AiAgentsList";
import AiAgentDetail from "./pages/admin/AiAgentDetail";
import AiAgentTasks from "./pages/admin/AiAgentTasks";
import DepartmentDetail from "./pages/admin/DepartmentDetail";
import AdminSchedulingPage from "./pages/admin/AdminSchedulingPage";
import IntegratorChat from "./pages/admin/IntegratorChat";
import AdminVendorsList from "./pages/admin/AdminVendorsList";
import AdminVendorDetail from "./pages/admin/AdminVendorDetail";
import AdminVendorNew from "./pages/admin/AdminVendorNew";
import AgentsControl from "./pages/admin/AgentsControl";
import AgentsRuns from "./pages/admin/AgentsRuns";
import OrgChart from "./pages/admin/OrgChart";

// Self-serve password reset (public)
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// Domains that should serve only the customer portal (no admin app)
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
      <Route path="/portal/jobs" component={PortalJobs} />
      <Route path="/portal/request" component={PortalRequest} />
      <Route path="/portal/reports/:id" component={PortalReportDetail} />
      <Route path="/portal/reports" component={PortalReports} />
      <Route path="/portal/360-membership" component={Portal360Membership} />
      <Route path="/portal/360-confirmation" component={PortalEnrollmentConfirmation} />
      <Route path="/portal/schedule" component={PortalSchedule} />

      {/* 360° Method post-checkout confirmation (public) */}
      <Route path="/360-welcome" component={Welcome360Page} />

      {/* Internal 360° work order completion wizard */}
      <Route path="/360/work-orders/:id">{() => <WorkOrderDetail />}</Route>

      {/* Data migration onboarding wizard */}
      <Route path="/onboarding" component={() => <DataMigrationPage />} />

      {/* Admin — AI agent runtime + KPI dashboard (Phase 1) */}
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/chat" component={IntegratorChat} />
      <Route path="/admin/org-chart" component={OrgChart} />
      <Route path="/admin/agents/control" component={AgentsControl} />
      <Route path="/admin/agents/runs" component={AgentsRuns} />
      <Route path="/admin/ai-agents/tasks" component={AiAgentTasks} />
      <Route path="/admin/ai-agents/:id" component={AiAgentDetail} />
      <Route path="/admin/ai-agents" component={AiAgentsList} />
      <Route path="/admin/departments/:slug" component={DepartmentDetail} />
      <Route path="/admin/scheduling" component={AdminSchedulingPage} />
      <Route path="/admin/vendors/new" component={AdminVendorNew} />
      <Route path="/admin/vendors/:id" component={AdminVendorDetail} />
      <Route path="/admin/vendors" component={AdminVendorsList} />

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
              <Router />
            </TooltipProvider>
          </PortalProvider>
        </EstimatorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
