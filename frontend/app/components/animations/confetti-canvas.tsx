"use client";

import { useEffect, useRef } from "react";

const CONFETTI_COLORS = ["#00ffa3", "#9945ff", "#ffd700", "#ff6b35", "#ffffff"];
const COIN_COLORS = ["#ffd700", "#ffc057", "#ffe98a", "#f5cf1b"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  bounces: number;
};

/**
 * GPU-light Canvas2D celebration. `confetti` bursts once from the top and
 * fades; `coins` rains continuously from the top with floor bounces and a
 * metallic rim so the discs read as casino coins piling up. Runs for
 * `durationMs` then stops. Skips entirely under reduced-motion.
 */
export function ConfettiCanvas({
  durationMs = 2200,
  mode = "confetti",
  spawnEveryMs = 0,
}: {
  durationMs?: number;
  /** "confetti" bursts once; "coins" keeps raining for the duration. */
  mode?: "confetti" | "coins";
  /** Coin rain: milliseconds between single-coin spawns (0 = no rain). */
  spawnEveryMs?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const coins = mode === "coins";
    const colors = coins ? COIN_COLORS : CONFETTI_COLORS;
    const particles: Particle[] = [];
    const spawn = (burst: boolean) => {
      const count = coins ? (burst ? 40 : 1) : 140;
      for (let i = 0; i < count; i++) {
        const spawnTop = coins || burst;
        particles.push({
          x: spawnTop
            ? Math.random() * canvas.width
            : canvas.width / 2 + (Math.random() - 0.5) * 200,
          y: spawnTop
            ? -10 - Math.random() * 20
            : canvas.height * 0.35 + (Math.random() - 0.5) * 60,
          vx: coins ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 9,
          vy: coins ? Math.random() * 2 + 1 : -Math.random() * 9 - 3,
          size: coins ? Math.random() * 5 + 5 : Math.random() * 6 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.3,
          bounces: 0,
        });
      }
    };

    let raf = 0;
    const start = performance.now();
    const gravity = coins ? 0.55 : 0.22;
    let lastSpawn = 0;

    spawn(true);

    const frame = (t: number) => {
      const elapsed = t - start;
      if (coins && spawnEveryMs > 0 && elapsed - lastSpawn >= spawnEveryMs) {
        lastSpawn = elapsed;
        spawn(false);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fade = Math.max(0, 1 - elapsed / durationMs);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        if (coins && p.y > canvas.height - p.size) {
          p.y = canvas.height - p.size;
          p.vy = -p.vy * 0.5;
          p.bounces += 1;
          if (p.bounces >= 2) p.vy = 0; // settle on the floor
        }
        if (elapsed > durationMs && p.vy === 0) {
          // Faded out and done moving — drop it so the loop can end.
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, fade);
        if (coins) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#b8860b";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 4, 0, Math.PI * 2);
          ctx.fillStyle = "#fff3b0";
          ctx.globalAlpha = Math.max(0, fade * 0.5);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }
      // Confetti stops at the duration; the coin rain keeps drawing until
      // the settled coins have drained out of the array.
      if (elapsed < durationMs || (coins && particles.length > 0)) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [durationMs, mode, spawnEveryMs]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
