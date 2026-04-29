/**
 * AdminLogin — email + password login form for pro.handypioneers.com
 * POSTs to /api/auth/login, then reloads to "/" on success.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed. Check your credentials.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

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

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@handypioneers.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            <a href="/forgot-password" className="underline hover:text-gray-700">
              Forgot password?
            </a>
          </p>
        </form>

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
        <div className="w-48 h-48 rounded-2xl bg-blue-50 flex items-center justify-center mb-8 shadow-inner">
          <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="16" y="20" width="64" height="64" rx="8" fill="#DBEAFE" />
            <rect x="16" y="20" width="64" height="64" rx="8" stroke="#3B82F6" strokeWidth="2" />
            <rect x="36" y="12" width="24" height="16" rx="4" fill="#3B82F6" />
            <rect x="28" y="44" width="40" height="4" rx="2" fill="#93C5FD" />
            <rect x="28" y="54" width="28" height="4" rx="2" fill="#93C5FD" />
            <rect x="28" y="64" width="32" height="4" rx="2" fill="#93C5FD" />
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
