"use client";

import type { ReactNode } from "react";

const LAUNCHER_ID = "staffra-widget-launcher";

export function TalkToMaluButton({
  fallbackHref,
  label,
  className,
  children,
}: {
  fallbackHref: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={fallbackHref}
      target="_blank"
      rel="noopener"
      aria-label={label}
      className={className}
      onClick={(event) => {
        const launcher = document.getElementById(LAUNCHER_ID);
        if (!launcher) return;
        event.preventDefault();
        launcher.click();
      }}
    >
      {children}
    </a>
  );
}
