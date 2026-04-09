// ============================================================
// SettingsPage — Full settings system with sidebar navigation
// Sections: Global Settings / Feature Configurations / Tags & Tools / Integrations
// ============================================================

import { useState } from 'react';
import {
  ArrowLeft, Building2, CreditCard, Bell, Users,
  FileText, Receipt, Briefcase, UserPlus, GitBranch,
  BookOpen, CheckSquare, Tag, Zap, ChevronDown, ChevronRight,
  DollarSign, Layers, Settings, ShieldCheck, MapPin,
} from 'lucide-react';

// Sub-page imports
import CompanySettings from './CompanySettings';
import BillingSettings from './BillingSettings';
import NotificationsSettings from './NotificationsSettings';
import TeamSettings from './TeamSettings';
import EstimatesSettings from './EstimatesSettings';
import InvoicesSettings from './InvoicesSettings';
import JobsSettings from './JobsSettings';
import LeadsSettings from './LeadsSettings';
import PipelineSettings from './PipelineSettings';
import PriceBookSettings from './PriceBookSettings';
import ChecklistsSettings from './ChecklistsSettings';
import JobFieldsSettings from './JobFieldsSettings';
import LeadSourcesSettings from './LeadSourcesSettings';
import TagsSettings from './TagsSettings';
import IntegrationsSettings from './IntegrationsSettings';
import RolesSettings from './RolesSettings';
import AllowlistSettings from './AllowlistSettings';
import ServiceAreaSettings from './ServiceAreaSettings';

export type SettingsSection =
  | 'company' | 'billing' | 'notifications' | 'team' | 'roles' | 'allowlist'
  | 'estimates' | 'invoices' | 'jobs' | 'leads' | 'pipeline' | 'price-book'
  | 'checklists' | 'job-fields' | 'lead-sources' | 'tags'
  | 'integrations' | 'service-area';

interface NavGroup {
  label: string;
  items: { id: SettingsSection; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Global Settings',
    items: [
      { id: 'company',       label: 'Company',             icon: Building2   },
      { id: 'billing',       label: 'Billing',             icon: CreditCard  },
      { id: 'notifications', label: 'Notifications',       icon: Bell        },
      { id: 'team',          label: 'Team & Permissions',  icon: Users       },
      { id: 'roles',         label: 'Roles & Permissions', icon: Settings    },
      { id: 'allowlist',     label: 'Access Allowlist',    icon: ShieldCheck },
      { id: 'service-area',  label: 'Service Area',        icon: MapPin      },
    ],
  },
  {
    label: 'Feature Configurations',
    items: [
      { id: 'estimates',  label: 'Estimates',  icon: FileText  },
      { id: 'invoices',   label: 'Invoices',   icon: Receipt   },
      { id: 'jobs',       label: 'Jobs',       icon: Briefcase },
      { id: 'leads',      label: 'Leads',      icon: UserPlus  },
      { id: 'pipeline',   label: 'Pipeline',   icon: GitBranch },
      { id: 'price-book', label: 'Price Book', icon: BookOpen  },
    ],
  },
  {
    label: 'Tags & Tools',
    items: [
      { id: 'checklists',   label: 'Checklists',   icon: CheckSquare },
      { id: 'job-fields',   label: 'Job Fields',   icon: Layers      },
      { id: 'lead-sources', label: 'Lead Sources', icon: DollarSign  },
      { id: 'tags',         label: 'Tags',         icon: Tag         },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'integrations', label: 'Integrations', icon: Zap },
    ],
  },
];

interface Props {
  onBack: () => void;
  initialSection?: SettingsSection;
}

export default function SettingsPage({ onBack, initialSection = 'company' }: Props) {
  const [active, setActive] = useState<SettingsSection>(initialSection);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const activeItem = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === active);

  const renderPage = () => {
    switch (active) {
      case 'company':       return <CompanySettings />;
      case 'billing':       return <BillingSettings />;
      case 'notifications': return <NotificationsSettings />;
      case 'team':          return <TeamSettings />;
      case 'roles':         return <RolesSettings />;
      case 'allowlist':     return <AllowlistSettings />;
      case 'estimates':     return <EstimatesSettings />;
      case 'invoices':      return <InvoicesSettings />;
      case 'jobs':          return <JobsSettings />;
      case 'leads':         return <LeadsSettings />;
      case 'pipeline':      return <PipelineSettings />;
      case 'price-book':    return <PriceBookSettings />;
      case 'checklists':    return <ChecklistsSettings />;
      case 'job-fields':    return <JobFieldsSettings />;
      case 'lead-sources':  return <LeadSourcesSettings />;
      case 'tags':          return <TagsSettings />;
      case 'integrations':  return <IntegrationsSettings />;
      case 'service-area':  return <ServiceAreaSettings />;
    }
  };

  const SidebarContent = () => (
    <nav className="flex flex-col h-full">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings size={15} className="text-muted-foreground" />
          <span className="text-sm font-bold text-foreground">Settings</span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="hidden md:block p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Collapse sidebar"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map(group => {
          const collapsed = collapsedGroups.has(group.label);
          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {group.label}
                {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              </button>
              {!collapsed && group.items.map(item => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActive(item.id); setMobileSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold border-r-2 border-primary'
                        : 'text-foreground hover:bg-muted/60 font-normal'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">Handy Pioneers v1.0</p>
        <p className="text-[10px] text-muted-foreground">HANDYP*761NH · General Contractor</p>
      </div>
    </nav>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        {/* Mobile: show current section name + hamburger */}
        <button
          onClick={() => setMobileSidebarOpen(v => !v)}
          className="md:hidden flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          {activeItem && <activeItem.icon size={15} className="text-muted-foreground" />}
          {activeItem?.label ?? 'Settings'}
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>
        <h1 className="hidden md:block text-lg font-bold text-foreground">Settings</h1>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden md:flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ChevronRight size={12} className="rotate-180" /> Show sidebar
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        {sidebarOpen && (
          <aside className="hidden md:flex flex-col w-56 border-r border-border bg-background shrink-0 overflow-hidden">
            <SidebarContent />
          </aside>
        )}

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-[400] flex">
            <div className="w-64 bg-background border-r border-border h-full overflow-y-auto">
              <SidebarContent />
            </div>
            <div className="flex-1 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
