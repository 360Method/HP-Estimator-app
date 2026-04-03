// ============================================================
// CustomerSection — Job info + client details dashboard
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';
import { JOB_TYPES } from '@/lib/types';
import { User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, FileText, Building2 } from 'lucide-react';

export default function CustomerSection() {
  const { state, setJobInfo } = useEstimator();
  const { jobInfo } = state;

  const field = (
    label: string,
    key: keyof typeof jobInfo,
    type: string = 'text',
    placeholder: string = '',
    icon?: React.ReactNode,
    colSpan?: string,
  ) => (
    <div className={colSpan}>
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
          {field('Company Name', 'companyName', 'text', 'Acme Corp (optional)', <Building2 size={14} />)}
          {field('Phone', 'phone', 'tel', '(360) 555-0100', <Phone size={14} />)}
          {field('Email', 'email', 'email', 'jane@example.com', <Mail size={14} />)}
          <div className="sm:col-span-2">
            {field('Street Address', 'address', 'text', '1234 Main St', <MapPin size={14} />)}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <div className="col-span-1">
              {field('City', 'city', 'text', 'Vancouver')}
            </div>
            <div>
              {field('State', 'state', 'text', 'WA')}
            </div>
            <div>
              {field('Zip', 'zip', 'text', '98683')}
            </div>
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
          {field('HP Job Number', 'jobNumber', 'text', 'HP-2026-001', <Hash size={14} />)}
          {field('Created Date', 'date', 'date', '', <Calendar size={14} />)}
          {field('Expires Date', 'expiresDate', 'date', '', <Calendar size={14} />)}
          {field('Service Date', 'servicedDate', 'date', '', <Calendar size={14} />)}
          {field('Prepared By (Technicians)', 'estimator', 'text', 'e.g. John D., Sarah M.')}
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
          <div className="text-sm font-semibold text-foreground">
            {jobInfo.client || 'Client TBD'}
            {jobInfo.companyName ? ` · ${jobInfo.companyName}` : ''}
          </div>
          {jobInfo.address && (
            <div className="text-sm text-muted-foreground">
              {jobInfo.address}{jobInfo.city ? `, ${jobInfo.city}` : ''}{jobInfo.state ? `, ${jobInfo.state}` : ''}{jobInfo.zip ? ` ${jobInfo.zip}` : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {jobInfo.jobType && <span>{jobInfo.jobType}</span>}
            {jobInfo.estimator && <span>By: {jobInfo.estimator}</span>}
            {jobInfo.jobNumber && <span>#{jobInfo.jobNumber}</span>}
            {jobInfo.expiresDate && <span>Expires: {new Date(jobInfo.expiresDate + 'T12:00:00').toLocaleDateString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
