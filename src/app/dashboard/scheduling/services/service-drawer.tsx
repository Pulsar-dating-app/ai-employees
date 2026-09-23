"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@/components/ui/icons";

function subscribeNoop() {
  return () => {};
}

export function ServiceDrawer({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href]",
        ) ?? [],
      );
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("input, textarea, select");
      (first ?? focusables()[0])?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        onClick={onClose}
        className="inbox-scrim-in absolute inset-0 bg-on-surface/20"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="inbox-drawer-in chat-scroll relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface-container-lowest shadow-[-20px_0_60px_-20px_rgba(25,28,29,0.3)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant/50 bg-surface-container-lowest/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
