"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/config/wagmi";

/**
 * Client-side provider boundary (Next 16 App Router: React Context is not allowed in Server
 * Components, so the layout stays server-side and renders this 'use client' wrapper).
 *
 * Provider order is required: WagmiProvider > QueryClientProvider > RainbowKitProvider.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session; created lazily so it isn't shared across requests.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Caldera testnet RPC can be flaky — retry + a short stale window (frontend-plan §7).
            retry: 2,
            staleTime: 5_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
