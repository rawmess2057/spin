import { type ReactNode } from "react";

/**
 * The physical slot cabinet: backlit gold marquee with a flashing candle,
 * brushed-metal side rails carrying the payline markers, a deep-inset reel
 * window, and a lower button deck. All pure CSS — no image assets.
 *
 * The payline chevrons mark the single live line (the centre row). This
 * machine pays on one line only, so exactly one pair of markers is drawn.
 */

function Marquee({
  pulsing,
  jackpotLabel,
}: {
  pulsing: boolean;
  jackpotLabel: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-t-2xl border-b-4 border-black/60 px-4 py-3 text-center transition-shadow duration-300 ${
        pulsing ? "shadow-[inset_0_0_46px_rgba(255,192,87,0.5)]" : ""
      }`}
      style={{
        background:
          "linear-gradient(180deg,#3a2b12 0%,#241a0a 55%,#120c05 100%)",
      }}
    >
      {/* Red chase light strip along the marquee top edge */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex h-1.5 items-center justify-between px-6 ${
          pulsing ? "animate-pulse" : ""
        }`}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full"
            style={{
              background: pulsing ? "#f00001" : "#7a2a00",
              boxShadow: pulsing
                ? "0 0 8px rgba(240,0,1,0.9)"
                : undefined,
            }}
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 130% at 50% 120%, rgba(255,192,87,0.28) 0%, transparent 70%)",
        }}
      />
      {/* Candle light — flashes on anticipation and wins */}
      <div
        className={`absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-black/60 transition-all duration-200 ${
          pulsing ? "bg-gold" : "bg-gold/20"
        }`}
        style={{
          boxShadow: pulsing
            ? "0 0 18px rgba(255,192,87,1), 0 0 34px rgba(255,192,87,0.6)"
            : "inset 0 0 4px rgba(0,0,0,0.5)",
        }}
      />
      <p className="font-display relative text-sm font-bold tracking-[0.35em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.85),0_0_38px_rgba(255,192,87,0.45)] sm:text-base">
        LUCKY SEVENS
      </p>
      <p className="relative mt-0.5 text-[9px] font-semibold tracking-[0.3em] text-gold/70">
        {jackpotLabel}
      </p>
    </div>
  );
}

/** Brushed-metal rail with the payline chevron at centre-row height. */
function Rail({ side, lit }: { side: "left" | "right"; lit: boolean }) {
  const isLeft = side === "left";
  return (
    <div
      className="relative hidden w-6 shrink-0 sm:block"
      style={{
        background: isLeft
          ? "linear-gradient(90deg,#0c0c14 0%,#8a6a2a 30%,#ffc057 50%,#6b5420 70%,#0c0c14 100%)"
          : "linear-gradient(90deg,#0c0c14 0%,#6b5420 30%,#ffc057 50%,#8a6a2a 70%,#0c0c14 100%)",
      }}
      aria-hidden="true"
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 transition-all duration-300 ${
          isLeft ? "left-1" : "right-1"
        }`}
      >
        <div
          className={`h-0 w-0 border-y-[7px] border-y-transparent transition-all duration-300 ${
            isLeft ? "border-l-[10px] border-r-0" : "border-r-[10px] border-l-0"
          }`}
          style={
            isLeft
              ? {
                  borderLeftColor: lit ? "#ffc057" : "#5c4a20",
                  filter: lit
                    ? "drop-shadow(0 0 7px rgba(255,192,87,0.95))"
                    : undefined,
                }
              : {
                  borderRightColor: lit ? "#ffc057" : "#5c4a20",
                  filter: lit
                    ? "drop-shadow(0 0 7px rgba(255,192,87,0.95))"
                    : undefined,
                }
          }
        />
      </div>
    </div>
  );
}

export function Cabinet({
  reels,
  deck,
  paylineLit = false,
  anticipating = false,
  jackpotLabel = "SINGLE LINE · PAYS ANYWHERE",
}: {
  reels: ReactNode;
  deck: ReactNode;
  /** Lights the payline chevrons when the spin paid. */
  paylineLit?: boolean;
  /** Pulses the housing while a reel is in anticipation. */
  anticipating?: boolean;
  /** Text shown under the marquee brand. */
  jackpotLabel?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border-2 border-gold/30 shadow-[0_18px_50px_rgba(0,0,0,0.65)] transition-shadow duration-300 ${
        anticipating ? "shadow-[0_0_60px_rgba(255,192,87,0.4)]" : ""
      }`}
      style={{
        background:
          "linear-gradient(180deg,#262016 0%,#19140c 40%,#0d0a06 100%)",
      }}
    >
      <Marquee pulsing={anticipating} jackpotLabel={jackpotLabel} />

      {/* Reel bay: rails either side of a deep inset glass window */}
      <div
        className="flex items-stretch p-2 sm:p-3"
        style={{
          background: "linear-gradient(180deg,#0a0806 0%,#141008 100%)",
        }}
      >
        <Rail side="left" lit={paylineLit} />
        <div
          className="relative mx-0 flex-1 overflow-hidden rounded-md p-2 sm:mx-2"
          style={{
            background: "#050503",
            boxShadow:
              "inset 0 6px 18px rgba(0,0,0,0.95), inset 0 -4px 14px rgba(0,0,0,0.8)",
          }}
        >
          {reels}
          {/* Glass sheen over the whole window */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(112deg, rgba(255,240,200,0.10) 0%, rgba(255,255,255,0.03) 28%, transparent 55%)",
            }}
          />
        </div>
        <Rail side="right" lit={paylineLit} />
      </div>

      {/* Button deck */}
      <div
        className="border-t-2 border-black/70 px-4 py-4"
        style={{
          background:
            "linear-gradient(180deg,#2b2416 0%,#1c1710 60%,#100d08 100%)",
        }}
      >
        {deck}
      </div>
    </div>
  );
}

/** Inset LED-style meter used for CREDIT / WIN on the button deck. */
export function CreditMeter({
  label,
  value,
  unit = "💎",
  tone = "amber",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "amber" | "red";
}) {
  const color = tone === "red" ? "#f00001" : "#ffc057";
  return (
    <div
      className="flex-1 rounded-md px-3 py-1.5"
      style={{
        background: "#050503",
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.9)",
      }}
    >
      <p className="text-[9px] font-semibold tracking-[0.2em] text-muted">
        {label}
      </p>
      <p
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color, textShadow: `0 0 10px ${color}66` }}
      >
        {value}
        <span className="ml-1 text-[10px] font-normal opacity-70">{unit}</span>
      </p>
    </div>
  );
}
