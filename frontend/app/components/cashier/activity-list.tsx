"use client";

import type { ActivityRow } from "../../lib/solana/events";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { GAMES } from "../../lib/games/registry";
import { useCluster } from "../../lib/hooks/use-cluster";
import { ellipsify } from "../../lib/solana/explorer";

const LABEL: Record<ActivityRow["kind"], { icon: string; text: string }> = {
  deposit: { icon: "⬇️", text: "Bought chips" },
  withdraw: { icon: "⬆️", text: "Cashed out" },
  bet: { icon: "🎲", text: "Bet" },
  settled: { icon: "✅", text: "Settled" },
  refund: { icon: "↩️", text: "Refund" },
  session: { icon: "🔑", text: "Session key" },
  other: { icon: "•", text: "Program call" },
};

function when(blockTime: number | null): string {
  if (blockTime == null) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - blockTime));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(blockTime * 1000).toLocaleDateString();
}

export function ActivityList({
  rows,
  isLoading,
}: {
  rows: ActivityRow[];
  isLoading: boolean;
}) {
  const { getExplorerUrl } = useCluster();
  return (
    <div className="rounded-2xl border border-border-low bg-card/70 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Activity
        </p>
        {isLoading && <span className="text-[10px] text-muted">loading…</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">
          {isLoading
            ? "Reading your history…"
            : "Nothing yet — buy chips to start."}
        </p>
      ) : (
        <ul className="divide-y divide-border-low text-xs">
          {rows.map((r, i) => {
            const l = LABEL[r.kind];
            const game =
              r.gameId != null ? GAMES.find((g) => g.id === r.gameId) : null;
            const delta = lamportsToDiamonds(
              r.lamports < 0n ? -r.lamports : r.lamports
            );
            return (
              <li
                key={`${r.signature}-${i}`}
                className="flex items-center gap-3 py-2"
              >
                <span className="w-5 text-center">{l.icon}</span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${r.err ? "text-destructive line-through" : "text-foreground"}`}
                  >
                    {l.text}
                    {game ? ` · ${game.title}` : ""}
                  </p>
                  <a
                    href={getExplorerUrl(`/tx/${r.signature}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-muted underline-offset-2 hover:underline"
                  >
                    {ellipsify(r.signature, 6)} · {when(r.blockTime)}
                  </a>
                </div>
                {r.lamports !== 0n && (
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      r.lamports > 0n ? "text-[#00ffa3]" : "text-muted"
                    }`}
                  >
                    {r.lamports > 0n ? "+" : "−"}
                    {diamondString(delta)} 💎
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
