/**
 * Hidden SVG sprite for Golden Dragon (game 4). One <symbol> per symbol
 * index — index === on-chain digit (programs/spin/src/constants.rs
 * DRAGON_BASE_BP), ordered low → high value. Symbol 8 is the pearl
 * (5+ doubles the win, 9+ triples it).
 *
 * Same performance rules as the slots sprite: no SVG <filter>, shared
 * gradients, static highlight/shadow shapes. Lacquer red, gold and jade.
 */
export function DragonSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <linearGradient id="dr-g-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#d19a00" />
          <stop offset="100%" stopColor="#8a5f00" />
        </linearGradient>
        <linearGradient id="dr-g-red" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff8a80" />
          <stop offset="45%" stopColor="#d32f2f" />
          <stop offset="100%" stopColor="#7d0f0f" />
        </linearGradient>
        <linearGradient id="dr-g-jade" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#c4f0d0" />
          <stop offset="45%" stopColor="#3fa857" />
          <stop offset="100%" stopColor="#1d5c33" />
        </linearGradient>
        <radialGradient id="dr-g-pearl" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#ffd9e8" />
          <stop offset="100%" stopColor="#e8a0c0" />
        </radialGradient>
        <radialGradient id="dr-g-koi" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffb35c" />
          <stop offset="45%" stopColor="#ff8a1f" />
          <stop offset="100%" stopColor="#b04a00" />
        </radialGradient>
        <linearGradient id="dr-g-steel" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#c8cede" />
          <stop offset="65%" stopColor="#7d8598" />
          <stop offset="100%" stopColor="#3b4152" />
        </linearGradient>
      </defs>

      {/* 0 — Coin */}
      <symbol id="dragon-sym-0" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="24"
          fill="url(#dr-g-gold)"
          stroke="#8a5f00"
          strokeWidth="2"
        />
        <circle
          cx="32"
          cy="32"
          r="17"
          fill="none"
          stroke="#8a5f00"
          strokeWidth="1.4"
          opacity="0.6"
        />
        <rect x="26" y="18" width="12" height="28" rx="2" fill="#7d0f0f" />
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fontSize="12"
          fontWeight="900"
          fill="#ffd9d9"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          ¥
        </text>
        <ellipse cx="23" cy="20" rx="6" ry="3.4" fill="#fff" opacity="0.5" />
      </symbol>

      {/* 1 — Fan */}
      <symbol id="dragon-sym-1" viewBox="0 0 64 64">
        <path
          d="M32 50L14 12c8 2 13 5 18 10 5-5 10-8 18-10z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M32 50L14 12c8 2 13 5 18 10"
          fill="none"
          stroke="#ffb3ad"
          strokeWidth="1.4"
          opacity="0.6"
        />
        <path
          d="M32 50c3-6 12-8 18-10l-18-18z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M22 20c3 3 5 7 5 11M42 20c-3 3-5 7-5 11"
          stroke="#ffb3ad"
          strokeWidth="1.3"
          opacity="0.7"
          fill="none"
        />
        <rect x="29.5" y="44" width="5" height="12" rx="2" fill="#8a5f00" />
      </symbol>

      {/* 2 — Lantern */}
      <symbol id="dragon-sym-2" viewBox="0 0 64 64">
        <rect x="28" y="6" width="8" height="6" rx="1.5" fill="#d19a00" />
        <rect x="29" y="52" width="6" height="6" rx="1.5" fill="#d19a00" />
        <path
          d="M20 30c0-8 5-14 12-14s12 6 12 14v8c0 8-5 14-12 14s-12-6-12-14z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.6"
        />
        <path
          d="M23 30h18M23 38h18"
          stroke="#ffb3ad"
          strokeWidth="1.3"
          opacity="0.7"
        />
        <ellipse cx="32" cy="34" rx="7" ry="9" fill="#ffd34d" opacity="0.85" />
        <path
          d="M20 30c0-8 5-14 12-14"
          stroke="#8a5f00"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M20 38c0 8 5 14 12 14"
          stroke="#8a5f00"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      </symbol>

      {/* 3 — Pagoda */}
      <symbol id="dragon-sym-3" viewBox="0 0 64 64">
        <path
          d="M32 6l-20 12h40z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect
          x="17"
          y="18"
          width="30"
          height="10"
          fill="#e8e0c8"
          stroke="#a99a78"
          strokeWidth="1.3"
        />
        <path
          d="M32 28l-16 10h32z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect
          x="20"
          y="38"
          width="24"
          height="8"
          fill="#e8e0c8"
          stroke="#a99a78"
          strokeWidth="1.3"
        />
        <path
          d="M32 46l-14 10h28z"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="8" r="2" fill="#ffd700" />
      </symbol>

      {/* 4 — Koi */}
      <symbol id="dragon-sym-4" viewBox="0 0 64 64">
        <ellipse
          cx="30"
          cy="34"
          rx="22"
          ry="13"
          fill="url(#dr-g-koi)"
          stroke="#b04a00"
          strokeWidth="1.6"
        />
        <path
          d="M30 21c8-6 16-8 24-6l-8 12z"
          fill="#ffd9a0"
          stroke="#b04a00"
          strokeWidth="1.2"
        />
        <path
          d="M8 40c-3 5-5 9-5 12 4-1 8-4 10-9"
          fill="url(#dr-g-koi)"
          stroke="#b04a00"
          strokeWidth="1.2"
        />
        <path
          d="M12 26l-8-6 5 9"
          fill="#ffd9a0"
          stroke="#b04a00"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="15" cy="33" r="2.4" fill="#2c1a00" />
        <ellipse cx="24" cy="34" rx="7" ry="5.5" fill="#fff" opacity="0.6" />
        <path
          d="M12 34c5-3 9-5 12-5"
          stroke="#b04a00"
          strokeWidth="1.4"
          fill="none"
          opacity="0.7"
        />
      </symbol>

      {/* 5 — Lotus */}
      <symbol id="dragon-sym-5" viewBox="0 0 64 64">
        <path
          d="M32 54c-2-12-2-24 0-36"
          stroke="#3fa857"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M32 18c-13-9-27-5-27-5 2 12 12 19 27 19z"
          fill="#f8c0d0"
          stroke="#c8608c"
          strokeWidth="1.2"
        />
        <path
          d="M32 18c13-9 27-5 27-5-2 12-12 19-27 19z"
          fill="#f8c0d0"
          stroke="#c8608c"
          strokeWidth="1.2"
        />
        <path d="M32 20c-8-8-17-5-17-5 2 8 9 13 17 13z" fill="#ffd9e8" />
        <path d="M32 20c8-8 17-5 17-5-2 8-9 13-17 13z" fill="#ffd9e8" />
        <ellipse cx="32" cy="26" rx="3" ry="4" fill="#ffd700" />
      </symbol>

      {/* 6 — Turtle */}
      <symbol id="dragon-sym-6" viewBox="0 0 64 64">
        <ellipse
          cx="32"
          cy="36"
          rx="20"
          ry="15"
          fill="url(#dr-g-jade)"
          stroke="#1d5c33"
          strokeWidth="1.8"
        />
        <path
          d="M32 21v30M22 23c6 4 14 4 20 0M22 49c6-4 14-4 20 0M15 30c5 4 7 9 7 13M49 30c-5 4-7 9-7 13"
          stroke="#1d5c33"
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />
        <circle
          cx="13"
          cy="52"
          r="4"
          fill="#3fa857"
          stroke="#1d5c33"
          strokeWidth="1.2"
        />
        <circle
          cx="51"
          cy="52"
          r="4"
          fill="#3fa857"
          stroke="#1d5c33"
          strokeWidth="1.2"
        />
        <circle cx="18" cy="29" r="4.4" fill="#1d5c33" />
        <circle cx="46" cy="29" r="4.4" fill="#1d5c33" />
        <circle cx="20.5" cy="27.5" r="1.6" fill="#c4f0d0" />
        <circle cx="43.5" cy="27.5" r="1.6" fill="#c4f0d0" />
      </symbol>

      {/* 7 — Feng */}
      <symbol id="dragon-sym-7" viewBox="0 0 64 64">
        <ellipse
          cx="32"
          cy="40"
          rx="14"
          ry="17"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.6"
        />
        <path
          d="M32 6v38"
          stroke="#8a5f00"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M32 8c-10 8-14 12-14 16 5-2 10-3 14-3 4 0 9 1 14 3 0-4-4-8-14-16z"
          fill="url(#dr-g-gold)"
          stroke="#8a5f00"
          strokeWidth="1.3"
        />
        <path
          d="M14 40c-5 4-7 9-7 12 5-1 9-4 12-9M50 40c5 4 7 9 7 12-5-1-9-4-12-9"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.2"
        />
        <path
          d="M22 54c2 2 6 2 9 1 2-4 3-8 1-10-3 3-7 4-10 9z"
          fill="#ffb35c"
          stroke="#b04a00"
          strokeWidth="1.2"
        />
        <path
          d="M40 54c-2 2-6 2-9 1-2-4-3-8-1-10 3 3 7 4 10 9z"
          fill="#ffb35c"
          stroke="#b04a00"
          strokeWidth="1.2"
        />
        <circle cx="32" cy="42" r="2.4" fill="#2c1a00" />
        <path
          d="M28 46c2 1.4 6 1.4 8 0"
          stroke="#7d0f0f"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </symbol>

      {/* 8 — Pearl */}
      <symbol id="dragon-sym-8" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="34"
          r="21"
          fill="url(#dr-g-pearl)"
          stroke="#c8608c"
          strokeWidth="1.8"
        />
        <ellipse cx="24" cy="25" rx="7" ry="5" fill="#fff" opacity="0.85" />
        <path
          d="M32 8v-4"
          stroke="#e8a0c0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M20 13l-5-4M44 13l5-4"
          stroke="#e8a0c0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M12 24l-4-5"
          stroke="#e8a0c0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M52 24l4-5"
          stroke="#e8a0c0"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </symbol>

      {/* 9 — Dragon */}
      <symbol id="dragon-sym-9" viewBox="0 0 64 64">
        <path
          d="M6 34c6 2 10 8 12 16 5-3 9-7 12-12 3 5 7 9 12 12 2-8 6-14 12-16"
          fill="url(#dr-g-red)"
          stroke="#7d0f0f"
          strokeWidth="1.8"
        />
        <path
          d="M32 40c-5-6-8-12-7-19 6 1 11 4 14 9 3-5 8-8 14-9 1 7-2 13-7 19-5-2-9-2-14 0z"
          fill="url(#dr-g-gold)"
          stroke="#8a5f00"
          strokeWidth="1.5"
        />
        <circle cx="32" cy="33" r="2.6" fill="#7d0f0f" />
        <path
          d="M20 14l-4 8 7 1z"
          fill="#ffd700"
          stroke="#8a5f00"
          strokeWidth="1.2"
        />
        <path
          d="M44 14l4 8-7 1z"
          fill="#ffd700"
          stroke="#8a5f00"
          strokeWidth="1.2"
        />
        <path
          d="M24 24c2 2 14 2 16 0"
          stroke="#8a5f00"
          strokeWidth="1.4"
          fill="none"
          opacity="0.6"
        />
        <path
          d="M16 26l-8 2 6 4zM48 26l8 2-6 4z"
          fill="#d32f2f"
          stroke="#7d0f0f"
          strokeWidth="1.1"
        />
        <path
          d="M14 46c-3 4-3 8 0 10M50 46c3 4 3 8 0 10"
          stroke="#d32f2f"
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />
      </symbol>
    </svg>
  );
}
