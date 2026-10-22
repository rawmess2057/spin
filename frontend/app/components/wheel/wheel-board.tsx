"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application } from "pixi.js";
import { WheelStage, type WheelCallbacks } from "./wheel-stage";

export type WheelBoardHandle = {
  spinUp: (cb?: WheelCallbacks) => void;
  spinTo: (segment: number, cb: WheelCallbacks) => void;
  skip: () => void;
  reset: () => void;
};

type Props = {
  /** Segment multipliers in 0.01× for the selected risk. */
  table: readonly number[];
  turbo?: boolean;
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

/** Pixi host for the wheel — same lifecycle as the Megaways board. */
export const WheelBoard = forwardRef<WheelBoardHandle, Props>(
  function WheelBoard({ table, turbo = false }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<WheelStage | null>(null);
    const tableRef = useRef(table);
    tableRef.current = table;
    const turboRef = useRef(turbo);
    turboRef.current = turbo;

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const app = new Application();
      let destroyed = false;
      let initialized = false;
      let stage: WheelStage | null = null;

      void app
        .init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        })
        .then(() => {
          if (destroyed) return;
          initialized = true;
          host.appendChild(app.canvas);
          stage = new WheelStage(app, { fontFamily: displayFontFamily() });
          stage.setReducedMotion(prefersReducedMotion());
          stage.setTurbo(turboRef.current);
          stage.setTable(tableRef.current);
          stageRef.current = stage;
          app.renderer.on("resize", () => stage?.resize());
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
      stageRef.current?.setTable(table);
    }, [table]);

    useEffect(() => {
      stageRef.current?.setTurbo(turbo);
    }, [turbo]);

    useImperativeHandle(
      ref,
      () => ({
        spinUp: (cb) => stageRef.current?.spinUp(cb),
        spinTo: (segment, cb) => {
          void stageRef.current?.spinTo(segment, cb);
        },
        skip: () => stageRef.current?.skip(),
        reset: () => stageRef.current?.reset(),
      }),
      []
    );

    return (
      <div
        ref={hostRef}
        className="relative mx-auto aspect-square w-full touch-none select-none"
        style={{ maxHeight: "min(62vh, 36rem)" }}
      />
    );
  }
);
