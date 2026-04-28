/**
 * AdminAccessDenied — shown when a user is authenticated
 * but their email is not on the admin allowlist.
 */
import { trpc } from "@/lib/trpc";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

export default function AdminAccessDenied({ email }: { email?: string | null }) {
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-md p-10 text-center">
        <img
          src={HP_LOGO}
          alt="Handy Pioneers"
          className="h-12 w-12 object-contain rounded-md mx-auto mb-6"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />

        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h1>
        <p className="text-sm text-gray-500 mb-1">
          Your account is not authorized to access the Handy Pioneers field estimator.
        </p>
        {email && (
          <p className="text-xs text-gray-400 mb-6">
            Signed in as <span className="font-medium text-gray-600">{email}</span>
          </p>
        )}

        <p className="text-sm text-gray-500 mb-8">
          Contact your administrator to request access.
        </p>

        <div className="space-y-3">
          <a
            href="mailto:help@handypioneers.com?subject=Access Request — Field Estimator"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            Request Access
          </a>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="block w-full text-center border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-400">
          (360) 544-9858 · help@handypioneers.com
        </p>
      </div>
    </div>
  );
}
