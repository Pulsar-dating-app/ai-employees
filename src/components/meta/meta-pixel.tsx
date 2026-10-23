"use client";

import { useEffect } from "react";
import { isTrackedHost, META_PIXEL_ID, META_REGISTRATION_COOKIE } from "@/lib/meta/pixel";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

// Meta's base code, as a function instead of an inline <script>: it queues
// calls until fbevents.js arrives, and loading it once per page is all the
// "paste it in <head>" instruction amounts to.
function loadPixel(): Fbq | null {
  if (typeof window === "undefined" || !isTrackedHost(window.location.hostname)) return null;
  if (window.fbq) return window.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("init", META_PIXEL_ID);
  return fbq;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function trackMetaEvent(name: string, eventId?: string) {
  const fbq = loadPixel();
  if (!fbq) return;
  if (eventId) fbq("track", name, {}, { eventID: eventId });
  else fbq("track", name);
}

/**
 * Fires the browser half of a registration the sign-up action recorded, once.
 * Same `eventID` as the Conversions API event, so Meta counts one sign-up.
 */
export function flushMetaRegistration() {
  if (typeof document === "undefined") return;
  const eventId = readCookie(META_REGISTRATION_COOKIE);
  if (!eventId) return;
  document.cookie = `${META_REGISTRATION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  trackMetaEvent("CompleteRegistration", eventId);
}

// `pageView` on the ad landing itself. Elsewhere (onboarding) it only flushes
// a pending registration, and loads nothing for anyone who didn't come
// through /comecar.
export function MetaPixel({ pageView = false }: { pageView?: boolean }) {
  useEffect(() => {
    if (pageView) trackMetaEvent("PageView");
    flushMetaRegistration();
  }, [pageView]);
  return null;
}
