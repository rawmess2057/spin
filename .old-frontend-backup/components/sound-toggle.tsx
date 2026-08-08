"use client";

import { useState } from "react";
import { isSoundMuted, setSoundMuted } from "../lib/spin/sound";

export function SoundToggle() {
  const [muted, setMuted] = useState(isSoundMuted());

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setSoundMuted(next);
      }}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className="cursor-pointer rounded-lg border border-border-low px-2.5 py-1.5 text-sm leading-none transition hover:bg-cream"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
