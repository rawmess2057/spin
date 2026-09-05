"use client";

import { useEffect, useState } from "react";
import {
  ambientStart,
  ambientStop,
  isSoundMuted,
  setSoundMuted,
} from "../lib/sound/events";

export function SoundToggle() {
  const [muted, setMuted] = useState(isSoundMuted());

  // Kick off the casino-floor ambience while the toggle is on screen. The
  // AudioContext stays suspended until the first user gesture, so the bed
  // becomes audible exactly when the player interacts.
  useEffect(() => {
    if (!isSoundMuted()) ambientStart();
    return () => ambientStop();
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setSoundMuted(next);
        if (next) {
          ambientStop();
        } else {
          ambientStart();
        }
      }}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border-low bg-card text-sm transition hover:bg-cream"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
