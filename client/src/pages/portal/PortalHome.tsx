/**
 * PortalHome — Customer portal dashboard.
 * Shows: profile summary, pending estimates, open invoices, upcoming appointments.
 * Mobile-first, HP brand colors (forest green / warm gold).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  ClipboardList,
  FileText,
  Calendar,
  MessageSquare,
  ChevronRight,
  User,
  Phone,
  MapPin,
  Mail,
  Edit2,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
} from "lucide-react";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function EstimateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    sent: { bg: "bg-blue-100 text-blue-700", icon: <Clock className="w-3 h-3" />, label: "Awaiting Review" },
    viewed: { bg: "bg-yellow-100 text-yellow-700", icon: <Clock className="w-3 h-3" />, label: "Viewed" },
    approved: { bg: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3 h-3" />, label: "Approved" },
    declined: { bg: "bg-red-100 text-red-700", icon: <X className="w-3 h-3" />, label: "Declined" },
    expired: { bg: "bg-gray-100 text-gray-500", icon: <AlertCircle className="w-3 h-3" />, label: "Expired" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    sent: { bg: "bg-orange-100 text-orange-700", label: "Due" },
    due: { bg: "bg-orange-100 text-orange-700", label: "Due" },
    paid: { bg: "bg-green-100 text-green-700", label: "Paid" },
    partial: { bg: "bg-yellow-100 text-yellow-700", label: "Partial" },
    overdue: { bg: "bg-red-100 text-red-700", label: "Overdue" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>
      {s.label}
    </span>
  );
}

// ─── Profile Edit Card ────────────────────────────────────────────────────────
function ProfileCard({ customer, onUpdated }: {
  customer: { name: string; email: string; phone?: string | null; address?: string | null };
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");

  const updateMutation = trpc.portal.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      setEditing(false);
      onUpdated();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({ name, phone, address });
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setAddress(customer.address ?? "");
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#1a2e1a] flex items-center justify-center text-white font-bold text-sm">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{customer.name}</p>
            <p className="text-xs text-gray-500">{customer.email}</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(360) 000-0000"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Address</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Vancouver, WA"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white text-xs"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <a href={`tel:${customer.phone}`} className="hover:text-[#c8922a]">{customer.phone}</a>
            </div>
          )}
          {customer.address && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span>{customer.address}</span>
            </div>
          )}
          {!customer.phone && !customer.address && (
            <p className="text-xs text-gray-400 italic">
              Add your phone and address for faster service.{" "}
              <button onClick={() => setEditing(true)} className="text-[#c8922a] underline">Update now</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PortalHome() {
  const [, navigate] = useLocation();
  const { data, isLoading, refetch } = trpc.portal.getDashboard.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-[#c8922a]" />
        </div>
      </PortalLayout>
    );
  }

  const customer = data?.customer;
  const estimates = data?.estimates ?? [];
  const invoices = data?.invoices ?? [];
  const appointments = data?.appointments ?? [];
  const unreadMessages = data?.unreadMessages ?? 0;

  const pendingEstimates = estimates.filter((e) => e.status === "sent" || e.status === "viewed");
  const openInvoices = invoices.filter((i) => i.status !== "paid");
  const overdueInvoices = openInvoices.filter(
    (i) => i.dueDate && new Date(i.dueDate) < new Date()
  );
  const upcomingAppts = appointments.filter(
    (a) => new Date(a.scheduledAt).getTime() >= Date.now() && a.status === "scheduled"
  );
  const totalDue = openInvoices.reduce((sum, inv) => sum + ((inv.amountDue ?? 0) - (inv.amountPaid ?? 0)), 0);

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400">Customer Portal &rsaquo; Home</p>

        {/* Welcome banner */}
        <div
          className="rounded-xl p-5 text-white"
          style={{ background: "linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)" }}
        >
          <p className="text-sm opacity-70 mb-1">Welcome back,</p>
          <h1 className="text-2xl font-bold">{customer?.name?.split(" ")[0] ?? "Customer"}</h1>
          {totalDue > 0 && (
            <p className="text-sm mt-2 opacity-90">
              You have{" "}
              <span className="font-bold" style={{ color: "#c8922a" }}>
                {fmtMoney(totalDue)}
              </span>{" "}
              outstanding balance.{" "}
              <button
                onClick={() => navigate("/portal/invoices")}
                className="underline opacity-80 hover:opacity-100"
              >
                View invoices →
              </button>
            </p>
          )}
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Pending Estimates",
              value: pendingEstimates.length,
              icon: <ClipboardList className="w-5 h-5" />,
              color: "text-blue-600",
              bg: "bg-blue-50",
              path: "/portal/estimates",
            },
            {
              label: "Open Invoices",
              value: openInvoices.length,
              icon: <FileText className="w-5 h-5" />,
              color: "text-orange-600",
              bg: "bg-orange-50",
              path: "/portal/invoices",
            },
            {
              label: "Upcoming Appts",
              value: upcomingAppts.length,
              icon: <Calendar className="w-5 h-5" />,
              color: "text-green-600",
              bg: "bg-green-50",
              path: "/portal/appointments",
            },
            {
              label: "Messages",
              value: unreadMessages,
              icon: <MessageSquare className="w-5 h-5" />,
              color: "text-purple-600",
              bg: "bg-purple-50",
              path: "/portal/messages",
            },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => navigate(stat.path)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className={`w-9 h-9 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-2`}>
                {stat.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Profile */}
          {customer && (
            <ProfileCard customer={customer} onUpdated={() => refetch()} />
          )}

          {/* Right: Upcoming appointment */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">Upcoming Appointments</h3>
              <button
                onClick={() => navigate("/portal/appointments")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            {upcomingAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Calendar className="w-10 h-10 mb-2 text-gray-200" />
                <p className="text-sm">No upcoming appointments</p>
                <button
                  onClick={() => navigate("/portal/messages")}
                  className="mt-2 text-xs text-[#c8922a] hover:underline"
                >
                  Message us to schedule →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppts.slice(0, 3).map((appt) => (
                  <div key={appt.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{appt.title}</p>
                      <p className="text-xs text-gray-500">{fmtDateShort(appt.scheduledAt)}</p>
                      {appt.techName && (
                        <p className="text-xs text-gray-400">Tech: {appt.techName}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Estimates */}
        {pendingEstimates.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Estimates Awaiting Your Review</h3>
              <button
                onClick={() => navigate("/portal/estimates")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingEstimates.slice(0, 5).map((est) => (
                <button
                  key={est.id}
                  onClick={() => navigate(`/portal/estimates/${est.id}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <ClipboardList className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {est.estimateNumber} — {est.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sent {fmtDate(est.sentAt)} · {fmtMoney(est.totalAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <EstimateStatusBadge status={est.status} />
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open Invoices */}
        {/* Overdue alert banner */}
        {overdueInvoices.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">
                {overdueInvoices.length === 1 ? '1 invoice is overdue' : `${overdueInvoices.length} invoices are overdue`}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Please pay the outstanding balance to avoid service interruptions.
              </p>
            </div>
            <button
              onClick={() => navigate('/portal/invoices')}
              className="text-xs font-semibold text-red-700 underline shrink-0"
            >
              View
            </button>
          </div>
        )}

        {openInvoices.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Outstanding Invoices</h3>
              <button
                onClick={() => navigate("/portal/invoices")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {openInvoices.slice(0, 5).map((inv) => {
                const balance = (inv.amountDue ?? 0) - (inv.amountPaid ?? 0);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    {inv.dueDate && new Date(inv.dueDate) < new Date() ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                    )}
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {inv.invoiceNumber} — {inv.jobTitle ?? inv.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        Due {fmtDate(inv.dueDate)} · Balance {fmtMoney(balance)}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <InvoiceStatusBadge
                        status={inv.dueDate && new Date(inv.dueDate) < new Date() ? "overdue" : inv.status}
                      />
                      <Button
                        size="sm"
                        className="bg-[#2D5016] hover:bg-[#1a2e0d] text-white text-xs h-7 px-2 gap-1"
                        onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                      >
                        <CreditCard className="w-3 h-3" /> Pay
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state: no activity */}
        {estimates.length === 0 && invoices.length === 0 && appointments.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "rgba(200,146,42,0.1)" }}
            >
              <User className="w-7 h-7" style={{ color: "#c8922a" }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Welcome to Your Portal</h3>
            <p className="text-sm text-gray-500 mb-4">
              Your estimates, invoices, and appointments will appear here once your project is underway.
            </p>
            <Button
              onClick={() => navigate("/portal/messages")}
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Send a Message
            </Button>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
