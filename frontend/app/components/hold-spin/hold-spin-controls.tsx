"use client";

import { BetPanel, type BetPanelSpin } from "../bet/bet-panel";
import { Button } from "../ui/button";
import { haptic } from "../../lib/sound/events";
import { holdSpinEncodeTarget } from "../../lib/solana/games/hold-spin";

type Props = {
  spin: BetPanelSpin;
  turbo: boolean;
  onTurboChange: (on: boolean) => void;
  onOpenPaytable: () => void;
  canSkip: boolean;
  onSkip: () => void;
};

export function HoldSpinControls({
  spin,
  turbo,
  onTurboChange,
  onOpenPaytable,
  canSkip,
  onSkip,
}: Props) {
  const busy = spin.rolling || spin.isSending;
  return (
    <BetPanel
      spin={spin}
      target={holdSpinEncodeTarget()}
      verb="Spin"
      busyLabel={spin.isDemo ? "Spinning…" : "Waiting for the house…"}
      roundNoun="spins"
      footnote={{
        idle: "Six or more coins lock in and start the Hold & Spin bonus.",
        busy: "Bet placed — the house is revealing your result on-chain.",
        demo: "Demo mode — connect a wallet and buy chips to play for real.",
      }}
      skipSlot={
        canSkip ? (
          <Button
            className="mt-4 h-12 w-full text-base"
            variant="secondary"
            onClick={() => {
              haptic("light");
              onSkip();
            }}
          >
            Skip ⏭
          </Button>
        ) : undefined
      }
    >
      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border-low bg-cream/25 px-3 py-2">
        <button
          type="button"
          onClick={() => onTurboChange(!turbo)}
          disabled={busy}
          className="flex cursor-pointer items-center gap-2 text-left text-xs font-bold text-foreground disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
              turbo
                ? "border-primary bg-primary"
                : "border-border-low bg-background"
            }`}
          >
            <span
              className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground shadow transition-all ${
                turbo ? "left-[calc(100%-1.05rem)]" : "left-0.5"
              }`}
            />
          </span>
          Turbo
        </button>
        <button
          type="button"
          onClick={onOpenPaytable}
          className="cursor-pointer rounded-md border border-border-low px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted transition hover:bg-cream hover:text-foreground"
        >
          Paytable
        </button>
      </div>
    </BetPanel>
  );
}
