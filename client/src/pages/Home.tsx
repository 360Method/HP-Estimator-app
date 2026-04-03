// ============================================================
// Home — Main page wiring all 4 sections
// ============================================================

import { useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcTotals } from '@/lib/calc';
import MetricsBar from '@/components/MetricsBar';
import CustomerSection from '@/components/sections/CustomerSection';
import SalesSection from '@/components/sections/SalesSection';
import CalculatorSection from '@/components/sections/CalculatorSection';
import EstimateSection from '@/components/sections/EstimateSection';
import PresentSection from '@/components/sections/PresentSection';

export default function Home() {
  const { state } = useEstimator();

  const totals = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    return calcTotals(phaseResults);
  }, [state.phases, state.global]);

  return (
    <div className="min-h-screen bg-background">
      <MetricsBar totals={totals} />

      <div className="container py-6 max-w-4xl">
        {state.activeSection === 'customer' && <CustomerSection />}
        {state.activeSection === 'sales' && <SalesSection />}
        {state.activeSection === 'calculator' && <CalculatorSection />}
        {state.activeSection === 'estimate' && <EstimateSection />}
      </div>
      {/* Present mode is a full-screen overlay, rendered outside the container */}
      {state.activeSection === 'present' && <PresentSection />}
    </div>
  );
}
