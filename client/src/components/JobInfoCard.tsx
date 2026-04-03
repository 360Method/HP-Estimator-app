// ============================================================
// JobInfoCard — Job information form at the top of the estimator
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';
import { JOB_TYPES } from '@/lib/types';

export default function JobInfoCard() {
  const { state, setJobInfo } = useEstimator();
  const { jobInfo } = state;

  return (
    <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Job Information</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client Name">
          <input
            type="text"
            className="field-input"
            placeholder="Jane Smith"
            value={jobInfo.client}
            onChange={e => setJobInfo({ client: e.target.value })}
          />
        </Field>
        <Field label="Job Address">
          <input
            type="text"
            className="field-input"
            placeholder="1234 Main St, Vancouver WA"
            value={jobInfo.address}
            onChange={e => setJobInfo({ address: e.target.value })}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className="field-input"
            value={jobInfo.date}
            onChange={e => setJobInfo({ date: e.target.value })}
          />
        </Field>
        <Field label="Job Type">
          <select
            className="field-input"
            value={jobInfo.jobType}
            onChange={e => setJobInfo({ jobType: e.target.value })}
          >
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Estimator Name">
          <input
            type="text"
            className="field-input"
            placeholder="Your name"
            value={jobInfo.estimator}
            onChange={e => setJobInfo({ estimator: e.target.value })}
          />
        </Field>
        <Field label="HP Job Number">
          <input
            type="text"
            className="field-input"
            placeholder="HP-2026-001"
            value={jobInfo.jobNumber}
            onChange={e => setJobInfo({ jobNumber: e.target.value })}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Scope Summary (internal)">
            <textarea
              className="field-input resize-y min-h-[72px]"
              placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor. Client supplied paint."
              value={jobInfo.scope}
              onChange={e => setJobInfo({ scope: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}
