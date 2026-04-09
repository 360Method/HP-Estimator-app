/**
 * AdminLogin — branded login page for pro.handypioneers.com
 * Shown when the user is not authenticated.
 * Layout mirrors HCP's split-panel login: left = form, right = branded message.
 */
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

// Google "G" SVG (official brand colors)
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AdminLogin() {
  const loginUrl = getLoginUrl();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ── Left panel ── */}
      <div className="flex flex-col justify-center items-start w-full md:w-[520px] shrink-0 px-10 py-16 bg-white">
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3 mb-10">
          <img
            src={HP_LOGO}
            alt="Handy Pioneers"
            className="h-10 w-10 object-contain rounded-md"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-xl font-bold text-gray-900 tracking-tight">
            Handy Pioneers
          </span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-8">
          Field estimator &amp; job management — Vancouver, WA
        </p>

        {/* Google sign-in button */}
        <a
          href={loginUrl}
          className="flex items-center gap-3 w-full max-w-sm border border-gray-300 rounded-lg px-4 py-3 bg-white hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium text-gray-700 no-underline"
        >
          <GoogleIcon />
          <span>Sign in with Google</span>
        </a>

        <p className="mt-8 text-xs text-gray-400 max-w-sm">
          Access is restricted to authorized Handy Pioneers team members. Contact
          your administrator if you need access.
        </p>

        {/* Footer */}
        <div className="mt-auto pt-16 text-xs text-gray-400 space-y-0.5">
          <p>(360) 544-9858 · help@handypioneers.com</p>
          <p>808 SE Chkalov Dr, 3-433, Vancouver, WA 98683</p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-gray-50 px-12 py-16 border-l border-gray-100">
        {/* Illustration — calendar / schedule icon */}
        <div className="w-48 h-48 rounded-2xl bg-blue-50 flex items-center justify-center mb-8 shadow-inner">
          <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Clipboard body */}
            <rect x="16" y="20" width="64" height="64" rx="8" fill="#DBEAFE" />
            <rect x="16" y="20" width="64" height="64" rx="8" stroke="#3B82F6" strokeWidth="2" />
            {/* Clip */}
            <rect x="36" y="12" width="24" height="16" rx="4" fill="#3B82F6" />
            {/* Lines */}
            <rect x="28" y="44" width="40" height="4" rx="2" fill="#93C5FD" />
            <rect x="28" y="54" width="28" height="4" rx="2" fill="#93C5FD" />
            <rect x="28" y="64" width="32" height="4" rx="2" fill="#93C5FD" />
            {/* Check badge */}
            <circle cx="72" cy="72" r="14" fill="#22C55E" />
            <path d="M65 72l5 5 9-9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
          Estimates done right.
        </h2>
        <p className="text-gray-500 text-center max-w-xs text-sm leading-relaxed">
          Build accurate trim carpentry estimates, send professional proposals,
          and manage your full job pipeline — all in one place.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 w-full max-w-sm text-sm">
          {[
            { label: "Estimate builder", desc: "7-step trade flow" },
            { label: "Customer portal", desc: "Approve & pay online" },
            { label: "Job pipeline", desc: "Kanban + table views" },
            { label: "Schedule", desc: "Auto-generated phases" },
          ].map((f) => (
            <div
              key={f.label}
              className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3"
            >
              <p className="font-semibold text-gray-800 text-xs">{f.label}</p>
              <p className="text-gray-400 text-xs mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
