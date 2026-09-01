"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { ChevronRightIcon } from "@/components/ui/icons";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Trello K3 — the card chrome shared by every section of the Scheduling
// Settings screen. Trello K8 turned each section into a collapsible panel:
// the screen grew past "two cards" (business hours, approval, time off,
// Google Calendar, intake questions), so it now opens as a stack of
// closed rows the merchant expands one at a time (the Stitch "Scheduling
// Settings" screen, project 17743086378683250734).
//
// Collapsed: a compact clickable row — tinted round icon tile, title +
// subtitle, a chevron. Expanded: the same header with a divider under it,
// then the section body. Each section owns its own open/closed state
// (independent, not an accordion); a section is auto-opened when the page
// is linked to it directly (e.g. the Appointments rail → `#google-calendar`).
export function SettingsSection({
  icon: Icon,
  iconTone = "primary",
  title,
  subtitle,
  children,
  id,
  defaultOpen = false,
}: {
  icon: IconComponent;
  iconTone?: "primary" | "secondary";
  title: string;
  subtitle: string;
  children: React.ReactNode;
  // When set, the section is an anchor target (e.g. the Appointments rail
  // links to #google-calendar) — `scroll-mt` keeps it clear of the sticky
  // top bar after the jump, and a matching hash opens it.
  id?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  // Open on a direct link. Done in an effect (not the initial state) so the
  // server and first client render agree — the hash isn't visible on the
  // server. Also covers a hash change while the page is already mounted.
  useEffect(() => {
    if (!id) return;
    const openIfHashMatches = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    openIfHashMatches();
    window.addEventListener("hashchange", openIfHashMatches);
    return () => window.removeEventListener("hashchange", openIfHashMatches);
  }, [id]);

  return (
    <section
      id={id}
      className={clsx(
        "rounded-xl border border-outline-variant/40 transition-colors",
        open ? "bg-surface-container-lowest shadow-level1" : "bg-surface-container",
        id && "scroll-mt-24",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex w-full items-center gap-3 p-6 text-left transition-colors",
          open ? "border-b border-outline-variant/40" : "rounded-xl hover:bg-surface-container-high",
        )}
      >
        <span
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            iconTone === "primary"
              ? "bg-primary/10 text-primary"
              : "bg-secondary-container/30 text-secondary",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
          <p className="mt-0.5 text-label-md text-on-surface-variant">{subtitle}</p>
        </div>
        <ChevronRightIcon
          className={clsx(
            "h-5 w-5 shrink-0 text-on-surface-variant transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div id={bodyId} className="p-6 pt-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
