"use client";

import { BetPanel, FieldLabel, type BetPanelSpin } from "../bet/bet-panel";
import {
  WHEEL_RISK,
  WHEEL_RISK_NAMES,
  WHEEL_TABLES,
  wheelEncodeTarget,
  type WheelRisk,
} from "../../lib/solana/games/wheel";

const RISKS: WheelRisk[] = [WHEEL_RISK.LOW, WHEEL_RISK.MED, WHEEL_RISK.HIGH];
const RISK_COLORS: Record<WheelRisk, string> = {
  [WHEEL_RISK.LOW]: "#1fd18a",
  [WHEEL_RISK.MED]: "#ffc057",
  [WHEEL_RISK.HIGH]: "#ff4d5e",
};

type Props = {
  risk: WheelRisk;
  onRiskChange: (risk: WheelRisk) => void;
  spin: BetPanelSpin;
};

export function WheelControls({ risk, onRiskChange, spin }: Props) {
  const busy = spin.rolling || spin.isSending;
  return (
    <BetPanel
      spin={spin}
      target={wheelEncodeTarget(risk)}
      verb="Spin"
      busyLabel={spin.isDemo ? "Spinning…" : "Waiting for the house…"}
      roundNoun="spins"
      footnote={{
        idle: "Every spin is settled on-chain from a provably fair reveal.",
        busy: "Bet placed — the house is revealing your result on-chain.",
        demo: "Demo mode — connect a wallet and buy chips to play for real.",
      }}
    >
      <div className="mt-4">
        <FieldLabel>Risk</FieldLabel>
        <div className="flex w-full gap-1 rounded-xl border border-border-low bg-background/50 p-1">
          {RISKS.map((r) => {
            const active = risk === r;
            const color = RISK_COLORS[r];
            const max = Math.max(...WHEEL_TABLES[r]) / 100;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRiskChange(r)}
                disabled={busy}
                aria-pressed={active}
                className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  active
                    ? {
                        background: color,
                        color: "#0b0b10",
                        boxShadow: `0 0 14px ${color}66`,
                      }
                    : { color: "var(--muted)" }
                }
              >
                {WHEEL_RISK_NAMES[r]}
                <span className="text-[10px] font-semibold normal-case tracking-normal opacity-80">
                  up to {max.toFixed(2).replace(/\.?0+$/, "")}×
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </BetPanel>
  );
}
