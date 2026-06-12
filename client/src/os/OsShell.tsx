/**
 * OsShell — the chrome of the Handy Pioneers Operating System.
 *
 * Desktop: a fixed left rail. Phone and tablet: a bottom tab bar with a
 * "More" sheet. Same auth gate as AdminShell (staff login + allowlist).
 *
 * Phase 1 ships the four working surfaces (Today, Chat, Library, Approvals).
 * The business rooms (Pipeline, Clients, Money, Schedule, Team) link to
 * their current screens until Phase 2 re-mounts them inside the shell.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sun, MessageSquareText, Inbox, BookOpen, BookOpenCheck, GitBranch, Users, Wallet,
  CalendarDays, HardHat, HandCoins, Bot, MoreHorizontal, X, MessageCircle, ScrollText, Settings,
  Compass,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AdminLogin from "@/pages/AdminLogin";
import AdminAccessDenied from "@/pages/AdminAccessDenied";
import NotificationBell from "@/components/NotificationBell";
import OsQuickActions from "./OsQuickActions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

const CORE_NAV: NavItem[] = [
  { href: "/os", label: "Today", icon: Sun },
  { href: "/os/chat", label: "Chat", icon: MessageSquareText },
  { href: "/os/approvals", label: "Approvals", icon: Inbox },
  { href: "/os/library", label: "Library", icon: BookOpen },
];

const ROOM_NAV: NavItem[] = [
  { href: "/os/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/os/clients", label: "Clients", icon: Users },
  { href: "/os/method", label: "360 Method", icon: Compass },
  { href: "/os/money", label: "Money", icon: Wallet },
  { href: "/os/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/os/inbox", label: "Inbox", icon: MessageCircle },
  { href: "/admin/vendors", label: "Team", icon: HardHat },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/os/decisions", label: "Decisions", icon: ScrollText },
  { href: "/os/pricebook", label: "Price book", icon: BookOpenCheck },
  { href: "/os/commissions", label: "Commissions", icon: HandCoins },
  { href: "/admin/agents", label: "Agents", icon: Bot },
  { href: "/admin/scheduling", label: "Booking slots", icon: CalendarDays },
  { href: "/os/settings", label: "Settings", icon: Settings },
];

/** Phone bottom bar: the four most-used surfaces; everything else under More. */
const MOBILE_TABS: NavItem[] = [
  { href: "/os", label: "Today", icon: Sun },
  { href: "/os/chat", label: "Chat", icon: MessageSquareText },
  { href: "/os/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/os/clients", label: "Clients", icon: Users },
];

function isActive(location: string, href: string): boolean {
  if (href === "/os") return location === "/os";
  return location.startsWith(href);
}

