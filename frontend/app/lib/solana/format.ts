import {
  formatDecimalFixedPoint,
  lamportsToSol,
  type Lamports,
} from "@solana/kit";

const solFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

export function solString(lamports: bigint): string {
  return formatDecimalFixedPoint(
    solFormatter,
    lamportsToSol(lamports as Lamports)
  );
}

export function multiplierString(bp: bigint): string {
  const trimmed = (Number(bp) / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${trimmed}x`;
}
