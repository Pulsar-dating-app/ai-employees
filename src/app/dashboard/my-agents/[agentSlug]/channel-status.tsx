"use client";

import { createContext, useContext, useEffect } from "react";

export type ChannelKey = "whatsapp" | "instagram" | "telegram" | "embed" | "link";

export type ChannelTone = "ok" | "warn" | "off" | "locked";

export type ChannelStatus = { tone: ChannelTone; label: string };

export const ChannelStatusContext = createContext<(key: ChannelKey, status: ChannelStatus) => void>(() => {});

export function useReportChannelStatus(key: ChannelKey, status: ChannelStatus | null) {
  const report = useContext(ChannelStatusContext);
  const tone = status?.tone ?? null;
  const label = status?.label ?? null;
  useEffect(() => {
    if (tone === null || label === null) return;
    report(key, { tone, label });
  }, [report, key, tone, label]);
}
