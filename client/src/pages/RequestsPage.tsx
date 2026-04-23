/**
 * RequestsPage — Admin view of online booking requests.
 * Shows all submitted requests from /book with customer details,
 * service info, timeline, photos, and a link to the created lead.
 *
 * "View Customer" fetches the customer + their leads from the DB,
 * injects them into EstimatorContext (in-memory state), then navigates
 * to the customer profile — bridging the DB ↔ localStorage gap.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Search, MapPin, Phone, Mail, Calendar,
  Image, ChevronDown, ChevronUp, ExternalLink, User,
} from "lucide-react";
import { useEstimator } from "@/contexts/EstimatorContext";
import type { Customer, Opportunity, PipelineArea, OpportunityStage } from "@/lib/types";

const TIMELINE_COLORS: Record<string, string> = {
  ASAP: "bg-red-100 text-red-700 border-red-200",
  "Within a week": "bg-amber-100 text-amber-700 border-amber-200",
  Flexible: "bg-green-100 text-green-700 border-green-200",
};

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Convert a DB customer row + DB opportunities into the in-memory Customer shape */
function dbToCustomer(dbCust: any, dbOpps: any[]): Customer {
  let tags: string[] = [];
  try { tags = JSON.parse(dbCust.tags ?? "[]"); } catch { tags = []; }

  const opportunities: Opportunity[] = dbOpps.map((o: any): Opportunity => ({
    id: o.id,
    area: (o.area ?? "lead") as PipelineArea,
    stage: (o.stage ?? "New Lead") as OpportunityStage,
    title: o.title ?? "",
    value: o.value ?? 0,
    jobNumber: o.jobNumber ?? undefined,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : (o.createdAt ?? new Date().toISOString()),
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : (o.updatedAt ?? new Date().toISOString()),
    notes: o.notes ?? "",
    archived: o.archived ?? false,
    archivedAt: o.archivedAt ?? undefined,
    sourceLeadId: o.sourceLeadId ?? undefined,
    sourceEstimateId: o.sourceEstimateId ?? undefined,
    convertedToEstimateAt: o.convertedToEstimateAt ?? undefined,
    convertedToJobAt: o.convertedToJobAt ?? undefined,
    sentAt: o.sentAt ?? undefined,
    wonAt: o.wonAt ?? undefined,
    scheduledDate: o.scheduledDate ?? undefined,
    scheduledEndDate: o.scheduledEndDate ?? undefined,
    scheduledDuration: o.scheduledDuration ?? undefined,
    assignedTo: o.assignedTo ?? undefined,
    scheduleNotes: o.scheduleNotes ?? undefined,
    tasks: (() => { try { return JSON.parse(o.tasks ?? "null") ?? undefined; } catch { return undefined; } })(),
    attachments: (() => { try { return JSON.parse(o.attachments ?? "null") ?? undefined; } catch { return undefined; } })(),
    jobActivity: (() => { try { return JSON.parse(o.jobActivity ?? "null") ?? undefined; } catch { return undefined; } })(),
    clientSnapshot: (() => { try { return JSON.parse(o.clientSnapshot ?? "null") ?? undefined; } catch { return undefined; } })(),
  }));

  return {
    id: dbCust.id,
    firstName: dbCust.firstName ?? "",
    lastName: dbCust.lastName ?? "",
    displayName: dbCust.displayName ?? "",
    company: dbCust.company ?? "",
    mobilePhone: dbCust.mobilePhone ?? "",
    homePhone: dbCust.homePhone ?? "",
    workPhone: dbCust.workPhone ?? "",
    email: dbCust.email ?? "",
    role: dbCust.role ?? "",
    customerType: (dbCust.customerType ?? "homeowner") as "homeowner" | "business",
    doNotService: dbCust.doNotService ?? false,
    street: dbCust.street ?? "",
    unit: dbCust.unit ?? "",
    city: dbCust.city ?? "",
    state: dbCust.state ?? "",
    zip: dbCust.zip ?? "",
    addressNotes: dbCust.addressNotes ?? "",
    customerNotes: dbCust.customerNotes ?? "",
    billsTo: dbCust.billsTo ?? "",
    tags,
    leadSource: (dbCust.leadSource ?? "") as any,
    referredBy: dbCust.referredBy ?? "",
    sendNotifications: dbCust.sendNotifications ?? true,
    sendMarketingOptIn: dbCust.sendMarketingOptIn ?? false,
    defaultTaxCode: dbCust.defaultTaxCode ?? undefined,
    createdAt: dbCust.createdAt instanceof Date ? dbCust.createdAt.toISOString() : (dbCust.createdAt ?? new Date().toISOString()),
    lifetimeValue: dbCust.lifetimeValue ?? 0,
    outstandingBalance: dbCust.outstandingBalance ?? 0,
    opportunities,
  };
}

