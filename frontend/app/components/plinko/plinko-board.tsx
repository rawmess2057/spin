"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { tone } from "../../lib/sound/synth";
import {
  generatePegs,
  pegPosition,
  BALL_RADIUS,
  PEG_RADIUS,
  PEG_SPACING_X,
  PEG_SPACING_Y,
  TOP_PAD,
  boardHeight,
  boardWidth,
  bucketX,
  collectorTop,
  BUCKET_HEIGHT,
} from "./peg-layout";
import { BallManager } from "./ball-manager";
import { compactMultiplier, plinkoPalette } from "./bins";
import {
  type PlinkoConfig,
  type PlinkoOutcome,
  plinkoMultiplierBp,
} from "../../lib/solana/games/plinko";

export type PlinkoBoardHandle = {
  dropBall: (
    outcome: PlinkoOutcome,
    onLanded?: (o: PlinkoOutcome) => void
  ) => void;
  bounceBucket: (bucketIndex: number) => void;
  clearBalls: () => void;
};

type Props = {
  config: PlinkoConfig;
};

/** Parses "rgb(r, g, b)" strings used by the palette module. */
function parseRgb(s: string): [number, number, number] {
  const m = s.match(/\d+/g);
  if (!m) return [255, 255, 255];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function toColorInt([r, g, b]: [number, number, number]): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Linear interpolation between two rgb tuples → 0xRRGGBB. */
function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): number {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return toColorInt([r, g, bl]);
}

