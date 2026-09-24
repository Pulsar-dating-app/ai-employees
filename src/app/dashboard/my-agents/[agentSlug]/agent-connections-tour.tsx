"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useTour } from "@/components/tour/tour-provider";

const SEEN_KEY = "staffra:tour-seen:agent-connections";

export function AgentConnectionsTour({ agentName }: { agentName: string }) {
  const { start } = useTour();
  const t = useTranslations("MyAgents.tour");

  useEffect(() => {
    let seen: string | null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      return;
    }
    if (seen) return;

    const started = start([
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
    if (!started) return;

    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
