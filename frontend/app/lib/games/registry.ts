/**
 * The game catalogue. Ids mirror `programs/spin/src/constants.rs`; every
 * surface that lists games (navigation, home cards, settlement crank limits)
 * reads from here so adding a game is one entry plus its page.
 */
import { GAME_PLINKO } from "../solana/games/plinko";
import { GAME_MEGAWAYS } from "../solana/games/megaways";
import { GAME_WHEEL } from "../solana/games/wheel";
import { GAME_HOLD_SPIN } from "../solana/games/hold-spin";

export type GameDef = {
  /** On-chain game id. */
  id: number;
  /** Route under the app root. */
  href: string;
  /** Short label for navigation. */
  label: string;
  /** Full title shown on the game page and cards. */
  title: string;
  icon: string;
  tagline: string;
};

export const GAMES: readonly GameDef[] = [
  {
    id: GAME_PLINKO,
    href: "/plinko",
    label: "Plinko",
    title: "Plinko",
    icon: "📌",
    tagline: "8–16 rows, three risk curves.",
  },
  {
    id: GAME_MEGAWAYS,
    href: "/megaways",
    label: "Megaways",
    title: "Gem Rush",
    icon: "🎰",
    tagline: "Up to 117,649 ways, cascades, free spins.",
  },
  {
    id: GAME_WHEEL,
    href: "/wheel",
    label: "Wheel",
    title: "Spin Wheel",
    icon: "🎡",
    tagline: "24 segments, up to 20×.",
  },
  {
    id: GAME_HOLD_SPIN,
    href: "/hold-spin",
    label: "Vault",
    title: "Dragon's Vault",
    icon: "🪙",
    tagline: "Hold & Spin coins, 1,000× GRAND.",
  },
];

export function gameByHref(href: string): GameDef | undefined {
  return GAMES.find((g) => href.startsWith(g.href));
}
