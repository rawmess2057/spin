"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ambientStart,
  ambientStop,
  isSoundMuted,
  setSoundMuted,
} from "../lib/sound/events";

// The mute flag lives in localStorage. Reading it in a useState initialiser
// would make the server and client first renders disagree, so it goes
// through an external store whose server snapshot is "not muted".
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function SoundToggle() {
  const muted = useSyncExternalStore(subscribe, isSoundMuted, () => false);

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
        setSoundMuted(next);
        if (next) {
          ambientStop();
        } else {
          ambientStart();
        }
        for (const l of listeners) l();
      }}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border-low bg-card text-sm transition hover:bg-cream"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
