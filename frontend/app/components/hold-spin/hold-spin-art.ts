/**
 * Procedural symbol artwork for Dragon's Vault. SVG strings in a 160×160
 * viewBox, decoded into Pixi textures and reused by DOM chips.
 */
import { HS } from "../../lib/solana/games/hold-spin";

export const ART_SIZE = 160;

export const SYMBOL_COLORS: readonly string[] = [
  "#ffd700", // wild
  "#8fa3bf", // ten
  "#60a5fa", // jack
  "#c084fc", // queen
  "#f87171", // king
  "#fbbf24", // ace
  "#fb923c", // lantern
  "#f97316", // tiger
  "#ef4444", // dragon
  "#ffcc33", // coin
];

const FONT = `font-family="Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900"`;

function svg(inner: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">${inner}</svg>`;
}

/** Card-rank symbol: a rounded plaque with a big letter. */
function rank(letter: string, color: string, dark: string): string {
  return `
<defs><linearGradient id="g${letter}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
<rect x="28" y="22" width="104" height="116" rx="18" fill="${dark}" opacity="0.5" transform="translate(4 6)"/>
<rect x="28" y="22" width="104" height="116" rx="18" fill="url(#g${letter})" stroke="${dark}" stroke-width="4"/>
<rect x="36" y="30" width="88" height="40" rx="12" fill="#fff" opacity="0.18"/>
<text x="80" y="110" text-anchor="middle" font-size="74" ${FONT} fill="#0b0d16" opacity="0.35" transform="translate(3 4)">${letter}</text>
<text x="80" y="110" text-anchor="middle" font-size="74" ${FONT} fill="#ffffff">${letter}</text>`;
}

const LANTERN = `
<defs><linearGradient id="lan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb366"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
<rect x="66" y="14" width="28" height="14" rx="4" fill="#7c2d12"/>
<ellipse cx="80" cy="82" rx="46" ry="56" fill="#7c2d12" opacity="0.5" transform="translate(4 6)"/>
<ellipse cx="80" cy="82" rx="46" ry="56" fill="url(#lan)" stroke="#7c2d12" stroke-width="4"/>
<path d="M50 50 Q80 60 110 50 M48 82 Q80 92 112 82 M52 114 Q80 124 108 114" stroke="#7c2d12" stroke-width="3" fill="none" opacity="0.7"/>
<ellipse cx="66" cy="60" rx="10" ry="18" fill="#fff" opacity="0.35"/>
<rect x="66" y="132" width="28" height="12" rx="4" fill="#7c2d12"/>
<path d="M72 144 v10 M80 144 v14 M88 144 v10" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>`;

const TIGER = `
<defs><radialGradient id="tig" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#c2410c"/></radialGradient></defs>
<circle cx="80" cy="84" r="54" fill="#7c2d12" opacity="0.5" transform="translate(4 6)"/>
<circle cx="80" cy="84" r="54" fill="url(#tig)" stroke="#7c2d12" stroke-width="4"/>
<circle cx="40" cy="44" r="16" fill="#f97316" stroke="#7c2d12" stroke-width="4"/><circle cx="120" cy="44" r="16" fill="#f97316" stroke="#7c2d12" stroke-width="4"/>
<path d="M48 70 l14 10 l-14 10 Z M112 70 l-14 10 l14 10 Z M80 40 l-8 18 h16 Z" fill="#1c1917"/>
<ellipse cx="62" cy="80" rx="8" ry="10" fill="#fef3c7"/><ellipse cx="98" cy="80" rx="8" ry="10" fill="#fef3c7"/>
<circle cx="62" cy="81" r="4" fill="#1c1917"/><circle cx="98" cy="81" r="4" fill="#1c1917"/>
<path d="M80 100 l-10 10 h20 Z" fill="#1c1917"/>
<path d="M70 118 q10 8 20 0" stroke="#1c1917" stroke-width="4" fill="none" stroke-linecap="round"/>`;

