/**
 * PortalLogin — magic-link entry page.
 * Two modes:
 *  1. /portal/login — shows email form to request a magic link
 *  2. /portal/auth?token=xxx — validates token, sets session, redirects to /portal/appointments
 *
 * Visual style: matches handypioneers.com — dark forest green, warm gold CTA, serif headings
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle, ArrowRight } from "lucide-react";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Check for token and redirect in URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const redirectPath = params.get("redirect") || "/portal/home";

  const requestMagicLink = trpc.portal.sendMagicLink.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(err.message),
  });

  const validateToken = trpc.portal.verifyToken.useMutation({
    onSuccess: () => {
      navigate(redirectPath);
    },
    onError: (err) => {
      toast.error(err.message || "Invalid or expired link. Please request a new one.");
      navigate("/portal/login");
    },
  });

  useEffect(() => {
    if (token) {
      validateToken.mutate({ token });
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Token validation in progress
  if (token) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #1a2e1a 0%, #2d4a2d 60%, #1a2e1a 100%)" }}
      >
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: "#c8922a" }} />
          <p style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Georgia, serif" }}>Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #1a2e1a 0%, #2d4a2d 50%, #1f3a1f 100%)" }}
    >
      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(200,146,42,0.2)" }}>
        <a href="https://handypioneers.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
          <img
            src={HP_LOGO}
            alt="Handy Pioneers"
            className="h-10 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div>
            <div style={{ color: "#ffffff", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "1rem", lineHeight: 1.1 }}>
              Handy Pioneers
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Reliable Renovations, Trusted Results
            </div>
          </div>
        </a>
        <a
          href="tel:3605449858"
          style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", fontFamily: "Georgia, serif" }}
          className="hidden sm:block hover:opacity-100 transition-opacity"
        >
          (360) 544-9858
        </a>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="inline-block px-3 py-1 rounded-full mb-4 text-xs font-semibold tracking-widest uppercase"
              style={{ background: "rgba(200,146,42,0.15)", color: "#c8922a", border: "1px solid rgba(200,146,42,0.3)" }}
            >
              Client Portal
            </div>
            <h1
              className="text-3xl sm:text-4xl mb-2"
              style={{ color: "#ffffff", fontFamily: "Georgia, serif", fontWeight: 700, lineHeight: 1.2 }}
            >
              Welcome Back
            </h1>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", fontFamily: "Georgia, serif" }}>
              Access your appointments, estimates, and invoices
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-xl p-8"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
            }}
          >
            {sent ? (
              <div className="text-center space-y-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: "rgba(200,146,42,0.15)", border: "1px solid rgba(200,146,42,0.3)" }}
                >
                  <CheckCircle className="w-8 h-8" style={{ color: "#c8922a" }} />
                </div>
                <div>
                  <h2 style={{ color: "#ffffff", fontFamily: "Georgia, serif", fontSize: "1.25rem", fontWeight: 700 }}>
                    Check your inbox
                  </h2>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                    We sent a secure login link to{" "}
                    <span style={{ color: "#c8922a", fontWeight: 600 }}>{email}</span>.
                    Click the link to sign in — it expires in 7 days.
                  </p>
                </div>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>
                  Didn't receive it? Check your spam folder or{" "}
                  <button
                    style={{ color: "#c8922a", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    onClick={() => setSent(false)}
                  >
                    try again
                  </button>.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="portal-email"
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: "0.5rem" }}
                  >
                    Email Address
                  </label>
                  <input
                    id="portal-email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && email) {
                        requestMagicLink.mutate({ email });
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      fontSize: "0.9rem",
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(200,146,42,0.6)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
                  />
                </div>

                <button
                  disabled={!email || requestMagicLink.isPending}
                  onClick={() => requestMagicLink.mutate({ email })}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold transition-all duration-200"
                  style={{
                    background: email && !requestMagicLink.isPending ? "#c8922a" : "rgba(200,146,42,0.4)",
                    color: "#ffffff",
                    border: "none",
                    cursor: email && !requestMagicLink.isPending ? "pointer" : "not-allowed",
                    fontSize: "0.9rem",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                  onMouseEnter={(e) => { if (email && !requestMagicLink.isPending) (e.currentTarget as HTMLButtonElement).style.background = "#b07820"; }}
                  onMouseLeave={(e) => { if (email && !requestMagicLink.isPending) (e.currentTarget as HTMLButtonElement).style.background = "#c8922a"; }}
                >
                  {requestMagicLink.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Mail className="w-4 h-4" /> Send Login Link <ArrowRight className="w-4 h-4 ml-1" /></>
                  )}
                </button>

                {/* First-time user note */}
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", textAlign: "center", lineHeight: 1.5 }}>
                  If this is your first time logging into the portal, please reach out to Handy Pioneers directly for your first-time login link.
                </p>
              </div>
            )}
          </div>

          {/* Footer contact */}
          <div className="text-center mt-6 space-y-1">
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", letterSpacing: "0.04em" }}>
              (360) 544-9858 &nbsp;·&nbsp; help@handypioneers.com &nbsp;·&nbsp; Vancouver, WA
            </p>
            <a
              href="https://handypioneers.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(200,146,42,0.5)", fontSize: "0.7rem", textDecoration: "none" }}
              className="hover:opacity-100 transition-opacity"
            >
              handypioneers.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
