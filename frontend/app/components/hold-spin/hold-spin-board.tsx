"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application } from "pixi.js";
import {
  BOARD_H,
  BOARD_W,
  FRAME_PAD,
  HoldSpinStage,
  type StageCallbacks,
} from "./hold-spin-stage";
import type { HoldSpinOutcome } from "../../lib/solana/games/hold-spin";

export type HoldSpinBoardHandle = {
  spinUp: () => void;
  playOutcome: (outcome: HoldSpinOutcome, cb: StageCallbacks) => void;
  skip: () => void;
  reset: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function displayFontFamily(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-oswald")
    .trim();
  return v.length > 0 ? v : undefined;
}

export const HoldSpinBoard = forwardRef<
  HoldSpinBoardHandle,
  { turbo?: boolean }
>(function HoldSpinBoard({ turbo = false }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HoldSpinStage | null>(null);
  const turboRef = useRef(turbo);
  turboRef.current = turbo;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let destroyed = false;
    let initialized = false;
    let stage: HoldSpinStage | null = null;
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
        stage = new HoldSpinStage(app, { fontFamily: displayFontFamily() });
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

  useImperativeHandle(
    ref,
    () => ({
      spinUp: () => stageRef.current?.spinUp(),
      playOutcome: (o, cb) => {
        void stageRef.current?.playOutcome(o, cb);
      },
      skip: () => stageRef.current?.skip(),
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
        maxHeight: "min(60vh, 34rem)",
      }}
    />
  );
});
