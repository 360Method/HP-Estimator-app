// ============================================================
// RolesSettings — Custom Roles & Permissions Builder
// Admins can create, edit, and delete custom roles with
// per-module permission toggles (view/create/edit/delete/manage)
// System roles (Owner, Admin) are locked.
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { CustomRole, PermissionModule, PermissionAction, RolePermissions } from '@/lib/types';
import { Shield, Plus, Pencil, Trash2, Lock, Check, X, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';

// ── Permission module metadata ───────────────────────────────
const MODULES: { id: PermissionModule; label: string; icon: string }[] = [
  { id: 'customers',  label: 'Customers',   icon: '👤' },
  { id: 'leads',      label: 'Leads',       icon: '⭐' },
  { id: 'estimates',  label: 'Estimates',   icon: '📄' },
  { id: 'jobs',       label: 'Jobs',        icon: '🔨' },
  { id: 'invoices',   label: 'Invoices',    icon: '💳' },
  { id: 'pipeline',   label: 'Pipeline',    icon: '📊' },
  { id: 'schedule',   label: 'Schedule',    icon: '📅' },
  { id: 'reports',    label: 'Reports',     icon: '📈' },
  { id: 'marketing',  label: 'Marketing',   icon: '📣' },
  { id: 'priceBook',  label: 'Price Book',  icon: '💰' },
  { id: 'team',       label: 'Team',        icon: '👥' },
  { id: 'settings',   label: 'Settings',    icon: '⚙️' },
];

const ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view',   label: 'View'   },
  { id: 'create', label: 'Create' },
  { id: 'edit',   label: 'Edit'   },
  { id: 'delete', label: 'Delete' },
  { id: 'manage', label: 'Manage' },
];

const PRESET_COLORS = [
  '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b',
  '#ec4899', '#ef4444', '#6366f1', '#14b8a6',
];

// ── Full-access permission set ───────────────────────────────
function fullAccess(): RolePermissions {
  return Object.fromEntries(
    MODULES.map(m => [m.id, { view: true, create: true, edit: true, delete: true, manage: true }])
  ) as RolePermissions;
}

function readOnly(): RolePermissions {
  return Object.fromEntries(
    MODULES.map(m => [m.id, { view: true, create: false, edit: false, delete: false, manage: false }])
  ) as RolePermissions;
}

function emptyPermissions(): RolePermissions {
  return Object.fromEntries(
    MODULES.map(m => [m.id, { view: false, create: false, edit: false, delete: false, manage: false }])
  ) as RolePermissions;
}

// ── Role Editor Modal ────────────────────────────────────────
interface EditorProps {
  initial: CustomRole | null;  // null = create new
  onSave: (role: CustomRole) => void;
  onClose: () => void;
}

