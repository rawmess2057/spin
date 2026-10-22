"use client";

import { useSyncExternalStore } from "react";
import { isHapticEnabled, setHapticEnabled, haptic } from "../lib/sound/events";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function HapticsToggle({ compact = false }: { compact?: boolean }) {
  // External store so the server render (haptics off) and the hydrated
  // client agree; see SoundToggle.
  const enabled = useSyncExternalStore(subscribe, isHapticEnabled, () => false);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !enabled;
        setHapticEnabled(next);
        if (next) haptic("light");
        for (const l of listeners) l();
      }}
      title={enabled ? "Disable haptic feedback" : "Enable haptic feedback"}
      aria-label={
        enabled ? "Disable haptic feedback" : "Enable haptic feedback"
      }
      aria-pressed={enabled}
      className={`inline-flex cursor-pointer items-center justify-center rounded-full border text-sm transition ${
        compact ? "size-9" : "size-9"
      } ${
        enabled
          ? "border-gold/60 bg-gold/15 text-gold shadow-[0_0_10px_rgba(255,192,87,0.4)]"
          : "border-border-low bg-card text-foreground hover:bg-cream"
      }`}
    >
      {enabled ? "🏃" : "💤"}
    </button>
  );
}
