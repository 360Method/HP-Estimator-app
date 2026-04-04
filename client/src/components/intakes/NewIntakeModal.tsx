// ============================================================
// NewIntakeModal — New Call / Field Intake form
// Design: two-column full-screen layout matching HouseCall Pro reference
// Left sidebar: Customer name, Address lookup, Request / Schedule / Contact steps
// Right main: Request description, Request guide questionnaire (pill buttons),
//             Business unit / Job type / Tags / Lead source, Line items
// ============================================================

import { useState } from 'react';
import { MapPin, Globe, Hash, Tag } from 'lucide-react';
import { toast } from 'sonner';
import IntakeShell, { LineItemsPanel, LineItem } from './IntakeShell';

type PillGroup = { question: string; options: string[] };

const REQUEST_GUIDE: PillGroup[] = [
  { question: 'Is the property residential or commercial?', options: ['Residential', 'Commercial'] },
  { question: 'What is the approximate age of the property?', options: ['Less than 5 years old', '6 to 10 years old', '11 to 20 years old', '21 to 50 years old', 'Over 50 years old', 'Not sure'] },
  { question: 'Do you own or rent the property?', options: ['Own', 'Rent'] },
  { question: 'What type of work do you need done?', options: ['General Contractor', 'Handyman'] },
  { question: 'Choose the appropriate status for this project:', options: ['Ready to Hire', 'Planning and Budgeting'] },
  { question: 'When would you like this request to be completed?', options: ['Emergency', 'As soon as possible', 'Within 1 week', '1-2 weeks', 'More than 2 weeks', 'Timing is flexible'] },
  { question: 'Is this request covered by an insurance claim?', options: ['Yes', 'No'] },
];

function PillQuestion({ group, selected, onToggle }: {
  group: PillGroup;
  selected: string[];
  onToggle: (opt: string) => void;
}) {
  return (
    <div className="py-2.5 border-b border-blue-100 last:border-0">
      <div className="text-xs text-slate-700 mb-2">{group.question}</div>
      <div className="flex flex-wrap gap-1.5">
        {group.options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              selected.includes(opt)
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-600 border-slate-300 hover:border-primary hover:text-primary'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewIntakeModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const [customerName, setCustomerName] = useState(prefill?.displayName ?? '');
  const [address, setAddress] = useState(
    prefill?.street ? `${prefill.street}, ${prefill.city}, ${prefill.state} ${prefill.zip}` : ''
  );
  const [activeStep, setActiveStep] = useState<'request' | 'schedule' | 'contact'>('request');
  const [description, setDescription] = useState('');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [issueDetail, setIssueDetail] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [jobType, setJobType] = useState('');
  const [jobTags, setJobTags] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const toggleAnswer = (question: string, opt: string) => {
    setAnswers(prev => {
      const current = prev[question] ?? [];
      return { ...prev, [question]: current.includes(opt) ? current.filter(o => o !== opt) : [opt] };
    });
  };

  const handleSave = () => {
    toast.success('Intake saved');
    onClose();
  };

  const steps = [
    { key: 'request' as const, label: 'Request' },
    { key: 'schedule' as const, label: 'Schedule' },
    { key: 'contact' as const, label: 'Contact' },
  ];

  const leftPanel = (
    <div className="flex flex-col h-full">
      {/* Customer name */}
      <div className="p-4 border-b border-slate-100">
        <input
          type="text"
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          placeholder="Customer name"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      {/* Address lookup */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white">
          <MapPin size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Address lookup"
            className="flex-1 focus:outline-none bg-transparent text-sm"
          />
        </div>
      </div>
      {/* Step nav */}
      <div className="flex flex-col gap-1 p-3">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setActiveStep(s.key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              activeStep === s.key
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${
              activeStep === s.key ? 'border-primary text-primary' : 'border-slate-300 text-slate-400'
            }`}>
              {i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const rightPanel = (
    <>
      {/* Request section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-base font-semibold text-slate-800">Request</span>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Request description</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Private notes"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Request guide questionnaire */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Request guide</div>
            <div className="bg-blue-50 rounded-lg px-4 py-2">
              {REQUEST_GUIDE.map((g, i) => (
                <PillQuestion
                  key={i}
                  group={g}
                  selected={answers[g.question] ?? []}
                  onToggle={opt => toggleAnswer(g.question, opt)}
                />
              ))}
              <div className="py-2.5">
                <div className="text-xs text-slate-700 mb-2">Tell us more about your issue</div>
                <input
                  type="text"
                  value={issueDetail}
                  onChange={e => setIssueDetail(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Business unit / Job type / Tags / Lead source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Business unit</label>
              <input type="text" value={businessUnit} onChange={e => setBusinessUnit(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Hash size={11} /> Job type
              </label>
              <input type="text" value={jobType} onChange={e => setJobType(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Tag size={11} /> Job tags (press enter)
              </label>
              <input type="text" value={jobTags} onChange={e => setJobTags(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Globe size={11} /> Lead source
              </label>
              <input type="text" value={leadSource} onChange={e => setLeadSource(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <LineItemsPanel items={items} onChange={setItems} />
    </>
  );

  return (
    <IntakeShell
      title="New Call"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save intake"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
    />
  );
}
