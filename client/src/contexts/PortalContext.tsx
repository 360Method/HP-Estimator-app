/**
 * PortalContext — manages portal customer session state.
 * Separate from admin OAuth; uses hp_portal_session cookie.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

interface PortalCustomer {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  referralCode?: string | null;
  stripeCustomerId?: string | null;
  hpCustomerId?: string | null;
}

interface PortalContextValue {
  customer: PortalCustomer | null;
  loading: boolean;
  refetch: () => void;
}

const PortalContext = createContext<PortalContextValue>({
  customer: null,
  loading: true,
  refetch: () => {},
});

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = trpc.portal.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <PortalContext.Provider
      value={{
        customer: (data?.customer as PortalCustomer | null | undefined) ?? null,
        loading: isLoading,
        refetch,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}
