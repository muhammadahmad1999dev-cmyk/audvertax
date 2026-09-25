"use client";

import { useEffect, useState } from "react";

const API_LOADING_EVENT = "audvertax-api-loading";

type ApiLoadingEventDetail = {
  count: number;
};

type WindowWithApiLoader = Window & {
  __audvertaxApiLoadingCount?: number;
};

export default function GlobalApiLoader() {
  const [loadingCount, setLoadingCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    return (window as WindowWithApiLoader).__audvertaxApiLoadingCount ?? 0;
  });

  useEffect(() => {
    const handleLoading = (event: Event) => {
      const detail = (event as CustomEvent<ApiLoadingEventDetail>).detail;
      setLoadingCount(typeof detail?.count === "number" ? detail.count : 0);
    };

    window.addEventListener(API_LOADING_EVENT, handleLoading);
    setLoadingCount((window as WindowWithApiLoader).__audvertaxApiLoadingCount ?? 0);
    return () => window.removeEventListener(API_LOADING_EVENT, handleLoading);
  }, []);

  if (loadingCount <= 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(6,11,10,0.66)] backdrop-blur-[1px]"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-4 rounded-full border border-white/10 bg-white/5 px-7 py-5 shadow-[0_18px_80px_rgba(0,0,0,0.35)]">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/20 border-t-[var(--fm-lime)]" />
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--fm-lime-bright)]">
            Loading
          </p>
          <p className="mt-1 text-sm text-white/80">Processing your request…</p>
        </div>
      </div>
    </div>
  );
}
