import { useState } from 'react';
import { Users, Crown, Shield, Hammer, Clipboard, UserPlus, Trash2, Mail, ChevronDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useEstimator } from '@/contexts/EstimatorContext';

type Role = 'Owner' | 'Admin' | 'Estimator' | 'Field Tech' | 'Office Manager';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  color: string;
  initials: string;
  status: 'Active' | 'Invited' | 'Inactive';
  joinedAt: string;
}

const ROLE_META: Record<Role, { icon: React.ElementType; color: string; description: string }> = {
  Owner:          { icon: Crown,     color: 'bg-amber-100 text-amber-700',   description: 'Full access to all settings, billing, and team management' },
  Admin:          { icon: Shield,    color: 'bg-blue-100 text-blue-700',     description: 'All access except billing and owner-level settings' },
  Estimator:      { icon: Clipboard, color: 'bg-purple-100 text-purple-700', description: 'Create and send estimates, manage leads and customers' },
  'Field Tech':   { icon: Hammer,    color: 'bg-green-100 text-green-700',   description: 'View assigned jobs, update status, add photos and notes' },
  'Office Manager': { icon: Users,   color: 'bg-pink-100 text-pink-700',     description: 'Manage customers, scheduling, invoices, and communications' },
};

const PERMISSIONS: { label: string; owner: boolean; admin: boolean; estimator: boolean; fieldTech: boolean; officeManager: boolean }[] = [
  { label: 'View all customers',       owner: true,  admin: true,  estimator: true,  fieldTech: false, officeManager: true  },
  { label: 'Create / edit customers',  owner: true,  admin: true,  estimator: true,  fieldTech: false, officeManager: true  },
  { label: 'Create estimates',         owner: true,  admin: true,  estimator: true,  fieldTech: false, officeManager: false },
  { label: 'Send estimates',           owner: true,  admin: true,  estimator: true,  fieldTech: false, officeManager: false },
  { label: 'Create jobs',              owner: true,  admin: true,  estimator: false, fieldTech: false, officeManager: true  },
  { label: 'View assigned jobs',       owner: true,  admin: true,  estimator: true,  fieldTech: true,  officeManager: true  },
  { label: 'Update job status',        owner: true,  admin: true,  estimator: false, fieldTech: true,  officeManager: true  },
  { label: 'Create invoices',          owner: true,  admin: true,  estimator: false, fieldTech: false, officeManager: true  },
  { label: 'Collect payments',         owner: true,  admin: true,  estimator: false, fieldTech: false, officeManager: true  },
  { label: 'View reports',             owner: true,  admin: true,  estimator: false, fieldTech: false, officeManager: true  },
  { label: 'Manage team',              owner: true,  admin: false, estimator: false, fieldTech: false, officeManager: false },
  { label: 'Access billing',           owner: true,  admin: false, estimator: false, fieldTech: false, officeManager: false },
  { label: 'Edit company settings',    owner: true,  admin: true,  estimator: false, fieldTech: false, officeManager: false },
];

const INITIAL_TEAM: TeamMember[] = [
  {
    id: '1',
    name: 'Handy Pioneers Owner',
    email: 'help@handypioneers.com',
    phone: '(360) 544-9858',
    role: 'Owner',
    color: '#d97706',
    initials: 'HP',
    status: 'Active',
    joinedAt: 'Jan 1, 2024',
  },
];

const ROLES: Role[] = ['Owner', 'Admin', 'Estimator', 'Field Tech', 'Office Manager'];