function RailLink({ item, location, onNavigate }: { item: NavItem; location: string; onNavigate?: () => void }) {
  const active = isActive(location, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <span
        onClick={onNavigate}
        className={
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors " +
          (active
            ? "bg-[rgba(200,146,42,0.14)] font-semibold"
            : "hover:bg-black/5 text-muted-foreground")
        }
        style={active ? { color: "var(--hp-gold-deep)" } : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </span>
    </Link>
  );
}

export function OsShell({
  active,
  wide,
  flush,
  fill,
  children,
}: {
  active?: string;
  /** Full-width content (the business rooms need it for boards and tables). */
  wide?: boolean;
  /** No content padding; the room's own strips (OsBuilderBar) span the area. */
  flush?: boolean;
  /**
   * Content fills the viewport exactly (no page scroll) — for surfaces that
   * manage their own scrolling, like Chat. Children get a flex column with
   * min-h-0 so an inner `flex-1 min-h-0` pane scrolls instead of the page.
   */
  fill?: boolean;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: openTasks } = trpc.os.tasks.list.useQuery({}, { refetchInterval: 60_000, enabled: !!user });
  // Template seam: the shell reads its identity from os_business, so the
  // same code serves the next business with a different row.
  const { data: business } = trpc.os.business.get.useQuery(undefined, { staleTime: 600_000, enabled: !!user });

  if (loading) return null;
  if (!user) return <AdminLogin />;
  if ((user as { isAllowed?: boolean }).isAllowed === false) {
    return <AdminAccessDenied email={user.email} />;
  }

  const taskCount = openTasks?.length ?? 0;

  return (
    <div
      className={fill ? "h-dvh flex flex-col overflow-hidden" : "min-h-screen"}
      style={{ background: "var(--hp-cream)" }}
    >
      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 px-4 py-3" style={{ background: "var(--hp-ink)", color: "white" }}>
        <div className="flex items-center justify-between gap-3">
          <Link href="/os">
            <span className="cursor-pointer">
              <span className="hp-eyebrow block leading-none" style={{ color: "var(--hp-gold-soft)", fontSize: "0.65rem" }}>
                Operating System
              </span>
              <span className="hp-serif font-semibold" style={{ fontSize: "1.05rem" }}>
                {business?.name ?? "Handy Pioneers"} OS
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="hidden sm:inline">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <OsQuickActions />
            <NotificationBell darkSurface />
            <Link href="/os/chat">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/85 hover:bg-white/10 cursor-pointer transition-colors">
                <MessageSquareText className="w-3.5 h-3.5" /> Chat
              </span>
            </Link>
          </div>
        </div>
      </header>

      <div className={"flex" + (fill ? " flex-1 min-h-0" : "")}>
        {/* ── Desktop rail ─────────────────────────────────────── */}
        <aside className="hidden md:block w-52 shrink-0 px-3 py-4 sticky top-[57px] self-start h-[calc(100vh-57px)] overflow-y-auto">
          <nav className="space-y-1">
            {CORE_NAV.map((item) => (
              <RailLink key={item.href} item={item} location={active ?? location} />
            ))}
          </nav>
          <p className="hp-eyebrow mt-5 mb-1.5 px-3" style={{ fontSize: "0.62rem", color: "var(--hp-gold-deep)" }}>
            Rooms
          </p>
          <nav className="space-y-1">
            {ROOM_NAV.map((item) => (
              <RailLink key={item.href} item={item} location={active ?? location} />
            ))}
          </nav>
          <p className="hp-eyebrow mt-5 mb-1.5 px-3" style={{ fontSize: "0.62rem", color: "var(--hp-gold-deep)" }}>
            System
          </p>
          <nav className="space-y-1">
            {SYSTEM_NAV.map((item) => (
              <RailLink key={item.href} item={item} location={active ?? location} />
            ))}
          </nav>
        </aside>

        {/* ── Content ──────────────────────────────────────────── */}
        <main
          className={
            "flex-1 min-w-0 pb-24 md:pb-8 " +
            (fill ? "flex flex-col min-h-0 overflow-hidden " : "") +
            (flush ? "" : "px-4 py-5 ") +
            (wide ? "" : "max-w-4xl")
          }
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom tabs ─────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-white"
        style={{ borderColor: "var(--hp-hairline)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((item) => {
            const activeTab = isActive(active ?? location, item.href);
            const Icon = item.icon;
            const badge = item.href === "/os" && taskCount > 0 ? taskCount : null;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className="relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] cursor-pointer"
                  style={{ color: activeTab ? "var(--hp-gold-deep)" : "var(--hp-ink-soft, #6b6b6b)" }}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                  {badge !== null && (
                    <span className="absolute top-1 right-1/4 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2.5 text-[10px]"
            style={{ color: "var(--hp-ink-soft, #6b6b6b)" }}
          >
            <MoreHorizontal className="w-5 h-5" />
            More
          </button>
        </div>
      </nav>

      {/* ── Mobile "More" sheet ────────────────────────────────── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="hp-serif font-semibold" style={{ color: "var(--hp-ink)" }}>
                All rooms
              </span>
              <button type="button" onClick={() => setMoreOpen(false)} className="p-2" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {[...CORE_NAV.filter((i) => !MOBILE_TABS.some((t) => t.href === i.href)), ...ROOM_NAV.filter((i) => !MOBILE_TABS.some((t) => t.href === i.href)), ...SYSTEM_NAV].map((item) => (
                <RailLink key={item.href} item={item} location={active ?? location} onNavigate={() => setMoreOpen(false)} />
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
