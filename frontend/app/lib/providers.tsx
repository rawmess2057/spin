"use client";

import { Toaster } from "sonner";
import { type PropsWithChildren } from "react";
import { ClusterProvider } from "./hooks/use-cluster";
import { AppClientProvider } from "./hooks/use-app-client";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClusterProvider>
      <AppClientProvider>{children}</AppClientProvider>
      <Toaster position="bottom-right" richColors theme="dark" />
    </ClusterProvider>
  );
}
