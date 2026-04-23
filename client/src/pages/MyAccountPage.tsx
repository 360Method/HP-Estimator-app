// ============================================================
// MyAccountPage — User profile customization
//   • Avatar: initials with color, or uploaded image
//   • Name, role, bio
//   • Contact: phone, email
//   • Team color picker (8 swatches + custom hex)
//   • Password change section (UI only — no backend auth)
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { toast } from 'sonner';
import {
  User, Camera, Phone, Mail, Briefcase, Palette,
  Lock, Eye, EyeOff, Save, ArrowLeft, CheckCircle2,
} from 'lucide-react';

const TEAM_COLORS = [
  { hex: '#e07b39', label: 'Amber'   },
  { hex: '#3b82f6', label: 'Blue'    },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#8b5cf6', label: 'Violet'  },
  { hex: '#ef4444', label: 'Red'     },
  { hex: '#f59e0b', label: 'Yellow'  },
  { hex: '#06b6d4', label: 'Cyan'    },
  { hex: '#ec4899', label: 'Pink'    },
];

const ROLES = ['Owner', 'Estimator', 'Field Tech', 'Office Manager', 'Sales Rep', 'Subcontractor'];

const PASSWORD_RULES = [
  { label: '8+ characters',                    test: (p: string) => p.length >= 8 },
  { label: 'At least one uppercase letter',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'At least one number',              test: (p: string) => /[0-9]/.test(p) },
  { label: 'At least one special character',   test: (p: string) => /[!@#$%^&*]/.test(p) },
];

interface Props {
  onBack: () => void;
}

export default function MyAccountPage({ onBack }: Props) {
  const { state, updateUserProfile } = useEstimator();
  const profile = state.userProfile;

  // Local form state (commit on Save)
  const [form, setForm] = useState({ ...profile });
  const [customColor, setCustomColor] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = [form.firstName[0], form.lastName[0]].filter(Boolean).join('').toUpperCase() || 'HP';

  const handleAvatarUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(f => ({ ...f, avatarUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleSave = () => {
    updateUserProfile(form);
    setSaved(true);
    toast.success('Profile saved');
    setTimeout(() => setSaved(false), 2500);
  };

  const pwRules = PASSWORD_RULES.map(r => ({ ...r, passed: r.test(newPw) }));
  const pwValid = newPw.length === 0 || pwRules.every(r => r.passed);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold text-foreground">My Account</h1>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Avatar + Name ── */}
        <section className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <User size={13} />
            <span>Profile</span>
          </div>
          <div className="card-section-body">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <div className="relative group">
                  {form.avatarUrl ? (
                    <img
                      src={form.avatarUrl}
                      alt={initials}
                      className="w-20 h-20 rounded-full object-cover border-2 border-border"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold border-2 border-white/20"
                      style={{ backgroundColor: form.teamColor }}
                    >
                      {initials}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera size={18} className="text-white" />
                  </button>
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Select image
                </button>
                {form.avatarUrl && (
                  <button
                    onClick={() => setForm(f => ({ ...f, avatarUrl: null }))}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>

              {/* Name + Role + Bio */}
              <div className="flex-1 space-y-3 w-full">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">First name</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="field-input w-full"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Last name</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="field-input w-full"
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    <Briefcase size={11} className="inline mr-1" />Role
                  </label>
                  <div className="relative">
                    <select
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="field-input w-full appearance-none pr-8"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bio</label>
                  <textarea
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    rows={2}
                    className="field-input w-full resize-none"
                    placeholder="Short bio or title…"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Team Color ── */}
        <section className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Palette size={13} />
            <span>Team Member Color</span>
          </div>
          <div className="card-section-body">
            <p className="text-xs text-muted-foreground mb-3">Used for your avatar background and team calendar events.</p>
            <div className="flex flex-wrap gap-3">
              {TEAM_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  onClick={() => setForm(f => ({ ...f, teamColor: hex }))}
                  title={label}
                  className="w-9 h-9 rounded-full transition-all hover:scale-110"
                  style={{
                    backgroundColor: hex,
                    outline: form.teamColor === hex ? `3px solid ${hex}` : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
              {/* Custom hex */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor || form.teamColor}
                  onChange={e => {
                    setCustomColor(e.target.value);
                    setForm(f => ({ ...f, teamColor: e.target.value }));
                  }}
                  className="w-9 h-9 rounded-full cursor-pointer border-2 border-border p-0.5"
                  title="Custom color"
                />
                <span className="text-xs text-muted-foreground">Custom</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Phone size={13} />
            <span>Contact</span>
          </div>
          <div className="card-section-body space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                <Phone size={11} className="inline mr-1" />Mobile number
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="field-input w-full"
                placeholder="(360) 555-0100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                <Mail size={11} className="inline mr-1" />Email address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="field-input w-full"
                placeholder="you@handypioneers.com"
              />
            </div>
          </div>
        </section>

        {/* ── Password ── */}
        <section className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Lock size={13} />
            <span>Password</span>
          </div>
          <div className="card-section-body space-y-3">
            <p className="text-xs text-muted-foreground">Leave blank to keep your current password.</p>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  className="field-input w-full pr-10"
                  placeholder="Enter your current password to continue"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="field-input w-full pr-10"
                  placeholder="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {newPw.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pwRules.map(r => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      <CheckCircle2 size={11} className={r.passed ? 'text-emerald-500' : 'text-muted-foreground/40'} />
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {newPw.length > 0 && (
              <button
                disabled={!pwValid || !currentPw}
                onClick={() => {
                  toast.success('Password updated');
                  setCurrentPw('');
                  setNewPw('');
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Update password
              </button>
            )}
          </div>
        </section>

        {/* Save footer */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {saved ? 'Saved!' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
