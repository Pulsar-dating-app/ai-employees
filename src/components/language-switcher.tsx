"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALE_META, SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";
import { CheckIcon } from "@/components/ui/icons";

const MENU_WIDTH = 208;
const MENU_HEIGHT = 196;
const GREETING_MS = 1600;

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, alignLeft: false });
  const [greeting, setGreeting] = useState<Locale | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[SUPPORTED_LOCALES.indexOf(currentLocale)]?.focus();

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, currentLocale]);

  useEffect(() => {
    if (!greeting || isPending) return;
    const timer = setTimeout(() => setGreeting(null), GREETING_MS);
    return () => clearTimeout(timer);
  }, [greeting, isPending]);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPlacement({
        up: window.innerHeight - rect.bottom < MENU_HEIGHT && rect.top > MENU_HEIGHT,
        alignLeft: rect.right < MENU_WIDTH + 8,
      });
    }
    setOpen((v) => !v);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function select(next: Locale) {
    close();
    if (next === currentLocale || isPending) return;
    setGreeting(next);
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => !!el);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const move: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
    } else if (e.key in move) {
      e.preventDefault();
      items[(index + move[e.key] + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("trigger", { language: LOCALE_META[currentLocale].endonym })}
        className={clsx(
          "group inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-container pl-2 pr-2.5 text-[12px] font-semibold text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface",
          open && "bg-surface-container-high text-on-surface",
        )}
      >
        <GlobeIcon
          className={clsx(
            "h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[20deg]",
            (open || isPending) && "rotate-[20deg]",
            isPending && "lang-globe-spin",
          )}
        />
        <span
          key={greeting ?? currentLocale}
          className={clsx("lang-label-in whitespace-nowrap", greeting ? "text-primary" : "uppercase tracking-wide")}
        >
          {greeting ? `${LOCALE_META[greeting].greeting}!` : currentLocale}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("label")}
          onKeyDown={onMenuKeyDown}
          style={{ width: MENU_WIDTH }}
          className={clsx(
            "lang-menu-in absolute z-50 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-1.5 shadow-[0_12px_32px_-8px_rgba(25,28,29,0.18)]",
            placement.up ? "bottom-full mb-2" : "top-full mt-2",
            placement.alignLeft ? "left-0" : "right-0",
            placement.up
              ? placement.alignLeft ? "origin-bottom-left" : "origin-bottom-right"
              : placement.alignLeft ? "origin-top-left" : "origin-top-right",
          )}
        >
          {SUPPORTED_LOCALES.map((locale, i) => {
            const active = locale === currentLocale;
            return (
              <button
                key={locale}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={LOCALE_META[locale].intlTag}
                onClick={() => select(locale)}
                style={{ animationDelay: `${40 + i * 45}ms` }}
                className={clsx(
                  "lang-item-in group/item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/30",
                  active ? "bg-primary-fixed/60" : "hover:bg-surface-container focus-visible:bg-surface-container",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={clsx(
                      "text-[15px] font-bold leading-tight tracking-tight transition-transform duration-200 ease-out group-hover/item:translate-x-0.5 group-focus-visible/item:translate-x-0.5",
                      active ? "text-primary" : "text-on-surface",
                    )}
                  >
                    {LOCALE_META[locale].greeting}!
                  </span>
                  <span className="text-[12px] font-medium text-on-surface-variant">{LOCALE_META[locale].endonym}</span>
                </span>
                {active ? (
                  <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-outline-variant transition-colors group-hover/item:text-on-surface-variant">
                    {locale}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