export default function TeamSettings() {
  const { state } = useEstimator();
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Field Tech');
  const [inviteName, setInviteName] = useState('');
  const [tab, setTab] = useState<'members' | 'permissions'>('members');

  // Merge system role names with any custom role names for the invite selector
  const allRoleNames = [
    ...ROLES.filter(r => r !== 'Owner'),
    ...state.customRoles.filter(r => !r.isSystem).map(r => r.name as Role),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const sendInvite = () => {
    if (!inviteEmail || !inviteName) { toast.error('Name and email are required'); return; }
    const initials = inviteName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    setTeam(prev => [...prev, {
      id: Date.now().toString(),
      name: inviteName,
      email: inviteEmail,
      phone: '',
      role: inviteRole,
      color: colors[Math.floor(Math.random() * colors.length)],
      initials,
      status: 'Invited',
      joinedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }]);
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail(''); setInviteName(''); setShowInvite(false);
  };

  const removeTeamMember = (id: string) => {
    if (id === '1') { toast.error('Cannot remove the owner account'); return; }
    setTeam(prev => prev.filter(m => m.id !== id));
    toast.success('Team member removed');
  };

  const Check = ({ v }: { v: boolean }) => (
    <span className={`text-sm ${v ? 'text-green-600' : 'text-muted-foreground/40'}`}>{v ? '✓' : '—'}</span>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Team & Permissions</h2>
        <button
          onClick={() => setShowInvite(v => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={14} /> Invite Member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <section className="card-section border-primary/30">
          <div className="card-section-header">
            <Mail size={13} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Invite Team Member</span>
          </div>
          <div className="card-section-body grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="field-label">Full name</label>
              <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" className="field-input" />
            </div>
            <div>
              <label className="field-label">Email address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@example.com" className="field-input" />
            </div>
            <div>
              <label className="field-label">Role</label>
              <div className="relative">
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} className="field-input pr-8 appearance-none">
                  {allRoleNames.map(r => <option key={r}>{r}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button onClick={sendInvite} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
                Send Invite
              </button>
              <button onClick={() => setShowInvite(false)} className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {[['members', 'Team Members'], ['permissions', 'Permission Matrix']] .map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as 'members' | 'permissions')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="space-y-3">
          {team.map(member => {
            const meta = ROLE_META[member.role];
            const Icon = meta.icon;
            return (
              <div key={member.id} className="card-section">
                <div className="card-section-body flex items-center gap-4">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{member.name}</p>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.color}`}>
                        <Icon size={9} /> {member.role}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        member.status === 'Active' ? 'bg-green-100 text-green-700' :
                        member.status === 'Invited' ? 'bg-blue-100 text-blue-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {member.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
                    <p className="text-[10px] text-muted-foreground/60">Joined {member.joinedAt}</p>
                  </div>

                  {/* Actions */}
                  {member.id !== '1' && (
                    <button
                      onClick={() => removeTeamMember(member.id)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'permissions' && (
        <section className="card-section overflow-x-auto">
          <div className="card-section-header">
            <Shield size={13} />
            <span className="text-xs font-bold uppercase tracking-wider">Permission Matrix</span>
          </div>
          <div className="card-section-body p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground w-48">Permission</th>
                  {(['Owner', 'Admin', 'Estimator', 'Field Tech', 'Office Manager'] as Role[]).map(r => {
                    const meta = ROLE_META[r];
                    const Icon = meta.icon;
                    return (
                      <th key={r} className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${meta.color}`}>
                            <Icon size={8} /> {r}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {PERMISSIONS.map(p => (
                  <tr key={p.label} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-foreground">{p.label}</td>
                    <td className="px-3 py-2.5 text-center"><Check v={p.owner} /></td>
                    <td className="px-3 py-2.5 text-center"><Check v={p.admin} /></td>
                    <td className="px-3 py-2.5 text-center"><Check v={p.estimator} /></td>
                    <td className="px-3 py-2.5 text-center"><Check v={p.fieldTech} /></td>
                    <td className="px-3 py-2.5 text-center"><Check v={p.officeManager} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Custom roles notice */}
      {state.customRoles.filter(r => !r.isSystem).length > 0 && (
        <section className="card-section border-primary/20">
          <div className="card-section-header">
            <Shield size={13} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Custom Roles Active</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {state.customRoles.filter(r => !r.isSystem).length} custom role{state.customRoles.filter(r => !r.isSystem).length !== 1 ? 's' : ''} defined
            </span>
          </div>
          <div className="card-section-body">
            <div className="flex flex-wrap gap-2">
              {state.customRoles.filter(r => !r.isSystem).map(role => (
                <span key={role.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: role.color }}>
                  <Shield size={9} /> {role.name}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Custom roles are available in the invite form above. Manage them in{' '}
              <span className="text-primary font-semibold">Settings → Roles & Permissions</span>.
            </p>
          </div>
        </section>
      )}

      {/* Role descriptions */}
      <section className="card-section">
        <div className="card-section-header">
          <Users size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">Role Descriptions</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([role, meta]) => {
            const Icon = meta.icon;
            return (
              <div key={role} className="flex items-start gap-2.5 p-3 rounded-xl border border-border">
                <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${meta.color}`}>
                  <Icon size={10} /> {role}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
