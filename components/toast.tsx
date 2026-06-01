"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Minimal toast system — no external dependency. Provides a `useToast()` hook
 * with `toast.success / error / info / loading` and an updatable handle so a
 * long-running action (encrypt → broadcast) can mutate one toast in place.
 */

type ToastKind = "success" | "error" | "info" | "loading";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (kind: ToastKind, message: string, ttlMs?: number) => number;
  update: (id: number, kind: ToastKind, message: string, ttlMs?: number) => void;
  dismiss: (id: number) => void;
  success: (m: string, ttlMs?: number) => number;
  error: (m: string, ttlMs?: number) => number;
  info: (m: string, ttlMs?: number) => number;
  loading: (m: string) => number;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useMemo(() => new Map<number, ReturnType<typeof setTimeout>>(), []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const tm = timers.get(id);
      if (tm) {
        clearTimeout(tm);
        timers.delete(id);
      }
    },
    [timers]
  );

  const arm = useCallback(
    (id: number, ttlMs?: number) => {
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      if (ttlMs && ttlMs > 0) {
        timers.set(
          id,
          setTimeout(() => dismiss(id), ttlMs)
        );
      }
    },
    [dismiss, timers]
  );

  const show = useCallback(
    (kind: ToastKind, message: string, ttlMs = kind === "error" ? 8000 : 4000) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (kind !== "loading") arm(id, ttlMs);
      return id;
    },
    [arm]
  );

  const update = useCallback(
    (id: number, kind: ToastKind, message: string, ttlMs = kind === "error" ? 8000 : 4000) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, kind, message } : t)));
      if (kind !== "loading") arm(id, ttlMs);
    },
    [arm]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      update,
      dismiss,
      success: (m, ttl) => show("success", m, ttl),
      error: (m, ttl) => show("error", m, ttl),
      info: (m, ttl) => show("info", m, ttl),
      loading: (m) => show("loading", m)
    }),
    [show, update, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles: Record<ToastKind, string> = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    info: "border-white/10 bg-white/5 text-zinc-200",
    loading: "border-electric/30 bg-electric/10 text-electric"
  };
  const icon: Record<ToastKind, string> = {
    success: "✅",
    error: "⚠️",
    info: "ℹ️",
    loading: "⏳"
  };
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md ${styles[toast.kind]}`}
    >
      <span className={toast.kind === "loading" ? "animate-pulse" : ""}>{icon[toast.kind]}</span>
      <p className="flex-1 break-words">{toast.message}</p>
      <button onClick={onClose} className="text-zinc-400 transition hover:text-white">
        ✕
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op so components don't crash if used outside the provider.
    const noop = () => 0;
    return {
      show: noop,
      update: () => {},
      dismiss: () => {},
      success: noop,
      error: noop,
      info: noop,
      loading: noop
    };
  }
  return ctx;
}
