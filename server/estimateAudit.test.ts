import { describe, expect, it } from 'vitest';
import { auditEstimateDraft } from './lib/aiBrain/opportunityBrain';

describe('estimate audit fallback', () => {
  it('blocks customer-ready output when scope, measurements, and price are missing', async () => {
    const result = await auditEstimateDraft({
      opportunityId: 'opp-test',
      estimateSnapshot: {
        jobInfo: {},
        phases: [],
        customItems: [],
        consultantWorkflow: {},
        proposal: {},
        totals: { price: 0, gm: 0 },
      },
      proposalStyle: 'single_with_alternates',
    });

    expect(result.readinessScore).toBeLessThan(100);
    expect(result.blockingIssues.map(issue => issue.id)).toContain('scope-missing');
    expect(result.blockingIssues.map(issue => issue.id)).toContain('measurements-missing');
    expect(result.blockingIssues.map(issue => issue.id)).toContain('price-missing');
  });

  it('returns a customer summary draft without exposing internal margin details', async () => {
    const result = await auditEstimateDraft({
      opportunityId: 'opp-test',
      estimateSnapshot: {
        jobInfo: { scope: 'Replace damaged exterior trim.' },
        phases: [],
        customItems: [{ description: 'Replace damaged exterior trim', qty: 1, unitType: 'unit' }],
        consultantWorkflow: {
          problemStatement: 'Exterior trim is damaged.',
          measurementNotes: 'One opening measured.',
          photoNotes: 'Photos attached.',
        },
        proposal: {
          customerSummary: 'We recommend replacing the damaged exterior trim and sealing the area.',
        },
        totals: { price: 1200, gm: 0.4 },
      },
      proposalStyle: 'single_with_alternates',
    });

    expect(result.customerSummaryDraft).toContain('replacing the damaged exterior trim');
    expect(result.customerSummaryDraft.toLowerCase()).not.toContain('gross margin');
  });
});
