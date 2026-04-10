import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { EstimatorProvider } from "./contexts/EstimatorContext";
import { PortalProvider } from "./contexts/PortalContext";
import Home from "./pages/Home";

// Booking wizard (public)
import BookingWizard from "./pages/book/BookingWizard";

// Portal pages
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

// Domains that should serve only the customer portal (no admin app)
const PORTAL_HOSTNAMES = ["client.handypioneers.com"];

const isPortalDomain = PORTAL_HOSTNAMES.includes(window.location.hostname);

/**
 * On portal domains, redirect root "/" to "/portal/login" so customers
 * never load the admin app and never trigger Manus OAuth.
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
      <Route path="/portal/appointments" component={PortalAppointments} />
      <Route path="/portal/invoices/:id" component={PortalInvoiceDetail} />
      <Route path="/portal/invoices" component={PortalInvoices} />
      <Route path="/portal/estimates/:id" component={PortalEstimateDetail} />
      <Route path="/portal/estimates" component={PortalEstimates} />
      <Route path="/portal/documents" component={PortalDocuments} />
      <Route path="/portal/gallery" component={PortalGallery} />
      <Route path="/portal/wallet" component={PortalWallet} />
      <Route path="/portal/referral" component={PortalReferral} />
      <Route path="/portal/messages" component={PortalMessages} />

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
