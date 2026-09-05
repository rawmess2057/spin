"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
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
} from "./peg-layout";
import { BallManager } from "./ball-manager";
import { compactMultiplier, plinkoPalette } from "./bins";
import {
  type PlinkoConfig,
  type PlinkoOutcome,
  plinkoMultiplierBp,
} from "../../lib/solana/games/plinko";

export type PlinkoBoardHandle = {
  dropBall: (outcome: PlinkoOutcome) => void;
  bounceBucket: (bucketIndex: number) => void;
  clearBalls: () => void;
};

type Props = {
  config: PlinkoConfig;
};

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

    // Rebuild the peg grid + buckets whenever the row count changes.
    useEffect(() => {
      if (appRef.current) {
        rebuildBoard(appRef.current);
      }
    }, [config.rows]);

    function rebuildBoard(app: Application) {
      const rows = configRef.current.rows;
      const pegs = generatePegs(rows);

      const last = app.stage.removeChildren();
      for (const c of last) c.destroy();

      const board = new Container();
      // Fill the host on both axes (no lower cap of 1) so the board scales up
      // to use the available width — the main driver of the "wide" layout.
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

      // Pegs.
      const pegLayer = new Container();
      for (const peg of pegs) {
        const g = new Graphics();
        g.circle(peg.x, TOP_PAD + peg.y, PEG_RADIUS).fill({ color: 0xffc057 });
        pegLayer.addChild(g);
      }
      board.addChild(pegLayer);

      // Buckets at the collector row bottom.
      const bucketLayer = new Container();
      const bucketSprites: Graphics[] = [];
      const bandTop = TOP_PAD + rows * PEG_SPACING_Y + PEG_SPACING_Y * 0.4;
      const bandHeight = PEG_SPACING_Y * 0.6;
      const palette = plinkoPalette(rows);
      for (let b = 0; b <= rows; b++) {
        const centerX = bucketX(rows, b);
        const centerY = bandTop + bandHeight / 2;

        // 3D chip: a darker shadow band slightly lower than the bucket face,
        // giving depth under the colored chip.
        const shadow = new Graphics();
        shadow.rect(
          -PEG_SPACING_X * 0.55,
          -bandHeight * 0.42,
          PEG_SPACING_X * 1.1,
          bandHeight * 0.95
        );
        shadow.fill({ color: palette.shadow[b], alpha: 0.55 });
        shadow.x = centerX;
        shadow.y = centerY;
        bucketLayer.addChild(shadow);

        // Bucket face, pivoted on its center so bounceBucket can scale from
        // the middle of the chip.
        const g = new Graphics();
        g.rect(-PEG_SPACING_X / 2, -bandHeight / 2, PEG_SPACING_X, bandHeight);
        g.fill({ color: palette.background[b], alpha: 1 });
        g.pivot.set(0, 0);
        g.position.set(centerX, centerY);
        bucketLayer.addChild(g);
        bucketSprites.push(g);
      }
      board.addChild(bucketLayer);

      // Multiplier labels.
      const labelLayer = new Container();
      for (let b = 0; b <= rows; b++) {
        const mult = plinkoMultiplierBp(rows, configRef.current.risk, b);
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
        label.position.set(bucketX(rows, b), bandTop + bandHeight / 2);
        labelLayer.addChild(label);
      }
      board.addChild(labelLayer);

      // Ball layers on top.
      const ballLayer = new Container();
      board.addChild(ballLayer);
      const mgr = new BallManager(ballLayer);
      ballManagerRef.current = mgr;

      // Highlight a peg when a ball hits it.
      mgr.setCallbacks({
        onPegHit: (kf) => {
          const hit = pegLayer.children.find(
            (c) => Math.abs(c.x - kf.x) < 0.1 && Math.abs(c.y - kf.y) < 0.1
          );
          if (hit) {
            const g = hit as Graphics;
            g.tint = 0xffd84a;
            setTimeout(() => {
              g.tint = 0xffffff;
            }, 90);
          }
        },
      });
      bounceBucketRef.current = (bucketIndex) => {
        const sprite = bucketSprites[bucketIndex];
        if (!sprite) return;
        // Springy squish from the chip's center: squash down then pop back.
        const start = performance.now();
        const DURATION = 320;
        sprite.scale.set(1, 1);
        const step = () => {
          const t = Math.min(1, (performance.now() - start) / DURATION);
          const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const sx = 1 - Math.sin(k * Math.PI) * 0.18;
          const sy = 1 + Math.sin(k * Math.PI) * 0.22;
          sprite.scale.set(sx, sy);
          if (t < 1) requestAnimationFrame(step);
          else sprite.scale.set(1, 1);
        };
        requestAnimationFrame(step);
      };
    }

    useImperativeHandle(
      ref,
      () => ({
        dropBall(outcome: PlinkoOutcome) {
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
          // Final drop into the winning bucket (inside the bucket band).
          kf.push({
            x: bucketX(rows, outcome.bucket),
            y: TOP_PAD + rows * PEG_SPACING_Y + PEG_SPACING_Y * 0.75,
          });

          ballManagerRef.current?.drop(kf, () => {
            bounceBucketRef.current(outcome.bucket);
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
        className="relative w-full overflow-hidden lg:min-w-0 lg:flex-1"
        style={{
          aspectRatio: `${boardWidth(rows)} / ${boardHeight(rows)}`,
          minHeight: 280,
          maxHeight: "min(78vh, 42rem)",
        }}
      />
    );
  }
);