const DRAGON = `
<defs><linearGradient id="dra" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#991b1b"/></linearGradient></defs>
<path d="M30 110 C20 70 50 30 90 30 C130 30 150 70 130 110 C120 130 100 136 80 128 C60 136 40 130 30 110 Z" fill="#7f1d1d" opacity="0.5" transform="translate(4 6)"/>
<path d="M30 110 C20 70 50 30 90 30 C130 30 150 70 130 110 C120 130 100 136 80 128 C60 136 40 130 30 110 Z" fill="url(#dra)" stroke="#7f1d1d" stroke-width="4"/>
<path d="M60 28 l-6 -18 l16 10 Z M104 28 l6 -18 l-16 10 Z" fill="#fbbf24" stroke="#7f1d1d" stroke-width="3"/>
<path d="M44 86 l16 -8 l6 12 Z M116 86 l-16 -8 l-6 12 Z" fill="#fef3c7"/>
<circle cx="62" cy="82" r="5" fill="#1c1917"/><circle cx="98" cy="82" r="5" fill="#1c1917"/>
<path d="M66 108 q14 14 28 0" stroke="#1c1917" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M58 112 l6 10 M102 112 l-6 10" stroke="#fef3c7" stroke-width="4" stroke-linecap="round"/>
<path d="M80 128 q-6 14 0 26 q6 -14 0 -26" fill="#fbbf24"/>`;

const WILD = `
<defs><linearGradient id="wld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.5" stop-color="#ffd700"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs>
<path d="M80 14 L146 80 L80 146 L14 80 Z" fill="#7a5a00" opacity="0.5" transform="translate(4 6)"/>
<path d="M80 14 L146 80 L80 146 L14 80 Z" fill="url(#wld)" stroke="#7a5a00" stroke-width="4" stroke-linejoin="round"/>
<path d="M80 30 L130 80 L80 130 L30 80 Z" fill="#fff" opacity="0.14"/>
<text x="80" y="96" text-anchor="middle" font-size="40" ${FONT} fill="#5a3e00" opacity="0.4" transform="translate(2 3)">WILD</text>
<text x="80" y="96" text-anchor="middle" font-size="40" ${FONT} fill="#fffbe6">WILD</text>`;

const COIN_ART = `
<defs><radialGradient id="cn" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#fff2b3"/><stop offset="0.5" stop-color="#ffcc33"/><stop offset="1" stop-color="#b8860b"/></radialGradient></defs>
<circle cx="80" cy="82" r="60" fill="#7a5a00" opacity="0.5" transform="translate(4 6)"/>
<circle cx="80" cy="82" r="60" fill="url(#cn)" stroke="#7a5a00" stroke-width="4"/>
<circle cx="80" cy="82" r="46" fill="none" stroke="#7a5a00" stroke-width="3" opacity="0.6" stroke-dasharray="6 5"/>
<path d="M80 44 l10 22 l24 3 l-18 16 l5 24 l-21 -12 l-21 12 l5 -24 l-18 -16 l24 -3 Z" fill="#7a5a00" opacity="0.35" transform="translate(2 3)"/>
<path d="M80 44 l10 22 l24 3 l-18 16 l5 24 l-21 -12 l-21 12 l5 -24 l-18 -16 l24 -3 Z" fill="#fff8dc"/>`;

const ART: readonly string[] = [
  WILD,
  rank("10", "#a9bdd6", "#4b5f7a"),
  rank("J", "#7cb4ff", "#1e4b8f"),
  rank("Q", "#d7a3ff", "#5b2a8a"),
  rank("K", "#ff8f8f", "#8a1e1e"),
  rank("A", "#ffd166", "#8a5a00"),
  LANTERN,
  TIGER,
  DRAGON,
  COIN_ART,
];

export function symbolSvg(symbol: number, size = ART_SIZE): string {
  return svg(ART[symbol] ?? ART[HS.TEN], size);
}

export function symbolDataUrl(symbol: number, size = ART_SIZE): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(symbol, size))}`;
}

export function symbolColor(symbol: number): string {
  return SYMBOL_COLORS[symbol] ?? "#ffffff";
}