function RoleEditorModal({ initial, onSave, onClose }: EditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[2]);
  const [permissions, setPermissions] = useState<RolePermissions>(
    initial?.permissions ?? emptyPermissions()
  );
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const isSystem = initial?.isSystem ?? false;

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const togglePerm = (mod: PermissionModule, action: PermissionAction) => {
    if (isSystem) return;
    setPermissions(prev => ({
      ...prev,
      [mod]: {
        ...prev[mod],
        [action]: !(prev[mod]?.[action] ?? false),
      },
    }));
  };

  const setModuleAll = (mod: PermissionModule, val: boolean) => {
    if (isSystem) return;
    setPermissions(prev => ({
      ...prev,
      [mod]: Object.fromEntries(ACTIONS.map(a => [a.id, val])) as Record<PermissionAction, boolean>,
    }));
  };

  const applyPreset = (preset: 'full' | 'readonly' | 'empty') => {
    if (isSystem) return;
    if (preset === 'full') setPermissions(fullAccess());
    else if (preset === 'readonly') setPermissions(readOnly());
    else setPermissions(emptyPermissions());
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Role name is required'); return; }
    onSave({
      id: initial?.id ?? nanoid(8),
      name: name.trim(),
      description: description.trim(),
      color,
      isSystem: initial?.isSystem ?? false,
      permissions,
    });
  };

  const modulePermCount = (mod: PermissionModule) =>
    ACTIONS.filter(a => permissions[mod]?.[a.id]).length;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: color }}>
              <Shield size={14} />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {initial ? (isSystem ? 'View Role' : 'Edit Role') : 'Create Role'}
            </h2>
            {isSystem && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                <Lock size={9} /> System Role
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name + Color */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isSystem}
                placeholder="e.g. Senior Estimator"
                className="field-input w-full disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    disabled={isSystem}
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full transition-all disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `3px solid ${c}` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
                {!isSystem && (
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-7 h-7 rounded-full cursor-pointer border-0 p-0 bg-transparent"
                    title="Custom color"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isSystem}
              rows={2}
              placeholder="Describe what this role can do..."
              className="field-input w-full resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Presets */}
          {!isSystem && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground">Quick preset:</span>
              <button onClick={() => applyPreset('full')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors">Full Access</button>
              <button onClick={() => applyPreset('readonly')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">Read Only</button>
              <button onClick={() => applyPreset('empty')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">No Access</button>
            </div>
          )}

          {/* Permission Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permissions</label>
              <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold text-muted-foreground pr-1">
                {ACTIONS.map(a => <span key={a.id} className="w-12 text-center">{a.label}</span>)}
              </div>
            </div>

            {MODULES.map(mod => {
              const count = modulePermCount(mod.id);
              const expanded = expandedModules.has(mod.id);
              return (
                <div key={mod.id} className="rounded-xl border border-border/60 overflow-hidden">
                  {/* Module row header */}
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleModule(mod.id)}
                  >
                    <span className="text-sm">{mod.icon}</span>
                    <span className="flex-1 text-sm font-semibold text-foreground">{mod.label}</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{count}/{ACTIONS.length}</span>

                    {/* Desktop: inline toggles */}
                    <div className="hidden sm:flex items-center gap-3" onClick={e => e.stopPropagation()}>
                      {ACTIONS.map(action => {
                        const val = permissions[mod.id]?.[action.id] ?? false;
                        return (
                          <button
                            key={action.id}
                            onClick={() => togglePerm(mod.id, action.id)}
                            disabled={isSystem}
                            title={action.label}
                            className={`w-12 h-6 rounded-md text-[10px] font-bold transition-colors disabled:cursor-not-allowed
                              ${val
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                          >
                            {val ? <Check size={10} className="mx-auto" /> : <X size={10} className="mx-auto" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Mobile: expand chevron */}
                    <span className="sm:hidden text-muted-foreground">
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>

                    {/* Select All / None */}
                    {!isSystem && (
                      <div className="hidden sm:flex gap-1 ml-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModuleAll(mod.id, true)} className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-bold">All</button>
                        <button onClick={() => setModuleAll(mod.id, false)} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors font-bold">None</button>
                      </div>
                    )}
                  </div>

                  {/* Mobile expanded toggles */}
                  {expanded && (
                    <div className="sm:hidden px-4 py-3 grid grid-cols-2 gap-2">
                      {ACTIONS.map(action => {
                        const val = permissions[mod.id]?.[action.id] ?? false;
                        return (
                          <button
                            key={action.id}
                            onClick={() => togglePerm(mod.id, action.id)}
                            disabled={isSystem}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed
                              ${val ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground'}`}
                          >
                            {val ? <Check size={12} /> : <X size={12} />}
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            {isSystem ? 'Close' : 'Cancel'}
          </button>
          {!isSystem && (
            <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              {initial ? 'Save Changes' : 'Create Role'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main RolesSettings page ──────────────────────────────────
export default function RolesSettings() {
  const { state, upsertCustomRole, removeCustomRole } = useEstimator();
  const [editing, setEditing] = useState<CustomRole | null | undefined>(undefined); // undefined = closed, null = new
  const roles = state.customRoles;

  const handleSave = (role: CustomRole) => {
    upsertCustomRole(role);
    setEditing(undefined);
    toast.success(role.isSystem ? 'Role updated' : `Role "${role.name}" saved`);
  };

  const handleDelete = (role: CustomRole) => {
    if (role.isSystem) return;
    if (!window.confirm(`Delete role "${role.name}"? Team members with this role will need to be reassigned.`)) return;
    removeCustomRole(role.id);
    toast.success(`Role "${role.name}" deleted`);
  };

  const handleDuplicate = (role: CustomRole) => {
    const copy: CustomRole = {
      ...role,
      id: nanoid(8),
      name: `${role.name} (Copy)`,
      isSystem: false,
    };
    upsertCustomRole(copy);
    toast.success(`Duplicated as "${copy.name}"`);
    setEditing(copy);
  };

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define what each role can see and do across the app.
          </p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} /> New Role
        </button>
      </div>

      {/* System roles */}
      <section className="card-section">
        <div className="card-section-header">
          <Lock size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">System Roles</span>
          <span className="ml-auto text-xs text-muted-foreground">Cannot be modified or deleted</span>
        </div>
        <div className="card-section-body divide-y divide-border/60">
          {systemRoles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={() => setEditing(role)}
              onDelete={() => handleDelete(role)}
              onDuplicate={() => handleDuplicate(role)}
            />
          ))}
        </div>
      </section>

      {/* Custom roles */}
      {customRoles.length > 0 && (
        <section className="card-section">
          <div className="card-section-header">
            <Shield size={13} />
            <span className="text-xs font-bold uppercase tracking-wider">Custom Roles</span>
            <span className="ml-auto text-xs text-muted-foreground">{customRoles.length} role{customRoles.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card-section-body divide-y divide-border/60">
            {customRoles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={() => setEditing(role)}
                onDelete={() => handleDelete(role)}
                onDuplicate={() => handleDuplicate(role)}
              />
            ))}
          </div>
        </section>
      )}

      {customRoles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-2xl">
          <Shield size={32} className="text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No custom roles yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Create a role to define specific access levels for your team.</p>
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Create Your First Role
          </button>
        </div>
      )}

      {/* Permission legend */}
      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Permission Legend</span></div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACTIONS.map(a => (
            <div key={a.id} className="flex items-start gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary min-w-[52px] text-center">{a.label}</span>
              <span className="text-xs text-muted-foreground">
                {a.id === 'view'   && 'Can see records and data in this module'}
                {a.id === 'create' && 'Can add new records'}
                {a.id === 'edit'   && 'Can modify existing records'}
                {a.id === 'delete' && 'Can permanently remove records'}
                {a.id === 'manage' && 'Can change settings and configuration for this module'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Editor modal */}
      {editing !== undefined && (
        <RoleEditorModal
          initial={editing}
          onSave={handleSave}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

// ── Role card ────────────────────────────────────────────────
function RoleCard({
  role, onEdit, onDelete, onDuplicate,
}: {
  role: CustomRole;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const grantedCount = MODULES.reduce((acc, m) => {
    return acc + ACTIONS.filter(a => role.permissions[m.id]?.[a.id]).length;
  }, 0);
  const totalPossible = MODULES.length * ACTIONS.length;

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: role.color }}
      >
        <Shield size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-foreground">{role.name}</p>
          {role.isSystem && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-muted text-muted-foreground">
              <Lock size={8} /> System
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{role.description}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(grantedCount / totalPossible) * 100}%`, backgroundColor: role.color }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{grantedCount}/{totalPossible} permissions</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onDuplicate} title="Duplicate" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Copy size={13} />
        </button>
        <button onClick={onEdit} title={role.isSystem ? 'View' : 'Edit'} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Pencil size={13} />
        </button>
        {!role.isSystem && (
          <button onClick={onDelete} title="Delete" className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
