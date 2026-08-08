import { type HTMLAttributes } from "react";

type Tone = "primary" | "gold" | "orange" | "accent" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary border-primary/30",
  gold: "bg-gold/15 text-gold border-gold/30",
  orange: "bg-orange/15 text-orange border-orange/30",
  accent: "bg-accent/15 text-accent border-accent/30",
  muted: "bg-cream text-muted border-border-low",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: Tone };

export function Badge({
  tone = "muted",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
