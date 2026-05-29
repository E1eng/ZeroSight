"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useMemo, useState } from "react";

const DEFAULT_PRIVY_APP_ID = "PRIVY_APP_ID_PLACEHOLDER";

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = useMemo(() => process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? DEFAULT_PRIVY_APP_ID, []);

  if (appId === DEFAULT_PRIVY_APP_ID && process.env.NODE_ENV === "development") {
    console.warn("NEXT_PUBLIC_PRIVY_APP_ID is not set. Using placeholder app ID.");
  }

  return (
    <PrivyProvider appId={appId} config={{ appearance: { theme: "dark" } }}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
