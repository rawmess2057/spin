/**
 * Procedural symbol artwork for the Megaways reels.
 *
 * Every symbol is an SVG string drawn in a 160×160 viewBox — the single
 * source of truth for both the Pixi textures (decoded from a data URL) and
 * any DOM use (paytable, history chips). No <filter>s: depth comes from
 * stacked facets, gradients and a hard specular, which rasterise cheaply.
 */

import { SYM } from "../../lib/solana/games/megaways";

export const ART_SIZE = 160;

/** Accent colour per symbol for DOM chips and glows. */
export const SYMBOL_COLORS: readonly string[] = [
  "#ffd700", // wild
  "#2dd4bf", // teal gem
  "#a855f7", // amethyst
  "#3b82f6", // sapphire
  "#22c55e", // emerald
  "#f59e0b", // topaz
  "#f472b6", // rose quartz
  "#ef233c", // ruby
  "#f5b301", // bell
  "#ff3b5c", // seven
  "#9be7ff", // diamond
  "#ff9f1c", // scatter
];

type GemSpec = {
  outline: string; // polygon points for the silhouette
  table: string; // inner top facet
  facets: [string, number][]; // extra facets with opacity
  light: string;
  base: string;
  dark: string;
};

function gem(id: string, spec: GemSpec): string {
  const facets = spec.facets
    .map(
      ([pts, o]) => `<polygon points="${pts}" fill="#fff" fill-opacity="${o}"/>`
    )
    .join("");
  return `
<defs>
  <linearGradient id="${id}-body" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${spec.light}"/>
    <stop offset="0.55" stop-color="${spec.base}"/>
    <stop offset="1" stop-color="${spec.dark}"/>
  </linearGradient>
  <linearGradient id="${id}-table" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/>
    <stop offset="0.5" stop-color="${spec.light}" stop-opacity="0.5"/>
    <stop offset="1" stop-color="${spec.base}" stop-opacity="0.2"/>
  </linearGradient>
</defs>
<polygon points="${spec.outline}" fill="${spec.dark}" transform="translate(3 5)" opacity="0.45"/>
<polygon points="${spec.outline}" fill="url(#${id}-body)" stroke="${spec.dark}" stroke-width="3" stroke-linejoin="round"/>
${facets}
<polygon points="${spec.table}" fill="url(#${id}-table)"/>
<polygon points="${spec.outline}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5" stroke-linejoin="round"/>`;
}

function svg(inner: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART_SIZE} ${ART_SIZE}" width="${size}" height="${size}">${inner}</svg>`;
}

const FONT = `font-family="Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900"`;

// --- low symbols: gems ------------------------------------------------------

const TEAL_HEX = gem("teal", {
  outline: "80,14 142,48 142,112 80,146 18,112 18,48",
  table: "80,44 112,62 112,98 80,116 48,98 48,62",
  facets: [
    ["80,14 142,48 112,62 80,44", 0.28],
    ["18,48 80,14 80,44 48,62", 0.12],
    ["142,112 80,146 80,116 112,98", 0.08],
    ["18,112 48,98 80,116 80,146", 0.18],
  ],
  light: "#9ff5e8",
  base: "#2dd4bf",
  dark: "#0b6e63",
});

const PURPLE_DIAMOND = gem("purp", {
  outline: "80,12 146,80 80,148 14,80",
  table: "80,44 116,80 80,116 44,80",
  facets: [
    ["80,12 146,80 116,80 80,44", 0.26],
    ["14,80 80,12 80,44 44,80", 0.14],
    ["146,80 80,148 80,116 116,80", 0.08],
    ["14,80 44,80 80,116 80,148", 0.18],
  ],
  light: "#dfb6ff",
  base: "#a855f7",
  dark: "#4c1d95",
});

const BLUE_OCT = gem("blue", {
  outline: "54,14 106,14 146,54 146,106 106,146 54,146 14,106 14,54",
  table: "64,44 96,44 116,64 116,96 96,116 64,116 44,96 44,64",
  facets: [
    ["54,14 106,14 96,44 64,44", 0.3],
    ["106,14 146,54 116,64 96,44", 0.18],
    ["14,54 54,14 64,44 44,64", 0.14],
    ["14,106 14,54 44,64 44,96", 0.1],
    ["54,146 14,106 44,96 64,116", 0.18],
    ["146,106 106,146 96,116 116,96", 0.06],
  ],
  light: "#b7d4ff",
  base: "#3b82f6",
  dark: "#1e3a8a",
});

const GREEN_EMERALD = gem("green", {
  outline: "40,18 120,18 142,40 142,120 120,142 40,142 18,120 18,40",
  table: "54,48 106,48 112,54 112,106 106,112 54,112 48,106 48,54",
  facets: [
    ["40,18 120,18 106,48 54,48", 0.3],
    ["120,18 142,40 142,120 112,106 112,54 106,48", 0.1],
    ["18,40 40,18 54,48 48,54 48,106 18,120", 0.16],
    ["18,120 48,106 54,112 106,112 120,142 40,142", 0.14],
  ],
  light: "#a7f3c6",
  base: "#22c55e",
  dark: "#14532d",
});

