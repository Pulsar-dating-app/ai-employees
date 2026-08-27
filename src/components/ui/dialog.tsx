"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
};

// This app's first modal — introduced for Trello F3's product edit flow
// after user feedback that editing inline in a table row was cramped.
// Portaled to document.body so it isn't clipped/stacked oddly inside the
// products table's own overflow-x-auto wrapper. Closes on Escape, backdrop
// click, or the explicit close button — no focus trap (would need a
// small-object-lifecycle dependency this app doesn't otherwise have),
// but initial focus moves to the dialog panel itself on open.
export function Dialog({ open, onClose, title, closeLabel, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-xl bg-surface-container-lowest p-6 shadow-level2 outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="text-xl leading-none text-on-surface-variant hover:text-on-surface"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
