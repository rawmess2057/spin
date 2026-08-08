/**
 * Hidden SVG sprite for Dynamite Mines (game 5). One <symbol> per symbol
 * index — index === on-chain digit (programs/spin/src/constants.rs
 * MINES_BASE_BP), ordered low → high value. The board cascades: winning
 * symbols detonate, survivors drop, fresh symbols fall in.
 *
 * Same performance rules as the slots sprite: no SVG <filter>, shared
 * gradients, static highlight/shadow shapes. Earth tones and steel.
 */
export function MinesSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <linearGradient id="mi-g-stone" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#d8d8d8" />
          <stop offset="45%" stopColor="#9a9a9a" />
          <stop offset="100%" stopColor="#5c5c5c" />
        </linearGradient>
        <linearGradient id="mi-g-coal" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#5a5a66" />
          <stop offset="45%" stopColor="#2e2e38" />
          <stop offset="100%" stopColor="#101018" />
        </linearGradient>
        <linearGradient id="mi-g-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#d19a00" />
          <stop offset="100%" stopColor="#8a5f00" />
        </linearGradient>
        <linearGradient id="mi-g-wood" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#c89a6a" />
          <stop offset="45%" stopColor="#a9743d" />
          <stop offset="100%" stopColor="#6e451f" />
        </linearGradient>
        <linearGradient id="mi-g-red" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff8a80" />
          <stop offset="45%" stopColor="#d32f2f" />
          <stop offset="100%" stopColor="#7d0f0f" />
        </linearGradient>
        <linearGradient id="mi-g-steel" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#c8cede" />
          <stop offset="65%" stopColor="#7d8598" />
          <stop offset="100%" stopColor="#3b4152" />
        </linearGradient>
        <radialGradient id="mi-g-lamp" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffe9a0" />
          <stop offset="50%" stopColor="#ffc43d" />
          <stop offset="100%" stopColor="#b07a00" />
        </radialGradient>
      </defs>

      {/* 0 — Pebble */}
      <symbol id="mines-sym-0" viewBox="0 0 64 64">
        <path
          d="M14 40c-4-8-4-16 2-22 7-7 17-7 24-1 7 6 8 16 3 23-5 8-15 12-24 8-3-2-4-4-5-8z"
          fill="url(#mi-g-stone)"
          stroke="#5c5c5c"
          strokeWidth="1.6"
        />
        <path
          d="M20 22c5-5 13-5 18-1"
          stroke="#fff"
          strokeWidth="2"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
        />
        <path
          d="M24 44c5-4 12-4 16-1"
          stroke="#3b4152"
          strokeWidth="1.6"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
      </symbol>

      {/* 1 — Mushroom */}
      <symbol id="mines-sym-1" viewBox="0 0 64 64">
        <rect
          x="28"
          y="36"
          width="8"
          height="16"
          rx="3"
          fill="#d8c8a8"
          stroke="#8a7550"
          strokeWidth="1.4"
        />
        <path
          d="M6 38c0-12 10-24 26-24s26 12 26 24c-8-3-16-3-24 0-8-3-16-3-28 0z"
          fill="#c8885c"
          stroke="#8a4a2c"
          strokeWidth="1.7"
        />
        <ellipse cx="14" cy="25" rx="3.4" ry="2.6" fill="#fff" opacity="0.75" />
        <ellipse cx="26" cy="20" rx="3" ry="2.4" fill="#fff" opacity="0.75" />
        <ellipse cx="38" cy="22" rx="3.4" ry="2.6" fill="#fff" opacity="0.75" />
        <circle cx="34" cy="31" r="2" fill="#7d3a1f" opacity="0.6" />
      </symbol>

      {/* 2 — Coal */}
      <symbol id="mines-sym-2" viewBox="0 0 64 64">
        <path
          d="M10 30c2-9 10-16 20-16s18 7 20 16c2 9-4 18-13 20-10 2-19-5-22-14-2-4-4-6-5-6z"
          fill="url(#mi-g-coal)"
          stroke="#101018"
          strokeWidth="1.6"
        />
        <path
          d="M22 16c4-3 10-3 14-1"
          stroke="#5a5a66"
          strokeWidth="2.4"
          fill="none"
          opacity="0.8"
          strokeLinecap="round"
        />
        <path
          d="M30 34c4-4 10-3 13 1"
          stroke="#5a5a66"
          strokeWidth="2"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
        <path
          d="M16 32c4-2 7 0 9 3"
          stroke="#5a5a66"
          strokeWidth="1.8"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
      </symbol>

      {/* 3 — Cart */}
      <symbol id="mines-sym-3" viewBox="0 0 64 64">
        <path
          d="M8 40h40l6 12H14z"
          fill="url(#mi-g-wood)"
          stroke="#6e451f"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8 40v-6h40v6"
          fill="#c89a6a"
          stroke="#6e451f"
          strokeWidth="1.8"
        />
        <circle
          cx="18"
          cy="54"
          r="5"
          fill="url(#mi-g-steel)"
          stroke="#3b4152"
          strokeWidth="1.6"
        />
        <circle
          cx="40"
          cy="54"
          r="5"
          fill="url(#mi-g-steel)"
          stroke="#3b4152"
          strokeWidth="1.6"
        />
        <circle cx="18" cy="54" r="1.8" fill="#3b4152" />
        <circle cx="40" cy="54" r="1.8" fill="#3b4152" />
        <path
          d="M42 20l-6 14h20z"
          fill="url(#mi-g-coal)"
          stroke="#101018"
          strokeWidth="1.4"
        />
        <path d="M8 44h46" stroke="#6e451f" strokeWidth="1.4" opacity="0.6" />
        <circle cx="16" cy="26" r="5" fill="#2e2e38" opacity="0.5" />
        <circle cx="26" cy="18" r="4" fill="#2e2e38" opacity="0.5" />
      </symbol>

      {/* 4 — Pickaxe */}
      <symbol id="mines-sym-4" viewBox="0 0 64 64">
        <path
          d="M10 54L46 18"
          stroke="#8a6a45"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M10 54L46 18"
          stroke="#c89a6a"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M8 56l6 4"
          stroke="#8a6a45"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M40 10l14 14"
          stroke="#3b4152"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M26 24c-4-2-7-6-9-11 5 1 9 3 11 7M22 18c-5-1-9-4-11-8 4 1 7 3 10 5"
          stroke="url(#mi-g-steel)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M28 30c-3-1-5-4-7-7M22 26c-3 0-5-1-7-2"
          stroke="#fff"
          strokeWidth="1.8"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
      </symbol>

      {/* 5 — Helmet */}
      <symbol id="mines-sym-5" viewBox="0 0 64 64">
        <path
          d="M8 44c0-15 11-26 24-26s24 11 24 26v4H8z"
          fill="url(#mi-g-steel)"
          stroke="#3b4152"
          strokeWidth="1.8"
        />
        <rect
          x="8"
          y="44"
          width="48"
          height="8"
          rx="2"
          fill="#d19a00"
          stroke="#8a5f00"
          strokeWidth="1.6"
        />
        <circle cx="32" cy="16" r="3.4" fill="#ffd700" />
        <path
          d="M18 30c5-5 23-5 28 0"
          stroke="#3b4152"
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M14 38h36"
          stroke="#3b4152"
          strokeWidth="2"
          fill="none"
          opacity="0.4"
        />
        <ellipse cx="27" cy="26" rx="5" ry="2.6" fill="#fff" opacity="0.5" />
      </symbol>

      {/* 6 — Lamp */}
      <symbol id="mines-sym-6" viewBox="0 0 64 64">
        <path
          d="M32 6v6"
          stroke="#8a6a45"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M24 12h16l-3 20c0 4-3 6-5 6s-5-2-5-6z"
          fill="url(#mi-g-wood)"
          stroke="#6e451f"
          strokeWidth="1.6"
        />
        <ellipse
          cx="32"
          cy="26"
          rx="7"
          ry="9"
          fill="url(#mi-g-lamp)"
          stroke="#b07a00"
          strokeWidth="1.4"
        />
        <path
          d="M25 50h14"
          stroke="#8a6a45"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M29 50v6h6v-6"
          stroke="#8a6a45"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <ellipse cx="29" cy="22" rx="3" ry="4.4" fill="#fff" opacity="0.7" />
        <path
          d="M20 13c4-2 20-2 24 0"
          stroke="#8a6a45"
          strokeWidth="1.6"
          fill="none"
        />
      </symbol>

      {/* 7 — Nugget */}
      <symbol id="mines-sym-7" viewBox="0 0 64 64">
        <path
          d="M12 40c-3-8-1-16 5-22 7-7 18-8 26-2 8 6 10 16 6 24-4 9-14 14-24 12-4-1-10-5-13-12z"
          fill="url(#mi-g-gold)"
          stroke="#8a5f00"
          strokeWidth="1.7"
        />
        <path
          d="M20 22c5-6 14-7 20-3"
          stroke="#fff3b0"
          strokeWidth="2.6"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
        <circle cx="40" cy="34" r="2.4" fill="#fff" opacity="0.5" />
        <path
          d="M24 44c6-4 14-4 20-1"
          stroke="#8a5f00"
          strokeWidth="1.6"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
      </symbol>

      {/* 8 — Crate */}
      <symbol id="mines-sym-8" viewBox="0 0 64 64">
        <rect
          x="8"
          y="18"
          width="48"
          height="34"
          rx="3"
          fill="url(#mi-g-wood)"
          stroke="#6e451f"
          strokeWidth="2"
        />
        <path
          d="M8 18l24 14 24-14"
          fill="#c89a6a"
          stroke="#6e451f"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M32 32v20" stroke="#6e451f" strokeWidth="2" />
        <path d="M8 34h48" stroke="#6e451f" strokeWidth="2" />
        <path d="M22 18v14M42 18v14" stroke="#6e451f" strokeWidth="2" />
        <path
          d="M20 34c4 2 12 2 12 0s8-2 12 0"
          stroke="#6e451f"
          strokeWidth="1.6"
          fill="none"
          opacity="0.7"
        />
      </symbol>

      {/* 9 — Dynamite */}
      <symbol id="mines-sym-9" viewBox="0 0 64 64">
        <path
          d="M32 10l4 10c2 5-1 8 1 12 1 2 4 2 5 0 2-3 1-8 3-10 2 3 3 7 3 10 0 9-7 14-16 14s-16-5-16-14c0-3 1-7 3-10 2 2 1 7 3 10 1 2 4 2 5 0 2-4-1-7 1-12z"
          fill="url(#mi-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M28 32l-4-14h16l-4 14"
          stroke="#ffb3ad"
          strokeWidth="1.6"
          fill="none"
          opacity="0.8"
        />
        <circle
          cx="32"
          cy="9"
          r="3.4"
          fill="#ffd9d9"
          stroke="#7d0f0f"
          strokeWidth="1.4"
        />
        <path
          d="M32 6v-2M27 8l-3-2M37 8l3-2"
          stroke="#ffd9d9"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
        <ellipse cx="24" cy="42" rx="3" ry="2" fill="#fff" opacity="0.35" />
      </symbol>
    </svg>
  );
}
