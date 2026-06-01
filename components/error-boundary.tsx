"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Top-level React error boundary so a render error in one widget (e.g. a chart
 * with bad data) doesn't blank the whole app. Shows a recoverable fallback.
 */
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unexpected error"
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-3xl">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Something went wrong</h2>
        <p className="text-sm text-zinc-500 break-words">{this.state.message}</p>
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-neon px-4 py-2 text-sm font-bold text-black transition hover:bg-neon/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