const AMBER_TOPAZ = gem("topaz", {
  outline: "80,16 136,40 148,96 110,144 50,144 12,96 24,40",
  table: "80,50 110,62 118,94 98,116 62,116 42,94 50,62",
  facets: [
    ["80,16 136,40 110,62 80,50", 0.3],
    ["24,40 80,16 80,50 50,62", 0.14],
    ["136,40 148,96 118,94 110,62", 0.1],
    ["12,96 24,40 50,62 42,94", 0.18],
    ["148,96 110,144 98,116 118,94", 0.06],
    ["50,144 12,96 42,94 62,116", 0.2],
  ],
  light: "#ffd79a",
  base: "#f59e0b",
  dark: "#92400e",
});

const ROSE_QUARTZ = gem("rose", {
  outline: "80,14 128,34 146,80 128,126 80,146 32,126 14,80 32,34",
  table: "80,46 106,58 116,80 106,102 80,114 54,102 44,80 54,58",
  facets: [
    ["80,14 128,34 106,58 80,46", 0.3],
    ["32,34 80,14 80,46 54,58", 0.14],
    ["128,34 146,80 116,80 106,58", 0.1],
    ["14,80 32,34 54,58 44,80", 0.18],
    ["146,80 128,126 106,102 116,80", 0.06],
    ["32,126 14,80 44,80 54,102", 0.2],
  ],
  light: "#ffd1ea",
  base: "#f472b6",
  dark: "#9d174d",
});

// --- high symbols -----------------------------------------------------------

const RUBY = gem("ruby", {
  outline: "80,20 118,30 146,66 136,110 80,148 24,110 14,66 42,30",
  table: "80,52 106,60 120,80 112,100 80,118 48,100 40,80 54,60",
  facets: [
    ["80,20 118,30 106,60 80,52", 0.3],
    ["42,30 80,20 80,52 54,60", 0.14],
    ["146,66 136,110 112,100 120,80", 0.08],
    ["24,110 14,66 40,80 48,100", 0.16],
    ["136,110 80,148 80,118 112,100", 0.06],
    ["80,148 24,110 48,100 80,118", 0.2],
  ],
  light: "#ff9aa6",
  base: "#ef233c",
  dark: "#7a0b1e",
});

const BELL = `
<defs>
  <linearGradient id="bell-body" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff2b0"/>
    <stop offset="0.4" stop-color="#ffd23f"/>
    <stop offset="0.8" stop-color="#d48a00"/>
    <stop offset="1" stop-color="#8a5300"/>
  </linearGradient>
  <linearGradient id="bell-rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe17a"/>
    <stop offset="1" stop-color="#a86700"/>
  </linearGradient>
</defs>
<ellipse cx="82" cy="126" rx="46" ry="10" fill="#000" opacity="0.3"/>
<rect x="72" y="14" width="16" height="18" rx="6" fill="url(#bell-rim)" stroke="#6b4000" stroke-width="2"/>
<path d="M80 26 C44 26 40 70 40 96 L32 112 L128 112 L120 96 C120 70 116 26 80 26 Z" fill="url(#bell-body)" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round"/>
<path d="M58 40 C52 54 50 74 50 92" stroke="#fff" stroke-opacity="0.65" stroke-width="7" stroke-linecap="round" fill="none"/>
<rect x="30" y="110" width="100" height="12" rx="6" fill="url(#bell-rim)" stroke="#6b4000" stroke-width="2"/>
<circle cx="80" cy="132" r="11" fill="url(#bell-body)" stroke="#6b4000" stroke-width="2"/>
<circle cx="76" cy="128" r="3" fill="#fff" opacity="0.8"/>`;

const SEVEN = `
<defs>
  <linearGradient id="seven-body" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8a9b"/>
    <stop offset="0.45" stop-color="#ff1f4b"/>
    <stop offset="1" stop-color="#8f0022"/>
  </linearGradient>
  <linearGradient id="seven-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff0b3"/>
    <stop offset="0.5" stop-color="#ffd23f"/>
    <stop offset="1" stop-color="#9a6200"/>
  </linearGradient>
</defs>
<polygon points="30,26 134,26 134,54 90,142 50,142 96,54 30,54" fill="#000" opacity="0.4" transform="translate(4 6)"/>
<polygon points="30,26 134,26 134,54 90,142 50,142 96,54 30,54" fill="url(#seven-gold)" stroke="#6b4000" stroke-width="3" stroke-linejoin="round"/>
<polygon points="38,33 126,33 126,51 84,135 58,135 102,47 38,47" fill="url(#seven-body)" stroke="#5a0012" stroke-width="2" stroke-linejoin="round"/>
<polygon points="40,35 124,35 122,40 42,40" fill="#fff" opacity="0.55"/>`;

