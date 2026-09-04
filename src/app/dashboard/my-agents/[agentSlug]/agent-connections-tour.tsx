"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useTour } from "@/components/tour/tour-provider";

// One localStorage flag, shared by every hired employee's Connections page --
// the three steps below point at controls every one of these pages has
// (name, human handoff, channels), so there's nothing agent-specific to key
// the "seen it" flag on. Once a merchant has taken this tour once, on any
// hire, it doesn't reappear on the others.
//
// D6 (2026-09-04): the three separate steps that used to point at
// Instagram/embed/share-links individually collapsed into one step pointing
// at the whole channels tab bar (`data-tour="channels"`) -- those three are
// now tab panels inside one card, and a hidden (non-active) tab panel can't
// be scrolled-to or spotlighted. TourStep has no "activate this tab first"
// hook, and adding one for a single onboarding step wasn't worth extending
// that API.
const SEEN_KEY = "staffra:tour-seen:agent-connections";

export function AgentConnectionsTour({ agentName }: { agentName: string }) {
  const { start } = useTour();
  const t = useTranslations("MyAgents.tour");

  useEffect(() => {
    let seen: string | null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // Storage unavailable (private browsing, disabled cookies) -- skip the
      // tour rather than risk showing it every load with no way to remember.
      return;
    }
    if (seen) return;

    start([
      {
        target: '[data-tour="agent-name"]',
        title: t("nameTitle"),
        description: t("nameDescription", { name: agentName }),
      },
      {
        target: '[data-tour="human-handoff"]',
        title: t("humanHandoffTitle"),
        description: t("humanHandoffDescription", { name: agentName }),
      },
      {
        target: '[data-tour="channels"]',
        title: t("channelsTitle"),
        description: t("channelsDescription", { name: agentName }),
      },
    ]);

    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do -- worst case it shows again next time.
    }
    // Runs once on mount only -- re-running on every `agentName`/`t` change
    // (e.g. after the merchant renames the employee mid-tour) would restart
    // the tour under their cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
