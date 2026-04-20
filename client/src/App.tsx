import { Toaster } from "@/components/ui/sonner";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
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
import WorkOrderDetail from "./pages/WorkOrderDetail";

// Domains that should serve only the customer portal (no admin app)
const PORTAL_HOSTNAMES = ["client.handypioneers.com"];

const isPortalDomain = PORTAL_HOSTNAMES.includes(window.location.hostname);

/**
 * On portal domains, redirect root "/" to "/portal/login" so customers
 * never load the admin app and never trigger OAuth.
 */
function PortalDomainRoot() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/portal/login", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Main app — on portal domains, root redirects to portal login */}
      <Route path="/" component={isPortalDomain ? PortalDomainRoot : Home} />

        {/* Public booking wizard — no login required */}
      <Route path="/book" component={BookingWizard} />

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

      {/* Internal 360° work order completion wizard */}
      <Route path="/360/work-orders/:id">{() => <WorkOrderDetail />}</Route>

      {/* Data migration onboarding wizard */}
      <Route path="/onboarding" component={() => <DataMigrationPage />} />

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
              <PwaInstallBanner />
              <Router />
            </TooltipProvider>
          </PortalProvider>
        </EstimatorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
