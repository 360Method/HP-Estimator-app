/**
 * PortalLayout — customer-facing portal shell.
 * Matches the HouseCall Pro client portal style:
 * - White top nav with logo, "Send a message" + "Book online" CTAs, logged-in name
 * - Collapsible left sidebar: Appointments, Invoices, Estimates, Gallery | MY ACCOUNT: Wallet, Referral program
 * - Main content area
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  FileText,
  ClipboardList,
  Images,
  CreditCard,
  Gift,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  FolderOpen,
  Home,
  Briefcase,
  Star,
} from "lucide-react";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

const mainNav: NavItem[] = [
  { label: "Home", path: "/portal/home", icon: <Home className="w-4 h-4" /> },
  { label: "Appointments", path: "/portal/appointments", icon: <Calendar className="w-4 h-4" /> },
  { label: "Invoices", path: "/portal/invoices", icon: <FileText className="w-4 h-4" /> },
  { label: "Estimates", path: "/portal/estimates", icon: <ClipboardList className="w-4 h-4" /> },
  { label: "Documents", path: "/portal/documents", icon: <FolderOpen className="w-4 h-4" /> },
  { label: "Gallery", path: "/portal/gallery", icon: <Images className="w-4 h-4" /> },
  { label: "Jobs", path: "/portal/jobs", icon: <Briefcase className="w-4 h-4" /> },
  { label: "360° Reports", path: "/portal/reports", icon: <ClipboardList className="w-4 h-4" /> },
  { label: "360° Membership", path: "/portal/360-membership", icon: <Star className="w-4 h-4" /> },
];

const accountNav: NavItem[] = [
  { label: "Wallet", path: "/portal/wallet", icon: <CreditCard className="w-4 h-4" /> },
  { label: "Referral program", path: "/portal/referral", icon: <Gift className="w-4 h-4" /> },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { customer } = usePortal();

  const logoutMutation = trpc.portal.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/portal/login";
    },
  });

  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  const NavLink = ({ item }: { item: NavItem }) => (
    <Link
      href={item.path}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
        isActive(item.path)
          ? "bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600"
          : "text-gray-700 hover:bg-gray-100"
      }`}
      onClick={() => setMobileMenuOpen(false)}
    >
      {item.icon}
      {(sidebarOpen || mobileMenuOpen) && (
        <span className="flex-1">{item.label}</span>
      )}
      {item.badge && item.badge > 0 && (sidebarOpen || mobileMenuOpen) && (
        <Badge variant="destructive" className="text-xs h-5 min-w-5 flex items-center justify-center">
          {item.badge}
        </Badge>
      )}
    </Link>
  );

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full ${mobile ? "w-64" : sidebarOpen ? "w-56" : "w-14"} transition-all duration-200`}>
      {/* Collapse toggle (desktop only) */}
      {!mobile && (
        <div className="flex justify-end p-2 border-b border-gray-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {mainNav.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {(sidebarOpen || mobile) && (
          <div className="pt-4 pb-1 px-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Account</p>
          </div>
        )}
        {!sidebarOpen && !mobile && <div className="border-t border-gray-100 my-2" />}

        {accountNav.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-gray-100">
        <button
          onClick={() => logoutMutation.mutate()}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100 w-full transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(sidebarOpen || mobile) && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1 rounded hover:bg-gray-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/portal/home" className="flex items-center gap-2 cursor-pointer">
                <img
                  src={HP_LOGO}
                  alt="Handy Pioneers"
                  className="h-8 w-auto object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="font-bold text-gray-900 text-base hidden sm:block">Handy Pioneers</span>
            </Link>
          </div>

          {/* Right: CTAs + user */}
          <div className="flex items-center gap-2">
            <Link href="/portal/messages">
              <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" />
                Send a message
              </Button>
            </Link>
            <Link href="/portal/request">
              <Button size="sm" className="hidden sm:flex text-xs" style={{ background: '#c8922a', color: '#fff' }}>
                Book online
              </Button>
            </Link>
            {customer && (
              <span className="text-xs text-gray-500 hidden md:block ml-2">
                LOGGED IN AS: {customer.name.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col bg-white border-r border-gray-200 flex-shrink-0">
          <Sidebar />
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-14 bottom-0 bg-white border-r border-gray-200 flex flex-col z-50">
              <Sidebar mobile />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
