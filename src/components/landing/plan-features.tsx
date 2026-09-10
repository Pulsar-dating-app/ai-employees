"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { M } from "./landing-icons";

const VISIBLE = 7;

const ExpandedContext = createContext<{ expanded: boolean; toggle: () => void } | null>(null);

// Wraps the whole pricing grid so a "See more" click on any one plan card
// expands every card at once (owner's call) -- the toggle lives here, each
// PlanFeatures just reads it. Falls back to its own local state if rendered
// without the provider.
export function PlanFeaturesProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <ExpandedContext.Provider value={{ expanded, toggle: () => setExpanded((v) => !v) }}>
      {children}
    </ExpandedContext.Provider>
  );
}

export function PlanFeatures({
  features,
  featured,
  moreLabel,
  lessLabel,
}: {
  features: string[];
  featured: boolean;
  moreLabel: string;
  lessLabel: string;
}) {
  const ctx = useContext(ExpandedContext);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = ctx ? ctx.expanded : localExpanded;
  const toggle = ctx ? ctx.toggle : () => setLocalExpanded((v) => !v);

  const collapsible = features.length > VISIBLE;
  const shown = expanded || !collapsible ? features : features.slice(0, VISIBLE);

  return (
    <>
      <ul className="flex flex-col gap-2.5 text-left text-[14px] text-[#464555]">
        {shown.map((f, fi) => (
          <li
            key={f}
            className={`flex items-center gap-2 ${featured && fi === 0 ? "font-semibold text-[#0f172a]" : ""}`}
          >
            <M
              name="check_circle"
              size={18}
              className={featured && fi === 0 ? "text-[#3525cd]" : "text-[#10b981]"}
            />
            {f}
          </li>
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#3525cd] transition-colors hover:text-[#4f46e5]"
        >
          {expanded ? lessLabel : moreLabel}
          <M name="expand_more" size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}
