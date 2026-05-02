import { describe, expect, it } from 'vitest';
import { buildApprovalChecklist, estimateReadinessStatus } from './estimateWorkflow';
import { ALL_PHASES, DEFAULTS } from './phases';
import { ConsultantWorkflowMeta } from './types';

const workflow = (patch: Partial<ConsultantWorkflowMeta> = {}): ConsultantWorkflowMeta => ({
  currentStep: 'prep',
  completedSteps: [],
  problemStatement: '',
  customerGoals: '',
  affectedAreas: '',
  urgency: '',
  constraints: '',
  decisionFactors: '',
  measurementNotes: '',
  findingNotes: '',
  photoNotes: '',
  scheduleAssumptions: '',
  internalAssumptions: '',
  ...patch,
});

describe('estimate workflow readiness', () => {
  it('keeps proposal in draft when required customer-facing summary is missing', () => {
    const phases = structuredClone(ALL_PHASES);
    phases[0].items[0].qty = 1;
    const checklist = buildApprovalChecklist({
      workflow: workflow({ problemStatement: 'Repair damaged trim', measurementNotes: 'Measured 12 lf on site.' }),
      phases,
      customItems: [],
      global: { ...DEFAULTS, taxEnabled: false, taxRateCode: '0603', customTaxPct: 8.9 },
      customerSummary: '',
    });

    expect(checklist.find(check => check.id === 'customer-summary')?.passed).toBe(false);
    expect(estimateReadinessStatus({ checklist, auditBlockingCount: 0 })).toBe('draft');
  });

  it('moves to needs review when required checklist items pass but consultant has not approved', () => {
    const phases = structuredClone(ALL_PHASES);
    phases[0].items[0].qty = 1;
    const checklist = buildApprovalChecklist({
      workflow: workflow({ problemStatement: 'Repair damaged trim', measurementNotes: 'Measured 12 lf on site.' }),
      phases,
      customItems: [],
      global: { ...DEFAULTS, taxEnabled: false, taxRateCode: '0603', customTaxPct: 8.9 },
      customerSummary: 'We recommend repairing the damaged trim and repainting the affected area.',
    });

    expect(estimateReadinessStatus({ checklist, auditBlockingCount: 0 })).toBe('needs_review');
  });

  it('does not become customer-ready while audit blocking issues remain', () => {
    const checklist = [
      { id: 'scope', label: 'Scope', passed: true, required: true },
      { id: 'measurements', label: 'Measurements', passed: true, required: true },
    ];

    expect(estimateReadinessStatus({ checklist, auditBlockingCount: 1, approvedAt: new Date().toISOString() })).toBe('draft');
    expect(estimateReadinessStatus({ checklist, auditBlockingCount: 1 })).toBe('draft');
  });
});
