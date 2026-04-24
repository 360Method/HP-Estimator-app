import { trpc } from "@/lib/trpc";

/**
 * Shared hook for the portal_continuity_enabled feature flag.
 * Reads appSettings.portalContinuityEnabled via portal.getTeamInfo.
 * Defaults to true on load / when the flag is unset.
 */
export function useContinuityEnabled(): boolean {
  const { data } = trpc.portal.getTeamInfo.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  return data?.portalContinuityEnabled !== false;
}
