"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// The elegant floating auth surface: a blurred scrim over the landing page
// and a centered card that fades + rises in. Used both by the intercepting
// modal routes (soft nav from the landing) and by the /login and /sign-up
// full pages (direct visits render the landing behind, then this on top).
export const AUTH_CARD_CLASSES =
  "w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-7 shadow-[0_28px_70px_-16px_rgba(25,28,29,0.40)] sm:p-8";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AuthOverlay({
  children,
  closeTo = "/",
}: {
  children: React.ReactNode;
  /** "back" for the intercepting modal (return to the landing without a
   * new history entry); a path for the full-page fallback. */
  closeTo?: "back" | string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("Auth");

  const close = useCallback(() => {
    if (closeTo === "back") router.back();
    else router.replace(closeTo, { scroll: false });
  }, [closeTo, router]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

  // Client-only: the portal target doesn't exist during SSR. (createPortal
  // renders nothing server-side anyway, so behaviour is unchanged.)
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[max(4rem,9vh)]">
      <button
        type="button"
        aria-label={t("close")}
        onClick={close}
        className="auth-backdrop-in fixed inset-0 cursor-default bg-on-surface/45 backdrop-blur-[3px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        tabIndex={-1}
        className={`auth-panel-in relative z-10 outline-none ${AUTH_CARD_CLASSES}`}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
