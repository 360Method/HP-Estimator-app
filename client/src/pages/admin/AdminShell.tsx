/**
 * AdminShell — auth gate + nav wrapper for the /admin/* routes.
 * Mirrors Home.tsx's allowlist check so admin pages are gated consistently.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLogin from "@/pages/AdminLogin";
import AdminAccessDenied from "@/pages/AdminAccessDenied";

const NAV = [
  { href: "/admin/org-chart", label: "Org Chart" },
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/chat", label: "Integrator Chat" },
  { href: "/admin/agents/control", label: "Engine Control" },
  { href: "/admin/agents/runs", label: "Runs" },
  { href: "/admin/ai-agents", label: "AI Agents" },
  { href: "/admin/ai-agents/tasks", label: "Approval Queue" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/vendors", label: "Vendors" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return null;
  if (!user) return <AdminLogin />;
  if ((user as { isAllowed?: boolean }).isAllowed === false) {
    return <AdminAccessDenied email={user.email} />;
  }

  const current = NAV.find((n) => location.startsWith(n.href));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container py-3 sm:py-4 flex items-center gap-3 sm:gap-6">
          <Link href="/">
            <span className="font-semibold text-base sm:text-lg cursor-pointer whitespace-nowrap">Handy Pioneers</span>
          </Link>

          {/* Mobile: hamburger + current section */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden ml-auto flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md border text-sm"
            aria-label="Open admin menu"
          >
            <Menu size={18} />
            <span className="font-medium">{current?.label ?? "Menu"}</span>
          </button>

          {/* Desktop: full nav */}
          <nav className="hidden md:flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <span
                  className={
                    "cursor-pointer hover:text-foreground " +
                    (location.startsWith(item.href) ? "text-foreground font-medium" : "text-muted-foreground")
                  }
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[50] flex">
          <nav className="w-72 max-w-[85vw] bg-background border-r h-full overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold">Admin</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <ul className="py-2">
              {NAV.map((item) => {
                const active = location.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span
                        onClick={() => setMobileOpen(false)}
                        className={
                          "block px-4 py-3 min-h-[48px] text-base cursor-pointer " +
                          (active ? "bg-primary/10 text-primary font-semibold border-l-4 border-primary" : "text-foreground hover:bg-muted")
                        }
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <main className="container py-4 sm:py-6 px-3 sm:px-4">{children}</main>
    </div>
  );
}
