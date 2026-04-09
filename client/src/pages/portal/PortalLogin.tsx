/**
 * PortalLogin — magic-link entry page.
 * Two modes:
 *  1. /portal/login — shows email form to request a magic link
 *  2. /portal/auth?token=xxx — validates token, sets session, redirects to /portal/appointments
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle } from "lucide-react";

const HP_LOGO = "https://cdn.manus.space/webdev-static-assets/hp-logo.png";

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Check for token in URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const requestMagicLink = trpc.portal.sendMagicLink.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(err.message),
  });

  const validateToken = trpc.portal.verifyToken.useMutation({
    onSuccess: () => {
      navigate("/portal/appointments");
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={HP_LOGO}
            alt="Handy Pioneers"
            className="h-16 w-auto object-contain mx-auto mb-4"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="text-xl font-bold text-gray-900">Customer Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Handy Pioneers</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
            <p className="text-sm text-gray-600">
              We sent a magic link to <strong>{email}</strong>. Click the link to sign in — it expires in 7 days.
            </p>
            <p className="text-xs text-gray-400">
              Didn't receive it? Check your spam folder or{" "}
              <button
                className="text-blue-600 underline"
                onClick={() => setSent(false)}
              >
                try again
              </button>.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-gray-700 mb-4">
                At Handy Pioneers, we provide our customers with a portal to access their appointments, view and pay invoices, and review estimates. Enter your email to receive a secure login link.
              </p>
              <p className="text-xs text-gray-500 mb-4">
                This magic link will expire in 7 days. If you click on an expired link, please check your inbox for a new, updated link.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email) {
                    requestMagicLink.mutate({ email });
                  }
                }}
                className="text-sm"
              />
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!email || requestMagicLink.isPending}
                onClick={() => requestMagicLink.mutate({ email })}
              >
                {requestMagicLink.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                ) : (
                  <><Mail className="w-4 h-4 mr-2" /> LOGIN TO CUSTOMER PORTAL</>
                )}
              </Button>
            </div>

            <div className="border-t border-gray-100 pt-4 text-center text-xs text-gray-400 space-y-1">
              <p>(360) 544-9858 | help@handypioneers.com</p>
              <p>http://handypioneers.com</p>
              <p>808 SE Chkalov Dr, 3-433, Vancouver, WA 98683</p>
              <a href="https://handypioneers.com/terms" className="text-blue-500 underline">
                Handy Pioneers Terms &amp; Conditions
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
