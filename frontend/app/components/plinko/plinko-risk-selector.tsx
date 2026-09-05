"use client";

import {
  PLINKO_RISK,
  PLINKO_RISK_NAMES,
  type PlinkoRisk,
} from "../../lib/solana/games/plinko";

type Props = {
  value: PlinkoRisk;
  onChange: (risk: PlinkoRisk) => void;
};

const RISKS: PlinkoRisk[] = [
  PLINKO_RISK.LOW,
  PLINKO_RISK.MED,
  PLINKO_RISK.HIGH,
];

export function RiskSelector({ value, onChange }: Props) {
  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-border-low bg-card">
      {RISKS.map((r) => {
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`flex-1 cursor-pointer py-2 text-xs font-bold uppercase tracking-wide transition ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-cream"
            }`}
          >
            {PLINKO_RISK_NAMES[r]}
          </button>
        );
      })}
    </div>
  );
}
