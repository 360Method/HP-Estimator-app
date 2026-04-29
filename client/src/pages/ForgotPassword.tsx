/**
 * ForgotPassword — request a password reset link by email.
 * POSTs to trpc.auth.requestPasswordReset, then shows a generic success
 * banner regardless of whether the email is on file.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate({ email: email.trim() });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-sm">
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

        <h1 className="text-3xl font-bold text-gray-900 mb-1">Forgot password</h1>
        <p className="text-sm text-gray-500 mb-8">
          Enter the email on your staff account. We&rsquo;ll send a reset link if it
          matches an account on file.
        </p>

        {submitted ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p className="font-semibold mb-1">Check your inbox.</p>
            <p>
              If <span className="font-mono">{email}</span> matches a staff
              account, a reset link is on its way. The link is valid for 1 hour.
            </p>
            <p className="mt-3">
              <a href="/" className="underline">
                Back to sign-in
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <Button
              type="submit"
              className="w-full"
              disabled={requestReset.isPending || !email}
            >
              {requestReset.isPending ? "Sending…" : "Send reset link"}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              <a href="/" className="underline">
                Back to sign-in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