/** PixiJS canvas board for Plinko. Pure visual layer — no game logic. */
export const PlinkoBoard = forwardRef<PlinkoBoardHandle, Props>(
  function PlinkoBoard({ config }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const ballManagerRef = useRef<BallManager | null>(null);
    const configRef = useRef(config);
    configRef.current = config;
    const bounceBucketRef = useRef<(i: number) => void>(() => {});

    // Establish the renderer once.
    useEffect(() => {
      if (!hostRef.current) return;
      const app = new Application();
      let destroyed = false;
      let initialized = false;

      void app
        .init({
          resizeTo: hostRef.current,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        })
        .then(() => {
          if (destroyed) {
            return;
          }
          initialized = true;
          appRef.current = app;
          hostRef.current?.appendChild(app.canvas);
          rebuildBoard(app);
        });

      return () => {
        destroyed = true;
        appRef.current = null;
        if (initialized) {
          app.destroy(true);
        }
      };
    }, []);

    // Rebuild the peg grid + buckets whenever rows or risk changes (risk
    // decides the multiplier labels under the buckets).
    useEffect(() => {
      if (appRef.current) {
        rebuildBoard(appRef.current);
      }
    }, [config.rows, config.risk]);

    function rebuildBoard(app: Application) {
      const rows = configRef.current.rows;
      const risk = configRef.current.risk;
      const pegs = generatePegs(rows);

      const last = app.stage.removeChildren();
      for (const c of last) c.destroy();

      const board = new Container();
      // Fill the host on both axes so the board scales up to use the available
      // width — the main driver of the "wide" layout.
      const fitScale = Math.min(
        (app.screen.width - 32) / (boardWidth(rows) + 32),
        (app.screen.height - 24) / (boardHeight(rows) + 24)
      );
      board.scale.set(fitScale);
      board.position.set(
        app.screen.width / 2,
        app.screen.height / 2 - (boardHeight(rows) / 2) * fitScale
      );
      app.stage.addChild(board);

      const palette = plinkoPalette(rows);
      const baseRgb = palette.background.map(parseRgb);
      const shadowRgb = palette.shadow.map(parseRgb);

      // --- Pegs: one glossy sphere per peg -------------------------------
      const pegLayer = new Container();
      const pegSprites: Graphics[] = [];
      for (const peg of pegs) {
        const g = new Graphics();
        // Under-shadow (offset down-right) for a little depth.
        g.circle(1.4, 1.8, PEG_RADIUS).fill({ color: 0x000000, alpha: 0.22 });
        // Body.
        g.circle(0, 0, PEG_RADIUS).fill({ color: 0xffc057 });
        // Volume: darker lower-right inside the body, warm gloss top-left.
        g.circle(1.6, 1.7, PEG_RADIUS * 0.55).fill({
          color: 0xc9861f,
          alpha: 0.9,
        });
        g.circle(-1.5, -1.6, PEG_RADIUS * 0.62).fill({
          color: 0xffe3a1,
          alpha: 0.85,
        });
        g.circle(-2, -2.1, PEG_RADIUS * 0.3).fill({
          color: 0xffffff,
          alpha: 0.95,
        });
        g.position.set(peg.x, TOP_PAD + peg.y);
        pegLayer.addChild(g);
        pegSprites.push(g);
      }
      board.addChild(pegLayer);

      // --- Bucket band: glowing gradient columns -------------------------
      const chipW = PEG_SPACING_X - 3;
      const chipH = BUCKET_HEIGHT;
      const trayTop = collectorTop(rows);
      const trayMid = trayTop + chipH / 2;
      const bucketLayer = new Container();
      const bucketSprites: Graphics[] = [];

      for (let b = 0; b <= rows; b++) {
        const centerX = bucketX(rows, b);
        const g = new Graphics();
        const x0 = centerX - chipW / 2;
        const y0 = trayTop;
        const bg = baseRgb[b];
        const sh = shadowRgb[b];

        // Soft neon halo behind the chip (two expanding rects, no blur).
        g.rect(x0 - 3, y0 - 3, chipW + 6, chipH + 6).fill({
          color: toColorInt(sh),
          alpha: 0.16,
        });
        g.rect(x0 - 1.5, y0 - 1.5, chipW + 3, chipH + 3).fill({
          color: toColorInt(sh),
          alpha: 0.22,
        });

        // Vertical gradient: light top → base → shadow base.
        const bands = 5;
        for (let i = 0; i < bands; i++) {
          const t0 = i / bands;
          const t1 = (i + 1) / bands;
          const bandY = y0 + chipH * t0;
          const color =
            i === 0
              ? mixRgb(bg, [255, 255, 255], 0.3)
              : i === bands - 1
                ? mixRgb(bg, sh, 0.85)
                : mixRgb(bg, sh, ((i - 1) / (bands - 2)) * 0.75);
          g.rect(x0, bandY, chipW, Math.ceil(chipH * (t1 - t0)) + 0.5).fill({
            color,
          });
        }
        // Top highlight edge + dark bottom inner shade for the 3D chip feel.
        g.rect(x0, y0, chipW, 1.4).fill({
          color: mixRgb(bg, [255, 255, 255], 0.62),
        });
        g.rect(x0, y0 + chipH - 1.6, chipW, 1.6).fill({
          color: mixRgb(sh, [5, 5, 5], 0.35),
        });

        bucketLayer.addChild(g);
        bucketSprites.push(g);
      }
      board.addChild(bucketLayer);

      // Multiplier labels sit under the bucket band.
      const labelLayer = new Container();
      for (let b = 0; b <= rows; b++) {
        const mult = plinkoMultiplierBp(rows, risk, b);
        const label = new Text({
          text: compactMultiplier(mult),
          style: {
            fontFamily: "Roboto Mono, monospace",
            fontSize: Math.max(9, 13 - rows / 8),
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5);
        label.position.set(bucketX(rows, b), trayMid + chipH / 2 + 5.5);
        labelLayer.addChild(label);
      }
      board.addChild(labelLayer);

      // Landing effects (bucket flash + ring) sit above the chips but below
      // the balls, so the celebrating bucket never hides the resting ball.
      const fxLayer = new Container();
      board.addChild(fxLayer);

      // Ball layer (balls travel above the buckets).
      const ballLayer = new Container();
      board.addChild(ballLayer);
      const mgr = new BallManager(ballLayer);
      ballManagerRef.current = mgr;

      // Highlight + pulse a peg when a ball hits it, with a pachinko tick.
      mgr.setCallbacks({
        onPegHit: (kf) => {
          // The contact keyframe sits just off the peg centre; find the peg
          // it belongs to by row, then the nearest column.
          const row = Math.min(
            rows,
            Math.max(0, Math.round((kf.y - TOP_PAD) / PEG_SPACING_Y))
          );
          let best: Graphics | null = null;
          let bestDx = Infinity;
          const rowStart = (row * (row + 1)) / 2;
          for (let col = 0; col <= row; col++) {
            const px = pegs[rowStart + col].x;
            const dx = Math.abs(px - kf.x);
            if (dx < bestDx) {
              bestDx = dx;
              best = pegSprites[rowStart + col] ?? null;
            }
          }
          if (!best) return;
          const progress = Math.min(1, kf.y / boardHeight(rows));
          tone(900 + progress * 1900, 0.022, 0.001, 0.06, 0, "square");
          best.scale.set(1.25, 1.25);
          best.tint = 0xfff0c9;
          setTimeout(() => {
            if (best.destroyed) return;
            best.tint = 0xffffff;
            best.scale.set(1, 1);
          }, 120);
        },
      });

      bounceBucketRef.current = (bucketIndex) => {
        const sprite = bucketSprites[bucketIndex];
        const cx = bucketX(rows, bucketIndex);
        const cy = trayMid;
        const now = performance.now();

        // Springy squish from the chip's center: squash down then pop back.
        if (sprite) {
          const DURATION = 320;
          sprite.scale.set(1, 1);
          const squish = () => {
            const t = Math.min(1, (performance.now() - now) / DURATION);
            const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const sx = 1 - Math.sin(k * Math.PI) * 0.16;
            const sy = 1 + Math.sin(k * Math.PI) * 0.2;
            sprite.scale.set(sx, sy);
            if (t < 1) requestAnimationFrame(squish);
            else sprite.scale.set(1, 1);
          };
          requestAnimationFrame(squish);
        }

        // White flash over the landing chip.
        const flash = new Graphics();
        flash.rect(cx - chipW / 2, cy - chipH / 2, chipW, chipH);
        flash.fill({ color: 0xffffff, alpha: 0.85 });
        fxLayer.addChild(flash);
        const fadeFlash = () => {
          const t = Math.min(1, (performance.now() - now) / 240);
          flash.alpha = 0.85 * (1 - t);
          if (t < 1) requestAnimationFrame(fadeFlash);
          else flash.destroy();
        };
        requestAnimationFrame(fadeFlash);

        // Expanding ring radiating from the landing spot.
        const ring = new Graphics();
        ring.circle(cx, cy, 7);
        ring.stroke({
          width: 3,
          color: 0xffffff,
          alpha: 0.85,
        });
        ring.alpha = 0.9;
        fxLayer.addChild(ring);
        const ringAnim = () => {
          const t = Math.min(1, (performance.now() - now) / 460);
          ring.scale.set(1 + t * 4.2);
          ring.alpha = 0.9 * (1 - t);
          if (t < 1) requestAnimationFrame(ringAnim);
          else ring.destroy();
        };
        requestAnimationFrame(ringAnim);
      };
    }

    useImperativeHandle(
      ref,
      () => ({
        dropBall(
          outcome: PlinkoOutcome,
          onLanded?: (o: PlinkoOutcome) => void
        ) {
          const rows = configRef.current.rows;
          // Build the ball trajectory using actual per-row peg coordinates.
          // Start at the top center (in the TOP_PAD zone), then arc through
          // each peg the ball touches, finally landing in the winning bucket.
          const kf: { x: number; y: number }[] = [];
          kf.push({ x: 0, y: 0 });
          let rights = 0;
          const path = outcome.path;
          for (let i = 0; i < path.length; i++) {
            if (path[i] === "R") rights++;
            const peg = pegPosition(rows, i, rights);
            const clearance = BALL_RADIUS + PEG_RADIUS;
            const contactX =
              path[i] === "R"
                ? peg.x - clearance * 0.7
                : peg.x + clearance * 0.7;
            kf.push({
              x: contactX,
              y: TOP_PAD + peg.y - clearance * 0.7,
            });
          }
          // Final drop into the winning bucket: seat the ball inside the
          // chip, its base just above the chip's bottom edge.
          const restY =
            collectorTop(rows) + BUCKET_HEIGHT - (BALL_RADIUS + 2.5);
          kf.push({
            x: bucketX(rows, outcome.bucket),
            y: restY,
          });

          ballManagerRef.current?.drop(kf, () => {
            bounceBucketRef.current(outcome.bucket);
            onLanded?.(outcome);
          });
        },
        bounceBucket(bucketIndex) {
          bounceBucketRef.current(bucketIndex);
        },
        clearBalls() {
          ballManagerRef.current?.clear();
        },
      }),
      []
    );

    const rows = configRef.current.rows;

    return (
      <div
        ref={hostRef}
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${boardWidth(rows)} / ${boardHeight(rows)}`,
          minHeight: 300,
          maxHeight: "min(74vh, 44rem)",
        }}
      />
    );
  }
);
