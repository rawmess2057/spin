"use client";

import { useMemo } from "react";

/**
 * A single CSS 3D die. While `rolling` it tumbles freely (a fast full-spin
 * CSS animation); once settled it rotates to the face matching `value`.
 *
 * The face is decorative: the authoritative result is the drawn roll
 * shown on the LED readout beside the dice.
 */

const SIZE = 72;

/** Final resting rotation so that `value` faces the viewer. */
const FACE_TRANSFORMS: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(0deg) rotateY(90deg)",
  3: "rotateX(-90deg) rotateY(0deg)",
  4: "rotateX(90deg) rotateY(0deg)",
  5: "rotateX(0deg) rotateY(-90deg)",
  6: "rotateX(0deg) rotateY(180deg)",
};

/** 3×3 pip matrix for each die face, row by row. */
const PIPS: Record<number, boolean[][]> = {
  1: [
    [false, false, false],
    [false, true, false],
    [false, false, false],
  ],
  2: [
    [true, false, false],
    [false, false, false],
    [false, false, true],
  ],
  3: [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ],
  4: [
    [true, false, true],
    [false, false, false],
    [true, false, true],
  ],
  5: [
    [true, false, true],
    [false, true, false],
    [true, false, true],
  ],
  6: [
    [true, false, true],
    [true, false, true],
    [true, false, true],
  ],
};

function Face({
  value,
  x,
  y,
  z,
}: {
  value: number;
  x: string;
  y: string;
  z: string;
}) {
  const pips = PIPS[value];
  return (
    <div
      className="absolute rounded-md border border-black/20 bg-gradient-to-br from-[#fdf8ec] via-[#f2ead6] to-[#d9ccae]"
      style={{
        width: SIZE,
        height: SIZE,
        transform: `translate3d(${x}, ${y}, ${z})`,
        boxShadow: "inset 0 2px 4px rgba(255,255,255,0.8)",
      }}
    >
      <div className="grid h-full w-full grid-cols-3 grid-rows-3 p-2.5">
        {pips.flat().map((pip, i) => (
          <span
            key={i}
            className="flex items-center justify-center"
            style={{ opacity: pip ? 1 : 0 }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#111]"
              style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export function DiceCube({
  value,
  rolling,
  delayMs = 0,
}: {
  value: number;
  rolling: boolean;
  /** Stagger between two dice so they don't move in lockstep. */
  delayMs?: number;
}) {
  const half = SIZE / 2;
  const faces = useMemo(
    () => [
      <Face key="front" value={value} x="0" y="0" z={`${half}px`} />,
      <Face
        key="back"
        value={value}
        x="0"
        y="0"
        z={`-${half}px`}
      />,
      <Face key="right" value={value} x={`${half}px`} y="0" z="0" />,
      <Face key="left" value={value} x={`-${half}px`} y="0" z="0" />,
      <Face key="top" value={value} x="0" y={`-${half}px`} z="0" />,
      <Face key="bottom" value={value} x="0" y={`${half}px`} z="0" />,
    ],
    // half is a constant derived from SIZE — stable for the component's life.
    [value, half]
  );

  return (
    <div className="[perspective:600px]">
      <div
        className="relative"
        style={{
          width: SIZE,
          height: SIZE,
          transformStyle: "preserve-3d",
          transition: rolling ? undefined : "transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)",
          transform: rolling
            ? `rotateX(1980deg) rotateY(1440deg) rotateZ(720deg)`
            : FACE_TRANSFORMS[value],
          animationDelay: `${delayMs}ms`,
          animation: rolling ? "spin-dice-tumble 1.1s linear infinite" : undefined,
        }}
      >
        {faces}
      </div>
    </div>
  );
}
