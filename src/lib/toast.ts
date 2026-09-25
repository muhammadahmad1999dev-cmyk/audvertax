export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ConfirmToastOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "info";
};

const TOAST_EVENT = "audvertax:show-toast";
const CONFIRM_EVENT = "audvertax:confirm-toast";

function emit<T>(eventName: string, detail: T) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function showToast(options: ToastOptions) {
  emit(TOAST_EVENT, {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    ...options,
    duration: options.duration ?? 3200,
  });
}

export function confirmToast(options: ConfirmToastOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    emit(CONFIRM_EVENT, {
      ...options,
      confirmText: options.confirmText ?? "Confirm",
      cancelText: options.cancelText ?? "Cancel",
      resolve,
    });
  });
}
