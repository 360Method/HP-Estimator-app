export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Supabase Auth login URL — server handles the redirect to Supabase
export const getLoginUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const redirectTo = `${window.location.origin}/api/oauth/callback`;

  if (!supabaseUrl) return "";

  // Redirect to Supabase Auth (Google OAuth)
  return `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
};
