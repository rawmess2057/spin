/**
 * Formats a multiplier (in basis points) for compact display: "0.5×",
 * "12.5×", "250", "1,200". The "×" is dropped at 100 and above, which is the
 * convention the result-history chips use.
 */
export function compactMultiplier(multiplierBp: bigint): string {
  const x = Number(multiplierBp) / 10000;
  const text =
    x >= 100
      ? `${Math.round(x).toLocaleString("en-US")}`
      : x >= 10
        ? `${x.toFixed(1).replace(/\.0$/, "")}`
        : `${x.toFixed(2).replace(/\.?0+$/, "")}`;
  return x < 100 ? `${text}×` : text;
}
