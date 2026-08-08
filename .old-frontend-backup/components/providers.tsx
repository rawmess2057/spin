"use client";

import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";
import { AppClientProvider } from "../lib/client-provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClusterProvider>
      <AppClientProvider>{children}</AppClientProvider>
      <Toaster position="bottom-right" richColors theme="dark" />
    </ClusterProvider>
  );
}
