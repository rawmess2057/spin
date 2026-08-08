"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render/lifecycle errors so the app never degrades into a dead
 * blank page. Shows a friendly card with a reload action instead.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error in Spin app:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="max-w-md text-sm text-muted">
            An unexpected error interrupted the page. Reload to try again; if it
            keeps happening, your connection to Solana may be unstable.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[0_0_20px_rgba(0,255,163,0.45)] transition hover:brightness-110"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