interface RequestCardProps {
  req: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    zip: string;
    street: string;
    unit?: string | null;
    city: string;
    state: string;
    serviceType: string;
    description?: string | null;
    timeline: string | null;
    photoUrls?: string | null;
    smsConsent: boolean;
    customerId?: string | null;
    leadId?: string | null;
    createdAt: Date | string | null;
    readAt?: Date | string | null;
  };
}

function RequestCard({ req }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const { state, addCustomer, setActiveCustomer } = useEstimator();
  const utils = trpc.useUtils();
  const markRead = trpc.booking.markRead.useMutation({
    onSuccess: () => utils.booking.unreadCount.invalidate(),
  });
  const isUnread = !req.readAt;

  const goToCustomer = async (customerId: string) => {
    setLoading(true);
    try {
      // Check if already in local state
      const existing = state.customers.find(c => c.id === customerId);
      if (!existing) {
        // Fetch from DB and inject into local state
        const [dbCust, dbOpps] = await Promise.all([
          utils.customers.get.fetch({ id: customerId }),
          utils.opportunities.list.fetch({ customerId, archived: false }),
        ]);
        if (!dbCust) {
          toast.error("Customer not found in database.");
          return;
        }
        const customer = dbToCustomer(dbCust, dbOpps);
        addCustomer(customer);
      }
      // setActiveCustomer already sets activeSection='customer' and loads the profile.
      // Do NOT call navigateToTopLevel here — it would clear activeCustomerId back to null.
      setActiveCustomer(customerId);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  };

  const photos: string[] = (() => {
    try { return JSON.parse(req.photoUrls ?? "[]"); } catch { return []; }
  })();

  const address = [req.street, req.unit, req.city, req.state, req.zip].filter(Boolean).join(", ");

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">
                {req.firstName} {req.lastName}
              </p>
              {isUnread && (
                <span className="inline-flex items-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide">
                  New
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{formatDate(req.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TIMELINE_COLORS[req.timeline ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
          >
            {req.timeline}
          </span>
          <button
            onClick={() => {
              const opening = !expanded;
              setExpanded((p) => !p);
              if (opening && isUnread) markRead.mutate({ id: req.id });
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          {req.city}, {req.state} {req.zip}
        </span>
        <span className="flex items-center gap-1">
          <Phone className="w-3.5 h-3.5 text-gray-400" />
          {req.phone}
        </span>
        <span className="flex items-center gap-1">
          <Mail className="w-3.5 h-3.5 text-gray-400" />
          {req.email}
        </span>
        {photos.length > 0 && (
          <span className="flex items-center gap-1 text-blue-600">
            <Image className="w-3.5 h-3.5" />
            {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          {/* Service type */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Service</p>
            <p className="text-sm text-gray-800">{req.serviceType}</p>
          </div>

          {/* Description */}
          {req.description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.description}</p>
            </div>
          )}

          {/* Address */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Service Address</p>
            <p className="text-sm text-gray-700">{address}</p>
          </div>

          {/* SMS consent */}
          <div className="flex items-center gap-2">
            <Badge variant={req.smsConsent ? "default" : "secondary"} className="text-xs">
              SMS {req.smsConsent ? "Opted In" : "No Consent"}
            </Badge>
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Photos</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="w-20 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {req.customerId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => goToCustomer(req.customerId!)}
                disabled={loading}
                className="text-xs h-7"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3 mr-1" />
                )}
                View Customer
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  const [search, setSearch] = useState("");

  const { data: requests, isLoading } = trpc.booking.listRequests.useQuery({ limit: 200 });

  const filtered = (requests ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.firstName.toLowerCase().includes(q) ||
      r.lastName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.zip.includes(q) ||
      r.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Online Requests</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Submitted via <span className="font-mono text-xs">client.handypioneers.com/book</span>
              </p>
            </div>
            {requests && (
              <Badge variant="secondary" className="text-sm">
                {requests.length} total
              </Badge>
            )}
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, email, phone, zip…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading requests…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">
              {search ? "No matching requests." : "No online requests yet."}
            </p>
            {!search && (
              <p className="text-sm mt-1">
                Requests submitted at{" "}
                <a
                  href="https://client.handypioneers.com/book"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                >
                  client.handypioneers.com/book
                </a>{" "}
                will appear here.
              </p>
            )}
          </div>
        ) : (
          filtered.map((req) => <RequestCard key={req.id} req={req} />)
        )}
      </div>
    </div>
  );
}
