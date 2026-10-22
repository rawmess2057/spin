"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application } from "pixi.js";
import { MegawaysStage, type StageCallbacks } from "./megaways-stage";
import { BOARD_H, BOARD_W, FRAME_PAD } from "./board-layout";
import type { MegawaysOutcome } from "../../lib/solana/games/megaways";

export type MegawaysBoardHandle = {
  spinUp: () => void;
  playOutcome: (outcome: MegawaysOutcome, cb: StageCallbacks) => void;
  skip: () => void;
  setTurbo: (on: boolean) => void;
  reset: () => void;
};

type Props = {
  turbo?: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reads the display font family Next injected, so Pixi text matches the UI. */
function displayFontFamily(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-oswald")
    .trim();
  return v.length > 0 ? v : undefined;
}

/**
 * PixiJS canvas host for the Megaways reels. Creates the renderer once,
 * survives React strict-mode's mount/unmount/mount, and exposes an imperative
 * handle the page drives — the same pattern as the Plinko board.
 */
export const MegawaysBoard = forwardRef<MegawaysBoardHandle, Props>(
  function MegawaysBoard({ turbo = false }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<MegawaysStage | null>(null);
    const turboRef = useRef(turbo);
    turboRef.current = turbo;

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const app = new Application();
      let destroyed = false;
      let initialized = false;
      let stage: MegawaysStage | null = null;

      void app
        .init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        })
        .then(async () => {
          if (destroyed) return;
          initialized = true;
          host.appendChild(app.canvas);
          stage = new MegawaysStage(app, { fontFamily: displayFontFamily() });
          stage.setReducedMotion(prefersReducedMotion());
          stage.setTurbo(turboRef.current);
          stageRef.current = stage;
          app.renderer.on("resize", () => stage?.resize());
          await stage.init();
          if (destroyed) return;
          stage.resize();
        });

      return () => {
        destroyed = true;
        stageRef.current = null;
        stage?.destroy();
        if (initialized) app.destroy(true);
      };
    }, []);

    useEffect(() => {
      stageRef.current?.setTurbo(turbo);
    }, [turbo]);

    useEffect(() => {
      if (typeof window === "undefined" || !window.matchMedia) return;
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = () => stageRef.current?.setReducedMotion(mq.matches);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        spinUp: () => stageRef.current?.spinUp(),
        playOutcome: (outcome, cb) => {
          void stageRef.current?.playOutcome(outcome, cb);
        },
        skip: () => stageRef.current?.skip(),
        setTurbo: (on) => stageRef.current?.setTurbo(on),
        reset: () => stageRef.current?.reset(),
      }),
      []
    );

    return (
      <div
        ref={hostRef}
        className="relative mx-auto w-full touch-none select-none"
        style={{
          aspectRatio: `${BOARD_W + FRAME_PAD * 2} / ${BOARD_H + FRAME_PAD * 2}`,
          maxHeight: "min(72vh, 46rem)",
        }}
      />
    );
  }
);
