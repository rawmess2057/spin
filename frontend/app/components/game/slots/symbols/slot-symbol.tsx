import { SLOT_SYMBOLS } from "../../../../lib/solana/config";

/**
 * Renders one reel symbol by referencing the shared sprite (see
 * symbol-sprite.tsx, which must be mounted once somewhere in the tree).
 * `index` is the on-chain symbol index.
 */
export function SlotSymbol({
  index,
  className = "",
  title,
}: {
  index: number;
  className?: string;
  /** Only pass for standalone/decorative use — reel cells stay unlabelled. */
  title?: boolean;
}) {
  const symbol = SLOT_SYMBOLS[index];
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title ? symbol?.name : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <use href={`#spin-sym-${index}`} />
    </svg>
  );
}
