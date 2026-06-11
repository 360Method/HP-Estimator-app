// ClientUmbrellaContext — Phase D transport.
//
// A small read context scoped to the single-client view. CustomerSection builds
// the value from its existing state/handlers and wraps its render in the
// provider; the extracted tab/panel components read what they need via
// useClientUmbrella(). This is a pure pass-through to enable moving the big
// inline pieces out of CustomerSection — it is NOT a migration of the global
// EstimatorContext (those useState/useEstimator calls stay in CustomerSection).
import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import type {
  JobInfo, CustomerProfile, Customer, Opportunity, AppSection, LeadSource,
  CustomerProfileTab, PipelineArea,
} from '@/lib/types';
import type { ThreeSixtyPhaseId } from '@/lib/threeSixtyMethod';

// The EstimatorContext ops are re-exposed as-is; type them off the hook so the
// signatures stay identical to source and assignability is guaranteed.
type EstimatorCtx = ReturnType<typeof useEstimator>;

export type IntakeArea = 'lead' | 'estimate' | 'job';

// Inline-shaped local UI state, matching CustomerSection's useState declarations.
export interface ContactDraft {
  client: string;
  companyName: string;
  phone: string;
  email: string;
  additionalPhones: { label: string; number: string }[];
  additionalEmails: { label: string; address: string }[];
}
export interface JobDetailsDraft {
  estimator: string;
  jobNumber: string;
  scope: string;
}
export interface AddrForm {
  label: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  lat: number | undefined;
  lng: number | undefined;
  propertyNotes: string;
}
export interface LatLng { lat?: number; lng?: number }

export type QuickAction = 'sms' | 'email' | 'note' | null;

export interface ClientUmbrellaValue {
  // ── Data ──
  jobInfo: JobInfo;
  customerProfile: CustomerProfile;
  activeCustomer: Customer | undefined;
  activeCustomerId: string | null;
  activeOpportunityId: string | null;
  opportunities: Opportunity[];
  customerContext: any;
  customerContextLoading: boolean;
  launchGaps: any[];

  // ── ProfileTab-local UI state (declared in CustomerSection, exposed here) ──
  contactDraft: ContactDraft;
  setContactDraft: Dispatch<SetStateAction<ContactDraft>>;
  editingContact: boolean;
  setEditingContact: Dispatch<SetStateAction<boolean>>;
  jobDetailsDraft: JobDetailsDraft;
  setJobDetailsDraft: Dispatch<SetStateAction<JobDetailsDraft>>;
  newTag: string;
  setNewTag: Dispatch<SetStateAction<string>>;
  addingAddress: boolean;
  setAddingAddress: Dispatch<SetStateAction<boolean>>;
  editingAddressId: string | null;
  setEditingAddressId: Dispatch<SetStateAction<string | null>>;
  addrForm: AddrForm;
  setAddrForm: Dispatch<SetStateAction<AddrForm>>;
  addrLatLng: LatLng;
  setAddrLatLng: Dispatch<SetStateAction<LatLng>>;
  setQuickAction: Dispatch<SetStateAction<QuickAction>>;
  setShowCallPanel: Dispatch<SetStateAction<boolean>>;

  // ── Context setters / handlers ──
  setJobInfo: (payload: Partial<JobInfo>) => void;
  setCustomerProfile: (payload: Partial<CustomerProfile>) => void;
  setActiveOpportunity: (id: string | null) => void;
  setSection: (s: AppSection) => void;
  addTag: () => void;
  removeTag: (tag: string) => void;
  sendPortalInvite: () => void;
  handleAddAddress: (customerId: string, addr: any) => void;
  handleUpdateAddress: (customerId: string, addrId: string, patch: any) => void;
  handleRemoveAddress: (customerId: string, addrId: string) => void;
  handleSetPrimary: (customerId: string, addrId: string) => void;
  handleSetBilling: (customerId: string, addrId: string) => void;

  // ── tRPC mutation objects (used for .mutate / .isPending) ──
  syncToDbMutation: ReturnType<typeof trpc.customers.update.useMutation>;
  inviteToPortalMutation: ReturnType<typeof trpc.portal.inviteCustomerToPortal.useMutation>;

  // ── D4: shared 360 / opportunity panels ──
  activeCustomerTab: CustomerProfileTab;
  areaMap: Record<CustomerProfileTab, PipelineArea | null>;
  displayName: string;
  customerFullName: string;
  activeOpps: Opportunity[];
  // Derived 360 structures — typed loosely on purpose (pass-through transport only).
  activeProperty: any;
  propertyBoard: any;
  threeSixtyStatus: any;
  membershipEnginePlan: any;
  selectedPropertyPhase: ThreeSixtyPhaseId;
  setSelectedPropertyPhase: Dispatch<SetStateAction<ThreeSixtyPhaseId>>;
  addOpportunity: EstimatorCtx['addOpportunity'];
  updateOpportunity: EstimatorCtx['updateOpportunity'];
  removeOpportunity: EstimatorCtx['removeOpportunity'];
  convertLeadToEstimate: EstimatorCtx['convertLeadToEstimate'];
  convertEstimateToJob: EstimatorCtx['convertEstimateToJob'];
  archiveJob: EstimatorCtx['archiveJob'];
  createOpportunityMutation: ReturnType<typeof trpc.opportunities.create.useMutation>;
  setIntakeModal: Dispatch<SetStateAction<IntakeArea | null>>;
  setShowDuplicateWarning: Dispatch<SetStateAction<{ area: IntakeArea; existing: string } | null>>;
  handleTabClick: (tab: CustomerProfileTab) => void;

  // ── D6: tab compositions ──
  hotOpps: Opportunity[];
  leadOpps: Opportunity[];
  estimateOpps: Opportunity[];
  jobOpps: Opportunity[];
  newNote: string;
  setNewNote: Dispatch<SetStateAction<string>>;
  addNote: () => void;
}

const ClientUmbrellaContext = createContext<ClientUmbrellaValue | null>(null);

export default ClientUmbrellaContext;

export function useClientUmbrella(): ClientUmbrellaValue {
  const v = useContext(ClientUmbrellaContext);
  if (!v) {
    throw new Error('useClientUmbrella must be used within a CustomerSection ClientUmbrella provider');
  }
  return v;
}