const DIAMOND = `
<defs>
  <linearGradient id="dia-body" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.35" stop-color="#bfefff"/>
    <stop offset="0.7" stop-color="#5ec8ff"/>
    <stop offset="1" stop-color="#1b6ea8"/>
  </linearGradient>
</defs>
<polygon points="80,150 16,66 42,24 118,24 144,66" fill="#0a3b5c" opacity="0.45" transform="translate(3 5)"/>
<polygon points="80,150 16,66 42,24 118,24 144,66" fill="url(#dia-body)" stroke="#1b4f7a" stroke-width="3" stroke-linejoin="round"/>
<polygon points="42,24 118,24 100,66 60,66" fill="#fff" opacity="0.65"/>
<polygon points="16,66 42,24 60,66" fill="#fff" opacity="0.3"/>
<polygon points="118,24 144,66 100,66" fill="#fff" opacity="0.18"/>
<polygon points="60,66 100,66 80,150" fill="#fff" opacity="0.22"/>
<polygon points="16,66 60,66 80,150" fill="#7fd8ff" opacity="0.35"/>
<polygon points="100,66 144,66 80,150" fill="#1d7fc0" opacity="0.35"/>
<polygon points="80,150 16,66 42,24 118,24 144,66" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.5" stroke-linejoin="round"/>
<circle cx="56" cy="40" r="5" fill="#fff"/>`;

// --- wild + scatter ---------------------------------------------------------

const WILD = `
<defs>
  <linearGradient id="wild-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3b0"/>
    <stop offset="0.45" stop-color="#ffd700"/>
    <stop offset="1" stop-color="#9a6200"/>
  </linearGradient>
  <linearGradient id="wild-plate" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a1a5c"/>
    <stop offset="1" stop-color="#140826"/>
  </linearGradient>
</defs>
<rect x="18" y="26" width="124" height="108" rx="18" fill="#000" opacity="0.4" transform="translate(3 5)"/>
<rect x="18" y="26" width="124" height="108" rx="18" fill="url(#wild-gold)" stroke="#6b4000" stroke-width="3"/>
<rect x="28" y="36" width="104" height="88" rx="12" fill="url(#wild-plate)" stroke="#9945ff" stroke-width="2"/>
<text x="80" y="94" text-anchor="middle" font-size="46" ${FONT} fill="url(#wild-gold)" stroke="#5a3a00" stroke-width="1.5" letter-spacing="2">WILD</text>
<rect x="34" y="40" width="92" height="10" rx="5" fill="#fff" opacity="0.14"/>`;

const SCATTER = `
<defs>
  <radialGradient id="sc-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffd700" stop-opacity="0.9"/>
    <stop offset="0.6" stop-color="#ff9f1c" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#ff9f1c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sc-star" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3b0"/>
    <stop offset="0.5" stop-color="#ffb800"/>
    <stop offset="1" stop-color="#c2410c"/>
  </linearGradient>
  <linearGradient id="sc-plate" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9945ff"/>
    <stop offset="1" stop-color="#00ffa3"/>
  </linearGradient>
</defs>
<circle cx="80" cy="80" r="76" fill="url(#sc-glow)"/>
<polygon points="80,10 98,56 148,58 109,88 122,138 80,110 38,138 51,88 12,58 62,56" fill="#000" opacity="0.35" transform="translate(3 5)"/>
<polygon points="80,10 98,56 148,58 109,88 122,138 80,110 38,138 51,88 12,58 62,56" fill="url(#sc-star)" stroke="#7c2d12" stroke-width="3" stroke-linejoin="round"/>
<polygon points="80,10 98,56 80,66 62,56" fill="#fff" opacity="0.4"/>
<circle cx="80" cy="84" r="27" fill="url(#sc-plate)" stroke="#fff" stroke-width="2.5"/>
<text x="80" y="92" text-anchor="middle" font-size="22" ${FONT} fill="#fff" stroke="#1a0a2e" stroke-width="1">BONUS</text>`;

const INNER: readonly string[] = [
  WILD,
  TEAL_HEX,
  PURPLE_DIAMOND,
  BLUE_OCT,
  GREEN_EMERALD,
  AMBER_TOPAZ,
  ROSE_QUARTZ,
  RUBY,
  BELL,
  SEVEN,
  DIAMOND,
  SCATTER,
];

/** Full SVG document for a symbol, rasterising at `size` px. */
export function symbolSvg(symbol: number, size = ART_SIZE): string {
  return svg(INNER[symbol] ?? INNER[SYM.L1], size);
}

/** Data URL suitable for `<img src>` and Pixi image sources. */
export function symbolDataUrl(symbol: number, size = ART_SIZE): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(symbol, size))}`;
}

export function symbolColor(symbol: number): string {
  return SYMBOL_COLORS[symbol] ?? "#ffffff";
}
