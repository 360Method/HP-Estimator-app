/**
 * AdminShell — auth gate + nav wrapper for the /admin/* routes.
 * Mirrors Home.tsx's allowlist check so admin pages are gated consistently.
 */
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLogin from "@/pages/AdminLogin";
import AdminAccessDenied from "@/pages/AdminAccessDenied";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/chat", label: "Integrator Chat" },
  { href: "/admin/ai-agents", label: "AI Agents" },
  { href: "/admin/ai-agents/tasks", label: "Approval Queue" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/vendors", label: "Vendors" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) return null;
  if (!user) return <AdminLogin />;
  if ((user as { isAllowed?: boolean }).isAllowed === false) {
    return <AdminAccessDenied email={user.email} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-4 flex items-center gap-6">
          <Link href="/">
            <span className="font-semibold text-lg cursor-pointer">Handy Pioneers</span>
          </Link>
          <nav className="flex gap-4 text-sm">
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
      <main className="container py-6">{children}</main>
    </div>
  );
}
