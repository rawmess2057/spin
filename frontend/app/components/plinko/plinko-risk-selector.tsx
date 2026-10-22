"use client";

import {
  PLINKO_RISK,
  PLINKO_RISK_NAMES,
  type PlinkoRisk,
} from "../../lib/solana/games/plinko";

type Props = {
  value: PlinkoRisk;
  onChange: (risk: PlinkoRisk) => void;
  /** Locked while a ball is in flight: the paytable can't change under it. */
  disabled?: boolean;
};

const RISKS: PlinkoRisk[] = [
  PLINKO_RISK.LOW,
  PLINKO_RISK.MED,
  PLINKO_RISK.HIGH,
];

/** Risk colour coding: gentler variance reads green, aggressive reads red. */
const RISK_COLORS: Record<PlinkoRisk, string> = {
  [PLINKO_RISK.LOW]: "#1fd18a",
  [PLINKO_RISK.MED]: "#ffc057",
  [PLINKO_RISK.HIGH]: "#ff4d5e",
};

export function RiskSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex w-full gap-1 rounded-xl border border-border-low bg-background/50 p-1">
      {RISKS.map((r) => {
        const active = value === r;
        const color = RISK_COLORS[r];
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            disabled={disabled}
            aria-pressed={active}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
            style={
              active
                ? {
                    background: color,
                    color: "#0b0b10",
                    boxShadow: `0 0 14px ${color}66`,
                  }
                : {
                    color: "var(--muted)",
                  }
            }
          >
            <span
              className="h-2 w-2 rounded-full transition"
              style={{
                background: color,
                boxShadow: active ? "none" : `0 0 6px ${color}aa`,
                opacity: active ? 1 : 0.75,
              }}
            />
            {PLINKO_RISK_NAMES[r]}
          </button>
        );
      })}
    </div>
  );
}
