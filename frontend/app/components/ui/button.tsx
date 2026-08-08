import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(0,255,163,0.45)] hover:brightness-110 hover:shadow-[0_0_30px_rgba(0,255,163,0.65)]",
  secondary:
    "bg-secondary text-secondary-foreground border border-border-low hover:bg-cream",
  outline:
    "bg-transparent border border-border-low text-foreground hover:bg-cream",
  ghost: "bg-transparent text-foreground hover:bg-cream",
  destructive:
    "bg-transparent border border-destructive/40 text-destructive hover:bg-destructive/10",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`cursor-pointer rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      />
    );
  }
);
