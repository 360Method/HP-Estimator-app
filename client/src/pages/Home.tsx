// Main authenticated admin page wiring all sections.

import { lazy, Suspense, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { useEstimator } from '@/contexts/EstimatorContext';
import { useDbSync } from '@/hooks/useDbSync';
import { useOpportunitySSE } from '@/hooks/useOpportunitySSE';
import { calcPhase, calcTotals } from '@/lib/calc';
import MetricsBar from '@/components/MetricsBar';
import AdminLogin from '@/pages/AdminLogin';
import AdminAccessDenied from '@/pages/AdminAccessDenied';
import NewLeadBanner from '@/components/NewLeadBanner';

const CustomerSection = lazy(() => import('@/components/sections/CustomerSection'));
const SalesSection = lazy(() => import('@/components/sections/SalesSection'));
const CalculatorSection = lazy(() => import('@/components/sections/CalculatorSection'));
const EstimateSection = lazy(() => import('@/components/sections/EstimateSection'));
const JobDetailsSection = lazy(() => import('@/components/sections/JobDetailsSection'));
const InvoiceSection = lazy(() => import('@/components/sections/InvoiceSection'));
const PresentSection = lazy(() => import('@/components/sections/PresentSection'));
const OpportunityDetailsTab = lazy(() => import('@/components/sections/OpportunityDetailsTab'));
const CustomersListPage = lazy(() => import('@/pages/CustomersListPage'));
const JobsListPage = lazy(() => import('@/pages/JobsListPage'));
const PipelinePage = lazy(() => import('@/pages/PipelinePage'));
const EstimatorDashboard = lazy(() => import('@/pages/EstimatorDashboard'));
const SchedulePage = lazy(() => import('@/pages/SchedulePage'));
const InboxPage = lazy(() => import('@/pages/InboxPage'));
const ReportingPage = lazy(() => import('@/pages/ReportingPage'));
const MarketingPage = lazy(() => import('@/pages/MarketingPage'));
const LeadsPage = lazy(() => import('@/pages/LeadsPage'));
const ThreeSixtyPage = lazy(() => import('@/pages/ThreeSixtyPage'));
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'));
const QuickBooksPage = lazy(() => import('@/pages/QuickBooksPage'));
const WorkflowPage = lazy(() => import('@/pages/WorkflowPage'));
const OperationsPage = lazy(() => import('@/pages/OperationsPage'));

function SectionLoader() {
  return (
    <div className="container py-10">
      <div className="h-24 rounded-lg border border-border bg-muted/40 animate-pulse" />
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <AdminLogin />;

  if ((user as { isAllowed?: boolean }).isAllowed === false) {
    return <AdminAccessDenied email={user.email} />;
  }

  return <AdminApp />;
}

function AdminApp() {
  const { state } = useEstimator();
  useDbSync(true);
  useOpportunitySSE(true);

  const totals = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    return calcTotals(phaseResults);
  }, [state.phases, state.global]);

  return (
    <div className="min-h-screen bg-background">
      <NewLeadBanner />
      <MetricsBar totals={totals} />

      <Suspense fallback={<SectionLoader />}>
        {state.activeSection === 'dashboard' ? (
          <EstimatorDashboard />
        ) : state.activeSection === 'customers' ? (
          <CustomersListPage />
        ) : state.activeSection === 'jobs' ? (
          <JobsListPage />
        ) : state.activeSection === 'pipeline' ? (
          <PipelinePage />
        ) : state.activeSection === 'workflow' ? (
          <WorkflowPage />
        ) : state.activeSection === 'operations' ? (
          <OperationsPage />
        ) : state.activeSection === 'schedule' ? (
          <SchedulePage />
        ) : state.activeSection === 'inbox' ? (
          <InboxPage />
        ) : state.activeSection === 'reporting' ? (
          <ReportingPage />
        ) : state.activeSection === 'marketing' ? (
          <MarketingPage />
        ) : (state.activeSection === 'leads' || state.activeSection === 'requests') ? (
          <LeadsPage />
        ) : state.activeSection === 'three-sixty' ? (
          <ThreeSixtyPage />
        ) : state.activeSection === 'financials' ? (
          <FinancialsPage />
        ) : state.activeSection === 'quickbooks' ? (
          <QuickBooksPage />
        ) : (
          <div className="container py-6 max-w-4xl">
            {state.activeSection === 'customer' && <CustomerSection />}
            {state.activeSection === 'opp-details' && <OpportunityDetailsTab />}
            {state.activeSection === 'sales' && <SalesSection />}
            {state.activeSection === 'calculator' && <CalculatorSection />}
            {state.activeSection === 'estimate' && <EstimateSection />}
            {state.activeSection === 'job-details' && <JobDetailsSection />}
            {state.activeSection === 'invoice' && <InvoiceSection />}
          </div>
        )}
        {state.activeSection === 'present' && <PresentSection />}
      </Suspense>
    </div>
  );
}
