/**
 * Hidden SVG sprite for Pharaoh's Fortune (game 3). One <symbol> per
 * symbol index — index === on-chain digit (programs/spin/src/constants.rs
 * PHARAOH_BASE_BP), ordered low → high value. Symbol 9 is the expanding
 * wild (Pharaoh), symbol 8 the scarab free-spin trigger.
 *
 * Same performance rules as the slots sprite: no SVG <filter>, shared
 * gradients, static highlight/shadow shapes. Gold, lapis and lacquer.
 */
export function PharaohSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <linearGradient id="ph-g-sand" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffe8b0" />
          <stop offset="45%" stopColor="#e3b96a" />
          <stop offset="100%" stopColor="#a97f33" />
        </linearGradient>
        <linearGradient id="ph-g-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#d19a00" />
          <stop offset="100%" stopColor="#8a5f00" />
        </linearGradient>
        <linearGradient id="ph-g-lapis" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#7fa8ff" />
          <stop offset="45%" stopColor="#2c54c8" />
          <stop offset="100%" stopColor="#122a75" />
        </linearGradient>
        <linearGradient id="ph-g-jade" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#b8f0c0" />
          <stop offset="45%" stopColor="#3fa857" />
          <stop offset="100%" stopColor="#1d5c33" />
        </linearGradient>
        <linearGradient id="ph-g-red" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff9a7a" />
          <stop offset="45%" stopColor="#d23c1a" />
          <stop offset="100%" stopColor="#7d1305" />
        </linearGradient>
        <radialGradient id="ph-g-eye" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffb3c0" />
          <stop offset="50%" stopColor="#e01030" />
          <stop offset="100%" stopColor="#7d0016" />
        </radialGradient>
      </defs>

      {/* 0 — Dune */}
      <symbol id="pharaoh-sym-0" viewBox="0 0 64 64">
        <path
          d="M4 46c12-14 20-12 30-2 9-9 16-8 26 2"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M4 52h56"
          stroke="#a97f33"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M4 46c12-14 20-12 30-2"
          stroke="#ffefc0"
          strokeWidth="2"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
        <circle
          cx="14"
          cy="14"
          r="4.5"
          fill="url(#ph-g-gold)"
          stroke="#8a5f00"
          strokeWidth="1.2"
        />
      </symbol>

      {/* 1 — Lotus */}
      <symbol id="pharaoh-sym-1" viewBox="0 0 64 64">
        <path
          d="M32 52c-2-12-2-24 0-36"
          stroke="#3fa857"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M32 16c-14-10-28-6-28-6 2 12 12 20 28 20z"
          fill="url(#ph-g-lapis)"
        />
        <path
          d="M32 16c14-10 28-6 28-6-2 12-12 20-28 20z"
          fill="url(#ph-g-lapis)"
        />
        <path d="M32 18c-8-8-18-6-18-6 2 8 9 14 18 14z" fill="#9cc0ff" />
        <path d="M32 18c8-8 18-6 18-6-2 8-9 14-18 14z" fill="#9cc0ff" />
        <path d="M32 22c-3-3-7-2-7-2 0 3 3 5 7 5z" fill="#122a75" />
        <path d="M32 22c3-3 7-2 7-2 0 3-3 5-7 5z" fill="#122a75" />
        <ellipse cx="32" cy="24" rx="2.6" ry="3.6" fill="#ffd700" />
      </symbol>

      {/* 2 — Beetle */}
      <symbol id="pharaoh-sym-2" viewBox="0 0 64 64">
        <ellipse
          cx="32"
          cy="38"
          rx="18"
          ry="22"
          fill="url(#ph-g-jade)"
          stroke="#1d5c33"
          strokeWidth="1.6"
        />
        <path
          d="M32 16v-6"
          stroke="#1d5c33"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="32" cy="20" r="4" fill="#1d5c33" />
        <path d="M32 26v26" stroke="#1d5c33" strokeWidth="2" opacity="0.75" />
        <path
          d="M22 24c-6-3-12-1-12-1"
          stroke="#1d5c33"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M42 24c6-3 12-1 12-1"
          stroke="#1d5c33"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse
          cx="24"
          cy="44"
          rx="4.5"
          ry="6"
          fill="#b8f0c0"
          opacity="0.55"
        />
        <ellipse
          cx="40"
          cy="44"
          rx="4.5"
          ry="6"
          fill="#b8f0c0"
          opacity="0.55"
        />
      </symbol>

      {/* 3 — Cat */}
      <symbol id="pharaoh-sym-3" viewBox="0 0 64 64">
        <path
          d="M16 58L22 42h20l6 16"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.5"
        />
        <path
          d="M16 58h32l4-14c0-14-8-26-20-26s-20 12-20 26z"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.5"
        />
        <path
          d="M26 40c2 3 10 3 12 0"
          stroke="#8a5f00"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M16 30l-9-6 2 10z"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M48 30l9-6-2 10z"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M22 12l-3-8M42 12l3-8"
          stroke="#8a5f00"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="23" cy="21" r="1.8" fill="#2c1a00" />
        <circle cx="41" cy="21" r="1.8" fill="#2c1a00" />
        <ellipse
          cx="20"
          cy="18"
          rx="4.5"
          ry="2.4"
          fill="#ffd700"
          opacity="0.7"
        />
        <ellipse
          cx="44"
          cy="18"
          rx="4.5"
          ry="2.4"
          fill="#ffd700"
          opacity="0.7"
        />
      </symbol>

      {/* 4 — Eye */}
      <symbol id="pharaoh-sym-4" viewBox="0 0 64 64">
        <path
          d="M6 32c12-14 40-14 52 0-12 14-40 14-52 0z"
          fill="url(#ph-g-eye)"
          stroke="#7d0016"
          strokeWidth="2"
        />
        <circle cx="32" cy="32" r="10" fill="#fff" />
        <circle cx="32" cy="32" r="5.5" fill="#122a75" />
        <circle cx="30" cy="30" r="2" fill="#fff" />
        <path
          d="M42 22l7-9"
          stroke="#e01030"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M46 14l6-2"
          stroke="#7d0016"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M40 16l5-6"
          stroke="#e01030"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M52 24l8-3"
          stroke="#e01030"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M6 32h52" stroke="#fff" strokeWidth="1.6" opacity="0.35" />
      </symbol>

      {/* 5 — Ankh */}
      <symbol id="pharaoh-sym-5" viewBox="0 0 64 64">
        <path
          d="M32 6c8 10 13 20 13 28 0 8-5 14-13 14s-13-6-13-14c0-8 5-18 13-28z"
          fill="none"
          stroke="url(#ph-g-gold)"
          strokeWidth="7"
        />
        <path
          d="M32 6c8 10 13 20 13 28 0 8-5 14-13 14s-13-6-13-14c0-8 5-18 13-28z"
          fill="none"
          stroke="#fff3b0"
          strokeWidth="2.4"
          opacity="0.7"
        />
        <path
          d="M10 32h44"
          stroke="url(#ph-g-gold)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M10 32h44"
          stroke="#fff3b0"
          strokeWidth="2.4"
          opacity="0.7"
          strokeLinecap="round"
        />
        <path
          d="M32 34v20"
          stroke="url(#ph-g-gold)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </symbol>

      {/* 6 — Horus */}
      <symbol id="pharaoh-sym-6" viewBox="0 0 64 64">
        <path
          d="M32 6C18 16 10 28 10 40c0 12 10 18 22 18s22-6 22-18C54 28 46 16 32 6z"
          fill="url(#ph-g-lapis)"
          stroke="#122a75"
          strokeWidth="1.6"
        />
        <path
          d="M32 14l-5-5 10 5"
          stroke="#122a75"
          strokeWidth="1.5"
          fill="none"
        />
        <path d="M10 40l-6 4 7 2" fill="#122a75" />
        <path d="M54 40l6 4-7 2" fill="#122a75" />
        <path
          d="M24 34h16"
          stroke="#ffd700"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M24 40c2 3 4 5 8 5s6-2 8-5"
          stroke="#ffd700"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="32" cy="31" r="2.6" fill="#fff" />
        <path
          d="M30 46c1 2 2 4 2 6"
          stroke="#ffd700"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M30 50h4"
          stroke="#ffd700"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </symbol>

      {/* 7 — Sphinx */}
      <symbol id="pharaoh-sym-7" viewBox="0 0 64 64">
        <path
          d="M6 54l5-34 9 8V14l8 6V8l4 12h8L44 8v12l8-6 9 8 5 34z"
          fill="url(#ph-g-sand)"
          stroke="#8a5f00"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M20 46c6-4 18-4 24 0"
          stroke="#8a5f00"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M26 36c3 2 9 2 12 0"
          stroke="#8a5f00"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M12 54h40l4-6"
          stroke="#a97f33"
          strokeWidth="2.4"
          fill="none"
        />
        <circle cx="27" cy="20" r="1.7" fill="#2c1a00" />
        <circle cx="37" cy="20" r="1.7" fill="#2c1a00" />
        <path
          d="M20 14h24"
          stroke="#8a5f00"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </symbol>

      {/* 8 — Scarab */}
      <symbol id="pharaoh-sym-8" viewBox="0 0 64 64">
        <ellipse
          cx="32"
          cy="40"
          rx="20"
          ry="20"
          fill="url(#ph-g-gold)"
          stroke="#8a5f00"
          strokeWidth="1.8"
        />
        <path d="M32 20v-5M32 22v28" stroke="#8a5f00" strokeWidth="2.4" />
        <path
          d="M22 28c-7-4-14-2-14-2"
          stroke="#8a5f00"
          strokeWidth="3.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M42 28c7-4 14-2 14-2"
          stroke="#8a5f00"
          strokeWidth="3.4"
          fill="none"
          strokeLinecap="round"
        />
        <circle
          cx="32"
          cy="18"
          r="3.4"
          fill="#122a75"
          stroke="#8a5f00"
          strokeWidth="1"
        />
        <circle cx="24" cy="46" r="3.2" fill="#e01030" />
        <circle cx="32" cy="46" r="3.2" fill="#122a75" />
        <circle cx="40" cy="46" r="3.2" fill="#3fa857" />
        <ellipse cx="25" cy="34" rx="4" ry="5" fill="#fff" opacity="0.4" />
      </symbol>

      {/* 9 — Pharaoh (wild) */}
      <symbol id="pharaoh-sym-9" viewBox="0 0 64 64">
        <path
          d="M8 58V30c0-14 10-24 24-24s24 10 24 24v28"
          fill="url(#ph-g-gold)"
          stroke="#8a5f00"
          strokeWidth="2"
        />
        <path
          d="M8 58h48"
          stroke="#8a5f00"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M14 40h36v18H14z"
          fill="#122a75"
          stroke="#8a5f00"
          strokeWidth="1.6"
        />
        <path
          d="M14 34c4 4 46 4 50 0"
          stroke="#ffd700"
          strokeWidth="2"
          fill="none"
          opacity="0.8"
        />
        <path
          d="M14 22c4 5 46 5 50 0"
          stroke="#ffd700"
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M32 40c6 0 10 5 10 11 0 4-3 7-10 7s-10-3-10-7c0-6 4-11 10-11z"
          fill="url(#ph-g-lapis)"
          stroke="#122a75"
          strokeWidth="1.4"
        />
        <circle cx="27" cy="49" r="1.6" fill="#fff" />
        <circle cx="37" cy="49" r="1.6" fill="#fff" />
        <path
          d="M27 54c2 2 8 2 10 0"
          stroke="#fff"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M18 44l-3 2M46 44l3 2"
          stroke="#ffd700"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </symbol>
    </svg>
  );
}
