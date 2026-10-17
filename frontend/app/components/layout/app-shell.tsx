import { type ReactNode } from "react";
import { GridBackground } from "./grid-background";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { BuyChipsProvider } from "../vault/buy-chips-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <BuyChipsProvider>
      <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
        <GridBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          <TopBar />
          <div className="flex-1 pb-20 sm:pb-0">{children}</div>
        </div>
        <BottomNav />
      </div>
    </BuyChipsProvider>
  );
}
