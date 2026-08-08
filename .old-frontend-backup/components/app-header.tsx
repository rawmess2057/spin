"use client";

import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";
import { SoundToggle } from "./sound-toggle";

export function AppHeader() {
  return (
    <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-4">
      <span className="font-display text-sm font-bold tracking-[0.15em] text-primary [text-shadow:0_0_16px_rgba(0,255,163,0.5)]">
        SPIN <span className="text-foreground/30">·</span>{" "}
        <span className="font-mono text-xs font-normal tracking-normal text-foreground/60">
          NEON SLOTS
        </span>
      </span>
      <div className="flex items-center gap-3">
        <SoundToggle />
        <ClusterSelect />
        <WalletButton />
      </div>
    </header>
  );
}
