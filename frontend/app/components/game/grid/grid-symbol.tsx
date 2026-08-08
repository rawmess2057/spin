/**
 * Cheap per-cell renderer for the grid games: a <use> reference into the
 * hidden themed sprite. `prefix` selects the sprite family
 * ("pharaoh" | "dragon" | "mines"); `index` is the on-chain digit.
 */
export function GridSymbol({
  prefix,
  index,
  className = "",
}: {
  prefix: "pharaoh" | "dragon" | "mines";
  index: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#${prefix}-sym-${index}`} />
    </svg>
  );
}
