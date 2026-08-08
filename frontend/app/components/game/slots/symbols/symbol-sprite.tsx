/**
 * One hidden SVG sprite holding every reel symbol as a <symbol> definition,
 * mounted once per screen. Each reel cell then renders a cheap
 * <svg><use href="#spin-sym-N"/></svg> instead of its own inline artwork.
 *
 * This matters for performance: the reel strips put ~100 symbol instances on
 * screen at once and animate them at 60fps. Duplicating full artwork (with
 * its own gradient defs) that many times would stall the spin, so the
 * gradients live here once and every instance references them.
 *
 * Deliberately no SVG <filter> anywhere — filters are the expensive part of
 * SVG rendering and would be applied ~100×. Depth comes from static
 * highlight/shadow shapes and coloured rim strokes instead, which cost
 * nothing extra. The win glow is applied as a CSS drop-shadow on the single
 * winning cell (see reel.tsx), not per symbol.
 *
 * Symbol index === on-chain symbol index (programs/spin/src/constants.rs
 * SLOTS_BASE_BP), ordered low → high value. Classic Vegas look: polished
 * gold, chrome and lacquer red.
 */
export function SymbolSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <radialGradient id="spin-g-cherry" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff7b85" />
          <stop offset="45%" stopColor="#e01030" />
          <stop offset="100%" stopColor="#7d0016" />
        </radialGradient>
        <linearGradient id="spin-g-lemon" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#fff08a" />
          <stop offset="50%" stopColor="#f5cf1b" />
          <stop offset="100%" stopColor="#b98d00" />
        </linearGradient>
        <radialGradient id="spin-g-orange" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffc06a" />
          <stop offset="50%" stopColor="#ff8a1f" />
          <stop offset="100%" stopColor="#b04a00" />
        </radialGradient>
        <radialGradient id="spin-g-plum" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#b06ad4" />
          <stop offset="45%" stopColor="#7a1fa8" />
          <stop offset="100%" stopColor="#3c005e" />
        </radialGradient>
        <linearGradient id="spin-g-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#d19a00" />
          <stop offset="100%" stopColor="#8a5f00" />
        </linearGradient>
        <linearGradient id="spin-g-gold-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc057" />
          <stop offset="100%" stopColor="#8a5f00" />
        </linearGradient>
        <linearGradient id="spin-g-diamond" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#e8ffff" />
          <stop offset="40%" stopColor="#6ce8ff" />
          <stop offset="100%" stopColor="#0a7fa8" />
        </linearGradient>
        <linearGradient id="spin-g-seven" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff8a95" />
          <stop offset="45%" stopColor="#f00001" />
          <stop offset="100%" stopColor="#8f0016" />
        </linearGradient>
        <linearGradient id="spin-g-chrome" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#c8cede" />
          <stop offset="65%" stopColor="#7d8598" />
          <stop offset="100%" stopColor="#3b4152" />
        </linearGradient>
        <linearGradient id="spin-g-hoof" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="45%" stopColor="#c8920a" />
          <stop offset="100%" stopColor="#7a5200" />
        </linearGradient>
      </defs>

      {/* 0 — Cherry */}
      <symbol id="spin-sym-0" viewBox="0 0 64 64">
        <path
          d="M27 40C27 25 32 15 45 9"
          stroke="#2f7d32"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M46 43C45 30 47 18 45 9"
          stroke="#2f7d32"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M45 10c6-7 15-6 18-1-5 7-14 8-18 1z" fill="#43a047" />
        <circle cx="23" cy="46" r="13" fill="url(#spin-g-cherry)" />
        <circle cx="45" cy="50" r="11.5" fill="url(#spin-g-cherry)" />
        <ellipse cx="18" cy="41" rx="4.2" ry="3" fill="#fff" opacity="0.55" />
        <ellipse cx="41" cy="45" rx="3.4" ry="2.4" fill="#fff" opacity="0.5" />
        <circle
          cx="23"
          cy="46"
          r="13"
          fill="none"
          stroke="#5e0010"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </symbol>

      {/* 1 — Lemon */}
      <symbol id="spin-sym-1" viewBox="0 0 64 64">
        <g transform="rotate(-16 32 32)">
          <path d="M3 32l8-4v8z" fill="#b98d00" />
          <path d="M61 32l-8-4v8z" fill="#b98d00" />
          <ellipse
            cx="32"
            cy="32"
            rx="24"
            ry="16.5"
            fill="url(#spin-g-lemon)"
            stroke="#8a5f00"
            strokeWidth="1.5"
          />
          <ellipse
            cx="24"
            cy="24"
            rx="8"
            ry="4"
            fill="#fff"
            opacity="0.45"
            transform="rotate(-20 24 24)"
          />
          <path
            d="M12 38c6 5 34 5 40 0"
            stroke="#a87f00"
            strokeWidth="1.4"
            fill="none"
            opacity="0.5"
          />
        </g>
      </symbol>

      {/* 2 — Orange */}
      <symbol id="spin-sym-2" viewBox="0 0 64 64">
        <path
          d="M32 14v-5"
          stroke="#6b4b23"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M33 10c6-6 15-6 19-2-5 7-14 8-19 2z" fill="#43a047" />
        <circle cx="32" cy="35" r="22" fill="url(#spin-g-orange)" />
        <ellipse
          cx="23"
          cy="26"
          rx="6.5"
          ry="4"
          fill="#fff"
          opacity="0.4"
          transform="rotate(-30 23 26)"
        />
        <circle
          cx="32"
          cy="35"
          r="22"
          fill="none"
          stroke="#8a3a00"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </symbol>

      {/* 3 — Plum */}
      <symbol id="spin-sym-3" viewBox="0 0 64 64">
        <path
          d="M32 16v-6"
          stroke="#3c4b23"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M32 11c8-4 17-2 20 3-6 5-14 4-20-3z"
          fill="#43a047"
          opacity="0.9"
        />
        <ellipse
          cx="32"
          cy="38"
          rx="21"
          ry="24"
          fill="url(#spin-g-plum)"
          stroke="#2c0044"
          strokeWidth="1.5"
        />
        <ellipse
          cx="24"
          cy="26"
          rx="6"
          ry="4"
          fill="#fff"
          opacity="0.35"
          transform="rotate(-25 24 26)"
        />
        <path
          d="M22 52c8 4 16 4 22-1"
          stroke="#e8c8ff"
          strokeWidth="1.6"
          fill="none"
          opacity="0.35"
        />
      </symbol>

      {/* 4 — Diamond */}
      <symbol id="spin-sym-4" viewBox="0 0 64 64">
        <path d="M32 5l26 20-26 34L6 25z" fill="url(#spin-g-diamond)" />
        <path d="M32 5L20 25l12 34 12-34z" fill="#fff" opacity="0.2" />
        <path d="M6 25h52" stroke="#fff" strokeWidth="1.6" opacity="0.45" />
        <path
          d="M32 5L20 25M32 5l12 20"
          stroke="#fff"
          strokeWidth="1.3"
          opacity="0.35"
          fill="none"
        />
        <path
          d="M32 5l26 20-26 34L6 25z"
          fill="none"
          stroke="#bff7ff"
          strokeWidth="1.5"
        />
        <path
          d="M22 14l3 3M25 11l1.5 1.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
      </symbol>

      {/* 5 — Bell */}
      <symbol id="spin-sym-5" viewBox="0 0 64 64">
        <circle cx="32" cy="8" r="4" fill="url(#spin-g-gold)" />
        <path
          d="M32 11c-12 0-19 9-19 21 0 10-3 14-6 18h50c-3-4-6-8-6-18 0-12-7-21-19-21z"
          fill="url(#spin-g-gold)"
          stroke="#7a5200"
          strokeWidth="1.5"
        />
        <path
          d="M24 20c-3 5-4 12-4 18"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
        <circle
          cx="32"
          cy="54"
          r="5.5"
          fill="url(#spin-g-gold-d)"
          stroke="#7a5200"
          strokeWidth="1.2"
        />
      </symbol>

      {/* 6 — BAR */}
      <symbol id="spin-sym-6" viewBox="0 0 64 64">
        <rect
          x="4"
          y="19"
          width="56"
          height="26"
          rx="5"
          fill="url(#spin-g-gold)"
          stroke="#7a5200"
          strokeWidth="2"
        />
        <rect
          x="8"
          y="22"
          width="48"
          height="7"
          rx="3"
          fill="#fff"
          opacity="0.3"
        />
        <text
          x="32"
          y="39"
          textAnchor="middle"
          fontSize="17"
          fontWeight="900"
          letterSpacing="1"
          fill="#4a3300"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          BAR
        </text>
      </symbol>

      {/* 7 — SEVEN */}
      <symbol id="spin-sym-7" viewBox="0 0 64 64">
        <rect
          x="8"
          y="5"
          width="48"
          height="54"
          rx="6"
          fill="url(#spin-g-chrome)"
          stroke="#3b4152"
          strokeWidth="1.6"
        />
        <rect
          x="11"
          y="8"
          width="42"
          height="48"
          rx="4"
          fill="#1a0d10"
          stroke="#f00001"
          strokeWidth="2.5"
        />
        <path
          d="M20 14h24v8L34 50H24l10-28H20z"
          fill="url(#spin-g-seven)"
          stroke="#ffd9de"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M22 16h18v3H22z" fill="#fff" opacity="0.35" />
      </symbol>

      {/* 8 — Horseshoe */}
      <symbol id="spin-sym-8" viewBox="0 0 64 64">
        <path
          d="M12 54c-4-8-6-16-6-23C6 18 18 8 32 8s26 10 26 23c0 7-2 15-6 23"
          fill="none"
          stroke="url(#spin-g-hoof)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M32 8c14 0 26 10 26 23 0 7-2 15-6 23"
          fill="none"
          stroke="#ffe98a"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle cx="18" cy="36" r="3.4" fill="#f00001" />
        <circle cx="32" cy="36" r="3.4" fill="#f00001" />
        <circle cx="46" cy="36" r="3.4" fill="#f00001" />
        <path
          d="M12 54h40l-6 6H18z"
          fill="url(#spin-g-hoof)"
          stroke="#7a5200"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </symbol>

      {/* 9 — Crown */}
      <symbol id="spin-sym-9" viewBox="0 0 64 64">
        <path
          d="M7 45L3 15l17 12L32 8l12 19 17-12-4 30z"
          fill="url(#spin-g-gold)"
          stroke="#7a5200"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <rect
          x="7"
          y="45"
          width="50"
          height="11"
          rx="2.5"
          fill="url(#spin-g-gold-d)"
          stroke="#7a5200"
          strokeWidth="1.8"
        />
        <circle cx="32" cy="26" r="4.2" fill="#f00001" />
        <circle cx="13" cy="33" r="3.2" fill="#00ffa3" />
        <circle cx="51" cy="33" r="3.2" fill="#9945ff" />
        <path d="M12 50h40" stroke="#fff" strokeWidth="1.6" opacity="0.3" />
      </symbol>
    </svg>
  );
}
