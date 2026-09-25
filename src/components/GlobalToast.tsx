"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info" | "warning";
  duration: number;
};

type ConfirmDialogue = {
  id: string;
  title: string;
  description?: string;
  confirmText: string;
  cancelText: string;
  variant: "danger" | "info";
  resolve: (value: boolean) => void;
};

const baseToastClasses = {
  success: "border-emerald-500/30 bg-emerald-50 text-emerald-900",
  error: "border-rose-500/35 bg-rose-50 text-rose-900",
  info: "border-sky-500/30 bg-sky-50 text-sky-900",
  warning: "border-amber-500/35 bg-amber-50 text-amber-900",
};

export default function GlobalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogue | null>(null);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      if (!detail) return;
      setToasts((current) => [...current, detail]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== detail.id));
      }, detail.duration ?? 3200);
    };

    const handleConfirm = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmDialogue & { resolve?: (value: boolean) => void }>).detail;
      if (!detail) return;
      setConfirmDialog({
        id: detail.id ?? `${Date.now()}-confirm`,
        title: detail.title,
        description: detail.description,
        confirmText: detail.confirmText,
        cancelText: detail.cancelText,
        variant: detail.variant ?? "info",
        resolve: detail.resolve ?? (() => undefined),
      });
    };

    window.addEventListener("audvertax:show-toast", handleToast);
    window.addEventListener("audvertax:confirm-toast", handleConfirm);

    return () => {
      window.removeEventListener("audvertax:show-toast", handleToast);
      window.removeEventListener("audvertax:confirm-toast", handleConfirm);
    };
  }, []);

  const confirmButtonClass = useMemo(
    () =>
      confirmDialog?.variant === "danger"
        ? "bg-rose-500 hover:bg-rose-400 text-white"
        : "bg-fm-lime hover:bg-lime-400 text-fm-graphite-deep",
    [confirmDialog?.variant],
  );

  return (
    <>
      {confirmDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--fm-graphite-deep)] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">{confirmDialog.title}</p>
                {confirmDialog.description && (
                  <p className="mt-2 text-sm leading-6 text-[var(--fm-text-secondary)]">{confirmDialog.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.resolve(false);
                  setConfirmDialog(null);
                }}
                className="rounded-full p-1.5 text-[var(--fm-text-secondary)] transition hover:bg-white/5 hover:text-white"
                aria-label="Close confirmation"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  confirmDialog.resolve(false);
                  setConfirmDialog(null);
                }}
                className="rounded-xl border border-[var(--fm-border)] bg-[var(--fm-surface)] px-3 py-2 text-sm font-medium text-[var(--fm-text-primary)] transition hover:border-[var(--fm-border-strong)]"
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.resolve(true);
                  setConfirmDialog(null);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${confirmButtonClass}`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-[110] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const Icon =
            toast.variant === "success"
              ? CheckCircle2
              : toast.variant === "error"
                ? TriangleAlert
                : toast.variant === "warning"
                  ? TriangleAlert
                  : Info;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border p-3 shadow-[0_18px_35px_rgba(15,23,42,0.28)] backdrop-blur-md ${baseToastClasses[toast.variant ?? "info"]}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-black/10 p-1.5">
                  <Icon size={15} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description && <p className="mt-1 text-xs opacity-90">{toast.description}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
