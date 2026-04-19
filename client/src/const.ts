export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Returns the URL to redirect unauthenticated users to.
// The login form is rendered inline on the home page (Home → AdminLogin) so "/" is correct.
export const getLoginUrl = () => "/";
