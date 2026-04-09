// ============================================================
// Home — Main page wiring all sections
// ============================================================

import { useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcTotals } from '@/lib/calc';
import MetricsBar from '@/components/MetricsBar';
import CustomerSection from '@/components/sections/CustomerSection';
import SalesSection from '@/components/sections/SalesSection';
import CalculatorSection from '@/components/sections/CalculatorSection';
import EstimateSection from '@/components/sections/EstimateSection';
import JobDetailsSection from '@/components/sections/JobDetailsSection';
import InvoiceSection from '@/components/sections/InvoiceSection';
import PresentSection from '@/components/sections/PresentSection';
import CustomersListPage from '@/pages/CustomersListPage';
import JobsListPage from '@/pages/JobsListPage';
import PipelinePage from '@/pages/PipelinePage';
import EstimatorDashboard from '@/pages/EstimatorDashboard';
import SchedulePage from '@/pages/SchedulePage';
import InboxPage from '@/pages/InboxPage';
import ReportingPage from '@/pages/ReportingPage';
import MarketingPage from '@/pages/MarketingPage';

export default function Home() {
  const { state } = useEstimator();

  const totals = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    return calcTotals(phaseResults);
  }, [state.phases, state.global]);

  return (
    <div className="min-h-screen bg-background">
      <MetricsBar totals={totals} />

      {state.activeSection === 'dashboard' ? (
        <EstimatorDashboard />
      ) : state.activeSection === 'customers' ? (
        <CustomersListPage />
      ) : state.activeSection === 'jobs' ? (
        <JobsListPage />
      ) : state.activeSection === 'pipeline' ? (
        <PipelinePage />
      ) : state.activeSection === 'schedule' ? (
        <SchedulePage />
      ) : state.activeSection === 'inbox' ? (
        <InboxPage />
      ) : state.activeSection === 'reporting' ? (
        <ReportingPage />
      ) : state.activeSection === 'marketing' ? (
        <MarketingPage />
      ) : (
        <div className="container py-6 max-w-4xl">
          {state.activeSection === 'customer' && <CustomerSection />}
          {state.activeSection === 'sales' && <SalesSection />}
          {state.activeSection === 'calculator' && <CalculatorSection />}
          {state.activeSection === 'estimate' && <EstimateSection />}
          {state.activeSection === 'job-details' && <JobDetailsSection />}
          {state.activeSection === 'invoice' && <InvoiceSection />}
        </div>
      )}
      {/* Present mode is a full-screen overlay, rendered outside the container */}
      {state.activeSection === 'present' && <PresentSection />}
    </div>
  );
}
