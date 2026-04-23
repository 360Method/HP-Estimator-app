/**
 * PortalJobs — customer-facing jobs list page.
 * Shows all approved estimates as active/completed jobs with links to detail pages.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";

function jobStatusBadge(status: string) {
  if (status === "completed" || status === "Invoice Paid" || status === "Invoice Sent") {
    return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">Completed</Badge>;
  }
  if (status === "approved") {
    return <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">In Progress</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">{status}</Badge>;
}

function jobStatusIcon(status: string) {
  if (status === "completed" || status === "Invoice Paid") {
    return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  }
  if (status === "approved") {
    return <Clock className="w-5 h-5 text-blue-500" />;
  }
  return <AlertCircle className="w-5 h-5 text-gray-400" />;
}

export default function PortalJobs() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getDashboard.useQuery();

  const estimates = data?.estimates ?? [];
  // Jobs = approved estimates (with or without hpOpportunityId)
  const jobs = estimates.filter((e) => e.status === "approved" || e.status === "completed");

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">My Jobs</h1>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No active jobs yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Jobs will appear here once an estimate is approved.
            </p>
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => {
                  if (job.hpOpportunityId) {
                    navigate(`/portal/job/${job.hpOpportunityId}`);
                  }
                }}
                disabled={!job.hpOpportunityId}
                className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all flex items-center gap-4 disabled:opacity-60 disabled:cursor-default"
              >
                <div className="shrink-0">{jobStatusIcon(job.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{job.title || `Job #${job.estimateNumber}`}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {job.estimateNumber}
                    {job.sentAt
                      ? ` · Approved ${new Date(job.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {jobStatusBadge(job.status)}
                  {job.hpOpportunityId && <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
