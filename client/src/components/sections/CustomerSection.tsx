// ============================================================
// CustomerSection — Job info + client details dashboard
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';
import { JOB_TYPES } from '@/lib/types';
import { User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, FileText } from 'lucide-react';

export default function CustomerSection() {
  const { state, setJobInfo } = useEstimator();
  const { jobInfo } = state;

  const field = (
    label: string,
    key: keyof typeof jobInfo,
    type: string = 'text',
    placeholder: string = '',
    icon?: React.ReactNode,
  ) => (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={jobInfo[key] as string}
          onChange={e => setJobInfo({ [key]: e.target.value })}
          placeholder={placeholder}
          className={`field-input w-full ${icon ? 'pl-9' : ''}`}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Client Info */}
      <div className="card-section">
        <div className="card-section-header">
          <User size={15} />
          <span>Client Information</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Client Name', 'client', 'text', 'Jane Smith', <User size={14} />)}
          {field('Phone', 'phone', 'tel', '(360) 555-0100', <Phone size={14} />)}
          {field('Email', 'email', 'email', 'jane@example.com', <Mail size={14} />)}
          <div className="sm:col-span-2">
            {field('Job Address', 'address', 'text', '1234 Main St, Vancouver WA', <MapPin size={14} />)}
          </div>
        </div>
      </div>

      {/* Job Details */}
      <div className="card-section">
        <div className="card-section-header">
          <Briefcase size={15} />
          <span>Job Details</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Date', 'date', 'date', '', <Calendar size={14} />)}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Job Type
            </label>
            <select
              value={jobInfo.jobType}
              onChange={e => setJobInfo({ jobType: e.target.value })}
              className="field-input w-full"
            >
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {field('Estimator Name', 'estimator', 'text', 'Your name')}
          {field('HP Job Number', 'jobNumber', 'text', 'HP-2026-001', <Hash size={14} />)}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Scope Summary (Internal)
            </label>
            <textarea
              value={jobInfo.scope}
              onChange={e => setJobInfo({ scope: e.target.value })}
              placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor. Client supplied paint."
              rows={3}
              className="field-input w-full resize-none"
            />
          </div>
        </div>
      </div>

      {/* Quick summary card */}
      {(jobInfo.client || jobInfo.address) && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Job Summary</div>
          <div className="text-sm font-semibold text-foreground">{jobInfo.client || 'Client TBD'}</div>
          {jobInfo.address && <div className="text-sm text-muted-foreground">{jobInfo.address}</div>}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            {jobInfo.jobType && <span>{jobInfo.jobType}</span>}
            {jobInfo.estimator && <span>Est: {jobInfo.estimator}</span>}
            {jobInfo.jobNumber && <span>#{jobInfo.jobNumber}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
