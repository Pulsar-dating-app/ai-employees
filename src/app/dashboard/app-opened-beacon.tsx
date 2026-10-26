"use client";

import { useEffect } from "react";
import { track } from "@/lib/funnel/client";

const KEY = "staffra:app-opened";

// Records `app_opened` at most once a day per browser. A cookie session
// never signs in again, so auth's last_sign_in_at can't tell a merchant who
// comes back from one who never does; this can. Storage can be unavailable
// (private mode, blocked site data) -- then it simply records every load.
export function AppOpenedBeacon() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(KEY) === today) return;
      localStorage.setItem(KEY, today);
    } catch {
      // fall through and record
    }
    track("app_opened");
  }, []);

  return null;
}
