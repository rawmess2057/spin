"use client";

import { useState } from "react";
import { isSoundMuted, setSoundMuted } from "../lib/sound/events";

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
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border-low bg-card text-sm transition hover:bg-cream"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
