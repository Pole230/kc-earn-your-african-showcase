import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircleMore } from "lucide-react";

import { KcEarnAiPanel } from "./KcEarnAiPanel";
import aiLogo from "@/assets/kc-earn-ai.png";
import { useAuth } from "@/hooks/useAuth";

export function KcEarnAiLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { session } = useAuth();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    const key = `kc-earn-ai-welcome:${session.access_token}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setOpen(true);
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open KC Earn AI assistant"
        className="gradient-brand fixed bottom-24 right-4 z-[60] grid size-14 place-items-center rounded-2xl text-brand-foreground shadow-lift transition-transform active:scale-95 sm:bottom-8 sm:right-8"
      >
        <img src={aiLogo} alt="" width={512} height={512} className="size-8" />
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-surface-strong text-brand">
          <MessageCircleMore className="size-3" />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-6">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="KC Earn AI"
            className="relative flex h-full w-full flex-col overflow-hidden bg-background sm:h-[min(85vh,780px)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-border sm:shadow-lift"
          >
            <KcEarnAiPanel onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
