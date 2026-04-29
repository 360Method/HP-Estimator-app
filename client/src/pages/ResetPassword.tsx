/**
 * ResetPassword — consumes the ?token= from the email link, lets the user
 * pick a new password, then redirects to /. If the token is invalid or
 * expired, the server returns BAD_REQUEST and we surface the message.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const HP_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = getToken();

  const consume = trpc.auth.consumePasswordReset.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Reset link is missing a token. Request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    consume.mutate({ token, newPassword: password });
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

        <h1 className="text-3xl font-bold text-gray-900 mb-1">Choose new password</h1>
        <p className="text-sm text-gray-500 mb-8">
          Pick a password at least 8 characters long. After saving, sign in
          again with your new credentials.
        </p>

        {done ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p className="font-semibold mb-1">Password updated.</p>
            <p>You can sign in with the new password now.</p>
            <Button className="mt-4 w-full" onClick={() => navigate("/")}>
              Go to sign-in
            </Button>
          </div>
        ) : !token ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold mb-1">Missing reset token.</p>
            <p>
              The reset link is incomplete. Request a new link from{" "}
              <a href="/forgot-password" className="underline">
                Forgot password
              </a>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={consume.isPending || !password || !confirm}
            >
              {consume.isPending ? "Saving…" : "Save new password"}
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
