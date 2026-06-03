"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";

import { STORY_TESTNET_CHAIN } from "@/lib/story";
import { ToastProvider } from "@/components/toast";
import { ErrorBoundary } from "@/components/error-boundary";

const DEFAULT_PRIVY_APP_ID = "PRIVY_APP_ID_PLACEHOLDER";

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = useMemo(
    () => process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? DEFAULT_PRIVY_APP_ID,
    []
  );

  // Privy must only initialise in the browser with a real app id. During the
  // build/SSR prerender there is no env-injected client id, and initialising
  // Privy with the placeholder throws and fails the whole build. Gate it behind
  // mount + a valid id so the rest of the app (and the static shell) still
  // render; the wallet UI hydrates once we're on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasValidAppId = mounted && appId !== DEFAULT_PRIVY_APP_ID && appId.length > 0;

  if (!hasValidAppId) {
    if (mounted && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "NEXT_PUBLIC_PRIVY_APP_ID is not set — wallet features disabled until it is."
      );
    }
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "dark" },
        supportedChains: [STORY_TESTNET_CHAIN],
        defaultChain: STORY_TESTNET_CHAIN
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
