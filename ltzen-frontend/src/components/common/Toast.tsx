"use client";

/**
 * Lightweight toast system (uiux §8.1 — no external dependency, keeps the bundle lean).
 *
 * Provides transaction-lifecycle toasts (pending / success / error) with an optional explorer
 * link, plus a live count of in-flight transactions the header can surface ("顶栏显示进行中 tx
 * 数"). A "pending" toast can be upgraded in place to success/error via its id, so a single
 * approve→deposit flow reads as one evolving notification rather than a stack.
 *
 * State lives in a React context (client-only). Auto-dismiss for terminal toasts; pending toasts
 * persist until resolved.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "pending" | "success" | "error" | "neutral" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional explorer link (uiux §8.1: always show tx hash + explorer link). */
  explorerUrl?: string;
  explorerLabel?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  /** Number of currently-pending toasts (for the header in-flight badge). */
  pendingCount: number;
  /** Create or replace a toast. Returns its id (auto-generated when omitted). */
  push: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Partial<Record<ToastTone, number>> = {
  success: 6_000,
  neutral: 4_000,
  info: 5_000,
  error: 9_000,
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id"> & { id?: string }) => {
      const id = toast.id ?? `toast-${++seq}`;
      setToasts((prev) => {
        const next: Toast = { ...toast, id };
        const existing = prev.findIndex((t) => t.id === id);
        if (existing >= 0) {
          const copy = prev.slice();
          copy[existing] = next;
          return copy;
        }
        return [...prev, next];
      });

      // Reset any prior auto-dismiss, then (re)schedule for terminal tones.
      const prevTimer = timers.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timers.current.delete(id);

      const ttl = AUTO_DISMISS_MS[toast.tone];
      if (ttl) {
        const timer = setTimeout(() => dismiss(id), ttl);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      pendingCount: toasts.filter((t) => t.tone === "pending").length,
      push,
      dismiss,
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const TONE_STYLE: Record<ToastTone, string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  error: "border-red-400/30 bg-red-400/10 text-red-100",
  neutral: "border-white/15 bg-white/[0.04] text-zinc-200",
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/30 backdrop-blur-xl ${TONE_STYLE[t.tone]}`}
          role={t.tone === "error" ? "alert" : "status"}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {t.tone === "pending" && (
                <span
                  className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
              )}
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-current/60 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          {t.explorerUrl && (
            <a
              href={t.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {t.explorerLabel ?? "View on Explorer"} ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
